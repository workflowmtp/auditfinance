'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { USER_ROLES, type UserRole } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', fullName: '', department: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'Lecteur' })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Inscription impossible');
        return;
      }

      setMessage('Compte créé avec succès. Vous pouvez vous connecter.');
      setTimeout(() => router.push('/login'), 900);
    } catch {
      setError('Erreur réseau pendant l’inscription');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-narrow">
        <div className="auth-hero">
          <span className="auth-kicker">Nouveau compte</span>
          <h1>Créer un utilisateur</h1>
          <p>Inscrivez un utilisateur dans la base avec un rôle initial. Les permissions seront appliquées automatiquement selon le rôle.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <h2>Inscription</h2>
            <p className="small">Tous les champs principaux sont obligatoires.</p>
          </div>
          {error && <div className="error">{error}</div>}
          {message && <div className="success-box">{message}</div>}
          <label>Nom d’utilisateur<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
          <label>Nom complet<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" /></label>
          <label>Département<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
          <label>Mot de passe<input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" /></label>
          <button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Création...' : 'Créer le compte'}</button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push('/login')}>Retour connexion</button>
        </form>
      </section>
    </main>
  );
}
