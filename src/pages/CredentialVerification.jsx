import { AlertTriangle, CheckCircle2, IdCard, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatDate } from '../lib/formatters';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const STATUS_META = {
  active: { label: 'Activa', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
  suspended: { label: 'Suspendida', className: 'bg-amber-50 text-amber-700 ring-amber-200', icon: AlertTriangle },
  revoked: { label: 'Revocada', className: 'bg-red-50 text-red-700 ring-red-200', icon: AlertTriangle },
  expired: { label: 'Caducada', className: 'bg-slate-100 text-slate-700 ring-slate-200', icon: AlertTriangle }
};

export function CredentialVerification() {
  const credentialPayload = useMemo(() => readCredentialPayloadFromLocation(), []);
  const credentialUid = credentialPayload.uid;
  const qrVersion = credentialPayload.qrVersion;
  const [state, setState] = useState({ loading: true, error: '', credential: null });

  useEffect(() => {
    let cancelled = false;
    async function verifyCredential() {
      if (!credentialUid) {
        setState({ loading: false, error: 'No se ha indicado ninguna credencial para verificar.', credential: null });
        return;
      }
      if (!hasSupabaseConfig || !supabase) {
        setState({ loading: false, error: 'La verificación no está disponible en este momento.', credential: null });
        return;
      }
      try {
        const { data, error } = await supabase.rpc('verify_official_credential', {
          p_credential_uid: credentialUid,
          p_qr_version: qrVersion
        });
        if (error) throw error;
        const credential = Array.isArray(data) ? data[0] : data;
        if (!credential) {
          setState({ loading: false, error: 'No se ha encontrado ninguna credencial oficial con este identificador.', credential: null });
          return;
        }
        if (!cancelled) setState({ loading: false, error: '', credential });
      } catch (verificationError) {
        console.error('[CredentialVerification] Error verificando credencial', verificationError);
        if (!cancelled) {
          setState({
            loading: false,
            error: 'No hemos podido verificar la credencial. Inténtalo de nuevo más tarde.',
            credential: null
          });
        }
      }
    }
    verifyCredential();
    return () => {
      cancelled = true;
    };
  }, [credentialUid, qrVersion]);

  return (
    <main className="min-h-screen bg-[#f4f8f3] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-white shadow-panel ring-1 ring-slate-200">
        <header className="bg-brand-700 px-6 py-6 text-white sm:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-white/15 p-3"><ShieldCheck size={28} /></span>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-white/75">Pan y Esperanza</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Verificación oficial de credencial</h1>
            </div>
          </div>
        </header>

        {state.loading && (
          <div className="grid min-h-[360px] place-items-center p-8 text-center">
            <div>
              <IdCard className="mx-auto text-brand-700" size={42} />
              <p className="mt-4 font-bold text-slate-700">Verificando credencial...</p>
            </div>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="grid min-h-[360px] place-items-center p-8 text-center">
            <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
              <AlertTriangle className="mx-auto" size={38} />
              <p className="mt-3 font-bold">{state.error}</p>
            </div>
          </div>
        )}

        {!state.loading && state.credential && (
          <CredentialVerificationCard credential={state.credential} />
        )}
      </section>
    </main>
  );
}

function CredentialVerificationCard({ credential }) {
  const status = String(credential.status || '').toLowerCase();
  const meta = STATUS_META[status] || STATUS_META.expired;
  const StatusIcon = meta.icon;
  const photo = credential.photo_data_url || credential.photo_url || '';

  if (status !== 'active') {
    return <InvalidCredentialCard credential={credential} meta={meta} StatusIcon={StatusIcon} />;
  }

  return (
    <div className="grid gap-6 p-6 sm:grid-cols-[180px_1fr] sm:p-8">
      <div className="mx-auto">
        {photo ? (
          <img src={photo} alt={`Foto de ${credential.display_name}`} className="h-44 w-36 rounded-2xl bg-slate-100 object-cover shadow-sm" />
        ) : (
          <div className="grid h-44 w-36 place-items-center rounded-2xl bg-brand-50 text-3xl font-black text-brand-700 shadow-sm">
            {initials(credential.display_name)}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black ring-1 ring-inset ${meta.className}`}>
          <StatusIcon size={17} />
          {credential.status_label || meta.label}
        </div>
        <h2 className="mt-4 break-words text-3xl font-black tracking-tight text-ink">{credential.display_name}</h2>
        <p className="mt-2 text-lg font-bold uppercase tracking-wide text-brand-700">{credential.role_label}</p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-1">
          <Info label="ID de credencial" value={credential.credential_uid} />
        </dl>

        <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-brand-800">
          <p className="font-bold">{credential.message || 'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'}</p>
          <p className="mt-1 text-sm text-brand-700">La validez se consulta contra la base de datos oficial en tiempo real.</p>
        </div>
      </div>
    </div>
  );
}

function InvalidCredentialCard({ credential, meta, StatusIcon }) {
  const status = String(credential.status || '').toLowerCase();
  const invalidatedAt = credential.revoked_at || (status === 'expired' ? credential.expires_at : null);
  const invalidatedLabel = status === 'expired' ? 'Fecha de caducidad' : 'Fecha de revocación';

  return (
    <div className="grid min-h-[360px] place-items-center p-6 sm:p-8">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center">
        <div className={`mx-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ring-1 ring-inset ${meta.className}`}>
          <StatusIcon size={18} />
          Estado: {credential.status_label || meta.label}
        </div>
        <h2 className="mt-5 text-2xl font-black tracking-tight text-ink">Esta credencial ya no es válida.</h2>
        <dl className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <Info label="ID de credencial" value={credential.credential_uid} />
          <Info label={invalidatedLabel} value={invalidatedAt ? formatDate(invalidatedAt) : 'No indicada'} />
          <Info label="Motivo" value={credential.status_reason || credential.message || 'Credencial no válida'} />
        </dl>
        <div className="mt-6 rounded-2xl border border-red-100 bg-white p-4 text-red-700">
          <p className="font-bold">{credential.message || 'Esta credencial ya no es válida.'}</p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-bold text-slate-900">{value || '-'}</dd>
    </div>
  );
}

function readCredentialPayloadFromLocation() {
  const path = window.location.pathname || '';
  const match = path.match(/\/verificar-credencial\/([^/]+)/);
  const fromPath = match ? decodeURIComponent(match[1]) : '';
  const query = new URLSearchParams(window.location.search);
  const fromQuery = query.get('id') || '';
  const qrVersion = Number.parseInt(query.get('v') || '', 10);
  return {
    uid: String(fromPath || fromQuery).trim(),
    qrVersion: Number.isFinite(qrVersion) && qrVersion > 0 ? qrVersion : null
  };
}

function initials(value) {
  return String(value || 'PY')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PY';
}
