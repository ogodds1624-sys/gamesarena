import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { DEFAULT_PRICING, paymentQuote, validatePaymentQuote, validatePricing } from "./pricing.ts";
import { readPricing, writePricing } from "./pricing.server.ts";
import { confirmPendingPayment, readSession } from "./desk-session.ts";

test("pricing validates both countries and rejects invalid prices, minutes, and package tiers", () => {
  assert.deepEqual(validatePricing(DEFAULT_PRICING), DEFAULT_PRICING);
  for (const value of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
    const pricing = structuredClone(DEFAULT_PRICING);
    pricing.Ghana.activationFee = value;
    assert.throws(() => validatePricing(pricing), /Invalid pricing/);
    pricing.Ghana.activationFee = 45;
    pricing.Nigeria.packages[0].price = value;
    assert.throws(() => validatePricing(pricing), /Invalid pricing/);
  }
  for (const value of [0, -1, 1.5, 1441, NaN]) {
    const pricing = structuredClone(DEFAULT_PRICING);
    pricing.Ghana.packages[0].minutes = value;
    assert.throws(() => validatePricing(pricing), /Invalid pricing/);
  }
  const pricing = structuredClone(DEFAULT_PRICING);
  pricing.Ghana.packages[0].id = "popular";
  assert.throws(() => validatePricing(pricing), /one of each/);
  pricing.Ghana.packages[0].id = "quick";
  pricing.Ghana.packages[0].price = pricing.Ghana.packages[1].price;
  assert.throws(() => validatePricing(pricing), /must be different/);
  assert.throws(() => validatePricing({}), /Invalid pricing/);
});

test("payment quotes enforce the country's saved activation fee, package price, and minutes", () => {
  const pricing = structuredClone(DEFAULT_PRICING);
  pricing.Ghana.activationFee = 60;
  pricing.Nigeria.activationFee = 8000;
  pricing.Ghana.packages[0] = { id: "quick", price: 475, minutes: 8 };
  pricing.Nigeria.packages[0] = { id: "quick", price: 52000, minutes: 12 };
  assert.deepEqual(paymentQuote(pricing, "Ghana", "activation"), {
    amount: 60,
    minutes: null,
    packageId: null,
  });
  assert.deepEqual(paymentQuote(pricing, "Nigeria", "activation"), {
    amount: 8000,
    minutes: null,
    packageId: null,
  });
  assert.deepEqual(
    validatePaymentQuote(pricing, "Ghana", {
      purpose: "session",
      amount: 475,
      packageId: "quick",
      minutes: 8,
    }),
    { amount: 475, minutes: 8, packageId: "quick" },
  );
  assert.equal(paymentQuote(pricing, "Nigeria", "session", "quick").minutes, 12);
  assert.equal(paymentQuote(pricing, "Ghana", "session", undefined, 475).packageId, "quick");
  assert.throws(
    () => validatePaymentQuote(pricing, "Ghana", { purpose: "activation", amount: 45 }),
    /Pricing has changed/,
  );
  assert.throws(
    () =>
      validatePaymentQuote(pricing, "Nigeria", {
        purpose: "session",
        amount: 475,
        packageId: "quick",
        minutes: 8,
      }),
    /Pricing has changed/,
  );
  assert.throws(
    () =>
      validatePaymentQuote(pricing, "Ghana", {
        purpose: "session",
        amount: 475,
        packageId: "quick",
        minutes: 10,
      }),
    /Pricing has changed/,
  );
  assert.throws(
    () => paymentQuote(pricing, "Ghana", "session", "not-a-package"),
    /no longer available/,
  );
});

test("legacy pricing retains Instant Virtual defaults and validates editable scan prices", () => {
  const legacy = {
    Ghana: {
      activationFee: DEFAULT_PRICING.Ghana.activationFee,
      packages: DEFAULT_PRICING.Ghana.packages,
    },
    Nigeria: {
      activationFee: DEFAULT_PRICING.Nigeria.activationFee,
      packages: DEFAULT_PRICING.Nigeria.packages,
    },
  };
  assert.deepEqual(validatePricing(legacy), DEFAULT_PRICING);
  for (const country of ["Ghana", "Nigeria"] as const) {
    for (const amount of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
      const pricing = structuredClone(DEFAULT_PRICING);
      pricing[country].virtualPackages[0].amount = amount;
      assert.throws(() => validatePricing(pricing), /Invalid pricing/);
    }
    const pricing = structuredClone(DEFAULT_PRICING);
    pricing[country].virtualPackages[0].credits = 3;
    assert.throws(() => validatePricing(pricing), /one of each Instant Virtual/);
    pricing[country].virtualPackages.pop();
    assert.throws(() => validatePricing(pricing), /Invalid pricing/);
  }
});

test("pricing migration preserves historical purchases and saves survive new reads", async () => {
  const db = new PGlite();
  const query = async <T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await db.query(text, params)).rows as T[];
  const sql: Sql = Object.assign(
    async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...params: unknown[]) => {
      let text = strings[0];
      for (let index = 0; index < params.length; index++)
        text += `$${index + 1}${strings[index + 1]}`;
      return query<T>(text, params);
    },
    { query },
  );
  try {
    await db.exec(`
      create table payments (id text primary key, amount integer not null, purpose text not null, status text not null);
      insert into payments values ('gh', 800, 'session', 'pending'),
        ('ng', 203932, 'session', 'confirmed'), ('activation', 7000, 'activation', 'confirmed');
    `);
    await db.exec(
      await readFile(new URL("../../migrations/0011_admin_pricing.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(
        new URL("../../migrations/0014_restore_activation.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(await readPricing(sql), DEFAULT_PRICING);
    const historical = (
      await db.query(
        "select id, amount, session_minutes, country, status from payments order by id",
      )
    ).rows;
    assert.deepEqual(historical, [
      {
        id: "activation",
        amount: 7000,
        session_minutes: null,
        country: "Nigeria",
        status: "confirmed",
      },
      { id: "gh", amount: 800, session_minutes: 10, country: "Ghana", status: "pending" },
      { id: "ng", amount: 203932, session_minutes: 15, country: "Nigeria", status: "confirmed" },
    ]);
    const pricing = structuredClone(DEFAULT_PRICING);
    pricing.Ghana.activationFee = 99;
    pricing.Nigeria.packages[2] = { id: "extended", price: 120000, minutes: 20 };
    pricing.Ghana.virtualPackages[0].amount = 275;
    pricing.Nigeria.virtualPackages[1].amount = 45000;
    await writePricing(sql, pricing);
    assert.deepEqual(await readPricing(sql), pricing);
    assert.deepEqual(
      (
        await db.query(
          "select id, amount, session_minutes, country, status from payments order by id",
        )
      ).rows,
      historical,
    );
    await assert.rejects(writePricing(sql, {}), /Invalid pricing/);
    assert.deepEqual(await readPricing(sql), pricing);
    await db.exec("delete from pricing_settings");
    await assert.rejects(readPricing(sql), /missing/);
    await assert.rejects(writePricing(sql, DEFAULT_PRICING), /missing/);
  } finally {
    await db.close();
  }
});

test("session timers use purchased minutes instead of price and do not restart on repeated confirmation", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  try {
    confirmPendingPayment("purchase", 12345, 22);
    const session = readSession();
    assert.equal(session?.mins, 22);
    assert.ok(session && session.endsAt - Date.now() <= 22 * 60 * 1000);
    assert.ok(session && session.endsAt - Date.now() > 22 * 60 * 1000 - 1000);
    confirmPendingPayment("purchase", 12345, 40);
    assert.deepEqual(readSession(), session);
    assert.throws(() => confirmPendingPayment("missing", 12345, null), /missing/);
    assert.throws(() => confirmPendingPayment("invalid", 12345, 0), /invalid/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
