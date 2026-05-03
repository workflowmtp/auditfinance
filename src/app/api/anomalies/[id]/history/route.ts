// ============================================
// API ROUTE: Historique d'une anomalie
// GET /api/anomalies/[id]/history
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { queryAudit } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const result = await queryAudit(
      `SELECT h.*, u.full_name as user_name
       FROM audit_management.anomaly_history h
       LEFT JOIN audit_management.users u ON h.action_by = u.id
       WHERE h.anomaly_id = $1
       ORDER BY h.action_at DESC`,
      [parseInt(id)]
    );
    
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('GET history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
