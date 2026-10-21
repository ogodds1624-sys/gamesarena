import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import Anthropic from "@anthropic-ai/sdk";
import { analyzeScreenshot } from "./scan-analysis.server.ts";
import {
  isScanMediaType,
  matchesScanSignature,
  isScanResult,
  MAX_SCAN_BYTES,
} from "./image-scan.ts";

test("scanner accepts only supported image signatures and result shapes", () => {
  assert.equal(MAX_SCAN_BYTES, 5 * 1024 * 1024);
  assert.equal(isScanMediaType("image/svg+xml"), false);
  assert.equal(isScanMediaType("image/png"), true);
  assert.equal(matchesScanSignature(new Uint8Array([255, 216, 255]), "image/jpeg"), true);
  assert.equal(
    matchesScanSignature(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    true,
  );
  assert.equal(matchesScanSignature(new TextEncoder().encode("RIFFxxxxWEBP"), "image/webp"), true);
  assert.equal(matchesScanSignature(new TextEncoder().encode("<script>"), "image/png"), false);
  assert.equal(matchesScanSignature(new Uint8Array(), "image/jpeg"), false);
  assert.equal(isScanResult({ analysis: "Match odds", balance: 0 }), true);
  assert.equal(isScanResult({ analysis: "Match odds", balance: -1 }), false);
  assert.equal(isScanResult({ analysis: 12, balance: 1 }), false);
});

test("official SDK sends image content and handles usable, unreadable, and invalid provider responses", async () => {
  let providerText = JSON.stringify({ usable: true, analysis: "Visible odds: 1.20" });
  let stopReason = "end_turn";
  let status = 200;
  const requests: Record<string, unknown>[] = [];
  const client = new Anthropic({
    apiKey: "local-test-placeholder",
    maxRetries: 0,
    fetch: async (_url, init) => {
      assert.equal(typeof init?.body, "string");
      requests.push(JSON.parse(String(init?.body)));
      return Response.json(
        status === 200
          ? {
              id: "test-message",
              type: "message",
              role: "assistant",
              model: "test-vision",
              content: [{ type: "text", text: providerText }],
              stop_reason: stopReason,
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 10 },
            }
          : { type: "error", error: { type: "overloaded_error", message: "Test unavailable" } },
        { status },
      );
    },
  });
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const analyze = () => analyzeScreenshot(client, image, "image/png", "test-vision");
  assert.equal(await analyze(), "Visible odds: 1.20");
  assert.equal(requests[0].model, "test-vision");
  assert.deepEqual(requests[0].messages, [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: Buffer.from(image).toString("base64"),
          },
        },
        {
          type: "text",
          text: "Read the visible Instant Virtual details in this screenshot. Explain any uncertainty. This is screenshot transcription, not an outcome prediction.",
        },
      ],
    },
  ]);
  providerText = JSON.stringify({ usable: false, analysis: "Unreadable" });
  assert.equal(await analyze(), null);
  providerText = "not JSON";
  await assert.rejects(analyze(), /usable response/);
  providerText = JSON.stringify({ usable: true, analysis: "" });
  await assert.rejects(analyze(), /empty/);
  providerText = JSON.stringify({ usable: true, analysis: "Partial" });
  stopReason = "max_tokens";
  await assert.rejects(analyze(), /Incomplete/);
  stopReason = "end_turn";
  status = 529;
  await assert.rejects(analyze(), /529/);
});

test("scans charge only on successful completion, recover retries, and enforce limits", async () => {
  const db = new PGlite();
  const id = "cb5aa4a0-7e09-4de7-aad9-749115230001";
  const second = "cb5aa4a0-7e09-4de7-aad9-749115230002";
  const third = "cb5aa4a0-7e09-4de7-aad9-749115230003";
  async function begin(scanId: string, user = "u1", hash = "image") {
    return (
      await db.query<{ state: string }>("select begin_virtual_scan($1::uuid,$2,$3) as state", [
        scanId,
        user,
        hash,
      ])
    ).rows[0].state;
  }
  try {
    await db.exec(
      "create table payments (id text primary key, purpose text not null, status text not null, user_id text)",
    );
    for (const file of ["0012_virtual_credits.sql", "0013_virtual_scans.sql"]) {
      await db.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8"));
    }
    assert.equal(await begin(id), "no_credits");
    await db.exec(
      "insert into payments (id,purpose,status,user_id,virtual_credits) values ('p1','virtual_credits','confirmed','u1',3)",
    );
    assert.equal(await begin(id), "started");
    assert.equal(await begin(id), "processing");
    assert.equal(await begin(id, "u2"), "conflict");
    assert.equal(await begin(id, "u1", "different"), "conflict");
    assert.equal(await begin(second), "busy");
    assert.deepEqual((await db.query("select balance from virtual_credit_wallets")).rows, [
      { balance: 3 },
    ]);
    const finish = () =>
      db.query("select finish_virtual_scan($1::uuid,'u1','visible odds') as balance", [id]);
    assert.deepEqual((await finish()).rows, [{ balance: 2 }]);
    assert.deepEqual((await finish()).rows, [{ balance: 2 }]);
    assert.equal(await begin(id), "completed");
    assert.deepEqual(
      (await db.query("select analysis,balance from virtual_scans where id=$1::uuid", [id])).rows,
      [{ analysis: "visible odds", balance: 2 }],
    );
    assert.equal(await begin(second), "started");
    await db.exec(`update virtual_scans set status='failed' where id='${second}'`);
    assert.equal(await begin(second), "failed");
    assert.deepEqual((await db.query("select balance from virtual_credit_wallets")).rows, [
      { balance: 2 },
    ]);
    await assert.rejects(
      db.query("select finish_virtual_scan($1::uuid,'u1','bad')", [second]),
      /expired/,
    );
    assert.equal(await begin(third), "started");
    await db.exec(
      `update virtual_scans set created_at=now()-interval '3 minutes' where id='${third}'`,
    );
    assert.equal(await begin("cb5aa4a0-7e09-4de7-aad9-749115230004"), "started");
    await db.exec("update virtual_scans set status='failed' where status='processing'");
    await db.exec(`insert into virtual_scans (id,user_id,image_hash,status)
      select ('cb5aa4a0-7e09-4de7-aad9-' || lpad(n::text,12,'0'))::uuid, 'u1','hash','failed'
      from generate_series(100,119) n`);
    assert.equal(await begin("cb5aa4a0-7e09-4de7-aad9-749115230005"), "rate_limited");
    assert.deepEqual((await db.query("select balance from virtual_credit_wallets")).rows, [
      { balance: 2 },
    ]);
  } finally {
    await db.close();
  }
});
