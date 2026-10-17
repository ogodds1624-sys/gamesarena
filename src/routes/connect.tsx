import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SignalLoading } from "@/components/signal-loading";
import { getSportyLink, markAccountCompleted, savePlayerCountry, saveSportyLink } from "@/lib/admin-snapshot";
import { leaveUnlinked } from "@/lib/leave-unlinked";
import { sportyNumberMatches } from "@/lib/onboarding-gate";
import { clearPending, readPending } from "@/lib/pending-registration";
import { rememberReferral } from "@/lib/remember-ref";
import { openTask } from "@/lib/task-order";

export const Route = createFileRoute("/connect")({
  component: ConnectPage,
});

const STORAGE_KEY = "aviator-hack-sportybet";

function GhanaFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0" aria-hidden>
      <rect width="24" height="5.34" fill="#ce1126" />
      <rect y="5.33" width="24" height="5.34" fill="#fcd116" />
      <rect y="10.66" width="24" height="5.34" fill="#006b3f" />
      <polygon points="12,6.2 12.7,8.2 14.8,8.2 13.1,9.4 13.8,11.4 12,10.2 10.2,11.4 10.9,9.4 9.2,8.2 11.3,8.2" fill="#000" />
    </svg>
  );
}

function NigeriaFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0" aria-hidden>
      <rect width="8" height="16" fill="#008751" />
      <rect x="8" width="8" height="16" fill="#fff" />
      <rect x="16" width="8" height="16" fill="#008751" />
    </svg>
  );
}

function ConnectPage() {
  const navigate = useNavigate();
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState<"Ghana" | "Nigeria">("Ghana");
  const [ready, setReady] = useState(false);
  const nigeria = country === "Nigeria";

  useEffect(() => {
    let stop = false;
    void (async () => {
      const link = await getSportyLink();
      if (stop) return;
      if (!link.signedIn || !link.country || link.linked) {
        if (!link.signedIn) clearPending();
        void openTask(navigate, link);
        return;
      }
      setCountry(link.country);
      setReady(true);
    })();
    return () => {
      stop = true;
    };
  }, [navigate]);

  function leaveConnect() {
    void leaveUnlinked();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const digits = number.replace(/\D/g, "");
    if (!sportyNumberMatches(country, digits)) {
      setError(
        country === "Nigeria"
          ? "Enter a 10 or 11 digit SportyBet number."
          : "Enter a 9 or 10 digit SportyBet number.",
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await savePlayerCountry({ data: { country } });
      await saveSportyLink({ data: { number: digits } });
      await markAccountCompleted();
      const link = await getSportyLink();
      if (!link.linked) {
        setError("Could not confirm that SportyBet account.");
        return;
      }
      const pending = readPending();
      if (pending?.email) window.localStorage.setItem("aviator-hack-email", pending.email);
      window.localStorage.setItem("aviator-country", country);
      window.localStorage.setItem(STORAGE_KEY, digits);
      clearPending();
      try {
        await rememberReferral();
      } catch {
        // The account is already stored. A referral note must not undo that.
      }
      await openTask(navigate, link);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not save that account.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink">
        <SignalLoading />
      </main>
    );
  }

  return (
    <main className="home-theme relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 text-white">
      <section className="auth-card relative z-10 w-full max-w-md min-w-0 rounded-[28px] px-5 py-7 text-white">
        <button
          type="button"
          onClick={leaveConnect}
          className="auth-back-home mb-4"
        >
          <span className="auth-back-home-icon" aria-hidden="true">
            <ArrowLeft size={15} strokeWidth={2.5} />
          </span>
          <span>Back</span>
        </button>
        <h1 className="connect-heading mt-4 text-center text-[28px] leading-tight font-extrabold tracking-tight">
          Connect your SportyBet
        </h1>
        <p className="mt-3 text-center text-base leading-relaxed text-muted">
          Enter your SportyBet account number to link it to Games Hub.
        </p>
        <div className="my-8 flex justify-center">
          <img
            src="/media/sportybet-logo.jpg"
            alt="SportyBet"
            className="h-32 w-auto rounded-2xl object-contain"
          />
        </div>
        <form onSubmit={onSubmit}>
            <div className="mt-3 grid min-w-0 grid-cols-[6.25rem_minmax(0,1fr)] gap-2">
              <div className="connect-prefix flex h-14 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 text-sm font-bold">
                {nigeria ? <NigeriaFlag /> : <GhanaFlag />}
                {nigeria ? "+234" : "+233"}
              </div>
              <input
                id="sportybet"
                aria-label="SportyBet account number"
                inputMode="numeric"
                autoComplete="tel"
                placeholder={nigeria ? "8031234567" : "244123456"}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                className="connect-input h-14 min-w-0 rounded-2xl px-3 text-base text-white outline-none placeholder:text-white/40"
              />
            </div>
            {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="connect-submit mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold tracking-wide disabled:opacity-60"
            >
              {busy ? "Saving…" : "Connect account"}
              <ArrowRight className="size-5" aria-hidden />
            </button>
          </form>
      </section>
    </main>
  );
}
