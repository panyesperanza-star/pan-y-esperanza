# SPRINT ERP 26 - Validacion modulo Colaboradores

Fecha: 2026-07-21

## Resultado general

Estado: operativo en codigo y esquema.

El ERP incorpora un modulo independiente de Colaboradores, ubicado en el menu lateral entre Voluntarios e Informes. La web publica, los portales y la identidad visual no se han modificado.

## Modulo Colaboradores

Ruta oficial:

- `/collaborators`

Campos administrativos incluidos:

- Codigo
- Tipo
- Nombre
- CIF/NIF
- Persona de contacto
- Email
- Telefono
- Direccion
- Estado
- Observaciones

Portal del colaborador:

- Activo / Inactivo
- Email de acceso
- Ultimo acceso
- Ultimo OTP
- Activar portal
- Desactivar portal
- Reenviar acceso

Arquitectura:

- UI: `src/pages/Collaborators.jsx`
- Service: `src/services/collaborators/ColaboradorService.js`
- Repository: `src/services/collaborators/ColaboradorRepository.js`
- Persistencia: RepositoryProvider -> SupabaseRepository / LocalStorageRepository

## Donantes y colaboradores

Donantes se mantiene como entidad separada.

Se anade relacion opcional:

- `donors.collaborator_id -> collaborators.id`
- `donations.collaborator_id -> collaborators.id`

Cuando una donacion pertenece a una entidad colaboradora, la donacion puede vincularse a la ficha del colaborador sin convertir Donantes en Colaboradores ni duplicar el modulo.

## Migraciones aplicadas

- `supabase/migrations/20260721_repair_schema_history.sql`
- `supabase/migrations/20260721_collaborators_admin_module.sql`

## Validacion de esquema en produccion

Auditoria amplia generada desde `supabase/schema.sql`:

- Tablas esperadas: 47
- Columnas esperadas: 577
- Indices esperados: 54
- Funciones esperadas: 16
- Objetos faltantes en produccion: 0

Objetos criticos verificados:

- `organization_settings.paypal_settings`: OK
- `organization_settings.bizum_settings`: OK
- `organization_settings.stripe_settings`: OK
- `organization_settings.resend_settings`: OK
- `organization_settings.supabase_settings`: OK
- `organization_settings.public_variables`: OK
- `organization_settings.erp_preferences`: OK
- `organization_settings.updated_at`: OK
- `public.can_beneficiary_portal_action`: OK
- `beneficiaries.family_relationship`: OK
- `campana_voluntarios`: OK
- `collaborators`: OK
- `donors`: OK

## Recuentos en produccion

| Tabla | Registros |
|---|---:|
| app_users | 4 |
| beneficiaries | 84 |
| campana_voluntarios | 0 |
| campanas | 0 |
| collaborators | 0 |
| deletion_requests | 0 |
| donations | 10 |
| donors | 0 |
| families | 11 |
| inventory_items | 5 |
| notificaciones | 2 |
| portal_sessions | 0 |
| recursos | 0 |
| volunteers | 6 |

Las tablas `collaborators` y `donors` existen y estan preparadas. Estan vacias porque no hay fichas reales registradas aun en produccion.

## Build

`npm run build`: correcto.

Aviso no critico:

- Vite informa de chunk ERP superior a 500 kB. Es una advertencia de rendimiento ya existente, no bloquea la compilacion ni el despliegue.

## Prueba funcional

Validado:

- La aplicacion compila.
- El modulo `Colaboradores` queda registrado en rutas, menu lateral y permisos.
- La capa UI consume acciones de `ColaboradorService`.
- `ColaboradorService` usa `ColaboradorRepository`.
- Produccion contiene todas las tablas, columnas, indices y funciones esperadas por `schema.sql`.
- No quedan diferencias estructurales detectadas entre esquema fuente y produccion.

Pendiente de validacion manual con credenciales reales:

- Acceso real al ERP para crear colaborador desde la interfaz en produccion.
- Recepcion real del OTP enviado al email del colaborador.
- Entrada completa al Portal Colaborador con OTP recibido.
- Entrada completa al Portal Beneficiario y Portal Donante con credenciales/OTP reales.

No se han creado registros reales de prueba en produccion desde SQL para evitar insertar datos ficticios en una base de datos operativa.

## Estado final

ERP operativo para el cierre de esquema del Sprint ERP 26.

No se han detectado errores `Could not find table` ni `Could not find column` en la validacion de base de datos.
