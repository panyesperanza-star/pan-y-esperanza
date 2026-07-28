import { Building2, Edit3, KeyRound, Mail, Plus, Power, PowerOff, Printer, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { CredentialPhotoPicker, CredentialPhotoPreview } from '../components/CredentialPhotoPicker';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { OfficialCredentialButton } from '../components/OfficialCredential';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { printPortalAccessPdf } from '../lib/exporters';
import { formatDateTime, normalize } from '../lib/formatters';

const TYPES = ['Empresa', 'Comercio', 'Asociación', 'Particular', 'Institución'];
const STATUSES = ['Activo', 'Inactivo', 'En seguimiento'];

export function Collaborators({ data, actions, currentUser }) {
  const [modal, setModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [portalFilter, setPortalFilter] = useState('');
  const [notice, setNotice] = useState('');
  const collaborators = useMemo(() => enrichCollaborators(data.collaborators || [], data), [data]);
  const filtered = useMemo(() => filterCollaborators(collaborators, { searchTerm, typeFilter, portalFilter }), [collaborators, searchTerm, typeFilter, portalFilter]);
  const canCreate = canDo(currentUser, 'collaborators', 'create');
  const canEdit = canDo(currentUser, 'collaborators', 'edit');
  const canActivate = canDo(currentUser, 'collaborators', 'activate');
  const canGenerateCredential = canDo(currentUser, 'collaborators', 'generate-credential');
  const canPrint = canDo(currentUser, 'collaborators', 'print');
  const canSend = canDo(currentUser, 'collaborators', 'send');

  async function saveCollaborator(payload, current = null) {
    if (current) await actions.updateCollaborator(current.id, payload);
    else await actions.createCollaborator(payload);
    setModal(null);
    setNotice(current ? 'Colaborador actualizado correctamente.' : 'Colaborador creado con portal preparado.');
  }

  async function activatePortal(collaborator) {
    await actions.activateCollaboratorPortal(collaborator.id);
    setNotice(`Portal activado para ${collaborator.name}.`);
  }

  async function deactivatePortal(collaborator) {
    await actions.deactivateCollaboratorPortal(collaborator.id);
    setNotice(`Portal desactivado para ${collaborator.name}.`);
  }

  async function resendAccess(collaborator) {
    await actions.resendCollaboratorAccess(collaborator.id);
    setNotice(`Acceso reenviado a ${collaborator.access_email || collaborator.email}.`);
  }

  async function printAccess(collaborator) {
    await printPortalAccessPdf({
      portalLabel: 'Portal del Colaborador',
      name: collaborator.name,
      code: collaborator.code,
      email: collaborator.access_email || collaborator.email,
      accessUrl: `${window.location.origin}/portal-colaboradores`,
      organization: data.organization_settings?.[0] || {}
    });
    setNotice(`Documento de acceso generado para ${collaborator.name}.`);
  }

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description="Empresas, comercios, asociaciones, particulares e instituciones con portal propio."
        actions={canCreate && <Button onClick={() => setModal({ type: 'create' })}><Plus size={18} /> Nuevo colaborador</Button>}
      />

      {notice && (
        <div className="mb-4 rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          {notice}
        </div>
      )}

      <section className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-panel lg:grid-cols-[1fr_200px_220px]">
        <FormField label="Buscar colaborador">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Codigo, nombre, email, telefono o CIF/NIF"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </FormField>
        <FormField label="Tipo">
          <select className={inputClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Todos</option>
            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </FormField>
        <FormField label="Portal">
          <select className={inputClass} value={portalFilter} onChange={(event) => setPortalFilter(event.target.value)}>
            <option value="">Todos</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </FormField>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Colaboradores" value={collaborators.length} />
        <MetricCard label="Portales activos" value={collaborators.filter((item) => item.portalActive).length} />
        <MetricCard label="Donaciones vinculadas" value={(data.donations || []).filter((item) => item.collaborator_id).length} />
      </section>

      <section className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Portal del colaborador</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((collaborator) => (
                <tr key={collaborator.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <CredentialPhotoPreview
                        value={collaborator.photo_data_url}
                        label={`Foto de ${collaborator.name}`}
                        fallback={(
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                            <Building2 size={18} />
                          </div>
                        )}
                      />
                      <div>
                        <p className="font-bold text-ink">{collaborator.name}</p>
                        <p className="mt-1 text-xs font-semibold text-brand-700">{collaborator.code || '-'}</p>
                        <p className="mt-1 text-xs text-slate-500">CIF/NIF: {collaborator.tax_id || 'No indicado'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{collaborator.type || '-'}</td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold">{collaborator.contact_name || '-'}</p>
                    <p>{collaborator.email || '-'}</p>
                    <p>{collaborator.phone || '-'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={collaborator.status || 'Activo'} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Portal</span>
                        <PortalBadge active={collaborator.portalActive} />
                      </div>
                      <p className="text-xs text-slate-600">Email: {collaborator.access_email || collaborator.email || '-'}</p>
                      <p className="text-xs text-slate-600">Ultimo acceso: {collaborator.lastAccess ? formatDateTime(collaborator.lastAccess) : '-'}</p>
                      <p className="text-xs text-slate-600">Ultimo OTP: {collaborator.lastOtp ? formatDateTime(collaborator.lastOtp) : '-'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canGenerateCredential && <OfficialCredentialButton kind="collaborator" subject={collaborator} />}
                      {canEdit && <Button variant="secondary" onClick={() => setModal({ type: 'edit', collaborator })}><Edit3 size={16} /> Editar</Button>}
                      {canPrint && <Button variant="secondary" onClick={() => printAccess(collaborator)}><Printer size={16} /> Imprimir acceso</Button>}
                      {canSend && collaborator.portalActive && <Button variant="secondary" onClick={() => resendAccess(collaborator)}><Mail size={16} /> Reenviar acceso</Button>}
                      {canActivate && collaborator.portalActive && <Button variant="secondary" onClick={() => deactivatePortal(collaborator)}><PowerOff size={16} /> Desactivar portal</Button>}
                      {canActivate && !collaborator.portalActive && <Button variant="secondary" onClick={() => activatePortal(collaborator)}><Power size={16} /> Activar portal</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                    {collaborators.length ? 'No hay colaboradores que coincidan con los filtros.' : 'Todavía no hay colaboradores registrados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal?.type === 'create' && (
        <Modal title="Nuevo colaborador" onClose={() => setModal(null)} wide>
          <CollaboratorForm onSubmit={(payload) => saveCollaborator(payload)} />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title="Editar colaborador" onClose={() => setModal(null)} wide>
          <CollaboratorForm initial={modal.collaborator} onSubmit={(payload) => saveCollaborator(payload, modal.collaborator)} />
        </Modal>
      )}
    </>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
    </article>
  );
}

function CollaboratorForm({ initial = null, onSubmit }) {
  const [form, setForm] = useState({
    type: initial?.type || 'Empresa',
    name: initial?.name || '',
    tax_id: initial?.tax_id || '',
    contact_name: initial?.contact_name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    address: initial?.address || '',
    status: initial?.status || 'Activo',
    photo_data_url: initial?.photo_data_url || '',
    notes: initial?.notes || ''
  });
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Tipo" required>
          <select className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value)}>
            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </FormField>
        <FormField label="Estado">
          <select className={inputClass} value={form.status} onChange={(event) => update('status', event.target.value)}>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Nombre" required>
          <input className={inputClass} value={form.name} onChange={(event) => update('name', event.target.value)} />
        </FormField>
        <FormField label="CIF/NIF (si procede)">
          <input className={inputClass} value={form.tax_id} onChange={(event) => update('tax_id', event.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Persona de contacto">
          <input className={inputClass} value={form.contact_name} onChange={(event) => update('contact_name', event.target.value)} />
        </FormField>
        <FormField label="Email" required>
          <input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <FormField label="Telefono">
          <input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} />
        </FormField>
      </div>

      <FormField label="Direccion">
        <input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} />
      </FormField>

      <CredentialPhotoPicker
        value={form.photo_data_url}
        onChange={(value) => update('photo_data_url', value)}
        description="Esta foto se utilizará en la credencial oficial del colaborador."
      />

      <FormField label="Observaciones">
        <textarea className={`${inputClass} min-h-28`} value={form.notes} onChange={(event) => update('notes', event.target.value)} />
      </FormField>

      <div className="rounded-md border border-brand-100 bg-brand-50 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 text-brand-700" size={18} />
          <div>
            <p className="font-bold text-brand-800">Portal del colaborador</p>
            <p className="mt-1 text-sm text-brand-700">
              Al guardar la ficha se crea el registro del portal. El acceso se activa manualmente desde el listado.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar colaborador'}</Button>
      </div>
    </form>
  );
}

function StatusBadge({ status }) {
  const tone = normalize(status).includes('inactivo') ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-700';
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function PortalBadge({ active }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function enrichCollaborators(collaborators, data) {
  const sessions = data.portal_sessions || [];
  const otps = data.collaborator_portal_otps || [];
  return collaborators
    .map((collaborator) => {
      const ownSessions = sessions.filter((session) => session.portal === 'collaborator' && session.subject_id === collaborator.id);
      const ownOtps = otps.filter((otp) => otp.collaborator_id === collaborator.id);
      const lastAccess = [
        collaborator.last_access_at,
        collaborator.last_login_at,
        ...ownSessions.map((session) => session.last_seen_at || session.started_at)
      ].filter(Boolean).sort().at(-1);
      const lastOtp = [
        collaborator.last_otp_sent_at,
        ...ownOtps.map((otp) => otp.created_at)
      ].filter(Boolean).sort().at(-1);
      return {
        ...collaborator,
        photo_data_url: collaborator.photo_data_url || '',
        portalActive: collaborator.is_active !== false,
        lastAccess,
        lastOtp
      };
    })
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'es', { numeric: true }));
}

function filterCollaborators(collaborators, filters) {
  const search = normalize(filters.searchTerm);
  return collaborators
    .filter((collaborator) => !filters.typeFilter || collaborator.type === filters.typeFilter)
    .filter((collaborator) => {
      if (filters.portalFilter === 'active') return collaborator.portalActive;
      if (filters.portalFilter === 'inactive') return !collaborator.portalActive;
      return true;
    })
    .filter((collaborator) => {
      if (!search) return true;
      return [
        collaborator.code,
        collaborator.type,
        collaborator.name,
        collaborator.tax_id,
        collaborator.contact_name,
        collaborator.email,
        collaborator.phone,
        collaborator.address,
        collaborator.status,
        collaborator.notes
      ].some((value) => normalize(value).includes(search));
    });
}
