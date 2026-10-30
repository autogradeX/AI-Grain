import { useSyncExternalStore } from "react";

/** Chrome, Edge and Samsung Internet fire this when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  /** Running as an installed app (home screen or desktop window). */
  standalone: boolean;
  /** The browser offers its own install prompt. */
  canPrompt: boolean;
  /** iPhone or iPad Safari: installing is "Share → Add to Home Screen". */
  ios: boolean;
  /** A new version is downloaded and waits for a reload. */
  updateReady: boolean;
  online: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
/** A request to the server just failed for lack of network. */
let networkDown = false;
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

const standaloneQuery = () =>
  typeof matchMedia === "function"
    ? matchMedia("(display-mode: standalone)")
    : null;

function read(): PwaState {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ua = navigator.userAgent;
  return {
    standalone: standaloneQuery()?.matches === true || nav.standalone === true,
    canPrompt: deferredPrompt !== null,
    ios:
      /iPhone|iPad|iPod/.test(ua) ||
      (ua.includes("Macintosh") && navigator.maxTouchPoints > 1),
    updateReady: waiting !== null,
    // navigator.onLine can say "online" with no usable connection (captive
    // Wi-Fi, a dead mobile signal); a failed request says otherwise.
    online: navigator.onLine && !networkDown,
  };
}

// Read on first use, not on import: the API client imports this module in
// tests that run without a browser.
let state: PwaState | null = null;
const current = () => (state ??= read());

function emit() {
  if (!state) return;
  const next = read();
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    state = next;
    for (const l of listeners) l();
  }
}

export function usePwa(): PwaState {
  return useSyncExternalStore((onChange) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, current);
}

/** Called by the API client: whether the last request reached the server. */
export function noteNetwork(reached: boolean) {
  if (networkDown === !reached) return;
  networkDown = !reached;
  emit();
}

/** Shows the browser's install prompt; true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  emit();
  return outcome === "accepted";
}

/** Switches to the downloaded version; the page reloads when it takes over. */
export function applyUpdate() {
  if (!waiting) {
    location.reload();
    return;
  }
  waiting.postMessage("SKIP_WAITING");
}

function track(registration: ServiceWorkerRegistration) {
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      // "installed" with an active controller means an update, not a first install.
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        waiting = worker;
        emit();
      }
    });
  };
  if (registration.waiting && navigator.serviceWorker.controller) {
    waiting = registration.waiting;
    emit();
  }
  watch(registration.installing);
  registration.addEventListener("updatefound", () =>
    watch(registration.installing),
  );
}

/** Registers the service worker (production builds only) and listens for install, update and connectivity. */
export function setupPwa() {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
  addEventListener("online", () => {
    networkDown = false;
    emit();
  });
  addEventListener("offline", emit);
  standaloneQuery()?.addEventListener("change", emit);

  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (waiting && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        track(registration);
        // Installed apps can stay open for days: look for updates hourly.
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        // No offline support; the app works as a normal website.
      });
  });
}

const VIEW_KEY = "ai-grain.view";
export type PhoneView = "app" | "classic";

/** Phone layout: the app view with bottom tabs (default), or the menu only. */
export function readPhoneView(): PhoneView {
  try {
    return localStorage.getItem(VIEW_KEY) === "classic" ? "classic" : "app";
  } catch {
    return "app";
  }
}

const viewListeners = new Set<() => void>();
let view: PhoneView = readPhoneView();

export function usePhoneView(): [PhoneView, (v: PhoneView) => void] {
  const current = useSyncExternalStore(
    (onChange) => {
      viewListeners.add(onChange);
      return () => viewListeners.delete(onChange);
    },
    () => view,
  );
  return [
    current,
    (next) => {
      view = next;
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        // Not remembered; still switches now.
      }
      for (const l of viewListeners) l();
    },
  ];
}
