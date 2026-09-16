import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { CreateGroup } from "../../src/features/create/CreateGroup";
import { ApiError, api } from "../../src/lib/api";

function form() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CreateGroup />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Integrante 1"), {
    target: { value: "Ana" },
  });
  fireEvent.change(screen.getByLabelText("Integrante 2"), {
    target: { value: "Bruno" },
  });
  return screen.getByLabelText("Nombre del grupo");
}

it("focuses and describes an oversized name without discarding the draft or sending it", () => {
  const create = vi.spyOn(api, "createGroup");
  const name = form();
  fireEvent.change(name, { target: { value: "Escapada a Lisboa 2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Crear grupo" }));
  expect(create).not.toHaveBeenCalled();
  expect(name).toHaveFocus();
  expect(name).toHaveValue("Escapada a Lisboa 2026");
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(name).toHaveAccessibleDescription(
    "Máximo 20 caracteres. Escribe un nombre de entre 1 y 20 caracteres.",
  );
});

it("accepts twenty Unicode code points, matching the backend rather than UTF-16 units", async () => {
  const create = vi
    .spyOn(api, "createGroup")
    .mockRejectedValue(new ApiError(0, "network_error", "Sin conexión"));
  const name = form();
  fireEvent.change(name, { target: { value: "🌴".repeat(20) } });
  fireEvent.click(screen.getByRole("button", { name: "Crear grupo" }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(name).not.toHaveAttribute("aria-invalid");
  expect(name).toHaveValue("🌴".repeat(20));
});

it("focuses the duplicate member and preserves the other names", () => {
  const name = form();
  fireEvent.change(name, { target: { value: "Lisboa" } });
  const second = screen.getByLabelText("Integrante 2");
  fireEvent.change(second, { target: { value: " ana " } });
  fireEvent.click(screen.getByRole("button", { name: "Crear grupo" }));
  expect(second).toHaveFocus();
  expect(second).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Integrante 1")).toHaveValue("Ana");
});
