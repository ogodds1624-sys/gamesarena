import { ScanLine } from "lucide-react";
import {
  extractionSchema,
  rankFixtures,
  screenshotRejection,
  type ScanJob,
} from "@/lib/image-scan";
import { ScanActivity } from "@/components/scan-activity";

function shown(value: string | number | null) {
  return value === null ? "Not visible / unreadable" : String(value);
}

export function ScanResults({ job, working = false }: { job: ScanJob; working?: boolean }) {
  const extraction = extractionSchema.safeParse(job.result?.extraction);
  const report = extraction.success ? rankFixtures(extraction.data) : job.result;
  const rejection = report ? screenshotRejection(report.extraction) : null;
  return (
    <section aria-labelledby={`result-${job.id}`} className="scanner-panel">
      <div className="scanner-section-heading">
        <ScanLine size={22} aria-hidden />
        <h2 id={`result-${job.id}`}>Scan results</h2>
        <span className="scanner-tag">{job.status.replace("_", " ")}</span>
      </div>
      <p className="mt-3 text-xs text-white/55">
        {new Date(job.createdAt).toLocaleString()} /{" "}
        {job.charged ? "1 credit used" : "No credit used"}
      </p>
      {job.error ? (
        <p role="alert" className="scanner-notice mt-4">
          {job.error}
        </p>
      ) : null}
      {!report ? (
        job.status === "failed" ? (
          <p role="status" className="py-8 text-sm text-white/60">
            Try another clear screenshot.
          </p>
        ) : (
          <ScanActivity scanning={working || job.status === "processing"} />
        )
      ) : rejection ? (
        <p role="alert" className="scanner-notice mt-4">
          {rejection} {!job.charged ? "No credit was used." : ""}
        </p>
      ) : (
        <>
          <h3 className="mt-6 text-lg font-extrabold">Top two team selections</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            AI reads the screenshot and checks the visible evidence. We select up to two market
            favourites from different matches, ordered by the lowest displayed odds. These are not
            guaranteed winners or safe bets. Uncertain markets, draw favourites, ties and odds gaps
            below 0.05 are excluded.
          </p>
          {!report.rankings.length ? (
            <p className="scanner-notice mt-4">
              No selection meets the ranking criteria. Missing or uncertain evidence is not replaced
              with a guess.
            </p>
          ) : (
            <ol className="mt-4 grid gap-3">
              {report.rankings.map((selection) => {
                const match = report.extraction.fixtures[selection.fixtureIndex];
                return (
                  <li key={selection.fixtureIndex} className="scanner-fixture">
                    <p className="text-xs font-bold tracking-wide text-red-300">
                      PICK {selection.rank} / MARKET FAVOURITE
                    </p>
                    <h4 className="mt-2 font-extrabold">
                      {match.home} vs {match.away}
                    </h4>
                    <p className="mt-2 font-bold">
                      {selection.label} <span className="text-red-300">@ {selection.odds}</span>
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">{selection.reason}</p>
                  </li>
                );
              })}
            </ol>
          )}
          {report.rankings.length < 2 ? (
            <p className="mt-4 text-sm text-white/60">
              Fewer than two distinct team selections qualify. We do not force a second pick.
            </p>
          ) : null}
          <h3 className="mt-7 text-lg font-extrabold">Selected match evidence</h3>
          <p className="mt-2 text-xs text-white/55">
            Image quality: {report.extraction.quality}. AI transcription is not independently
            verified.
          </p>
          {report.extraction.warnings.map((warning, index) => (
            <p key={index} className="scanner-notice mt-3">
              {warning}
            </p>
          ))}
          {!report.extraction.fixtures.length ? (
            <p className="mt-4 text-sm text-white/60">No readable fixtures found.</p>
          ) : null}
          <div className="mt-4 grid gap-4">
            {report.extraction.fixtures.map((fixture, index) =>
              report.rankings.some((selection) => selection.fixtureIndex === index) ? (
                <article className="scanner-fixture" key={index}>
                  <h4 className="font-extrabold">
                    {shown(fixture.home)} vs {shown(fixture.away)}
                  </h4>
                  <dl className="scanner-facts mt-4">
                    <dt>Provider / sport</dt>
                    <dd>
                      {shown(fixture.provider)} / {shown(fixture.sport)}
                    </dd>
                    <dt>Match ID</dt>
                    <dd>{shown(fixture.matchId)}</dd>
                    <dt>Market</dt>
                    <dd>
                      {shown(fixture.market)} ({fixture.marketKind.replaceAll("_", " ")})
                    </dd>
                    <dt>Time / countdown</dt>
                    <dd>{shown(fixture.time)}</dd>
                    <dt>Visible status</dt>
                    <dd>{fixture.status}</dd>
                  </dl>
                  <div className="scanner-odds mt-4">
                    <div>
                      <span>Home</span>
                      <strong>{shown(fixture.homeOdds)}</strong>
                    </div>
                    <div>
                      <span>Draw</span>
                      <strong>{shown(fixture.drawOdds)}</strong>
                    </div>
                    <div>
                      <span>Away</span>
                      <strong>{shown(fixture.awayOdds)}</strong>
                    </div>
                  </div>
                  {fixture.statistics.length ? (
                    <>
                      <h5 className="mt-4 text-sm font-bold">Visible results / statistics</h5>
                      <ul className="mt-2 space-y-1 text-sm text-white/65">
                        {fixture.statistics.map((stat, i) => (
                          <li key={i}>
                            {stat.label}: {stat.value}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-white/50">No results or statistics visible.</p>
                  )}
                  {fixture.uncertainFields.length ? (
                    <p className="scanner-notice mt-3">
                      Uncertainty: {fixture.uncertainFields.join("; ")}
                    </p>
                  ) : null}
                  {report.excluded
                    .filter((item) => item.fixtureIndex === index)
                    .map((item) => (
                      <p className="mt-3 text-xs text-white/60" key={item.fixtureIndex}>
                        Not ranked: {item.reason}
                      </p>
                    ))}
                </article>
              ) : null,
            )}
          </div>
          <aside className="scanner-notice mt-6" aria-label="Evidence limitations">
            <h3 className="font-bold">Evidence limitations</h3>
            <ul className="mt-2 list-disc space-y-2 pl-4">
              {report.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs">Rules: {report.rulesVersion}</p>
          </aside>
        </>
      )}
    </section>
  );
}
