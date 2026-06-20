import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { exportExcel, exportReportPdf } from '../lib/exporters';

export function Reports({ data }) {
  const monthly = data.deliveries.reduce((acc, item) => {
    const key = String(item.delivered_at || '').slice(0, 7) || 'Sin fecha';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return (
    <>
      <PageHeader title="Informes" description="Informes por modulo y exportacion completa." actions={<><Button variant="secondary" onClick={() => exportExcel('Pan-y-Esperanza-informes', [{ name: 'Beneficiarios', rows: data.beneficiaries }, { name: 'Familias', rows: data.families }, { name: 'Entregas', rows: data.deliveries }, { name: 'Inventario', rows: data.inventory_items }, { name: 'Donaciones', rows: data.donations }, { name: 'Tesoreria ingresos', rows: data.treasury_incomes || [] }, { name: 'Tesoreria gastos', rows: data.treasury_expenses || [] }, { name: 'Tesoreria prestamos', rows: data.treasury_loans || [] }, { name: 'Voluntarios', rows: data.volunteers }])}><FileSpreadsheet size={18} /> Excel</Button><Button onClick={() => exportReportPdf(data)}><Download size={18} /> PDF</Button></>} />
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Entregas mensuales</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(monthly).map(([month, count]) => <div key={month} className="rounded-md border border-slate-200 p-3"><p className="text-sm text-slate-500">{month}</p><p className="text-2xl font-bold">{count}</p></div>)}{!Object.keys(monthly).length && <p className="text-sm text-slate-500">No hay entregas registradas.</p>}</div>
      </section>
      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Beneficiarios', data.beneficiaries.length],
          ['Familias', data.families.length],
          ['Entregas', data.deliveries.length],
          ['Inventario', data.inventory_items.length],
          ['Donaciones', data.donations.length],
          ['Voluntarios', data.volunteers.length]
        ].map(([label, value]) => <div key={label} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel"><p className="text-sm text-slate-500">Informe {label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
      </section>
    </>
  );
}
