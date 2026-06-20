# Guia de despliegue - Pan y Esperanza

## Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql`.
3. Ejecuta todas las migraciones de `supabase/migrations` en orden.
4. Crea el bucket `documentos`.
5. Crea usuarios en Authentication.
6. Vincula usuarios con `supabase/production-users.sql`.

Variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_STORAGE_BUCKET=documentos
```

## Resend

1. Crea cuenta en Resend.
2. Verifica dominio o remitente.
3. Crea API key.
4. Configura:

```bash
RESEND_API_KEY=
FROM_EMAIL=panyesperanza@gmail.com
PUBLIC_LOGO_URL=https://app.panyesperanza.org/logo-pan-y-esperanza.png
```

## Vercel

1. Importa el repositorio.
2. Si el repositorio contiene la carpeta completa del trabajo, usa `outputs` como Root Directory.
3. Framework: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Anade todas las variables de entorno.
7. Deploy.

## Dominio

Dominio deseado:

```text
app.panyesperanza.org
```

DNS:

```text
Tipo: CNAME
Nombre: app
Valor: cname.vercel-dns.com
```

Cuando Vercel confirme el dominio, actualiza `PUBLIC_LOGO_URL`.

## Verificacion

1. Login con Supabase Auth.
2. `Entidad > Estado del sistema`.
3. `Entidad > Correo > Comprobar conexion`.
4. Crear beneficiario.
5. Registrar entrega.
6. Imprimir justificante.
7. Enviar justificante.
8. Crear backup.
9. Instalar PWA en movil.
