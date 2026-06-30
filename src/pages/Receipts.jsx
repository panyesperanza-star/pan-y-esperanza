import { Archive, CalendarDays, Eye, FileText, Mail, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { HELP_TYPES } from '../lib/constants';
import { downloadReceiptsZip, exportDeliveriesSummaryPdf } from '../lib/exporters';
import { formatDate, todayISO } from '../lib/formatters';
import { openStoredEmailAttachment, sendEmailViaApi } from '../lib/emailClient';

export function Receipts({ data, actions }) {
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
  const [noticeType, setNoticeType] = useState('info');
  const [busyAction, setBusyAction] = useState('');
  const [attachmentLog, setAttachmentLog] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');

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
  const receiptEmailLogs = useMemo(
    () => (data.email_logs || []).filter((log) => Number(log.receipts_count || 0) > 0),
    [data.email_logs]
  );

  const selectedEntries = selected
    .map((id) => receipts.find((delivery) => delivery.id === id))
    .filter(Boolean)
    .map((delivery) => ({ delivery, beneficiary: data.beneficiaries.find((item) => item.id === delivery.beneficiary_id) }));

  const defaultRecipients = useMemo(() => {
    const emails = selectedEntries.map((entry) => entry.beneficiary?.email).filter(Boolean);
    return [...new Set(emails)].join(', ');
  }, [selectedEntries]);

  const beneficiaryRecipient = selectedEntries.length === 1 ? selectedEntries[0].beneficiary?.email || '' : '';

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
    setBusyAction('zip');
    setEmailNotice('');
    try {
      await downloadReceiptsZip('justificantes-seleccionados', selectedEntries, receipts, { includeSummary: false });
      showNotice(`ZIP generado con ${selectedEntries.length} justificante${selectedEntries.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      showNotice(error.message || 'No se pudo generar el ZIP.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function generateMonthlyZip() {
    const periodDeliveries = filtered.filter((delivery) => isInCurrentPeriod(delivery.delivered_at, 'month'));
    const entries = periodDeliveries.map((delivery) => ({
      delivery,
      beneficiary: data.beneficiaries.find((item) => item.id === delivery.beneficiary_id)
    }));
    if (!entries.length) {
      showNotice('No hay justificantes del mes actual con los filtros seleccionados.', 'error');
      return;
    }
    setBusyAction('monthly-zip');
    try {
      await downloadReceiptsZip(`justificantes-${todayISO().slice(0, 7)}`, entries, receipts, { includeSummary: false });
      showNotice(`ZIP mensual generado con ${entries.length} justificante${entries.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      showNotice(error.message || 'No se pudo generar el ZIP mensual.', 'error');
    } finally {
      setBusyAction('');
    }
  }

  function showNotice(message, type = 'info') {
    setEmailNotice(message);
    setNoticeType(type);
  }

  function openManualEmail() {
    setEmailNotice('');
    setEmailMode('manual');
    setEmailOpen(true);
  }

  async function openBeneficiaryEmail() {
    showNotice('', 'info');
    if (selectedEntries.length !== 1) {
      showNotice('Selecciona un único justificante para enviarlo al beneficiario.', 'error');
      return;
    }
    if (!beneficiaryRecipient) {
      showNotice('Este beneficiario no tiene correo electrónico registrado.', 'error');
      return;
    }
    const email = {
      recipients: beneficiaryRecipient,
      subject: 'Justificante de entrega - Pan y Esperanza',
      message: 'Adjuntamos su justificante de entrega en PDF.',
      includeSummary: false
    };
    showNotice('Generando PDF y enviando al beneficiario...', 'info');
    setBusyAction('beneficiary-email');
    try {
      const result = await sendEmailEfficient(email, selectedEntries);
      await actions.reloadData();
      showNotice(`Correo enviado correctamente. ID Resend: ${result.payload.id}`, 'success');
    } catch (error) {
      showNotice(normalizeEmailError(error), 'error');
    } finally {
      setBusyAction('');
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
      organization: data.organization_settings?.[0],
      logEmail: true
    });
    return { payload, attachments: payload.attachments || attachments };
  }

  function entriesForLog(log) {
    const ids = new Set([
      ...(Array.isArray(log.receipt_ids) ? log.receipt_ids : []),
      ...(log.attachments || []).map((item) => item.deliveryId || item.delivery_id).filter(Boolean)
    ]);
    const receiptNumbers = new Set((log.attachments || [])
      .map((item) => String(item.filename || '').match(/Justificante-(PE-\d{4}-\d{6})\.pdf/i)?.[1])
      .filter(Boolean));
    const exactEntries = receipts
      .filter((delivery) => ids.has(delivery.id) || receiptNumbers.has(delivery.receipt_number))
      .map((delivery) => ({
        delivery,
        beneficiary: data.beneficiaries.find((item) => item.id === delivery.beneficiary_id)
      }));
    if (exactEntries.length) return exactEntries;

    const recipientEmails = new Set(String(log.recipient || '').toLowerCase().split(/[,;\s]+/).filter(Boolean));
    const beneficiaryIds = new Set(data.beneficiaries
      .filter((beneficiary) => recipientEmails.has(String(beneficiary.email || '').toLowerCase()))
      .map((beneficiary) => beneficiary.id));
    const expectedCount = Math.max(0, Number(log.receipts_count || 0));
    const sentDate = String(log.sent_at || '').slice(0, 10);
    if (!beneficiaryIds.size || !expectedCount) return [];
    return receipts
      .filter((delivery) => beneficiaryIds.has(delivery.beneficiary_id) && (!sentDate || String(delivery.delivered_at || '').slice(0, 10) <= sentDate))
      .sort((a, b) => String(b.delivered_at || '').localeCompare(String(a.delivered_at || '')))
      .slice(0, expectedCount)
      .map((delivery) => ({
        delivery,
        beneficiary: data.beneficiaries.find((item) => item.id === delivery.beneficiary_id)
      }));
  }

  async function resendLog(log) {
    const email = { recipients: log.recipient, subject: log.subject, message: log.message };
    const storedAttachments = (log.attachments || []).filter((item) => item.storagePath || item.storage_path);
    const fallbackEntries = entriesForLog(log);
    const storedReceiptCount = storedAttachments.filter((item) => !(item.isSummary || item.is_summary)).length;
    const canReuseOriginals = storedReceiptCount >= Number(log.receipts_count || 0) && storedReceiptCount > 0;
    if (!canReuseOriginals && !fallbackEntries.length) {
      showNotice('No existe un PDF original ni datos suficientes para regenerar este envío.', 'error');
      return;
    }
    setBusyAction(`resend-${log.id}`);
    try {
      const result = canReuseOriginals
        ? await sendEmailEfficient(email, [], storedAttachments)
        : await sendEmailEfficient(email, fallbackEntries);
      await actions.reloadData();
      showNotice(`Correo reenviado correctamente. ID Resend: ${result.payload.id}`, 'success');
    } catch (error) {
      showNotice(normalizeEmailError(error), 'error');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <>
      <PageHeader
        title="Justificantes"
        description="Consulta, filtra y descarga justificantes de entrega de forma masiva."
        actions={
          <>
            <Button onClick={openBeneficiaryEmail} disabled={selected.length !== 1 || Boolean(busyAction)}><Mail size={18} /> Enviar justificante al beneficiario</Button>
            <Button variant="secondary" onClick={openManualEmail} disabled={!selected.length || Boolean(busyAction)}><Mail size={18} /> Enviar justificantes</Button>
            <Button variant="secondary" onClick={generateZip} disabled={!selected.length || Boolean(busyAction)}><Archive size={18} /> {busyAction === 'zip' ? 'Generando...' : 'Generar ZIP'}</Button>
            <Button variant="secondary" onClick={generateMonthlyZip} disabled={Boolean(busyAction)}><CalendarDays size={18} /> {busyAction === 'monthly-zip' ? 'Generando...' : 'Generar ZIP mensual'}</Button>
            <Button onClick={() => exportDeliveriesSummaryPdf(filtered)}><FileText size={18} /> Generar informe de entregas</Button>
          </>
        }
      />

      {emailNotice && <div className={`mb-5 rounded-md border p-3 text-sm font-medium ${noticeClass(noticeType)}`}>{emailNotice}</div>}

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
        <h3 className="font-bold text-ink">Historial de envíos</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th>Hora</th><th>Usuario</th><th>Destinatario</th><th>Nº justificantes</th><th>Resultado</th><th>ID Resend</th><th className="text-right pr-4">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {receiptEmailLogs.map((log) => <tr key={log.id}>
                <td className="px-4 py-3">{formatDate(log.sent_at)}</td>
                <td>{formatLogTime(log.sent_at)}</td>
                <td>{log.sent_by || '-'}</td>
                <td className="max-w-[240px] break-words">{log.recipient}</td>
                <td>{log.receipts_count}</td>
                <td><span className={logStatusClass(log)}>{resolveLogStatus(log)}</span></td>
                <td className="max-w-[170px] break-all font-mono text-xs">{log.provider_id || extractProviderId(log.result) || '-'}</td>
                <td className="pr-4"><div className="flex justify-end gap-2">
                  <Button variant="secondary" disabled={!(log.attachments || []).length} onClick={() => { setAttachmentError(''); setAttachmentLog(log); }}><Eye size={16} /> Ver PDF</Button>
                  <Button variant="secondary" disabled={busyAction === `resend-${log.id}`} onClick={() => resendLog(log)}><RefreshCw size={16} /> {busyAction === `resend-${log.id}` ? 'Enviando...' : 'Reenviar'}</Button>
                </div></td>
              </tr>)}
              {!receiptEmailLogs.length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="8">Sin envíos registrados.</td></tr>}
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
              try {
                const result = await sendEmailEfficient(email, selectedEntries);
                await actions.reloadData();
                showNotice(`Correo enviado correctamente. ID Resend: ${result.payload.id}`, 'success');
              } catch (error) {
                throw error;
              }
              setEmailOpen(false);
            }}
          />
        </Modal>
      )}

      {attachmentLog && (
        <Modal title="PDF enviados" onClose={() => setAttachmentLog(null)}>
          <div className="space-y-3">
            {attachmentError && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{attachmentError}</p>}
            {(attachmentLog.attachments || []).map((attachment, index) => (
              <div key={`${attachment.filename}-${index}`} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 text-sm last:border-0">
                <div>
                  <p className="font-semibold text-ink">{attachment.filename || `Justificante ${index + 1}`}</p>
                  <p className="text-xs text-slate-500">{formatAttachmentSize(attachment.size)}</p>
                </div>
                <Button variant="secondary" disabled={!(attachment.storagePath || attachment.storage_path)} onClick={async () => {
                  try {
                    setAttachmentError('');
                    await openStoredEmailAttachment(attachment);
                  } catch (error) {
                    setAttachmentError(error.message);
                  }
                }}><Eye size={16} /> Abrir PDF</Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function noticeClass(type) {
  if (type === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (type === 'error') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-brand-200 bg-brand-50 text-brand-700';
}

function formatLogTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function resolveLogStatus(log) {
  if ((log.status || '').toLowerCase() === 'error' || /error|fall/i.test(String(log.result || ''))) return 'Error';
  if (log.provider_id || extractProviderId(log.result)) return 'Enviado';
  return 'Sin confirmar';
}

function logStatusClass(log) {
  const status = resolveLogStatus(log);
  if (status === 'Enviado') return 'inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700';
  if (status === 'Error') return 'inline-flex rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700';
  return 'inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700';
}

function extractProviderId(result) {
  return String(result || '').match(/Resend:\s*([^\s]+)/i)?.[1] || '';
}

function formatAttachmentSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return 'Tamaño no disponible';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
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
  const [submitting, setSubmitting] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
    setStatus('Generando PDFs y enviando correo...');
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(form);
      setStatus('Correo enviado correctamente.');
    } catch (err) {
      console.error('[correo] Error en envio de justificantes', err);
      setError(normalizeEmailError(err));
      setStatus('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-700">
        Se generarán {selectedCount} PDF{selectedCount === 1 ? '' : 's'} individual{selectedCount === 1 ? '' : 'es'} de justificante y se enviarán como adjuntos. No se adjuntará ningún ZIP.
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
        <Button type="submit" disabled={submitting}>
          <Mail size={18} /> {submitting ? 'Enviando...' : 'Enviar justificantes'}
        </Button>
      </div>
    </form>
  );
}

function normalizeEmailError(error) {
  const message = error?.message || '';
  if (message.startsWith('Servicio de correo no configurado.')) return message;
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) return `Error de red al enviar el correo: ${message}`;
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
