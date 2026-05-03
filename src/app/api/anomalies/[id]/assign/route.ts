// ============================================
// API ROUTE: Assigner une anomalie à un utilisateur
// POST /api/anomalies/[id]/assign
// Body: { assignedTo: number, userId?: number }
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const anomalyId = parseInt(id);
    const userId = body.userId || 1; // Default admin
    
    if (!body.assignedTo) {
      return NextResponse.json(
        { success: false, error: 'assignedTo is required' },
        { status: 400 }
      );
    }
    
    // Get current assignment
    const currentResult = await query(
      'SELECT assigned_to FROM audit_management.anomalies WHERE id = $1',
      [anomalyId]
    );
    
    if (currentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Anomaly not found' },
        { status: 404 }
      );
    }
    
    const oldAssigned = currentResult.rows[0].assigned_to;
    
    // Update assignment
    await query(
      'UPDATE audit_management.anomalies SET assigned_to = $1, updated_at = NOW() WHERE id = $2',
      [body.assignedTo, anomalyId]
    );
    
    // Get user name
    const userResult = await query(
      'SELECT full_name FROM audit_management.users WHERE id = $1',
      [body.assignedTo]
    );
    const userName = userResult.rows[0]?.full_name || 'Utilisateur' + body.assignedTo;
    
    // Add to history
    await query(
      `INSERT INTO audit_management.anomaly_history 
       (anomaly_id, action_type, action_by, comment)
       VALUES ($1, 'assignation', $2, $3)`,
      [anomalyId, userId, `Assigné à ${userName}${oldAssigned ? ' (précédemment assigné à ' + oldAssigned + ')' : ''}`]
    );
    
    return NextResponse.json({ 
      success: true, 
      message: `Anomalie assignée à ${userName}` 
    });
  } catch (error) {
    console.error('POST assign error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign anomaly' },
      { status: 500 }
    );
  }
}
