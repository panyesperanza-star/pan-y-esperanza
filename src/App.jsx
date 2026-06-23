import { AlertTriangle, Database } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Layout } from './components/Layout';
import { useAppData } from './hooks/useAppData';
import { canAccess, clearStoredUser, getStoredUser, signIn, signOut } from './lib/auth';
import { hasSupabaseConfig, supabase } from './lib/supabase';
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
import { Receipts } from './pages/Receipts';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Treasury } from './pages/Treasury';
import { Volunteers } from './pages/Volunteers';

export default function App() {
  const hasResetToken = Boolean(new URLSearchParams(window.location.search).get('reset_token'));
  const isDebugAdminRoute = window.location.pathname === '/debug/admin';
  const [active, setActive] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState(() => hasResetToken ? null : getStoredUser());
  const { data, loading, error, actions } = useAppData(Boolean(currentUser) || !hasSupabaseConfig, currentUser);

  useEffect(() => {
    let cancelled = false;
    async function validateStoredSession() {
      if (!hasSupabaseConfig || !supabase || !currentUser || hasResetToken) return;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const sessionEmail = sessionData?.session?.user?.email?.toLowerCase();
      const storedEmail = currentUser.email?.toLowerCase();
      if (sessionError || !sessionData?.session || !sessionEmail || sessionEmail !== storedEmail) {
        console.warn('[auth] Sesion Supabase ausente o distinta al usuario local', {
          hasSession: Boolean(sessionData?.session),
          sessionEmail,
          storedEmail,
          sessionError: sessionError?.message
        });
        await signOut();
        clearStoredUser();
        if (!cancelled) setCurrentUser(null);
      }
    }
    validateStoredSession();
    return () => { cancelled = true; };
  }, [currentUser, hasResetToken]);

  const sorted = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      deliveries: [...data.deliveries].sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at))),
      inventory_movements: [...data.inventory_movements].sort((a, b) => String(b.moved_at).localeCompare(String(a.moved_at))),
      treasury_incomes: [...(data.treasury_incomes || [])].sort((a, b) => String(b.income_at).localeCompare(String(a.income_at))),
      treasury_expenses: [...(data.treasury_expenses || [])].sort((a, b) => String(b.expense_at).localeCompare(String(a.expense_at))),
      treasury_loans: [...(data.treasury_loans || [])].sort((a, b) => String(b.loan_at).localeCompare(String(a.loan_at)))
    };
  }, [data]);

  if (hasResetToken) {
    return <Login onAccess={async (credentials) => setCurrentUser(await signIn(credentials, []))} />;
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

  const pages = {
    dashboard: <Dashboard data={sorted} />,
    settings: <Settings data={sorted} actions={actions} currentUser={currentUser} />,
    beneficiaries: <Beneficiaries data={sorted} actions={actions} currentUser={currentUser} />,
    communications: <Communications data={sorted} actions={actions} currentUser={currentUser} />,
    families: <Families data={sorted} actions={actions} />,
    deliveries: <Deliveries data={sorted} actions={actions} />,
    receipts: <Receipts data={sorted} actions={actions} currentUser={currentUser} />,
    inventory: <Inventory data={sorted} actions={actions} />,
    donations: <Donations data={sorted} actions={actions} />,
    treasury: <Treasury data={sorted} actions={actions} currentUser={currentUser} />,
    volunteers: <Volunteers data={sorted} actions={actions} />,
    reports: <Reports data={sorted} />,
    backup: <Backup data={sorted} actions={actions} />
  };

  const visiblePages = Object.fromEntries(Object.entries(pages).filter(([moduleId]) => moduleId === 'dashboard' || canAccess(currentUser, moduleId)));
  const selectedPage = visiblePages[active] ? active : 'dashboard';
  const pageContent = isDebugAdminRoute ? <DebugAdmin currentUser={currentUser} /> : visiblePages[selectedPage];

  return (
    <Layout active={selectedPage} setActive={setActive} onReset={actions.resetDemo} currentUser={currentUser} onLogout={async () => { await signOut(); setCurrentUser(null); }}>
      {!hasSupabaseConfig && <div className="mb-5 flex gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"><Database size={18} /> Modo demo local activo. Configura Supabase para usar PostgreSQL.</div>}
      {error && <div className="mb-5 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle size={18} /> {error}</div>}
      {pageContent}
    </Layout>
  );
}
