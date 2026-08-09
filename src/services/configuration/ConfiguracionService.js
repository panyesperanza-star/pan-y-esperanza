function cleanText(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function assertEmail(value, label) {
  const email = cleanEmail(value);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${label} no tiene un formato valido.`);
  }
  return email;
}

export function isDeliverySignatureRequired(settings = {}) {
  const deliveryPreferences = settings.erp_preferences?.deliveries || {};
  return settings.require_delivery_signature === true
    || settings.digital_signature_required === true
    || deliveryPreferences.require_digital_signature === true;
}

export function sanitizeConfigurationPayload(payload = {}, current = {}) {
  const next = {
    ...current,
    ...payload,
    id: payload.id || current.id || 'main',
    name: cleanText(payload.name ?? current.name),
    cif: cleanText(payload.cif ?? current.cif),
    address: cleanText(payload.address ?? current.address),
    phone: cleanText(payload.phone ?? current.phone),
    email: assertEmail(payload.email ?? current.email, 'El correo de la entidad'),
    website: cleanText(payload.website ?? current.website),
    logo_path: cleanText(payload.logo_path ?? current.logo_path),
    mail_sender_name: cleanText(payload.mail_sender_name ?? current.mail_sender_name),
    mail_sender_email: assertEmail(payload.mail_sender_email ?? current.mail_sender_email, 'El correo remitente'),
    mail_provider: cleanText(payload.mail_provider ?? current.mail_provider ?? 'Resend'),
    smtp_host: cleanText(payload.smtp_host ?? current.smtp_host),
    smtp_port: payload.smtp_port === '' || payload.smtp_port === undefined ? current.smtp_port : Number(payload.smtp_port),
    smtp_user: cleanText(payload.smtp_user ?? current.smtp_user),
    smtp_password: cleanText(payload.smtp_password ?? current.smtp_password),
    smtp_secure: payload.smtp_secure === true || payload.smtp_secure === 'true',
    paypal_settings: payload.paypal_settings ?? current.paypal_settings,
    bizum_settings: payload.bizum_settings ?? current.bizum_settings,
    stripe_settings: payload.stripe_settings ?? current.stripe_settings,
    donation_payment_methods: Array.isArray(payload.donation_payment_methods)
      ? payload.donation_payment_methods.map(cleanText).filter(Boolean)
      : current.donation_payment_methods,
    resend_settings: payload.resend_settings ?? current.resend_settings,
    supabase_settings: payload.supabase_settings ?? current.supabase_settings,
    public_variables: payload.public_variables ?? current.public_variables,
    erp_preferences: payload.erp_preferences ?? current.erp_preferences
  };

  if (!next.name) throw new Error('El nombre de la entidad es obligatorio.');
  if (next.smtp_port !== undefined && next.smtp_port !== null && Number.isNaN(next.smtp_port)) {
    throw new Error('El puerto SMTP no es valido.');
  }

  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
}

export class ConfiguracionService {
  constructor({
    repository,
    settings = {},
    audit = async () => {},
    usuarioService = null,
    dashboardService = null,
    notificacionService = null
  } = {}) {
    if (!repository) throw new Error('ConfiguracionService necesita un repository.');
    this.repository = repository;
    this.settings = settings;
    this.audit = audit;
    this.usuarioService = usuarioService;
    this.dashboardService = dashboardService;
    this.notificacionService = notificacionService;
  }

  async getSettings() {
    return this.repository.getSettings();
  }

  async saveSettings(payload) {
    const cleanPayload = sanitizeConfigurationPayload(payload, this.settings);
    const saved = await this.repository.saveSettings(cleanPayload);
    await this.audit(`Configuracion: actualizo parametros de ${saved.name || cleanPayload.name}`.trim());
    await this.dashboardService?.notifyConfigurationChanged?.({ type: 'settings_saved', settings: saved });
    await this.notificacionService?.notifyConfigurationChanged?.({ type: 'settings_saved', settings: saved });
    return saved;
  }

  isDeliverySignatureRequired(settings = this.settings) {
    return isDeliverySignatureRequired(settings);
  }

  async saveMailSettings(payload) {
    const saved = await this.saveSettings(payload);
    await this.audit('Configuracion: actualizo correo corporativo');
    return saved;
  }

  async testEmail(settings = this.settings) {
    const payload = await this.repository.sendTestEmail(sanitizeConfigurationPayload(settings, this.settings));
    await this.audit('Configuracion: probo envio de correo');
    return payload;
  }

  getSystemStatus() {
    return this.repository.getSystemStatus();
  }

  getLastBackupAt() {
    return this.repository.getLastBackupAt();
  }

  async checkStorage() {
    const connected = await this.repository.checkStorage();
    await this.audit(`Configuracion: comprobo almacenamiento ${connected ? 'conectado' : 'no configurado'}`);
    await this.notificacionService?.notifyConfigurationChanged?.({ type: connected ? 'storage_checked' : 'environment_incomplete', settings: this.settings });
    return connected;
  }

  serviceIntegrations() {
    return {
      usuarioService: Boolean(this.usuarioService),
      dashboardService: Boolean(this.dashboardService),
      notificacionService: Boolean(this.notificacionService)
    };
  }
}
