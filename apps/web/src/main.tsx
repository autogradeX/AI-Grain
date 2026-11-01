import {
  hydrate,
  type DehydratedState,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApiError } from "./api/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LangProvider } from "./i18n";
import { setupPwa } from "./pwa/pwa";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-devanagari";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

// Data the server already fetched for a server-rendered page.
const ssrState = document.getElementById("ssr-state");
if (ssrState?.textContent) {
  try {
    hydrate(queryClient, JSON.parse(ssrState.textContent) as DehydratedState);
  } catch {
    // The page simply fetches its data again.
  }
}

setupPwa();

// On a server-rendered home page, load the landing code first, so React
// takes over the page without flashing its loading screen.
const ready =
  ssrState && location.pathname === "/"
    ? import("./pages/public/home/HomePage").catch(() => undefined)
    : Promise.resolve();

void ready.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LangProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </LangProvider>
    </StrictMode>,
  ),
);
