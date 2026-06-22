export const HELP_TYPES = ['Alimentos', 'Higiene', 'Ropa', 'Ayuda economica', 'Otra ayuda'];
export const BENEFICIARY_SITUATIONS = ['Activa', 'Urgente', 'Seguimiento', 'Inactiva'];
export const MODULES = [
  { id: 'dashboard', label: 'Panel' },
  { id: 'settings', label: 'Entidad' },
  { id: 'beneficiaries', label: 'Beneficiarios' },
  { id: 'communications', label: 'Comunicaciones' },
  { id: 'families', label: 'Familias' },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'receipts', label: 'Justificantes' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'donations', label: 'Donaciones' },
  { id: 'treasury', label: 'TESORERIA' },
  { id: 'volunteers', label: 'Voluntarios' },
  { id: 'reports', label: 'Informes' },
  { id: 'backup', label: 'Copias' }
];

export const DOCUMENT_TYPES = ['DNI/NIE / NIE O PASAPORTE', 'Empadronamiento', 'Familia numerosa', 'Discapacidad', 'Otros documentos'];
export const ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Voluntario'];

export const PERMISSION_MODULES = [
  { id: 'beneficiaries', label: 'Beneficiarios' },
  { id: 'communications', label: 'Comunicaciones' },
  { id: 'families', label: 'Familias' },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'receipts', label: 'Justificantes' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'donations', label: 'Donaciones' },
  { id: 'treasury', label: 'Tesoreria' },
  { id: 'reports', label: 'Informes' },
  { id: 'users', label: 'Usuarios' },
  { id: 'settings', label: 'Configuracion' }
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
    Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action.id, modules.includes('*') || modules.includes(module.id) ? actions.includes('*') || actions.includes(action.id) : false]))
  ]));
}

export const ROLE_PERMISSIONS = {
  Superadministrador: ['*'],
  Presidenta: ['beneficiaries', 'communications', 'families', 'deliveries', 'receipts', 'inventory', 'donations', 'treasury', 'reports', 'users', 'settings'],
  Secretaria: ['beneficiaries', 'communications', 'families', 'receipts', 'reports', 'users', 'settings'],
  Tesorera: ['donations', 'treasury', 'reports', 'receipts', 'communications'],
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
  Voluntario: buildPermissionMatrix(ROLE_PERMISSIONS.Voluntario, ['view'])
};
