# API Documentation - Gestion des Anomalies

## Base URL
Toutes les routes commencent par `/api/`

---

## Anomalies

### Liste des anomalies
```http
GET /api/anomalies
```

**Query Parameters:**
| Paramètre | Type | Description |
|-----------|------|-------------|
| status | string | Filtrer par statut (ouverte, en_cours, justifiee, cloturee) |
| severity | string | Filtrer par sévérité (critique, majeur, mineur) |
| module | string | Filtrer par module |
| limit | number | Nombre de résultats (max 1000) |
| offset | number | Pagination offset |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "anomalyId": "ANOM-00001",
      "module": "supplierInvoices",
      "severity": "critique",
      "title": "Montant très élevé",
      "status": "ouverte",
      "amount": 15000000
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0,
    "totalPages": 1
  }
}
```

### Créer une anomalie manuellement
```http
POST /api/anomalies
```

**Body:**
```json
{
  "module": "supplierInvoices",
  "anomalyType": "montant_anormal",
  "severity": "critique",
  "title": "Montant élevé",
  "description": "Description détaillée",
  "amount": 10000000,
  "referenceNumber": "FAC-001"
}
```

### Synchronisation automatique
```http
POST /api/anomalies/sync
```

Synchronise les anomalies détectées par l'analyse automatique vers la base de données.

---

## Statistiques

### Stats globales
```http
GET /api/anomalies/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "byStatus": { "ouverte": 80, "en_cours": 45, "cloturee": 25 },
    "bySeverity": { "critique": 20, "majeur": 50, "mineur": 80 },
    "byModule": { "supplierInvoices": 60, ... }
  }
}
```

---

## Actions sur une anomalie

### Détail d'une anomalie
```http
GET /api/anomalies/:id
```

### Mise à jour (assignation, statut)
```http
PATCH /api/anomalies/:id
```

**Body:**
```json
{
  "status": "en_cours",
  "assignedTo": 2,
  "userId": 1
}
```

### Changer le statut
```http
POST /api/anomalies/:id/status
```

**Body:**
```json
{
  "status": "justifiee",
  "comment": "Pièce justificative reçue",
  "userId": 1
}
```

### Assigner à un utilisateur
```http
POST /api/anomalies/:id/assign
```

**Body:**
```json
{
  "assignedTo": 2,
  "userId": 1
}
```

### Historique
```http
GET /api/anomalies/:id/history
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "action_type": "changement_statut",
      "action_at": "2024-01-15T10:30:00Z",
      "old_status": "ouverte",
      "new_status": "en_cours",
      "user_name": "Jean Dupont"
    }
  ]
}
```

---

## Utilisateurs

### Liste des utilisateurs
```http
GET /api/users
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "fullName": "Administrateur",
      "role": "Administrateur"
    }
  ]
}
```

---

## Synchronisation automatique

La synchronisation se fait automatiquement quand on charge des données via `/api/records`.

Les anomalies sont détectées par l'analyse automatique et stockées dans `audit_management.anomalies`.

Pour forcer une synchronisation manuelle:
```http
POST /api/anomalies/sync
Content-Type: application/json

{
  "module": "supplierInvoices",
  "records": [...],
  "sourceTable": "sage_supplier_invoices"
}
```
