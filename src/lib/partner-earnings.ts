export function commissionAmount(grossEarnings: number, commissionPercent: number) {
  return Math.round((grossEarnings * commissionPercent) / 100);
}

export function partnerEarnings(grossEarnings: number, commissionPercent: number) {
  return commissionAmount(grossEarnings, commissionPercent);
}

export function adminEarnings(grossEarnings: number, commissionPercent: number) {
  return Math.max(0, grossEarnings - partnerEarnings(grossEarnings, commissionPercent));
}

export function availablePartnerEarnings(grossEarnings: number, commissionPercent: number, reservedPayouts: number) {
  return Math.max(0, partnerEarnings(grossEarnings, commissionPercent) - reservedPayouts);
}

export function availableTotalPartnerEarnings(totalEarnings: number, reservedPayouts: number) {
  return Math.max(0, totalEarnings - reservedPayouts);
}

export function paidPartnerPayouts(
  payouts: readonly { amount: number; currency: "GHS" | "NGN"; status: string }[],
  currency: "GHS" | "NGN",
) {
  return payouts
    .filter((payout) => payout.currency === currency && payout.status === "paid")
    .reduce((sum, payout) => sum + payout.amount, 0);
}

export function previousSettlementDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => Number(parts.find((item) => item.type === type)?.value);
  const previous = new Date(Date.UTC(part("year"), part("month") - 1, part("day") - 1));
  return [
    previous.getUTCFullYear().toString().padStart(4, "0"),
    (previous.getUTCMonth() + 1).toString().padStart(2, "0"),
    previous.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function settlementGross(
  payments: readonly { amount: number | string; date: string }[],
  settlementDate: string,
) {
  return payments.reduce(
    (sum, payment) => sum + (payment.date === settlementDate ? Number(payment.amount) : 0),
    0,
  );
}

export function partnerSettlementBalances(
  payments: readonly { amount: number | string; date: string }[],
  settlementDates: readonly string[],
  commissionPercent: number,
  payouts: readonly { amount: number; earningDate: string; status: string }[],
) {
  return [...new Set(settlementDates)].map((earningDate) => {
    const reservedPayouts = payouts
      .filter((payout) => payout.earningDate === earningDate && payout.status !== "rejected")
      .reduce((sum, payout) => sum + payout.amount, 0);
    return {
      earningDate,
      available: availablePartnerEarnings(
        settlementGross(payments, earningDate),
        commissionPercent,
        reservedPayouts,
      ),
    };
  });
}
