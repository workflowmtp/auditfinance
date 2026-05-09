import { NextResponse } from 'next/server';

export interface N8NAnomaly {
  title: string;
  description: string;
  causes: string;
  solutions: string;
  severity: string;
}

export async function POST(request: Request) {
  const n8nUrl = process.env.N8N_ANOMALIES_URL;
  const username = process.env.N8N_ANOMALIES_USERNAME;
  const password = process.env.N8N_ANOMALIES_PASSWORD;

  console.log('[N8N Anomalies API] Request received');
  console.log('[N8N Anomalies API] N8N_ANOMALIES_URL:', n8nUrl);
  console.log('[N8N Anomalies API] N8N_ANOMALIES_USERNAME:', username);

  if (!n8nUrl) {
    console.error('[N8N Anomalies API] N8N_ANOMALIES_URL non configuré');
    return NextResponse.json(
      { error: 'N8N_ANOMALIES_URL non configuré' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    console.log('[N8N Anomalies API] Request body keys:', Object.keys(body));
    console.log('[N8N Anomalies API] Sending request to n8n...');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (username && password) {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    console.log('[N8N Anomalies API] n8n response status:', response.status);

    if (!response.ok) {
      throw new Error(`Erreur n8n: ${response.status} ${response.statusText}`);
    }

    const data: N8NAnomaly[] = await response.json();
    console.log('[N8N Anomalies API] Received data from n8n:', data);
    console.log('[N8N Anomalies API] Number of anomalies:', data.length);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[N8N Anomalies API] Erreur lors de la récupération des anomalies depuis n8n:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        data: [],
      },
      { status: 500 }
    );
  }
}
