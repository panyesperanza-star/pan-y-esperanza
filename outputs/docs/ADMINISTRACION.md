# Guia de administracion - Pan y Esperanza

## Acceso inicial

1. En produccion, crea el usuario en Supabase Auth.
2. Vincula ese usuario en `public.app_users`.
3. El primer usuario debe tener rol `Superadministrador`.
4. Desde `Entidad > Usuarios` crea el resto del equipo.

## Revision diaria

1. Abre `Panel`.
2. Revisa alertas de stock, productos proximos a caducar, balance y ultimos movimientos.
3. Abre `Entregas` para registrar nuevas ayudas.
4. Abre `Justificantes` para imprimir o enviar PDFs.
5. Abre `Copias` al final del dia si se desea una copia manual.

## Usuarios y permisos

Ruta: `Entidad > Usuarios > Usuarios > Permisos`.

Permisos disponibles:

- Ver
- Crear
- Editar
- Eliminar

Modulos:

- Beneficiarios
- Familias
- Entregas
- Justificantes
- Inventario
- Donaciones
- Tesoreria
- Informes
- Usuarios
- Configuracion

No desactives el ultimo usuario `Superadministrador`.

## Auditoria

Ruta: `Entidad > Usuarios > Auditoria`.

Registra acciones clave:

- Creacion y edicion de beneficiarios.
- Entregas.
- Inventario.
- Tesoreria.
- Usuarios.
- Copias de seguridad.

## Copias de seguridad

Ruta: `Copias`.

Opciones:

- Base de datos
- Documentos
- Todo

Para restaurar, selecciona un JSON generado por la propia aplicacion. La app valida que el archivo contenga tablas reconocidas antes de reemplazar datos locales.

## Correo

Ruta: `Entidad > Correo`.

1. Pulsa `Comprobar conexion`.
2. Revisa `RESEND_API_KEY` y `FROM_EMAIL`.
3. Pulsa `Enviar correo de prueba`.
4. Si falla, revisa las variables de entorno en Vercel.

## PWA movil

Android:

1. Abre la app en Chrome.
2. Menu.
3. Instalar app.

iPhone:

1. Abre la app en Safari.
2. Compartir.
3. Anadir a pantalla de inicio.
