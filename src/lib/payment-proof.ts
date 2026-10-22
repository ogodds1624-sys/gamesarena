export function paymentPayerName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Enter the name on the MoMo or bank account you paid from.");
  }
  const name = value.trim();
  if (name.length > 100) throw new Error("Account holder name must be 100 characters or fewer.");
  return name;
}

export function validatePaymentProof(name: unknown, receipt: unknown) {
  const payerName = paymentPayerName(name);
  if (typeof receipt !== "string" || !receipt.trim()) {
    throw new Error("Attach a screenshot of your payment.");
  }
  return { name: payerName, receipt };
}
