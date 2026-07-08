import {
  Archive,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  Download,
  Edit3,
  FileText,
  GraduationCap,
  History,
  IdCard,
  Mail,
  MessageCircle,
  NotebookPen,
  Plus,
  Printer,
  Trash2,
  UserRoundCheck
} from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';
import { canDo } from '../lib/auth';
import { formatDate, formatDateTime, normalize, todayISO } from '../lib/formatters';

const VOLUNTEER_META_START = '[PYE_VOLUNTEER_META]';
const VOLUNTEER_META_END = '[/PYE_VOLUNTEER_META]';
const PARTICIPATION_TYPES = ['Reparto', 'Recogida', 'Clasificación', 'Evento', 'Campaña'];
const DOCUMENT_TYPES = ['DNI', 'Certificado', 'Autorización', 'Curso', 'Otros documentos'];
const PROFILE_TABS = [
  { id: 'summary', label: 'Resumen', icon: BadgeCheck },
  { id: 'personal', label: 'Datos personales', icon: UserRoundCheck },
  { id: 'participations', label: 'Participaciones', icon: ClipboardList },
  { id: 'training', label: 'Formación', icon: GraduationCap },
  { id: 'documents', label: 'Documentación', icon: FileText },
  { id: 'communications', label: 'Comunicaciones', icon: Mail },
  { id: 'observations', label: 'Observaciones', icon: NotebookPen },
  { id: 'history', label: 'Historial', icon: History }
];

export function Volunteers({ data, actions, currentUser }) {
  const [modal, setModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('code');
  const volunteers = useMemo(() => enrichVolunteers(data.volunteers || []), [data.volunteers]);
  const visibleVolunteers = useMemo(() => filterAndSortVolunteers(volunteers, searchTerm, sortBy), [volunteers, searchTerm, sortBy]);
  const canManage = canManageVolunteers(currentUser);
  const canDelete = currentUser?.role === 'Superadministrador';

  async function saveVolunteer(form, current = null) {
    const payload = volunteerPayloadFromForm(form, volunteers, current);
    if (current) await actions.updateVolunteer(current.id, payload);
    else await actions.createVolunteer(payload);
    setModal(null);
  }

  async function archiveVolunteer(volunteer) {
    const nextArchived = volunteer.status !== 'Archivado';
    const reason = nextArchived ? window.prompt('Motivo del archivado', 'Fin de colaboración') : '';
    const meta = {
      ...volunteer.meta,
      status: nextArchived ? 'Archivado' : 'Activo',
      archived_at: nextArchived ? new Date().toISOString() : '',
      archived_by: nextArchived ? currentUserName(currentUser) : '',
      archive_reason: nextArchived ? reason || 'Sin motivo indicado' : ''
    };
    await actions.updateVolunteer(volunteer.id, volunteerPayloadFromParsed(volunteer, meta));
  }

  async function deleteVolunteer(volunteer) {
    if (!canDelete) return;
    const confirmed = window.confirm(`Eliminar definitivamente el expediente de ${volunteer.full_name}?\n\nEsta acción no se puede deshacer.`);
    if (!confirmed) return;
    await actions.deleteVolunteer(volunteer.id);
    if (modal?.volunteer?.id === volunteer.id) setModal(null);
  }

  async function addHistory(volunteer, payload) {
    await actions.createVolunteerHistory({
      volunteer_id: volunteer.id,
      date: payload.date || todayISO(),
      activity: payload.activity,
      hours: payload.hours || null,
      notes: payload.notes || ''
    });
    setModal({ type: 'profile', volunteer: refreshVolunteer(volunteer, data.volunteers || []) });
  }

  return (
    <>
      <PageHeader
        title="Voluntarios"
        description="Expedientes, carnés, documentación e historial de colaboración."
        actions={canManage && <Button onClick={() => setModal({ type: 'create' })}><Plus size={18} /> Nuevo voluntario</Button>}
      />

      <section className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[1fr_220px]">
        <FormField label="Buscar voluntario">
          <input
            className={inputClass}
            placeholder="Código, nombre, DNI, teléfono o email"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </FormField>
        <FormField label="Ordenar por">
          <select className={inputClass} value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="code">Código</option>
            <option value="name">Nombre</option>
            <option value="joined_at">Fecha de alta</option>
            <option value="status">Estado</option>
          </select>
        </FormField>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleVolunteers.map((volunteer) => (
          <VolunteerCard
            key={volunteer.id}
            volunteer={volunteer}
            stats={volunteerStats(volunteer, data.volunteer_history || [])}
            canManage={canManage}
            canDelete={canDelete}
            onOpen={() => setModal({ type: 'profile', volunteer })}
            onEdit={() => setModal({ type: 'edit', volunteer })}
            onArchive={() => archiveVolunteer(volunteer)}
            onDelete={() => deleteVolunteer(volunteer)}
          />
        ))}
        {!visibleVolunteers.length && (
          <div className="rounded-md border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            {volunteers.length ? 'No hay voluntarios que coincidan con la búsqueda.' : 'Todavía no hay voluntarios registrados.'}
          </div>
        )}
      </section>

      {modal?.type === 'create' && (
        <Modal title="Nuevo voluntario" onClose={() => setModal(null)} wide>
          <VolunteerForm volunteers={volunteers} onSubmit={(payload) => saveVolunteer(payload)} />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title="Editar voluntario" onClose={() => setModal(null)} wide>
          <VolunteerForm volunteers={volunteers} initial={modal.volunteer} onSubmit={(payload) => saveVolunteer(payload, modal.volunteer)} />
        </Modal>
      )}

      {modal?.type === 'profile' && (
        <Modal title="Expediente del voluntario" onClose={() => setModal(null)} wide>
          <VolunteerProfile
            volunteer={refreshVolunteer(modal.volunteer, data.volunteers || [])}
            data={data}
            currentUser={currentUser}
            canManage={canManage}
            canDelete={canDelete}
            onEdit={() => setModal({ type: 'edit', volunteer: refreshVolunteer(modal.volunteer, data.volunteers || []) })}
            onArchive={() => archiveVolunteer(refreshVolunteer(modal.volunteer, data.volunteers || []))}
            onDelete={() => deleteVolunteer(refreshVolunteer(modal.volunteer, data.volunteers || []))}
            onAddHistory={(payload) => addHistory(refreshVolunteer(modal.volunteer, data.volunteers || []), payload)}
          />
        </Modal>
      )}
    </>
  );
}

function VolunteerCard({ volunteer, stats, canManage, canDelete, onOpen, onEdit, onArchive, onDelete }) {
  const archived = volunteer.status === 'Archivado';
  return (
    <article className={`rounded-md border p-4 shadow-panel ${archived ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <VolunteerPhoto volunteer={volunteer} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold text-ink">{volunteer.full_name}</h3>
            <StatusBadge status={volunteer.status} />
          </div>
          <p className="mt-1 text-sm font-semibold text-brand-700">{volunteer.code}</p>
          <p className="mt-1 text-sm text-slate-600">Alta: {formatDate(volunteer.joined_at)}</p>
          <p className="mt-1 text-sm text-slate-600">Disponibilidad: {volunteer.availability || '-'}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <MiniMetric label="Particip." value={stats.total} />
        <MiniMetric label="Días" value={stats.days} />
        <MiniMetric label="Última" value={stats.last ? formatDate(stats.last) : '-'} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onOpen}><IdCard size={16} /> Abrir expediente</Button>
        {canManage && <Button type="button" variant="secondary" onClick={onEdit}><Edit3 size={16} /> Editar</Button>}
        {canManage && <Button type="button" variant="secondary" onClick={onArchive}><Archive size={16} /> {archived ? 'Reactivar' : 'Archivar'}</Button>}
        {canDelete && <Button type="button" variant="danger" onClick={onDelete}><Trash2 size={16} /> Eliminar</Button>}
      </div>
    </article>
  );
}

function VolunteerProfile({ volunteer, data, currentUser, canManage, canDelete, onEdit, onArchive, onDelete, onAddHistory }) {
  const [tab, setTab] = useState('summary');
  const history = volunteerHistoryFor(data, volunteer.id);
  const stats = volunteerStats(volunteer, history);
  const communications = volunteerCommunications(data.email_logs || [], volunteer);

  return (
    <div>
      <header className="rounded-md border border-brand-100 bg-brand-50 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <VolunteerPhoto volunteer={volunteer} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-ink">{volunteer.full_name}</h2>
                <StatusBadge status={volunteer.status} />
              </div>
              <p className="mt-1 font-semibold text-brand-700">{volunteer.code}</p>
              <p className="mt-1 text-sm text-slate-600">Alta: {formatDate(volunteer.joined_at)} · {volunteer.email || 'Sin email'} · {volunteer.phone || 'Sin teléfono'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => printVolunteerCardPdf(volunteer, data.organization_settings?.[0])}><Printer size={16} /> Carné PDF</Button>
            <Button type="button" variant="secondary" onClick={() => printVolunteerProfilePdf(volunteer, history, communications, data.organization_settings?.[0])}><FileText size={16} /> Expediente PDF</Button>
            <Button type="button" variant="secondary" onClick={() => downloadVolunteerCertificate(volunteer, history, data.organization_settings?.[0])}><Download size={16} /> Certificado</Button>
            {canManage && <Button type="button" variant="secondary" onClick={onEdit}><Edit3 size={16} /> Editar</Button>}
            {canManage && <Button type="button" variant="secondary" onClick={onArchive}><Archive size={16} /> {volunteer.status === 'Archivado' ? 'Reactivar' : 'Archivar'}</Button>}
            {canDelete && <Button type="button" variant="danger" onClick={onDelete}><Trash2 size={16} /> Eliminar</Button>}
          </div>
        </div>
      </header>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {PROFILE_TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button key={item.id} className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab(item.id)}>
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </nav>

      <section className="mt-4">
        {tab === 'summary' && <VolunteerSummary volunteer={volunteer} history={history} stats={stats} organization={data.organization_settings?.[0]} />}
        {tab === 'personal' && <PersonalDetails volunteer={volunteer} />}
        {tab === 'participations' && <ParticipationPanel history={history} canManage={canManage} onAdd={onAddHistory} />}
        {tab === 'training' && <TrainingPanel history={history} volunteer={volunteer} canManage={canManage} onAdd={onAddHistory} />}
        {tab === 'documents' && <DocumentsPanel history={history} canManage={canManage} onAdd={onAddHistory} />}
        {tab === 'communications' && <CommunicationsPanel communications={communications} />}
        {tab === 'observations' && <ObservationsPanel history={history} currentUser={currentUser} canManage={canManage} onAdd={onAddHistory} />}
        {tab === 'history' && <HistoryPanel history={history} />}
      </section>
    </div>
  );
}

function VolunteerSummary({ volunteer, history, stats, organization }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Participaciones" value={stats.total} detail="Colaboraciones registradas" />
        <MetricCard label="Días colaborados" value={stats.days} detail="Fechas distintas" />
        <MetricCard label="Última actividad" value={stats.last ? formatDate(stats.last) : '-'} detail={stats.lastActivity || 'Sin actividad'} />
        <InfoCard title="Disponibilidad" value={volunteer.availability || '-'} />
        <InfoCard title="Tareas habituales" value={volunteer.tasks || '-'} />
        <InfoCard title="Formación" value={volunteer.training || '-'} />
      </section>
      <VolunteerCardPreview volunteer={volunteer} organization={organization} />
      <section className="rounded-md border border-slate-200 bg-white p-4 lg:col-span-2">
        <h3 className="font-bold text-ink">Últimas participaciones</h3>
        <div className="mt-3 space-y-2">
          {participationRows(history).slice(0, 5).map((item) => <HistoryRow key={item.id} item={item} />)}
          {!participationRows(history).length && <EmptyText text="Todavía no hay participaciones registradas." />}
        </div>
      </section>
    </div>
  );
}

function VolunteerCardPreview({ volunteer, organization }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(volunteerQrPayload(volunteer, organization), { margin: 1, width: 120 }).then(setQr).catch(() => setQr(''));
  }, [organization, volunteer]);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="font-bold text-ink">Carné identificativo</h3>
      <div className="mt-3 rounded-lg border border-brand-100 bg-gradient-to-br from-white to-brand-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{organization?.name || 'Asociación Pan y Esperanza'}</p>
            <p className="mt-1 text-lg font-bold text-ink">Voluntario acreditado</p>
          </div>
          {qr && <img src={qr} alt="Código QR del voluntario" className="h-16 w-16 rounded bg-white p-1" />}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <VolunteerPhoto volunteer={volunteer} size="lg" />
          <div>
            <p className="font-bold text-ink">{volunteer.full_name}</p>
            <p className="text-sm font-semibold text-brand-700">{volunteer.code}</p>
            <p className="text-sm text-slate-600">Alta: {formatDate(volunteer.joined_at)}</p>
            <StatusBadge status={volunteer.status} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PersonalDetails({ volunteer }) {
  const rows = [
    ['Nombre completo', volunteer.full_name],
    ['Código', volunteer.code],
    ['Documento', volunteer.document_id || '-'],
    ['Fecha de alta', formatDate(volunteer.joined_at)],
    ['Estado', volunteer.status],
    ['Teléfono', volunteer.phone || '-'],
    ['Email', volunteer.email || '-'],
    ['Dirección', volunteer.address || '-'],
    ['Contacto de emergencia', volunteer.emergency_contact || '-'],
    ['Teléfono de emergencia', volunteer.emergency_phone || '-'],
    ['Disponibilidad', volunteer.availability || '-'],
    ['Tareas habituales', volunteer.tasks || '-']
  ];
  return <KeyValueGrid rows={rows} />;
}

function ParticipationPanel({ history, canManage, onAdd }) {
  const [open, setOpen] = useState(false);
  const rows = participationRows(history);
  return (
    <SectionShell title="Participaciones" action={canManage && <Button type="button" onClick={() => setOpen(true)}><Plus size={16} /> Registrar participación</Button>}>
      {open && <InlineHistoryForm mode="participation" onCancel={() => setOpen(false)} onSubmit={(payload) => { onAdd(payload); setOpen(false); }} />}
      <HistoryList rows={rows} empty="No hay participaciones registradas." />
    </SectionShell>
  );
}

function TrainingPanel({ history, volunteer, canManage, onAdd }) {
  const [open, setOpen] = useState(false);
  const rows = trainingRows(history);
  return (
    <SectionShell title="Formación" action={canManage && <Button type="button" onClick={() => setOpen(true)}><Plus size={16} /> Añadir formación</Button>}>
      <InfoCard title="Formación indicada en ficha" value={volunteer.training || '-'} />
      {open && <InlineHistoryForm mode="training" onCancel={() => setOpen(false)} onSubmit={(payload) => { onAdd(payload); setOpen(false); }} />}
      <div className="mt-3"><HistoryList rows={rows} empty="No hay formación registrada en historial." /></div>
    </SectionShell>
  );
}

function DocumentsPanel({ history, canManage, onAdd }) {
  const [open, setOpen] = useState(false);
  const rows = documentRows(history);
  return (
    <SectionShell title="Documentación" action={canManage && <Button type="button" onClick={() => setOpen(true)}><Plus size={16} /> Añadir documento</Button>}>
      {open && <DocumentHistoryForm onCancel={() => setOpen(false)} onSubmit={(payload) => { onAdd(payload); setOpen(false); }} />}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {rows.map((item) => {
          const doc = parseHistoryJson(item.notes);
          return (
            <article key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="font-bold text-ink">{item.activity.replace('Documento: ', '')}</p>
              <p className="text-sm text-slate-600">{formatDate(item.date)} · {doc.file_name || 'Documento registrado'}</p>
              {doc.notes && <p className="mt-2 text-sm text-slate-600">{doc.notes}</p>}
              {doc.file_data_url && <a className="mt-2 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800" href={doc.file_data_url} download={doc.file_name || 'documento'}>Descargar archivo</a>}
            </article>
          );
        })}
      </div>
      {!rows.length && <EmptyText text="No hay documentación registrada." />}
    </SectionShell>
  );
}

function CommunicationsPanel({ communications }) {
  return (
    <SectionShell title="Comunicaciones">
      <div className="space-y-2">
        {communications.map((item) => (
          <article key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              {normalize(item.subject).includes('whatsapp') ? <MessageCircle size={16} className="text-brand-700" /> : <Mail size={16} className="text-brand-700" />}
              <p className="font-bold text-ink">{item.subject || 'Comunicación'}</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{item.status || 'Registrada'}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{formatDateTime(item.sent_at)} · {item.recipient}</p>
            {item.result && <p className="mt-1 text-sm text-slate-500">{item.result}</p>}
          </article>
        ))}
        {!communications.length && <EmptyText text="No hay comunicaciones registradas para este voluntario." />}
      </div>
    </SectionShell>
  );
}

function ObservationsPanel({ history, currentUser, canManage, onAdd }) {
  const [open, setOpen] = useState(false);
  const rows = observationRows(history);
  return (
    <SectionShell title="Observaciones" action={canManage && <Button type="button" onClick={() => setOpen(true)}><Plus size={16} /> Añadir observación</Button>}>
      {open && <ObservationForm currentUser={currentUser} onCancel={() => setOpen(false)} onSubmit={(payload) => { onAdd(payload); setOpen(false); }} />}
      <HistoryList rows={rows} empty="No hay observaciones registradas." />
    </SectionShell>
  );
}

function HistoryPanel({ history }) {
  return (
    <SectionShell title="Historial completo">
      <HistoryList rows={history} empty="Todavía no hay historial registrado." />
    </SectionShell>
  );
}

function VolunteerForm({ volunteers, initial, onSubmit }) {
  const parsed = initial || {};
  const [form, setForm] = useState(() => ({
    full_name: parsed.full_name || '',
    document_id: parsed.document_id || '',
    phone: parsed.phone || '',
    email: parsed.email || '',
    code: parsed.code || nextVolunteerCode(volunteers, parsed.id),
    joined_at: parsed.joined_at || todayISO(),
    status: parsed.status || 'Activo',
    address: parsed.address || '',
    emergency_contact: parsed.emergency_contact || '',
    emergency_phone: parsed.emergency_phone || '',
    availability: parsed.availability || '',
    tasks: parsed.tasks || '',
    training: parsed.training || '',
    documentation: parsed.documentation || '',
    photo_data_url: parsed.photo_data_url || '',
    notes: parsed.visibleNotes || parsed.notes || ''
  }));
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function loadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    update('photo_data_url', dataUrl);
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <FormField label="Nombre completo" required><input className={inputClass} required value={form.full_name} onChange={(event) => update('full_name', event.target.value)} /></FormField>
      <FormField label="Código de voluntario" required>
        <input className={`${inputClass} bg-slate-50 font-semibold text-slate-600`} required readOnly value={form.code} />
        <p className="mt-1 text-xs text-slate-500">Código generado automáticamente y no editable.</p>
      </FormField>
      <FormField label="DNI"><input className={inputClass} value={form.document_id} onChange={(event) => update('document_id', event.target.value)} /></FormField>
      <FormField label="Fecha de alta"><input className={inputClass} type="date" value={form.joined_at} onChange={(event) => update('joined_at', event.target.value)} /></FormField>
      <FormField label="Estado"><select className={inputClass} value={form.status} onChange={(event) => update('status', event.target.value)}><option>Activo</option><option>Archivado</option></select></FormField>
      <FormField label="Teléfono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
      <FormField label="Dirección"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField>
      <FormField label="Contacto de emergencia"><input className={inputClass} value={form.emergency_contact} onChange={(event) => update('emergency_contact', event.target.value)} /></FormField>
      <FormField label="Teléfono de emergencia"><input className={inputClass} value={form.emergency_phone} onChange={(event) => update('emergency_phone', event.target.value)} /></FormField>
      <FormField label="Disponibilidad"><input className={inputClass} value={form.availability} onChange={(event) => update('availability', event.target.value)} /></FormField>
      <FormField label="Tareas habituales"><input className={inputClass} value={form.tasks} onChange={(event) => update('tasks', event.target.value)} /></FormField>
      <FormField label="Formación"><input className={inputClass} value={form.training} onChange={(event) => update('training', event.target.value)} /></FormField>
      <FormField label="Documentación"><input className={inputClass} value={form.documentation} onChange={(event) => update('documentation', event.target.value)} /></FormField>
      <FormField label="Foto"><input className={inputClass} type="file" accept="image/png,image/jpeg" onChange={loadPhoto} /></FormField>
      <div className="flex items-center gap-3">{form.photo_data_url && <img src={form.photo_data_url} alt="Foto del voluntario" className="h-16 w-16 rounded-md object-cover" />}<span className="text-sm text-slate-500">La foto se utilizará en el expediente y el carné.</span></div>
      <div className="sm:col-span-2"><FormField label="Observaciones generales"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar voluntario</Button></div>
    </form>
  );
}

function InlineHistoryForm({ mode, onSubmit, onCancel }) {
  const [form, setForm] = useState({ date: todayISO(), type: mode === 'participation' ? PARTICIPATION_TYPES[0] : 'Curso', hours: '', notes: '' });
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const isParticipation = mode === 'participation';
  return (
    <form className="mb-4 grid gap-3 rounded-md border border-brand-100 bg-brand-50 p-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({
        date: form.date,
        activity: isParticipation ? form.type : `Formación: ${form.type}`,
        hours: form.hours,
        notes: form.notes
      });
    }}>
      <FormField label="Fecha"><input className={inputClass} type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></FormField>
      <FormField label={isParticipation ? 'Actividad' : 'Formación'}>
        {isParticipation ? (
          <select className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value)}>{PARTICIPATION_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
        ) : (
          <input className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value)} />
        )}
      </FormField>
      <FormField label="Horas"><input className={inputClass} type="number" min="0" step="0.5" value={form.hours} onChange={(event) => update('hours', event.target.value)} /></FormField>
      <div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="2" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit">Guardar</Button></div>
    </form>
  );
}

function DocumentHistoryForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ date: todayISO(), type: DOCUMENT_TYPES[0], file_name: '', file_data_url: '', notes: '' });
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    update('file_name', file.name);
    update('file_data_url', await fileToDataUrl(file));
  }
  return (
    <form className="mb-4 grid gap-3 rounded-md border border-brand-100 bg-brand-50 p-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({
        date: form.date,
        activity: `Documento: ${form.type}`,
        notes: JSON.stringify({ file_name: form.file_name, file_data_url: form.file_data_url, notes: form.notes })
      });
    }}>
      <FormField label="Fecha"><input className={inputClass} type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></FormField>
      <FormField label="Tipo"><select className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value)}>{DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
      <FormField label="Archivo"><input className={inputClass} type="file" onChange={loadFile} /></FormField>
      <div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="2" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit">Guardar documento</Button></div>
    </form>
  );
}

function ObservationForm({ currentUser, onSubmit, onCancel }) {
  const [text, setText] = useState('');
  return (
    <form className="mb-4 rounded-md border border-brand-100 bg-brand-50 p-4" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({
        date: todayISO(),
        activity: 'Observación',
        notes: JSON.stringify({ text, user: currentUserName(currentUser), created_at: new Date().toISOString() })
      });
    }}>
      <FormField label="Observación"><textarea className={inputClass} rows="3" required value={text} onChange={(event) => setText(event.target.value)} /></FormField>
      <div className="mt-3 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit">Guardar observación</Button></div>
    </form>
  );
}

function VolunteerPhoto({ volunteer, size = 'md' }) {
  const classes = { md: 'h-12 w-12', lg: 'h-16 w-16', xl: 'h-24 w-24' }[size] || 'h-12 w-12';
  if (volunteer.photo_data_url) return <img src={volunteer.photo_data_url} alt={volunteer.full_name} className={`${classes} shrink-0 rounded-md object-cover`} />;
  return <div className={`${classes} flex shrink-0 items-center justify-center rounded-md bg-brand-100 text-lg font-bold text-brand-700`}>{initials(volunteer.full_name)}</div>;
}

function StatusBadge({ status }) {
  const archived = status === 'Archivado';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${archived ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{archived ? '⚪ Archivado' : '🟢 Activo'}</span>;
}

function MiniMetric({ label, value }) {
  return <div className="rounded-md bg-slate-50 p-2"><p className="font-bold text-ink">{value}</p><p className="text-slate-500">{label}</p></div>;
}

function MetricCard({ label, value, detail }) {
  return <article className="rounded-md border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-ink">{value}</p>{detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}</article>;
}

function InfoCard({ title, value }) {
  return <article className="rounded-md border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 text-sm leading-6 text-slate-700">{value}</p></article>;
}

function SectionShell({ title, action, children }) {
  return <section className="rounded-md border border-slate-200 bg-white p-4"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="font-bold text-ink">{title}</h3>{action}</div>{children}</section>;
}

function KeyValueGrid({ rows }) {
  return <section className="grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <InfoCard key={label} title={label} value={value || '-'} />)}</section>;
}

function HistoryList({ rows, empty }) {
  if (!rows.length) return <EmptyText text={empty} />;
  return <div className="space-y-2">{rows.map((item) => <HistoryRow key={item.id} item={item} />)}</div>;
}

function HistoryRow({ item }) {
  const parsed = parseHistoryJson(item.notes);
  const text = parsed.text || parsed.notes || item.notes || '';
  const user = parsed.user ? ` · ${parsed.user}` : '';
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="font-bold text-ink">{item.activity || 'Actividad'}</p>
      <p className="mt-1 text-sm text-slate-600">{formatDate(item.date)}{item.hours ? ` · ${item.hours} h` : ''}{user}</p>
      {text && <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>}
    </article>
  );
}

function EmptyText({ text }) {
  return <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{text}</div>;
}

function enrichVolunteers(volunteers = []) {
  return volunteers
    .map((volunteer, index) => parseVolunteer(volunteer, index))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

function filterAndSortVolunteers(volunteers = [], searchTerm = '', sortBy = 'code') {
  const query = normalize(searchTerm);
  const filtered = query
    ? volunteers.filter((volunteer) => volunteerSearchText(volunteer).includes(query))
    : volunteers;

  return [...filtered].sort((a, b) => {
    if (sortBy === 'name') return compareVolunteerValues(a.full_name, b.full_name) || compareVolunteerValues(a.code, b.code);
    if (sortBy === 'joined_at') return compareVolunteerValues(a.joined_at, b.joined_at) || compareVolunteerValues(a.code, b.code);
    if (sortBy === 'status') return compareVolunteerValues(a.status, b.status) || compareVolunteerValues(a.code, b.code);
    return compareVolunteerValues(a.code, b.code);
  });
}

function volunteerSearchText(volunteer) {
  return [
    volunteer.code,
    volunteer.full_name,
    volunteer.document_id,
    volunteer.phone,
    volunteer.email
  ].map((value) => normalize(value)).join(' ');
}

function compareVolunteerValues(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function parseVolunteer(volunteer, index = 0) {
  const { meta, visibleNotes } = parseVolunteerMeta(volunteer.notes || '');
  const joined = meta.joined_at || volunteer.created_at || todayISO();
  const status = meta.status || (meta.archived_at ? 'Archivado' : 'Activo');
  return {
    ...volunteer,
    meta,
    visibleNotes,
    code: meta.code || fallbackVolunteerCode(index, joined),
    joined_at: joined,
    status,
    address: meta.address || '',
    emergency_contact: meta.emergency_contact || '',
    emergency_phone: meta.emergency_phone || '',
    tasks: meta.tasks || '',
    photo_data_url: meta.photo_data_url || '',
    archived_at: meta.archived_at || '',
    archived_by: meta.archived_by || '',
    archive_reason: meta.archive_reason || '',
    notes: visibleNotes
  };
}

function refreshVolunteer(volunteer, sourceRows) {
  const index = sourceRows.findIndex((item) => item.id === volunteer.id);
  const current = sourceRows.find((item) => item.id === volunteer.id) || volunteer;
  return parseVolunteer(current, Math.max(index, 0));
}

function parseVolunteerMeta(notes) {
  const raw = String(notes || '');
  const start = raw.indexOf(VOLUNTEER_META_START);
  const end = raw.indexOf(VOLUNTEER_META_END);
  if (start === -1 || end === -1 || end <= start) return { meta: {}, visibleNotes: raw.trim() };
  const json = raw.slice(start + VOLUNTEER_META_START.length, end).trim();
  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + VOLUNTEER_META_END.length).trim();
  return { meta: safeJson(json), visibleNotes: [before, after].filter(Boolean).join('\n') };
}

function buildVolunteerNotes(visibleNotes, meta) {
  return [VOLUNTEER_META_START, JSON.stringify(meta), VOLUNTEER_META_END, String(visibleNotes || '').trim()].filter(Boolean).join('\n');
}

function volunteerPayloadFromForm(form, volunteers, current = null) {
  const code = current
    ? nextAvailableVolunteerCode(volunteers, current.code || form.code, current.id)
    : nextAvailableVolunteerCode(volunteers, form.code);
  const meta = {
    ...(current?.meta || {}),
    code,
    joined_at: form.joined_at || todayISO(),
    status: form.status || 'Activo',
    address: form.address || '',
    emergency_contact: form.emergency_contact || '',
    emergency_phone: form.emergency_phone || '',
    tasks: form.tasks || '',
    photo_data_url: form.photo_data_url || ''
  };
  return {
    full_name: form.full_name,
    document_id: form.document_id,
    phone: form.phone,
    email: form.email,
    training: form.training,
    availability: form.availability,
    documentation: form.documentation,
    created_at: form.joined_at ? `${form.joined_at}T00:00:00` : current?.created_at,
    notes: buildVolunteerNotes(form.notes, meta)
  };
}

function volunteerPayloadFromParsed(volunteer, meta) {
  return {
    full_name: volunteer.full_name,
    document_id: volunteer.document_id,
    phone: volunteer.phone,
    email: volunteer.email,
    training: volunteer.training,
    availability: volunteer.availability,
    documentation: volunteer.documentation,
    created_at: volunteer.created_at,
    notes: buildVolunteerNotes(volunteer.visibleNotes || volunteer.notes, meta)
  };
}

function fallbackVolunteerCode(index, dateValue) {
  const year = String(dateValue || todayISO()).slice(0, 4) || new Date().getFullYear();
  return `VOL-${year}-${String(index + 1).padStart(4, '0')}`;
}

function normalizeVolunteerCode(value) {
  return String(value || '').trim().toUpperCase();
}

function nextVolunteerCode(volunteers, currentId = '') {
  return nextAvailableVolunteerCode(volunteers, '', currentId);
}

function nextAvailableVolunteerCode(volunteers, preferred = '', currentId = '') {
  const usedCodes = new Set(
    (volunteers || [])
      .filter((volunteer) => volunteer.id !== currentId)
      .map((volunteer) => normalizeVolunteerCode(volunteer.code))
      .filter(Boolean)
  );
  const normalizedPreferred = normalizeVolunteerCode(preferred);
  const preferredMatch = normalizedPreferred.match(/^VOL-(\d{4})-(\d{4})$/);
  const year = preferredMatch?.[1] || String(new Date().getFullYear());
  const highest = Array.from(usedCodes).reduce((max, code) => {
    const match = code.match(new RegExp(`^VOL-${year}-(\\d{4})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  let nextNumber = preferredMatch ? Number(preferredMatch[2]) : highest + 1;
  let candidate = `VOL-${year}-${String(nextNumber).padStart(4, '0')}`;

  while (usedCodes.has(candidate)) {
    nextNumber += 1;
    candidate = `VOL-${year}-${String(nextNumber).padStart(4, '0')}`;
  }

  return candidate;
}

function volunteerHistoryFor(data, volunteerId) {
  return (data.volunteer_history || [])
    .filter((item) => item.volunteer_id === volunteerId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function participationRows(history) {
  return history.filter((item) => PARTICIPATION_TYPES.some((type) => normalize(item.activity).includes(normalize(type))));
}

function trainingRows(history) {
  return history.filter((item) => normalize(item.activity).includes('formacion'));
}

function documentRows(history) {
  return history.filter((item) => normalize(item.activity).includes('documento'));
}

function observationRows(history) {
  return history.filter((item) => normalize(item.activity).includes('observacion'));
}

function volunteerStats(volunteer, history) {
  const participations = participationRows(history);
  const days = new Set(participations.map((item) => item.date).filter(Boolean)).size;
  const last = participations[0]?.date || '';
  return {
    total: participations.length,
    days,
    last,
    lastActivity: participations[0]?.activity || '',
    archived: volunteer.status === 'Archivado'
  };
}

function volunteerCommunications(logs, volunteer) {
  const terms = [volunteer.email, volunteer.phone, volunteer.full_name, volunteer.code].filter(Boolean).map(normalize);
  return logs
    .filter((log) => {
      const haystack = normalize([log.recipient, log.subject, log.message, log.result].join(' '));
      return terms.some((term) => term && haystack.includes(term));
    })
    .sort((a, b) => String(b.sent_at || '').localeCompare(String(a.sent_at || '')));
}

function canManageVolunteers(user) {
  return user?.role === 'Superadministrador' || canDo(user, 'volunteers', 'edit') || ['Presidenta', 'Administrador', 'Secretaria', 'Coordinadora', 'Coordinador'].includes(user?.role);
}

function parseHistoryJson(value) {
  return safeJson(value) || {};
}

function safeJson(value) {
  try {
    return JSON.parse(value || '{}') || {};
  } catch {
    return {};
  }
}

function initials(value) {
  return String(value || 'V').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'V';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function currentUserName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Usuario';
}

function volunteerQrPayload(volunteer, organization) {
  return [
    'Voluntario acreditado',
    organization?.name || 'Asociación Pan y Esperanza',
    `Nombre: ${volunteer.full_name}`,
    `Código: ${volunteer.code}`,
    `Estado: ${volunteer.status}`,
    `Alta: ${formatDate(volunteer.joined_at)}`
  ].join('\n');
}

async function printVolunteerProfilePdf(volunteer, history = [], communications = [], organization = {}) {
  const doc = new jsPDF();
  const logo = await imageUrlToDataUrl(officialLogoUrl);
  const organizationName = organization.name || 'Asociación Pan y Esperanza';
  const participations = participationRows(history);
  const documents = documentRows(history);
  const observations = observationRows(history);
  const stats = volunteerStats(volunteer, history);
  const timeline = [...history].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let y = drawVolunteerProfilePdfHeader(doc, { volunteer, organizationName, logo });

  y = drawVolunteerPdfSection(doc, 'Datos personales', y);
  y = drawVolunteerPdfLines(doc, [
    `Nombre completo: ${volunteer.full_name || '-'}`,
    `Código: ${volunteer.code || '-'}`,
    `Documento: ${volunteer.document_id || '-'}`,
    `Estado: ${volunteer.status || '-'}`,
    `Fecha de alta: ${formatDate(volunteer.joined_at)}`,
    `Teléfono: ${volunteer.phone || '-'}`,
    `Email: ${volunteer.email || '-'}`,
    `Dirección: ${volunteer.address || '-'}`,
    `Contacto de emergencia: ${volunteer.emergency_contact || '-'}${volunteer.emergency_phone ? ` · ${volunteer.emergency_phone}` : ''}`
  ], y);

  y = drawVolunteerPdfSection(doc, 'Formación y disponibilidad', y + 4);
  y = drawVolunteerPdfLines(doc, [
    `Formación indicada: ${volunteer.training || '-'}`,
    `Disponibilidad: ${volunteer.availability || '-'}`,
    `Tareas habituales: ${volunteer.tasks || '-'}`
  ], y);

  y = drawVolunteerPdfSection(doc, 'Participaciones', y + 4);
  y = drawVolunteerPdfLines(doc, [
    `Total de participaciones: ${stats.total}`,
    `Días colaborados: ${stats.days}`,
    `Última actividad: ${stats.last ? `${formatDate(stats.last)} · ${stats.lastActivity || 'Actividad registrada'}` : '-'}`
  ], y);
  y = drawVolunteerPdfList(doc, participations.map((item) => volunteerHistoryLine(item)), y, 'No hay participaciones registradas.');

  y = drawVolunteerPdfSection(doc, 'Historial cronológico de actividades', y + 4);
  y = drawVolunteerPdfList(doc, timeline.map((item) => volunteerHistoryLine(item)), y, 'Todavía no hay historial registrado.');

  y = drawVolunteerPdfSection(doc, 'Documentación', y + 4);
  y = drawVolunteerPdfList(doc, documents.map((item) => volunteerDocumentLine(item)), y, 'No hay documentación registrada.');

  y = drawVolunteerPdfSection(doc, 'Comunicaciones', y + 4);
  y = drawVolunteerPdfList(doc, communications.map((item) => volunteerCommunicationLine(item)), y, 'No hay comunicaciones registradas.');

  y = drawVolunteerPdfSection(doc, 'Observaciones', y + 4);
  drawVolunteerPdfList(doc, observations.map((item) => volunteerHistoryLine(item)), y, 'No hay observaciones registradas.');

  drawVolunteerProfilePdfFooter(doc);
  doc.save(`Expediente-voluntario-${safeFilename(volunteer.code || volunteer.full_name || 'voluntario')}.pdf`);
}

function drawVolunteerProfilePdfHeader(doc, { volunteer, organizationName, logo }) {
  doc.addImage(logo, 'PNG', 14, 10, 32, 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(23, 33, 27);
  doc.text(organizationName, 52, 20);
  doc.setFontSize(18);
  doc.setTextColor(36, 126, 80);
  doc.text('EXPEDIENTE DEL VOLUNTARIO', 14, 44);
  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Emitido: ${formatDate(todayISO())}`, 14, 52);
  doc.text(`Expediente: ${volunteer.code || '-'}`, 14, 58);

  if (volunteer.photo_data_url) {
    doc.addImage(volunteer.photo_data_url, imageFormat(volunteer.photo_data_url), 162, 14, 28, 32);
  } else {
    doc.setFillColor(219, 236, 226);
    doc.roundedRect(162, 14, 28, 32, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(initials(volunteer.full_name), 176, 33, { align: 'center' });
  }

  doc.setDrawColor(36, 126, 80);
  doc.line(14, 64, 196, 64);
  return 74;
}

function drawVolunteerPdfSection(doc, title, y) {
  y = ensureVolunteerPdfSpace(doc, y, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 126, 80);
  doc.text(title.toUpperCase(), 14, y);
  doc.setDrawColor(219, 236, 226);
  doc.line(14, y + 2, 196, y + 2);
  doc.setTextColor(23, 33, 27);
  return y + 9;
}

function drawVolunteerPdfLines(doc, lines, y) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, 178);
    y = ensureVolunteerPdfSpace(doc, y, wrapped.length * 5 + 3);
    doc.text(wrapped, 16, y);
    y += wrapped.length * 5 + 2;
  });
  return y;
}

function drawVolunteerPdfList(doc, lines, y, emptyText) {
  const rows = lines.length ? lines : [emptyText];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  rows.forEach((line) => {
    const wrapped = doc.splitTextToSize(`- ${line}`, 176);
    y = ensureVolunteerPdfSpace(doc, y, wrapped.length * 5 + 4);
    doc.text(wrapped, 18, y);
    y += wrapped.length * 5 + 3;
  });
  return y;
}

function ensureVolunteerPdfSpace(doc, y, minHeight = 12) {
  if (y + minHeight <= 276) return y;
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(36, 126, 80);
  doc.text('EXPEDIENTE DEL VOLUNTARIO', 14, 18);
  doc.setDrawColor(219, 236, 226);
  doc.line(14, 22, 196, 22);
  doc.setTextColor(23, 33, 27);
  return 32;
}

function drawVolunteerProfilePdfFooter(doc) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Documento interno del expediente de voluntariado.', 14, 286);
    doc.text(`Página ${page} de ${pageCount}`, 178, 286);
  }
  doc.setTextColor(23, 33, 27);
}

function volunteerHistoryLine(item) {
  const parsed = parseHistoryJson(item.notes);
  const text = parsed.text || parsed.notes || item.notes || '';
  return `${formatDate(item.date)} · ${item.activity || 'Actividad'}${text ? ` · ${text}` : ''}`;
}

function volunteerDocumentLine(item) {
  const doc = parseHistoryJson(item.notes);
  return `${formatDate(item.date)} · ${String(item.activity || 'Documento').replace('Documento: ', '')} · ${doc.file_name || 'Documento registrado'}${doc.notes ? ` · ${doc.notes}` : ''}`;
}

function volunteerCommunicationLine(item) {
  return `${formatDateTime(item.sent_at)} · ${item.subject || 'Comunicación'} · ${item.recipient || '-'} · ${item.status || 'Registrada'}${item.result ? ` · ${item.result}` : ''}`;
}

async function printVolunteerCardPdf(volunteer, organization = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [86, 54] });
  const logo = await imageUrlToDataUrl(officialLogoUrl);
  const qr = await QRCode.toDataURL(volunteerQrPayload(volunteer, organization), { margin: 1, width: 140 });
  doc.setFillColor(247, 250, 246);
  doc.roundedRect(0, 0, 86, 54, 3, 3, 'F');
  doc.setFillColor(36, 126, 80);
  doc.rect(0, 0, 86, 10, 'F');
  doc.addImage(logo, 'PNG', 4, 2, 11, 7);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(organization.name || 'Asociación Pan y Esperanza', 18, 6.5);
  doc.setTextColor(23, 33, 27);
  if (volunteer.photo_data_url) doc.addImage(volunteer.photo_data_url, imageFormat(volunteer.photo_data_url), 5, 15, 20, 24);
  else {
    doc.setFillColor(219, 236, 226);
    doc.roundedRect(5, 15, 20, 24, 2, 2, 'F');
    doc.setFontSize(11);
    doc.text(initials(volunteer.full_name), 15, 28, { align: 'center' });
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(volunteer.full_name || '-', 30, 18);
  doc.setFontSize(8);
  doc.setTextColor(36, 126, 80);
  doc.text('Voluntario acreditado', 30, 24);
  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'normal');
  doc.text(`Código: ${volunteer.code}`, 30, 30);
  doc.text(`Alta: ${formatDate(volunteer.joined_at)}`, 30, 35);
  doc.text(`Estado: ${volunteer.status}`, 30, 40);
  doc.addImage(qr, 'PNG', 69, 35, 13, 13);
  doc.setFontSize(5.5);
  doc.setTextColor(96, 112, 100);
  doc.text('Este carné identifica a la persona como voluntaria acreditada de la asociación.', 5, 50);
  doc.save(`Carne-voluntario-${safeFilename(volunteer.code)}.pdf`);
}

function downloadVolunteerCertificate(volunteer, history, organization = {}) {
  if (!participationRows(history).length) {
    window.alert('Todavía no existen colaboraciones registradas para generar el certificado.');
    return;
  }
  printVolunteerCertificatePdf(volunteer, history, organization);
}

async function printVolunteerCertificatePdf(volunteer, history, organization = {}) {
  const doc = new jsPDF();
  const participations = participationRows(history).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!participations.length) return;
  const first = participations[0].date;
  const last = participations[participations.length - 1].date;
  const activityTypes = uniqueVolunteerActivityTypes(participations);
  const associationName = certificateAssociationName(organization);
  const participationText = `${participations.length} ${participations.length === 1 ? 'participación registrada' : 'participaciones registradas'}`;
  const logo = await imageUrlToDataUrl(officialLogoUrl);
  doc.addImage(logo, 'PNG', 14, 12, 28, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(organization.name || 'Asociación Pan y Esperanza', 50, 22);
  doc.setFontSize(18);
  doc.setTextColor(36, 126, 80);
  doc.text('CERTIFICADO DE COLABORACIÓN VOLUNTARIA', 14, 52);
  doc.setTextColor(23, 33, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const paragraphs = [
    `La ${associationName} hace constar que ${volunteer.full_name}, con código de voluntario ${volunteer.code}, figura en el expediente de voluntariado de la entidad.`,
    `De acuerdo con la información registrada, su periodo de colaboración comprende desde ${formatDate(first)} hasta ${formatDate(last)}, con ${participationText} en el historial de colaboración.`,
    `Durante este periodo ha colaborado en las siguientes actividades: ${activityTypes.join(', ')}.`,
    'Este certificado se expide a solicitud de la persona interesada y recoge exclusivamente la información obrante en el expediente interno de la entidad.'
  ];
  let y = 68;
  paragraphs.forEach((paragraph) => {
    const lines = doc.splitTextToSize(paragraph, 176);
    doc.text(lines, 14, y);
    y += lines.length * 6 + 8;
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Firma y sello de la entidad', 14, 230);
  doc.setDrawColor(180, 190, 185);
  doc.roundedRect(14, 236, 78, 30, 2, 2);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de emisión: ${formatDate(todayISO())}`, 118, 244);
  doc.text('Responsable de la Asociación', 118, 254);
  doc.save(`Certificado-colaboracion-${safeFilename(volunteer.code)}.pdf`);
}

function certificateAssociationName(organization = {}) {
  const name = String(organization.name || 'Pan y Esperanza').trim();
  return normalize(name).startsWith('asociacion') ? name : `Asociación ${name}`;
}

function uniqueVolunteerActivityTypes(participations) {
  const types = participations.map((item) => {
    const activity = normalize(item.activity);
    return PARTICIPATION_TYPES.find((type) => activity.includes(normalize(type))) || item.activity || 'Participación voluntaria';
  });
  return Array.from(new Set(types)).sort((a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' }));
}

function imageUrlToDataUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = reject;
    image.src = url;
  });
}

function imageFormat(dataUrl) {
  return String(dataUrl).includes('image/png') ? 'PNG' : 'JPEG';
}

function safeFilename(value) {
  return String(value || 'voluntario').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'voluntario';
}
