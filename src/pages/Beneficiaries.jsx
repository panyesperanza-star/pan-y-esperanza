import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock3,
  ContactRound,
  Download,
  Edit3,
  Euro,
  FileText,
  HeartHandshake,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  NotebookTabs,
  PackagePlus,
  PackageCheck,
  Paperclip,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserRound,
  UserPlus,
  Users
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { BENEFICIARY_SITUATIONS, DOCUMENT_TYPES, HELP_TYPES } from '../lib/constants';
import { EMAIL_TEMPLATES, normalizeEmailError, saveEmailLog, sendEmailViaApi } from '../lib/emailClient';
import { printBeneficiaryPdf, printDeliveryReceiptPdf } from '../lib/exporters';
import { formatDate, nextBeneficiaryCode, normalize, normalizeDocument, todayISO } from '../lib/formatters';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from './Communications';
import { DeliveryForm } from './Deliveries';

const emptyBeneficiary = {
  code: '',
  full_name: '',
  document_id: '',
  address_full: '',
  postal_code: '',
  phone: '',
  email: '',
  family_id: '',
  birth_date: '',
  sex: '',
  nationality: '',
  marital_status: '',
  attached_document_name: '',
  first_attention_at: todayISO(),
  family_members: 1,
  minors_count: 0,
  situation: 'Activa',
  requested_help: 'Alimentos',
  notes: '',
  joined_at: todayISO(),
  is_active: true,
  last_help_at: null
};

const SEX_OPTIONS = ['Mujer', 'Hombre', 'No binario', 'Prefiere no indicar'];
const MARITAL_STATUS_OPTIONS = ['Soltero/a', 'Casado/a', 'Pareja de hecho', 'Separado/a', 'Divorciado/a', 'Viudo/a'];
const SOCIAL_ENTRY_TYPES = ['Seguimiento', 'Primera atención', 'Incidencia', 'Derivación', 'Observación'];

export function Beneficiaries({ data, actions, currentUser }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [situationFilter, setSituationFilter] = useState('Todas');
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const canCreate = canDo(currentUser, 'beneficiaries', 'create');
  const canEdit = canDo(currentUser, 'beneficiaries', 'edit');
  const canDelete = canDo(currentUser, 'beneficiaries', 'delete');
  const activeCount = data.beneficiaries.filter((item) => item.is_active).length;
  const urgentCount = data.beneficiaries.filter((item) => item.is_active && item.situation === 'Urgente').length;
  const attendedCount = new Set(data.deliveries.map((item) => item.beneficiary_id).filter(Boolean)).size;
  const profile = data.beneficiaries.find((item) => item.id === profileId) || null;

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return data.beneficiaries.filter((item) => {
      const matchesQuery = normalize(`${item.full_name} ${item.document_id} ${item.code} ${item.phone} ${item.email}`).includes(needle);
      const matchesStatus = statusFilter === 'Todos' || (statusFilter === 'Activos' ? item.is_active : !item.is_active);
      const matchesSituation = situationFilter === 'Todas' || item.situation === situationFilter;
      return matchesQuery && matchesStatus && matchesSituation;
    });
  }, [data.beneficiaries, query, situationFilter, statusFilter]);

  async function save(form) {
    if (form.id) await actions.updateBeneficiary(form.id, form);
    else await actions.createBeneficiary(form);
    setEditing(null);
  }

  async function removeBeneficiary(item) {
    const confirmed = window.confirm(`¿Eliminar definitivamente el registro de ${item.full_name}? Esta acción eliminará también su información relacionada.`);
    if (confirmed) await actions.deleteBeneficiary(item.id);
  }

  return (
    <>
      <PageHeader
        title="Beneficiarios"
        description="Gestión de personas atendidas y acceso a su expediente."
        actions={canCreate && <Button onClick={() => setEditing({ ...emptyBeneficiary, code: nextBeneficiaryCode(data.beneficiaries) })}><Plus size={18} /> Nuevo beneficiario</Button>}
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de beneficiarios">
        <SummaryCard icon={Users} label="Total registrados" value={data.beneficiaries.length} tone="slate" />
        <SummaryCard icon={CheckCircle2} label="Beneficiarios activos" value={activeCount} tone="brand" />
        <SummaryCard icon={HeartHandshake} label="Situaciones urgentes" value={urgentCount} tone="clay" />
        <SummaryCard icon={PackageCheck} label="Con entregas" value={attendedCount} tone="blue" />
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-panel" aria-label="Filtros de beneficiarios">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_200px]">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
            <Search size={19} className="shrink-0 text-slate-400" />
            <span className="sr-only">Buscar beneficiarios</span>
            <input
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="Buscar por nombre, documento, código, teléfono o email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por estado</span>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Todos</option>
              <option>Activos</option>
              <option>Inactivos</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por situación</span>
            <select className={inputClass} value={situationFilter} onChange={(event) => setSituationFilter(event.target.value)}>
              <option>Todas</option>
              {BENEFICIARY_SITUATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Mostrando {filtered.length} de {data.beneficiaries.length} registros</p>
      </section>

      <section className="space-y-3" aria-label="Listado de beneficiarios">
        {filtered.map((item) => {
          const deliveries = data.deliveries.filter((delivery) => delivery.beneficiary_id === item.id);
          const family = data.families.find((entry) => entry.id === item.family_id);
          return (
            <article key={item.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-100 hover:shadow-panel">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_minmax(180px,0.8fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-bold text-brand-700">
                    {initials(item.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-ink">{item.full_name}</h3>
                      <StatusBadge active={item.is_active} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500"><span className="font-semibold text-brand-700">{item.code}</span><span className="mx-2 text-slate-300">•</span>{item.document_id || 'Sin documento'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-1 lg:gap-1">
                  <MetaLine icon={Users} text={family ? `${family.family_code} · ${family.responsible_name}` : `${item.family_members || 1} miembros · ${item.minors_count || 0} menores`} />
                  <MetaLine icon={Phone} text={item.phone || 'Sin teléfono'} />
                </div>

                <div className="flex flex-wrap gap-2 lg:block">
                  <SituationBadge value={item.situation} />
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={14} /> Última ayuda: {formatDate(item.last_help_at)}</p>
                  <p className="mt-1 text-xs text-slate-400">{deliveries.length} {deliveries.length === 1 ? 'entrega' : 'entregas'}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button variant="secondary" onClick={() => setProfileId(item.id)}><FileText size={16} /> Ver ficha <ChevronRight size={15} /></Button>
                  <button className="focus-ring rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" onClick={() => printBeneficiaryPdf(item, deliveries)} aria-label={`Imprimir ficha de ${item.full_name}`} title="Imprimir ficha"><Printer size={17} /></button>
                  {canEdit && <button className="focus-ring rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" onClick={() => setEditing(item)} aria-label={`Editar a ${item.full_name}`} title="Editar"><Edit3 size={17} /></button>}
                  {canDelete && <button className="focus-ring rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => removeBeneficiary(item)} aria-label={`Eliminar a ${item.full_name}`} title="Eliminar"><Trash2 size={17} /></button>}
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <Search className="mx-auto text-slate-300" size={34} />
            <h3 className="mt-3 font-bold text-ink">No hay resultados</h3>
            <p className="mt-1 text-sm text-slate-500">Prueba con otra búsqueda o cambia los filtros.</p>
          </div>
        )}
      </section>

      {editing && (
        <Modal wide title={editing.id ? 'Editar beneficiario' : 'Nuevo beneficiario'} onClose={() => setEditing(null)}>
          <BeneficiaryForm families={data.families} beneficiaries={data.beneficiaries} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {profile && (
        <Modal wide title={`Expediente · ${profile.code}`} onClose={() => setProfileId(null)}>
          <BeneficiaryProfile
            data={data}
            actions={actions}
            currentUser={currentUser}
            beneficiary={profile}
            deliveries={data.deliveries.filter((item) => item.beneficiary_id === profile.id)}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => { setProfileId(null); setEditing(profile); }}
            onAddFamilyMember={(familyId) => {
              setProfileId(null);
              setEditing({ ...emptyBeneficiary, code: nextBeneficiaryCode(data.beneficiaries), family_id: familyId });
            }}
          />
        </Modal>
      )}
    </>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    clay: 'bg-orange-50 text-orange-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700'
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`rounded-xl p-3 ${tones[tone]}`}><Icon size={21} /></span>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-bold text-ink">{value}</p></div>
    </div>
  );
}

function MetaLine({ icon: Icon, text }) {
  return <p className="flex min-w-0 items-center gap-2 text-slate-600"><Icon size={15} className="shrink-0 text-slate-400" /><span className="truncate">{text}</span></p>;
}

function StatusBadge({ active }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Activo' : 'Inactivo'}</span>;
}

function SituationBadge({ value }) {
  const tone = value === 'Urgente' ? 'bg-orange-50 text-orange-700 ring-orange-200' : value === 'Inactiva' ? 'bg-slate-100 text-slate-600 ring-slate-200' : value === 'Seguimiento' ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-brand-50 text-brand-700 ring-brand-100';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${tone}`}>{value || 'Sin situación'}</span>;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function BeneficiaryForm({ families, beneficiaries, initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyBeneficiary, ...initial, family_id: initial.family_id || '' }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const documentInputRef = useRef(null);
  const codeInputRef = useRef(null);

  const update = (field, value) => {
    setFormError('');
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const errorClass = (field) => (fieldErrors[field] ? ' border-red-500 focus:ring-red-500' : '');

  function validateUniqueFields() {
    const documentId = normalizeDocument(form.document_id);
    const duplicateDocument = documentId ? beneficiaries.find((item) => normalizeDocument(item.document_id) === documentId && item.id !== form.id) : null;
    if (duplicateDocument) {
      setFieldErrors({ document_id: 'Ya existe un beneficiario registrado con ese documento.' });
      documentInputRef.current?.focus();
      return false;
    }
    const code = normalize(form.code);
    const duplicateCode = code ? beneficiaries.find((item) => normalize(item.code) === code && item.id !== form.id) : null;
    if (duplicateCode) {
      setFieldErrors({ code: 'Ya existe un beneficiario registrado con ese código.' });
      codeInputRef.current?.focus();
      return false;
    }
    return true;
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    if (!validateUniqueFields()) return;
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (error) {
      const message = error.message || '';
      if (message.includes('DNI/NIE') || message.includes('document_id')) {
        setFieldErrors({ document_id: 'Ya existe un beneficiario registrado con ese documento.' });
        documentInputRef.current?.focus();
      } else if (message.includes('code') || message.includes('codigo')) {
        setFieldErrors({ code: 'Ya existe un beneficiario registrado con ese código.' });
        codeInputRef.current?.focus();
      } else {
        setFormError(message || 'No se pudo guardar el beneficiario. Revisa los datos e inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{formError}</div>}

      <FormSection icon={CircleUserRound} title="Identificación" description="Datos básicos de la persona atendida.">
        <FormField label="Código de beneficiario">
          <input ref={codeInputRef} className={`${inputClass}${errorClass('code')}`} required value={form.code || ''} onChange={(event) => update('code', event.target.value)} />
          {fieldErrors.code && <FieldError>{fieldErrors.code}</FieldError>}
        </FormField>
        <FormField label="Fecha de alta">
          <input className={inputClass} type="date" value={form.joined_at || ''} onChange={(event) => update('joined_at', event.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Nombre y apellidos" required>
            <input className={inputClass} required autoComplete="name" value={form.full_name || ''} onChange={(event) => update('full_name', event.target.value)} />
          </FormField>
        </div>
        <FormField label="DNI, NIE o pasaporte" required>
          <input ref={documentInputRef} className={`${inputClass}${errorClass('document_id')}`} required value={form.document_id || ''} onChange={(event) => update('document_id', event.target.value)} />
          {fieldErrors.document_id && <FieldError>{fieldErrors.document_id}</FieldError>}
        </FormField>
        <FormField label="Fecha de nacimiento">
          <input className={inputClass} type="date" value={form.birth_date || ''} onChange={(event) => update('birth_date', event.target.value)} />
        </FormField>
        <FormField label="Sexo">
          <select className={inputClass} value={form.sex || ''} onChange={(event) => update('sex', event.target.value)}><option value="">Sin indicar</option>{SEX_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
        </FormField>
        <FormField label="Nacionalidad">
          <input className={inputClass} value={form.nationality || ''} onChange={(event) => update('nationality', event.target.value)} />
        </FormField>
        <FormField label="Estado civil">
          <select className={inputClass} value={form.marital_status || ''} onChange={(event) => update('marital_status', event.target.value)}><option value="">Sin indicar</option>{MARITAL_STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
        </FormField>
        <FormField label="Primera atención">
          <input className={inputClass} type="date" value={form.first_attention_at || ''} onChange={(event) => update('first_attention_at', event.target.value)} />
        </FormField>
      </FormSection>

      <FormSection icon={Phone} title="Contacto y domicilio" description="Información para comunicaciones y atención.">
        <FormField label="Teléfono">
          <input className={inputClass} type="tel" autoComplete="tel" value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} />
        </FormField>
        <FormField label="Email">
          <input className={inputClass} type="email" autoComplete="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Dirección completa">
            <input className={inputClass} autoComplete="street-address" value={form.address_full || ''} onChange={(event) => update('address_full', event.target.value)} />
          </FormField>
        </div>
        <FormField label="Código postal">
          <input className={inputClass} inputMode="numeric" autoComplete="postal-code" value={form.postal_code || ''} onChange={(event) => update('postal_code', event.target.value)} />
        </FormField>
      </FormSection>

      <FormSection icon={Users} title="Unidad familiar" description="Vinculación y composición familiar actual.">
        <div className="sm:col-span-2">
          <FormField label="Familia vinculada">
            <select className={inputClass} value={form.family_id || ''} onChange={(event) => update('family_id', event.target.value)}>
              <option value="">Sin familia vinculada</option>
              {families.map((family) => <option key={family.id} value={family.id}>{family.family_code} · {family.responsible_name}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Miembros de la unidad familiar">
          <input className={inputClass} type="number" min="1" value={form.family_members ?? 1} onChange={(event) => update('family_members', Number(event.target.value))} />
        </FormField>
        <FormField label="Menores a cargo">
          <input className={inputClass} type="number" min="0" value={form.minors_count ?? 0} onChange={(event) => update('minors_count', Number(event.target.value))} />
        </FormField>
      </FormSection>

      <FormSection icon={ClipboardList} title="Atención y situación" description="Estado operativo y ayuda solicitada.">
        <FormField label="Situación">
          <select className={inputClass} value={form.situation || 'Activa'} onChange={(event) => update('situation', event.target.value)}>{BENEFICIARY_SITUATIONS.map((item) => <option key={item}>{item}</option>)}</select>
        </FormField>
        <FormField label="Ayuda solicitada">
          <select className={inputClass} value={form.requested_help || ''} onChange={(event) => update('requested_help', event.target.value)}><option value="">Sin indicar</option>{HELP_TYPES.map((item) => <option key={item}>{item}</option>)}</select>
        </FormField>
        <FormField label="Estado del registro">
          <select className={inputClass} value={form.is_active ? 'Activo' : 'Inactivo'} onChange={(event) => update('is_active', event.target.value === 'Activo')}><option>Activo</option><option>Inactivo</option></select>
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Observaciones">
            <textarea className={inputClass} rows="4" value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} placeholder="Información relevante para la atención..." />
          </FormField>
        </div>
      </FormSection>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear beneficiario'}</Button>
      </div>
    </form>
  );
}

function FormSection({ icon: Icon, title, description, children }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-lg bg-white p-2 text-brand-700 shadow-sm ring-1 ring-slate-200"><Icon size={19} /></span>
        <div><h3 className="font-bold text-ink">{title}</h3><p className="text-sm text-slate-500">{description}</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function FieldError({ children }) {
  return <p className="mt-1 text-sm font-medium text-red-600" role="alert">{children}</p>;
}

function BeneficiaryProfile({ data, actions, currentUser, beneficiary, deliveries, canEdit, canDelete, onEdit, onAddFamilyMember }) {
  const [tab, setTab] = useState('overview');
  const [emailOpen, setEmailOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const family = data.families.find((item) => item.id === beneficiary.family_id);
  const familyMembers = family ? data.beneficiaries.filter((item) => item.family_id === family.id) : [];
  const documents = data.beneficiary_documents.filter((item) => item.beneficiary_id === beneficiary.id);
  const history = data.social_history.filter((item) => item.beneficiary_id === beneficiary.id);
  const emailLogs = (data.email_logs || []).filter((log) => beneficiary.email && String(log.recipient || '').includes(beneficiary.email));
  const incidents = history.filter((item) => normalize(item.entry_type).includes('incidencia')).length;
  const estimatedValue = deliveries.reduce((total, item) => total + Number(item.estimated_value ?? item.value ?? item.amount ?? 0), 0);
  const hasEstimatedValue = deliveries.some((item) => Number(item.estimated_value ?? item.value ?? item.amount ?? 0) > 0);
  const canCreateDelivery = canDo(currentUser, 'deliveries', 'create');
  const canCreateFamily = canDo(currentUser, 'families', 'create');
  const canCreateBeneficiary = canDo(currentUser, 'beneficiaries', 'create');

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: CircleUserRound },
    { id: 'personal', label: 'Datos personales', icon: ContactRound },
    { id: 'family', label: 'Familia', icon: Users, count: familyMembers.length || undefined },
    { id: 'deliveries', label: 'Entregas', icon: PackageCheck, count: deliveries.length },
    { id: 'documents', label: 'Documentos', icon: Paperclip, count: documents.length },
    { id: 'emails', label: 'Comunicaciones', icon: Mail, count: emailLogs.length },
    { id: 'social', label: 'Historial social', icon: NotebookTabs, count: history.length }
  ];

  async function openWhatsApp() {
    const phone = normalizeWhatsAppPhone(beneficiary.phone);
    if (!phone) {
      setNotice('Este beneficiario no tiene un teléfono válido para WhatsApp.');
      return;
    }
    const message = `Hola ${beneficiary.full_name}, le contactamos desde Pan y Esperanza.`;
    window.open(buildWhatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
    setNotice('WhatsApp abierto correctamente. Revisa el mensaje antes de enviarlo.');
    try {
      await actions.createEmailLog({
        recipient: `WhatsApp ${phone}`,
        subject: `WhatsApp - ${beneficiary.full_name}`,
        sent_by: currentUser?.email || currentUser?.first_name || 'Sistema',
        sent_at: new Date().toISOString(),
        attachments: [],
        result: 'WhatsApp abierto correctamente'
      });
    } catch (error) {
      console.warn('[Beneficiarios] No se pudo registrar WhatsApp:', error);
    }
  }

  return (
    <div className="-m-5">
      <CrmHeader
        beneficiary={beneficiary}
        family={family}
        canEdit={canEdit}
        canCreateDelivery={canCreateDelivery}
        onEdit={onEdit}
        onWhatsApp={openWhatsApp}
        onEmail={() => { setNotice(''); setEmailOpen(true); }}
        onDelivery={() => setDeliveryOpen(true)}
      />

      {notice && <div className="mx-5 mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" role="status">{notice}</div>}

      <ProfileSummaryCards
        beneficiary={beneficiary}
        deliveries={deliveries}
        documents={documents}
        incidents={incidents}
        estimatedValue={estimatedValue}
        hasEstimatedValue={hasEstimatedValue}
      />

      <nav className="mt-6 overflow-x-auto border-y border-slate-200 bg-white px-5 sm:px-7" aria-label="Secciones del expediente">
        <div className="flex min-w-max gap-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button key={id} className={`focus-ring flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
              <Icon size={17} /> {label}{count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
            </button>
          ))}
        </div>
      </nav>

      <main className="bg-slate-50/70 p-5 sm:p-7">
        {tab === 'overview' && <OverviewPanel beneficiary={beneficiary} family={family} deliveries={deliveries} history={history} />}
        {tab === 'personal' && <PersonalDataPanel beneficiary={beneficiary} />}
        {tab === 'family' && (
          <FamilyPanel
            beneficiary={beneficiary}
            family={family}
            members={familyMembers}
            canAddMember={canCreateBeneficiary}
            canCreateFamily={canCreateFamily && canEdit}
            onAddMember={() => onAddFamilyMember(family.id)}
            onCreateFamily={() => setFamilyOpen(true)}
          />
        )}
        {tab === 'deliveries' && <DeliveriesPanel deliveries={deliveries} beneficiary={beneficiary} allDeliveries={data.deliveries} />}
        {tab === 'documents' && <DocumentsPanel documents={documents} beneficiary={beneficiary} actions={actions} canEdit={canEdit} canDelete={canDelete} />}
        {tab === 'emails' && <EmailsPanel emailLogs={emailLogs} />}
        {tab === 'social' && <SocialHistory history={history} beneficiary={beneficiary} actions={actions} currentUser={currentUser} canEdit={canEdit} />}
      </main>

      {emailOpen && (
        <Modal title="Enviar email al beneficiario" onClose={() => setEmailOpen(false)}>
          <BeneficiaryEmailForm
            beneficiary={beneficiary}
            deliveries={deliveries}
            organization={data.organization_settings?.[0]}
            actions={actions}
            currentUser={currentUser}
            onSent={(message) => { setNotice(message); setEmailOpen(false); }}
          />
        </Modal>
      )}
      {deliveryOpen && (
        <Modal wide title={`Nueva entrega · ${beneficiary.full_name}`} onClose={() => setDeliveryOpen(false)}>
          <DeliveryForm
            data={data}
            initialBeneficiaryId={beneficiary.id}
            onSubmit={async (payload) => {
              await actions.createDelivery(payload);
              setDeliveryOpen(false);
              setNotice('Entrega registrada correctamente.');
            }}
          />
        </Modal>
      )}
      {familyOpen && (
        <Modal title="Crear unidad familiar" onClose={() => setFamilyOpen(false)}>
          <QuickFamilyForm
            beneficiary={beneficiary}
            onSubmit={async (payload) => {
              await actions.createFamily(payload);
              await actions.updateBeneficiary(beneficiary.id, { ...beneficiary, family_id: payload.id });
              setFamilyOpen(false);
              setNotice('Unidad familiar creada y vinculada correctamente.');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function CrmHeader({ beneficiary, family, canEdit, canCreateDelivery, onEdit, onWhatsApp, onEmail, onDelivery }) {
  const photo = beneficiary.photo_url || beneficiary.photo || beneficiary.avatar_url;
  return (
    <header className="relative overflow-hidden border-b border-slate-200 bg-white px-5 py-7 sm:px-7">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-500" />
      <div className="relative flex flex-col gap-6 pt-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-brand-50 text-3xl font-bold text-brand-700 shadow-lg">
            {photo ? <img src={photo} alt={`Fotografía de ${beneficiary.full_name}`} className="h-full w-full object-cover" /> : initials(beneficiary.full_name)}
          </div>
          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wide text-brand-700">{beneficiary.code}</span>
              <StatusBadge active={beneficiary.is_active} />
              <SituationBadge value={beneficiary.situation} />
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{beneficiary.full_name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><CalendarDays size={15} className="text-slate-400" /> Alta: {formatDate(beneficiary.joined_at)}</span>
              <span className="flex items-center gap-1.5"><Users size={15} className="text-slate-400" /> {family ? `${family.family_code} · ${family.responsible_name}` : 'Sin unidad familiar'}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={17} /> Editar</Button>}
          <Button variant="secondary" onClick={onWhatsApp}><MessageCircle size={17} /> WhatsApp</Button>
          <Button variant="secondary" onClick={onEmail}><Mail size={17} /> Email</Button>
          {canCreateDelivery && <Button onClick={onDelivery}><PackagePlus size={17} /> Nueva entrega</Button>}
        </div>
      </div>
    </header>
  );
}

function ProfileSummaryCards({ beneficiary, deliveries, documents, incidents, estimatedValue, hasEstimatedValue }) {
  const cards = [
    { label: 'Beneficiario desde', value: formatDate(beneficiary.joined_at), icon: CalendarDays, tone: 'brand' },
    { label: 'Última ayuda', value: formatDate(beneficiary.last_help_at), icon: Clock3, tone: 'blue' },
    { label: 'Total entregas', value: deliveries.length, icon: PackageCheck, tone: 'brand' },
    { label: 'Valor aproximado', value: hasEstimatedValue ? formatCurrency(estimatedValue) : 'Sin valorar', icon: Euro, tone: 'amber' },
    { label: 'Documentos', value: documents.length, icon: Paperclip, tone: 'violet' },
    { label: 'Incidencias', value: incidents, icon: ClipboardList, tone: incidents ? 'red' : 'slate' }
  ];
  const tones = {
    brand: 'bg-brand-50 text-brand-700', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-100 text-slate-600'
  };
  return (
    <section className="grid gap-3 bg-slate-50/70 px-5 pt-6 sm:grid-cols-2 sm:px-7 xl:grid-cols-6" aria-label="Resumen rápido del expediente">
      {cards.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`inline-flex rounded-lg p-2 ${tones[tone]}`}><Icon size={18} /></span><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-ink">{value}</p></div>)}
    </section>
  );
}

function OverviewPanel({ beneficiary, family, deliveries, history }) {
  const latestDelivery = deliveries[0];
  const latestHistory = [...history].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoCard icon={HeartHandshake} title="Situación actual">
        <div className="flex flex-wrap gap-2"><SituationBadge value={beneficiary.situation} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{beneficiary.requested_help || 'Ayuda sin especificar'}</span></div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{beneficiary.notes || 'No hay observaciones registradas.'}</p>
      </InfoCard>
      <InfoCard icon={ContactRound} title="Contacto principal">
        <div className="space-y-3">
          <ContactLine icon={Phone} label="Teléfono" value={beneficiary.phone} />
          <ContactLine icon={Mail} label="Email" value={beneficiary.email} />
          <ContactLine icon={MapPin} label="Dirección" value={[beneficiary.address_full, beneficiary.postal_code].filter(Boolean).join(' · ')} />
        </div>
      </InfoCard>
      <InfoCard icon={PackageCheck} title="Última entrega">
        {latestDelivery ? <><p className="font-bold text-ink">{latestDelivery.help_type || 'Ayuda entregada'}</p><p className="mt-1 text-sm text-slate-500">{formatDate(latestDelivery.delivered_at)} · {latestDelivery.inventory_item_name || 'Sin producto'}</p><p className="mt-3 text-sm text-slate-600">Cantidad: {latestDelivery.quantity || '-'} · Responsable: {latestDelivery.responsible || '-'}</p></> : <p className="text-sm text-slate-500">No hay entregas registradas.</p>}
      </InfoCard>
      <InfoCard icon={NotebookTabs} title="Último seguimiento">
        {latestHistory ? <><div className="flex items-center justify-between gap-3"><p className="font-bold text-ink">{latestHistory.entry_type || 'Seguimiento'}</p><span className="text-xs text-slate-500">{formatDate(latestHistory.date)}</span></div><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{latestHistory.notes}</p></> : <p className="text-sm text-slate-500">No hay anotaciones en el historial social.</p>}
      </InfoCard>
      <InfoCard icon={Users} title="Unidad familiar"><InfoGrid items={[["Unidad", family ? `${family.family_code} · ${family.responsible_name}` : 'Sin unidad familiar'], ['Miembros', beneficiary.family_members], ['Menores', beneficiary.minors_count], ['Contacto', family?.phone || family?.email]]} /></InfoCard>
      <InfoCard icon={CalendarDays} title="Fechas del expediente"><InfoGrid items={[["Primera atención", formatDate(beneficiary.first_attention_at)], ['Fecha de alta', formatDate(beneficiary.joined_at)], ['Última ayuda', formatDate(beneficiary.last_help_at)], ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo']]} /></InfoCard>
    </div>
  );
}

function PersonalDataPanel({ beneficiary }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoCard icon={UserRound} title="Identificación">
        <InfoGrid items={[["Nombre completo", beneficiary.full_name], ['Código', beneficiary.code], ['DNI, NIE o pasaporte', beneficiary.document_id], ['Fecha de nacimiento', formatDate(beneficiary.birth_date)], ['Sexo', beneficiary.sex], ['Estado civil', beneficiary.marital_status], ['Nacionalidad', beneficiary.nationality]]} />
      </InfoCard>
      <InfoCard icon={ContactRound} title="Contacto">
        <div className="space-y-3"><ContactLine icon={Phone} label="Teléfono" value={beneficiary.phone} /><ContactLine icon={Mail} label="Email" value={beneficiary.email} /><ContactLine icon={MapPin} label="Dirección" value={beneficiary.address_full} /><ContactLine icon={Home} label="Código postal" value={beneficiary.postal_code} /></div>
      </InfoCard>
      <InfoCard icon={ClipboardList} title="Datos de atención"><InfoGrid items={[["Situación", beneficiary.situation], ['Ayuda solicitada', beneficiary.requested_help], ['Primera atención', formatDate(beneficiary.first_attention_at)], ['Fecha de alta', formatDate(beneficiary.joined_at)], ['Última ayuda', formatDate(beneficiary.last_help_at)], ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo']]} /></InfoCard>
      <InfoCard icon={FileText} title="Observaciones"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{beneficiary.notes || 'No hay observaciones registradas.'}</p></InfoCard>
    </div>
  );
}

function FamilyPanel({ beneficiary, family, members, canAddMember, canCreateFamily, onAddMember, onCreateFamily }) {
  if (!family) {
    return <EmptyState icon={Users} title="Sin unidad familiar" text="Este beneficiario no está vinculado a ninguna unidad familiar." action={canCreateFamily ? <Button onClick={onCreateFamily}><Plus size={17} /> Crear unidad familiar</Button> : null} />;
  }
  return (
    <section>
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Unidad familiar</p><h3 className="mt-1 text-2xl font-bold text-ink">{family.family_code}</h3><p className="mt-2 text-sm text-slate-600">Titular: <strong>{family.responsible_name || beneficiary.full_name}</strong></p></div>
        {canAddMember && <Button onClick={onAddMember}><UserPlus size={17} /> Añadir miembro</Button>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><FamilyMetric label="Miembros vinculados" value={members.length || beneficiary.family_members || 1} /><FamilyMetric label="Menores" value={members.length ? members.reduce((sum, item) => sum + Number(item.minors_count || 0), 0) : beneficiary.minors_count || 0} /><FamilyMetric label="Dependientes" value={family.dependents_count || 0} /></div>
      <div className="mt-5"><SectionHeading icon={Users} title="Miembros de la unidad" description="Beneficiarios vinculados a esta familia." /><div className="mt-4 grid gap-3 sm:grid-cols-2">{members.map((member) => <article key={member.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 font-bold text-brand-700">{initials(member.full_name)}</span><div className="min-w-0"><p className="truncate font-bold text-ink">{member.full_name}</p><p className="text-xs text-slate-500">{member.code} · {member.id === beneficiary.id ? 'Expediente actual' : member.situation || 'Miembro'}</p></div></article>)}</div>{!members.length && <div className="mt-4"><EmptyState icon={Users} title="Sin miembros vinculados" text="La unidad familiar existe, pero todavía no tiene beneficiarios vinculados." /></div>}</div>
    </section>
  );
}

function FamilyMetric({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink">{value}</p></div>;
}

function QuickFamilyForm({ beneficiary, onSubmit }) {
  const [form, setForm] = useState({ id: crypto.randomUUID(), family_code: `FAM-${String(Date.now()).slice(-4)}`, responsible_name: beneficiary.full_name, address: beneficiary.address_full || '', phone: beneficiary.phone || '', email: beneficiary.email || '', dependents_count: beneficiary.minors_count || 0, notes: '' });
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onSubmit(form); } finally { setSaving(false); } }}><FormField label="Código familiar"><input className={inputClass} required value={form.family_code} onChange={(event) => update('family_code', event.target.value)} /></FormField><FormField label="Titular"><input className={inputClass} required value={form.responsible_name} onChange={(event) => update('responsible_name', event.target.value)} /></FormField><div className="sm:col-span-2"><FormField label="Dirección"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField></div><FormField label="Teléfono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField><FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField><FormField label="Dependientes"><input className={inputClass} type="number" min="0" value={form.dependents_count} onChange={(event) => update('dependents_count', Number(event.target.value))} /></FormField><div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div><div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Creando…' : 'Crear y vincular familia'}</Button></div></form>;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function InfoCard({ icon: Icon, title, children }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Icon size={19} className="text-brand-700" /><h3 className="font-bold text-ink">{title}</h3></div>{children}</section>;
}

function InfoGrid({ items }) {
  return <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-semibold text-slate-800">{value === 0 ? 0 : value || '-'}</dd></div>)}</dl>;
}

function ContactLine({ icon: Icon, label, value }) {
  return <div className="flex gap-3 rounded-lg bg-slate-50 p-3"><Icon size={17} className="mt-0.5 shrink-0 text-slate-400" /><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{value || '-'}</p></div></div>;
}

function DeliveriesPanel({ deliveries, beneficiary, allDeliveries }) {
  return (
    <section>
      <SectionHeading icon={PackageCheck} title="Historial de entregas" description="Ayudas entregadas y justificantes asociados." />
      <div className="mt-4 space-y-3">
        {deliveries.map((delivery) => (
          <article key={delivery.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-brand-50 p-2 text-brand-700"><PackageCheck size={17} /></span><div><h4 className="font-bold text-ink">{delivery.help_type || 'Ayuda entregada'}</h4><p className="text-xs text-slate-500">{formatDate(delivery.delivered_at)} · {delivery.receipt_number || 'Sin número de justificante'}</p></div></div>
                <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2 sm:gap-x-8"><p><strong>Producto:</strong> {delivery.inventory_item_name || '-'}</p><p><strong>Cantidad:</strong> {delivery.quantity || '-'}</p><p><strong>Responsable:</strong> {delivery.responsible || '-'}</p><p><strong>Firma:</strong> {delivery.signature_data_url ? 'Disponible' : 'No disponible'}</p></div>
                {delivery.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{delivery.notes}</p>}
              </div>
              <Button variant="secondary" onClick={() => printDeliveryReceiptPdf(delivery, beneficiary, allDeliveries)}><Printer size={16} /> Justificante</Button>
            </div>
          </article>
        ))}
        {!deliveries.length && <EmptyState icon={PackageCheck} title="Sin entregas registradas" text="Las entregas aparecerán aquí cuando se registren desde su módulo." />}
      </div>
    </section>
  );
}

function DocumentsPanel({ documents, beneficiary, actions, canEdit, canDelete }) {
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await actions.createBeneficiaryDocument({ beneficiary_id: beneficiary.id, document_type: documentType, file_name: file.name, file_data_url: reader.result, uploaded_at: todayISO(), notes: '' });
        if (inputRef.current) inputRef.current.value = '';
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => setUploading(false);
    reader.readAsDataURL(file);
  }

  async function removeDocument(doc) {
    if (window.confirm(`¿Eliminar el documento ${doc.file_name}?`)) await actions.deleteBeneficiaryDocument(doc.id);
  }

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeading icon={Paperclip} title="Documentación" description="Archivos asociados al expediente." />
        {canEdit && <div className="flex flex-col gap-2 sm:flex-row"><select className={inputClass} value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select><label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Upload size={17} /> {uploading ? 'Subiendo…' : 'Subir documento'}<input ref={inputRef} className="hidden" type="file" disabled={uploading} onChange={uploadDocument} /></label></div>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {documents.map((doc) => (
          <article key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700"><FileText size={20} /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-ink">{doc.file_name || 'Documento sin nombre'}</p><p className="mt-0.5 text-xs text-slate-500">{doc.document_type} · {formatDate(doc.uploaded_at)}</p></div>
            {doc.file_data_url && <a className="focus-ring rounded-lg p-2 text-brand-700 hover:bg-brand-50" href={doc.file_data_url} download={doc.file_name} aria-label={`Descargar ${doc.file_name}`} title="Descargar"><Download size={18} /></a>}
            {canDelete && <button className="focus-ring rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeDocument(doc)} aria-label={`Eliminar ${doc.file_name}`} title="Eliminar"><Trash2 size={18} /></button>}
          </article>
        ))}
      </div>
      {!documents.length && <div className="mt-4"><EmptyState icon={Paperclip} title="Sin documentos" text="Todavía no se ha adjuntado documentación a este expediente." /></div>}
    </section>
  );
}

function EmailsPanel({ emailLogs }) {
  return (
    <section>
      <SectionHeading icon={Mail} title="Comunicaciones" description="Historial de emails vinculados al beneficiario." />
      <div className="mt-4 space-y-3">
        {emailLogs.map((log) => <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Mail size={18} /></span><div className="min-w-0"><h4 className="font-bold text-ink">{log.subject || 'Sin asunto'}</h4><p className="mt-0.5 text-xs text-slate-500">{formatDate(log.sent_at)} · {log.recipient}</p><p className="mt-2 text-sm text-slate-600">{log.result || '-'}</p></div></div></article>)}
        {!emailLogs.length && <EmptyState icon={Mail} title="Sin comunicaciones" text="Los emails enviados a este beneficiario aparecerán aquí." />}
      </div>
    </section>
  );
}

function SectionHeading({ icon: Icon, title, description }) {
  return <div className="flex items-start gap-3"><span className="rounded-lg bg-white p-2 text-brand-700 shadow-sm ring-1 ring-slate-200"><Icon size={19} /></span><div><h3 className="font-bold text-ink">{title}</h3><p className="text-sm text-slate-500">{description}</p></div></div>;
}

function EmptyState({ icon: Icon, title, text, action = null }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-9 text-center"><Icon className="mx-auto text-slate-300" size={30} /><h4 className="mt-2 font-bold text-ink">{title}</h4><p className="mt-1 text-sm text-slate-500">{text}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</div>;
}

function BeneficiaryEmailForm({ beneficiary, deliveries, organization, actions, currentUser, onSent }) {
  const latestDelivery = [...deliveries].sort((a, b) => String(b.delivered_at || '').localeCompare(String(a.delivered_at || '')))[0];
  const [form, setForm] = useState({ template: 'receipt', recipients: beneficiary.email || '', subject: EMAIL_TEMPLATES[0].subject, message: EMAIL_TEMPLATES[0].message, attachReceipt: Boolean(latestDelivery) });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function chooseTemplate(id) {
    const template = EMAIL_TEMPLATES.find((item) => item.id === id) || EMAIL_TEMPLATES[0];
    setForm((current) => ({ ...current, template: id, subject: template.subject, message: template.message, attachReceipt: id === 'receipt' && Boolean(latestDelivery) }));
  }

  async function submit(event) {
    event.preventDefault();
    setStatus('Generando PDF y enviando correo...');
    setError('');
    if (!form.recipients) {
      setStatus('');
      setError('Este beneficiario no tiene correo electrónico registrado.');
      return;
    }
    if (form.attachReceipt && !latestDelivery) {
      setStatus('');
      setError('No hay entregas registradas para adjuntar justificante PDF.');
      return;
    }
    let attachments = [];
    const receiptEntries = form.attachReceipt ? [{ delivery: latestDelivery, beneficiary }] : [];
    try {
      const payload = await sendEmailViaApi({ to: form.recipients, subject: form.subject, message: form.message, receiptEntries, organization, logEmail: receiptEntries.length > 0 });
      attachments = payload.attachments || [];
      if (receiptEntries.length) await actions.reloadData();
      else await saveEmailLog(actions, currentUser, form, attachments.length, payload.message || 'Correo enviado correctamente.', attachments, payload.id);
      onSent(`Correo enviado correctamente. ID Resend: ${payload.id}`);
    } catch (err) {
      const message = normalizeEmailError(err);
      if (!receiptEntries.length) await saveEmailLog(actions, currentUser, form, attachments.length, message, attachments, '', 'Error');
      setStatus('');
      setError(message);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <FormField label="Plantilla"><select className={inputClass} value={form.template} onChange={(event) => chooseTemplate(event.target.value)}>{EMAIL_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></FormField>
      <FormField label="Destinatario"><input className={inputClass} type="email" required value={form.recipients} onChange={(event) => update('recipients', event.target.value)} /></FormField>
      <FormField label="Asunto"><input className={inputClass} value={form.subject} onChange={(event) => update('subject', event.target.value)} /></FormField>
      <FormField label="Mensaje"><textarea className={inputClass} rows="5" value={form.message} onChange={(event) => update('message', event.target.value)} /></FormField>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><input type="checkbox" disabled={!latestDelivery} checked={form.attachReceipt} onChange={(event) => update('attachReceipt', event.target.checked)} />Adjuntar justificante PDF de la última entrega</label>
      {status && <p className="rounded-lg bg-brand-50 p-3 text-sm font-medium text-brand-700">{status}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={Boolean(status)}><Mail size={18} /> Enviar email</Button></div>
    </form>
  );
}

function SocialHistory({ history, beneficiary, actions, currentUser, canEdit }) {
  const [note, setNote] = useState('');
  const [entryType, setEntryType] = useState('Seguimiento');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      await actions.createSocialHistory({ beneficiary_id: beneficiary.id, date, entry_type: entryType, notes: note.trim() });
      setNote('');
      setDate(todayISO());
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionHeading icon={NotebookTabs} title="Historial social" description="Anotaciones y seguimiento del expediente." />
      {canEdit && (
        <form className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-[180px_170px_1fr_auto] sm:items-end">
            <FormField label="Tipo"><select className={inputClass} value={entryType} onChange={(event) => setEntryType(event.target.value)}>{SOCIAL_ENTRY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
            <FormField label="Fecha"><input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></FormField>
            <FormField label="Nueva anotación"><input className={inputClass} required value={note} onChange={(event) => setNote(event.target.value)} placeholder="Escribe una anotación de seguimiento" /></FormField>
            <Button type="submit" disabled={saving || !note.trim()}>{saving ? 'Guardando…' : 'Añadir'}</Button>
          </div>
        </form>
      )}
      <div className="relative mt-5 space-y-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-slate-200">
        {history.map((item) => (
          <article key={item.id} className="relative flex gap-4">
            <span className="z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-4 ring-slate-50"><CalendarDays size={17} /></span>
            <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-ink">{item.entry_type || 'Seguimiento'}</h4><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><UserRound size={13} /> {socialHistoryUser(item, currentUser)}</p></div><time className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{formatDate(item.date)}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.notes}</p></div>
          </article>
        ))}
      </div>
      {!history.length && <div className="mt-4"><EmptyState icon={NotebookTabs} title="Sin anotaciones" text="Todavía no hay entradas en el historial social." /></div>}
    </section>
  );
}

function socialHistoryUser(item, currentUser) {
  return item.user_name || item.created_by || item.user || (item.isLocalDraft ? `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() : '') || 'Usuario no registrado';
}
