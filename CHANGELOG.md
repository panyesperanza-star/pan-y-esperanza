# Changelog

Todas las notas relevantes de Pan y Esperanza ERP se documentan en este archivo.

## v3.0.0 - 2026-07-19

### Nuevas funcionalidades

- Centro de Operaciones como dashboard principal del ERP.
- Centro de Notificaciones integrado con avisos por modulo, prioridad, busqueda y lectura.
- Agenda Operativa para planificar entregas, campanas, recogidas, reuniones, eventos, voluntariado, avisos y caducidades.
- Motor de Campanas preparado para conectar beneficiarios, productos, voluntarios, entregas, agenda y notificaciones.
- Motor de Prioridades basado en reglas de negocio.
- Firma digital en entregas con almacenamiento preparado en Supabase Storage.
- Portal del Beneficiario con acceso privado por codigo, fecha de nacimiento y OTP.
- Portal de Colaboradores con acceso por email y OTP.
- Portal de Donaciones con acceso por email y OTP.
- Modulos ERP evolucionados: beneficiarios, inventario, entregas, donaciones, recursos, voluntarios, informes, configuracion y usuarios.

### Mejoras

- Experiencia visual profesional en Dashboard, Beneficiarios e Inventario.
- Flujo operativo documentado para donacion, inventario, entrega y beneficiario.
- Dashboard preparado para resumen diario, actividad reciente, agenda, productos criticos, beneficiarios pendientes y bloque IA.
- Portales con sesiones independientes y vistas privadas.
- Mejor separacion entre datos simulados, repositorios y futuras fuentes Supabase.

### Seguridad

- OTP de portales generado exclusivamente en servidor mediante `api/send-portal-otp.js`.
- OTP almacenado hasheado, con caducidad y uso unico.
- Sesiones de portales validadas desde servidor antes de cargar datos privados.
- Eliminado el fallback automatico a LocalStorage en produccion.
- RLS endurecida mediante `supabase/migrations/20260719_rc02_minimum_privilege_rls.sql`.
- Storage preparado para documentos, fotografias de beneficiarios y firmas de entrega.
- Auditoria prevista para accesos, OTP, acciones de portal, entregas, notificaciones y operaciones criticas.

### Arquitectura

- Arquitectura consolidada UI -> Service -> Repository -> Supabase.
- `LocalStorageRepository` queda limitado a desarrollo local.
- `SupabaseRepository` queda como repositorio de produccion.
- Servicios CORE preparados para Supabase: usuarios, beneficiarios, inventario, entregas, donaciones, recursos, voluntarios, informes, configuracion, agenda, notificaciones, campanas, prioridades, IA y portales.
- Documentacion de dominio, reglas de negocio, ecosistema y release candidate.

### Correcciones

- Eliminada la carga de datos protegidos de portales antes de autenticacion.
- Eliminada la generacion de OTP desde cliente.
- Encapsulados accesos directos restantes a `dataStore`.
- Corregidas politicas RLS demasiado amplias en la migracion RC-02.
- Build de produccion validado para la RC-02.

### Notas de migracion

- Ejecutar todas las migraciones SQL en Supabase antes del despliegue.
- Aplicar especificamente `supabase/migrations/20260719_rc02_minimum_privilege_rls.sql`.
- Configurar variables de entorno reales en Vercel o el proveedor de hosting.
- Crear y verificar buckets de Storage antes de activar documentos, fotografias y firmas.
- Crear el primer usuario administrador antes de abrir el ERP al equipo.
- Importar datos reales siguiendo `docs/DATA_MIGRATION.md`.
- Verificar OTP real con Resend antes de publicar portales.
