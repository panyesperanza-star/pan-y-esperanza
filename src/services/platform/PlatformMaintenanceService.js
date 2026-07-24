import { isPlatformOwner, PLATFORM_OWNER_PROVIDER } from '../../lib/auth';

export const PLATFORM_MAINTENANCE_OPERATIONS = [
  {
    id: 'reset-accounting',
    label: 'Reiniciar contabilidad',
    scope: 'Contabilidad',
    risk: 'critico',
    confirmationPhrase: 'CONFIRMAR REINICIO CONTABILIDAD'
  },
  {
    id: 'reset-inventory',
    label: 'Reiniciar inventario',
    scope: 'Inventario',
    risk: 'critico',
    confirmationPhrase: 'CONFIRMAR REINICIO INVENTARIO'
  },
  {
    id: 'reset-donations',
    label: 'Reiniciar donaciones',
    scope: 'Donaciones',
    risk: 'alto',
    confirmationPhrase: 'CONFIRMAR REINICIO DONACIONES'
  },
  {
    id: 'reset-agenda',
    label: 'Reiniciar agenda',
    scope: 'Agenda',
    risk: 'alto',
    confirmationPhrase: 'CONFIRMAR REINICIO AGENDA'
  },
  {
    id: 'reset-campaigns',
    label: 'Reiniciar campañas',
    scope: 'Campañas',
    risk: 'alto',
    confirmationPhrase: 'CONFIRMAR REINICIO CAMPANAS'
  },
  {
    id: 'reset-notifications',
    label: 'Reiniciar notificaciones',
    scope: 'Notificaciones',
    risk: 'alto',
    confirmationPhrase: 'CONFIRMAR REINICIO NOTIFICACIONES'
  },
  {
    id: 'reset-deliveries',
    label: 'Reiniciar entregas',
    scope: 'Entregas',
    risk: 'critico',
    confirmationPhrase: 'CONFIRMAR REINICIO ENTREGAS'
  },
  {
    id: 'reset-organization',
    label: 'Reinicio completo de una organización',
    scope: 'Organización',
    risk: 'critico',
    confirmationPhrase: 'CONFIRMAR REINICIO COMPLETO'
  }
];

export class PlatformMaintenanceService {
  constructor({
    repository,
    currentUser,
    verifyPassword = async () => true,
    audit = async () => {}
  } = {}) {
    if (!repository) throw new Error('PlatformMaintenanceService necesita un repository.');
    this.repository = repository;
    this.currentUser = currentUser;
    this.verifyPassword = verifyPassword;
    this.audit = audit;
  }

  async listLogs() {
    this.assertPlatformOwner();
    return this.repository.listLogs();
  }

  async prepareOperation(payload = {}) {
    this.assertPlatformOwner();
    const operation = getPlatformMaintenanceOperation(payload.operationId);
    const reason = String(payload.reason || '').trim();
    const confirmation = String(payload.confirmation || '').trim();
    if (confirmation !== operation.confirmationPhrase) {
      throw new Error(`Frase de confirmación incorrecta. Escribe exactamente: ${operation.confirmationPhrase}`);
    }
    if (reason.length < 10) {
      throw new Error('Indica un motivo de mantenimiento de al menos 10 caracteres.');
    }

    try {
      await this.verifyPassword(payload.password, this.currentUser);
    } catch (error) {
      await this.writeLog({
        operation,
        reason,
        status: 'password_failed',
        result: 'Contraseña no validada. Operación no ejecutada.',
        userAgent: payload.userAgent
      });
      throw error;
    }

    const log = await this.writeLog({
      operation,
      reason,
      status: 'prepared',
      result: 'Infraestructura preparada. Operación crítica no ejecutada porque la lógica de limpieza aún no está implementada.',
      userAgent: payload.userAgent
    });
    await this.audit(`Platform Owner prepar? ${operation.label}. Motivo: ${reason}`);
    return {
      log,
      operation,
      message: 'Operación registrada. No se ha ejecutado ninguna limpieza.'
    };
  }

  assertPlatformOwner() {
    if (!isPlatformOwner(this.currentUser)) {
      throw new Error('Solo el Platform Owner de ALTHEMON puede acceder a Herramientas de Plataforma.');
    }
  }

  async writeLog({ operation, reason, status, result, userAgent }) {
    return this.repository.createLog({
      operation_id: operation.id,
      operation_label: operation.label,
      operation_scope: operation.scope,
      risk_level: operation.risk,
      status,
      reason,
      result,
      provider: PLATFORM_OWNER_PROVIDER,
      requested_by: this.currentUser?.id || null,
      user_name: `${this.currentUser?.first_name || ''} ${this.currentUser?.last_name || ''}`.trim() || this.currentUser?.email || 'Platform Owner',
      user_email: this.currentUser?.email || '',
      user_role: this.currentUser?.role || '',
      user_agent: String(userAgent || ''),
      metadata: {
        confirmation_required: true,
        password_required: true,
        cleanup_logic_enabled: false
      },
      created_at: new Date().toISOString()
    });
  }
}

export function getPlatformMaintenanceOperation(operationId) {
  const operation = PLATFORM_MAINTENANCE_OPERATIONS.find((item) => item.id === operationId);
  if (!operation) throw new Error('Operación de plataforma no reconocida.');
  return operation;
}
