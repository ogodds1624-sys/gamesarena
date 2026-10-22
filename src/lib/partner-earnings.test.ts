import assert from "node:assert/strict";
import test from "node:test";
import {
  adminEarnings,
  availablePartnerEarnings,
  availableTotalPartnerEarnings,
  commissionAmount,
  partnerSettlementBalances,
  partnerEarnings,
  paidPartnerPayouts,
  previousSettlementDate,
  settlementGross,
} from "./partner-earnings.ts";

test("paid-out totals start at zero and keep currencies separate", () => {
  assert.equal(paidPartnerPayouts([], "GHS"), 0);
  const payouts = [
    { amount: 120, currency: "GHS" as const, status: "paid" },
    { amount: 80, currency: "GHS" as const, status: "paid" },
    { amount: 9000, currency: "NGN" as const, status: "paid" },
    { amount: 50, currency: "GHS" as const, status: "pending" },
    { amount: 60, currency: "GHS" as const, status: "rejected" },
  ];
  assert.equal(paidPartnerPayouts(payouts, "GHS"), 200);
  assert.equal(paidPartnerPayouts(payouts, "NGN"), 9000);
  payouts[3].status = "paid";
  assert.equal(paidPartnerPayouts(payouts, "GHS"), 250);
  assert.equal(paidPartnerPayouts(payouts, "GHS"), 250);
});

test("gives the partner their commission percentage of gross revenue and leaves the rest to admin", () => {
  assert.equal(commissionAmount(1000, 65), 650);
  assert.equal(partnerEarnings(1000, 65), 650);
  assert.equal(adminEarnings(1000, 65), 350);
});

test("applies each partner's commission percentage", () => {
  assert.equal(partnerEarnings(1000, 0), 0);
  assert.equal(adminEarnings(1000, 0), 1000);
  assert.equal(partnerEarnings(1000, 10), 100);
  assert.equal(adminEarnings(1000, 10), 900);
  assert.equal(partnerEarnings(1000, 35), 350);
  assert.equal(adminEarnings(1000, 35), 650);
  assert.equal(partnerEarnings(1000, 65), 650);
  assert.equal(adminEarnings(1000, 65), 350);
  assert.equal(partnerEarnings(1000, 100), 1000);
  assert.equal(adminEarnings(1000, 100), 0);
});

test("reserves pending and paid payouts from available earnings", () => {
  assert.equal(availablePartnerEarnings(1000, 65, 250), 400);
  assert.equal(availablePartnerEarnings(1000, 65, 700), 0);
});

test("calculates available balance from total earnings minus reserved payouts", () => {
  assert.equal(availableTotalPartnerEarnings(1500, 500), 1000);
  assert.equal(availableTotalPartnerEarnings(1500, 1500), 0);
  assert.equal(availableTotalPartnerEarnings(1500, 2000), 0);
});

test("uses the prior local calendar day for Ghana and Nigeria settlements", () => {
  const now = new Date("2026-10-06T00:30:00.000Z");
  assert.equal(previousSettlementDate(now, "Africa/Accra"), "2026-10-05");
  assert.equal(previousSettlementDate(now, "Africa/Lagos"), "2026-10-05");
});

test("resolves Ghana and Nigeria yesterday independently near midnight", () => {
  const now = new Date("2026-10-05T23:30:00.000Z");
  assert.equal(previousSettlementDate(now, "Africa/Accra"), "2026-10-04");
  assert.equal(previousSettlementDate(now, "Africa/Lagos"), "2026-10-05");
});

test("resolves yesterday correctly across a local month boundary", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  assert.equal(previousSettlementDate(now, "Africa/Accra"), "2026-10-31");
});

test("only includes payments settled on the eligible previous day", () => {
  const payments = [
    { amount: 100, date: "2026-10-05" },
    { amount: "250", date: "2026-10-05" },
    { amount: 900, date: "2026-10-06" },
    { amount: 400, date: "2026-10-04" },
  ];
  assert.equal(settlementGross(payments, "2026-10-05"), 350);
});

test("keeps rejected settlement earnings available on later days", () => {
  const payments = [
    { amount: 1000, date: "2026-10-04" },
    { amount: 500, date: "2026-10-05" },
  ];
  const payouts = [
    { amount: 500, earningDate: "2026-10-04", status: "rejected" },
    { amount: 200, earningDate: "2026-10-05", status: "pending" },
  ];

  assert.deepEqual(
    partnerSettlementBalances(payments, ["2026-10-05", "2026-10-04"], 65, payouts),
    [
      { earningDate: "2026-10-05", available: 125 },
      { earningDate: "2026-10-04", available: 650 },
    ],
  );
});
