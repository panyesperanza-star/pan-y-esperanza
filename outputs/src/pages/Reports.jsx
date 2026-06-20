import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { exportExcel, exportReportPdf, exportTreasuryPdf } from '../lib/exporters';

export function Reports({ data }) {
  const monthly = data.deliveries.reduce((acc, item) => {
    const key = String(item.delivered_at || '').slice(0, 7) || 'Sin fecha';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const treasuryIndicators = calculateTreasury(data);
  const reports = [
    { name: 'Beneficiarios', rows: data.beneficiaries, description: 'Altas, estado, unidad familiar, documentacion y ultima atencion.' },
    { name: 'Familias', rows: data.families, description: 'Unidades familiares, responsables, miembros, menores y dependientes.' },
    { name: 'Entregas', rows: data.deliveries, description: 'Ayudas entregadas, responsables, productos, cantidades y justificantes.' },
    { name: 'Inventario', rows: data.inventory_items, description: 'Stock, lotes, caducidades, ubicaciones, donante origen y valor estimado.' },
    { name: 'Donaciones', rows: data.donations, description: 'Donaciones recibidas, tipo, valor economico y observaciones.' },
    { name: 'Donantes', rows: data.donors || [], description: 'Empresas, iglesias, supermercados y particulares colaboradores.' },
    { name: 'Tesoreria ingresos', rows: data.treasury_incomes || [], description: 'Donaciones economicas, subvenciones, aportaciones y otros ingresos.' },
    { name: 'Tesoreria gastos', rows: data.treasury_expenses || [], description: 'Alimentos, transporte, material, alquiler, suministros y otros gastos.' },
    { name: 'Tesoreria prestamos', rows: data.treasury_loans || [], description: 'Dinero adelantado por voluntarios y estado de devolucion.' },
    { name: 'Voluntarios', rows: data.volunteers, description: 'Datos, disponibilidad, formacion, documentacion e historial.' }
  ];

  return (
    <>
      <PageHeader
        title="Informes"
        description="Informes completos por modulo con exportacion PDF y Excel."
        actions={<><Button variant="secondary" onClick={() => exportExcel('Pan-y-Esperanza-informes', reports.map(({ name, rows }) => ({ name, rows })))}><FileSpreadsheet size={18} /> Excel completo</Button><Button onClick={() => exportReportPdf(data)}><Download size={18} /> PDF general</Button></>}
      />

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Entregas mensuales</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(monthly).map(([month, count]) => <div key={month} className="rounded-md border border-slate-200 p-3"><p className="text-sm text-slate-500">{month}</p><p className="text-2xl font-bold">{count}</p></div>)}{!Object.keys(monthly).length && <p className="text-sm text-slate-500">No hay entregas registradas.</p>}</div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => <article key={report.name} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
          <p className="text-sm text-slate-500">Informe</p>
          <h3 className="mt-1 text-lg font-bold text-ink">{report.name}</h3>
          <p className="mt-2 text-sm text-slate-600">{report.description}</p>
          <p className="mt-3 text-2xl font-bold">{report.rows.length}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => exportExcel(`Pan-y-Esperanza-${slug(report.name)}`, [{ name: report.name, rows: report.rows }])}><FileSpreadsheet size={16} /> Excel</Button>
          </div>
        </article>)}
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Resumen de tesoreria</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Mini label="Ingresos" value={`${treasuryIndicators.totalIncome.toFixed(2)} EUR`} />
          <Mini label="Gastos" value={`${treasuryIndicators.totalExpenses.toFixed(2)} EUR`} />
          <Mini label="Balance" value={`${treasuryIndicators.balance.toFixed(2)} EUR`} />
          <Mini label="Pendiente devolver" value={`${treasuryIndicators.pendingLoans.toFixed(2)} EUR`} />
        </div>
        <div className="mt-4"><Button onClick={() => exportTreasuryPdf(data, treasuryIndicators)}><Download size={18} /> PDF tesoreria</Button></div>
      </section>
    </>
  );
}

function Mini({ label, value }) {
  return <div className="rounded-md bg-slate-50 p-3"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold text-ink">{value}</p></div>;
}

function calculateTreasury(data) {
  const incomes = data.treasury_incomes || [];
  const expenses = data.treasury_expenses || [];
  const loans = data.treasury_loans || [];
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingLoans = loans.filter((item) => ['Pendiente', 'Pendiente de devolver', 'Parcialmente devuelto'].includes(item.status)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return { totalIncome, totalExpenses, pendingLoans, balance: totalIncome - totalExpenses, currentBalance: totalIncome - totalExpenses, monthlyBalance: totalIncome - totalExpenses };
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
