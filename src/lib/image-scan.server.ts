import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { getSessionUser } from "@/lib/auth/verify.server";
import { getSportyLink } from "@/lib/admin-snapshot";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { isScanMediaType, matchesScanSignature, MAX_SCAN_BYTES } from "./image-scan";
import { analyzeScreenshot } from "./scan-analysis.server";

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function scanImage(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return reply({ error: "Screenshot scans must be submitted from this website." }, 403);
  }
  const user = await getSessionUser();
  if (!user) return reply({ error: "Sign in to scan your screenshot." }, 401);
  const link = await getSportyLink();
  if (!link.linked || !link.activated || (link.country !== "Ghana" && link.country !== "Nigeria")) {
    return reply({ error: "Complete your Ghana or Nigeria account setup before scanning." }, 403);
  }
  const sql = await getSql();
  const approved = await sql`
    select id from payments where user_id = ${user.id}
      and purpose = 'virtual_credits' and status = 'confirmed' limit 1
  `;
  if (!approved.length)
    return reply({ error: "An approved Instant Virtual payment is required." }, 403);
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey)
    return reply(
      { error: "Screenshot scanning is not configured yet. Contact support. No credit was used." },
      503,
    );
  const id = request.headers.get("x-scan-id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return reply({ error: "A valid scan request ID is required." }, 400);
  }
  const mediaType = request.headers.get("content-type") ?? "";
  if (!isScanMediaType(mediaType))
    return reply({ error: "Upload a PNG, JPEG, or WebP image." }, 415);
  if (Number(request.headers.get("content-length")) > MAX_SCAN_BYTES) {
    return reply({ error: "The screenshot must be 5 MB or smaller." }, 413);
  }
  if (!request.body) return reply({ error: "Choose a screenshot first." }, 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SCAN_BYTES) {
        await reader.cancel();
        return reply({ error: "The screenshot must be 5 MB or smaller." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const image = Buffer.concat(chunks);
  if (!image.length || !matchesScanSignature(image, mediaType)) {
    return reply({ error: "This file is not a valid image of the selected type." }, 400);
  }
  const hash = createHash("sha256").update(image).digest("hex");
  const [reservation] = await sql<{ state: string }>`
    select begin_virtual_scan(${id}::uuid, ${user.id}, ${hash}) as state
  `;
  if (reservation?.state === "completed") {
    const [saved] = await sql<{ analysis: string; balance: number }>`
      select analysis, balance from virtual_scans where id = ${id}::uuid and user_id = ${user.id}
    `;
    return reply(saved);
  }
  if (reservation?.state !== "started") {
    const state = reservation?.state;
    return reply(
      {
        error:
          state === "no_credits"
            ? "You need at least 1 credit to scan. Choose a credit pack."
            : state === "rate_limited"
              ? "You have reached the scan limit. Please try again in an hour."
              : state === "failed"
                ? "This scan failed or expired. Select the image again to start a new scan."
                : "A scan is already running or this request ID is in use. Please wait before trying again.",
      },
      state === "no_credits" ? 402 : state === "rate_limited" ? 429 : 409,
    );
  }
  let savingResult = false;
  try {
    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });
    const analysis = await analyzeScreenshot(
      client,
      image,
      mediaType,
      env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
    );
    if (analysis === null) {
      await sql`update virtual_scans set status = 'failed' where id = ${id}::uuid and status = 'processing'`;
      return reply(
        {
          error:
            "No readable Instant Virtual match details were found. Upload a clear screenshot. No credit was used.",
        },
        422,
      );
    }
    savingResult = true;
    const [finished] = await sql<{ balance: number }>`
      select finish_virtual_scan(${id}::uuid, ${user.id}, ${analysis}) as balance
    `;
    if (!finished) throw new Error("The scan result could not be saved.");
    return reply({ analysis, balance: finished.balance });
  } catch (error: unknown) {
    console.error("[image-scan] Scan failed", {
      id,
      type: error instanceof Error ? error.name : "UnknownError",
    });
    await sql`update virtual_scans set status = 'failed' where id = ${id}::uuid and status = 'processing'`;
    return reply(
      {
        error: savingResult
          ? "Could not confirm the saved result. Retry with the same screenshot selection to check its status without a second charge."
          : "Scanning is temporarily unavailable. No credit was used. Select the image again to retry.",
      },
      502,
    );
  }
}
