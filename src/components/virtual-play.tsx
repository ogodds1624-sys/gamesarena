import { useEffect, useState } from "react";
import { ArrowRight, Dices } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSportyLink, getVirtualCreditBalance } from "@/lib/admin-snapshot";
import { openTask } from "@/lib/task-order";
import { useBlocked } from "@/lib/blocked-users";

export function VirtualPlay() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const isDevFallback = user?.isDevFallback === true;
  const blocked = useBlocked();
  const reels = ["7", "★", "◆"];
  const [isStarting, setIsStarting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!userId || isDevFallback) {
      setBalance(null);
      return;
    }
    let stop = false;
    void getVirtualCreditBalance()
      .then(({ balance: nextBalance }) => {
        if (!stop) setBalance(nextBalance);
      })
      .catch((err: unknown) => {
        if (!stop)
          setError(
            err instanceof Error ? err.message : "Could not load your Instant Virtual credits.",
          );
      });
    return () => {
      stop = true;
    };
  }, [isPending, userId, isDevFallback]);

  async function play() {
    if (isPending || isStarting || blocked) return;
    if (!user || user.isDevFallback) {
      await navigate({ to: "/register" });
      return;
    }

    setError(null);
    setIsStarting(true);
    try {
      const link = await getSportyLink();
      if (!link.signedIn) {
        await navigate({ to: "/register" });
        return;
      }
      if (!link.country || !link.linked || !link.activated) {
        await openTask(navigate, link, "virtual");
        return;
      }

      const result = await getVirtualCreditBalance();
      setBalance(result.balance);
      if (result.balance < 1) {
        await navigate({ to: "/virtual-packages" });
        return;
      }
      await navigate({ to: "/virtual-scan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Instant Virtual. Try again.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section
      id="instant-virtual"
      className="virtual-play-card"
      aria-labelledby="virtual-play-title"
    >
      <div className="virtual-play-preview">
        <div
          className="iphone-device virtual-play-phone"
          role="img"
          aria-label="Instant Football preview in an iPhone 17 Pro Max-style frame"
        >
          <span className="iphone-side-button iphone-side-button-action" aria-hidden="true" />
          <span className="iphone-side-button iphone-side-button-volume-up" aria-hidden="true" />
          <span className="iphone-side-button iphone-side-button-volume-down" aria-hidden="true" />
          <span className="iphone-side-button iphone-side-button-power" aria-hidden="true" />
          <div className="virtual-play-phone-screen">
            <img
              src="/media/instant-virtual-football.png?v=2"
              alt=""
              className="virtual-play-image"
              width={589}
              height={1280}
              loading="lazy"
              decoding="async"
            />
            <span className="iphone-dynamic-island" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="virtual-play-copy">
        <span className="virtual-play-icon" aria-hidden="true">
          <Dices className="size-5" />
        </span>
        <div>
          <h2 id="virtual-play-title" className="virtual-play-kicker">
            Instant virtual play
          </h2>
          <p className="mt-1 text-sm text-white/65" aria-live="polite">
            {balance == null
              ? "Sign in to view your credits"
              : `${balance} ${balance === 1 ? "credit" : "credits"} available`}
          </p>
        </div>
      </div>
      <div className="virtual-play-controls">
        <div className="virtual-reels" aria-label="Instant Virtual preview">
          {reels.map((symbol, index) => (
            <span
              key={index}
              className="virtual-reel"
              style={{ animationDelay: `${index * 90}ms` }}
              aria-hidden="true"
            >
              {symbol}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="virtual-play-button predictor-cta buy-pulse flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-base font-extrabold tracking-wide text-black"
        onClick={play}
        disabled={isPending || isStarting || blocked}
      >
        <span>{isStarting ? "CHECKING..." : "PLAY NOW"}</span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
      <p className="virtual-play-status" role="status" aria-live="polite">
        Upload a SportyBet screenshot to scan visible match details.
      </p>
      {error ? (
        <p className="mt-3 text-center text-sm text-red" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
