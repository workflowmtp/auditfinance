export type AuditModuleId =
  | 'dashboard'
  | 'entries'
  | 'supplierInvoices'
  | 'customerInvoices'
  | 'payments'
  | 'bankCash'
  | 'cashAccounts'
  | 'suspenseAccounts'
  | 'advances'
  | 'suppliers'
  | 'bankAccounts'
  | 'purchaseRequests'
  | 'orders'
  | 'receipts'
  | 'taxDeclarations'
  | 'taxEntries'
  | 'reconciliation'
  | 'anomalies'
  | 'justifications'
  | 'aiAgent'
  | 'reports'
  | 'period'
  | 'settings'
  | 'exports'
  | 'auditTrail'
  | 'supplierBankAccounts'
  | 'chartOfAccounts'
  | 'categories'
  | 'users';

export type ModuleConfig = {
  id: AuditModuleId;
  title: string;
  description: string;
  table?: string;
  schema?: string;
  dateColumns: string[];
  amountColumns: string[];
  referenceColumns: string[];
  displayColumns: string[];
  searchColumns: string[];
};

export const DB_SCHEMA = process.env.DB_SCHEMA || 'analytics';

// Schema analytics (Views) - Schéma par défaut
export const ANALYTICS_VIEWS = {
  cashAccounts: 'cash_accounts',
  sageAdvances: 'sage_advances',
  sageAuditTrail: 'sage_audit_trail',
  sageSuspenseAccounts: 'sage_suspense_accounts',
  sageTaxDeclarations: 'sage_tax_declarations'
} as const;

// Schema raw (Base Tables) - Tables brutes Sage X3
export const RAW_TABLES = {
  driveDocumentsIndex: 'drive_documents_index',
  sageAccountingEntries: 'sage_accounting_entries',
  sageBankAccounts: 'sage_bank_accounts',
  sageBankMovements: 'sage_bank_movements',
  sageCashMovements: 'sage_cash_movements',
  sageCategories: 'sage_categories',
  sageChartOfAccounts: 'sage_chart_of_accounts',
  sageCustomerInvoices: 'sage_customer_invoices',
  sageOrders: 'sage_orders',
  sagePurchaseRequests: 'sage_purchase_requests',
  sageReceipts: 'sage_receipts',
  sageSupplierBankAccounts: 'sage_supplier_bank_accounts',
  sageSupplierBankHistory: 'sage_supplier_bank_history',
  sageSupplierInvoices: 'sage_supplier_invoices',
  sageSupplierPayments: 'sage_supplier_payments',
  sageSuppliers: 'sage_suppliers',
  sageTaxEntries: 'sage_tax_entries',
  sageUsers: 'sage_users',
  syncRuns: 'sync_runs'
} as const;

export const MODULES: ModuleConfig[] = [
  // ========== MODULES SCHÉMA ANALYTICS (VUES) ==========
  {
    id: 'cashAccounts',
    title: 'Comptes caisse',
    description: 'Vue analytique des comptes caisse avec soldes et indicateurs de risque.',
    table: ANALYTICS_VIEWS.cashAccounts,
    schema: 'analytics',
    dateColumns: ['created_at', 'last_modified_at', 'ingested_at', 'updated_at'],
    amountColumns: ['current_balance', 'opening_balance'],
    referenceColumns: ['cash_account_code', 'gl_account_code', 'company_account_code'],
    displayColumns: ['cash_account_code', 'cash_label', 'gl_account_code', 'gl_account_label', 'current_balance', 'opening_balance', 'currency', 'responsible_user_name', 'is_active'],
    searchColumns: ['cash_account_code', 'cash_label', 'gl_account_code', 'gl_account_label', 'responsible_user_name', 'responsible_user_code']
  },
  {
    id: 'advances',
    title: 'Avances et acomptes',
    description: 'Suivi des avances fournisseurs, acomptes et régularisations.',
    table: ANALYTICS_VIEWS.sageAdvances,
    schema: 'analytics',
    dateColumns: ['advance_date', 'source_ingested_at'],
    amountColumns: ['amount', 'regularized_amount', 'outstanding_amount'],
    referenceColumns: ['advance_id', 'source_id', 'third_party_code', 'reference'],
    displayColumns: ['advance_date', 'advance_type', 'third_party_name', 'amount', 'regularized_amount', 'outstanding_amount', 'regularized_percent', 'age_days', 'status', 'regularization_status'],
    searchColumns: ['advance_id', 'third_party_code', 'third_party_name', 'reference', 'responsible', 'responsible_code']
  },
  {
    id: 'suspenseAccounts',
    title: 'Comptes d\'attente',
    description: 'Vue analytique des comptes d\'attente avec indicateurs de risque.',
    table: ANALYTICS_VIEWS.sageSuspenseAccounts,
    schema: 'analytics',
    dateColumns: ['entry_date', 'accounting_date', 'validation_date', 'due_date', 'source_ingested_at'],
    amountColumns: ['debit_amount', 'credit_amount', 'balance_amount', 'local_amount', 'amount_currency', 'group_balance_amount'],
    referenceColumns: ['suspense_id', 'document_number', 'account_code', 'third_party_code'],
    displayColumns: ['entry_date', 'document_number', 'account_code', 'account_label', 'suspense_category', 'debit_amount', 'credit_amount', 'balance_amount', 'age_days', 'regularization_status', 'status'],
    searchColumns: ['suspense_id', 'document_number', 'account_code', 'account_label', 'third_party_code', 'third_party_name', 'reference']
  },
  {
    id: 'taxDeclarations',
    title: 'Déclarations fiscales',
    description: 'Vue analytique des déclarations fiscales avec écarts et qualité.',
    table: ANALYTICS_VIEWS.sageTaxDeclarations,
    schema: 'analytics',
    dateColumns: ['first_entry_date', 'last_entry_date', 'first_ingested_at', 'last_ingested_at', 'validation_date'],
    amountColumns: ['calculated_base_sage', 'calculated_tax_sage', 'declared_base', 'declared_tax', 'difference_amount'],
    referenceColumns: ['declaration_id', 'tax_account_code'],
    displayColumns: ['declaration_period', 'tax_type', 'tax_subtype', 'tax_account_code', 'tax_account_label', 'nb_lines', 'nb_entries', 'calculated_base_sage', 'calculated_tax_sage', 'declared_base', 'declared_tax', 'difference_amount', 'declaration_status'],
    searchColumns: ['declaration_id', 'tax_account_code', 'tax_account_label', 'tax_type', 'tax_subtype']
  },

  // ========== MODULES SCHÉMA RAW (TABLES BRUTES) ==========
  {
    id: 'entries',
    title: 'Écritures comptables',
    description: 'Contrôle des journaux, comptes, pièces, libellés, débits et crédits.',
    table: RAW_TABLES.sageAccountingEntries,
    schema: 'raw',
    dateColumns: ['accounting_date', 'entry_date', 'validation_date', 'due_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['debit_amount', 'credit_amount', 'amount_currency', 'local_amount'],
    referenceColumns: ['entry_line_id', 'entry_number', 'document_type_code', 'reference'],
    displayColumns: ['accounting_date', 'journal_code', 'entry_number', 'account_code', 'account_label', 'third_party_name', 'debit_amount', 'credit_amount', 'currency'],
    searchColumns: ['entry_number', 'entry_line_id', 'journal_code', 'account_code', 'account_label', 'third_party_name', 'reference']
  },
  {
    id: 'supplierInvoices',
    title: 'Factures fournisseurs',
    description: 'Contrôle BC, BR, doublons, échéances, TVA et séparation des tâches.',
    table: RAW_TABLES.sageSupplierInvoices,
    schema: 'raw',
    dateColumns: ['invoice_date', 'accounting_date', 'due_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['amount_ht', 'amount_ttc', 'tax_amount', 'local_amount', 'amount_ht_currency', 'amount_ttc_currency'],
    referenceColumns: ['invoice_number', 'supplier_invoice_ref', 'purchase_order_number', 'receipt_number'],
    displayColumns: ['invoice_date', 'supplier_name', 'invoice_number', 'supplier_invoice_ref', 'amount_ttc', 'amount_ht', 'due_date', 'journal_code', 'company_code', 'site_code'],
    searchColumns: ['invoice_number', 'supplier_invoice_ref', 'supplier_code', 'supplier_name', 'journal_code']
  },
  {
    id: 'customerInvoices',
    title: 'Factures clients',
    description: 'Contrôle des retards, plafonds clients, avoirs, remises et recouvrement.',
    table: RAW_TABLES.sageCustomerInvoices,
    schema: 'raw',
    dateColumns: ['invoice_date', 'accounting_date', 'due_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['amount_ht', 'amount_ttc', 'tax_amount', 'local_amount', 'amount_ht_currency', 'amount_ttc_currency'],
    referenceColumns: ['invoice_number', 'customer_code'],
    displayColumns: ['invoice_date', 'customer_name', 'invoice_number', 'amount_ttc', 'amount_ht', 'due_date', 'sales_rep_code', 'journal_code', 'company_code', 'site_code'],
    searchColumns: ['invoice_number', 'customer_code', 'customer_name', 'sales_rep_code', 'journal_code']
  },
  {
    id: 'payments',
    title: 'Paiements fournisseurs',
    description: 'Analyse des paiements fournisseurs, espèces, doublons, initiateurs et validateurs.',
    table: RAW_TABLES.sageSupplierPayments,
    schema: 'raw',
    dateColumns: ['payment_date', 'accounting_date', 'due_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['payment_amount', 'amount_currency', 'local_amount', 'amount_paid', 'outstanding_amount'],
    referenceColumns: ['payment_number', 'reference', 'invoice_number'],
    displayColumns: ['payment_date', 'payment_number', 'supplier_name', 'payment_mode_code', 'payment_method', 'reference', 'payment_amount', 'amount_currency', 'company_code', 'site_code'],
    searchColumns: ['payment_number', 'reference', 'supplier_code', 'supplier_name', 'payment_mode_code']
  },
  {
    id: 'bankCash',
    title: 'Mouvements bancaires',
    description: 'Contrôle des écarts, soldes, opérations non rapprochées et mouvements suspects.',
    table: RAW_TABLES.sageBankMovements,
    schema: 'raw',
    dateColumns: ['movement_date', 'accounting_date', 'payment_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['amount', 'amount_currency', 'local_amount', 'amount_bank'],
    referenceColumns: ['bank_movement_id', 'payment_number', 'bank_account_code'],
    displayColumns: ['movement_date', 'payment_number', 'bank_account_code', 'third_party_name', 'beneficiary_name', 'direction_label', 'operation_type', 'amount', 'currency'],
    searchColumns: ['payment_number', 'bank_account_code', 'third_party_name', 'beneficiary_name', 'operation_type']
  },
  {
    id: 'bankAccounts',
    title: 'Comptes bancaires',
    description: 'Fiche des comptes bancaires avec RIB, soldes et état de rapprochement.',
    table: RAW_TABLES.sageBankAccounts,
    schema: 'raw',
    dateColumns: ['last_extract_date', 'last_value_date', 'last_operation_date', 'last_reconciliation_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['opening_balance', 'current_balance_sage', 'last_statement_balance'],
    referenceColumns: ['bank_account_code', 'iban_masked', 'account_number_masked'],
    displayColumns: ['bank_account_code', 'bank_name', 'bank_short_name', 'bank_type_label', 'iban_masked', 'bic', 'currency', 'opening_balance', 'current_balance_sage', 'last_reconciliation_date'],
    searchColumns: ['bank_account_code', 'bank_name', 'bank_short_name', 'bic', 'iban_masked']
  },
  {
    id: 'suppliers',
    title: 'Fournisseurs',
    description: 'Fichier fournisseurs avec plafonds, blocages et données qualité.',
    table: RAW_TABLES.sageSuppliers,
    schema: 'raw',
    dateColumns: ['created_at_src', 'updated_at_src', 'cai_validity_date'],
    amountColumns: ['credit_limit', 'min_order_amount', 'order_free_freight'],
    referenceColumns: ['supplier_code', 'tax_number', 'fiscal_matricule', 'bp_registration_number'],
    displayColumns: ['supplier_code', 'supplier_name', 'supplier_short_name', 'supplier_category', 'status', 'credit_limit', 'currency', 'country_code', 'has_credit_limit'],
    searchColumns: ['supplier_code', 'supplier_name', 'supplier_short_name', 'tax_number', 'fiscal_matricule']
  },
  {
    id: 'supplierBankAccounts',
    title: 'RIB Fournisseurs',
    description: 'Suivi des coordonnées bancaires fournisseurs avec historique des modifications.',
    table: RAW_TABLES.sageSupplierBankAccounts,
    schema: 'raw',
    dateColumns: ['created_at_src', 'updated_at_src'],
    amountColumns: [],
    referenceColumns: ['supplier_code', 'rib_identifier', 'iban', 'bic', 'rib_or_iban'],
    displayColumns: ['supplier_code', 'supplier_name', 'rib_identifier', 'beneficiary_name', 'iban', 'bic', 'is_default_rib', 'currency', 'country_code'],
    searchColumns: ['supplier_code', 'supplier_name', 'beneficiary_name', 'iban', 'bic', 'rib_or_iban']
  },
  {
    id: 'purchaseRequests',
    title: 'Demandes d\'achat',
    description: 'Suivi des DA (Demandes d\'achat) avec validation et conversion en commandes.',
    table: RAW_TABLES.sagePurchaseRequests,
    schema: 'raw',
    dateColumns: ['pr_date', 'need_date', 'validation_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['unit_price', 'line_amount', 'quantity_requested'],
    referenceColumns: ['pr_number', 'requester_code', 'item_code', 'linked_order_number'],
    displayColumns: ['pr_number', 'pr_date', 'need_date', 'requester_name', 'facility_code', 'item_designation', 'quantity_requested', 'unit_price', 'line_amount', 'status'],
    searchColumns: ['pr_number', 'requester_code', 'requester_name', 'item_code', 'item_designation']
  },
  {
    id: 'orders',
    title: 'Commandes fournisseurs',
    description: 'Suivi des commandes fournisseurs avec réception et facturation.',
    table: RAW_TABLES.sageOrders,
    schema: 'raw',
    dateColumns: ['order_date', 'expected_delivery_date', 'date_received', 'created_at_src', 'updated_at_src'],
    amountColumns: ['total_amount', 'total_amount_tax_incl', 'total_tax_amount'],
    referenceColumns: ['po_number', 'supplier_code', 'buyer_code', 'linked_pr_number'],
    displayColumns: ['po_number', 'order_date', 'supplier_name', 'buyer_name', 'total_amount', 'currency', 'order_status', 'expected_delivery_date'],
    searchColumns: ['po_number', 'supplier_code', 'supplier_name', 'buyer_code', 'buyer_name']
  },
  {
    id: 'receipts',
    title: 'Réceptions (BR)',
    description: 'Suivi des bons de réception avec conformité et écarts.',
    table: RAW_TABLES.sageReceipts,
    schema: 'raw',
    dateColumns: ['receipt_date', 'delivery_note_date', 'arrival_date', 'expected_delivery_date', 'created_at_src', 'updated_at_src'],
    amountColumns: ['total_ht', 'total_ttc', 'total_vat', 'line_amount_ht'],
    referenceColumns: ['receipt_number', 'supplier_delivery_note', 'linked_order_number'],
    displayColumns: ['receipt_number', 'receipt_date', 'supplier_name', 'supplier_delivery_note', 'item_designation', 'quantity_received_stu', 'quantity_accepted_stu', 'conformity_percentage', 'quality_status'],
    searchColumns: ['receipt_number', 'supplier_code', 'supplier_name', 'supplier_delivery_note', 'warehouse_keeper_name']
  },
  {
    id: 'taxEntries',
    title: 'Écritures TVA',
    description: 'Analyse des écritures TVA avec taux calculés et cohérence.',
    table: RAW_TABLES.sageTaxEntries,
    schema: 'raw',
    dateColumns: ['invoice_date', 'accounting_date', 'vat_declaration_date', 'created_at_timestamp', 'updated_at_timestamp'],
    amountColumns: ['tax_amount', 'tax_amount_currency', 'taxable_base', 'tax_rate_calculated', 'tax_rate_declared'],
    referenceColumns: ['tax_entry_id', 'entry_number', 'invoice_number', 'tax_account_code'],
    displayColumns: ['accounting_date', 'tax_account_code', 'tax_account_label', 'tax_type', 'tax_amount', 'taxable_base', 'tax_rate_calculated', 'invoice_number', 'third_party_code'],
    searchColumns: ['tax_entry_id', 'entry_number', 'invoice_number', 'tax_account_code', 'tax_account_label']
  },
  {
    id: 'chartOfAccounts',
    title: 'Plan comptable',
    description: 'Plan comptable avec classes, types et indicateurs sensibles.',
    table: RAW_TABLES.sageChartOfAccounts,
    schema: 'raw',
    dateColumns: ['validity_start_date', 'validity_end_date', 'created_at_src', 'updated_at_src'],
    amountColumns: [],
    referenceColumns: ['chart_of_accounts', 'account_code', 'vat_code'],
    displayColumns: ['chart_of_accounts', 'account_code', 'account_label', 'account_class', 'account_type', 'account_sub_type', 'is_active', 'is_sensitive', 'is_suspense_account'],
    searchColumns: ['account_code', 'account_label', 'account_class', 'account_type', 'vat_code']
  },
  {
    id: 'categories',
    title: 'Catégories',
    description: 'Catégories fournisseurs et clients.',
    table: RAW_TABLES.sageCategories,
    schema: 'raw',
    dateColumns: ['ingested_at'],
    amountColumns: [],
    referenceColumns: ['code'],
    displayColumns: ['code', 'name', 'shortname'],
    searchColumns: ['code', 'name', 'shortname']
  },
  {
    id: 'users',
    title: 'Utilisateurs',
    description: 'Fichier utilisateurs Sage avec permissions et indicateurs de sécurité.',
    table: RAW_TABLES.sageUsers,
    schema: 'raw',
    dateColumns: ['mission_start', 'mission_end', 'last_connection_date', 'password_last_change', 'created_at_src', 'updated_at_src'],
    amountColumns: ['hourly_rate'],
    referenceColumns: ['user_code', 'login', 'email', 'manager_code'],
    displayColumns: ['user_code', 'user_name', 'email', 'department_code', 'profile_function', 'is_active', 'approval_level', 'connection_status'],
    searchColumns: ['user_code', 'login', 'user_name', 'email', 'manager_name']
  },
  {
    id: 'justifications',
    title: 'Justificatifs',
    description: 'Suivi centralisé des pièces justificatives demandées, reçues, validées ou rejetées.',
    table: RAW_TABLES.driveDocumentsIndex,
    schema: 'raw',
    dateColumns: ['linked_document_date', 'scan_date', 'upload_date', 'validation_date', 'ingested_at', 'updated_at'],
    amountColumns: ['linked_amount', 'file_size_bytes'],
    referenceColumns: ['document_id', 'linked_document_number', 'linked_invoice_number', 'linked_payment_number'],
    displayColumns: ['linked_document_date', 'document_type', 'source_module', 'file_name', 'linked_document_number', 'linked_invoice_number', 'linked_payment_number', 'linked_amount', 'linked_third_party_name'],
    searchColumns: ['file_name', 'document_type', 'source_module', 'linked_document_number', 'linked_invoice_number', 'linked_payment_number', 'linked_third_party_name']
  },
  {
    id: 'auditTrail',
    title: 'Piste d\'audit',
    description: 'Journal horodaté des actions sensibles issues du miroir Sage X3.',
    table: ANALYTICS_VIEWS.sageAuditTrail,
    schema: 'analytics',
    dateColumns: ['action_date', 'source_ingested_at'],
    amountColumns: ['amount'],
    referenceColumns: ['audit_id', 'record_id', 'record_label', 'action_by_code'],
    displayColumns: ['action_date', 'table_name', 'record_id', 'record_label', 'action_type', 'field_name', 'old_value', 'new_value', 'action_by_name', 'risk_flag'],
    searchColumns: ['table_name', 'record_id', 'record_label', 'action_type', 'field_name', 'action_by_name', 'risk_flag']
  }
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<string, ModuleConfig>;

export const NAV_ITEMS = [
  ['dashboard', 'Tableau de bord'],
  ['entries', 'Écritures comptables'],
  ['supplierInvoices', 'Factures fournisseurs'],
  ['customerInvoices', 'Factures clients'],
  ['payments', 'Paiements'],
  ['bankCash', 'Mouvements bancaires'],
  ['bankAccounts', 'Comptes bancaires'],
  ['cashAccounts', 'Comptes caisse'],
  ['suppliers', 'Fournisseurs'],
  ['supplierBankAccounts', 'RIB Fournisseurs'],
  ['purchaseRequests', 'Demandes d\'achat'],
  ['orders', 'Commandes'],
  ['receipts', 'Réceptions (BR)'],
  ['suspenseAccounts', 'Comptes d\'attente'],
  ['advances', 'Avances et acomptes'],
  ['taxDeclarations', 'Déclarations fiscales'],
  ['taxEntries', 'Écritures TVA'],
  ['chartOfAccounts', 'Plan comptable'],
  ['users', 'Utilisateurs'],
  ['reconciliation', 'Rapprochements'],
  ['anomalies', 'Centre des anomalies'],
  ['justifications', 'Justificatifs'],
  ['aiAgent', 'Agent IA Audit'],
  ['reports', 'Rapports'],
  ['period', 'Période d\'analyse'],
  ['settings', 'Paramétrage'],
  ['exports', 'Export / Sauvegarde'],
  ['auditTrail', 'Piste d\'audit']
] as const;
