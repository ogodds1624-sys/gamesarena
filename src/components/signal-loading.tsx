import { Plane } from "lucide-react";
import { AviatorBrandMark } from "@/components/aviator-brand-mark";

export const CONNECTING_PHONE_MESSAGE =
  "CONNECTING YOUR PHONE TO THE HACK SERVER PLEASE CHECK YOUR NETWORK\n\nCHECK YOUR DEVICE CONNECTION.....";

export function SignalLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="signal-loading-backdrop">
      <div className="signal-loading-panel" role="status" aria-live="polite" aria-label={label}>
        <div className="signal-loading-brand">
          <span className="signal-loading-brand-mark"><AviatorBrandMark className="header-plane-mark" /></span>
          <span>GAMES HUB</span>
          <span className="signal-loading-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="signal-loading-emblem" aria-hidden="true">
          <span className="signal-loading-ring signal-loading-ring-outer" />
          <span className="signal-loading-ring signal-loading-ring-inner" />
          <span className="signal-orbit">
            <Plane className="signal-loading-plane" />
          </span>
          <AviatorBrandMark className="signal-loading-mark" />
          <span className="signal-loading-center" />
        </div>
        <div className="signal-loading-status">
          <p className="signal-loading-label">{label}</p>
          <span className="signal-loading-track" aria-hidden="true">
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}
