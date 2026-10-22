import { useEffect, useState } from "react";
import { ArrowRight, ScanLine, ImagePlus, Target } from "lucide-react";
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
      <div className="home-scanner-showcase" aria-label="Screenshot scanner demonstration">
        <div className="home-scanner-heading">
          <span>
            <ScanLine size={18} aria-hidden /> GAMES HUB SCANNER
          </span>
          <span className="home-scanner-demo">DEMO</span>
        </div>
        <div className="home-scanner-upload">
          <span className="home-scanner-upload-icon">
            <ImagePlus size={30} aria-hidden />
          </span>
          <strong>Your screenshot. Two match picks.</strong>
          <p>Upload Instant Football matches to get started.</p>
          <div className="home-scanner-file">
            <ScanLine size={18} aria-hidden />
            <span>instant-football.png</span>
            <span>PNG</span>
          </div>
        </div>
        <div className="home-scanner-connector" aria-hidden>
          <span />
          <ArrowRight size={18} />
          <span />
        </div>
        <div className="home-scanner-picks">
          {[
            { home: "MUN", away: "NEW", pick: "Home (1)", odds: "1.86" },
            { home: "CRY", away: "NFO", pick: "Away (2)", odds: "2.43" },
          ].map((match, index) => (
            <div key={match.home} className="home-scanner-sample">
              <p>
                <Target size={14} aria-hidden /> SAMPLE PICK {index + 1}
              </p>
              <div className="home-scanner-match">
                <strong>{match.home}</strong>
                <span>VS</span>
                <strong>{match.away}</strong>
              </div>
              <div className="home-scanner-outcome">
                <strong>{match.pick}</strong>
                <span>{match.odds}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="home-scanner-caption">
          Illustration only. Your results use your uploaded screenshot.
        </p>
      </div>
      <div className="virtual-play-copy">
        <span className="virtual-play-icon" aria-hidden="true">
          <ScanLine className="size-5" />
        </span>
        <div>
          <h2 id="virtual-play-title" className="virtual-play-kicker">
            Instant Football scanner
          </h2>
          <p className="mt-1 text-sm text-white/65" aria-live="polite">
            {balance == null
              ? "Sign in to view your credits"
              : `${balance} ${balance === 1 ? "credit" : "credits"} available`}
          </p>
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
