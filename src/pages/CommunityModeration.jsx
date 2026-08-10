import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock3,
  Gift,
  HandHeart,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Search,
  Trash2,
  UserRound,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  withdrawn: { label: 'Retirada', tone: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export function CommunityModeration({ data, actions, currentUser }) {
  const posts = data.community_posts || [];
  const interests = data.community_interests || [];
  const beneficiaries = data.beneficiaries || [];
  const canEdit = canDo(currentUser, 'community-moderation', 'edit');
  const [filters, setFilters] = useState({ search: '', status: 'pending_review', category: '' });
  const [reviewing, setReviewing] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const photoUrls = useCommunityPhotoUrls(posts);

  const beneficiaryById = useMemo(() => new Map(beneficiaries.map((item) => [item.id, item])), [beneficiaries]);
  const interestsByPost = useMemo(() => {
    const map = new Map();
    interests.forEach((interest) => {
      if (interest.status === 'cancelled') return;
      const list = map.get(interest.post_id) || [];
      list.push(interest);
      map.set(interest.post_id, list);
    });
    return map;
  }, [interests]);
  const counters = useMemo(() => {
    return posts.reduce((acc, post) => {
      const key = post.status || 'pending_review';
      acc[key] = (acc[key] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0, pending_review: 0, approved: 0, rejected: 0, withdrawn: 0 });
  }, [posts]);
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
      setNotice('Publicacion aprobada. Ya puede verse en el Portal Beneficiario.');
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

  return (
    <div>
      <PageHeader
        title="Moderacion de Comunidad"
        description="Revisa publicaciones del Portal Beneficiario antes de hacerlas visibles. No se publican datos personales automaticamente."
      />

      {notice && <div className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Pendientes" value={counters.pending_review} tone="amber" icon={Clock3} />
        <SummaryCard label="Aprobadas" value={counters.approved} tone="emerald" icon={CheckCircle2} />
        <SummaryCard label="Rechazadas" value={counters.rejected} tone="red" icon={XCircle} />
        <SummaryCard label="Intereses" value={interests.filter((item) => item.status !== 'cancelled').length} tone="brand" icon={MessageCircle} />
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
          </select>
          <select className={inputClass} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">Todas las categorias</option>
            <option value="employment">Empleo</option>
            <option value="offer">Ofrezco</option>
            <option value="need">Necesito</option>
          </select>
        </div>
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
              photoUrl={photoUrls[post.id]}
              canEdit={canEdit}
              onReview={() => {
                setReviewing(post);
                setReviewNotes(post.moderation_notes || '');
                setRejectReason(post.rejection_reason || '');
              }}
              onWithdraw={() => withdrawPost(post)}
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
    </div>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }) {
  const tones = {
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    brand: 'border-brand-100 bg-brand-50 text-brand-700'
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

function CommunityPostCard({ post, beneficiary, interests, photoUrl, canEdit, onReview, onWithdraw }) {
  const category = categoryMeta[post.category] || categoryMeta.need;
  const status = statusMeta[post.status] || statusMeta.pending_review;
  const CategoryIcon = category.icon;
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
          <Badge className="border-slate-100 bg-slate-50 text-slate-600"><MessageCircle size={14} /> {interests.length} intereses</Badge>
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
        </div>
        {interests.length > 0 && (
          <div className="rounded-md border border-brand-100 bg-brand-50/60 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-brand-700">Personas interesadas</p>
            <div className="mt-2 space-y-1 text-sm text-brand-900">
              {interests.slice(0, 4).map((interest) => (
                <p key={interest.id}>{formatDate(interest.created_at)} · {interest.message || 'Interes registrado'}</p>
              ))}
              {interests.length > 4 && <p className="font-semibold">+{interests.length - 4} intereses mas</p>}
            </div>
          </div>
        )}
        {post.rejection_reason && post.status === 'rejected' && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <strong>Motivo del rechazo:</strong> {post.rejection_reason}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" disabled={!canEdit} onClick={onReview}>Revisar</Button>
          {post.status !== 'withdrawn' && <Button variant="danger" disabled={!canEdit} onClick={onWithdraw}><Trash2 size={16} /> Retirar</Button>}
        </div>
      </div>
    </article>
  );
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
