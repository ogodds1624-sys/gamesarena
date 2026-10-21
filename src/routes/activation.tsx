import { createFileRoute } from "@tanstack/react-router";
import { PaymentCheckout } from "@/components/payment-checkout";

export const Route = createFileRoute("/activation")({
  component: () => <PaymentCheckout activation />,
});
