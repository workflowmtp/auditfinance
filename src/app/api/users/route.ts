// ============================================
// API ROUTE: Gestion des utilisateurs
// ============================================

import { NextResponse } from 'next/server';
import { getUsers } from '@/lib/audit-db';

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
