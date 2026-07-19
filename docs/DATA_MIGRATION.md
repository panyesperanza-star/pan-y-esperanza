# Data Migration - Pan y Esperanza ERP v3.0.0

Este documento describe como importar datos reales al ERP. No se importan datos reales en esta fase.

## Objetivo

Migrar datos operativos a Supabase de forma ordenada, verificable y segura.

## Principios

- No importar datos sin backup previo.
- No mezclar datos reales con datos demo.
- No saltarse relaciones.
- No cargar documentos sin expediente asociado.
- No crear stock sin movimiento de origen.
- No modificar stock desde fuera de InventarioService o procesos autorizados.
- Mantener trazabilidad: origen -> lote -> inventario -> entrega -> beneficiario.

## Datos a importar

### Configuracion

- Datos de la asociacion.
- Logo.
- Correos.
- Configuracion de PayPal, Bizum, Stripe y Resend cuando existan.
- Preferencias generales.

### Usuarios y roles

- Usuarios administrativos.
- Roles.
- Permisos.
- Estados.

### Beneficiarios y familias

- Familias.
- Beneficiarios.
- Unidad familiar.
- Direcciones.
- Contacto.
- Necesidades especiales.
- Alergias.
- Situacion laboral.
- Observaciones.
- Documentacion.
- Historial social.

### Inventario

- Productos.
- Categorias.
- Lotes.
- Stock.
- Caducidades.
- Ubicaciones.
- Donante u origen.
- Movimientos historicos.

### Entregas

- Entregas realizadas.
- Beneficiario.
- Fecha.
- Responsable.
- Productos.
- Cantidades.
- Justificantes.
- Firmas si existen.

### Donaciones

- Donaciones economicas.
- Donaciones en especie.
- Empresas.
- Particulares.
- Metodo.
- Estado.
- Documentacion o certificados.

### Recursos

- Categorias.
- Recursos publicados.
- Recursos destacados.
- Estado.
- Autor.
- Etiquetas.
- Provincia.

### Voluntarios

- Expedientes.
- Disponibilidad.
- Turnos.
- Asistencias.
- Formacion.
- Documentacion.
- Historial.

### Agenda y campanas

- Eventos.
- Campanas.
- Beneficiarios asociados.
- Productos asociados.
- Voluntarios asociados.
- Estado.

## Orden recomendado

1. Configuracion de la asociacion.
2. Roles y permisos.
3. Usuarios administrativos.
4. Familias.
5. Beneficiarios.
6. Documentacion de beneficiarios.
7. Historial social.
8. Empresas y colaboradores.
9. Donantes.
10. Inventario base.
11. Movimientos de inventario.
12. Donaciones.
13. Entregas.
14. Justificantes y firmas.
15. Voluntarios.
16. Recursos.
17. Agenda.
18. Campanas.
19. Notificaciones historicas si se decide conservarlas.
20. Auditoria inicial de migracion.

## Validaciones previas

Antes de importar:

- Los CSV o fuentes estan en UTF-8.
- Los identificadores son unicos.
- No hay DNI/NIE duplicados cuando aplique.
- No hay correos duplicados en usuarios.
- Las fechas usan formato `YYYY-MM-DD`.
- Las cantidades son numericas.
- Los importes usan punto decimal.
- Los productos tienen origen.
- Las entregas tienen beneficiario existente.
- Los documentos tienen expediente asociado.

## Validaciones posteriores

Despues de importar:

- Numero de beneficiarios coincide.
- Numero de familias coincide.
- Numero de productos coincide.
- Stock total coincide con movimientos.
- No hay stock negativo.
- Entregas conservan productos.
- Donaciones en especie estan trazadas.
- Documentos abren correctamente.
- Firmas abren correctamente.
- Portales muestran solo datos propios.
- Dashboard refleja metricas esperadas.
- RLS no permite lecturas indebidas.

## Importacion de Storage

Orden:

1. Crear buckets.
2. Subir fotografias de beneficiarios a `beneficiary-photos`.
3. Subir documentos a `documentos`.
4. Subir firmas a `delivery-signatures`.
5. Actualizar tablas con URLs o rutas.
6. Probar apertura desde ERP.

No hacer buckets publicos para documentos privados.

## Limpieza de datos demo

Antes de importar datos reales:

- Confirmar que el entorno es Supabase de produccion.
- Confirmar que LocalStorage no participa en produccion.
- Eliminar datos demo desde scripts o SQL controlado.
- Registrar accion en auditoria.

No eliminar datos reales sin backup.

## Prueba piloto

Importar primero una muestra:

- 2 familias.
- 3 beneficiarios.
- 5 productos.
- 3 movimientos.
- 2 entregas.
- 1 donacion economica.
- 1 donacion en especie.
- 1 voluntario.
- 2 recursos.

Validar extremo a extremo antes de importar el volumen completo.

## Criterio de exito

La migracion se considera correcta cuando:

- Los datos cargan en ERP.
- Las relaciones son coherentes.
- No hay errores de consola.
- No hay errores de Repository.
- RLS sigue activa.
- Portales solo muestran datos autorizados.
- Dashboard muestra metricas coherentes.
- Backup posterior realizado.
