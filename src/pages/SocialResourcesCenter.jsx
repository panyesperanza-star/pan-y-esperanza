import {
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  History,
  Landmark,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { formatDate, normalize, todayISO } from '../lib/formatters';
import { buildSocialResourceMonitoring, buildSocialResourceRecommendations, isResourceOfficiallyVerified } from '../lib/socialResourceRecommendations';
import {
  BENEFICIARY_RESOURCE_STATUSES,
  SOCIAL_RESOURCE_CATEGORIES,
  SOCIAL_RESOURCE_SCOPES,
  SOCIAL_RESOURCE_STATUSES
} from '../services/socialResources/SocialResourceService';

const emptyResource = {
  name: '',
  organization_name: '',
  category: 'Alimentación',
  description: '',
  requirements: '',
  target_audience: '',
  required_documents: '',
  benefit: '',
  opens_at: '',
  deadline_at: '',
  address: '',
  municipality: '',
  phone: '',
  email: '',
  web_url: '',
  official_url: '',
  application_method: '',
  status: 'Activo',
  scope: 'municipal',
  last_verified_at: '',
  age_min: '',
  age_max: '',
  family_situation: '',
  employment_situation: '',
  housing_situation: '',
  notes: ''
};

const trackingLabels = {
  saved: 'Guardado',
  interested: 'Interesado',
  started: 'Solicitud iniciada',
  documents_pending: 'Documentacion pendiente',
  submitted: 'Solicitud presentada',
  granted: 'Concedida',
  denied: 'Denegada',
  not_applicable: 'No procede'
};

const statusStyles = {
  Activo: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Proximamente: 'border-amber-200 bg-amber-50 text-amber-800',
  Cerrado: 'border-slate-200 bg-slate-100 text-slate-700',
  'Pendiente de verificar': 'border-amber-200 bg-amber-50 text-amber-800'
};

const trackingStyles = {
  saved: 'bg-slate-100 text-slate-700',
  interested: 'bg-brand-50 text-brand-700',
  started: 'bg-blue-50 text-blue-700',
  documents_pending: 'bg-amber-50 text-amber-800',
  submitted: 'bg-indigo-50 text-indigo-700',
  granted: 'bg-emerald-50 text-emerald-700',
  denied: 'bg-red-50 text-red-700',
  not_applicable: 'bg-slate-100 text-slate-600'
};

const deadlineFilters = [
  { id: '', label: 'Todas' },
  { id: 'open', label: 'Abiertas' },
  { id: 'next30', label: 'Vencen pronto' },
  { id: 'expired', label: 'Vencidas' },
  { id: 'no_deadline', label: 'Sin limite' }
];

export function SocialResourcesCenter({ data, actions, currentUser, navigationTarget, onNavigate }) {
  const resources = data.social_resources || [];
  const links = data.beneficiary_social_resources || [];
  const followups = data.social_resource_followups || [];
  const history = data.social_resource_history || [];
  const beneficiaries = data.beneficiaries || [];
  const canCreate = canDo(currentUser, 'social-resources', 'create');
  const canEdit = canDo(currentUser, 'social-resources', 'edit');
  const canDelete = canDo(currentUser, 'social-resources', 'delete');
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    municipality: '',
    age: '',
    family: '',
    employment: '',
    housing: '',
    status: '',
    deadline: ''
  });
  const [beneficiaryQuery, setBeneficiaryQuery] = useState('');
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState(navigationTarget?.profileId || '');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [editing, setEditing] = useState(null);
  const [trackingTarget, setTrackingTarget] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (navigationTarget?.profileId) setSelectedBeneficiaryId(navigationTarget.profileId);
    if (navigationTarget?.resourceId) setSelectedResourceId(navigationTarget.resourceId);
    if (navigationTarget?.resourceAction === 'track' && navigationTarget?.resourceId) {
      const resource = resources.find((item) => item.id === navigationTarget.resourceId);
      if (resource) setTrackingTarget(resource);
    }
  }, [navigationTarget?.profileId, navigationTarget?.resourceId, navigationTarget?.resourceAction, navigationTarget?.key, resources]);

  const selectedBeneficiary = beneficiaries.find((item) => item.id === selectedBeneficiaryId) || null;
  const selectedResource = resources.find((item) => item.id === selectedResourceId) || null;
  const selectedResourceHistory = history.filter((item) => item.resource_id === selectedResourceId);
  const selectedLinks = links.filter((link) => link.beneficiary_id === selectedBeneficiaryId);
  const monitoring = useMemo(() => buildSocialResourceMonitoring({
    resources,
    beneficiaries,
    documents: data.beneficiary_documents || [],
    links
  }), [resources, beneficiaries, data.beneficiary_documents, links]);
  const alertsByResourceId = useMemo(() => new Map(
    monitoring.alerts.map((item) => [item.resource.id, item])
  ), [monitoring]);
  const recommendationAnalysis = useMemo(() => buildSocialResourceRecommendations({
    beneficiary: selectedBeneficiary,
    resources,
    documents: data.beneficiary_documents || [],
    links
  }), [selectedBeneficiary, resources, data.beneficiary_documents, links]);
  const recommendationsByResourceId = useMemo(() => new Map(
    recommendationAnalysis.results.map((item) => [item.resource.id, item])
  ), [recommendationAnalysis]);

  const municipalities = useMemo(() => {
    return [...new Set(resources.map((resource) => resource.municipality).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [resources]);

  const filteredBeneficiaries = useMemo(() => {
    const query = normalize(beneficiaryQuery);
    return beneficiaries
      .filter((beneficiary) => !query || [
        beneficiary.full_name,
        beneficiary.code,
        beneficiary.document_id,
        beneficiary.phone,
        beneficiary.email
      ].some((value) => normalize(value).includes(query)))
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'es'))
      .slice(0, 8);
  }, [beneficiaries, beneficiaryQuery]);

  const filteredResources = useMemo(() => {
    return resources
      .filter((resource) => matchesResource(resource, filters))
      .sort(compareResourcePriority);
  }, [resources, filters]);

  const summary = useMemo(() => ({
    active: monitoring.open.length,
    expiring: monitoring.closingSoon.length,
    linked: selectedLinks.length,
    openTracking: selectedLinks.filter((link) => !['granted', 'denied', 'not_applicable'].includes(link.status)).length
  }), [monitoring, selectedLinks]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function handleSaveResource(payload) {
    setError('');
    setNotice('');
    try {
      if (payload.id) {
        await actions.updateSocialResource(payload.id, payload);
        setNotice('Recurso actualizado correctamente.');
      } else {
        await actions.createSocialResource(payload);
        setNotice('Recurso creado correctamente.');
      }
      setEditing(null);
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar el recurso.');
    }
  }

  async function handleDeleteResource() {
    if (!deleting) return;
    setError('');
    setNotice('');
    try {
      await actions.deleteSocialResource(deleting.id);
      setNotice('Recurso eliminado correctamente.');
      setDeleting(null);
      if (selectedResourceId === deleting.id) setSelectedResourceId('');
    } catch (deleteError) {
      setError(deleteError.message || 'No se pudo eliminar el recurso.');
    }
  }

  async function handleSaveTracking(resource, payload = {}) {
    setError('');
    setNotice('');
    try {
      await actions.saveBeneficiarySocialResource(resource.id, selectedBeneficiaryId, payload);
      setNotice('Seguimiento registrado en el expediente.');
      setTrackingTarget(null);
    } catch (trackingError) {
      setError(trackingError.message || 'No se pudo vincular el recurso al expediente.');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Centro de Recursos Sociales"
        description="Mantiene recursos verificados, detecta convocatorias relevantes y recomienda por reglas explicables."
        actions={canCreate && (
          <Button onClick={() => setEditing({ ...emptyResource })}>
            <Plus size={16} /> Nuevo recurso
          </Button>
        )}
      />

      {notice && <div className="rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">{notice}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Convocatorias abiertas" value={summary.active} icon={Landmark} tone="brand" />
        <SummaryCard label="Cierran pronto" value={summary.expiring} icon={CalendarClock} tone="red" />
        <SummaryCard label="Guardados en expediente" value={summary.linked} icon={Save} tone="blue" />
        <SummaryCard label="Seguimientos abiertos" value={summary.openTracking} icon={Clock3} tone="red" />
      </section>

      <ResourceAlertsCenter
        monitoring={monitoring}
        onView={(resource) => setSelectedResourceId(resource.id)}
        onOpenAffected={(alert) => onNavigate?.({
          moduleId: 'beneficiaries',
          beneficiaryIds: alert.beneficiaries.map((beneficiary) => beneficiary.id),
          label: `${alert.resource.name}: ${alert.affectedCount} posibles beneficiarios`
        })}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
            <input
              className={`${inputClass} pl-10`}
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Buscar por nombre, entidad, descripcion, requisitos o como solicitarlo..."
            />
          </div>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
            <input
              className={`${inputClass} pl-10`}
              value={beneficiaryQuery}
              onChange={(event) => setBeneficiaryQuery(event.target.value)}
              placeholder="Seleccionar beneficiario por nombre, codigo, DNI o telefono..."
            />
          </div>
        </div>

        {beneficiaryQuery && (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {filteredBeneficiaries.map((beneficiary) => (
              <button
                key={beneficiary.id}
                type="button"
                onClick={() => {
                  setSelectedBeneficiaryId(beneficiary.id);
                  setBeneficiaryQuery('');
                }}
                className={`rounded-md border p-3 text-left transition hover:border-brand-300 hover:bg-brand-50 ${selectedBeneficiaryId === beneficiary.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
              >
                <p className="font-bold text-ink">{beneficiary.full_name}</p>
                <p className="text-xs text-slate-500">{beneficiary.code || 'Sin codigo'} · {beneficiary.document_id || 'Sin documento'}</p>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SelectFilter label="Categoria" value={filters.category} onChange={(value) => updateFilter('category', value)} options={SOCIAL_RESOURCE_CATEGORIES} />
          <SelectFilter label="Municipio" value={filters.municipality} onChange={(value) => updateFilter('municipality', value)} options={municipalities} />
          <TextFilter label="Edad" value={filters.age} onChange={(value) => updateFilter('age', value)} placeholder="Ej. 42" />
          <TextFilter label="Situacion familiar" value={filters.family} onChange={(value) => updateFilter('family', value)} placeholder="menores, monoparental..." />
          <TextFilter label="Empleo" value={filters.employment} onChange={(value) => updateFilter('employment', value)} placeholder="desempleo..." />
          <SelectFilter label="Estado" value={filters.status} onChange={(value) => updateFilter('status', value)} options={SOCIAL_RESOURCE_STATUSES} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <TextFilter label="Vivienda" value={filters.housing} onChange={(value) => updateFilter('housing', value)} placeholder="alquiler, desahucio..." />
          <SelectFilter label="Fecha limite" value={filters.deadline} onChange={(value) => updateFilter('deadline', value)} options={deadlineFilters.filter((item) => item.id).map((item) => item.id)} labels={Object.fromEntries(deadlineFilters.map((item) => [item.id, item.label]))} />
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={() => setFilters({ search: '', category: '', municipality: '', age: '', family: '', employment: '', housing: '', status: '', deadline: '' })}>
              <Filter size={16} /> Limpiar filtros
            </Button>
          </div>
        </div>
      </section>

      {selectedBeneficiary && (
        <RecommendationsPanel
          analysis={recommendationAnalysis}
          onView={(resource) => setSelectedResourceId(resource.id)}
          onTrack={(resource) => setTrackingTarget(resource)}
        />
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredResources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              recommendation={recommendationsByResourceId.get(resource.id)}
              alert={alertsByResourceId.get(resource.id)}
              selected={selectedResourceId === resource.id}
              link={selectedBeneficiary ? findLink(links, selectedBeneficiary.id, resource.id) : null}
              canEdit={canEdit}
              canDelete={canDelete}
              onSelect={() => setSelectedResourceId(resource.id)}
              onEdit={() => setEditing(resource)}
              onDelete={() => setDeleting(resource)}
              onTrack={() => setTrackingTarget(resource)}
              beneficiarySelected={Boolean(selectedBeneficiary)}
            />
          ))}
          {filteredResources.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 lg:col-span-2">
              <Landmark className="mx-auto mb-3 text-slate-300" size={36} />
              <p className="font-semibold text-ink">No hay recursos con estos filtros</p>
              <p className="mt-1 text-sm">Ajusta la busqueda o crea un nuevo recurso cuando exista una ayuda real que registrar.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <BeneficiaryPanel
            beneficiary={selectedBeneficiary}
            links={selectedLinks}
            resources={resources}
            followups={followups}
            onOpenBeneficiary={() => selectedBeneficiary && onNavigate?.({ moduleId: 'beneficiaries', profileId: selectedBeneficiary.id })}
            onTrack={(resource) => setTrackingTarget(resource)}
          />
          <ResourceDetail resource={selectedResource} history={selectedResourceHistory} alert={selectedResource ? alertsByResourceId.get(selectedResource.id) : null} />
          <section className="rounded-xl border border-dashed border-brand-200 bg-brand-50/60 p-4 text-sm text-brand-800">
            <p className="font-bold">Integracion futura preparada</p>
            <p className="mt-1 text-brand-700">La vigilancia automatica queda preparada para fuentes oficiales verificadas. No se hace scraping ni se envian datos personales fuera del ERP.</p>
          </section>
        </aside>
      </section>

      {editing && (
        <Modal wide title={editing.id ? 'Editar recurso social' : 'Nuevo recurso social'} onClose={() => setEditing(null)}>
          <SocialResourceForm initial={editing} onSubmit={handleSaveResource} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {trackingTarget && selectedBeneficiary && (
        <Modal title="Guardar recurso en expediente" onClose={() => setTrackingTarget(null)}>
          <TrackingForm
            resource={trackingTarget}
            beneficiary={selectedBeneficiary}
            currentLink={findLink(links, selectedBeneficiary.id, trackingTarget.id)}
            onSubmit={(payload) => handleSaveTracking(trackingTarget, payload)}
            onCancel={() => setTrackingTarget(null)}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title="Eliminar recurso" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600">Se eliminara el recurso <strong>{deleting.name}</strong> si no esta vinculado a ningun expediente.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDeleteResource}><Trash2 size={16} /> Eliminar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ResourceAlertsCenter({ monitoring, onView, onOpenAffected }) {
  const alertCards = [
    { label: 'Cierra proximamente', value: monitoring.closingSoon.length, tone: 'red', items: monitoring.closingSoon },
    { label: 'Necesita revision', value: monitoring.needsReview.length, tone: 'amber', items: monitoring.needsReview },
    { label: 'Convocatoria abierta', value: monitoring.open.length, tone: 'emerald', items: monitoring.open },
    { label: 'Nueva convocatoria', value: monitoring.newlyCreated.length, tone: 'blue', items: monitoring.affectedByNewResource }
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Centro de alertas de recursos">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Centro de alertas</p>
          <h2 className="mt-1 text-xl font-bold text-ink">Vigencia, verificacion y convocatorias nuevas</h2>
          <p className="mt-1 text-sm text-slate-500">Solo se considera verificada una ayuda con URL oficial, fecha de comprobacion y usuario verificador.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {alertCards.map((card) => <MetricPill key={card.label} label={card.label} value={card.value} tone={card.tone} />)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {alertCards.map((card) => (
          <article key={card.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className={`text-xs font-bold uppercase tracking-wide ${alertTextTone(card.tone)}`}>{card.label}</p>
            <div className="mt-3 space-y-2">
              {card.items.slice(0, 3).map((alert) => (
                <div key={`${card.label}-${alert.resource.id}`} className="rounded-md bg-white p-2 text-sm">
                  <button type="button" className="focus-ring text-left font-bold text-ink hover:text-brand-700" onClick={() => onView(alert.resource)}>
                    {alert.resource.name}
                  </button>
                  <p className="mt-1 text-xs text-slate-500">{alert.resource.organization_name || 'Organismo no indicado'}</p>
                  {card.tone === 'blue' && (
                    <button type="button" className="focus-ring mt-2 text-xs font-bold text-brand-700 hover:text-brand-900" onClick={() => onOpenAffected(alert)} disabled={!alert.affectedCount}>
                      Ver beneficiarios ({alert.affectedCount || 0})
                    </button>
                  )}
                </div>
              ))}
              {!card.items.length && <p className="rounded-md bg-white p-2 text-sm text-slate-500">Sin alertas.</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function alertTextTone(tone) {
  const tones = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
    blue: 'text-blue-700'
  };
  return tones[tone] || tones.emerald;
}

function RecommendationsPanel({ analysis, onView, onTrack }) {
  const recommendations = analysis.recommendations.slice(0, 3);
  return (
    <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm" aria-label="Recursos recomendados">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Recursos recomendados</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{analysis.summaryText}</h2>
          <p className="mt-1 text-sm text-slate-500">Calculo interno por reglas objetivas del ERP. No decide la concesion de ninguna ayuda.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[420px]">
          <MetricPill label="Alta" value={analysis.counts.high} tone="emerald" />
          <MetricPill label="Posible" value={analysis.counts.possible} tone="amber" />
          <MetricPill label="Insuficiente" value={analysis.counts.insufficient} tone="slate" />
          <MetricPill label="No compatible" value={analysis.counts.incompatible} tone="red" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {recommendations.map((item) => (
          <article key={item.resource.id} className={`rounded-xl border p-4 ${item.level.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${item.level.badge}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${item.level.dot}`} /> {item.level.label}
              </span>
              {item.deadline?.isSoon && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-700">Finaliza en {item.deadline.daysRemaining} dias</span>}
            </div>
            <h3 className="mt-3 text-lg font-bold text-ink">{item.resource.name}</h3>
            <p className="text-sm font-semibold text-brand-700">{item.resource.organization_name}</p>
            <p className="mt-2 text-sm text-slate-700">{item.phrase}</p>

            <EvidenceList title="Por que" items={item.checks} empty="Sin coincidencias verificadas." tone="brand" />
            <EvidenceList title="Falta comprobar" items={item.missing} empty="Sin faltantes principales." tone="amber" />
            <DocumentEvidence documentation={item.documentation} />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onView(item.resource)}>Ver recurso</Button>
              <Button onClick={() => onTrack(item.resource)}>Iniciar seguimiento</Button>
            </div>
          </article>
        ))}
        {!recommendations.length && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 xl:col-span-3">
            No hay recursos recomendados con los datos actuales del expediente. Puedes seguir usando el buscador manual.
          </div>
        )}
      </div>
    </section>
  );
}

function MetricPill({ label, value, tone }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    red: 'border-red-200 bg-red-50 text-red-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800'
  };
  return (
    <div className={`rounded-lg border px-3 py-2 font-bold ${tones[tone] || tones.slate}`}>
      <p className="text-lg leading-none">{value}</p>
      <p className="mt-1">{label}</p>
    </div>
  );
}

function EvidenceList({ title, items, empty, tone }) {
  const marker = tone === 'amber' ? 'text-amber-700' : 'text-brand-700';
  return (
    <div className="mt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-slate-700">
        {(items.length ? items.slice(0, 3) : [empty]).map((item) => (
          <li key={item} className="flex gap-2">
            <span className={`font-bold ${marker}`}>{items.length ? '+' : '-'}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentEvidence({ documentation }) {
  const groups = [
    { label: 'Disponibles', items: documentation.available, tone: 'text-brand-700' },
    { label: 'Pendientes', items: documentation.pending, tone: 'text-amber-700' },
    { label: 'Caducados', items: documentation.expired, tone: 'text-red-700' }
  ];
  if (!documentation.required.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white/70 p-3 text-xs">
      <p className="font-bold uppercase tracking-wide text-slate-500">Documentacion</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className={`font-bold ${group.tone}`}>{group.label}</p>
            <p className="mt-0.5 text-slate-600">{group.items.map((item) => item.label).join(', ') || '-'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700'
  };
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md ${tones[tone] || tones.brand}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </article>
  );
}

function ResourceCard({ resource, recommendation, alert, selected, link, canEdit, canDelete, onSelect, onEdit, onDelete, onTrack, beneficiarySelected }) {
  const verified = isResourceOfficiallyVerified(resource);
  return (
    <article className={`rounded-xl border bg-white p-5 shadow-sm transition ${selected ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[resource.status] || statusStyles.Activo}`}>{resource.status || 'Activo'}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{resource.scope || 'municipal'}</span>
            {alert && <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${alert.tone}`}>{alert.label}</span>}
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {verified ? 'Fuente verificada' : 'Fuente pendiente'}
            </span>
            {link && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${trackingStyles[link.status] || trackingStyles.saved}`}>{trackingLabels[link.status] || 'Guardado'}</span>}
            {recommendation && (
              <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${recommendation.level.badge}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${recommendation.level.dot}`} /> {recommendation.level.label}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-lg font-bold text-ink">{resource.name}</h3>
          <p className="text-sm font-semibold text-brand-700">{resource.organization_name}</p>
        </div>
        <button type="button" className="focus-ring rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onSelect} aria-label="Ver detalle">
          <ChevronRight size={18} />
        </button>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{resource.description || 'Sin descripcion registrada.'}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <InfoItem icon={Landmark} label="Categoria" value={resource.category} />
        <InfoItem icon={MapPin} label="Municipio" value={resource.municipality || 'No indicado'} />
        <InfoItem icon={CalendarClock} label="Fecha limite" value={resource.deadline_at ? formatDate(resource.deadline_at) : 'Sin limite'} />
        <InfoItem icon={BadgeCheck} label="Verificado" value={resource.last_verified_at ? formatDate(resource.last_verified_at) : 'Pendiente'} />
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onSelect}>Ver ficha</Button>
        <Button variant="subtle" onClick={onTrack} disabled={!beneficiarySelected}>Guardar para beneficiario</Button>
        {canEdit && <Button variant="secondary" onClick={onEdit}><Pencil size={15} /> Editar</Button>}
        {canDelete && <Button variant="secondary" onClick={onDelete}><Trash2 size={15} /> Eliminar</Button>}
      </div>
    </article>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-2">
      <Icon className="mt-0.5 text-brand-600" size={16} />
      <div>
        <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="font-semibold text-slate-700">{value || '-'}</dd>
      </div>
    </div>
  );
}

function BeneficiaryPanel({ beneficiary, links, resources, followups, onOpenBeneficiary, onTrack }) {
  if (!beneficiary) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <UserRound className="mb-3 text-slate-300" size={32} />
        <h3 className="font-bold text-ink">Sin beneficiario seleccionado</h3>
        <p className="mt-1 text-sm text-slate-500">Selecciona un expediente para guardar recursos y registrar el seguimiento.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Beneficiario seleccionado</p>
          <h3 className="mt-1 text-lg font-bold text-ink">{beneficiary.full_name}</h3>
          <p className="text-sm text-slate-500">{beneficiary.code || 'Sin codigo'} · {beneficiary.phone || 'Sin telefono'}</p>
        </div>
        <Button variant="secondary" onClick={onOpenBeneficiary}>Abrir expediente</Button>
      </div>
      <div className="mt-4 space-y-3">
        {links.map((link) => {
          const resource = resources.find((item) => item.id === link.resource_id);
          const linkFollowups = followups.filter((item) => item.beneficiary_resource_id === link.id);
          if (!resource) return null;
          return (
            <article key={link.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-ink">{resource.name}</p>
                  <p className="text-xs text-slate-500">{resource.organization_name}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${trackingStyles[link.status] || trackingStyles.saved}`}>{trackingLabels[link.status] || link.status}</span>
              </div>
              {link.observations && <p className="mt-2 text-sm text-slate-600">{link.observations}</p>}
              <p className="mt-2 text-xs text-slate-500">Ultimo seguimiento: {linkFollowups[0]?.created_at ? formatDate(linkFollowups[0].created_at) : 'Sin movimientos'}</p>
              <Button variant="secondary" className="mt-3 w-full" onClick={() => onTrack(resource)}>Actualizar seguimiento</Button>
            </article>
          );
        })}
        {links.length === 0 && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Todavia no hay recursos guardados en este expediente.</p>}
      </div>
    </section>
  );
}

function ResourceDetail({ resource, history = [], alert = null }) {
  if (!resource) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <FileText className="mb-3 text-slate-300" size={32} />
        <h3 className="font-bold text-ink">Ficha del recurso</h3>
        <p className="mt-1 text-sm text-slate-500">Selecciona una tarjeta para revisar requisitos, documentacion y forma de solicitud.</p>
      </section>
    );
  }
  const verified = isResourceOfficiallyVerified(resource);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">{resource.name}</h3>
          <p className="text-sm font-semibold text-brand-700">{resource.organization_name}</p>
        </div>
        {alert && <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${alert.tone}`}>{alert.label}</span>}
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div className={`rounded-lg border p-3 ${verified ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <p className="font-bold">{verified ? 'Fuente oficial verificada' : 'Fuente oficial pendiente de verificar'}</p>
          <p className="mt-1">URL oficial: {resource.official_url || 'No indicada'}</p>
          <p>Ultima comprobacion: {resource.last_verified_at ? formatDate(resource.last_verified_at) : 'Pendiente'}</p>
          <p>Verificado por: {resource.verified_by_name || 'Pendiente'}</p>
        </div>
        <DetailBlock title="Descripcion" value={resource.description} />
        <DetailBlock title="Requisitos" value={resource.requirements} />
        <DetailBlock title="A quien va dirigido" value={resource.target_audience} />
        <DetailBlock title="Documentacion necesaria" value={resource.required_documents} />
        <DetailBlock title="Importe o beneficio" value={resource.benefit} />
        <DetailBlock title="Como solicitarlo" value={resource.application_method} />
        <div className="grid gap-2">
          {resource.phone && <ContactLink icon={Phone} href={`tel:${resource.phone}`} label={resource.phone} />}
          {resource.email && <ContactLink icon={Mail} href={`mailto:${resource.email}`} label={resource.email} />}
          {resource.web_url && <ContactLink icon={ExternalLink} href={resource.web_url} label="Abrir web informativa" external />}
          {resource.official_url && <ContactLink icon={BadgeCheck} href={resource.official_url} label="Abrir fuente oficial" external />}
        </div>
        <ResourceHistory history={history} />
      </div>
    </section>
  );
}

function ResourceHistory({ history }) {
  if (!history.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><History size={14} /> Historial de cambios</p>
        <p className="mt-1 text-sm text-slate-500">Sin cambios relevantes registrados.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><History size={14} /> Historial de cambios</p>
      <div className="mt-3 space-y-2">
        {history.slice(0, 4).map((entry) => (
          <article key={entry.id} className="rounded-md bg-white p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink">{entry.change_type === 'created' ? 'Recurso creado' : 'Recurso actualizado'}</p>
              <time className="text-xs font-semibold text-slate-500">{formatDate(entry.created_at)}</time>
            </div>
            <p className="mt-1 text-xs text-slate-500">{entry.changed_by_name || 'Usuario no registrado'}</p>
            <p className="mt-1 text-xs text-slate-600">{formatChangedFields(entry.changed_fields)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function DetailBlock({ title, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-slate-700">{value || 'No indicado.'}</p>
    </div>
  );
}

function ContactLink({ icon: Icon, href, label, external = false }) {
  return (
    <a className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50" href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
      <Icon size={16} /> {label}
    </a>
  );
}

function SocialResourceForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({ ...emptyResource, ...initial });
  const [saving, setSaving] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Nombre" required><input className={inputClass} value={form.name} onChange={(event) => update('name', event.target.value)} required /></FormField>
        <FormField label="Organismo / entidad" required><input className={inputClass} value={form.organization_name} onChange={(event) => update('organization_name', event.target.value)} required /></FormField>
        <FormField label="Categoria"><select className={inputClass} value={form.category} onChange={(event) => update('category', event.target.value)}>{SOCIAL_RESOURCE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
        <FormField label="Estado"><select className={inputClass} value={form.status} onChange={(event) => update('status', event.target.value)}>{SOCIAL_RESOURCE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
        <FormField label="Ambito"><select className={inputClass} value={form.scope} onChange={(event) => update('scope', event.target.value)}>{SOCIAL_RESOURCE_SCOPES.map((item) => <option key={item}>{item}</option>)}</select></FormField>
        <FormField label="Municipio"><input className={inputClass} value={form.municipality} onChange={(event) => update('municipality', event.target.value)} /></FormField>
        <FormField label="Fecha de apertura"><input type="date" className={inputClass} value={form.opens_at || ''} onChange={(event) => update('opens_at', event.target.value)} /></FormField>
        <FormField label="Fecha limite"><input type="date" className={inputClass} value={form.deadline_at || ''} onChange={(event) => update('deadline_at', event.target.value)} /></FormField>
        <FormField label="Ultima verificacion"><input type="date" className={inputClass} value={form.last_verified_at || ''} onChange={(event) => update('last_verified_at', event.target.value)} /></FormField>
        <FormField label="Importe / beneficio"><input className={inputClass} value={form.benefit} onChange={(event) => update('benefit', event.target.value)} /></FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Edad minima"><input type="number" min="0" className={inputClass} value={form.age_min || ''} onChange={(event) => update('age_min', event.target.value)} /></FormField>
        <FormField label="Edad maxima"><input type="number" min="0" className={inputClass} value={form.age_max || ''} onChange={(event) => update('age_max', event.target.value)} /></FormField>
        <FormField label="Situacion familiar"><input className={inputClass} value={form.family_situation} onChange={(event) => update('family_situation', event.target.value)} /></FormField>
        <FormField label="Empleo"><input className={inputClass} value={form.employment_situation} onChange={(event) => update('employment_situation', event.target.value)} /></FormField>
        <FormField label="Vivienda"><input className={inputClass} value={form.housing_situation} onChange={(event) => update('housing_situation', event.target.value)} /></FormField>
        <FormField label="Telefono"><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
        <FormField label="Web"><input type="url" className={inputClass} value={form.web_url} onChange={(event) => update('web_url', event.target.value)} /></FormField>
        <FormField label="URL oficial"><input type="url" className={inputClass} value={form.official_url || ''} onChange={(event) => update('official_url', event.target.value)} placeholder="Fuente oficial del organismo" /></FormField>
        <FormField label="Fuente verificada por"><input className={inputClass} value={form.verified_by_name || 'Se actualizara al guardar'} disabled /></FormField>
        <FormField label="Direccion"><input className={inputClass} value={form.address} onChange={(event) => update('address', event.target.value)} /></FormField>
        <FormField label="A quien va dirigido"><input className={inputClass} value={form.target_audience} onChange={(event) => update('target_audience', event.target.value)} /></FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextAreaField label="Descripcion" value={form.description} onChange={(value) => update('description', value)} />
        <TextAreaField label="Requisitos" value={form.requirements} onChange={(value) => update('requirements', value)} />
        <TextAreaField label="Documentacion necesaria" value={form.required_documents} onChange={(value) => update('required_documents', value)} />
        <TextAreaField label="Como solicitarlo" value={form.application_method} onChange={(value) => update('application_method', value)} />
      </div>
      <TextAreaField label="Observaciones internas" value={form.notes} onChange={(value) => update('notes', value)} />
      {initial.id && <TextAreaField label="Motivo del cambio" value={form.change_reason || ''} onChange={(value) => update('change_reason', value)} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar recurso'}</Button>
      </div>
    </form>
  );
}

function TrackingForm({ resource, beneficiary, currentLink, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    status: currentLink?.status || 'saved',
    observations: currentLink?.observations || ''
  });
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="rounded-md bg-brand-50 p-3 text-sm text-brand-800">
        <p className="font-bold">{resource.name}</p>
        <p>{beneficiary.full_name} · {beneficiary.code}</p>
      </div>
      <FormField label="Estado del seguimiento">
        <select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
          {BENEFICIARY_RESOURCE_STATUSES.map((status) => <option key={status} value={status}>{trackingLabels[status]}</option>)}
        </select>
      </FormField>
      <TextAreaField label="Observaciones" value={form.observations} onChange={(value) => setForm((current) => ({ ...current, observations: value }))} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar seguimiento'}</Button>
      </div>
    </form>
  );
}

function TextAreaField({ label, value, onChange }) {
  return (
    <FormField label={label}>
      <textarea className={`${inputClass} min-h-28 resize-y`} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </FormField>
  );
}

function SelectFilter({ label, value, onChange, options, labels = {} }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map((option) => <option key={option || 'empty'} value={option}>{labels[option] || option}</option>)}
      </select>
    </label>
  );
}

function TextFilter({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function matchesResource(resource, filters) {
  const query = normalize(filters.search);
  if (query && ![
    resource.name,
    resource.organization_name,
    resource.category,
    resource.description,
    resource.requirements,
    resource.target_audience,
    resource.required_documents,
    resource.application_method,
    resource.municipality
  ].some((value) => normalize(value).includes(query))) return false;
  if (filters.category && resource.category !== filters.category) return false;
  if (filters.status && resource.status !== filters.status) return false;
  if (filters.municipality && resource.municipality !== filters.municipality) return false;
  if (filters.age && !ageMatches(resource, Number(filters.age))) return false;
  if (filters.family && !normalize(resource.family_situation).includes(normalize(filters.family))) return false;
  if (filters.employment && !normalize(resource.employment_situation).includes(normalize(filters.employment))) return false;
  if (filters.housing && !normalize(resource.housing_situation).includes(normalize(filters.housing))) return false;
  if (filters.deadline && !deadlineMatches(resource.deadline_at, filters.deadline)) return false;
  return true;
}

function ageMatches(resource, age) {
  if (!Number.isFinite(age)) return true;
  const min = Number(resource.age_min);
  const max = Number(resource.age_max);
  if (Number.isFinite(min) && age < min) return false;
  if (Number.isFinite(max) && max > 0 && age > max) return false;
  return true;
}

function deadlineMatches(deadline, filter) {
  if (!deadline) return filter === 'no_deadline';
  const today = todayISO();
  if (filter === 'expired') return deadline < today;
  if (filter === 'open') return deadline >= today;
  if (filter === 'next30') return isNext30(deadline);
  return true;
}

function isNext30(deadline) {
  if (!deadline) return false;
  const today = new Date(`${todayISO()}T00:00:00`);
  const target = new Date(`${deadline}T00:00:00`);
  const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= 30;
}

function formatChangedFields(value) {
  let fields = value;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      fields = [];
    }
  }
  fields = Array.isArray(fields) ? fields : [];
  return fields.map((item) => item.label || item.field || item).filter(Boolean).join(', ') || 'Cambio registrado';
}

function compareResourcePriority(a, b) {
  const statusOrder = { Activo: 0, Proximamente: 1, 'Pendiente de verificar': 2, Cerrado: 3 };
  const byStatus = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  if (byStatus !== 0) return byStatus;
  const aDeadline = a.deadline_at || '9999-12-31';
  const bDeadline = b.deadline_at || '9999-12-31';
  return String(aDeadline).localeCompare(String(bDeadline));
}

function findLink(links, beneficiaryId, resourceId) {
  return links.find((link) => link.beneficiary_id === beneficiaryId && link.resource_id === resourceId) || null;
}
