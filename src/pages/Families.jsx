import {
  Archive,
  Baby,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Edit3,
  Euro,
  FileText,
  Home,
  Mail,
  MapPin,
  NotebookTabs,
  PackageCheck,
  Paperclip,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  UserRound,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { resolveBeneficiaryPhotoUrl } from '../lib/beneficiaryPhotos';
import { DOCUMENT_TYPES } from '../lib/constants';
import { formatDate, formatDateTime, normalize, todayISO } from '../lib/formatters';

const emptyFamily = {
  family_code: '',
  responsible_name: '',
  address: '',
  phone: '',
  email: '',
  dependents_count: 0,
  status: 'Activa',
  notes: '',
  archive_reason: ''
};

const FAMILY_STATUS_OPTIONS = ['Activa', 'Seguimiento', 'Urgente', 'Archivada'];
const FAMILY_HISTORY_TYPES = ['Seguimiento', 'Incidencia', 'Cambio', 'Observacion', 'Derivacion'];

export function Families({ data, actions, currentUser, onNavigate }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todas');
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState('');

  const canCreate = canDo(currentUser, 'families', 'create');
  const canEdit = canDo(currentUser, 'families', 'edit');
  const isSuperadmin = currentUser?.role === 'Superadministrador';
  const profiles = useMemo(() => buildFamilyProfiles(data), [data]);
  const profile = profiles.find((item) => item.family.id === profileId) || null;

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return profiles.filter((profileItem) => {
      const family = profileItem.family;
      const haystack = normalize([
        family.family_code,
        family.responsible_name,
        family.address,
        family.phone,
        family.email,
        profileItem.members.map((member) => member.full_name).join(' ')
      ].join(' '));
      const matchesQuery = !needle || haystack.includes(needle);
      const matchesStatus = statusFilter === 'Todas' || familyStatus(family) === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [profiles, query, statusFilter]);

  const activeFamilies = profiles.filter((item) => familyStatus(item.family) !== 'Archivada').length;
  const archivedFamilies = profiles.length - activeFamilies;
  const familiesWithHelp = profiles.filter((item) => item.activeDeliveries.length > 0).length;
  const urgentFamilies = profiles.filter((item) => familyStatus(item.family) === 'Urgente' || item.members.some((member) => member.situation === 'Urgente')).length;

  async function saveFamily(payload) {
    if (payload.id) await actions.updateFamily(payload.id, payload);
    else await actions.createFamily({ ...payload, family_code: payload.family_code || nextFamilyCode(data.families || []) });
    setEditing(null);
    setNotice('Familia guardada correctamente.');
  }

  async function archiveFamily(profileItem, reason) {
    await actions.archiveFamily(profileItem.family.id, { reason });
    setNotice('Familia archivada correctamente.');
  }

  async function deleteFamily(profileItem) {
    await actions.deleteFamily(profileItem.family.id);
    setDeleteTarget(null);
    setNotice('Familia eliminada definitivamente.');
  }

  function openBeneficiary(member) {
    onNavigate?.({ moduleId: 'beneficiaries', profileId: member.id, filter: 'family-detail', familyId: member.family_id, label: member.full_name });
  }

  return (
    <>
      <PageHeader
        title="Familias"
        description="Expedientes sociales de unidades familiares, miembros, ayudas, documentos y seguimiento."
        actions={canCreate && <Button onClick={() => setEditing({ ...emptyFamily, family_code: nextFamilyCode(data.families || []) })}><Plus size={18} /> Nueva familia</Button>}
      />

      {notice && <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">{notice}</div>}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de familias">
        <SummaryCard icon={Users} label="Familias registradas" value={profiles.length} tone="brand" />
        <SummaryCard icon={CheckCircle2} label="Activas" value={activeFamilies} tone="green" />
        <SummaryCard icon={ShieldAlert} label="Prioritarias" value={urgentFamilies} tone="amber" />
        <SummaryCard icon={PackageCheck} label="Con ayudas" value={familiesWithHelp} detail={`${archivedFamilies} archivadas`} tone="blue" />
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-panel" aria-label="Filtros de familias">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
            <Search size={19} className="shrink-0 text-slate-400" />
            <span className="sr-only">Buscar familias</span>
            <input
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="Buscar por codigo, responsable, direccion, telefono o miembro"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por estado</span>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option>Todas</option>
              {FAMILY_STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Mostrando {filtered.length} de {profiles.length} expedientes familiares</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Listado de familias">
        {filtered.map((profileItem) => (
          <FamilyCard
            key={profileItem.family.id}
            profile={profileItem}
            canEdit={canEdit}
            isSuperadmin={isSuperadmin}
            onOpen={() => setProfileId(profileItem.family.id)}
            onEdit={() => setEditing(profileItem.family)}
            onArchive={(reason) => archiveFamily(profileItem, reason)}
            onDelete={() => setDeleteTarget(profileItem)}
          />
        ))}
        {!filtered.length && <EmptyState icon={Search} title="No hay familias" text="Prueba con otra busqueda o cambia el filtro de estado." />}
      </section>

      {editing && (
        <Modal wide title={editing.id ? 'Editar familia' : 'Nueva familia'} onClose={() => setEditing(null)}>
          <FamilyForm initial={editing} families={data.families || []} onSubmit={saveFamily} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {profile && (
        <Modal wide title={`Expediente familiar - ${profile.family.family_code}`} onClose={() => setProfileId(null)}>
          <FamilyProfile
            profile={profile}
            data={data}
            actions={actions}
            canEdit={canEdit}
            canDelete={isSuperadmin}
            onEdit={() => { setProfileId(null); setEditing(profile.family); }}
            onOpenBeneficiary={openBeneficiary}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar familia" onClose={() => setDeleteTarget(null)}>
          <DeleteFamilyDialog
            profile={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => deleteFamily(deleteTarget)}
          />
        </Modal>
      )}
    </>
  );
}

function FamilyCard({ profile, canEdit, isSuperadmin, onOpen, onEdit, onArchive, onDelete }) {
  const { family, stats, activeDeliveries, latestHelp, socialValue } = profile;
  const hasMembers = profile.members.length > 0;
  const archived = familyStatus(family) === 'Archivada';
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <article className={`rounded-xl border bg-white p-4 shadow-panel transition hover:border-brand-100 ${archived ? 'border-slate-200 bg-slate-50' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold text-ink">{family.family_code}</h3>
            <FamilyStatusBadge status={familyStatus(family)} />
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-700">{family.responsible_name || 'Sin responsable'}</p>
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{family.address || 'Sin direccion registrada'}</p>
        </div>
        <span className="rounded-xl bg-brand-50 p-3 text-brand-700"><Users size={22} /></span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Metric label="Miembros" value={stats.totalMembers} />
        <Metric label="Menores" value={stats.minors} />
        <Metric label="Entregas" value={activeDeliveries.length} />
        <Metric label="Valor recibido" value={formatCurrency(socialValue)} />
      </dl>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <MetaLine icon={Phone} text={family.phone || 'Sin telefono'} />
        <MetaLine icon={Mail} text={family.email || 'Sin email'} />
        <MetaLine icon={CalendarDays} text={`Ultima ayuda: ${latestHelp ? formatDate(latestHelp.delivered_at) : '-'}`} />
      </div>

      {hasMembers && isSuperadmin && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Esta familia tiene miembros asociados.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onOpen}><FileText size={16} /> Ver expediente <ChevronRight size={15} /></Button>
        {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={16} /> Editar</Button>}
        {canEdit && !archived && <Button variant="secondary" onClick={() => setArchiveOpen(true)}><Archive size={16} /> Archivar</Button>}
        {isSuperadmin && (
          <Button variant="danger" disabled={hasMembers} onClick={onDelete} title={hasMembers ? 'Esta familia tiene miembros asociados.' : 'Eliminar definitivamente'}>
            <Trash2 size={16} /> Eliminar
          </Button>
        )}
      </div>

      {archiveOpen && (
        <ArchiveInlineForm
          onCancel={() => setArchiveOpen(false)}
          onConfirm={async (reason) => {
            await onArchive(reason);
            setArchiveOpen(false);
          }}
        />
      )}
    </article>
  );
}

function FamilyProfile({ profile, data, actions, canEdit, canDelete, onEdit, onOpenBeneficiary }) {
  const [tab, setTab] = useState('summary');
  const [notice, setNotice] = useState('');
  const { family, members, activeDeliveries, allDeliveries, documents, observations, timeline, stats, latestHelp, socialValue } = profile;

  const tabs = [
    { id: 'summary', label: 'Resumen', icon: Home },
    { id: 'members', label: 'Miembros', icon: Users, count: members.length },
    { id: 'history', label: 'Historial', icon: PackageCheck, count: allDeliveries.length },
    { id: 'documents', label: 'Documentos', icon: Paperclip, count: documents.length },
    { id: 'observations', label: 'Observaciones', icon: NotebookTabs, count: observations.length },
    { id: 'timeline', label: 'Linea temporal', icon: ClipboardList, count: timeline.length }
  ];

  return (
    <div className="-m-5">
      <header className="relative overflow-hidden border-b border-slate-200 bg-white px-5 py-7 sm:px-7">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-brand-700 via-brand-600 to-emerald-500" />
        <div className="relative flex flex-col gap-6 pt-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FamilyStatusBadge status={familyStatus(family)} />
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{family.family_code}</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{family.responsible_name || 'Unidad familiar'}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><MapPin size={15} className="text-slate-400" /> {family.address || 'Sin direccion'}</span>
              <span className="flex items-center gap-1.5"><CalendarDays size={15} className="text-slate-400" /> Alta: {formatDate(family.created_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={17} /> Editar</Button>}
          </div>
        </div>
      </header>

      {notice && <div className="mx-5 mt-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">{notice}</div>}

      <section className="grid gap-3 bg-slate-50/70 px-5 pt-6 sm:grid-cols-2 sm:px-7 xl:grid-cols-6" aria-label="Resumen rapido familiar">
        <ProfileMetric icon={UserRound} label="Adultos" value={stats.adults} tone="brand" />
        <ProfileMetric icon={Baby} label="Menores" value={stats.minors} tone="amber" />
        <ProfileMetric icon={Users} label="Total miembros" value={stats.totalMembers} tone="blue" />
        <ProfileMetric icon={PackageCheck} label="Entregas" value={activeDeliveries.length} tone="brand" />
        <ProfileMetric icon={Euro} label="Valor recibido" value={formatCurrency(socialValue)} tone="green" />
        <ProfileMetric icon={CalendarDays} label="Ultima ayuda" value={latestHelp ? formatDate(latestHelp.delivered_at) : '-'} tone="slate" />
      </section>

      <nav className="mt-6 overflow-x-auto border-y border-slate-200 bg-white px-5 sm:px-7" aria-label="Secciones del expediente familiar">
        <div className="flex min-w-max gap-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button key={id} className={`focus-ring flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
              <Icon size={17} /> {label}{count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
            </button>
          ))}
        </div>
      </nav>

      <main className="bg-slate-50/70 p-5 sm:p-7">
        {tab === 'summary' && <FamilySummaryPanel family={family} stats={stats} latestHelp={latestHelp} socialValue={socialValue} />}
        {tab === 'members' && <MembersPanel members={members} family={family} onOpenBeneficiary={onOpenBeneficiary} />}
        {tab === 'history' && <FamilyHelpHistory deliveries={allDeliveries} inventoryItems={data.inventory_items || []} />}
        {tab === 'documents' && (
          <FamilyDocumentsPanel
            family={family}
            members={members}
            documents={documents}
            actions={actions}
            canEdit={canEdit}
            canDelete={canDelete}
            onNotice={setNotice}
          />
        )}
        {tab === 'observations' && (
          <FamilyObservationsPanel
            family={family}
            members={members}
            observations={observations}
            actions={actions}
            canEdit={canEdit}
            onNotice={setNotice}
          />
        )}
        {tab === 'timeline' && <FamilyTimeline rows={timeline} />}
      </main>
    </div>
  );
}

function FamilySummaryPanel({ family, stats, latestHelp, socialValue }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoCard icon={Home} title="Datos de cabecera">
        <InfoGrid items={[
          ['Codigo familia', family.family_code],
          ['Responsable', family.responsible_name],
          ['Direccion', family.address],
          ['Telefono', family.phone],
          ['Email', family.email],
          ['Estado', familyStatus(family)],
          ['Fecha alta', formatDate(family.created_at)]
        ]} />
      </InfoCard>
      <InfoCard icon={Users} title="Composicion familiar">
        <InfoGrid items={[
          ['Adultos', stats.adults],
          ['Menores', stats.minors],
          ['Total miembros', stats.totalMembers],
          ['Dependientes', family.dependents_count || 0]
        ]} />
      </InfoCard>
      <InfoCard icon={PackageCheck} title="Actividad social">
        <InfoGrid items={[
          ['Entregas realizadas', stats.deliveryCount],
          ['Valor social recibido', formatCurrency(socialValue)],
          ['Ultima ayuda', latestHelp ? `${formatDate(latestHelp.delivered_at)} - ${latestHelp.help_type || 'Ayuda'}` : '-']
        ]} />
      </InfoCard>
      <InfoCard icon={NotebookTabs} title="Observaciones generales">
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{family.notes || 'No hay observaciones generales registradas.'}</p>
        {familyStatus(family) === 'Archivada' && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p><strong>Archivada:</strong> {formatDateTime(family.archived_at)}</p>
            <p className="mt-1"><strong>Motivo:</strong> {family.archive_reason || '-'}</p>
          </div>
        )}
      </InfoCard>
    </div>
  );
}

function MembersPanel({ members, family, onOpenBeneficiary }) {
  return (
    <section>
      <SectionHeading icon={Users} title="Miembros" description="Personas vinculadas a esta unidad familiar." />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {members.map((member) => (
          <article key={member.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <MemberPhoto beneficiary={member} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate font-bold text-ink">{member.full_name}</h4>
                  <MemberStatusBadge active={member.is_active} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{member.code || 'Sin codigo'} - {member.document_id || 'Sin documento'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">Edad: {memberAgeLabel(member)}</span>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">{familyRelationship(member, family)}</span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{member.situation || 'Sin estado'}</span>
                </div>
              </div>
            </div>
            <Button variant="secondary" onClick={() => onOpenBeneficiary(member)}><FileText size={16} /> Abrir expediente</Button>
          </article>
        ))}
      </div>
      {!members.length && <div className="mt-4"><EmptyState icon={Users} title="Sin miembros asociados" text="Esta familia todavia no tiene beneficiarios vinculados." /></div>}
    </section>
  );
}

function FamilyHelpHistory({ deliveries, inventoryItems }) {
  return (
    <section>
      <SectionHeading icon={PackageCheck} title="Historial familiar" description="Todas las ayudas recibidas por cualquier miembro." />
      <div className="mt-4 space-y-3">
        {deliveries.map((delivery) => {
          const value = deliveryValue(delivery, inventoryItems);
          const active = isActiveDelivery(delivery);
          return (
            <article key={delivery.id} className={`rounded-xl border bg-white p-4 shadow-sm ${active ? 'border-slate-200' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-ink">{delivery.help_type || 'Ayuda entregada'}</h4>
                    {!active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Anulada</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(delivery.delivered_at)} - {delivery.beneficiary_name || 'Beneficiario'} - {delivery.receipt_number || 'Sin justificante'}</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-4">
                    <span><strong>Producto:</strong> {delivery.inventory_item_name || delivery.product || '-'}</span>
                    <span><strong>Cantidad:</strong> {delivery.quantity || '-'}</span>
                    <span><strong>Responsable:</strong> {delivery.responsible || '-'}</span>
                    <span><strong>Valor:</strong> {value ? formatCurrency(value) : '-'}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {!deliveries.length && <EmptyState icon={PackageCheck} title="Sin ayudas familiares" text="No hay entregas registradas para los miembros de esta familia." />}
      </div>
    </section>
  );
}

function FamilyDocumentsPanel({ family, members, documents, actions, canEdit, canDelete, onNotice }) {
  const [form, setForm] = useState({ document_type: DOCUMENT_TYPES[0], beneficiary_id: '', notes: '' });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await actions.createBeneficiaryDocument({
        family_id: family.id,
        beneficiary_id: form.beneficiary_id || null,
        document_type: form.document_type,
        file_name: file.name,
        file_data_url: dataUrl,
        uploaded_at: todayISO(),
        notes: form.notes
      });
      setForm((current) => ({ ...current, notes: '' }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      onNotice('Documento familiar adjuntado correctamente.');
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(document) {
    if (!window.confirm(`Eliminar el documento ${document.file_name || document.document_type}?`)) return;
    await actions.deleteBeneficiaryDocument(document.id);
    onNotice('Documento eliminado correctamente.');
  }

  return (
    <section>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeading icon={Paperclip} title="Documentos" description="Documentacion asociada a la familia o a cualquiera de sus miembros." />
        {canEdit && (
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:w-[520px]">
            <select className={inputClass} value={form.document_type} onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value }))}>
              {DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select className={inputClass} value={form.beneficiary_id} onChange={(event) => setForm((current) => ({ ...current, beneficiary_id: event.target.value }))}>
              <option value="">Documento familiar</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}
            </select>
            <input className={`${inputClass} sm:col-span-2`} placeholder="Observaciones del documento" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <label className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:col-span-2">
              <Upload size={17} /> {uploading ? 'Subiendo...' : 'Subir documento'}
              <input ref={fileInputRef} className="hidden" type="file" disabled={uploading} onChange={uploadDocument} />
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {documents.map((document) => (
          <article key={document.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700"><FileText size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{document.file_name || 'Documento sin nombre'}</p>
              <p className="mt-0.5 text-xs text-slate-500">{document.document_type} - {formatDate(document.uploaded_at)} - {document.ownerName}</p>
              {document.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{document.notes}</p>}
            </div>
            {document.file_data_url && <a className="focus-ring rounded-lg p-2 text-brand-700 hover:bg-brand-50" href={document.file_data_url} download={document.file_name} aria-label={`Descargar ${document.file_name}`} title="Descargar"><Download size={18} /></a>}
            {canDelete && <button className="focus-ring rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => removeDocument(document)} aria-label={`Eliminar ${document.file_name}`} title="Eliminar"><Trash2 size={18} /></button>}
          </article>
        ))}
      </div>
      {!documents.length && <div className="mt-4"><EmptyState icon={Paperclip} title="Sin documentos" text="No hay documentacion vinculada a esta familia." /></div>}
    </section>
  );
}

function FamilyObservationsPanel({ family, members, observations, actions, canEdit, onNotice }) {
  const [form, setForm] = useState({ date: todayISO(), entry_type: 'Seguimiento', beneficiary_id: '', notes: '' });
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!form.notes.trim()) return;
    setSaving(true);
    try {
      await actions.createSocialHistory({
        family_id: family.id,
        beneficiary_id: form.beneficiary_id || null,
        date: form.date,
        entry_type: form.entry_type,
        notes: form.notes
      });
      setForm((current) => ({ ...current, notes: '' }));
      onNotice('Observacion familiar registrada correctamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <SectionHeading icon={NotebookTabs} title="Observaciones" description="Historial social familiar y anotaciones de seguimiento." />
        <div className="mt-4 space-y-3">
          {observations.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="font-bold text-ink">{entry.entry_type || 'Seguimiento'}</h4>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(entry.date)} - {entry.memberName || 'Familia'}</p>
                </div>
                {normalize(entry.entry_type).includes('incidencia') && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Incidencia</span>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.notes}</p>
            </article>
          ))}
          {!observations.length && <EmptyState icon={NotebookTabs} title="Sin observaciones" text="Todavia no hay historial social familiar." />}
        </div>
      </div>

      {canEdit && (
        <form className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={submit}>
          <h3 className="font-bold text-ink">Nueva observacion</h3>
          <div className="mt-4 space-y-3">
            <FormField label="Fecha"><input className={inputClass} type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></FormField>
            <FormField label="Tipo"><select className={inputClass} value={form.entry_type} onChange={(event) => setForm((current) => ({ ...current, entry_type: event.target.value }))}>{FAMILY_HISTORY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
            <FormField label="Ambito"><select className={inputClass} value={form.beneficiary_id} onChange={(event) => setForm((current) => ({ ...current, beneficiary_id: event.target.value }))}><option value="">Familia completa</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></FormField>
            <FormField label="Observaciones"><textarea className={inputClass} rows="5" required value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></FormField>
            <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Guardando...' : 'Guardar observacion'}</Button>
          </div>
        </form>
      )}
    </section>
  );
}

function FamilyTimeline({ rows }) {
  return (
    <section>
      <SectionHeading icon={ClipboardList} title="Linea temporal" description="Altas, entregas, cambios, incidencias y documentos." />
      <div className="mt-5 space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <article key={row.key} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[140px_1fr]">
              <time className="text-sm font-semibold text-slate-500">{formatDate(row.date)}</time>
              <div className="flex gap-3">
                <span className={`mt-0.5 rounded-lg p-2 ${row.tone}`}><Icon size={18} /></span>
                <div>
                  <h4 className="font-bold text-ink">{row.title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{row.detail}</p>
                  {row.meta && <p className="mt-1 text-xs font-semibold text-slate-500">{row.meta}</p>}
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length && <EmptyState icon={ClipboardList} title="Sin linea temporal" text="Los eventos apareceran cuando haya actividad familiar." />}
      </div>
    </section>
  );
}

function FamilyForm({ initial, families, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyFamily, ...initial, status: initial.status || 'Activa' }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    const duplicate = families.find((family) => normalize(family.family_code) === normalize(form.family_code) && family.id !== form.id);
    if (duplicate) {
      setError('Ya existe una familia con ese codigo.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la familia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      <FormSection icon={Home} title="Cabecera familiar" description="Datos principales del expediente familiar.">
        <FormField label="Codigo familia" required><input className={inputClass} required value={form.family_code || ''} onChange={(event) => update('family_code', event.target.value)} /></FormField>
        <FormField label="Estado"><select className={inputClass} value={form.status || 'Activa'} onChange={(event) => update('status', event.target.value)}>{FAMILY_STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></FormField>
        <div className="sm:col-span-2"><FormField label="Responsable" required><input className={inputClass} required value={form.responsible_name || ''} onChange={(event) => update('responsible_name', event.target.value)} /></FormField></div>
        <div className="sm:col-span-2"><FormField label="Direccion"><input className={inputClass} value={form.address || ''} onChange={(event) => update('address', event.target.value)} /></FormField></div>
        <FormField label="Telefono"><input className={inputClass} type="tel" value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} /></FormField>
        <FormField label="Email"><input className={inputClass} type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} /></FormField>
        <FormField label="Dependientes"><input className={inputClass} type="number" min="0" value={form.dependents_count ?? 0} onChange={(event) => update('dependents_count', Number(event.target.value))} /></FormField>
      </FormSection>

      <FormSection icon={NotebookTabs} title="Observaciones" description="Informacion social relevante para la unidad familiar.">
        <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="5" value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
        {form.status === 'Archivada' && <div className="sm:col-span-2"><FormField label="Motivo de archivo"><textarea className={inputClass} rows="3" value={form.archive_reason || ''} onChange={(event) => update('archive_reason', event.target.value)} /></FormField></div>}
      </FormSection>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear familia'}</Button>
      </div>
    </form>
  );
}

function DeleteFamilyDialog({ profile, onCancel, onConfirm }) {
  const [confirm, setConfirm] = useState('');
  const hasMembers = profile.members.length > 0;
  return (
    <div>
      {hasMembers ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Esta familia tiene miembros asociados.</p>
          <p className="mt-1">No se puede eliminar definitivamente mientras existan beneficiarios vinculados. Edita esos beneficiarios y quita la familia antes de eliminar.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">Vas a eliminar definitivamente la familia <strong>{profile.family.family_code}</strong>. Esta accion no debe usarse para expedientes reales con actividad.</p>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Escribe ELIMINAR para confirmar</label>
          <input className={`${inputClass} mt-1`} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        {!hasMembers && <Button variant="danger" disabled={confirm !== 'ELIMINAR'} onClick={onConfirm}><Trash2 size={16} /> Eliminar definitivamente</Button>}
      </div>
    </div>
  );
}

function ArchiveInlineForm({ onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await onConfirm(reason);
      } finally {
        setSaving(false);
      }
    }}>
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Motivo de archivo</label>
      <textarea className={`${inputClass} mt-1`} rows="3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo u observaciones..." />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}><Archive size={16} /> Archivar</Button>
      </div>
    </form>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-600'
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`rounded-xl p-3 ${tones[tone] || tones.slate}`}><Icon size={21} /></span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-ink">{value}</p>
        {detail && <p className="text-xs font-medium text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

function ProfileMetric({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-600'
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`inline-flex rounded-lg p-2 ${tones[tone] || tones.slate}`}><Icon size={18} /></span>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 font-bold text-ink">{value}</dd></div>;
}

function MetaLine({ icon: Icon, text }) {
  return <p className="flex min-w-0 items-center gap-2"><Icon size={15} className="shrink-0 text-slate-400" /><span className="truncate">{text}</span></p>;
}

function FamilyStatusBadge({ status }) {
  const normalized = normalize(status);
  const tone = normalized === 'archivada'
    ? 'bg-slate-100 text-slate-700 ring-slate-200'
    : normalized === 'urgente'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : normalized === 'seguimiento'
        ? 'bg-blue-50 text-blue-700 ring-blue-200'
        : 'bg-brand-50 text-brand-700 ring-brand-100';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>{status || 'Activa'}</span>;
}

function MemberStatusBadge({ active }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Activo' : 'Inactivo'}</span>;
}

function MemberPhoto({ beneficiary }) {
  const [photo, setPhoto] = useState('');
  useEffect(() => {
    let active = true;
    resolveBeneficiaryPhotoUrl(beneficiary)
      .then((url) => { if (active) setPhoto(url || ''); })
      .catch(() => { if (active) setPhoto(''); });
    return () => { active = false; };
  }, [beneficiary.id, beneficiary.photo_url, beneficiary.photo_data_url, beneficiary.photo, beneficiary.avatar_url]);

  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 font-bold text-brand-700">
      {photo ? <img className="h-full w-full object-cover" src={photo} alt={`Foto de ${beneficiary.full_name}`} /> : initials(beneficiary.full_name)}
    </span>
  );
}

function InfoCard({ icon: Icon, title, children }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Icon size={19} className="text-brand-700" /><h3 className="font-bold text-ink">{title}</h3></div>{children}</section>;
}

function InfoGrid({ items }) {
  return <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-semibold text-slate-800">{value === 0 ? 0 : value || '-'}</dd></div>)}</dl>;
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

function SectionHeading({ icon: Icon, title, description }) {
  return <div className="flex items-start gap-3"><span className="rounded-lg bg-white p-2 text-brand-700 shadow-sm ring-1 ring-slate-200"><Icon size={19} /></span><div><h3 className="font-bold text-ink">{title}</h3><p className="text-sm text-slate-500">{description}</p></div></div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-9 text-center"><Icon className="mx-auto text-slate-300" size={30} /><h4 className="mt-2 font-bold text-ink">{title}</h4><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}

function buildFamilyProfiles(data = {}) {
  const families = data.families || [];
  const beneficiaries = data.beneficiaries || [];
  const deliveries = data.deliveries || [];
  const documents = data.beneficiary_documents || [];
  const history = data.social_history || [];
  const inventoryItems = data.inventory_items || [];

  return families.map((family) => {
    const members = beneficiaries.filter((member) => member.family_id === family.id);
    const memberIds = new Set(members.map((member) => member.id));
    const allDeliveries = deliveries
      .filter((delivery) => memberIds.has(delivery.beneficiary_id))
      .sort((a, b) => String(b.delivered_at || b.created_at || '').localeCompare(String(a.delivered_at || a.created_at || '')));
    const activeDeliveries = allDeliveries.filter(isActiveDelivery);
    const docs = documents
      .filter((document) => document.family_id === family.id || memberIds.has(document.beneficiary_id))
      .map((document) => ({
        ...document,
        ownerName: document.family_id === family.id && !document.beneficiary_id
          ? 'Familia'
          : members.find((member) => member.id === document.beneficiary_id)?.full_name || 'Miembro'
      }))
      .sort((a, b) => String(b.uploaded_at || b.created_at || '').localeCompare(String(a.uploaded_at || a.created_at || '')));
    const observations = history
      .filter((entry) => entry.family_id === family.id || memberIds.has(entry.beneficiary_id))
      .map((entry) => ({
        ...entry,
        memberName: members.find((member) => member.id === entry.beneficiary_id)?.full_name || ''
      }))
      .sort((a, b) => String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')));
    const latestHelp = activeDeliveries[0] || null;
    const socialValue = activeDeliveries.reduce((total, delivery) => total + deliveryValue(delivery, inventoryItems), 0);
    const stats = familyStats(family, members, activeDeliveries);
    const timeline = buildFamilyTimeline({ family, members, deliveries: allDeliveries, documents: docs, observations, inventoryItems });
    return { family, members, allDeliveries, activeDeliveries, documents: docs, observations, latestHelp, socialValue, stats, timeline };
  }).sort((a, b) => String(a.family.family_code || '').localeCompare(String(b.family.family_code || '')));
}

function buildFamilyTimeline({ family, members, deliveries, documents, observations, inventoryItems }) {
  const rows = [];
  rows.push({
    key: `family-created-${family.id}`,
    date: family.created_at,
    title: 'Alta de familia',
    detail: `${family.family_code} - ${family.responsible_name || 'Sin responsable'}`,
    icon: Home,
    tone: 'bg-brand-50 text-brand-700'
  });
  if (family.updated_at && family.updated_at !== family.created_at) {
    rows.push({
      key: `family-updated-${family.id}`,
      date: family.updated_at,
      title: 'Cambio en expediente',
      detail: 'Datos familiares actualizados.',
      icon: Edit3,
      tone: 'bg-blue-50 text-blue-700'
    });
  }
  if (family.archived_at) {
    rows.push({
      key: `family-archived-${family.id}`,
      date: family.archived_at,
      title: 'Familia archivada',
      detail: family.archive_reason || 'Expediente archivado.',
      icon: Archive,
      tone: 'bg-slate-100 text-slate-700'
    });
  }
  members.forEach((member) => rows.push({
    key: `member-${member.id}`,
    date: member.joined_at || member.created_at,
    title: 'Alta de miembro',
    detail: member.full_name,
    meta: member.code || '',
    icon: UserRound,
    tone: 'bg-brand-50 text-brand-700'
  }));
  deliveries.forEach((delivery) => rows.push({
    key: `delivery-${delivery.id}`,
    date: delivery.delivered_at || delivery.created_at,
    title: isActiveDelivery(delivery) ? 'Entrega realizada' : 'Entrega anulada',
    detail: `${delivery.beneficiary_name || 'Beneficiario'} - ${delivery.help_type || 'Ayuda'} - ${delivery.inventory_item_name || 'Sin producto'}`,
    meta: `Cantidad: ${delivery.quantity || '-'} - Valor estimado: ${formatCurrency(deliveryValue(delivery, inventoryItems))}`,
    icon: PackageCheck,
    tone: isActiveDelivery(delivery) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
  }));
  documents.forEach((document) => rows.push({
    key: `document-${document.id}`,
    date: document.uploaded_at || document.created_at,
    title: 'Documento',
    detail: `${document.document_type || 'Documento'} - ${document.file_name || 'Sin archivo'}`,
    meta: document.ownerName,
    icon: Paperclip,
    tone: 'bg-violet-50 text-violet-700'
  }));
  observations.forEach((entry) => rows.push({
    key: `history-${entry.id}`,
    date: entry.date || entry.created_at,
    title: normalize(entry.entry_type).includes('incidencia') ? 'Incidencia' : entry.entry_type || 'Observacion',
    detail: entry.notes || '-',
    meta: entry.memberName || 'Familia',
    icon: normalize(entry.entry_type).includes('incidencia') ? ShieldAlert : NotebookTabs,
    tone: normalize(entry.entry_type).includes('incidencia') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
  }));
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function familyStats(family, members, activeDeliveries) {
  const ages = members.map(ageFromBirthDate).filter((age) => Number.isFinite(age));
  const minorsByAge = ages.filter((age) => age < 18).length;
  const fallbackMinors = members.length ? 0 : Number(family.dependents_count || 0);
  const minors = ages.length ? minorsByAge : fallbackMinors;
  const totalMembers = members.length || Math.max(1, Number(family.dependents_count || 0) + 1);
  return {
    adults: Math.max(0, totalMembers - minors),
    minors,
    totalMembers,
    deliveryCount: activeDeliveries.length
  };
}

function familyStatus(family) {
  if (family.status) return family.status;
  return family.archived_at ? 'Archivada' : 'Activa';
}

function familyRelationship(member, family) {
  if (member.family_relationship) return member.family_relationship;
  if (normalize(member.full_name) && normalize(member.full_name) === normalize(family.responsible_name)) return 'Responsable';
  return 'Miembro';
}

function memberAgeLabel(member) {
  const age = ageFromBirthDate(member);
  return Number.isFinite(age) ? `${age}` : '-';
}

function ageFromBirthDate(member) {
  if (!member?.birth_date) return NaN;
  const birthDate = new Date(member.birth_date);
  if (Number.isNaN(birthDate.getTime())) return NaN;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function deliveryValue(delivery, inventoryItems = []) {
  if (!isActiveDelivery(delivery)) return 0;
  const explicitTotal = firstPositiveNumber(delivery.estimated_total_value, delivery.total_value, delivery.estimated_value, delivery.value_amount);
  if (explicitTotal !== null) return explicitTotal;
  const inventoryItem = inventoryItems.find((item) => item.id === delivery.inventory_item_id);
  const unitValue = firstPositiveNumber(delivery.unit_value, delivery.estimated_unit_value, inventoryItem?.unit_value, inventoryItem?.estimated_unit_value, inventoryItem?.economic_value, inventoryItem?.price, inventoryItem?.cost);
  return unitValue !== null ? unitValue * Number(delivery.quantity || 0) : 0;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function isActiveDelivery(delivery) {
  return delivery.status !== 'Anulada';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function nextFamilyCode(families) {
  const last = families.reduce((max, family) => {
    const match = String(family.family_code || '').match(/FAM-(\d+)/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FAM-${String(last + 1).padStart(4, '0')}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el documento adjunto.'));
    reader.readAsDataURL(file);
  });
}
