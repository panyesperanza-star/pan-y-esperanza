import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

export function Volunteers({ data, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Voluntarios" description="Datos de contacto, disponibilidad y observaciones." actions={<Button onClick={() => setOpen(true)}><Plus size={18} /> Nuevo voluntario</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.volunteers.map((item) => <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel"><h3 className="font-bold">{item.full_name}</h3><p className="mt-2 text-sm text-slate-600">{item.document_id || '-'} · {item.phone} · {item.email}</p><p className="mt-2 text-sm"><strong>Formacion:</strong> {item.training || '-'}</p><p className="mt-2 text-sm"><strong>Disponibilidad:</strong> {item.availability || '-'}</p><p className="mt-2 text-sm"><strong>Documentacion:</strong> {item.documentation || '-'}</p>{item.notes && <p className="mt-2 text-sm text-slate-500">{item.notes}</p>}</article>)}</div>
      {open && <Modal title="Nuevo voluntario" onClose={() => setOpen(false)}><VolunteerForm onSubmit={async (payload) => { await actions.createVolunteer(payload); setOpen(false); }} /></Modal>}
    </>
  );
}

function VolunteerForm({ onSubmit }) {
  const [form, setForm] = useState({ full_name: '', document_id: '', phone: '', email: '', training: '', availability: '', documentation: '', notes: '' });
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><FormField label="Nombre"><input className={inputClass} required value={form.full_name} onChange={(event) => update('full_name', event.target.value)} /></FormField><FormField label="DNI"><input className={inputClass} value={form.document_id} onChange={(event) => update('document_id', event.target.value)} /></FormField><FormField label="Telefono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField><FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField><FormField label="Formacion"><input className={inputClass} value={form.training} onChange={(event) => update('training', event.target.value)} /></FormField><FormField label="Disponibilidad"><input className={inputClass} value={form.availability} onChange={(event) => update('availability', event.target.value)} /></FormField><FormField label="Documentacion"><input className={inputClass} value={form.documentation} onChange={(event) => update('documentation', event.target.value)} /></FormField><div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div><div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar</Button></div></form>;
}
