// ============================================
// GESTION DES ANOMALIES SANS PRISMA
// Utilise pg (déjà installé) pour accéder à audit_management
// ============================================

import { query } from './db';

// Types
export interface AnomalyRecord {
  id: number;
  anomalyId: string;
  module: string;
  moduleName: string | null;
  sourceSchema: string | null;
  sourceTable: string | null;
  sourceRecordId: string | null;
  anomalyType: string;
  severity: 'critique' | 'majeur' | 'mineur';
  title: string;
  description: string;
  affectedField: string | null;
  suggestion: string | null;
  amount: number | null;
  amountCurrency: string;
  referenceNumber: string | null;
  status: 'ouverte' | 'en_cours' | 'justifiee' | 'cloturee' | 'rejetee';
  justificationStatus: 'sans_justificatif' | 'demandee' | 'recue' | 'validee' | 'rejetee';
  detectedAt: Date;
  assignedTo: number | null;
  dueDate: Date | null;
  closedAt: Date | null;
  riskScore: number | null;
  riskLevel: 'faible' | 'moyen' | 'critique' | null;
  isFalsePositive: boolean;
  assignedUserName?: string | null;
}

// Type pour la création (sans les champs auto-générés)
export interface CreateAnomalyInput {
  module: string;
  moduleName: string | null;
  sourceSchema: string | null;
  sourceTable: string | null;
  sourceRecordId: string | null;
  anomalyType: string;
  severity: 'critique' | 'majeur' | 'mineur';
  title: string;
  description: string;
  affectedField: string | null;
  suggestion: string | null;
  amount: number | null;
  amountCurrency: string;
  referenceNumber: string | null;
  status: 'ouverte' | 'en_cours' | 'justifiee' | 'cloturee' | 'rejetee';
  justificationStatus: 'sans_justificatif' | 'demandee' | 'recue' | 'validee' | 'rejetee';
  assignedTo: number | null;
  dueDate: Date | null;
  riskScore: number | null;
  riskLevel: 'faible' | 'moyen' | 'critique' | null;
  isFalsePositive: boolean;
}

export interface AnomalyHistoryRecord {
  id: number;
  anomalyId: number;
  actionType: string;
  actionBy: number | null;
  actionAt: Date;
  oldStatus: string | null;
  newStatus: string | null;
  comment: string | null;
  userName?: string | null;
}

export interface UserRecord {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: 'Administrateur' | 'Auditeur' | 'Comptable' | 'Lecteur';
  department: string | null;
  isActive: boolean;
}

// ============================================
// CRUD ANOMALIES
// ============================================

export async function createAnomaly(data: CreateAnomalyInput): Promise<AnomalyRecord> {
  const sql = `
    INSERT INTO audit_management.anomalies (
      module, module_name, source_schema, source_table, source_record_id,
      anomaly_type, severity, title, description, affected_field, suggestion,
      amount, amount_currency, reference_number, status, justification_status,
      assigned_to, due_date, risk_score, risk_level, is_false_positive
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *
  `;
  const params = [
    data.module, data.moduleName, data.sourceSchema, data.sourceTable, data.sourceRecordId,
    data.anomalyType, data.severity, data.title, data.description, data.affectedField, data.suggestion,
    data.amount, data.amountCurrency, data.referenceNumber, data.status, data.justificationStatus,
    data.assignedTo, data.dueDate, data.riskScore, data.riskLevel, data.isFalsePositive
  ];
  const result = await query(sql, params);
  return result.rows[0] as AnomalyRecord;
}

export async function getAnomalyById(id: number): Promise<AnomalyRecord | null> {
  const sql = `
    SELECT a.*, u.full_name as assigned_user_name
    FROM audit_management.anomalies a
    LEFT JOIN audit_management.users u ON a.assigned_to = u.id
    WHERE a.id = $1
  `;
  const result = await query(sql, [id]);
  return result.rows[0] as AnomalyRecord || null;
}

export async function getAnomalies(filters?: {
  status?: string;
  severity?: string;
  module?: string;
  assignedTo?: number;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AnomalyRecord[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    where.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters?.severity) {
    where.push(`severity = $${paramIndex++}`);
    params.push(filters.severity);
  }
  if (filters?.module) {
    where.push(`module = $${paramIndex++}`);
    params.push(filters.module);
  }
  if (filters?.assignedTo) {
    where.push(`assigned_to = $${paramIndex++}`);
    params.push(filters.assignedTo);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  
  // Count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM audit_management.anomalies ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total as string);

  // Data
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  const dataSql = `
    SELECT a.*, u.full_name as assigned_user_name
    FROM audit_management.anomalies a
    LEFT JOIN audit_management.users u ON a.assigned_to = u.id
    ${whereClause}
    ORDER BY a.detected_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  params.push(limit, offset);
  
  const dataResult = await query(dataSql, params);
  return { rows: dataResult.rows as AnomalyRecord[], total };
}

export async function updateAnomalyStatus(
  id: number, 
  newStatus: string, 
  userId: number,
  comment?: string
): Promise<void> {
  // Get current status
  const current = await query('SELECT status FROM audit_management.anomalies WHERE id = $1', [id]);
  const oldStatus = current.rows[0]?.status as string;

  // Update anomaly
  await query(
    'UPDATE audit_management.anomalies SET status = $1, updated_at = NOW() WHERE id = $2',
    [newStatus, id]
  );

  // Add history
  await query(
    `INSERT INTO audit_management.anomaly_history (anomaly_id, action_type, action_by, old_status, new_status, comment)
     VALUES ($1, 'changement_statut', $2, $3, $4, $5)`,
    [id, userId, oldStatus, newStatus, comment || null]
  );
}

export async function assignAnomaly(id: number, assignedTo: number, assignedBy: number): Promise<void> {
  await query(
    'UPDATE audit_management.anomalies SET assigned_to = $1, updated_at = NOW() WHERE id = $2',
    [assignedTo, id]
  );
  await query(
    `INSERT INTO audit_management.anomaly_history (anomaly_id, action_type, action_by, comment)
     VALUES ($1, 'assignation', $2, $3)`,
    [id, assignedBy, `Assigné à l'utilisateur ${assignedTo}`]
  );
}

// ============================================
// USERS
// ============================================

export async function getUsers(): Promise<UserRecord[]> {
  const result = await query(
    'SELECT id, username, email, full_name, role, department, is_active FROM audit_management.users WHERE is_active = true'
  );
  return result.rows as UserRecord[];
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const result = await query(
    'SELECT id, username, email, full_name, role, department, is_active FROM audit_management.users WHERE username = $1',
    [username]
  );
  return result.rows[0] as UserRecord || null;
}

// ============================================
// STATISTIQUES
// ============================================

export async function getAnomalyStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byModule: Record<string, number>;
}> {
  const totalResult = await query('SELECT COUNT(*) as count FROM audit_management.anomalies');
  
  const byStatusResult = await query(`
    SELECT status, COUNT(*) as count 
    FROM audit_management.anomalies 
    GROUP BY status
  `);
  
  const bySeverityResult = await query(`
    SELECT severity, COUNT(*) as count 
    FROM audit_management.anomalies 
    GROUP BY severity
  `);
  
  const byModuleResult = await query(`
    SELECT module, COUNT(*) as count 
    FROM audit_management.anomalies 
    GROUP BY module
  `);

  return {
    total: parseInt(totalResult.rows[0]?.count as string || '0'),
    byStatus: Object.fromEntries(byStatusResult.rows.map(r => [r.status, parseInt(r.count as string)])),
    bySeverity: Object.fromEntries(bySeverityResult.rows.map(r => [r.severity, parseInt(r.count as string)])),
    byModule: Object.fromEntries(byModuleResult.rows.map(r => [r.module, parseInt(r.count as string)]))
  };
}

// ============================================
// SYNCHRONISATION: Enregistrer anomalies détectées
// ============================================

export async function syncAnomaliesFromAnalysis(
  moduleId: string,
  records: Array<{
    recordId: string;
    audit: {
      anomalies?: Array<{
        type: string;
        severity: 'critique' | 'majeur' | 'mineur';
        message: string;
        field?: string;
        suggestion: string;
      }>;
      score: number;
      risk: string;
    };
    data: Record<string, unknown>;
  }>,
  sourceTable: string,
  sourceSchema: string = 'raw'
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const record of records) {
    if (!record.audit.anomalies || record.audit.anomalies.length === 0) continue;

    for (const anomaly of record.audit.anomalies) {
      // Vérifier si déjà existante
      const existing = await query(
        `SELECT id FROM audit_management.anomalies 
         WHERE source_record_id = $1 AND anomaly_type = $2 AND module = $3`,
        [record.recordId, anomaly.type, moduleId]
      );

      const title = `${anomaly.type.replace(/_/g, ' ').toUpperCase()} - ${record.data.reference_number || record.recordId}`;
      const amount = record.data.total_amount || record.data.amount_ttc || record.data.payment_amount || null;

      if (existing.rows.length === 0) {
        // Créer nouvelle anomalie
        await createAnomaly({
          module: moduleId,
          moduleName: moduleId,
          sourceSchema,
          sourceTable,
          sourceRecordId: record.recordId,
          anomalyType: anomaly.type,
          severity: anomaly.severity,
          title,
          description: anomaly.message,
          affectedField: anomaly.field || null,
          suggestion: anomaly.suggestion,
          amount: amount as number | null,
          amountCurrency: 'XOF',
          referenceNumber: (record.data.reference_number || record.data.invoice_number || record.data.payment_reference) as string | null,
          status: 'ouverte',
          justificationStatus: 'sans_justificatif',
          assignedTo: null,
          dueDate: null,
          riskScore: record.audit.score,
          riskLevel: record.audit.risk as 'faible' | 'moyen' | 'critique',
          isFalsePositive: false
        });
        created++;
      } else {
        // Mettre à jour si changement de sévérité
        await query(
          `UPDATE audit_management.anomalies 
           SET severity = $1, risk_score = $2, risk_level = $3, updated_at = NOW()
           WHERE id = $4`,
          [anomaly.severity, record.audit.score, record.audit.risk, existing.rows[0].id]
        );
        updated++;
      }
    }
  }

  return { created, updated };
}
