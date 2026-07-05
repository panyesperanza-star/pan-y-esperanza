import { Download, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { DeletionRequestForm } from '../components/DeletionRequestForm';
import { DirectDeletionForm } from '../components/DirectDeletionForm';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion } from '../lib/auth';
import { printDonationCertificatePdf } from '../lib/exporters';
import { formatDate, normalize, todayISO } from '../lib/formatters';

export function Donations({ data, actions, currentUser, navigationTarget }) {
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Todas');
  const [deletionTarget, setDeletionTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const canCreate = canDo(currentUser, 'donations', 'create');
  const organization = data.organization_settings?.[0] || {};
  const canDeleteDirectly = canDeleteDefinitively(currentUser, 'donations', organization);
  const canDelete = canDeleteDirectly || canRequestDefinitiveDeletion(currentUser, 'donations', organization);
  const visibleDonations = useMemo(() => {
    if (statusFilter === 'Pendientes') return data.donations.filter(isPendingDonation);
    return data.donations;
  }, [data.donations, statusFilter]);

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'donations') return;
    if (navigationTarget.filter === 'pending-donations') setStatusFilter('Pendientes');
    else if (!navigationTarget.filter) setStatusFilter('Todas');
  }, [navigationTarget]);

  async function sendDeletionRequest(item, payload) {
    await actions.createDeletionRequest({
      module: 'donations',
      record_type: 'donation',
      record_id: item.id,
      record_label: `${item.donor || 'Donacion'} - ${item.donation_type || ''}`.trim(),
      reason: payload.reason,
      notes: payload.notes,
      relations: buildDonationRelationWarnings(item)
    });
    setDeletionTarget(null);
    setNotice('Solicitud de eliminacion enviada al proveedor del sistema.');
  }

  async function deletePermanently(item) {
    await actions.deleteDonation(item.id);
    setDeletionTarget(null);
    setNotice('Donacion eliminada definitivamente.');
  }

  return (
    <>
      <PageHeader title="Donaciones" description="Registro de donaciones y certificados PDF." actions={canCreate ? <Button onClick={() => setOpen(true)}><Plus size={18} /> Nueva donacion</Button> : null} />
      {notice && <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">{notice}</div>}
      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <label className="block max-w-xs">
          <span className="sr-only">Filtrar donaciones</span>
          <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>Todas</option>
            <option>Pendientes</option>
          </select>
        </label>
      </section>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th>Donante</th><th>Tipo donante</th><th>Donacion</th><th>Valor</th><th>Estado</th><th className="text-right pr-4">Acciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{visibleDonations.map((item) => <tr key={item.id}><td className="px-4 py-3">{formatDate(item.donated_at)}</td><td>{item.donor}</td><td>{item.donor_kind}</td><td>{item.donation_type}</td><td>{item.estimated_value} EUR</td><td>{donationStatus(item)}</td><td className="pr-4"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => printDonationCertificatePdf(item, data.organization_settings?.[0])}><Download size={16} /> Certificado</Button>{canDelete && <Button variant="danger" onClick={() => setDeletionTarget(item)}><Trash2 size={16} /> {canDeleteDirectly ? 'Eliminar' : 'Solicitar'}</Button>}</div></td></tr>)}</tbody>
        </table>
        {!visibleDonations.length && <p className="p-5 text-sm text-slate-500">No hay donaciones con los filtros seleccionados.</p>}
      </div>
      {open && <Modal title="Nueva donacion" onClose={() => setOpen(false)}><DonationForm onSubmit={async (payload) => { await actions.createDonation(payload); setOpen(false); }} /></Modal>}
      {deletionTarget && (
        <Modal title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminacion definitiva'} onClose={() => setDeletionTarget(null)}>
          {canDeleteDirectly ? (
            <DirectDeletionForm
              recordLabel={`${deletionTarget.donor || 'Donacion'} - ${deletionTarget.donation_type || ''}`.trim()}
              relations={buildDonationRelationWarnings(deletionTarget)}
              onCancel={() => setDeletionTarget(null)}
              onConfirm={() => deletePermanently(deletionTarget)}
            />
          ) : (
            <DeletionRequestForm
              recordLabel={`${deletionTarget.donor || 'Donacion'} - ${deletionTarget.donation_type || ''}`.trim()}
              relations={buildDonationRelationWarnings(deletionTarget)}
              onCancel={() => setDeletionTarget(null)}
              onSubmit={(payload) => sendDeletionRequest(deletionTarget, payload)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function buildDonationRelationWarnings(donation) {
  const relations = [];
  if (donation?.estimated_value) relations.push(`Valor estimado: ${donation.estimated_value} EUR`);
  if (donation?.donor) relations.push(`Donante: ${donation.donor}`);
  if (donation?.status || donation?.state) relations.push(`Estado: ${donation.status || donation.state}`);
  return relations;
}

function isPendingDonation(donation) {
  if (donation.is_pending === true) return true;
  const status = normalize(donation.status || donation.state || donation.delivery_status || '');
  return ['pendiente', 'pending', 'solicitada', 'comprometida'].includes(status);
}

function donationStatus(donation) {
  return isPendingDonation(donation) ? 'Pendiente' : donation.status || donation.state || 'Registrada';
}

function DonationForm({ onSubmit }) {
  const [form, setForm] = useState({ donor: '', donor_kind: 'Particular', donation_type: 'Alimentos', donated_at: todayISO(), estimated_value: 0, notes: '' });
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
    <FormField label="Donante"><input className={inputClass} required value={form.donor} onChange={(event) => update('donor', event.target.value)} /></FormField>
    <FormField label="Tipo donante"><select className={inputClass} value={form.donor_kind} onChange={(event) => update('donor_kind', event.target.value)}><option>Particular</option><option>Empresa</option></select></FormField>
    <FormField label="Tipo donacion"><input className={inputClass} value={form.donation_type} onChange={(event) => update('donation_type', event.target.value)} /></FormField>
    <FormField label="Fecha"><input className={inputClass} type="date" value={form.donated_at} onChange={(event) => update('donated_at', event.target.value)} /></FormField>
    <FormField label="Valor estimado"><input className={inputClass} type="number" min="0" value={form.estimated_value} onChange={(event) => update('estimated_value', Number(event.target.value))} /></FormField>
    <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
    <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar donacion</Button></div>
  </form>;
}
