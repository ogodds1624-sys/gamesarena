import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminAuthMiddleware } from "@/lib/admin-auth";

export type UserWarning = {
  id: string;
  email: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

export const listUserWarnings = createServerFn({ method: "GET" })
  .middleware([adminAuthMiddleware])
  .handler(async (): Promise<UserWarning[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      email: string;
      message: string;
      created_at: Date | string;
      acknowledged_at: Date | string | null;
    }>`select w.id,u.email,w.message,w.created_at,w.acknowledged_at
       from user_warnings w join "user" u on u.id=w.user_id
       where w.removed_at is null order by w.created_at desc limit 100`;
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
    }));
  });

export const sendUserWarning = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator((data: { email: string; message: string }) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email(),
        message: z.string().trim().min(1, "Enter a warning message.").max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const { randomUUID } = await import("node:crypto");
    const sql = await getSql();
    const [user] = await sql<{
      id: string;
    }>`select id from "user" where lower(trim(email))=${data.email}`;
    if (!user) throw new Error("No account found for this email.");
    await sql`insert into user_warnings(id,user_id,message) values(${randomUUID()}::uuid,${user.id},${data.message})`;
    return { sent: true };
  });

const warningId = (data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data);

export const removeUserWarning = createServerFn({ method: "POST" })
  .middleware([adminAuthMiddleware])
  .inputValidator(warningId)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`update user_warnings set removed_at=now()
      where id=${data.id}::uuid and removed_at is null returning id`;
    if (!rows.length) throw new Error("Warning no longer exists.");
    return { removed: true };
  });

export const getMyWarnings = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser(undefined, { includeBlocked: true });
  if (!user) return [];
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  return sql<{ id: string; message: string }>`select id,message from user_warnings
    where user_id=${user.id} and acknowledged_at is null and removed_at is null
    order by created_at,id limit 20`;
});

export const acknowledgeWarning = createServerFn({ method: "POST" })
  .inputValidator(warningId)
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser(undefined, { includeBlocked: true });
    if (!user) throw new Error("Sign in to acknowledge this warning.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`update user_warnings
      set acknowledged_at=coalesce(acknowledged_at,now())
      where id=${data.id}::uuid and user_id=${user.id} and removed_at is null returning id`;
    if (!rows.length) throw new Error("Warning is no longer available.");
    return { acknowledged: true };
  });
