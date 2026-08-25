/**
 * @fileoverview DB-backed portfolio board-pack assembly.
 * @module server/services/report-os/portfolio/fetch
 *
 * The portfolio aggregator (aggregate.ts) is pure. This module is the missing
 * DB seam: given an org + program group, it fetches the member projects,
 * computes each member's readiness via the SAME orchestrator the /runs path
 * uses, maps to ProgramMemberInsight, and calls the pure aggregator +
 * renderer. No new number source — every metric traces to computeInitialRun.
 *
 * The computed-run → member mapping (`toMemberInsight`) is PURE and
 * unit-testable; the fetch itself is a thin, org-scoped query loop.
 */

import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../../../db';
import { projects } from '@shared/schema';
import {
  reportProgramGroups,
  reportProgramGroupProjects,
} from '@shared/schema/report-os';
import { createScopedLogger } from '../../../utils/logger';
import { computeInitialRun, type RunComputationResult } from '../orchestrator';
import { aggregateOrgPortfolio, aggregatePortfolio, renderPortfolioReport } from './aggregate';
import type {
  OrgPortfolioSummary,
  ProgramMemberInsight,
  PortfolioSummary,
  RiskLevel,
} from './types';
import type { RenderedReport } from '../render/types';

const logger = createScopedLogger('report-os-portfolio');

/** Max programs computed for an org-wide rollup in one request (no silent drop:
 *  the summary carries `truncated: true` when the org exceeds this). */
const ORG_ROLLUP_CAP = 100;

/** PURE: risk level from the count of critical blockers on a member. */
export function riskFromBlockers(criticalBlockerCount: number): RiskLevel {
  if (criticalBlockerCount >= 3) return 'critical';
  if (criticalBlockerCount === 2) return 'high';
  if (criticalBlockerCount === 1) return 'medium';
  return 'low';
}

/**
 * PURE: map a computed run for one member project into a ProgramMemberInsight.
 * readinessScore = the run's confidence (0–100); status is derived from
 * confidence + critical blockers so it never claims "ready" with a critical
 * gap open. topBlockers are the (non-critical) blockers surfaced for themes.
 */
export function toMemberInsight(
  projectId: number,
  name: string,
  computed: RunComputationResult,
  extra?: { code?: string | null; indication?: string | null },
): ProgramMemberInsight {
  const criticalBlockerCount = computed.criticalBlockers.length;
  const confidence = Math.max(0, Math.min(100, Math.round(computed.confidence)));
  const status: ProgramMemberInsight['status'] =
    criticalBlockerCount > 0 ? 'missing'
    : confidence >= 70 ? 'ready'
    : confidence > 0 ? 'partial'
    : 'missing';
  return {
    projectId,
    name,
    code: extra?.code ?? null,
    indication: extra?.indication ?? null,
    readinessScore: confidence,
    confidence,
    status,
    criticalBlockerCount,
    riskLevel: riskFromBlockers(criticalBlockerCount),
    topBlockers: computed.blockers.slice(0, 3),
  };
}

/** The member projects of a program group, org-scoped. */
async function fetchGroupMembers(
  organizationId: number,
  programGroupId: number,
): Promise<Array<{ projectId: number; name: string }>> {
  const rows = await db
    .select({ projectId: reportProgramGroupProjects.projectId, name: projects.name })
    .from(reportProgramGroupProjects)
    .innerJoin(
      reportProgramGroups,
      eq(reportProgramGroups.id, reportProgramGroupProjects.programGroupId),
    )
    .leftJoin(projects, eq(projects.id, reportProgramGroupProjects.projectId))
    .where(
      and(
        eq(reportProgramGroupProjects.programGroupId, programGroupId),
        eq(reportProgramGroups.organizationId, organizationId),
      ),
    );
  return rows.map((r) => ({ projectId: r.projectId, name: r.name ?? `Project ${r.projectId}` }));
}

/**
 * Assemble the portfolio summary for a program group. Computes each member's
 * readiness via the orchestrator (org-scoped), then aggregates. Returns null
 * when the group has no members in this org (honest empty, not a fake zero).
 */
export async function fetchPortfolioSummary(
  organizationId: number,
  programGroupId: number,
): Promise<PortfolioSummary | null> {
  const members = await fetchGroupMembers(organizationId, programGroupId);
  if (members.length === 0) return null;

  const insights: ProgramMemberInsight[] = [];
  for (const m of members) {
    const computed = await computeInitialRun(organizationId, 'project', String(m.projectId));
    insights.push(toMemberInsight(m.projectId, m.name, computed));
  }
  return aggregatePortfolio(programGroupId, insights);
}

/** Top-level programs (roots of the project hierarchy) for an org, capped. */
async function fetchOrgPrograms(
  organizationId: number,
): Promise<{ rows: Array<{ projectId: number; name: string; code: string | null; indication: string | null }>; truncated: boolean }> {
  const rows = await db
    .select({
      projectId: projects.id,
      name: projects.name,
      code: projects.code,
      indication: projects.therapeuticArea,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        // Top-level programs only — a program's studies/sub-projects roll up
        // under it, so counting them too would double-count the portfolio.
        isNull(projects.parentProjectId),
        ne(projects.status, 'archived'),
      ),
    )
    .limit(ORG_ROLLUP_CAP + 1);

  const truncated = rows.length > ORG_ROLLUP_CAP;
  if (truncated) {
    logger.warn('org portfolio rollup truncated at cap', { organizationId, cap: ORG_ROLLUP_CAP });
  }
  return {
    rows: rows.slice(0, ORG_ROLLUP_CAP).map((r) => ({
      projectId: r.projectId,
      name: r.name ?? `Project ${r.projectId}`,
      code: r.code ?? null,
      indication: r.indication ?? null,
    })),
    truncated,
  };
}

/**
 * Assemble the ORG-WIDE portfolio rollup: every top-level program in the org,
 * each scored via the SAME orchestrator the /runs path uses, then aggregated.
 * Returns the raw flat {@link OrgPortfolioSummary} (not a rendered document) so
 * the caller gets a directly-consumable program list. Returns null when the org
 * has no programs (honest empty, not a fake zero).
 */
export async function fetchOrgPortfolioSummary(
  organizationId: number,
): Promise<OrgPortfolioSummary | null> {
  const { rows, truncated } = await fetchOrgPrograms(organizationId);
  if (rows.length === 0) return null;

  /* ── Readiness runs are independent, so they are not serialized ───────────
     MDX UAT 2026-08-18, item A9: Reporting & analytics showed "Loading the
     reporting canvas…" for 5+ seconds before resolving to a static empty
     state. This loop is why. It was a sequential `await` per program, and
     `computeInitialRun` is a full governed readiness computation — several
     queries each — so page latency was ORG_ROLLUP_CAP (100) runs deep in the
     worst case, one after another, on a single request.

     The runs share no state and none reads another's output, so the ordering
     bought nothing. Bounded rather than unbounded because they all draw from
     the same pg pool (max 20 in dev, 40 in production, server/db/runtime.ts):
     firing 100 at once would starve every other request on the process, which
     trades one slow surface for a slow application. Eight keeps a comfortable
     margin under the dev pool while cutting the depth by an order of magnitude.

     Results are written back BY INDEX, so `insights` stays in the query's
     order regardless of which run finishes first — `aggregateOrgPortfolio` and
     the flagship pick below both read this array, and a nondeterministic order
     would make the reported flagship depend on which compute happened to be
     quickest. */
  const CONCURRENCY = 8;
  const insights: ProgramMemberInsight[] = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      for (let i = next++; i < rows.length; i = next++) {
        const r = rows[i];
        const computed = await computeInitialRun(organizationId, 'project', String(r.projectId));
        insights[i] = toMemberInsight(r.projectId, r.name, computed, {
          code: r.code,
          indication: r.indication,
        });
      }
    }),
  );
  return aggregateOrgPortfolio(organizationId, insights, truncated);
}

/** Assemble + render the board-pack report for a program group. */
export async function fetchPortfolioReport(
  organizationId: number,
  programGroupId: number,
  meta: { reportTypeId: string; reportTypeLabel: string; generatedAt?: string },
): Promise<RenderedReport | null> {
  const summary = await fetchPortfolioSummary(organizationId, programGroupId);
  if (!summary) return null;
  return renderPortfolioReport(summary, {
    reportTypeId: meta.reportTypeId,
    reportTypeLabel: meta.reportTypeLabel,
    scopeId: String(programGroupId),
    generatedAt: meta.generatedAt,
  });
}
