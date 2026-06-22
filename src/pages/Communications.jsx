import { Download, Mail, MessageCircle, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { EMAIL_TEMPLATES, normalizeEmailError, saveEmailLog, sendEmailViaApi } from '../lib/emailClient';
import { createReceiptEmailAttachments, printDeliveryReceiptPdf } from '../lib/exporters';
import { formatDate, formatDateTime } from '../lib/formatters';

export function Communications({ data, actions, currentUser }) {
  const organization = data.organization_settings?.[0] || {};
  const latestDeliveries = useMemo(() => {
    const byBeneficiary = new Map();
    data.deliveries.forEach((delivery) => {
      const current = byBeneficiary.get(delivery.beneficiary_id);
      if (!current || String(delivery.delivered_at || '') > String(current.delivered_at || '')) {
        byBeneficiary.set(delivery.beneficiary_id, delivery);
      }
    });
    return byBeneficiary;
  }, [data.deliveries]);
  const stats = {
    activeBeneficiaries: data.beneficiaries.filter((item) => item.is_active).length,
    families: data.families.length,
    minors: data.beneficiaries.reduce((total, item) => total + Number(item.minors_count || 0), 0),
    deliveries: data.deliveries.length,
    emails: (data.email_logs || []).length
  };
  const [form, setForm] = useState({
    beneficiary_id: data.beneficiaries[0]?.id || '',
    template: 'receipt',
    recipients: data.beneficiaries[0]?.email || '',
    subject: EMAIL_TEMPLATES[0].subject,
    message: EMAIL_TEMPLATES[0].message,
    attachReceipt: true
  });
  const [notice, setNotice] = useState('');

  const beneficiary = data.beneficiaries.find((item) => item.id === form.beneficiary_id);
  const latestDelivery = latestDeliveries.get(form.beneficiary_id);

  function update(field, value) {
    setNotice('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  function chooseBeneficiary(id) {
    const nextBeneficiary = data.beneficiaries.find((item) => item.id === id);
    setForm((current) => ({ ...current, beneficiary_id: id, recipients: nextBeneficiary?.email || '' }));
  }

  function chooseTemplate(id) {
    const template = EMAIL_TEMPLATES.find((item) => item.id === id) || EMAIL_TEMPLATES[0];
    setForm((current) => ({ ...current, template: id, subject: template.subject, message: template.message, attachReceipt: id === 'receipt' }));
  }

  async function buildAttachments() {
    if (!form.attachReceipt || !beneficiary || !latestDelivery) return [];
    return createReceiptEmailAttachments([{ delivery: latestDelivery, beneficiary }], data.deliveries, { organization });
  }

  async function sendEmail(event) {
    event.preventDefault();
    if (!form.recipients) {
      setNotice('El beneficiario no tiene correo electronico registrado o no se ha indicado destinatario.');
      return;
    }
    if (form.attachReceipt && !latestDelivery) {
      setNotice('No hay entregas registradas para generar un justificante PDF.');
      return;
    }

    setNotice('Generando PDF y enviando correo...');
    let attachments = [];
    try {
      attachments = await buildAttachments();
      const payload = await sendEmailViaApi({
        to: form.recipients,
        subject: form.subject,
        message: form.message,
        attachments,
        organization
      });
      await saveEmailLog(actions, currentUser, { ...form, recipients: form.recipients }, attachments.length, payload.message || 'Correo enviado correctamente.', attachments);
      setNotice('Correo enviado correctamente.');
    } catch (error) {
      const message = normalizeEmailError(error);
      await saveEmailLog(actions, currentUser, { ...form, recipients: form.recipients }, attachments.length, message, attachments);
      setNotice(message);
    }
  }

  async function downloadLatestReceipt() {
    if (beneficiary && latestDelivery) await printDeliveryReceiptPdf(latestDelivery, beneficiary, data.deliveries);
  }

  return (
    <>
      <PageHeader title="Comunicaciones" description="Envio de emails, historial y estructura preparada para WhatsApp." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Beneficiarios activos" value={stats.activeBeneficiaries} />
        <Metric label="Familias atendidas" value={stats.families} />
        <Metric label="Menores atendidos" value={stats.minors} />
        <Metric label="Entregas realizadas" value={stats.deliveries} />
        <Metric label="Correos enviados" value={stats.emails} />
      </div>

      {notice && <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">{notice}</div>}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">Enviar email</h3>
          <form className="mt-4 grid gap-4" onSubmit={sendEmail}>
            <FormField label="Beneficiario">
              <select className={inputClass} value={form.beneficiary_id} onChange={(event) => chooseBeneficiary(event.target.value)}>
                {data.beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.full_name}</option>)}
              </select>
            </FormField>
            <FormField label="Plantilla">
              <select className={inputClass} value={form.template} onChange={(event) => chooseTemplate(event.target.value)}>
                {EMAIL_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </FormField>
            <FormField label="Destinatario">
              <input className={inputClass} type="email" value={form.recipients} onChange={(event) => update('recipients', event.target.value)} placeholder="email@ejemplo.org" />
            </FormField>
            <FormField label="Asunto">
              <input className={inputClass} value={form.subject} onChange={(event) => update('subject', event.target.value)} />
            </FormField>
            <FormField label="Mensaje">
              <textarea className={inputClass} rows="5" value={form.message} onChange={(event) => update('message', event.target.value)} />
            </FormField>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={form.attachReceipt} onChange={(event) => update('attachReceipt', event.target.checked)} />
              Adjuntar justificante PDF de la ultima entrega
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" disabled={!latestDelivery} onClick={downloadLatestReceipt}><Download size={18} /> Descargar PDF</Button>
              <Button type="submit"><Send size={18} /> Enviar email</Button>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <h3 className="font-bold text-ink">WhatsApp preparado</h3>
          <div className="mt-4 grid gap-3">
            <WhatsAppCard title="Envio individual" description="Estructura lista para conectar WhatsApp Business API con la ficha del beneficiario." />
            <WhatsAppCard title="Envio masivo" description="Base preparada para campanas por familias, beneficiarios activos o entregas pendientes." />
            <WhatsAppCard title="Plantillas reutilizables" description="Aviso de recogida, solicitud de documentacion, agradecimiento y recordatorios." />
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Historial de comunicaciones</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Fecha</th><th>Destinatario</th><th>Asunto</th><th>Usuario</th><th>Adjuntos</th><th>Resultado</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.email_logs || []).map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">{formatDateTime(log.sent_at)}</td>
                  <td>{log.recipient}</td>
                  <td>{log.subject || '-'}</td>
                  <td>{log.sent_by || '-'}</td>
                  <td>{Array.isArray(log.attachments) ? log.attachments.length : 0}</td>
                  <td>{log.result || '-'}</td>
                </tr>
              ))}
              {!(data.email_logs || []).length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="6">Sin comunicaciones registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-md border border-slate-200 bg-white p-4 shadow-panel"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink">{value}</p></div>;
}

function WhatsAppCard({ title, description }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 font-semibold text-ink"><MessageCircle size={18} /> {title}</div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}
