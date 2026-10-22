import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

test("activation approval returns every country/game to home across checkout and background detection", async () => {
  const mocks = {
    "@tanstack/react-router": `
      import React from "react";
      const navigate = async options => { window.destination = options.to; };
      export const useNavigate = () => navigate;
      export const useRouterState = ({select}) => select({location:{pathname:"/"}});
      export const Link = ({to,children,...props}) => <a href={to} {...props}>{children}</a>;
    `,
    "@/lib/auth/use-current-user": `
      export const useCurrentUserState = () => ({
        user:{id:"member",isDevFallback:false},isPending:false
      });
    `,
    "@/lib/storefront-live": `export const useLiveStorefront = () => null;`,
    "@/components/signal-loading": `
      export const CONNECTING_PHONE_MESSAGE = "Connecting";
      export const SignalLoading = () => null;
    `,
    "@/lib/admin-snapshot": `
      export async function getSportyLink() {
        return {signedIn:true,linked:true,country:window.scenario.country,
          activated:window.scenario.mode==="reopen",
          activationPayment:{id:"activation",amount:55}};
      }
      export async function getPaymentStatus() {
        return {purpose:window.scenario.purpose,status:window.scenario.status,amount:55,minutes:3};
      }
      export async function recordPayment() { throw new Error("Unexpected payment submission"); }
      export async function saveReferral() { throw new Error("Unexpected referral mutation"); }
    `,
  };
  const bundle = await build({
    stdin: {
      contents: `
        import React from "react";
        import {createRoot} from "react-dom/client";
        import {PaymentCheckout} from "./src/components/payment-checkout";
        import {PendingPaymentWatcher} from "./src/components/pending-payment-watcher";
        createRoot(document.getElementById("root")).render(
          window.scenario.mode==="watcher" ? <PendingPaymentWatcher/> : <PaymentCheckout activation/>
        );
      `,
      loader: "tsx",
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "activation-boundaries",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(@tanstack\/react-router|@\/lib\/(admin-snapshot|storefront-live|auth\/use-current-user)|@\/components\/signal-loading)$/,
            },
            (args) => ({ path: args.path, namespace: "mock" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            contents: mocks[args.path],
            loader: "tsx",
            resolveDir: fileURLToPath(new URL("..", import.meta.url)),
          }));
        },
      },
    ],
  });
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/app.js" ? "application/javascript" : "text/html");
    res.end(
      req.url === "/app.js"
        ? bundle.outputFiles[0].text
        : '<div id="root"></div><script src="/app.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      headless: true,
    });
    for (const country of ["Ghana", "Nigeria"]) {
      for (const game of ["aviator", "virtual"]) {
        for (const mode of ["checkout", "watcher", "reopen"]) {
          const page = await browser.newPage();
          await page.addInitScript(
            ({ country, game, mode }) => {
              window.scenario = { country, mode, purpose: "activation", status: "confirmed" };
              localStorage.setItem("test-session", "signed-in");
              localStorage.setItem(
                "casino-pending-payment",
                JSON.stringify({
                  id: "activation",
                  amount: 55,
                  purpose: "activation",
                }),
              );
              if (game === "virtual") sessionStorage.setItem("games-hub-next-game", "virtual");
            },
            { country, game, mode },
          );
          await page.goto(`http://127.0.0.1:${server.address().port}`);
          await page.waitForFunction(() => window.destination === "/");
          assert.deepEqual(
            await page.evaluate(() => ({
              session: localStorage.getItem("test-session"),
              pending: localStorage.getItem("casino-pending-payment"),
              nextGame: sessionStorage.getItem("games-hub-next-game"),
            })),
            { session: "signed-in", pending: null, nextGame: null },
          );
          await page.close();
        }
      }
    }
    for (const [purpose, status, destination] of [
      ["activation", "rejected", "/activation"],
      ["virtual_credits", "confirmed", "/virtual-scan"],
      ["virtual_credits", "rejected", "/virtual-packages"],
      ["session", "confirmed", "/session"],
    ]) {
      const page = await browser.newPage();
      await page.addInitScript(
        ({ purpose, status }) => {
          window.scenario = { country: "Ghana", mode: "watcher", purpose, status };
          localStorage.setItem(
            "casino-pending-payment",
            JSON.stringify({ id: "payment", amount: 55, purpose }),
          );
        },
        { purpose, status },
      );
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction((target) => window.destination === target, destination);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
