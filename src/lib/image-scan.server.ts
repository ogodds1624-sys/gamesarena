import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSessionUser } from "@/lib/auth/verify.server";
import { getSportyLink, getVirtualScanAccess } from "@/lib/admin-snapshot";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { isScanMediaType, matchesScanSignature, MAX_SCAN_BYTES } from "./image-scan";
import { analyzeScreenshot } from "./scan-analysis.server";
import { encryptScanImage, normalizeScanImage, scanEncryptionKey } from "./scan-image-codec.server";
import { processScanJob, readScanJobs } from "./scan-jobs.server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function scanReply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function scanImage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "POST" && request.headers.get("origin") !== url.origin) {
    return scanReply({ error: "Submit screenshots from this website." }, 403);
  }
  const user = await getSessionUser();
  if (!user) return scanReply({ error: "Sign in to view or scan screenshots." }, 401);
  const link = await getSportyLink();
  const access = await getVirtualScanAccess();
  if (!link.linked || !link.activated || !link.country || !access.approved) {
    return scanReply(
      { error: "Your Instant Virtual activation and package approval are required." },
      403,
    );
  }
  const sql = await getSql();
  await sql`select expire_virtual_scan_jobs()`;
  if (request.method === "GET") {
    const id = url.searchParams.get("id") ?? undefined;
    const before = url.searchParams.get("before") ?? undefined;
    const beforeId = url.searchParams.get("beforeId") ?? undefined;
    if (
      (id && !uuid.test(id)) ||
      (before && (!Number.isFinite(Date.parse(before)) || !beforeId || !uuid.test(beforeId))) ||
      (beforeId && !before)
    ) {
      return scanReply({ error: "Invalid scan history request." }, 400);
    }
    const jobs = await readScanJobs(
      sql,
      user.id,
      id,
      before && beforeId ? { createdAt: before, id: beforeId } : undefined,
    );
    if (id && !jobs.length) return scanReply({ error: "Scan not found." }, 404);
    return scanReply({ jobs });
  }
  const apiKey = env("ANTHROPIC_API_KEY");
  const encryptionKey = env("SCAN_IMAGE_ENCRYPTION_KEY");
  if (!apiKey || !encryptionKey)
    return scanReply(
      {
        error: "Scanning is not configured on this server yet. No credit was used.",
      },
      503,
    );
  const key = scanEncryptionKey(encryptionKey);
  if (url.searchParams.get("action") === "process") {
    const id = url.searchParams.get("id") ?? "";
    if (!uuid.test(id)) return scanReply({ error: "Invalid scan ID." }, 400);
    const owned = await readScanJobs(sql, user.id, id);
    if (!owned.length) return scanReply({ error: "Scan not found." }, 404);
    const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 });
    await processScanJob(
      sql,
      key,
      (image, model) => analyzeScreenshot(client, image, "image/png", model),
      id,
      user.id,
    );
    return scanReply({ jobs: await readScanJobs(sql, user.id, id) });
  }
  const id = request.headers.get("x-scan-id") ?? "";
  if (!uuid.test(id)) return scanReply({ error: "A valid scan request ID is required." }, 400);
  const [limit] = await sql<{
    allowed: boolean;
  }>`select allow_virtual_scan_upload(${user.id}) as allowed`;
  if (!limit?.allowed)
    return scanReply(
      { error: "Upload limit reached. Try again in an hour. No credit was used." },
      429,
    );
  const mediaType = request.headers.get("content-type") ?? "";
  if (!isScanMediaType(mediaType))
    return scanReply({ error: "Upload a PNG, JPEG, or WebP screenshot." }, 415);
  if (Number(request.headers.get("content-length")) > MAX_SCAN_BYTES) {
    return scanReply({ error: "Each screenshot must be 3 MB or smaller." }, 413);
  }
  if (!request.body) return scanReply({ error: "Choose a screenshot first." }, 400);
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
        return scanReply({ error: "Each screenshot must be 3 MB or smaller." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const image = Buffer.concat(chunks);
  if (!image.length || !matchesScanSignature(image, mediaType)) {
    return scanReply({ error: "This file does not match a supported image format." }, 400);
  }
  let normalized: Buffer;
  try {
    normalized = await normalizeScanImage(image);
  } catch {
    return scanReply(
      {
        error:
          "Image is corrupt, animated, too large in pixels, or smaller than 100 x 100. Choose a clear static screenshot.",
      },
      422,
    );
  }
  const hash = createHash("sha256").update(normalized).digest("hex");
  const [reservation] = await sql<{ job_id: string; outcome: string }>`
    select * from enqueue_virtual_scan(
      ${id}::uuid,${user.id},${hash},${encryptScanImage(normalized, key)},
      ${env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5"}
    )
  `;
  if (!reservation) throw new Error("Could not create scan job.");
  const messages: Record<string, { error: string; status: number }> = {
    no_credits: {
      error: "Not enough credits for another screenshot. Pending scans reserve available slots.",
      status: 402,
    },
    forbidden: { error: "Instant Virtual approval is required.", status: 403 },
    conflict: { error: "This request ID belongs to a different upload.", status: 409 },
    rate_limited: { error: "Limit reached: 5 pending scans and 20 uploads per hour.", status: 429 },
  };
  const failure = messages[reservation.outcome];
  if (failure) return scanReply({ error: failure.error }, failure.status);
  return scanReply(
    { jobs: await readScanJobs(sql, user.id, reservation.job_id) },
    reservation.outcome === "created" ? 202 : 200,
  );
}

export async function runScanWorker(request: Request) {
  const secret = env("CRON_SECRET");
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return scanReply({ error: "Unauthorized" }, 401);
  }
  const sql = await getSql();
  await sql`select expire_virtual_scan_jobs()`;
  const key = scanEncryptionKey(env("SCAN_IMAGE_ENCRYPTION_KEY"));
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return scanReply({ error: "AI scanner is not configured." }, 503);
  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 });
  // Every provider call and DB update is awaited before the invocation returns.
  const processed = await Promise.allSettled(
    Array.from({ length: 3 }, () =>
      processScanJob(
        sql,
        key,
        (image, model) => analyzeScreenshot(client, image, "image/png", model),
        null,
        null,
      ),
    ),
  );
  const completed = processed.filter((item) => item.status === "fulfilled" && item.value).length;
  const failed = processed.filter((item) => item.status === "rejected");
  if (failed.length) {
    console.error("[scan-worker] Database processing interrupted", { failures: failed.length });
    return scanReply(
      {
        processed: completed,
        error: "Some jobs were interrupted and will be recovered after their leases expire.",
      },
      500,
    );
  }
  return scanReply({ processed: completed });
}
