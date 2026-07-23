import { Ban, Download, Eraser, Mail, MessageCircle, PackagePlus, PenLine, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { DeletionRequestForm } from '../components/DeletionRequestForm';
import { DirectDeletionForm } from '../components/DirectDeletionForm';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion } from '../lib/auth';
import { HELP_TYPES } from '../lib/constants';
import { normalizeEmailError, sendEmailViaApi } from '../lib/emailClient';
import { printDeliveryReceiptPdf } from '../lib/exporters';
import { formatDate, formatDateTime, normalize, todayISO } from '../lib/formatters';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from './Communications';

const FAMILY_ARCHIVE_MARKER = '[FAMILIA_ARCHIVADA]';

export function Deliveries({ data, actions, currentUser }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [signatureTarget, setSignatureTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const canCreate = canDo(currentUser, 'deliveries', 'create');
  const canCancel = canDo(currentUser, 'deliveries', 'edit') || canCreate;
  const organization = data.organization_settings?.[0] || {};
  const signatureRequired = actions.configuracion?.isDeliverySignatureRequired?.(organization) === true;
  const canDeleteDirectly = canDeleteDefinitively(currentUser, 'deliveries', organization);
  const canRequestDeletion = canRequestDefinitiveDeletion(currentUser, 'deliveries', organization);

  function requestDeletePermanently(item) {
    setDeleteTarget({
      item,
      relations: buildDeliveryRelationWarnings(item, data)
    });
  }

  async function sendDeletionRequest(item, payload) {
    setNotice('');
    try {
      await actions.createDeletionRequest({
        module: 'deliveries',
        record_type: 'delivery',
        record_id: item.id,
        record_label: item.receipt_number ? `Entrega ${item.receipt_number}` : `Entrega ${item.id}`,
        reason: payload.reason,
        notes: payload.notes,
        relations: buildDeliveryRelationWarnings(item, data)
      });
      setDeleteTarget(null);
      setNotice('Solicitud de eliminación enviada al proveedor del sistema.');
    } catch (error) {
      setNotice(error.message || 'No se pudo enviar la solicitud de eliminación.');
    }
  }

  async function deletePermanently(item) {
    setNotice('');
    try {
      await actions.deleteDelivery(item.id);
      setDeleteTarget(null);
      setNotice('Entrega eliminada definitivamente.');
    } catch (error) {
      setNotice(error.message || 'No se pudo eliminar definitivamente la entrega.');
    }
  }

  async function sendDeliveryEmail(item, beneficiary) {
    setNotice('');
    if (!beneficiary?.email) {
      setNotice('El beneficiario no tiene correo electrónico registrado.');
      return;
    }
    setBusyAction(`email-${item.id}`);
    try {
      const payload = await sendEmailViaApi({
        to: beneficiary.email,
        subject: `Justificante de entrega ${item.receipt_number || ''} - Pan y Esperanza`.trim(),
        message: `Hola ${beneficiary.full_name}, adjuntamos el justificante de la ayuda recibida el ${formatDate(item.delivered_at)}.`,
        receiptEntries: [{ delivery: item, beneficiary }],
        organization,
        logEmail: true
      });
      await actions.reloadData();
      setNotice(`Correo enviado correctamente. ID Resend: ${payload.id}`);
    } catch (error) {
      setNotice(normalizeEmailError(error));
    } finally {
      setBusyAction('');
    }
  }

  async function sendDeliveryWhatsApp(item, beneficiary) {
    setNotice('');
    const phone = normalizeWhatsAppPhone(beneficiary?.phone);
    if (!phone) {
      setNotice('El beneficiario no tiene teléfono válido para WhatsApp.');
      return;
    }
    const message = `Hola ${beneficiary.full_name}, desde Pan y Esperanza confirmamos la entrega ${item.receipt_number || ''} del ${formatDate(item.delivered_at)}.`;
    window.open(buildWhatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
    setNotice('WhatsApp abierto correctamente. Revisa el mensaje antes de enviarlo.');
    try {
      await actions.createEmailLog({
        recipient: `WhatsApp ${phone}`,
        subject: `WhatsApp - Entrega ${item.receipt_number || ''}`.trim(),
        sent_by: currentUser?.email || currentUser?.first_name || 'Sistema',
        sent_at: new Date().toISOString(),
        attachments: [],
        result: 'WhatsApp abierto correctamente',
        receipt_ids: [item.id]
      });
    } catch (error) {
      console.warn('[Entregas] No se pudo registrar WhatsApp:', error);
    }
  }

  async function saveDeliverySignature(payload) {
    if (!signatureTarget?.delivery) return;
    setNotice('');
    setBusyAction(`signature-${signatureTarget.delivery.id}`);
    try {
      await actions.saveDeliverySignature(signatureTarget.delivery.id, payload);
      setSignatureTarget(null);
      setNotice('Firma digital guardada correctamente.');
    } catch (error) {
      setNotice(error.message || 'No se pudo guardar la firma digital.');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <>
      <PageHeader
        title="Entregas"
        description="Cada entrega actualiza el historial del beneficiario, la última ayuda, el stock y el justificante firmado."
        actions={canCreate ? <Button onClick={() => setOpen(true)}><PackagePlus size={18} /> Registrar entrega</Button> : null}
      />

      {notice && <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-3 text-sm font-semibold text-brand-700">{notice}</div>}

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th>Justificante</th>
              <th>Beneficiario</th>
              <th>Familia</th>
              <th>Responsable</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Producto</th>
              <th>Receptor</th>
              <th>Firma</th>
              <th>Estado</th>
              <th>Estado asistencia</th>
              <th className="text-right pr-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.deliveries.map((item) => {
              const beneficiary = data.beneficiaries.find((entry) => entry.id === item.beneficiary_id);
              const isCancelled = item.status === 'Anulada';
              return (
                <tr key={item.id} className={isCancelled ? 'bg-slate-50/80 text-slate-600' : ''}>
                  <td className="px-4 py-3">{formatDate(item.delivered_at)}</td>
                  <td>{item.receipt_number || '-'}</td>
                  <td>{item.beneficiary_name}</td>
                  <td>{item.family_name || '-'}</td>
                  <td>{item.responsible}</td>
                  <td>{item.help_type}</td>
                  <td>{item.quantity}</td>
                  <td>{item.inventory_item_name}</td>
                  <td>{item.receiver_name || '-'}</td>
                  <td>{item.signature_data_url ? 'Disponible' : 'No'}</td>
                  <td>
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${isCancelled ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-brand-50 text-brand-700'}`}>{isCancelled ? 'Anulada' : 'Activa'}</span>
                    {isCancelled && <p className="mt-1 max-w-xs text-xs">{item.cancellation_reason} · {item.cancelled_by_name || 'Usuario'} · {formatDateTime(item.cancelled_at)}</p>}
                  </td>
                  <td>
                    <AttendanceStatusCell delivery={item} />
                  </td>
                  <td className="pr-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!isCancelled && (
                        <>
                          <Button variant="secondary" onClick={() => printDeliveryReceiptPdf(item, beneficiary, data.deliveries)} title="Descargar PDF">
                            <Download size={16} /> PDF
                          </Button>
                          <Button variant="secondary" disabled={busyAction === `email-${item.id}`} onClick={() => sendDeliveryEmail(item, beneficiary)} title="Enviar email">
                            <Mail size={16} /> Email
                          </Button>
                          <Button variant="secondary" onClick={() => sendDeliveryWhatsApp(item, beneficiary)} title="Enviar WhatsApp">
                            <MessageCircle size={16} /> WhatsApp
                          </Button>
                          <Button variant="secondary" disabled={busyAction === `signature-${item.id}`} onClick={() => setSignatureTarget({ delivery: item, beneficiary })} title="Firma digital">
                            <PenLine size={16} /> {item.signature_data_url ? 'Firma' : 'Firmar'}
                          </Button>
                        </>
                      )}
                      {!isCancelled && canCancel && <Button variant="secondary" onClick={() => setCancelling(item)}><Ban size={16} /> Anular entrega</Button>}
                      {(canDeleteDirectly || canRequestDeletion) && (
                        <Button
                          variant="danger"
                          className="whitespace-nowrap"
                          onClick={() => requestDeletePermanently(item)}
                          title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'}
                        >
                          <Trash2 size={16} /> {canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Registrar entrega" onClose={() => setOpen(false)} wide>
          <DeliveryForm data={data} signatureRequired={signatureRequired} onSubmit={async (payload) => { await actions.createDelivery(payload); setOpen(false); setNotice(signatureRequired ? 'Entrega registrada con firma digital.' : 'Entrega registrada correctamente.'); }} />
        </Modal>
      )}
      {signatureTarget && (
        <Modal title="Firma digital de entrega" onClose={() => setSignatureTarget(null)}>
          <DeliverySignatureForm
            delivery={signatureTarget.delivery}
            beneficiary={signatureTarget.beneficiary}
            signatureRequired={signatureRequired}
            busy={busyAction === `signature-${signatureTarget.delivery.id}`}
            onSubmit={saveDeliverySignature}
          />
        </Modal>
      )}
      {cancelling && (
        <Modal title="Anular entrega" onClose={() => setCancelling(null)}>
          <CancellationForm delivery={cancelling} onSubmit={async (reason) => { await actions.cancelDelivery(cancelling.id, reason); setCancelling(null); }} />
        </Modal>
      )}
      {deleteTarget && (
        <Modal title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'} onClose={() => setDeleteTarget(null)}>
          {canDeleteDirectly ? (
            <DirectDeletionForm
              recordLabel={deleteTarget.item.receipt_number ? `Entrega ${deleteTarget.item.receipt_number}` : `Entrega ${deleteTarget.item.id}`}
              relations={deleteTarget.relations}
              onCancel={() => setDeleteTarget(null)}
              onConfirm={() => deletePermanently(deleteTarget.item)}
            />
          ) : (
            <DeletionRequestForm
              recordLabel={deleteTarget.item.receipt_number ? `Entrega ${deleteTarget.item.receipt_number}` : `Entrega ${deleteTarget.item.id}`}
              relations={deleteTarget.relations}
              onCancel={() => setDeleteTarget(null)}
              onSubmit={(payload) => sendDeletionRequest(deleteTarget.item, payload)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function AttendanceStatusCell({ delivery }) {
  const meta = deliveryAttendanceMeta(delivery.attendance_status);
  return (
    <div className="max-w-[14rem]">
      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span>
      {delivery.attendance_confirmed_at && (
        <p className="mt-1 text-xs text-slate-500">
          {formatDateTime(delivery.attendance_confirmed_at)} · {attendanceSourceLabel(delivery.attendance_source)}
        </p>
      )}
      {delivery.attendance_reason && <p className="mt-1 text-xs text-slate-500">Motivo: {delivery.attendance_reason}</p>}
    </div>
  );
}

function CancellationForm({ delivery, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(reason.trim()); }}>
      <p className="mb-4 text-sm text-slate-600">La entrega {delivery.receipt_number || ''} se conservará en el historial y su salida de inventario será revertida.</p>
      <FormField label="Motivo de la anulación">
        <textarea className={inputClass} rows="4" required minLength="5" value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      <div className="mt-4 flex justify-end"><Button type="submit" variant="danger"><Ban size={16} /> Confirmar anulación</Button></div>
    </form>
  );
}

export function DeliveryForm({ data, onSubmit, initialBeneficiaryId = '', signatureRequired = false }) {
  const eligibleBeneficiaries = data.beneficiaries.filter((item) => item.is_active && !isBeneficiaryFamilyArchived(item, data.families));
  const initialEligibleBeneficiaryId = eligibleBeneficiaries.some((item) => item.id === initialBeneficiaryId)
    ? initialBeneficiaryId
    : eligibleBeneficiaries[0]?.id || '';
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    beneficiary_id: initialEligibleBeneficiaryId,
    delivered_at: todayISO(),
    responsible: '',
    delivered_time: new Date().toTimeString().slice(0, 5),
    help_type: 'Alimentos',
    quantity: 1,
    inventory_item_id: data.inventory_items[0]?.id || '',
    receiver_name: '',
    receiver_document_id: '',
    reception_at: new Date().toISOString(),
    signature_data_url: '',
    responsible_signature_data_url: '',
    notes: ''
  });

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <FormField label="Beneficiario">
        <select className={inputClass} required value={form.beneficiary_id} onChange={(event) => update('beneficiary_id', event.target.value)}>
          {eligibleBeneficiaries.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.full_name}</option>)}
        </select>
        {!eligibleBeneficiaries.length && <p className="mt-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">No hay beneficiarios disponibles para una nueva entrega. Las familias archivadas no admiten nuevas entregas.</p>}
      </FormField>
      <FormField label="Fecha">
        <input className={inputClass} type="date" value={form.delivered_at} onChange={(event) => update('delivered_at', event.target.value)} />
      </FormField>
      <FormField label="Hora">
        <input className={inputClass} type="time" value={form.delivered_time} onChange={(event) => update('delivered_time', event.target.value)} />
      </FormField>
      <FormField label="Responsable">
        <input className={inputClass} required value={form.responsible} onChange={(event) => update('responsible', event.target.value)} />
      </FormField>
      <FormField label="Tipo de ayuda">
        <select className={inputClass} value={form.help_type} onChange={(event) => update('help_type', event.target.value)}>
          {HELP_TYPES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </FormField>
      <FormField label="Producto de inventario">
        <select className={inputClass} value={form.inventory_item_id} onChange={(event) => update('inventory_item_id', event.target.value)}>
          {data.inventory_items.map((item) => <option key={item.id} value={item.id}>{item.name} - stock {item.stock} {item.unit}</option>)}
        </select>
      </FormField>
      <FormField label="Cantidad">
        <input className={inputClass} type="number" min="1" value={form.quantity} onChange={(event) => update('quantity', Number(event.target.value))} />
      </FormField>
      <FormField label="Nombre del receptor">
        <input className={inputClass} value={form.receiver_name} onChange={(event) => update('receiver_name', event.target.value)} />
      </FormField>
      <FormField label="DNI/NIE / NIE O PASAPORTE del receptor">
        <input className={inputClass} value={form.receiver_document_id} onChange={(event) => update('receiver_document_id', event.target.value)} />
      </FormField>
      <FormField label="Fecha y hora de recepcion">
        <input className={inputClass} type="datetime-local" value={toDateTimeLocal(form.reception_at)} onChange={(event) => update('reception_at', new Date(event.target.value).toISOString())} />
      </FormField>
      <div className="sm:col-span-2">
        <SignatureCaptureField
          label="Firma digital del receptor"
          value={form.signature_data_url}
          required={signatureRequired}
          onChange={(value) => update('signature_data_url', value)}
          description="La firma queda asociada a la entrega y aparecera en el justificante PDF."
        />
      </div>
      <div className="sm:col-span-2">
        <SignatureCaptureField
          label="Firma digital del responsable"
          value={form.responsible_signature_data_url}
          onChange={(value) => update('responsible_signature_data_url', value)}
        />
      </div>
      <div className="sm:col-span-2">
        <FormField label="Observaciones">
          <textarea className={inputClass} rows="4" value={form.notes} onChange={(event) => update('notes', event.target.value)} />
        </FormField>
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={!eligibleBeneficiaries.length || !data.inventory_items.length}>Guardar entrega</Button>
      </div>
    </form>
  );
}

function DeliverySignatureForm({ delivery, beneficiary, signatureRequired, busy, onSubmit }) {
  const [signature, setSignature] = useState(delivery.signature_data_url || '');
  const [responsibleSignature, setResponsibleSignature] = useState(delivery.responsible_signature_data_url || '');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (signatureRequired && !signature) {
      setError('La firma digital del receptor es obligatoria.');
      return;
    }
    await onSubmit({
      signature_data_url: signature,
      responsible_signature_data_url: responsibleSignature,
      receiver_name: delivery.receiver_name,
      receiver_document_id: delivery.receiver_document_id,
      reception_at: delivery.reception_at || new Date().toISOString()
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p><strong>Entrega:</strong> {delivery.receipt_number || delivery.id}</p>
        <p><strong>Beneficiario:</strong> {beneficiary?.full_name || delivery.beneficiary_name || '-'}</p>
      </div>
      <SignatureCaptureField
        label="Firma digital del receptor"
        value={signature}
        required={signatureRequired}
        onChange={setSignature}
        description="Se guardara como PNG y quedara asociada a la entrega, al beneficiario y al justificante."
      />
      <SignatureCaptureField
        label="Firma digital del responsable"
        value={responsibleSignature}
        onChange={setResponsibleSignature}
      />
      {error && <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Guardando firma...' : 'Guardar firma digital'}</Button>
      </div>
    </form>
  );
}

function SignatureCaptureField({ label, value, onChange, required = false, description = '' }) {
  const [open, setOpen] = useState(false);
  const hasSignature = Boolean(value);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">{label}{required ? ' *' : ''}</p>
          <p className={`mt-1 text-sm font-medium ${hasSignature ? 'text-brand-700' : 'text-slate-500'}`}>{hasSignature ? 'Firma confirmada' : 'Pendiente de firma'}</p>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasSignature && <Button type="button" variant="secondary" onClick={() => onChange('')}><Eraser size={16} /> Limpiar firma</Button>}
          <Button type="button" variant={hasSignature ? 'secondary' : 'primary'} onClick={() => setOpen(true)}><PenLine size={16} /> {hasSignature ? 'Editar firma' : 'Firmar'}</Button>
        </div>
      </div>
      {open && (
        <SignatureModal
          title={label}
          initialValue={value}
          required={required}
          onClose={() => setOpen(false)}
          onConfirm={(dataUrl) => { onChange(dataUrl); setOpen(false); }}
        />
      )}
    </div>
  );
}

function SignatureModal({ title, initialValue, required, onClose, onConfirm }) {
  const [draft, setDraft] = useState(initialValue || '');
  const [error, setError] = useState('');

  function confirm() {
    setError('');
    if (required && !draft) {
      setError('La firma digital es obligatoria.');
      return;
    }
    onConfirm(draft);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <SignatureCanvas value={draft} onChange={setDraft} />
        {error && <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="secondary" onClick={() => setDraft('')}><Eraser size={16} /> Limpiar firma</Button>
          <Button type="button" onClick={confirm}><PenLine size={16} /> Confirmar firma</Button>
        </div>
      </div>
    </Modal>
  );
}

function SignatureCanvas({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2;
    context.strokeStyle = '#17211b';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
  }, [value]);

  function point(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function start(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const context = canvasRef.current.getContext('2d');
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
  }

  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = canvasRef.current.getContext('2d');
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  }

  function stop(event) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  return (
    <div className="rounded-md border border-slate-300 bg-white p-3">
      <canvas
        ref={canvasRef}
        width="720"
        height="220"
        className="h-44 w-full touch-none rounded-md border border-dashed border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      />
      <p className="mt-2 text-xs text-slate-500">Firma con raton o pantalla tactil dentro del recuadro.</p>
    </div>
  );
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isBeneficiaryFamilyArchived(beneficiary, families = []) {
  if (!beneficiary?.family_id) return false;
  const family = families.find((item) => item.id === beneficiary.family_id);
  if (!family) return false;
  if (family.archived_at) return true;
  if (normalize(family.status) === 'archivada') return true;
  return String(family.notes || '')
    .split(/\r?\n/)
    .some((line) => line.startsWith(FAMILY_ARCHIVE_MARKER));
}

function buildDeliveryRelationWarnings(delivery, data) {
  if (!delivery) return [];
  const relations = [];
  const socialEvents = (data.social_value_events || []).filter((event) => (
    event.event_type === 'delivery'
    && (
      (event.source_module === 'deliveries' && event.source_record_id === delivery.id)
      || (
        event.source_module === 'beneficiaries'
        && event.source_record_id === delivery.beneficiary_id
        && event.social_value_at === delivery.delivered_at
      )
    )
  ));
  const emailLogs = (data.email_logs || []).filter((log) => (
    Array.isArray(log.receipt_ids) && log.receipt_ids.includes(delivery.id)
  ));

  if (delivery.beneficiary_id) relations.push(`Beneficiario: ${delivery.beneficiary_name || delivery.beneficiary_id}`);
  if (delivery.family_id || delivery.family_name) relations.push(`Familia: ${delivery.family_name || delivery.family_id}`);
  if (delivery.inventory_item_id) relations.push(`Inventario: ${delivery.inventory_item_name || delivery.inventory_item_id}`);
  if (delivery.inventory_item_id && Number(delivery.quantity || 0) > 0) relations.push(`Movimiento de inventario: ${delivery.quantity} unidades vinculadas a esta entrega`);
  if (delivery.receipt_number) relations.push(`Justificante: ${delivery.receipt_number}`);
  if (delivery.signature_data_url) relations.push('Firma digital del receptor');
  if (delivery.responsible_signature_data_url) relations.push('Firma digital del responsable');
  if (delivery.receiver_name || delivery.receiver_document_id) relations.push(`Datos del receptor: ${delivery.receiver_name || delivery.receiver_document_id}`);
  if (socialEvents.length) relations.push(`Valor social: ${socialEvents.length} evento${socialEvents.length === 1 ? '' : 's'} vinculado${socialEvents.length === 1 ? '' : 's'}`);
  if (emailLogs.length) relations.push(`Comunicaciones: ${emailLogs.length} registro${emailLogs.length === 1 ? '' : 's'} vinculado${emailLogs.length === 1 ? '' : 's'}`);
  if (delivery.status === 'Anulada') relations.push('Historial de anulación conservado en la entrega');

  return relations;
}

function deliveryAttendanceMeta(status) {
  if (status === 'confirmed') return { label: 'Confirmada', className: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100' };
  if (status === 'unavailable') return { label: 'No asistira', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100' };
  if (status === 'needs_contact') return { label: 'Necesita contactar', className: 'bg-red-50 text-red-800 ring-1 ring-red-100' };
  return { label: 'Pendiente', className: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' };
}

function attendanceSourceLabel(source) {
  if (source === 'portal') return 'Portal';
  if (source === 'erp') return 'ERP';
  if (source === 'system') return 'Sistema';
  return 'Sin origen';
}
