import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gift,
  HandCoins,
  Landmark,
  PackageCheck,
  Plus,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { DeletionRequestForm } from '../components/DeletionRequestForm';
import { DirectDeletionForm } from '../components/DirectDeletionForm';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion } from '../lib/auth';
import { formatDate, formatDateTime, normalize, todayISO } from '../lib/formatters';
import { Treasury } from './Treasury';

const OPERATION_TYPES = [
  { value: 'income', label: 'Ingreso', icon: ArrowUpCircle, tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'expense', label: 'Gasto', icon: ArrowDownCircle, tone: 'bg-red-50 text-red-700' },
  { value: 'donation_money', label: 'Donación monetaria', icon: Banknote, tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'donation_in_kind', label: 'Donación en especie', icon: Gift, tone: 'bg-pink-50 text-pink-700' },
  { value: 'inventory_purchase', label: 'Compra de inventario', icon: PackageCheck, tone: 'bg-cyan-50 text-cyan-700' },
  { value: 'economic_help', label: 'Ayuda económica', icon: HandCoins, tone: 'bg-amber-50 text-amber-700' },
  { value: 'loan_received', label: 'Préstamo', icon: HandCoins, tone: 'bg-violet-50 text-violet-700' },
  { value: 'loan_repayment', label: 'Devolución', icon: RefreshCw, tone: 'bg-blue-50 text-blue-700' },
  { value: 'supplier_debt', label: 'Deuda', icon: Receipt, tone: 'bg-orange-50 text-orange-700' },
  { value: 'debt_payment', label: 'Pago de deuda', icon: Receipt, tone: 'bg-orange-50 text-orange-700' },
  { value: 'transfer', label: 'Transferencia entre cuentas', icon: RefreshCw, tone: 'bg-slate-100 text-slate-700' },
  { value: 'correction', label: 'Corrección', icon: RefreshCw, tone: 'bg-blue-50 text-blue-700' },
  { value: 'void', label: 'Anulación', icon: AlertTriangle, tone: 'bg-red-50 text-red-700' }
];

const MONEY_OUT_OPERATION_TYPES = new Set(['expense', 'inventory_purchase', 'economic_help', 'loan_repayment', 'debt_payment']);
const ACCOUNT_OPERATION_TYPES = new Set(['income', 'expense', 'donation_money', 'inventory_purchase', 'economic_help', 'loan_received', 'loan_repayment', 'debt_payment']);
const INVENTORY_OPERATION_TYPES = new Set(['donation_in_kind', 'inventory_purchase']);
const DONATION_OPERATION_TYPES = new Set(['donation_money', 'donation_in_kind']);
const DONATION_DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Factura', numberLabel: 'Número de factura' },
  { value: 'delivery_note', label: 'Albarán', numberLabel: 'Número de albarán' },
  { value: 'ticket', label: 'Ticket', numberLabel: 'Número de ticket' },
  { value: 'transfer', label: 'Transferencia', numberLabel: 'Referencia bancaria' },
  { value: 'bizum', label: 'Bizum', numberLabel: 'Código Bizum' },
  { value: 'paypal', label: 'PayPal', numberLabel: 'ID de transacción PayPal' },
  { value: 'check', label: 'Cheque', numberLabel: 'Número de cheque' },
  { value: 'internal_document', label: 'Documento interno', numberLabel: 'Número interno', readOnly: true },
  { value: 'no_document', label: 'Sin documento' }
];
const DONOR_KIND_MARKER = '[DONANTE_TIPO]';
const DONOR_CONTACT_MARKER = '[DONANTE_CONTACTO]';

export function Accounting({ data, actions, currentUser, navigationTarget }) {
  const [modal, setModal] = useState(null);
  const summaryRef = useRef(null);
  const cashBankRef = useRef(null);
  const loansDebtsRef = useRef(null);
  const alertsRef = useRef(null);
  const timelineRef = useRef(null);
  const treasuryRef = useRef(null);
  const canCreate = canDo(currentUser, 'accounting', 'create');
  const canEdit = canDo(currentUser, 'accounting', 'edit');
  const organization = data.organization_settings?.[0] || {};
  const canDeleteDirectly = canDeleteDefinitively(currentUser, 'accounting', organization);
  const canDelete = canDeleteDirectly || canRequestDefinitiveDeletion(currentUser, 'accounting', organization);
  const report = useMemo(() => buildAccountingReport(data), [data]);
  const areaGroups = useMemo(() => buildAreaGroups(report), [report]);
  const isSuperadmin = currentUser?.role === 'Superadministrador';
  const sectionRefs = {
    summary: summaryRef,
    cashBank: cashBankRef,
    loansDebts: loansDebtsRef,
    alerts: alertsRef,
    timeline: timelineRef,
    treasury: treasuryRef
  };

  function scrollToAccountingSection(sectionId) {
    sectionRefs[sectionId]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    const sectionId = sectionForAccountingFilter(navigationTarget?.filter);
    if (!sectionId) return;
    window.setTimeout(() => scrollToAccountingSection(sectionId), 50);
  }, [navigationTarget?.key, navigationTarget?.filter]);

  useEffect(() => {
    if (!canCreate || navigationTarget?.moduleId !== 'accounting') return;
    if (navigationTarget.filter !== 'new-operation') return;
    const operationType = navigationTarget.operationType;
    if (!OPERATION_TYPES.some((item) => item.value === operationType)) return;
    setModal({
      type: 'economic-operation',
      operationType,
      title: navigationTarget.title || operationModalTitle(operationType),
      contextLabel: navigationTarget.contextLabel || 'Nueva operación'
    });
  }, [canCreate, navigationTarget?.key, navigationTarget?.filter, navigationTarget?.operationType]);

  return (
    <>
      <PageHeader
        title="Contabilidad"
        description="Centro de control económico y social de Pan y Esperanza."
        actions={<PermissionBadges canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />}
      />

      <section ref={summaryRef} className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Estado económico</p>
            <h3 className="text-xl font-bold text-ink">Dinero real disponible y compromisos pendientes</h3>
          </div>
          {report.usingTreasuryFallback && (
            <p className="max-w-md text-sm text-slate-500">
              Resumen provisional basado en los datos económicos actuales hasta registrar movimientos contables.
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
            <EconomicCard label="Préstamos pendientes de devolver" value={formatMoney(report.pendingLoanAmount)} detail={`${report.pendingLoans} registros pendientes`} icon={HandCoins} tone="bg-violet-50 text-violet-700" />
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

      <EconomicOperationPanel canCreate={canCreate} onOpen={() => setModal({ type: 'economic-operation' })} />

      <div ref={cashBankRef}>
        <CashBankWorkspace
          report={report}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canDeleteDirectly={canDeleteDirectly}
          onOpen={setModal}
        />
      </div>

      <div ref={loansDebtsRef}>
        <LoansDebtsWorkspace
          report={report}
          canCreate={canCreate}
          onOpenOperation={(operation) => setModal({ type: 'economic-operation', ...operation })}
        />
      </div>

      <section ref={alertsRef} className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Alertas económicas</p>
            <h3 className="text-xl font-bold text-ink">Asuntos que requieren revisión</h3>
          </div>
          {report.alerts.length ? <AlertTriangle className="text-orange-600" size={24} /> : <CheckCircle2 className="text-emerald-600" size={24} />}
        </div>
        {report.alerts.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.alerts.map((alert) => (
              <AlertCard key={alert.title} alert={alert} onOpen={scrollToAccountingSection} />
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="Todo correcto por ahora." detail="No hay alertas económicas con los datos actuales." />
        )}
      </section>

      <section ref={timelineRef} className="mt-6 rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-200 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Línea temporal económica</p>
          <h3 className="text-xl font-bold text-ink">Todas las operaciones ordenadas por fecha</h3>
        </div>
        {report.recentMovements.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th>Tipo</th>
                  <th>Concepto</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Valor unitario</th>
                  <th>Persona/proveedor/donante</th>
                  <th>Valor total estimado</th>
                  <th>Estado</th>
                  <th className="pr-5">Método</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.recentMovements.map((movement) => (
                  <tr key={movement.key} className="align-top">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(movement.date)}</td>
                    <td className="py-4"><TypeBadge type={movement.type} /></td>
                    <td className="max-w-[260px] py-4 font-semibold text-ink">{movement.concept}</td>
                    <td className="py-4 text-slate-600">{movement.product || '-'}</td>
                    <td className="py-4 text-slate-600">{formatMovementQuantity(movement)}</td>
                    <td className="py-4 text-slate-600">{formatMovementUnitValue(movement)}</td>
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
          <EmptyState icon={ClipboardList} title="No hay movimientos registrados todavía." detail="Cuando se registren ingresos, gastos, préstamos, deudas o valor social aparecerán aquí." />
        )}
      </section>

      <div ref={treasuryRef}>
        <Treasury data={data} actions={actions} currentUser={currentUser} embedded permissionModule="accounting" />
      </div>

      <section className="mt-6">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Áreas contables agrupadas</p>
          <h3 className="text-xl font-bold text-ink">Estructura preparada para las siguientes fases</h3>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {areaGroups.map((group) => (
            <AreaGroup key={group.title} group={group} />
          ))}
        </div>
      </section>

      {modal?.type === 'economic-operation' && (
        <Modal title={modal.title || 'Nueva operación económica'} onClose={() => setModal(null)}>
          <EconomicOperationForm
            data={data}
            actions={actions}
            report={report}
            currentUser={currentUser}
            isSuperadmin={isSuperadmin}
            initialOperationType={modal.operationType}
            initialLoanId={modal.loanId}
            initialDebtId={modal.debtId}
            contextLabel={modal.contextLabel}
            onSubmit={async (payload) => {
              await actions.registerEconomicOperation(payload);
              setModal(null);
            }}
            onCorrect={async (movement, payload) => {
              await actions.correctCashBankMovement(movement.id, payload);
              setModal(null);
            }}
            onVoid={async (movement, reason) => {
              await actions.voidCashBankMovement(movement.id, reason);
              setModal(null);
            }}
          />
        </Modal>
      )}

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

      {modal?.type === 'delete-account' && (
        <Modal title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'} onClose={() => setModal(null)}>
          {canDeleteDirectly ? (
            <DirectDeletionForm
              recordLabel={modal.item.name || 'Cuenta contable'}
              relations={buildFinancialAccountDeletionRelations(modal.item, data)}
              onCancel={() => setModal(null)}
              onConfirm={async () => {
                await actions.deleteFinancialAccount(modal.item.id);
                setModal(null);
              }}
            />
          ) : (
            <DeletionRequestForm
              recordLabel={modal.item.name || 'Cuenta contable'}
              relations={buildFinancialAccountDeletionRelations(modal.item, data)}
              onCancel={() => setModal(null)}
              onSubmit={async (payload) => {
                await actions.createDeletionRequest({
                  module: 'financial_accounts',
                  record_type: 'financial_account',
                  record_id: modal.item.id,
                  record_label: modal.item.name || 'Cuenta contable',
                  reason: payload.reason,
                  notes: payload.notes,
                  relations: buildFinancialAccountDeletionRelations(modal.item, data)
                });
                setModal(null);
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function EconomicOperationPanel({ canCreate, onOpen }) {
  return (
    <section className="mt-6 rounded-md border border-brand-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Motor único de operaciones económicas</p>
          <h3 className="text-xl font-bold text-ink">Toda la contabilidad empieza aquí</h3>
          <p className="mt-1 text-sm text-slate-600">El sistema genera movimientos, documentos, contactos, inventario, eventos y auditoria desde una sola entrada.</p>
        </div>
        {canCreate ? (
          <Button className="min-h-[56px] justify-center px-6 text-base uppercase" onClick={onOpen}>
            <Plus size={22} /> Nueva operación
          </Button>
        ) : (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Modo consulta</span>
        )}
      </div>
    </section>
  );
}

function EconomicOperationForm({ data, actions, report, currentUser, isSuperadmin, initialOperationType = 'income', initialLoanId = '', initialDebtId = '', contextLabel = 'Nueva operación', onSubmit, onCorrect, onVoid }) {
  const accounts = report.financialAccounts || [];
  const inventoryItems = data.inventory_items || [];
  const beneficiaries = data.beneficiaries || [];
  const inventoryUnitValues = useMemo(
    () => buildInventoryUnitValueMap(inventoryItems, activeRecords(asArray(data.social_value_events))),
    [data.social_value_events, inventoryItems]
  );
  const eventsById = useMemo(() => new Map(asArray(data.accounting_events).map((event) => [event.id, event])), [data.accounting_events]);
  const pendingLoans = useMemo(() => activeRecords(asArray(data.loan_records)).map((loan) => ({
    ...loan,
    outstanding: loanOutstanding(loan, activeAccountingRecords(asArray(data.loan_movements), eventsById))
  })).filter((loan) => !isVoided(eventsById.get(loan.accounting_event_id)) && loan.outstanding > 0), [data.loan_movements, data.loan_records, eventsById]);
  const pendingDebts = useMemo(() => activeRecords(asArray(data.debt_records)).map((debt) => ({
    ...debt,
    outstanding: debtOutstanding(debt, activeAccountingRecords(asArray(data.debt_movements), eventsById))
  })).filter((debt) => !isVoided(eventsById.get(debt.accounting_event_id)) && debt.outstanding > 0), [data.debt_movements, data.debt_records, eventsById]);
  const activeMovements = useMemo(() => (report.cashBankTimeline || []).filter((row) => row.raw?.status === 'active'), [report.cashBankTimeline]);
  const correctableMovements = activeMovements.filter((row) => !String(row.raw?.movement_type || '').startsWith('transfer_') && !['loan', 'debt'].includes(row.eventType));
  const responsible = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || '';
  const initialType = OPERATION_TYPES.some((item) => item.value === initialOperationType) ? initialOperationType : 'income';
  const initialLoan = pendingLoans.find((loan) => loan.id === initialLoanId) || pendingLoans[0];
  const initialDebt = pendingDebts.find((debt) => debt.id === initialDebtId) || pendingDebts[0];
  const initialOperationAt = toDateTimeInputValue().slice(0, 10);
  const initialDocumentType = defaultDocumentTypeForOperation(initialType);
  const initialAmount = initialType === 'loan_repayment'
    ? initialLoan?.outstanding || ''
    : initialType === 'debt_payment'
      ? initialDebt?.outstanding || ''
      : '';
  const [form, setForm] = useState(() => ({
    operation_type: initialType,
    operation_at: initialOperationAt,
    amount: initialAmount,
    concept: '',
    financial_account_id: accounts[0]?.id || '',
    payment_method: 'Transferencia',
    reference: initialType === 'donation_money' ? nextAccountingDonationReference(data, initialOperationAt) : '',
    contact_name: '',
    supplier_name: '',
    donor_contact_id: '',
    donor_name: '',
    donor_kind: 'Particular',
    lender_name: '',
    beneficiary_id: beneficiaries[0]?.id || '',
    beneficiary_name: '',
    contact_document_id: '',
    contact_email: '',
    contact_phone: '',
    contact_address: '',
    inventory_item_mode: inventoryItems.length ? 'existing' : 'new',
    inventory_item_id: inventoryItems[0]?.id || '',
    inventory_name: '',
    inventory_category: 'Alimentos',
    inventory_lot: '',
    inventory_expires_at: '',
    inventory_location: '',
    inventory_unit: 'unidades',
    inventory_unit_value: '',
    inventory_low_stock_threshold: 0,
    quantity: 1,
    loan_id: initialLoan?.id || '',
    debt_id: initialDebt?.id || '',
    from_account_id: accounts[0]?.id || '',
    to_account_id: accounts[1]?.id || '',
    target_movement_id: activeMovements[0]?.id || '',
    correction_reason: '',
    void_reason: '',
    due_at: '',
    document_type: initialDocumentType,
    document_number: initialDocumentType === 'internal_document' ? nextAccountingInternalDocumentNumber(data) : '',
    document_name: '',
    document_data_url: '',
    document_notes: '',
    notes: '',
    responsible,
    allow_negative_balance: false
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const operation = OPERATION_TYPES.find((item) => item.value === form.operation_type) || OPERATION_TYPES[0];
  const OperationIcon = operation.icon;
  const selectedMovement = activeMovements.find((row) => row.id === form.target_movement_id);
  const selectedLoan = pendingLoans.find((loan) => loan.id === form.loan_id);
  const selectedDebt = pendingDebts.find((debt) => debt.id === form.debt_id);
  const needsAccount = ACCOUNT_OPERATION_TYPES.has(form.operation_type);
  const needsInventory = INVENTORY_OPERATION_TYPES.has(form.operation_type);
  const needsAmount = form.operation_type !== 'void' && form.operation_type !== 'donation_in_kind';
  const cannotSubmit = (needsAccount && !accounts.length)
    || (form.operation_type === 'transfer' && accounts.length < 2)
    || (form.operation_type === 'loan_repayment' && !pendingLoans.length)
    || (form.operation_type === 'debt_payment' && !pendingDebts.length)
    || (form.operation_type === 'correction' && !correctableMovements.length)
    || (form.operation_type === 'void' && !activeMovements.length);

  function update(field, value) {
    setForm((state) => (typeof field === 'object' ? { ...state, ...field } : { ...state, [field]: value }));
  }

  function changeOperationType(value) {
    const nextDocumentType = defaultDocumentTypeForOperation(value);
    setForm((state) => ({
      ...state,
      operation_type: value,
      document_type: nextDocumentType,
      document_number: nextDocumentType === 'internal_document' ? nextAccountingInternalDocumentNumber(data, state.operation_at) : '',
      reference: value === 'donation_money' ? nextAccountingDonationReference(data, state.operation_at) : '',
      concept: '',
      amount: value === 'loan_repayment' ? pendingLoans[0]?.outstanding || '' : value === 'debt_payment' ? pendingDebts[0]?.outstanding || '' : value === 'donation_in_kind' ? '' : state.amount,
      loan_id: pendingLoans[0]?.id || state.loan_id,
      debt_id: pendingDebts[0]?.id || state.debt_id,
      target_movement_id: value === 'correction' ? correctableMovements[0]?.id || '' : value === 'void' ? activeMovements[0]?.id || '' : state.target_movement_id
    }));
  }

  useEffect(() => {
    if (!DONATION_OPERATION_TYPES.has(form.operation_type)) return;
    const normalizedType = normalizeDonationDocumentType(form.document_type);
    if (normalizedType === form.document_type) return;
    update({
      document_type: normalizedType,
      document_number: normalizedType === 'internal_document' ? nextAccountingInternalDocumentNumber(data, form.operation_at) : ''
    });
  }, [data, form.document_type, form.operation_at, form.operation_type]);

  useEffect(() => {
    if (form.operation_type !== 'donation_money') return;
    const nextReference = nextAccountingDonationReference(data, form.operation_at);
    if (form.reference === nextReference) return;
    update('reference', nextReference);
  }, [data, form.operation_at, form.operation_type, form.reference]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (form.operation_type === 'void') {
        if (!selectedMovement) throw new Error('Selecciona un movimiento para anular.');
        await onVoid(selectedMovement.raw, form.void_reason);
      } else if (form.operation_type === 'correction') {
        if (!selectedMovement) throw new Error('Selecciona un movimiento para corregir.');
        await onCorrect(selectedMovement.raw, {
          financial_account_id: selectedMovement.raw.financial_account_id,
          movement_datetime: `${form.operation_at}T09:00`,
          amount: Number(form.amount || selectedMovement.raw.amount || 0),
          reason: form.concept || selectedMovement.raw.notes || selectedMovement.concept,
          reference: form.reference,
          payment_method: form.payment_method,
          document_name: form.document_name,
          document_data_url: form.document_data_url,
          document_type: form.document_type || defaultDocumentTypeForMovement(selectedMovement.raw.movement_type),
          document_number: form.document_number,
          document_notes: form.document_notes,
          correction_reason: form.correction_reason,
          allow_negative_balance: form.allow_negative_balance
        });
      } else {
        if ((form.operation_type === 'donation_money' || form.operation_type === 'donation_in_kind') && !String(form.donor_name || '').trim()) {
          throw new Error('Selecciona o crea un donante antes de registrar la donación.');
        }
        const donationUnitValue = form.operation_type === 'donation_in_kind'
          ? resolveDonationUnitValue(form, inventoryItems, inventoryUnitValues)
          : null;
        if (form.operation_type === 'donation_in_kind' && donationUnitValue === null) {
          throw new Error('Indica el valor unitario estimado de la donación en especie.');
        }
        const computedAmount = donationUnitValue === null
          ? Number(form.amount || 0)
          : roundCurrency(Number(form.quantity || 0) * donationUnitValue);
        await onSubmit({
          ...form,
          amount: computedAmount,
          inventory_unit_value: donationUnitValue ?? Number(form.inventory_unit_value || 0),
          quantity: Number(form.quantity || 0),
          inventory_low_stock_threshold: Number(form.inventory_low_stock_threshold || 0)
        });
      }
    } catch (submitError) {
      setError(submitError.message || 'No se pudo registrar la operación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <FormError message={error} />
      <div className={`flex items-start gap-3 rounded-md p-4 sm:col-span-2 ${operation.tone}`}>
        <span className="rounded-md bg-white/70 p-2"><OperationIcon size={21} /></span>
        <div>
          <p className="text-sm font-bold uppercase tracking-wide">{contextLabel}</p>
          <p className="mt-1 text-lg font-bold text-ink">{operation.label}</p>
        </div>
      </div>

      <FormField label="Tipo de operación" required>
        <select className={inputClass} required value={form.operation_type} onChange={(event) => changeOperationType(event.target.value)}>
          {OPERATION_TYPES.filter((item) => item.value !== 'void' || isSuperadmin).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </FormField>
      <FormField label="Fecha" required><input className={inputClass} type="date" required value={form.operation_at} onChange={(event) => update({
        operation_at: event.target.value,
        document_number: form.document_type === 'internal_document' ? nextAccountingInternalDocumentNumber(data, event.target.value) : form.document_number,
        reference: form.operation_type === 'donation_money' ? nextAccountingDonationReference(data, event.target.value) : form.reference
      })} /></FormField>

      {cannotSubmit && <OperationBlocker type={form.operation_type} />}

      {form.operation_type === 'transfer' ? (
        <>
          <AccountSelect label="Cuenta origen" accounts={accounts} value={form.from_account_id} onChange={(value) => update('from_account_id', value)} />
          <AccountSelect label="Cuenta destino" accounts={accounts} value={form.to_account_id} onChange={(value) => update('to_account_id', value)} />
        </>
      ) : needsAccount && (
        <AccountSelect label="Cuenta" accounts={accounts} value={form.financial_account_id} onChange={(value) => update('financial_account_id', value)} />
      )}

      {form.operation_type === 'loan_repayment' && (
        <FormField label="Préstamo pendiente" required>
          <select className={inputClass} required value={form.loan_id} onChange={(event) => {
            const loan = pendingLoans.find((item) => item.id === event.target.value);
            setForm((state) => ({ ...state, loan_id: event.target.value, amount: loan?.outstanding || state.amount }));
          }}>
            {pendingLoans.map((loan) => <option key={loan.id} value={loan.id}>{loan.reason} - {formatMoney(loan.outstanding)}</option>)}
          </select>
        </FormField>
      )}

      {form.operation_type === 'debt_payment' && (
        <FormField label="Deuda pendiente" required>
          <select className={inputClass} required value={form.debt_id} onChange={(event) => {
            const debt = pendingDebts.find((item) => item.id === event.target.value);
            setForm((state) => ({ ...state, debt_id: event.target.value, amount: debt?.outstanding || state.amount }));
          }}>
            {pendingDebts.map((debt) => <option key={debt.id} value={debt.id}>{debt.reason} - {formatMoney(debt.outstanding)}</option>)}
          </select>
        </FormField>
      )}

      {form.operation_type === 'correction' && (
        <MovementSelect label="Movimiento a corregir" rows={correctableMovements} value={form.target_movement_id} onChange={(value) => update('target_movement_id', value)} />
      )}

      {form.operation_type === 'void' && (
        <>
          <MovementSelect label="Movimiento a anular" rows={activeMovements} value={form.target_movement_id} onChange={(value) => update('target_movement_id', value)} />
          <div className="sm:col-span-2"><FormField label="Motivo de anulación" required><textarea className={inputClass} rows="3" required value={form.void_reason} onChange={(event) => update('void_reason', event.target.value)} /></FormField></div>
        </>
      )}

      {needsAmount && (
        <FormField label={amountLabelForOperation(form.operation_type)} required>
          <input className={inputClass} type="number" step="0.01" min="0.01" required value={form.amount} onChange={(event) => update('amount', event.target.value)} />
          {selectedLoan && form.operation_type === 'loan_repayment' && <p className="mt-1 text-xs text-slate-500">Pendiente: {formatMoney(selectedLoan.outstanding)}</p>}
          {selectedDebt && form.operation_type === 'debt_payment' && <p className="mt-1 text-xs text-slate-500">Pendiente: {formatMoney(selectedDebt.outstanding)}</p>}
        </FormField>
      )}

      {form.operation_type !== 'void' && (
        <FormField label={form.operation_type === 'transfer' ? 'Motivo' : 'Concepto'} required>
          <input className={inputClass} required value={form.concept} onChange={(event) => update('concept', event.target.value)} />
        </FormField>
      )}

      <ContactFields form={form} update={update} beneficiaries={beneficiaries} data={data} actions={actions} />

      {needsInventory && (
        <InventoryOperationFields form={form} update={update} items={inventoryItems} operationType={form.operation_type} inventoryUnitValues={inventoryUnitValues} />
      )}

      {form.operation_type === 'supplier_debt' && (
        <FormField label="Vencimiento"><input className={inputClass} type="date" value={form.due_at} onChange={(event) => update('due_at', event.target.value)} /></FormField>
      )}

      {form.operation_type !== 'void' && (
        <>
          {(needsAccount || form.operation_type === 'transfer' || form.operation_type === 'correction') && (
            <>
              <FormField label="Método"><select className={inputClass} value={form.payment_method} onChange={(event) => update('payment_method', event.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Bizum</option><option>PayPal</option><option>Otro</option></select></FormField>
              {form.operation_type === 'donation_money' ? (
                <FormField label="Referencia interna">
                  <input className={`${inputClass} bg-slate-50 text-slate-600`} readOnly value={form.reference} />
                </FormField>
              ) : (
                <FormField label="Referencia"><input className={inputClass} value={form.reference} onChange={(event) => update('reference', event.target.value)} /></FormField>
              )}
            </>
          )}
          {DONATION_OPERATION_TYPES.has(form.operation_type) ? (
            <DonationDocumentFields form={form} update={update} data={data} />
          ) : (
            <>
              <FormField label="Tipo de documento"><select className={inputClass} value={form.document_type} onChange={(event) => update('document_type', event.target.value)}><option value="invoice">Factura</option><option value="ticket">Ticket</option><option value="transfer">Transferencia</option><option value="bizum">Bizum</option><option value="paypal">PayPal</option><option value="receipt">Recibo</option><option value="internal_document">Documento interno</option><option value="no_document">Sin documento</option><option value="contract">Contrato</option><option value="proof">Justificante</option><option value="other">Otro</option></select></FormField>
              <FormField label="Número de documento"><input className={inputClass} value={form.document_number} onChange={(event) => update('document_number', event.target.value)} /></FormField>
            </>
          )}
          <FileAttachmentField form={form} setForm={setForm} />
          <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
        </>
      )}

      {form.operation_type === 'correction' && (
        <div className="sm:col-span-2"><FormField label="Motivo de corrección" required><textarea className={inputClass} rows="3" required value={form.correction_reason} onChange={(event) => update('correction_reason', event.target.value)} /></FormField></div>
      )}

      {isSuperadmin && (MONEY_OUT_OPERATION_TYPES.has(form.operation_type) || form.operation_type === 'transfer' || form.operation_type === 'correction') && <NegativeBalanceToggle form={form} setForm={setForm} />}

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={saving || cannotSubmit}>{saving ? 'Registrando...' : submitLabelForOperation(form.operation_type)}</Button>
      </div>
    </form>
  );
}

function DonationDocumentFields({ form, update, data }) {
  const selected = DONATION_DOCUMENT_TYPES.find((item) => item.value === form.document_type) || DONATION_DOCUMENT_TYPES[0];

  function changeDocumentType(value) {
    update({
      document_type: value,
      document_number: value === 'internal_document' ? nextAccountingInternalDocumentNumber(data, form.operation_at) : ''
    });
  }

  return (
    <>
      <FormField label="Tipo de documento">
        <select className={inputClass} value={selected.value} onChange={(event) => changeDocumentType(event.target.value)}>
          {DONATION_DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </FormField>
      {selected.numberLabel && (
        <FormField label={selected.numberLabel}>
          <input
            className={`${inputClass} ${selected.readOnly ? 'bg-slate-50 text-slate-600' : ''}`}
            readOnly={selected.readOnly}
            value={form.document_number}
            onChange={(event) => update('document_number', event.target.value)}
          />
        </FormField>
      )}
    </>
  );
}

function CashBankWorkspace({ report, canCreate, canEdit, canDelete, canDeleteDirectly, onOpen }) {
  const cashAccounts = report.financialAccounts.filter(isCashAccount);
  const bankAccounts = report.financialAccounts.filter((account) => !isCashAccount(account));

  return (
    <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Caja y bancos</p>
          <h3 className="text-xl font-bold text-ink">Operativa cerrada para efectivo, cuentas y transferencias</h3>
          <p className="mt-1 text-sm text-slate-600">Los movimientos actualizan saldo, crean evento contable y quedan registrados en auditoría.</p>
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
            emptyText="No hay cajas creadas todavía."
            canEdit={canEdit}
            canDelete={canDelete}
            canDeleteDirectly={canDeleteDirectly}
            onOpen={onOpen}
          />
          <AccountColumn
            title="Bancos"
            accounts={bankAccounts}
            emptyText="No hay cuentas bancarias creadas todavía."
            canEdit={canEdit}
            canDelete={canDelete}
            canDeleteDirectly={canDeleteDirectly}
            onOpen={onOpen}
          />
        </div>

        <div className="rounded-md border border-slate-200">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h4 className="font-bold text-ink">Movimientos de Caja y Bancos</h4>
                <p className="text-sm text-slate-500">Línea temporal única, incluyendo activos, corregidos y anulados.</p>
              </div>
            </div>
          </div>
          <CashBankTimeline
            rows={report.cashBankTimeline}
          />
        </div>
      </div>
    </section>
  );
}

function AccountColumn({ title, accounts, emptyText, canEdit, canDelete, canDeleteDirectly, onOpen }) {
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
                {canDelete && <Button variant="danger" onClick={() => onOpen({ type: 'delete-account', item: account })}>{canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación'}</Button>}
              </div>
            )}
          </article>
        ))}
        {!accounts.length && <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</p>}
      </div>
    </section>
  );
}

function CashBankTimeline({ rows }) {
  if (!rows.length) {
    return <div className="p-4"><EmptyState icon={ClipboardList} title="No hay movimientos de Caja o Bancos." detail="Crea una caja o cuenta bancaria y registra la primera operación." /></div>;
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-3 text-slate-600">{row.created_at ? formatDateTime(row.created_at) : formatDate(row.date)}</td>
              <td className="py-3 font-semibold text-ink">{row.accountName}</td>
              <td className="py-3"><TypeBadge type={row.type} /></td>
              <td className="max-w-[280px] py-3 text-slate-700">{row.concept}</td>
              <td className={`py-3 font-bold ${row.direction === 'out' ? 'text-red-700' : 'text-emerald-700'}`}>{formatMovementAmount(row)}</td>
              <td className="py-3"><StatusBadge status={statusLabel(row.status)} /></td>
              <td className="py-3 text-slate-600">{row.userName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoansDebtsWorkspace({ report, canCreate, onOpenOperation }) {
  const loans = report.loanSummaries || [];
  const debts = report.debtSummaries || [];
  const firstPendingLoan = loans.find((loan) => loan.outstanding > 0);
  const firstPendingDebt = debts.find((debt) => debt.outstanding > 0);
  const contactCards = [...(report.loanContactCards || []), ...(report.debtContactCards || [])];

  return (
    <section className="mt-6 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Préstamos y deudas</p>
          <h3 className="text-xl font-bold text-ink">Compromisos calculados automáticamente</h3>
          <p className="mt-1 text-sm text-slate-600">Importe recibido, devuelto, pagado y pendiente se derivan del historial de movimientos activos.</p>
        </div>
        {canCreate ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Button variant="secondary" onClick={() => onOpenOperation({ operationType: 'loan_received', title: 'Registrar préstamo', contextLabel: 'Préstamos y deudas' })}>
              <HandCoins size={17} /> Registrar préstamo
            </Button>
            <Button
              variant="secondary"
              disabled={!firstPendingLoan}
              title={!firstPendingLoan ? 'No hay préstamos pendientes de devolver.' : ''}
              onClick={() => firstPendingLoan && onOpenOperation({ operationType: 'loan_repayment', loanId: firstPendingLoan.id, title: 'Registrar devolución de préstamo', contextLabel: 'Préstamos y deudas' })}
            >
              <RefreshCw size={17} /> Registrar devolución
            </Button>
            <Button variant="secondary" onClick={() => onOpenOperation({ operationType: 'supplier_debt', title: 'Registrar deuda', contextLabel: 'Préstamos y deudas' })}>
              <Receipt size={17} /> Registrar deuda
            </Button>
            <Button
              variant="secondary"
              disabled={!firstPendingDebt}
              title={!firstPendingDebt ? 'No hay deudas pendientes de pagar.' : ''}
              onClick={() => firstPendingDebt && onOpenOperation({ operationType: 'debt_payment', debtId: firstPendingDebt.id, title: 'Registrar pago de deuda', contextLabel: 'Préstamos y deudas' })}
            >
              <RefreshCw size={17} /> Registrar pago de deuda
            </Button>
          </div>
        ) : (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Modo consulta</span>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <CommitmentColumn
          title="Préstamos"
          icon={HandCoins}
          rows={loans}
          emptyTitle="No hay préstamos registrados."
          emptyDetail="Cuando registres un préstamo desde este bloque aparecerá aquí con su saldo."
          canCreate={canCreate}
          actionLabel="Registrar devolución"
          onAction={(loan) => onOpenOperation({ operationType: 'loan_repayment', loanId: loan.id, title: 'Registrar devolución de préstamo', contextLabel: 'Préstamos y deudas' })}
          renderMeta={(loan) => (
            <>
              <MetricPill label="Importe original" value={formatMoney(loan.principal)} />
              <MetricPill label="Devuelto" value={formatMoney(loan.repaid)} />
              <MetricPill label="Pendiente" value={formatMoney(loan.outstanding)} strong />
            </>
          )}
        />
        <CommitmentColumn
          title="Deudas"
          icon={Receipt}
          rows={debts}
          emptyTitle="No hay deudas registradas."
          emptyDetail="Las deudas con proveedor o persona se registran desde este bloque."
          canCreate={canCreate}
          actionLabel="Registrar pago"
          onAction={(debt) => onOpenOperation({ operationType: 'debt_payment', debtId: debt.id, title: 'Registrar pago de deuda', contextLabel: 'Préstamos y deudas' })}
          renderMeta={(debt) => (
            <>
              <MetricPill label="Importe original" value={formatMoney(debt.original)} />
              <MetricPill label="Pagado" value={formatMoney(debt.paid)} />
              <MetricPill label="Saldo" value={formatMoney(debt.outstanding)} strong />
            </>
          )}
        />
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Ficha del contacto</p>
            <h4 className="font-bold text-ink">Prestamistas, proveedores y personas vinculadas</h4>
          </div>
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{contactCards.length}</span>
        </div>
        {contactCards.length ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {contactCards.map((contact) => (
              <ContactCommitmentCard key={contact.key} contact={contact} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Building2} title="No hay fichas con compromisos." detail="Al crear préstamos o deudas, cada contacto tendrá su resumen e historial." />
        )}
      </div>
    </section>
  );
}

function CommitmentColumn({ title, icon: Icon, rows, emptyTitle, emptyDetail, canCreate, actionLabel, onAction, renderMeta }) {
  return (
    <section className="rounded-md border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 p-2 text-slate-700"><Icon size={18} /></span>
          <h4 className="font-bold text-ink">{title}</h4>
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{rows.length}</span>
      </div>
      {rows.length ? (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article key={row.id} className={`rounded-md border p-4 ${row.outstanding > 0 ? 'border-slate-200 bg-white' : 'border-emerald-100 bg-emerald-50'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{row.reason}</p>
                    <StatusBadge status={row.statusLabel} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{row.contactName} - {formatDate(row.date)}</p>
                  {row.dueAt && (
                    <p className={`mt-1 text-xs font-semibold ${row.isOverdue ? 'text-red-700' : 'text-slate-500'}`}>
                      Vence: {formatDate(row.dueAt)}
                    </p>
                  )}
                </div>
                {canCreate && row.outstanding > 0 && (
                  <Button variant="secondary" onClick={() => onAction(row)}><RefreshCw size={16} /> {actionLabel}</Button>
                )}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {renderMeta(row)}
              </div>
              {row.history.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Historial completo</p>
                  <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto pr-1 text-xs text-slate-600">
                    {row.history.map((item) => (
                      <p key={item.key}>{formatDate(item.date)} - {item.label} - {formatMoney(item.amount)}</p>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Icon} title={emptyTitle} detail={emptyDetail} />
      )}
    </section>
  );
}

function MetricPill({ label, value, strong = false }) {
  return (
    <div className={`rounded-md px-3 py-2 ${strong ? 'bg-ink text-white' : 'bg-slate-50 text-slate-700'}`}>
      <p className={`text-xs font-bold uppercase ${strong ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function ContactCommitmentCard({ contact }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{contact.kind}</p>
          <h5 className="mt-1 font-bold text-ink">{contact.name}</h5>
        </div>
        <span className={`rounded-md p-2 ${contact.tone}`}><contact.icon size={18} /></span>
      </div>
      <div className="mt-4 grid gap-2">
        {contact.metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{metric.label}</span>
            <strong className="text-ink">{metric.value}</strong>
          </div>
        ))}
      </div>
      {contact.history.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-bold uppercase text-slate-500">Historial completo</p>
          <div className="mt-2 grid max-h-40 gap-1 overflow-y-auto pr-1 text-xs text-slate-600">
            {contact.history.map((item) => (
              <p key={item.key}>{formatDate(item.date)} - {item.label} - {formatMoney(item.amount)}</p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function OperationBlocker({ type }) {
  const messages = {
    transfer: 'Necesitas al menos dos cuentas activas para transferir.',
    loan_repayment: 'No hay préstamos pendientes para devolver.',
    debt_payment: 'No hay deudas pendientes para pagar.',
    correction: 'No hay movimientos activos corregibles.',
    void: 'No hay movimientos activos para anular.'
  };
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 sm:col-span-2">
      {messages[type] || 'Crea primero una cuenta activa de Caja o Banco.'}
    </div>
  );
}

function AccountSelect({ label, accounts, value, onChange }) {
  return (
    <FormField label={label} required>
      <select className={inputClass} required value={value} onChange={(event) => onChange(event.target.value)}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {formatMoney(account.current_balance)}</option>)}
      </select>
    </FormField>
  );
}

function MovementSelect({ label, rows, value, onChange }) {
  return (
    <div className="sm:col-span-2">
      <FormField label={label} required>
        <select className={inputClass} required value={value} onChange={(event) => onChange(event.target.value)}>
          {rows.map((row) => <option key={row.id} value={row.id}>{formatDate(row.date)} - {row.accountName} - {row.type} - {formatMoney(row.amount)}</option>)}
        </select>
      </FormField>
    </div>
  );
}

function ContactFields({ form, update, beneficiaries, data, actions }) {
  if (form.operation_type === 'income') {
    return <FormField label="Persona u origen"><input className={inputClass} value={form.contact_name} onChange={(event) => update('contact_name', event.target.value)} /></FormField>;
  }
  if (form.operation_type === 'expense' || form.operation_type === 'inventory_purchase' || form.operation_type === 'supplier_debt') {
    return (
      <>
        <FormField label="Proveedor" required><input className={inputClass} required value={form.supplier_name} onChange={(event) => update('supplier_name', event.target.value)} /></FormField>
        <FormField label="Documento proveedor"><input className={inputClass} value={form.contact_document_id} onChange={(event) => update('contact_document_id', event.target.value)} /></FormField>
      </>
    );
  }
  if (form.operation_type === 'donation_money' || form.operation_type === 'donation_in_kind') {
    return <DonorSelector form={form} update={update} contacts={data.accounting_contacts || []} actions={actions} />;
  }
  if (form.operation_type === 'loan_received') {
    return (
      <>
        <FormField label="Prestamista" required><input className={inputClass} required value={form.lender_name} onChange={(event) => update('lender_name', event.target.value)} /></FormField>
        <FormField label="Documento prestamista"><input className={inputClass} value={form.contact_document_id} onChange={(event) => update('contact_document_id', event.target.value)} /></FormField>
      </>
    );
  }
  if (form.operation_type === 'economic_help') {
    return (
      <>
        <FormField label="Beneficiario">
          <select className={inputClass} value={form.beneficiary_id} onChange={(event) => update('beneficiary_id', event.target.value)}>
            <option value="">Sin ficha vinculada</option>
            {beneficiaries.map((beneficiary) => <option key={beneficiary.id} value={beneficiary.id}>{beneficiary.full_name}</option>)}
          </select>
        </FormField>
        {!form.beneficiary_id && <FormField label="Nombre beneficiario" required><input className={inputClass} required value={form.beneficiary_name} onChange={(event) => update('beneficiary_name', event.target.value)} /></FormField>}
      </>
    );
  }
  return null;
}

function DonorSelector({ form, update, contacts, actions }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdDonors, setCreatedDonors] = useState([]);
  const donors = useMemo(() => {
    const byId = new Map();
    [...(contacts || []), ...createdDonors]
      .filter((contact) => normalize(contact.contact_type) === 'donor')
      .forEach((contact) => byId.set(contact.id, contact));
    return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [contacts, createdDonors]);
  const filteredDonors = donors.filter((donor) => normalize([
    donor.name,
    donor.email,
    donor.phone,
    donor.address,
    donor.notes
  ].join(' ')).includes(normalize(query)));
  const selectedDonor = donors.find((donor) => donor.id === form.donor_contact_id) || null;

  function selectDonor(donorId) {
    const donor = donors.find((item) => item.id === donorId);
    if (!donor) {
      update({
        donor_contact_id: '',
        donor_name: '',
        donor_kind: 'Particular',
        contact_document_id: '',
        contact_email: '',
        contact_phone: '',
        contact_address: ''
      });
      return;
    }
    const meta = accountingDonorMetadata(donor);
    update({
      donor_contact_id: donor.id,
      donor_name: donor.name || '',
      donor_kind: meta.kind || inferAccountingDonorKind(donor.name),
      contact_document_id: donor.document_id || '',
      contact_email: donor.email || '',
      contact_phone: donor.phone || '',
      contact_address: donor.address || ''
    });
  }

  async function createDonor(payload) {
    const notes = buildAccountingDonorNotes({
      observations: payload.notes,
      kind: payload.kind,
      contactPerson: payload.contact_person
    });
    const donor = await actions.createDonorContact({
      name: payload.name,
      document_id: payload.document_id,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      notes,
      is_active: true
    });
    setCreatedDonors((current) => current.some((item) => item.id === donor.id) ? current : [...current, donor]);
    setCreating(false);
    setQuery(donor.name || '');
    selectCreatedDonor(donor);
  }

  function selectCreatedDonor(donor) {
    const meta = accountingDonorMetadata(donor);
    update({
      donor_contact_id: donor.id,
      donor_name: donor.name || '',
      donor_kind: meta.kind || inferAccountingDonorKind(donor.name),
      contact_document_id: donor.document_id || '',
      contact_email: donor.email || '',
      contact_phone: donor.phone || '',
      contact_address: donor.address || ''
    });
  }

  return (
    <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
        <FormField label="Buscar donante" required>
          <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, teléfono, email o dirección" />
        </FormField>
        <FormField label="Seleccionar" required>
          <select className={inputClass} required value={form.donor_contact_id || ''} onChange={(event) => selectDonor(event.target.value)}>
            <option value="">Selecciona un donante</option>
            {filteredDonors.map((donor) => <option key={donor.id} value={donor.id}>{donor.name}</option>)}
          </select>
        </FormField>
        <Button className="h-10 px-3" onClick={() => setCreating(true)} title="Nuevo donante"><Plus size={18} /><span className="sr-only">Nuevo donante</span></Button>
      </div>
      {!filteredDonors.length && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">No hay donantes con esa búsqueda. Usa el botón + para crear la ficha completa.</p>
      )}
      {selectedDonor && (
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-5">
          <ReadOnlyDonorField label="Tipo" value={form.donor_kind} />
          <ReadOnlyDonorField label="Contacto" value={accountingDonorMetadata(selectedDonor).contactPerson} />
          <ReadOnlyDonorField label="Teléfono" value={form.contact_phone} />
          <ReadOnlyDonorField label="Email" value={form.contact_email} />
          <ReadOnlyDonorField label="Dirección" value={form.contact_address} />
        </div>
      )}
      {creating && (
        <div className="mt-4 rounded-md border border-brand-100 bg-white p-4">
          <DonorQuickForm onCancel={() => setCreating(false)} onSubmit={createDonor} />
        </div>
      )}
    </div>
  );
}

function ReadOnlyDonorField({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-slate-700">{value || '-'}</p>
    </div>
  );
}

function DonorQuickForm({ onCancel, onSubmit }) {
  const [form, setForm] = useState({ name: '', kind: 'Particular', contact_person: '', document_id: '', phone: '', email: '', address: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (field, value) => {
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
  };
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(submitError.message || 'No se pudo guardar el donante.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:col-span-2">{error}</div>}
      <div className="sm:col-span-2"><FormField label="Nombre del donante" required><input className={inputClass} required value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField></div>
      <FormField label="Tipo"><select className={inputClass} value={form.kind} onChange={(event) => update('kind', event.target.value)}><option>Particular</option><option>Empresa</option><option>Iglesia</option><option>Asociación</option><option>Fundación</option><option>Administración</option><option>Entidad</option><option>Anónimo</option></select></FormField>
      <FormField label="Persona de contacto"><input className={inputClass} value={form.contact_person} onChange={(event) => update('contact_person', event.target.value)} /></FormField>
      <FormField label="Documento / CIF"><input className={inputClass} value={form.document_id} onChange={(event) => update('document_id', event.target.value)} /></FormField>
      <FormField label="Teléfono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
      <div className="sm:col-span-2"><FormField label="Dirección"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField></div>
      <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar y seleccionar'}</Button>
      </div>
    </form>
  );
}

function InventoryOperationFields({ form, update, items, operationType, inventoryUnitValues }) {
  const selectedItem = items.find((item) => item.id === form.inventory_item_id);
  const showNewItem = form.inventory_item_mode === 'new' || !items.length;
  const matchedExistingItem = showNewItem ? findInventoryItemByNameAndLot(items, form.inventory_name, form.inventory_lot) : null;
  const valueSourceItem = showNewItem ? matchedExistingItem : selectedItem;
  const automaticUnitValue = valueSourceItem ? positiveNumberOrNull(inventoryUnitValues.get(valueSourceItem.id)) : null;
  const typedUnitValue = positiveNumberOrNull(form.inventory_unit_value);
  const effectiveUnitValue = automaticUnitValue ?? typedUnitValue;
  const estimatedTotal = effectiveUnitValue !== null && positiveNumberOrNull(form.quantity) !== null
    ? roundCurrency(Number(form.quantity || 0) * effectiveUnitValue)
    : null;
  const needsSocialValue = operationType === 'donation_in_kind';
  const mustAskUnitValue = needsSocialValue && automaticUnitValue === null;
  return (
    <>
      <FormField label="Producto" required>
        <select className={inputClass} required value={showNewItem ? 'new' : form.inventory_item_id} onChange={(event) => {
          if (event.target.value === 'new') update({ inventory_item_mode: 'new', inventory_item_id: '', inventory_unit_value: '' });
          else {
            const nextUnitValue = positiveNumberOrNull(inventoryUnitValues.get(event.target.value));
            update({
              inventory_item_mode: 'existing',
              inventory_item_id: event.target.value,
              inventory_unit_value: nextUnitValue ?? ''
            });
          }
        }}>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.lot ? ` - ${item.lot}` : ''} - {item.stock} {item.unit}</option>)}
          <option value="new">Nuevo producto o lote</option>
        </select>
      </FormField>
      <FormField label="Cantidad" required>
        <input className={inputClass} type="number" step="0.01" min="0.01" required value={form.quantity} onChange={(event) => update('quantity', event.target.value)} />
        {selectedItem && !showNewItem && <p className="mt-1 text-xs text-slate-500">Unidad: {selectedItem.unit}</p>}
      </FormField>
      {showNewItem && (
        <>
          <FormField label="Nombre producto" required><input className={inputClass} required value={form.inventory_name} onChange={(event) => update('inventory_name', event.target.value)} /></FormField>
          <FormField label="Categoria" required><input className={inputClass} required value={form.inventory_category} onChange={(event) => update('inventory_category', event.target.value)} /></FormField>
          <FormField label="Lote"><input className={inputClass} value={form.inventory_lot} onChange={(event) => update('inventory_lot', event.target.value)} /></FormField>
          <FormField label="Caducidad"><input className={inputClass} type="date" value={form.inventory_expires_at} onChange={(event) => update('inventory_expires_at', event.target.value)} /></FormField>
          <FormField label="Ubicacion"><input className={inputClass} value={form.inventory_location} onChange={(event) => update('inventory_location', event.target.value)} /></FormField>
          <FormField label="Unidad" required><input className={inputClass} required value={form.inventory_unit} onChange={(event) => update('inventory_unit', event.target.value)} /></FormField>
          <FormField label="Stock minimo"><input className={inputClass} type="number" step="0.01" min="0" value={form.inventory_low_stock_threshold} onChange={(event) => update('inventory_low_stock_threshold', event.target.value)} /></FormField>
        </>
      )}
      {needsSocialValue && (
        <>
          {matchedExistingItem && (
            <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-900 sm:col-span-2">
              {matchedExistingItem.name}{matchedExistingItem.lot ? ` - ${matchedExistingItem.lot}` : ''} ya existe. Se actualizara su stock.
            </div>
          )}
          {automaticUnitValue !== null ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <p className="text-xs font-bold uppercase text-slate-500">Valor unitario estimado</p>
              <p className="mt-1 text-lg font-bold text-ink">{formatMoney(automaticUnitValue)} / {valueSourceItem?.unit || form.inventory_unit || 'unidad'}</p>
            </div>
          ) : (
            <FormField label="Valor unitario estimado" required>
              <input className={inputClass} type="number" step="0.01" min="0.01" required={mustAskUnitValue} value={form.inventory_unit_value} onChange={(event) => update('inventory_unit_value', event.target.value)} />
            </FormField>
          )}
          <div className="rounded-md border border-slate-200 bg-white p-3 sm:col-span-2">
            <p className="text-xs font-bold uppercase text-slate-500">Valor total estimado</p>
            <p className="mt-1 text-lg font-bold text-cyan-800">{estimatedTotal !== null ? formatMoney(estimatedTotal) : 'Pendiente de valorar'}</p>
          </div>
        </>
      )}
    </>
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
      <FormField label="Número de cuenta"><input className={inputClass} value={form.account_number || ''} onChange={(event) => updateForm(setForm, 'account_number', event.target.value)} /></FormField>
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
      <FormField label="Método"><select className={inputClass} value={form.payment_method} onChange={(event) => updateForm(setForm, 'payment_method', event.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Bizum</option><option>PayPal</option><option>Otro</option></select></FormField>
      <div className="sm:col-span-2"><FormField label="Motivo" required><textarea className={inputClass} rows="3" required value={form.reason} onChange={(event) => updateForm(setForm, 'reason', event.target.value)} /></FormField></div>
      <FormField label="Referencia"><input className={inputClass} value={form.reference} onChange={(event) => updateForm(setForm, 'reference', event.target.value)} /></FormField>
      <FileAttachmentField form={form} setForm={setForm} />
      {isCorrection && <div className="sm:col-span-2"><FormField label="Motivo de corrección" required><textarea className={inputClass} rows="3" required value={form.correction_reason} onChange={(event) => updateForm(setForm, 'correction_reason', event.target.value)} /></FormField></div>}
      {isSuperadmin && movementType.endsWith('_out') && <NegativeBalanceToggle form={form} setForm={setForm} />}
      <div className="flex justify-end sm:col-span-2"><Button type="submit">{isCorrection ? 'Guardar corrección' : 'Registrar movimiento'}</Button></div>
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
        Vas a anular el movimiento {movementTypeLabel(movement.movement_type)} por {formatMoney(movement.amount)}. El saldo de la cuenta se revertirá automáticamente.
      </div>
      <FormField label="Motivo de anulación" required><textarea className={inputClass} rows="4" required value={reason} onChange={(event) => setReason(event.target.value)} /></FormField>
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
        Solo se eliminará si no tiene movimientos ni eventos relacionados. Si ya fue usada, el sistema bloqueará la eliminación.
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

function AlertCard({ alert, onOpen }) {
  const Icon = alert.icon;
  const className = `rounded-md border p-4 text-left transition ${alert.target ? 'hover:-translate-y-0.5 hover:shadow-panel' : ''} ${alert.tone}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-ink">{alert.title}</h4>
          <p className="mt-1 text-sm text-slate-600">{alert.detail}</p>
        </div>
        <Icon size={21} />
      </div>
    </>
  );
  if (alert.target) {
    return <button type="button" className={className} onClick={() => onOpen?.(alert.target)}>{content}</button>;
  }
  return (
    <article className={className}>
      {content}
    </article>
  );
}

function buildFinancialAccountDeletionRelations(account, data) {
  const relations = [];
  const movements = (data.cash_bank_movements || []).filter((movement) => movement.financial_account_id === account?.id);
  const events = (data.accounting_events || []).filter((event) => event.financial_account_id === account?.id);
  if (account?.current_balance || account?.opening_balance) relations.push(`Saldo: ${formatMoney(account.current_balance ?? account.opening_balance)}`);
  if (movements.length) relations.push(`Movimientos: ${movements.length}`);
  if (events.length) relations.push(`Eventos contables: ${events.length}`);
  if (account?.iban) relations.push('IBAN registrado');
  return relations;
}

function sectionForAccountingFilter(filter) {
  const normalized = normalize(filter);
  if (['pending-loans', 'overdue-debts', 'upcoming-debt-payments', 'pending-debts', 'loans-debts'].includes(normalized)) return 'loansDebts';
  if (['cash-bank', 'cash', 'bank', 'bank-reconciliation', 'cash-imbalance'].includes(normalized)) return 'cashBank';
  if (['pending-documents', 'pending-invoices', 'timeline', 'movements'].includes(normalized)) return 'timeline';
  if (['treasury', 'legacy-treasury', 'historical-treasury'].includes(normalized)) return 'treasury';
  if (['alerts', 'economic-alerts'].includes(normalized)) return 'alerts';
  return '';
}

function operationModalTitle(operationType) {
  const operation = OPERATION_TYPES.find((item) => item.value === operationType);
  return operation ? `Registrar ${operation.label.toLowerCase()}` : 'Nueva operación económica';
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
  const rawAccountingEvents = asArray(data.accounting_events);
  const rawCashBankMovements = asArray(data.cash_bank_movements);
  const rawSocialValueEvents = asArray(data.social_value_events);
  const rawDeliveries = asArray(data.deliveries);
  const rawInventoryItems = asArray(data.inventory_items);
  const eventsById = new Map(rawAccountingEvents.map((event) => [event.id, event]));

  const accountingEvents = activeRecords(rawAccountingEvents);
  const financialAccounts = activeRecords(asArray(data.financial_accounts));
  const cashBankMovements = activeRecords(rawCashBankMovements);
  const accountingDocuments = activeRecords(asArray(data.accounting_documents));
  const accountingContacts = asArray(data.accounting_contacts);
  const loanRecords = activeAccountingRecords(asArray(data.loan_records), eventsById);
  const loanRecordIds = new Set(loanRecords.map((loan) => loan.id));
  const loanMovements = activeAccountingRecords(asArray(data.loan_movements), eventsById).filter((movement) => loanRecordIds.has(movement.loan_id));
  const debtRecords = activeAccountingRecords(asArray(data.debt_records), eventsById);
  const debtRecordIds = new Set(debtRecords.map((debt) => debt.id));
  const debtMovements = activeAccountingRecords(asArray(data.debt_movements), eventsById).filter((movement) => debtRecordIds.has(movement.debt_id));
  const socialValueEvents = activeRecords(rawSocialValueEvents).filter((event) => !isVoided(eventsById.get(event.accounting_event_id)));
  const treasuryAccounts = activeRecords(asArray(data.treasury_accounts));
  const treasuryIncomes = activeRecords(asArray(data.treasury_incomes));
  const treasuryExpenses = activeRecords(asArray(data.treasury_expenses));
  const treasuryLoans = activeRecords(asArray(data.treasury_loans));
  const donations = activeRecords(asArray(data.donations));
  const inventoryItems = activeRecords(rawInventoryItems);
  const inventoryItemsById = new Map(inventoryItems.map((item) => [item.id, item]));
  const inventoryUnitValues = buildInventoryUnitValueMap(inventoryItems, socialValueEvents);
  const contactsById = new Map(accountingContacts.map((contact) => [contact.id, contact]));
  const accountsById = new Map(financialAccounts.map((account) => [account.id, account]));
  const today = todayISO();
  const loanSummaries = buildLoanSummaries(loanRecords, loanMovements, contactsById, accountsById);
  const debtSummaries = buildDebtSummaries(debtRecords, debtMovements, contactsById, accountsById, today);
  const loanContactCards = buildLoanContactCards(loanSummaries);
  const debtContactCards = buildDebtContactCards(debtSummaries);

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
    ? loanSummaries.filter((loan) => loan.outstanding > 0)
    : treasuryLoans.filter(isPendingTreasuryLoan).map((loan) => ({ ...loan, outstanding: Number(loan.amount || 0) }));
  const pendingLoanAmount = sumBy(pendingLoanRows, (loan) => loan.outstanding);

  const pendingDebtRows = debtSummaries.filter((debt) => debt.outstanding > 0);
  const pendingDebtAmount = sumBy(pendingDebtRows, (debt) => debt.outstanding);
  const overdueDebtRows = debtSummaries.filter((debt) => debt.isOverdue);
  const upcomingDebtRows = debtSummaries.filter((debt) => debt.isUpcoming);
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

  const receivedSocialEvents = socialValueEvents.filter((item) => item.value_type === 'received');
  const deliveredSocialEvents = socialValueEvents.filter((item) => item.value_type === 'delivered');
  const representedDonationIds = sourceRecordIdSet(receivedSocialEvents, 'donations');
  const representedDeliveryIds = sourceRecordIdSet(deliveredSocialEvents, 'deliveries');
  const deliverySocialRows = buildDeliverySocialRows(
    activeRecords(rawDeliveries),
    inventoryItemsById,
    inventoryUnitValues,
    representedDeliveryIds
  );
  const socialReceivedFromEvents = sumBy(receivedSocialEvents, (item) => Number(item.amount || 0));
  const donationSocialReceived = sumBy(donations.filter((item) => !representedDonationIds.has(item.id)), (item) => Number(item.estimated_value || 0));
  const socialReceived = socialReceivedFromEvents + donationSocialReceived;
  const socialDelivered = sumBy(deliveredSocialEvents, (item) => Number(item.amount || 0)) + sumBy(deliverySocialRows, (item) => Number(item.amount || 0));

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
    deliverySocialRows,
    treasuryIncomes,
    treasuryExpenses,
    treasuryLoans,
    donations,
    representedDonationIds,
    contactsById,
    accountsById,
    eventsById,
    inventoryItemsById,
    inventoryUnitValues,
    firstMovementByEvent,
    useTreasuryFallback: usingTreasuryFallback
  });
  const cashBankTimeline = buildCashBankTimeline(rawCashBankMovements, eventsById, accountsById);

  const alerts = buildAlerts({
    pendingInvoices: pendingInvoiceCount,
    pendingLoanRows,
    pendingDebtRows,
    overdueDebtRows,
    upcomingDebtRows,
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
    overdueDebts: overdueDebtRows.length,
    upcomingDebtPayments: upcomingDebtRows.length,
    pendingInvoices: pendingInvoiceCount,
    pendingDebtAndInvoiceAmount: pendingDebtAmount + pendingInvoiceAmount,
    pendingDocuments,
    socialReceived,
    socialDelivered,
    socialBalance: socialReceived - socialDelivered,
    alerts,
    recentMovements,
    cashBankTimeline,
    loanSummaries,
    debtSummaries,
    loanContactCards,
    debtContactCards,
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
      socialEvents: receivedSocialEvents.length + donations.filter((item) => !representedDonationIds.has(item.id)).length
    }
  };
}

function buildAlerts({ pendingInvoices, pendingLoanRows, pendingDebtRows, overdueDebtRows, upcomingDebtRows, movementWithoutDocs, cashImbalances, unreconciledBanks }) {
  const alerts = [];
  if (pendingInvoices > 0) alerts.push({ title: 'Facturas pendientes', detail: `${pendingInvoices} facturas o tickets pendientes de adjuntar o revisar.`, icon: Receipt, tone: 'border-orange-200 bg-orange-50 text-orange-700', target: 'timeline' });
  if (pendingLoanRows.length > 0) alerts.push({ title: 'Préstamos pendientes', detail: `${pendingLoanRows.length} préstamos pendientes de devolver.`, icon: HandCoins, tone: 'border-violet-200 bg-violet-50 text-violet-700', target: 'loansDebts' });
  if (overdueDebtRows.length > 0) alerts.push({ title: 'Deudas vencidas', detail: `${overdueDebtRows.length} deudas han superado su fecha de vencimiento.`, icon: AlertTriangle, tone: 'border-red-200 bg-red-50 text-red-700', target: 'loansDebts' });
  if (upcomingDebtRows.length > 0) alerts.push({ title: 'Pagos proximos', detail: `${upcomingDebtRows.length} pagos vencen en los proximos 14 dias.`, icon: CalendarClock, tone: 'border-amber-200 bg-amber-50 text-amber-800', target: 'loansDebts' });
  if (pendingDebtRows.length > 0) alerts.push({ title: 'Deudas pendientes', detail: `${pendingDebtRows.length} deudas activas con saldo pendiente.`, icon: Building2, tone: 'border-red-200 bg-red-50 text-red-700', target: 'loansDebts' });
  if (movementWithoutDocs > 0) alerts.push({ title: 'Movimientos sin documento adjunto', detail: `${movementWithoutDocs} movimientos necesitan factura, ticket o justificante.`, icon: FileText, tone: 'border-slate-200 bg-slate-50 text-slate-700', target: 'timeline' });
  if (cashImbalances.length > 0) alerts.push({ title: 'Caja descuadrada', detail: `${cashImbalances.length} cajas requieren revisión de saldo.`, icon: Wallet, tone: 'border-red-200 bg-red-50 text-red-700', target: 'cashBank' });
  if (unreconciledBanks.length > 0) alerts.push({ title: 'Bancos sin conciliar', detail: `${unreconciledBanks.length} cuentas bancarias pendientes de conciliacion.`, icon: Landmark, tone: 'border-blue-200 bg-blue-50 text-blue-700', target: 'cashBank' });
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
    deliverySocialRows,
    treasuryIncomes,
    treasuryExpenses,
    treasuryLoans,
    donations,
    representedDonationIds,
    contactsById,
    accountsById,
    eventsById,
    inventoryItemsById,
    inventoryUnitValues,
    firstMovementByEvent,
    useTreasuryFallback
  } = context;
  const rows = [];
  const socialAccountingEventIds = new Set(socialValueEvents.map((event) => event.accounting_event_id).filter(Boolean));
  const commitmentAccountingEventIds = new Set([
    ...loanRecords.map((loan) => loan.accounting_event_id),
    ...loanMovements.map((movement) => movement.accounting_event_id),
    ...debtRecords.map((debt) => debt.accounting_event_id),
    ...debtMovements.map((movement) => movement.accounting_event_id)
  ].filter(Boolean));

  accountingEvents.forEach((event) => {
    if (event.event_type === 'donation_in_kind' && (socialAccountingEventIds.has(event.id) || event.source_module === 'donations')) return;
    if (commitmentAccountingEventIds.has(event.id)) return;
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
    const receivedMovement = loanMovements.find((movement) => movement.loan_id === loan.id && movement.movement_type === 'loan_received');
    const outstanding = loanOutstanding(loan, loanMovements);
    rows.push({
      key: `loan-${loan.id}`,
      date: loan.loan_at || loan.created_at,
      type: 'Préstamo',
      concept: loan.reason || loan.notes || 'Préstamo',
      contact: contactName(contactsById.get(loan.contact_id)),
      amount: Number(loan.principal_amount || 0),
      direction: 'in',
      status: loanDisplayStatus(Number(loan.principal_amount || 0), outstanding),
      method: accountMethod(accountsById.get(receivedMovement?.financial_account_id), receivedMovement?.movement_type)
    });
  });

  loanMovements.forEach((movement) => {
    if (movement.movement_type === 'loan_received') return;
    const loan = loanRecords.find((item) => item.id === movement.loan_id);
    rows.push({
      key: `loan-movement-${movement.id}`,
      date: movement.payment_at || movement.created_at,
      type: 'Devolución',
      concept: movement.notes || loan?.reason || 'Devolución de préstamo',
      contact: contactName(contactsById.get(loan?.contact_id)),
      amount: Number(movement.amount || 0),
      direction: movement.movement_type === 'loan_received' ? 'in' : 'out',
      status: statusLabel(movement.status),
      method: accountMethod(accountsById.get(movement.financial_account_id), movement.movement_type)
    });
  });

  debtRecords.forEach((debt) => {
    const outstanding = debtOutstanding(debt, debtMovements);
    rows.push({
      key: `debt-${debt.id}`,
      date: debt.debt_at || debt.created_at,
      type: 'Deuda',
      concept: debt.reason || debt.notes || 'Deuda',
      contact: contactName(contactsById.get(debt.contact_id)),
      amount: Number(debt.original_amount || 0),
      direction: 'neutral',
      status: debtDisplayStatus(Number(debt.original_amount || 0), outstanding),
      method: 'Pendiente'
    });
  });

  debtMovements.forEach((movement) => {
    const debt = debtRecords.find((item) => item.id === movement.debt_id);
    rows.push({
      key: `debt-movement-${movement.id}`,
      date: movement.payment_at || movement.created_at,
      type: 'Pago de deuda',
      concept: movement.notes || debt?.reason || 'Pago de deuda',
      contact: contactName(contactsById.get(debt?.contact_id)),
      amount: Number(movement.amount || 0),
      direction: 'out',
      status: statusLabel(movement.status),
      method: accountMethod(accountsById.get(movement.financial_account_id), movement.movement_type)
    });
  });

  socialValueEvents.forEach((event) => {
    const item = inventoryItemsById.get(event.inventory_item_id);
    const quantity = positiveNumberOrNull(event.quantity);
    const unitValue = socialEventUnitValue(event, inventoryUnitValues);
    rows.push({
      key: `social-${event.id}`,
      date: event.social_value_at || event.created_at,
      type: event.value_type === 'received' ? 'Valor social recibido' : 'Valor social entregado',
      concept: socialEventLabel(event),
      contact: contactName(contactsById.get(event.contact_id)),
      amount: Number(event.amount || 0),
      direction: 'social',
      status: statusLabel(event.status),
      method: event.event_type === 'in_kind_donation' ? 'Especie' : 'Valor social',
      product: item?.name || event.product_name || '',
      quantity,
      unit: event.unit || item?.unit || '',
      unitValue
    });
  });

  deliverySocialRows.forEach((row) => rows.push(row));

  if (useTreasuryFallback) {
    treasuryIncomes.forEach((income) => rows.push({
      key: `treasury-income-${income.id}`,
      date: income.income_at || income.created_at,
      type: 'Ingreso',
      concept: income.concept || income.category || 'Ingreso de tesorería',
      contact: income.donor || '-',
      amount: Number(income.amount || 0),
      direction: 'in',
      status: 'Registrado',
      method: income.payment_method || 'Tesorería'
    }));
    treasuryExpenses.forEach((expense) => rows.push({
      key: `treasury-expense-${expense.id}`,
      date: expense.expense_at || expense.created_at,
      type: 'Gasto',
      concept: expense.concept || expense.category || 'Gasto de tesorería',
      contact: expense.supplier || expense.responsible || '-',
      amount: Number(expense.amount || 0),
      direction: 'out',
      status: 'Registrado',
      method: 'Tesorería'
    }));
    treasuryLoans.forEach((loan) => rows.push({
      key: `treasury-loan-${loan.id}`,
      date: loan.loan_at || loan.created_at,
      type: 'Préstamo',
      concept: loan.concept || 'Préstamo',
      contact: loan.person || '-',
      amount: Number(loan.amount || 0),
      direction: isPendingTreasuryLoan(loan) ? 'in' : 'neutral',
      status: loan.status || 'Registrado',
      method: 'Tesorería'
    }));
  }

  donations.filter((donation) => !representedDonationIds.has(donation.id)).forEach((donation) => rows.push({
      key: `donation-social-${donation.id}`,
      date: donation.donated_at || donation.created_at,
      type: 'Donación en especie',
      concept: donation.donation_type || donation.notes || 'Donación en especie',
      contact: donation.donor || '-',
      amount: Number(donation.estimated_value || 0),
      direction: 'social',
      status: donation.status || donation.state || 'Registrada',
      method: 'Especie',
      product: donation.donation_type || ''
    }));

  return rows
    .filter((row) => row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function sourceRecordIdSet(events, moduleName) {
  const normalizedModule = normalize(moduleName);
  return new Set(events
    .filter((event) => event.source_record_id && normalize(event.source_module) === normalizedModule)
    .map((event) => event.source_record_id));
}

function buildDeliverySocialRows(deliveries, inventoryItemsById, inventoryUnitValues, representedDeliveryIds) {
  return deliveries
    .filter((delivery) => !representedDeliveryIds.has(delivery.id))
    .map((delivery) => {
      const item = inventoryItemsById.get(delivery.inventory_item_id);
      const value = deliveryValueDetails(delivery, item, inventoryUnitValues);
      return {
        key: `delivery-social-${delivery.id}`,
        date: delivery.delivered_at || delivery.created_at,
        type: 'Valor social entregado',
        concept: delivery.help_type || 'Ayuda entregada',
        contact: delivery.beneficiary_name || '-',
        amount: value.total || 0,
        direction: 'social',
        status: delivery.status || 'Activa',
        method: 'Entrega',
        product: delivery.inventory_item_name || item?.name || '',
        quantity: value.quantity,
        unit: item?.unit || delivery.unit || '',
        unitValue: value.unitValue,
        source_record_id: delivery.id
      };
    });
}

function deliveryValueDetails(delivery, item, inventoryUnitValues) {
  const quantity = positiveNumberOrNull(delivery.quantity);
  const explicitTotal = positiveNumberOrNull(delivery.estimated_total_value, delivery.total_value, delivery.estimated_value, delivery.value_amount);
  const smartDeliveryTotal = smartDeliveryNoteValue(delivery.notes, 'Valor aproximado lote');
  if (explicitTotal !== null) {
    return {
      total: explicitTotal,
      quantity,
      unitValue: quantity !== null ? roundCurrency(explicitTotal / quantity) : null
    };
  }
  if (smartDeliveryTotal !== null) {
    return {
      total: smartDeliveryTotal,
      quantity,
      unitValue: quantity !== null ? roundCurrency(smartDeliveryTotal / quantity) : null
    };
  }
  const unitValue = positiveNumberOrNull(delivery.unit_value, delivery.estimated_unit_value, inventoryUnitValues.get(delivery.inventory_item_id), item?.unit_value, item?.estimated_unit_value, item?.economic_value, item?.price, item?.cost);
  return {
    total: quantity !== null && unitValue !== null ? roundCurrency(quantity * unitValue) : 0,
    quantity,
    unitValue
  };
}

function smartDeliveryNoteValue(notes, label) {
  const match = String(notes || '').match(new RegExp(`${label}:\\s*([\\d.,]+)`, 'i'));
  if (!match) return null;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildInventoryUnitValueMap(items, socialValueEvents = []) {
  const values = new Map();
  items.forEach((item) => {
    const explicit = inventoryItemUnitValue(item);
    if (explicit !== null) values.set(item.id, explicit);
  });
  [...socialValueEvents]
    .filter((event) => event.value_type === 'received' && event.inventory_item_id)
    .sort((a, b) => String(b.social_value_at || b.created_at || '').localeCompare(String(a.social_value_at || a.created_at || '')))
    .forEach((event) => {
      if (values.has(event.inventory_item_id)) return;
      const unitValue = socialEventUnitValue(event, values);
      if (unitValue !== null) values.set(event.inventory_item_id, unitValue);
    });
  return values;
}

function inventoryItemUnitValue(item) {
  return positiveNumberOrNull(item?.unit_value, item?.estimated_unit_value, item?.economic_value, item?.price, item?.cost);
}

function socialEventUnitValue(event, inventoryUnitValues) {
  const direct = positiveNumberOrNull(event.unit_value, event.estimated_unit_value);
  if (direct !== null) return direct;
  const quantity = positiveNumberOrNull(event.quantity);
  const amount = positiveNumberOrNull(event.amount);
  if (quantity !== null && amount !== null) return roundCurrency(amount / quantity);
  return positiveNumberOrNull(inventoryUnitValues.get(event.inventory_item_id));
}

function findInventoryItemByNameAndLot(items, name, lot) {
  const normalizedName = normalize(name);
  const normalizedLot = normalize(lot);
  if (!normalizedName) return null;
  return items.find((item) => normalize(item.name) === normalizedName && normalize(item.lot) === normalizedLot) || null;
}

function resolveDonationUnitValue(form, items, inventoryUnitValues) {
  const item = form.inventory_item_mode === 'new'
    ? findInventoryItemByNameAndLot(items, form.inventory_name, form.inventory_lot)
    : items.find((entry) => entry.id === form.inventory_item_id);
  const automaticValue = item ? positiveNumberOrNull(inventoryUnitValues.get(item.id)) : null;
  return automaticValue ?? positiveNumberOrNull(form.inventory_unit_value, form.unit_value, form.estimated_unit_value);
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
        { label: 'Préstamos', detail: 'Adelantos recibidos con saldo pendiente.', value: report.pendingLoans },
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
        { label: 'Valor social recibido', detail: 'Valor estimado que llega a la asociación.', value: formatMoney(report.socialReceived) },
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
        { label: 'Préstamos', detail: 'Historial y saldos pendientes.', value: report.metrics.loans },
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
        eventType: event?.event_type || '',
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

function activeAccountingRecords(rows, eventsById) {
  return rows.filter((item) => !isVoided(item) && !isVoided(eventsById.get(item.accounting_event_id)));
}

function isVoided(item) {
  const status = normalize(item?.status || item?.state || '');
  return status.includes('void')
    || status.includes('anulad')
    || status.includes('cancel')
    || status.includes('correct')
    || status.includes('corregid')
    || status.includes('revers')
    || status.includes('revert');
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

function buildLoanSummaries(records, movements, contactsById, accountsById) {
  return records.map((loan) => {
    const relatedMovements = movements.filter((movement) => movement.loan_id === loan.id);
    const principal = Number(loan.principal_amount || 0);
    const repaid = loanRepaidAmount(loan, relatedMovements);
    const outstanding = loanOutstanding(loan, relatedMovements);
    const receivedMovement = relatedMovements.find((movement) => movement.movement_type === 'loan_received');
    const status = loanStatusFromOutstanding(principal, outstanding);
    const history = [
      {
        key: `loan-open-${loan.id}`,
        date: loan.loan_at || loan.created_at,
        label: 'Préstamo',
        amount: principal,
        kind: 'received'
      },
      ...relatedMovements
        .filter((movement) => movement.movement_type !== 'loan_received')
        .map((movement) => ({
          key: `loan-movement-${movement.id}`,
          date: movement.payment_at || movement.created_at,
          label: 'Devolución',
          amount: Number(movement.amount || 0),
          kind: 'payment'
        }))
    ].filter((item) => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return {
      id: loan.id,
      raw: loan,
      contactId: loan.contact_id,
      contactName: contactName(contactsById.get(loan.contact_id)),
      reason: loan.reason || loan.notes || 'Préstamo',
      date: loan.loan_at || loan.created_at,
      principal,
      repaid,
      outstanding,
      status,
      statusLabel: loanDisplayStatus(principal, outstanding),
      accountName: accountMethod(accountsById.get(receivedMovement?.financial_account_id), receivedMovement?.movement_type),
      history
    };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildDebtSummaries(records, movements, contactsById, accountsById, today) {
  return records.map((debt) => {
    const relatedMovements = movements.filter((movement) => movement.debt_id === debt.id);
    const original = Number(debt.original_amount || 0);
    const paid = debtPaidAmount(debt, relatedMovements);
    const outstanding = debtOutstanding(debt, relatedMovements);
    const daysToDue = daysUntil(debt.due_at, today);
    const status = debtStatusFromOutstanding(original, outstanding);
    const history = [
      {
        key: `debt-open-${debt.id}`,
        date: debt.debt_at || debt.created_at,
        label: 'Deuda',
        amount: original,
        kind: 'debt'
      },
      ...relatedMovements.map((movement) => ({
        key: `debt-movement-${movement.id}`,
        date: movement.payment_at || movement.created_at,
        label: 'Pago de deuda',
        amount: Number(movement.amount || 0),
        kind: 'payment',
        accountName: accountMethod(accountsById.get(movement.financial_account_id), movement.movement_type)
      }))
    ].filter((item) => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return {
      id: debt.id,
      raw: debt,
      contactId: debt.contact_id,
      contactName: contactName(contactsById.get(debt.contact_id)),
      reason: debt.reason || debt.notes || 'Deuda',
      date: debt.debt_at || debt.created_at,
      dueAt: debt.due_at || '',
      original,
      paid,
      outstanding,
      status,
      statusLabel: debtDisplayStatus(original, outstanding),
      isOverdue: outstanding > 0 && Boolean(debt.due_at) && Number.isFinite(daysToDue) && daysToDue < 0,
      isUpcoming: outstanding > 0 && Boolean(debt.due_at) && Number.isFinite(daysToDue) && daysToDue >= 0 && daysToDue <= 14,
      history
    };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildLoanContactCards(loans) {
  const groups = groupByContact(loans, 'Prestamista');
  return groups.map((group) => {
    const borrowed = sumBy(group.rows, (loan) => loan.principal);
    const repaid = sumBy(group.rows, (loan) => loan.repaid);
    const pending = sumBy(group.rows, (loan) => loan.outstanding);
    return {
      key: `loan-contact-${group.key}`,
      kind: 'Prestamista',
      name: group.name,
      icon: HandCoins,
      tone: 'bg-violet-50 text-violet-700',
      metrics: [
        { label: 'Prestado', value: formatMoney(borrowed) },
        { label: 'Devuelto', value: formatMoney(repaid) },
        { label: 'Pendiente', value: formatMoney(pending) }
      ],
      history: group.history
    };
  });
}

function buildDebtContactCards(debts) {
  const groups = groupByContact(debts, 'Proveedor/persona');
  return groups.map((group) => {
    const pending = sumBy(group.rows, (debt) => debt.outstanding);
    const paymentHistory = group.history.filter((item) => item.kind === 'payment');
    const lastPayment = paymentHistory[0]?.date || '';
    return {
      key: `debt-contact-${group.key}`,
      kind: 'Proveedor/persona',
      name: group.name,
      icon: Receipt,
      tone: 'bg-orange-50 text-orange-700',
      metrics: [
        { label: 'Facturas/deudas', value: group.rows.length },
        { label: 'Pendiente', value: formatMoney(pending) },
        { label: 'Ultimo pago', value: lastPayment ? formatDate(lastPayment) : '-' }
      ],
      history: group.history
    };
  });
}

function groupByContact(rows, fallbackName) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.contactId || row.contactName || fallbackName;
    if (!groups.has(key)) groups.set(key, { key, name: row.contactName || fallbackName, rows: [], history: [] });
    const group = groups.get(key);
    group.rows.push(row);
    group.history.push(...row.history.map((item) => ({ ...item, key: `${row.id}-${item.key}` })));
  });
  return [...groups.values()].map((group) => ({
    ...group,
    history: group.history.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  })).sort((a, b) => sumBy(b.rows, (row) => row.outstanding) - sumBy(a.rows, (row) => row.outstanding));
}

function loanOutstanding(loan, movements) {
  const paid = loanRepaidAmount(loan, movements);
  return Math.max(0, Number(loan.principal_amount || 0) - paid);
}

function loanRepaidAmount(loan, movements) {
  return sumBy(movements.filter((movement) => movement.loan_id === loan.id && movement.movement_type !== 'loan_received'), (movement) => Number(movement.amount || 0));
}

function debtOutstanding(debt, movements) {
  const paid = debtPaidAmount(debt, movements);
  return Math.max(0, Number(debt.original_amount || 0) - paid);
}

function debtPaidAmount(debt, movements) {
  return sumBy(movements.filter((movement) => movement.debt_id === debt.id), (movement) => Number(movement.amount || 0));
}

function loanStatusFromOutstanding(principal, outstanding) {
  if (outstanding <= 0) return 'repaid';
  return outstanding >= Number(principal || 0) ? 'active' : 'partially_repaid';
}

function debtStatusFromOutstanding(original, outstanding) {
  if (outstanding <= 0) return 'paid';
  return outstanding >= Number(original || 0) ? 'active' : 'partially_paid';
}

function loanDisplayStatus(principal, outstanding) {
  if (Number(outstanding || 0) <= 0) return 'Devuelto';
  return 'Pendiente';
}

function debtDisplayStatus(original, outstanding) {
  if (Number(outstanding || 0) <= 0) return 'Pagado';
  return 'Pendiente';
}

function daysUntil(targetDate, today) {
  if (!targetDate || !today) return Number.NaN;
  const target = new Date(String(targetDate).slice(0, 10));
  const current = new Date(String(today).slice(0, 10));
  if (Number.isNaN(target.getTime()) || Number.isNaN(current.getTime())) return Number.NaN;
  return Math.floor((target.getTime() - current.getTime()) / 86400000);
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
    loan: 'Préstamo',
    debt: 'Deuda',
    donation_money: 'Donación monetaria',
    donation_in_kind: 'Donación en especie',
    asset: 'Activo',
    social_value: 'Valor social',
    correction: 'Corrección',
    void: 'Anulación'
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
    adjustment: 'Corrección'
  };
  return labels[type] || 'Movimiento';
}

function socialEventLabel(event) {
  const labels = {
    in_kind_donation: 'Donación en especie',
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

function nextAccountingInternalDocumentNumber(data, dateValue = new Date()) {
  const year = new Date(dateValue || new Date()).getFullYear();
  const pattern = new RegExp(`INT-${year}-(\\d{6})`, 'i');
  const sources = asArray(data.accounting_documents).flatMap((document) => [document.document_number, document.notes]);
  const last = sources.reduce((max, value) => {
    const match = String(value || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `INT-${year}-${String(last + 1).padStart(6, '0')}`;
}

function nextAccountingDonationReference(data, dateValue = new Date()) {
  const year = new Date(dateValue || new Date()).getFullYear();
  const pattern = new RegExp(`DON-${year}-(\\d{6})`, 'i');
  const sources = [
    ...asArray(data.donations).flatMap((item) => [item.reference, item.notes]),
    ...asArray(data.cash_bank_movements).flatMap((item) => [item.reference, item.notes]),
    ...asArray(data.accounting_documents).flatMap((item) => [item.document_number, item.notes]),
    ...asArray(data.accounting_events).flatMap((item) => [item.title, item.description])
  ];
  const last = sources.reduce((max, value) => {
    const match = String(value || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `DON-${year}-${String(last + 1).padStart(6, '0')}`;
}

function normalizeDonationDocumentType(value) {
  return DONATION_DOCUMENT_TYPES.some((type) => type.value === value) ? value : 'internal_document';
}

function defaultDocumentTypeForOperation(type) {
  const labels = {
    income: 'receipt',
    expense: 'ticket',
    donation_money: 'internal_document',
    donation_in_kind: 'internal_document',
    inventory_purchase: 'invoice',
    economic_help: 'proof',
    loan_received: 'contract',
    loan_repayment: 'proof',
    supplier_debt: 'invoice',
    debt_payment: 'proof',
    transfer: 'proof',
    correction: 'proof'
  };
  return labels[type] || 'proof';
}

function defaultDocumentTypeForMovement(type) {
  return String(type || '').endsWith('_out') ? 'ticket' : 'receipt';
}

function amountLabelForOperation(type) {
  if (type === 'donation_in_kind') return 'Valor estimado';
  if (type === 'transfer') return 'Importe a transferir';
  if (type === 'loan_repayment') return 'Importe devuelto';
  if (type === 'debt_payment') return 'Importe pagado';
  return 'Importe';
}

function submitLabelForOperation(type) {
  if (type === 'void') return 'Anular movimiento';
  if (type === 'correction') return 'Guardar corrección';
  return 'Registrar operación';
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

function formatMovementQuantity(movement) {
  const quantity = positiveNumberOrNull(movement.quantity);
  if (quantity === null) return '-';
  return `${quantity.toLocaleString('es-ES', { maximumFractionDigits: 2 })}${movement.unit ? ` ${movement.unit}` : ''}`;
}

function formatMovementUnitValue(movement) {
  const unitValue = positiveNumberOrNull(movement.unitValue);
  return unitValue === null ? '-' : formatMoney(unitValue);
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function positiveNumberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
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

function accountingDonorMetadata(donor) {
  const lines = String(donor?.notes || '').split(/\r?\n/);
  return {
    kind: markerValue(lines, DONOR_KIND_MARKER),
    contactPerson: markerValue(lines, DONOR_CONTACT_MARKER)
  };
}

function markerValue(lines, marker) {
  const line = lines.find((item) => item.startsWith(marker));
  return line ? line.slice(marker.length).trim() : '';
}

function buildAccountingDonorNotes({ observations, kind, contactPerson }) {
  return [
    String(observations || '').trim(),
    `${DONOR_KIND_MARKER} ${kind || 'Particular'}`.trim(),
    contactPerson ? `${DONOR_CONTACT_MARKER} ${contactPerson}`.trim() : ''
  ].filter(Boolean).join('\n');
}

function inferAccountingDonorKind(name = '') {
  const value = normalize(name);
  if (value.includes('iglesia') || value.includes('parroquia')) return 'Iglesia';
  if (value.includes('fundacion')) return 'Fundacion';
  if (value.includes('asociacion')) return 'Asociación';
  if (value.includes('ayuntamiento') || value.includes('administracion')) return 'Administracion';
  if (/\b(sl|s l|sa|s a)\b/.test(value) || value.includes('empresa')) return 'Empresa';
  if (value.includes('anonimo')) return 'Anonimo';
  return 'Particular';
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
