export const PREDICTOR_URL = "https://baker-king-acre-ivory.grok.me";
const KEY = "aviator-session";

export const NGN_PER_GHS = 119.96;
export const NAIRA_AMOUNTS = [6000, 6655, 7000, 41986, 95968, 203932, 35000, 55000, 75000] as const;

export function isNairaAmount(amount: number) {
  return (NAIRA_AMOUNTS as readonly number[]).includes(amount);
}

export function startSession(mins: number) {
  if (!Number.isInteger(mins) || mins < 1 || mins > 1440)
    throw new Error("The purchased session duration is invalid.");
  const endsAt = Date.now() + mins * 60 * 1000;
  window.localStorage.setItem(KEY, JSON.stringify({ endsAt, mins }));
}

export function readSession() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { endsAt?: number; mins?: number };
    if (!Number.isFinite(data.endsAt)) return null;
    return { endsAt: data.endsAt as number, mins: Number(data.mins) || 0 };
  } catch {
    return null;
  }
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}

export function sessionLeft() {
  const session = readSession();
  if (!session) return 0;
  return Math.max(0, session.endsAt - Date.now());
}

const PENDING_KEY = "casino-pending-payment";

// Remembers a payment that is waiting for admin approval so a reload keeps the waiting screen.
export function savePendingPayment(
  id: string,
  amount: number,
  purpose: "session" | "activation" | "virtual_credits" = "session",
) {
  window.localStorage.setItem(PENDING_KEY, JSON.stringify({ id, amount, purpose }));
}

export function readPendingPayment() {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      id?: unknown;
      amount?: unknown;
      readyAt?: unknown;
      purpose?: unknown;
    };
    if (typeof data.id !== "string" || !Number.isFinite(data.amount)) return null;
    const purpose =
      data.purpose === "activation" || data.purpose === "virtual_credits"
        ? data.purpose
        : "session";
    return {
      id: data.id,
      amount: data.amount as number,
      readyAt: typeof data.readyAt === "number" ? data.readyAt : null,
      purpose,
    };
  } catch {
    return null;
  }
}

export function clearPendingPayment() {
  window.localStorage.removeItem(PENDING_KEY);
}

// Starts the purchased session once and records approval without adding a post-payment delay.
export function confirmPendingPayment(id: string, amount: number, minutes: number | null) {
  if (minutes == null) throw new Error("The purchased session duration is missing.");
  const saved = readPendingPayment();
  const matchingPayment = saved?.id === id;
  if (!matchingPayment || saved.readyAt == null) {
    startSession(minutes);
  }
  window.localStorage.setItem(PENDING_KEY, JSON.stringify({ id, amount, readyAt: Date.now() }));
}
