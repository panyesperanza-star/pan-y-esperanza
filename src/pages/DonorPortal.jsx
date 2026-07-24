import {
  Award,
  Bell,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileDown,
  Gift,
  HeartHandshake,
  Home,
  KeyRound,
  Landmark,
  Lock,
  LogOut,
  PencilLine,
  ShieldCheck,
  TrendingUp,
  UserRound
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { formatDate, todayISO } from '../lib/formatters';

const SESSION_KEY = 'pan-y-esperanza-donor-portal-session';

const TABS = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'impacto', label: 'Mi impacto', icon: TrendingUp },
  { id: 'donaciones', label: 'Mis donaciones', icon: Gift },
  { id: 'donar', label: 'Donar de nuevo', icon: CreditCard },
  { id: 'certificados', label: 'Certificados', icon: Award },
  { id: 'campanas', label: 'Campanas', icon: CalendarDays },
  { id: 'perfil', label: 'Perfil', icon: UserRound }
];

export function DonorPortal({ actions }) {
  const service = actions?.donantePortal;
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
    return <PortalShell><StatusBlock type="error" title="Portal no disponible" text="El servicio de donaciones no esta inicializado." /></PortalShell>;
  }

  if (!session?.token) {
    return (
      <PortalShell>
        <section className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff9f1_0%,#f6efe4_52%,#efe3d4_100%)] px-5 py-10 sm:px-8">
          <div className="w-full max-w-[30rem]">
            <div className="overflow-hidden rounded-[1.25rem] border border-[#2f4a3a]/12 bg-white shadow-[0_1.5rem_4rem_rgba(37,33,29,0.12)]">
              <img
                src="/assets/photographs/portal-donantes-stock.jpg"
                alt="Donacion de alimentos preparada para ayudar"
                className="aspect-[16/9] w-full object-cover object-center"
              />
              <form onSubmit={requestAccess} className="p-8 pt-7 sm:p-10 sm:pt-8">
                <div className="text-center">
                  <h1 className="text-3xl font-bold leading-tight text-ink">Portal del Donante</h1>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">
                    Accede para consultar tus donaciones, certificados e impacto.
                  </p>
                </div>

                <div className="mt-8 space-y-5">
                  <FormField label="Correo electronico" required>
                    <input
                      className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="donante@example.org"
                      autoComplete="email"
                    />
                  </FormField>
                </div>
                {success && <StatusBlock type="success" title="Operación realizada" text={success} className="mt-5" />}
                {error && <StatusBlock type="error" title="No se pudo acceder" text={error} className="mt-5" />}
                <Button type="submit" className="mt-7 min-h-[3.9rem] w-full rounded-xl px-6 text-base"><KeyRound size={18} /> Solicitar codigo OTP</Button>
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
                  <Button type="submit" className="mt-5 min-h-[3.9rem] w-full rounded-xl px-6 text-base"><Lock size={18} /> Entrar al portal</Button>
                </form>
              )}
            </div>
          </div>
        </section>
      </PortalShell>
    );
  }

  if (loading || !overview) {
    return <PortalShell><div className="flex min-h-screen items-center justify-center text-slate-600">Cargando Portal de Donaciones...</div></PortalShell>;
  }

  const donor = overview.donor;

  return (
    <PortalShell>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo className="h-12 w-auto" />
          <Button variant="secondary" onClick={clearSession}><LogOut size={16} /> Salir</Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {success && <StatusBlock type="success" title="Operación realizada" text={success} className="mb-5" />}
        {error && <StatusBlock type="error" title="Atencion" text={error} className="mb-5" />}

        <section className="rounded-md border border-brand-700 bg-brand-700 p-5 text-white shadow-panel">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Portal de Donaciones</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Hola, {donor.name}.</h1>
              <p className="mt-2 max-w-3xl text-brand-50">Gracias por tu ayuda y por seguir cerca de Pan y Esperanza.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[440px]">
              <HeroMetric label="Ultima donacion" value={overview.latestDonation ? formatDate(overview.latestDonation.donated_at || overview.latestDonation.created_at) : 'Sin registro'} />
              <HeroMetric label="Campanas" value={overview.upcomingCampaigns.length} />
              <HeroMetric label="Donaciones" value={overview.donations.length} />
            </div>
          </div>
        </section>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Secciones del portal de donaciones">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`focus-ring inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${activeTab === tab.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <section className="mt-5">
          {activeTab === 'inicio' && <HomeSection overview={overview} setActiveTab={setActiveTab} />}
          {activeTab === 'impacto' && <ImpactSection impact={overview.impact} />}
          {activeTab === 'donaciones' && <DonationsSection donations={overview.donations} />}
          {activeTab === 'donar' && <DonateAgainSection donor={donor} session={session} campaigns={overview.activeCampaigns} service={service} refresh={refreshPortal} setSuccess={setSuccess} setError={setError} />}
          {activeTab === 'certificados' && <CertificatesSection certificates={overview.certificates} donor={donor} />}
          {activeTab === 'campanas' && <CampaignsSection campaigns={overview.activeCampaigns} donations={overview.donations} />}
          {activeTab === 'perfil' && <ProfileSection donor={donor} session={session} service={service} refresh={refreshPortal} setSuccess={setSuccess} setError={setError} />}
        </section>
      </main>
    </PortalShell>
  );
}

function HomeSection({ overview, setActiveTab }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Panel title="Inicio" icon={Home}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard title="Mi impacto" text="Consulta estadisticas agregadas de tu ayuda." action="Ver impacto" onClick={() => setActiveTab('impacto')} />
          <ActionCard title="Mis donaciones" text={`${overview.donations.length} donacion registrada.`} action="Ver donaciones" onClick={() => setActiveTab('donaciones')} />
          <ActionCard title="Donar de nuevo" text="Bizum, PayPal, Stripe o transferencia." action="Elegir metodo" onClick={() => setActiveTab('donar')} />
          <ActionCard title="Campanas" text={`${overview.activeCampaigns.length} campana disponible.`} action="Ver campanas" onClick={() => setActiveTab('campanas')} />
        </div>
      </Panel>
      <ImpactSection impact={overview.impact} compact />
    </div>
  );
}

function ImpactSection({ impact, compact = false }) {
  return (
    <Panel title="Mi impacto" icon={TrendingUp}>
      {!compact && (
        <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 p-4">
          <p className="font-bold text-brand-800">Gracias por tu ayuda.</p>
          <p className="mt-1 text-sm text-brand-700">Con tu colaboracion hemos conseguido:</p>
        </div>
      )}
      <ImpactGrid impact={impact} />
      {!compact && (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Los datos mostrados son estadisticas agregadas y no contienen informacion personal de las personas atendidas.
        </p>
      )}
    </Panel>
  );
}

function DonationsSection({ donations }) {
  return (
    <Panel title="Mis donaciones" icon={Gift}>
      {!donations.length ? <EmptyState title="Todavía no hay donaciones registradas." text="Cuando realices una aportación validada aparecerá en este historial." /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Importe</th>
                <th className="py-2 pr-4">Metodo de pago</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {donations.map((donation) => (
                <tr key={donation.id}>
                  <td className="py-3 pr-4 font-semibold text-ink">{formatDate(donation.donated_at || donation.created_at)}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatMoney(donation.amount || donation.estimated_value)}</td>
                  <td className="py-3 pr-4 text-slate-700">{donation.payment_method || 'No indicado'}</td>
                  <td className="py-3 pr-4"><span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700">{donation.status || donation.state || 'Registrada'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DonateAgainSection({ donor, session, campaigns, service, refresh, setSuccess, setError }) {
  const [form, setForm] = useState({
    payment_method: 'Bizum',
    amount: '20',
    frequency: 'Puntual',
    campaign_id: campaigns[0]?.id || '',
    notes: ''
  });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await service.createDonationIntent(session, form);
      setSuccess('Donacion preparada para continuar con el metodo seleccionado.');
      setForm((current) => ({ ...current, amount: '20', notes: '' }));
      await refresh();
    } catch (error) {
      setError(error.message || 'No se pudo preparar la donacion.');
    }
  }

  return (
    <Panel title="Donar de nuevo" icon={CreditCard}>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <FormField label="Metodo de pago" required>
          <select className={inputClass} value={form.payment_method} onChange={(event) => setFormValue(setForm, 'payment_method', event.target.value)}>
            <option>Bizum</option>
            <option>PayPal</option>
            <option>Stripe</option>
            <option>Transferencia</option>
          </select>
        </FormField>
        <FormField label="Importe" required>
          <input className={inputClass} value={form.amount} onChange={(event) => setFormValue(setForm, 'amount', event.target.value)} placeholder="20 EUR" inputMode="decimal" />
        </FormField>
        <FormField label="Frecuencia">
          <select className={inputClass} value={form.frequency} onChange={(event) => setFormValue(setForm, 'frequency', event.target.value)}>
            <option>Puntual</option>
            <option>Mensual (preparado)</option>
          </select>
        </FormField>
        <FormField label="Campana">
          <select className={inputClass} value={form.campaign_id} onChange={(event) => setFormValue(setForm, 'campaign_id', event.target.value)}>
            <option value="">Sin campana concreta</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name || campaign.title}</option>)}
          </select>
        </FormField>
        <div className="lg:col-span-2">
          <FormField label="Observaciones">
            <textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={(event) => setFormValue(setForm, 'notes', event.target.value)} />
          </FormField>
        </div>
        <div className="lg:col-span-2">
          <Button type="submit"><HeartHandshake size={16} /> Preparar donacion</Button>
        </div>
      </form>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {['Bizum', 'PayPal', 'Stripe', 'Transferencia'].map((method) => (
          <div key={method} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="font-bold text-ink">{method}</p>
            <p className="mt-1 text-xs text-slate-600">Preparado para conectar configuracion real.</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CertificatesSection({ certificates, donor }) {
  return (
    <Panel title="Certificados" icon={Award}>
      {!certificates.length ? <EmptyState title="No hay certificados disponibles." text="Los certificados validados aparecerán aquí." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {certificates.map((certificate) => (
            <article key={certificate.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{certificate.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{certificate.certificate_type === 'annual' ? 'Certificado anual' : 'Certificado individual'}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{certificate.status || 'Disponible'} · {formatDate(certificate.issued_at || certificate.created_at)}</p>
                </div>
                <Button variant="secondary" onClick={() => downloadCertificate(certificate, donor)}><FileDown size={16} /> Descargar</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CampaignsSection({ campaigns, donations }) {
  return (
    <Panel title="Campanas" icon={CalendarDays}>
      {!campaigns.length ? <EmptyState title="No hay campañas activas." text="Las campañas solidarias aparecerán cuando están disponibles." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign) => {
            const goal = Number(campaign.economic_goal || campaign.goal_amount || 0);
            const raised = Number(campaign.collected_amount || campaign.raised_amount || 0);
            const personal = donations
              .filter((donation) => donation.campaign_id === campaign.id)
              .reduce((total, donation) => total + Number(donation.amount || donation.estimated_value || 0), 0);
            const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
            return (
              <article key={campaign.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">{campaign.name || campaign.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{campaign.description || 'Campana solidaria activa.'}</p>
                  </div>
                  <span className="rounded-full bg-brand-100 px-2 py-1 text-xs font-bold text-brand-700">{campaign.status || 'Activa'}</span>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <DataRow label="Objetivo economico" value={goal ? formatMoney(goal) : 'Pendiente de definir'} />
                  <DataRow label="Recaudado" value={raised ? formatMoney(raised) : 'Sin dato'} />
                  <DataRow label="Tu participacion" value={personal ? formatMoney(personal) : 'Sin aportacion registrada'} />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ProfileSection({ donor, session, service, refresh, setSuccess, setError }) {
  const [form, setForm] = useState({
    name: donor.name || '',
    email: donor.email || '',
    phone: donor.phone || ''
  });
  const sensitiveOtp = useSensitiveOtp(service, session, 'profile_update');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await sensitiveOtp.requireVerified();
      await service.requestProfileUpdate(session, form, { notes: 'Solicitud de actualizacion desde Portal de Donaciones.' });
      setSuccess('Solicitud de actualizacion enviada para revision.');
      await refresh();
    } catch (error) {
      setError(error.message || 'No se pudo solicitar la actualizacion.');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Panel title="Perfil" icon={UserRound}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" required>
            <input className={inputClass} value={form.name} onChange={(event) => setFormValue(setForm, 'name', event.target.value)} />
          </FormField>
          <FormField label="Correo" required>
            <input className={inputClass} type="email" value={form.email} onChange={(event) => setFormValue(setForm, 'email', event.target.value)} />
          </FormField>
          <FormField label="Telefono">
            <input className={inputClass} value={form.phone} onChange={(event) => setFormValue(setForm, 'phone', event.target.value)} />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit"><PencilLine size={16} /> Solicitar cambio</Button>
          </div>
        </form>
      </Panel>
      <OtpBox state={sensitiveOtp} />
    </div>
  );
}

function useSensitiveOtp(service, session, action) {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState('');

  async function request() {
    const nextChallenge = await service.requestSensitiveOtp(session, action);
    setChallenge(nextChallenge);
    setCode('');
    setVerified(false);
    setMessage('Codigo OTP enviado para confirmar la accion.');
  }

  async function verify() {
    if (!challenge) throw new Error('Solicita primero un codigo OTP.');
    await service.verifySensitiveOtp({ session, code, challengeId: challenge.id, action });
    setVerified(true);
    setMessage('Codigo validado.');
  }

  async function requireVerified() {
    if (!verified) throw new Error('Valida el codigo OTP antes de enviar este cambio.');
    return true;
  }

  return { challenge, code, setCode, verified, message, request, verify, requireVerified };
}

function OtpBox({ state }) {
  return (
    <Panel title="Seguridad" icon={ShieldCheck}>
      <p className="text-sm text-slate-600">Los cambios sensibles requieren codigo OTP.</p>
      <div className="mt-4 space-y-3">
        <Button variant="secondary" onClick={state.request}><KeyRound size={16} /> Solicitar OTP</Button>
        {state.challenge && (
          <div className="space-y-3 rounded-md border border-brand-100 bg-brand-50 p-3">
            <FormField label="Codigo OTP">
              <input className={inputClass} value={state.code} onChange={(event) => state.setCode(event.target.value)} placeholder="Introduce el codigo" inputMode="numeric" />
            </FormField>
            <Button type="button" onClick={state.verify}><Lock size={16} /> Confirmar OTP</Button>
          </div>
        )}
        {state.message && <p className="text-sm font-semibold text-brand-700">{state.message}</p>}
      </div>
    </Panel>
  );
}

function ImpactGrid({ impact }) {
  const items = [
    ['Familias atendidas', impact.familiesServed],
    ['Menores atendidos', impact.minorsServed],
    ['Kg de alimentos repartidos', impact.foodKg],
    ['Entregas realizadas', impact.deliveriesCompleted],
    ['Campanas apoyadas', impact.campaignsSupported]
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <article key={label} className="rounded-md border border-slate-100 bg-slate-50 p-4">
          <p className="text-2xl font-bold text-brand-700">{formatNumber(value)}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        </article>
      ))}
    </div>
  );
}

function AccessFeature({ icon: Icon, title, text }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="inline-flex rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={18} /></div>
      <h3 className="mt-4 font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
    </article>
  );
}

function HeroMetric({ label, value }) {
  return (
    <article className="rounded-md border border-white/15 bg-white/10 p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-50">{label}</p>
    </article>
  );
}

function ActionCard({ title, text, action, onClick }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring rounded-md border border-slate-100 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-panel">
      <h3 className="font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      <span className="mt-3 inline-flex text-sm font-bold text-brand-700">{action}</span>
    </button>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-5 flex items-center gap-3">
        <span className="inline-flex rounded-md bg-brand-50 p-2 text-brand-700"><Icon size={20} /></span>
        <h2 className="text-xl font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
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
    <div className="rounded-md bg-white p-3">
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

function downloadCertificate(certificate, donor) {
  const text = [
    'Pan y Esperanza',
    certificate.title,
    `Donante: ${donor.name}`,
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
