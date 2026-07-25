import { CalendarDays, Download, FileSpreadsheet, FileText, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { InformeService, initialReportFilters } from '../services/reports/InformeService';
import { normalize } from '../lib/formatters';

const REPORT_COPY = {
  pageDescription: 'Informes oficiales de la plataforma con filtros y exportaci\u00f3n PDF/Excel.',
  mainDescription: 'Resume la actividad registrada por la asociaci\u00f3n sin duplicar datos ni solicitar informaci\u00f3n adicional.',
  yearLabel: 'A\u00f1o',
  annualPdfDescription: 'La exportaci\u00f3n PDF genera un documento redactado con portada, indicadores, actividad social, recursos movilizados y cierre institucional.'
};

export function Reports({ data, actions }) {
  const [activeReportId, setActiveReportId] = useState('annual');
  const [filters, setFilters] = useState(initialReportFilters);
  const reportContentRef = useRef(null);
  const reportService = useMemo(() => actions?.reports || new InformeService(), [actions?.reports]);
  const reports = useMemo(() => reportService.buildReports(data || {}, filters), [data, filters, reportService]);
  const activeReport = reports.find((report) => report.id === activeReportId) || reports[0];
  const filteredRows = useMemo(() => reportService.filterRows(activeReport.rows, filters, activeReport), [activeReport, filters, reportService]);
  const typeOptions = useMemo(() => reportService.uniqueOptionValues(activeReport.rows.map((row) => row.type || row.category || row.group)), [activeReport, reportService]);
  const statusOptions = useMemo(() => reportService.uniqueOptionValues(activeReport.rows.map((row) => row.status)), [activeReport, reportService]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(initialReportFilters);
  }

  function selectReport(reportId) {
    setActiveReportId(reportId);
    setFilters((current) => ({ ...current, type: 'Todos', status: 'Todos' }));
  }

  function openAnnualMemory() {
    setActiveReportId('annual');
    setFilters(initialReportFilters);
    window.setTimeout(() => reportContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function ensureRowsForExport() {
    if (filteredRows.length) return true;
    window.alert('No hay registros para exportar con los filtros actuales. Ajusta los filtros antes de descargar el informe.');
    return false;
  }

  function exportCurrentPdf() {
    if (!ensureRowsForExport()) return;
    reportService.exportPdfReport(activeReport, filteredRows, filters);
  }

  function exportCurrentExcel() {
    if (!ensureRowsForExport()) return;
    reportService.exportExcelReport(activeReport, filteredRows, filters);
  }

  return (
    <>
      <PageHeader
        title="Informes"
        description={REPORT_COPY.pageDescription}
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
              {' '}{REPORT_COPY.mainDescription}
            </p>
          </div>
          <Button onClick={openAnnualMemory}><FileText size={18} /> Abrir memoria</Button>
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

      <section ref={reportContentRef} className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
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
          <FormField label={REPORT_COPY.yearLabel}>
            <select className={inputClass} value={filters.year} onChange={(event) => updateFilter('year', event.target.value)}>
              <option>Todos</option>
              {reportService.availableYears(data).map((year) => <option key={year}>{year}</option>)}
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

      {activeReport.sections?.length > 0 && <ReportBreakdown sections={activeReport.sections} />}

      {activeReport.id === 'annual' && <AnnualPreview report={activeReport} rows={filteredRows} filters={filters} />}

      <section className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink">{activeReport.tableTitle || activeReport.title}</p>
            <p className="text-sm text-slate-500">{filteredRows.length} registros filtrados</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><CalendarDays size={16} /> {reportService.periodLabel(filters)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{activeReport.columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className={rowClassName(row, activeReport)}>
                  {activeReport.columns.map((column) => <td key={column.key} className={`px-4 py-3 align-top ${cellTextClass(row, activeReport)}`}>{renderCell(row, column, activeReport, reportService)}</td>)}
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

function ReportBreakdown({ sections }) {
  return (
    <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Resumen comprensible</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <article key={section.title} className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-ink">{section.title}</p>
            <p className="mt-2 text-xl font-bold text-brand-700">{section.value}</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">{section.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderCell(row, column, report, reportService) {
  const value = row[column.key];
  if (report.id === 'deliveries' && column.key === 'status') {
    const cancelled = normalize(value) === 'anulada';
    return (
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${cancelled ? 'bg-slate-100 text-slate-600 ring-slate-300' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
        {reportService.formatCell(value, column, row)}
      </span>
    );
  }
  return reportService.formatCell(value, column, row);
}

function rowClassName(row, report) {
  if (report.id === 'deliveries' && normalize(row.status) === 'anulada') return 'bg-slate-50';
  return '';
}

function cellTextClass(row, report) {
  if (report.id === 'deliveries' && normalize(row.status) === 'anulada') return 'text-slate-500';
  return 'text-slate-700';
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
        {REPORT_COPY.annualPdfDescription}
      </p>
    </section>
  );
}
