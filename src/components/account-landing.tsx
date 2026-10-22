import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { SignalLoading } from "@/components/signal-loading";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSportyLink } from "@/lib/admin-snapshot";
import { clearPending, savePending } from "@/lib/pending-registration";
import { peekRegistrationEmail } from "@/lib/registration-email";
import { rememberReferral } from "@/lib/remember-ref";
import { openTask } from "@/lib/task-order";

type Mode = "register" | "login";

const REMEMBERED_EMAIL = "aviator-hack-email";

export function AccountLanding({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? "";
  const devFallback = user?.isDevFallback === true;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const holdTask1 = useRef(false);
  const [stayOnRegister, setStayOnRegister] = useState(false);
  const register = mode === "register";

  async function readLink() {
    try {
      return await getSportyLink();
    } catch {
      return null;
    }
  }

  async function continueAfterAccount() {
    if (register) {
      await navigate({ to: "/" });
      return;
    }
    let link = await readLink();
    for (let attempt = 0; attempt < 15 && !link?.signedIn; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      link = await readLink();
    }
    if (!link?.signedIn) {
      window.sessionStorage.removeItem("aviator-register-connect");
      await navigate({ to: "/" });
      return;
    }
    await openTask(navigate, link);
  }

  useEffect(() => {
    if (window.sessionStorage.getItem("aviator-stay-register") === "1") {
      window.sessionStorage.removeItem("aviator-stay-register");
      setStayOnRegister(true);
      return;
    }
    if (holdTask1.current || stayOnRegister) return;
    if (!isPending && userId && !devFallback) {
      void continueAfterAccount();
    }
  }, [isPending, userId, devFallback, navigate, stayOnRegister]);

  useEffect(() => {
    if (!holdTask1.current) clearPending();
    const saved = window.localStorage.getItem(REMEMBERED_EMAIL);
    if (saved && !register) setEmail(saved);
    if (!register && window.sessionStorage.getItem("aviator-email-taken") === "1") {
      setTaken(true);
      window.sessionStorage.removeItem("aviator-email-taken");
    }
    const ref = new URLSearchParams(window.location.search).get("ref") || window.localStorage.getItem("aviator-ref");
    if (ref) window.localStorage.setItem("aviator-ref", ref);
  }, [register]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!authEnabled) {
      setError("Accounts are not available right now.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    const trimmedName = name.trim();
    const trimmed = email.trim().toLowerCase();
    if (register && trimmedName.length < 2) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    if (register) {
      holdTask1.current = true;
      let lastError = "Could not save that account.";
      try {
        try {
          const existing = await peekRegistrationEmail({ data: { email: trimmed } });
          if (existing.taken) {
            const link = await getSportyLink();
            if (link.signedIn) {
              await continueAfterAccount();
              return;
            }
            holdTask1.current = false;
            window.localStorage.setItem(REMEMBERED_EMAIL, trimmed);
            window.sessionStorage.setItem("aviator-email-taken", "1");
            await navigate({ to: "/login" });
            return;
          }
        } catch {
          // A lookup failure still tries to create the session below.
        }
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await authClient.signUp.email({
              name: trimmedName,
              email: trimmed,
              password,
            });
            const created = !result.error || Boolean((result as unknown as { data?: { user?: unknown } }).data?.user);
            if (created) {
              window.localStorage.setItem(REMEMBERED_EMAIL, trimmed);
              savePending({
                name: trimmedName,
                email: trimmed,
                password,
                country: null,
                completionStatus: false,
              });
              let link = await readLink();
              for (let check = 0; check < 15 && !link?.signedIn; check += 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                link = await readLink();
              }
              if (!link?.signedIn) {
                holdTask1.current = false;
                setError("Registration is saved. Tap Create account again once the session connects.");
                return;
              }
              await navigate({ to: "/" });
              return;
            }
            const failure = result.error as { message?: string; code?: string; status?: number; statusText?: string };
            const message = failure.message?.trim() || "";
            const code = failure.code ?? "";
            if (/exist|already|registered|duplicate/i.test(`${message} ${code}`)) {
              const link = await getSportyLink().catch(() => null);
              if (link?.signedIn) {
                await continueAfterAccount();
                return;
              }
              holdTask1.current = false;
              window.localStorage.setItem(REMEMBERED_EMAIL, trimmed);
              window.sessionStorage.setItem("aviator-email-taken", "1");
              await navigate({ to: "/login" });
              return;
            }
            lastError = message || failure.statusText?.trim() || "Could not save that account.";
            const status = failure.status ?? 0;
            if (message && status < 500) {
              holdTask1.current = false;
              setError(lastError);
              return;
            }
          } catch (err) {
            lastError = err instanceof Error && err.message ? err.message : "Could not save that account.";
          }
        }
        holdTask1.current = false;
        setError(lastError);
      } finally {
        setBusy(false);
      }
      return;
    }
    let lastError = "Could not save that account.";
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await authClient.signIn.email({
            email: trimmed,
            password,
            rememberMe: true,
          });
          if (!result.error) {
            window.localStorage.setItem(REMEMBERED_EMAIL, trimmed);
            try {
              await rememberReferral();
            } catch {
              // The account is already stored. A referral note must not undo that.
            }
            await continueAfterAccount();
            return;
          }
          const failure = result.error as { message?: string; code?: string; status?: number; statusText?: string };
          const message = failure.message?.trim() || "";
          lastError = message || failure.statusText?.trim() || "Could not save that account.";
          const status = failure.status ?? 0;
          if (message && status < 500) {
            setError(lastError);
            return;
          }
        } catch (err) {
          lastError = err instanceof Error && err.message ? err.message : "Could not save that account.";
        }
      }
      setError(lastError);
    } finally {
      setBusy(false);
    }
  }

  if (isPending || (user && !user.isDevFallback && !stayOnRegister)) {
    return (
      <main className="auth-page flex min-h-dvh items-center justify-center">
        <SignalLoading />
      </main>
    );
  }

  return (
    <main className="auth-page flex min-h-dvh items-center justify-center px-4 py-8">
      <section className="auth-card w-full max-w-md rounded-3xl px-5 py-5 text-white">
        <Link
          to="/"
          className="auth-back-home mb-4"
        >
          <span className="auth-back-home-icon" aria-hidden="true">
            <ArrowLeft size={15} strokeWidth={2.5} />
          </span>
          <span>Back home</span>
        </Link>
        <div className="auth-brand mt-3 mb-5 text-center">
          <span className="text-xl font-extrabold tracking-tight">GAMES HUB</span>
        </div>
        <h1 className={`auth-heading text-center${register ? " auth-heading-register" : ""}`}>
          {register ? "Create your account" : "Welcome back"}
        </h1>
        <p className="auth-intro mt-4 mb-5 text-center">
          {register
            ? "Register once. This device remembers the login so you can come back anytime."
            : "Use the email and password you registered with. This device keeps you signed in."}
        </p>
        <div className="auth-mode-switch mb-5 grid grid-cols-2 gap-2 text-center text-sm font-extrabold" aria-label="Choose account action">
          <Link
            to="/login"
            aria-current={!register ? "page" : undefined}
            className={"auth-mode-link " + (!register ? "is-active" : "")}
          >
            Log in
          </Link>
          <Link
            to="/register"
            aria-current={register ? "page" : undefined}
            className={"auth-mode-link " + (register ? "is-active" : "")}
          >
            Create account
          </Link>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          {register ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold tracking-wide">FULL NAME</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
                className="h-12 w-full rounded-xl border border-line bg-ink px-3 text-base text-white outline-none placeholder:text-white/40 focus:border-red"
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide">EMAIL ADDRESS</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="h-12 w-full rounded-xl border border-line bg-ink px-3 text-base text-white outline-none placeholder:text-white/40 focus:border-red"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide">PASSWORD</span>
            <span className="relative block">
              <input
                required
                minLength={8}
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="At least 8 characters"
                className="h-12 w-full rounded-xl border border-line bg-ink px-3 pr-12 text-base text-white outline-none placeholder:text-white/40 focus:border-red"
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center text-white"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </span>
          </label>
          {taken ? (
            <p className="text-sm font-medium text-gold" role="status">
              This email is already registered. Log in with it.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-medium text-red" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="auth-submit mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-extrabold disabled:opacity-60"
          >
            {busy ? "Saving…" : register ? "Create account" : "Log in"}
            {!busy ? <ArrowRight className="size-4" aria-hidden /> : null}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-white">
          {register ? (
            <>
              Already registered?{" "}
              <Link to="/login" className="font-extrabold text-red no-underline">
                Log in
              </Link>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <Link to="/register" className="font-extrabold text-red no-underline">
                Register
              </Link>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
