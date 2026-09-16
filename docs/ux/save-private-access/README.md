# Guardar el acceso privado

La pantalla pasa de un aviso general y dos enlaces a dos tareas explícitas: invitar al grupo y conservar el acceso privado. La invitación mantiene la prioridad azul; la descarga voluntaria utiliza el botón secundario de Mesa Clara. Se conserva copiar como alternativa, sin dar por guardado lo que solo está en el portapapeles.

El archivo `appachas-acceso-privado.txt` contiene nombre del grupo, enlace completo, instrucciones y advertencia de no compartir. No se descarga automáticamente ni persisten tokens en WebStorage. Tras recargar se explica que la sesión funciona y dónde buscar la copia. Sin una copia no hay recuperación ni regeneración.

## Comparación reproducible

Capturas antes: master 4503e99 en 5173. Después: rama ux/save-private-access en 5184. Grupos ficticios equivalentes «Escapada a Lisboa», Ana y Bruno, 16–20 septiembre 2026. Móvil 390 × 844, escritorio 1440 × 1000. Los rectángulos azules claros ocultan los enlaces secretos. Ninguna semilla, token ni archivo descargado se publica.

- `before/after-initial-mobile.png`: tareas al crear.
- `before/after-initial-desktop.png`: misma pantalla en escritorio.
- `before/after-reload-mobile.png`: sesión conservada sin enlaces en memoria.
- `after-download-mobile.png`: confirmación contextual de descarga iniciada; se pide comprobar el archivo, sin afirmar que el navegador ya lo guardó.

Inter Variable y Manrope Variable verificadas como cargadas para el rango latino. Comprobación adicional a 320 px sin desbordamiento horizontal.

## Verificación

- `npm --prefix frontend run check` y 67 pruebas frontend.
- E2E móvil de compartir invitación y reclamar identidad persistente desde otro dispositivo.
- Descarga real con Playwright: nombre y contenido correctos; URL del archivo abierta en un contexto limpio devuelve rol creador; token ausente de localStorage y sessionStorage.

La ley de Tesler motiva trasladar la preparación de la copia a la aplicación. La conservación final sigue requiriendo una acción de la persona: los enlaces son credenciales privadas y el MVP no contempla su recuperación. El aviso visible al principio reduce la necesidad de descubrir y recordar esta tarea más abajo.
