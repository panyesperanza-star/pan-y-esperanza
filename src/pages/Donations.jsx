import {
  Banknote,
  Archive,
  Building2,
  CalendarDays,
  Clock3,
  Download,
  Edit3,
  Eye,
  FileText,
  Gift,
  Mail,
  MapPin,
  MessageSquareText,
  NotebookTabs,
  PackageCheck,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { printDonationCertificatePdf } from '../lib/exporters';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';

const DONOR_KIND_OPTIONS = ['Todos', 'Particular', 'Empresa', 'Iglesia', 'Asociacion', 'Fundacion', 'Administracion', 'Entidad', 'Anonimo'];
const DONOR_KIND_FORM_OPTIONS = DONOR_KIND_OPTIONS.filter((item) => item !== 'Todos');
const DONOR_KIND_MARKER = '[DONANTE_TIPO]';
const DONOR_CONTACT_MARKER = '[DONANTE_CONTACTO]';
const DONOR_ALIAS_MARKER = '[DONANTE_ALIAS]';
const DONOR_ARCHIVE_MARKER = '[DONANTE_ARCHIVADO]';
const DONOR_TABS = [
  { id: 'summary', label: 'Resumen', icon: UserRound },
  { id: 'history', label: 'Historial de donaciones', icon: Gift },
  { id: 'documents', label: 'Documentos', icon: FileText },
  { id: 'communications', label: 'Comunicaciones', icon: Mail },
  { id: 'notes', label: 'Observaciones', icon: NotebookTabs }
];

export function Donations({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('Todos');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [profileId, setProfileId] = useState('');
  const [tab, setTab] = useState('summary');
  const [editing, setEditing] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const canRegisterDonation = canDo(currentUser, 'accounting', 'create');
  const canEditDonors = canDo(currentUser, 'accounting', 'edit');
  const isSuperadmin = currentUser?.role === 'Superadministrador';
  const donorProfiles = useMemo(() => buildDonorProfiles(data), [data]);
  const stats = useMemo(() => buildDonorStats(donorProfiles), [donorProfiles]);
  const selectedProfile = donorProfiles.find((profile) => profile.id === profileId) || null;

  const visibleProfiles = useMemo(() => donorProfiles.filter((profile) => {
    const haystack = normalize([
      profile.name,
      profile.kind,
      profile.contactPerson,
      profile.phone,
      profile.email,
      profile.address,
      profile.observations
    ].join(' '));
    if (query && !haystack.includes(normalize(query))) return false;
    if (kindFilter !== 'Todos' && normalize(profile.kind) !== normalize(kindFilter)) return false;
    if (pendingOnly && !profile.donations.some(isPendingDonation)) return false;
    return true;
  }), [donorProfiles, kindFilter, pendingOnly, query]);

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'donations') return;
    setPendingOnly(navigationTarget.filter === 'pending-donations');
  }, [navigationTarget]);

  function openOperation(operationType) {
    const label = operationType === 'donation_in_kind' ? 'Donación en especie' : 'Donación monetaria';
    onNavigate?.({
      moduleId: 'accounting',
      filter: 'new-operation',
      operationType,
      title: `Registrar ${label.toLowerCase()}`,
      contextLabel: 'Donaciones'
    });
  }

  function openProfile(profile) {
    setProfileId(profile.id);
    setTab('summary');
  }

  async function saveDonor(profile, payload) {
    const aliases = uniqueValues([...(profile?.aliases || []), profile?.name].filter(Boolean));
    const notes = buildDonorNotes({
      observations: payload.observations,
      kind: payload.kind,
      contactPerson: payload.contactPerson,
      aliases,
      archive: profile?.archive
    });
    const cleanPayload = {
      name: payload.name,
      document_id: payload.document_id,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      notes,
      is_active: !profile?.archived
    };
    if (profile?.contact?.id) await actions.updateDonorContact(profile.contact.id, cleanPayload);
    else await actions.createDonorContact(cleanPayload);
    setEditing(null);
    setNotice('Ficha del donante actualizada correctamente.');
  }

  async function archiveDonor(profile, reason) {
    const archive = {
      archivedAt: new Date().toISOString(),
      archivedBy: currentUserName(currentUser),
      reason
    };
    const contact = profile.contact?.id
      ? profile.contact
      : await actions.createDonorContact({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        notes: buildDonorNotes({
          observations: profile.observations,
          kind: profile.kind,
          contactPerson: profile.contactPerson,
          aliases: uniqueValues([...(profile.aliases || []), profile.name]),
          archive
        }),
        is_active: false
      });
    if (contact?.id && profile.contact?.id) {
      await actions.archiveDonorContact(contact.id, {
        notes: buildDonorNotes({
          observations: profile.observations,
          kind: profile.kind,
          contactPerson: profile.contactPerson,
          aliases: uniqueValues([...(profile.aliases || []), profile.name]),
          archive
        }),
        is_active: false
      });
    }
    setArchiveTarget(null);
    setProfileId(profile.contact?.id ? profile.id : '');
    setNotice('Donante archivado correctamente.');
  }

  async function unarchiveDonor(profile) {
    if (!profile.contact?.id) return;
    await actions.archiveDonorContact(profile.contact.id, {
      notes: buildDonorNotes({
        observations: profile.observations,
        kind: profile.kind,
        contactPerson: profile.contactPerson,
        aliases: profile.aliases,
        archive: null
      }),
      is_active: true
    });
    setNotice('Donante desarchivado correctamente.');
  }

  async function deleteDonor(profile) {
    if (!profile.contact?.id) return;
    await actions.deleteDonorContact(profile.contact.id);
    setDeleteTarget(null);
    if (profileId === profile.id) setProfileId('');
    setNotice('Donante eliminado correctamente.');
  }

  return (
    <>
      <PageHeader
        title="Donaciones"
        description="CRM de donantes. Las donaciones se registran una sola vez desde Contabilidad."
        actions={canRegisterDonation ? (
          <>
            <Button onClick={() => openOperation('donation_money')}><Banknote size={18} /> Donación monetaria</Button>
            <Button variant="secondary" onClick={() => openOperation('donation_in_kind')}><Gift size={18} /> Donación en especie</Button>
          </>
        ) : <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Modo consulta</span>}
      />
      {notice && <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">{notice}</div>}

      <DonorStats stats={stats} />

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Buscar donante</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, teléfono, email o dirección" />
            </span>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Tipo</span>
            <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              {DONOR_KIND_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />
            Solo pendientes
          </label>
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        {visibleProfiles.map((profile) => (
          <DonorCard
            key={profile.id}
            profile={profile}
            canEdit={canEditDonors}
            isSuperadmin={isSuperadmin}
            onOpen={() => openProfile(profile)}
            onEdit={() => setEditing(profile)}
            onArchive={() => setArchiveTarget(profile)}
            onUnarchive={() => unarchiveDonor(profile)}
            onDelete={() => setDeleteTarget(profile)}
          />
        ))}
      </section>

      {!visibleProfiles.length && (
        <EmptyState
          icon={Users}
          title="No hay donantes con estos filtros."
          text="Cuando se registren donaciones desde Contabilidad aparecerán aquí como historial del donante."
        />
      )}

      {selectedProfile && (
        <Modal wide title={`Expediente del donante - ${selectedProfile.name}`} onClose={() => setProfileId('')}>
          <DonorProfile
            profile={selectedProfile}
            data={data}
            tab={tab}
            setTab={setTab}
            canEdit={canEditDonors}
            isSuperadmin={isSuperadmin}
            onEdit={() => setEditing(selectedProfile)}
            onArchive={() => setArchiveTarget(selectedProfile)}
            onUnarchive={() => unarchiveDonor(selectedProfile)}
            onDelete={() => setDeleteTarget(selectedProfile)}
          />
        </Modal>
      )}

      {editing && (
        <Modal title="Editar donante" onClose={() => setEditing(null)}>
          <DonorForm profile={editing} onCancel={() => setEditing(null)} onSubmit={(payload) => saveDonor(editing, payload)} />
        </Modal>
      )}

      {archiveTarget && (
        <Modal title="Archivar donante" onClose={() => setArchiveTarget(null)}>
          <ArchiveDonorForm profile={archiveTarget} onCancel={() => setArchiveTarget(null)} onConfirm={(reason) => archiveDonor(archiveTarget, reason)} />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar donante" onClose={() => setDeleteTarget(null)}>
          <DeleteDonorForm profile={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteDonor(deleteTarget)} />
        </Modal>
      )}
    </>
  );
}

function DonorStats({ stats }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <StatCard icon={Users} label="Total donantes" value={stats.totalDonors} tone="slate" />
      <StatCard icon={Clock3} label="Activos" value={stats.activeDonors} tone="green" />
      <StatCard icon={Building2} label="Empresas" value={stats.companies} tone="blue" />
      <StatCard icon={UserRound} label="Particulares" value={stats.individuals} tone="brand" />
      <StatCard icon={Building2} label="Iglesias" value={stats.churches} tone="violet" />
      <StatCard icon={Gift} label="Valor social recibido" value={formatMoney(stats.socialReceived)} tone="cyan" />
      <StatCard icon={Banknote} label="Dinero recibido" value={formatMoney(stats.moneyReceived)} tone="green" />
    </section>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    brand: 'bg-brand-50 text-brand-700',
    violet: 'bg-violet-50 text-violet-700',
    cyan: 'bg-cyan-50 text-cyan-700'
  };
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <span className={`inline-flex rounded-md p-2 ${tones[tone] || tones.slate}`}><Icon size={18} /></span>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </article>
  );
}

function DonorCard({ profile, canEdit, isSuperadmin, onOpen, onEdit, onArchive, onUnarchive, onDelete }) {
  const canDelete = profile.contact?.id && profile.totalDonations === 0;
  return (
    <article className={`rounded-md border p-5 shadow-panel transition ${profile.archived ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white hover:border-brand-100'}`}>
      {profile.archived && <div className="-mx-5 -mt-5 mb-4 border-b border-slate-300 bg-slate-300 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-slate-700">Archivado</div>}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DonorKindBadge kind={profile.kind} />
            <DonorStatusBadge profile={profile} />
          </div>
          <h3 className="mt-2 truncate text-xl font-bold text-ink">{profile.name}</h3>
          <p className="mt-1 text-sm text-slate-600">Persona de contacto: <strong>{profile.contactPerson || '-'}</strong></p>
        </div>
        <span className="rounded-md bg-brand-50 p-3 text-brand-700"><Gift size={23} /></span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <ContactInfo icon={Phone} label="Teléfono" value={profile.phone} />
        <ContactInfo icon={Mail} label="Email" value={profile.email} />
        <ContactInfo icon={MapPin} label="Dirección" value={profile.address} wide />
        <ContactInfo icon={NotebookTabs} label="Observaciones" value={profile.observations} wide />
      </dl>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Donaciones" value={profile.totalDonations} />
        <MiniMetric label="Dinero donado" value={formatMoney(profile.moneyDonated)} />
        <MiniMetric label="Valor social" value={formatMoney(profile.socialDonated)} />
        <MiniMetric label="Primera" value={formatDate(profile.firstDonation)} />
        <MiniMetric label="Última" value={formatDate(profile.lastDonation)} />
        <MiniMetric label="Pendientes" value={profile.pendingDonations} />
      </div>

      {isSuperadmin && profile.totalDonations > 0 && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Este donante tiene donaciones registradas. Utilice Archivar.</p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={16} /> Editar</Button>}
        {canEdit && (profile.archived
          ? <Button variant="secondary" onClick={onUnarchive}><RotateCcw size={16} /> Desarchivar</Button>
          : <Button variant="secondary" onClick={onArchive}><Archive size={16} /> Archivar</Button>)}
        {isSuperadmin && (
          <Button variant="danger" disabled={!canDelete} onClick={onDelete} title={!canDelete ? 'Este donante tiene donaciones registradas. Utilice Archivar.' : 'Eliminar donante'}>
            <Trash2 size={16} /> Eliminar
          </Button>
        )}
        <Button onClick={onOpen}><Eye size={16} /> Abrir expediente</Button>
      </div>
    </article>
  );
}

function ContactInfo({ icon: Icon, label, value, wide = false }) {
  return (
    <div className={`rounded-md bg-slate-50 p-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Icon size={14} /> {label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-700">{value || '-'}</dd>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-ink">{value || '-'}</p>
    </div>
  );
}

function DonorForm({ profile, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => ({
    name: profile.name || '',
    kind: profile.kind || 'Particular',
    contactPerson: profile.contactPerson || '',
    document_id: profile.documentId || '',
    phone: profile.phone || '',
    email: profile.email || '',
    address: profile.address || '',
    observations: profile.observations || ''
  }));
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await onSubmit(form);
      } finally {
        setSaving(false);
      }
    }}>
      <div className="sm:col-span-2"><FormField label="Nombre del donante" required><input className={inputClass} required value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField></div>
      <FormField label="Tipo"><select className={inputClass} value={form.kind} onChange={(event) => update('kind', event.target.value)}>{DONOR_KIND_FORM_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></FormField>
      <FormField label="Persona de contacto"><input className={inputClass} value={form.contactPerson} onChange={(event) => update('contactPerson', event.target.value)} /></FormField>
      <FormField label="Documento / CIF"><input className={inputClass} value={form.document_id} onChange={(event) => update('document_id', event.target.value)} /></FormField>
      <FormField label="Teléfono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
      <div className="sm:col-span-2"><FormField label="Dirección"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField></div>
      <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="4" value={form.observations} onChange={(event) => update('observations', event.target.value)} /></FormField></div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar donante'}</Button>
      </div>
    </form>
  );
}

function ArchiveDonorForm({ profile, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await onConfirm(reason.trim());
      } finally {
        setSaving(false);
      }
    }}>
      <p className="mb-4 text-sm text-slate-600">El donante <strong>{profile.name}</strong> se conservará en el historial y dejará de aparecer como activo.</p>
      <FormField label="Motivo de archivo">
        <textarea className={inputClass} rows="4" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo u observaciones..." />
      </FormField>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}><Archive size={16} /> Archivar</Button>
      </div>
    </form>
  );
}

function DeleteDonorForm({ profile, onCancel, onConfirm }) {
  const [saving, setSaving] = useState(false);
  if (profile.totalDonations > 0) {
    return (
      <div>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Este donante tiene donaciones registradas. Utilice Archivar.</p>
        <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={onCancel}>Cerrar</Button></div>
      </div>
    );
  }
  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await onConfirm();
      } finally {
        setSaving(false);
      }
    }}>
      <p className="text-sm text-slate-600">Se eliminará definitivamente la ficha del donante <strong>{profile.name}</strong>. Esta acción solo está disponible porque no tiene donaciones registradas.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" variant="danger" disabled={saving}><Trash2 size={16} /> Eliminar</Button>
      </div>
    </form>
  );
}

function DonorProfile({ profile, data, tab, setTab, canEdit, isSuperadmin, onEdit, onArchive, onUnarchive, onDelete }) {
  const canDelete = profile.contact?.id && profile.totalDonations === 0;
  return (
    <div className="-m-5">
      <header className={`border-b px-5 py-6 ${profile.archived ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-white'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DonorKindBadge kind={profile.kind} />
              <DonorStatusBadge profile={profile} />
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">{profile.totalDonations} donaciones</span>
            </div>
            <h3 className="mt-2 text-2xl font-bold text-ink">{profile.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{profile.email || profile.phone || 'Sin datos de contacto registrados'}</p>
            {profile.archived && (
              <div className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                <p className="font-bold">Donante archivado</p>
                <p className="mt-1">Fecha: {formatDateTime(profile.archive?.archivedAt)}</p>
                <p>Usuario: {profile.archive?.archivedBy || '-'}</p>
                <p>Motivo: {profile.archive?.reason || '-'}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ProfileMetric label="Dinero" value={formatMoney(profile.moneyDonated)} />
              <ProfileMetric label="Valor social" value={formatMoney(profile.socialDonated)} />
              <ProfileMetric label="Primera" value={formatDate(profile.firstDonation)} />
              <ProfileMetric label="Última" value={formatDate(profile.lastDonation)} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canEdit && <Button variant="secondary" onClick={onEdit}><Edit3 size={16} /> Editar</Button>}
              {canEdit && (profile.archived
                ? <Button variant="secondary" onClick={onUnarchive}><RotateCcw size={16} /> Desarchivar</Button>
                : <Button variant="secondary" onClick={onArchive}><Archive size={16} /> Archivar</Button>)}
              {isSuperadmin && (
                <Button variant="danger" disabled={!canDelete} onClick={onDelete} title={!canDelete ? 'Este donante tiene donaciones registradas. Utilice Archivar.' : 'Eliminar donante'}>
                  <Trash2 size={16} /> Eliminar
                </Button>
              )}
            </div>
            {isSuperadmin && profile.totalDonations > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Este donante tiene donaciones registradas. Utilice Archivar.</p>
            )}
          </div>
        </div>
      </header>

      <nav className="overflow-x-auto border-b border-slate-200 bg-white px-5" aria-label="Secciones del expediente del donante">
        <div className="flex min-w-max gap-1">
          {DONOR_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`focus-ring flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="bg-slate-50/70 p-5">
        {tab === 'summary' && <DonorSummary profile={profile} />}
        {tab === 'history' && <DonorHistory profile={profile} data={data} />}
        {tab === 'documents' && <DonorDocuments profile={profile} data={data} />}
        {tab === 'communications' && <DonorCommunications profile={profile} />}
        {tab === 'notes' && <DonorNotes profile={profile} />}
      </main>
    </div>
  );
}

function ProfileMetric({ label, value }) {
  return (
    <div className="min-w-[118px] rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value || '-'}</p>
    </div>
  );
}

function DonorSummary({ profile }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoPanel icon={UserRound} title="Ficha del donante">
        <InfoGrid items={[
          ['Nombre', profile.name],
          ['Tipo', profile.kind],
          ['Persona de contacto', profile.contactPerson || '-'],
          ['Teléfono', profile.phone || '-'],
          ['Email', profile.email || '-'],
          ['Dirección', profile.address || '-']
        ]} />
      </InfoPanel>
      <InfoPanel icon={Gift} title="Resumen de donaciones">
        <InfoGrid items={[
          ['Número total de donaciones', profile.totalDonations],
          ['Dinero donado', formatMoney(profile.moneyDonated)],
          ['Valor social donado', formatMoney(profile.socialDonated)],
          ['Primera donación', formatDate(profile.firstDonation)],
          ['Última donación', formatDate(profile.lastDonation)],
          ['Donaciones pendientes', profile.pendingDonations]
        ]} />
      </InfoPanel>
    </div>
  );
}

function DonorHistory({ profile, data }) {
  const money = profile.donations.filter((item) => item.category === 'money');
  const inKind = profile.donations.filter((item) => item.category === 'kind');
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <DonationHistorySection title="Dinero" icon={Banknote} rows={money} data={data} />
      <DonationHistorySection title="Donaciones en especie" icon={PackageCheck} rows={inKind} data={data} />
    </div>
  );
}

function DonationHistorySection({ title, icon: Icon, rows, data }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={18} /></span>
        <h4 className="font-bold text-ink">{title}</h4>
      </div>
      <div className="space-y-3">
        {rows.map((item) => (
          <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{item.concept}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.date)} - {item.sourceLabel}</p>
              </div>
              <DonationTypeBadge category={item.category} status={item.status} />
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <CompactMetric label={item.category === 'money' ? 'Importe' : 'Valor estimado'} value={formatMoney(item.category === 'money' ? item.moneyAmount : item.socialAmount)} />
              <CompactMetric label="Producto/categoria" value={item.product || '-'} />
              <CompactMetric label="Cantidad" value={formatQuantity(item)} />
              <CompactMetric label="Documento" value={item.documentLabel || '-'} />
            </dl>
            {item.notes && <p className="mt-3 text-sm leading-6 text-slate-600">{item.notes}</p>}
            {item.rawDonation && (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => printDonationCertificatePdf(item.rawDonation, data.organization_settings?.[0])}><Download size={16} /> Certificado</Button>
              </div>
            )}
          </article>
        ))}
        {!rows.length && <p className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">No hay registros en esta categoria.</p>}
      </div>
    </section>
  );
}

function CompactMetric({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-700">{value || '-'}</dd>
    </div>
  );
}

function DonorDocuments({ profile, data }) {
  const docs = profile.documents;
  const certificates = profile.donations.filter((item) => item.rawDonation);
  return (
    <section className="space-y-3">
      {docs.map((doc) => (
        <article key={doc.id} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <span className="rounded-md bg-brand-50 p-2 text-brand-700"><FileText size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">{doc.file_name || doc.document_number || doc.document_type || 'Documento contable'}</p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(doc.document_at || doc.created_at)} - {formatMoney(doc.amount)}</p>
            {doc.notes && <p className="mt-2 text-sm text-slate-600">{doc.notes}</p>}
          </div>
          {doc.file_data_url && <a className="focus-ring rounded-md p-2 text-brand-700 hover:bg-brand-50" href={doc.file_data_url} download={doc.file_name || 'documento'} aria-label="Descargar documento" title="Descargar"><Download size={18} /></a>}
        </article>
      ))}
      {certificates.map((item) => (
        <article key={`certificate-${item.id}`} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <span className="rounded-md bg-emerald-50 p-2 text-emerald-700"><Download size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Certificado de donación</p>
            <p className="mt-1 text-xs text-slate-500">{formatDate(item.date)} - {item.concept}</p>
          </div>
          <Button variant="secondary" onClick={() => printDonationCertificatePdf(item.rawDonation, data.organization_settings?.[0])}><Download size={16} /> Descargar</Button>
        </article>
      ))}
      {!docs.length && !certificates.length && <EmptyState icon={FileText} title="Sin documentos" text="Los justificantes y certificados asociados al donante aparecerán aquí." />}
    </section>
  );
}

function DonorCommunications({ profile }) {
  return (
    <section className="space-y-3">
      {profile.communications.map((log) => (
        <article key={log.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-blue-50 p-2 text-blue-700"><Mail size={18} /></span>
            <div>
              <p className="font-bold text-ink">{log.subject || 'Comunicacion'}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.sent_at || log.created_at)} - {log.recipient || '-'}</p>
              <p className="mt-2 text-sm text-slate-600">{log.result || log.status || '-'}</p>
            </div>
          </div>
        </article>
      ))}
      {!profile.communications.length && <EmptyState icon={MessageSquareText} title="Sin comunicaciones" text="Los emails vinculados al donante aparecerán aquí." />}
    </section>
  );
}

function DonorNotes({ profile }) {
  const donationNotes = profile.donations.filter((item) => item.notes).map((item) => ({
    id: item.id,
    date: item.date,
    title: item.concept,
    notes: item.notes
  }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <InfoPanel icon={NotebookTabs} title="Observaciones del donante">
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{profile.observations || 'No hay observaciones generales registradas.'}</p>
      </InfoPanel>
      <InfoPanel icon={CalendarDays} title="Observaciones del historial">
        <div className="space-y-3">
          {donationNotes.map((item) => (
            <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">{formatDate(item.date)}</p>
              <p className="mt-1 font-bold text-ink">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.notes}</p>
            </article>
          ))}
          {!donationNotes.length && <p className="text-sm text-slate-500">No hay observaciones en donaciones.</p>}
        </div>
      </InfoPanel>
    </div>
  );
}

function InfoPanel({ icon: Icon, title, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={18} /></span>
        <h4 className="font-bold text-ink">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function InfoGrid({ items }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 break-words font-semibold text-slate-700">{value || '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

function DonorKindBadge({ kind }) {
  const normalized = normalize(kind);
  const tone = normalized === 'empresa'
    ? 'bg-blue-50 text-blue-700 ring-blue-200'
    : normalized === 'iglesia'
      ? 'bg-violet-50 text-violet-700 ring-violet-200'
      : normalized === 'fundacion' || normalized === 'asociacion'
        ? 'bg-cyan-50 text-cyan-700 ring-cyan-200'
        : normalized === 'administracion'
          ? 'bg-slate-100 text-slate-700 ring-slate-300'
          : 'bg-brand-50 text-brand-700 ring-brand-100';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>{kind || 'Particular'}</span>;
}

function DonorStatusBadge({ profile }) {
  if (profile.archived) {
    return <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-300">Archivado</span>;
  }
  if (profile.isActive) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Activo</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">Sin actividad</span>;
}

function DonationTypeBadge({ category, status }) {
  const pending = isPendingStatus(status);
  const tone = pending
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : category === 'money'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : 'bg-pink-50 text-pink-700 ring-pink-200';
  const label = pending ? 'Pendiente' : category === 'money' ? 'Dinero' : 'Especie';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>{label}</span>;
}

function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-white px-5 py-9 text-center">
      <Icon className="mx-auto text-slate-300" size={31} />
      <h4 className="mt-2 font-bold text-ink">{title}</h4>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function donorMetadata(contact) {
  const notes = String(contact?.notes || '');
  const lines = notes.split(/\r?\n/);
  const kind = markerValue(lines, DONOR_KIND_MARKER);
  const contactPerson = markerValue(lines, DONOR_CONTACT_MARKER);
  const aliases = lines
    .filter((line) => line.startsWith(DONOR_ALIAS_MARKER))
    .map((line) => line.slice(DONOR_ALIAS_MARKER.length).trim())
    .filter(Boolean);
  const archiveLine = lines.find((line) => line.startsWith(DONOR_ARCHIVE_MARKER));
  const archive = parseArchiveLine(archiveLine);
  return {
    kind,
    contactPerson,
    aliases,
    archive,
    visibleNotes: visibleDonorNotes(notes)
  };
}

function markerValue(lines, marker) {
  const line = lines.find((item) => item.startsWith(marker));
  return line ? line.slice(marker.length).trim() : '';
}

function parseArchiveLine(line) {
  if (!line) return null;
  const [archivedAt, archivedBy, reason] = line.slice(DONOR_ARCHIVE_MARKER.length).trim().split('|').map((part) => part.trim());
  return {
    archivedAt: archivedAt || '',
    archivedBy: archivedBy || '',
    reason: reason || ''
  };
}

function visibleDonorNotes(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .filter((line) => ![DONOR_KIND_MARKER, DONOR_CONTACT_MARKER, DONOR_ALIAS_MARKER, DONOR_ARCHIVE_MARKER].some((marker) => line.startsWith(marker)))
    .join('\n')
    .trim();
}

function buildDonorNotes({ observations, kind, contactPerson, aliases = [], archive }) {
  const markerLines = [
    `${DONOR_KIND_MARKER} ${kind || 'Particular'}`.trim(),
    contactPerson ? `${DONOR_CONTACT_MARKER} ${contactPerson}`.trim() : '',
    ...uniqueValues(aliases).map((alias) => `${DONOR_ALIAS_MARKER} ${alias}`.trim()),
    archive ? `${DONOR_ARCHIVE_MARKER} ${archive.archivedAt || new Date().toISOString()} | ${archive.archivedBy || ''} | ${archive.reason || ''}`.trim() : ''
  ].filter(Boolean);
  return [String(observations || '').trim(), ...markerLines].filter(Boolean).join('\n');
}

function uniqueValues(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function currentUserName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Usuario';
}

function buildDonorProfiles(data) {
  const contacts = data.accounting_contacts || [];
  const donorContacts = contacts.filter((contact) => normalize(contact.contact_type) === 'donor');
  const contactsById = new Map(donorContacts.map((contact) => [contact.id, contact]));
  const contactsByName = new Map();
  donorContacts.forEach((contact) => {
    const meta = donorMetadata(contact);
    [contact.name, ...meta.aliases].filter(Boolean).forEach((name) => contactsByName.set(normalize(name), contact));
  });
  const inventoryItemsById = new Map((data.inventory_items || []).map((item) => [item.id, item]));
  const profiles = new Map();

  function ensureProfile({ name, contact, kind }) {
    const matchedContact = contact || contactsByName.get(normalize(name));
    const meta = donorMetadata(matchedContact);
    const safeName = matchedContact?.name || name || 'Donante sin identificar';
    const id = matchedContact?.id ? `contact:${matchedContact.id}` : `donor:${normalize(safeName) || 'sin-identificar'}`;
    if (!profiles.has(id)) {
      profiles.set(id, {
        id,
        contact: matchedContact || null,
        name: safeName,
        kind: normalizeKind(kind || meta.kind || inferDonorKind(safeName)),
        contactPerson: meta.contactPerson || '',
        documentId: matchedContact?.document_id || '',
        phone: matchedContact?.phone || '',
        email: matchedContact?.email || '',
        address: matchedContact?.address || '',
        observations: meta.visibleNotes,
        aliases: meta.aliases,
        archive: meta.archive,
        archived: Boolean(meta.archive) || matchedContact?.is_active === false,
        isActive: matchedContact ? matchedContact.is_active !== false && !meta.archive : true,
        donations: [],
        documents: [],
        communications: []
      });
    }
    const profile = profiles.get(id);
    if (!profile.contact && matchedContact) profile.contact = matchedContact;
    if ((!profile.kind || profile.kind === 'Particular') && kind) profile.kind = normalizeKind(kind);
    if (!profile.archive && meta.archive) profile.archive = meta.archive;
    profile.archived = profile.archived || Boolean(profile.archive) || matchedContact?.is_active === false;
    return profile;
  }

  donorContacts.forEach((contact) => ensureProfile({ name: contact.name, contact }));

  (data.accounting_events || [])
    .filter((event) => event.event_type === 'donation_money' && !isVoidedRecord(event))
    .forEach((event) => {
      const contact = contactsById.get(event.contact_id);
      const profile = ensureProfile({ name: contact?.name || event.title, contact });
      profile.donations.push({
        id: `accounting-${event.id}`,
        category: 'money',
        date: event.occurred_at || event.created_at,
        concept: event.title || 'Donación monetaria',
        moneyAmount: Number(event.amount || 0),
        socialAmount: 0,
        status: event.status || 'active',
        sourceLabel: 'Contabilidad',
        notes: event.description || '',
        eventId: event.id,
        contactId: event.contact_id,
        documentLabel: ''
      });
    });

  (data.treasury_incomes || [])
    .filter((income) => normalize([income.category, income.concept].join(' ')).includes('donacion'))
    .forEach((income) => {
      const contact = contactsByName.get(normalize(income.donor));
      const profile = ensureProfile({ name: income.donor || income.concept || 'Donante', contact });
      profile.donations.push({
        id: `treasury-${income.id}`,
        category: 'money',
        date: income.income_at || income.created_at,
        concept: income.concept || 'Donación monetaria',
        moneyAmount: Number(income.amount || 0),
        socialAmount: 0,
        status: income.status || 'active',
        sourceLabel: 'Tesorería histórica',
        notes: income.notes || '',
        eventId: '',
        contactId: contact?.id || '',
        documentLabel: income.document_name || ''
      });
    });

  const donationIds = new Set((data.donations || []).map((donation) => donation.id));
  (data.donations || []).forEach((donation) => {
    const contact = contactsByName.get(normalize(donation.donor));
    const profile = ensureProfile({ name: donation.donor, contact, kind: donation.donor_kind });
    profile.donations.push({
      id: `donation-${donation.id}`,
      category: 'kind',
      date: donation.donated_at || donation.created_at,
      concept: donation.donation_type || 'Donación en especie',
      moneyAmount: 0,
      socialAmount: Number(donation.estimated_value || 0),
      status: donationStatus(donation),
      sourceLabel: 'Contabilidad / Donaciones en especie',
      notes: donation.notes || '',
      product: donation.donation_type || '',
      eventId: '',
      contactId: contact?.id || '',
      documentLabel: 'Certificado',
      rawDonation: donation
    });
  });

  (data.social_value_events || [])
    .filter((event) => event.value_type === 'received' && event.event_type === 'in_kind_donation' && !isVoidedRecord(event))
    .filter((event) => !(event.source_module === 'donations' && donationIds.has(event.source_record_id)))
    .forEach((event) => {
      const contact = contactsById.get(event.contact_id);
      const item = inventoryItemsById.get(event.inventory_item_id);
      const profile = ensureProfile({ name: contact?.name || item?.donor || 'Donante sin identificar', contact, kind: inferDonorKind(contact?.name || item?.donor) });
      profile.donations.push({
        id: `social-${event.id}`,
        category: 'kind',
        date: event.social_value_at || event.created_at,
        concept: item?.name || event.notes || 'Donación en especie',
        moneyAmount: 0,
        socialAmount: Number(event.amount || 0),
        status: event.status || 'active',
        sourceLabel: 'Valor social',
        notes: event.notes || '',
        product: item ? `${item.name}${item.lot ? ` - lote ${item.lot}` : ''}` : '',
        quantity: event.quantity,
        unit: event.unit || item?.unit || '',
        eventId: event.accounting_event_id || '',
        contactId: event.contact_id || ''
      });
    });

  const documentsByEvent = new Map();
  (data.accounting_documents || []).forEach((document) => {
    if (!document.accounting_event_id) return;
    if (!documentsByEvent.has(document.accounting_event_id)) documentsByEvent.set(document.accounting_event_id, []);
    documentsByEvent.get(document.accounting_event_id).push(document);
  });

  const eventIdsByProfile = new Map();
  profiles.forEach((profile) => {
    profile.donations.forEach((donation) => {
      if (!donation.eventId) return;
      if (!eventIdsByProfile.has(profile.id)) eventIdsByProfile.set(profile.id, new Set());
      eventIdsByProfile.get(profile.id).add(donation.eventId);
    });
  });

  (data.accounting_documents || []).forEach((document) => {
    profiles.forEach((profile) => {
      const eventIds = eventIdsByProfile.get(profile.id) || new Set();
      if (document.contact_id && profile.contact?.id === document.contact_id) profile.documents.push(document);
      else if (document.accounting_event_id && eventIds.has(document.accounting_event_id)) profile.documents.push(document);
    });
  });

  profiles.forEach((profile) => {
    profile.donations = dedupeById(profile.donations)
      .map((donation) => {
        const document = donation.eventId ? (documentsByEvent.get(donation.eventId) || [])[0] : null;
        return { ...donation, documentLabel: donation.documentLabel || document?.file_name || document?.document_number || '' };
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    profile.documents = dedupeById(profile.documents);
    profile.communications = relatedCommunications(profile, data.email_logs || []);
    completeProfileMetrics(profile);
  });

  return [...profiles.values()]
    .filter((profile) => profile.donations.length || profile.contact)
    .sort((a, b) => String(b.lastDonation || '').localeCompare(String(a.lastDonation || '')) || a.name.localeCompare(b.name));
}

function completeProfileMetrics(profile) {
  const activeDonations = profile.donations.filter((donation) => !isVoidedRecord(donation));
  profile.totalDonations = activeDonations.length;
  profile.moneyDonated = activeDonations.reduce((total, donation) => total + Number(donation.moneyAmount || 0), 0);
  profile.socialDonated = activeDonations.reduce((total, donation) => total + Number(donation.socialAmount || 0), 0);
  profile.pendingDonations = activeDonations.filter(isPendingDonation).length;
  const dates = activeDonations.map((donation) => donation.date).filter(Boolean).sort();
  profile.firstDonation = dates[0] || '';
  profile.lastDonation = dates[dates.length - 1] || '';
  profile.isActive = profile.isActive && profile.totalDonations > 0;
}

function buildDonorStats(profiles) {
  return profiles.reduce((stats, profile) => {
    stats.totalDonors += 1;
    if (profile.isActive) stats.activeDonors += 1;
    if (normalize(profile.kind) === 'empresa') stats.companies += 1;
    if (normalize(profile.kind) === 'particular') stats.individuals += 1;
    if (normalize(profile.kind) === 'iglesia') stats.churches += 1;
    stats.socialReceived += Number(profile.socialDonated || 0);
    stats.moneyReceived += Number(profile.moneyDonated || 0);
    return stats;
  }, { totalDonors: 0, activeDonors: 0, companies: 0, individuals: 0, churches: 0, socialReceived: 0, moneyReceived: 0 });
}

function relatedCommunications(profile, emailLogs) {
  const name = normalize(profile.name);
  const email = normalize(profile.email);
  return emailLogs.filter((log) => {
    const recipient = normalize(log.recipient);
    const subject = normalize(log.subject);
    return (email && recipient.includes(email)) || (name && (recipient.includes(name) || subject.includes(name)));
  }).sort((a, b) => String(b.sent_at || b.created_at || '').localeCompare(String(a.sent_at || a.created_at || '')));
}

function dedupeById(items) {
  return [...new Map(items.filter(Boolean).map((item) => [item.id, item])).values()];
}

function normalizeKind(kind) {
  const normalized = normalize(kind);
  if (!normalized) return 'Particular';
  if (normalized.includes('empresa')) return 'Empresa';
  if (normalized.includes('iglesia') || normalized.includes('parroquia')) return 'Iglesia';
  if (normalized.includes('asociacion')) return 'Asociacion';
  if (normalized.includes('fundacion')) return 'Fundacion';
  if (normalized.includes('administracion') || normalized.includes('ayuntamiento')) return 'Administracion';
  if (normalized.includes('anonimo')) return 'Anonimo';
  if (normalized.includes('entidad')) return 'Entidad';
  return kind || 'Particular';
}

function inferDonorKind(name = '') {
  const value = normalize(name);
  if (value.includes('iglesia') || value.includes('parroquia')) return 'Iglesia';
  if (value.includes('fundacion')) return 'Fundacion';
  if (value.includes('asociacion')) return 'Asociacion';
  if (value.includes('ayuntamiento') || value.includes('administracion')) return 'Administracion';
  if (/\b(sl|s l|sa|s a)\b/.test(value) || value.includes('empresa')) return 'Empresa';
  if (value.includes('anonimo')) return 'Anonimo';
  return 'Particular';
}

function isPendingDonation(donation) {
  if (donation?.is_pending === true) return true;
  return isPendingStatus(donation?.status || donation?.state || donation?.delivery_status);
}

function isPendingStatus(status) {
  const normalized = normalize(status || '');
  return ['pendiente', 'pending', 'solicitada', 'comprometida'].includes(normalized);
}

function donationStatus(donation) {
  return isPendingDonation(donation) ? 'Pendiente' : donation.status || donation.state || 'Registrada';
}

function isVoidedRecord(record) {
  const status = normalize(record?.status || record?.state || '');
  return ['voided', 'anulada', 'anulado', 'reversed', 'cancelled', 'cancelada', 'cancelado'].includes(status);
}

function formatQuantity(item) {
  if (!item.quantity) return '-';
  return `${Number(item.quantity)} ${item.unit || ''}`.trim();
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}
