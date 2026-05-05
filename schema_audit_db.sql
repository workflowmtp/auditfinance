-- ============================================
-- BASE DE DONNÉES POUR GESTION DES ANOMALIES
-- Et authentification utilisateurs
-- ============================================

-- Créer un nouveau schéma (à adapter selon ta base)
CREATE SCHEMA IF NOT EXISTS audit_management;

-- ============================================
-- 1. TABLE UTILISATEURS
-- ============================================
CREATE TABLE audit_management.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Auditeur' 
        CHECK (role IN ('Administrateur', 'Auditeur', 'Comptable', 'Lecteur')),
    department VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. TABLE ANOMALIES DÉTECTÉES
-- ============================================
CREATE TABLE audit_management.anomalies (
    id SERIAL PRIMARY KEY,
    anomaly_id VARCHAR(20) UNIQUE NOT NULL, -- ex: ANOM-00001
    
    -- Source de l'anomalie
    module VARCHAR(50) NOT NULL, -- ex: 'supplierInvoices'
    module_name VARCHAR(100), -- ex: 'Factures fournisseurs'
    source_schema VARCHAR(50), -- 'analytics' ou 'raw'
    source_table VARCHAR(100), -- ex: 'sage_supplier_invoices'
    source_record_id VARCHAR(255), -- ID de l'enregistrement dans la table source
    
    -- Type et sévérité
    anomaly_type VARCHAR(50) NOT NULL, -- 'montant_anormal', 'echeance_depassee', etc.
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critique', 'majeur', 'mineur')),
    
    -- Description
    title VARCHAR(255) NOT NULL, -- Titre court
    description TEXT NOT NULL, -- Description détaillée
    affected_field VARCHAR(100), -- Champ concerné
    suggestion TEXT, -- Action suggérée
    
    -- Données financières
    amount NUMERIC(18,2), -- Montant concerné
    amount_currency VARCHAR(3) DEFAULT 'XOF',
    reference_number VARCHAR(100), -- Numéro de facture, pièce, etc.
    
    -- Statuts
    status VARCHAR(20) DEFAULT 'ouverte' 
        CHECK (status IN ('ouverte', 'en_cours', 'justifiee', 'cloturee', 'rejetee')),
    justification_status VARCHAR(20) DEFAULT 'sans_justificatif'
        CHECK (justification_status IN ('sans_justificatif', 'demandee', 'recue', 'validee', 'rejetee')),
    
    -- Dates
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_to INTEGER REFERENCES audit_management.users(id),
    due_date DATE, -- Date butoir de traitement
    closed_at TIMESTAMP,
    
    -- Score et risque
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    risk_level VARCHAR(20) CHECK (risk_level IN ('faible', 'moyen', 'critique')),
    
    -- Métadonnées
    detection_version VARCHAR(10) DEFAULT '1.0',
    is_false_positive BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. TABLE HISTORIQUE DE TRAITEMENT
-- ============================================
CREATE TABLE audit_management.anomaly_history (
    id SERIAL PRIMARY KEY,
    anomaly_id INTEGER REFERENCES audit_management.anomalies(id) ON DELETE CASCADE,
    
    action_type VARCHAR(50) NOT NULL, -- 'creation', 'assignation', 'commentaire', 'changement_statut', 'justificatif_ajoute', 'cloture'
    action_by INTEGER REFERENCES audit_management.users(id),
    action_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    
    comment TEXT,
    attachment_path VARCHAR(500), -- Chemin vers fichier justificatif
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. TABLE JUSTIFICATIFS
-- ============================================
CREATE TABLE audit_management.attachments (
    id SERIAL PRIMARY KEY,
    anomaly_id INTEGER REFERENCES audit_management.anomalies(id) ON DELETE CASCADE,
    
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50), -- 'pdf', 'jpg', 'png', 'xlsx', etc.
    file_size_bytes INTEGER,
    
    uploaded_by INTEGER REFERENCES audit_management.users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    description TEXT,
    is_valid BOOLEAN -- Validation du justificatif par l'auditeur
);

-- ============================================
-- 5. TABLE SEUILS CONFIGURABLES
-- ============================================
CREATE TABLE audit_management.thresholds (
    id SERIAL PRIMARY KEY,
    module VARCHAR(50) NOT NULL, -- 'global' ou nom du module
    
    threshold_name VARCHAR(50) NOT NULL, -- 'high_amount', 'delay_days', etc.
    threshold_value NUMERIC(18,2) NOT NULL,
    unit VARCHAR(20), -- 'FCFA', 'days', 'percent'
    
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    
    created_by INTEGER REFERENCES audit_management.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(module, threshold_name)
);

-- ============================================
-- 6. TABLE JOURNAL DES CONNEXIONS (Audit trail)
-- ============================================
CREATE TABLE audit_management.audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES audit_management.users(id),
    action VARCHAR(50) NOT NULL, -- 'login', 'logout', 'view_record', 'update_anomaly', etc.
    
    ip_address INET,
    user_agent TEXT,
    
    resource_type VARCHAR(50), -- 'anomaly', 'user', 'report'
    resource_id VARCHAR(100),
    
    details JSONB, -- Stockage flexible des détails
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES POUR PERFORMANCE
-- ============================================
CREATE INDEX idx_anomalies_status ON audit_management.anomalies(status);
CREATE INDEX idx_anomalies_severity ON audit_management.anomalies(severity);
CREATE INDEX idx_anomalies_module ON audit_management.anomalies(module);
CREATE INDEX idx_anomalies_assigned ON audit_management.anomalies(assigned_to);
CREATE INDEX idx_anomalies_detected ON audit_management.anomalies(detected_at);
CREATE INDEX idx_anomalies_type ON audit_management.anomalies(anomaly_type);
CREATE INDEX idx_anomalies_source_lookup ON audit_management.anomalies(source_schema, source_record_id);
CREATE INDEX idx_history_anomaly ON audit_management.anomaly_history(anomaly_id);
CREATE INDEX idx_audit_log_user ON audit_management.audit_log(user_id);
CREATE INDEX idx_audit_log_date ON audit_management.audit_log(created_at);

-- ============================================
-- DONNÉES INITIALES
-- ============================================

-- Utilisateurs par défaut (password: 'Admin@2026' hashé avec bcrypt)
INSERT INTO audit_management.users (username, email, password_hash, full_name, role) VALUES
('admin', 'admin@multiprint.com', '$2b$10$YourHashedPasswordHere', 'Administrateur Système', 'Administrateur'),
('auditeur', 'audit@multiprint.com', '$2b$10$YourHashedPasswordHere', 'Auditeur Financier', 'Auditeur'),
('comptable', 'compta@multiprint.com', '$2b$10$YourHashedPasswordHere', 'Comptable', 'Comptable');

-- Seuils par défaut
INSERT INTO audit_management.thresholds (module, threshold_name, threshold_value, unit, description) VALUES
('global', 'high_amount', 5000000, 'FCFA', 'Montant élevé (5M FCFA)'),
('global', 'very_high_amount', 10000000, 'FCFA', 'Montant très élevé (10M FCFA)'),
('global', 'delay_days', 30, 'days', 'Délai de paiement dépassé'),
('global', 'critical_delay', 90, 'days', 'Délai critique de paiement'),
('global', 'cash_limit', 500000, 'FCFA', 'Limite caisse/espèces'),
('global', 'vat_tolerance', 2, 'percent', 'Tolérance TVA (%)');

-- ============================================
-- VUES PRATIQUES
-- ============================================

-- Vue: Anomalies à traiter (non clôturées)
CREATE VIEW audit_management.v_anomalies_open AS
SELECT 
    a.*,
    u.full_name as assigned_to_name,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - a.detected_at) as days_open
FROM audit_management.anomalies a
LEFT JOIN audit_management.users u ON a.assigned_to = u.id
WHERE a.status NOT IN ('cloturee', 'rejetee');

-- Vue: Statistiques par module
CREATE VIEW audit_management.v_stats_by_module AS
SELECT 
    module,
    module_name,
    COUNT(*) as total_anomalies,
    COUNT(*) FILTER (WHERE status = 'ouverte') as open_count,
    COUNT(*) FILTER (WHERE severity = 'critique') as critical_count,
    COUNT(*) FILTER (WHERE severity = 'majeur') as major_count,
    SUM(amount) as total_amount
FROM audit_management.anomalies
GROUP BY module, module_name;

-- ============================================
-- FONCTIONS UTILES
-- ============================================

-- Fonction pour générer l'ID d'anomalie (ANOM-XXXXX)
CREATE OR REPLACE FUNCTION audit_management.generate_anomaly_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.anomaly_id := 'ANOM-' || LPAD(NEW.id::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour générer l'ID automatiquement
CREATE TRIGGER trigger_generate_anomaly_id
    BEFORE INSERT ON audit_management.anomalies
    FOR EACH ROW
    EXECUTE FUNCTION audit_management.generate_anomaly_id();

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION audit_management.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON audit_management.users 
    FOR EACH ROW EXECUTE FUNCTION audit_management.update_updated_at_column();
CREATE TRIGGER update_anomalies_updated_at BEFORE UPDATE ON audit_management.anomalies 
    FOR EACH ROW EXECUTE FUNCTION audit_management.update_updated_at_column();
CREATE TRIGGER update_thresholds_updated_at BEFORE UPDATE ON audit_management.thresholds 
    FOR EACH ROW EXECUTE FUNCTION audit_management.update_updated_at_column();

-- ============================================
-- COMMENTAIRES
-- ============================================
COMMENT ON TABLE audit_management.users IS 'Utilisateurs de l''application d''audit';
COMMENT ON TABLE audit_management.anomalies IS 'Anomalies détectées par l''analyse automatique';
COMMENT ON TABLE audit_management.anomaly_history IS 'Historique des actions sur chaque anomalie';
COMMENT ON TABLE audit_management.attachments IS 'Justificatifs associés aux anomalies';
COMMENT ON TABLE audit_management.thresholds IS 'Seuils configurables pour la détection d''anomalies';
COMMENT ON TABLE audit_management.audit_log IS 'Journal d''audit des actions utilisateurs';
