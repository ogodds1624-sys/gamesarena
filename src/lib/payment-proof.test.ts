import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentPayerName, validatePaymentProof } from "./payment-proof.ts";

test("payment proof requires both payer name and receipt for every checkout", () => {
  for (const name of [undefined, null, "", "   ", 123]) {
    assert.throws(() => validatePaymentProof(name, "data:image/png;base64,proof"), /name on/);
  }
  for (const receipt of [undefined, "", " ", null]) {
    assert.throws(() => validatePaymentProof("Ama Mensah", receipt), /screenshot/);
  }
  assert.throws(() => paymentPayerName("a".repeat(101)), /100 characters/);
  for (const name of ["Ama Mensah", "Chinedu Okafor", "O'Connor", "李"]) {
    assert.deepEqual(validatePaymentProof(`  ${name}  `, "proof"), { name, receipt: "proof" });
  }
});
