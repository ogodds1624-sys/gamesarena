import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/desk-pass")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!/^[a-f0-9]{32}$/.test(token)) return Response.json({ ok: false, login: "" });
        try {
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          const rows = await sql<{ login_number: string }>`
            select login_number from desk_passes
            where token = ${token} and expires_at > now()
              and exists (
                select 1 from payments
                where user_id = desk_passes.user_id
                  and purpose = 'activation' and status = 'confirmed'
              )
            limit 1
          `;
          if (rows.length === 0) return Response.json({ ok: false, login: "" });
          const login = rows[0].login_number;
          return Response.json({ ok: true, login: /^\d{4,12}$/.test(login) ? login : "" });
        } catch {
          return Response.json({ ok: false, login: "" });
        }
      },
    },
  },
});
