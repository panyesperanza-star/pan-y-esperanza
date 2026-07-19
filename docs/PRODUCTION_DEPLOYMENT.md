# Production Deployment - Pan y Esperanza ERP v3.0.0

Este documento define el orden recomendado para publicar el ERP v3.0.0 en produccion.

## Objetivo

Desplegar el ERP administrativo y los portales privados con:

- Supabase operativo.
- RLS aplicada.
- Storage configurado.
- Resend configurado.
- OTP real funcionando.
- Build de produccion validado.
- Backups preparados.

## Precondiciones

Antes de desplegar:

- Backup completo realizado.
- Variables de entorno revisadas.
- Migraciones SQL revisadas.
- Usuario administrador definido.
- Proyecto Supabase creado.
- Dominio o URL de produccion definidos.
- Acceso al panel de Vercel o hosting equivalente.

## Orden de despliegue

1. Preparar Supabase.
2. Ejecutar migraciones SQL.
3. Crear buckets de Storage.
4. Configurar politicas Storage.
5. Configurar variables de entorno.
6. Configurar Resend.
7. Ejecutar build local.
8. Desplegar en hosting.
9. Ejecutar comprobaciones posteriores.
10. Abrir acceso al equipo.

## Supabase

Crear o seleccionar el proyecto Supabase definitivo.

Configurar:

- Region.
- URL del proyecto.
- Clave anon publica.
- Service role key solo para servidor.
- Autenticacion por email si aplica al ERP administrativo.

No exponer:

- `SUPABASE_SERVICE_ROLE_KEY` en cliente.
- Secrets de emergencia.
- Resend API key.

## Migraciones SQL

Ejecutar en orden todas las migraciones de `supabase/migrations/`.

Migraciones especialmente criticas:

- `20260719_collaborator_portal_production_close.sql`
- `20260719_portal_rls_production_close.sql`
- `20260719_rc02_minimum_privilege_rls.sql`

Despues de ejecutar:

- Verificar que RLS esta activa.
- Verificar que no quedan politicas amplias en tablas criticas.
- Verificar permisos de `authenticated`.
- Verificar funciones de permisos:
  - `public.can_app_permission`
  - `public.can_module_action`
  - funciones de portales

## Storage

Buckets requeridos:

- `documentos`
- `beneficiary-photos`
- `delivery-signatures`

Verificar:

- Buckets creados.
- Politicas de lectura/escritura aplicadas.
- Subida de documento de prueba.
- Subida de fotografia de prueba.
- Subida de firma de prueba.
- No hay acceso publico no deseado a documentos privados.

## Resend

Configurar:

- Dominio verificado.
- Remitente autorizado.
- `RESEND_API_KEY`.
- `FROM_EMAIL`.
- `RESEND_FROM_EMAIL` si se usa remitente alternativo.

Pruebas:

- Email de bienvenida o prueba.
- OTP de Portal Beneficiario.
- OTP de Portal Colaboradores.
- OTP de Portal Donaciones.
- Email de justificantes si procede.

## Variables de entorno

Configurar en produccion segun `.env.example`:

### Supabase

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`
- `VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

### Resend

- `RESEND_API_KEY`
- `FROM_EMAIL`
- `RESEND_FROM_EMAIL`

### Aplicacion

- `PUBLIC_LOGO_URL`
- `VITE_PROVIDER_EMAIL`
- `VITE_SYSTEM_PROVIDER_EMAIL`

### Produccion

- `EMERGENCY_REPAIR_SECRET`

Tras modificar variables:

- Redeploy completo.
- No usar cache antigua.
- Verificar logs de funciones API.

## Build local

Ejecutar:

```bash
npm.cmd run build
```

Resultado esperado:

- Build correcto.
- `dist/` generado.
- Sin errores.
- Aviso de chunk grande aceptado como no bloqueante para v3.0.0.

## Despliegue en Vercel

Pasos:

1. Confirmar rama de despliegue.
2. Confirmar variables de entorno.
3. Lanzar deploy.
4. Revisar logs de build.
5. Revisar logs de funciones API.
6. Abrir URL de produccion.
7. Ejecutar smoke test.

## Comprobaciones posteriores

Rutas ERP:

- `/`
- `/dashboard`
- `/users`
- `/beneficiaries`
- `/families`
- `/inventory`
- `/deliveries`
- `/donations`
- `/volunteers`
- `/reports`
- `/agenda`
- `/notifications`
- `/settings`
- `/backup`

Portales:

- `/portal-beneficiario`
- `/portal-colaboradores`
- `/portal-donaciones`

Validar:

- No hay pantalla en blanco.
- No hay errores de consola.
- Login administrativo funciona.
- Usuario administrador puede entrar.
- Portales no cargan datos antes de OTP.
- OTP real llega por email.
- Sesion se crea y se cierra.
- RLS bloquea accesos no permitidos.
- Inventario carga.
- Entregas cargan.
- Firma digital guarda en Storage.
- Notificaciones cargan.
- Agenda carga.

## Rollback

Si falla el despliegue:

1. No ejecutar nuevas migraciones.
2. Revisar logs.
3. Volver al deploy anterior en Vercel.
4. Si una migracion rompio datos, restaurar backup en entorno controlado.
5. Documentar incidencia.

No usar LocalStorage como fallback de produccion.

## Criterio de publicacion

La release puede abrirse al equipo cuando:

- Build correcto.
- Migraciones ejecutadas.
- Buckets operativos.
- OTP real verificado.
- Usuario administrador creado.
- Portales protegidos.
- Smoke test correcto.
- Backup realizado.
