/**
 * @fileoverview Sentence-Level Traceability Service
 * @module server/services/sentenceTraceabilityService
 * @version 1.0.0
 *
 * Addresses P0 audit gaps:
 * - "4.1 Can users track every claim back to its source at sentence level? ⚠️ Partial"
 * - "4.3 Can users click any sentence to view exact source file? ❌ No"
 * - "10.1 Can users click any sentence to view exact source file? ❌ No"
 *
 * Provides:
 * 1. Sentence boundary detection (NLP splitting)
 * 2. Per-sentence source mapping with character offsets
 * 3. Click-through resolution (sentence → source file + page + excerpt)
 * 4. Confidence scoring per link
 * 5. Content-hash verification for link freshness
 *
 * Unifies the two disconnected traceability systems:
 * - innovation.auto_trace_links (semantic detection)
 * - evidence_links (Drizzle, manual/API)
 *
 * @compliance FDA 21 CFR Part 11, ICH M4 traceability requirements
 */

import { pool } from '../db.js';
import OpenAI from 'openai';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SentenceSpan {
  index: number; // 0-based sentence index in document
  text: string; // Sentence text
  charStart: number; // Character offset start in full content
  charEnd: number; // Character offset end
  paragraphIndex: number; // Paragraph number
  contentHash: string; // SHA-256 of sentence text (for change detection)
}

export interface SourceReference {
  sourceId: string; // evidence_object ID or artifact ID
  sourceType: 'evidence_object' | 'artifact' | 'uploaded_document' | 'literature';
  title: string;
  documentPath?: string; // File path / URL
  pageNumber?: number;
  excerpt: string; // Relevant excerpt from source
  excerptCharStart?: number;
  excerptCharEnd?: number;
  relevanceScore: number; // 0-1
  linkType: 'supports' | 'derives_from' | 'references' | 'validates' | 'contradicts';
  detectionMethod: 'semantic' | 'keyword' | 'citation_parse' | 'manual' | 'ai_generated';
  isVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface SentenceTraceLink {
  id: string;
  sentenceSpan: SentenceSpan;
  sources: SourceReference[];
  overallConfidence: number; // 0-1, aggregated from sources
  claimType?: string; // efficacy, safety, statistical, etc.
  isSupported: boolean; // At least one supporting source
  needsReview: boolean; // Flagged for human review
  targetContentHash: string; // Hash of document at link creation time
  createdAt: string;
  updatedAt: string;
}

export interface TraceabilityReport {
  documentId: string;
  projectId: number;
  organizationId: number;
  totalSentences: number;
  tracedSentences: number;
  coveragePercent: number;
  averageConfidence: number;
  unsupportedClaims: SentenceTraceLink[];
  needsReviewClaims: SentenceTraceLink[];
  links: SentenceTraceLink[];
  generatedAt: string;
  contentHash: string;
}

export interface ClickThroughResult {
  sentence: SentenceSpan;
  sources: Array<
    SourceReference & {
      fullContent?: string;
      highlightRange?: { start: number; end: number };
      accessUrl?: string;
    }
  >;
  relatedSentences: SentenceSpan[];
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTENCE BOUNDARY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Split content into sentence spans with character offsets.
 * Uses rule-based NLP splitting that handles:
 * - Standard sentence boundaries (. ! ?)
 * - Abbreviations (Dr., Mr., etc., e.g., i.e., vs.)
 * - Decimal numbers (3.14, p<0.05)
 * - Section references (Section 2.3)
 * - Enumerated lists (1. First item)
 */
export function detectSentences(content: string): SentenceSpan[] {
  if (!content || content.trim().length === 0) return [];

  const sentences: SentenceSpan[] = [];
  const paragraphs = content.split(/\n\s*\n/);

  let globalCharOffset = 0;
  let sentenceIndex = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    if (!para.trim()) {
      globalCharOffset += para.length + 2; // +2 for \n\n
      continue;
    }

    // Find paragraph start in original content
    const paraStart = content.indexOf(para, globalCharOffset);

    // Split paragraph into sentences using regex that respects abbreviations
    const sentenceTexts = splitIntoSentences(para);

    let localOffset = 0;
    for (const sentText of sentenceTexts) {
      const trimmed = sentText.trim();
      if (!trimmed) continue;

      const sentStart = para.indexOf(trimmed, localOffset);
      const charStart = paraStart + sentStart;
      const charEnd = charStart + trimmed.length;

      sentences.push({
        index: sentenceIndex++,
        text: trimmed,
        charStart,
        charEnd,
        paragraphIndex: pIdx,
        contentHash: crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 16),
      });

      localOffset = sentStart + trimmed.length;
    }

    globalCharOffset = paraStart + para.length;
  }

  return sentences;
}

/**
 * Rule-based sentence splitter that handles regulatory text edge cases.
 */
function splitIntoSentences(text: string): string[] {
  // Protect known abbreviations
  const protectedPatterns: [RegExp, string][] = [
    [/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|Inc|Corp|Ltd|Co|vs|etc|approx)\./gi, '$1\u0000'],
    [/\b(e\.g|i\.e|cf|al|Fig|Tab|Ref|Sec|Vol|No|Rev)\./gi, '$1\u0000'],
    [/\b(U\.S|E\.U|ICH|FDA|EMA|WHO)\./gi, '$1\u0000'],
    [/(\d+)\.(\d+)/g, '$1\u0001$2'], // Decimal numbers
    [/([A-Z])\.([A-Z])\./g, '$1\u0000$2\u0000'], // Initials like U.S.A.
  ];

  let processed = text;
  for (const [pattern, replacement] of protectedPatterns) {
    processed = processed.replace(pattern, replacement);
  }

  // Split on sentence boundaries
  const raw = processed.split(/(?<=[.!?])\s+(?=[A-Z\d"'\(\[])/);

  // Restore protected characters
  return raw
    .map(s => s.replace(/\u0000/g, '.').replace(/\u0001/g, '.'))
    .filter(s => s.trim().length > 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTENCE → SOURCE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Map sentences to their source documents using semantic similarity + keyword matching.
 */
export async function mapSentencesToSources(
  sentences: SentenceSpan[],
  projectId: number,
  organizationId: number,
  options?: {
    batchSize?: number;
    minConfidence?: number;
    includeAutoTrace?: boolean;
  }
): Promise<SentenceTraceLink[]> {
  const batchSize = options?.batchSize || 20;
  const minConfidence = options?.minConfidence || 0.3;
  const links: SentenceTraceLink[] = [];

  // Load available sources for this project
  const sources = await loadProjectSources(projectId, organizationId);
  if (sources.length === 0) return links;

  // Load existing auto-trace links if available
  const existingTraceLinks =
    options?.includeAutoTrace !== false
      ? await loadExistingTraceLinks(projectId, organizationId)
      : [];

  // Process sentences in batches
  for (let i = 0; i < sentences.length; i += batchSize) {
    const batch = sentences.slice(i, i + batchSize);
    const batchLinks = await mapBatchToSources(batch, sources, existingTraceLinks, minConfidence);
    links.push(...batchLinks);
  }

  return links;
}

async function mapBatchToSources(
  sentences: SentenceSpan[],
  sources: ProjectSource[],
  existingLinks: ExistingTraceLink[],
  minConfidence: number
): Promise<SentenceTraceLink[]> {
  const results: SentenceTraceLink[] = [];

  // Build a compact source reference for the AI
  const sourceMap = sources.slice(0, 50).map((s, i) => ({
    idx: i,
    id: s.id,
    title: s.title,
    type: s.type,
    excerpt: s.excerpt?.slice(0, 300) || '',
  }));

  // Ask the AI to map sentences to sources
  const sentenceTexts = sentences.map((s, i) => `[${i}] ${s.text}`).join('\n');
  const sourceTexts = sourceMap
    .map(s => `[${s.idx}] ${s.title} (${s.type}): ${s.excerpt}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a regulatory traceability expert. Map each sentence to its most likely source documents.
For each sentence, identify:
- Which source(s) support it (by source index)
- The link type: supports, derives_from, references, validates, contradicts
- Confidence score (0-1)
- Claim type: efficacy, safety, statistical, regulatory, manufacturing, clinical, comparison, or general
- Whether it needs human review (true if confidence < 0.7 or claim is statistical/safety)

Return JSON: {"mappings": [{"sentenceIdx": 0, "sources": [{"sourceIdx": 0, "linkType": "supports", "confidence": 0.85, "excerpt": "relevant excerpt from source"}], "claimType": "efficacy", "needsReview": false}]}
If a sentence has no matching source, return empty sources array.`,
        },
        {
          role: 'user',
          content: `SENTENCES:\n${sentenceTexts}\n\nAVAILABLE SOURCES:\n${sourceTexts}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{"mappings":[]}');

    for (const mapping of parsed.mappings || []) {
      const sentence = sentences[mapping.sentenceIdx];
      if (!sentence) continue;

      const sourceRefs: SourceReference[] = [];
      for (const srcMapping of mapping.sources || []) {
        const source = sourceMap[srcMapping.sourceIdx];
        if (!source) continue;

        const fullSource = sources.find(s => s.id === source.id);
        if (srcMapping.confidence < minConfidence) continue;

        sourceRefs.push({
          sourceId: source.id,
          sourceType: categorizeSourceType(source.type),
          title: source.title,
          documentPath: fullSource?.documentPath,
          pageNumber: fullSource?.pageNumber,
          excerpt: srcMapping.excerpt || source.excerpt,
          relevanceScore: srcMapping.confidence,
          linkType: srcMapping.linkType || 'supports',
          detectionMethod: 'semantic',
          isVerified: false,
        });
      }

      // Also check existing auto_trace_links for matches
      for (const existing of existingLinks) {
        if (existing.sourceText && sentenceSimilarity(sentence.text, existing.sourceText) > 0.8) {
          // Don't duplicate if already found by AI
          if (!sourceRefs.find(s => s.sourceId === existing.targetDocumentId)) {
            sourceRefs.push({
              sourceId: existing.targetDocumentId || existing.id,
              sourceType: 'evidence_object',
              title: existing.targetText?.slice(0, 100) || 'Auto-detected source',
              excerpt: existing.targetText || '',
              relevanceScore: existing.confidenceScore,
              linkType: mapTraceLinkType(existing.linkType),
              detectionMethod: (existing.detectionMethod as any) || 'semantic',
              isVerified: existing.isValidated,
              verifiedBy: existing.validatedBy,
              verifiedAt: existing.validatedAt,
            });
          }
        }
      }

      const overallConfidence =
        sourceRefs.length > 0
          ? sourceRefs.reduce((sum, s) => sum + s.relevanceScore, 0) / sourceRefs.length
          : 0;

      results.push({
        id: crypto.randomUUID(),
        sentenceSpan: sentence,
        sources: sourceRefs,
        overallConfidence,
        claimType: mapping.claimType || 'general',
        isSupported: sourceRefs.some(s => s.linkType === 'supports' && s.relevanceScore >= 0.5),
        needsReview: mapping.needsReview ?? overallConfidence < 0.7,
        targetContentHash: sentence.contentHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[SentenceTraceability] AI mapping failed:', error);
    // Fall back to keyword-only matching for this batch
    for (const sentence of sentences) {
      const keywordMatches = findKeywordMatches(sentence.text, sources);
      results.push({
        id: crypto.randomUUID(),
        sentenceSpan: sentence,
        sources: keywordMatches,
        overallConfidence:
          keywordMatches.length > 0
            ? keywordMatches.reduce((s, m) => s + m.relevanceScore, 0) / keywordMatches.length
            : 0,
        claimType: 'general',
        isSupported: keywordMatches.length > 0,
        needsReview: true,
        targetContentHash: sentence.contentHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLICK-THROUGH RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a sentence click to its full source context.
 * Given a character offset in a document, find the sentence and its sources.
 */
export async function resolveClickThrough(
  content: string,
  charOffset: number,
  projectId: number,
  organizationId: number
): Promise<ClickThroughResult | null> {
  // 1. Detect all sentences
  const sentences = detectSentences(content);

  // 2. Find the clicked sentence
  const clickedSentence = sentences.find(s => charOffset >= s.charStart && charOffset <= s.charEnd);
  if (!clickedSentence) return null;

  // 3. Get sources for this sentence
  const [link] = await mapSentencesToSources([clickedSentence], projectId, organizationId, {
    minConfidence: 0.2,
  });
  if (!link) return null;

  // 4. Enrich sources with full content and access URLs
  const enrichedSources = await Promise.all(
    link.sources.map(async source => {
      const fullContent = await loadSourceContent(source.sourceId, source.sourceType);
      const highlightRange = fullContent
        ? findExcerptInContent(source.excerpt, fullContent)
        : undefined;

      return {
        ...source,
        fullContent: fullContent?.slice(0, 5000), // Limit size
        highlightRange,
        accessUrl: buildSourceAccessUrl(source),
      };
    })
  );

  // 5. Find related sentences (same paragraph, same source)
  const related = sentences
    .filter(
      s => s.index !== clickedSentence.index && s.paragraphIndex === clickedSentence.paragraphIndex
    )
    .slice(0, 5);

  return {
    sentence: clickedSentence,
    sources: enrichedSources,
    relatedSentences: related,
    confidence: link.overallConfidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL TRACEABILITY REPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a complete traceability report for a document/section.
 */
export async function generateTraceabilityReport(
  documentId: string,
  content: string,
  projectId: number,
  organizationId: number
): Promise<TraceabilityReport> {
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');

  // 1. Detect all sentences
  const sentences = detectSentences(content);

  // 2. Map all sentences to sources
  const links = await mapSentencesToSources(sentences, projectId, organizationId);

  // 3. Compute coverage
  const tracedSentences = links.filter(l => l.sources.length > 0).length;
  const coveragePercent =
    sentences.length > 0 ? Math.round((tracedSentences / sentences.length) * 100) : 0;

  const avgConfidence =
    links.length > 0 ? links.reduce((sum, l) => sum + l.overallConfidence, 0) / links.length : 0;

  // 4. Identify unsupported and review-needed claims
  const unsupported = links.filter(l => !l.isSupported && l.sentenceSpan.text.length > 20);
  const needsReview = links.filter(l => l.needsReview);

  // 5. Store report
  await storeTraceabilityReport(documentId, projectId, organizationId, {
    totalSentences: sentences.length,
    tracedSentences,
    coveragePercent,
    averageConfidence: avgConfidence,
    contentHash,
  });

  return {
    documentId,
    projectId,
    organizationId,
    totalSentences: sentences.length,
    tracedSentences,
    coveragePercent,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    unsupportedClaims: unsupported,
    needsReviewClaims: needsReview,
    links,
    generatedAt: new Date().toISOString(),
    contentHash,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSIST LINKS TO DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist sentence-level trace links to the database.
 */
export async function persistTraceLinks(
  links: SentenceTraceLink[],
  projectId: number,
  organizationId: number,
  documentId: string
): Promise<{ stored: number; updated: number; errors: number }> {
  let stored = 0,
    updated = 0,
    errors = 0;

  for (const link of links) {
    for (const source of link.sources) {
      try {
        await pool.query(
          `INSERT INTO evidence_links (
            id, organization_id, evidence_id, target_type, target_id, target_path,
            link_type, strength, rationale, is_verified, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2::uuid, 'sentence', $3, $4,
            $5, $6, $7, $8, NOW(), NOW()
          ) ON CONFLICT DO NOTHING`,
          [
            organizationId,
            source.sourceId,
            `${documentId}:s${link.sentenceSpan.index}`,
            `char:${link.sentenceSpan.charStart}-${link.sentenceSpan.charEnd}`,
            source.linkType,
            source.relevanceScore >= 0.8
              ? 'strong'
              : source.relevanceScore >= 0.5
                ? 'moderate'
                : 'weak',
            JSON.stringify({
              sentenceText: link.sentenceSpan.text.slice(0, 200),
              sourceExcerpt: source.excerpt.slice(0, 200),
              claimType: link.claimType,
              detectionMethod: source.detectionMethod,
              confidence: source.relevanceScore,
              contentHash: link.targetContentHash,
            }),
            source.isVerified,
          ]
        );
        stored++;
      } catch (err) {
        // evidence_id might not be a valid UUID if it's an artifact reference
        errors++;
      }
    }
  }

  return { stored, updated, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

interface ProjectSource {
  id: string;
  title: string;
  type: string;
  excerpt: string;
  documentPath?: string;
  pageNumber?: number;
}

interface ExistingTraceLink {
  id: string;
  sourceText: string;
  targetText: string;
  targetDocumentId?: string;
  linkType: string;
  confidenceScore: number;
  detectionMethod: string;
  isValidated: boolean;
  validatedBy?: string;
  validatedAt?: string;
}

async function loadProjectSources(
  projectId: number,
  organizationId: number
): Promise<ProjectSource[]> {
  try {
    // Load from evidence_objects
    const evidenceResult = await pool.query(
      `SELECT id, title, evidence_type as type,
              COALESCE(excerpt, LEFT(description, 500)) as excerpt,
              source_reference as document_path,
              page_range as page_number
       FROM evidence_objects
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [organizationId]
    );

    // Load from concept2cure_artifacts (Data Room)
    const artifactResult = await pool.query(
      `SELECT artifact_id as id, title, type,
              LEFT(content, 500) as excerpt,
              metadata->>'filePath' as document_path
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2 AND status != 'deleted'
       ORDER BY updated_at DESC LIMIT 100`,
      [projectId, organizationId]
    );

    return [...evidenceResult.rows, ...artifactResult.rows];
  } catch (error) {
    console.warn('[SentenceTraceability] Failed to load sources:', error);
    return [];
  }
}

async function loadExistingTraceLinks(
  projectId: number,
  organizationId: number
): Promise<ExistingTraceLink[]> {
  try {
    const result = await pool.query(
      `SELECT id, source_text, target_text, target_document_id,
              link_type, confidence_score, detection_method,
              is_validated, validated_by, validated_at
       FROM innovation.auto_trace_links
       WHERE program_id IN (
         SELECT id FROM regulatory_programs WHERE organization_id = $1
       )
       ORDER BY confidence_score DESC LIMIT 200`,
      [organizationId]
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      sourceText: r.source_text,
      targetText: r.target_text,
      targetDocumentId: r.target_document_id,
      linkType: r.link_type,
      confidenceScore: parseFloat(r.confidence_score) || 0,
      detectionMethod: r.detection_method,
      isValidated: r.is_validated,
      validatedBy: r.validated_by,
      validatedAt: r.validated_at,
    }));
  } catch {
    // innovation schema may not exist
    return [];
  }
}

async function loadSourceContent(sourceId: string, sourceType: string): Promise<string | null> {
  try {
    if (sourceType === 'evidence_object') {
      const result = await pool.query(
        `SELECT COALESCE(excerpt, description) as content FROM evidence_objects WHERE id = $1::uuid`,
        [sourceId]
      );
      return result.rows[0]?.content || null;
    }
    if (sourceType === 'artifact') {
      const result = await pool.query(
        `SELECT content FROM concept2cure_artifacts WHERE artifact_id = $1`,
        [sourceId]
      );
      return result.rows[0]?.content || null;
    }
    return null;
  } catch {
    return null;
  }
}

function findExcerptInContent(
  excerpt: string,
  content: string
): { start: number; end: number } | undefined {
  if (!excerpt || !content) return undefined;
  const idx = content.indexOf(excerpt.slice(0, 100));
  if (idx >= 0) return { start: idx, end: idx + excerpt.length };
  return undefined;
}

function buildSourceAccessUrl(source: SourceReference): string {
  if (source.documentPath) return source.documentPath;
  return `/api/evidence/v2/${source.sourceId}`;
}

function categorizeSourceType(type: string): SourceReference['sourceType'] {
  if (type === 'literature' || type === 'journal_article') return 'literature';
  if (type === 'uploaded_document' || type === 'file') return 'uploaded_document';
  if (type.includes('artifact') || type.includes('section') || type.includes('draft'))
    return 'artifact';
  return 'evidence_object';
}

function mapTraceLinkType(type: string): SourceReference['linkType'] {
  const map: Record<string, SourceReference['linkType']> = {
    SUPPORTS: 'supports',
    DERIVES_FROM: 'derives_from',
    REFERENCES: 'references',
    VALIDATES: 'validates',
    CONTRADICTS: 'contradicts',
    IMPLEMENTS: 'supports',
    DEFINES: 'references',
    SUPERSEDES: 'references',
  };
  return map[type] || 'references';
}

function sentenceSimilarity(a: string, b: string): number {
  // Jaccard similarity on words for fast comparison
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2)
  );
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

function findKeywordMatches(sentenceText: string, sources: ProjectSource[]): SourceReference[] {
  const matches: SourceReference[] = [];
  const sentenceWords = new Set(
    sentenceText
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3)
  );

  for (const source of sources) {
    const sourceWords = new Set(
      (source.excerpt || source.title)
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length > 3)
    );
    const overlap = [...sentenceWords].filter(w => sourceWords.has(w));
    const score = sentenceWords.size > 0 ? overlap.length / sentenceWords.size : 0;

    if (score >= 0.3) {
      matches.push({
        sourceId: source.id,
        sourceType: categorizeSourceType(source.type),
        title: source.title,
        documentPath: source.documentPath,
        pageNumber: source.pageNumber,
        excerpt: source.excerpt?.slice(0, 300) || '',
        relevanceScore: Math.min(score, 1),
        linkType: 'references',
        detectionMethod: 'keyword',
        isVerified: false,
      });
    }
  }

  return matches.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
}

async function storeTraceabilityReport(
  documentId: string,
  projectId: number,
  organizationId: number,
  stats: {
    totalSentences: number;
    tracedSentences: number;
    coveragePercent: number;
    averageConfidence: number;
    contentHash: string;
  }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, organization_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (0, $1, 'traceability_report_generated', 'document', $2, $3, '0.0.0.0', NOW())`,
      [
        organizationId,
        documentId,
        JSON.stringify({
          projectId,
          totalSentences: stats.totalSentences,
          tracedSentences: stats.tracedSentences,
          coveragePercent: stats.coveragePercent,
          averageConfidence: stats.averageConfidence,
          contentHash: stats.contentHash,
          generatedAt: new Date().toISOString(),
        }),
      ]
    );
  } catch {
    // Non-critical
  }
}
