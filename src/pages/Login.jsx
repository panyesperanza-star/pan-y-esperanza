import { useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { callEdgeJson } from '../lib/edgeFunctions';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';

export function Login({ onAccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const payload = await callEdgeJson('request-password-reset', { email, logoUrl, origin: window.location.origin });
      setMessage(payload.message || 'Revise su correo para continuar.');
    } catch (err) {
      setError(err.message || 'No se pudo solicitar la recuperación.');
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const payload = await callEdgeJson('reset-password', { token: resetToken, password: newPassword });
      setMessage(payload.message || 'Contraseña actualizada correctamente.');
      window.history.replaceState({}, '', window.location.pathname);
      setPassword('');
      setMode('login');
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la contraseña.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff9f1_0%,#f6efe4_52%,#efe3d4_100%)] px-5 py-10 sm:px-8">
      <section className="w-full max-w-[30rem] overflow-hidden rounded-[1.25rem] border border-[#2f4a3a]/12 bg-white shadow-[0_1.5rem_4rem_rgba(37,33,29,0.12)]">
        <img
          src="/assets/photographs/login-erp-stock.jpg"
          alt="Equipo reunido en una mesa de trabajo"
          className="aspect-[16/9] w-full object-cover object-center"
        />
        {mode === 'login' && <form className="p-8 pt-7 sm:p-10 sm:pt-8" onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          setMessage('');
          try {
            await onAccess({ email, password });
          } catch (err) {
            setError(err.message || 'No se pudo iniciar sesión.');
          }
        }}>
          <div className="text-center">
            <h1 className="text-3xl font-bold leading-tight text-ink">Acceso al equipo</h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Accede al sistema de gestión de Pan y Esperanza.
            </p>
          </div>
          <div className="mt-8 space-y-5">
            <FormField label="Email">
              <input className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </FormField>
            <FormField label="Contraseña">
              <input className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
            <Button className="min-h-[3.9rem] w-full rounded-xl px-6 text-base" type="submit">Entrar</Button>
            <button type="button" className="w-full text-sm font-semibold text-brand-700 hover:underline" onClick={() => { setError(''); setMessage(''); setMode('forgot'); }}>Olvidé mi contraseña</button>
          </div>
        </form>}
        {mode === 'forgot' && <form className="p-8 pt-7 sm:p-10 sm:pt-8" onSubmit={requestReset}>
          <div className="text-center">
            <h1 className="text-3xl font-bold leading-tight text-ink">Recuperar contraseña</h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">Indica tu email y enviaremos un enlace seguro para establecer una nueva contraseña.</p>
          </div>
          <div className="mt-8 space-y-5">
            <FormField label="Email">
              <input className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
            <Button className="min-h-[3.9rem] w-full rounded-xl px-6 text-base" type="submit">Enviar enlace de recuperación</Button>
            <button type="button" className="w-full text-sm font-semibold text-brand-700 hover:underline" onClick={() => { setError(''); setMessage(''); setMode('login'); }}>Volver al acceso</button>
          </div>
        </form>}
        {mode === 'reset' && <form className="p-8 pt-7 sm:p-10 sm:pt-8" onSubmit={resetPassword}>
          <div className="text-center">
            <h1 className="text-3xl font-bold leading-tight text-ink">Nueva contraseña</h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">Introduce una nueva contraseña para recuperar el acceso.</p>
          </div>
          <div className="mt-8 space-y-5">
            <FormField label="Nueva contraseña">
              <input className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" required />
            </FormField>
            {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
            <Button className="min-h-[3.9rem] w-full rounded-xl px-6 text-base" type="submit">Guardar nueva contraseña</Button>
          </div>
        </form>}
      </section>
    </main>
  );
}
