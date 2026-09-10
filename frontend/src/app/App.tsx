import { QueryClientProvider } from "@tanstack/react-query";
import { ArrowUpRight, Code2, Cookie, Heart, ShieldCheck } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Feedback, PageHeading } from "../components/common";
import { Button } from "../components/ui/button";
import { CreateGroup } from "../features/create/CreateGroup";
import {
  GroupBoundary,
  GroupUnavailable,
} from "../features/groups/GroupContext";
import { GroupPage } from "../features/groups/GroupPage";
import { MovementPage } from "../features/groups/MovementPage";
import { OptionsPage } from "../features/groups/OptionsPage";
import { SettlementPage } from "../features/groups/SettlementPage";
import { SharePage } from "../features/groups/SharePage";
import { createQueryClient } from "../lib/query";

const queryClient = createQueryClient();

function Shell() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title =
      location.pathname === "/"
        ? "Appachas · Cuentas claras, buenos planes"
        : "Appachas · Vuestro grupo";
  }, [location.pathname]);
  return (
    <>
      <button
        type="button"
        className="skip-link"
        onClick={() => {
          document.getElementById("main-content")?.focus();
        }}
      >
        Saltar al contenido
      </button>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Appachas, inicio">
          <span className="brand-mark">
            <svg
              viewBox="0 0 32 32"
              width="26"
              height="26"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m8 23 8-14 8 14M12 17h8"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          appachas<span className="text-primary">.</span>
        </Link>
        <span className="header-note">
          <ShieldCheck size={16} aria-hidden="true" />
          Menos cuentas. Más momentos.
        </span>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<CreateGroup />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            path="/g"
            element={
              <GroupBoundary>
                <GroupPage />
              </GroupBoundary>
            }
          />
          <Route
            path="/g/share"
            element={
              <GroupBoundary>
                <SharePage />
              </GroupBoundary>
            }
          />
          <Route
            path="/g/movements/new"
            element={
              <GroupBoundary>
                <MovementPage />
              </GroupBoundary>
            }
          />
          <Route
            path="/g/movements/:movementId"
            element={
              <GroupBoundary>
                <MovementPage />
              </GroupBoundary>
            }
          />
          <Route
            path="/g/options"
            element={
              <GroupBoundary>
                <OptionsPage />
              </GroupBoundary>
            }
          />
          <Route
            path="/g/settlement"
            element={
              <GroupBoundary>
                <SettlementPage />
              </GroupBoundary>
            }
          />
          <Route path="*" element={<GroupUnavailable />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <p className="flex items-center gap-2">
          <Heart size={14} aria-hidden="true" />
          Para los planes que merecen compartirse.
        </p>
        <div className="footer-links">
          <Link to="/privacy">
            <Cookie size={14} aria-hidden="true" />
            Privacidad
          </Link>
          <a
            href={
              import.meta.env.VITE_REPOSITORY_URL ||
              "https://github.com/musantro/appachas"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <Code2 size={14} aria-hidden="true" />
            Código abierto · MIT
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </>
  );
}

function PrivacyPage() {
  return (
    <div className="narrow-page">
      <PageHeading
        title="Tu plan, vuestros datos"
        description="Appachas funciona sin cuentas, sin publicidad y sin analítica de terceros."
      />
      <article className="card privacy-copy">
        <section>
          <h2>Solo lo necesario</h2>
          <p>
            Guardamos el nombre del grupo, fechas, zona horaria, alias y
            movimientos para repartir los gastos. Los enlaces secretos dan
            acceso al grupo: comparte únicamente el enlace de integrantes con
            las personas de vuestro plan.
          </p>
        </section>
        <section>
          <h2>Recordar tu identidad</h2>
          <p>
            Usamos una cookie técnica para conservar la identidad que reclamas
            en este navegador. No es una cookie publicitaria ni se utiliza para
            seguir tu actividad. Los enlaces secretos se utilizan solo para
            abrir una sesión y después se quitan de la barra de navegación. No
            guardamos enlaces ni credenciales en el almacenamiento local del
            navegador.
          </p>
        </section>
        <section>
          <h2>Datos que tienen fecha de salida</h2>
          <p>
            El creador puede cerrar el grupo y eliminar de inmediato sus datos
            de la base de datos operativa. Después del viaje se elimina
            automáticamente tras diez días sin nuevos movimientos, con un límite
            de treinta días desde la fecha final. Las lecturas no alargan este
            plazo.
          </p>
        </section>
        <section>
          <h2>Sin recuperación</h2>
          <p>
            Los grupos cerrados o caducados no se pueden recuperar. El resumen
            de cierre solo permanece en la pantalla abierta. La política de
            borrado inmediato se refiere a la base de datos operativa; la
            retención de copias de seguridad queda fuera de esta versión.
          </p>
        </section>
        <Button asChild variant="outline">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </article>
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not emit user data or secret URLs to logs or telemetry. */
  }
  render() {
    return this.state.failed ? (
      <main className="app-main narrow-page stack">
        <PageHeading title="Algo no ha salido bien" />
        <Feedback error="No pudimos mostrar esta pantalla. Recarga para volver a intentarlo." />
        <Button onClick={() => window.location.reload()}>
          Recargar página
        </Button>
      </main>
    ) : (
      this.props.children
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
