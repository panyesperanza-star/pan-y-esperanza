# Prueba funcional - Portal Donante

Fecha: 2026-07-20
Sprint: Sprint Funcional Final - Portal Donante

## Objetivo

Validar que el ciclo funcional del Portal Donante queda operativo de principio a fin sin cambios visuales.

## Flujo validado

1. Alta de donante desde el ERP.
2. Registro de donacion economica.
3. Activacion automatica del portal mediante ficha activa en `donors`.
4. Solicitud OTP preparada mediante `send-portal-otp`, que localiza el donante por email en `donors`.
5. Acceso correcto mediante sesion valida del portal.
6. Visualizacion del historial unificado por `donor_id` y `donor_email`.
7. Cierre de sesion: una sesion revocada deja de dar acceso.
8. Nuevo acceso: una nueva sesion valida recupera el mismo historial.

## Resultado de la prueba local

```json
{
  "ok": true,
  "contactCreated": true,
  "donorCreated": "ana.donante@example.org",
  "donorActive": true,
  "donationsLinkedToSameDonor": true,
  "firstPortalHistoryCount": 2,
  "logoutBlocksOldSession": true,
  "secondAccessHistoryCount": 2,
  "auditEntries": 7
}
```

## Integracion Stripe

- `create-checkout-session` conserva el comportamiento actual y anade metadata para Stripe.
- `stripe-webhook` procesa `checkout.session.completed`.
- El webhook identifica el donante por email de Stripe.
- Si el donante no existe, lo crea en `donors`.
- Si ya existe, actualiza su ficha.
- La donacion queda vinculada con `donor_id`, `donor_email` y referencias Stripe para evitar duplicados.

## Estado

Portal Donante operativo de principio a fin a nivel funcional.