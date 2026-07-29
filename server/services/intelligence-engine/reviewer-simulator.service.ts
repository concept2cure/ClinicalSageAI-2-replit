/**
 * Reviewer Simulator Service
 *
 * Runs the persona-blind `reviewer-question-engine` AND each in-scope
 * persona's rules, merges their questions, deduplicates, and persists the
 * run as an audit-grade artifact in `reviewer_simulation_runs`.
 *
 * Deterministic: given the same program facts, packet facts, and intel
 * reports, the same questions are produced. An `inputsHash` is computed so
 * a replay flow can verify determinism.
 */

import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { reviewerSimulationRuns } from '../../../shared/schema/reviewer-simulation';
import {
  ALL_PERSONA_CODES,
  REVIEWER_PERSONAS,
  type PersonaInputs,
  type PersonaIntelFacts,
  type PersonaPacketFacts,
  type PersonaProgramFacts,
} from './reviewer-personas';
import type {
  ReviewerPersonaCode,
  ReviewerQuestion,
  ClaimEvidenceReport,
  ConsistencyReport,
  DefensibilityScore,
} from './types';
import { generateReviewerQuestions } from './reviewer-question-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulatorRequest {
  organizationId: number;
  programId: string;
  program: PersonaProgramFacts;
  packet?: PersonaPacketFacts | null;
  intel: PersonaIntelFacts;
  // Optional intelligence reports — when provided, the persona-blind engine
  // runs too. When omitted, only persona rules fire.
  reports?: {
    claimEvidence?: ClaimEvidenceReport;
    consistency?: ConsistencyReport;
    defensibility?: DefensibilityScore;
  };
  // Restrict to a subset of personas (default: all in-scope).
  personas?: ReviewerPersonaCode[];
  trigger?: string; // manual | post_packet_render | scheduled | api
  triggeredBy?: string; // user id or 'system'
  defensePacketId?: string;
  /** If true, do not insert a row; just return the result. */
  dryRun?: boolean;
  // ── Module 4 (preclinical) wiring ──────────────────────────────────────────
  // The reviewer simulator's `programId` is a regulatory_programs uuid. The
  // nonclinical study rows live under `ctd_programs.id` (integer). Callers
  // pass that integer here when they want the preclinical persona to receive
  // loaded intel from `ctd_nonclinical_studies`. No-op when
  // PRECLINICAL_REVIEWER_ENABLED is unset; in that case the persona still
  // runs and emits its info-level "data not loaded" stub.
  ctdProgramId?: number;
}

export interface SimulatorResult {
  runId: string | null;
  programId: string;
  questions: ReviewerQuestion[];
  questionCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  perPersonaCounts: Record<string, number>;
  personaScope: ReviewerPersonaCode[];
  inputsHash: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic input hash
// ─────────────────────────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function computeInputsHash(
  req: SimulatorRequest,
  scope: ReviewerPersonaCode[],
  resolvedIntel: PersonaIntelFacts,
): string {
  const payload = {
    program: req.program,
    packet: req.packet ?? null,
    intel: resolvedIntel,
    personaScope: [...scope].sort(),
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedup + sort
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<ReviewerQuestion['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function dedupeAndSort(questions: ReviewerQuestion[]): ReviewerQuestion[] {
  const seen = new Set<string>();
  const out: ReviewerQuestion[] = [];
  for (const q of questions) {
    // Dedup key: persona|category|first 80 chars of question, lowercased
    const key = `${q.persona ?? '__none__'}|${q.category}|${q.question
      .slice(0, 80)
      .toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  out.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return (a.persona ?? '').localeCompare(b.persona ?? '');
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Run the full reviewer simulation and (optionally) persist the result. */
export async function runReviewerSimulation(
  req: SimulatorRequest
): Promise<SimulatorResult> {
  // 1. Determine in-scope personas
  const requested =
    req.personas && req.personas.length ? req.personas : ALL_PERSONA_CODES;
  const scope = requested.filter(code =>
    REVIEWER_PERSONAS[code].appliesTo(req.program)
  );

  // 2. Run persona-blind engine if reports were provided
  const baseQuestions: ReviewerQuestion[] = [];
  if (req.reports?.claimEvidence && req.reports.consistency && req.reports.defensibility) {
    baseQuestions.push(
      ...generateReviewerQuestions(
        req.reports.claimEvidence,
        req.reports.consistency,
        req.reports.defensibility
      )
    );
  }

  // 3. Resolve preclinical intel if the caller asked for it and the flag is on.
  // Dynamic import keeps the simulator decoupled from the preclinical surface
  // when it isn't wired up.
  let intel: PersonaIntelFacts = req.intel;
  if (req.ctdProgramId !== undefined && !intel.nonclinical) {
    try {
      const { loadPreclinicalIntel } = await import(
        '../preclinical/preclinical-intel-loader'
      );
      const nc = await loadPreclinicalIntel(req.ctdProgramId, req.organizationId, {
        mrhdMgPerKgPerDay: req.program.mrhdMgPerKgPerDay ?? null,
      });
      if (nc) {
        intel = { ...intel, nonclinical: nc };
      }
    } catch {
      // Loader is best-effort; persona will emit its info-stub.
    }
  }

  // 4. Run each in-scope persona
  const inputs: PersonaInputs = {
    program: req.program,
    packet: req.packet ?? null,
    intel,
  };
  const personaQuestions: ReviewerQuestion[] = [];
  const perPersonaCounts: Record<string, number> = {};
  for (const code of scope) {
    const out = REVIEWER_PERSONAS[code].rules(inputs);
    perPersonaCounts[code] = out.length;
    personaQuestions.push(...out);
  }

  // 4. Merge, dedupe, sort
  const questions = dedupeAndSort([...baseQuestions, ...personaQuestions]);

  // 5. Counts
  const criticalCount = questions.filter(q => q.severity === 'critical').length;
  const warningCount = questions.filter(q => q.severity === 'warning').length;
  const infoCount = questions.filter(q => q.severity === 'info').length;

  // 6. Hash — over the resolved intel so loaded nonclinical data is captured.
  const inputsHash = computeInputsHash(req, scope, intel);

  // 7. Persist (unless dryRun)
  let runId: string | null = null;
  if (!req.dryRun) {
    const [row] = await db
      .insert(reviewerSimulationRuns)
      .values({
        organizationId: req.organizationId,
        programId: req.programId,
        triggeredBy: req.triggeredBy ?? 'system',
        trigger: req.trigger ?? 'manual',
        personaScope: scope,
        inputsHash,
        questions,
        questionCount: questions.length,
        criticalCount,
        warningCount,
        infoCount,
        perPersonaCounts,
        defensePacketId: req.defensePacketId ?? null,
        summary: {
          baseQuestionCount: baseQuestions.length,
          personaQuestionCount: personaQuestions.length,
        },
      })
      .returning({ id: reviewerSimulationRuns.id });
    runId = row?.id ?? null;
  }

  return {
    runId,
    programId: req.programId,
    questions,
    questionCount: questions.length,
    criticalCount,
    warningCount,
    infoCount,
    perPersonaCounts,
    personaScope: scope,
    inputsHash,
  };
}

/** List recent simulation runs for a program. */
export async function listProgramSimulations(
  organizationId: number,
  programId: string,
  limit = 50
) {
  return db
    .select()
    .from(reviewerSimulationRuns)
    .where(
      and(
        eq(reviewerSimulationRuns.organizationId, organizationId),
        eq(reviewerSimulationRuns.programId, programId)
      )
    )
    .orderBy(desc(reviewerSimulationRuns.createdAt))
    .limit(limit);
}

/** Fetch a single simulation run. */
export async function getSimulationRun(organizationId: number, runId: string) {
  const [row] = await db
    .select()
    .from(reviewerSimulationRuns)
    .where(
      and(
        eq(reviewerSimulationRuns.id, runId),
        eq(reviewerSimulationRuns.organizationId, organizationId)
      )
    )
    .limit(1);
  return row ?? null;
}
