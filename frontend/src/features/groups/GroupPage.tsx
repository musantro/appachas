import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  List,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  Share2,
  Users,
  Wallet,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { Avatar, PageHeading } from "../../components/common";
import { Button } from "../../components/ui/button";
import type { Group, Movement } from "../../lib/api";
import { calendarDate, dateRange, groupPath, money } from "../../lib/format";
import { groupKey, useGroup } from "./GroupContext";

export function GroupTabs() {
  const { groupId } = useGroup();
  return (
    <nav className="group-tabs" aria-label="Secciones del grupo">
      <NavLink to={groupPath(groupId)} end>
        <List size={17} aria-hidden="true" />
        Movimientos
      </NavLink>
      <NavLink to={groupPath(groupId, "/settlement")}>
        <Wallet size={17} aria-hidden="true" />
        Liquidación
      </NavLink>
      <NavLink to={groupPath(groupId, "/options")}>
        <Settings size={17} aria-hidden="true" />
        Opciones
      </NavLink>
    </nav>
  );
}

export function Balances({
  group,
  showSettlementStatus = false,
}: {
  group: Group;
  showSettlementStatus?: boolean;
}) {
  return (
    <ul aria-label="Balances de integrantes">
      {group.balances.map((balance) => (
        <li
          className="balance-row"
          key={balance.member_id}
          aria-label={
            balance.amount_cents > 0
              ? `${balance.alias} recibe ${money(balance.amount_cents)}`
              : balance.amount_cents < 0
                ? `${balance.alias} debe ${money(-balance.amount_cents)}`
                : `${balance.alias} está saldada`
          }
        >
          <Avatar alias={balance.alias} small />
          <div className="balance-info">
            <strong>{balance.alias}</strong>
            {showSettlementStatus && (
              <span className="badge balance-status">
                {balance.amount_cents === 0 ? "Liquidado" : "Pendiente"}
              </span>
            )}
          </div>
          <div
            className={`balance-value${balance.amount_cents > 0 ? " positive" : ""}`}
          >
            {balance.amount_cents === 0
              ? "Saldado"
              : money(Math.abs(balance.amount_cents))}
            {balance.amount_cents !== 0 && (
              <span>{balance.amount_cents > 0 ? "recibe" : "debe"}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GroupPage() {
  const { group, groupId } = useGroup();
  const queryClient = useQueryClient();
  const me = group.members.find((member) => member.id === group.my_member_id);
  const myBalance = group.balances.find(
    (balance) => balance.member_id === group.my_member_id,
  );
  const names = Object.fromEntries(
    group.members.map((member) => [member.id, member.alias]),
  );
  function movementContext(movement: Movement) {
    const payer = names[movement.payer_id];
    if (movement.type === "contribution") {
      const recipients = movement.allocations.map(
        (allocation) => names[allocation.member_id],
      );
      return `${payer} envió a ${new Intl.ListFormat("es").format(recipients)}`;
    }
    const count = movement.allocations.length;
    const split = count === 1 ? "Para 1 persona" : `Entre ${count} personas`;
    return movement.type === "refund"
      ? `${payer} recibió la devolución · ${split}`
      : `Pagó ${payer} · ${split}`;
  }
  return (
    <>
      <PageHeading
        eyebrow={`Hola, ${me?.alias ?? "bienvenido"}`}
        title={group.name}
      >
        <div className="group-header-actions">
          <Button asChild variant="outline">
            <Link
              to={groupPath(groupId, "/share")}
              aria-label="Compartir grupo"
            >
              <Share2 size={18} aria-hidden="true" />
              <span>Compartir grupo</span>
            </Link>
          </Button>
        </div>
      </PageHeading>
      <div className="group-meta -mt-5 mb-6">
        <span>
          <CalendarDays size={16} aria-hidden="true" />
          {dateRange(group.start_date, group.end_date)}
        </span>
        <span>
          <Users size={16} aria-hidden="true" />
          {group.members.length} integrantes
        </span>
        {group.role === "creator" && (
          <span className="badge">Eres el creador</span>
        )}
      </div>
      <GroupTabs />
      <div className="group-layout">
        <div className="stack">
          <section className="summary-card" aria-label="Resumen del grupo">
            <div>
              <p className="muted">
                {group.total_cents < 0 ? "Reembolsos netos" : "Gasto total"}
              </p>
              <p className="amount-total" data-testid="group-total">
                {money(Math.abs(group.total_cents))}
              </p>
              {myBalance && (
                <Link
                  className="personal-balance"
                  to={groupPath(groupId, "/settlement")}
                >
                  <span>
                    {myBalance.amount_cents > 0
                      ? `Te deben ${money(myBalance.amount_cents)}`
                      : myBalance.amount_cents < 0
                        ? `Debes ${money(-myBalance.amount_cents)}`
                        : group.movements.length === 0
                          ? "Tu saldo: 0,00 €"
                          : "Tu cuenta está saldada"}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
            <Button asChild>
              <Link to={groupPath(groupId, "/movements/new")}>
                <Plus size={18} aria-hidden="true" />
                Añadir movimiento
              </Link>
            </Button>
          </section>
          <section>
            <div className="section-heading">
              <h2>
                Movimientos{" "}
                <span className="muted">· {group.movements.length}</span>
              </h2>
              <Button
                variant="ghost"
                aria-label="Actualizar movimientos"
                className="icon-button"
                onClick={() =>
                  void queryClient.invalidateQueries({
                    queryKey: groupKey(groupId),
                  })
                }
              >
                <RefreshCw size={16} />
              </Button>
            </div>
            {group.movements.length === 0 ? (
              <div className="card empty-state">
                <div className="empty-icon">
                  <ReceiptText size={28} aria-hidden="true" />
                </div>
                <h3>El primer gasto inicia la historia</h3>
                <p>
                  ¿Un café, los billetes, la compra? Apúntalo y empezaremos a
                  repartir.
                </p>
              </div>
            ) : (
              <ul
                className="movement-list"
                aria-label="Historial de movimientos"
              >
                {group.movements.map((movement) => (
                  <li key={movement.id}>
                    <Link
                      className="movement-row"
                      to={groupPath(groupId, `/movements/${movement.id}`)}
                      aria-label={`Editar ${movement.concept || "Aportación"}`}
                      aria-describedby={`movement-context-${movement.id}`}
                    >
                      <Avatar alias={names[movement.payer_id]} />
                      <div className="movement-info">
                        <h3>{movement.concept || "Aportación"}</h3>
                        <p
                          className="movement-context"
                          id={`movement-context-${movement.id}`}
                        >
                          {movementContext(movement)}
                        </p>
                        <p>{calendarDate(movement.date)}</p>
                      </div>
                      <div className="movement-amount">
                        <span
                          className={`amount${movement.type === "refund" ? " positive" : ""}`}
                        >
                          {movement.type === "refund" ? "−" : ""}
                          {money(Math.abs(movement.amount_cents))}
                        </span>
                        <span
                          className={`badge ${movement.type === "refund" ? "badge-success" : "badge-neutral"}`}
                        >
                          {movement.type === "expense"
                            ? "Gasto"
                            : movement.type === "refund"
                              ? "Reembolso"
                              : "Aportación"}
                        </span>
                      </div>
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className="muted"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="card group-balances">
            <h2 className="text-base mb-4">Cómo van las cuentas</h2>
            <Balances group={group} />
            <Button asChild variant="outline" className="full-width mt-4">
              <Link to={groupPath(groupId, "/settlement")}>
                Ver liquidación
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </Button>
          </section>
          <div className="info-card info-inline">
            <CalendarDays size={18} aria-hidden="true" />
            <p>
              El grupo se eliminará tras 10 días sin nuevos movimientos después
              del viaje, y como máximo a los 30 días de su fin.
            </p>
          </div>
        </aside>
      </div>
      <div className="mobile-add">
        <Button asChild className="full-width">
          <Link to={groupPath(groupId, "/movements/new")}>
            <Plus size={18} aria-hidden="true" />
            Añadir movimiento
          </Link>
        </Button>
      </div>
    </>
  );
}
