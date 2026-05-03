# Base de données de gestion des anomalies

## Tables créées

### 1. `audit_management.users`
| Champ | Type | Description |
|-------|------|-------------|
| id | SERIAL | Clé primaire |
| username | VARCHAR(50) | Nom d'utilisateur unique |
| email | VARCHAR(100) | Email unique |
| password_hash | VARCHAR(255) | Hash bcrypt du mot de passe |
| full_name | VARCHAR(100) | Nom complet |
| role | VARCHAR(20) | Administrateur / Auditeur / Comptable / Lecteur |
| department | VARCHAR(50) | Département |
| is_active | BOOLEAN | Actif ou non |
| last_login_at | TIMESTAMP | Dernière connexion |
| created_at / updated_at | TIMESTAMP | Dates de création/modification |

### 2. `audit_management.anomalies` (TABLE PRINCIPALE)
| Champ | Type | Description |
|-------|------|-------------|
| id | SERIAL | Clé primaire |
| **anomaly_id** | VARCHAR(20) | ID unique affiché (ex: ANOM-00001) |
| module | VARCHAR(50) | Module concerné (ex: 'supplierInvoices') |
| module_name | VARCHAR(100) | Nom lisible du module |
| source_schema | VARCHAR(50) | Schéma source ('raw', 'analytics') |
| source_table | VARCHAR(100) | Table source |
| source_record_id | VARCHAR(255) | ID de l'enregistrement dans la table source |
| **anomaly_type** | VARCHAR(50) | Type: montant_anormal, echeance_depassee, tva_anormale, etc. |
| **severity** | VARCHAR(20) | **critique** / **majeur** / **mineur** |
| title | VARCHAR(255) | Titre court de l'anomalie |
| **description** | TEXT | Description détaillée |
| affected_field | VARCHAR(100) | Champ concerné (ex: 'total_amount') |
| **suggestion** | TEXT | Action suggérée |
| amount | NUMERIC | Montant concerné |
| amount_currency | VARCHAR(3) | Devise (XOF) |
| reference_number | VARCHAR(100) | Numéro de facture/pièce |
| **status** | VARCHAR(20) | **ouverte** / en_cours / justifiee / cloturee / rejetee |
| **justification_status** | VARCHAR(20) | sans_justificatif / demandee / recue / validee / rejetee |
| detected_at | TIMESTAMP | Date de détection |
| assigned_to | INTEGER | Utilisateur assigné (FK) |
| due_date | DATE | Date butoir de traitement |
| closed_at | TIMESTAMP | Date de clôture |
| risk_score | INTEGER | Score 0-100 |
| risk_level | VARCHAR(20) | faible / moyen / critique |

### 3. `audit_management.anomaly_history`
| Champ | Type | Description |
|-------|------|-------------|
| id | SERIAL | Clé primaire |
| anomaly_id | INTEGER | FK vers anomalies |
| action_type | VARCHAR(50) | Type d'action: creation, assignation, commentaire, changement_statut, justificatif_ajoute, cloture |
| action_by | INTEGER | Utilisateur (FK) |
| action_at | TIMESTAMP | Date de l'action |
| old_status / new_status | VARCHAR | Statuts avant/après |
| comment | TEXT | Commentaire |
| attachment_path | VARCHAR(500) | Chemin du fichier |

### 4. `audit_management.attachments`
| Champ | Type | Description |
|-------|------|-------------|
| id | SERIAL | Clé primaire |
| anomaly_id | INTEGER | FK |
| file_name | VARCHAR(255) | Nom du fichier |
| file_path | VARCHAR(500) | Chemin de stockage |
| file_type | VARCHAR(50) | pdf, jpg, xlsx... |
| file_size_bytes | INTEGER | Taille |
| uploaded_by | INTEGER | FK utilisateur |
| description | TEXT | Description |
| is_valid | BOOLEAN | Validé ou non |

### 5. `audit_management.thresholds`
| Champ | Type | Description |
|-------|------|-------------|
| id | SERIAL | Clé primaire |
| module | VARCHAR(50) | Module ou 'global' |
| threshold_name | VARCHAR(50) | Nom du seuil |
| threshold_value | NUMERIC | Valeur du seuil |
| unit | VARCHAR(20) | FCFA, days, percent |
| description | TEXT | Description |
| is_active | BOOLEAN | Actif ou non |

### 6. `audit_management.audit_log`
| Champ | Type | Description |
|-------|------|-------------|
| id | SERIAL | Clé primaire |
| user_id | INTEGER | FK |
| action | VARCHAR(50) | login, logout, view_record, update_anomaly... |
| ip_address | INET | IP |
| resource_type | VARCHAR | Type de ressource |
| resource_id | VARCHAR | ID ressource |
| details | JSONB | Détails flexibles en JSON |

## Vues créées

- `v_anomalies_open` : Anomalies non clôturées avec nombre de jours ouverts
- `v_stats_by_module` : Statistiques par module

## Commandes SQL utiles

```sql
-- Lister les anomalies critiques non traitées
SELECT * FROM audit_management.v_anomalies_open 
WHERE severity = 'critique' 
ORDER BY detected_at;

-- Statistiques globales
SELECT * FROM audit_management.v_stats_by_module;

-- Anomalies assignées à un utilisateur
SELECT a.*, u.full_name 
FROM audit_management.anomalies a
JOIN audit_management.users u ON a.assigned_to = u.id
WHERE a.assigned_to = 1;

-- Historique d'une anomalie
SELECT h.*, u.full_name as done_by
FROM audit_management.anomaly_history h
JOIN audit_management.users u ON h.action_by = u.id
WHERE h.anomaly_id = 1
ORDER BY h.action_at DESC;

-- Nombre d'anomalies par statut et sévérité
SELECT 
    status, severity, COUNT(*) 
FROM audit_management.anomalies 
GROUP BY status, severity;
```

## Types d'anomalies possibles (anomaly_type)

| Type | Description |
|------|-------------|
| montant_anormal | Montant dépasse le seuil |
| echeance_depassee | Date d'échéance dépassée |
| date_incoherente | Date logique incohérente |
| tva_anormale | TVA calculée ≠ déclarée |
| reference_manquante | Numéro de référence vide |
| sens_incorrect | Débit ET crédit sur même ligne |
| tiers_non_reference | Fournisseur/Client non identifié |
| montant_negatif | Montant négatif |
| doublon_detecte | Possible doublon |
| montant_espece_eleve | Montant espèces élevé |
| soldes_tresorerie | Solde caisse/banque anormal |
| taux_tva_incorrect | Taux TVA non standard |
| montant_zero | Montant à zéro |
