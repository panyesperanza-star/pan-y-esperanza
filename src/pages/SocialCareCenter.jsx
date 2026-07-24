import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  PackageCheck,
  Phone,
  Search,
  UserRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { inputClass } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from './Communications';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'En gestion' },
  { value: 'applied', label: 'Resuelta' },
  { value: 'cancelled', label: 'Cancelada' }
];

const ORIGIN_OPTIONS = [
  { value: '', label: 'Todos los origenes' },
  { value: 'beneficiary_portal', label: 'Portal del Beneficiario' },
  { value: 'attendance', label: 'Asistencia a entregas' },
  { value: 'assistant', label: 'Asistente' },
  { value: 'future', label: 'Futuros portales' }
];

const QUICK_FILTERS = [
  { value: 'urgent', label: '🔴 Urgentes' },
  { value: 'today', label: '🟡 Hoy' },
  { value: 'pending', label: '🟢 Pendientes' },
  { value: 'assistant', label: '🤖 IA' },
  { value: 'beneficiaries', label: '👤 Beneficiarios' },
  { value: 'collaborators', label: '🤝 Colaboradores' },
  { value: 'donors', label: '❤️ Donantes' },
  { value: 'volunteers', label: '🙋 Voluntarios' }
];

export function SocialCareCenter({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const [filters, setFilters] = useState({ search: '', origin: '', status: '', quick: '' });
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const cases = useMemo(() => buildCases(data), [data]);
  const filtered = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const selectedCase = cases.find((item) => item.id === selectedId) || filtered[0] || cases[0] || null;
  const canEdit = canDo(currentUser, 'social-care', 'edit');
  const metrics = useMemo(() => buildMetrics(cases), [cases]);

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'social-care') return;
    const targetId = navigationTarget.caseId || navigationTarget.requestId || navigationTarget.itemId;
    if (targetId && cases.some((item) => item.id === targetId || item.requestId === targetId || item.deliveryId === targetId)) {
      const match = cases.find((item) => item.id === targetId || item.requestId === targetId || item.deliveryId === targetId);
      setSelectedId(match.id);
    }
  }, [cases, navigationTarget]);

  async function updateCase(caseItem, payload) {
    if (!caseItem || !canEdit) return;
    setBusy(true);
    setNotice('');
    try {
      await actions.updateSocialCareCase?.(caseItem.reference, payload);
      setNotice(payload.status === 'applied' ? 'Solicitud resuelta y notificacion relacionada cerrada.' : 'Solicitud actualizada correctamente.');
    } catch (error) {
      setNotice(error.message || 'No se pudo actualizar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  function openBeneficiary(caseItem) {
    if (!caseItem?.beneficiaryId) return;
    onNavigate?.({ moduleId: 'beneficiaries', profileId: caseItem.beneficiaryId });
  }

  function openDelivery(caseItem) {
    if (!caseItem?.deliveryId) return;
    onNavigate?.({ moduleId: 'deliveries', itemId: caseItem.deliveryId });
  }

  return (
    <>
      <PageHeader
        title="Centro de Atencion Social"
        description="Acciones del portal y entregas que requieren seguimiento del equipo."
      />

      {notice && (
        <div className="mb-4 rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          {notice}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pendientes" value={metrics.pending} tone="amber" icon={Clock3} />
        <MetricCard label="En gestion" value={metrics.approved} tone="blue" icon={AlertTriangle} />
        <MetricCard label="Resueltas" value={metrics.applied} tone="green" icon={CheckCircle2} />
        <MetricCard label="Canceladas" value={metrics.cancelled} tone="slate" icon={FileText} />
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-3 shadow-panel">
        <div className="flex flex-wrap gap-2" aria-label="Filtros rapidos">
          {QUICK_FILTERS.map((option) => {
            const active = filters.quick === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters((current) => ({ ...current, quick: active ? '' : option.value }))}
                className={`focus-ring rounded-md border px-3 py-2 text-sm font-bold transition ${
                  active
                    ? 'border-brand-500 bg-brand-600 text-white shadow-panel'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-panel lg:grid-cols-[1fr_220px_220px]">
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Search size={16} /> Buscar
          </span>
          <input
            className={inputClass}
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Nombre, mensaje, telefono, email o entrega"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Origen</span>
          <select className={inputClass} value={filters.origin} onChange={(event) => setFilters((current) => ({ ...current, origin: event.target.value }))}>
            {ORIGIN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-3">
          {filtered.map((caseItem) => (
            <CaseCard
              key={caseItem.id}
              caseItem={caseItem}
              selected={selectedCase?.id === caseItem.id}
              onSelect={() => setSelectedId(caseItem.id)}
            />
          ))}
          {!filtered.length && (
            <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-panel">
              No hay atenciones con los filtros actuales.
            </div>
          )}
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <CarePanel
            caseItem={selectedCase}
            canEdit={canEdit}
            busy={busy}
            onOpenBeneficiary={openBeneficiary}
            onOpenDelivery={openDelivery}
            onUpdate={updateCase}
          />
        </aside>
      </section>
    </>
  );
}

function MetricCard({ label, value, tone, icon: Icon }) {
  return (
    <article className={`rounded-md border p-4 shadow-panel ${metricTone(tone)}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-white/70 p-2"><Icon size={20} /></span>
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <p className="mt-3 text-sm font-bold">{label}</p>
    </article>
  );
}

function CaseCard({ caseItem, selected, onSelect }) {
  const status = statusMeta(caseItem.status);
  const priority = priorityMeta(caseItem.priority);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`focus-ring rounded-md border p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg ${
        selected
          ? 'border-brand-300 border-l-[5px] border-l-brand-600 bg-brand-50/70 shadow-lg ring-2 ring-brand-100'
          : 'border-slate-200 bg-white shadow-panel'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${priority.className}`}>{priority.label}</span>
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{caseItem.originLabel}</span>
          </div>
          <h3 className="mt-3 text-lg font-bold text-ink">{caseItem.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{caseItem.message || 'Sin observaciones registradas.'}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
            <span>{caseItem.beneficiaryName}</span>
            {caseItem.deliveryLabel && <span>{caseItem.deliveryLabel}</span>}
            <span>{formatDateTime(caseItem.requestedAt)}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">Gestionar</span>
      </div>
    </button>
  );
}

function CarePanel({ caseItem, canEdit, busy, onOpenBeneficiary, onOpenDelivery, onUpdate }) {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');
  const [notifyUser, setNotifyUser] = useState(false);

  useEffect(() => {
    setNotes(caseItem?.notes || '');
    setStatus(caseItem?.status || 'pending');
    setNotifyUser(false);
  }, [caseItem?.id]);

  if (!caseItem) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Panel de gestion</h3>
        <p className="mt-2 text-sm text-slate-500">Selecciona una tarjeta para gestionar la atencion.</p>
      </div>
    );
  }

  const phone = normalizeWhatsAppPhone(caseItem.phone);
  const mailto = caseItem.email ? `mailto:${caseItem.email}` : '';
  const tel = caseItem.phone ? `tel:${caseItem.phone}` : '';
  const whatsApp = phone ? buildWhatsAppUrl(phone, `Hola ${caseItem.beneficiaryName}, te contactamos desde Pan y Esperanza sobre tu solicitud.`) : '';
  const statusChangedToResolved = status === 'applied' && caseItem.status !== 'applied';

  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-panel">
      <div className="border-b border-slate-100 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{caseItem.originLabel}</p>
        <h3 className="mt-1 text-xl font-bold text-ink">{caseItem.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{caseItem.message || 'Sin mensaje registrado.'}</p>
      </div>

      <div className="grid gap-4 p-5">
        <section className="rounded-md border border-brand-100 bg-brand-50/70 p-4">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-700">Resumen</h4>
          <div className="mt-3 grid gap-2 text-sm">
            <InfoLine label="Ultima entrega" value={caseItem.summary?.lastDelivery} />
            <InfoLine label="Proxima entrega" value={caseItem.summary?.nextDelivery} />
            <InfoLine label="Estado documental" value={caseItem.summary?.documentStatus} />
            <InfoLine label="Ultima interaccion" value={caseItem.summary?.lastInteraction} />
            <InfoLine label="Observaciones relevantes" value={caseItem.summary?.relevantNotes} />
          </div>
        </section>

        <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm">
          <InfoLine label="Beneficiario" value={caseItem.beneficiaryName} />
          <InfoLine label="Telefono" value={caseItem.phone || '-'} />
          <InfoLine label="Email" value={caseItem.email || '-'} />
          <InfoLine label="Creada" value={formatDateTime(caseItem.requestedAt)} />
          {caseItem.resolvedAt && <InfoLine label="Resuelta" value={formatDateTime(caseItem.resolvedAt)} />}
        </div>

        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => onOpenBeneficiary(caseItem)} disabled={!caseItem.beneficiaryId}>
              <UserRound size={16} /> Abrir expediente
            </Button>
            <Button variant="secondary" onClick={() => onOpenDelivery(caseItem)} disabled={!caseItem.deliveryId}>
              <PackageCheck size={16} /> Abrir entrega
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="secondary" className="w-full" onClick={() => tel && window.open(tel, '_self')} disabled={!tel}>
              <Phone size={16} /> Llamar
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => whatsApp && window.open(whatsApp, '_blank', 'noopener,noreferrer')} disabled={!whatsApp}>
              <MessageCircle size={16} /> WhatsApp
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => mailto && window.open(mailto, '_self')} disabled={!mailto}>
              <Mail size={16} /> Email
            </Button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)} disabled={!canEdit}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Observaciones internas</span>
          <textarea
            className={inputClass}
            rows="5"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!canEdit}
            placeholder="Añadir seguimiento, llamada realizada o instrucciones para el equipo."
          />
        </label>

        <Button
          variant={notifyUser ? 'secondary' : 'subtle'}
          disabled={!canEdit || status !== 'applied'}
          onClick={() => setNotifyUser((current) => !current)}
        >
          <Bell size={16} />
          {notifyUser ? 'Beneficiario sera notificado' : 'Notificar al beneficiario'}
        </Button>

        {status === 'applied' && !statusChangedToResolved && notifyUser && (
          <p className="rounded-md border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Se enviara una nueva notificacion al portal al actualizar este caso.
          </p>
        )}

        <Button
          disabled={!canEdit || busy}
          onClick={() => onUpdate(caseItem, { status, notes, notifyUser })}
        >
          {busy ? 'Guardando...' : 'Actualizar caso'}
        </Button>
      </div>
    </div>
  );
}

function InfoLine({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value || '-'}</span>
    </div>
  );
}

function buildCases(data) {
  const beneficiariesById = new Map((data.beneficiaries || []).map((item) => [item.id, item]));
  const deliveriesById = new Map((data.deliveries || []).map((item) => [item.id, item]));
  const notifications = data.notificaciones || [];
  const requestCases = (data.beneficiary_portal_profile_updates || [])
    .filter((request) => isAttentionRequest(request))
    .map((request) => {
      const changes = request.requested_changes || {};
      const deliveryId = changes.delivery_id || changes.deliveryId || '';
      const delivery = deliveriesById.get(deliveryId) || null;
      const beneficiary = beneficiariesById.get(request.beneficiary_id) || (delivery ? beneficiariesById.get(delivery.beneficiary_id) : null);
      const notification = findRelatedNotification(notifications, { requestId: request.id, deliveryId, beneficiaryId: request.beneficiary_id });
      const status = normalizeRequestStatus(request.status);
      return {
        id: `request-${request.id}`,
        requestId: request.id,
        deliveryId,
        beneficiaryId: request.beneficiary_id,
        beneficiaryName: beneficiary?.full_name || delivery?.beneficiary_name || 'Beneficiario',
        phone: beneficiary?.phone || '',
        email: beneficiary?.email || '',
        origin: originForRequest(changes),
        originLabel: originLabel(originForRequest(changes)),
        title: titleForRequest(changes, delivery),
        message: request.notes || changes.message || 'Solicitud registrada desde el portal.',
        notes: request.notes || '',
        requestedAt: request.requested_at || request.created_at,
        resolvedAt: request.resolved_at,
        status,
        priority: priorityForRequest(changes, delivery, status),
        deliveryLabel: deliveryLabel(delivery),
        summary: buildCaseSummary({ data, beneficiary, delivery, request, notification }),
        reference: {
          kind: 'profile_update',
          request_id: request.id,
          notification_id: notification?.id || '',
          delivery_id: deliveryId,
          beneficiary_id: request.beneficiary_id
        }
      };
    });

  const requestDeliveryIds = new Set(requestCases.map((item) => item.deliveryId).filter(Boolean));
  const attendanceCases = (data.deliveries || [])
    .filter((delivery) => ['needs_contact', 'unavailable'].includes(delivery.attendance_status))
    .filter((delivery) => !requestDeliveryIds.has(delivery.id))
    .map((delivery) => {
      const beneficiary = beneficiariesById.get(delivery.beneficiary_id) || null;
      const notification = findRelatedNotification(notifications, { deliveryId: delivery.id, beneficiaryId: delivery.beneficiary_id });
      const metadata = notification?.metadata || {};
      const status = normalizeRequestStatus(metadata.social_care_status || 'pending');
      return {
        id: `attendance-${delivery.id}`,
        requestId: '',
        deliveryId: delivery.id,
        beneficiaryId: delivery.beneficiary_id,
        beneficiaryName: beneficiary?.full_name || delivery.beneficiary_name || 'Beneficiario',
        phone: beneficiary?.phone || '',
        email: beneficiary?.email || '',
        origin: 'attendance',
        originLabel: 'Asistencia a entregas',
        title: delivery.attendance_status === 'unavailable' ? 'No podra asistir' : 'Necesita contactar',
        message: delivery.attendance_notes || delivery.attendance_reason || 'La entrega requiere seguimiento del equipo.',
        notes: metadata.social_care_notes || delivery.attendance_notes || '',
        requestedAt: delivery.attendance_confirmed_at || delivery.delivered_at || delivery.created_at,
        resolvedAt: metadata.social_care_resolved_at || null,
        status,
        priority: delivery.attendance_status === 'needs_contact' ? 'urgent' : 'warning',
        deliveryLabel: deliveryLabel(delivery),
        summary: buildCaseSummary({ data, beneficiary, delivery, request: null, notification }),
        reference: {
          kind: 'attendance',
          notification_id: notification?.id || '',
          delivery_id: delivery.id,
          beneficiary_id: delivery.beneficiary_id
        }
      };
    });

  return [...requestCases, ...attendanceCases]
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
}

function isAttentionRequest(request) {
  const changes = requestá.requested_changes || {};
  return Boolean(changes.request_type || changes.message || requestá.notes);
}

function filterCases(cases, filters) {
  const search = normalize(filters.search);
  return cases
    .filter((item) => !filters.quick || matchesQuickFilter(item, filters.quick))
    .filter((item) => !filters.origin || item.origin === filters.origin)
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => {
      if (!search) return true;
      return [
        item.title,
        item.message,
        item.notes,
        item.beneficiaryName,
        item.phone,
        item.email,
        item.deliveryLabel,
        item.originLabel
      ].some((value) => normalize(value).includes(search));
    });
}

function matchesQuickFilter(item, quick) {
  if (quick === 'urgent') return item.priority === 'urgent';
  if (quick === 'today') return isToday(item.requestedAt);
  if (quick === 'pending') return item.status === 'pending';
  if (quick === 'assistant') return item.origin === 'assistant';
  if (quick === 'beneficiaries') return ['beneficiary_portal', 'attendance', 'assistant'].includes(item.origin);
  if (quick === 'collaborators') return item.origin === 'collaborator';
  if (quick === 'donors') return item.origin === 'donor';
  if (quick === 'volunteers') return item.origin === 'volunteer';
  return true;
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function buildMetrics(cases) {
  return cases.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { pending: 0, approved: 0, applied: 0, cancelled: 0 });
}

function normalizeRequestStatus(value) {
  const normalized = normalize(value);
  if (normalized === 'applied' || normalized === 'resolved' || normalized === 'resuelta') return 'applied';
  if (normalized === 'approved' || normalized === 'in_progress' || normalized === 'en gestion') return 'approved';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cancelada') return 'cancelled';
  return 'pending';
}

function statusMeta(status) {
  const classes = {
    pending: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
    approved: 'bg-blue-50 text-blue-800 ring-1 ring-blue-100',
    applied: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
    cancelled: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  };
  const label = STATUS_OPTIONS.find((item) => item.value === status)?.label || 'Pendiente';
  return { label, className: classes[status] || classes.pending };
}

function priorityMeta(priority) {
  const classes = {
    urgent: 'bg-red-50 text-red-800 ring-1 ring-red-100',
    warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
    normal: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
  };
  const labels = { urgent: 'Prioridad alta', warning: 'Prioridad media', normal: 'Seguimiento' };
  return { label: labels[priority] || labels.normal, className: classes[priority] || classes.normal };
}

function metricTone(tone) {
  const classes = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800'
  };
  return classes[tone] || classes.slate;
}

function originForRequest(changes) {
  const requestType = normalize(changes?.request_type);
  if (requestType.includes('assistant')) return 'assistant';
  if (requestType.includes('delivery_attendance')) return 'attendance';
  return 'beneficiary_portal';
}

function originLabel(origin) {
  if (origin === 'assistant') return 'Asistente';
  if (origin === 'attendance') return 'Asistencia a entregas';
  if (origin === 'future') return 'Futuros portales';
  return 'Portal del Beneficiario';
}

function titleForRequest(changes, delivery) {
  const type = normalize(changes?.request_type);
  if (type === 'delivery_attendance_help') return 'Necesita ayuda con la entrega';
  if (type === 'assistant_request') return 'Solicitud creada por asistente';
  if (type === 'informacion' || type === 'informacion general') return 'Solicitud de informacion';
  if (type) return String(changes.request_type || 'Solicitud');
  return delivery ? 'Seguimiento de entrega' : 'Solicitud del portal';
}

function priorityForRequest(changes, delivery, status) {
  if (status === 'applied' || status === 'cancelled') return 'normal';
  if (normalize(changes?.request_type) === 'delivery_attendance_help') return 'urgent';
  if (delivery?.attendance_status === 'needs_contact') return 'urgent';
  if (delivery?.attendance_status === 'unavailable') return 'warning';
  return 'normal';
}

function deliveryLabel(delivery) {
  if (!delivery) return '';
  return [
    delivery.receipt_number ? `Entrega ${delivery.receipt_number}` : 'Entrega',
    formatDate(delivery.delivered_at),
    delivery.help_type
  ].filter(Boolean).join(' · ');
}

function buildCaseSummary({ data, beneficiary, delivery, request, notification }) {
  const beneficiaryId = beneficiary?.id || delivery?.beneficiary_id || requestá.beneficiary_id || '';
  const beneficiaryDeliveries = (data.deliveries || [])
    .filter((item) => item.beneficiary_id === beneficiaryId)
    .sort((a, b) => String(a.delivered_at || a.created_at || '').localeCompare(String(b.delivered_at || b.created_at || '')));
  const now = Date.now();
  const pastDeliveries = beneficiaryDeliveries.filter((item) => dateValue(item.delivered_at || item.created_at) <= now);
  const futureDeliveries = beneficiaryDeliveries.filter((item) => dateValue(item.delivered_at || item.created_at) > now);
  const lastDelivery = pastDeliveries[pastDeliveries.length - 1] || delivery || null;
  const nextDelivery = futureDeliveries[0] || null;
  const relevantNotes = [
    requestá.notes,
    requestá.requested_changes?.message,
    delivery?.attendance_notes,
    delivery?.attendance_reason,
    beneficiary?.notes,
    beneficiary?.observations
  ].find(Boolean);

  return {
    lastDelivery: summaryDeliveryLabel(lastDelivery) || 'Sin entregas registradas',
    nextDelivery: summaryDeliveryLabel(nextDelivery) || 'Sin entrega futura registrada',
    documentStatus: documentStatusFor(data, beneficiaryId),
    lastInteraction: formatDateTime(notification?.created_at || requestá.requested_at || requestá.created_at || delivery?.attendance_confirmed_at || delivery?.created_at) || '-',
    relevantNotes: relevantNotes || 'Sin observaciones relevantes'
  };
}

function summaryDeliveryLabel(delivery) {
  if (!delivery) return '';
  return [
    formatDate(delivery.delivered_at || delivery.created_at),
    delivery.delivery_time || delivery.time,
    delivery.location,
    delivery.help_type,
    delivery.status
  ].filter(Boolean).join(' - ');
}

function documentStatusFor(data, beneficiaryId) {
  const documents = (data.beneficiary_documents || data.documentos_beneficiarios || [])
    .filter((document) => document.beneficiary_id === beneficiaryId);
  if (!documents.length) return 'Sin documentos registrados';
  const pending = documents.filter((document) => {
    const status = normalize(document.status || document.estado || document.review_status);
    return status.includes('pendiente') || status.includes('required') || status.includes('requerido') || status.includes('caducado');
  });
  if (pending.length) return `${pending.length} documento${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'}`;
  return 'Documentacion al dia';
}

function dateValue(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function findRelatedNotification(notifications, { requestId = '', deliveryId = '', beneficiaryId = '' } = {}) {
  return notifications.find((notification) => {
    const metadata = notification.metadata || {};
    return (requestId && metadata.request_id === requestId)
      || (deliveryId && (metadata.delivery_id === deliveryId || (notification.entity_type === 'delivery' && notification.entity_id === deliveryId)))
      || (requestId && notification.entity_id === requestId)
      || (beneficiaryId && metadata.beneficiary_id === beneficiaryId && metadata.request_id === requestId);
  }) || null;
}
