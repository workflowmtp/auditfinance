-- ============================================
-- INITIALISATION COMPLÈTE DE LA BASE AUDIT
-- Exécuter ce script dans pgAdmin
-- ============================================

-- 1. Créer le schéma
CREATE SCHEMA IF NOT EXISTS audit_management;

-- 2. Table utilisateurs
CREATE TABLE IF NOT EXISTS audit_management.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Auditeur' 
        CHECK (role IN ('Administrateur', 'Auditeur', 'Comptable', 'Lecteur')),
    department VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table anomalies
CREATE TABLE IF NOT EXISTS audit_management.anomalies (
    id SERIAL PRIMARY KEY,
    anomaly_id VARCHAR(20) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    module_name VARCHAR(100),
    source_schema VARCHAR(50),
    source_table VARCHAR(100),
    source_record_id VARCHAR(255),
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critique', 'majeur', 'mineur')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    affected_field VARCHAR(100),
    suggestion TEXT,
    amount NUMERIC(18,2),
    amount_currency VARCHAR(3) DEFAULT 'XOF',
    reference_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ouverte'
        CHECK (status IN ('ouverte', 'en_cours', 'justifiee', 'cloturee', 'rejetee')),
    justification_status VARCHAR(20) DEFAULT 'sans_justificatif'
        CHECK (justification_status IN ('sans_justificatif', 'demandee', 'recue', 'validee', 'rejetee')),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_to INTEGER REFERENCES audit_management.users(id),
    due_date DATE,
    closed_at TIMESTAMP,
    risk_score INTEGER,
    risk_level VARCHAR(20),
    is_false_positive BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table historique
CREATE TABLE IF NOT EXISTS audit_management.anomaly_history (
    id SERIAL PRIMARY KEY,
    anomaly_id INTEGER REFERENCES audit_management.anomalies(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_by INTEGER REFERENCES audit_management.users(id),
    action_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    comment TEXT,
    attachment_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table pièces jointes
CREATE TABLE IF NOT EXISTS audit_management.attachments (
    id SERIAL PRIMARY KEY,
    anomaly_id INTEGER REFERENCES audit_management.anomalies(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size_bytes INTEGER,
    uploaded_by INTEGER REFERENCES audit_management.users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    is_valid BOOLEAN
);

-- 6. Table seuils
CREATE TABLE IF NOT EXISTS audit_management.thresholds (
    id SERIAL PRIMARY KEY,
    module VARCHAR(50) NOT NULL,
    threshold_name VARCHAR(50) NOT NULL,
    threshold_value NUMERIC(18,2) NOT NULL,
    unit VARCHAR(20),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES audit_management.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module, threshold_name)
);

-- 7. Table audit log
CREATE TABLE IF NOT EXISTS audit_management.audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES audit_management.users(id),
    action VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger pour générer l'ID d'anomalie
CREATE OR REPLACE FUNCTION audit_management.generate_anomaly_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.anomaly_id := 'ANOM-' || LPAD(NEW.id::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_anomaly_id ON audit_management.anomalies;
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
DROP TRIGGER IF EXISTS update_users_updated_at ON audit_management.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON audit_management.users 
    FOR EACH ROW EXECUTE FUNCTION audit_management.update_updated_at_column();

DROP TRIGGER IF EXISTS update_anomalies_updated_at ON audit_management.anomalies;
CREATE TRIGGER update_anomalies_updated_at BEFORE UPDATE ON audit_management.anomalies 
    FOR EACH ROW EXECUTE FUNCTION audit_management.update_updated_at_column();

DROP TRIGGER IF EXISTS update_thresholds_updated_at ON audit_management.thresholds;
CREATE TRIGGER update_thresholds_updated_at BEFORE UPDATE ON audit_management.thresholds 
    FOR EACH ROW EXECUTE FUNCTION audit_management.update_updated_at_column();

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON audit_management.anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON audit_management.anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_module ON audit_management.anomalies(module);
CREATE INDEX IF NOT EXISTS idx_anomalies_assigned ON audit_management.anomalies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_anomalies_detected ON audit_management.anomalies(detected_at);
CREATE INDEX IF NOT EXISTS idx_history_anomaly ON audit_management.anomaly_history(anomaly_id);

-- Données initiales
INSERT INTO audit_management.users (username, email, password_hash, full_name, role) VALUES
('admin', 'admin@multiprint.com', '$2b$10$placeholder', 'Administrateur Système', 'Administrateur'),
('auditeur', 'audit@multiprint.com', '$2b$10$placeholder', 'Auditeur Financier', 'Auditeur'),
('comptable', 'compta@multiprint.com', '$2b$10$placeholder', 'Comptable', 'Comptable')
ON CONFLICT (username) DO NOTHING;

INSERT INTO audit_management.thresholds (module, threshold_name, threshold_value, unit, description) VALUES
('global', 'high_amount', 5000000, 'FCFA', 'Montant élevé (5M FCFA)'),
('global', 'very_high_amount', 10000000, 'FCFA', 'Montant très élevé (10M FCFA)'),
('global', 'delay_days', 30, 'days', 'Délai de paiement dépassé'),
('global', 'critical_delay', 90, 'days', 'Délai critique de paiement'),
('global', 'cash_limit', 500000, 'FCFA', 'Limite caisse/espèces'),
('global', 'vat_tolerance', 2, 'percent', 'Tolérance TVA (%)')
ON CONFLICT (module, threshold_name) DO NOTHING;

-- Vérification
SELECT 'Tables créées avec succès' as status;
SELECT COUNT(*) as nb_users FROM audit_management.users;
SELECT COUNT(*) as nb_thresholds FROM audit_management.thresholds;
