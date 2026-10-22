import { z } from "zod";

// Below Vercel's function request-body limit, including transport overhead.
export const MAX_SCAN_BYTES = 3 * 1024 * 1024;
export const MAX_SCAN_FILES = 5;
export const SCAN_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ScanMediaType = (typeof SCAN_TYPES)[number];
export function isScanMediaType(type: string): type is ScanMediaType {
  return SCAN_TYPES.some((allowed) => allowed === type);
}
export function matchesScanSignature(bytes: Uint8Array, type: ScanMediaType): boolean {
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

const visibleText = z.string().trim().min(1).max(200).nullable();
const odds = z.number().finite().gt(1).max(100000).nullable();
export const fixtureSchema = z
  .object({
    provider: visibleText,
    sport: visibleText,
    home: visibleText,
    away: visibleText,
    matchId: visibleText,
    market: visibleText,
    marketKind: z.enum(["three_way_winner", "two_way_winner", "other", "unknown"]),
    homeOdds: odds,
    drawOdds: odds,
    awayOdds: odds,
    time: visibleText,
    status: z.enum(["upcoming", "live", "finished", "unknown"]),
    statistics: z
      .array(
        z
          .object({
            label: z.string().min(1).max(100),
            value: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(20),
    uncertainFields: z.array(z.string().min(1).max(200)).max(30),
  })
  .strict();
export const extractionSchema = z
  .object({
    screenshotType: z.enum(["sportybet_instant_football", "normal_football", "other", "unknown"]),
    identificationEvidence: z.array(z.string().trim().min(1).max(200)).max(10),
    quality: z.enum(["clear", "partial", "unreadable", "unrelated"]),
    fixtures: z.array(fixtureSchema).max(30),
    warnings: z.array(z.string().min(1).max(300)).max(20),
  })
  .strict();
export type Fixture = z.infer<typeof fixtureSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

export function screenshotRejection(
  extraction: Partial<Pick<Extraction, "screenshotType" | "identificationEvidence">>,
): string | null {
  if (extraction.screenshotType === "normal_football") {
    return "This is not an Instant Football prediction. Normal football screenshots are not supported. Upload a SportyBet Instant Football screenshot.";
  }
  if (
    extraction.screenshotType !== "sportybet_instant_football" ||
    !extraction.identificationEvidence?.length
  ) {
    return "We could not confirm this is SportyBet Instant Football. Upload a clear screenshot showing the Instant Football heading and match-winner odds.";
  }
  return null;
}

export const RANKING_RULES = {
  version: "sportybet-instant-football-two-outcomes-v4",
  maximumSelections: 2,
} as const;
const rankingSchema = z.object({
  rank: z.number().int().positive(),
  fixtureIndex: z.number().int().nonnegative(),
  option: z.enum(["home", "draw", "away"]),
  label: z.string(),
  odds: z.number(),
  reason: z.string(),
});
export const reportSchema = z.object({
  // Older saved reports predate screenshot identification.
  extraction: extractionSchema.partial({ screenshotType: true, identificationEvidence: true }),
  rankings: z.array(rankingSchema),
  excluded: z.array(z.object({ fixtureIndex: z.number().int(), reason: z.string() })),
  limitations: z.array(z.string()),
  rulesVersion: z.string(),
});
export type ScanReport = z.infer<typeof reportSchema>;

export function rankFixtures(extraction: Extraction): ScanReport {
  const candidates: z.infer<typeof rankingSchema>[] = [];
  const excluded: ScanReport["excluded"] = [];
  const rejection = screenshotRejection(extraction);
  extraction.fixtures.forEach((fixture, fixtureIndex) => {
    let reason = "";
    if (rejection) reason = rejection;
    else if (["unrelated", "unreadable"].includes(extraction.quality))
      reason = "Screenshot is not readable game evidence.";
    else if (!fixture.home || !fixture.away || fixture.home === fixture.away)
      reason = "Both distinct participants must be readable.";
    else if (
      !fixture.market ||
      !["three_way_winner", "two_way_winner"].includes(fixture.marketKind)
    )
      reason = "A match-winner market is not clearly identified.";
    else if (fixture.status !== "upcoming")
      reason =
        "Only visibly upcoming fixtures are eligible; live, finished, and unknown states are excluded.";
    else if (fixture.uncertainFields.length)
      reason = "This fixture contains uncertain fields; verify it before using a ranking.";
    else if (
      fixture.homeOdds === null ||
      fixture.awayOdds === null ||
      (fixture.marketKind === "three_way_winner" && fixture.drawOdds === null)
    )
      reason = "Complete winner-market odds are required.";
    else if (fixture.marketKind === "two_way_winner" && fixture.drawOdds !== null)
      reason = "Market type conflicts with a visible draw option.";
    const options = [
      { option: "home" as const, label: fixture.home ?? "Home", odds: fixture.homeOdds },
      ...(fixture.marketKind === "three_way_winner"
        ? [{ option: "draw" as const, label: "Draw", odds: fixture.drawOdds }]
        : []),
      { option: "away" as const, label: fixture.away ?? "Away", odds: fixture.awayOdds },
    ]
      .filter((item): item is typeof item & { odds: number } => item.odds !== null)
      .sort((a, b) => a.odds - b.odds);
    if (reason) {
      excluded.push({ fixtureIndex, reason });
      return;
    }
    const favourite = options[0];
    candidates.push({
      ...favourite,
      rank: 0,
      fixtureIndex,
      reason: `Lowest displayed decimal odds (${favourite.odds}) in this complete winner market. This reflects the displayed market price, not an independently predicted result.`,
    });
  });
  candidates.sort((a, b) => a.odds - b.odds || a.fixtureIndex - b.fixtureIndex);
  const rankings: ScanReport["rankings"] = [];
  const matches = new Set<string>();
  for (const candidate of candidates) {
    const fixture = extraction.fixtures[candidate.fixtureIndex];
    const match = [fixture.home!, fixture.away!]
      .map((team) => team.trim().toLowerCase())
      .sort()
      .join("|");
    if (matches.has(match)) {
      excluded.push({
        fixtureIndex: candidate.fixtureIndex,
        reason: "Duplicate match.",
      });
      continue;
    }
    if (rankings.length === RANKING_RULES.maximumSelections) {
      excluded.push({
        fixtureIndex: candidate.fixtureIndex,
        reason: "Outside the top two lowest-odds match selections.",
      });
      continue;
    }
    matches.add(match);
    rankings.push({ ...candidate, rank: rankings.length + 1 });
  }
  return {
    extraction,
    rankings,
    excluded,
    rulesVersion: RANKING_RULES.version,
    limitations: [
      "Screenshot-only market-favourite rankings, not validated forecasts. Virtual outcomes cannot be reliably predicted from a screenshot.",
      "No independent historical dataset is connected. Visible statistics are transcribed, not treated as verified predictive history.",
      "Rank order compares displayed odds only, which include bookmaker margin and may be stale. No winning probabilities or guarantees are calculated.",
      "AI may misread details. Check participants, market rules, and odds against the original game before acting.",
    ],
  };
}

export const jobSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "processing", "completed", "needs_review", "failed"]),
  result: reportSchema.nullable(),
  error: z.string().nullable(),
  balance: z.number().int().nonnegative().nullable(),
  charged: z.boolean(),
  createdAt: z.string(),
});
export type ScanJob = z.infer<typeof jobSchema>;
export const jobsSchema = z.object({ jobs: z.array(jobSchema) });
export function isTerminal(status: ScanJob["status"]) {
  return status === "completed" || status === "needs_review" || status === "failed";
}
