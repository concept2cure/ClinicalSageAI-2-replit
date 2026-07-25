/**
 * Clinical Regulatory Evidence — retrieval atoms (Phase 5).
 *
 * Projects the normalized CRE entities — FDA regulatory findings, requested
 * actions, regulatory outcomes, human-approved design lessons, contradictory
 * precedents, and the CSR-derived design features / result observations / safety
 * signals / execution limitations — into `lumen_data_atoms`, the canonical
 * semantic-retrieval corpus AnA already searches through
 * advancedRAGPipeline → ragRouter. CRE evidence becomes discoverable *by meaning*,
 * alongside the rest of a tenant's knowledge — NOT a parallel retrieval stack.
 *
 * Nine atom_type values (all lower_snake_case, matching the corpus convention):
 *   csr_design_feature, csr_result_observation, csr_safety_signal,
 *   csr_execution_limitation, fda_regulatory_finding, fda_requested_action,
 *   regulatory_outcome, design_lesson, contradictory_precedent.
 *
 * Design constraints, each verified against the live schema/writers before build:
 *  - `atom_type` is free `text` (zero DDL); these nine are just new values.
 *  - `organization_id` is NOT NULL and atom retrieval is single-org, so atoms are
 *    MATERIALIZED PER OWNING ORG. Global-public CRE evidence visible to a tenant
 *    (org IS NULL OR org = tenant) is materialized under that tenant — strict
 *    isolation is preserved because every atom row carries a concrete org id.
 *  - there is no unique index, so `ON CONFLICT` is inert; we make ingestion
 *    idempotent ourselves on (organization_id, source_type, source_id, atom_type)
 *    via delete-then-insert.
 *  - the embedding is written in a best-effort second step as a pgvector text
 *    literal (`$1::vector`), mirroring scripts/embed-atoms.ts. A failure (column
 *    absent, dimension mismatch) is non-fatal: the row still lands and is
 *    backfillable. We deliberately do NOT call the service's `embedAtom`, which
 *    reads a `description` column that does not exist on this table.
 *  - every atom's text passes the §14 unsupported-claim linter before it is
 *    written; a claim the evidence cannot support never enters retrieval.
 *
 * @module server/services/clinical-regulatory-evidence/retrieval-atoms
 */

import { pool } from '../../db';
import { detectUnsupportedClaims } from './governance';
import { listFindings, listOutcomes, listDesignLessons } from './evidence-spine.service';
import type {
  RegulatoryFinding, RegulatoryOutcome, DesignLesson,
  StudyDesignFeature, StudyResultObservation,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Single source_type marker so every CRE atom is identifiable and idempotency-keyable. */
export const CRE_ATOM_SOURCE_TYPE = 'clinical_regulatory_evidence';

/** The nine CRE retrieval atom types (lower_snake_case corpus convention). */
export const CRE_ATOM_TYPES = [
  'csr_design_feature', 'csr_result_observation', 'csr_safety_signal', 'csr_execution_limitation',
  'fda_regulatory_finding', 'fda_requested_action', 'regulatory_outcome',
  'design_lesson', 'contradictory_precedent',
] as const;
export type CreAtomType = (typeof CRE_ATOM_TYPES)[number];

/** The base table's content column is bounded by the writers at 16 000 chars. */
const MAX_CONTENT = 16000;

/** Default embedding model recorded on written vectors (the 1536-d corpus reality). */
const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

// ─── Shapes ───────────────────────────────────────────────────────────────────

/** A source-agnostic atom to persist. Projections emit these; persistence writes them. */
export interface AtomDraft {
  atomType: CreAtomType;
  /** Stable business key → lumen_data_atoms.source_id; drives idempotency. */
  sourceRef: string;
  title: string;
  content: string;
  tags: string[];
  structuredData: Record<string, unknown>;
  /** 0..1 extraction/derivation/verification confidence — never a prediction. */
  confidence: number;
}

/** text → embedding vector. Injectable so tests avoid the network; default hits the gateway. */
export type EmbedFn = (text: string) => Promise<number[]>;

export interface PersistOutcome {
  id: number | string | null;
  atomType: CreAtomType;
  embedded: boolean;
  /** Set when the atom was intentionally not written (e.g. failed the §14 linter). */
  skipped?: 'unsupported_claim';
}

export interface GenerateResult {
  byType: Record<string, number>;
  total: number;
  embedded: number;
  skippedUnsupported: number;
}

// ─── Small pure helpers ───────────────────────────────────────────────────────

function truncate(s: string): string {
  return s.length > MAX_CONTENT ? s.slice(0, MAX_CONTENT) : s;
}

function clamp01(n: number | null | undefined, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** Render a JS string array as a Postgres text-array literal, escaping quotes/backslashes. */
export function toPgTextArray(tags: string[]): string {
  const clean = tags.filter((t) => t != null && String(t).trim() !== '');
  if (clean.length === 0) return '{}';
  const esc = clean.map((t) => `"${String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${esc.join(',')}}`;
}

/** Render an embedding as the pgvector text literal `[a,b,c]` (matches scripts/embed-atoms.ts). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * A short, stable slug for a business-key discriminator. Two atoms that share the
 * same (studyId, featureKey/endpoint, sourceId) but differ in value MUST get
 * distinct keys — otherwise delete-then-insert would collapse them (silent loss).
 * Same value → same slug → still idempotent on re-run.
 */
export function keySlug(value: unknown, max = 48): string {
  const s = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (s || 'na').slice(0, max);
}

/** Assemble content from labelled parts, dropping empties, one per line. */
function composeContent(parts: Array<[string, unknown]>): string {
  return parts
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([label, v]) => `${label}: ${String(v).trim()}`)
    .join('\n');
}

// ─── Projections (pure; exported for unit testing) ─────────────────────────────

/** FDA regulatory finding → a finding atom, plus a requested-action atom when present. */
export function projectFinding(f: RegulatoryFinding): AtomDraft[] {
  const drafts: AtomDraft[] = [];
  const headline = f.normalizedSummary || f.findingText;
  const commonStructured = {
    findingId: f.id, sourceId: f.sourceId, applicationIdentifier: f.applicationIdentifier,
    findingDomain: f.findingDomain, findingCategory: f.findingCategory,
    fdaReviewDiscipline: f.fdaReviewDiscipline, severity: f.severity,
    affectedCtdSection: f.affectedCtdSection, affectedIchE3Section: f.affectedIchE3Section,
    affectedProtocolElement: f.affectedProtocolElement, affectedStudyDesignFeature: f.affectedStudyDesignFeature,
    explicitOrInferred: f.explicitOrInferred, verificationStatus: f.verificationStatus,
    relatedStudyIds: f.relatedStudyIds, sourcePage: f.sourcePage,
  };
  const tags = ['fda', 'regulatory_finding', f.findingDomain, f.findingCategory]
    .filter((t): t is string => Boolean(t));

  if (headline) {
    drafts.push({
      atomType: 'fda_regulatory_finding',
      sourceRef: `finding:${f.id}`,
      title: `FDA finding (${f.findingDomain ?? 'general'}): ${truncateTitle(headline)}`,
      content: composeContent([
        ['Finding', f.normalizedSummary],
        ['Detail', f.findingText],
        ['Domain', f.findingDomain],
        ['Category', f.findingCategory],
        ['Review discipline', f.fdaReviewDiscipline],
        ['Application', f.applicationIdentifier],
        ['Affected CTD section', f.affectedCtdSection],
        ['Affected ICH E3 section', f.affectedIchE3Section],
        ['Affected study-design feature', f.affectedStudyDesignFeature],
        ['Source page', f.sourcePage],
        ['Basis', f.explicitOrInferred],
      ]),
      tags,
      structuredData: commonStructured,
      confidence: clamp01(f.extractionConfidence, 0.6),
    });
  }

  if (f.requestedAction && f.requestedAction.trim() !== '') {
    drafts.push({
      atomType: 'fda_requested_action',
      sourceRef: `finding:${f.id}:action`,
      title: `FDA requested action (${f.findingDomain ?? 'general'}): ${truncateTitle(f.requestedAction)}`,
      content: composeContent([
        ['Requested action', f.requestedAction],
        ['In response to', headline],
        ['Domain', f.findingDomain],
        ['Application', f.applicationIdentifier],
      ]),
      tags: [...tags, 'requested_action'],
      structuredData: { ...commonStructured, requestedAction: f.requestedAction },
      confidence: clamp01(f.extractionConfidence, 0.6),
    });
  }

  return drafts;
}

/** Normalized regulatory outcome → a factual record atom (never a prediction). */
export function projectOutcome(o: RegulatoryOutcome): AtomDraft[] {
  const title = `Regulatory outcome: ${o.outcomeType}${o.applicationIdentifier ? ` — ${o.applicationIdentifier}` : ''}`;
  return [{
    atomType: 'regulatory_outcome',
    sourceRef: `outcome:${o.id}`,
    title,
    content: composeContent([
      ['Outcome', o.outcomeType],
      ['Application', o.applicationIdentifier],
      ['Outcome date', o.outcomeDate],
      ['Approval date', o.approvalDate],
      ['Time to resolution (days)', o.timeToResolutionDays],
      ['Note', o.evidenceNote],
      ['Record status', o.verificationStatus],
    ]) + '\nThis is a record of what occurred, not a prediction of any future decision.',
    tags: ['regulatory_outcome', o.outcomeType].filter((t): t is string => Boolean(t)),
    structuredData: {
      outcomeId: o.id, sourceId: o.sourceId, applicationIdentifier: o.applicationIdentifier,
      outcomeType: o.outcomeType, outcomeDate: o.outcomeDate, approvalDate: o.approvalDate,
      timeToResolutionDays: o.timeToResolutionDays, verificationStatus: o.verificationStatus,
      linkedPrecedentId: o.linkedPrecedentId, linkedSubmissionOutcomeId: o.linkedSubmissionOutcomeId,
    },
    confidence: o.verificationStatus === 'verified' ? 0.9 : 0.6,
  }];
}

/**
 * Human-approved design lesson → a lesson atom, plus a contradictory-precedent
 * atom when the lesson carries contradicting sources. Unreviewed or rejected
 * lessons are NEVER atomized (they must not enter retrieval).
 */
export function projectDesignLesson(l: DesignLesson): AtomDraft[] {
  if (l.humanReviewStatus !== 'approved') return [];
  const drafts: AtomDraft[] = [];
  const applicability = composeContent([
    ['Population', l.applicablePopulation],
    ['Phase', l.applicablePhase],
    ['Modality', l.modality],
    ['Endpoint type', l.endpointType],
  ]);
  const tags = ['design_lesson', l.modality, l.applicablePhase, l.endpointType]
    .filter((t): t is string => Boolean(t));

  drafts.push({
    atomType: 'design_lesson',
    sourceRef: `design_lesson:${l.id}`,
    title: `Design lesson: ${truncateTitle(l.lessonStatement)}`,
    content: composeContent([
      ['Lesson', l.lessonStatement],
      ['Applicability', applicability || null],
      ['Supporting sources', l.supportingSourceIds?.length ?? 0],
      ['Contradicting sources', l.contradictingSourceIds?.length ?? 0],
      ['Minimum evidence count', l.minimumEvidenceCount],
      ['Evidence quality score', l.evidenceQualityScore],
      ['Derivation', l.derivationMethod],
      ['Model version', l.modelVersion],
    ]) + '\nThis is precedent-derived guidance, not a prediction of acceptance.',
    tags,
    structuredData: {
      lessonId: l.id, applicablePopulation: l.applicablePopulation, applicablePhase: l.applicablePhase,
      modality: l.modality, endpointType: l.endpointType,
      supportingSourceIds: l.supportingSourceIds, contradictingSourceIds: l.contradictingSourceIds,
      minimumEvidenceCount: l.minimumEvidenceCount, evidenceQualityScore: l.evidenceQualityScore,
      derivationMethod: l.derivationMethod, modelVersion: l.modelVersion,
    },
    confidence: clamp01(l.evidenceQualityScore, 0.5),
  });

  if ((l.contradictingSourceIds?.length ?? 0) > 0) {
    drafts.push({
      atomType: 'contradictory_precedent',
      sourceRef: `design_lesson:${l.id}:contradiction`,
      title: `Contradictory precedent for: ${truncateTitle(l.lessonStatement)}`,
      content: composeContent([
        ['Lesson', l.lessonStatement],
        ['Contradicting source count', l.contradictingSourceIds.length],
        ['Contradicting source ids', l.contradictingSourceIds.join(', ')],
        ['Supporting source count', l.supportingSourceIds?.length ?? 0],
      ]) + '\nContradicting precedent exists; weigh both directions before relying on this lesson.',
      tags: [...tags, 'contradictory_precedent'],
      structuredData: {
        lessonId: l.id, contradictingSourceIds: l.contradictingSourceIds,
        supportingSourceIds: l.supportingSourceIds,
      },
      confidence: clamp01(l.evidenceQualityScore, 0.5),
    });
  }

  return drafts;
}

/** CSR-derived study-design feature → a design-feature atom. */
export function projectDesignFeature(feat: StudyDesignFeature, ctx: { sourceId?: number | null; indication?: string | null; phase?: string | null } = {}): AtomDraft[] {
  if (feat.value == null || String(feat.value).trim() === '') return [];
  const sourceId = feat.sourceId ?? ctx.sourceId ?? null;
  return [{
    atomType: 'csr_design_feature',
    // include a value slug so repeated feature keys (e.g. two secondary_endpoints) don't collide
    sourceRef: `design_feature:${feat.studyId ?? 'na'}:${feat.featureKey}:${sourceId ?? 'na'}:${keySlug(feat.value)}`,
    title: `Study-design feature: ${feat.featureKey} = ${truncateTitle(String(feat.value))}`,
    content: composeContent([
      ['Feature', feat.featureKey],
      ['Value', feat.value],
      ['Indication', ctx.indication],
      ['Phase', ctx.phase],
      ['Source location', feat.sourceLocation],
      ['Extraction method', feat.extractionMethod],
      ['Basis', feat.explicitOrInferred],
    ]),
    tags: ['csr', 'design_feature', feat.featureKey].filter((t): t is string => Boolean(t)),
    structuredData: {
      studyId: feat.studyId, sourceId, featureKey: feat.featureKey, value: feat.value,
      sourceLocation: feat.sourceLocation, extractionMethod: feat.extractionMethod,
      explicitOrInferred: feat.explicitOrInferred, verificationStatus: feat.verificationStatus,
    },
    confidence: clamp01(feat.extractionConfidence, feat.explicitOrInferred === 'explicit' ? 0.9 : 0.5),
  }];
}

/**
 * CSR-derived result observation → a result-observation atom (or a safety-signal
 * atom when the endpoint role is safety), plus an execution-limitation atom when
 * the observation records missingness.
 */
export function projectResultObservation(obs: StudyResultObservation, ctx: { sourceId?: number | null; indication?: string | null } = {}): AtomDraft[] {
  const drafts: AtomDraft[] = [];
  const isSafety = (obs.endpointRole ?? '').toLowerCase() === 'safety';
  const sourceId = ctx.sourceId ?? null;
  const baseStructured = {
    studyId: obs.studyId, sourceId, endpoint: obs.endpoint, endpointRole: obs.endpointRole,
    estimand: obs.estimand, analysisPopulation: obs.analysisPopulation, effectMeasure: obs.effectMeasure,
    effectValue: obs.effectValue, standardError: obs.standardError, ciLower: obs.ciLower, ciUpper: obs.ciUpper,
    pValue: obs.pValue, directionOfBenefit: obs.directionOfBenefit, timepoint: obs.timepoint,
    sampleSize: obs.sampleSize, missingness: obs.missingness, subgroup: obs.subgroup,
    multiplicityStatus: obs.multiplicityStatus, sourceLocation: obs.sourceLocation,
  };
  const content = composeContent([
    ['Endpoint', obs.endpoint],
    ['Role', obs.endpointRole],
    ['Analysis population', obs.analysisPopulation],
    ['Effect measure', obs.effectMeasure],
    ['Effect value', obs.effectValue],
    ['95% CI', obs.ciLower != null && obs.ciUpper != null ? `${obs.ciLower} to ${obs.ciUpper}` : null],
    ['p-value', obs.pValue],
    ['Direction of benefit', obs.directionOfBenefit],
    ['Timepoint', obs.timepoint],
    ['Sample size', obs.sampleSize],
    ['Multiplicity', obs.multiplicityStatus],
    ['Indication', ctx.indication],
    ['Source location', obs.sourceLocation],
  ]);

  // discriminate by source location / effect so multiple observations that the
  // extractor labels with the same endpoint (e.g. 'primary') don't collide.
  const baseRef = `result_observation:${obs.studyId ?? 'na'}:${keySlug(obs.endpoint)}:${sourceId ?? 'na'}:${keySlug(obs.sourceLocation ?? obs.effectMeasure)}`;
  drafts.push({
    atomType: isSafety ? 'csr_safety_signal' : 'csr_result_observation',
    sourceRef: baseRef,
    title: `${isSafety ? 'Safety signal' : 'Result'}: ${truncateTitle(obs.endpoint)}`,
    content,
    tags: ['csr', isSafety ? 'safety_signal' : 'result_observation', obs.endpointRole].filter((t): t is string => Boolean(t)),
    structuredData: baseStructured,
    confidence: 0.7,
  });

  if (obs.missingness != null && Number(obs.missingness) > 0) {
    drafts.push({
      atomType: 'csr_execution_limitation',
      sourceRef: `${baseRef}:limitation`,
      title: `Execution limitation: missingness on ${truncateTitle(obs.endpoint)}`,
      content: composeContent([
        ['Limitation', 'Missing data recorded for this endpoint'],
        ['Endpoint', obs.endpoint],
        ['Missingness', obs.missingness],
        ['Analysis population', obs.analysisPopulation],
        ['Source location', obs.sourceLocation],
      ]),
      tags: ['csr', 'execution_limitation', 'missingness'],
      structuredData: { ...baseStructured, limitationType: 'missingness' },
      confidence: 0.7,
    });
  }

  return drafts;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/** Lazily build the gateway-backed embedder (1536-d text-embedding-3-small). */
function makeDefaultEmbed(): EmbedFn {
  return async (text: string) => {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const svc = getEmbeddingService(pool);
    const r = await svc.embed(text);
    return r.embedding;
  };
}

/**
 * Persist one atom draft idempotently under `orgId`. Delete-then-insert on the
 * (org, source_type, source_id, atom_type) business key, then a best-effort
 * embedding write. Returns what happened; embedding failure is non-fatal.
 */
export async function persistDraft(orgId: number, draft: AtomDraft, embed: EmbedFn | null, embedModel = DEFAULT_EMBED_MODEL): Promise<PersistOutcome> {
  // §14 gate: never let an unsupported claim into the retrieval corpus.
  if (detectUnsupportedClaims(`${draft.title}\n${draft.content}`).length > 0) {
    return { id: null, atomType: draft.atomType, embedded: false, skipped: 'unsupported_claim' };
  }
  const content = truncate(draft.content);
  await pool.query(
    `DELETE FROM lumen_data_atoms
       WHERE organization_id = $1 AND source_type = $2 AND source_id = $3 AND atom_type = $4`,
    [orgId, CRE_ATOM_SOURCE_TYPE, draft.sourceRef, draft.atomType],
  );
  const ins = await pool.query(
    `INSERT INTO lumen_data_atoms
       (organization_id, source_type, source_id, atom_type, title, content, structured_data, tags, confidence, status)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::jsonb,'{}'::jsonb),$8,$9,'active')
     RETURNING id`,
    [
      orgId, CRE_ATOM_SOURCE_TYPE, draft.sourceRef, draft.atomType, draft.title, content,
      JSON.stringify(draft.structuredData ?? {}), toPgTextArray(draft.tags), clamp01(draft.confidence, 0.6),
    ],
  );
  const id = (ins.rows[0] as { id: number | string }).id;

  if (!embed) return { id, atomType: draft.atomType, embedded: false };
  try {
    const vec = await embed(`${draft.title}\n\n${content}`);
    if (Array.isArray(vec) && vec.length > 0) {
      await pool.query(
        `UPDATE lumen_data_atoms
           SET embedding = $1::vector, embedding_model = $2, embedding_updated_at = NOW()
         WHERE id = $3`,
        [toVectorLiteral(vec), embedModel, id],
      );
      return { id, atomType: draft.atomType, embedded: true };
    }
  } catch {
    // Non-fatal (mirrors the codebase's best-effort embedding): the row is written
    // and remains backfillable by scripts/embed-atoms.ts.
  }
  return { id, atomType: draft.atomType, embedded: false };
}

function emptyResult(): GenerateResult {
  return { byType: {}, total: 0, embedded: 0, skippedUnsupported: 0 };
}

async function persistAll(orgId: number, drafts: AtomDraft[], embed: EmbedFn | null, acc: GenerateResult): Promise<void> {
  for (const d of drafts) {
    const r = await persistDraft(orgId, d, embed);
    if (r.skipped === 'unsupported_claim') { acc.skippedUnsupported += 1; continue; }
    acc.total += 1;
    acc.byType[d.atomType] = (acc.byType[d.atomType] ?? 0) + 1;
    if (r.embedded) acc.embedded += 1;
  }
}

/**
 * Persist a batch of CSR-derived drafts (design features / result observations)
 * for one CSR source. Fed by the CSR adapter at ingest time; the projections are
 * the pure functions above.
 */
export async function persistCsrDerivedAtoms(orgId: number, drafts: AtomDraft[], opts: { embed?: EmbedFn | null } = {}): Promise<GenerateResult> {
  const embed = opts.embed === undefined ? makeDefaultEmbed() : opts.embed;
  const acc = emptyResult();
  await persistAll(orgId, drafts, embed, acc);
  return acc;
}

/**
 * Materialize retrieval atoms for every CRE-native entity VISIBLE to `orgId`
 * (its own tenant-private evidence plus the shared global-public corpus), under
 * `orgId`. Idempotent: safe to re-run as evidence accrues. CSR-derived atoms are
 * produced separately (persistCsrDerivedAtoms) because they require the CSR corpus.
 *
 * @param opts.embed  injectable embedder; omit for the gateway default, pass null to skip embedding.
 */
export async function generateAtomsForOrg(orgId: number, opts: { embed?: EmbedFn | null; limit?: number } = {}): Promise<GenerateResult> {
  const embed = opts.embed === undefined ? makeDefaultEmbed() : opts.embed;
  const acc = emptyResult();

  const findings = await listFindings(orgId, { limit: opts.limit });
  for (const f of findings) await persistAll(orgId, projectFinding(f), embed, acc);

  const outcomes = await listOutcomes(orgId, { limit: opts.limit });
  for (const o of outcomes) await persistAll(orgId, projectOutcome(o), embed, acc);

  // Design lessons: only human-approved ones are eligible for retrieval.
  const lessons = await listDesignLessons(orgId, { humanReviewStatus: 'approved', limit: opts.limit });
  for (const l of lessons) await persistAll(orgId, projectDesignLesson(l), embed, acc);

  return acc;
}

/** How many CRE atoms exist for an org (observability / tests). */
export async function countCreAtoms(orgId: number, atomType?: CreAtomType): Promise<number> {
  const args: unknown[] = [orgId, CRE_ATOM_SOURCE_TYPE];
  let sql = `SELECT count(*)::int AS n FROM lumen_data_atoms WHERE organization_id = $1 AND source_type = $2`;
  if (atomType) { args.push(atomType); sql += ` AND atom_type = $3`; }
  const { rows } = await pool.query(sql, args);
  return (rows[0] as { n: number }).n;
}

// ─── internal ─────────────────────────────────────────────────────────────────

function truncateTitle(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}
