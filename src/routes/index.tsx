import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowRight, Clock3, Plane, Radio } from "lucide-react";
import { AviatorBoard } from "@/components/aviator-board";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSportyLink } from "@/lib/admin-snapshot";
import { clearPending } from "@/lib/pending-registration";
import { openTask } from "@/lib/task-order";
import { useLiveStorefront } from "@/lib/storefront-live";
import { useBlocked } from "@/lib/blocked-users";
import { VirtualPlay } from "@/components/virtual-play";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => {
    const ref = typeof search.ref === "string" ? search.ref.trim() : "";
    return ref ? { ref } : {};
  },
  component: Home,
});

const CALLS = [
  { n: 4821, label: "Steady climb", x: "1.24x" },
  { n: 4820, label: "Watch the trend", x: "1.16x" },
  { n: 4819, label: "Early window", x: "1.38x" },
  { n: 4822, label: "Momentum building", x: "1.52x" },
  { n: 4823, label: "Steady climb", x: "1.72x" },
  { n: 4824, label: "Trend check", x: "1.91x" },
];

const HOME_TITLE = "GAMES HUB";

function Home() {
  const navigate = useNavigate();
  const { ref } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const store = useLiveStorefront();
  const signedIn = !isPending && Boolean(user) && !user?.isDevFallback;
  const blocked = useBlocked();
  const [tick, setTick] = useState(0);
  const [flightDisplay, setFlightDisplay] = useState({ amount: "1.00", isFlying: false });

  async function openAccount() {
    if (isPending || blocked) return;
    if (!signedIn) {
      await navigate({ to: "/register" });
      return;
    }
    await openTask(navigate, await getSportyLink());
  }

  useEffect(() => {
    clearPending();
  }, []);

  useEffect(() => {
    if (ref) window.localStorage.setItem("aviator-ref", ref.slice(0, 80));
  }, [ref]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 3500);
    return () => window.clearInterval(id);
  }, []);

  const rows = [0, 1, 2].map((offset) => CALLS[(tick + offset) % CALLS.length]);

  return (
    <div className="home-theme min-h-dvh text-white">
      <SiteHeader />
      {blocked ? (
        <p role="alert" className="bg-red px-4 py-3 text-center text-sm font-bold text-white">
          This account has been blocked. You can sign in with another account or sign out.
        </p>
      ) : null}
      <div className="hero-layout hero-glow">
        <div className="hero-copy">
        <div className="welcome-title-wrap">
          <h1
            className="casino-title welcome-title is-brand"
            aria-label={HOME_TITLE}
            aria-live="off"
          >
            <span>GAMES</span> <span className="casino-title-accent">HUB</span>
          </h1>
        </div>
        <div className="hero-intro">
          <p className="hero-intro-eyebrow">One hub. More ways to play.</p>
          <h2 className="hero-intro-title">
            Find your game.<br />
            <span>Feel the moment.</span>
          </h2>
          <p className="hero-intro-description">
            Explore Aviator multiplier trends and instant virtual games.
            Your next experience is just a tap away.
          </p>
          <div className="hero-intro-features" aria-label="Explore Games Hub">
            <span><Plane size={14} aria-hidden="true" /> Aviator</span>
            <span><Activity size={14} aria-hidden="true" /> Instant virtual</span>
          </div>
        </div>
        {store && store.rates.length > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {store.rates.map((rate) => `${rate.country} ${rate.unit}${rate.perGhs} per GHS`).join(" · ")}
          </p>
        ) : null}
        <div className="hero-actions">
          <button
            type="button"
            onClick={() => void openAccount()}
            className="home-cta-primary inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gold px-6 text-sm font-extrabold tracking-[0.12em] text-black sm:h-16 sm:text-base"
          >
            GET STARTED
            <ArrowRight className="size-5" aria-hidden />
          </button>
          <a
            href="#desk"
            className="home-cta-secondary inline-flex h-14 items-center justify-center gap-2.5 rounded-full border border-gold/50 px-6 text-sm font-extrabold tracking-[0.12em] text-white no-underline transition-colors hover:bg-gold/10 sm:h-16 sm:text-base"
          >
            <span className="live-dot size-2.5 rounded-full bg-gold" aria-hidden="true" />
            SEE LIVE HACKS
          </a>
        </div>
        </div>

      </div>

      <main id="desk" className="page-wrap">
        <div className="desk-layout">
        <article className="predictor-card overflow-hidden rounded-3xl">
          <div className="iphone-stage">
            <div className="iphone-device" role="img" aria-label="iPhone-style screen showing animated live Aviator odds">
              <span className="iphone-side-button iphone-side-button-action" aria-hidden="true" />
              <span className="iphone-side-button iphone-side-button-volume-up" aria-hidden="true" />
              <span className="iphone-side-button iphone-side-button-volume-down" aria-hidden="true" />
              <span className="iphone-side-button iphone-side-button-power" aria-hidden="true" />
              <div className="iphone-screen">
                <div className="iphone-statusbar" aria-hidden="true">
                  <span>9:41</span>
                  <span className="iphone-dynamic-island" />
                  <span className="iphone-status-icons">
                    <span className="iphone-signal"><i /><i /><i /><i /></span>
                    <span className="iphone-wifi" />
                    <span className="iphone-battery"><i /></span>
                  </span>
                </div>
                <div className="iphone-appbar">
                  <span className="iphone-app-title">GAMES <b>HUB</b></span>
                  <span className="iphone-live-label"><i /> LIVE</span>
                </div>
                <div className="iphone-chart">
                  <AviatorBoard onFlightUpdate={setFlightDisplay} />
                  <div className="iphone-player-count" aria-hidden="true">
                    <span className="iphone-player-coins"><i>G</i><i>₵</i></span>
                    <span>1,466</span>
                  </div>
                </div>
                <div className="iphone-bet-panel">
                  <div className="iphone-bet-tabs">
                    <span>Bet</span>
                    <span>Auto</span>
                  </div>
                  <div className="iphone-bet-row">
                    <div className="iphone-stake-controls">
                      <div className="iphone-stake-stepper">
                        <span>−</span>
                        <strong>1.00</strong>
                        <span>+</span>
                      </div>
                      <div className="iphone-stake-presets">
                        <span>1</span><span>5</span><span>10</span><span>50</span>
                      </div>
                    </div>
                    <div className="iphone-bet-button">
                      <span>{flightDisplay.isFlying ? "Cash Out" : "Bet"}</span>
                      <strong>{flightDisplay.amount} <small>GHS</small></strong>
                    </div>
                  </div>
                </div>
                <div className="iphone-home-indicator" aria-hidden="true"><i /></div>
              </div>
            </div>
          </div>
          <div className="predictor-content">
            <div className="predictor-heading-row">
              <div>
                <p className="predictor-kicker">Your signal desk</p>
                <h3 className="predictor-title">
                  Aviator <span>Predictor</span>
                </h3>
              </div>
              <span className="predictor-plane-mark" aria-hidden="true">
                <Plane className="size-5" />
              </span>
            </div>
            <p className="predictor-description">
              Explore live predictions, track the suggested multiplier, and choose your cash-out moment.
            </p>
            <div className="predictor-highlights" aria-label="Predictor features">
              <span><Radio className="size-3.5" aria-hidden /> Signal updates</span>
              <span><Clock3 className="size-3.5" aria-hidden /> Timed sessions</span>
            </div>
            <button
              type="button"
              onClick={() => void openAccount()}
              className="predictor-cta buy-pulse mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-base font-extrabold tracking-wide text-black"
            >
              <span>Open Predictor</span>
              <ArrowRight className="size-4" aria-hidden />
            </button>
            <p className="predictor-footnote">Choose a session to access the signal desk.</p>
          </div>
        </article>

        <VirtualPlay />

        <section className="relative mt-6 overflow-hidden rounded-[1.75rem] border border-gold/20 bg-[radial-gradient(ellipse_at_top_right,_rgba(240,193,77,0.12),_transparent_42%),linear-gradient(145deg,_#171b18,_#0c0f0d_62%,_#080909)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.38)] sm:p-5">
          <div className="relative mb-5 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/10 text-gold">
                <Activity className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-[10px] font-extrabold tracking-[0.22em] text-gold uppercase">Signal monitor</p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-white">Prediction feed</h2>
                <p className="mt-1 text-xs text-white/50">Suggested windows · 1.10x–2.00x</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-extrabold tracking-wider text-emerald-300 uppercase">
              <span className="feed-live-dot relative size-2 rounded-full bg-emerald-300" aria-hidden="true" />
              Live
            </span>
          </div>
          <ul className="relative space-y-2">
            {rows.map((row, index) => (
              <li
                key={row.n}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-gradient-to-r from-white/[0.045] to-white/[0.015] px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-gold/25 hover:from-gold/[0.08] hover:to-white/[0.025] sm:px-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-black/30 text-[10px] font-black tabular-nums text-white/45 transition-colors group-hover:border-gold/25 group-hover:text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-extrabold text-white">
                    <span className="truncate">Round {row.n}</span>
                    <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2 py-0.5 text-[9px] font-bold tracking-wide text-emerald-200/80">
                      TRACKING
                    </span>
                  </span>
                  <span className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-white/50">
                    <Plane className="size-3 shrink-0 text-gold/80" aria-hidden />
                    {row.label}
                  </span>
                </span>
                <span className="shrink-0 rounded-xl border border-gold/20 bg-gold/[0.08] px-3 py-2 text-right">
                  <span className="block text-[8px] font-extrabold tracking-[0.16em] text-gold/60 uppercase">Window</span>
                  <span className="mt-0.5 block text-lg font-black tabular-nums leading-none text-gold">{row.x}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
