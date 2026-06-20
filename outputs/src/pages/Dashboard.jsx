import { AlertTriangle, Banknote, Boxes, CalendarDays, HandCoins, HandHeart, PackageCheck, Scale, ShoppingBasket, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { formatDate } from '../lib/formatters';

export function Dashboard({ data }) {
  const month = new Date().toISOString().slice(0, 7);
  const activeBeneficiaries = data.beneficiaries.filter((item) => item.is_active).length;
  const attendedFamilies = new Set(data.deliveries.map((item) => item.family_id).filter(Boolean)).size || data.families.length;
  const deliveriesThisMonth = data.deliveries.filter((item) => String(item.delivered_at || '').startsWith(month)).length;
  const lowStock = data.inventory_items.filter((item) => Number(item.stock) <= Number(item.low_stock_threshold));
  const nearExpiry = data.inventory_items.filter((item) => item.expires_at && daysUntil(item.expires_at) <= 30);
  const foodKg = data.deliveries.filter((item) => isFoodDelivery(item, data.inventory_items)).reduce((total, item) => total + Number(item.quantity || 0), 0);
  const productUnits = data.deliveries.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const donatedValue = (data.donations || []).reduce((total, item) => total + Number(item.estimated_value || 0), 0);
  const monthlyIncome = (data.treasury_incomes || []).filter((item) => String(item.income_at || '').startsWith(month)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const monthlyExpenses = (data.treasury_expenses || []).filter((item) => String(item.expense_at || '').startsWith(month)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const balance = monthlyIncome - monthlyExpenses;
  const monthlyDeliveries = groupByMonth(data.deliveries, 'delivered_at');
  const monthlyTreasury = buildMonthlyTreasury(data);
  const productTotals = data.deliveries.reduce((acc, item) => {
    const key = item.inventory_item_name || item.help_type || 'Sin producto';
    acc[key] = (acc[key] || 0) + Number(item.quantity || 0);
    return acc;
  }, {});
  const movements = latestMovements(data);

  return (
    <>
      <PageHeader title="Panel principal" description="Centro operativo con metricas reales, alertas y actividad reciente." />

      <section className="mb-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-md border border-brand-100 bg-white p-5 shadow-panel">
          <p className="text-sm font-semibold uppercase text-brand-700">Resumen de actividad</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <HeroMetric label="Entregas realizadas" value={data.deliveries.length} />
            <HeroMetric label="Entregas este mes" value={deliveriesThisMonth} />
            <HeroMetric label="Balance economico" value={`${balance.toFixed(2)} EUR`} positive={balance >= 0} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Progress label="Stock critico" value={lowStock.length} total={Math.max(data.inventory_items.length, 1)} tone="orange" />
            <Progress label="Productos proximos a caducar" value={nearExpiry.length} total={Math.max(data.inventory_items.length, 1)} tone="yellow" />
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-900 p-5 text-white shadow-panel">
          <p className="text-sm font-semibold uppercase text-brand-100">Hoy</p>
          <p className="mt-3 text-4xl font-bold">{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}</p>
          <div className="mt-6 space-y-3 text-sm">
            <p className="flex justify-between"><span>Beneficiarios activos</span><strong>{activeBeneficiaries}</strong></p>
            <p className="flex justify-between"><span>Familias atendidas</span><strong>{attendedFamilies}</strong></p>
            <p className="flex justify-between"><span>Correos registrados</span><strong>{(data.email_logs || []).length}</strong></p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Beneficiarios activos" value={activeBeneficiaries} icon={HandHeart} />
        <StatCard label="Familias atendidas" value={attendedFamilies} icon={Users} />
        <StatCard label="Entregas del mes" value={deliveriesThisMonth} icon={CalendarDays} />
        <StatCard label="Kg alimentos entregados" value={foodKg.toFixed(2)} icon={Scale} />
        <StatCard label="Productos entregados" value={productUnits.toFixed(2)} icon={ShoppingBasket} />
        <StatCard label="Valor donado" value={`${donatedValue.toFixed(2)} EUR`} icon={HandCoins} />
        <StatCard label="Stock critico" value={lowStock.length} icon={AlertTriangle} />
        <StatCard label="Donaciones recibidas" value={(data.donations || []).length} icon={Boxes} />
        <StatCard label="Ingresos del mes" value={`${monthlyIncome.toFixed(2)} EUR`} icon={TrendingUp} />
        <StatCard label="Gastos del mes" value={`${monthlyExpenses.toFixed(2)} EUR`} icon={Banknote} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Chart title="Entregas mensuales" data={monthlyDeliveries} />
        <Chart title="Productos entregados" data={productTotals} />
        <Chart title="Balance mensual" data={monthlyTreasury} suffix=" EUR" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">Ultimos movimientos</h3>
          <div className="mt-3 space-y-3">
            {movements.map((item) => <div key={item.id} className="rounded-md bg-slate-50 p-3 text-sm"><strong>{formatDate(item.date)} | {item.title}</strong><p className="text-slate-600">{item.description}</p></div>)}
            {!movements.length && <p className="text-sm text-slate-500">Sin movimientos registrados.</p>}
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">Alertas operativas</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {lowStock.slice(0, 6).map((item) => <div key={item.id} className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm"><strong>{item.name}</strong><p>Stock: {item.stock} {item.unit}. Minimo: {item.low_stock_threshold}.</p></div>)}
            {nearExpiry.slice(0, 6).map((item) => <div key={`exp-${item.id}`} className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm"><strong>{item.name}</strong><p>Caduca: {item.expires_at}. Lote: {item.lot || '-'}</p></div>)}
            {!lowStock.length && !nearExpiry.length && <p className="text-sm text-slate-500">No hay alertas activas.</p>}
          </div>
        </section>
      </div>
    </>
  );
}

function HeroMetric({ label, value, positive = true }) {
  return <div className="rounded-md bg-brand-50 p-4"><p className="text-sm text-slate-600">{label}</p><p className={`mt-1 text-3xl font-bold ${positive ? 'text-brand-700' : 'text-red-600'}`}>{value}</p></div>;
}

function Progress({ label, value, total, tone }) {
  const percent = Math.min((value / total) * 100, 100);
  const color = tone === 'orange' ? 'bg-orange-500' : 'bg-yellow-500';
  return <div><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}</strong></div><div className="h-3 rounded bg-slate-100"><div className={`h-3 rounded ${color}`} style={{ width: `${Math.max(percent, value ? 8 : 0)}%` }} /></div></div>;
}

function isFoodDelivery(delivery, items) {
  const item = items.find((entry) => entry.id === delivery.inventory_item_id || entry.name === delivery.inventory_item_name);
  return String(delivery.help_type || '').toLowerCase().includes('alimento') || String(item?.category || '').toLowerCase().includes('alimento');
}

function groupByMonth(rows, field) {
  return rows.reduce((acc, item) => {
    const key = String(item[field] || '').slice(0, 7) || 'Sin fecha';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildMonthlyTreasury(data) {
  const result = {};
  (data.treasury_incomes || []).forEach((item) => {
    const key = String(item.income_at || '').slice(0, 7) || 'Sin fecha';
    result[key] = (result[key] || 0) + Number(item.amount || 0);
  });
  (data.treasury_expenses || []).forEach((item) => {
    const key = String(item.expense_at || '').slice(0, 7) || 'Sin fecha';
    result[key] = (result[key] || 0) - Number(item.amount || 0);
  });
  return result;
}

function latestMovements(data) {
  const deliveries = data.deliveries.map((item) => ({ id: `d-${item.id}`, date: item.delivered_at, title: `Entrega a ${item.beneficiary_name || 'beneficiario'}`, description: `${item.help_type || 'Ayuda'} | ${item.quantity || 0} ${item.inventory_item_name || ''}` }));
  const inventory = data.inventory_movements.map((item) => ({ id: `i-${item.id}`, date: item.moved_at, title: `${item.movement_type} de inventario`, description: `${item.item_name} | ${item.quantity} | ${item.responsible || 'Sin responsable'}` }));
  const incomes = (data.treasury_incomes || []).map((item) => ({ id: `ti-${item.id}`, date: item.income_at, title: `Ingreso: ${item.concept}`, description: `${Number(item.amount || 0).toFixed(2)} EUR | ${item.category || ''}` }));
  const expenses = (data.treasury_expenses || []).map((item) => ({ id: `te-${item.id}`, date: item.expense_at, title: `Gasto: ${item.concept}`, description: `${Number(item.amount || 0).toFixed(2)} EUR | ${item.category || ''}` }));
  return [...deliveries, ...inventory, ...incomes, ...expenses].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
}

function Chart({ title, data, suffix = '' }) {
  const values = Object.values(data).map((value) => Math.abs(Number(value || 0)));
  const max = Math.max(...values, 1);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="font-bold text-ink">{title}</h3>
      <div className="mt-4 space-y-3">{Object.entries(data).map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{Number(value).toFixed(suffix ? 2 : 0)}{suffix}</strong></div><div className="h-3 rounded bg-slate-100"><div className={`h-3 rounded ${Number(value) < 0 ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${Math.max((Math.abs(Number(value)) / max) * 100, 8)}%` }} /></div></div>)}{!Object.keys(data).length && <p className="text-sm text-slate-500">Sin datos suficientes.</p>}</div>
    </section>
  );
}

function daysUntil(value) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}
