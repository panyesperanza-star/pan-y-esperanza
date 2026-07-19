# ERP_EVOLUTION_PLAN.md

Fecha: 2026-07-13

Proyecto objetivo:

`C:\Users\eliza\Documents\Codex\2026-06-16\quiero-una-aplicaci-n-web-completa\Pan-y-Esperanza-MVP`

Documento base leido:

`ERP_CURRENT_STATE.md`

## 1. Principio rector

El ERP oficial ya esta publicado y lo usan usuarios reales. La evolucion debe ser interna, gradual y conservadora.

Reglas de trabajo:

- No crear un segundo ERP.
- No cambiar el diseno.
- No rehacer la interfaz.
- No sustituir pantallas completas si no es imprescindible.
- No modificar la navegacion salvo que exista una razon funcional validada.
- No romper rutas actuales.
- No eliminar compatibilidad local/Supabase mientras haya usuarios o datos que dependan de ella.
- Usar `useAppData` como fachada temporal mientras se extrae logica hacia Services.
- Migrar por dominios pequeños, con build y pruebas manuales tras cada sprint.

Objetivo final:

Conservar la experiencia actual del ERP, pero mover reglas de negocio, persistencia, permisos, integraciones y operaciones criticas a una arquitectura CORE/Services/Repository mantenible.

## 2. Modulos y pantallas que deben conservarse como estan

Estas pantallas deben conservar su diseno, estructura visual, navegacion, textos principales y flujo de usuario. La refactorizacion debe ocurrir por debajo, manteniendo las mismas props y el mismo comportamiento visible.

| Modulo | Archivo | Decision |
| --- | --- | --- |
| Layout ERP | `src/components/Layout.jsx` | Conservar exactamente. Es la administracion oficial con menu lateral. |
| Logo y marca | `src/components/BrandLogo.jsx` | Conservar. Solo tocar si hay cambio oficial de marca. |
| Botones base | `src/components/Button.jsx` | Conservar. No redisenar. |
| Modales base | `src/components/Modal.jsx` | Conservar. |
| Cabecera de pagina | `src/components/PageHeader.jsx` | Conservar. |
| Tarjetas KPI | `src/components/StatCard.jsx` | Conservar. |
| Centro de operaciones | `src/pages/Dashboard.jsx` | Conservar visualmente. Extraer calculos a `DashboardService` por debajo. |
| Beneficiarios | `src/pages/Beneficiaries.jsx` | Conservar flujo y expediente. Extraer validaciones, documentos, fotos e historial. |
| Comunicaciones | `src/pages/Communications.jsx` | Conservar interfaz. Extraer plantillas, email, WhatsApp, agenda e historial. |
| Familias | `src/pages/Families.jsx` | Conservar expediente familiar. Extraer miembros, timeline y archivado. |
| Entregas | `src/pages/Deliveries.jsx` | Conservar flujo. Extraer validacion, stock, cancelacion y justificante. |
| Justificantes | `src/pages/Receipts.jsx` | Conservar pantalla. Extraer generacion, ZIP y envio. |
| Inventario | `src/pages/Inventory.jsx` | Conservar tablas y modales. Extraer stock, movimientos y alertas. |
| Donaciones | `src/pages/Donations.jsx` | Conservar CRM y certificados. Extraer donantes, certificados y relacion contable. |
| Contabilidad | `src/pages/Accounting.jsx` | Conservar interfaz. Refactorizar con maxima cautela por ser modulo critico. |
| Voluntarios | `src/pages/Volunteers.jsx` | Conservar expediente. Extraer historial, disponibilidad y documentacion. |
| Informes | `src/pages/Reports.jsx` | Conservar selector y salida. Extraer definiciones y exportadores. |
| Configuracion/Usuarios | `src/pages/Settings.jsx` | Conservar tabs. Extraer usuarios, permisos, auditoria y settings. |
| Copias | `src/pages/Backup.jsx` | Conservar. Extraer backup/importacion a servicio. |
| Panel proveedor | `src/pages/ProviderPanel.jsx` | Conservar. Extraer resolucion de eliminaciones. |
| Login | `src/pages/Login.jsx` | Conservar. Extraer flujos auth/reset a servicios. |

Pantallas que no deben expandirse ahora:

- `DebugAdmin.jsx`: mantener solo como herramienta de diagnostico controlada. No usar como base de nuevos modulos.
- Rutas legacy como `/treasury`: mantener compatibilidad interna, pero no construir sobre ellas.

## 3. Partes que necesitan refactorizacion interna

### 3.1 `useAppData.js`

Archivo:

- `src/hooks/useAppData.js`

Situacion:

- Es el mayor punto de acoplamiento.
- Carga datos, valida, autoriza, escribe, audita, llama APIs, actualiza inventario, gestiona contabilidad y expone acciones.
- Supera las 2300 lineas.

Evolucion:

- Mantener `useAppData` como fachada publica para las pantallas.
- Extraer por dentro servicios independientes.
- No cambiar firmas de `actions` hasta que cada pantalla este validada.
- Convertir cada accion en delegacion a un Service.

Ejemplo de direccion:

- `actions.createBeneficiary` debe delegar en `BeneficiarioService.create`.
- `actions.createDelivery` debe delegar en `EntregaService.create`.
- `actions.createInventoryMovement` debe delegar en `InventarioService.registerMovement`.
- `actions.registerEconomicOperation` debe delegar en `ContabilidadService.registerOperation`.

### 3.2 `dataStore.js`

Archivo:

- `src/lib/dataStore.js`

Situacion:

- CRUD generico sobre muchas tablas.
- Cambia entre Supabase y localStorage.
- Las pantallas conocen nombres de tablas y shape global de `data`.

Evolucion:

- Mantenerlo como compatibilidad temporal.
- Crear repositories por dominio sobre `dataStore`.
- No eliminar `dataStore` hasta que todos los dominios tengan repository.
- Introducir un selector equivalente al de la web: LocalStorage/Supabase automatico.

### 3.3 Pantallas grandes

Archivos prioritarios:

- `src/pages/Accounting.jsx`
- `src/pages/Communications.jsx`
- `src/pages/Beneficiaries.jsx`
- `src/pages/Reports.jsx`
- `src/pages/Donations.jsx`
- `src/pages/Families.jsx`
- `src/pages/Volunteers.jsx`
- `src/pages/Inventory.jsx`

Evolucion:

- No dividir visualmente al inicio.
- Primero extraer funciones puras y calculos.
- Despues mover subcomponentes internos si no cambia la UI.
- Mantener tests o capturas antes/despues en flujos criticos.

### 3.4 Exportadores y documentos

Archivos:

- `src/lib/exporters.js`
- `api/send-justificantes.js`

Evolucion:

- Separar por dominio: expediente, justificante, informe, certificado, ZIP.
- Mantener la salida visual de PDFs.
- No tocar plantillas sin prueba de regresion.

## 4. Logica acoplada a vistas que debe pasar a Services

### 4.1 Dashboard

Mover a `DashboardService`:

- KPIs.
- Prioridades.
- Tareas automaticas.
- Familias prioritarias.
- Alertas de inventario.
- Resumen general por permisos.

La vista debe recibir un `viewModel` ya calculado.

### 4.2 Beneficiarios

Mover a `BeneficiarioService`:

- Normalizacion de payload.
- Validacion de documento.
- Expediente completo.
- Vinculacion familiar.
- Historial social.
- Ultima ayuda.
- Alta/edicion/eliminacion.

Mover a `BeneficiaryPhotoService` o `StorageService`:

- Subida de foto.
- URL firmada.
- Eliminacion de foto.

### 4.3 Familias

Mover a `FamiliaService`:

- Calculo de miembros.
- Archivado.
- Timeline familiar.
- Historial familiar de ayudas.
- Documentacion asociada.

### 4.4 Entregas

Mover a `EntregaService`:

- Creacion de entrega.
- Validacion de beneficiario.
- Validacion de stock.
- Descuento de inventario.
- Generacion de numero de justificante.
- Actualizacion de historial.
- Cancelacion.

Operaciones criticas deben acabar en RPC/backend transaccional.

### 4.5 Inventario

Mover a `InventarioService`:

- Alta/edicion de productos.
- Duplicidad nombre/lote.
- Entradas y salidas.
- Stock bajo.
- Caducidades.
- Productos agotados.

### 4.6 Comunicaciones

Mover a `ComunicacionService` y `EmailService`:

- Plantillas.
- Envio directo.
- Campanias.
- Registro de email log.
- WhatsApp URL.
- Agenda.
- Reenvio.

### 4.7 Donaciones y contabilidad

Mover a servicios separados:

- `DonacionService` para donantes y donaciones.
- `ContabilidadService` para eventos contables.
- `CajaBancoService` para cuentas, movimientos y transferencias.
- `PrestamosDeudasService` para prestamos y deudas.
- `ValorSocialService` para valor social asociado a inventario/donaciones.

### 4.8 Informes

Mover a `InformeService`:

- Definicion de informes.
- Columnas.
- Filtros.
- Calculos.

Mover a `ExportService`:

- PDF.
- Excel.
- ZIP.

### 4.9 Usuarios y permisos

Mover a:

- `AuthService`.
- `UsuarioService`.
- `PermisoService`.
- `AuditoriaService`.

Extraer:

- Matriz de permisos.
- Roles.
- Estados.
- Ultimo superadministrador.
- Validaciones admin.
- Auditoria.

## 5. Almacenamiento actual del ERP

### 5.1 LocalStorage

Uso actual:

- Modo demo si no hay variables Supabase.
- Clave principal: `pan-y-esperanza-real-data`.
- Usuario actual: `pye-current-user`.
- Seed desde `src/data/seed.js`.

Ventaja:

- Permite desarrollo local y demo sin infraestructura.

Riesgo:

- Puede ocultar fallos de Supabase si se prueba en modo local.
- Mezcla datos demo con flujos reales si no se controla el entorno.

### 5.2 Supabase

Uso actual:

- `src/lib/supabase.js` crea cliente con `@supabase/supabase-js`.
- `dataStore` usa Supabase si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Auth usa Supabase Auth en produccion.
- Storage usa bucket `documentos` y bucket `beneficiary-photos`.
- Funciones serverless usan `SUPABASE_SERVICE_ROLE_KEY` solo en backend.

Riesgo:

- Repositories no estan separados por dominio.
- Las operaciones criticas aun dependen de orquestacion frontend/hook en varios casos.
- RLS depende de que todas las migraciones esten aplicadas en orden.

### 5.3 Serverless/Vercel

Uso actual:

- Usuarios reales via `api/create-user.js` y `api/admin-user.js`.
- Recuperacion de contrasenia via `api/request-password-reset.js` y `api/reset-password.js`.
- Justificantes por Resend via `api/send-justificantes.js`.
- Resumen operacional via `api/operations-summary.js`.
- Reparacion de emergencia via endpoints temporales.

## 6. Autenticacion y permisos reales

### 6.1 Autenticacion

Existe:

- Login local demo.
- Supabase Auth en produccion.
- Carga de perfil desde `public.app_users`.
- Sincronizacion de `auth_user_id` si falta.
- Persistencia de sesion actual en localStorage.
- Reset de password mediante endpoint.

### 6.2 Roles existentes

Roles principales:

- `Superadministrador`
- `Presidenta`
- `Secretaria`
- `Tesorera`
- `Coordinadora`
- `Voluntario`

Roles legacy/compatibilidad:

- `Administrador`
- `Coordinador`
- `Consulta`

Rol especial:

- `Superadministrador del sistema`

### 6.3 Permisos

Acciones existentes:

- `view`
- `create`
- `edit`
- `delete`

Modulos con permisos:

- Dashboard.
- Beneficiarios.
- Comunicaciones.
- Familias.
- Entregas.
- Justificantes.
- Inventario.
- Donaciones.
- Contabilidad.
- Voluntarios.
- Informes.
- Usuarios.
- Configuracion.
- Copias.

Estado:

- El menu se oculta por permiso.
- `canAccess` controla visibilidad.
- `canDo` controla acciones.
- El backend valida admin en endpoints sensibles.
- Supabase RLS refuerza seguridad si las migraciones estan aplicadas.

## 7. CORE, Services y Repository de la web que merece la pena trasladar

Trasladar como patron, no como sustitucion directa de UI.

### 7.1 Repository selector

Desde la web:

- `src/services/repositories/createRepository.js`
- `LocalStorageRepository.js`
- `SupabaseRepository.js`
- `src/services/supabase/client.js`

Utilidad para ERP:

- Formalizar LocalStorage/Supabase por repository.
- Reducir dependencia directa de `dataStore`.
- Permitir tests por dominio.

Adaptacion necesaria:

- El ERP ya usa `@supabase/supabase-js`, no el REST client ligero de la web.
- Conviene mantener Supabase JS en el ERP y trasladar el patron, no necesariamente el cliente exacto.

### 7.2 Services de dominio

Merece trasladar o adaptar:

- `AuthService`: como capa de sesion/perfil, alineada con Supabase Auth actual.
- `BeneficiarioService`: validaciones, expediente, historial.
- `InventarioService`: stock, productos, descuentos.
- `EntregaService`: flujo de entrega, validacion de stock, historial.
- `DashboardService`: KPIs y view model del centro de operaciones.
- `DonacionService`: donantes y donaciones.
- `UsuarioService`: roles, permisos y auditoria.
- `VoluntarioService`: expediente y historial.
- `InformeService`: definiciones y calculos de informes.
- `ConfiguracionService`: settings de asociacion.
- `StorageService`: assets/documentos/reportes.
- `NotificacionService`: eventos internos y alertas.

### 7.3 ResourceProvider

Desde la web:

- `src/integration/resources/ResourceProvider.js`
- `RecursoRepository.js`
- `ErpSupabaseResourceAdapter.js`
- `StaticResourceAdapter.js`

Utilidad:

- Es el patron correcto para que la web publica consuma recursos sin conocer el ERP.
- En el ERP debe existir el propietario editorial del contenido.
- En la web publica debe mantenerse el provider/adaptador.

## 8. Elementos que no deben trasladarse

No trasladar al ERP:

- Diseno, estilos o HTML de la web publica.
- Navegacion publica.
- Componentes visuales publicos.
- Hero, secciones, modales publicos o formularios publicos.
- Textos comerciales o institucionales de la web.
- Fallbacks estaticos de contenido publico como fuente de verdad en produccion.
- Estructura multipagina de la web.
- Implementaciones que dupliquen rutas o pantallas ERP.

No trasladar sin adaptar:

- `SupabaseRepository` REST de la web, porque el ERP ya usa Supabase JS.
- Datos demo del CORE de la web como datos reales.
- ViewModels de la web si no coinciden con las pantallas ERP.
- Nombres de rutas `/admin/*` si el ERP actual usa `/dashboard`, `/beneficiaries`, etc.

## 9. Orden de evolucion por sprints

### Sprint 0 - Seguridad de base

Objetivo:

Preparar refactor sin afectar usuarios.

Acciones:

- Congelar UI visual actual.
- Crear checklist de flujos criticos.
- Documentar contrato actual de `data`, `actions` y `dataStore`.
- Confirmar variables `.env` reales usadas.
- Revisar endpoints de emergencia y su estado.
- Ejecutar build antes y despues de cada cambio futuro.

Riesgo: bajo.

### Sprint 1 - Repository foundation

Objetivo:

Introducir capa Repository sin cambiar pantallas.

Acciones:

- Crear carpeta `src/services/repositories` en ERP.
- Crear interfaces por dominio alrededor de `dataStore`.
- Mantener `dataStore` como implementacion inicial.
- Crear `RepositoryProvider` o factory.
- No cambiar UI.
- No cambiar base de datos.

Riesgo: bajo-medio.

### Sprint 2 - Beneficiarios y Familias

Objetivo:

Extraer dominio social mas usado.

Acciones:

- Crear `BeneficiarioService`.
- Crear `FamiliaService`.
- Mover validaciones de documento, expediente, historial y familia.
- Mantener `actions.createBeneficiary`, `actions.updateBeneficiary`, etc. como fachada.
- Validar crear/editar/ver expediente/documentos/familia.

Riesgo: medio.

### Sprint 3 - Inventario

Objetivo:

Aislar stock y movimientos.

Acciones:

- Crear `InventarioService`.
- Crear `InventarioRepository`.
- Mover validacion de productos, duplicados, entradas/salidas, stock bajo y caducidades.
- Mantener pantalla intacta.

Riesgo: medio.

### Sprint 4 - Entregas

Objetivo:

Separar flujo critico de ayuda.

Acciones:

- Crear `EntregaService`.
- Crear `JustificanteService` inicial.
- Mover validacion de stock y beneficiario.
- Mantener `actions.createDelivery` y `actions.cancelDelivery`.
- Preparar RPC futura para operacion atomica.

Riesgo: alto, por impacto en stock e historial.

### Sprint 5 - Comunicaciones y Justificantes

Objetivo:

Separar correo, WhatsApp, plantillas y justificantes.

Acciones:

- Crear `ComunicacionService`.
- Crear `EmailService`.
- Crear `ReceiptService`.
- Mantener `api/send-justificantes.js` funcionando.
- Extraer generacion y registro sin cambiar PDFs.

Riesgo: medio-alto.

### Sprint 6 - Usuarios, permisos y auditoria

Objetivo:

Formalizar seguridad de aplicacion.

Acciones:

- Crear `AuthService`, `UsuarioService`, `PermisoService`, `AuditoriaService`.
- Mantener `src/lib/auth.js` como fachada temporal o adaptador.
- Revisar endpoints `create-user` y `admin-user`.
- Confirmar RLS con permisos reales.

Riesgo: alto.

### Sprint 7 - Donaciones y Contabilidad

Objetivo:

Separar modulo economico sin alterar interfaz.

Acciones:

- Crear `DonacionService`.
- Crear `ContabilidadService`.
- Crear `CajaBancoService`.
- Crear `PrestamosDeudasService`.
- Mover operaciones economicas paso a paso.
- Preparar transacciones Supabase.

Riesgo: muy alto. Debe ir con pruebas detalladas.

### Sprint 8 - Informes y exportaciones

Objetivo:

Sacar definiciones y generadores de las vistas.

Acciones:

- Crear `InformeService`.
- Crear `ExportService`.
- Dividir `exporters.js` por tipo de documento.
- Mantener salida visual identica.

Riesgo: medio.

### Sprint 9 - Web publica conectada al ERP

Objetivo:

Conectar contenido publico gestionado desde ERP sin tocar interfaz ERP.

Acciones:

- Definir modulos propietarios: recursos, historias, galeria, FAQ, transparencia, contacto.
- Exponer datos en Supabase con estados `published/draft`.
- Mantener la web publica consumiendo providers.
- No acoplar la web a componentes del ERP.

Riesgo: medio.

## 10. Plan de integracion futura con Supabase sin cambiar el diseno

### 10.1 Mantener Supabase actual

No sustituir Supabase JS. El ERP ya esta conectado con:

- Supabase Auth.
- Supabase Database.
- Supabase Storage.
- RLS.
- Vercel Functions con service role.

### 10.2 Crear repositories por dominio

Propuesta:

- `BeneficiarioRepository`
- `FamiliaRepository`
- `InventarioRepository`
- `EntregaRepository`
- `DonacionRepository`
- `ContabilidadRepository`
- `ComunicacionRepository`
- `UsuarioRepository`
- `InformeRepository`
- `ConfiguracionRepository`

Cada repository tendra dos implementaciones posibles:

- Local/demo sobre `dataStore`.
- Supabase sobre cliente existente.

### 10.3 RPC para operaciones criticas

Mover a Supabase RPC o backend:

- Crear entrega con descuento de stock.
- Cancelar entrega y revertir efectos.
- Registrar movimiento de inventario.
- Registrar operacion economica.
- Anular/corregir movimiento contable.
- Ejecutar eliminacion definitiva aprobada.

### 10.4 RLS y permisos

Plan:

- Revisar migraciones aplicadas en produccion.
- Alinear `canDo` frontend con `can_app_permission` en SQL.
- Asegurar que no haya tablas sensibles con politicas demasiado amplias.
- Validar roles reales con usuarios de prueba.

### 10.5 Storage

Plan:

- Mantener bucket `documentos`.
- Mantener bucket `beneficiary-photos`.
- Estandarizar rutas de documentos.
- Guardar solo referencias/rutas, no data URLs, en produccion.

## 11. Plan para enlazar la web publica con el ERP publicado

### 11.1 Acceso al ERP

La web publica debe enlazar al ERP mediante variable:

- `VITE_ERP_URL`

Reglas:

- No hardcodear la URL final en codigo.
- En desarrollo, si falta, mostrar aviso solo dev.
- En produccion, ocultar avisos tecnicos.

### 11.2 Contenido dinamico

El ERP debe ser propietario de:

- Recursos.
- Historias.
- Galeria.
- FAQ.
- Transparencia.
- Empresas colaboradoras.
- Datos de contacto.
- Donaciones/configuracion publica.

La web publica debe consumir:

- Providers/adaptadores.
- Supabase como fuente publicada.
- Solo registros `published`.

### 11.3 Primer flujo recomendado

Primer flujo completo:

ERP oficial
-> Supabase
-> `ResourceProvider`
-> Web publica `/recursos`

Motivo:

- Es el dominio menos peligroso.
- No afecta beneficiarios ni inventario.
- Permite probar el patron de publicacion.

### 11.4 Reglas de integracion

- No importar componentes ERP en la web publica.
- No importar componentes de la web en el ERP.
- Compartir solo contratos, servicios, repositorios y adaptadores.
- Separar datos internos de datos publicables.
- Usar estados editoriales: `draft`, `review`, `published`, `archived`.

## 12. Criterios de seguridad para cada sprint

Antes de empezar:

- Crear rama de trabajo.
- Ejecutar build limpio.
- Identificar flujo afectado.
- Preparar checklist manual.

Durante:

- Cambios pequeños.
- Mantener `actions` compatibles.
- No cambiar UI.
- No cambiar nombres de rutas.
- No cambiar permisos sin validacion.

Despues:

- `npm run build` correcto.
- Login probado.
- Menu lateral probado.
- Permisos probados.
- Flujo del modulo probado.
- Sin cambios visuales perceptibles.
- Sin perdida de datos local/Supabase.

## 13. Riesgos principales

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Romper `useAppData` | Alto | Extraer por fachada y mantener firmas. |
| Cambiar UI sin querer | Medio | No tocar JSX visual salvo adaptacion minima. |
| Inconsistencia stock/entregas | Alto | RPC/transacciones y pruebas. |
| Permisos desalineados | Alto | Comparar `canDo` con RLS. |
| Fallos de email/justificantes | Alto | Probar Resend, Storage y PDF por separado. |
| Datos demo en produccion | Medio | Controlar variables y entorno. |
| Endpoints emergencia activos | Medio | Revisar y cerrar cuando no sean necesarios. |
| Build sin tests | Medio | Introducir tests de servicios gradualmente. |

## 14. Resultado esperado de la evolucion

Al finalizar el proceso:

- El ERP oficial seguira siendo el unico panel de administracion.
- El diseno se mantendra intacto.
- Las pantallas conservaran sus rutas y flujo actual.
- `useAppData` quedara reducido a fachada o eliminado gradualmente.
- Cada dominio tendra Service y Repository.
- Supabase sera la fuente real mediante repositories y RPC donde haga falta.
- La web publica consumira datos publicados por el ERP sin duplicar administracion.
- El mantenimiento sera mas seguro para usuarios reales.

## 15. No hacer ahora

- No redisenar pantallas.
- No crear otro `/admin`.
- No introducir React Router sin una fase especifica.
- No cambiar rutas actuales.
- No reemplazar Supabase JS por el cliente REST de la web.
- No migrar contabilidad antes de beneficiarios/inventario/entregas.
- No eliminar `dataStore` hasta que exista cobertura por repositories.
- No eliminar endpoints de emergencia sin confirmar si siguen siendo necesarios.
- No conectar nuevos contenidos publicos antes de cerrar el contrato de publicacion.

Este plan no implementa funcionalidades. Solo define la evolucion segura del ERP oficial.
