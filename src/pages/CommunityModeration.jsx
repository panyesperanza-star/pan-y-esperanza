import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock3,
  Flag,
  Gift,
  HandHeart,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { canDo } from '../lib/auth';
import { formatDate, normalize } from '../lib/formatters';
import { supabase } from '../lib/supabase';

const COMMUNITY_BUCKET = 'community-post-photos';

const categoryMeta = {
  employment: { label: 'Empleo', icon: Briefcase, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  offer: { label: 'Ofrezco', icon: Gift, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  need: { label: 'Necesito', icon: HandHeart, tone: 'bg-amber-50 text-amber-800 border-amber-100' }
};

const statusMeta = {
  pending_review: { label: 'Pendiente de revision', tone: 'bg-amber-50 text-amber-800 border-amber-100' },
  approved: { label: 'Aprobada', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  rejected: { label: 'Rechazada', tone: 'bg-red-50 text-red-700 border-red-100' },
  withdrawn: { label: 'Retirada', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  blocked: { label: 'Bloqueada', tone: 'bg-red-100 text-red-800 border-red-200' }
};

const interestStatusOptions = [
  { value: 'new', label: 'Nuevo' },
  { value: 'reviewed', label: 'Revisado' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'referred', label: 'Derivado' },
  { value: 'closed', label: 'Cerrado' }
];

const interestStatusLabels = {
  registered: 'Nuevo',
  new: 'Nuevo',
  reviewed: 'Revisado',
  contacted: 'Contactado',
  delivery_pending: 'Entrega pendiente',
  delivered: 'Entregado / Cerrado',
  not_completed: 'No realizado',
  referred: 'Derivado',
  closed: 'Cerrado',
  withdrawn: 'Retirado',
  cancelled: 'Cancelado'
};

const offerInterestStatusOptions = [
  { value: 'new', label: 'Nuevo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'delivery_pending', label: 'Entrega pendiente' },
  { value: 'closed', label: 'Cerrado' }
];

const terminalInterestStatuses = new Set(['delivered', 'not_completed', 'closed', 'withdrawn', 'cancelled']);

const resolutionLabels = {
  active: 'Vigente',
  employment_filled: 'Empleo cubierto',
  item_delivered: 'Articulo entregado',
  need_resolved: 'Necesidad resuelta',
  expired: 'Caducada'
};

export function CommunityModeration({ data, actions, currentUser }) {
  const posts = data.community_posts || [];
  const interests = data.community_interests || [];
  const reports = data.community_post_reports || [];
  const beneficiaries = data.beneficiaries || [];
  const canEdit = canDo(currentUser, 'community-moderation', 'edit');
  const [filters, setFilters] = useState({ search: '', status: 'pending_review', category: '' });
  const [reviewing, setReviewing] = useState(null);
  const [blocking, setBlocking] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selectedInterestPostId, setSelectedInterestPostId] = useState('');
  const interestsSectionRef = useRef(null);
  const photoUrls = useCommunityPhotoUrls(posts);

  const beneficiaryById = useMemo(() => new Map(beneficiaries.map((item) => [item.id, item])), [beneficiaries]);
  const interestsByPost = useMemo(() => groupByPost(interests.filter((item) => !['cancelled', 'withdrawn'].includes(item.status))), [interests]);
  const reportsByPost = useMemo(() => groupByPost(reports.filter((item) => item.status !== 'dismissed')), [reports]);
  const matchesByPost = useMemo(() => buildCommunityMatches(posts), [posts]);
  const activeInterests = useMemo(() => interests.filter((item) => !['cancelled', 'withdrawn'].includes(item.status)), [interests]);
  const visibleInterests = useMemo(() => {
    if (!selectedInterestPostId) return activeInterests;
    return activeInterests.filter((interest) => interest.post_id === selectedInterestPostId);
  }, [activeInterests, selectedInterestPostId]);
  const selectedInterestPost = selectedInterestPostId ? posts.find((post) => post.id === selectedInterestPostId) : null;
  const counters = useMemo(() => posts.reduce((acc, post) => {
    const key = post.status || 'pending_review';
    acc[key] = (acc[key] || 0) + 1;
    acc.total += 1;
    if (isPostExpired(post)) acc.expired += 1;
    return acc;
  }, { total: 0, pending_review: 0, approved: 0, rejected: 0, withdrawn: 0, blocked: 0, expired: 0 }), [posts]);

  const filteredPosts = useMemo(() => {
    const query = normalize(filters.search);
    return posts.filter((post) => {
      const beneficiary = beneficiaryById.get(post.beneficiary_id) || {};
      const searchText = normalize([
        post.title,
        post.zone,
        post.description,
        beneficiary.full_name,
        beneficiary.code,
        post.company_name,
        post.job_position
      ].filter(Boolean).join(' '));
      return (!filters.status || post.status === filters.status)
        && (!filters.category || post.category === filters.category)
        && (!query || searchText.includes(query));
    });
  }, [beneficiaryById, filters, posts]);

  async function approvePost(post) {
    setError('');
    setNotice('');
    try {
      await actions.approveCommunityPost(post.id, { moderation_notes: reviewNotes });
      setReviewing(null);
      setReviewNotes('');
      setNotice('Publicacion aprobada. Ya puede verse en el Portal Beneficiario si sigue vigente.');
    } catch (approvalError) {
      setError(approvalError.message || 'No se pudo aprobar la publicacion.');
    }
  }

  async function rejectPost(post) {
    setError('');
    setNotice('');
    if (rejectReason.trim().length < 3) {
      setError('Indica el motivo del rechazo.');
      return;
    }
    try {
      await actions.rejectCommunityPost(post.id, {
        reason: rejectReason,
        moderation_notes: reviewNotes
      });
      setReviewing(null);
      setRejectReason('');
      setReviewNotes('');
      setNotice('Publicacion rechazada y registrada.');
    } catch (rejectionError) {
      setError(rejectionError.message || 'No se pudo rechazar la publicacion.');
    }
  }

  async function blockPost(post) {
    setError('');
    setNotice('');
    if (blockReason.trim().length < 3) {
      setError('Indica el motivo del bloqueo.');
      return;
    }
    try {
      await actions.blockCommunityPost(post.id, { reason: blockReason });
      setBlocking(null);
      setBlockReason('');
      setNotice('Publicacion bloqueada y registrada en auditoria.');
    } catch (blockError) {
      setError(blockError.message || 'No se pudo bloquear la publicacion.');
    }
  }

  async function withdrawPost(post) {
    setError('');
    setNotice('');
    try {
      await actions.withdrawCommunityPost(post.id);
      setNotice('Publicacion retirada.');
    } catch (withdrawError) {
      setError(withdrawError.message || 'No se pudo retirar la publicacion.');
    }
  }

  async function updateInterest(interest, payload) {
    setError('');
    setNotice('');
    try {
      await actions.updateCommunityInterestStatus(interest.id, payload);
      setNotice('Interes actualizado.');
    } catch (interestError) {
      setError(interestError.message || 'No se pudo actualizar el interes.');
    }
  }

  function viewPostInterests(postId) {
    setSelectedInterestPostId(postId);
    window.setTimeout(() => {
      interestsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  async function updateResolution(post, payload) {
    setError('');
    setNotice('');
    try {
      await actions.updateCommunityPostResolution(post.id, payload);
      setNotice('Estado de vigencia actualizado.');
    } catch (resolutionError) {
      setError(resolutionError.message || 'No se pudo actualizar la vigencia.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Moderacion de Comunidad"
        description="Revisa publicaciones, intereses, reportes y posibles coincidencias antes de facilitar cualquier contacto."
      />

      {notice && <div className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="Pendientes" value={counters.pending_review} tone="amber" icon={Clock3} />
        <SummaryCard label="Aprobadas" value={counters.approved} tone="emerald" icon={CheckCircle2} />
        <SummaryCard label="Reportes" value={reports.filter((item) => item.status !== 'dismissed').length} tone="red" icon={Flag} />
        <SummaryCard label="Intereses" value={interests.filter((item) => !['cancelled', 'withdrawn'].includes(item.status)).length} tone="brand" icon={MessageCircle} />
        <SummaryCard label="Caducadas" value={counters.expired} tone="slate" icon={AlertTriangle} />
      </section>

      <section className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className={`${inputClass} pl-10`}
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Buscar por titulo, zona, beneficiario o categoria"
            />
          </label>
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="pending_review">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="withdrawn">Retiradas</option>
            <option value="blocked">Bloqueadas</option>
          </select>
          <select className={inputClass} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">Todas las categorias</option>
            <option value="employment">Empleo</option>
            <option value="offer">Ofrezco</option>
            <option value="need">Necesito</option>
          </select>
        </div>
      </section>

      <section ref={interestsSectionRef} className="mt-5 rounded-md border border-brand-100 bg-brand-50/50 p-4 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-brand-700">Personas interesadas</p>
            <h2 className="mt-1 text-xl font-black text-ink">Gestion del interes</h2>
            <p className="mt-1 text-sm text-slate-600">
              Intereses recibidos desde el Portal Beneficiario. Gestiona cada solicitud sin compartir datos personales automaticamente.
            </p>
            <p className="mt-2 text-xs font-black uppercase tracking-wide text-brand-700">
              {'Flujo: Nuevo -> Revisado -> Contactado -> Derivado -> Cerrado'}
            </p>
            {selectedInterestPost && (
              <p className="mt-2 text-sm font-bold text-brand-800">
                Mostrando interesados de: {selectedInterestPost.title}
              </p>
            )}
          </div>
          {selectedInterestPostId && (
            <Button variant="secondary" onClick={() => setSelectedInterestPostId('')}>Ver todos los interesados</Button>
          )}
        </div>
        {!visibleInterests.length ? (
          <div className="mt-4 rounded-md border border-dashed border-brand-200 bg-white/70 p-5 text-center text-sm font-semibold text-slate-500">
            No hay personas interesadas pendientes de gestion.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {visibleInterests.map((interest) => (
              <InterestManagementCard
                key={interest.id}
                interest={interest}
                post={posts.find((post) => post.id === interest.post_id)}
                beneficiary={beneficiaryById.get(interest.beneficiary_id)}
                canEdit={canEdit}
                onUpdate={updateInterest}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        {!filteredPosts.length ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500 xl:col-span-2">
            No hay publicaciones con estos filtros.
          </div>
        ) : filteredPosts.map((post) => {
          const beneficiary = beneficiaryById.get(post.beneficiary_id) || {};
          return (
            <CommunityPostCard
              key={post.id}
              post={post}
              beneficiary={beneficiary}
              interests={interestsByPost.get(post.id) || []}
              reports={reportsByPost.get(post.id) || []}
              matches={matchesByPost.get(post.id) || []}
              beneficiaryById={beneficiaryById}
              photoUrl={photoUrls[post.id]}
              canEdit={canEdit}
              onReview={() => {
                setReviewing(post);
                setReviewNotes(post.moderation_notes || '');
                setRejectReason(post.rejection_reason || '');
              }}
              onBlock={() => {
                setBlocking(post);
                setBlockReason(post.blocked_reason || '');
              }}
              onWithdraw={() => withdrawPost(post)}
              onViewInterests={() => viewPostInterests(post.id)}
              onUpdateInterest={updateInterest}
              onUpdateResolution={updateResolution}
            />
          );
        })}
      </section>

      {reviewing && (
        <Modal title="Revisar publicacion" onClose={() => setReviewing(null)}>
          <div className="space-y-4">
            <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Publicacion</p>
              <h3 className="mt-1 text-lg font-bold text-ink">{reviewing.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{reviewing.description}</p>
            </div>
            <FormField label="Notas internas de revision">
              <textarea className={`${inputClass} min-h-24`} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
            </FormField>
            <FormField label="Motivo si se rechaza">
              <textarea className={`${inputClass} min-h-20`} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setReviewing(null)}>Cancelar</Button>
              <Button variant="danger" disabled={!canEdit} onClick={() => rejectPost(reviewing)}><XCircle size={16} /> Rechazar</Button>
              <Button disabled={!canEdit} onClick={() => approvePost(reviewing)}><CheckCircle2 size={16} /> Aprobar</Button>
            </div>
          </div>
        </Modal>
      )}

      {blocking && (
        <Modal title="Bloquear publicacion" onClose={() => setBlocking(null)}>
          <div className="space-y-4">
            <div className="rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-black">Esta accion retira la publicacion del Portal y queda registrada para moderacion.</p>
              <p className="mt-1">{blocking.title}</p>
            </div>
            <FormField label="Motivo del bloqueo" required>
              <textarea className={`${inputClass} min-h-24`} value={blockReason} onChange={(event) => setBlockReason(event.target.value)} />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setBlocking(null)}>Cancelar</Button>
              <Button variant="danger" disabled={!canEdit} onClick={() => blockPost(blocking)}><ShieldAlert size={16} /> Bloquear</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }) {
  const tones = {
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    brand: 'border-brand-100 bg-brand-50 text-brand-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700'
  };
  return (
    <article className={`rounded-md border p-4 ${tones[tone] || tones.brand}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-3xl font-black">{value}</p>
        </div>
        <Icon size={26} />
      </div>
    </article>
  );
}

function CommunityPostCard({ post, beneficiary, interests, reports, matches, beneficiaryById, photoUrl, canEdit, onReview, onWithdraw, onBlock, onViewInterests, onUpdateInterest, onUpdateResolution }) {
  const category = categoryMeta[post.category] || categoryMeta.need;
  const status = statusMeta[post.status] || statusMeta.pending_review;
  const CategoryIcon = category.icon;
  const expired = isPostExpired(post);
  const [resolutionStatus, setResolutionStatus] = useState(post.resolution_status || 'active');
  const [resolutionNotes, setResolutionNotes] = useState(post.resolution_notes || '');
  useEffect(() => {
    setResolutionStatus(post.resolution_status || 'active');
    setResolutionNotes(post.resolution_notes || '');
  }, [post.resolution_notes, post.resolution_status]);
  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-panel">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-44 w-full object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center bg-slate-50 text-slate-400">
          <ImageIcon size={30} />
        </div>
      )}
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={category.tone}><CategoryIcon size={14} /> {category.label}</Badge>
          <Badge className={status.tone}>{status.label}</Badge>
          {expired && <Badge className="border-red-100 bg-red-50 text-red-700">Caducada</Badge>}
          {post.resolution_status && post.resolution_status !== 'active' && <Badge className="border-slate-200 bg-slate-50 text-slate-700">{resolutionLabels[post.resolution_status] || post.resolution_status}</Badge>}
          <Badge className="border-slate-100 bg-slate-50 text-slate-600"><MessageCircle size={14} /> {interests.length} intereses</Badge>
          {reports.length > 0 && <Badge className="border-red-100 bg-red-50 text-red-700"><Flag size={14} /> {reports.length} reportes</Badge>}
          {matches.length > 0 && <Badge className="border-amber-100 bg-amber-50 text-amber-800"><AlertTriangle size={14} /> Posible coincidencia</Badge>}
        </div>
        <div>
          <h3 className="text-xl font-bold text-ink">{post.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{post.description}</p>
        </div>
        <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <InfoLine icon={MapPin} label="Zona" value={post.zone} />
          <InfoLine icon={UserRound} label="Beneficiario" value={`${beneficiary.full_name || 'Sin nombre'}${beneficiary.code ? ` - ${beneficiary.code}` : ''}`} />
          {post.category === 'employment' && <InfoLine icon={Briefcase} label="Puesto" value={post.job_position || post.title} />}
          {post.company_name && <InfoLine icon={Briefcase} label="Entidad" value={post.company_name} />}
          {post.deadline_at && <InfoLine icon={Clock3} label="Fecha limite" value={formatDate(post.deadline_at)} />}
          {post.expires_at && <InfoLine icon={Clock3} label="Visible hasta" value={formatDate(post.expires_at)} />}
        </div>
        {matches.length > 0 && (
          <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-amber-800">Posibles coincidencias Ofrezco / Necesito</p>
            <div className="mt-2 space-y-1 text-sm text-amber-900">
              {matches.slice(0, 3).map((match) => (
                <p key={match.id}>Existe una posible coincidencia con "{match.title}". Revisar antes de facilitar contacto.</p>
              ))}
            </div>
          </div>
        )}
        {reports.length > 0 && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-red-700">Reportes pendientes</p>
            <div className="mt-2 space-y-1 text-sm text-red-800">
              {reports.slice(0, 3).map((report) => (
                <p key={report.id}>{formatDate(report.created_at)} - {report.reason || 'Reporte sin detalle'}</p>
              ))}
            </div>
          </div>
        )}
        {interests.length > 0 && (
          <div className="rounded-md border border-brand-100 bg-brand-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-wide text-brand-700">{interests.length} personas interesadas</p>
              <Button variant="secondary" onClick={onViewInterests}><MessageCircle size={16} /> Ver interesados</Button>
            </div>
            <div className="mt-3 space-y-3">
              {interests.map((interest) => (
                <InterestWorkflowRow
                  key={interest.id}
                  interest={interest}
                  post={post}
                  beneficiary={beneficiaryById.get(interest.beneficiary_id)}
                  canEdit={canEdit}
                  onUpdate={onUpdateInterest}
                />
              ))}
            </div>
          </div>
        )}
        <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-600">Vigencia de la publicacion</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[190px_1fr_auto]">
            <select className={inputClass} value={resolutionStatus} onChange={(event) => setResolutionStatus(event.target.value)} disabled={!canEdit}>
              {Object.entries(resolutionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input className={inputClass} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} placeholder="Observaciones internas" disabled={!canEdit} />
            <Button variant="secondary" disabled={!canEdit} onClick={() => onUpdateResolution(post, { resolution_status: resolutionStatus, resolution_notes: resolutionNotes })}>Guardar</Button>
          </div>
        </div>
        {post.rejection_reason && post.status === 'rejected' && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <strong>Motivo del rechazo:</strong> {post.rejection_reason}
          </div>
        )}
        {post.blocked_reason && post.status === 'blocked' && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <strong>Motivo del bloqueo:</strong> {post.blocked_reason}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" disabled={!canEdit} onClick={onReview}>Revisar</Button>
          {!['withdrawn', 'blocked'].includes(post.status) && <Button variant="danger" disabled={!canEdit} onClick={onBlock}><ShieldAlert size={16} /> Bloquear</Button>}
          {post.status !== 'withdrawn' && <Button variant="danger" disabled={!canEdit} onClick={onWithdraw}><Trash2 size={16} /> Retirar</Button>}
        </div>
      </div>
    </article>
  );
}

function InterestManagementCard({ interest, post, beneficiary, canEdit, onUpdate }) {
  const category = categoryMeta[post?.category] || categoryMeta.need;
  const CategoryIcon = category.icon;
  const statusLabel = interestStatusLabel(interest.status);

  return (
    <article className="rounded-md border border-white bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={category.tone}><CategoryIcon size={14} /> {category.label}</Badge>
            <Badge className="border-brand-100 bg-brand-50 text-brand-700">{statusLabel}</Badge>
          </div>
          <h3 className="mt-3 font-black text-ink">{post?.title || 'Publicacion no disponible'}</h3>
          <p className="mt-1 text-sm text-slate-600">Publicacion: {post?.status ? statusMeta[post.status]?.label || post.status : 'Sin estado'}</p>
        </div>
        <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Beneficiario interesado</p>
          <p className="mt-1 font-bold text-ink">{beneficiary?.full_name || 'Beneficiario'}{beneficiary?.code ? ` - ${beneficiary.code}` : ''}</p>
          <p className="mt-1 text-sm text-slate-600">Fecha: {formatDate(interest.created_at)}</p>
          {interest.message && <p className="mt-2 text-sm text-slate-700">{interest.message}</p>}
        </div>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Acciones</p>
        <InterestWorkflowRow interest={interest} post={post} beneficiary={beneficiary} canEdit={canEdit} onUpdate={onUpdate} />
      </div>
    </article>
  );
}

function InterestWorkflowRow({ interest, post, beneficiary, canEdit, onUpdate }) {
  const storedStatus = interest.status === 'registered' ? 'new' : interest.status || 'new';
  const [status, setStatus] = useState(storedStatus);
  const [notes, setNotes] = useState(interest.status_notes || '');
  const options = interestOptionsForPost(post, status);
  const isTerminal = terminalInterestStatuses.has(storedStatus);

  useEffect(() => {
    setStatus(storedStatus);
    setNotes(interest.status_notes || '');
  }, [storedStatus, interest.status_notes]);

  return (
    <div className="rounded-md border border-white/70 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-brand-900">{beneficiary?.full_name || 'Beneficiario'}{beneficiary?.code ? ` - ${beneficiary.code}` : ''}</p>
          <p className="mt-1 text-sm text-brand-800">{formatDate(interest.created_at)} - {interest.message || 'Interes registrado'}</p>
        </div>
        <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-black text-brand-700">{interestStatusLabel(status)}</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr_auto]">
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)} disabled={!canEdit || isTerminal}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones internas" disabled={!canEdit || isTerminal} />
        <Button variant="secondary" disabled={!canEdit || isTerminal} onClick={() => onUpdate(interest, { status, status_notes: notes })}>Actualizar</Button>
      </div>
      {post?.category === 'offer' && status === 'delivery_pending' && (
        <p className="mt-2 text-xs font-semibold text-brand-700">
          El beneficiario interesado confirmara desde su Portal si recibio el articulo o si la entrega no se realizo.
        </p>
      )}
    </div>
  );
}

function interestStatusLabel(status) {
  return interestStatusLabels[status === 'registered' ? 'new' : status] || 'Nuevo';
}

function interestOptionsForPost(post, currentStatus) {
  const baseOptions = post?.category === 'offer' ? offerInterestStatusOptions : interestStatusOptions;
  if (baseOptions.some((option) => option.value === currentStatus)) return baseOptions;
  return [{ value: currentStatus, label: interestStatusLabel(currentStatus) }, ...baseOptions];
}

function Badge({ children, className }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${className}`}>{children}</span>;
}

function InfoLine({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 shrink-0 text-brand-700" size={16} />
      <p><span className="font-bold text-slate-700">{label}:</span> {value}</p>
    </div>
  );
}

function groupByPost(items) {
  const map = new Map();
  items.forEach((item) => {
    const list = map.get(item.post_id) || [];
    list.push(item);
    map.set(item.post_id, list);
  });
  return map;
}

function isPostExpired(post = {}) {
  return Boolean(post.expires_at && String(post.expires_at).slice(0, 10) < new Date().toISOString().slice(0, 10));
}

function isPostMatchable(post = {}) {
  return post.status === 'approved' && (post.resolution_status || 'active') === 'active' && !isPostExpired(post);
}

function matchTokens(post = {}) {
  return normalize([post.title, post.description, post.zone].filter(Boolean).join(' '))
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);
}

function buildCommunityMatches(posts = []) {
  const active = posts.filter(isPostMatchable).filter((post) => ['offer', 'need'].includes(post.category));
  const map = new Map();
  active.forEach((post) => {
    const ownTokens = matchTokens(post);
    if (!ownTokens.length) return;
    const matches = active
      .filter((candidate) => candidate.id !== post.id && candidate.category !== post.category)
      .filter((candidate) => {
        const candidateTokens = matchTokens(candidate);
        return ownTokens.some((token) => candidateTokens.includes(token));
      })
      .slice(0, 5);
    if (matches.length) map.set(post.id, matches);
  });
  return map;
}

function useCommunityPhotoUrls(posts) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let cancelled = false;
    async function signPhotos() {
      if (!supabase) {
        setUrls({});
        return;
      }
      const entries = await Promise.all(posts
        .filter((post) => post.photo_storage_path)
        .map(async (post) => {
          const bucket = post.photo_storage_bucket || COMMUNITY_BUCKET;
          const { data, error } = await supabase.storage.from(bucket).createSignedUrl(post.photo_storage_path, 60 * 60);
          return [post.id, error ? '' : data?.signedUrl || ''];
        }));
      if (!cancelled) setUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    }
    signPhotos();
    return () => { cancelled = true; };
  }, [posts]);
  return urls;
}
