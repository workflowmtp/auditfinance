// ============================================
// API ROUTE: Actions sur une anomalie spécifique
// PATCH: Mise à jour statut ou assignation
// GET: Détails d'une anomalie
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAnomalyById, updateAnomalyStatus, assignAnomaly } from '@/lib/audit-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const anomaly = await getAnomalyById(parseInt(id));
    
    if (!anomaly) {
      return NextResponse.json(
        { success: false, error: 'Anomaly not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: anomaly });
  } catch (error) {
    console.error(`GET /api/anomalies/[id] error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch anomaly' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const userId = body.userId || 1; // Default admin user
    
    if (body.status) {
      await updateAnomalyStatus(parseInt(id), body.status, userId, body.comment);
    }
    
    if (body.assignedTo) {
      await assignAnomaly(parseInt(id), body.assignedTo, userId);
    }
    
    const updated = await getAnomalyById(parseInt(id));
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error(`PATCH /api/anomalies/[id] error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to update anomaly' },
      { status: 500 }
    );
  }
}
