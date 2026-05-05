// ============================================
// records-with-anomalies.ts
// LEFT JOIN LATERAL entre tables source et audit_management.anomalies
// Les anomalies proviennent désormais UNIQUEMENT de la base de données
// (alimentées par un agent IA externe n8n).
// ============================================

// Index recommandé (à exécuter une fois sur la base) :
// CREATE INDEX idx_anomalies_source_lookup
//   ON audit_management.anomalies (source_schema, source_table, source_record_id, status);

import { query, quoteIdent } from './db';
import type { AuditResult } from './audit';

export type DbAnomaly = {
  id: number;
  type: string;
  severity: 'critique' | 'majeur' | 'mineur';
  message: string;
  field?: string;
  suggestion?: string;
  status?: string;
  title?: string;
};

export type RecordWithAnomalies = Record<string, unknown> & {
  anomalies: DbAnomaly[];
  anomalies_count: number;
  max_severity: string | null;
};

export interface GetRecordsOptions {
  schema: string;
  table: string;
  moduleId: string;
  columns: string[];
  where?: string[];
  params?: unknown[];
  orderCol?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  statusFilter?: string;
  riskFilter?: string;
}

/** Mapping explicite module → expression SQL pour source_record_id */
export function getSourceRecordIdExpr(moduleId: string, alias = 's'): string {
  switch (moduleId) {
    case 'supplierInvoices':
      return `${alias}."invoice_number"::text`;
    case 'entries':
      return `${alias}."entry_line_id"::text`;
    case 'suppliers':
      return `${alias}."supplier_code"::text`;
    case 'suspenseAccounts':
      return `${alias}."account_code"::text`;
    case 'supplierBankAccounts':
      return `(${alias}."supplier_code" || ':' || ${alias}."rib_identifier")::text`;
    case 'orders':
      return `${alias}."po_number"::text`;
    case 'receipts':
      return `${alias}."id"::text`;
    case 'customerInvoices':
      return `${alias}."invoice_number"::text`;
    case 'payments':
      return `${alias}."payment_number"::text`;
    case 'bankCash':
      return `${alias}."bank_movement_id"::text`;
    case 'cashAccounts':
      return `${alias}."cash_account_code"::text`;
    case 'advances':
      return `${alias}."advance_id"::text`;
    case 'taxDeclarations':
      return `${alias}."tax_account_code"::text`;
    case 'taxEntries':
      return `${alias}."tax_entry_id"::text`;
    case 'bankAccounts':
      return `${alias}."bank_account_code"::text`;
    case 'purchaseRequests':
      return `${alias}."pr_number"::text`;
    case 'chartOfAccounts':
      return `${alias}."account_code"::text`;
    case 'categories':
      return `${alias}."code"::text`;
    case 'users':
      return `${alias}."user_code"::text`;
    case 'justifications':
      return `${alias}."document_id"::text`;
    case 'auditTrail':
      return `${alias}."audit_id"::text`;
    default:
      // Fallback sur id ou première colonne possible
      return `${alias}."id"::text`;
  }
}

/**
 * Condition SQL complète pour matcher source_record_id dans le LATERAL JOIN.
 * Pour certains modules (RIB, Déclarations fiscales), le matching accepte plusieurs formats.
 */
function getSourceRecordIdMatchCondition(moduleId: string, alias = 's'): string {
  const expr = getSourceRecordIdExpr(moduleId, alias);
  switch (moduleId) {
    case 'supplierBankAccounts':
      // Anomalie sur un RIB précis (supplier_code:rib_identifier)
      // OU anomalie au niveau fournisseur (supplier_code seul)
      return `source_record_id LIKE ${expr} OR source_record_id LIKE ${alias}."supplier_code"::text`;
    case 'taxDeclarations':
      // Anomalie sur un compte fiscal (tax_account_code)
      // OU anomalie sur une période spécifique (format: periode-type-tax_account_code)
      return `source_record_id LIKE ${expr} OR source_record_id LIKE '%-' || ${alias}."tax_account_code"::text`;
    default:
      return `source_record_id LIKE ${expr}`;
  }
}

/**
 * Construit un AuditResult à partir des anomalies stockées en base.
 */
export function buildAuditFromDbAnomalies(row: RecordWithAnomalies): AuditResult {
  const anomalies = row.anomalies || [];
  const count = row.anomalies_count || 0;

  if (count === 0) {
    return {
      status: 'Conforme',
      risk: 'faible',
      score: 100,
      reasons: ['✓ Aucune anomalie détectée - Document conforme aux règles de contrôle'],
      anomalies: []
    };
  }

  const criticalCount = anomalies.filter(a => a.severity === 'critique').length;
  const majorCount = anomalies.filter(a => a.severity === 'majeur').length;

  let status: 'Conforme' | 'À surveiller' | 'À vérifier' | 'Anomalie';
  let risk: 'faible' | 'moyen' | 'critique';
  let score: number;

  if (criticalCount > 1) {
    status = 'Anomalie';
    risk = 'critique';
    score = 30;
  } else if (criticalCount === 1 || majorCount >= 2) {
    status = 'À vérifier';
    risk = 'moyen';
    score = 50;
  } else {
    status = 'À surveiller';
    risk = 'faible';
    score = 75;
  }

  return {
    status,
    risk,
    score,
    reasons: anomalies.map(a => `${a.severity.toUpperCase()}: ${a.message}`),
    anomalies: anomalies.map(a => ({
      type: a.type as any,
      severity: a.severity,
      message: a.message,
      field: a.field,
      suggestion: a.suggestion || ''
    }))
  };
}

/**
 * Récupère les enregistrements d'une table source avec leurs anomalies
 * via un LEFT JOIN LATERAL sur audit_management.anomalies.
 * Les anomalies GLOBAL-* sont exclues du join ligne-par-ligne.
 */
export async function getRecordsWithAnomalies(
  options: GetRecordsOptions
): Promise<{ rows: RecordWithAnomalies[]; total: number }> {
  const whereParts = options.where?.length ? [...options.where] : [];
  const whereParams = options.params || [];

  // Filtres statut / risque basés sur les anomalies jointes
  const anomalyFilters: string[] = [];
  if (options.statusFilter && options.statusFilter !== 'all') {
    switch (options.statusFilter) {
      case 'Conforme':
        anomalyFilters.push('COALESCE(a.anomalies_count, 0) = 0');
        break;
      case 'À surveiller':
        anomalyFilters.push('COALESCE(a.anomalies_count, 0) > 0 AND a.max_severity = \'mineur\'');
        break;
      case 'À vérifier':
        anomalyFilters.push('a.max_severity IN (\'majeur\', \'critique\')');
        break;
      case 'Anomalie':
        anomalyFilters.push('a.max_severity = \'critique\'');
        break;
    }
  }
  if (options.riskFilter && options.riskFilter !== 'all') {
    switch (options.riskFilter) {
      case 'faible':
        anomalyFilters.push('(a.max_severity IS NULL OR a.max_severity = \'mineur\')');
        break;
      case 'moyen':
        anomalyFilters.push('a.max_severity IN (\'majeur\', \'critique\')');
        break;
      case 'critique':
        anomalyFilters.push('a.max_severity = \'critique\'');
        break;
    }
  }

  const allWhereParts = [...whereParts, ...anomalyFilters];
  const whereClause = allWhereParts.length ? `WHERE ${allWhereParts.join(' AND ')}` : '';

  // Condition de matching pour le LATERAL JOIN (prend en charge les cas spéciaux)
  const matchCondition = getSourceRecordIdMatchCondition(options.moduleId);

  // 1. Count total (alias s pour que les clauses WHERE avec s."col" fonctionnent)
  const countSchemaIdx = whereParams.length + 1;
  const countSql = `SELECT COUNT(*)::text AS total FROM ${quoteIdent(options.schema)}.${quoteIdent(options.table)} s LEFT JOIN LATERAL (
      SELECT count(*) AS anomalies_count,
        (array_agg(severity ORDER BY
          CASE severity WHEN 'critique' THEN 3 WHEN 'majeur' THEN 2 WHEN 'mineur' THEN 1 ELSE 0 END DESC
        ))[1] AS max_severity
      FROM audit_management.anomalies
      WHERE source_schema = $${countSchemaIdx}
        AND ${matchCondition}
        AND source_record_id NOT LIKE 'GLOBAL-%'
    ) a ON true ${whereClause}`;
  const countRes = await query(countSql, [...whereParams, options.schema]);
  const total = Number((countRes.rows[0] as { total: string })?.total || 0);

  // 2. Main query with LATERAL JOIN
  const colList = options.columns.map(c => `s.${quoteIdent(c)}`).join(', ');
  const orderClause = options.orderCol
    ? `ORDER BY s.${quoteIdent(options.orderCol)} ${options.sortDir || 'desc'} NULLS LAST`
    : '';

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  // Paramètres numérotés : whereParams (0..N-1), schema (N), limit (N+1), offset (N+2)
  const schemaIdx = whereParams.length + 1;
  const limitIdx = whereParams.length + 2;
  const offsetIdx = whereParams.length + 3;
  const allParams = [...whereParams, options.schema, limit, offset];

  const sql = `
    SELECT
      ${colList},
      COALESCE(a.anomalies, '[]'::jsonb) AS anomalies,
      COALESCE(a.anomalies_count, 0)::int AS anomalies_count,
      a.max_severity
    FROM ${quoteIdent(options.schema)}.${quoteIdent(options.table)} s
    LEFT JOIN LATERAL (
      SELECT
        jsonb_agg(jsonb_build_object(
          'id', id,
          'type', anomaly_type,
          'severity', severity,
          'message', description,
          'field', affected_field,
          'suggestion', suggestion,
          'status', status,
          'title', title
        )) AS anomalies,
        count(*) AS anomalies_count,
        (array_agg(severity ORDER BY
          CASE severity
            WHEN 'critique' THEN 3
            WHEN 'majeur' THEN 2
            WHEN 'mineur' THEN 1
            ELSE 0
          END DESC
        ))[1] AS max_severity
      FROM audit_management.anomalies
      WHERE source_schema = $${schemaIdx}
        AND ${matchCondition}
        AND source_record_id NOT LIKE 'GLOBAL-%'
    ) a ON true
    ${whereClause}
    ${orderClause}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  console.log('[RecordsWithAnomalies] SQL:', sql.substring(0, 500));
  console.log('[RecordsWithAnomalies] Params:', allParams);

  const res = await query(sql, allParams);

  const rows = res.rows.map((row) => {
    const rawAnomalies = (row.anomalies as unknown as any[]) || [];
    return {
      ...row,
      anomalies: rawAnomalies as DbAnomaly[],
      anomalies_count: Number(row.anomalies_count || 0),
      max_severity: (row.max_severity as string | null) || null
    };
  }) as RecordWithAnomalies[];

  return { rows, total };
}
