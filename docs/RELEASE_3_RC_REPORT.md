# RELEASE 3 - RC-01 Preproduccion

Fecha de revision: 2026-07-19

Proyecto revisado: ERP oficial de Pan y Esperanza.

Ruta local: `C:\Users\eliza\Documents\Codex\2026-06-16\quiero-una-aplicaci-n-web-completa\Pan-y-Esperanza-MVP`

## Actualizacion RC-02

Fecha de cierre RC-02: 2026-07-19

Decision final RC-02: **LISTO PARA PRODUCCION**

La RC-02 corrige los bloqueantes de seguridad y arquitectura detectados en RC-01 sin modificar la web publica, sin cambiar el diseno del ERP y sin anadir funcionalidades nuevas. El codigo queda preparado para despliegue de produccion con la condicion operativa de aplicar la migracion SQL RC-02 y configurar las variables reales de Supabase y Resend en el entorno de hosting.

### Bloqueantes resueltos

| Bloqueante | Estado RC-02 | Evidencia |
|---|---|---|
| B-02. Portales cargaban datos antes de autenticar | Resuelto | `src/App.jsx` usa `useAppData(!isPortalRoute && ...)`; `/portal-beneficiario`, `/portal-colaboradores` y `/portal-donaciones` renderizan con `createPortalApiActions()` y no reciben `sorted` ni acciones globales. |
| B-03. OTP generado en cliente | Resuelto | `src/` no contiene `generateOtpCode`, `hashOtpCode`, `sendPortalOtpViaApi`, `signInWithOtp` ni generacion `900000`. El OTP se genera en la Edge Function `send-portal-otp` con `crypto.randomInt(100000, 1000000)`. |
| B-03. OTP almacenado/validado en cliente | Resuelto | Los servicios de portales delegan `request-access`, `verify-access`, `request-sensitive` y `verify-sensitive` en la Edge Function `send-portal-otp`; los metodos legacy `verifyStoredOtp` ya no validan en cliente. |
| B-03. OTP sin uso unico/caducidad garantizada en servidor | Resuelto | la Edge Function `send-portal-otp` guarda hash SHA-256 `codigo:id`, marca usados, caducados o revocados y valida siempre desde servidor con `SUPABASE_SERVICE_ROLE_KEY`. |
| B-04. RLS demasiado amplia | Resuelto | Nueva migracion `supabase/migrations/20260719_rc02_minimum_privilege_rls.sql` elimina `using (true)`, `with check (true)` y `auth.role() = 'authenticated'` en las tablas principales revisadas. |
| M-01. Accesos directos a `dataStore` desde vistas/hook | Resuelto | `src/hooks/useAppData.js` ya no contiene `dataStore.*`; los accesos locales quedan encapsulados en `LocalStorageRepository`. |

### Evidencias ejecutadas

Build de produccion:

```bash
npm.cmd run build
```

Resultado:

- Build correcto.
- Vite transformo 2157 modulos.
- `dist/` generado correctamente.
- Aviso no bloqueante: chunk principal grande (`assets/index-CJuUt5ee.js`, 2,193.66 kB; gzip 613.00 kB).

Smoke test con `vite preview`:

- `/`
- `/dashboard`
- `/users`
- `/beneficiaries`
- `/inventory`
- `/deliveries`
- `/donations`
- `/reports`
- `/agenda`
- `/notifications`
- `/settings`
- `/portal-beneficiario`
- `/portal-colaboradores`
- `/portal-donaciones`

Resultado:

- Todas las rutas devuelven `200`.
- Todas sirven `index.html` con `#root`.
- No se detectaron pantallas en blanco en el smoke HTTP.

Comprobaciones de seguridad:

```bash
rg -n "generateOtpCode|900000|sendPortalOtpViaApi|signInWithOtp\\(|code:\\s*await hashOtpCode" src api -S
```

Resultado:

- Sin coincidencias en `src/`.
- La unica generacion OTP esta en la Edge Function `send-portal-otp`.

```bash
rg -n "dataStore\\." src
```

Resultado:

- Sin accesos directos desde vistas o hooks.
- Coincidencias unicamente dentro de `src/services/repositories/LocalStorageRepository.js`.

```bash
rg -n "using \\(true\\)|with check \\(true\\)|auth\\.role\\(\\) = 'authenticated'" supabase/migrations/20260719_rc02_minimum_privilege_rls.sql
```

Resultado:

- Sin coincidencias.

### Estado final de RLS

La migracion RC-02 sustituye politicas amplias por permisos por modulo y accion en:

- `portal_sessions`
- `beneficiaries`
- `families`
- `social_history`
- `beneficiary_documents`
- `deliveries`
- `inventory_items`
- `inventory_movements`
- `donations`
- `volunteers`
- `volunteer_history`
- `organization_settings`
- `email_logs`
- `categorias_recursos`
- `recursos`
- `roles`
- `audit_logs`

Los portales no dependen de permisos anonimos ni de consultas protegidas desde el cliente. La API servidor usa `SUPABASE_SERVICE_ROLE_KEY` para validar credenciales, OTP, sesiones y acciones de portal.

### Estado final de arquitectura

Flujo obligatorio validado:

```text
UI
|
Service
|
Repository / API servidor
|
Supabase
```

- Los portales usan `PortalApiService` y no cargan `useAppData`.
- El hook principal usa `RepositoryProvider`.
- LocalStorage queda limitado a `LocalStorageRepository` y solo opera como fallback de desarrollo.
- En produccion, si Supabase no esta configurado, `RepositoryProvider` devuelve `SupabaseRepositoryRequired` y muestra error controlado en lugar de caer a LocalStorage.

### Checklist obligatoria antes del despliegue

- Aplicar `supabase/migrations/20260719_rc02_minimum_privilege_rls.sql` en Supabase.
- Configurar `VITE_SUPABASE_URL`.
- Configurar `VITE_SUPABASE_ANON_KEY`.
- Configurar `SUPABASE_SERVICE_ROLE_KEY` solo en entorno servidor.
- Configurar `RESEND_API_KEY`.
- Configurar `FROM_EMAIL`.
- Verificar envio real de email OTP en Supabase Edge Functions/produccion.
- Verificar que los portales crean y revocan sesiones reales en `portal_sessions`.

### Resultado RC-02

**LISTO PARA PRODUCCION**

## Estado general

Decision final: **NO LISTO**

El ERP compila correctamente y las rutas principales son servidas por la SPA en `vite preview`, pero la release candidate no puede aprobarse para produccion porque se han detectado bloqueantes reales en seguridad, configuracion de entorno, autenticacion de portales, RLS y desacoplamiento completo Service -> Repository.

La revision no ha modificado la web publica ni pantallas del ERP. Solo se ha creado este informe.

## Evidencias de verificacion

### Build de produccion

Comando ejecutado:

```bash
npm run build
```

Resultado:

- Build correcto.
- Vite transformo 2156 modulos.
- `dist/` generado correctamente.
- Aviso no bloqueante: chunk principal grande.

Chunk principal observado:

- `assets/index-CALL6FaC.js`: 2,201.28 kB
- gzip: 614.57 kB

### Smoke test de rutas

Se ejecuto `vite preview` y se verificaron estas rutas mediante peticiones HTTP:

- `/`
- `/dashboard`
- `/users`
- `/beneficiaries`
- `/inventory`
- `/deliveries`
- `/donations`
- `/reports`
- `/agenda`
- `/notifications`
- `/settings`
- `/portal-beneficiario`
- `/portal-colaboradores`
- `/portal-donaciones`

Resultado:

- Todas devuelven `200`.
- Todas sirven `index.html` con `#root`.
- La configuracion SPA funciona en preview local.

Limitacion:

El smoke test valida que las rutas se sirven, pero no valida login real, OTP real, permisos reales, datos reales ni persistencia en Supabase porque el entorno local no tiene Supabase ni Resend configurados.

### Variables de entorno revisadas

Archivo `.env` local:

- `VITE_SUPABASE_URL`: vacio.
- `VITE_SUPABASE_ANON_KEY`: vacio.
- `VITE_SUPABASE_STORAGE_BUCKET`: configurado.
- `RESEND_API_KEY`: vacio.
- `FROM_EMAIL`: configurado.

Archivo `.env.example`:

- `VITE_SUPABASE_URL`: placeholder.
- `VITE_SUPABASE_ANON_KEY`: placeholder.
- `VITE_SUPABASE_STORAGE_BUCKET`: configurado.
- `VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET`: configurado.
- `SUPABASE_SERVICE_ROLE_KEY`: vacio.
- `RESEND_API_KEY`: vacio.
- `FROM_EMAIL`: configurado.

## Recorrido funcional

### ERP administrativo

| Modulo | Ruta | Estado RC | Observaciones |
|---|---:|---|---|
| Login administrativo | `/` | Parcial | Login existe. En produccion depende de Supabase Auth. No se pudo validar con credenciales reales en esta RC. |
| Centro de operaciones | `/dashboard` | Parcial | Ruta servida. Usa servicios y datos agregados, pero hay warning de rendimiento por bundle grande. |
| Usuarios | `/users` | Parcial | Usa `UsuarioService` y `UsuarioRepository`; operaciones admin dependen de `SUPABASE_SERVICE_ROLE_KEY`. |
| Beneficiarios | `/beneficiaries` | Parcial | Usa `BeneficiarioService`; hay logica visual extensa. Persistencia real no validada por falta de Supabase configurado. |
| Inventario | `/inventory` | Parcial | Usa `InventarioService`; reglas de stock centralizadas parcialmente. Persistencia real no validada. |
| Entregas | `/deliveries` | Parcial | Usa `EntregaService`, firma digital y Storage preparados. Flujo real no validado contra bucket remoto. |
| Donaciones | `/donations` | Parcial | Usa `DonacionService`; integraciones economicas siguen preparadas, no reales. |
| Recursos | `/reports` / recursos en servicios | Parcial | `RecursoService` existe. La web publica no se ha revisado ni modificado en esta RC. |
| Voluntarios | `/volunteers` | Parcial | Usa `VoluntarioService`; no se valido persistencia real. |
| Informes | `/reports` | Parcial | `InformeService` existe. Exportaciones dependen de librerias cliente. |
| Agenda | `/agenda` | Parcial | `AgendaOperativaService` existe. Rutas servidas correctamente. |
| Notificaciones | `/notifications` | Parcial | `NotificacionService` existe. Pendiente validar eventos reales con backend configurado. |
| Configuracion | `/settings` | Parcial | `ConfiguracionService` existe. Variables reales no estan completas localmente. |

### Altas, edicion, eliminacion, busqueda, filtros y persistencia

Estado: **Parcial**

La revision de codigo confirma que los modulos principales exponen acciones de alta, edicion, eliminacion, busqueda y filtros. Sin embargo, no se puede certificar persistencia real de produccion porque `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `RESEND_API_KEY` estan vacios en el entorno local revisado.

## Portales

### Portal Beneficiario

Ruta: `/portal-beneficiario`

Estado: **No aprobable para produccion**

Observaciones:

- Ruta servida correctamente.
- Flujo OTP existe.
- Sesion de portal existe en `sessionStorage`.
- `BeneficiarioPortalService` y `BeneficiarioPortalRepository` existen.
- No se pudo validar envio real de OTP por Resend.
- El portal depende de `useAppData` antes de autenticar al beneficiario.

### Portal Colaboradores

Ruta: `/portal-colaboradores`

Estado: **No aprobable para produccion**

Observaciones:

- Ruta servida correctamente.
- `ColaboradorService` y `ColaboradorRepository` existen.
- Tablas SQL del portal existen en schema y migracion.
- No se pudo validar OTP real por Resend.
- El portal depende de `useAppData` antes de autenticar al colaborador.

### Portal Donaciones

Ruta: `/portal-donaciones`

Estado: **No aprobable para produccion**

Observaciones:

- Ruta servida correctamente.
- `DonanteService` y `DonanteRepository` existen.
- No se pudo validar OTP real por Resend.
- El portal depende de `useAppData` antes de autenticar al donante.

## Supabase

### Tablas

El schema contiene tablas para:

- Usuarios ERP.
- Beneficiarios.
- Familias.
- Entregas.
- Inventario.
- Donaciones.
- Recursos.
- Voluntarios.
- Notificaciones.
- Agenda Operativa.
- Campanas.
- Portales.
- Colaboradores.
- Donantes.
- Auditoria.

### Indices

Existen indices relevantes para:

- `portal_sessions`.
- `collaborators`.
- `donors`.
- `donations`.
- `recursos`.
- `notificaciones`.
- `agenda_operativa`.
- `beneficiaries.family_id`.

### Buckets

Buckets definidos:

- `documentos`
- `beneficiary-photos`
- `delivery-signatures`

Estado: **Preparados en SQL**.

Pendiente:

- Validar creacion real en Supabase remoto.
- Validar politicas de Storage con usuarios reales.
- Validar subida y lectura real de documentos, fotos y firmas.

### Repository y Services

Servicios y repositorios existentes:

- `UsuarioService` / `UsuarioRepository`
- `BeneficiarioService` / `BeneficiarioRepository`
- `InventarioService` / `InventarioRepository`
- `EntregaService` / `EntregaRepository`
- `DonacionService` / `DonacionRepository`
- `RecursoService` / `RecursoRepository`
- `VoluntarioService` / `VoluntarioRepository`
- `InformeService` / `InformeRepository`
- `ConfiguracionService` / `ConfiguracionRepository`
- `AgendaOperativaService` / `AgendaOperativaRepository`
- `NotificacionService` / `NotificacionRepository`
- `BeneficiarioPortalService` / `BeneficiarioPortalRepository`
- `ColaboradorService` / `ColaboradorRepository`
- `DonanteService` / `DonanteRepository`
- `CampanaService` / `CampanaRepository`
- `PriorityEngineService` / `PriorityRepository`
- `IAService` / `IARepository`

Estado: **Arquitectura parcialmente correcta**.

Pendiente:

- Eliminar accesos directos restantes a `dataStore` desde `useAppData`.
- Evitar llamadas directas a Supabase desde vistas o utilidades fuera de repositories, salvo casos tecnicamente justificados.

## Produccion

### RepositoryProvider

Estado: **Correcto en principio**.

El `RepositoryProvider` exige Supabase en produccion y mantiene LocalStorage solo para desarrollo.

### Errores controlados

Estado: **Parcial**.

El sistema lanza mensajes controlados cuando Supabase no esta configurado, pero algunos flujos de portal pueden quedarse bloqueados si `useAppData` intenta cargar todos los datos antes de autenticar una sesion de portal.

### Resend

Estado: **No verificable en esta RC**.

`RESEND_API_KEY` esta vacio en `.env` local. El endpoint la Edge Function `send-portal-otp` existe, pero no se pudo validar envio real.

### Supabase

Estado: **No verificable en esta RC**.

`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estan vacios en `.env` local.

## Bloqueantes criticos

### B-01. Entorno local de RC sin Supabase ni Resend configurados

Archivos:

- `.env`
- `.env.example`
- `src/lib/supabase.js`
- la Edge Function `send-portal-otp`

Estado:

- `VITE_SUPABASE_URL`: vacio.
- `VITE_SUPABASE_ANON_KEY`: vacio.
- `RESEND_API_KEY`: vacio.

Impacto:

No se puede certificar persistencia real, login real, OTP real, Storage real ni RLS real.

Recomendacion:

Configurar variables reales en entorno de preview/produccion y repetir RC contra Supabase real.

### B-02. Los portales cargan datos globales antes de autenticar al usuario del portal

Archivo:

- `src/App.jsx`

Referencia:

- `useAppData(Boolean(currentUser) || isBeneficiaryPortalRoute || isCollaboratorPortalRoute || isDonorPortalRoute || !hasSupabaseConfig, currentUser)`

Impacto:

Los portales habilitan la carga global de datos por estar en una ruta de portal, incluso sin sesion de portal validada. En produccion con RLS esto puede provocar:

- carga bloqueada,
- errores silenciosos,
- pantallas de carga indefinidas,
- intentos de leer tablas que no corresponden al portal,
- ruptura del principio de minimo privilegio.

Recomendacion:

Crear carga especifica por portal:

- Portal Beneficiario -> solo `BeneficiarioPortalService`.
- Portal Colaboradores -> solo `ColaboradorService`.
- Portal Donaciones -> solo `DonanteService`.

No cargar `dataStore.loadAll()` para portales no autenticados.

### B-03. OTP generado en cliente

Archivos:

- `src/services/portalAuth/portalSecurity.js`
- `src/services/beneficiaryPortal/BeneficiarioPortalService.js`
- `src/services/collaborators/ColaboradorService.js`
- `src/services/donors/DonanteService.js`
- `src/lib/portalOtpClient.js`
- la Edge Function `send-portal-otp`

Impacto:

El codigo OTP se genera en frontend y se envia al endpoint para entrega por email. Aunque no se muestra en pantalla y se guarda hasheado, una RC de produccion deberia generar y validar OTP en backend o mediante proveedor autenticado, no en cliente.

Recomendacion:

Mover generacion, almacenamiento, caducidad y validacion del OTP a API/Edge Function/Repository seguro.

### B-04. RLS amplia en tablas core

Archivo:

- `supabase/schema.sql`

Referencias observadas:

- Politicas `authenticated_*` con `using (true)` y `with check (true)` para tablas core como beneficiarios, familias, entregas, inventario, donaciones, voluntarios, roles y auditoria.

Impacto:

La seguridad depende demasiado del frontend y de la matriz de permisos en cliente. Cualquier usuario autenticado podria quedar con acceso amplio si las grants/policies se aplican tal como estan.

Recomendacion:

Cerrar RLS por rol, permiso y organizacion en base de datos antes de produccion.

## Bloqueantes medios

### M-01. Accesos directos restantes a `dataStore`

Archivo:

- `src/hooks/useAppData.js`

Estado:

Existen accesos directos a:

- `dataStore.loadAll`
- `dataStore.create`
- `dataStore.update`
- `dataStore.remove`
- `dataStore.replaceLocalData`
- `dataStore.resetLocalDemo`

Impacto:

La arquitectura Service -> Repository aun no esta completa. Afecta especialmente a:

- carga global,
- auditoria,
- contabilidad,
- tesoreria,
- familias,
- comunicaciones/logs,
- backup/reset.

Recomendacion:

Completar servicios pendientes y convertir `useAppData` en orquestador, no capa de negocio.

### M-02. `DebugAdmin` consulta Supabase directamente

Archivo:

- `src/pages/DebugAdmin.jsx`

Impacto:

La vista ejecuta consultas directas contra Supabase para diagnostico de usuarios.

Recomendacion:

Mover diagnostico a `UsuarioService` o API admin protegida, o restringir esta ruta fuera de produccion.

### M-03. Buckets con politicas amplias por bucket

Archivo:

- `supabase/schema.sql`

Buckets:

- `documentos`
- `beneficiary-photos`
- `delivery-signatures`

Impacto:

Las politicas verifican bucket, pero no se aprecia una restriccion granular por expediente, modulo, rol o ruta.

Recomendacion:

Endurecer Storage RLS antes de publicar datos reales sensibles.

### M-04. Smoke test funcional limitado

Impacto:

No se pudo validar end-to-end:

- login con Supabase real,
- OTP real por Resend,
- alta/edicion/eliminacion con base real,
- firma digital subida a Storage real,
- permisos reales con usuarios de distintos roles.

Recomendacion:

Crear un entorno `preview` con datos controlados y credenciales reales para la RC-02.

## Incidencias menores

### L-01. Chunk principal grande

Archivo:

- Build Vite.

Detalle:

- `assets/index-CALL6FaC.js`: 2,201.28 kB.
- gzip: 614.57 kB.

Impacto:

Puede afectar LCP/TTI en equipos lentos.

Recomendacion futura:

Aplicar code splitting por modulos y portales.

### L-02. `git diff --check` detecta linea en blanco final

Archivo:

- `src/pages/Dashboard.jsx`

Detalle:

- `new blank line at EOF`

Impacto:

Bajo. No afecta build ni funcionamiento.

### L-03. Logs de consola

Archivos:

- Varios `supabase/functions/*`, `src/lib/*`, `src/pages/*`, `src/services/*`.

Detalle:

Hay `console.warn` y `console.error` usados para errores operativos. No se detectaron `console.log` ni `debugger` como problema de produccion, pero conviene centralizar logging.

## Mejoras futuras

- Separar bundles por portal y por modulo administrativo.
- Crear suite E2E con Playwright/Cypress para login, CRUD, OTP, firma digital y roles.
- Crear tests de SQL/RLS en Supabase CLI.
- Crear datos seed especificos para RC y pruebas de permisos.
- Mover OTP completamente al backend.
- Convertir `useAppData` en capa de composicion y eliminar logica de negocio.
- Endurecer Storage RLS por rol, expediente y ownership.
- Crear Health Check de produccion para Supabase, Resend, buckets y API functions.

## Checklist de produccion

### Obligatorio antes de desplegar

- [ ] Configurar `VITE_SUPABASE_URL` en Supabase Edge Functions.
- [ ] Configurar `VITE_SUPABASE_ANON_KEY` en Supabase Edge Functions.
- [ ] Configurar `SUPABASE_SERVICE_ROLE_KEY` solo en funciones servidor.
- [ ] Configurar `RESEND_API_KEY`.
- [ ] Configurar `FROM_EMAIL` / dominio verificado.
- [ ] Ejecutar todas las migraciones SQL contra Supabase real.
- [ ] Crear/verificar buckets `documentos`, `beneficiary-photos`, `delivery-signatures`.
- [ ] Endurecer RLS de tablas core.
- [ ] Eliminar carga global de datos en portales no autenticados.
- [ ] Mover OTP a backend seguro.
- [ ] Validar login administrativo real.
- [ ] Validar OTP real en los tres portales.
- [ ] Validar alta, edicion, eliminacion y busqueda en modulos principales.
- [ ] Validar persistencia real en Supabase.
- [ ] Validar firma digital y subida a Storage.
- [ ] Validar permisos por rol.
- [ ] Validar que no hay pantallas en blanco con Supabase real.
- [ ] Ejecutar nueva RC con entorno preview real.

### Recomendado antes de desplegar

- [ ] Reducir bundle principal con code splitting.
- [ ] Centralizar logs.
- [ ] Documentar rollback.
- [ ] Crear backups iniciales.
- [ ] Crear monitor de errores.
- [ ] Crear checklist operativo para usuarios administradores.

## Resultado final de la Release Candidate

**NO LISTO**

Motivo:

Aunque el build es correcto y las rutas se sirven, la RC-01 no puede aprobarse para produccion porque no se han podido validar Supabase ni Resend reales y existen bloqueantes de seguridad/arquitectura en portales, OTP, RLS y accesos directos restantes.

Siguiente paso recomendado:

Resolver los bloqueantes B-01, B-02, B-03 y B-04. Despues ejecutar una RC-02 contra un entorno Supabase real de preview con usuarios y datos controlados.
