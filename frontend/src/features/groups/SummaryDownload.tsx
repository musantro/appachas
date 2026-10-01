import { Download } from "lucide-react";
import { useState } from "react";
import { Feedback } from "../../components/common";
import { Button } from "../../components/ui/button";
import type { Group } from "../../lib/api";
import { downloadGroupMovementsCsv } from "../../lib/group-movements-csv";

export function SummaryDownload({ group }: { group: Group }) {
  const [error, setError] = useState<unknown>();
  return (
    <section className="card stack-small">
      <h2 className="text-base">Guarda las cuentas</h2>
      <p className="muted">
        Descarga una fila por persona y movimiento en un CSV compatible con
        hojas de cálculo. Guarda tu copia antes de salir: al cerrar el grupo sus
        datos se eliminan.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setError(undefined);
          try {
            downloadGroupMovementsCsv(group);
          } catch {
            setError(
              "No se pudo descargar el CSV. Inténtalo de nuevo antes de salir.",
            );
          }
        }}
      >
        <Download size={18} aria-hidden="true" />
        Descargar CSV
      </Button>
      <Feedback error={error} />
    </section>
  );
}
