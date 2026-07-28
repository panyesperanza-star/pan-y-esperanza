export const HELP_TYPES = ['Alimentos', 'Higiene', 'Ropa', 'Ayuda económica', 'Otra ayuda'];
export const BENEFICIARY_SITUATIONS = ['Activa', 'Urgente', 'Prioritario', 'Seguimiento', 'Vulnerable', 'Inactiva'];
export const MODULES = [
  { id: 'dashboard', label: 'Centro de operaciones', path: '/dashboard' },
  { id: 'notifications', label: 'Centro de Notificaciones', path: '/notifications' },
  { id: 'social-care', label: 'Centro de Atencion Social', path: '/social-care' },
  { id: 'agenda', label: 'Agenda Operativa', path: '/agenda' },
  { id: 'beneficiaries', label: 'Beneficiarios', path: '/beneficiaries' },
  { id: 'communications', label: 'Comunicaciones', path: '/communications' },
  { id: 'families', label: 'Familias', path: '/families' },
  { id: 'deliveries', label: 'Entregas', path: '/deliveries' },
  { id: 'credential-scanner', label: 'Escanear credencial', path: '/credential-scanner' },
  { id: 'receipts', label: 'Justificantes', path: '/receipts' },
  { id: 'inventory', label: 'Inventario', path: '/inventory' },
  { id: 'donations', label: 'Donaciones', path: '/donations' },
  { id: 'donors', label: 'Donantes', path: '/donors' },
  { id: 'accounting', label: 'Contabilidad', path: '/accounting' },
  { id: 'volunteers', label: 'Voluntarios', path: '/volunteers' },
  { id: 'collaborators', label: 'Colaboradores', path: '/collaborators' },
  { id: 'reports', label: 'Informes', path: '/reports' },
  { id: 'users', label: 'Usuarios', path: '/users' },
  { id: 'settings', label: 'Configuración', path: '/settings' },
  { id: 'backup', label: 'Copias', path: '/backup' },
  { id: 'provider', label: 'Panel del proveedor', path: '/provider' },
  { id: 'platform-tools', label: 'Herramientas de Plataforma', path: '/platform-tools', hidden: true }
];

export function getModuleByPath(pathname) {
  const normalized = pathname !== '/' ? pathname.replace(/\/$/, '') : pathname;
  if (normalized === '/treasury') return 'accounting';
  return MODULES.find((module) => module.path === normalized)?.id || null;
}

export function getModulePath(moduleId) {
  return MODULES.find((module) => module.id === moduleId)?.path || '/';
}

export const DOCUMENT_TYPES = ['DNI/NIE / NIE O PASAPORTE', 'Empadronamiento', 'Familia numerosa', 'Discapacidad', 'Otros documentos'];
export const ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinadora', 'Voluntario'];

const READ_ONLY = ['view'];
const CRUD = ['view', 'create', 'edit', 'delete'];

export const PERMISSION_MODULES = [
  { id: 'dashboard', label: 'Ver Centro de operaciones', actions: READ_ONLY },
  { id: 'notifications', label: 'Centro de Notificaciones', actions: ['view', 'edit', 'send', 'resolve'] },
  { id: 'social-care', label: 'Centro de Atencion Social', actions: ['view', 'edit', 'assign', 'contact', 'send', 'resolve'] },
  { id: 'agenda', label: 'Agenda Operativa', actions: CRUD },
  { id: 'beneficiaries', label: 'Beneficiarios', actions: [...CRUD, 'activate', 'contact', 'manage-documents', 'generate-credential', 'print', 'send', 'export'] },
  { id: 'communications', label: 'Comunicaciones', actions: ['view', 'create', 'edit', 'send', 'export'] },
  { id: 'families', label: 'Familias', actions: [...CRUD, 'archive'] },
  { id: 'deliveries', label: 'Entregas', actions: [...CRUD, 'confirm', 'sign', 'generate-receipt', 'print', 'export'] },
  { id: 'credential-scanner', label: 'Escanear credencial', actions: ['view', 'scan', 'manual-identify', 'register-delivery'] },
  { id: 'receipts', label: 'Justificantes', actions: ['view', 'print', 'send', 'export'] },
  { id: 'inventory', label: 'Inventario', actions: [...CRUD, 'register-movement', 'export'] },
  { id: 'donations', label: 'Donaciones', actions: [...CRUD, 'export'] },
  { id: 'donors', label: 'Donantes', actions: [...CRUD, 'activate', 'generate-credential', 'print', 'send', 'export'] },
  { id: 'accounting', label: 'Contabilidad', actions: [...CRUD, 'print', 'export'] },
  { id: 'volunteers', label: 'Voluntarios', actions: [...CRUD, 'archive', 'generate-credential', 'print', 'export'] },
  { id: 'collaborators', label: 'Colaboradores', actions: [...CRUD, 'activate', 'generate-credential', 'print', 'send', 'export'] },
  { id: 'reports', label: 'Informes', actions: ['view', 'print', 'export'] },
  { id: 'users', label: 'Usuarios', actions: [...CRUD, 'reset-password', 'manage-permissions'] },
  { id: 'settings', label: 'Configuración', actions: ['view', 'edit', 'test', 'send'] },
  { id: 'backup', label: 'Copias de seguridad', actions: ['view', 'export', 'restore'] },
  { id: 'provider', label: 'Panel del proveedor', actions: ['view', 'approve', 'reject'] },
  { id: 'platform-tools', label: 'Herramientas de Plataforma', actions: ['view', 'execute'] }
];

export const PERMISSION_ACTIONS = [
  { id: 'view', label: 'Ver' },
  { id: 'create', label: 'Crear' },
  { id: 'edit', label: 'Editar' },
  { id: 'delete', label: 'Eliminar' },
  { id: 'activate', label: 'Activar' },
  { id: 'archive', label: 'Archivar' },
  { id: 'assign', label: 'Asignar' },
  { id: 'contact', label: 'Contactar' },
  { id: 'send', label: 'Enviar' },
  { id: 'resolve', label: 'Resolver' },
  { id: 'confirm', label: 'Confirmar' },
  { id: 'sign', label: 'Firmar' },
  { id: 'generate-receipt', label: 'Justificante' },
  { id: 'generate-credential', label: 'Credencial' },
  { id: 'manage-documents', label: 'Documentos' },
  { id: 'register-movement', label: 'Movimiento' },
  { id: 'scan', label: 'Escanear' },
  { id: 'manual-identify', label: 'Identificar' },
  { id: 'register-delivery', label: 'Registrar entrega' },
  { id: 'print', label: 'Imprimir' },
  { id: 'export', label: 'Exportar' },
  { id: 'reset-password', label: 'Contraseña' },
  { id: 'manage-permissions', label: 'Permisos' },
  { id: 'test', label: 'Probar' },
  { id: 'restore', label: 'Restaurar' },
  { id: 'approve', label: 'Aprobar' },
  { id: 'reject', label: 'Rechazar' },
  { id: 'execute', label: 'Ejecutar' }
];

export function buildPermissionMatrix(modules = [], actions = ['view']) {
  return Object.fromEntries(PERMISSION_MODULES.map((module) => [
    module.id,
    Object.fromEntries(PERMISSION_ACTIONS.map((action) => [
      action.id,
      (module.actions || PERMISSION_ACTIONS.map((item) => item.id)).includes(action.id)
        && (modules.includes('*') || modules.includes(module.id))
        && (actions.includes('*') || actions.includes(action.id))
    ]))
  ]));
}

function withModulePermissions(matrix, moduleId, permissions) {
  return {
    ...matrix,
    [moduleId]: {
      ...(matrix[moduleId] || {}),
      ...permissions
    }
  };
}

export function isRoleActionAllowed(role, moduleId, actionId) {
  if (moduleId === 'accounting') {
    if (actionId === 'delete') return role === 'Superadministrador';
    if (role === 'Voluntario') return actionId === 'view';
    if (role === 'Coordinadora' || role === 'Coordinador') return actionId === 'view';
    return true;
  }
  if (moduleId !== 'inventory' || role === 'Superadministrador') return true;
  if (actionId === 'delete') return false;
  if (role === 'Voluntario') return actionId === 'view';
  if (role === 'Coordinadora' || role === 'Coordinador') {
    return actionId === 'view' || actionId === 'create';
  }
  return true;
}

export function constrainRolePermissionMatrix(role, matrix = {}) {
  return Object.fromEntries(Object.entries(matrix).map(([moduleId, actions]) => [
    moduleId,
    Object.fromEntries(Object.entries(actions || {}).map(([actionId, enabled]) => [
      actionId,
      Boolean(enabled) && isRoleActionAllowed(role, moduleId, actionId)
    ]))
  ]));
}

export const ROLE_PERMISSIONS = {
  Superadministrador: ['*'],
  Presidenta: ['notifications', 'social-care', 'agenda', 'beneficiaries', 'communications', 'families', 'deliveries', 'credential-scanner', 'receipts', 'inventory', 'donations', 'donors', 'accounting', 'volunteers', 'collaborators', 'reports', 'users', 'settings'],
  Secretaria: ['notifications', 'social-care', 'agenda', 'beneficiaries', 'communications', 'families', 'receipts', 'reports', 'users', 'settings'],
  Tesorera: ['notifications', 'agenda', 'donations', 'donors', 'accounting', 'collaborators', 'reports', 'receipts', 'communications'],
  Coordinadora: ['notifications', 'social-care', 'agenda', 'beneficiaries', 'communications', 'families', 'deliveries', 'credential-scanner', 'receipts', 'inventory', 'accounting', 'volunteers', 'collaborators', 'donors', 'reports'],
  Voluntario: ['notifications', 'social-care', 'agenda', 'beneficiaries', 'communications', 'deliveries', 'credential-scanner', 'inventory', 'accounting']
};

export const LEGACY_ROLE_PERMISSIONS = {
  Presidente: ROLE_PERMISSIONS.Presidenta,
  Secretario: ROLE_PERMISSIONS.Secretaria,
  Tesorero: ROLE_PERMISSIONS.Tesorera,
  Administrador: ROLE_PERMISSIONS.Presidenta,
  Coordinador: ['notifications', 'social-care', 'agenda', 'beneficiaries', 'communications', 'families', 'deliveries', 'credential-scanner', 'receipts', 'inventory', 'accounting', 'volunteers', 'collaborators', 'donors', 'reports'],
  Consulta: ['notifications', 'agenda', 'reports']
};

export const ROLE_PERMISSION_MATRIX = {
  Superadministrador: buildPermissionMatrix(['*'], ['*']),
  Presidenta: withModulePermissions(
    buildPermissionMatrix(ROLE_PERMISSIONS.Presidenta, ['*']),
    'inventory',
    { delete: false }
  ),
  Secretaria: buildPermissionMatrix(ROLE_PERMISSIONS.Secretaria, ['view', 'create', 'edit', 'print', 'send', 'export', 'manage-documents', 'generate-credential', 'reset-password', 'manage-permissions']),
  Tesorera: buildPermissionMatrix(ROLE_PERMISSIONS.Tesorera, ['*']),
  Coordinadora: withModulePermissions(
    withModulePermissions(
      buildPermissionMatrix(ROLE_PERMISSIONS.Coordinadora, ['view', 'create', 'edit', 'activate', 'archive', 'assign', 'contact', 'send', 'resolve', 'confirm', 'sign', 'generate-receipt', 'generate-credential', 'manage-documents', 'register-movement', 'scan', 'manual-identify', 'register-delivery', 'print', 'export']),
      'accounting',
      { create: false, edit: false, delete: false }
    ),
    'inventory',
    { edit: false, delete: false }
  ),
  Voluntario: withModulePermissions(
    buildPermissionMatrix(ROLE_PERMISSIONS.Voluntario, ['view']),
    'credential-scanner',
    { scan: true, 'manual-identify': true }
  ),
  Administrador: withModulePermissions(
    buildPermissionMatrix(LEGACY_ROLE_PERMISSIONS.Administrador, ['*']),
    'inventory',
    { delete: false }
  ),
  Coordinador: withModulePermissions(
    withModulePermissions(
      buildPermissionMatrix(LEGACY_ROLE_PERMISSIONS.Coordinador, ['view', 'create', 'edit', 'activate', 'archive', 'assign', 'contact', 'send', 'resolve', 'confirm', 'sign', 'generate-receipt', 'generate-credential', 'manage-documents', 'register-movement', 'scan', 'manual-identify', 'register-delivery', 'print', 'export']),
      'accounting',
      { create: false, edit: false, delete: false }
    ),
    'inventory',
    { edit: false, delete: false }
  )
};
