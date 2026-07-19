import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock3,
  HandHeart,
  Megaphone,
  PackageCheck,
  Plus,
  Search,
  Truck,
  Users
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { formatDate, formatDateTime, todayISO } from '../lib/formatters';
import {
  AGENDA_EVENT_STATUSES,
  AGENDA_EVENT_TYPES,
  CAMPAIGN_STATUSES
} from '../services/agenda/AgendaOperativaService';

const EMPTY_EVENT = {
  title: '',
  description: '',
  event_type: 'Entrega',
  status: 'Pendiente',
  event_at: `${todayISO()}T09:00`,
  campaign_id: '',
  responsible: '',
  beneficiary_id: '',
  product_id: '',
  volunteer_id: '',
  priority: 'Normal',
  notes: ''
};

const EMPTY_CAMPAIGN = {
  name: '',
  description: '',
  start_date: todayISO(),
  end_date: '',
  status: 'Planificada',
  responsible: '',
  beneficiary_ids: [],
  product_ids: [],
  observations: ''
};

const eventIcons = {
  Entrega: PackageCheck,
  Campana: Megaphone,
  Recogida: Truck,
  Reunion: Users,
  Evento: CalendarDays,
  Voluntariado: HandHeart,
  Aviso: Bell,
  Caducidad: AlertTriangle
};

export function AgendaOperativa({ data, actions }) {
  const [view, setView] = useState('daily');
  const [filters, setFilters] = useState({ search: '', type: '', responsible: '', campaignId: '', status: '' });
  const [eventForm, setEventForm] = useState(null);
  const [campaignForm, setCampaignForm] = useState(null);
  const agenda = actions.agenda;
  const viewModel = useMemo(
    () => agenda?.buildViewModel({ view, filters }) || { events: [], groupedEvents: {}, campaigns: [], recommendations: [], metrics: {} },
    [agenda, view, filters, data]
  );
  const campaigns = data.campanas || [];
  const beneficiaries = data.beneficiaries || [];
  const products = data.inventory_items || [];
  const volunteers = data.volunteers || [];

  async function submitEvent(event) {
    event.preventDefault();
    if (eventForm.id) await actions.updateAgendaEvent(eventForm.id, eventForm);
    else await actions.createAgendaEvent(eventForm);
    setEventForm(null);
  }

  async function submitCampaign(event) {
    event.preventDefault();
    if (campaignForm.id) await actions.updateAgendaCampaign(campaignForm.id, campaignForm);
    else await actions.createAgendaCampaign(campaignForm);
    setCampaignForm(null);
  }

  return (
    <>
      <PageHeader
        title="AGENDA OPERATIVA"
        description="Centro de planificacion diaria segun campanas, necesidades, productos, voluntarios, recogidas y avisos."
        actions={(
          <>
            <Button variant="secondary" onClick={() => setCampaignForm({ ...EMPTY_CAMPAIGN })}>
              <Megaphone size={16} /> Nueva campana
            </Button>
            <Button onClick={() => setEventForm({ ...EMPTY_EVENT })}>
              <Plus size={16} /> Nuevo evento
            </Button>
          </>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Hoy" value={viewModel.metrics.today || 0} icon={Clock3} tone="blue" />
        <MetricCard label="Esta semana" value={viewModel.metrics.week || 0} icon={CalendarRange} tone="green" />
        <MetricCard label="Campanas activas" value={viewModel.metrics.activeCampaigns || 0} icon={Megaphone} tone="orange" />
        <MetricCard label="Caducidades a vigilar" value={viewModel.metrics.expiring || 0} icon={AlertTriangle} tone="red" />
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ['daily', 'Dia'],
              ['weekly', 'Semana'],
              ['monthly', 'Mes'],
              ['list', 'Lista']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold ${view === id ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid flex-1 gap-3 md:grid-cols-2 xl:max-w-4xl xl:grid-cols-5">
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700"><Search size={15} /> Buscar</span>
              <input className={inputClass} value={filters.search} onChange={(event) => updateFilter(setFilters, 'search', event.target.value)} />
            </label>
            <FilterSelect label="Tipo" value={filters.type} onChange={(value) => updateFilter(setFilters, 'type', value)} options={AGENDA_EVENT_TYPES.map((item) => [item.id, item.label])} />
            <FilterSelect label="Campana" value={filters.campaignId} onChange={(value) => updateFilter(setFilters, 'campaignId', value)} options={campaigns.map((item) => [item.id, item.name])} />
            <FilterSelect label="Estado" value={filters.status} onChange={(value) => updateFilter(setFilters, 'status', value)} options={AGENDA_EVENT_STATUSES.map((item) => [item, item])} />
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Responsable</span>
              <input className={inputClass} value={filters.responsible} onChange={(event) => updateFilter(setFilters, 'responsible', event.target.value)} />
            </label>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-5">
          {Object.entries(viewModel.groupedEvents).map(([group, events]) => (
            <section key={group} className="rounded-md border border-slate-200 bg-white shadow-panel">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-ink">{formatGroupLabel(group, view)}</h3>
                <p className="mt-1 text-sm text-slate-500">{events.length} eventos planificados o pendientes</p>
              </div>
              <div className="divide-y divide-slate-100">
                {events.map((item) => (
                  <AgendaEventRow
                    key={item.id}
                    event={item}
                    campaign={campaigns.find((campaign) => campaign.id === item.campaign_id)}
                    onEdit={() => setEventForm(toEventForm(item))}
                    onDelete={() => actions.deleteAgendaEvent(item.id)}
                  />
                ))}
              </div>
            </section>
          ))}
          {!viewModel.events.length && (
            <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-panel">
              No hay eventos con los filtros actuales.
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
            <h3 className="font-bold text-ink">Recomendaciones operativas</h3>
            <p className="mt-1 text-sm text-slate-500">Sugerencias segun familias, donaciones, stock, caducidad y voluntarios.</p>
            <div className="mt-4 space-y-3">
              {viewModel.recommendations.slice(0, 8).map((item, index) => (
                <article key={`${item.type}-${item.title}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.type}</p>
                      <h4 className="mt-1 font-bold text-ink">{item.title}</h4>
                      <p className="mt-1 text-slate-600">{item.detail}</p>
                    </div>
                    <span className={priorityClass(item.priority)}>{item.priority}</span>
                  </div>
                </article>
              ))}
              {!viewModel.recommendations.length && <p className="text-sm text-slate-500">No hay recomendaciones automaticas con los datos actuales.</p>}
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
            <h3 className="font-bold text-ink">Campanas</h3>
            <div className="mt-4 space-y-3">
              {viewModel.campaigns.slice(0, 6).map((campaign) => (
                <article key={campaign.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{campaign.status || 'Planificada'}</p>
                      <h4 className="mt-1 font-bold text-ink">{campaign.name}</h4>
                      <p className="mt-1 text-sm text-slate-600">{campaign.description || 'Sin descripcion'}</p>
                      <p className="mt-2 text-xs text-slate-500">{dateRange(campaign.start_date, campaign.end_date)}</p>
                    </div>
                    <Button variant="secondary" onClick={() => setCampaignForm(toCampaignForm(campaign))}>Editar</Button>
                  </div>
                </article>
              ))}
              {!viewModel.campaigns.length && <p className="text-sm text-slate-500">No hay campanas con los filtros actuales.</p>}
            </div>
          </section>
        </aside>
      </section>

      {eventForm && (
        <Modal title={eventForm.id ? 'Editar evento' : 'Nuevo evento'} onClose={() => setEventForm(null)}>
          <form className="grid gap-4" onSubmit={submitEvent}>
            <FormField label="Titulo" required><input className={inputClass} value={eventForm.title} onChange={(event) => updateForm(setEventForm, 'title', event.target.value)} /></FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Tipo"><select className={inputClass} value={eventForm.event_type} onChange={(event) => updateForm(setEventForm, 'event_type', event.target.value)}>{AGENDA_EVENT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></FormField>
              <FormField label="Estado"><select className={inputClass} value={eventForm.status} onChange={(event) => updateForm(setEventForm, 'status', event.target.value)}>{AGENDA_EVENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select></FormField>
              <FormField label="Fecha y hora"><input className={inputClass} type="datetime-local" value={eventForm.event_at || ''} onChange={(event) => updateForm(setEventForm, 'event_at', event.target.value)} /></FormField>
              <FormField label="Responsable"><input className={inputClass} value={eventForm.responsible} onChange={(event) => updateForm(setEventForm, 'responsible', event.target.value)} /></FormField>
              <FormField label="Campana"><select className={inputClass} value={eventForm.campaign_id || ''} onChange={(event) => updateForm(setEventForm, 'campaign_id', event.target.value)}><option value="">Sin campana</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
              <FormField label="Beneficiario"><select className={inputClass} value={eventForm.beneficiary_id || ''} onChange={(event) => updateForm(setEventForm, 'beneficiary_id', event.target.value)}><option value="">Sin beneficiario</option>{beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></FormField>
              <FormField label="Producto"><select className={inputClass} value={eventForm.product_id || ''} onChange={(event) => updateForm(setEventForm, 'product_id', event.target.value)}><option value="">Sin producto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
              <FormField label="Voluntario"><select className={inputClass} value={eventForm.volunteer_id || ''} onChange={(event) => updateForm(setEventForm, 'volunteer_id', event.target.value)}><option value="">Sin voluntario</option>{volunteers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></FormField>
            </div>
            <FormField label="Descripcion"><textarea className={inputClass} rows={3} value={eventForm.description || ''} onChange={(event) => updateForm(setEventForm, 'description', event.target.value)} /></FormField>
            <FormField label="Observaciones"><textarea className={inputClass} rows={3} value={eventForm.notes || ''} onChange={(event) => updateForm(setEventForm, 'notes', event.target.value)} /></FormField>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEventForm(null)}>Cancelar</Button><Button type="submit">Guardar evento</Button></div>
          </form>
        </Modal>
      )}

      {campaignForm && (
        <Modal title={campaignForm.id ? 'Editar campana' : 'Nueva campana'} onClose={() => setCampaignForm(null)} wide>
          <form className="grid gap-4" onSubmit={submitCampaign}>
            <FormField label="Nombre" required><input className={inputClass} value={campaignForm.name} onChange={(event) => updateForm(setCampaignForm, 'name', event.target.value)} /></FormField>
            <FormField label="Descripcion"><textarea className={inputClass} rows={3} value={campaignForm.description || ''} onChange={(event) => updateForm(setCampaignForm, 'description', event.target.value)} /></FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Fecha inicio"><input className={inputClass} type="date" value={campaignForm.start_date || ''} onChange={(event) => updateForm(setCampaignForm, 'start_date', event.target.value)} /></FormField>
              <FormField label="Fecha fin"><input className={inputClass} type="date" value={campaignForm.end_date || ''} onChange={(event) => updateForm(setCampaignForm, 'end_date', event.target.value)} /></FormField>
              <FormField label="Estado"><select className={inputClass} value={campaignForm.status} onChange={(event) => updateForm(setCampaignForm, 'status', event.target.value)}>{CAMPAIGN_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select></FormField>
              <FormField label="Responsable"><input className={inputClass} value={campaignForm.responsible || ''} onChange={(event) => updateForm(setCampaignForm, 'responsible', event.target.value)} /></FormField>
              <FormField label="Beneficiarios asociados"><select multiple className={`${inputClass} min-h-32`} value={campaignForm.beneficiary_ids || []} onChange={(event) => updateForm(setCampaignForm, 'beneficiary_ids', selectedValues(event))}>{beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></FormField>
              <FormField label="Productos asociados"><select multiple className={`${inputClass} min-h-32`} value={campaignForm.product_ids || []} onChange={(event) => updateForm(setCampaignForm, 'product_ids', selectedValues(event))}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
            </div>
            <FormField label="Observaciones"><textarea className={inputClass} rows={3} value={campaignForm.observations || ''} onChange={(event) => updateForm(setCampaignForm, 'observations', event.target.value)} /></FormField>
            <div className="flex flex-wrap justify-end gap-2">
              {campaignForm.id && campaignForm.status !== 'Cancelada' && <Button variant="danger" onClick={() => actions.cancelAgendaCampaign(campaignForm.id).then(() => setCampaignForm(null))}>Cancelar campana</Button>}
              <Button variant="secondary" onClick={() => setCampaignForm(null)}>Cerrar</Button>
              <Button type="submit">Guardar campana</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function AgendaEventRow({ event, campaign, onEdit, onDelete }) {
  const Icon = eventIcons[event.event_type] || ClipboardList;
  return (
    <article className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${eventTypeClass(event.event_type)}`}><Icon size={14} /> {event.event_type}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{event.status || 'Pendiente'}</span>
            {campaign && <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{campaign.name}</span>}
          </div>
          <h3 className="mt-3 text-lg font-bold text-ink">{event.title}</h3>
          {event.description && <p className="mt-1 text-sm text-slate-600">{event.description}</p>}
          <p className="mt-3 text-xs font-semibold text-slate-500">{event.event_at ? formatDateTime(event.event_at) : 'Sin fecha fija'} - Responsable: {event.responsible || 'Sin asignar'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={onEdit}>Editar</Button>
          <Button variant="secondary" onClick={onDelete}>Eliminar</Button>
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value, icon: Icon, tone }) {
  return (
    <article className={`rounded-md border p-4 shadow-panel ${metricClass(tone)}`}>
      <div className="flex items-center justify-between gap-3"><span className="rounded-md bg-white/70 p-2"><Icon size={20} /></span><span className="text-3xl font-bold">{value}</span></div>
      <p className="mt-3 text-sm font-bold">{label}</p>
    </article>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map(([id, optionLabel]) => <option key={id} value={id}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function updateFilter(setFilters, key, value) {
  setFilters((current) => ({ ...current, [key]: value }));
}

function updateForm(setForm, key, value) {
  setForm((current) => ({ ...current, [key]: value }));
}

function selectedValues(event) {
  return [...event.target.selectedOptions].map((option) => option.value);
}

function toEventForm(event) {
  return { ...EMPTY_EVENT, ...event, event_at: event.event_at ? String(event.event_at).slice(0, 16) : '' };
}

function toCampaignForm(campaign) {
  return {
    ...EMPTY_CAMPAIGN,
    ...campaign,
    beneficiary_ids: campaign.beneficiary_ids || [],
    product_ids: campaign.product_ids || []
  };
}

function formatGroupLabel(group, view) {
  if (group === 'Lista') return 'Lista cronologica';
  if (group === 'Sin fecha') return 'Sin fecha fija';
  if (view === 'monthly') return `Mes ${group}`;
  if (view === 'weekly') return `Semana desde ${formatDate(group)}`;
  return formatDate(group);
}

function dateRange(start, end) {
  if (!start && !end) return 'Sin fechas definidas';
  if (start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  return start ? `Desde ${formatDate(start)}` : `Hasta ${formatDate(end)}`;
}

function priorityClass(priority) {
  if (priority === 'Alta') return 'rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700';
  if (priority === 'Media') return 'rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700';
  return 'rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700';
}

function metricClass(tone) {
  const classes = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    red: 'border-red-200 bg-red-50 text-red-800'
  };
  return classes[tone] || classes.blue;
}

function eventTypeClass(type) {
  const classes = {
    Entrega: 'bg-blue-50 text-blue-700',
    Campana: 'bg-emerald-50 text-emerald-700',
    Recogida: 'bg-orange-50 text-orange-700',
    Reunion: 'bg-slate-100 text-slate-700',
    Evento: 'bg-violet-50 text-violet-700',
    Voluntariado: 'bg-teal-50 text-teal-700',
    Aviso: 'bg-yellow-50 text-yellow-700',
    Caducidad: 'bg-red-50 text-red-700'
  };
  return classes[type] || classes.Aviso;
}
