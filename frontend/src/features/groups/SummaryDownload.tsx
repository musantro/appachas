import { Download } from "lucide-react";
import { useState } from "react";
import { Feedback } from "../../components/common";
import { Button } from "../../components/ui/button";
import type { Group } from "../../lib/api";
import { downloadGroupSummary } from "../../lib/group-summary";

export function SummaryDownload({ group }: { group: Group }) {
  const [error, setError] = useState<unknown>();
  return (
    <section className="card stack-small">
      <h2 className="text-base">Guarda las cuentas</h2>
      <p className="muted">
        Descarga integrantes, movimientos, repartos, balances y pagos pendientes
        en un archivo de texto. Guarda tu copia antes de salir: al cerrar el
        grupo sus datos se eliminan.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setError(undefined);
          try {
            downloadGroupSummary(group);
          } catch {
            setError(
              "No se pudo descargar el resumen. Inténtalo de nuevo antes de salir.",
            );
          }
        }}
      >
        <Download size={18} aria-hidden="true" />
        Descargar resumen
      </Button>
      <Feedback error={error} />
    </section>
  );
}
