# RELEASE 3.0 - Auditoria final previa a migracion

Fecha de auditoria: 2026-07-15

Proyecto auditado:

`C:\Users\eliza\Documents\Codex\2026-06-16\quiero-una-aplicaci-n-web-completa\Pan-y-Esperanza-MVP`

Repositorio:

- Rama: `main`
- Remoto: `https://github.com/panyesperanza-star/pan-y-esperanza.git`
- Tipo: Vite + React SPA con funciones serverless en `api/`

## Resultado ejecutivo

Estado de migracion:

**NO LISTO PARA MIGRAR A PRODUCCION SIN RESOLVER BLOQUEANTES.**

El ERP y los portales cargan correctamente en preview local, el build compila y no se detectaron pantallas en blanco en el recorrido principal. Sin embargo, la migracion real a Supabase tiene bloqueantes de seguridad y datos:

- Los portales cargan datos desde la aplicacion antes de una autenticacion real de portal.
- Los servicios OTP devuelven `demoCode` y la interfaz lo muestra, incluso con la arquitectura preparada para Supabase.
- El esquema SQL principal no contiene todas las tablas que ya usa el Portal de Colaboradores.
- Parte de la logica aun accede a `dataStore` desde `useAppData`, por lo que no todo cumple estrictamente Vista -> Service -> Repository -> Base de datos.
- `SupabaseRepository` puede caer a almacenamiento local ante errores de escritura, lo que podria ocultar fallos reales en produccion.

## Metodo de revision

Se realizo:

- Revision de rutas en `src/App.jsx` y `src/lib/constants.js`.
- Revision de servicios, repositorios y `useAppData`.
- Revision de configuracion Supabase y variables de entorno.
- Revision de SQL en `supabase/schema.sql` y `supabase/migrations/`.
- Build de produccion con `npm run build`.
- Preview local en `http://127.0.0.1:4337/`.
- Recorrido automatizado de rutas principales.
- Prueba de login local del ERP.
- Prueba de acceso del Portal del Beneficiario.
- Prueba de OTP del Portal de Colaboradores.
- Prueba de OTP del Portal de Donaciones.
- Prueba funcional de firma digital en Entregas en modo local.
- Smoke test de Agenda Operativa y Centro de Notificaciones.
- Muestreo responsive sin overflow en rutas clave.

## Build

Comando ejecutado:

```bash
npm run build
```

Resultado:

- Estado: Correcto.
- Vite: `v5.4.21`.
- Modulos transformados: 2154.
- Bundle principal: `assets/index-BmiIUgB8.js`, 2,187.47 kB, gzip 611.58 kB.
- CSS: 41.45 kB, gzip 7.70 kB.
- Aviso: chunks superiores a 500 kB.

Clasificacion:

- Media: bundle principal grande. No bloquea la migracion, pero conviene code splitting antes de crecimiento adicional.
- Media: logo compilado de 1,453.52 kB. Conviene optimizar o servir variante web.

## Rutas revisadas

### ERP administrativo

| Ruta | Modulo | Estado | Consola | Overflow |
| --- | --- | --- | --- | --- |
| `/dashboard` | Centro de operaciones | OK | 0 errores | No |
| `/notifications` | Centro de Notificaciones | OK | 0 errores | No |
| `/agenda` | Agenda Operativa | OK | 0 errores | No |
| `/beneficiaries` | Beneficiarios | OK | 0 errores | No |
| `/communications` | Comunicaciones | OK | 0 errores | No |
| `/families` | Familias | OK | 0 errores | No |
| `/deliveries` | Entregas | OK | 0 errores | No |
| `/receipts` | Justificantes | OK | 0 errores | No |
| `/inventory` | Inventario | OK | 0 errores | No |
| `/donations` | Donaciones | OK | 0 errores | No |
| `/accounting` | Contabilidad | OK | 0 errores | No |
| `/volunteers` | Voluntarios | OK | 0 errores | No |
| `/reports` | Informes | OK | 0 errores | No |
| `/users` | Usuarios | OK | 0 errores | No |
| `/settings` | Configuracion | OK | 0 errores | No |
| `/backup` | Copias | OK | 0 errores | No |

### Portales

| Ruta | Portal | Estado | Acceso | Consola | Overflow |
| --- | --- | --- | --- | --- | --- |
| `/portal-beneficiario` | Beneficiario | OK | Codigo + fecha de nacimiento probado | 0 errores | No |
| `/portal-colaboradores` | Colaboradores | OK | Email + OTP probado | 0 errores | No |
| `/portal-donaciones` | Donaciones | OK | Email + OTP probado | 0 errores | No |

## Revision por modulo

### Centro de operaciones

Estado: OK en local.

Verificado:

- Carga sin pantalla en blanco.
- Muestra resumen del dia, prioridades, agenda, beneficiarios, donaciones, voluntarios, recursos y bloque IA preparado.
- Consume `DashboardService` y `PriorityEngineService`.

Riesgos:

- Media: muestra datos de seed/local si Supabase no esta configurado.
- Media: algunas metricas dependen de datos cargados desde tablas opcionales.

### Centro de Notificaciones

Estado: OK en local.

Verificado:

- Lista cronologica visible.
- Filtros por modulo y prioridad visibles.
- Buscador visible.
- Contador de pendientes visible.
- Accion `Marcar leida` probada sin errores.

Riesgos:

- Media: requiere tabla `notificaciones` y politicas RLS aplicadas antes de produccion.

### Agenda Operativa

Estado: OK en local.

Verificado:

- Vista carga sin errores.
- Vistas Dia, Semana, Mes y Lista presentes.
- Filtros por tipo, responsable y campana presentes.
- Campanas y recomendaciones visibles.

Riesgos:

- Media: requiere migraciones `20260714_operational_agenda.sql` y `20260714_campaign_engine.sql`.

### Beneficiarios

Estado: OK en local.

Verificado:

- Ruta carga.
- Expedientes visibles.
- El modulo usa `BeneficiarioService` para las operaciones principales.
- Las fotografias usan utilidades de storage.

Riesgos:

- Alta: algunas funciones auxiliares siguen importandose desde `lib/emailClient`, `lib/exporters` y utilidades directas; no todo esta encapsulado en services.
- Media: almacenamiento de fotos requiere bucket `beneficiary-photos`.

### Comunicaciones

Estado: OK en local.

Verificado:

- Ruta carga.
- Email, WhatsApp y flujos de comunicacion aparecen.

Riesgos:

- Alta: depende de Resend y funciones serverless para envio real.
- Media: WhatsApp queda como apertura de enlace/mensaje preparado; el envio final ocurre fuera del ERP.
- Alta: la logica de comunicaciones aun vive principalmente en la vista y acciones de `useAppData`, no en un `ComunicacionService` dedicado.

### Familias

Estado: OK en local.

Verificado:

- Ruta carga.
- Expediente familiar visible.

Riesgos:

- Alta: no existe `FamiliaService`/`FamiliaRepository` dedicado; varias operaciones siguen en `useAppData` mediante `dataStore`.

### Entregas

Estado: OK en local.

Verificado:

- Ruta carga.
- Formulario de entrega abre correctamente.
- Firma digital con canvas probada.
- Firma confirmada.
- Entrega registrada en modo local con firma disponible.
- No hubo errores de consola durante la prueba.

Riesgos:

- Media: para produccion real se requiere bucket `delivery-signatures`.
- Media: si Supabase Storage falla, debe validarse que no se guarde una entrega aparentemente firmada sin archivo persistido.

### Justificantes

Estado: OK en local.

Verificado:

- Ruta carga.
- Historial de envios visible.
- Preparado para envio con Resend y storage.

Riesgos:

- Alta: envio real requiere `RESEND_API_KEY`, `FROM_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` y bucket `documentos`.
- Media: algunos registros antiguos pueden necesitar regeneracion de PDF.

### Inventario

Estado: OK en local.

Verificado:

- Ruta carga.
- Centro de gestion visual activo.
- Indicadores, filtros y acciones rapidas visibles.
- Modulo principal usa `InventarioService`.

Riesgos:

- Media: algunas operaciones economicas y contables relacionadas siguen pasando por acciones en `useAppData`.
- Media: debe validarse stock real despues de importar datos.

### Donaciones

Estado: OK en local.

Verificado:

- Ruta carga.
- Donantes y donaciones visibles.
- `DonacionService` existe y se integra con inventario para donaciones en especie.

Riesgos:

- Alta: Stripe, PayPal, Bizum y transferencia estan preparados, pero no conectados a proveedores reales.
- Alta: no debe activarse cobro real sin webhooks, conciliacion y auditoria de pagos.

### Contabilidad

Estado: OK en local.

Verificado:

- Ruta carga.
- Vista economica y tesoreria integradas.

Riesgos:

- Alta: muchas operaciones contables siguen centralizadas en `useAppData` con acceso directo a `dataStore`.
- Alta: las tablas contables principales aparecen en migracion `20260702_accounting_base.sql`, pero no como bloque completo de `create table` en `schema.sql`. La migracion debe ejecutarse y verificarse.

### Voluntarios

Estado: OK en local.

Verificado:

- Ruta carga.
- `VoluntarioService` y `VoluntarioRepository` existen.

Riesgos:

- Media: requiere validacion con datos reales y permisos reales.

### Informes

Estado: OK en local.

Verificado:

- Ruta carga.
- `InformeService` se usa desde la vista.
- Exportacion PDF/Excel preparada.

Riesgos:

- Media: la calidad de informes dependera de que todas las tablas reales esten completas tras importacion.

### Usuarios

Estado: OK en local.

Verificado:

- Ruta carga.
- Gestion de usuarios dentro de `Settings`.
- `UsuarioService` y `UsuarioRepository` existen.
- API serverless preparada para operaciones administrativas con service role.

Riesgos:

- Bloqueante: `SUPABASE_SERVICE_ROLE_KEY` debe configurarse solo en backend/Vercel antes de crear usuarios reales.
- Alta: confirmar en Supabase que todos los usuarios tienen perfil `app_users` vinculado a `auth.users`.

### Configuracion

Estado: OK en local.

Verificado:

- Ruta carga.
- Preferencia "Solicitar firma digital en las entregas" existe.
- Configuracion de entidad, correo, integraciones y preferencias centralizada parcialmente en `ConfiguracionService`.

Riesgos:

- Media: parametros de Stripe, PayPal, Bizum y Resend estan preparados, pero sin credenciales reales.

### Copias

Estado: OK en local.

Verificado:

- Ruta carga.
- Exportacion/importacion local preparada.
- Preparacion de entorno de produccion visible.

Riesgos:

- Alta: debe definirse proceso formal de backup Supabase antes de migracion.

## Portales

### Portal del Beneficiario

Estado local: OK.

Verificado:

- Acceso con codigo `PYE-00001` y fecha de nacimiento.
- Vista privada carga.
- Muestra resumen, proxima entrega, documentacion, avisos, recursos y seguridad.

Hallazgos:

- Bloqueante: con Supabase real, el portal no debe cargar todas las tablas mediante anon key antes de autenticar al beneficiario.
- Alta: el acceso por codigo y fecha debe reforzarse con OTP real para sesiones de produccion.
- Alta: las acciones sensibles usan OTP preparado, pero debe comprobarse envio real y no exposicion del codigo.

### Portal de Colaboradores

Estado local: OK.

Verificado:

- Acceso con email y OTP.
- Vista privada carga.
- Muestra inicio, impacto, donaciones, nueva donacion, campanas, recursos, certificados y perfil.

Hallazgos:

- Bloqueante: `schema.sql` no crea tablas `collaborators`, `collaborator_portal_otps`, `collaborator_portal_profile_updates`, `collaborator_portal_requests` ni `collaborator_certificates`.
- Bloqueante: el servicio devuelve `demoCode` y la interfaz lo muestra. En produccion no debe exponerse el OTP.
- Alta: necesita RLS especifico por colaborador, no politicas genericas.

### Portal de Donaciones

Estado local: OK.

Verificado:

- Acceso con email y OTP.
- Vista privada carga.
- Muestra inicio, impacto, historial, donar de nuevo, certificados, campanas y perfil.

Hallazgos:

- Bloqueante: el servicio devuelve `demoCode` y la interfaz lo muestra. En produccion no debe exponerse el OTP.
- Alta: Stripe, PayPal, Bizum y transferencia estan preparados como flujo, pero no conectados a pasarelas reales.
- Alta: debe definirse trazabilidad entre donante, pago real, donacion, certificado y contabilidad.

## Arquitectura Service -> Repository

Estado general: Parcial.

Capas existentes:

- `src/services/repositories/RepositoryProvider.js`
- `src/services/repositories/LocalStorageRepository.js`
- `src/services/repositories/SupabaseRepository.js`
- Services por dominio: Beneficiario, Inventario, Entrega, Donacion, Recurso, Voluntario, Usuario, Informe, Configuracion, Notificacion, Agenda, Campana, Prioridades, IA, Portales.

Cumple:

- Las pantallas principales consumen mayoritariamente `actions` desde `useAppData`.
- Muchos modulos ya delegan en services.
- Repository selecciona LocalStorage o Supabase segun variables.

No cumple completamente:

- `useAppData.js` conserva operaciones directas a `dataStore` en contabilidad, familias, comunicaciones, borrados, copias y algunas operaciones auxiliares.
- `dataStore.js` todavia contiene acceso directo a Supabase.
- `SupabaseRepository.js` cae a `fallbackStore` en errores de escritura, lo que puede ocultar fallos de Supabase.
- Portales cargan `useAppData` completo en vez de un contexto minimo y autenticado por portal.

Clasificacion:

- Alta: completar separacion interna antes de migracion total.
- Bloqueante: eliminar fallback silencioso en produccion antes de activar Supabase real.

## Funcionalidades simuladas o solo preparadas

Bloqueante:

- OTP con `demoCode` visible en portales.

Alta:

- Supabase no esta configurado en `.env`.
- Portal de Beneficiario no usa Supabase Auth definitivo.
- Portal de Colaboradores no tiene tablas SQL principales en `schema.sql`.
- Portal de Donaciones no procesa pagos reales.
- Stripe no conectado.
- PayPal no conectado.
- Bizum no conectado.
- Transferencia bancaria sin conciliacion automatica.
- Resend requiere variables reales.
- IA usa proveedores preparados y `NoopAIProvider`; no consume API real.
- La web publica queda fuera de esta auditoria y no debe asumir consumo dinamico hasta validar ResourceProvider contra Supabase real.

Media:

- Dashboard IA preparado, sin IA real.
- WhatsApp abre mensajes preparados, sin API oficial.
- Exportaciones dependen de datos cargados localmente.

## Integraciones externas pendientes

| Integracion | Estado | Riesgo |
| --- | --- | --- |
| Supabase Database | Preparado, no configurado localmente | Bloqueante |
| Supabase Auth ERP | Preparado | Alta |
| Supabase Auth Portales | Parcial | Bloqueante |
| Supabase Storage documentos | Preparado | Alta |
| Supabase Storage beneficiary-photos | Preparado | Alta |
| Supabase Storage delivery-signatures | Preparado | Alta |
| Resend | Preparado | Alta |
| Stripe | Solo preparado | Alta |
| PayPal | Solo preparado | Alta |
| Bizum | Solo preparado | Alta |
| Transferencia bancaria | Manual/preparado | Media |
| IA OpenAI/Azure/Anthropic/Gemini | Arquitectura preparada, no conectada | Media |
| WhatsApp | Enlace/mensaje preparado | Media |

## Variables de entorno necesarias

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`
- `VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET`
- `VITE_SYSTEM_PROVIDER_EMAIL`
- `VITE_PROVIDER_EMAIL`

Backend/Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `PUBLIC_LOGO_URL`
- `EMERGENCY_REPAIR_SECRET`

Pendientes de definir para pagos:

- Variables Stripe publicas y secretas.
- Webhook secret de Stripe.
- Configuracion PayPal.
- Configuracion Bizum/ONG.

Hallazgo:

- Media: `.env.example` no incluye `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`.

## Buckets de Supabase necesarios

| Bucket | Uso | Estado SQL |
| --- | --- | --- |
| `documentos` | Documentos, justificantes y adjuntos privados | En `schema.sql` |
| `beneficiary-photos` | Fotografias de beneficiarios | En `schema.sql` |
| `delivery-signatures` | Firmas digitales PNG | En `schema.sql` y migracion Sprint 13 |

Checklist Storage:

- Crear buckets si no existen.
- Aplicar politicas RLS de storage.
- Validar MIME y tamano maximo.
- Probar URL firmada para documentos.
- Probar subida de foto de beneficiario.
- Probar subida de firma digital.

## Migraciones SQL que deben ejecutarse

Ejecutar y verificar, como minimo:

- `supabase/schema.sql` si se usa instalacion limpia.
- Todas las migraciones en `supabase/migrations/` en orden cronologico.
- Especialmente:
  - `20260702_accounting_base.sql`
  - `20260702_inventory_production_close.sql`
  - `20260703_fix_delivery_cancellation_flow.sql`
  - `20260705_provider_deletion_requests.sql`
  - `20260706_close_families_module.sql`
  - `20260708_volunteer_code_unique.sql`
  - `20260714_delivery_digital_signatures.sql`
  - `20260714_notification_center.sql`
  - `20260714_operational_agenda.sql`
  - `20260714_campaign_engine.sql`

Bloqueante:

- Crear migracion faltante para `collaborators`, `collaborator_portal_otps`, `collaborator_portal_profile_updates`, `collaborator_portal_requests` y `collaborator_certificates`.

Alta:

- Reconciliar `schema.sql` con migraciones para que una instalacion limpia no dependa de conocimiento manual.

## Datos actuales a exportar e importar

Fuente local:

- `localStorage` key: `pan-y-esperanza-real-data`.

Tablas/dominios:

- `organization_settings`
- `families`
- `beneficiaries`
- `social_history`
- `beneficiary_documents`
- `beneficiary_portal_accounts`
- `beneficiary_portal_notices`
- `beneficiary_portal_renewals`
- `beneficiary_portal_profile_updates`
- `collaborators`
- `collaborator_portal_otps`
- `collaborator_portal_profile_updates`
- `collaborator_portal_requests`
- `collaborator_certificates`
- `donors`
- `donor_portal_otps`
- `donor_portal_profile_updates`
- `donor_certificates`
- `deliveries`
- `email_logs`
- `inventory_items`
- `inventory_movements`
- `donations`
- `accounting_events`
- `financial_accounts`
- `cash_bank_movements`
- `accounting_contacts`
- `accounting_documents`
- `loan_records`
- `loan_movements`
- `debt_records`
- `debt_movements`
- `social_value_events`
- `deletion_requests`
- `accounting_audit_trail`
- `treasury_incomes`
- `treasury_expenses`
- `treasury_loans`
- `treasury_accounts`
- `volunteers`
- `volunteer_history`
- `notificaciones`
- `agenda_operativa`
- `campanas`
- `campana_beneficiarios`
- `campana_productos`
- `campana_voluntarios`
- `campana_entregas`
- `campana_agenda_eventos`
- `categorias_recursos`
- `recursos`
- `roles`
- `audit_logs`
- `app_users`

Tambien:

- Archivos/documentos adjuntos.
- Fotografias de beneficiarios.
- Firmas digitales.
- PDFs de justificantes si ya existen almacenados.

## Hallazgos clasificados

### Bloqueante

1. **OTP visible en portales**
   - Archivos: `src/services/collaborators/ColaboradorService.js`, `src/pages/CollaboratorPortal.jsx`, `src/services/donors/DonanteService.js`, `src/pages/DonorPortal.jsx`, y flujo OTP del beneficiario.
   - Riesgo: exposicion del codigo OTP en produccion.
   - Accion: devolver `demoCode` solo en modo desarrollo local y no renderizarlo en produccion.

2. **Portales cargan datos antes de autenticacion real**
   - Archivo: `src/App.jsx`, `src/hooks/useAppData.js`.
   - Riesgo: con Supabase real, los portales pueden fallar por RLS o forzar politicas demasiado abiertas.
   - Accion: crear carga minima por portal y autenticar antes de consultar datos privados.

3. **Faltan tablas SQL del Portal de Colaboradores**
   - Archivos: `src/services/collaborators/ColaboradorRepository.js`, `src/data/seed.js`, `src/lib/dataStore.js`, `supabase/schema.sql`.
   - Riesgo: el portal funciona en local, pero no tiene esquema completo para Supabase.
   - Accion: crear migracion SQL y RLS especifico.

4. **Fallback local en errores Supabase**
   - Archivo: `src/services/repositories/SupabaseRepository.js`.
   - Riesgo: en produccion una escritura fallida podria terminar guardandose en fallback local o en memoria/localStorage.
   - Accion: desactivar fallback en entorno produccion.

### Alta

1. **Service -> Repository incompleto**
   - Archivo: `src/hooks/useAppData.js`.
   - Riesgo: familias, comunicaciones, contabilidad, copias y borrados tienen operaciones directas sobre `dataStore`.
   - Accion: extraer services restantes antes de migracion total.

2. **SQL no reconciliado**
   - Archivos: `supabase/schema.sql`, `supabase/migrations/`.
   - Riesgo: una base limpia puede quedar incompleta si solo se ejecuta `schema.sql`.
   - Accion: consolidar schema definitivo o checklist obligatoria de migraciones.

3. **Pagos no conectados**
   - Modulos: Donaciones, Portal de Donaciones, Configuracion.
   - Riesgo: no puede considerarse produccion de pagos.
   - Accion: implementar proveedores, webhooks y conciliacion antes de cobros reales.

4. **Resend y service role no configurados**
   - Archivos: `api/send-justificantes.js`, `api/create-user.js`, `api/admin-user.js`, `api/request-password-reset.js`, `api/reset-password.js`.
   - Riesgo: usuarios, reset de contrasena y correos reales fallaran.
   - Accion: configurar variables en Vercel.

5. **RLS de portales insuficiente**
   - Riesgo: las politicas actuales son amplias para algunos dominios y no modelan acceso individual por beneficiario, colaborador o donante.
   - Accion: definir claims/sesiones y politicas por entidad.

### Media

1. **Bundle grande**
   - Riesgo: carga inicial pesada.
   - Accion: lazy loading por modulo y division de chunks.

2. **Logo pesado**
   - Riesgo: carga innecesaria.
   - Accion: version optimizada para UI y mantener original para impresion.

3. **IA preparada sin proveedor real**
   - Riesgo: expectativa funcional no cubierta.
   - Accion: mantener desactivada hasta configurar proveedor y auditoria de prompts.

4. **Responsive no auditado exhaustivamente en todos los modulos**
   - Resultado: no se detecto overflow en escritorio y muestra movil de portales, pero no se recorrio cada formulario movil.
   - Accion: QA manual mobile antes de despliegue.

5. **Variables incompletas en `.env.example`**
   - Falta `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`.

### Baja

1. **Ruta legacy `/treasury`**
   - Estado: redirige/normaliza hacia Contabilidad.
   - Riesgo: bajo, pero conviene documentarlo.

2. **Textos con caracteres mojibake en algunas cadenas**
   - Archivos: varias vistas/constantes muestran caracteres como `ConfiguraciÃ³n` en snapshots.
   - Riesgo: visual medio/bajo segun navegador y fuente de datos.
   - Accion: normalizar codificacion UTF-8 en una fase especifica.

## Duplicidades y rutas especiales

No se detectan dos ERPs activos dentro de esta app.

Rutas especiales:

- `/treasury`: alias legado de Contabilidad.
- `/provider`: panel de proveedor solo para Superadministrador del sistema.
- `/debug/admin`: ruta tecnica para reparacion/debug.
- `/users`: usa `Settings` con pestaña Usuarios.
- `/settings`: usa `Settings` con pestaña Entidad.

Clasificacion:

- Baja: documentar rutas especiales antes de soporte a usuarios.

## Checklist exacta previa al despliegue

### 1. Bloqueantes

- [ ] Ocultar `demoCode` en cualquier entorno que no sea desarrollo local.
- [ ] Separar carga de datos de portales: no usar `useAppData` global antes de autenticacion.
- [ ] Crear y aplicar SQL de colaboradores y tablas del Portal de Colaboradores.
- [ ] Desactivar fallback local de `SupabaseRepository` en produccion.
- [ ] Definir RLS por beneficiario, colaborador y donante.

### 2. Base de datos

- [ ] Crear proyecto Supabase definitivo.
- [ ] Ejecutar `schema.sql` consolidado o migraciones completas en orden.
- [ ] Verificar que existen todas las tablas usadas por `dataStore`.
- [ ] Verificar claves foraneas, indices y constraints.
- [ ] Verificar funciones RPC como `cancel_delivery`.
- [ ] Verificar politicas RLS con usuarios reales por rol.

### 3. Storage

- [ ] Crear bucket `documentos`.
- [ ] Crear bucket `beneficiary-photos`.
- [ ] Crear bucket `delivery-signatures`.
- [ ] Aplicar politicas storage.
- [ ] Probar subida, lectura firmada y borrado autorizado.

### 4. Variables de entorno

- [ ] `VITE_SUPABASE_URL`.
- [ ] `VITE_SUPABASE_ANON_KEY`.
- [ ] `VITE_SUPABASE_STORAGE_BUCKET`.
- [ ] `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`.
- [ ] `VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET`.
- [ ] `SUPABASE_URL`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `SUPABASE_STORAGE_BUCKET`.
- [ ] `RESEND_API_KEY`.
- [ ] `FROM_EMAIL`.
- [ ] `PUBLIC_LOGO_URL`.
- [ ] `EMERGENCY_REPAIR_SECRET`.
- [ ] Variables de Stripe.
- [ ] Variables de PayPal.
- [ ] Datos Bizum/ONG.

### 5. Datos

- [ ] Exportar localStorage actual desde `pan-y-esperanza-real-data`.
- [ ] Convertir datos a formato SQL/CSV validado.
- [ ] Importar usuarios y vincular `app_users` con `auth.users`.
- [ ] Importar beneficiarios, familias, inventario, entregas, donaciones, contabilidad, voluntarios, agenda, recursos y auditoria.
- [ ] Migrar archivos a Storage.
- [ ] Validar totales antes/despues.

### 6. Funcional

- [ ] Login ERP con usuario real.
- [ ] Permisos por rol.
- [ ] Crear beneficiario.
- [ ] Subir foto de beneficiario.
- [ ] Crear familia.
- [ ] Registrar entrada de inventario.
- [ ] Registrar entrega.
- [ ] Firmar entrega.
- [ ] Generar justificante.
- [ ] Enviar justificante por Resend.
- [ ] Registrar donacion economica.
- [ ] Registrar donacion en especie y entrada de inventario.
- [ ] Marcar notificaciones.
- [ ] Crear evento de agenda.
- [ ] Acceder a Portal Beneficiario con flujo real.
- [ ] Acceder a Portal Colaboradores con OTP real.
- [ ] Acceder a Portal Donaciones con OTP real.

### 7. Rendimiento y QA

- [ ] Code splitting por rutas.
- [ ] Optimizar logo y assets pesados.
- [ ] Lighthouse en produccion.
- [ ] QA escritorio.
- [ ] QA tablet.
- [ ] QA movil.
- [ ] Revisar consola en cada modulo.
- [ ] Revisar errores de red.
- [ ] Revisar logs de Vercel.
- [ ] Backup inicial antes de activar usuarios.

## Decision final

El sistema esta funcionalmente avanzado y la interfaz principal carga correctamente, pero **no esta listo para migracion completa a produccion** hasta cerrar los bloqueantes de seguridad, SQL y aislamiento de datos de portales.

Recomendacion:

1. Congelar nuevas funcionalidades.
2. Resolver bloqueantes.
3. Consolidar SQL definitivo.
4. Migrar datos en entorno staging.
5. Ejecutar QA completo con Supabase real.
6. Solo despues desplegar Release 3.0 a produccion.
