import { z } from "zod";
import type { PaymentPurpose } from "./activation.ts";

export const PACKAGE_IDS = ["quick", "popular", "extended"] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];
export type PricingCountry = "Ghana" | "Nigeria";

const price = z.number().int().min(1).max(2_147_483_647);
const countryPricing = z
  .object({
    activationFee: price,
    packages: z
      .array(
        z.object({
          id: z.enum(PACKAGE_IDS),
          price,
          minutes: z.number().int().min(1).max(1440),
        }),
      )
      .length(3),
  })
  .superRefine((value, context) => {
    if (new Set(value.packages.map((pack) => pack.id)).size !== 3) {
      context.addIssue({ code: "custom", message: "Keep one of each package tier." });
    }
    if (new Set(value.packages.map((pack) => pack.price)).size !== 3) {
      context.addIssue({
        code: "custom",
        message: "Package prices must be different within each country.",
      });
    }
  });

const pricingSchema = z.object({ Ghana: countryPricing, Nigeria: countryPricing });
export type PricingSettings = z.infer<typeof pricingSchema>;
export type PaymentQuote = { amount: number; minutes: number | null; packageId: PackageId | null };

export const DEFAULT_PRICING: PricingSettings = {
  Ghana: {
    activationFee: 55,
    packages: [
      { id: "quick", price: 350, minutes: 3 },
      { id: "popular", price: 800, minutes: 10 },
      { id: "extended", price: 1700, minutes: 15 },
    ],
  },
  Nigeria: {
    activationFee: 6655,
    packages: [
      { id: "quick", price: 41986, minutes: 3 },
      { id: "popular", price: 95968, minutes: 10 },
      { id: "extended", price: 203932, minutes: 15 },
    ],
  },
};

export function validatePricing(value: unknown): PricingSettings {
  const result = pricingSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid pricing: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  }
  return result.data;
}

export function paymentQuote(
  pricing: PricingSettings,
  country: PricingCountry,
  purpose: PaymentPurpose,
  packageId?: string,
  amount?: number,
): PaymentQuote {
  const settings = pricing[country];
  if (purpose === "activation") {
    return { amount: settings.activationFee, minutes: null, packageId: null };
  }
  const pack = packageId
    ? settings.packages.find((item) => item.id === packageId)
    : amount !== undefined
      ? settings.packages.find((item) => item.price === amount)
      : settings.packages.find((item) => item.id === "quick");
  if (!pack)
    throw new Error("This package is no longer available. Go back and choose a package again.");
  return { amount: pack.price, minutes: pack.minutes, packageId: pack.id };
}

export function validatePaymentQuote(
  pricing: PricingSettings,
  country: PricingCountry,
  data: { purpose: PaymentPurpose; amount: number; packageId?: string; minutes?: number | null },
): PaymentQuote {
  const quote = paymentQuote(pricing, country, data.purpose, data.packageId, data.amount);
  if (
    data.amount !== quote.amount ||
    (data.minutes !== undefined && data.minutes !== quote.minutes)
  ) {
    throw new Error(
      "Pricing has changed. Reload checkout and check the new price and minutes before paying.",
    );
  }
  return quote;
}
