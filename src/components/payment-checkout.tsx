import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Copy, LoaderCircle, ShieldCheck, Smartphone, X } from "lucide-react";
import { CONNECTING_PHONE_MESSAGE, SignalLoading } from "@/components/signal-loading";
import { getPaymentStatus, getSportyLink, recordPayment } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveStorefront } from "@/lib/storefront-live";
import {
  clearPendingPayment,
  confirmPendingPayment,
  readPendingPayment,
  savePendingPayment,
} from "@/lib/desk-session";
import { storedReferral } from "@/lib/remember-ref";
import { openTask } from "@/lib/task-order";
import { paymentQuote, type PaymentQuote } from "@/lib/pricing";
import { virtualCreditOffer } from "@/lib/virtual-credits";
import { PaymentPayerField } from "@/components/payment-payer-field";
import { validatePaymentProof } from "@/lib/payment-proof";

export function PaymentCheckout({
  activation = false,
  sessionAmount,
  packageId,
  virtualCredits,
}: {
  activation?: boolean;
  sessionAmount?: number;
  packageId?: string;
  virtualCredits?: number;
}) {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [country, setCountry] = useState<"Ghana" | "Nigeria">("Ghana");
  const store = useLiveStorefront();
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [purchased, setPurchased] = useState<{ amount: number; minutes: number | null } | null>(
    null,
  );
  const amount = purchased?.amount ?? quote?.amount ?? 0;
  const amountLabel = `${country === "Nigeria" ? "NGN" : "GHS"} ${amount.toLocaleString()}`;
  const userId = user?.id ?? "";
  const devFallback = user?.isDevFallback === true;
  const [allowed, setAllowed] = useState(false);
  const [choice, setChoice] = useState(0);
  const [receipt, setReceipt] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [payerName, setPayerName] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [result, setResult] = useState<"pending" | "confirmed" | "rejected">("pending");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (isPending) return;
    let stop = false;
    void getSportyLink()
      .then((link) => {
        if (stop) return;
        if (link.activated && readPendingPayment()?.purpose === "activation") clearPendingPayment();
        if (!link.signedIn || devFallback) {
          void navigate({ to: "/register", viewTransition: false });
          return;
        }
        if (!link.linked || !link.country) {
          void openTask(navigate, link);
          return;
        }
        if ((activation && link.activated) || (!activation && !link.activated)) {
          void openTask(navigate, link, virtualCredits != null ? "virtual" : undefined);
          return;
        }
        if (virtualCredits == null && !activation && link.country === "Nigeria") {
          void navigate({ to: "/nigeria-pay", viewTransition: false });
          return;
        }
        if (link.country) setCountry(link.country);
        if (activation && link.activationPayment) {
          setPurchased({ amount: link.activationPayment.amount, minutes: null });
          setPaymentId(link.activationPayment.id);
          savePendingPayment(
            link.activationPayment.id,
            link.activationPayment.amount,
            "activation",
          );
        } else if (activation && readPendingPayment()?.purpose === "activation") {
          clearPendingPayment();
        }
        setAllowed(true);
      })
      .catch(() => {
        if (stop) return;
        setError("Could not open checkout. Go back and choose the package again.");
      });
    return () => {
      stop = true;
    };
  }, [isPending, userId, devFallback, navigate, activation, virtualCredits]);

  useEffect(() => {
    if (!allowed || !store || quote || purchased) return;
    try {
      setQuote(
        virtualCredits != null
          ? {
              amount: virtualCreditOffer(virtualCredits, country).amount,
              minutes: null,
              packageId: null,
            }
          : paymentQuote(
              store.pricing,
              country,
              activation ? "activation" : "session",
              packageId,
              sessionAmount,
            ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pricing.");
    }
  }, [
    allowed,
    store,
    country,
    activation,
    packageId,
    sessionAmount,
    virtualCredits,
    quote,
    purchased,
  ]);

  useEffect(() => {
    if (!allowed || paymentId) return;
    if (activation) return;
    const saved = readPendingPayment();
    if (!saved) return;
    if (saved.purpose === "activation") {
      clearPendingPayment();
      return;
    }
    let stop = false;
    void getPaymentStatus({ data: { id: saved.id } })
      .then((row) => {
        if (stop) return;
        if (row.purpose === "activation") {
          clearPendingPayment();
          return;
        }
        if (row.purpose !== (virtualCredits != null ? "virtual_credits" : "session")) return;
        if (row.status === "rejected") {
          clearPendingPayment();
          setResult("rejected");
          setPaymentId(saved.id);
        } else {
          setPurchased({ amount: row.amount, minutes: row.minutes });
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
  }, [allowed, amount, paymentId, navigate, activation, virtualCredits]);

  useEffect(() => {
    if (!paymentId || result !== "pending") return;
    let stop = false;
    const check = () => {
      void getPaymentStatus({ data: { id: paymentId } })
        .then((row) => {
          if (stop) return;
          setPurchased({ amount: row.amount, minutes: row.minutes });
          if (row.status === "confirmed" || row.status === "rejected") setResult(row.status);
        })
        .catch((err: unknown) => {
          if (!stop)
            setError(
              err instanceof Error ? err.message : "Could not check payment approval. Retrying.",
            );
        });
    };
    check();
    const timer = window.setInterval(check, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [paymentId, result]);

  useEffect(() => {
    if (result === "confirmed") {
      if (activation) {
        clearPendingPayment();
        void getSportyLink()
          .then((link) => openTask(navigate, link))
          .catch((err: unknown) => {
            setError(
              err instanceof Error ? err.message : "Could not open packages. Reload to continue.",
            );
          });
        return;
      }
      if (virtualCredits != null) {
        clearPendingPayment();
        void navigate({ to: "/virtual-scan" });
        return;
      }
      if (purchased?.minutes == null) {
        setError("The purchased session duration is missing. Reload checkout to retry.");
        return;
      }
      confirmPendingPayment(paymentId ?? "", purchased.amount, purchased.minutes);
      clearPendingPayment();
      void navigate({ to: "/session" });
      return;
    }
    if (result === "rejected") {
      clearPendingPayment();
      if (activation) {
        setError("Your activation payment was rejected. Check the receipt and submit again.");
        setPaymentId(null);
        setPurchased(null);
        setQuote(null);
        setResult("pending");
        setSending(false);
        sendingRef.current = false;
        return;
      }
      if (virtualCredits != null) {
        void navigate({ to: "/virtual-packages" });
      } else {
        void navigate({ to: "/packages", search: { rejected: 1 }, viewTransition: false });
      }
    }
  }, [result, amount, navigate, activation, paymentId, purchased, virtualCredits]);

  const options =
    country === "Nigeria"
      ? (store?.nigeriaAccounts ?? []).map((account) => ({
          kind: "bank" as const,
          label: account.bank || "Bank transfer",
          number: account.number,
          name: account.name,
        }))
      : [
          ...(store?.wallets ?? []).map((wallet) => ({
            kind: "momo" as const,
            label: wallet.network,
            number: wallet.number,
            name: wallet.name,
          })),
          ...(store?.banks ?? []).map((account) => ({
            kind: "bank" as const,
            label: account.bank || "Bank transfer",
            number: account.number,
            name: account.name,
          })),
        ];
  const selected = options[choice] ?? options[0];
  const bankTransfer = country === "Nigeria" || selected?.kind === "bank";

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
    void navigator.clipboard
      .writeText(selected.number)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() =>
        setError("Could not copy the account number. Copy it manually from the payment details."),
      );
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
    reader.onerror = () => setError("Could not read the receipt. Choose the file again.");
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!allowed || !quote || sendingRef.current || paymentId) return;
    if (!receipt) {
      setError("Attach a screenshot of your payment.");
      return;
    }
    setError(null);
    sendingRef.current = true;
    setSending(true);
    try {
      const purpose =
        virtualCredits != null ? "virtual_credits" : activation ? "activation" : "session";
      const saved = await recordPayment({
        data: {
          ...validatePaymentProof(payerName, receipt),
          amount: quote.amount,
          minutes: quote.minutes,
          packageId: quote.packageId ?? undefined,
          credits: virtualCredits,
          referredBy: storedReferral(),
          purpose,
        },
      });
      setPurchased({ amount: saved.amount, minutes: saved.minutes });
      setPaymentId(saved.id);
      savePendingPayment(saved.id, saved.amount, purpose);
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

  if (!allowed || (!quote && !purchased)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink px-5 text-white">
        {error ? <p role="alert">{error}</p> : <SignalLoading label="Checking account" />}
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
            <p className="mt-2 text-sm text-white/70">
              {virtualCredits != null
                ? "Sending you back to Instant Virtual packages."
                : "Sending you back to the packages page."}
            </p>
          </div>
        </div>
      ) : paymentId || sending ? (
        <>
          <SignalLoading
            label={
              !paymentId
                ? "Sending your receipt…"
                : activation
                  ? "Waiting for activation approval"
                  : waitingLabel
            }
          />
          {error ? (
            <p role="alert" className="fixed bottom-6 z-50 px-4 text-sm text-red">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
      <section className="payment-card auth-card w-full max-w-lg rounded-[28px] px-5 py-5 sm:px-7 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <p className="payment-kicker">{bankTransfer ? "BANK TRANSFER" : "MOBILE MONEY"}</p>
          <Link
            to={activation ? "/" : virtualCredits != null ? "/virtual-packages" : "/packages"}
            aria-label="Close"
            className="payment-close grid size-9 place-items-center rounded-xl text-white no-underline"
          >
            <X className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="payment-heading-row mt-3">
          <div className="payment-method-icon" aria-hidden="true">
            {bankTransfer ? <ShieldCheck /> : <Smartphone />}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {virtualCredits != null
                ? "Instant Virtual credits"
                : activation
                  ? "Account activation fee"
                  : selected?.kind === "bank"
                    ? "Pay by bank transfer"
                    : "Pay by MoMo transfer"}
            </h1>
            <p className="mt-1 text-sm text-white/65">{store?.businessName ?? "Games Hub"}</p>
            {activation ? (
              <p className="mt-2 text-sm text-white/65">
                One-time payment. Admin approval unlocks Aviator and Instant Virtual packages.
              </p>
            ) : null}
            {virtualCredits != null ? (
              <p className="mt-2 text-sm text-white/65">
                {virtualCredits} Instant Virtual {virtualCredits === 1 ? "credit" : "credits"}.
                Credits are added after payment approval.
              </p>
            ) : null}
            {!activation && virtualCredits == null ? (
              <p className="mt-2 text-sm text-white/65">
                {purchased?.minutes ?? quote?.minutes} mins per session
              </p>
            ) : null}
          </div>
        </div>
        <div className="payment-amount-card mt-5">
          <div>
            <p className="payment-amount-label">AMOUNT TO SEND</p>
            <p className="payment-amount-value">{amountLabel}</p>
          </div>
          <ShieldCheck className="size-6 text-gold" aria-hidden />
        </div>

        {!store ? (
          <p className="mt-6 text-sm text-white/70">Loading checkout…</p>
        ) : !selected ? (
          <p className="payment-empty mt-6 text-sm text-white/70">
            Checkout is not ready yet. Save a wallet or bank account on the admin payment gateway.
          </p>
        ) : (
          <>
            {options.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {options.map((option, index) => (
                  <button
                    key={`${option.kind}-${option.number}`}
                    type="button"
                    onClick={() => setChoice(index)}
                    className={"payment-method-option " + (index === choice ? "is-selected" : "")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            <dl className="payment-details mt-5 overflow-hidden rounded-2xl">
              <div className="payment-detail-row">
                <dt className="payment-detail-label">
                  {selected.kind === "bank" ? "BANK" : "NETWORK"}
                </dt>
                <dd className="payment-detail-value">{selected.label}</dd>
              </div>
              <div className="payment-detail-row">
                <dt className="payment-detail-label">SEND TO</dt>
                <dd className="payment-number-wrap">
                  <span className="payment-number">{selected.number}</span>
                  <button
                    type="button"
                    onClick={copyNumber}
                    className="payment-copy-button"
                    aria-label={copied ? "Number copied" : "Copy payment number"}
                  >
                    {copied ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <Copy className="size-4" aria-hidden />
                    )}
                    {copied ? "COPIED" : "COPY"}
                  </button>
                </dd>
              </div>
              <div className="payment-detail-row">
                <dt className="payment-detail-label">ACCOUNT NAME</dt>
                <dd className="payment-detail-value">{selected.name || "—"}</dd>
              </div>
              <div className="payment-detail-row">
                <dt className="payment-detail-label">AMOUNT</dt>
                <dd className="payment-detail-value text-gold">{amountLabel}</dd>
              </div>
            </dl>

            <ol className="payment-steps mt-5">
              <li>
                <span>1</span>
                <p>
                  Send <strong>{amountLabel}</strong> using the details above.
                </p>
              </li>
              <li>
                <span>2</span>
                <p>Upload a screenshot or receipt of the transfer.</p>
              </li>
              <li>
                <span>3</span>
                <p>We’ll update this page once your payment is confirmed.</p>
              </li>
            </ol>

            {paymentId ? null : (
              <form onSubmit={onSubmit} className="payment-receipt-form mt-6">
                <label htmlFor="receipt" className="payment-upload-label">
                  <span>
                    <strong>Upload payment receipt</strong>
                    <small>{receiptName || "Image or PDF · required to confirm transfer"}</small>
                  </span>
                  <ArrowRight className="size-5" aria-hidden />
                </label>
                <input
                  id="receipt"
                  type="file"
                  accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => onReceipt(event.target.files?.[0])}
                  className="payment-file-input"
                />
                <PaymentPayerField
                  value={payerName}
                  onChange={setPayerName}
                  bankTransfer={bankTransfer}
                />
                {error ? <p className="mt-2 text-sm text-red">{error}</p> : null}
                <button
                  type="submit"
                  disabled={
                    !allowed || !receipt || !payerName.trim() || sending || Boolean(paymentId)
                  }
                  className="payment-submit mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-extrabold tracking-wide disabled:opacity-70"
                >
                  {sending ? (
                    <>
                      SENDING RECEIPT…
                      <LoaderCircle className="size-5 animate-spin" aria-hidden />
                    </>
                  ) : (
                    <>
                      I'VE SENT THE MONEY
                      <ArrowRight className="size-5" aria-hidden />
                    </>
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
