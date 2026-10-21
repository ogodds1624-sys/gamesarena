import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  validateVirtualCreditPurchase,
  virtualCreditOffer,
  VIRTUAL_CREDIT_OFFERS,
  VIRTUAL_NGN_PER_GHS,
} from "./virtual-credits.ts";

test("Instant Virtual offers enforce the fixed Ghana prices", () => {
  assert.deepEqual(
    VIRTUAL_CREDIT_OFFERS.map(({ credits, amount }) => [credits, amount]),
    [
      [1, 300],
      [3, 400],
      [5, 500],
    ],
  );
  assert.deepEqual(validateVirtualCreditPurchase(400, 3), { credits: 3, amount: 400 });
  assert.throws(() => validateVirtualCreditPurchase(350, 3), /price changed/);
  assert.throws(
    () => validateVirtualCreditPurchase(300, 2),
    /valid Instant Virtual credit package/,
  );
});

test("Nigerian Instant Virtual offers use 121 NGN per GHS without changing Ghana prices", () => {
  assert.equal(VIRTUAL_NGN_PER_GHS, 121);
  assert.deepEqual(
    VIRTUAL_CREDIT_OFFERS.map(({ credits }) => virtualCreditOffer(credits, "Nigeria")),
    [
      { credits: 1, amount: 36300 },
      { credits: 3, amount: 48400 },
      { credits: 5, amount: 60500 },
    ],
  );
  for (const offer of VIRTUAL_CREDIT_OFFERS) {
    const converted = offer.amount * 121;
    assert.deepEqual(validateVirtualCreditPurchase(converted, offer.credits, "Nigeria"), {
      credits: offer.credits,
      amount: converted,
    });
    assert.deepEqual(validateVirtualCreditPurchase(offer.amount, offer.credits, "Ghana"), offer);
    assert.throws(
      () => validateVirtualCreditPurchase(offer.amount, offer.credits, "Nigeria"),
      /price changed/,
    );
    assert.throws(
      () => validateVirtualCreditPurchase(converted, offer.credits, "Ghana"),
      /price changed/,
    );
    assert.throws(
      () => validateVirtualCreditPurchase(offer.amount * 119.96, offer.credits, "Nigeria"),
      /price changed/,
    );
  }
  assert.throws(() => virtualCreditOffer(2, "Nigeria"), /valid Instant Virtual/);
});

test("wallet awards only confirmed payments, spends idempotently, and reverses unused credits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table payments (
        id text primary key,
        purpose text not null default 'session',
        status text not null,
        user_id text,
        country text,
        amount integer
      );
    `);
    await db.exec(
      await readFile(new URL("../../migrations/0012_virtual_credits.sql", import.meta.url), "utf8"),
    );
    await db.exec(`
      insert into payments (id, purpose, status, user_id, virtual_credits)
      values ('p1', 'virtual_credits', 'pending', 'u1', 3);
    `);
    assert.deepEqual(
      (await db.query("select balance from virtual_credit_wallets where user_id = 'u1'")).rows,
      [],
    );

    await db.exec("update payments set status = 'confirmed' where id = 'p1'");
    await db.exec("update payments set status = 'confirmed' where id = 'p1'");
    assert.deepEqual(
      (await db.query("select balance from virtual_credit_wallets where user_id = 'u1'")).rows,
      [{ balance: 3 }],
    );

    assert.deepEqual((await db.query("select * from spend_virtual_credit('u1', 'event-1')")).rows, [
      { spent: true, balance: 2 },
    ]);
    assert.deepEqual((await db.query("select * from spend_virtual_credit('u1', 'event-1')")).rows, [
      { spent: false, balance: 2 },
    ]);
    await db.exec(`
      insert into payments (id, purpose, status, user_id, virtual_credits)
      values ('p2', 'virtual_credits', 'confirmed', 'u1', 1);
    `);
    await db.exec("update payments set status = 'rejected' where id = 'p1'");
    assert.deepEqual(
      (await db.query("select balance from virtual_credit_wallets where user_id = 'u1'")).rows,
      [{ balance: 0 }],
    );

    await assert.rejects(
      db.exec("update payments set status = 'rejected' where id = 'p2'"),
      /Cannot reverse this payment/,
    );
    assert.deepEqual((await db.query("select status from payments where id = 'p2'")).rows, [
      { status: "confirmed" },
    ]);

    await db.exec(`
      insert into payments (id, purpose, status, user_id, country, amount, virtual_credits)
      values ('ng1', 'virtual_credits', 'pending', 'ng-user', 'Nigeria', 48400, 3);
    `);
    assert.deepEqual(
      (await db.query("select balance from virtual_credit_wallets where user_id = 'ng-user'")).rows,
      [],
    );
    await db.exec("update payments set status = 'confirmed' where id = 'ng1'");
    await db.exec("update payments set status = 'confirmed' where id = 'ng1'");
    assert.deepEqual(
      (await db.query("select balance from virtual_credit_wallets where user_id = 'ng-user'")).rows,
      [{ balance: 3 }],
    );
    assert.deepEqual(
      (await db.query("select country, amount, virtual_credits from payments where id = 'ng1'"))
        .rows,
      [{ country: "Nigeria", amount: 48400, virtual_credits: 3 }],
    );
    assert.deepEqual(
      (await db.query("select * from spend_virtual_credit('ng-user', 'ng-scan-1')")).rows,
      [{ spent: true, balance: 2 }],
    );
  } finally {
    await db.close();
  }
});
