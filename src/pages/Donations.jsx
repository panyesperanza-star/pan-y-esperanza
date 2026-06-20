import { Download, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { printDonationCertificatePdf } from '../lib/exporters';
import { formatDate, todayISO } from '../lib/formatters';

export function Donations({ data, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Donaciones" description="Registro de donaciones y certificados PDF." actions={<Button onClick={() => setOpen(true)}><Plus size={18} /> Nueva donacion</Button>} />
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th>Donante</th><th>Tipo donante</th><th>Donacion</th><th>Valor</th><th className="text-right pr-4">Acciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{data.donations.map((item) => <tr key={item.id}><td className="px-4 py-3">{formatDate(item.donated_at)}</td><td>{item.donor}</td><td>{item.donor_kind}</td><td>{item.donation_type}</td><td>{item.estimated_value} EUR</td><td className="pr-4"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => printDonationCertificatePdf(item, data.organization_settings?.[0])}><Download size={16} /> Certificado</Button><Button variant="danger" onClick={() => actions.deleteDonation(item.id)}><Trash2 size={16} /></Button></div></td></tr>)}</tbody>
        </table>
      </div>
      {open && <Modal title="Nueva donacion" onClose={() => setOpen(false)}><DonationForm onSubmit={async (payload) => { await actions.createDonation(payload); setOpen(false); }} /></Modal>}
    </>
  );
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
