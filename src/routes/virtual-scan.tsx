import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Coins,
  ImagePlus,
  LoaderCircle,
  Camera,
  ScanLine,
  CheckCircle2,
} from "lucide-react";
import { getSportyLink, getVirtualCreditBalance, getVirtualScanAccess } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useBlocked } from "@/lib/blocked-users";
import { SignalLoading } from "@/components/signal-loading";
import { ScanResults } from "@/components/scan-results";
import {
  isScanMediaType,
  isTerminal,
  MAX_SCAN_BYTES,
  MAX_SCAN_FILES,
  type ScanJob,
} from "@/lib/image-scan";
import { scanRequest, uploadScan } from "@/lib/scan-client";
import { openTask } from "@/lib/task-order";
import { savePendingPayment } from "@/lib/desk-session";

export const Route = createFileRoute("/virtual-scan")({ component: VirtualScan });
type Upload = {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error: string | null;
  jobId: string | null;
};

function VirtualScan() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const devFallback = user?.isDevFallback;
  const blocked = useBlocked();
  const [approvedUser, setApprovedUser] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const processing = useRef(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const nextProcessAt = useRef(0);
  const previewUrls = useRef<string[]>([]);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    const version = ++generation.current;
    setApprovedUser(null);
    setJobs([]);
    setProcessingJobId(null);
    setUploads([]);
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setSelected(null);
    setError(null);
    if (isPending || blocked) return;
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
        if (access.pending) {
          savePendingPayment(access.pending.id, access.pending.amount, "virtual_credits");
          await navigate({
            to: "/virtual-pay",
            search: { credits: access.pending.credits },
            replace: true,
          });
        } else await navigate({ to: "/virtual-packages", replace: true });
        return;
      }
      const wallet = await getVirtualCreditBalance();
      const history = await scanRequest();
      if (!stopped && version === generation.current) {
        setBalance(wallet.balance);
        setJobs(history);
        setSelected(history[0]?.id ?? null);
        setApprovedUser(userId);
      }
    })().catch((err: unknown) => {
      if (!stopped)
        setError(err instanceof Error ? err.message : "Could not check scanner access.");
    });
    return () => {
      stopped = true;
    };
  }, [isPending, userId, devFallback, blocked, navigate]);

  function mergeJobs(incoming: ScanJob[]) {
    setJobs((current) => {
      const map = new Map(current.map((job) => [job.id, job]));
      incoming.forEach((job) => map.set(job.id, job));
      return [...map.values()].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
    });
  }

  useEffect(() => {
    if (!userId || approvedUser !== userId || blocked) return;
    let stopped = false;
    let checking = false;
    async function poll() {
      if (checking) return;
      checking = true;
      try {
        const incoming = await scanRequest();
        const wallet = await getVirtualCreditBalance();
        if (!stopped) {
          mergeJobs(incoming);
          setBalance(wallet.balance);
        }
      } catch (err: unknown) {
        if (!stopped) setError(err instanceof Error ? err.message : "Could not refresh scans.");
      } finally {
        checking = false;
      }
    }
    const timer = window.setInterval(() => void poll(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [approvedUser, userId, blocked]);

  // A foreground worker makes local scans immediate. The DB lease and cron recover closed tabs.
  useEffect(() => {
    if (
      processing.current ||
      Date.now() < nextProcessAt.current ||
      approvedUser !== userId ||
      blocked
    )
      return;
    const job = jobs.find((item) => item.status === "queued");
    if (!job) return;
    const version = generation.current;
    processing.current = true;
    setProcessingJobId(job.id);
    nextProcessAt.current = Date.now() + 5000;
    void scanRequest(`?action=process&id=${encodeURIComponent(job.id)}`, true)
      .then((incoming) => {
        if (version === generation.current) mergeJobs(incoming);
      })
      .catch((err: unknown) => {
        if (version === generation.current)
          setError(
            err instanceof Error
              ? err.message
              : "Processing interrupted. The queued job will be recovered automatically.",
          );
      })
      .finally(() => {
        processing.current = false;
        if (version === generation.current) setProcessingJobId(null);
      });
  }, [jobs, approvedUser, userId, blocked]);

  async function sendUpload(item: Upload, version: number) {
    function update(patch: Partial<Upload>) {
      if (version === generation.current)
        setUploads((current) =>
          current.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
        );
    }
    try {
      const incoming = await uploadScan(item.file, item.id, (progress) => update({ progress }));
      if (version !== generation.current) return;
      mergeJobs(incoming);
      setSelected(incoming[0]?.id ?? null);
      update({ progress: 100, jobId: incoming[0]?.id ?? null, error: null });
    } catch (err: unknown) {
      update({ error: err instanceof Error ? err.message : "Could not upload screenshot." });
    }
  }
  async function selectFiles(list: FileList | null) {
    if (!list || uploadingRef.current || blocked) return;
    const files = Array.from(list);
    if (!files.length) return;
    if (files.length > MAX_SCAN_FILES) {
      setError("Select up to 5 screenshots at a time.");
      return;
    }
    if (!balance || approvedUser !== userId) {
      setError("You need an available credit to upload.");
      return;
    }
    const version = generation.current;
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    const next = files.map((file): Upload => {
      const valid = isScanMediaType(file.type) && file.size > 0 && file.size <= MAX_SCAN_BYTES;
      const preview = valid ? URL.createObjectURL(file) : "";
      if (preview) previewUrls.current.push(preview);
      return {
        id: crypto.randomUUID(),
        file,
        preview,
        progress: 0,
        jobId: null,
        error: valid ? null : "Use PNG, JPEG, or WebP, up to 3 MB per image.",
      };
    });
    setUploads(next);
    setError(null);
    setUploading(true);
    uploadingRef.current = true;
    try {
      for (const item of next) {
        if (version !== generation.current) break;
        if (!item.error) await sendUpload(item, version);
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }
  async function retryUpload(item: Upload) {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    try {
      await sendUpload(item, generation.current);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }
  if (isPending || !userId || approvedUser !== userId || blocked)
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
          <SignalLoading label="Checking scanner access" />
        )}
      </main>
    );
  const activeJob = jobs.find((job) => job.id === selected);
  return (
    <main className="virtual-shop scanner-page">
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
        <div className="virtual-shop-wallet">
          <Coins size={26} className="text-red-400" aria-hidden />
          <div>
            <span className="virtual-shop-label">YOUR SCAN CREDITS</span>
            <strong>{balance} credits</strong>
          </div>
          <span className="virtual-shop-wallet-note">
            1 successful scan / 1 credit / 2 random matches, lowest-odds picks.
            <br />
            Unusable or failed scans are not charged.
          </span>
        </div>
        <section className="scanner-panel mt-7" aria-labelledby="scanner-upload">
          <div className="scanner-upload-heading">
            <span className="scanner-step-number">01</span>
            <div>
              <h2 id="scanner-upload" className="text-xl font-black">
                Upload screenshots
              </h2>
            </div>
            <span className="scanner-auto-tag">AUTO SCAN</span>
          </div>
          <label
            htmlFor="sporty-screenshot"
            className={`scanner-dropzone scanner-dropzone-reference mt-4 ${uploading || balance === 0 ? "is-disabled" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void selectFiles(event.dataTransfer.files);
            }}
          >
            <div className="scanner-upload-icon">
              <Camera size={46} strokeWidth={1.5} aria-hidden />
            </div>
            <span className="scanner-dropzone-title">
              {uploading ? "Uploading screenshots..." : "Upload SportyBet Screenshot"}
            </span>
            <span className="scanner-dropzone-subtitle">
              Tap to select or drag &amp; drop your image
            </span>
            <input
              id="sporty-screenshot"
              ref={fileInput}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading || balance === 0}
              className="scanner-file-input"
              aria-label="Upload SportyBet Instant Football screenshots"
              onChange={(event) => {
                void selectFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <p className="mt-3 text-xs text-white/55">
              Up to 5 images / 3 MB each / PNG, JPEG or WebP
            </p>
          </label>
          <p className="mt-4 text-xs leading-relaxed text-white/55">
            Instant Football only. Crop personal details; screenshots are sent to AI for processing.
          </p>
          {uploads.length ? (
            <ul className="scanner-uploads mt-5" aria-live="polite">
              {uploads.map((item) => {
                const job = jobs.find((row) => row.id === item.jobId);
                const scanning =
                  !!job &&
                  !isTerminal(job.status) &&
                  (job.status === "processing" || processingJobId === job.id);
                return (
                  <li
                    className={`scanner-fixture scanner-upload-card ${scanning ? "is-scanning" : ""}`}
                    key={item.id}
                  >
                    {item.preview ? (
                      <div className="scanner-image-stage">
                        <img
                          src={item.preview}
                          alt={`Preview: ${item.file.name}`}
                          className="h-44 w-full object-contain"
                        />
                        {scanning ? <div className="scanner-beam" aria-hidden /> : null}
                        {job?.status === "completed" ? (
                          <span className="scanner-image-complete">
                            <CheckCircle2 size={16} aria-hidden /> Complete
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="break-all text-xs font-bold">{item.file.name}</p>
                    <progress
                      max="100"
                      value={item.progress}
                      className="mt-3 w-full accent-red-500"
                      aria-label={`Upload progress for ${item.file.name}`}
                    />
                    <p className="scanner-upload-status">
                      {scanning ? (
                        <LoaderCircle size={13} className="animate-spin" aria-hidden />
                      ) : null}
                      {scanning
                        ? "Analyzing screenshot..."
                        : job
                          ? job.status.replace("_", " ")
                          : item.progress === 100 && !item.error
                            ? "Upload sent. Validating image..."
                            : `${item.progress}% uploaded`}
                    </p>
                    {item.error ? (
                      <>
                        <p role="alert" className="mt-2 text-xs text-red-300">
                          {item.error}
                        </p>
                        {item.preview ? (
                          <button
                            disabled={uploading}
                            type="button"
                            className="mt-2 text-xs underline"
                            onClick={() => void retryUpload(item)}
                          >
                            Retry same upload
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {job ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-bold text-red-300 underline"
                        onClick={() => setSelected(job.id)}
                      >
                        View scan
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <button
            type="button"
            disabled={uploading || balance === 0}
            data-no-cursor-lift
            className="no-button-attention scanner-primary mt-5"
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <LoaderCircle size={18} className="animate-spin" aria-hidden />
            ) : (
              <ImagePlus size={18} aria-hidden />
            )}
            {uploading ? "Uploading..." : "Scan another screenshot"}
          </button>
        </section>
        {error ? (
          <div role="alert" className="scanner-notice mt-5">
            <p>{error}</p>
            <button
              type="button"
              className="mt-2 underline"
              onClick={() => {
                setError(null);
                window.location.reload();
              }}
            >
              Refresh scanner
            </button>
          </div>
        ) : null}
        <div className="scanner-results-layout mt-7">
          {activeJob ? (
            <ScanResults
              job={activeJob}
              working={processingJobId === activeJob.id && !isTerminal(activeJob.status)}
            />
          ) : (
            <div className="scanner-panel scanner-results-empty">
              <ScanLine size={32} aria-hidden />
              <h2>Your scan results</h2>
              <p>Your results will appear here, directly below your screenshot.</p>
            </div>
          )}
        </div>
        {balance === 0 ? (
          <footer className="scanner-credit-footer" aria-label="Buy more scan credits">
            <Coins size={32} aria-hidden />
            <h2>No credits remaining</h2>
            <p>Get more credits to scan another screenshot.</p>
            <Link to="/virtual-packages" className="scanner-primary">
              Buy more credits
            </Link>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
