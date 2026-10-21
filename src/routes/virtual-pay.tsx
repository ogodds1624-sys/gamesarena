import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SignalLoading } from "@/components/signal-loading";
import { PaymentCheckout } from "@/components/payment-checkout";
import { virtualCreditOffer } from "@/lib/virtual-credits";

export const Route = createFileRoute("/virtual-pay")({
  validateSearch: (search: Record<string, unknown>): { credits?: number } => {
    const credits = Number(search.credits);
    try {
      virtualCreditOffer(credits);
      return { credits };
    } catch {
      return {};
    }
  },
  component: VirtualPayPage,
});

function VirtualPayPage() {
  const { credits } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (credits == null) void navigate({ to: "/virtual-packages", replace: true });
  }, [credits, navigate]);
  if (credits == null) return <SignalLoading label="Opening Instant Virtual packages" />;
  return <PaymentCheckout key={credits} virtualCredits={credits} />;
}
