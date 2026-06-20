import { Download, FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { exportTreasuryExcel, exportTreasuryPdf } from '../lib/exporters';
import { formatDate, todayISO } from '../lib/formatters';

const tabs = ['Ingresos', 'Gastos', 'Prestamos', 'Caja y bancos', 'Informes'];
const incomeCategories = ['Donaciones economicas', 'Subvenciones', 'Aportaciones privadas', 'Otros ingresos'];
const expenseCategories = ['Compra de alimentos', 'Transporte', 'Material', 'Alquiler', 'Suministros', 'Otros'];

export function Treasury({ data, actions, currentUser }) {
  const [tab, setTab] = useState('Ingresos');
  const [modal, setModal] = useState(null);
  const canModify = ['Superadministrador', 'Tesorera', 'Tesorero'].includes(currentUser?.role);
  const indicators = useMemo(() => calculateIndicators(data), [data]);

  const close = () => setModal(null);
  const actionButton = canModify ? <Button onClick={() => setModal({ type: tab })}><Plus size={18} /> Nuevo registro</Button> : null;

  return (
    <>
      <PageHeader
        title="Tesoreria"
        description="Control de ingresos, gastos, prestamos adelantados, caja y bancos."
        actions={['Informes'].includes(tab) ? null : actionButton}
      />

      {!canModify && <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Modo solo lectura. Solo Superadministrador y Tesorera pueden modificar registros de tesoreria.</div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Saldo actual" value={money(indicators.currentBalance)} />
        <StatCard label="Total ingresos" value={money(indicators.totalIncome)} />
        <StatCard label="Total gastos" value={money(indicators.totalExpenses)} />
        <StatCard label="Pendiente devolver" value={money(indicators.pendingLoans)} />
        <StatCard label="Balance mensual" value={money(indicators.monthlyBalance)} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <CategoryBreakdown title="Ingresos por categoria" rows={data.treasury_incomes || []} dateField="income_at" valueField="amount" />
        <CategoryBreakdown title="Gastos por categoria" rows={data.treasury_expenses || []} dateField="expense_at" valueField="amount" danger />
        <DocumentsPanel incomes={data.treasury_incomes || []} expenses={data.treasury_expenses || []} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${tab === item ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-brand-50'}`}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'Ingresos' && <IncomeTable rows={data.treasury_incomes || []} canModify={canModify} onEdit={(item) => setModal({ type: 'Ingresos', item })} onDelete={actions.deleteTreasuryIncome} />}
      {tab === 'Gastos' && <ExpenseTable rows={data.treasury_expenses || []} canModify={canModify} onEdit={(item) => setModal({ type: 'Gastos', item })} onDelete={actions.deleteTreasuryExpense} />}
      {tab === 'Prestamos' && <LoanTable rows={data.treasury_loans || []} canModify={canModify} onEdit={(item) => setModal({ type: 'Prestamos', item })} onDelete={actions.deleteTreasuryLoan} />}
      {tab === 'Caja y bancos' && <AccountTable rows={data.treasury_accounts || []} canModify={canModify} onEdit={(item) => setModal({ type: 'Caja y bancos', item })} onDelete={actions.deleteTreasuryAccount} />}
      {tab === 'Informes' && <ReportsPanel data={data} indicators={indicators} />}

      {modal?.type === 'Ingresos' && <Modal title={modal.item ? 'Editar ingreso' : 'Nuevo ingreso'} onClose={close}><IncomeForm initial={modal.item} onSubmit={async (payload) => { modal.item ? await actions.updateTreasuryIncome(modal.item.id, payload) : await actions.createTreasuryIncome(payload); close(); }} /></Modal>}
      {modal?.type === 'Gastos' && <Modal title={modal.item ? 'Editar gasto' : 'Nuevo gasto'} onClose={close}><ExpenseForm initial={modal.item} onSubmit={async (payload) => { modal.item ? await actions.updateTreasuryExpense(modal.item.id, payload) : await actions.createTreasuryExpense(payload); close(); }} /></Modal>}
      {modal?.type === 'Prestamos' && <Modal title={modal.item ? 'Editar prestamo' : 'Nuevo prestamo'} onClose={close}><LoanForm initial={modal.item} onSubmit={async (payload) => { modal.item ? await actions.updateTreasuryLoan(modal.item.id, payload) : await actions.createTreasuryLoan(payload); close(); }} /></Modal>}
      {modal?.type === 'Caja y bancos' && <Modal title={modal.item ? 'Editar cuenta' : 'Nueva cuenta'} onClose={close}><AccountForm initial={modal.item} onSubmit={async (payload) => { modal.item ? await actions.updateTreasuryAccount(modal.item.id, payload) : await actions.createTreasuryAccount(payload); close(); }} /></Modal>}
    </>
  );
}

function IncomeTable({ rows, canModify, onEdit, onDelete }) {
  return <DataTable columns={['Fecha', 'Categoria', 'Concepto', 'Importe', 'Donante', 'Forma de pago', 'Documento', 'Observaciones']} rows={rows.map((item) => ({
    id: item.id,
    cells: [formatDate(item.income_at), item.category || '-', item.concept, money(item.amount), item.donor || '-', item.payment_method || '-', item.document_name || '-', item.notes || '-'],
    item
  }))} canModify={canModify} onEdit={onEdit} onDelete={onDelete} />;
}

function ExpenseTable({ rows, canModify, onEdit, onDelete }) {
  return <DataTable columns={['Fecha', 'Categoria', 'Concepto', 'Importe', 'Proveedor', 'Responsable', 'Factura', 'Ticket', 'Justificante', 'Observaciones']} rows={rows.map((item) => ({
    id: item.id,
    cells: [formatDate(item.expense_at), item.category || '-', item.concept, money(item.amount), item.supplier || '-', item.responsible || '-', item.invoice_name || '-', item.ticket_name || '-', item.receipt_name || '-', item.notes || '-'],
    item
  }))} canModify={canModify} onEdit={onEdit} onDelete={onDelete} />;
}

function LoanTable({ rows, canModify, onEdit, onDelete }) {
  return <DataTable columns={['Persona', 'Fecha', 'Motivo', 'Importe', 'Estado', 'Fecha devolucion', 'Observaciones']} rows={rows.map((item) => ({
    id: item.id,
    cells: [item.person, formatDate(item.loan_at), item.concept, money(item.amount), item.status, formatDate(item.returned_at), item.notes || '-'],
    item
  }))} canModify={canModify} onEdit={onEdit} onDelete={onDelete} />;
}

function AccountTable({ rows, canModify, onEdit, onDelete }) {
  return <DataTable columns={['Nombre', 'Tipo', 'Saldo', 'Banco', 'Cuenta', 'Movimientos', 'Observaciones']} rows={rows.map((item) => ({
    id: item.id,
    cells: [item.name, item.account_type, money(item.balance), item.bank_name || '-', item.account_number || '-', item.movements || '-', item.notes || '-'],
    item
  }))} canModify={canModify} onEdit={onEdit} onDelete={onDelete} />;
}

function DataTable({ columns, rows, canModify, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}{canModify && <th className="px-4 py-3 text-right">Acciones</th>}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => <td key={`${row.id}-${index}`} className="px-4 py-3">{cell}</td>)}
              {canModify && <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => onEdit(row.item)}><Pencil size={16} /></Button><Button variant="danger" onClick={() => onDelete(row.id)}><Trash2 size={16} /></Button></div></td>}
            </tr>
          ))}
          {!rows.length && <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={columns.length + (canModify ? 1 : 0)}>No hay registros.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CategoryBreakdown({ title, rows, valueField, danger = false }) {
  const totals = rows.reduce((acc, item) => {
    const key = item.category || 'Sin categoria';
    acc[key] = (acc[key] || 0) + Number(item[valueField] || 0);
    return acc;
  }, {});
  const max = Math.max(...Object.values(totals), 1);
  return <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
    <h3 className="font-bold text-ink">{title}</h3>
    <div className="mt-4 space-y-3">{Object.entries(totals).map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{money(value)}</strong></div><div className="h-3 rounded bg-slate-100"><div className={`h-3 rounded ${danger ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${Math.max((value / max) * 100, 8)}%` }} /></div></div>)}{!Object.keys(totals).length && <p className="text-sm text-slate-500">Sin datos registrados.</p>}</div>
  </section>;
}

function DocumentsPanel({ incomes, expenses }) {
  const docs = [
    ...incomes.flatMap((item) => [item.document_name, item.receipt_name].filter(Boolean).map((name) => ({ id: `${item.id}-${name}`, type: 'Ingreso', concept: item.concept, name }))),
    ...expenses.flatMap((item) => [item.invoice_name, item.ticket_name, item.receipt_name].filter(Boolean).map((name) => ({ id: `${item.id}-${name}`, type: 'Gasto', concept: item.concept, name })))
  ];
  return <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
    <h3 className="font-bold text-ink">Documentos adjuntos</h3>
    <p className="mt-1 text-sm text-slate-500">Facturas, tickets y justificantes registrados en tesoreria.</p>
    <div className="mt-3 space-y-2">{docs.slice(0, 6).map((doc) => <div key={doc.id} className="rounded-md bg-slate-50 p-2 text-sm"><strong>{doc.type}: {doc.name}</strong><p className="text-slate-500">{doc.concept}</p></div>)}{!docs.length && <p className="text-sm text-slate-500">Aun no hay documentos adjuntos.</p>}</div>
  </section>;
}

function ReportsPanel({ data, indicators }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Informes de tesoreria</h2>
        <p className="mt-1 text-sm text-slate-600">Exporta indicadores, ingresos, gastos, prestamos y cuentas.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => exportTreasuryPdf(data, indicators)}><Download size={18} /> PDF</Button>
          <Button variant="secondary" onClick={() => exportTreasuryExcel(data, indicators)}><FileSpreadsheet size={18} /> Excel</Button>
        </div>
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Balance mensual</h2>
        <p className={`mt-3 text-3xl font-bold ${indicators.monthlyBalance >= 0 ? 'text-brand-700' : 'text-red-600'}`}>{money(indicators.monthlyBalance)}</p>
        <p className="mt-1 text-sm text-slate-600">Ingresos menos gastos del mes actual.</p>
      </section>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Balance anual</h2>
        <p className={`mt-3 text-3xl font-bold ${indicators.annualBalance >= 0 ? 'text-brand-700' : 'text-red-600'}`}>{money(indicators.annualBalance)}</p>
        <p className="mt-1 text-sm text-slate-600">Ingresos menos gastos del ano actual.</p>
      </section>
    </div>
  );
}

function IncomeForm({ initial, onSubmit }) {
  const [form, setForm] = useState(initial || { income_at: todayISO(), category: 'Donaciones economicas', concept: '', amount: 0, donor: '', payment_method: 'Transferencia', notes: '', document_name: '', receipt_name: '' });
  return <TreasuryForm onSubmit={onSubmit} form={form} setForm={setForm} submitLabel="Guardar ingreso">
    <FormField label="Fecha"><input className={inputClass} type="date" required value={form.income_at} onChange={(event) => update(setForm, 'income_at', event.target.value)} /></FormField>
    <FormField label="Categoria"><select className={inputClass} value={form.category || 'Donaciones economicas'} onChange={(event) => update(setForm, 'category', event.target.value)}>{incomeCategories.map((item) => <option key={item}>{item}</option>)}</select></FormField>
    <FormField label="Concepto"><input className={inputClass} required value={form.concept} onChange={(event) => update(setForm, 'concept', event.target.value)} /></FormField>
    <FormField label="Importe"><input className={inputClass} type="number" step="0.01" min="0" required value={form.amount} onChange={(event) => update(setForm, 'amount', Number(event.target.value))} /></FormField>
    <FormField label="Donante"><input className={inputClass} value={form.donor} onChange={(event) => update(setForm, 'donor', event.target.value)} /></FormField>
    <FormField label="Forma de pago"><select className={inputClass} value={form.payment_method} onChange={(event) => update(setForm, 'payment_method', event.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Bizum</option><option>Otro</option></select></FormField>
    <FormField label="Documento adjunto"><input className={inputClass} type="file" onChange={(event) => update(setForm, 'document_name', event.target.files?.[0]?.name || '')} /><SmallFileName value={form.document_name} /></FormField>
    <FormField label="Justificante adjunto"><input className={inputClass} type="file" onChange={(event) => update(setForm, 'receipt_name', event.target.files?.[0]?.name || '')} /><SmallFileName value={form.receipt_name} /></FormField>
    <TextareaField form={form} setForm={setForm} />
  </TreasuryForm>;
}

function ExpenseForm({ initial, onSubmit }) {
  const [form, setForm] = useState(initial || { expense_at: todayISO(), category: 'Compra de alimentos', concept: '', amount: 0, supplier: '', responsible: '', invoice_name: '', ticket_name: '', receipt_name: '', notes: '' });
  return <TreasuryForm onSubmit={onSubmit} form={form} setForm={setForm} submitLabel="Guardar gasto">
    <FormField label="Fecha"><input className={inputClass} type="date" required value={form.expense_at} onChange={(event) => update(setForm, 'expense_at', event.target.value)} /></FormField>
    <FormField label="Categoria"><select className={inputClass} value={form.category || 'Compra de alimentos'} onChange={(event) => update(setForm, 'category', event.target.value)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></FormField>
    <FormField label="Concepto"><input className={inputClass} required value={form.concept} onChange={(event) => update(setForm, 'concept', event.target.value)} /></FormField>
    <FormField label="Importe"><input className={inputClass} type="number" step="0.01" min="0" required value={form.amount} onChange={(event) => update(setForm, 'amount', Number(event.target.value))} /></FormField>
    <FormField label="Proveedor"><input className={inputClass} value={form.supplier} onChange={(event) => update(setForm, 'supplier', event.target.value)} /></FormField>
    <FormField label="Responsable"><input className={inputClass} value={form.responsible} onChange={(event) => update(setForm, 'responsible', event.target.value)} /></FormField>
    <FormField label="Factura adjunta"><input className={inputClass} type="file" onChange={(event) => update(setForm, 'invoice_name', event.target.files?.[0]?.name || '')} /><SmallFileName value={form.invoice_name} /></FormField>
    <FormField label="Ticket adjunto"><input className={inputClass} type="file" onChange={(event) => update(setForm, 'ticket_name', event.target.files?.[0]?.name || '')} /><SmallFileName value={form.ticket_name} /></FormField>
    <FormField label="Justificante adjunto"><input className={inputClass} type="file" onChange={(event) => update(setForm, 'receipt_name', event.target.files?.[0]?.name || '')} /><SmallFileName value={form.receipt_name} /></FormField>
    <TextareaField form={form} setForm={setForm} />
  </TreasuryForm>;
}

function LoanForm({ initial, onSubmit }) {
  const [form, setForm] = useState(initial || { person: '', loan_at: todayISO(), concept: '', amount: 0, status: 'Pendiente de devolver', returned_at: '', notes: '' });
  return <TreasuryForm onSubmit={onSubmit} form={form} setForm={setForm} submitLabel="Guardar prestamo">
    <FormField label="Persona"><input className={inputClass} required value={form.person} onChange={(event) => update(setForm, 'person', event.target.value)} /></FormField>
    <FormField label="Fecha"><input className={inputClass} type="date" required value={form.loan_at} onChange={(event) => update(setForm, 'loan_at', event.target.value)} /></FormField>
    <FormField label="Motivo"><input className={inputClass} required value={form.concept} onChange={(event) => update(setForm, 'concept', event.target.value)} /></FormField>
    <FormField label="Importe"><input className={inputClass} type="number" step="0.01" min="0" required value={form.amount} onChange={(event) => update(setForm, 'amount', Number(event.target.value))} /></FormField>
    <FormField label="Estado"><select className={inputClass} value={form.status} onChange={(event) => update(setForm, 'status', event.target.value)}><option>Pendiente de devolver</option><option>Devuelto</option><option>Parcialmente devuelto</option></select></FormField>
    <FormField label="Fecha devolucion"><input className={inputClass} type="date" value={form.returned_at || ''} onChange={(event) => update(setForm, 'returned_at', event.target.value)} /></FormField>
    <TextareaField form={form} setForm={setForm} />
  </TreasuryForm>;
}

function AccountForm({ initial, onSubmit }) {
  const [form, setForm] = useState(initial || { name: '', account_type: 'Caja efectivo', balance: 0, bank_name: '', account_number: '', movements: '', notes: '' });
  return <TreasuryForm onSubmit={onSubmit} form={form} setForm={setForm} submitLabel="Guardar cuenta">
    <FormField label="Nombre"><input className={inputClass} required value={form.name} onChange={(event) => update(setForm, 'name', event.target.value)} /></FormField>
    <FormField label="Tipo"><select className={inputClass} value={form.account_type} onChange={(event) => update(setForm, 'account_type', event.target.value)}><option>Caja efectivo</option><option>Cuenta bancaria</option></select></FormField>
    <FormField label="Saldo"><input className={inputClass} type="number" step="0.01" required value={form.balance} onChange={(event) => update(setForm, 'balance', Number(event.target.value))} /></FormField>
    <FormField label="Banco"><input className={inputClass} value={form.bank_name} onChange={(event) => update(setForm, 'bank_name', event.target.value)} /></FormField>
    <FormField label="Cuenta"><input className={inputClass} value={form.account_number} onChange={(event) => update(setForm, 'account_number', event.target.value)} /></FormField>
    <div className="sm:col-span-2"><FormField label="Movimientos"><textarea className={inputClass} rows="3" value={form.movements || ''} onChange={(event) => update(setForm, 'movements', event.target.value)} /></FormField></div>
    <TextareaField form={form} setForm={setForm} />
  </TreasuryForm>;
}

function TreasuryForm({ children, form, onSubmit, submitLabel }) {
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
    {children}
    <div className="flex justify-end sm:col-span-2"><Button type="submit">{submitLabel}</Button></div>
  </form>;
}

function TextareaField({ form, setForm }) {
  return <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes || ''} onChange={(event) => update(setForm, 'notes', event.target.value)} /></FormField></div>;
}

function SmallFileName({ value }) {
  return value ? <p className="mt-1 text-xs text-slate-500">{value}</p> : null;
}

function update(setForm, field, value) {
  setForm((state) => ({ ...state, [field]: value }));
}

function calculateIndicators(data) {
  const incomes = data.treasury_incomes || [];
  const expenses = data.treasury_expenses || [];
  const loans = data.treasury_loans || [];
  const accounts = data.treasury_accounts || [];
  const currentMonth = todayISO().slice(0, 7);
  const currentYear = todayISO().slice(0, 4);
  const totalIncome = sum(incomes, 'amount');
  const totalExpenses = sum(expenses, 'amount');
  const accountBalance = sum(accounts, 'balance');
  const pendingLoans = sum(loans.filter((item) => item.status === 'Pendiente' || item.status === 'Pendiente de devolver' || item.status === 'Parcialmente devuelto'), 'amount');
  const monthlyIncome = sum(incomes.filter((item) => String(item.income_at || '').startsWith(currentMonth)), 'amount');
  const monthlyExpenses = sum(expenses.filter((item) => String(item.expense_at || '').startsWith(currentMonth)), 'amount');
  const annualIncome = sum(incomes.filter((item) => String(item.income_at || '').startsWith(currentYear)), 'amount');
  const annualExpenses = sum(expenses.filter((item) => String(item.expense_at || '').startsWith(currentYear)), 'amount');
  return {
    totalIncome,
    totalExpenses,
    pendingLoans,
    monthlyBalance: monthlyIncome - monthlyExpenses,
    annualBalance: annualIncome - annualExpenses,
    currentBalance: accountBalance + totalIncome - totalExpenses
  };
}

function sum(rows, field) {
  return rows.reduce((total, item) => total + Number(item[field] || 0), 0);
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}
