import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PREDICTOR_URL, clearSession, readSession, sessionLeft } from "@/lib/desk-session";
import { confirmedDeskLogin, getSportyLink } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { openTask } from "@/lib/task-order";
import { connectionWaitSeconds } from "@/lib/session-connection";

export const Route = createFileRoute("/session")({
  component: SessionPage,
});

function SessionPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? "";
  const devFallback = user?.isDevFallback === true;
  const [left, setLeft] = useState<number | null>(null);
  const [mins, setMins] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [desk, setDesk] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    let stop = false;
    setAllowed(false);
    void getSportyLink().then((link) => {
      if (stop) return;
      if (!link.signedIn || !link.linked || !link.activated || devFallback) {
        void openTask(navigate, link);
        return;
      }
      setAllowed(true);
    }).catch((err: unknown) => {
      if (!stop) setError(err instanceof Error ? err.message : "Could not check account activation. Reload to retry.");
    });
    return () => { stop = true; };
  }, [isPending, userId, devFallback, navigate]);

  useEffect(() => {
    if (!allowed) return;
    let cancel = false;
    let timer = 0;
    const look = () => {
      void confirmedDeskLogin()
        .then((row) => {
          if (cancel) return;
          if (row.pass) {
            setDesk(
              `${PREDICTOR_URL}?pass=${encodeURIComponent(row.pass)}&login=${encodeURIComponent(row.login)}`,
            );
            return;
          }
          setDesk((current) => current ?? PREDICTOR_URL);
          timer = window.setTimeout(look, 4000);
        })
        .catch(() => {
          if (cancel) return;
          setDesk((current) => current ?? PREDICTOR_URL);
          timer = window.setTimeout(look, 4000);
        });
    };
    look();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [allowed]);

  useEffect(() => {
    if (isPending || !allowed) return;
    const tick = () => {
      const session = readSession();
      const ms = sessionLeft();
      if (!session || ms <= 0) {
        clearSession();
        if (!userId || devFallback) {
          void navigate({ to: "/" });
          return;
        }
        void getSportyLink().then((link) => {
          if (!link.signedIn) {
            void navigate({ to: "/" });
            return;
          }
          void openTask(navigate, link);
        });
        return;
      }
      setMins(session.mins);
      setLeft(ms);
      setElapsedMs(Math.max(0, session.mins * 60 * 1000 - ms));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [navigate, isPending, userId, devFallback, allowed]);

  if (error) return <main className="grid min-h-dvh place-items-center bg-ink px-5 text-white"><p role="alert">{error}</p></main>;
  if (!allowed) return null;
  if (left == null) return null;
  const total = Math.ceil(left / 1000);
  const clock = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  const issueWaitSeconds = connectionWaitSeconds(mins, elapsedMs, user?.primaryEmail);

  return (
    <main className="flex h-dvh flex-col bg-ink text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <p className="text-xs font-extrabold tracking-[0.16em]">SESSION</p>
        <p className="text-sm text-white/60">{mins} mins</p>
        <p className={"font-mono text-xl font-black " + (total <= 30 ? "text-red" : "text-[#3dde6a]")}>{clock}</p>
      </div>
      {desk ? (
        <iframe title="Aviator Predictor" src={desk} className="min-h-0 w-full flex-1 border-0 bg-white" />
      ) : (
        <div className="min-h-0 w-full flex-1 bg-white" />
      )}
      {issueWaitSeconds != null ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-5"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="connection-issue-title"
          aria-describedby="connection-issue-message"
        >
            <section className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#121214] px-6 py-7 text-center shadow-2xl">
            <p className="text-xs font-extrabold tracking-[0.2em] text-[#e50914]">CONNECTION STATUS</p>
            <h1 id="connection-issue-title" className="mt-3 text-2xl font-extrabold">
              Connection issue
            </h1>
            <p id="connection-issue-message" className="mt-2 text-sm leading-relaxed text-white/70">
              We're reconnecting your phone to the server. Check your internet connections.
            </p>
            <p className="mt-5 text-xs text-white/50">Returning to your session automatically</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
