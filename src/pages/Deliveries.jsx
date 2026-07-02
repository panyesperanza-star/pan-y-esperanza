import { Ban, Eraser, PackagePlus, PenLine, Printer, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { HELP_TYPES } from '../lib/constants';
import { printDeliveryReceiptPdf } from '../lib/exporters';
import { formatDate, formatDateTime, todayISO } from '../lib/formatters';

export function Deliveries({ data, actions, currentUser }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const canCreate = canDo(currentUser, 'deliveries', 'create');
  const canCancel = canDo(currentUser, 'deliveries', 'edit') || canCreate;
  const canDeletePermanently = currentUser?.role === 'Superadministrador';

  async function deletePermanently(item) {
    if (!window.confirm(`¿Eliminar definitivamente la entrega ${item.receipt_number || ''}? Esta acción no se puede deshacer.`)) return;
    await actions.deleteDelivery(item.id);
  }

  return (
    <>
      <PageHeader
        title="Entregas"
        description="Cada entrega actualiza el historial del beneficiario, la ultima ayuda, el stock y el justificante firmado."
        actions={canCreate ? <Button onClick={() => setOpen(true)}><PackagePlus size={18} /> Registrar entrega</Button> : null}
      />

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-panel">
        <table className="w-full min-w-[1180px] text-left text-sm">
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
              <th className="text-right pr-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.deliveries.map((item) => {
              const beneficiary = data.beneficiaries.find((entry) => entry.id === item.beneficiary_id);
              const isCancelled = item.status === 'Anulada';
              return (
                <tr key={item.id} className={isCancelled ? 'bg-slate-50 text-slate-500' : ''}>
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
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${isCancelled ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'}`}>{isCancelled ? 'Anulada' : 'Activa'}</span>
                    {isCancelled && <p className="mt-1 max-w-xs text-xs">{item.cancellation_reason} · {item.cancelled_by_name || 'Usuario'} · {formatDateTime(item.cancelled_at)}</p>}
                  </td>
                  <td className="pr-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => printDeliveryReceiptPdf(item, beneficiary, data.deliveries)}>
                        <Printer size={16} /> Imprimir justificante de entrega
                      </Button>
                      {!isCancelled && canCancel && <Button variant="secondary" onClick={() => setCancelling(item)}><Ban size={16} /> Anular entrega</Button>}
                      {canDeletePermanently && <Button variant="danger" onClick={() => deletePermanently(item)}><Trash2 size={16} /> Eliminar definitivamente</Button>}
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
          <DeliveryForm data={data} onSubmit={async (payload) => { await actions.createDelivery(payload); setOpen(false); }} />
        </Modal>
      )}
      {cancelling && (
        <Modal title="Anular entrega" onClose={() => setCancelling(null)}>
          <CancellationForm delivery={cancelling} onSubmit={async (reason) => { await actions.cancelDelivery(cancelling.id, reason); setCancelling(null); }} />
        </Modal>
      )}
    </>
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

export function DeliveryForm({ data, onSubmit, initialBeneficiaryId = '' }) {
  const [form, setForm] = useState({
    beneficiary_id: initialBeneficiaryId || data.beneficiaries[0]?.id || '',
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
          {data.beneficiaries.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.code} - {item.full_name}</option>)}
        </select>
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
        <FormField label="Firma digital del receptor">
          <SignaturePad value={form.signature_data_url} onChange={(value) => update('signature_data_url', value)} />
        </FormField>
        <p className="mt-1 text-xs text-slate-500">La firma queda asociada a la entrega y aparecera en el justificante PDF.</p>
      </div>
      <div className="sm:col-span-2">
        <FormField label="Firma digital del responsable">
          <SignaturePad value={form.responsible_signature_data_url} onChange={(value) => update('responsible_signature_data_url', value)} />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField label="Observaciones">
          <textarea className={inputClass} rows="4" value={form.notes} onChange={(event) => update('notes', event.target.value)} />
        </FormField>
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={!data.beneficiaries.length || !data.inventory_items.length}>Guardar entrega</Button>
      </div>
    </form>
  );
}

function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasSignature = Boolean(value);

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
    const source = event.touches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function start(event) {
    event.preventDefault();
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

  function stop() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange('');
  }

  return (
    <div className="rounded-md border border-slate-300 bg-white p-3">
      <canvas
        ref={canvasRef}
        width="720"
        height="220"
        className="h-44 w-full touch-none rounded-md border border-dashed border-slate-300 bg-white"
        onMouseDown={start}
        onMouseMove={draw}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={draw}
        onTouchEnd={stop}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm font-medium ${hasSignature ? 'text-brand-700' : 'text-slate-500'}`}>{hasSignature ? 'Firma guardada en la entrega' : 'Pendiente de firma'}</span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={clear}><Eraser size={16} /> Borrar firma</Button>
          <Button type="button" variant="subtle" onClick={() => onChange(canvasRef.current.toDataURL('image/png'))}><PenLine size={16} /> Guardar firma</Button>
        </div>
      </div>
    </div>
  );
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
