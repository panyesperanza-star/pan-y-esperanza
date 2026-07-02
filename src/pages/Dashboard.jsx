import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Gift,
  HandCoins,
  HandHeart,
  KeyRound,
  Mail,
  PackageCheck,
  Play,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
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

  function openModule(moduleId) {
    if (!moduleId || !canAccess(currentUser, moduleId)) return;
    onNavigate?.(moduleId);
  }

  const priorityCards = [
    {
      title: 'Familias urgentes',
      value: operations.urgentFamilies.length,
      detail: `${operations.priorityFamilies.length} familias priorizadas`,
      icon: ShieldAlert,
      moduleId: 'families',
      tone: 'red'
    },
    {
      title: `Sin ayuda +${STALE_HELP_DAYS} dias`,
      value: operations.staleBeneficiaries.length,
      detail: 'Beneficiarios activos',
      icon: Clock3,
      moduleId: 'beneficiaries',
      tone: 'amber'
    },
    {
      title: 'Stock critico',
      value: operations.criticalStock.length,
      detail: `${operations.outOfStock.length} productos agotados`,
      icon: AlertTriangle,
      moduleId: 'inventory',
      tone: 'orange'
    },
    {
      title: 'Caducidades proximas',
      value: operations.expiringSoon.length,
      detail: `Ventana de ${EXPIRY_WINDOW_DAYS} dias`,
      icon: CalendarClock,
      moduleId: 'inventory',
      tone: 'yellow'
    },
    {
      title: 'Correos pendientes',
      value: operations.pendingEmails.length,
      detail: 'Comunicaciones no resueltas',
      icon: Mail,
      moduleId: 'communications',
      tone: 'blue'
    },
    {
      title: 'Justificantes pendientes',
      value: operations.pendingReceipts.length,
      detail: 'Sin numero o firma',
      icon: FileText,
      moduleId: 'receipts',
      tone: 'purple'
    }
  ];

  const todayCards = [
    {
      title: 'Entregas de hoy',
      value: operations.todayDeliveries.length,
      detail: describeList(operations.todayDeliveries, (item) => item.beneficiary_name || item.help_type),
      icon: PackageCheck,
      moduleId: 'deliveries'
    },
    {
      title: 'Nuevos beneficiarios',
      value: operations.newBeneficiaries.length,
      detail: describeList(operations.newBeneficiaries, (item) => item.full_name),
      icon: UserPlus,
      moduleId: 'beneficiaries'
    },
    {
      title: 'Donaciones pendientes',
      value: operations.pendingDonations.length,
      detail: describeList(operations.pendingDonations, (item) => item.donor || item.donation_type),
      icon: Gift,
      moduleId: 'donations'
    },
    {
      title: 'Voluntarios activos',
      value: operations.activeVolunteers.length,
      detail: describeList(operations.activeVolunteers, (item) => item.full_name),
      icon: UserCheck,
      moduleId: 'volunteers'
    }
  ];

  const assistantItems = [
    pluralSummary(operations.urgentFamilies.length, 'familia urgente', 'familias urgentes'),
    pluralSummary(operations.todayDeliveries.length, 'entrega', 'entregas'),
    pluralSummary(operations.pendingReceipts.length, 'justificante pendiente', 'justificantes pendientes'),
    pluralSummary(operations.pendingDonations.length, 'donacion pendiente', 'donaciones pendientes')
  ];
  const firstTask = priorityCards.find((item) => Number(item.value) > 0 && canAccess(currentUser, item.moduleId))?.moduleId
    || todayCards.find((item) => Number(item.value) > 0 && canAccess(currentUser, item.moduleId))?.moduleId
    || (canAccess(currentUser, 'deliveries') ? 'deliveries' : 'dashboard');

  return (
    <>
      <PageHeader title="CENTRO DE OPERACIONES" description="Pagina principal de trabajo diario de Pan y Esperanza." />

      <AssistantCard
        userName={displayUserName(currentUser)}
        items={assistantItems}
        onStart={() => openModule(firstTask)}
        disabled={!canAccess(currentUser, firstTask)}
      />

      <section className="mt-5">
        <SectionTitle title="PRIORIDADES" subtitle="Alertas calculadas automaticamente con los datos cargados desde Supabase." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {priorityCards.map((card) => (
            <ActionCard key={card.title} {...card} canOpen={canAccess(currentUser, card.moduleId)} onOpen={openModule} />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle title="HOY" subtitle={formatDate(today)} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {todayCards.map((card) => (
            <TodayCard key={card.title} {...card} canOpen={canAccess(currentUser, card.moduleId)} onOpen={openModule} />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle title="FAMILIAS PRIORITARIAS" subtitle="Solo se muestran las unidades con mayor nivel de urgencia." />
        {operations.priorityFamilies.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {operations.priorityFamilies.slice(0, FAMILY_LIMIT).map((family) => (
              <FamilyPriorityCard key={family.id} family={family} canOpen={canAccess(currentUser, family.moduleId)} onOpen={openModule} />
            ))}
          </div>
        ) : (
          <EmptyState text="Sin familias prioritarias con los datos actuales." />
        )}
      </section>

      <section className="mt-6">
        <SectionTitle title="INVENTARIO" subtitle="Solo alertas: stock bajo, agotados y caducidades proximas." />
        <div className="grid gap-5 lg:grid-cols-3">
          <AlertList
            title="Stock bajo"
            icon={Boxes}
            items={operations.lowStock}
            empty="Sin productos bajo minimo."
            renderItem={(item) => (
              <>
                <strong>{item.name}</strong>
                <p>Stock: {formatNumber(item.stock)} {item.unit || ''}. Minimo: {formatNumber(item.low_stock_threshold)}.</p>
              </>
            )}
            onOpen={() => openModule('inventory')}
            canOpen={canAccess(currentUser, 'inventory')}
          />
          <AlertList
            title="Productos agotados"
            icon={AlertTriangle}
            items={operations.outOfStock}
            empty="Sin productos agotados."
            renderItem={(item) => (
              <>
                <strong>{item.name}</strong>
                <p>{item.category || 'Sin categoria'} - {item.location || 'Sin ubicacion'}</p>
              </>
            )}
            onOpen={() => openModule('inventory')}
            canOpen={canAccess(currentUser, 'inventory')}
          />
          <AlertList
            title="Proximas caducidades"
            icon={CalendarClock}
            items={operations.expiringSoon}
            empty="Sin caducidades proximas."
            renderItem={(item) => (
              <>
                <strong>{item.name}</strong>
                <p>{formatExpiry(item.expires_at, today)} - Lote {item.lot || '-'}</p>
              </>
            )}
            onOpen={() => openModule('inventory')}
            canOpen={canAccess(currentUser, 'inventory')}
          />
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle title="COMUNICACIONES" subtitle="Pendientes de correo, justificantes y recuperaciones de contrasena." />
        <div className="grid gap-4 lg:grid-cols-3">
          <CommunicationCard
            title="Emails pendientes"
            value={operations.pendingEmails.length}
            detail={describeList(operations.pendingEmails, (item) => item.subject || item.recipient)}
            icon={Mail}
            moduleId="communications"
            canOpen={canAccess(currentUser, 'communications')}
            onOpen={openModule}
          />
          <CommunicationCard
            title="Justificantes pendientes"
            value={operations.pendingReceipts.length}
            detail={describeList(operations.pendingReceipts, (item) => item.beneficiary_name || item.receipt_number)}
            icon={FileText}
            moduleId="receipts"
            canOpen={canAccess(currentUser, 'receipts')}
            onOpen={openModule}
          />
          <CommunicationCard
            title="Recuperaciones de contrasena"
            value={secureSummary.loading ? '...' : secureSummary.pendingPasswordResets ?? '-'}
            detail={secureSummary.pendingPasswordResets === null ? 'Visible con permiso de usuarios' : 'Solicitudes vigentes'}
            icon={KeyRound}
            moduleId="users"
            canOpen={canAccess(currentUser, 'users')}
            onOpen={openModule}
          />
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle title="RESUMEN" subtitle="Estadisticas generales del sistema." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Beneficiarios activos" value={operations.summary.activeBeneficiaries} icon={HandHeart} />
          <StatCard label="Familias activas" value={operations.summary.activeFamilies} icon={Users} />
          <StatCard label="Menores atendidos" value={operations.summary.minors} icon={Users} />
          <StatCard label="Entregas realizadas" value={operations.activeDeliveries.length} icon={PackageCheck} />
          <StatCard label="Entregas del mes" value={operations.summary.deliveriesThisMonth} icon={PackageCheck} />
          <StatCard label="Inventario bajo minimo" value={operations.criticalStock.length} icon={AlertTriangle} />
          <StatCard label="Ingresos del mes" value={`${operations.summary.monthlyIncome.toFixed(2)} EUR`} icon={HandCoins} />
          <StatCard label="Gastos del mes" value={`${operations.summary.monthlyExpenses.toFixed(2)} EUR`} icon={Banknote} />
          <StatCard label="Pendiente devolucion" value={`${operations.summary.pendingLoans.toFixed(2)} EUR`} icon={Boxes} />
          <StatCard label="Correos enviados" value={(data.email_logs || []).length} icon={Mail} />
          <StatCard label="Usuarios activos" value={operations.summary.activeUsers} icon={UserCheck} />
          <StatCard label="Usuarios bloqueados" value={operations.summary.blockedUsers} icon={UserX} />
        </div>
        <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">Ultimos accesos</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {operations.summary.lastAccesses.map((user) => (
              <div key={user.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <strong>{user.first_name} {user.last_name}</strong>
                <p className="text-slate-600">{formatDate(user.last_access_at)}</p>
              </div>
            ))}
            {!operations.summary.lastAccesses.length && <p className="text-sm text-slate-500">Sin accesos registrados.</p>}
          </div>
        </section>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Chart title="Entregas por mes" data={operations.summary.monthlyDeliveries} />
          <Chart title="Productos entregados" data={operations.summary.productTotals} />
        </div>
      </section>
    </>
  );
}

function AssistantCard({ userName, items, onStart, disabled }) {
  return (
    <section className="rounded-md bg-brand-700 p-5 text-white shadow-panel">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Asistente de jornada</p>
          <h3 className="mt-2 text-3xl font-bold">Buenos dias, {userName}.</h3>
          <p className="mt-2 text-sm text-brand-50">Hoy tienes:</p>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2">
                <CheckCircle2 size={17} className="text-brand-100" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="secondary" onClick={onStart} disabled={disabled} className="self-start whitespace-nowrap border-white bg-white text-brand-700 hover:bg-brand-50 lg:self-center">
          <Play size={18} /> Comenzar jornada
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

function ActionCard({ title, value, detail, icon: Icon, moduleId, tone, canOpen, onOpen }) {
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen(moduleId)}
      className={`focus-ring group flex min-h-32 w-full flex-col justify-between rounded-md border bg-white p-4 text-left shadow-panel transition ${toneClasses(tone)} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-white/70 p-2"><Icon size={22} /></span>
        <ArrowRight size={18} className="opacity-60 transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{value}</p>
        <p className="mt-1 font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{detail}</p>
      </div>
    </button>
  );
}

function TodayCard({ title, value, detail, icon: Icon, moduleId, canOpen, onOpen }) {
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen(moduleId)}
      className="focus-ring rounded-md border border-slate-200 bg-white p-4 text-left shadow-panel transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={20} /></span>
        <ArrowRight size={17} className="text-slate-400" />
      </div>
      <p className="mt-4 text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 font-semibold text-ink">{title}</p>
      <p className="mt-2 min-h-10 text-sm text-slate-500">{detail}</p>
    </button>
  );
}

function FamilyPriorityCard({ family, canOpen, onOpen }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{family.code || 'Unidad familiar'}</p>
          <h4 className="mt-1 text-lg font-bold text-ink">{family.name}</h4>
        </div>
        <span className={priorityBadgeClass(family.priorityLevel)}>{family.priorityLevel}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Miembros" value={family.membersCount} />
        <Metric label="Menores" value={family.minorsCount} />
        <Metric label="Dias sin ayuda" value={family.daysWithoutHelpText} />
        <Metric label="Prioridad" value={family.priorityLevel} />
      </dl>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" disabled={!canOpen} onClick={() => onOpen(family.moduleId)}>
          Ver expediente
        </Button>
      </div>
    </article>
  );
}

function AlertList({ title, icon: Icon, items, empty, renderItem, onOpen, canOpen }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-bold text-ink"><Icon size={19} /> {title}</h4>
        <Button variant="secondary" disabled={!canOpen} onClick={onOpen}>
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

function CommunicationCard({ title, value, detail, icon: Icon, moduleId, canOpen, onOpen }) {
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen(moduleId)}
      className="focus-ring rounded-md border border-slate-200 bg-white p-5 text-left shadow-panel transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-slate-100 p-2 text-slate-700"><Icon size={20} /></span>
        <ArrowRight size={17} className="text-slate-400" />
      </div>
      <p className="mt-4 text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
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

function EmptyState({ text }) {
  return <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-panel">{text}</div>;
}

function Chart({ title, data }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="font-bold text-ink">{title}</h3>
      <div className="mt-4 space-y-3">
        {Object.entries(data).map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}</strong></div>
            <div className="h-3 rounded bg-slate-100">
              <div className="h-3 rounded bg-brand-600" style={{ width: `${Math.max((value / max) * 100, 8)}%` }} />
            </div>
          </div>
        ))}
        {!Object.keys(data).length && <p className="text-sm text-slate-500">Sin datos suficientes.</p>}
      </div>
    </section>
  );
}

function buildOperations(data, today, pendingPasswordResets) {
  const activeDeliveries = (data.deliveries || []).filter((item) => item.status !== 'Anulada');
  const activeBeneficiaries = (data.beneficiaries || []).filter((item) => item.is_active);
  const latestDeliveryByBeneficiary = latestDeliveriesMap(activeDeliveries);
  const priorityFamilies = buildFamilyPriorities(data, activeDeliveries, latestDeliveryByBeneficiary, today);
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
  const activeVolunteers = (data.volunteers || []).filter(isActiveVolunteer);

  return {
    activeDeliveries,
    activeBeneficiaries,
    priorityFamilies,
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
    activeVolunteers,
    pendingPasswordResets,
    summary: buildSummary(data, activeDeliveries, criticalStock)
  };
}

function buildSummary(data, activeDeliveries, lowStock) {
  const month = todayISO().slice(0, 7);
  const activeBeneficiaries = (data.beneficiaries || []).filter((item) => item.is_active).length;
  const activeFamilies = (data.families || []).length;
  const minors = (data.beneficiaries || []).reduce((total, item) => total + Number(item.minors_count || 0), 0);
  const deliveriesThisMonth = activeDeliveries.filter((item) => String(item.delivered_at || '').startsWith(month)).length;
  const monthlyIncome = (data.treasury_incomes || []).filter((item) => String(item.income_at || '').startsWith(month)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const monthlyExpenses = (data.treasury_expenses || []).filter((item) => String(item.expense_at || '').startsWith(month)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const pendingLoans = (data.treasury_loans || []).filter((item) => ['Pendiente', 'Pendiente de devolver', 'Parcialmente devuelto'].includes(item.status)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const activeUsers = (data.app_users || []).filter((user) => getUserStatus(user) === 'Activo').length;
  const blockedUsers = (data.app_users || []).filter((user) => getUserStatus(user) !== 'Activo').length;
  const lastAccesses = [...(data.app_users || [])].filter((user) => user.last_access_at).sort((a, b) => String(b.last_access_at).localeCompare(String(a.last_access_at))).slice(0, 3);
  const monthlyDeliveries = activeDeliveries.reduce((acc, item) => {
    const key = String(item.delivered_at || '').slice(0, 7) || 'Sin fecha';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const productTotals = activeDeliveries.reduce((acc, item) => {
    const key = item.inventory_item_name || 'Sin producto';
    acc[key] = (acc[key] || 0) + Number(item.quantity || 0);
    return acc;
  }, {});

  return {
    activeBeneficiaries,
    activeFamilies,
    minors,
    deliveriesThisMonth,
    monthlyIncome,
    monthlyExpenses,
    pendingLoans,
    activeUsers,
    blockedUsers,
    lastAccesses,
    monthlyDeliveries,
    productTotals,
    lowStock
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
  let priorityScore = 0;

  if (hasUrgentSituation) priorityScore += 50;
  if (hasPrioritySituation) priorityScore += 35;
  if (!latestHelpAt && beneficiaries.length) priorityScore += 35;
  if (Number.isFinite(daysWithoutHelp) && daysWithoutHelp >= 60) priorityScore += 30;
  else if (Number.isFinite(daysWithoutHelp) && daysWithoutHelp >= STALE_HELP_DAYS) priorityScore += 15;
  if (minorsCount > 0) priorityScore += 10;
  if (minorsCount >= 3) priorityScore += 10;
  if (membersCount >= 5) priorityScore += 10;

  return {
    ...group,
    code: group.family?.family_code || beneficiaries[0]?.code || '',
    name: group.family?.responsible_name || beneficiaries[0]?.full_name || 'Familia sin nombre',
    membersCount,
    minorsCount,
    daysWithoutHelp,
    daysWithoutHelpText: Number.isFinite(daysWithoutHelp) ? String(daysWithoutHelp) : 'Sin registro',
    priorityScore,
    priorityLevel: priorityLevel(priorityScore)
  };
}

function priorityLevel(score) {
  if (score >= 70) return 'Critica';
  if (score >= 45) return 'Alta';
  if (score >= 25) return 'Media';
  return 'Seguimiento';
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

function isActiveVolunteer(volunteer) {
  if (Object.prototype.hasOwnProperty.call(volunteer, 'is_active')) return volunteer.is_active !== false;
  const status = normalize(volunteer.status || '');
  return !status || !['inactivo', 'bloqueado', 'baja'].includes(status);
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
  if (!items.length) return 'Sin registros pendientes.';
  const names = items.slice(0, 2).map(picker).filter(Boolean);
  if (!names.length) return `${items.length} registro${items.length === 1 ? '' : 's'}`;
  const extra = items.length > names.length ? ` +${items.length - names.length}` : '';
  return `${names.join(', ')}${extra}`;
}

function pluralSummary(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}.`;
}

function displayUserName(user) {
  return user?.first_name || String(user?.email || 'Elizabeth').split('@')[0] || 'Elizabeth';
}

function toneClasses(tone) {
  const classes = {
    red: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    orange: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
    yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
    purple: 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
  };
  return classes[tone] || classes.blue;
}

function priorityBadgeClass(level) {
  if (level === 'Critica') return 'rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700';
  if (level === 'Alta') return 'rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700';
  return 'rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700';
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

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
