import { ArrowDownCircle, ArrowUpCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { formatDate, todayISO } from '../lib/formatters';

export function Inventory({ data, actions }) {
  const [itemOpen, setItemOpen] = useState(false);
  const [movementType, setMovementType] = useState(null);
  return (
    <>
      <PageHeader title="Inventario" description="Stock, alertas bajo minimo y movimientos de entrada/salida." actions={<><Button variant="secondary" onClick={() => setMovementType('Entrada')}><ArrowUpCircle size={18} /> Entrada</Button><Button variant="secondary" onClick={() => setMovementType('Salida')}><ArrowDownCircle size={18} /> Salida</Button><Button onClick={() => setItemOpen(true)}><Plus size={18} /> Producto</Button></>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.inventory_items.map((item) => {
          const low = Number(item.stock) <= Number(item.low_stock_threshold);
          return <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
            <div className="flex justify-between gap-3"><h3 className="font-bold text-ink">{item.name}</h3><span className={`rounded-md px-2 py-1 text-xs font-bold ${low ? 'bg-orange-100 text-orange-700' : 'bg-brand-50 text-brand-700'}`}>{low ? 'Stock bajo' : 'Correcto'}</span></div>
            <p className="mt-3 text-2xl font-bold">{item.stock} <span className="text-sm font-normal text-slate-500">{item.unit}</span></p>
            <p className="text-sm text-slate-600">Minimo: {item.low_stock_threshold} · Categoria: {item.category}</p>
            <p className="text-sm text-slate-600">Lote: {item.lot || '-'} · Ubicacion: {item.location || '-'}</p>
            <p className="text-sm text-slate-600">Caducidad: {item.expires_at || '-'} · Donante: {item.donor || '-'}</p>
            {Number(item.stock) <= 0 && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm font-semibold text-red-700">Producto agotado</p>}
            {item.expires_at && daysUntil(item.expires_at) <= 30 && <p className="mt-2 rounded-md bg-yellow-50 p-2 text-sm font-semibold text-yellow-700">Caducidad proxima</p>}
            {item.notes && <p className="mt-2 text-sm text-slate-500">{item.notes}</p>}
          </article>;
        })}
      </div>
      <section className="mt-5 rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <h3 className="font-bold text-ink">Movimientos</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Responsable</th><th>Notas</th></tr></thead><tbody className="divide-y divide-slate-100">{data.inventory_movements.map((item) => <tr key={item.id}><td className="py-3">{formatDate(item.moved_at)}</td><td>{item.item_name}</td><td>{item.movement_type}</td><td>{item.quantity}</td><td>{item.responsible}</td><td>{item.notes}</td></tr>)}</tbody></table>
        </div>
      </section>
      {itemOpen && <Modal title="Nuevo producto" onClose={() => setItemOpen(false)}><ItemForm onSubmit={async (payload) => { await actions.createInventoryItem(payload); setItemOpen(false); }} /></Modal>}
      {movementType && <Modal title={`Registrar ${movementType.toLowerCase()}`} onClose={() => setMovementType(null)}><MovementForm items={data.inventory_items} movementType={movementType} onSubmit={async (payload) => { await actions.createInventoryMovement(payload); setMovementType(null); }} /></Modal>}
    </>
  );
}

function ItemForm({ onSubmit }) {
  const [form, setForm] = useState({ name: '', category: 'Alimentos', lot: '', expires_at: '', donor: '', location: '', unit: 'unidades', stock: 0, low_stock_threshold: 10, notes: '' });
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><FormField label="Nombre"><input className={inputClass} required value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField><FormField label="Categoria"><input className={inputClass} value={form.category} onChange={(event) => update('category', event.target.value)} /></FormField><FormField label="Lote"><input className={inputClass} value={form.lot} onChange={(event) => update('lot', event.target.value)} /></FormField><FormField label="Fecha caducidad"><input className={inputClass} type="date" value={form.expires_at} onChange={(event) => update('expires_at', event.target.value)} /></FormField><FormField label="Donante"><input className={inputClass} value={form.donor} onChange={(event) => update('donor', event.target.value)} /></FormField><FormField label="Ubicacion"><input className={inputClass} value={form.location} onChange={(event) => update('location', event.target.value)} /></FormField><FormField label="Unidad"><input className={inputClass} value={form.unit} onChange={(event) => update('unit', event.target.value)} /></FormField><FormField label="Stock"><input className={inputClass} type="number" min="0" value={form.stock} onChange={(event) => update('stock', Number(event.target.value))} /></FormField><FormField label="Stock minimo"><input className={inputClass} type="number" min="0" value={form.low_stock_threshold} onChange={(event) => update('low_stock_threshold', Number(event.target.value))} /></FormField><div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div><div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar</Button></div></form>;
}

function MovementForm({ items, movementType, onSubmit }) {
  const [form, setForm] = useState({ item_id: items[0]?.id || '', movement_type: movementType, quantity: 1, moved_at: todayISO(), responsible: '', notes: '' });
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><FormField label="Producto"><select className={inputClass} value={form.item_id} onChange={(event) => update('item_id', event.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.stock} {item.unit}</option>)}</select></FormField><FormField label="Cantidad"><input className={inputClass} type="number" min="1" value={form.quantity} onChange={(event) => update('quantity', Number(event.target.value))} /></FormField><FormField label="Fecha"><input className={inputClass} type="date" value={form.moved_at} onChange={(event) => update('moved_at', event.target.value)} /></FormField><FormField label="Responsable"><input className={inputClass} value={form.responsible} onChange={(event) => update('responsible', event.target.value)} /></FormField><div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div><div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar movimiento</Button></div></form>;
}

function daysUntil(value) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}
