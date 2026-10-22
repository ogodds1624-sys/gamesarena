import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { enforceCompletedAccount } from "@/lib/completed-account";
import { useBlocked, useBlockWatcher } from "@/lib/blocked-users";
import { PRESS_HOLD_MS } from "@/lib/press-motion";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PendingPaymentWatcher } from "@/components/pending-payment-watcher";
import { SupportChat } from "@/components/support-chat";
import { AppRefresh } from "@/components/app-refresh";
import appCss from "../styles.css?url";

const APP_NAME = "GAMES HUB";

const PRESSABLE =
  "button, a, input, textarea, select, option, label, summary, [role='button'], [role='link']";

let clearingIncomplete = false;

function CompletedSession() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? "";
  const devFallback = user?.isDevFallback === true;

  useEffect(() => {
    if (isPending || devFallback || clearingIncomplete) return;
    let stop = false;
    void enforceCompletedAccount()
      .then((result) => {
        const path = window.location.pathname;
        if (path === "/register" || path === "/country" || path === "/connect") return;
        if (stop || result.completed || !result.stale || clearingIncomplete) return;
        clearingIncomplete = true;
        void signOut("/").catch(() => {
          window.location.href = "/";
        });
      })
      .catch(() => {
        // A failed check must not send a finished account away.
      });
    return () => {
      stop = true;
    };
  }, [isPending, userId, devFallback]);

  return null;
}

function BlockWatcher() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  useBlockWatcher(path);
  const blocked = useBlocked();

  useEffect(() => {
    if (blocked && path !== "/" && path !== "/login" && path !== "/admin")
      void navigate({ to: "/", replace: true });
  }, [blocked, path, navigate]);

  return null;
}

function CaptureReferral() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const signedIn = Boolean(user && !user.isDevFallback);
  const href = useRouterState({ select: (state) => state.location.href });

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim() ?? "";
    if (ref) window.localStorage.setItem("aviator-ref", ref.slice(0, 80));
    if (!ref || isPending) return;
    if (signedIn) return;
    if (window.location.pathname === "/") return;
    void navigate({ to: "/", replace: true });
  }, [href, isPending, signedIn, navigate]);

  return null;
}

function TapBounce() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const quiet = path !== "/";

  useEffect(() => {
    const stamp = "aviator-cleared-2026-10-01";
    if (window.localStorage.getItem(stamp) === "1") return;
    window.localStorage.setItem(stamp, "1");
    for (const key of [
      "aviator-hack-email",
      "aviator-country",
      "aviator-hack-sportybet",
      "aviator-session",
      "aviator-tx-notice",
    ]) {
      window.localStorage.removeItem(key);
    }
    window.sessionStorage.removeItem("aviator-partner");
    window.sessionStorage.removeItem("aviator-admin-open");
    window.sessionStorage.removeItem("grok-auth.bearer-token");
    window.sessionStorage.removeItem("aviator-email-taken");
  }, []);

  useEffect(() => {
    if (quiet) return;
    let current: Element | null = null;

    const pick = (raw: Element) => {
      const control = raw.closest(PRESSABLE);
      if (
        !control ||
        control === document.body ||
        control === document.documentElement ||
        control.hasAttribute("data-no-cursor-lift")
      ) {
        return null;
      }
      return control;
    };

    const lift = (event: PointerEvent) => {
      const raw = event.target;
      if (!(raw instanceof Element)) return;
      const next = pick(raw);
      if (next === current) return;
      current?.classList.remove("cursor-lift");
      current = next;
      current?.classList.add("cursor-lift");
    };

    const clear = () => {
      current?.classList.remove("cursor-lift");
      current = null;
    };

    document.addEventListener("pointerover", lift);
    document.addEventListener("pointerleave", clear);
    return () => {
      document.removeEventListener("pointerover", lift);
      document.removeEventListener("pointerleave", clear);
      clear();
    };
  }, [quiet]);

  useEffect(() => {
    let held: Element | null = null;
    let timer = 0;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!document.body.classList.contains("site-front")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const raw = event.target;
      if (!(raw instanceof Element)) return;
      const control = raw.closest("button, a, [role='button']");
      if (!control || control === document.body) return;
      if (control instanceof HTMLButtonElement && control.disabled) return;
      held?.classList.remove("press-hold");
      held = control;
      control.classList.add("press-hold");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        held?.classList.remove("press-hold");
        held = null;
      }, PRESS_HOLD_MS);
    };
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.clearTimeout(timer);
      held?.classList.remove("press-hold");
    };
  }, []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "description", content: "Create a Games Hub account and open the live desk." },
      { name: "theme-color", content: "#e50914" },
      { name: "application-name", content: "Games Hub" },
      { name: "apple-mobile-web-app-title", content: "Games Hub" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/gameshub-logo.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "preload",
        href: "/fonts/inter-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/inter-latin-italic.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  component: function RootDocument() {
    const path = useRouterState({ select: (state) => state.location.pathname });
    const front = path !== "/admin" && path !== "/adminpage" && path !== "/partner";
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <HeadContent />
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{var c=navigator.connection;if(c&&(c.saveData||c.effectiveType==='slow-2g'||c.effectiveType==='2g'||c.effectiveType==='3g'))document.documentElement.classList.add('lite')}catch(e){}",
            }}
          />
        </head>
        <body className={front ? "site-front" : undefined}>
          <PreviewHostBridge />
          <AuthProvider>
            <CaptureReferral />
            <CompletedSession />
            <BlockWatcher />
            <PendingPaymentWatcher />
            <TapBounce />
            <Outlet />
            <SupportChat />
            <AppRefresh />
          </AuthProvider>
          <Scripts />
        </body>
      </html>
    );
  },
});
