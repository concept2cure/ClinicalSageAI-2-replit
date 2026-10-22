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
import type { RequestSqlClient } from '../../db/requestDb';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from '../authoring/authoring-program-access';
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
    public code: 'INVALID_DEFENSE_PACKET_ID' | 'DEFENSE_PACKET_NOT_FOUND' | 'DEFENSE_PACKET_STORE_NOT_AVAILABLE' | 'DEFENSE_PACKET_ACCESS_DENIED' | 'DEFENSE_PACKET_ACCESS_UNAVAILABLE' | 'REVIEWER_PROGRAM_ACCESS_DENIED' | 'REVIEWER_PROGRAM_ACCESS_UNAVAILABLE',
    message: string,
    readonly statusCode = 422
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

/** Verified producer context, never constructed from model or request body fields. */
export interface SimulatorRecordScope {
  executor: RequestSqlClient;
  userId: number;
}

interface RecordedPacket {
  defenseReadinessScore: number;
  topRisks: string[];
  riskCodesUsed: string[];
  predicateKNumber: string;
  status: string;
}

/** Fresh admission on the producer's actual connection; no model-supplied actor. */
async function admitProgramRecords(req: SimulatorRequest, scope: SimulatorRecordScope | undefined, forWrite: boolean): Promise<SimulatorRecordScope> {
  const unavailable = req.defensePacketId ? 'DEFENSE_PACKET_ACCESS_UNAVAILABLE' : 'REVIEWER_PROGRAM_ACCESS_UNAVAILABLE';
  const denied = req.defensePacketId ? 'DEFENSE_PACKET_ACCESS_DENIED' : 'REVIEWER_PROGRAM_ACCESS_DENIED';
  if (!scope?.executor || typeof scope.executor.query !== 'function') {
    throw new ReviewerSimulationInputError(unavailable, 'The verified record connection is unavailable. No program records were read or written.', 503);
  }
  if (!Number.isSafeInteger(scope.userId) || scope.userId <= 0) {
    throw new ReviewerSimulationInputError(denied, 'A verified current organization member is required to access program records.', 403);
  }
  try {
    await authorizeAuthoringProgram(scope.executor, {
      tenantId: req.organizationId, actor: { id: String(scope.userId), email: '' }, programId: req.programId, forWrite,
    });
  } catch (error) {
    if (!(error instanceof AuthoringProgramAccessError)) throw error;
    throw new ReviewerSimulationInputError(error.status === 503 ? unavailable : denied,
      'Current access to the program could not be established. No simulation was saved.', error.status === 503 ? 503 : 403);
  }
  return scope;
}

/** Exact canonical packet and live tenant parent, after current private-project admission. */
async function loadRecordedPacket(
  organizationId: number,
  programId: string,
  defensePacketId: string,
  scope: SimulatorRecordScope,
): Promise<{ facts: PersonaPacketFacts; status: string }> {
  if (!UUID_RE.test(defensePacketId)) {
    throw new ReviewerSimulationInputError('INVALID_DEFENSE_PACKET_ID', 'defensePacketId is not a defense packet UUID.');
  }
  const { rows } = await scope.executor.query(
    `SELECT dp.defense_readiness_score AS "defenseReadinessScore", dp.top_risks AS "topRisks",
       dp.risk_codes_used AS "riskCodesUsed", dp.predicate_k_number AS "predicateKNumber", dp.status
     FROM predicate.defense_packets dp
     JOIN regulatory_programs rp ON rp.id = dp.program_id
     WHERE dp.id = $1::uuid AND dp.program_id = $2::uuid
       AND rp.organization_id = $3 AND rp.deleted_at IS NULL
     LIMIT 1`,
    [defensePacketId, programId, organizationId],
  ).catch((error: unknown) => {
    if (!isMissingPacketStore(error)) throw error;
    throw new ReviewerSimulationInputError('DEFENSE_PACKET_STORE_NOT_AVAILABLE',
      'The canonical packet store is unavailable. No packet facts were read.', 503);
  });
  const row = rows[0] as unknown as RecordedPacket | undefined;
  if (!row) throw new ReviewerSimulationInputError('DEFENSE_PACKET_NOT_FOUND', 'The named defense packet is not on record for this program.');
  return {
    facts: {
      defenseReadinessScore: row.defenseReadinessScore,
      topRisks: row.topRisks,
      riskCodesUsed: row.riskCodesUsed,
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

function requiresProgramRecords(req: SimulatorRequest): boolean {
  return !req.dryRun || Boolean(req.defensePacketId) || req.ctdProgramId !== undefined;
}

function requestedPersonaCodes(req: SimulatorRequest): ReviewerPersonaCode[] {
  return req.personas && req.personas.length ? req.personas : ALL_PERSONA_CODES;
}

/** Run the full reviewer simulation and (optionally) persist the result. */
export async function runReviewerSimulation(
  req: SimulatorRequest,
  recordScope?: SimulatorRecordScope,
): Promise<SimulatorResult> {
  // A dry classification checklist reads no records and may run standalone.
  // Any persisted run or program-record read needs the actual producer scope.
  const admittedScope = requiresProgramRecords(req)
    ? await admitProgramRecords(req, recordScope, !req.dryRun)
    : undefined;

  // 1. Determine in-scope personas
  const scope = requestedPersonaCodes(req).filter(code =>
    REVIEWER_PERSONAS[code].appliesTo(req.program)
  );

  // 2. Packet facts from the defense packet on record, never from the request.
  // 2026-10-15: the caller's packet was used as given while the named
  // defensePacketId was stored as the packet that "fed the inputs".
  const recordedPacket = req.defensePacketId
    ? await loadRecordedPacket(req.organizationId, req.programId, req.defensePacketId, admittedScope!)
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
    // 2026-10-15: an unstated trigger was recorded as 'manual'. The column is
    // NOT NULL, so a run to be persisted must name its trigger.
    if (!req.trigger?.trim()) {
      throw Object.assign(new Error('trigger is required to record a run (e.g. manual, scheduled, api)'), { statusCode: 422, field: 'trigger' });
    }
    // Record reads can yield while access changes. Recheck immediately before
    // the one canonical INSERT, on the same verified producer executor.
    const currentScope = await admitProgramRecords(req, admittedScope, true);
    const { rows } = await currentScope.executor.query(
      `INSERT INTO reviewer_simulation_runs
        (organization_id, program_id, triggered_by, trigger, persona_scope, inputs_hash,
         questions, question_count, critical_count, warning_count, info_count, per_persona_counts,
         defense_packet_id, summary)
       VALUES ($1,$2::uuid,$3,$4,$5::json,$6,$7::json,$8,$9,$10,$11,$12::json,$13::uuid,$14::json)
       RETURNING id`,
      [req.organizationId, req.programId, String(currentScope.userId), req.trigger, // checked on entry
        JSON.stringify(scope), inputsHash, JSON.stringify(questions), questions.length, criticalCount, warningCount, infoCount,
        JSON.stringify(perPersonaCounts), inputsSource.defensePacketId,
        JSON.stringify({ personaQuestionCount: personaQuestions.length, notAssessedQuestionCount: notAssessed.length, inputsSource })],
    );
    const row = rows[0];
    if (typeof row?.id !== 'string' || !row.id) throw new Error('Simulation storage returned no run identity');
    runId = row.id;
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
