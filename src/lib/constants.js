export const HELP_TYPES = ['Alimentos', 'Higiene', 'Ropa', 'Ayuda economica', 'Otra ayuda'];
export const BENEFICIARY_SITUATIONS = ['Activa', 'Urgente', 'Prioritario', 'Seguimiento', 'Vulnerable', 'Inactiva'];
export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'beneficiaries', label: 'Beneficiarios', path: '/beneficiaries' },
  { id: 'communications', label: 'Comunicaciones', path: '/communications' },
  { id: 'families', label: 'Familias', path: '/families' },
  { id: 'deliveries', label: 'Entregas', path: '/deliveries' },
  { id: 'receipts', label: 'Justificantes', path: '/receipts' },
  { id: 'inventory', label: 'Inventario', path: '/inventory' },
  { id: 'donations', label: 'Donaciones', path: '/donations' },
  { id: 'treasury', label: 'TESORERIA', path: '/treasury' },
  { id: 'volunteers', label: 'Voluntarios', path: '/volunteers' },
  { id: 'reports', label: 'Informes', path: '/reports' },
  { id: 'users', label: 'Usuarios', path: '/users' },
  { id: 'settings', label: 'Configuracion', path: '/settings' },
  { id: 'backup', label: 'Copias', path: '/backup' }
];

export function getModuleByPath(pathname) {
  const normalized = pathname !== '/' ? pathname.replace(/\/$/, '') : pathname;
  return MODULES.find((module) => module.path === normalized)?.id || null;
}

export function getModulePath(moduleId) {
  return MODULES.find((module) => module.id === moduleId)?.path || '/';
}

export const DOCUMENT_TYPES = ['DNI/NIE / NIE O PASAPORTE', 'Empadronamiento', 'Familia numerosa', 'Discapacidad', 'Otros documentos'];
export const ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinadora', 'Voluntario'];

export const PERMISSION_MODULES = [
  { id: 'dashboard', label: 'Ver Dashboard', actions: ['view'] },
  { id: 'beneficiaries', label: 'Beneficiarios' },
  { id: 'communications', label: 'Comunicaciones' },
  { id: 'families', label: 'Familias' },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'receipts', label: 'Justificantes' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'donations', label: 'Donaciones' },
  { id: 'treasury', label: 'Tesoreria' },
  { id: 'volunteers', label: 'Voluntarios' },
  { id: 'reports', label: 'Informes' },
  { id: 'users', label: 'Usuarios' },
  { id: 'settings', label: 'Configuracion' },
  { id: 'backup', label: 'Copias de seguridad' }
];

export const PERMISSION_ACTIONS = [
  { id: 'view', label: 'Ver' },
  { id: 'create', label: 'Crear' },
  { id: 'edit', label: 'Editar' },
  { id: 'delete', label: 'Eliminar' }
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

export const ROLE_PERMISSIONS = {
  Superadministrador: ['*'],
  Presidenta: ['beneficiaries', 'communications', 'families', 'deliveries', 'receipts', 'inventory', 'donations', 'treasury', 'reports', 'users', 'settings'],
  Secretaria: ['beneficiaries', 'communications', 'families', 'receipts', 'reports', 'users', 'settings'],
  Tesorera: ['donations', 'treasury', 'reports', 'receipts', 'communications'],
  Coordinadora: ['beneficiaries', 'communications', 'families', 'deliveries', 'receipts', 'inventory', 'reports'],
  Voluntario: ['beneficiaries', 'communications', 'deliveries', 'inventory', 'treasury']
};

export const LEGACY_ROLE_PERMISSIONS = {
  Presidente: ROLE_PERMISSIONS.Presidenta,
  Secretario: ROLE_PERMISSIONS.Secretaria,
  Tesorero: ROLE_PERMISSIONS.Tesorera,
  Administrador: ROLE_PERMISSIONS.Presidenta,
  Coordinador: ['beneficiaries', 'communications', 'families', 'deliveries', 'receipts', 'inventory', 'treasury', 'reports'],
  Consulta: ['reports']
};

export const ROLE_PERMISSION_MATRIX = {
  Superadministrador: buildPermissionMatrix(['*'], ['*']),
  Presidenta: buildPermissionMatrix(ROLE_PERMISSIONS.Presidenta, ['view', 'create', 'edit', 'delete']),
  Secretaria: buildPermissionMatrix(ROLE_PERMISSIONS.Secretaria, ['view', 'create', 'edit']),
  Tesorera: buildPermissionMatrix(ROLE_PERMISSIONS.Tesorera, ['view', 'create', 'edit', 'delete']),
  Coordinadora: buildPermissionMatrix(ROLE_PERMISSIONS.Coordinadora, ['view', 'create', 'edit']),
  Voluntario: buildPermissionMatrix(ROLE_PERMISSIONS.Voluntario, ['view'])
};
