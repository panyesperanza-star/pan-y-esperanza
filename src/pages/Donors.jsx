import { CalendarDays, Edit3, Eye, FileText, Heart, Mail, MapPin, Phone, Plus, Power, PowerOff, Printer, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { CredentialPhotoPicker, CredentialPhotoPreview } from '../components/CredentialPhotoPicker';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { OfficialCredentialButton } from '../components/OfficialCredential';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { printPortalAccessPdf } from '../lib/exporters';
import { formatDate, formatDateTime, normalize } from '../lib/formatters';

const TYPES = ['Particular', 'Empresa', 'Comercio', 'Asociación', 'Institución'];
const STATUSES = ['Activo', 'Inactivo', 'En seguimiento'];

export function Donors({ data, actions, currentUser }) {
  const [modal, setModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [portalFilter, setPortalFilter] = useState('');
  const [notice, setNotice] = useState('');
  const donors = useMemo(() => enrichDonors(data.donors || [], data), [data]);
  const filtered = useMemo(() => filterDonors(donors, { searchTerm, typeFilter, portalFilter }), [donors, searchTerm, typeFilter, portalFilter]);
  const canCreate = canDo(currentUser, 'donors', 'create');
  const canEdit = canDo(currentUser, 'donors', 'edit');

  async function saveDonor(payload, current = null) {
    if (current) await actions.updateDonor(current.id, payload);
    else await actions.createDonor(payload);
    setModal(null);
    setNotice(current ? 'Donante actualizado correctamente.' : 'Donante creado con portal preparado.');
  }

  async function activatePortal(donor) {
    await actions.activateDonorPortal(donor.id);
    setNotice(`Portal activado para ${donor.name}.`);
  }

  async function deactivatePortal(donor) {
    await actions.deactivateDonorPortal(donor.id);
    setNotice(`Portal desactivado para ${donor.name}.`);
  }

  async function resendAccess(donor) {
    await actions.resendDonorAccess(donor.id);
    setNotice(`Acceso reenviado a ${donor.access_email || donor.email}.`);
  }

  async function printAccess(donor) {
    await printPortalAccessPdf({
      portalLabel: 'Portal del Donante',
      name: donor.name,
      code: donor.code,
      email: donor.access_email || donor.email,
      accessUrl: `${window.location.origin}/portal-donaciones`,
      organization: data.organization_settings?.[0] || {}
    });
    setNotice(`Documento de acceso generado para ${donor.name}.`);
  }

  return (
    <>
      <PageHeader
        title="Donantes"
        description="Personas donantes con portal propio, historial unificado y certificados."
        actions={canCreate && <Button onClick={() => setModal({ type: 'create' })}><Plus size={18} /> Nuevo donante</Button>}
      />

      {notice && (
        <div className="mb-4 rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" role="status">
          {notice}
        </div>
      )}

      <section className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-panel lg:grid-cols-[1fr_200px_220px]">
        <FormField label="Buscar donante">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Codigo, nombre, email, telefono o direccion"
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
        <MetricCard label="Donantes" value={donors.length} />
        <MetricCard label="Portales activos" value={donors.filter((item) => item.portalActive).length} />
        <MetricCard label="Donaciones vinculadas" value={(data.donations || []).filter((item) => item.donor_id).length} />
      </section>

      <section className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Donante</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Portal del donante</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((donor) => (
                <tr key={donor.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <CredentialPhotoPreview
                        value={donor.photo_data_url}
                        label={`Foto de ${donor.name}`}
                        fallback={(
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                            <Heart size={18} />
                          </div>
                        )}
                      />
                      <div>
                        <p className="font-bold text-ink">{donor.name}</p>
                        <p className="mt-1 text-xs font-semibold text-brand-700">{donor.code || '-'}</p>
                        <p className="mt-1 text-xs text-slate-500">{donor.donations.length} donacion(es) registradas</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{donor.type || '-'}</td>
                  <td className="px-4 py-4 text-slate-700">
                    <p>{donor.email || '-'}</p>
                    <p>{donor.phone || '-'}</p>
                    <p className="line-clamp-2">{donor.address || '-'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={donor.status || (donor.is_active === false ? 'Inactivo' : 'Activo')} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Portal</span>
                        <PortalBadge active={donor.portalActive} />
                      </div>
                      <p className="text-xs text-slate-600">Email: {donor.access_email || donor.email || '-'}</p>
                      <p className="text-xs text-slate-600">Ultimo acceso: {donor.lastAccess ? formatDateTime(donor.lastAccess) : '-'}</p>
                      <p className="text-xs text-slate-600">Historial: {donor.donations.length} donacion(es)</p>
                      <p className="text-xs text-slate-600">Certificados: {donor.certificates.length}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => setModal({ type: 'detail', donor })}><Eye size={16} /> Ficha</Button>
                      <OfficialCredentialButton kind="donor" subject={donor} />
                      {canEdit && <Button variant="secondary" onClick={() => setModal({ type: 'edit', donor })}><Edit3 size={16} /> Editar</Button>}
                      <Button variant="secondary" onClick={() => printAccess(donor)}><Printer size={16} /> Imprimir acceso</Button>
                      {canEdit && donor.portalActive && <Button variant="secondary" onClick={() => resendAccess(donor)}><Mail size={16} /> Reenviar acceso</Button>}
                      {canEdit && donor.portalActive && <Button variant="secondary" onClick={() => deactivatePortal(donor)}><PowerOff size={16} /> Desactivar</Button>}
                      {canEdit && !donor.portalActive && <Button variant="secondary" onClick={() => activatePortal(donor)}><Power size={16} /> Activar</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                    {donors.length ? 'No hay donantes que coincidan con los filtros.' : 'Todavía no hay donantes registrados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal?.type === 'create' && (
        <Modal title="Nuevo donante" onClose={() => setModal(null)} wide>
          <DonorForm onSubmit={(payload) => saveDonor(payload)} />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title="Editar donante" onClose={() => setModal(null)} wide>
          <DonorForm initial={modal.donor} onSubmit={(payload) => saveDonor(payload, modal.donor)} />
        </Modal>
      )}

      {modal?.type === 'detail' && (
        <Modal title={`Ficha del donante - ${modal.donor.code || modal.donor.name}`} onClose={() => setModal(null)} wide>
          <DonorDetail donor={modal.donor} onPrint={() => printAccess(modal.donor)} />
        </Modal>
      )}
    </>
  );
}

function DonorForm({ initial = null, onSubmit }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    address: initial?.address || '',
    type: initial?.type || 'Particular',
    status: initial?.status || 'Activo',
    photo_data_url: initial?.photo_data_url || initial?.impact?.credential_photo_data_url || '',
    notes: initial?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

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
        <FormField label="Nombre" required>
          <input className={inputClass} value={form.name} onChange={(event) => update('name', event.target.value)} />
        </FormField>
        <FormField label="Email" required>
          <input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
        </FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Telefono">
          <input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} />
        </FormField>
        <FormField label="Tipo">
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
      <FormField label="Direccion">
        <input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} />
      </FormField>
      <CredentialPhotoPicker
        value={form.photo_data_url}
        onChange={(value) => update('photo_data_url', value)}
        description="Esta foto se utilizará en la credencial oficial del donante."
      />
      <FormField label="Observaciones">
        <textarea className={`${inputClass} min-h-28`} value={form.notes} onChange={(event) => update('notes', event.target.value)} />
      </FormField>
      <div className="rounded-md border border-brand-100 bg-brand-50 p-4">
        <p className="font-bold text-brand-800">Portal del Donante</p>
        <p className="mt-1 text-sm text-brand-700">Al guardar la ficha se prepara el portal con acceso por email y OTP.</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar donante'}</Button>
      </div>
    </form>
  );
}

function DonorDetail({ donor, onPrint }) {
  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-2">
        <InfoCard icon={Heart} title="Datos del donante">
          {donor.photo_data_url && (
            <img src={donor.photo_data_url} alt={`Foto de ${donor.name}`} className="mb-3 h-24 w-24 rounded-md object-cover" />
          )}
          <InfoLine icon={FileText} label="Codigo" value={donor.code} />
          <InfoLine icon={Mail} label="Email" value={donor.email} />
          <InfoLine icon={Phone} label="Telefono" value={donor.phone} />
          <InfoLine icon={MapPin} label="Direccion" value={donor.address} />
        </InfoCard>
        <InfoCard icon={Power} title="Portal del Donante">
          <InfoLine icon={Power} label="Estado" value={donor.portalActive ? 'Activo' : 'Inactivo'} />
          <InfoLine icon={Mail} label="Email de acceso" value={donor.access_email || donor.email} />
          <InfoLine icon={CalendarDays} label="Ultimo acceso" value={donor.lastAccess ? formatDateTime(donor.lastAccess) : '-'} />
          <InfoLine icon={FileText} label="Certificados" value={donor.certificates.length} />
          <div className="mt-4 flex flex-wrap gap-2">
            <OfficialCredentialButton kind="donor" subject={donor} />
            <Button variant="secondary" onClick={onPrint}><Printer size={16} /> Imprimir acceso</Button>
          </div>
        </InfoCard>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <h3 className="font-bold text-ink">Historial</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Importe / cantidad</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {donor.donations.map((donation) => (
                <tr key={donation.id}>
                  <td className="px-3 py-2">{formatDate(donation.donated_at || donation.created_at)}</td>
                  <td className="px-3 py-2">{donation.donation_type || donation.concept || '-'}</td>
                  <td className="px-3 py-2">{donation.amount || donation.estimated_value || donation.quantity || '-'}</td>
                  <td className="px-3 py-2">{donation.status || donation.state || '-'}</td>
                </tr>
              ))}
              {!donor.donations.length && (
                <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={4}>No hay donaciones vinculadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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

function InfoCard({ icon: Icon, title, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={18} /></span>
        <h3 className="font-bold text-ink">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InfoLine({ icon: Icon, label, value }) {
  return (
    <p className="flex items-start gap-2 text-sm text-slate-600">
      <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
      <span><span className="font-semibold text-slate-700">{label}:</span> {value || '-'}</span>
    </p>
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

function enrichDonors(donors, data) {
  const sessions = data.portal_sessions || [];
  const otps = data.donor_portal_otps || [];
  const donations = data.donations || [];
  const certificates = data.donor_certificates || [];
  return donors
    .map((donor) => {
      const email = normalize(donor.email);
      const ownSessions = sessions.filter((session) => session.portal === 'donor' && session.subject_id === donor.id);
      const ownOtps = otps.filter((otp) => otp.donor_id === donor.id);
      const ownDonations = donations
        .filter((donation) => donation.donor_id === donor.id || normalize(donation.donor_email) === email || normalize(donation.donor) === normalize(donor.name))
        .sort((a, b) => String(b.donated_at || b.created_at || '').localeCompare(String(a.donated_at || a.created_at || '')));
      const lastAccess = [
        donor.last_access_at,
        donor.last_login_at,
        ...ownSessions.map((session) => session.last_seen_at || session.started_at)
      ].filter(Boolean).sort().at(-1);
      const lastOtp = [
        donor.last_otp_sent_at,
        ...ownOtps.map((otp) => otp.created_at)
      ].filter(Boolean).sort().at(-1);
      return {
        ...donor,
        photo_data_url: donor.photo_data_url || donor.impact?.credential_photo_data_url || '',
        portalActive: donor.is_active !== false,
        lastAccess,
        lastOtp,
        donations: ownDonations,
        certificates: certificates.filter((certificate) => certificate.donor_id === donor.id)
      };
    })
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'es', { numeric: true }));
}

function filterDonors(donors, filters) {
  const search = normalize(filters.searchTerm);
  return donors
    .filter((donor) => !filters.typeFilter || donor.type === filters.typeFilter)
    .filter((donor) => {
      if (filters.portalFilter === 'active') return donor.portalActive;
      if (filters.portalFilter === 'inactive') return !donor.portalActive;
      return true;
    })
    .filter((donor) => {
      if (!search) return true;
      return [
        donor.code,
        donor.type,
        donor.name,
        donor.email,
        donor.phone,
        donor.address,
        donor.status,
        donor.notes
      ].some((value) => normalize(value).includes(search));
    });
}
