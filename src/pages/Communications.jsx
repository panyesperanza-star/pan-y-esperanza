import {
  CalendarDays,
  CalendarPlus,
  Clock3,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Search,
  Send,
  Trash2,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { DOCUMENT_TYPES } from '../lib/constants';
import { EMAIL_TEMPLATES, normalizeEmailError, saveEmailLog, sendEmailViaApi } from '../lib/emailClient';
import { printDeliveryReceiptPdf } from '../lib/exporters';
import { formatDate, formatDateTime, normalize, todayISO } from '../lib/formatters';

const TABS = [
  { id: 'direct', label: 'Envíos', icon: Mail },
  { id: 'campaigns', label: 'Campañas', icon: Megaphone },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'history', label: 'Historial', icon: Clock3 }
];

const CAMPAIGN_TYPES = ['Reparto de alimentos', 'Aviso importante', 'Cambio de horario', 'Solicitud de documentación', 'Evento', 'Campaña personalizada'];
const RECIPIENT_GROUPS = ['Todos los beneficiarios', 'Solo activos', 'Solo familias', 'Solo urgentes', 'Selección manual'];
const CHANNELS = ['Email', 'WhatsApp', 'Ambos'];
const APPOINTMENT_TYPES = ['Entrevista', 'Entrega de documentación', 'Seguimiento', 'Reunión', 'Visita'];
const APPOINTMENT_STATUSES = ['Pendiente', 'Confirmada', 'Realizada', 'Reprogramada', 'Cancelada', 'No asistió'];
const CALENDAR_HOURS = Array.from({ length: 13 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const REMINDER_TIMES = [
  { id: 'created', label: 'Al crear la cita' },
  { id: '24h', label: '24 horas antes' },
  { id: '2h', label: '2 horas antes' },
  { id: 'time', label: 'A la hora de la cita' }
];

const REQUIRED_DOCUMENTS = DOCUMENT_TYPES.filter((item) => ['DNI/NIE / NIE O PASAPORTE', 'Empadronamiento'].includes(item));

export function Communications({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const organization = data.organization_settings?.[0] || {};
  const processingRemindersRef = useRef(false);
  const agendaFormRef = useRef(null);
  const latestDeliveries = useMemo(() => latestDeliveriesByBeneficiary(data.deliveries), [data.deliveries]);
  const [activeTab, setActiveTab] = useState('direct');
  const [notice, setNotice] = useState('');
  const [historyFilter, setHistoryFilter] = useState('Todos');
  const [calendarMode, setCalendarMode] = useState('month');
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [form, setForm] = useState(() => initialDirectForm(data));
  const [campaignForm, setCampaignForm] = useState(() => initialCampaignForm());
  const [appointmentForm, setAppointmentForm] = useState(() => initialAppointmentForm(data, currentUser));
  const [editingAppointmentId, setEditingAppointmentId] = useState('');
  const [selectedAgendaDay, setSelectedAgendaDay] = useState('');

  const beneficiary = data.beneficiaries.find((item) => item.id === form.beneficiary_id);
  const latestDelivery = latestDeliveries.get(form.beneficiary_id);
  const communicationLogs = data.email_logs || [];
  const enrichedLogs = useMemo(() => communicationLogs.map(enrichLog), [communicationLogs]);
  const campaignLogs = useMemo(() => enrichedLogs.filter((log) => log.meta.kind === 'campaign'), [enrichedLogs]);
  const appointments = useMemo(() => buildAppointmentEntries(enrichedLogs, data), [enrichedLogs, data]);
  const reminderLogs = useMemo(() => enrichedLogs.filter((log) => log.meta.kind === 'appointment_reminder'), [enrichedLogs]);
  const visibleHistory = useMemo(() => filterHistory(enrichedLogs, historyFilter), [enrichedLogs, historyFilter]);
  const campaignRecipients = useMemo(() => resolveCampaignRecipients(data, campaignForm), [data, campaignForm]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarDate, calendarMode, appointments), [calendarDate, calendarMode, appointments]);
  const stats = {
    activeBeneficiaries: data.beneficiaries.filter((item) => item.is_active).length,
    campaigns: campaignLogs.length,
    appointments: appointments.length,
    pending: enrichedLogs.filter((log) => normalize(log.status).includes('pendiente')).length,
    errors: enrichedLogs.filter((log) => normalize(log.status).includes('error')).length
  };

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'communications') return;
    if (navigationTarget.filter === 'pending-emails') {
      setActiveTab('history');
      setHistoryFilter('Pendientes');
    } else if (navigationTarget.filter === 'agenda') {
      setActiveTab('agenda');
      setHistoryFilter('Todos');
      if (navigationTarget.profileId) {
        setAppointmentForm((current) => ({ ...current, beneficiary_id: navigationTarget.profileId }));
      }
    } else if (!navigationTarget.filter) {
      setHistoryFilter('Todos');
    }
  }, [navigationTarget]);

  useEffect(() => {
    if (processingRemindersRef.current) return;
    const due = enrichedLogs.filter((log) => (
      isPendingEmailLog(log)
      && log.meta.channel === 'Email'
      && ['appointment_reminder', 'campaign'].includes(log.meta.kind)
      && log.meta.scheduled_at
      && new Date(log.meta.scheduled_at) <= new Date()
    ));
    if (!due.length) return;
    processingRemindersRef.current = true;
    processDueEmailReminders(due).finally(() => { processingRemindersRef.current = false; });
  }, [enrichedLogs]);

  async function processDueEmailReminders(logs) {
    for (const log of logs) {
      try {
        await sendEmailViaApi({
          to: log.recipient,
          subject: log.subject,
          message: log.message,
          organization,
          logEmail: false
        });
        await actions.updateEmailLog(log.id, {
          status: 'Enviado',
          result: log.meta.kind === 'campaign' ? 'Campaña enviada automáticamente.' : 'Recordatorio enviado automáticamente.',
          sent_at: new Date().toISOString(),
          attachments: [{ ...log.meta, sent_at: new Date().toISOString() }]
        });
      } catch (error) {
        await actions.updateEmailLog(log.id, {
          status: 'Error',
          result: normalizeEmailError(error),
          attachments: [{ ...log.meta, error_at: new Date().toISOString() }]
        });
      }
    }
  }

  function update(field, value) {
    setNotice('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  function chooseBeneficiary(id) {
    const nextBeneficiary = data.beneficiaries.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      beneficiary_id: id,
      recipients: nextBeneficiary?.email || '',
      whatsappPhone: nextBeneficiary?.phone || '',
      message: current.template === 'documentation' ? documentationMessageForBeneficiary(nextBeneficiary, data) : current.message
    }));
  }

  function chooseTemplate(id) {
    const template = EMAIL_TEMPLATES.find((item) => item.id === id) || EMAIL_TEMPLATES[0];
    setForm((current) => ({
      ...current,
      template: id,
      subject: template.subject,
      message: id === 'documentation' ? documentationMessageForBeneficiary(beneficiary, data) : template.message,
      attachReceipt: id === 'receipt'
    }));
  }

  async function sendEmail(event) {
    event.preventDefault();
    if (!form.recipients) {
      setNotice('El beneficiario no tiene correo electrónico registrado o no se ha indicado destinatario.');
      return;
    }
    if (form.attachReceipt && !latestDelivery) {
      setNotice('No hay entregas registradas para generar un justificante PDF.');
      return;
    }

    setNotice('Generando PDF y enviando correo...');
    let attachments = [];
    const receiptEntries = form.attachReceipt && beneficiary && latestDelivery ? [{ delivery: latestDelivery, beneficiary }] : [];
    try {
      const payload = await sendEmailViaApi({
        to: form.recipients,
        subject: form.subject,
        message: form.message,
        receiptEntries,
        organization,
        logEmail: receiptEntries.length > 0
      });
      attachments = payload.attachments || [];
      if (receiptEntries.length) await actions.reloadData();
      else await saveEmailLog(actions, currentUser, { ...form, recipients: form.recipients }, attachments.length, payload.message || 'Correo enviado correctamente.', attachments, payload.id);
      setNotice(`Correo enviado correctamente. ID Resend: ${payload.id}`);
    } catch (error) {
      const message = normalizeEmailError(error);
      if (!receiptEntries.length) await saveEmailLog(actions, currentUser, { ...form, recipients: form.recipients }, attachments.length, message, attachments, '', 'Error');
      setNotice(message);
    }
  }

  async function downloadLatestReceipt() {
    if (beneficiary && latestDelivery) await printDeliveryReceiptPdf(latestDelivery, beneficiary, data.deliveries);
  }

  async function sendWhatsApp(event) {
    event.preventDefault();
    if (!beneficiary) {
      setNotice('Seleccione un beneficiario antes de enviar WhatsApp.');
      return;
    }
    const phone = normalizeWhatsAppPhone(form.whatsappPhone || beneficiary.phone);
    if (!phone) {
      setNotice('Este beneficiario no tiene un teléfono válido para WhatsApp.');
      return;
    }
    const url = buildWhatsAppUrl(phone, form.message);
    window.open(url, '_blank', 'noopener,noreferrer');
    setNotice('WhatsApp abierto correctamente. Revise el mensaje antes de enviarlo.');
    await createCommunicationLog({
      recipient: `WhatsApp ${phone}`,
      subject: `WhatsApp - ${form.subject || 'Comunicación'}`,
      message: form.message,
      status: 'Enviado',
      result: 'WhatsApp abierto correctamente',
      meta: { kind: 'direct', channel: 'WhatsApp', beneficiary_id: beneficiary.id, beneficiary_name: beneficiary.full_name, whatsapp_url: url }
    });
  }

  async function createCommunicationLog({ recipient, subject, message, status, result, meta, sentAt = new Date().toISOString() }) {
    await actions.createEmailLog({
      recipient,
      subject,
      message,
      sent_by: currentUserName(currentUser),
      sent_at: sentAt,
      receipts_count: 0,
      attachments: [{ ...meta, kind: meta?.kind || 'communication' }],
      receipt_ids: [],
      status,
      result
    });
  }

  function updateCampaign(field, value) {
    setNotice('');
    setCampaignForm((current) => ({ ...current, [field]: value }));
  }

  function toggleManualRecipient(id) {
    setCampaignForm((current) => {
      const selected = new Set(current.manualIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...current, manualIds: [...selected] };
    });
  }

  async function submitCampaign(event) {
    event.preventDefault();
    if (!campaignRecipients.length) {
      setNotice('No hay destinatarios para la campaña seleccionada.');
      return;
    }
    const scheduledAt = scheduledDateTime(campaignForm.scheduledDate, campaignForm.scheduledTime);
    const channels = selectedChannels(campaignForm.channel);
    let sent = 0;
    let pending = 0;
    let errors = 0;
    for (const recipient of campaignRecipients) {
      for (const channel of channels) {
        const meta = {
          kind: 'campaign',
          campaign_type: campaignForm.type,
          channel,
          scheduled_at: scheduledAt,
          location: campaignForm.location,
          map_url: mapsUrl(campaignForm.location),
          beneficiary_id: recipient.beneficiary_id,
          beneficiary_name: recipient.name
        };
        if (channel === 'Email') {
          if (!recipient.email) {
            errors += 1;
            await createCommunicationLog({ recipient: recipient.name, subject: campaignForm.subject, message: campaignForm.message, status: 'Error', result: 'Sin email registrado.', meta });
          } else if (isFutureDate(scheduledAt)) {
            pending += 1;
            await createCommunicationLog({ recipient: recipient.email, subject: campaignForm.subject, message: campaignForm.message, status: 'Pendiente', result: 'Campaña programada.', meta, sentAt: scheduledAt });
          } else {
            try {
              const payload = await sendEmailViaApi({ to: recipient.email, subject: campaignForm.subject, message: campaignForm.message, organization, logEmail: false });
              sent += 1;
              await createCommunicationLog({ recipient: recipient.email, subject: campaignForm.subject, message: campaignForm.message, status: 'Enviado', result: `Correo enviado. Resend: ${payload.id}`, meta });
            } catch (error) {
              errors += 1;
              await createCommunicationLog({ recipient: recipient.email, subject: campaignForm.subject, message: campaignForm.message, status: 'Error', result: normalizeEmailError(error), meta });
            }
          }
        } else {
          const phone = normalizeWhatsAppPhone(recipient.phone);
          const url = phone ? buildWhatsAppUrl(phone, campaignForm.message) : '';
          const status = phone && !isFutureDate(scheduledAt) ? 'Pendiente' : phone ? 'Pendiente' : 'Error';
          if (phone) pending += 1;
          else errors += 1;
          await createCommunicationLog({
            recipient: phone ? `WhatsApp ${phone}` : recipient.name,
            subject: `WhatsApp - ${campaignForm.subject}`,
            message: campaignForm.message,
            status,
            result: phone ? 'WhatsApp preparado para envío.' : 'Sin teléfono válido.',
            meta: { ...meta, whatsapp_url: url },
            sentAt: isFutureDate(scheduledAt) ? scheduledAt : new Date().toISOString()
          });
        }
      }
    }
    await actions.reloadData();
    setNotice(`Campaña registrada. Enviados: ${sent}. Pendientes: ${pending}. Errores: ${errors}.`);
  }

  function updateAppointment(field, value) {
    setNotice('');
    setAppointmentForm((current) => ({ ...current, [field]: value }));
  }

  function toggleReminder(id) {
    setAppointmentForm((current) => {
      const selected = new Set(current.reminders);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...current, reminders: [...selected] };
    });
  }

  async function submitAppointment(event) {
    event.preventDefault();
    const { selectedBeneficiary, family, appointmentAt, meta } = buildAppointmentPayload(appointmentForm);
    if (!selectedBeneficiary) {
      setNotice('Selecciona un beneficiario para crear la cita.');
      return;
    }
    if (editingAppointmentId) {
      const appointment = appointments.find((item) => item.id === editingAppointmentId);
      if (!appointment) {
        setNotice('No se ha podido encontrar la cita para editarla.');
        return;
      }
      await updateAppointmentRecord(
        appointment,
        { ...appointment.meta, ...meta, appointment_status: appointmentForm.status || appointment.status || 'Pendiente' },
        appointmentForm.status || appointment.status || 'Pendiente',
        appointmentForm.status === 'Realizada' ? 'Cita realizada y registrada en seguimiento.' : 'Cita actualizada.'
      );
      setEditingAppointmentId('');
      setAppointmentForm(() => initialAppointmentForm(data, currentUser));
      setNotice('Cita actualizada correctamente.');
      return;
    }
    const finalMeta = await maybeCreateAppointmentTracking('nueva-cita', meta);
    await createCommunicationLog({
      recipient: selectedBeneficiary.email || selectedBeneficiary.full_name,
      subject: `Cita: ${appointmentForm.type}`,
      message: appointmentSummaryMessage(appointmentForm, selectedBeneficiary, family),
      status: appointmentForm.status || 'Pendiente',
      result: 'Cita programada.',
      meta: finalMeta,
      sentAt: appointmentAt
    });
    await createAppointmentReminders(selectedBeneficiary, appointmentForm, finalMeta);
    await actions.reloadData();
    setNotice('Cita creada correctamente en la agenda.');
  }

  function buildAppointmentPayload(formState) {
    const selectedBeneficiary = data.beneficiaries.find((item) => item.id === formState.beneficiary_id);
    const appointmentAt = scheduledDateTime(formState.date, formState.time);
    const family = data.families.find((item) => item.id === (formState.family_id || selectedBeneficiary?.family_id));
    return {
      selectedBeneficiary,
      family,
      appointmentAt,
      meta: {
        kind: 'appointment',
        appointment_type: formState.type,
        beneficiary_id: selectedBeneficiary?.id || '',
        beneficiary_name: selectedBeneficiary?.full_name || '',
        family_id: family?.id || '',
        family_name: family?.family_code || '',
        appointment_at: appointmentAt,
        duration: formState.duration,
        responsible: formState.responsible,
        place: formState.place,
        map_url: mapsUrl(formState.place),
        notes: formState.notes,
        appointment_status: formState.status || 'Pendiente'
      }
    };
  }

  async function updateAppointmentRecord(appointment, nextMeta, nextStatus, result) {
    const finalMeta = await maybeCreateAppointmentTracking(appointment.id, { ...nextMeta, appointment_status: nextStatus });
    const selectedBeneficiary = data.beneficiaries.find((item) => item.id === finalMeta.beneficiary_id);
    const family = data.families.find((item) => item.id === finalMeta.family_id || item.id === selectedBeneficiary?.family_id);
    const formState = appointmentFormFromMeta(finalMeta);
    await actions.updateEmailLog(appointment.id, {
      recipient: selectedBeneficiary?.email || finalMeta.beneficiary_name || appointment.beneficiaryName,
      subject: `Cita: ${finalMeta.appointment_type || appointment.type}`,
      message: appointmentSummaryMessage(formState, selectedBeneficiary || { full_name: finalMeta.beneficiary_name }, family),
      status: nextStatus,
      result,
      sent_at: finalMeta.appointment_at,
      attachments: [finalMeta]
    });
    await updateRelatedAppointmentReminders(appointment, finalMeta, selectedBeneficiary, formState);
  }

  async function updateRelatedAppointmentReminders(appointment, finalMeta, selectedBeneficiary, formState) {
    const related = reminderLogs.filter((log) => (
      isPendingEmailLog(log)
      && log.meta.kind === 'appointment_reminder'
      && log.meta.beneficiary_id === appointment.beneficiaryId
      && log.meta.appointment_type === appointment.type
      && log.meta.appointment_at === appointment.appointmentAt
    ));
    const terminalStatus = ['Realizada', 'Cancelada', 'No asistió'].includes(finalMeta.appointment_status);
    for (const log of related) {
      const reminderAt = reminderDateTime(finalMeta.appointment_at, log.meta.reminder_time);
      const message = appointmentReminderMessage(formState, selectedBeneficiary || { full_name: finalMeta.beneficiary_name }, organization);
      const phone = normalizeWhatsAppPhone(selectedBeneficiary?.phone);
      const channel = log.meta.channel || log.channel;
      await actions.updateEmailLog(log.id, {
        subject: `Recordatorio: ${finalMeta.appointment_type || appointment.type}`,
        message,
        status: terminalStatus ? finalMeta.appointment_status : log.status,
        result: terminalStatus ? 'Recordatorio cerrado por el estado de la cita.' : 'Recordatorio actualizado con la cita.',
        sent_at: reminderAt,
        attachments: [{
          ...log.meta,
          ...finalMeta,
          kind: 'appointment_reminder',
          channel,
          reminder_time: log.meta.reminder_time,
          scheduled_at: reminderAt,
          whatsapp_url: channel === 'WhatsApp' && phone ? buildWhatsAppUrl(phone, message) : ''
        }]
      });
    }
  }

  async function maybeCreateAppointmentTracking(appointmentId, meta) {
    if (meta.appointment_status !== 'Realizada' || meta.tracking_created_at) return meta;
    await actions.createSocialHistory({
      beneficiary_id: meta.beneficiary_id,
      family_id: meta.family_id || null,
      date: String(meta.appointment_at || todayISO()).slice(0, 10),
      entry_type: 'Seguimiento',
      notes: buildAppointmentTrackingNote(meta)
    });
    return { ...meta, tracking_created_at: new Date().toISOString(), tracking_source: appointmentId };
  }

  function selectCalendarSlot(date, time = '') {
    setEditingAppointmentId('');
    setActiveTab('agenda');
    setCalendarDate(new Date(date));
    setAppointmentForm((current) => ({
      ...current,
      date,
      time: time || current.time,
      status: 'Pendiente'
    }));
    agendaFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function editAppointment(appointment) {
    setEditingAppointmentId(appointment.id);
    setAppointmentForm(appointmentFormFromEntry(appointment, currentUser));
    agendaFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelAppointmentEdit() {
    setEditingAppointmentId('');
    setAppointmentForm(() => initialAppointmentForm(data, currentUser));
  }

  async function changeAppointmentStatus(appointment, status) {
    await updateAppointmentRecord(
      appointment,
      { ...appointment.meta, appointment_status: status },
      status,
      status === 'Realizada' ? 'Cita realizada y registrada en seguimiento.' : `Cita marcada como ${status.toLowerCase()}.`
    );
    setNotice(`Cita marcada como ${status}.`);
  }

  async function deleteAppointment(appointment) {
    if (currentUser?.role !== 'Superadministrador') {
      setNotice('Solo el Superadministrador puede eliminar citas definitivamente.');
      return;
    }
    const confirmed = window.confirm(`Vas a eliminar definitivamente esta cita:\n\n${appointment.type}\n${appointment.beneficiaryName}\n${formatDateTime(appointment.appointmentAt)}\n\nEsta acción no se puede deshacer. ¿Continuar?`);
    if (!confirmed) return;
    const related = reminderLogs.filter((log) => (
      log.meta.kind === 'appointment_reminder'
      && log.meta.beneficiary_id === appointment.beneficiaryId
      && log.meta.appointment_type === appointment.type
      && log.meta.appointment_at === appointment.appointmentAt
    ));
    for (const log of related) {
      await actions.deleteEmailLog(log.id);
    }
    await actions.deleteEmailLog(appointment.id);
    if (editingAppointmentId === appointment.id) cancelAppointmentEdit();
    setNotice('Cita eliminada definitivamente.');
  }

  async function moveAppointment(appointmentId, date, time = '') {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    const nextTime = time || appointment.time || '09:00';
    const nextStatus = ['Realizada', 'Cancelada', 'No asistió'].includes(appointment.status) ? appointment.status : 'Reprogramada';
    await updateAppointmentRecord(
      appointment,
      { ...appointment.meta, appointment_at: scheduledDateTime(date, nextTime), appointment_status: nextStatus },
      nextStatus,
      'Cita reprogramada desde la agenda.'
    );
    setNotice('Cita reprogramada correctamente.');
  }

  async function resizeAppointment(appointmentId, date, endTime) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment || !endTime) return;
    const startTime = appointment.time || '09:00';
    const duration = Math.max(15, timeToMinutes(endTime) - timeToMinutes(startTime));
    await updateAppointmentRecord(
      appointment,
      { ...appointment.meta, appointment_at: scheduledDateTime(date || appointment.date, startTime), duration: minutesToDuration(duration) },
      appointment.status || 'Pendiente',
      'Duración de la cita actualizada desde la agenda.'
    );
    setNotice('Duración de la cita actualizada.');
  }

  async function createAppointmentReminders(selectedBeneficiary, appointment, appointmentMeta) {
    const channels = selectedChannels(appointment.reminderChannel);
    for (const reminderId of appointment.reminders) {
      const reminderAt = reminderDateTime(appointmentMeta.appointment_at, reminderId);
      for (const channel of channels) {
        const phone = normalizeWhatsAppPhone(selectedBeneficiary.phone);
        const recipient = channel === 'Email' ? selectedBeneficiary.email : phone ? `WhatsApp ${phone}` : selectedBeneficiary.full_name;
        const missing = channel === 'Email' ? !selectedBeneficiary.email : !phone;
        const reminderMessage = appointmentReminderMessage(appointment, selectedBeneficiary, organization);
        const meta = {
          ...appointmentMeta,
          kind: 'appointment_reminder',
          channel,
          reminder_time: reminderId,
          scheduled_at: reminderAt,
          whatsapp_url: channel === 'WhatsApp' && phone ? buildWhatsAppUrl(phone, reminderMessage) : ''
        };
        if (missing) {
          await createCommunicationLog({ recipient, subject: `Recordatorio: ${appointment.type}`, message: reminderMessage, status: 'Error', result: `Sin ${channel === 'Email' ? 'email' : 'teléfono'} registrado.`, meta, sentAt: reminderAt });
        } else if (channel === 'Email' && reminderId === 'created') {
          try {
            const payload = await sendEmailViaApi({ to: selectedBeneficiary.email, subject: `Recordatorio: ${appointment.type}`, message: reminderMessage, organization, logEmail: false });
            await createCommunicationLog({ recipient, subject: `Recordatorio: ${appointment.type}`, message: reminderMessage, status: 'Enviado', result: `Recordatorio enviado. Resend: ${payload.id}`, meta });
          } catch (error) {
            await createCommunicationLog({ recipient, subject: `Recordatorio: ${appointment.type}`, message: reminderMessage, status: 'Error', result: normalizeEmailError(error), meta });
          }
        } else {
          await createCommunicationLog({ recipient, subject: `Recordatorio: ${appointment.type}`, message: reminderMessage, status: 'Pendiente', result: 'Recordatorio programado.', meta, sentAt: reminderAt });
        }
      }
    }
  }

  function openBeneficiary(beneficiaryId) {
    if (!beneficiaryId || !onNavigate) return;
    onNavigate({ moduleId: 'beneficiaries', profileId: beneficiaryId });
  }

  return (
    <>
      <PageHeader title="Comunicaciones" description="Emails, WhatsApp, campañas, agenda e historial de seguimiento." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Beneficiarios activos" value={stats.activeBeneficiaries} />
        <Metric label="Campañas registradas" value={stats.campaigns} />
        <Metric label="Citas en agenda" value={stats.appointments} />
        <Metric label="Pendientes" value={stats.pending} />
        <Metric label="Errores" value={stats.errors} />
      </div>

      <section className="mb-5 overflow-x-auto rounded-md border border-slate-200 bg-white p-2 shadow-panel" aria-label="Pestañas de comunicaciones">
        <div className="flex min-w-max gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`focus-ring inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold ${activeTab === id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setActiveTab(id)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
      </section>

      {notice && <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">{notice}</div>}

      {activeTab === 'direct' && (
        <DirectMessagingPanel
          data={data}
          form={form}
          beneficiary={beneficiary}
          latestDelivery={latestDelivery}
          update={update}
          chooseBeneficiary={chooseBeneficiary}
          chooseTemplate={chooseTemplate}
          sendEmail={sendEmail}
          sendWhatsApp={sendWhatsApp}
          downloadLatestReceipt={downloadLatestReceipt}
        />
      )}

      {activeTab === 'campaigns' && (
        <CampaignsPanel
          data={data}
          form={campaignForm}
          recipients={campaignRecipients}
          logs={campaignLogs}
          update={updateCampaign}
          toggleManualRecipient={toggleManualRecipient}
          onSubmit={submitCampaign}
          onOpenBeneficiary={openBeneficiary}
        />
      )}

      {activeTab === 'agenda' && (
        <AgendaPanel
          data={data}
          form={appointmentForm}
          formRef={agendaFormRef}
          editingAppointmentId={editingAppointmentId}
          appointments={appointments}
          reminders={reminderLogs}
          calendarDays={calendarDays}
          calendarDate={calendarDate}
          calendarMode={calendarMode}
          selectedAgendaDay={selectedAgendaDay}
          update={updateAppointment}
          toggleReminder={toggleReminder}
          setCalendarDate={setCalendarDate}
          setCalendarMode={setCalendarMode}
          onSubmit={submitAppointment}
          onCancelEdit={cancelAppointmentEdit}
          onPickSlot={selectCalendarSlot}
          onEditAppointment={editAppointment}
          onMoveAppointment={moveAppointment}
          onResizeAppointment={resizeAppointment}
          onStatusChange={changeAppointmentStatus}
          onDeleteAppointment={deleteAppointment}
          onShowDay={setSelectedAgendaDay}
          onOpenBeneficiary={openBeneficiary}
          canDeleteAppointments={currentUser?.role === 'Superadministrador'}
        />
      )}

      {activeTab === 'history' && (
        <HistoryPanel logs={visibleHistory} filter={historyFilter} setFilter={setHistoryFilter} onOpenBeneficiary={openBeneficiary} />
      )}
    </>
  );
}

function DirectMessagingPanel({ data, form, beneficiary, latestDelivery, update, chooseBeneficiary, chooseTemplate, sendEmail, sendWhatsApp, downloadLatestReceipt }) {
  return (
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
            <textarea className={inputClass} rows="8" value={form.message} onChange={(event) => update('message', event.target.value)} />
          </FormField>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={form.attachReceipt} onChange={(event) => update('attachReceipt', event.target.checked)} />
            Adjuntar justificante PDF de la última entrega
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={!latestDelivery} onClick={downloadLatestReceipt}><Download size={18} /> Descargar PDF</Button>
            <Button type="submit"><Send size={18} /> Enviar email</Button>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Enviar WhatsApp</h3>
        <form className="mt-4 grid gap-4" onSubmit={sendWhatsApp}>
          <FormField label="Beneficiario">
            <select className={inputClass} value={form.beneficiary_id} onChange={(event) => chooseBeneficiary(event.target.value)}>
              {data.beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.full_name}</option>)}
            </select>
          </FormField>
          <FormField label="Teléfono WhatsApp">
            <input className={inputClass} value={form.whatsappPhone || ''} onChange={(event) => update('whatsappPhone', event.target.value)} placeholder="+34 600 000 000" />
          </FormField>
          <FormField label="Mensaje">
            <textarea className={inputClass} rows="8" value={form.message} onChange={(event) => update('message', event.target.value)} />
          </FormField>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            El botón abre WhatsApp Web o la aplicación del móvil con el mensaje preparado. El envío final se confirma desde WhatsApp.
          </div>
          <div className="flex justify-end">
            <Button type="submit"><MessageCircle size={18} /> Enviar WhatsApp</Button>
          </div>
        </form>
        {beneficiary && <p className="mt-4 text-sm text-slate-500">Beneficiario seleccionado: <strong>{beneficiary.full_name}</strong></p>}
      </section>
    </div>
  );
}

function CampaignsPanel({ data, form, recipients, logs, update, toggleManualRecipient, onSubmit, onOpenBeneficiary }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Nueva campaña</h3>
        <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Tipo">
              <select className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value)}>{CAMPAIGN_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
            </FormField>
            <FormField label="Destinatarios">
              <select className={inputClass} value={form.audience} onChange={(event) => update('audience', event.target.value)}>{RECIPIENT_GROUPS.map((item) => <option key={item}>{item}</option>)}</select>
            </FormField>
            <FormField label="Canal">
              <select className={inputClass} value={form.channel} onChange={(event) => update('channel', event.target.value)}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select>
            </FormField>
            <FormField label="Fecha programada"><input className={inputClass} type="date" value={form.scheduledDate} onChange={(event) => update('scheduledDate', event.target.value)} /></FormField>
            <FormField label="Hora programada"><input className={inputClass} type="time" value={form.scheduledTime} onChange={(event) => update('scheduledTime', event.target.value)} /></FormField>
            <FormField label="Ubicación del reparto"><input className={inputClass} value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Calle, municipio..." /></FormField>
          </div>
          {form.location && (
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => window.open(mapsUrl(form.location), '_blank', 'noopener,noreferrer')}><MapPin size={17} /> Abrir en Google Maps</Button>
            </div>
          )}
          {form.audience === 'Selección manual' && (
            <ManualRecipientPicker beneficiaries={data.beneficiaries} selected={form.manualIds} onToggle={toggleManualRecipient} />
          )}
          <FormField label="Asunto"><input className={inputClass} value={form.subject} onChange={(event) => update('subject', event.target.value)} /></FormField>
          <FormField label="Mensaje"><textarea className={inputClass} rows="7" value={form.message} onChange={(event) => update('message', event.target.value)} /></FormField>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <span>{recipients.length} destinatarios seleccionados.</span>
            <Button type="submit"><Megaphone size={18} /> Registrar campaña</Button>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Campañas registradas</h3>
        <div className="mt-4 space-y-3">
          {logs.slice(0, 12).map((log) => <CommunicationCard key={log.id} log={log} onOpenBeneficiary={onOpenBeneficiary} />)}
          {!logs.length && <EmptyText text="Todavía no hay campañas registradas." />}
        </div>
      </section>
    </div>
  );
}

function ManualRecipientPicker({ beneficiaries, selected, onToggle }) {
  const [query, setQuery] = useState('');
  const needle = normalize(query);
  const rows = beneficiaries.filter((item) => normalize(`${item.code} ${item.full_name} ${item.document_id}`).includes(needle));
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <label className="mb-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
        <Search size={16} className="text-slate-400" />
        <input className="w-full bg-transparent py-2 text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar beneficiario..." />
      </label>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {rows.map((item) => (
          <label key={item.id} className="flex items-center gap-3 rounded-md bg-white p-2 text-sm">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
            <span><strong>{item.code}</strong> - {item.full_name}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function AgendaPanel({
  data,
  form,
  formRef,
  editingAppointmentId,
  appointments,
  reminders,
  calendarDays,
  calendarDate,
  calendarMode,
  selectedAgendaDay,
  update,
  toggleReminder,
  setCalendarDate,
  setCalendarMode,
  onSubmit,
  onCancelEdit,
  onPickSlot,
  onEditAppointment,
  onMoveAppointment,
  onResizeAppointment,
  onStatusChange,
  onDeleteAppointment,
  onShowDay,
  onOpenBeneficiary,
  canDeleteAppointments
}) {
  const familyOptions = data.families.filter((family) => !form.beneficiary_id || data.beneficiaries.some((item) => item.id === form.beneficiary_id && item.family_id === family.id));
  const selectedDayAppointments = selectedAgendaDay ? appointments.filter((appointment) => appointment.date === selectedAgendaDay) : [];
  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <section ref={formRef} className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-ink">{editingAppointmentId ? 'Editar cita' : 'Nueva cita'}</h3>
          {editingAppointmentId && <Button type="button" variant="secondary" onClick={onCancelEdit}>Cancelar edición</Button>}
        </div>
        <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Tipo de cita"><select className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value)}>{APPOINTMENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
            <FormField label="Beneficiario"><select className={inputClass} value={form.beneficiary_id} onChange={(event) => update('beneficiary_id', event.target.value)}>{data.beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.full_name}</option>)}</select></FormField>
            <FormField label="Familia opcional"><select className={inputClass} value={form.family_id} onChange={(event) => update('family_id', event.target.value)}><option value="">Sin familia específica</option>{familyOptions.map((item) => <option key={item.id} value={item.id}>{item.family_code} - {item.responsible_name}</option>)}</select></FormField>
            <FormField label="Estado"><select className={inputClass} value={form.status} onChange={(event) => update('status', event.target.value)}>{APPOINTMENT_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
            <FormField label="Fecha"><input className={inputClass} type="date" required value={form.date} onChange={(event) => update('date', event.target.value)} /></FormField>
            <FormField label="Hora"><input className={inputClass} type="time" required value={form.time} onChange={(event) => update('time', event.target.value)} /></FormField>
            <FormField label="Duración"><input className={inputClass} value={form.duration} onChange={(event) => update('duration', event.target.value)} placeholder="30 minutos" /></FormField>
            <FormField label="Responsable"><input className={inputClass} value={form.responsible} onChange={(event) => update('responsible', event.target.value)} /></FormField>
            <FormField label="Lugar"><input className={inputClass} value={form.place} onChange={(event) => update('place', event.target.value)} /></FormField>
          </div>
          {form.place && <div className="flex justify-end"><Button type="button" variant="secondary" onClick={() => window.open(mapsUrl(form.place), '_blank', 'noopener,noreferrer')}><MapPin size={17} /> Abrir en Google Maps</Button></div>}
          <FormField label="Observaciones"><textarea className={inputClass} rows="4" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField>
          <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-bold text-ink">Recordatorios automáticos</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <FormField label="Canal"><select className={inputClass} value={form.reminderChannel} onChange={(event) => update('reminderChannel', event.target.value)}>{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></FormField>
              <div className="grid gap-2 pt-1">
                {REMINDER_TIMES.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.reminders.includes(item.id)} onChange={() => toggleReminder(item.id)} />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          </section>
          <div className="flex justify-end"><Button type="submit"><CalendarPlus size={18} /> {editingAppointmentId ? 'Guardar cita' : 'Crear cita'}</Button></div>
        </form>
      </section>

      <section className="space-y-5">
        <CalendarBoard
          days={calendarDays}
          date={calendarDate}
          mode={calendarMode}
          setDate={setCalendarDate}
          setMode={setCalendarMode}
          onPickSlot={onPickSlot}
          onEditAppointment={onEditAppointment}
          onMoveAppointment={onMoveAppointment}
          onResizeAppointment={onResizeAppointment}
          onShowDay={onShowDay}
        />
        {selectedAgendaDay && (
          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-bold text-ink">Citas del {formatDate(selectedAgendaDay)}</h3>
              <Button type="button" variant="secondary" onClick={() => onShowDay('')}>Cerrar listado</Button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedDayAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onEdit={onEditAppointment}
                  onStatusChange={onStatusChange}
                  onDelete={onDeleteAppointment}
                  onOpenBeneficiary={onOpenBeneficiary}
                  canDelete={canDeleteAppointments}
                />
              ))}
              {!selectedDayAppointments.length && <EmptyText text="No hay citas registradas para este día." />}
            </div>
          </section>
        )}
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-ink">Próximas citas</h3>
            <span className="text-sm text-slate-500">{reminders.filter(isPendingEmailLog).length} recordatorios pendientes</span>
          </div>
          <div className="mt-4 space-y-3">
            {appointments.slice(0, 12).map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                onEdit={onEditAppointment}
                onStatusChange={onStatusChange}
                onDelete={onDeleteAppointment}
                onOpenBeneficiary={onOpenBeneficiary}
                canDelete={canDeleteAppointments}
              />
            ))}
            {!appointments.length && <EmptyText text="Todavía no hay citas en la agenda." />}
          </div>
        </section>
      </section>
    </div>
  );
}

function CalendarBoard({ days, date, mode, setDate, setMode, onPickSlot, onEditAppointment, onMoveAppointment, onResizeAppointment, onShowDay }) {
  const title = mode === 'month'
    ? new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date)
    : `Semana del ${formatDate(days[0]?.date)}`;

  function handleDrop(event, day, time = '') {
    event.preventDefault();
    const [action, appointmentId] = String(event.dataTransfer.getData('text/plain') || '').split(':');
    if (!appointmentId) return;
    if (action === 'resize') onResizeAppointment(appointmentId, day.date, time);
    else onMoveAppointment(appointmentId, day.date, time);
  }

  function allowDrop(event) {
    event.preventDefault();
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-bold capitalize text-ink">{title}</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setDate(shiftCalendarDate(date, mode, -1))}>Anterior</Button>
          <Button type="button" variant="secondary" onClick={() => setDate(new Date())}>Hoy</Button>
          <Button type="button" variant="secondary" onClick={() => setDate(shiftCalendarDate(date, mode, 1))}>Siguiente</Button>
          <select className={`${inputClass} w-32`} value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="month">Mensual</option>
            <option value="week">Semanal</option>
          </select>
        </div>
      </div>
      {mode === 'month' ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-7">
          {days.map((day) => (
            <div
              key={day.date}
              role="button"
              tabIndex={0}
              className={`min-h-28 cursor-pointer rounded-md border p-2 text-left transition hover:border-brand-300 hover:bg-brand-50 ${day.isCurrent ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-slate-50'}`}
              onClick={() => onPickSlot(day.date)}
              onKeyDown={(event) => { if (event.key === 'Enter') onPickSlot(day.date); }}
              onDragOver={allowDrop}
              onDrop={(event) => handleDrop(event, day)}
            >
              <p className="text-xs font-bold text-slate-500">{formatCalendarDay(day.date)}</p>
              <div className="mt-2 space-y-1">
                {day.items.slice(0, 3).map((item) => (
                  <CalendarAppointmentChip key={item.id} item={item} compact onEdit={onEditAppointment} />
                ))}
                {day.items.length > 3 && (
                  <button
                    type="button"
                    className="text-xs font-bold text-brand-700 hover:text-brand-800"
                    onClick={(event) => {
                      event.stopPropagation();
                      onShowDay(day.date);
                    }}
                  >
                    +{day.items.length - 3} más
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-[76px_repeat(7,minmax(120px,1fr))] rounded-md border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 p-2 text-xs font-bold uppercase text-slate-500">Hora</div>
            {days.map((day) => (
              <button key={day.date} type="button" className="border-b border-l border-slate-200 bg-slate-50 p-2 text-left text-xs font-bold text-slate-600 hover:bg-brand-50" onClick={() => onPickSlot(day.date)}>
                {formatCalendarDay(day.date)}
              </button>
            ))}
            {CALENDAR_HOURS.map((hour) => (
              <CalendarHourRow
                key={hour}
                hour={hour}
                days={days}
                onPickSlot={onPickSlot}
                onEditAppointment={onEditAppointment}
                onDragOver={allowDrop}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CalendarHourRow({ hour, days, onPickSlot, onEditAppointment, onDragOver, onDrop }) {
  return (
    <>
      <div className="border-b border-slate-100 bg-white p-2 text-xs font-semibold text-slate-500">{hour}</div>
      {days.map((day) => {
        const items = day.items.filter((item) => item.time === hour || (timeToMinutes(item.time) >= timeToMinutes(hour) && timeToMinutes(item.time) < timeToMinutes(hour) + 60));
        return (
          <div
            key={`${day.date}-${hour}`}
            role="button"
            tabIndex={0}
            className="min-h-20 cursor-pointer border-b border-l border-slate-100 bg-white p-2 text-left transition hover:bg-brand-50"
            onClick={() => onPickSlot(day.date, hour)}
            onKeyDown={(event) => { if (event.key === 'Enter') onPickSlot(day.date, hour); }}
            onDragOver={onDragOver}
            onDrop={(event) => onDrop(event, day, hour)}
          >
            <div className="space-y-1">
              {items.map((item) => (
                <CalendarAppointmentChip key={item.id} item={item} onEdit={onEditAppointment} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CalendarAppointmentChip({ item, compact = false, onEdit }) {
  function startDrag(event, action) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${action}:${item.id}`);
  }

  return (
    <div
      className="group rounded border border-brand-100 bg-white px-2 py-1 text-xs shadow-sm"
      draggable
      onDragStart={(event) => startDrag(event, 'move')}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className="block w-full truncate text-left font-semibold text-brand-700" onClick={() => onEdit(item)}>
        {compact ? `${item.type} · ${item.time}` : `${item.time} · ${item.type}`}
      </button>
      {!compact && <p className="truncate text-[11px] text-slate-500">{item.beneficiaryName}</p>}
      {!compact && (
        <button
          type="button"
          className="mt-1 h-2 w-full cursor-ns-resize rounded bg-slate-200 opacity-80 transition group-hover:bg-brand-300"
          title="Arrastrar para cambiar duración"
          draggable
          onDragStart={(event) => startDrag(event, 'resize')}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}

function AppointmentCard({ appointment, onEdit, onStatusChange, onDelete, onOpenBeneficiary, canDelete }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="text-left text-sm font-bold text-ink hover:text-brand-700" onClick={() => onEdit(appointment)}>{appointment.type}</button>
            <StatusPill status={appointment.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">{appointment.beneficiaryName} · {formatDateTime(appointment.appointmentAt)}</p>
          <p className="mt-1 text-sm text-slate-500">{appointment.place || 'Lugar no indicado'} · {appointment.duration || 'Duración no indicada'}</p>
          {appointment.notes && <p className="mt-2 text-sm text-slate-600">{appointment.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <select className={`${inputClass} w-40`} value={appointment.status} onChange={(event) => onStatusChange(appointment, event.target.value)}>
            {APPOINTMENT_STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <Button type="button" variant="secondary" onClick={() => onEdit(appointment)}><CalendarPlus size={16} /> Editar</Button>
          {appointment.mapUrl && <Button type="button" variant="secondary" onClick={() => window.open(appointment.mapUrl, '_blank', 'noopener,noreferrer')}><MapPin size={16} /> Mapa</Button>}
          <Button type="button" variant="secondary" onClick={() => onOpenBeneficiary(appointment.beneficiaryId)}><ExternalLink size={16} /> Abrir expediente</Button>
          {canDelete && <Button type="button" variant="danger" onClick={() => onDelete(appointment)}><Trash2 size={16} /> Eliminar</Button>}
        </div>
      </div>
    </article>
  );
}

function HistoryPanel({ logs, filter, setFilter, onOpenBeneficiary }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-bold text-ink">Historial de comunicaciones</h3>
        <select className={`${inputClass} sm:w-56`} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option>Todos</option>
          <option>Enviados</option>
          <option>Pendientes</option>
          <option>Errores</option>
        </select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Estado</th><th>Fecha</th><th>Hora</th><th>Canal</th><th>Destinatario</th><th>Asunto</th><th>Resultado</th><th>Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3"><StatusPill status={log.status} /></td>
                <td>{formatDate(log.sent_at)}</td>
                <td>{formatTime(log.sent_at)}</td>
                <td>{log.channel}</td>
                <td>{log.recipient}</td>
                <td>{log.subject || '-'}</td>
                <td>{log.result || '-'}</td>
                <td><HistoryActions log={log} onOpenBeneficiary={onOpenBeneficiary} /></td>
              </tr>
            ))}
            {!logs.length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="8">Sin comunicaciones registradas.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HistoryActions({ log, onOpenBeneficiary }) {
  return (
    <div className="flex flex-wrap gap-2">
      {log.meta.beneficiary_id && <Button type="button" variant="secondary" onClick={() => onOpenBeneficiary(log.meta.beneficiary_id)}><ExternalLink size={15} /> Expediente</Button>}
      {log.meta.whatsapp_url && <Button type="button" variant="secondary" onClick={() => window.open(log.meta.whatsapp_url, '_blank', 'noopener,noreferrer')}><MessageCircle size={15} /> WhatsApp</Button>}
      {log.meta.map_url && <Button type="button" variant="secondary" onClick={() => window.open(log.meta.map_url, '_blank', 'noopener,noreferrer')}><MapPin size={15} /> Mapa</Button>}
    </div>
  );
}

function CommunicationCard({ log, onOpenBeneficiary }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-bold text-ink">{log.meta.campaign_type || log.subject}</p>
          <p className="mt-1 text-sm text-slate-600">{log.recipient} · {log.channel}</p>
          <p className="mt-1 text-sm text-slate-500">{formatDateTime(log.sent_at)} · {log.result}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <StatusPill status={log.status} />
          {log.meta.beneficiary_id && <Button type="button" variant="secondary" onClick={() => onOpenBeneficiary(log.meta.beneficiary_id)}><ExternalLink size={15} /> Expediente</Button>}
          {log.meta.whatsapp_url && <Button type="button" variant="secondary" onClick={() => window.open(log.meta.whatsapp_url, '_blank', 'noopener,noreferrer')}><MessageCircle size={15} /> WhatsApp</Button>}
        </div>
      </div>
    </article>
  );
}

function StatusPill({ status }) {
  const normalized = normalize(status);
  let tone = 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (normalized.includes('error')) tone = 'bg-red-50 text-red-700 ring-red-200';
  else if (normalized.includes('cancelada') || normalized.includes('no asistio')) tone = 'bg-slate-100 text-slate-700 ring-slate-200';
  else if (normalized.includes('reprogramada')) tone = 'bg-blue-50 text-blue-700 ring-blue-200';
  else if (normalized.includes('pendiente')) tone = 'bg-amber-50 text-amber-700 ring-amber-200';
  else if (normalized.includes('confirmada')) tone = 'bg-brand-50 text-brand-700 ring-brand-100';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${tone}`}>{status || 'Enviado'}</span>;
}

function Metric({ label, value }) {
  return <div className="rounded-md border border-slate-200 bg-white p-4 shadow-panel"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink">{value}</p></div>;
}

function EmptyText({ text }) {
  return <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{text}</div>;
}

function initialDirectForm(data) {
  return {
    beneficiary_id: data.beneficiaries[0]?.id || '',
    template: 'receipt',
    recipients: data.beneficiaries[0]?.email || '',
    whatsappPhone: data.beneficiaries[0]?.phone || '',
    subject: EMAIL_TEMPLATES[0].subject,
    message: EMAIL_TEMPLATES[0].message,
    attachReceipt: true
  };
}

function initialCampaignForm() {
  return {
    type: 'Reparto de alimentos',
    audience: 'Solo activos',
    channel: 'Email',
    scheduledDate: todayISO(),
    scheduledTime: '',
    location: '',
    subject: 'Información importante - Pan y Esperanza',
    message: 'Le informamos de una comunicación importante de la Asociación Pan y Esperanza.',
    manualIds: []
  };
}

function initialAppointmentForm(data, currentUser) {
  return {
    type: 'Entrevista',
    beneficiary_id: data.beneficiaries[0]?.id || '',
    family_id: '',
    date: todayISO(),
    time: '10:00',
    duration: '30 minutos',
    status: 'Pendiente',
    responsible: currentUserName(currentUser),
    place: '',
    notes: '',
    reminderChannel: 'Email',
    reminders: ['24h']
  };
}

function latestDeliveriesByBeneficiary(deliveries = []) {
  const byBeneficiary = new Map();
  deliveries.forEach((delivery) => {
    const current = byBeneficiary.get(delivery.beneficiary_id);
    if (!current || String(delivery.delivered_at || '') > String(current.delivered_at || '')) byBeneficiary.set(delivery.beneficiary_id, delivery);
  });
  return byBeneficiary;
}

function documentationMessageForBeneficiary(beneficiary, data) {
  const pending = pendingDocumentsForBeneficiary(beneficiary, data);
  const list = pending.length ? pending.map((item) => `• ${documentLabel(item)}`).join('\n') : '• No consta documentación pendiente en este momento.';
  return [
    'Para completar su expediente necesitamos que nos aporte la siguiente documentación:',
    '',
    'Documentación pendiente',
    list,
    '',
    'Si ya ha entregado esta documentación, puede ignorar este mensaje.',
    '',
    'Si necesita ayuda o tiene cualquier duda, puede responder a este correo o ponerse en contacto con la Asociación Pan y Esperanza.',
    '',
    'Muchas gracias por su colaboración.'
  ].join('\n');
}

function pendingDocumentsForBeneficiary(beneficiary, data) {
  if (!beneficiary) return REQUIRED_DOCUMENTS;
  const docs = (data.beneficiary_documents || []).filter((doc) => doc.beneficiary_id === beneficiary.id);
  return REQUIRED_DOCUMENTS.filter((required) => !docs.some((doc) => normalize(doc.document_type).includes(normalize(required.split('/')[0])) || normalize(required).includes(normalize(doc.document_type))));
}

function documentLabel(type) {
  if (normalize(type).includes('dni')) return 'DNI';
  if (normalize(type).includes('empadronamiento')) return 'Certificado de empadronamiento';
  return type;
}

function resolveCampaignRecipients(data, form) {
  if (form.audience === 'Solo familias') {
    return data.families.map((family) => {
      const members = data.beneficiaries.filter((item) => item.family_id === family.id);
      const responsible = members.find((item) => normalize(item.full_name) === normalize(family.responsible_name)) || members[0] || {};
      return {
        beneficiary_id: responsible.id || '',
        name: family.responsible_name || responsible.full_name || family.family_code,
        email: family.email || responsible.email || '',
        phone: family.phone || responsible.phone || ''
      };
    }).filter((item) => item.name);
  }
  let rows = data.beneficiaries;
  if (form.audience === 'Solo activos') rows = rows.filter((item) => item.is_active);
  if (form.audience === 'Solo urgentes') rows = rows.filter((item) => normalize(item.situation).includes('urgente'));
  if (form.audience === 'Selección manual') rows = rows.filter((item) => form.manualIds.includes(item.id));
  return rows.map((item) => ({ beneficiary_id: item.id, name: item.full_name, email: item.email || '', phone: item.phone || '' }));
}

function selectedChannels(value) {
  return value === 'Ambos' ? ['Email', 'WhatsApp'] : [value];
}

function scheduledDateTime(date, time) {
  const cleanDate = date || todayISO();
  return `${cleanDate}T${time || '09:00'}:00`;
}

function isFutureDate(value) {
  return value && new Date(value) > new Date();
}

function mapsUrl(location) {
  return location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : '';
}

function enrichLog(log) {
  const meta = Array.isArray(log.attachments) ? (log.attachments.find((item) => item?.kind) || {}) : {};
  const metaStatus = meta.kind === 'appointment' ? meta.appointment_status : '';
  return {
    ...log,
    meta,
    status: metaStatus || log.status || (normalize(log.result).includes('error') ? 'Error' : 'Enviado'),
    channel: meta.channel || inferChannel(log)
  };
}

function inferChannel(log) {
  if (normalize(log.recipient).includes('whatsapp') || normalize(log.subject).includes('whatsapp')) return 'WhatsApp';
  return 'Email';
}

function buildAppointmentEntries(logs, data) {
  return logs
    .filter((log) => log.meta.kind === 'appointment')
    .map((log) => {
      const beneficiary = data.beneficiaries.find((item) => item.id === log.meta.beneficiary_id);
      const appointmentAt = log.meta.appointment_at || log.sent_at;
      return {
        id: log.id,
        meta: log.meta,
        type: log.meta.appointment_type || 'Cita',
        beneficiaryId: log.meta.beneficiary_id,
        beneficiaryName: log.meta.beneficiary_name || beneficiary?.full_name || 'Beneficiario',
        familyId: log.meta.family_id || beneficiary?.family_id || '',
        appointmentAt,
        date: String(appointmentAt || '').slice(0, 10),
        time: String(appointmentAt || '').slice(11, 16),
        duration: log.meta.duration || '',
        responsible: log.meta.responsible || '',
        place: log.meta.place || '',
        mapUrl: log.meta.map_url || '',
        notes: log.meta.notes || '',
        status: log.meta.appointment_status || log.status || 'Pendiente'
      };
    })
    .sort((a, b) => String(a.appointmentAt).localeCompare(String(b.appointmentAt)));
}

function filterHistory(logs, filter) {
  if (filter === 'Pendientes') return logs.filter((log) => normalize(log.status).includes('pendiente'));
  if (filter === 'Errores') return logs.filter((log) => normalize(log.status).includes('error'));
  if (filter === 'Enviados') return logs.filter((log) => normalize(log.status).includes('enviado'));
  return logs;
}

function buildCalendarDays(date, mode, appointments) {
  const start = mode === 'month' ? startOfMonthGrid(date) : startOfWeek(date);
  const total = mode === 'month' ? 42 : 7;
  const appointmentMap = new Map();
  appointments.forEach((appointment) => {
    if (!appointmentMap.has(appointment.date)) appointmentMap.set(appointment.date, []);
    appointmentMap.get(appointment.date).push(appointment);
  });
  return Array.from({ length: total }, (_, index) => {
    const day = addDays(start, index);
    const iso = day.toISOString().slice(0, 10);
    return {
      date: iso,
      isCurrent: iso === todayISO(),
      items: appointmentMap.get(iso) || []
    };
  });
}

function startOfMonthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(first);
}

function startOfWeek(date) {
  const day = new Date(date);
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shiftCalendarDate(date, mode, direction) {
  const next = new Date(date);
  if (mode === 'month') next.setMonth(next.getMonth() + direction);
  else next.setDate(next.getDate() + (direction * 7));
  return next;
}

function formatCalendarDay(value) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit' }).format(new Date(value));
}

function reminderDateTime(appointmentAt, reminderId) {
  const date = new Date(appointmentAt);
  if (reminderId === 'created') return new Date().toISOString();
  if (reminderId === '24h') date.setHours(date.getHours() - 24);
  if (reminderId === '2h') date.setHours(date.getHours() - 2);
  return date.toISOString();
}

function appointmentFormFromEntry(appointment, currentUser) {
  return {
    ...appointmentFormFromMeta(appointment.meta),
    beneficiary_id: appointment.beneficiaryId || appointment.meta.beneficiary_id || '',
    family_id: appointment.familyId || appointment.meta.family_id || '',
    status: appointment.status || appointment.meta.appointment_status || 'Pendiente',
    responsible: appointment.responsible || appointment.meta.responsible || currentUserName(currentUser),
    reminderChannel: 'Email',
    reminders: []
  };
}

function appointmentFormFromMeta(meta = {}) {
  const appointmentAt = meta.appointment_at || scheduledDateTime(todayISO(), '10:00');
  return {
    type: meta.appointment_type || 'Entrevista',
    beneficiary_id: meta.beneficiary_id || '',
    family_id: meta.family_id || '',
    date: String(appointmentAt).slice(0, 10) || todayISO(),
    time: String(appointmentAt).slice(11, 16) || '10:00',
    duration: meta.duration || '30 minutos',
    status: meta.appointment_status || 'Pendiente',
    responsible: meta.responsible || '',
    place: meta.place || '',
    notes: meta.notes || '',
    reminderChannel: 'Email',
    reminders: []
  };
}

function buildAppointmentTrackingNote(meta = {}) {
  return [
    'Cita realizada desde Agenda.',
    `Tipo de cita: ${meta.appointment_type || 'Cita'}.`,
    `Hora: ${String(meta.appointment_at || '').slice(11, 16) || '-'}.`,
    meta.responsible ? `Responsable: ${meta.responsible}.` : '',
    meta.place ? `Lugar: ${meta.place}.` : '',
    meta.notes ? `Observaciones: ${meta.notes}` : 'Observaciones: sin observaciones registradas.'
  ].filter(Boolean).join('\n');
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map((part) => Number(part));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesToDuration(value) {
  const minutes = Math.max(15, Number(value || 0));
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function appointmentSummaryMessage(form, beneficiary, family) {
  return [
    `Cita programada: ${form.type}`,
    `Beneficiario: ${beneficiary.full_name}`,
    family ? `Familia: ${family.family_code} - ${family.responsible_name}` : '',
    `Fecha: ${formatDate(scheduledDateTime(form.date, form.time))}`,
    `Hora: ${form.time}`,
    `Duración: ${form.duration}`,
    `Responsable: ${form.responsible}`,
    form.place ? `Lugar: ${form.place}` : '',
    form.notes ? `Observaciones: ${form.notes}` : ''
  ].filter(Boolean).join('\n');
}

function appointmentReminderMessage(form, beneficiary, organization = {}) {
  const association = organization.name || 'Asociación Pan y Esperanza';
  return [
    `Nombre del beneficiario: ${beneficiary.full_name}`,
    `Fecha: ${formatDate(scheduledDateTime(form.date, form.time))}`,
    `Hora: ${form.time}`,
    `Lugar: ${form.place || 'No indicado'}`,
    `Motivo: ${form.type}`,
    form.notes ? `Observaciones: ${form.notes}` : '',
    `Asociación: ${association}`,
    organization.phone ? `Teléfono de contacto: ${organization.phone}` : '',
    form.place ? `Google Maps: ${mapsUrl(form.place)}` : ''
  ].filter(Boolean).join('\n');
}

function currentUserName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Usuario';
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function isPendingEmailLog(log) {
  const status = normalize(log.status || '');
  const result = normalize(log.result || '');
  return status.includes('pendiente') || status.includes('pending') || result.includes('pendiente') || result.includes('pending') || result.includes('programado');
}

export function normalizeWhatsAppPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `34${digits}`;
  if (digits.startsWith('00')) return digits.slice(2);
  return digits.length >= 10 ? digits : '';
}

export function buildWhatsAppUrl(phone, message) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message || '')}`;
}
