# Ecosistema Pan y Esperanza

Documento maestro para definir el funcionamiento completo de la plataforma Pan y Esperanza de cara a la version 3.0.

Este documento no describe pantallas concretas ni implementacion tecnica. Define accesos, responsabilidades, limites, permisos, flujos y experiencia esperada para cada tipo de usuario.

## 1. Web publica

### Objetivo

La web publica es la puerta de entrada institucional de Pan y Esperanza. Su mision es explicar con claridad quien es la asociacion, que hace, como ayuda, como colaborar y como contactar.

Debe transmitir confianza, cercania, transparencia y rigor. No debe funcionar como panel operativo ni como repositorio de datos internos.

### Secciones

- Inicio / Hero.
- Quienes somos.
- Asi ayudamos.
- Historias que inspiran.
- Transparencia.
- Como colaborar.
- Galeria.
- Preguntas frecuentes.
- Contacto.
- Footer.
- Centro de Recursos.
- Paginas legales.

### Que informacion muestra

- Informacion institucional aprobada.
- Datos publicos de contacto.
- Canales de colaboracion.
- Recursos publicados desde el ERP.
- Historias, noticias o galerias aprobadas desde el ERP.
- Estadisticas agregadas de impacto.
- Enlaces legales.
- Acceso al ERP oficial mediante variable de configuracion.

### Que informacion nunca debe mostrar

- Datos personales de beneficiarios.
- Direcciones privadas de personas atendidas.
- Documentacion social o administrativa.
- Historias no autorizadas o identificables sin consentimiento.
- Datos internos de inventario, entregas, voluntarios o donantes.
- Informacion economica no validada.
- Datos operativos sensibles.
- Accesos internos sin control de permisos.

### Conexion con el ERP

La web publica no debe almacenar datos propios. Toda informacion dinamica debe proceder del ERP a traves de Supabase y de una capa de integracion.

Flujo esperado:

Administrador
-> ERP
-> Supabase
-> ResourceProvider / PublicDataProvider
-> Web publica

Contenidos dinamicos previstos:

- Recursos: Centro de Recursos.
- Historias: Modulo Historias.
- Galeria: Modulo Galeria.
- Transparencia: Dashboard e Informes.
- Empresas colaboradoras: Modulo Empresas.
- FAQ: Configuracion.
- Contacto: Configuracion.
- Donaciones: Modulo Donaciones.
- Campanas publicas: Modulo Campanas.

## 2. Portal Beneficiario

### Objetivo

El Portal Beneficiario sera el area privada para que una persona o familia atendida pueda consultar informacion relevante, recibir avisos y mantener su expediente actualizado sin acceder al ERP.

Debe ser sencillo, seguro, accesible y pensado para personas con diferentes niveles de alfabetizacion digital.

### Inicio

Debe mostrar:

- Saludo personalizado.
- Estado general del expediente.
- Proxima entrega, si existe.
- Avisos importantes.
- Documentacion pendiente.
- Recursos recomendados.
- Acciones disponibles.

No debe mostrar:

- Informacion de otros beneficiarios.
- Datos internos del ERP.
- Decisiones administrativas no comunicables.
- Observaciones internas de trabajadores o coordinadores.

### Proximas entregas

Debe permitir consultar:

- Fecha prevista.
- Lugar o canal de entrega.
- Estado.
- Indicaciones importantes.
- Documentacion necesaria.

No debe permitir:

- Modificar entregas confirmadas.
- Cambiar productos asignados.
- Ver stock disponible.
- Ver datos de otros beneficiarios.

### Historial

Debe mostrar:

- Entregas recibidas.
- Fechas.
- Tipo de ayuda.
- Justificantes disponibles para el beneficiario.

Debe ocultar:

- Valoraciones internas.
- Notas sociales privadas.
- Movimientos de inventario.
- Usuarios internos responsables, salvo que se decida mostrar contacto autorizado.

### Documentacion

Debe permitir:

- Ver documentos solicitados.
- Ver estado: pendiente, recibido, revisado, caducado.
- Subir documentos si el permiso esta habilitado.
- Recibir avisos de renovacion.

Estados recomendados:

- Pendiente.
- En revision.
- Aprobado.
- Rechazado.
- Caducado.

### Centro de Recursos

Debe mostrar recursos utiles segun:

- Situacion familiar.
- Provincia.
- Necesidades.
- Edad.
- Empleo.
- Vivienda.
- Salud.
- Tramitacion administrativa.

Los recursos proceden del ERP y solo se muestran si estan publicados.

### Solicitudes

Debe permitir crear solicitudes controladas:

- Solicitar revision del expediente.
- Solicitar cambio de datos.
- Solicitar informacion sobre entregas.
- Solicitar apoyo documental.
- Solicitar cita o contacto.

Cada solicitud debe generar:

- Registro en el ERP.
- Notificacion interna.
- Estado visible para el beneficiario.

Estados:

- Recibida.
- En revision.
- Requiere informacion.
- Resuelta.
- Cerrada.

### Avisos

Debe mostrar:

- Avisos de entrega.
- Documentacion pendiente.
- Renovaciones proximas.
- Cambios de horario o lugar.
- Recursos recomendados.
- Comunicaciones de la asociacion.

### Perfil

Debe permitir consultar y solicitar actualizacion de:

- Nombre.
- Telefono.
- Email.
- Direccion.
- Unidad familiar.
- Fecha de nacimiento.
- Codigo de beneficiario.
- Preferencias de comunicacion.

Los cambios sensibles no se aplican automaticamente: quedan pendientes de revision en el ERP.

### Seguridad

El acceso debe estar protegido por:

- Codigo de beneficiario.
- Fecha de nacimiento.
- OTP para acciones sensibles.
- Control de sesion.
- Registro de actividad.

Acciones sensibles:

- Subir documentacion.
- Solicitar cambio de datos personales.
- Cambiar telefono o email.
- Descargar documentos.
- Aceptar condiciones.

### Codigo de beneficiario

El codigo de beneficiario identifica el expediente de forma interna y segura.

No debe usarse como unico factor de autenticacion. Debe combinarse con fecha de nacimiento y, cuando corresponda, OTP.

### Fecha de nacimiento

La fecha de nacimiento puede utilizarse como verificacion inicial, pero no debe sustituir controles de seguridad adicionales.

### OTP para acciones sensibles

El OTP debe enviarse por un canal verificado:

- SMS.
- WhatsApp.
- Email.

Debe tener:

- Caducidad corta.
- Un solo uso.
- Registro de auditoria.
- Limite de intentos.

### Permisos

Puede:

- Ver su informacion basica.
- Consultar entregas propias.
- Consultar documentacion propia.
- Subir documentos si esta permitido.
- Crear solicitudes.
- Ver avisos.
- Ver recursos publicados.
- Actualizar datos mediante solicitud.

No puede:

- Editar directamente su expediente.
- Confirmar entregas.
- Modificar stock.
- Ver otros beneficiarios.
- Ver datos internos.
- Ver notas sociales privadas.
- Acceder al ERP.
- Cambiar su estado administrativo.

## 3. Portal Empresas

### Objetivo

El Portal Empresas permite a empresas colaboradoras gestionar su relacion con Pan y Esperanza de forma ordenada, consultar su impacto y coordinar donaciones o recogidas.

### Dashboard

Debe mostrar:

- Resumen de colaboracion.
- Donaciones recientes.
- Recogidas programadas.
- Campanas activas.
- Impacto agregado.
- Certificados disponibles.
- Avisos.

### Donaciones

Debe permitir:

- Registrar intencion de donar.
- Consultar donaciones realizadas.
- Consultar estado de recepcion.
- Adjuntar informacion de productos.
- Indicar volumen aproximado.
- Indicar condiciones de conservacion.

Tipos:

- Alimentos.
- Productos de primera necesidad.
- Donacion economica.
- Recursos o servicios.
- Logistica.

### Recogidas

Debe permitir:

- Solicitar recogida.
- Ver recogidas planificadas.
- Cambiar disponibilidad antes de confirmacion.
- Consultar estado.

Estados:

- Solicitada.
- Confirmada.
- En ruta.
- Recogida.
- Cancelada.

### Recursos

Las empresas podran proponer recursos utiles para publicar en el Centro de Recursos.

Todo recurso debe quedar pendiente de revision en el ERP.

### Certificados

Debe permitir descargar:

- Certificados de donacion.
- Justificantes de entrega.
- Informes de colaboracion.

Siempre segun validacion administrativa del ERP.

### Impacto

Debe mostrar estadisticas agregadas:

- Productos donados.
- Campanas apoyadas.
- Entregas facilitadas.
- Familias ayudadas de forma agregada.
- Evolucion de colaboracion.

Nunca debe mostrar datos personales de beneficiarios.

### Campanas

Debe permitir:

- Ver campanas activas.
- Asociarse a una campana.
- Consultar necesidades.
- Ofrecer productos o apoyo.

### Perfil

Debe incluir:

- Datos de empresa.
- Persona de contacto.
- CIF/NIF cuando exista.
- Direccion.
- Telefono.
- Email.
- Preferencias de comunicacion.
- Documentacion.

### Permisos

Puede:

- Ver su expediente de empresa.
- Crear solicitudes de donacion.
- Solicitar recogidas.
- Descargar certificados propios.
- Consultar impacto agregado propio.
- Proponer recursos.

No puede:

- Publicar recursos directamente.
- Ver otras empresas.
- Acceder a beneficiarios.
- Acceder a inventario interno.
- Modificar entregas.
- Ver datos personales.
- Acceder al ERP.

## 4. Portal Donantes

### Objetivo

El Portal Donantes permite a personas colaboradoras consultar sus aportaciones, recibir certificados, conocer su impacto agregado y participar en campanas.

### Inicio

Debe mostrar:

- Saludo personalizado.
- Ultimas donaciones.
- Campanas disponibles.
- Impacto agregado.
- Certificados pendientes o disponibles.
- Acceso rapido para donar.

### Mis donaciones

Debe mostrar:

- Fecha.
- Tipo.
- Importe o descripcion.
- Metodo.
- Estado.
- Certificado asociado.

Tipos:

- Bizum.
- PayPal.
- Transferencia.
- Stripe.
- Donacion mensual.
- Donacion en especie.

### Certificados

Debe permitir:

- Descargar certificados validados.
- Consultar justificantes.
- Solicitar revision si falta algun dato.

### Impacto

Debe mostrar impacto agregado y comprensible, nunca informacion personal de personas atendidas.

### Campanas

Debe permitir:

- Ver campanas activas.
- Donar a una campana.
- Consultar progreso agregado.
- Ver resultados publicados.

### Donar

Debe permitir iniciar:

- Donacion puntual.
- Donacion mensual.
- Donacion a campana.
- Donacion en especie, si aplica.

La operacion economica debe integrarse con pasarelas configuradas desde el ERP.

### Perfil

Debe incluir:

- Nombre.
- Email.
- Telefono opcional.
- Documento fiscal, si el donante lo aporta.
- Preferencias de comunicacion.
- Preferencias de certificado.

### Mi impacto

Gracias a tu colaboración:

👨‍👩‍👧 186 familias atendidas

👶 73 menores atendidos

🥫 4.280 kg de alimentos repartidos

📦 1.250 entregas realizadas

❤️ 12 campañas apoyadas

Nota legal:

"Los datos mostrados son estadísticas agregadas y no contienen información personal de las personas atendidas."

### Permisos

Puede:

- Ver sus donaciones.
- Descargar certificados propios.
- Actualizar su perfil.
- Donar.
- Participar en campanas.
- Ver impacto agregado.

No puede:

- Ver otros donantes.
- Ver beneficiarios.
- Ver inventario.
- Ver entregas internas.
- Ver datos economicos globales no publicados.
- Acceder al ERP.

## 5. ERP

### Objetivo

El ERP es la administracion oficial y unica fuente de verdad de Pan y Esperanza.

Toda informacion operativa, social, economica y publica debe nacer o validarse en el ERP antes de aparecer en cualquier otro acceso.

### Administradores

Responsabilidades:

- Gestion general.
- Validacion de datos.
- Supervision de modulos.
- Publicacion de contenidos.
- Revision de informes.
- Coordinacion de usuarios.

Permisos:

- Ver, crear y editar la mayoria de modulos.
- Gestionar configuracion permitida.
- Publicar contenidos.
- Revisar auditoria segun permisos.

### Coordinadores

Responsabilidades:

- Coordinar entregas.
- Organizar voluntarios.
- Revisar agenda.
- Gestionar campanas.
- Supervisar beneficiarios asignados.

Permisos:

- Ver y editar modulos operativos.
- Crear entregas.
- Planificar agenda.
- Gestionar campanas.
- Consultar informes operativos.

### Voluntarios

Responsabilidades:

- Participar en entregas.
- Apoyar inventario.
- Registrar asistencia.
- Consultar turnos.
- Recibir avisos.

Permisos:

- Acceso limitado.
- Ver tareas asignadas.
- Consultar agenda propia.
- Confirmar acciones permitidas.

No deben poder:

- Acceder a datos sensibles sin necesidad.
- Modificar expedientes completos.
- Alterar stock directamente.
- Gestionar permisos.

### Consulta

Responsabilidades:

- Supervisar informacion sin modificarla.
- Revisar informes.
- Apoyar auditorias internas.

Permisos:

- Solo lectura.
- Sin eliminacion.
- Sin cambios de estado.
- Sin publicaciones.

### Superadministrador

Responsabilidades:

- Gestion completa del sistema.
- Configuracion critica.
- Usuarios y permisos.
- Seguridad.
- Integraciones.
- Resolucion de incidencias.

Permisos:

- Administrar todos los modulos.
- Resolver eliminaciones definitivas.
- Gestionar configuracion avanzada.
- Revisar auditoria completa.

### Principio de permisos

Todo permiso debe definirse por modulo y accion:

- Ver.
- Crear.
- Editar.
- Eliminar.
- Exportar.
- Administrar.

Toda accion sensible debe registrarse en Auditoria.

## 6. Flujos del ecosistema

### Flujo general

ERP
-> Supabase
-> Web publica
-> Portal Beneficiario
-> Portal Empresa
-> Portal Donante

El flujo real de datos no debe ser circular sin control. Los portales pueden crear solicitudes o propuestas, pero el ERP siempre valida antes de consolidar datos.

### ERP -> Supabase

El ERP crea, valida y publica datos:

- Beneficiarios.
- Entregas.
- Inventario.
- Donaciones.
- Empresas.
- Voluntarios.
- Recursos.
- Campanas.
- Noticias.
- Galeria.
- Configuracion.
- Informes.

Supabase almacena:

- Datos operativos.
- Datos publicables.
- Estados.
- Auditoria.
- Archivos.
- Configuracion.

### Supabase -> Web publica

La web consume solo datos publicados:

- Recursos publicados.
- Historias publicadas.
- Galeria aprobada.
- Estadisticas agregadas.
- Datos de contacto.
- Campanas publicas.
- Empresas colaboradoras publicadas.

### Supabase -> Portal Beneficiario

El portal consulta datos filtrados por identidad:

- Expediente propio.
- Entregas propias.
- Documentacion propia.
- Avisos propios.
- Recursos recomendados.
- Solicitudes propias.

### Supabase -> Portal Empresa

El portal consulta datos filtrados por empresa:

- Perfil propio.
- Donaciones propias.
- Recogidas propias.
- Certificados propios.
- Impacto agregado propio.
- Campanas vinculadas.

### Supabase -> Portal Donante

El portal consulta datos filtrados por donante:

- Donaciones propias.
- Certificados propios.
- Campanas apoyadas.
- Impacto agregado.
- Perfil propio.

### Portales -> ERP

Los portales nunca modifican informacion critica directamente.

Generan:

- Solicitudes.
- Propuestas.
- Actualizaciones pendientes.
- Documentos en revision.
- Mensajes.
- Intenciones de donacion.

El ERP revisa y decide:

- Aprobar.
- Rechazar.
- Solicitar mas informacion.
- Archivar.
- Publicar.

## 7. Experiencia de usuario

### Usuario publico

Debe sentir:

- Confianza.
- Claridad.
- Cercania.
- Transparencia.
- Facilidad para ayudar o pedir informacion.

Debe poder:

- Entender la labor en menos de un minuto.
- Contactar facilmente.
- Colaborar sin friccion.
- Consultar recursos utiles.
- Ver impacto agregado.

### Beneficiario

Debe sentir:

- Seguridad.
- Respeto.
- Dignidad.
- Privacidad.
- Acompañamiento.

La experiencia debe ser:

- Muy clara.
- Con lenguaje sencillo.
- Mobile first.
- Sin sobrecarga visual.
- Con avisos comprensibles.
- Con pasos guiados.

### Empresa colaboradora

Debe sentir:

- Profesionalidad.
- Orden.
- Reconocimiento.
- Facilidad para colaborar.
- Visibilidad del impacto.

La experiencia debe ayudar a:

- Coordinar donaciones.
- Programar recogidas.
- Descargar certificados.
- Ver resultados agregados.
- Participar en campanas.

### Donante

Debe sentir:

- Gratitud.
- Transparencia.
- Control.
- Impacto real.
- Facilidad para seguir colaborando.

La experiencia debe permitir:

- Donar rapido.
- Consultar historial.
- Descargar certificados.
- Entender impacto.
- Unirse a campanas.

### Administrador ERP

Debe sentir:

- Control.
- Rapidez.
- Trazabilidad.
- Seguridad.
- Vision global.

La experiencia debe permitir:

- Tomar decisiones desde el Dashboard.
- Usar servicios centralizados.
- Evitar duplicidades.
- Auditar acciones.
- Publicar datos hacia la web.

### Coordinador ERP

Debe sentir:

- Orden operativo.
- Prioridades claras.
- Menos trabajo repetitivo.
- Agenda viva.
- Seguimiento de campañas.

### Voluntario ERP

Debe sentir:

- Claridad sobre sus tareas.
- Acceso solo a lo necesario.
- Facilidad para confirmar asistencia o acciones.
- Comunicacion directa.

### Superadministrador

Debe sentir:

- Control tecnico y funcional.
- Seguridad.
- Auditoria completa.
- Capacidad de resolver incidencias.
- Gobierno de permisos.

## Principios finales del ecosistema

- El ERP es la unica fuente de verdad.
- La web publica no almacena datos propios.
- Los portales no modifican datos criticos sin revision.
- Toda accion sensible debe pasar por Service y Repository.
- Toda informacion publica debe estar publicada desde el ERP.
- Toda informacion personal debe estar protegida por permisos y RLS.
- Cada entidad debe tener una unica representacion.
- Todo flujo debe generar trazabilidad.
- La experiencia debe adaptarse al tipo de usuario.
- La version 3.0 debe crecer sobre esta arquitectura sin duplicar sistemas.
