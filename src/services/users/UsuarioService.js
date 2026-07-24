import { getUserStatus, isPlatformOwner, isSystemSuperadmin } from '../../lib/auth';
import {
  constrainRolePermissionMatrix,
  ROLE_PERMISSION_MATRIX,
  ROLE_PERMISSIONS
} from '../../lib/constants';

export function sanitizeUserPayload(payload) {
  const status = payload.status || (payload.is_active === false ? 'Inactivo' : 'Activo');
  return {
    ...payload,
    permission_matrix: constrainRolePermissionMatrix(payload.role, payload.permission_matrix || {}),
    status,
    is_active: status === 'Activo'
  };
}

export function isLastActiveSuperadmin(users, userId) {
  const existing = users.find((user) => user.id === userId);
  return existing?.role === 'Superadministrador'
    && users.filter((user) => user.role === 'Superadministrador' && user.is_active && (user.status || 'Activo') === 'Activo' && user.id !== userId).length === 0;
}

export function viewPermissionsFromMatrix(matrix = {}, role = '') {
  if (role === 'Superadministrador') return ['*'];
  return Object.entries(matrix).filter(([, actions]) => actions?.view).map(([moduleId]) => moduleId);
}

export function createEmptyUser(currentUser) {
  return {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'Voluntario',
    position: 'Voluntario',
    status: 'Activo',
    is_active: true,
    permissions: ROLE_PERMISSIONS.Voluntario,
    permission_matrix: ROLE_PERMISSION_MATRIX.Voluntario,
    profile_photo: '',
    last_access_at: '',
    created_by: currentUser?.email || 'Sistema',
    created_at: new Date().toISOString()
  };
}

export function buildUsersViewModel(users = []) {
  const associationUsers = users.filter((user) => !isSystemSuperadmin(user) && !isPlatformOwner(user));
  return {
    associationUsers,
    activeUsers: associationUsers.filter((user) => getUserStatus(user) === 'Activo'),
    inactiveUsers: associationUsers.filter((user) => getUserStatus(user) === 'Inactivo'),
    blockedUsers: associationUsers.filter((user) => getUserStatus(user) === 'Bloqueado')
  };
}

export function filterUsersByStatus(users = [], filter = 'active') {
  return users.filter((user) => {
    const status = getUserStatus(user);
    if (filter === 'active') return status === 'Activo';
    if (filter === 'inactive') return status === 'Inactivo';
    if (filter === 'blocked') return status === 'Bloqueado';
    return true;
  });
}

export function normalizeUserError(error) {
  const message = error?.message || '';
  if (message.includes('duplicate key') || message.includes('app_users_email_key')) return 'Ya existe un usuario registrado con ese email.';
  if (message.includes('status')) return 'No se pudo guardar el estado del usuario. Ejecute la migracion 20260622_user_status_management.sql en Supabase.';
  if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Servicio de usuarios no configurado')) return 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Supabase Edge Functions y redepliegue.';
  if (message.includes('Sesion de administrador requerida') || message.includes('Sesion no valida')) return 'Sesion de administrador no valida. Cierre sesion y vuelva a entrar.';
  if (message.includes('No tiene permisos')) return 'No tiene permisos para administrar usuarios.';
  return message || 'No se pudo registrar el usuario. Revise los datos e intentelo de nuevo.';
}

export class UsuarioService {
  constructor({ repository, users = [], audit = async () => {} } = {}) {
    if (!repository) throw new Error('UsuarioService necesita un repository.');
    this.repository = repository;
    this.users = users;
    this.audit = audit;
  }

  async create(payload) {
    const cleanPayload = sanitizeUserPayload(payload);
    await this.repository.create(cleanPayload);
    await this.audit(`Creo usuario ${payload.email || ''}`.trim());
  }

  async update(id, payload) {
    const cleanPayload = sanitizeUserPayload(payload);
    this.assertNotLastActiveSuperadmin(id, cleanPayload.is_active === false, 'No se puede desactivar al ultimo Superadministrador.');
    await this.repository.update(id, cleanPayload);
    await this.audit(`Edito usuario ${cleanPayload.email || ''}`.trim());
  }

  async deactivate(id) {
    const existing = this.findById(id);
    this.assertNotLastActiveSuperadmin(id, true, 'No se puede desactivar al ultimo Superadministrador.');
    await this.repository.deactivate(id);
    await this.audit(`Usuario desactivado: ${existing?.email || ''}`.trim());
  }

  async reactivate(id) {
    const existing = this.findById(id);
    await this.repository.reactivate(id);
    await this.audit(`Usuario reactivado: ${existing?.email || ''}`.trim());
  }

  async block(id) {
    const existing = this.findById(id);
    this.assertNotLastActiveSuperadmin(id, true, 'No se puede bloquear al ultimo Superadministrador.');
    await this.repository.block(id);
    await this.audit(`Usuario bloqueado: ${existing?.email || ''}`.trim());
  }

  async remove(id) {
    const existing = this.findById(id);
    this.assertNotLastActiveSuperadmin(id, true, 'No se puede eliminar al ultimo Superadministrador activo.');
    await this.repository.remove(id);
    await this.audit(`Usuario eliminado: ${existing?.email || ''}`.trim());
  }

  async resetPassword(id, password) {
    await this.repository.resetPassword(id, password);
    await this.audit('Restableció contraseña de usuario');
  }

  async updateLastAccess(id) {
    await this.repository.updateLastAccess(id);
    await this.audit('Inicio sesion');
  }

  async createAuditLog(payload) {
    await this.repository.createAuditLog(payload);
  }

  async sendWelcomeEmail(user, organization, logoUrl) {
    try {
      await this.repository.sendWelcomeEmail({ user, organization, logoUrl });
    } catch (error) {
      console.warn('[usuarios] No se pudo enviar bienvenida', error);
    }
  }

  findById(id) {
    return this.users.find((user) => user.id === id);
  }

  assertNotLastActiveSuperadmin(id, shouldValidate, message) {
    if (shouldValidate && isLastActiveSuperadmin(this.users, id)) {
      throw new Error(message);
    }
  }
}
