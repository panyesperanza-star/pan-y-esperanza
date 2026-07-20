import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileDown,
  Gift,
  HandHeart,
  HeartHandshake,
  Home,
  KeyRound,
  Lock,
  LogOut,
  PackageCheck,
  PencilLine,
  ShieldCheck,
  TrendingUp,
  UserRound
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { formatDate, normalize, todayISO } from '../lib/formatters';

const SESSION_KEY = 'pan-y-esperanza-collaborator-portal-session';

const TABS = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'impacto', label: 'Mi impacto', icon: TrendingUp },
  { id: 'donaciones', label: 'Mis donaciones', icon: Gift },
  { id: 'nueva-donacion', label: 'Nueva donacion', icon: PackageCheck },
  { id: 'certificados', label: 'Certificados', icon: Award },
  { id: 'campanas', label: 'Campanas', icon: CalendarDays },
  { id: 'recursos', label: 'Recursos', icon: BookOpen },
  { id: 'perfil', label: 'Perfil', icon: UserRound }
];

export function CollaboratorPortal({ actions }) {
  const service = actions?.colaboradorPortal;
  const [email, setEmail] = useState('');
  const [accessOtp, setAccessOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [session, setSession] = useState(() => readStoredSession());
  const [overview, setOverview] = useState(null);
  const [activeTab, setActiveTab] = useState('inicio');
  const [loading, setLoading] = useState(Boolean(session?.token));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!session?.token || !service) {
      setLoading(false);
      return;
    }
    refreshPortal();
  }, [session?.token, service]);

  async function refreshPortal() {
    if (!session?.token) return;
    setLoading(true);
    setError('');
    try {
      setOverview(await service.getPortalOverview(session));
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar el portal.');
      clearSession();
    } finally {
      setLoading(false);
    }
  }

  async function requestAccess(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const nextChallenge = await service.requestAccessOtp(email);
      setChallenge(nextChallenge);
      setAccessOtp('');
      setSuccess('Codigo OTP enviado. Introducelo para acceder.');
    } catch (requestError) {
      setError(requestError.message || 'No se pudo enviar el codigo OTP.');
    }
  }

  async function verifyAccess(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const result = await service.verifyAccessOtp({ email: challenge?.email || email, code: accessOtp, challengeId: challenge?.id });
      const nextSession = { ...result.session, auth: result.auth };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setOverview(await service.getPortalOverview(nextSession));
      setSuccess('Acceso validado correctamente.');
    } catch (verifyError) {
      setError(verifyError.message || 'No se pudo validar el codigo OTP.');
    }
  }

  async function clearSession() {
    if (session?.token) await service?.logout?.(session).catch(() => {});
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setOverview(null);
    setChallenge(null);
    setAccessOtp('');
    setActiveTab('inicio');
  }

  if (!service) {
    return <PortalShell><StatusBlock type="error" title="Portal no disponible" text="El servicio de colaboradores no esta inicializado." /></PortalShell>;
  }

  if (!session?.token) {
    return (
      <PortalShell>
        <section className="grid min-h-screen bg-[#f6efe4] lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
          <div className="relative hidden min-h-screen overflow-hidden lg:block">
            <img
              src="/assets/photographs/portal-colaborador.png"
              alt="Personas con alimentos preparados para colaborar con Pan y Esperanza"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#25211d]/72 via-[#2f4a3a]/48 to-[#25211d]/34" />
            <div className="relative z-10 flex min-h-screen flex-col justify-between px-12 py-10 text-[#fff9f1] xl:px-16">
              <BrandLogo className="h-24 w-auto" showText={false} />
              <div className="max-w-2xl pb-10">
                <p className="inline-flex rounded-full bg-[#2f4a3a]/95 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-[#fff9f1] shadow-[0_0.8rem_2rem_rgba(37,33,29,0.24)]">Portal Colaborador</p>
                <h1 className="mt-6 text-5xl font-bold leading-[1.03] tracking-normal xl:text-6xl">Un espacio privado para seguir ayudando.</h1>
                <p className="mt-6 max-w-xl text-xl font-medium leading-relaxed text-[#fff9f1]/90">
              Consulta tu impacto, donaciones, certificados, campañas y recursos propuestos para Pan y Esperanza.
            </p>
              </div>
              <p className="max-w-xl text-base font-semibold leading-relaxed text-[#fff9f1]/82">Acceso seguro para colaboradores, empresas y personas que forman parte de la red de ayuda.</p>
            </div>
          </div>

          <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
            <div className="w-full max-w-[31rem]">
              <div className="mb-8 text-center lg:hidden">
                <BrandLogo className="mx-auto h-24 w-auto" showText={false} />
                <p className="mx-auto mt-6 inline-flex rounded-full bg-[#2f4a3a] px-4 py-2 text-sm font-black uppercase tracking-[0.18em] text-[#fff9f1] shadow-[0_0.8rem_2rem_rgba(37,33,29,0.16)]">Portal Colaborador</p>
                <h1 className="mt-4 text-3xl font-bold leading-tight text-ink">Un espacio privado para seguir ayudando.</h1>
              </div>

              <div className="overflow-hidden rounded-[1.5rem] border border-[#2f4a3a]/14 bg-[#fff9f1] shadow-[0_1.6rem_4rem_rgba(37,33,29,0.14)]">
                <div className="p-7 sm:p-9">
                  <div className="flex justify-center">
                    <BrandLogo className="h-20 w-auto" showText={false} />
                  </div>
                  <div className="mt-8 text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c96f3d]">Acceso privado</p>
                    <h2 className="mt-3 text-3xl font-bold leading-tight text-ink">Entra a tu portal</h2>
                    <p className="mt-3 text-base leading-relaxed text-slate-600">Introduce tu correo y confirma el codigo OTP.</p>
                  </div>

                  <form onSubmit={requestAccess} className="mt-8 space-y-5">
              <FormField label="Correo electronico" required>
                <input
                  className={`${inputClass} min-h-[3.5rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="colaborador@example.org"
                  autoComplete="email"
                />
              </FormField>
                    <Button type="submit" className="min-h-[3.75rem] w-full rounded-xl px-6 text-base"><KeyRound size={18} /> Solicitar codigo OTP</Button>
            </form>

            {challenge && (
              <form onSubmit={verifyAccess} className="border-t border-brand-100 bg-white/74 p-7 sm:p-9">
                <FormField label="Codigo OTP" required>
                  <input
                    className={`${inputClass} min-h-[3.5rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                    value={accessOtp}
                    onChange={(event) => setAccessOtp(event.target.value)}
                    placeholder="Introduce el codigo"
                    inputMode="numeric"
                  />
                </FormField>
                <Button type="submit" className="mt-5 min-h-[3.75rem] w-full rounded-xl px-6 text-base"><Lock size={18} /> Entrar al portal</Button>
              </form>
            )}

                  {success && <StatusBlock type="success" title="Operacion realizada" text={success} className="mt-5" />}
                  {error && <StatusBlock type="error" title="No se pudo acceder" text={error} className="mt-5" />}
                </div>
              </div>
            </div>
          </div>
        </section>
      </PortalShell>
    );
  }

  if (loading || !overview) {
    return <PortalShell><div className="flex min-h-screen items-center justify-center text-slate-600">Cargando Portal de Colaboradores...</div></PortalShell>;
  }

  const collaborator = overview.collaborator;

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
              <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Portal de Colaboradores</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Hola, {collaborator.contact_name || collaborator.name}.</h1>
              <p className="mt-2 max-w-3xl text-brand-50">Gracias por formar parte de Pan y Esperanza.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[440px]">
              <HeroMetric label="Ultima colaboracion" value={overview.latestCollaboration ? formatDate(overview.latestCollaboration.donated_at || overview.latestCollaboration.created_at) : 'Sin registro'} />
              <HeroMetric label="Campanas" value={overview.upcomingCampaigns.length} />
              <HeroMetric label="Donaciones" value={overview.donations.length} />
            </div>
          </div>
        </section>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Secciones del portal de colaboradores">
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
          {activeTab === 'inicio' && <HomeSection overview={overview} setActiveTab={setActiveTab} />}
          {activeTab === 'impacto' && <ImpactSection impact={overview.impact} />}
          {activeTab === 'donaciones' && <DonationsSection donations={overview.donations} />}
          {activeTab === 'nueva-donacion' && <NewDonationSection service={service} collaborator={collaborator} session={session} refresh={refreshPortal} setError={setError} setSuccess={setSuccess} />}
          {activeTab === 'certificados' && <CertificatesSection certificates={overview.certificates} collaborator={collaborator} />}
          {activeTab === 'campanas' && <CampaignsSection service={service} collaborator={collaborator} session={session} campaigns={overview.activeCampaigns} refresh={refreshPortal} setError={setError} setSuccess={setSuccess} />}
          {activeTab === 'recursos' && <ResourcesSection service={service} collaborator={collaborator} session={session} resources={overview.resources} refresh={refreshPortal} setError={setError} setSuccess={setSuccess} />}
          {activeTab === 'perfil' && <ProfileSection service={service} collaborator={collaborator} session={session} refresh={refreshPortal} setError={setError} setSuccess={setSuccess} />}
        </section>
      </main>
    </PortalShell>
  );
}

function HomeSection({ overview, setActiveTab }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <Panel title="Inicio" icon={Home}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard title="Mi impacto" text="Consulta estadisticas agregadas de tu colaboracion." action="Ver impacto" onClick={() => setActiveTab('impacto')} />
          <ActionCard title="Mis donaciones" text={`${overview.donations.length} colaboracion${overview.donations.length === 1 ? '' : 'es'} registrada${overview.donations.length === 1 ? '' : 's'}.`} action="Ver donaciones" onClick={() => setActiveTab('donaciones')} />
          <ActionCard title="Nueva donacion" text="Registra productos, servicios o aportacion economica." action="Crear donacion" onClick={() => setActiveTab('nueva-donacion')} />
          <ActionCard title="Campanas" text={`${overview.upcomingCampaigns.length} campana${overview.upcomingCampaigns.length === 1 ? '' : 's'} disponible${overview.upcomingCampaigns.length === 1 ? '' : 's'}.`} action="Ver campanas" onClick={() => setActiveTab('campanas')} />
        </div>
      </Panel>
      <Panel title="Resumen de impacto" icon={TrendingUp}>
        <ImpactGrid impact={overview.impact} compact />
      </Panel>
    </div>
  );
}

function ImpactSection({ impact }) {
  return (
    <Panel title="Mi impacto" icon={TrendingUp}>
      <div className="mb-5 rounded-md bg-brand-50 p-4 text-brand-700">
        <p className="text-lg font-bold">Gracias por colaborar.</p>
        <p className="mt-1 text-sm font-semibold">Con tu ayuda hemos conseguido:</p>
      </div>
      <ImpactGrid impact={impact} />
      <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Los datos mostrados son estadisticas agregadas y no contienen informacion personal de las personas atendidas.
      </p>
    </Panel>
  );
}

function DonationsSection({ donations }) {
  return (
    <Panel title="Mis donaciones" icon={Gift}>
      {!donations.length ? <EmptyState title="Sin donaciones registradas." text="Cuando exista una colaboracion aparecera aqui." /> : (
        <div className="grid gap-3">
          {donations.map((donation) => (
            <article key={donation.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{donation.donation_type || 'Colaboracion'}</h3>
                  <p className="mt-1 text-sm text-slate-600">{donation.quantity || donation.notes || formatMoney(donation.estimated_value)}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(donation.donated_at || donation.created_at)}</p>
                </div>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{donation.status || donation.state || 'Registrada'}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function NewDonationSection({ service, collaborator, session, refresh, setError, setSuccess }) {
  const [form, setForm] = useState({
    donation_type: 'Productos',
    amount: '',
    quantity: '',
    description: '',
    pickup_requested: true,
    proposed_pickup_at: todayISO(),
    observations: ''
  });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await service.createDonationRequest(session, form);
      setForm({ donation_type: 'Productos', amount: '', quantity: '', description: '', pickup_requested: true, proposed_pickup_at: todayISO(), observations: '' });
      setSuccess('Donacion registrada para revision.');
      await refresh();
    } catch (error) {
      setError(error.message || 'No se pudo registrar la donacion.');
    }
  }

  return (
    <Panel title="Nueva donacion" icon={PackageCheck}>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <FormField label="Tipo" required>
          <select className={inputClass} value={form.donation_type} onChange={(event) => setFormValue(setForm, 'donation_type', event.target.value)}>
            <option>Economica</option>
            <option>Productos</option>
            <option>Servicios</option>
          </select>
        </FormField>
        <FormField label="Importe o cantidad">
          <input className={inputClass} value={form.donation_type === 'Economica' ? form.amount : form.quantity} onChange={(event) => setFormValue(setForm, form.donation_type === 'Economica' ? 'amount' : 'quantity', event.target.value)} placeholder={form.donation_type === 'Economica' ? '250 EUR' : '120 kg / 40 unidades'} />
        </FormField>
        <FormField label="Descripcion" required>
          <textarea className={`${inputClass} min-h-28`} value={form.description} onChange={(event) => setFormValue(setForm, 'description', event.target.value)} />
        </FormField>
        <div className="space-y-4">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.pickup_requested} onChange={(event) => setFormValue(setForm, 'pickup_requested', event.target.checked)} />
            Solicitar recogida
          </label>
          <FormField label="Fecha propuesta">
            <input className={inputClass} type="date" value={form.proposed_pickup_at} onChange={(event) => setFormValue(setForm, 'proposed_pickup_at', event.target.value)} />
          </FormField>
          <FormField label="Observaciones">
            <textarea className={`${inputClass} min-h-20`} value={form.observations} onChange={(event) => setFormValue(setForm, 'observations', event.target.value)} />
          </FormField>
        </div>
        <div className="lg:col-span-2">
          <Button type="submit"><Gift size={16} /> Registrar donacion</Button>
        </div>
      </form>
    </Panel>
  );
}

function CertificatesSection({ certificates, collaborator }) {
  return (
    <Panel title="Certificados" icon={Award}>
      {!certificates.length ? <EmptyState title="No hay certificados disponibles." text="Los certificados validados apareceran aqui." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {certificates.map((certificate) => (
            <article key={certificate.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <h3 className="font-bold text-ink">{certificate.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{certificate.status || 'Disponible'} · {formatDate(certificate.issued_at || certificate.created_at)}</p>
              <Button variant="secondary" className="mt-4" onClick={() => downloadCertificate(certificate, collaborator)}><FileDown size={16} /> Descargar</Button>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CampaignsSection({ service, collaborator, session, campaigns, refresh, setError, setSuccess }) {
  async function join(campaign) {
    setError('');
    setSuccess('');
    try {
      await service.joinCampaign(session, campaign.id);
      setSuccess('Solicitud para unirse a la campana enviada.');
      await refresh();
    } catch (error) {
      setError(error.message || 'No se pudo enviar la solicitud.');
    }
  }

  return (
    <Panel title="Campanas" icon={CalendarDays}>
      {!campaigns.length ? <EmptyState title="No hay campanas activas." text="Las campanas activas y futuras apareceran aqui." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <h3 className="font-bold text-ink">{campaign.name || campaign.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{campaign.description || campaign.observations || 'Campana operativa.'}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(campaign.start_date || campaign.created_at)} · {campaign.status}</p>
              <Button className="mt-4" onClick={() => join(campaign)}><HeartHandshake size={16} /> Unirme</Button>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ResourcesSection({ service, collaborator, session, resources, refresh, setError, setSuccess }) {
  const [form, setForm] = useState({ titulo: '', descripcion: '', categoria_slug: 'empleo', categoria_nombre: 'Empleo', tipo: 'Oferta de empleo', url: '' });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await service.proposeResource(session, form);
      setForm({ titulo: '', descripcion: '', categoria_slug: 'empleo', categoria_nombre: 'Empleo', tipo: 'Oferta de empleo', url: '' });
      setSuccess('Recurso enviado para revision.');
      await refresh();
    } catch (error) {
      setError(error.message || 'No se pudo enviar el recurso.');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
      <Panel title="Publicar recurso" icon={BookOpen}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Tipo" required>
            <select className={inputClass} value={form.tipo} onChange={(event) => setResourceType(setForm, event.target.value)}>
              <option>Oferta de empleo</option>
              <option>Curso</option>
              <option>Beca</option>
              <option>Recurso util</option>
            </select>
          </FormField>
          <FormField label="Titulo" required>
            <input className={inputClass} value={form.titulo} onChange={(event) => setFormValue(setForm, 'titulo', event.target.value)} />
          </FormField>
          <FormField label="Descripcion" required>
            <textarea className={`${inputClass} min-h-28`} value={form.descripcion} onChange={(event) => setFormValue(setForm, 'descripcion', event.target.value)} />
          </FormField>
          <FormField label="URL">
            <input className={inputClass} value={form.url} onChange={(event) => setFormValue(setForm, 'url', event.target.value)} placeholder="https://..." />
          </FormField>
          <Button type="submit"><PencilLine size={16} /> Enviar a revision</Button>
        </form>
      </Panel>
      <Panel title="Recursos enviados" icon={BookOpen}>
        {!resources.length ? <EmptyState title="Sin recursos enviados." text="Los recursos propuestos apareceran aqui." /> : (
          <div className="space-y-3">
            {resources.map((resource) => (
              <InfoCard key={resource.id} title={resource.titulo} meta={resource.status === 'published' ? 'Publicado' : 'En revision'} text={resource.descripcion} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ProfileSection({ service, collaborator, session, refresh, setError, setSuccess }) {
  const [form, setForm] = useState({
    contact_name: collaborator.contact_name || '',
    email: collaborator.email || '',
    phone: collaborator.phone || '',
    address: collaborator.address || '',
    logo_path: collaborator.logo_path || ''
  });
  const otp = useSensitiveOtp(service, session, 'update_collaborator_profile', setError);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      otp.assertVerified();
      await service.requestProfileUpdate(session, form, { notes: 'Solicitud de actualizacion desde Portal de Colaboradores.' });
      otp.reset();
      setSuccess('Solicitud de actualizacion enviada para revision.');
      await refresh();
    } catch (error) {
      setError(error.message || 'No se pudo enviar la actualizacion.');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1fr]">
      <Panel title="Perfil" icon={UserRound}>
        <dl className="grid gap-3 text-sm">
          <DataRow label="Entidad" value={collaborator.name} />
          <DataRow label="Tipo" value={collaborator.type} />
          <DataRow label="Persona de contacto" value={collaborator.contact_name} />
          <DataRow label="Correo" value={collaborator.email} />
          <DataRow label="Telefono" value={collaborator.phone} />
          <DataRow label="Direccion" value={collaborator.address} />
        </dl>
      </Panel>
      <Panel title="Modificar perfil" icon={ShieldCheck}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Persona de contacto">
            <input className={inputClass} value={form.contact_name} onChange={(event) => setFormValue(setForm, 'contact_name', event.target.value)} />
          </FormField>
          <FormField label="Correo">
            <input className={inputClass} type="email" value={form.email} onChange={(event) => setFormValue(setForm, 'email', event.target.value)} />
          </FormField>
          <FormField label="Telefono">
            <input className={inputClass} value={form.phone} onChange={(event) => setFormValue(setForm, 'phone', event.target.value)} />
          </FormField>
          <FormField label="Direccion">
            <textarea className={`${inputClass} min-h-20`} value={form.address} onChange={(event) => setFormValue(setForm, 'address', event.target.value)} />
          </FormField>
          <FormField label="Logo">
            <input className={inputClass} value={form.logo_path} onChange={(event) => setFormValue(setForm, 'logo_path', event.target.value)} placeholder="Ruta o URL del logo" />
          </FormField>
          <OtpBox otp={otp} />
          <Button type="submit"><ShieldCheck size={16} /> Enviar cambios</Button>
        </form>
      </Panel>
    </div>
  );
}

function useSensitiveOtp(service, session, action, setError) {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);

  async function request() {
    setError('');
    try {
      const nextChallenge = await service.requestSensitiveOtp(session, action);
      setChallenge(nextChallenge);
      setCode('');
      setVerified(false);
    } catch (error) {
      setError(error.message || 'No se pudo generar el codigo OTP.');
    }
  }

  async function verify() {
    try {
      await service.verifySensitiveOtp({ session, code, challengeId: challenge?.id, action });
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
          <p className="mt-1 text-sm text-brand-700">Necesario para confirmar esta modificacion sensible.</p>
        </div>
        <Button variant="secondary" onClick={otp.request}>Solicitar OTP</Button>
      </div>
      {otp.challenge && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className={inputClass} value={otp.code} onChange={(event) => otp.setCode(event.target.value)} placeholder="Introduce el codigo" inputMode="numeric" />
          <Button variant={otp.verified ? 'subtle' : 'primary'} onClick={otp.verify} disabled={otp.verified}>
            {otp.verified ? <CheckCircle2 size={16} /> : <KeyRound size={16} />} {otp.verified ? 'Verificado' : 'Verificar'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ImpactGrid({ impact, compact = false }) {
  const items = [
    { label: 'Familias atendidas', value: impact.familiesServed },
    { label: 'Menores atendidos', value: impact.minorsServed },
    { label: 'Kg de alimentos repartidos', value: impact.foodKg },
    { label: 'Entregas realizadas', value: impact.deliveriesCompleted },
    { label: 'Campanas apoyadas', value: impact.campaignsSupported }
  ];
  return (
    <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
      {items.map((item) => (
        <article key={item.label} className="rounded-md border border-slate-100 bg-slate-50 p-4">
          <p className="text-2xl font-bold text-brand-700">{formatNumber(item.value)}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
        </article>
      ))}
    </div>
  );
}

function AccessFeature({ icon: Icon, title, text }) {
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

function ActionCard({ title, text, action, onClick }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring rounded-md border border-slate-100 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-panel">
      <h3 className="font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
      <span className="mt-3 inline-flex text-sm font-bold text-brand-700">{action}</span>
    </button>
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
      {success ? <CheckCircle2 size={18} /> : <Bell size={18} />}
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

function PortalShell({ children }) {
  return <div className="min-h-screen bg-[#f7faf6] text-ink">{children}</div>;
}

function setFormValue(setForm, key, value) {
  setForm((current) => ({ ...current, [key]: value }));
}

function setResourceType(setForm, type) {
  const category = type === 'Oferta de empleo'
    ? { categoria_slug: 'empleo', categoria_nombre: 'Empleo' }
    : type === 'Curso'
      ? { categoria_slug: 'formacion', categoria_nombre: 'Formacion' }
      : type === 'Beca'
        ? { categoria_slug: 'ayudas', categoria_nombre: 'Ayudas' }
        : { categoria_slug: 'tramites', categoria_nombre: 'Tramites' };
  setForm((current) => ({ ...current, tipo: type, ...category }));
}

function downloadCertificate(certificate, collaborator) {
  const text = [
    'Pan y Esperanza',
    certificate.title,
    `Colaborador: ${collaborator.name}`,
    `Fecha: ${formatDate(certificate.issued_at || certificate.created_at)}`,
    'Documento preparado para validacion administrativa.'
  ].join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${certificate.title || 'certificado'}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-ES');
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (!number) return 'Sin importe indicado';
  return `${number.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function readStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
