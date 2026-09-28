/**
 * Bidirectional sentence-level citation engine (Feature 2.1).
 *
 * Decomposes a generated artifact into sentences (claims), runs each claim
 * against the project's full artifact set via the advanced RAG pipeline,
 * classifies the relationship of every retrieved passage as
 *   supports | contradicts | gap
 * and persists the result as the artifact's citations JSONB column +
 * an immutable run row in ana_artifact_citation_runs.
 *
 * What "sentence-level" means here:
 *   - We use the existing regulatory-aware sentence splitter
 *     (sentenceTraceabilityService.splitDocumentIntoSentences) so abbreviations
 *     like "U.S.", "ICH", "Fig.", and decimal numbers don't fracture sentences.
 *   - Each sentence carries its char offsets in the artifact content so the
 *     UI can render inline badges at the exact span.
 *   - For each sentence we surface up to TOP_K matched passages, each
 *     classified individually — so a single sentence can have one supports +
 *     one contradicts citation when two dossier sources disagree.
 *
 * Relationship classification is a hybrid:
 *   1. Verifier scoring (deterministic: low relevance, ungrounded numbers,
 *      thin support) downgrades or rejects matches.
 *   2. A lexical contradiction probe (negation / disagreement cues in the
 *      passage relative to the claim) flips supports → contradicts.
 *   3. When zero passages survive, the sentence is a gap. The gap-classifier
 *      then resolves severity / readiness delta against the artifact's
 *      ctd_section. No content is fabricated — gaps are returned as
 *      structured metadata, never as filler text.
 *
 * The persisted shape is what Feature 1 (submission-chat), Feature 4
 * (Shadow Review readiness), and Feature 5 (export) all read.
 *
 * @module server/services/ana/citation-engine
 */
import crypto from 'node:crypto';
// Use the lazy accessor instead of importing `pool` from db.js — db.js calls
// getPool() at module load and throws when no DATABASE_URL is set. Pure
// helpers (splitArtifactIntoSentences) shouldn't pay that cost; only the
// DB-touching functions resolve the pool when called.
import { getPool } from '../../db/runtime.js';
import { getRAGPipeline } from '../advancedRAGPipeline.js';
import { verifyClaim, type VerifierFlag } from '../../routes/chat/verifier.js';
import {
  classifyGap,
  type GapClassification,
} from './gap-classifier.js';
import { emit as emitMetric } from './submission-chat-metrics.js';

// ─── Tunables ─────────────────────────────────────────────────────────
const RETRIEVAL_TOP_K = parseInt(
  process.env.ANA_CITATION_TOP_K ?? '6',
  10
);
const RETRIEVAL_THRESHOLD = parseFloat(
  process.env.ANA_CITATION_THRESHOLD ?? '0.55'
);
const PER_SENTENCE_MAX_SOURCES = parseInt(
  process.env.ANA_CITATION_MAX_SOURCES_PER_SENTENCE ?? '4',
  10
);
const SENTENCE_MIN_CHARS = parseInt(
  process.env.ANA_CITATION_SENTENCE_MIN_CHARS ?? '12',
  10
);

// ─── Types ───────────────────────────────────────────────────────────
export type CitationStatus = 'supported' | 'contradicted' | 'gap';
export type CitationRelationship = 'supports' | 'contradicts' | 'gap';

export interface CitationSource {
  artifactId: string;
  sectionCode: string | null;
  pageRef: string | null;
  passageSnippet: string;
  relevanceScore: number;
  relationship: CitationRelationship;
  /** Optional: chunk id that produced this source — for trace. */
  chunkId?: string;
}

export interface SentenceCitation {
  sentenceIndex: number;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  text: string;
  contentHash: string;
  sources: CitationSource[];
  status: CitationStatus;
  /** Filled in only when status='gap' AND a gap-rule matched. */
  gap: GapClassification | null;
  flags: VerifierFlag[];
}

export interface CitationRunStats {
  totalSentences: number;
  supportedCount: number;
  contradictedCount: number;
  gapCount: number;
  totalReadinessDelta: number;
  filingBlocked: boolean;
}

export interface CitationRunResult {
  runId: string;
  artifactId: string;
  artifactPk: number;
  organizationId: number;
  projectId: number;
  ctdSection: string | null;
  artifactContentHash: string;
  citations: SentenceCitation[];
  stats: CitationRunStats;
  metadata: {
    strategy: string;
    chunksRetrievedTotal: number;
    /** Sentences whose evidence retrieval failed, so were not checked. */
    retrievalFailures?: number;
    latencyMs: number;
    timedOut?: boolean;
  };
}

interface ArtifactRow {
  id: number;
  artifact_id: string;
  project_id: number;
  organization_id: number;
  ctd_section: string | null;
  content: string;
  content_hash: string | null;
}

// ─── Sentence splitter ────────────────────────────────────────────────
//
// Mirrors the regulatory-aware splitter in sentenceTraceabilityService but
// returns offsets relative to the full content + a paragraph index, which
// is what we persist on each citation. Kept inline so the citation engine
// has no module-cycle on the traceability service.

interface ParsedSentence {
  sentenceIndex: number;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  text: string;
}

const PROTECT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|Inc|Corp|Ltd|Co|vs|etc|approx)\./gi, '$1\u0000'],
  [/\b(e\.g|i\.e|cf|al|Fig|Tab|Ref|Sec|Vol|No|Rev)\./gi, '$1\u0000'],
  [/\b(U\.S|E\.U|ICH|FDA|EMA|WHO)\./gi, '$1\u0000'],
  [/(\d+)\.(\d+)/g, '$1\u0001$2'],
  [/([A-Z])\.([A-Z])\./g, '$1\u0000$2\u0000'],
];

function protectAbbreviations(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PROTECT_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function unprotect(text: string): string {
  return text.replace(/\u0000/g, '.').replace(/\u0001/g, '.');
}

export function splitArtifactIntoSentences(content: string): ParsedSentence[] {
  if (!content) return [];
  const sentences: ParsedSentence[] = [];
  const paragraphs = content.split(/\n\s*\n+/);
  let cursor = 0;
  let sentIdx = 0;

  paragraphs.forEach((para, paraIdx) => {
    if (!para.trim()) {
      cursor += para.length + 2; // approximate paragraph separator
      return;
    }
    // Locate the paragraph's true offset to keep char positions accurate.
    const paraStart = content.indexOf(para, cursor);
    const safeStart = paraStart === -1 ? cursor : paraStart;

    const protectedPara = protectAbbreviations(para);
    const rawSplits = protectedPara.split(/(?<=[.!?])\s+(?=[A-Z\d"'\(\[])/);
    let localOffset = 0;
    for (const protectedSent of rawSplits) {
      const sentText = unprotect(protectedSent).trim();
      if (sentText.length < SENTENCE_MIN_CHARS) {
        localOffset += protectedSent.length;
        continue;
      }
      const idxInPara = para.indexOf(sentText, localOffset);
      if (idxInPara === -1) {
        localOffset += protectedSent.length;
        continue;
      }
      const charStart = safeStart + idxInPara;
      const charEnd = charStart + sentText.length;
      sentences.push({
        sentenceIndex: sentIdx++,
        paragraphIndex: paraIdx,
        charStart,
        charEnd,
        text: sentText,
      });
      localOffset = idxInPara + sentText.length;
    }
    cursor = safeStart + para.length;
  });

  return sentences;
}

// ─── Relationship classification ──────────────────────────────────────

const CONTRADICTION_CUES = [
  'however',
  'but ',
  'in contrast',
  'contrary to',
  'disagrees',
  'inconsistent',
  'differs',
  'rather than',
  'no evidence of',
  'did not',
  'failed to',
];

/**
 * Lexical contradiction probe. Looks for negation / disagreement cues in
 * the retrieved passage that, in the context of a positive claim, mean the
 * passage is contradicting rather than supporting.
 *
 * Deliberately conservative: only flips supports → contradicts when there's
 * a strong cue near a numeric or key-term overlap.
 */
function detectContradiction(claim: string, passage: string): boolean {
  const c = claim.toLowerCase();
  const p = passage.toLowerCase();
  const hasCue = CONTRADICTION_CUES.some(cue => p.includes(cue));
  if (!hasCue) return false;
  // If the claim has numbers and the passage mentions different numbers
  // around a contradiction cue, that's a strong contradiction signal.
  const claimNums: string[] = c.match(/\b\d+(?:[\.,]\d+)?\b/g) ?? [];
  const passageNums: string[] = p.match(/\b\d+(?:[\.,]\d+)?\b/g) ?? [];
  if (
    claimNums.length > 0 &&
    passageNums.length > 0 &&
    claimNums.some(n => !passageNums.includes(n))
  ) {
    return true;
  }
  // Fallback: cue alone is enough only when passage shares ≥2 4-char tokens
  // with the claim (so we know it's about the same topic).
  const claimTokens = new Set(
    c.match(/[a-z]{4,}/g)?.slice(0, 40) ?? []
  );
  let overlap = 0;
  for (const tok of p.match(/[a-z]{4,}/g) || []) {
    if (claimTokens.has(tok)) overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

// ─── Project-artifact metadata enrichment ─────────────────────────────

interface ProjectArtifactMeta {
  artifact_id: string;
  ctd_section: string | null;
  title: string;
}

async function loadProjectArtifactsMeta(
  projectId: number,
  organizationId: number
): Promise<Map<string, ProjectArtifactMeta>> {
  const { rows } = await getPool().query(
    `SELECT artifact_id, ctd_section, title
       FROM concept2cure_artifacts
      WHERE project_id = $1
        AND organization_id = $2`,
    [projectId, organizationId]
  );
  const map = new Map<string, ProjectArtifactMeta>();
  for (const r of rows) map.set(r.artifact_id, r as ProjectArtifactMeta);
  return map;
}

async function lookupAtomMetadata(
  atomIds: string[]
): Promise<Map<string, { sourceType: string | null; sourceId: string | null; metadata: any }>> {
  const result = new Map<
    string,
    { sourceType: string | null; sourceId: string | null; metadata: any }
  >();
  if (atomIds.length === 0) return result;
  try {
    const { rows } = await getPool().query(
      `SELECT id, source_type, source_id, metadata
         FROM lumen_data_atoms
        WHERE id = ANY($1::uuid[])`,
      [atomIds]
    );
    for (const r of rows) {
      result.set(r.id, {
        sourceType: r.source_type,
        sourceId: r.source_id,
        metadata: r.metadata,
      });
    }
  } catch (err: any) {
    if (err?.code !== '42P01') {
      console.warn('[citation-engine] atom metadata lookup failed:', err?.message);
    }
  }
  return result;
}

// ─── Core run ────────────────────────────────────────────────────────

async function loadArtifact(
  artifactId: string,
  organizationId: number
): Promise<ArtifactRow> {
  const { rows } = await getPool().query(
    `SELECT id, artifact_id, project_id, organization_id, ctd_section, content, content_hash
       FROM concept2cure_artifacts
      WHERE artifact_id = $1
        AND organization_id = $2
      LIMIT 1`,
    [artifactId, organizationId]
  );
  if (rows.length === 0) {
    const err = new Error(`Artifact not found: ${artifactId}`);
    (err as any).code = 'ARTIFACT_NOT_FOUND';
    throw err;
  }
  return rows[0] as ArtifactRow;
}

export interface RunCitationEngineOptions {
  /** When true, persist the result to the artifact + audit table. Default true. */
  persist?: boolean;
  /** Override the active artifact's ctd_section (e.g. when content is a fresh draft). */
  ctdSectionOverride?: string | null;
  /** Override organization uuid for project-scoped retrieval. Required for retrieval to work. */
  organizationUuid?: string;
  /** Optional userId for run audit. */
  userId?: number | null;
  /** Cap on the total chunks attributed across the artifact (cost guard). Default 200. */
  totalChunksCap?: number;
}

/**
 * Run the citation engine for an artifact. Returns the structured result;
 * when persist=true, also writes citations JSONB on the artifact and an
 * immutable row in ana_artifact_citation_runs.
 *
 * Tenant-scoped: the artifact load already enforces organization match.
 */
export async function runCitationEngine(
  artifactId: string,
  organizationId: number,
  options: RunCitationEngineOptions = {}
): Promise<CitationRunResult> {
  const startedAt = Date.now();
  const persist = options.persist !== false;
  const totalChunksCap = options.totalChunksCap ?? 200;

  const artifact = await loadArtifact(artifactId, organizationId);
  const ctdSection = options.ctdSectionOverride ?? artifact.ctd_section;
  const sentences = splitArtifactIntoSentences(artifact.content || '');
  const projectArtifacts = await loadProjectArtifactsMeta(
    artifact.project_id,
    artifact.organization_id
  );

  const orgUuid = options.organizationUuid;
  const validOrgUuid =
    orgUuid && /^[0-9a-f-]{36}$/i.test(orgUuid) ? orgUuid : undefined;
  const ragPipeline = validOrgUuid ? getRAGPipeline(getPool()) : null;
  const artifactScope = validOrgUuid
    ? { projectId: artifact.project_id, organizationUuid: validOrgUuid }
    : undefined;

  const citations: SentenceCitation[] = [];
  let chunksRetrievedTotal = 0;
  let retrievalFailures = 0;
  let timedOut = false;

  for (const s of sentences) {
    if (chunksRetrievedTotal >= totalChunksCap) {
      timedOut = true;
      // Remaining sentences are still recorded — without retrieval — so the
      // artifact has a complete sentence index. Their status falls back to
      // gap (no source returned), and the gap-classifier still applies.
    }
    const contentHash = crypto
      .createHash('sha256')
      .update(s.text)
      .digest('hex')
      .slice(0, 32);

    let sources: CitationSource[] = [];
    const flags: VerifierFlag[] = [];

    if (ragPipeline && artifactScope && !timedOut) {
      try {
        const ctx = await ragPipeline.retrieve(s.text, {
          // Basic strategy + rerank is enough at the per-sentence granularity;
          // HyDE / multi-query would balloon cost on artifacts with hundreds
          // of sentences. The submission-chat path uses 'advanced' for the
          // single user query — different cost profile.
          strategy: 'basic',
          limit: RETRIEVAL_TOP_K,
          threshold: RETRIEVAL_THRESHOLD,
          useReranking: true,
          // The rerank score decides supported vs gap, so it is a governed
          // figure: only an approved model produces it, and a failed rerank
          // fails the sentence rather than scoring it on embeddings alone.
          governedVerdict: true,
          useMmr: false,
          organizationUuid: validOrgUuid,
          artifactScope,
        });
        chunksRetrievedTotal += ctx.documents.length;

        // Resolve atom → artifact / section / page so each citation carries
        // dossier-shaped locators, not opaque chunk ids.
        const atomIds = ctx.documents
          .map(d => d.chunkId || d.id)
          .filter((x): x is string => typeof x === 'string');
        const atomMeta = await lookupAtomMetadata(atomIds);

        const candidateSources: CitationSource[] = ctx.documents.map(d => {
          const id = d.chunkId || d.id;
          const atom = atomMeta.get(id);
          const sourceArtifact =
            atom?.sourceType === 'artifact' && atom.sourceId
              ? projectArtifacts.get(atom.sourceId)
              : undefined;
          const meta = atom?.metadata || {};
          const pageRef =
            typeof meta.page === 'number'
              ? `p.${meta.page}`
              : typeof meta.section === 'string'
                ? meta.section
                : null;
          const passage =
            (d.compressedContent || d.content || '').slice(0, 320) +
            ((d.content || '').length > 320 ? '…' : '');
          // Default to supports; flip to contradicts when the lexical probe fires.
          const relationship: CitationRelationship = detectContradiction(
            s.text,
            d.content || ''
          )
            ? 'contradicts'
            : 'supports';
          return {
            artifactId: sourceArtifact?.artifact_id ?? atom?.sourceId ?? id,
            sectionCode: sourceArtifact?.ctd_section ?? null,
            pageRef,
            passageSnippet: passage,
            relevanceScore: d.finalScore,
            relationship,
            chunkId: id,
          };
        });

        // Run the deterministic verifier across the top candidates so we can
        // either keep them as supports / contradicts or downgrade to gap.
        const scores = candidateSources.map(c => c.relevanceScore);
        const snippets = candidateSources.map(c => c.passageSnippet);
        const { flags: verifierFlags, shouldDowngrade } = verifyClaim(
          s.text,
          scores,
          snippets
        );
        flags.push(...verifierFlags);

        // If the verifier downgrades, drop the supports/contradicts label
        // and treat the sentence as a gap UNLESS at least one citation is
        // already a contradicts (a contradicting source is more important
        // than a noisy support set).
        if (shouldDowngrade && !candidateSources.some(c => c.relationship === 'contradicts')) {
          sources = [];
        } else {
          sources = candidateSources.slice(0, PER_SENTENCE_MAX_SOURCES);
        }
      } catch (err: any) {
        console.warn(
          '[citation-engine] retrieval failed for sentence:',
          err?.message || err
        );
        // Still recorded as a gap (a failure must not read as supported), but
        // flagged, so it is not taken for a finding about the content.
        retrievalFailures += 1;
        flags.push({
          rule: 'RETRIEVAL_FAILED',
          severity: 'downgrade',
          message: 'Evidence retrieval failed for this sentence, so it was not checked. This is not a finding about its content.',
        });
      }
    }

    let status: CitationStatus;
    let gap: GapClassification | null = null;
    if (sources.length === 0) {
      status = 'gap';
      gap = classifyGap(ctdSection, s.text);
    } else if (sources.some(c => c.relationship === 'contradicts')) {
      status = 'contradicted';
    } else {
      status = 'supported';
    }

    citations.push({
      sentenceIndex: s.sentenceIndex,
      paragraphIndex: s.paragraphIndex,
      charStart: s.charStart,
      charEnd: s.charEnd,
      text: s.text,
      contentHash,
      sources,
      status,
      gap,
      flags,
    });
  }

  const stats = computeStats(citations);
  const artifactContentHash = crypto
    .createHash('sha256')
    .update(artifact.content || '')
    .digest('hex');

  const result: CitationRunResult = {
    runId: '', // filled in by persist
    artifactId: artifact.artifact_id,
    artifactPk: artifact.id,
    organizationId: artifact.organization_id,
    projectId: artifact.project_id,
    ctdSection,
    artifactContentHash,
    citations,
    stats,
    metadata: {
      strategy: ragPipeline ? 'basic+rerank (project-scoped)' : 'no-rag (no orgUuid)',
      chunksRetrievedTotal,
      retrievalFailures: retrievalFailures || undefined,
      latencyMs: Date.now() - startedAt,
      timedOut: timedOut || undefined,
    },
  };

  if (persist) {
    result.runId = await persistCitationRun(result, options.userId ?? null);
  }

  // Regression watchdog — compare to the previous run for this artifact.
  // Fires only when the new run is persisted (no run id otherwise) AND a
  // prior run exists. Pure detector lives in citation-regression.ts; we
  // emit a metric event so the OTel exporter / log surface picks it up.
  if (persist && result.runId) {
    try {
      const { rows: priorRows } = await getPool().query(
        `SELECT id FROM ana_artifact_citation_runs
          WHERE artifact_id = $1
            AND organization_id = $2
            AND id <> $3
          ORDER BY created_at DESC
          LIMIT 1`,
        [result.artifactId, result.organizationId, result.runId]
      );
      const priorRunId: string | undefined = priorRows[0]?.id;
      if (priorRunId) {
        const [priorRun, currRun] = await Promise.all([
          getCitationRunById(priorRunId, result.organizationId),
          getCitationRunById(result.runId, result.organizationId),
        ]);
        if (priorRun && currRun) {
          const { detectCitationRegression } = await import(
            './citation-regression.js'
          );
          const regression = detectCitationRegression(priorRun, currRun);
          if (regression.hasRegression) {
            emitMetric({
              name: 'submission_chat.turn',
              threadId: `citation-regression:${result.runId}`,
              artifactId: result.artifactId,
              projectId: result.projectId,
              organizationId: result.organizationId,
              intent: 'general',
              retrievalStrategy: 'basic',
              artifactsInScope: projectArtifacts.size,
              chunksRetrieved: chunksRetrievedTotal,
              historyMessages: 0,
              priorCitations: 0,
              citationCount: regression.regressedSentences.length,
              citationMix: {
                supports: 0,
                contradicts: regression.newContradictions,
                gap: regression.newGaps,
              },
              rewriteEmitted: false,
              proposalId: null,
              claimStatusCounts: null,
              streaming: false,
              model: 'citation-regression',
              provider: 'system',
              latencyMs: 0,
              promptTokens: 0,
              completionTokens: 0,
            });
            console.warn(
              `[citation-engine] regression on artifact ${result.artifactId}: ` +
                `+${regression.newGaps} gaps, +${regression.newContradictions} contradictions, ` +
                `lostSupports=${regression.lostSupports}, ` +
                `filingBlockedRegression=${regression.filingBlockedRegression}, ` +
                `readinessDeltaChange=${regression.readinessDeltaRegression}`
            );
          }
        }
      }
    } catch (err: any) {
      // Watchdog failure is non-fatal — the run itself is durable.
      console.warn(
        '[citation-engine] regression watchdog failed (non-fatal):',
        err?.message || err
      );
    }
  }

  emitMetric({
    name: 'submission_chat.turn',
    threadId: `citation-engine:${result.runId || 'no-persist'}`,
    artifactId: result.artifactId,
    projectId: result.projectId,
    organizationId: result.organizationId,
    intent: 'general',
    retrievalStrategy: ragPipeline ? 'basic' : 'failed',
    artifactsInScope: projectArtifacts.size,
    chunksRetrieved: chunksRetrievedTotal,
    historyMessages: 0,
    priorCitations: 0,
    citationCount: stats.supportedCount + stats.contradictedCount,
    citationMix: {
      supports: stats.supportedCount,
      contradicts: stats.contradictedCount,
      gap: stats.gapCount,
    },
    rewriteEmitted: false,
    proposalId: null,
    claimStatusCounts: null,
    streaming: false,
    model: 'citation-engine',
    provider: 'system',
    latencyMs: result.metadata.latencyMs,
    promptTokens: 0,
    completionTokens: 0,
  });

  return result;
}

function computeStats(citations: SentenceCitation[]): CitationRunStats {
  let supported = 0;
  let contradicted = 0;
  let gap = 0;
  let totalReadinessDelta = 0;
  let filingBlocked = false;
  for (const c of citations) {
    if (c.status === 'supported') supported += 1;
    else if (c.status === 'contradicted') contradicted += 1;
    else {
      gap += 1;
      if (c.gap) {
        totalReadinessDelta += c.gap.readinessDelta;
        if (c.gap.blockingFiling) filingBlocked = true;
      }
    }
  }
  return {
    totalSentences: citations.length,
    supportedCount: supported,
    contradictedCount: contradicted,
    gapCount: gap,
    totalReadinessDelta,
    filingBlocked,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────

async function persistCitationRun(
  result: CitationRunResult,
  createdBy: number | null
): Promise<string> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO ana_artifact_citation_runs (
         artifact_id, artifact_pk, organization_id, project_id, ctd_section,
         artifact_content_hash, total_sentences, supported_count,
         contradicted_count, gap_count, total_readiness_delta, filing_blocked,
         citations, run_metadata, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        result.artifactId,
        result.artifactPk,
        result.organizationId,
        result.projectId,
        result.ctdSection,
        result.artifactContentHash,
        result.stats.totalSentences,
        result.stats.supportedCount,
        result.stats.contradictedCount,
        result.stats.gapCount,
        result.stats.totalReadinessDelta,
        result.stats.filingBlocked,
        JSON.stringify(result.citations),
        JSON.stringify(result.metadata),
        createdBy,
      ]
    );
    const runId = rows[0].id as string;

    await client.query(
      `UPDATE concept2cure_artifacts
          SET citations = $2::jsonb,
              citation_run_id = $3,
              citations_at = NOW()
        WHERE id = $1`,
      [result.artifactPk, JSON.stringify(result.citations), runId]
    );

    await client.query('COMMIT');
    return runId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Read-side ────────────────────────────────────────────────────────

export interface PersistedCitations {
  artifactId: string;
  citationRunId: string | null;
  citationsAt: string | null;
  ctdSection: string | null;
  citations: SentenceCitation[];
  stats: CitationRunStats | null;
  /**
   * True when the artifact's content_hash has changed since the citation
   * run that produced this view — i.e. the citations are out of date and
   * a re-run is needed before they can be trusted in a readiness score.
   * Null when no run has happened yet (no comparison possible).
   */
  isStale: boolean | null;
  /** Hash of the artifact at the time the citations were computed. */
  ranAgainstContentHash: string | null;
  /** Current artifact content hash. */
  currentContentHash: string | null;
}

export async function getCitationsForArtifact(
  artifactId: string,
  organizationId: number
): Promise<PersistedCitations | null> {
  const { rows } = await getPool().query(
    `SELECT a.id, a.artifact_id, a.ctd_section, a.citations, a.citation_run_id, a.citations_at,
            a.content_hash AS current_content_hash,
            r.total_sentences, r.supported_count, r.contradicted_count,
            r.gap_count, r.total_readiness_delta, r.filing_blocked,
            r.artifact_content_hash AS ran_against_content_hash
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.artifact_id = $1
        AND a.organization_id = $2
      LIMIT 1`,
    [artifactId, organizationId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  const citations = Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [];
  const stats: CitationRunStats | null =
    r.total_sentences !== null && r.total_sentences !== undefined
      ? {
          totalSentences: r.total_sentences,
          supportedCount: r.supported_count,
          contradictedCount: r.contradicted_count,
          gapCount: r.gap_count,
          totalReadinessDelta: r.total_readiness_delta,
          filingBlocked: !!r.filing_blocked,
        }
      : null;
  const ranAgainstContentHash: string | null = r.ran_against_content_hash ?? null;
  const currentContentHash: string | null = r.current_content_hash ?? null;
  const isStale: boolean | null =
    ranAgainstContentHash && currentContentHash
      ? ranAgainstContentHash !== currentContentHash
      : null;
  return {
    artifactId: r.artifact_id,
    citationRunId: r.citation_run_id,
    citationsAt: r.citations_at ? new Date(r.citations_at).toISOString() : null,
    ctdSection: r.ctd_section,
    citations,
    stats,
    isStale,
    ranAgainstContentHash,
    currentContentHash,
  };
}

/**
 * Just the gap subset of an artifact's citations, with a severity rollup.
 * Powers the inline "filing blocked" badge and the readiness score.
 */
export interface GapsForArtifact {
  artifactId: string;
  ctdSection: string | null;
  gaps: SentenceCitation[];
  rollup: {
    critical: number;
    major: number;
    minor: number;
    info: number;
    unclassified: number;
    totalReadinessDelta: number;
    filingBlocked: boolean;
  };
  isStale: boolean | null;
}

export async function getGapsForArtifact(
  artifactId: string,
  organizationId: number
): Promise<GapsForArtifact | null> {
  const persisted = await getCitationsForArtifact(artifactId, organizationId);
  if (!persisted) return null;
  const gaps = persisted.citations.filter(c => c.status === 'gap');
  const rollup = {
    critical: 0,
    major: 0,
    minor: 0,
    info: 0,
    unclassified: 0,
    totalReadinessDelta: 0,
    filingBlocked: false,
  };
  for (const g of gaps) {
    if (!g.gap) {
      rollup.unclassified += 1;
      continue;
    }
    rollup[g.gap.severity] += 1;
    rollup.totalReadinessDelta += g.gap.readinessDelta;
    if (g.gap.blockingFiling) rollup.filingBlocked = true;
  }
  return {
    artifactId: persisted.artifactId,
    ctdSection: persisted.ctdSection,
    gaps,
    rollup,
    isStale: persisted.isStale,
  };
}

// ─── Project-level rollup, stale list, and batch ─────────────────────

export interface ProjectArtifactCitationStatus {
  artifactId: string;
  artifactPk: number;
  ctdSection: string | null;
  title: string;
  citationRunId: string | null;
  citationsAt: string | null;
  isStale: boolean | null;
  totalSentences: number | null;
  supportedCount: number | null;
  contradictedCount: number | null;
  gapCount: number | null;
  totalReadinessDelta: number | null;
  filingBlocked: boolean | null;
  hasCitations: boolean;
}

export interface ProjectCitationsRollup {
  projectId: number;
  organizationId: number;
  artifactCount: number;
  artifactsCited: number;
  artifactsStale: number;
  artifactsFilingBlocked: number;
  totals: {
    sentences: number;
    supported: number;
    contradicted: number;
    gaps: number;
    readinessDelta: number; // negative — sum of all artifact deltas
  };
  artifacts: ProjectArtifactCitationStatus[];
}

/**
 * Project-wide citation rollup. One row per artifact in the project, joined
 * to its latest citation run when one exists. Aggregates the readiness
 * impact across the whole project so a dashboard can show "this project
 * loses 84 readiness points to gaps; 3 artifacts block filing".
 *
 * Tenant-scoped: every artifact filtered by organization_id.
 */
export async function getProjectCitationsRollup(
  projectId: number,
  organizationId: number
): Promise<ProjectCitationsRollup> {
  const { rows } = await getPool().query(
    `SELECT a.id AS artifact_pk,
            a.artifact_id,
            a.title,
            a.ctd_section,
            a.content_hash AS current_content_hash,
            a.citation_run_id,
            a.citations_at,
            r.id AS run_id,
            r.artifact_content_hash AS ran_against_content_hash,
            r.total_sentences,
            r.supported_count,
            r.contradicted_count,
            r.gap_count,
            r.total_readiness_delta,
            r.filing_blocked
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.project_id = $1
        AND a.organization_id = $2
      ORDER BY a.ctd_section NULLS LAST, a.updated_at DESC`,
    [projectId, organizationId]
  );

  let artifactsCited = 0;
  let artifactsStale = 0;
  let artifactsFilingBlocked = 0;
  const totals = {
    sentences: 0,
    supported: 0,
    contradicted: 0,
    gaps: 0,
    readinessDelta: 0,
  };

  const artifacts: ProjectArtifactCitationStatus[] = rows.map((r: any) => {
    const hasCitations = !!r.run_id;
    const isStale: boolean | null =
      r.ran_against_content_hash && r.current_content_hash
        ? r.ran_against_content_hash !== r.current_content_hash
        : null;
    if (hasCitations) {
      artifactsCited += 1;
      if (isStale === true) artifactsStale += 1;
      if (r.filing_blocked) artifactsFilingBlocked += 1;
      totals.sentences += Number(r.total_sentences) || 0;
      totals.supported += Number(r.supported_count) || 0;
      totals.contradicted += Number(r.contradicted_count) || 0;
      totals.gaps += Number(r.gap_count) || 0;
      totals.readinessDelta += Number(r.total_readiness_delta) || 0;
    }
    return {
      artifactId: r.artifact_id,
      artifactPk: r.artifact_pk,
      ctdSection: r.ctd_section,
      title: r.title,
      citationRunId: r.citation_run_id,
      citationsAt: r.citations_at ? new Date(r.citations_at).toISOString() : null,
      isStale,
      totalSentences: r.total_sentences ?? null,
      supportedCount: r.supported_count ?? null,
      contradictedCount: r.contradicted_count ?? null,
      gapCount: r.gap_count ?? null,
      totalReadinessDelta: r.total_readiness_delta ?? null,
      filingBlocked: r.filing_blocked ?? null,
      hasCitations,
    };
  });

  return {
    projectId,
    organizationId,
    artifactCount: artifacts.length,
    artifactsCited,
    artifactsStale,
    artifactsFilingBlocked,
    totals,
    artifacts,
  };
}

export interface StaleCitedArtifact {
  artifactId: string;
  artifactPk: number;
  ctdSection: string | null;
  title: string;
  citationsAt: string | null;
  ranAgainstContentHash: string;
  currentContentHash: string;
}

/**
 * List artifacts in a project whose citation run was computed against an
 * older content hash than the artifact's current content. These need a
 * re-cite before their citations can be trusted.
 *
 * Excludes artifacts that have NEVER been cited — those are surfaced via
 * the rollup's `hasCitations: false` and are a separate workflow.
 */
export async function listStaleCitedArtifacts(
  projectId: number,
  organizationId: number
): Promise<StaleCitedArtifact[]> {
  const { rows } = await getPool().query(
    `SELECT a.id AS artifact_pk, a.artifact_id, a.title, a.ctd_section,
            a.citations_at, a.content_hash AS current_content_hash,
            r.artifact_content_hash AS ran_against_content_hash
       FROM concept2cure_artifacts a
       JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.project_id = $1
        AND a.organization_id = $2
        AND a.content_hash IS NOT NULL
        AND r.artifact_content_hash IS NOT NULL
        AND r.artifact_content_hash <> a.content_hash
      ORDER BY a.ctd_section NULLS LAST, a.updated_at DESC`,
    [projectId, organizationId]
  );
  return rows.map((r: any) => ({
    artifactId: r.artifact_id,
    artifactPk: r.artifact_pk,
    ctdSection: r.ctd_section,
    title: r.title,
    citationsAt: r.citations_at ? new Date(r.citations_at).toISOString() : null,
    ranAgainstContentHash: r.ran_against_content_hash,
    currentContentHash: r.current_content_hash,
  }));
}

export interface BatchRunCitationOptions {
  /**
   * When true, only run the engine for artifacts that have never been cited
   * OR whose citations are stale. When false, re-runs every artifact in the
   * project. Default true (cheaper).
   */
  staleOnly?: boolean;
  /**
   * Optional CTD section filter — only re-cite artifacts in matching
   * sections (exact or prefix match using the same rules as gap-classifier).
   */
  ctdSectionPrefix?: string;
  /**
   * Concurrency cap. Higher = faster, but more pressure on the RAG
   * pipeline. Default 2 — sequential-with-overlap is safest.
   */
  concurrency?: number;
  /** Required: the org's vault UUID for project-scoped retrieval. */
  organizationUuid?: string;
  /** User who triggered the batch. Recorded on each run. */
  userId?: number | null;
}

export interface BatchRunCitationResult {
  projectId: number;
  organizationId: number;
  artifactsConsidered: number;
  artifactsRun: number;
  artifactsSkipped: number;
  artifactsFailed: number;
  totalSentences: number;
  totalGaps: number;
  totalReadinessDelta: number;
  filingBlockedAfter: number;
  perArtifact: Array<{
    artifactId: string;
    status: 'ok' | 'skipped' | 'failed';
    runId?: string;
    error?: string;
  }>;
  latencyMs: number;
}

/**
 * Run the citation engine across every artifact in a project. Bounded
 * concurrency, per-artifact failure tolerance — one bad artifact won't
 * fail the batch. Caller decides whether to re-run everything or just the
 * stale set.
 *
 * Cost guard: the engine's own totalChunksCap still applies per artifact,
 * so a 100-artifact project with 50 sentences each won't blow up.
 */
export async function runCitationEngineForProject(
  projectId: number,
  organizationId: number,
  options: BatchRunCitationOptions = {}
): Promise<BatchRunCitationResult> {
  const startedAt = Date.now();
  const staleOnly = options.staleOnly !== false;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 4));

  // Pull candidate artifacts (id + content + ctd_section + content_hash +
  // current_run_artifact_content_hash) so we can filter staleOnly /
  // ctdSectionPrefix in-process.
  const { rows: candidates } = await getPool().query(
    `SELECT a.artifact_id, a.ctd_section, a.content_hash AS current_content_hash,
            a.citation_run_id, r.artifact_content_hash AS ran_against_content_hash
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.project_id = $1
        AND a.organization_id = $2
      ORDER BY a.ctd_section NULLS LAST, a.updated_at DESC`,
    [projectId, organizationId]
  );

  const queue = candidates.filter((r: any) => {
    if (
      options.ctdSectionPrefix &&
      r.ctd_section !== options.ctdSectionPrefix &&
      !(typeof r.ctd_section === 'string' &&
        r.ctd_section.startsWith(options.ctdSectionPrefix + '.'))
    ) {
      return false;
    }
    if (!staleOnly) return true;
    // staleOnly: keep artifacts that have never been cited or whose
    // ran_against_content_hash differs from current_content_hash.
    if (!r.citation_run_id) return true;
    return (
      r.ran_against_content_hash &&
      r.current_content_hash &&
      r.ran_against_content_hash !== r.current_content_hash
    );
  });

  const perArtifact: BatchRunCitationResult['perArtifact'] = [];
  let totalSentences = 0;
  let totalGaps = 0;
  let totalReadinessDelta = 0;
  let filingBlockedAfter = 0;
  let artifactsRun = 0;
  let artifactsFailed = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const myIdx = cursor++;
      const c = queue[myIdx];
      try {
        const result = await runCitationEngine(c.artifact_id, organizationId, {
          persist: true,
          organizationUuid: options.organizationUuid,
          userId: options.userId ?? null,
        });
        perArtifact.push({
          artifactId: c.artifact_id,
          status: 'ok',
          runId: result.runId,
        });
        artifactsRun += 1;
        totalSentences += result.stats.totalSentences;
        totalGaps += result.stats.gapCount;
        totalReadinessDelta += result.stats.totalReadinessDelta;
        if (result.stats.filingBlocked) filingBlockedAfter += 1;
      } catch (err: any) {
        perArtifact.push({
          artifactId: c.artifact_id,
          status: 'failed',
          error: err?.message || String(err),
        });
        artifactsFailed += 1;
        console.warn(
          '[citation-engine batch] failed for artifact',
          c.artifact_id,
          ':',
          err?.message || err
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    projectId,
    organizationId,
    artifactsConsidered: candidates.length,
    artifactsRun,
    artifactsSkipped: queue.length - artifactsRun - artifactsFailed,
    artifactsFailed,
    totalSentences,
    totalGaps,
    totalReadinessDelta,
    filingBlockedAfter,
    perArtifact,
    latencyMs: Date.now() - startedAt,
  };
}

// ─── Run-history inspection ──────────────────────────────────────────

export interface CitationRunSummary {
  runId: string;
  artifactId: string;
  artifactPk: number;
  ctdSection: string | null;
  artifactContentHash: string;
  totalSentences: number;
  supportedCount: number;
  contradictedCount: number;
  gapCount: number;
  totalReadinessDelta: number;
  filingBlocked: boolean;
  createdAt: string;
  createdBy: number | null;
  metadata: unknown;
  /**
   * True when this run is the artifact's currently-active citations run
   * (concept2cure_artifacts.citation_run_id points at it).
   */
  isCurrent: boolean;
}

export interface CitationRunDetail extends CitationRunSummary {
  citations: SentenceCitation[];
}

/**
 * Fetch a specific historical citation run by id, with the full citations
 * array. Tenant-scoped: returns null when the run is cross-tenant or
 * missing.
 */
export async function getCitationRunById(
  runId: string,
  organizationId: number
): Promise<CitationRunDetail | null> {
  const { rows } = await getPool().query(
    `SELECT r.id, r.artifact_id, r.artifact_pk, r.ctd_section,
            r.artifact_content_hash, r.total_sentences, r.supported_count,
            r.contradicted_count, r.gap_count, r.total_readiness_delta,
            r.filing_blocked, r.citations, r.run_metadata, r.created_at,
            r.created_by,
            a.citation_run_id AS current_run_id
       FROM ana_artifact_citation_runs r
       LEFT JOIN concept2cure_artifacts a ON a.id = r.artifact_pk
      WHERE r.id = $1
        AND r.organization_id = $2
      LIMIT 1`,
    [runId, organizationId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    runId: r.id,
    artifactId: r.artifact_id,
    artifactPk: r.artifact_pk,
    ctdSection: r.ctd_section,
    artifactContentHash: r.artifact_content_hash,
    totalSentences: Number(r.total_sentences) || 0,
    supportedCount: Number(r.supported_count) || 0,
    contradictedCount: Number(r.contradicted_count) || 0,
    gapCount: Number(r.gap_count) || 0,
    totalReadinessDelta: Number(r.total_readiness_delta) || 0,
    filingBlocked: !!r.filing_blocked,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by,
    metadata: r.run_metadata,
    isCurrent: r.current_run_id === r.id,
    citations: Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [],
  };
}

// ─── Project-level snapshot + diff ────────────────────────────────────

export interface ProjectCitationSnapshotEntry {
  artifactId: string;
  artifactPk: number;
  ctdSection: string | null;
  title: string;
  /** The run that was active for this artifact at the snapshot time. */
  runId: string | null;
  runCreatedAt: string | null;
  totalSentences: number;
  supportedCount: number;
  contradictedCount: number;
  gapCount: number;
  totalReadinessDelta: number;
  filingBlocked: boolean;
}

export interface ProjectCitationSnapshot {
  projectId: number;
  organizationId: number;
  asOf: string;
  artifacts: ProjectCitationSnapshotEntry[];
}

/**
 * Capture the project's citation state at a point in time. For each
 * artifact, returns the latest citation run whose `created_at <= asOf`.
 * Artifacts that hadn't been cited yet at that time appear with `runId =
 * null` and zeroed counts — that lets the diff distinguish "newly cited"
 * from "newly added".
 *
 * Tenant-scoped via organization_id on every join.
 */
export async function getProjectCitationSnapshot(
  projectId: number,
  organizationId: number,
  asOf?: Date
): Promise<ProjectCitationSnapshot> {
  const asOfDate = asOf ?? new Date();
  const { rows } = await getPool().query(
    `WITH active_runs AS (
       SELECT DISTINCT ON (r.artifact_id)
         r.artifact_id,
         r.id            AS run_id,
         r.created_at    AS run_created_at,
         r.total_sentences,
         r.supported_count,
         r.contradicted_count,
         r.gap_count,
         r.total_readiness_delta,
         r.filing_blocked
       FROM ana_artifact_citation_runs r
       WHERE r.organization_id = $2
         AND r.project_id = $1
         AND r.created_at <= $3
       ORDER BY r.artifact_id, r.created_at DESC
     )
     SELECT a.id              AS artifact_pk,
            a.artifact_id,
            a.title,
            a.ctd_section,
            ar.run_id,
            ar.run_created_at,
            COALESCE(ar.total_sentences, 0)        AS total_sentences,
            COALESCE(ar.supported_count, 0)        AS supported_count,
            COALESCE(ar.contradicted_count, 0)     AS contradicted_count,
            COALESCE(ar.gap_count, 0)              AS gap_count,
            COALESCE(ar.total_readiness_delta, 0)  AS total_readiness_delta,
            COALESCE(ar.filing_blocked, false)     AS filing_blocked
       FROM concept2cure_artifacts a
       LEFT JOIN active_runs ar ON ar.artifact_id = a.artifact_id
      WHERE a.project_id = $1
        AND a.organization_id = $2
      ORDER BY a.ctd_section NULLS LAST, a.updated_at DESC`,
    [projectId, organizationId, asOfDate]
  );

  return {
    projectId,
    organizationId,
    asOf: asOfDate.toISOString(),
    artifacts: rows.map((r: any) => ({
      artifactId: r.artifact_id,
      artifactPk: r.artifact_pk,
      ctdSection: r.ctd_section,
      title: r.title,
      runId: r.run_id ?? null,
      runCreatedAt: r.run_created_at
        ? new Date(r.run_created_at).toISOString()
        : null,
      totalSentences: Number(r.total_sentences) || 0,
      supportedCount: Number(r.supported_count) || 0,
      contradictedCount: Number(r.contradicted_count) || 0,
      gapCount: Number(r.gap_count) || 0,
      totalReadinessDelta: Number(r.total_readiness_delta) || 0,
      filingBlocked: !!r.filing_blocked,
    })),
  };
}

export interface ProjectArtifactDiffEntry {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  /**
   * - 'cited_first_time': no run at `from`, has run at `to`
   * - 'lost_citations': had run at `from`, no run at `to` (rare; usually
   *   means the artifact was just added with content but never re-cited
   *   prior to a content_hash mismatch — engine still left a run, but
   *   in pathological cases the run could be deleted)
   * - 'changed': both runs present, diff produced (status / sources moved)
   * - 'unchanged': both runs present, identical run id (no re-cite)
   */
  kind: 'cited_first_time' | 'lost_citations' | 'changed' | 'unchanged';
  fromRunId: string | null;
  toRunId: string | null;
  /** Per-sentence diff payload when both runs exist. Null otherwise. */
  diff: CitationRunDiff | null;
  /** Net change in this artifact's readiness delta (positive = improvement). */
  readinessDeltaChange: number;
}

export interface ProjectCitationDiff {
  projectId: number;
  organizationId: number;
  fromDate: string;
  toDate: string;
  summary: {
    artifactsConsidered: number;
    artifactsCitedFirstTime: number;
    artifactsChanged: number;
    artifactsUnchanged: number;
    artifactsLostCitations: number;
    totalAdded: number;
    totalRemoved: number;
    totalChanged: number;
    /** Net change in project-wide readiness delta (positive = improvement). */
    totalReadinessDeltaChange: number;
    /** Aggregated transition counts across every per-artifact diff. */
    transitionCounts: Record<CitationStatusTransition, number>;
  };
  perArtifact: ProjectArtifactDiffEntry[];
}

/**
 * Pure helper: diff two project snapshots. Aggregates per-artifact
 * differences (looking up run details via getCitationRunById from the
 * caller — passed in as a function for testability) into a project-level
 * summary. Exposed standalone so the unit tests can cover the aggregation
 * arithmetic without a database.
 */
export async function diffProjectCitationSnapshotsPayload(
  fromSnap: ProjectCitationSnapshot,
  toSnap: ProjectCitationSnapshot,
  loadRun: (runId: string) => Promise<CitationRunDetail | null>
): Promise<ProjectCitationDiff> {
  const fromByArtifact = new Map<string, ProjectCitationSnapshotEntry>();
  for (const a of fromSnap.artifacts) fromByArtifact.set(a.artifactId, a);
  const toByArtifact = new Map<string, ProjectCitationSnapshotEntry>();
  for (const a of toSnap.artifacts) toByArtifact.set(a.artifactId, a);

  const allArtifactIds = new Set<string>([
    ...fromByArtifact.keys(),
    ...toByArtifact.keys(),
  ]);

  const perArtifact: ProjectArtifactDiffEntry[] = [];
  const summary = {
    artifactsConsidered: 0,
    artifactsCitedFirstTime: 0,
    artifactsChanged: 0,
    artifactsUnchanged: 0,
    artifactsLostCitations: 0,
    totalAdded: 0,
    totalRemoved: 0,
    totalChanged: 0,
    totalReadinessDeltaChange: 0,
    transitionCounts: emptyTransitionCounts(),
  };

  for (const artifactId of allArtifactIds) {
    summary.artifactsConsidered += 1;
    const f = fromByArtifact.get(artifactId);
    const t = toByArtifact.get(artifactId);
    const ctdSection = t?.ctdSection ?? f?.ctdSection ?? null;
    const title = t?.title ?? f?.title ?? '';

    const fromRunId = f?.runId ?? null;
    const toRunId = t?.runId ?? null;
    const fromDelta = f?.totalReadinessDelta ?? 0;
    const toDelta = t?.totalReadinessDelta ?? 0;
    const readinessDeltaChange = toDelta - fromDelta;
    summary.totalReadinessDeltaChange += readinessDeltaChange;

    if (!fromRunId && toRunId) {
      summary.artifactsCitedFirstTime += 1;
      const toRun = await loadRun(toRunId);
      // First citation = every sentence is "added".
      summary.totalAdded += toRun?.citations.length ?? 0;
      perArtifact.push({
        artifactId,
        ctdSection,
        title,
        kind: 'cited_first_time',
        fromRunId: null,
        toRunId,
        diff: null,
        readinessDeltaChange,
      });
      continue;
    }
    if (fromRunId && !toRunId) {
      summary.artifactsLostCitations += 1;
      const fromRun = await loadRun(fromRunId);
      summary.totalRemoved += fromRun?.citations.length ?? 0;
      perArtifact.push({
        artifactId,
        ctdSection,
        title,
        kind: 'lost_citations',
        fromRunId,
        toRunId: null,
        diff: null,
        readinessDeltaChange,
      });
      continue;
    }
    if (!fromRunId && !toRunId) {
      // Artifact in the project at one snapshot or the other but never
      // cited. Skip — no citation surface to diff.
      summary.artifactsConsidered -= 1;
      continue;
    }

    // Both runs present.
    if (fromRunId === toRunId) {
      summary.artifactsUnchanged += 1;
      perArtifact.push({
        artifactId,
        ctdSection,
        title,
        kind: 'unchanged',
        fromRunId,
        toRunId,
        diff: null,
        readinessDeltaChange,
      });
      continue;
    }

    const [fromRun, toRun] = await Promise.all([
      loadRun(fromRunId!),
      loadRun(toRunId!),
    ]);
    if (!fromRun || !toRun) {
      // One side missing (cross-tenant / pruned) — fall back to a coarse
      // 'changed' marker without a per-sentence diff.
      summary.artifactsChanged += 1;
      perArtifact.push({
        artifactId,
        ctdSection,
        title,
        kind: 'changed',
        fromRunId,
        toRunId,
        diff: null,
        readinessDeltaChange,
      });
      continue;
    }

    const diff = diffCitationRunsPayload(fromRun, toRun);
    summary.totalAdded += diff.added.length;
    summary.totalRemoved += diff.removed.length;
    summary.totalChanged += diff.changed.length;
    for (const k of ALL_TRANSITIONS) {
      summary.transitionCounts[k] += diff.transitionCounts[k];
    }
    summary.artifactsChanged += 1;
    perArtifact.push({
      artifactId,
      ctdSection,
      title,
      kind: 'changed',
      fromRunId,
      toRunId,
      diff,
      readinessDeltaChange,
    });
  }

  // Stable order: most-impactful first (worst readiness regression first,
  // then alphabetical by artifactId).
  perArtifact.sort((a, b) => {
    if (a.readinessDeltaChange !== b.readinessDeltaChange) {
      return a.readinessDeltaChange - b.readinessDeltaChange;
    }
    return a.artifactId.localeCompare(b.artifactId);
  });

  return {
    projectId: toSnap.projectId,
    organizationId: toSnap.organizationId,
    fromDate: fromSnap.asOf,
    toDate: toSnap.asOf,
    summary,
    perArtifact,
  };
}

/**
 * Live entry — load both snapshots, then run the pure aggregator with a
 * tenant-scoped run loader.
 */
export async function diffProjectCitationSnapshots(
  projectId: number,
  organizationId: number,
  fromDate: Date,
  toDate: Date
): Promise<ProjectCitationDiff> {
  const [fromSnap, toSnap] = await Promise.all([
    getProjectCitationSnapshot(projectId, organizationId, fromDate),
    getProjectCitationSnapshot(projectId, organizationId, toDate),
  ]);
  return diffProjectCitationSnapshotsPayload(fromSnap, toSnap, runId =>
    getCitationRunById(runId, organizationId)
  );
}

export type CitationStatusTransition =
  | 'supported_to_supported'
  | 'supported_to_contradicted'
  | 'supported_to_gap'
  | 'contradicted_to_supported'
  | 'contradicted_to_contradicted'
  | 'contradicted_to_gap'
  | 'gap_to_supported'
  | 'gap_to_contradicted'
  | 'gap_to_gap';

export interface CitationRunDiff {
  fromRunId: string;
  toRunId: string;
  artifactId: string;
  fromSentenceCount: number;
  toSentenceCount: number;
  /** Sentences in `to` that don't exist in `from` (matched by contentHash). */
  added: SentenceCitation[];
  /** Sentences in `from` that don't exist in `to`. */
  removed: SentenceCitation[];
  /** Sentences that exist in both; status / sources may have changed. */
  changed: Array<{
    contentHash: string;
    text: string;
    transition: CitationStatusTransition;
    fromStatus: CitationStatus;
    toStatus: CitationStatus;
    fromSourceCount: number;
    toSourceCount: number;
    fromSentenceIndex: number;
    toSentenceIndex: number;
    /** True when the source artifact / passage set changed. */
    sourcesChanged: boolean;
  }>;
  /** Sentences identical across both runs (status + sources). */
  unchangedCount: number;
  /** Roll-up of every transition that occurred. */
  transitionCounts: Record<CitationStatusTransition, number>;
  /** Net readiness delta moving from `from` to `to`. Positive = improved. */
  readinessDeltaChange: number;
}

const ALL_TRANSITIONS: CitationStatusTransition[] = [
  'supported_to_supported',
  'supported_to_contradicted',
  'supported_to_gap',
  'contradicted_to_supported',
  'contradicted_to_contradicted',
  'contradicted_to_gap',
  'gap_to_supported',
  'gap_to_contradicted',
  'gap_to_gap',
];

function emptyTransitionCounts(): Record<CitationStatusTransition, number> {
  const out = {} as Record<CitationStatusTransition, number>;
  for (const k of ALL_TRANSITIONS) out[k] = 0;
  return out;
}

function transitionKey(
  from: CitationStatus,
  to: CitationStatus
): CitationStatusTransition {
  return `${from}_to_${to}` as CitationStatusTransition;
}

function sourcesEqual(a: CitationSource[], b: CitationSource[]): boolean {
  if (a.length !== b.length) return false;
  const keyA = a
    .map(s => `${s.artifactId}|${s.relationship}|${s.passageSnippet.slice(0, 80)}`)
    .sort();
  const keyB = b
    .map(s => `${s.artifactId}|${s.relationship}|${s.passageSnippet.slice(0, 80)}`)
    .sort();
  for (let i = 0; i < keyA.length; i++) if (keyA[i] !== keyB[i]) return false;
  return true;
}

/**
 * Pure helper: compute the diff between two citation runs. Sentences are
 * matched by contentHash so renumbering between runs (e.g. an inserted
 * paragraph) doesn't show up as a wholesale add/remove.
 *
 * Exposed so it's unit-testable without a database.
 */
export function diffCitationRunsPayload(
  from: CitationRunDetail,
  to: CitationRunDetail
): CitationRunDiff {
  const fromMap = new Map<string, SentenceCitation>();
  for (const c of from.citations) fromMap.set(c.contentHash, c);
  const toMap = new Map<string, SentenceCitation>();
  for (const c of to.citations) toMap.set(c.contentHash, c);

  const added: SentenceCitation[] = [];
  const removed: SentenceCitation[] = [];
  const changed: CitationRunDiff['changed'] = [];
  let unchangedCount = 0;
  const transitionCounts = emptyTransitionCounts();

  // Walk `from` first to find removed + changed.
  for (const [hash, fromCit] of fromMap) {
    const toCit = toMap.get(hash);
    if (!toCit) {
      removed.push(fromCit);
      continue;
    }
    const statusSame = fromCit.status === toCit.status;
    const srcSame = sourcesEqual(fromCit.sources, toCit.sources);
    const tk = transitionKey(fromCit.status, toCit.status);
    transitionCounts[tk] += 1;
    if (statusSame && srcSame) {
      unchangedCount += 1;
    } else {
      changed.push({
        contentHash: hash,
        text: toCit.text,
        transition: tk,
        fromStatus: fromCit.status,
        toStatus: toCit.status,
        fromSourceCount: fromCit.sources.length,
        toSourceCount: toCit.sources.length,
        fromSentenceIndex: fromCit.sentenceIndex,
        toSentenceIndex: toCit.sentenceIndex,
        sourcesChanged: !srcSame,
      });
    }
  }
  // Walk `to` for added (sentences not in `from`).
  for (const [hash, toCit] of toMap) {
    if (!fromMap.has(hash)) added.push(toCit);
  }

  // Net readiness delta change: positive = improvement (less negative).
  const readinessDeltaChange =
    to.totalReadinessDelta - from.totalReadinessDelta;

  return {
    fromRunId: from.runId,
    toRunId: to.runId,
    artifactId: to.artifactId,
    fromSentenceCount: from.citations.length,
    toSentenceCount: to.citations.length,
    added,
    removed,
    changed,
    unchangedCount,
    transitionCounts,
    readinessDeltaChange,
  };
}

/**
 * Live entry — fetch both runs (tenant-scoped) and diff. Returns null when
 * either run is missing / cross-tenant / wrong-artifact.
 */
export async function diffCitationRuns(
  fromRunId: string,
  toRunId: string,
  organizationId: number
): Promise<CitationRunDiff | null> {
  const [fromRun, toRun] = await Promise.all([
    getCitationRunById(fromRunId, organizationId),
    getCitationRunById(toRunId, organizationId),
  ]);
  if (!fromRun || !toRun) return null;
  if (fromRun.artifactId !== toRun.artifactId) return null;
  return diffCitationRunsPayload(fromRun, toRun);
}

/**
 * List historical runs for one artifact, newest first. Returns summaries
 * (without the full citations array — call getCitationRunById for that)
 * so the list view stays cheap.
 */
export async function listCitationRunsForArtifact(
  artifactId: string,
  organizationId: number,
  options: { limit?: number; offset?: number } = {}
): Promise<{ rows: CitationRunSummary[]; total: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const [rowsRes, countRes] = await Promise.all([
    getPool().query(
      `SELECT r.id, r.artifact_id, r.artifact_pk, r.ctd_section,
              r.artifact_content_hash, r.total_sentences, r.supported_count,
              r.contradicted_count, r.gap_count, r.total_readiness_delta,
              r.filing_blocked, r.run_metadata, r.created_at, r.created_by,
              a.citation_run_id AS current_run_id
         FROM ana_artifact_citation_runs r
         LEFT JOIN concept2cure_artifacts a ON a.id = r.artifact_pk
        WHERE r.artifact_id = $1
          AND r.organization_id = $2
        ORDER BY r.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      [artifactId, organizationId]
    ),
    getPool().query(
      `SELECT COUNT(*)::int AS c
         FROM ana_artifact_citation_runs
        WHERE artifact_id = $1
          AND organization_id = $2`,
      [artifactId, organizationId]
    ),
  ]);
  const rows: CitationRunSummary[] = rowsRes.rows.map((r: any) => ({
    runId: r.id,
    artifactId: r.artifact_id,
    artifactPk: r.artifact_pk,
    ctdSection: r.ctd_section,
    artifactContentHash: r.artifact_content_hash,
    totalSentences: Number(r.total_sentences) || 0,
    supportedCount: Number(r.supported_count) || 0,
    contradictedCount: Number(r.contradicted_count) || 0,
    gapCount: Number(r.gap_count) || 0,
    totalReadinessDelta: Number(r.total_readiness_delta) || 0,
    filingBlocked: !!r.filing_blocked,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by,
    metadata: r.run_metadata,
    isCurrent: r.current_run_id === r.id,
  }));
  return { rows, total: countRes.rows[0]?.c ?? 0 };
}
