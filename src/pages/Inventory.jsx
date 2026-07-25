import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Brain,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Download,
  DollarSign,
  Filter,
  ImageIcon,
  ImageOff,
  MapPin,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Truck,
  Trash2,
  Upload
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { DeletionRequestForm } from '../components/DeletionRequestForm';
import { DirectDeletionForm } from '../components/DirectDeletionForm';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDeleteDefinitively, canDo, canRequestDefinitiveDeletion } from '../lib/auth';
import { formatDate, normalize, todayISO } from '../lib/formatters';
import {
  formatInventoryQuantity,
  formatInventoryStockLabel,
  isValidInventoryUnit,
  normalizeInventoryStockNumber,
  normalizeInventoryUnit
} from '../lib/inventoryDisplay';
import {
  optimizeInventoryProductPhoto,
  removeInventoryProductPhoto,
  resolveInventoryProductPhotoUrl,
  uploadInventoryProductPhoto
} from '../lib/inventoryProductPhotos';

const categorySuggestions = ['Alimentos', 'Higiene', 'Ropa', 'Limpieza', 'Otros'];
const unitSuggestions = ['unidades', 'kg', 'litros', 'paquetes', 'cajas'];
const provenanceOptions = ['Compra', 'Donación', 'Cesión', 'Recuperación', 'Otro'];
const DOCUMENT_TYPES = ['Factura', 'Albarán', 'Ticket', 'Transferencia', 'Bizum', 'PayPal', 'Documento interno', 'Sin documento'];
const DOCUMENT_FIELD_LABELS = {
  Factura: 'Número de factura',
  Albarán: 'Número de albarán',
  Ticket: 'Número de ticket',
  Transferencia: 'Referencia bancaria',
  Bizum: 'Código Bizum',
  PayPal: 'ID de transacción',
  'Documento interno': 'Número interno'
};
const DOCUMENT_FILE_ACCEPT = '.pdf,image/*,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const inventoryMetaLabels = [
  'Procedencia',
  'Persona o entidad que entrega',
  'Persona que recibe',
  'Documento asociado',
  'Tipo de documento',
  'Número de factura',
  'Número de albarán',
  'Número de ticket',
  'Referencia bancaria',
  'Código Bizum',
  'ID de transacción',
  'Número interno',
  'Archivo documento',
  'Nombre archivo',
  'Tipo archivo',
  'Referencia',
  'Quién entrega',
  'Quién recibe',
  'Motivo',
  'Documento'
];

export function Inventory({ data, actions, currentUser, navigationTarget }) {
  const [productModal, setProductModal] = useState(null);
  const [movementType, setMovementType] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [locationFilter, setLocationFilter] = useState('Todas');
  const [donorFilter, setDonorFilter] = useState('Todos');
  const [quickFilter, setQuickFilter] = useState('Todos');
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
  const locations = useMemo(
    () => ['Todas', ...new Set(data.inventory_items.map((item) => item.location).filter(Boolean))],
    [data.inventory_items]
  );
  const donors = useMemo(
    () => ['Todos', ...new Set(data.inventory_items.map((item) => item.donor).filter(Boolean))],
    [data.inventory_items]
  );
  const summary = useMemo(() => calculateSummary(data.inventory_items), [data.inventory_items]);
  const inventoryCenter = useMemo(() => buildInventoryCenter(data), [data]);
  const quickFilters = useMemo(() => buildQuickFilters(inventoryCenter), [inventoryCenter]);
  const latestMovementByItem = useMemo(() => buildLatestMovementByItem(data.inventory_movements || []), [data.inventory_movements]);

  useEffect(() => {
    if (navigationTarget?.moduleId !== 'inventory') return;
    setSearch('');
    setCategory('Todas');
    setLocationFilter('Todas');
    setDonorFilter('Todos');
    if (navigationTarget.filter === 'stock-critical') {
      setStatus('Stock critico');
      setQuickFilter('Solo criticos');
    } else if (navigationTarget.filter === 'expiring-soon') {
      setStatus('Caducidad proxima');
      setQuickFilter('Proximos a caducar');
    } else if (!navigationTarget.filter) {
      setStatus('Todos');
      setQuickFilter('Todos');
    }
  }, [navigationTarget]);

  const filteredItems = useMemo(() => {
    const query = normalize(search);
    return [...data.inventory_items]
      .filter((item) => {
        const searchable = normalize([item.name, item.category, item.lot, item.location, item.donor].join(' '));
        return (!query || searchable.includes(query))
          && (category === 'Todas' || item.category === category)
          && (locationFilter === 'Todas' || item.location === locationFilter)
          && (donorFilter === 'Todos' || item.donor === donorFilter)
          && matchesStatus(item, status)
          && matchesQuickFilter(item, quickFilter, data);
      })
      .sort(compareInventoryItems);
  }, [category, data, data.inventory_items, donorFilter, locationFilter, quickFilter, search, status]);

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

      <InventoryOperationsOverview insights={inventoryCenter} summary={summary} />

      <InventoryVisualIndicators insights={inventoryCenter} />

      <InventoryQuickActions
        canRegisterMovements={canRegisterMovements}
        canManageProducts={canManageProducts}
        onCreateProduct={() => setProductModal({ mode: 'create' })}
        onEntry={() => setMovementType('Entrada')}
        onExit={() => setMovementType('Salida')}
        onRegularization={() => setMovementType('Entrada')}
      />

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-brand-50 p-2 text-brand-700"><Filter size={18} /></div>
            <div>
              <h3 className="font-bold text-ink">Filtros operativos</h3>
              <p className="text-sm text-slate-500">Localiza lotes por estado, origen, ubicación o prioridad de salida.</p>
            </div>
          </div>
          <span className="rounded-md bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">{filteredItems.length} registros visibles</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {quickFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setQuickFilter(item.id)}
              className={`focus-ring inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                quickFilter === item.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
              <span className={`rounded px-1.5 py-0.5 text-xs ${quickFilter === item.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.count}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
            <span className="sr-only">Filtrar por ubicación</span>
            <select className={inputClass} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              {locations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por donante</span>
            <select className={inputClass} value={donorFilter} onChange={(event) => setDonorFilter(event.target.value)}>
              {donors.map((item) => <option key={item}>{item}</option>)}
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-ink">Existencias</h3>
            <p className="text-sm text-slate-500">Productos, lotes, origen, ubicación y estado visual.</p>
          </div>
          <span className="text-sm text-slate-500">{filteredItems.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Donante</th>
                <th className="px-4 py-3">Entrada</th>
                <th className="px-4 py-3">Caducidad</th>
                <th className="px-4 py-3">Estado</th>
                {hasProductActions && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const parsed = parseInventoryNotes(item.notes || '');
                const latestEntry = latestMovementByItem.get(`${item.id}:Entrada`);
                return (
                  <tr key={item.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex min-w-[240px] items-start gap-3">
                        <InventoryProductImage item={item} />
                        <div>
                          <p className="font-semibold text-ink">{item.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{parsed.visible || 'Sin notas operativas'}</p>
                          {parsed.meta.Referencia && <p className="mt-1 text-xs font-semibold text-slate-500">{parsed.meta.Referencia}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600"><Tag size={13} /> {item.category || '-'}</span>
                    </td>
                    <td className="px-4 py-3">{item.lot || '-'}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{formatInventoryStockLabel(item, { prefix: '' })}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Mínimo: {formatInventoryQuantity(item.low_stock_threshold)} {normalizeInventoryUnit(item.unit)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-slate-700"><MapPin size={14} className="text-slate-400" /> {item.location || '-'}</span>
                    </td>
                    <td className="px-4 py-3">{item.donor || 'Sin donante'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{latestEntry ? formatDate(latestEntry.moved_at) : '-'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{latestEntry?.responsible || ''}</p>
                    </td>
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
                );
              })}
              {!filteredItems.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9 + (hasProductActions ? 1 : 0)}>
                    No hay productos que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="space-y-5">
        <InventoryAiPanel insights={inventoryCenter} />
        <InventoryActivityPanel timeline={inventoryCenter.timeline} />
      </aside>
      </div>

      <section id="inventory-movements" className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-ink">Movimientos</h3>
          <span className="text-sm text-slate-500">{data.inventory_movements.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Cantidad</th>
                <th className="px-4 py-3">Entrega</th>
                <th className="px-4 py-3">Recibe</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.inventory_movements.map((item) => {
                const parsed = parseInventoryNotes(item.notes || '');
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{formatDate(item.moved_at)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{item.item_name || '-'}</td>
                    <td className="px-4 py-3"><MovementBadge type={item.movement_type} /></td>
                    <td className="px-4 py-3 font-semibold">{formatQuantity(item.quantity)}</td>
                    <td className="px-4 py-3">{parsed.meta['Quién entrega'] || '-'}</td>
                    <td className="px-4 py-3">{parsed.meta['Quién recibe'] || '-'}</td>
                    <td className="px-4 py-3">{parsed.meta.Motivo || '-'}</td>
                    <td className="px-4 py-3"><InventoryDocumentCell meta={parsed.meta} /></td>
                    <td className="px-4 py-3">{item.responsible || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{parsed.visible || '-'}</td>
                  </tr>
                );
              })}
              {!data.inventory_movements.length && (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="10">No hay movimientos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {productModal && (
        <Modal title={productModal.mode === 'edit' ? 'Editar producto' : 'Nuevo producto'} onClose={() => setProductModal(null)}>
          <ProductForm
            initial={productModal.item}
            inventoryData={data}
            onSubmit={async (payload, imageChange = {}) => {
              const previousPhotoUrl = productModal.item?.photo_url || '';
              let uploaded = null;
              if (productModal.mode === 'edit') {
                const productId = productModal.item.id;
                if (imageChange.photoDataUrl) uploaded = await uploadInventoryProductPhoto(productId, imageChange.photoDataUrl);
                const updatePayload = {
                  ...payload,
                  ...(imageChange.removePhoto ? { photo_url: null, photo_data_url: null } : {}),
                  ...(uploaded ? { photo_url: uploaded.photoUrl, photo_data_url: uploaded.photoDataUrl } : {})
                };
                try {
                  await actions.updateInventoryItem(productId, updatePayload);
                } catch (error) {
                  if (uploaded?.photoUrl) {
                    await removeInventoryProductPhoto(uploaded.photoUrl).catch((cleanupError) => console.warn('[InventoryProductPhoto] No se pudo limpiar la subida fallida', cleanupError));
                  }
                  throw error;
                }
                if ((imageChange.removePhoto || uploaded) && previousPhotoUrl && previousPhotoUrl !== uploaded?.photoUrl) {
                  await removeInventoryProductPhoto(previousPhotoUrl).catch((cleanupError) => console.warn('[InventoryProductPhoto] No se pudo limpiar la imagen sustituida', cleanupError));
                }
              } else {
                const created = await actions.createInventoryItem(payload);
                if (imageChange.photoDataUrl && created?.id) {
                  uploaded = await uploadInventoryProductPhoto(created.id, imageChange.photoDataUrl);
                  await actions.updateInventoryItem(created.id, {
                    ...payload,
                    photo_url: uploaded.photoUrl,
                    photo_data_url: uploaded.photoDataUrl
                  });
                }
              }
              setProductModal(null);
            }}
          />
        </Modal>
      )}
      {movementType && (
        <Modal title={`Registrar ${movementType.toLowerCase()}`} onClose={() => setMovementType(null)}>
          <MovementForm
            items={data.inventory_items}
            movements={data.inventory_movements}
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

function InventoryOperationsOverview({ insights, summary }) {
  const metrics = [
    { label: 'Total de productos', value: insights.totalProducts, detail: `${summary.correct} sin alertas`, icon: Package },
    { label: 'Total de lotes', value: insights.totalLots, detail: 'Registros activos de inventario', icon: Boxes },
    { label: 'Valor aproximado', value: formatMoney(insights.estimatedValue), detail: 'Según valor unitario disponible', icon: DollarSign },
    { label: 'Productos críticos', value: insights.criticalProducts, detail: 'Agotados, bajo mínimo o caducados', icon: AlertTriangle },
    { label: 'Próximos a caducar', value: insights.expiringSoon, detail: 'Lotes con salida prioritaria', icon: CalendarClock },
    { label: 'Última entrada', value: formatMovementShort(insights.latestEntry), detail: insights.latestEntry?.item_name || 'Sin registros', icon: ArrowUpCircle },
    { label: 'Última salida', value: formatMovementShort(insights.latestExit), detail: insights.latestExit?.item_name || 'Sin registros', icon: ArrowDownCircle }
  ];

  return (
    <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-ink">Centro de Gestión de Inventario</h3>
          <p className="mt-1 text-sm text-slate-500">Control operativo de productos, lotes, caducidades, entradas y salidas.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
          <PackageCheck size={16} /> Inventario como fuente de verdad
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => <InventoryMetric key={item.label} {...item} />)}
      </div>
    </section>
  );
}

function InventoryMetric({ label, value, detail, icon: Icon }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className="rounded-md bg-white p-2 text-brand-700 shadow-sm"><Icon size={20} /></div>
      </div>
    </article>
  );
}

function InventoryVisualIndicators({ insights }) {
  const indicators = [
    { label: 'Stock correcto', value: insights.stockCorrect, detail: 'Sin incidencias activas', icon: PackageCheck, tone: 'emerald' },
    { label: 'Stock bajo', value: insights.lowStock, detail: 'Por debajo del mínimo', icon: AlertTriangle, tone: 'amber' },
    { label: 'Próxima caducidad', value: insights.expiringSoon, detail: 'Requiere prioridad de salida', icon: CalendarClock, tone: 'orange' },
    { label: 'Producto agotado', value: insights.outOfStock, detail: 'Sin unidades disponibles', icon: Boxes, tone: 'red' },
    { label: 'Donaciones pendientes', value: insights.pendingDonations, detail: 'Pendientes de registrar', icon: Truck, tone: 'blue' }
  ];

  return (
    <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {indicators.map((item) => <InventoryIndicator key={item.label} {...item} />)}
    </section>
  );
}

function InventoryIndicator({ label, value, detail, icon: Icon, tone }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700'
  };
  return (
    <article className={`rounded-md border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs opacity-80">{detail}</p>
        </div>
        <div className="rounded-md bg-white/70 p-2"><Icon size={20} /></div>
      </div>
    </article>
  );
}

function InventoryQuickActions({ canRegisterMovements, canManageProducts, onCreateProduct, onEntry, onExit, onRegularization }) {
  return (
    <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-bold text-ink">Acciones rápidas</h3>
          <p className="text-sm text-slate-500">Accesos directos para coordinar entradas, salidas, campañas y movimientos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickActionLink href="/donations" icon={Truck}>Registrar donación</QuickActionLink>
          <Button variant="secondary" disabled={!canRegisterMovements} onClick={onEntry}><ArrowUpCircle size={16} /> Nueva entrada</Button>
          <Button variant="secondary" disabled={!canRegisterMovements} onClick={onExit}><ArrowDownCircle size={16} /> Nueva salida</Button>
          <Button variant="secondary" disabled={!canRegisterMovements} onClick={onRegularization}><ClipboardList size={16} /> Regularización</Button>
          {canManageProducts && <Button onClick={onCreateProduct}><Plus size={16} /> Producto</Button>}
          <QuickActionLink href="/agenda" icon={CalendarDays}>Abrir Agenda</QuickActionLink>
          <QuickActionLink href="/agenda" icon={Sparkles}>Crear campaña</QuickActionLink>
          <Button variant="subtle" onClick={() => document.getElementById('inventory-movements')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Activity size={16} /> Ver movimientos</Button>
        </div>
      </div>
    </section>
  );
}

function QuickActionLink({ href, icon: Icon, children }) {
  return (
    <a className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" href={href}>
      <Icon size={16} /> {children}
    </a>
  );
}

function InventoryProductImage({ item }) {
  const [src, setSrc] = useState(item.photo_data_url || item.image_url || item.photo || item.image || item.picture_url || '');

  useEffect(() => {
    let active = true;
    resolveInventoryProductPhotoUrl(item)
      .then((displayUrl) => { if (active) setSrc(displayUrl || ''); })
      .catch((error) => {
        console.warn('[InventoryProductPhoto] No se pudo recuperar la imagen', error);
        if (active) setSrc('');
      });
    return () => { active = false; };
  }, [item.id, item.photo_url, item.photo_data_url, item.image_url, item.photo, item.image, item.picture_url]);

  if (src) {
    return (
      <img
        src={src}
        alt={`Fotografía de ${item.name}`}
        loading="lazy"
        className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover"
      />
    );
  }
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-400">
      <ImageIcon size={20} />
    </div>
  );
}

function InventoryAiPanel({ insights }) {
  const recommendations = [
    `${insights.expiringSoon} lotes con prioridad por caducidad`,
    `${insights.lowStock + insights.outOfStock} productos requieren revisión de stock`,
    `${insights.pendingDonations} donaciones pueden convertirse en entrada`
  ];
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-brand-50 p-2 text-brand-700"><Brain size={18} /></div>
        <div>
          <h3 className="font-bold text-ink">Recomendaciones inteligentes</h3>
          <p className="mt-1 text-sm text-slate-500">Preparado para priorizar salidas, detectar riesgo de caducidad y sugerir campañas.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {recommendations.map((item) => (
          <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{item}</div>
        ))}
      </div>
    </section>
  );
}

function InventoryActivityPanel({ timeline }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-brand-50 p-2 text-brand-700"><Activity size={18} /></div>
        <div>
          <h3 className="font-bold text-ink">Actividad reciente</h3>
          <p className="mt-1 text-sm text-slate-500">Entradas, salidas, regularizaciones, donaciones y campañas.</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {timeline.map((item) => (
          <article key={item.id} className="relative border-l border-slate-200 pl-4">
            <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full ${item.dot}`} />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink">{item.title}</p>
              <span className="text-xs text-slate-500">{formatDate(item.date)}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
            <span className="mt-2 inline-flex rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{item.type}</span>
          </article>
        ))}
        {!timeline.length && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Sin actividad registrada.</p>}
      </div>
    </section>
  );
}

function ProductForm({ initial, inventoryData, onSubmit }) {
  const parsedNotes = parseInventoryNotes(initial?.notes || '');
  const hasInitialPhoto = Boolean(initial?.photo_url || initial?.photo_data_url || initial?.image_url || initial?.photo || initial?.image || initial?.picture_url);
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    category: initial?.category || 'Alimentos',
    lot: initial?.lot || '',
    expires_at: initial?.expires_at || '',
    provenance: parsedNotes.meta.Procedencia || 'Donación',
    donor: initial?.donor || parsedNotes.meta['Persona o entidad que entrega'] || '',
    received_by: parsedNotes.meta['Persona que recibe'] || '',
    document_type: parsedNotes.meta['Tipo de documento'] || (parsedNotes.meta['Documento asociado'] ? 'Documento interno' : 'Sin documento'),
    document_number: documentNumberFromMeta(parsedNotes.meta),
    document_file_data_url: parsedNotes.meta['Archivo documento'] || '',
    document_file_name: parsedNotes.meta['Nombre archivo'] || '',
    document_file_type: parsedNotes.meta['Tipo archivo'] || '',
    internal_document_number: parsedNotes.meta['Número interno'] || nextInventoryReference('INT', inventoryData),
    reference: parsedNotes.meta.Referencia || nextInventoryReference('INV', inventoryData),
    location: initial?.location || '',
    unit: initial?.unit || 'unidades',
    low_stock_threshold: Number(initial?.low_stock_threshold || 0),
    notes: parsedNotes.visible
  }));
  const [photoPreview, setPhotoPreview] = useState(initial?.photo_data_url || '');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const imageInputRef = useRef(null);
  const update = (field, value) => setForm((current) => (typeof field === 'object' ? { ...current, ...field } : { ...current, [field]: value }));

  useEffect(() => {
    let active = true;
    setPhotoError('');
    resolveInventoryProductPhotoUrl(initial || {})
      .then((displayUrl) => { if (active && !photoDataUrl && !removePhoto) setPhotoPreview(displayUrl || ''); })
      .catch((photoError) => {
        console.warn('[InventoryProductPhoto] No se pudo preparar la vista previa', photoError);
        if (active) setPhotoError(photoError.message || 'No se pudo cargar la imagen actual.');
      });
    return () => { active = false; };
  }, [initial?.id, initial?.photo_url, initial?.photo_data_url, photoDataUrl, removePhoto]);

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    try {
      const optimized = await optimizeInventoryProductPhoto(file);
      setPhotoDataUrl(optimized);
      setPhotoPreview(optimized);
      setRemovePhoto(false);
    } catch (photoSelectionError) {
      setPhotoError(photoSelectionError.message || 'No se pudo preparar la imagen.');
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  function clearPhoto() {
    setPhotoDataUrl('');
    setPhotoPreview('');
    setRemovePhoto(hasInitialPhoto);
    setPhotoError('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!isValidInventoryUnit(form.unit)) {
      setError('La unidad de medida debe ser texto, por ejemplo: unidades, kg o litros.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: form.name,
        category: form.category,
        lot: form.lot,
        expires_at: form.expires_at,
        donor: form.donor,
        location: form.location,
        unit: form.unit,
        low_stock_threshold: form.low_stock_threshold,
        notes: buildInventoryNotes(form.notes, {
          Procedencia: form.provenance,
          'Persona o entidad que entrega': form.donor,
          'Persona que recibe': form.received_by,
          Referencia: form.reference,
          ...buildDocumentMeta(form)
        })
      }, {
        photoDataUrl,
        removePhoto
      });
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
      <FormField label="Procedencia">
        <select className={inputClass} value={form.provenance} onChange={(event) => update('provenance', event.target.value)}>
          {provenanceOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </FormField>
      <FormField label="Persona o entidad que entrega"><input className={inputClass} value={form.donor} onChange={(event) => update('donor', event.target.value)} /></FormField>
      <FormField label="Persona que recibe"><input className={inputClass} value={form.received_by} onChange={(event) => update('received_by', event.target.value)} /></FormField>
      <FormField label="Referencia"><input className={`${inputClass} bg-slate-50 text-slate-600`} readOnly value={form.reference} /></FormField>
      <DocumentFields form={form} update={update} />
      <FormField label="Ubicación"><input className={inputClass} value={form.location} onChange={(event) => update('location', event.target.value)} /></FormField>
      <FormField label="Unidad de medida" required>
        <input className={inputClass} list="inventory-units" required value={form.unit} onChange={(event) => update('unit', event.target.value)} />
        <datalist id="inventory-units">{unitSuggestions.map((item) => <option key={item} value={item} />)}</datalist>
        <p className="mt-1 text-xs text-slate-500">Indica como se mide el producto. La cantidad disponible se gestiona con Nueva entrada o Nueva salida.</p>
      </FormField>
      <FormField label="Stock mínimo" required>
        <input className={inputClass} type="number" step="0.01" min="0" required value={form.low_stock_threshold} onChange={(event) => update('low_stock_threshold', Number(event.target.value))} />
      </FormField>
      <div className="sm:col-span-2">
        <FormField label="Imagen del producto">
          <div className="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-slate-400">
              {photoPreview ? (
                <img src={photoPreview} alt="Vista previa del producto" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={28} />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-slate-600">Sube una imagen clara del producto o del lote. Se guardará optimizada en Storage.</p>
              <div className="flex flex-wrap gap-2">
                <label className="focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
                  <Upload size={16} /> {photoPreview ? 'Cambiar imagen' : 'Subir imagen'}
                  <input ref={imageInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} />
                </label>
                {photoPreview && (
                  <button
                    type="button"
                    className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    onClick={clearPhoto}
                  >
                    <ImageOff size={16} /> Eliminar imagen
                  </button>
                )}
              </div>
              {photoError && <p className="text-sm font-semibold text-red-700">{photoError}</p>}
            </div>
          </div>
        </FormField>
      </div>
      <div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar producto'}</Button></div>
    </form>
  );
}

function MovementForm({ items, movements, movementType, currentUser, onSubmit }) {
  const eligibleItems = useMemo(
    () => items.filter((item) => movementType === 'Entrada' || normalizeInventoryStockNumber(item.stock) > 0),
    [items, movementType]
  );
  const responsible = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || '';
  const [form, setForm] = useState({
    item_id: eligibleItems[0]?.id || '',
    movement_type: movementType,
    quantity: 1,
    moved_at: todayISO(),
    delivered_by: '',
    received_by: responsible,
    reason: movementType === 'Entrada' ? 'Entrada de material' : 'Salida de material',
    document_type: 'Sin documento',
    document_number: '',
    document_file_data_url: '',
    document_file_name: '',
    document_file_type: '',
    internal_document_number: nextInventoryReference('INT', { inventory_items: items, inventory_movements: movements }),
    reference: nextInventoryReference(movementType === 'Entrada' ? 'ENT' : 'SAL', { inventory_items: items, inventory_movements: movements }),
    responsible,
    notes: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedItem = eligibleItems.find((item) => item.id === form.item_id);
  const update = (field, value) => setForm((current) => (typeof field === 'object' ? { ...current, ...field } : { ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        item_id: form.item_id,
        movement_type: form.movement_type,
        quantity: form.quantity,
        moved_at: form.moved_at,
        responsible: form.responsible,
        notes: buildInventoryNotes(form.notes, {
          Referencia: form.reference,
          'Quién entrega': form.delivered_by,
          'Quién recibe': form.received_by,
          Motivo: form.reason,
          ...buildDocumentMeta(form)
        })
      });
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
          {eligibleItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.lot ? ` · ${item.lot}` : ''} · {formatInventoryStockLabel(item)}</option>)}
        </select>
      </FormField>
      <FormField label="Cantidad" required>
        <input
          className={inputClass}
          type="number"
          step="0.01"
          min="0.01"
          max={movementType === 'Salida' ? normalizeInventoryStockNumber(selectedItem?.stock) : undefined}
          required
          value={form.quantity}
          onChange={(event) => update('quantity', Number(event.target.value))}
        />
      </FormField>
      <FormField label="Fecha" required><input className={inputClass} type="date" required value={form.moved_at} onChange={(event) => update('moved_at', event.target.value)} /></FormField>
      <FormField label="Quién entrega" required><input className={inputClass} required value={form.delivered_by} onChange={(event) => update('delivered_by', event.target.value)} /></FormField>
      <FormField label="Quién recibe" required><input className={inputClass} required value={form.received_by} onChange={(event) => update('received_by', event.target.value)} /></FormField>
      <FormField label="Motivo" required><input className={inputClass} required value={form.reason} onChange={(event) => update('reason', event.target.value)} /></FormField>
      <FormField label="Referencia"><input className={`${inputClass} bg-slate-50 text-slate-600`} readOnly value={form.reference} /></FormField>
      <DocumentFields form={form} update={update} />
      <FormField label="Responsable" required><input className={inputClass} required value={form.responsible} onChange={(event) => update('responsible', event.target.value)} /></FormField>
      <div className="sm:col-span-2"><FormField label="Notas"><textarea className={inputClass} rows="3" value={form.notes} onChange={(event) => update('notes', event.target.value)} /></FormField></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar movimiento'}</Button></div>
    </form>
  );
}

function StatusBadges({ item }) {
  const signals = getItemSignals(item);
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

function DocumentFields({ form, update }) {
  const numberLabel = DOCUMENT_FIELD_LABELS[form.document_type];

  async function attachFile(file) {
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo adjuntar el documento.'));
      reader.readAsDataURL(file);
    });
    update({
      document_file_data_url: dataUrl,
      document_file_name: file.name,
      document_file_type: file.type || 'application/octet-stream'
    });
  }

  function changeDocumentType(value) {
    update({
      document_type: value,
      document_number: value === 'Documento interno' ? (form.document_number || form.internal_document_number) : ''
    });
  }

  return (
    <>
      <FormField label="Tipo de documento">
        <select className={inputClass} value={form.document_type} onChange={(event) => changeDocumentType(event.target.value)}>
          {DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
        </select>
      </FormField>
      {numberLabel && (
        <FormField label={numberLabel}>
          <input
            className={`${inputClass} ${form.document_type === 'Documento interno' ? 'bg-slate-50 text-slate-600' : ''}`}
            readOnly={form.document_type === 'Documento interno'}
            value={form.document_number}
            onChange={(event) => update('document_number', event.target.value)}
          />
        </FormField>
      )}
      <FormField label="Adjuntar documento">
        <input
          className={inputClass}
          type="file"
          accept={DOCUMENT_FILE_ACCEPT}
          onChange={(event) => attachFile(event.target.files?.[0])}
        />
        {form.document_file_name && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <span className="truncate">{form.document_file_name}</span>
            <a className="inline-flex items-center gap-1 font-semibold text-brand" href={form.document_file_data_url} download={form.document_file_name}>
              <Download size={14} /> Descargar
            </a>
          </div>
        )}
      </FormField>
    </>
  );
}

function InventoryDocumentCell({ meta }) {
  const reference = meta.Referencia || '-';
  const documentSummary = getDocumentSummary(meta);
  const fileUrl = meta['Archivo documento'];
  const fileName = meta['Nombre archivo'] || 'documento-inventario';
  return (
    <div className="space-y-1">
      <p className="font-semibold text-ink">{reference}</p>
      <p className="text-xs text-slate-600">{documentSummary}</p>
      {fileUrl && (
        <a className="inline-flex items-center gap-1 text-xs font-semibold text-brand" href={fileUrl} download={fileName}>
          <Download size={14} /> Documento
        </a>
      )}
    </div>
  );
}

function FormError({ message }) {
  return <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 sm:col-span-2">{message}</p>;
}

function getItemSignals(item) {
  const expiryDays = daysUntil(item.expires_at);
  const signals = [getStockSignal(item)];
  if (expiryDays !== null && expiryDays < 0) signals.push({ label: 'Caducado', tone: 'red' });
  else if (expiryDays === 0) signals.push({ label: 'Caduca hoy', tone: 'amber' });
  else if (expiryDays !== null && expiryDays <= 30) signals.push({ label: 'Caduca pronto', tone: 'amber' });
  return signals;
}

function getStockSignal(item) {
  const stock = normalizeInventoryStockNumber(item.stock);
  const minimum = Math.max(normalizeInventoryStockNumber(item.low_stock_threshold), 0);
  if (stock === 0) return { label: 'Agotado', tone: 'red' };
  if (stock > 0 && stock <= minimum) return { label: 'Stock bajo', tone: 'orange' };
  return { label: 'Disponible', tone: 'green' };
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
      correct: summary.correct + (!hasStockAlert && !hasExpiryAlert ? 1 : 0)
    };
  }, { total: 0, stockAlerts: 0, expiring: 0, correct: 0 });
}

function buildInventoryCenter(data = {}) {
  const items = data.inventory_items || [];
  const movements = data.inventory_movements || [];
  const donations = data.donations || [];
  const campaigns = data.campanas || [];
  const productNames = new Set(items.map((item) => normalize(item.name)).filter(Boolean));
  const outOfStock = items.filter((item) => normalizeInventoryStockNumber(item.stock) === 0);
  const lowStock = items.filter((item) => {
    const stock = normalizeInventoryStockNumber(item.stock);
    return stock > 0 && stock <= normalizeInventoryStockNumber(item.low_stock_threshold);
  });
  const expiringSoon = items.filter((item) => {
    const days = daysUntil(item.expires_at);
    return days !== null && days >= 0 && days <= 30;
  });
  const expired = items.filter((item) => {
    const days = daysUntil(item.expires_at);
    return days !== null && days < 0;
  });
  const stockCorrect = items.filter((item) => {
    const labels = getItemSignals(item).map((signal) => signal.label);
    return labels.includes('Disponible') && !labels.includes('Caducado') && !labels.includes('Caduca hoy') && !labels.includes('Caduca pronto');
  });
  const pendingDonations = inventoryDonationCandidates(donations);

  return {
    totalProducts: productNames.size || items.length,
    totalLots: items.length,
    estimatedValue: items.reduce((total, item) => total + (normalizeInventoryStockNumber(item.stock) * inventoryUnitValue(item)), 0),
    criticalProducts: new Set([...outOfStock, ...lowStock, ...expired].map((item) => item.id)).size,
    expiringSoon: expiringSoon.length,
    lowStock: lowStock.length,
    outOfStock: outOfStock.length,
    stockCorrect: stockCorrect.length,
    pendingDonations: pendingDonations.length,
    recentDonationItems: items.filter((item) => itemHasRecentDonation(item, data)).length,
    latestEntry: latestMovement(movements, 'Entrada'),
    latestExit: latestMovement(movements, 'Salida'),
    timeline: buildInventoryTimeline({ movements, donations, campaigns })
  };
}

function buildQuickFilters(insights) {
  return [
    { id: 'Todos', label: 'Todos', count: insights.totalLots },
    { id: 'Solo criticos', label: 'Solo críticos', count: insights.criticalProducts },
    { id: 'Proximos a caducar', label: 'Próximos a caducar', count: insights.expiringSoon },
    { id: 'Sin stock', label: 'Sin stock', count: insights.outOfStock },
    { id: 'Donaciones recientes', label: 'Donaciones recientes', count: insights.recentDonationItems }
  ];
}

function matchesQuickFilter(item, quickFilter, data = {}) {
  if (quickFilter === 'Todos') return true;
  const labels = getItemSignals(item).map((signal) => signal.label);
  if (quickFilter === 'Solo criticos') return labels.includes('Agotado') || labels.includes('Stock bajo') || labels.includes('Caducado');
  if (quickFilter === 'Proximos a caducar') return labels.includes('Caduca hoy') || labels.includes('Caduca pronto');
  if (quickFilter === 'Sin stock') return labels.includes('Agotado');
  if (quickFilter === 'Donaciones recientes') return itemHasRecentDonation(item, data);
  return true;
}

function buildLatestMovementByItem(movements = []) {
  return movements.reduce((map, movement) => {
    const key = `${movement.item_id}:${movement.movement_type}`;
    const current = map.get(key);
    if (!current || String(movement.moved_at || '').localeCompare(String(current.moved_at || '')) > 0) map.set(key, movement);
    return map;
  }, new Map());
}

function latestMovement(movements = [], type) {
  return movements
    .filter((item) => item.movement_type === type)
    .sort((a, b) => String(b.moved_at || '').localeCompare(String(a.moved_at || '')))[0];
}

function buildInventoryTimeline({ movements = [], donations = [], campaigns = [] }) {
  const movementRows = movements.map((movement) => {
    const parsed = parseInventoryNotes(movement.notes || '');
    const reason = parsed.meta.Motivo || parsed.visible || '';
    const regularization = normalize(reason).includes('regulariz');
    return {
      id: `movement-${movement.id}`,
      date: movement.moved_at,
      title: movement.item_name || 'Producto',
      detail: `${formatQuantity(movement.quantity)} unidades - ${reason || movement.responsible || 'Movimiento registrado'}`,
      type: regularization ? 'Regularización' : movement.movement_type,
      dot: regularization ? 'bg-amber-500' : movement.movement_type === 'Entrada' ? 'bg-emerald-500' : 'bg-sky-500'
    };
  });

  const donationRows = inventoryDonationCandidates(donations).map((donation) => ({
    id: `donation-${donation.id}`,
    date: donation.donated_at || donation.created_at,
    title: donation.donor || 'Donación',
    detail: donation.donation_type || donation.notes || 'Donación pendiente de registrar',
    type: 'Donación',
    dot: 'bg-blue-500'
  }));

  const campaignRows = campaigns.slice(0, 6).map((campaign) => ({
    id: `campaign-${campaign.id}`,
    date: campaign.start_date || campaign.created_at,
    title: campaign.name || 'Campaña',
    detail: campaign.observations || campaign.description || campaign.status || 'Campaña operativa',
    type: 'Campaña',
    dot: 'bg-brand-600'
  }));

  return [...movementRows, ...donationRows, ...campaignRows]
    .filter((item) => item.date || item.title)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 6);
}

function itemHasRecentDonation(item, data = {}) {
  const normalizedDonor = normalize(item.donor);
  const recentDonationDonors = new Set(inventoryDonationCandidates(data.donations || [])
    .filter((donation) => isRecentDate(donation.donated_at || donation.created_at, 30))
    .map((donation) => normalize(donation.donor))
    .filter(Boolean));
  const hasDonorMatch = normalizedDonor && recentDonationDonors.has(normalizedDonor);
  const hasRecentEntry = (data.inventory_movements || []).some((movement) => (
    movement.item_id === item.id
    && movement.movement_type === 'Entrada'
    && isRecentDate(movement.moved_at, 30)
  ));
  return hasDonorMatch || hasRecentEntry;
}

function inventoryDonationCandidates(donations = []) {
  return donations.filter((donation) => {
    const text = normalize([donation.donation_type, donation.operation_type, donation.category, donation.notes].join(' '));
    const status = normalize(donation.status || donation.estado || '');
    const isInventoryDonation = text.includes('alimentos') || text.includes('especie') || text.includes('producto') || text.includes('material');
    const isOpen = !status || status.includes('pend') || status.includes('recib') || status.includes('registr');
    return isInventoryDonation && isOpen && !donation.inventory_movement_id;
  });
}

function isRecentDate(value, days) {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  return diff >= 0 && diff <= days;
}

function inventoryUnitValue(item) {
  return positiveNumber(item.unit_value)
    ?? positiveNumber(item.estimated_unit_value)
    ?? positiveNumber(item.economic_value)
    ?? positiveNumber(item.price)
    ?? positiveNumber(item.cost)
    ?? 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatMovementShort(movement) {
  if (!movement) return '-';
  return formatDate(movement.moved_at);
}

function matchesStatus(item, status) {
  if (status === 'Todos') return true;
  const labels = getItemSignals(item).map((signal) => signal.label);
  if (status === 'Alertas') return labels.some((label) => ['Agotado', 'Stock bajo', 'Caducado', 'Caduca hoy', 'Caduca pronto'].includes(label));
  if (status === 'Agotados') return labels.includes('Agotado');
  if (status === 'Stock critico') return labels.includes('Agotado') || labels.includes('Stock bajo');
  if (status === 'Stock bajo') return labels.includes('Stock bajo');
  if (status === 'Caducados') return labels.includes('Caducado');
  if (status === 'Caducidad proxima') return labels.includes('Caduca hoy') || labels.includes('Caduca pronto');
  if (status === 'Caducidad próxima') return labels.includes('Caduca hoy') || labels.includes('Caduca pronto');
  if (status === 'Correctos') return labels.includes('Disponible') && !labels.includes('Caducado') && !labels.includes('Caduca hoy') && !labels.includes('Caduca pronto');
  return true;
}

function buildInventoryRelationWarnings(item, data) {
  if (!item) return [];
  const relations = [];
  const movements = (data.inventory_movements || []).filter((movement) => movement.item_id === item.id);
  const deliveries = (data.deliveries || []).filter((delivery) => delivery.inventory_item_id === item.id);
  const socialEvents = (data.social_value_events || []).filter((event) => event.inventory_item_id === item.id);
  const donations = (data.donations || []).filter((donation) => donation.inventory_item_id === item.id);

  if (normalizeInventoryStockNumber(item.stock) > 0) relations.push(`Stock actual: ${formatInventoryStockLabel(item, { prefix: '' })}`.trim());
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
    if (labels.includes('Stock bajo') || labels.includes('Caduca hoy') || labels.includes('Caduca pronto')) return 1;
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

function parseInventoryNotes(notes = '') {
  const meta = {};
  const visible = [];
  String(notes || '').split(/\r?\n/).forEach((line) => {
    const clean = line.trim();
    if (!clean) return;
    const match = clean.match(/^([^:]+):\s*(.*)$/);
    const label = match?.[1]?.trim();
    if (label && inventoryMetaLabels.includes(label)) {
      meta[label] = match[2]?.trim() || '';
    } else {
      visible.push(clean);
    }
  });
  return { meta, visible: visible.join('\n') };
}

function buildInventoryNotes(visibleNotes, meta = {}) {
  const lines = Object.entries(meta)
    .map(([label, value]) => [label, String(value || '').trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  const notes = String(visibleNotes || '').trim();
  return [...lines, notes].filter(Boolean).join('\n');
}

function nextInventoryReference(prefix, data = {}) {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`${prefix}-${year}-(\\d{6})`, 'i');
  const sources = [
    ...(data.inventory_items || []).flatMap((item) => [item.notes]),
    ...(data.inventory_movements || []).flatMap((movement) => [movement.notes]),
    ...(data.donations || []).flatMap((donation) => [donation.reference, donation.notes])
  ];
  const lastNumber = sources.reduce((max, value) => {
    const match = String(value || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${year}-${String(lastNumber + 1).padStart(6, '0')}`;
}

function documentNumberFromMeta(meta = {}) {
  return Object.values(DOCUMENT_FIELD_LABELS).map((label) => meta[label]).find(Boolean)
    || meta['Documento asociado']
    || meta.Documento
    || '';
}

function buildDocumentMeta(form) {
  const type = form.document_type || 'Sin documento';
  const numberLabel = DOCUMENT_FIELD_LABELS[type];
  const documentNumber = type === 'Documento interno'
    ? form.document_number || form.internal_document_number
    : form.document_number;
  return {
    'Tipo de documento': type,
    ...(numberLabel && documentNumber ? { [numberLabel]: documentNumber } : {}),
    ...(form.document_file_data_url ? { 'Archivo documento': form.document_file_data_url } : {}),
    ...(form.document_file_name ? { 'Nombre archivo': form.document_file_name } : {}),
    ...(form.document_file_type ? { 'Tipo archivo': form.document_file_type } : {})
  };
}

function getDocumentSummary(meta = {}) {
  const type = meta['Tipo de documento'] || (meta['Documento asociado'] || meta.Documento ? 'Documento interno' : '');
  if (!type || type === 'Sin documento') return 'Sin documento';
  const label = DOCUMENT_FIELD_LABELS[type];
  const number = label ? meta[label] : documentNumberFromMeta(meta);
  return [type, number].filter(Boolean).join(': ');
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
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
