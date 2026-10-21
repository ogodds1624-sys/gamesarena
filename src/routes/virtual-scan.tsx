import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Coins, ImagePlus, LoaderCircle, ScanLine, ShieldCheck } from "lucide-react";
import { getSportyLink, getVirtualCreditBalance, getVirtualScanAccess } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useBlocked } from "@/lib/blocked-users";
import { SignalLoading } from "@/components/signal-loading";
import { isScanMediaType, isScanResult, MAX_SCAN_BYTES, type ScanResult } from "@/lib/image-scan";
import { openTask } from "@/lib/task-order";
import { getBearerToken } from "@/lib/auth/client";
import { savePendingPayment } from "@/lib/desk-session";

export const Route = createFileRoute("/virtual-scan")({ component: VirtualScan });

function VirtualScan() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const devFallback = user?.isDevFallback;
  const blocked = useBlocked();
  const [balance, setBalance] = useState<number | null>(null);
  const [approvedUser, setApprovedUser] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const requestId = useRef("");
  const sending = useRef(false);

  useEffect(() => {
    setApprovedUser(null);
    if (isPending) return;
    let stopped = false;
    void (async () => {
      const link = await getSportyLink();
      if (stopped) return;
      if (!userId || devFallback || !link.signedIn) {
        await navigate({ to: "/login" });
        return;
      }
      if (!link.linked || !link.country || !link.activated) {
        await openTask(navigate, link, "virtual");
        return;
      }
      const access = await getVirtualScanAccess();
      if (stopped) return;
      if (!access.approved) {
        if (access.pending !== null) {
          savePendingPayment(access.pending.id, access.pending.amount, "virtual_credits");
          await navigate({
            to: "/virtual-pay",
            search: { credits: access.pending.credits },
            replace: true,
          });
        } else {
          await navigate({ to: "/virtual-packages", replace: true });
        }
        return;
      }
      const wallet = await getVirtualCreditBalance();
      if (!stopped) {
        setBalance(wallet.balance);
        setApprovedUser(userId);
      }
    })().catch((err: unknown) => {
      if (!stopped) setError(err instanceof Error ? err.message : "Could not check scan access.");
    });
    return () => {
      stopped = true;
    };
  }, [isPending, userId, devFallback, navigate, blocked]);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(next: File | undefined) {
    if (sending.current || !next) return;
    setError(null);
    if (!isScanMediaType(next.type) || next.size === 0 || next.size > MAX_SCAN_BYTES) {
      setFile(null);
      setResult(null);
      setError("Choose a PNG, JPEG, or WebP screenshot up to 5 MB.");
      return;
    }
    setFile(next);
    setResult(null);
    requestId.current = crypto.randomUUID();
  }

  async function scan() {
    if (sending.current || !file || blocked || balance === null || balance < 1) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const headers = new Headers({
        "Content-Type": file.type,
        "X-Scan-Id": requestId.current,
      });
      const token = getBearerToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch("/api/scan-image", {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: file,
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Could not scan this screenshot. Try again.";
        throw new Error(message);
      }
      if (!isScanResult(data))
        throw new Error("The scan response was invalid. Retry to retrieve the saved result.");
      setResult(data);
      setBalance(data.balance);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Connection lost. Retry to retrieve your scan without a second charge.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (isPending || !userId || approvedUser !== userId || blocked) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink px-5 text-white">
        {blocked || error ? (
          <div className="text-center">
            <p role="alert">{blocked ? "This account has been blocked." : error}</p>
            <Link to="/virtual-packages" className="mt-4 inline-block underline">
              Back to packages
            </Link>
          </div>
        ) : (
          <SignalLoading label="Checking payment approval" />
        )}
      </main>
    );
  }

  return (
    <main className="virtual-shop">
      <div className="virtual-shop-shell">
        <nav className="virtual-shop-nav" aria-label="Page navigation">
          <Link to="/" className="virtual-shop-back">
            <ArrowLeft size={16} aria-hidden /> Back home
          </Link>
          <Link to="/" className="virtual-shop-brand">
            GAMES<span>HUB</span>
          </Link>
          <Link to="/virtual-packages" className="virtual-shop-back">
            Get credits
          </Link>
        </nav>
        <header className="virtual-shop-heading">
          <p className="virtual-shop-eyebrow">
            <span /> INSTANT VIRTUAL SCANNER
          </p>
          <h1>
            Your screenshot.
            <br />
            <span>A clearer view.</span>
          </h1>
          <p>
            Upload your SportyBet Instant Virtual screen to read the visible match details and odds.
          </p>
        </header>
        <div className="virtual-shop-wallet">
          <span className="virtual-shop-wallet-icon">
            <Coins size={23} aria-hidden />
          </span>
          <div>
            <span className="virtual-shop-label">AVAILABLE TO SCAN</span>
            <strong>
              {balance === null
                ? "Checking credits..."
                : `${balance} ${balance === 1 ? "credit" : "credits"}`}
            </strong>
          </div>
          <span className="virtual-shop-wallet-note">
            1 credit per successful scan.
            <br />
            Failed scans are not charged.
          </span>
        </div>
        {balance === null && !error ? <SignalLoading label="Checking scan access" /> : null}
        {balance === 0 ? (
          <div className="my-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
            <h2 className="font-bold">Your next scan starts with a credit.</h2>
            <p className="mt-2 text-sm text-white/70">
              Buy a pack and wait for payment approval to unlock scanning.
            </p>
            <Link
              to="/virtual-packages"
              className="mt-3 inline-block font-bold text-red-300 underline"
            >
              Choose a credit pack
            </Link>
          </div>
        ) : null}
        <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
          <section
            className="rounded-3xl border border-white/15 bg-white/[0.03] p-5 sm:p-7"
            aria-labelledby="upload-title"
          >
            <h2 id="upload-title" className="text-xl font-black">
              01. Upload your screen
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Open Instant Virtual on SportyBet, take a clear screenshot, and crop out your name,
              balance, phone number, and other personal details.
            </p>
            <div
              className="mt-5 rounded-2xl border-2 border-dashed border-red-400/40 bg-black/30 p-5 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                selectFile(event.dataTransfer.files[0]);
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Selected SportyBet screenshot"
                  className="mx-auto max-h-80 max-w-full rounded-xl object-contain"
                />
              ) : (
                <ImagePlus className="mx-auto my-5 size-12 text-red-400" aria-hidden />
              )}
              <label className="mt-4 block text-sm font-bold" htmlFor="sporty-screenshot">
                Choose a screenshot or drop it here
              </label>
              <input
                id="sporty-screenshot"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || blocked}
                className="mt-3 block w-full min-w-0 text-xs text-white/65 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:font-bold file:text-white"
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <p className="mt-3 text-xs text-white/45">PNG, JPEG, WebP / Up to 5 MB</p>
              {file ? <p className="mt-2 break-all text-xs text-white/65">{file.name}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => void scan()}
              disabled={
                !file || busy || blocked || balance === null || balance < 1 || result !== null
              }
              data-no-cursor-lift
              className="no-button-attention mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 font-extrabold text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
              ) : (
                <ScanLine className="size-5" aria-hidden />
              )}
              {busy
                ? "Reading your screenshot..."
                : result
                  ? "Scan complete - upload another"
                  : "Scan screenshot / 1 credit"}
            </button>
          </section>
          <section
            className="rounded-3xl border border-white/15 bg-white/[0.03] p-5 sm:p-7"
            aria-labelledby="analysis-title"
            aria-busy={busy}
          >
            <h2 id="analysis-title" className="text-xl font-black">
              02. Your scan results
            </h2>
            <div aria-live="polite" className="mt-5">
              {result ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/85">
                  {result.analysis}
                </p>
              ) : (
                <div className="py-12 text-center text-white/50">
                  <ScanLine className="mx-auto mb-4 size-10 text-red-400" aria-hidden />
                  <p>
                    {busy
                      ? "Claude is reading the visible details. This may take up to a minute."
                      : "Your screenshot analysis will appear here."}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3 rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-white/55">
              <ShieldCheck className="size-5 shrink-0 text-red-400" aria-hidden />
              <p>AI can misread screenshots. Check all details against SportyBet.</p>
            </div>
          </section>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
