// ============================================
// API ROUTE: Gestion des anomalies
// GET: Liste des anomalies avec filtres
// POST: Créer une anomalie manuellement
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAnomalies, createAnomaly, updateAnomalyStatus, assignAnomaly, getAnomalyStats } from '@/lib/audit-db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    
    const filters = {
      status: url.searchParams.get('status') || undefined,
      severity: url.searchParams.get('severity') || undefined,
      module: url.searchParams.get('module') || undefined,
      assignedTo: url.searchParams.get('assignedTo') ? parseInt(url.searchParams.get('assignedTo')!) : undefined,
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0')
    };

    const result = await getAnomalies(filters);
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      pagination: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
        totalPages: Math.ceil(result.total / filters.limit)
      }
    });
  } catch (error) {
    console.error('GET /api/anomalies error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch anomalies' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const anomaly = await createAnomaly({
      module: body.module,
      moduleName: body.moduleName || body.module,
      sourceSchema: body.sourceSchema || null,
      sourceTable: body.sourceTable || null,
      sourceRecordId: body.sourceRecordId || null,
      anomalyType: body.anomalyType,
      severity: body.severity,
      title: body.title,
      description: body.description,
      affectedField: body.affectedField || null,
      suggestion: body.suggestion || null,
      amount: body.amount || null,
      amountCurrency: body.amountCurrency || 'XOF',
      referenceNumber: body.referenceNumber || null,
      status: body.status || 'ouverte',
      justificationStatus: body.justificationStatus || 'sans_justificatif',
      assignedTo: body.assignedTo || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      riskScore: body.riskScore || null,
      riskLevel: body.riskLevel || null,
      isFalsePositive: body.isFalsePositive || false
    });

    return NextResponse.json({ success: true, data: anomaly });
  } catch (error) {
    console.error('POST /api/anomalies error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create anomaly' },
      { status: 500 }
    );
  }
}
