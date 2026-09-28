import { ArrowRight, Check, Copy, Download, Info, Share2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Feedback, Field, PageHeading } from "../../components/common";
import { Button } from "../../components/ui/button";
import { entryLinks } from "../../lib/access";
import { downloadPrivateAccess } from "../../lib/access-download";
import { copyText, dateRange, groupPath, shareText } from "../../lib/format";
import { useGroup } from "./GroupContext";

export function SharePage() {
  const { group, groupId } = useGroup();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState("member");
  const { creatorUrl, memberUrl } = entryLinks(groupId);
  const text = `${group.name} · ${dateRange(group.start_date, group.end_date)}\nVamos a llevar las cuentas en Appachas. Abre el enlace y elige tu nombre para entrar al grupo:\n${memberUrl ?? ""}`;
  async function perform(
    action: "share" | "copy-member" | "copy-creator" | "download",
  ) {
    setFeedbackTarget(
      action === "download" || action === "copy-creator" ? "creator" : "member",
    );
    setError(undefined);
    setMessage("");
    setBusy(true);
    try {
      if (action === "download" && creatorUrl) {
        downloadPrivateAccess(group.name, creatorUrl);
        setMessage(
          "Descarga iniciada. Comprueba que tienes appachas-acceso-privado.txt en tus descargas y guárdalo en un lugar privado.",
        );
      } else if (action === "share") {
        const result = await shareText(text);
        if (result === "copied")
          setMessage(
            "El texto y el enlace se han copiado. Pégalos en vuestro chat.",
          );
        if (result === "shared") setMessage("Invitación compartida.");
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
        action === "download"
          ? "No se pudo descargar. Copia el enlace de creador y guárdalo en un lugar privado."
          : "No se pudo compartir o copiar. Puedes seleccionar el enlace y copiarlo manualmente.",
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
            Antes de recargar o cerrar:{" "}
            {memberUrl && creatorUrl
              ? "comparte la invitación y descarga tu acceso privado."
              : creatorUrl
                ? "descarga tu acceso privado."
                : "comparte o guarda la invitación."}{" "}
            Los enlaces no se podrán mostrar de nuevo aquí.
          </p>
        )}
        <section className="card stack">
          <div>
            <h2>{group.role === "creator" ? "1. " : ""}Invita al grupo</h2>
            {memberUrl && (
              <p className="muted mt-2">
                Comparte este enlace en vuestro chat. Cada integrante podrá
                elegir su identidad y apuntar movimientos.
              </p>
            )}
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
                  Compartir invitación
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void perform("copy-member")}
                >
                  <Copy size={17} aria-hidden="true" />
                  Copiar invitación
                </Button>
              </div>
            </>
          ) : (
            <p className="notice">
              La invitación ya no está disponible aquí. Si la compartiste,
              búscala en vuestro chat y reenvíala desde allí. Appachas no puede
              recuperarla ni crear otra.
            </p>
          )}
          {feedbackTarget === "member" && (
            <Feedback success={message} error={error} />
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
              <h2>
                {creatorUrl ? "2. Guarda tu acceso" : "2. Tu acceso privado"}
              </h2>
              <span className="badge badge-neutral">Privado</span>
            </div>
            <p className="notice">
              No lo compartas: permite administrar y cerrar el grupo.{" "}
              {creatorUrl
                ? "Descarga el archivo y consérvalo en un lugar privado."
                : "Conserva tu copia en un lugar privado."}{" "}
              Si pierdes el enlace, no se puede recuperar ni regenerar.
            </p>
            {creatorUrl ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void perform("download")}
                >
                  <Download size={17} aria-hidden="true" />
                  Descargar acceso privado
                </Button>
                {feedbackTarget === "creator" && (
                  <Feedback success={message} error={error} />
                )}
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
                Tu sesión actual sigue funcionando. Para entrar desde otro
                navegador, busca appachas-acceso-privado.txt en tus descargas o
                la copia del enlace que guardaste. Al abrir ese enlace podrás
                descargarlo de nuevo. Sin una copia no se puede recuperar.
              </p>
            )}
          </section>
        )}
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
