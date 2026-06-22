import { AlertTriangle, Banknote, Boxes, HandCoins, HandHeart, Mail, PackageCheck, UserCheck, UserX, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { formatDate } from '../lib/formatters';

export function Dashboard({ data }) {
  const activeBeneficiaries = data.beneficiaries.filter((item) => item.is_active).length;
  const activeFamilies = data.families.length;
  const minors = data.beneficiaries.reduce((total, item) => total + Number(item.minors_count || 0), 0);
  const lowStock = data.inventory_items.filter((item) => Number(item.stock) <= Number(item.low_stock_threshold));
  const month = new Date().toISOString().slice(0, 7);
  const deliveriesThisMonth = data.deliveries.filter((item) => String(item.delivered_at || '').startsWith(month)).length;
  const monthlyIncome = (data.treasury_incomes || []).filter((item) => String(item.income_at || '').startsWith(month)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const monthlyExpenses = (data.treasury_expenses || []).filter((item) => String(item.expense_at || '').startsWith(month)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const pendingLoans = (data.treasury_loans || []).filter((item) => ['Pendiente', 'Pendiente de devolver', 'Parcialmente devuelto'].includes(item.status)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const activeUsers = (data.app_users || []).filter((user) => user.is_active).length;
  const blockedUsers = (data.app_users || []).filter((user) => !user.is_active).length;
  const lastAccesses = [...(data.app_users || [])].filter((user) => user.last_access_at).sort((a, b) => String(b.last_access_at).localeCompare(String(a.last_access_at))).slice(0, 3);
  const monthlyDeliveries = data.deliveries.reduce((acc, item) => {
    const key = String(item.delivered_at || '').slice(0, 7) || 'Sin fecha';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const productTotals = data.deliveries.reduce((acc, item) => {
    const key = item.inventory_item_name || 'Sin producto';
    acc[key] = (acc[key] || 0) + Number(item.quantity || 0);
    return acc;
  }, {});
  return (
    <>
      <PageHeader title="Panel principal" description="Resumen operativo para coordinacion diaria." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Beneficiarios activos" value={activeBeneficiaries} icon={HandHeart} />
        <StatCard label="Familias activas" value={activeFamilies} icon={Users} />
        <StatCard label="Menores atendidos" value={minors} icon={Users} />
        <StatCard label="Entregas realizadas" value={data.deliveries.length} icon={PackageCheck} />
        <StatCard label="Entregas del mes" value={deliveriesThisMonth} icon={PackageCheck} />
        <StatCard label="Inventario bajo minimo" value={lowStock.length} icon={AlertTriangle} />
        <StatCard label="Ingresos del mes" value={`${monthlyIncome.toFixed(2)} EUR`} icon={HandCoins} />
        <StatCard label="Gastos del mes" value={`${monthlyExpenses.toFixed(2)} EUR`} icon={Banknote} />
        <StatCard label="Pendiente devolucion" value={`${pendingLoans.toFixed(2)} EUR`} icon={Boxes} />
        <StatCard label="Correos enviados" value={(data.email_logs || []).length} icon={Mail} />
        <StatCard label="Usuarios activos" value={activeUsers} icon={UserCheck} />
        <StatCard label="Usuarios bloqueados" value={blockedUsers} icon={UserX} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">Ultimas entregas</h3>
          <div className="mt-3 space-y-3">{data.deliveries.slice(0, 6).map((item) => <div key={item.id} className="rounded-md bg-slate-50 p-3 text-sm"><strong>{formatDate(item.delivered_at)} · {item.beneficiary_name}</strong><p className="text-slate-600">{item.help_type} · {item.quantity} {item.inventory_item_name}</p></div>)}{!data.deliveries.length && <p className="text-sm text-slate-500">Sin entregas registradas.</p>}</div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">Alertas de stock</h3>
          <div className="mt-3 space-y-3">{lowStock.map((item) => <div key={item.id} className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm"><strong>{item.name}</strong><p>Stock: {item.stock} {item.unit}. Minimo: {item.low_stock_threshold}.</p></div>)}{!lowStock.length && <p className="text-sm text-slate-500">No hay alertas activas.</p>}</div>
        </section>
      </div>
      <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Ultimos accesos</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">{lastAccesses.map((user) => <div key={user.id} className="rounded-md bg-slate-50 p-3 text-sm"><strong>{user.first_name} {user.last_name}</strong><p className="text-slate-600">{formatDate(user.last_access_at)}</p></div>)}{!lastAccesses.length && <p className="text-sm text-slate-500">Sin accesos registrados.</p>}</div>
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Chart title="Entregas por mes" data={monthlyDeliveries} />
        <Chart title="Productos entregados" data={productTotals} />
      </div>
    </>
  );
}

function Chart({ title, data }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="font-bold text-ink">{title}</h3>
      <div className="mt-4 space-y-3">{Object.entries(data).map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}</strong></div><div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-brand-600" style={{ width: `${Math.max((value / max) * 100, 8)}%` }} /></div></div>)}{!Object.keys(data).length && <p className="text-sm text-slate-500">Sin datos suficientes.</p>}</div>
    </section>
  );
}
