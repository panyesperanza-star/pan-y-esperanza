import { Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { printDonationCertificatePdf } from '../lib/exporters';
import { formatDate, todayISO } from '../lib/formatters';

const tabs = ['Donaciones', 'Donantes y colaboradores'];
const donorTypes = ['Empresa', 'Iglesia', 'Supermercado', 'Particular'];

export function Donations({ data, actions }) {
  const [tab, setTab] = useState('Donaciones');
  const [modal, setModal] = useState(null);
  const [viewing, setViewing] = useState(null);
  const donorStats = useMemo(() => calculateDonorStats(data), [data]);

  return (
    <>
      <PageHeader
        title="Donaciones"
        description="Gestion de donaciones, donantes, colaboradores e historial completo."
        actions={<Button onClick={() => setModal({ type: tab })}><Plus size={18} /> Nuevo registro</Button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Donantes registrados" value={(data.donors || []).length} />
        <StatCard label="Donaciones recibidas" value={(data.donations || []).length} />
        <StatCard label="Valor estimado donado" value={`${donorStats.totalValue.toFixed(2)} EUR`} />
        <StatCard label="Colaboradores activos" value={donorStats.activeDonors} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${tab === item ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-brand-50'}`}>{item}</button>)}
      </div>

      {tab === 'Donaciones' && <DonationsTable rows={data.donations || []} organization={data.organization_settings?.[0]} actions={actions} />}
      {tab === 'Donantes y colaboradores' && <DonorsTable donors={data.donors || []} donations={data.donations || []} actions={actions} onView={setViewing} onEdit={(item) => setModal({ type: 'Donantes y colaboradores', item })} />}

      {modal?.type === 'Donaciones' && <Modal title="Nueva donacion" onClose={() => setModal(null)}><DonationForm donors={data.donors || []} onSubmit={async (payload) => { await actions.createDonation(payload); setModal(null); }} /></Modal>}
      {modal?.type === 'Donantes y colaboradores' && <Modal title={modal.item ? 'Editar donante' : 'Nuevo donante'} onClose={() => setModal(null)}><DonorForm initial={modal.item} onSubmit={async (payload) => { modal.item ? await actions.updateDonor(modal.item.id, payload) : await actions.createDonor(payload); setModal(null); }} /></Modal>}
      {viewing && <Modal title="Ficha de donante y colaborador" onClose={() => setViewing(null)} wide><DonorProfile donor={viewing} donations={(data.donations || []).filter((item) => item.donor === viewing.name)} /></Modal>}
    </>
  );
}

function DonationsTable({ rows, organization, actions }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th>Donante</th><th>Tipo donante</th><th>Donacion</th><th>Valor</th><th>Observaciones</th><th className="text-right pr-4">Acciones</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((item) => <tr key={item.id}><td className="px-4 py-3">{formatDate(item.donated_at)}</td><td>{item.donor}</td><td>{item.donor_kind}</td><td>{item.donation_type}</td><td>{Number(item.estimated_value || 0).toFixed(2)} EUR</td><td>{item.notes || '-'}</td><td className="pr-4"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => printDonationCertificatePdf(item, organization)}><Download size={16} /> Certificado</Button><Button variant="danger" onClick={() => actions.deleteDonation(item.id)}><Trash2 size={16} /></Button></div></td></tr>)}
          {!rows.length && <tr><td colSpan="7" className="px-4 py-6 text-center text-slate-500">No hay donaciones registradas.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function DonorsTable({ donors, donations, actions, onView, onEdit }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {donors.map((donor) => {
        const history = donations.filter((item) => item.donor === donor.name);
        const total = history.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
        return <article key={donor.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-bold text-ink">{donor.name}</h3><p className="text-sm text-slate-500">{donor.donor_type}</p></div>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => onView(donor)}><Eye size={16} /> Ficha</Button><Button variant="secondary" onClick={() => onEdit(donor)}><Pencil size={16} /></Button><Button variant="danger" onClick={() => actions.deleteDonor(donor.id)}><Trash2 size={16} /></Button></div>
          </div>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p>Contacto: {donor.contact_name || '-'}</p>
            <p>Telefono: {donor.phone || '-'}</p>
            <p>Correo: {donor.email || '-'}</p>
            <p>Donaciones realizadas: {history.length}</p>
            <p>Valor historico: {total.toFixed(2)} EUR</p>
            {donor.notes && <p className="rounded-md bg-slate-50 p-2">{donor.notes}</p>}
          </div>
        </article>;
      })}
      {!donors.length && <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-panel">No hay donantes ni colaboradores registrados.</div>}
    </div>
  );
}

function DonorProfile({ donor, donations }) {
  const total = donations.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <ProfileStat label="Tipo" value={donor.donor_type} />
      <ProfileStat label="Donaciones" value={donations.length} />
      <ProfileStat label="Valor historico" value={`${total.toFixed(2)} EUR`} />
      <ProfileStat label="Valor previsto" value={`${Number(donor.estimated_value || 0).toFixed(2)} EUR`} />
    </section>
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="font-bold text-ink">{donor.name}</h3>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <p><strong>Contacto:</strong> {donor.contact_name || '-'}</p>
        <p><strong>Telefono:</strong> {donor.phone || '-'}</p>
        <p><strong>Correo:</strong> {donor.email || '-'}</p>
        <p><strong>Tipo:</strong> {donor.donor_type || '-'}</p>
      </div>
      {donor.notes && <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{donor.notes}</p>}
    </section>
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="font-bold text-ink">Historial de donaciones</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Fecha</th><th>Tipo</th><th>Valor</th><th>Observaciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{donations.map((item) => <tr key={item.id}><td className="px-3 py-2">{formatDate(item.donated_at)}</td><td>{item.donation_type}</td><td>{Number(item.estimated_value || 0).toFixed(2)} EUR</td><td>{item.notes || '-'}</td></tr>)}{!donations.length && <tr><td colSpan="4" className="px-3 py-5 text-center text-slate-500">Sin donaciones registradas para este donante.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  </div>;
}

function ProfileStat({ label, value }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-ink">{value || '-'}</p></div>;
}

function DonationForm({ donors, onSubmit }) {
  const [form, setForm] = useState({ donor: donors[0]?.name || '', donor_kind: donors[0]?.donor_type || 'Particular', donation_type: 'Alimentos', donated_at: todayISO(), estimated_value: 0, notes: '' });
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));
  const selectDonor = (name) => {
    const donor = donors.find((item) => item.name === name);
    setForm((state) => ({ ...state, donor: name, donor_kind: donor?.donor_type || state.donor_kind }));
  };
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
    <FormField label="Donante"><input className={inputClass} list="donor-list" required value={form.donor} onChange={(event) => selectDonor(event.target.value)} /><datalist id="donor-list">{donors.map((item) => <option key={item.id} value={item.name} />)}</datalist></FormField>
    <FormField label="Tipo donante"><select className={inputClass} value={form.donor_kind} onChange={(event) => update('donor_kind', event.target.value)}>{donorTypes.map((item) => <option key={item}>{item}</option>)}</select></FormField>
    <FormField label="Tipo donacion"><input className={inputClass} value={form.donation_type} onChange={(event) => update('donation_type', event.target.value)} /></FormField>
    <FormField label="Fecha"><input className={inputClass} type="date" value={form.donated_at} onChange={(event) => update('donated_at', event.target.value)} /></FormField>
    <FormField label="Valor estimado"><input className={inputClass} type="number" min="0" step="0.01" value={form.estimated_value} onChange={(event) => update('estimated_value', Number(event.target.value))} /></FormField>
    <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
    <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar donacion</Button></div>
  </form>;
}

function DonorForm({ initial, onSubmit }) {
  const [form, setForm] = useState(initial || { name: '', contact_name: '', phone: '', email: '', donor_type: 'Empresa', estimated_value: 0, notes: '' });
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
    <FormField label="Nombre"><input className={inputClass} required value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField>
    <FormField label="Tipo de donante"><select className={inputClass} value={form.donor_type} onChange={(event) => update('donor_type', event.target.value)}>{donorTypes.map((item) => <option key={item}>{item}</option>)}</select></FormField>
    <FormField label="Contacto"><input className={inputClass} value={form.contact_name} onChange={(event) => update('contact_name', event.target.value)} /></FormField>
    <FormField label="Telefono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
    <FormField label="Correo"><input className={inputClass} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
    <FormField label="Valor estimado historico"><input className={inputClass} type="number" min="0" step="0.01" value={form.estimated_value} onChange={(event) => update('estimated_value', Number(event.target.value))} /></FormField>
    <div className="sm:col-span-2"><FormField label="Observaciones"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
    <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar donante</Button></div>
  </form>;
}

function calculateDonorStats(data) {
  const donationValue = (data.donations || []).reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const donorValue = (data.donors || []).reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  return {
    totalValue: Math.max(donationValue, donorValue),
    activeDonors: new Set((data.donations || []).map((item) => item.donor)).size
  };
}
