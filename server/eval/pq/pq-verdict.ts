/**
 * Performance-qualification verdicts, and the check that a registry entry's
 * claimed PQ is backed by a real record.
 *
 * Pure: no gateway, no filesystem except through the reader it is handed. Every
 * route to PASS is therefore testable without a model, which is the point — a
 * PQ verdict that has only ever been seen to come out one way has not been
 * tested (server/eval/pq/__tests__/pq-verdict.test.ts).
 *
 * The rules, in the order they are applied:
 *   1. Nothing executed                               → NOT_EXECUTED
 *   2. A required component could not be executed    → INCOMPLETE
 *   3. Fewer tasks than the protocol's sample floor   → INCOMPLETE
 *   4. Any task whose served model is not the pinned
 *      version, or could not be verified              → INCOMPLETE
 *   5. Any criterion missed                           → FAIL
 *   6. The protocol is not approved                   → INCOMPLETE ("criteria met, but not approved criteria")
 *   7. Otherwise                                      → PASS
 *
 * FAIL is decided before the approval check on purpose: a model that misses a
 * draft criterion has failed something real, and hiding that behind "the
 * criteria are not approved yet" would report a known shortfall as pending.
 */

export type PqVerdict = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'NOT_EXECUTED';

export interface PqComponentProtocol {
  required: boolean;
  executable: boolean;
  notExecutableReason?: string;
  criteria: Record<string, number>;
  criteriaSource: string;
}

export interface PqProtocol {
  protocolId: string;
  version: string;
  status: 'draft' | 'approved';
  approvedBy: string | null;
  approvedOn: string | null;
  components: Record<string, PqComponentProtocol>;
}

/** One generation task as it actually ran. */
export interface PqGenerationResult {
  taskId: string;
  docType: string;
  /** What the provider reported serving (GatewayResponse.resolvedModel). */
  servedModel: string | null;
  /** True only when servedModel is present and is the pinned version. */
  servedModelVerified: boolean;
  sectionCoverage: number | null;
  forbiddenHits: number | null;
  /** Set when the task could not produce a scorable output. */
  error?: string;
}

/** One extraction task as it actually ran. Same attribution rules as generation. */
export interface PqExtractionResult {
  taskId: string;
  docType: string;
  servedModel: string | null;
  servedModelVerified: boolean;
  /** null when the task produced nothing scorable (no reply, or unparseable). */
  f1: number | null;
  precision: number | null;
  recall: number | null;
  error?: string;
}

export interface PqVerdictResult {
  verdict: PqVerdict;
  reasons: string[];
}

/**
 * Whether the model that answered is the model being qualified.
 *
 * Providers report dated snapshots (`gpt-4o-2024-08-06` for `gpt-4o`), so the
 * pinned version is matched as a prefix on a `-` boundary — never as a bare
 * substring, which would let `gpt-4o-mini` pass for `gpt-4o`.
 */
export function servedModelMatches(served: string | null | undefined, pinnedVersion: string): boolean {
  if (!served) return false;
  if (served === pinnedVersion) return true;
  if (!served.startsWith(`${pinnedVersion}-`)) return false;
  // Only a date-shaped suffix counts as the same model: `-2024-08-06`, `-20250514`.
  return /^-(\d{8}|\d{4}-\d{2}-\d{2})$/.test(served.slice(pinnedVersion.length));
}

/** Required components the protocol declares but that cannot run yet. */
function unexecutableComponents(protocol: PqProtocol): string[] {
  return Object.entries(protocol.components)
    .filter(([, c]) => c.required && !c.executable)
    .map(([name, c]) => `required component "${name}" cannot be executed yet: ${c.notExecutableReason ?? 'no reason recorded'}`);
}

/** Tasks that produced nothing, or were answered by a model that is not the one under qualification. */
function taskShortfalls(generation: PqGenerationResult[], scored: PqGenerationResult[]): string[] {
  const out: string[] = [];
  const errored = generation.filter((g) => g.error);
  if (errored.length) {
    out.push(`${errored.length} generation task(s) produced no output: ${errored.map((g) => g.taskId).join(', ')}`);
  }
  const unverified = scored.filter((g) => !g.servedModelVerified);
  if (unverified.length) {
    out.push(
      `${unverified.length} task(s) were answered by a model that is not the pinned version, or did not say: ` +
        unverified.map((g) => `${g.taskId}=${g.servedModel ?? 'unreported'}`).join(', '),
    );
  }
  return out;
}

/** Document types with fewer scored tasks than the protocol's sample floor. */
function sampleShortfall(floor: number | undefined, scored: PqGenerationResult[]): string[] {
  if (typeof floor !== 'number') return [];
  const byDoc = new Map<string, number>();
  for (const g of scored) byDoc.set(g.docType, (byDoc.get(g.docType) ?? 0) + 1);
  const short = [...byDoc].filter(([, n]) => n < floor);
  return short.length
    ? [`sample below the protocol floor of ${floor} per document type: ${short.map(([d, n]) => `${d}=${n}`).join(', ')}`]
    : [];
}

/** Criteria missed, measured only over tasks the pinned model verifiably answered. */
function criteriaMissed(criteria: Record<string, number>, counted: PqGenerationResult[]): string[] {
  const out: string[] = [];
  const minCov = criteria.minSectionCoverage;
  if (typeof minCov === 'number' && counted.length) {
    const meanCov = counted.reduce((a, g) => a + (g.sectionCoverage as number), 0) / counted.length;
    if (meanCov < minCov) out.push(`mean section coverage ${meanCov.toFixed(3)} is below ${minCov}`);
  }
  const maxForbidden = criteria.maxForbiddenHits;
  if (typeof maxForbidden === 'number') {
    const hits = counted.reduce((a, g) => a + (g.forbiddenHits as number), 0);
    if (hits > maxForbidden) out.push(`${hits} forbidden / overclaim phrase(s); the protocol allows ${maxForbidden}`);
  }
  return out;
}

/**
 * The extraction component's shortfalls and missed criteria.
 *
 * Mirrors generation deliberately: a task that produced nothing is a shortfall,
 * a task answered by another model is a shortfall, and the criterion is
 * measured only over tasks the pinned model verifiably answered — otherwise a
 * fallback model's score would count toward qualifying the pinned one.
 *
 * A component that is required and executable but ran no task is INCOMPLETE,
 * not PASS. Before this, extraction was `executable: false` and so was reported
 * by unexecutableComponents; once it can run, "it did not run" has to be said
 * some other way or a PQ would pass having skipped a required component.
 */
function extractionFindings(
  protocol: PqProtocol,
  extraction: PqExtractionResult[],
): { incomplete: string[]; missed: string[] } {
  const ext = protocol.components.extraction;
  if (!ext?.required || !ext.executable) return { incomplete: [], missed: [] };

  const scored = extraction.filter((e) => !e.error && e.f1 !== null);
  if (scored.length === 0) {
    const errs = extraction.filter((e) => e.error).map((e) => `${e.taskId}: ${e.error}`);
    return {
      incomplete: [
        'required component "extraction" is executable but produced no scorable output',
        ...errs.slice(0, 5),
      ],
      missed: [],
    };
  }

  const incomplete: string[] = [];
  const errored = extraction.filter((e) => e.error);
  if (errored.length) {
    incomplete.push(`${errored.length} extraction task(s) produced no output: ${errored.map((e) => e.taskId).join(', ')}`);
  }
  const unverified = scored.filter((e) => !e.servedModelVerified);
  if (unverified.length) {
    incomplete.push(
      `${unverified.length} extraction task(s) were answered by a model that is not the pinned version, or did not say: ` +
        unverified.map((e) => `${e.taskId}=${e.servedModel ?? 'unreported'}`).join(', '),
    );
  }

  const missed: string[] = [];
  const counted = scored.filter((e) => e.servedModelVerified);
  const minF1 = ext.criteria.minF1;
  if (typeof minF1 === 'number' && counted.length) {
    const meanF1 = counted.reduce((a, e) => a + (e.f1 as number), 0) / counted.length;
    if (meanF1 < minF1) missed.push(`mean extraction F1 ${meanF1.toFixed(3)} is below ${minF1}`);
  }
  return { incomplete, missed };
}

function isApproved(protocol: PqProtocol): boolean {
  return protocol.status === 'approved' && Boolean(protocol.approvedBy) && Boolean(protocol.approvedOn);
}

export function computeVerdict(
  protocol: PqProtocol,
  generation: PqGenerationResult[],
  extraction: PqExtractionResult[] = [],
): PqVerdictResult {
  const gen = protocol.components.generation;
  if (!gen) return { verdict: 'INCOMPLETE', reasons: ['protocol declares no generation component'] };

  const scored = generation.filter((g) => !g.error && g.sectionCoverage !== null && g.forbiddenHits !== null);
  if (scored.length === 0) {
    const errs = generation.filter((g) => g.error).map((g) => `${g.taskId}: ${g.error}`);
    return { verdict: 'NOT_EXECUTED', reasons: ['no generation task produced a scorable output', ...errs.slice(0, 5)] };
  }

  const ext = extractionFindings(protocol, extraction);
  const incomplete = [
    ...unexecutableComponents(protocol),
    ...taskShortfalls(generation, scored),
    ...sampleShortfall(gen.criteria.minTasksPerDocType, scored),
    ...ext.incomplete,
  ];
  const missed = [
    ...criteriaMissed(gen.criteria, scored.filter((g) => g.servedModelVerified)),
    ...ext.missed,
  ];

  // FAIL outranks INCOMPLETE: a model that missed a criterion has failed
  // something real, and reporting it as merely incomplete would hide that.
  if (missed.length) return { verdict: 'FAIL', reasons: [...missed, ...incomplete] };
  if (incomplete.length) return { verdict: 'INCOMPLETE', reasons: incomplete };
  if (!isApproved(protocol)) {
    return {
      verdict: 'INCOMPLETE',
      reasons: [
        `the criteria were met, but ${protocol.protocolId} is ${protocol.status}: a PQ against acceptance ` +
          'criteria nobody has approved is not a PQ',
      ],
    };
  }
  return { verdict: 'PASS', reasons: ['every required component executed and met approved criteria'] };
}

/** The record the runner writes, and the registry's `pq.reference` points at. */
export interface PqRecord {
  kind: 'pq-record';
  protocolId: string;
  protocolVersion: string;
  protocolStatus: 'draft' | 'approved';
  protocolSha256: string;
  modelId: string;
  pinnedVersion: string;
  provider: string;
  goldBankVersion: string;
  goldBankSha256: string;
  gitSha: string | null;
  startedAt: string;
  finishedAt: string;
  generation: PqGenerationResult[];
  /** Absent on records written before the extraction component could execute. */
  extraction?: PqExtractionResult[];
  verdict: PqVerdict;
  reasons: string[];
}

export interface RegistryPqClaim {
  id: string;
  pinnedVersion: string;
  pq: { status: 'pending' | 'passed' | 'failed'; reference: string | null };
}

/**
 * Check a registry entry's PQ claim against the record it cites.
 *
 * `passed` must cite a record that exists, is a PQ record, is for this exact
 * id AND pinned version, ran against an approved protocol, and says PASS.
 * A version bump after the PQ therefore invalidates the claim on its own —
 * which is what "re-validation is owed" in the registry has always meant, and
 * until now nothing checked.
 */
export function verifyPqClaim(entry: RegistryPqClaim, readRecord: (ref: string) => unknown): string[] {
  const problems: string[] = [];
  const { status, reference } = entry.pq;
  if (status === 'pending') {
    if (reference !== null) problems.push(`${entry.id}: pending PQ cites a record (${reference}) — record the outcome or drop the reference`);
    return problems;
  }
  if (!reference) return [`${entry.id}: pq.status is "${status}" with no record to point at`];

  let rec: Partial<PqRecord> | null;
  try {
    rec = readRecord(reference) as Partial<PqRecord> | null;
  } catch (err) {
    return [`${entry.id}: cannot read PQ record ${reference}: ${(err as Error).message}`];
  }
  if (!rec || rec.kind !== 'pq-record') return [`${entry.id}: ${reference} is not a PQ record`];
  if (rec.modelId !== entry.id) problems.push(`${entry.id}: record is for "${rec.modelId}"`);
  if (rec.pinnedVersion !== entry.pinnedVersion) {
    problems.push(`${entry.id}: record qualified ${rec.pinnedVersion}; the registry now pins ${entry.pinnedVersion} — re-qualification is owed`);
  }
  if (status === 'passed') {
    if (rec.verdict !== 'PASS') problems.push(`${entry.id}: claims passed; the record says ${rec.verdict}`);
    if (rec.protocolStatus !== 'approved') problems.push(`${entry.id}: record ran against a ${rec.protocolStatus} protocol`);
  }
  if (status === 'failed' && rec.verdict === 'PASS') problems.push(`${entry.id}: claims failed; the record says PASS`);
  return problems;
}
