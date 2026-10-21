import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignalLoading } from "@/components/signal-loading";
import { getPaymentStatus, getSportyLink } from "@/lib/admin-snapshot";
import { openTask } from "@/lib/task-order";
import { clearPendingPayment, confirmPendingPayment, readPendingPayment } from "@/lib/desk-session";

// Pages that run their own waiting screen.
const OWN_SCREEN = ["/pay", "/virtual-pay", "/activation", "/nigeria-pay", "/admin", "/session"];

export function PendingPaymentWatcher() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [state, setState] = useState<"none" | "pending">("none");
  const [error, setError] = useState<string | null>(null);
  const skip = OWN_SCREEN.includes(path);

  useEffect(() => {
    if (skip) {
      setState("none");
      setError(null);
      return;
    }
    let stop = false;

    function finish(rejected: boolean, savedPurpose: string) {
      clearPendingPayment();
      setState("none");
      if (savedPurpose === "virtual_credits") {
        if (rejected) void navigate({ to: "/virtual-packages" });
        else void navigate({ to: "/virtual-scan" });
      } else if (rejected) {
        void navigate({ to: "/packages", search: { rejected: 1 }, viewTransition: false });
      } else {
        void navigate({ to: "/session" });
      }
    }

    function check() {
      const saved = readPendingPayment();
      if (!saved) {
        if (!stop) setState("none");
        return;
      }
      void getPaymentStatus({ data: { id: saved.id } })
        .then((row) => {
          if (stop) return;
          setError(null);
          if (row.purpose === "activation" && row.status !== "pending") {
            window.clearInterval(poll);
            clearPendingPayment();
            setState("none");
            if (row.status === "rejected") void navigate({ to: "/activation" });
            else
              void getSportyLink()
                .then((link) => openTask(navigate, link))
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not open packages. Reload to continue.",
                  );
                });
            return;
          }
          if (row.status === "rejected") {
            window.clearInterval(poll);
            finish(true, row.purpose);
          } else if (row.status === "confirmed") {
            window.clearInterval(poll);
            if (row.purpose !== "virtual_credits") {
              confirmPendingPayment(saved.id, row.amount, row.minutes);
            }
            finish(false, row.purpose);
          } else {
            setState("pending");
          }
        })
        .catch((err: unknown) => {
          if (!stop)
            setError(
              err instanceof Error ? err.message : "Could not check payment approval. Retrying.",
            );
          if (!stop && readPendingPayment()) setState("pending");
        });
    }

    const poll = window.setInterval(check, 3000);
    check();
    return () => {
      stop = true;
      window.clearInterval(poll);
    };
  }, [skip, navigate]);

  if (state === "none" && !error) return null;
  return (
    <>
      {state !== "none" ? <SignalLoading label="waiting for confirmation" /> : null}
      {error ? (
        <p role="alert" className="fixed bottom-6 z-50 px-4 text-sm text-red">
          {error}
        </p>
      ) : null}
    </>
  );
}
