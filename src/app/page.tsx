'use client';

import { useEffect, useMemo, useState } from 'react';
import { MODULES, NAV_ITEMS, type AuditModuleId } from '@/lib/modules';

type AnomalyDetail = {
  type: string;
  severity: 'critique' | 'majeur' | 'mineur';
  message: string;
  field?: string;
  suggestion: string;
};

type Audit = { status: string; risk: string; score: number; reasons: string[]; anomalies?: AnomalyDetail[] };
type Row = Record<string, unknown> & { _audit?: Audit };
type RecordsPayload = { module: string; table: string; columns: string[]; rows: Row[]; pagination?: { page: number; limit: number; total: number; totalPages: number; offset: number }; error?: string; warning?: string };
type DashboardPayload = { schemas: string[]; schema: string; tables: number; columns: number; totalRows: number; moduleStats: { id: string; title: string; table: string; total: number }[]; error?: string; connectionFailed?: boolean; message?: string };

type Anomaly = {
  id: number;
  anomalyId: string;
  module: string;
  moduleName: string | null;
  sourceSchema: string | null;
  sourceTable: string | null;
  anomalyType: string;
  title: string;
  description: string;
  severity: 'critique' | 'majeur' | 'mineur';
  amount: number | null;
  referenceNumber: string | null;
  status: 'ouverte' | 'en_cours' | 'justifiee' | 'cloturee' | 'rejetee';
  justificationStatus: 'sans_justificatif' | 'demandee' | 'recue' | 'validee' | 'rejetee';
  suggestion: string | null;
  detectedAt: string;
  assignedTo: number | null;
  assignedUserName?: string | null;
  dueDate: string | null;
};

const connectedModules = MODULES.filter((m) => m.table);

function formatAmount(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function badge(label: string, type: string) {
  const cls = 
    type === 'critique' || type === 'Anomalie' || type === 'ouverte' || type === 'sans_justificatif' || type === 'demandee' || type === 'rejetee' ? 'danger' : 
    type === 'moyen' || type === 'À vérifier' || type === 'À surveiller' || type === 'en cours' || type === 'en_cours' || type === 'mineur' ? 'warning' : 
    type === 'faible' || type === 'Conforme' || type === 'clôturée' || type === 'cloturee' || type === 'justifiée' || type === 'justifiee' || type === 'validee' ? 'success' : 
    'info';
  return <span className={`badge badge-${cls}`}>{label}</span>;
}

function bestAmount(row: Row) {
  const keys = Object.keys(row).filter((k) => !k.startsWith('_'));
  let best = 0;
  for (const key of keys) {
    if (/amount|debit|credit|balance|solde|payment/i.test(key)) {
      const n = Math.abs(Number(row[key]));
      if (Number.isFinite(n) && n > best) best = n;
    }
  }
  return best;
}

function bestReference(row: Row) {
  const keys = Object.keys(row).filter((k) => /number|reference|document|invoice|payment|id/i.test(k));
  for (const key of keys) if (row[key]) return String(row[key]);
  return '-';
}

export default function HomePage() {
  const [active, setActive] = useState<AuditModuleId>('dashboard');
  const [periodEnabled, setPeriodEnabled] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<RecordsPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState<Row | null>(null);
  const [anomalyModal, setAnomalyModal] = useState<Anomaly | null>(null);
  
  // Anomalies from database
  const [dbAnomalies, setDbAnomalies] = useState<Anomaly[]>([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [anomaliesError, setAnomaliesError] = useState('');
  const [anomalyFilter, setAnomalyFilter] = useState({ status: '', severity: '' });
  const [anomalyPagination, setAnomalyPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [anomalyStats, setAnomalyStats] = useState<{ total: number; bySeverity: Record<string, number>; byStatus: Record<string, number> } | null>(null);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);

  const activeModule = connectedModules.find((m) => m.id === active);

  const periodParams = useMemo(() => {
    const p = new URLSearchParams();
    if (periodEnabled && startDate) p.set('startDate', startDate);
    if (periodEnabled && endDate) p.set('endDate', endDate);
    return p;
  }, [periodEnabled, startDate, endDate]);

  async function loadDashboard() {
    const p = new URLSearchParams(periodParams);
    const res = await fetch(`/api/dashboard?${p.toString()}`);
    const data = await res.json();
    setDashboard(data);
  }

  async function loadAnomalies(page = 1) {
    setAnomaliesLoading(true);
    setAnomaliesError('');
    try {
      const params = new URLSearchParams();
      if (anomalyFilter.status) params.set('status', anomalyFilter.status);
      if (anomalyFilter.severity) params.set('severity', anomalyFilter.severity);
      if (periodEnabled && startDate) params.set('startDate', startDate);
      if (periodEnabled && endDate) params.set('endDate', endDate);
      params.set('limit', anomalyPagination.limit.toString());
      params.set('offset', ((page - 1) * anomalyPagination.limit).toString());
      
      // Fetch anomalies list and stats in parallel
      const statsParams = new URLSearchParams();
      if (anomalyFilter.status) statsParams.set('status', anomalyFilter.status);
      if (anomalyFilter.severity) statsParams.set('severity', anomalyFilter.severity);
      if (periodEnabled && startDate) statsParams.set('startDate', startDate);
      if (periodEnabled && endDate) statsParams.set('endDate', endDate);

      const [res, statsRes] = await Promise.all([
        fetch(`/api/anomalies?${params.toString()}`),
        fetch(`/api/anomalies/stats?${statsParams.toString()}`)
      ]);

      const data = await res.json();
      const statsData = await statsRes.json();
      
      if (data.success) {
        setDbAnomalies(data.data);
        setAnomalyPagination(prev => ({
          ...prev,
          page,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages
        }));
      } else {
        setAnomaliesError(data.error || 'Erreur lors du chargement');
      }

      if (statsData.success) {
        setAnomalyStats(statsData.data);
      }
    } catch (e) {
      setAnomaliesError('Erreur réseau');
    } finally {
      setAnomaliesLoading(false);
    }
  }

  async function loadRecords(moduleId = active) {
    const m = connectedModules.find((x) => x.id === moduleId);
    if (!m) return;
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams(periodParams);
      p.set('module', moduleId);
      p.set('limit', pageSize.toString());
      p.set('page', currentPage.toString());
      if (search) p.set('q', search);
      if (statusFilter !== 'all') p.set('statusFilter', statusFilter);
      if (riskFilter !== 'all') p.set('riskFilter', riskFilter);
      // Add column filters
      Object.entries(colFilters).forEach(([col, val]) => {
        if (val) p.set(`filter_${col}`, val);
      });
      const res = await fetch(`/api/records?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur chargement');
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setRecords(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch((e) => setError(e.message));
  }, [periodParams]);

  useEffect(() => {
    if (activeModule) loadRecords(active);
  }, [active, periodParams, currentPage, pageSize, colFilters, statusFilter, riskFilter]);

  useEffect(() => {
    if (active === 'anomalies') {
      loadAnomalies(1);
    }
  }, [active, anomalyFilter, periodEnabled, startDate, endDate, anomalyPagination.limit]);

  const filteredRows = useMemo(() => {
    // Les filtres statut/risque sont désormais appliqués côté serveur
    return records?.rows || [];
  }, [records]);

  const dashboardStats = useMemo(() => {
    const rows = records?.rows || [];
    const conformes = rows.filter((r) => r._audit?.status === 'Conforme').length;
    const nonConformes = rows.length - conformes;
    const critiques = rows.filter((r) => r._audit?.risk === 'critique').length;
    const score = rows.length ? Math.max(0, Math.round((conformes / rows.length) * 100)) : 100;
    return { conformes, nonConformes, critiques, score };
  }, [records]);

  function showModule(id: AuditModuleId) {
    setActive(id);
    setSearch('');
    setStatusFilter('all');
    setRiskFilter('all');
    setCurrentPage(1);
    setColFilters({});
  }

  function renderDashboard() {
    return (
      <>
        <div className="page-header">
          <div>
            <h3>Tableau de bord</h3>
            <p>Vue globale connectée à PostgreSQL, schéma analytics. Les statistiques respectent la période d’analyse lorsque le filtre global est activé.</p>
          </div>
          <button className="btn btn-primary" onClick={() => loadDashboard()}>Actualiser</button>
        </div>
        <div className="grid grid-4">
          <div className="card kpi-card"><h4>Tables analytics</h4><div className="value">{dashboard?.tables ?? '-'}</div><div className="note">Schéma PostgreSQL</div></div>
          <div className="card kpi-card"><h4>Champs disponibles</h4><div className="value">{dashboard?.columns ?? '-'}</div><div className="note">Information schema</div></div>
          <div className="card kpi-card"><h4>Lignes période</h4><div className="value">{dashboard?.totalRows?.toLocaleString('fr-FR') ?? '-'}</div><div className="note">Modules raccordés</div></div>
          <div className="card kpi-card"><h4>Score module courant</h4><div className="value">{dashboardStats.score}</div><div className="note">Sur 100</div></div>
        </div>
        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card kpi-card"><h4>Conformes</h4><div className="value">{dashboardStats.conformes}</div><div className="note">Rubrique courante</div></div>
          <div className="card kpi-card"><h4>À traiter</h4><div className="value">{dashboardStats.nonConformes}</div><div className="note">Surveiller / vérifier / anomalie</div></div>
          <div className="card kpi-card"><h4>Risques critiques</h4><div className="value">{dashboardStats.critiques}</div><div className="note">Selon règles V1</div></div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h4 style={{ color: 'var(--primary)', marginBottom: 12 }}>Statistiques par rubrique</h4>
          <div className="table-wrap"><table><thead><tr><th>Rubrique</th><th>Table</th><th>Lignes</th></tr></thead><tbody>{dashboard?.moduleStats?.map((m) => <tr key={m.id}><td>{m.title}</td><td>{m.table}</td><td>{m.total.toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div>
        </div>
      </>
    );
  }

  function renderPeriod() {
    return (
      <>
        <div className="page-header"><div><h3>Période d’analyse</h3><p>Paramètre global pour limiter l’affichage des données et les statistiques du dashboard.</p></div></div>
        <div className="card">
          <div className="period-box">
            <label className="status-line"><input type="checkbox" checked={periodEnabled} onChange={(e) => setPeriodEnabled(e.target.checked)} /> Activer le filtre de période</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button className="btn btn-primary" onClick={() => { loadDashboard(); if (activeModule) loadRecords(active); }}>Appliquer</button>
            <button className="btn btn-secondary" onClick={() => { setPeriodEnabled(false); setStartDate(''); setEndDate(''); }}>Toutes les périodes</button>
          </div>
        </div>
      </>
    );
  }

  function renderRecords() {
    if (!activeModule) return <div className="card empty-state">Cette rubrique sera branchée dans une prochaine étape.</div>;
    const pagination = records?.pagination;
    const totalRows = pagination?.total ?? records?.rows?.length ?? 0;
    const currentRows = pagination ? records?.rows : filteredRows;

    return (
      <>
        <div className="page-header"><div><h3>{activeModule.title}</h3><p>{activeModule.description}</p></div><button className="btn btn-primary" onClick={() => loadRecords(active)}>Actualiser</button></div>

        {/* Filters */}
        <div className="toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche..." />
          <button className="btn btn-primary" onClick={() => { setCurrentPage(1); loadRecords(active); }}>Filtrer</button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Tous les statuts</option><option>Conforme</option><option>À surveiller</option><option>À vérifier</option><option>Anomalie</option></select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}><option value="all">Tous les risques</option><option value="faible">Faible</option><option value="moyen">Moyen</option><option value="critique">Critique</option></select>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
            <option value={10}>10 lignes</option>
            <option value={25}>25 lignes</option>
            <option value={50}>50 lignes</option>
            <option value={100}>100 lignes</option>
            <option value={200}>200 lignes</option>
          </select>
          <span className="schema-pill">{currentRows?.length || 0} / {totalRows.toLocaleString('fr-FR')} lignes</span>
          <span className="schema-pill">Table : {records?.table || activeModule.table}</span>
        </div>

        {/* Pagination Info */}
        {pagination && (
          <div className="toolbar" style={{ background: 'var(--bg)', padding: '8px 16px', borderRadius: 8, marginBottom: 12 }}>
            <span>Page <b>{pagination.page}</b> sur <b>{pagination.totalPages}</b></span>
            <span>Offset: {pagination.offset}</span>
            <span>Total: {pagination.total.toLocaleString('fr-FR')} lignes</span>
          </div>
        )}

        {loading && <div className="card empty-state">Chargement...</div>}

        {!loading && (
          <>
            <div className="table-wrap"><table><thead><tr>{records?.columns?.map((c) => <th key={c}>{c}</th>)}<th>Statut analyse</th><th>Action</th></tr></thead><tbody>{currentRows?.map((r, idx) => <tr key={idx}>{records?.columns?.map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}<td style={{ minWidth: 250 }}>
              {r._audit ? (
                <>
                  <div style={{ marginBottom: 8 }}>{badge(r._audit.status, r._audit.status)} <span className="small" style={{ marginLeft: 8 }}>Score: {r._audit.score}/100</span></div>
                  {r._audit.anomalies && r._audit.anomalies.length > 0 ? (
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                      {r._audit.anomalies.slice(0, 2).map((a, i) => (
                        <div key={i} style={{ 
                          padding: '4px 8px', 
                          marginBottom: 4, 
                          borderRadius: 4, 
                          background: a.severity === 'critique' ? '#fee2e2' : a.severity === 'majeur' ? '#fef3c7' : '#e0f2fe',
                          borderLeft: `3px solid ${a.severity === 'critique' ? '#dc2626' : a.severity === 'majeur' ? '#d97706' : '#0284c7'}`
                        }}>
                          <b style={{ color: a.severity === 'critique' ? '#991b1b' : a.severity === 'majeur' ? '#92400e' : '#0369a1' }}>
                            {a.severity.toUpperCase()}:
                          </b> {a.message}
                          <div style={{ color: '#6b7280', marginTop: 2, fontSize: 11 }}>💡 {a.suggestion}</div>
                        </div>
                      ))}
                      {r._audit.anomalies.length > 2 && (
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
                          + {r._audit.anomalies.length - 2} autre(s) anomalie(s)...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="small" style={{ color: '#15803d' }}>✓ Document conforme</div>
                  )}
                </>
              ) : null}
            </td><td><button className="btn btn-secondary btn-mini" onClick={() => setModalRow(r)}>Détail</button></td></tr>)}</tbody></table></div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="toolbar" style={{ justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>« Premier</button>
                <button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>‹ Précédent</button>
                <span className="schema-pill">Page {currentPage} / {pagination.totalPages}</span>
                <button className="btn btn-secondary" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}>Suivant ›</button>
                <button className="btn btn-secondary" disabled={currentPage >= pagination.totalPages} onClick={() => setCurrentPage(pagination.totalPages)}>Dernier »</button>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  function renderAnomalies() {
    return (
      <>
        <div className="page-header">
          <div>
            <h3>Centre des anomalies</h3>
            <p>Gestion des anomalies détectées dans la base de données.</p>
          </div>
        </div>
        
        {/* Stats cards */}
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="card">
            <b style={{ fontSize: 24, color: 'var(--primary)' }}>{anomalyPagination.total}</b>
            <p className="small">Total anomalies</p>
          </div>
          <div className="card">
            <b style={{ fontSize: 24, color: '#dc2626' }}>{anomalyStats?.bySeverity?.critique ?? '-'}</b>
            <p className="small">Critiques</p>
          </div>
          <div className="card">
            <b style={{ fontSize: 24, color: '#d97706' }}>{anomalyStats?.bySeverity?.majeur ?? '-'}</b>
            <p className="small">Majeures</p>
          </div>
          <div className="card">
            <b style={{ fontSize: 24, color: '#15803d' }}>{anomalyStats?.byStatus?.ouverte ?? '-'}</b>
            <p className="small">À traiter</p>
          </div>
        </div>
        
        {/* Filters */}
        <div className="toolbar" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <select 
            value={anomalyFilter.status} 
            onChange={(e) => setAnomalyFilter(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
          >
            <option value="">Tous les statuts</option>
            <option value="ouverte">🔴 Ouverte</option>
            <option value="en_cours">🟡 En cours</option>
            <option value="justifiee">🟢 Justifiée</option>
            <option value="cloturee">✅ Clôturée</option>
          </select>
          
          <select 
            value={anomalyFilter.severity} 
            onChange={(e) => setAnomalyFilter(f => ({ ...f, severity: e.target.value }))}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
          >
            <option value="">Toutes les sévérités</option>
            <option value="critique">🔴 Critique</option>
            <option value="majeur">🟡 Majeur</option>
            <option value="mineur">🔵 Mineur</option>
          </select>
          
          <select
            value={anomalyPagination.limit}
            onChange={(e) => setAnomalyPagination(p => ({ ...p, limit: parseInt(e.target.value) }))}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
          >
            <option value="10">10 par page</option>
            <option value="25">25 par page</option>
            <option value="50">50 par page</option>
            <option value="100">100 par page</option>
          </select>
          
          <button 
            className="btn btn-primary" 
            onClick={() => loadAnomalies(1)}
            disabled={anomaliesLoading}
          >
            {anomaliesLoading ? 'Chargement...' : '↻ Actualiser'}
          </button>
        </div>
        
        {anomaliesError && <div className="error" style={{ marginBottom: 16 }}>{anomaliesError}</div>}
        
        {anomaliesLoading ? (
          <div className="card empty-state">Chargement des anomalies...</div>
        ) : dbAnomalies.length === 0 ? (
          <div className="card empty-state">Aucune anomalie trouvée dans la base de données.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>ID</th>
                    <th style={{ width: 100 }}>Sévérité</th>
                    <th style={{ width: 150 }}>Module</th>
                    <th>Description</th>
                    <th style={{ width: 120 }}>Montant</th>
                    <th style={{ width: 100 }}>Statut</th>
                    <th style={{ width: 120 }}>Assigné à</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dbAnomalies.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.anomalyId}</b></td>
                      <td>{badge((a.severity || 'mineur').toUpperCase(), a.severity || 'mineur')}</td>
                      <td>{a.moduleName || a.module}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>
                          {a.title}
                        </div>
                        <div className="small" style={{ 
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {a.description}
                        </div>
                        {a.suggestion && (
                          <div className="small" style={{ color: '#6b7280', marginTop: 4 }}>
                            💡 {a.suggestion.substring(0, 60)}...
                          </div>
                        )}
                      </td>
                      <td>{a.amount ? formatAmount(a.amount) : '-'}</td>
                      <td>{badge((a.status || 'inconnu').replace('_', ' '), a.status || 'inconnu')}</td>
                      <td>{a.assignedUserName || <span style={{ color: '#9ca3af' }}>Non assigné</span>}</td>
                      <td>
                        <div className="action-stack" style={{ gap: 4 }}>
                          <button 
                            className="btn btn-primary btn-mini" 
                            onClick={() => setSelectedAnomaly(a)}
                          >
                            📄 Détail
                          </button>
                          <button 
                            className="btn btn-secondary btn-mini" 
                            onClick={() => setAnomalyModal(a)}
                          >
                            ✏️ Traiter
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {anomalyPagination.totalPages > 1 && (
              <div className="toolbar" style={{ justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button 
                  className="btn btn-secondary" 
                  disabled={anomalyPagination.page <= 1}
                  onClick={() => loadAnomalies(1)}
                >
                  « Premier
                </button>
                <button 
                  className="btn btn-secondary" 
                  disabled={anomalyPagination.page <= 1}
                  onClick={() => loadAnomalies(anomalyPagination.page - 1)}
                >
                  ‹ Précédent
                </button>
                <span className="schema-pill">
                  Page {anomalyPagination.page} / {anomalyPagination.totalPages}
                </span>
                <button 
                  className="btn btn-secondary" 
                  disabled={anomalyPagination.page >= anomalyPagination.totalPages}
                  onClick={() => loadAnomalies(anomalyPagination.page + 1)}
                >
                  Suivant ›
                </button>
                <button 
                  className="btn btn-secondary" 
                  disabled={anomalyPagination.page >= anomalyPagination.totalPages}
                  onClick={() => loadAnomalies(anomalyPagination.totalPages)}
                >
                  Dernier »
                </button>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  function content() {
    if (active === 'dashboard') return renderDashboard();
    if (active === 'period') return renderPeriod();
    if (active === 'anomalies') return renderAnomalies();
    if (active === 'settings') return <Settings />;
    if (active === 'reports') return <SimplePage title="Rapports" text="Rapports imprimables et exports PDF à connecter aux données filtrées." />;
    if (active === 'aiAgent') return <SimplePage title="Agent IA Audit" text="Dans cette version Next.js, l’agent utilise les anomalies calculées côté application. Une prochaine étape pourra connecter un vrai modèle IA." />;
    if (active === 'reconciliation') return <SimplePage title="Rapprochements" text="Module à raccorder aux tables banque/caisse, lettrage et pièces justificatives." />;
    if (active === 'exports') return <SimplePage title="Export / Sauvegarde" text="Les exports CSV/JSON peuvent être générés depuis les lignes affichées." />;
    return renderRecords();
  }

  return (
    <div className="app">
      <aside className="sidebar"><div className="brand"><h1>FinanceAudit IA V1</h1><p>Audit Comptabilité & Finance<br />Miroir PostgreSQL analytics</p></div><nav className="nav">{NAV_ITEMS.map(([id, label]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => showModule(id)}>{label}</button>)}</nav></aside>
      <main className="main"><header className="topbar"><div><h2>{NAV_ITEMS.find(([id]) => id === active)?.[1]}</h2><span>Entreprise : Multiprint / Groupe — connexion PostgreSQL distante via .env</span></div><div className="status-line"><span>Xavier</span><span className="badge badge-info">Administrateur</span></div></header><section className="content">{error && <div className="error">{error}</div>}{content()}</section></main>
      {modalRow && <RecordModal row={modalRow} onClose={() => setModalRow(null)} />}
      {anomalyModal && <AnomalyModal anomaly={anomalyModal} onClose={() => setAnomalyModal(null)} />}
      {selectedAnomaly && <AnomalyDetailModal anomaly={selectedAnomaly} onClose={() => setSelectedAnomaly(null)} />}
    </div>
  );
}

function SimplePage({ title, text }: { title: string; text: string }) {
  return <><div className="page-header"><div><h3>{title}</h3><p>{text}</p></div></div><div className="card empty-state">Cette rubrique garde sa place dans l’architecture et pourra être enrichie étape par étape.</div></>;
}

function Settings() {
  return <><div className="page-header"><div><h3>Paramétrage</h3><p>Paramètres fonctionnels et seuils d’analyse. Les paramètres serveur sont dans .env.local.</p></div></div><div className="grid grid-3"><div className="card"><b>DATABASE_URL</b><p className="small">Connexion PostgreSQL distante.</p></div><div className="card"><b>DB_SCHEMA</b><p className="small">analytics</p></div><div className="card"><b>PGSSL</b><p className="small">true si la base impose SSL.</p></div></div></>;
}

function RecordModal({ row, onClose }: { row: Row; onClose: () => void }) {
  return <div className="modal-backdrop"><div className="modal-card"><div className="modal-header"><div><h3>Détail enregistrement</h3><p className="small">Statut d'audit : {row._audit?.status} / score {row._audit?.score}/100</p></div><button className="btn btn-secondary btn-mini" onClick={onClose}>Fermer</button></div>
    
    {/* Section Anomalies */}
    <div className="card" style={{ marginBottom: 16 }}>
      <h4 style={{ color: 'var(--primary)', marginBottom: 12 }}>🔍 Analyse de conformité</h4>
      {row._audit ? (
        <>
          <div style={{ marginBottom: 12 }}>
            {badge(row._audit.status, row._audit.status)}
            <span style={{ marginLeft: 12, fontWeight: 600, color: row._audit.risk === 'critique' ? '#dc2626' : row._audit.risk === 'moyen' ? '#d97706' : '#15803d' }}>
              Risque: {row._audit.risk}
            </span>
            <span className="small" style={{ marginLeft: 12 }}>Score: {row._audit.score}/100</span>
          </div>
          
          {row._audit.anomalies && row._audit.anomalies.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {row._audit.anomalies.map((a, i) => (
                <div key={i} style={{
                  padding: '12px',
                  borderRadius: 8,
                  background: a.severity === 'critique' ? '#fee2e2' : a.severity === 'majeur' ? '#fef3c7' : '#e0f2fe',
                  borderLeft: `4px solid ${a.severity === 'critique' ? '#dc2626' : a.severity === 'majeur' ? '#d97706' : '#0284c7'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ 
                      padding: '2px 8px', 
                      borderRadius: 4, 
                      fontSize: 11, 
                      fontWeight: 600,
                      background: a.severity === 'critique' ? '#fecaca' : a.severity === 'majeur' ? '#fde68a' : '#bae6fd',
                      color: a.severity === 'critique' ? '#991b1b' : a.severity === 'majeur' ? '#92400e' : '#0369a1'
                    }}>
                      {a.severity.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{a.type}</span>
                    {a.field && <span style={{ fontSize: 11, color: '#9ca3af' }}>Champ: {a.field}</span>}
                  </div>
                  <p style={{ margin: '4px 0', fontWeight: 500 }}>{a.message}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>💡 <b>Action suggérée:</b> {a.suggestion}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8, color: '#15803d' }}>
              ✓ Aucune anomalie détectée - Ce document est conforme aux règles de contrôle.
            </div>
          )}
        </>
      ) : (
        <p className="small">Pas d'analyse disponible</p>
      )}
    </div>
    
    {/* Données brutes */}
    <h4 style={{ color: 'var(--primary)', marginBottom: 12 }}>📋 Données de l'enregistrement</h4>
    <div className="grid grid-3">{Object.entries(row).filter(([k]) => !k.startsWith('_')).map(([k, v]) => <div className="card" key={k}><b>{k}</b><p className="small">{String(v ?? '')}</p></div>)}</div>
  </div></div>;
}

function AnomalyModal({ anomaly, onClose }: { anomaly: Anomaly; onClose: () => void }) {
  return <div className="modal-backdrop"><div className="modal-card" style={{ maxWidth: 800 }}>
    <div className="modal-header">
      <div>
        <h3>Traitement de l'anomalie {anomaly.anomalyId}</h3>
        <p className="small">Détectée le {new Date(anomaly.detectedAt).toLocaleDateString('fr-FR')}</p>
      </div>
      <button className="btn btn-secondary btn-mini" onClick={onClose}>Fermer</button>
    </div>
    
    <div className="grid grid-2">
      <div className="card">
        <h4 style={{ color: 'var(--primary)', marginBottom: 12 }}>📋 Informations</h4>
        <b>ID :</b> {anomaly.anomalyId}<br />
        <b>Module :</b> {anomaly.moduleName || anomaly.module}<br />
        <b>Table source :</b> {anomaly.sourceTable || '-'}<br />
        <b>Type :</b> {anomaly.anomalyType}<br />
        <b>Sévérité :</b> {badge((anomaly.severity || 'mineur').toUpperCase(), anomaly.severity || 'mineur')}<br />
        <b>Montant :</b> {anomaly.amount ? formatAmount(anomaly.amount) : '-'}<br />
        <b>Référence :</b> {anomaly.referenceNumber || '-'}<br />
        <b>Assigné à :</b> {anomaly.assignedUserName || 'Non assigné'}
      </div>
      
      <div className="card">
        <h4 style={{ color: 'var(--primary)', marginBottom: 12 }}>📝 Description</h4>
        <p><b>{anomaly.title}</b></p>
        <p>{anomaly.description}</p>
        {anomaly.suggestion && (
          <p style={{ color: '#6b7280', marginTop: 8 }}>💡 <b>Suggestion :</b> {anomaly.suggestion}</p>
        )}
        <br />
        <b>Justification :</b> {badge((anomaly.justificationStatus || 'sans_justificatif').replace('_', ' '), anomaly.justificationStatus || 'sans_justificatif')}
      </div>
    </div>
    
    <div className="grid grid-2" style={{ marginTop: 16 }}>
      <div className="card">
        <label>Statut de traitement</label>
        <select defaultValue={anomaly.status} style={{ width: '100%', marginTop: 8 }}>
          <option value="ouverte">Ouverte</option>
          <option value="en_cours">En cours</option>
          <option value="justifiee">Justifiée</option>
          <option value="cloturee">Clôturée</option>
        </select>
      </div>
      <div className="card">
        <label>État de la justification</label>
        <select defaultValue={anomaly.justificationStatus} style={{ width: '100%', marginTop: 8 }}>
          <option value="sans_justificatif">Sans justificatif</option>
          <option value="demandee">Demandée</option>
          <option value="recue">Reçue</option>
          <option value="validee">Validée</option>
          <option value="rejetee">Rejetée</option>
        </select>
      </div>
    </div>
    
    <div className="card" style={{ marginTop: 16 }}>
      <label>Demande de justification envoyée au responsable</label>
      <textarea 
        defaultValue={`Merci de fournir les pièces justificatives et l'explication de cette anomalie : ${anomaly.anomalyType} / référence ${anomaly.referenceNumber || 'N/A'}`}
        style={{ width: '100%', marginTop: 8, minHeight: 80 }}
      />
    </div>
    
    <div className="grid grid-2" style={{ marginTop: 16 }}>
      <div className="card">
        <label>Fichier justificatif</label>
        <input type="file" style={{ width: '100%', marginTop: 8 }} />
      </div>
      <div className="card">
        <label>Fourni par</label><input defaultValue="Xavier" style={{ width: '100%', marginTop: 8 }} /></div></div><div className="card" style={{ marginTop: 16 }}><label>Commentaire auditeur / justification reçue</label><textarea placeholder="Saisir ici la justification reçue, l’analyse de l’auditeur ou la décision." /></div><div className="toolbar" style={{ marginTop: 16 }}><button className="btn btn-warning">Demander justificatif</button><button className="btn btn-primary">Joindre justificatif</button><button className="btn btn-secondary">Voir / télécharger</button><button className="btn btn-green">Valider justificatif</button><button className="btn btn-danger">Rejeter justificatif</button><button className="btn btn-primary">Enregistrer</button><button className="btn btn-green">Clôturer</button></div></div></div>;
}

// Modale de détail lecture seule pour plus d'ergonomie
function AnomalyDetailModal({ anomaly, onClose }: { anomaly: Anomaly; onClose: () => void }) {
  const severityColors = {
    critique: { bg: '#fee2e2', border: '#dc2626', text: '#991b1b' },
    majeur: { bg: '#fef3c7', border: '#d97706', text: '#92400e' },
    mineur: { bg: '#e0f2fe', border: '#0284c7', text: '#0369a1' }
  };
  const severityKey = ((anomaly.severity || 'mineur').toString().toLowerCase().trim() as 'critique' | 'majeur' | 'mineur');
  const colors = severityColors[severityKey] || severityColors.mineur;
  
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ 
          background: colors.bg, 
          borderLeft: `4px solid ${colors.border}`,
          borderRadius: '8px 8px 0 0',
          padding: '16px 20px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <span style={{ 
                padding: '4px 12px', 
                borderRadius: 4, 
                background: colors.border, 
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                {anomaly.severity || 'mineur'}
              </span>
              <h3 style={{ margin: 0, color: colors.text }}>{anomaly.anomalyId}</h3>
            </div>
            <p className="small" style={{ margin: 0, color: '#6b7280' }}>
              Détectée le {new Date(anomaly.detectedAt).toLocaleDateString('fr-FR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <button className="btn btn-secondary btn-mini" onClick={onClose}>✕ Fermer</button>
        </div>
        
        {/* Content */}
        <div style={{ padding: 20 }}>
          {/* Titre principal */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ 
              fontSize: 20, 
              fontWeight: 600, 
              color: 'var(--primary)', 
              marginBottom: 8 
            }}>
              {anomaly.title}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#374151' }}>
              {anomaly.description}
            </p>
          </div>
          
          {/* Info cards */}
          <div className="grid grid-3" style={{ gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 4 }}>Module</div>
              <div style={{ fontWeight: 600 }}>{anomaly.moduleName || anomaly.module}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 4 }}>Type</div>
              <div style={{ fontWeight: 600 }}>{anomaly.anomalyType}</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 4 }}>Table source</div>
              <div style={{ fontWeight: 600 }}>{anomaly.sourceTable || '-'}</div>
            </div>
          </div>
          
          {/* Montant et référence */}
          <div className="grid grid-2" style={{ gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ 
              padding: 16, 
              background: anomaly.amount ? '#f0fdf4' : '#f9fafb',
              borderLeft: `3px solid ${anomaly.amount ? '#15803d' : '#d1d5db'}`
            }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 4 }}>Montant concerné</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: anomaly.amount ? '#15803d' : '#9ca3af' }}>
                {anomaly.amount ? formatAmount(anomaly.amount) : 'Non applicable'}
              </div>
            </div>
            <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--primary)' }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 4 }}>Référence</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {anomaly.referenceNumber || <span style={{ color: '#9ca3af' }}>Non renseignée</span>}
              </div>
            </div>
          </div>
          
          {/* Suggestion */}
          {anomaly.suggestion && (
            <div className="card" style={{ 
              padding: 16, 
              background: '#eff6ff', 
              borderLeft: '3px solid #3b82f6',
              marginBottom: 20 
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 20 }}>💡</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>Action suggérée</div>
                  <div style={{ color: '#374151' }}>{anomaly.suggestion}</div>
                </div>
              </div>
            </div>
          )}
          
          {/* Statuts */}
          <div className="grid grid-2" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 8 }}>Statut de traitement</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ 
                  width: 12, 
                  height: 12, 
                  borderRadius: '50%', 
                  background: anomaly.status === 'ouverte' ? '#dc2626' : 
                              anomaly.status === 'en_cours' ? '#d97706' : 
                              anomaly.status === 'justifiee' ? '#16a34a' : '#15803d'
                }}></span>
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                  {(anomaly.status || 'inconnu').replace('_', ' ')}
                </span>
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ color: '#6b7280', marginBottom: 8 }}>Justification</div>
              <div style={{ fontWeight: 600 }}>
                {(anomaly.justificationStatus || 'sans_justificatif').replace('_', ' ')}
              </div>
            </div>
          </div>
          
          {/* Assignation */}
          {anomaly.assignedUserName && (
            <div className="card" style={{ 
              marginTop: 12, 
              padding: 12, 
              background: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>👤</span>
              <span>Assigné à : <b>{anomaly.assignedUserName}</b></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
