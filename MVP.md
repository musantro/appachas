# Appachas — MVP

## Resumen ejecutivo

Appachas es una web móvil y open source para repartir gastos de grupos puntuales sin registro, contraseña ni instalación. Una persona crea el grupo, elige a sus integrantes y comparte por WhatsApp un enlace común para el grupo. El creador conserva además un enlace privado de administración.

Cada integrante reclama su identidad, registra gastos, reembolsos o aportaciones, consulta los balances y obtiene una liquidación final fácil de copiar y compartir.

El grupo se crea con fechas de viaje obligatorias. Los gastos pueden corresponder a pagos previos al viaje, pero no a fechas futuras. El grupo se elimina automáticamente después del viaje y el enlace deja de funcionar.

La promesa del MVP es: **crear, compartir, apuntar movimientos y cerrar cuentas con la menor fricción posible desde el móvil**.

## Problema y público

Viajes, cenas, regalos y planes entre amigos suelen acabar en notas dispersas, cálculos manuales o aplicaciones que exigen una cuenta. Appachas está pensado para grupos puntuales que valoran la rapidez y la privacidad más que un historial permanente.

Usuario principal: una persona que organiza un viaje o plan y necesita repartir gastos con un grupo por WhatsApp.

## Principios de producto

- **Sin fricción:** no hay registro, email, contraseña ni recuperación de cuenta.
- **Dos enlaces secretos:** el enlace de creador administra; el enlace común permite trabajar con los movimientos.
- **El enlace es la llave:** los enlaces son largos, aleatorios, no predecibles y no se regeneran.
- **Identidad reclamada:** cada integrante se reclama una sola vez en un dispositivo; la elección se conserva hasta borrar los datos del sitio.
- **Mobile first:** todo el flujo debe funcionar cómodamente desde un teléfono.
- **Efímero:** el grupo se puede cerrar y sus datos se eliminan.
- **Transparente:** proyecto open source, licencia MIT y reglas de cálculo comprensibles.
- **Privacidad por defecto:** no se usan cookies de seguimiento, analítica o publicidad ni servicios de analítica de terceros y no se recopila telemetría de producto. La sesión técnica usa una cookie propia `HttpOnly`, según [`docs/security-and-sessions.md`](docs/security-and-sessions.md).

## Alcance funcional

### 1. Crear y compartir un grupo

El asistente de creación solicita:

- nombre del grupo, obligatorio, de hasta 20 caracteres;
- fecha inicial, como mínimo hoy;
- fecha final, como mínimo mañana;
- entre 2 y 50 integrantes;
- nombre inicial de cada integrante, obligatorio, de hasta 20 caracteres;
- qué integrante corresponde al creador.

Los nombres admiten tildes, ñ, emojis y signos normales. Se recortan los espacios laterales y deben ser únicos dentro del grupo ignorando mayúsculas y espacios laterales. El nombre del grupo no puede estar vacío ni contener solo espacios.

El backend guarda la zona horaria IANA del creador en el momento de crear el grupo. Las fechas de negocio son fechas de calendario, sin hora.

Al crear el grupo se generan dos enlaces independientes:

- **Enlace de integrantes:** enlace común para compartir con el grupo.
- **Enlace de creador:** enlace privado con permisos de administración.

La pantalla posterior presenta dos acciones separadas. Compartir el enlace de integrantes es la acción principal e incluye un texto preparado con el nombre del grupo, las fechas y las instrucciones para elegir identidad. El enlace de creador se muestra como acción secundaria con una advertencia clara de no compartirlo. Si el creador pierde ese enlace, no existe recuperación ni regeneración.

### 2. Acceso, identidad y permisos

El enlace de creador identifica automáticamente al integrante seleccionado durante la creación, incluso desde otro dispositivo. El rol de creador es permanente y no se puede transferir. El integrante creador no se puede eliminar ni se puede liberar su identidad.

El enlace común muestra, antes de la identificación:

- nombre del grupo;
- fechas del viaje;
- lista de integrantes y sus alias;
- qué identidades están disponibles u ocupadas.

No muestra movimientos, balances ni liquidación hasta reclamar una identidad.

La primera entrada por el enlace común pasa por un asistente en el que la persona:

1. selecciona un integrante disponible;
2. puede cambiar su alias;
3. confirma la identidad y accede a la lista de movimientos.

La reclamación se registra en backend de forma atómica. Solo un dispositivo puede tener reclamada cada identidad. Si dos dispositivos reclaman simultáneamente la misma identidad, uno entra y el otro recibe un error de conflicto del tipo «Este integrante ya está ocupado» y vuelve al selector. Las identidades ocupadas permanecen visibles pero deshabilitadas. Si todas están ocupadas, no se puede acceder a la lista y se indica que hay que pedir al creador que libere una.

La selección local se conserva hasta borrar los datos del sitio y solo sirve para recordar la identidad en la interfaz; el acceso autenticado se mantiene mediante la sesión descrita en [`docs/security-and-sessions.md`](docs/security-and-sessions.md). Un integrante puede cambiarse desde la pantalla de Opciones a otra identidad disponible; la operación libera la identidad anterior y reclama la nueva de forma atómica. El creador puede liberar identidades de otros integrantes. Un integrante que pierde los datos locales debe pedir al creador que libere su identidad para volver a reclamarla.

El alias es global y lo ve todo el grupo. El integrante puede cambiar su propio alias desde Opciones y el creador puede renombrar a cualquier integrante. El cambio conserva el identificador interno, actualiza el historial y se rechaza si crea un duplicado.

Cuando el creador añade un integrante después de que existan movimientos, el nuevo integrante empieza con saldo cero y no se modifica el historial anterior. Solo puede participar en movimientos nuevos.

Permisos del enlace de integrantes:

- consultar movimientos, total, balances y liquidación;
- crear, editar y eliminar cualquier gasto, reembolso o aportación;
- cambiar su propio alias.

No puede cambiar el nombre del grupo, fechas o integrantes, ni cerrar el grupo.

Permisos del enlace de creador:

- todos los permisos del enlace de integrantes;
- cambiar nombre y fechas del grupo;
- añadir, renombrar y eliminar integrantes;
- liberar identidades de otros integrantes;
- cerrar el grupo.

La existencia del enlace no verifica quién es la persona. Esta advertencia debe aparecer brevemente en la pantalla de compartir y en el asistente de identidad.

### 3. Fechas y ciclo de vida

La fecha inicial debe ser hoy o posterior al crear el grupo. La fecha final debe ser posterior a hoy. La fecha del grupo se interpreta siempre en la zona horaria del creador guardada en backend.

Mientras no se haya alcanzado la fecha final, el creador puede modificar el rango. El nuevo rango debe mantener la coherencia temporal y no puede dejar fuera ningún movimiento existente. La fecha final no puede ampliarse ni modificarse una vez alcanzada.

Los movimientos tienen una fecha obligatoria:

- se preselecciona la fecha actual del grupo;
- no puede ser futura según la zona horaria del grupo;
- puede ser anterior a la creación del grupo para registrar vuelos, reservas u otros pagos previos;
- no puede superar la fecha final del grupo.

El grupo permanece activo hasta que el creador lo cierre o se elimine automáticamente. Después de la fecha final todavía se pueden registrar movimientos con fecha válida mientras el grupo siga disponible.

La fecha final del viaje es el ancla que inicia el control de caducidad. Las comparaciones se hacen con fechas de calendario en la zona horaria guardada del grupo. La caducidad automática se calcula desde esa fecha:

- si no se registra ningún movimiento nuevo después de la fecha final, se elimina cuando `hoy >= fecha_final + 10 días`;
- existe un límite absoluto y no ampliable cuando `hoy >= fecha_final + 30 días`;
- registrar un gasto, reembolso o aportación después de la fecha final reinicia la ventana de 10 días desde el día de registro (`created_at`), pero nunca prolonga el límite absoluto;
- abrir el grupo, consultar datos, copiar o compartir no cuenta como actividad;
- si se registra actividad en el día 29, el grupo se elimina igualmente cuando `hoy >= fecha_final + 30 días`.

Al cerrar manualmente, el creador confirma una acción irreversible. La interfaz conserva en esa pantalla el resumen completo, pero no lo guarda localmente. El backend elimina inmediatamente el grupo, integrantes, movimientos y repartos. Cualquier petición posterior devuelve `404`.

La caducidad automática también elimina los datos del backend y hace que el enlace devuelva `404`.

### 4. Registrar y gestionar movimientos

El historial mezcla tres tipos de movimiento y los identifica con una etiqueta:

#### Gasto

- importe positivo introducido por el usuario, mínimo 0,01 €;
- concepto obligatorio, hasta 50 caracteres;
- fecha obligatoria;
- pagador, por defecto la identidad actual, pero seleccionable entre todos los integrantes;
- participantes, todos seleccionados por defecto y con al menos uno obligatorio;
- el pagador puede quedar fuera de los participantes y el movimiento sigue siendo un gasto válido;
- el importe se reparte a partes iguales entre los participantes.

#### Reembolso

- tiene los mismos campos y reglas que un gasto;
- el usuario introduce siempre un importe positivo;
- en backend se representa como un gasto con importe negativo;
- usa exactamente la misma lógica de reparto que un gasto, cambiando únicamente el signo;
- no necesita estar vinculado a un gasto anterior;
- puede convertirse en gasto y viceversa sin confirmación; se conservan concepto, fecha, pagador y participantes y se invierte el signo.

#### Aportación

- concepto opcional, hasta 50 caracteres;
- fecha obligatoria, por defecto hoy;
- origen, por defecto la identidad actual, pero seleccionable entre todos los integrantes;
- receptores inicialmente deseleccionados y con al menos uno obligatorio;
- el origen no puede ser receptor;
- primero se introduce el importe total positivo;
- al seleccionar receptores se reparte por defecto a partes iguales;
- los importes individuales se pueden modificar;
- al guardar, la suma de las asignaciones debe coincidir exactamente con el total;
- una aportación puede ser de una persona a una o varias personas;
- una aportación no se puede convertir en gasto o reembolso, ni estos en aportación.

Los importes se introducen con coma o punto decimal, se normalizan a céntimos y no se aceptan importes negativos introducidos por el usuario. La pantalla limita la parte decimal a un máximo de dos posiciones y muestra un error si se supera. La API aplica la misma validación y rechaza la petición con `422`; no trunca ni redondea silenciosamente. La capa de dominio recibe únicamente enteros en céntimos. No hay un máximo de importe de producto; el backend aplica límites técnicos seguros para evitar overflow y abuso.

Las asignaciones personalizadas de una aportación pueden ser de cero céntimos. Esto permite conservar un receptor seleccionado aunque el reparto igualitario no alcance un céntimo para cada persona; la suma de todas las asignaciones debe seguir coincidiendo exactamente con el total.

Cualquier integrante con el enlace común y el creador puede editar o eliminar cualquier tipo de movimiento. Toda eliminación pide confirmación. Una edición reemplaza directamente los datos anteriores, conserva `created_at` y recalcula de inmediato total, balances y liquidación.

### 5. Balances y liquidación

La definición matemática normativa de reparto, balances y liquidación está en
[`docs/algoritmo.md`](docs/algoritmo.md). Este documento conserva las reglas de
producto, permisos, fechas y criterios de aceptación.

Los importes se almacenan en céntimos. El criterio de reparto de céntimos sobrantes es el orden de alta de los integrantes: el primer integrante según ese orden recibe el primer céntimo sobrante. Renombrar no altera el orden.

Para un gasto o reembolso firmado `s`, con pagador `p` y asignaciones `q` a sus participantes:

- el pagador suma `s` a su balance;
- cada participante resta su asignación firmada `q`;
- un reembolso usa los mismos cálculos con signo negativo.

Para una aportación de origen `A` a receptores `R`:

- el origen suma el importe que entrega;
- cada receptor resta el importe que recibe;
- el efecto reduce la deuda entre origen y receptor.

El balance neto de una persona es la suma de todos esos efectos. La suma de todos los balances debe ser exactamente cero. El total mostrado en la pantalla principal es el total neto de gastos y reembolsos, sin incluir aportaciones. Si es positivo se etiqueta como gasto total; si es negativo se etiqueta como **Reembolsos netos**.

La pantalla de balances muestra a todos los integrantes con frases comprensibles:

- «Ana recibe 24,00 €»;
- «Bruno debe 12,00 €»;
- «Carla está saldada».

La liquidación usa un algoritmo voraz y determinista:

1. ordena deudores y receptores por importe descendente;
2. desempata usando el orden de alta;
3. compensa cada deudor con cada receptor hasta agotar uno de los dos saldos;
4. no crea pagos redundantes y mantiene todos los importes en céntimos.

El resultado muestra solo los pagos residuales necesarios. Las aportaciones anteriores se incorporan al cálculo, pero no se detallan de nuevo. Cada línea usa exactamente el formato «Bruno paga 12,50 € a Ana». No se incluye encabezado ni nombre del grupo en el texto copiable.

La pantalla ofrece botones separados de «Copiar texto» y «Compartir» mediante el menú nativo del móvil. Si no quedan pagos pendientes, muestra «Todo está saldado» y no ofrece copiar ni compartir.

### 6. Pantallas del MVP

- **Inicio / crear grupo:** nombre, fechas, integrantes y selección del creador.
- **Compartir grupo:** enlace de integrantes para compartir, enlace de creador como acción secundaria y advertencias de seguridad.
- **Asistente de identidad:** datos básicos del grupo, selector de integrantes disponibles y alias opcional.
- **Grupo:** total neto, balances, historial mezclado y acción destacada para añadir movimiento.
- **Añadir/editar movimiento:** selector de tipo, campos específicos, reparto y validaciones.
- **Opciones:** cambio de identidad y cambio del propio alias.
- **Liquidación:** balances finales, pagos residuales, copiar, compartir y cierre para el creador.
- **Grupo no disponible:** respuesta para enlace inválido, cerrado o caducado; el backend responde `404`.

## Reglas de negocio

- Moneda única del MVP: EUR.
- Todas las fechas de negocio son fechas de calendario en la zona horaria del creador.
- El rango inicial requiere inicio desde hoy y fin desde mañana.
- Los nombres de grupo e integrantes tienen un máximo de 20 caracteres; los conceptos, 50.
- Se admiten Unicode, tildes, ñ, emojis y signos normales.
- Los nombres de integrantes son únicos ignorando mayúsculas y espacios laterales.
- El identificador interno de un integrante es estable aunque cambie su alias.
- Un integrante añadido después de los primeros movimientos empieza con saldo cero y no se incorpora retroactivamente al historial.
- El integrante creador permanece siempre en el grupo y su identidad no se puede liberar.
- El pagador de un gasto o reembolso puede no ser participante.
- Un gasto y un reembolso comparten campos y lógica de reparto; solo cambia el signo en backend.
- Una aportación no modifica el total del viaje, solo los balances.
- Una aportación permite asignaciones personalizadas cuya suma debe coincidir con el total.
- Se permiten balances y totales netos negativos; la liquidación se genera igualmente.
- Las lecturas no cuentan como actividad de caducidad.
- Un grupo cerrado o caducado no se puede recuperar ni modificar.
- La liquidación se recalcula siempre con el estado actual de los movimientos.

## Arquitectura propuesta

- **Frontend:** React, responsive y mobile first.
- **Backend:** FastAPI, API REST y servicio de los assets del frontend.
- **Persistencia:** PostgreSQL.
- **Identidad local:** almacenamiento persistente del navegador hasta borrar los datos del sitio, combinado con una reclamación server-side.
- **Zona horaria:** identificador IANA del creador almacenado en el grupo.
- **Acceso:** dos tokens secretos independientes, uno de creador y uno de integrantes, que solo sirven para iniciar la sesión; las operaciones posteriores usan la sesión `HttpOnly` descrita en [`docs/security-and-sessions.md`](docs/security-and-sessions.md). Nunca se usa un ID incremental como credencial.
- **Conflictos:** versión del movimiento para rechazar ediciones y borrados basados en datos antiguos.
- **Caducidad:** tarea de backend que elimina por inactividad o por límite absoluto.
- **Operación:** logs sin nombres, alias, conceptos, importes ni tokens completos.
- **Privacidad:** sin cookies de seguimiento, analítica o publicidad, analítica de terceros ni telemetría de producto; la cookie técnica de sesión está limitada al funcionamiento de la aplicación.
- **Licencia:** MIT.

Entidades mínimas:

- `groups`: id interno, nombre, hash del token de creador, hash del token común, integrante creador, moneda, fecha inicial, fecha final, zona horaria, fechas de creación y estado temporal;
- `members`: id interno, grupo, alias, posición de alta y estado de reclamación;
- `movements`: id, grupo, tipo, concepto opcional, importe positivo en céntimos (el tipo determina el signo para gastos y reembolsos), pagador/origen, fecha del movimiento, `created_at`, `updated_at` y versión;
- `movement_allocations`: movimiento, integrante, rol de participante o receptor e importe asignado;
- reclamaciones de identidad: integrante, credencial de navegador persistente, fechas de reclamación y liberación.

Los nombres y textos completos se eliminan de la base de datos operativa al cerrar o caducar. La política del MVP garantiza el borrado inmediato de la base de datos operativa; la retención de copias de seguridad queda fuera del alcance de esta versión.

## API mínima

Las rutas finales pueden variar, pero deben conservar esta separación de permisos:

- `POST /api/groups` — crear grupo, integrantes, zona horaria y los dos tokens; devuelve ambas URLs.
- `GET /api/groups/{member-token}/metadata` — obtener datos básicos y estado de identidades antes de reclamar.
- `POST /api/groups/{member-token}/claims` — reclamar una identidad o cambiar atómicamente a otra disponible; establece la cookie de sesión persistente.
- `POST /api/groups/{creator-token}/session` — iniciar una sesión de creador desde el enlace privado y reclamar automáticamente la identidad creadora.
- `GET /api/groups/session` — obtener grupo, movimientos, balances y permisos después de identificarse.
- `POST /api/groups/session/movements` — añadir gasto, reembolso o aportación.
- `PUT /api/groups/session/movements/{id}` — editar un movimiento con versión esperada.
- `DELETE /api/groups/session/movements/{id}` — eliminar un movimiento con versión esperada y tras confirmación de interfaz.
- `GET /api/groups/session/settlement` — calcular balances y liquidación actual.
- `PUT /api/groups/session/group` — editar nombre y fechas desde una sesión de creador.
- `POST/PUT/DELETE /api/groups/session/members` — gestionar integrantes desde una sesión de creador, respetando las reglas de historial e identidad.
- `DELETE /api/groups/session/group` — cerrar y eliminar el grupo.

Las operaciones de edición o borrado con una versión antigua devuelven `409 Conflict`. Una reclamación simultánea de la misma identidad también devuelve `409`. Un token inválido, cerrado o caducado devuelve `404` sin distinguir públicamente la causa. El contrato completo de tokens, sesiones y cookies está en [`docs/security-and-sessions.md`](docs/security-and-sessions.md).

## Requisitos no funcionales

- Primera carga usable en una conexión móvil normal en menos de 3 segundos.
- Interfaz accesible por teclado, con contraste AA y objetivos táctiles de al menos 44 × 44 px.
- Diseño correcto desde 320 px de ancho y usable también en escritorio.
- Respeto de los tokens y reglas visuales de `DESIGN.md`.
- Operaciones de escritura con estados de carga, confirmación y error recuperable.
- Errores de red sin colas offline ni escrituras locales pendientes.
- Sin sincronización en tiempo real: una recarga de página obtiene el estado actualizado.
- Protección básica contra abuso: límites de tamaño, máximo técnico de integrantes, rate limiting y validación en backend.
- Tokens secretos fuera de logs, URLs de analítica, mensajes de error y respuestas innecesarias.
- Código, instrucciones de ejecución, configuración local de React, FastAPI y PostgreSQL y licencia MIT publicados en el repositorio.

## Fuera del MVP

- cuentas, login, contraseñas, roles transferibles y recuperación de enlaces;
- regeneración de enlaces secretos;
- historial de grupos cerrados o restauración de datos;
- aplicación móvil nativa y funcionamiento offline;
- sincronización en tiempo real;
- pagos, cobros o verificación de transferencias;
- enlaces de pago por integrante y proveedores como Bizum;
- varias monedas y conversión de divisas;
- adjuntos, fotos de tickets, categorías y estadísticas;
- notificaciones, chat y analítica de producto;
- importes manuales para gastos y reembolsos; solo se permite reparto igualitario;
- conversión entre aportación y gasto/reembolso.

## Validación manual

El MVP se validará mediante pruebas moderadas, sin telemetría automática. El objetivo inicial es que al menos el 80 % de las personas pueda crear un grupo, compartir el enlace y registrar el primer movimiento sin ayuda en menos de dos minutos.

La prueba debe cubrir como mínimo:

- creación desde un móvil y acceso desde varios navegadores;
- reclamación simultánea de una misma identidad;
- cambio de alias y cambio de identidad;
- permisos diferenciados de creador e integrantes;
- gastos con pagador participante y no participante;
- reembolsos, aportaciones uno a uno y uno a varios;
- reparto con céntimos sobrantes y total neto negativo;
- edición concurrente y rechazo por versión antigua;
- orden de movimientos y actualización tras recarga;
- liquidación con aportaciones previas y caso «Todo está saldado»;
- cierre manual, `404` posterior y caducidad automática.

## Criterios de aceptación

El MVP se considera listo cuando:

- el grupo exige nombre, fechas válidas, creador e integrantes iniciales;
- se generan dos enlaces secretos con permisos diferenciados;
- el enlace común muestra solo metadatos antes de reclamar identidad;
- la identidad del creador queda reclamada automáticamente y no se puede liberar;
- una identidad común solo puede estar reclamada en un dispositivo a la vez;
- los alias globales respetan unicidad y se conservan mediante identificadores internos;
- los integrantes pueden crear, editar y eliminar cualquier movimiento, pero no la configuración del grupo;
- el creador puede administrar integrantes, nombre, fechas, movimientos y cierre;
- gastos y reembolsos aceptan pagadores no participantes y reparten entre participantes seleccionados;
- las aportaciones validan receptores, origen, reparto editable y suma exacta;
- importes, balances y liquidación cuadran exactamente al céntimo;
- los movimientos se ordenan por fecha y después por `created_at`, conservado al editar;
- un guardado basado en una versión antigua se rechaza sin sobrescribir cambios visibles para otra persona;
- la liquidación muestra únicamente pagos residuales y se puede copiar o compartir cuando existen;
- cerrar o caducar elimina los datos operativos y hace que el enlace devuelva `404`;
- no se recopila analítica de producto ni se usan cookies de seguimiento, analítica o publicidad; la cookie técnica de sesión está limitada al funcionamiento de la aplicación;
- los flujos principales pasan pruebas end-to-end en vista móvil;
- el repositorio permite levantar React, FastAPI y PostgreSQL con instrucciones claras y licencia MIT.

## Historias de usuario

- **US-01 — Crear grupo:** Como creador, dado que estoy en la pantalla de inicio, cuando introduzco un nombre válido, fechas válidas, al menos dos integrantes y mi integrante, entonces debo poder crear el grupo sin registrarme.
- **US-02 — Validar nombre del grupo:** Como usuario, dado que el nombre está vacío, contiene solo espacios o supera 20 caracteres, cuando intento crear el grupo, entonces debo recibir un error y el grupo no debe crearse.
- **US-03 — Validar integrantes iniciales:** Como creador, dado que hay menos de dos integrantes, nombres vacíos, nombres de más de 20 caracteres o nombres duplicados ignorando mayúsculas y espacios laterales, cuando intento crear el grupo, entonces debo recibir errores concretos y no debe crearse.
- **US-04 — Validar fechas de creación:** Como creador, dado que la fecha inicial es anterior a hoy, la fecha final no es posterior a hoy o la fecha inicial es posterior a la final, cuando intento crear el grupo, entonces debo recibir un error y no debe crearse.
- **US-05 — Guardar zona horaria:** Como creador, dado que creo un grupo desde una zona horaria determinada, cuando el grupo se crea, entonces el backend debe guardar esa zona horaria IANA para calcular fechas, caducidad y “hoy”.
- **US-06 — Recibir dos enlaces:** Como creador, dado que el grupo se ha creado correctamente, cuando termina el asistente, entonces debo recibir un enlace de integrantes y un enlace de creador independientes.
- **US-07 — Compartir integrantes:** Como creador, dado que estoy en la pantalla de compartir, cuando pulso compartir el enlace de integrantes, entonces debo poder usar el menú nativo del móvil con un texto que incluya nombre, fechas e instrucciones de identidad.
- **US-08 — Proteger el enlace de creador:** Como creador, dado que veo el enlace de administración, cuando consulto la pantalla de compartir, entonces debo ver una advertencia de que no debo compartirlo y de que no existe recuperación si lo pierdo.
- **US-09 — Ver metadatos antes de identificarse:** Como usuario, dado que abro el enlace común sin identidad reclamada, cuando carga el asistente, entonces debo poder ver nombre, fechas, alias y estado de disponibilidad, pero no movimientos ni balances.
- **US-10 — Reclamar una identidad:** Como usuario, dado que existe un integrante disponible, cuando lo selecciono y confirmo, entonces debo poder acceder a la lista de movimientos y esa identidad debe quedar ocupada en backend.
- **US-11 — Reclamar con alias:** Como usuario, dado que estoy reclamando una identidad, cuando introduzco un alias válido opcional, entonces el alias debe quedar visible para todo el grupo y conservar el mismo identificador interno.
- **US-12 — Rechazar alias duplicado:** Como usuario, dado que el alias elegido ya existe ignorando mayúsculas y espacios laterales, cuando intento confirmarlo, entonces debo recibir un error y la reclamación no debe completarse con ese alias.
- **US-13 — Evitar doble reclamación:** Como usuario, dado que otra persona reclama simultáneamente la misma identidad, cuando mi reclamación llega después, entonces debo recibir `409 Conflict`, ver «Este integrante ya está ocupado» y volver al selector.
- **US-14 — Recordar identidad:** Como integrante, dado que ya he reclamado una identidad, cuando vuelvo a abrir el grupo en el mismo navegador con los datos del sitio intactos, entonces debo conservar mi identidad sin repetir el asistente.
- **US-15 — Cambiar de identidad:** Como integrante, dado que tengo una identidad reclamada y existe otra disponible, cuando confirmo el cambio desde Opciones, entonces la identidad anterior debe liberarse y la nueva debe reclamarse atómicamente.
- **US-16 — Recuperar identidad perdida:** Como integrante, dado que he borrado los datos del sitio, cuando intento volver a reclamar mi identidad ocupada, entonces debo necesitar que el creador la libere primero.
- **US-17 — Liberar identidad de otro integrante:** Como creador, dado que un integrante no creador ha perdido su acceso local, cuando libero su identidad desde administración, entonces ese integrante debe volver a aparecer disponible.
- **US-18 — Proteger identidad del creador:** Como creador, dado que mi integrante está asociado al grupo, cuando intento eliminarlo o liberar su identidad, entonces la operación debe estar bloqueada.
- **US-19 — Cambiar alias propio:** Como integrante, dado que estoy identificado, cuando cambio mi alias desde Opciones por uno válido y no duplicado, entonces el nuevo alias debe actualizarse para todo el grupo y en el historial.
- **US-20 — Renombrar integrante:** Como creador, dado que existe un integrante, cuando cambio su alias por uno válido y no duplicado, entonces debe actualizarse su alias global sin cambiar su identificador, reclamación ni orden de alta.
- **US-21 — Gestionar integrantes:** Como creador, dado que el grupo sigue disponible, cuando añado, renombro o elimino un integrante según las reglas, entonces debo poder hacerlo sin cambiar el enlace común ni el enlace de creador.
- **US-22 — Añadir integrante sin recalcular historial:** Como creador, dado que ya existen movimientos, cuando añado un integrante, entonces debe empezar con saldo cero y no debe incorporarse a movimientos anteriores.
- **US-23 — Impedir borrar integrante con movimientos:** Como creador, dado que un integrante aparece en algún movimiento, cuando intento eliminarlo, entonces debo recibir un error y el integrante debe conservarse.
- **US-24 — Borrar integrante sin movimientos:** Como creador, dado que un integrante no aparece en movimientos pero tiene una identidad reclamada, cuando lo elimino, entonces debe eliminarse y su identidad debe liberarse automáticamente.
- **US-25 — Permisos de integrante:** Como integrante, dado que he reclamado una identidad, cuando uso el enlace común, entonces debo poder consultar y gestionar cualquier movimiento, pero no cambiar grupo, fechas, integrantes ni cerrar.
- **US-26 — Permisos de creador:** Como creador, dado que uso el enlace privado, cuando accedo al grupo, entonces debo poder gestionar movimientos, nombre, fechas e integrantes y cerrar el grupo.
- **US-27 — Crear gasto:** Como usuario, dado que estoy identificado, cuando introduzco concepto, fecha, importe, pagador y participantes válidos, entonces debo poder guardar un gasto.
- **US-28 — Valores por defecto de gasto:** Como usuario, dado que abro el formulario de gasto, cuando se muestra, entonces la fecha debe ser hoy, el pagador debe ser mi identidad y todos los integrantes deben aparecer seleccionados.
- **US-29 — Pagador no participante:** Como usuario, dado que registro un gasto pagado por Ana para Bruno y Carla, cuando desmarco a Ana como participante, entonces el movimiento debe seguir siendo un gasto válido y Ana debe conservar el crédito de lo pagado.
- **US-30 — Repartir gasto:** Como usuario, dado que un gasto tiene varios participantes, cuando se guarda, entonces el importe debe dividirse en céntimos entre ellos siguiendo el orden de alta para los sobrantes.
- **US-31 — Crear reembolso:** Como usuario, dado que estoy identificado, cuando introduzco un reembolso con los mismos campos que un gasto, entonces debo poder guardarlo introduciendo un importe positivo que el backend almacena con signo negativo.
- **US-32 — Reembolso independiente:** Como usuario, dado que quiero registrar una devolución, cuando creo un reembolso, entonces no debo necesitar seleccionar ni enlazar un gasto anterior.
- **US-33 — Convertir gasto y reembolso:** Como usuario, dado que edito un gasto o reembolso, cuando cambio su tipo entre ambos, entonces deben conservarse concepto, fecha, pagador y participantes y debe invertirse el signo sin pedir confirmación.
- **US-34 — Crear aportación:** Como usuario, dado que estoy identificado, cuando abro el formulario de aportación, entonces el origen debe ser mi identidad por defecto, los receptores deben aparecer deseleccionados y debo poder cambiar el origen.
- **US-35 — Validar aportación:** Como usuario, dado que una aportación no tiene receptores, incluye al origen como receptor o sus asignaciones no suman el total, cuando intento guardar, entonces debo recibir un error y no debe guardarse.
- **US-36 — Repartir aportación:** Como usuario, dado que una aportación tiene importe total y varios receptores, cuando los selecciono, entonces el importe debe repartirse a partes iguales por defecto y debo poder modificar cada asignación.
- **US-37 — Concepto opcional:** Como usuario, dado que creo una aportación sin concepto, cuando guardo un resto de campos válido, entonces la aportación debe guardarse correctamente.
- **US-38 — Validar importes:** Como usuario, dado que introduzco cero, un importe negativo o menos de 0,01 €, cuando intento guardar un movimiento, entonces debo recibir un error; coma y punto decimal deben aceptarse.
- **US-39 — Validar fechas de movimiento:** Como usuario, dado que la fecha del movimiento es futura según la zona horaria del grupo o posterior a su fecha final, cuando intento guardar, entonces debo recibir un error.
- **US-40 — Registrar pagos previos:** Como usuario, dado que necesito registrar un vuelo comprado antes de crear el grupo, cuando introduzco una fecha anterior a la creación pero no futura, entonces el movimiento debe poder guardarse.
- **US-41 — Editar movimiento:** Como usuario, dado que existe un movimiento, cuando lo edito con datos válidos, entonces debo reemplazar sus datos, conservar `created_at` y actualizar balances y liquidación inmediatamente.
- **US-42 — Eliminar movimiento:** Como usuario, dado que existe un movimiento, cuando pulso eliminar, entonces debo confirmar la acción y, al confirmarla, el movimiento debe borrarse y recalcularse todo.
- **US-43 — Historial único:** Como usuario, dado que el grupo contiene gastos, reembolsos y aportaciones, cuando consulto el historial, entonces debo verlos en una única lista con etiquetas de tipo.
- **US-44 — Ordenar historial:** Como usuario, dado que hay varios movimientos, cuando veo la lista, entonces deben ordenarse por fecha de movimiento descendente y, a igualdad de fecha, por `created_at` descendente.
- **US-45 — Mostrar balances:** Como usuario, dado que existen movimientos, cuando consulto el grupo, entonces debo ver todos los integrantes con frases «recibe», «debe» o «está saldada» y la suma de balances debe ser cero.
- **US-46 — Mostrar total neto:** Como usuario, dado que existen gastos y reembolsos, cuando consulto el total, entonces debo ver su suma neta sin aportaciones; si es negativa, debe etiquetarse como «Reembolsos netos».
- **US-47 — Permitir total negativo:** Como usuario, dado que los reembolsos superan los gastos, cuando consulto el grupo, entonces debo seguir pudiendo ver balances y generar una liquidación.
- **US-48 — Recalcular aportaciones:** Como usuario, dado que Bruno debe 30 € a Ana, cuando registro una aportación de Bruno a Ana por 30 €, entonces Bruno debe quedar saldado y la liquidación debe reflejar solo las deudas restantes.
- **US-49 — Aportación excesiva:** Como usuario, dado que una aportación supera la deuda actual, cuando la guardo, entonces debe aceptarse y los balances y la liquidación deben recalcularse con el excedente.
- **US-50 — Liquidación voraz:** Como usuario, dado que hay saldos distintos de cero, cuando abro Liquidación, entonces debo ver una lista determinista de pagos calculada compensando deudores y receptores por importe descendente y desempate por alta.
- **US-51 — Texto de liquidación:** Como usuario, dado que existen pagos pendientes, cuando consulto el texto, entonces cada línea debe tener el formato «Bruno paga 12,50 € a Ana» sin encabezado ni nombre del grupo.
- **US-52 — Grupo saldado:** Como usuario, dado que todos los balances son cero, cuando abro Liquidación, entonces debo ver «Todo está saldado» y no debo ver botones de copiar o compartir.
- **US-53 — Copiar liquidación:** Como usuario, dado que existen pagos pendientes, cuando pulso «Copiar texto», entonces el texto de las líneas debe copiarse al portapapeles.
- **US-54 — Compartir liquidación:** Como usuario, dado que existen pagos pendientes y el dispositivo ofrece menú nativo, cuando pulso «Compartir», entonces debo poder compartir únicamente el texto de liquidación.
- **US-55 — Evitar sobrescritura:** Como usuario, dado que abrí un movimiento y otra persona lo modificó antes de que yo guardase, cuando intento guardar mi versión antigua, entonces debo recibir `409 Conflict` y no se debe sobrescribir la modificación más reciente.
- **US-56 — Actualizar por recarga:** Como usuario, dado que otra persona ha añadido o modificado un movimiento, cuando recargo la página, entonces debo ver el estado actualizado sin necesitar un botón de actualización.
- **US-57 — Cerrar grupo:** Como creador, dado que el grupo sigue disponible aunque haya saldos pendientes, cuando confirmo el cierre, entonces debo ver el resumen completo en esa pantalla y el backend debe borrar inmediatamente los datos.
- **US-58 — Cierre irreversible:** Como usuario, dado que el grupo se ha cerrado, cuando intento usar cualquiera de sus enlaces, entonces debo recibir `404` y no debe existir recuperación.
- **US-59 — Caducidad por inactividad:** Como sistema, dado que ha pasado la fecha final y no se registra ningún movimiento durante 10 días, cuando se ejecuta la tarea de caducidad, entonces debo eliminar el grupo y sus datos.
- **US-60 — Límite absoluto:** Como sistema, dado que han pasado 30 días desde la fecha final, cuando se ejecuta la tarea de caducidad, entonces debo eliminar el grupo aunque haya habido movimientos recientes.
- **US-61 — Actividad válida:** Como sistema, dado que el grupo está dentro de la ventana posterior a la fecha final, cuando se registra un gasto, reembolso o aportación, entonces debo reiniciar la ventana de 10 días sin superar el límite de 30 días.
- **US-62 — Lecturas no activan grupo:** Como sistema, dado que alguien abre, consulta, copia o comparte el grupo sin registrar movimientos, cuando se calcula la caducidad, entonces esas acciones no deben reiniciar la inactividad.
- **US-63 — Acceso no disponible:** Como usuario, dado que el token es inválido, el grupo está cerrado o ha caducado, cuando intento acceder, entonces debo recibir una pantalla genérica de grupo no disponible y la API debe responder `404`.
- **US-64 — Privacidad de logs:** Como responsable de operación, dado que se procesan peticiones, cuando se escriben logs, entonces no deben contener nombres, alias, conceptos, importes ni tokens completos.
- **US-65 — Sin telemetría:** Como usuario, dado que utilizo Appachas, cuando navego y registro movimientos, entonces no deben enviarse eventos de producto, cookies de seguimiento ni datos a servicios de analítica de terceros; la única cookie permitida es la técnica de sesión propia.
- **US-66 — Accesibilidad móvil:** Como usuario, dado que utilizo teclado, lector de pantalla o una pantalla de 320 px, cuando recorro cualquier flujo principal, entonces debo poder leer, enfocar y activar todos los controles sin perder contenido.
