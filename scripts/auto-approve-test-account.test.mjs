import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("only the specified accounts auto-approve with records retained and revenue excluded", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table "user" (id text primary key, email text not null);
      create table payments (
        id text primary key, user_id text, amount integer, status text,
        receipt text, counts_revenue boolean default true
      );
      insert into "user" values
        ('test', ' YGODDS18@GMAIL.COM '),
        ('casino', ' CASINOWORLD@GMAIL.COM '),
        ('normal', 'customer@example.com'),
        ('other-test', 'another-test@example.com');
    `);
    for (const name of ["0007_test_accounts.sql", "0008_activation_payments.sql"]) {
      await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec(`
      insert into test_accounts (email) values ('another-test@example.com');
      insert into payments (id, user_id, amount, status, receipt, purpose) values
        ('existing', 'test', 50, 'pending', 'activation-proof', 'activation'),
        ('rejected', 'test', 350, 'rejected', 'rejected-proof', 'session'),
        ('normal', 'normal', 50, 'pending', 'normal-proof', 'activation');
    `);
    await db.exec(await readFile(new URL("../migrations/0009_auto_approve_test_account.sql", import.meta.url), "utf8"));
    await db.exec(`
      insert into payments (id, user_id, amount, status, receipt, purpose) values
        ('casino-activation', 'casino', 50, 'pending', 'casino-proof', 'activation'),
        ('casino-old', 'casino', 350, 'confirmed', 'old-proof', 'session'),
        ('casino-rejected', 'casino', 350, 'rejected', 'rejected-proof', 'session');
    `);
    await db.exec(await readFile(new URL("../migrations/0010_casinoworld_test_account.sql", import.meta.url), "utf8"));
    assert.equal((await db.query("select email from test_accounts where email = 'casinoworld@gmail.com'")).rows[0].email, "casinoworld@gmail.com");
    assert.deepEqual((await db.query("select status, receipt, counts_revenue, confirmed_at is not null as dated from payments where id = 'casino-activation'")).rows[0],
      { status: "confirmed", receipt: "casino-proof", counts_revenue: false, dated: true });
    assert.equal((await db.query("select counts_revenue from payments where id = 'casino-old'")).rows[0].counts_revenue, false);
    assert.equal((await db.query("select status from payments where id = 'casino-rejected'")).rows[0].status, "rejected");
    const existing = (await db.query("select status, receipt, counts_revenue, confirmed_at is not null as dated from payments where id = 'existing'")).rows[0];
    assert.deepEqual(existing, { status: "confirmed", receipt: "activation-proof", counts_revenue: false, dated: true });
    await db.exec(`
      insert into payments (id, user_id, amount, status, receipt, purpose) values
        ('session', 'test', 800, 'pending', 'session-proof', 'session'),
        ('casino-session', 'casino', 800, 'pending', 'casino-session-proof', 'session'),
        ('other-test', 'other-test', 50, 'pending', 'other-proof', 'activation');
    `);
    assert.deepEqual((await db.query("select status, receipt, counts_revenue, confirmed_at is not null as dated from payments where id = 'session'")).rows[0],
      { status: "confirmed", receipt: "session-proof", counts_revenue: false, dated: true });
    assert.deepEqual((await db.query("select status, receipt, counts_revenue, confirmed_at is not null as dated from payments where id = 'casino-session'")).rows[0],
      { status: "confirmed", receipt: "casino-session-proof", counts_revenue: false, dated: true });
    for (const id of ["normal", "other-test"]) {
      assert.equal((await db.query("select status from payments where id = $1", [id])).rows[0].status, "pending");
    }
    assert.equal((await db.query("select status from payments where id = 'rejected'")).rows[0].status, "rejected");
    await db.exec("update payments set status = 'rejected', confirmed_at = null where id = 'session'");
    assert.equal((await db.query("select status from payments where id = 'session'")).rows[0].status, "rejected");
    assert.equal((await db.query("select count(*)::integer as count from payments")).rows[0].count, 9);
    assert.equal((await db.query("select count(*)::integer as count from payments where status = 'confirmed' and counts_revenue is not false")).rows[0].count, 0);
    await db.exec(await readFile(new URL("../migrations/0018_remove_email_auto_approval.sql", import.meta.url), "utf8"));
    for (const userId of ["test", "casino", "normal", "other-test"]) {
      for (const purpose of ["activation", "session"]) {
        const id = `no-free-pass-${userId}-${purpose}`;
        await db.query('insert into "user" (id,email) select $1,email from "user" where id=$2', [id, userId]);
        await db.query(
          "insert into payments (id,user_id,amount,status,receipt,purpose) values ($1,$2,300,'pending','proof',$3)",
          [id, id, purpose],
        );
        assert.equal((await db.query("select status from payments where id=$1", [id])).rows[0].status, "pending");
        await db.query("update payments set amount=301 where id=$1", [id]);
        assert.equal((await db.query("select status from payments where id=$1", [id])).rows[0].status, "pending");
        await db.query("update payments set status='confirmed',confirmed_at=now() where id=$1", [id]);
        assert.equal((await db.query("select status from payments where id=$1", [id])).rows[0].status, "confirmed");
      }
    }
    assert.equal((await db.query("select status from payments where id='existing'")).rows[0].status, "confirmed");
    assert.equal((await db.query("select status from payments where id='rejected'")).rows[0].status, "rejected");
    assert.equal((await db.query('select count(*)::integer as count from "user" where id in (\'test\',\'casino\',\'normal\',\'other-test\')')).rows[0].count, 4);
  } finally {
    await db.close();
  }
});
