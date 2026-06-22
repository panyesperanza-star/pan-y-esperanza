import { Edit, FileText, Mail, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { BENEFICIARY_SITUATIONS, DOCUMENT_TYPES, HELP_TYPES } from '../lib/constants';
import { EMAIL_TEMPLATES, normalizeEmailError, saveEmailLog, sendEmailViaApi } from '../lib/emailClient';
import { formatDate, nextBeneficiaryCode, normalize, normalizeDocument, todayISO } from '../lib/formatters';
import { createReceiptEmailAttachments, printBeneficiaryPdf } from '../lib/exporters';

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
  notes: '',
  joined_at: todayISO(),
  is_active: true,
  last_help_at: null
};

export function Beneficiaries({ data, actions, currentUser }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [profile, setProfile] = useState(null);

  const activeCount = data.beneficiaries.filter((item) => item.is_active).length;
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return data.beneficiaries.filter((item) => normalize(`${item.full_name} ${item.document_id} ${item.code}`).includes(needle));
  }, [data.beneficiaries, query]);

  async function save(form) {
    if (form.id) await actions.updateBeneficiary(form.id, form);
    else await actions.createBeneficiary(form);
    setEditing(null);
  }

  return (
    <>
      <PageHeader
        title="Beneficiarios"
        description={`Beneficiarios activos: ${activeCount}. Codigos automaticos PYE mantenidos.`}
        actions={<Button onClick={() => setEditing({ ...emptyBeneficiary, code: nextBeneficiaryCode(data.beneficiaries) })}><Plus size={18} /> Nuevo beneficiario</Button>}
      />
      <div className="mb-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-panel">
        <Search size={18} className="text-slate-400" />
        <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nombre, DNI/NIE / NIE O PASAPORTE o codigo" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Codigo</th><th>Nombre</th><th>DNI/NIE / NIE O PASAPORTE</th><th>CP</th><th>Familia</th><th>Situacion</th><th>Estado</th><th>Ultima ayuda</th><th className="text-right pr-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const deliveries = data.deliveries.filter((delivery) => delivery.beneficiary_id === item.id);
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-bold text-brand-700">{item.code}</td>
                  <td>{item.full_name}</td>
                  <td>{item.document_id}</td>
                  <td>{item.postal_code}</td>
                  <td>{item.family_members} miembros / {item.minors_count} menores</td>
                  <td>{item.situation}</td>
                  <td><span className={`rounded-md px-2 py-1 text-xs font-bold ${item.is_active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{item.is_active ? 'Activo' : 'Inactivo'}</span></td>
                  <td>{formatDate(item.last_help_at)}</td>
                  <td className="pr-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setProfile(item)}><FileText size={16} /> Ver ficha</Button>
                      <Button variant="secondary" onClick={() => printBeneficiaryPdf(item, deliveries)}><Printer size={16} /></Button>
                      <Button variant="secondary" onClick={() => setEditing(item)}><Edit size={16} /></Button>
                      <Button variant="danger" onClick={() => actions.deleteBeneficiary(item.id)}><Trash2 size={16} /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <Modal title={editing.id ? 'Editar beneficiario' : 'Nuevo beneficiario'} onClose={() => setEditing(null)}><BeneficiaryForm families={data.families} beneficiaries={data.beneficiaries} initial={editing} onSubmit={save} /></Modal>}
      {profile && <Modal wide title={`Ficha de ${profile.full_name}`} onClose={() => setProfile(null)}><BeneficiaryProfile data={data} actions={actions} currentUser={currentUser} beneficiary={profile} deliveries={data.deliveries.filter((item) => item.beneficiary_id === profile.id)} /></Modal>}
    </>
  );
}

function BeneficiaryForm({ families, beneficiaries, initial, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const documentInputRef = useRef(null);
  const codeInputRef = useRef(null);

  const update = (field, value) => {
    setFormError('');
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const errorClass = (field) => (fieldErrors[field] ? ' border-red-500 focus:ring-red-500' : '');

  function validateUniqueFields() {
    const documentId = normalizeDocument(form.document_id);
    const duplicateDocument = documentId
      ? beneficiaries.find((item) => normalizeDocument(item.document_id) === documentId && item.id !== form.id)
      : null;

    if (duplicateDocument) {
      setFieldErrors({ document_id: 'Ya existe un beneficiario registrado con ese DNI/NIE / NIE O PASAPORTE.' });
      documentInputRef.current?.focus();
      return false;
    }

    const code = normalize(form.code);
    const duplicateCode = code
      ? beneficiaries.find((item) => normalize(item.code) === code && item.id !== form.id)
      : null;

    if (duplicateCode) {
      setFieldErrors({ code: 'Ya existe un beneficiario registrado con ese codigo.' });
      codeInputRef.current?.focus();
      return false;
    }

    return true;
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    if (!validateUniqueFields()) return;

    try {
      await onSubmit(form);
    } catch (error) {
      const message = error.message || '';
      if (message.includes('DNI/NIE') || message.includes('document_id')) {
        setFieldErrors({ document_id: 'Ya existe un beneficiario registrado con ese DNI/NIE / NIE O PASAPORTE.' });
        documentInputRef.current?.focus();
        return;
      }
      if (message.includes('code') || message.includes('codigo')) {
        setFieldErrors({ code: 'Ya existe un beneficiario registrado con ese codigo.' });
        codeInputRef.current?.focus();
        return;
      }
      setFormError(message || 'No se pudo guardar el beneficiario. Revise los datos e intentelo de nuevo.');
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:col-span-2">
          {formError}
        </div>
      )}

      <FormField label="Codigo beneficiario">
        <input ref={codeInputRef} className={`${inputClass}${errorClass('code')}`} value={form.code} onChange={(event) => update('code', event.target.value)} />
        {fieldErrors.code && <p className="mt-1 text-sm font-medium text-red-600">{fieldErrors.code}</p>}
      </FormField>

      <FormField label="Fecha de alta">
        <input className={inputClass} type="date" value={form.joined_at} onChange={(event) => update('joined_at', event.target.value)} />
      </FormField>

      <FormField label="Nombre y apellidos" required>
        <input className={inputClass} required value={form.full_name} onChange={(event) => update('full_name', event.target.value)} />
      </FormField>

      <FormField label="DNI/NIE / NIE O PASAPORTE" required>
        <input ref={documentInputRef} className={`${inputClass}${errorClass('document_id')}`} value={form.document_id} onChange={(event) => update('document_id', event.target.value)} />
        {fieldErrors.document_id && <p className="mt-1 text-sm font-medium text-red-600">{fieldErrors.document_id}</p>}
      </FormField>

      <FormField label="Direccion completa" required>
        <input className={inputClass} value={form.address_full} onChange={(event) => update('address_full', event.target.value)} />
      </FormField>

      <FormField label="Codigo postal">
        <input className={inputClass} value={form.postal_code} onChange={(event) => update('postal_code', event.target.value)} />
      </FormField>

      <FormField label="Telefono" required>
        <input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} />
      </FormField>

      <FormField label="Email">
        <input className={inputClass} type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} />
      </FormField>

      <FormField label="Familia" required>
        <select className={inputClass} value={form.family_id || ''} onChange={(event) => update('family_id', event.target.value)}>
          <option value="">Sin familia</option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.family_code} - {family.responsible_name}
            </option>
          ))}
        </select>
      </FormField>

      <div className="col-span-2 flex justify-end mt-4">
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  );
}

function BeneficiaryProfile({ data, actions, currentUser, beneficiary, deliveries }) {
  const [tab, setTab] = useState('social');
  const [emailOpen, setEmailOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const family = data.families.find((item) => item.id === beneficiary.family_id);
  const documents = data.beneficiary_documents.filter((item) => item.beneficiary_id === beneficiary.id);
  const history = data.social_history.filter((item) => item.beneficiary_id === beneficiary.id);
  const emailLogs = (data.email_logs || []).filter((log) => beneficiary.email && String(log.recipient || '').includes(beneficiary.email));
  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await actions.createBeneficiaryDocument({
        beneficiary_id: beneficiary.id,
        document_type: DOCUMENT_TYPES[0],
        file_name: file.name,
        file_data_url: reader.result,
        uploaded_at: todayISO(),
        notes: ''
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-md border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-ink">Datos personales</h4>
          <Button type="button" onClick={() => { setNotice(''); setEmailOpen(true); }}><Mail size={16} /> Enviar email</Button>
        </div>
        {notice && <p className="mt-3 rounded-md border border-brand-100 bg-brand-50 p-2 text-sm font-semibold text-brand-700">{notice}</p>}
        <dl className="mt-3 grid gap-2 text-sm">
          {[
            ['Codigo', beneficiary.code],
            ['DNI/NIE / NIE O PASAPORTE', beneficiary.document_id],
            ['Direccion', beneficiary.address_full],
            ['Codigo postal', beneficiary.postal_code],
            ['Telefono', beneficiary.phone],
            ['Email', beneficiary.email],
            ['Familia', family ? `${family.family_code} - ${family.responsible_name}` : '-'],
            ['Nacimiento', formatDate(beneficiary.birth_date)],
            ['Sexo', beneficiary.sex],
            ['Nacionalidad', beneficiary.nationality],
            ['Estado civil', beneficiary.marital_status],
            ['Primera atencion', formatDate(beneficiary.first_attention_at)],
            ['Unidad familiar', `${beneficiary.family_members} miembros, ${beneficiary.minors_count} menores`],
            ['Situacion', beneficiary.situation],
            ['Estado', beneficiary.is_active ? 'Activo' : 'Inactivo'],
            ['Fecha alta', formatDate(beneficiary.joined_at)],
            ['Ultima ayuda', formatDate(beneficiary.last_help_at)]
          ].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="font-semibold">{value || '-'}</dd></div>)}
        </dl>
      </section>
      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant={tab === 'social' ? 'primary' : 'secondary'} onClick={() => setTab('social')}>Historial social</Button>
          <Button type="button" variant={tab === 'deliveries' ? 'primary' : 'secondary'} onClick={() => setTab('deliveries')}>Entregas</Button>
          <Button type="button" variant={tab === 'documents' ? 'primary' : 'secondary'} onClick={() => setTab('documents')}>Documentos</Button>
          <Button type="button" variant={tab === 'emails' ? 'primary' : 'secondary'} onClick={() => setTab('emails')}>Emails</Button>
        </div>
        {tab === 'social' && <SocialHistory history={history} beneficiary={beneficiary} actions={actions} />}
        {tab === 'deliveries' && <>
        <h4 className="font-bold text-ink">Historial de entregas</h4>
        <div className="mt-3 space-y-3">
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-semibold">{formatDate(delivery.delivered_at)} - {delivery.help_type} - {delivery.quantity || '-'} {delivery.inventory_item_name}</p>
              <p className="text-slate-600">Responsable: {delivery.responsible || '-'}</p>
              <p className="text-slate-600">Firma disponible: {delivery.signature_data_url ? 'Si' : 'No'}</p>
              {delivery.notes && <p className="text-slate-600">{delivery.notes}</p>}
            </div>
          ))}
          {!deliveries.length && <p className="text-sm text-slate-500">Sin entregas registradas.</p>}
        </div>
        </>}
        {tab === 'documents' && <div>
          <h4 className="font-bold text-ink">Documentacion</h4>
          <label className="mt-3 inline-flex cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            Subir documento
            <input className="hidden" type="file" onChange={uploadDocument} />
          </label>
          <div className="mt-3 space-y-2">{documents.map((doc) => <div key={doc.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm"><span>{doc.document_type} - {doc.file_name}</span>{doc.file_data_url && <a className="font-semibold text-brand-700" href={doc.file_data_url} download={doc.file_name}>Descargar</a>}</div>)}{!documents.length && <p className="text-sm text-slate-500">Sin documentos subidos.</p>}</div>
        </div>}
        {tab === 'emails' && <div>
          <h4 className="font-bold text-ink">Historial de emails</h4>
          <div className="mt-3 space-y-2">{emailLogs.map((log) => <div key={log.id} className="rounded-md bg-slate-50 p-3 text-sm"><strong>{formatDate(log.sent_at)} - {log.subject || 'Sin asunto'}</strong><p>Destinatario: {log.recipient}</p><p>Resultado: {log.result || '-'}</p></div>)}{!emailLogs.length && <p className="text-sm text-slate-500">Sin emails registrados para este beneficiario.</p>}</div>
        </div>}
      </section>
      {emailOpen && (
        <Modal title="Enviar email al beneficiario" onClose={() => setEmailOpen(false)}>
          <BeneficiaryEmailForm
            beneficiary={beneficiary}
            deliveries={deliveries}
            allDeliveries={data.deliveries}
            organization={data.organization_settings?.[0]}
            actions={actions}
            currentUser={currentUser}
            onSent={(message) => { setNotice(message); setEmailOpen(false); }}
          />
        </Modal>
      )}
    </div>
  );
}

function BeneficiaryEmailForm({ beneficiary, deliveries, allDeliveries, organization, actions, currentUser, onSent }) {
  const latestDelivery = [...deliveries].sort((a, b) => String(b.delivered_at || '').localeCompare(String(a.delivered_at || '')))[0];
  const [form, setForm] = useState({
    template: 'receipt',
    recipients: beneficiary.email || '',
    subject: EMAIL_TEMPLATES[0].subject,
    message: EMAIL_TEMPLATES[0].message,
    attachReceipt: Boolean(latestDelivery)
  });
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
      setError('Este beneficiario no tiene correo electronico registrado.');
      return;
    }
    if (form.attachReceipt && !latestDelivery) {
      setStatus('');
      setError('No hay entregas registradas para adjuntar justificante PDF.');
      return;
    }

    let attachments = [];
    try {
      if (form.attachReceipt) {
        attachments = await createReceiptEmailAttachments([{ delivery: latestDelivery, beneficiary }], allDeliveries, { organization });
      }
      const payload = await sendEmailViaApi({ to: form.recipients, subject: form.subject, message: form.message, attachments, organization });
      await saveEmailLog(actions, currentUser, form, attachments.length, payload.message || 'Correo enviado correctamente.', attachments);
      onSent('Correo enviado correctamente.');
    } catch (err) {
      const message = normalizeEmailError(err);
      await saveEmailLog(actions, currentUser, form, attachments.length, message, attachments);
      setStatus('');
      setError(message);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <FormField label="Plantilla">
        <select className={inputClass} value={form.template} onChange={(event) => chooseTemplate(event.target.value)}>
          {EMAIL_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </FormField>
      <FormField label="Destinatario">
        <input className={inputClass} type="email" required value={form.recipients} onChange={(event) => update('recipients', event.target.value)} />
      </FormField>
      <FormField label="Asunto">
        <input className={inputClass} value={form.subject} onChange={(event) => update('subject', event.target.value)} />
      </FormField>
      <FormField label="Mensaje">
        <textarea className={inputClass} rows="5" value={form.message} onChange={(event) => update('message', event.target.value)} />
      </FormField>
      <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm text-slate-700">
        <input type="checkbox" disabled={!latestDelivery} checked={form.attachReceipt} onChange={(event) => update('attachReceipt', event.target.checked)} />
        Adjuntar justificante PDF de la ultima entrega
      </label>
      {status && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{status}</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      <div className="flex justify-end"><Button type="submit"><Mail size={18} /> Enviar email</Button></div>
    </form>
  );
}

function SocialHistory({ history, beneficiary, actions }) {
  const [note, setNote] = useState('');
  return (
    <div>
      <h4 className="font-bold text-ink">Historial social completo</h4>
      <form className="mt-3 flex gap-2" onSubmit={async (event) => { event.preventDefault(); await actions.createSocialHistory({ beneficiary_id: beneficiary.id, date: todayISO(), entry_type: 'Seguimiento', notes: note }); setNote(''); }}>
        <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nueva anotacion social" />
        <Button type="submit">Anadir</Button>
      </form>
      <div className="mt-3 space-y-2">{history.map((item) => <div key={item.id} className="rounded-md bg-slate-50 p-3 text-sm"><strong>{formatDate(item.date)} · {item.entry_type}</strong><p>{item.notes}</p></div>)}{!history.length && <p className="text-sm text-slate-500">Sin anotaciones sociales.</p>}</div>
    </div>
  );
}
