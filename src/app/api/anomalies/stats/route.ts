// ============================================
// API ROUTE: Statistiques des anomalies
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAnomalyStats } from '@/lib/audit-db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filters = {
      status: url.searchParams.get('status') || undefined,
      severity: url.searchParams.get('severity') || undefined,
      module: url.searchParams.get('module') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined
    };
    const stats = await getAnomalyStats(filters);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('GET /api/anomalies/stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
