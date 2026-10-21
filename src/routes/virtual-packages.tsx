import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Dices,
  Layers3,
  LoaderCircle,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { SignalLoading } from "@/components/signal-loading";
import { getSportyLink, getVirtualCreditBalance } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { openTask } from "@/lib/task-order";
import {
  VIRTUAL_CREDIT_OFFERS,
  virtualCreditOffer,
  type VirtualCountry,
} from "@/lib/virtual-credits";
import { useBlocked } from "@/lib/blocked-users";

export const Route = createFileRoute("/virtual-packages")({
  component: VirtualPackagesPage,
});

function VirtualPackagesPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const blocked = useBlocked();
  const [ready, setReady] = useState(false);
  const [country, setCountry] = useState<VirtualCountry | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [openingCheckout, setOpeningCheckout] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openCheckout(event: MouseEvent<HTMLAnchorElement>, credits: number) {
    if (blocked || openingCheckout != null) {
      event.preventDefault();
      return;
    }
    setError(null);
    setOpeningCheckout(credits);
  }

  useEffect(() => {
    if (isPending) return;
    let stop = false;
    void getSportyLink()
      .then((link) => {
        if (stop) return;
        if (!link.signedIn || user?.isDevFallback) {
          void navigate({ to: "/register", viewTransition: false });
          return;
        }
        if (!link.linked || !link.country || !link.activated) {
          void openTask(navigate, link, "virtual");
          return;
        }
        setCountry(link.country);
        if (link.country === "Ghana" || link.country === "Nigeria") {
          void getVirtualCreditBalance()
            .then(({ balance: nextBalance }) => {
              if (!stop) setBalance(nextBalance);
            })
            .catch((err: unknown) => {
              if (!stop)
                setError(
                  err instanceof Error ? err.message : "Could not load your credit balance.",
                );
            });
        }
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!stop)
          setError(err instanceof Error ? err.message : "Could not load Instant Virtual packages.");
      });
    return () => {
      stop = true;
    };
  }, [isPending, user?.id, user?.isDevFallback, navigate]);

  if (!ready || !country) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink px-5 text-white">
        {error ? <p role="alert">{error}</p> : <SignalLoading label="Checking account" />}
      </main>
    );
  }

  return (
    <main className="virtual-shop">
      <div className="virtual-shop-shell">
        <nav className="virtual-shop-nav" aria-label="Page navigation">
          <Link to="/" className="virtual-shop-back">
            <ArrowLeft size={16} aria-hidden />
            Back home
          </Link>
          <Link to="/" className="virtual-shop-brand">
            GAMES<span>HUB</span>
            <span className="virtual-shop-brand-dot" />
          </Link>
          <span className="virtual-shop-secure">
            <ShieldCheck size={15} aria-hidden /> Secure checkout
          </span>
        </nav>
        <header className="virtual-shop-heading">
          <p className="virtual-shop-eyebrow">
            <span /> INSTANT VIRTUAL
          </p>
          <h1>
            Your next play.
            <br />
            <span>Your choice.</span>
          </h1>
          <p>Pick your credits. Make it your game.</p>
        </header>
        <div className="virtual-shop-wallet">
          <span className="virtual-shop-wallet-icon">
            <Coins size={23} aria-hidden />
          </span>
          <div>
            <span className="virtual-shop-label">YOUR CREDIT BALANCE</span>
            <strong aria-live="polite">
              {balance == null ? (
                "Loading balance..."
              ) : (
                <>
                  {balance} <span>{balance === 1 ? "credit" : "credits"}</span>
                </>
              )}
            </strong>
          </div>
          {balance != null && balance > 0 ? (
            <Link to="/virtual-scan" className="virtual-shop-wallet-link">
              Scan screenshot <ArrowRight size={16} aria-hidden />
            </Link>
          ) : (
            <span className="virtual-shop-wallet-note">
              A fresh start.
              <br />
              Choose a pack below.
            </span>
          )}
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-center text-sm text-red">
            {error}
          </p>
        ) : null}
        <div className="virtual-shop-section-label">
          <h2>Find your perfect pack</h2>
          <span>3 ways to play</span>
        </div>
        <div className="virtual-shop-grid">
          {VIRTUAL_CREDIT_OFFERS.map((baseOffer, index) => {
            const offer = virtualCreditOffer(baseOffer.credits, country);
            const currency = country === "Nigeria" ? "NGN" : "GHS";
            return (
              <article
                key={offer.credits}
                className={`virtual-shop-pack${index === 1 ? " is-featured" : ""}`}
              >
                <div className="virtual-shop-pack-top">
                  <span className="virtual-shop-pack-icon">
                    {index === 0 ? (
                      <Zap aria-hidden />
                    ) : index === 1 ? (
                      <Dices aria-hidden />
                    ) : (
                      <Layers3 aria-hidden />
                    )}
                  </span>
                  <span className={`virtual-shop-tag${index === 1 ? " is-red" : ""}`}>
                    {index === 0 ? "KEEP IT SIMPLE" : index === 1 ? "THE SWEET SPOT" : "BEST VALUE"}
                  </span>
                </div>
                <p className="virtual-shop-tier">
                  {index === 0 ? "Starter" : index === 1 ? "Plus" : "Max"}
                </p>
                <div className="virtual-shop-price">
                  <span>{currency}</span>
                  <strong>{offer.amount.toLocaleString("en-US")}</strong>
                  <span>one-time</span>
                </div>
                <h3 className="virtual-shop-quantity">
                  {offer.credits}
                  <span>{offer.credits === 1 ? "credit" : "credits"}</span>
                </h3>
                <p className="virtual-shop-pack-description">
                  {index === 0
                    ? "A little taste of the action."
                    : index === 1
                      ? "More room to keep playing."
                      : "Your biggest credit boost."}
                </p>
                <ul className="virtual-shop-features">
                  <li>
                    <Check size={15} aria-hidden /> {offer.credits} Instant Virtual{" "}
                    {offer.credits === 1 ? "screenshot scan" : "screenshot scans"}
                  </li>
                  <li>
                    <Check size={15} aria-hidden /> Added after payment approval
                  </li>
                </ul>
                <Link
                  to="/virtual-pay"
                  search={{ credits: offer.credits }}
                  data-no-cursor-lift
                  aria-disabled={blocked || openingCheckout != null}
                  onClick={(event) => openCheckout(event, offer.credits)}
                  className="virtual-shop-buy no-button-attention"
                  aria-label={`Buy ${offer.credits} ${offer.credits === 1 ? "credit" : "credits"} for ${currency} ${offer.amount.toLocaleString("en-US")}`}
                >
                  {openingCheckout === offer.credits ? (
                    <>
                      Opening checkout…
                      <LoaderCircle size={17} className="animate-spin" aria-hidden />
                    </>
                  ) : (
                    <>
                      Choose {index === 0 ? "Starter" : index === 1 ? "Plus" : "Max"}{" "}
                      <ArrowRight size={17} aria-hidden />
                    </>
                  )}
                </Link>
              </article>
            );
          })}
        </div>
        <footer className="virtual-shop-footer">
          <ShieldCheck size={17} aria-hidden />
          <p>
            One-time purchase. No subscription.
            <span>
              {" "}
              Upload your receipt at checkout. Credits arrive once your payment is approved.
            </span>
          </p>
        </footer>
      </div>
    </main>
  );
}
