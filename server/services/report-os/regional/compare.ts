/**
 * Cross-region / harmonization comparison engine for Report-OS global-markets reports.
 *
 * Pure logic: compares one program's submission readiness across multiple global
 * markets and computes harmonization gaps (artifacts present in some markets but
 * missing in others). No DB/IO — inputs are normalized.
 *
 * ── UNREACHABLE, AND NOT A GAP TO CLOSE (read before wiring it) ─────────────
 * Nothing calls `compareRegions` or `renderRegionComparison` outside their own
 * test, and `MarketReadiness` — a per-market `readinessScore`, `presentArtifacts`
 * and `missingArtifacts` for ONE program across SEVERAL markets — is produced by
 * nothing in this repository. That is not an oversight waiting for a provider.
 *
 * A market assessment is of the filing a program is RECORDED for, and a program
 * records one (`projects.metadata.registryId`). The `regional` engine
 * (`filing-readiness.ts`, 2026-10-12) therefore REFUSES to assess a program
 * against a market it is not filing in — that refusal is the whole point of it,
 * because a report titled for one market computed from another program's filing
 * is the QA 2026-10-08 (j8) defect: "a report claiming an analysis nothing
 * performed". Supplying this module's inputs means inventing a readiness score
 * per market for filings that do not exist.
 *
 * So this is not a parallel implementation of the `regional` engine to migrate
 * onto it (CLAUDE.md, zero duplication) — the two answer different questions,
 * and only one of them has an answer. Nor is it dead code to sweep: under the
 * working agreement, deleting a capability needs the reachable replacement named
 * by path, and there is none, which makes removing it a product decision rather
 * than a cleanup. It stays, unwired, with this note — the same lesson as the five
 * deleted-and-rebuilt editor generations.
 *
 * What a harmonization view CAN honestly carry per market is the `MarketSupport`
 * statement (`services/regulatory/market-support.ts`): per market and
 * independent of any program's filing. That is market support, not program
 * readiness, and it is not this module's shape.
 *
 * @module server/services/report-os/regional/compare
 */

import type { RenderedReport, ReportSection, ReportBlock } from '../render/types';
import type { MarketReadiness, HarmonizationGap, RegionComparison } from './types';

/**
 * Compare submission readiness across markets and derive harmonization gaps.
 *
 * - leadMarket: market with the highest readinessScore (null when empty; ties resolve
 *   to the first market by input order).
 * - laggingMarkets: markets with a readinessScore strictly below the mean, by name.
 * - harmonizationGaps: for the union of all artifacts (present ∪ missing) across markets,
 *   an entry whenever the artifact is missing in at least one market AND present in at
 *   least one market. Artifacts present everywhere or absent everywhere are skipped.
 * - reusableArtifacts: artifacts present in EVERY market — author once, reuse across regions.
 */
export function compareRegions(scopeId: string, markets: MarketReadiness[]): RegionComparison {
  if (markets.length === 0) {
    return {
      scopeId,
      markets,
      harmonizationGaps: [],
      leadMarket: null,
      laggingMarkets: [],
      reusableArtifacts: [],
    };
  }

  // Lead market: highest readinessScore, ties → first by input order.
  let leadMarket = markets[0];
  for (const m of markets) {
    if (m.readinessScore > leadMarket.readinessScore) {
      leadMarket = m;
    }
  }

  // Lagging markets: strictly below the mean readinessScore.
  const mean = markets.reduce((sum, m) => sum + m.readinessScore, 0) / markets.length;
  const laggingMarkets = markets
    .filter(m => m.readinessScore < mean)
    .map(m => m.market);

  // Union of all artifacts, preserving first-seen order.
  const artifactOrder: string[] = [];
  const seen = new Set<string>();
  for (const m of markets) {
    for (const a of [...m.presentArtifacts, ...m.missingArtifacts]) {
      if (!seen.has(a)) {
        seen.add(a);
        artifactOrder.push(a);
      }
    }
  }

  const harmonizationGaps: HarmonizationGap[] = [];
  const reusableArtifacts: string[] = [];

  for (const artifact of artifactOrder) {
    const presentInMarkets: string[] = [];
    const missingInMarkets: string[] = [];
    for (const m of markets) {
      if (m.presentArtifacts.includes(artifact)) {
        presentInMarkets.push(m.market);
      } else {
        missingInMarkets.push(m.market);
      }
    }

    // Present in every market → a reuse win.
    if (missingInMarkets.length === 0 && presentInMarkets.length > 0) {
      reusableArtifacts.push(artifact);
    }

    // Mixed presence → a harmonization gap.
    if (presentInMarkets.length > 0 && missingInMarkets.length > 0) {
      harmonizationGaps.push({ artifact, presentInMarkets, missingInMarkets });
    }
  }

  return {
    scopeId,
    markets,
    harmonizationGaps,
    leadMarket: leadMarket.market,
    laggingMarkets,
    reusableArtifacts,
  };
}

/**
 * Render a {@link RegionComparison} into the render-target-agnostic report document model.
 */
export function renderRegionComparison(
  cmp: RegionComparison,
  meta: { reportTypeId: string; reportTypeLabel: string; generatedAt?: string },
): RenderedReport {
  const sections: ReportSection[] = [];

  // (1) Market readiness table.
  sections.push({
    id: 'market-readiness',
    title: 'Market readiness',
    blocks: [
      {
        kind: 'table',
        columns: ['Market', 'Dossier standard', 'Readiness', 'Status'],
        rows: cmp.markets.map(m => [m.market, m.dossierStandard, m.readinessScore, m.status]),
      },
    ],
  });

  // (2) Harmonization gaps.
  const gapBlocks: ReportBlock[] =
    cmp.harmonizationGaps.length > 0
      ? [
          {
            kind: 'gap-list',
            items: cmp.harmonizationGaps.map(g => ({
              title: `${g.artifact}: missing in ${g.missingInMarkets.join(', ')}`,
            })),
          },
        ]
      : [
          {
            kind: 'summary',
            text: 'No harmonization gaps — artifact coverage is consistent across selected markets.',
          },
        ];
  sections.push({ id: 'harmonization-gaps', title: 'Harmonization gaps', blocks: gapBlocks });

  // (3) Reuse opportunities.
  const reuseText =
    cmp.reusableArtifacts.length > 0
      ? `Reusable artifacts (author once, reuse across regions): ${cmp.reusableArtifacts.join(', ')}.`
      : 'No artifacts are present across every selected market yet — no reuse opportunities identified.';
  sections.push({
    id: 'reuse-opportunities',
    title: 'Reuse opportunities',
    blocks: [{ kind: 'summary', text: reuseText }],
  });

  // (4) Lead / lagging summary.
  const leadText = cmp.leadMarket
    ? `Lead market: ${cmp.leadMarket}.`
    : 'No lead market — no markets selected.';
  const laggingText =
    cmp.laggingMarkets.length > 0
      ? ` Lagging markets: ${cmp.laggingMarkets.join(', ')}.`
      : ' No lagging markets below the mean readiness.';
  sections.push({
    id: 'lead-summary',
    title: 'Lead and lagging markets',
    blocks: [{ kind: 'summary', text: `${leadText}${laggingText}` }],
  });

  return {
    reportTypeId: meta.reportTypeId,
    scopeType: 'program',
    scopeId: cmp.scopeId,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    status: 'partial',
    sections,
  };
}
