import {
  BarChart3,
  Boxes,
  CalendarDays,
  Download,
  Euro,
  FileSpreadsheet,
  FileText,
  Gift,
  Home,
  PackageCheck,
  Search,
  Users
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { exportExcel } from '../lib/exporters';
import { formatDate, normalize } from '../lib/formatters';

const REPORTS = [
  { id: 'beneficiaries', title: 'Beneficiarios', icon: Users, description: 'Altas, estado del expediente y seguimiento de personas atendidas.' },
  { id: 'families', title: 'Familias', icon: Home, description: 'Unidades familiares, composición, ayudas y valor social recibido.' },
  { id: 'deliveries', title: 'Entregas', icon: PackageCheck, description: 'Ayudas entregadas, justificantes, productos y responsables.' },
  { id: 'inventory', title: 'Inventario', icon: Boxes, description: 'Stock, lotes, caducidades, categorías y alertas operativas.' },
  { id: 'donors', title: 'Donantes', icon: Gift, description: 'CRM de donantes, dinero recibido, valor social y actividad.' },
  { id: 'economic', title: 'Económico', icon: Euro, description: 'Ingresos, gastos, caja, bancos, préstamos, deudas y valor social.' },
  { id: 'annual', title: 'Memoria anual de actividad', icon: FileText, description: 'Informe institucional principal para administraciones y entidades colaboradoras.', featured: true },
  { id: 'statistics', title: 'Estadísticas', icon: BarChart3, description: 'Indicadores agregados de actividad social, inventario, donantes y economía.' }
];

const initialFilters = {
  query: '',
  dateFrom: '',
  dateTo: '',
  year: String(new Date().getFullYear()),
  status: 'Todos',
  type: 'Todos'
};

export function Reports({ data }) {
  const [activeReportId, setActiveReportId] = useState('annual');
  const [filters, setFilters] = useState(initialFilters);
  const reports = useMemo(() => buildReports(data || {}, filters), [data, filters]);
  const activeReport = reports.find((report) => report.id === activeReportId) || reports[0];
  const filteredRows = useMemo(() => filterRows(activeReport.rows, filters, activeReport), [activeReport, filters]);
  const typeOptions = useMemo(() => uniqueOptionValues(activeReport.rows.map((row) => row.type || row.category || row.group)), [activeReport]);
  const statusOptions = useMemo(() => uniqueOptionValues(activeReport.rows.map((row) => row.status)), [activeReport]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(initialFilters);
  }

  function selectReport(reportId) {
    setActiveReportId(reportId);
    setFilters((current) => ({ ...current, type: 'Todos', status: 'Todos' }));
  }

  function exportCurrentPdf() {
    if (activeReport.id === 'annual') exportAnnualActivityPdf(activeReport, filteredRows, filters);
    else exportGenericReportPdf(activeReport, filteredRows, filters);
  }

  function exportCurrentExcel() {
    exportExcel(reportFilename(activeReport), excelSheetsForReport(activeReport, filteredRows, filters));
  }

  return (
    <>
      <PageHeader
        title="Informes"
        description="Informes oficiales de la plataforma con filtros y exportación PDF/Excel."
        actions={(
          <>
            <Button variant="secondary" onClick={exportCurrentExcel}><FileSpreadsheet size={18} /> Excel</Button>
            <Button onClick={exportCurrentPdf}><Download size={18} /> PDF</Button>
          </>
        )}
      />

      <section className="rounded-md border border-brand-100 bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Informe principal</p>
            <h3 className="mt-1 text-xl font-bold text-ink">Memoria anual de actividad</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Documento institucional para administraciones, subvenciones, Banco de Alimentos y entidades colaboradoras.
              Resume la actividad registrada por la asociación sin duplicar datos ni solicitar información adicional.
            </p>
          </div>
          <Button onClick={() => selectReport('annual')}><FileText size={18} /> Abrir memoria</Button>
        </div>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {reports.map((report) => {
          const Icon = report.icon;
          const active = report.id === activeReport.id;
          return (
            <button
              key={report.id}
              className={`focus-ring rounded-md border p-4 text-left transition ${active ? 'border-brand-600 bg-brand-50 shadow-panel' : 'border-slate-200 bg-white hover:border-brand-100'}`}
              onClick={() => selectReport(report.id)}
            >
              <span className={`inline-flex rounded-md p-2 ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Icon size={19} /></span>
              <p className="mt-3 font-bold text-ink">{report.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">{report.description}</p>
            </button>
          );
        })}
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Filtros</p>
            <h3 className="text-xl font-bold text-ink">{activeReport.title}</h3>
          </div>
          <Button variant="secondary" onClick={resetFilters}>Limpiar filtros</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <FormField label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input className={`${inputClass} pl-9`} value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Nombre, concepto, producto..." />
            </div>
          </FormField>
          <FormField label="Desde"><input className={inputClass} type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></FormField>
          <FormField label="Hasta"><input className={inputClass} type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></FormField>
          <FormField label="Año">
            <select className={inputClass} value={filters.year} onChange={(event) => updateFilter('year', event.target.value)}>
              <option>Todos</option>
              {availableYears(data).map((year) => <option key={year}>{year}</option>)}
            </select>
          </FormField>
          <FormField label="Tipo">
            <select className={inputClass} value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
              <option>Todos</option>
              {typeOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </FormField>
          <FormField label="Estado">
            <select className={inputClass} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option>Todos</option>
              {statusOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </FormField>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {activeReport.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </section>

      {activeReport.id === 'annual' && <AnnualPreview report={activeReport} rows={filteredRows} filters={filters} />}

      <section className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink">{activeReport.tableTitle || activeReport.title}</p>
            <p className="text-sm text-slate-500">{filteredRows.length} registros filtrados</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><CalendarDays size={16} /> {periodLabel(filters)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{activeReport.columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  {activeReport.columns.map((column) => <td key={column.key} className="px-4 py-3 align-top text-slate-700">{formatCell(row[column.key], column, row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filteredRows.length && (
          <div className="p-8 text-center text-sm text-slate-500">
            No hay datos para los filtros seleccionados.
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({ metric }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{metric.label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{metric.value}</p>
      {metric.detail && <p className="mt-1 text-sm text-slate-500">{metric.detail}</p>}
    </article>
  );
}

function AnnualPreview({ report, rows, filters }) {
  return (
    <section className="mt-5 rounded-md border border-brand-100 bg-brand-50 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Vista institucional</p>
      <h3 className="mt-1 text-xl font-bold text-ink">Memoria de actividad {filters.year !== 'Todos' ? filters.year : ''}</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {rows.slice(0, 3).map((row) => (
          <article key={row.id} className="rounded-md bg-white p-4 ring-1 ring-brand-100">
            <p className="text-sm font-bold text-ink">{row.section}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{row.summary}</p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-600">
        La exportación PDF genera un documento redactado con portada, indicadores, actividad social, recursos movilizados y cierre institucional.
      </p>
    </section>
  );
}

function buildReports(data, filters) {
  const period = periodPredicate(filters);
  const beneficiaries = asArray(data.beneficiaries);
  const families = asArray(data.families);
  const deliveries = asArray(data.deliveries);
  const inventory = asArray(data.inventory_items);
  const donations = asArray(data.donations);
  const socialEvents = asArray(data.social_value_events);
  const donorRows = buildDonorRows(data, period);
  const economicRows = buildEconomicRows(data, period);
  const stats = buildStatistics(data, period);

  return [
    buildBeneficiaryReport(beneficiaries, families, deliveries, period),
    buildFamilyReport(families, beneficiaries, deliveries, inventory, period),
    buildDeliveryReport(deliveries, inventory, period),
    buildInventoryReport(inventory),
    buildDonorReport(donorRows),
    buildEconomicReport(economicRows, data),
    buildAnnualReport(data, filters, stats, donorRows, economicRows),
    buildStatisticsReport(stats, beneficiaries, families, deliveries, inventory, donations, socialEvents)
  ];
}

function buildBeneficiaryReport(beneficiaries, families, deliveries, period) {
  const familyById = new Map(families.map((family) => [family.id, family]));
  const deliveriesByBeneficiary = groupBy(deliveries.filter((delivery) => isActiveRecord(delivery) && period(delivery.delivered_at)), 'beneficiary_id');
  const rows = beneficiaries
    .filter((beneficiary) => period(beneficiary.joined_at || beneficiary.created_at || beneficiary.last_help_at))
    .map((beneficiary) => {
      const family = familyById.get(beneficiary.family_id);
      const beneficiaryDeliveries = deliveriesByBeneficiary.get(beneficiary.id) || [];
      return {
        id: beneficiary.id,
        date: beneficiary.joined_at || beneficiary.created_at,
        code: beneficiary.code || '-',
        name: beneficiary.full_name || '-',
        document: beneficiary.document_id || '-',
        family: family ? `${family.family_code || ''} ${family.responsible_name || ''}`.trim() : 'Sin familia',
        type: beneficiary.situation || 'Sin situación',
        status: beneficiary.is_active === false ? 'Inactivo' : 'Activo',
        joined: beneficiary.joined_at,
        lastHelp: beneficiary.last_help_at || latestDate(beneficiaryDeliveries, 'delivered_at'),
        deliveries: beneficiaryDeliveries.length,
        phone: beneficiary.phone || '-',
        search: [beneficiary.code, beneficiary.full_name, beneficiary.document_id, beneficiary.phone, beneficiary.situation, family?.family_code, family?.responsible_name].join(' ')
      };
    });
  return {
    id: 'beneficiaries',
    title: 'Beneficiarios',
    icon: Users,
    description: REPORTS[0].description,
    tableTitle: 'Listado de beneficiarios',
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Nombre' },
      { key: 'document', label: 'Documento' },
      { key: 'family', label: 'Unidad familiar' },
      { key: 'type', label: 'Situación' },
      { key: 'status', label: 'Estado' },
      { key: 'joined', label: 'Alta', type: 'date' },
      { key: 'lastHelp', label: 'Última ayuda', type: 'date' },
      { key: 'deliveries', label: 'Entregas' }
    ],
    metrics: [
      { label: 'Beneficiarios', value: rows.length },
      { label: 'Activos', value: rows.filter((row) => row.status === 'Activo').length },
      { label: 'Con familia', value: rows.filter((row) => row.family !== 'Sin familia').length },
      { label: 'Con entregas', value: rows.filter((row) => row.deliveries > 0).length }
    ],
    rows
  };
}

function buildFamilyReport(families, beneficiaries, deliveries, inventory, period) {
  const beneficiariesByFamily = groupBy(beneficiaries, 'family_id');
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));
  const rows = families
    .filter((family) => period(family.created_at || family.archived_at))
    .map((family) => {
      const members = beneficiariesByFamily.get(family.id) || [];
      const familyDeliveries = deliveries.filter((delivery) => members.some((member) => member.id === delivery.beneficiary_id) && isActiveRecord(delivery) && period(delivery.delivered_at));
      const socialValue = familyDeliveries.reduce((total, delivery) => total + deliveryValue(delivery, inventoryById.get(delivery.inventory_item_id)), 0);
      return {
        id: family.id,
        date: family.created_at,
        code: family.family_code || '-',
        responsible: family.responsible_name || '-',
        type: family.status || 'Activa',
        status: normalize(family.status) === 'archivada' || family.archived_at ? 'Archivada' : 'Activa',
        members: members.length,
        minors: members.reduce((sum, member) => sum + Number(member.minors_count || 0), 0),
        deliveries: familyDeliveries.length,
        socialValue,
        lastHelp: latestDate(familyDeliveries, 'delivered_at'),
        phone: family.phone || '-',
        address: family.address || '-',
        search: [family.family_code, family.responsible_name, family.phone, family.address, family.status, members.map((member) => member.full_name).join(' ')].join(' ')
      };
    });
  return {
    id: 'families',
    title: 'Familias',
    icon: Home,
    description: REPORTS[1].description,
    tableTitle: 'Expedientes familiares',
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'responsible', label: 'Responsable' },
      { key: 'status', label: 'Estado' },
      { key: 'members', label: 'Miembros' },
      { key: 'minors', label: 'Menores' },
      { key: 'deliveries', label: 'Entregas' },
      { key: 'socialValue', label: 'Valor social', type: 'currency' },
      { key: 'lastHelp', label: 'Última ayuda', type: 'date' }
    ],
    metrics: [
      { label: 'Familias', value: rows.length },
      { label: 'Activas', value: rows.filter((row) => row.status === 'Activa').length },
      { label: 'Miembros', value: rows.reduce((sum, row) => sum + Number(row.members || 0), 0) },
      { label: 'Valor social', value: formatCurrency(rows.reduce((sum, row) => sum + Number(row.socialValue || 0), 0)) }
    ],
    rows
  };
}

function buildDeliveryReport(deliveries, inventory, period) {
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));
  const rows = deliveries
    .filter((delivery) => period(delivery.delivered_at || delivery.created_at))
    .map((delivery) => ({
      id: delivery.id,
      date: delivery.delivered_at || delivery.created_at,
      receipt: delivery.receipt_number || '-',
      beneficiary: delivery.beneficiary_name || '-',
      family: delivery.family_name || '-',
      type: delivery.help_type || 'Ayuda',
      product: delivery.inventory_item_name || inventoryById.get(delivery.inventory_item_id)?.name || '-',
      quantity: delivery.quantity || 0,
      responsible: delivery.responsible || '-',
      value: deliveryValue(delivery, inventoryById.get(delivery.inventory_item_id)),
      status: delivery.status || 'Activa',
      search: [delivery.receipt_number, delivery.beneficiary_name, delivery.family_name, delivery.help_type, delivery.inventory_item_name, delivery.responsible, delivery.status].join(' ')
    }));
  const activeRows = rows.filter((row) => normalize(row.status) !== 'anulada');
  return {
    id: 'deliveries',
    title: 'Entregas',
    icon: PackageCheck,
    description: REPORTS[2].description,
    tableTitle: 'Historial de entregas',
    columns: [
      { key: 'date', label: 'Fecha', type: 'date' },
      { key: 'receipt', label: 'Justificante' },
      { key: 'beneficiary', label: 'Beneficiario' },
      { key: 'family', label: 'Familia' },
      { key: 'type', label: 'Tipo' },
      { key: 'product', label: 'Producto' },
      { key: 'quantity', label: 'Cantidad' },
      { key: 'responsible', label: 'Responsable' },
      { key: 'status', label: 'Estado' }
    ],
    metrics: [
      { label: 'Entregas', value: rows.length },
      { label: 'Activas', value: activeRows.length },
      { label: 'Anuladas', value: rows.length - activeRows.length },
      { label: 'Valor estimado', value: formatCurrency(activeRows.reduce((sum, row) => sum + Number(row.value || 0), 0)) }
    ],
    rows
  };
}

function buildInventoryReport(inventory) {
  const rows = inventory.map((item) => {
    const status = inventoryStatus(item);
    return {
      id: item.id,
      date: item.expires_at || item.created_at,
      name: item.name || '-',
      type: item.category || 'Sin categoría',
      lot: item.lot || '-',
      stock: Number(item.stock || 0),
      unit: item.unit || '-',
      threshold: Number(item.low_stock_threshold || 0),
      expires: item.expires_at,
      donor: item.donor || '-',
      location: item.location || '-',
      status,
      search: [item.name, item.category, item.lot, item.donor, item.location, status].join(' ')
    };
  });
  return {
    id: 'inventory',
    title: 'Inventario',
    icon: Boxes,
    description: REPORTS[3].description,
    tableTitle: 'Estado del inventario',
    columns: [
      { key: 'name', label: 'Producto' },
      { key: 'type', label: 'Categoría' },
      { key: 'lot', label: 'Lote' },
      { key: 'stock', label: 'Stock' },
      { key: 'unit', label: 'Unidad' },
      { key: 'threshold', label: 'Mínimo' },
      { key: 'expires', label: 'Caducidad', type: 'date' },
      { key: 'status', label: 'Estado' }
    ],
    metrics: [
      { label: 'Productos', value: rows.length },
      { label: 'Stock total', value: rows.reduce((sum, row) => sum + Number(row.stock || 0), 0) },
      { label: 'Bajo mínimo', value: rows.filter((row) => row.status === 'Bajo stock').length },
      { label: 'Caducados', value: rows.filter((row) => row.status === 'Caducado').length }
    ],
    rows
  };
}

function buildDonorReport(rows) {
  return {
    id: 'donors',
    title: 'Donantes',
    icon: Gift,
    description: REPORTS[4].description,
    tableTitle: 'CRM de donantes',
    columns: [
      { key: 'name', label: 'Donante' },
      { key: 'type', label: 'Tipo' },
      { key: 'contact', label: 'Contacto' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'donations', label: 'Donaciones' },
      { key: 'money', label: 'Dinero', type: 'currency' },
      { key: 'social', label: 'Valor social', type: 'currency' },
      { key: 'lastDonation', label: 'Última donación', type: 'date' },
      { key: 'status', label: 'Estado' }
    ],
    metrics: [
      { label: 'Donantes', value: rows.length },
      { label: 'Activos', value: rows.filter((row) => row.status === 'Activo').length },
      { label: 'Dinero recibido', value: formatCurrency(rows.reduce((sum, row) => sum + Number(row.money || 0), 0)) },
      { label: 'Valor social', value: formatCurrency(rows.reduce((sum, row) => sum + Number(row.social || 0), 0)) }
    ],
    rows
  };
}

function buildEconomicReport(rows, data) {
  const accounts = asArray(data.financial_accounts).filter(isActiveRecord);
  const balance = accounts.length
    ? accounts.reduce((sum, account) => sum + Number(account.current_balance ?? account.opening_balance ?? 0), 0)
    : asArray(data.treasury_accounts).reduce((sum, account) => sum + Number(account.balance || 0), 0);
  return {
    id: 'economic',
    title: 'Económico',
    icon: Euro,
    description: REPORTS[5].description,
    tableTitle: 'Línea económica consolidada',
    columns: [
      { key: 'date', label: 'Fecha', type: 'date' },
      { key: 'type', label: 'Tipo' },
      { key: 'concept', label: 'Concepto' },
      { key: 'contact', label: 'Persona / entidad' },
      { key: 'amount', label: 'Importe', type: 'currency' },
      { key: 'status', label: 'Estado' },
      { key: 'source', label: 'Origen' }
    ],
    metrics: [
      { label: 'Movimientos', value: rows.length },
      { label: 'Ingresos', value: formatCurrency(rows.filter((row) => row.direction === 'in').reduce((sum, row) => sum + Number(row.amount || 0), 0)) },
      { label: 'Gastos', value: formatCurrency(rows.filter((row) => row.direction === 'out').reduce((sum, row) => sum + Number(row.amount || 0), 0)) },
      { label: 'Saldo real', value: formatCurrency(balance) }
    ],
    rows
  };
}

function buildAnnualReport(data, filters, stats, donorRows, economicRows) {
  const yearText = filters.year !== 'Todos' ? filters.year : 'periodo seleccionado';
  const rows = [
    {
      id: 'annual-social',
      section: 'Atención social',
      type: 'Actividad social',
      status: 'Incluido',
      summary: `Durante ${yearText}, la asociación ha mantenido ${stats.activeBeneficiaries} expedientes activos y ha registrado ${stats.deliveries} entregas de ayuda.`,
      result: `${stats.activeBeneficiaries} beneficiarios activos · ${stats.deliveries} entregas`
    },
    {
      id: 'annual-families',
      section: 'Unidades familiares',
      type: 'Familias',
      status: 'Incluido',
      summary: `La intervención alcanza a ${stats.families} unidades familiares, con ${stats.minors} menores identificados en los expedientes.`,
      result: `${stats.families} familias · ${stats.minors} menores`
    },
    {
      id: 'annual-resources',
      section: 'Recursos movilizados',
      type: 'Recursos',
      status: 'Incluido',
      summary: `Se han movilizado recursos alimentarios, ayudas materiales y apoyos económicos registrados en la plataforma.`,
      result: `${formatCurrency(stats.socialDelivered)} en valor social entregado`
    },
    {
      id: 'annual-donors',
      section: 'Donantes y colaboración',
      type: 'Donantes',
      status: 'Incluido',
      summary: `El CRM de donantes recoge ${donorRows.length} donantes, con ${formatCurrency(stats.moneyReceived)} en aportaciones monetarias y ${formatCurrency(stats.socialReceived)} en valor social recibido.`,
      result: `${donorRows.length} donantes`
    },
    {
      id: 'annual-economic',
      section: 'Resumen económico',
      type: 'Económico',
      status: 'Incluido',
      summary: `La línea económica consolidada incluye ${economicRows.length} movimientos, integrando caja, banco, donaciones, préstamos, deudas y valor social.`,
      result: `${economicRows.length} movimientos`
    }
  ];
  return {
    id: 'annual',
    title: 'Memoria anual de actividad',
    icon: FileText,
    description: REPORTS[6].description,
    tableTitle: 'Apartados de la memoria',
    columns: [
      { key: 'section', label: 'Apartado' },
      { key: 'type', label: 'Tipo' },
      { key: 'summary', label: 'Resumen' },
      { key: 'result', label: 'Resultado' },
      { key: 'status', label: 'Estado' }
    ],
    metrics: [
      { label: 'Beneficiarios activos', value: stats.activeBeneficiaries },
      { label: 'Familias', value: stats.families },
      { label: 'Entregas', value: stats.deliveries },
      { label: 'Valor social entregado', value: formatCurrency(stats.socialDelivered) }
    ],
    rows,
    annualStats: stats,
    rawData: data
  };
}

function buildStatisticsReport(stats) {
  const rows = [
    { id: 'stat-beneficiaries', group: 'Social', type: 'Beneficiarios', metric: 'Beneficiarios activos', value: stats.activeBeneficiaries, status: 'Calculado' },
    { id: 'stat-families', group: 'Social', type: 'Familias', metric: 'Familias registradas', value: stats.families, status: 'Calculado' },
    { id: 'stat-minors', group: 'Social', type: 'Menores', metric: 'Menores registrados', value: stats.minors, status: 'Calculado' },
    { id: 'stat-deliveries', group: 'Entregas', type: 'Ayudas', metric: 'Entregas activas', value: stats.deliveries, status: 'Calculado' },
    { id: 'stat-inventory', group: 'Inventario', type: 'Stock', metric: 'Productos en inventario', value: stats.inventoryItems, status: 'Calculado' },
    { id: 'stat-donors', group: 'Donantes', type: 'CRM', metric: 'Donantes registrados', value: stats.donors, status: 'Calculado' },
    { id: 'stat-money', group: 'Economía', type: 'Ingresos', metric: 'Dinero recibido', value: stats.moneyReceived, status: 'Calculado', valueType: 'currency' },
    { id: 'stat-social-received', group: 'Valor social', type: 'Recibido', metric: 'Valor social recibido', value: stats.socialReceived, status: 'Calculado', valueType: 'currency' },
    { id: 'stat-social-delivered', group: 'Valor social', type: 'Entregado', metric: 'Valor social entregado', value: stats.socialDelivered, status: 'Calculado', valueType: 'currency' }
  ];
  return {
    id: 'statistics',
    title: 'Estadísticas',
    icon: BarChart3,
    description: REPORTS[7].description,
    tableTitle: 'Indicadores estadísticos',
    columns: [
      { key: 'group', label: 'Grupo' },
      { key: 'type', label: 'Tipo' },
      { key: 'metric', label: 'Indicador' },
      { key: 'value', label: 'Valor', dynamicType: true },
      { key: 'status', label: 'Estado' }
    ],
    metrics: [
      { label: 'Indicadores', value: rows.length },
      { label: 'Social', value: rows.filter((row) => row.group === 'Social').length },
      { label: 'Valor recibido', value: formatCurrency(stats.socialReceived) },
      { label: 'Valor entregado', value: formatCurrency(stats.socialDelivered) }
    ],
    rows
  };
}

function buildDonorRows(data, period) {
  const contacts = asArray(data.accounting_contacts).filter((contact) => normalize(contact.contact_type) === 'donor');
  const profiles = new Map();
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const contactsByName = new Map(contacts.map((contact) => [normalize(contact.name), contact]));

  function profileFor(name, contact = null, kind = '') {
    const matched = contact || contactsByName.get(normalize(name));
    const safeName = matched?.name || name || 'Donante sin identificar';
    const key = matched?.id || normalize(safeName);
    if (!profiles.has(key)) {
      const meta = donorMetadata(matched);
      profiles.set(key, {
        id: key,
        date: '',
        name: safeName,
        type: kind || meta.kind || inferDonorKind(safeName),
        contact: meta.contactPerson || '',
        phone: matched?.phone || '',
        email: matched?.email || '',
        status: matched?.is_active === false || meta.archived ? 'Archivado' : 'Activo',
        donations: 0,
        money: 0,
        social: 0,
        firstDonation: '',
        lastDonation: '',
        search: [safeName, matched?.phone, matched?.email, matched?.address, meta.visibleNotes].join(' ')
      });
    }
    return profiles.get(key);
  }

  contacts.forEach((contact) => profileFor(contact.name, contact));
  asArray(data.accounting_events)
    .filter((event) => event.event_type === 'donation_money' && isActiveRecord(event) && period(event.occurred_at || event.created_at))
    .forEach((event) => addDonationToProfile(profileFor(contactsById.get(event.contact_id)?.name || event.title, contactsById.get(event.contact_id)), event.occurred_at || event.created_at, Number(event.amount || 0), 0));
  asArray(data.treasury_incomes)
    .filter((income) => normalize([income.category, income.concept].join(' ')).includes('donacion') && period(income.income_at || income.created_at))
    .forEach((income) => addDonationToProfile(profileFor(income.donor || income.concept), income.income_at || income.created_at, Number(income.amount || 0), 0));
  asArray(data.donations)
    .filter((donation) => isActiveRecord(donation) && period(donation.donated_at || donation.created_at))
    .forEach((donation) => addDonationToProfile(profileFor(donation.donor, null, donation.donor_kind), donation.donated_at || donation.created_at, 0, Number(donation.estimated_value || 0)));
  asArray(data.social_value_events)
    .filter((event) => event.value_type === 'received' && isActiveRecord(event) && period(event.social_value_at || event.created_at))
    .forEach((event) => addDonationToProfile(profileFor(contactsById.get(event.contact_id)?.name || 'Donante sin identificar', contactsById.get(event.contact_id)), event.social_value_at || event.created_at, 0, Number(event.amount || 0)));

  return [...profiles.values()].map((profile) => ({
    ...profile,
    date: profile.lastDonation,
    search: [profile.search, profile.type, profile.contact, profile.status].join(' ')
  })).sort((a, b) => String(b.lastDonation || '').localeCompare(String(a.lastDonation || '')) || a.name.localeCompare(b.name));
}

function buildEconomicRows(data, period) {
  const contactsById = new Map(asArray(data.accounting_contacts).map((contact) => [contact.id, contact]));
  const accountsById = new Map(asArray(data.financial_accounts).map((account) => [account.id, account]));
  const rows = [];
  asArray(data.accounting_events)
    .filter((event) => isActiveRecord(event) && period(event.occurred_at || event.created_at))
    .forEach((event) => rows.push({
      id: `event-${event.id}`,
      date: event.occurred_at || event.created_at,
      type: eventTypeLabel(event.event_type),
      concept: event.title || event.description || '-',
      contact: contactsById.get(event.contact_id)?.name || '-',
      amount: Number(event.amount || 0),
      direction: eventDirection(event.event_type),
      status: event.status || 'Registrado',
      source: 'Contabilidad',
      search: [event.title, event.description, event.event_type, contactsById.get(event.contact_id)?.name].join(' ')
    }));
  asArray(data.cash_bank_movements)
    .filter((movement) => isActiveRecord(movement) && period(movement.movement_at || movement.created_at))
    .forEach((movement) => rows.push({
      id: `movement-${movement.id}`,
      date: movement.movement_at || movement.created_at,
      type: movementTypeLabel(movement.movement_type),
      concept: movement.reference || movement.notes || '-',
      contact: accountsById.get(movement.financial_account_id)?.name || '-',
      amount: Number(movement.amount || 0),
      direction: movementDirection(movement.movement_type),
      status: movement.status || 'Registrado',
      source: 'Caja/Bancos',
      search: [movement.reference, movement.notes, movement.movement_type, accountsById.get(movement.financial_account_id)?.name].join(' ')
    }));
  asArray(data.treasury_incomes)
    .filter((income) => period(income.income_at || income.created_at))
    .forEach((income) => rows.push({ id: `income-${income.id}`, date: income.income_at, type: 'Ingreso', concept: income.concept || income.category || '-', contact: income.donor || '-', amount: Number(income.amount || 0), direction: 'in', status: income.status || 'Registrado', source: 'Tesorería histórica', search: [income.concept, income.category, income.donor].join(' ') }));
  asArray(data.treasury_expenses)
    .filter((expense) => period(expense.expense_at || expense.created_at))
    .forEach((expense) => rows.push({ id: `expense-${expense.id}`, date: expense.expense_at, type: 'Gasto', concept: expense.concept || expense.category || '-', contact: expense.supplier || expense.responsible || '-', amount: Number(expense.amount || 0), direction: 'out', status: expense.status || 'Registrado', source: 'Tesorería histórica', search: [expense.concept, expense.category, expense.supplier, expense.responsible].join(' ') }));
  asArray(data.loan_records)
    .filter((loan) => isActiveRecord(loan) && period(loan.loan_at || loan.created_at))
    .forEach((loan) => rows.push({ id: `loan-${loan.id}`, date: loan.loan_at, type: 'Préstamo recibido', concept: loan.reason || loan.notes || '-', contact: contactsById.get(loan.contact_id)?.name || '-', amount: Number(loan.principal_amount || 0), direction: 'in', status: loan.status || 'Activo', source: 'Préstamos', search: [loan.reason, loan.notes, contactsById.get(loan.contact_id)?.name].join(' ') }));
  asArray(data.debt_records)
    .filter((debt) => isActiveRecord(debt) && period(debt.debt_at || debt.created_at))
    .forEach((debt) => rows.push({ id: `debt-${debt.id}`, date: debt.debt_at, type: 'Deuda con proveedor', concept: debt.reason || debt.notes || '-', contact: contactsById.get(debt.contact_id)?.name || '-', amount: Number(debt.original_amount || 0), direction: 'neutral', status: debt.status || 'Activa', source: 'Deudas', search: [debt.reason, debt.notes, contactsById.get(debt.contact_id)?.name].join(' ') }));
  asArray(data.social_value_events)
    .filter((event) => isActiveRecord(event) && period(event.social_value_at || event.created_at))
    .forEach((event) => rows.push({ id: `social-${event.id}`, date: event.social_value_at || event.created_at, type: event.value_type === 'received' ? 'Valor social recibido' : 'Valor social entregado', concept: event.notes || event.event_type || '-', contact: contactsById.get(event.contact_id)?.name || '-', amount: Number(event.amount || 0), direction: 'social', status: event.status || 'Registrado', source: 'Valor social', search: [event.notes, event.event_type, contactsById.get(event.contact_id)?.name].join(' ') }));
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function buildStatistics(data, period) {
  const beneficiaries = asArray(data.beneficiaries).filter((item) => period(item.joined_at || item.created_at || item.last_help_at));
  const families = asArray(data.families).filter((item) => period(item.created_at || item.archived_at));
  const deliveries = asArray(data.deliveries).filter((item) => isActiveRecord(item) && period(item.delivered_at || item.created_at));
  const inventory = asArray(data.inventory_items);
  const donors = buildDonorRows(data, period);
  const moneyReceived = buildEconomicRows(data, period).filter((row) => row.direction === 'in').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const socialReceived = asArray(data.social_value_events).filter((event) => event.value_type === 'received' && isActiveRecord(event) && period(event.social_value_at || event.created_at)).reduce((sum, event) => sum + Number(event.amount || 0), 0)
    + asArray(data.donations).filter((donation) => isActiveRecord(donation) && period(donation.donated_at || donation.created_at)).reduce((sum, donation) => sum + Number(donation.estimated_value || 0), 0);
  const socialDelivered = asArray(data.social_value_events).filter((event) => event.value_type === 'delivered' && isActiveRecord(event) && period(event.social_value_at || event.created_at)).reduce((sum, event) => sum + Number(event.amount || 0), 0);
  return {
    activeBeneficiaries: beneficiaries.filter((item) => item.is_active !== false).length,
    beneficiaries: beneficiaries.length,
    families: families.length,
    minors: beneficiaries.reduce((sum, item) => sum + Number(item.minors_count || 0), 0),
    deliveries: deliveries.length,
    inventoryItems: inventory.length,
    donors: donors.length,
    moneyReceived,
    socialReceived,
    socialDelivered
  };
}

function filterRows(rows, filters, report) {
  const skipDate = report.id === 'annual' || report.id === 'statistics' || report.id === 'inventory';
  return rows.filter((row) => {
    if (filters.query && !normalize(Object.values(row).join(' ')).includes(normalize(filters.query))) return false;
    if (filters.status !== 'Todos' && normalize(row.status) !== normalize(filters.status)) return false;
    if (filters.type !== 'Todos' && ![row.type, row.category, row.group].some((value) => normalize(value) === normalize(filters.type))) return false;
    if (!skipDate && !dateMatchesFilters(row.date, filters)) return false;
    return true;
  });
}

function exportGenericReportPdf(report, rows, filters) {
  const doc = new jsPDF({ orientation: report.columns.length > 7 ? 'landscape' : 'portrait' });
  drawReportHeader(doc, report.title, report.description, filters);
  const metricsBody = report.metrics.map((metric) => [metric.label, String(metric.value), metric.detail || '']);
  autoTable(doc, { startY: 36, head: [['Indicador', 'Valor', 'Detalle']], body: metricsBody, styles: { fontSize: 9 }, headStyles: { fillColor: [36, 126, 80] } });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [report.columns.map((column) => column.label)],
    body: rows.map((row) => report.columns.map((column) => exportCell(row[column.key], column, row))),
    styles: { fontSize: 8, overflow: 'linebreak' },
    headStyles: { fillColor: [36, 126, 80] }
  });
  doc.save(`${reportFilename(report)}.pdf`);
}

function exportAnnualActivityPdf(report, rows, filters) {
  const stats = report.annualStats || {};
  const doc = new jsPDF();
  const yearText = filters.year !== 'Todos' ? filters.year : new Date().getFullYear();
  doc.setFillColor(36, 126, 80);
  doc.rect(0, 0, 210, 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('MEMORIA ANUAL DE ACTIVIDAD', 105, 28, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`Asociación Pan y Esperanza · ${yearText}`, 105, 40, { align: 'center' });
  doc.setTextColor(23, 33, 27);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento institucional elaborado a partir de los datos registrados en la plataforma.', 14, 72);
  autoTable(doc, {
    startY: 86,
    head: [['Indicador', 'Resultado']],
    body: [
      ['Beneficiarios activos', stats.activeBeneficiaries || 0],
      ['Familias registradas', stats.families || 0],
      ['Menores registrados', stats.minors || 0],
      ['Entregas realizadas', stats.deliveries || 0],
      ['Donantes registrados', stats.donors || 0],
      ['Dinero recibido', formatCurrency(stats.moneyReceived || 0)],
      ['Valor social recibido', formatCurrency(stats.socialReceived || 0)],
      ['Valor social entregado', formatCurrency(stats.socialDelivered || 0)]
    ],
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 10 }
  });
  let y = doc.lastAutoTable.finalY + 14;
  rows.forEach((row) => {
    if (y > 252) {
      doc.addPage();
      y = 24;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(row.section, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(row.summary, 178);
    doc.text(lines, 14, y + 8);
    y += 18 + lines.length * 5;
  });
  doc.setFontSize(9);
  doc.setTextColor(96, 112, 100);
  doc.text('Memoria generada desde la plataforma Pan y Esperanza. La información procede de los registros internos de la entidad.', 14, 286);
  doc.save(`${reportFilename(report)}-${yearText}.pdf`);
}

function excelSheetsForReport(report, rows, filters) {
  const summary = [
    { Campo: 'Informe', Valor: report.title },
    { Campo: 'Periodo', Valor: periodLabel(filters) },
    ...report.metrics.map((metric) => ({ Campo: metric.label, Valor: metric.value, Detalle: metric.detail || '' }))
  ];
  const dataRows = rows.map((row) => Object.fromEntries(report.columns.map((column) => [column.label, exportCell(row[column.key], column, row)])));
  return [
    { name: 'Resumen', rows: summary },
    { name: safeSheetName(report.title), rows: dataRows }
  ];
}

function drawReportHeader(doc, title, description, filters) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(description || '', 14, 25);
  doc.text(`Periodo: ${periodLabel(filters)}`, 14, 31);
}

function formatCell(value, column, row = {}) {
  if (column.dynamicType && row.valueType === 'currency') return formatCurrency(value);
  if (column.dynamicType && typeof value === 'number') return formatNumber(value);
  if (column.type === 'date') return formatDate(value);
  if (column.type === 'currency') return formatCurrency(value);
  return value === undefined || value === null || value === '' ? '-' : value;
}

function exportCell(value, column, row) {
  if (column.dynamicType && row.valueType === 'currency') return formatCurrency(value);
  return formatCell(value, column);
}

function periodPredicate(filters) {
  return (value) => dateMatchesFilters(value, filters);
}

function dateMatchesFilters(value, filters) {
  if (!value) return filters.year === 'Todos' && !filters.dateFrom && !filters.dateTo;
  const date = String(value).slice(0, 10);
  if (filters.year !== 'Todos' && !date.startsWith(`${filters.year}-`)) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

function periodLabel(filters) {
  const parts = [];
  if (filters.year !== 'Todos') parts.push(`Año ${filters.year}`);
  if (filters.dateFrom) parts.push(`desde ${formatDate(filters.dateFrom)}`);
  if (filters.dateTo) parts.push(`hasta ${formatDate(filters.dateTo)}`);
  return parts.length ? parts.join(' · ') : 'Todos los registros';
}

function availableYears(data = {}) {
  const years = new Set([String(new Date().getFullYear())]);
  const dateFields = [
    ...asArray(data.beneficiaries).map((item) => item.joined_at || item.created_at || item.last_help_at),
    ...asArray(data.families).map((item) => item.created_at || item.archived_at),
    ...asArray(data.deliveries).map((item) => item.delivered_at || item.created_at),
    ...asArray(data.donations).map((item) => item.donated_at || item.created_at),
    ...asArray(data.accounting_events).map((item) => item.occurred_at || item.created_at),
    ...asArray(data.cash_bank_movements).map((item) => item.movement_at || item.created_at),
    ...asArray(data.treasury_incomes).map((item) => item.income_at || item.created_at),
    ...asArray(data.treasury_expenses).map((item) => item.expense_at || item.created_at)
  ];
  dateFields.forEach((value) => {
    const year = String(value || '').slice(0, 4);
    if (/^\d{4}$/.test(year)) years.add(year);
  });
  return [...years].sort((a, b) => b.localeCompare(a));
}

function uniqueOptionValues(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'es'));
}

function reportFilename(report) {
  return `Informe-${safeFilename(report.title)}`;
}

function safeFilename(value) {
  return String(value || 'informe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

function safeSheetName(value) {
  return String(value || 'Informe').slice(0, 31).replace(/[\\/?*[\]:]/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function groupBy(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row[field] || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function latestDate(rows, field) {
  return rows.map((row) => row[field]).filter(Boolean).sort().at(-1) || '';
}

function isActiveRecord(row) {
  const status = normalize(row?.status || row?.state || '');
  return !['anulada', 'anulado', 'voided', 'cancelled', 'corregido', 'corrected', 'inactive'].includes(status);
}

function inventoryStatus(item) {
  const today = new Date().toISOString().slice(0, 10);
  if (item.expires_at && String(item.expires_at).slice(0, 10) < today) return 'Caducado';
  if (Number(item.stock || 0) <= 0) return 'Sin stock';
  if (Number(item.stock || 0) <= Number(item.low_stock_threshold || 0)) return 'Bajo stock';
  return 'Correcto';
}

function deliveryValue(delivery, item) {
  const explicit = firstNumber(delivery.estimated_total_value, delivery.total_value, delivery.estimated_value, delivery.value_amount);
  if (explicit !== null) return explicit;
  const quantity = firstNumber(delivery.quantity);
  const unitValue = firstNumber(delivery.unit_value, delivery.estimated_unit_value, item?.unit_value, item?.estimated_unit_value, item?.economic_value, item?.price, item?.cost);
  return quantity !== null && unitValue !== null ? roundCurrency(quantity * unitValue) : 0;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(Number(value || 0));
}

function addDonationToProfile(profile, date, money, social) {
  profile.donations += 1;
  profile.money += Number(money || 0);
  profile.social += Number(social || 0);
  const cleanDate = String(date || '').slice(0, 10);
  if (cleanDate) {
    if (!profile.firstDonation || cleanDate < profile.firstDonation) profile.firstDonation = cleanDate;
    if (!profile.lastDonation || cleanDate > profile.lastDonation) profile.lastDonation = cleanDate;
  }
}

function donorMetadata(contact) {
  const lines = String(contact?.notes || '').split(/\r?\n/);
  const kind = lines.find((line) => line.startsWith('[DONANTE_TIPO]'))?.replace('[DONANTE_TIPO]', '').trim() || '';
  const contactPerson = lines.find((line) => line.startsWith('[DONANTE_CONTACTO]'))?.replace('[DONANTE_CONTACTO]', '').trim() || '';
  const archived = lines.some((line) => line.startsWith('[DONANTE_ARCHIVADO]'));
  const visibleNotes = lines.filter((line) => !line.startsWith('[DONANTE_')).join(' ');
  return { kind, contactPerson, archived, visibleNotes };
}

function inferDonorKind(name = '') {
  const value = normalize(name);
  if (value.includes('iglesia') || value.includes('parroquia')) return 'Iglesia';
  if (value.includes('fundacion')) return 'Fundación';
  if (value.includes('asociacion')) return 'Asociación';
  if (value.includes('ayuntamiento') || value.includes('administracion')) return 'Administración';
  if (/\b(sl|s l|sa|s a)\b/.test(value) || value.includes('empresa')) return 'Empresa';
  return 'Particular';
}

function eventTypeLabel(type) {
  const labels = {
    income: 'Ingreso',
    donation_money: 'Donación monetaria',
    donation_in_kind: 'Donación en especie',
    expense: 'Gasto',
    purchase: 'Compra de inventario',
    loan: 'Préstamo',
    debt: 'Deuda',
    correction: 'Corrección',
    void: 'Anulación'
  };
  return labels[type] || type || 'Movimiento';
}

function eventDirection(type) {
  if (['income', 'donation_money', 'loan'].includes(type)) return 'in';
  if (['expense', 'purchase'].includes(type)) return 'out';
  if (['donation_in_kind'].includes(type)) return 'social';
  return 'neutral';
}

function movementTypeLabel(type) {
  const labels = {
    cash_in: 'Entrada caja',
    cash_out: 'Salida caja',
    bank_in: 'Entrada banco',
    bank_out: 'Salida banco',
    transfer_out: 'Transferencia salida',
    transfer_in: 'Transferencia entrada',
    correction: 'Corrección',
    void: 'Anulación'
  };
  return labels[type] || type || 'Movimiento';
}

function movementDirection(type) {
  if (String(type || '').includes('_in')) return 'in';
  if (String(type || '').includes('_out')) return 'out';
  return 'neutral';
}
