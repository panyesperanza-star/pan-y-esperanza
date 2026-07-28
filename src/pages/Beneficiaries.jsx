import {
  CalendarDays,
  CalendarPlus,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock3,
  ContactRound,
  Download,
  Edit3,
  FileText,
  HeartHandshake,
  Home,
  IdCard,
  ImageOff,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  NotebookTabs,
  PackagePlus,
  PackageCheck,
  Paperclip,
  Phone,
  Plus,
  Power,
  PowerOff,
  Printer,
  Search,
  Trash2,
  Upload,
  UserRound,
  UserPlus,
  Users
} from 'lucide-react';
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { DeletionRequestForm } from '../components/DeletionRequestForm';
import { DirectDeletionForm } from '../components/DirectDeletionForm';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion } from '../lib/auth';
import { removeBeneficiaryDocumentFile, resolveBeneficiaryDocumentUrl, uploadBeneficiaryDocumentFile } from '../lib/beneficiaryDocuments';
import { removeBeneficiaryPhoto, resolveBeneficiaryPhotoUrl, uploadBeneficiaryPhoto } from '../lib/beneficiaryPhotos';
import { BENEFICIARY_SITUATIONS, DOCUMENT_TYPES, HELP_TYPES } from '../lib/constants';
import { EMAIL_TEMPLATES, normalizeEmailError, saveEmailLog, sendEmailViaApi } from '../lib/emailClient';
import { printBeneficiaryCardPdf, printBeneficiaryPdf, printDeliveryReceiptPdf, printPortalAccessPdf, printSocialAttentionReportPdf } from '../lib/exporters';
import { formatDate, formatDateTime, nextBeneficiaryCode, normalize, normalizeDocument, todayISO } from '../lib/formatters';
import { findDuplicateBeneficiaryCode, findDuplicateBeneficiaryDocument } from '../services/beneficiaries/BeneficiarioService';
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
  family_relationship: '',
  notes: '',
  joined_at: todayISO(),
  is_active: true,
  last_help_at: null
};

const FAMILY_ARCHIVE_MARKER = '[FAMILIA_ARCHIVADA]';

const SEX_OPTIONS = ['Mujer', 'Hombre', 'No binario', 'Prefiere no indicar'];
const MARITAL_STATUS_OPTIONS = ['Soltero/a', 'Casado/a', 'Pareja de hecho', 'Separado/a', 'Divorciado/a', 'Viudo/a'];
const SOCIAL_ENTRY_TYPES = ['Seguimiento', 'Primera atención', 'Incidencia', 'Derivación', 'Información y orientación'];
const OBSERVATION_ENTRY_TYPE = 'Observación';
const OBJECTIVE_ENTRY_TYPE = 'Objetivo';
const DELIVERY_TRACKING_ENTRY_TYPE = 'Entrega de ayuda';

function safeRows(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function Beneficiaries({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [situationFilter, setSituationFilter] = useState('Todas');
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [targetIds, setTargetIds] = useState([]);
  const [targetLabel, setTargetLabel] = useState('');
  const [deletionTarget, setDeletionTarget] = useState(null);
  const [listNotice, setListNotice] = useState('');

  const canCreate = canDo(currentUser, 'beneficiaries', 'create');
  const canEdit = canDo(currentUser, 'beneficiaries', 'edit');
  const canDelete = canDo(currentUser, 'beneficiaries', 'delete');
  const organization = data.organization_settings?.[0] || {};
  const canDeleteDirectly = canDeleteDefinitively(currentUser, 'beneficiaries', organization);
  const canRequestDeletion = canRequestDefinitiveDeletion(currentUser, 'beneficiaries', organization);
  const activeCount = data.beneficiaries.filter((item) => item.is_active).length;
  const urgentCount = data.beneficiaries.filter((item) => item.is_active && item.situation === 'Urgente').length;
  const attendedCount = new Set(data.deliveries.filter(isActiveDelivery).map((item) => item.beneficiary_id).filter(Boolean)).size;
  const profile = data.beneficiaries.find((item) => item.id === profileId) || null;

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'beneficiaries') return;
    const hasExplicitIds = Array.isArray(navigationTarget.beneficiaryIds);
    const ids = new Set(hasExplicitIds ? navigationTarget.beneficiaryIds : []);
    if (navigationTarget.familyId) {
      data.beneficiaries
        .filter((item) => item.family_id === navigationTarget.familyId)
        .forEach((item) => ids.add(item.id));
    }
    if (!ids.size && !hasExplicitIds && navigationTarget.filter === 'critical-families') {
      data.beneficiaries
        .filter((item) => item.is_active && item.situation === 'Urgente')
        .forEach((item) => ids.add(item.id));
    }
    if (!ids.size && navigationTarget.profileId) ids.add(navigationTarget.profileId);

    setTargetIds([...ids]);
    setTargetLabel(navigationTarget.label || targetLabelForBeneficiaries(navigationTarget.filter));
    setQuery('');
    if (navigationTarget.filter === 'critical-families') {
      setStatusFilter('Activos');
      setSituationFilter('Todas');
    } else if (navigationTarget.filter === 'stale-help') {
      setStatusFilter('Activos');
      setSituationFilter('Todas');
    } else if (!navigationTarget.filter && !navigationTarget.profileId && !navigationTarget.familyId) {
      setStatusFilter('Todos');
      setSituationFilter('Todas');
    }
    if (navigationTarget.profileId && data.beneficiaries.some((item) => item.id === navigationTarget.profileId)) {
      setProfileId(navigationTarget.profileId);
    }
  }, [data.beneficiaries, navigationTarget]);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return data.beneficiaries.filter((item) => {
      const matchesQuery = normalize(`${item.full_name} ${item.document_id} ${item.code} ${item.phone} ${item.email}`).includes(needle);
      const matchesStatus = statusFilter === 'Todos' || (statusFilter === 'Activos' ? item.is_active : !item.is_active);
      const matchesSituation = situationFilter === 'Todas' || item.situation === situationFilter;
      const matchesTarget = !targetIds.length || targetIds.includes(item.id);
      return matchesQuery && matchesStatus && matchesSituation && matchesTarget;
    });
  }, [data.beneficiaries, query, situationFilter, statusFilter, targetIds]);

  async function save(form) {
    const { __family_mode, __new_family, ...beneficiaryPayload } = form;
    const payload = { ...beneficiaryPayload };
    if (__family_mode === 'none') payload.family_id = '';
    if (__family_mode === 'new') {
      const createdFamily = await actions.createFamily({
        ...__new_family,
        family_code: __new_family?.family_code || nextFamilyCode(data.families),
        responsible_name: payload.full_name,
        address: __new_family?.address || payload.address_full,
        phone: __new_family?.phone || payload.phone,
        email: __new_family?.email || payload.email,
        dependents_count: Number(__new_family?.dependents_count ?? payload.minors_count ?? 0),
        status: 'Activa'
      });
      payload.family_id = createdFamily?.id || __new_family?.id || '';
    }
    if (payload.family_id && !payload.family_relationship) payload.family_relationship = 'Responsable';
    if (form.id) await actions.updateBeneficiary(form.id, payload);
    else await actions.createBeneficiary(payload);
    setEditing(null);
  }

  function removeBeneficiary(item) {
    setDeletionTarget({
      item,
      relations: buildBeneficiaryRelationWarnings(item, data)
    });
  }

  async function sendDeletionRequest(item, payload) {
    await actions.createDeletionRequest({
      module: 'beneficiaries',
      record_type: 'beneficiary',
      record_id: item.id,
      record_label: item.full_name || item.code || item.id,
      reason: payload.reason,
      notes: payload.notes,
      relations: buildBeneficiaryRelationWarnings(item, data)
    });
    setDeletionTarget(null);
  }

  async function deletePermanently(item) {
    await actions.deleteBeneficiary(item.id);
    setDeletionTarget(null);
  }

  async function activatePendingPortals() {
    if (!window.confirm('Activar portales pendientes de beneficiarios activos?')) return;
    const result = await actions.activatePendingBeneficiaryPortals();
    setListNotice(`Portales activados: ${result.activated}. Omitidos: ${result.omitted}.`);
  }

  return (
    <>
      <PageHeader
        title="Beneficiarios"
        description="Gestión de personas atendidas y acceso a su expediente."
        actions={(
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button variant="secondary" onClick={activatePendingPortals}><KeyRound size={18} /> Activar portales pendientes</Button>}
            {canCreate && <Button onClick={() => setEditing({ ...emptyBeneficiary, code: nextBeneficiaryCode(data.beneficiaries) })}><Plus size={18} /> Nuevo beneficiario</Button>}
          </div>
        )}
      />

      {listNotice && (
        <div className="mb-4 rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" role="status">
          {listNotice}
        </div>
      )}

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
        {targetLabel && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold">Filtro del Centro de Operaciones: {targetLabel}</span>
            <Button variant="secondary" onClick={() => { setTargetIds([]); setTargetLabel(''); }}>
              Quitar filtro
            </Button>
          </div>
        )}
        <p className="mt-3 text-xs font-medium text-slate-500">Mostrando {filtered.length} de {data.beneficiaries.length} registros</p>
      </section>

      <section className="space-y-3" aria-label="Listado de beneficiarios">
        {filtered.map((item) => {
          const deliveries = data.deliveries.filter((delivery) => delivery.beneficiary_id === item.id);
          const activeDeliveries = deliveries.filter(isActiveDelivery);
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
                  <p className="mt-1 text-xs text-slate-400">{activeDeliveries.length} {activeDeliveries.length === 1 ? 'entrega activa' : 'entregas activas'}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button variant="secondary" onClick={() => setProfileId(item.id)}><FileText size={16} /> Abrir expediente <ChevronRight size={15} /></Button>
                  <button className="focus-ring rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" onClick={() => printBeneficiaryPdf(item, deliveries)} aria-label={`Descargar resumen del expediente de ${item.full_name}`} title="Resumen del expediente"><Printer size={17} /></button>
                  {canEdit && <button className="focus-ring rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" onClick={() => setEditing(item)} aria-label={`Editar a ${item.full_name}`} title="Editar"><Edit3 size={17} /></button>}
                  {(canDeleteDirectly || canRequestDeletion) && <button className="focus-ring rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" onClick={() => removeBeneficiary(item)} aria-label={`${canDeleteDirectly ? 'Eliminar' : 'Solicitar eliminación de'} ${item.full_name}`} title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'}><Trash2 size={17} /></button>}
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
          <BeneficiaryForm
            families={data.families}
            beneficiaries={data.beneficiaries}
            initial={editing}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            canOverrideDuplicateDocument={canEdit}
            onOpenFamily={(family) => {
              setEditing(null);
              onNavigate?.({
                moduleId: 'beneficiaries',
                familyId: family.id,
                label: `Unidad familiar ${family.family_code || family.responsible_name || ''}`.trim()
              });
            }}
          />
        </Modal>
      )}
      {profile && (
        <Modal wide title={`Expediente · ${profile.code}`} onClose={() => setProfileId(null)}>
          <BeneficiaryProfileErrorBoundary resetKey={profile.id} onBack={() => setProfileId(null)}>
            <BeneficiaryProfile
              data={data}
              actions={actions}
              currentUser={currentUser}
              navigationTarget={navigationTarget}
              beneficiary={profile}
              deliveries={safeRows(data.deliveries).filter((item) => item.beneficiary_id === profile.id)}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => { setProfileId(null); setEditing(profile); }}
              onNewAppointment={() => onNavigate?.({ moduleId: 'communications', filter: 'agenda', profileId: profile.id })}
              onOpenAgenda={() => onNavigate?.({ moduleId: 'agenda', profileId: profile.id })}
              onCreateCampaign={() => onNavigate?.({ moduleId: 'agenda', filter: 'campaigns', profileId: profile.id })}
              onAddFamilyMember={(familyId) => {
                setProfileId(null);
                setEditing({ ...emptyBeneficiary, code: nextBeneficiaryCode(safeRows(data.beneficiaries)), family_id: familyId });
              }}
            />
          </BeneficiaryProfileErrorBoundary>
        </Modal>
      )}
      {deletionTarget && (
        <Modal title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'} onClose={() => setDeletionTarget(null)}>
          {canDeleteDirectly ? (
            <DirectDeletionForm
              recordLabel={deletionTarget.item.full_name || deletionTarget.item.code || deletionTarget.item.id}
              relations={deletionTarget.relations}
              onCancel={() => setDeletionTarget(null)}
              onConfirm={() => deletePermanently(deletionTarget.item)}
            />
          ) : (
            <DeletionRequestForm
              recordLabel={deletionTarget.item.full_name || deletionTarget.item.code || deletionTarget.item.id}
              relations={deletionTarget.relations}
              onCancel={() => setDeletionTarget(null)}
              onSubmit={(payload) => sendDeletionRequest(deletionTarget.item, payload)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

class BeneficiaryProfileErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Beneficiarios] Error al renderizar expediente', error, info);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center shadow-sm" role="alert">
        <FileText className="mx-auto text-red-500" size={34} />
        <h3 className="mt-3 text-lg font-black text-red-800">No hemos podido abrir este expediente.</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-red-700">
          Se ha registrado el error en consola para revision tecnica. Puedes volver al listado y abrir otro expediente sin recargar la aplicacion.
        </p>
        <div className="mt-5">
          <Button type="button" variant="secondary" onClick={this.props.onBack}>Volver a Beneficiarios</Button>
        </div>
      </section>
    );
  }
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
  if (['activa', 'inactiva'].includes(normalize(value))) return null;
  const tone = value === 'Urgente' ? 'bg-orange-50 text-orange-700 ring-orange-200' : value === 'Inactiva' ? 'bg-slate-100 text-slate-600 ring-slate-200' : value === 'Seguimiento' ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-brand-50 text-brand-700 ring-brand-100';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${tone}`}>{value || 'Sin situación'}</span>;
}

function targetLabelForBeneficiaries(filter) {
  if (filter === 'critical-families') return 'Familias críticas';
  if (filter === 'stale-help') return 'Sin ayuda +30 dias';
  if (filter === 'family-detail') return 'Expediente seleccionado';
  return '';
}

function buildBeneficiaryRelationWarnings(beneficiary, data) {
  if (!beneficiary) return [];
  const relations = [];
  const deliveries = (data.deliveries || []).filter((item) => item.beneficiary_id === beneficiary.id);
  const documents = (data.beneficiary_documents || []).filter((item) => item.beneficiary_id === beneficiary.id);
  const history = (data.social_history || []).filter((item) => item.beneficiary_id === beneficiary.id);
  const socialEvents = (data.social_value_events || []).filter((item) => item.source_record_id === beneficiary.id || deliveries.some((delivery) => delivery.id === item.source_record_id));
  const emailLogs = (data.email_logs || []).filter((log) => (
    Array.isArray(log.receipt_ids) && deliveries.some((delivery) => log.receipt_ids.includes(delivery.id))
  ));

  if (beneficiary.family_id) relations.push(`Familia vinculada: ${beneficiary.family_id}`);
  if (deliveries.length) relations.push(`Entregas: ${deliveries.length}`);
  if (documents.length) relations.push(`Documentos: ${documents.length}`);
  if (history.length) relations.push(`Seguimiento: ${history.length}`);
  if (socialEvents.length) relations.push(`Valor social: ${socialEvents.length} evento${socialEvents.length === 1 ? '' : 's'}`);
  if (emailLogs.length) relations.push(`Comunicaciones: ${emailLogs.length}`);
  if (beneficiary.profile_photo) relations.push('Fotografía de perfil');
  return relations;
}

function SocialSituationBadge({ value }) {
  const normalized = normalize(value);
  const label = normalized === 'activa' ? 'Atención general' : normalized === 'inactiva' ? 'Sin seguimiento' : value || 'Sin situación';
  const tone = normalized === 'urgente'
    ? 'bg-orange-50 text-orange-700 ring-orange-200'
    : normalized === 'prioritario'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : normalized === 'vulnerable'
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : normalized === 'seguimiento'
          ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : 'bg-white/90 text-slate-700 ring-slate-200';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>{label}</span>;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function nextFamilyCode(families = []) {
  const last = families.reduce((max, family) => {
    const match = String(family.family_code || '').match(/FAM-(\d+)/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FAM-${String(last + 1).padStart(4, '0')}`;
}

function normalizeAddress(value) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(calle|c|avenida|avda|av|paseo|plaza|psje|pasaje|numero|num|n)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneValue(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits.length >= 6 ? digits : '';
}

function phonesMatch(a, b) {
  const left = normalizePhoneValue(a);
  const right = normalizePhoneValue(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.length >= 9 && right.length >= 9 && left.slice(-9) === right.slice(-9);
}

function normalizeEmailValue(value) {
  return String(value || '').trim().toLowerCase();
}

function nameSimilarityScore(a, b) {
  const left = normalizeNameTokens(a);
  const right = normalizeNameTokens(b);
  if (!left.length || !right.length) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  const containment = shared / Math.min(leftSet.size, rightSet.size);
  const jaccard = shared / union;
  return Math.max(containment, jaccard);
}

function normalizeNameTokens(value) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function isNameVerySimilar(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right || left === right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  return nameSimilarityScore(a, b) >= 0.75;
}

function buildFamilyDraft(form, families = []) {
  return {
    family_code: form.__new_family?.family_code || nextFamilyCode(families),
    responsible_name: form.full_name || '',
    address: form.address_full || form.__new_family?.address || '',
    phone: form.phone || form.__new_family?.phone || '',
    email: form.email || form.__new_family?.email || '',
    dependents_count: Number(form.__new_family?.dependents_count ?? form.minors_count ?? 0),
    notes: form.__new_family?.notes || ''
  };
}

function withNewFamilyMode(form, families = []) {
  return {
    ...form,
    family_id: '',
    family_relationship: form.family_relationship || 'Responsable',
    __family_mode: 'new',
    __new_family: {
      ...buildFamilyDraft(form, families),
      family_code: form.__new_family?.family_code || nextFamilyCode(families)
    }
  };
}

function withExistingFamilyMode(form, familyId) {
  return {
    ...form,
    family_id: familyId || '',
    family_relationship: form.family_relationship || 'Responsable',
    __family_mode: familyId ? 'existing' : 'none'
  };
}

function buildBeneficiaryFamilyAnalysis({ form, initial, families = [], beneficiaries = [] }) {
  const currentId = form.id || '';
  const activeFamilies = safeRows(families).filter((family) => !isArchivedFamily(family));
  const beneficiaryRows = safeRows(beneficiaries);
  const cleanAddress = normalizeAddress(form.address_full);
  const initialAddress = normalizeAddress(initial?.address_full);
  const addressChanged = Boolean(form.id && cleanAddress && cleanAddress !== initialAddress);
  const addressBeneficiaryMatches = cleanAddress
    ? beneficiaryRows.filter((item) => item.id !== currentId && normalizeAddress(item.address_full) === cleanAddress)
    : [];
  const addressFamilyIds = new Set(addressBeneficiaryMatches.map((item) => item.family_id).filter(Boolean));
  const familyMembers = (familyId) => beneficiaryRows.filter((item) => item.id !== currentId && item.family_id === familyId);
  const withMembers = (family) => ({
    ...family,
    members: familyMembers(family.id)
  });
  const directAddressMatches = cleanAddress
    ? activeFamilies.filter((family) => normalizeAddress(family.address) === cleanAddress)
    : [];
  const linkedAddressMatches = activeFamilies.filter((family) => addressFamilyIds.has(family.id));
  const addressMatches = [...new Map([...directAddressMatches, ...linkedAddressMatches].map((family) => [family.id, family])).values()].map(withMembers);
  const addressMatchOutsideSelection = addressMatches.filter((family) => family.id !== form.family_id);
  const selectedMatchesAddress = Boolean(form.family_id && addressMatches.some((family) => family.id === form.family_id));
  const addressMembersWithKnownFamily = new Set(addressMatches.flatMap((family) => family.members.map((member) => member.id)));
  const unlinkedAddressMembers = addressBeneficiaryMatches.filter((item) => !addressMembersWithKnownFamily.has(item.id));
  const standaloneAddressMatch = unlinkedAddressMembers.length
    ? {
      id: `address:${cleanAddress}`,
      family_code: 'Unidad familiar no creada',
      responsible_name: unlinkedAddressMembers[0]?.full_name || 'Coincidencia por dirección',
      address: form.address_full,
      members: unlinkedAddressMembers,
      isAddressOnlyMatch: true
    }
    : null;
  const familyUnitMatches = standaloneAddressMatch ? [...addressMatchOutsideSelection, standaloneAddressMatch] : addressMatchOutsideSelection;
  const shouldAskAddressDecision = Boolean(cleanAddress && familyUnitMatches.length && !selectedMatchesAddress);
  const cleanPhone = normalizePhoneValue(form.phone);
  const cleanEmail = normalizeEmailValue(form.email);
  const phoneMatches = cleanPhone
    ? beneficiaryRows.filter((item) => item.id !== currentId && phonesMatch(item.phone, form.phone))
    : [];
  const emailMatches = cleanEmail
    ? beneficiaryRows.filter((item) => item.id !== currentId && normalizeEmailValue(item.email) === cleanEmail)
    : [];
  const nameMatches = form.full_name
    ? beneficiaryRows.filter((item) => item.id !== currentId && isNameVerySimilar(item.full_name, form.full_name))
    : [];

  return {
    addressMatches,
    addressMatchOutsideSelection,
    addressBeneficiaryMatches,
    familyUnitMatches,
    addressChanged,
    shouldAskAddressDecision,
    phoneMatches,
    emailMatches,
    nameMatches
  };
}

function BeneficiaryForm({ families, beneficiaries, initial, onSubmit, onCancel, canOverrideDuplicateDocument = false, onOpenFamily = null }) {
  const [form, setForm] = useState(() => ({
    ...emptyBeneficiary,
    ...initial,
    family_id: initial.family_id || '',
    __family_mode: initial.family_id ? 'existing' : 'none',
    __new_family: {
      family_code: nextFamilyCode(families),
      responsible_name: initial.full_name || '',
      address: initial.address_full || '',
      phone: initial.phone || '',
      email: initial.email || '',
      dependents_count: initial.minors_count || 0,
      notes: ''
    }
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [documentConflict, setDocumentConflict] = useState(null);
  const [documentOverrideKey, setDocumentOverrideKey] = useState('');
  const [familyAssociationChoice, setFamilyAssociationChoice] = useState('');
  const [selectedFamilyMatchId, setSelectedFamilyMatchId] = useState('');
  const [warningConfirmationOpen, setWarningConfirmationOpen] = useState(false);
  const [confirmedWarningKey, setConfirmedWarningKey] = useState('');
  const [highlightWarnings, setHighlightWarnings] = useState(false);
  const documentInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const warningsRef = useRef(null);
  const activeFamilies = safeRows(families).filter((family) => !isArchivedFamily(family));
  const selectedArchivedFamily = form.family_id ? families.find((family) => family.id === form.family_id && isArchivedFamily(family)) : null;
  const selectableFamilies = selectedArchivedFamily
    ? [selectedArchivedFamily, ...activeFamilies.filter((family) => family.id !== selectedArchivedFamily.id)]
    : activeFamilies;
  const familyAnalysis = useMemo(
    () => buildBeneficiaryFamilyAnalysis({ form, initial, families, beneficiaries }),
    [form, initial, families, beneficiaries]
  );
  const familyMatchIds = familyAnalysis.familyUnitMatches.map((family) => family.id).join('|');
  const duplicateDocument = findDuplicateBeneficiaryDocument(beneficiaries, form, form.id);
  const duplicateDocumentKey = duplicateDocument ? `${duplicateDocument.id}:${normalizeDocument(form.document_id)}` : '';
  const activeWarnings = useMemo(() => buildBeneficiaryWarningSummaries(familyAnalysis), [familyAnalysis]);
  const activeWarningKey = activeWarnings.map((warning) => warning.key).join('|');

  useEffect(() => {
    const matches = familyAnalysis.familyUnitMatches;
    if (!matches.length) {
      setFamilyAssociationChoice('');
      setSelectedFamilyMatchId('');
      return;
    }
    setSelectedFamilyMatchId((current) => (
      matches.some((family) => family.id === current) ? current : matches[0]?.id || ''
    ));
    setFamilyAssociationChoice((current) => current || (matches[0]?.isAddressOnlyMatch ? '' : 'associate'));
  }, [familyMatchIds]);

  const update = (field, value) => {
    setFormError('');
    setConfirmedWarningKey('');
    if (field === 'document_id') {
      setDocumentConflict(null);
      setDocumentOverrideKey('');
    }
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const errorClass = (field) => (fieldErrors[field] ? ' border-red-500 focus:ring-red-500' : '');

  function updateFamilyMode(value) {
    setForm((current) => ({
      ...current,
      __family_mode: value,
      family_id: value === 'none' ? '' : value === 'existing' ? current.family_id || activeFamilies[0]?.id || '' : '',
      family_relationship: value === 'none' ? '' : current.family_relationship || 'Responsable',
      __new_family: {
        ...current.__new_family,
        family_code: current.__new_family?.family_code || nextFamilyCode(families),
        responsible_name: current.__new_family?.responsible_name || current.full_name,
        address: current.__new_family?.address || current.address_full,
        phone: current.__new_family?.phone || current.phone,
        email: current.__new_family?.email || current.email,
        dependents_count: current.__new_family?.dependents_count ?? current.minors_count ?? 0
      }
    }));
  }

  function updateNewFamily(field, value) {
    setForm((current) => ({
      ...current,
      __new_family: {
        ...current.__new_family,
        [field]: value
      }
    }));
  }

  function validateUniqueFields() {
    if (duplicateDocument) {
      setDocumentConflict(duplicateDocument);
      if (!canOverrideDuplicateDocument || documentOverrideKey !== duplicateDocumentKey) {
        setFieldErrors({ document_id: `Ya existe este documento en el expediente ${duplicateDocument.code || duplicateDocument.full_name || duplicateDocument.id}.` });
        documentInputRef.current?.focus();
        return false;
      }
    }
    const duplicateCode = findDuplicateBeneficiaryCode(beneficiaries, form, form.id);
    if (duplicateCode) {
      setFieldErrors({ code: 'Ya existe un beneficiario registrado con ese código.' });
      codeInputRef.current?.focus();
      return false;
    }
    return true;
  }

  async function submitLegacy(event) {
    event.preventDefault();
    setFormError('');
    if (!validateUniqueFields()) return;
    if (form.__family_mode === 'existing' && !form.family_id) {
      setFormError('Selecciona una familia existente o cambia a crear una nueva.');
      return;
    }
    if (form.__family_mode === 'existing' && isArchivedFamily(families.find((family) => family.id === form.family_id)) && initial.family_id !== form.family_id) {
      setFormError('No se pueden añadir nuevos miembros a una familia archivada.');
      return;
    }
    if (form.__family_mode === 'new') {
      const duplicateFamily = families.find((family) => normalize(family.family_code) === normalize(form.__new_family?.family_code));
      if (duplicateFamily) {
        setFormError('Ya existe una familia con ese código.');
        return;
      }
    }
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

  function buildPreparedForm(baseForm = form, options = {}) {
    let prepared = { ...baseForm };
    if (duplicateDocument && documentOverrideKey === duplicateDocumentKey) {
      prepared.__allow_duplicate_document = true;
    } else {
      delete prepared.__allow_duplicate_document;
    }

    if (options.skipFamilyDetection) return prepared;

    const analysis = buildBeneficiaryFamilyAnalysis({ form: prepared, initial, families, beneficiaries });
    if (analysis.shouldAskAddressDecision) {
      const selectedFamily = analysis.familyUnitMatches.find((family) => family.id === selectedFamilyMatchId) || analysis.familyUnitMatches[0];
      if (familyAssociationChoice === 'associate') {
        if (selectedFamily?.isAddressOnlyMatch) {
          setFormError('La dirección coincide con expedientes existentes, pero no hay una familia creada para asociar. Elige crear una nueva unidad familiar o no asociar por el momento.');
          return { invalid: true };
        }
        return withExistingFamilyMode(prepared, selectedFamily?.id);
      }
      if (familyAssociationChoice === 'new') return withNewFamilyMode(prepared, families);
      if (familyAssociationChoice === 'none') return withExistingFamilyMode(prepared, '');
      setFormError('Indica si quieres asociar esta persona a la unidad familiar detectada, crear una nueva o no asociarla por el momento.');
      return { invalid: true };
    }
    return prepared;
  }

  function validateFamilySelection(preparedForm) {
    if (preparedForm.__family_mode === 'existing' && !preparedForm.family_id) {
      setFormError('Selecciona una familia existente o cambia a crear una nueva.');
      return false;
    }
    if (preparedForm.__family_mode === 'existing' && isArchivedFamily(families.find((family) => family.id === preparedForm.family_id)) && initial.family_id !== preparedForm.family_id) {
      setFormError('No se pueden añadir nuevos miembros a una familia archivada.');
      return false;
    }
    if (preparedForm.__family_mode === 'new') {
      const duplicateFamily = families.find((family) => normalize(family.family_code) === normalize(preparedForm.__new_family?.family_code));
      if (duplicateFamily) {
        setFormError('Ya existe una familia con ese código.');
        return false;
      }
    }
    return true;
  }

  async function submitPreparedForm(preparedForm) {
    if (!validateFamilySelection(preparedForm)) return;
    setSaving(true);
    try {
      await onSubmit(preparedForm);
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

  function shouldConfirmWarnings() {
    return activeWarnings.length > 0 && confirmedWarningKey !== activeWarningKey;
  }

  function reviewActiveWarnings() {
    setWarningConfirmationOpen(false);
    warningsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlightWarnings(true);
    window.setTimeout(() => setHighlightWarnings(false), 2200);
  }

  async function continueAfterWarningConfirmation() {
    setWarningConfirmationOpen(false);
    setConfirmedWarningKey(activeWarningKey);
    const preparedForm = buildPreparedForm();
    if (preparedForm?.invalid) return;
    await submitPreparedForm(preparedForm);
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    if (!validateUniqueFields()) return;
    const preparedForm = buildPreparedForm();
    if (preparedForm?.invalid) return;
    if (shouldConfirmWarnings()) {
      setWarningConfirmationOpen(true);
      return;
    }
    await submitPreparedForm(preparedForm);
  }

  return (
    <>
    <form className="space-y-5" onSubmit={submit}>
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{formError}</div>}
      {documentConflict && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <p className="font-black">DNI/NIE/Pasaporte ya registrado.</p>
          <p className="mt-1">Expediente existente: <strong>{documentConflict.code || '-'}</strong> · {documentConflict.full_name || 'Sin nombre'} · {normalizeDocument(documentConflict.document_id)}</p>
          {canOverrideDuplicateDocument ? (
            documentOverrideKey === duplicateDocumentKey ? (
              <p className="mt-2 rounded-md bg-white/70 px-3 py-2 font-bold text-red-700">Confirmación registrada. Pulsa Guardar de nuevo para continuar.</p>
            ) : (
              <Button type="button" variant="secondary" className="mt-3" onClick={() => {
                setDocumentOverrideKey(duplicateDocumentKey);
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next.document_id;
                  return next;
                });
              }}>
                Confirmo que tengo permiso para continuar
              </Button>
            )
          ) : (
            <p className="mt-2 font-semibold">No tienes permisos suficientes para continuar con un documento duplicado.</p>
          )}
        </div>
      )}
      {activeWarnings.length > 0 && (
        <div
          ref={warningsRef}
          className={`space-y-3 rounded-xl transition-all duration-300 ${highlightWarnings ? 'bg-amber-50/70 p-2 ring-4 ring-amber-300 ring-offset-2' : ''}`}
        >
          <FamilyUnitDetectionBlock
            analysis={familyAnalysis}
            choice={familyAssociationChoice}
            selectedFamilyId={selectedFamilyMatchId}
            onChoice={setFamilyAssociationChoice}
            onSelectFamily={setSelectedFamilyMatchId}
            onOpenFamily={onOpenFamily}
          />
          <FamilyIntelligenceAlerts analysis={familyAnalysis} />
        </div>
      )}

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
        <FormField label="Pertenece a una familia?">
          <select className={inputClass} value={form.__family_mode === 'none' ? 'No' : 'Si'} onChange={(event) => updateFamilyMode(event.target.value === 'Si' ? (activeFamilies.length ? 'existing' : 'new') : 'none')}>
            <option>No</option>
            <option>Si</option>
          </select>
        </FormField>
        {form.__family_mode !== 'none' && (
          <FormField label="Relación familiar">
            <input className={inputClass} value={form.family_relationship || ''} onChange={(event) => update('family_relationship', event.target.value)} placeholder="Responsable, hijo/a, pareja..." />
          </FormField>
        )}
        {form.__family_mode !== 'none' && (
          <FormField label="Modo de vinculación">
            <select className={inputClass} value={form.__family_mode} onChange={(event) => updateFamilyMode(event.target.value)}>
              <option value="existing" disabled={!activeFamilies.length && !selectedArchivedFamily}>Seleccionar familia existente</option>
              <option value="new">Crear nueva familia</option>
            </select>
          </FormField>
        )}
        {form.__family_mode === 'existing' && (
          <FormField label="Familia existente">
            <select className={inputClass} required value={form.family_id || ''} onChange={(event) => update('family_id', event.target.value)}>
              <option value="">Selecciona una familia</option>
              {selectableFamilies.map((family) => <option key={family.id} value={family.id} disabled={isArchivedFamily(family) && initial.family_id !== family.id}>{family.family_code} - {family.responsible_name}{isArchivedFamily(family) ? ' (Archivada)' : ''}</option>)}
            </select>
            {selectedArchivedFamily && <p className="mt-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Esta familia está archivada. Se conserva la vinculación existente, pero no admite nuevos miembros.</p>}
          </FormField>
        )}
        {form.__family_mode === 'new' && (
          <div className="grid gap-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4 sm:col-span-2 sm:grid-cols-2">
            <FormField label="Código familia"><input className={inputClass} required value={form.__new_family.family_code || ''} onChange={(event) => updateNewFamily('family_code', event.target.value)} /></FormField>
            <FormField label="Responsable">
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">{form.full_name || 'Se asignará al beneficiario creado'}</div>
            </FormField>
            <div className="sm:col-span-2"><FormField label="Dirección familiar"><input className={inputClass} value={form.__new_family.address || ''} onChange={(event) => updateNewFamily('address', event.target.value)} /></FormField></div>
            <FormField label="Teléfono familiar"><input className={inputClass} value={form.__new_family.phone || ''} onChange={(event) => updateNewFamily('phone', event.target.value)} /></FormField>
            <FormField label="Email familiar"><input className={inputClass} type="email" value={form.__new_family.email || ''} onChange={(event) => updateNewFamily('email', event.target.value)} /></FormField>
            <FormField label="Dependientes"><input className={inputClass} type="number" min="0" value={form.__new_family.dependents_count ?? 0} onChange={(event) => updateNewFamily('dependents_count', Number(event.target.value))} /></FormField>
            <div className="sm:col-span-2"><FormField label="Observaciones familiares"><textarea className={inputClass} rows="3" value={form.__new_family.notes || ''} onChange={(event) => updateNewFamily('notes', event.target.value)} /></FormField></div>
          </div>
        )}
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
    {warningConfirmationOpen && (
      <Modal title="⚠ Se han detectado coincidencias en este expediente." onClose={() => setWarningConfirmationOpen(false)}>
        <div className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-black">Revise estas coincidencias antes de continuar.</p>
            <ul className="mt-3 space-y-2">
              {activeWarnings.map((warning) => (
                <li key={warning.key} className="flex gap-2">
                  <span aria-hidden="true">{warning.icon}</span>
                  <span>{warning.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm font-semibold text-slate-700">¿Qué desea hacer?</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" variant="secondary" onClick={reviewActiveWarnings}>Revisar coincidencias</Button>
            <Button type="button" onClick={continueAfterWarningConfirmation}>Continuar de todos modos</Button>
            <Button type="button" variant="secondary" onClick={() => setWarningConfirmationOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    )}
    </>
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

function buildBeneficiaryWarningSummaries(analysis) {
  if (!analysis) return [];
  const warnings = [];
  if (analysis.phoneMatches?.length) {
    warnings.push({
      key: `phone:${analysis.phoneMatches.map((item) => item.id).join(',')}`,
      icon: '📞',
      text: `El teléfono ya está registrado: ${analysis.phoneMatches.slice(0, 2).map(formatBeneficiaryMatch).join(' / ')}.`
    });
  }
  if (analysis.familyUnitMatches?.length) {
    warnings.push({
      key: `address:${analysis.familyUnitMatches.map((item) => item.id).join(',')}`,
      icon: '🏠',
      text: 'Existe otra persona en la misma dirección o una posible unidad familiar.'
    });
  }
  if (analysis.emailMatches?.length) {
    warnings.push({
      key: `email:${analysis.emailMatches.map((item) => item.id).join(',')}`,
      icon: '✉️',
      text: `El email ya está registrado: ${analysis.emailMatches.slice(0, 2).map(formatBeneficiaryMatch).join(' / ')}.`
    });
  }
  if (analysis.nameMatches?.length) {
    warnings.push({
      key: `name:${analysis.nameMatches.map((item) => item.id).join(',')}`,
      icon: '👤',
      text: `Hay nombres similares: ${analysis.nameMatches.slice(0, 2).map(formatBeneficiaryMatch).join(' / ')}.`
    });
  }
  return warnings;
}

function FamilyUnitDetectionBlock({ analysis, choice, selectedFamilyId, onChoice, onSelectFamily, onOpenFamily }) {
  if (!analysis?.familyUnitMatches?.length) return null;
  const matches = analysis.familyUnitMatches;
  const selectedFamily = matches.find((family) => family.id === selectedFamilyId) || matches[0];
  const members = safeRows(selectedFamily?.members);
  const existingRecords = members
    .map((member) => [member.code, member.full_name].filter(Boolean).join(' - '))
    .filter(Boolean);
  const canAssociate = Boolean(selectedFamily && !selectedFamily.isAddressOnlyMatch);
  const selectedChoice = choice || (canAssociate ? 'associate' : '');

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-sm text-slate-800 shadow-sm" role="status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-black text-ink">🏠 Posible unidad familiar detectada</p>
          <p className="mt-1 text-slate-600">La dirección coincide con una unidad familiar existente. Decide cómo debe quedar vinculado este expediente antes de guardar.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => selectedFamily && onOpenFamily?.(selectedFamily)} disabled={!selectedFamily || !onOpenFamily}>
          Ver expediente familiar
        </Button>
      </div>

      {matches.length > 1 && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-black uppercase tracking-wide text-brand-800">Elegir familia compatible</label>
          <select
            className={inputClass}
            value={selectedFamily?.id || ''}
            onChange={(event) => {
              const nextFamily = matches.find((family) => family.id === event.target.value);
              onSelectFamily(event.target.value);
              onChoice(nextFamily?.isAddressOnlyMatch ? '' : 'associate');
            }}
          >
            {matches.map((family) => (
              <option key={family.id} value={family.id}>
                {family.family_code || 'Familia sin código'} - {family.responsible_name || 'Sin responsable'}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedFamily?.isAddressOnlyMatch && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
          Hay expedientes en la misma dirección, pero todavía no existe una unidad familiar creada para asociar.
        </p>
      )}

      <div className="mt-4 grid gap-3 rounded-lg border border-white/70 bg-white/80 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <FamilyMatchDetail label="Familia encontrada" value={`${selectedFamily?.family_code || '-'} · ${selectedFamily?.responsible_name || 'Sin responsable'}`} />
        <FamilyMatchDetail label="Dirección" value={selectedFamily?.address || 'Dirección no registrada'} />
        <FamilyMatchDetail label="Número de miembros" value={`${members.length} expediente${members.length === 1 ? '' : 's'}`} />
        <FamilyMatchDetail label="Expedientes existentes" value={existingRecords.length ? existingRecords.join(' / ') : 'Sin expedientes vinculados'} />
      </div>

      <div className="mt-4 grid gap-2">
        {[
          ['associate', 'Asociar automáticamente a la familia existente', !canAssociate],
          ['new', 'Crear una nueva unidad familiar'],
          ['none', 'No asociar por el momento']
        ].map(([value, label, disabled]) => (
          <label key={value} className={`flex items-center gap-3 rounded-lg border px-3 py-2 font-semibold transition ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : selectedChoice === value ? 'cursor-pointer border-brand-400 bg-white text-brand-900 shadow-sm' : 'cursor-pointer border-white/70 bg-white/50 text-slate-700 hover:border-brand-200'}`}>
            <input
              type="radio"
              name="family-address-decision"
              className="h-4 w-4 accent-brand-700"
              disabled={disabled}
              checked={selectedChoice === value}
              onChange={() => !disabled && onChoice(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FamilyMatchDetail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}

function FamilyIntelligenceAlerts({ analysis }) {
  if (!analysis) return null;
  const alerts = [];
  if (analysis.phoneMatches.length) {
    alerts.push({
      key: 'phone',
      title: '📞 Este número de teléfono ya está registrado.',
      text: `Beneficiario: ${analysis.phoneMatches.slice(0, 3).map(formatBeneficiaryMatch).join(' / ')}. No bloquea el guardado.`
    });
  }
  if (analysis.emailMatches.length) {
    alerts.push({
      key: 'email',
      title: 'Correo ya utilizado',
      text: `Beneficiario: ${analysis.emailMatches.slice(0, 3).map(formatBeneficiaryMatch).join(' / ')}. No bloquea el guardado.`
    });
  }
  if (analysis.nameMatches.length) {
    alerts.push({
      key: 'name',
      title: 'Nombre similar detectado',
      text: `Posible coincidencia: ${analysis.nameMatches.slice(0, 2).map((item) => `${item.code || '-'} · ${item.full_name}`).join(' / ')}.`
    });
  }
  if (!alerts.length) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <p className="font-black">Revisión inteligente del expediente</p>
      <div className="mt-2 grid gap-2">
        {alerts.map((alert) => (
          <div key={alert.key}>
            <p className="font-bold">{alert.title}</p>
            <p>{alert.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBeneficiaryMatch(item) {
  return [item.code, item.full_name].filter(Boolean).join(' - ') || item.id || 'Expediente sin identificar';
}

function BeneficiaryProfile({ data, actions, currentUser, navigationTarget, beneficiary, deliveries, canEdit, canDelete, onEdit, onNewAppointment, onOpenAgenda, onCreateCampaign, onAddFamilyMember }) {
  const [tab, setTab] = useState('overview');
  const [emailOpen, setEmailOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [portalNoticeOpen, setPortalNoticeOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [showFullCopilot, setShowFullCopilot] = useState(false);
  const [notice, setNotice] = useState('');
  const quickDocumentInputRef = useRef(null);
  const documentManagementRef = useRef(null);
  data = data || {};
  beneficiary = beneficiary || {};
  const families = safeRows(data?.families);
  const beneficiaries = safeRows(data?.beneficiaries);
  const allDeliveries = safeRows(data?.deliveries);
  const profileDeliveries = safeRows(deliveries);
  const beneficiaryDocuments = safeRows(data?.beneficiary_documents);
  const socialHistory = safeRows(data?.social_history);
  const portalProfileUpdates = safeRows(data?.beneficiary_portal_profile_updates);
  const portalPortalNotices = safeRows(data?.beneficiary_portal_notices);
  const emailLogRows = safeRows(data?.email_logs);
  const portalAccounts = safeRows(data?.beneficiary_portal_accounts);
  const portalSessionRows = safeRows(data?.portal_sessions);
  const portalOtpRows = safeRows(data?.beneficiary_portal_otps);
  const family = families.find((item) => item.id === beneficiary.family_id);
  const familyArchived = isArchivedFamily(family);
  const familyMembers = family ? beneficiaries.filter((item) => item.family_id === family.id) : [];
  const documents = beneficiaryDocuments.filter((item) => item.beneficiary_id === beneficiary.id);
  const history = socialHistory.filter((item) => item.beneficiary_id === beneficiary.id);
  const portalRequests = portalProfileUpdates.filter((item) => item.beneficiary_id === beneficiary.id);
  const portalNotices = portalPortalNotices.filter((item) => item.beneficiary_id === beneficiary.id);
  const emailLogs = emailLogRows.filter((log) => beneficiary.email && String(log.recipient || '').includes(beneficiary.email));
  const incidents = history.filter((item) => normalize(item.entry_type).includes('incidencia')).length;
  const activeDeliveries = profileDeliveries.filter(isActiveDelivery);
  const trackingCount = buildTrackingDiary(history, activeDeliveries).length;
  const portalAccount = portalAccounts.find((item) => item.beneficiary_id === beneficiary.id) || null;
  const portalSessions = portalSessionRows.filter((item) => item.portal === 'beneficiary' && item.subject_id === beneficiary.id);
  const portalOtps = portalOtpRows.filter((item) => item.beneficiary_id === beneficiary.id);
  const lastPortalAccess = [
    portalAccount?.last_login_at,
    portalAccount?.last_successful_access_at,
    ...portalSessions.map((session) => session.last_seen_at || session.started_at)
  ].filter(Boolean).sort().at(-1);
  const lastPortalOtp = [
    ...portalOtps.map((otp) => otp.created_at)
  ].filter(Boolean).sort().at(-1);
  const [temporaryPortalPin, setTemporaryPortalPin] = useState('');
  const canCreateDelivery = canDo(currentUser, 'deliveries', 'create') && !familyArchived;
  const canCreateFamily = canDo(currentUser, 'families', 'create');
  const canCreateBeneficiary = canDo(currentUser, 'beneficiaries', 'create');
  const timeline = buildProfessionalTimeline({ beneficiary, deliveries: activeDeliveries, documents, history });
  const documentIssue = beneficiaryDocumentIssue(documents);
  const intelligentSummary = buildBeneficiaryIntelligentSummary({ beneficiary, documents, deliveries: activeDeliveries, history, requests: portalRequests, notices: portalNotices });
  const documentIntelligenceSummary = buildDocumentIntelligenceSummary(documents);

  useEffect(() => {
    setTemporaryPortalPin('');
  }, [beneficiary.id]);

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'beneficiaries') return;
    if (navigationTarget.profileId && navigationTarget.profileId !== beneficiary.id) return;
    if (navigationTarget.tab) {
      setTab(navigationTarget.tab);
      if (navigationTarget.tab === 'documents') scrollToDocumentManagement();
    }
    if (navigationTarget.documentId) {
      setTab('documents');
      scrollToDocumentManagement();
    }
  }, [beneficiary.id, navigationTarget]);

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: CircleUserRound },
    { id: 'personal', label: 'Datos personales', icon: ContactRound },
    { id: 'family', label: 'Familia', icon: Users, count: familyMembers.length || undefined },
    { id: 'deliveries', label: 'Entregas', icon: PackageCheck, count: profileDeliveries.length },
    { id: 'documents', label: 'Documentos', icon: Paperclip, count: documents.length },
    { id: 'emails', label: 'Comunicaciones', icon: Mail, count: emailLogs.length },
    { id: 'social', label: 'Seguimiento', icon: NotebookTabs, count: trackingCount }
  ];

  async function openWhatsApp() {
    const phone = normalizeWhatsAppPhone(beneficiary.phone);
    if (!phone) {
      setNotice('Este beneficiario no tiene un telefono valido para WhatsApp.');
      return;
    }
    setNotice('');
    setWhatsAppOpen(true);
  }

  async function sendBeneficiaryWhatsApp(message) {
    const phone = normalizeWhatsAppPhone(beneficiary.phone);
    if (!phone) {
      setNotice('Este beneficiario no tiene un telefono valido para WhatsApp.');
      return;
    }
    window.open(buildWhatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
    setNotice('WhatsApp abierto correctamente. Revisa el mensaje antes de enviarlo.');
    setWhatsAppOpen(false);
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

  function scrollToDocumentManagement() {
    window.setTimeout(() => {
      documentManagementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function openDocumentManagement() {
    setTab('documents');
    scrollToDocumentManagement();
  }

  function requestDocumentUpload() {
    openDocumentManagement();
    quickDocumentInputRef.current?.click();
  }

  async function uploadQuickDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    let uploaded = null;
    try {
      setNotice('Subiendo documento...');
      uploaded = await uploadBeneficiaryDocumentFile({ beneficiaryId: beneficiary.id, file });
      await actions.createBeneficiaryDocument({
        beneficiary_id: beneficiary.id,
        document_type: DOCUMENT_TYPES[0],
        file_name: file.name,
        file_data_url: uploaded.fileDataUrl,
        uploaded_at: todayISO(),
        notes: ''
      });
      setNotice('Documento subido correctamente.');
    } catch (error) {
      if (uploaded?.fileDataUrl) {
        await removeBeneficiaryDocumentFile(uploaded.fileDataUrl).catch((cleanupError) => console.warn('[BeneficiaryDocument] No se pudo limpiar la subida fallida', cleanupError));
      }
      setNotice(error.message || 'No se pudo subir el documento.');
    } finally {
      if (quickDocumentInputRef.current) quickDocumentInputRef.current.value = '';
    }
  }
  async function handlePhotoChange(photoDataUrl) {
    const previousPhotoUrl = beneficiary.photo_url;
    if (!photoDataUrl) {
      console.info('[BeneficiaryPhoto] Eliminando referencia de base de datos', { beneficiaryId: beneficiary.id });
      await actions.updateBeneficiary(beneficiary.id, { ...beneficiary, photo_url: null, photo_data_url: null });
      try {
        await removeBeneficiaryPhoto(previousPhotoUrl);
      } catch (cleanupError) {
        console.warn('[BeneficiaryPhoto] La referencia se elimino, pero fallo la limpieza del objeto anterior', cleanupError);
      }
      setNotice('Fotografía eliminada correctamente.');
      return { displayUrl: null };
    }

    const uploaded = await uploadBeneficiaryPhoto(beneficiary.id, photoDataUrl);
    try {
      console.info('[BeneficiaryPhoto] Guardando referencia en base de datos', { beneficiaryId: beneficiary.id, photoUrl: uploaded.photoUrl });
      await actions.updateBeneficiary(beneficiary.id, {
        ...beneficiary,
        photo_url: uploaded.photoUrl,
        photo_data_url: uploaded.photoDataUrl
      });
    } catch (databaseError) {
      await removeBeneficiaryPhoto(uploaded.photoUrl).catch((cleanupError) => console.warn('[BeneficiaryPhoto] No se pudo limpiar la subida fallida', cleanupError));
      console.error('[BeneficiaryPhoto] Error al guardar la referencia', databaseError);
      throw new Error(`La fotografía se subió, pero no se pudo guardar en el expediente: ${databaseError.message}`);
    }
    if (previousPhotoUrl && previousPhotoUrl !== uploaded.photoUrl) {
      await removeBeneficiaryPhoto(previousPhotoUrl).catch((cleanupError) => console.warn('[BeneficiaryPhoto] No se pudo limpiar la fotografia sustituida', cleanupError));
    }
    setNotice('Fotografía actualizada correctamente.');
    return uploaded;
  }

  function buildPortalAccessPayload(account = portalAccount, pin = temporaryPortalPin) {
    console.info('[beneficiary-access] Payload PDF acceso beneficiario', {
      beneficiaryId: beneficiary?.id || null,
      accountId: account?.id || null,
      hasIdentifier: Boolean(account?.access_identifier),
      hasTemporaryPin: Boolean(pin)
    });
    return {
      portalLabel: 'Portal del Beneficiario',
      name: beneficiary.full_name,
      code: beneficiary.code,
      identifier: account?.access_identifier || '',
      accessUrl: `${window.location.origin}/portal-beneficiario`,
      temporaryPin: pin,
      organization: data.organization_settings?.[0] || {}
    };
  }

  async function activatePortal() {
    const result = await actions.activateBeneficiaryPortal(beneficiary.id);
    setTemporaryPortalPin(result.temporaryPin || '');
    setNotice('Portal activado correctamente. Imprime o envia el acceso antes de entregar el PIN.');
  }

  async function deactivatePortal() {
    if (!window.confirm('Desactivar el portal de este beneficiario?')) return;
    await actions.deactivateBeneficiaryPortal(beneficiary.id);
    setTemporaryPortalPin('');
    setNotice('Portal desactivado correctamente.');
  }

  async function regeneratePortalPin() {
    try {
      console.info('[beneficiary-access] UI Regenerar PIN invocado', { beneficiaryId: beneficiary.id });
      const result = await actions.regenerateBeneficiaryPortalPin(beneficiary.id);
      setTemporaryPortalPin(result.temporaryPin || '');
      setNotice('PIN regenerado y enviado correctamente. El PIN temporal se muestra una sola vez.');
    } catch (error) {
      setNotice(error.message || 'No se pudo regenerar y enviar el PIN.');
    }
  }

  async function printPortalAccess() {
    let account = portalAccount;
    let pin = temporaryPortalPin;
    console.info('[beneficiary-access] UI Imprimir acceso invocado', {
      beneficiaryId: beneficiary.id,
      hasAccount: Boolean(account),
      hasTemporaryPin: Boolean(pin)
    });
    if (!account) {
      const result = await actions.activateBeneficiaryPortal(beneficiary.id);
      account = result.account;
      pin = result.temporaryPin || '';
      setTemporaryPortalPin(pin);
    }
    await printPortalAccessPdf(buildPortalAccessPayload(account, pin));
    setNotice('Documento de acceso generado correctamente.');
  }

  async function sendPortalAccess() {
    if (!beneficiary.email) {
      setNotice('Este beneficiario no tiene email registrado para enviar el acceso.');
      return;
    }
    try {
      console.info('[beneficiary-access] UI Enviar acceso invocado', {
        beneficiaryId: beneficiary.id,
        hasTemporaryPin: Boolean(temporaryPortalPin)
      });
      const result = await actions.sendBeneficiaryPortalAccess(beneficiary.id, { temporaryPin: temporaryPortalPin });
      setTemporaryPortalPin(result.temporaryPin || temporaryPortalPin || '');
      setNotice('Acceso enviado correctamente. El PIN temporal se muestra una sola vez.');
    } catch (error) {
      setNotice(error.message || 'No se pudo enviar el acceso. Intentalo de nuevo.');
    }
  }

  async function generateBeneficiaryCard() {
    try {
      const result = await printBeneficiaryCardPdf(beneficiary, data.organization_settings?.[0] || {});
      setNotice(result.opened
        ? 'Carné generado correctamente. Se ha abierto el PDF para visualizar, descargar o imprimir.'
        : 'Carné generado correctamente. El navegador ha descargado el PDF.');
    } catch (error) {
      console.error('[BeneficiaryCard] No se pudo generar el carné', error);
      setNotice(error.message || 'No se pudo generar el carné del beneficiario.');
    }
  }

  return (
    <div className="-m-5 bg-slate-50">
      <ProfessionalCrmHeader
        beneficiary={beneficiary}
        family={family}
        deliveries={activeDeliveries}
        history={history}
        documentIssue={documentIssue}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={onEdit}
        onSummaryPdf={() => printBeneficiaryPdf(beneficiary, profileDeliveries)}
        onSocialReport={() => printSocialAttentionReportPdf({
          beneficiary,
          family,
          familyMembers,
          deliveries: activeDeliveries,
          history,
          organization: data.organization_settings?.[0],
          currentUser
        })}
        onPhotoChange={handlePhotoChange}
      />

      {notice && <div className="mx-5 mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" role="status">{notice}</div>}

      <main className="space-y-6 p-5 sm:p-7">
        <QuickCaseActions
          canCreateDelivery={canCreateDelivery}
          canEdit={canEdit}
          onDelivery={() => setDeliveryOpen(true)}
          onContact={openWhatsApp}
          onManageDocuments={openDocumentManagement}
          onUploadDocument={requestDocumentUpload}
          onGenerateCard={generateBeneficiaryCard}
          onNote={() => setTab('social')}
          onEmail={() => { setNotice(''); setEmailOpen(true); }}
          onCreateCampaign={onCreateCampaign}
          onOpenAgenda={onOpenAgenda || onNewAppointment}
          onNotice={() => { setNotice(''); setPortalNoticeOpen(true); }}
        />
        <input ref={quickDocumentInputRef} className="hidden" type="file" onChange={uploadQuickDocument} />

        <CasePriorityPanel summary={intelligentSummary} beneficiary={beneficiary} onPrimaryAction={() => setTab('social')} />

        <SocialCaseSummaryCards
          beneficiary={beneficiary}
          family={family}
          deliveries={activeDeliveries}
          documents={documents}
          incidents={incidents}
          history={history}
          requests={portalRequests}
        />

        <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <CompactCopilotPreview summary={intelligentSummary} onShowFull={() => setShowFullCopilot((value) => !value)} expanded={showFullCopilot} />
          <ProfessionalTimeline entries={timeline} onShowAll={() => setTab('social')} />
        </section>

        {showFullCopilot && (
          <IntelligentCaseBlock
            beneficiary={beneficiary}
            documents={documents}
            deliveries={activeDeliveries}
            history={history}
            requests={portalRequests}
            notices={portalNotices}
          />
        )}

        <DocumentIntelligenceOverview summary={documentIntelligenceSummary} onShowDocuments={openDocumentManagement} />

        <section ref={documentManagementRef} className="scroll-mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <nav className="overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6" aria-label="Secciones del expediente">
            <div className="flex min-w-max gap-1">
              {tabs.map(({ id, label, icon: Icon, count }) => (
                <button key={id} className={`focus-ring flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
                  <Icon size={17} /> {label}{count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
                </button>
              ))}
            </div>
          </nav>

          <div className="bg-slate-50/70 p-5 sm:p-6">
            {tab === 'overview' && <OverviewPanel beneficiary={beneficiary} family={family} deliveries={activeDeliveries} history={history} />}
            {tab === 'personal' && <PersonalDataPanel beneficiary={beneficiary} />}
            {tab === 'family' && (
              <FamilyPanel
                beneficiary={beneficiary}
                family={family}
                members={familyMembers}
                archived={familyArchived}
                canAddMember={canCreateBeneficiary && !familyArchived}
                canCreateFamily={canCreateFamily && canEdit}
                onAddMember={family ? () => onAddFamilyMember(family.id) : undefined}
                onCreateFamily={() => setFamilyOpen(true)}
              />
            )}
            {tab === 'deliveries' && <DeliveriesPanel deliveries={profileDeliveries} beneficiary={beneficiary} allDeliveries={allDeliveries} />}
            {tab === 'documents' && <DocumentsPanel documents={documents} beneficiary={beneficiary} actions={actions} canEdit={canEdit} canDelete={canDelete} initialDocumentId={navigationTarget?.documentId || ''} onNotice={setNotice} />}
            {tab === 'emails' && <EmailsPanel emailLogs={emailLogs} />}
            {tab === 'social' && <SocialHistory history={history} deliveries={activeDeliveries} beneficiary={beneficiary} actions={actions} currentUser={currentUser} canEdit={canEdit} />}
          </div>
        </section>

        <BeneficiaryPortalAdminBlock
          account={portalAccount}
          lastAccess={lastPortalAccess}
          lastOtp={lastPortalOtp}
          temporaryPin={temporaryPortalPin}
          canEdit={canEdit}
          onActivate={activatePortal}
          onDeactivate={deactivatePortal}
          onRegeneratePin={regeneratePortalPin}
          onPrint={printPortalAccess}
          onSend={sendPortalAccess}
        />
      </main>

      {emailOpen && (
        <Modal title="Enviar email al beneficiario" onClose={() => setEmailOpen(false)}>
          <BeneficiaryEmailForm
            beneficiary={beneficiary}
            deliveries={profileDeliveries}
            organization={data.organization_settings?.[0]}
            actions={actions}
            currentUser={currentUser}
            onSent={(message) => { setNotice(message); setEmailOpen(false); }}
          />
        </Modal>
      )}
      {whatsAppOpen && (
        <Modal title="Enviar WhatsApp al beneficiario" onClose={() => setWhatsAppOpen(false)}>
          <BeneficiaryWhatsAppForm beneficiary={beneficiary} onSend={sendBeneficiaryWhatsApp} onCancel={() => setWhatsAppOpen(false)} />
        </Modal>
      )}
      {portalNoticeOpen && (
        <Modal title="Enviar aviso al portal" onClose={() => setPortalNoticeOpen(false)}>
          <BeneficiaryPortalNoticeForm
            beneficiary={beneficiary}
            actions={actions}
            onSent={(message) => { setNotice(message); setPortalNoticeOpen(false); }}
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
              const createdFamily = await actions.createFamily(payload);
              await actions.updateBeneficiary(beneficiary.id, { ...beneficiary, family_id: createdFamily?.id || payload.id, family_relationship: beneficiary.family_relationship || 'Responsable' });
              setFamilyOpen(false);
              setNotice('Unidad familiar creada y vinculada correctamente.');
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ProfessionalCrmHeader({ beneficiary, family, deliveries, history, documentIssue, canEdit, canDelete, onEdit, onSummaryPdf, onSocialReport, onPhotoChange }) {
  const latestDelivery = getLatestDelivery(deliveries);
  const priority = socialPriorityLabel(beneficiary, history);
  const nextReview = nextReviewLabel(beneficiary, latestDelivery, history);
  const responsible = assignedResponsibleLabel(beneficiary, family);

  return (
    <header className="relative overflow-hidden border-b border-slate-200 bg-white">
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-600" />
      <div className="relative px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-4 pt-10 sm:flex-row sm:items-end">
            <BeneficiaryPhoto beneficiary={beneficiary} canEdit={canEdit} canDelete={canDelete} onChange={onPhotoChange} />
            <div className="min-w-0 flex-1 rounded-2xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge active={beneficiary.is_active} />
                <SocialSituationBadge value={beneficiary.situation} />
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${priorityBadgeTone(priority)}`}>Prioridad {priority}</span>
                {documentIssue && <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${documentIssue.tone}`}>{documentIssue.label}</span>}
              </div>
              <h2 className="mt-2 break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">{beneficiary.full_name}</h2>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                <span className="font-mono font-bold text-brand-700">{beneficiary.code}</span>
                <span>{beneficiary.document_id || 'Sin documento'}</span>
                <span>{family ? `${family.family_code} · ${family.responsible_name}` : 'Sin unidad familiar'}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:w-[430px]">
            <HeaderMetric icon={Clock3} label="Ultima ayuda recibida" value={latestDelivery ? formatDate(latestDelivery.delivered_at) : 'Sin entregas'} />
            <HeaderMetric icon={CalendarDays} label="Proxima revision" value={nextReview} />
            <HeaderMetric icon={UserRound} label="Responsable asignado" value={responsible} />
            <HeaderMetric icon={HeartHandshake} label="Frecuencia de ayuda" value={helpFrequencyLabel(deliveries)} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3 lg:min-w-[560px]">
            <MetaLine icon={CalendarDays} text={`Alta: ${formatDate(beneficiary.joined_at)}`} />
            <MetaLine icon={Phone} text={beneficiary.phone || 'Telefono no registrado'} />
            <MetaLine icon={MapPin} text={beneficiary.address_full || 'Direccion no registrada'} />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={17} /> Editar</Button>}
            <Button variant="secondary" onClick={onSummaryPdf}><Printer size={17} /> Resumen PDF</Button>
            <Button variant="secondary" onClick={onSocialReport}><Download size={17} /> Informe social</Button>
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderMetric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-start gap-2">
        <span className="rounded-lg bg-white p-2 text-brand-700 shadow-sm"><Icon size={17} /></span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-bold text-ink">{value || '-'}</p>
        </div>
      </div>
    </div>
  );
}

function CasePriorityPanel({ summary, beneficiary, onPrimaryAction }) {
  const mainRisk = summary.risks[0];
  const recommendedAction = summary.recommendations[0];
  return (
    <section className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm" aria-label="Prioridad del expediente">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)] lg:items-stretch">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-brand-700">Prioridad del expediente</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${summary.status.tone}`}>{summary.status.icon} {summary.status.label}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{beneficiary.is_active ? 'Expediente activo' : 'Expediente inactivo'}</span>
          </div>
          <h3 className="mt-3 text-xl font-black leading-tight text-ink">{mainRisk?.motive || 'No hay riesgos objetivos destacados.'}</h3>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
            {recommendedAction?.reason || 'El expediente no requiere una intervencion inmediata con los datos disponibles.'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Accion recomendada</p>
          <p className="mt-2 text-base font-black text-ink">{recommendedAction?.title || 'Mantener seguimiento ordinario'}</p>
          <button type="button" onClick={onPrimaryAction} className="focus-ring mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-brand-700">
            {recommendedAction?.button || 'Abrir seguimiento'}
          </button>
        </div>
      </div>
    </section>
  );
}

function QuickCaseActions({ canCreateDelivery, canEdit, onDelivery, onContact, onManageDocuments, onUploadDocument, onGenerateCard, onNote, onEmail, onCreateCampaign, onOpenAgenda, onNotice }) {
  const [showMore, setShowMore] = useState(false);
  const primaryActions = [
    { label: 'Nueva entrega', icon: PackagePlus, onClick: onDelivery, enabled: canCreateDelivery, primary: true },
    { label: 'Gestionar documentacion', icon: Paperclip, onClick: onManageDocuments, enabled: Boolean(onManageDocuments) },
    { label: 'Contactar', icon: MessageCircle, onClick: onContact, enabled: Boolean(onContact) },
    { label: 'Generar carné', icon: IdCard, onClick: onGenerateCard, enabled: Boolean(onGenerateCard) }
  ];
  const secondaryActions = [
    { label: 'Nueva nota', icon: NotebookTabs, onClick: onNote, enabled: canEdit },
    { label: 'Subir documento', icon: Upload, onClick: onUploadDocument, enabled: canEdit },
    { label: 'Email', icon: Mail, onClick: onEmail, enabled: Boolean(onEmail) },
    { label: 'Crear campaña', icon: CalendarPlus, onClick: onCreateCampaign, enabled: Boolean(onCreateCampaign) },
    { label: 'Abrir Agenda', icon: CalendarDays, onClick: onOpenAgenda, enabled: Boolean(onOpenAgenda) },
    { label: 'Enviar aviso', icon: Mail, onClick: onNotice, enabled: true }
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Acciones rapidas del expediente">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-bold text-ink">Acciones rapidas</h3>
          <p className="text-sm text-slate-500">Una accion principal y accesos frecuentes del expediente.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end">
          {primaryActions.map(({ label, icon: Icon, onClick, enabled, primary }) => (
            <Button key={label} variant={primary ? 'primary' : 'secondary'} onClick={onClick} disabled={!enabled}>
              <Icon size={17} /> {label}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => setShowMore((value) => !value)}>
            <ChevronRight size={17} /> Mas acciones
          </Button>
        </div>
      </div>
      {showMore && (
        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
          {secondaryActions.map(({ label, icon: Icon, onClick, enabled }) => (
            <Button key={label} variant="secondary" onClick={onClick} disabled={!enabled}>
              <Icon size={17} /> {label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

function BeneficiaryPortalAdminBlock({ account, lastAccess, lastOtp, temporaryPin, canEdit, onActivate, onDeactivate, onRegeneratePin, onPrint, onSend }) {
  const active = account?.status === 'active';
  const pending = !account || !account.pin_hash;
  const pinLabel = getPortalPinLabel(account, temporaryPin);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Portal del Beneficiario">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">PORTAL DEL BENEFICIARIO</p>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
              {active ? 'Activo' : pending ? 'Portal pendiente de activar' : 'Inactivo'}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Gestion de credenciales privadas y acceso seguro al portal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && !active && <Button variant="secondary" onClick={onActivate}><Power size={17} /> Activar portal</Button>}
          {canEdit && active && <Button variant="secondary" onClick={onDeactivate}><PowerOff size={17} /> Desactivar portal</Button>}
          {canEdit && <Button variant="secondary" onClick={onRegeneratePin}><KeyRound size={17} /> Regenerar PIN</Button>}
          <Button variant="secondary" onClick={onPrint}><Printer size={17} /> Imprimir acceso</Button>
          {canEdit && <Button variant="secondary" onClick={onSend}><Mail size={17} /> Enviar acceso</Button>}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <PortalField label="Estado" value={active ? 'Activo' : pending ? 'Pendiente' : account?.status || 'Inactivo'} />
        <PortalField label="Identificador privado" value={account?.access_identifier || 'Pendiente'} mono />
        <PortalField label="PIN" value={pinLabel} />
        <PortalField label="Ultimo acceso" value={lastAccess ? formatDateTime(lastAccess) : '-'} />
        <PortalField label="Ultimo OTP" value={lastOtp ? formatDateTime(lastOtp) : '-'} />
      </div>

      {temporaryPin && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          PIN temporal: <span className="font-mono text-base font-bold">{temporaryPin}</span>. Solo se muestra ahora para imprimirlo o enviarlo por correo.
        </div>
      )}
    </section>
  );
}

function getPortalPinLabel(account, temporaryPin) {
  if (temporaryPin) return temporaryPin;
  if (!account?.pin_hash) return 'Pendiente';
  if (account.pin_changed_at || account.must_change_pin === false) return 'No se muestra porque ya fue cambiado.';
  return 'PIN temporal pendiente de cambio.';
}

function PortalField({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm font-bold text-ink ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
    </div>
  );
}

function SocialCaseSummaryCards({ beneficiary, family, deliveries, documents, incidents, history, requests = [] }) {
  const latestDelivery = getLatestDelivery(deliveries);
  const nextDelivery = getNextFutureDelivery(deliveries);
  const documentIssue = beneficiaryDocumentIssue(documents);
  const openRequests = requests.filter(isOpenPortalRequest).length;
  const priority = socialPriorityLabel(beneficiary, history);
  const summary = [
    { label: 'Prioridad', value: priority, detail: incidents ? `${incidents} incidencia(s)` : 'Sin incidencias abiertas', icon: ClipboardList, tone: priority === 'Alta' ? 'red' : priority === 'Media' ? 'amber' : 'brand' },
    { label: 'Proxima entrega', value: nextDelivery ? deliverySummaryLabel(nextDelivery) : 'Sin entrega programada', detail: latestDelivery ? `Ultima: ${formatDate(latestDelivery.delivered_at)}` : 'Sin entregas anteriores', icon: CalendarDays, tone: 'blue' },
    { label: 'Documentacion', value: documentIssue?.label || `${documents.length} documento(s)`, detail: documentIssue ? 'Requiere revision' : 'Sin alertas criticas', icon: Paperclip, tone: documentIssue?.tone?.includes('red') ? 'red' : documentIssue ? 'amber' : 'brand' },
    { label: 'Unidad familiar', value: family ? family.family_code : 'Sin unidad', detail: family?.responsible_name || `${beneficiary.family_members || 1} miembro(s)`, icon: Users, tone: 'brand' },
    { label: 'Solicitudes', value: openRequests || 'Sin abiertas', detail: openRequests ? 'Pendientes de seguimiento' : 'Portal sin solicitudes abiertas', icon: NotebookTabs, tone: openRequests ? 'amber' : 'slate' },
    { label: 'Contacto', value: beneficiary.phone || beneficiary.email || 'Sin contacto', detail: beneficiary.address_full || 'Direccion no registrada', icon: Phone, tone: beneficiary.phone || beneficiary.email ? 'slate' : 'red' }
  ];
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700'
  };
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen social del expediente">
      {summary.map(({ label, value, detail, icon: Icon, tone }) => (
        <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className={`inline-flex rounded-xl p-2 ${tones[tone] || tones.slate}`}><Icon size={18} /></span>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 break-words text-lg font-bold text-ink">{value === 0 ? 0 : value || '-'}</p>
          {detail && <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>}
        </article>
      ))}
    </section>
  );
}

function ProfessionalTimeline({ entries, onShowAll }) {
  const previewEntries = entries.slice(0, 3);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeading icon={CalendarDays} title="Cronologia resumida" description="Ultimos tres eventos operativos del expediente." />
        <Button variant="secondary" onClick={onShowAll}>Ver cronologia completa</Button>
      </div>
      <div className="relative mt-5 space-y-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-slate-200">
        {previewEntries.map((item) => (
          <article key={item.key} className="relative flex gap-4">
            <span className={`z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${item.tone}`}><item.icon size={17} /></span>
            <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-bold text-ink">{item.title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                </div>
                <time className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{formatDate(item.date)}</time>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!entries.length && <div className="mt-4"><EmptyState icon={CalendarDays} title="Sin cronologia" text="Todavia no hay eventos relevantes en el expediente." /></div>}
    </section>
  );
}

function CompactCopilotPreview({ summary, onShowFull, expanded }) {
  const mainRisk = summary.risks[0];
  const recommendedAction = summary.recommendations[0];
  return (
    <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-white via-brand-50/60 to-white p-5 shadow-sm" aria-label="Copiloto compacto del expediente">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-brand-700">Copiloto</p>
            <h3 className="mt-1 text-xl font-black text-ink">Copiloto del expediente</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">Lectura ejecutiva basada en datos reales del ERP.</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black ${summary.status.tone}`}>{summary.status.icon} {summary.status.label}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Estado general</p>
            <p className="mt-1 text-sm font-black text-ink">{summary.status.label}</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{summary.status.label === 'Expediente estable' ? 'Sin alertas criticas con los datos actuales.' : 'Requiere seguimiento segun reglas del ERP.'}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Riesgo principal</p>
            <p className="mt-1 line-clamp-2 text-sm font-black text-ink">{mainRisk?.motive || 'Sin riesgos destacados'}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{mainRisk?.level || 'Bajo'}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Accion recomendada</p>
            <p className="mt-1 line-clamp-2 text-sm font-black text-ink">{recommendedAction?.title || 'Mantener seguimiento ordinario'}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{recommendedAction?.impact || 'Continuidad del acompanamiento.'}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="line-clamp-1 text-sm font-bold text-slate-600">{summary.focusItems[0] || 'Hoy no hay tareas criticas pendientes.'}</p>
          <Button variant="secondary" onClick={onShowFull}>{expanded ? 'Ocultar analisis completo' : 'Ver analisis completo'}</Button>
        </div>
      </div>
    </section>
  );
}

function IntelligentCaseBlock({ beneficiary, documents, deliveries, history, requests = [], notices = [] }) {
  const [activePanel, setActivePanel] = useState('summary');
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showQuestionBox, setShowQuestionBox] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [previewAction, setPreviewAction] = useState(null);
  const summary = buildBeneficiaryIntelligentSummary({ beneficiary, documents, deliveries, history, requests, notices });
  const mainRisk = summary.risks[0];
  const recommendedAction = summary.recommendations[0] || null;
  const statusExplanation = summary.status.label === 'Expediente estable'
    ? 'Sin alertas críticas con los datos actuales del expediente.'
    : 'Revisión sugerida según los datos reales disponibles.';
  const assistantPanels = [
    { id: 'summary', label: 'Resumen' },
    { id: 'risks', label: 'Riesgos' },
    { id: 'recommendations', label: 'Recomendaciones' },
    { id: 'sources', label: 'Fuentes' },
    { id: 'chronology', label: 'Cronología' },
    { id: 'nextSteps', label: 'Próximos pasos' }
  ];
  const primaryActions = [
    { label: 'Resumen', action: () => setActivePanel('summary') },
    { label: 'Riesgos', action: () => setActivePanel('risks') },
    { label: 'WhatsApp', action: () => setPreviewAction(buildAssistantPreview('whatsapp', beneficiary, summary)) },
    { label: 'Seguimiento', action: () => setPreviewAction(buildAssistantPreview('tracking', beneficiary, summary)) }
  ];
  const secondaryActions = [
    { label: 'Preparar Email', action: () => setPreviewAction(buildAssistantPreview('email', beneficiary, summary)) },
    { label: 'Generar borrador de informe social', action: () => setPreviewAction(buildAssistantPreview('report', beneficiary, summary)) },
    { label: 'Próximos pasos', action: () => setActivePanel('nextSteps') },
    { label: 'Fuentes utilizadas', action: () => setActivePanel('sources') },
    { label: 'Cronología', action: () => setActivePanel('chronology') },
    { label: 'Preguntar', action: () => setShowQuestionBox((value) => !value) }
  ];

  function submitQuestion(event) {
    event.preventDefault();
    setAssistantAnswer(buildAssistantAnswer(assistantQuestion, summary));
  }

  function runRecommendedAction() {
    if (!recommendedAction) {
      setActivePanel('nextSteps');
      return;
    }
    setPreviewAction(buildAssistantPreview(recommendedAction.previewType || 'tracking', beneficiary, summary, recommendedAction));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm" aria-label="Copiloto Althemon">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-3 p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_0.7fr]">
            <article className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-emerald-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white shadow-sm"><NotebookTabs size={19} /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-wide text-brand-700">Copiloto</p>
                    <h3 className="mt-0.5 truncate text-lg font-black text-ink">Copiloto del Expediente</h3>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black ${summary.status.tone}`}>{summary.status.icon} {summary.status.label}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Hoy debes revisar</p>
                  <p className="mt-1 line-clamp-2 text-base font-black leading-snug text-ink">{summary.focusItems[0] || 'Seguimiento ordinario del expediente'}</p>
                </div>
                <button type="button" onClick={runRecommendedAction} className="focus-ring rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-brand-700">
                  {recommendedAction?.button || 'Crear seguimiento'}
                </button>
              </div>
            </article>

            <article className={`rounded-2xl border p-4 shadow-sm ${mainRisk ? mainRisk.cardTone : 'border-brand-100 bg-white'}`}>
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">Riesgo principal</p>
              {mainRisk ? (
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-ink">{mainRisk.levelIcon} {mainRisk.level}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-700">{mainRisk.motive}</p>
                  </div>
                  <button type="button" onClick={() => setActivePanel('risks')} className="focus-ring shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-100 transition hover:bg-slate-50">Ver riesgos</button>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-brand-800">Sin riesgos destacados</p>
                  <button type="button" onClick={() => setActivePanel('risks')} className="focus-ring rounded-xl bg-brand-50 px-3 py-2 text-xs font-black text-brand-700">Ver riesgos</button>
                </div>
              )}
            </article>
          </div>

          <article className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-brand-700">Resumen</p>
                <p className="mt-1 line-clamp-2 text-sm font-bold leading-6 text-ink">{summary.narrative}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {summary.highlights.slice(0, 2).map((item) => (
                  <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-brand-700 ring-1 ring-brand-100">{item}</span>
                ))}
              </div>
            </div>
          </article>

          <AssistantDocumentationBlock insights={summary.documentInsights} onOpenRecommendations={() => setActivePanel('recommendations')} />

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.48fr)]">
            <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Vista detallada</p>
                <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Secciones del copiloto">
                  {assistantPanels.map((panel) => {
                    const active = activePanel === panel.id;
                    return (
                      <button
                        key={panel.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActivePanel(panel.id)}
                        className={`focus-ring shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                          active
                            ? 'bg-brand-700 text-white shadow-sm'
                            : 'bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-800'
                        }`}
                      >
                        {panel.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 max-h-[280px] overflow-auto pr-1">
                {activePanel === 'summary' && <AssistantSummaryPanel summary={summary} />}
                {activePanel === 'risks' && <AssistantRisksPanel summary={summary} />}
                {activePanel === 'recommendations' && <AssistantRecommendationsPanel summary={summary} onPreview={setPreviewAction} beneficiary={beneficiary} />}
                {activePanel === 'sources' && <AssistantSourcesPanel summary={summary} />}
                {activePanel === 'chronology' && <AssistantChronologyPanel entries={summary.chronology} />}
                {activePanel === 'nextSteps' && <AssistantNextStepsPanel steps={summary.nextSteps} />}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Acciones rápidas</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {primaryActions.map((item) => (
                    <button key={item.label} type="button" onClick={item.action} className="focus-ring min-h-[48px] rounded-xl border border-slate-100 bg-white px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800">
                      {item.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowMoreActions((value) => !value)} className="focus-ring mt-2 w-full rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-brand-50 hover:text-brand-800">
                  Más acciones
                </button>
                {showMoreActions && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {secondaryActions.map((item) => (
                      <button key={item.label} type="button" onClick={item.action} className="focus-ring rounded-full bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-100 transition hover:bg-brand-50 hover:text-brand-800">
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <AssistantMemoryPanel memory={summary.memory} />
            </div>
          </div>
        </div>

        <aside className="border-t border-brand-100 bg-slate-950 p-3 text-white xl:self-start xl:border-l xl:border-t-0">
          <div className="sticky top-4 space-y-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-sm backdrop-blur">
              <p className="text-[11px] font-black uppercase tracking-wide text-emerald-200">Estado general</p>
              <p className="mt-1.5 text-lg font-black">{summary.status.icon} {summary.status.label}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-white/70">{statusExplanation}</p>
              <div className="mt-2 h-px bg-white/10" />
              <p className="mt-2 text-[11px] font-black uppercase tracking-wide text-emerald-200">Acción recomendada</p>
              <p className="mt-1 text-sm font-bold text-white/85">{recommendedAction?.title || 'Mantener seguimiento ordinario'}</p>
              <button type="button" onClick={runRecommendedAction} className="focus-ring mt-2.5 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-brand-700">
                {recommendedAction?.button || 'Crear seguimiento'}
              </button>
            </div>

            {showQuestionBox && (
              <form onSubmit={submitQuestion} className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-sm">
                <label className="text-xs font-black uppercase tracking-wide text-emerald-200" htmlFor={`assistant-question-${beneficiary.id}`}>Pregunta al asistente</label>
                <textarea
                  id={`assistant-question-${beneficiary.id}`}
                  className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white p-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  value={assistantQuestion}
                  onChange={(event) => setAssistantQuestion(event.target.value)}
                  placeholder="Ejemplo: qué debería revisar hoy"
                />
                <div className="mt-3 flex justify-end">
                  <Button type="submit" variant="secondary">Responder</Button>
                </div>
                {assistantAnswer && (
                  <div className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold text-slate-700">
                    <p>{assistantAnswer}</p>
                    <VerifiedSources sources={summary.verifiedSources} compact />
                  </div>
                )}
              </form>
            )}

            {previewAction && (
              <AssistantPreviewCard preview={previewAction} onChange={setPreviewAction} onCancel={() => setPreviewAction(null)} sources={summary.verifiedSources} />
            )}

            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-bold leading-relaxed text-white/75">
              El Copiloto nunca toma decisiones automáticamente. Solo resume, organiza y recomienda utilizando datos reales del ERP.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AssistantDocumentationBlock({ insights, onOpenRecommendations }) {
  const items = safeRows(insights?.items).slice(0, 3);
  const hasItems = items.length > 0;
  return (
    <article className={`rounded-2xl border p-3 shadow-sm ${hasItems ? 'border-amber-100 bg-amber-50/80' : 'border-brand-100 bg-brand-50/70'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-brand-700">Documentacion</p>
          <h4 className="mt-1 text-sm font-black text-ink">{insights?.headline || 'Sin incidencias documentales destacadas.'}</h4>
          <div className="mt-2 grid gap-1.5">
            {items.map((item) => (
              <p key={item.key} className="line-clamp-1 text-xs font-bold text-slate-700">• {item.text}</p>
            ))}
            {!items.length && <p className="text-xs font-bold text-slate-600">No hay documentos caducados, rechazados o con renovacion pendiente.</p>}
          </div>
        </div>
        <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-slate-100 lg:min-w-52">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Accion recomendada</p>
          <p className="mt-1 text-xs font-black text-ink">{insights?.action || 'Mantener revision ordinaria'}</p>
          {hasItems && (
            <button type="button" onClick={onOpenRecommendations} className="focus-ring mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-brand-700">
              Ver recomendaciones
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function AssistantSummaryPanel({ summary }) {
  return (
    <div className="space-y-3">
      <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-brand-700">Resumen redactado</p>
        <p className="mt-2 line-clamp-3 text-sm font-bold leading-6 text-ink">{summary.narrative}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.highlights.map((item) => (
            <span key={item} className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-black text-brand-700">{item}</span>
          ))}
        </div>
      </article>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {summary.items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-1 text-sm font-bold text-ink">{item.value}</p>
          </div>
        ))}
      </div>
      <VerifiedSources sources={summary.verifiedSources} />
    </div>
  );
}

function AssistantRisksPanel({ summary }) {
  return (
    <div className="space-y-3">
      {summary.risks.map((risk) => (
        <article key={`${risk.level}-${risk.motive}`} className={`rounded-3xl border p-4 shadow-sm ${risk.cardTone}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide">{risk.levelIcon} {risk.level}</p>
              <h4 className="mt-1 text-base font-black text-ink">{risk.motive}</h4>
              <p className="mt-2 text-sm font-semibold text-slate-700">Dato que lo justifica: {risk.evidence}</p>
            </div>
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-slate-700">{risk.action}</span>
          </div>
        </article>
      ))}
      {!summary.risks.length && (
        <div className="rounded-3xl border border-brand-100 bg-white p-5 text-sm font-bold text-brand-700 shadow-sm">No hay riesgos objetivos destacados con los datos actuales.</div>
      )}
      <VerifiedSources sources={summary.verifiedSources} />
    </div>
  );
}

function AssistantRecommendationsPanel({ summary, beneficiary, onPreview }) {
  return (
    <div className="space-y-3">
      {summary.recommendations.map((recommendation) => (
        <article key={recommendation.title} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-brand-700">Recomendación basada en reglas del ERP.</p>
              <h4 className="mt-1 text-base font-black text-ink">{recommendation.title}</h4>
              <p className="mt-2 text-sm font-semibold text-slate-600">Impacto: {recommendation.impact}</p>
              <p className="mt-1 text-sm text-slate-600">Motivo: {recommendation.reason}</p>
            </div>
            <Button variant="secondary" onClick={() => onPreview(buildAssistantPreview(recommendation.previewType || 'tracking', beneficiary, summary, recommendation))}>{recommendation.button}</Button>
          </div>
        </article>
      ))}
      <VerifiedSources sources={summary.verifiedSources} />
    </div>
  );
}

function AssistantSourcesPanel({ summary }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {summary.sources.map((source) => (
        <article key={source.name} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{source.name}</p>
          <h4 className="mt-1 text-sm font-black text-ink">{source.lastUsed}</h4>
          <p className="mt-2 text-sm text-slate-600">{source.detail}</p>
        </article>
      ))}
    </div>
  );
}

function AssistantChronologyPanel({ entries }) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article key={entry.key} className="flex gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg ${entry.tone}`}>{entry.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{entry.date ? formatDateTime(entry.date) : 'Sin fecha registrada'}</p>
            <h4 className="mt-1 font-black text-ink">{entry.title}</h4>
            <p className="mt-1 text-sm font-semibold text-slate-600">{entry.detail}</p>
          </div>
        </article>
      ))}
      {!entries.length && <div className="rounded-3xl border border-slate-100 bg-white p-5 text-sm font-bold text-slate-600 shadow-sm">No hay eventos cronológicos suficientes para mostrar.</div>}
    </div>
  );
}

function AssistantNextStepsPanel({ steps }) {
  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <article key={step.title} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-5 w-5 shrink-0 rounded-md border-2 ${step.priorityTone}`} aria-hidden="true" />
            <div>
              <h4 className="font-black text-ink">{step.title}</h4>
              <p className="mt-1 text-sm font-semibold text-slate-600">{step.reason}</p>
              <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">No modifica datos automáticamente.</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function AssistantMemoryPanel({ memory }) {
  const items = safeRows(memory).slice(0, 2);
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm" aria-label="Memoria del caso">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-brand-700">Memoria del caso</p>
          <h4 className="mt-0.5 text-sm font-black text-ink">Seguimiento compacto</h4>
        </div>
      </div>
      <div className="mt-3 space-y-2 border-l-2 border-brand-100 pl-3">
        {items.map((item) => (
          <article key={item.key} className="relative">
            <span className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.when}</p>
            <p className="mt-0.5 line-clamp-1 text-sm font-bold text-ink">{item.recommendation}</p>
            <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-600">{item.result}</p>
          </article>
        ))}
        {!items.length && (
          <article className="relative rounded-xl border border-dashed border-brand-200 bg-brand-50/70 p-3">
            <span className="absolute -left-[17px] top-4 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
            <p className="text-[11px] font-black uppercase tracking-wide text-brand-700">Hoy</p>
            <p className="mt-1 text-sm font-black text-ink">Sin memoria registrada todavía.</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Cuando el equipo confirme una recomendación, aparecerá aquí con fecha y resultado.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function AssistantPreviewCard({ preview, onChange, onCancel, sources }) {
  return (
    <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-amber-700">{preview.label}</p>
      <h4 className="mt-1 font-black text-ink">{preview.title}</h4>
      <textarea
        className="mt-3 min-h-36 w-full rounded-2xl border border-amber-100 bg-white p-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
        value={preview.body}
        onChange={(event) => onChange({ ...preview, body: event.target.value })}
      />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="secondary" onClick={() => onChange({ ...preview, editable: true })}>Editar</Button>
        <Button variant="secondary" onClick={() => onChange({ ...preview, sent: true })}>Enviar</Button>
      </div>
      {preview.sent && <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-amber-800">Borrador preparado. Revisa y confirma desde el canal correspondiente antes de enviarlo.</p>}
      <VerifiedSources sources={sources} compact />
    </div>
  );
}

function VerifiedSources({ sources, compact = false }) {
  return (
    <div className={`${compact ? 'mt-3' : 'mt-4'} rounded-2xl bg-white/80 p-3`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Fuentes verificadas:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sources.map((source) => (
          <span key={source} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-700">✓ {source}</span>
        ))}
      </div>
    </div>
  );
}

function buildBeneficiaryIntelligentSummary({ beneficiary, documents = [], deliveries = [], history = [], requests = [], notices = [] }) {
  beneficiary = beneficiary || {};
  documents = safeRows(documents);
  deliveries = safeRows(deliveries);
  history = safeRows(history);
  requests = safeRows(requests);
  notices = safeRows(notices);
  const latestDelivery = getLatestPastDelivery(deliveries);
  const nextDelivery = getNextFutureDelivery(deliveries);
  const documentSummary = summarizeDocuments(documents);
  const documentInsights = buildAssistantDocumentInsights(documents);
  const attendanceSummary = summarizeAttendance(deliveries);
  const openRequests = requests.filter(isOpenPortalRequest);
  const lastInteraction = getLastInteraction({ deliveries, documents, history, requests });
  const observations = getRelevantObservations({ beneficiary, history, deliveries, requests });
  const risks = detectBeneficiaryObjectiveRisks({ beneficiary, documents, deliveries, requests, latestDelivery, nextDelivery });
  const recommendations = buildAssistantRecommendations({ beneficiary, documents, deliveries, requests, risks, nextDelivery });
  const nextSteps = buildAssistantNextSteps({ documents, deliveries, requests, nextDelivery, recommendations });
  const sources = buildAssistantSources({ beneficiary, documents, deliveries, history, requests, notices, latestDelivery, nextDelivery, lastInteraction, observations });
  const chronology = buildAssistantChronology({ beneficiary, deliveries, documents, history, requests, notices });
  const status = buildAssistantStatus(risks);
  const memory = buildAssistantMemory({ history, documents, requests });
  const verifiedSources = ['Expediente', 'Entregas', 'Documentacion', 'Solicitudes', 'Observaciones'];
  const narrative = buildAssistantNarrative({ beneficiary, latestDelivery, nextDelivery, documentSummary, openRequests, observations, status });
  const focusItems = buildAssistantFocusItems({ risks, recommendations, nextSteps });

  return {
    narrative,
    highlights: [
      beneficiary.is_active ? 'Expediente activo' : 'Expediente inactivo',
      nextDelivery ? 'Próxima entrega programada' : 'Sin entrega futura',
      openRequests.length ? 'Solicitud abierta' : 'Sin solicitudes abiertas'
    ],
    items: [
      { label: 'Antigüedad en la asociación', value: associationAgeLabel(beneficiary.joined_at || beneficiary.first_attention_at) },
      { label: 'Ultima entrega', value: latestDelivery ? deliverySummaryLabel(latestDelivery) : 'Sin entregas anteriores registradas.' },
      { label: 'Proxima entrega', value: nextDelivery ? deliverySummaryLabel(nextDelivery) : 'Sin entrega futura programada.' },
      { label: 'Estado documental', value: documentSummary },
      { label: 'Estado de asistencia', value: attendanceSummary },
      { label: 'Solicitudes abiertas', value: openRequests.length ? `${openRequests.length} solicitud(es) pendientes o en gestion.` : 'Sin solicitudes abiertas.' },
      { label: 'Ultima interaccion', value: lastInteraction },
      { label: 'Observaciones relevantes', value: observations }
    ],
    risks,
    recommendations,
    sources,
    chronology,
    nextSteps,
    memory,
    status,
    documentInsights,
    focusItems,
    verifiedSources
  };
}

function buildAssistantStatus(risks = []) {
  if (risks.some((risk) => risk.level === 'Alto')) {
    return { icon: '🔴', label: 'Atención prioritaria', tone: 'border-red-100 bg-red-50 text-red-700' };
  }
  if (risks.some((risk) => risk.level === 'Medio')) {
    return { icon: '🟡', label: 'Requiere seguimiento', tone: 'border-amber-100 bg-amber-50 text-amber-700' };
  }
  return { icon: '🟢', label: 'Expediente estable', tone: 'border-brand-100 bg-brand-50 text-brand-700' };
}

function buildAssistantNarrative({ beneficiary, latestDelivery, nextDelivery, documentSummary, openRequests, observations, status }) {
  const joined = associationAgeLabel(beneficiary.joined_at || beneficiary.first_attention_at).replace(/\.$/, '');
  const activeLabel = beneficiary.is_active ? 'Beneficiario activo' : 'Beneficiario inactivo';
  const nextLabel = nextDelivery ? `Tiene una entrega programada: ${deliverySummaryLabel(nextDelivery)}.` : 'No tiene una entrega futura programada.';
  const latestLabel = latestDelivery ? `La última ayuda registrada fue ${deliverySummaryLabel(latestDelivery)}.` : 'No constan entregas anteriores registradas.';
  const requestLabel = openRequests.length ? `Mantiene ${openRequests.length} solicitud(es) pendiente(s) de seguimiento.` : 'No mantiene solicitudes abiertas en el portal.';
  return `${activeLabel}; ${joined}. ${latestLabel} ${nextLabel} Estado documental: ${documentSummary}. ${requestLabel} Estado general calculado: ${status.label}. Observaciones relevantes: ${observations}`;
}

function buildAssistantDocumentInsights(documents = []) {
  const items = safeRows(documents)
    .map((doc) => {
      const status = intelligentDocumentStatus(doc);
      const days = daysUntilDocumentExpiry(doc);
      return { doc, status, days };
    })
    .filter((item) => ['Caducado', 'Rechazado', 'Renovación solicitada', 'Próximo a caducar', 'Pendiente de revisión'].includes(item.status));

  const recommendations = items.map((item) => {
    const name = documentDisplayName(item.doc);
    if (item.status === 'Próximo a caducar') {
      return {
        key: `doc-expiring-${item.doc.id}`,
        text: `${name} caduca${Number.isFinite(item.days) ? ` en ${item.days} días` : ' pronto'}.`,
        action: 'Solicitar renovación.'
      };
    }
    if (item.status === 'Caducado') {
      return {
        key: `doc-expired-${item.doc.id}`,
        text: `${name} está caducado.`,
        action: 'Solicitar renovación.'
      };
    }
    if (item.status === 'Rechazado') {
      return {
        key: `doc-rejected-${item.doc.id}`,
        text: `${name} fue rechazado.`,
        action: 'Revisar observaciones y solicitar nueva versión.'
      };
    }
    if (item.status === 'Renovación solicitada') {
      return {
        key: `doc-renewal-${item.doc.id}`,
        text: `${name} tiene una renovación solicitada pendiente.`,
        action: 'Hacer seguimiento de la renovación.'
      };
    }
    return {
      key: `doc-review-${item.doc.id}`,
      text: `${name} está pendiente de revisión.`,
      action: 'Revisar documento.'
    };
  });

  const critical = items.filter((item) => ['Caducado', 'Rechazado'].includes(item.status)).length;
  const pending = items.length;
  return {
    items: recommendations,
    headline: critical
      ? `${critical} incidencia(s) documental(es) crítica(s).`
      : pending
        ? `${pending} documento(s) requieren seguimiento.`
        : 'Documentación sin alertas prioritarias.',
    action: recommendations[0]?.action || 'Mantener revisión ordinaria.'
  };
}

function buildAssistantRecommendations({ beneficiary, documents = [], deliveries = [], requests = [], risks = [], nextDelivery }) {
  const recommendations = [];
  const documentStatuses = documents.map((doc) => intelligentDocumentStatus(doc));
  const pendingDocuments = documentStatuses.filter((status) => ['Pendiente de revisión', 'Rechazado', 'Renovación solicitada', 'Próximo a caducar'].includes(status)).length;
  const expiredDocuments = documentStatuses.filter((status) => status === 'Caducado').length;
  const openRequests = requests.filter(isOpenPortalRequest).length;
  const nextAttendance = normalize(nextDelivery?.attendance_status);
  if (pendingDocuments || expiredDocuments) {
    recommendations.push({
      title: 'Solicitar revisión documental',
      impact: 'Reduce bloqueos en próximas revisiones y entregas.',
      reason: `${pendingDocuments} documento(s) pendiente(s) y ${expiredDocuments} caducado(s).`,
      button: 'Preparar aviso',
      previewType: 'email'
    });
  }
  if (openRequests) {
    recommendations.push({
      title: 'Crear seguimiento de solicitud abierta',
      impact: 'Evita que una petición del portal quede sin respuesta.',
      reason: `${openRequests} solicitud(es) pendientes o en gestión.`,
      button: 'Crear seguimiento',
      previewType: 'tracking'
    });
  }
  if (nextDelivery && (!nextAttendance || nextAttendance === 'pending')) {
    recommendations.push({
      title: 'Confirmar asistencia a próxima entrega',
      impact: 'Mejora la planificación y evita ausencias.',
      reason: 'Existe una entrega futura sin confirmación cerrada.',
      button: 'Preparar WhatsApp',
      previewType: 'whatsapp'
    });
  }
  if (!beneficiary.phone && !beneficiary.email) {
    recommendations.push({
      title: 'Actualizar datos de contacto',
      impact: 'Permite avisos y coordinación directa.',
      reason: 'No consta teléfono ni email en el expediente.',
      button: 'Crear seguimiento',
      previewType: 'tracking'
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      title: 'Mantener seguimiento ordinario',
      impact: 'Conserva la continuidad del acompañamiento.',
      reason: risks.length ? 'Hay riesgos menores revisables.' : 'No hay riesgos objetivos destacados.',
      button: 'Generar borrador de informe social',
      previewType: 'report'
    });
  }
  return recommendations;
}

function buildAssistantNextSteps({ documents = [], requests = [], nextDelivery, recommendations = [] }) {
  documents = safeRows(documents);
  requests = safeRows(requests);
  recommendations = safeRows(recommendations);
  const steps = [];
  const hasPendingDocuments = documents.some((doc) => ['Pendiente de revisión', 'Caducado', 'Rechazado', 'Renovación solicitada', 'Próximo a caducar'].includes(intelligentDocumentStatus(doc)));
  if (nextDelivery) {
    steps.push({
      title: 'Confirmar asistencia',
      reason: `Próxima entrega: ${deliverySummaryLabel(nextDelivery)}.`,
      priorityTone: normalize(nextDelivery.attendance_status) === 'confirmed' ? 'border-brand-500 bg-brand-50' : 'border-amber-400 bg-amber-50'
    });
  }
  if (hasPendingDocuments) {
    steps.push({ title: 'Revisar documentación', reason: summarizeDocuments(documents), priorityTone: 'border-amber-400 bg-amber-50' });
  }
  if (requests.filter(isOpenPortalRequest).length) {
    steps.push({ title: 'Abrir solicitud', reason: 'Hay solicitudes del portal pendientes o en gestión.', priorityTone: 'border-red-400 bg-red-50' });
  }
  if (recommendations.some((item) => item.previewType === 'whatsapp')) {
    steps.push({ title: 'Contactar', reason: 'El asistente recomienda preparar una comunicación previa.', priorityTone: 'border-blue-400 bg-blue-50' });
  }
  steps.push({ title: 'Crear seguimiento', reason: 'Registrar revisión manual si el equipo lo considera necesario.', priorityTone: 'border-slate-300 bg-slate-50' });
  steps.push({ title: 'Preparar aviso', reason: 'Disponible como borrador; requiere confirmación del equipo.', priorityTone: 'border-slate-300 bg-slate-50' });
  return steps;
}

function buildAssistantSources({ beneficiary, documents = [], deliveries = [], history = [], requests = [], notices = [], latestDelivery, nextDelivery, lastInteraction, observations }) {
  beneficiary = beneficiary || {};
  documents = safeRows(documents);
  deliveries = safeRows(deliveries);
  requests = safeRows(requests);
  notices = safeRows(notices);
  return [
    {
      name: 'Expediente',
      lastUsed: beneficiary.updated_at ? formatDateTime(beneficiary.updated_at) : formatDate(beneficiary.joined_at || beneficiary.first_attention_at),
      detail: [beneficiary.full_name, beneficiary.code, beneficiary.situation, beneficiary.is_active ? 'Activo' : 'Inactivo'].filter(Boolean).join(' · ')
    },
    {
      name: 'Entregas',
      lastUsed: latestDelivery || nextDelivery ? deliverySummaryLabel(latestDelivery || nextDelivery) : 'Sin entregas usadas',
      detail: `${deliveries.length} entrega(s) vinculadas al expediente.`
    },
    {
      name: 'Documentación',
      lastUsed: summarizeDocuments(documents),
      detail: `${documents.length} documento(s) revisados por reglas objetivas.`
    },
    {
      name: 'Solicitudes',
      lastUsed: requests.length ? getLastRequestLabel(requests) : 'Sin solicitudes del portal',
      detail: `${requests.filter(isOpenPortalRequest).length} solicitud(es) abiertas.`
    },
    {
      name: 'Avisos',
      lastUsed: notices.length ? getLastNoticeLabel(notices) : 'Sin avisos del portal',
      detail: `${notices.length} aviso(s) vinculados al beneficiario.`
    },
    {
      name: 'Observaciones',
      lastUsed: lastInteraction,
      detail: observations
    }
  ];
}

function buildAssistantChronology({ beneficiary, deliveries = [], documents = [], history = [], requests = [], notices = [] }) {
  beneficiary = beneficiary || {};
  deliveries = safeRows(deliveries);
  documents = safeRows(documents);
  history = safeRows(history);
  requests = safeRows(requests);
  notices = safeRows(notices);
  const entries = [
    {
      key: `assistant-alta-${beneficiary.id}`,
      date: beneficiary.joined_at || beneficiary.first_attention_at,
      title: 'Alta del beneficiario',
      detail: beneficiary.first_attention_at ? `Primera atención: ${formatDate(beneficiary.first_attention_at)}` : 'Registro inicial del expediente.',
      icon: '🤝',
      tone: 'bg-brand-50 text-brand-700'
    },
    ...deliveries.map((delivery) => ({
      key: `assistant-delivery-${delivery.id}`,
      date: delivery.delivered_at || delivery.scheduled_at || delivery.created_at,
      title: 'Entrega',
      detail: deliverySummaryLabel(delivery),
      icon: '📦',
      tone: 'bg-blue-50 text-blue-700'
    })),
    ...documents.map((doc) => ({
      key: `assistant-document-${doc.id}`,
      date: doc.uploaded_at || doc.created_at,
      title: 'Documento',
      detail: [doc.document_type || 'Documento', intelligentDocumentStatus(doc), doc.file_name].filter(Boolean).join(' · '),
      icon: '📄',
      tone: ['Pendiente de revisión', 'Caducado', 'Rechazado', 'Renovación solicitada', 'Próximo a caducar'].includes(intelligentDocumentStatus(doc)) ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'
    })),
    ...history.map((item) => ({
      key: `assistant-history-${item.id}`,
      date: item.date || item.created_at,
      title: assistantHistoryTitle(item),
      detail: item.notes || 'Registro de seguimiento.',
      icon: assistantHistoryIcon(item),
      tone: 'bg-slate-100 text-slate-700'
    })),
    ...requests.map((request) => ({
      key: `assistant-request-${request.id}`,
      date: request.updated_at || request.requested_at || request.created_at,
      title: 'Solicitud',
      detail: request.notes || request.requested_changes?.message || request.type || request.status || 'Solicitud creada desde el portal.',
      icon: '📥',
      tone: 'bg-amber-50 text-amber-700'
    })),
    ...notices.map((notice) => ({
      key: `assistant-notice-${notice.id}`,
      date: notice.created_at || notice.published_at,
      title: 'Aviso',
      detail: notice.title || notice.message || notice.body || 'Aviso del portal.',
      icon: '📢',
      tone: 'bg-brand-50 text-brand-700'
    }))
  ];
  return entries
    .filter((item) => item.date || item.detail)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function buildAssistantMemory({ history = [], documents = [], requests = [] }) {
  history = safeRows(history);
  documents = safeRows(documents);
  requests = safeRows(requests);
  const memory = [];
  const latestDocument = [...documents].sort((a, b) => String(b.uploaded_at || b.created_at || '').localeCompare(String(a.uploaded_at || a.created_at || '')))[0];
  if (latestDocument) {
    memory.push({
      key: `memory-doc-${latestDocument.id}`,
      when: latestDocument.uploaded_at || latestDocument.created_at ? formatDate(latestDocument.uploaded_at || latestDocument.created_at) : 'Sin fecha',
      recommendation: 'Se recomendó revisar documentación.',
      result: `Estado actual: ${intelligentDocumentStatus(latestDocument)}.`
    });
  }
  const latestRequest = [...requests].sort((a, b) => String(b.updated_at || b.requested_at || b.created_at || '').localeCompare(String(a.updated_at || a.requested_at || a.created_at || '')))[0];
  if (latestRequest) {
    memory.push({
      key: `memory-request-${latestRequest.id}`,
      when: latestRequest.updated_at || latestRequest.requested_at || latestRequest.created_at ? formatDate(latestRequest.updated_at || latestRequest.requested_at || latestRequest.created_at) : 'Sin fecha',
      recommendation: 'Se recomendó revisar una solicitud del portal.',
      result: latestRequest.status || 'Pendiente de valoración.'
    });
  }
  const latestTracking = [...history].filter((item) => normalize(item.entry_type).includes('seguimiento') || normalize(item.entry_type).includes('objetivo')).sort((a, b) => String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')))[0];
  if (latestTracking) {
    memory.push({
      key: `memory-history-${latestTracking.id}`,
      when: latestTracking.date || latestTracking.created_at ? formatDate(latestTracking.date || latestTracking.created_at) : 'Sin fecha',
      recommendation: latestTracking.entry_type || 'Seguimiento registrado',
      result: latestTracking.notes || 'Registrado en el historial social.'
    });
  }
  if (!memory.length) {
    memory.push({
      key: 'memory-empty',
      when: 'Sin registros previos',
      recommendation: 'Aún no hay recomendaciones anteriores con resultado verificable.',
      result: 'El asistente empezará a mostrar memoria cuando existan documentos, solicitudes o seguimientos registrados.'
    });
  }
  return memory.slice(0, 3);
}

function buildAssistantFocusItems({ risks = [], recommendations = [], nextSteps = [] }) {
  const items = [];
  risks.slice(0, 2).forEach((risk) => items.push(`${risk.level}: ${risk.motive}`));
  recommendations.slice(0, 2).forEach((recommendation) => items.push(recommendation.title));
  nextSteps.slice(0, 2).forEach((step) => items.push(step.title));
  return [...new Set(items)].slice(0, 4).length ? [...new Set(items)].slice(0, 4) : ['Seguimiento ordinario del expediente'];
}

function buildAssistantPreview(type, beneficiary, summary, recommendation = null) {
  const name = beneficiary.full_name || 'beneficiario/a';
  const nextDelivery = summary.items.find((item) => item.label === 'Proxima entrega')?.value || 'Sin entrega futura programada.';
  const riskText = summary.risks.map((risk) => `${risk.level}: ${risk.motive}`).join('\n') || 'Sin riesgos objetivos destacados.';
  const bodies = {
    whatsapp: `Hola ${name}. Te escribimos desde Pan y Esperanza para revisar tu próxima entrega: ${nextDelivery}. Por favor, confirma si necesitas apoyo o tienes alguna duda.`,
    email: `Hola ${name},\n\nDesde Pan y Esperanza queremos revisar contigo tu expediente. ${recommendation?.reason || 'Hemos detectado una revisión pendiente basada en los datos del ERP.'}\n\nGracias.`,
    tracking: `Seguimiento propuesto para ${name}:\n\nMotivo: ${recommendation?.reason || 'Revisión sugerida por el Asistente Pan y Esperanza.'}\nRiesgos detectados:\n${riskText}\n\nAcción propuesta: ${recommendation?.title || 'Revisar expediente y registrar actuación.'}`,
    report: `Borrador de informe social de ${name}\n\n${summary.narrative}\n\nRiesgos detectados:\n${riskText}\n\nPróximos pasos:\n${summary.nextSteps.map((step) => `- ${step.title}: ${step.reason}`).join('\n')}`
  };
  const labels = {
    whatsapp: 'Vista previa de WhatsApp',
    email: 'Vista previa de Email',
    tracking: 'Borrador de seguimiento',
    report: 'Borrador de informe social'
  };
  return {
    label: labels[type] || 'Borrador del asistente',
    title: recommendation?.title || labels[type] || 'Borrador',
    body: bodies[type] || bodies.tracking
  };
}

function buildAssistantAnswer(question, summary) {
  const normalized = normalize(question);
  if (!normalized) return 'Escribe una pregunta sobre este expediente para preparar una respuesta basada en datos del ERP.';
  if (normalized.includes('riesgo')) {
    return summary.risks.length
      ? `Riesgos detectados: ${summary.risks.map((risk) => `${risk.level}: ${risk.motive}`).join('; ')}.`
      : 'No hay riesgos objetivos destacados con los datos actuales.';
  }
  if (normalized.includes('document')) return `Estado documental: ${summary.items.find((item) => item.label === 'Estado documental')?.value || 'Sin datos documentales.'}`;
  if (normalized.includes('entrega')) return `Próxima entrega: ${summary.items.find((item) => item.label === 'Proxima entrega')?.value || 'Sin entrega futura programada.'}`;
  if (normalized.includes('pendiente') || normalized.includes('hoy')) return `Pendiente recomendado: ${summary.nextSteps.map((step) => step.title).join(', ')}.`;
  return summary.narrative;
}

function associationAgeLabel(value) {
  if (!value) return 'Fecha de alta no registrada.';
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 'Fecha de alta no valida.';
  const today = new Date();
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months -= 1;
  if (months <= 0) return `Menos de 1 mes desde el alta (${formatDate(value)}).`;
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  const parts = [];
  if (years) parts.push(`${years} año${years === 1 ? '' : 's'}`);
  if (restMonths) parts.push(`${restMonths} mes${restMonths === 1 ? '' : 'es'}`);
  return `${parts.join(' y ')} desde el alta (${formatDate(value)}).`;
}

function getLatestPastDelivery(deliveries = []) {
  deliveries = safeRows(deliveries);
  const now = Date.now();
  return [...deliveries]
    .filter((delivery) => deliveryDateValue(delivery) <= now)
    .sort((a, b) => deliveryDateValue(b) - deliveryDateValue(a))[0] || null;
}

function getNextFutureDelivery(deliveries = []) {
  deliveries = safeRows(deliveries);
  const now = Date.now();
  return [...deliveries]
    .filter((delivery) => deliveryDateValue(delivery) > now)
    .sort((a, b) => deliveryDateValue(a) - deliveryDateValue(b))[0] || null;
}

function deliveryDateValue(delivery) {
  const date = delivery?.delivered_at || delivery?.scheduled_at || delivery?.created_at;
  const time = delivery?.delivered_time || delivery?.delivery_time || delivery?.time || '00:00:00';
  if (!date) return 0;
  const parsed = new Date(`${date}T${time}`);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  const fallback = new Date(date);
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
}

function deliverySummaryLabel(delivery) {
  if (!delivery) return 'Sin datos de entrega.';
  return [
    formatDate(delivery.delivered_at || delivery.scheduled_at || delivery.created_at),
    delivery.delivered_time || delivery.delivery_time || delivery.time,
    delivery.location || delivery.delivery_location || delivery.pickup_location,
    delivery.help_type || 'Ayuda',
    delivery.status,
    attendanceStatusLabel(delivery.attendance_status)
  ].filter(Boolean).join(' · ');
}

function summarizeDocuments(documents = []) {
  documents = safeRows(documents);
  if (!documents.length) return 'Sin documentacion registrada.';
  const statuses = documents.map((doc) => intelligentDocumentStatus(doc));
  const pending = statuses.filter((status) => ['Pendiente de revisión', 'Rechazado', 'Renovación solicitada'].includes(status)).length;
  const expired = statuses.filter((status) => status === 'Caducado').length;
  const expiring = statuses.filter((status) => status === 'Próximo a caducar').length;
  const reviewed = statuses.filter((status) => ['Vigente', 'No requerido'].includes(status)).length;
  const parts = [];
  if (reviewed) parts.push(`${reviewed} revisado(s)`);
  if (pending) parts.push(`${pending} pendiente(s)`);
  if (expired) parts.push(`${expired} caducado(s)`);
  if (expiring) parts.push(`${expiring} próximo(s) a caducar`);
  return parts.join(' · ') || `${documents.length} documento(s) registrados.`;
}

function summarizeAttendance(deliveries = []) {
  deliveries = safeRows(deliveries);
  const relevant = deliveries.filter((delivery) => delivery.attendance_status);
  if (!relevant.length) return 'Sin confirmaciones de asistencia registradas.';
  const nextDelivery = getNextFutureDelivery(deliveries);
  if (nextDelivery?.attendance_status) return `Proxima entrega: ${attendanceStatusLabel(nextDelivery.attendance_status)}.`;
  const unavailable = relevant.filter((delivery) => normalize(delivery.attendance_status) === 'unavailable').length;
  const needsContact = relevant.filter((delivery) => normalize(delivery.attendance_status) === 'needs_contact').length;
  const confirmed = relevant.filter((delivery) => normalize(delivery.attendance_status) === 'confirmed').length;
  return [
    confirmed ? `${confirmed} confirmada(s)` : '',
    unavailable ? `${unavailable} no asistencia(s)` : '',
    needsContact ? `${needsContact} necesita(n) contacto` : ''
  ].filter(Boolean).join(' · ') || 'Asistencia sin incidencias destacadas.';
}

function attendanceStatusLabel(value) {
  const normalized = normalize(value);
  if (!normalized) return '';
  if (normalized === 'confirmed') return 'Asistencia confirmada';
  if (normalized === 'unavailable') return 'No asistira';
  if (normalized === 'needs_contact') return 'Necesita contacto';
  if (normalized === 'pending') return 'Asistencia pendiente';
  return String(value);
}

function isOpenPortalRequest(request) {
  const status = normalize(request?.status);
  return !['applied', 'resolved', 'resuelta', 'cancelled', 'canceled', 'cancelada'].includes(status);
}

function getLastInteraction({ deliveries = [], documents = [], history = [], requests = [] }) {
  deliveries = safeRows(deliveries);
  documents = safeRows(documents);
  history = safeRows(history);
  requests = safeRows(requests);
  const candidates = [
    ...history.map((item) => ({ type: item.entry_type || 'Seguimiento social', date: item.date || item.created_at })),
    ...requests.map((item) => ({ type: 'Solicitud del portal', date: item.updated_at || item.requested_at || item.created_at })),
    ...deliveries.map((item) => ({ type: 'Entrega', date: item.delivered_at || item.created_at })),
    ...documents.map((item) => ({ type: 'Documento', date: item.uploaded_at || item.created_at }))
  ]
    .filter((item) => item.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = candidates[0];
  return latest ? `${latest.type} · ${formatDateTime(latest.date)}` : 'Sin interacciones registradas.';
}

function getRelevantObservations({ beneficiary, history = [], deliveries = [], requests = [] }) {
  beneficiary = beneficiary || {};
  history = safeRows(history);
  deliveries = safeRows(deliveries);
  requests = safeRows(requests);
  const latestIncident = [...history]
    .filter((item) => normalize(item.entry_type).includes('incidencia'))
    .sort((a, b) => String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')))[0];
  const openRequest = requests.filter(isOpenPortalRequest)
    .sort((a, b) => String(b.updated_at || b.requested_at || b.created_at || '').localeCompare(String(a.updated_at || a.requested_at || a.created_at || '')))[0];
  const attendanceIssue = [...deliveries]
    .filter((delivery) => ['needs_contact', 'unavailable'].includes(normalize(delivery.attendance_status)))
    .sort((a, b) => deliveryDateValue(b) - deliveryDateValue(a))[0];

  return latestIncident?.notes
    || openRequest?.notes
    || openRequest?.requested_changes?.message
    || attendanceIssue?.attendance_notes
    || attendanceIssue?.attendance_reason
    || beneficiary.notes
    || 'Sin observaciones relevantes.';
}

function getLastRequestLabel(requests = []) {
  requests = safeRows(requests);
  const latest = [...requests]
    .sort((a, b) => String(b.updated_at || b.requested_at || b.created_at || '').localeCompare(String(a.updated_at || a.requested_at || a.created_at || '')))[0];
  if (!latest) return 'Sin solicitudes del portal';
  return [
    latest.status || 'Solicitud',
    latest.updated_at || latest.requested_at || latest.created_at ? formatDateTime(latest.updated_at || latest.requested_at || latest.created_at) : '',
    latest.notes || latest.requested_changes?.message || latest.type
  ].filter(Boolean).join(' · ');
}

function getLastNoticeLabel(notices = []) {
  notices = safeRows(notices);
  const latest = [...notices]
    .sort((a, b) => String(b.created_at || b.published_at || '').localeCompare(String(a.created_at || a.published_at || '')))[0];
  if (!latest) return 'Sin avisos del portal';
  return [
    latest.title || latest.subject || 'Aviso',
    latest.created_at || latest.published_at ? formatDateTime(latest.created_at || latest.published_at) : '',
    latest.status
  ].filter(Boolean).join(' · ');
}

function assistantHistoryTitle(item) {
  const normalized = normalize(`${item.entry_type || ''} ${item.notes || ''}`);
  if (normalized.includes('llamada') || normalized.includes('telefono')) return 'Llamada registrada';
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  if (normalized.includes('aviso')) return 'Aviso';
  if (normalized.includes('seguimiento')) return 'Seguimiento';
  if (normalized.includes('donacion')) return 'Donación';
  return item.entry_type || 'Seguimiento social';
}

function assistantHistoryIcon(item) {
  const normalized = normalize(`${item.entry_type || ''} ${item.notes || ''}`);
  if (normalized.includes('llamada') || normalized.includes('telefono')) return '☎';
  if (normalized.includes('whatsapp')) return '💬';
  if (normalized.includes('aviso')) return '📢';
  if (normalized.includes('donacion')) return '❤️';
  return '🤝';
}

function detectBeneficiaryObjectiveRisks({ beneficiary, documents = [], deliveries = [], requests = [], latestDelivery, nextDelivery }) {
  beneficiary = beneficiary || {};
  documents = safeRows(documents);
  deliveries = safeRows(deliveries);
  requests = safeRows(requests);
  const risks = [];
  const documentStatuses = documents.map((doc) => intelligentDocumentStatus(doc));
  const pendingDocuments = documentStatuses.filter((status) => ['Pendiente de revisión', 'Rechazado', 'Renovación solicitada', 'Próximo a caducar'].includes(status)).length;
  const expiredDocuments = documentStatuses.filter((status) => status === 'Caducado').length;
  const unavailableCount = deliveries.filter((delivery) => normalize(delivery.attendance_status) === 'unavailable').length;
  const needsContactCount = deliveries.filter((delivery) => normalize(delivery.attendance_status) === 'needs_contact').length;
  const openRequests = requests.filter(isOpenPortalRequest).length;
  const priority = socialPriorityLabel(beneficiary, []);

  if (expiredDocuments) risks.push(buildRisk('Alto', 'Documentación caducada', `${expiredDocuments} documento(s) caducado(s).`, 'Solicitar actualización documental'));
  if (pendingDocuments) risks.push(buildRisk('Medio', 'Documentación pendiente', `${pendingDocuments} documento(s) pendiente(s) de revisión.`, 'Preparar aviso documental'));
  if (unavailableCount >= 2) risks.push(buildRisk('Alto', 'Ausencias repetidas', `${unavailableCount} no asistencias registradas.`, 'Contactar antes de la próxima entrega'));
  if (needsContactCount) risks.push(buildRisk('Medio', 'Entrega marcada como necesita contacto', `${needsContactCount} entrega(s) requieren contacto.`, 'Abrir seguimiento'));
  if (openRequests) risks.push(buildRisk('Medio', 'Solicitud abierta', `${openRequests} solicitud(es) del portal sin resolver.`, 'Abrir solicitud'));
  if (priority === 'Alta') risks.push(buildRisk('Alto', 'Situación prioritaria', 'Situación marcada como urgente o prioritaria en el expediente.', 'Revisión del equipo'));
  if (latestDelivery && daysSince(latestDelivery.delivered_at || latestDelivery.created_at) > 45) risks.push(buildRisk('Medio', 'Tiempo sin ayuda reciente', 'Más de 45 días desde la última ayuda registrada.', 'Revisar frecuencia de ayuda'));
  if (!latestDelivery && deliveries.length === 0) risks.push(buildRisk('Bajo', 'Sin entregas registradas', 'No existen entregas registradas en el expediente.', 'Verificar historial'));
  if (nextDelivery && !normalize(nextDelivery.attendance_status)) risks.push(buildRisk('Bajo', 'Asistencia sin confirmar', 'La próxima entrega no tiene confirmación de asistencia.', 'Confirmar asistencia'));

  return risks;
}

function buildRisk(level, motive, evidence, action) {
  const levelMap = {
    Alto: { levelIcon: '🔴', cardTone: 'border-red-100 bg-red-50' },
    Medio: { levelIcon: '🟡', cardTone: 'border-amber-100 bg-amber-50' },
    Bajo: { levelIcon: '🟢', cardTone: 'border-brand-100 bg-brand-50' }
  };
  return {
    level,
    motive,
    evidence,
    action,
    levelIcon: levelMap[level]?.levelIcon || '🟢',
    cardTone: levelMap[level]?.cardTone || 'border-brand-100 bg-brand-50'
  };
}

function CrmHeader({ beneficiary, family, canEdit, canDelete, canCreateDelivery, onEdit, onWhatsApp, onEmail, onNewAppointment, onSummaryPdf, onSocialReport, onDelivery, onPhotoChange }) {
  return (
    <header className="relative overflow-hidden border-b border-slate-200 bg-white px-5 py-7 sm:px-7">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-500" />
      <div className="relative flex flex-col gap-6 pt-16 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
          <BeneficiaryPhoto beneficiary={beneficiary} canEdit={canEdit} canDelete={canDelete} onChange={onPhotoChange} />
          <div className="min-w-0 flex-1 rounded-xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge active={beneficiary.is_active} />
              <SocialSituationBadge value={beneficiary.situation} />
            </div>
            <h2 className="mt-2 break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">{beneficiary.full_name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><CalendarDays size={15} className="text-slate-400" /> Alta: {formatDate(beneficiary.joined_at)}</span>
              <span className="flex items-center gap-1.5"><Users size={15} className="text-slate-400" /> {family ? `${family.family_code} · ${family.responsible_name}` : 'Sin unidad familiar'}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-sm lg:justify-end">
          {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={17} /> Editar</Button>}
          <Button variant="secondary" onClick={onSummaryPdf}><Printer size={17} /> Resumen PDF</Button>
          <Button variant="secondary" onClick={onSocialReport}><Download size={17} /> Informe de Atención Social</Button>
          <Button variant="secondary" onClick={onWhatsApp}><MessageCircle size={17} /> WhatsApp</Button>
          <Button variant="secondary" onClick={onEmail}><Mail size={17} /> Email</Button>
          <Button variant="secondary" onClick={onNewAppointment}><CalendarPlus size={17} /> Nueva cita</Button>
          {canCreateDelivery && <Button onClick={onDelivery}><PackagePlus size={17} /> Nueva entrega</Button>}
        </div>
      </div>
    </header>
  );
}

function BeneficiaryPhoto({ beneficiary, canEdit, canDelete, onChange }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    setError('');
    resolveBeneficiaryPhotoUrl(beneficiary)
      .then((displayUrl) => { if (active) setPhoto(displayUrl); })
      .catch((photoError) => {
        if (!active) return;
        setPhoto(null);
        setError(photoError.message || 'No se pudo recuperar la fotografía.');
      });
    return () => { active = false; };
  }, [beneficiary.id, beneficiary.photo_url, beneficiary.photo_data_url, beneficiary.photo, beneficiary.avatar_url]);

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setWorking(true);
    setError('');
    try {
      console.info('[BeneficiaryPhoto] Imagen seleccionada', { source: event.target.capture ? 'camera' : 'gallery', type: file.type, bytes: file.size });
      const optimized = await optimizeBeneficiaryPhoto(file);
      console.info('[BeneficiaryPhoto] Imagen optimizada', { bytes: approximateDataUrlBytes(optimized) });
      const result = await onChange(optimized);
      setPhoto(result?.displayUrl || optimized);
    } catch (photoError) {
      setError(photoError.message || 'No se pudo procesar la fotografía.');
    } finally {
      setWorking(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  async function removePhoto() {
    if (!window.confirm('¿Eliminar la fotografía del beneficiario?')) return;
    setWorking(true);
    setError('');
    try {
      await onChange(null);
      setPhoto(null);
    } catch (photoError) {
      setError(photoError.message || 'No se pudo eliminar la fotografía.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="relative w-28 shrink-0">
      <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-brand-50 text-3xl font-bold text-brand-700 shadow-lg">
        {photo ? <a href={photo} target="_blank" rel="noreferrer" className="h-full w-full" title="Abrir fotografía"><img src={photo} alt={`Fotografía de ${beneficiary.full_name}`} className="h-full w-full object-cover" onError={() => setError('La fotografía existe, pero el navegador no ha podido mostrarla.')} /></a> : initials(beneficiary.full_name)}
        {working && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/55 text-white"><Loader2 className="animate-spin" size={25} /></span>}
      </div>
      {canEdit && (
        <div className="absolute -bottom-2 -right-2 flex gap-1">
          <label className="focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-brand-700 shadow-md ring-1 ring-slate-200 hover:bg-brand-50" title={photo ? 'Elegir otra imagen' : 'Elegir imagen'}>
            <Upload size={17} />
            <span className="sr-only">{photo ? 'Elegir otra imagen' : 'Elegir imagen'}</span>
            <input ref={galleryInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={working} onChange={selectPhoto} />
          </label>
          <label className="focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-brand-700 shadow-md ring-1 ring-slate-200 hover:bg-brand-50" title="Hacer una foto">
            <Camera size={17} />
            <span className="sr-only">Hacer una foto</span>
            <input ref={cameraInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={working} onChange={selectPhoto} />
          </label>
          {photo && canDelete && <button className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-600 shadow-md ring-1 ring-slate-200 hover:bg-red-50" onClick={removePhoto} disabled={working} aria-label="Eliminar fotografía" title="Eliminar fotografía"><ImageOff size={17} /></button>}
        </div>
      )}
      {error && <p className="absolute left-0 top-full z-20 mt-4 w-64 rounded-lg border border-red-200 bg-white p-2 text-xs font-semibold text-red-700 shadow-lg" role="alert">{error}</p>}
    </div>
  );
}

function OverviewPanel({ beneficiary, family, deliveries, history }) {
  const latestDelivery = getLatestDelivery(deliveries);
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
        {latestHistory ? <><div className="flex items-center justify-between gap-3"><p className="font-bold text-ink">{latestHistory.entry_type || 'Seguimiento'}</p><span className="text-xs text-slate-500">{formatDate(latestHistory.date)}</span></div><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{latestHistory.notes}</p></> : <p className="text-sm text-slate-500">No hay anotaciones de seguimiento.</p>}
      </InfoCard>
      <InfoCard icon={Users} title="Unidad familiar"><InfoGrid items={[["Unidad", family ? `${family.family_code} · ${family.responsible_name}` : 'Sin unidad familiar'], ['Miembros', beneficiary.family_members], ['Menores', beneficiary.minors_count], ['Contacto', family?.phone || family?.email]]} /></InfoCard>
      <InfoCard icon={CalendarDays} title="Fechas del expediente"><InfoGrid items={[["Primera atención", formatDate(beneficiary.first_attention_at)], ['Fecha de alta', formatDate(beneficiary.joined_at)], ['Última ayuda', formatDate(beneficiary.last_help_at)], ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo']]} /></InfoCard>
    </div>
  );
}

function PersonalDataPanel({ beneficiary }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoCard icon={UserRound} title="Información personal">
        <InfoGrid items={[["Nombre completo", beneficiary.full_name], ['Fecha de nacimiento', formatDate(beneficiary.birth_date)], ['Sexo', beneficiary.sex], ['Nacionalidad', beneficiary.nationality], ['Estado civil', beneficiary.marital_status]]} />
      </InfoCard>
      <InfoCard icon={FileText} title="Documento identificativo">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">DNI, NIE o pasaporte</p>
          <p className="mt-2 text-xl font-bold tracking-wide text-ink">{beneficiary.document_id || '-'}</p>
          <div className="mt-4 border-t border-slate-200 pt-3"><p className="text-xs text-slate-500">Código de beneficiario</p><p className="mt-1 font-mono text-sm font-bold text-brand-700">{beneficiary.code}</p></div>
        </div>
      </InfoCard>
      <InfoCard icon={ContactRound} title="Contacto">
        <div className="space-y-3"><ContactLine icon={Phone} label="Teléfono" value={beneficiary.phone} /><ContactLine icon={Mail} label="Email" value={beneficiary.email} /><ContactLine icon={MapPin} label="Dirección" value={beneficiary.address_full} /><ContactLine icon={Home} label="Código postal" value={beneficiary.postal_code} /></div>
      </InfoCard>
      <InfoCard icon={ClipboardList} title="Situación actual">
        <div className="mb-4 flex flex-wrap gap-2"><StatusBadge active={beneficiary.is_active} /><SituationBadge value={beneficiary.situation} /><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{beneficiary.requested_help || 'Ayuda sin especificar'}</span></div>
        <InfoGrid items={[["Primera atención", formatDate(beneficiary.first_attention_at)], ['Fecha de alta', formatDate(beneficiary.joined_at)]]} />
        <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs font-medium text-slate-500">Observaciones</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{beneficiary.notes || 'No hay observaciones registradas.'}</p></div>
      </InfoCard>
    </div>
  );
}

function FamilyPanel({ beneficiary, family, members, archived, canAddMember, canCreateFamily, onAddMember, onCreateFamily }) {
  if (!family) {
    return <EmptyState icon={Users} title="Sin unidad familiar" text="Este beneficiario no está vinculado a ninguna unidad familiar." action={canCreateFamily ? <Button onClick={onCreateFamily}><Plus size={17} /> Crear unidad familiar</Button> : null} />;
  }
  return (
    <section>
      <div className={`flex flex-col gap-4 rounded-xl border p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between ${archived ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white'}`}>
        <div><p className={`text-xs font-bold uppercase tracking-wide ${archived ? 'text-slate-600' : 'text-brand-700'}`}>Unidad familiar</p><h3 className="mt-1 text-2xl font-bold text-ink">{family.family_code}</h3><p className="mt-2 text-sm text-slate-600">Titular: <strong>{family.responsible_name || beneficiary.full_name}</strong></p>{archived && <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-300">Familia archivada: no se pueden añadir miembros ni registrar nuevas entregas.</p>}</div>
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
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await onSubmit({ ...form, responsible_name: beneficiary.full_name });
      } finally {
        setSaving(false);
      }
    }}>
      <FormField label="Código familiar"><input className={inputClass} required value={form.family_code} onChange={(event) => update('family_code', event.target.value)} /></FormField>
      <FormField label="Responsable"><div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">{beneficiary.full_name}</div></FormField>
      <div className="sm:col-span-2"><FormField label="Dirección"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField></div>
      <FormField label="Teléfono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
      <FormField label="Dependientes"><input className={inputClass} type="number" min="0" value={form.dependents_count} onChange={(event) => update('dependents_count', Number(event.target.value))} /></FormField>
      <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Creando...' : 'Crear y vincular familia'}</Button></div>
    </form>
  );
}

function getLatestDelivery(deliveries) {
  return [...deliveries].sort((a, b) => {
    const aValue = `${a.delivered_at || ''}T${a.delivered_time || '00:00:00'}`;
    const bValue = `${b.delivered_at || ''}T${b.delivered_time || '00:00:00'}`;
    return bValue.localeCompare(aValue);
  })[0];
}

function isActiveDelivery(delivery) {
  return delivery.status !== 'Anulada';
}

function isArchivedFamily(family) {
  if (!family) return false;
  if (family.archived_at) return true;
  if (normalize(family.status) === 'archivada') return true;
  return String(family.notes || '')
    .split(/\r?\n/)
    .some((line) => line.startsWith(FAMILY_ARCHIVE_MARKER));
}

function socialPriorityLabel(beneficiary, history = []) {
  const situation = normalize(beneficiary.situation);
  if (situation.includes('urgente') || situation.includes('prioritario')) return 'Alta';
  if (history.some((item) => normalize(item.entry_type).includes('incidencia'))) return 'Alta';
  if (situation.includes('seguimiento') || situation.includes('vulnerable')) return 'Media';
  return 'Normal';
}

function priorityBadgeTone(priority) {
  if (priority === 'Alta') return 'bg-red-50 text-red-700 ring-red-200';
  if (priority === 'Media') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-brand-50 text-brand-700 ring-brand-100';
}

function nextReviewLabel(beneficiary, latestDelivery, history = []) {
  const explicit = beneficiary.next_review_at || beneficiary.review_at || beneficiary.renewal_at;
  if (explicit) return formatDate(explicit);
  const latestHistory = [...history].sort((a, b) => String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')))[0];
  const base = latestHistory?.date || latestDelivery?.delivered_at || beneficiary.last_help_at || beneficiary.joined_at;
  if (!base) return 'Sin programar';
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return 'Sin programar';
  date.setDate(date.getDate() + 30);
  return formatDate(date.toISOString().slice(0, 10));
}

function assignedResponsibleLabel(beneficiary, family) {
  return beneficiary.assigned_responsible || beneficiary.responsible || beneficiary.case_worker || family?.responsible_name || 'Sin asignar';
}

function helpFrequencyLabel(deliveries = []) {
  if (deliveries.length >= 3) return 'Recurrente';
  if (deliveries.length >= 1) return 'Puntual';
  return 'Sin entregas';
}

function documentStatus(doc) {
  const notes = normalize(doc.notes);
  if (notes.includes('caduc')) return 'Caducado';
  if (notes.includes('pendiente') || !doc.file_data_url) return 'Pendiente';
  return 'Revisado';
}

function buildProfessionalTimeline({ beneficiary, deliveries = [], documents = [], history = [] }) {
  const entries = [
    {
      key: `alta-${beneficiary.id}`,
      date: beneficiary.joined_at || beneficiary.first_attention_at,
      title: 'Alta del expediente',
      detail: beneficiary.first_attention_at ? `Primera atencion: ${formatDate(beneficiary.first_attention_at)}` : 'Registro inicial del beneficiario.',
      icon: UserPlus,
      tone: 'bg-brand-50 text-brand-700'
    },
    ...deliveries.map((delivery) => ({
      key: `delivery-${delivery.id}`,
      date: delivery.delivered_at || delivery.created_at,
      title: 'Entrega registrada',
      detail: [delivery.help_type || 'Ayuda', delivery.inventory_item_name, delivery.quantity ? `Cantidad ${delivery.quantity}` : '', delivery.responsible].filter(Boolean).join(' · '),
      icon: PackageCheck,
      tone: 'bg-blue-50 text-blue-700'
    })),
    ...documents.map((doc) => ({
      key: `document-${doc.id}`,
      date: doc.uploaded_at || doc.created_at,
      title: `Documento ${documentStatus(doc).toLowerCase()}`,
      detail: [doc.document_type || 'Documento', doc.file_name].filter(Boolean).join(' · '),
      icon: Paperclip,
      tone: documentStatus(doc) === 'Pendiente' ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'
    })),
    ...history.map((item) => ({
      key: `history-${item.id}`,
      date: item.date || item.created_at,
      title: timelineTitleForHistory(item),
      detail: item.notes || 'Registro social del expediente.',
      icon: trackingIconFor(item.entry_type),
      tone: trackingToneFor(item.entry_type)
    }))
  ];
  return entries
    .filter((item) => item.date || item.detail)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function timelineTitleForHistory(item) {
  const type = normalize(item.entry_type);
  const notes = normalize(item.notes);
  if (type.includes('renovacion') || notes.includes('renovacion')) return 'Renovacion';
  if (type.includes('incidencia') || notes.includes('incidencia')) return 'Incidencia';
  if (notes.includes('donacion extraordinaria')) return 'Donacion extraordinaria';
  if (type.includes('observacion')) return 'Nota social';
  return item.entry_type || 'Seguimiento social';
}

async function optimizeBeneficiaryPhoto(file) {
  const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!acceptedTypes.has(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WEBP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen no puede superar los 10 MB.');

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadPhotoImage(sourceUrl);
    const firstPass = renderSquarePhoto(image, 512, 0.78);
    return approximateDataUrlBytes(firstPass) <= 240 * 1024 ? firstPass : renderSquarePhoto(image, 384, 0.68);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadPhotoImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('La imagen seleccionada no se puede leer.'));
    image.src = sourceUrl;
  });
}

function renderSquarePhoto(image, maxSize, quality) {
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) throw new Error('La imagen seleccionada no tiene un tamaño válido.');
  const targetSize = Math.min(maxSize, sourceSize);
  const sourceX = Math.max((image.naturalWidth - sourceSize) / 2, 0);
  const sourceY = Math.max((image.naturalHeight - sourceSize) / 2, 0);
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no puede optimizar esta imagen.');
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, targetSize, targetSize);
  return canvas.toDataURL('image/webp', quality);
}

function approximateDataUrlBytes(dataUrl) {
  return Math.ceil((dataUrl.length - String(dataUrl).indexOf(',') - 1) * 0.75);
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
          <article key={delivery.id} className={`rounded-xl border bg-white p-4 shadow-sm ${isActiveDelivery(delivery) ? 'border-slate-200' : 'border-amber-200'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-brand-50 p-2 text-brand-700"><PackageCheck size={17} /></span><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-ink">{delivery.help_type || 'Ayuda entregada'}</h4>{!isActiveDelivery(delivery) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Anulada</span>}</div><p className="text-xs text-slate-500">{formatDate(delivery.delivered_at)} · {delivery.receipt_number || 'Sin número de justificante'}</p></div></div>
                <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2 sm:gap-x-8"><p><strong>Producto:</strong> {delivery.inventory_item_name || '-'}</p><p><strong>Cantidad:</strong> {delivery.quantity || '-'}</p><p><strong>Responsable:</strong> {delivery.responsible || '-'}</p><p><strong>Firma:</strong> {delivery.signature_data_url ? 'Disponible' : 'No disponible'}</p></div>
                {delivery.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{delivery.notes}</p>}
                {!isActiveDelivery(delivery) && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p><strong>Motivo:</strong> {delivery.cancellation_reason || '-'}</p><p className="mt-1 text-xs"><strong>Anulada por:</strong> {delivery.cancelled_by_name || '-'} · {formatDateTime(delivery.cancelled_at)}</p></div>}
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

function DocumentsPanel({ documents, beneficiary, actions, canEdit, canDelete, uploadTrigger = 0, initialDocumentId = '', onNotice = () => {} }) {
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [uploading, setUploading] = useState(false);
  const [showClassicDocuments, setShowClassicDocuments] = useState(false);
  const [documentFilter, setDocumentFilter] = useState('all');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [reviewingDocumentAction, setReviewingDocumentAction] = useState('');
  const inputRef = useRef(null);
  const intelligenceSummary = useMemo(() => buildDocumentIntelligenceSummary(documents), [documents]);
  const documentItems = useMemo(() => safeRows(documents).map((doc) => ({ doc, status: intelligentDocumentStatus(doc) })), [documents]);
  const filteredDocumentItems = useMemo(() => {
    const option = DOCUMENT_FILTER_OPTIONS.find((item) => item.id === documentFilter);
    if (!option?.statuses?.length) return documentItems;
    return documentItems.filter((item) => option.statuses.includes(item.status));
  }, [documentFilter, documentItems]);

  useEffect(() => {
    if (!uploadTrigger || !canEdit || uploading) return;
    setShowClassicDocuments(true);
    window.requestAnimationFrame(() => inputRef.current?.click());
  }, [uploadTrigger, canEdit, uploading]);

  useEffect(() => {
    if (!selectedDocument) return;
    const updated = safeRows(documents).find((doc) => doc.id === selectedDocument.id);
    if (updated) {
      setSelectedDocument(updated);
    } else {
      setSelectedDocument(null);
    }
  }, [documents, selectedDocument]);

  useEffect(() => {
    if (!initialDocumentId) return;
    const targetDocument = safeRows(documents).find((doc) => doc.id === initialDocumentId);
    if (!targetDocument) return;
    setShowClassicDocuments(true);
    setSelectedDocument(targetDocument);
  }, [documents, initialDocumentId]);

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    let uploaded = null;
    try {
      uploaded = await uploadBeneficiaryDocumentFile({ beneficiaryId: beneficiary.id, file });
      await actions.createBeneficiaryDocument({
        beneficiary_id: beneficiary.id,
        document_type: documentType,
        file_name: file.name,
        file_data_url: uploaded.fileDataUrl,
        uploaded_at: todayISO(),
        notes: ''
      });
      onNotice('Documento subido correctamente.');
    } catch (error) {
      if (uploaded?.fileDataUrl) {
        await removeBeneficiaryDocumentFile(uploaded.fileDataUrl).catch((cleanupError) => console.warn('[BeneficiaryDocument] No se pudo limpiar la subida fallida', cleanupError));
      }
      onNotice(error.message || 'No se pudo subir el documento.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      setUploading(false);
    }
  }

  async function removeDocument(doc) {
    if (!window.confirm(`¿Eliminar el documento ${doc.file_name || 'seleccionado'}?`)) return;
    try {
      await actions.deleteBeneficiaryDocument(doc.id);
      await removeBeneficiaryDocumentFile(doc.file_data_url).catch((cleanupError) => console.warn('[BeneficiaryDocument] No se pudo eliminar el archivo de Storage', cleanupError));
      setSelectedDocument(null);
      onNotice('Documento eliminado correctamente.');
    } catch (error) {
      onNotice(error.message || 'No se pudo eliminar el documento.');
    }
  }

  async function applyDocumentReview(doc, reviewAction) {
    if (!canEdit) {
      onNotice('No tienes permisos para revisar documentación.');
      return;
    }
    if (!actions.updateBeneficiaryDocument) {
      onNotice('La actualización documental no está disponible.');
      return;
    }
    let observations = '';
    if (reviewAction.requiresObservation) {
      const response = window.prompt('Añade observaciones para esta revisión documental:');
      if (response === null) return;
      observations = response.trim();
      if (!observations) {
        onNotice('Añade observaciones para rechazar el documento.');
        return;
      }
    }
    setReviewingDocumentAction(`${doc.id}:${reviewAction.id}`);
    try {
      const meta = buildNextDocumentAutomationMeta(doc, reviewAction, observations);
      await actions.updateBeneficiaryDocument(doc.id, {
        notes: buildDocumentNotesWithAutomationMeta(doc, meta)
      });
      onNotice(reviewAction.successMessage);
    } catch (error) {
      onNotice(error.message || 'No se pudo actualizar el documento.');
    } finally {
      setReviewingDocumentAction('');
    }
  }

  return (
    <section className="space-y-5">
      <DocumentIntelligenceOverview summary={intelligenceSummary} onShowDocuments={() => setShowClassicDocuments(true)} />

      {showClassicDocuments && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <SectionHeading icon={Paperclip} title="Documentación" description="Vista de revisión documental basada en tarjetas." />
            {canEdit && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <select className={inputClass} value={documentType} onChange={(event) => setDocumentType(event.target.value)} aria-label="Tipo de documento">
                  {DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}
                </select>
                <label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  <Upload size={17} /> {uploading ? 'Subiendo...' : 'Subir documento'}
                  <input ref={inputRef} className="hidden" type="file" disabled={uploading} onChange={uploadDocument} />
                </label>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2" role="list" aria-label="Filtros de documentación">
            {DOCUMENT_FILTER_OPTIONS.map((option) => {
              const active = documentFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`focus-ring rounded-full border px-3 py-1.5 text-sm font-bold transition ${active ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700'}`}
                  onClick={() => setDocumentFilter(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDocumentItems.map((item) => (
              <DocumentReviewCard key={item.doc.id} item={item} onOpen={() => setSelectedDocument(item.doc)} />
            ))}
          </div>

          {!documentItems.length && <div className="mt-5"><EmptyState icon={Paperclip} title="Sin documentos" text="Todavía no se ha adjuntado documentación a este expediente." /></div>}
          {documentItems.length > 0 && !filteredDocumentItems.length && <div className="mt-5"><EmptyState icon={Search} title="Sin resultados" text="No hay documentos con el filtro seleccionado." /></div>}
        </section>
      )}

      {selectedDocument && (
        <DocumentDetailPanel
          doc={selectedDocument}
          status={intelligentDocumentStatus(selectedDocument)}
          canEdit={canEdit}
          canDelete={canDelete}
          reviewingAction={reviewingDocumentAction}
          onReview={applyDocumentReview}
          onDelete={removeDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </section>
  );
}

const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

const DOCUMENT_FILTER_OPTIONS = [
  { id: 'all', label: 'Todos', statuses: null },
  { id: 'valid', label: 'Vigentes', statuses: ['Vigente'] },
  { id: 'pending', label: 'Pendientes', statuses: ['Pendiente de revisión', 'Rechazado', 'Renovación solicitada'] },
  { id: 'expired', label: 'Caducados', statuses: ['Caducado'] },
  { id: 'expiring', label: 'Próximos a caducar', statuses: ['Próximo a caducar'] },
  { id: 'not-required', label: 'No requeridos', statuses: ['No requerido'] }
];

const DOCUMENT_AUTOMATION_META_START = '[ALTHEMON_DOCUMENT_META]';
const DOCUMENT_AUTOMATION_META_END = '[/ALTHEMON_DOCUMENT_META]';

const DOCUMENT_REVIEW_ACTIONS = [
  { id: 'approve', label: 'Aprobar', icon: '✔', status: 'Vigente', historyTitle: 'Documento aprobado', successMessage: 'Documento aprobado correctamente.', tone: 'border-brand-200 bg-brand-50 text-brand-800' },
  { id: 'reject', label: 'Rechazar', icon: '✕', status: 'Rechazado', historyTitle: 'Documento rechazado', successMessage: 'Documento rechazado correctamente.', requiresObservation: true, tone: 'border-red-200 bg-red-50 text-red-800' },
  { id: 'request-renewal', label: 'Solicitar renovación', icon: '📩', status: 'Renovación solicitada', historyTitle: 'Renovación solicitada', successMessage: 'Renovación solicitada registrada.', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'not-required', label: 'Marcar como no requerido', icon: '○', status: 'No requerido', historyTitle: 'Documento marcado como no requerido', successMessage: 'Documento marcado como no requerido.', tone: 'border-slate-200 bg-slate-50 text-slate-700' }
];

function DocumentIntelligenceOverview({ summary, onShowDocuments }) {
  const state = summary.state;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">📄 Gestión Documental</p>
          <h3 className="mt-1 text-2xl font-black text-ink">Estado documental del expediente</h3>
          <div className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-black ${state.tone}`}>
            <span className="mr-1.5">{state.icon}</span>
            <span>Estado del expediente: {state.label}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{state.description}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onShowDocuments}><FileText size={17} /> Ver documentos</Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <DocumentHealthCard summary={summary} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summary.counters.map((counter) => (
            <div key={counter.label} className={`rounded-xl border p-4 ${counter.tone}`}>
              <p className="text-2xl font-black">{counter.value}</p>
              <p className="mt-1 text-xs font-black uppercase tracking-wide">{counter.label}</p>
            </div>
          ))}
        </div>
      </div>

      {summary.actions.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-900">Acciones recomendadas</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {summary.actions.map((action) => (
              <div key={action.key} className="rounded-lg border border-white/80 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="font-black text-ink">{action.title}</p>
                <p className="mt-1 text-slate-600">{action.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentHealthCard({ summary }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-brand-800">Salud documental</p>
          <p className="mt-1 text-3xl font-black text-ink">{summary.health}%</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${summary.state.tone}`}>{summary.state.icon} {summary.state.shortLabel}</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${summary.healthTone}`} style={{ width: `${summary.health}%` }} />
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-slate-700">{summary.healthText}</p>
    </div>
  );
}

function DocumentReviewCard({ item, onOpen }) {
  const { doc, status } = item;
  const meta = documentStatusMeta(status);
  return (
    <button
      type="button"
      className="focus-ring group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-xl bg-brand-50 p-3 text-brand-700"><FileText size={22} /></span>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${meta.badge}`}>
          <span aria-hidden="true">{meta.icon}</span>
          {status}
        </span>
      </div>
      <div className="mt-4 min-w-0">
        <h4 className="line-clamp-2 text-base font-black text-ink">{documentDisplayName(doc)}</h4>
        <p className="mt-1 truncate text-sm text-slate-500">{doc.file_name || 'Sin archivo asociado'}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm text-slate-600">
        <DocumentMetaLine label="Subida" value={formatDate(doc.uploaded_at || doc.created_at)} />
        <DocumentMetaLine label="Caducidad" value={documentExpiryLabel(doc) || 'No aplica'} />
        <DocumentMetaLine label="Actualizado" value={formatDate(documentUpdatedValue(doc))} />
      </dl>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700 group-hover:text-brand-800">
        Revisar detalle <ChevronRight size={16} />
      </span>
    </button>
  );
}

function DocumentDetailPanel({ doc, status, canEdit, canDelete, reviewingAction, onReview, onDelete, onClose }) {
  const meta = documentStatusMeta(status);
  const history = buildDocumentReviewHistory(doc, status);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-stretch sm:justify-end" role="dialog" aria-modal="true" aria-label="Detalle documental">
      <aside className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-panel sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-none">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Detalle documental</p>
              <h3 className="mt-1 text-xl font-black text-ink">{documentDisplayName(doc)}</h3>
            </div>
            <button className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Cerrar detalle">
              ×
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className={`rounded-2xl border p-4 ${meta.panel}`}>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-black ${meta.badge}`}>
              <span aria-hidden="true">{meta.icon}</span>
              {status}
            </span>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{meta.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DocumentInfoBox label="Fecha de subida" value={formatDate(doc.uploaded_at || doc.created_at)} />
            <DocumentInfoBox label="Fecha de caducidad" value={documentExpiryLabel(doc) || 'No aplica'} />
            <DocumentInfoBox label="Última actualización" value={formatDate(documentUpdatedValue(doc))} />
            <DocumentInfoBox label="Quién lo revisó" value={doc.reviewed_by_name || doc.reviewed_by || 'Pendiente'} />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">Observaciones</h4>
            <p className="mt-2 text-sm leading-6 text-slate-700">{documentVisibleNotes(doc) || readDocumentAutomationMeta(doc).observations || doc.observations || 'Sin observaciones registradas.'}</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">Documento</h4>
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="truncate text-sm font-black text-ink">{doc.file_name || 'Sin archivo asociado'}</p>
              <p className="mt-1 text-xs text-slate-500">{doc.file_data_url ? 'Archivo disponible para revisión interna.' : 'No hay archivo adjunto.'}</p>
              {doc.file_data_url && <DocumentDownloadButton doc={doc} />}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">Historial</h4>
            <div className="mt-4 space-y-3">
              {history.map((item) => (
                <div key={item.key} className="flex gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${item.tone}`}>{item.icon}</span>
                  <div>
                    <p className="text-sm font-black text-ink">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.date}</p>
                    {item.observations && <p className="mt-1 text-xs font-semibold text-slate-600">{item.observations}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">Acciones</h4>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-700">Revisión documental</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {DOCUMENT_REVIEW_ACTIONS.map((action) => {
                const isBusy = reviewingAction === `${doc.id}:${action.id}`;
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`focus-ring rounded-xl border px-3 py-3 text-left text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${action.tone}`}
                    disabled={!canEdit || Boolean(reviewingAction)}
                    onClick={() => onReview(doc, action)}
                  >
                    <span className="mr-2" aria-hidden="true">{action.icon}</span>
                    {isBusy ? 'Actualizando...' : action.label}
                  </button>
                );
              })}
            </div>
            {canDelete && (
              <button className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50" type="button" onClick={() => onDelete(doc)}>
                <Trash2 size={17} /> Eliminar documento
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function DocumentMetaLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="text-right font-bold text-ink">{value || '-'}</dd>
    </div>
  );
}

function DocumentInfoBox({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value || '-'}</p>
    </div>
  );
}

function buildDocumentIntelligenceSummary(documents = []) {
  const items = safeRows(documents).map((doc) => ({
    doc,
    status: intelligentDocumentStatus(doc)
  }));
  const counts = {
    Vigente: 0,
    'Próximo a caducar': 0,
    Caducado: 0,
    'Pendiente de revisión': 0,
    'No requerido': 0
  };
  items.forEach((item) => {
    if (['Pendiente de revisión', 'Rechazado', 'Renovación solicitada'].includes(item.status)) {
      counts['Pendiente de revisión'] += 1;
      return;
    }
    counts[item.status] = (counts[item.status] || 0) + 1;
  });
  const total = items.length;
  const healthy = counts.Vigente + counts['No requerido'];
  const health = total ? Math.round((healthy / total) * 100) : 0;
  const state = buildDocumentFileState({ total, counts });
  return {
    total,
    counts,
    state,
    health,
    healthTone: health >= 80 ? 'bg-brand-600' : health >= 45 ? 'bg-amber-500' : 'bg-red-500',
    healthText: documentHealthText({ total, counts, health }),
    counters: [
      { label: 'Vigentes', value: counts.Vigente, tone: 'border-brand-100 bg-brand-50 text-brand-800' },
      { label: 'Próximos a caducar', value: counts['Próximo a caducar'], tone: 'border-amber-100 bg-amber-50 text-amber-800' },
      { label: 'Caducados', value: counts.Caducado, tone: 'border-red-100 bg-red-50 text-red-800' },
      { label: 'Pendientes de revisión', value: counts['Pendiente de revisión'], tone: 'border-slate-200 bg-slate-50 text-slate-800' },
      { label: 'No requeridos', value: counts['No requerido'], tone: 'border-slate-200 bg-white text-slate-600' }
    ],
    actions: buildDocumentRecommendedActions(items, counts)
  };
}

function buildDocumentFileState({ total, counts }) {
  if (counts.Caducado > 0) {
    return {
      icon: '🔴',
      label: 'Documentación crítica pendiente',
      shortLabel: 'Crítico',
      tone: 'border-red-200 bg-red-50 text-red-800',
      description: 'Hay documentación caducada que requiere intervención del equipo.'
    };
  }
  if (!total || counts['Pendiente de revisión'] > 0 || counts['Próximo a caducar'] > 0) {
    return {
      icon: '🟡',
      label: 'Requiere actualización',
      shortLabel: 'Revisar',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      description: total ? 'El expediente tiene documentación pendiente o próxima a necesitar actualización.' : 'No hay documentación registrada en el expediente.'
    };
  }
  return {
    icon: '🟢',
    label: 'Completo',
    shortLabel: 'Completo',
    tone: 'border-brand-200 bg-brand-50 text-brand-800',
    description: 'La documentación registrada no requiere acciones inmediatas.'
  };
}

function documentHealthText({ total, counts, health }) {
  if (!total) return 'Sin documentación registrada. Conviene solicitar la documentación básica del expediente.';
  if (counts.Caducado) return `${counts.Caducado} documento(s) caducado(s). Prioriza la renovación.`;
  if (counts['Pendiente de revisión']) return `${counts['Pendiente de revisión']} documento(s) pendiente(s) de revisión.`;
  if (counts['Próximo a caducar']) return `${counts['Próximo a caducar']} documento(s) próximo(s) a caducar.`;
  return `Salud documental ${health}%. No hay acciones urgentes.`;
}

function beneficiaryDocumentIssue(documents = []) {
  const statuses = safeRows(documents).map((doc) => intelligentDocumentStatus(doc));
  if (statuses.some((status) => ['Caducado', 'Rechazado'].includes(status))) {
    return {
      label: '🔴 Documentación crítica',
      tone: 'bg-red-50 text-red-800 ring-red-100'
    };
  }
  if (statuses.some((status) => ['Pendiente de revisión', 'Renovación solicitada', 'Próximo a caducar'].includes(status))) {
    return {
      label: '🟡 Documentación pendiente',
      tone: 'bg-amber-50 text-amber-800 ring-amber-100'
    };
  }
  return null;
}

function buildDocumentRecommendedActions(items, counts) {
  if (!items.length) {
    return [{ key: 'request-documents', title: 'Solicitar documentación', detail: 'El expediente no tiene documentos registrados.' }];
  }
  const actions = [];
  items
    .filter((item) => item.status === 'Caducado')
    .slice(0, 2)
    .forEach((item) => actions.push({ key: `expired-${item.doc.id}`, title: `Renovar ${documentDisplayName(item.doc)}`, detail: 'Documento caducado.' }));
  items
    .filter((item) => item.status === 'Próximo a caducar')
    .slice(0, 2)
    .forEach((item) => actions.push({ key: `expiring-${item.doc.id}`, title: `Renovar ${documentDisplayName(item.doc)}`, detail: `Caduca pronto${documentExpiryLabel(item.doc) ? `: ${documentExpiryLabel(item.doc)}` : '.'}` }));
  items
    .filter((item) => item.status === 'Pendiente de revisión')
    .slice(0, 2)
    .forEach((item) => actions.push({ key: `review-${item.doc.id}`, title: 'Revisar documento', detail: documentDisplayName(item.doc) }));
  items
    .filter((item) => item.status === 'Rechazado')
    .slice(0, 2)
    .forEach((item) => actions.push({ key: `rejected-${item.doc.id}`, title: `Resolver ${documentDisplayName(item.doc)}`, detail: 'Documento rechazado. Revisar observaciones.' }));
  items
    .filter((item) => item.status === 'Renovación solicitada')
    .slice(0, 2)
    .forEach((item) => actions.push({ key: `renewal-${item.doc.id}`, title: `Seguimiento de ${documentDisplayName(item.doc)}`, detail: 'Renovación solicitada pendiente de recibir.' }));
  return actions.slice(0, 4);
}

function intelligentDocumentStatus(doc) {
  const meta = readDocumentAutomationMeta(doc);
  const metaStatus = normalize(meta.status);
  const statusText = normalize([doc.status, doc.review_status, doc.portal_status, doc.notes].filter(Boolean).join(' '));
  const daysUntilExpiry = daysUntilDocumentExpiry(doc);
  if (metaStatus === 'no requerido') return 'No requerido';
  if (metaStatus === 'rechazado') return 'Rechazado';
  if (metaStatus === 'renovacion solicitada') return 'Renovación solicitada';
  if (metaStatus === 'pendiente de revision') return 'Pendiente de revisión';
  if (metaStatus === 'vigente') {
    if (daysUntilExpiry !== null && daysUntilExpiry < 0) return 'Caducado';
    if (daysUntilExpiry !== null && daysUntilExpiry <= DOCUMENT_EXPIRY_WARNING_DAYS) return 'Próximo a caducar';
    return 'Vigente';
  }
  if (statusText.includes('no requerido') || statusText.includes('no aplica')) return 'No requerido';
  if (daysUntilExpiry !== null && daysUntilExpiry < 0) return 'Caducado';
  if (statusText.includes('caduc')) return 'Caducado';
  if (!doc.file_data_url || statusText.includes('pendiente') || statusText.includes('revision')) return 'Pendiente de revisión';
  if (daysUntilExpiry !== null && daysUntilExpiry <= DOCUMENT_EXPIRY_WARNING_DAYS) return 'Próximo a caducar';
  return 'Vigente';
}

function documentStatusMeta(status) {
  const meta = {
    Vigente: {
      icon: '🟢',
      badge: 'border-brand-200 bg-brand-50 text-brand-800',
      panel: 'border-brand-100 bg-brand-50/70',
      description: 'Documento vigente. No requiere intervención inmediata.'
    },
    'Próximo a caducar': {
      icon: '🟡',
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      panel: 'border-amber-100 bg-amber-50/70',
      description: 'Documento próximo a caducar. Conviene preparar su renovación.'
    },
    Caducado: {
      icon: '🔴',
      badge: 'border-red-200 bg-red-50 text-red-800',
      panel: 'border-red-100 bg-red-50/70',
      description: 'Documento caducado. Requiere revisión del equipo.'
    },
    'Pendiente de revisión': {
      icon: '⚫',
      badge: 'border-slate-300 bg-slate-100 text-slate-800',
      panel: 'border-slate-200 bg-slate-50',
      description: 'Documento pendiente de revisión por el equipo.'
    },
    'No requerido': {
      icon: '⚪',
      badge: 'border-slate-200 bg-white text-slate-600',
      panel: 'border-slate-200 bg-white',
      description: 'Documento marcado como no requerido para este expediente.'
    },
    Rechazado: {
      icon: '🔴',
      badge: 'border-red-200 bg-red-50 text-red-800',
      panel: 'border-red-100 bg-red-50/70',
      description: 'Documento rechazado. Revise las observaciones y solicite una nueva versión si procede.'
    },
    'Renovación solicitada': {
      icon: '📩',
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      panel: 'border-amber-100 bg-amber-50/70',
      description: 'Se ha solicitado la renovación de este documento.'
    }
  };
  return meta[status] || meta['Pendiente de revisión'];
}

function buildDocumentReviewHistory(doc, status) {
  const meta = readDocumentAutomationMeta(doc);
  const entries = [];
  const uploadedAt = doc.uploaded_at || doc.created_at;
  if (uploadedAt) {
    entries.push({
      key: 'received',
      icon: '📄',
      title: 'Documento recibido',
      rawDate: uploadedAt,
      date: formatDateTime(uploadedAt),
      tone: 'bg-blue-50 text-blue-700'
    });
  }
  if (doc.reviewed_at) {
    entries.push({
      key: 'reviewed',
      icon: status === 'Caducado' ? '⚠' : '✔',
      title: status === 'Caducado' ? 'Documento revisado con incidencias' : 'Documento revisado',
      rawDate: doc.reviewed_at,
      date: formatDateTime(doc.reviewed_at),
      tone: status === 'Caducado' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'
    });
  }
  safeRows(meta.history).forEach((item, index) => {
    entries.push({
      key: item.id || `automation-${index}`,
      icon: documentHistoryIcon(item.type),
      title: item.title || 'Revisión documental',
      rawDate: item.date,
      date: formatDateTime(item.date),
      observations: item.observations || '',
      tone: documentHistoryTone(item.type)
    });
  });
  const updatedAt = documentUpdatedValue(doc);
  if (updatedAt && updatedAt !== uploadedAt && updatedAt !== doc.reviewed_at) {
    entries.push({
      key: 'updated',
      icon: '↻',
      title: 'Última actualización',
      rawDate: updatedAt,
      date: formatDateTime(updatedAt),
      tone: 'bg-slate-100 text-slate-700'
    });
  }
  if (!entries.length) {
    entries.push({
      key: 'empty',
      icon: '📄',
      title: 'Sin historial registrado',
      rawDate: '',
      date: 'El historial aparecerá cuando haya revisiones documentales.',
      tone: 'bg-slate-100 text-slate-600'
    });
  }
  return entries.sort((a, b) => String(b.rawDate || '').localeCompare(String(a.rawDate || '')));
}

function readDocumentAutomationMeta(doc) {
  const notes = String(doc?.notes || '');
  const start = notes.indexOf(DOCUMENT_AUTOMATION_META_START);
  const end = notes.indexOf(DOCUMENT_AUTOMATION_META_END);
  if (start === -1 || end === -1 || end <= start) return {};
  const raw = notes.slice(start + DOCUMENT_AUTOMATION_META_START.length, end).trim();
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function documentVisibleNotes(doc) {
  const notes = String(doc?.notes || '');
  const start = notes.indexOf(DOCUMENT_AUTOMATION_META_START);
  const end = notes.indexOf(DOCUMENT_AUTOMATION_META_END);
  if (start === -1 || end === -1 || end <= start) return notes.trim();
  return `${notes.slice(0, start)}${notes.slice(end + DOCUMENT_AUTOMATION_META_END.length)}`.trim();
}

function buildNextDocumentAutomationMeta(doc, action, observations = '') {
  const current = readDocumentAutomationMeta(doc);
  const now = new Date().toISOString();
  const entry = {
    id: `${action.id}-${now}`,
    type: action.id,
    title: action.historyTitle,
    date: now,
    observations
  };
  return {
    ...current,
    version: 1,
    status: action.status,
    updatedAt: now,
    lastAction: action.id,
    observations: observations || current.observations || '',
    history: [entry, ...safeRows(current.history)].slice(0, 30)
  };
}

function buildDocumentNotesWithAutomationMeta(doc, meta) {
  const visibleNotes = documentVisibleNotes(doc);
  const metaBlock = `${DOCUMENT_AUTOMATION_META_START}${JSON.stringify(meta)}${DOCUMENT_AUTOMATION_META_END}`;
  return [visibleNotes, metaBlock].filter(Boolean).join('\n\n');
}

function documentHistoryIcon(type) {
  if (type === 'approve') return '✔';
  if (type === 'reject') return '✕';
  if (type === 'request-renewal') return '📩';
  if (type === 'not-required') return '○';
  return '📄';
}

function documentHistoryTone(type) {
  if (type === 'approve') return 'bg-brand-50 text-brand-700';
  if (type === 'reject') return 'bg-red-50 text-red-700';
  if (type === 'request-renewal') return 'bg-amber-50 text-amber-700';
  if (type === 'not-required') return 'bg-slate-100 text-slate-700';
  return 'bg-blue-50 text-blue-700';
}

function documentDisplayName(doc) {
  return doc.document_type || doc.file_name || 'documento';
}

function documentExpiryLabel(doc) {
  const value = documentExpiryValue(doc);
  return value ? formatDate(value) : '';
}

function daysUntilDocumentExpiry(doc) {
  const value = documentExpiryValue(doc);
  if (!value) return null;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function documentExpiryValue(doc) {
  return doc.expires_at || doc.expiration_date || doc.expiry_date || doc.expires_on || doc.valid_until || doc.valid_to || '';
}

function documentUpdatedValue(doc) {
  const meta = readDocumentAutomationMeta(doc);
  return meta.updatedAt || doc.updated_at || doc.reviewed_at || doc.uploaded_at || doc.created_at || '';
}

function DocumentDownloadButton({ doc, iconOnly = false }) {
  const [opening, setOpening] = useState(false);

  async function openDocument() {
    if (!doc?.file_data_url || opening) return;
    setOpening(true);
    try {
      const url = await resolveBeneficiaryDocumentUrl(doc.file_data_url);
      if (!url) throw new Error('El documento no tiene una URL disponible.');
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = doc.file_name || 'documento';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      window.alert(error.message || 'No se pudo abrir el documento.');
    } finally {
      setOpening(false);
    }
  }

  if (iconOnly) {
    return <button className="focus-ring rounded-lg p-2 text-brand-700 hover:bg-brand-50 disabled:opacity-60" type="button" onClick={openDocument} disabled={opening} aria-label={`Descargar ${doc.file_name || 'documento'}`} title="Descargar"><Download size={18} /></button>;
  }

  return <button className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-600 disabled:opacity-60" type="button" onClick={openDocument} disabled={opening}>{opening ? 'Abriendo...' : 'Abrir documento'}</button>;
}

function BeneficiaryWhatsAppForm({ beneficiary, onSend, onCancel }) {
  const [message, setMessage] = useState(`Hola ${beneficiary.full_name}, le contactamos desde Pan y Esperanza.`);
  const [sending, setSending] = useState(false);
  const phone = normalizeWhatsAppPhone(beneficiary.phone);

  async function submit(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await onSend(message.trim());
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p className="font-semibold text-ink">{beneficiary.full_name}</p>
        <p>{phone ? `WhatsApp ${phone}` : 'Sin teléfono válido'}</p>
      </div>
      <FormField label="Mensaje">
        <textarea className={`${inputClass} min-h-32`} value={message} onChange={(event) => setMessage(event.target.value)} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={!phone || sending}><MessageCircle size={17} /> {sending ? 'Abriendo...' : 'Abrir WhatsApp'}</Button>
      </div>
    </form>
  );
}

function BeneficiaryPortalNoticeForm({ beneficiary, actions, onSent }) {
  const [form, setForm] = useState({
    title: 'Aviso importante',
    notice_type: 'general',
    message: `Hola ${beneficiary.full_name}, tienes un nuevo aviso de Pan y Esperanza.`
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setStatus('Publicando aviso...');
    setError('');
    try {
      await actions.createBeneficiaryPortalNotice(beneficiary.id, {
        title: form.title.trim(),
        message: form.message.trim(),
        notice_type: form.notice_type
      });
      onSent('Aviso publicado correctamente en el Portal del Beneficiario.');
    } catch (noticeError) {
      setStatus('');
      setError(noticeError.message || 'No se pudo publicar el aviso.');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p className="font-semibold text-ink">{beneficiary.full_name}</p>
        <p>El aviso aparecerá en la pestaña Avisos de su portal.</p>
      </div>
      <FormField label="Tipo">
        <select className={inputClass} value={form.notice_type} onChange={(event) => update('notice_type', event.target.value)}>
          <option value="general">General</option>
          <option value="appointment">Cita</option>
          <option value="document">Documentacion</option>
          <option value="delivery">Entrega</option>
          <option value="urgent">Urgente</option>
        </select>
      </FormField>
      <FormField label="Titulo">
        <input className={inputClass} required value={form.title} onChange={(event) => update('title', event.target.value)} />
      </FormField>
      <FormField label="Mensaje">
        <textarea className={`${inputClass} min-h-32`} required value={form.message} onChange={(event) => update('message', event.target.value)} />
      </FormField>
      {status && <p className="rounded-lg bg-brand-50 p-3 text-sm font-medium text-brand-700">{status}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={Boolean(status)}><Mail size={18} /> Publicar aviso</Button></div>
    </form>
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

function SocialHistory({ history, deliveries = [], beneficiary, actions, currentUser, canEdit }) {
  const [note, setNote] = useState('');
  const [entryType, setEntryType] = useState('Seguimiento');
  const [date, setDate] = useState(todayISO());
  const [observation, setObservation] = useState('');
  const [observationDate, setObservationDate] = useState(todayISO());
  const [objective, setObjective] = useState('');
  const [objectiveDate, setObjectiveDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const diary = buildTrackingDiary(history, deliveries);
  const observations = getTrackingEntriesByType(history, OBSERVATION_ENTRY_TYPE);
  const objectives = getTrackingEntriesByType(history, OBJECTIVE_ENTRY_TYPE);
  const indicators = buildTrackingIndicators(beneficiary, diary, observations, objectives);

  async function createTrackingEntry(payload) {
    await actions.createSocialHistory({
      beneficiary_id: beneficiary.id,
      date: payload.date,
      entry_type: payload.entry_type,
      notes: payload.notes.trim()
    });
  }

  async function submitIntervention(event) {
    event.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      await createTrackingEntry({ date, entry_type: entryType, notes: note });
      setNote('');
      setDate(todayISO());
    } finally {
      setSaving(false);
    }
  }

  async function submitObjective(event) {
    event.preventDefault();
    if (!objective.trim()) return;
    setSaving(true);
    try {
      await createTrackingEntry({ date: objectiveDate, entry_type: OBJECTIVE_ENTRY_TYPE, notes: objective });
      setObjective('');
      setObjectiveDate(todayISO());
    } finally {
      setSaving(false);
    }
  }

  async function submitObservation(event) {
    event.preventDefault();
    if (!observation.trim()) return;
    setSaving(true);
    try {
      await createTrackingEntry({ date: observationDate, entry_type: OBSERVATION_ENTRY_TYPE, notes: observation });
      setObservation('');
      setObservationDate(todayISO());
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <SectionHeading icon={NotebookTabs} title="Seguimiento" description="Diario de intervención social, objetivos, observaciones e indicadores del expediente." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map((indicator) => <TrackingMetric key={indicator.label} {...indicator} />)}
      </div>
      {canEdit && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <form className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={submitIntervention}>
            <h4 className="font-bold text-ink">Nueva intervención</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-[180px_170px_1fr]">
              <FormField label="Tipo"><select className={inputClass} value={entryType} onChange={(event) => setEntryType(event.target.value)}>{SOCIAL_ENTRY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
              <FormField label="Fecha"><input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></FormField>
              <div className="sm:col-span-3"><FormField label="Relato de la intervención"><textarea className={inputClass} required rows="4" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe qué atención se realizó, qué se observó y qué seguimiento queda pendiente." /></FormField></div>
            </div>
            <div className="mt-3 flex justify-end"><Button type="submit" disabled={saving || !note.trim()}>{saving ? 'Guardando...' : 'Añadir al diario'}</Button></div>
          </form>

          <div className="grid gap-4">
            <form className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={submitObjective}>
              <h4 className="font-bold text-ink">Objetivo del expediente</h4>
              <div className="mt-3 grid gap-3">
                <FormField label="Fecha"><input className={inputClass} type="date" value={objectiveDate} onChange={(event) => setObjectiveDate(event.target.value)} /></FormField>
                <FormField label="Objetivo"><textarea className={inputClass} required rows="3" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ejemplo: mantener seguimiento mensual de la unidad familiar." /></FormField>
              </div>
              <div className="mt-3 flex justify-end"><Button type="submit" variant="secondary" disabled={saving || !objective.trim()}><CheckCircle2 size={17} /> Guardar objetivo</Button></div>
            </form>

            <form className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={submitObservation}>
              <h4 className="font-bold text-ink">Observación independiente</h4>
              <div className="mt-3 grid gap-3">
                <FormField label="Fecha"><input className={inputClass} type="date" value={observationDate} onChange={(event) => setObservationDate(event.target.value)} /></FormField>
                <FormField label="Observación"><textarea className={inputClass} required rows="3" value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Anota una observación relevante sin convertirla en intervención." /></FormField>
              </div>
              <div className="mt-3 flex justify-end"><Button type="submit" variant="secondary" disabled={saving || !observation.trim()}><NotebookTabs size={17} /> Guardar observación</Button></div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <TrackingList title="Objetivos del expediente" icon={CheckCircle2} entries={objectives} empty="No hay objetivos definidos en este expediente." currentUser={currentUser} />
        <TrackingList title="Observaciones independientes" icon={ClipboardList} entries={observations} empty="No hay observaciones independientes registradas." currentUser={currentUser} />
      </div>

      <div>
        <SectionHeading icon={CalendarDays} title="Diario cronológico" description="Historia documentada de intervenciones y entregas registradas." />
        <div className="relative mt-5 space-y-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-slate-200">
          {diary.map((item) => (
            <article key={item.key} className="relative flex gap-4">
              <span className={`z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-slate-50 ${item.tone}`}><item.icon size={17} /></span>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-ink">{item.type}</h4><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><UserRound size={13} /> {item.userLabel || socialHistoryUser(item.raw, currentUser)}</p></div><time className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{formatDate(item.date)}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.notes}</p></div>
            </article>
          ))}
        </div>
        {!diary.length && <div className="mt-4"><EmptyState icon={NotebookTabs} title="Sin seguimiento" text="Todavía no hay intervenciones documentadas en este expediente." /></div>}
      </div>
    </section>
  );
}

function TrackingMetric({ label, value, detail, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700'
  };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tones[tone] ? tones[tone].split(' ')[1] : 'text-ink'}`}>{value}</p>{detail && <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>}</div>;
}

function TrackingList({ title, icon: Icon, entries, empty, currentUser }) {
  return (
    <section>
      <SectionHeading icon={Icon} title={title} description="Registro independiente dentro del expediente social." />
      <div className="mt-4 space-y-3">
        {entries.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-slate-500"><UserRound size={13} /> {socialHistoryUser(item, currentUser)}</p>
              <time className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{formatDate(item.date)}</time>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.notes}</p>
          </article>
        ))}
      </div>
      {!entries.length && <div className="mt-4"><EmptyState icon={Icon} title="Sin registros" text={empty} /></div>}
    </section>
  );
}

function getTrackingEntriesByType(history, type) {
  const key = normalize(type);
  return [...history]
    .filter((item) => normalize(item.entry_type) === key)
    .sort((a, b) => String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')));
}

function buildTrackingDiary(history = [], deliveries = []) {
  const diaryEntries = history
    .filter((item) => isDiaryTrackingEntry(item))
    .map((item) => ({
      key: `history-${item.id}`,
      raw: item,
      date: item.date || item.created_at,
      type: item.entry_type || 'Seguimiento',
      notes: item.notes || 'Intervención registrada en el expediente.',
      icon: trackingIconFor(item.entry_type),
      tone: trackingToneFor(item.entry_type)
    }));
  const deliveryEntries = deliveries
    .filter((delivery) => !hasDeliveryTrackingEntry(history, delivery))
    .map((delivery) => ({
      key: `delivery-${delivery.id}`,
      raw: delivery,
      date: delivery.delivered_at || delivery.reception_at || delivery.created_at,
      type: DELIVERY_TRACKING_ENTRY_TYPE,
      notes: buildDeliveryTrackingText(delivery),
      userLabel: delivery.responsible || 'Responsable no registrado',
      icon: PackageCheck,
      tone: 'bg-brand-50 text-brand-700'
    }));
  return [...diaryEntries, ...deliveryEntries]
    .filter((item) => item.date || item.notes)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function isDiaryTrackingEntry(item) {
  const type = normalize(item.entry_type);
  return type !== normalize(OBSERVATION_ENTRY_TYPE) && type !== normalize(OBJECTIVE_ENTRY_TYPE);
}

function hasDeliveryTrackingEntry(history, delivery) {
  const receipt = normalize(delivery.receipt_number);
  const deliveredAt = String(delivery.delivered_at || '').slice(0, 10);
  return history.some((item) => {
    if (normalize(item.entry_type) !== normalize(DELIVERY_TRACKING_ENTRY_TYPE)) return false;
    const notes = normalize(item.notes);
    const sameReceipt = receipt && notes.includes(receipt);
    const sameDate = deliveredAt && String(item.date || '').slice(0, 10) === deliveredAt;
    return sameReceipt || (sameDate && notes.includes(normalize(delivery.help_type)));
  });
}

function buildDeliveryTrackingText(delivery) {
  const parts = [`Se registra una entrega de ${delivery.help_type || 'ayuda'} en el expediente.`];
  if (delivery.inventory_item_name) parts.push(`Producto: ${delivery.inventory_item_name}.`);
  if (delivery.quantity) parts.push(`Cantidad: ${delivery.quantity}.`);
  if (delivery.receipt_number) parts.push(`Justificante: ${delivery.receipt_number}.`);
  if (delivery.notes) parts.push(`Observaciones: ${delivery.notes}`);
  return parts.join(' ');
}

function buildTrackingIndicators(beneficiary, diary, observations, objectives) {
  const latest = diary[0];
  const days = latest?.date ? daysSince(latest.date) : null;
  return [
    { label: 'Intervenciones', value: diary.length, detail: latest ? `Última: ${formatDate(latest.date)}` : 'Sin intervenciones', tone: 'brand' },
    { label: 'Objetivos', value: objectives.length, detail: objectives.length ? 'Definidos en seguimiento' : 'Sin objetivos definidos', tone: 'blue' },
    { label: 'Observaciones', value: observations.length, detail: observations.length ? 'Registro independiente' : 'Sin observaciones', tone: 'slate' },
    { label: 'Estado seguimiento', value: trackingStatusLabel(beneficiary, days), detail: days === null ? 'Sin fecha registrada' : `Hace ${days} día${days === 1 ? '' : 's'}`, tone: days !== null && days > 30 ? 'amber' : 'brand' }
  ];
}

function daysSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  return Math.max(0, Math.floor((today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000));
}

function trackingStatusLabel(beneficiary, days) {
  if (!beneficiary.is_active) return 'Inactivo';
  if (days === null) return 'Sin seguimiento';
  if (days > 30) return 'Revisar';
  if (days > 15) return 'Próximo';
  return 'Actualizado';
}

function trackingIconFor(type) {
  const normalized = normalize(type);
  if (normalized.includes('entrega')) return PackageCheck;
  if (normalized.includes('incidencia')) return ClipboardList;
  if (normalized.includes('primera')) return HeartHandshake;
  return CalendarDays;
}

function trackingToneFor(type) {
  const normalized = normalize(type);
  if (normalized.includes('incidencia')) return 'bg-amber-50 text-amber-700';
  if (normalized.includes('entrega')) return 'bg-brand-50 text-brand-700';
  if (normalized.includes('derivacion')) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

function socialHistoryUser(item, currentUser) {
  return item.user_name || item.created_by_name || item.created_by || item.user || (item.isLocalDraft ? `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() : '') || 'Usuario no registrado';
}
