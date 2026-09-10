import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        staleTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      // Attempt once immediately, including offline, so writes cannot be queued
      // and replayed later when the device reconnects.
      mutations: { networkMode: "always", retry: false },
    },
  });
}
