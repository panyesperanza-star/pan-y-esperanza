import { AlertTriangle, Database } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Layout } from './components/Layout';
import { useAppData } from './hooks/useAppData';
import { canAccess, clearStoredUser, getFirstAccessibleModule, getStoredUser, isSystemSuperadmin, refreshCurrentUser, signIn, signOut } from './lib/auth';
import { getModuleByPath, getModulePath } from './lib/constants';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { Accounting } from './pages/Accounting';
import { AgendaOperativa } from './pages/AgendaOperativa';
import { Beneficiaries } from './pages/Beneficiaries';
import { BeneficiaryPortal } from './pages/BeneficiaryPortal';
import { Backup } from './pages/Backup';
import { CollaboratorPortal } from './pages/CollaboratorPortal';
import { Communications } from './pages/Communications';
import { Dashboard } from './pages/Dashboard';
import { DebugAdmin } from './pages/DebugAdmin';
import { Deliveries } from './pages/Deliveries';
import { Donations } from './pages/Donations';
import { DonorPortal } from './pages/DonorPortal';
import { Families } from './pages/Families';
import { Inventory } from './pages/Inventory';
import { Login } from './pages/Login';
import { Notifications } from './pages/Notifications';
import { ProviderPanel } from './pages/ProviderPanel';
import { Receipts } from './pages/Receipts';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Volunteers } from './pages/Volunteers';
import { createPortalApiActions } from './services/portalAuth/PortalApiService';

export default function App() {
  const hasResetToken = Boolean(new URLSearchParams(window.location.search).get('reset_token'));
  const [pathname, setPathname] = useState(window.location.pathname);
  const isDebugAdminRoute = pathname === '/debug/admin';
  const isBeneficiaryPortalRoute = normalizePath(pathname) === '/portal-beneficiario';
  const isCollaboratorPortalRoute = normalizePath(pathname) === '/portal-colaboradores';
  const isDonorPortalRoute = normalizePath(pathname) === '/portal-donaciones';
  const isPortalRoute = isBeneficiaryPortalRoute || isCollaboratorPortalRoute || isDonorPortalRoute;
  const [active, setActive] = useState(() => getModuleByPath(window.location.pathname));
  const [navigationTarget, setNavigationTarget] = useState(() => readNavigationTargetFromLocation());
  const [currentUser, setCurrentUser] = useState(() => hasResetToken ? null : getStoredUser());
  const [authReady, setAuthReady] = useState(() => !hasSupabaseConfig || hasResetToken || !getStoredUser());
  const portalActions = useMemo(() => createPortalApiActions(), []);
  const { data, loading, error, actions } = useAppData(!isPortalRoute && (Boolean(currentUser) || !hasSupabaseConfig), currentUser);

  useEffect(() => {
    const handleHistoryChange = () => {
      setPathname(window.location.pathname);
      setNavigationTarget(readNavigationTargetFromLocation());
    };
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function validateStoredSession() {
      if (!hasSupabaseConfig || !supabase || !currentUser || hasResetToken) {
        if (!cancelled) setAuthReady(true);
        return;
      }
      setAuthReady(false);
      try {
        const freshUser = await refreshCurrentUser();
        if (!cancelled) setCurrentUser(freshUser);
      } catch (sessionError) {
        console.warn('[auth] No se pudo refrescar el perfil desde Supabase', { error: sessionError?.message });
        await signOut();
        clearStoredUser();
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }
    validateStoredSession();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.email, hasResetToken]);

  const firstAccessibleModule = getFirstAccessibleModule(currentUser);

  useEffect(() => {
    if (!currentUser) return;
    if (isBeneficiaryPortalRoute) return;
    if (isCollaboratorPortalRoute) return;
    if (isDonorPortalRoute) return;
    const normalizedPathname = pathname !== '/' ? pathname.replace(/\/$/, '') : pathname;
    if (normalizedPathname === '/treasury' && canAccess(currentUser, 'accounting')) {
      const nextPath = `/accounting${window.location.search || ''}`;
      window.history.replaceState({}, '', nextPath);
      setPathname('/accounting');
      setNavigationTarget({ ...readNavigationTargetFromLocation(), key: Date.now() });
      setActive('accounting');
      return;
    }
    const requestedModule = isDebugAdminRoute ? 'users' : getModuleByPath(pathname);
    if (requestedModule && canAccess(currentUser, requestedModule)) {
      setActive(requestedModule);
      return;
    }
    if (!firstAccessibleModule) {
      setActive(null);
      return;
    }
    const nextPath = getModulePath(firstAccessibleModule);
    window.history.replaceState({}, '', nextPath);
    setPathname(nextPath);
    setNavigationTarget({ moduleId: firstAccessibleModule, key: Date.now() });
    setActive(firstAccessibleModule);
  }, [currentUser, firstAccessibleModule, isDebugAdminRoute, isBeneficiaryPortalRoute, isCollaboratorPortalRoute, isDonorPortalRoute, pathname]);

  function navigateTo(destination) {
    const target = normalizeNavigationTarget(destination);
    const moduleId = target.moduleId;
    if (!canAccess(currentUser, moduleId)) return;
    const nextPath = buildNavigationPath(target);
    window.history.pushState({}, '', nextPath);
    setPathname(window.location.pathname);
    setNavigationTarget({ ...target, key: Date.now() });
    setActive(moduleId);
  }

  async function logout() {
    await signOut();
    window.history.replaceState({}, '', '/acceso');
    setPathname('/acceso');
    setActive(null);
    setCurrentUser(null);
  }

  const sorted = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      beneficiaries: [...(data.beneficiaries || [])].sort(compareBeneficiaryByCode),
      deliveries: [...data.deliveries].sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at))),
      inventory_movements: [...data.inventory_movements].sort((a, b) => String(b.moved_at).localeCompare(String(a.moved_at))),
      accounting_events: [...(data.accounting_events || [])].sort((a, b) => String(b.occurred_at || b.created_at).localeCompare(String(a.occurred_at || a.created_at))),
      cash_bank_movements: [...(data.cash_bank_movements || [])].sort((a, b) => String(b.movement_at || b.created_at).localeCompare(String(a.movement_at || a.created_at))),
      accounting_documents: [...(data.accounting_documents || [])].sort((a, b) => String(b.document_at || b.created_at).localeCompare(String(a.document_at || a.created_at))),
      loan_records: [...(data.loan_records || [])].sort((a, b) => String(b.loan_at || b.created_at).localeCompare(String(a.loan_at || a.created_at))),
      debt_records: [...(data.debt_records || [])].sort((a, b) => String(b.debt_at || b.created_at).localeCompare(String(a.debt_at || a.created_at))),
      social_value_events: [...(data.social_value_events || [])].sort((a, b) => String(b.social_value_at || b.created_at).localeCompare(String(a.social_value_at || a.created_at))),
      deletion_requests: [...(data.deletion_requests || [])].sort((a, b) => String(b.requested_at || b.created_at).localeCompare(String(a.requested_at || a.created_at))),
      notificaciones: [...(data.notificaciones || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
      agenda_operativa: [...(data.agenda_operativa || [])].sort((a, b) => String(a.event_at || a.created_at).localeCompare(String(b.event_at || b.created_at))),
      campanas: [...(data.campanas || [])].sort((a, b) => String(a.start_date || a.created_at).localeCompare(String(b.start_date || b.created_at))),
      treasury_incomes: [...(data.treasury_incomes || [])].sort((a, b) => String(b.income_at).localeCompare(String(a.income_at))),
      treasury_expenses: [...(data.treasury_expenses || [])].sort((a, b) => String(b.expense_at).localeCompare(String(a.expense_at))),
      treasury_loans: [...(data.treasury_loans || [])].sort((a, b) => String(b.loan_at).localeCompare(String(a.loan_at)))
    };
  }, [data]);

  if (hasResetToken) {
    return <Login onAccess={async (credentials) => setCurrentUser(await signIn(credentials, []))} />;
  }

  if (!authReady) return <div className="flex min-h-screen items-center justify-center">Comprobando permisos...</div>;

  if (isBeneficiaryPortalRoute) {
    return <BeneficiaryPortal data={null} actions={portalActions} />;
  }

  if (isCollaboratorPortalRoute) {
    return <CollaboratorPortal data={null} actions={portalActions} />;
  }

  if (isDonorPortalRoute) {
    return <DonorPortal data={null} actions={portalActions} />;
  }

  if (!currentUser && hasSupabaseConfig) {
    return <Login onAccess={async (credentials) => setCurrentUser(await signIn(credentials, []))} />;
  }

  if (loading || !sorted) return <div className="flex min-h-screen items-center justify-center">Cargando Pan y Esperanza...</div>;

  if (!currentUser) {
    return <Login onAccess={async (credentials) => {
      const user = await signIn(credentials, sorted.app_users || []);
      setCurrentUser(user);
      if (user?.id) await actions.updateUserLastAccess(user.id);
    }} />;
  }

  if (!firstAccessibleModule) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7faf6] px-4">
        <section className="max-w-lg rounded-md border border-slate-200 bg-white p-8 text-center shadow-panel">
          <h1 className="text-2xl font-bold text-ink">Sin modulos asignados</h1>
          <p className="mt-3 text-slate-600">Tu cuenta esta activa, pero no tiene permisos de visualizacion. Solicita acceso a un administrador.</p>
          <button className="focus-ring mt-6 rounded-md bg-brand-600 px-4 py-2 font-semibold text-white" onClick={logout}>Cerrar sesiÃ³n</button>
        </section>
      </main>
    );
  }

  const pages = {
    dashboard: <Dashboard data={sorted} actions={actions} currentUser={currentUser} onNavigate={navigateTo} />,
    notifications: <Notifications data={sorted} actions={actions} currentUser={currentUser} />,
    agenda: <AgendaOperativa data={sorted} actions={actions} currentUser={currentUser} />,
    settings: <Settings key="settings" data={sorted} actions={actions} currentUser={currentUser} initialTab="entity" />,
    beneficiaries: <Beneficiaries data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} onNavigate={navigateTo} />,
    communications: <Communications data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} onNavigate={navigateTo} />,
    families: <Families data={sorted} actions={actions} currentUser={currentUser} onNavigate={navigateTo} />,
    deliveries: <Deliveries data={sorted} actions={actions} currentUser={currentUser} />,
    receipts: <Receipts data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    inventory: <Inventory data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    donations: <Donations data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} onNavigate={navigateTo} />,
    accounting: <Accounting data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    volunteers: <Volunteers data={sorted} actions={actions} currentUser={currentUser} />,
    reports: <Reports data={sorted} actions={actions} />,
    backup: <Backup data={sorted} actions={actions} currentUser={currentUser} />,
    provider: <ProviderPanel data={sorted} actions={actions} currentUser={currentUser} />,
    users: <Settings key="users" data={sorted} actions={actions} currentUser={currentUser} initialTab="users" />
  };

  const selectedPage = active && canAccess(currentUser, active) ? active : firstAccessibleModule;
  const pageContent = isDebugAdminRoute && currentUser?.role === 'Superadministrador' ? <DebugAdmin currentUser={currentUser} /> : pages[selectedPage];

  const showDemoControls = import.meta.env.DEV && !isSystemSuperadmin(currentUser);
  const notificationCount = (sorted.notificaciones || []).filter(isUnreadNotification).length;

  return (
    <Layout active={selectedPage} setActive={navigateTo} onReset={actions.resetDemo} currentUser={currentUser} onLogout={logout} showReset={showDemoControls} notificationCount={notificationCount}>
      {!hasSupabaseConfig && <div className="mb-5 flex gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"><Database size={18} /> Modo demo local activo. Configura Supabase para usar PostgreSQL.</div>}
      {error && <div className="mb-5 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={18} /> {error}</div>}
      {pageContent}
    </Layout>
  );
}

function normalizePath(value) {
  const path = value || '/';
  return path !== '/' ? path.replace(/\/$/, '') : path;
}

function normalizeNavigationTarget(destination) {
  if (typeof destination === 'string') return { moduleId: destination };
  return destination && typeof destination === 'object' ? destination : { moduleId: 'dashboard' };
}

function buildNavigationPath(target) {
  const params = new URLSearchParams();
  if (target.filter) params.set('filter', target.filter);
  if (target.profileId) params.set('profile', target.profileId);
  if (target.familyId) params.set('family', target.familyId);
  if (target.itemId) params.set('item', target.itemId);
  if (target.operationType) params.set('operation', target.operationType);
  const query = params.toString();
  return `${getModulePath(target.moduleId)}${query ? `?${query}` : ''}`;
}

function readNavigationTargetFromLocation() {
  const moduleId = getModuleByPath(window.location.pathname);
  if (!moduleId) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    moduleId,
    filter: params.get('filter') || '',
    profileId: params.get('profile') || '',
    familyId: params.get('family') || '',
    itemId: params.get('item') || '',
    operationType: params.get('operation') || '',
    key: Date.now()
  };
}

function compareBeneficiaryByCode(a, b) {
  const numberA = beneficiaryCodeNumber(a?.code);
  const numberB = beneficiaryCodeNumber(b?.code);
  if (numberA !== numberB) return numberA - numberB;
  return String(a?.code || '').localeCompare(String(b?.code || ''), 'es', { numeric: true });
}

function beneficiaryCodeNumber(value) {
  const match = String(value || '').match(/PYE-(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isUnreadNotification(notification) {
  const state = String(notification?.estado || '').toLowerCase();
  return notification?.leida !== true && state !== 'leida' && !notification?.read_at;
}

