import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Brain,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Gift,
  HandHeart,
  HandCoins,
  KeyRound,
  Mail,
  Megaphone,
  PackageCheck,
  Play,
  Receipt,
  ShieldAlert,
  UserCheck,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { canAccess, getUserStatus } from '../lib/auth';
import { getApiHeaders } from '../lib/apiAuth';
import { fetchEdgeFunction, readEdgeJson } from '../lib/edgeFunctions';
import { formatDate, formatDateTime, normalize, todayISO } from '../lib/formatters';
import { hasSupabaseConfig } from '../lib/supabase';
import { DashboardService } from '../services/dashboard/DashboardService';

const STALE_HELP_DAYS = 30;
const EXPIRY_WINDOW_DAYS = 30;
const FAMILY_LIMIT = 6;
const LIST_LIMIT = 4;
const fallbackDashboardService = new DashboardService();

export function Dashboard({ data, actions, currentUser, onNavigate }) {
  const today = todayISO();
  const dashboardService = actions?.dashboard || fallbackDashboardService;
  const [secureSummary, setSecureSummary] = useState({
    pendingPasswordResets: null,
    loading: false,
    error: ''
  });

  useEffect(() => {
    let cancelled = false;
    const canReadUserOperations = hasSupabaseConfig && canAccess(currentUser, 'users');
    if (!canReadUserOperations) {
      setSecureSummary({ pendingPasswordResets: null, loading: false, error: '' });
      return () => { cancelled = true; };
    }

    async function loadSecureSummary() {
      setSecureSummary((current) => ({ ...current, loading: true, error: '' }));
      try {
        const response = await fetchEdgeFunction('operations-summary', {
          method: 'GET',
          headers: await getApiHeaders()
        });
        const payload = await readEdgeJson(response);
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el resumen protegido.');
        if (!cancelled) {
          setSecureSummary({
            pendingPasswordResets: Number(payload.pendingPasswordResets || 0),
            loading: false,
            error: ''
          });
        }
      } catch (error) {
        console.warn('[Centro de operaciones] No se pudo cargar resumen protegido', { message: error.message });
        if (!cancelled) setSecureSummary({ pendingPasswordResets: null, loading: false, error: error.message });
      }
    }

    loadSecureSummary();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.email]);

  const operations = useMemo(
    () => dashboardService.buildOperationsCenter({ data, today, pendingPasswordResets: secureSummary.pendingPasswordResets }),
    [dashboardService, data, today, secureSummary.pendingPasswordResets]
  );

  function openModule(destination) {
    const moduleId = getDestinationModule(destination);
    if (!moduleId || !canAccess(currentUser, moduleId)) return;
    onNavigate?.(destination);
  }

  const familyModule = canAccess(currentUser, 'beneficiaries')
      ? 'beneficiaries'
      : canAccess(currentUser, 'families')
        ? 'families'
        : null;
  const priorityCards = buildPriorityCards(operations, currentUser, familyModule);
  const quickItems = buildQuickItems(operations, currentUser, familyModule);
  const tasks = buildTasks(operations, currentUser, familyModule);
  const assistant = buildAssistantState(operations, currentUser, familyModule);
  const communicationCards = buildCommunicationCards(operations, currentUser, secureSummary);
  const summaryCards = buildSummaryCards(operations, data, currentUser);
  const canSeeFamilies = Boolean(familyModule);
  const canSeeInventory = canAccess(currentUser, 'inventory');

  return (
    <>
      <PageHeader title="CENTRO DE OPERACIONES" description="Página principal para decidir qué necesita Pan y Esperanza hoy." />
      <IntelligentOperationsCenter
        operations={operations}
        assistant={assistant}
        quickItems={quickItems}
        tasks={tasks}
        priorityCards={priorityCards}
        communicationCards={communicationCards}
        currentUser={currentUser}
        today={today}
        familyModule={familyModule}
        canSeeFamilies={canSeeFamilies}
        canSeeInventory={canSeeInventory}
        onOpen={openModule}
      />
    </>
  );
}

function IntelligentOperationsCenter({
  operations,
  assistant,
  quickItems,
  tasks,
  priorityCards,
  communicationCards,
  currentUser,
  today,
  familyModule,
  canSeeFamilies,
  canSeeInventory,
  onOpen
}) {
  const summaryIcons = [CalendarClock, PackageCheck, Bell, Megaphone, Boxes, HandHeart, FileText, Users];
  const summaryItems = (operations.daySummary || []).map((item, index) => ({
    ...item,
    icon: summaryIcons[index] || Activity
  }));
  const mainPriority = priorityCards.find((card) => Number(card.value) > 0) || priorityCards[0];
  const mainTask = tasks[0];
  const notifications = operations.unreadNotifications || [];
  const campaigns = operations.activeCampaigns || [];

  const statusCards = [
    {
      title: 'Entregas de hoy',
      value: operations.todayDeliveries.length,
      detail: 'Pendientes de coordinar o revisar',
      icon: PackageCheck,
      tone: 'blue',
      destination: canAccess(currentUser, 'deliveries') ? { moduleId: 'deliveries' } : null
    },
    {
      title: 'Agenda Operativa',
      value: operations.todayAgenda.length,
      detail: 'Eventos y tareas del dia',
      icon: CalendarClock,
      tone: 'green',
      destination: canAccess(currentUser, 'agenda') ? { moduleId: 'agenda' } : null
    },
    {
      title: 'Notificaciones',
      value: notifications.length,
      detail: 'Avisos sin leer',
      icon: Bell,
      tone: notifications.length ? 'orange' : 'green',
      destination: canAccess(currentUser, 'notifications') ? { moduleId: 'notifications' } : null
    },
    {
      title: 'Campanas activas',
      value: campaigns.length,
      detail: 'Planificacion en marcha',
      icon: Megaphone,
      tone: campaigns.length ? 'blue' : 'slate',
      destination: canAccess(currentUser, 'agenda') ? { moduleId: 'agenda', filter: 'campaigns' } : null
    },
    {
      title: 'Documentacion',
      value: uniqueDocumentIssueCount(operations),
      detail: 'Pendientes, caducados y renovaciones',
      icon: FileText,
      tone: operations.expiredDocuments?.length ? 'red' : uniqueDocumentIssueCount(operations) ? 'orange' : 'green',
      destination: canAccess(currentUser, 'beneficiaries') ? buildDocumentDestination(operations.documentAttention, operations.pendingDocuments) : null
    }
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-brand-700 bg-brand-700 p-5 text-white shadow-panel">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Centro de operaciones inteligente</p>
            <h2 className="mt-2 max-w-5xl text-2xl font-bold leading-tight sm:text-3xl">
              Buenos dias, {displayUserName(currentUser)}. Esta es la situacion operativa de hoy.
            </h2>
            <div className="mt-4 rounded-md bg-white/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Resumen del dia</p>
              <p className="mt-1 text-sm font-semibold text-white">{assistant.recommendation}</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => (
                <HeroSummaryCard key={item.label} item={item} />
              ))}
            </div>
          </div>

          <aside className="rounded-md border border-white/15 bg-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Prioridad inmediata</p>
                <h3 className="mt-1 text-lg font-bold">{mainPriority?.title || 'Jornada estable'}</h3>
              </div>
              <Brain size={24} className="text-brand-100" />
            </div>
            <p className="mt-3 text-sm text-brand-50">
              {mainTask?.detail || assistant.message || 'No hay asuntos urgentes con los datos actuales.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => onOpen(assistant.primaryDestination || mainPriority?.destination)}
              disabled={!assistant.primaryDestination && !mainPriority?.destination}
              className="mt-4 h-11 w-full border-white bg-white px-4 text-brand-700 hover:bg-brand-50"
            >
              <Play size={18} /> Comenzar jornada
            </Button>
            <div className="mt-4 grid gap-2">
              {statusCards.map((card) => (
                <StatusCommandCard key={card.title} card={card} onOpen={onOpen} />
              ))}
            </div>
          </aside>
        </div>
      </section>

      <CommandPanel
        title="Prioridades del sistema"
        subtitle="Motor de reglas preparado para evolucionar a IA."
        icon={ShieldAlert}
        action="Abrir agenda"
        onAction={canAccess(currentUser, 'agenda') ? () => onOpen({ moduleId: 'agenda' }) : null}
      >
        <SystemPrioritiesPanel priorities={operations.systemPriorities} onOpen={onOpen} />
      </CommandPanel>

      {canAccess(currentUser, 'social-resources') && (
        <CommandPanel
          title="Recursos Sociales"
          subtitle="Convocatorias, verificaciones y beneficiarios potencialmente afectados."
          icon={Landmark}
          action="Abrir centro"
          onAction={() => onOpen({ moduleId: 'social-resources' })}
        >
          <SocialResourcesOperationsBlock monitoring={operations.socialResourceMonitoring} onOpen={onOpen} />
        </CommandPanel>
      )}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <CommandPanel
          title="Agenda Operativa"
          subtitle="Planificacion de hoy, entregas y eventos relevantes."
          icon={CalendarClock}
          action="Abrir agenda"
          onAction={canAccess(currentUser, 'agenda') ? () => onOpen({ moduleId: 'agenda' }) : null}
        >
          <OperationalTimeline items={operations.todayAgenda || []} empty="No hay eventos planificados para hoy." />
        </CommandPanel>

        <CommandPanel
          title="Beneficiarios prioritarios"
          subtitle="Casos que requieren decision o seguimiento."
          icon={HandHeart}
          action="Abrir expedientes"
          onAction={canSeeFamilies ? () => onOpen({ moduleId: familyModule }) : null}
        >
          <FamilyFocusList families={operations.priorityFamilies || []} familyModule={familyModule} onOpen={onOpen} />
        </CommandPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <CommandPanel title="Acciones rapidas" subtitle="Atajos operativos del dia." icon={ArrowRight}>
          <QuickActionGrid items={quickItems} onOpen={onOpen} />
        </CommandPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <CommandPanel
            title="Notificaciones"
            subtitle="Avisos vivos y comunicaciones pendientes."
            icon={Bell}
            action="Abrir centro"
            onAction={canAccess(currentUser, 'notifications') ? () => onOpen({ moduleId: 'notifications' }) : null}
          >
            <NotificationFocusList notifications={notifications} communicationCards={communicationCards} onOpen={onOpen} />
          </CommandPanel>

          <CommandPanel title="Bloque IA preparado" subtitle="Resumen inteligente listo para activarse." icon={Brain}>
            <AICommandBlock panel={operations.aiPanel} />
          </CommandPanel>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <CommandPanel
          title="Productos criticos"
          subtitle="Stock bajo, agotados y caducidades."
          icon={Boxes}
          action="Ir a inventario"
          onAction={canSeeInventory ? () => onOpen({ moduleId: 'inventory', filter: 'stock-critical' }) : null}
        >
          <ProductCriticalList items={operations.criticalProducts || []} today={today} />
        </CommandPanel>

        <CommandPanel
          title="Donaciones recientes"
          subtitle="Ultimos movimientos registrados."
          icon={Gift}
          action="Ver donaciones"
          onAction={canAccess(currentUser, 'donations') ? () => onOpen({ moduleId: 'donations' }) : null}
        >
          <DonationFocusList items={operations.recentDonations || []} />
        </CommandPanel>

        <CommandPanel
          title="Voluntarios disponibles"
          subtitle="Personas con disponibilidad registrada."
          icon={Users}
          action="Ver voluntarios"
          onAction={canAccess(currentUser, 'volunteers') ? () => onOpen({ moduleId: 'volunteers' }) : null}
        >
          <VolunteerFocusList items={operations.availableVolunteers || []} />
        </CommandPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <CommandPanel
          title="Recursos pendientes"
          subtitle="Contenido listo para revisar o publicar."
          icon={BookOpen}
          action="Abrir recursos"
          onAction={getResourcesDestination(currentUser) ? () => onOpen(getResourcesDestination(currentUser)) : null}
        >
          <ResourceFocusList items={operations.pendingResources || []} />
        </CommandPanel>

        <CommandPanel title="Actividad reciente" subtitle="Ultimos cambios consolidados por el sistema." icon={Activity}>
          <ActivityFocusList items={operations.recentActivity || []} />
        </CommandPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <CommandPanel title="Campanas activas" subtitle="Iniciativas operativas en marcha." icon={Megaphone}>
          <CampaignFocusList items={campaigns} />
        </CommandPanel>

        <CommandPanel title="Tareas recomendadas" subtitle="Siguiente trabajo sugerido por prioridad." icon={CheckCircle2}>
          <TaskFocusList tasks={tasks} onOpen={onOpen} />
        </CommandPanel>
      </section>
    </div>
  );
}

function HeroSummaryCard({ item }) {
  const Icon = item.icon || Activity;
  return (
    <article className="rounded-md border border-white/10 bg-white/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-white/15 p-2 text-brand-50">
          <Icon size={18} />
        </span>
        <p className="text-2xl font-bold">{formatNumber(item.value)}</p>
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-brand-100">{item.label}</p>
    </article>
  );
}

function StatusCommandCard({ card, onOpen }) {
  const Icon = card.icon || Activity;
  const clickable = Boolean(card.destination);
  const content = (
    <>
      <span className={`rounded-md p-2 ${toneSoftClasses(card.tone)}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-white">{card.title}</span>
        <span className="block truncate text-xs text-brand-100">{card.detail}</span>
      </span>
      <span className="text-xl font-bold text-white">{formatNumber(card.value)}</span>
    </>
  );
  if (!clickable) {
    return <div className="flex items-center gap-3 rounded-md bg-white/10 p-3">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(card.destination)}
      className="focus-ring flex w-full items-center gap-3 rounded-md bg-white/10 p-3 text-left transition hover:bg-white/15"
    >
      {content}
    </button>
  );
}

function CommandPanel({ title, subtitle, icon: Icon, action, onAction, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-md bg-brand-50 p-2 text-brand-700">
            <Icon size={20} />
          </span>
          <div>
            <h3 className="font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {onAction && (
          <Button variant="secondary" onClick={onAction} className="shrink-0">
            {action || 'Abrir'}
          </Button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OperationalTimeline({ items, empty }) {
  if (!items.length) return <EmptyState title={empty} text="La agenda queda preparada para nuevas necesidades." />;
  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item, index) => (
        <article key={item.id || `agenda-${index}`} className="flex gap-3 rounded-md border border-slate-100 bg-slate-50 p-3">
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md bg-white text-center shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-400">{item.date ? formatDate(item.date).slice(0, 5) : 'Hoy'}</span>
            <span className="text-xs font-semibold text-brand-700">{item.date ? formatDateTime(item.date).slice(-5) : '--:--'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-ink">{item.title}</h4>
            <p className="mt-1 text-sm text-slate-600">{item.detail || 'Sin detalle'}</p>
            <span className="mt-2 inline-flex rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{item.status || 'Pendiente'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function FamilyFocusList({ families, familyModule, onOpen }) {
  if (!families.length) return <EmptyState title="No hay beneficiarios prioritarios." text="No hay asuntos urgentes con los datos actuales." />;
  return (
    <div className="space-y-3">
      {families.slice(0, 5).map((family) => (
        <button
          key={family.id}
          type="button"
          onClick={() => onOpen(buildFamilyDetailDestination(family, familyModule))}
          className="focus-ring w-full rounded-md border border-slate-100 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-panel"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-ink">{family.name}</h4>
              <p className="mt-1 text-sm text-slate-600">{family.reason}</p>
            </div>
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${priorityBadgeClasses(family.priorityLevel)}`}>{family.priorityLevel}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function QuickActionGrid({ items, onOpen }) {
  if (!items.length) return <EmptyState title="Sin acciones rapidas." text="No hay accesos disponibles con tus permisos." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.slice(0, 6).map((item) => (
        <button
          key={item.title}
          type="button"
          onClick={() => onOpen(item.destination || item.moduleId)}
          className={`focus-ring rounded-md border p-3 text-left shadow-panel transition hover:-translate-y-0.5 ${quickToneClasses(item.tone)}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-md bg-white/70 p-2"><item.icon size={18} /></span>
            <span className="text-xl font-bold">{formatNumber(item.value)}</span>
          </div>
          <p className="mt-3 text-sm font-bold">{item.title}</p>
        </button>
      ))}
    </div>
  );
}

function NotificationFocusList({ notifications, communicationCards, onOpen }) {
  const communicationItems = communicationCards.map((card) => ({
    id: `communication-${card.title}`,
    title: card.title,
    detail: card.detail,
    value: card.value,
    destination: card.destination || card.moduleId
  }));
  const items = [
    ...notifications.map((item) => ({
      id: item.id,
      title: item.titulo || item.title || item.origen || 'Notificacion',
      detail: item.mensaje || item.detail || 'Aviso pendiente',
      value: item.prioridad || item.tipo || 'Pendiente',
      destination: item.moduleId ? { moduleId: item.moduleId } : { moduleId: 'notifications' }
    })),
    ...communicationItems
  ];
  if (!items.length) return <EmptyState title="Sin notificaciones pendientes." text="El centro no tiene avisos activos." />;
  return (
    <div className="space-y-3">
      {items.slice(0, 5).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item.destination)}
          className="focus-ring w-full rounded-md border border-slate-100 bg-slate-50 p-3 text-left transition hover:bg-white hover:shadow-panel"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate font-bold text-ink">{item.title}</h4>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.detail}</p>
            </div>
            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{item.value}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function AICommandBlock({ panel }) {
  return (
    <div className="rounded-md border border-brand-100 bg-brand-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-brand-700">{panel?.status || 'Preparado'}</span>
        <Brain size={20} className="text-brand-700" />
      </div>
      <p className="mt-3 text-sm font-semibold text-brand-900">{panel?.summary || 'Preparado para generar resumen inteligente cuando se active IA.'}</p>
      <div className="mt-3 space-y-2">
        {(panel?.recommendations || []).slice(0, 3).map((item) => (
          <div key={item} className="rounded-md bg-white p-2 text-sm text-slate-700">{item}</div>
        ))}
      </div>
    </div>
  );
}

function SystemPrioritiesPanel({ priorities, onOpen }) {
  const items = priorities?.items || [];
  if (!items.length) {
    return <EmptyState title="Sin prioridades automaticas." text="El motor no detecta asuntos operativos relevantes con los datos actuales." />;
  }

  const counters = [
    { label: 'Criticas', value: priorities.criticalCount, tone: 'bg-red-50 text-red-700' },
    { label: 'Altas', value: priorities.highCount, tone: 'bg-orange-50 text-orange-700' },
    { label: 'Medias', value: priorities.mediumCount, tone: 'bg-blue-50 text-blue-700' }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {counters.map((counter) => (
          <article key={counter.label} className={`rounded-md px-3 py-2 ${counter.tone}`}>
            <p className="text-2xl font-bold">{formatNumber(counter.value)}</p>
            <p className="text-xs font-bold uppercase tracking-wide">{counter.label}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.slice(0, 6).map((item) => {
          const destination = item.destination || item.moduleId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(destination)}
              disabled={!destination}
              className="focus-ring rounded-md border border-slate-100 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-panel disabled:cursor-not-allowed disabled:opacity-70"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.rule}</p>
                  <h4 className="mt-1 font-bold text-ink">{item.title}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.detail}</p>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${priorityBadgeClasses(item.priority)}`}>{item.priority}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-md bg-white px-2 py-1">{item.dueLabel}</span>
                <span className="rounded-md bg-white px-2 py-1">{item.recommendedAction}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function ProductCriticalList({ items, today }) {
  if (!items.length) return <EmptyState title="No hay productos criticos." text="Inventario estable por ahora." />;
  return (
    <div className="space-y-3">
      {items.slice(0, LIST_LIMIT).map((item) => (
        <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-ink">{item.name}</h4>
              <p className="mt-1 text-sm text-slate-600">Stock: {formatNumber(item.stock)} {item.unit || ''}. Minimo: {formatNumber(item.low_stock_threshold)}.</p>
            </div>
            <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Critico</span>
          </div>
          {item.expires_at && <p className="mt-2 text-xs font-semibold text-slate-500">{formatExpiry(item.expires_at, today)}</p>}
        </article>
      ))}
    </div>
  );
}

function DonationFocusList({ items }) {
  if (!items.length) return <EmptyState title="No hay donaciones recientes." text="Todavía no hay movimientos para mostrar." />;
  return (
    <div className="space-y-3">
      {items.slice(0, LIST_LIMIT).map((item) => (
        <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <h4 className="font-bold text-ink">{item.donor || 'Donante sin nombre'}</h4>
          <p className="mt-1 text-sm text-slate-600">{item.donation_type || item.category || 'Donacion registrada'}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(item.donated_at || item.created_at)}</p>
        </article>
      ))}
    </div>
  );
}

function VolunteerFocusList({ items }) {
  if (!items.length) return <EmptyState title="No hay voluntarios disponibles." text="No hay disponibilidad registrada." />;
  return (
    <div className="space-y-3">
      {items.slice(0, LIST_LIMIT).map((item) => (
        <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <h4 className="font-bold text-ink">{item.full_name}</h4>
          <p className="mt-1 text-sm text-slate-600">{item.availability || 'Disponibilidad sin detallar'}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">{item.training || item.documentation || 'Expediente de voluntariado'}</p>
        </article>
      ))}
    </div>
  );
}

function ResourceFocusList({ items }) {
  if (!items.length) return <EmptyState title="No hay recursos pendientes." text="El centro de recursos no tiene revisiones abiertas." />;
  return (
    <div className="space-y-3">
      {items.slice(0, LIST_LIMIT).map((item) => (
        <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <h4 className="font-bold text-ink">{item.titulo || item.title || 'Recurso sin titulo'}</h4>
          <p className="mt-1 text-sm text-slate-600">{item.categoria_nombre || item.categoria_slug || item.tipo || 'Recurso'}</p>
          <span className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{item.status || item.estado || 'pendiente'}</span>
        </article>
      ))}
    </div>
  );
}

function SocialResourcesOperationsBlock({ monitoring = {}, onOpen }) {
  const closingThisWeek = (monitoring.closingSoon || []).filter((item) => Number(item.deadline?.daysRemaining) <= 7);
  const metricItems = [
    { label: 'Convocatorias nuevas', value: (monitoring.newlyCreated || []).length, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Cierran esta semana', value: closingThisWeek.length, tone: 'bg-red-50 text-red-700' },
    { label: 'Pendientes de revision', value: (monitoring.pendingDetections || []).length, tone: 'bg-amber-50 text-amber-800' },
    { label: 'Beneficiarios pendientes', value: monitoring.pendingBeneficiaryCount || 0, tone: 'bg-brand-50 text-brand-700' }
  ];
  const focusItems = [
    ...(monitoring.affectedByNewResource || []).slice(0, 2).map((item) => ({
      id: `new-${item.resource.id}`,
      title: item.resource.name,
      detail: `${item.affectedCount || 0} posibles beneficiarios compatibles.`,
      tone: 'bg-blue-50 text-blue-700',
      destination: { moduleId: 'social-resources', resourceId: item.resource.id },
      beneficiaryDestination: item.affectedCount ? {
        moduleId: 'beneficiaries',
        beneficiaryIds: item.beneficiaries.map((beneficiary) => beneficiary.id),
        label: `${item.resource.name}: ${item.affectedCount} posibles beneficiarios`
      } : null
    })),
    ...(monitoring.closingSoon || []).slice(0, 2).map((item) => ({
      id: `closing-${item.resource.id}`,
      title: item.resource.name,
      detail: `Finaliza en ${item.deadline.daysRemaining} dia${item.deadline.daysRemaining === 1 ? '' : 's'}.`,
      tone: 'bg-red-50 text-red-700',
      destination: { moduleId: 'social-resources', resourceId: item.resource.id }
    })),
    ...(monitoring.needsReview || []).slice(0, 2).map((item) => ({
      id: `review-${item.resource.id}`,
      title: item.resource.name,
      detail: 'Fuente oficial o fecha de comprobacion pendiente.',
      tone: 'bg-amber-50 text-amber-800',
      destination: { moduleId: 'social-resources', resourceId: item.resource.id }
    })),
    ...(monitoring.pendingDetections || []).slice(0, 2).map((item) => ({
      id: `detection-${item.id}`,
      title: item.title,
      detail: `${item.detection_type || 'Deteccion'} pendiente de revision humana.`,
      tone: 'bg-amber-50 text-amber-800',
      destination: { moduleId: 'social-resources', detectionId: item.id }
    }))
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {metricItems.map((item) => (
          <article key={item.label} className={`rounded-md px-3 py-2 ${item.tone}`}>
            <p className="text-2xl font-bold">{formatNumber(item.value)}</p>
            <p className="text-xs font-bold uppercase tracking-wide">{item.label}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {focusItems.slice(0, 4).map((item) => (
          <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-ink">{item.title}</h4>
                <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-bold ${item.tone}`}>Recursos</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onOpen(item.destination)}>Ver recurso</Button>
              {item.beneficiaryDestination && <Button variant="secondary" onClick={() => onOpen(item.beneficiaryDestination)}>Ver beneficiarios</Button>}
            </div>
          </article>
        ))}
        {!focusItems.length && <EmptyState title="Recursos sociales al dia." text="No hay convocatorias nuevas, cierres urgentes ni revisiones pendientes." />}
      </div>
    </div>
  );
}

function ActivityFocusList({ items }) {
  if (!items.length) return <EmptyState title="Sin actividad reciente." text="Todavía no hay movimientos consolidados." />;
  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item) => (
        <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-ink">{item.title}</h4>
              <p className="mt-1 text-sm text-slate-600">{item.detail || 'Registro actualizado'}</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{item.date ? formatDateTime(item.date) : 'Sin fecha'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function CampaignFocusList({ items }) {
  if (!items.length) return <EmptyState title="No hay campanas activas." text="No hay iniciativas operativas abiertas." />;
  return (
    <div className="space-y-3">
      {items.slice(0, LIST_LIMIT).map((item) => (
        <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-ink">{item.name || item.nombre || item.title || 'Campana operativa'}</h4>
              <p className="mt-1 text-sm text-slate-600">{item.description || item.descripcion || item.responsible || 'Planificacion activa'}</p>
            </div>
            <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{item.status || 'Activa'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function TaskFocusList({ tasks, onOpen }) {
  if (!tasks.length) return <EmptyState title="Sin tareas recomendadas." text="Todo correcto por ahora." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {tasks.slice(0, 4).map((task) => (
        <button
          key={task.title}
          type="button"
          onClick={() => onOpen(task.destination || task.moduleId)}
          className="focus-ring rounded-md border border-slate-100 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-panel"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-ink">{task.title}</h4>
              <p className="mt-1 text-sm text-slate-600">{task.detail}</p>
            </div>
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${priorityBadgeClasses(task.priority)}`}>{task.priority}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function toneSoftClasses(tone) {
  const classes = {
    red: 'bg-red-50 text-red-700',
    orange: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-sky-50 text-sky-700',
    slate: 'bg-slate-50 text-slate-700'
  };
  return classes[tone] || classes.slate;
}

function priorityBadgeClasses(priority) {
  const normalized = normalize(priority);
  if (normalized.includes('critica')) return 'bg-red-50 text-red-700';
  if (normalized.includes('alta')) return 'bg-amber-50 text-amber-700';
  if (normalized.includes('media')) return 'bg-sky-50 text-sky-700';
  return 'bg-slate-100 text-slate-600';
}

function AssistantCard({ message, recommendation, summaryItems, onStart, disabled }) {
  return (
    <section className="rounded-md border border-brand-700 bg-brand-700 p-5 text-white shadow-panel">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Asistente de jornada</p>
          <h3 className="mt-2 max-w-4xl text-2xl font-bold leading-tight sm:text-3xl">{message}</h3>
          <div className="mt-4 rounded-md bg-white/10 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Recomendacion principal</p>
            <p className="mt-1 text-sm font-semibold text-white">{recommendation}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {summaryItems.map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm">
                <CheckCircle2 size={16} className="text-brand-100" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={onStart}
          disabled={disabled}
          className="h-14 self-start whitespace-nowrap border-white bg-white px-5 text-base text-brand-700 hover:bg-brand-50 lg:self-center"
        >
          <Play size={20} /> Comenzar jornada
        </Button>
      </div>
    </section>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function QuickTodayBar({ items, onOpen }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {items.map((item) => (
        <button
          key={item.title}
          type="button"
          onClick={() => onOpen(item.destination || item.moduleId)}
          className={`focus-ring rounded-md border p-3 text-left shadow-panel transition hover:-translate-y-0.5 ${quickToneClasses(item.tone)}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-white/70 p-2"><item.icon size={18} /></span>
            <ArrowRight size={16} className="opacity-60" />
          </div>
          <p className="mt-3 text-2xl font-bold">{item.value}</p>
          <p className="text-sm font-semibold">{item.title}</p>
        </button>
      ))}
    </div>
  );
}

function DaySummaryStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      {items.map((item) => (
        <article key={item.label} className="rounded-md border border-slate-200 bg-white p-3 text-center shadow-panel">
          <p className="text-2xl font-bold text-ink">{item.value}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
        </article>
      ))}
    </div>
  );
}

function OperationsPanel({ title, icon: Icon, items, empty, renderItem, onOpen }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-bold text-ink"><Icon size={19} /> {title}</h4>
        {onOpen && (
          <Button variant="secondary" onClick={onOpen}>
            Abrir
          </Button>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {items.slice(0, LIST_LIMIT).map((item, index) => (
          <div key={item.id || `${title}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
            {renderItem(item)}
          </div>
        ))}
        {!items.length && <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </section>
  );
}

function AIPanel({ panel }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-bold text-ink"><Brain size={19} /> Panel preparado para IA</h4>
        <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{panel?.status || 'Preparado'}</span>
      </div>
      <p className="mt-4 text-sm text-slate-600">{panel?.summary || 'Preparado para resumen inteligente cuando se active IA.'}</p>
      <div className="mt-4 space-y-2">
        {(panel?.recommendations || []).slice(0, 3).map((item) => (
          <div key={item} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function PriorityDeck({ cards, onOpen }) {
  if (!cards.length) return <EmptyState title="No hay asuntos urgentes." text="No hay prioridades visibles con tus permisos." />;

  const hasActivePriority = cards.some((card) => Number(card.value) > 0);
  const featured = cards.find((card) => Number(card.value) > 0) || cards[0];
  const compactCards = cards.filter((card) => card.title !== featured.title);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_1.4fr]">
      <button
        type="button"
        onClick={() => onOpen(featured.destination || featured.moduleId)}
        className={`focus-ring group min-h-56 rounded-md border p-5 text-left shadow-panel transition hover:-translate-y-0.5 ${priorityToneClasses(hasActivePriority ? featured.tone : 'green')}`}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-md bg-white/70 p-3"><featured.icon size={28} /></span>
          <ArrowRight size={20} className="opacity-60 transition group-hover:translate-x-0.5" />
        </div>
        <p className="mt-8 text-5xl font-bold">{featured.value}</p>
        <p className="mt-2 text-lg font-bold">{hasActivePriority ? featured.title : 'No hay asuntos urgentes.'}</p>
        <p className="mt-2 text-sm opacity-80">{hasActivePriority ? featured.detail : 'Todo correcto por ahora.'}</p>
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        {compactCards.map((card) => (
          <PriorityCompactCard key={card.title} card={card} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function PriorityCompactCard({ card, onOpen }) {
  const tone = Number(card.value) > 0 ? card.tone : 'green';
  return (
    <button
      type="button"
      onClick={() => onOpen(card.destination || card.moduleId)}
      className={`focus-ring rounded-md border p-4 text-left shadow-panel transition hover:-translate-y-0.5 ${priorityToneClasses(tone)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-white/70 p-2"><card.icon size={20} /></span>
        <span className="text-2xl font-bold">{card.value}</span>
      </div>
      <p className="mt-3 font-bold">{card.title}</p>
      <p className="mt-1 text-sm opacity-80">{Number(card.value) > 0 ? card.detail : 'Todo correcto por ahora.'}</p>
    </button>
  );
}

function TaskCard({ task, onOpen }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className={taskPriorityClass(task.priority)}>{task.priority}</span>
          <h4 className="mt-3 text-lg font-bold text-ink">{task.title}</h4>
          <p className="mt-1 text-sm text-slate-600">{task.detail}</p>
        </div>
        <Button variant="secondary" onClick={() => onOpen(task.destination || task.moduleId)} className="self-start whitespace-nowrap">
          {task.action}
        </Button>
      </div>
    </article>
  );
}

function FamilyPriorityCard({ family, destination, onOpen }) {
  const isCritical = family.priorityLevel === 'Critica';
  return (
    <article
      className={`cursor-pointer rounded-md border p-5 shadow-panel transition hover:-translate-y-0.5 ${isCritical ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(destination)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen(destination);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{family.code || 'Unidad familiar'}</p>
          <h4 className={`mt-1 text-xl font-bold ${isCritical ? 'text-red-950' : 'text-ink'}`}>{family.name}</h4>
        </div>
        <span className={priorityBadgeClass(family.priorityLevel)}>{family.priorityLevel}</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Miembros" value={family.membersCount} />
        <Metric label="Menores" value={family.minorsCount} />
        <Metric label="Dias sin ayuda" value={family.daysWithoutHelpText} />
        <Metric label="Última ayuda" value={family.lastHelpText} />
      </dl>
      <div className="mt-4 rounded-md bg-white/70 p-3 text-sm text-slate-700">
        <strong>Motivo:</strong> {family.priorityReason}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant={isCritical ? 'primary' : 'secondary'} onClick={(event) => { event.stopPropagation(); onOpen(destination); }}>
          Ver expediente
        </Button>
      </div>
    </article>
  );
}

function AlertList({ title, icon: Icon, items, empty, renderItem, onOpen }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-bold text-ink"><Icon size={19} /> {title}</h4>
        <Button variant="secondary" onClick={onOpen}>
          Abrir
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {items.slice(0, LIST_LIMIT).map((item) => (
          <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
            {renderItem(item)}
          </div>
        ))}
        {!items.length && <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </section>
  );
}

function CommunicationCard({ title, value, detail, icon: Icon, moduleId, destination, onOpen }) {
  const active = Number(value) > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(destination || moduleId)}
      className={`focus-ring rounded-md border p-4 text-left shadow-panel transition hover:-translate-y-0.5 ${active ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-white/70 p-2"><Icon size={20} /></span>
        <ArrowRight size={17} className="opacity-60" />
      </div>
      <p className="mt-4 text-3xl font-bold">{value}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="mt-2 text-sm opacity-80">{detail}</p>
    </button>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-bold text-ink">{value}</dd>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 text-sm shadow-panel">
      <p className="font-bold text-ink">{title}</p>
      {text && <p className="mt-1 text-slate-500">{text}</p>}
    </div>
  );
}

function getDestinationModule(destination) {
  if (typeof destination === 'string') return destination;
  return destination?.moduleId || null;
}

function getResourcesDestination(currentUser) {
  if (canAccess(currentUser, 'provider')) return { moduleId: 'provider' };
  if (canAccess(currentUser, 'settings')) return { moduleId: 'settings' };
  return null;
}

function buildFamilyListDestination(families, moduleId, filter) {
  return {
    moduleId,
    filter,
    beneficiaryIds: families.flatMap((family) => family.beneficiaryIds || []),
    label: 'Familias críticas'
  };
}

function buildFamilyDetailDestination(family, moduleId) {
  if (moduleId === 'beneficiaries' && family?.primaryBeneficiaryId) {
    return {
      moduleId: 'beneficiaries',
      filter: 'family-detail',
      profileId: family.primaryBeneficiaryId,
      familyId: family.familyId,
      beneficiaryIds: family.beneficiaryIds || [],
      label: family.name
    };
  }
  return { moduleId, filter: 'family-detail', familyId: family?.familyId, label: family?.name };
}

function uniqueDocumentIssueCount(operations) {
  const ids = new Set();
  [
    ...(operations.pendingDocuments || []),
    ...(operations.expiredDocuments || []),
    ...(operations.renewalDocuments || []),
    ...(operations.expiringDocuments || []),
    ...(operations.documentAttention || [])
  ].forEach((item) => {
    const document = item?.document || item;
    if (document?.id) ids.add(document.id);
  });
  return ids.size;
}

function buildDocumentDestination(items = [], fallbackItems = []) {
  const item = [...items, ...fallbackItems].find((candidate) => {
    const document = candidate?.document || candidate;
    return document?.id;
  });
  const document = item?.document || item;
  if (!document?.id) {
    return { moduleId: 'beneficiaries', tab: 'documents', filter: 'documentation' };
  }
  return {
    moduleId: 'beneficiaries',
    profileId: document.beneficiary_id,
    tab: 'documents',
    documentId: document.id,
    filter: 'documentation',
    label: document.document_type || document.file_name || 'Documento'
  };
}

function buildPriorityCards(operations, currentUser, familyModule) {
  return [
    familyModule && {
      title: 'Familias críticas',
      value: operations.criticalFamilies.length,
      detail: `${operations.urgentFamilies.length} urgentes, ${operations.priorityFamilies.length} priorizadas`,
      icon: ShieldAlert,
      moduleId: familyModule,
      destination: buildFamilyListDestination(operations.criticalFamilies, familyModule, 'critical-families'),
      tone: 'red'
    },
    canAccess(currentUser, 'beneficiaries') && {
      title: `Sin ayuda +${STALE_HELP_DAYS} dias`,
      value: operations.staleBeneficiaries.length,
      detail: 'Beneficiarios activos sin ayuda reciente',
      icon: Clock3,
      moduleId: 'beneficiaries',
      destination: {
        moduleId: 'beneficiaries',
        filter: 'stale-help',
        beneficiaryIds: operations.staleBeneficiaries.map((item) => item.id),
        label: `Sin ayuda +${STALE_HELP_DAYS} dias`
      },
      tone: 'orange'
    },
    canAccess(currentUser, 'beneficiaries') && {
      title: 'Documentos pendientes',
      value: operations.pendingDocuments.length,
      detail: 'Pendientes de revision o respuesta',
      icon: FileText,
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination(operations.pendingDocuments, operations.documentAttention),
      tone: operations.pendingDocuments.length ? 'orange' : 'green'
    },
    canAccess(currentUser, 'beneficiaries') && {
      title: 'Documentos caducados',
      value: operations.expiredDocuments.length,
      detail: 'Requieren actualizacion documental',
      icon: AlertTriangle,
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination(operations.expiredDocuments, operations.documentAttention),
      tone: operations.expiredDocuments.length ? 'red' : 'green'
    },
    canAccess(currentUser, 'beneficiaries') && {
      title: 'Renovaciones pendientes',
      value: operations.renewalDocuments.length,
      detail: 'Solicitudes de renovacion abiertas',
      icon: FileText,
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination(operations.renewalDocuments, operations.documentAttention),
      tone: operations.renewalDocuments.length ? 'orange' : 'green'
    },
    canAccess(currentUser, 'beneficiaries') && {
      title: 'Proximos a caducar',
      value: operations.expiringDocuments.length,
      detail: 'Documentos dentro del plazo de aviso',
      icon: CalendarClock,
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination(operations.expiringDocuments, operations.documentAttention),
      tone: operations.expiringDocuments.length ? 'orange' : 'green'
    },
    canAccess(currentUser, 'inventory') && {
      title: 'Stock critico',
      value: operations.criticalStock.length,
      detail: `${operations.outOfStock.length} agotados`,
      icon: AlertTriangle,
      moduleId: 'inventory',
      destination: { moduleId: 'inventory', filter: 'stock-critical' },
      tone: 'red'
    },
    canAccess(currentUser, 'inventory') && {
      title: 'Caducidades proximas',
      value: operations.expiringSoon.length,
      detail: `Proximos ${EXPIRY_WINDOW_DAYS} dias`,
      icon: CalendarClock,
      moduleId: 'inventory',
      destination: { moduleId: 'inventory', filter: 'expiring-soon' },
      tone: 'orange'
    },
    canAccess(currentUser, 'accounting') && {
      title: 'Deudas vencidas',
      value: operations.overdueDebts.length,
      detail: formatMoney(operations.overdueDebts.reduce((total, debt) => total + Number(debt.outstanding || 0), 0)),
      icon: Receipt,
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'overdue-debts' },
      tone: operations.overdueDebts.length ? 'red' : 'green'
    },
    canAccess(currentUser, 'accounting') && {
      title: 'Préstamos pendientes',
      value: operations.pendingLoans.length,
      detail: formatMoney(operations.pendingLoanAmount),
      icon: HandCoins,
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'pending-loans' },
      tone: operations.pendingLoans.length ? 'orange' : 'green'
    },
    canAccess(currentUser, 'communications') && {
      title: 'Correos pendientes',
      value: operations.pendingEmails.length,
      detail: 'Comunicaciones no resueltas',
      icon: Mail,
      moduleId: 'communications',
      destination: { moduleId: 'communications', filter: 'pending-emails' },
      tone: 'blue'
    },
    canAccess(currentUser, 'receipts') && {
      title: 'Justificantes pendientes',
      value: operations.pendingReceipts.length,
      detail: 'Sin numero o firma',
      icon: FileText,
      moduleId: 'receipts',
      destination: {
        moduleId: 'receipts',
        filter: 'pending-receipts',
        receiptIds: operations.pendingReceipts.map((item) => item.id)
      },
      tone: 'orange'
    }
  ].filter(Boolean);
}

function buildQuickItems(operations, currentUser, familyModule) {
  return [
    familyModule && {
      title: 'Familias críticas',
      value: operations.criticalFamilies.length,
      icon: ShieldAlert,
      moduleId: familyModule,
      destination: buildFamilyListDestination(operations.criticalFamilies, familyModule, 'critical-families'),
      tone: operations.criticalFamilies.length ? 'red' : 'green'
    },
    canAccess(currentUser, 'deliveries') && {
      title: 'Entregas de hoy',
      value: operations.todayDeliveries.length,
      icon: PackageCheck,
      moduleId: 'deliveries',
      tone: operations.todayDeliveries.length ? 'blue' : 'green'
    },
    canAccess(currentUser, 'inventory') && {
      title: 'Productos criticos',
      value: operations.criticalStock.length,
      icon: Boxes,
      moduleId: 'inventory',
      destination: { moduleId: 'inventory', filter: 'stock-critical' },
      tone: operations.criticalStock.length ? 'red' : 'green'
    },
    canAccess(currentUser, 'receipts') && {
      title: 'Justificantes pendientes',
      value: operations.pendingReceipts.length,
      icon: FileText,
      moduleId: 'receipts',
      destination: {
        moduleId: 'receipts',
        filter: 'pending-receipts',
        receiptIds: operations.pendingReceipts.map((item) => item.id)
      },
      tone: operations.pendingReceipts.length ? 'orange' : 'green'
    },
    canAccess(currentUser, 'beneficiaries') && {
      title: 'Documentacion pendiente',
      value: uniqueDocumentIssueCount(operations),
      icon: FileText,
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination(operations.documentAttention, operations.pendingDocuments),
      tone: uniqueDocumentIssueCount(operations) ? 'orange' : 'green'
    },
    canAccess(currentUser, 'accounting') && {
      title: 'Deudas vencidas',
      value: operations.overdueDebts.length,
      icon: Receipt,
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'overdue-debts' },
      tone: operations.overdueDebts.length ? 'red' : 'green'
    },
    canAccess(currentUser, 'accounting') && {
      title: 'Pagos proximos',
      value: operations.upcomingDebtPayments.length,
      icon: CalendarClock,
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'upcoming-debt-payments' },
      tone: operations.upcomingDebtPayments.length ? 'orange' : 'green'
    },
    canAccess(currentUser, 'donations') && {
      title: 'Donaciones pendientes',
      value: operations.pendingDonations.length,
      icon: Gift,
      moduleId: 'donations',
      destination: {
        moduleId: 'donations',
        filter: 'pending-donations',
        donationIds: operations.pendingDonations.map((item) => item.id)
      },
      tone: operations.pendingDonations.length ? 'orange' : 'green'
    }
  ].filter(Boolean);
}

function buildTasks(operations, currentUser, familyModule) {
  return [
    familyModule && operations.criticalFamilies.length > 0 && {
      title: 'Revisar familias críticas',
      detail: pluralSummary(operations.criticalFamilies.length, 'familia crítica requiere atención', 'familias críticas requieren atención'),
      priority: 'Critica',
      action: 'Ver familias',
      moduleId: familyModule,
      destination: buildFamilyListDestination(operations.criticalFamilies, familyModule, 'critical-families')
    },
    canAccess(currentUser, 'deliveries') && operations.todayDeliveries.length > 0 && {
      title: 'Registrar entregas pendientes',
      detail: pluralSummary(operations.todayDeliveries.length, 'entrega de hoy para revisar', 'entregas de hoy para revisar'),
      priority: 'Alta',
      action: 'Ir a entregas',
      moduleId: 'deliveries'
    },
    canAccess(currentUser, 'beneficiaries') && operations.expiredDocuments.length > 0 && {
      title: 'Resolver documentacion caducada',
      detail: pluralSummary(operations.expiredDocuments.length, 'documento caducado requiere revision', 'documentos caducados requieren revision'),
      priority: 'Critica',
      action: 'Abrir documento',
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination(operations.expiredDocuments, operations.documentAttention)
    },
    canAccess(currentUser, 'beneficiaries') && (operations.pendingDocuments.length + operations.renewalDocuments.length + operations.expiringDocuments.length) > 0 && {
      title: 'Revisar seguimiento documental',
      detail: pluralSummary(operations.pendingDocuments.length + operations.renewalDocuments.length + operations.expiringDocuments.length, 'documento necesita accion', 'documentos necesitan accion'),
      priority: operations.expiringDocuments.length ? 'Alta' : 'Media',
      action: 'Abrir documentacion',
      moduleId: 'beneficiaries',
      destination: buildDocumentDestination([...operations.pendingDocuments, ...operations.renewalDocuments, ...operations.expiringDocuments], operations.documentAttention)
    },
    canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.closingSoon?.length > 0 && {
      title: 'Revisar convocatorias que cierran pronto',
      detail: pluralSummary(operations.socialResourceMonitoring.closingSoon.length, 'recurso social cierra pronto', 'recursos sociales cierran pronto'),
      priority: 'Alta',
      action: 'Abrir recursos',
      moduleId: 'social-resources',
      destination: { moduleId: 'social-resources' }
    },
    canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.needsReview?.length > 0 && {
      title: 'Verificar fuentes oficiales',
      detail: pluralSummary(operations.socialResourceMonitoring.needsReview.length, 'recurso necesita revision', 'recursos necesitan revision'),
      priority: 'Media',
      action: 'Abrir centro',
      moduleId: 'social-resources',
      destination: { moduleId: 'social-resources' }
    },
    canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.pendingDetections?.length > 0 && {
      title: 'Revisar detecciones oficiales',
      detail: pluralSummary(operations.socialResourceMonitoring.pendingDetections.length, 'deteccion pendiente', 'detecciones pendientes'),
      priority: 'Alta',
      action: 'Abrir bandeja',
      moduleId: 'social-resources',
      destination: { moduleId: 'social-resources' }
    },
    canAccess(currentUser, 'inventory') && operations.criticalStock.length > 0 && {
      title: 'Revisar stock bajo',
      detail: pluralSummary(operations.criticalStock.length, 'producto esta bajo minimo', 'productos estan bajo minimo'),
      priority: operations.outOfStock.length ? 'Critica' : 'Alta',
      action: 'Abrir inventario',
      moduleId: 'inventory',
      destination: { moduleId: 'inventory', filter: 'stock-critical' }
    },
    canAccess(currentUser, 'inventory') && operations.expiringSoon.length > 0 && {
      title: 'Revisar productos proximos a caducar',
      detail: pluralSummary(operations.expiringSoon.length, 'producto vence pronto', 'productos vencen pronto'),
      priority: 'Alta',
      action: 'Abrir inventario',
      moduleId: 'inventory',
      destination: { moduleId: 'inventory', filter: 'expiring-soon' }
    },
    canAccess(currentUser, 'receipts') && operations.pendingReceipts.length > 0 && {
      title: 'Enviar justificantes pendientes',
      detail: pluralSummary(operations.pendingReceipts.length, 'justificante necesita revisión', 'justificantes necesitan revisión'),
      priority: 'Alta',
      action: 'Ver justificantes',
      moduleId: 'receipts',
      destination: {
        moduleId: 'receipts',
        filter: 'pending-receipts',
        receiptIds: operations.pendingReceipts.map((item) => item.id)
      }
    },
    canAccess(currentUser, 'accounting') && operations.overdueDebts.length > 0 && {
      title: 'Revisar deudas vencidas',
      detail: `${pluralSummary(operations.overdueDebts.length, 'deuda vencida requiere pago o revisión', 'deudas vencidas requieren pago o revisión')} Total: ${formatMoney(operations.overdueDebts.reduce((total, debt) => total + Number(debt.outstanding || 0), 0))}.`,
      priority: 'Critica',
      action: 'Abrir contabilidad',
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'overdue-debts' }
    },
    canAccess(currentUser, 'accounting') && operations.upcomingDebtPayments.length > 0 && {
      title: 'Preparar pagos proximos',
      detail: pluralSummary(operations.upcomingDebtPayments.length, 'pago vence en los proximos dias', 'pagos vencen en los proximos dias'),
      priority: 'Alta',
      action: 'Abrir contabilidad',
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'upcoming-debt-payments' }
    },
    canAccess(currentUser, 'accounting') && operations.pendingLoans.length > 0 && {
      title: 'Revisar préstamos pendientes',
      detail: `Pendiente de devolver: ${formatMoney(operations.pendingLoanAmount)}.`,
      priority: 'Media',
      action: 'Abrir contabilidad',
      moduleId: 'accounting',
      destination: { moduleId: 'accounting', filter: 'pending-loans' }
    },
    canAccess(currentUser, 'beneficiaries') && operations.newBeneficiaries.length > 0 && {
      title: 'Revisar beneficiarios nuevos',
      detail: pluralSummary(operations.newBeneficiaries.length, 'beneficiario nuevo hoy', 'beneficiarios nuevos hoy'),
      priority: 'Media',
      action: 'Ver beneficiarios',
      moduleId: 'beneficiaries'
    }
  ].filter(Boolean);
}

function buildAssistantState(operations, currentUser, familyModule) {
  const primary = getPrimaryAction(operations, currentUser, familyModule);
  const parts = [
    familyModule && operations.criticalFamilies.length > 0 && pluralLabel(operations.criticalFamilies.length, 'familia crítica', 'familias críticas'),
    canAccess(currentUser, 'deliveries') && operations.todayDeliveries.length > 0 && pluralLabel(operations.todayDeliveries.length, 'entrega de hoy', 'entregas de hoy'),
    canAccess(currentUser, 'inventory') && operations.criticalStock.length > 0 && pluralLabel(operations.criticalStock.length, 'producto critico', 'productos criticos'),
    canAccess(currentUser, 'inventory') && operations.expiringSoon.length > 0 && pluralLabel(operations.expiringSoon.length, 'producto proximo a caducar', 'productos proximos a caducar'),
    canAccess(currentUser, 'receipts') && operations.pendingReceipts.length > 0 && pluralLabel(operations.pendingReceipts.length, 'justificante pendiente', 'justificantes pendientes'),
    canAccess(currentUser, 'beneficiaries') && uniqueDocumentIssueCount(operations) > 0 && pluralLabel(uniqueDocumentIssueCount(operations), 'documento pendiente', 'documentos pendientes'),
    canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.newlyCreated?.length > 0 && pluralLabel(operations.socialResourceMonitoring.newlyCreated.length, 'convocatoria nueva', 'convocatorias nuevas'),
    canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.pendingDetections?.length > 0 && pluralLabel(operations.socialResourceMonitoring.pendingDetections.length, 'deteccion oficial pendiente', 'detecciones oficiales pendientes'),
    canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.closingSoon?.length > 0 && pluralLabel(operations.socialResourceMonitoring.closingSoon.length, 'convocatoria proxima a cerrar', 'convocatorias proximas a cerrar'),
    canAccess(currentUser, 'accounting') && operations.overdueDebts.length > 0 && pluralLabel(operations.overdueDebts.length, 'deuda vencida', 'deudas vencidas'),
    canAccess(currentUser, 'accounting') && operations.upcomingDebtPayments.length > 0 && pluralLabel(operations.upcomingDebtPayments.length, 'pago proximo', 'pagos proximos'),
    canAccess(currentUser, 'accounting') && operations.pendingLoans.length > 0 && pluralLabel(operations.pendingLoans.length, 'préstamo pendiente', 'préstamos pendientes'),
    canAccess(currentUser, 'donations') && operations.pendingDonations.length > 0 && pluralLabel(operations.pendingDonations.length, 'donación pendiente', 'donaciones pendientes')
  ].filter(Boolean);
  const userName = displayUserName(currentUser);
  const message = parts.length
    ? `Buenos dias, ${userName}. Hoy hay ${joinSentence(parts)}.`
    : `Buenos dias, ${userName}. No hay asuntos urgentes.`;

  return {
    message,
    recommendation: primary?.recommendation || 'Todo correcto por ahora.',
    primaryDestination: primary?.destination || null,
    summaryItems: parts.length ? parts.map((item) => `${item}.`) : ['Todo correcto por ahora.']
  };
}

function getPrimaryAction(operations, currentUser, familyModule) {
  if (familyModule && operations.criticalFamilies.length > 0) {
    return {
      destination: buildFamilyDetailDestination(operations.criticalFamilies[0], familyModule),
      recommendation: 'Empieza revisando la familia crítica con más riesgo.'
    };
  }
  if (canAccess(currentUser, 'deliveries') && operations.todayDeliveries.length > 0) {
    return { destination: { moduleId: 'deliveries' }, recommendation: 'Empieza por las entregas de hoy y deja registradas las acciones pendientes.' };
  }
  if (canAccess(currentUser, 'inventory') && operations.criticalStock.length > 0) {
    return {
      destination: { moduleId: 'inventory', filter: 'stock-critical' },
      recommendation: 'Empieza revisando el stock critico antes de preparar nuevas entregas.'
    };
  }
  if (canAccess(currentUser, 'inventory') && operations.expiringSoon.length > 0) {
    return {
      destination: { moduleId: 'inventory', filter: 'expiring-soon' },
      recommendation: 'Prioriza los productos proximos a caducar para evitar perdidas.'
    };
  }
  if (canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.closingSoon?.length > 0) {
    return {
      destination: { moduleId: 'social-resources' },
      recommendation: 'Revisa primero las convocatorias sociales que cierran pronto.'
    };
  }
  if (canAccess(currentUser, 'social-resources') && operations.socialResourceMonitoring?.pendingDetections?.length > 0) {
    return {
      destination: { moduleId: 'social-resources' },
      recommendation: 'Revisa la bandeja de detecciones oficiales antes de incorporar nuevas ayudas.'
    };
  }
  if (canAccess(currentUser, 'receipts') && operations.pendingReceipts.length > 0) {
    return {
      destination: {
        moduleId: 'receipts',
        filter: 'pending-receipts',
        receiptIds: operations.pendingReceipts.map((item) => item.id)
      },
      recommendation: 'Cierra los justificantes pendientes para mantener la documentacion al dia.'
    };
  }
  if (canAccess(currentUser, 'beneficiaries') && uniqueDocumentIssueCount(operations) > 0) {
    return {
      destination: buildDocumentDestination(operations.documentAttention, operations.pendingDocuments),
      recommendation: 'Revisa los documentos pendientes, caducados o con renovacion solicitada.'
    };
  }
  if (canAccess(currentUser, 'accounting') && operations.overdueDebts.length > 0) {
    return {
      destination: { moduleId: 'accounting', filter: 'overdue-debts' },
      recommendation: 'Revisa las deudas vencidas y registra pagos o acuerdos desde Contabilidad.'
    };
  }
  if (canAccess(currentUser, 'accounting') && operations.upcomingDebtPayments.length > 0) {
    return {
      destination: { moduleId: 'accounting', filter: 'upcoming-debt-payments' },
      recommendation: 'Prepara los pagos proximos para evitar vencimientos.'
    };
  }
  return null;
}

function buildCommunicationCards(operations, currentUser, secureSummary) {
  return [
    canAccess(currentUser, 'communications') && {
      title: 'Emails pendientes',
      value: operations.pendingEmails.length,
      detail: describeList(operations.pendingEmails, (item) => item.subject || item.recipient),
      icon: Mail,
      moduleId: 'communications',
      destination: { moduleId: 'communications', filter: 'pending-emails' }
    },
    canAccess(currentUser, 'receipts') && {
      title: 'Justificantes pendientes',
      value: operations.pendingReceipts.length,
      detail: describeList(operations.pendingReceipts, (item) => item.beneficiary_name || item.receipt_number),
      icon: FileText,
      moduleId: 'receipts',
      destination: {
        moduleId: 'receipts',
        filter: 'pending-receipts',
        receiptIds: operations.pendingReceipts.map((item) => item.id)
      }
    },
    canAccess(currentUser, 'users') && {
      title: 'Recuperaciones de contraseña',
      value: secureSummary.loading ? '...' : secureSummary.pendingPasswordResets ?? 0,
      detail: secureSummary.loading ? 'Cargando solicitudes vigentes' : 'Solicitudes vigentes',
      icon: KeyRound,
      moduleId: 'users'
    }
  ].filter(Boolean);
}

function buildSummaryCards(operations, data, currentUser) {
  return [
    canAccess(currentUser, 'beneficiaries') && {
      label: 'Beneficiarios activos',
      value: operations.summary.activeBeneficiaries,
      icon: HandHeart
    },
    canAccess(currentUser, 'families') && {
      label: 'Familias activas',
      value: operations.summary.activeFamilies,
      icon: Users
    },
    canAccess(currentUser, 'deliveries') && {
      label: 'Entregas del mes',
      value: operations.summary.deliveriesThisMonth,
      icon: PackageCheck
    },
    canAccess(currentUser, 'inventory') && {
      label: 'Inventario bajo minimo',
      value: operations.criticalStock.length,
      icon: AlertTriangle
    },
    canAccess(currentUser, 'accounting') && {
      label: 'Préstamos pendientes',
      value: operations.pendingLoans.length,
      icon: HandCoins
    },
    canAccess(currentUser, 'accounting') && {
      label: 'Deudas vencidas',
      value: operations.overdueDebts.length,
      icon: Receipt
    },
    canAccess(currentUser, 'communications') && {
      label: 'Correos enviados',
      value: (data.email_logs || []).length,
      icon: Mail
    },
    canAccess(currentUser, 'users') && {
      label: 'Usuarios activos',
      value: operations.summary.activeUsers,
      icon: UserCheck
    }
  ].filter(Boolean);
}

function buildOperations(data, today, pendingPasswordResets) {
  const activeDeliveries = (data.deliveries || []).filter((item) => item.status !== 'Anulada');
  const activeBeneficiaries = (data.beneficiaries || []).filter((item) => item.is_active);
  const latestDeliveryByBeneficiary = latestDeliveriesMap(activeDeliveries);
  const priorityFamilies = buildFamilyPriorities(data, activeDeliveries, latestDeliveryByBeneficiary, today);
  const criticalFamilies = priorityFamilies.filter((item) => item.priorityLevel === 'Critica');
  const urgentFamilies = priorityFamilies.filter((item) => ['Critica', 'Alta'].includes(item.priorityLevel));
  const staleBeneficiaries = activeBeneficiaries.filter((beneficiary) => {
    const latest = beneficiary.last_help_at || latestDeliveryByBeneficiary.get(beneficiary.id)?.delivered_at;
    const reference = latest || beneficiary.joined_at || beneficiary.created_at;
    const days = daysBetween(reference, today);
    return Number.isFinite(days) && days >= STALE_HELP_DAYS;
  });
  const inventoryItems = data.inventory_items || [];
  const outOfStock = inventoryItems.filter((item) => Number(item.stock || 0) <= 0);
  const lowStock = inventoryItems.filter((item) => Number(item.stock || 0) > 0 && Number(item.stock || 0) <= Number(item.low_stock_threshold || 0));
  const criticalStock = inventoryItems.filter((item) => Number(item.stock || 0) <= Number(item.low_stock_threshold || 0));
  const expiringSoon = inventoryItems
    .filter((item) => {
      const days = daysBetween(today, item.expires_at);
      return Number.isFinite(days) && days <= EXPIRY_WINDOW_DAYS;
    })
    .sort((a, b) => daysBetween(today, a.expires_at) - daysBetween(today, b.expires_at));
  const pendingEmails = (data.email_logs || []).filter(isPendingEmail);
  const pendingReceipts = activeDeliveries.filter(isPendingReceipt);
  const todayDeliveries = activeDeliveries.filter((item) => toDateKey(item.delivered_at) === today);
  const newBeneficiaries = activeBeneficiaries.filter((item) => toDateKey(item.joined_at || item.created_at) === today);
  const pendingDonations = (data.donations || []).filter(isPendingDonation);
  const accountingEventsById = new Map((data.accounting_events || []).map((event) => [event.id, event]));
  const loanRecords = activeAccountingRows(data.loan_records || [], accountingEventsById);
  const loanRecordIds = new Set(loanRecords.map((loan) => loan.id));
  const loanMovements = activeAccountingRows(data.loan_movements || [], accountingEventsById).filter((movement) => loanRecordIds.has(movement.loan_id));
  const debtRecords = activeAccountingRows(data.debt_records || [], accountingEventsById);
  const debtRecordIds = new Set(debtRecords.map((debt) => debt.id));
  const debtMovements = activeAccountingRows(data.debt_movements || [], accountingEventsById).filter((movement) => debtRecordIds.has(movement.debt_id));
  const pendingLoans = loanRecords
    .map((loan) => ({ ...loan, outstanding: loanOutstanding(loan, loanMovements) }))
    .filter((loan) => loan.outstanding > 0);
  const pendingDebts = debtRecords
    .map((debt) => ({ ...debt, outstanding: debtOutstanding(debt, debtMovements) }))
    .filter((debt) => debt.outstanding > 0);
  const overdueDebts = pendingDebts.filter((debt) => {
    const days = daysBetween(today, debt.due_at);
    return debt.due_at && Number.isFinite(days) && days < 0;
  });
  const upcomingDebtPayments = pendingDebts.filter((debt) => {
    const days = daysBetween(today, debt.due_at);
    return debt.due_at && Number.isFinite(days) && days >= 0 && days <= 14;
  });

  return {
    activeDeliveries,
    activeBeneficiaries,
    priorityFamilies,
    criticalFamilies,
    urgentFamilies,
    staleBeneficiaries,
    outOfStock,
    lowStock,
    criticalStock,
    expiringSoon,
    pendingEmails,
    pendingReceipts,
    todayDeliveries,
    newBeneficiaries,
    pendingDonations,
    pendingLoans,
    pendingLoanAmount: pendingLoans.reduce((total, loan) => total + Number(loan.outstanding || 0), 0),
    pendingDebts,
    pendingDebtAmount: pendingDebts.reduce((total, debt) => total + Number(debt.outstanding || 0), 0),
    overdueDebts,
    upcomingDebtPayments,
    pendingPasswordResets,
    summary: buildSummary(data, activeDeliveries, today)
  };
}

function buildSummary(data, activeDeliveries, today) {
  const month = today.slice(0, 7);
  const activeBeneficiaries = (data.beneficiaries || []).filter((item) => item.is_active).length;
  const activeFamilies = (data.families || []).length;
  const deliveriesThisMonth = activeDeliveries.filter((item) => String(item.delivered_at || '').startsWith(month)).length;
  const activeUsers = (data.app_users || []).filter((user) => getUserStatus(user) === 'Activo').length;

  return {
    activeBeneficiaries,
    activeFamilies,
    deliveriesThisMonth,
    activeUsers
  };
}

function buildFamilyPriorities(data, activeDeliveries, latestDeliveryByBeneficiary, today) {
  const groups = new Map();
  (data.families || []).forEach((family) => {
    groups.set(`family-${family.id}`, {
      id: `family-${family.id}`,
      family,
      beneficiaries: [],
      moduleId: 'families'
    });
  });

  (data.beneficiaries || []).filter((item) => item.is_active).forEach((beneficiary) => {
    const key = beneficiary.family_id && groups.has(`family-${beneficiary.family_id}`)
      ? `family-${beneficiary.family_id}`
      : `beneficiary-${beneficiary.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        family: null,
        beneficiaries: [],
        moduleId: 'beneficiaries'
      });
    }
    groups.get(key).beneficiaries.push(beneficiary);
  });

  return [...groups.values()]
    .map((group) => enrichFamilyGroup(group, activeDeliveries, latestDeliveryByBeneficiary, today))
    .filter((group) => group.priorityScore >= 25)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.membersCount - a.membersCount);
}

function enrichFamilyGroup(group, activeDeliveries, latestDeliveryByBeneficiary, today) {
  const beneficiaries = group.beneficiaries;
  const memberFallback = Math.max(...beneficiaries.map((item) => Number(item.family_members || 1)), 0);
  const membersCount = Math.max(beneficiaries.length, memberFallback, Number(group.family?.dependents_count || 0)) || 1;
  const minorsCount = beneficiaries.length
    ? beneficiaries.reduce((sum, item) => sum + Number(item.minors_count || 0), 0)
    : Number(group.family?.dependents_count || 0);
  const beneficiaryIds = new Set(beneficiaries.map((item) => item.id));
  const latestDelivery = activeDeliveries
    .filter((delivery) => beneficiaryIds.has(delivery.beneficiary_id))
    .sort((a, b) => String(b.delivered_at || '').localeCompare(String(a.delivered_at || '')))[0];
  const latestFromBeneficiaries = beneficiaries
    .map((item) => item.last_help_at || latestDeliveryByBeneficiary.get(item.id)?.delivered_at)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0];
  const latestHelpAt = latestDelivery?.delivered_at || latestFromBeneficiaries || '';
  const reference = latestHelpAt || beneficiaries.map((item) => item.joined_at || item.created_at).filter(Boolean).sort()[0];
  const daysWithoutHelp = daysBetween(reference, today);
  const situations = beneficiaries.map((item) => normalize(item.situation));
  const hasUrgentSituation = situations.some((item) => item.includes('urgente'));
  const hasPrioritySituation = situations.some((item) => item.includes('prioritario') || item.includes('vulnerable'));
  const primaryBeneficiary = beneficiaries.find((item) => normalize(item.situation).includes('urgente'))
    || beneficiaries.find((item) => normalize(item.situation).includes('prioritario'))
    || beneficiaries[0]
    || null;
  const reasons = [];
  let priorityScore = 0;

  if (hasUrgentSituation) {
    priorityScore += 50;
    reasons.push('situacion urgente registrada');
  }
  if (hasPrioritySituation) {
    priorityScore += 35;
    reasons.push('situacion prioritaria o vulnerable');
  }
  if (!latestHelpAt && beneficiaries.length) {
    priorityScore += 35;
    reasons.push('sin ayudas registradas');
  }
  if (Number.isFinite(daysWithoutHelp) && daysWithoutHelp >= 60) {
    priorityScore += 30;
    reasons.push(`${daysWithoutHelp} dias sin ayuda`);
  } else if (Number.isFinite(daysWithoutHelp) && daysWithoutHelp >= STALE_HELP_DAYS) {
    priorityScore += 15;
    reasons.push(`${daysWithoutHelp} dias sin ayuda`);
  }
  if (minorsCount > 0) {
    priorityScore += 10;
    reasons.push(`${minorsCount} menores`);
  }
  if (minorsCount >= 3) priorityScore += 10;
  if (membersCount >= 5) {
    priorityScore += 10;
    reasons.push(`${membersCount} miembros`);
  }

  return {
    ...group,
    familyId: group.family?.id || primaryBeneficiary?.family_id || '',
    beneficiaryIds: beneficiaries.map((item) => item.id).filter(Boolean),
    primaryBeneficiaryId: primaryBeneficiary?.id || '',
    code: group.family?.family_code || beneficiaries[0]?.code || '',
    name: group.family?.responsible_name || beneficiaries[0]?.full_name || 'Familia sin nombre',
    membersCount,
    minorsCount,
    daysWithoutHelp,
    daysWithoutHelpText: Number.isFinite(daysWithoutHelp) ? String(daysWithoutHelp) : 'Sin registro',
    lastHelpText: latestHelpAt ? formatDate(latestHelpAt) : 'Sin ayuda registrada',
    priorityReason: sentenceCase(reasons[0] || 'seguimiento social'),
    priorityScore,
    priorityLevel: priorityLevel(priorityScore)
  };
}

function priorityLevel(score) {
  if (score >= 70) return 'Critica';
  if (score >= 45) return 'Alta';
  if (score >= 25) return 'Media';
  return 'Normal';
}

function latestDeliveriesMap(deliveries) {
  return deliveries.reduce((acc, delivery) => {
    const current = acc.get(delivery.beneficiary_id);
    if (!current || String(delivery.delivered_at || '') > String(current.delivered_at || '')) {
      acc.set(delivery.beneficiary_id, delivery);
    }
    return acc;
  }, new Map());
}

function isPendingReceipt(delivery) {
  return !delivery.receipt_number || !delivery.signature_data_url;
}

function isPendingEmail(log) {
  const status = normalize(log.status || '');
  const result = normalize(log.result || '');
  return status.includes('pendiente') || status.includes('pending') || result.includes('pendiente') || result.includes('pending');
}

function isPendingDonation(donation) {
  if (donation.is_pending === true) return true;
  const status = normalize(donation.status || donation.state || donation.delivery_status || '');
  return ['pendiente', 'pending', 'solicitada', 'comprometida'].includes(status);
}

function activeAccountingRows(rows, eventsById) {
  return rows.filter((row) => !isInactiveAccounting(row) && !isInactiveAccounting(eventsById.get(row.accounting_event_id)));
}

function isInactiveAccounting(row) {
  const status = normalize(row?.status || row?.state || '');
  return status.includes('void')
    || status.includes('anulad')
    || status.includes('cancel')
    || status.includes('correct')
    || status.includes('corregid')
    || status.includes('revers')
    || status.includes('revert');
}

function loanOutstanding(loan, movements) {
  const paid = movements
    .filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received')
    .reduce((total, movement) => total + Number(movement.amount || 0), 0);
  return Math.max(0, Number(loan.principal_amount || 0) - paid);
}

function debtOutstanding(debt, movements) {
  const paid = movements
    .filter((movement) => movement.debt_id === debt.id)
    .reduce((total, movement) => total + Number(movement.amount || 0), 0);
  return Math.max(0, Number(debt.original_amount || 0) - paid);
}

function daysBetween(from, to) {
  if (!from || !to) return Number.NaN;
  const start = new Date(toDateKey(from));
  const end = new Date(toDateKey(to));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function toDateKey(value) {
  return value ? String(value).slice(0, 10) : '';
}

function describeList(items, picker) {
  if (!items.length) return 'Todo correcto por ahora.';
  const names = items.slice(0, 2).map(picker).filter(Boolean);
  if (!names.length) return `${items.length} registro${items.length === 1 ? '' : 's'}`;
  const extra = items.length > names.length ? ` +${items.length - names.length}` : '';
  return `${names.join(', ')}${extra}`;
}

function pluralSummary(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}.`;
}

function pluralLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinSentence(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} y ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

function displayUserName(user) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return fullName || user?.full_name || String(user?.email || 'Elizabeth').split('@')[0] || 'Elizabeth';
}

function priorityToneClasses(tone) {
  const classes = {
    red: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
    orange: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
  };
  return classes[tone] || classes.blue;
}

function quickToneClasses(tone) {
  const classes = {
    red: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
    orange: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
  };
  return classes[tone] || classes.blue;
}

function taskPriorityClass(priority) {
  if (priority === 'Critica') return 'rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700';
  if (priority === 'Alta') return 'rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700';
  return 'rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700';
}

function priorityBadgeClass(level) {
  if (level === 'Critica') return 'rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white';
  if (level === 'Alta') return 'rounded-md bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700';
  if (level === 'Media') return 'rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700';
  return 'rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700';
}

function formatExpiry(value, today) {
  const days = daysBetween(today, value);
  if (!Number.isFinite(days)) return 'Sin fecha';
  if (days < 0) return `Caducado hace ${Math.abs(days)} dias`;
  if (days === 0) return 'Caduca hoy';
  return `Caduca en ${days} dias`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function sentenceCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
