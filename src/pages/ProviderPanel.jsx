import { CheckCircle2, Clock3, ServerCog, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { isSystemSuperadmin } from '../lib/auth';
import { formatDateTime } from '../lib/formatters';

export function ProviderPanel({ data, actions, currentUser }) {
  const [resolving, setResolving] = useState(null);
  const [message, setMessage] = useState('');
  const requests = useMemo(() => data.deletion_requests || [], [data.deletion_requests]);
  const pending = requests.filter((request) => request.status === 'Pendiente');
  const resolved = requests.filter((request) => request.status !== 'Pendiente').slice(0, 8);

  if (!isSystemSuperadmin(currentUser)) {
    return (
      <section className="rounded-md border border-red-200 bg-red-50 p-5 text-red-800">
        <h1 className="font-bold">Acceso restringido</h1>
        <p className="mt-1 text-sm">Este panel solo esta disponible para el Superadministrador del sistema.</p>
      </section>
    );
  }

  async function resolveRequest(payload) {
    const result = await actions.resolveDeletionRequest(resolving.request.id, payload);
    setResolving(null);
    setMessage(payload.decision === 'Aprobada'
      ? `Solicitud aprobada. Se elimino definitivamente el registro ${result.deletedRecordType || 'solicitado'}.`
      : 'Solicitud rechazada y notificación enviada a la asociación.');
  }

  return (
    <>
      <PageHeader
        title="Panel del proveedor"
        description="Solicitudes de eliminación definitiva pendientes de revisión del Superadministrador del sistema."
        actions={<span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"><ServerCog size={17} /> Proveedor SaaS</span>}
      />

      {message && <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">{message}</div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <ProviderStat icon={Clock3} label="Pendientes" value={pending.length} />
        <ProviderStat icon={CheckCircle2} label="Aprobadas" value={requests.filter((request) => request.status === 'Aprobada').length} />
        <ProviderStat icon={XCircle} label="Rechazadas" value={requests.filter((request) => request.status === 'Rechazada').length} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-bold text-ink">Solicitudes pendientes</h2>
          <span className="text-sm text-slate-500">{pending.length} registros</span>
        </div>
        <div className="divide-y divide-slate-100">
          {pending.map((request) => (
            <DeletionRequestCard
              key={request.id}
              request={request}
              onApprove={() => setResolving({ request, decision: 'Aprobada' })}
              onReject={() => setResolving({ request, decision: 'Rechazada' })}
            />
          ))}
          {!pending.length && (
            <div className="px-5 py-10 text-center text-slate-500">
              <ShieldAlert className="mx-auto text-slate-300" size={34} />
              <p className="mt-2 font-semibold">No hay solicitudes pendientes.</p>
            </div>
          )}
        </div>
      </section>

      {resolved.length > 0 && (
        <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="font-bold text-ink">Ultimas resoluciones</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Fecha</th><th>Asociación</th><th>Registro</th><th>Estado</th><th>Resuelto por</th><th>Motivo</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolved.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3">{formatDateTime(request.resolved_at)}</td>
                    <td>{request.association_name || '-'}</td>
                    <td>{request.record_label || request.record_id}</td>
                    <td><StatusPill status={request.status} /></td>
                    <td>{request.resolved_by_name || request.resolved_by_email || '-'}</td>
                    <td className="max-w-xs truncate">{request.resolution_reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resolving && (
        <Modal title={resolving.decision === 'Aprobada' ? 'Aprobar eliminación' : 'Rechazar eliminación'} onClose={() => setResolving(null)}>
          <ResolveRequestForm
            request={resolving.request}
            decision={resolving.decision}
            onCancel={() => setResolving(null)}
            onSubmit={resolveRequest}
          />
        </Modal>
      )}
    </>
  );
}

function ProviderStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <span className="rounded-md bg-brand-50 p-3 text-brand-700"><Icon size={20} /></span>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}

function DeletionRequestCard({ request, onApprove, onReject }) {
  const relations = Array.isArray(request.relations_snapshot) ? request.relations_snapshot : [];
  return (
    <article className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-ink">{request.record_label || request.record_id}</h3>
          <StatusPill status={request.status} />
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <RequestMeta label="Asociación" value={request.association_name} />
          <RequestMeta label="Usuario" value={request.requester_name || request.requester_email} />
          <RequestMeta label="Módulo" value={request.module} />
          <RequestMeta label="Fecha" value={formatDateTime(request.requested_at)} />
        </dl>
        <p className="mt-3 text-sm text-slate-700"><span className="font-semibold text-ink">Motivo:</span> {request.reason}</p>
        {request.notes && <p className="mt-1 text-sm text-slate-600"><span className="font-semibold text-ink">Observaciones:</span> {request.notes}</p>}
        {relations.length > 0 && <p className="mt-2 text-xs font-medium text-amber-700">{relations.length} relacion{relations.length === 1 ? '' : 'es'} detectada{relations.length === 1 ? '' : 's'} en el momento de la solicitud.</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onReject}><XCircle size={16} /> Rechazar</Button>
        <Button onClick={onApprove}><CheckCircle2 size={16} /> Aprobar</Button>
      </div>
    </article>
  );
}

function RequestMeta({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-700">{value || '-'}</dd>
    </div>
  );
}

function StatusPill({ status }) {
  const tone = status === 'Aprobada'
    ? 'bg-brand-50 text-brand-700'
    : status === 'Rechazada'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${tone}`}>{status || 'Pendiente'}</span>;
}

function ResolveRequestForm({ request, decision, onCancel, onSubmit }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isApproval = decision === 'Aprobada';

  async function submit(event) {
    event.preventDefault();
    setError('');
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setError('Indica un motivo de resolucion de al menos 5 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ decision, resolution_reason: cleanReason });
    } catch (submitError) {
      setError(submitError.message || 'No se pudo resolver la solicitud.');
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className={`rounded-md border p-4 text-sm ${isApproval ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <p className="font-bold">{isApproval ? 'La aprobación ejecutará la eliminación definitiva.' : 'El rechazo mantendrá el registro sin cambios.'}</p>
        <p className="mt-1">Registro: {request.record_label || request.record_id}</p>
      </div>
      <FormField label={isApproval ? 'Motivo de aprobacion' : 'Motivo de rechazo'}>
        <textarea className={inputClass} autoFocus required minLength="5" rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant={isApproval ? 'danger' : 'primary'} disabled={saving}>
          {isApproval ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {saving ? 'Resolviendo...' : decision}
        </Button>
      </div>
    </form>
  );
}
