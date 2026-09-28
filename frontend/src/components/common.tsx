import { AlertCircle, ArrowLeft, Check, LoaderCircle, X } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Link } from "react-router-dom";
import { initials } from "../lib/format";
import { Button } from "./ui/button";

export function Avatar({
  alias,
  small = false,
}: {
  alias: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar${small ? " avatar-small" : ""}`}
      aria-hidden="true"
    >
      {initials(alias)}
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  back?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      {back && (
        <Link className="back-link" to={back}>
          <ArrowLeft size={18} aria-hidden="true" /> Volver al grupo
        </Link>
      )}
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div className="heading-row">
        <div>
          <h1>{title}</h1>
          {description && (
            <p className="muted page-description">{description}</p>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}

export function Feedback({
  error,
  success,
}: {
  error?: unknown;
  success?: string;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  if (message)
    return (
      <div className="feedback feedback-error" role="alert">
        <AlertCircle size={19} aria-hidden="true" />
        <p>{message}</p>
      </div>
    );
  if (success)
    return (
      <div className="feedback feedback-success" role="status">
        <Check size={19} aria-hidden="true" />
        <p>{success}</p>
      </div>
    );
  return null;
}

export function Loading({ label = "Cargando el grupo…" }: { label?: string }) {
  return (
    <div className="empty-state" role="status">
      <LoaderCircle className="spinner" size={28} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function Field({
  label,
  id,
  hint,
  error,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{
        "aria-describedby"?: string;
        "aria-invalid"?: boolean;
      }>(children)
        ? cloneElement(children, {
            "aria-describedby":
              [
                children.props["aria-describedby"],
                hint && `${id}-hint`,
                error && `${id}-error`,
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            "aria-invalid": error ? true : children.props["aria-invalid"],
          })
        : children}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  action,
  busy,
  onConfirm,
  onCancel,
  error,
}: {
  open: boolean;
  title: string;
  description: string;
  action: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  error?: unknown;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <Button
          variant="ghost"
          className="icon-button"
          aria-label="Cerrar confirmación"
          onClick={onCancel}
          disabled={busy}
        >
          <X size={20} />
        </Button>
      </div>
      <p id={descriptionId} className="muted">
        {description}
      </p>
      <Feedback error={error} />
      <div className="dialog-actions">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button className="button-danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Un momento…" : action}
        </Button>
      </div>
    </dialog>
  );
}
