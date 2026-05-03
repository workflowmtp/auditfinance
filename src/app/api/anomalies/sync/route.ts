// ============================================
// API ROUTE: Synchronisation des anomalies
// POST: Sync anomalies depuis l'analyse automatique
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { syncAnomaliesFromAnalysis } from '@/lib/audit-db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    if (!body.module || !body.records || !body.sourceTable) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: module, records, sourceTable' },
        { status: 400 }
      );
    }

    const result = await syncAnomaliesFromAnalysis(
      body.module,
      body.records,
      body.sourceTable,
      body.sourceSchema || 'raw'
    );

    return NextResponse.json({
      success: true,
      data: {
        created: result.created,
        updated: result.updated,
        message: `${result.created} nouvelles anomalies créées, ${result.updated} mises à jour`
      }
    });
  } catch (error) {
    console.error('POST /api/anomalies/sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync anomalies' },
      { status: 500 }
    );
  }
}
