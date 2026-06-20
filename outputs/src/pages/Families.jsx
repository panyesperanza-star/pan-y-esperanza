import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

export function Families({ data, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Familias" description="Agrupa beneficiarios por unidad familiar y consulta su historial." actions={<Button onClick={() => setOpen(true)}><Plus size={18} /> Nueva familia</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.families.map((family) => {
          const members = data.beneficiaries.filter((item) => item.family_id === family.id);
          const minors = members.reduce((sum, item) => sum + Number(item.minors_count || 0), 0);
          const deliveries = data.deliveries.filter((delivery) => members.some((member) => member.id === delivery.beneficiary_id));
          return (
            <article key={family.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
              <h3 className="font-bold text-ink">{family.family_code} · {family.responsible_name}</h3>
              <p className="mt-2 text-sm text-slate-600">{family.address}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-slate-500">Miembros</dt><dd className="font-semibold">{members.length}</dd></div>
                <div><dt className="text-slate-500">Menores</dt><dd className="font-semibold">{minors}</dd></div>
                <div><dt className="text-slate-500">Dependientes</dt><dd className="font-semibold">{family.dependents_count || 0}</dd></div>
                <div><dt className="text-slate-500">Entregas</dt><dd className="font-semibold">{deliveries.length}</dd></div>
              </dl>
              <p className="mt-3 text-sm text-slate-600">{family.phone} · {family.email}</p>
              {family.notes && <p className="mt-2 text-sm text-slate-500">{family.notes}</p>}
            </article>
          );
        })}
      </div>
      {open && <Modal title="Nueva familia" onClose={() => setOpen(false)}><FamilyForm onSubmit={async (payload) => { await actions.createFamily(payload); setOpen(false); }} /></Modal>}
    </>
  );
}

function FamilyForm({ onSubmit }) {
  const [form, setForm] = useState({ family_code: `FAM-${String(Date.now()).slice(-4)}`, responsible_name: '', address: '', phone: '', email: '', dependents_count: 0, notes: '' });
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
    <FormField label="Codigo familiar"><input className={inputClass} value={form.family_code} onChange={(event) => update('family_code', event.target.value)} /></FormField>
    <FormField label="Responsable"><input className={inputClass} required value={form.responsible_name} onChange={(event) => update('responsible_name', event.target.value)} /></FormField>
    <FormField label="Direccion"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField>
    <FormField label="Telefono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
    <FormField label="Correo"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
    <FormField label="Dependientes"><input className={inputClass} type="number" min="0" value={form.dependents_count} onChange={(event) => update('dependents_count', Number(event.target.value))} /></FormField>
    <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
    <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar familia</Button></div>
  </form>;
}
