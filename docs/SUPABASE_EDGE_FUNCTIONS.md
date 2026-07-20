# Supabase Edge Functions

Desde el Sprint Backend-01, Vercel queda limitado al despliegue del frontend estático. Toda la lógica backend se ejecuta en Supabase Edge Functions.

## Mapa de funciones

| Edge Function | Sustituye a | Uso |
| --- | --- | --- |
| `contact` | `api/contact.js` | Formulario de contacto público |
| `volunteer` | `api/volunteer.js` | Formulario público de voluntariado |
| `send-portal-otp` | `api/send-portal-otp.js` | Acceso OTP de portales |
| `create-checkout-session` | `api/create-checkout-session.js` | Preparación de donaciones con Stripe |
| `send-justificantes` | `api/send-justificantes.js` | Envío de correos y justificantes |
| `create-user` | `api/create-user.js` | Alta de usuarios con Supabase Auth |
| `admin-user` | `api/admin-user.js` | Acciones administrativas sobre usuarios |
| `operations-summary` | `api/operations-summary.js` | Resumen protegido del Centro de Operaciones |
| `request-password-reset` | `api/request-password-reset.js` | Solicitud de recuperación de contraseña |
| `reset-password` | `api/reset-password.js` | Confirmación de nueva contraseña |
| `emergency-admin-repair` | `api/emergency-admin-repair.js` | Reparación administrativa de emergencia |
| `emergency-create-user` | `api/emergency-create-user.js` | Creación administrativa de emergencia |
| `ping-test` | `api/ping-test.js` | Prueba técnica de conectividad |

## Secretos requeridos en Supabase

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `CONTACT_TO_EMAIL`
- `VOLUNTEER_TO_EMAIL`
- `PUBLIC_LOGO_URL`
- `PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_DONATION_ONCE`
- `STRIPE_PRICE_DONATION_MONTHLY`
- `EMERGENCY_REPAIR_SECRET`

## Variables públicas en el frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_SUPABASE_BENEFICIARY_PHOTOS_BUCKET`
- `VITE_SUPABASE_DELIVERY_SIGNATURES_BUCKET`
- `VITE_REPOSITORY_DRIVER`
- `VITE_PROVIDER_EMAIL`
- `VITE_SYSTEM_PROVIDER_EMAIL`
- `VITE_GA_MEASUREMENT_ID`
- `VITE_META_PIXEL_ID`

## Despliegue

1. Configurar los secretos anteriores en Supabase.
2. Desplegar las funciones desde `supabase/functions`.
3. Configurar en el hosting frontend solo las variables `VITE_*` necesarias para el bundle.
4. Ejecutar `npm run build` y desplegar `dist` como frontend estático.
