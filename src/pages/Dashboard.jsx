import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Gift,
  HandHeart,
  KeyRound,
  Mail,
  PackageCheck,
  Play,
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
import { formatDate, normalize, todayISO } from '../lib/formatters';
import { hasSupabaseConfig } from '../lib/supabase';

const STALE_HELP_DAYS = 30;
const EXPIRY_WINDOW_DAYS = 30;
const FAMILY_LIMIT = 6;
const LIST_LIMIT = 4;

export function Dashboard({ data, currentUser, onNavigate }) {
  const today = todayISO();
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
        const response = await fetch('/api/operations-summary', {
          method: 'GET',
          headers: await getApiHeaders()
        });
        const payload = await readJson(response);
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
    () => buildOperations(data, today, secureSummary.pendingPasswordResets),
    [data, today, secureSummary.pendingPasswordResets]
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
      <PageHeader title="CENTRO DE OPERACIONES" description="Pagina principal para decidir que necesita Pan y Esperanza hoy." />

      <AssistantCard
        message={assistant.message}
        recommendation={assistant.recommendation}
        summaryItems={assistant.summaryItems}
        onStart={() => openModule(assistant.primaryDestination)}
        disabled={!assistant.primaryDestination}
      />

      {quickItems.length > 0 && (
        <section className="mt-5">
          <SectionTitle title="BARRA RAPIDA DE HOY" subtitle={formatDate(today)} />
          <QuickTodayBar items={quickItems} onOpen={openModule} />
        </section>
      )}

      <section className="mt-6">
        <SectionTitle title="PRIORIDADES" subtitle="Ordenadas para abrir directamente el modulo que corresponde." />
        <PriorityDeck cards={priorityCards} onOpen={openModule} />
      </section>

      <section className="mt-6">
        <SectionTitle title="MIS TAREAS" subtitle="Tareas automaticas generadas con datos reales." />
        {tasks.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {tasks.map((task) => (
              <TaskCard key={task.title} task={task} onOpen={openModule} />
            ))}
          </div>
        ) : (
          <EmptyState title="No hay tareas pendientes." text="Todo correcto por ahora." />
        )}
      </section>

      {canSeeFamilies && (
        <section className="mt-6">
          <SectionTitle title="FAMILIAS PRIORITARIAS" subtitle="Solo las unidades con mayor urgencia operativa." />
          {operations.priorityFamilies.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {operations.priorityFamilies.slice(0, FAMILY_LIMIT).map((family) => (
                <FamilyPriorityCard key={family.id} family={family} destination={buildFamilyDetailDestination(family, familyModule)} onOpen={openModule} />
              ))}
            </div>
          ) : (
            <EmptyState title="No hay asuntos urgentes." text="No hay familias prioritarias con los datos actuales." />
          )}
        </section>
      )}

      {(canSeeInventory || communicationCards.length > 0) && (
        <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          {canSeeInventory && (
            <div>
              <SectionTitle title="INVENTARIO" subtitle="Solo alertas utiles: bajo minimo, agotados y caducidades." />
              <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-1">
                <AlertList
                  title="Stock bajo"
                  icon={Boxes}
                  items={operations.lowStock}
                  empty="Todo correcto por ahora."
                  renderItem={(item) => (
                    <>
                      <strong>{item.name}</strong>
                      <p>Stock: {formatNumber(item.stock)} {item.unit || ''}. Minimo: {formatNumber(item.low_stock_threshold)}.</p>
                    </>
                  )}
                  onOpen={() => openModule({ moduleId: 'inventory', filter: 'stock-critical' })}
                />
                <AlertList
                  title="Productos agotados"
                  icon={AlertTriangle}
                  items={operations.outOfStock}
                  empty="No hay productos agotados."
                  renderItem={(item) => (
                    <>
                      <strong>{item.name}</strong>
                      <p>{item.category || 'Sin categoria'} - {item.location || 'Sin ubicacion'}</p>
                    </>
                  )}
                  onOpen={() => openModule({ moduleId: 'inventory', filter: 'stock-critical' })}
                />
                <AlertList
                  title="Proximas caducidades"
                  icon={CalendarClock}
                  items={operations.expiringSoon}
                  empty="No hay caducidades proximas."
                  renderItem={(item) => (
                    <>
                      <strong>{item.name}</strong>
                      <p>{formatExpiry(item.expires_at, today)} - Lote {item.lot || '-'}</p>
                    </>
                  )}
                  onOpen={() => openModule({ moduleId: 'inventory', filter: 'expiring-soon' })}
                />
              </div>
            </div>
          )}

          {communicationCards.length > 0 && (
            <div>
              <SectionTitle title="COMUNICACIONES" subtitle="Correos, justificantes y recuperaciones pendientes." />
              <div className="grid gap-4">
                {communicationCards.map((card) => (
                  <CommunicationCard key={card.title} {...card} onOpen={openModule} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-6">
        <SectionTitle title="RESUMEN GENERAL" subtitle="Indicadores generales al final de la pantalla." />
        {summaryCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
            ))}
          </div>
        ) : (
          <EmptyState title="Sin resumen disponible." text="No hay indicadores visibles con tus permisos." />
        )}
      </section>
    </>
  );
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
        <Metric label="Ultima ayuda" value={family.lastHelpText} />
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

function buildFamilyListDestination(families, moduleId, filter) {
  return {
    moduleId,
    filter,
    beneficiaryIds: families.flatMap((family) => family.beneficiaryIds || []),
    label: 'Familias criticas'
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

function buildPriorityCards(operations, currentUser, familyModule) {
  return [
    familyModule && {
      title: 'Familias criticas',
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
      title: 'Familias criticas',
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
      title: 'Revisar familias criticas',
      detail: pluralSummary(operations.criticalFamilies.length, 'familia critica requiere atencion', 'familias criticas requieren atencion'),
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
      detail: pluralSummary(operations.pendingReceipts.length, 'justificante necesita revision', 'justificantes necesitan revision'),
      priority: 'Alta',
      action: 'Ver justificantes',
      moduleId: 'receipts',
      destination: {
        moduleId: 'receipts',
        filter: 'pending-receipts',
        receiptIds: operations.pendingReceipts.map((item) => item.id)
      }
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
    familyModule && operations.criticalFamilies.length > 0 && pluralLabel(operations.criticalFamilies.length, 'familia critica', 'familias criticas'),
    canAccess(currentUser, 'deliveries') && operations.todayDeliveries.length > 0 && pluralLabel(operations.todayDeliveries.length, 'entrega de hoy', 'entregas de hoy'),
    canAccess(currentUser, 'inventory') && operations.criticalStock.length > 0 && pluralLabel(operations.criticalStock.length, 'producto critico', 'productos criticos'),
    canAccess(currentUser, 'inventory') && operations.expiringSoon.length > 0 && pluralLabel(operations.expiringSoon.length, 'producto proximo a caducar', 'productos proximos a caducar'),
    canAccess(currentUser, 'receipts') && operations.pendingReceipts.length > 0 && pluralLabel(operations.pendingReceipts.length, 'justificante pendiente', 'justificantes pendientes'),
    canAccess(currentUser, 'donations') && operations.pendingDonations.length > 0 && pluralLabel(operations.pendingDonations.length, 'donacion pendiente', 'donaciones pendientes')
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
      recommendation: 'Empieza revisando la familia critica con mas riesgo.'
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
      title: 'Recuperaciones de contrasena',
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

function sentenceCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
