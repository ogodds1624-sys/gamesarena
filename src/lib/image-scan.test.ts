import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { analyzeScreenshot } from "./scan-analysis.server.ts";
import {
  extractionSchema,
  rankFixtures,
  screenshotRejection,
  reportSchema,
  matchesScanSignature,
  isScanMediaType,
  MAX_SCAN_BYTES,
  type Fixture,
  type Extraction,
} from "./image-scan.ts";
import {
  encryptScanImage,
  decryptScanImage,
  scanEncryptionKey,
  normalizeScanImage,
} from "./scan-image-codec.server.ts";
import { processScanJob, readScanJobs } from "./scan-jobs.server.ts";
import type { Sql } from "./db";

function fixture(patch: Partial<Fixture> = {}): Fixture {
  return {
    provider: "Visible provider",
    sport: "Virtual football",
    home: "Team A",
    away: "Team B",
    matchId: "123",
    market: "Match winner",
    marketKind: "three_way_winner",
    homeOdds: 1.8,
    drawOdds: 3.4,
    awayOdds: 4.2,
    time: "00:30",
    status: "upcoming",
    statistics: [],
    uncertainFields: [],
    ...patch,
  };
}

function extraction(fixtures = [fixture()]): Extraction {
  return {
    screenshotType: "sportybet_instant_football",
    identificationEvidence: ["Instant Football", "1X2", "Next Round"],
    quality: "clear",
    fixtures,
    warnings: [],
  };
}

test("only identified SportyBet Instant Football qualifies, never normal football or unknown sources", () => {
  for (const screenshotType of ["normal_football", "other", "unknown"] as const) {
    const input = { ...extraction(), screenshotType };
    const report = rankFixtures(input);
    assert.equal(report.rankings.length, 0);
    assert.equal(report.excluded.length, 1);
    assert.ok(screenshotRejection(input));
  }
  assert.match(
    screenshotRejection({ ...extraction(), screenshotType: "normal_football" }) ?? "",
    /This is not an Instant Football prediction/,
  );
  assert.equal(rankFixtures({ ...extraction(), identificationEvidence: [] }).rankings.length, 0);
  assert.equal(
    extractionSchema.safeParse({ quality: "clear", fixtures: [], warnings: [] }).success,
    false,
  );
  const report = rankFixtures(extraction());
  const { screenshotType: _type, identificationEvidence: _evidence, ...legacy } = report.extraction;
  assert.equal(reportSchema.safeParse({ ...report, extraction: legacy }).success, true);
  assert.ok(screenshotRejection({}));
});

test("sample Instant Football 1X2 rows retain abbreviations and rank visible market favourites", () => {
  const rows = [
    ["MUN", "NEW", 1.86, 3.9, 3.88],
    ["AST", "BHA", 2.1, 3.73, 3.28],
    ["CRY", "NFO", 2.78, 3.59, 2.43],
    ["SUN", "LEE", 1.96, 3.74, 3.68],
    ["MCI", "IPS", 1.45, 4.79, 6.7],
    ["FUL", "EVE", 2.18, 3.55, 3.24],
    ["LIV", "TOT", 2.09, 3.82, 3.23],
    ["ARS", "BOU", 1.68, 4.33, 4.44],
  ] as const;
  const report = rankFixtures(
    extraction(
      rows.map(([home, away, homeOdds, drawOdds, awayOdds]) =>
        fixture({
          provider: null,
          home,
          away,
          homeOdds,
          drawOdds,
          awayOdds,
          time: null,
          market: "1X2",
        }),
      ),
    ),
  );
  assert.equal(report.rankings.length, 8);
  assert.deepEqual(
    report.rankings.slice(0, 2).map((item) => [item.label, item.odds]),
    [
      ["MCI", 1.45],
      ["ARS", 1.68],
    ],
  );
  assert.equal(report.rankings.find((item) => item.label === "NFO")?.option, "away");
  assert.equal(report.extraction.fixtures[0].home, "MUN");
});

test("strict extraction accepts multiple fixtures, missing fields, and sports without a draw", () => {
  assert.equal(
    extractionSchema.parse(
      extraction([
        fixture(),
        fixture({ sport: "Virtual tennis", marketKind: "two_way_winner", drawOdds: null }),
        fixture({ home: null, homeOdds: null, uncertainFields: ["home"] }),
      ]),
    ).fixtures.length,
    3,
  );
  assert.equal(extractionSchema.safeParse(extraction([fixture({ homeOdds: 0 })])).success, false);
  assert.equal(
    extractionSchema.safeParse({ ...extraction(), winningProbability: 0.99 }).success,
    false,
  );
});

test("rankings use complete visible prices only, without invented probabilities", () => {
  const report = rankFixtures(
    extraction([
      fixture(),
      fixture({ homeOdds: 5, drawOdds: 4, awayOdds: 1.4 }),
      fixture({ homeOdds: 4, drawOdds: 1.5, awayOdds: 3 }),
    ]),
  );
  assert.deepEqual(
    report.rankings.map((item) => [item.rank, item.fixtureIndex, item.option]),
    [
      [1, 1, "away"],
      [2, 2, "draw"],
      [3, 0, "home"],
    ],
  );
  assert.equal("probability" in report.rankings[0], false);
  assert.match(report.limitations.join(" "), /No independent historical dataset/);
});

test("missing odds, uncertainty, ambiguous markets, ties and non-upcoming fixtures are excluded", () => {
  const report = rankFixtures(
    extraction([
      fixture({ home: null }),
      fixture({ awayOdds: null }),
      fixture({ marketKind: "unknown" }),
      fixture({ marketKind: "other", market: "Over 2.5" }),
      fixture({ uncertainFields: ["odds partially cropped"] }),
      fixture({ homeOdds: 1.8, awayOdds: 1.8 }),
      fixture({ homeOdds: 1.8, awayOdds: 1.84 }),
      fixture({ status: "finished" }),
      fixture({ status: "live" }),
      fixture({ status: "unknown" }),
      fixture({ marketKind: "two_way_winner", drawOdds: 2 }),
    ]),
  );
  assert.equal(report.rankings.length, 0);
  assert.equal(report.excluded.length, 11);
  const twoWay = rankFixtures(
    extraction([fixture({ marketKind: "two_way_winner", drawOdds: null })]),
  );
  assert.equal(twoWay.rankings[0].option, "home");
  assert.equal(
    rankFixtures(extraction([fixture({ homeOdds: 1.8, awayOdds: 1.85 })])).rankings.length,
    1,
  );
  assert.equal(rankFixtures({ ...extraction(), quality: "unreadable" }).rankings.length, 0);
});

test("image types and bounds reject unsupported data", () => {
  assert.equal(MAX_SCAN_BYTES, 3 * 1024 * 1024);
  assert.equal(isScanMediaType("image/svg+xml"), false);
  assert.equal(isScanMediaType("image/png"), true);
  assert.equal(matchesScanSignature(new Uint8Array([255, 216, 255]), "image/jpeg"), true);
  assert.equal(matchesScanSignature(new Uint8Array(), "image/png"), false);
  assert.equal(matchesScanSignature(new TextEncoder().encode("<script>"), "image/png"), false);
});

test("image decoding rejects corrupt and undersized files; encryption detects tampering", async () => {
  const image = await sharp({
    create: { width: 200, height: 300, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const normalized = await normalizeScanImage(image);
  assert.equal((await sharp(normalized).metadata()).format, "png");
  const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  await assert.rejects(normalizeScanImage(tiny), /100 x 100/);
  await assert.rejects(normalizeScanImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])));
  const large = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeScanImage(large), /pixel limit/);
  const red = await sharp({ create: { width: 200, height: 300, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const animated = await sharp([image, red], { join: { animated: true } })
    .webp({ loop: 0, delay: 100 })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(normalizeScanImage(animated), /static screenshot/);
  const key = scanEncryptionKey(randomBytes(32).toString("hex"));
  const payload = encryptScanImage(normalized, key);
  assert.deepEqual(decryptScanImage(payload, key), normalized);
  const bytes = Buffer.from(payload, "base64");
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decryptScanImage(bytes.toString("base64"), key));
  assert.throws(() => scanEncryptionKey("weak"), /64 hexadecimal/);
});

test("real SDK request sends image and strict extraction prompt; provider and invalid-output failures reject", async () => {
  let text = JSON.stringify(extraction());
  let stop = "end_turn";
  let status = 200;
  const requests: Record<string, unknown>[] = [];
  const client = new Anthropic({
    apiKey: "test-placeholder",
    maxRetries: 0,
    fetch: async (url, init) => {
      assert.equal(String(url), "https://api.anthropic.com/v1/messages");
      assert.equal(new Headers(init?.headers).get("x-api-key"), "test-placeholder");
      assert.equal(new Headers(init?.headers).get("anthropic-version"), "2023-06-01");
      requests.push(JSON.parse(String(init?.body)));
      return Response.json(
        status === 200
          ? {
              id: "test",
              type: "message",
              role: "assistant",
              model: "vision-test",
              content: text ? [{ type: "text", text }] : [],
              stop_reason: stop,
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            }
          : { error: { type: "server_error", message: "unavailable", code: null, param: null } },
        { status },
      );
    },
  });
  const analyze = () =>
    analyzeScreenshot(client, new Uint8Array([1, 2, 3]), "image/png", "vision-test");
  assert.deepEqual(await analyze(), extraction());
  assert.equal(requests[0].model, "vision-test");
  assert.match(String(requests[0].system), /Never invent/);
  assert.match(String(requests[0].system), /BOTH light and dark/);
  assert.match(String(requests[0].system), /Normal real-world football/);
  assert.equal(requests[0].max_tokens, 7000);
  assert.match(JSON.stringify(requests[0].messages), /"media_type":"image\/png"/);
  assert.match(JSON.stringify(requests[0].messages), /AQID/);
  text = JSON.stringify({
    ...extraction([]),
    screenshotType: "unknown",
    identificationEvidence: [],
    quality: "unreadable",
    warnings: ["Blurry"],
  });
  assert.equal((await analyze()).quality, "unreadable");
  text = "not JSON";
  await assert.rejects(analyze());
  text = JSON.stringify({ quality: "clear", fixtures: [{ home: "invented-only" }], warnings: [] });
  await assert.rejects(analyze());
  stop = "max_tokens";
  await assert.rejects(analyze(), /Incomplete/);
  stop = "refusal";
  await assert.rejects(analyze(), /Incomplete/);
  stop = "end_turn";
  text = "";
  await assert.rejects(analyze(), /could not extract/);
  for (const code of [401, 429, 500]) {
    status = code;
    await assert.rejects(analyze(), new RegExp(String(code)));
  }
});

test("durable queue isolates owners, deduplicates, charges atomically, retries leases and deletes image payloads", async () => {
  const db = new PGlite();
  const sql: Sql = Object.assign(
    async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...params: unknown[]) => {
      let text = strings[0];
      for (let i = 0; i < params.length; i++) text += `$${i + 1}${strings[i + 1]}`;
      return (await db.query<T>(text, params)).rows;
    },
    {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await db.query<T>(text, params)).rows,
    },
  );
  const key = randomBytes(32);
  const image = encryptScanImage(new Uint8Array([1, 2, 3]), key);
  async function enqueue(id: string, user = "u1", hash = id) {
    return (
      await sql<{ job_id: string; outcome: string }>`
      select * from enqueue_virtual_scan(${id}::uuid,${user},${hash},${image},'vision-test')
    `
    )[0];
  }
  try {
    await db.exec(`
      create table "user"(id text primary key,email text);
      create table registered_users(user_id text,country text,sporty_number text);
      create table payments(id text primary key,purpose text not null,status text not null,user_id text);
      insert into "user" values('u1','one@example.com'),('u2','two@example.com'),('u3','three@example.com');
      insert into registered_users values('u1','Ghana','12345'),('u2','Nigeria','67890'),('u3','Ghana','33333');
    `);
    for (const name of [
      "0012_virtual_credits.sql",
      "0013_virtual_scans.sql",
      "0015_structured_scan_jobs.sql",
    ]) {
      await db.exec(await readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
    }
    assert.equal((await enqueue(randomUUID())).outcome, "forbidden");
    await db.exec(`
      insert into payments(id,purpose,status,user_id,virtual_credits) values
      ('a1','activation','confirmed','u1',null),('v1','virtual_credits','confirmed','u1',5),
      ('a2','activation','confirmed','u2',null),('v2','virtual_credits','confirmed','u2',5);
    `);
    const first = randomUUID();
    assert.equal((await enqueue(first)).outcome, "created");
    assert.equal((await enqueue(first)).outcome, "existing");
    assert.equal((await enqueue(randomUUID(), "u1", first)).job_id, first);
    assert.equal((await enqueue(first, "u2")).outcome, "conflict");
    assert.deepEqual(await readScanJobs(sql, "u2", first), []);
    let calls = 0;
    const analyze = async () => {
      calls++;
      return extraction();
    };
    assert.equal(await processScanJob(sql, key, analyze, first, "u2"), false);
    assert.equal(calls, 0);
    const concurrent = await Promise.all([
      processScanJob(sql, key, analyze, first, "u1"),
      processScanJob(sql, key, analyze, first, "u1"),
    ]);
    assert.deepEqual(concurrent.sort(), [false, true]);
    assert.equal(await processScanJob(sql, key, analyze, first, "u1"), false);
    const [saved] = await readScanJobs(sql, "u1", first);
    assert.equal(saved.status, "completed");
    assert.equal(saved.balance, 4);
    assert.equal(saved.charged, true);
    assert.equal(saved.result?.rankings.length, 1);
    assert.equal("image_payload" in saved, false);
    assert.equal((await enqueue(randomUUID(), "u1", first)).job_id, first);
    assert.equal(calls, 1);
    const review = randomUUID();
    await enqueue(review);
    await sql`update virtual_scan_jobs set model='claude-legacy-vision' where id in (${first}::uuid,${review}::uuid)`;
    await db.exec(
      await readFile(
        new URL("../../migrations/0016_openai_scan_model.sql", import.meta.url),
        "utf8",
      ),
    );
    const migrated = await sql<{
      id: string;
      model: string;
    }>`select id,model from virtual_scan_jobs where id in (${first}::uuid,${review}::uuid)`;
    assert.equal(migrated.find((row) => row.id === first)?.model, "claude-legacy-vision");
    assert.equal(migrated.find((row) => row.id === review)?.model, "gpt-4.1-mini");
    await sql`update virtual_scan_jobs set model='gpt-4.1-mini' where id=${first}::uuid`;
    await db.exec(
      await readFile(
        new URL("../../migrations/0017_restore_anthropic_scan_model.sql", import.meta.url),
        "utf8",
      ),
    );
    const restored = await sql<{ id: string; model: string }>`
      select id,model from virtual_scan_jobs where id in (${first}::uuid,${review}::uuid)
    `;
    assert.equal(restored.find((row) => row.id === first)?.model, "gpt-4.1-mini");
    assert.equal(restored.find((row) => row.id === review)?.model, "claude-sonnet-5-5");
    await processScanJob(
      sql,
      key,
      async () => ({ ...extraction([]), quality: "unreadable", warnings: ["Blurry"] }),
      review,
      "u1",
    );
    assert.equal((await readScanJobs(sql, "u1", review))[0].status, "needs_review");
    assert.equal((await readScanJobs(sql, "u1", review))[0].charged, false);
    for (const screenshotType of ["normal_football", "other", "unknown"] as const) {
      const id = randomUUID();
      await enqueue(id);
      await processScanJob(sql, key, async () => ({ ...extraction(), screenshotType }), id, "u1");
      const [rejected] = await readScanJobs(sql, "u1", id);
      assert.equal(rejected.status, "needs_review");
      assert.equal(rejected.charged, false);
      assert.equal(rejected.result?.rankings.length, 0);
      if (screenshotType === "normal_football") {
        assert.ok(rejected.result);
        assert.match(
          screenshotRejection(rejected.result.extraction) ?? "",
          /This is not an Instant Football prediction/,
        );
      }
    }
    const failed = randomUUID();
    await enqueue(failed);
    await processScanJob(
      sql,
      key,
      async () => {
        throw new SyntaxError("invalid JSON");
      },
      failed,
      "u1",
    );
    assert.equal((await readScanJobs(sql, "u1", failed))[0].status, "failed");
    const retry = randomUUID();
    await enqueue(retry);
    await processScanJob(
      sql,
      key,
      async () => {
        throw Object.assign(new Error("rate limit"), { status: 429 });
      },
      retry,
      "u1",
    );
    assert.equal((await readScanJobs(sql, "u1", retry))[0].status, "queued");
    await sql`update virtual_scan_jobs set available_at=now()-interval '1 second' where id=${retry}::uuid`;
    await processScanJob(sql, key, analyze, retry, "u1");
    assert.equal((await readScanJobs(sql, "u1", retry))[0].status, "completed");
    const interrupted = randomUUID();
    await enqueue(interrupted);
    const staleToken = randomUUID();
    await sql`select * from claim_virtual_scan(${interrupted}::uuid,'u1',${staleToken}::uuid)`;
    await sql`update virtual_scan_jobs set lease_until=now()-interval '1 second' where id=${interrupted}::uuid`;
    await processScanJob(sql, key, analyze, interrupted, "u1");
    assert.equal((await readScanJobs(sql, "u1", interrupted))[0].status, "completed");
    const stale = await sql<{ ok: boolean }>`select finish_structured_scan(
      ${interrupted}::uuid,'u1',${staleToken}::uuid,'{}'::jsonb,true) as ok`;
    assert.equal(stale[0].ok, false);
    const blocked = randomUUID();
    await enqueue(blocked);
    await db.exec("insert into blocked_emails(email) values('one@example.com')");
    await processScanJob(sql, key, analyze, blocked, "u1");
    assert.equal((await readScanJobs(sql, "u1", blocked))[0].status, "failed");
    await db.exec("delete from blocked_emails");
    const expired = randomUUID();
    await enqueue(expired);
    await sql`update virtual_scan_jobs set expires_at=now()-interval '1 second' where id=${expired}::uuid`;
    await processScanJob(sql, key, analyze, expired, "u1");
    assert.equal((await readScanJobs(sql, "u1", expired))[0].status, "failed");
    const payloads = await sql<{
      image_payload: string | null;
    }>`select image_payload from virtual_scan_jobs where status in ('completed','failed','needs_review')`;
    assert.equal(
      payloads.every((row) => row.image_payload === null),
      true,
    );
    const wallet = await sql<{
      balance: number;
    }>`select balance from virtual_credit_wallets where user_id='u1'`;
    assert.equal(wallet[0].balance, 2);
    for (let i = 0; i < 2; i++) assert.equal((await enqueue(randomUUID())).outcome, "created");
    assert.equal((await enqueue(randomUUID())).outcome, "no_credits");
    await db.exec(`insert into virtual_scan_jobs(id,user_id,image_hash,model,status)
      select ('12345678-1234-4123-8123-'||lpad(n::text,12,'0'))::uuid,'u2',n::text,'vision-test','failed'
      from generate_series(1,21) n`);
    assert.equal((await enqueue(randomUUID(), "u2")).outcome, "rate_limited");
    const history = await readScanJobs(sql, "u2");
    assert.equal(history.length, 20);
    const last = history[history.length - 1];
    const older = await readScanJobs(sql, "u2", undefined, {
      createdAt: last.createdAt,
      id: last.id,
    });
    assert.equal(older.length, 1);
    assert.equal(
      history.some((item) => item.id === older[0].id),
      false,
    );
    await db.exec("delete from virtual_scan_jobs where user_id='u2'");
    await db.exec("update virtual_credit_wallets set balance=20 where user_id='u2'");
    const pending = [];
    for (let i = 0; i < 5; i++) {
      const id = randomUUID();
      pending.push(id);
      assert.equal((await enqueue(id, "u2")).outcome, "created");
    }
    assert.equal((await enqueue(randomUUID(), "u2")).outcome, "rate_limited");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sql`update virtual_scan_jobs set available_at=now()-interval '1 second' where id=${pending[0]}::uuid`;
      await processScanJob(
        sql,
        key,
        async () => {
          throw Object.assign(new Error("provider failure"), { status: 503 });
        },
        pending[0],
        "u2",
      );
    }
    const exhausted = (await readScanJobs(sql, "u2", pending[0]))[0];
    assert.equal(exhausted.status, "failed");
    assert.equal(exhausted.charged, false);
    assert.equal(await processScanJob(sql, key, analyze, pending[0], "u2"), false);
    const revocationToken = randomUUID();
    await sql`select * from claim_virtual_scan(${pending[1]}::uuid,'u2',${revocationToken}::uuid)`;
    await db.exec("update payments set status='rejected' where id='a2'");
    const revoked = await sql<{ ok: boolean }>`select finish_structured_scan(
      ${pending[1]}::uuid,'u2',${revocationToken}::uuid,${JSON.stringify(rankFixtures(extraction()))}::jsonb,true) as ok`;
    assert.equal(revoked[0].ok, false);
    assert.equal((await readScanJobs(sql, "u2", pending[1]))[0].status, "failed");
    const afterRevocation = await sql<{
      balance: number;
    }>`select balance from virtual_credit_wallets where user_id='u2'`;
    assert.equal(afterRevocation[0].balance, 20);
    for (let i = 0; i < 40; i++) {
      const [row] = await sql<{
        allowed: boolean;
      }>`select allow_virtual_scan_upload('u2') as allowed`;
      assert.equal(row.allowed, true);
    }
    const [limited] = await sql<{
      allowed: boolean;
    }>`select allow_virtual_scan_upload('u2') as allowed`;
    assert.equal(limited.allowed, false);
    await sql`update virtual_scan_upload_limits set window_start=now()-interval '1 hour' where user_id='u2'`;
    const [reset] = await sql<{
      allowed: boolean;
    }>`select allow_virtual_scan_upload('u2') as allowed`;
    assert.equal(reset.allowed, true);
  } finally {
    await db.close();
  }
});
