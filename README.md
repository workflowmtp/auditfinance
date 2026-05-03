# FinanceAudit IA V1 — Version Next.js + PostgreSQL analytics

Cette version transforme l’application HTML FinanceAudit IA V1 en application Next.js connectable à une base PostgreSQL distante.

## 1. Installation

```bash
npm install
```

## 2. Configuration

Copier `.env.example` vers `.env.local` :

```bash
cp .env.example .env.local
```

Puis renseigner :

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require"
DB_SCHEMA="analytics"
PGSSL="true"
DEFAULT_LIMIT="200"
```

## 3. Lancement local

```bash
npm run dev
```

Ouvrir :

```text
http://localhost:3000
```

## 4. Vérification connexion PostgreSQL

```text
http://localhost:3000/api/health
```

Si la connexion est correcte, la réponse contient :

```json
{ "ok": true, "database": "connected" }
```

## 5. Architecture

```text
src/app/page.tsx                Interface principale
src/app/api/health/route.ts      Test connexion PostgreSQL
src/app/api/schema/route.ts      Lecture information_schema du schéma analytics
src/app/api/records/route.ts     Lecture des lignes par rubrique
src/app/api/dashboard/route.ts   Statistiques dashboard
src/app/api/audit/route.ts       Analyse d’enregistrements
src/lib/db.ts                    Pool PostgreSQL pg
src/lib/modules.ts               Mapping rubriques -> tables analytics
src/lib/audit.ts                 Règles d’analyse et statut par enregistrement
```

## 6. Rubriques connectées V1

- Écritures comptables -> `analytics.sage_accounting_entries`
- Factures fournisseurs -> `analytics.sage_supplier_invoices`
- Factures clients -> `analytics.sage_customer_invoices`
- Paiements -> `analytics.sage_supplier_payments`
- Banque & caisse -> `analytics.sage_bank_movements`
- Justificatifs -> `analytics.drive_documents_index`
- Piste d’audit -> `analytics.sage_audit_trail`

Les autres rubriques sont conservées dans l’interface et prêtes à être enrichies.

## 7. Déploiement Vercel

Ajouter les variables dans Vercel > Project Settings > Environment Variables :

- `DATABASE_URL`
- `DB_SCHEMA`
- `PGSSL`
- `DEFAULT_LIMIT`

Puis déployer.

## 8. Sécurité SQL

Les routes API utilisent un mapping de tables autorisées dans `src/lib/modules.ts`. L’utilisateur ne peut pas envoyer directement un nom de table arbitraire dans les requêtes SQL.

## 9. Système de gestion des anomalies

### 9.1 Initialisation de la base

Exécuter dans pgAdmin le script d'initialisation :

```sql
-- Ouvrir scripts/init-audit-db.sql dans pgAdmin et exécuter
```

Cela crée :
- Le schéma `audit_management`
- Les tables : `users`, `anomalies`, `anomaly_history`, `attachments`, `thresholds`, `audit_log`
- Les triggers pour générer les IDs et mettre à jour les dates
- 3 utilisateurs de test (admin, auditeur, comptable)

### 9.2 Données de test

Pour insérer des anomalies de test :

```sql
-- Ouvrir scripts/seed-anomalies.sql dans pgAdmin et exécuter
```

### 9.3 Synchronisation automatique

Les anomalies sont automatiquement synchronisées vers `audit_management.anomalies` quand on charge des données via `/api/records`.

### 9.4 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/anomalies` | Liste avec filtres |
| `GET /api/anomalies/:id` | Détail d'une anomalie |
| `POST /api/anomalies/:id/status` | Changer le statut |
| `POST /api/anomalies/:id/assign` | Assigner à un utilisateur |
| `GET /api/anomalies/:id/history` | Historique des actions |
| `GET /api/anomalies/stats` | Statistiques globales |
| `GET /api/users` | Liste des utilisateurs |

### 9.5 Fichiers du système

```
src/lib/audit-db.ts              # CRUD et synchronisation
src/app/api/anomalies/           # Routes API anomalies
scripts/init-audit-db.sql        # Création des tables
scripts/seed-anomalies.sql       # Données de test
docs/api-anomalies.md            # Documentation API
