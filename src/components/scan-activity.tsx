import { ScanLine } from "lucide-react";

export function ScanActivity({ scanning }: { scanning: boolean }) {
  return (
    <div
      className={`scanner-activity ${scanning ? "is-scanning" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="scanner-activity-visual" aria-hidden>
        <div className="scanner-orbit" />
        <div className="scanner-document">
          <ScanLine size={32} />
          <span />
          <span />
          <span />
          {scanning ? <div className="scanner-beam" /> : null}
        </div>
      </div>
      <span className="scanner-activity-label">{scanning ? "SCANNER ACTIVE" : "IN THE QUEUE"}</span>
      <h3>{scanning ? "Reading your screenshot" : "Your screenshot is ready"}</h3>
      <p>
        {scanning
          ? "Identifying Instant Football, reading fixtures and checking visible odds."
          : "Waiting for a processing slot. Your scan will start automatically."}
      </p>
      <div className="scanner-activity-dots" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <p className="scanner-activity-footnote">
        Results appear here when processing finishes. No credit is used until a readable result is
        saved.
      </p>
    </div>
  );
}
