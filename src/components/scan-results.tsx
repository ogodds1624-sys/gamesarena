import { ScanLine, Target } from "lucide-react";
import {
  extractionSchema,
  rankFixtures,
  RANKING_RULES,
  screenshotRejection,
  type ScanJob,
} from "@/lib/image-scan";
import { ScanActivity } from "@/components/scan-activity";

export function ScanResults({ job, working = false }: { job: ScanJob; working?: boolean }) {
  const extraction = extractionSchema.safeParse(job.result?.extraction);
  const report =
    extraction.success && job.result?.rulesVersion !== RANKING_RULES.version
      ? rankFixtures(extraction.data, () => 0)
      : job.result;
  const rejection = report ? screenshotRejection(report.extraction) : null;
  return (
    <section aria-labelledby={`result-${job.id}`} className="scanner-panel">
      <div className="scanner-section-heading">
        <ScanLine size={22} aria-hidden />
        <h2 id={`result-${job.id}`}>Scan results</h2>
        <span className="scanner-tag">{job.status.replace("_", " ")}</span>
      </div>
      <p className="mt-3 text-xs text-white/55">
        {job.charged ? "1 credit used" : "No credit used"}
      </p>
      {job.error ? (
        <p role="alert" className="scanner-notice mt-4">
          {job.error}
        </p>
      ) : null}
      {!report ? (
        job.status === "failed" ? null : (
          <ScanActivity scanning={working || job.status === "processing"} />
        )
      ) : rejection ? (
        <p role="alert" className="scanner-notice mt-4">
          {rejection}
        </p>
      ) : (
        <>
          {report.rankings.length < RANKING_RULES.maximumSelections ? (
            <p className="scanner-notice mt-4">
              Upload a clearer Instant Football screenshot showing at least two different matches
              and all Home, Draw and Away odds.
              {!job.charged ? " No credit was used." : ""}
            </p>
          ) : (
            <ol className="mt-4 grid gap-3">
              {report.rankings.map((selection) => {
                const match = report.extraction.fixtures[selection.fixtureIndex];
                return (
                  <li key={selection.fixtureIndex} className="scanner-pick-card">
                    <header className="scanner-pick-header">
                      <span className="scanner-pick-icon">
                        <Target size={22} aria-hidden />
                      </span>
                      <div>
                        <p>GAMES HUB PICK {selection.rank}</p>
                        <h3>Instant Virtual Football</h3>
                      </div>
                      <span className="scanner-pick-ready">READY</span>
                    </header>
                    <div className="scanner-pick-teams">
                      <div>
                        <span className="scanner-team-badge" aria-hidden>
                          {match.home?.slice(0, 3).toUpperCase()}
                        </span>
                        <strong>{match.home}</strong>
                      </div>
                      <span className="scanner-pick-versus">VS</span>
                      <div>
                        <span className="scanner-team-badge" aria-hidden>
                          {match.away?.slice(0, 3).toUpperCase()}
                        </span>
                        <strong>{match.away}</strong>
                      </div>
                    </div>
                    <div className="scanner-pick-choice">
                      <div>
                        <p>OUR PICK</p>
                        <strong>
                          {selection.option === "draw"
                            ? "Draw (X)"
                            : `${selection.label} - ${selection.option === "home" ? "Home (1)" : "Away (2)"}`}
                        </strong>
                      </div>
                      <div className="scanner-pick-price">
                        <strong>{selection.odds}</strong>
                        <span>visible odds</span>
                      </div>
                    </div>
                    <footer className="scanner-pick-footer">
                      Market favourite / Verify teams and odds
                    </footer>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-4 text-xs text-white/55">
            {report.rulesVersion === RANKING_RULES.version &&
            job.result?.rulesVersion === RANKING_RULES.version
              ? "Two randomly selected matches; lowest-odds picks, not guaranteed winners."
              : "Odds-based picks, not guaranteed winners."}{" "}
            Verify teams and odds.
          </p>
        </>
      )}
    </section>
  );
}
