// ============================================
// API ROUTE: Statistiques des anomalies
// ============================================

import { NextResponse } from 'next/server';
import { getAnomalyStats } from '@/lib/audit-db';

export async function GET() {
  try {
    const stats = await getAnomalyStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('GET /api/anomalies/stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
