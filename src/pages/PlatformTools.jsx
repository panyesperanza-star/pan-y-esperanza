import { AlertTriangle, CheckCircle2, Crown, History, LockKeyhole, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { isPlatformOwner, PLATFORM_OWNER_PROVIDER } from '../lib/auth';
import { formatDateTime } from '../lib/formatters';
import { PLATFORM_MAINTENANCE_OPERATIONS } from '../services/platform/PlatformMaintenanceService';

export function PlatformTools({ data, actions, currentUser }) {
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [message, setMessage] = useState('');
  const [localLogs, setLocalLogs] = useState([]);
  const logs = useMemo(() => {
    const rows = [...localLogs, ...(data.platform_maintenance_logs || [])];
    return rows
      .filter((row, index, all) => all.findIndex((item) => item.id && item.id === row.id) === index || !row.id)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 12);
  }, [data.platform_maintenance_logs, localLogs]);

  if (!isPlatformOwner(currentUser)) {
    return (
      <section className="rounded-md border border-red-200 bg-red-50 p-5 text-red-800">
        <h1 className="font-bold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Este módulo solo está disponible para el Platform Owner de ALTHEMON.</p>
      </section>
    );
  }

  async function prepareOperation(payload) {
    const result = await actions.preparePlatformMaintenanceOperation(payload);
    if (result?.log) setLocalLogs((state) => [result.log, ...state]);
    setSelectedOperation(null);
    setMessage(result?.message || 'Operación registrada. No se ha ejecutado ninguna limpieza.');
  }

  return (
    <>
      <PageHeader
        title="Herramientas de Plataforma"
        description="Módulo interno de ALTHEMON para preparar operaciones críticas de mantenimiento. La lógica de limpieza todavía no está conectada."
        actions={<span className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-bold text-white"><Crown size={17} /> {PLATFORM_OWNER_PROVIDER}</span>}
      />

      {message && (
        <div className="mb-5 flex gap-2 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">
          <CheckCircle2 size={18} /> {message}
        </div>
      )}

      <section className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 shrink-0" size={22} />
          <div>
            <p className="font-bold">Infraestructura preparada, operaciones reales desactivadas.</p>
            <p className="mt-1 text-sm">Cada operación exige frase de confirmación, contraseña del Platform Owner y motivo. En esta fase solo se registra el intento en el log permanente.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {PLATFORM_MAINTENANCE_OPERATIONS.map((operation) => (
          <article key={operation.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{operation.scope}</p>
                <h2 className="mt-1 text-lg font-bold text-ink">{operation.label}</h2>
              </div>
              <RiskPill risk={operation.risk} />
            </div>
            <p className="mt-3 text-sm text-slate-600">Preparada para futura ejecución controlada. No modifica datos en esta versión.</p>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Frase requerida: <span className="font-bold text-ink">{operation.confirmationPhrase}</span>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedOperation(operation)}>
                <LockKeyhole size={16} /> Preparar operación
              </Button>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-ink">Log permanente de plataforma</h2>
            <p className="text-sm text-slate-500">Registro append-only de operaciones preparadas y validaciones fallidas.</p>
          </div>
          <History className="text-slate-400" size={20} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Fecha</th><th>Operación</th><th>Usuario</th><th>Estado</th><th>Motivo</th><th>Resultado</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id || `${log.operation_id}-${log.created_at}`}>
                  <td className="px-4 py-3">{formatDateTime(log.created_at)}</td>
                  <td className="font-semibold text-ink">{log.operation_label || log.operation_id}</td>
                  <td>{log.user_name || log.user_email || '-'}</td>
                  <td><StatusPill status={log.status} /></td>
                  <td className="max-w-xs truncate">{log.reason || '-'}</td>
                  <td className="max-w-xs truncate">{log.result || '-'}</td>
                </tr>
              ))}
              {!logs.length && (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="6">Sin operaciones registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOperation && (
        <Modal title={selectedOperation.label} onClose={() => setSelectedOperation(null)}>
          <PlatformOperationForm operation={selectedOperation} onCancel={() => setSelectedOperation(null)} onSubmit={prepareOperation} />
        </Modal>
      )}
    </>
  );
}

function PlatformOperationForm({ operation, onCancel, onSubmit }) {
  const [form, setForm] = useState({ confirmation: '', password: '', reason: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        operationId: operation.id,
        confirmation: form.confirmation,
        password: form.password,
        reason: form.reason,
        userAgent: navigator.userAgent
      });
    } catch (submitError) {
      setError(submitError.message || 'No se pudo registrar la operación.');
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-bold">Operación crítica de plataforma.</p>
            <p className="mt-1">La ejecución real está desactivada. Esta acción solo validará los requisitos y dejará registro permanente.</p>
          </div>
        </div>
      </div>
      <FormField label="Frase de confirmación" required>
        <input className={inputClass} value={form.confirmation} onChange={(event) => update('confirmation', event.target.value)} placeholder={operation.confirmationPhrase} />
      </FormField>
      <FormField label="Contraseña del Platform Owner" required>
        <input className={inputClass} type="password" value={form.password} onChange={(event) => update('password', event.target.value)} autoComplete="current-password" />
      </FormField>
      <FormField label="Motivo de mantenimiento" required>
        <textarea className={inputClass} rows="4" value={form.reason} onChange={(event) => update('reason', event.target.value)} placeholder="Describe por qué se prepara esta operación." />
      </FormField>
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="danger" disabled={saving}>
          <LockKeyhole size={16} /> {saving ? 'Validando...' : 'Registrar preparación'}
        </Button>
      </div>
    </form>
  );
}

function RiskPill({ risk }) {
  const tone = risk === 'critico' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${tone}`}>{risk}</span>;
}

function StatusPill({ status }) {
  const tone = status === 'prepared' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700';
  const label = status === 'prepared' ? 'Preparada' : status === 'password_failed' ? 'Contraseña fallida' : status || 'Registrada';
  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}
