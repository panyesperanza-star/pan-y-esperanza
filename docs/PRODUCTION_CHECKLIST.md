# Production Checklist - Pan y Esperanza ERP v3.0.0

Checklist final antes de publicar oficialmente la Release 3.0.

## Build y despliegue

□ Build correcto

□ `dist/` generado correctamente

□ Variables configuradas

□ Deploy ejecutado

□ Logs de build revisados

□ Logs de funciones API revisados

□ Smoke test correcto

## Supabase

□ Supabase operativo

□ Migraciones ejecutadas

□ `20260719_rc02_minimum_privilege_rls.sql` ejecutada

□ RLS verificada

□ Tablas principales creadas

□ Indices creados

□ Funciones SQL creadas

□ Permisos revisados

□ Usuario administrador creado

## Storage

□ Buckets creados

□ Bucket `documentos` creado

□ Bucket `beneficiary-photos` creado

□ Bucket `delivery-signatures` creado

□ Politicas Storage revisadas

□ Subida de prueba realizada

□ Lectura de prueba realizada

## Email y OTP

□ Resend configurado

□ Email funcionando

□ `FROM_EMAIL` verificado

□ OTP funcionando

□ OTP Portal Beneficiario verificado

□ OTP Portal Colaboradores verificado

□ OTP Portal Donaciones verificado

□ OTP no se muestra en pantalla

□ OTP caduca correctamente

□ OTP es de un solo uso

## Backups

□ Backups preparados

□ Backup base de datos realizado

□ Backup Storage realizado

□ Backup variables de entorno realizado

□ Procedimiento de restauracion revisado

□ Responsable de backups asignado

## Portales

□ Portal Beneficiario

□ Portal Colaboradores

□ Portal Donaciones

□ Ningun portal carga datos antes de autenticarse

□ Sesion de portal se crea correctamente

□ Cierre de sesion invalida el acceso

□ Acciones sensibles requieren OTP

## ERP administrativo

□ ERP administrativo

□ Centro de operaciones

□ Usuarios

□ Beneficiarios

□ Familias

□ Inventario

□ Entregas

□ Justificantes

□ Donaciones

□ Voluntarios

□ Informes

□ Agenda

□ Notificaciones

□ Configuracion

□ Copias

## Flujos operativos

□ Inventario carga correctamente

□ Entregas cargan correctamente

□ Donaciones cargan correctamente

□ Informes cargan correctamente

□ Agenda carga correctamente

□ Notificaciones cargan correctamente

□ Firma digital funciona

□ Justificante se genera correctamente

□ Stock no queda negativo

□ Auditoria registra acciones criticas

## Seguridad

□ Seguridad validada

□ Service role solo en servidor

□ Resend API key solo en servidor

□ No existen credenciales reales en Git

□ RLS verificada

□ Produccion no usa LocalStorage como fallback

□ Portales validan sesion en servidor

□ Accesos denegados quedan controlados

□ Variables de emergencia protegidas

## Datos

□ Datos demo eliminados o aislados

□ Datos reales importados

□ Validaciones posteriores completadas

□ Documentos asociados a expedientes

□ Firmas asociadas a entregas

□ Recursos publicados revisados

□ Dashboard muestra metricas coherentes

## Decision final

□ Release 3.0 aprobada para publicacion oficial

□ Equipo informado

□ Fecha de publicacion definida

□ Plan de rollback disponible
