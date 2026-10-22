import { createServerFn } from "@tanstack/react-start";
import { adminAuthMiddleware } from "@/lib/admin-auth";
import type { Sql } from "@/lib/db";
import { isNairaAmount } from "@/lib/desk-session";
import type { PaymentPurpose } from "@/lib/activation";
import { validatePricing, validatePaymentQuote, type PricingSettings } from "@/lib/pricing";
import { validateVirtualCreditPurchase } from "@/lib/virtual-credits";
import { validatePaymentProof } from "@/lib/payment-proof";
import {
  adminEarnings,
  availablePartnerEarnings,
  availableTotalPartnerEarnings,
  commissionAmount,
  partnerEarnings,
  previousSettlementDate,
  partnerSettlementBalances,
  settlementGross,
} from "@/lib/partner-earnings";

export type AdminMember = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  paid: boolean;
  isTestAccount: boolean;
  referredBy: string | null;
};

export type AdminPayment = {
  id: string;
  purpose: PaymentPurpose;
  payerName: string;
  amount: number;
  minutes: number | null;
  credits: number | null;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  memberName: string | null;
  memberEmail: string | null;
  hasReceipt: boolean;
  countsRevenue: boolean;
  adminRevenueEligible: boolean;
  isTestAccount: boolean;
  confirmedAt: string;
  referredBy: string | null;
  country: "Ghana" | "Nigeria" | null;
};

export type AdminPartner = {
  id: string;
  name: string;
  email: string;
  code: string;
  status: "approved" | "locked" | "pending";
  commission: number;
  referrals: number;
  revenue: number;
  nigeriaRevenue: number;
  revenueYouGhs: number;
  revenueYouNgn: number;
};

export type PartnerPayout = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  amount: number;
  currency: "GHS" | "NGN";
  grossRevenue: number;
  commissionPercent: number;
  commissionAmount: number;
  netEarnings: number;
  accountType: "Mobile Money" | "Bank Transfer";
  institution: string;
  accountName: string;
  accountNumber: string;
  earningDate: string;
  status: "pending" | "paid" | "rejected";
  requestedAt: string;
};

export const GHANA_MOMO_NETWORKS = [
  { value: "MTN Mobile Money", label: "MTN" },
  { value: "Telecel Cash", label: "Telecel" },
  { value: "AirtelTigo Money", label: "AirtelTigo" },
] as const;
export type MomoNetwork = (typeof GHANA_MOMO_NETWORKS)[number]["value"] | "";
export type MomoWallet = { network: MomoNetwork; number: string; name: string };
export const GHANA_BANKS = [
  "Absa Bank Ghana",
  "Access Bank Ghana",
  "Agricultural Development Bank",
  "Bank of Africa Ghana",
  "CalBank",
  "Consolidated Bank Ghana",
  "Ecobank Ghana",
  "Fidelity Bank Ghana",
  "First Atlantic Bank",
  "First National Bank Ghana",
  "GCB Bank",
  "Guaranty Trust Bank Ghana",
  "National Investment Bank",
  "OmniBSIC Bank",
  "Prudential Bank",
  "Republic Bank Ghana",
  "Societe Generale Ghana",
  "Stanbic Bank Ghana",
  "Standard Chartered Bank Ghana",
  "United Bank for Africa Ghana",
  "Universal Merchant Bank",
  "Zenith Bank Ghana",
] as const;
export type BankAccount = { bank: string; number: string; name: string };

export type GatewayCheckout = {
  currency: string;
  businessName: string;
  whatsapp: string;
  email: string;
  paystack: boolean;
  flutterwave: boolean;
  royaltech: boolean;
  cowrie: boolean;
  momo: boolean;
  bank: boolean;
  nigeriaOn: boolean;
  nigeriaBanks: BankAccount[];
  wallets: MomoWallet[];
  banks: BankAccount[];
};

export type GatewayRates = {
  nigeria: number;
  kenya: number;
  tanzania: number;
  zambia: number;
  southAfrica: number;
};

export type GatewaySettings = GatewayRates & {
  scansRemaining: number;
  scansUsed: number;
  checkout: GatewayCheckout;
};

export type AdminTestimony = {
  id: string;
  name: string;
  place: string;
  text: string;
  stars: number;
  status: "pending" | "approved";
  createdAt: string;
};

export type AdminSnapshot = {
  members: AdminMember[];
  payments: AdminPayment[];
  partners: AdminPartner[];
  payouts: PartnerPayout[];
  testimonies: AdminTestimony[];
  blocked: { email: string; createdAt: string }[];
  gateway: GatewaySettings;
  pricing: PricingSettings;
  total: number;
  today: number;
  revenue: number;
  confirmed: number;
};

export type PartnerPortal = {
  name: string;
  code: string;
  commission: number;
  members: number;
  active: number;
  todayRevenue: number;
  todaySales: number;
  todayEarnings: number;
  revenue: number;
  earnings: number;
  nigeriaTodayRevenue: number;
  nigeriaTodaySales: number;
  nigeriaTodayEarnings: number;
  nigeriaRevenue: number;
  nigeriaEarnings: number;
  availableGhs: number;
  availableNgn: number;
  settlements: { currency: "GHS" | "NGN"; earningDate: string; available: number }[];
  payouts: PartnerPayout[];
  days: { label: string; revenue: number; earnings: number; today: boolean }[];
  nigeriaDays: { label: string; revenue: number; earnings: number; today: boolean }[];
  referrals: {
    name: string;
    email: string;
    status: "paid" | "unpaid";
    joined: string;
    spend: number;
    spendGhs: number;
    spendNgn: number;
    country: "Ghana" | "Nigeria" | null;
  }[];
};

let schemaPromise: Promise<void> | null = null;

export const GHANA_TZ = "Africa/Accra";
export const NIGERIA_TZ = "Africa/Lagos";

export function dayKeyInZone(value: Date | string, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shiftDayKey(key: string, days: number, timeZone: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days, 12));
  return dayKeyInZone(date, timeZone);
}

export function isNairaPayment(amount: number, country: string | null | undefined) {
  if (country === "Nigeria") return true;
  if (country === "Ghana") return false;
  return isNairaAmount(amount);
}

export function liveDayLabel(key: string, timeZone: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase();
  const monthName = new Intl.DateTimeFormat("en-GB", { timeZone, month: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase();
  return `${weekday} ${day} ${monthName}`;
}

function accraDayKey(value: Date | string) {
  return dayKeyInZone(value, GHANA_TZ);
}

function shiftAccraDay(key: string, days: number) {
  return shiftDayKey(key, days, GHANA_TZ);
}

async function partnerCodeFor(sql: Sql, referredBy: string) {
  const value = referredBy.trim();
  if (!value) return "";
  const rows = await sql<{ code: string }>`
    select code from partners
    where lower(code) = lower(${value}) or lower(name) = lower(${value})
    order by case when lower(code) = lower(${value}) then 0 else 1 end
    limit 1
  `;
  return rows[0]?.code || value;
}

async function ensurePayments(sql: Sql) {
  schemaPromise ??= (async () => {
    await sql`
      create table if not exists payments (
        id text primary key,
        payer_name text not null,
        amount integer not null,
        status text not null default 'pending',
        place text not null default '',
        created_at timestamptz not null default now()
      )
    `;
    await sql`alter table payments add column if not exists user_id text`;
    await sql`alter table payments add column if not exists referred_by text`;
    await sql`alter table payments add column if not exists receipt text`;
    await sql`alter table payments add column if not exists counts_revenue boolean default true`;
    await sql`alter table payments add column if not exists confirmed_at timestamptz`;
    await sql`alter table payments add column if not exists virtual_credits integer`;
    await sql`update payments set counts_revenue = true where counts_revenue is null`;
    await sql`update payments set confirmed_at = created_at where status = 'confirmed' and confirmed_at is null`;
    await sql`drop table if exists auto_approved_emails`;
    await sql`
      create table if not exists referrals (
        user_id text primary key,
        referred_by text not null
      )
    `;
    await sql`
      create table if not exists partners (
        id text primary key,
        name text not null,
        email text not null unique,
        password_hash text not null,
        code text not null unique,
        status text not null default 'approved',
        commission integer not null default 0,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists partner_logins (
        email text primary key,
        partner_id text not null,
        name text not null,
        password_hash text not null,
        code text not null,
        approved_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists partner_payouts (
        id text primary key,
        partner_id text not null,
        partner_name text not null,
        partner_email text not null,
        amount integer not null check (amount > 0),
        currency text not null check (currency in ('GHS', 'NGN')),
        account_type text not null check (account_type in ('Mobile Money', 'Bank Transfer')),
        institution text not null,
        account_name text not null,
        account_number text not null,
        earning_date text not null default '',
        gross_revenue integer not null default 0,
        commission_percent integer not null default 0,
        commission_amount integer not null default 0,
        net_earnings integer not null default 0,
        status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
        requested_at timestamptz not null default now()
      )
    `;
    await sql`alter table partner_payouts add column if not exists earning_date text not null default ''`;
    await sql`alter table partner_payouts add column if not exists gross_revenue integer not null default 0`;
    await sql`alter table partner_payouts add column if not exists commission_percent integer not null default 0`;
    await sql`alter table partner_payouts add column if not exists commission_amount integer not null default 0`;
    await sql`alter table partner_payouts add column if not exists net_earnings integer not null default 0`;
    await sql`alter table partner_payouts add column if not exists partner_name text not null default ''`;
    await sql`alter table partner_payouts add column if not exists partner_email text not null default ''`;
    await sql`
      update partner_payouts payout
      set partner_name = partner.name, partner_email = partner.email
      from partners partner
      where payout.partner_id = partner.id and (payout.partner_name = '' or payout.partner_email = '')
    `;
    await sql`update partner_payouts set earning_date = 'legacy-' || id where earning_date = ''`;
    await sql`drop index if exists partner_payouts_one_settlement`;
    await sql`
      create unique index if not exists partner_payouts_one_pending_per_currency
      on partner_payouts (partner_id, currency) where status = 'pending'
    `;
    await sql`
      insert into partner_logins (email, partner_id, name, password_hash, code, approved_at)
      select lower(email), id, name, password_hash, code, coalesce(created_at, now())
      from partners
      where password_hash is not null
        and password_hash <> ''
        and status is distinct from 'pending'
      on conflict (email) do update
      set password_hash = coalesce(partner_logins.password_hash, excluded.password_hash)
    `;
    await sql`
      create table if not exists gateway_settings (
        id text primary key,
        scans_remaining integer not null,
        scans_used integer not null,
        nigeria numeric not null,
        kenya numeric not null,
        tanzania numeric not null,
        zambia numeric not null,
        south_africa numeric not null
      )
    `;
    await sql`alter table gateway_settings add column if not exists checkout text`;
    await sql`alter table gateway_settings add column if not exists blanked boolean default false`;
    await sql`
      create table if not exists testimonies (
        id text primary key,
        name text not null,
        body text not null,
        stars integer not null,
        status text not null default 'pending',
        place text not null default '',
        created_at timestamptz not null default now()
      )
    `;
    await sql`alter table testimonies add column if not exists place text not null default ''`;
    const providedTestimonies = [
      [
        "seed-gh-kwame",
        "Kwame Mensah",
        "Accra, Ghana",
        "The cash-out window was clear and I closed the round on time.",
        5,
      ],
      [
        "seed-ng-chinedu",
        "Chinedu Okafor",
        "Lagos, Nigeria",
        "The predicted window showed before the climb, so I cashed out calmly.",
        5,
      ],
      [
        "seed-gh-ama",
        "Ama Serwaa",
        "Kumasi, Ghana",
        "I check the desk before every session. The signal is easy to follow.",
        5,
      ],
      [
        "seed-ng-amina",
        "Amina Bello",
        "Abuja, Nigeria",
        "Clear signals, and support answered when I asked about my session.",
        4,
      ],
      [
        "seed-gh-kofi",
        "Kofi Asante",
        "Tema, Ghana",
        "Session time matched the package I bought. Smooth from start to finish.",
        5,
      ],
      [
        "seed-ng-tunde",
        "Tunde Adeyemi",
        "Ibadan, Nigeria",
        "I bought session time and used it the same day. The desk stayed live.",
        5,
      ],
      [
        "seed-gh-akosua",
        "Akosua Boateng",
        "Takoradi, Ghana",
        "I waited for the safer window and it lined up. Very useful on my phone.",
        4,
      ],
      [
        "seed-ng-ngozi",
        "Ngozi Eze",
        "Enugu, Nigeria",
        "The rounds are easier to follow now. I come back to the desk every evening.",
        5,
      ],
      [
        "seed-gh-yaw",
        "Yaw Owusu",
        "Tamale, Ghana",
        "Simple to use on my phone. The live round felt easier to read.",
        5,
      ],
      [
        "seed-ng-ibrahim",
        "Ibrahim Musa",
        "Kano, Nigeria",
        "I open the desk, watch the window, and play only when it looks right.",
        5,
      ],
      [
        "seed-gh-esi",
        "Esi Appiah",
        "Cape Coast, Ghana",
        "Bought the 10 minute session and it ran exactly as listed. Happy with it.",
        5,
      ],
      [
        "seed-gh-nana",
        "Nana Yeboah",
        "Sunyani, Ghana",
        "The window showed up in time and I cashed out safely. Will buy again.",
        4,
      ],
      [
        "seed-gh-abena",
        "Abena Frimpong",
        "Koforidua, Ghana",
        "Easy to pay with MoMo and my session opened soon after approval.",
        5,
      ],
      [
        "seed-gh-kojo",
        "Kojo Badu",
        "Ho, Ghana",
        "I like that the timer is clear. I always know how long I have left.",
        4,
      ],
      [
        "seed-gh-efua",
        "Efua Quaye",
        "Tema, Ghana",
        "Support replied fast and the desk worked well on my phone.",
        5,
      ],
      [
        "seed-gh-yaa",
        "Yaa Danquah",
        "Wa, Ghana",
        "Simple layout and the signals are easy to read. Good value.",
        5,
      ],
      [
        "seed-gh-kwesi",
        "Kwesi Ofori",
        "Accra, Ghana",
        "Third time buying. The session started right after my payment cleared.",
        5,
      ],
      [
        "seed-gh-adwoa",
        "Adwoa Sarpong",
        "Kumasi, Ghana",
        "Clean and quick. The 20 minute session gave me plenty of time.",
        4,
      ],
      [
        "seed-ng-emeka",
        "Emeka Nwosu",
        "Port Harcourt, Nigeria",
        "Bank transfer was easy and my session was opened once confirmed.",
        5,
      ],
      [
        "seed-ng-fatima",
        "Fatima Yusuf",
        "Kaduna, Nigeria",
        "The signals are clear and the timer is easy to follow on my phone.",
        4,
      ],
    ] as const;
    for (let index = 0; index < providedTestimonies.length; index += 1) {
      const [id, name, place, body, stars] = providedTestimonies[index];
      const minutesAgo = providedTestimonies.length - index;
      await sql`
        insert into testimonies (id, name, place, body, stars, status, created_at)
        values (${id}, ${name}, ${place}, ${body}, ${stars}, 'approved', now() - (${minutesAgo} * interval '1 minute'))
        on conflict (id) do nothing
      `;
    }
    await sql`
      update gateway_settings
      set scans_remaining = 0,
          scans_used = 0,
          nigeria = 0,
          kenya = 0,
          tanzania = 0,
          zambia = 0,
          south_africa = 0,
          checkout = null,
          blanked = true
      where id = 'main' and blanked is not true
    `;
    await sql`
      insert into gateway_settings (id, scans_remaining, scans_used, nigeria, kenya, tanzania, zambia, south_africa)
      values ('main', 0, 0, 0, 0, 0, 0, 0)
      on conflict (id) do nothing
    `;
    await sql`
      create table if not exists sporty_accounts (
        user_id text primary key,
        number text not null
      )
    `;
    await sql`alter table sporty_accounts add column if not exists linked_at timestamptz default now()`;
    await sql`
      create table if not exists player_country (
        user_id text primary key,
        country text not null
      )
    `;
    await sql`
      create table if not exists registered_users (
        user_id text primary key,
        name text not null,
        email text not null,
        country text not null,
        sporty_number text not null,
        password_hash text,
        registered_at timestamptz not null default now()
      )
    `;
    await sql`
      insert into registered_users (user_id, name, email, country, sporty_number, password_hash, registered_at)
      select u.id,
        u.name,
        u.email,
        c.country,
        s.number,
        (
          select a.password
          from "account" a
          where a."userId" = u.id and a.password is not null
          order by case when a."providerId" = 'credential' then 0 else 1 end
          limit 1
        ),
        coalesce(s.linked_at, u."createdAt", now())
      from "user" u
      join player_country c on c.user_id = u.id
      join sporty_accounts s on s.user_id = u.id
      where c.country in ('Ghana', 'Nigeria')
      on conflict (user_id) do update
      set password_hash = coalesce(registered_users.password_hash, excluded.password_hash)
    `;
    await sql`
      update "user" u
      set "isCompleted" = true
      where exists (select 1 from registered_users r where r.user_id = u.id)
        and u."isCompleted" is not true
    `;
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function readSnapshot(sql: Sql): Promise<AdminSnapshot> {
  await ensurePayments(sql);
  const rows = await sql<{
    id: string;
    name: string;
    email: string;
    createdAt: string | Date;
    is_test_account: boolean;
  }>`
    select user_id as id, name, email, registered_at as "createdAt",
      exists (select 1 from test_accounts t where t.email = lower(trim(registered_users.email))) as is_test_account
    from registered_users
    order by registered_at desc
  `;
  const referralRows = await sql<{ user_id: string; referred_by: string }>`
    select user_id, referred_by from referrals
  `;
  const paidRows = await sql<{ user_id: string | null }>`
    select user_id from payments where status = 'confirmed' and user_id is not null
  `;
  const referredBy = new Map(referralRows.map((row) => [row.user_id, row.referred_by]));
  const paidIds = new Set(
    paidRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)),
  );
  const members: AdminMember[] = rows.map((row) => {
    const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: Number.isNaN(created.getTime()) ? "" : created.toISOString(),
      paid: paidIds.has(row.id),
      isTestAccount: row.is_test_account,
      referredBy: referredBy.get(row.id) ?? null,
    };
  });
  const paymentRows = await sql<{
    id: string;
    payer_name: string;
    purpose: PaymentPurpose;
    amount: number | string;
    session_minutes: number | null;
    virtual_credits: number | null;
    status: string;
    created_at: string | Date;
    member_name: string | null;
    member_email: string | null;
    has_receipt: boolean | string;
    counts_revenue: boolean | string | null;
    admin_revenue_eligible: boolean;
    is_test_account: boolean;
    confirmed_at: string | Date | null;
    referred_by: string | null;
    country: string | null;
  }>`
    select p.id, p.purpose, p.payer_name, p.amount, p.session_minutes, p.virtual_credits, p.status, p.created_at, u.name as member_name, u.email as member_email,
      (p.receipt is not null and p.receipt <> '') as has_receipt,
      p.counts_revenue,
      coalesce(p.confirmed_at, p.created_at) >=
        (select starts_at from admin_revenue_period where id = 'main') as admin_revenue_eligible,
      exists (select 1 from test_accounts t where t.email = lower(trim(u.email))) as is_test_account,
      coalesce(p.confirmed_at, p.created_at) as confirmed_at,
      coalesce(nullif(p.referred_by, ''), r.referred_by) as referred_by,
      coalesce(p.country, c.country) as country
    from payments p
    left join "user" u on u.id = p.user_id
    left join referrals r on r.user_id = p.user_id
    left join player_country c on c.user_id = p.user_id
    order by p.created_at desc
  `;
  const payments: AdminPayment[] = paymentRows.map((row) => {
    const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    const confirmed =
      row.confirmed_at instanceof Date ? row.confirmed_at : new Date(row.confirmed_at ?? "");
    const status = row.status === "confirmed" || row.status === "rejected" ? row.status : "pending";
    return {
      id: row.id,
      purpose: row.purpose,
      payerName: row.payer_name,
      amount: Number(row.amount),
      minutes: row.session_minutes,
      credits: row.virtual_credits,
      status,
      createdAt: Number.isNaN(created.getTime()) ? "" : created.toISOString(),
      memberName: row.member_name,
      memberEmail: row.member_email,
      hasReceipt: row.has_receipt === true || row.has_receipt === "t" || row.has_receipt === "true",
      countsRevenue:
        status === "confirmed" &&
        !(
          row.counts_revenue === false ||
          row.counts_revenue === "f" ||
          row.counts_revenue === "false"
        ),
      adminRevenueEligible: row.admin_revenue_eligible,
      isTestAccount: row.is_test_account,
      confirmedAt:
        status !== "confirmed" || Number.isNaN(confirmed.getTime()) ? "" : confirmed.toISOString(),
      referredBy: row.referred_by,
      country: row.country === "Nigeria" ? "Nigeria" : row.country === "Ghana" ? "Ghana" : null,
    };
  });
  const confirmedPayments = payments.filter(
    (payment) => payment.status === "confirmed" && payment.countsRevenue,
  );
  const partnerRows = await sql<{
    id: string;
    name: string;
    email: string;
    code: string;
    status: string;
    commission: number | string;
  }>`select id, name, email, code, status, commission from partners order by created_at desc`;
  const referralCounts = await sql<{ referred_by: string; total: number | string }>`
    select lower(referred_by) as referred_by, count(*) as total from referrals group by lower(referred_by)
  `;
  const referralRevenue = await sql<{
    referred_by: string;
    ghs: number | string;
    ngn: number | string;
  }>`
    select lower(partner.code) as referred_by,
      coalesce(sum(case when
        coalesce(p.country, c.country) = 'Nigeria'
        or (coalesce(p.country, c.country) is distinct from 'Ghana' and p.amount in (6000, 7000, 41986, 95968, 203932, 35000, 55000, 75000))
        then 0 else p.amount end), 0) as ghs,
      coalesce(sum(case when
        coalesce(p.country, c.country) = 'Nigeria'
        or (coalesce(p.country, c.country) is distinct from 'Ghana' and p.amount in (6000, 7000, 41986, 95968, 203932, 35000, 55000, 75000))
        then p.amount else 0 end), 0) as ngn
    from payments p
    left join referrals r on r.user_id = p.user_id
    left join player_country c on c.user_id = p.user_id
    join lateral (
      select code from partners
      where lower(code) = lower(coalesce(nullif(p.referred_by, ''), ''))
         or lower(name) = lower(coalesce(nullif(p.referred_by, ''), ''))
         or lower(code) = lower(coalesce(r.referred_by, ''))
         or lower(name) = lower(coalesce(r.referred_by, ''))
      order by case
        when lower(code) = lower(coalesce(nullif(p.referred_by, ''), '')) then 0
        when lower(name) = lower(coalesce(nullif(p.referred_by, ''), '')) then 1
        when lower(code) = lower(coalesce(r.referred_by, '')) then 2
        else 3
      end
      limit 1
    ) partner on true
    where p.status = 'confirmed' and p.counts_revenue is not false
    group by lower(partner.code)
  `;
  const countBy = new Map(referralCounts.map((row) => [row.referred_by, Number(row.total)]));
  const ghsBy = new Map(referralRevenue.map((row) => [row.referred_by, Number(row.ghs)]));
  const ngnBy = new Map(referralRevenue.map((row) => [row.referred_by, Number(row.ngn)]));
  const partners: AdminPartner[] = partnerRows.map((row) => {
    const code = row.code.toLowerCase();
    const name = row.name.toLowerCase();
    const extra = (map: Map<string, number>) =>
      (map.get(code) ?? 0) + (code === name ? 0 : (map.get(name) ?? 0));
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      code: row.code,
      status: row.status === "locked" || row.status === "pending" ? row.status : "approved",
      commission: Number(row.commission) || 0,
      referrals: extra(countBy),
      revenue: extra(ghsBy),
      nigeriaRevenue: extra(ngnBy),
      revenueYouGhs: adminEarnings(extra(ghsBy), Number(row.commission) || 0),
      revenueYouNgn: adminEarnings(extra(ngnBy), Number(row.commission) || 0),
    };
  });
  const payoutRows = await sql<{
    id: string;
    partner_id: string;
    partner_name: string;
    partner_email: string;
    amount: number | string;
    currency: string;
    gross_revenue: number | string;
    commission_percent: number | string;
    commission_amount: number | string;
    net_earnings: number | string;
    account_type: string;
    institution: string;
    account_name: string;
    account_number: string;
    earning_date: string;
    status: string;
    requested_at: string | Date;
  }>`
    select payout.id, payout.partner_id, coalesce(nullif(partner.name, ''), payout.partner_name) as partner_name,
      coalesce(nullif(partner.email, ''), payout.partner_email) as partner_email,
      payout.amount, payout.currency, payout.gross_revenue, payout.commission_percent,
      payout.commission_amount, payout.net_earnings, payout.account_type, payout.institution, payout.account_name,
      payout.account_number, payout.earning_date, payout.status, payout.requested_at
    from partner_payouts payout
    left join partners partner on partner.id = payout.partner_id
    order by payout.requested_at desc
  `;
  const payouts: PartnerPayout[] = payoutRows.map((row) => {
    const requestedAt =
      row.requested_at instanceof Date ? row.requested_at : new Date(row.requested_at);
    return {
      id: row.id,
      partnerId: row.partner_id,
      partnerName: row.partner_name,
      partnerEmail: row.partner_email,
      amount: Number(row.amount),
      currency: row.currency === "NGN" ? "NGN" : "GHS",
      grossRevenue: Number(row.gross_revenue),
      commissionPercent: Number(row.commission_percent),
      commissionAmount: Number(row.commission_amount),
      netEarnings: Number(row.net_earnings),
      accountType: row.account_type === "Mobile Money" ? "Mobile Money" : "Bank Transfer",
      institution: row.institution,
      accountName: row.account_name,
      accountNumber: row.account_number,
      earningDate: row.earning_date,
      status: row.status === "paid" || row.status === "rejected" ? row.status : "pending",
      requestedAt: Number.isNaN(requestedAt.getTime()) ? "" : requestedAt.toISOString(),
    };
  });
  const gatewayRows = await sql<{
    scans_remaining: number | string;
    scans_used: number | string;
    nigeria: number | string;
    kenya: number | string;
    tanzania: number | string;
    zambia: number | string;
    south_africa: number | string;
    checkout: string | null;
  }>`
    select scans_remaining, scans_used, nigeria, kenya, tanzania, zambia, south_africa, checkout
    from gateway_settings where id = 'main'
  `;
  const gatewayRow = gatewayRows[0];
  const [scanCredits] = await sql<{ remaining: number | string }>`
    select coalesce(sum(balance), 0) as remaining from virtual_credit_wallets
  `;
  const checkout = readCheckout(gatewayRow?.checkout);
  const gateway: GatewaySettings = {
    scansRemaining: Number(scanCredits.remaining),
    scansUsed: Number(gatewayRow?.scans_used ?? 0),
    nigeria: Number(gatewayRow?.nigeria ?? 0),
    kenya: Number(gatewayRow?.kenya ?? 0),
    tanzania: Number(gatewayRow?.tanzania ?? 0),
    zambia: Number(gatewayRow?.zambia ?? 0),
    southAfrica: Number(gatewayRow?.south_africa ?? 0),
    checkout,
  };
  const { readPricing } = await import("@/lib/pricing.server");
  const pricing = await readPricing(sql);
  const todayKey = accraDayKey(new Date());
  const today = members.filter(
    (member) => member.createdAt && accraDayKey(member.createdAt) === todayKey,
  ).length;
  const testimonyRows = await sql<{
    id: string;
    name: string;
    place: string;
    body: string;
    stars: number | string;
    status: string;
    created_at: string | Date;
  }>`select id, name, place, body, stars, status, created_at from testimonies order by created_at desc`;
  const testimonies: AdminTestimony[] = testimonyRows.map((row) => {
    const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    return {
      id: row.id,
      name: row.name,
      place: row.place,
      text: row.body,
      stars: Math.min(5, Math.max(1, Number(row.stars) || 1)),
      status: row.status === "approved" ? "approved" : "pending",
      createdAt: Number.isNaN(created.getTime()) ? "" : created.toISOString(),
    };
  });
  const { ensureBlockedTable } = await import("@/lib/blocked-users.server");
  await ensureBlockedTable(sql);
  const blockedRows = await sql<{
    email: string;
    created_at: string | Date;
  }>`select email, created_at from blocked_emails order by created_at desc`;
  const blocked = blockedRows.map((row) => ({
    email: row.email,
    createdAt: (row.created_at instanceof Date
      ? row.created_at
      : new Date(row.created_at)
    ).toISOString(),
  }));
  return {
    members,
    payments,
    partners,
    payouts,
    testimonies,
    blocked,
    gateway,
    pricing,
    total: members.length,
    today,
    revenue: confirmedPayments
      .filter((payment) => payment.adminRevenueEligible)
      .reduce((sum, payment) => sum + payment.amount, 0),
    confirmed: confirmedPayments.length,
  };
}

export const blockUser = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { email: string }) => {
    const email = String(data?.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw new Error("Enter a valid email address.");
    return { email };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { ensureBlockedTable } = await import("@/lib/blocked-users.server");
    const sql = await getSql();
    await ensurePayments(sql);
    await ensureBlockedTable(sql);
    await sql`insert into blocked_emails (email) values (${data.email}) on conflict (email) do nothing`;
    return readSnapshot(sql);
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { email: string }) => ({
    email: String(data?.email ?? "")
      .trim()
      .toLowerCase(),
  }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { ensureBlockedTable } = await import("@/lib/blocked-users.server");
    const sql = await getSql();
    await ensurePayments(sql);
    await ensureBlockedTable(sql);
    await sql`delete from blocked_emails where email = ${data.email}`;
    return readSnapshot(sql);
  });

export const getApprovedTestimonies = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensurePayments(sql);
  const rows = await sql<{ name: string; place: string; body: string; stars: number | string }>`
    select name, place, body, stars from testimonies where status = 'approved' order by created_at desc
  `;
  return rows.map((row) => ({
    name: row.name,
    place: row.place,
    text: row.body,
    stars: Math.min(5, Math.max(1, Number(row.stars) || 1)),
  }));
});

export const submitTestimony = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; place: string; text: string; stars: number }) => {
    const name = data?.name?.trim() ?? "";
    const place = data?.place?.trim() ?? "";
    const text = data?.text?.trim() ?? "";
    const stars = Number(data?.stars);
    if (name.length < 2) throw new Error("Enter your name.");
    if (place.length < 2) throw new Error("Enter your location.");
    if (text.length < 8) throw new Error("Write a short testimony.");
    if (!Number.isInteger(stars) || stars < 1 || stars > 5)
      throw new Error("Choose a star rating.");
    return { name: name.slice(0, 60), place: place.slice(0, 60), text: text.slice(0, 280), stars };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`
      insert into testimonies (id, name, place, body, stars, status)
      values (${crypto.randomUUID()}, ${data.name}, ${data.place}, ${data.text}, ${data.stars}, 'pending')
    `;
    return { ok: true };
  });

export const setTestimonyStatus = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string; status: string }) => {
    if (!data?.id) throw new Error("Missing testimony.");
    return { id: data.id, status: data.status === "approved" ? "approved" : "pending" };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update testimonies set status = ${data.status} where id = ${data.id}`;
    return readSnapshot(sql);
  });

export const deleteTestimony = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing testimony.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`delete from testimonies where id = ${data.id}`;
    return readSnapshot(sql);
  });

export const getAdminSnapshot = createServerFn({ method: "GET" })
  .middleware([adminAuthMiddleware])
  .handler(async (): Promise<AdminSnapshot> => {
    const { getSql } = await import("@/lib/db");
    return readSnapshot(await getSql());
  });

export const verifyAdminPasscode = createServerFn({ method: "POST" })
  .inputValidator((data: { passcode: string }) => {
    const passcode = typeof data?.passcode === "string" ? data.passcode.slice(0, 256) : "";
    if (!passcode.trim()) throw new Error("Enter your admin passcode.");
    return { passcode };
  })
  .handler(async ({ data }) => {
    const { authenticateAdmin } = await import("@/lib/admin-auth.server");
    return { authenticated: await authenticateAdmin(data.passcode) };
  });

export const checkAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const { hasAdminSession } = await import("@/lib/admin-auth.server");
  return { authenticated: await hasAdminSession() };
});

export type Storefront = {
  pricing: PricingSettings;
  businessName: string;
  whatsapp: string;
  email: string;
  wallets: MomoWallet[];
  banks: BankAccount[];
  nigeriaOn: boolean;
  nigeriaAccounts: BankAccount[];
  rates: { country: string; unit: string; perGhs: number }[];
};

export const getStorefront = createServerFn({ method: "GET" })
  .inputValidator((data?: { rev?: number }) => ({ rev: Number(data?.rev) || 0 }))
  .handler(async (): Promise<Storefront> => {
    const { getSql } = await import("@/lib/db");
    const snapshot = await readSnapshot(await getSql());
    const checkout = snapshot.gateway.checkout;
    const rates = [
      { country: "Nigeria", unit: "₦", perGhs: snapshot.gateway.nigeria },
      { country: "Kenya", unit: "KSh", perGhs: snapshot.gateway.kenya },
      { country: "Tanzania", unit: "TSh", perGhs: snapshot.gateway.tanzania },
      { country: "Zambia", unit: "ZK", perGhs: snapshot.gateway.zambia },
      { country: "South Africa", unit: "R", perGhs: snapshot.gateway.southAfrica },
    ].filter((rate) => rate.perGhs > 0);
    return {
      pricing: snapshot.pricing,
      businessName: checkout.businessName || "Games Hub",
      whatsapp: checkout.whatsapp,
      email: checkout.email,
      wallets: checkout.momo ? checkout.wallets.filter((wallet) => wallet.number) : [],
      banks: checkout.bank ? checkout.banks.filter((account) => account.number) : [],
      nigeriaOn: checkout.nigeriaOn,
      nigeriaAccounts: checkout.nigeriaOn
        ? checkout.nigeriaBanks.filter((account) => account.number)
        : [],
      rates,
    };
  });

export const getPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing payment.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user) throw new Error("Sign in to check your payment.");
    const sql = await getSql();
    await ensurePayments(sql);
    const rows = await sql<{
      status: string;
      purpose: PaymentPurpose;
      amount: number;
      session_minutes: number | null;
      virtual_credits: number | null;
    }>`
      select status, purpose, amount, session_minutes, virtual_credits from payments where id = ${data.id} and user_id = ${user.id}
    `;
    if (!rows[0]) throw new Error("This payment could not be found for your account.");
    const status = rows[0].status;
    return {
      status: status === "confirmed" || status === "rejected" ? status : "pending",
      purpose: rows[0].purpose,
      amount: Number(rows[0].amount),
      minutes: rows[0].session_minutes,
      credits: rows[0].virtual_credits,
    };
  });

export const getVirtualScanAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to check your Instant Virtual approval.");
  const sql = await getSql();
  await ensurePayments(sql);
  const approved = await sql<{ id: string }>`
    select id from payments where user_id = ${user.id}
      and purpose = 'virtual_credits' and status = 'confirmed' limit 1
  `;
  const activation = await sql<{ id: string }>`
    select id from payments where user_id = ${user.id}
      and purpose = 'activation' and status = 'confirmed' limit 1
  `;
  const pending = await sql<{ id: string; amount: number; credits: number }>`
    select id, amount, virtual_credits as credits from payments where user_id = ${user.id}
      and purpose = 'virtual_credits' and status = 'pending'
    order by created_at desc limit 1
  `;
  return {
    approved: approved.length > 0 && activation.length > 0,
    pending: pending[0]
      ? { id: pending[0].id, amount: Number(pending[0].amount), credits: pending[0].credits }
      : null,
  };
});

export const getVirtualCreditBalance = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to check your Instant Virtual credits.");
  const sql = await getSql();
  await ensurePayments(sql);
  const rows = await sql<{ balance: number }>`
    select balance from virtual_credit_wallets where user_id = ${user.id}
  `;
  return { balance: Number(rows[0]?.balance ?? 0) };
});

export const spendVirtualCredit = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string }) => {
    if (
      !data?.eventId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.eventId,
      )
    ) {
      throw new Error("Could not start the virtual game. Try again.");
    }
    return { eventId: data.eventId };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user) throw new Error("Sign in to play Instant Virtual.");
    const sql = await getSql();
    await ensurePayments(sql);
    const link = await getSportyLink();
    if (!link.signedIn || !link.linked || !link.activated) {
      throw new Error("Complete account setup before playing Instant Virtual.");
    }
    if (link.country !== "Ghana" && link.country !== "Nigeria") {
      throw new Error("Choose Ghana or Nigeria before playing Instant Virtual.");
    }
    const rows = await sql<{ spent: boolean; balance: number }>`
      select * from spend_virtual_credit(${user.id}, ${data.eventId})
    `;
    if (!rows[0]) throw new Error("Could not update your Instant Virtual balance. Try again.");
    return { spent: rows[0].spent, balance: Number(rows[0].balance) };
  });

export const hasPaidAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user) return { paid: false };
  const sql = await getSql();
  await ensurePayments(sql);
  const link = await getSportyLink();
  if (!link.activated) return { paid: false };
  const rows = await sql<{ id: string }>`
    select id from payments where user_id = ${user.id} and status = 'confirmed' and purpose = 'session'
    limit 1
  `;
  return { paid: rows.length > 0 };
});

export const recordPayment = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      amount: number;
      receipt?: string;
      referredBy?: string;
      purpose?: PaymentPurpose;
      packageId?: string;
      minutes?: number | null;
      credits?: number;
    }) => {
      const { name, receipt } = validatePaymentProof(data?.name, data?.receipt);
      const amount = Number(data?.amount);
      const referredBy = String(data?.referredBy ?? "")
        .trim()
        .slice(0, 80);
      const purpose = data.purpose ?? "session";
      if (purpose !== "session" && purpose !== "activation" && purpose !== "virtual_credits")
        throw new Error("Unknown payment purpose.");
      if (!Number.isInteger(amount) || amount < 1 || amount > 2_147_483_647)
        throw new Error("Enter a valid payment amount.");
      if (data.packageId !== undefined && typeof data.packageId !== "string")
        throw new Error("Unknown package.");
      if (
        data.minutes != null &&
        (!Number.isInteger(data.minutes) || data.minutes < 1 || data.minutes > 1440)
      )
        throw new Error("Enter valid session minutes.");
      if (
        purpose === "virtual_credits" &&
        (typeof data.credits !== "number" || ![1, 3, 5].includes(data.credits))
      ) {
        throw new Error("Choose a valid Instant Virtual credit package.");
      }
      return {
        name,
        amount,
        receipt,
        referredBy,
        purpose,
        packageId: data.packageId,
        minutes: data.minutes,
        credits: data.credits,
      };
    },
  )
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const sql = await getSql();
    const sessionUser = await getSessionUser();
    await ensurePayments(sql);
    if (!sessionUser) throw new Error("Sign in before submitting payment.");
    const link = await getSportyLink();
    if (!link.linked || !link.country) throw new Error("Connect your SportyBet number first.");
    if (data.purpose !== "activation" && !link.activated) {
      throw new Error("Complete activation approval before purchasing a package.");
    }
    if (data.purpose === "activation" && link.activated) {
      throw new Error("Your account is already activated.");
    }
    const { readPricing } = await import("@/lib/pricing.server");
    const quote =
      data.purpose === "virtual_credits"
        ? {
            ...validateVirtualCreditPurchase(data.amount, Number(data.credits), link.country),
            minutes: null,
            packageId: null,
          }
        : validatePaymentQuote(await readPricing(sql), link.country, data);
    let referredBy = "";
    if (sessionUser) {
      const refs = await sql<{ referred_by: string }>`
        select referred_by from referrals where user_id = ${sessionUser.id}
      `;
      referredBy = refs[0]?.referred_by ?? "";
      if (!referredBy && data.referredBy) referredBy = data.referredBy;
    } else if (data.referredBy) {
      referredBy = data.referredBy;
    }
    referredBy = await partnerCodeFor(sql, referredBy);
    if (sessionUser && referredBy) {
      await sql`
        insert into referrals (user_id, referred_by)
        values (${sessionUser.id}, ${referredBy})
        on conflict (user_id) do nothing
      `;
    }
    const id = crypto.randomUUID();
    const saved = await sql<{
      id: string;
      amount: number;
      session_minutes: number | null;
      virtual_credits: number | null;
    }>`
      insert into payments (id, payer_name, amount, status, user_id, referred_by, receipt, purpose, package_id, session_minutes, country, virtual_credits)
      select ${id}, ${data.name}, ${quote.amount}, 'pending', ${sessionUser.id}, ${referredBy}, ${data.receipt}, ${data.purpose}, ${quote.packageId}, ${quote.minutes}, ${link.country}, ${data.purpose === "virtual_credits" ? data.credits : null}
      returning id, amount, session_minutes, virtual_credits
    `;
    if (!saved[0]) throw new Error("Could not save your payment. Please try again.");
    return {
      ok: true,
      id: saved[0].id,
      amount: Number(saved[0].amount),
      minutes: saved[0].session_minutes,
      credits: saved[0].virtual_credits,
    };
  });

export const getPaymentProof = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing payment.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    const rows = await sql<{
      receipt: string | null;
    }>`select receipt from payments where id = ${data.id}`;
    return { receipt: rows[0]?.receipt ?? "" };
  });

async function ensureDeskPasses(sql: Sql) {
  await sql`
    create table if not exists desk_passes (
      token text primary key,
      user_id text not null,
      login_number text not null,
      expires_at timestamptz not null
    )
  `;
}

export const confirmedDeskLogin = createServerFn({ method: "GET" }).handler(async () => {
  const empty = { login: "", pass: "" };
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user) return empty;
  const sql = await getSql();
  await ensurePayments(sql);
  const link = await getSportyLink();
  if (!link.activated) return empty;
  await ensureDeskPasses(sql);
  const paid = await sql<{ ok: number }>`
    select 1 as ok from payments where user_id = ${user.id} and status = 'confirmed' and purpose = 'session'
    limit 1
  `;
  if (paid.length === 0) return empty;
  const nums = await sql<{
    number: string;
  }>`select number from sporty_accounts where user_id = ${user.id} limit 1`;
  const login = (nums[0]?.number ?? "").replace(/\D/g, "").slice(0, 12);
  const safeLogin = /^\d{4,12}$/.test(login) ? login : "";
  await sql`delete from desk_passes where expires_at <= now()`;
  await sql`delete from desk_passes where user_id = ${user.id} and login_number <> ${safeLogin}`;
  const live = await sql<{ token: string }>`
    select token from desk_passes
    where user_id = ${user.id} and login_number = ${safeLogin} and expires_at > now()
    limit 1
  `;
  if (live.length > 0) return { login: safeLogin, pass: live[0].token };
  const token = crypto.randomUUID().replace(/-/g, "");
  await sql`
    insert into desk_passes (token, user_id, login_number, expires_at)
    values (${token}, ${user.id}, ${safeLogin}, now() + interval '12 hours')
  `;
  return { login: safeLogin, pass: token };
});

export const confirmPayment = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing payment.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update payments set status = 'confirmed', confirmed_at = now() where id = ${data.id} and status = 'pending'`;
    const linked = await sql<{ user_id: string | null; referred_by: string | null }>`
      select user_id, referred_by from payments where id = ${data.id}
    `;
    const payment = linked[0];
    let referredBy = payment?.referred_by?.trim() ?? "";
    if (!referredBy && payment?.user_id) {
      const refs = await sql<{ referred_by: string }>`
        select referred_by from referrals where user_id = ${payment.user_id}
      `;
      referredBy = refs[0]?.referred_by ?? "";
    }
    referredBy = await partnerCodeFor(sql, referredBy);
    if (referredBy) {
      await sql`update payments set referred_by = ${referredBy} where id = ${data.id}`;
    }
    return readSnapshot(sql);
  });

export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing payment.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update payments set status = 'rejected' where id = ${data.id} and status = 'pending'`;
    return readSnapshot(sql);
  });

export const reversePayment = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing payment.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update payments set status = 'rejected', counts_revenue = false, confirmed_at = null where id = ${data.id} and status = 'confirmed'`;
    return readSnapshot(sql);
  });

export const saveReferral = createServerFn({ method: "POST" })
  .inputValidator((data: { referredBy?: string }) => ({
    referredBy: (data?.referredBy?.trim() ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.referredBy) return { ok: true };
    const { getSql } = await import("@/lib/db");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user) return { ok: false };
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`
      insert into referrals (user_id, referred_by)
      values (${user.id}, ${data.referredBy})
      on conflict (user_id) do nothing
    `;
    return { ok: true };
  });

/** Copies package-page credentials once. password_hash is the existing account hash and is never returned. */
export async function retainRegisteredProfile(sql: Sql, userId: string) {
  await ensurePayments(sql);
  await sql`
    insert into player_country (user_id, country)
    select user_id, country from registered_users
    where user_id = ${userId} and country in ('Ghana', 'Nigeria')
    on conflict (user_id) do nothing
  `;
  await sql`
    insert into sporty_accounts (user_id, number, linked_at)
    select user_id, sporty_number, registered_at from registered_users
    where user_id = ${userId}
    on conflict (user_id) do nothing
  `;
  const rows = await sql<{
    id: string;
    name: string;
    email: string;
    country: string;
    sporty_number: string;
    password_hash: string | null;
    registered_at: string | Date | null;
  }>`
    select u.id, u.name, u.email, c.country, s.number as sporty_number,
      (
        select a.password from "account" a
        where a."userId" = u.id and a.password is not null
        order by case when a."providerId" = 'credential' then 0 else 1 end
        limit 1
      ) as password_hash,
      coalesce(s.linked_at, u."createdAt") as registered_at
    from "user" u
    join player_country c on c.user_id = u.id
    join sporty_accounts s on s.user_id = u.id
    where u.id = ${userId}
      and c.country in ('Ghana', 'Nigeria')
    limit 1
  `;
  const row = rows[0];
  if (!row?.id) return false;
  await sql`
    update "user" set "isCompleted" = true
    where id = ${row.id} and "isCompleted" is not true
  `;
  await sql`
    insert into registered_users (user_id, name, email, country, sporty_number, password_hash, registered_at)
    values (
      ${row.id},
      ${row.name},
      ${row.email},
      ${row.country},
      ${row.sporty_number},
      ${row.password_hash},
      ${row.registered_at ?? new Date().toISOString()}
    )
    on conflict (user_id) do update
    set password_hash = coalesce(registered_users.password_hash, excluded.password_hash)
  `;
  return true;
}

export const getSportyLink = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user) {
    return {
      linked: false,
      country: null as "Ghana" | "Nigeria" | null,
      locked: false,
      signedIn: false,
      completed: false,
      activated: false,
      activationPayment: null as { id: string; amount: number } | null,
    };
  }
  const sql = await getSql();
  await ensurePayments(sql);
  const retained = await retainRegisteredProfile(sql, user.id);
  const countryRows = await sql<{
    country: string;
  }>`select country from player_country where user_id = ${user.id}`;
  const country =
    countryRows[0]?.country === "Nigeria"
      ? "Nigeria"
      : countryRows[0]?.country === "Ghana"
        ? "Ghana"
        : null;
  const completedRows = await sql<{ completed: boolean }>`
    select "isCompleted" as completed from "user" where id = ${user.id} limit 1
  `;
  const flag = completedRows[0]?.completed as unknown;
  const completed = retained || flag === true || flag === "t" || flag === "true" || flag === 1;
  const linked = retained;
  const activationRows = await sql<{ id: string; amount: number; status: string }>`
    select id, amount, status from payments
    where user_id = ${user.id} and purpose = 'activation' and status in ('pending', 'confirmed')
    order by (status = 'confirmed') desc, created_at desc
    limit 1
  `;
  const activation = activationRows[0];
  return {
    linked,
    country,
    locked: linked && country != null,
    signedIn: true,
    completed,
    activated: activation?.status === "confirmed",
    activationPayment: activation ? { id: activation.id, amount: Number(activation.amount) } : null,
  };
});

export const savePlayerCountry = createServerFn({ method: "POST" })
  .inputValidator((data: { country: string }) => {
    const country =
      data?.country === "Nigeria" ? "Nigeria" : data?.country === "Ghana" ? "Ghana" : "";
    if (!country) throw new Error("Choose Ghana or Nigeria.");
    return { country: country as "Ghana" | "Nigeria" };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user) throw new Error("Sign in first.");
    const sql = await getSql();
    await ensurePayments(sql);
    const linked = await sql<{
      user_id: string;
    }>`select user_id from sporty_accounts where user_id = ${user.id}`;
    const existing = await sql<{
      country: string;
    }>`select country from player_country where user_id = ${user.id}`;
    const saved =
      existing[0]?.country === "Nigeria"
        ? "Nigeria"
        : existing[0]?.country === "Ghana"
          ? "Ghana"
          : null;
    if (linked.length > 0 && saved) return { country: saved, locked: true };
    await sql`
      insert into player_country (user_id, country)
      values (${user.id}, ${data.country})
      on conflict (user_id) do update set country = excluded.country
    `;
    return { country: data.country, locked: false };
  });

export const abandonUnlinkedAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user || user.id === "dev-user") return { removed: false };
  const sql = await getSql();
  await ensurePayments(sql);
  const kept = await sql<{
    user_id: string;
  }>`select user_id from registered_users where user_id = ${user.id} limit 1`;
  if (kept.length > 0) return { removed: false };
  const linked = await sql<{
    user_id: string;
  }>`select user_id from sporty_accounts where user_id = ${user.id}`;
  if (linked.length > 0) return { removed: false };
  const completedRows = await sql<{ completed: boolean }>`
    select "isCompleted" as completed from "user" where id = ${user.id} limit 1
  `;
  const flag = completedRows[0]?.completed as unknown;
  if (flag === true || flag === "t" || flag === "true" || flag === 1) return { removed: false };
  await sql`delete from referrals where user_id = ${user.id}`;
  await sql`delete from player_country where user_id = ${user.id}`;
  await sql`delete from "user" where id = ${user.id}`;
  return { removed: true };
});

export const saveSportyLink = createServerFn({ method: "POST" })
  .inputValidator((data: { number: string }) => {
    const number = String(data?.number ?? "").replace(/\D/g, "");
    if (!/^\d{9,11}$/.test(number)) throw new Error("Enter a valid SportyBet number.");
    return { number };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user) throw new Error("Sign in before linking SportyBet.");
    const sql = await getSql();
    await ensurePayments(sql);
    const saved = await sql<{
      country: string;
    }>`select country from player_country where user_id = ${user.id}`;
    const country =
      saved[0]?.country === "Nigeria" ? "Nigeria" : saved[0]?.country === "Ghana" ? "Ghana" : "";
    const lengthOk =
      country === "Nigeria"
        ? data.number.length === 10 || data.number.length === 11
        : country === "Ghana" && (data.number.length === 9 || data.number.length === 10);
    if (!lengthOk) {
      throw new Error(
        country === "Nigeria"
          ? "Enter a 10 or 11 digit SportyBet number."
          : "Enter a 9 or 10 digit SportyBet number.",
      );
    }
    await sql`
      insert into sporty_accounts (user_id, number, linked_at)
      values (${user.id}, ${data.number}, now())
      on conflict (user_id) do nothing
    `;
    return { linked: true };
  });

export const markAccountCompleted = createServerFn({ method: "POST" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in before linking SportyBet.");
  const sql = await getSql();
  await ensurePayments(sql);
  const retained = await retainRegisteredProfile(sql, user.id);
  if (!retained) throw new Error("Finish country and SportyBet before opening packages.");
  return { isCompleted: true };
});

/** Keeps an approved partner's login hash. The hash is never returned to the client. */
async function retainPartnerLogin(sql: Sql, partnerId: string) {
  await sql`
    insert into partner_logins (email, partner_id, name, password_hash, code, approved_at)
    select lower(email), id, name, password_hash, code, coalesce(created_at, now())
    from partners
    where id = ${partnerId}
      and password_hash is not null
      and password_hash <> ''
      and status is distinct from 'pending'
    on conflict (email) do update
    set password_hash = coalesce(partner_logins.password_hash, excluded.password_hash),
        partner_id = excluded.partner_id,
        name = excluded.name,
        code = excluded.code
  `;
}

function partnerCode(name: string) {
  const base =
    name
      .replace(/[^a-z]/gi, "")
      .slice(0, 5)
      .toUpperCase() || "PART";
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

async function hashPassword(password: string) {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export const addPartner = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { name: string; email: string; password: string; code?: string }) => {
    const name = data?.name?.trim() ?? "";
    const email = data?.email?.trim().toLowerCase() ?? "";
    const password = data?.password ?? "";
    const code = (data?.code ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (name.length < 2) throw new Error("Enter the partner name.");
    if (!email.includes("@")) throw new Error("Enter a valid email.");
    if (password.length < 6) throw new Error("Use at least 6 characters.");
    return { name, email, password, code };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    let code = data.code;
    if (!code) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const next = partnerCode(data.name);
        const taken = await sql<{
          id: string;
        }>`select id from partners where lower(code) = ${next.toLowerCase()}`;
        if (taken.length === 0) {
          code = next;
          break;
        }
      }
    }
    if (!code) throw new Error("Could not create a referral code.");
    const existing = await sql<{ id: string }>`
      select id from partners where lower(email) = ${data.email} or lower(code) = ${code.toLowerCase()}
    `;
    if (existing.length > 0) throw new Error("That email or referral code is already used.");
    const id = crypto.randomUUID();
    await sql`
      insert into partners (id, name, email, password_hash, code, commission)
      values (${id}, ${data.name}, ${data.email}, ${await hashPassword(data.password)}, ${code}, 0)
    `;
    await retainPartnerLogin(sql, id);
    return readSnapshot(sql);
  });

export const applyPartner = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; email: string; password: string }) => {
    const name = data?.name?.trim() ?? "";
    const email = data?.email?.trim().toLowerCase() ?? "";
    const password = data?.password ?? "";
    if (name.length < 2) throw new Error("Enter your full name.");
    if (!email.includes("@")) throw new Error("Enter a valid email.");
    if (password.length < 6) throw new Error("Use at least 6 characters.");
    return { name, email, password };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`alter table partners add column if not exists token text`;
    const existing = await sql<{
      id: string;
    }>`select id from partners where lower(email) = ${data.email}`;
    if (existing.length > 0) throw new Error("That email is already registered.");
    let code = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const next = partnerCode(data.name);
      const taken = await sql<{
        id: string;
      }>`select id from partners where lower(code) = ${next.toLowerCase()}`;
      if (taken.length === 0) {
        code = next;
        break;
      }
    }
    if (!code) throw new Error("Could not create a referral code.");
    const token = crypto.randomUUID();
    await sql`
      insert into partners (id, name, email, password_hash, code, status, token, commission)
      values (${crypto.randomUUID()}, ${data.name}, ${data.email}, ${await hashPassword(data.password)}, ${code}, 'pending', ${token}, 0)
    `;
    return { token };
  });

export const getPartnerGate = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => {
    const token = data?.token?.trim() ?? "";
    if (!token) throw new Error("Missing application.");
    return { token };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`alter table partners add column if not exists token text`;
    const rows = await sql<{
      status: string;
    }>`select status from partners where token = ${data.token}`;
    const status = rows[0]?.status;
    if (status === "pending" || status === "approved" || status === "locked") return { status };
    return { status: "missing" as const };
  });

export const setPartnerLock = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string; locked: boolean }) => {
    if (!data?.id) throw new Error("Missing partner.");
    return { id: data.id, locked: Boolean(data.locked) };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update partners set status = ${data.locked ? "locked" : "approved"} where id = ${data.id}`;
    if (!data.locked) await retainPartnerLogin(sql, data.id);
    return readSnapshot(sql);
  });

export const setPartnerCommission = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string; commission: number }) => {
    const commission = Number(data?.commission);
    if (!data?.id) throw new Error("Missing partner.");
    if (!Number.isInteger(commission) || commission < 0 || commission > 100)
      throw new Error("Enter a commission from 0 to 100.");
    return { id: data.id, commission };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update partners set commission = ${data.commission} where id = ${data.id}`;
    return readSnapshot(sql);
  });

export const setPartnerPayoutStatus = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string; status: "paid" | "rejected" }) => {
    if (!data?.id) throw new Error("Missing payout request.");
    if (data.status !== "paid" && data.status !== "rejected")
      throw new Error("Choose a valid payout status.");
    return { id: data.id, status: data.status };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    const updated = await sql<{ id: string }>`
      update partner_payouts
      set status = ${data.status}
      where id = ${data.id} and status = 'pending'
      returning id
    `;
    if (updated.length === 0) throw new Error("This payout request has already been processed.");
    return readSnapshot(sql);
  });

export const deletePartner = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing partner.");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`delete from partners where id = ${data.id}`;
    return readSnapshot(sql);
  });

async function passwordMatches(password: string, stored: string) {
  const { scryptSync, timingSafeEqual } = await import("node:crypto");
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export const partnerLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => {
    const email = data?.email?.trim().toLowerCase() ?? "";
    const password = data?.password ?? "";
    if (!email || !password) throw new Error("Enter your email and password.");
    return { email, password };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`alter table partners add column if not exists token text`;
    const rows = await sql<{
      id: string;
      password_hash: string;
      status: string;
      token: string | null;
    }>`
      select id, password_hash, status, token from partners where lower(email) = ${data.email}
    `;
    const partner = rows[0];
    if (!partner) throw new Error("Wrong email or password.");
    if (partner.status === "pending")
      throw new Error("An admin must approve your application before you can sign in.");
    if (partner.status === "locked") throw new Error("This partner account is locked.");
    const saved = await sql<{ password_hash: string }>`
      select password_hash from partner_logins where email = ${data.email} limit 1
    `;
    const stored = partner.password_hash || saved[0]?.password_hash || "";
    const matches =
      (await passwordMatches(data.password, stored)) ||
      (saved[0] ? await passwordMatches(data.password, saved[0].password_hash) : false);
    if (!matches) throw new Error("Wrong email or password.");
    if (!partner.password_hash && saved[0]?.password_hash) {
      await sql`update partners set password_hash = ${saved[0].password_hash} where id = ${partner.id}`;
    }
    await retainPartnerLogin(sql, partner.id);
    let token = partner.token?.trim() ?? "";
    if (!token) {
      token = crypto.randomUUID();
      await sql`update partners set token = ${token} where id = ${partner.id}`;
    }
    return { token };
  });

export const getPartnerPortal = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => {
    const token = data?.token?.trim() ?? "";
    if (!token) throw new Error("Sign in again.");
    return { token };
  })
  .handler(async ({ data }): Promise<PartnerPortal> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`alter table partners add column if not exists token text`;
    const rows = await sql<{
      id: string;
      name: string;
      email: string;
      code: string;
      status: string;
      commission: number | string;
    }>`
      select id, name, email, code, status, commission from partners where token = ${data.token}
    `;
    const partner = rows[0];
    if (!partner || partner.status !== "approved") throw new Error("Sign in again.");
    const code = partner.code.toLowerCase();
    const name = partner.name.toLowerCase();
    const commission = Number(partner.commission) || 0;
    const memberRows = await sql<{ total: number | string }>`
      select count(*) as total from referrals r
      join registered_users reg on reg.user_id = r.user_id
      where lower(r.referred_by) = ${code} or lower(r.referred_by) = ${name}
    `;
    const payments = await partnerConfirmedPayments(sql, code);
    const earnings = (amount: number) => partnerEarnings(amount, commission);
    const ghanaPayments = payments.filter(
      (row) => !isNairaPayment(Number(row.amount), row.country),
    );
    const nigeriaPayments = payments.filter((row) =>
      isNairaPayment(Number(row.amount), row.country),
    );
    const revenue = ghanaPayments.reduce((sum, row) => sum + Number(row.amount), 0);
    const nigeriaRevenue = nigeriaPayments.reduce((sum, row) => sum + Number(row.amount), 0);
    const payoutRows = await sql<{
      id: string;
      amount: number | string;
      currency: string;
      gross_revenue: number | string;
      commission_percent: number | string;
      commission_amount: number | string;
      net_earnings: number | string;
      account_type: string;
      institution: string;
      account_name: string;
      account_number: string;
      earning_date: string;
      status: string;
      requested_at: string | Date;
    }>`
      select id, amount, currency, gross_revenue, commission_percent, commission_amount, net_earnings,
        account_type, institution, account_name, account_number, earning_date, status, requested_at
      from partner_payouts where partner_id = ${partner.id} order by requested_at desc
    `;
    const payouts: PartnerPayout[] = payoutRows.map((row) => {
      const requestedAt =
        row.requested_at instanceof Date ? row.requested_at : new Date(row.requested_at);
      return {
        id: row.id,
        partnerId: partner.id,
        partnerName: partner.name,
        partnerEmail: partner.email,
        amount: Number(row.amount),
        currency: row.currency === "NGN" ? "NGN" : "GHS",
        grossRevenue: Number(row.gross_revenue),
        commissionPercent: Number(row.commission_percent),
        commissionAmount: Number(row.commission_amount),
        netEarnings: Number(row.net_earnings),
        accountType: row.account_type === "Mobile Money" ? "Mobile Money" : "Bank Transfer",
        institution: row.institution,
        accountName: row.account_name,
        accountNumber: row.account_number,
        earningDate: row.earning_date,
        status: row.status === "paid" || row.status === "rejected" ? row.status : "pending",
        requestedAt: Number.isNaN(requestedAt.getTime()) ? "" : requestedAt.toISOString(),
      };
    });
    const ghsEarnings = earnings(revenue);
    const ngnEarnings = earnings(nigeriaRevenue);
    const reservedGhs = payouts
      .filter((payout) => payout.currency === "GHS" && payout.status !== "rejected")
      .reduce((sum, payout) => sum + payout.amount, 0);
    const reservedNgn = payouts
      .filter((payout) => payout.currency === "NGN" && payout.status !== "rejected")
      .reduce((sum, payout) => sum + payout.amount, 0);
    const availableGhs = Math.max(0, ghsEarnings - reservedGhs);
    const availableNgn = Math.max(0, ngnEarnings - reservedNgn);
    const settlements = [
      { currency: "GHS" as const, earningDate: "total", available: availableGhs },
      { currency: "NGN" as const, earningDate: "total", available: availableNgn },
    ];
    const now = new Date();
    const ghanaToday = dayKeyInZone(now, GHANA_TZ);
    const nigeriaToday = dayKeyInZone(now, NIGERIA_TZ);
    const todayPayments = ghanaPayments.filter(
      (row) => dayKeyInZone(row.created_at, GHANA_TZ) === ghanaToday,
    );
    const nigeriaTodayPayments = nigeriaPayments.filter(
      (row) => dayKeyInZone(row.created_at, NIGERIA_TZ) === nigeriaToday,
    );
    const todayRevenue = todayPayments.reduce((sum, row) => sum + Number(row.amount), 0);
    const nigeriaTodayRevenue = nigeriaTodayPayments.reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );
    const buildDays = (rows: typeof payments, timeZone: string, todayKey: string) =>
      Array.from({ length: 7 }, (_, index) => {
        const key = shiftDayKey(todayKey, index - 6, timeZone);
        const amount = rows
          .filter((row) => dayKeyInZone(row.created_at, timeZone) === key)
          .reduce((sum, row) => sum + Number(row.amount), 0);
        return {
          label: liveDayLabel(key, timeZone),
          revenue: amount,
          earnings: earnings(amount),
          today: key === todayKey,
        };
      });
    const days = buildDays(ghanaPayments, GHANA_TZ, ghanaToday);
    const nigeriaDays = buildDays(nigeriaPayments, NIGERIA_TZ, nigeriaToday);
    const spendGhs = new Map<string, number>();
    const spendNgn = new Map<string, number>();
    for (const row of payments) {
      const amount = Number(row.amount);
      const bucket = isNairaPayment(amount, row.country) ? spendNgn : spendGhs;
      bucket.set(row.user_id, (bucket.get(row.user_id) ?? 0) + amount);
    }
    const referred = await sql<{
      name: string;
      email: string;
      joined: string | Date;
      user_id: string;
      country: string | null;
    }>`
      select reg.name, reg.email, reg.registered_at as joined, reg.user_id, reg.country
      from referrals r
      join registered_users reg on reg.user_id = r.user_id
      where lower(r.referred_by) = ${code} or lower(r.referred_by) = ${name}
      order by reg.registered_at desc
    `;
    const referrals = referred.map((row) => {
      const joinedAt = row.joined instanceof Date ? row.joined : new Date(row.joined);
      const ghs = spendGhs.get(row.user_id) ?? 0;
      const ngn = spendNgn.get(row.user_id) ?? 0;
      const country: "Ghana" | "Nigeria" | null =
        row.country === "Nigeria" ? "Nigeria" : row.country === "Ghana" ? "Ghana" : null;
      return {
        name: row.name,
        email: row.email,
        status: ghs + ngn > 0 ? ("paid" as const) : ("unpaid" as const),
        joined: Number.isNaN(joinedAt.getTime()) ? "" : joinedAt.toISOString(),
        spend: country === "Nigeria" ? ngn : ghs,
        spendGhs: ghs,
        spendNgn: ngn,
        country,
      };
    });
    return {
      name: partner.name,
      code: partner.code,
      commission,
      members: Number(memberRows[0]?.total ?? 0),
      active: new Set(payments.map((row) => row.user_id)).size,
      todayRevenue,
      todaySales: todayPayments.length,
      todayEarnings: earnings(todayRevenue),
      revenue,
      earnings: earnings(revenue),
      nigeriaTodayRevenue,
      nigeriaTodaySales: nigeriaTodayPayments.length,
      nigeriaTodayEarnings: earnings(nigeriaTodayRevenue),
      nigeriaRevenue,
      nigeriaEarnings: earnings(nigeriaRevenue),
      availableGhs,
      availableNgn,
      settlements,
      payouts,
      days,
      nigeriaDays,
      referrals,
    };
  });

async function partnerConfirmedPayments(sql: Sql, code: string) {
  return sql<{
    amount: number | string;
    created_at: string | Date;
    user_id: string;
    country: string | null;
  }>`
      select p.amount, coalesce(p.confirmed_at, p.created_at) as created_at, p.user_id, coalesce(p.country, c.country) as country
      from payments p
      left join referrals r on r.user_id = p.user_id
      left join player_country c on c.user_id = p.user_id
      join lateral (
        select code from partners
        where lower(code) = lower(coalesce(nullif(p.referred_by, ''), ''))
           or lower(name) = lower(coalesce(nullif(p.referred_by, ''), ''))
           or lower(code) = lower(coalesce(r.referred_by, ''))
           or lower(name) = lower(coalesce(r.referred_by, ''))
        order by case
          when lower(code) = lower(coalesce(nullif(p.referred_by, ''), '')) then 0
          when lower(name) = lower(coalesce(nullif(p.referred_by, ''), '')) then 1
          when lower(code) = lower(coalesce(r.referred_by, '')) then 2
          else 3
        end
        limit 1
      ) partner on true
      where p.status = 'confirmed' and p.counts_revenue is not false
        and lower(partner.code) = ${code}
    `;
}

export const requestPartnerPayout = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      amount: number;
      currency: "GHS" | "NGN";
      earningDate?: string;
      accountType: "Mobile Money" | "Bank Transfer";
      institution: string;
      accountName: string;
      accountNumber: string;
    }) => {
      const token = data?.token?.trim() ?? "";
      const amount = Number(data?.amount);
      const currency = data?.currency;
      const earningDate = typeof data?.earningDate === "string" ? data.earningDate.trim() : "";
      const accountType = data?.accountType;
      const institution = typeof data?.institution === "string" ? data.institution.trim() : "";
      const accountName = typeof data?.accountName === "string" ? data.accountName.trim() : "";
      const accountNumber =
        typeof data?.accountNumber === "string" ? data.accountNumber.trim() : "";
      if (!token) throw new Error("Sign in again.");
      if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new Error("Enter a valid payout amount.");
      if (currency !== "GHS" && currency !== "NGN") throw new Error("Choose a payout currency.");
      if (accountType !== "Mobile Money" && accountType !== "Bank Transfer")
        throw new Error("Choose a payout method.");
      if (institution.length < 2 || institution.length > 100)
        throw new Error("Enter a valid bank or mobile money provider.");
      if (accountName.length < 2 || accountName.length > 100)
        throw new Error("Enter the account holder's name.");
      if (!/^[a-z\d +()-]{4,34}$/i.test(accountNumber))
        throw new Error("Enter a valid account number.");
      return {
        token,
        amount,
        currency,
        earningDate,
        accountType,
        institution,
        accountName,
        accountNumber,
      };
    },
  )
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    const rows = await sql<{
      id: string;
      name: string;
      email: string;
      code: string;
      status: string;
      commission: number | string;
    }>`
      select id, name, email, code, status, commission from partners where token = ${data.token}
    `;
    const partner = rows[0];
    if (!partner || partner.status !== "approved") throw new Error("Sign in again.");
    const commission = Number(partner.commission) || 0;
    const confirmed = await partnerConfirmedPayments(sql, partner.code.toLowerCase());
    const eligiblePayments = confirmed.filter(
      (row) => (data.currency === "NGN") === isNairaPayment(Number(row.amount), row.country),
    );
    const gross = eligiblePayments.reduce((sum, row) => sum + Number(row.amount), 0);
    const netEarnings = partnerEarnings(gross, commission);
    const adminCut = adminEarnings(gross, commission);
    const reservedRows = await sql<{ reserved: number | string }>`
      select coalesce(sum(amount), 0) as reserved
      from partner_payouts
      where partner_id = ${partner.id} and currency = ${data.currency}
        and status in ('pending', 'paid')
    `;
    const available = availableTotalPartnerEarnings(
      netEarnings,
      Number(reservedRows[0]?.reserved ?? 0),
    );
    if (data.amount > available) throw new Error("Payout amount exceeds your available earnings.");
    const timeZone = data.currency === "NGN" ? NIGERIA_TZ : GHANA_TZ;
    const earningDate =
      data.earningDate && /^\d{4}-\d{2}-\d{2}$/.test(data.earningDate)
        ? data.earningDate
        : dayKeyInZone(new Date(), timeZone);
    const inserted = await sql<{ id: string }>`
      insert into partner_payouts
        (id, partner_id, partner_name, partner_email, amount, currency, account_type, institution, account_name,
          account_number, earning_date, gross_revenue, commission_percent, commission_amount, net_earnings)
      values
        (${crypto.randomUUID()}, ${partner.id}, ${partner.name}, ${partner.email}, ${data.amount}, ${data.currency},
          ${data.accountType}, ${data.institution}, ${data.accountName}, ${data.accountNumber}, ${earningDate},
          ${gross}, ${commission}, ${adminCut}, ${netEarnings})
      on conflict (partner_id, currency) where status = 'pending' do nothing
      returning id
    `;
    if (inserted.length === 0)
      throw new Error(
        "You already have a pending payout request for this currency. Please wait until it is processed.",
      );
    return { requested: true };
  });

export const savePricing = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: PricingSettings) => validatePricing(data))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { writePricing } = await import("@/lib/pricing.server");
    const sql = await getSql();
    await ensurePayments(sql);
    await writePricing(sql, data);
    return readSnapshot(sql);
  });

export const saveGatewayRates = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: GatewayRates) => {
    const rate = (value: number) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw new Error("Enter a valid rate.");
      return number;
    };
    return {
      nigeria: rate(data?.nigeria),
      kenya: rate(data?.kenya),
      tanzania: rate(data?.tanzania),
      zambia: rate(data?.zambia),
      southAfrica: rate(data?.southAfrica),
    };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`
      update gateway_settings
      set nigeria = ${data.nigeria},
          kenya = ${data.kenya},
          tanzania = ${data.tanzania},
          zambia = ${data.zambia},
          south_africa = ${data.southAfrica}
      where id = 'main'
    `;
    return readSnapshot(sql);
  });

const DEFAULT_CHECKOUT: GatewayCheckout = {
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
  nigeriaBanks: [{ bank: "", number: "", name: "" }],
  wallets: [{ network: "", number: "", name: "" }],
  banks: [{ bank: "", number: "", name: "" }],
};

function readMomoNetwork(value: unknown, hasDetails: boolean): MomoNetwork {
  const network = String(value ?? "").trim();
  if (network === "Telecel Cash (Vodafone)" || network === "Telecel") {
    return hasDetails ? "Telecel Cash" : "";
  }
  if (network === "MTN") return "MTN Mobile Money";
  if (network === "AirtelTigo") return "AirtelTigo Money";
  return GHANA_MOMO_NETWORKS.find((option) => option.value === network)?.value ?? "";
}

function cleanList<T>(value: unknown, map: (item: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map(map)
    .slice(0, 6);
}

function readCheckout(value: string | null | undefined): GatewayCheckout {
  if (!value) return DEFAULT_CHECKOUT;
  try {
    const parsed = JSON.parse(value) as Partial<GatewayCheckout>;
    const wallets = cleanList(parsed.wallets, (item) => ({
      network: readMomoNetwork(item.network, Boolean(item.number || item.name)),
      number: String(item.number ?? ""),
      name: String(item.name ?? ""),
    }));
    const banks = cleanList(parsed.banks, (item) => ({
      bank: String(item.bank ?? ""),
      number: String(item.number ?? ""),
      name: String(item.name ?? ""),
    }));
    const nigeriaBanks = cleanList(parsed.nigeriaBanks, (item) => ({
      bank: String(item.bank ?? ""),
      number: String(item.number ?? ""),
      name: String(item.name ?? ""),
    }));
    return {
      ...DEFAULT_CHECKOUT,
      ...parsed,
      currency: "GHS",
      paystack: Boolean(parsed.paystack),
      flutterwave: Boolean(parsed.flutterwave),
      royaltech: Boolean(parsed.royaltech),
      cowrie: Boolean(parsed.cowrie),
      momo: Boolean(parsed.momo),
      bank: Boolean(parsed.bank),
      nigeriaOn: Boolean(parsed.nigeriaOn),
      wallets: wallets.length > 0 ? wallets : DEFAULT_CHECKOUT.wallets,
      banks: banks.length > 0 ? banks : DEFAULT_CHECKOUT.banks,
      nigeriaBanks: nigeriaBanks.length > 0 ? nigeriaBanks : DEFAULT_CHECKOUT.nigeriaBanks,
    };
  } catch {
    return DEFAULT_CHECKOUT;
  }
}

export const saveGatewayCheckout = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: GatewayCheckout) => {
    const whatsapp = String(data?.whatsapp ?? "").replace(/[^\d]/g, "");
    const email = String(data?.email ?? "").trim();
    if (email && !email.includes("@")) throw new Error("Enter a valid support email.");
    const wallets = cleanList(data?.wallets, (item) => ({
      network: readMomoNetwork(item.network, Boolean(item.number || item.name)),
      number: String(item.number ?? "")
        .replace(/[^\d]/g, "")
        .slice(0, 15),
      name: String(item.name ?? "")
        .trim()
        .slice(0, 80),
    })).filter((item) => item.number || item.name);
    if (wallets.some((wallet) => !wallet.network))
      throw new Error("Choose a network for each Ghana MoMo wallet.");
    const banks = cleanList(data?.banks, (item) => ({
      bank: String(item.bank ?? "")
        .trim()
        .slice(0, 40),
      number: String(item.number ?? "")
        .replace(/[^\d]/g, "")
        .slice(0, 20),
      name: String(item.name ?? "")
        .trim()
        .slice(0, 80),
    })).filter((item) => item.bank || item.number || item.name);
    if (banks.some((account) => (account.number || account.name) && !account.bank)) {
      throw new Error("Choose a bank for each Ghana bank account.");
    }
    return {
      currency: "GHS",
      businessName:
        String(data?.businessName ?? "")
          .trim()
          .slice(0, 80) || "Games Hub",
      whatsapp,
      email,
      paystack: Boolean(data?.paystack),
      flutterwave: Boolean(data?.flutterwave),
      royaltech: Boolean(data?.royaltech),
      cowrie: Boolean(data?.cowrie),
      momo: Boolean(data?.momo),
      bank: Boolean(data?.bank),
      nigeriaOn: Boolean(data?.nigeriaOn),
      wallets,
      banks,
      nigeriaBanks: cleanList(data?.nigeriaBanks, (item) => ({
        bank: String(item.bank ?? "")
          .trim()
          .slice(0, 40),
        number: String(item.number ?? "")
          .replace(/[^\d]/g, "")
          .slice(0, 20),
        name: String(item.name ?? "")
          .trim()
          .slice(0, 80),
      })).filter((item) => item.bank || item.number || item.name),
    };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensurePayments(sql);
    await sql`update gateway_settings set checkout = ${JSON.stringify(data)} where id = 'main'`;
    return readSnapshot(sql);
  });
