import { ArrowRight, Check, Copy, Info, KeyRound, Share2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Feedback, Field, PageHeading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { entryLinks } from "../../lib/access";
import { copyText, dateRange, groupPath, shareText } from "../../lib/format";
import { useGroup } from "./GroupContext";

export function SharePage() {
  const { group, groupId } = useGroup();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const { creatorUrl, memberUrl } = entryLinks(groupId);
  const text = `${group.name} · ${dateRange(group.start_date, group.end_date)}\nVamos a llevar las cuentas en Appachas. Abre el enlace y elige tu nombre para entrar al grupo:\n${memberUrl ?? ""}`;
  async function perform(action: "share" | "copy-member" | "copy-creator") {
    setError(undefined);
    setMessage("");
    setBusy(true);
    try {
      if (action === "share") {
        const result = await shareText(text);
        if (result === "copied")
          setMessage(
            "El texto y el enlace se han copiado. Pégalos en vuestro chat.",
          );
      } else {
        await copyText(
          action === "copy-creator" ? (creatorUrl ?? "") : (memberUrl ?? ""),
        );
        setMessage(
          action === "copy-creator"
            ? "Enlace de creador copiado. Guárdalo en un lugar privado."
            : "Enlace de integrantes copiado.",
        );
      }
    } catch {
      setError(
        "No se pudo compartir o copiar. Puedes seleccionar el enlace y copiarlo manualmente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page">
      <div className="share-icon">
        <Check size={28} aria-hidden="true" />
      </div>
      <PageHeading
        title="El plan ya tiene grupo"
        description={`${group.name} · ${dateRange(group.start_date, group.end_date)}`}
      />
      <div className="stack">
        {(memberUrl || creatorUrl) && (
          <p className="notice">
            Guarda los enlaces antes de recargar o cerrar esta pestaña. Appachas
            no los guarda en el navegador y no puede recuperarlos.
          </p>
        )}
        <section className="card stack">
          <div>
            <h2>Invita al resto</h2>
            <p className="muted mt-2">
              Comparte este enlace en vuestro chat. Cada integrante podrá elegir
              su identidad y apuntar movimientos.
            </p>
          </div>
          {memberUrl ? (
            <>
              <Field id="member-link" label="Enlace de integrantes">
                <input
                  id="member-link"
                  readOnly
                  value={memberUrl}
                  onFocus={(event) => event.target.select()}
                />
              </Field>
              <div className="link-actions">
                <Button disabled={busy} onClick={() => void perform("share")}>
                  <Share2 size={17} aria-hidden="true" />
                  Compartir enlace de integrantes
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void perform("copy-member")}
                >
                  <Copy size={17} aria-hidden="true" />
                  Copiar enlace de integrantes
                </Button>
              </div>
            </>
          ) : (
            <p className="notice">
              El enlace de integrantes se mostró al crear el grupo. No se guarda
              en el navegador. Puedes recuperarlo del chat en el que lo
              compartisteis.
            </p>
          )}
          <div className="info-inline">
            <Info size={18} aria-hidden="true" />
            <p>
              Quien tenga este enlace podrá reclamar una identidad. El enlace no
              verifica quién es la persona.
            </p>
          </div>
        </section>
        {group.role === "creator" && (
          <section className="card stack">
            <div className="card-title mb-0">
              <KeyRound size={22} aria-hidden="true" />
              <h2 className="text-base">Tu enlace de creador</h2>
              <span className="badge badge-neutral">Privado</span>
            </div>
            <p className="notice">
              No lo compartas. Este enlace permite administrar y cerrar el
              grupo. Guárdalo: si lo pierdes, no se puede recuperar ni
              regenerar.
            </p>
            {creatorUrl ? (
              <>
                <Field id="creator-link" label="Enlace de creador">
                  <input
                    id="creator-link"
                    readOnly
                    value={creatorUrl}
                    onFocus={(event) => event.target.select()}
                  />
                </Field>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void perform("copy-creator")}
                >
                  <Copy size={17} aria-hidden="true" />
                  Copiar enlace de creador
                </Button>
              </>
            ) : (
              <p className="muted">
                Este enlace solo está disponible al crear el grupo o al abrir el
                enlace privado original. Usa la copia que guardaste; tu sesión
                actual sigue funcionando.
              </p>
            )}
          </section>
        )}
        <Feedback success={message} error={error} />
        <Button asChild variant="outline" className="full-width">
          <Link to={groupPath(groupId)}>
            Ir al grupo
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
