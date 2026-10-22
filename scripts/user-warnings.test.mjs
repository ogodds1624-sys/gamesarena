import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("warnings enforce admin operations, owner acknowledgement and persistent removal", async () => {
  const db = new PGlite();
  let user = null;
  let admin = false;
  const sql = async (strings, ...values) => {
    const query = strings.reduce(
      (text, part, index) => text + (index ? `$${index}` : "") + part,
      "",
    );
    return (await db.query(query, values)).rows;
  };
  const bridge = { sql, session: () => user, admin: () => admin };
  const mocks = {
    "@tanstack/react-start": `
      export function createServerFn() {
        let validate = value => value;
        let middleware = [];
        const chain = {
          middleware(value) { middleware = value; return chain; },
          inputValidator(value) { validate = value; return chain; },
          handler(handler) {
            return async (options = {}) => {
              for (const item of middleware) await item();
              return handler({ data: validate(options.data) });
            };
          }
        };
        return chain;
      }`,
    "@/lib/admin-auth": `export const adminAuthMiddleware=async()=>{if(!bridge.admin())throw new Error("Admin required")}`,
    "@/lib/db": `export const getSql=async()=>bridge.sql`,
    "@/lib/auth/verify.server": `export const getSessionUser=async()=>bridge.session()`,
  };
  try {
    await db.exec(`create table "user"(id text primary key,email text);
      insert into "user" values('one','one@example.com'),('two','two@example.com');`);
    await db.exec(
      await readFile(new URL("../migrations/0020_user_warnings.sql", import.meta.url), "utf8"),
    );
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../src/lib/user-warnings.ts", import.meta.url))],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      packages: "external",
      plugins: [
        {
          name: "warning-test-boundaries",
          setup(builder) {
            builder.onResolve(
              { filter: /^(@tanstack\/react-start|@\/lib\/(admin-auth|db|auth\/verify.server))$/ },
              (args) => ({ path: args.path, namespace: "mock" }),
            );
            builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
              contents: mocks[args.path],
              loader: "js",
            }));
          },
        },
      ],
    });
    const module = { exports: {} };
    const { createRequire } = await import("node:module");
    new Function("require", "module", "exports", "bridge", bundle.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports,
      bridge,
    );
    const api = module.exports;
    await assert.rejects(api.listUserWarnings(), /Admin required/);
    await assert.rejects(
      api.sendUserWarning({ data: { email: "one@example.com", message: "Warning" } }),
      /Admin required/,
    );
    admin = true;
    await assert.rejects(
      api.sendUserWarning({ data: { email: "absent@example.com", message: "Warning" } }),
      /No account/,
    );
    await assert.rejects(api.sendUserWarning({ data: { email: "one@example.com", message: " " } }));
    await assert.rejects(
      api.sendUserWarning({ data: { email: "one@example.com", message: "a".repeat(1001) } }),
    );
    await api.sendUserWarning({
      data: { email: " ONE@EXAMPLE.COM ", message: " Please follow the rules. " },
    });
    const [warning] = await api.listUserWarnings();
    assert.equal(warning.message, "Please follow the rules.");
    assert.equal(warning.acknowledgedAt, null);
    assert.deepEqual(await api.getMyWarnings(), []);
    user = { id: "two" };
    assert.deepEqual(await api.getMyWarnings(), []);
    await assert.rejects(
      api.acknowledgeWarning({ data: { id: warning.id } }),
      /no longer available/,
    );
    user = { id: "one", blocked: true };
    assert.equal((await api.getMyWarnings()).length, 1);
    await api.acknowledgeWarning({ data: { id: warning.id } });
    await api.acknowledgeWarning({ data: { id: warning.id } });
    assert.deepEqual(await api.getMyWarnings(), []);
    assert.ok((await api.listUserWarnings())[0].acknowledgedAt);
    admin = false;
    await assert.rejects(api.removeUserWarning({ data: { id: warning.id } }), /Admin required/);
    admin = true;
    await api.removeUserWarning({ data: { id: warning.id } });
    assert.deepEqual(await api.listUserWarnings(), []);
    await assert.rejects(
      api.acknowledgeWarning({ data: { id: warning.id } }),
      /no longer available/,
    );
    await api.sendUserWarning({ data: { email: "one@example.com", message: "Second warning" } });
    const [second] = await api.getMyWarnings();
    await api.removeUserWarning({ data: { id: second.id } });
    assert.deepEqual(await api.getMyWarnings(), []);
    const rows = (await db.query("select * from user_warnings")).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows[0].removed_at);
    assert.ok(rows[0].acknowledged_at);
  } finally {
    await db.close();
  }
});
