/**
 * @fileoverview Best-practices report/dashboard suggestion for a client.
 * @module server/services/report-os/canvas/suggestion-service
 *
 * Answers "what reports/dashboards should THIS client be running?" as honest set
 * arithmetic over real signals, never invention:
 *
 *   rank( (eligible by segment + tier) ∩ (relevant to their programs) \ (already run/subscribed) )
 *
 * Every stage traces to an existing source: segment from real regulatory_programs
 * product types (segment.ts), entitlement from the org's tier (entitlement-map),
 * "already used" from report_runs + report_subscriptions, relevance from real
 * program facts (programType / phase / status). Locked-but-relevant types are
 * surfaced as upgrade suggestions with their requiredTier, never as available
 * picks. The pure ranking core (`rankReportSuggestions`) is DB-free + tested.
 *
 * This module SUGGESTS; it originates no metric. It proposes a preset dashboard
 * SPEC (a panel set of governed report types) which, when generated, runs each
 * panel through the governed engine.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { reportRuns, reportSubscriptions, reportTypeRegistry } from '@shared/schema/report-os';
import type { ReportDefinitionSpec, ReportScope } from '@shared/schema/report-os';
import { regulatoryPrograms } from '@shared/schema/programs';
import { deriveOrgSegments, filterTypesForSegment } from '../segment';
import { decideReportEntitlement } from '../entitlement-map';
import { resolveCapabilities } from '../../entitlements/resolver';

export interface CandidateType {
  typeId: string;
  label: string;
  family: string;
  allowedScopes: string[];
  entitled: boolean;
  requiredTier: string;
}

export interface ProgramFact {
  programType: string | null;
  phase: string | null;
  status: string | null;
}

export interface ReportSuggestion {
  typeId: string;
  label: string;
  family: string;
  entitled: boolean;
  requiredTier: string;
  alreadyUsed: boolean;
  score: number;
  reasons: string[];
}

// Program statuses/phases that indicate an active push toward submission.
const ACTIVE_STATUS = new Set(['active', 'in_review', 'submitted']);
const LATE_PHASE = new Set(['authoring', 'review', 'submission', 'post_market']);

// programType → report-family affinity. A program of this type makes reports in
// these families more relevant. Kept modest + explainable.
const PROGRAM_TYPE_FAMILY_AFFINITY: Record<string, string[]> = {
  '510K': ['usa_fda_510k'],
  DE_NOVO: ['usa_fda_510k'],
  PMA: ['usa_fda_pma'],
  IND: ['readiness', 'ema_maa'],
  NDA: ['readiness', 'usa_fda_response', 'ema_maa'],
  BLA: ['readiness', 'usa_fda_response', 'ema_maa'],
  CER: ['etmf'],
};

/**
 * PURE: rank candidate report types into best-practice suggestions.
 * Sort order: entitled before locked, then fresh (not already used) before used,
 * then descending score, then label. Scoring is a small, explainable heuristic
 * over real program facts; every point adds a human-readable reason.
 */
export function rankReportSuggestions(input: {
  types: CandidateType[];
  usedTypeIds: Set<string>;
  subscribedTypeIds: Set<string>;
  programs: ProgramFact[];
}): ReportSuggestion[] {
  const { types, usedTypeIds, subscribedTypeIds, programs } = input;
  const programCount = programs.length;
  const activeCount = programs.filter((p) => p.status && ACTIVE_STATUS.has(p.status)).length;
  const latePhaseCount = programs.filter((p) => p.phase && LATE_PHASE.has(p.phase)).length;
  const programTypes = new Set(programs.map((p) => p.programType).filter(Boolean) as string[]);

  const suggestions = types.map((t): ReportSuggestion => {
    const reasons: string[] = [];
    let score = 1;

    // Family affinity to the org's actual program types.
    for (const pt of programTypes) {
      if ((PROGRAM_TYPE_FAMILY_AFFINITY[pt] ?? []).includes(t.family)) {
        score += 2;
        reasons.push(`You run ${pt} programs, which this report is built for.`);
        break;
      }
    }
    // Readiness / response families are timely when programs are active/late.
    if (['readiness', 'usa_fda_response'].includes(t.family) && (activeCount > 0 || latePhaseCount > 0)) {
      score += 2;
      reasons.push('You have programs in an active submission push.');
    }
    // Portfolio views earn relevance once there's a portfolio to roll up.
    if (t.family === 'portfolio' && programCount >= 2) {
      score += 2;
      reasons.push(`A portfolio view rolls up your ${programCount} programs.`);
    }
    // Predictions are timely for programs approaching a decision.
    if (t.family === 'prediction' && latePhaseCount > 0) {
      score += 1;
      reasons.push('Programs approaching submission benefit from a forecast.');
    }

    const alreadyUsed = usedTypeIds.has(t.typeId) || subscribedTypeIds.has(t.typeId);
    if (subscribedTypeIds.has(t.typeId)) reasons.push('Already on a schedule for you.');
    else if (usedTypeIds.has(t.typeId)) reasons.push('You have run this before.');
    if (!t.entitled) reasons.push(`Requires the ${t.requiredTier} plan.`);
    if (reasons.length === 0) reasons.push('Available for your segment.');

    return {
      typeId: t.typeId,
      label: t.label,
      family: t.family,
      entitled: t.entitled,
      requiredTier: t.requiredTier,
      alreadyUsed,
      score,
      reasons,
    };
  });

  suggestions.sort((a, b) => {
    if (a.entitled !== b.entitled) return a.entitled ? -1 : 1;
    if (a.alreadyUsed !== b.alreadyUsed) return a.alreadyUsed ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
  return suggestions;
}

/**
 * PURE: build a preset dashboard spec from ranked suggestions — the top N
 * entitled, not-yet-used ("missing best-practice") panels, each pinned to the
 * report type's first allowed scope. Falls back to top entitled panels if
 * everything is already used. Returns null when there is nothing entitled.
 */
export function buildPresetSpec(
  suggestions: ReportSuggestion[],
  candidatesByType: Map<string, CandidateType>,
  limit = 4,
): ReportDefinitionSpec | null {
  const entitled = suggestions.filter((s) => s.entitled);
  const preferred = entitled.filter((s) => !s.alreadyUsed);
  const pool = (preferred.length > 0 ? preferred : entitled).slice(0, limit);
  if (pool.length === 0) return null;

  const panels = pool.map((s) => {
    const cand = candidatesByType.get(s.typeId);
    const scope = (cand?.allowedScopes?.[0] as ReportScope) ?? 'program';
    return { reportTypeId: s.typeId, scopeType: scope, label: s.label };
  });
  return { scopeType: (panels[0]?.scopeType ?? 'program') as ReportScope, panels };
}

export interface SuggestReportsResult {
  segments: string[];
  tier: string;
  suggestions: ReportSuggestion[];
  preset: (ReportDefinitionSpec & { title: string }) | null;
}

/**
 * Compute best-practice report suggestions + a preset dashboard spec for an org.
 * Thin DB fetch around the pure ranking core.
 */
export async function suggestReportsForOrg(
  organizationId: number,
  persona?: string | null,
): Promise<SuggestReportsResult> {
  const segments = await deriveOrgSegments(organizationId);
  const caps = await resolveCapabilities(organizationId).catch(() => ({ tier: 'standard' as const }));
  const tier = caps.tier;

  const registryRows = await db
    .select({
      typeId: reportTypeRegistry.typeId,
      label: reportTypeRegistry.label,
      family: reportTypeRegistry.family,
      allowedScopes: reportTypeRegistry.allowedScopes,
      allowedPersonas: reportTypeRegistry.allowedPersonas,
      allowedClientSegments: reportTypeRegistry.allowedClientSegments,
      enabled: reportTypeRegistry.enabled,
    })
    .from(reportTypeRegistry)
    .where(eq(reportTypeRegistry.enabled, true));

  const filtered = filterTypesForSegment(
    registryRows.map((r) => ({
      ...r,
      allowedClientSegments: r.allowedClientSegments ?? [],
      allowedPersonas: r.allowedPersonas ?? [],
    })),
    segments,
    persona ?? undefined,
  );

  const candidates: CandidateType[] = filtered.map((r) => {
    const decision = decideReportEntitlement(r.typeId, r.family, tier);
    return {
      typeId: r.typeId,
      label: r.label,
      family: r.family,
      allowedScopes: (r.allowedScopes ?? []) as string[],
      entitled: decision.entitled,
      requiredTier: decision.requiredTier,
    };
  });
  const candidatesByType = new Map(candidates.map((c) => [c.typeId, c]));

  // Already-used signal: completed runs + enabled subscriptions.
  const [runRows, subRows, programRows] = await Promise.all([
    db
      .select({ typeId: reportRuns.reportTypeId })
      .from(reportRuns)
      .where(and(eq(reportRuns.organizationId, organizationId), eq(reportRuns.status, 'completed'))),
    db
      .select({ typeId: reportSubscriptions.reportTypeId })
      .from(reportSubscriptions)
      .where(and(eq(reportSubscriptions.organizationId, organizationId), eq(reportSubscriptions.enabled, true))),
    db
      .select({
        programType: regulatoryPrograms.programType,
        phase: regulatoryPrograms.phase,
        status: regulatoryPrograms.status,
      })
      .from(regulatoryPrograms)
      .where(eq(regulatoryPrograms.organizationId, organizationId)),
  ]).catch(() => [[], [], []] as [Array<{ typeId: string }>, Array<{ typeId: string }>, ProgramFact[]]);

  const usedTypeIds = new Set(runRows.map((r) => r.typeId));
  const subscribedTypeIds = new Set(subRows.map((r) => r.typeId));

  const suggestions = rankReportSuggestions({
    types: candidates,
    usedTypeIds,
    subscribedTypeIds,
    programs: programRows as ProgramFact[],
  });

  const presetSpec = buildPresetSpec(suggestions, candidatesByType);
  const preset = presetSpec
    ? { ...presetSpec, title: 'Recommended dashboard' }
    : null;

  return { segments, tier, suggestions, preset };
}
