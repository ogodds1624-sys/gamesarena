import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("admin revenue starts at zero without changing payments or partner revenue", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table payments (
        id text primary key, amount integer, status text, counts_revenue boolean,
        created_at timestamptz, confirmed_at timestamptz, country text
      );
      insert into payments values
        ('old-gh',300,'confirmed',true,now()-interval '1 hour',now()-interval '1 hour','Ghana'),
        ('old-ng',36300,'confirmed',true,now()-interval '1 hour',now()-interval '1 hour','Nigeria'),
        ('pending',400,'pending',true,now()-interval '1 hour',null,'Ghana'),
        ('legacy',500,'confirmed',true,now()-interval '1 hour',null,'Ghana');
    `);
    const before = (await db.query("select * from payments order by id")).rows;
    await db.exec(await readFile(new URL("../migrations/0019_reset_admin_revenue.sql", import.meta.url), "utf8"));
    assert.deepEqual((await db.query("select * from payments order by id")).rows, before);
    const revenue = async () => (await db.query(`
      select coalesce(sum(amount),0)::integer as amount from payments
      where status='confirmed' and counts_revenue is not false
        and coalesce(confirmed_at,created_at) >=
          (select starts_at from admin_revenue_period where id='main')
    `)).rows[0].amount;
    assert.equal(await revenue(), 0);
    assert.equal((await db.query("select sum(amount)::integer as amount from payments where status='confirmed' and counts_revenue")).rows[0].amount, 37100);
    await db.exec(`
      update payments set status='confirmed',confirmed_at=now() where id='pending';
      insert into payments values ('new-ng',48400,'confirmed',true,now(),now(),'Nigeria');
      insert into payments values ('test',900,'confirmed',false,now(),now(),'Ghana');
    `);
    assert.equal(await revenue(), 48800);
    assert.equal((await db.query("select count(*)::integer as count from payments")).rows[0].count, 6);
  } finally {
    await db.close();
  }
});
