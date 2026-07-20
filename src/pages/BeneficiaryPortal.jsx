import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileText,
  History,
  Home,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { formatDate, normalize, todayISO } from '../lib/formatters';

const SESSION_KEY = 'pan-y-esperanza-beneficiary-portal-session';

const TABS = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'entrega', label: 'Proxima entrega', icon: CalendarDays },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'avisos', label: 'Avisos', icon: Bell },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'recursos', label: 'Recursos', icon: BookOpen },
  { id: 'solicitudes', label: 'Solicitudes', icon: MessageSquare },
  { id: 'perfil', label: 'Perfil', icon: UserRound }
];

export function BeneficiaryPortal({ data, actions }) {
  const portalService = actions?.beneficiarioPortal;
  const [credentials, setCredentials] = useState({ code: '', birthDate: '' });
  const [accessOtp, setAccessOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [session, setSession] = useState(() => readStoredSession());
  const [overview, setOverview] = useState(null);
  const [activeTab, setActiveTab] = useState('inicio');
  const [loading, setLoading] = useState(Boolean(session?.token));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!session?.token || !portalService) {
      setLoading(false);
      return;
    }
    loadOverview(session);
  }, [session?.token, portalService]);

  async function loadOverview(activeSession) {
    setLoading(true);
    setError('');
    try {
      const nextOverview = await portalService.getPortalOverview(activeSession);
      setOverview(nextOverview);
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar el portal.');
      clearSession();
    } finally {
      setLoading(false);
    }
  }

  async function handleAccess(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const nextChallenge = await portalService.requestAccessOtp(credentials);
      setChallenge(nextChallenge);
      setAccessOtp('');
      setSuccess('Codigo OTP enviado. Introducelo para acceder.');
    } catch (accessError) {
      setError(accessError.message || 'No se pudo validar el acceso.');
    }
  }

  async function verifyAccess(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const result = await portalService.verifyAccessOtp({
        ...credentials,
        otpCode: accessOtp,
        challengeId: challenge?.id
      });
      const nextSession = { ...result.session, auth: result.auth };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setOverview(await portalService.getPortalOverview(nextSession));
      setSuccess('Acceso validado correctamente.');
    } catch (verifyError) {
      setError(verifyError.message || 'No se pudo validar el codigo OTP.');
    }
  }

  async function clearSession() {
    if (session?.token) await portalService?.logout?.(session).catch(() => {});
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setOverview(null);
    setChallenge(null);
    setAccessOtp('');
    setCredentials({ code: '', birthDate: '' });
    setActiveTab('inicio');
  }

  async function refreshPortal() {
    if (session?.token) await loadOverview(session);
  }

  if (!portalService) {
    return <PortalShell><StatusBlock type="error" title="Portal no disponible" text="El servicio del portal no esta inicializado." /></PortalShell>;
  }

  if (!session?.token) {
    return (
      <PortalShell>
        <section className="grid min-h-screen bg-[#fff9f1] lg:grid-cols-2">
          <div className="relative min-h-[18rem] overflow-hidden lg:min-h-screen">
            <img
              src="/assets/photographs/entrega.jpg"
              alt="Personas recibiendo alimentos de Pan y Esperanza"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#25211d]/22 via-[#25211d]/4 to-[#25211d]/34" />
            <div className="relative z-10 flex min-h-[18rem] flex-col justify-between px-6 py-6 lg:min-h-screen lg:px-10 lg:py-10">
              <BrandLogo className="h-14 w-auto lg:h-16" showText={false} />
              <p className="text-xs font-semibold tracking-wide text-[#fff9f1]/90 lg:text-sm">
                Pan y Esperanza. Siempre cerca de ti.
              </p>
            </div>
          </div>

          <div className="flex min-h-[calc(100vh-18rem)] items-center justify-center bg-[#f6efe4] px-5 py-10 sm:px-8 lg:min-h-screen lg:px-12">
            <div className="w-full max-w-[30rem]">
              <div className="overflow-hidden rounded-[1.25rem] border border-[#2f4a3a]/12 bg-white shadow-[0_1.5rem_4rem_rgba(37,33,29,0.12)]">
                <form onSubmit={handleAccess} className="p-8 sm:p-10">
                  <div className="flex justify-center">
                    <BrandLogo className="h-16 w-auto" showText={false} />
                  </div>
                  <div className="mt-7 text-center">
                    <h1 className="text-3xl font-bold leading-tight text-ink">Portal del Beneficiario</h1>
                    <p className="mt-3 text-base leading-relaxed text-slate-600">
                      Accede de forma segura a tus entregas, avisos y documentos.
                    </p>
                  </div>

                  <div className="mt-8 space-y-5">
                    <FormField label="Codigo de beneficiario" required>
                      <input
                        className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                        value={credentials.code}
                        onChange={(event) => setCredentials((current) => ({ ...current, code: event.target.value }))}
                        placeholder="PYE-00001"
                        autoComplete="username"
                      />
                    </FormField>
                    <FormField label="Fecha de nacimiento" required>
                      <input
                        className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                        value={credentials.birthDate}
                        onChange={(event) => setCredentials((current) => ({ ...current, birthDate: event.target.value }))}
                        placeholder="1988-04-14"
                        inputMode="numeric"
                        autoComplete="bday"
                      />
                    </FormField>
                  </div>
                  {error && <StatusBlock type="error" title="No se pudo acceder" text={error} className="mt-5" />}
                  <Button type="submit" className="mt-7 min-h-[3.9rem] w-full rounded-xl px-6 text-base">
                    <Lock size={18} /> Solicitar codigo OTP
                  </Button>
                </form>
                {challenge && (
                  <form onSubmit={verifyAccess} className="border-t border-brand-100 bg-[#fff9f1] p-8 sm:p-10">
                    <FormField label="Codigo OTP" required>
                      <input
                        className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                        value={accessOtp}
                        onChange={(event) => setAccessOtp(event.target.value)}
                        placeholder="Introduce el codigo"
                        inputMode="numeric"
                      />
                    </FormField>
                    <Button type="submit" className="mt-5 min-h-[3.9rem] w-full rounded-xl px-6 text-base">
                      <Lock size={18} /> Entrar al portal
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </PortalShell>
    );
  }

  if (loading || !overview) {
    return <PortalShell><div className="flex min-h-screen items-center justify-center text-slate-600">Cargando portal...</div></PortalShell>;
  }

  const beneficiary = overview.beneficiary;
  const nextDelivery = getNextDelivery(overview.upcomingDeliveries);
  const pendingDocs = (overview.documents || []).filter(isPendingDocument);
  const unreadNotices = (overview.notices || []).filter((notice) => normalize(notice.status) !== 'read');

  return (
    <PortalShell>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo className="h-12 w-auto" />
          <Button variant="secondary" onClick={clearSession}><LogOut size={16} /> Salir</Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {success && <StatusBlock type="success" title="Operacion realizada" text={success} className="mb-5" />}
        {error && <StatusBlock type="error" title="Atencion" text={error} className="mb-5" />}

        <section className="rounded-md border border-brand-700 bg-brand-700 p-5 text-white shadow-panel">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Expediente {beneficiary.code}</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{beneficiary.full_name}</h1>
              <p className="mt-2 max-w-3xl text-brand-50">
                Portal privado para consultar ayudas, documentos, avisos y recursos personalizados.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
              <HeroMetric label="Proxima entrega" value={nextDelivery ? formatDate(nextDelivery.delivered_at || nextDelivery.created_at) : 'Sin fecha'} />
              <HeroMetric label="Avisos" value={unreadNotices.length} />
              <HeroMetric label="Documentos" value={pendingDocs.length} />
            </div>
          </div>
        </section>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Secciones del portal">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </nav>

        <section className="mt-5">
          {activeTab === 'inicio' && (
            <PortalHome overview={overview} nextDelivery={nextDelivery} pendingDocs={pendingDocs} unreadNotices={unreadNotices} setActiveTab={setActiveTab} auth={session.auth} />
          )}
          {activeTab === 'entrega' && <DeliveriesSection deliveries={overview.upcomingDeliveries || []} />}
          {activeTab === 'historial' && <HistorySection history={overview.history || []} />}
          {activeTab === 'avisos' && <NoticesSection notices={overview.notices || []} service={portalService} session={session} onRefresh={refreshPortal} setError={setError} setSuccess={setSuccess} />}
          {activeTab === 'documentos' && <DocumentsSection documents={overview.documents || []} />}
          {activeTab === 'recursos' && <ResourcesSection resources={overview.personalizedResources || []} />}
          {activeTab === 'solicitudes' && (
            <RequestsSection
              service={portalService}
              beneficiary={beneficiary}
              session={session}
              requests={overview.profileUpdates || []}
              onRefresh={refreshPortal}
              setError={setError}
              setSuccess={setSuccess}
            />
          )}
          {activeTab === 'perfil' && (
            <ProfileSection
              service={portalService}
              beneficiary={beneficiary}
              session={session}
              onRefresh={refreshPortal}
              setError={setError}
              setSuccess={setSuccess}
            />
          )}
        </section>
      </main>
    </PortalShell>
  );
}

function PortalShell({ children }) {
  return <div className="min-h-screen bg-[#f7faf6] text-ink">{children}</div>;
}

function SecurityFeature({ icon: Icon, title, text }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-panel">
      <span className="inline-flex rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={18} /></span>
      <h3 className="mt-3 font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </article>
  );
}

function HeroMetric({ label, value }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/10 p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-100">{label}</p>
    </article>
  );
}

function PortalHome({ overview, nextDelivery, pendingDocs, unreadNotices, setActiveTab, auth }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <Panel title="Resumen" icon={Home}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard title="Proxima entrega" text={nextDelivery ? nextDelivery.help_type || nextDelivery.status || 'Entrega programada' : 'No hay entregas programadas.'} action="Ver entrega" onClick={() => setActiveTab('entrega')} />
          <ActionCard title="Documentacion pendiente" text={`${pendingDocs.length} documento${pendingDocs.length === 1 ? '' : 's'} pendiente${pendingDocs.length === 1 ? '' : 's'}.`} action="Ver documentos" onClick={() => setActiveTab('documentos')} />
          <ActionCard title="Avisos" text={`${unreadNotices.length} aviso${unreadNotices.length === 1 ? '' : 's'} sin leer.`} action="Ver avisos" onClick={() => setActiveTab('avisos')} />
          <ActionCard title="Recursos personalizados" text={`${(overview.personalizedResources || []).length} recurso${(overview.personalizedResources || []).length === 1 ? '' : 's'} disponible${(overview.personalizedResources || []).length === 1 ? '' : 's'}.`} action="Ver recursos" onClick={() => setActiveTab('recursos')} />
        </div>
      </Panel>
      <Panel title="Seguridad" icon={ShieldCheck}>
        <div className="space-y-3 text-sm text-slate-600">
          <p>El acceso se valida con codigo de beneficiario y fecha de nacimiento.</p>
          <p>Las solicitudes y cambios de perfil requieren codigo OTP.</p>
          <span className="inline-flex rounded-md bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">
            {auth?.supabaseAuthReady ? 'Supabase Auth preparado' : 'Modo seguro local'}
          </span>
        </div>
      </Panel>
    </div>
  );
}

function ActionCard({ title, text, action, onClick }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring rounded-md border border-slate-100 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-panel">
      <h3 className="font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
      <span className="mt-3 inline-flex text-sm font-bold text-brand-700">{action}</span>
    </button>
  );
}

function DeliveriesSection({ deliveries }) {
  return (
    <Panel title="Proxima entrega" icon={CalendarDays}>
      {!deliveries.length ? <EmptyState title="No hay entregas programadas." text="Cuando exista una entrega confirmada aparecera aqui." /> : (
        <div className="grid gap-3">
          {deliveries.map((delivery) => (
            <InfoCard key={delivery.id} title={delivery.help_type || 'Entrega programada'} meta={formatDate(delivery.delivered_at || delivery.created_at)} text={delivery.status || 'Pendiente'} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function HistorySection({ history }) {
  return (
    <Panel title="Historial de entregas" icon={History}>
      {!history.length ? <EmptyState title="No hay historial disponible." text="Las entregas y comunicaciones registradas apareceran aqui." /> : (
        <div className="space-y-3">
          {history.map((item) => (
            <InfoCard key={`${item.source}-${item.id}`} title={item.source === 'delivery' ? 'Entrega' : item.title || 'Historial social'} meta={formatDate(item.timeline_at)} text={item.help_type || item.notes || item.status || 'Registro del expediente'} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function NoticesSection({ notices, service, session, onRefresh, setError, setSuccess }) {
  async function markRead(notice) {
    if (notice.source !== 'portal') return;
    try {
      await service.markNoticeRead(session, notice.id);
      setSuccess('Aviso marcado como leido.');
      await onRefresh();
    } catch (error) {
      setError(error.message || 'No se pudo actualizar el aviso.');
    }
  }

  return (
    <Panel title="Avisos" icon={Bell}>
      {!notices.length ? <EmptyState title="Sin avisos." text="Los avisos importantes apareceran en esta seccion." /> : (
        <div className="grid gap-3">
          {notices.map((notice) => (
            <article key={notice.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{notice.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{notice.message}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(notice.created_at)}</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${normalize(notice.status) === 'read' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                  {normalize(notice.status) === 'read' ? 'Leido' : 'Pendiente'}
                </span>
              </div>
              {notice.source === 'portal' && normalize(notice.status) !== 'read' && <Button variant="secondary" className="mt-3" onClick={() => markRead(notice)}>Marcar como leido</Button>}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DocumentsSection({ documents }) {
  return (
    <Panel title="Documentos" icon={FileText}>
      {!documents.length ? <EmptyState title="No hay documentos registrados." text="La documentacion solicitada aparecera aqui." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {documents.map((document) => (
            <article key={document.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{document.document_type || document.file_name || 'Documento'}</h3>
                  <p className="mt-1 text-sm text-slate-600">{document.notes || document.file_name || 'Sin observaciones.'}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(document.uploaded_at)}</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${isPendingDocument(document) ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {isPendingDocument(document) ? 'Pendiente' : 'Recibido'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ResourcesSection({ resources }) {
  return (
    <Panel title="Centro de Recursos personalizado" icon={BookOpen}>
      {!resources.length ? <EmptyState title="No hay recursos personalizados." text="Cuando haya recursos publicados para tu perfil apareceran aqui." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {resources.map((resource) => (
            <article key={resource.id || resource.slug || resource.titulo} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <h3 className="font-bold text-ink">{resource.titulo || resource.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{resource.descripcion || resource.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[resource.categoria_nombre, resource.provincia_nombre, resource.tipo].filter(Boolean).map((tag) => (
                  <span key={tag} className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RequestsSection({ service, beneficiary, session, requests, onRefresh, setError, setSuccess }) {
  const [form, setForm] = useState({ request_type: 'Informacion', message: '', preferred_contact: 'Telefono' });
  const otp = useOtpChallenge(service, session, 'crear_solicitud', setError);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      otp.assertVerified();
      await service.createRequest(session, form);
      setForm({ request_type: 'Informacion', message: '', preferred_contact: 'Telefono' });
      otp.reset();
      setSuccess('Solicitud enviada correctamente.');
      await onRefresh();
    } catch (error) {
      setError(error.message || 'No se pudo enviar la solicitud.');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
      <Panel title="Nueva solicitud" icon={MessageSquare}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Tipo de solicitud" required>
            <select className={inputClass} value={form.request_type} onChange={(event) => setForm((current) => ({ ...current, request_type: event.target.value }))}>
              <option>Informacion</option>
              <option>Revision de entrega</option>
              <option>Documentacion</option>
              <option>Cambio de datos</option>
              <option>Otros</option>
            </select>
          </FormField>
          <FormField label="Mensaje" required>
            <textarea className={`${inputClass} min-h-28`} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
          </FormField>
          <FormField label="Contacto preferido">
            <select className={inputClass} value={form.preferred_contact} onChange={(event) => setForm((current) => ({ ...current, preferred_contact: event.target.value }))}>
              <option>Telefono</option>
              <option>Email</option>
              <option>WhatsApp</option>
            </select>
          </FormField>
          <OtpBox otp={otp} />
          <Button type="submit"><MessageSquare size={16} /> Enviar solicitud</Button>
        </form>
      </Panel>
      <Panel title="Solicitudes enviadas" icon={History}>
        {!requests.length ? <EmptyState title="Sin solicitudes." text="Las solicitudes enviadas apareceran aqui." /> : (
          <div className="space-y-3">
            {requests.map((request) => (
              <InfoCard key={request.id} title={request.requested_changes?.request_type || 'Solicitud'} meta={request.status || 'Pendiente'} text={request.notes || request.requested_changes?.message || 'Solicitud registrada'} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ProfileSection({ service, beneficiary, session, onRefresh, setError, setSuccess }) {
  const [form, setForm] = useState({
    phone: beneficiary.phone || '',
    email: beneficiary.email || '',
    address_full: beneficiary.address_full || ''
  });
  const otp = useOtpChallenge(service, session, 'actualizar_perfil', setError);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      otp.assertVerified();
      await service.requestProfileUpdate(session, form, { notes: 'Solicitud de actualizacion desde portal beneficiario.' });
      otp.reset();
      setSuccess('Solicitud de actualizacion enviada.');
      await onRefresh();
    } catch (error) {
      setError(error.message || 'No se pudo solicitar la actualizacion.');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1fr]">
      <Panel title="Datos del expediente" icon={UserRound}>
        <dl className="grid gap-3 text-sm">
          <DataRow label="Codigo" value={beneficiary.code} />
          <DataRow label="Nombre" value={beneficiary.full_name} />
          <DataRow label="Fecha de nacimiento" value={formatDate(beneficiary.birth_date)} />
          <DataRow label="Telefono" value={beneficiary.phone} />
          <DataRow label="Email" value={beneficiary.email} />
          <DataRow label="Direccion" value={beneficiary.address_full} />
          <DataRow label="Situacion" value={beneficiary.situation} />
        </dl>
      </Panel>
      <Panel title="Solicitar actualizacion" icon={ShieldCheck}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Telefono">
            <input className={inputClass} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </FormField>
          <FormField label="Email">
            <input className={inputClass} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </FormField>
          <FormField label="Direccion">
            <textarea className={`${inputClass} min-h-24`} value={form.address_full} onChange={(event) => setForm((current) => ({ ...current, address_full: event.target.value }))} />
          </FormField>
          <OtpBox otp={otp} />
          <Button type="submit"><ShieldCheck size={16} /> Solicitar actualizacion</Button>
        </form>
      </Panel>
    </div>
  );
}

function useOtpChallenge(service, session, action, setError) {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);

  async function request() {
    setError('');
    try {
      const nextChallenge = await service.requestOtp(session, action);
      setChallenge(nextChallenge);
      setCode('');
      setVerified(false);
    } catch (error) {
      setError(error.message || 'No se pudo generar el codigo OTP.');
    }
  }

  async function verify() {
    try {
      await service.verifyOtp({ session, code, challengeId: challenge?.id, action });
      setVerified(true);
    } catch (error) {
      setError(error.message || 'No se pudo verificar el codigo OTP.');
    }
  }

  function assertVerified() {
    if (!verified) throw new Error('Verifica el codigo OTP antes de continuar.');
  }

  function reset() {
    setChallenge(null);
    setCode('');
    setVerified(false);
  }

  return { challenge, code, setCode, verified, request, verify, assertVerified, reset };
}

function OtpBox({ otp }) {
  return (
    <div className="rounded-md border border-brand-100 bg-brand-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-brand-700">Codigo OTP requerido</p>
          <p className="mt-1 text-sm text-brand-700">Necesario para confirmar esta accion sensible.</p>
        </div>
        <Button variant="secondary" onClick={otp.request}>Solicitar OTP</Button>
      </div>
      {otp.challenge && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className={inputClass} value={otp.code} onChange={(event) => otp.setCode(event.target.value)} placeholder="Introduce el codigo" />
          <Button variant={otp.verified ? 'subtle' : 'primary'} onClick={otp.verify} disabled={otp.verified}>
            {otp.verified ? <CheckCircle2 size={16} /> : <KeyRound size={16} />} {otp.verified ? 'Verificado' : 'Verificar'}
          </Button>
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={20} /></span>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InfoCard({ title, meta, text }) {
  return (
    <article className="rounded-md border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-bold text-ink">{title}</h3>
        {meta && <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{meta}</span>}
      </div>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
    </article>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}

function StatusBlock({ type, title, text, className = '' }) {
  const success = type === 'success';
  return (
    <div className={`flex gap-3 rounded-md border p-3 text-sm ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'} ${className}`}>
      {success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <div>
        <p className="font-bold">{title}</p>
        <p>{text}</p>
      </div>
    </div>
  );
}

function DataRow({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-ink">{value || 'No indicado'}</dd>
    </div>
  );
}

function getNextDelivery(deliveries = []) {
  const today = todayISO();
  return deliveries.find((delivery) => String(delivery.delivered_at || delivery.created_at || '') >= today) || deliveries[0] || null;
}

function isPendingDocument(document) {
  return !document.file_data_url || normalize(document.notes).includes('pendiente') || normalize(document.status).includes('pendiente');
}

function readStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
