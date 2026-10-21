import assert from "node:assert/strict";
import { test } from "node:test";
import { activationFee } from "./activation.ts";
import { isNairaAmount } from "./desk-session.ts";
import { openTask, taskStep, type TaskProgress } from "./task-order.ts";

test("activation fees are country-specific", () => {
  assert.equal(activationFee("Ghana"), 55);
  assert.equal(activationFee("Nigeria"), 6655);
});

test("activation currency classification includes current and historical Nigerian fees", () => {
  assert.equal(isNairaAmount(activationFee("Ghana")), false);
  assert.equal(isNairaAmount(activationFee("Nigeria")), true);
  assert.equal(isNairaAmount(7000), true);
});

test("activation approval is required before either country's packages", async () => {
  for (const country of ["Ghana", "Nigeria"] as const) {
    const link: TaskProgress = { signedIn: true, country, linked: true };
    let destination: string | undefined;
    const navigate: Parameters<typeof openTask>[0] = async (options) => {
      destination = typeof options.to === "string" ? options.to : undefined;
    };
    assert.equal(taskStep(link), 4);
    await openTask(navigate, link);
    assert.equal(destination, "/activation");
    link.activated = true;
    assert.equal(taskStep(link), 5);
    await openTask(navigate, link);
    assert.equal(destination, country === "Nigeria" ? "/nigeria-pay" : "/packages");
  }
});

test("activation does not bypass registration, country selection, or number linking", () => {
  const link: TaskProgress = { signedIn: false, country: null, linked: false };
  assert.equal(taskStep(link), 1);
  link.signedIn = true;
  assert.equal(taskStep(link), 2);
  link.country = "Ghana";
  assert.equal(taskStep(link), 3);
});

test("Instant Virtual keeps its destination after activation approval", async () => {
  let destination: string | undefined;
  const navigate: Parameters<typeof openTask>[0] = async (options) => {
    destination = typeof options.to === "string" ? options.to : undefined;
  };
  const link: TaskProgress = {
    signedIn: true,
    country: "Nigeria",
    linked: true,
    activated: false,
  };
  await openTask(navigate, link, "virtual");
  assert.equal(destination, "/activation");
  link.activated = true;
  await openTask(navigate, link, "virtual");
  assert.equal(destination, "/virtual-packages");
});
