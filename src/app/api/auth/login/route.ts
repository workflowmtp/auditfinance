import { NextResponse } from 'next/server';
import { DEMO_USERS, authUserFromDb } from '@/lib/auth';
import { getUserByEmail } from '@/lib/audit-db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || '').trim();
    const password = String(body.password || '').trim();
    const dbUser = await getUserByEmail(email);

    if (!dbUser || !dbUser.isActive) {
      return NextResponse.json({ success: false, error: 'Identifiants incorrects' }, { status: 401 });
    }

    const demoPassword = DEMO_USERS.find((user) => user.username.toLowerCase() === dbUser.username.trim().toLowerCase())?.password;
    const storedPassword = dbUser.passwordHash?.trim() || dbUser.password?.trim();
    const acceptedPasswords = [storedPassword, demoPassword].filter(Boolean);

    if (!acceptedPasswords.includes(password)) {
      return NextResponse.json({ success: false, error: 'Identifiants incorrects' }, { status: 401 });
    }

    const user = authUserFromDb(dbUser);
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    return NextResponse.json({ success: false, error: 'Erreur de connexion' }, { status: 500 });
  }
}
