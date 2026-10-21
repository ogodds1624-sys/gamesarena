import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import {
  jobSchema,
  rankFixtures,
  screenshotRejection,
  type ScanJob,
  type Extraction,
} from "./image-scan.ts";
import { decryptScanImage } from "./scan-image-codec.server.ts";

export type JobRow = {
  id: string;
  user_id: string;
  status: ScanJob["status"];
  result: unknown;
  error: string | null;
  charged: boolean;
  balance: number | null;
  created_at: Date | string;
  image_payload: string | null;
  model: string;
  attempts: number;
};
export function publicJob(row: JobRow): ScanJob {
  return jobSchema.parse({
    id: row.id,
    status: row.status,
    result: row.result,
    error: row.error,
    charged: row.charged,
    balance: row.balance,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  });
}

// All public reads bind ownership before loading a report; image payloads never leave the worker.
export async function readScanJobs(
  sql: Sql,
  userId: string,
  id?: string,
  before?: { createdAt: string; id: string },
) {
  const rows = id
    ? await sql<JobRow>`select id,status,result,error,charged,balance,created_at
        from virtual_scan_jobs where user_id=${userId} and id=${id}::uuid`
    : await sql<JobRow>`select id,status,result,error,charged,balance,created_at
        from virtual_scan_jobs where user_id=${userId}
          and (${before?.createdAt ?? null}::timestamptz is null or
            (created_at,id)<(${before?.createdAt ?? null}::timestamptz,${before?.id ?? null}::uuid))
        order by created_at desc,id desc limit 20`;
  return rows.map(publicJob);
}

export async function processScanJob(
  sql: Sql,
  key: Buffer,
  analyze: (image: Buffer, model: string) => Promise<Extraction>,
  id: string | null,
  userId: string | null,
) {
  const token = randomUUID();
  const [job] =
    await sql<JobRow>`select * from claim_virtual_scan(${id}::uuid,${userId},${token}::uuid)`;
  if (!job) return false;
  try {
    const [access] = await sql<{
      allowed: boolean;
    }>`select virtual_scan_allowed(${job.user_id}) as allowed`;
    if (!access?.allowed) {
      await sql`select fail_structured_scan(${job.id}::uuid,${token}::uuid,false,'Scan access is no longer available. No credit was used.')`;
      return true;
    }
    if (!job.image_payload) throw new Error("Queued image is missing.");
    const extraction = await analyze(decryptScanImage(job.image_payload, key), job.model);
    const report = rankFixtures(extraction);
    const usable =
      screenshotRejection(extraction) === null &&
      !["unreadable", "unrelated"].includes(extraction.quality) &&
      extraction.fixtures.some((fixture) => fixture.home && fixture.away && fixture.market);
    await sql`select finish_structured_scan(
      ${job.id}::uuid,${job.user_id},${token}::uuid,${JSON.stringify(report)}::jsonb,${usable}
    )`;
  } catch (error: unknown) {
    const status =
      typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    const retry =
      status === 429 ||
      (typeof status === "number" && status >= 500) ||
      (error instanceof Error &&
        ["APIConnectionError", "APIConnectionTimeoutError"].includes(error.name));
    console.error("[virtual-scan] Processing failed", {
      id: job.id,
      attempt: job.attempts,
      type: error instanceof Error ? error.name : "UnknownError",
      status: typeof status === "number" ? status : undefined,
    });
    await sql`select fail_structured_scan(
      ${job.id}::uuid,${token}::uuid,${retry},
      ${
        retry
          ? "AI service unavailable; retrying automatically. No credit has been used."
          : [401, 403, 404].includes(typeof status === "number" ? status : 0)
            ? "AI service configuration was rejected. No credit was used. Please try again later."
            : "The image could not be read safely. No credit was used. Try another clear screenshot."
      }
    )`;
  }
  return true;
}
