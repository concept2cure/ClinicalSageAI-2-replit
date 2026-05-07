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
import { getEmbeddingService } from '../enhancedEmbeddingService.js';
import { buildMemoryContextForChat } from '../memory-context-assembler.js';

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

export interface SubmissionChatCitation {
  artifactId: string;
  sectionCode: string | null;
  pageRef: string | null;
  passageSnippet: string;
  relationship: CitationRelationship;
  title?: string;
  score?: number;
}

export interface SubmissionChatRequest {
  threadId: string;
  artifactId: string;
  question: string;
  organizationId?: number | null;
  organizationUuid?: string | null;
  userId?: number | null;
}

export interface SubmissionChatResponse {
  threadId: string;
  artifactId: string;
  projectId: number;
  answer: string;
  citations: SubmissionChatCitation[];
  retrieval: {
    artifactsInScope: number;
    chunksRetrieved: number;
    chunksConsidered: number;
  };
  model: string;
  provider: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface ArtifactRow {
  id: number;
  artifact_id: string;
  project_id: number;
  organization_id: number;
  ctd_section: string | null;
  title: string;
  type: string;
  category: string;
}

interface RetrievedChunk {
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
async function loadArtifact(
  artifactId: string,
  organizationId?: number | null
): Promise<ArtifactRow> {
  const { rows } = await pool.query(
    `SELECT id, artifact_id, project_id, organization_id, ctd_section, title, type, category
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
async function loadProjectArtifacts(
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
async function enrichChunksWithArtifactMetadata(
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

/**
 * Build the cross-dossier evidence block and prompt the model to label each
 * citation it uses with supports / contradicts / gap.
 */
function buildSystemPrompt(
  activeArtifact: ArtifactRow,
  projectArtifacts: ArtifactRow[],
  chunks: RetrievedChunk[]
): string {
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

  return [
    'You are AnA in submission-chat mode. The user has already generated a regulatory',
    'section and is now interrogating the draft. Your scope is the ENTIRE project',
    'dossier, not only the active document. When you cite, you MUST classify each',
    'citation as supports | contradicts | gap relative to the user\'s question.',
    '',
    'Active artifact:',
    `- ${activeArtifact.artifact_id}${activeArtifact.ctd_section ? ` ${activeArtifact.ctd_section}` : ''} ${activeArtifact.title}`,
    '',
    `Project dossier (${projectArtifacts.length} artifact${projectArtifacts.length === 1 ? '' : 's'}):`,
    dossierManifest || '- (no sibling artifacts indexed)',
    '',
    '--- CROSS-DOSSIER EVIDENCE (cite as [SRC-n]) ---',
    evidenceLines.join('\n\n') || '(no retrieved evidence — answer "I cannot verify that from the dossier")',
    '--- END EVIDENCE ---',
    '',
    'Rules:',
    '1. Cite inline as [SRC-n]. Every factual claim must be backed by a citation.',
    '2. If two sources disagree, surface it explicitly and label one supports / one contradicts.',
    '3. If the answer is not present in the evidence, say so — do not infer from training data.',
    '4. Sentence case. No exclamations. Numbers over adjectives. Second person, direct.',
  ].join('\n');
}

/**
 * Heuristic mapping of model output → citation relationship.
 * The model is asked to label inline; we additionally scan for nearby cues so
 * the structured citations[] list can be rendered without further LLM calls.
 */
function inferRelationshipFromAnswer(
  answer: string,
  refIndex: number
): CitationRelationship {
  const ref = `[SRC-${refIndex + 1}]`;
  const lower = answer.toLowerCase();
  const refPos = answer.indexOf(ref);
  if (refPos === -1) return 'supports';

  // Look at the 200 chars surrounding the citation for contradiction cues.
  const window = lower.slice(
    Math.max(0, refPos - 200),
    Math.min(lower.length, refPos + 200)
  );
  if (
    /contradict|disagree|conflict|inconsisten|differ|but [a-z]+ states|however/.test(
      window
    )
  ) {
    return 'contradicts';
  }
  if (/missing|absent|not (?:present|reported|recorded|specified)|gap|unclear/.test(window)) {
    return 'gap';
  }
  return 'supports';
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

  // Step 2 — project-tier memory (rules, decisions, prior answers).
  const memoryResult = await buildMemoryContextForChat({
    threadId: input.threadId,
    organizationId: artifact.organization_id,
    projectId: artifact.project_id,
    query: input.question,
    limitPerLayer: 4,
    maxChars: 3000,
  });

  // Step 3 — cross-document retrieval, scoped to the parent project.
  const embeddingService = getEmbeddingService(pool);
  const orgUuid = input.organizationUuid || undefined;
  const validOrgUuid =
    orgUuid && /^[0-9a-f-]{36}$/i.test(orgUuid) ? orgUuid : undefined;

  let rawHits: Array<{ id: string; title: string; content: string; score: number }> = [];
  if (validOrgUuid) {
    rawHits = await embeddingService.searchHybrid(
      input.question,
      RETRIEVAL_TOP_K,
      RETRIEVAL_THRESHOLD,
      validOrgUuid,
      String(artifact.project_id)
    );
  }

  const chunks = await enrichChunksWithArtifactMetadata(rawHits, projectArtifacts);

  // Step 4 — generate the cross-dossier answer.
  const gw = ensureGateway();
  if (!gw || gw.getEnabledProviders().length === 0) {
    const err = new Error('AI provider unavailable');
    (err as any).code = 'AI_PROVIDER_UNAVAILABLE';
    throw err;
  }

  const systemPrompt =
    buildSystemPrompt(artifact, projectArtifacts, chunks) +
    (memoryResult.memoryBlock ? `\n${memoryResult.memoryBlock}` : '');

  const gwResponse = await gw.route({
    taskType: 'regulatory_review',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.question },
    ],
    maxTokens: GENERATION_MAX_TOKENS,
    temperature: 0.2,
    callerModule: 'ana-submission-chat',
    organizationId: artifact.organization_id,
    userId: input.userId ?? undefined,
  });

  const answer = gwResponse.content || 'No response generated.';

  // Step 5 — turn [SRC-n] markers into the structured citations[] contract.
  const citedIndices = new Set<number>();
  const refPattern = /\[SRC-(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = refPattern.exec(answer)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < chunks.length) citedIndices.add(idx);
  }

  const citations: SubmissionChatCitation[] = Array.from(citedIndices)
    .sort((a, b) => a - b)
    .map(idx => {
      const c = chunks[idx];
      const snippet =
        c.content.length > 320 ? `${c.content.slice(0, 320)}…` : c.content;
      return {
        artifactId: c.artifactId,
        sectionCode: c.sectionCode,
        pageRef: c.pageRef,
        passageSnippet: snippet,
        relationship: inferRelationshipFromAnswer(answer, idx),
        title: c.title,
        score: c.score,
      };
    });

  return {
    threadId: input.threadId,
    artifactId: artifact.artifact_id,
    projectId: artifact.project_id,
    answer,
    citations,
    retrieval: {
      artifactsInScope: projectArtifacts.length,
      chunksRetrieved: chunks.length,
      chunksConsidered: rawHits.length,
    },
    model: `${gwResponse.provider}/${gwResponse.model}`,
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
