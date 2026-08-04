import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { callEdgeJson } from '../lib/edgeFunctions';
import { hasSupabaseConfig, supabase } from '../lib/supabase';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';

const PASSWORD_MIN_LENGTH = 8;
const RESET_ROUTE = '/restablecer-contrasena';

export function PasswordReset() {
  const [params] = useState(() => readRecoveryParams());
  const [method, setMethod] = useState(null);
  const [status, setStatus] = useState(params.hasRecoveryData ? 'checking' : 'missing');
  const [statusMessage, setStatusMessage] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const canSubmit = status === 'ready' && !submitting;
  const showRequestLink = status === 'invalid' || status === 'missing';

  const title = useMemo(() => {
    if (status === 'success') return 'Contraseña actualizada';
    if (status === 'checking') return 'Validando enlace';
    return 'Restablecer contraseña';
  }, [status]);

  useEffect(() => {
    if (!params.hasRecoveryData) return;

    let cancelled = false;

    async function prepareRecovery() {
      setError('');
      setStatus('checking');
      try {
        if (params.recoveryError) {
          throw new Error(params.recoveryError);
        }

        if (params.accessToken && params.refreshToken) {
          await prepareSupabaseTokenRecovery(params.accessToken, params.refreshToken);
          if (!cancelled) {
            setMethod('supabase-session');
            setStatus('ready');
            setStatusMessage('Enlace validado. Puede establecer una nueva contraseña.');
            removeRecoveryParamsFromUrl();
          }
          return;
        }

        if (params.code) {
          await prepareSupabaseCodeRecovery(params.code);
          if (!cancelled) {
            setMethod('supabase-session');
            setStatus('ready');
            setStatusMessage('Enlace validado. Puede establecer una nueva contraseña.');
            removeRecoveryParamsFromUrl();
          }
          return;
        }

        if (params.resetToken) {
          await callEdgeJson('reset-password', { token: params.resetToken, validateOnly: true });
          if (!cancelled) {
            setMethod('legacy-token');
            setStatus('ready');
            setStatusMessage('Enlace validado. Puede establecer una nueva contraseña.');
            removeRecoveryParamsFromUrl();
          }
          return;
        }

        throw new Error('El enlace de recuperación no contiene un token válido.');
      } catch (err) {
        if (!cancelled) {
          setStatus('invalid');
          setError(err.message || 'El enlace de recuperación no es válido o ha caducado.');
        }
      }
    }

    prepareRecovery();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setError('');
    setStatusMessage('');

    const password = newPassword.trim();
    const repeated = confirmPassword.trim();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== repeated) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      setSubmitting(true);
      if (method === 'supabase-session') {
        if (!hasSupabaseConfig || !supabase) {
          throw new Error('Supabase no está configurado para actualizar la contraseña.');
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await supabase.auth.signOut().catch(() => {});
      } else if (method === 'legacy-token') {
        await callEdgeJson('reset-password', { token: params.resetToken, password });
      } else {
        throw new Error('El enlace de recuperación no está preparado.');
      }

      setNewPassword('');
      setConfirmPassword('');
      setStatus('success');
      setStatusMessage('Contraseña actualizada correctamente. Redirigiendo al login del ERP...');
      window.setTimeout(() => {
        window.location.replace('/acceso');
      }, 2200);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestNewLink(event) {
    event.preventDefault();
    setError('');
    setRequestMessage('');
    try {
      setRequesting(true);
      const logoUrl = new URL(officialLogoUrl, window.location.origin).toString();
      const redirectTo = new URL(RESET_ROUTE, window.location.origin).toString();
      const payload = await callEdgeJson('request-password-reset', {
        email,
        logoUrl,
        origin: window.location.origin,
        redirectTo
      });
      setRequestMessage(payload.message || 'Revise su correo para continuar.');
    } catch (err) {
      setError(err.message || 'No se pudo solicitar un nuevo enlace.');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff9f1_0%,#f6efe4_52%,#efe3d4_100%)] px-5 py-10 sm:px-8">
      <section className="w-full max-w-[32rem] overflow-hidden rounded-[1.25rem] border border-[#2f4a3a]/12 bg-white shadow-[0_1.5rem_4rem_rgba(37,33,29,0.12)]">
        <img
          src="/assets/photographs/login-erp-stock.jpg"
          alt="Equipo reunido en una mesa de trabajo"
          className="aspect-[16/9] w-full object-cover object-center"
        />
        <div className="p-8 pt-7 sm:p-10 sm:pt-8">
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">ERP Pan y Esperanza</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-ink">{title}</h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Establezca una nueva contraseña para recuperar el acceso al sistema de gestión.
            </p>
          </div>

          {status === 'checking' && (
            <p className="mt-8 rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">
              Validando el enlace de recuperación...
            </p>
          )}

          {statusMessage && (
            <p className="mt-8 rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{statusMessage}</p>
          )}

          {error && (
            <p className="mt-8 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>
          )}

          {status === 'ready' && (
            <form className="mt-8 space-y-5" onSubmit={handlePasswordSubmit}>
              <FormField label="Nueva contraseña">
                <input
                  className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  required
                />
              </FormField>
              <FormField label="Confirmar contraseña">
                <input
                  className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  required
                />
              </FormField>
              <Button className="min-h-[3.9rem] w-full rounded-xl px-6 text-base" type="submit" disabled={!canSubmit}>
                {submitting ? 'Guardando...' : 'Guardar nueva contraseña'}
              </Button>
            </form>
          )}

          {showRequestLink && (
            <form className="mt-8 space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5" onSubmit={handleRequestNewLink}>
              <div>
                <h2 className="text-lg font-bold text-ink">Solicitar un nuevo enlace</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Si el enlace ha caducado, indique su email y enviaremos uno nuevo a esta misma ruta del ERP.
                </p>
              </div>
              <FormField label="Email">
                <input
                  className={`${inputClass} min-h-[3.25rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </FormField>
              {requestMessage && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{requestMessage}</p>}
              <Button className="min-h-[3.4rem] w-full rounded-xl px-6 text-base" type="submit" disabled={requesting}>
                {requesting ? 'Enviando...' : 'Enviar nuevo enlace'}
              </Button>
            </form>
          )}

          <button
            type="button"
            className="mt-6 w-full text-sm font-semibold text-brand-700 hover:underline"
            onClick={() => window.location.replace('/acceso')}
          >
            Volver al login del ERP
          </button>
        </div>
      </section>
    </main>
  );
}

function readRecoveryParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const read = (key) => search.get(key) || hash.get(key) || '';
  const resetToken = read('reset_token') || read('token');
  const code = read('code');
  const accessToken = read('access_token');
  const refreshToken = read('refresh_token');
  const type = read('type');
  const recoveryError = normalizeRecoveryError(read('error_description') || read('error'));

  return {
    resetToken,
    code,
    accessToken,
    refreshToken,
    type,
    recoveryError,
    hasRecoveryData: Boolean(resetToken || code || (accessToken && refreshToken) || type === 'recovery' || recoveryError)
  };
}

function normalizeRecoveryError(value) {
  if (!value) return '';
  return decodeURIComponent(String(value).replace(/\+/g, ' '));
}

async function prepareSupabaseTokenRecovery(accessToken, refreshToken) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase no está configurado para validar el enlace.');
  }
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) throw error;
}

async function prepareSupabaseCodeRecovery(code) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase no está configurado para validar el enlace.');
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

function removeRecoveryParamsFromUrl() {
  window.history.replaceState({}, '', RESET_ROUTE);
}
