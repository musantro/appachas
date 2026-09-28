export function downloadPrivateAccess(name: string, url: string): void {
  const content = `Appachas — acceso privado\nGrupo: ${name}\n\nNo compartas este archivo. Su enlace permite administrar y cerrar el grupo.\n\nPara volver a entrar, copia este enlace completo en tu navegador:\n${url}\n\nConserva el archivo en un lugar privado. El enlace no puede recuperarse ni regenerarse y deja de funcionar cuando el grupo se cierra o caduca.\n`;
  const objectUrl = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "appachas-acceso-privado.txt";
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
