# ERP_QA_REPORT

Fecha de revisión: 2026-07-13
Proyecto revisado: `C:\Users\eliza\Documents\Codex\2026-06-16\quiero-una-aplicaci-n-web-completa\Pan-y-Esperanza-MVP`
Alcance: Dashboard, Beneficiarios, Inventario, Entregas, Donaciones, Centro de Recursos, Voluntarios, Informes y Configuración.
Tipo de revisión: QA funcional, revisión UX, revisión de flujos operativos y lectura de arquitectura existente.

## Resumen ejecutivo

La revisión detecta un bloqueo crítico: el ERP no llega a renderizar la pantalla inicial en la instancia local auditada. Al abrir `http://127.0.0.1:4311/`, la aplicación queda en blanco y la consola muestra un error de JavaScript antes de que el usuario pueda iniciar sesión. Por este motivo, el recorrido visual completo por módulos no puede completarse hasta resolver el arranque.

Además del bloqueo, el análisis del código identifica incoherencias funcionales y de experiencia: el Centro de Recursos tiene servicios y datos, pero no aparece como módulo navegable; hay credenciales precargadas en la pantalla de login; existen textos con codificación rota visibles potencialmente en UI; algunas automatizaciones de servicios son todavía no operativas; y varios procesos frecuentes siguen requiriendo pasos manuales repetitivos.

No se ha modificado ningún módulo ni diseño. Este documento es el único artefacto creado.

## Metodología

- Revisión de rutas y módulos desde `src/App.jsx`, `src/lib/constants.js` y `src/components/Layout.jsx`.
- Revisión de páginas principales en `src/pages`.
- Revisión de servicios y repositorios en `src/services`.
- Ejecución local del ERP oficial en modo demo local con Supabase desactivado.
- Inspección del navegador y consola durante el arranque.
- Clasificación de hallazgos por impacto operativo, riesgo de datos y fricción de usuario.

## Resultado del recorrido real

URL local usada: `http://127.0.0.1:4311/`

Resultado:

- La página queda en blanco.
- No aparece el login.
- No se puede acceder a Dashboard ni módulos.
- Consola del navegador:
  - `TypeError: Cannot read properties of null (reading 'app_users')`
  - Origen aproximado: `src/hooks/useAppData.js:1444-1448`

Conclusión: antes de cualquier revisión visual detallada, debe corregirse el ciclo inicial de carga de datos.

## Hallazgos por prioridad

### Crítica

#### C-01. El ERP no arranca: pantalla en blanco antes del login

- Archivo: `src/hooks/useAppData.js`
- Zona aproximada: líneas 1444-1448
- Evidencia: `const actions = useMemo(...)` accede a `data.app_users` cuando `data` todavía es `null`.
- Impacto: bloquea todo el ERP. Ningún usuario puede iniciar sesión ni navegar si se reproduce en el entorno activo.
- Módulos afectados: todos.
- Recomendación: proteger la creación de `actions` hasta que `data` exista o usar valores por defecto seguros antes de leer cualquier propiedad.

#### C-02. Credenciales precargadas en la pantalla de acceso

- Archivo: `src/pages/Login.jsx`
- Zona aproximada: líneas 9-10
- Evidencia:
  - email inicial: `elizabeth@panyesperanza.org`
  - contrasena inicial hardcodeada retirada durante el saneamiento de Release 3.0
- Impacto: riesgo alto si estas credenciales corresponden a una cuenta real o llegan a producción.
- Módulos afectados: acceso, usuarios, seguridad.
- Recomendación: no precargar credenciales en producción. Si se necesita demo local, condicionarlo a `import.meta.env.DEV`.

### Alta

#### A-01. Centro de Recursos no existe como módulo navegable

- Archivos:
  - `src/lib/constants.js`
  - `src/hooks/useAppData.js`
  - `src/services/resources/RecursoService.js`
  - `src/services/reports/InformeService.js`
- Evidencia:
  - existen `RecursoService`, `RecursoRepository` y acciones `createResource`, `publishResource`, etc.
  - `MODULES` no incluye un módulo `resources` o `recursos`.
  - no existe `src/pages/Resources.jsx`.
- Impacto: el ERP no ofrece una pantalla real para gestionar el Centro de Recursos, aunque la arquitectura ya existe.
- Recomendación: cuando se retome desarrollo funcional, crear o integrar la pantalla oficial dentro del ERP existente, sin ruta duplicada.

#### A-02. Permisos de Recursos no están representados en la matriz visible

- Archivos:
  - `src/lib/constants.js`
  - `src/services/resources/RecursoService.js`
- Zona aproximada:
  - `PERMISSION_MODULES`: líneas 34-49
  - `assertResourcePermission`: líneas 174-180
- Evidencia: `RecursoService` intenta validar `resources`, pero ese módulo no está en `PERMISSION_MODULES`; si falla, cae a `settings`.
- Impacto: no se puede asignar un responsable del Centro de Recursos con permisos específicos sin darle permisos de configuración.
- Recomendación: separar permisos de recursos de configuración.

#### A-03. `DashboardService` existe pero no recalcula ni persiste métricas

- Archivo: `src/services/dashboard/DashboardService.js`
- Zona aproximada: líneas 1-16
- Evidencia: `notifyDeliveryChanged`, `notifyDonationChanged`, `notifyVolunteerChanged` y `notifyConfigurationChanged` devuelven `true`.
- Impacto: los módulos llaman a notificaciones que no generan efectos reales; puede dar una falsa sensación de integración.
- Recomendación: convertirlo en un servicio real de métricas, invalidación de cache o eventos de dashboard.

#### A-04. Ruta técnica `/debug/admin` incluida en la aplicación

- Archivos:
  - `src/App.jsx`
  - `src/pages/DebugAdmin.jsx`
- Zona aproximada: `src/App.jsx:28`, `src/App.jsx:187`
- Impacto: aunque queda restringida al Superadministrador, es una superficie sensible que conviene aislar en entorno de mantenimiento o feature flag.
- Recomendación: ocultar o desactivar en producción salvo emergencia explícita.

#### A-05. Textos con codificación rota en UI

- Archivos detectados:
  - `src/lib/constants.js`
  - `src/pages/Login.jsx`
  - `src/components/Layout.jsx`
  - `src/hooks/useAppData.js`
- Evidencia: cadenas como `ConfiguraciÃ³n`, `GestiÃ³n`, `Cerrar sesiÃ³n`, `contraseÃ±a`.
- Impacto: reduce percepción profesional y puede afectar a confianza del usuario.
- Recomendación: normalizar codificación UTF-8 y revisar cadenas visibles antes de producción.

#### A-06. Entregas parece orientado a un producto por entrega

- Archivo: `src/pages/Deliveries.jsx`
- Zona aproximada: `DeliveryForm`, líneas 246-331
- Evidencia: el formulario trabaja con `inventory_item_id` y `quantity`.
- Impacto: una entrega real con varios productos obliga a registrar varias entregas o varios movimientos, haciendo el proceso lento.
- Recomendación: evolucionar a cesta de productos cuando se retome funcionalidad, manteniendo `EntregaService` e `InventarioService`.

### Media

#### M-01. Donaciones y Contabilidad tienen una división operativa poco clara

- Archivo: `src/pages/Donations.jsx`
- Zona aproximada: líneas 190-192
- Evidencia: la página indica que las donaciones se registran desde Contabilidad.
- Impacto: un usuario puede entrar en Donaciones esperando registrar una donación y terminar saltando de módulo.
- Recomendación UX: explicar mejor el flujo o añadir accesos guiados muy claros hacia la operación correspondiente.

#### M-02. Acciones de WhatsApp registran intención, no confirmación real

- Archivos:
  - `src/pages/Beneficiaries.jsx`
  - `src/pages/Deliveries.jsx`
  - `src/pages/Communications.jsx`
- Evidencia: se prepara `window.open(...)` y se registran logs de comunicación.
- Impacto: el ERP puede reflejar comunicaciones pendientes/preparadas que el usuario finalmente no envió.
- Recomendación: distinguir claramente "preparado", "enviado manualmente" y "confirmado".

#### M-03. Alertas nativas del navegador en flujos profesionales

- Archivos:
  - `src/pages/Reports.jsx:41`
  - `src/pages/Volunteers.jsx:1054`
  - `src/pages/Backup.jsx`
- Impacto: las alertas nativas interrumpen la experiencia y no siguen el sistema visual del ERP.
- Recomendación: sustituir por modales o avisos internos cuando se permita tocar UX.

#### M-04. Copias y limpieza usan lenguaje de prueba en módulo visible

- Archivo: `src/pages/Backup.jsx`
- Zona aproximada: líneas 6-13 y 113
- Evidencia: `Donaciones de prueba`, `Inventario de prueba`, `datos operativos de prueba`.
- Impacto: en un ERP real puede generar inseguridad sobre si los datos son definitivos.
- Recomendación: diferenciar claramente "limpieza inicial" de "datos de prueba" y condicionar opciones peligrosas.

#### M-05. Carga global de datos sin paginación

- Archivos:
  - `src/lib/dataStore.js`
  - `src/App.jsx`
- Evidencia: `loadAll()` carga todas las tablas y `App.jsx` ordena colecciones completas.
- Impacto: a medida que crezcan beneficiarios, entregas, documentos, logs y movimientos, el arranque será cada vez más lento.
- Recomendación: paginar por módulo y cargar datos bajo demanda.

#### M-06. Informes y exportaciones pueden bloquear el navegador

- Archivos:
  - `src/pages/Reports.jsx`
  - `src/lib/exporters.js`
- Evidencia: PDF/Excel se generan en cliente con librerías pesadas.
- Impacto: con datos reales grandes puede haber bloqueos de UI o exportaciones lentas.
- Recomendación: mantener exportaciones ligeras en cliente y mover informes grandes a Supabase Edge Functions.

#### M-07. Voluntarios usa historial flexible para turnos, asistencia, formación y documentos

- Archivo: `src/pages/Volunteers.jsx`
- Evidencia: turnos, asistencia, formación y documentos se registran como entradas de historial.
- Impacto: flexible, pero limita reportes, calendarios, recordatorios y automatizaciones.
- Recomendación: cuando toque funcionalidad, separar entidades operativas de voluntariado.

#### M-08. Configuración y Usuarios comparten página

- Archivo: `src/pages/Settings.jsx`
- Evidencia: `initialTab === 'users' ? 'Usuarios' : 'Configuración'`.
- Impacto: puede ser eficiente, pero mezcla administración del sistema con datos de entidad y correo.
- Recomendación: mantener navegación actual, pero reforzar separación interna y permisos.

### Baja

#### B-01. Botones iconográficos abundantes requieren aprendizaje

- Archivos:
  - `src/pages/Beneficiaries.jsx`
  - `src/pages/Inventory.jsx`
  - `src/pages/Deliveries.jsx`
- Impacto: los `title` y `aria-label` ayudan, pero usuarios no técnicos pueden necesitar etiquetas visibles en acciones críticas.
- Recomendación: en acciones destructivas o frecuentes, usar icono + texto cuando haya espacio.

#### B-02. Tablas con `min-width` y scroll horizontal

- Archivos:
  - `src/pages/Settings.jsx`
  - `src/pages/Reports.jsx`
  - otros módulos con tablas
- Impacto: solución aceptable, pero en móvil puede sentirse densa.
- Recomendación: revisar tarjetas/resumen móvil por módulo en una fase visual específica.

#### B-03. Mensajes vacíos correctos pero poco accionables

- Archivos:
  - `src/pages/Dashboard.jsx`
  - `src/pages/Donations.jsx`
  - `src/pages/Volunteers.jsx`
- Impacto: algunos estados vacíos explican que no hay datos, pero no siempre sugieren el siguiente paso.
- Recomendación: añadir CTA contextual cuando se permita mejorar UX.

## Revisión por módulo

### Dashboard

Estado QA: bloqueado por C-01 en recorrido real.

Fortalezas observadas por código:

- Centro de operaciones orientado a prioridades.
- Accesos rápidos hacia inventario, familias, comunicaciones y tareas.
- Generación de tareas automáticas desde datos actuales.

Riesgos:

- `DashboardService` no produce efectos reales.
- Si falla la Edge Function `operations-summary`, se emite `console.warn`.
- Puede volverse pesado porque depende de muchos datos precargados.

Automatizaciones posibles:

- Recalcular métricas al confirmar entrega, donación, voluntario o cambio de configuración.
- Crear una cola de tareas diaria persistente.
- Notificar automáticamente stock crítico, caducidades y justificantes pendientes.

### Beneficiarios

Estado QA: revisión por código.

Fortalezas:

- Expediente completo con resumen, documentación, entregas, comunicación, seguimiento y unidad familiar.
- Exportaciones PDF de expediente e informe social.
- Buen uso de relaciones con familia, entregas y documentos.

Riesgos/UX:

- WhatsApp registra una acción preparada aunque el envío real ocurre fuera del ERP.
- Subida de fotos/documentos desde navegador puede crecer en tamaño si no se controla.
- Muchos flujos se concentran dentro de modales densos.

Automatizaciones posibles:

- Renovaciones de documentación.
- Recordatorios de seguimiento por días sin ayuda.
- Detección de expedientes incompletos.

### Inventario

Estado QA: revisión por código.

Fortalezas:

- Productos, lotes, caducidad, ubicación, stock y movimientos.
- Integración con permisos y reglas de baja/stock.
- Avisos de stock bajo y caducidades.

Riesgos/UX:

- Registro de entradas/salidas depende de formularios manuales.
- No se detecta una experiencia de escaneo, importación masiva o plantillas de entrada.
- El usuario debe alternar entre productos y movimientos para reconstruir trazabilidad.

Automatizaciones posibles:

- Entrada automática desde donaciones en especie.
- Alertas de reposición.
- Sugerencia de reparto por caducidad próxima.

### Entregas

Estado QA: revisión por código.

Fortalezas:

- Integra beneficiario, inventario, justificante, email y WhatsApp.
- Valida stock a través del flujo de servicio.
- Permite anulación con motivo.

Riesgos/UX:

- El flujo parece centrado en un producto por entrega.
- Registrar una entrega real con varios lotes puede ser lento.
- Confirmación, justificante y comunicación son pasos separados.

Automatizaciones posibles:

- Cesta de productos.
- Plantillas de entrega por unidad familiar.
- Justificante y comunicación posterior en un solo flujo guiado.

### Donaciones

Estado QA: revisión por código.

Fortalezas:

- CRM de donantes con expediente, historial, documentos, comunicaciones y PDFs.
- Diferencia empresas/particulares y estado del donante.

Riesgos/UX:

- El propio módulo indica que las donaciones se registran desde Contabilidad.
- Puede generar confusión entre "donante", "donación económica", "donación en especie" y "contacto contable".

Automatizaciones posibles:

- Crear entrada de inventario desde donación en especie.
- Emitir agradecimiento/certificado automáticamente.
- Vincular campañas y empresas colaboradoras.

### Centro de Recursos

Estado QA: brecha funcional.

Fortalezas:

- Existen `RecursoService`, `RecursoRepository`, tablas `recursos` y `categorias_recursos`.
- Informes ya contemplan `Centro de Recursos`.

Riesgos:

- No existe módulo navegable.
- No hay pantalla para crear, editar, publicar o archivar recursos.
- Los permisos no están separados de Configuración.

Automatizaciones posibles:

- Publicación automática hacia web pública.
- Caducidad de recursos.
- Recursos personalizados para beneficiarios.

### Voluntarios

Estado QA: revisión por código.

Fortalezas:

- Expediente de voluntario con ficha, carné, documentación, participación, formación e historial.
- Exportación de carné, expediente y certificado.

Riesgos/UX:

- Turnos y asistencia parecen registrarse como historial genérico.
- No se detecta calendario operativo de voluntariado.
- Faltan automatizaciones de recordatorio y asistencia.

Automatizaciones posibles:

- Turnos recurrentes.
- Avisos de cambios.
- Control de asistencia por jornada.
- Formación obligatoria y vencimientos.

### Informes

Estado QA: revisión por código.

Fortalezas:

- Filtros, exportación PDF/Excel y memoria anual.
- Integra beneficiarios, familias, entregas, inventario, donaciones, recursos y voluntarios.

Riesgos/UX:

- Exportación en cliente puede ser pesada.
- No se detectan informes guardados, programación de envíos o plantillas por rol.

Automatizaciones posibles:

- Informes mensuales programados.
- Envío automático a responsables.
- Plantillas de transparencia para web pública.

### Configuración

Estado QA: revisión por código.

Fortalezas:

- Datos de asociación, correo, estado de sistema, almacenamiento y usuarios.
- Matriz de permisos editable.
- Auditoría visible.

Riesgos/UX:

- Configuración y Usuarios comparten superficie.
- Botones de prueba y credenciales deben protegerse bien en producción.
- Algunos textos con codificación rota pueden afectar esta pantalla.

Automatizaciones posibles:

- Validación de variables obligatorias.
- Comprobación periódica de integraciones.
- Alertas de configuración incompleta.

## Procesos lentos detectados

1. Registrar una entrega con varios productos.
2. Crear entradas de inventario desde donaciones en especie.
3. Mantener documentación y renovaciones de beneficiarios.
4. Confirmar comunicaciones hechas fuera del ERP.
5. Generar informes grandes desde navegador.
6. Gestionar turnos y asistencia de voluntarios desde historial.
7. Publicar recursos sin pantalla visible de gestión.

## Acciones repetitivas detectadas

1. Buscar beneficiario, abrir expediente, registrar entrega y generar justificante como pasos separados.
2. Registrar donación y después actualizar inventario.
3. Crear avisos o comunicaciones manuales tras entregas.
4. Repetir informes similares con filtros cada periodo.
5. Adjuntar documentación y renovar estados manualmente.

## Mejoras UX recomendadas

### Prioridad crítica

- Resolver arranque en blanco antes de cualquier revisión funcional.
- Eliminar credenciales precargadas en producción.

### Prioridad alta

- Crear/integrar el módulo oficial de Centro de Recursos.
- Separar permisos de Recursos.
- Corregir codificación de textos visibles.
- Convertir `DashboardService` en integración real.
- Revisar ruta `/debug/admin`.

### Prioridad media

- Guiar entrega multi-producto.
- Clarificar flujo Donaciones -> Contabilidad -> Inventario.
- Sustituir alertas nativas por feedback interno.
- Paginación/carga bajo demanda por módulo.

### Prioridad baja

- Revisar microcopy de estados vacíos.
- Mejorar etiquetas visibles en acciones iconográficas frecuentes.
- Optimizar vistas móviles con tablas densas.

## Checklist QA antes de volver a revisar visualmente

- [ ] El ERP renderiza login sin errores de consola.
- [ ] Login no muestra credenciales reales precargadas en producción.
- [ ] La navegación permite entrar a todos los módulos oficiales.
- [ ] No existen textos con codificación rota en UI.
- [ ] Centro de Recursos tiene estado definido: módulo navegable o explícitamente pospuesto.
- [ ] Los permisos de Recursos están claros.
- [ ] Dashboard refleja eventos reales o se documenta como lectura derivada.
- [ ] Entregas soporta el flujo operativo real de reparto.
- [ ] Donaciones en especie tienen trazabilidad hacia inventario.
- [ ] Informes pesados no bloquean el navegador.

## Conclusión

El ERP tiene una base funcional amplia y módulos con intención operativa clara, especialmente Beneficiarios, Inventario, Entregas, Donaciones, Voluntarios e Informes. Sin embargo, la prioridad inmediata es estabilizar el arranque: mientras exista la pantalla en blanco por acceso a `data` nulo, no es posible validar el ERP como usuario final ni considerarlo listo para uso continuo.

Después de corregir ese bloqueo, la siguiente revisión debe ser visual y funcional módulo por módulo, empezando por Dashboard, Beneficiarios, Inventario y Entregas.
