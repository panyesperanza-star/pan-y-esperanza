import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  CalendarClock,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { DeletionRequestForm } from '../components/DeletionRequestForm';
import { DirectDeletionForm } from '../components/DirectDeletionForm';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion } from '../lib/auth';
import { formatDate, normalize, todayISO } from '../lib/formatters';

const categorySuggestions = ['Alimentos', 'Higiene', 'Ropa', 'Limpieza', 'Otros'];
const unitSuggestions = ['unidades', 'kg', 'litros', 'paquetes', 'cajas'];

export function Inventory({ data, actions, currentUser, navigationTarget }) {
  const [productModal, setProductModal] = useState(null);
  const [movementType, setMovementType] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [status, setStatus] = useState('Todos');
  const [pageError, setPageError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [deletionTarget, setDeletionTarget] = useState(null);

  const canRegisterMovements = canDo(currentUser, 'inventory', 'create');
  const canManageProducts = canDo(currentUser, 'inventory', 'edit');
  const organization = data.organization_settings?.[0] || {};
  const canDeleteDirectly = canDeleteDefinitively(currentUser, 'inventory', organization);
  const canRequestDeletion = canRequestDefinitiveDeletion(currentUser, 'inventory', organization);
  const hasProductActions = canManageProducts || canDeleteDirectly || canRequestDeletion;
  const categories = useMemo(
    () => ['Todas', ...new Set(data.inventory_items.map((item) => item.category).filter(Boolean))],
    [data.inventory_items]
  );
  const summary = useMemo(() => calculateSummary(data.inventory_items), [data.inventory_items]);

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'inventory') return;
    setSearch('');
    setCategory('Todas');
    if (navigationTarget.filter === 'stock-critical') setStatus('Stock critico');
    else if (navigationTarget.filter === 'expiring-soon') setStatus('Caducidad proxima');
    else if (!navigationTarget.filter) setStatus('Todos');
  }, [navigationTarget]);

  const filteredItems = useMemo(() => {
    const query = normalize(search);
    return [...data.inventory_items]
      .filter((item) => {
        const searchable = normalize([item.name, item.category, item.lot, item.location, item.donor].join(' '));
        return (!query || searchable.includes(query))
          && (category === 'Todas' || item.category === category)
          && matchesStatus(item, status);
      })
      .sort(compareInventoryItems);
  }, [category, data.inventory_items, search, status]);

  async function deleteProduct(item, payload) {
    setPageError('');
    setDeletingId(item.id);
    try {
      await actions.createDeletionRequest({
        module: 'inventory',
        record_type: 'inventory_item',
        record_id: item.id,
        record_label: `${item.name}${item.lot ? ` - Lote ${item.lot}` : ''}`,
        reason: payload.reason,
        notes: payload.notes,
        relations: buildInventoryRelationWarnings(item, data)
      });
      setDeletionTarget(null);
    } catch (error) {
      setPageError(normalizeInventoryError(error));
    } finally {
      setDeletingId('');
    }
  }

  async function deleteProductPermanently(item) {
    setPageError('');
    setDeletingId(item.id);
    try {
      await actions.deleteInventoryItem(item.id);
      setDeletionTarget(null);
    } catch (error) {
      setPageError(normalizeInventoryError(error));
    } finally {
      setDeletingId('');
    }
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Productos, lotes, stock, caducidades y movimientos."
        actions={(
          <>
            {canRegisterMovements && (
              <Button variant="secondary" onClick={() => setMovementType('Entrada')}>
                <ArrowUpCircle size={18} /> Entrada
              </Button>
            )}
            {canRegisterMovements && (
              <Button variant="secondary" onClick={() => setMovementType('Salida')}>
                <ArrowDownCircle size={18} /> Salida
              </Button>
            )}
            {canManageProducts && (
              <Button onClick={() => setProductModal({ mode: 'create' })}>
                <Plus size={18} /> Producto
              </Button>
            )}
          </>
        )}
      />

      {!canRegisterMovements && !canManageProducts && !canRequestDeletion && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Modo solo lectura.
        </div>
      )}
      {pageError && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} /> {pageError}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Productos y lotes" value={summary.total} icon={Boxes} />
        <StatCard label="Alertas de stock" value={summary.stockAlerts} icon={AlertTriangle} />
        <StatCard label="Alertas de caducidad" value={summary.expiring} icon={CalendarClock} />
        <StatCard label="Sin alertas" value={summary.correct} icon={PackageCheck} />
      </div>

      <section className="mb-5 border-y border-slate-200 bg-white py-4">
        <div className="grid gap-3 px-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="relative block">
            <span className="sr-only">Buscar inventario</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              className={`${inputClass} pl-10`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto, lote, ubicación o donante"
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por categoría</span>
            <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por estado</span>
            <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>Todos</option>
              <option>Alertas</option>
              <option>Agotados</option>
              <option>Stock critico</option>
              <option>Stock bajo</option>
              <option>Caducados</option>
              <option>Caducidad proxima</option>
              <option>Caducidad próxima</option>
              <option>Correctos</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-ink">Existencias</h3>
          <span className="text-sm text-slate-500">{filteredItems.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Caducidad</th>
                <th className="px-4 py-3">Estado</th>
                {hasProductActions && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.donor || 'Sin donante'}{item.notes ? ` · ${item.notes}` : ''}</p>
                  </td>
                  <td className="px-4 py-3">{item.category || '-'}</td>
                  <td className="px-4 py-3">{item.lot || '-'}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{formatQuantity(item.stock)} {item.unit}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Mínimo: {formatQuantity(item.low_stock_threshold)}</p>
                  </td>
                  <td className="px-4 py-3">{item.location || '-'}</td>
                  <td className="px-4 py-3">{formatDate(item.expires_at)}</td>
                  <td className="px-4 py-3"><StatusBadges item={item} /></td>
                  {hasProductActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canManageProducts && (
                          <Button
                            variant="secondary"
                            className="h-9 w-9 px-0"
                            aria-label={`Editar ${item.name}`}
                            title="Editar producto"
                            onClick={() => setProductModal({ mode: 'edit', item })}
                          >
                            <Pencil size={16} />
                          </Button>
                        )}
                        {(canDeleteDirectly || canRequestDeletion) && (
                          <Button
                            variant="danger"
                            className="h-9 w-9 px-0"
                            aria-label={`${canDeleteDirectly ? 'Eliminar' : 'Solicitar eliminación de'} ${item.name}`}
                            title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'}
                            disabled={deletingId === item.id}
                            onClick={() => setDeletionTarget({ item, relations: buildInventoryRelationWarnings(item, data) })}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!filteredItems.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7 + (hasProductActions ? 1 : 0)}>
                    No hay productos que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-ink">Movimientos</h3>
          <span className="text-sm text-slate-500">{data.inventory_movements.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.inventory_movements.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{formatDate(item.moved_at)}</td>
                  <td className="px-4 py-3 font-medium text-ink">{item.item_name || '-'}</td>
                  <td className="px-4 py-3"><MovementBadge type={item.movement_type} /></td>
                  <td className="px-4 py-3 font-semibold">{formatQuantity(item.quantity)}</td>
                  <td className="px-4 py-3">{item.responsible || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.notes || '-'}</td>
                </tr>
              ))}
              {!data.inventory_movements.length && (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="6">No hay movimientos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {productModal && (
        <Modal title={productModal.mode === 'edit' ? 'Editar producto' : 'Nuevo producto'} onClose={() => setProductModal(null)}>
          <ProductForm
            initial={productModal.item}
            onSubmit={async (payload) => {
              if (productModal.mode === 'edit') await actions.updateInventoryItem(productModal.item.id, payload);
              else await actions.createInventoryItem(payload);
              setProductModal(null);
            }}
          />
        </Modal>
      )}
      {movementType && (
        <Modal title={`Registrar ${movementType.toLowerCase()}`} onClose={() => setMovementType(null)}>
          <MovementForm
            items={data.inventory_items}
            movementType={movementType}
            currentUser={currentUser}
            onSubmit={async (payload) => {
              await actions.createInventoryMovement(payload);
              setMovementType(null);
            }}
          />
        </Modal>
      )}
      {deletionTarget && (
        <Modal title={canDeleteDirectly ? 'Eliminar definitivamente' : 'Solicitar eliminación definitiva'} onClose={() => setDeletionTarget(null)}>
          {canDeleteDirectly ? (
            <DirectDeletionForm
              recordLabel={`${deletionTarget.item.name}${deletionTarget.item.lot ? ` - Lote ${deletionTarget.item.lot}` : ''}`}
              relations={deletionTarget.relations}
              onCancel={() => setDeletionTarget(null)}
              onConfirm={() => deleteProductPermanently(deletionTarget.item)}
            />
          ) : (
            <DeletionRequestForm
              recordLabel={`${deletionTarget.item.name}${deletionTarget.item.lot ? ` - Lote ${deletionTarget.item.lot}` : ''}`}
              relations={deletionTarget.relations}
              onCancel={() => setDeletionTarget(null)}
              onSubmit={(payload) => deleteProduct(deletionTarget.item, payload)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function ProductForm({ initial, onSubmit }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    category: initial?.category || 'Alimentos',
    lot: initial?.lot || '',
    expires_at: initial?.expires_at || '',
    donor: initial?.donor || '',
    location: initial?.location || '',
    unit: initial?.unit || 'unidades',
    low_stock_threshold: Number(initial?.low_stock_threshold || 0),
    notes: initial?.notes || ''
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(normalizeInventoryError(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {error && <FormError message={error} />}
      <FormField label="Nombre" required><input className={inputClass} required value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField>
      <FormField label="Categoría" required>
        <input className={inputClass} list="inventory-categories" required value={form.category} onChange={(event) => update('category', event.target.value)} />
        <datalist id="inventory-categories">{categorySuggestions.map((item) => <option key={item} value={item} />)}</datalist>
      </FormField>
      <FormField label="Lote"><input className={inputClass} value={form.lot} onChange={(event) => update('lot', event.target.value)} /></FormField>
      <FormField label="Fecha de caducidad"><input className={inputClass} type="date" value={form.expires_at} onChange={(event) => update('expires_at', event.target.value)} /></FormField>
      <FormField label="Donante"><input className={inputClass} value={form.donor} onChange={(event) => update('donor', event.target.value)} /></FormField>
      <FormField label="Ubicación"><input className={inputClass} value={form.location} onChange={(event) => update('location', event.target.value)} /></FormField>
      <FormField label="Unidad" required>
        <input className={inputClass} list="inventory-units" required value={form.unit} onChange={(event) => update('unit', event.target.value)} />
        <datalist id="inventory-units">{unitSuggestions.map((item) => <option key={item} value={item} />)}</datalist>
      </FormField>
      <FormField label="Stock mínimo" required>
        <input className={inputClass} type="number" step="0.01" min="0" required value={form.low_stock_threshold} onChange={(event) => update('low_stock_threshold', Number(event.target.value))} />
      </FormField>
      <div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar producto'}</Button></div>
    </form>
  );
}

function MovementForm({ items, movementType, currentUser, onSubmit }) {
  const eligibleItems = useMemo(
    () => items.filter((item) => movementType === 'Entrada' || Number(item.stock || 0) > 0),
    [items, movementType]
  );
  const responsible = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || '';
  const [form, setForm] = useState({
    item_id: eligibleItems[0]?.id || '',
    movement_type: movementType,
    quantity: 1,
    moved_at: todayISO(),
    responsible,
    notes: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedItem = eligibleItems.find((item) => item.id === form.item_id);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (submitError) {
      setError(normalizeInventoryError(submitError));
    } finally {
      setSaving(false);
    }
  }

  if (!eligibleItems.length) {
    return <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">No hay productos disponibles para registrar esta {movementType.toLowerCase()}.</p>;
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {error && <FormError message={error} />}
      <FormField label="Producto" required>
        <select className={inputClass} required value={form.item_id} onChange={(event) => update('item_id', event.target.value)}>
          {eligibleItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.lot ? ` · ${item.lot}` : ''} · {formatQuantity(item.stock)} {item.unit}</option>)}
        </select>
      </FormField>
      <FormField label="Cantidad" required>
        <input
          className={inputClass}
          type="number"
          step="0.01"
          min="0.01"
          max={movementType === 'Salida' ? Number(selectedItem?.stock || 0) : undefined}
          required
          value={form.quantity}
          onChange={(event) => update('quantity', Number(event.target.value))}
        />
      </FormField>
      <FormField label="Fecha" required><input className={inputClass} type="date" required value={form.moved_at} onChange={(event) => update('moved_at', event.target.value)} /></FormField>
      <FormField label="Responsable" required><input className={inputClass} required value={form.responsible} onChange={(event) => update('responsible', event.target.value)} /></FormField>
      <div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar movimiento'}</Button></div>
    </form>
  );
}

function StatusBadges({ item }) {
  const signals = getItemSignals(item);
  if (!signals.length) return <StatusBadge label="Correcto" tone="green" />;
  return <div className="flex max-w-[220px] flex-wrap gap-1">{signals.map((signal) => <StatusBadge key={signal.label} {...signal} />)}</div>;
}

function StatusBadge({ label, tone }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700'
  };
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{label}</span>;
}

function MovementBadge({ type }) {
  const incoming = type === 'Entrada';
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${incoming ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{incoming ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}{type}</span>;
}

function FormError({ message }) {
  return <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 sm:col-span-2">{message}</p>;
}

function getItemSignals(item) {
  const stock = Number(item.stock || 0);
  const minimum = Number(item.low_stock_threshold || 0);
  const expiryDays = daysUntil(item.expires_at);
  const signals = [];
  if (stock <= 0) signals.push({ label: 'Agotado', tone: 'red' });
  else if (stock <= minimum) signals.push({ label: 'Stock bajo', tone: 'orange' });
  if (expiryDays !== null && expiryDays < 0) signals.push({ label: 'Caducado', tone: 'red' });
  else if (expiryDays === 0) signals.push({ label: 'Caduca hoy', tone: 'amber' });
  else if (expiryDays !== null && expiryDays <= 30) signals.push({ label: 'Caduca pronto', tone: 'amber' });
  return signals;
}

function calculateSummary(items) {
  return items.reduce((summary, item) => {
    const signals = getItemSignals(item);
    const hasStockAlert = signals.some((signal) => signal.label === 'Agotado' || signal.label === 'Stock bajo');
    const hasExpiryAlert = signals.some((signal) => signal.label === 'Caducado' || signal.label === 'Caduca hoy' || signal.label === 'Caduca pronto');
    return {
      total: summary.total + 1,
      stockAlerts: summary.stockAlerts + (hasStockAlert ? 1 : 0),
      expiring: summary.expiring + (hasExpiryAlert ? 1 : 0),
      correct: summary.correct + (!signals.length ? 1 : 0)
    };
  }, { total: 0, stockAlerts: 0, expiring: 0, correct: 0 });
}

function matchesStatus(item, status) {
  if (status === 'Todos') return true;
  const labels = getItemSignals(item).map((signal) => signal.label);
  if (status === 'Alertas') return labels.length > 0;
  if (status === 'Agotados') return labels.includes('Agotado');
  if (status === 'Stock critico') return labels.includes('Agotado') || labels.includes('Stock bajo');
  if (status === 'Stock bajo') return labels.includes('Stock bajo');
  if (status === 'Caducados') return labels.includes('Caducado');
  if (status === 'Caducidad proxima') return labels.includes('Caduca hoy') || labels.includes('Caduca pronto');
  if (status === 'Caducidad próxima') return labels.includes('Caduca hoy') || labels.includes('Caduca pronto');
  if (status === 'Correctos') return labels.length === 0;
  return true;
}

function buildInventoryRelationWarnings(item, data) {
  if (!item) return [];
  const relations = [];
  const movements = (data.inventory_movements || []).filter((movement) => movement.item_id === item.id);
  const deliveries = (data.deliveries || []).filter((delivery) => delivery.inventory_item_id === item.id);
  const socialEvents = (data.social_value_events || []).filter((event) => event.inventory_item_id === item.id);
  const donations = (data.donations || []).filter((donation) => donation.inventory_item_id === item.id);

  if (Number(item.stock || 0) > 0) relations.push(`Stock actual: ${formatQuantity(item.stock)} ${item.unit || ''}`.trim());
  if (movements.length) relations.push(`Movimientos de inventario: ${movements.length}`);
  if (deliveries.length) relations.push(`Entregas vinculadas: ${deliveries.length}`);
  if (socialEvents.length) relations.push(`Valor social: ${socialEvents.length} evento${socialEvents.length === 1 ? '' : 's'}`);
  if (donations.length) relations.push(`Donaciones vinculadas: ${donations.length}`);
  return relations;
}

function compareInventoryItems(a, b) {
  const severity = (item) => {
    const labels = getItemSignals(item).map((signal) => signal.label);
    if (labels.includes('Agotado') || labels.includes('Caducado')) return 0;
    if (labels.length) return 1;
    return 2;
  };
  return severity(a) - severity(b)
    || String(a.expires_at || '9999-12-31').localeCompare(String(b.expires_at || '9999-12-31'))
    || String(a.name || '').localeCompare(String(b.name || ''), 'es');
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatQuantity(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function normalizeInventoryError(error) {
  const message = error?.message || '';
  if (message.includes('Stock insuficiente')) return message;
  if (message.includes('movimientos registrados') || error?.code === '23503') {
    return 'No se puede eliminar un producto con movimientos registrados.';
  }
  if (message.includes('row-level security') || message.includes('permission')) {
    return 'No tienes permiso para realizar esta acción en Inventario.';
  }
  return message || 'No se pudo completar la operación de inventario.';
}
