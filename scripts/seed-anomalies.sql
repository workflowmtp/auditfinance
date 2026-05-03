-- ============================================
-- SCRIPT DE DONNÉES DE TEST POUR ANOMALIES
-- ============================================

-- Insérer des anomalies de test
INSERT INTO audit_management.anomalies (
    module, module_name, source_schema, source_table, source_record_id,
    anomaly_type, severity, title, description, affected_field, suggestion,
    amount, amount_currency, reference_number, status, justification_status,
    risk_score, risk_level, is_false_positive
) VALUES 
-- Anomalie 1: Montant critique
(
    'supplierInvoices', 'Factures fournisseurs', 'raw', 'sage_supplier_invoices', 'INV-2024-001',
    'montant_anormal', 'critique', 
    'Montant très élevé détecté',
    'La facture de 15,000,000 FCFA dépasse le seuil critique de 10,000,000 FCFA. Vérification obligatoire requise.',
    'amount_ttc', 
    'Vérifier la pièce justificative et l''autorisation hiérarchique signée par le DG.',
    15000000, 'XOF', 'FAC-2024-001',
    'ouverte', 'sans_justificatif',
    95, 'critique', false
),
-- Anomalie 2: Échéance dépassée
(
    'supplierInvoices', 'Factures fournisseurs', 'raw', 'sage_supplier_invoices', 'INV-2024-002',
    'echeance_depassee', 'majeur',
    'Échéance dépassée depuis 45 jours',
    'La date d''échéance (15/11/2024) est dépassée depuis 45 jours. Relance recommandée.',
    'due_date',
    'Relancer le fournisseur ou vérifier si un paiement est en cours de traitement.',
    2500000, 'XOF', 'FAC-2024-002',
    'ouverte', 'demandee',
    70, 'moyen', false
),
-- Anomalie 3: TVA anormale
(
    'supplierInvoices', 'Factures fournisseurs', 'raw', 'sage_supplier_invoices', 'INV-2024-003',
    'tva_anormale', 'majeur',
    'Incohérence TVA détectée',
    'Le montant de TVA déclaré (180,000 FCFA) ne correspond pas au calcul (150,000 FCFA). Écart de 30,000 FCFA.',
    'tax_amount',
    'Vérifier le taux TVA appliqué et recalculer à partir du montant HT.',
    1180000, 'XOF', 'FAC-2024-003',
    'en_cours', 'recue',
    65, 'moyen', false
),
-- Anomalie 4: Référence manquante (mineur)
(
    'supplierInvoices', 'Factures fournisseurs', 'raw', 'sage_supplier_invoices', 'INV-2024-004',
    'reference_manquante', 'mineur',
    'Numéro de bon de commande manquant',
    'La facture ne référence pas de bon de commande associé.',
    'order_reference',
    'Demander au fournisseur le numéro de commande ou vérifier dans le système.',
    450000, 'XOF', 'FAC-2024-004',
    'ouverte', 'sans_justificatif',
    30, 'faible', false
),
-- Anomalie 5: Fournisseur non référencé
(
    'entries', 'Écritures comptables', 'raw', 'sage_accounting_entries', 'ECR-2024-005',
    'tiers_non_reference', 'majeur',
    'Fournisseur non identifié',
    'L''écriture concerne un tiers (FRS-12345) qui n''est pas référencé dans la base fournisseurs.',
    'third_party_id',
    'Vérifier si le fournisseur existe sous un autre code ou créer la fiche fournisseur.',
    3200000, 'XOF', 'ECR-2024-005',
    'en_cours', 'demandee',
    60, 'moyen', false
),
-- Anomalie 6: Montant élevé (critique)
(
    'payments', 'Paiements fournisseurs', 'raw', 'sage_supplier_payments', 'PAY-2024-006',
    'montant_anormal', 'critique',
    'Paiement en espèces élevé',
    'Paiement de 8,500,000 FCFA en espèces dépasse la limite autorisée (500,000 FCFA).',
    'payment_amount',
    'Vérifier l''autorisation BCEAO et la déclaration de transaction en espèces.',
    8500000, 'XOF', 'PAY-2024-006',
    'ouverte', 'sans_justificatif',
    90, 'critique', false
),
-- Anomalie 7: Date incohérente
(
    'customerInvoices', 'Factures clients', 'raw', 'sage_customer_invoices', 'CLI-2024-007',
    'date_incoherente', 'majeur',
    'Date d''échéance antérieure à la date de facture',
    'L''échéance (10/01/2024) est antérieure à la date de facture (15/01/2024).',
    'due_date',
    'Corriger la date d''échéance ou vérifier les conditions de paiement.',
    1800000, 'XOF', 'CLI-2024-007',
    'justifiee', 'validee',
    55, 'moyen', false
),
-- Anomalie 8: Doublon détecté
(
    'taxEntries', 'Écritures TVA', 'raw', 'sage_tax_entries', 'TVA-2024-008',
    'doublon_detecte', 'mineur',
    'Possible doublon d''écriture TVA',
    'Deux écritures TVA identiques détectées pour la même facture (FAC-2024-008).',
    'invoice_id',
    'Vérifier si c''est un doublon réel ou deux opérations distinctes.',
    250000, 'XOF', 'TVA-2024-008',
    'cloturee', 'validee',
    25, 'faible', true
);

-- Ajouter l'historique pour quelques anomalies
INSERT INTO audit_management.anomaly_history (
    anomaly_id, action_type, action_by, old_status, new_status, comment
)
SELECT 
    a.id,
    'creation',
    1,
    NULL,
    'ouverte',
    'Anomalie détectée automatiquement'
FROM audit_management.anomalies a
WHERE a.anomaly_id IN ('ANOM-00001', 'ANOM-00002', 'ANOM-00003');

INSERT INTO audit_management.anomaly_history (
    anomaly_id, action_type, action_by, old_status, new_status, comment
)
VALUES 
(2, 'changement_statut', 1, 'ouverte', 'en_cours', 'Prise en charge par l''équipe audit'),
(2, 'changement_statut', 2, 'en_cours', 'demandee', 'Justificatif demandé au fournisseur'),
(3, 'assignation', 1, NULL, NULL, 'Assigné à Marie Dubois'),
(7, 'changement_statut', 1, 'ouverte', 'justifiee', 'Date corrigée, explication validée'),
(8, 'changement_statut', 1, 'ouverte', 'cloturee', 'Doublon confirmé - écriture annulée');

-- Vérifier les résultats
SELECT 
    severity,
    status,
    COUNT(*) as count
FROM audit_management.anomalies
GROUP BY severity, status
ORDER BY severity, status;
