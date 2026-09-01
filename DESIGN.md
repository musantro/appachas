# Appachas — Design system y especificación de interfaz

**Estado:** handoff de diseño para el MVP  
**Fuente funcional:** `MVP.md` (no modificar)  
**Dirección visual validada en Stitch:** “Mesa Clara”  
**Idioma de interfaz:** español (España)  
**Moneda:** EUR

Este documento convierte el alcance de `MVP.md` en una guía visual y de interacción implementable. Define la experiencia para crear un grupo, compartir su enlace secreto, identificarse, registrar gastos, consultar balances, liquidar y cerrar. No añade cuentas, roles, pagos integrados, tiempo real ni funcionalidades fuera del MVP.

## 1. Contrato de diseño

### Promesa

> Crea, comparte, apunta gastos y cierra cuentas en menos de un minuto de configuración.

La interfaz debe hacer evidente qué está pasando con el dinero y cuál es la siguiente acción. La persona usuaria no debería tener que entender la lógica de compensación para completar el flujo.

### North star: “Mesa Clara”

Appachas se siente como una mesa compartida: todas las personas ven los mismos números, cualquier integrante puede añadir un gasto y, al final, el grupo se va con una instrucción concreta de quién paga a quién. La estética es calmada, luminosa y práctica; el azul concentra la acción y el verde confirma que algo está cuadrado.

### Principios visuales

1. **Claridad antes que decoración.** Los importes, nombres y próximos pasos dominan la jerarquía. No usar gráficos, fotos, confeti ni metáforas financieras innecesarias.
2. **Una decisión principal por pantalla.** Cada vista tiene un CTA dominante; el resto son acciones secundarias, enlaces o menú contextual.
3. **Confianza sin prometer seguridad que no existe.** El enlace es secreto, pero no es identidad verificable. La interfaz lo explica con lenguaje breve y directo.
4. **Estado visible.** Todo cambio de datos tiene carga, éxito y error recuperable. Nunca borrar el contenido introducido por un fallo de red.
5. **Mobile first y una mano.** El contenido importante aparece en el primer viewport de 390 px y las acciones recurrentes quedan al alcance del pulgar.
6. **Efímero y transparente.** El cierre se trata como una decisión irreversible; el texto explica que los datos se borran y el enlace deja de funcionar.
7. **Misma verdad, distintas señales.** Un saldo nunca se comunica solo con color: siempre incluye signo, palabra o icono comprensible.

## 2. Identidad visual

### Marca

- **Nombre:** Appachas, siempre en una sola palabra y con mayúscula inicial.
- **Isotipo:** dos trazos abstractos que se cruzan ligeramente: azul para la acción compartida y verde para el equilibrio. Mantenerlo simple, sin degradados complejos ni sombras.
- **Wordmark:** Manrope 750–800, color `text-primary`. En móvil puede usarse el isotipo solo en contextos donde el título de la pantalla ya identifica el producto; en el inicio se muestra isotipo + “Appachas”.
- **Uso:** no crear versiones con iconos de monedas, calculadoras o personas. El isotipo debe funcionar en 24, 32 y 40 px.

### Paleta de producto

La paleta base es la de la dirección aprobada en Stitch. Los colores “soft” sirven como superficies; los valores oscuros son las variantes para texto y contraste. El azul y el verde no se usan como único indicador de estado.

| Token | Valor | Uso |
|---|---|---|
| `color.bg` | `#F7F9FC` | Fondo general de la aplicación. |
| `color.surface` | `#FFFFFF` | Tarjetas, campos elevados y diálogos. |
| `color.surface-subtle` | `#F0F5FB` | Agrupaciones secundarias y filas alternas. |
| `color.surface-accent` | `#E8F0FA` | Resumen de gasto total y estados informativos. |
| `color.text-primary` | `#102A43` | Títulos, nombres, cantidades y texto principal. |
| `color.text-secondary` | `#526579` | Helpers, metadatos y explicaciones. |
| `color.primary` | `#1463D8` | CTA, enlaces, foco y navegación activa. |
| `color.primary-pressed` | `#0B54BB` | Hover, pressed y enlaces sobre interacción. |
| `color.primary-soft` | `#DCEAFF` | Fondo de selección e información. |
| `color.success` | `#159A63` | Saldo a favor, confirmaciones y cierre completado. |
| `color.success-text` | `#0B5132` | Texto sobre fondos verdes suaves. |
| `color.success-soft` | `#DDF6EA` | Fondo de estados positivos. |
| `color.warning` | `#8A6100` | Texto de advertencia. |
| `color.warning-soft` | `#FFF3D6` | Acentos de advertencia no destructiva. |
| `color.error` | `#C73E4D` | Validación, eliminar y zona de peligro. |
| `color.error-text` | `#7A1D29` | Texto sobre fondo de error suave. |
| `color.error-soft` | `#FCE7EA` | Fondo de errores y confirmación de cierre. |
| `color.outline` | `#8FA3B8` | Borde de inputs y controles no activos. |
| `color.outline-subtle` | `#CBD8E6` | Divisiones y bordes de baja intensidad. |

Reglas de contraste:

- Texto normal y controles esenciales: mínimo WCAG AA 4.5:1.
- Texto grande: mínimo 3:1.
- `color.primary` con texto blanco se reserva a botones sólidos y debe comprobarse en implementación; para textos azules sobre blanco usar `color.primary-pressed` si el tamaño o el peso lo requieren.
- El verde brillante no debe llevar texto blanco pequeño sin verificar contraste: para texto positivo usar `color.success-text` sobre `color.success-soft` o sobre blanco.
- Los estados de saldo incluyen siempre `+`, `−` o `0,00 €`, y un texto explícito como “a favor”, “debe” o “no debe nada”.

### Tipografía

Usar fuentes servidas por la aplicación con fallback del sistema para no bloquear la primera carga.

- **Manrope:** titulares, nombres de sección, importes y botones principales. Aporta personalidad y lectura rápida.
- **Inter:** labels, texto de ayuda, metadatos, mensajes de error y texto copiable. Aporta neutralidad y legibilidad.

| Estilo | Fuente | Tamaño / línea | Peso | Uso |
|---|---|---:|---:|---|
| `display-lg` | Manrope | 40 / 48 px | 800 | Hero del inicio en escritorio y mensaje de cierre. |
| `headline-lg` | Manrope | 28 / 36 px | 800 | Título principal de pantalla. En 320–479 px puede bajar a 26 / 32. |
| `headline-md` | Manrope | 22 / 30 px | 750 | Secciones y resumen. |
| `title-md` | Manrope | 16 / 24 px | 750 | Nombre de gasto, fila o control. |
| `body-lg` | Inter | 16 / 24 px | 400 | Promesa y textos de explicación. |
| `body-md` | Inter | 14 / 21 px | 400 | Metadatos, helpers y texto copiable. |
| `label-md` | Inter | 12 / 16 px | 700 | Labels persistentes, estados y overlines. |
| `amount-lg` | Manrope | 32 / 40 px | 800 | Gasto total y cifra final. |
| `amount-md` | Manrope | 18 / 24 px | 750 | Saldos y cantidades de filas. |

Los importes usan `font-variant-numeric: tabular-nums` y alineación a la derecha en listas. En edición se muestran siempre dos decimales; en resúmenes se permite omitir ceros finales, pero no cambiar la precisión real almacenada en céntimos.

### Iconografía

- Usar una única familia de iconos lineales, preferiblemente Lucide o equivalente compatible con React.
- Tamaño base 24 px, stroke 2 px, terminaciones redondeadas; 20 px solo en metadatos.
- Iconos sugeridos: `ArrowLeft`, `Link`, `Share2`, `Copy`, `Plus`, `Trash2`, `Pencil`, `ChevronRight`, `Check`, `Shield`, `AlertTriangle`, `Flag`, `Clock3`.
- Los iconos no sustituyen labels en acciones críticas. Un botón de icono aislado debe tener nombre accesible y tooltip en escritorio.
- El icono de WhatsApp se usa como señal de “texto listo para compartir”, no como garantía de integración. La acción real usa Web Share API y fallback a copiar.

## 3. Sistema de diseño y tokens

### Espaciado

Usar una escala de 4 px con ritmo visual de 8 px. Los valores son tokens, no medidas aisladas.

| Token | Valor | Uso |
|---|---:|---|
| `space-1` | 4 px | Separación icono-label o ajuste menor. |
| `space-2` | 8 px | Elementos de una misma fila y chips. |
| `space-3` | 12 px | Gap de componentes relacionados. |
| `space-4` | 16 px | Padding móvil y gap estándar entre bloques. |
| `space-5` | 20 px | Separación interna de tarjetas grandes. |
| `space-6` | 24 px | Separación de secciones. |
| `space-8` | 32 px | Márgenes amplios y separación desktop. |
| `space-10` | 40 px | Respiración de hero y estados vacíos. |
| `space-12` | 48 px | Separación excepcional entre zonas de página. |

### Forma, elevación y controles

- `radius-sm`: 8 px para inputs, filas activables y botones secundarios.
- `radius-md`: 12 px para controles agrupados y chips.
- `radius-lg`: 16 px para tarjetas principales, hero y bottom sheets.
- `radius-xl`: 20 px para contenedores de cierre o diálogos prominentes.
- `radius-full`: 9999 px para avatar, badge y botón realmente tipo pill.
- Inputs y botones deben medir al menos 44 × 44 px; se recomienda 48 px en CTA y filas seleccionables.
- Preferir contraste tonal a líneas. Borde de 1 px solo en inputs, estados seleccionados, outline buttons y cuando sea necesario para distinguir un control.
- Sombra estándar: `0 2px 8px rgb(16 42 67 / 8%)`; sombra elevada: `0 8px 24px rgb(16 42 67 / 12%)`. Nunca usar sombras negras duras.
- Foco: anillo de 2 px `color.primary` más 2 px de separación respecto al componente.
- Overlay de diálogo: `rgb(16 42 67 / 28%)`; el contenido sigue siendo blanco y opaco.

### Botones

- **Primary:** fondo `color.primary`, texto blanco, `radius-sm` o `radius-full` solo si el contexto es claramente de CTA. Alto mínimo 48 px. Un solo primary visible por pantalla.
- **Secondary / outline:** fondo transparente, borde `color.primary`, texto `color.primary`. Para “Añadir persona” o “Añadir enlaces de pago”.
- **Tertiary / text:** sin fondo ni borde; para “Cambiar quién eres”, “Ver liquidación” o “Cancelar”.
- **Destructive outline:** borde y texto `color.error`, fondo blanco; usar para “Cerrar grupo” y “Eliminar gasto”. El botón sólido rojo se reserva para confirmación final dentro del diálogo.
- Estados: `hover`, `focus-visible`, `pressed`, `disabled`, `loading` y `success` deben mantener tamaño y no desplazar el layout.

### Componentes de datos

- Los avatares son círculos con la inicial del nombre, color asignado de forma estable por integrante y suficiente contraste. No usar foto ni género inferido.
- Las filas monetarias alinean las cifras a la derecha y mantienen una descripción textual a la izquierda.
- El saldo cero se presenta como `0,00 €` y “No debe ni recibe”.
- La tarjeta de gasto total es una superficie informativa; no debe parecer un botón.

## 4. Responsive y mobile-first

### Viewports de referencia

- **320–359 px:** margen horizontal 16 px; una sola columna; permitir wrapping de nombres y botones; ningún dato crítico se corta.
- **360–479 px:** caso principal, validado en 390 px; CTA sticky con safe area inferior de al menos 24 px.
- **480–767 px:** contenido centrado con máximo 560 px; mantener flujo de una columna para formularios y liquidación.
- **768–1023 px:** máximo 880 px; dashboard con dos columnas cuando haya espacio: gastos como foco y balances como columna secundaria.
- **1024 px o más:** máximo 1120 px, márgenes laterales 32 px; formularios de inicio pueden usar una columna de contenido de 560 px y una zona de explicación breve, sin convertirlo en landing decorativa.

### Reglas de composición

- El orden del DOM sigue el orden de lectura móvil; el desktop solo refluye con CSS Grid.
- El encabezado contextual permanece arriba; no hay navegación global persistente ni sidebar.
- En vistas de edición, la acción de guardar puede ser sticky en móvil y normal al final del formulario en desktop.
- En el dashboard, “+ Añadir gasto” es sticky o flotante en móvil y un botón normal junto a “Gastos” en desktop.
- El safe area inferior se suma al padding, no reemplaza los 16 px de margen: `padding-bottom: max(24px, env(safe-area-inset-bottom))`.
- Los textos largos de nombres y conceptos se truncan solo en una línea secundaria; al abrir el detalle se muestran completos.
- No fijar una altura de tarjeta para contenido variable. Usar `min-height` solo en héroes y estados vacíos.

## 5. Navegación y arquitectura de pantallas

El producto usa navegación contextual: barra superior, botón atrás del navegador o `ArrowLeft`, y acciones propias de la pantalla. El token secreto es la entrada y no debe aparecer en logs ni en enlaces internos como ID incremental.

### Rutas sugeridas

| Ruta | Pantalla | Condición |
|---|---|---|
| `/` | Inicio / crear grupo | Entrada principal. |
| `/g/:token/share` | Compartir grupo | Tras crear; también desde “Compartir” del grupo. |
| `/g/:token` | ¿Quién eres? o Grupo | Si no hay integrante en `sessionStorage`, pedir identidad; si existe, mostrar grupo. |
| `/g/:token/expense/new` | Añadir gasto | Solo con grupo activo. |
| `/g/:token/expense/:id/edit` | Editar gasto | Solo con grupo activo y gasto existente. |
| `/g/:token/settlement` | Liquidación | Grupo activo; cálculo actualizado al entrar. |
| `/unavailable` | Grupo no disponible | Token inválido, grupo cerrado o eliminado. |

### Flujo de entrada

```text
Inicio → Crear grupo → Compartir grupo → /g/:token
                                      ↓
                               ¿Quién eres?
                                      ↓
                                    Grupo
                         ↙ Añadir/editar gasto ↘ Liquidación
                                                       ↓
                                                Confirmar cierre
                                                       ↓
                                           Resumen final en pantalla
```

La selección de identidad se guarda como `sessionStorage` aislado por token de grupo. Si el nombre deja de existir o el grupo cambia, pedir selección de nuevo. “Cambiar quién eres” limpia solo esa clave, no datos del servidor.

## 6. Especificación de pantallas y estados

### 6.1 Inicio / crear grupo

**Objetivo:** crear un grupo con el mínimo de configuración posible.

**Composición:** header con isotipo + “Appachas”; hero “Reparte gastos sin hacer cuentas”; subtítulo “Crea un grupo, comparte el enlace y listo. Sin registro ni contraseñas.”; tarjeta de formulario; nota de privacidad al pie.

**Contenido y controles:**

- Label persistente “Nombre del grupo”; placeholder “Ej. Viaje a Lisboa”.
- Sección “¿Quiénes sois?” con dos filas iniciales de nombres.
- Cada fila tiene input y botón “Eliminar a esta persona”; en icono, el nombre accesible debe incluir el índice o el nombre actual.
- Botón outline “+ Añadir persona”; helper “Mínimo 2 personas”.
- CTA “Crear grupo”.
- Nota: “El enlace es secreto y cada navegador recuerda quién eres.”

**Estados:**

- Vacío: CTA deshabilitado hasta tener nombre y dos nombres válidos.
- Editando: CTA habilitado cuando nombre de grupo no está vacío y hay al menos dos nombres no vacíos.
- Validación: “Escribe un nombre para el grupo”, “Añade al menos 2 personas” y “Los nombres deben ser distintos”. La comparación ignora mayúsculas y espacios laterales.
- Cargando: CTA mantiene ancho y muestra spinner + “Creando grupo…”. No permitir doble envío.
- Error recuperable: banner “No se ha podido crear el grupo. Revisa tu conexión e inténtalo de nuevo.”; conservar todos los campos.
- Éxito: navegar a Compartir grupo con el nombre y enlace recién creados.

### 6.2 Compartir grupo

**Objetivo:** entregar el enlace secreto por el canal más rápido, prioritariamente WhatsApp, sin confundir “secreto” con “privado por usuario”.

**Composición:** top bar con “Grupo creado”; encabezado “Ya podéis empezar”; tarjeta con nombre del grupo y campo de enlace; CTA primary “Compartir enlace”; secondary “Copiar enlace”; bloque informativo con `Shield`.

**Microcopy recomendado:** “Cualquiera que tenga este enlace puede ver y modificar el grupo. Compártelo solo con tu gente.” No usar “protegido” o “solo tú puedes acceder”.

**Estados e interacción:**

- Enlace listo: mostrar el valor completo en un control de solo lectura y permitir copiar.
- Copiado: botón cambia a “Enlace copiado” + check durante 2–3 s y anuncia el cambio en `aria-live="polite"`.
- Compartir compatible: llamar a Web Share API con título “Grupo de Appachas: {nombre}” y texto breve.
- Fallback: si Web Share no existe, copiar y mostrar “Hemos copiado el enlace para que lo pegues donde quieras”.
- Error de copia: “No se ha podido copiar automáticamente. Mantén pulsado el enlace para copiarlo.”
- Volver: vuelve al inicio o al grupo según el origen; no regenerar token sin acción explícita.

### 6.3 ¿Quién eres?

**Objetivo:** dar una identidad local comprensible sin registro.

**Composición:** top bar con nombre del grupo; título “¿Quién eres?”; texto “Elige tu nombre para que tus gastos aparezcan correctamente.”; lista de integrantes como botones de 48 px con avatar e inicial; helper “No hay cuentas ni contraseñas. Este navegador recordará tu elección durante esta sesión.”

**Estados e interacción:**

- Lista normal: ningún nombre preseleccionado si no existe clave de sesión.
- Selección: fila completa con fondo `primary-soft`, check visible y foco conservado.
- Guardado: guardar inmediatamente en `sessionStorage` y navegar al Grupo; no pedir “Confirmar”.
- Cambio desde Grupo: mostrar el nombre actual y acción “Cambiar quién eres”; al volver, invalidar el contexto local y mostrar esta pantalla.
- Datos no disponibles: no mostrar la lista si el token no carga; usar estado de error o pantalla Grupo no disponible según respuesta.

### 6.4 Grupo

**Objetivo:** permitir entender el estado del grupo en una mirada y añadir un gasto en un gesto.

**Composición:**

- Top bar: atrás, “{nombre del grupo}”, acción “Compartir” con `Link`/`Share2`.
- Hero `surface-accent`: label “Gasto total”, importe grande, “{n} personas”.
- Sección “Balances”: filas de avatar, nombre, estado textual y saldo. Ejemplo: “Ana — recibe 32,50 €”; “Luis — debe 18,00 €”; “Pablo — no debe ni recibe”.
- Sección “Gastos”: filas con concepto, “{persona} pagó” y cantidad; cada fila abre menú o detalle de editar/eliminar.
- Enlace “Ver liquidación” con `ChevronRight`.
- CTA sticky móvil “+ Añadir gasto”.

**Estados:**

- Cargando: skeleton de hero, cuatro filas de balance y dos filas de gasto; nunca spinner a pantalla completa si ya existe contenido.
- Sin gastos: hero “0,00 €”, balances en cero y empty state “Todavía no hay gastos. Añade el primero y empezamos.” CTA “+ Añadir gasto”.
- Con datos: mostrar balances y gastos más recientes; si hay muchos, mantener la lista completa con scroll natural.
- Actualizando: indicador discreto “Actualizando…” en la barra o `aria-live`, sin bloquear lectura.
- Error de lectura: banner con “No se han podido cargar los datos del grupo.” y acción “Reintentar”.
- Grupo cerrado/eliminado: pasar a Grupo no disponible; no mostrar datos parciales del servidor.

**Acciones:** compartir no cambia de identidad; “Ver liquidación” recalcula al entrar; editar y eliminar se ofrecen en un menú por gasto, nunca como iconos ambiguos flotando en la fila.

### 6.5 Añadir / editar gasto

**Objetivo:** registrar un gasto válido con reparto equitativo y sin decisiones innecesarias.

**Composición:** top bar “Añadir gasto” o “Editar gasto”; formulario vertical con labels persistentes:

1. “¿Qué habéis pagado?” — placeholder “Ej. Cena del viernes”.
2. “Importe” — input `inputmode="decimal"`, suffix “€” y helper “Usa euros y céntimos”.
3. “¿Quién pagó?” — selector de integrante con avatar.
4. “¿Quiénes participan?” — lista de checkboxes o chips de al menos 48 px para cada persona; todos seleccionados por defecto; helper “Se repartirá a partes iguales”.
5. CTA sticky “Guardar gasto”.

No incluir fecha editable, categoría, notas, porcentajes ni importes manuales: están fuera del MVP.

**Validación:**

- Concepto vacío: “Indica qué habéis pagado”.
- Importe vacío, cero, negativo o ilegible: “Indica un importe mayor que 0 €”.
- Pagador ausente: “Elige quién pagó”.
- Sin participantes: “Selecciona al menos una persona”.
- Pagador o participante que ya no pertenece al grupo: actualizar datos y pedir selección de nuevo.
- No mostrar errores solo en color; asociar cada mensaje con `aria-describedby` y marcar el campo con `aria-invalid`.

**Estados e interacción:**

- Inicial: pagador = persona local actual; participantes = todos.
- Foco: label permanece visible; teclado numérico/decimal en importe; no depender del placeholder.
- Guardando: CTA “Guardando…” con spinner; bloquear solo el formulario, no perder navegación atrás.
- Éxito: toast/banner “Gasto guardado” y volver a Grupo con el nuevo total visible.
- Error: “No se ha podido guardar el gasto. Tus datos siguen aquí.”; permitir reintentar.
- Editar: título “Editar gasto”, CTA “Guardar cambios”, acción terciaria “Eliminar gasto”.
- Eliminar: bottom sheet móvil / diálogo desktop con título “¿Eliminar este gasto?” y texto “Se quitará del balance de todo el grupo.” Acciones “Cancelar” y “Eliminar gasto”.

### 6.6 Liquidación

**Objetivo:** convertir el balance en transferencias mínimas, deterministas y listas para WhatsApp.

**Composición:** top bar con atrás, “Liquidación” y menú de más opciones; encabezado “Ya está todo cuadrado”; subtítulo “Estas son las transferencias mínimas para cerrar el grupo.”; tarjeta de transferencias; CTA “Copiar texto”; bloque de previsualización; enlaces de pago opcionales; zona de cierre al final.

**Transferencias:** cada fila expresa literalmente “Luis paga 18,00 € a Ana” y tiene flecha; quien está a cero aparece “Pablo no debe nada” con guion. Nunca ocultar a quien no debe nada si el MVP exige incluirlo en el texto. Las filas respetan el orden determinista que entregue el backend.

**Texto copiable:** usar el texto devuelto por el backend como fuente de verdad. Ejemplo visual:

```text
Liquidación de Viaje a Lisboa 💸
Luis paga 18,00 € a Ana
María paga 14,50 € a Ana
Pablo no debe nada

¡Gracias a todos! 🙌
```

**Enlaces de pago:** disclosure “Añadir enlaces de pago (opcional)” con helper “Por ejemplo, Bizum”. Revelar un campo por receptor solo si se implementa la decisión pendiente; no simular un botón de pago ni integrar proveedor.

**Estados e interacción:**

- Calculando: skeleton de transferencias y CTA deshabilitado hasta tener texto.
- Liquidación con pagos: mostrar filas y preview.
- Todos a cero: mensaje “Nadie tiene que transferir dinero.” y filas de “no debe nada”. CTA sigue siendo “Copiar texto” para compartir el cierre.
- Copiar listo: botón “Copiar texto”; al éxito, “Texto copiado” + check durante 2–3 s.
- Copia fallida: “No se ha podido copiar. Selecciona el texto y cópialo manualmente.”
- Error de cálculo: “No se ha podido calcular la liquidación.” + “Reintentar”; no mostrar cifras antiguas como si fueran actuales.
- Cerrar grupo: zona `error-soft` al final con texto “Al cerrar se borran todos los datos y el enlace deja de funcionar.” botón outline “Cerrar grupo”.
- Confirmación: diálogo con “Esta acción no se puede deshacer” y botones “Volver” / “Cerrar y borrar grupo”. El segundo debe ser sólido rojo.
- Tras confirmar: conservar en pantalla el resumen final y el texto copiable; mostrar “Grupo cerrado. Los datos ya se han eliminado.” No realizar una segunda llamada de cierre por refresco.

### 6.7 Grupo no disponible

**Objetivo:** explicar el bloqueo sin filtrar información sobre tokens ni dejar a la persona sin salida.

**Composición:** isotipo, icono `Link` o `Clock3`, título “Este grupo ya no está disponible”, texto “El enlace puede ser incorrecto, el grupo puede haberse cerrado o sus datos pueden haberse eliminado.” CTA “Crear un grupo nuevo”.

No mostrar el token recibido, IDs internos ni diferenciar en copy entre “nunca existió” y “se cerró”. Permitir reintentar solo si el error fue de red y no una respuesta definitiva.

## 7. Componentes reutilizables

| Componente | Responsabilidad | Variantes / estados mínimos |
|---|---|---|
| `BrandMark` | Isotipo + wordmark. | `full`, `mark-only`, tamaño 24/32/40. |
| `AppShell` | Fondo, ancho, safe area y landmarks. | `public`, `group`, `dialog-open`. |
| `TopBar` | Atrás, título y acciones contextuales. | `back`, `share`, `menu`, loading. |
| `Button` | Acción con altura estable y feedback. | primary, outline, text, destructive, loading, success, disabled. |
| `TextField` | Label persistente, input, helper y error. | text, decimal/currency, read-only, focused, invalid. |
| `MemberRow` | Avatar, nombre, selección y saldo. | identity, balance-positive, balance-negative, zero, selected. |
| `MemberPicker` | Seleccionar pagador o participantes. | single, multi, all-selected, none-selected, disabled. |
| `Amount` | Formato y alineación de céntimos. | total, balance, expense, negative, zero. |
| `ExpenseRow` | Concepto, pagador, importe y acciones. | default, focused, menu-open, deleting, error. |
| `InfoCard` | Mensaje contextual no destructivo. | privacy, total, share, success, warning. |
| `StickyActionBar` | CTA inferior con safe area. | one-action, primary+secondary, loading. |
| `CopyButton` | Copiar enlace o liquidación. | idle, copying, copied, failure. |
| `ShareAction` | Web Share API y fallback. | native-share, copied-fallback, failure. |
| `ConfirmDialog` | Acción irreversible. | mobile bottom sheet, desktop dialog, loading, error. |
| `Toast / InlineBanner` | Feedback breve y recuperable. | success, error, info, polite live region. |
| `SkeletonBlock` | Carga no disruptiva. | text, amount, row, card. |
| `EmptyState` | Primer uso o ausencia de datos. | no-expenses, unavailable, zero-settlement. |

Cada componente debe recibir labels visibles cuando el contexto sea ambiguo y exponer estados semánticos al DOM. Evitar que las pantallas construyan botones o filas monetarias ad hoc.

## 8. Interacciones y microcopy

### Voz

- Cercana, breve y concreta; usar “tú” y español natural de España.
- Verbos en primera línea: “Crear grupo”, “Compartir enlace”, “Añadir gasto”, “Copiar texto”, “Cerrar grupo”.
- No usar jerga contable: preferir “debe”, “recibe”, “pagó”, “se reparte”.
- No prometer privacidad absoluta: decir “enlace secreto” y explicar el acceso de quien lo tenga.
- Los mensajes de error dicen qué pasó y cuál es la siguiente acción.

### Reglas de feedback

- Las acciones de copia confirman en el botón y en una región `aria-live`; no depender de un toast que desaparece.
- Las operaciones de escritura muestran carga y éxito; mantener la posición de scroll y los valores del formulario.
- Los errores de servidor y red son inline o banner persistente hasta que se resuelvan; incluir “Reintentar”.
- Eliminar y cerrar requieren confirmación; cancelar es siempre visible y no destructivo.
- Respetar `prefers-reduced-motion`; transiciones de 120–180 ms, sin rebotes ni animaciones largas.
- Web Share se intenta solo tras una acción explícita; nunca abrir WhatsApp automáticamente.

### Formato de importes

- Presentación: `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })` o equivalente, con espacio antes de `€`.
- En UI: `184,50 €`, `−18,00 €`, `0,00 €`; usar signo menos real (`−`) en balances.
- Edición: aceptar coma o punto según locale y normalizar en frontend/backend; guardar siempre entero en céntimos.
- En liquidación, reutilizar exactamente la cantidad calculada por backend para no introducir redondeos visuales distintos.

## 9. Accesibilidad y calidad inclusiva

- Objetivo WCAG 2.2 AA en todo el flujo.
- HTML semántico: `header`, `main`, `nav` contextual, `form`, headings en orden y listas para integrantes/gastos.
- Orden de foco igual al orden visual; foco visible en teclado y no atraparlo salvo en diálogo abierto.
- Dialog y bottom sheet: mover foco al título o primer control, cerrar con Escape, devolver foco al disparador y etiquetar consecuencias.
- Todos los inputs tienen label asociado; helper y error se enlazan con `aria-describedby`; usar `aria-invalid` solo cuando corresponda.
- Las filas seleccionables son botones o checkboxes reales, no `div` con click. El estado seleccionado se expresa con check y texto.
- Targets de 44 × 44 px como mínimo; separación suficiente para no activar dos filas por error.
- Contraste AA para texto, controles, iconos funcionales y foco. No comunicar saldo, error o selección únicamente con verde/rojo.
- Anunciar cambios de copiar, guardar, eliminar y refrescar con regiones live breves y no intrusivas.
- El campo de importe usa teclado decimal, `autocomplete="off"` y un texto visible de unidad “€” fuera del valor editable.
- No usar el enlace secreto como texto de alt, título o log. Si se visualiza, debe ser un control de solo lectura con acción de copiar explícita.
- Soportar zoom de texto al 200 % y ancho efectivo de 320 px sin scroll horizontal.
- Respetar `prefers-reduced-motion`, modo de alto contraste del sistema cuando esté disponible y navegación completa por teclado en desktop.
- Las pruebas manuales mínimas incluyen VoiceOver/Safari o TalkBack/Chrome en flujo de crear, escoger identidad, guardar gasto, copiar y cerrar.

## 10. Criterios de aceptación visual

La implementación se acepta visualmente cuando:

- Se ve y funciona desde 320 px; se valida especialmente 390 × 844 px sin CTA principal oculto tras el teclado o el safe area.
- La jerarquía es reconocible en menos de 3 segundos: título, total/estado y acción primaria.
- Inicio, formulario de gasto y liquidación mantienen fondo `#F7F9FC`, tarjetas blancas, radios coherentes y la combinación Manrope + Inter.
- El azul se reserva a acción/navegación, el verde a estado positivo y el rojo a error/destrucción; no hay arcoíris de estados.
- Los importes quedan alineados, usan coma decimal, espacio antes de `€` y signos visibles.
- Cada estado de carga tiene skeleton o feedback estable; ningún spinner tapa toda la interfaz después de que haya contenido.
- Los errores aparecen junto al campo o zona afectada, se leen con lector de pantalla y permiten corregir o reintentar.
- La selección de identidad y participantes se entiende sin color: check, fondo, borde y texto.
- Copiar enlace y copiar liquidación muestran éxito explícito; compartir tiene fallback funcional.
- Cerrar grupo exige confirmación, explica la eliminación irreversible y conserva el resumen final en pantalla.
- El grupo no disponible no revela si un token fue válido y ofrece una salida a crear otro grupo.
- En desktop, la ampliación distribuye el contenido sin estirar líneas de texto ni convertir el dashboard en un panel denso.
- No aparecen funcionalidades fuera de `MVP.md`: login, roles, pagos directos, categorías, gráficos, porcentajes, varias monedas o tiempo real.

## 11. Artefactos de Stitch

La exploración visual se realizó en un proyecto de Stitch que generó las referencias siguientes. Los identificadores son recursos canónicos de Stitch; los `downloadUrl` de las imágenes y HTML pueden ser temporales.

- **Proyecto:** `projects/12060748565970762115` — “Appachas — repartir gastos sin fricción”.
- **Sistema de diseño:** `assets/14872239608665655062` — “Appachas — Mesa Clara”.
- **Isotipo:** `projects/12060748565970762115/screens/3044eb9787ee411ca9ddea91832c9fe5`.
- **Inicio / crear grupo:** `projects/12060748565970762115/screens/56924fc16e474453a24a60c6b383708b`; screenshot `projects/12060748565970762115/files/f25548b70274465898ff1e3de9ea47eb`; HTML `projects/12060748565970762115/files/a6abec5a95d3453bb16dca671b6e3395`.
- **Grupo / Viaje a Lisboa:** `projects/12060748565970762115/screens/9f7cf6b0780f45d6897b77404943e68b`; screenshot `projects/12060748565970762115/files/8fc794d2a1304eda88d84687060c8d97`; HTML `projects/12060748565970762115/files/718b62da57fd43caade22beab4f5a19c`.
- **Añadir gasto:** `projects/12060748565970762115/screens/035d9c3057bd4247b3fd7ae0e952efb4`; screenshot `projects/12060748565970762115/files/672508592d5d48beb3320d34c3bcb32b`; HTML `projects/12060748565970762115/files/83e4a89f6b3248f2b02cbc8bd308f45a`.
- **Liquidación / cierre:** `projects/12060748565970762115/screens/dd9a2a408f1142e88eed454f5c7c932c`; screenshot `projects/12060748565970762115/files/7440fe3ef35340748b166a3d2bd3418b`; HTML `projects/12060748565970762115/files/1af7df89955f4052b4f8d5df8fd28dab`.

Las pantallas generadas se usaron como exploración y referencia de jerarquía, no como sustituto de los estados funcionales descritos aquí. La especificación final debe respetar `MVP.md`, especialmente el almacenamiento en céntimos, la identidad local mediante `sessionStorage`, el carácter secreto del enlace y la eliminación irreversible al cerrar.
