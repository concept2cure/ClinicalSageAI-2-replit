/**
 * AI Context Builder — Enterprise Regulatory AI Safety Layer
 *
 * Every AI call in the platform MUST go through this service.
 * Enforces mandatory context (submission type, module/section, document ID,
 * user identity, source set) on every request to the backend AI endpoints.
 *
 * This is the single gateway for all AI interactions — no direct fetch()
 * to AI endpoints should exist outside this module.
 *
 * Backend endpoints used:
 *   POST /api/chat/send-message   — conversational AI with thread support
 *   POST /api/cortex/query        — search, generate, advisory, graph modes
 *   POST /api/ai/assist           — regulatory_review, compliance_check, content_enhancement
 *
 * @version 2.0.0
 * @compliance 21 CFR Part 11 (audit trail), ICH E6(R3) (data integrity)
 */

// ─── Required Context Schema ────────────────────────────────────────────────

/**
 * @typedef {Object} AIContext
 * @property {string} submissionType - IND | NDA | BLA | 510k | PMA | IVDR
 * @property {string} module - CTD module (e.g., "2", "3", "5")
 * @property {string} section - CTD section (e.g., "2.7.3", "3.2.S.1")
 * @property {string} documentId - Document UUID or numeric ID
 * @property {string} versionId - Document version identifier
 * @property {string} userId - Authenticated user ID
 * @property {string} userRole - User's role (author, reviewer, approver, admin, viewer)
 * @property {string} userName - Display name for audit trail
 * @property {string[]} sourceSet - Document IDs / artifact IDs allowed as sources
 * @property {string} [projectId] - Optional project context
 */

/**
 * @typedef {Object} Citation
 * @property {string} id - Citation ID (e.g., "cite-1")
 * @property {string} documentId - Source document ID
 * @property {string} title - Source document title
 * @property {string} section - Section within source
 * @property {number|null} pageNumber - Page number if available
 * @property {string} snippet - Relevant text snippet (max 300 chars)
 * @property {string} snippetHash - FNV-1a hash of snippet for verification
 * @property {number} relevanceScore - 0-1 relevance score
 */

/**
 * @typedef {Object} ProvenanceMetadata
 * @property {string} model - Model name and version
 * @property {string} generatedAt - ISO timestamp
 * @property {string} requestedBy - User ID
 * @property {string} requestedByName - User display name
 * @property {string} section - Target CTD section
 * @property {string} submissionType - Submission type
 * @property {string} documentId - Target document
 * @property {string} versionId - Target version
 * @property {string[]} sourceDocuments - IDs of documents used as sources
 * @property {string} prompt - Original prompt (for audit trail)
 */

/**
 * @typedef {Object} AIResponse
 * @property {string} content - The AI-generated text
 * @property {Citation[]} citations - Array of source citations
 * @property {number} confidence - 0-1 confidence score
 * @property {string} model - Model identifier
 * @property {boolean} isRealAI - Whether this came from a real AI model
 * @property {boolean} hasCitations - Whether any citations were returned
 * @property {ProvenanceMetadata} provenance - Full provenance trail
 */

const VALID_SUBMISSION_TYPES = ['IND', 'NDA', 'BLA', '510k', 'PMA', 'IVDR'];
const VALID_ROLES = ['author', 'reviewer', 'approver', 'admin', 'viewer'];

/**
 * Validates that all required context fields are present and valid.
 * Throws if any field is missing — this is intentional to prevent
 * uncontextualized AI calls from slipping through.
 *
 * @param {AIContext} context
 * @throws {Error} AIContextError with validationErrors array
 */
export function validateContext(context) {
  if (!context || typeof context !== 'object') {
    const error = new Error('AI Context validation failed: context is required');
    error.name = 'AIContextError';
    error.validationErrors = ['context must be a non-null object'];
    throw error;
  }

  const errors = [];

  if (!context.submissionType || !VALID_SUBMISSION_TYPES.includes(context.submissionType)) {
    errors.push(`submissionType must be one of: ${VALID_SUBMISSION_TYPES.join(', ')} (got: "${context.submissionType || ''}")`);
  }
  if (!context.module) {
    errors.push('module is required (e.g., "2", "3", "5")');
  }
  if (!context.section) {
    errors.push('section is required (e.g., "2.7.3", "3.2.S.1")');
  }
  if (!context.documentId) {
    errors.push('documentId is required');
  }
  if (!context.versionId) {
    errors.push('versionId is required');
  }
  if (!context.userId) {
    errors.push('userId is required');
  }
  if (!context.userRole || !VALID_ROLES.includes(context.userRole)) {
    errors.push(`userRole must be one of: ${VALID_ROLES.join(', ')} (got: "${context.userRole || ''}")`);
  }
  if (!Array.isArray(context.sourceSet)) {
    errors.push('sourceSet must be an array of allowed source document IDs (can be empty [])');
  }

  if (errors.length > 0) {
    const error = new Error(`AI Context validation failed:\n  - ${errors.join('\n  - ')}`);
    error.name = 'AIContextError';
    error.validationErrors = errors;
    throw error;
  }
}

/**
 * Builds the headers sent with every AI request for audit trail and routing.
 * Uses 'selectedOrganizationId' key to match CoAuthor.jsx convention.
 */
function buildHeaders(context) {
  return {
    'Content-Type': 'application/json',
    'X-Organization-Id': localStorage.getItem('selectedOrganizationId') || '1',
    'X-User-Id': String(context.userId),
    'X-User-Role': String(context.userRole),
    'X-Document-Id': String(context.documentId),
    'X-Submission-Type': String(context.submissionType),
  };
}

/**
 * Safely parses a JSON response, returning a structured error on failure.
 */
async function safeJsonParse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from AI service: ${text.substring(0, 200)}`);
  }
}

// ─── Core AI Gateway Functions ──────────────────────────────────────────────

/**
 * Send a contextual chat message to the AI backend.
 * Uses /api/chat/send-message with full regulatory context.
 *
 * @param {string} message - User's message
 * @param {AIContext} context - Full regulatory context
 * @param {Object} [options] - Additional options
 * @param {string} [options.threadId] - Existing thread ID for continuation
 * @returns {Promise<AIResponse>}
 */
export async function sendContextualMessage(message, context, options = {}) {
  validateContext(context);

  const systemPrompt = buildSystemPrompt(context);

  const response = await fetch('/api/chat/send-message', {
    method: 'POST',
    headers: buildHeaders(context),
    body: JSON.stringify({
      message,
      thread_id: options.threadId || null,
      system_prompt: systemPrompt,
      context: {
        submissionType: context.submissionType,
        module: context.module,
        section: context.section,
        documentId: context.documentId,
        versionId: context.versionId,
        sourceSet: context.sourceSet,
        projectId: context.projectId || null,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`AI chat service returned ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await safeJsonParse(response);
  return normalizeResponse(data, context, message);
}

/**
 * Perform a contextual semantic search with source traceability.
 * Uses /api/cortex/query in search mode.
 *
 * @param {string} query - Search query
 * @param {AIContext} context - Full regulatory context
 * @param {Object} [options] - Search options
 * @param {number} [options.limit=10] - Max results
 * @param {number} [options.threshold=0.5] - Minimum relevance score
 * @param {Object} [options.filters] - Additional search filters
 * @returns {Promise<{sources: Citation[], metadata: Object}>}
 */
export async function searchWithContext(query, context, options = {}) {
  validateContext(context);

  const response = await fetch('/api/cortex/query', {
    method: 'POST',
    headers: buildHeaders(context),
    body: JSON.stringify({
      query,
      mode: 'search',
      options: {
        limit: options.limit || 10,
        threshold: options.threshold || 0.5,
        useReranking: true,
        filters: options.filters || {},
        retrievalStrategy: 'advanced',
      },
      context: {
        submissionType: context.submissionType,
        projectId: context.projectId || null,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Search service returned ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await safeJsonParse(response);

  return {
    sources: (data.results?.sources || []).map((s, i) => ({
      id: s.id || `src-${i + 1}`,
      documentId: s.documentId || s.id || '',
      title: s.title || 'Unknown Source',
      content: s.content || '',
      score: typeof s.score === 'number' ? s.score : 0,
      atomType: s.atomType || null,
      locator: s.locator || null,
      pageNumber: s.pageNumber || null,
      chunkId: s.chunkId || null,
    })),
    metadata: {
      ...(data.metadata || {}),
      query,
      context: {
        submissionType: context.submissionType,
        section: context.section,
      },
    },
  };
}

/**
 * Generate AI content with full context — for drafting, enhancement, compliance checks.
 * Uses /api/cortex/query in generate mode with citations.
 *
 * @param {string} prompt - Generation prompt
 * @param {AIContext} context - Full regulatory context
 * @param {Object} [options] - Generation options
 * @param {string} [options.retrievalStrategy='advanced'] - Retrieval strategy
 * @param {number} [options.sourceLimit=5] - Max source documents to retrieve
 * @param {string[]} [options.previousQueries] - Previous queries for multi-turn context
 * @returns {Promise<AIResponse>}
 */
export async function generateWithContext(prompt, context, options = {}) {
  validateContext(context);

  const response = await fetch('/api/cortex/query', {
    method: 'POST',
    headers: buildHeaders(context),
    body: JSON.stringify({
      query: prompt,
      mode: 'generate',
      persistCitations: true,
      options: {
        retrievalStrategy: options.retrievalStrategy || 'advanced',
        limit: options.sourceLimit || 5,
        useReranking: true,
      },
      context: {
        submissionType: context.submissionType,
        projectId: context.projectId || null,
        previousQueries: options.previousQueries || [],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Generation service returned ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await safeJsonParse(response);
  return normalizeResponse(data, context, prompt);
}

/**
 * AI-powered compliance check for document content.
 * Builds a specialized prompt targeting ICH M4 and regional requirements.
 *
 * @param {string} content - Document content to check
 * @param {AIContext} context - Full regulatory context
 * @param {Object} [options] - Generation options
 * @returns {Promise<AIResponse>}
 */
export async function checkComplianceWithContext(content, context, options = {}) {
  validateContext(context);

  const compliancePrompt = [
    `Perform a regulatory compliance review of the following ${context.submissionType} submission content`,
    `for CTD Module ${context.module}, Section ${context.section}.`,
    '',
    'Check for:',
    '1. Missing required elements per ICH M4 Common Technical Document structure',
    '2. Inconsistencies with regional requirements (FDA, EMA, PMDA)',
    '3. Data integrity issues or unsupported claims',
    '4. Formatting or terminology deviations from regulatory standards',
    '5. Cross-reference completeness and accuracy',
    '',
    'For each finding, provide:',
    '- Severity (Critical / Major / Minor)',
    '- Location in the text',
    '- Specific requirement being violated',
    '- Recommended remediation',
    '',
    'Content to review:',
    '',
    content,
  ].join('\n');

  return generateWithContext(compliancePrompt, context, {
    ...options,
    retrievalStrategy: 'advanced',
  });
}

// ─── Response Normalization ─────────────────────────────────────────────────

function normalizeResponse(raw, context, originalPrompt) {
  // Handle various response shapes from different endpoints
  const answer = raw?.results?.answer
    || raw?.answer
    || raw?.content
    || raw?.response
    || '';

  const rawSources = raw?.results?.sources || raw?.sources || [];

  // Build citations from sources
  const citations = rawSources.map((s, i) => {
    const snippet = (s.content || '').substring(0, 300);
    return {
      id: `cite-${i + 1}`,
      documentId: s.documentId || s.id || '',
      title: s.title || 'Unknown Source',
      section: s.locator || s.atomType || '',
      pageNumber: s.pageNumber || null,
      snippet,
      snippetHash: hashSnippet(snippet),
      relevanceScore: typeof s.score === 'number' ? s.score : 0,
    };
  });

  // Compute confidence from source relevance scores
  const avgScore = citations.length > 0
    ? citations.reduce((sum, c) => sum + c.relevanceScore, 0) / citations.length
    : 0;
  // No citations = low confidence; clamp to 1.0 max
  const confidence = citations.length === 0 ? 0.1 : Math.min(avgScore, 1.0);

  const model = raw?.metadata?.aiModel || raw?.model || 'unknown';
  const isRealAI = model !== 'lumen-cortex-demo'
    && model !== 'fallback'
    && model !== 'unknown'
    && model !== 'demo';

  return {
    content: answer,
    citations,
    confidence,
    model,
    isRealAI,
    hasCitations: citations.length > 0,
    provenance: {
      model,
      generatedAt: new Date().toISOString(),
      requestedBy: String(context.userId || ''),
      requestedByName: String(context.userName || 'Unknown'),
      section: String(context.section || ''),
      submissionType: String(context.submissionType || ''),
      documentId: String(context.documentId || ''),
      versionId: String(context.versionId || ''),
      sourceDocuments: citations.map(c => c.documentId).filter(Boolean),
      prompt: (originalPrompt || '').substring(0, 500), // Truncate for storage
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildSystemPrompt(context) {
  const sourceList = Array.isArray(context.sourceSet) && context.sourceSet.length > 0
    ? context.sourceSet.join(', ')
    : 'No specific sources provided — use general regulatory knowledge only.';

  return `You are a regulatory affairs AI assistant for ${context.submissionType} submissions.

CONTEXT:
- Submission Type: ${context.submissionType}
- CTD Module: ${context.module}
- Section: ${context.section}
- Document ID: ${context.documentId}
- Document Version: ${context.versionId}

RULES:
1. Only reference information from the provided source documents when available.
2. If you cannot find supporting evidence, clearly state "No sources available for this claim."
3. Always cite the source document, section, and page when referencing data using [N] markers.
4. Use regulatory-appropriate language per ICH M4 guidelines.
5. Flag any content that may need verification with [NEEDS VERIFICATION].
6. Do not fabricate clinical data, statistics, or regulatory references.

SOURCE SET: ${sourceList}`;
}

/**
 * Simple hash for snippet verification (FNV-1a 32-bit).
 * Not cryptographic — just for detect-if-changed verification.
 * @param {string} str
 * @returns {string} 8-char hex hash
 */
function hashSnippet(str) {
  if (!str) return '00000000';
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ─── Provenance String Builder ──────────────────────────────────────────────

/**
 * Generates the human-readable provenance line for clipboard / document footer.
 * Format: "Generated by [Model] on [Date] for Section [X] using sources [A, B, C]"
 *
 * @param {ProvenanceMetadata} provenance
 * @returns {string}
 */
export function buildProvenanceLine(provenance) {
  if (!provenance) return 'Provenance data unavailable';

  const model = provenance.model || 'Unknown Model';
  const date = provenance.generatedAt
    ? new Date(provenance.generatedAt).toISOString().split('T')[0]
    : 'Unknown Date';
  const section = provenance.section || 'Unknown Section';
  const submissionType = provenance.submissionType || '';
  const sources = Array.isArray(provenance.sourceDocuments) && provenance.sourceDocuments.length > 0
    ? provenance.sourceDocuments.slice(0, 5).join(', ')
    : 'general regulatory knowledge';

  return `Generated by ${model} on ${date} for Section ${section}${submissionType ? ` (${submissionType})` : ''} using sources: ${sources}`;
}

/**
 * Builds a structured provenance metadata object for clipboard embedding.
 * Embedded as a hidden HTML data attribute when copying AI content.
 *
 * @param {ProvenanceMetadata} provenance
 * @returns {Object}
 */
export function buildProvenancePayload(provenance) {
  if (!provenance) return { _provenance: true };

  return {
    _provenance: true,
    model: provenance.model || 'unknown',
    generatedAt: provenance.generatedAt || new Date().toISOString(),
    section: provenance.section || '',
    submissionType: provenance.submissionType || '',
    documentId: provenance.documentId || '',
    versionId: provenance.versionId || '',
    sourceDocuments: Array.isArray(provenance.sourceDocuments) ? provenance.sourceDocuments : [],
    requestedBy: provenance.requestedBy || '',
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

export const SUBMISSION_TYPES = VALID_SUBMISSION_TYPES;
export const USER_ROLES = VALID_ROLES;

export default {
  sendContextualMessage,
  searchWithContext,
  generateWithContext,
  checkComplianceWithContext,
  validateContext,
  buildProvenanceLine,
  buildProvenancePayload,
  SUBMISSION_TYPES,
  USER_ROLES,
};
