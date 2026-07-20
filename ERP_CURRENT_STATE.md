# ERP_CURRENT_STATE.md

Fecha de auditoria: 2026-07-13

Proyecto auditado:

`C:\Users\eliza\Documents\Codex\2026-06-16\quiero-una-aplicaci-n-web-completa\Pan-y-Esperanza-MVP`

Rama Git: `main`

## 1. Resumen ejecutivo

El ERP oficial de Pan y Esperanza existe en este proyecto como una aplicacion React/Vite de administracion interna. Es una SPA desplegable en Vercel, con menu lateral, autenticacion, permisos por modulo, almacenamiento hibrido local/Supabase y Supabase Edge Functions para operaciones sensibles.

El sistema esta suficientemente avanzado para uso operativo inicial: beneficiarios, familias, entregas, justificantes, inventario, donaciones, contabilidad, comunicaciones, voluntarios, informes, usuarios, configuracion, copias y panel de proveedor.

El punto tecnico mas importante es que la logica del ERP esta concentrada principalmente en:

- `src/App.jsx`
- `src/hooks/useAppData.js`
- `src/lib/dataStore.js`
- `src/lib/auth.js`
- `src/lib/constants.js`
- paginas grandes dentro de `src/pages/*.jsx`

No existe todavia una capa CORE/Services/Repository separada como la diseñada en el proyecto de la web. La aplicacion ya tiene una abstraccion minima (`dataStore`) para cambiar entre `localStorage` y Supabase, pero las pantallas consumen directamente `data`, `actions` y mucha logica vive en el hook `useAppData`.

## 2. Arquitectura actual

### 2.1 Stack tecnico

Archivo principal:

- `package.json`

Tecnologias actuales:

- React 18.
- Vite 5.
- Tailwind CSS 3.
- Supabase JS v2.
- Supabase Edge Functions.
- Resend para correo.
- jsPDF y jsPDF AutoTable para PDF.
- XLSX para Excel.
- JSZip para ZIP.
- QRCode para codigos QR.
- Lucide React para iconos.

Scripts:

- `npm run dev`: servidor Vite.
- `npm run build`: build de produccion.
- `npm run preview`: preview Vite.

### 2.2 Tipo de aplicacion

La aplicacion es una SPA.

Archivos:

- `src/main.jsx`
- `src/App.jsx`
- `vite.config.js`
- `vercel.json`

Caracteristicas:

- No usa React Router.
- La navegacion se gestiona manualmente con `window.history.pushState`, `popstate`, `getModuleByPath` y `getModulePath`.
- Vercel redirige todas las rutas a `index.html` mediante:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```

### 2.3 Layout principal

Archivo:

- `src/components/Layout.jsx`

Funcionalidades:

- Menu lateral fijo en escritorio.
- Header movil.
- Logo oficial con `BrandLogo`.
- Usuario actual y rol visibles.
- Filtrado de modulos por permisos mediante `canAccess`.
- Boton de cierre de sesion.
- Boton `Reiniciar demo` solo en desarrollo.

### 2.4 Entrada de datos global

Archivo:

- `src/hooks/useAppData.js`

Responsabilidades actuales:

- Cargar todos los datos.
- Exponer todas las acciones de escritura.
- Validar payloads.
- Ejecutar permisos.
- Registrar auditoria.
- Gestionar entregas, inventario, familias, beneficiarios, comunicaciones, contabilidad, donaciones, usuarios y copias.
- Coordinar llamadas a Supabase Edge Functions.
- Ejecutar logica economica y de inventario.

Valoracion:

- Es el centro real del ERP.
- Tambien es el principal punto de acoplamiento y refactorizacion futura.

## 3. Rutas y navegacion

### 3.1 Rutas principales

Archivo:

- `src/lib/constants.js`

Modulos definidos en `MODULES`:

| Modulo | Ruta | Pantalla |
| --- | --- | --- |
| Centro de operaciones | `/dashboard` | `src/pages/Dashboard.jsx` |
| Beneficiarios | `/beneficiaries` | `src/pages/Beneficiaries.jsx` |
| Comunicaciones | `/communications` | `src/pages/Communications.jsx` |
| Familias | `/families` | `src/pages/Families.jsx` |
| Entregas | `/deliveries` | `src/pages/Deliveries.jsx` |
| Justificantes | `/receipts` | `src/pages/Receipts.jsx` |
| Inventario | `/inventory` | `src/pages/Inventory.jsx` |
| Donaciones | `/donations` | `src/pages/Donations.jsx` |
| Contabilidad | `/accounting` | `src/pages/Accounting.jsx` |
| Voluntarios | `/volunteers` | `src/pages/Volunteers.jsx` |
| Informes | `/reports` | `src/pages/Reports.jsx` |
| Usuarios | `/users` | `src/pages/Settings.jsx`, pestaña `users` |
| Configuracion | `/settings` | `src/pages/Settings.jsx`, pestaña `entity` |
| Copias | `/backup` | `src/pages/Backup.jsx` |
| Panel del proveedor | `/provider` | `src/pages/ProviderPanel.jsx` |

Rutas especiales:

- `/debug/admin`: `src/pages/DebugAdmin.jsx`, solo para superadministrador del sistema.
- `/treasury`: ruta legacy redirigida internamente a `/accounting`.

### 3.2 Observacion sobre `/admin/*`

El proyecto oficial auditado no define rutas `/admin/*`. Las rutas reales son `/dashboard`, `/beneficiaries`, `/inventory`, etc.

Si algun entorno muestra `/admin/beneficiarios`, esa ruta no procede de la configuracion actual de este repositorio tal como esta en disco. Puede ser:

- una ruta legacy de otro despliegue,
- una capa externa de proxy,
- o una version distinta publicada.

## 4. Modulos y pantallas existentes

### 4.1 Centro de operaciones

Archivo:

- `src/pages/Dashboard.jsx`

Lineas aproximadas: 1-1230.

Funcionalidades reales:

- Barra rapida diaria.
- Prioridades operativas.
- Tareas automaticas.
- Familias prioritarias.
- Alertas de inventario: stock bajo, agotados, caducidades.
- Comunicaciones pendientes.
- Resumen general por permisos.
- Accesos directos a modulos.

Servicios/datos usados:

- Recibe `data`, `currentUser` y `onNavigate` desde `App.jsx`.
- Lee tablas como `beneficiaries`, `families`, `deliveries`, `inventory_items`, `email_logs`, `donations`, `accounting_events`, `loan_records`, `debt_records`, `app_users`.

Estado:

- Es una pantalla operativa real.
- La logica de calculo esta mayoritariamente dentro de la vista.

### 4.2 Beneficiarios

Archivo:

- `src/pages/Beneficiaries.jsx`

Lineas aproximadas: 1-1652.

Funcionalidades reales:

- Listado de beneficiarios.
- Filtros y busqueda.
- Crear beneficiario.
- Editar beneficiario.
- Eliminar o solicitar eliminacion definitiva.
- Validacion de DNI/NIE duplicado mediante `dataStore.assertUniqueDocument`.
- Expediente completo en modal.
- Fotografia de beneficiario.
- Captura de foto con camara.
- Subida/eliminacion de foto mediante Supabase Storage cuando esta configurado.
- Asociacion con unidad familiar.
- Entregas vinculadas.
- Documentacion del expediente.
- Comunicaciones del beneficiario.
- Historial social y seguimiento.
- Exportacion/imprimir resumen de expediente.
- Crear entrega desde la ficha.
- Enviar email desde la ficha.

Servicios/datos usados:

- `actions.createBeneficiary`
- `actions.updateBeneficiary`
- `actions.deleteBeneficiary`
- `actions.createDeletionRequest`
- `actions.createBeneficiaryDocument`
- `actions.deleteBeneficiaryDocument`
- `actions.createSocialHistory`
- `actions.createDelivery`
- `actions.createEmailLog`
- `actions.createFamily`
- `actions.reloadData`
- `src/lib/beneficiaryPhotos.js`
- `src/lib/exporters.js`

Logica acoplada:

- Formularios, validaciones de UI, tabs del expediente, resolucion de familia, documentos, entregas, emails, seguimiento y foto viven dentro de la pantalla.

### 4.3 Comunicaciones

Archivo:

- `src/pages/Communications.jsx`

Lineas aproximadas: 1-2409.

Funcionalidades reales:

- Envio directo de email.
- Plantillas reutilizables.
- Campañas.
- Agenda.
- Historial de comunicaciones.
- WhatsApp mediante `wa.me`.
- Generacion o adjunto de justificantes.
- Registro de intentos en historial.
- Estadisticas de comunicaciones.
- Funciones exportadas `normalizeWhatsAppPhone` y `buildWhatsAppUrl`.

Servicios/datos usados:

- `actions.createEmailLog`
- `actions.updateEmailLog`
- `actions.deleteEmailLog`
- `actions.createSocialHistory`
- `actions.reloadData`
- `src/lib/emailClient.js`
- Edge Function `send-justificantes`

Logica acoplada:

- Mucha logica de canales, agenda, plantillas, historial y UI vive en una unica pantalla.

### 4.4 Familias

Archivo:

- `src/pages/Families.jsx`

Lineas aproximadas: 1-1127.

Funcionalidades reales:

- Listado de unidades familiares.
- Crear/editar familia.
- Archivar familia.
- Eliminar o solicitar eliminacion definitiva.
- Expediente familiar.
- Miembros vinculados.
- Historial familiar de ayudas.
- Documentos de familia o miembros.
- Observaciones.
- Linea temporal.
- Indicadores de menores, dependientes y estado.

Servicios/datos usados:

- `actions.createFamily`
- `actions.updateFamily`
- `actions.archiveFamily`
- `actions.deleteFamily`
- `actions.createBeneficiaryDocument`
- `actions.deleteBeneficiaryDocument`
- `actions.createSocialHistory`

Logica acoplada:

- Calculo de miembros, timeline, documentos y ayudas familiares dentro de la vista.

### 4.5 Entregas

Archivo:

- `src/pages/Deliveries.jsx`

Lineas aproximadas: 1-468.

Funcionalidades reales:

- Listado de entregas.
- Crear entrega.
- Cancelar entrega.
- Eliminar o solicitar eliminacion definitiva.
- Envio de email vinculado.
- Firma de recepcion.
- Datos del receptor.
- Seleccion de beneficiario y productos.
- Integracion con inventario mediante acciones globales.

Servicios/datos usados:

- `actions.createDelivery`
- `actions.cancelDelivery`
- `actions.deleteDelivery`
- `actions.createDeletionRequest`
- `actions.createEmailLog`
- `actions.reloadData`

Logica acoplada:

- Flujo de formulario, firma, productos y estado de entrega vive en pantalla y `useAppData`.

### 4.6 Justificantes

Archivo:

- `src/pages/Receipts.jsx`

Lineas aproximadas: 1-550.

Funcionalidades reales:

- Listado de justificantes derivados de entregas.
- Filtros por fechas, beneficiario, responsable y tipo de ayuda.
- Seleccion multiple.
- Generacion de ZIP.
- Generacion de ZIP mensual.
- Generacion de informe PDF de entregas.
- Envio de justificantes por correo.
- Historial de envios.
- Reapertura de PDFs almacenados.

Servicios/datos usados:

- `actions.reloadData`
- `src/lib/exporters.js`
- `src/lib/emailClient.js`
- Edge Function `send-justificantes`

Logica acoplada:

- Preparacion de seleccion, filtros y estados de envio en la pantalla.

### 4.7 Inventario

Archivo:

- `src/pages/Inventory.jsx`

Lineas aproximadas: 1-844.

Funcionalidades reales:

- Listado de productos.
- Crear/editar producto.
- Eliminar o solicitar eliminacion definitiva.
- Movimientos de entrada y salida.
- Stock actual.
- Stock minimo.
- Categorias.
- Lotes.
- Caducidad.
- Donante.
- Ubicacion.
- Alertas operativas.
- Tablas de productos y movimientos.

Servicios/datos usados:

- `actions.createInventoryItem`
- `actions.updateInventoryItem`
- `actions.deleteInventoryItem`
- `actions.createInventoryMovement`
- `actions.createDeletionRequest`

Logica acoplada:

- UI y parte del calculo de alertas viven en la pantalla.
- Validaciones fuertes estan en `useAppData`.

### 4.8 Donaciones

Archivo:

- `src/pages/Donations.jsx`

Lineas aproximadas: 1-1150.

Funcionalidades reales:

- CRM de donantes.
- Donantes particulares y empresas.
- Archivo/edicion/eliminacion de donantes.
- Relacion con donaciones, eventos contables y documentos.
- Certificado PDF de donacion.
- Indicadores economicos y sociales.

Servicios/datos usados:

- `actions.createDonorContact`
- `actions.updateDonorContact`
- `actions.archiveDonorContact`
- `actions.deleteDonorContact`
- Datos de `accounting_contacts`, `donations`, `accounting_events`, `accounting_documents`, `inventory_items`, `social_value_events`, `treasury_incomes`, `email_logs`.

Logica acoplada:

- CRM, certificado y relacion con contabilidad se calculan desde la vista y desde `useAppData`.

### 4.9 Contabilidad

Archivo:

- `src/pages/Accounting.jsx`

Lineas aproximadas: 1-2818.

Funcionalidades reales:

- Resumen economico.
- Alertas economicas.
- Movimientos contables.
- Operaciones economicas.
- Caja.
- Bancos.
- Transferencias.
- Prestamos.
- Deudas.
- Fichas de contactos.
- Cuentas financieras.
- Correcciones y anulaciones.
- Auditoria contable.
- Integracion con donaciones e inventario en operaciones economicas.

Servicios/datos usados:

- `actions.registerEconomicOperation`
- `actions.registerCashBankMovement`
- `actions.registerBankTransfer`
- `actions.correctCashBankMovement`
- `actions.voidCashBankMovement`
- `actions.createFinancialAccount`
- `actions.updateFinancialAccount`
- `actions.deleteFinancialAccount`
- `actions.createDonorContact`
- `actions.createDeletionRequest`

Logica acoplada:

- Es la pantalla mas grande y con mayor logica de dominio embebida.
- La logica economica critica esta repartida entre esta pantalla y `useAppData`.

### 4.10 Voluntarios

Archivo:

- `src/pages/Volunteers.jsx`

Lineas aproximadas: 1-1149.

Funcionalidades reales:

- Listado de voluntarios.
- Alta.
- Edicion.
- Eliminacion.
- Expediente de voluntario.
- Pestañas de resumen, datos personales, participaciones, formacion, documentacion, comunicaciones, observaciones e historial.
- Registro de historial de voluntariado.

Servicios/datos usados:

- `actions.createVolunteer`
- `actions.updateVolunteer`
- `actions.deleteVolunteer`
- `actions.createVolunteerHistory`

Logica acoplada:

- El expediente completo y sus tabs estan dentro de la pantalla.

### 4.11 Informes

Archivo:

- `src/pages/Reports.jsx`

Lineas aproximadas: 1-1355.

Funcionalidades reales:

- Informes de beneficiarios.
- Expedientes familiares.
- Historial de entregas.
- Estado de inventario.
- CRM de donantes.
- Linea economica consolidada.
- Voluntarios.
- Memoria.
- Indicadores estadisticos.
- Exportacion PDF con jsPDF.
- Exportacion Excel con XLSX.

Servicios/datos usados:

- Lee directamente multiples tablas desde `data`.
- Usa `jspdf`, `jspdf-autotable` y `xlsx`.

Logica acoplada:

- Definicion de informes, columnas, calculos y exportacion vive en la pantalla.

### 4.12 Usuarios y configuracion

Archivo:

- `src/pages/Settings.jsx`

Lineas aproximadas: 1-422.

Funcionalidades reales:

- Pestaña Entidad.
- Pestaña Correo.
- Pestaña Usuarios.
- Pestaña Estado del sistema.
- Crear usuario.
- Editar usuario.
- Desactivar.
- Reactivar.
- Bloquear.
- Eliminar.
- Restablecer contraseña.
- Matriz de permisos por modulo y accion.
- Auditoria.

Servicios/datos usados:

- `actions.updateOrganizationSettings`
- `actions.createUser`
- `actions.updateUser`
- `actions.deactivateUser`
- `actions.reactivateUser`
- `actions.blockUser`
- `actions.deleteUser`
- `actions.resetUserPassword`
- `src/lib/constants.js`
- `api/create-user.js`
- `api/admin-user.js`

Logica acoplada:

- Gestion de usuarios y configuracion estan mezcladas en una sola pantalla.

### 4.13 Copias

Archivo:

- `src/pages/Backup.jsx`

Lineas aproximadas: 1-151.

Funcionalidades reales:

- Exportacion completa.
- Importacion/restauracion.
- Separacion de tablas documentales.
- Preparacion del entorno de produccion por ambitos.
- Reset demo.

Servicios/datos usados:

- `actions.replaceAllData`
- `actions.prepareProductionEnvironment`
- `actions.resetDemo`

### 4.14 Panel del proveedor

Archivo:

- `src/pages/ProviderPanel.jsx`

Lineas aproximadas: 1-211.

Funcionalidades reales:

- Revision de solicitudes de eliminacion definitiva.
- Aprobar o rechazar solicitudes.
- Orientado al `Superadministrador del sistema`.

Servicios/datos usados:

- `actions.resolveDeletionRequest`

### 4.15 Login

Archivo:

- `src/pages/Login.jsx`

Lineas aproximadas: 1-133.

Funcionalidades reales:

- Login con email y contraseña.
- Recuperacion de contraseña.
- Flujo con `reset_token`.

Servicios/datos usados:

- `src/lib/auth.js`
- `api/request-password-reset.js`
- `api/reset-password.js`

### 4.16 Debug Admin

Archivo:

- `src/pages/DebugAdmin.jsx`

Lineas aproximadas: 1-279.

Funcionalidades reales:

- Diagnostico/soporte de administracion.
- Ruta especial `/debug/admin`.
- Solo debe quedar accesible bajo control estricto.

## 5. Componentes base

Carpeta:

- `src/components`

Componentes:

- `BrandLogo.jsx`: logo oficial.
- `Button.jsx`: boton base.
- `DeletionRequestForm.jsx`: solicitud de eliminacion definitiva.
- `DirectDeletionForm.jsx`: eliminacion directa.
- `FormField.jsx`: campo de formulario.
- `Layout.jsx`: layout principal y menu.
- `Modal.jsx`: modal base.
- `PageHeader.jsx`: cabecera de pagina.
- `StatCard.jsx`: tarjeta estadistica.

Valoracion:

- Componentes base utiles y reutilizables.
- No hay todavia una libreria de componentes amplia.
- Las pantallas grandes siguen definiendo muchos subcomponentes internamente.

## 6. Servicios, librerias y almacenamiento

### 6.1 `dataStore`

Archivo:

- `src/lib/dataStore.js`

Responsabilidad:

- Abstraccion de persistencia.
- Lee/escribe en Supabase si `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estan configuradas.
- Si no, usa `localStorage`.
- Carga todas las tablas mediante `loadAll`.
- CRUD generico: `list`, `create`, `update`, `remove`.
- Seed local desde `src/data/seed.js`.
- Compatibilidad con columnas antiguas mediante reintentos si faltan campos.

Tablas gestionadas:

- `organization_settings`
- `families`
- `beneficiaries`
- `social_history`
- `beneficiary_documents`
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
- `roles`
- `audit_logs`
- `app_users`

Riesgo:

- Es una abstraccion practica, pero no es todavia un Repository por entidad.
- Las pantallas dependen de nombres de tablas y estructuras de datos globales.

### 6.2 `useAppData`

Archivo:

- `src/hooks/useAppData.js`

Responsabilidad:

- Hook principal de datos y acciones.
- Contiene mas de 2300 lineas.
- Concentra reglas de negocio, validaciones, permisos y acciones.

Acciones principales:

- Beneficiarios: crear, editar, eliminar, documentos, historial social.
- Familias: crear, editar, archivar, eliminar.
- Entregas: crear, cancelar, eliminar.
- Comunicaciones: crear, actualizar, eliminar email log.
- Inventario: crear/editar/eliminar producto, registrar movimientos.
- Donantes: crear/editar/archivar/eliminar.
- Contabilidad: operaciones economicas, caja/banco, transferencias, correcciones, anulaciones, prestamos y deudas.
- Tesoreria legacy: ingresos, gastos, prestamos, cuentas.
- Voluntarios: crear, editar, eliminar, historial.
- Usuarios: crear, editar, desactivar, reactivar, bloquear, eliminar, reset contraseña.
- Auditoria.
- Backup y preparacion de produccion.
- Solicitudes de eliminacion definitiva.

Riesgo:

- Es el mayor punto de complejidad del ERP.
- Debe migrarse gradualmente a CORE/Services por dominio.

### 6.3 Autenticacion y permisos

Archivos:

- `src/lib/auth.js`
- `src/lib/constants.js`
- `src/lib/apiAuth.js`
- `api/_adminAuth.js`

Funcionalidades:

- Login local con usuarios demo si no hay Supabase.
- Login real con Supabase Auth si hay variables configuradas.
- Persistencia de usuario actual en `localStorage` con clave `pye-current-user`.
- Carga de perfil desde `public.app_users`.
- Sincronizacion de `auth_user_id` por email si falta.
- Estados de usuario: `Activo`, `Inactivo`, `Bloqueado`.
- Roles:
  - `Superadministrador`
  - `Presidenta`
  - `Secretaria`
  - `Tesorera`
  - `Coordinadora`
  - `Voluntario`
  - roles legacy como `Administrador`, `Coordinador`, `Consulta`.
- Permisos por modulo y accion:
  - `Ver`
  - `Crear`
  - `Editar`
  - `Eliminar`
- Ocultacion automatica de modulos sin permiso.
- `Superadministrador del sistema` reservado para proveedor.

Riesgo:

- Existe doble autoridad: permisos en frontend y RLS/funciones en Supabase.
- La autorizacion critica debe estar siempre reforzada en backend/RLS.

### 6.4 Supabase

Archivos:

- `src/lib/supabase.js`
- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/migrations/*`

Configuracion:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`
- `SUPABASE_SERVICE_ROLE_KEY` solo backend.

Estado:

- Supabase esta integrado en cliente.
- Supabase Auth se usa en produccion.
- Supabase Storage se usa para documentos y fotos.
- Existen RLS y migraciones de seguridad.

Riesgos:

- Algunas politicas iniciales son amplias para usuarios autenticados.
- Hay migraciones posteriores que endurecen permisos, por lo que el orden de aplicacion importa.
- Hay compatibilidad con esquemas antiguos mediante fallback en `dataStore`.

### 6.5 Correo y justificantes

Archivos:

- `src/lib/emailClient.js`
- Edge Function `send-justificantes`

Funcionalidades:

- Envio por Resend.
- Plantillas.
- Adjuntos PDF.
- Generacion de PDF en servidor.
- Persistencia de adjuntos en Supabase Storage.
- Registro en `email_logs`.
- Control de tamaño de payload.
- URL firmada para abrir PDF almacenado.

Riesgo:

- Edge Function `send-justificantes` es grande y muy critico.
- Debe conservarse, pero conviene aislar generacion PDF, almacenamiento y envio.

### 6.6 Exportadores

Archivo:

- `src/lib/exporters.js`

Lineas aproximadas: 1-1533.

Funcionalidades:

- PDFs de expedientes.
- Justificantes.
- Informes.
- ZIPs.
- Logos y QR.

Riesgo:

- Muy util, pero monolitico.
- Debe migrarse a servicios de documento por tipo.

## 7. Supabase Edge Functions

Carpeta:

- `api`

Endpoints:

| Endpoint | Archivo | Funcion |
| --- | --- | --- |
| Administrar usuario | `api/admin-user.js` | Editar, bloquear, desactivar, reactivar, eliminar y resetear usuarios con service role. |
| Crear usuario | `api/create-user.js` | Crear usuario en Supabase Auth y perfil en `app_users`. |
| Reparacion admin | `api/emergency-admin-repair.js` | Reparacion temporal de superadmin. |
| Crear usuario emergencia | `api/emergency-create-user.js` | Creacion temporal por secreto. |
| Resumen operaciones | Edge Function `operations-summary` | Endpoint protegido para resumen operativo. |
| Ping | `api/ping-test.js` | Prueba simple. |
| Solicitar reset | `api/request-password-reset.js` | Genera token y envia email por Resend. |
| Reset password | `api/reset-password.js` | Valida token y actualiza contraseña en Supabase Auth. |
| Enviar justificantes | Edge Function `send-justificantes` | Envio de PDFs por Resend, Storage e historial. |
| Auth admin helper | `api/_adminAuth.js` | Validacion de token y permisos admin. |
| Emergency helper | `api/_emergencyRepair.js` | Utilidades de reparacion. |

Riesgos:

- Los endpoints de emergencia deben eliminarse o quedar desactivados antes de cerrar produccion definitiva.
- Hay bastante logging de diagnostico, util para soporte, pero conviene revisar que no exponga datos sensibles.

## 8. Base de datos y RLS

Archivo base:

- `supabase/schema.sql`

Tablas principales:

- `beneficiary_sequence`
- `beneficiaries`
- `organization_settings`
- `families`
- `social_history`
- `beneficiary_documents`
- `inventory_items`
- `deliveries`
- `email_logs`
- `donations`
- `treasury_incomes`
- `treasury_expenses`
- `treasury_loans`
- `treasury_accounts`
- `inventory_movements`
- `volunteers`
- `volunteer_history`
- `roles`
- `audit_logs`
- `app_users`
- `deletion_requests`
- `password_reset_tokens`

Funciones SQL relevantes:

- `next_beneficiary_code`
- `can_write_treasury`
- `set_updated_at`
- `apply_delivery_effects`
- `current_app_user`
- `is_app_admin`
- `is_system_superadmin`
- `can_app_permission`
- `can_inventory_action`
- `register_inventory_movement`
- `cancel_delivery`

RLS:

- Activado en tablas principales.
- Politicas por usuario autenticado en tablas operativas.
- Politicas mas especificas para tesoreria, inventario, entregas, usuarios, eliminaciones y storage.

Migraciones destacadas:

- Usuarios/Auth: `20260619_add_users_auth.sql`, `20260622_users_production_fix.sql`, `20260623_stabilization_security.sql`.
- Permisos/auditoria: `20260620_users_permissions_audit.sql`, `20260702_enforce_authoritative_permissions.sql`.
- Inventario: `20260702_inventory_production_close.sql`.
- Entregas: `20260702_delivery_cancellation_security.sql`, `20260703_fix_delivery_cancellation_flow.sql`.
- Contabilidad: `20260702_accounting_base.sql`, `20260703_accounting_economic_operations_engine.sql`, `20260705_close_loans_debts_accounting.sql`, `20260705_merge_treasury_into_accounting.sql`.
- Familias: `20260706_close_families_module.sql`.
- Fotos: `20260701_add_beneficiary_photo.sql`, `20260701_configure_beneficiary_photo_storage.sql`.
- Voluntarios: `20260708_volunteer_code_unique.sql`.

## 9. Dependencias actuales

### 9.1 Dependencias runtime

- `@supabase/supabase-js`
- `react`
- `react-dom`
- `vite`
- `jszip`
- `lucide-react`
- `jspdf`
- `jspdf-autotable`
- `qrcode`
- `resend`
- `xlsx`

### 9.2 Dependencias desarrollo

- `tailwindcss`
- `postcss`
- `autoprefixer`
- `@vitejs/plugin-react`

### 9.3 Variables de entorno

Archivo:

- `.env.example`

Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMERGENCY_REPAIR_SECRET`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `PUBLIC_LOGO_URL`

Variables usadas tambien por codigo:

- `SUPABASE_URL`
- `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`
- `VITE_SYSTEM_PROVIDER_EMAIL`
- `VITE_PROVIDER_EMAIL`

Riesgo:

- `.env.example` no enumera todas las variables usadas por el codigo.

## 10. Logica acoplada a la vista

### 10.1 Acoplamiento por pantalla

Las pantallas no son componentes puramente visuales. Contienen:

- filtros,
- calculos,
- normalizacion,
- validaciones de UI,
- derivacion de indicadores,
- reglas de negocio puntuales,
- preparacion de documentos,
- preparacion de datos para tablas,
- control de modales y estados complejos.

Pantallas con mayor acoplamiento:

1. `src/pages/Accounting.jsx`
2. `src/pages/Communications.jsx`
3. `src/pages/Beneficiaries.jsx`
4. `src/pages/Reports.jsx`
5. `src/pages/Donations.jsx`
6. `src/pages/Families.jsx`
7. `src/pages/Volunteers.jsx`
8. `src/pages/Inventory.jsx`

### 10.2 Acoplamiento en `useAppData`

`useAppData` mezcla:

- capa de aplicacion,
- servicios de dominio,
- validacion,
- permisos,
- auditoria,
- llamadas a API,
- escritura en storage,
- orquestacion de contabilidad,
- mutaciones de inventario,
- manejo de errores,
- recarga de datos.

Esta pieza debe ser el primer objetivo de extraccion hacia Services/CORE.

### 10.3 Acoplamiento al almacenamiento

Aunque `dataStore` abstrae local/Supabase, las pantallas siguen dependiendo de:

- nombres de tablas,
- shape exacto de arrays en `data`,
- acciones especificas expuestas por `useAppData`,
- recarga global tras cada mutacion.

## 11. Partes migrables al CORE/Services/Repository diseñado

### 11.1 Beneficiarios

Migrar a:

- `BeneficiarioService`
- `BeneficiarioRepository`
- `DocumentacionService`
- `PhotoStorageService`

Extraer:

- validacion de documento,
- codigo automatico,
- historial social,
- expediente,
- foto,
- documentos,
- vinculacion familiar.

### 11.2 Familias

Migrar a:

- `FamiliaService`
- `FamiliaRepository`

Extraer:

- expediente familiar,
- miembros,
- archivado,
- historial familiar,
- timeline.

### 11.3 Inventario

Migrar a:

- `InventarioService`
- `InventarioRepository`
- `MovimientoStockService`

Extraer:

- alta/edicion de productos,
- validacion de stock,
- entradas/salidas,
- caducidades,
- stock bajo,
- deduplicacion por nombre/lote.

### 11.4 Entregas

Migrar a:

- `EntregaService`
- `EntregaRepository`
- `JustificanteService`

Extraer:

- creacion de entrega,
- validacion de beneficiario,
- validacion de productos,
- descuento de stock,
- actualizacion de historial,
- cancelacion,
- generacion de justificantes.

### 11.5 Donaciones y contabilidad

Migrar a:

- `DonacionService`
- `ContabilidadService`
- `CajaBancoService`
- `PrestamosDeudasService`

Extraer:

- donantes,
- donaciones economicas,
- donaciones en especie,
- valor social,
- movimientos contables,
- anulaciones,
- correcciones,
- documentos contables.

### 11.6 Comunicaciones

Migrar a:

- `ComunicacionService`
- `EmailService`
- `WhatsAppService`
- `AgendaService`

Extraer:

- plantillas,
- envios,
- historial,
- agenda,
- integracion con justificantes.

### 11.7 Usuarios y permisos

Migrar a:

- `UsuarioService`
- `PermisoService`
- `AuditoriaService`
- `AuthService`

Extraer:

- matriz de permisos,
- roles,
- estados,
- gestion de usuario,
- auditoria,
- validacion de ultimo superadministrador.

### 11.8 Informes

Migrar a:

- `InformeService`
- `ExportService`

Extraer:

- definiciones de informes,
- calculos,
- PDF,
- Excel.

## 12. Partes buenas que no conviene tocar sin necesidad

- Identidad visual y layout principal.
- `Layout.jsx`, por estar bien alineado con menu lateral y permisos.
- `BrandLogo.jsx`, `Button.jsx`, `Modal.jsx`, `PageHeader.jsx`, `StatCard.jsx`.
- Modelo de permisos por modulo/accion.
- Ocultacion de modulos por permisos.
- Flujo de Supabase Auth + `app_users`.
- Endpoints `create-user` y `admin-user` como base de administracion segura.
- Envio real de justificantes por Resend.
- Generacion de justificantes y PDFs, aunque deba refactorizarse mas adelante.
- `dataStore` como puente temporal local/Supabase.
- RLS y migraciones ya existentes.
- Vercel rewrite para SPA.

## 13. Partes que necesitan refactorizacion

Prioridad alta:

1. Dividir `useAppData.js` en servicios por dominio.
2. Separar Repository por entidad en lugar de `dataStore` generico.
3. Extraer reglas contables de `Accounting.jsx` y `useAppData.js`.
4. Extraer reglas de comunicaciones de `Communications.jsx`.
5. Extraer definicion/exportacion de informes de `Reports.jsx`.
6. Reducir dependencia de pantallas respecto al shape global de `data`.
7. Asegurar operaciones atomicas de entrega, inventario y contabilidad en Supabase.

Prioridad media:

1. Mover subcomponentes internos grandes a componentes especificos.
2. Normalizar errores y loading states.
3. Reducir logs de diagnostico en produccion.
4. Actualizar `.env.example` con todas las variables usadas.
5. Revisar endpoints de emergencia.

Prioridad baja:

1. Introducir tests de unidad para servicios extraidos.
2. Introducir tests e2e para flujos criticos.
3. Revisar textos mojibake en algunos archivos si afectan a UI.

## 14. Autenticacion

Estado actual:

- Demo local con usuarios en `localStorage`.
- Produccion con Supabase Auth.
- Perfil administrativo en `public.app_users`.
- Sesion cacheada en `localStorage`.
- Al iniciar, `App.jsx` refresca usuario contra Supabase si hay configuracion.
- Usuarios inactivos/bloqueados no pueden entrar.
- Superadministrador del sistema esta separado del superadministrador de asociacion.

Riesgos:

- Doble modo demo/produccion puede ocultar errores si se prueba sin Supabase.
- El frontend contiene permisos para UI, pero la seguridad real debe estar en RLS y APIs.
- Los endpoints con service role son correctos como patron, pero requieren variables bien protegidas.

## 15. Almacenamiento

### 15.1 Local

- `localStorage` con clave `pan-y-esperanza-real-data`.
- Seed desde `src/data/seed.js`.
- Modo demo completo.

### 15.2 Supabase

- Tablas PostgreSQL.
- Supabase Auth.
- Supabase Storage bucket `documentos`.
- Bucket de fotos `beneficiary-photos`.
- Funciones SQL para stock, entregas, permisos y cancelaciones.

### 15.3 Documentos

- Documentos y justificantes pueden almacenarse como data URL en local.
- En produccion, se usa Storage para justificantes y fotos.
- Hay recomendaciones de migrar documentos reales a Storage.

## 16. Riesgos tecnicos

### 16.1 Monolitos frontend

Hay archivos muy grandes:

- `src/pages/Accounting.jsx`: 2818 lineas.
- `src/pages/Communications.jsx`: 2409 lineas.
- `src/hooks/useAppData.js`: 2351 lineas.
- `src/pages/Beneficiaries.jsx`: 1652 lineas.
- `src/lib/exporters.js`: 1533 lineas.
- `src/pages/Reports.jsx`: 1355 lineas.

Riesgo:

- Dificultan pruebas, mantenimiento y migracion a servicios.

### 16.2 Operaciones criticas distribuidas

Entregas, inventario, historial, contabilidad y valor social se actualizan en varios pasos.

Riesgo:

- Inconsistencias si una operacion falla a mitad.

Mitigacion:

- RPC de Supabase o backend transaccional para flujos criticos.

### 16.3 Seguridad por capas incompleta si faltan migraciones

El sistema depende de que todas las migraciones de RLS se hayan aplicado en orden.

Riesgo:

- Politicas demasiado amplias si la base no esta actualizada.

### 16.4 Endpoints de emergencia

Archivos:

- `api/emergency-admin-repair.js`
- `api/emergency-create-user.js`
- `api/_emergencyRepair.js`

Riesgo:

- Deben tratarse como temporales y no quedar activos sin necesidad.

### 16.5 `.env.example` incompleto

El codigo usa variables no listadas de forma completa en `.env.example`.

Riesgo:

- Despliegues incompletos o comportamiento distinto entre local y produccion.

### 16.6 Falta de tests automatizados

No se observa script de test, lint ni typecheck.

Riesgo:

- Cambios en contabilidad, usuarios o entregas pueden romper flujos sin deteccion temprana.

### 16.7 Logs en produccion

Hay `console.info`, `console.warn` y `console.error` de diagnostico en auth, email y APIs.

Riesgo:

- Util para soporte, pero conviene revisar exposicion de datos personales o tokens parciales.

## 17. Relacion con el CORE diseñado en la web

El ERP oficial no debe ser sustituido.

La evolucion correcta es:

1. Mantener la interfaz oficial actual.
2. Mantener `Layout`, pantallas y flujo de usuario.
3. Extraer gradualmente logica de `useAppData` a servicios CORE.
4. Sustituir `dataStore` por repositories por dominio, manteniendo la misma interfaz de acciones hacia las pantallas durante la transicion.
5. Reutilizar ideas del CORE de la web:
   - `AuthService`
   - `BeneficiarioService`
   - `InventarioService`
   - `EntregaService`
   - `DashboardService`
   - `RecursoService`
   - `NotificacionService`
   - selector `LocalStorageRepository` / `SupabaseRepository`
   - providers/adaptadores para consumo publico.

## 18. Plan de evolucion recomendado

### Fase 1: estabilizar sin cambiar UI

- Crear contratos de Repository por modulo.
- Mantener `useAppData` como fachada temporal.
- Extraer primero funciones puras: validaciones, normalizaciones, calculos.
- Añadir tests sobre funciones extraidas.

### Fase 2: servicios por dominio

- Beneficiarios/Familias.
- Inventario/Entregas.
- Usuarios/Permisos/Auditoria.
- Comunicaciones/Email.
- Donaciones/Contabilidad.

### Fase 3: transacciones y Supabase

- Mover flujos criticos a RPC o backend:
  - crear entrega,
  - cancelar entrega,
  - registrar entrada/salida de inventario,
  - registrar operacion economica,
  - anular/corregir movimiento,
  - eliminar definitivamente.

### Fase 4: integracion con web publica

- Exponer recursos, transparencia, historias, galeria, FAQ y datos publicos desde el ERP oficial.
- Usar Supabase como origen.
- Mantener web publica consumiendo providers/adaptadores, sin acoplarse a pantallas ERP.

## 19. Conclusiones

- El ERP oficial esta localizado y es funcional en este proyecto.
- Existe una administracion unica con menu lateral y modulos reales.
- No hay que crear un segundo ERP.
- La arquitectura actual funciona, pero esta concentrada en grandes pantallas y en `useAppData`.
- La prioridad tecnica es evolucionar hacia CORE/Services/Repository sin alterar la interfaz existente.
- El proyecto ya esta conectado conceptualmente a Supabase, Auth, Storage, RLS, Vercel y Resend.
- Las zonas mas delicadas son contabilidad, entregas, inventario, usuarios y comunicaciones.

## 20. Archivos revisados

Principales:

- `package.json`
- `vite.config.js`
- `vercel.json`
- `.env.example`
- `src/main.jsx`
- `src/App.jsx`
- `src/components/Layout.jsx`
- `src/lib/constants.js`
- `src/lib/auth.js`
- `src/lib/supabase.js`
- `src/lib/dataStore.js`
- `src/hooks/useAppData.js`
- `src/lib/emailClient.js`
- `src/lib/beneficiaryPhotos.js`
- `src/lib/exporters.js`
- `src/pages/*.jsx`
- `api/*.js`
- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/migrations/*.sql`

Este documento es solo una auditoria. No introduce cambios funcionales, visuales ni de arquitectura en la aplicacion.
