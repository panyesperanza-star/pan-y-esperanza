import { Archive, CalendarDays, FileText, Mail } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { HELP_TYPES } from '../lib/constants';
import { downloadReceiptsZip, exportDeliveriesSummaryPdf } from '../lib/exporters';
import { formatDate, todayISO } from '../lib/formatters';
import { sanitizeAttachmentsForLog, sendEmailViaApi } from '../lib/emailClient';

export function Receipts({ data, actions, currentUser }) {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    beneficiary: '',
    responsible: '',
    helpType: ''
  });
  const [selected, setSelected] = useState([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState('manual');
  const [emailNotice, setEmailNotice] = useState('');

  const receipts = useMemo(() => withFallbackReceiptNumbers(data.deliveries), [data.deliveries]);

  const filtered = useMemo(() => receipts.filter((delivery) => {
    const date = delivery.delivered_at || '';
    if (filters.from && date < filters.from) return false;
    if (filters.to && date > filters.to) return false;
    if (filters.beneficiary && delivery.beneficiary_id !== filters.beneficiary) return false;
    if (filters.responsible && !String(delivery.responsible || '').toLowerCase().includes(filters.responsible.toLowerCase())) return false;
    if (filters.helpType && delivery.help_type !== filters.helpType) return false;
    return true;
  }), [filters, receipts]);

  const stats = useMemo(() => {
    const today = todayISO();
    const month = today.slice(0, 7);
    return {
      today: receipts.filter((item) => item.delivered_at === today).length,
      month: receipts.filter((item) => String(item.delivered_at || '').startsWith(month)).length,
      generated: receipts.length
    };
  }, [receipts]);

  const selectedEntries = selected
    .map((id) => receipts.find((delivery) => delivery.id === id))
    .filter(Boolean)
    .map((delivery) => ({ delivery, beneficiary: data.beneficiaries.find((item) => item.id === delivery.beneficiary_id) }));

  const defaultRecipients = useMemo(() => {
    const emails = selectedEntries.map((entry) => entry.beneficiary?.email).filter(Boolean);
    return [...new Set(emails)].join(', ');
  }, [selectedEntries]);

  const beneficiaryRecipient = selectedEntries.length === 1 ? selectedEntries[0].beneficiary?.email || '' : '';

  useEffect(() => {
    if (typeof window === 'undefined' || window.__pyeSendJustificantesFetchGuard) return undefined;
    const originalFetch = window.fetch.bind(window);
    window.__pyeSendJustificantesFetchGuard = true;
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (url.includes('/api/send-justificantes') && method === 'GET') {
        console.warn('[justificantes] Inicio flujo GET detectado', { url, method });
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
      delete window.__pyeSendJustificantesFetchGuard;
    };
  }, []);

  function update(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setSelected([]);
  }

  function toggle(id) {
    setEmailNotice('');
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    setEmailNotice('');
    setSelected((current) => current.length === filtered.length ? [] : filtered.map((item) => item.id));
  }

  async function generateZip() {
    if (!selectedEntries.length) return;
    await downloadReceiptsZip('justificantes-seleccionados', selectedEntries, receipts);
  }

  async function generateMonthlyZip() {
    const periodDeliveries = receipts.filter((delivery) => isInCurrentPeriod(delivery.delivered_at, 'month'));
    const entries = periodDeliveries.map((delivery) => ({
      delivery,
      beneficiary: data.beneficiaries.find((item) => item.id === delivery.beneficiary_id)
    }));
    if (!entries.length) return;
    await downloadReceiptsZip('justificantes-mensual', entries, receipts);
  }

  function openManualEmail() {
    setEmailNotice('');
    setEmailMode('manual');
    setEmailOpen(true);
  }

  async function openBeneficiaryEmail() {
    setEmailNotice('');
    if (selectedEntries.length !== 1) {
      setEmailNotice('Selecciona un unico justificante para enviarlo al beneficiario.');
      return;
    }
    if (!beneficiaryRecipient) {
      setEmailNotice('Este beneficiario no tiene correo electrónico registrado.');
      return;
    }
    const email = {
      recipients: beneficiaryRecipient,
      subject: 'Justificante de entrega - Pan y Esperanza',
      message: 'Adjuntamos su justificante de entrega en PDF.',
      includeSummary: false
    };
    setEmailNotice('Generando PDF y enviando al beneficiario...');
    try {
      const result = await sendEmailEfficient(email, selectedEntries);
      await saveEmailLog(actions, currentUser, email, selectedEntries.length, result.payload.message || 'Correo enviado correctamente.', result.attachments);
      setEmailNotice('Correo enviado correctamente.');
    } catch (error) {
      await saveEmailLog(actions, currentUser, email, selectedEntries.length, normalizeEmailError(error), []);
      setEmailNotice(normalizeEmailError(error));
    }
  }

  async function sendEmailEfficient(email, entries, storedAttachments) {
    const attachments = storedAttachments || [];
    const payload = await sendEmailViaApi({
      to: email.recipients,
      subject: email.subject,
      message: email.message,
      attachments,
      receiptEntries: storedAttachments ? [] : entries,
      includeSummary: Boolean(email.includeSummary),
      organization: data.organization_settings?.[0]
    });
    return { payload, attachments: payload.attachments || attachments };
  }

  return (
    <>
      <PageHeader
        title="Justificantes"
        description="Consulta, filtra y descarga justificantes de entrega de forma masiva."
        actions={
          <>
            <Button onClick={openBeneficiaryEmail} disabled={selected.length !== 1}><Mail size={18} /> Enviar justificante al beneficiario</Button>
            <Button variant="secondary" onClick={openManualEmail} disabled={!selected.length}><Mail size={18} /> Enviar justificantes</Button>
            <Button variant="secondary" onClick={generateZip} disabled={!selected.length}><Archive size={18} /> Generar ZIP</Button>
            <Button variant="secondary" onClick={generateMonthlyZip}><CalendarDays size={18} /> Generar ZIP mensual</Button>
            <Button onClick={() => exportDeliveriesSummaryPdf(filtered)}><FileText size={18} /> Generar informe de entregas</Button>
          </>
        }
      />

      {emailNotice && <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{emailNotice}</div>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Entregas hoy" value={stats.today} />
        <Stat label="Entregas este mes" value={stats.month} />
        <Stat label="Justificantes generados" value={stats.generated} />
      </div>

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-4 md:grid-cols-5">
          <FormField label="Fecha desde"><input className={inputClass} type="date" value={filters.from} onChange={(event) => update('from', event.target.value)} /></FormField>
          <FormField label="Fecha hasta"><input className={inputClass} type="date" value={filters.to} onChange={(event) => update('to', event.target.value)} /></FormField>
          <FormField label="Beneficiario">
            <select className={inputClass} value={filters.beneficiary} onChange={(event) => update('beneficiary', event.target.value)}>
              <option value="">Todos</option>
              {data.beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.full_name}</option>)}
            </select>
          </FormField>
          <FormField label="Responsable"><input className={inputClass} value={filters.responsible} onChange={(event) => update('responsible', event.target.value)} /></FormField>
          <FormField label="Tipo de ayuda">
            <select className={inputClass} value={filters.helpType} onChange={(event) => update('helpType', event.target.value)}>
              <option value="">Todas</option>
              {HELP_TYPES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </FormField>
        </div>
      </section>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3"><input type="checkbox" checked={Boolean(filtered.length && selected.length === filtered.length)} onChange={toggleAll} /></th>
              <th>Justificante</th>
              <th>Fecha</th>
              <th>Beneficiario</th>
              <th>Responsable</th>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Firma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((delivery) => (
              <tr key={delivery.id}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(delivery.id)} onChange={() => toggle(delivery.id)} /></td>
                <td className="font-semibold text-brand-700">{delivery.receipt_number}</td>
                <td>{formatDate(delivery.delivered_at)}</td>
                <td>{delivery.beneficiary_name}</td>
                <td>{delivery.responsible || '-'}</td>
                <td>{delivery.help_type}</td>
                <td>{delivery.inventory_item_name || '-'}</td>
                <td>{delivery.quantity || '-'}</td>
                <td>{delivery.signature_data_url ? 'Disponible' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="p-5 text-sm text-slate-500">No hay justificantes con los filtros seleccionados.</p>}
      </div>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Historial de envios</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th>Destinatario</th><th>Usuario</th><th>Nº justificantes</th><th>Resultado</th><th className="text-right pr-4">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data.email_logs || []).map((log) => <tr key={log.id}><td className="px-4 py-3">{formatDate(log.sent_at)}</td><td>{log.recipient}</td><td>{log.sent_by || '-'}</td><td>{log.receipts_count}</td><td>{log.result}</td><td className="pr-4 text-right"><Button variant="secondary" onClick={async () => {
                try {
                  const email = { recipients: log.recipient, subject: log.subject, message: log.message };
                  const result = await sendEmailEfficient(email, [], log.attachments || []);
                  await actions.updateEmailLog(log.id, { sent_at: new Date().toISOString(), result: result.payload.message || 'Correo enviado correctamente.' });
                } catch (error) {
                  await actions.updateEmailLog(log.id, { sent_at: new Date().toISOString(), result: normalizeEmailError(error) });
                }
              }}>Reenviar</Button></td></tr>)}
              {!(data.email_logs || []).length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="6">Sin envios registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {emailOpen && (
        <Modal title="Enviar justificantes por correo" onClose={() => setEmailOpen(false)}>
          <EmailForm
            selectedCount={selectedEntries.length}
            defaultRecipients={emailMode === 'beneficiary' ? beneficiaryRecipient : defaultRecipients}
            mode={emailMode}
            onSubmit={async (email) => {
              let attachments = [];
              try {
                const result = await sendEmailEfficient(email, selectedEntries);
                attachments = result.attachments;
                await saveEmailLog(actions, currentUser, email, selectedEntries.length, result.payload.message || 'Correo enviado correctamente.', attachments);
              } catch (error) {
                await saveEmailLog(actions, currentUser, email, selectedEntries.length, normalizeEmailError(error), attachments);
                throw error;
              }
              setEmailOpen(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}

async function saveEmailLog(actions, currentUser, email, count, result, attachments) {
  await actions.createEmailLog({
    sent_at: new Date().toISOString(),
    recipient: email.recipients,
    sent_by: `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || 'Usuario',
    receipts_count: count,
    result,
    subject: email.subject,
    message: email.message,
    attachments: sanitizeAttachmentsForLog(attachments)
  });
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function isInCurrentPeriod(value, period) {
  if (!value) return false;
  const now = new Date();
  const date = new Date(value);
  if (period === 'day') return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (period === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === 'year') return date.getFullYear() === now.getFullYear();
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return date >= start && date < end;
  }
  return false;
}

function EmailForm({ selectedCount, defaultRecipients, mode, onSubmit }) {
  const [form, setForm] = useState({
    recipients: defaultRecipients,
    subject: 'Justificantes de entrega - Pan y Esperanza',
    message: 'Adjuntamos los justificantes seleccionados en PDF.',
    includeSummary: false
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
    console.info('[justificantes] Inicio flujo POST');
    setStatus('Generando PDFs y enviando correo...');
    setError('');
    try {
      await onSubmit(form);
      setStatus('Correo enviado correctamente.');
    } catch (err) {
      console.error('[correo] Error en envio de justificantes', err);
      setError(normalizeEmailError(err));
      setStatus('');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-700">
        Se generaran {selectedCount} PDF{selectedCount === 1 ? '' : 's'} individual{selectedCount === 1 ? '' : 'es'} de justificante y se enviaran como adjuntos. No se adjuntara ningun ZIP.
      </p>
      {mode === 'beneficiary' && <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600">Destinatario rellenado automaticamente desde el email guardado en la ficha del beneficiario.</p>}
      <FormField label="Destinatarios">
        <input className={inputClass} required placeholder="correo1@ejemplo.org, correo2@ejemplo.org" value={form.recipients} onChange={(event) => update('recipients', event.target.value)} />
      </FormField>
      <FormField label="Asunto">
        <input className={inputClass} value={form.subject} onChange={(event) => update('subject', event.target.value)} />
      </FormField>
      <FormField label="Mensaje">
        <textarea className={inputClass} rows="5" value={form.message} onChange={(event) => update('message', event.target.value)} />
      </FormField>
      <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <input type="checkbox" checked={form.includeSummary} onChange={(event) => update('includeSummary', event.target.checked)} />
        Enviar también resumen PDF
      </label>
      {status && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{status}</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" onClick={() => console.info('[justificantes] Boton pulsado')}>
          <Mail size={18} /> Enviar justificantes
        </Button>
      </div>
    </form>
  );
}

function normalizeEmailError(error) {
  const message = error?.message || '';
  if (message.startsWith('Servicio de correo no configurado.')) return message;
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) return 'Error al enviar el correo.';
  return message || 'Error al enviar el correo.';
}

function withFallbackReceiptNumbers(deliveries) {
  const counters = {};
  return [...deliveries]
    .sort((a, b) => String(a.delivered_at).localeCompare(String(b.delivered_at)))
    .map((delivery) => {
      if (delivery.receipt_number) return delivery;
      const year = new Date(delivery.delivered_at || Date.now()).getFullYear();
      counters[year] = (counters[year] || 0) + 1;
      return {
        ...delivery,
        receipt_number: `PE-${year}-${String(counters[year]).padStart(6, '0')}`
      };
    })
    .sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)));
}
