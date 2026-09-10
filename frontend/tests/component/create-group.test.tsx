import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CreateGroup } from "../../src/features/create/CreateGroup";
import { ApiError, api } from "../../src/lib/api";

function renderCreation() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <MemoryRouter>
        <CreateGroup />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("group creation", () => {
  it("rejects duplicate aliases ignoring case and surrounding spaces before submitting", async () => {
    // Arrange / Given
    const user = userEvent.setup();
    const create = vi.spyOn(api, "createGroup");
    renderCreation();
    await user.type(screen.getByLabelText("Nombre del grupo"), "Viaje");
    await user.type(screen.getByLabelText("Integrante 1"), "Ana");
    await user.type(screen.getByLabelText("Integrante 2"), " ANA ");
    // Act / When
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    // Assert / Then
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Los nombres de los integrantes deben ser diferentes.",
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("keeps the form and re-enables saving after a network failure", async () => {
    // Arrange / Given
    const user = userEvent.setup();
    vi.spyOn(api, "createGroup").mockRejectedValue(
      new ApiError(
        0,
        "network_error",
        "Comprueba tu conexión y vuelve a intentarlo.",
      ),
    );
    renderCreation();
    await user.type(screen.getByLabelText("Nombre del grupo"), "Viaje a Cádiz");
    await user.type(screen.getByLabelText("Integrante 1"), "Ana");
    await user.type(screen.getByLabelText("Integrante 2"), "Bruno");
    // Act / When
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    // Assert / Then
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Comprueba tu conexión",
      ),
    );
    expect(screen.getByLabelText("Nombre del grupo")).toHaveValue(
      "Viaje a Cádiz",
    );
    expect(screen.getByRole("button", { name: "Crear grupo" })).toBeEnabled();
  });
});
