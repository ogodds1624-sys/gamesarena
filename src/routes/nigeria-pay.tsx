import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Clock3, Flame, Gem, LoaderCircle, X, Zap } from "lucide-react";
import { getPaymentStatus, getSportyLink, recordPayment } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveStorefront } from "@/lib/storefront-live";
import { CONNECTING_PHONE_MESSAGE, SignalLoading } from "@/components/signal-loading";
import {
  clearPendingPayment,
  confirmPendingPayment,
  readPendingPayment,
  savePendingPayment,
} from "@/lib/desk-session";
import { storedReferral } from "@/lib/remember-ref";
import { openTask } from "@/lib/task-order";
import type { PackageId } from "@/lib/pricing";

export const Route = createFileRoute("/nigeria-pay")({
  component: NigeriaPayPage,
});

const PACKAGE_ICONS = { quick: Zap, popular: Flame, extended: Gem };

function naira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function NigeriaPayPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? "";
  const devFallback = user?.isDevFallback === true;
  const store = useLiveStorefront();
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState(0);
  const [amount, setAmount] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [packageId, setPackageId] = useState<PackageId | undefined>();
  const [showPay, setShowPay] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receiptName, setReceiptName] = useState("");
  const [receipt, setReceipt] = useState("");
  const [alertOn, setAlertOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [result, setResult] = useState<"pending" | "confirmed" | "rejected">("pending");
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isPending) return;
    let stop = false;
    void getSportyLink().then((link) => {
      if (stop) return;
      if (link.activated && readPendingPayment()?.purpose === "activation") clearPendingPayment();
      if (!link.signedIn || devFallback) {
        void navigate({ to: "/register" });
        return;
      }
      if (!link.linked || !link.activated) {
        void openTask(navigate, link);
        return;
      }
      if (link.country !== "Nigeria") {
        void navigate({ to: "/packages", viewTransition: false });
        return;
      }
      setReady(true);
    });
    return () => {
      stop = true;
    };
  }, [isPending, userId, devFallback, navigate]);

  useEffect(() => {
    if (!ready || paymentId) return;
    const saved = readPendingPayment();
    if (!saved) return;
    let stop = false;
    void getPaymentStatus({ data: { id: saved.id } })
      .then((row) => {
        if (stop) return;
        if (row.status === "rejected") {
          clearPendingPayment();
          setAlertOn(true);
        } else {
          setAmount(row.amount);
          setMinutes(row.minutes);
          setShowPay(true);
          setWaiting(true);
          setPaymentId(saved.id);
          if (row.status === "confirmed") setResult("confirmed");
        }
      })
      .catch((err: unknown) => {
        if (!stop)
          setError(
            err instanceof Error ? err.message : "Could not restore your payment. Reload to retry.",
          );
      });
    return () => {
      stop = true;
    };
  }, [ready, paymentId, navigate]);

  useEffect(() => {
    if (!paymentId || result !== "pending") return;
    const timer = window.setInterval(() => {
      void getPaymentStatus({ data: { id: paymentId } })
        .then((row) => {
          setAmount(row.amount);
          setMinutes(row.minutes);
          if (row.status === "confirmed" || row.status === "rejected") setResult(row.status);
        })
        .catch((err: unknown) =>
          setError(
            err instanceof Error ? err.message : "Could not check payment approval. Retrying.",
          ),
        );
    }, 3000);
    return () => window.clearInterval(timer);
  }, [paymentId, result]);

  useEffect(() => {
    if (!amount) return;
    if (result === "confirmed") {
      if (minutes == null) {
        setError("The purchased session duration is missing. Reload checkout to retry.");
        return;
      }
      confirmPendingPayment(paymentId ?? "", amount, minutes);
      clearPendingPayment();
      void navigate({ to: "/session" });
      return;
    }
    if (result === "rejected") {
      clearPendingPayment();
      setWaiting(false);
      sendingRef.current = false;
      setSending(false);
      setReceipt("");
      setReceiptName("");
      setPaymentId(null);
      setResult("pending");
      setShowPay(false);
      setAmount(null);
      setMinutes(null);
      setPackageId(undefined);
      setAlertOn(true);
    }
  }, [result, amount, minutes, navigate, paymentId]);

  const accounts = store?.nigeriaAccounts ?? [];
  const selected = accounts[choice] ?? accounts[0];
  const open = Boolean(store?.nigeriaOn && selected);

  function copyNumber() {
    if (!selected) return;
    const field = document.createElement("textarea");
    field.value = selected.number;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.opacity = "0";
    document.body.append(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, selected.number.length);
    const ok = document.execCommand("copy");
    field.remove();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      return;
    }
    void navigator.clipboard.writeText(selected.number).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function onReceipt(file: File | undefined) {
    if (!file) {
      setReceipt("");
      setReceiptName("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReceipt(typeof reader.result === "string" ? reader.result : "");
      setReceiptName(file.name);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sendingRef.current || paymentId) return;
    if (!open || amount == null) return;
    if (!receipt) {
      setError("Attach a screenshot of your payment.");
      return;
    }
    setError(null);
    sendingRef.current = true;
    setSending(true);
    try {
      const saved = await recordPayment({
        data: { name: "", amount, minutes, packageId, receipt, referredBy: storedReferral() },
      });
      setAmount(saved.amount);
      setMinutes(saved.minutes);
      setPaymentId(saved.id);
      savePendingPayment(saved.id, saved.amount);
      setWaiting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that payment.");
      sendingRef.current = false;
      setSending(false);
    }
  }

  const waitingLabel =
    result === "confirmed"
      ? CONNECTING_PHONE_MESSAGE
      : result === "rejected"
        ? "payment rejected"
        : "waiting for confirmation";

  if (!ready || !store) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink">
        <SignalLoading />
      </main>
    );
  }

  if (amount == null || !showPay) {
    return (
      <main className="home-theme relative min-h-dvh overflow-hidden px-4 py-10 text-white">
        <div className="relative z-10 mx-auto w-full max-w-md">
          {alertOn ? (
            <div
              className="reject-banner mb-5 rounded-2xl border border-red bg-black/75 px-4 py-4 text-center"
              role="alert"
            >
              <p className="text-sm font-extrabold tracking-wide text-red">PAYMENT REJECTED</p>
              <p className="mt-1 text-base font-bold text-white">
                Your payment was rejected. Choose a package and try again.
              </p>
            </div>
          ) : null}
          <Link to="/" className="auth-back-home mb-4">
            <span className="auth-back-home-icon" aria-hidden="true">
              <ArrowLeft size={15} strokeWidth={2.5} />
            </span>
            <span>Back home</span>
          </Link>
          <p className="package-kicker">
            Games Hub <span aria-hidden="true">/</span> Session Menu
          </p>
          <h1 className="package-title">
            Choose Your <span>Package</span>
          </h1>
          <p className="package-subtitle">Buy session time · Use anytime</p>
          {error ? <p className="mt-4 text-center text-sm font-bold text-red">{error}</p> : null}
          <div className="mt-6 space-y-4">
            {store.pricing.Nigeria.packages.map((pack, index) => {
              const Icon = PACKAGE_ICONS[pack.id];
              return (
                <article key={pack.id} className="package-card">
                  <div className="package-card-top">
                    <div className="package-price-block">
                      <h2 className="package-price">
                        <span>₦</span> {pack.price.toLocaleString("en-NG")}
                      </h2>
                    </div>
                    <span
                      className={
                        "package-card-icon" +
                        (pack.id === "quick"
                          ? " package-card-icon-gold"
                          : pack.id === "popular"
                            ? " package-card-icon-gold package-card-icon-platinum"
                            : " package-card-icon-gold package-card-icon-diamond")
                      }
                    >
                      {pack.id === "quick" ? (
                        <svg
                          className="package-gold-bar"
                          viewBox="0 0 48 48"
                          fill="none"
                          aria-hidden="true"
                        >
                          <defs>
                            <linearGradient
                              id="coin-face"
                              x1="8"
                              y1="6"
                              x2="40"
                              y2="30"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop stopColor="#FF5966" />
                              <stop offset=".5" stopColor="#E50914" />
                              <stop offset="1" stopColor="#A80712" />
                            </linearGradient>
                            <linearGradient id="coin-edge" x1="0" y1="0" x2="0" y2="1">
                              <stop stopColor="#72050B" />
                              <stop offset="1" stopColor="#400408" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M8 34v-4c0-2.6 7.2-4.5 16-4.5s16 1.9 16 4.5v4c0 2.6-7.2 4.5-16 4.5S8 36.600 8 34Z"
                            fill="url(#coin-edge)"
                          />
                          <ellipse
                            cx="24"
                            cy="30"
                            rx="16"
                            ry="4.500"
                            fill="url(#coin-face)"
                            stroke="#FFB3B8"
                            strokeWidth=".8"
                          />
                          <path
                            d="M8 26v-4c0-2.6 7.2-4.5 16-4.5s16 1.9 16 4.5v4c0 2.6-7.2 4.5-16 4.5S8 28.600 8 26Z"
                            fill="url(#coin-edge)"
                          />
                          <ellipse
                            cx="24"
                            cy="22"
                            rx="16"
                            ry="4.500"
                            fill="url(#coin-face)"
                            stroke="#FFB3B8"
                            strokeWidth=".8"
                          />
                          <path
                            d="M8 18v-4c0-2.6 7.2-4.5 16-4.5s16 1.9 16 4.5v4c0 2.6-7.2 4.5-16 4.5S8 20.600 8 18Z"
                            fill="url(#coin-edge)"
                          />
                          <ellipse
                            cx="24"
                            cy="14"
                            rx="16"
                            ry="4.500"
                            fill="url(#coin-face)"
                            stroke="#FFB3B8"
                            strokeWidth=".8"
                          />
                          <ellipse
                            cx="24"
                            cy="14"
                            rx="9"
                            ry="2.200"
                            stroke="#400408"
                            strokeWidth=".9"
                            opacity=".7"
                          />
                          <path
                            d="M14 12.500c3-1.500 9-1.800 13-.600"
                            stroke="#fff"
                            strokeWidth="1"
                            strokeLinecap="round"
                            opacity=".75"
                          />
                          <path
                            d="M38 7l1.200 2.800L42 11l-2.800 1.200L38 15l-1.200-2.800L34 11l2.800-1.200L38 7Z"
                            fill="#FF5966"
                          />
                        </svg>
                      ) : pack.id === "popular" ? (
                        <svg
                          className="package-gold-bar"
                          viewBox="0 0 48 48"
                          fill="none"
                          aria-hidden="true"
                        >
                          <defs>
                            <linearGradient
                              id="plat-face"
                              x1="8"
                              y1="6"
                              x2="40"
                              y2="42"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop stopColor="#FFFFFF" />
                              <stop offset=".5" stopColor="#C9D6E8" />
                              <stop offset="1" stopColor="#7F8FA8" />
                            </linearGradient>
                            <linearGradient id="plat-rim" x1="0" y1="0" x2="1" y2="1">
                              <stop stopColor="#EAF2FF" />
                              <stop offset="1" stopColor="#5E6E88" />
                            </linearGradient>
                          </defs>
                          <circle cx="24" cy="25" r="18" fill="#4B5A73" />
                          <circle cx="24" cy="23" r="18" fill="url(#plat-rim)" />
                          <circle
                            cx="24"
                            cy="23"
                            r="14.500"
                            fill="url(#plat-face)"
                            stroke="#FFFFFF"
                            strokeWidth=".8"
                          />
                          <circle
                            cx="24"
                            cy="23"
                            r="11.500"
                            stroke="#7F8FA8"
                            strokeWidth=".8"
                            opacity=".7"
                          />
                          <path
                            d="m24 13.500 2.900 6 6.600.9-4.800 4.600 1.200 6.500L24 28.300l-5.900 3.200 1.200-6.500-4.800-4.600 6.600-.9 2.900-6Z"
                            fill="#E8F1FF"
                            stroke="#8A9AB4"
                            strokeWidth=".9"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M13 17c2-4 6-6.500 10-6.800"
                            stroke="#fff"
                            strokeWidth="1.400"
                            strokeLinecap="round"
                            opacity=".85"
                          />
                          <path
                            d="M40 6l1 2.400L43.400 9.400 41 10.400 40 12.800l-1-2.400-2.400-1L39 8.400 40 6Z"
                            fill="#fff"
                          />
                        </svg>
                      ) : pack.id === "extended" ? (
                        <svg
                          className="package-gold-bar"
                          viewBox="0 0 48 48"
                          fill="none"
                          aria-hidden="true"
                        >
                          <defs>
                            <linearGradient
                              id="dia-top"
                              x1="8"
                              y1="8"
                              x2="40"
                              y2="20"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop stopColor="#E9FBFF" />
                              <stop offset="1" stopColor="#7FD8F5" />
                            </linearGradient>
                            <linearGradient
                              id="dia-body"
                              x1="24"
                              y1="18"
                              x2="24"
                              y2="44"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop stopColor="#4CC3F0" />
                              <stop offset="1" stopColor="#1E6FC9" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M14 8h20l8 10-18 24L6 18l8-10Z"
                            fill="url(#dia-body)"
                            stroke="#D9F6FF"
                            strokeWidth="1"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M14 8h20l8 10H6l8-10Z"
                            fill="url(#dia-top)"
                            stroke="#D9F6FF"
                            strokeWidth="1"
                            strokeLinejoin="round"
                          />
                          <path d="m18 18 6-10 6 10-6 24-6-24Z" fill="#fff" opacity=".28" />
                          <path
                            d="M6 18h36M18 18l6 24 6-24M14 8l4 10M34 8l-4 10"
                            stroke="#EFFCFF"
                            strokeWidth=".8"
                            strokeLinejoin="round"
                            opacity=".75"
                          />
                          <path
                            d="M40 4l1 2.400L43.400 7.400 41 8.400 40 10.800l-1-2.400-2.400-1L39 6.400 40 4Z"
                            fill="#fff"
                          />
                        </svg>
                      ) : (
                        <Icon aria-hidden />
                      )}
                    </span>
                  </div>
                  <div className="package-card-meta">
                    <p className="package-duration">
                      <Clock3 aria-hidden />
                      {pack.minutes} mins per session
                    </p>
                    <span className="package-availability">
                      <span aria-hidden="true" />
                      Available
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAmount(pack.price);
                      setMinutes(pack.minutes);
                      setPackageId(pack.id);
                      setShowPay(true);
                    }}
                    style={{ animationDelay: `${index * 0.2}s` }}
                    className="buy-pulse package-buy-button mt-4"
                  >
                    <span className="package-buy-copy">
                      <strong>Unlock sessions</strong>
                    </span>
                    <span className="package-buy-arrow" aria-hidden="true">
                      <ArrowRight />
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="home-theme flex min-h-dvh items-start justify-center px-3 py-6 text-white sm:items-center">
      {result === "rejected" ? (
        <div
          className="reject-alert fixed inset-0 z-50 grid place-items-center bg-black/80 px-6"
          role="alert"
        >
          <div className="reject-card w-full max-w-sm rounded-3xl border border-red bg-[#140606] px-5 py-7 text-center">
            <p className="text-xs font-extrabold tracking-[0.2em] text-red">PAYMENT REJECTED</p>
            <p className="mt-3 text-2xl font-extrabold">Your payment was rejected</p>
            <p className="mt-2 text-sm text-white/70">Sending you back to the packages page.</p>
          </div>
        </div>
      ) : paymentId || sending ? (
        <SignalLoading label={waitingLabel} />
      ) : null}
      <section className="auth-card w-full max-w-md rounded-[28px] px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-extrabold tracking-[0.18em] text-white">BANK TRANSFER</p>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setShowPay(false);
              setAmount(null);
            }}
            className="grid size-9 place-items-center rounded-xl border border-line text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Pay by bank transfer</h1>
        <p className="mt-2 text-sm text-white/65">{minutes} mins per session</p>
        <p className="mt-3 text-4xl font-extrabold tracking-tight text-[#3dde6a]">
          {naira(amount)} NGN
        </p>
        {!store ? (
          <p className="mt-6 text-sm text-white/70">Loading checkout…</p>
        ) : !open || !selected ? (
          <p className="mt-6 text-sm text-white/70">
            Checkout is not ready yet. Turn on the Nigeria payment gateway and save an account.
          </p>
        ) : (
          <>
            {accounts.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {accounts.map((account, index) => (
                  <button
                    key={`${account.number}-${index}`}
                    type="button"
                    onClick={() => setChoice(index)}
                    className={
                      "rounded-full border px-3 py-1 text-xs font-extrabold " +
                      (index === choice ? "border-red bg-red text-white" : "border-line text-white")
                    }
                  >
                    {account.bank || "Account"}
                  </button>
                ))}
              </div>
            ) : null}
            <dl className="mt-5 overflow-hidden rounded-2xl border border-line">
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <dt className="text-xs font-bold tracking-widest text-white">BANK</dt>
                <dd className="text-right text-base font-bold">{selected.bank || "Bank"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-4">
                <dt className="text-xs font-bold tracking-widest text-white">ACCOUNT NUMBER</dt>
                <dd className="flex items-center gap-2 text-base font-extrabold">
                  <span>{selected.number}</span>
                  <button
                    type="button"
                    onClick={copyNumber}
                    className="rounded-lg border border-red px-2 py-1 text-[11px] font-extrabold tracking-wide text-white"
                  >
                    {copied ? "COPIED" : "COPY"}
                  </button>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-4">
                <dt className="text-xs font-bold tracking-widest text-white">ACCOUNT NAME</dt>
                <dd className="text-right text-sm font-extrabold tracking-wide">
                  {selected.name || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-4">
                <dt className="text-xs font-bold tracking-widest text-white">AMOUNT</dt>
                <dd className="text-base font-extrabold">{naira(amount)} NGN</dd>
              </div>
            </dl>
            <ol className="mt-5 space-y-4 text-base leading-relaxed text-white">
              <li>
                1. Transfer <strong>{naira(amount)} NGN</strong> to the account above from your
                banking app.
              </li>
              <li>
                2. Attach a <strong>screenshot of the receipt</strong> — your Casino signal is
                opened once the payment is confirmed.
              </li>
            </ol>
            <form onSubmit={(event) => void onSubmit(event)} className="mt-6">
              <label
                htmlFor="receipt"
                className="text-xs font-extrabold tracking-[0.14em] text-white"
              >
                RECEIPT SCREENSHOT
              </label>
              <input
                id="receipt"
                type="file"
                accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={(event) => onReceipt(event.target.files?.[0])}
                className="mt-3 w-full rounded-xl border border-line bg-ink px-3 py-3 text-sm text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-3 file:py-1 file:text-sm file:font-bold file:text-white"
              />
              <p className="mt-2 text-sm text-white/60">{receiptName || "no file selected"}</p>
              <p className="mt-1 text-xs text-white/50">
                Any screenshot size is accepted, including files over 1MB.
              </p>
              {error ? <p className="mt-2 text-sm text-red">{error}</p> : null}
              <button
                type="submit"
                disabled={!receipt || sending || Boolean(paymentId)}
                className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-red text-base font-extrabold tracking-wide text-white disabled:opacity-70"
              >
                {sending ? (
                  <>
                    SENDING RECEIPT…
                    <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  </>
                ) : (
                  "I'VE SENT THE MONEY"
                )}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
