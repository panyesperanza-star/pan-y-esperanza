import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Info,
  Search,
  ShieldAlert
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { inputClass } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { formatDateTime, normalize } from '../lib/formatters';
import {
  NOTIFICATION_MODULES,
  NOTIFICATION_TYPES,
  notificationModuleLabel,
  notificationTypeLabel
} from '../services/notifications/NotificacionService';

const iconByType = {
  info: Info,
  warning: AlertTriangle,
  reminder: Clock3,
  urgent: ShieldAlert,
  error: AlertCircle
};

export function Notifications({ data, actions, onNavigate }) {
  const [filters, setFilters] = useState({ search: '', moduleId: '', type: '' });
  const notifications = data.notificaciones || [];
  const filteredNotifications = useMemo(
    () => filterNotifications(notifications, filters),
    [notifications, filters]
  );
  const unread = notifications.filter((item) => !isRead(item));
  const urgent = notifications.filter((item) => normalizedType(item) === 'urgent' && !isRead(item));
  const reminders = notifications.filter((item) => normalizedType(item) === 'reminder' && !isRead(item));
  const errors = notifications.filter((item) => normalizedType(item) === 'error' && !isRead(item));

  return (
    <>
      <PageHeader
        title="CENTRO DE NOTIFICACIONES"
        description="Avisos cronologicos de beneficiarios, inventario, entregas, donaciones, voluntarios, recursos y configuracion."
        actions={(
          <Button
            variant="secondary"
            onClick={() => actions.markAllNotificationsRead?.()}
            disabled={!unread.length}
          >
            <CheckCircle2 size={16} /> Marcar todas como leidas
          </Button>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NotificationMetric label="Pendientes" value={unread.length} icon={Bell} tone="blue" />
        <NotificationMetric label="Urgentes" value={urgent.length} icon={ShieldAlert} tone="red" />
        <NotificationMetric label="Recordatorios" value={reminders.length} icon={Clock3} tone="orange" />
        <NotificationMetric label="Errores" value={errors.length} icon={AlertCircle} tone="slate" />
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="block">
            <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700"><Search size={16} /> Buscar</span>
            <input
              className={inputClass}
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Buscar por titulo, mensaje u origen"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Módulo</span>
            <select
              className={inputClass}
              value={filters.moduleId}
              onChange={(event) => setFilters((current) => ({ ...current, moduleId: event.target.value }))}
            >
              <option value="">Todos</option>
              {NOTIFICATION_MODULES.map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Prioridad</span>
            <select
              className={inputClass}
              value={filters.type}
              onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="">Todas</option>
              {NOTIFICATION_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="font-bold text-ink">Lista cronologica</h3>
          <p className="mt-1 text-sm text-slate-500">{filteredNotifications.length} notificaciones visibles</p>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredNotifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onRead={() => actions.markNotificationRead?.(notification.id)}
              onOpen={() => openNotification(notification, onNavigate)}
            />
          ))}
          {!filteredNotifications.length && (
            <div className="p-6 text-sm text-slate-500">No hay notificaciones con los filtros actuales.</div>
          )}
        </div>
      </section>
    </>
  );
}

function NotificationMetric({ label, value, icon: Icon, tone }) {
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

function NotificationRow({ notification, onRead, onOpen }) {
  const type = normalizedType(notification);
  const Icon = iconByType[type] || Info;
  const read = isRead(notification);

  return (
    <article className={`p-4 ${read ? 'bg-white' : 'bg-brand-50/50'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${typeBadgeClass(type)}`}>
              <Icon size={14} /> {notificationTypeLabel(type)}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
              {notificationModuleLabel(notification.modulo)}
            </span>
            {!read && <span className="rounded-md bg-brand-600 px-2 py-1 text-xs font-bold text-white">Pendiente</span>}
          </div>
          <h3 className="mt-3 text-lg font-bold text-ink">{notification.titulo}</h3>
          <p className="mt-1 text-sm text-slate-600">{notification.mensaje}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            {formatDateTime(notification.created_at)} - Origen: {notification.origen || notificationModuleLabel(notification.modulo)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {(notification.action_url || notification.metadata?.request_id || notification.entity_type === 'beneficiary_portal') && (
            <Button variant="secondary" onClick={onOpen}>
              Abrir módulo
            </Button>
          )}
          {!read && (
            <Button variant="secondary" onClick={onRead}>
              <CheckCircle2 size={16} /> Marcar leida
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function openNotification(notification, onNavigate) {
  const requestId = notification.metadata?.request_id;
  if (requestId && onNavigate) {
    onNavigate({ moduleId: 'social-care', requestId });
    return;
  }
  if (notification.entity_type === 'beneficiary_portal' && notification.entity_id && onNavigate) {
    onNavigate({ moduleId: 'social-care', requestId: notification.entity_id });
    return;
  }
  if (notification.metadata?.delivery_id && notification.metadata?.attendance_status && onNavigate) {
    onNavigate({ moduleId: 'social-care', itemId: notification.metadata.delivery_id });
    return;
  }
  if (notification.action_url) {
    window.history.pushState({}, '', notification.action_url);
    window.dispatchEvent(new Event('popstate'));
  }
}

function filterNotifications(notifications, filters) {
  const search = normalize(filters.search);
  return [...notifications]
    .filter((item) => !filters.moduleId || normalizeModule(item.modulo) === filters.moduleId)
    .filter((item) => !filters.type || normalizedType(item) === filters.type)
    .filter((item) => {
      if (!search) return true;
      return [item.titulo, item.mensaje, item.origen, item.modulo]
        .some((value) => normalize(value).includes(search));
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function isRead(notification) {
  return notification?.leida === true || normalize(notification?.estado) === 'leida' || Boolean(notification?.read_at);
}

function normalizedType(notification) {
  const value = normalize(notification?.tipo || notification?.prioridad);
  if (value.includes('urgent')) return 'urgent';
  if (value.includes('urgente')) return 'urgent';
  if (value.includes('error')) return 'error';
  if (value.includes('record')) return 'reminder';
  if (value.includes('aviso') || value.includes('warning')) return 'warning';
  return 'info';
}

function normalizeModule(value) {
  const normalized = normalize(value);
  const aliases = {
    beneficiarios: 'beneficiaries',
    beneficiaries: 'beneficiaries',
    inventario: 'inventory',
    inventory: 'inventory',
    entregas: 'deliveries',
    deliveries: 'deliveries',
    donaciones: 'donations',
    donations: 'donations',
    voluntarios: 'volunteers',
    volunteers: 'volunteers',
    recursos: 'resources',
    resources: 'resources',
    solicitudes: 'social-care',
    'social-care': 'social-care',
    socialcare: 'social-care',
    configuracion: 'settings',
    settings: 'settings',
    dashboard: 'dashboard'
  };
  return aliases[normalized] || value;
}

function metricTone(tone) {
  const classes = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800'
  };
  return classes[tone] || classes.blue;
}

function typeBadgeClass(type) {
  const classes = {
    info: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-yellow-50 text-yellow-700',
    reminder: 'bg-orange-50 text-orange-700',
    urgent: 'bg-red-50 text-red-700',
    error: 'bg-slate-100 text-slate-700'
  };
  return classes[type] || classes.info;
}
