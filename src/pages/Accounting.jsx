import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gift,
  HandCoins,
  Landmark,
  PackageCheck,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  Upload,
  Wallet
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';

const QUICK_ACTIONS = [
  { label: 'Registrar gasto', icon: ArrowDownCircle, tone: 'border-red-200 bg-red-50 text-red-700' },
  { label: 'Registrar ingreso', icon: ArrowUpCircle, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { label: 'Registrar prestamo', icon: HandCoins, tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  { label: 'Registrar devolucion', icon: RefreshCw, tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  { label: 'Registrar deuda', icon: Receipt, tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  { label: 'Registrar donacion monetaria', icon: Banknote, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { label: 'Registrar donacion en especie', icon: Gift, tone: 'border-pink-200 bg-pink-50 text-pink-700' },
  { label: 'Subir factura/ticket', icon: Upload, tone: 'border-slate-200 bg-slate-50 text-slate-700' }
];

export function Accounting({ data, actions, currentUser }) {
  const [modal, setModal] = useState(null);
  const canCreate = canDo(currentUser, 'accounting', 'create');
  const canEdit = canDo(currentUser, 'accounting', 'edit');
  const canDelete = canDo(currentUser, 'accounting', 'delete');
  const report = useMemo(() => buildAccountingReport(data), [data]);
  const areaGroups = useMemo(() => buildAreaGroups(report), [report]);
  const isSuperadmin = currentUser?.role === 'Superadministrador';

  function openQuickAction(label) {
    const mapping = {
      'Registrar gasto': { type: 'movement', movementType: 'bank_out', title: 'Registrar pago bancario' },
      'Registrar ingreso': { type: 'movement', movementType: 'bank_in', title: 'Registrar ingreso bancario' },
      'Subir factura/ticket': { type: 'future', title: label }
    };
    setModal(mapping[label] || { type: 'future', title: label });
  }

  return (
    <>
      <PageHeader
        title="Contabilidad"
        description="Centro de control economico y social de Pan y Esperanza."
        actions={<PermissionBadges canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />}
      />

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Estado economico</p>
            <h3 className="text-xl font-bold text-ink">Dinero real disponible y compromisos pendientes</h3>
          </div>
          {report.usingTreasuryFallback && (
            <p className="max-w-md text-sm text-slate-500">
              Resumen provisional basado en Tesoreria actual hasta registrar movimientos contables.
            </p>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-md bg-ink p-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white/70">Saldo total real</p>
                <p className="mt-3 text-4xl font-bold">{formatMoney(report.realBalance)}</p>
              </div>
              <span className="rounded-md bg-white/10 p-2 text-white"><Scale size={24} /></span>
            </div>
            <p className="mt-4 text-sm text-white/70">
              Solo caja y bancos. No incluye donaciones en especie ni valor social.
            </p>
          </article>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <EconomicCard label="Caja" value={formatMoney(report.cashBalance)} detail={`${report.cashAccounts} cuentas de efectivo`} icon={Wallet} tone="bg-emerald-50 text-emerald-700" />
            <EconomicCard label="Bancos" value={formatMoney(report.bankBalance)} detail={`${report.bankAccounts} cuentas bancarias o digitales`} icon={Landmark} tone="bg-blue-50 text-blue-700" />
            <EconomicCard label="Prestamos pendientes de devolver" value={formatMoney(report.pendingLoanAmount)} detail={`${report.pendingLoans} registros pendientes`} icon={HandCoins} tone="bg-violet-50 text-violet-700" />
            <EconomicCard label="Facturas/deudas pendientes" value={formatMoney(report.pendingDebtAndInvoiceAmount)} detail={`${report.pendingInvoices + report.pendingDebts} asuntos pendientes`} icon={Receipt} tone="bg-orange-50 text-orange-700" />
            <EconomicCard label="Documentos pendientes" value={report.pendingDocuments} detail="Facturas, tickets o movimientos sin adjunto" icon={FileText} tone="bg-slate-100 text-slate-700" />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-cyan-200 bg-cyan-50 p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-800">Valor social</p>
            <h3 className="mt-1 text-xl font-bold text-ink">Impacto estimado separado del dinero real</h3>
            <p className="mt-2 text-sm text-slate-600">
              Valor estimado de donaciones en especie y ayudas entregadas. No representa dinero disponible.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SocialCard label="Valor social recibido" value={formatMoney(report.socialReceived)} icon={Gift} />
            <SocialCard label="Valor social entregado" value={formatMoney(report.socialDelivered)} icon={PackageCheck} />
            <SocialCard label="Balance social" value={formatMoney(report.socialBalance)} icon={BarChart3} />
          </div>
        </div>
      </section>

      <CashBankWorkspace
        report={report}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onOpen={setModal}
      />

      <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Alertas economicas</p>
            <h3 className="text-xl font-bold text-ink">Asuntos que requieren revision</h3>
          </div>
          {report.alerts.length ? <AlertTriangle className="text-orange-600" size={24} /> : <CheckCircle2 className="text-emerald-600" size={24} />}
        </div>
        {report.alerts.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.alerts.map((alert) => (
              <AlertCard key={alert.title} alert={alert} />
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="Todo correcto por ahora." detail="No hay alertas economicas con los datos actuales." />
        )}
      </section>

      <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-200 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Ultimos movimientos</p>
          <h3 className="text-xl font-bold text-ink">Actividad contable reciente</h3>
        </div>
        {report.recentMovements.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th>Tipo</th>
                  <th>Concepto</th>
                  <th>Persona/proveedor/donante</th>
                  <th>Importe o valor</th>
                  <th>Estado</th>
                  <th className="pr-5">Metodo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.recentMovements.map((movement) => (
                  <tr key={movement.key} className="align-top">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(movement.date)}</td>
                    <td className="py-4"><TypeBadge type={movement.type} /></td>
                    <td className="max-w-[260px] py-4 font-semibold text-ink">{movement.concept}</td>
                    <td className="py-4 text-slate-600">{movement.contact}</td>
                    <td className={`py-4 font-bold ${movement.direction === 'out' ? 'text-red-700' : movement.direction === 'social' ? 'text-cyan-800' : 'text-emerald-700'}`}>
                      {formatMovementAmount(movement)}
                    </td>
                    <td className="py-4"><StatusBadge status={movement.status} /></td>
                    <td className="pr-5 py-4 text-slate-600">{movement.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={ClipboardList} title="No hay movimientos registrados todavia." detail="Cuando se registren ingresos, gastos, prestamos, deudas o valor social apareceran aqui." />
        )}
      </section>

      {canCreate && (
        <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Acciones rapidas</p>
            <h3 className="text-xl font-bold text-ink">Registrar operaciones sin duplicar datos</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <QuickActionButton key={action.label} action={action} onClick={() => openQuickAction(action.label)} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Areas contables agrupadas</p>
          <h3 className="text-xl font-bold text-ink">Estructura preparada para las siguientes fases</h3>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {areaGroups.map((group) => (
            <AreaGroup key={group.title} group={group} />
          ))}
        </div>
      </section>

      {modal?.type === 'account' && (
        <Modal title={modal.item ? 'Editar cuenta' : modal.title || 'Nueva cuenta'} onClose={() => setModal(null)}>
          <FinancialAccountForm
            initial={modal.item}
            defaultType={modal.accountType}
            onSubmit={async (payload) => {
              if (modal.item) await actions.updateFinancialAccount(modal.item.id, payload);
              else await actions.createFinancialAccount(payload);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal?.type === 'movement' && (
        <Modal title={modal.title || movementTypeLabel(modal.movementType)} onClose={() => setModal(null)}>
          <CashBankMovementForm
            accounts={report.financialAccounts}
            movementType={modal.movementType}
            isSuperadmin={isSuperadmin}
            onSubmit={async (payload) => {
              await actions.registerCashBankMovement({ ...payload, movement_type: modal.movementType });
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal?.type === 'transfer' && (
        <Modal title="Transferencia entre cuentas" onClose={() => setModal(null)}>
          <TransferForm
            accounts={report.financialAccounts}
            isSuperadmin={isSuperadmin}
            onSubmit={async (payload) => {
              await actions.registerBankTransfer(payload);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal?.type === 'correct-movement' && (
        <Modal title="Corregir movimiento" onClose={() => setModal(null)}>
          <CashBankMovementForm
            accounts={report.financialAccounts}
            movementType={modal.item.movement_type}
            movement={modal.item}
            isCorrection
            isSuperadmin={isSuperadmin}
            onSubmit={async (payload) => {
              await actions.correctCashBankMovement(modal.item.id, payload);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal?.type === 'void-movement' && (
        <Modal title="Anular movimiento" onClose={() => setModal(null)}>
          <VoidMovementForm
            movement={modal.item}
            onSubmit={async (reason) => {
              await actions.voidCashBankMovement(modal.item.id, reason);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal?.type === 'delete-account' && (
        <Modal title="Eliminar cuenta sin relaciones" onClose={() => setModal(null)}>
          <DeleteAccountForm
            account={modal.item}
            onSubmit={async () => {
              await actions.deleteFinancialAccount(modal.item.id);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal?.type === 'future' && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
            <p className="text-lg font-bold text-ink">Disponible en la siguiente fase.</p>
            <p className="mt-2 text-sm text-slate-600">
              En Fase 3.2 quedan cerrados Caja y Bancos. Este flujo se activara cuando toque su bloque correspondiente.
            </p>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setModal(null)}>Entendido</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CashBankWorkspace({ report, canCreate, canEdit, canDelete, onOpen }) {
  const cashAccounts = report.financialAccounts.filter(isCashAccount);
  const bankAccounts = report.financialAccounts.filter((account) => !isCashAccount(account));

  return (
    <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Caja y bancos</p>
          <h3 className="text-xl font-bold text-ink">Operativa cerrada para efectivo, cuentas y transferencias</h3>
          <p className="mt-1 text-sm text-slate-600">Los movimientos actualizan saldo, crean evento contable y quedan registrados en auditoria.</p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onOpen({ type: 'account', title: 'Nueva caja', accountType: 'cash' })}><Wallet size={17} /> Nueva caja</Button>
            <Button variant="secondary" onClick={() => onOpen({ type: 'account', title: 'Nueva cuenta bancaria', accountType: 'bank' })}><Landmark size={17} /> Nueva cuenta</Button>
          </div>
        )}
      </div>

      {!canCreate && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Modo consulta. Tu usuario puede ver Caja y Bancos, pero no registrar movimientos.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <AccountColumn
            title="Caja"
            accounts={cashAccounts}
            emptyText="No hay cajas creadas todavia."
            canEdit={canEdit}
            canDelete={canDelete}
            onOpen={onOpen}
          />
          <AccountColumn
            title="Bancos"
            accounts={bankAccounts}
            emptyText="No hay cuentas bancarias creadas todavia."
            canEdit={canEdit}
            canDelete={canDelete}
            onOpen={onOpen}
          />
        </div>

        <div className="rounded-md border border-slate-200">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="font-bold text-ink">Movimientos de Caja y Bancos</h4>
                <p className="text-sm text-slate-500">Linea temporal unica, incluyendo activos, corregidos y anulados.</p>
              </div>
              {canCreate && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="subtle" onClick={() => onOpen({ type: 'movement', movementType: 'cash_in', title: 'Entrada de efectivo' })}><ArrowUpCircle size={16} /> Entrada caja</Button>
                  <Button variant="secondary" onClick={() => onOpen({ type: 'movement', movementType: 'cash_out', title: 'Salida de efectivo' })}><ArrowDownCircle size={16} /> Salida caja</Button>
                  <Button variant="subtle" onClick={() => onOpen({ type: 'movement', movementType: 'bank_in', title: 'Ingreso bancario' })}><ArrowUpCircle size={16} /> Ingreso banco</Button>
                  <Button variant="secondary" onClick={() => onOpen({ type: 'movement', movementType: 'bank_out', title: 'Pago bancario' })}><ArrowDownCircle size={16} /> Pago banco</Button>
                  <Button onClick={() => onOpen({ type: 'transfer' })}><RefreshCw size={16} /> Transferir</Button>
                </div>
              )}
            </div>
          </div>
          <CashBankTimeline
            rows={report.cashBankTimeline}
            canEdit={canEdit}
            canDelete={canDelete}
            onOpen={onOpen}
          />
        </div>
      </div>
    </section>
  );
}

function AccountColumn({ title, accounts, emptyText, canEdit, canDelete, onOpen }) {
  return (
    <section className="rounded-md border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-ink">{title}</h4>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{accounts.length}</span>
      </div>
      <div className="grid gap-3">
        {accounts.map((account) => (
          <article key={account.id} className="rounded-md bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{account.name}</p>
                <p className="text-xs text-slate-500">{accountTypeLabel(account.account_type)}{account.bank_name ? ` - ${account.bank_name}` : ''}</p>
              </div>
              <p className="text-right text-lg font-bold text-ink">{formatMoney(account.current_balance)}</p>
            </div>
            {(canEdit || canDelete) && (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {canEdit && <Button variant="secondary" onClick={() => onOpen({ type: 'account', item: account })}>Editar</Button>}
                {canDelete && <Button variant="danger" onClick={() => onOpen({ type: 'delete-account', item: account })}>Eliminar vacia</Button>}
              </div>
            )}
          </article>
        ))}
        {!accounts.length && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</p>}
      </div>
    </section>
  );
}

function CashBankTimeline({ rows, canEdit, canDelete, onOpen }) {
  if (!rows.length) {
    return <div className="p-4"><EmptyState icon={ClipboardList} title="No hay movimientos de Caja o Bancos." detail="Crea una caja o cuenta bancaria y registra la primera operacion." /></div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Fecha y hora</th>
            <th>Cuenta</th>
            <th>Tipo</th>
            <th>Motivo</th>
            <th>Importe</th>
            <th>Estado</th>
            <th>Usuario</th>
            {(canEdit || canDelete) && <th className="pr-4 text-right">Acciones</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const canCorrect = canEdit && row.status === 'active' && !String(row.movement_type || '').startsWith('transfer_');
            const canVoid = canDelete && row.status === 'active';
            return (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3 text-slate-600">{row.created_at ? formatDateTime(row.created_at) : formatDate(row.date)}</td>
                <td className="py-3 font-semibold text-ink">{row.accountName}</td>
                <td className="py-3"><TypeBadge type={row.type} /></td>
                <td className="max-w-[280px] py-3 text-slate-700">{row.concept}</td>
                <td className={`py-3 font-bold ${row.direction === 'out' ? 'text-red-700' : 'text-emerald-700'}`}>{formatMovementAmount(row)}</td>
                <td className="py-3"><StatusBadge status={statusLabel(row.status)} /></td>
                <td className="py-3 text-slate-600">{row.userName}</td>
                {(canEdit || canDelete) && (
                  <td className="pr-4 py-3">
                    <div className="flex justify-end gap-2">
                      {canCorrect && <Button variant="secondary" onClick={() => onOpen({ type: 'correct-movement', item: row.raw })}>Corregir</Button>}
                      {canVoid && <Button variant="danger" onClick={() => onOpen({ type: 'void-movement', item: row.raw })}>Anular</Button>}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FinancialAccountForm({ initial, defaultType = 'cash', onSubmit }) {
  const [form, setForm] = useState(initial || {
    name: '',
    account_type: defaultType,
    bank_name: '',
    account_number: '',
    iban: '',
    opening_balance: 0,
    notes: ''
  });
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError.message || 'No se pudo guardar la cuenta.');
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
      <FormError message={error} />
      <FormField label="Nombre" required><input className={inputClass} required value={form.name || ''} onChange={(event) => updateForm(setForm, 'name', event.target.value)} /></FormField>
      <FormField label="Tipo" required>
        <select className={inputClass} value={form.account_type || defaultType} disabled={Boolean(initial)} onChange={(event) => updateForm(setForm, 'account_type', event.target.value)}>
          <option value="cash">Caja efectivo</option>
          <option value="bank">Cuenta bancaria</option>
          <option value="bizum">Bizum</option>
          <option value="paypal">PayPal</option>
          <option value="card">Tarjeta</option>
          <option value="other">Otra cuenta</option>
        </select>
      </FormField>
      <FormField label="Saldo inicial" required><input className={inputClass} type="number" step="0.01" min="0" required disabled={Boolean(initial)} value={form.opening_balance ?? 0} onChange={(event) => updateForm(setForm, 'opening_balance', Number(event.target.value))} /></FormField>
      <FormField label="Banco"><input className={inputClass} value={form.bank_name || ''} onChange={(event) => updateForm(setForm, 'bank_name', event.target.value)} /></FormField>
      <FormField label="Numero de cuenta"><input className={inputClass} value={form.account_number || ''} onChange={(event) => updateForm(setForm, 'account_number', event.target.value)} /></FormField>
      <FormField label="IBAN"><input className={inputClass} value={form.iban || ''} onChange={(event) => updateForm(setForm, 'iban', event.target.value)} /></FormField>
      <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes || ''} onChange={(event) => updateForm(setForm, 'notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit">{initial ? 'Guardar cambios' : 'Crear cuenta'}</Button></div>
    </form>
  );
}

function CashBankMovementForm({ accounts, movementType, movement, isCorrection = false, isSuperadmin, onSubmit }) {
  const accountOptions = accounts.filter((account) => movementType.startsWith('cash') ? isCashAccount(account) : !isCashAccount(account));
  const [form, setForm] = useState({
    financial_account_id: movement?.financial_account_id || accountOptions[0]?.id || '',
    movement_datetime: toDateTimeInputValue(movement?.created_at || movement?.movement_at),
    amount: movement?.amount || 0,
    reason: movement?.notes || '',
    reference: movement?.reference || '',
    payment_method: movement?.payment_method || (movementType.startsWith('cash') ? 'Efectivo' : 'Transferencia'),
    document_name: '',
    document_data_url: '',
    document_type: movementType.endsWith('_out') ? 'ticket' : 'receipt',
    correction_reason: '',
    allow_negative_balance: false
  });
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError.message || 'No se pudo registrar el movimiento.');
    }
  }

  if (!accountOptions.length) {
    return <EmptyState icon={Wallet} title="No hay cuenta disponible." detail={movementType.startsWith('cash') ? 'Crea primero una caja.' : 'Crea primero una cuenta bancaria.'} />;
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
      <FormError message={error} />
      <FormField label="Cuenta" required>
        <select className={inputClass} required disabled={isCorrection} value={form.financial_account_id} onChange={(event) => updateForm(setForm, 'financial_account_id', event.target.value)}>
          {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name} - {formatMoney(account.current_balance)}</option>)}
        </select>
      </FormField>
      <FormField label="Fecha y hora" required><input className={inputClass} type="datetime-local" required value={form.movement_datetime} onChange={(event) => updateForm(setForm, 'movement_datetime', event.target.value)} /></FormField>
      <FormField label="Importe" required><input className={inputClass} type="number" step="0.01" min="0.01" required value={form.amount} onChange={(event) => updateForm(setForm, 'amount', Number(event.target.value))} /></FormField>
      <FormField label="Metodo"><select className={inputClass} value={form.payment_method} onChange={(event) => updateForm(setForm, 'payment_method', event.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Bizum</option><option>PayPal</option><option>Otro</option></select></FormField>
      <div className="sm:col-span-2"><FormField label="Motivo" required><textarea className={inputClass} rows="3" required value={form.reason} onChange={(event) => updateForm(setForm, 'reason', event.target.value)} /></FormField></div>
      <FormField label="Referencia"><input className={inputClass} value={form.reference} onChange={(event) => updateForm(setForm, 'reference', event.target.value)} /></FormField>
      <FileAttachmentField form={form} setForm={setForm} />
      {isCorrection && <div className="sm:col-span-2"><FormField label="Motivo de correccion" required><textarea className={inputClass} rows="3" required value={form.correction_reason} onChange={(event) => updateForm(setForm, 'correction_reason', event.target.value)} /></FormField></div>}
      {isSuperadmin && movementType.endsWith('_out') && <NegativeBalanceToggle form={form} setForm={setForm} />}
      <div className="flex justify-end sm:col-span-2"><Button type="submit">{isCorrection ? 'Guardar correccion' : 'Registrar movimiento'}</Button></div>
    </form>
  );
}

function TransferForm({ accounts, isSuperadmin, onSubmit }) {
  const [form, setForm] = useState({
    from_account_id: accounts[0]?.id || '',
    to_account_id: accounts[1]?.id || '',
    movement_datetime: toDateTimeInputValue(),
    amount: 0,
    reason: '',
    reference: '',
    document_name: '',
    document_data_url: '',
    document_type: 'proof',
    allow_negative_balance: false
  });
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError.message || 'No se pudo registrar la transferencia.');
    }
  }

  if (accounts.length < 2) {
    return <EmptyState icon={Landmark} title="Faltan cuentas." detail="Necesitas al menos dos cuentas activas para registrar una transferencia." />;
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
      <FormError message={error} />
      <FormField label="Cuenta origen" required><select className={inputClass} required value={form.from_account_id} onChange={(event) => updateForm(setForm, 'from_account_id', event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {formatMoney(account.current_balance)}</option>)}</select></FormField>
      <FormField label="Cuenta destino" required><select className={inputClass} required value={form.to_account_id} onChange={(event) => updateForm(setForm, 'to_account_id', event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {formatMoney(account.current_balance)}</option>)}</select></FormField>
      <FormField label="Fecha y hora" required><input className={inputClass} type="datetime-local" required value={form.movement_datetime} onChange={(event) => updateForm(setForm, 'movement_datetime', event.target.value)} /></FormField>
      <FormField label="Importe" required><input className={inputClass} type="number" step="0.01" min="0.01" required value={form.amount} onChange={(event) => updateForm(setForm, 'amount', Number(event.target.value))} /></FormField>
      <div className="sm:col-span-2"><FormField label="Motivo" required><textarea className={inputClass} rows="3" required value={form.reason} onChange={(event) => updateForm(setForm, 'reason', event.target.value)} /></FormField></div>
      <FormField label="Referencia"><input className={inputClass} value={form.reference} onChange={(event) => updateForm(setForm, 'reference', event.target.value)} /></FormField>
      <FileAttachmentField form={form} setForm={setForm} />
      {isSuperadmin && <NegativeBalanceToggle form={form} setForm={setForm} />}
      <div className="flex justify-end sm:col-span-2"><Button type="submit">Registrar transferencia</Button></div>
    </form>
  );
}

function VoidMovementForm({ movement, onSubmit }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit(reason);
    } catch (submitError) {
      setError(submitError.message || 'No se pudo anular el movimiento.');
    }
  }
  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FormError message={error} />
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Vas a anular el movimiento {movementTypeLabel(movement.movement_type)} por {formatMoney(movement.amount)}. El saldo de la cuenta se revertira automaticamente.
      </div>
      <FormField label="Motivo de anulacion" required><textarea className={inputClass} rows="4" required value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
      <div className="flex justify-end"><Button variant="danger" type="submit">Anular movimiento</Button></div>
    </form>
  );
}

function DeleteAccountForm({ account, onSubmit }) {
  const [error, setError] = useState('');
  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSubmit();
    } catch (submitError) {
      setError(submitError.message || 'No se pudo eliminar la cuenta.');
    }
  }
  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FormError message={error} />
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Solo se eliminara si no tiene movimientos ni eventos relacionados. Si ya fue usada, el sistema bloqueara la eliminacion.
      </div>
      <p className="font-bold text-ink">{account.name}</p>
      <div className="flex justify-end"><Button variant="danger" type="submit">Eliminar cuenta vacia</Button></div>
    </form>
  );
}

function FileAttachmentField({ form, setForm }) {
  async function handleFile(file) {
    if (!file) {
      setForm((state) => ({ ...state, document_name: '', document_data_url: '' }));
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setForm((state) => ({ ...state, document_name: file.name, document_data_url: dataUrl }));
  }
  return (
    <FormField label="Documento adjunto opcional">
      <input className={inputClass} type="file" onChange={(event) => handleFile(event.target.files?.[0])} />
      {form.document_name && <p className="mt-1 text-xs text-slate-500">{form.document_name}</p>}
    </FormField>
  );
}

function NegativeBalanceToggle({ form, setForm }) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
      <input type="checkbox" className="mt-1" checked={Boolean(form.allow_negative_balance)} onChange={(event) => updateForm(setForm, 'allow_negative_balance', event.target.checked)} />
      <span>Autorizo saldo negativo de forma excepcional.</span>
    </label>
  );
}

function FormError({ message }) {
  return message ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{message}</div> : null;
}

function PermissionBadges({ canCreate, canEdit, canDelete }) {
  const permissions = [
    ['Crear', canCreate],
    ['Editar', canEdit],
    ['Eliminar', canDelete]
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {permissions.map(([label, active]) => (
        <span key={label} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
          <ShieldCheck size={14} />
          {label}
        </span>
      ))}
    </div>
  );
}

function EconomicCard({ label, value, detail, icon: Icon, tone }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
        </div>
        <span className={`rounded-md p-2 ${tone}`}><Icon size={21} /></span>
      </div>
      <p className="mt-3 text-sm text-slate-500">{detail}</p>
    </article>
  );
}

function SocialCard({ label, value, icon: Icon }) {
  return (
    <article className="rounded-md border border-cyan-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <Icon className="text-cyan-700" size={20} />
      </div>
      <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
    </article>
  );
}

function AlertCard({ alert }) {
  const Icon = alert.icon;
  return (
    <article className={`rounded-md border p-4 ${alert.tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-ink">{alert.title}</h4>
          <p className="mt-1 text-sm text-slate-600">{alert.detail}</p>
        </div>
        <Icon size={21} />
      </div>
    </article>
  );
}

function EmptyState({ icon: Icon, title, detail }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <Icon className="mx-auto text-slate-400" size={28} />
      <p className="mt-3 font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function TypeBadge({ type }) {
  return <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{type}</span>;
}

function StatusBadge({ status }) {
  const normalized = normalize(status);
  const tone = normalized.includes('anulad') || normalized.includes('void')
    ? 'bg-red-50 text-red-700'
    : normalized.includes('pendiente') || normalized.includes('parcial')
      ? 'bg-orange-50 text-orange-700'
      : 'bg-emerald-50 text-emerald-700';
  return <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function QuickActionButton({ action, onClick }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring flex min-h-[96px] items-start justify-between gap-4 rounded-md border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-panel ${action.tone}`}
    >
      <span className="font-bold">{action.label}</span>
      <Icon size={22} />
    </button>
  );
}

function AreaGroup({ group }) {
  const Icon = group.icon;
  return (
    <article className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <span className={`rounded-md p-2 ${group.tone}`}><Icon size={21} /></span>
        <h4 className="text-lg font-bold text-ink">{group.title}</h4>
      </div>
      <div className="mt-4 grid gap-2">
        {group.items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
            <div>
              <p className="font-semibold text-ink">{item.label}</p>
              <p className="text-xs text-slate-500">{item.detail}</p>
            </div>
            <span className="text-sm font-bold text-slate-700">{item.value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function buildAccountingReport(data = {}) {
  const accountingEvents = activeRecords(asArray(data.accounting_events));
  const financialAccounts = activeRecords(asArray(data.financial_accounts));
  const rawAccountingEvents = asArray(data.accounting_events);
  const rawCashBankMovements = asArray(data.cash_bank_movements);
  const cashBankMovements = activeRecords(rawCashBankMovements);
  const accountingDocuments = activeRecords(asArray(data.accounting_documents));
  const accountingContacts = asArray(data.accounting_contacts);
  const loanRecords = activeRecords(asArray(data.loan_records));
  const loanMovements = activeRecords(asArray(data.loan_movements));
  const debtRecords = activeRecords(asArray(data.debt_records));
  const debtMovements = activeRecords(asArray(data.debt_movements));
  const socialValueEvents = activeRecords(asArray(data.social_value_events));
  const treasuryAccounts = activeRecords(asArray(data.treasury_accounts));
  const treasuryIncomes = activeRecords(asArray(data.treasury_incomes));
  const treasuryExpenses = activeRecords(asArray(data.treasury_expenses));
  const treasuryLoans = activeRecords(asArray(data.treasury_loans));
  const donations = activeRecords(asArray(data.donations));

  const accountRows = financialAccounts.length ? financialAccounts : treasuryAccounts.map(normalizeTreasuryAccount);
  const cashAccounts = accountRows.filter(isCashAccount);
  const bankAccounts = accountRows.filter((account) => !isCashAccount(account));
  const cashBalance = sumBy(cashAccounts, accountBalance);
  const bankBalance = sumBy(bankAccounts, accountBalance);
  const treasuryIncomeTotal = sumBy(treasuryIncomes, (item) => Number(item.amount || 0));
  const treasuryExpenseTotal = sumBy(treasuryExpenses, (item) => Number(item.amount || 0));
  const usingTreasuryFallback = !financialAccounts.length && Boolean(treasuryAccounts.length || treasuryIncomes.length || treasuryExpenses.length || treasuryLoans.length);
  const realBalance = usingTreasuryFallback ? cashBalance + bankBalance + treasuryIncomeTotal - treasuryExpenseTotal : cashBalance + bankBalance;

  const pendingLoanRows = loanRecords.length
    ? loanRecords.map((loan) => ({ ...loan, outstanding: loanOutstanding(loan, loanMovements) })).filter((loan) => loan.outstanding > 0)
    : treasuryLoans.filter(isPendingTreasuryLoan).map((loan) => ({ ...loan, outstanding: Number(loan.amount || 0) }));
  const pendingLoanAmount = sumBy(pendingLoanRows, (loan) => loan.outstanding);

  const pendingDebtRows = debtRecords.map((debt) => ({ ...debt, outstanding: debtOutstanding(debt, debtMovements) })).filter((debt) => debt.outstanding > 0);
  const pendingDebtAmount = sumBy(pendingDebtRows, (debt) => debt.outstanding);
  const pendingInvoiceRows = accountingDocuments.filter(isPendingInvoice);
  const treasuryPendingInvoiceRows = treasuryExpenses.filter((item) => !hasAnyFile(item, ['invoice_name', 'invoice_path', 'file_name', 'file_path']));
  const pendingInvoiceCount = pendingInvoiceRows.length + treasuryPendingInvoiceRows.length;
  const pendingInvoiceAmount = sumBy(pendingInvoiceRows, (document) => Number(document.amount || 0)) + sumBy(treasuryPendingInvoiceRows, (expense) => Number(expense.amount || 0));

  const eventDocumentIds = new Set(accountingDocuments.map((document) => document.accounting_event_id).filter(Boolean));
  const movementWithoutDocs = accountingEvents.filter((event) => requiresDocument(event) && !eventDocumentIds.has(event.id)).length
    + cashBankMovements.filter((movement) => !movement.accounting_event_id && requiresMovementDocument(movement)).length;
  const treasuryDocsPending = treasuryExpenses.filter((item) => !hasAnyFile(item, ['invoice_name', 'invoice_path', 'file_name', 'file_path'])).length
    + treasuryIncomes.filter((item) => !hasAnyFile(item, ['document_name', 'document_path', 'file_name', 'file_path'])).length;
  const pendingDocuments = accountingDocuments.filter((document) => !hasAttachedFile(document)).length + movementWithoutDocs + treasuryDocsPending;

  const socialReceivedFromEvents = sumBy(socialValueEvents.filter((item) => item.value_type === 'received'), (item) => Number(item.amount || 0));
  const socialDelivered = sumBy(socialValueEvents.filter((item) => item.value_type === 'delivered'), (item) => Number(item.amount || 0));
  const donationSocialReceived = socialValueEvents.length ? 0 : sumBy(donations, (item) => Number(item.estimated_value || 0));
  const socialReceived = socialReceivedFromEvents + donationSocialReceived;

  const contactsById = new Map(accountingContacts.map((contact) => [contact.id, contact]));
  const accountsById = new Map(financialAccounts.map((account) => [account.id, account]));
  const eventsById = new Map(rawAccountingEvents.map((event) => [event.id, event]));
  const firstMovementByEvent = new Map();
  rawCashBankMovements.forEach((movement) => {
    if (movement.accounting_event_id && !firstMovementByEvent.has(movement.accounting_event_id)) firstMovementByEvent.set(movement.accounting_event_id, movement);
  });

  const recentMovements = buildRecentMovements({
    accountingEvents: rawAccountingEvents,
    cashBankMovements: rawCashBankMovements,
    loanRecords,
    loanMovements,
    debtRecords,
    debtMovements,
    socialValueEvents,
    treasuryIncomes,
    treasuryExpenses,
    treasuryLoans,
    donations,
    contactsById,
    accountsById,
    eventsById,
    firstMovementByEvent,
    useTreasuryFallback: usingTreasuryFallback
  });
  const cashBankTimeline = buildCashBankTimeline(rawCashBankMovements, eventsById, accountsById);

  const alerts = buildAlerts({
    pendingInvoices: pendingInvoiceCount,
    pendingLoanRows,
    pendingDebtRows,
    movementWithoutDocs: movementWithoutDocs + treasuryDocsPending,
    cashImbalances: accountRows.filter(isCashImbalanced),
    unreconciledBanks: bankAccounts.filter(isBankUnreconciled)
  });

  return {
    cashBalance,
    bankBalance,
    realBalance,
    cashAccounts: cashAccounts.length,
    bankAccounts: bankAccounts.length,
    pendingLoans: pendingLoanRows.length,
    pendingLoanAmount,
    pendingDebts: pendingDebtRows.length,
    pendingDebtAmount,
    pendingInvoices: pendingInvoiceCount,
    pendingDebtAndInvoiceAmount: pendingDebtAmount + pendingInvoiceAmount,
    pendingDocuments,
    socialReceived,
    socialDelivered,
    socialBalance: socialReceived - socialDelivered,
    alerts,
    recentMovements,
    cashBankTimeline,
    financialAccounts,
    usingTreasuryFallback,
    metrics: {
      incomes: accountingEvents.filter((event) => event.event_type === 'income' || event.event_type === 'donation_money').length + treasuryIncomes.length,
      expenses: accountingEvents.filter((event) => event.event_type === 'expense' || event.event_type === 'purchase').length + treasuryExpenses.length,
      loans: loanRecords.length + treasuryLoans.length,
      debts: debtRecords.length,
      documents: accountingDocuments.length,
      invoices: accountingDocuments.filter((document) => normalize(document.document_type) === 'invoice' || normalize(document.document_type) === 'factura').length + treasuryPendingInvoiceRows.length,
      tickets: accountingDocuments.filter((document) => normalize(document.document_type) === 'ticket').length,
      contracts: accountingDocuments.filter((document) => normalize(document.document_type) === 'contract' || normalize(document.document_type) === 'contrato').length,
      proofs: accountingDocuments.filter((document) => normalize(document.document_type) === 'proof' || normalize(document.document_type) === 'justificante').length,
      socialEvents: socialValueEvents.length + donations.length
    }
  };
}

function buildAlerts({ pendingInvoices, pendingLoanRows, pendingDebtRows, movementWithoutDocs, cashImbalances, unreconciledBanks }) {
  const alerts = [];
  if (pendingInvoices > 0) alerts.push({ title: 'Facturas pendientes', detail: `${pendingInvoices} facturas o tickets pendientes de adjuntar o revisar.`, icon: Receipt, tone: 'border-orange-200 bg-orange-50 text-orange-700' });
  if (pendingLoanRows.length > 0) alerts.push({ title: 'Prestamos pendientes', detail: `${pendingLoanRows.length} prestamos pendientes de devolver.`, icon: HandCoins, tone: 'border-violet-200 bg-violet-50 text-violet-700' });
  if (pendingDebtRows.length > 0) alerts.push({ title: 'Deudas pendientes', detail: `${pendingDebtRows.length} deudas activas con saldo pendiente.`, icon: Building2, tone: 'border-red-200 bg-red-50 text-red-700' });
  if (movementWithoutDocs > 0) alerts.push({ title: 'Movimientos sin documento adjunto', detail: `${movementWithoutDocs} movimientos necesitan factura, ticket o justificante.`, icon: FileText, tone: 'border-slate-200 bg-slate-50 text-slate-700' });
  if (cashImbalances.length > 0) alerts.push({ title: 'Caja descuadrada', detail: `${cashImbalances.length} cajas requieren revision de saldo.`, icon: Wallet, tone: 'border-red-200 bg-red-50 text-red-700' });
  if (unreconciledBanks.length > 0) alerts.push({ title: 'Bancos sin conciliar', detail: `${unreconciledBanks.length} cuentas bancarias pendientes de conciliacion.`, icon: Landmark, tone: 'border-blue-200 bg-blue-50 text-blue-700' });
  return alerts;
}

function buildRecentMovements(context) {
  const {
    accountingEvents,
    cashBankMovements,
    loanRecords,
    loanMovements,
    debtRecords,
    debtMovements,
    socialValueEvents,
    treasuryIncomes,
    treasuryExpenses,
    treasuryLoans,
    donations,
    contactsById,
    accountsById,
    eventsById,
    firstMovementByEvent,
    useTreasuryFallback
  } = context;
  const rows = [];

  accountingEvents.forEach((event) => {
    const movement = firstMovementByEvent.get(event.id);
    const account = accountsById.get(event.financial_account_id || movement?.financial_account_id);
    rows.push({
      key: `event-${event.id}`,
      date: event.occurred_at || event.created_at,
      type: eventTypeLabel(event.event_type),
      concept: event.title || event.description || 'Movimiento contable',
      contact: contactName(contactsById.get(event.contact_id)),
      amount: Number(event.amount || 0),
      direction: eventDirection(event.event_type),
      status: statusLabel(event.status),
      method: movement?.payment_method || accountMethod(account, event.event_type)
    });
  });

  cashBankMovements.filter((movement) => !movement.accounting_event_id).forEach((movement) => {
    const account = accountsById.get(movement.financial_account_id);
    rows.push({
      key: `cash-bank-${movement.id}`,
      date: movement.movement_at || movement.created_at,
      type: movementTypeLabel(movement.movement_type),
      concept: movement.reference || movement.notes || 'Movimiento caja/banco',
      contact: '-',
      amount: Number(movement.amount || 0),
      direction: movementDirection(movement.movement_type),
      status: statusLabel(movement.status),
      method: movement.payment_method || accountMethod(account, movement.movement_type)
    });
  });

  loanRecords.forEach((loan) => {
    rows.push({
      key: `loan-${loan.id}`,
      date: loan.loan_at || loan.created_at,
      type: 'Prestamo',
      concept: loan.reason || loan.notes || 'Prestamo registrado',
      contact: contactName(contactsById.get(loan.contact_id)),
      amount: Number(loan.principal_amount || 0),
      direction: 'in',
      status: statusLabel(loan.status),
      method: 'Caja/banco'
    });
  });

  loanMovements.forEach((movement) => {
    const loan = loanRecords.find((item) => item.id === movement.loan_id);
    rows.push({
      key: `loan-movement-${movement.id}`,
      date: movement.payment_at || movement.created_at,
      type: movement.movement_type === 'loan_received' ? 'Prestamo recibido' : 'Devolucion',
      concept: movement.notes || loan?.reason || 'Movimiento de prestamo',
      contact: contactName(contactsById.get(loan?.contact_id)),
      amount: Number(movement.amount || 0),
      direction: movement.movement_type === 'loan_received' ? 'in' : 'out',
      status: statusLabel(movement.status),
      method: accountMethod(accountsById.get(movement.financial_account_id), movement.movement_type)
    });
  });

  debtRecords.forEach((debt) => {
    rows.push({
      key: `debt-${debt.id}`,
      date: debt.debt_at || debt.created_at,
      type: 'Deuda',
      concept: debt.reason || debt.notes || 'Deuda registrada',
      contact: contactName(contactsById.get(debt.contact_id)),
      amount: Number(debt.original_amount || 0),
      direction: 'out',
      status: statusLabel(debt.status),
      method: 'Pendiente'
    });
  });

  debtMovements.forEach((movement) => {
    const debt = debtRecords.find((item) => item.id === movement.debt_id);
    rows.push({
      key: `debt-movement-${movement.id}`,
      date: movement.payment_at || movement.created_at,
      type: 'Pago de deuda',
      concept: movement.notes || debt?.reason || 'Movimiento de deuda',
      contact: contactName(contactsById.get(debt?.contact_id)),
      amount: Number(movement.amount || 0),
      direction: 'out',
      status: statusLabel(movement.status),
      method: accountMethod(accountsById.get(movement.financial_account_id), movement.movement_type)
    });
  });

  socialValueEvents.forEach((event) => {
    rows.push({
      key: `social-${event.id}`,
      date: event.social_value_at || event.created_at,
      type: event.value_type === 'received' ? 'Valor social recibido' : 'Valor social entregado',
      concept: socialEventLabel(event),
      contact: contactName(contactsById.get(event.contact_id)),
      amount: Number(event.amount || 0),
      direction: 'social',
      status: statusLabel(event.status),
      method: event.event_type === 'in_kind_donation' ? 'Especie' : 'Valor social'
    });
  });

  if (useTreasuryFallback) {
    treasuryIncomes.forEach((income) => rows.push({
      key: `treasury-income-${income.id}`,
      date: income.income_at || income.created_at,
      type: 'Ingreso',
      concept: income.concept || income.category || 'Ingreso de Tesoreria',
      contact: income.donor || '-',
      amount: Number(income.amount || 0),
      direction: 'in',
      status: 'Registrado',
      method: income.payment_method || 'Tesoreria'
    }));
    treasuryExpenses.forEach((expense) => rows.push({
      key: `treasury-expense-${expense.id}`,
      date: expense.expense_at || expense.created_at,
      type: 'Gasto',
      concept: expense.concept || expense.category || 'Gasto de Tesoreria',
      contact: expense.supplier || expense.responsible || '-',
      amount: Number(expense.amount || 0),
      direction: 'out',
      status: 'Registrado',
      method: 'Tesoreria'
    }));
    treasuryLoans.forEach((loan) => rows.push({
      key: `treasury-loan-${loan.id}`,
      date: loan.loan_at || loan.created_at,
      type: 'Prestamo',
      concept: loan.concept || 'Prestamo de Tesoreria',
      contact: loan.person || '-',
      amount: Number(loan.amount || 0),
      direction: isPendingTreasuryLoan(loan) ? 'in' : 'neutral',
      status: loan.status || 'Registrado',
      method: 'Tesoreria'
    }));
  }

  if (!socialValueEvents.length) {
    donations.forEach((donation) => rows.push({
      key: `donation-social-${donation.id}`,
      date: donation.donated_at || donation.created_at,
      type: 'Donacion en especie',
      concept: donation.donation_type || donation.notes || 'Donacion en especie',
      contact: donation.donor || '-',
      amount: Number(donation.estimated_value || 0),
      direction: 'social',
      status: donation.status || donation.state || 'Registrada',
      method: 'Especie'
    }));
  }

  return rows
    .filter((row) => row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);
}

function buildAreaGroups(report) {
  return [
    {
      title: 'DINERO REAL',
      icon: Wallet,
      tone: 'bg-emerald-50 text-emerald-700',
      items: [
        { label: 'Caja', detail: 'Efectivo disponible y movimientos de caja.', value: formatMoney(report.cashBalance) },
        { label: 'Bancos', detail: 'Cuentas bancarias y pasarelas digitales.', value: formatMoney(report.bankBalance) },
        { label: 'Ingresos', detail: 'Ingresos monetarios registrados.', value: report.metrics.incomes },
        { label: 'Gastos', detail: 'Gastos y compras registrados.', value: report.metrics.expenses }
      ]
    },
    {
      title: 'COMPROMISOS',
      icon: Receipt,
      tone: 'bg-orange-50 text-orange-700',
      items: [
        { label: 'Prestamos', detail: 'Adelantos recibidos con saldo pendiente.', value: report.pendingLoans },
        { label: 'Deudas', detail: 'Importes pendientes con proveedores o personas.', value: report.pendingDebts },
        { label: 'Facturas pendientes', detail: 'Facturas o tickets pendientes de completar.', value: report.pendingInvoices }
      ]
    },
    {
      title: 'IMPACTO SOCIAL',
      icon: Gift,
      tone: 'bg-cyan-50 text-cyan-700',
      items: [
        { label: 'Donaciones en especie', detail: 'Entradas que no aumentan caja ni bancos.', value: report.metrics.socialEvents },
        { label: 'Valor social recibido', detail: 'Valor estimado que llega a la asociacion.', value: formatMoney(report.socialReceived) },
        { label: 'Valor social entregado', detail: 'Valor estimado entregado a beneficiarios.', value: formatMoney(report.socialDelivered) }
      ]
    },
    {
      title: 'DOCUMENTACION',
      icon: FileText,
      tone: 'bg-slate-100 text-slate-700',
      items: [
        { label: 'Facturas', detail: 'Documentos asociados a gastos y deudas.', value: report.metrics.invoices },
        { label: 'Tickets', detail: 'Tickets asociados a compras menores.', value: report.metrics.tickets },
        { label: 'Contratos', detail: 'Contratos y compromisos documentales.', value: report.metrics.contracts },
        { label: 'Justificantes', detail: 'Justificantes vinculados a la operativa.', value: report.metrics.proofs + report.pendingDocuments }
      ]
    },
    {
      title: 'INFORMES',
      icon: BarChart3,
      tone: 'bg-blue-50 text-blue-700',
      items: [
        { label: 'Libro caja', detail: 'Resumen de movimientos de efectivo.', value: report.cashAccounts },
        { label: 'Bancos', detail: 'Resumen por cuenta bancaria.', value: report.bankAccounts },
        { label: 'Ingresos y gastos', detail: 'Actividad monetaria general.', value: report.metrics.incomes + report.metrics.expenses },
        { label: 'Prestamos', detail: 'Historial y saldos pendientes.', value: report.metrics.loans },
        { label: 'Deudas', detail: 'Historial y saldos pendientes.', value: report.metrics.debts },
        { label: 'Balance', detail: 'Saldo real y compromisos.', value: formatMoney(report.realBalance) },
        { label: 'Valor social', detail: 'Recibido, entregado y balance social.', value: formatMoney(report.socialBalance) }
      ]
    }
  ];
}

function buildCashBankTimeline(movements, eventsById, accountsById) {
  return movements
    .map((movement) => {
      const event = eventsById.get(movement.accounting_event_id);
      const account = accountsById.get(movement.financial_account_id);
      return {
        id: movement.id,
        raw: movement,
        date: movement.movement_at || movement.created_at,
        created_at: movement.created_at,
        movement_type: movement.movement_type,
        type: movementTypeLabel(movement.movement_type),
        concept: movement.notes || event?.title || movement.reference || 'Movimiento caja/banco',
        accountName: account?.name || 'Cuenta no encontrada',
        amount: Number(movement.amount || 0),
        direction: movementDirection(movement.movement_type),
        status: movement.status || 'active',
        method: movement.payment_method || accountMethod(account, movement.movement_type),
        userName: movement.created_by_name || event?.created_by_name || '-'
      };
    })
    .sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function activeRecords(rows) {
  return rows.filter((item) => !isVoided(item));
}

function isVoided(item) {
  const status = normalize(item?.status || item?.state || '');
  return status.includes('void') || status.includes('anulad') || status.includes('cancel');
}

function normalizeTreasuryAccount(account) {
  return {
    ...account,
    current_balance: account.balance,
    account_type: account.account_type || account.type || 'other'
  };
}

function isCashAccount(account) {
  const type = normalize(account?.account_type || account?.type || account?.name);
  return type === 'cash' || type.includes('caja') || type.includes('efectivo');
}

function accountBalance(account) {
  if (account?.current_balance !== undefined && account?.current_balance !== null) return Number(account.current_balance || 0);
  if (account?.balance !== undefined && account?.balance !== null) return Number(account.balance || 0);
  return Number(account?.opening_balance || 0);
}

function loanOutstanding(loan, movements) {
  if (normalize(loan.status).includes('repaid') || normalize(loan.status).includes('devuelto total')) return 0;
  const paid = sumBy(movements.filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received'), (movement) => Number(movement.amount || 0));
  return Math.max(0, Number(loan.principal_amount || 0) - paid);
}

function debtOutstanding(debt, movements) {
  if (normalize(debt.status).includes('paid') || normalize(debt.status).includes('pagad')) return 0;
  const paid = sumBy(movements.filter((movement) => movement.debt_id === debt.id), (movement) => Number(movement.amount || 0));
  return Math.max(0, Number(debt.original_amount || 0) - paid);
}

function isPendingTreasuryLoan(loan) {
  const status = normalize(loan.status);
  return status.includes('pendiente') || status.includes('parcial') || status === 'active';
}

function isPendingInvoice(document) {
  const type = normalize(document.document_type);
  return (type === 'invoice' || type === 'ticket' || type === 'factura') && !isVoided(document);
}

function requiresDocument(event) {
  return ['expense', 'purchase', 'income', 'loan', 'debt', 'donation_money'].includes(event.event_type);
}

function requiresMovementDocument(movement) {
  return ['cash_out', 'bank_out', 'adjustment'].includes(movement.movement_type);
}

function hasAttachedFile(document) {
  return hasAnyFile(document, ['file_name', 'file_path', 'file_data_url', 'document_url', 'document_name', 'invoice_name']);
}

function hasAnyFile(item, fields) {
  return fields.some((field) => Boolean(String(item?.[field] || '').trim()));
}

function isCashImbalanced(account) {
  if (!isCashAccount(account)) return false;
  const statusText = normalize(`${account.reconciliation_status || ''} ${account.balance_status || ''} ${account.notes || ''}`);
  return account.is_balanced === false || Number(account.cash_difference || 0) !== 0 || statusText.includes('descuadrad');
}

function isBankUnreconciled(account) {
  const statusText = normalize(`${account.reconciliation_status || ''} ${account.balance_status || ''} ${account.notes || ''}`);
  return account.is_reconciled === false || statusText.includes('sin conciliar') || statusText.includes('pendiente conciliar');
}

function eventTypeLabel(type) {
  const labels = {
    income: 'Ingreso',
    expense: 'Gasto',
    purchase: 'Compra',
    loan: 'Prestamo',
    debt: 'Deuda',
    donation_money: 'Donacion monetaria',
    donation_in_kind: 'Donacion en especie',
    asset: 'Activo',
    social_value: 'Valor social',
    correction: 'Correccion',
    void: 'Anulacion'
  };
  return labels[type] || 'Movimiento';
}

function movementTypeLabel(type) {
  const labels = {
    cash_in: 'Entrada caja',
    cash_out: 'Salida caja',
    bank_in: 'Entrada banco',
    bank_out: 'Salida banco',
    transfer_in: 'Transferencia entrada',
    transfer_out: 'Transferencia salida',
    adjustment: 'Correccion'
  };
  return labels[type] || 'Movimiento';
}

function socialEventLabel(event) {
  const labels = {
    in_kind_donation: 'Donacion en especie',
    delivery: 'Ayuda entregada',
    inventory_adjustment: 'Ajuste de inventario',
    volunteer_time: 'Tiempo voluntario',
    other: 'Valor social'
  };
  return labels[event.event_type] || event.notes || 'Valor social';
}

function eventDirection(type) {
  if (['expense', 'purchase', 'debt'].includes(type)) return 'out';
  if (['donation_in_kind', 'social_value'].includes(type)) return 'social';
  return 'in';
}

function movementDirection(type) {
  return String(type || '').includes('_out') || type === 'transfer_out' ? 'out' : 'in';
}

function statusLabel(status) {
  const labels = {
    active: 'Activo',
    voided: 'Anulado',
    corrected: 'Corregido',
    reversed: 'Revertido',
    partially_repaid: 'Parcial',
    repaid: 'Devuelto',
    partially_paid: 'Parcial',
    paid: 'Pagado'
  };
  return labels[status] || status || 'Registrado';
}

function accountTypeLabel(type) {
  const labels = {
    cash: 'Caja efectivo',
    bank: 'Cuenta bancaria',
    bizum: 'Bizum',
    paypal: 'PayPal',
    card: 'Tarjeta',
    other: 'Otra cuenta'
  };
  return labels[type] || type || 'Cuenta';
}

function contactName(contact) {
  return contact?.name || '-';
}

function accountMethod(account, fallback) {
  if (account?.name) return account.name;
  const normalized = normalize(fallback);
  if (normalized.includes('cash') || normalized.includes('caja')) return 'Caja';
  if (normalized.includes('bank') || normalized.includes('banco')) return 'Banco';
  if (normalized.includes('kind') || normalized.includes('especie')) return 'Especie';
  return 'Sin metodo';
}

function formatMovementAmount(movement) {
  const prefix = movement.direction === 'out' ? '- ' : movement.direction === 'in' ? '+ ' : '';
  return `${prefix}${formatMoney(movement.amount)}`;
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function toDateTimeInputValue(value) {
  if (!value) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T09:00`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.slice(0, 16);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function updateForm(setForm, field, value) {
  setForm((state) => ({ ...state, [field]: value }));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el documento adjunto.'));
    reader.readAsDataURL(file);
  });
}

function sumBy(rows, selector) {
  return rows.reduce((total, item) => total + selector(item), 0);
}
