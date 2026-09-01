# Appachas — MVP

## Resumen ejecutivo

Appachas es una web móvil y open source para repartir gastos de grupos pequeños sin registro, contraseñas ni instalación. Una persona crea el grupo, añade a sus integrantes y comparte por WhatsApp un enlace secreto. Cada integrante entra desde su móvil, indica quién es y puede registrar gastos, consultar balances y obtener una liquidación final fácil de copiar y compartir.

La promesa del MVP es: **crear, compartir, apuntar gastos y cerrar cuentas en menos de un minuto de configuración**.

## Problema y público

Viajes, cenas, regalos y planes entre amigos suelen acabar en notas dispersas, cálculos manuales o aplicaciones que exigen una cuenta. Appachas está pensado para grupos puntuales que valoran más la rapidez y la privacidad que un historial permanente.

Usuario principal: una persona que organiza un plan y necesita repartir gastos con un grupo por WhatsApp.

## Principios de producto

- **Sin fricción:** no hay registro, email ni contraseña.
- **El enlace es la llave:** cada grupo tiene una URL secreta, larga y no predecible.
- **Identidad local:** cada navegador recuerda al integrante elegido mediante `sessionStorage`.
- **Mobile first:** todo el flujo debe funcionar cómodamente desde un teléfono.
- **Efímero:** el grupo se puede cerrar y sus datos se eliminan.
- **Transparente:** proyecto open source y reglas de cálculo comprensibles.

## Alcance funcional

### 1. Crear y compartir un grupo

La persona organizadora introduce:

- nombre del grupo;
- nombres de los integrantes, con un mínimo de dos.

El sistema crea el grupo y devuelve su enlace secreto. La interfaz permite copiarlo o compartirlo mediante el menú nativo del móvil, con WhatsApp como caso de uso prioritario.

### 2. Entrar e identificarse

Al abrir el enlace, la persona selecciona su nombre en la pantalla «¿Quién eres?». La selección se guarda en `sessionStorage` para ese grupo y se puede cambiar manualmente.

No existe identidad verificable en el MVP: cualquiera con el enlace puede consultar y modificar el grupo. Esta condición debe explicarse de forma breve en la interfaz.

### 3. Registrar y gestionar gastos

Cualquier integrante puede:

- añadir un gasto con concepto, importe en euros, pagador y participantes;
- repartirlo a partes iguales entre los participantes seleccionados;
- consultar el listado de gastos;
- editar o eliminar un gasto mientras el grupo siga activo.

Validaciones mínimas: concepto obligatorio, importe mayor que cero, pagador perteneciente al grupo y al menos un participante.

### 4. Ver balances

La vista principal muestra:

- gasto total del grupo;
- saldo neto de cada integrante;
- quién ha pagado cada gasto y cómo se ha repartido.

Los importes se calculan en céntimos para evitar errores de redondeo. La suma de todos los saldos debe ser cero.

### 5. Liquidar y cerrar

El sistema genera una lista mínima y determinista de transferencias del tipo «Juan paga 12 € a Ana», incluyendo a quienes no deben nada. La liquidación se presenta como texto listo para copiar y pegar en WhatsApp.

Opcionalmente, cada receptor puede tener un enlace de pago libre —por ejemplo, Bizum— que se incorpora al texto sin integrar ningún proveedor de pagos.

El grupo se puede finalizar desde esta pantalla. Antes de hacerlo, la interfaz pide confirmación y avisa de que la acción es irreversible. Al confirmar:

1. se mantiene en pantalla el resumen final para poder copiarlo;
2. el backend elimina el grupo, integrantes, gastos y repartos;
3. el enlace secreto deja de ser válido.

## Flujo principal

1. Crear grupo y añadir integrantes.
2. Copiar o compartir el enlace secreto.
3. Cada persona abre el enlace y elige quién es.
4. El grupo registra gastos y consulta balances.
5. Se genera y comparte la liquidación.
6. Se cierra el grupo y se eliminan sus datos.

## Pantallas del MVP

- **Inicio / crear grupo:** propuesta de valor, nombre e integrantes.
- **Compartir grupo:** enlace secreto y acciones de copiar/compartir.
- **¿Quién eres?:** selector de integrante.
- **Grupo:** total, balances, gastos y acceso destacado para añadir gasto.
- **Añadir/editar gasto:** concepto, importe, pagador y participantes.
- **Liquidación:** transferencias, texto copiable, enlaces de pago opcionales y cierre.
- **Grupo no disponible:** enlace inválido, cerrado o eliminado.

## Reglas de negocio

- Moneda única del MVP: EUR.
- Los importes se almacenan como enteros en céntimos.
- Un gasto se divide por igual; los céntimos sobrantes se asignan de forma estable siguiendo el orden de los integrantes.
- El balance de una persona es `total pagado − total que le corresponde`.
- La liquidación compensa deudores y acreedores hasta dejar todos los saldos a cero, sin crear ni perder céntimos.
- Los nombres deben ser únicos dentro del grupo, ignorando mayúsculas y espacios laterales.
- Un grupo cerrado no puede recuperarse ni modificarse.

## Arquitectura propuesta

- **Frontend:** React, responsive y mobile first.
- **Backend:** FastAPI (Python), API REST y servicio de los assets del frontend.
- **Persistencia:** PostgreSQL para grupos, integrantes, gastos y repartos.
- **Identidad local:** `sessionStorage`, aislada por identificador de grupo.
- **Acceso:** token secreto con entropía suficiente en la URL; nunca un ID incremental.
- **Operación:** logs sin nombres, conceptos, importes ni tokens completos.

Entidades mínimas:

- `groups`: id, token secreto, nombre, moneda, fecha de creación y estado;
- `members`: id, grupo, nombre y enlace de pago opcional;
- `expenses`: id, grupo, concepto, importe, pagador y fecha;
- `expense_shares`: gasto, integrante e importe asignado.

## API mínima

- `POST /api/groups` — crear grupo e integrantes.
- `GET /api/groups/{token}` — obtener grupo, gastos y balances.
- `POST /api/groups/{token}/expenses` — añadir gasto.
- `PUT /api/groups/{token}/expenses/{id}` — editar gasto.
- `DELETE /api/groups/{token}/expenses/{id}` — eliminar gasto.
- `GET /api/groups/{token}/settlement` — calcular liquidación y texto compartible.
- `DELETE /api/groups/{token}` — cerrar y eliminar el grupo.

La especificación final puede ajustar las rutas, pero debe conservar la separación de responsabilidades y evitar exponer identificadores predecibles como credenciales.

## Requisitos no funcionales

- Primera carga usable en una conexión móvil normal en menos de 3 segundos.
- Interfaz accesible por teclado, con contraste AA y objetivos táctiles de al menos 44 × 44 px.
- Diseño correcto desde 320 px de ancho y también usable en escritorio.
- Operaciones de escritura con estados de carga, confirmación y error recuperable.
- Protección básica contra abuso: límites de tamaño, rate limiting y validación en backend.
- Código, instrucciones de ejecución y licencia publicados en el repositorio.

## Fuera del MVP

- cuentas, login, roles y recuperación de identidad;
- aplicación móvil nativa y funcionamiento offline;
- pagos, cobros o verificación de transferencias;
- reparto por porcentajes, participaciones o importes manuales;
- varias monedas y conversión de divisas;
- adjuntos, fotos de tickets, categorías y estadísticas;
- notificaciones, chat y sincronización en tiempo real;
- historial de grupos cerrados o restauración de datos.

## Métricas de validación

- porcentaje de grupos creados que registran al menos un gasto;
- porcentaje de grupos con dos o más participantes activos;
- tiempo medio desde la creación hasta el primer gasto;
- porcentaje de grupos que generan una liquidación;
- errores por operación, sin recopilar contenido personal del grupo.

Objetivo inicial: que una prueba moderada con usuarios complete el flujo principal sin ayuda y que al menos el 80 % pueda crear, compartir y registrar el primer gasto en menos de dos minutos.

## Criterios de aceptación

El MVP se considera listo cuando:

- un grupo se puede crear y abrir desde otro móvil usando solo el enlace;
- cada navegador recuerda al integrante elegido durante su sesión;
- varias personas pueden añadir, editar y eliminar gastos válidos;
- balances y liquidación cuadran exactamente al céntimo en casos con redondeo;
- el texto de liquidación se puede copiar y compartir;
- cerrar un grupo requiere confirmación, elimina sus datos y desactiva el enlace;
- los flujos principales pasan pruebas end-to-end en vista móvil;
- el repositorio permite levantar React, FastAPI y PostgreSQL con instrucciones claras.

## Decisiones pendientes tras validar el MVP

- plazo de caducidad automática para grupos abandonados;
- necesidad de un PIN de administración para editar, borrar o cerrar;
- repartos avanzados y soporte multimoneda;
- sincronización en tiempo real;
- enlaces de pago por integrante y por proveedor.
