import {
  Banknote,
  BarChart3,
  Building2,
  FileText,
  Gift,
  HandCoins,
  Landmark,
  PackageCheck,
  Receipt,
  Scale,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { canDo } from '../lib/auth';

export function Accounting({ data, currentUser }) {
  const canCreate = canDo(currentUser, 'accounting', 'create');
  const canEdit = canDo(currentUser, 'accounting', 'edit');
  const canDelete = canDo(currentUser, 'accounting', 'delete');
  const metrics = useMemo(() => buildAccountingMetrics(data), [data]);
  const sections = buildSections(metrics);

  return (
    <>
      <PageHeader
        title="Contabilidad"
        description="Base profesional para caja, bancos, documentos, prestamos, deudas y valor social."
      />

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Modulo nuevo</p>
            <h2 className="mt-2 text-2xl font-bold text-ink">Base contable preparada para operar sin duplicar datos.</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Tesoreria sigue disponible. Esta pantalla inaugura la nueva estructura de Contabilidad y se ira activando por fases.
            </p>
          </div>
          <PermissionPanel canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </div>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Eventos contables" value={metrics.events} icon={Scale} />
        <StatCard label="Cuentas caja/banco" value={metrics.accounts} icon={Landmark} />
        <StatCard label="Movimientos" value={metrics.movements} icon={Wallet} />
        <StatCard label="Documentos" value={metrics.documents} icon={FileText} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-lg font-bold text-ink">Areas contables</h3>
          <p className="text-sm text-slate-500">Estructura inicial de Fase 3.1</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <AccountingSectionCard key={section.title} section={section} />
          ))}
        </div>
      </section>
    </>
  );
}

function PermissionPanel({ canCreate, canEdit, canDelete }) {
  const items = [
    ['Crear', canCreate],
    ['Editar', canEdit],
    ['Eliminar', canDelete]
  ];
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck size={17} /> Permisos activos</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(([label, active]) => (
          <span key={label} className={`rounded-md px-2.5 py-1 text-xs font-bold ${active ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-slate-500'}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function AccountingSectionCard({ section }) {
  const Icon = section.icon;
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-md p-2 ${section.tone}`}><Icon size={21} /></span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">Preparado</span>
      </div>
      <h4 className="mt-4 text-lg font-bold text-ink">{section.title}</h4>
      <p className="mt-1 text-sm text-slate-600">{section.detail}</p>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.metricLabel}</p>
          <p className="mt-1 text-3xl font-bold text-ink">{section.value}</p>
        </div>
        <span className="text-xs font-semibold text-slate-500">{section.stage}</span>
      </div>
    </article>
  );
}

function buildAccountingMetrics(data) {
  const accounts = data.financial_accounts || [];
  const movements = data.cash_bank_movements || [];
  const events = data.accounting_events || [];
  const documents = data.accounting_documents || [];
  const loans = data.loan_records || [];
  const debts = data.debt_records || [];
  const socialValues = data.social_value_events || [];
  const inKindDonations = socialValues.filter((item) => item.value_type === 'received' || item.event_type === 'in_kind_donation');

  return {
    events: events.length,
    accounts: accounts.length,
    cashAccounts: accounts.filter((item) => item.account_type === 'cash').length,
    bankAccounts: accounts.filter((item) => item.account_type !== 'cash').length,
    movements: movements.length,
    incomes: events.filter((item) => item.event_type === 'income').length,
    expenses: events.filter((item) => item.event_type === 'expense' || item.event_type === 'purchase').length,
    loans: loans.length,
    debts: debts.length,
    documents: documents.length,
    inKindDonations: inKindDonations.length,
    socialValueTotal: socialValues.reduce((total, item) => total + Number(item.amount || item.estimated_value || 0), 0)
  };
}

function buildSections(metrics) {
  return [
    {
      title: 'Caja',
      detail: 'Movimientos de efectivo con anulacion y correccion, sin borrado operativo.',
      metricLabel: 'Cajas',
      value: metrics.cashAccounts,
      stage: 'Fase 3.2',
      icon: Wallet,
      tone: 'bg-emerald-50 text-emerald-700'
    },
    {
      title: 'Bancos',
      detail: 'Fichas para Santander, Caixa, BBVA, Bizum, PayPal y otras cuentas.',
      metricLabel: 'Cuentas',
      value: metrics.bankAccounts,
      stage: 'Fase 3.2',
      icon: Landmark,
      tone: 'bg-blue-50 text-blue-700'
    },
    {
      title: 'Ingresos',
      detail: 'Ingresos monetarios clasificados por tipo y enlazados con cuenta.',
      metricLabel: 'Eventos',
      value: metrics.incomes,
      stage: 'Fase 3.3',
      icon: HandCoins,
      tone: 'bg-brand-50 text-brand-700'
    },
    {
      title: 'Gastos',
      detail: 'Gastos por categoria con factura, proveedor y efecto financiero.',
      metricLabel: 'Eventos',
      value: metrics.expenses,
      stage: 'Fase 3.3',
      icon: Banknote,
      tone: 'bg-orange-50 text-orange-700'
    },
    {
      title: 'Prestamos',
      detail: 'Adelantos a la asociacion con devoluciones parciales y saldo pendiente.',
      metricLabel: 'Registros',
      value: metrics.loans,
      stage: 'Fase 3.4',
      icon: Building2,
      tone: 'bg-violet-50 text-violet-700'
    },
    {
      title: 'Deudas',
      detail: 'Importes pendientes con proveedores u otras personas, con historial.',
      metricLabel: 'Registros',
      value: metrics.debts,
      stage: 'Fase 3.4',
      icon: Receipt,
      tone: 'bg-red-50 text-red-700'
    },
    {
      title: 'Donaciones en especie',
      detail: 'Valor social recibido separado de caja, bancos y tesoreria.',
      metricLabel: 'Registros',
      value: metrics.inKindDonations,
      stage: 'Fase 3.5',
      icon: Gift,
      tone: 'bg-pink-50 text-pink-700'
    },
    {
      title: 'Valor social',
      detail: 'Valor recibido y entregado por donaciones, inventario y entregas.',
      metricLabel: 'Importe',
      value: `${metrics.socialValueTotal.toFixed(2)} EUR`,
      stage: 'Fase 3.5',
      icon: PackageCheck,
      tone: 'bg-cyan-50 text-cyan-700'
    },
    {
      title: 'Documentos',
      detail: 'Facturas, tickets y justificantes relacionados con eventos contables.',
      metricLabel: 'Archivos',
      value: metrics.documents,
      stage: 'Fase 3.3',
      icon: FileText,
      tone: 'bg-slate-100 text-slate-700'
    },
    {
      title: 'Informes',
      detail: 'Caja, bancos, balance, prestamos, deudas y valor social.',
      metricLabel: 'Base',
      value: metrics.events,
      stage: 'Fase 3.7',
      icon: BarChart3,
      tone: 'bg-amber-50 text-amber-700'
    }
  ];
}
