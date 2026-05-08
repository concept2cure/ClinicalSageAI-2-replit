/**
 * Submission-Chat Handler — post-draft, cross-dossier provenance interrogation.
 *
 * Once AnA has generated a regulatory section, the user stays in the same
 * thread and asks follow-up questions about the draft: where citations came
 * from, whether other artifacts in the dossier disagree, alternate framings
 * for a different agency, etc. The Truth Engine answers across the ENTIRE
 * project (every artifact under the parent project), not just the active
 * document.
 *
 * Pipeline:
 *   1. Resolve the artifact → parent project → all sibling artifacts
 *   2. Pull project-tier persistent memory via memory-context-assembler
 *   3. Run cross-document RAG, scoped to the project's full artifact set
 *   4. Generate an answer that explicitly cites supports / contradicts / gap
 *      relationships, then return structured citations[] for the UI.
 *
 * @module server/services/ana/submission-chat-handler
 */
import { pool } from '../../db.js';
import { ensureGateway } from '../../routes/chat/shared.js';
import { getRAGPipeline } from '../advancedRAGPipeline.js';
import { buildMemoryContextForChat } from '../memory-context-assembler.js';
import {
  getThreadMessages,
  saveChatMessage,
} from '../chat-thread-helpers.js';
import { verifyClaim, type VerifierFlag } from '../../routes/chat/verifier.js';
import {
  persistRewriteProposal,
  getActiveProposalForThreadArtifact,
} from './submission-chat-proposal-store.js';

// Cross-encoder relevance threshold for retrieval — matches the chat default
// so submission-chat doesn't surface lower-quality matches than the section
// generation step did.
const RETRIEVAL_TOP_K = parseInt(
  process.env.ANA_SUBMISSION_CHAT_TOP_K ?? '12',
  10
);
const RETRIEVAL_THRESHOLD = parseFloat(
  process.env.ANA_SUBMISSION_CHAT_THRESHOLD ?? '0.6'
);
const GENERATION_MAX_TOKENS = parseInt(
  process.env.ANA_SUBMISSION_CHAT_MAX_TOKENS ?? '2048',
  10
);

export type CitationRelationship = 'supports' | 'contradicts' | 'gap';

/**
 * What the user is doing with the draft this turn.
 *   - provenance: "where did this number come from?", "why did you cite X?"
 *   - cross_evidence: "show competing data from Study 204", "is there anything contradicting this?"
 *   - rewrite: "rewrite §4.1 for EMA", "make this more concise"
 *   - confirm_apply: "apply that", "do it", "ship it" — confirms a pending rewrite
 *   - general: anything else (clarification, summarization, follow-ups)
 */
export type SubmissionChatIntent =
  | 'provenance'
  | 'cross_evidence'
  | 'rewrite'
  | 'confirm_apply'
  | 'general';

export interface SubmissionChatCitation {
  artifactId: string;
  sectionCode: string | null;
  pageRef: string | null;
  passageSnippet: string;
  relationship: CitationRelationship;
  title?: string;
  score?: number;
}

/**
 * Per-claim quality flags for a single paragraph in a rewrite proposal,
 * produced by running the deterministic verifier against the proposal's
 * cited chunks. Surfaces issues like "claim contains unmatched numbers" or
 * "best citation relevance is below threshold" before the rewrite is
 * applied.
 */
export interface RewriteClaimVerification {
  paragraphIndex: number;
  status: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';
  citationRefs: number[];
  flags: VerifierFlag[];
}

/**
 * When the model produces a rewrite, we expose the new content alongside the
 * answer so the UI can render a diff or present it as a draft proposal. The
 * rewrite is NOT persisted to concept2cure_artifacts here — that is a
 * governed mutation that needs an explicit user confirmation.
 */
export interface SubmissionChatRewrite {
  sectionCode: string | null;
  targetAgency: string | null;
  proposedContent: string;
  rationale: string;
  /**
   * Per-paragraph claim-quality flags for the proposed rewrite. Populated
   * when chunks are available; the verifier downgrades SUPPORTED → WEAK
   * when its rules fire (low relevance, ungrounded numbers, thin support).
   */
  claimVerification?: RewriteClaimVerification[];
  /**
   * Roll-up: count of claim statuses across the proposal so the UI can
   * render a single "n WEAK / m UNSUPPORTED" badge.
   */
  claimStatusCounts?: { supported: number; weak: number; unsupported: number };
  /**
   * Server-side proposal handle. When the rewrite is persisted to the
   * proposal store, this id is the canonical reference for confirm_apply
   * and apply-rewrite — neither needs to trust the client to round-trip
   * the full content. null when the store is unavailable (e.g., the
   * migration hasn't been applied yet).
   */
  proposalId?: string | null;
  /** sha256(proposedContent) — pinned at proposal time for tamper detection. */
  proposalContentHash?: string | null;
  /** When the proposal expires if not applied. */
  proposalExpiresAt?: string | null;
}

/**
 * Run the deterministic chat verifier across each paragraph of a proposed
 * rewrite. Maps [SRC-n] markers in the paragraph back to the retrieved
 * chunks so the verifier sees real citation scores + snippets — not just
 * "did the paragraph cite anything". Pure: takes the proposal + chunks,
 * returns the verification structure.
 */
export function verifyRewriteClaims(
  proposedContent: string,
  chunks: RetrievedChunk[]
): {
  perParagraph: RewriteClaimVerification[];
  statusCounts: { supported: number; weak: number; unsupported: number };
} {
  const paragraphs = proposedContent
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean);
  const perParagraph: RewriteClaimVerification[] = [];
  const counts = { supported: 0, weak: 0, unsupported: 0 };

  paragraphs.forEach((para, idx) => {
    const refMatches = Array.from(para.matchAll(/\[SRC-(\d+)\]/g));
    const refs = Array.from(
      new Set(
        refMatches
          .map(m => parseInt(m[1], 10))
          .filter(n => Number.isFinite(n) && n >= 1 && n <= chunks.length)
      )
    );
    if (refs.length === 0) {
      perParagraph.push({
        paragraphIndex: idx,
        status: 'UNSUPPORTED',
        citationRefs: [],
        flags: [],
      });
      counts.unsupported += 1;
      return;
    }
    const citationScores = refs.map(r => chunks[r - 1].score);
    const snippets = refs.map(r => chunks[r - 1].content || '');
    const { flags, shouldDowngrade } = verifyClaim(para, citationScores, snippets);
    let status: RewriteClaimVerification['status'] = 'SUPPORTED';
    if (shouldDowngrade) status = 'WEAK';
    perParagraph.push({
      paragraphIndex: idx,
      status,
      citationRefs: refs,
      flags,
    });
    if (status === 'SUPPORTED') counts.supported += 1;
    else if (status === 'WEAK') counts.weak += 1;
    else counts.unsupported += 1;
  });

  return { perParagraph, statusCounts: counts };
}

export interface SubmissionChatRequest {
  threadId: string;
  artifactId: string;
  question: string;
  organizationId?: number | null;
  organizationUuid?: string | null;
  userId?: number | null;
}

/**
 * When the user confirms a pending rewrite ("apply that"), the handler does
 * NOT mutate the artifact — that requires a separate POST that captures
 * reasonForChange and (optionally) an e-signature. Instead, it returns this
 * directive instructing the client what to do next.
 */
export interface SubmissionChatConfirmApply {
  endpoint: '/api/ana/submission-chat/apply-rewrite';
  artifactId: string;
  /**
   * When a server-side proposal exists for this thread+artifact, the client
   * SHOULD apply by proposalId — the content_hash binding makes tampering
   * detectable. Falls back to client-supplied proposedContent only when no
   * pending proposal is on file (e.g., the proposal expired).
   */
  proposalId: string | null;
  proposalExpiresAt: string | null;
  hint: 'use_proposal_id' | 'use_prior_rewrite_payload';
  requiredFields: Array<
    'proposalId' | 'proposedContent' | 'reasonForChange' | 'signature'
  >;
  signatureRequired: boolean;
  message: string;
}

export interface SubmissionChatResponse {
  threadId: string;
  artifactId: string;
  projectId: number;
  intent: SubmissionChatIntent;
  answer: string;
  citations: SubmissionChatCitation[];
  rewrite: SubmissionChatRewrite | null;
  /** Populated when intent="confirm_apply" — tells the client what to POST next. */
  confirmApply: SubmissionChatConfirmApply | null;
  retrieval: {
    artifactsInScope: number;
    chunksRetrieved: number;
    chunksConsidered: number;
    retrievalQuery: string;
  };
  conversation: {
    historyMessages: number;
    priorCitations: number;
  };
  model: string;
  provider: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** Thread history rows fed into the model and the retrieval-query rewriter. */
const HISTORY_TURN_LIMIT = parseInt(
  process.env.ANA_SUBMISSION_CHAT_HISTORY_TURNS ?? '8',
  10
);
/** How many recent user turns to fold into the retrieval query for coreference. */
const HISTORY_QUERY_TURNS = 2;

/**
 * Internal artifact / chunk shapes — exported so the streaming handler can
 * reuse them without duplicating types.
 */
export interface ArtifactRow {
  id: number;
  artifact_id: string;
  project_id: number;
  organization_id: number;
  ctd_section: string | null;
  title: string;
  type: string;
  category: string;
  content?: string | null;
}

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  score: number;
  artifactId: string;
  sectionCode: string | null;
  pageRef: string | null;
}

/**
 * Load the active artifact and verify the caller's tenant matches.
 */
export async function loadArtifact(
  artifactId: string,
  organizationId?: number | null
): Promise<ArtifactRow> {
  const { rows } = await pool.query(
    `SELECT id, artifact_id, project_id, organization_id, ctd_section, title, type, category, content
       FROM concept2cure_artifacts
      WHERE artifact_id = $1
      LIMIT 1`,
    [artifactId]
  );
  if (rows.length === 0) {
    const err = new Error(`Artifact not found: ${artifactId}`);
    (err as any).code = 'ARTIFACT_NOT_FOUND';
    throw err;
  }
  const row = rows[0] as ArtifactRow;
  if (
    organizationId &&
    Number(row.organization_id) !== Number(organizationId)
  ) {
    const err = new Error('Artifact does not belong to this organization');
    (err as any).code = 'ARTIFACT_ORG_MISMATCH';
    throw err;
  }
  return row;
}

/**
 * Pull every artifact under the same project so the retrieval scope is the
 * full dossier, not just the active document.
 */
export async function loadProjectArtifacts(
  projectId: number,
  organizationId: number
): Promise<ArtifactRow[]> {
  const { rows } = await pool.query(
    `SELECT id, artifact_id, project_id, organization_id, ctd_section, title, type, category
       FROM concept2cure_artifacts
      WHERE project_id = $1
        AND organization_id = $2
      ORDER BY ctd_section NULLS LAST, updated_at DESC`,
    [projectId, organizationId]
  );
  return rows as ArtifactRow[];
}

/**
 * Map vault hits back to the originating artifact + section so citations carry
 * { artifactId, sectionCode, pageRef } not just an opaque atom id.
 */
export async function enrichChunksWithArtifactMetadata(
  hits: Array<{ id: string; title: string; content: string; score: number }>,
  projectArtifacts: ArtifactRow[]
): Promise<RetrievedChunk[]> {
  if (hits.length === 0) return [];

  // The atom's source_id maps to artifacts.artifact_id when source_type =
  // 'artifact'. Look up which atom belongs to which artifact in one query so
  // we don't issue N round-trips.
  const atomIds = hits.map(h => h.id);
  const { rows: atomRows } = await pool.query(
    `SELECT id, source_type, source_id, metadata
       FROM lumen_data_atoms
      WHERE id = ANY($1::uuid[])`,
    [atomIds]
  );
  const atomById = new Map<
    string,
    { sourceType: string | null; sourceId: string | null; metadata: any }
  >();
  for (const row of atomRows as Array<{
    id: string;
    source_type: string | null;
    source_id: string | null;
    metadata: any;
  }>) {
    atomById.set(row.id, {
      sourceType: row.source_type,
      sourceId: row.source_id,
      metadata: row.metadata,
    });
  }

  const artifactByExternalId = new Map<string, ArtifactRow>();
  for (const a of projectArtifacts) artifactByExternalId.set(a.artifact_id, a);

  return hits.map(hit => {
    const atom = atomById.get(hit.id);
    const artifact =
      atom?.sourceType === 'artifact' && atom.sourceId
        ? artifactByExternalId.get(atom.sourceId)
        : undefined;
    const meta = atom?.metadata || {};
    const pageRef =
      typeof meta.page === 'number'
        ? `p.${meta.page}`
        : typeof meta.section === 'string'
          ? meta.section
          : null;
    return {
      id: hit.id,
      title: hit.title,
      content: hit.content,
      score: hit.score,
      artifactId: artifact?.artifact_id ?? atom?.sourceId ?? hit.id,
      sectionCode: artifact?.ctd_section ?? null,
      pageRef,
    };
  });
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A citation surfaced from the most recent generation on this thread. Used
 * to resolve coreferences like "why did you cite this source?" — without it,
 * the model has no idea which source the user means.
 */
export interface PriorCitation {
  ref: number;          // [SRC-n] from the prior turn
  artifactId: string | null;
  sectionCode: string | null;
  pageRef: string | null;
  title: string | null;
  excerpt: string | null;
  score: number | null;
}

/**
 * Classify the user's question so the model knows what shape of answer to
 * produce. The classifier is keyword-based — cheap, deterministic, no extra
 * LLM round-trip. The model is still free to override the framing in prose,
 * but the structured intent gates whether a rewrite payload is expected.
 */
export function classifyIntent(question: string): SubmissionChatIntent {
  const q = question.toLowerCase().trim();

  // Confirm-apply must be checked BEFORE rewrite — phrases like "apply that
  // rewrite" otherwise match the rewrite branch. These are short, deliberate
  // confirmations of a pending proposal.
  // Match short phrases or sentence-leading confirmations.
  if (
    /^(apply (it|that|the (?:rewrite|change|edit|proposal|draft))|do it|ship it|go ahead|confirm|approve|yes,? apply|please apply|let'?s apply|make it so)\b/.test(
      q
    ) ||
    /^(yes,?\s*(do it|apply|ship it|go ahead|confirm))\b/.test(q) ||
    /\bapply (?:the |this |that )?(?:rewrite|change|edit|proposal|draft)\b/.test(
      q
    )
  ) {
    return 'confirm_apply';
  }

  // Rewrite: "rewrite §4.1 for EMA", "redraft for FDA", "make this more concise",
  // "tighten / shorten / lengthen / restructure / convert / translate this section"
  if (
    /\b(rewrite|redraft|re-?word|rephrase|restructure|reframe|tighten|shorten|lengthen|expand)\b/.test(
      q
    ) ||
    /\b(convert|translate|adapt) (this|it|the (?:section|paragraph|draft))/.test(q) ||
    /\bfor (?:ema|fda|pmda|tga|mhra|nmpa|hc|the (?:agency|reviewer))\b/.test(q)
  ) {
    return 'rewrite';
  }

  // Cross-evidence: "show competing data", "anything contradicting", "any conflicts",
  // "what does Study 204 say", "alternative data".
  if (
    /\b(competing|contradict|conflict|disagree|dispute|inconsisten|alternat|other (?:data|sources?|studies))\b/.test(
      q
    ) ||
    /\bwhat does (study|trial|protocol|the [a-z ]+) say\b/.test(q)
  ) {
    return 'cross_evidence';
  }

  // Provenance: "where did X come from", "why did you cite", "which source",
  // "show me the source", "back this up", "is this in the IB".
  if (
    /\b(where did|where does|why did you cite|why cite|which source|which (?:document|artifact)|show me the source|cite (?:that|this)|back (?:this|it) up)\b/.test(
      q
    ) ||
    /\b(is this in (?:the|our)|do we have evidence (?:for|of)|what'?s the (?:source|provenance))/.test(
      q
    )
  ) {
    return 'provenance';
  }

  return 'general';
}

/**
 * Detect a target regulatory agency in the question for rewrite intents
 * ("rewrite §4.1 for EMA"). Returns canonical uppercase short names.
 */
export function detectTargetAgency(question: string): string | null {
  const map: Array<[RegExp, string]> = [
    [/\bema\b/i, 'EMA'],
    [/\bfda\b/i, 'FDA'],
    [/\bpmda\b/i, 'PMDA'],
    [/\bmhra\b/i, 'MHRA'],
    [/\bnmpa\b/i, 'NMPA'],
    [/\btga\b/i, 'TGA'],
    [/\bhealth\s*canada\b/i, 'HC'],
    [/\bich\b/i, 'ICH'],
  ];
  for (const [re, name] of map) {
    if (re.test(question)) return name;
  }
  return null;
}

/**
 * Detect an explicit section reference in the question ("§4.1", "section 9.2").
 * Falls back to the active artifact's CTD section when the user just said
 * "this section" or "this paragraph".
 */
export function detectSectionReference(
  question: string,
  fallback: string | null
): string | null {
  const explicit = question.match(
    /(?:§|section|sec\.?)\s*(\d+(?:\.\d+){0,3})/i
  );
  if (explicit) return explicit[1];
  if (/\bthis (?:section|paragraph|draft|module)\b/i.test(question)) {
    return fallback;
  }
  return null;
}

/**
 * Pull the recent thread history out of chat_messages so the model can resolve
 * coreferences ("the EU cohort", "the answer above") and so we can synthesize
 * a standalone retrieval query from the question + recent user turns.
 */
export async function loadConversationHistory(
  threadId: string,
  limit: number
): Promise<ConversationTurn[]> {
  if (!threadId || limit <= 0) return [];
  try {
    const rows = await getThreadMessages(threadId);
    const filtered: ConversationTurn[] = rows
      .filter(r => r.role === 'user' || r.role === 'assistant')
      .map(r => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
      }));
    return filtered.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Pull the [SRC-n] sources cited on the most recent generation in this thread
 * so the user can refer back to "this source" / "that citation" naturally.
 *
 * We join ai_generation_runs → ai_retrieval_runs → ai_retrieval_chunks for
 * the latest generation on the thread, then enrich atom_id → artifact /
 * section / page using the same path as the live retrieval chunks. The
 * "ref" field is the chunk rank from the prior turn so the numbering matches
 * the [SRC-n] markers the user actually saw.
 *
 * Tolerates missing tables (42P01) like the rest of the chat path.
 */
export async function loadPriorCitations(
  threadId: string,
  projectArtifacts: ArtifactRow[],
  limit = 12
): Promise<PriorCitation[]> {
  if (!threadId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT rc.atom_id, rc.title, rc.excerpt_preview, rc.score, rc.rank
         FROM ai_generation_runs gr
         JOIN ai_retrieval_chunks rc
           ON rc.retrieval_run_id = gr.retrieval_run_id
        WHERE gr.thread_id = $1
          AND gr.retrieval_run_id IS NOT NULL
          AND gr.id = (
            SELECT id FROM ai_generation_runs
             WHERE thread_id = $1
               AND retrieval_run_id IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 1
          )
        ORDER BY rc.rank ASC
        LIMIT $2`,
      [threadId, limit]
    );
    if (rows.length === 0) return [];

    // Re-use the live enrichment so artifact / section / page are filled in.
    const synthetic = rows
      .filter((r: any) => typeof r.atom_id === 'string' && r.atom_id)
      .map((r: any) => ({
        id: r.atom_id as string,
        title: (r.title as string | null) ?? '',
        content: (r.excerpt_preview as string | null) ?? '',
        score: Number(r.score) || 0,
      }));
    const enriched = await enrichChunksWithArtifactMetadata(
      synthetic,
      projectArtifacts
    );

    return rows.map((r: any, i: number) => {
      const match = enriched[i];
      return {
        ref: Number(r.rank),
        artifactId: match?.artifactId ?? null,
        sectionCode: match?.sectionCode ?? null,
        pageRef: match?.pageRef ?? null,
        title: r.title ?? match?.title ?? null,
        excerpt: r.excerpt_preview ?? null,
        score: r.score === null ? null : Number(r.score),
      };
    });
  } catch (e: any) {
    if (e?.code !== '42P01') {
      console.warn(
        '[AnA submission-chat] prior-citations load failed:',
        e?.message
      );
    }
    return [];
  }
}

/**
 * Synthesize a self-contained retrieval query from the current question plus
 * the most recent user turns. This handles "what about the EU cohort?" style
 * follow-ups without needing an extra LLM call: vector search is robust to
 * concatenated context, so we just include the last N user turns.
 */
export function buildRetrievalQuery(
  question: string,
  history: ConversationTurn[]
): string {
  const recentUserTurns = history
    .filter(h => h.role === 'user')
    .slice(-HISTORY_QUERY_TURNS)
    .map(h => h.content.trim())
    .filter(Boolean);

  if (recentUserTurns.length === 0) return question;

  // Put the current question first so embeddings weight it most heavily, then
  // append earlier user turns as additional context.
  return [question, ...recentUserTurns.filter(t => t !== question)].join(' || ');
}

/**
 * Render the prior-turn citations so "why did you cite this source?" can
 * resolve "this source" without re-asking the user. The numbering uses the
 * original [SRC-n] from the prior turn so the labels match what the user saw.
 */
function renderPriorCitationsBlock(priorCitations: PriorCitation[]): string {
  if (priorCitations.length === 0) return '';
  const lines = priorCitations.map(c => {
    const sec = c.sectionCode ? ` ${c.sectionCode}` : '';
    const page = c.pageRef ? ` ${c.pageRef}` : '';
    const title = c.title ?? 'untitled';
    const excerpt = c.excerpt
      ? c.excerpt.length > 200
        ? `${c.excerpt.slice(0, 200)}…`
        : c.excerpt
      : '';
    return `- [SRC-${c.ref}] artifact=${c.artifactId ?? 'unknown'}${sec}${page} "${title}"${excerpt ? `\n    ${excerpt}` : ''}`;
  });
  return [
    '',
    '--- PREVIOUSLY CITED IN THIS THREAD (resolve "this source" against these) ---',
    ...lines,
    '--- END PREVIOUS CITATIONS ---',
  ].join('\n');
}

/**
 * Render the conversation history as a compact transcript for the system
 * prompt. Long assistant turns (the original section draft) get truncated so
 * the prompt budget isn't blown — the model has the active artifact title
 * and the retrieved evidence for grounding regardless.
 */
function renderHistoryBlock(history: ConversationTurn[]): string {
  if (history.length === 0) return '';
  const lines = history.map(turn => {
    const label = turn.role === 'user' ? 'User' : 'AnA';
    const body =
      turn.content.length > 800
        ? `${turn.content.slice(0, 800)}…`
        : turn.content;
    return `${label}: ${body}`;
  });
  return ['', '--- CONVERSATION SO FAR ---', ...lines, '--- END CONVERSATION ---'].join(
    '\n'
  );
}

/**
 * Build the cross-dossier evidence block and require the model to emit a
 * single JSON object: { intent, answer, citations[], rewrite? }, where each
 * citation has a structured supports / contradicts / gap label rather than
 * relying on heuristics over the prose.
 */
export function buildSystemPrompt(
  activeArtifact: ArtifactRow,
  projectArtifacts: ArtifactRow[],
  chunks: RetrievedChunk[],
  options: {
    intent?: SubmissionChatIntent;
    targetAgency?: string | null;
    sectionReference?: string | null;
    history?: ConversationTurn[];
    priorCitations?: PriorCitation[];
  } = {}
): string {
  const intent = options.intent ?? 'general';
  const targetAgency = options.targetAgency ?? null;
  const sectionReference = options.sectionReference ?? null;
  const history = options.history ?? [];
  const priorCitations = options.priorCitations ?? [];

  const dossierManifest = projectArtifacts
    .map(a => {
      const section = a.ctd_section ? ` ${a.ctd_section}` : '';
      const flag = a.id === activeArtifact.id ? ' (active)' : '';
      return `- [${a.artifact_id}]${section} ${a.title}${flag}`;
    })
    .join('\n');

  const evidenceLines = chunks.map((c, i) => {
    const sec = c.sectionCode ? ` ${c.sectionCode}` : '';
    const page = c.pageRef ? ` ${c.pageRef}` : '';
    const trimmed =
      c.content.length > 600 ? `${c.content.slice(0, 600)}…` : c.content;
    return `[SRC-${i + 1}] artifact=${c.artifactId}${sec}${page} title="${c.title}"\n${trimmed}`;
  });

  const intentBlock = (() => {
    switch (intent) {
      case 'provenance':
        return [
          '',
          'Detected intent: PROVENANCE.',
          'Resolve where each fact in the user\'s question came from. If the user',
          'refers to "this source" or "that citation", look at the conversation',
          'history above to identify which [SRC-n] they mean and explain its',
          'role.',
        ].join('\n');
      case 'cross_evidence':
        return [
          '',
          'Detected intent: CROSS-EVIDENCE.',
          'The user is asking about competing or contradictory data across the',
          'dossier. Search the evidence aggressively for sources that disagree;',
          'cite both sides explicitly with supports / contradicts labels.',
        ].join('\n');
      case 'rewrite':
        return [
          '',
          `Detected intent: REWRITE${targetAgency ? ` (target agency: ${targetAgency})` : ''}.`,
          sectionReference
            ? `Target section: ${sectionReference}.`
            : 'Target: the active artifact (no explicit section reference).',
          'The retrieved evidence below includes both passages relevant to the',
          'user\'s question AND passages semantically close to the active section.',
          'BEFORE proposing a rewrite:',
          '  - Identify any [SRC-n] that contradicts the active section. Cite',
          '    each one inline with relationship="contradicts" and quote the',
          '    conflicting fact.',
          '  - Identify any [SRC-n] that exposes a gap (silence where a record',
          '    is expected). Cite with relationship="gap".',
          'THEN propose a "rewrite" object on the JSON envelope. The rewrite',
          'MUST acknowledge every contradiction surfaced above — either by',
          'adopting the dossier-grounded value, or by explicitly stating the',
          'discrepancy. Every claim in the rewrite must be defensible against',
          '[SRC-n].',
        ].join('\n');
      default:
        return '';
    }
  })();

  return [
    'You are AnA in submission-chat mode. The user has already generated a regulatory',
    'section and is now interrogating the draft. Your scope is the ENTIRE project',
    'dossier, not only the active document.',
    '',
    'Active artifact:',
    `- ${activeArtifact.artifact_id}${activeArtifact.ctd_section ? ` ${activeArtifact.ctd_section}` : ''} ${activeArtifact.title}`,
    '',
    `Project dossier (${projectArtifacts.length} artifact${projectArtifacts.length === 1 ? '' : 's'}):`,
    dossierManifest || '- (no sibling artifacts indexed)',
    renderPriorCitationsBlock(priorCitations),
    renderHistoryBlock(history),
    intentBlock,
    '',
    '--- CROSS-DOSSIER EVIDENCE ---',
    evidenceLines.join('\n\n') || '(no retrieved evidence — answer "I cannot verify that from the dossier")',
    '--- END EVIDENCE ---',
    '',
    'Output contract — return ONE JSON object, nothing else, matching:',
    '{',
    '  "intent": "provenance" | "cross_evidence" | "rewrite" | "general",',
    '  "answer": string,           // prose answer with [SRC-n] inline cites',
    '  "citations": [              // one entry per [SRC-n] you actually cite',
    '    {',
    '      "ref": number,          // matches the n in [SRC-n]',
    '      "relationship": "supports" | "contradicts" | "gap"',
    '              // supports = source backs the claim',
    '              // contradicts = source disagrees with another cited source',
    '              // gap = source is silent where a record is expected',
    '    }',
    '  ],',
    '  "rewrite": {                // REQUIRED when intent="rewrite", else null',
    '    "sectionCode": string | null,',
    '    "targetAgency": string | null,',
    '    "proposedContent": string, // the new section text',
    '    "rationale": string        // why this framing fits the agency / scope',
    '  } | null',
    '}',
    '',
    'Rules:',
    '1. Every factual claim in the prose must be cited inline as [SRC-n].',
    '2. If two sources disagree, cite both and label one supports / one contradicts.',
    '3. If the dossier is silent, say so explicitly and emit a citation with relationship="gap".',
    '4. Never infer from training data — if it isn\'t in the evidence, say so.',
    '5. Resolve coreferences ("that source", "the EU cohort") against the conversation history.',
    '6. Sentence case. No exclamations. Numbers over adjectives. Second person, direct.',
  ]
    .filter(line => line !== null)
    .join('\n');
}

interface ModelResponseShape {
  intent: SubmissionChatIntent | null;
  answer: string;
  citations: Array<{ ref: number; relationship: CitationRelationship }>;
  rewrite: SubmissionChatRewrite | null;
}

/**
 * Streaming-friendly prompt variant. Asks the model to emit tagged sections
 * (%%ANSWER%% / %%REWRITE%% / %%STRUCTURE%% / %%END%%) instead of one JSON
 * envelope, so the server can route token deltas to the right SSE channel
 * as they arrive. The structured metadata still comes through as a single
 * JSON object, just inside a marked section the parser can isolate.
 *
 * The dossier manifest, prior citations, conversation history, intent hint,
 * and evidence block are identical to the non-streaming prompt — only the
 * output contract differs.
 */
export function buildStreamingSystemPrompt(
  activeArtifact: ArtifactRow,
  projectArtifacts: ArtifactRow[],
  chunks: RetrievedChunk[],
  options: {
    intent?: SubmissionChatIntent;
    targetAgency?: string | null;
    sectionReference?: string | null;
    history?: ConversationTurn[];
    priorCitations?: PriorCitation[];
  } = {}
): string {
  const intent = options.intent ?? 'general';
  const targetAgency = options.targetAgency ?? null;
  const sectionReference = options.sectionReference ?? null;
  const history = options.history ?? [];
  const priorCitations = options.priorCitations ?? [];

  const dossierManifest = projectArtifacts
    .map(a => {
      const section = a.ctd_section ? ` ${a.ctd_section}` : '';
      const flag = a.id === activeArtifact.id ? ' (active)' : '';
      return `- [${a.artifact_id}]${section} ${a.title}${flag}`;
    })
    .join('\n');

  const evidenceLines = chunks.map((c, i) => {
    const sec = c.sectionCode ? ` ${c.sectionCode}` : '';
    const page = c.pageRef ? ` ${c.pageRef}` : '';
    const trimmed =
      c.content.length > 600 ? `${c.content.slice(0, 600)}…` : c.content;
    return `[SRC-${i + 1}] artifact=${c.artifactId}${sec}${page} title="${c.title}"\n${trimmed}`;
  });

  const intentBlock = (() => {
    switch (intent) {
      case 'provenance':
        return [
          '',
          'Detected intent: PROVENANCE.',
          'Resolve where each fact in the user\'s question came from. If the user',
          'refers to "this source" or "that citation", look at the conversation',
          'history above to identify which [SRC-n] they mean and explain its role.',
        ].join('\n');
      case 'cross_evidence':
        return [
          '',
          'Detected intent: CROSS-EVIDENCE.',
          'The user is asking about competing or contradictory data across the',
          'dossier. Cite both sides explicitly with supports / contradicts labels.',
        ].join('\n');
      case 'rewrite':
        return [
          '',
          `Detected intent: REWRITE${targetAgency ? ` (target agency: ${targetAgency})` : ''}.`,
          sectionReference
            ? `Target section: ${sectionReference}.`
            : 'Target: the active artifact (no explicit section reference).',
          'Flag any [SRC-n] that contradicts the active section in %%ANSWER%%',
          '(use relationship="contradicts" in the structure block), then emit',
          'the proposed new content in %%REWRITE%%.',
        ].join('\n');
      default:
        return '';
    }
  })();

  return [
    'You are AnA in submission-chat mode (streaming variant). The user has',
    'already generated a regulatory section and is now interrogating the draft.',
    'Your scope is the ENTIRE project dossier, not only the active document.',
    '',
    'Active artifact:',
    `- ${activeArtifact.artifact_id}${activeArtifact.ctd_section ? ` ${activeArtifact.ctd_section}` : ''} ${activeArtifact.title}`,
    '',
    `Project dossier (${projectArtifacts.length} artifact${projectArtifacts.length === 1 ? '' : 's'}):`,
    dossierManifest || '- (no sibling artifacts indexed)',
    renderPriorCitationsBlock(priorCitations),
    renderHistoryBlock(history),
    intentBlock,
    '',
    '--- CROSS-DOSSIER EVIDENCE ---',
    evidenceLines.join('\n\n') || '(no retrieved evidence — answer "I cannot verify that from the dossier")',
    '--- END EVIDENCE ---',
    '',
    'Output contract — emit the following sections in order, EXACTLY one of',
    'each, with no other text outside the markers:',
    '',
    '%%ANSWER%%',
    '<prose answer with [SRC-n] inline citations>',
    intent === 'rewrite' ? '%%REWRITE%%' : '',
    intent === 'rewrite' ? '<the proposed new section content with [SRC-n] citations>' : '',
    '%%STRUCTURE%%',
    '{',
    '  "intent": "provenance" | "cross_evidence" | "rewrite" | "general",',
    '  "citations": [',
    '    { "ref": <number>, "relationship": "supports" | "contradicts" | "gap" }',
    '  ]' + (intent === 'rewrite' ? ',' : ''),
    intent === 'rewrite'
      ? '  "rewriteMetadata": { "sectionCode": <string|null>, "targetAgency": <string|null>, "rationale": <string> }'
      : '',
    '}',
    '%%END%%',
    '',
    'Rules:',
    '1. Every factual claim must be cited inline with [SRC-n].',
    '2. If two sources disagree, cite both with supports / contradicts labels.',
    '3. If the dossier is silent, say so and use relationship="gap".',
    '4. Never infer from training data — if it isn\'t in the evidence, say so.',
    '5. Resolve coreferences ("that source", "the EU cohort") against the conversation history.',
    '6. Sentence case. No exclamations. Numbers over adjectives. Second person, direct.',
    '7. The %%STRUCTURE%% block is JSON — no markdown fences, no commentary inside it.',
  ]
    .filter(line => line !== '')
    .join('\n');
}

/**
 * Parse the structure JSON the streaming model emits. Distinct from
 * parseModelResponse because the streaming format separates the prose
 * (already streamed) from the metadata (this JSON). We accept slack:
 * the model occasionally adds trailing commentary or fences and we tolerate it.
 */
export function parseStreamingStructure(
  raw: string,
  fallbackAnswer: string,
  fallbackRewriteContent: string
): {
  intent: SubmissionChatIntent | null;
  citations: Array<{ ref: number; relationship: CitationRelationship }>;
  rewriteMetadata: {
    sectionCode: string | null;
    targetAgency: string | null;
    rationale: string;
  } | null;
} {
  const trimmed = (raw || '').trim();
  const candidates: string[] = [];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1]);
  candidates.push(trimmed);

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      const citations = Array.isArray(parsed?.citations)
        ? parsed.citations
            .map((c: any) => ({
              ref: Number(c?.ref),
              relationship: normalizeRelationship(c?.relationship),
            }))
            .filter((c: any) => Number.isFinite(c.ref))
        : [];
      const rm = parsed?.rewriteMetadata;
      const rewriteMetadata =
        rm && typeof rm === 'object'
          ? {
              sectionCode:
                typeof rm.sectionCode === 'string' && rm.sectionCode.trim()
                  ? rm.sectionCode
                  : null,
              targetAgency:
                typeof rm.targetAgency === 'string' && rm.targetAgency.trim()
                  ? String(rm.targetAgency).toUpperCase()
                  : null,
              rationale: typeof rm.rationale === 'string' ? rm.rationale : '',
            }
          : null;
      return {
        intent: normalizeIntent(parsed?.intent),
        citations,
        rewriteMetadata,
      };
    } catch {
      /* try the next candidate */
    }
  }
  return { intent: null, citations: [], rewriteMetadata: null };
}

/**
 * Parse the structured JSON the model is asked to emit. Falls back gracefully
 * when the model wraps the JSON in prose or markdown fences — we still want
 * a usable answer rather than a 500.
 */
export function parseModelResponse(raw: string): ModelResponseShape {
  const trimmed = (raw || '').trim();

  // Try fenced ```json … ``` first, then bare JSON.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenceMatch?.[1], trimmed].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (typeof parsed?.answer === 'string') {
        const citations = Array.isArray(parsed.citations)
          ? parsed.citations
              .map((c: any) => ({
                ref: Number(c?.ref),
                relationship: normalizeRelationship(c?.relationship),
              }))
              .filter((c: any) => Number.isFinite(c.ref))
          : [];
        return {
          intent: normalizeIntent(parsed.intent),
          answer: parsed.answer,
          citations,
          rewrite: normalizeRewrite(parsed.rewrite),
        };
      }
    } catch {
      /* try the next candidate */
    }
  }

  // Final fallback: treat the whole string as the answer with no structured
  // citations. The caller still derives [SRC-n] mentions from the prose.
  return { intent: null, answer: trimmed, citations: [], rewrite: null };
}

function normalizeRelationship(value: unknown): CitationRelationship {
  const v = String(value || '').toLowerCase();
  if (v === 'contradicts' || v === 'contradict') return 'contradicts';
  if (v === 'gap' || v === 'missing' || v === 'silent') return 'gap';
  return 'supports';
}

function normalizeIntent(value: unknown): SubmissionChatIntent | null {
  const v = String(value || '').toLowerCase();
  if (v === 'provenance' || v === 'cross_evidence' || v === 'rewrite' || v === 'general') {
    return v as SubmissionChatIntent;
  }
  return null;
}

function normalizeRewrite(value: unknown): SubmissionChatRewrite | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.proposedContent !== 'string' || !r.proposedContent.trim()) {
    return null;
  }
  return {
    sectionCode:
      typeof r.sectionCode === 'string' && r.sectionCode.trim()
        ? (r.sectionCode as string)
        : null,
    targetAgency:
      typeof r.targetAgency === 'string' && r.targetAgency.trim()
        ? (r.targetAgency as string).toUpperCase()
        : null,
    proposedContent: r.proposedContent as string,
    rationale: typeof r.rationale === 'string' ? (r.rationale as string) : '',
  };
}

export async function handleSubmissionChat(
  input: SubmissionChatRequest
): Promise<SubmissionChatResponse> {
  const startedAt = Date.now();

  if (!input.artifactId) {
    const err = new Error('artifactId is required');
    (err as any).code = 'INVALID_REQUEST';
    throw err;
  }
  if (!input.question || !input.question.trim()) {
    const err = new Error('question is required');
    (err as any).code = 'INVALID_REQUEST';
    throw err;
  }

  // Step 1 — resolve artifact + project scope.
  const artifact = await loadArtifact(input.artifactId, input.organizationId);
  const projectArtifacts = await loadProjectArtifacts(
    artifact.project_id,
    artifact.organization_id
  );

  // Step 2 — load conversation history + prior citations so coreferences
  // resolve and "why did you cite this source?" can refer back to the
  // [SRC-n] from the prior generation by exact rank.
  const [history, priorCitations] = await Promise.all([
    loadConversationHistory(input.threadId, HISTORY_TURN_LIMIT),
    loadPriorCitations(input.threadId, projectArtifacts),
  ]);

  // Step 3 — classify intent + extract structured hints. Cheap, deterministic.
  const intent = classifyIntent(input.question);
  const targetAgency = detectTargetAgency(input.question);
  const sectionReference = detectSectionReference(
    input.question,
    artifact.ctd_section
  );

  // Step 3a — confirm-apply short-circuit. The user is confirming a pending
  // rewrite ("apply that", "do it"). Don't burn an LLM call — return a
  // structured directive telling the client to POST the apply-rewrite
  // endpoint with the prior rewrite payload + reasonForChange + signature.
  // The actual mutation is governed by that route, never auto-applied here.
  if (intent === 'confirm_apply') {
    const requiresSignature =
      !!(artifact as any).metadata &&
      (artifact as any).metadata.requiresSignature === true;

    // Look up the latest pending proposal for this thread + artifact. When
    // one exists, the client should apply by proposalId — that's what binds
    // the apply call to the exact content the user saw, server-side.
    const activeProposal = await getActiveProposalForThreadArtifact(
      input.threadId,
      artifact.artifact_id,
      artifact.organization_id
    );

    const hasProposal = !!activeProposal;
    const directiveAnswer = !hasProposal
      ? 'I do not have a pending rewrite for this artifact in this thread. Generate or refine a rewrite first, then say "apply that".'
      : requiresSignature
        ? 'Ready to apply. To proceed I need a reason for the change and an electronic signature attesting to it. The artifact is marked requires-signature.'
        : 'Ready to apply. To proceed I need a reason for the change. An electronic signature is optional but recorded if provided.';

    // Persist the turn so the thread stays continuous.
    try {
      await saveChatMessage(
        input.threadId,
        'user',
        input.question,
        'submission-chat:confirm'
      );
      await saveChatMessage(
        input.threadId,
        'assistant',
        directiveAnswer,
        'submission-chat:confirm'
      );
    } catch (e: any) {
      if (e?.code !== '42P01') {
        console.warn(
          '[AnA submission-chat] confirm-apply persist failed:',
          e?.message
        );
      }
    }

    const requiredFields: SubmissionChatConfirmApply['requiredFields'] = hasProposal
      ? requiresSignature
        ? ['proposalId', 'reasonForChange', 'signature']
        : ['proposalId', 'reasonForChange']
      : requiresSignature
        ? ['proposedContent', 'reasonForChange', 'signature']
        : ['proposedContent', 'reasonForChange'];

    return {
      threadId: input.threadId,
      artifactId: artifact.artifact_id,
      projectId: artifact.project_id,
      intent: 'confirm_apply',
      answer: directiveAnswer,
      citations: [],
      rewrite: null,
      confirmApply: {
        endpoint: '/api/ana/submission-chat/apply-rewrite',
        artifactId: artifact.artifact_id,
        proposalId: activeProposal?.id ?? null,
        proposalExpiresAt: activeProposal?.expiresAt
          ? new Date(activeProposal.expiresAt).toISOString()
          : null,
        hint: hasProposal ? 'use_proposal_id' : 'use_prior_rewrite_payload',
        requiredFields,
        signatureRequired: requiresSignature,
        message: directiveAnswer,
      },
      retrieval: {
        artifactsInScope: projectArtifacts.length,
        chunksRetrieved: 0,
        chunksConsidered: 0,
        retrievalQuery: input.question,
      },
      conversation: {
        historyMessages: 0,
        priorCitations: 0,
      },
      model: 'submission-chat:confirm',
      provider: 'system',
      latencyMs: Date.now() - startedAt,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  // Step 4 — project-tier memory (rules, decisions, prior answers).
  const memoryResult = await buildMemoryContextForChat({
    threadId: input.threadId,
    organizationId: artifact.organization_id,
    projectId: artifact.project_id,
    query: input.question,
    limitPerLayer: 4,
    maxChars: 3000,
  });

  // Step 5 — cross-document retrieval through the advanced RAG pipeline.
  // The pipeline does HyDE + multi-query + cross-encoder rerank + MMR,
  // routed through a project-scoped initial retrieval (lumen_data_atoms +
  // search_atoms_hybrid) so cross-project chunks never appear in the
  // candidate set. Rewrite intent gets a second pass keyed on the active
  // artifact's content — that surfaces passages most likely to contradict
  // the section and feeds them in alongside the user-question results.
  const retrievalQuery = buildRetrievalQuery(input.question, history);
  const orgUuid = input.organizationUuid || undefined;
  const validOrgUuid =
    orgUuid && /^[0-9a-f-]{36}$/i.test(orgUuid) ? orgUuid : undefined;

  let rawHits: Array<{ id: string; title: string; content: string; score: number }> = [];
  if (validOrgUuid) {
    const ragPipeline = getRAGPipeline(pool);
    const artifactScope = {
      projectId: artifact.project_id,
      organizationUuid: validOrgUuid,
    };

    // The "advanced" strategy combines HyDE + multi-query, then rerank + MMR
    // run on top. This is the canonical cross-module retrieval path.
    const primary = ragPipeline
      .retrieve(retrievalQuery, {
        strategy: 'advanced',
        limit: RETRIEVAL_TOP_K,
        threshold: RETRIEVAL_THRESHOLD,
        useReranking: true,
        useMmr: true,
        mmrLambda: 0.7,
        organizationUuid: validOrgUuid,
        artifactScope,
      })
      .catch(err => {
        console.warn(
          '[AnA submission-chat] advanced RAG retrieval failed, returning empty:',
          err?.message
        );
        return {
          documents: [] as Array<{
            id: string;
            chunkId?: string;
            title: string;
            content: string;
            finalScore: number;
            initialScore: number;
            rerankScore?: number;
          }>,
          totalCandidates: 0,
          retrievalStrategy: 'failed',
          processingTimeMs: 0,
          tokensUsed: 0,
        };
      });

    const useArtifactScan =
      intent === 'rewrite' &&
      typeof artifact.content === 'string' &&
      artifact.content.trim().length > 0;
    const artifactScan = useArtifactScan
      ? ragPipeline
          .retrieve((artifact.content as string).slice(0, 2000), {
            // Cheaper basic strategy with rerank for the contradiction sweep —
            // we don't need HyDE/multi-query expansion of the artifact text.
            strategy: 'basic',
            limit: Math.max(4, Math.floor(RETRIEVAL_TOP_K / 2)),
            threshold: RETRIEVAL_THRESHOLD,
            useReranking: true,
            useMmr: false,
            organizationUuid: validOrgUuid,
            artifactScope,
          })
          .catch(err => {
            console.warn(
              '[AnA submission-chat] artifact-scan retrieval failed:',
              err?.message
            );
            return null;
          })
      : Promise.resolve(null);

    const [primaryCtx, scanCtx] = await Promise.all([primary, artifactScan]);

    // Merge + dedupe by chunk id, take the higher final score when both pass
    // return the same chunk, then trim back to RETRIEVAL_TOP_K.
    const byId = new Map<
      string,
      { id: string; title: string; content: string; score: number }
    >();
    const ingest = (docs: Array<{
      id: string;
      chunkId?: string;
      title: string;
      content: string;
      finalScore: number;
    }>) => {
      for (const d of docs) {
        const id = d.chunkId || d.id;
        const incoming = {
          id,
          title: d.title,
          content: d.content,
          score: d.finalScore,
        };
        const existing = byId.get(id);
        if (!existing || incoming.score > existing.score) byId.set(id, incoming);
      }
    };
    ingest(primaryCtx.documents);
    if (scanCtx) ingest(scanCtx.documents);

    rawHits = Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVAL_TOP_K);
  }

  const chunks = await enrichChunksWithArtifactMetadata(rawHits, projectArtifacts);

  // Step 6 — generate the cross-dossier answer.
  const gw = ensureGateway();
  if (!gw || gw.getEnabledProviders().length === 0) {
    const err = new Error('AI provider unavailable');
    (err as any).code = 'AI_PROVIDER_UNAVAILABLE';
    throw err;
  }

  const systemPrompt =
    buildSystemPrompt(artifact, projectArtifacts, chunks, {
      intent,
      targetAgency,
      sectionReference,
      history,
      priorCitations,
    }) + (memoryResult.memoryBlock ? `\n${memoryResult.memoryBlock}` : '');

  // Pass the conversation as message turns too (in addition to the transcript
  // baked into the system prompt) so the model sees the actual structure of
  // the dialogue. Trim long assistant turns the same way the prompt does.
  const conversationTurns = history.map(turn => ({
    role: turn.role,
    content:
      turn.content.length > 1500
        ? `${turn.content.slice(0, 1500)}…`
        : turn.content,
  }));

  const gwResponse = await gw.route({
    taskType: 'regulatory_review',
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationTurns,
      { role: 'user', content: input.question },
    ],
    maxTokens: GENERATION_MAX_TOKENS,
    temperature: 0.2,
    jsonMode: true,
    callerModule: 'ana-submission-chat',
    organizationId: artifact.organization_id,
    userId: input.userId ?? undefined,
  });

  const parsed = parseModelResponse(gwResponse.content || '');
  const answer = parsed.answer || 'No response generated.';

  // Step 5 — assemble structured citations[]. The model emits a relationship
  // label per [SRC-n] it cites; we union that with the actual [SRC-n]
  // mentions in the prose so a citation list stays consistent even when the
  // model omits it from the JSON envelope.
  const relationshipByRef = new Map<number, CitationRelationship>();
  for (const c of parsed.citations) {
    if (c.ref >= 1 && c.ref <= chunks.length) {
      relationshipByRef.set(c.ref, c.relationship);
    }
  }
  const proseRefs = new Set<number>();
  const refPattern = /\[SRC-(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = refPattern.exec(answer)) !== null) {
    const idx = parseInt(m[1], 10);
    if (idx >= 1 && idx <= chunks.length) proseRefs.add(idx);
  }
  for (const ref of proseRefs) {
    if (!relationshipByRef.has(ref)) relationshipByRef.set(ref, 'supports');
  }

  const citations: SubmissionChatCitation[] = Array.from(
    relationshipByRef.entries()
  )
    .sort((a, b) => a[0] - b[0])
    .map(([ref, relationship]) => {
      const c = chunks[ref - 1];
      const snippet =
        c.content.length > 320 ? `${c.content.slice(0, 320)}…` : c.content;
      return {
        artifactId: c.artifactId,
        sectionCode: c.sectionCode,
        pageRef: c.pageRef,
        passageSnippet: snippet,
        relationship,
        title: c.title,
        score: c.score,
      };
    });

  // Step 7 — finalize the rewrite payload. If the model declared rewrite
  // intent but didn't include a "rewrite" object, treat the answer as the
  // proposed content so callers always get something to render. Conversely,
  // if the user clearly asked to rewrite but the model returned only an
  // answer, mark it as a rewrite anyway (best-effort).
  const resolvedIntent: SubmissionChatIntent =
    parsed.intent ?? intent;
  const modelName = `${gwResponse.provider}/${gwResponse.model}`;

  let rewrite: SubmissionChatRewrite | null = parsed.rewrite;
  if (resolvedIntent === 'rewrite' && !rewrite && answer) {
    rewrite = {
      sectionCode: sectionReference,
      targetAgency,
      proposedContent: answer,
      rationale: '',
    };
  }
  if (rewrite && !rewrite.sectionCode && sectionReference) {
    rewrite.sectionCode = sectionReference;
  }
  if (rewrite && !rewrite.targetAgency && targetAgency) {
    rewrite.targetAgency = targetAgency;
  }

  // Run the deterministic verifier across the proposal's paragraphs so the
  // UI / caller can see "this rewrite has 2 WEAK + 1 UNSUPPORTED claim"
  // BEFORE clicking apply. Chunks are scored relative to the live retrieval,
  // so the verifier sees real citation relevance, not heuristic guesses.
  if (rewrite && rewrite.proposedContent && chunks.length > 0) {
    const { perParagraph, statusCounts } = verifyRewriteClaims(
      rewrite.proposedContent,
      chunks
    );
    rewrite.claimVerification = perParagraph;
    rewrite.claimStatusCounts = statusCounts;
  }

  // Persist the proposal server-side so confirm_apply / apply-rewrite can
  // resolve to a tamper-evident id rather than trusting the client to
  // re-send the content. Auto-supersedes any older pending proposals for
  // the same artifact. Best-effort: missing migration tolerated.
  if (rewrite && rewrite.proposedContent) {
    try {
      const handle = await persistRewriteProposal({
        threadId: input.threadId,
        artifactId: artifact.artifact_id,
        artifactPk: artifact.id,
        organizationId: artifact.organization_id,
        projectId: artifact.project_id,
        sectionCode: rewrite.sectionCode,
        targetAgency: rewrite.targetAgency,
        rationale: rewrite.rationale ?? null,
        proposedContent: rewrite.proposedContent,
        claimVerification: rewrite.claimVerification ?? null,
        claimStatusCounts: rewrite.claimStatusCounts ?? null,
        createdBy: input.userId ?? null,
      });
      if (handle) {
        rewrite.proposalId = handle.id;
        rewrite.proposalContentHash = handle.contentHash;
        rewrite.proposalExpiresAt = handle.expiresAt.toISOString();
      } else {
        rewrite.proposalId = null;
        rewrite.proposalContentHash = null;
        rewrite.proposalExpiresAt = null;
      }
    } catch (err: any) {
      console.warn(
        '[AnA submission-chat] proposal persist failed (continuing without):',
        err?.message
      );
      rewrite.proposalId = null;
    }
  }

  // Step 8 — persist the turn. Two surfaces:
  //   - chat_messages: the conversation history the next turn will read.
  //   - ai_messages: the audit-grade provenance chain.
  // Both may be missing in dev/test envs (42P01 is tolerated).
  try {
    await saveChatMessage(input.threadId, 'user', input.question, modelName);
    await saveChatMessage(
      input.threadId,
      'assistant',
      answer,
      modelName,
      gwResponse.usage.totalTokens
    );
  } catch (e: any) {
    if (e?.code !== '42P01') {
      console.warn(
        '[AnA submission-chat] chat_messages persist failed:',
        e?.message
      );
    }
  }

  try {
    await pool.query(
      `INSERT INTO ai_threads (id, organization_id, project_id, created_by)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [
        input.threadId,
        artifact.organization_id,
        artifact.project_id,
        input.userId ?? null,
      ]
    );
    await pool.query(
      `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'user', $2)`,
      [input.threadId, input.question]
    );
    await pool.query(
      `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'assistant', $2)`,
      [input.threadId, answer]
    );
  } catch (e: any) {
    if (e?.code !== '42P01') {
      console.warn(
        '[AnA submission-chat] ai_messages persist failed:',
        e?.message
      );
    }
  }

  return {
    threadId: input.threadId,
    artifactId: artifact.artifact_id,
    projectId: artifact.project_id,
    intent: resolvedIntent,
    answer,
    citations,
    rewrite,
    confirmApply: null,
    retrieval: {
      artifactsInScope: projectArtifacts.length,
      chunksRetrieved: chunks.length,
      chunksConsidered: rawHits.length,
      retrievalQuery,
    },
    conversation: {
      historyMessages: history.length,
      priorCitations: priorCitations.length,
    },
    model: modelName,
    provider: gwResponse.provider,
    latencyMs: Date.now() - startedAt,
    usage: {
      promptTokens: gwResponse.usage.inputTokens,
      completionTokens: gwResponse.usage.outputTokens,
      totalTokens: gwResponse.usage.totalTokens,
    },
  };
}

/**
 * Detect whether the previous assistant turn was a section generation, so the
 * main chat handler can flip into submission-chat mode automatically when the
 * user asks a follow-up provenance question.
 *
 * Heuristic — the section-generation flow either:
 *   - emits a guidance action of type generate_section / generate_document
 *     that ana-guidance-executor records on the assistant message, OR
 *   - leaves a CTD-shaped header (e.g. "## 9.2", "§4.1") in the assistant body.
 */
export function isPostSectionGenerationTurn(
  previousMessages: Array<{ role: string; content: string }>,
  executedActions?: Array<{ actionType: string; executed: boolean }>
): boolean {
  if (
    executedActions &&
    executedActions.some(
      a =>
        a.executed &&
        /^(generate_section|generate_document|draft_section|generate_artifact)$/.test(
          a.actionType
        )
    )
  ) {
    return true;
  }

  const lastAssistant = [...previousMessages]
    .reverse()
    .find(m => m.role === 'assistant');
  if (!lastAssistant) return false;

  const body = lastAssistant.content || '';
  if (body.length < 400) return false;

  // CTD / eCTD section header shapes used by the generation handlers.
  return /(^|\n)\s*(?:##\s*\d+(?:\.\d+)+|§\s*\d+(?:\.\d+)+|Module\s+[1-5])/i.test(
    body
  );
}
