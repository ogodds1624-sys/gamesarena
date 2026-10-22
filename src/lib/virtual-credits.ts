import type { PricingSettings } from "./pricing.ts";

export const VIRTUAL_CREDIT_OFFERS = [
  { credits: 1, amount: 300 },
  { credits: 3, amount: 400 },
  { credits: 5, amount: 500 },
] as const;

export const VIRTUAL_NGN_PER_GHS = 121;
export type VirtualCountry = "Ghana" | "Nigeria";
export type VirtualCreditOffer = {
  credits: (typeof VIRTUAL_CREDIT_OFFERS)[number]["credits"];
  amount: number;
};

export function virtualCreditOffer(
  credits: number,
  country: VirtualCountry = "Ghana",
  pricing?: PricingSettings,
): VirtualCreditOffer {
  if (pricing) {
    const saved = pricing[country].virtualPackages.find((item) => item.credits === credits);
    if (!saved) throw new Error("Choose a valid Instant Virtual credit package.");
    return { ...saved };
  }
  const offer = VIRTUAL_CREDIT_OFFERS.find((item) => item.credits === credits);
  if (!offer) throw new Error("Choose a valid Instant Virtual credit package.");
  return {
    credits: offer.credits,
    amount: offer.amount * (country === "Nigeria" ? VIRTUAL_NGN_PER_GHS : 1),
  };
}

export function validateVirtualCreditPurchase(
  amount: number,
  credits: number,
  country: VirtualCountry = "Ghana",
  pricing?: PricingSettings,
): VirtualCreditOffer {
  const offer = virtualCreditOffer(credits, country, pricing);
  if (amount !== offer.amount) {
    throw new Error(
      "The Instant Virtual credit price changed. Go back and choose the package again.",
    );
  }
  return offer;
}
