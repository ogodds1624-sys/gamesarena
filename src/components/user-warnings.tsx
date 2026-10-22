import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  listUserWarnings,
  sendUserWarning,
  removeUserWarning,
  getMyWarnings,
  acknowledgeWarning,
  type UserWarning,
} from "@/lib/user-warnings";

export function WarningDesk() {
  const [rows, setRows] = useState<UserWarning[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => {
      void listUserWarnings()
        .then((next) => {
          if (active) {
            setRows(next);
            setError("");
          }
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : "Could not load warnings.");
        });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      setRows(await listUserWarnings());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update warnings.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await sendUserWarning({ data: { email, message } });
      setMessage("");
    }, "Warning sent. The user will see it when signed in.");
  }

  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#111111] p-4">
      <h2 className="text-2xl font-black">User warnings</h2>
      <p className="mt-2 text-sm text-white/60">
        Send an in-app warning without blocking the account.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        <label className="text-sm font-bold">
          User email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@email.com"
            className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-ink px-3"
          />
        </label>
        <label className="text-sm font-bold">
          Warning message
          <textarea
            required
            maxLength={1000}
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Explain the issue and what the user should do."
            className="mt-2 w-full rounded-xl border border-white/15 bg-ink p-3"
          />
        </label>
        <button
          disabled={busy || !email.trim() || !message.trim()}
          className="h-12 rounded-xl bg-red px-4 font-extrabold disabled:opacity-60"
        >
          {busy ? "SAVING..." : "SEND WARNING"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-white/80">
          {notice}
        </p>
      ) : null}
      <h3 className="mt-6 font-bold">Recent warnings (up to 100)</h3>
      {!rows.length ? <p className="mt-3 text-sm text-white/60">No warnings to display.</p> : null}
      <ul className="mt-3 grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-white/15 p-3">
            <p className="break-words font-bold">{row.email}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.message}</p>
            <p className="mt-2 text-xs text-white/60">
              Sent {new Date(row.createdAt).toLocaleString()} ·{" "}
              {row.acknowledgedAt
                ? `Acknowledged ${new Date(row.acknowledgedAt).toLocaleString()}`
                : "Awaiting acknowledgement"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => removeUserWarning({ data: { id: row.id } }), "Warning removed.")
              }
              className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              REMOVE WARNING
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UserWarnings() {
  const { user, isPending } = useCurrentUserState();
  const userId = user && !user.isDevFallback ? user.id : "";
  const [state, setState] = useState<{ userId: string; rows: { id: string; message: string }[] }>({
    userId: "",
    rows: [],
  });
  const [failure, setFailure] = useState({ userId: "", message: "" });
  const revision = useRef(0);
  const error = failure.userId === userId ? failure.message : "";
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isPending || !userId) return;
    let active = true;
    const load = () => {
      const request = ++revision.current;
      void getMyWarnings()
        .then((rows) => {
          if (active && request === revision.current) {
            setState({ userId, rows });
            setFailure({ userId, message: "" });
          }
        })
        .catch((cause: unknown) => {
          if (active && request === revision.current) {
            console.error("Could not load account warnings.", cause);
            setFailure({
              userId,
              message: "Could not load account notices. Please refresh to retry.",
            });
          }
        });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [userId, isPending]);
  const warning = state.userId === userId ? state.rows[0] : undefined;
  if (!userId || (!warning && !error)) return null;
  return (
    <aside
      aria-label="Account warning"
      className="relative z-40 border-b border-red/60 bg-[#211012] px-4 py-4 text-white"
    >
      {warning ? (
        <>
          <h2 className="font-extrabold">Warning from Games Hub</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{warning.message}</p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-xl bg-red px-4 py-2 text-sm font-bold disabled:opacity-60"
            onClick={async () => {
              setBusy(true);
              ++revision.current;
              setFailure({ userId, message: "" });
              try {
                await acknowledgeWarning({ data: { id: warning.id } });
                ++revision.current;
                setState((current) =>
                  current.userId === userId
                    ? { userId, rows: current.rows.filter((row) => row.id !== warning.id) }
                    : current,
                );
              } catch (cause) {
                setFailure({
                  userId,
                  message:
                    cause instanceof Error ? cause.message : "Could not acknowledge warning.",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "SAVING..." : "I understand"}
          </button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
