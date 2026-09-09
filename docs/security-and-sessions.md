# Acceso, sesiones y cookies

Este documento fija el contrato de acceso del MVP. `MVP.md` define el
comportamiento de producto y [`code-architecture.md`](code-architecture.md)
define los límites técnicos; este documento resuelve cómo se transportan las
credenciales entre ambos.

## Decisión normativa

Appachas no usa cookies de seguimiento, analítica, publicidad ni servicios de
terceros. Sí puede usar una cookie propia de sesión, necesaria para mantener la
identidad reclamada sin volver a exponer el enlace secreto en cada petición.

La sesión se representa mediante un identificador opaco, aleatorio y de alta
entropía. No es un JWT ni contiene nombres, alias, permisos ni datos del grupo.
La base de datos guarda únicamente el hash de ese identificador.

## Dos enlaces secretos

- El enlace de integrantes permite consultar los metadatos y reclamar una
  identidad.
- El enlace de creador permite iniciar una sesión con permisos de creador y
  reclama automáticamente la identidad creadora.
- Ambos enlaces son credenciales iniciales. No se reutilizan como credencial de
  las operaciones posteriores a la sesión.
- Los tokens de enlace se generan aleatoriamente, no se almacenan en claro y no
  aparecen en logs, analítica, mensajes de error ni respuestas innecesarias.
- Tras canjear un enlace, el frontend elimina el token de la barra de
  navegación mediante reemplazo de historial. El backend nunca lo devuelve en
  el cuerpo de una respuesta de sesión.

## Cookie de sesión

La cookie de sesión:

- es `HttpOnly`, `Secure` en producción y `SameSite=Strict`;
- se limita al mismo origen de la aplicación;
- no contiene información legible por el frontend;
- se invalida al cerrar o caducar el grupo y al liberar/cambiar la identidad
  cuando corresponda;
- se elimina al borrar los datos del sitio. En ese caso, el integrante debe
  pedir al creador que libere su identidad para volver a reclamarla, según
  [`MVP.md`](../MVP.md).

El almacenamiento local puede conservar únicamente la referencia de UX
necesaria para recordar el grupo y la identidad elegida. No debe guardar el
token del enlace ni la credencial de sesión.

## Flujo de canje

1. El navegador abre un enlace de integrantes o de creador.
2. El frontend usa el token solo para solicitar metadatos o iniciar la sesión
   correspondiente.
3. El backend valida el hash del token y, en una transacción, crea o recupera
   la sesión permitida.
4. El backend establece la cookie `HttpOnly` y devuelve solo el estado necesario
   para la pantalla.
5. Las peticiones posteriores usan la cookie y no incluyen tokens secretos en
   la ruta, la query string ni el cuerpo.

Las reclamaciones simultáneas siguen devolviendo `409 Conflict`. La cookie no
elimina la reclamación server-side ni permite que dos sesiones ocupen la misma
identidad.

## API de acceso

El token aparece únicamente en las rutas de entrada:

```text
GET  /api/groups/{member-token}/metadata
POST /api/groups/{member-token}/claims
POST /api/groups/{creator-token}/session
```

Después del canje, las rutas usan la sesión autenticada:

```text
GET    /api/groups/session
POST   /api/groups/session/movements
PUT    /api/groups/session/movements/{id}
DELETE /api/groups/session/movements/{id}
GET    /api/groups/session/settlement
PUT    /api/groups/session/group
POST   /api/groups/session/members
PUT    /api/groups/session/members/{id}
DELETE /api/groups/session/members/{id}
DELETE /api/groups/session/group
```

Los endpoints de administración comprueban en la sesión que el actor es el
creador. Una sesión de integrante no puede convertirse en sesión de creador.
Los grupos inválidos, cerrados o caducados responden `404` sin distinguir la
causa.

## Protección de peticiones

- Las operaciones que cambian estado validan `Origin` o `Referer` según la
  política de mismo origen documentada en la arquitectura.
- El servidor envía una política `Referrer-Policy` que evita reenviar enlaces
  secretos a otros orígenes.
- No se cargan scripts de analítica ni recursos de terceros que puedan recibir
  URLs, cookies o datos de movimientos.
- Los errores, logs y métricas técnicas no contienen tokens completos, cookies,
  nombres, alias, conceptos ni importes.

La cookie propia de sesión es una credencial técnica de funcionamiento; no
constituye una cuenta, un registro de usuario ni telemetría de producto.
