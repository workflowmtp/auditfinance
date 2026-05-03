// ============================================
// API ROUTE: Mettre à jour le statut d'une anomalie
// POST /api/anomalies/[id]/status
// Body: { status: string, comment?: string, userId?: number }
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { queryAudit } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const anomalyId = parseInt(id);
    const userId = body.userId || 1; // Default admin
    
    // Get current status
    const currentResult = await queryAudit(
      'SELECT status FROM audit_management.anomalies WHERE id = $1',
      [anomalyId]
    );
    
    if (currentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Anomaly not found' },
        { status: 404 }
      );
    }
    
    const oldStatus = currentResult.rows[0].status;
    
    // Update status
    await queryAudit(
      'UPDATE audit_management.anomalies SET status = $1, updated_at = NOW() WHERE id = $2',
      [body.status, anomalyId]
    );
    
    // Add to history
    await queryAudit(
      `INSERT INTO audit_management.anomaly_history 
       (anomaly_id, action_type, action_by, old_status, new_status, comment)
       VALUES ($1, 'changement_statut', $2, $3, $4, $5)`,
      [anomalyId, userId, oldStatus, body.status, body.comment || `Statut changé de ${oldStatus} à ${body.status}`]
    );
    
    return NextResponse.json({ 
      success: true, 
      message: `Statut mis à jour: ${oldStatus} → ${body.status}` 
    });
  } catch (error) {
    console.error('POST status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update status' },
      { status: 500 }
    );
  }
}
