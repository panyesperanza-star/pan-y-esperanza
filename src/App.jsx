import { AlertTriangle, Database } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Layout } from './components/Layout';
import { useAppData } from './hooks/useAppData';
import { canAccess, clearStoredUser, getFirstAccessibleModule, getStoredUser, isSystemSuperadmin, refreshCurrentUser, signIn, signOut } from './lib/auth';
import { getModuleByPath, getModulePath } from './lib/constants';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { Accounting } from './pages/Accounting';
import { Beneficiaries } from './pages/Beneficiaries';
import { Backup } from './pages/Backup';
import { Communications } from './pages/Communications';
import { Dashboard } from './pages/Dashboard';
import { DebugAdmin } from './pages/DebugAdmin';
import { Deliveries } from './pages/Deliveries';
import { Donations } from './pages/Donations';
import { Families } from './pages/Families';
import { Inventory } from './pages/Inventory';
import { Login } from './pages/Login';
import { ProviderPanel } from './pages/ProviderPanel';
import { Receipts } from './pages/Receipts';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Volunteers } from './pages/Volunteers';

export default function App() {
  const hasResetToken = Boolean(new URLSearchParams(window.location.search).get('reset_token'));
  const [pathname, setPathname] = useState(window.location.pathname);
  const isDebugAdminRoute = pathname === '/debug/admin';
  const [active, setActive] = useState(() => getModuleByPath(window.location.pathname));
  const [navigationTarget, setNavigationTarget] = useState(() => readNavigationTargetFromLocation());
  const [currentUser, setCurrentUser] = useState(() => hasResetToken ? null : getStoredUser());
  const [authReady, setAuthReady] = useState(() => !hasSupabaseConfig || hasResetToken || !getStoredUser());
  const { data, loading, error, actions } = useAppData(Boolean(currentUser) || !hasSupabaseConfig, currentUser);

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
  }, [currentUser, firstAccessibleModule, isDebugAdminRoute, pathname]);

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
    window.history.replaceState({}, '', '/');
    setPathname('/');
    setActive(null);
    setCurrentUser(null);
  }

  const sorted = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      deliveries: [...data.deliveries].sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at))),
      inventory_movements: [...data.inventory_movements].sort((a, b) => String(b.moved_at).localeCompare(String(a.moved_at))),
      accounting_events: [...(data.accounting_events || [])].sort((a, b) => String(b.occurred_at || b.created_at).localeCompare(String(a.occurred_at || a.created_at))),
      cash_bank_movements: [...(data.cash_bank_movements || [])].sort((a, b) => String(b.movement_at || b.created_at).localeCompare(String(a.movement_at || a.created_at))),
      accounting_documents: [...(data.accounting_documents || [])].sort((a, b) => String(b.document_at || b.created_at).localeCompare(String(a.document_at || a.created_at))),
      loan_records: [...(data.loan_records || [])].sort((a, b) => String(b.loan_at || b.created_at).localeCompare(String(a.loan_at || a.created_at))),
      debt_records: [...(data.debt_records || [])].sort((a, b) => String(b.debt_at || b.created_at).localeCompare(String(a.debt_at || a.created_at))),
      social_value_events: [...(data.social_value_events || [])].sort((a, b) => String(b.social_value_at || b.created_at).localeCompare(String(a.social_value_at || a.created_at))),
      deletion_requests: [...(data.deletion_requests || [])].sort((a, b) => String(b.requested_at || b.created_at).localeCompare(String(a.requested_at || a.created_at))),
      treasury_incomes: [...(data.treasury_incomes || [])].sort((a, b) => String(b.income_at).localeCompare(String(a.income_at))),
      treasury_expenses: [...(data.treasury_expenses || [])].sort((a, b) => String(b.expense_at).localeCompare(String(a.expense_at))),
      treasury_loans: [...(data.treasury_loans || [])].sort((a, b) => String(b.loan_at).localeCompare(String(a.loan_at)))
    };
  }, [data]);

  if (hasResetToken) {
    return <Login onAccess={async (credentials) => setCurrentUser(await signIn(credentials, []))} />;
  }

  if (!authReady) return <div className="flex min-h-screen items-center justify-center">Comprobando permisos...</div>;

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
          <button className="focus-ring mt-6 rounded-md bg-brand-600 px-4 py-2 font-semibold text-white" onClick={logout}>Cerrar sesion</button>
        </section>
      </main>
    );
  }

  const pages = {
    dashboard: <Dashboard data={sorted} currentUser={currentUser} onNavigate={navigateTo} />,
    settings: <Settings key="settings" data={sorted} actions={actions} currentUser={currentUser} initialTab="entity" />,
    beneficiaries: <Beneficiaries data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    communications: <Communications data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    families: <Families data={sorted} actions={actions} currentUser={currentUser} onNavigate={navigateTo} />,
    deliveries: <Deliveries data={sorted} actions={actions} currentUser={currentUser} />,
    receipts: <Receipts data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    inventory: <Inventory data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    donations: <Donations data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    accounting: <Accounting data={sorted} actions={actions} currentUser={currentUser} navigationTarget={navigationTarget} />,
    volunteers: <Volunteers data={sorted} actions={actions} />,
    reports: <Reports data={sorted} />,
    backup: <Backup data={sorted} actions={actions} />,
    provider: <ProviderPanel data={sorted} actions={actions} currentUser={currentUser} />,
    users: <Settings key="users" data={sorted} actions={actions} currentUser={currentUser} initialTab="users" />
  };

  const selectedPage = active && canAccess(currentUser, active) ? active : firstAccessibleModule;
  const pageContent = isDebugAdminRoute && currentUser?.role === 'Superadministrador' ? <DebugAdmin currentUser={currentUser} /> : pages[selectedPage];

  return (
    <Layout active={selectedPage} setActive={navigateTo} onReset={actions.resetDemo} currentUser={currentUser} onLogout={logout} showReset={!isSystemSuperadmin(currentUser)}>
      {!hasSupabaseConfig && <div className="mb-5 flex gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"><Database size={18} /> Modo demo local activo. Configura Supabase para usar PostgreSQL.</div>}
      {error && <div className="mb-5 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={18} /> {error}</div>}
      {pageContent}
    </Layout>
  );
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
    key: Date.now()
  };
}
