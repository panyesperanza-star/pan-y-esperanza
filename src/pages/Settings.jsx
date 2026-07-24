import { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { isRoleActionAllowed, PERMISSION_ACTIONS, PERMISSION_MODULES, ROLE_PERMISSION_MATRIX, ROLE_PERMISSIONS, ROLES } from '../lib/constants';
import { formatDateTime } from '../lib/formatters';
import { canAccess, canDo, getUserStatus } from '../lib/auth';
import {
  buildUsersViewModel,
  createEmptyUser,
  filterUsersByStatus,
  normalizeUserError,
  viewPermissionsFromMatrix
} from '../services/users/UsuarioService';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';

export function Settings({ data, actions, currentUser, initialTab = 'entity' }) {
  const current = data.organization_settings?.[0] || {};
  const [form, setForm] = useState(current);
  const canViewSettings = canAccess(currentUser, 'settings');
  const canViewUsers = canAccess(currentUser, 'users');
  const settingsService = actions.configuracion;
  const fallbackTab = canViewSettings ? 'entity' : 'users';
  const requestedTabAllowed = initialTab === 'users' ? canViewUsers : canViewSettings;
  const [tab, setTab] = useState(requestedTabAllowed ? initialTab : fallbackTab);
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));
  const deliveryPreferences = form.erp_preferences?.deliveries || {};
  const updateDeliveryPreference = (field, value) => setForm((state) => ({
    ...state,
    erp_preferences: {
      ...(state.erp_preferences || {}),
      deliveries: {
        ...(state.erp_preferences?.deliveries || {}),
        [field]: value
      }
    }
  }));

  useEffect(() => {
    setTab(initialTab === 'users' && canViewUsers ? 'users' : fallbackTab);
  }, [initialTab, canViewUsers, fallbackTab]);

  return (
    <>
      <PageHeader title={initialTab === 'users' ? 'Usuarios' : 'Configuración'} description={initialTab === 'users' ? 'Gestión de usuarios, roles y permisos.' : 'Identidad corporativa y configuración del sistema.'} />
      <div className="mb-5 flex flex-wrap gap-2">
        {canViewSettings && <Button variant={tab === 'entity' ? 'primary' : 'secondary'} onClick={() => setTab('entity')}>Entidad</Button>}
        {canViewSettings && <Button variant={tab === 'mail' ? 'primary' : 'secondary'} onClick={() => setTab('mail')}>Correo</Button>}
        {canViewUsers && <Button variant={tab === 'users' ? 'primary' : 'secondary'} onClick={() => setTab('users')}>Usuarios</Button>}
        {canViewSettings && <Button variant={tab === 'system' ? 'primary' : 'secondary'} onClick={() => setTab('system')}>Estado del sistema</Button>}
      </div>
      {tab === 'entity' && (
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <BrandLogo className="h-20 w-auto" />
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); settingsService.saveSettings(form).then(() => actions.reloadData?.()); }}>
          <FormField label="Nombre entidad"><input className={inputClass} value={form.name || ''} onChange={(event) => update('name', event.target.value)} /></FormField>
          <FormField label="CIF"><input className={inputClass} value={form.cif || ''} onChange={(event) => update('cif', event.target.value)} /></FormField>
          <FormField label="Dirección"><input className={inputClass} value={form.address || ''} onChange={(event) => update('address', event.target.value)} /></FormField>
          <FormField label="Teléfono"><input className={inputClass} value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} /></FormField>
          <FormField label="Correo"><input className={inputClass} type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} /></FormField>
          <FormField label="Web"><input className={inputClass} value={form.website || ''} onChange={(event) => update('website', event.target.value)} /></FormField>
          <div className="sm:col-span-2"><FormField label="Logo"><input className={inputClass} value={form.logo_path || 'src/assets/logo-pan-y-esperanza.png'} onChange={(event) => update('logo_path', event.target.value)} /></FormField></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
            <label className="flex items-start gap-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={deliveryPreferences.require_digital_signature === true}
                onChange={(event) => updateDeliveryPreference('require_digital_signature', event.target.checked)}
              />
              <span>
                Solicitar firma digital en las entregas
                <span className="mt-1 block text-sm font-normal text-slate-500">Si esta activa, no se podra finalizar una entrega sin la firma digital del receptor.</span>
              </span>
            </label>
          </div>
          <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar configuracion</Button></div>
        </form>
      </section>
      )}
      {tab === 'mail' && <MailSettings settings={form} setSettings={setForm} configService={settingsService} onSave={(payload) => settingsService.saveMailSettings(payload).then(() => actions.reloadData?.())} />}
      {tab === 'users' && <UsersSettings users={data.app_users || []} auditLogs={data.audit_logs || []} actions={actions} currentUser={currentUser} organization={current} />}
      {tab === 'system' && <SystemStatus configService={settingsService} />}
    </>
  );
}

function SystemStatus({ configService }) {
  const [storageConnected, setStorageConnected] = useState(null);
  const status = configService.getSystemStatus();
  const lastBackup = configService.getLastBackupAt();

  async function checkStorage() {
    setStorageConnected(await configService.checkStorage());
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="font-bold text-ink">Estado del sistema</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusItem label="Base de datos conectada" ok={status.databaseConfigured} />
        <StatusItem label="Correo conectado" ok={status.emailConfigured} />
        <StatusItem label="Almacenamiento conectado" ok={storageConnected ?? status.storageConfigured} action={<Button variant="secondary" type="button" onClick={checkStorage}>Comprobar</Button>} />
        <StatusItem label="Última copia de seguridad" value={lastBackup ? formatDateTime(lastBackup) : 'Sin copias registradas'} />
      </div>
      <p className="mt-4 text-sm text-slate-500">Para produccion real configura Supabase, Resend y el bucket de almacenamiento en Supabase Edge Functions antes de activar usuarios reales.</p>
    </section>
  );
}

function StatusItem({ label, ok, value, action }) {
  const resolved = typeof ok === 'boolean';
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${resolved ? (ok ? 'text-brand-700' : 'text-red-600') : 'text-ink'}`}>{resolved ? (ok ? 'Conectado' : 'No configurado') : value}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function MailSettings({ settings, setSettings, configService, onSave }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(false);
  const update = (field, value) => setSettings((state) => ({ ...state, [field]: value }));

  async function testEmail() {
    setStatus('Probando envio...');
    setError('');
    try {
      const payload = await configService.testEmail(settings);
      setConfigured(true);
      setStatus(payload.message || 'Correo enviado correctamente.');
    } catch (err) {
      setConfigured(false);
      setError(err.message || 'Error al enviar el correo.');
      setStatus('');
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="font-bold text-ink">Correo</h3>
      <p className="mt-1 text-sm text-slate-500">El envio real se realiza desde la Supabase Edge Function con Resend. No se envian credenciales SMTP desde el navegador.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(settings); }}>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm sm:col-span-2">
          <span className="font-semibold text-slate-700">Estado: </span>
          <span className={configured ? 'font-bold text-brand-700' : 'font-bold text-red-600'}>{configured ? 'Configurado' : 'No configurado'}</span>
        </div>
        <FormField label="Nombre remitente"><input className={inputClass} value={settings.mail_sender_name || ''} onChange={(event) => update('mail_sender_name', event.target.value)} /></FormField>
        <FormField label="Correo remitente"><input className={inputClass} type="email" value={settings.mail_sender_email || ''} onChange={(event) => update('mail_sender_email', event.target.value)} /></FormField>
        <FormField label="Proveedor recomendado"><input className={inputClass} value="Resend API" disabled /></FormField>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2">Configura `RESEND_API_KEY` y `FROM_EMAIL` en `.env` local o como secreto de Supabase Edge Functions. El frontend nunca recibe la API key.</div>
        {status && <p className="rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700 sm:col-span-2">{status}</p>}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" type="button" onClick={testEmail}>Enviar correo de prueba</Button>
          <Button type="submit">Guardar correo</Button>
        </div>
      </form>
    </section>
  );
}

function UsersSettings({ users, auditLogs, actions, currentUser, organization }) {
  const [editing, setEditing] = useState(null);
  const [section, setSection] = useState('users');
  const [message, setMessage] = useState('');
  const { associationUsers, activeUsers, inactiveUsers, blockedUsers } = buildUsersViewModel(users);
  const canCreate = canDo(currentUser, 'users', 'create');
  const canEdit = canDo(currentUser, 'users', 'edit');
  const canDelete = canDo(currentUser, 'users', 'delete');
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">Usuarios</h3>
          <p className="text-sm text-slate-500">Gestión de usuarios, permisos por acción, accesos y auditoría.</p>
        </div>
        {canCreate && <Button onClick={() => setEditing(createEmptyUser(currentUser))}>Crear usuario</Button>}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Usuarios activos" value={activeUsers.length} />
        <MiniStat label="Usuarios inactivos" value={inactiveUsers.length} />
        <MiniStat label="Usuarios bloqueados" value={blockedUsers.length} />
        <MiniStat label="Últimos accesos" value={users.filter((user) => user.last_access_at).length} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={section === 'users' ? 'primary' : 'secondary'} onClick={() => setSection('users')}>Usuarios</Button>
        {canEdit && <Button variant={section === 'permissions' ? 'primary' : 'secondary'} onClick={() => setSection('permissions')}>Usuarios &gt; Permisos</Button>}
        <Button variant={section === 'audit' ? 'primary' : 'secondary'} onClick={() => setSection('audit')}>Auditoria</Button>
      </div>
      {message && <p className="mb-4 rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
      {section === 'users' && <UsersTable users={associationUsers} actions={actions} currentUser={currentUser} setEditing={setEditing} setMessage={setMessage} canEdit={canEdit} canDelete={canDelete} />}
      {section === 'permissions' && canEdit && <PermissionsMatrix users={associationUsers} actions={actions} setMessage={setMessage} />}
      {section === 'audit' && <AuditTable logs={auditLogs} />}
      {editing && <Modal title={editing.id ? 'Editar usuario' : 'Crear usuario'} onClose={() => setEditing(null)} wide><UserForm initial={editing} organization={organization} onSubmit={async (payload) => { if (payload.id) { await actions.updateUser(payload.id, payload); setMessage('Usuario actualizado correctamente.'); } else { await actions.createUser(payload); await actions.sendUserWelcomeEmail(payload, organization, getOfficialLogoUrl()); setMessage('Usuario creado y correo de bienvenida solicitado.'); } setEditing(null); }} /></Modal>}
    </section>
  );
}

function UsersTable({ users, actions, currentUser, setEditing, setMessage, canEdit, canDelete }) {
  const [filter, setFilter] = useState('active');
  const filtered = filterUsersByStatus(users, filter);

  async function deleteUser(user) {
    const confirmed = window.confirm('Esta acción eliminará definitivamente el usuario y no podrá recuperarse.\n\nSe recomienda desactivar en lugar de eliminar.\n\n¿Desea eliminarlo definitivamente?');
    if (!confirmed) return;
    try {
      await actions.deleteUser(user.id);
      setMessage('Usuario eliminado definitivamente. La accion ha quedado registrada en auditoria.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deactivateUser(user) {
    try {
      await actions.deactivateUser(user.id);
      setMessage('Usuario desactivado sin borrar historial, permisos ni datos.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function reactivateUser(user) {
    try {
      await actions.reactivateUser(user.id);
      setMessage('Usuario reactivado. Recupera automaticamente su acceso anterior.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function blockUser(user) {
    try {
      await actions.blockUser(user.id);
      setMessage('Usuario bloqueado. No podrá iniciar sesión hasta ser reactivado.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resetPassword(user) {
    const password = window.prompt('Nueva contraseña temporal');
    if (password) {
      await actions.resetUserPassword(user.id, password);
      setMessage('Contraseña temporal actualizada.');
    }
  }

  async function runSecondaryUserAction(user, action) {
    if (action === 'reset-password') await resetPassword(user);
    if (action === 'block') await blockUser(user);
    if (action === 'delete') await deleteUser(user);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={filter === 'active' ? 'primary' : 'secondary'} onClick={() => setFilter('active')}>Ver usuarios activos</Button>
        <Button variant={filter === 'inactive' ? 'primary' : 'secondary'} onClick={() => setFilter('inactive')}>Ver usuarios inactivos</Button>
        <Button variant={filter === 'blocked' ? 'primary' : 'secondary'} onClick={() => setFilter('blocked')}>Ver usuarios bloqueados</Button>
        <Button variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>Ver todos los usuarios</Button>
      </div>
      <p className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">Para conservar historial y permisos, se recomienda desactivar usuarios en lugar de eliminarlos definitivamente.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1360px] table-fixed text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-[160px] px-4 py-3">Usuario</th><th className="w-[190px]">Email</th><th className="w-[110px]">Teléfono</th><th className="w-[130px]">Cargo</th><th className="w-[105px]">Estado</th><th className="w-[135px]">Último acceso</th><th className="w-[135px]">Creado</th><th className="w-[120px]">Creado por</th><th className="w-[280px] pr-4 text-right">Acciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((user) => {
              const status = getUserStatus(user);
              const isCurrentUser = user.id === currentUser?.id;
              return (
                <tr key={user.id}>
                  <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3">{user.profile_photo && <img src={user.profile_photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />}<span className="truncate font-semibold">{user.first_name} {user.last_name}</span></div></td>
                  <td className="break-words pr-3">{user.email}</td>
                  <td className="break-words pr-3">{user.phone || '-'}</td>
                  <td className="break-words pr-3">{user.position || user.role}</td>
                  <td><span className={`rounded-md px-2 py-1 text-xs font-bold ${status === 'Activo' ? 'bg-brand-50 text-brand-700' : status === 'Bloqueado' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{status}</span></td>
                  <td className="pr-3">{formatDateTime(user.last_access_at)}</td>
                  <td className="pr-3">{formatDateTime(user.created_at)}</td>
                  <td className="break-words pr-3">{user.created_by || '-'}</td>
                  <td className="pr-4 py-3 align-top">
                    <div className="flex max-w-full flex-wrap justify-end gap-2">
                      {canEdit && <Button className="shrink-0 whitespace-nowrap" variant="secondary" onClick={() => setEditing(user)}>Editar</Button>}
                      {canEdit && (status === 'Activo'
                        ? <Button className="shrink-0 whitespace-nowrap" variant="secondary" disabled={isCurrentUser} onClick={() => deactivateUser(user)}>Desactivar usuario</Button>
                        : <Button className="shrink-0 whitespace-nowrap" variant="secondary" onClick={() => reactivateUser(user)}>Reactivar usuario</Button>)}
                      {(canEdit || canDelete) && (
                        <select
                          className={`${inputClass} h-10 w-40 shrink-0`}
                          defaultValue=""
                          aria-label={`Más acciones para ${user.first_name} ${user.last_name}`}
                          onChange={(event) => {
                            const action = event.target.value;
                            event.target.value = '';
                            if (action) void runSecondaryUserAction(user, action);
                          }}
                        >
                          <option value="">Más acciones</option>
                          {canEdit && <option value="reset-password">Restablecer contraseña</option>}
                          {canEdit && status !== 'Bloqueado' && !isCurrentUser && <option value="block">Bloquear</option>}
                          {canDelete && !isCurrentUser && <option value="delete">Eliminar</option>}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="9">No hay usuarios para el filtro seleccionado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-ink">{value}</p></div>;
}

function UserForm({ initial, organization, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));
  function updateRole(role) {
    setForm((state) => ({ ...state, role, position: state.position || role, permissions: ROLE_PERMISSIONS[role] || [], permission_matrix: ROLE_PERMISSION_MATRIX[role] || {} }));
  }
  function updatePhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('profile_photo', reader.result);
    reader.readAsDataURL(file);
  }
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      setError('');
      try {
        await onSubmit({ ...form, permissions: viewPermissionsFromMatrix(form.permission_matrix, form.role) });
      } catch (err) {
        setError(normalizeUserError(err));
      }
    }}>
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
      <FormField label="Nombre"><input className={inputClass} required value={form.first_name || ''} onChange={(event) => update('first_name', event.target.value)} /></FormField>
      <FormField label="Apellidos"><input className={inputClass} value={form.last_name || ''} onChange={(event) => update('last_name', event.target.value)} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" required value={form.email || ''} onChange={(event) => update('email', event.target.value)} /></FormField>
      <FormField label="Teléfono"><input className={inputClass} value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} /></FormField>
      <FormField label="Cargo"><input className={inputClass} value={form.position || ''} onChange={(event) => update('position', event.target.value)} /></FormField>
      <FormField label="Contraseña temporal"><input className={inputClass} type="password" value={form.password || ''} onChange={(event) => update('password', event.target.value)} /></FormField>
      <FormField label="Rol"><select className={inputClass} value={form.role || 'Voluntario'} onChange={(event) => updateRole(event.target.value)}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></FormField>
      <FormField label="Estado"><select className={inputClass} value={form.status || (form.is_active ? 'Activo' : 'Inactivo')} onChange={(event) => { update('status', event.target.value); update('is_active', event.target.value === 'Activo'); }}><option>Activo</option><option>Inactivo</option><option>Bloqueado</option></select></FormField>
      <FormField label="Foto de perfil opcional"><input className={inputClass} type="file" accept="image/*" onChange={(event) => updatePhoto(event.target.files?.[0])} /></FormField>
      <FormField label="Creado por"><input className={inputClass} value={form.created_by || ''} onChange={(event) => update('created_by', event.target.value)} /></FormField>
      {form.profile_photo && <div className="sm:col-span-2"><img src={form.profile_photo} alt="" className="h-16 w-16 rounded-full object-cover" /></div>}
      <div className="sm:col-span-2"><PermissionEditor value={form.permission_matrix || ROLE_PERMISSION_MATRIX[form.role] || {}} role={form.role} onChange={(matrix) => update('permission_matrix', matrix)} /></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar usuario</Button></div>
    </form>
  );
}

function PermissionEditor({ value, role, onChange }) {
  function toggle(moduleId, actionId) {
    if (!isRoleActionAllowed(role, moduleId, actionId)) return;
    onChange({ ...value, [moduleId]: { ...(value[moduleId] || {}), [actionId]: !value[moduleId]?.[actionId] } });
  }
  return <div><p className="mb-2 text-sm font-medium text-slate-700">Permisos por módulo</p><div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Módulo</th>{PERMISSION_ACTIONS.map((action) => <th key={action.id} className="px-3 py-2">{action.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{PERMISSION_MODULES.map((module) => <tr key={module.id}><td className="px-3 py-2 font-medium">{module.label}</td>{PERMISSION_ACTIONS.map((action) => { const supported = (!module.actions || module.actions.includes(action.id)) && isRoleActionAllowed(role, module.id, action.id); return <td key={action.id} className="px-3 py-2 text-center"><input type="checkbox" aria-label={`${module.label}: ${action.label}`} checked={supported && Boolean(value[module.id]?.[action.id])} disabled={!supported} onChange={() => toggle(module.id, action.id)} /></td>; })}</tr>)}</tbody></table></div></div>;
}

function PermissionsMatrix({ users, actions, setMessage }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(users.map((user) => [user.id, user.permission_matrix || ROLE_PERMISSION_MATRIX[user.role] || {}])));
  return <div className="space-y-4">{users.map((user) => <div key={user.id} className="rounded-md border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-semibold">{user.first_name} {user.last_name}</p><p className="text-sm text-slate-500">{user.email} · {user.role}</p></div><Button variant="secondary" onClick={async () => { const matrix = drafts[user.id] || {}; await actions.updateUser(user.id, { ...user, permissions: viewPermissionsFromMatrix(matrix, user.role), permission_matrix: matrix }); setMessage('Permisos actualizados.'); }}>Guardar permisos</Button></div><PermissionEditor value={drafts[user.id] || {}} role={user.role} onChange={(matrix) => setDrafts((state) => ({ ...state, [user.id]: matrix }))} /></div>)}</div>;
}

function AuditTable({ logs }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Usuario</th><th>Fecha</th><th>Accion realizada</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((log) => <tr key={log.id}><td className="px-4 py-3">{log.user_name || log.user_email || '-'}</td><td>{formatDateTime(log.happened_at)}</td><td>{log.action}</td></tr>)}{!logs.length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="3">Sin auditoria registrada.</td></tr>}</tbody></table></div>;
}

function getOfficialLogoUrl() {
  return typeof window !== 'undefined' ? new URL(officialLogoUrl, window.location.origin).toString() : undefined;
}
