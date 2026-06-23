import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { getApiHeaders } from '../lib/apiAuth';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

const ADMIN_ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Administrador'];
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

export function DebugAdmin({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [repairSecret, setRepairSecret] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [createResult, setCreateResult] = useState(null);
  const [deleteResult, setDeleteResult] = useState(null);
  const [createdTestUser, setCreatedTestUser] = useState(null);

  const checks = useMemo(() => buildChecks(snapshot), [snapshot]);

  async function refresh() {
    setLoading(true);
    try {
      setSnapshot(await loadAdminSnapshot());
    } catch (error) {
      setSnapshot({ error: serializeError(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function repairCurrentUser() {
    setRepairResult({ running: true });
    try {
      const response = await fetch(`/api/emergency-admin-repair?secret=${encodeURIComponent(repairSecret)}`);
      const result = await readApiJson(response);
      setRepairResult({ status: response.status, ok: response.ok, result });
      await refresh();
    } catch (error) {
      setRepairResult({ error: serializeError(error) });
    }
  }

  async function testCreateUser() {
    setCreateResult({ running: true });
    setCreatedTestUser(null);
    const stamp = Date.now();
    const user = {
      first_name: 'Debug',
      last_name: 'Temporal',
      email: `debug-${stamp}@panyesperanza.org`,
      password: `Temporal${stamp}!`,
      phone: '',
      role: 'Voluntario',
      position: 'Voluntario',
      status: 'Activo',
      is_active: true,
      permissions: ['beneficiaries'],
      permission_matrix: {
        beneficiaries: { view: true, create: false, edit: false, delete: false }
      },
      created_by: currentUser?.email || 'debug/admin'
    };

    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: await getApiHeaders(),
        body: JSON.stringify({ user })
      });
      const result = await readApiJson(response);
      setCreateResult({ status: response.status, ok: response.ok, request: { user: { ...user, password: '[oculta]' } }, result });
      if (response.ok && result?.user?.id) setCreatedTestUser(result.user);
      await refresh();
    } catch (error) {
      setCreateResult({ error: serializeError(error) });
    }
  }

  async function testDeleteUser() {
    setDeleteResult({ running: true });
    const id = createdTestUser?.id || EMPTY_UUID;
    try {
      const response = await fetch('/api/admin-user', {
        method: 'POST',
        headers: await getApiHeaders(),
        body: JSON.stringify({ action: 'delete', id })
      });
      const result = await readApiJson(response);
      setDeleteResult({ status: response.status, ok: response.ok, request: { action: 'delete', id }, result });
      await refresh();
    } catch (error) {
      setDeleteResult({ error: serializeError(error) });
    }
  }

  async function testRequireAdmin() {
    const response = await fetch('/api/admin-user', {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({ action: '__debug_require_admin__', id: EMPTY_UUID })
    });
    return { status: response.status, ok: response.ok, result: await readApiJson(response) };
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Pagina temporal /debug/admin</p>
        <p>Eliminar esta pagina y el soporte GET de emergencia antes de produccion final.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={refresh} disabled={loading}>{loading ? 'Actualizando...' : 'Actualizar diagnostico'}</Button>
        <input
          className="min-w-[260px] rounded-md border border-slate-300 px-3 py-2 text-sm"
          type="password"
          placeholder="EMERGENCY_REPAIR_SECRET"
          value={repairSecret}
          onChange={(event) => setRepairSecret(event.target.value)}
        />
        <Button onClick={repairCurrentUser}>Reparar mi usuario</Button>
        <Button variant="secondary" onClick={testCreateUser}>Probar creacion de usuario</Button>
        <Button variant="secondary" onClick={testDeleteUser}>Probar eliminacion</Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <DebugPanel title="Supabase Auth" value={{
          hasSupabaseConfig,
          authenticatedEmail: snapshot?.auth?.user?.email || null,
          authUid: snapshot?.auth?.user?.id || null,
          authError: snapshot?.auth?.error || null,
          session: snapshot?.session || null
        }} />
        <DebugPanel title="app_users encontrado" value={{
          byAuthUserId: snapshot?.appUserByAuth || null,
          byEmail: snapshot?.appUserByEmail || null,
          selectedProfile: snapshot?.profile || null,
          appUsersErrors: snapshot?.appUsersErrors || null
        }} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DebugPanel title="Comprobaciones administrativas" value={checks} />
        <DebugPanel title="Resultado requireAdmin()" value={snapshot?.requireAdminProbe || null} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <DebugPanel title="Reparar mi usuario" value={repairResult} />
        <DebugPanel title="Probar creacion de usuario" value={createResult} />
        <DebugPanel title="Probar eliminacion" value={deleteResult} />
      </section>
    </div>
  );

  async function loadAdminSnapshot() {
    if (!hasSupabaseConfig || !supabase) {
      return { error: 'Supabase no esta configurado.' };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session || null;
    const authUser = session?.user || null;
    const email = authUser?.email?.toLowerCase() || '';

    const result = {
      session: {
        hasSession: Boolean(session),
        accessTokenLength: session?.access_token?.length || 0,
        accessTokenStartsWith: session?.access_token?.slice(0, 20) || ''
      },
      auth: {
        user: authUser ? { id: authUser.id, email: authUser.email, role: authUser.role, aud: authUser.aud } : null,
        error: sessionError ? serializeError(sessionError) : null
      },
      appUsersErrors: {}
    };

    if (authUser?.id) {
      const byAuth = await supabase.from('app_users').select('*').eq('auth_user_id', authUser.id).maybeSingle();
      result.appUserByAuth = byAuth.data || null;
      if (byAuth.error) result.appUsersErrors.byAuthUserId = byAuth.error;
    }

    if (email) {
      const byEmail = await supabase.from('app_users').select('*').ilike('email', email).maybeSingle();
      result.appUserByEmail = byEmail.data || null;
      if (byEmail.error) result.appUsersErrors.byEmail = byEmail.error;
    }

    result.profile = result.appUserByAuth || result.appUserByEmail || null;

    try {
      result.requireAdminProbe = await testRequireAdmin();
    } catch (error) {
      result.requireAdminProbe = { error: serializeError(error) };
    }

    return result;
  }
}

function buildChecks(snapshot) {
  const profile = snapshot?.profile || null;
  const authUser = snapshot?.auth?.user || null;
  const matrix = profile?.permission_matrix || {};
  const permissions = profile?.permissions || [];
  return {
    hasAuthenticatedUser: Boolean(authUser),
    authenticatedEmail: authUser?.email || null,
    authUid: authUser?.id || null,
    hasAppUserProfile: Boolean(profile),
    appUserId: profile?.id || null,
    authUserIdInAppUsers: profile?.auth_user_id || null,
    authUserIdMatches: Boolean(authUser?.id && profile?.auth_user_id === authUser.id),
    emailMatchesNormalized: Boolean(authUser?.email && profile?.email && authUser.email.toLowerCase() === profile.email.toLowerCase()),
    role: profile?.role || null,
    roleIsAdmin: ADMIN_ROLES.includes(profile?.role),
    status: profile?.status || null,
    isActive: profile?.is_active !== false && (profile?.status || 'Activo') === 'Activo',
    permissions,
    permissionsAllowUsers: Array.isArray(permissions) && (permissions.includes('*') || permissions.includes('users')),
    permissionMatrixUsers: matrix.users || null,
    permissionMatrixAllowsUsers: Boolean(matrix.users?.create || matrix.users?.edit || matrix.users?.delete),
    administrativeDecision: decideAdmin(profile),
    exactFailureReason: getFailureReason(authUser, profile)
  };
}

function decideAdmin(profile) {
  if (!profile) return false;
  if (profile.is_active === false || (profile.status || 'Activo') !== 'Activo') return false;
  if (ADMIN_ROLES.includes(profile.role)) return true;
  if (Array.isArray(profile.permissions) && (profile.permissions.includes('*') || profile.permissions.includes('users'))) return true;
  const matrix = profile.permission_matrix || {};
  return Boolean(matrix.users?.create || matrix.users?.edit || matrix.users?.delete);
}

function getFailureReason(authUser, profile) {
  if (!authUser) return 'No hay usuario autenticado en Supabase Auth.';
  if (!profile) return 'No se encontro registro en app_users por auth_user_id ni por email.';
  if (!profile.auth_user_id) return 'app_users.auth_user_id esta vacio.';
  if (profile.auth_user_id !== authUser.id) return 'app_users.auth_user_id no coincide con auth.uid().';
  if (profile.email?.toLowerCase() !== authUser.email?.toLowerCase()) return 'app_users.email no coincide con el email autenticado.';
  if (profile.is_active === false || (profile.status || 'Activo') !== 'Activo') return 'El usuario esta inactivo o bloqueado.';
  if (!decideAdmin(profile)) return 'El rol/permisos no permiten administrar usuarios.';
  return 'Todas las comprobaciones administrativas locales pasan.';
}

async function readApiJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return { parseError: serializeError(error), rawText: text };
  }
}

function serializeError(error) {
  return {
    name: error?.name,
    message: error?.message || String(error),
    stack: error?.stack
  };
}

function DebugPanel({ title, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>
      <pre className="max-h-[520px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
