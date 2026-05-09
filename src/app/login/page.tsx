'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type AuthUser } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@multiprint.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const storedUser = window.localStorage.getItem('financeaudit_user');
    if (storedUser) router.replace('/');
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Connexion impossible');
        return;
      }

      const user = data.user as AuthUser;
      window.localStorage.setItem('financeaudit_user', JSON.stringify(user));
      router.replace('/');
    } catch {
      setError('Erreur réseau pendant la connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <span className="auth-kicker">FinanceAudit IA V1</span>
          <h1>Connexion sécurisée</h1>
          <p>Accédez aux tableaux d’audit, anomalies et justificatifs selon votre rôle.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <h2>Se connecter</h2>
            <p className="small">Saisissez votre email et votre mot de passe pour accéder à l’application.</p>
          </div>
          {error && <div className="error">{error}</div>}
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            Mot de passe
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Connexion...' : 'Connexion'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push('/register')}>
            Créer un compte
          </button>
        </form>
      </section>
    </main>
  );
}
