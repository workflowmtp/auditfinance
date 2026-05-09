import { NAV_ITEMS } from '@/lib/modules';
import type { UserRecord } from '@/lib/audit-db';

export type UserRole = 'Administrateur' | 'Auditeur' | 'Comptable' | 'Lecteur';

export const USER_ROLES: UserRole[] = ['Administrateur', 'Auditeur', 'Comptable', 'Lecteur'];

export type Permission =
  | 'dashboard:view'
  | 'records:view'
  | 'anomalies:view'
  | 'anomalies:manage'
  | 'users:view'
  | 'settings:view'
  | 'reports:view'
  | 'exports:view'
  | 'audit:view';

export type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  department: string;
  permissions: Permission[];
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  Administrateur: ['dashboard:view', 'records:view', 'anomalies:view', 'anomalies:manage', 'users:view', 'settings:view', 'reports:view', 'exports:view', 'audit:view'],
  Auditeur: ['dashboard:view', 'records:view', 'anomalies:view', 'anomalies:manage', 'reports:view', 'exports:view', 'audit:view'],
  Comptable: ['dashboard:view', 'records:view', 'anomalies:view', 'reports:view'],
  Lecteur: ['dashboard:view', 'records:view', 'anomalies:view']
};

export const DEMO_USERS: Array<AuthUser & { password: string }> = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    fullName: 'Xavier Administrateur',
    email: 'admin@financeaudit.local',
    role: 'Administrateur',
    department: 'Audit interne',
    permissions: ROLE_PERMISSIONS.Administrateur
  },
  {
    id: 2,
    username: 'auditeur',
    password: 'audit123',
    fullName: 'Auditeur Finance',
    email: 'auditeur@financeaudit.local',
    role: 'Auditeur',
    department: 'Contrôle financier',
    permissions: ROLE_PERMISSIONS.Auditeur
  },
  {
    id: 3,
    username: 'comptable',
    password: 'compta123',
    fullName: 'Comptable Général',
    email: 'comptable@financeaudit.local',
    role: 'Comptable',
    department: 'Comptabilité',
    permissions: ROLE_PERMISSIONS.Comptable
  },
  {
    id: 4,
    username: 'lecteur',
    password: 'lecture123',
    fullName: 'Lecteur Consultation',
    email: 'lecteur@financeaudit.local',
    role: 'Lecteur',
    department: 'Direction',
    permissions: ROLE_PERMISSIONS.Lecteur
  }
];

export function normalizeRole(role: string | null | undefined): UserRole {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'administrateur' || normalized === 'admin') return 'Administrateur';
  if (normalized === 'auditeur' || normalized === 'auditor') return 'Auditeur';
  if (normalized === 'comptable' || normalized === 'accountant') return 'Comptable';
  return 'Lecteur';
}

const NAV_PERMISSION_RULES: Partial<Record<(typeof NAV_ITEMS)[number][0], Permission>> = {
  dashboard: 'dashboard:view',
  anomalies: 'anomalies:view',
  users: 'users:view',
  settings: 'settings:view',
  reports: 'reports:view',
  exports: 'exports:view',
  auditTrail: 'audit:view'
};

export function sanitizeUser(user: AuthUser & { password?: string }): AuthUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    department: user.department,
    permissions: user.permissions
  };
}

export function authUserFromDb(user: UserRecord): AuthUser {
  const role = normalizeRole(user.role);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role,
    department: user.department || '-',
    permissions: ROLE_PERMISSIONS[role]
  };
}

export function hasPermission(user: AuthUser | null | undefined, permission: Permission) {
  return Boolean(user?.permissions.includes(permission));
}

export function canAccessModule(user: AuthUser | null | undefined, moduleId: string) {
  if (!user) return false;
  const requiredPermission = NAV_PERMISSION_RULES[moduleId as keyof typeof NAV_PERMISSION_RULES] || 'records:view';
  return hasPermission(user, requiredPermission);
}

export function authenticateDemoUser(username: string, password: string) {
  const user = DEMO_USERS.find((candidate) => candidate.username.toLowerCase() === username.trim().toLowerCase() && candidate.password === password);
  return user ? sanitizeUser(user) : null;
}
