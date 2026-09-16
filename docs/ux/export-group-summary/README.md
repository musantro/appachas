# Guardar el resumen del grupo

Al saldar un grupo desaparecían los botones de copiar y compartir, y cerrar dejaba un resumen temporal sin una acción para conservarlo. Liquidación ofrece ahora «Descargar resumen» en todos los estados, también después de cerrar mientras siga abierta la pantalla. El TXT UTF-8 contiene fechas, integrantes, movimientos con tipo y reparto, total neto, balances y pagos pendientes. La descarga es voluntaria; no almacena tokens ni sesiones ni permite restaurar grupos eliminados.

La [regla del pico y final](https://lawsofux.com/peak-end-rule/) señala la importancia de los momentos finales en el recuerdo de una experiencia. Aplicada aquí, motiva que terminar las cuentas incluya una acción clara para conservarlas. Es una justificación heurística, no una medición de satisfacción.

Se mantienen tarjetas, tipografías y botón outline de Mesa Clara (`DESIGN.md`). La sección de descarga es independiente de la de pagos y precede al cierre, para que también pueda usarse cuando el grupo está saldado o vacío.

Capturas reales de Chromium local a 390 px, antes sobre master y después sobre esta rama, con la misma semilla ficticia: Ana y Bruno; grupo vacío y grupo saldado con cena de 60 € y aportación de 30 €. Las imágenes terminadas en `320` comprueban el cierre a anchura mínima. Se cargaron Inter y Manrope antes de capturar. No hay datos ni enlaces de grupos reales.

Validación: `npm run check`; `npm test` (67 pruebas). Cuatro descargas reales (vacío/saldado, antes/después del cierre); el contenido de cada par coincide byte a byte y contiene los nombres y movimientos esperados, sin credenciales. Al recargar después del cierre aparece «Grupo no disponible». Sin desbordamiento horizontal a 390 y 320 px. Las pruebas unitarias cubren céntimos, reembolso neto negativo, múltiples destinatarios, deudas y exclusión de metadata de sesión. Los únicos grupos cerrados fueron copias ficticias creadas para esta comprobación.
