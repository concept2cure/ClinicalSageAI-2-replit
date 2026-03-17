/**
 * Source Linking Service
 *
 * Provides sentence-level source attribution for regulatory document traceability.
 * Analyzes document content to identify claims and link them to evidence sources.
 *
 * @module server/services/sourceLinkingService
 */

import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  sourceCitations,
  documents,
  documentVersions,
  InsertSourceCitation,
  SourceCitation,
} from '../../shared/schema';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('source-linking');

// Patterns that indicate claims requiring source attribution
const CLAIM_PATTERNS = [
  // Statistical / numerical claims
  /\b\d+(\.\d+)?%\s+(of\s+)?(patients?|subjects?|participants?|responders?)/i,
  /\bp[\s<>=]+0?\.\d+/i,
  /\b(hazard ratio|odds ratio|relative risk|confidence interval|CI)\b/i,
  /\b(statistically significant|clinically significant)\b/i,
  // Study references
  /\b(study|trial|investigation|experiment)\s+(showed?|demonstrated?|found|indicated|revealed|confirmed)\b/i,
  /\b(phase\s+[I1-4]{1,3})\b/i,
  /\bNCT\d{8}\b/i,
  // Regulatory references
  /\b(FDA|EMA|ICH|ISO\s*\d+|21\s*CFR|MDR|IVDR|GCP|GMP|GLP)\b/i,
  /\b(guidance|guideline|regulation|standard|requirement)\s+(states?|requires?|recommends?|specifies?)\b/i,
  // Literature references
  /\b(et\s+al\.?|published|peer-reviewed|journal|meta-analysis|systematic review)\b/i,
  /\b(according to|as reported by|as described in|consistent with)\b/i,
  // Safety / efficacy claims
  /\b(adverse events?|AE|SAE|serious adverse)\b/i,
  /\b(efficacy|safety|bioequivalence|bioavailability|pharmacokinetic)\b/i,
  /\b(primary endpoint|secondary endpoint|outcome measure)\b/i,
];

/**
 * Classifies the type of source a claim sentence likely references.
 */
function classifySourceType(sentence: string): 'trial_data' | 'literature' | 'regulatory_guidance' | 'internal_data' {
  if (/\bNCT\d{8}\b/i.test(sentence) || /\b(phase\s+[I1-4]|clinical trial|study arm|randomized)\b/i.test(sentence)) {
    return 'trial_data';
  }
  if (/\b(FDA|EMA|ICH|ISO|21\s*CFR|MDR|IVDR|GCP|GMP|GLP|regulation|guideline|guidance)\b/i.test(sentence)) {
    return 'regulatory_guidance';
  }
  if (/\b(et\s+al|journal|published|meta-analysis|systematic review|peer-reviewed)\b/i.test(sentence)) {
    return 'literature';
  }
  return 'internal_data';
}

/**
 * Estimates a confidence score for how strongly a sentence constitutes a verifiable claim.
 */
function estimateConfidence(sentence: string): number {
  let score = 0.5;
  const matchCount = CLAIM_PATTERNS.filter(p => p.test(sentence)).length;
  score += Math.min(matchCount * 0.1, 0.4);
  // Boost for specific identifiers
  if (/\bNCT\d{8}\b/.test(sentence)) score += 0.1;
  if (/\bp[\s<>=]+0?\.\d+/.test(sentence)) score += 0.05;
  if (/\b\d+(\.\d+)?%/.test(sentence)) score += 0.05;
  return Math.min(score, 1.0);
}

/**
 * Extracts a candidate source identifier from a sentence.
 */
function extractSourceId(sentence: string): string {
  const nctMatch = sentence.match(/\bNCT\d{8}\b/);
  if (nctMatch) return nctMatch[0];
  const isoMatch = sentence.match(/\bISO\s*\d+[:\-\d]*/i);
  if (isoMatch) return isoMatch[0];
  const cfrMatch = sentence.match(/\b21\s*CFR\s*Part\s*\d+/i);
  if (cfrMatch) return cfrMatch[0];
  const ichMatch = sentence.match(/\bICH\s+[A-Z]\d+[A-Z]?(\([A-Z0-9]+\))?/i);
  if (ichMatch) return ichMatch[0];
  // Generic fallback: hash from sentence text
  return `auto-${hashCode(sentence)}`;
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Splits text content into sentences.
 */
function splitIntoSentences(text: string): string[] {
  // Handle common abbreviations to avoid false splits
  const cleaned = text
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Corp|vs|etc|al|Fig|Sec|Vol|No)\./gi, '$1\u2024')
    .replace(/\b(\d+)\./g, '$1\u2024');

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u2024/g, '.').trim())
    .filter(s => s.length > 20); // Filter out very short fragments

  return sentences;
}

/**
 * Strips HTML tags from content.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts plain text from document content which may be HTML, JSON, or plain text.
 */
function extractPlainText(content: string): string {
  if (!content) return '';

  // Try JSON first (section-based documents)
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((section: any) => {
        const title = section.title || section.heading || '';
        const body = section.content || section.text || section.body || '';
        return `${title} ${stripHtml(body)}`;
      }).join(' ');
    }
    if (typeof parsed === 'object') {
      const parts: string[] = [];
      for (const value of Object.values(parsed)) {
        if (typeof value === 'string') parts.push(stripHtml(value));
      }
      return parts.join(' ');
    }
  } catch {
    // Not JSON, continue
  }

  // Check if HTML
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return stripHtml(content);
  }

  // Plain text
  return content;
}

/**
 * Generates a descriptive source title based on source type and sentence context.
 */
function generateSourceTitle(sentence: string, sourceType: string, sourceId: string): string {
  if (sourceId.startsWith('NCT')) return `Clinical Trial ${sourceId}`;
  if (/^ISO/i.test(sourceId)) return `International Standard ${sourceId}`;
  if (/^21\s*CFR/i.test(sourceId)) return `FDA Regulation ${sourceId}`;
  if (/^ICH/i.test(sourceId)) return `ICH Guideline ${sourceId}`;

  switch (sourceType) {
    case 'trial_data': return 'Clinical Trial Data Reference';
    case 'literature': return 'Published Literature Reference';
    case 'regulatory_guidance': return 'Regulatory Guidance Reference';
    case 'internal_data': return 'Internal Data Reference';
    default: return 'Source Reference';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze a document's content and return source attributions for claim sentences.
 * Does NOT persist — call addSourceLink to save individual results.
 */
export async function linkSources(
  documentId: number,
  organizationId: number
): Promise<Omit<InsertSourceCitation, 'createdBy'>[]> {
  logger.info('Analyzing document for source links', { documentId, organizationId });

  // Fetch the document to ensure it belongs to the org
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .limit(1);

  if (!doc) {
    throw new Error(`Document ${documentId} not found for organization ${organizationId}`);
  }

  // Try to get content from the latest version
  let content = '';
  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .limit(1);

  if (versions.length > 0) {
    content = versions[0].content || '';
  }

  // Fallback: check document description if no version content
  if (!content && doc.description) {
    content = doc.description;
  }

  if (!content) {
    logger.warn('No content found for document', { documentId });
    return [];
  }

  const plainText = extractPlainText(content);
  const sentences = splitIntoSentences(plainText);
  const results: Omit<InsertSourceCitation, 'createdBy'>[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isClaimSentence = CLAIM_PATTERNS.some(pattern => pattern.test(sentence));

    if (isClaimSentence) {
      const sourceType = classifySourceType(sentence);
      const sourceId = extractSourceId(sentence);
      const confidence = estimateConfidence(sentence);
      const sourceTitle = generateSourceTitle(sentence, sourceType, sourceId);

      results.push({
        documentId,
        sectionId: null,
        sentenceIndex: i,
        sentenceText: sentence.substring(0, 1000), // Truncate very long sentences
        sourceType,
        sourceId,
        sourceTitle,
        sourceUrl: null,
        confidence: Math.round(confidence * 100) / 100,
        organizationId,
      });
    }
  }

  logger.info('Source analysis complete', { documentId, claimsFound: results.length, totalSentences: sentences.length });
  return results;
}

/**
 * Fetch all saved source citations for a document (tenant-isolated).
 */
export async function getSourcesForDocument(
  documentId: number,
  organizationId: number
): Promise<SourceCitation[]> {
  return db
    .select()
    .from(sourceCitations)
    .where(
      and(
        eq(sourceCitations.documentId, documentId),
        eq(sourceCitations.organizationId, organizationId)
      )
    );
}

/**
 * Add a single source link (manual or from analysis).
 */
export async function addSourceLink(
  link: InsertSourceCitation
): Promise<SourceCitation> {
  const [inserted] = await db
    .insert(sourceCitations)
    .values(link)
    .returning();

  logger.info('Source link added', { id: inserted.id, documentId: link.documentId });
  return inserted;
}

/**
 * Remove a source link (tenant-isolated).
 */
export async function removeSourceLink(
  linkId: number,
  organizationId: number
): Promise<void> {
  const result = await db
    .delete(sourceCitations)
    .where(
      and(
        eq(sourceCitations.id, linkId),
        eq(sourceCitations.organizationId, organizationId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error(`Source link ${linkId} not found for organization ${organizationId}`);
  }

  logger.info('Source link removed', { linkId, organizationId });
}
