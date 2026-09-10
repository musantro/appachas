import { MutationObserver, onlineManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { createQueryClient } from "../../src/lib/query";

it("fails a write immediately offline and never replays it after reconnecting", async () => {
  // Arrange / Given
  const client = createQueryClient();
  const write = vi.fn().mockRejectedValue(new Error("Sin conexión"));
  const observer = new MutationObserver(client, { mutationFn: write });
  const wasOnline = onlineManager.isOnline();
  onlineManager.setOnline(false);
  try {
    // Act / When
    const result = observer.mutate(undefined);
    // Assert / Then
    await expect(result).rejects.toThrow("Sin conexión");
    expect(observer.getCurrentResult().isPaused).toBe(false);
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    expect(write).toHaveBeenCalledTimes(1);
  } finally {
    onlineManager.setOnline(wasOnline);
    client.clear();
  }
});
