import { NextResponse } from 'next/server';
import { getRolePermissions, setRolePermissions } from '@/lib/audit-db';
import { ROLE_PERMISSIONS, USER_ROLES, type Permission, type UserRole } from '@/lib/auth';

const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view',
  'records:view',
  'anomalies:view',
  'anomalies:manage',
  'users:view',
  'settings:view',
  'reports:view',
  'exports:view',
  'audit:view'
];

export async function GET() {
  try {
    const stored = await getRolePermissions();
    const merged: Record<UserRole, Permission[]> = { ...ROLE_PERMISSIONS };
    for (const role of USER_ROLES) {
      if (stored[role]) {
        merged[role] = stored[role] as Permission[];
      }
    }
    return NextResponse.json({
      success: true,
      data: merged,
      allPermissions: ALL_PERMISSIONS
    });
  } catch (error) {
    console.error('GET /api/roles/permissions error:', error);
    return NextResponse.json(
      { success: false, error: 'Impossible de charger les permissions' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const role = String(body.role || '').trim();
    const permissions = Array.isArray(body.permissions) ? body.permissions.map(String) : null;

    if (!USER_ROLES.includes(role as UserRole)) {
      return NextResponse.json({ success: false, error: 'Rôle invalide' }, { status: 400 });
    }
    if (!permissions) {
      return NextResponse.json({ success: false, error: 'Permissions invalides' }, { status: 400 });
    }

    const filtered = permissions.filter((p: string) => ALL_PERMISSIONS.includes(p as Permission));
    await setRolePermissions(role, filtered);

    return NextResponse.json({ success: true, role, permissions: filtered });
  } catch (error) {
    console.error('PUT /api/roles/permissions error:', error);
    return NextResponse.json(
      { success: false, error: 'Impossible de mettre à jour les permissions' },
      { status: 500 }
    );
  }
}
