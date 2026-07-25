# QA-002 - Modulo de Entregas

Fecha: 2026-07-25

## Alcance revisado

- Modulo ERP `/deliveries`.
- Alta de entrega desde Entregas y desde expediente de Beneficiario.
- Anulacion, eliminacion definitiva o solicitud de eliminacion.
- Firma digital y Storage `delivery-signatures`.
- Generacion y envio de justificantes.
- Historial de entregas en expediente.
- Confirmacion de asistencia desde Portal del Beneficiario.
- Casos `No podre asistir` y `Necesito ayuda`.
- Apertura relacionada desde Centro de Atencion Social.
- Preparacion de apertura desde Agenda y Portal.

## Incidencias encontradas y corregidas

| Prioridad | Incidencia | Correccion |
| --- | --- | --- |
| Alta | El formulario de alta no mostraba errores controlados si fallaba la creacion, por ejemplo por stock insuficiente o firma obligatoria. | `DeliveryForm` captura errores, evita promesas sin manejar, muestra mensaje dentro del modal y bloquea doble envio mientras guarda. |
| Alta | La anulacion podia dejar el error fuera del modal si fallaba RPC, permisos o validacion. | `CancellationForm` captura errores, muestra mensaje controlado y bloquea doble envio durante la anulacion. |
| Alta | Vaciar manualmente `Fecha y hora de recepcion` podia provocar una fecha invalida. | El campo acepta valor vacio y `toDateTimeLocal` devuelve cadena vacia si recibe una fecha invalida. |
| Alta | Una excepcion React en el modulo podia dejar la pantalla de Entregas en blanco. | Se anadio una barrera de error local con mensaje amigable y boton `Volver a intentar`. |
| Critica | El flujo `Necesito ayuda` del Portal podia romper la Edge Function al registrar la notificacion por una referencia corrupta `requestá.id`. | Se corrigio a acceso seguro `request?.id` en `send-portal-otp`. |

## Funcionalidad verificada por codigo

| Flujo | Estado |
| --- | --- |
| Crear entrega | Usa `actions.createDelivery` -> `EntregaService.create` -> `EntregaRepository.create`; recarga datos tras guardar. |
| Crear desde expediente | Usa el mismo `DeliveryForm` y la misma accion centralizada. |
| Eliminar entrega | Usa `actions.deleteDelivery` -> `EntregaService.remove`; respeta permisos de eliminacion definitiva o solicitud. |
| Cancelacion | Usa RPC `cancel_delivery` en Supabase y fallback controlado en local si la RPC no existe. |
| Firma digital | Usa `actions.saveDeliverySignature` -> `EntregaService.saveSignature` -> `EntregaRepository.saveSignatureImages` -> Storage. |
| Justificante PDF | Usa `printDeliveryReceiptPdf` y renderiza datos de entrega, beneficiario, producto y firmas. |
| Envio de justificante por email | Usa `sendEmailViaApi` hacia Edge Function `send-justificantes`; registra email log si procede. |
| Portal: asistencia confirmada | `BeneficiaryPortal` -> `PortalApiService.confirmDeliveryAttendance` -> Edge Function -> `deliveries.attendance_status = confirmed`. |
| Portal: no podre asistir | Valida motivo y actualiza `attendance_status = unavailable`. |
| Portal: necesito ayuda | Actualiza `attendance_status = needs_contact`, crea solicitud en `beneficiary_portal_profile_updates` y notifica al ERP. |
| Centro de Atencion Social | Abre la entrega relacionada mediante navegacion a `/deliveries?item=...` y resalta la entrega. |

## UX revisada

- El listado de Entregas mantiene tabla con scroll horizontal controlado.
- Los errores de alta y anulacion ya aparecen en el contexto del modal.
- Los botones de PDF, Email, WhatsApp, Firma, Anular y Eliminar se mantienen sin duplicar funcionalidad.
- La firma digital sigue en modal y permite raton o pantalla tactil.
- En movil la tabla sigue siendo ancha; no rompe la pantalla, pero exige desplazamiento horizontal.

## Incidencias pendientes

Estas incidencias no se han corregido en QA-002 porque implican funcionalidades visibles nuevas o cambios de flujo:

| Prioridad | Incidencia pendiente | Motivo |
| --- | --- | --- |
| Media | No existe accion visible de editar entrega. | Requiere crear flujo de edicion, validaciones y permisos especificos. |
| Media | No existe accion visible de reprogramar entrega. | Requiere definir si reprogramar equivale a editar fecha/hora o crear evento asociado. |
| Media | No existe estado visible independiente `Completada`; el modulo distingue principalmente `Activa` y `Anulada`. | Requiere definir transicion de estado y efectos sobre inventario/historial. |
| Baja | Agenda no abre una entrega concreta de forma directa salvo que exista una referencia navegable preparada. | Requiere ampliar la integracion visual Agenda -> Entregas. |
| Baja | La tabla de Entregas es funcional pero densa en movil. | Requiere rediseño UX, no correccion funcional. |

## Validaciones ejecutadas

- `npm run build`: correcto.
- `git diff --check`: correcto.
- `node --check supabase/functions/_shared/legacy-handlers/send-portal-otp.js`: correcto.

## Estado

QA-002 queda corregido en las incidencias funcionales detectadas sin anadir nuevas funcionalidades.

Pendiente de validacion visual y funcional con sesion ERP autenticada en produccion:

- Crear entrega real.
- Firmar entrega.
- Generar PDF.
- Enviar justificante.
- Confirmar asistencia desde Portal del Beneficiario.
- Ver actualizacion inmediata en ERP.
