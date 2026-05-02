# Requêtes SQL pour FinanceAudit Next.js

## Tables par Schéma

### Schéma `analytics` (Vues analytiques)
- `cash_accounts` - Comptes caisse avec soldes
- `sage_advances` - Avances et acomptes
- `sage_audit_trail` - Piste d'audit
- `sage_suspense_accounts` - Comptes d'attente
- `sage_tax_declarations` - Déclarations fiscales

### Schéma `raw` (Tables brutes Sage X3)
- `drive_documents_index` - Index des documents Drive
- `sage_accounting_entries` - Écritures comptables
- `sage_bank_accounts` - Comptes bancaires
- `sage_bank_movements` - Mouvements bancaires
- `sage_cash_movements` - Mouvements caisse
- `sage_categories` - Catégories
- `sage_chart_of_accounts` - Plan comptable
- `sage_customer_invoices` - Factures clients
- `sage_orders` - Commandes fournisseurs
- `sage_purchase_requests` - Demandes d'achat
- `sage_receipts` - Réceptions (BR)
- `sage_supplier_bank_accounts` - RIB fournisseurs
- `sage_supplier_bank_history` - Historique RIB
- `sage_supplier_invoices` - Factures fournisseurs
- `sage_supplier_payments` - Paiements fournisseurs
- `sage_suppliers` - Fournisseurs
- `sage_tax_entries` - Écritures TVA
- `sage_users` - Utilisateurs
- `sync_runs` - Synchronisations

---

## Requêtes de Contrôle d'Audit

### 1. Écritures comptables suspects (Schéma raw)
```sql
-- Écritures manuelles sur comptes sensibles
SELECT 
    entry_number,
    accounting_date,
    journal_code,
    account_code,
    account_label,
    debit_amount,
    credit_amount,
    line_description,
    created_by_name,
    entry_mode_indicator,
    modif_post_validation_indicator
FROM raw.sage_accounting_entries
WHERE 
    entry_mode_indicator = 'MANUELLE'
    AND (account_code LIKE '4%' OR account_code LIKE '6%')
    AND ABS(COALESCE(debit_amount, 0) + COALESCE(credit_amount, 0)) > 1000000
ORDER BY accounting_date DESC
LIMIT 100;
```

### 2. Factures fournisseurs sans pièces jointes (Schéma raw)
```sql
-- Factures sans justificatif dans Drive
SELECT 
    si.invoice_number,
    si.supplier_name,
    si.amount_ttc,
    si.invoice_date,
    si.due_date,
    di.document_id IS NULL as sans_justificatif
FROM raw.sage_supplier_invoices si
LEFT JOIN raw.drive_documents_index di 
    ON di.linked_invoice_number = si.invoice_number
WHERE 
    si.invoice_date >= CURRENT_DATE - INTERVAL '90 days'
    AND di.document_id IS NULL
ORDER BY si.amount_ttc DESC
LIMIT 100;
```

### 3. Paiements sans facture liée (Schéma raw)
```sql
-- Paiements suspects sans facture
SELECT 
    payment_number,
    supplier_name,
    payment_amount,
    payment_date,
    paiement_sans_facture_indicator,
    paiement_sans_bon_a_payer_indicator,
    created_by_name,
    approval_user_name
FROM raw.sage_supplier_payments
WHERE 
    paiement_sans_facture_indicator = 'SANS_FACTURE'
    OR paiement_sans_bon_a_payer_indicator LIKE 'GROS_MONTANT%'
ORDER BY payment_date DESC
LIMIT 100;
```

### 4. Fournisseurs avec RIB modifié récemment (Schéma raw)
```sql
-- Alertes sur modifications de coordonnées bancaires
SELECT 
    supplier_code,
    supplier_name,
    rib_identifier,
    event_type,
    field_changed,
    old_rib_or_iban,
    new_rib_or_iban,
    modified_by_name,
    modified_at_src,
    risk_level,
    risk_reason
FROM raw.sage_supplier_bank_history
WHERE 
    risk_level IN ('CRITIQUE', 'ALERTE')
    AND detected_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY detected_at DESC;
```

### 5. Comptes d'attente non régularisés (Schéma analytics)
```sql
-- Comptes d'attente avec ancienneté
SELECT 
    suspense_id,
    document_number,
    account_code,
    account_label,
    balance_amount,
    age_days,
    age_indicator,
    regularization_status,
    responsible
FROM analytics.sage_suspense_accounts
WHERE 
    regularization_status IN ('NON_REGULARISE', 'PARTIELLEMENT_REGULARISE')
    AND age_days > 30
ORDER BY balance_amount DESC
LIMIT 100;
```

### 6. Avances non régularisées (Schéma analytics)
```sql
-- Suivi des avances fournisseurs
SELECT 
    advance_id,
    advance_type,
    third_party_name,
    amount,
    regularized_amount,
    outstanding_amount,
    regularized_percent,
    age_days,
    regularization_status
FROM analytics.sage_advances
WHERE 
    regularization_status != 'REGULARISEE'
    AND age_days > 30
ORDER BY outstanding_amount DESC
LIMIT 100;
```

### 7. Écritures TVA manuelles suspects (Schéma raw)
```sql
-- TVA saisie manuellement sans facture
SELECT 
    tax_entry_id,
    accounting_date,
    tax_account_code,
    tax_account_label,
    tax_type,
    tax_amount,
    taxable_base,
    invoice_number,
    manual_tax_entry,
    tva_sans_facture
FROM raw.sage_tax_entries
WHERE 
    manual_tax_entry = 'TVA_SAISIE_MANUELLE'
    OR tva_sans_facture = 'TVA_DEDUC_SANS_FACTURE'
ORDER BY accounting_date DESC
LIMIT 100;
```

### 8. Mouvements bancaires non rapprochés (Schéma raw)
```sql
-- Mouvements bancaires suspects
SELECT 
    bank_movement_id,
    payment_number,
    bank_account_code,
    third_party_name,
    amount,
    movement_date,
    rapprochement_indicator,
    paiement_sans_facture_indicator,
    coherence_tiers_indicator
FROM raw.sage_bank_movements
WHERE 
    rapprochement_indicator LIKE 'RETARD%'
    OR coherence_tiers_indicator = 'TIERS_PAYE_DIFFERENT'
ORDER BY movement_date DESC
LIMIT 100;
```

### 9. Anomalies de réception (Schéma raw)
```sql
-- Réceptions avec écarts de quantité ou qualité
SELECT 
    receipt_number,
    receipt_date,
    supplier_name,
    item_designation,
    quantity_ordered_stu,
    quantity_received_stu,
    quantity_accepted_stu,
    conformity_percentage,
    quality_status,
    delivery_delay_days
FROM raw.sage_receipts
WHERE 
    conformity_indicator != 'CONFORME'
    OR delivery_delay_days > 7
ORDER BY receipt_date DESC
LIMIT 100;
```

### 10. Demandes d'achat en retard (Schéma raw)
```sql
-- DA en attente de validation ou non converties
SELECT 
    pr_number,
    pr_date,
    need_date,
    requester_name,
    item_designation,
    quantity_requested,
    line_amount,
    status,
    EXTRACT(DAY FROM CURRENT_DATE - pr_date) as days_pending
FROM raw.sage_purchase_requests
WHERE 
    status IN ('pending_validation', 'validated')
    AND (has_order = false OR has_order IS NULL)
    AND EXTRACT(DAY FROM CURRENT_DATE - pr_date) > 7
ORDER BY pr_date ASC
LIMIT 100;
```

### 11. Utilisateurs inactifs avec droits (Schéma raw)
```sql
-- Comptes utilisateurs à vérifier
SELECT 
    user_code,
    user_name,
    email,
    profile_function,
    is_active,
    connection_status,
    days_since_last_connection,
    approval_level,
    mission_active,
    mission_end
FROM raw.sage_users
WHERE 
    (connection_status LIKE 'INACTIF%' AND approval_level != 'AUCUN_ROLE')
    OR mission_risk_indicator = 'MISSION_TERMINEE_USER_ACTIF'
ORDER BY days_since_last_connection DESC NULLS LAST;
```

### 12. Écart sur déclarations fiscales (Schéma analytics)
```sql
-- Déclarations fiscales avec écarts
SELECT 
    declaration_period,
    tax_type,
    tax_subtype,
    tax_account_code,
    tax_account_label,
    calculated_base_sage,
    declared_base,
    calculated_tax_sage,
    declared_tax,
    difference_amount,
    difference_percent,
    declaration_status
FROM analytics.sage_tax_declarations
WHERE 
    ABS(COALESCE(difference_amount, 0)) > 1000
    OR quality_taux_indicator = 'TAUX_INCOHERENT'
ORDER BY ABS(difference_amount) DESC;
```

---

## Requêtes de Tableau de Bord

### Statistiques globales
```sql
-- Nombre de tables et colonnes par schéma
SELECT 
    table_schema,
    COUNT(DISTINCT table_name) as nb_tables,
    COUNT(*) as nb_colonnes
FROM information_schema.columns
WHERE table_schema IN ('analytics', 'raw')
GROUP BY table_schema;
```

### Volume de données par table
```sql
-- Estimation du volume de données (tables principales)
SELECT 
    'raw.sage_accounting_entries' as table_name,
    COUNT(*) as nb_lignes
FROM raw.sage_accounting_entries
UNION ALL
SELECT 
    'raw.sage_supplier_invoices',
    COUNT(*)
FROM raw.sage_supplier_invoices
UNION ALL
SELECT 
    'raw.sage_supplier_payments',
    COUNT(*)
FROM raw.sage_supplier_payments
UNION ALL
SELECT 
    'analytics.sage_suspense_accounts',
    COUNT(*)
FROM analytics.sage_suspense_accounts;
```

### Indicateurs de risque par module
```sql
-- Synthèse des alertes par type
SELECT 
    'Comptes attente' as module,
    COUNT(*) as nb_alertes,
    SUM(CASE WHEN age_days > 90 THEN 1 ELSE 0 END) as critiques
FROM analytics.sage_suspense_accounts
WHERE regularization_status != 'REGULARISE'

UNION ALL

SELECT 
    'Avances',
    COUNT(*),
    SUM(CASE WHEN age_days > 180 THEN 1 ELSE 0 END)
FROM analytics.sage_advances
WHERE regularization_status != 'REGULARISEE'

UNION ALL

SELECT 
    'Paiements sans facture',
    COUNT(*),
    SUM(CASE WHEN payment_amount > 1000000 THEN 1 ELSE 0 END)
FROM raw.sage_supplier_payments
WHERE paiement_sans_facture_indicator = 'SANS_FACTURE';
```

---

## Requêtes pour l'Application Next.js

### Récupération des données d'un module
```sql
-- Exemple pour les écritures comptables
SELECT 
    accounting_date,
    journal_code,
    entry_number,
    account_code,
    account_label,
    third_party_name,
    debit_amount,
    credit_amount,
    currency,
    line_description
FROM raw.sage_accounting_entries
WHERE accounting_date >= $1::date
  AND accounting_date <= $2::date
ORDER BY accounting_date DESC
LIMIT $3;
```

### Recherche full-text
```sql
-- Recherche dans les factures fournisseurs
SELECT 
    invoice_date,
    supplier_name,
    invoice_number,
    supplier_invoice_ref,
    amount_ttc,
    amount_ht
FROM raw.sage_supplier_invoices
WHERE 
    supplier_name ILIKE '%' || $1 || '%'
    OR invoice_number ILIKE '%' || $1 || '%'
    OR supplier_invoice_ref ILIKE '%' || $1 || '%'
ORDER BY invoice_date DESC
LIMIT 100;
```

### Filtrage par période et statut
```sql
-- Factures avec statut d'échéance
SELECT 
    invoice_number,
    supplier_name,
    amount_ttc,
    invoice_date,
    due_date,
    due_status_max,
    outstanding_amount
FROM raw.sage_supplier_invoices
WHERE invoice_date >= $1::date
  AND due_status_max IN ('EN_RETARD', 'IMPAYEE')
ORDER BY due_date ASC;
```
