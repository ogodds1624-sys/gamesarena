import { DEFAULT_PRICING, type PricingSettings } from "./pricing.ts";

export type PaymentPurpose = "session" | "activation" | "virtual_credits";

export function activationFee(country: "Ghana" | "Nigeria", pricing: PricingSettings = DEFAULT_PRICING) {
  return pricing[country].activationFee;
}
