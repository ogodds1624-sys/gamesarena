import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Ban,
  Check,
  Diamond,
  Eye,
  EyeOff,
  Hexagon,
  LayoutGrid,
  List,
  Lock,
  RefreshCw,
  RotateCcw,
  Wallet,
} from "lucide-react";
import {
  addPartner,
  blockUser,
  unblockUser,
  confirmPayment,
  checkAdminSession,
  deletePartner,
  deleteTestimony,
  dayKeyInZone,
  GHANA_BANKS,
  getAdminSnapshot,
  getPaymentProof,
  GHANA_MOMO_NETWORKS,
  GHANA_TZ,
  liveDayLabel,
  isNairaPayment,
  NIGERIA_TZ,
  shiftDayKey,
  rejectPayment,
  setPartnerPayoutStatus,
  saveGatewayCheckout,
  saveGatewayRates,
  setPartnerCommission,
  setPartnerLock,
  setTestimonyStatus,
  verifyAdminPasscode,
  type AdminSnapshot,
  type AdminTestimony,
  type BankAccount,
  type PartnerPayout,
  type GatewayCheckout,
  type GatewaySettings,
  type MomoWallet,
} from "@/lib/admin-snapshot";
import { bumpGateway } from "@/lib/storefront-live";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { AdminPricing } from "@/components/admin-pricing";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const NAV = [
  { id: "overview", label: "OVERVIEW", icon: LayoutGrid },
  { id: "members", label: "MEMBERS", icon: List },
  { id: "transactions", label: "TRANSACTIONS", icon: ArrowLeftRight },
  { id: "partners", label: "PARTNERS", icon: Hexagon },
  { id: "payouts", label: "PARTNER PAYOUTS", icon: Wallet },
  { id: "block", label: "BLOCK", icon: Ban },
  { id: "gateway", label: "PAYMENT GATEWAY", icon: Wallet },
  { id: "pricing", label: "PRICING & PACKAGES", icon: Wallet },
] as const;

type Tab = (typeof NAV)[number]["id"];

function moneyLabel(amount: number, country?: string | null) {
  return isNairaPayment(amount, country)
    ? `₦${amount.toLocaleString("en-NG")}`
    : `GHS ${amount.toLocaleString("en-GH")}`;
}

function GhanaFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" aria-hidden>
      <rect width="24" height="5.34" fill="#ce1126" />
      <rect y="5.33" width="24" height="5.34" fill="#fcd116" />
      <rect y="10.66" width="24" height="5.34" fill="#006b3f" />
      <polygon
        points="12,6.2 12.7,8.2 14.8,8.2 13.1,9.4 13.8,11.4 12,10.2 10.2,11.4 10.9,9.4 9.2,8.2 11.3,8.2"
        fill="#000"
      />
    </svg>
  );
}

function NigeriaFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" aria-hidden>
      <rect width="8" height="16" fill="#008751" />
      <rect x="8" width="8" height="16" fill="#fff" />
      <rect x="16" width="8" height="16" fill="#008751" />
    </svg>
  );
}

function rateFields(gateway: GatewaySettings) {
  return {
    nigeria: gateway.nigeria ? String(gateway.nigeria) : "",
    kenya: gateway.kenya ? String(gateway.kenya) : "",
    tanzania: gateway.tanzania ? String(gateway.tanzania) : "",
    zambia: gateway.zambia ? String(gateway.zambia) : "",
    southAfrica: gateway.southAfrica ? String(gateway.southAfrica) : "",
  };
}

const EMPTY_CHECKOUT: GatewayCheckout = {
  currency: "GHS",
  businessName: "Games Hub",
  whatsapp: "",
  email: "",
  paystack: false,
  flutterwave: false,
  royaltech: false,
  cowrie: false,
  momo: false,
  bank: false,
  nigeriaOn: false,
  nigeriaBanks: [],
  wallets: [],
  banks: [],
};

const EMPTY_SNAPSHOT: AdminSnapshot = {
  pricing: DEFAULT_PRICING,
  members: [],
  payments: [],
  partners: [],
  payouts: [],
  testimonies: [],
  blocked: [],
  total: 0,
  today: 0,
  revenue: 0,
  confirmed: 0,
  gateway: {
    scansRemaining: 0,
    scansUsed: 0,
    nigeria: 0,
    kenya: 0,
    tanzania: 0,
    zambia: 0,
    southAfrica: 0,
    checkout: EMPTY_CHECKOUT,
  },
};

const memberCols = "member-row desk-row grid-cols-[minmax(0,1.4fr)_5.5rem_7.5rem_9rem]";
const txCols =
  "tx-row desk-row grid-cols-[6.5rem_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_8.5rem_7.5rem]";

function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [spinning, setSpinning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [partnerNotice, setPartnerNotice] = useState<string | null>(null);
  const knownPayments = useRef<Set<string> | null>(null);
  const knownPartners = useRef<Set<string> | null>(null);
  const title = NAV.find((item) => item.id === tab)?.label ?? "OVERVIEW";

  const passTyped = useRef(false);

  useEffect(() => {
    let live = true;
    void checkAdminSession()
      .then(({ authenticated }) => {
        if (live) setUnlocked(authenticated);
      })
      .catch((error: unknown) => {
        console.error("Unable to check the admin session.", error);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    passTyped.current = false;
    setCode("");
    const wipe = () => {
      if (passTyped.current) return;
      const input = document.getElementById("admin-pass");
      if (input instanceof HTMLInputElement) input.value = "";
      setCode("");
    };
    wipe();
    const soon = window.setTimeout(wipe, 0);
    const later = window.setTimeout(wipe, 400);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(later);
    };
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    let live = true;
    const load = () => {
      void getAdminSnapshot()
        .then((data) => {
          if (!live) return;
          const pending = data.payments.filter((payment) => payment.status === "pending");
          if (knownPayments.current) {
            const fresh = pending.filter((payment) => !knownPayments.current?.has(payment.id));
            if (fresh.length > 0) {
              const latest = fresh[0];
              const who = latest.memberName ?? (latest.payerName || "A player");
              const text =
                fresh.length === 1
                  ? `${who} sent ${moneyLabel(latest.amount, latest.country)}`
                  : `${fresh.length} new payments · ${who} sent ${moneyLabel(latest.amount, latest.country)}`;
              setNotice(text);
              window.localStorage.setItem("aviator-tx-notice", text);
            }
          } else {
            const saved = window.localStorage.getItem("aviator-tx-notice");
            if (saved) setNotice(saved);
          }
          knownPayments.current = new Set(data.payments.map((payment) => payment.id));
          const waitingPartners = data.partners.filter((partner) => partner.status === "pending");
          if (knownPartners.current) {
            const freshPartners = waitingPartners.filter(
              (partner) => !knownPartners.current?.has(partner.id),
            );
            if (freshPartners.length > 0) {
              setPartnerNotice(`${freshPartners[0].name} applied as a partner`);
            }
          }
          knownPartners.current = new Set(data.partners.map((partner) => partner.id));
          setSnapshot(data);
        })
        .catch((error: unknown) => {
          if (!live) return;
          if (error instanceof Error && error.message === "Unauthorized") {
            setUnlocked(false);
            return;
          }
          console.error("Unable to load admin data.", error);
        });
    };
    load();
    const id = window.setInterval(load, 3000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [unlocked]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await verifyAdminPasscode({ data: { passcode: code } });
      if (result.authenticated) {
        setCode("");
        setShowCode(false);
        setUnlocked(true);
        setDenied(false);
        return;
      }
      setDenied(true);
    } catch (error) {
      console.error("Admin sign-in failed.", error);
      setLoginError(error instanceof Error ? error.message : "Unable to verify admin access.");
    }
  }

  async function refresh() {
    setSpinning(true);
    try {
      setSnapshot(await getAdminSnapshot());
    } finally {
      setSpinning(false);
    }
  }

  async function confirm(id: string) {
    setSpinning(true);
    try {
      setSnapshot(await confirmPayment({ data: { id } }));
    } finally {
      setSpinning(false);
    }
  }

  async function reject(id: string) {
    setSpinning(true);
    try {
      setSnapshot(await rejectPayment({ data: { id } }));
    } finally {
      setSpinning(false);
    }
  }

  const view = snapshot ?? EMPTY_SNAPSHOT;
  const now = new Date();
  const ghanaToday = dayKeyInZone(now, GHANA_TZ);
  const nigeriaToday = dayKeyInZone(now, NIGERIA_TZ);
  const confirmed = view.payments.filter(
    (payment) => payment.status === "confirmed" && payment.countsRevenue,
  );
  const onDay = (iso: string, key: string, timeZone: string) =>
    Boolean(iso) && dayKeyInZone(iso, timeZone) === key;
  const ghanaPayments = confirmed.filter(
    (payment) => !isNairaPayment(payment.amount, payment.country),
  );
  const nigeriaPayments = confirmed.filter((payment) =>
    isNairaPayment(payment.amount, payment.country),
  );
  const ghanaRevenue = ghanaPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const nigeriaRevenue = nigeriaPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const ghanaDaily = ghanaPayments
    .filter((payment) => onDay(payment.confirmedAt, ghanaToday, GHANA_TZ))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const nigeriaDaily = nigeriaPayments
    .filter((payment) => onDay(payment.confirmedAt, nigeriaToday, NIGERIA_TZ))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const pendingCount = view.payments.filter((payment) => payment.status === "pending").length;
  const partnerWait = view.partners.filter((partner) => partner.status === "pending").length;

  function openTab(next: Tab) {
    setTab(next);
    if (next === "transactions") {
      setNotice(null);
      window.localStorage.removeItem("aviator-tx-notice");
    }
    if (next === "partners") setPartnerNotice(null);
  }

  if (!unlocked) {
    return (
      <main className="home-theme relative flex min-h-dvh items-center justify-center px-4 py-10 text-white">
        <form
          autoComplete="off"
          onSubmit={unlock}
          className="menu-pop relative z-10 w-full max-w-md rounded-[28px] border border-white/10 bg-[#111111] px-6 py-8 text-center shadow-[0_20px_60px_rgba(226,59,59,0.18)]"
        >
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-red/40 bg-red/15">
            <Lock className="size-7 text-gold" aria-hidden />
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight">Admin Access</h1>
          <p className="mt-2 text-sm font-semibold text-[#9aa3b2]">Enter your admin passcode.</p>
          {loginError || denied ? (
            <p className="mt-5 rounded-2xl border border-red/40 bg-red/15 px-4 py-3 text-sm font-bold text-red">
              {loginError || "Wrong passcode."}
            </p>
          ) : null}
          <label htmlFor="admin-pass" className="sr-only">
            Passcode
          </label>
          <div
            className={
              "mt-5 flex h-14 items-center rounded-2xl border bg-ink px-4 " +
              (denied ? "border-red" : "border-white/15 focus-within:border-red")
            }
          >
            <input
              id="admin-pass"
              name="admin-gate"
              value={code}
              onChange={(event) => {
                passTyped.current = true;
                setCode(event.target.value);
                setDenied(false);
                setLoginError("");
              }}
              type={showCode ? "text" : "password"}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              readOnly
              onFocus={(event) => event.currentTarget.removeAttribute("readonly")}
              placeholder="Passcode"
              className="h-full min-w-0 flex-1 bg-transparent text-left text-base tracking-[0.2em] text-white outline-none placeholder:tracking-normal placeholder:text-[#8b95a7]"
            />
            <button
              type="button"
              onClick={() => setShowCode((open) => !open)}
              className="grid size-8 shrink-0 place-items-center text-gold"
              aria-label={showCode ? "Hide passcode" : "Show passcode"}
            >
              {showCode ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          <button
            type="submit"
            className="mt-5 h-14 w-full rounded-2xl bg-red text-sm font-extrabold tracking-[0.22em] text-white"
          >
            SIGN IN
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="home-theme admin-desk desk-shell text-white">
      <aside className="admin-side border-r border-white/10 bg-transparent px-4 py-6 text-white">
        <div className="flex items-start justify-between gap-2 px-2">
          <div className="flex items-start gap-2">
            <Diamond className="mt-1 size-4 shrink-0 fill-red text-red" aria-hidden />
            <span className="text-xl leading-tight font-black tracking-tight">Games Hub</span>
          </div>
          <span className="rounded-full border border-red px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-red">
            ADMIN
          </span>
        </div>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            const count =
              item.id === "transactions"
                ? pendingCount
                : item.id === "partners"
                  ? partnerWait
                  : item.id === "payouts"
                    ? view.payouts.filter((payout) => payout.status === "pending").length
                    : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openTab(item.id)}
                className={
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-extrabold tracking-wide " +
                  (active ? "bg-red text-white" : "text-[#6b7280]")
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{item.label}</span>
                {count > 0 ? (
                  <span className="grid min-w-5 place-items-center rounded-full bg-white px-1.5 text-[10px] font-black text-red">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        <header className="admin-mobile-nav border-b border-white/10 bg-ink">
          <div className="flex items-center gap-3 px-4 py-3">
            <Diamond className="size-4 shrink-0 fill-red text-red" aria-hidden />
            <span className="truncate text-lg font-black tracking-tight">Games Hub</span>
            <span className="rounded-full border border-red px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-red">
              ADMIN
            </span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {NAV.map((item) => {
              const active = tab === item.id;
              const count =
                item.id === "transactions"
                  ? pendingCount
                  : item.id === "partners"
                    ? partnerWait
                    : item.id === "payouts"
                      ? view.payouts.filter((payout) => payout.status === "pending").length
                      : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTab(item.id)}
                  className={
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold tracking-wide " +
                    (active ? "bg-red text-white" : "text-[#9aa3b2]")
                  }
                >
                  {item.label}
                  {count > 0 ? (
                    <span className="grid min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-black text-red">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </header>
        <div className="admin-content">
          <p className="flex items-center gap-2 text-xs font-extrabold tracking-[0.16em] text-red">
            <Diamond className="size-3 fill-red" aria-hidden />
            CONTROL ROOM
          </p>
          <div className="admin-title mt-2">
            <h1 className="font-black tracking-tight capitalize">
              {tab === "overview"
                ? "Overview"
                : tab === "transactions"
                  ? "Transaction History"
                  : title.toLowerCase()}
            </h1>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 text-xs font-extrabold tracking-wide text-white"
            >
              <RefreshCw className={"size-4 " + (spinning ? "animate-spin" : "")} aria-hidden />
              REFRESH
            </button>
          </div>
          {notice ? (
            <button
              type="button"
              onClick={() => openTab("transactions")}
              className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#f3b4b4] bg-red/15 px-4 py-3 text-left text-sm font-bold"
            >
              <span>{notice}</span>
              <span className="shrink-0 text-xs font-extrabold tracking-wide text-[#ff8d8d]">
                {pendingCount} PENDING
              </span>
            </button>
          ) : null}
          {partnerWait > 0 ? (
            <button
              type="button"
              onClick={() => openTab("partners")}
              className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#f3b4b4] bg-red/15 px-4 py-3 text-left text-sm font-bold"
            >
              <span>{partnerNotice ?? "A new partner is waiting for approval"}</span>
              <span className="shrink-0 text-xs font-extrabold tracking-wide text-[#ff8d8d]">
                {partnerWait} TO APPROVE
              </span>
            </button>
          ) : null}
          {view.payouts.some((payout) => payout.status === "pending") ? (
            <button
              type="button"
              onClick={() => openTab("payouts")}
              className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#f3b4b4] bg-red/15 px-4 py-3 text-left text-sm font-bold"
            >
              <span>Partner payout requests need review</span>
              <span className="shrink-0 text-xs font-extrabold tracking-wide text-[#ff8d8d]">
                {view.payouts.filter((payout) => payout.status === "pending").length} PENDING
              </span>
            </button>
          ) : null}

          {tab === "overview" ? (
            <>
              <h2 className="mt-8 text-2xl font-black">At a glance</h2>
              <p className="mt-1 text-base text-[#8b95a7]">
                Live snapshot of accounts that connected SportyBet.
              </p>
              <div className="stat-grid mt-4">
                <StatCard
                  label="TOTAL MEMBERS"
                  value={String(view.total)}
                  note={`${view.total} connected accounts`}
                  icon={<List className="size-5" />}
                />
                <StatCard
                  label="TODAY"
                  value={String(view.today)}
                  note={`${view.today} accounts today`}
                  icon={<List className="size-5" />}
                />
              </div>
              <div className="stat-grid mt-8">
                <StatCard
                  label="DAILY GHANA"
                  value={`GHS ${ghanaDaily.toLocaleString("en-GH")}`}
                  note={`${liveDayLabel(ghanaToday, GHANA_TZ)} · resets at midnight`}
                  gold
                  icon={<GhanaFlag />}
                  iconClass="bg-white/10"
                />
                <StatCard
                  label="TOTAL GHANA"
                  value={`GHS ${ghanaRevenue.toLocaleString("en-GH")}`}
                  note="Does not reset"
                  gold
                  icon={<GhanaFlag />}
                  iconClass="bg-white/10"
                />
              </div>
              <WeekRevenue payments={view.payments} country="Ghana" />
              <div className="stat-grid mt-4">
                <StatCard
                  label="DAILY NIGERIA"
                  value={`₦${nigeriaDaily.toLocaleString("en-NG")}`}
                  note={`${liveDayLabel(nigeriaToday, NIGERIA_TZ)} · resets at midnight`}
                  icon={<NigeriaFlag />}
                  iconClass="bg-white/10"
                />
                <StatCard
                  label="TOTAL NIGERIA"
                  value={`₦${nigeriaRevenue.toLocaleString("en-NG")}`}
                  note="Does not reset"
                  icon={<NigeriaFlag />}
                  iconClass="bg-white/10"
                />
              </div>
              <WeekRevenue payments={view.payments} country="Nigeria" />
              <TestimonyDesk
                rows={view.testimonies}
                busy={spinning}
                onChange={setSnapshot}
                onBusy={setSpinning}
              />
            </>
          ) : tab === "transactions" ? (
            <TransactionHistory
              payments={view.payments}
              busy={spinning}
              onConfirm={(id) => void confirm(id)}
              onReject={(id) => void reject(id)}
            />
          ) : tab === "members" ? (
            <div className="mt-8">
              <MemberList members={view.members} />
            </div>
          ) : tab === "partners" ? (
            <PartnerDesk
              partners={view.partners}
              busy={spinning}
              onChange={setSnapshot}
              onBusy={setSpinning}
            />
          ) : tab === "payouts" ? (
            <PartnerPayoutDesk
              payouts={view.payouts}
              busy={spinning}
              onChange={setSnapshot}
              onBusy={setSpinning}
            />
          ) : tab === "block" ? (
            <BlockDesk
              rows={view.blocked}
              busy={spinning}
              onChange={setSnapshot}
              onBusy={setSpinning}
            />
          ) : tab === "pricing" ? (
            snapshot ? (
              <AdminPricing
                pricing={snapshot.pricing}
                busy={spinning}
                onChange={setSnapshot}
                onBusy={setSpinning}
              />
            ) : (
              <p className="mt-6">Loading pricing…</p>
            )
          ) : (
            <PaymentGateway
              gateway={view.gateway}
              busy={spinning}
              onChange={setSnapshot}
              onBusy={setSpinning}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function PaymentGateway({
  gateway,
  busy,
  onChange,
  onBusy,
}: {
  gateway: GatewaySettings;
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [rates, setRates] = useState(() => rateFields(gateway));
  const [error, setError] = useState<string | null>(null);
  const ratesDirty = useRef(false);
  const ratesApplied = useRef("");
  const rateKey = JSON.stringify([
    gateway.nigeria,
    gateway.kenya,
    gateway.tanzania,
    gateway.zambia,
    gateway.southAfrica,
  ]);

  useEffect(() => {
    if (ratesApplied.current === rateKey || ratesDirty.current) return;
    ratesApplied.current = rateKey;
    setRates(rateFields(gateway));
  }, [rateKey, gateway]);

  const fields = [
    ["nigeria", "NIGERIA — ₦ PER GHS"],
    ["kenya", "KENYA — KSH PER GHS"],
    ["tanzania", "TANZANIA — TSH PER GHS"],
    ["zambia", "ZAMBIA — ZK PER GHS"],
    ["southAfrica", "SOUTH AFRICA — R PER GHS"],
  ] as const;

  function editRate(key: (typeof fields)[number][0], value: string) {
    ratesDirty.current = true;
    setRates((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-3xl border border-white/10 bg-[#111111] px-4 py-5">
        <h2 className="text-lg font-black">Exchange Rates</h2>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            onBusy(true);
            void saveGatewayRates({
              data: {
                nigeria: Number(rates.nigeria),
                kenya: Number(rates.kenya),
                tanzania: Number(rates.tanzania),
                zambia: Number(rates.zambia),
                southAfrica: Number(rates.southAfrica),
              },
            })
              .then((next) => {
                ratesDirty.current = false;
                bumpGateway();
                onChange(next);
              })
              .catch((err) =>
                setError(err instanceof Error ? err.message : "Could not save rates."),
              )
              .finally(() => onBusy(false));
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[11px] font-bold tracking-[0.12em] text-[#9aa3b2]">
                  {label}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <input
                    value={rates[key]}
                    onChange={(event) => editRate(key, event.target.value)}
                    inputMode="decimal"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Reset ${label}`}
                    onClick={() => editRate(key, "")}
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 text-[#9aa3b2]"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                  </button>
                </span>
              </label>
            ))}
          </div>
          {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 h-11 rounded-lg bg-red px-5 text-sm font-extrabold tracking-wide text-white disabled:opacity-60"
          >
            SAVE RATES
          </button>
        </form>
      </section>
      <CheckoutSettings gateway={gateway} busy={busy} onChange={onChange} onBusy={onBusy} />
    </div>
  );
}

function hasCheckoutSettings(form: GatewayCheckout) {
  const text = (value: string) => value.trim().length > 0;
  const account = (row: BankAccount) => text(row.bank) || text(row.number) || text(row.name);
  return (
    text(form.whatsapp) ||
    text(form.email) ||
    form.wallets.some((wallet) => text(wallet.number) || text(wallet.name)) ||
    form.banks.some(account) ||
    form.nigeriaBanks.some(account)
  );
}

function CheckoutSettings({
  gateway,
  busy,
  onChange,
  onBusy,
}: {
  gateway: GatewaySettings;
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [form, setForm] = useState<GatewayCheckout>(gateway.checkout);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(0);
  const dirty = useRef(false);
  const applied = useRef("");
  const checkoutKey = JSON.stringify(gateway.checkout);
  const checkoutRef = useRef(gateway.checkout);
  checkoutRef.current = gateway.checkout;

  useEffect(() => {
    // The desk reloads the snapshot every few seconds. Copy it in only when
    // the saved checkout actually changed and the admin is not mid-edit.
    if (applied.current === checkoutKey || dirty.current) return;
    applied.current = checkoutKey;
    setForm(checkoutRef.current);
  }, [checkoutKey]);

  function update(recipe: (current: GatewayCheckout) => GatewayCheckout) {
    dirty.current = true;
    setForm((current) => recipe(current));
  }

  function patchList<T>(
    key: "wallets" | "banks" | "nigeriaBanks",
    index: number,
    patch: Partial<T>,
  ) {
    update((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#111111] px-4 py-5">
      <h2 className="text-lg font-black">Checkout</h2>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasCheckoutSettings(form)) return;
          if (
            form.wallets.some(
              (wallet) => (wallet.number.trim() || wallet.name.trim()) && !wallet.network,
            )
          ) {
            setError("Choose a network for each Ghana MoMo wallet.");
            return;
          }
          if (
            form.banks.some(
              (account) => (account.number.trim() || account.name.trim()) && !account.bank,
            )
          ) {
            setError("Choose a bank for each Ghana bank account.");
            return;
          }
          setError(null);
          onBusy(true);
          void saveGatewayCheckout({ data: form })
            .then((next) => {
              dirty.current = false;
              bumpGateway();
              onChange(next);
              setSaved(true);
              window.clearTimeout(savedTimer.current);
              savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
            })
            .catch((err) =>
              setError(err instanceof Error ? err.message : "Could not save checkout."),
            )
            .finally(() => onBusy(false));
        }}
      >
        <label className="block">
          <span className="text-[11px] font-bold tracking-[0.14em] text-[#9aa3b2]">
            BUSINESS / DISPLAY NAME
          </span>
          <input
            value={form.businessName}
            onChange={(event) =>
              update((current) => ({ ...current, businessName: event.target.value }))
            }
            className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-[0.14em] text-[#9aa3b2]">
            WHATSAPP SUPPORT NUMBER
          </span>
          <input
            value={form.whatsapp}
            onChange={(event) =>
              update((current) => ({ ...current, whatsapp: event.target.value }))
            }
            className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold tracking-[0.14em] text-[#9aa3b2]">
            SUPPORT EMAIL
          </span>
          <input
            value={form.email}
            onChange={(event) => update((current) => ({ ...current, email: event.target.value }))}
            className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
        </label>
        <Toggle
          label="Ghana MoMo"
          on={form.momo}
          onClick={() => update((current) => ({ ...current, momo: !current.momo }))}
        />
        {form.wallets.map((wallet, index) => (
          <div key={`wallet-${index}`} className="grid gap-2 md:grid-cols-3">
            <select
              value={wallet.network}
              onChange={(event) => {
                const network =
                  GHANA_MOMO_NETWORKS.find((option) => option.value === event.target.value)
                    ?.value ?? "";
                patchList<MomoWallet>("wallets", index, { network });
              }}
              className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
            >
              <option value="">Select network</option>
              {GHANA_MOMO_NETWORKS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={wallet.number}
              onChange={(event) =>
                patchList<MomoWallet>("wallets", index, { number: event.target.value })
              }
              placeholder="Number"
              className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
            />
            <input
              value={wallet.name}
              onChange={(event) =>
                patchList<MomoWallet>("wallets", index, { name: event.target.value })
              }
              placeholder="Name"
              className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update((current) => ({
              ...current,
              wallets: [...current.wallets, { network: "", number: "", name: "" }],
            }))
          }
          className="h-10 w-fit rounded-lg border border-white/15 px-3 text-xs font-extrabold"
        >
          ADD MOMO
        </button>
        <Toggle
          label="Ghana bank"
          on={form.bank}
          onClick={() => update((current) => ({ ...current, bank: !current.bank }))}
        />
        {form.banks.map((account, index) => (
          <GhanaBankFields
            key={`bank-${index}`}
            account={account}
            onChange={(patch) => patchList<BankAccount>("banks", index, patch)}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            update((current) => ({
              ...current,
              banks: [...current.banks, { bank: "", number: "", name: "" }],
            }))
          }
          className="h-10 w-fit rounded-lg border border-white/15 px-3 text-xs font-extrabold"
        >
          ADD BANK
        </button>
        <Toggle
          label="Nigeria bank transfer"
          on={form.nigeriaOn}
          onClick={() => update((current) => ({ ...current, nigeriaOn: !current.nigeriaOn }))}
        />
        {form.nigeriaBanks.map((account, index) => (
          <BankFields
            key={`ng-${index}`}
            account={account}
            onChange={(patch) => patchList<BankAccount>("nigeriaBanks", index, patch)}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            update((current) => ({
              ...current,
              nigeriaBanks: [...current.nigeriaBanks, { bank: "", number: "", name: "" }],
            }))
          }
          className="h-10 w-fit rounded-lg border border-white/15 px-3 text-xs font-extrabold"
        >
          ADD NIGERIA ACCOUNT
        </button>
        {error ? <p className="text-sm text-red">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !hasCheckoutSettings(form)}
          className="h-11 w-fit rounded-lg bg-red px-5 text-sm font-extrabold tracking-wide text-white disabled:pointer-events-none disabled:opacity-40"
        >
          SAVE SETTINGS
        </button>
      </form>
      {saved ? <SavedFlash /> : null}
    </section>
  );
}

function SavedFlash() {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-6"
      role="status"
      aria-live="polite"
    >
      <section className="save-flash w-full max-w-xs rounded-[28px] border border-white/10 bg-[#111111] px-6 py-10 text-center shadow-[0_20px_60px_rgba(226,59,59,0.28)]">
        <div className="mark-pop mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-b from-[#4ade80] to-[#16a34a] shadow-[0_8px_16px_rgba(22,163,74,0.35)]">
          <Check className="size-9 text-white" strokeWidth={3} aria-hidden />
        </div>
        <p className="mt-6 text-2xl font-black">Saved</p>
        <p className="mt-2 text-sm font-semibold text-[#9aa3b2]">Payment settings are updated.</p>
      </section>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-3 text-left"
    >
      <span className="text-sm font-extrabold">{label}</span>
      <span className={"relative h-7 w-12 rounded-full " + (on ? "bg-[#4b5563]" : "bg-[#e5e7eb]")}>
        <span
          className={
            "absolute top-0.5 size-6 rounded-full bg-white shadow " +
            (on ? "right-0.5" : "left-0.5")
          }
        />
      </span>
    </button>
  );
}

function BankFields({
  account,
  onChange,
}: {
  account: BankAccount;
  onChange: (patch: Partial<BankAccount>) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <input
        value={account.bank}
        onChange={(event) => onChange({ bank: event.target.value })}
        placeholder="Bank"
        className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
      />
      <input
        value={account.number}
        onChange={(event) => onChange({ number: event.target.value })}
        placeholder="Account number"
        className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
      />
      <input
        value={account.name}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="Account name"
        className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
      />
    </div>
  );
}

function GhanaBankFields({
  account,
  onChange,
}: {
  account: BankAccount;
  onChange: (patch: Partial<BankAccount>) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <select
        value={account.bank}
        onChange={(event) => onChange({ bank: event.target.value })}
        className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
      >
        <option value="">Select bank</option>
        {account.bank && !GHANA_BANKS.some((bank) => bank === account.bank) ? (
          <option value={account.bank}>{account.bank} (saved)</option>
        ) : null}
        {GHANA_BANKS.map((bank) => (
          <option key={bank} value={bank}>
            {bank}
          </option>
        ))}
      </select>
      <input
        value={account.number}
        onChange={(event) => onChange({ number: event.target.value })}
        placeholder="Account number"
        className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
      />
      <input
        value={account.name}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="Account name"
        className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
      />
    </div>
  );
}

function PartnerDesk({
  partners,
  busy,
  onChange,
  onBusy,
}: {
  partners: AdminSnapshot["partners"];
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  async function run(task: () => Promise<AdminSnapshot>) {
    setError(null);
    onBusy(true);
    try {
      onChange(await task());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update partners.");
    } finally {
      onBusy(false);
    }
  }

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-3xl border border-white/10 bg-[#111111] px-4 py-5">
        <h2 className="text-lg font-black">Add a Partner</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const next = await addPartner({ data: { name, email, password, code } });
              setName("");
              setEmail("");
              setPassword("");
              setCode("");
              return next;
            });
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            name="partner-name"
            autoComplete="off"
            placeholder="Name"
            className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            name="partner-mail"
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Partner email"
            readOnly
            onFocus={(event) => event.currentTarget.removeAttribute("readonly")}
            className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            name="partner-secret"
            type="text"
            autoComplete="off"
            placeholder="Partner password"
            readOnly
            onFocus={(event) => event.currentTarget.removeAttribute("readonly")}
            className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            name="partner-code"
            autoComplete="off"
            placeholder="Code (optional)"
            className="h-11 rounded-lg border border-white/15 bg-ink px-3 text-sm outline-none"
          />
          {error ? <p className="text-sm text-red md:col-span-2">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="h-11 w-fit rounded-lg bg-red px-5 text-sm font-extrabold tracking-wide text-white disabled:opacity-60"
          >
            ADD PARTNER
          </button>
        </form>
      </section>
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111111]">
        <div className="px-4 py-4">
          <h2 className="text-lg font-black">Partners</h2>
          <p className="mt-1 text-sm text-[#8b95a7]">
            Members who open /?ref=CODE are credited to this partner in Ghana and Nigeria.
          </p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[76rem]">
            <div className={partnerCols + " desk-head text-[11px] tracking-[0.12em]"}>
              <span>PARTNER</span>
              <span>ACTIONS</span>
              <span>STATUS</span>
              <span>CODE</span>
              <span className="whitespace-nowrap">REFERRAL LINK</span>
              <span className="pl-3 whitespace-nowrap">COMMISSION</span>
              <span className="pl-4 whitespace-nowrap">REVENUE (GHS)</span>
              <span className="pl-3 whitespace-nowrap">REVENUE (N)</span>
              <span className="pl-3 whitespace-nowrap">REVENUE (YOU)</span>
            </div>
            {partners.length === 0 ? (
              <p className="px-4 py-5 text-sm text-[#6b7280]">No partners yet.</p>
            ) : (
              partners.map((partner) => {
                const link = `${window.location.origin}/?ref=${partner.code}`;
                return (
                  <article key={partner.id} className={partnerCols + " text-sm"}>
                    <div className="min-w-0">
                      <p className="truncate font-extrabold">{partner.name}</p>
                      <p className="truncate text-xs text-[#6b7280]">{partner.email}</p>
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => deletePartner({ data: { id: partner.id } }))}
                        className="h-7 rounded-lg border border-red/80 px-2 text-[10px] font-extrabold text-red disabled:opacity-60"
                      >
                        DELETE
                      </button>
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <span
                        className={partner.status === "approved" ? "pill-active" : "pill-unpaid"}
                      >
                        {partner.status === "approved"
                          ? "APPROVED"
                          : partner.status === "pending"
                            ? "PENDING"
                            : "LOCKED"}
                      </span>
                      {partner.status === "pending" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              setPartnerLock({ data: { id: partner.id, locked: false } }),
                            )
                          }
                          className="h-7 rounded-lg bg-red px-2 text-[10px] font-extrabold text-white disabled:opacity-60"
                        >
                          APPROVE
                        </button>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-bold">{partner.code}</span>
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => void copy(`${partner.id}-link`, link)}
                        className="block w-full truncate text-left text-xs font-bold text-white"
                      >
                        {copied === `${partner.id}-link` ? "COPIED" : link}
                      </button>
                    </div>
                    <div className="pl-3">
                      <CommissionRate
                        value={partner.commission}
                        disabled={busy}
                        onSave={(commission) =>
                          void run(() =>
                            setPartnerCommission({ data: { id: partner.id, commission } }),
                          )
                        }
                      />
                    </div>
                    <span className="pl-4 whitespace-nowrap text-xs font-bold">
                      GHS {partner.revenue.toLocaleString("en-GH")}
                    </span>
                    <span className="pl-3 whitespace-nowrap text-xs font-bold">
                      ₦{partner.nigeriaRevenue.toLocaleString("en-NG")}
                    </span>
                    <div className="pl-3 text-xs font-bold">
                      <p className="whitespace-nowrap text-[#e50914]">
                        GHS{" "}
                        {(
                          partner.revenueYouGhs ??
                          partner.revenue - Math.round((partner.revenue * partner.commission) / 100)
                        ).toLocaleString("en-GH")}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-[#e50914]">
                        ₦
                        {(
                          partner.revenueYouNgn ??
                          partner.nigeriaRevenue -
                            Math.round((partner.nigeriaRevenue * partner.commission) / 100)
                        ).toLocaleString("en-NG")}
                      </p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PartnerPayoutDesk({
  payouts,
  busy,
  onChange,
  onBusy,
}: {
  payouts: PartnerPayout[];
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function update(id: string, status: "paid" | "rejected") {
    setError(null);
    onBusy(true);
    try {
      onChange(await setPartnerPayoutStatus({ data: { id, status } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update payout request.");
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-3xl border border-white/10 bg-[#111111] px-4 py-5">
        <h2 className="text-lg font-black">Partner payout requests</h2>
        <p className="mt-1 text-sm text-[#8b95a7]">
          Review each request and the partner’s submitted payout account details.
        </p>
        {error ? <p className="mt-3 text-sm font-bold text-red">{error}</p> : null}
        {payouts.length === 0 ? (
          <p className="mt-5 rounded-xl border border-white/10 px-4 py-6 text-center text-sm text-[#8b95a7]">
            No payout requests yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {payouts.map((payout) => (
              <article key={payout.id} className="rounded-2xl border border-white/10 bg-ink p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{payout.partnerName}</p>
                    <p className="text-xs text-[#8b95a7]">{payout.partnerEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-gold">
                      {payout.currency === "GHS" ? "GHS " : "₦"}
                      {payout.amount.toLocaleString(payout.currency === "GHS" ? "en-GH" : "en-NG")}
                    </p>
                    <span
                      className={
                        payout.status === "paid"
                          ? "pill-active"
                          : payout.status === "pending"
                            ? "pill-unpaid"
                            : "text-xs font-bold text-red"
                      }
                    >
                      {payout.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-[#8b95a7]">Method:</span> {payout.accountType}
                  </p>
                  <p>
                    <span className="text-[#8b95a7]">Bank/provider:</span> {payout.institution}
                  </p>
                  <p>
                    <span className="text-[#8b95a7]">Account name:</span> {payout.accountName}
                  </p>
                  <p>
                    <span className="text-[#8b95a7]">Account number:</span> {payout.accountNumber}
                  </p>
                  <p>
                    <span className="text-[#8b95a7]">Earnings date:</span>{" "}
                    {payout.earningDate.startsWith("20") ? payout.earningDate : "Earlier request"}
                  </p>
                  <p className="text-xs text-[#8b95a7]">
                    Requested{" "}
                    {payout.requestedAt
                      ? new Date(payout.requestedAt).toLocaleString()
                      : "recently"}
                  </p>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-[#111111] p-4">
                  <p className="text-xs font-extrabold tracking-[0.14em] text-[#9aa3b2]">
                    EARNINGS VERIFICATION
                  </p>
                  {payout.grossRevenue > 0 ? (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <PayoutAmount
                          label="TOTAL REVENUE"
                          amount={payout.grossRevenue}
                          currency={payout.currency}
                        />
                        <PayoutAmount
                          label={`ADMIN SHARE · ${Math.max(0, 100 - payout.commissionPercent)}%`}
                          amount={payout.grossRevenue - payout.netEarnings}
                          currency={payout.currency}
                          detail="Retained by platform"
                        />
                        <PayoutAmount
                          label={`PARTNER EARNINGS · ${payout.commissionPercent}%`}
                          amount={payout.netEarnings}
                          currency={payout.currency}
                        />
                        <PayoutAmount
                          label="REQUESTED PAYOUT"
                          amount={payout.amount}
                          currency={payout.currency}
                        />
                      </div>
                      <p className="mt-3 text-xs text-[#8b95a7]">
                        {formatPayoutAmount(payout.grossRevenue, payout.currency)} revenue ×{" "}
                        {payout.commissionPercent}% partner commission ={" "}
                        {formatPayoutAmount(payout.netEarnings, payout.currency)} partner earnings (
                        {formatPayoutAmount(
                          Math.max(0, payout.grossRevenue - payout.netEarnings),
                          payout.currency,
                        )}{" "}
                        admin share).
                        {payout.amount > payout.netEarnings
                          ? " Requested amount exceeds net earnings."
                          : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[#8b95a7]">
                      Revenue breakdown is unavailable for this request.
                    </p>
                  )}
                </div>
                {payout.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void update(payout.id, "paid")}
                      className="h-10 rounded-xl bg-red px-4 text-xs font-extrabold tracking-wide text-white disabled:opacity-60"
                    >
                      MARK AS PAID
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void update(payout.id, "rejected")}
                      className="h-10 rounded-xl border border-white/15 px-4 text-xs font-extrabold tracking-wide text-[#9aa3b2] disabled:opacity-60"
                    >
                      REJECT
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatPayoutAmount(amount: number, currency: PartnerPayout["currency"]) {
  return `${currency === "GHS" ? "GHS " : "₦"}${amount.toLocaleString(currency === "GHS" ? "en-GH" : "en-NG")}`;
}

function PayoutAmount({
  label,
  amount,
  currency,
  detail,
}: {
  label: string;
  amount: number;
  currency: PartnerPayout["currency"];
  detail?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-wide text-[#8b95a7]">{label}</p>
      <p className="mt-1 text-lg font-black">{formatPayoutAmount(amount, currency)}</p>
      {detail ? <p className="text-[10px] text-[#8b95a7]">{detail}</p> : null}
    </div>
  );
}

function CommissionRate({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled: boolean;
  onSave: (commission: number) => void;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  const [focused, setFocused] = useState(false);
  const [saved, setSaved] = useState(false);
  const seen = useRef(value);

  useEffect(() => {
    if (seen.current === value || focused) return;
    seen.current = value;
    setDraft(value > 0 ? String(value) : "");
  }, [value, focused]);

  function save() {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 0 || next > 100) {
      setDraft(value > 0 ? String(value) : "");
      return;
    }
    if (next !== value) onSave(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        inputMode="numeric"
        disabled={disabled}
        placeholder="%"
        aria-label="Commission percent"
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
        className="h-7 w-12 rounded-lg border border-white/15 bg-ink px-1 text-center text-xs font-bold text-white outline-none"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={save}
        className="h-6 shrink-0 rounded-md bg-red px-1.5 text-[10px] font-extrabold leading-none text-white disabled:opacity-60"
      >
        {saved ? "SAVED" : "SAVE"}
      </button>
    </div>
  );
}

const partnerCols =
  "partner-row desk-row grid-cols-[minmax(8rem,1.15fr)_8rem_8rem_7rem_minmax(11rem,1.3fr)_10.5rem_9.25rem_8rem_8.5rem]";

function TransactionHistory({
  payments,
  busy,
  onConfirm,
  onReject,
}: {
  payments: AdminSnapshot["payments"];
  busy: boolean;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [proof, setProof] = useState<string | null>(null);
  const [opening, setOpening] = useState("");
  const pending = payments.filter((payment) => payment.status === "pending").length;

  async function openProof(id: string) {
    setOpening(id);
    try {
      const row = await getPaymentProof({ data: { id } });
      setProof(row.receipt || "missing");
    } finally {
      setOpening("");
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#111111]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-4">
        <h2 className="text-lg font-black">Payments — Confirm</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-[#6b7280]">
          {payments.length} · {pending} pending
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          <div className={txCols + " desk-head text-[11px] tracking-[0.14em]"}>
            <span>DATE</span>
            <span>MEMBER</span>
            <span>PACKAGE</span>
            <span>PAYMENT PROOF</span>
            <span className="text-center">REFERRED BY</span>
            <span className="text-center">STATUS</span>
          </div>
          {payments.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[#6b7280]">No payments yet.</p>
          ) : (
            payments.map((payment) => {
              const date = payment.createdAt ? new Date(payment.createdAt) : null;
              return (
                <article key={payment.id} className={txCols}>
                  <div className="text-xs leading-4 text-[#6b7280]">
                    <p>
                      {date
                        ? date.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                    <p>
                      {date
                        ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                        : ""}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">
                      {payment.memberName ?? payment.payerName}
                    </p>
                    <p className="truncate text-sm text-[#6b7280]">{payment.memberEmail ?? "—"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-extrabold">{moneyLabel(payment.amount, payment.country)}</p>
                    <p className="text-sm text-[#6b7280]">
                      {payment.purpose === "activation"
                        ? "Activation"
                        : payment.purpose === "virtual_credits"
                          ? `${payment.credits ?? 0} virtual credits`
                          : "15 mins"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    {payment.hasReceipt ? (
                      <button
                        type="button"
                        disabled={opening === payment.id}
                        onClick={() => void openProof(payment.id)}
                        className="rounded-lg border border-[#86d4a0] px-2 py-1 text-[10px] font-extrabold text-[#7ddea0] disabled:opacity-60"
                      >
                        {opening === payment.id ? "Opening…" : "Open payment"}
                      </button>
                    ) : payment.payerName ? (
                      <p className="truncate text-sm font-semibold">{payment.payerName}</p>
                    ) : (
                      <p className="text-xs text-[#6b7280]">No proof</p>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {payment.referredBy ? (
                      <span className="max-w-full truncate rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold">
                        {payment.referredBy}
                      </span>
                    ) : (
                      <span className="text-xs text-[#9aa3b2]">—</span>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={payment.status === "confirmed" ? "pill-active" : "pill-unpaid"}
                    >
                      {payment.status === "confirmed"
                        ? "RECEIVED"
                        : payment.status === "rejected"
                          ? "REJECTED"
                          : "PENDING"}
                    </span>
                    {payment.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onConfirm(payment.id)}
                          className="rounded-full border border-[#86d4a0] px-2 py-1 text-[10px] font-extrabold text-[#128a3e] disabled:opacity-60"
                        >
                          MONEY RECEIVED
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onReject(payment.id)}
                          className="rounded-full border border-[#f3b4b4] px-2 py-1 text-[10px] font-extrabold text-[#e23b3b] disabled:opacity-60"
                        >
                          × REJECT
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
      {proof ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4" role="dialog">
          <div className="max-h-[90dvh] w-full max-w-md overflow-auto rounded-[28px] border border-line bg-panel">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm font-extrabold">Payment proof</p>
              <button type="button" onClick={() => setProof(null)} className="text-sm font-bold">
                Close
              </button>
            </div>
            {proof === "missing" ? (
              <p className="px-5 pb-5 text-sm text-white/70">No file was attached.</p>
            ) : proof.startsWith("data:image/") ? (
              <img src={proof} alt="Payment receipt" className="w-full bg-ink object-contain" />
            ) : (
              <a
                href={proof}
                target="_blank"
                rel="noreferrer"
                className="block px-5 pb-5 text-sm font-extrabold text-[#7ddea0]"
              >
                Open the uploaded file
              </a>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BlockDesk({
  rows,
  busy,
  onChange,
  onBusy,
}: {
  rows: AdminSnapshot["blocked"];
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function run(action: () => Promise<AdminSnapshot>) {
    onBusy(true);
    setError("");
    try {
      onChange(await action());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the block list.");
      return false;
    } finally {
      onBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => blockUser({ data: { email } }))) setEmail("");
  }

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#111111] p-4">
      <h2 className="text-2xl font-black">Block a user</h2>
      <p className="mt-1 text-sm text-[#8b95a7]">
        A blocked email can no longer sign in. They stay on the front page with Sign In and Sign Out
        only.
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-4 flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="user@email.com"
          required
          className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-ink px-3 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-xl bg-red px-6 text-sm font-extrabold disabled:opacity-60"
        >
          BLOCK
        </button>
      </form>
      {error ? <p className="mt-3 text-sm font-bold text-[#ff8d8d]">{error}</p> : null}
      <h3 className="mt-6 text-sm font-extrabold tracking-[0.14em] text-[#8b95a7]">
        BLOCKED ({rows.length})
      </h3>
      {rows.length === 0 ? <p className="mt-3 text-sm text-[#8b95a7]">No blocked users.</p> : null}
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li
            key={row.email}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink px-3 py-3"
          >
            <span className="min-w-0 truncate text-sm font-bold">{row.email}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => unblockUser({ data: { email: row.email } }))}
              className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-xs font-extrabold disabled:opacity-60"
            >
              UNBLOCK
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MemberList({ members }: { members: AdminSnapshot["members"] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? members.filter((member) =>
        [member.name, member.email, member.referredBy ?? ""].some((value) =>
          value.toLowerCase().includes(needle),
        ),
      )
    : members;

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#111111]">
      <div className="px-4 py-5">
        <h2 className="text-2xl font-black">Members</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email or partner"
          className="mt-4 h-12 w-full rounded-xl border border-white/15 bg-ink px-3 text-sm outline-none"
        />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[40rem]">
          <div className={memberCols + " desk-head text-[11px] tracking-[0.14em]"}>
            <span>MEMBER</span>
            <span className="text-center">JOINED</span>
            <span className="text-center">STATUS</span>
            <span className="text-center">REFERRED BY</span>
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[#6b7280]">
              {members.length === 0 ? "No accounts yet." : "No members match that search."}
            </p>
          ) : (
            shown.map((member) => {
              const date = member.createdAt ? new Date(member.createdAt) : null;
              return (
                <article key={member.id} className={memberCols}>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{member.name}</p>
                    <p className="truncate text-sm text-[#6b7280]">{member.email}</p>
                  </div>
                  <div className="text-center text-xs leading-4 text-[#6b7280]">
                    <p>
                      {date
                        ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                        : "—"}
                    </p>
                    <p>{date ? `${date.getFullYear()} ·` : ""}</p>
                    <p>
                      {date
                        ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                        : ""}
                    </p>
                  </div>
                  {member.paid ? (
                    <span className="pill-active justify-self-center">ACTIVE</span>
                  ) : (
                    <span className="pill-unpaid justify-self-center">UNPAID</span>
                  )}
                  <div className="flex justify-center">
                    {member.referredBy ? (
                      <span className="max-w-full truncate rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold">
                        {member.referredBy}
                      </span>
                    ) : (
                      <span className="text-xs text-[#9aa3b2]">—</span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function TestimonyDesk({
  rows,
  busy,
  onChange,
  onBusy,
}: {
  rows: AdminTestimony[];
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  async function run(task: Promise<AdminSnapshot>) {
    onBusy(true);
    try {
      onChange(await task);
    } finally {
      onBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-[#111111]">
      <div className="px-4 py-4">
        <h2 className="text-xs font-extrabold tracking-[0.16em]">TESTIMONIES</h2>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-white/10 px-4 py-6 text-sm text-[#8b95a7]">
          No testimonies yet.
        </p>
      ) : (
        rows.map((row) => (
          <article
            key={row.id}
            className="flex flex-row items-center gap-3 border-t border-[#333] px-4 py-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">
                {row.name} <span className="text-sm font-semibold text-[#8b95a7]">{row.place}</span>{" "}
                <span className="text-gold">{"★".repeat(row.stars)}</span>
              </p>
              <p className="mt-1 text-sm text-white/80">{row.text}</p>
              <span className={row.status === "approved" ? "pill-active mt-2" : "pill-unpaid mt-2"}>
                {row.status === "approved" ? "ACTIVE" : "UNPAID"}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              {row.status === "pending" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(setTestimonyStatus({ data: { id: row.id, status: "approved" } }))
                  }
                  className="h-8 rounded-lg bg-red px-3 text-[10px] font-extrabold text-white disabled:opacity-60"
                >
                  APPROVE
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(deleteTestimony({ data: { id: row.id } }))}
                className="h-8 rounded-lg border border-red/80 px-3 text-[10px] font-extrabold text-red disabled:opacity-60"
              >
                DELETE
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function WeekRevenue({
  payments,
  country,
}: {
  payments: AdminSnapshot["payments"];
  country: "Ghana" | "Nigeria";
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const timeZone = country === "Nigeria" ? NIGERIA_TZ : GHANA_TZ;
  const todayKey = dayKeyInZone(now, timeZone);
  const rows = Array.from({ length: 7 }, (_, index) => {
    const key = shiftDayKey(todayKey, index - 6, timeZone);
    const approved = payments.filter(
      (payment) =>
        payment.status === "confirmed" &&
        payment.countsRevenue &&
        payment.confirmedAt &&
        dayKeyInZone(payment.confirmedAt, timeZone) === key,
    );
    const ghana = approved
      .filter((payment) => !isNairaPayment(payment.amount, payment.country))
      .reduce((sum, payment) => sum + payment.amount, 0);
    const nigeria = approved
      .filter((payment) => isNairaPayment(payment.amount, payment.country))
      .reduce((sum, payment) => sum + payment.amount, 0);
    return {
      key,
      label: liveDayLabel(key, timeZone),
      today: key === todayKey,
      text:
        country === "Ghana"
          ? `GHS ${ghana.toLocaleString("en-GH")}`
          : `₦${nigeria.toLocaleString("en-NG")}`,
    };
  });
  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-[#111111]">
      <div className="flex items-center gap-3 px-5 py-5">
        <h2 className="text-lg font-black">Daily Revenue</h2>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-bold text-[#9aa3b2]">
          {country}
        </span>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-bold text-[#9aa3b2]">
          {liveDayLabel(todayKey, timeZone)}
        </span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={country + row.key} className="week-row desk-row grid-cols-[2fr_1fr] text-sm">
            <span className={row.today ? "font-extrabold text-red" : "font-bold text-[#9aa3b2]"}>
              {row.label}
            </span>
            <span className="text-[#8b95a7]">{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
  gold = false,
  iconClass = "bg-white/10 text-red",
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  gold?: boolean;
  iconClass?: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-[#111111] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold tracking-[0.14em] text-[#9aa3b2]">{label}</p>
        <span className={"grid size-9 place-items-center rounded-xl " + iconClass}>{icon}</span>
      </div>
      <p className={"mt-3 text-2xl font-black " + (gold ? "text-gold" : "text-white")}>{value}</p>
      <p className="mt-1 text-sm text-[#8b95a7]">{note}</p>
    </article>
  );
}
