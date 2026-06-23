import { useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { FormField, inputClass } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { PERMISSION_ACTIONS, PERMISSION_MODULES, ROLE_PERMISSION_MATRIX, ROLE_PERMISSIONS, ROLES } from '../lib/constants';
import { formatDateTime } from '../lib/formatters';
import { getUserStatus } from '../lib/auth';
import { getSystemConfigStatus, checkSupabaseStorage } from '../lib/supabase';
import { getApiHeaders } from '../lib/apiAuth';
import officialLogoUrl from '../assets/logo-pan-y-esperanza.png';

export function Settings({ data, actions, currentUser }) {
  const current = data.organization_settings?.[0] || {};
  const [form, setForm] = useState(current);
  const [tab, setTab] = useState('entity');
  const update = (field, value) => setForm((state) => ({ ...state, [field]: value }));

  return (
    <>
      <PageHeader title="Configuracion" description="Identidad corporativa, usuarios, roles y permisos." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant={tab === 'entity' ? 'primary' : 'secondary'} onClick={() => setTab('entity')}>Entidad</Button>
        <Button variant={tab === 'mail' ? 'primary' : 'secondary'} onClick={() => setTab('mail')}>Correo</Button>
        <Button variant={tab === 'users' ? 'primary' : 'secondary'} onClick={() => setTab('users')}>Usuarios</Button>
        <Button variant={tab === 'system' ? 'primary' : 'secondary'} onClick={() => setTab('system')}>Estado del sistema</Button>
      </div>
      {tab === 'entity' && (
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
        <BrandLogo className="h-20 w-auto" />
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); actions.updateOrganizationSettings(form); }}>
          <FormField label="Nombre entidad"><input className={inputClass} value={form.name || ''} onChange={(event) => update('name', event.target.value)} /></FormField>
          <FormField label="CIF"><input className={inputClass} value={form.cif || ''} onChange={(event) => update('cif', event.target.value)} /></FormField>
          <FormField label="Direccion"><input className={inputClass} value={form.address || ''} onChange={(event) => update('address', event.target.value)} /></FormField>
          <FormField label="Telefono"><input className={inputClass} value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} /></FormField>
          <FormField label="Correo"><input className={inputClass} type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} /></FormField>
          <FormField label="Web"><input className={inputClass} value={form.website || ''} onChange={(event) => update('website', event.target.value)} /></FormField>
          <div className="sm:col-span-2"><FormField label="Logo"><input className={inputClass} value={form.logo_path || 'src/assets/logo-pan-y-esperanza.png'} onChange={(event) => update('logo_path', event.target.value)} /></FormField></div>
          <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar configuracion</Button></div>
        </form>
      </section>
      )}
      {tab === 'mail' && <MailSettings settings={form} setSettings={setForm} onSave={actions.updateOrganizationSettings} />}
      {tab === 'users' && <UsersSettings users={data.app_users || []} auditLogs={data.audit_logs || []} actions={actions} currentUser={currentUser} organization={current} />}
      {tab === 'system' && <SystemStatus />}
    </>
  );
}

function SystemStatus() {
  const [storageConnected, setStorageConnected] = useState(null);
  const status = getSystemConfigStatus();
  const lastBackup = localStorage.getItem('pye-last-backup-at') || '';

  async function checkStorage() {
    setStorageConnected(await checkSupabaseStorage());
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <h3 className="font-bold text-ink">Estado del sistema</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusItem label="Base de datos conectada" ok={status.databaseConfigured} />
        <StatusItem label="Correo conectado" ok={status.emailConfigured} />
        <StatusItem label="Almacenamiento conectado" ok={storageConnected ?? status.storageConfigured} action={<Button variant="secondary" type="button" onClick={checkStorage}>Comprobar</Button>} />
        <StatusItem label="Ultima copia de seguridad" value={lastBackup ? formatDateTime(lastBackup) : 'Sin copias registradas'} />
      </div>
      <p className="mt-4 text-sm text-slate-500">Para produccion real configura Supabase, Resend y el bucket de almacenamiento en Vercel antes de activar usuarios reales.</p>
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

function MailSettings({ settings, setSettings, onSave }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(false);
  const update = (field, value) => setSettings((state) => ({ ...state, [field]: value }));

  async function testEmail() {
    setStatus('Probando envio...');
    setError('');
    try {
      const response = await fetch('/api/send-justificantes', {
        method: 'POST',
        headers: await getApiHeaders(),
        body: JSON.stringify({
          testMode: true,
          to: settings.mail_sender_email || settings.email,
          subject: 'Prueba de correo - Pan y Esperanza',
          message: 'Este es un correo de prueba de la configuracion corporativa.',
          organization: settings
        })
      });
      const text = await response.text();
      const payload = safeJson(text);
      if (!response.ok) throw new Error(payload.error || 'Error al enviar el correo.');
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
      <p className="mt-1 text-sm text-slate-500">El envio real se realiza desde la API serverless con Resend. No se envian credenciales SMTP desde el navegador.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(settings); }}>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm sm:col-span-2">
          <span className="font-semibold text-slate-700">Estado: </span>
          <span className={configured ? 'font-bold text-brand-700' : 'font-bold text-red-600'}>{configured ? 'Configurado' : 'No configurado'}</span>
        </div>
        <FormField label="Nombre remitente"><input className={inputClass} value={settings.mail_sender_name || ''} onChange={(event) => update('mail_sender_name', event.target.value)} /></FormField>
        <FormField label="Correo remitente"><input className={inputClass} type="email" value={settings.mail_sender_email || ''} onChange={(event) => update('mail_sender_email', event.target.value)} /></FormField>
        <FormField label="Proveedor recomendado"><input className={inputClass} value="Resend API" disabled /></FormField>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2">Configura `RESEND_API_KEY` y `FROM_EMAIL` en `.env` local o en variables de entorno de Vercel. El frontend nunca recibe la API key.</div>
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

function safeJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Respuesta no valida del servidor.' };
  }
}

function UsersSettings({ users, auditLogs, actions, currentUser, organization }) {
  const [editing, setEditing] = useState(null);
  const [section, setSection] = useState('users');
  const [message, setMessage] = useState('');
  const activeUsers = users.filter((user) => getUserStatus(user) === 'Activo');
  const inactiveUsers = users.filter((user) => getUserStatus(user) === 'Inactivo');
  const blockedUsers = users.filter((user) => getUserStatus(user) === 'Bloqueado');
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">Usuarios</h3>
          <p className="text-sm text-slate-500">Gestion de usuarios, permisos por accion, accesos y auditoria.</p>
        </div>
        <Button onClick={() => setEditing(emptyUser(currentUser))}>Crear usuario</Button>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Usuarios activos" value={activeUsers.length} />
        <MiniStat label="Usuarios inactivos" value={inactiveUsers.length} />
        <MiniStat label="Usuarios bloqueados" value={blockedUsers.length} />
        <MiniStat label="Ultimos accesos" value={users.filter((user) => user.last_access_at).length} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={section === 'users' ? 'primary' : 'secondary'} onClick={() => setSection('users')}>Usuarios</Button>
        <Button variant={section === 'permissions' ? 'primary' : 'secondary'} onClick={() => setSection('permissions')}>Usuarios &gt; Permisos</Button>
        <Button variant={section === 'audit' ? 'primary' : 'secondary'} onClick={() => setSection('audit')}>Auditoria</Button>
      </div>
      {message && <p className="mb-4 rounded-md bg-brand-50 p-3 text-sm font-medium text-brand-700">{message}</p>}
      {section === 'users' && <UsersTable users={users} actions={actions} currentUser={currentUser} setEditing={setEditing} setMessage={setMessage} />}
      {section === 'permissions' && <PermissionsMatrix users={users} actions={actions} setMessage={setMessage} />}
      {section === 'audit' && <AuditTable logs={auditLogs} />}
      {editing && <Modal title={editing.id ? 'Editar usuario' : 'Crear usuario'} onClose={() => setEditing(null)} wide><UserForm initial={editing} organization={organization} onSubmit={async (payload) => { if (payload.id) { await actions.updateUser(payload.id, payload); setMessage('Usuario actualizado correctamente.'); } else { await actions.createUser(payload); await sendWelcomeEmail(payload, organization); setMessage('Usuario creado y correo de bienvenida solicitado.'); } setEditing(null); }} /></Modal>}
    </section>
  );
}

function UsersTable({ users, actions, currentUser, setEditing, setMessage }) {
  const [filter, setFilter] = useState('active');
  const filtered = users.filter((user) => {
    const status = getUserStatus(user);
    if (filter === 'active') return status === 'Activo';
    if (filter === 'inactive') return status === 'Inactivo';
    if (filter === 'blocked') return status === 'Bloqueado';
    return true;
  });

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
      setMessage('Usuario bloqueado. No podra iniciar sesion hasta ser reactivado.');
    } catch (error) {
      setMessage(error.message);
    }
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
        <table className="w-full min-w-[1240px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Usuario</th><th>Email</th><th>Telefono</th><th>Cargo</th><th>Estado</th><th>Ultimo acceso</th><th>Creado</th><th>Creado por</th><th className="text-right pr-4">Acciones</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((user) => {
              const status = getUserStatus(user);
              const isCurrentUser = user.id === currentUser?.id;
              return (
                <tr key={user.id}>
                  <td className="px-4 py-3"><div className="flex items-center gap-3">{user.profile_photo && <img src={user.profile_photo} alt="" className="h-10 w-10 rounded-full object-cover" />}<span className="font-semibold">{user.first_name} {user.last_name}</span></div></td>
                  <td>{user.email}</td>
                  <td>{user.phone || '-'}</td>
                  <td>{user.position || user.role}</td>
                  <td><span className={`rounded-md px-2 py-1 text-xs font-bold ${status === 'Activo' ? 'bg-brand-50 text-brand-700' : status === 'Bloqueado' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{status}</span></td>
                  <td>{formatDateTime(user.last_access_at)}</td>
                  <td>{formatDateTime(user.created_at)}</td>
                  <td>{user.created_by || '-'}</td>
                  <td className="pr-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" onClick={() => setEditing(user)}>Editar</Button>
                      <Button variant="secondary" onClick={async () => { const password = window.prompt('Nueva contrasena temporal'); if (password) { await actions.resetUserPassword(user.id, password); setMessage('Contrasena temporal actualizada.'); } }}>Restablecer contrasena</Button>
                      {status === 'Activo'
                        ? <Button variant="secondary" disabled={isCurrentUser} onClick={() => deactivateUser(user)}>Desactivar usuario</Button>
                        : <Button variant="secondary" onClick={() => reactivateUser(user)}>Reactivar usuario</Button>}
                      {status !== 'Bloqueado' && <Button variant="secondary" disabled={isCurrentUser} onClick={() => blockUser(user)}>Bloquear</Button>}
                      <Button variant="danger" disabled={isCurrentUser} onClick={() => deleteUser(user)}>Eliminar</Button>
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

function emptyUser(currentUser) {
  return { first_name: '', last_name: '', email: '', password: 'Temporal2026!', phone: '', role: 'Voluntario', position: 'Voluntario', status: 'Activo', is_active: true, permissions: ROLE_PERMISSIONS.Voluntario, permission_matrix: ROLE_PERMISSION_MATRIX.Voluntario, profile_photo: '', last_access_at: '', created_by: currentUser?.email || 'Sistema', created_at: new Date().toISOString() };
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
        await onSubmit(form);
      } catch (err) {
        setError(normalizeUserError(err));
      }
    }}>
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
      <FormField label="Nombre"><input className={inputClass} required value={form.first_name || ''} onChange={(event) => update('first_name', event.target.value)} /></FormField>
      <FormField label="Apellidos"><input className={inputClass} value={form.last_name || ''} onChange={(event) => update('last_name', event.target.value)} /></FormField>
      <FormField label="Email"><input className={inputClass} type="email" required value={form.email || ''} onChange={(event) => update('email', event.target.value)} /></FormField>
      <FormField label="Telefono"><input className={inputClass} value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} /></FormField>
      <FormField label="Cargo"><input className={inputClass} value={form.position || ''} onChange={(event) => update('position', event.target.value)} /></FormField>
      <FormField label="Contrasena temporal"><input className={inputClass} type="password" value={form.password || ''} onChange={(event) => update('password', event.target.value)} /></FormField>
      <FormField label="Rol"><select className={inputClass} value={form.role || 'Voluntario'} onChange={(event) => updateRole(event.target.value)}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></FormField>
      <FormField label="Estado"><select className={inputClass} value={form.status || (form.is_active ? 'Activo' : 'Inactivo')} onChange={(event) => { update('status', event.target.value); update('is_active', event.target.value === 'Activo'); }}><option>Activo</option><option>Inactivo</option><option>Bloqueado</option></select></FormField>
      <FormField label="Foto de perfil opcional"><input className={inputClass} type="file" accept="image/*" onChange={(event) => updatePhoto(event.target.files?.[0])} /></FormField>
      <FormField label="Creado por"><input className={inputClass} value={form.created_by || ''} onChange={(event) => update('created_by', event.target.value)} /></FormField>
      {form.profile_photo && <div className="sm:col-span-2"><img src={form.profile_photo} alt="" className="h-16 w-16 rounded-full object-cover" /></div>}
      <div className="sm:col-span-2"><PermissionEditor value={form.permission_matrix || ROLE_PERMISSION_MATRIX[form.role] || {}} onChange={(matrix) => update('permission_matrix', matrix)} /></div>
      <div className="flex justify-end sm:col-span-2"><Button type="submit">Guardar usuario</Button></div>
    </form>
  );
}

function PermissionEditor({ value, onChange }) {
  function toggle(moduleId, actionId) {
    onChange({ ...value, [moduleId]: { ...(value[moduleId] || {}), [actionId]: !value[moduleId]?.[actionId] } });
  }
  return <div><p className="mb-2 text-sm font-medium text-slate-700">Permisos por modulo</p><div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Modulo</th>{PERMISSION_ACTIONS.map((action) => <th key={action.id} className="px-3 py-2">{action.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{PERMISSION_MODULES.map((module) => <tr key={module.id}><td className="px-3 py-2 font-medium">{module.label}</td>{PERMISSION_ACTIONS.map((action) => <td key={action.id} className="px-3 py-2 text-center"><input type="checkbox" checked={Boolean(value[module.id]?.[action.id])} onChange={() => toggle(module.id, action.id)} /></td>)}</tr>)}</tbody></table></div></div>;
}

function PermissionsMatrix({ users, actions, setMessage }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(users.map((user) => [user.id, user.permission_matrix || ROLE_PERMISSION_MATRIX[user.role] || {}])));
  return <div className="space-y-4">{users.map((user) => <div key={user.id} className="rounded-md border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-semibold">{user.first_name} {user.last_name}</p><p className="text-sm text-slate-500">{user.email} · {user.role}</p></div><Button variant="secondary" onClick={async () => { await actions.updateUser(user.id, { ...user, permission_matrix: drafts[user.id] }); setMessage('Permisos actualizados.'); }}>Guardar permisos</Button></div><PermissionEditor value={drafts[user.id] || {}} onChange={(matrix) => setDrafts((state) => ({ ...state, [user.id]: matrix }))} /></div>)}</div>;
}

function AuditTable({ logs }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Usuario</th><th>Fecha</th><th>Accion realizada</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map((log) => <tr key={log.id}><td className="px-4 py-3">{log.user_name || log.user_email || '-'}</td><td>{formatDateTime(log.happened_at)}</td><td>{log.action}</td></tr>)}{!logs.length && <tr><td className="px-4 py-5 text-center text-slate-500" colSpan="3">Sin auditoria registrada.</td></tr>}</tbody></table></div>;
}

async function sendWelcomeEmail(user, organization) {
  try {
    const logoUrl = typeof window !== 'undefined' ? new URL(officialLogoUrl, window.location.origin).toString() : undefined;
    await fetch('/api/send-justificantes', {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({
        testMode: true,
        to: user.email,
        subject: 'Bienvenida a Pan y Esperanza',
        message: `Hola ${user.first_name}, tu usuario se ha creado correctamente. Contrasena temporal: ${user.password}`,
        logoUrl,
        organization
      })
    });
  } catch (error) {
    console.warn('[usuarios] No se pudo enviar bienvenida', error);
  }
}

function normalizeUserError(error) {
  const message = error?.message || '';
  if (message.includes('duplicate key') || message.includes('app_users_email_key')) return 'Ya existe un usuario registrado con ese email.';
  if (message.includes('status')) return 'No se pudo guardar el estado del usuario. Ejecute la migracion 20260622_user_status_management.sql en Supabase.';
  if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Servicio de usuarios no configurado')) return 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel y redepliegue.';
  if (message.includes('Sesion de administrador requerida') || message.includes('Sesion no valida')) return 'Sesion de administrador no valida. Cierre sesion y vuelva a entrar.';
  if (message.includes('No tiene permisos')) return 'No tiene permisos para administrar usuarios.';
  return message || 'No se pudo registrar el usuario. Revise los datos e intentelo de nuevo.';
}
