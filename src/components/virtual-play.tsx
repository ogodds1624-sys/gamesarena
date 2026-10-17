import { useEffect, useRef, useState } from "react";
import { ArrowRight, Dices } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const SYMBOLS = ["7", "★", "◆", "✦", "●"];

export function VirtualPlay() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [reels, setReels] = useState(["7", "★", "◆"]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function play() {
    if (isPending || isSpinning) return;
    if (!user || user.isDevFallback) {
      await navigate({ to: "/login" });
      return;
    }

    setReels(Array.from({ length: 3 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!));
    setSpinId((id) => id + 1);
    setIsSpinning(true);
    setHasPlayed(false);
    timer.current = window.setTimeout(() => {
      setIsSpinning(false);
      setHasPlayed(true);
      timer.current = null;
    }, 900);
  }

  return (
    <section className="virtual-play-card" aria-labelledby="virtual-play-title">
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
        </div>
      </div>
      <div className="virtual-play-controls">
        <div
          className="virtual-reels"
          aria-label={isSpinning ? "Reels spinning" : `Result: ${reels.join(" ")}`}
        >
          {reels.map((symbol, index) => (
            <span
              key={`${spinId}-${index}`}
              className={`virtual-reel${isSpinning ? " is-spinning" : ""}`}
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
        disabled={isPending || isSpinning}
      >
        <span>{isSpinning ? "SPINNING..." : "PLAY NOW"}</span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
      <p className="virtual-play-status" role="status" aria-live="polite">
        {isSpinning
          ? "Your virtual reels are spinning."
          : hasPlayed
            ? "Spin complete. Play again anytime."
            : null}
      </p>
    </section>
  );
}
