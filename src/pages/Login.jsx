import { useState } from 'react';
import logo from '../assets/logo-pan-y-esperanza.png';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';

export function Login({ onAccess }) {
  const [email, setEmail] = useState('elizabeth@panyesperanza.org');
  const [password, setPassword] = useState('Elizabeth2026!');
  const [newPassword, setNewPassword] = useState('');
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get('reset_token') ? 'reset' : 'login');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const resetToken = new URLSearchParams(window.location.search).get('reset_token') || '';

  async function requestReset(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const logoUrl = new URL(officialLogoUrl, window.location.origin).toString();
      const response = await fetch('/api/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, logoUrl, origin: window.location.origin })
      });
      const payload = await safeJson(response);
      if (!response.ok) throw new Error(payload.error || 'No se pudo solicitar la recuperacion.');
      setMessage(payload.message || 'Revise su correo para continuar.');
    } catch (err) {
      setError(err.message || 'No se pudo solicitar la recuperacion.');
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: newPassword })
      });
      const payload = await safeJson(response);
      if (!response.ok) throw new Error(payload.error || 'No se pudo actualizar la contrasena.');
      setMessage(payload.message || 'Contrasena actualizada correctamente.');
      window.history.replaceState({}, '', window.location.pathname);
      setPassword('');
      setMode('login');
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la contrasena.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7faf6] px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-between bg-brand-600 p-8 text-white sm:p-10">
          <div>
            <img src={logo} alt="Pan y Esperanza" className="h-24 w-auto object-contain" />
            <h2 className="mt-8 text-3xl font-bold">Pan y Esperanza</h2>
            <p className="mt-3 max-w-md text-brand-50">Gestion integral de beneficiarios, entregas, inventario y justificantes.</p>
          </div>
          <p className="mt-10 text-sm text-brand-50">Logo oficial integrado sin deformar y preparado para impresion.</p>
        </div>
        {mode === 'login' && <form className="p-8 sm:p-10" onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          setMessage('');
          try {
            await onAccess({ email, password });
          } catch (err) {
            setError(err.message || 'No se pudo iniciar sesion.');
          }
        }}>
          <BrandLogo className="h-16 w-auto" />
          <h3 className="mt-8 text-2xl font-bold text-ink">Acceso</h3>
          <p className="mt-2 text-sm text-slate-600">Inicia sesion con email y contrasena.</p>
          <div className="mt-6 space-y-4">
            <FormField label="Email">
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </FormField>
            <FormField label="Contrasena">
              <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
            <Button className="w-full" type="submit">Entrar</Button>
            <button type="button" className="w-full text-sm font-semibold text-brand-700 hover:underline" onClick={() => { setError(''); setMessage(''); setMode('forgot'); }}>Olvide mi contrasena</button>
          </div>
        </form>}
        {mode === 'forgot' && <form className="p-8 sm:p-10" onSubmit={requestReset}>
          <BrandLogo className="h-16 w-auto" />
          <h3 className="mt-8 text-2xl font-bold text-ink">Recuperar contrasena</h3>
          <p className="mt-2 text-sm text-slate-600">Indica tu email y enviaremos un enlace seguro para establecer una nueva contrasena.</p>
          <div className="mt-6 space-y-4">
            <FormField label="Email">
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
            <Button className="w-full" type="submit">Enviar enlace de recuperacion</Button>
            <button type="button" className="w-full text-sm font-semibold text-brand-700 hover:underline" onClick={() => { setError(''); setMessage(''); setMode('login'); }}>Volver al acceso</button>
          </div>
        </form>}
        {mode === 'reset' && <form className="p-8 sm:p-10" onSubmit={resetPassword}>
          <BrandLogo className="h-16 w-auto" />
          <h3 className="mt-8 text-2xl font-bold text-ink">Nueva contrasena</h3>
          <p className="mt-2 text-sm text-slate-600">Introduce una nueva contrasena para recuperar el acceso.</p>
          <div className="mt-6 space-y-4">
            <FormField label="Nueva contrasena">
              <input className={inputClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
            <Button className="w-full" type="submit">Guardar nueva contrasena</Button>
          </div>
        </form>}
      </section>
    </main>
  );
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: 'Respuesta no valida del servidor.' };
  }
}
