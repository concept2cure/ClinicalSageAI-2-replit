/**
 * Reviewer Simulator Service
 *
 * Runs each in-scope persona's rules over the program's facts, deduplicates,
 * and persists the run in `reviewer_simulation_runs`.
 *
 * Where the facts come from:
 *   - program classification and flags (they scope the personas): as the
 *     caller states them;
 *   - packet: the defense packet on record that `defensePacketId` names;
 *   - intel: the program's records — nonclinical studies via `ctdProgramId`.
 *     No record holds claim-health or defensibility figures.
 * 2026-10-15: packet, intel and reports were used as the caller gave them (via
 * AnA, the model supplied the figures the questions print). They are now set
 * aside, each fact group that was not available becomes an explicit info
 * question, and `inputsSource` is returned and persisted with the run.
 *
 * Deterministic: given the same program facts and the same records, the same
 * questions are produced. An `inputsHash` is computed so a replay flow can
 * verify determinism.
 */

import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { reviewerSimulationRuns } from '../../../shared/schema/reviewer-simulation';
import { defensePackets } from '../../../shared/schema/defense-packets';
import {
  ALL_PERSONA_CODES,
  REVIEWER_PERSONAS,
  type NonclinicalIntelFacts,
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
import { stableStringify } from '../../../shared/canonical-json.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulatorRequest {
  organizationId: number;
  programId: string;
  program: PersonaProgramFacts;
  /**
   * Set aside, never used: packet facts are read from the defense packet on
   * record that `defensePacketId` names. Accepted so a caller that sends it is
   * told so (`inputsSource.setAside`).
   */
  packet?: PersonaPacketFacts | null;
  /** Set aside, never used: intel is read from the program's records. */
  intel?: PersonaIntelFacts;
  /**
   * Set aside, never used: no record holds intelligence reports for a program.
   * The persona-blind questions for a document are computed server-side by
   * POST /api/concept2cure/intelligence/analyze.
   */
  reports?: {
    claimEvidence?: ClaimEvidenceReport;
    consistency?: ConsistencyReport;
    defensibility?: DefensibilityScore;
  };
  // Restrict to a subset of personas (default: all in-scope).
  personas?: ReviewerPersonaCode[];
  trigger?: string; // manual | post_packet_render | scheduled | api
  triggeredBy?: string; // user id or 'system'
  /** The program's defense packet whose recorded facts the packet checks read. */
  defensePacketId?: string;
  /** If true, do not insert a row; just return the result. */
  dryRun?: boolean;
  // ── Module 4 (preclinical) wiring ──────────────────────────────────────────
  // The reviewer simulator's `programId` is a regulatory_programs uuid. The
  // nonclinical study rows live under `ctd_programs.id` (integer). Callers
  // pass that integer here when they want the preclinical persona to receive
  // loaded intel from `ctd_nonclinical_studies`. No-op when
  // PRECLINICAL_REVIEWER_ENABLED is unset; in that case the persona still
  // runs and emits its info-level "data not loaded" stub. A failed read is an
  // error (2026-10-15: it was swallowed and reported as "not loaded").
  ctdProgramId?: number;
}

/** Where each group of facts the run reasoned over came from. Persisted with the run. */
export interface SimulatorInputsSource {
  /** Program classification and flags, which scope the personas: as the caller stated them. */
  program: 'caller_stated';
  /** The defense packet on record that defensePacketId names, or none named. */
  packet: 'defense_packets' | 'not_available';
  defensePacketId: string | null;
  /** That packet's recorded lifecycle status (e.g. 'STALE'). */
  defensePacketStatus: string | null;
  /** Unsupported-claim, contradiction and defensibility figures: no record holds them. */
  claimHealth: 'not_available';
  /** The program's ctd_nonclinical_studies via the preclinical loader, or not loaded. */
  nonclinical: 'ctd_nonclinical_studies' | 'not_available';
  /** Fact groups the caller supplied that this run did not use. */
  setAside: Array<'packet' | 'intel' | 'reports'>;
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
  inputsSource: SimulatorInputsSource;
}

/** A request naming something the program's records do not hold. */
export class ReviewerSimulationInputError extends Error {
  constructor(
    public code: 'INVALID_DEFENSE_PACKET_ID' | 'DEFENSE_PACKET_NOT_FOUND' | 'DEFENSE_PACKET_STORE_NOT_AVAILABLE',
    message: string
  ) {
    super(message);
    this.name = 'ReviewerSimulationInputError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Facts the records hold
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Undefined table / column: the packet store this model reads is not on the database. */
function isMissingPacketStore(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  // drizzle wraps the driver's error; its SQLSTATE is on `cause`.
  const code = e?.code ?? e?.cause?.code;
  return code === '42P01' || code === '42703';
}

/** The packet facts of the program's defense packet on record; refuses one it does not hold. */
async function loadRecordedPacket(
  organizationId: number,
  programId: string,
  defensePacketId: string
): Promise<{ facts: PersonaPacketFacts; status: string }> {
  if (!UUID_RE.test(defensePacketId)) {
    throw new ReviewerSimulationInputError(
      'INVALID_DEFENSE_PACKET_ID',
      `defensePacketId "${defensePacketId}" is not a defense packet id.`
    );
  }
  // 2026-10-15: on a deployed database the read failed (no migration creates the
  // table this model reads — only predicate.defense_packets, without
  // organization_id — and nothing writes packets), and the run answered 500.
  const [row] = await db
    .select({
      defenseReadinessScore: defensePackets.defenseReadinessScore,
      topRisks: defensePackets.topRisks,
      riskCodesUsed: defensePackets.riskCodesUsed,
      predicateKNumber: defensePackets.predicateKNumber,
      status: defensePackets.status,
    })
    .from(defensePackets)
    .where(
      and(
        eq(defensePackets.id, defensePacketId),
        eq(defensePackets.organizationId, organizationId),
        eq(defensePackets.programId, programId)
      )
    )
    .limit(1)
    .catch((err: unknown) => {
      if (!isMissingPacketStore(err)) throw err;
      throw new ReviewerSimulationInputError(
        'DEFENSE_PACKET_STORE_NOT_AVAILABLE',
        `No defense packet store exists on this database, so defense packet ${defensePacketId} cannot be read. ` +
          'Run the simulation without defensePacketId; the packet checks are then reported as not run.'
      );
    });
  if (!row) {
    throw new ReviewerSimulationInputError(
      'DEFENSE_PACKET_NOT_FOUND',
      `Defense packet ${defensePacketId} is not on record for this program.`
    );
  }
  return {
    facts: {
      defenseReadinessScore: row.defenseReadinessScore,
      // NOT NULL DEFAULT '[]' in the table's DDL; the model types them nullable.
      topRisks: row.topRisks ?? [],
      riskCodesUsed: row.riskCodesUsed ?? [],
      predicateKNumber: row.predicateKNumber,
    },
    status: row.status,
  };
}

/**
 * The program's nonclinical studies on record, when the caller names its CTD
 * program and the flag is on. Dynamic import keeps the simulator decoupled from
 * the preclinical surface when it isn't wired up. 2026-10-15: caller-attached
 * nonclinical facts were used as given, and a failed read was swallowed and
 * reported by the persona as "not loaded"; it now propagates.
 */
async function loadRecordedNonclinical(req: SimulatorRequest): Promise<NonclinicalIntelFacts | undefined> {
  if (req.ctdProgramId === undefined) return undefined;
  const { loadPreclinicalIntel } = await import('../preclinical/preclinical-intel-loader');
  return loadPreclinicalIntel(req.ctdProgramId, req.organizationId, {
    mrhdMgPerKgPerDay: req.program.mrhdMgPerKgPerDay ?? null,
  });
}

/** Where each fact group came from, and which groups the caller sent that were set aside. */
function describeInputsSource(
  req: SimulatorRequest,
  recordedPacket: { status: string } | null,
  nonclinical: NonclinicalIntelFacts | undefined
): SimulatorInputsSource {
  const setAside: SimulatorInputsSource['setAside'] = [];
  if (req.packet != null) setAside.push('packet');
  if (req.intel != null) setAside.push('intel');
  if (req.reports != null) setAside.push('reports');
  return {
    program: 'caller_stated',
    packet: recordedPacket ? 'defense_packets' : 'not_available',
    defensePacketId: recordedPacket ? (req.defensePacketId ?? null) : null,
    defensePacketStatus: recordedPacket?.status ?? null,
    claimHealth: 'not_available',
    nonclinical: nonclinical ? 'ctd_nonclinical_studies' : 'not_available',
    setAside,
  };
}

/**
 * Stated when a fact group was not available, so the checks that read it are
 * seen not to have run: a check that raised nothing is not a check that passed.
 */
const PACKET_NOT_AVAILABLE: ReviewerQuestion = {
  category: 'completeness',
  severity: 'info',
  question:
    'No defense packet was named for this run, so the checks that read one (its defense readiness ' +
    'score and its risk codes) did not run. That they raised no question is not a finding that they pass.',
  trigger: 'packet_facts_not_available',
  recommendedFix: "Run the simulation with defensePacketId naming the program's defense packet.",
};

const CLAIM_HEALTH_NOT_ASSESSED: ReviewerQuestion = {
  category: 'completeness',
  severity: 'info',
  question:
    "The program's records hold no unsupported-claim, contradiction or defensibility figures, so the " +
    'checks that read them did not run. That they raised no question is not a finding that they pass.',
  trigger: 'claim_health_not_assessed',
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic input hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Digest of the simulation payload. Computed per call and returned, never
 * compared against a stored value — free to re-point
 * (docs/CANONICALIZATION_MIGRATION_2026-08.md).
 */

function computeInputsHash(
  program: PersonaProgramFacts,
  packet: PersonaPacketFacts | null,
  nonclinical: NonclinicalIntelFacts | null,
  scope: ReviewerPersonaCode[],
): string {
  const payload = {
    program,
    packet,
    intel: { nonclinical },
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

  // 2. Packet facts from the defense packet on record, never from the request.
  // 2026-10-15: the caller's packet was used as given while the named
  // defensePacketId was stored as the packet that "fed the inputs".
  const recordedPacket = req.defensePacketId
    ? await loadRecordedPacket(req.organizationId, req.programId, req.defensePacketId)
    : null;
  const packet = recordedPacket?.facts ?? null;

  // 3. Nonclinical facts from the program's studies on record.
  const nonclinical = await loadRecordedNonclinical(req);

  // No record holds claim-health or defensibility figures. The personas' rules
  // on them fire on `> 0` / a score, so they get 0 / null and stay silent;
  // CLAIM_HEALTH_NOT_ASSESSED says the checks did not run. These placeholders
  // are never printed, persisted or hashed.
  const intel: PersonaIntelFacts = {
    contradictionCount: 0,
    orphanClaimCount: 0,
    unsupportedClaimCount: 0,
    defensibilityScore: null,
    missingSections: [],
    ...(nonclinical ? { nonclinical } : {}),
  };

  // 4. Run each in-scope persona
  const inputs: PersonaInputs = { program: req.program, packet, intel };
  const personaQuestions: ReviewerQuestion[] = [];
  const perPersonaCounts: Record<string, number> = {};
  for (const code of scope) {
    const out = REVIEWER_PERSONAS[code].rules(inputs);
    perPersonaCounts[code] = out.length;
    personaQuestions.push(...out);
  }

  // 5. Say what could not be assessed, then merge, dedupe, sort
  const notAssessed: ReviewerQuestion[] = [
    ...(packet ? [] : [{ ...PACKET_NOT_AVAILABLE }]),
    { ...CLAIM_HEALTH_NOT_ASSESSED },
  ];
  const questions = dedupeAndSort([...personaQuestions, ...notAssessed]);
  const inputsSource = describeInputsSource(req, recordedPacket, nonclinical);

  // 6. Counts
  const criticalCount = questions.filter(q => q.severity === 'critical').length;
  const warningCount = questions.filter(q => q.severity === 'warning').length;
  const infoCount = questions.filter(q => q.severity === 'info').length;

  // 7. Hash — over the facts the personas read, loaded nonclinical data included.
  const inputsHash = computeInputsHash(req.program, packet, nonclinical ?? null, scope);

  // 8. Persist (unless dryRun)
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
        defensePacketId: inputsSource.defensePacketId,
        summary: {
          personaQuestionCount: personaQuestions.length,
          notAssessedQuestionCount: notAssessed.length,
          inputsSource,
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
    inputsSource,
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
