'use client';

import { useEffect, useMemo, useState } from 'react';
import { MODULES, NAV_ITEMS, type AuditModuleId } from '@/lib/modules';

type Audit = { status: string; risk: string; score: number; reasons: string[] };
type Row = Record<string, unknown> & { _audit?: Audit };
type RecordsPayload = { module: string; table: string; columns: string[]; rows: Row[]; pagination?: { page: number; limit: number; total: number; totalPages: number; offset: number }; error?: string; warning?: string };
type DashboardPayload = { schemas: string[]; schema: string; tables: number; columns: number; totalRows: number; moduleStats: { id: string; title: string; table: string; total: number }[]; error?: string; connectionFailed?: boolean; message?: string };

type Anomaly = {
  id: string;
  module: string;
  table: string;
  type: string;
  description: string;
  amount: number;
  reference: string;
  risk: string;
  status: 'ouverte' | 'en cours' | 'justifiée' | 'clôturée';
  justificationStatus: string;
  recommendation: string;
  history: { date: string; user: string; action: string; detail: string }[];
};

const connectedModules = MODULES.filter((m) => m.table);

function formatAmount(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function badge(label: string, type: string) {
  const cls = type === 'critique' || type === 'Anomalie' || type === 'ouverte' ? 'danger' : type === 'moyen' || type === 'À vérifier' || type === 'À surveiller' || type === 'en cours' ? 'warning' : type === 'faible' || type === 'Conforme' || type === 'clôturée' ? 'success' : 'info';
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
  }, [active, periodParams, currentPage, pageSize, colFilters]);

  const filteredRows = useMemo(() => {
    const rows = records?.rows || [];
    return rows.filter((r) => {
      const a = r._audit;
      if (statusFilter !== 'all' && a?.status !== statusFilter) return false;
      if (riskFilter !== 'all' && a?.risk !== riskFilter) return false;
      return true;
    });
  }, [records, statusFilter, riskFilter]);

  const anomalies = useMemo<Anomaly[]>(() => {
    const rows = records?.rows || [];
    const moduleTitle = activeModule?.title || 'Module';
    const table = records?.table || '';
    return rows
      .filter((r) => r._audit && r._audit.status !== 'Conforme')
      .map((r, i) => ({
        id: `ANOM-${String(i + 1).padStart(5, '0')}`,
        module: moduleTitle,
        table,
        type: r._audit?.status || 'À vérifier',
        description: r._audit?.reasons?.[0] || 'Point à contrôler',
        amount: bestAmount(r),
        reference: bestReference(r),
        risk: r._audit?.risk || 'faible',
        status: 'ouverte',
        justificationStatus: 'sans justificatif',
        recommendation: 'Contrôler la pièce, la validation hiérarchique et la cohérence de l’opération.',
        history: []
      }));
  }, [records, activeModule]);

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
            <div className="table-wrap"><table><thead><tr>{records?.columns?.map((c) => <th key={c}>{c}</th>)}<th>Statut analyse</th><th>Action</th></tr></thead><tbody>{currentRows?.map((r, idx) => <tr key={idx}>{records?.columns?.map((c) => <td key={c}>{String(r[c] ?? '')}</td>)}<td>{r._audit ? badge(r._audit.status, r._audit.status) : null}<div className="small">Score {r._audit?.score ?? 0} / {r._audit?.risk}</div></td><td><button className="btn btn-secondary btn-mini" onClick={() => setModalRow(r)}>Détail</button></td></tr>)}</tbody></table></div>

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
        <div className="page-header"><div><h3>Centre des anomalies</h3><p>Présentation avec demande de justificatif, traitement et historique.</p></div></div>
        <div className="toolbar"><span className="schema-pill">{anomalies.length} anomalies issues de la rubrique courante</span></div>
        <div className="table-wrap"><table><thead><tr><th>Risque</th><th>Module</th><th>Description</th><th>Montant</th><th>Référence</th><th>Justificatif</th><th>Recommandation</th><th>Statut / Actions</th></tr></thead><tbody>{anomalies.map((a) => <tr key={a.id}><td>{badge(a.risk[0].toUpperCase() + a.risk.slice(1), a.risk)}</td><td>{a.module}</td><td><b>{a.type}</b><div className="small">{a.description}</div></td><td>{formatAmount(a.amount)}</td><td>{a.reference}</td><td>{badge(a.justificationStatus, 'neutral')}</td><td>{a.recommendation}</td><td><div className="action-stack">{badge(a.status, a.status)}<button className="btn btn-primary btn-mini" onClick={() => setAnomalyModal(a)}>Traiter</button><button className="btn btn-secondary btn-mini" onClick={() => setAnomalyModal({ ...a, status: 'en cours', justificationStatus: 'demandée' })}>Demander justificatif</button><button className="btn btn-warning btn-mini" onClick={() => setAnomalyModal(a)}>Joindre / voir</button></div></td></tr>)}</tbody></table></div>
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
  return <div className="modal-backdrop"><div className="modal-card"><div className="modal-header"><div><h3>Détail enregistrement</h3><p className="small">Statut calculé : {row._audit?.status} / score {row._audit?.score}</p></div><button className="btn btn-secondary btn-mini" onClick={onClose}>Fermer</button></div><div className="card"><h4>Analyse automatique</h4>{row._audit && badge(row._audit.status, row._audit.status)}<p className="small" style={{ marginTop: 10 }}>{row._audit?.reasons?.join(' | ')}</p></div><div className="grid grid-3" style={{ marginTop: 16 }}>{Object.entries(row).filter(([k]) => !k.startsWith('_')).map(([k, v]) => <div className="card" key={k}><b>{k}</b><p className="small">{String(v ?? '')}</p></div>)}</div></div></div>;
}

function AnomalyModal({ anomaly, onClose }: { anomaly: Anomaly; onClose: () => void }) {
  return <div className="modal-backdrop"><div className="modal-card"><div className="modal-header"><div><h3>Traitement de l’anomalie</h3><p className="small">Demande de justification, décision de traitement et traçabilité.</p></div><button className="btn btn-secondary btn-mini" onClick={onClose}>Fermer</button></div><div className="grid grid-2"><div className="card"><b>ID :</b> {anomaly.id}<br /><b>Module :</b> {anomaly.module}<br /><b>Table :</b> {anomaly.table}<br /><b>Type :</b> {anomaly.type}<br /><b>Risque :</b> {badge(anomaly.risk, anomaly.risk)}<br /><b>Montant :</b> {formatAmount(anomaly.amount)}<br /><b>Référence :</b> {anomaly.reference}</div><div className="card"><b>Description :</b><p>{anomaly.description}</p><br /><b>Recommandation :</b><p>{anomaly.recommendation}</p><br /><b>Justification :</b> {badge(anomaly.justificationStatus, 'neutral')}</div></div><div className="grid grid-2" style={{ marginTop: 16 }}><div className="card"><label>Statut de traitement</label><select defaultValue={anomaly.status} style={{ width: '100%', marginTop: 8 }}><option>ouverte</option><option>en cours</option><option>justifiée</option><option>clôturée</option></select></div><div className="card"><label>État de la justification</label><select defaultValue={anomaly.justificationStatus} style={{ width: '100%', marginTop: 8 }}><option>sans justificatif</option><option>demandée</option><option>reçue</option><option>validée</option><option>rejetée</option></select></div></div><div className="card" style={{ marginTop: 16 }}><label>Demande de justification envoyée au responsable</label><textarea defaultValue={`Merci de fournir les pièces justificatives et l’explication de cette anomalie : ${anomaly.type} / référence ${anomaly.reference}`} /></div><div className="grid grid-2" style={{ marginTop: 16 }}><div className="card"><label>Fichier justificatif</label><input type="file" style={{ width: '100%', marginTop: 8 }} /></div><div className="card"><label>Fourni par</label><input defaultValue="Xavier" style={{ width: '100%', marginTop: 8 }} /></div></div><div className="card" style={{ marginTop: 16 }}><label>Commentaire auditeur / justification reçue</label><textarea placeholder="Saisir ici la justification reçue, l’analyse de l’auditeur ou la décision." /></div><div className="toolbar" style={{ marginTop: 16 }}><button className="btn btn-warning">Demander justificatif</button><button className="btn btn-primary">Joindre justificatif</button><button className="btn btn-secondary">Voir / télécharger</button><button className="btn btn-green">Valider justificatif</button><button className="btn btn-danger">Rejeter justificatif</button><button className="btn btn-primary">Enregistrer</button><button className="btn btn-green">Clôturer</button></div></div></div>;
}
