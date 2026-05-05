import { NextRequest, NextResponse } from 'next/server';

/**
 * [NEUTRALISÉ] L'analyse à la volée est remplacée par les anomalies
 * stockées en base (audit_management.anomalies) alimentées par un agent IA externe.
 * Cette route est conservée pour compatibilité mais ne calcule plus d'anomalies.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const results = rows.map(() => ({
      status: 'Conforme',
      risk: 'faible',
      score: 100,
      reasons: ['✓ Analyse en temps réel désactivée. Les anomalies sont consultées dans le Centre des anomalies.'],
      anomalies: []
    }));
    return NextResponse.json({ results, deprecated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur audit' }, { status: 500 });
  }
}
