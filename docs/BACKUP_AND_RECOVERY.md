# Backup and Recovery - Pan y Esperanza ERP v3.0.0

Este documento define el procedimiento de copia de seguridad y recuperacion del ERP de Pan y Esperanza antes y despues del despliegue en produccion.

## Alcance

Debe protegerse:

- Base de datos Supabase.
- Supabase Storage.
- Variables de entorno.
- Archivos publicos y assets del proyecto.
- Migraciones SQL.
- Documentacion operativa.

No deben incluirse en backups compartidos:

- `SUPABASE_SERVICE_ROLE_KEY`.
- `RESEND_API_KEY`.
- Secrets de emergencia.
- Datos personales exportados sin cifrado.

## Copia manual de base de datos Supabase

Procedimiento recomendado:

1. Acceder al proyecto de Supabase.
2. Verificar que no hay migraciones pendientes.
3. Exportar una copia SQL completa de la base de datos.
4. Guardar el archivo con fecha:
   - `pan-y-esperanza-db-YYYY-MM-DD.sql`
5. Cifrar el archivo antes de moverlo fuera del entorno seguro.
6. Registrar en auditoria operativa:
   - fecha
   - responsable
   - tipo de copia
   - ubicacion segura

Tablas criticas:

- `app_users`
- `roles`
- `beneficiaries`
- `families`
- `beneficiary_documents`
- `social_history`
- `inventory_items`
- `inventory_movements`
- `deliveries`
- `donations`
- `volunteers`
- `volunteer_history`
- `recursos`
- `categorias_recursos`
- `notificaciones`
- `agenda_operativa`
- `campanas`
- `portal_sessions`
- `audit_logs`

## Copia de Storage/Buckets

Buckets previstos:

- `documentos`
- `beneficiary-photos`
- `delivery-signatures`

Procedimiento:

1. Exportar listado de objetos por bucket.
2. Descargar cada bucket conservando rutas internas.
3. Guardar manifest con:
   - bucket
   - ruta
   - tamano
   - fecha de subida
4. Cifrar la copia.
5. Verificar que al menos una muestra de archivos abre correctamente.

Nombres sugeridos:

- `pan-y-esperanza-storage-documentos-YYYY-MM-DD.zip`
- `pan-y-esperanza-storage-beneficiary-photos-YYYY-MM-DD.zip`
- `pan-y-esperanza-storage-delivery-signatures-YYYY-MM-DD.zip`

## Copia de variables de entorno

Mantener copia segura en gestor de secretos, nunca en Git.

Variables criticas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`
- `VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `FROM_EMAIL`
- `PUBLIC_LOGO_URL`
- `VITE_PROVIDER_EMAIL`
- `VITE_SYSTEM_PROVIDER_EMAIL`
- `EMERGENCY_REPAIR_SECRET`

Checklist:

- La copia no contiene espacios accidentales.
- Las claves no tienen comillas.
- `SUPABASE_SERVICE_ROLE_KEY` solo existe en servidor.
- `RESEND_API_KEY` solo existe en servidor.
- El acceso al gestor de secretos esta limitado.

## Copia de archivos publicos

Conservar:

- `public/`, si existe.
- Assets de marca.
- Iconos y logos.
- Archivos legales o publicos servidos por el ERP.
- `supabase/schema.sql`.
- `supabase/migrations/`.
- `docs/`.

No conservar:

- `node_modules/`.
- `dist/` salvo que se quiera guardar un artefacto exacto de release.
- `.env` con secretos reales.

## Frecuencia recomendada

Antes del despliegue:

- Backup completo de base de datos.
- Backup completo de Storage.
- Backup de variables de entorno.
- Verificacion de restauracion en entorno de prueba si es posible.

Produccion normal:

- Base de datos: diaria.
- Storage: diaria si hay documentos o firmas nuevas; semanal como minimo.
- Variables: cada cambio.
- Codigo y migraciones: por cada release.

Eventos especiales:

- Antes de ejecutar migraciones.
- Antes de importar datos.
- Antes de activar portales.
- Antes de cambios de RLS.
- Antes de crear integraciones externas.

## Restauracion

Orden recomendado:

1. Detener accesos de usuarios si hay riesgo de escritura concurrente.
2. Restaurar base de datos en entorno de prueba.
3. Aplicar migraciones faltantes si procede.
4. Restaurar Storage.
5. Verificar variables.
6. Validar login administrador.
7. Validar portales y OTP.
8. Validar entregas, inventario y documentos.
9. Abrir acceso a usuarios.

No restaurar directamente sobre produccion sin haber probado antes en una instancia temporal.

## Checklist de recuperacion

□ Backup SQL disponible.

□ Backup Storage disponible.

□ Variables de entorno disponibles en gestor seguro.

□ Migraciones identificadas.

□ Proyecto Supabase accesible.

□ Buckets recreados.

□ RLS activa.

□ Usuario administrador validado.

□ OTP probado.

□ Email probado.

□ Firma digital probada.

□ Portal Beneficiario probado.

□ Portal Colaboradores probado.

□ Portal Donaciones probado.

□ Dashboard carga metricas.

□ Inventario conserva stock.

□ Entregas conservan historial.

□ Auditoria conserva registros.

## Prueba minima tras restaurar

1. Entrar al ERP como administrador.
2. Abrir Dashboard.
3. Abrir Beneficiarios.
4. Abrir Inventario.
5. Abrir Entregas.
6. Consultar una entrega con justificante.
7. Verificar una firma almacenada.
8. Enviar un OTP real de portal.
9. Confirmar que no hay errores en consola.
10. Ejecutar smoke test de rutas.
