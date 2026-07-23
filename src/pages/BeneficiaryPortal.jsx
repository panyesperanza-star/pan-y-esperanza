import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileText,
  History,
  Home,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  PackageCheck,
  Send,
  ShieldCheck,
  UserRound,
  UsersRound,
  X
} from 'lucide-react';
import { Component, useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { formatDate, normalize, todayISO } from '../lib/formatters';

const SESSION_KEY = 'pan-y-esperanza-beneficiary-portal-session';
const PORTAL_REQUEST_TIMEOUT_MS = 8000;
const PIN_RULE = /^\d{6,12}$/;

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
  const [credentials, setCredentials] = useState({ accessIdentifier: '', pin: '' });
  const [accessOtp, setAccessOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [session, setSession] = useState(null);
  const [overview, setOverview] = useState(null);
  const [pinChange, setPinChange] = useState({ currentPin: '', newPin: '', confirmPin: '' });
  const [activeTab, setActiveTab] = useState('inicio');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    if (!portalService) return;
    const storedSession = readStoredSession();
    if (!storedSession?.token) return;

    let cancelled = false;

    async function restoreStoredSession() {
      try {
        const nextOverview = await withTimeout(portalService.getPortalOverview(storedSession));
        if (cancelled) return;
        setOverview(nextOverview);
        setSession(storedSession);
      } catch (restoreError) {
        if (cancelled) return;
        sessionStorage.removeItem(SESSION_KEY);
        setOverview(null);
        setSession(null);
        setError(restoreError.message || 'No se pudo recuperar la sesion. Vuelve a acceder.');
      }
    }

    restoreStoredSession();

    return () => {
      cancelled = true;
    };
  }, [portalService]);

  async function loadOverview(activeSession) {
    setLoading(true);
    setError('');
    try {
      const nextOverview = await withTimeout(portalService.getPortalOverview(activeSession));
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
    setLoading(true);
    try {
      const nextChallenge = await withTimeout(portalService.requestAccessOtp(credentials));
      setChallenge(nextChallenge);
      setAccessOtp('');
      setSuccess('Codigo OTP enviado. Introducelo para acceder.');
    } catch (accessError) {
      setError(accessError.message || 'No se pudo validar el acceso.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyAccess(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await withTimeout(portalService.verifyAccessOtp({
        ...credentials,
        otpCode: accessOtp,
        challengeId: challenge?.id
      }));
      const baseSession = { ...result.session, auth: result.auth };
      const nextOverview = await withTimeout(portalService.getPortalOverview(baseSession));
      const nextSession = { ...result.session, auth: { ...result.auth, ...nextOverview.auth } };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setOverview(nextOverview);
      setSession(nextSession);
      setSuccess('Acceso validado correctamente.');
    } catch (verifyError) {
      setError(verifyError.message || 'No se pudo validar el codigo OTP.');
    } finally {
      setLoading(false);
    }
  }

  async function clearSession() {
    if (session?.token) await portalService?.logout?.(session).catch(() => {});
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setOverview(null);
    setChallenge(null);
    setAccessOtp('');
    setCredentials({ accessIdentifier: '', pin: '' });
    setPinChange({ currentPin: '', newPin: '', confirmPin: '' });
    setActiveTab('inicio');
  }

  async function handleChangePin(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const nextPinPayload = {
      currentPin: normalizePinInput(formData.get('currentPin') || pinChange.currentPin),
      newPin: normalizePinInput(formData.get('newPin') || pinChange.newPin),
      confirmPin: normalizePinInput(formData.get('confirmPin') || pinChange.confirmPin)
    };
    const currentPinValid = PIN_RULE.test(nextPinPayload.currentPin);
    const newPinValid = PIN_RULE.test(nextPinPayload.newPin);
    const confirmPinValid = PIN_RULE.test(nextPinPayload.confirmPin);
    const sameConfirmation = nextPinPayload.newPin === nextPinPayload.confirmPin;
    const rejectionReason = !currentPinValid
      ? 'CURRENT_PIN_RULE_FAILED'
      : !newPinValid
        ? 'NEW_PIN_RULE_FAILED'
        : !confirmPinValid
          ? 'CONFIRM_PIN_RULE_FAILED'
          : !sameConfirmation
            ? 'PIN_CONFIRMATION_MISMATCH'
            : null;
    console.info('[beneficiary-access] Frontend cambio PIN validacion', {
      currentPinLength: nextPinPayload.currentPin.length,
      newPinLength: nextPinPayload.newPin.length,
      confirmPinLength: nextPinPayload.confirmPin.length,
      currentPinMasked: maskPinForDebug(nextPinPayload.currentPin),
      newPinMasked: maskPinForDebug(nextPinPayload.newPin),
      confirmPinMasked: maskPinForDebug(nextPinPayload.confirmPin),
      currentPinRegex: currentPinValid,
      newPinRegex: newPinValid,
      confirmPinRegex: confirmPinValid,
      sameConfirmation,
      rejectionReason,
      rule: 'PIN numerico de 6 a 12 digitos'
    });
    if (rejectionReason) {
      setLoading(false);
      if (rejectionReason === 'PIN_CONFIRMATION_MISMATCH') {
        setError('Los PIN no coinciden.');
        return;
      }
      if (rejectionReason === 'CURRENT_PIN_RULE_FAILED') {
        setError('El PIN temporal debe tener entre 6 y 12 numeros.');
        return;
      }
      if (rejectionReason === 'CONFIRM_PIN_RULE_FAILED') {
        setError('La confirmacion del PIN debe tener entre 6 y 12 numeros.');
        return;
      }
      setError('El nuevo PIN debe tener entre 6 y 12 numeros.');
      return;
    }
    try {
      console.info('[beneficiary-access] Frontend enviando payload cambio PIN', {
        keys: Object.keys(nextPinPayload),
        hasCurrentPin: Boolean(nextPinPayload.currentPin),
        hasNewPin: Boolean(nextPinPayload.newPin),
        hasConfirmPin: Boolean(nextPinPayload.confirmPin),
        newPinLength: nextPinPayload.newPin.length,
        confirmMatches: nextPinPayload.newPin === nextPinPayload.confirmPin
      });
      const result = await withTimeout(portalService.changePin(session, nextPinPayload));
      const nextAuth = {
        ...(overview?.auth || {}),
        mustChangePin: false,
        pinChangedAt: result.pinChangedAt || new Date().toISOString()
      };
      const nextOverview = { ...overview, auth: nextAuth };
      const nextSession = { ...session, auth: { ...(session?.auth || {}), ...nextAuth } };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setOverview(nextOverview);
      setSession(nextSession);
      setPinChange({ currentPin: '', newPin: '', confirmPin: '' });
      setSuccess('PIN cambiado correctamente. Ya puedes utilizar tu portal.');
    } catch (changeError) {
      setError(changeError.message || 'No se pudo cambiar el PIN.');
    } finally {
      setLoading(false);
    }
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
        <section className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff9f1_0%,#f6efe4_52%,#efe3d4_100%)] px-5 py-10 sm:px-8">
          <div className="w-full max-w-[30rem]">
              <div className="overflow-hidden rounded-[1.25rem] border border-[#2f4a3a]/12 bg-white shadow-[0_1.5rem_4rem_rgba(37,33,29,0.12)]">
                <img
                  src="/assets/photographs/portal-beneficiario-stock.jpg"
                  alt="Atencion social cercana y digna"
                  className="aspect-[16/9] w-full object-cover object-center"
                />
                <form onSubmit={handleAccess} className="p-8 pt-7 sm:p-10 sm:pt-8">
                  <div className="text-center">
                    <h1 className="text-3xl font-bold leading-tight text-ink">Portal del Beneficiario</h1>
                    <p className="mt-3 text-base leading-relaxed text-slate-600">
                      Accede de forma segura a tus entregas, avisos y documentos.
                    </p>
                  </div>

                  <div className="mt-8 space-y-5">
                    <FormField label="Identificador privado" required>
                      <input
                        className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                        value={credentials.accessIdentifier}
                        onChange={(event) => setCredentials((current) => ({ ...current, accessIdentifier: event.target.value }))}
                        placeholder="PYE-A1B2C3D4"
                        autoComplete="username"
                      />
                    </FormField>
                    <FormField label="PIN de acceso" required>
                      <input
                        className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                        type="password"
                        value={credentials.pin}
                        onChange={(event) => setCredentials((current) => ({ ...current, pin: event.target.value }))}
                        placeholder="Introduce tu PIN"
                        inputMode="numeric"
                        autoComplete="current-password"
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
        </section>
      </PortalShell>
    );
  }

  if (loading || !overview) {
    return <PortalShell><div className="flex min-h-screen items-center justify-center text-slate-600">Cargando portal...</div></PortalShell>;
  }

  if (overview.auth?.mustChangePin === true) {
    return (
      <PortalShell>
        <ChangePinScreen
          pinChange={pinChange}
          setPinChange={setPinChange}
          onSubmit={handleChangePin}
          loading={loading}
          error={error}
        />
      </PortalShell>
    );
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
              <HeroMetric label="Proxima entrega" value={nextDelivery ? formatDeliveryDateTime(nextDelivery) : 'Sin fecha'} />
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
          {activeTab === 'entrega' && (
            <PortalSectionBoundary
              sectionName="Proxima entrega"
              onRecover={() => setActiveTab('inicio')}
              fallbackMessage="No hemos podido cargar tus proximas entregas. Intentalo de nuevo mas tarde."
            >
              <DeliveriesSection
                deliveries={overview.upcomingDeliveries || []}
                service={portalService}
                session={session}
                onRefresh={refreshPortal}
                setError={setError}
                setSuccess={setSuccess}
              />
            </PortalSectionBoundary>
          )}
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
      <BeneficiaryAssistantPanel
        service={portalService}
        session={session}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        setActiveTab={setActiveTab}
        onRefresh={refreshPortal}
        setError={setError}
        setSuccess={setSuccess}
      />
    </PortalShell>
  );
}

function PortalShell({ children }) {
  return <div className="min-h-screen bg-[#f7faf6] text-ink">{children}</div>;
}

function maskPinForDebug(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 2) return '*'.repeat(text.length);
  return `${'*'.repeat(text.length - 2)}${text.slice(-2)}`;
}

function normalizePinInput(value) {
  return String(value || '').trim();
}

function ChangePinScreen({ pinChange, setPinChange, onSubmit, loading, error }) {
  return (
    <section className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff9f1_0%,#f6efe4_52%,#efe3d4_100%)] px-5 py-10 sm:px-8">
      <div className="w-full max-w-[30rem]">
        <form onSubmit={onSubmit} className="rounded-[1.25rem] border border-[#2f4a3a]/12 bg-white p-8 shadow-[0_1.5rem_4rem_rgba(37,33,29,0.12)] sm:p-10">
          <div className="text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <KeyRound size={22} />
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight text-ink">Cambia tu PIN temporal</h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Para proteger tu portal, crea un PIN personal antes de continuar.
            </p>
          </div>

          <div className="mt-8 space-y-5">
            <FormField label="PIN temporal" required>
              <input
                className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                name="currentPin"
                type="password"
                value={pinChange.currentPin}
                onChange={(event) => setPinChange((current) => ({ ...current, currentPin: event.target.value }))}
                placeholder="Introduce el PIN temporal"
                inputMode="numeric"
                autoComplete="current-password"
              />
            </FormField>
            <FormField label="Nuevo PIN" required>
              <input
                className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                name="newPin"
                type="password"
                value={pinChange.newPin}
                onChange={(event) => setPinChange((current) => ({ ...current, newPin: event.target.value }))}
                placeholder="Entre 6 y 12 numeros"
                inputMode="numeric"
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="Repetir nuevo PIN" required>
              <input
                className={`${inputClass} min-h-[3.75rem] rounded-xl border-slate-300 px-4 text-base shadow-sm focus:border-brand-600 focus:ring-brand-600`}
                name="confirmPin"
                type="password"
                value={pinChange.confirmPin}
                onChange={(event) => setPinChange((current) => ({ ...current, confirmPin: event.target.value }))}
                placeholder="Repite el nuevo PIN"
                inputMode="numeric"
                autoComplete="new-password"
              />
            </FormField>
          </div>

          {error && <StatusBlock type="error" title="No se pudo cambiar el PIN" text={error} className="mt-5" />}
          <Button type="submit" disabled={loading} className="mt-7 min-h-[3.9rem] w-full rounded-xl px-6 text-base">
            <Lock size={18} /> Guardar PIN y continuar
          </Button>
        </form>
      </div>
    </section>
  );
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

const DOCUMENT_STATUS_TONES = {
  received: { label: 'Recibido', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendiente', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700' },
  required: { label: 'Requerido', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700' }
};

const ASSISTANT_QUICK_ACTIONS = [
  { intent: 'next_delivery', label: 'Cuando es mi proxima entrega?' },
  { intent: 'documents', label: 'Me falta algun documento?' },
  { intent: 'notices', label: 'Ver mis avisos' },
  { intent: 'create_request', label: 'Enviar una solicitud' },
  { intent: 'contact', label: 'Contactar con la asociacion' }
];

function BeneficiaryAssistantPanel({ service, session, open, onOpenChange, setActiveTab, onRefresh, setError, setSuccess }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hola. Puedo ayudarte con tu proxima entrega, documentos, avisos, solicitudes y datos de contacto de Pan y Esperanza.'
    }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);

  async function askAssistant(intent, text, extra = {}) {
    const userText = String(text || '').trim();
    if (!service?.askAssistant || !session?.token) {
      setError('El asistente necesita una sesion activa.');
      return;
    }

    setBusy(true);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text: userText || 'Consulta del portal' }
    ]);

    try {
      const reply = await withTimeout(service.askAssistant(session, {
        intent,
        message: userText,
        ...extra
      }), 12000);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reply.answer,
          action: reply.action,
          requiresConfirmation: reply.requiresConfirmation === true,
          draftRequest: reply.draftRequest || null
        }
      ]);
      if (reply.requiresConfirmation && reply.draftRequest) setPendingRequest(reply.draftRequest);
      if (reply.actionPerformed === 'request_created') {
        setPendingRequest(null);
        setSuccess('Solicitud enviada desde el asistente.');
        await onRefresh?.();
      }
    } catch (assistantError) {
      const message = assistantError.message || 'No se pudo completar la consulta del asistente.';
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', text: message }
      ]);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextInput = input.trim();
    if (!nextInput || busy) return;
    setInput('');
    askAssistant('ask', nextInput);
  }

  function handleQuickAction(action) {
    if (busy) return;
    askAssistant(action.intent, action.label);
  }

  function confirmPendingRequest() {
    if (!pendingRequest || busy) return;
    askAssistant('confirm_request', pendingRequest.message, { draftRequest: pendingRequest });
  }

  function cancelPendingRequest() {
    setPendingRequest(null);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'assistant', text: 'Solicitud cancelada. No se ha guardado ningun cambio.' }
    ]);
  }

  function handleAssistantAction(action = {}) {
    if (action.type === 'open_tab' && action.tab) {
      setActiveTab(action.tab);
      onOpenChange(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="focus-ring fixed bottom-5 right-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-3 text-sm font-bold text-brand-700 shadow-panel transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50"
      >
        <CircleHelp size={18} /> &iquest;Necesitas ayuda?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex bg-slate-900/25 p-3 sm:items-end sm:justify-end" role="dialog" aria-modal="true" aria-label="Asistente Pan y Esperanza">
          <section className="flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-[28rem]">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-brand-50 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Asistente Pan y Esperanza</p>
                <h2 className="mt-1 text-xl font-bold text-ink">Como puedo ayudarte?</h2>
                <p className="mt-1 text-sm text-slate-600">Respuestas breves usando solo los datos autorizados de tu portal.</p>
              </div>
              <button type="button" onClick={() => onOpenChange(false)} className="focus-ring rounded-md p-2 text-slate-500 hover:bg-white hover:text-ink" aria-label="Cerrar asistente">
                <X size={20} />
              </button>
            </header>

            <div className="border-b border-slate-100 px-4 py-3">
              <div className="grid gap-2">
                {ASSISTANT_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.intent}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    disabled={busy}
                    className="focus-ring min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <article key={message.id} className={`rounded-md px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'ml-8 bg-brand-600 text-white' : 'mr-8 bg-slate-50 text-slate-700'}`}>
                  <p>{message.text}</p>
                  {message.action?.type === 'open_tab' && (
                    <button type="button" onClick={() => handleAssistantAction(message.action)} className="focus-ring mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-bold text-brand-700">
                      Abrir seccion <ArrowRight size={15} />
                    </button>
                  )}
                  {message.action?.type === 'contact' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a className="focus-ring rounded-md bg-white px-3 py-2 text-sm font-bold text-brand-700" href={`mailto:${message.action.email}`}>Enviar correo</a>
                      <a className="focus-ring rounded-md bg-white px-3 py-2 text-sm font-bold text-brand-700" href={`https://wa.me/${normalizePhoneForWhatsApp(message.action.phone)}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
                    </div>
                  )}
                  {message.requiresConfirmation && message.draftRequest && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => setPendingRequest(message.draftRequest)} className="focus-ring rounded-md bg-white px-3 py-2 text-sm font-bold text-brand-700">
                        Revisar solicitud
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {busy && <p className="text-sm font-semibold text-slate-500">El asistente esta respondiendo...</p>}
            </div>

            {pendingRequest && (
              <div className="border-t border-brand-100 bg-brand-50 px-4 py-3">
                <p className="text-sm font-bold text-ink">Confirmar solicitud</p>
                <p className="mt-1 text-sm text-slate-600">{pendingRequest.message}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={confirmPendingRequest} disabled={busy} className="focus-ring min-h-11 rounded-md bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">
                    Confirmar envio
                  </button>
                  <button type="button" onClick={cancelPendingRequest} disabled={busy} className="focus-ring min-h-11 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-wait disabled:opacity-60">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-white p-4">
              <label className="sr-only" htmlFor="beneficiary-assistant-input">Escribe tu consulta</label>
              <div className="flex gap-2">
                <textarea
                  id="beneficiary-assistant-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={2}
                  className={`${inputClass} min-h-[3.25rem] resize-none rounded-xl text-base`}
                  placeholder="Escribe tu consulta..."
                  maxLength={1200}
                />
                <button type="submit" disabled={busy || !input.trim()} className="focus-ring inline-flex min-h-[3.25rem] w-14 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Enviar consulta">
                  <Send size={19} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function PortalHome({ overview, nextDelivery, pendingDocs, unreadNotices, setActiveTab, auth }) {
  const beneficiary = overview.beneficiary || {};
  const orderedNotices = sortNotices(overview.notices || []);
  const recentNotices = orderedNotices.slice(0, 3);
  const documents = overview.documents || [];
  const receivedDocs = documents.filter((document) => getDocumentStatusMeta(document).key === 'received');
  const pendingOnlyDocs = documents.filter((document) => getDocumentStatusMeta(document).key === 'pending');
  const requiredDocs = documents.filter((document) => getDocumentStatusMeta(document).key === 'required');

  return (
    <div className="beneficiary-portal-welcome mx-auto max-w-5xl space-y-4 sm:space-y-5">
      <section className="overflow-hidden rounded-md border border-brand-700 bg-brand-700 text-white shadow-panel">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Portal del Beneficiario</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Hola, {firstName(beneficiary.full_name)}.</h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-brand-50">
              Todo lo importante de tu seguimiento aparece aqui, de forma clara y sencilla.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-72">
            <HomeSignal label="Avisos nuevos" value={unreadNotices.length} />
            <HomeSignal label="Documentos" value={pendingDocs.length ? 'Pendiente' : 'Al dia'} />
          </div>
        </div>
        <div className="border-t border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-brand-50 sm:px-6">
          Expediente {beneficiary.code || 'activo'} - Acceso protegido con {auth?.requiresOtpForSensitiveActions ? 'OTP' : 'PIN seguro'}
        </div>
      </section>

      <NextDeliveryCard delivery={nextDelivery} onOpen={() => setActiveTab('entrega')} />

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeSummary notices={recentNotices} unreadCount={unreadNotices.length} onOpen={() => setActiveTab('avisos')} />
        <DocumentStatusCard
          pendingDocs={pendingDocs}
          pendingOnlyDocs={pendingOnlyDocs}
          receivedDocs={receivedDocs}
          requiredDocs={requiredDocs}
          totalDocs={documents.length}
          onOpen={() => setActiveTab('documentos')}
        />
      </div>

      <SolidaritySupportCard />
      <style>{`
        @keyframes beneficiaryPortalWelcome {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .beneficiary-portal-welcome {
          animation: beneficiaryPortalWelcome 460ms ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .beneficiary-portal-welcome {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function HomeSignal({ label, value }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/10 p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-brand-100">{label}</p>
    </div>
  );
}

function NextDeliveryCard({ delivery, onOpen }) {
  if (!delivery) {
    return (
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="rounded-md bg-brand-50 p-3 text-brand-700"><CalendarDays size={24} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Proxima entrega</p>
              <h3 className="mt-2 text-2xl font-bold text-ink">Aun no hay una entrega programada.</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Cuando el equipo registre una nueva entrega, aparecera aqui con la fecha, hora, lugar y estado.
              </p>
            </div>
          </div>
          <button type="button" onClick={onOpen} className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700">
            Ver detalles <ArrowRight size={16} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-brand-200 bg-white shadow-panel">
      <div className="bg-brand-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Proxima entrega</p>
            <h3 className="mt-2 text-3xl font-bold tracking-tight text-ink">{delivery.help_type || 'Ayuda alimentaria'}</h3>
            <p className="mt-2 text-sm text-slate-600">Tu siguiente cita registrada por Pan y Esperanza.</p>
          </div>
          <span className="rounded-md bg-white px-3 py-2 text-xs font-bold text-brand-700 shadow-sm">{delivery.status || 'Pendiente'}</span>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <DeliveryDetail icon={CalendarDays} label="Fecha" value={formatDate(delivery.delivered_at || delivery.created_at)} />
          <DeliveryDetail icon={Clock3} label="Hora" value={formatDeliveryTime(delivery.delivered_time)} />
          <DeliveryDetail icon={MapPin} label="Lugar" value={getDeliveryLocation(delivery)} />
          <DeliveryDetail icon={PackageCheck} label="Tipo de ayuda" value={delivery.help_type || 'Ayuda'} />
          <DeliveryDetail icon={CheckCircle2} label="Estado" value={delivery.status || 'Pendiente'} />
        </dl>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">Si hay algun cambio, el equipo actualizara esta informacion.</p>
          <button type="button" onClick={onOpen} className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700">
            Ver detalles <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function DeliveryDetail({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md bg-white p-3 shadow-sm">
      <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Icon size={14} /> {label}
      </dt>
      <dd className="mt-2 font-semibold text-ink">{value || 'Pendiente'}</dd>
    </div>
  );
}

function DocumentStatusCard({ pendingDocs, pendingOnlyDocs, receivedDocs, requiredDocs, totalDocs, onOpen }) {
  const state = pendingDocs.length ? 'Documentacion pendiente' : 'Documentacion al dia';
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Documentacion</p>
          <h3 className="mt-2 text-xl font-bold text-ink">{state}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Consulta solo el estado documental. Los documentos internos no se descargan desde aqui.
          </p>
        </div>
        <span className="rounded-md bg-slate-50 p-2 text-brand-700"><FileText size={20} /></span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DocumentStatusCount tone="received" label="Recibido" value={receivedDocs.length} />
        <DocumentStatusCount tone="pending" label="Pendiente" value={pendingOnlyDocs.length} />
        <DocumentStatusCount tone="required" label="Requerido" value={requiredDocs.length} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">Total: {totalDocs}</p>
        <button type="button" onClick={onOpen} className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-brand-700">
        Ver estado documental <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function DocumentStatusCount({ tone, label, value }) {
  const meta = DOCUMENT_STATUS_TONES[tone] || DOCUMENT_STATUS_TONES.pending;
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function NoticeSummary({ notices, unreadCount, onOpen }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Avisos</p>
          <h3 className="mt-2 text-xl font-bold text-ink">
            {unreadCount ? `${unreadCount} aviso${unreadCount === 1 ? '' : 's'} nuevo${unreadCount === 1 ? '' : 's'}` : 'Sin avisos nuevos'}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Comunicaciones importantes publicadas por el equipo.
          </p>
        </div>
        <span className="rounded-md bg-slate-50 p-2 text-brand-700"><Bell size={20} /></span>
      </div>
      {!notices.length ? (
        <div className="mt-4 rounded-md bg-slate-50 p-4">
          <h4 className="font-bold text-ink">No tienes avisos pendientes.</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Cuando el equipo publique un aviso importante, aparecera aqui.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {notices.map((notice) => {
            const unread = normalize(notice.status) !== 'read';
            return (
              <article key={notice.id} className={`rounded-md border p-4 ${unread ? 'border-brand-100 bg-brand-50/60' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-bold text-ink">{notice.title || 'Aviso'}</h4>
                  {unread && <span className="rounded-md bg-brand-600 px-2 py-1 text-xs font-bold text-white">Nuevo</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{notice.message || 'Aviso publicado por Pan y Esperanza.'}</p>
                <p className="mt-3 text-xs font-semibold text-slate-500">{formatDate(notice.created_at)}</p>
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onOpen} className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-brand-700">
          Ver avisos <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

function SummaryTile({ label, value, detail }) {
  return (
    <article className="rounded-md border border-slate-100 bg-slate-50 p-4">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <h3 className="mt-1 text-sm font-bold text-slate-700">{label}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </article>
  );
}

function SolidaritySupportCard() {
  const collaborators = ['Empresas colaboradoras', 'Comercios locales', 'Personas solidarias'];
  return (
    <section className="rounded-md border border-slate-200 bg-white/80 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UsersRound size={16} className="text-brand-700" />
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Apoyo solidario</p>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Gracias a empresas y personas solidarias podemos mantener este acompanamiento.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {collaborators.map((item) => (
              <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">{item}</span>
            ))}
          </div>
        </div>
        <a href="/acceder" className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100">
          Quiero colaborar <ArrowRight size={16} />
        </a>
      </div>
    </section>
  );
}

function firstName(name = '') {
  return String(name || 'bienvenido').trim().split(/\s+/)[0] || 'bienvenido';
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

class PortalSectionBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`[PortalBeneficiario] Error al renderizar ${this.props.sectionName || 'seccion'}`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Panel title={this.props.sectionName || 'Seccion'} icon={AlertTriangle}>
          <StatusBlock
            type="error"
            title="No hemos podido cargar esta informacion."
            text={this.props.fallbackMessage || 'Intentalo de nuevo mas tarde.'}
          />
          <Button type="button" variant="secondary" className="mt-4" onClick={this.props.onRecover}>
            Volver al Inicio
          </Button>
        </Panel>
      );
    }

    return this.props.children;
  }
}

function DeliveriesSection({ deliveries, service, session, onRefresh, setError, setSuccess }) {
  const safeDeliveries = Array.isArray(deliveries) ? deliveries.filter(Boolean) : [];

  return (
    <Panel title="Proxima entrega" icon={CalendarDays}>
      {!safeDeliveries.length ? <EmptyState title="No hay entregas programadas." text="Cuando exista una entrega confirmada aparecera aqui." /> : (
        <div className="grid gap-3">
          {safeDeliveries.map((delivery, index) => (
            <article key={delivery.id || `delivery-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-bold text-ink">{safeDisplayValue(delivery.help_type, 'Entrega programada')}</h3>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">{safeDisplayValue(delivery.status, 'Pendiente')}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <DataRow label="Fecha" value={safeFormatDate(delivery.delivered_at || delivery.created_at)} />
                <DataRow label="Hora" value={formatDeliveryTime(delivery.delivered_time)} />
                <DataRow label="Lugar" value={getDeliveryLocation(delivery)} />
                <DataRow label="Tipo de ayuda" value={safeDisplayValue(delivery.help_type, 'Ayuda')} />
                <DataRow label="Estado" value={safeDisplayValue(delivery.status, 'Pendiente')} />
              </dl>
              <DeliveryAttendanceControls
                delivery={delivery}
                service={service}
                session={session}
                onRefresh={onRefresh}
                setError={setError}
                setSuccess={setSuccess}
              />
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DeliveryAttendanceControls({ delivery, service, session, onRefresh, setError, setSuccess }) {
  const deliveryRecord = delivery || {};
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const attendanceStatus = safeAttendanceStatus(deliveryRecord.attendance_status);
  const statusMeta = getAttendanceStatusMeta(attendanceStatus);

  async function submitAttendance(status, nextReason = '') {
    if (!service?.confirmDeliveryAttendance || !session?.token) {
      setError?.('No se pudo confirmar la asistencia. Vuelve a acceder al portal.');
      return;
    }
    if (!deliveryRecord.id) {
      setError?.('No se pudo identificar la entrega. Intentalo de nuevo mas tarde.');
      return;
    }
    setError?.('');
    setSuccess?.('');
    setBusy(status);
    try {
      const result = await withTimeout(service.confirmDeliveryAttendance(session, {
        deliveryId: deliveryRecord.id,
        attendance_status: status,
        reason: nextReason
      }));
      if (status === 'confirmed') setSuccess?.('Gracias. Hemos registrado tu asistencia.');
      if (status === 'unavailable') setSuccess?.('Hemos registrado que no podras asistir y avisaremos al equipo.');
      if (status === 'needs_contact') setSuccess?.('Hemos creado una solicitud para que el equipo contacte contigo.');
      setReasonOpen(false);
      setReason('');
      await onRefresh?.();
      return result;
    } catch (attendanceError) {
      console.error('[PortalBeneficiario] Error al confirmar asistencia', attendanceError);
      setError?.(attendanceError.message || 'No se pudo confirmar la asistencia.');
      return null;
    } finally {
      setBusy('');
    }
  }

  function submitUnavailable() {
    if (!reason) {
      setError?.('Selecciona un motivo para indicar que no podras asistir.');
      return;
    }
    submitAttendance('unavailable', reason);
  }

  return (
    <div className="mt-4 rounded-md border border-brand-100 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-ink">Podras asistir?</p>
          <p className="mt-1 text-sm text-slate-600">Tu respuesta ayuda al equipo a organizar la entrega.</p>
        </div>
        <span className={`inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-bold ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      {attendanceStatus === 'confirmed' && (
        <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Gracias. Hemos registrado tu asistencia.</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button type="button" disabled={Boolean(busy)} onClick={() => submitAttendance('confirmed')}>
          {busy === 'confirmed' ? 'Guardando...' : 'Si, asistire'}
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => setReasonOpen((current) => !current)}>
          No podre asistir
        </Button>
        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => submitAttendance('needs_contact')}>
          {busy === 'needs_contact' ? 'Enviando...' : 'Necesito ayuda'}
        </Button>
      </div>

      {reasonOpen && (
        <div className="mt-4 rounded-md bg-slate-50 p-4">
          <FormField label="Motivo" required>
            <select className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="">Selecciona un motivo</option>
              <option value="Trabajo">Trabajo</option>
              <option value="Enfermedad">Enfermedad</option>
              <option value="Transporte">Transporte</option>
              <option value="Otro">Otro</option>
            </select>
          </FormField>
          <Button type="button" className="mt-3" disabled={Boolean(busy)} onClick={submitUnavailable}>
            {busy === 'unavailable' ? 'Guardando...' : 'Confirmar que no podre asistir'}
          </Button>
        </div>
      )}

      {deliveryRecord.attendance_confirmed_at && (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          Actualizado el {safeFormatDateTime(deliveryRecord.attendance_confirmed_at)} desde {deliveryRecord.attendance_source === 'portal' ? 'Portal del Beneficiario' : safeDisplayValue(deliveryRecord.attendance_source, 'sistema')}.
        </p>
      )}
    </div>
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
  const orderedNotices = sortNotices(notices);

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
      {!orderedNotices.length ? <EmptyState title="Sin avisos." text="Los avisos importantes apareceran en esta seccion." /> : (
        <div className="grid gap-3">
          {orderedNotices.map((notice) => {
            const unread = normalize(notice.status) !== 'read';
            return (
            <article key={notice.id} className={`rounded-md border p-4 ${unread ? 'border-brand-100 bg-brand-50/60' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-ink">{notice.title}</h3>
                    {unread && <span className="rounded-md bg-brand-600 px-2 py-1 text-xs font-bold text-white">Nuevo</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{notice.message}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(notice.created_at)}</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-bold ${unread ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {unread ? 'Pendiente' : 'Leido'}
                </span>
              </div>
              {notice.source === 'portal' && unread && <Button variant="secondary" className="mt-3" onClick={() => markRead(notice)}>Marcar como leido</Button>}
            </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function DocumentsSection({ documents }) {
  const pendingDocuments = documents.filter(isPendingDocument);
  const receivedDocuments = documents.filter((document) => getDocumentStatusMeta(document).key === 'received');
  const pendingOnlyDocuments = documents.filter((document) => getDocumentStatusMeta(document).key === 'pending');
  const requiredDocuments = documents.filter((document) => getDocumentStatusMeta(document).key === 'required');

  return (
    <Panel title="Documentos" icon={FileText}>
      {!documents.length ? <EmptyState title="No hay documentos registrados." text="La documentacion solicitada aparecera aqui." /> : (
        <div className="space-y-4">
          <div className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <h3 className="font-bold text-ink">Estado documental</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Aqui se muestra unicamente si la documentacion esta recibida o pendiente. Los documentos internos no estan disponibles para descarga desde el portal.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <DocumentStatusCount tone="received" label="Recibido" value={receivedDocuments.length} />
            <DocumentStatusCount tone="pending" label="Pendiente" value={pendingOnlyDocuments.length} />
            <DocumentStatusCount tone="required" label="Requerido" value={requiredDocuments.length} />
          </div>
          <DataRow label="Estado documental" value={pendingDocuments.length ? 'Pendiente' : 'Al dia'} />
          <div className="grid gap-3 md:grid-cols-2">
            {documents.map((document) => {
              const statusMeta = getDocumentStatusMeta(document);
              return (
                <article key={document.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-ink">{document.document_type || 'Documento'}</h3>
                      <p className="mt-1 text-sm text-slate-600">Estado documental: {statusMeta.label}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(document.uploaded_at || document.created_at)}</p>
                    </div>
                    <DocumentStatusBadge status={statusMeta.key} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function DocumentStatusBadge({ status }) {
  const meta = DOCUMENT_STATUS_TONES[status] || DOCUMENT_STATUS_TONES.pending;
  return (
    <span className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-bold ${meta.badge}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
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
      <dd className="mt-1 font-semibold text-ink">{safeDisplayValue(value, 'No indicado')}</dd>
    </div>
  );
}

function getNextDelivery(deliveries = []) {
  const today = todayISO();
  return [...deliveries]
    .sort(sortDeliveryAsc)
    .find((delivery) => String(delivery.delivered_at || delivery.created_at || '') >= today) || deliveries[0] || null;
}

function sortDeliveryAsc(a = {}, b = {}) {
  const dateCompare = String(a.delivered_at || a.created_at || '').localeCompare(String(b.delivered_at || b.created_at || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.delivered_time || '').localeCompare(String(b.delivered_time || ''));
}

function formatDeliveryDateTime(delivery = {}) {
  const date = safeFormatDate(delivery.delivered_at || delivery.created_at);
  const time = formatDeliveryTime(delivery.delivered_time);
  return time === 'Pendiente' ? date : `${date} ${time}`;
}

function formatDeliveryTime(value) {
  const text = safeString(value).trim();
  if (!text) return 'Pendiente';
  return text.slice(0, 5);
}

function getDeliveryLocation(delivery = {}) {
  return safeDisplayValue(delivery.location || delivery.delivery_location || delivery.place || delivery.address, 'Pendiente de confirmar');
}

function getAttendanceStatusMeta(status) {
  if (status === 'confirmed') return { label: 'Confirmada', className: 'bg-emerald-50 text-emerald-800' };
  if (status === 'unavailable') return { label: 'No asistira', className: 'bg-amber-50 text-amber-800' };
  if (status === 'needs_contact') return { label: 'Necesita contactar', className: 'bg-red-50 text-red-800' };
  return { label: 'Pendiente', className: 'bg-slate-100 text-slate-700' };
}

function safeAttendanceStatus(value) {
  const status = safeString(value);
  return ['pending', 'confirmed', 'unavailable', 'needs_contact'].includes(status) ? status : 'pending';
}

function safeFormatDate(value) {
  const text = safeString(value);
  if (!text) return '-';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    console.error('[PortalBeneficiario] Fecha de entrega no valida', { value: text });
    return '-';
  }
  try {
    return formatDate(text);
  } catch (error) {
    console.error('[PortalBeneficiario] Error al formatear fecha de entrega', error);
    return '-';
  }
}

function safeFormatDateTime(value) {
  const text = safeString(value);
  if (!text) return '-';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    console.error('[PortalBeneficiario] Fecha y hora de asistencia no valida', { value: text });
    return '-';
  }
  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch (error) {
    console.error('[PortalBeneficiario] Error al formatear fecha y hora de asistencia', error);
    return '-';
  }
}

function safeDisplayValue(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return safeFormatDateTime(value.toISOString());
  console.error('[PortalBeneficiario] Valor no renderizable en Proxima entrega', { value });
  return fallback;
}

function safeString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function normalizePhoneForWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '34611889167';
  return digits.startsWith('34') ? digits : `34${digits}`;
}

function sortNotices(notices = []) {
  return [...notices].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function isPendingDocument(document) {
  return getDocumentStatusMeta(document).key !== 'received';
}

function getDocumentStatusMeta(document) {
  const status = normalize(document.portal_status || document.status);
  if (status === 'received' || status.includes('recib')) return { key: 'received', ...DOCUMENT_STATUS_TONES.received };
  if (status === 'required' || status.includes('requer') || status.includes('solicit') || status.includes('caduc') || status.includes('expired')) {
    return { key: 'required', ...DOCUMENT_STATUS_TONES.required };
  }
  if (status === 'pending' || status.includes('pendiente')) return { key: 'pending', ...DOCUMENT_STATUS_TONES.pending };
  if (document.file_data_url) return { key: 'received', ...DOCUMENT_STATUS_TONES.received };
  return { key: 'required', ...DOCUMENT_STATUS_TONES.required };
}

function withTimeout(promise, timeoutMs = PORTAL_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => reject(new Error('La conexion con el portal ha tardado demasiado. Intentalo de nuevo.')), timeoutMs);
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => globalThis.clearTimeout(timeoutId));
  });
}

function readStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
