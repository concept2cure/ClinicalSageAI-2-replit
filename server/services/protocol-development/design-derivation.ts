/**
 * Protocol → study design derivation — the reverse direction of the spine.
 *
 * `docs/design/PROTOCOL_DESIGN_CONVERGENCE.md` made the design object the spine
 * and the protocol document its projection. That is one direction. A protocol a
 * human edits is also a fact about the study, and without this module that fact
 * dies on the page. `docs/design/PROTOCOL_INTELLIGENCE.md` binds the contract
 * this file implements.
 *
 * **A protocol edit never mutates the design.** This module produces a
 * *proposal* — a field-level diff a human reviews — and `applyDerivation`
 * returns the next design only for the paths the human accepted. The governed
 * write (`persistStudyDesignTx` + `recordGovernedAction` on one transaction) is
 * the caller's, and is the same writer `applySampleSizeToDesign` uses. There is
 * no second writer.
 *
 * Four rules, from the design document, each enforced here and each tested:
 *
 *   1. **Silence is not a value.** A design field the protocol does not
 *      evidence is reported in `unevidenced` and is left exactly as it was. It
 *      is never set to null, zero, an empty array or a default. A derivation
 *      that clears a field because a section was blank destroys the design.
 *   2. **Conflict is not resolution.** Where protocol and design disagree both
 *      values are reported and neither wins. The human picks.
 *   3. **Provenance per field, or the field is not in the patch.** Every
 *      proposed value names the protocol rows it came from.
 *   4. **Structure over prose.** Derivation reads the structured registers.
 *      Nothing here scans a section body for a sample size, a margin or an
 *      alpha — inventing a governed number out of prose is the defect this
 *      platform exists to prevent.
 *
 * A proposal that would leave the design internally inconsistent (an objective
 * naming an endpoint the design does not carry; an endpoint with no measurement
 * type, which the protocol never records) is not downgraded to a guess. It is
 * reported as `incomplete`, naming exactly what a human must supply, and
 * `applyDerivation` refuses it.
 *
 * Pure and total: no I/O, no database, no clock, no randomness. The same input
 * twice produces byte-identical output.
 *
 * @module server/services/protocol-development/design-derivation
 */

import type {
  EligibilityCriterion,
  Endpoint,
  Objective,
  ObjectiveLevel,
  SoaVisit,
  StudyDesign,
  StudyPhase,
} from '../study-design/study-design-types';

// ─── Input ───────────────────────────────────────────────────────────────────

/**
 * The protocol document's structured registers, as the read model already
 * assembles them. Deliberately a plain shape rather than the Drizzle rows so
 * this module stays pure and testable without a database.
 */
export interface ProtocolDerivationInput {
  documentId: number;
  title: string;
  /** Free text on `protocol_documents`; normalized against `StudyPhase` below. */
  phase?: string | null;
  /** `protocol_documents.design_type` — a study TYPE, not a structural design. */
  designType?: string | null;
  therapeuticArea?: string | null;
  objectives: Array<{
    id: number;
    objectiveType: string;
    objective: string;
    endpoint?: string | null;
    timepoint?: string | null;
    orderIndex: number;
  }>;
  eligibility: Array<{ id: number; kind: string; criterion: string; orderIndex: number }>;
  visits: Array<{
    id: number;
    visitName: string;
    timepoint?: string | null;
    procedures?: string[] | null;
    orderIndex: number;
  }>;
}

// ─── Output ──────────────────────────────────────────────────────────────────

/**
 * How a value was obtained. `structured` means it came from a register column.
 * `text_scan` means a free-text field was parsed, and such a value is always a
 * proposal for a human to confirm — never applied on its own authority.
 */
export type DerivationConfidence = 'structured' | 'text_scan';

/** Where a derived value came from, per rule 3. */
export interface FieldProvenance {
  /** The protocol table the value was read from. */
  table: string;
  /** The row ids that contributed, ascending. */
  rowIds: number[];
  confidence: DerivationConfidence;
  /** What was read, in words. */
  note: string;
}

/** A design path the protocol evidences, with the value it evidences. */
export interface DerivedField {
  path: DerivablePath;
  value: unknown;
  provenance: FieldProvenance;
}

/** Protocol and design disagree. Both values are reported; neither wins. */
export interface DerivationConflict {
  path: DerivablePath;
  designValue: unknown;
  protocolValue: unknown;
  why: string;
  provenance: FieldProvenance;
}

/** A design field the protocol says nothing about. Left exactly as it is. */
export interface UnevidencedField {
  path: string;
  reason: string;
}

/** A proposal a human must complete before it can be applied. */
export interface IncompleteProposal {
  path: DerivablePath;
  /** What the protocol does evidence, for display. */
  partial: unknown;
  /** The design fields the protocol does not record, by name. */
  missing: string[];
  reason: string;
  provenance: FieldProvenance;
}

/** The paths this module can derive. Anything else is `unevidenced` by construction. */
export type DerivablePath =
  | 'title'
  | 'phase'
  | 'objectives'
  | 'endpoints'
  | 'population.eligibility'
  | 'scheduleOfActivities.visits';

export interface DesignDerivation {
  /** Ready to apply: evidenced, complete, and different from the design. */
  proposed: DerivedField[];
  /** Evidenced and different, but the two sources disagree. */
  conflicts: DerivationConflict[];
  /** Evidenced and already identical to the design. Nothing to do. */
  unchanged: DerivablePath[];
  /** Not evidenced. Untouched. */
  unevidenced: UnevidencedField[];
  /** Evidenced but not applicable until a human supplies `missing`. */
  incomplete: IncompleteProposal[];
}

// ─── Vocabulary normalization ────────────────────────────────────────────────

/**
 * Free-text phase → `StudyPhase`. Explicit table, not a regex guess: a phase
 * string that is not on this list yields no phase rather than a nearest match.
 */
const PHASE_ALIASES: ReadonlyMap<string, StudyPhase> = new Map<string, StudyPhase>([
  ['fih', 'FIH'], ['first in human', 'FIH'], ['first-in-human', 'FIH'], ['phase 0', 'FIH'],
  ['1', '1'], ['phase 1', '1'], ['phase i', '1'], ['ph1', '1'],
  ['1b', '1b'], ['phase 1b', '1b'], ['phase ib', '1b'],
  ['2', '2'], ['phase 2', '2'], ['phase ii', '2'], ['ph2', '2'],
  ['2b', '2b'], ['phase 2b', '2b'], ['phase iib', '2b'],
  ['3', '3'], ['phase 3', '3'], ['phase iii', '3'], ['ph3', '3'],
  ['3b', '3b'], ['phase 3b', '3b'], ['phase iiib', '3b'],
  ['4', '4'], ['phase 4', '4'], ['phase iv', '4'], ['ph4', '4'],
]);

/** Normalize a free-text phase, or return null when it is not on the list. */
export function normalizePhase(raw: string | null | undefined): StudyPhase | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/\s{2,}/g, ' ');
  if (!key) return null;
  return PHASE_ALIASES.get(key) ?? null;
}

/** `protocol_objectives.objective_type` → `ObjectiveLevel`, or null when unknown. */
export function normalizeObjectiveLevel(raw: string | null | undefined): ObjectiveLevel | null {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (key === 'primary' || key === 'secondary' || key === 'exploratory') return key;
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stable structural comparison, so `unchanged` is exact and order-sensitive. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function provenance(
  table: string,
  rowIds: number[],
  confidence: DerivationConfidence,
  note: string,
): FieldProvenance {
  return { table, rowIds: [...rowIds].sort((x, y) => x - y), confidence, note };
}

/**
 * Route one evidenced value into `proposed`, `conflicts` or `unchanged`.
 *
 * A field the design has not set at all is a proposal, not a conflict: there is
 * nothing to disagree with. A field the design has set to a different value is
 * a conflict, and rule 2 says neither side wins here.
 */
interface RouteArgs {
  path: DerivablePath;
  designValue: unknown;
  protocolValue: unknown;
  provenance: FieldProvenance;
  /** Shown to the human when the two sources disagree. */
  why: string;
}

function route(out: DesignDerivation, args: RouteArgs): void {
  const { path, designValue, protocolValue, provenance: prov, why } = args;
  if (sameValue(designValue, protocolValue)) {
    out.unchanged.push(path);
    return;
  }
  const designIsEmpty =
    designValue === undefined ||
    designValue === null ||
    designValue === '' ||
    (Array.isArray(designValue) && designValue.length === 0);
  if (designIsEmpty) {
    out.proposed.push({ path, value: protocolValue, provenance: prov });
    return;
  }
  out.conflicts.push({ path, designValue, protocolValue, why, provenance: prov });
}

// ─── Per-register derivation ─────────────────────────────────────────────────

function deriveTitle(input: ProtocolDerivationInput, design: StudyDesign, out: DesignDerivation): void {
  const title = input.title?.trim() ?? '';
  if (!title) {
    out.unevidenced.push({ path: 'title', reason: 'The protocol document records no title.' });
    return;
  }
  route(out, {
    path: 'title',
    designValue: design.title?.trim() ?? '',
    protocolValue: title,
    provenance: provenance('protocol_documents', [input.documentId], 'structured', 'protocol_documents.title'),
    why: 'The protocol and the design carry different titles.',
  });
}

function derivePhase(input: ProtocolDerivationInput, design: StudyDesign, out: DesignDerivation): void {
  const raw = input.phase ?? null;
  const phase = normalizePhase(raw);
  if (!phase) {
    out.unevidenced.push({
      path: 'phase',
      reason:
        raw && raw.trim()
          ? `protocol_documents.phase reads "${raw.trim()}", which is not one of the design's phase values, so no phase was derived.`
          : 'The protocol document records no phase.',
    });
    return;
  }
  route(out, {
    path: 'phase',
    designValue: design.phase ?? null,
    protocolValue: phase,
    provenance: provenance('protocol_documents', [input.documentId], 'structured', `protocol_documents.phase = "${raw}"`),
    why: 'The protocol and the design disagree on the development phase.',
  });
}

function deriveEligibility(input: ProtocolDerivationInput, design: StudyDesign, out: DesignDerivation): void {
  if (input.eligibility.length === 0) {
    out.unevidenced.push({
      path: 'population.eligibility',
      reason: 'The protocol records no eligibility criteria.',
    });
    return;
  }
  const ordered = [...input.eligibility].sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const unknownKind = ordered.filter((r) => r.kind !== 'inclusion' && r.kind !== 'exclusion');
  const usable = ordered.filter((r) => r.kind === 'inclusion' || r.kind === 'exclusion');
  const prov = provenance(
    'protocol_eligibility_criteria',
    ordered.map((r) => r.id),
    'structured',
    `${usable.length} criteria (${usable.filter((r) => r.kind === 'inclusion').length} inclusion, ${usable.filter((r) => r.kind === 'exclusion').length} exclusion)`,
  );
  if (unknownKind.length > 0) {
    out.incomplete.push({
      path: 'population.eligibility',
      partial: usable.length,
      missing: unknownKind.map((r) => `protocol_eligibility_criteria.${r.id}.kind`),
      reason: `${unknownKind.length} criteria record a kind that is neither inclusion nor exclusion, so the criterion list cannot be derived without dropping them.`,
      provenance: prov,
    });
    return;
  }
  const criteria: EligibilityCriterion[] = usable.map((r) => ({
    type: r.kind as 'inclusion' | 'exclusion',
    text: r.criterion,
  }));
  route(out, {
    path: 'population.eligibility',
    designValue: design.population?.eligibility ?? [],
    protocolValue: criteria,
    provenance: prov,
    why: 'The protocol and the design carry different eligibility criteria.',
  });
}

/**
 * Endpoints. The protocol records an endpoint's NAME and timepoint on the
 * objective row and nothing else. `Endpoint.type` (continuous, binary,
 * time-to-event …) drives method–endpoint matching in the SAP and every
 * statistical gate, and the protocol never records it — so an endpoint the
 * design does not already carry is `incomplete`, naming `type` and
 * `definition` as what a human must supply. Guessing a type from an endpoint's
 * wording would be exactly the name-matching heuristic this codebase forbids.
 */
function deriveEndpoints(input: ProtocolDerivationInput, design: StudyDesign, out: DesignDerivation): void {
  const named = input.objectives.filter((o) => (o.endpoint ?? '').trim().length > 0);
  if (named.length === 0) {
    out.unevidenced.push({
      path: 'endpoints',
      reason: 'No protocol objective names an endpoint.',
    });
    return;
  }
  const existing = new Set((design.endpoints ?? []).map((e) => e.name.trim().toLowerCase()));
  const missing = named.filter((o) => !existing.has((o.endpoint ?? '').trim().toLowerCase()));
  const prov = provenance(
    'protocol_objectives',
    named.map((o) => o.id),
    'structured',
    `${named.length} objectives name an endpoint`,
  );
  if (missing.length === 0) {
    out.unchanged.push('endpoints');
    return;
  }
  out.incomplete.push({
    path: 'endpoints',
    partial: missing.map((o) => ({
      name: (o.endpoint ?? '').trim(),
      role: normalizeObjectiveLevel(o.objectiveType) === 'primary' ? 'primary' : 'secondary',
      timepoint: o.timepoint?.trim() || undefined,
    })),
    missing: missing.flatMap((o) => {
      const n = (o.endpoint ?? '').trim();
      return [`endpoints["${n}"].type`, `endpoints["${n}"].definition`];
    }),
    reason:
      'The protocol records an endpoint name and timepoint but never its measurement type or definition, and both are required before the design can carry it. Supply them rather than have them inferred from the wording.',
    provenance: prov,
  });
}

/**
 * Objectives. An `Objective` binds to an endpoint BY NAME, so proposing
 * objectives whose endpoints the design does not carry would leave a dangling
 * reference inside the spine. That is reported as incomplete — add the
 * endpoints first — rather than applied and left broken.
 */
function deriveObjectives(input: ProtocolDerivationInput, design: StudyDesign, out: DesignDerivation): void {
  if (input.objectives.length === 0) {
    out.unevidenced.push({ path: 'objectives', reason: 'The protocol records no objectives.' });
    return;
  }
  const ordered = [...input.objectives].sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const prov = provenance(
    'protocol_objectives',
    ordered.map((o) => o.id),
    'structured',
    `${ordered.length} objectives`,
  );
  const blockers = objectiveBlockers(ordered, design);
  if (blockers.length > 0) {
    out.incomplete.push({
      path: 'objectives',
      partial: ordered.length,
      missing: blockers,
      reason:
        'Every objective must name an objective level and an endpoint the design carries. Applying a partial list would drop the rest, and applying an objective that names an endpoint the design does not have would leave a dangling reference in the spine.',
      provenance: prov,
    });
    return;
  }
  const byLevel = new Map<ObjectiveLevel, number>();
  const objectives: Objective[] = ordered.map((o) => {
    const level = normalizeObjectiveLevel(o.objectiveType) as ObjectiveLevel;
    const next = (byLevel.get(level) ?? 0) + 1;
    byLevel.set(level, next);
    return {
      level,
      order: next,
      text: o.objective,
      endpointName: (o.endpoint ?? '').trim(),
    };
  });
  route(out, {
    path: 'objectives',
    designValue: design.objectives ?? [],
    protocolValue: objectives,
    provenance: prov,
    why: 'The protocol and the design carry different objectives.',
  });
}

/** The named reasons a protocol objective list cannot become design objectives. */
function objectiveBlockers(
  ordered: ProtocolDerivationInput['objectives'],
  design: StudyDesign,
): string[] {
  const existing = new Set((design.endpoints ?? []).map((e) => e.name.trim().toLowerCase()));
  const blockers: string[] = [];
  for (const o of ordered) {
    if (!normalizeObjectiveLevel(o.objectiveType)) {
      blockers.push(`protocol_objectives.${o.id}.objective_type ("${o.objectiveType}" is not primary, secondary or exploratory)`);
    }
    const endpoint = (o.endpoint ?? '').trim();
    if (!endpoint) {
      blockers.push(`protocol_objectives.${o.id}.endpoint (objective names no endpoint)`);
    } else if (!existing.has(endpoint.toLowerCase())) {
      blockers.push(`endpoints["${endpoint}"] (named by protocol_objectives.${o.id}, absent from the design)`);
    }
  }
  return blockers;
}

/**
 * Schedule visits. An `SoaVisit` belongs to an epoch (screening, treatment,
 * follow-up), and the protocol's visit register records no epoch at all —
 * assigning one from a visit's name would be a guess about trial structure. So
 * visits are always `incomplete`, naming the epoch assignment as the thing a
 * human supplies. Study day and window ARE parsed from the timepoint string
 * where it is unambiguous, and that parse is marked `text_scan`.
 */
function deriveVisits(input: ProtocolDerivationInput, design: StudyDesign, out: DesignDerivation): void {
  if (input.visits.length === 0) {
    out.unevidenced.push({
      path: 'scheduleOfActivities.visits',
      reason: 'The protocol records no schedule visits.',
    });
    return;
  }
  const ordered = [...input.visits].sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const existing = design.scheduleOfActivities?.visits ?? [];
  const prov = provenance(
    'protocol_schedule_visits',
    ordered.map((v) => v.id),
    'text_scan',
    `${ordered.length} visits; study day and window read from the free-text timepoint where it parses unambiguously`,
  );
  if (existing.length > 0 && existing.length === ordered.length) {
    const sameNames = existing.every((e, i) => e.name.trim() === ordered[i].visitName.trim());
    if (sameNames) {
      out.unchanged.push('scheduleOfActivities.visits');
      return;
    }
  }
  out.incomplete.push({
    path: 'scheduleOfActivities.visits',
    partial: ordered.map((v, i) => partialVisit(v, i)),
    missing: ordered.map((v) => `scheduleOfActivities.visits["${v.visitName.trim()}"].epochId`),
    reason:
      'A visit belongs to a trial epoch (screening, run-in, treatment, follow-up) and the protocol visit register records none. Assigning an epoch from a visit name would be a guess about the trial structure, so the epoch is asked for rather than inferred.',
    provenance: prov,
  });
}

/** A visit as far as the protocol evidences it — no epoch, no invented id. */
function partialVisit(
  v: ProtocolDerivationInput['visits'][number],
  index: number,
): Pick<SoaVisit, 'name' | 'order'> & { studyDay?: number; windowDays?: number; timepointText?: string } {
  const parsed = parseTimepoint(v.timepoint);
  return {
    name: v.visitName.trim(),
    order: index + 1,
    ...(parsed.studyDay !== undefined ? { studyDay: parsed.studyDay } : {}),
    ...(parsed.windowDays !== undefined ? { windowDays: parsed.windowDays } : {}),
    ...(v.timepoint ? { timepointText: v.timepoint } : {}),
  };
}

/**
 * Parse "Day 1", "Week 4 (±3d)", "Day -14" into a study day and window.
 * Anything that does not match these exact shapes yields nothing — a timepoint
 * this cannot read is absent, not zero.
 */
export function parseTimepoint(raw: string | null | undefined): { studyDay?: number; windowDays?: number } {
  if (typeof raw !== 'string') return {};
  const text = raw.trim().toLowerCase();
  if (!text) return {};
  const out: { studyDay?: number; windowDays?: number } = {};
  const day = /^day\s+(-?\d+)\b/.exec(text);
  const week = /^week\s+(-?\d+)\b/.exec(text);
  if (day) out.studyDay = Number(day[1]);
  else if (week) out.studyDay = Number(week[1]) * 7;
  const window = /[±+]\s*(\d+)\s*d/.exec(text);
  if (window) out.windowDays = Number(window[1]);
  return out;
}

// ─── Design fields the protocol structurally cannot evidence ─────────────────

/**
 * Every design path no protocol register carries, with the reason. This list is
 * the honest answer to "what does the protocol document NOT tell us", and it is
 * asserted field-by-field in the tests so a future register that closes a gap
 * forces this list to be updated rather than silently going stale.
 */
const STRUCTURALLY_UNEVIDENCED: readonly UnevidencedField[] = [
  { path: 'indication', reason: 'protocol_documents records a therapeutic area, which is broader than the design\'s indication; deriving one from the other would narrow a clinical claim.' },
  { path: 'productType', reason: 'No protocol register records whether the product is a drug, biologic, device, IVD or combination.' },
  { path: 'targetRegions', reason: 'No protocol register records the target regulatory regions.' },
  { path: 'framework.inferentialFrame', reason: 'No protocol register records superiority, non-inferiority or equivalence.' },
  { path: 'framework.structuralDesign', reason: 'protocol_documents.design_type records a study TYPE (interventional, observational, registry), not a structural design family (parallel group, crossover, factorial, adaptive).' },
  { path: 'framework.controlType', reason: 'No protocol register records the ICH E10 control choice.' },
  { path: 'framework.margin', reason: 'A non-inferiority margin is a governed number and is never read out of prose.' },
  { path: 'estimands', reason: 'No protocol register records estimand attributes; the ICH E9(R1) estimand is captured on the design, not on the document.' },
  { path: 'population.targetDescription', reason: 'No protocol register records a target-population description distinct from the eligibility list.' },
  { path: 'population.analysisPopulations', reason: 'No protocol register records ITT / mITT / PP / Safety analysis sets.' },
  { path: 'arms', reason: 'The protocol document has no arms or interventions register.' },
  { path: 'randomization', reason: 'No protocol register records allocation ratio, method, stratification or blinding.' },
  { path: 'statisticalPlan', reason: 'The statistics section is free text. Alpha, power, sample size and dropout are governed numbers produced by the deterministic engine; reading them out of prose would fabricate them.' },
  { path: 'safety', reason: 'No protocol register records stopping rules, DLT definitions or the DMC charter.' },
] as const;

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Derive what a protocol document evidences about its bound study design.
 * Returns a proposal. Nothing is mutated and nothing is applied.
 *
 * `design` is the currently bound design. A design that has not been created
 * yet is passed as an empty shell by the caller, not as null, so that "the
 * design has nothing here" and "the protocol has nothing here" stay distinct.
 */
export function deriveDesignFromProtocol(
  input: ProtocolDerivationInput,
  design: StudyDesign,
): DesignDerivation {
  const out: DesignDerivation = {
    proposed: [],
    conflicts: [],
    unchanged: [],
    unevidenced: [],
    incomplete: [],
  };
  deriveTitle(input, design, out);
  derivePhase(input, design, out);
  deriveEndpoints(input, design, out);
  deriveObjectives(input, design, out);
  deriveEligibility(input, design, out);
  deriveVisits(input, design, out);
  out.unevidenced.push(...STRUCTURALLY_UNEVIDENCED.map((f) => ({ ...f })));
  out.unevidenced.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** The structurally unevidenced design paths, for the surface and the tests. */
export function structurallyUnevidencedPaths(): UnevidencedField[] {
  return STRUCTURALLY_UNEVIDENCED.map((f) => ({ ...f }));
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export interface ApplyResult {
  /** The design as it would be after the accepted paths are written. */
  next: StudyDesign;
  applied: DerivablePath[];
  /** Paths the caller asked for that were not applied, and why. */
  rejected: Array<{ path: string; reason: string }>;
}

/**
 * Apply only the paths a human accepted. A path in `incomplete` is always
 * refused — writing it would leave the design invalid. A path in `conflicts`
 * may be accepted, and doing so means the human chose the protocol's value.
 *
 * Pure: returns the next design and never mutates the one passed in.
 */
export function applyDerivation(
  design: StudyDesign,
  derivation: DesignDerivation,
  acceptedPaths: readonly string[],
): ApplyResult {
  // JSON round-trip rather than structuredClone: a StudyDesign is plain JSON
  // data (it is compared by JSON above), and this keeps the module free of a
  // host global so it runs identically under every test environment.
  const next: StudyDesign = JSON.parse(JSON.stringify(design)) as StudyDesign;
  const applied: DerivablePath[] = [];
  const rejected: Array<{ path: string; reason: string }> = [];
  const proposals = new Map<string, unknown>(derivation.proposed.map((p) => [p.path, p.value]));
  const conflicts = new Map<string, unknown>(derivation.conflicts.map((c) => [c.path, c.protocolValue]));
  const incomplete = new Set(derivation.incomplete.map((i) => i.path));

  for (const path of dedupe(acceptedPaths)) {
    if (incomplete.has(path as DerivablePath)) {
      rejected.push({ path, reason: 'The proposal is incomplete: a required design field is not recorded on the protocol. Supply it first.' });
      continue;
    }
    const value = proposals.has(path) ? proposals.get(path) : conflicts.get(path);
    if (value === undefined && !proposals.has(path)) {
      rejected.push({ path, reason: 'The derivation offers nothing at this path.' });
      continue;
    }
    if (!writePath(next, path as DerivablePath, value)) {
      rejected.push({ path, reason: 'Not a derivable design path.' });
      continue;
    }
    applied.push(path as DerivablePath);
  }
  return { next, applied, rejected };
}

function dedupe(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

/**
 * Write one derivable path. Explicit per-path setters rather than a generic
 * deep-set: a string-driven deep write into a governed object is how a typo
 * becomes a new field, and how `__proto__` becomes a vulnerability.
 */
function writePath(design: StudyDesign, path: DerivablePath, value: unknown): boolean {
  switch (path) {
    case 'title':
      design.title = String(value);
      return true;
    case 'phase':
      design.phase = value as StudyPhase;
      return true;
    case 'objectives':
      design.objectives = value as Objective[];
      return true;
    case 'endpoints':
      design.endpoints = value as Endpoint[];
      return true;
    case 'population.eligibility':
      design.population = { ...design.population, eligibility: value as EligibilityCriterion[] };
      return true;
    case 'scheduleOfActivities.visits':
      if (!design.scheduleOfActivities) return false;
      design.scheduleOfActivities = { ...design.scheduleOfActivities, visits: value as SoaVisit[] };
      return true;
    default:
      return false;
  }
}
