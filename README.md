# Pan y Esperanza MVP

Aplicacion web responsive para gestionar una asociacion sin animo de lucro. Esta version esta orientada a uso real inicial: beneficiarios, fichas individuales, entregas conectadas, historial, inventario con stock, voluntarios e informes.

## Funcionalidades nuevas

- Beneficiarios con direccion completa, codigo postal, unidad familiar, menores, situacion, ayuda solicitada, fecha de alta, estado activo/inactivo y ultima ayuda.
- Codigo automatico `PYE-00001`, `PYE-00002`, etc.
- Validacion para impedir DNI/NIE / NIE O PASAPORTE duplicados.
- Contador de beneficiarios activos en listado y panel.
- Boton `Ver ficha` con pantalla individual y historial.
- Boton para imprimir la ficha en PDF.
- Entregas vinculadas a beneficiarios con fecha, responsable, tipo de ayuda, cantidad y observaciones.
- Firma de recepcion en cada entrega con raton, dedo o lapiz tactil.
- Datos del receptor: nombre, DNI/NIE / NIE O PASAPORTE y fecha/hora de recepcion.
- Justificantes profesionales con logo, numero unico `PE-AAAA-000001`, fecha/hora de generacion, sello visual y codigo QR.
- Boton `Imprimir justificante de entrega` con PDF que incluye datos, productos, cantidades, responsable, receptor, firma del receptor y firma del responsable.
- Seccion `Justificantes` con filtros, seleccion multiple, `Generar ZIP`, `Generar ZIP mensual`, envio real de PDFs individuales, envio directo al beneficiario, historial de envios y reenvio.
- Nueva seccion `Comunicaciones` con envio de emails por Resend, plantillas reutilizables, adjunto PDF opcional, historial y estructura preparada para WhatsApp.
- Cada ZIP incluye todos los justificantes seleccionados y un PDF resumen de entregas.
- Beneficiarios con campo email para enviar el PDF individual al correo registrado.
- Boton `Enviar email` dentro de la ficha del beneficiario con plantillas de justificante, aviso de recogida, solicitud de documentacion y agradecimiento.
- Configuracion editable de identidad corporativa: entidad, CIF, direccion, telefono, correo, web y logo.
- Configuracion `Entidad > Correo` con remitente y prueba de envio mediante API serverless segura con Resend.
- Beneficiarios ampliados con nacimiento, sexo, nacionalidad, estado civil, primera/ultima atencion, documentos e historial social.
- Modulo `Familias` con codigo familiar, responsable, contacto, miembros, menores, dependientes e historial derivado de entregas.
- Inventario ampliado con categorias, lotes, caducidad, donante, ubicacion y alertas por stock/caducidad/producto agotado.
- Modulo `Donaciones` con certificado PDF de donacion.
- Modulo `Tesoreria` con ingresos, gastos, prestamos adelantados por voluntarios, caja/bancos e informes.
- Indicadores automaticos de tesoreria: saldo actual, total ingresos, total gastos, pendiente de devolver y balance mensual.
- Tesoreria avanzada con categorias de ingresos, categorias de gastos, prestamos parcialmente devueltos y movimientos de caja/bancos.
- Informes de tesoreria en PDF y Excel.
- Voluntarios ampliados con DNI/NIE / NIE O PASAPORTE, formacion, documentacion e historial preparado.
- Copias de seguridad con exportacion completa, importacion y restauracion local.
- Roles base preparados: Superadministrador, Presidenta, Secretaria, Tesorera y Voluntario.
- Login real con email y contrasena.
- Gestion avanzada de usuarios en `Entidad > Usuarios`: crear, editar, desactivar, reactivar, bloquear, eliminar con advertencia y restablecer contrasena.
- Pantalla `Usuarios > Permisos` con permisos por modulo y accion: Ver, Crear, Editar y Eliminar.
- Auditoria de acciones: usuario, fecha y accion realizada.
- Bienvenida automatica por correo al crear usuario.
- Informe PDF de entregas con numero total de entregas, beneficiarios atendidos, productos, cantidades y responsables.
- Historial automatico dentro de la ficha del beneficiario.
- Actualizacion automatica de fecha de ultima ayuda.
- Descuento automatico de stock al registrar una entrega.
- Movimientos de entrada y salida de inventario.
- Alertas de stock bajo.
- Exportacion de informes a PDF y Excel.
- Logo oficial desde `src/assets/logo-pan-y-esperanza.png` integrado en acceso, navegacion, cabeceras, justificantes e informes PDF.

## Ejecutar localmente

```bash
cd outputs
npm install
npm run dev
```

Abre la URL que indique Vite, normalmente `http://localhost:5173`.

Si no configuras Supabase, la aplicacion funciona en modo demo con `localStorage`.

Usuario inicial en modo demo:

- Email: `elizabeth@panyesperanza.org`
- Contrasena: `Elizabeth2026!`
- Rol: `Superadministrador`

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Abre SQL Editor.
3. Ejecuta `supabase/schema.sql`.
4. Opcionalmente ejecuta `supabase/seed.sql`.
5. Si ya tenias una base creada con una version anterior, ejecuta las migraciones de `supabase/migrations` en orden cronologico.
6. Copia `.env.example` a `.env`.
7. Rellena:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_publica
VITE_SUPABASE_STORAGE_BUCKET=documentos
RESEND_API_KEY=re_xxxxxxxxx
FROM_EMAIL=panyesperanza@gmail.com
PUBLIC_LOGO_URL=https://tu-dominio.org/logo-pan-y-esperanza.png
```

Para migrar los datos demo a PostgreSQL real:

1. Ejecuta `supabase/schema.sql` para crear tablas, triggers, RLS y bucket privado `documentos`.
2. Ejecuta `supabase/seed.sql` para cargar datos iniciales equivalentes al modo demo.
3. Crea el usuario inicial en Supabase Auth con email `elizabeth@panyesperanza.org`.
4. Asegura que exista una fila en `public.app_users` con el mismo email, rol `Superadministrador`, `is_active = true` y permisos `["*"]`.
5. Inicia sesion desde la app con ese email y contrasena real de Supabase Auth.

La aplicacion usa Supabase Auth en produccion si `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` estan configurados. Si faltan, se mantiene el modo demo local con `localStorage`.

## Fase 1 - Produccion real

Checklist recomendado antes de usar la aplicacion con datos reales:

1. Configurar Supabase PostgreSQL ejecutando `supabase/schema.sql`.
2. Ejecutar `supabase/seed.sql` solo si quieres migrar los datos demo/iniciales a tablas reales.
3. Crear usuarios en Supabase Auth y vincularlos por email con `public.app_users`.
4. Revisar permisos por modulo en `Entidad > Usuarios > Usuarios > Permisos`.
5. Configurar Resend con `RESEND_API_KEY` y `FROM_EMAIL`.
6. Crear/verificar el bucket `documentos` en Supabase Storage.
7. Abrir `Configuracion > Estado del sistema` y comprobar base de datos, correo, almacenamiento y ultima copia.
8. Crear una copia manual desde `Copias > Crear copia manual`.
9. Probar restauracion desde `Copias > Restaurar copia` con un JSON exportado.

## Configurar envio real de correos

La aplicacion incluye la funcion serverless `api/send-justificantes.js`, preparada para Vercel y Resend. No usa `mailto`, no abre Outlook y no intenta enviar SMTP desde React.

1. Crea una cuenta en Resend.
2. Verifica un dominio o direccion remitente.
3. Crea una API key.
4. En local o Vercel configura:
  - `RESEND_API_KEY`
  - `FROM_EMAIL`
  - `PUBLIC_LOGO_URL` para mostrar el logo en el HTML del correo.
5. En `Justificantes`, selecciona justificantes y pulsa `Enviar justificantes`.

Ejemplo de `.env` local:

```bash
RESEND_API_KEY=
FROM_EMAIL=panyesperanza@gmail.com
```

En Vercel, crea esas mismas variables en Project Settings > Environment Variables. `RESEND_API_KEY` solo se lee en la funcion serverless `api/send-justificantes.js`; nunca se importa en React ni se expone al navegador.

La app genera automaticamente los PDFs individuales de los justificantes seleccionados, los convierte en adjuntos y los envia mediante `/api/send-justificantes`. No se envia ZIP por correo. El resumen PDF puede adjuntarse marcando `Enviar tambien resumen PDF`.

`Entidad > Correo` permite guardar datos visibles de remitente y probar el envio. Las credenciales reales se leen solo en la funcion serverless desde variables de entorno:

- Nombre remitente.
- Correo remitente.
- Proveedor recomendado: Resend API.

El boton `Enviar correo de prueba` envia un correo HTML corporativo de prueba llamando a `/api/send-justificantes`. La API key nunca debe usarse directamente desde componentes React.

Para probar el envio localmente usa Vercel CLI con `vercel dev`, ya que `npm run dev` solo ejecuta Vite y no levanta la funcion serverless `api/send-justificantes.js`.

Mensajes del flujo de envio:

- Si falta `RESEND_API_KEY`: `Servicio de correo no configurado. Añada RESEND_API_KEY en el archivo .env.`
- Si falla Resend, la app muestra el error real devuelto por la API.
- Si el envio termina correctamente: `Correo enviado correctamente.`

El frontend nunca intenta parsear JSON de una respuesta vacia. Si Vite devuelve HTML porque la API no esta levantada, se registra el detalle en consola y se muestra un error controlado.

## Usuarios y autenticacion

La aplicacion incluye autenticacion local para demo y compatibilidad con Supabase Authentication para produccion.

Roles disponibles:

- Superadministrador
- Presidenta
- Secretaria
- Tesorera
- Voluntario

Cada usuario tiene nombre, apellidos, email, telefono, cargo, contrasena temporal, rol, estado activo/inactivo, foto opcional, ultimo acceso, fecha de creacion y creado por.

`Entidad > Usuarios` incluye filtros para ver usuarios activos, inactivos o todos. Cada usuario puede estar en estado `Activo`, `Inactivo` o `Bloqueado`.

Un usuario `Inactivo` o `Bloqueado` no puede iniciar sesion, pero conserva historial, permisos y datos. Puede reactivarse en cualquier momento con el boton `Reactivar usuario`, recuperando automaticamente su acceso anterior.

Antes de eliminar un usuario se muestra la advertencia: `Esta acción eliminará definitivamente el usuario y no podrá recuperarse.` La aplicacion recomienda desactivar en lugar de eliminar e impide desactivar o eliminar al ultimo Superadministrador activo.

La auditoria registra usuario desactivado, usuario reactivado y usuario eliminado, incluyendo fecha y responsable de la accion.

`Usuarios > Permisos` permite marcar `Ver`, `Crear`, `Editar` y `Eliminar` para Beneficiarios, Comunicaciones, Familias, Entregas, Justificantes, Inventario, Donaciones, Tesoreria, Informes, Usuarios y Configuracion.

La pestana `Auditoria` registra usuario, fecha y accion realizada, por ejemplo creacion de beneficiarios, entregas, movimientos de inventario, cambios de tesoreria y cambios de usuarios.

Permisos especiales de tesoreria:

- Superadministrador y Tesorera pueden crear, editar y eliminar registros.
- Voluntario puede acceder en modo lectura si tiene el permiso `treasury`.
- Los modulos sin permiso se ocultan automaticamente en el menu lateral.

En modo demo, los usuarios se guardan en `localStorage` dentro de `app_users`. En produccion:

1. Crea el usuario en Supabase Auth con email y contrasena.
2. Crea o actualiza su fila en `public.app_users` con el mismo email.
3. Asigna rol, estado y permisos.
4. Si la base ya existia antes de esta version, ejecuta `supabase/migrations/20260622_user_status_management.sql` para anadir el campo `status`.

La pantalla `Entidad > Usuarios` permite crear usuarios locales/demo y mantener el perfil de aplicacion. Al crear un usuario se solicita el envio de un correo de bienvenida con la contrasena temporal usando la configuracion de `Entidad > Correo`. Para alta real en Supabase Auth desde panel administrativo se recomienda una funcion serverless con Service Role Key, ya que esa clave no debe exponerse en el navegador.

## Desplegar en Vercel

1. Sube el proyecto a GitHub/GitLab/Bitbucket.
2. Importa el repositorio en Vercel.
3. Framework: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Anade las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_STORAGE_BUCKET`, `RESEND_API_KEY`, `FROM_EMAIL` y `PUBLIC_LOGO_URL`.
7. Pulsa Deploy.

## Como probar las nuevas funciones

1. Entra en Beneficiarios y crea una persona nueva.
2. Intenta crear otra con el mismo DNI/NIE / NIE O PASAPORTE: la app debe bloquearlo.
3. Pulsa `Ver ficha` para revisar datos e historial.
4. Pulsa el boton de impresora para generar el PDF de ficha.
5. Ve a Inventario y comprueba el stock de un producto.
6. Ve a Entregas, registra una entrega usando ese producto y una cantidad.
7. Escribe nombre y DNI/NIE / NIE O PASAPORTE del receptor, dibuja la firma y pulsa `Guardar firma`.
8. Dibuja tambien la firma del responsable.
9. Vuelve a Inventario: el stock debe bajar y debe aparecer un movimiento de salida.
10. Vuelve a la ficha del beneficiario: debe aparecer la entrega en historial, actualizarse la ultima ayuda y mostrar `Firma disponible`.
11. En Entregas pulsa `Imprimir justificante de entrega` y comprueba que el PDF incluye logo, numero de justificante, QR, sello, declaracion y firmas.
12. Ve a `Justificantes`, filtra por fechas, beneficiario, responsable o tipo de ayuda.
13. Selecciona varios justificantes y pulsa `Generar ZIP` para obtener un ZIP con los PDF y el resumen.
14. Usa `Generar ZIP mensual` para descargar automaticamente los justificantes del mes actual.
15. Pulsa `Enviar justificantes`, introduce destinatarios, asunto y mensaje; se enviaran los justificantes como PDFs individuales mediante la API de correo.
16. Pulsa `Generar informe de entregas` para crear el PDF resumen.
17. Reduce un producto por debajo del minimo para ver la alerta de stock.
18. Entra en `Tesoreria` con Elizabeth y crea ingresos, gastos, prestamos y cuentas.
19. Comprueba que los indicadores se recalculan automaticamente.
20. En `Tesoreria > Informes`, exporta PDF y Excel.
21. Cambia a un usuario Voluntario con permiso de tesoreria y verifica que solo ve el modulo en lectura.
22. En `Entidad > Correo`, revisa el estado Configurado/No configurado y pulsa `Enviar correo de prueba`.
23. En `Justificantes`, envia varios justificantes: deben adjuntarse como PDFs individuales, no como ZIP.
24. Selecciona un unico justificante y pulsa `Enviar justificante al beneficiario`; si hay email se enviara directamente, y si no hay email debe mostrarse `Este beneficiario no tiene correo electrónico registrado.`
25. En `Justificantes > Historial de envios`, pulsa `Reenviar` para reutilizar los adjuntos guardados.
26. En `Entidad > Usuarios`, crea un usuario con cargo, contrasena temporal y foto opcional.
27. Comprueba que se guardan ultimo acceso, fecha de creacion y creado por.
28. En `Usuarios > Permisos`, modifica permisos Ver/Crear/Editar/Eliminar por modulo.
29. Desactiva un usuario, comprueba que aparece en `Ver usuarios inactivos`, y pulsa `Reactivar usuario`.
30. Intenta eliminar un usuario y confirma que aparece la advertencia de eliminacion definitiva.
31. Revisa `Auditoria` tras crear beneficiarios, registrar entregas, modificar tesoreria, desactivar, reactivar o eliminar usuarios.
32. Entra en `Comunicaciones`, elige una plantilla, selecciona un beneficiario y prueba el envio de email con o sin justificante PDF.
33. Abre la ficha de un beneficiario y comprueba la pestaña `Emails` para ver el historial de comunicaciones registradas.

## Tesoreria

El modulo `Tesoreria` centraliza la gestion economica basica de la asociacion:

- `Ingresos`: fecha, concepto, importe, donante, forma de pago, observaciones y documento adjunto.
- `Ingresos`: categorias Donaciones, Subvenciones, Cuotas y Otros.
- `Gastos`: categorias Alimentacion, Higiene, Transporte, Alquiler, Material y Otros.
- `Prestamos`: persona, importe, fecha, motivo, pendiente de devolver, devuelto o parcialmente devuelto.
- `Caja y bancos`: caja efectivo, cuenta bancaria y movimientos.
- `Informes`: exportacion PDF y Excel con indicadores y movimientos.

El almacenamiento local guarda el nombre de los documentos adjuntos. En produccion se recomienda subir los archivos reales a Supabase Storage y guardar la URL o ruta en `document_name` / `invoice_name`.

## Firma de recepcion

En la pantalla de Entregas puedes dibujar la firma en el area habilitada con raton, dedo o lapiz tactil. El boton `Borrar firma` limpia el area y `Guardar firma` fija la firma actual en el formulario. Al guardar la entrega, la firma queda asociada a esa entrega como imagen PNG en formato data URL.

## Logo oficial

La aplicacion usa `src/assets/logo-pan-y-esperanza.png` como logo oficial. El archivo se importa desde React para la pantalla de acceso, menu lateral y cabecera principal. Tambien se carga en los PDF para fichas imprimibles, justificantes e informes, manteniendo sus proporciones para evitar deformaciones.

## Fase 2 profesional

La Fase 2 incorpora nuevos modulos y prepara la aplicacion para un uso mas real:

- `Entidad`: configuracion corporativa editable.
- `Familias`: unidades familiares vinculables a beneficiarios.
- `Donaciones`: registro y certificado PDF.
- `Tesoreria`: control economico con permisos diferenciados por rol.
- `Copias`: backup completo en JSON, importacion y restauracion.
- Beneficiarios con documentos subibles/descargables e historial social.
- Inventario con lotes, caducidad, donante y ubicacion.
- Informes ampliados para beneficiarios, familias, entregas, inventario, donaciones y voluntarios.

En modo local los documentos se guardan como data URL dentro de `localStorage`. En produccion se recomienda migrarlos a Supabase Storage y guardar solo la URL del archivo en `beneficiary_documents`.

## Justificantes profesionales

Cada entrega genera un numero de justificante con formato `PE-AAAA-000001`. El PDF del justificante incluye:

- Logo de Pan y Esperanza.
- Fecha y hora de generacion.
- Datos completos del beneficiario.
- Producto, cantidad, fecha, responsable y observaciones.
- Nombre y DNI/NIE / NIE O PASAPORTE del receptor.
- Declaracion de recepcion de ayuda.
- Firma del receptor y firma del responsable.
- Sello visual de Pan y Esperanza.
- Codigo QR con numero de justificante, beneficiario y fecha de entrega.

## Descarga masiva de justificantes

La seccion `Justificantes` muestra todos los justificantes derivados de entregas registradas. Permite filtrar por fecha desde/hasta, beneficiario, responsable y tipo de ayuda. Puedes marcar varias filas con casillas y generar un unico archivo ZIP con todos los PDF seleccionados.

El boton `Generar ZIP mensual` descarga automaticamente todos los justificantes del mes actual. Todos los ZIP incluyen tambien `Resumen-entregas.pdf`, con entregas totales, beneficiarios atendidos, productos entregados, cantidades y responsables.

El boton `Enviar justificantes` permite introducir uno o varios destinatarios, asunto y mensaje. La aplicacion genera un PDF individual por cada justificante seleccionado y los envia como adjuntos mediante la funcion serverless `api/send-justificantes.js`. No adjunta ZIP.

La casilla `Enviar tambien resumen PDF` permite adjuntar opcionalmente `Resumen-entregas.pdf` en el mismo correo.

El boton `Enviar justificante al beneficiario` esta pensado para moviles y para el envio individual: selecciona un unico justificante y, si el beneficiario tiene email registrado, se envia directamente a ese correo. Si no tiene email, la aplicacion muestra `Este beneficiario no tiene correo electrónico registrado.`

La subseccion `Historial de envios` guarda fecha, destinatario, usuario que envio, numero de justificantes y resultado. El boton `Reenviar` reutiliza los adjuntos guardados en el historial, sin regenerar los PDFs.

Todos los correos HTML incluyen logo, nombre de entidad, fecha, texto personalizado y datos corporativos de la entidad.

Si los beneficiarios seleccionados tienen email registrado, el campo de destinatarios de `Enviar justificantes` se rellena automaticamente como punto de partida. Esto deja preparada la evolucion hacia envios completamente automaticos al email del beneficiario.

El boton `Generar informe de entregas` crea solo el PDF resumen, sin ZIP.

## Comunicaciones

La seccion `Comunicaciones` centraliza emails y deja preparada la integracion futura con WhatsApp Business API. Incluye:

- Plantillas reutilizables: justificante de ayuda recibida, aviso de recogida, solicitud de documentacion y agradecimiento.
- Envio por Resend mediante la funcion serverless `api/send-justificantes.js`.
- Adjuntar automaticamente el justificante PDF de la ultima entrega del beneficiario.
- Descargar ese PDF antes de enviarlo.
- Historial con fecha, destinatario, asunto, usuario, adjuntos y resultado.
- Panel estadistico con beneficiarios activos, familias atendidas, menores atendidos, entregas realizadas y correos enviados.

La ficha individual del beneficiario tambien incluye `Enviar email` y una pestaña `Emails` con el historial asociado al correo registrado del beneficiario.

## Verificacion

Para comprobar produccion:

```bash
npm run build
```

En este entorno de Codex no hay `node` ni `npm` disponibles, por lo que la build debe ejecutarse en una maquina con Node.js 18 o superior instalado.
