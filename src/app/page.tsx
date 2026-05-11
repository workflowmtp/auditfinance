'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_PERMISSIONS, USER_ROLES, canAccessModule, hasPermission, type AuthUser, type Permission, type UserRole } from '@/lib/auth';
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

type AppUser = {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string | null;
  isActive: boolean;
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

function columnLabel(column: string) {
  const labels: Record<string, string> = {
    accounting_date: 'Date comptable',
    entry_date: 'Date écriture',
    validation_date: 'Date validation',
    due_date: 'Date échéance',
    invoice_date: 'Date facture',
    payment_date: 'Date paiement',
    movement_date: 'Date mouvement',
    order_date: 'Date commande',
    receipt_date: 'Date réception',
    journal_code: 'Journal',
    entry_number: 'N° écriture',
    entry_line_id: 'ID ligne',
    account_code: 'Compte',
    account_label: 'Libellé compte',
    third_party_name: 'Tiers',
    supplier_name: 'Fournisseur',
    customer_name: 'Client',
    debit_amount: 'Débit',
    credit_amount: 'Crédit',
    amount: 'Montant',
    amount_ht: 'Montant HT',
    amount_ttc: 'Montant TTC',
    tax_amount: 'TVA',
    payment_amount: 'Montant payé',
    currency: 'Devise',
    invoice_number: 'N° facture',
    supplier_invoice_ref: 'Réf. fournisseur',
    payment_number: 'N° paiement',
    reference: 'Référence',
    company_code: 'Société',
    site_code: 'Site',
    bank_account_code: 'Compte bancaire',
    bank_name: 'Banque',
    supplier_code: 'Code fournisseur',
    supplier_short_name: 'Nom court',
    supplier_category: 'Catégorie',
    status: 'Statut',
    cash_account_code: 'Code caisse',
    cash_label: 'Caisse',
    current_balance: 'Solde actuel',
    opening_balance: 'Solde initial',
    responsible_user_name: 'Responsable',
    is_active: 'Actif',
    document_number: 'N° document',
    suspense_category: 'Catégorie attente',
    balance_amount: 'Solde',
    age_days: 'Âge',
    regularization_status: 'Régularisation',
    advance_date: 'Date avance',
    advance_type: 'Type avance',
    outstanding_amount: 'Reste dû',
    regularized_amount: 'Régularisé',
    regularized_percent: '% régularisé',
    declaration_period: 'Période',
    tax_type: 'Type taxe',
    tax_subtype: 'Sous-type taxe',
    tax_account_code: 'Compte taxe',
    tax_account_label: 'Libellé taxe',
    nb_lines: 'Nb lignes',
    nb_entries: 'Nb écritures',
    calculated_base_sage: 'Base calculée',
    calculated_tax_sage: 'Taxe calculée',
    declared_base: 'Base déclarée',
    declared_tax: 'Taxe déclarée',
    difference_amount: 'Écart',
    declaration_status: 'Statut déclaration',
    beneficiary_name: 'Bénéficiaire',
    direction_label: 'Sens',
    operation_type: 'Type opération',
    rib_identifier: 'Identifiant RIB',
    iban: 'IBAN',
    bic: 'BIC',
    is_default_rib: 'RIB par défaut',
    pr_number: 'N° demande',
    pr_date: 'Date demande',
    need_date: 'Date besoin',
    requester_name: 'Demandeur',
    facility_code: 'Site',
    item_designation: 'Article',
    quantity_requested: 'Quantité',
    unit_price: 'Prix unitaire',
    line_amount: 'Montant ligne',
    po_number: 'N° commande',
    buyer_name: 'Acheteur',
    total_amount: 'Montant total',
    order_status: 'Statut commande',
    expected_delivery_date: 'Livraison prévue',
    receipt_number: 'N° réception',
    delivery_note_date: 'Date BL',
    supplier_delivery_note: 'BL fournisseur',
    quantity_received_stu: 'Qté reçue',
    quantity_accepted_stu: 'Qté acceptée',
    conformity_percentage: 'Conformité',
    quality_status: 'Statut qualité',
    taxable_base: 'Base taxable',
    tax_rate_calculated: 'Taux calculé',
    third_party_code: 'Code tiers',
    chart_of_accounts: 'Plan comptable',
    account_class: 'Classe',
    account_type: 'Type compte',
    account_sub_type: 'Sous-type compte',
    is_sensitive: 'Sensible',
    is_suspense_account: 'Compte attente',
    code: 'Code',
    name: 'Nom',
    shortname: 'Nom court',
    user_code: 'Code utilisateur',
    user_name: 'Utilisateur',
    email: 'Email',
    department_code: 'Département',
    profile_function: 'Fonction',
    approval_level: 'Niveau validation',
    connection_status: 'Connexion',
    linked_document_date: 'Date document',
    document_type: 'Type document',
    source_module: 'Module source',
    file_name: 'Fichier',
    linked_document_number: 'N° document lié',
    linked_invoice_number: 'N° facture liée',
    linked_payment_number: 'N° paiement lié',
    linked_amount: 'Montant lié',
    linked_third_party_name: 'Tiers lié',
    action_date: 'Date action',
    table_name: 'Table',
    record_id: 'ID enregistrement',
    record_label: 'Libellé',
    action_type: 'Action',
    field_name: 'Champ',
    old_value: 'Ancienne valeur',
    new_value: 'Nouvelle valeur',
    action_by_name: 'Auteur',
    risk_flag: 'Risque'
  };
  return labels[column] || column.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getVisibleColumns(moduleId: string, columns: string[] = []) {
  const priorityByModule: Record<string, string[]> = {
    entries: ['accounting_date', 'journal_code', 'entry_number', 'account_code', 'third_party_name', 'debit_amount', 'credit_amount'],
    supplierInvoices: ['invoice_date', 'invoice_number', 'supplier_name', 'amount_ht', 'tax_amount', 'amount_ttc', 'status'],
    suppliers: ['supplier_code', 'supplier_name', 'supplier_category', 'status', 'site_code', 'country_code'],
    supplierBankAccounts: ['supplier_code', 'supplier_name', 'bank_name', 'rib_identifier', 'iban', 'is_default_rib'],
    orders: ['order_date', 'po_number', 'supplier_name', 'buyer_name', 'total_amount', 'order_status'],
    receipts: ['receipt_date', 'receipt_number', 'po_number', 'supplier_name', 'quantity_received_stu', 'quality_status'],
    customerInvoices: ['invoice_date', 'invoice_number', 'customer_name', 'amount_ht', 'tax_amount', 'amount_ttc', 'status'],
    payments: ['payment_date', 'payment_number', 'supplier_name', 'payment_amount', 'currency', 'status'],
    bankCash: ['movement_date', 'bank_account_code', 'bank_name', 'direction_label', 'operation_type', 'amount'],
    cashAccounts: ['cash_account_code', 'cash_label', 'current_balance', 'opening_balance', 'responsible_user_name', 'is_active'],
    advances: ['advance_date', 'advance_id', 'beneficiary_name', 'advance_type', 'amount', 'outstanding_amount', 'regularized_percent'],
    suspenseAccounts: ['account_code', 'account_label', 'document_number', 'balance_amount', 'age_days', 'regularization_status'],
    taxDeclarations: ['declaration_period', 'tax_type', 'tax_account_code', 'calculated_tax_sage', 'declared_tax', 'difference_amount', 'declaration_status'],
    taxEntries: ['accounting_date', 'tax_entry_id', 'tax_type', 'account_code', 'taxable_base', 'tax_amount', 'tax_rate_calculated'],
    bankAccounts: ['bank_account_code', 'bank_name', 'currency', 'current_balance', 'is_active', 'responsible_user_name'],
    purchaseRequests: ['pr_date', 'pr_number', 'requester_name', 'item_designation', 'quantity_requested', 'line_amount', 'status'],
    chartOfAccounts: ['account_code', 'account_label', 'account_class', 'account_type', 'is_sensitive', 'is_suspense_account'],
    categories: ['code', 'name', 'status'],
    users: ['user_code', 'user_name', 'email', 'department_code', 'profile_function', 'connection_status'],
    justifications: ['linked_document_date', 'document_type', 'file_name', 'linked_amount', 'linked_third_party_name', 'status'],
    auditTrail: ['action_date', 'table_name', 'record_label', 'action_type', 'field_name', 'action_by_name', 'risk_flag']
  };
  const priority = priorityByModule[moduleId] || columns.slice(0, 6);
  const selected = priority.filter((column) => columns.includes(column));
  if (selected.length >= 4) return selected;
  return [...selected, ...columns.filter((column) => !selected.includes(column)).slice(0, 6 - selected.length)];
}

function formatCellValue(column: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (/amount|debit|credit|balance|tax|price|solde|base/i.test(column)) return formatAmount(value);
  if (/date|detected_at|created_at|updated_at/i.test(column) && typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('fr-FR');
  }
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

export default function HomePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
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
  const allowedNavItems = useMemo(() => NAV_ITEMS.filter(([id]) => canAccessModule(authUser, id)), [authUser]);

  useEffect(() => {
    const storedUser = window.localStorage.getItem('financeaudit_user');
    if (!storedUser) {
      router.replace('/login');
      return;
    }
    try {
      setAuthUser(JSON.parse(storedUser) as AuthUser);
    } catch {
      window.localStorage.removeItem('financeaudit_user');
      router.replace('/login');
      return;
    } finally {
      setAuthReady(true);
    }
  }, [router]);

  useEffect(() => {
    if (!authUser) return;
    if (!canAccessModule(authUser, active)) {
      const firstAllowed = allowedNavItems[0]?.[0] || 'dashboard';
      setActive(firstAllowed);
    }
  }, [active, allowedNavItems, authUser]);

  function logout() {
    window.localStorage.removeItem('financeaudit_user');
    router.replace('/login');
  }

  const periodParams = useMemo(() => {
    const p = new URLSearchParams();
    if (periodEnabled && startDate) p.set('startDate', startDate);
    if (periodEnabled && endDate) p.set('endDate', endDate);
    return p;
  }, [periodEnabled, startDate, endDate]);

  async function loadDashboard() {
    console.log('[loadDashboard] Loading dashboard data');
    const p = new URLSearchParams(periodParams);
    const res = await fetch(`/api/dashboard?${p.toString()}`);
    const data = await res.json();
    console.log('[loadDashboard] Dashboard data:', data);
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
    if (active === 'period' && periodEnabled) {
      loadDashboard().catch((e) => setError(e.message));
      if (activeModule) loadRecords(active);
    }
  }, [active, periodEnabled, startDate, endDate]);

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
    if (!canAccessModule(authUser, id)) return;
    setActive(id);
    setSearch('');
    setStatusFilter('all');
    setRiskFilter('all');
    setCurrentPage(1);
    setColFilters({});
  }

  function renderDashboard() {
    const totalRows = dashboard?.moduleStats?.reduce((sum, m) => sum + m.total, 0) || 0;
    return (
      <>
        <div className="page-header">
          <div>
            <h3>Tableau de bord</h3>
            <p>Vue globale connectée à PostgreSQL, schéma analytics. Les statistiques respectent la période d’analyse lorsque le filtre global est activé.</p>
          </div>
        </div>
        <div className="grid grid-3">
          <div className="card">
            <div className="card-title">Tables actives</div>
            <b>{dashboard?.tables || 0}</b>
            <p className="small">Tables avec données dans le schéma {dashboard?.schema || 'analytics'}.</p>
          </div>
          <div className="card">
            <div className="card-title">Colonnes totales</div>
            <b>{dashboard?.columns?.toLocaleString('fr-FR') || 0}</b>
            <p className="small">Colonnes cumulées sur toutes les tables.</p>
          </div>
          <div className="card">
            <div className="card-title">Lignes totales</div>
            <b>{totalRows.toLocaleString('fr-FR')}</b>
            <p className="small">Lignes cumulées sur tous les modules.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Statistiques par module</div>
          <div className="table-wrap"><table><thead><tr><th>Rubrique</th><th>Table</th><th>Lignes</th></tr></thead><tbody>{dashboard?.moduleStats?.map((m) => <tr key={m.id}><td>{m.title}</td><td>{m.table}</td><td>{m.total.toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div>
        </div>
      </>
    );
  }

  function renderPeriod() {
    return (
      <>
        <div className="page-header"><div><h3>Période d’analyse</h3><p>Filtrer les données par date de début et de fin pour l’analyse ciblée.</p></div></div>
        <div className="card">
          <div className="period-box">
            <label className="status-line"><input type="checkbox" checked={periodEnabled} onChange={(e) => setPeriodEnabled(e.target.checked)} /> Activer le filtre de période</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button className="btn btn-primary" onClick={() => { if (activeModule) loadRecords(active); }}>Appliquer</button>
            <button className="btn btn-secondary" onClick={() => { setPeriodEnabled(false); setStartDate(''); setEndDate(''); if (activeModule) loadRecords(active); }}>Toutes les périodes</button>
          </div>
        </div>
        {activeModule ? renderRecords() : <div className="card empty-state">Sélectionnez une rubrique pour afficher les données filtrées par période.</div>}
      </>
    );
  }

  function renderRecords() {
    if (!activeModule) return <div className="card empty-state">Cette rubrique sera branchée dans une prochaine étape.</div>;
    const pagination = records?.pagination;
    const totalRows = pagination?.total ?? records?.rows?.length ?? 0;
    const currentRows = pagination ? records?.rows : filteredRows;
    const visibleColumns = getVisibleColumns(active, records?.columns || []);
    const hiddenColumnsCount = Math.max((records?.columns?.length || 0) - visibleColumns.length, 0);

    return (
      <>
        <div className="page-header"><div><h3>{activeModule.title}</h3><p>{activeModule.description}</p></div><button className="btn btn-primary" onClick={() => loadRecords(active)}>Actualiser</button></div>

        {/* Filters */}
        <div className="toolbar">
          <label className="status-line" style={{ gap: 8 }}>
            <input type="checkbox" checked={periodEnabled} onChange={(e) => setPeriodEnabled(e.target.checked)} />
            <span>Filtrer par période</span>
          </label>
          {periodEnabled && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            </>
          )}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche..." />
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
          {hiddenColumnsCount > 0 && <span className="schema-pill">{hiddenColumnsCount} champs dans le détail</span>}
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
            <div className="table-wrap table-wrap-compact"><table><thead><tr>{visibleColumns.map((c) => <th key={c}>{columnLabel(c)}</th>)}<th>Action</th></tr></thead><tbody>{currentRows?.map((r, idx) => <tr key={idx}>{visibleColumns.map((c) => <td key={c}>{formatCellValue(c, r[c])}</td>)}<td><button className="btn btn-secondary btn-mini" onClick={() => setModalRow(r)}>Détail</button></td></tr>)}</tbody></table></div>

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
          <label className="status-line" style={{ gap: 8 }}>
            <input type="checkbox" checked={periodEnabled} onChange={(e) => setPeriodEnabled(e.target.checked)} />
            <span>Filtrer par période</span>
          </label>
          {periodEnabled && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            </>
          )}
          
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
    if (!authReady) return <div className="card empty-state">Vérification de la session...</div>;
    if (!authUser) return null;
    if (active === 'dashboard') return renderDashboard();
    if (active === 'users') return hasPermission(authUser, 'users:view') ? <UsersAdmin /> : <Forbidden />;
    if (active === 'period') return renderPeriod();
    if (active === 'anomalies') return renderAnomalies();
    if (active === 'settings') return hasPermission(authUser, 'settings:view') ? <Settings /> : <Forbidden />;
    if (active === 'reports') return <SimplePage title="Rapports" text="Rapports imprimables et exports PDF à connecter aux données filtrées." />;
    if (active === 'aiAgent') return <SimplePage title="Agent IA Audit" text="Dans cette version Next.js, l’agent utilise les anomalies calculées côté application. Une prochaine étape pourra connecter un vrai modèle IA." />;
    if (active === 'reconciliation') return <SimplePage title="Rapprochements" text="Module à raccorder aux tables banque/caisse, lettrage et pièces justificatives." />;
    if (active === 'exports') return <SimplePage title="Export / Sauvegarde" text="Les exports CSV/JSON peuvent être générés depuis les lignes affichées." />;
    return renderRecords();
  }

  return (
    <div className="app">
      <aside className="sidebar"><div className="brand"><h1>FinanceAudit IA V1</h1><p>Audit Comptabilité & Finance<br />Miroir PostgreSQL analytics</p></div><nav className="nav">{allowedNavItems.map(([id, label]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => showModule(id)}>{label}</button>)}</nav></aside>
      <main className="main"><header className="topbar"><div><h2>{NAV_ITEMS.find(([id]) => id === active)?.[1]}</h2><span>Entreprise : Multiprint / Groupe — connexion PostgreSQL distante via .env</span></div><div className="status-line"><span>{authUser?.fullName || 'Utilisateur'}</span><span className="badge badge-info">{authUser?.role || '-'}</span><button className="btn btn-secondary btn-mini" onClick={logout}>Déconnexion</button></div></header><section className="content">{error && <div className="error">{error}</div>}{content()}</section></main>
      {modalRow && <RecordModal row={modalRow} onClose={() => setModalRow(null)} />}
      {anomalyModal && <AnomalyModal anomaly={anomalyModal} onClose={() => setAnomalyModal(null)} />}
      {selectedAnomaly && <AnomalyDetailModal anomaly={selectedAnomaly} onClose={() => setSelectedAnomaly(null)} />}
    </div>
  );
}

function SimplePage({ title, text }: { title: string; text: string }) {
  return <><div className="page-header"><div><h3>{title}</h3><p>{text}</p></div></div><div className="card empty-state">Cette rubrique garde sa place dans l’architecture et pourra être enrichie étape par étape.</div></>;
}

function Forbidden() {
  return <div className="card empty-state"><h3>Accès refusé</h3><p className="small">Votre rôle ne donne pas accès à cette rubrique.</p></div>;
}

function Settings() {
  return <><div className="page-header"><div><h3>Paramétrage</h3><p>Paramètres fonctionnels et seuils d’analyse. Les paramètres serveur sont dans .env.local.</p></div></div><div className="grid grid-3"><div className="card"><b>DATABASE_URL</b><p className="small">Connexion PostgreSQL distante.</p></div><div className="card"><b>DB_SCHEMA</b><p className="small">analytics</p></div><div className="card"><b>PGSSL</b><p className="small">true si la base impose SSL.</p></div></div></>;
}

function UsersAdmin() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rolePerms, setRolePerms] = useState<Record<UserRole, Permission[]>>(ROLE_PERMISSIONS);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [savingRole, setSavingRole] = useState<UserRole | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Erreur utilisateurs');
      setUsers(data.data || []);
    } catch {
      setError('Impossible de charger les utilisateurs');
    } finally {
      setLoading(false);
    }
  }

  async function loadRolePermissions() {
    try {
      const res = await fetch('/api/roles/permissions');
      const data = await res.json();
      if (data.success) {
        setRolePerms(data.data);
        setAllPermissions(data.allPermissions || []);
      }
    } catch {
      // fallback to static
    }
  }

  async function togglePermission(role: UserRole, permission: Permission) {
    const current = rolePerms[role] || [];
    const next = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission];
    setRolePerms((prev) => ({ ...prev, [role]: next }));
    setSavingRole(role);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/roles/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permissions: next })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erreur');
      setMessage(`Permissions du rôle "${role}" mises à jour`);
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setError('Impossible de mettre à jour les permissions');
      setRolePerms((prev) => ({ ...prev, [role]: current }));
    } finally {
      setSavingRole(null);
    }
  }

  useEffect(() => {
    loadUsers();
    loadRolePermissions();
  }, []);

  async function changeRole(userId: number, role: UserRole) {
    setMessage('');
    setError('');
    setSavingId(userId);
    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Modification impossible');
      setUsers((current) => current.map((user) => user.id === userId ? { ...user, role } : user));
      setSelectedUser((current) => current && current.id === userId ? { ...current, role } : current);
      setMessage(`Rôle mis à jour : ${role}`);
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setError('Impossible de modifier le rôle utilisateur');
    } finally {
      setSavingId(null);
    }
  }

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const roleCounts = USER_ROLES.reduce((acc, role) => {
    acc[role] = users.filter((u) => u.role === role).length;
    return acc;
  }, {} as Record<UserRole, number>);

  const roleColors: Record<UserRole, string> = {
    Administrateur: '#dc2626',
    Auditeur: '#ea580c',
    Comptable: '#0ea5e9',
    Lecteur: '#6b7280'
  };

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h3>Utilisateurs, rôles et permissions</h3>
          <p>Gérez les rôles des utilisateurs et visualisez les permissions appliquées à chaque profil.</p>
        </div>
      </div>
      {message && <div className="success-box">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="grid grid-3">
        <div className="card">
          <div className="card-title">Total utilisateurs</div>
          <b>{users.length}</b>
          <p className="small">Utilisateurs actifs en base.</p>
        </div>
        <div className="card">
          <div className="card-title">Administrateurs</div>
          <b style={{ color: roleColors.Administrateur }}>{roleCounts.Administrateur || 0}</b>
          <p className="small">Accès complet à la plateforme.</p>
        </div>
        <div className="card">
          <div className="card-title">Auditeurs</div>
          <b style={{ color: roleColors.Auditeur }}>{roleCounts.Auditeur || 0}</b>
          <p className="small">Gestion et revue des anomalies.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Liste des utilisateurs</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Rechercher un utilisateur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
            style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}
          >
            <option value="all">Tous les rôles</option>
            {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner"></div><p>Chargement des utilisateurs...</p></div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">Aucun utilisateur trouvé</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Département</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: roleColors[user.role],
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 600, fontSize: 13
                        }}>{getInitials(user.fullName)}</div>
                        <div>
                          <b>{user.fullName}</b>
                          <br />
                          <span className="small">@{user.username}</span>
                        </div>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.department || '-'}</td>
                    <td>
                      <select
                        value={user.role}
                        disabled={savingId === user.id}
                        onChange={(event) => changeRole(user.id, event.target.value as UserRole)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `2px solid ${roleColors[user.role]}`,
                          color: roleColors[user.role],
                          fontWeight: 600,
                          background: '#fff'
                        }}
                      >
                        {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                      {savingId === user.id && <span className="small" style={{ marginLeft: 8 }}>Enregistrement...</span>}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: user.isActive ? '#10b981' : '#6b7280',
                        color: '#fff', fontSize: 12
                      }}>{user.isActive ? 'Actif' : 'Inactif'}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-mini" onClick={() => setSelectedUser(user)}>Permissions</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Matrice des permissions par rôle</div>
        <p className="small" style={{ marginBottom: 12 }}>
          Cochez ou décochez les permissions pour ajuster les droits accordés à chaque rôle. Les changements sont enregistrés automatiquement.
        </p>
        <div className="permission-grid">
          {USER_ROLES.map((role) => {
            const perms = rolePerms[role] || [];
            const list = (allPermissions.length ? allPermissions : ROLE_PERMISSIONS[role]) as Permission[];
            return (
              <div className="permission-card" key={role} style={{ borderTop: `4px solid ${roleColors[role]}` }}>
                <h4 style={{ color: roleColors[role] }}>
                  {role}
                  {savingRole === role && <span className="small" style={{ marginLeft: 8, color: 'var(--muted)', fontWeight: 400 }}>Enregistrement...</span>}
                </h4>
                <p className="small" style={{ marginBottom: 8 }}>{perms.length} / {list.length} permission(s)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map((permission) => {
                    const checked = perms.includes(permission);
                    return (
                      <label key={permission} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={savingRole === role}
                          onChange={() => togglePermission(role, permission)}
                          style={{ accentColor: roleColors[role] }}
                        />
                        <span style={{
                          color: checked ? '#0f172a' : '#94a3b8',
                          textDecoration: checked ? 'none' : 'line-through'
                        }}>{permission}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedUser && (
        <div className="modal-backdrop" onClick={() => setSelectedUser(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div>
                <h3>Permissions de {selectedUser.fullName}</h3>
                <p className="small">Rôle : <strong style={{ color: roleColors[selectedUser.role] }}>{selectedUser.role}</strong></p>
              </div>
              <button className="btn btn-secondary btn-mini" onClick={() => setSelectedUser(null)}>Fermer</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Modifier le rôle</label>
                <select
                  value={selectedUser.role}
                  disabled={savingId === selectedUser.id}
                  onChange={(event) => changeRole(selectedUser.id, event.target.value as UserRole)}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}
                >
                  {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <p className="small" style={{ marginTop: 8, color: 'var(--muted)' }}>
                  Les permissions sont automatiquement mises à jour selon le rôle sélectionné.
                </p>
              </div>
              <div>
                <h4 style={{ marginBottom: 8 }}>Permissions accordées ({(rolePerms[selectedUser.role] || []).length})</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(rolePerms[selectedUser.role] || []).map((permission: Permission) => (
                    <span key={permission} className="permission-pill" style={{ background: roleColors[selectedUser.role], color: '#fff' }}>
                      {permission}
                    </span>
                  ))}
                </div>
                <p className="small" style={{ marginTop: 12, color: 'var(--muted)' }}>
                  Pour modifier les permissions de ce rôle, utilisez la matrice ci-dessous.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RecordModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [n8nAnomalies, setN8nAnomalies] = useState<{ title: string; causes: string; solutions: string; description: string; severity: string }[]>([]);
  const [n8nAnomaliesLoading, setN8nAnomaliesLoading] = useState(false);
  const [n8nAnomaliesError, setN8nAnomaliesError] = useState('');

  useEffect(() => {
    async function loadAnomalies() {
      console.log('[RecordModal] Loading anomalies for row:', row);
      setN8nAnomaliesLoading(true);
      setN8nAnomaliesError('');
      try {
        const res = await fetch('/api/n8n-anomalies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(row),
        });
        const data = await res.json();
        console.log('[RecordModal] Response status:', res.status);
        console.log('[RecordModal] Response data:', data);
        if (!res.ok) throw new Error(data.error || 'Erreur chargement anomalies n8n');
        console.log('[RecordModal] Setting n8nAnomalies:', data.data);
        console.log('[RecordModal] Number of anomalies:', data.data?.length || 0);
        setN8nAnomalies(data.data || []);
      } catch (e) {
        console.error('[RecordModal] Error loading anomalies:', e);
        setN8nAnomaliesError(e instanceof Error ? e.message : 'Erreur inconnue');
        setN8nAnomalies([]);
      } finally {
        setN8nAnomaliesLoading(false);
      }
    }
    loadAnomalies();
  }, [row]);

  const fields = Object.entries(row).filter(([k]) => !k.startsWith('_'));
  const summaryFields = fields.filter(([k]) => /date|number|reference|invoice|payment|account|supplier|customer|third_party|amount|debit|credit|balance|status|code|name|label|description|type|category/i.test(k)).slice(0, 20);
  const otherFields = fields.filter(([k]) => !summaryFields.some(([summaryKey]) => summaryKey === k));
  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card record-detail-modal" onClick={(e) => e.stopPropagation()}><div className="modal-header detail-modal-header"><div><h3>Détail enregistrement</h3><p className="small">Référence : {bestReference(row)} · Montant principal : {formatAmount(bestAmount(row))}</p></div><button className="btn btn-secondary btn-mini" onClick={onClose}>Fermer</button></div>
    <div className="record-detail-body">
      <div className="detail-summary">
        <div className="detail-summary-card">
          <span className="detail-label">Statut audit</span>
          <div className="detail-value">{row._audit ? badge(row._audit.status, row._audit.status) : '-'}</div>
        </div>
        <div className="detail-summary-card">
          <span className="detail-label">Risque</span>
          <div className="detail-value">{row._audit ? badge(row._audit.risk, row._audit.risk) : '-'}</div>
        </div>
        <div className="detail-summary-card">
          <span className="detail-label">Score</span>
          <div className="detail-value">{row._audit ? `${row._audit.score}/100` : '-'}</div>
        </div>
        <div className="detail-summary-card">
          <span className="detail-label">Anomalies</span>
          <div className="detail-value">{row._audit?.anomalies?.length || 0}</div>
        </div>
      </div>
      {n8nAnomaliesLoading && (
        <div className="empty-state">
          <div className="spinner"></div>
          <p>Chargement des anomalies IA...</p>
        </div>
      )}
      {n8nAnomaliesError && <div className="error">{n8nAnomaliesError}</div>}
      <section className="detail-section">
        <div className="detail-section-title"><h4>Anomalies IA ({n8nAnomalies.length})</h4></div>
        {n8nAnomalies.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {n8nAnomalies.map((anomaly, idx) => (
              <div key={idx} style={{ padding: 16, borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: 8 }}>{anomaly.title}</h4>
                <p style={{ marginBottom: 12 }}>{anomaly.description}</p>
                {anomaly.causes && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Causes :</strong>
                    <p style={{ marginTop: 4 }}>{anomaly.causes}</p>
                  </div>
                )}
                {anomaly.solutions && (
                  <div>
                    <strong>Solutions :</strong>
                    <p style={{ marginTop: 4 }}>{anomaly.solutions}</p>
                  </div>
                )}
                {anomaly.severity && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Sévérité :</strong>
                    <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, background: 'var(--danger)', color: '#fff' }}>{anomaly.severity}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Aucune anomalie détectée</div>
        )}
      </section>
      <section className="detail-section">
        <div className="detail-section-title"><h4>Informations principales</h4><span>{summaryFields.length} champs</span></div>
        <div className="detail-field-grid">{summaryFields.map(([k, v]) => <div className="detail-field" key={k}><span>{columnLabel(k)}</span><strong>{formatCellValue(k, v)}</strong></div>)}</div>
      </section>
      <section className="detail-section">
        <div className="detail-section-title"><h4>Autres informations</h4><span>{otherFields.length} champs</span></div>
        <div className="detail-field-grid detail-field-grid-compact">{otherFields.map(([k, v]) => <div className="detail-field" key={k}><span>{columnLabel(k)}</span><strong>{formatCellValue(k, v)}</strong></div>)}</div>
      </section>
    </div>
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
