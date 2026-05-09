// ============================================
// API ROUTE: Gestion des utilisateurs
// ============================================

import { NextResponse } from 'next/server';
import { createUser, getUsers, updateUserRole, type UserRecord } from '@/lib/audit-db';
import { ROLE_PERMISSIONS, normalizeRole } from '@/lib/auth';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim();
    const fullName = String(body.fullName || '').trim();
    const department = String(body.department || '').trim() || null;
    const password = String(body.password || '').trim();
    const role = normalizeRole(body.role) as UserRecord['role'];

    if (!username || !email || !fullName || !password) {
      return NextResponse.json({ success: false, error: 'Champs obligatoires manquants' }, { status: 400 });
    }

    const user = await createUser({ username, email, fullName, role, department, password });
    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    console.error('POST /api/users error:', error);
    return NextResponse.json({ success: false, error: 'Impossible de créer l’utilisateur' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const role = normalizeRole(body.role) as UserRecord['role'];

    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant utilisateur invalide' }, { status: 400 });
    }

    const user = await updateUserRole(id, role);
    return NextResponse.json({ success: true, data: user, permissions: ROLE_PERMISSIONS[role] });
  } catch (error) {
    console.error('PATCH /api/users error:', error);
    return NextResponse.json({ success: false, error: 'Impossible de modifier le rôle' }, { status: 500 });
  }
}
