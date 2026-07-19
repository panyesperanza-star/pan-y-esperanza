# ERP Business Rules

Documento de referencia obligatoria para todo el desarrollo futuro del ERP de Pan y Esperanza.

Estas reglas definen las condiciones inmutables del sistema. Cualquier nueva funcionalidad, refactorizacion, integracion o migracion de datos debera respetarlas antes de considerarse terminada.

## Regla 1: Toda entrada de productos debe tener un origen

Toda entrada de productos en el sistema debe estar asociada a un origen identificable.

Origen permitido:

- Donacion de empresa
- Donacion de particular
- Compra
- Regularizacion autorizada

Nunca podran aparecer productos en Inventario sin un movimiento de origen.

## Regla 2: Inventario es la unica fuente de verdad

Inventario es la unica fuente de verdad para stock, lotes, ubicaciones, caducidades y movimientos de productos.

Ningun modulo puede crear o modificar stock directamente.

Todo cambio de stock debera realizarse unicamente mediante InventarioService.

## Regla 3: Ninguna entrega podra generar stock negativo

Ninguna entrega podra confirmarse si no existe disponibilidad suficiente en Inventario.

Si no existe stock suficiente, la entrega debera quedar bloqueada antes de su confirmacion.

El sistema nunca debera permitir stock negativo como resultado de una entrega, ajuste o integracion automatizada.

## Regla 4: Toda entrega confirmada debe generar registros vinculados

Toda entrega confirmada debe generar automaticamente:

- Movimiento de inventario.
- Historial del beneficiario.
- Justificante.
- Registro de auditoria.
- Actualizacion del Dashboard.

Una entrega no se considerara completa si alguno de estos registros obligatorios no queda preparado o generado segun corresponda.

## Regla 5: Todo cambio importante debera registrarse en Auditoria

Todo cambio relevante del sistema debera registrarse en Auditoria.

Registrar:

- Usuario.
- Fecha.
- Accion.
- Modulo.
- Resultado.

La auditoria debe permitir reconstruir que ocurrio, quien lo hizo, cuando lo hizo, sobre que modulo actuo y cual fue el resultado.

## Regla 6: El ERP sera el unico origen de la informacion

El ERP sera el unico origen de informacion operativa y publica.

La web publica nunca almacenara datos propios.

Toda la informacion publica debera proceder del ERP.

## Regla 7: Toda modificacion debera pasar por capas

Toda modificacion del sistema debera seguir siempre este flujo:

Vista
↓
Service
↓
Repository
↓
Base de datos

Nunca se debe acceder directamente al almacenamiento desde la interfaz.

Las vistas no deben contener reglas de negocio, escrituras directas sobre base de datos ni logica de persistencia.

## Regla 8: Debe existir trazabilidad completa

Para cualquier producto debera poder conocerse su recorrido completo:

Origen
↓
Lote
↓
Inventario
↓
Entrega
↓
Beneficiario

La trazabilidad debe permitir saber de donde procede cada producto, en que lote se incorporo, como afecto al inventario, a que entrega se asigno y que beneficiario lo recibio.

## Regla 9: Cada entidad tendra una unica representacion

Cada entidad del sistema tendra una unica representacion principal.

Ejemplo:

Una empresa podra:

- Donar productos.
- Donar dinero.
- Publicar recursos.
- Participar en campanas.

Todo desde un unico expediente.

No deben crearse duplicados funcionales de una misma entidad para resolver casos concretos.

## Regla 10: Toda informacion visible en la web debera publicarse desde el ERP

Toda informacion visible en la web publica debera gestionarse y publicarse desde el ERP.

Nunca editar manualmente HTML para:

- Recursos.
- Historias.
- Noticias.
- Galeria.
- Transparencia.
- Empresas colaboradoras.

La web publica debe consumir informacion aprobada y publicada desde el ERP.

## Principios de desarrollo

- No crear modulos duplicados.
- No crear logica duplicada.
- Mantener una unica fuente de verdad.
- Priorizar la reutilizacion mediante Services.
- Toda nueva funcionalidad debera cumplir estas reglas antes de considerarse terminada.
