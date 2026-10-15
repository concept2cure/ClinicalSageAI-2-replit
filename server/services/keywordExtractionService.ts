/**
 * @fileoverview Keyword Extraction & Source Linkage Service
 * @module server/services/keywordExtractionService
 * @version 1.0.0
 *
 * Addresses P1 audit gaps:
 * - "4.4 Are relevant keywords displayed with source linkage? ❌ No"
 * - "10.2 Are relevant keywords displayed with source? ❌ No"
 *
 * Provides:
 * 1. Domain-aware keyword extraction from regulatory text
 * 2. Keyword → source document linkage
 * 3. Keyword highlighting with provenance
 * 4. Cross-document keyword consistency checking
 *
 * @compliance FDA 21 CFR Part 11 traceability, ICH M4
 */

import { pool } from '../db.js';
import auditService from './auditService';
import crypto from 'crypto';
import { ai } from '../lib/unified-ai-client';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractedKeyword {
  id: string;
  term: string; // The keyword/phrase
  normalizedTerm: string; // Lowercase, trimmed
  category: KeywordCategory;
  importance: 'critical' | 'high' | 'medium' | 'low';
  occurrences: KeywordOccurrence[];
  linkedSources: KeywordSource[];
  definitionText?: string; // Regulatory definition if applicable
  synonyms?: string[];
  isRegulatory: boolean; // Is this a regulatory-specific term
}

export type KeywordCategory =
  | 'endpoint' // Clinical endpoints (primary, secondary, exploratory)
  | 'drug_substance' // Active pharmaceutical ingredient
  | 'formulation' // Drug product composition
  | 'biomarker' // Biomarker names/values
  | 'adverse_event' // AE terms (MedDRA preferred terms)
  | 'statistical' // Statistical terms (p-value, CI, hazard ratio)
  | 'regulatory_term' // Regulatory terms (IND, NDA, BLA, 510(k))
  | 'standard' // Standards (ICH, ISO, USP, FDA guidance)
  | 'study_design' // Study design terms (randomized, double-blind)
  | 'population' // Population descriptors
  | 'manufacturing' // CMC terms (dissolution, stability, impurity)
  | 'device_term' // Medical device terms (predicate, substantial equivalence)
  | 'general';

export interface KeywordOccurrence {
  documentId: string;
  sectionCode?: string;
  charStart: number;
  charEnd: number;
  sentenceIndex: number;
  context: string; // Surrounding text (±50 chars)
}

export interface KeywordSource {
  sourceId: string;
  sourceType: 'evidence_object' | 'artifact' | 'uploaded_document' | 'literature';
  title: string;
  /** No relevance is computed — this is a term match. It was a constant 0.7 (2026-10-15). */
  relevance: null;
  excerpt: string;
  pageReference?: string;
  linkType: 'defines' | 'reports' | 'validates' | 'references';
}

export interface KeywordExtractionResult {
  documentId: string;
  projectId: number;
  organizationId: number;
  keywords: ExtractedKeyword[];
  totalKeywords: number;
  linkedKeywords: number;
  linkagePercent: number;
  categories: Record<KeywordCategory, number>;
  extractedAt: string;
  /** What this extraction could not do (e.g. the model-assisted pass failed). */
  notes: string[];
}

export interface KeywordConsistencyCheck {
  term: string;
  documents: Array<{ documentId: string; usage: string }>;
  /** null: nothing compares the usages. It defaulted to true (2026-10-15). */
  isConsistent: boolean | null;
  inconsistencyType?: 'definition_mismatch' | 'spelling_variation' | 'context_conflict';
  suggestion?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract domain-specific keywords from regulatory content.
 */
export async function extractKeywords(
  content: string,
  documentId: string,
  projectId: number,
  organizationId: number,
  options?: {
    sectionCode?: string;
    maxKeywords?: number;
    categories?: KeywordCategory[];
  }
): Promise<KeywordExtractionResult> {
  const maxKeywords = options?.maxKeywords || 100;

  // 1. AI-powered extraction for domain terms. A failed pass is said, not
  //    returned as "no model-found terms" (2026-10-15).
  const notes: string[] = [];
  const aiResult = await extractKeywordsViaAI(content, maxKeywords);
  if (aiResult === null) notes.push('The model-assisted term extraction failed; only pattern matches are listed.');
  const aiKeywords = aiResult ?? [];

  // 2. Regex-based extraction for known patterns
  const patternKeywords = extractKeywordsViaPatterns(content);

  // 3. Merge and deduplicate
  const merged = mergeKeywords(aiKeywords, patternKeywords);

  // 4. Add occurrence positions
  const withOccurrences = addOccurrencePositions(merged, content, documentId, options?.sectionCode);

  // 5. Link keywords to source documents
  const withSources = await linkKeywordsToSources(withOccurrences, projectId, organizationId);

  // 6. Filter by category if specified
  const filtered = options?.categories
    ? withSources.filter(k => options.categories!.includes(k.category))
    : withSources;

  // 7. Compute category counts
  const categories: Record<string, number> = {};
  for (const kw of filtered) {
    categories[kw.category] = (categories[kw.category] || 0) + 1;
  }

  // 8. Store extraction result
  await storeKeywordExtraction(documentId, projectId, organizationId, filtered);

  return {
    documentId,
    projectId,
    organizationId,
    keywords: filtered.slice(0, maxKeywords),
    totalKeywords: filtered.length,
    linkedKeywords: filtered.filter(k => k.linkedSources.length > 0).length,
    linkagePercent:
      filtered.length > 0
        ? Math.round(
            (filtered.filter(k => k.linkedSources.length > 0).length / filtered.length) * 100
          )
        : 0,
    categories: categories as Record<KeywordCategory, number>,
    extractedAt: new Date().toISOString(),
    notes,
  };
}

/** Model-suggested terms, or null when the call failed. */
async function extractKeywordsViaAI(
  content: string,
  maxKeywords: number
): Promise<Partial<ExtractedKeyword>[] | null> {
  try {
    // Routed by task like every other caller; it pinned OPENAI_MODEL ||
    // 'gpt-4o', outside the approved-models register (2026-10-15).
    const aiResult = await ai.chat({
      taskType: 'document_analysis',
      callerModule: 'keywordExtraction.extractKeywordsViaAI',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract domain-specific keywords from regulatory/pharmaceutical text.
For each keyword, provide:
- term: exact string as it appears
- category: one of: endpoint, drug_substance, formulation, biomarker, adverse_event, statistical, regulatory_term, standard, study_design, population, manufacturing, device_term, general
- importance: critical (primary endpoints, drug name), high (key findings), medium (supporting terms), low (contextual)
- isRegulatory: true if it's a regulatory-specific term
- definitionText: brief definition if it's a technical term (optional)
- synonyms: known synonyms (optional)

Return JSON: {"keywords": [{"term": "...", "category": "...", "importance": "...", "isRegulatory": true, "definitionText": "...", "synonyms": []}]}
Focus on terms that would need source traceability in a regulatory submission. Max ${maxKeywords} keywords.`,
        },
        {
          role: 'user',
          content: content.slice(0, 12000), // Limit context window
        },
      ],
    });

    const parsed = JSON.parse(aiResult.content || '{"keywords":[]}');
    return (parsed.keywords || []).map((k: any) => ({
      term: k.term,
      normalizedTerm: k.term?.toLowerCase().trim(),
      category: k.category || 'general',
      importance: k.importance || 'medium',
      isRegulatory: k.isRegulatory ?? false,
      definitionText: k.definitionText,
      synonyms: k.synonyms,
    }));
  } catch (error) {
    console.error('[KeywordExtraction] AI extraction failed:', error);
    return null;
  }
}

/**
 * Pattern-based extraction for well-known regulatory terms.
 */
function extractKeywordsViaPatterns(content: string): Partial<ExtractedKeyword>[] {
  const keywords: Partial<ExtractedKeyword>[] = [];
  const seen = new Set<string>();

  // Regulatory terms
  const regulatoryPatterns: { pattern: RegExp; category: KeywordCategory; importance: string }[] = [
    {
      pattern: /\b(IND|NDA|BLA|ANDA|MAA|510\(k\)|PMA|De\s+Novo|EUA)\b/g,
      category: 'regulatory_term',
      importance: 'critical',
    },
    {
      pattern: /\b(ICH\s+[QSEM]\d+[A-Z]?(?:\([A-Z]\d?\))?)\b/gi,
      category: 'standard',
      importance: 'high',
    },
    {
      pattern: /\b(USP\s+<\d+>|ISO\s+\d+(?:[-:]\d+)?)\b/gi,
      category: 'standard',
      importance: 'high',
    },
    {
      pattern: /\b(21\s+CFR\s+Part\s+\d+(?:\.\d+)?)\b/gi,
      category: 'regulatory_term',
      importance: 'high',
    },
    { pattern: /\bp[\s<=-]?\s*0?\.\d+\b/gi, category: 'statistical', importance: 'critical' },
    {
      pattern: /\b(hazard\s+ratio|confidence\s+interval|odds\s+ratio|relative\s+risk)\b/gi,
      category: 'statistical',
      importance: 'high',
    },
    {
      pattern: /\b(primary\s+endpoint|secondary\s+endpoint|exploratory\s+endpoint)\b/gi,
      category: 'endpoint',
      importance: 'critical',
    },
    {
      pattern: /\b(randomized|double-blind|placebo-controlled|open-label|crossover)\b/gi,
      category: 'study_design',
      importance: 'high',
    },
    {
      pattern: /\b(dissolution|stability|impurity|degradation|bioequivalence)\b/gi,
      category: 'manufacturing',
      importance: 'high',
    },
    {
      pattern: /\b(predicate\s+device|substantial\s+equivalence|intended\s+use)\b/gi,
      category: 'device_term',
      importance: 'high',
    },
    {
      pattern: /\b(adverse\s+event|serious\s+adverse\s+event|SAE|TEAE|SUSAR)\b/gi,
      category: 'adverse_event',
      importance: 'critical',
    },
  ];

  for (const { pattern, category, importance } of regulatoryPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const term = match[0].trim();
      const normalized = term.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        keywords.push({
          term,
          normalizedTerm: normalized,
          category,
          importance: importance as any,
          isRegulatory: true,
        });
      }
    }
  }

  return keywords;
}

function mergeKeywords(
  aiKeywords: Partial<ExtractedKeyword>[],
  patternKeywords: Partial<ExtractedKeyword>[]
): Partial<ExtractedKeyword>[] {
  const merged = new Map<string, Partial<ExtractedKeyword>>();

  // Pattern keywords take precedence for category/importance
  for (const kw of patternKeywords) {
    if (kw.normalizedTerm) merged.set(kw.normalizedTerm, kw);
  }

  // AI keywords fill in the rest
  for (const kw of aiKeywords) {
    if (kw.normalizedTerm && !merged.has(kw.normalizedTerm)) {
      merged.set(kw.normalizedTerm, kw);
    }
  }

  return Array.from(merged.values());
}

function addOccurrencePositions(
  keywords: Partial<ExtractedKeyword>[],
  content: string,
  documentId: string,
  sectionCode?: string
): ExtractedKeyword[] {
  return keywords
    .map(kw => {
      const occurrences: KeywordOccurrence[] = [];
      const term = kw.term || '';
      if (!term) return null;

      // Find all occurrences
      const regex = new RegExp(escapeRegex(term), 'gi');
      let match;
      let sentenceIndex = 0;
      const sentences = content.split(/[.!?]\s+/);

      while ((match = regex.exec(content)) !== null) {
        const charStart = match.index;
        const charEnd = charStart + term.length;

        // Determine sentence index
        let charCount = 0;
        sentenceIndex = 0;
        for (let i = 0; i < sentences.length; i++) {
          charCount += sentences[i].length + 2;
          if (charCount > charStart) {
            sentenceIndex = i;
            break;
          }
        }

        // Extract surrounding context
        const contextStart = Math.max(0, charStart - 50);
        const contextEnd = Math.min(content.length, charEnd + 50);
        const context = content.slice(contextStart, contextEnd);

        occurrences.push({
          documentId,
          sectionCode,
          charStart,
          charEnd,
          sentenceIndex,
          context,
        });

        // Limit to 20 occurrences per keyword
        if (occurrences.length >= 20) break;
      }

      return {
        id: crypto.randomUUID(),
        term: kw.term || '',
        normalizedTerm: kw.normalizedTerm || '',
        category: kw.category || 'general',
        importance: kw.importance || 'medium',
        occurrences,
        linkedSources: [],
        definitionText: kw.definitionText,
        synonyms: kw.synonyms,
        isRegulatory: kw.isRegulatory ?? false,
      } as ExtractedKeyword;
    })
    .filter(Boolean) as ExtractedKeyword[];
}

async function linkKeywordsToSources(
  keywords: ExtractedKeyword[],
  projectId: number,
  organizationId: number
): Promise<ExtractedKeyword[]> {
  // Load sources
  const sources = await pool.query(
    `SELECT id, title, evidence_type as type,
            COALESCE(excerpt, LEFT(description, 500)) as excerpt,
            source_reference as document_path
     FROM evidence_objects
     WHERE organization_id = $1
     ORDER BY created_at DESC LIMIT 100`,
    [organizationId]
  );

  const artifacts = await pool.query(
    `SELECT artifact_id as id, title, type,
            LEFT(content, 500) as excerpt
     FROM concept2cure_artifacts
     WHERE project_id = $1 AND organization_id = $2 AND status != 'deleted'
     LIMIT 100`,
    [projectId, organizationId]
  );

  const allSources = [...sources.rows, ...artifacts.rows];

  // For each keyword, find sources that mention it
  for (const kw of keywords) {
    const termRegex = new RegExp(escapeRegex(kw.term), 'i');

    for (const source of allSources) {
      const searchText = `${source.title} ${source.excerpt || ''}`;
      if (termRegex.test(searchText)) {
        kw.linkedSources.push({
          sourceId: source.id,
          sourceType: source.type?.includes('artifact') ? 'artifact' : 'evidence_object',
          title: source.title,
          relevance: null,
          excerpt: extractRelevantExcerpt(source.excerpt || '', kw.term),
          linkType: 'references',
        });
      }
    }

    kw.linkedSources = kw.linkedSources.slice(0, 10);
  }
  // A failed source read fails the extraction: it was swallowed, and the
  // result reported 0% of terms linked, as if every term had been checked.
  return keywords;
}

/**
 * The terms the given documents share, and where each uses them.
 *
 * Nothing here compares how a term is used, so no term is called consistent:
 * `isConsistent` is null and `assessed` false. Until 2026-10-15 this read the
 * organisation's last 20 'keywords_extracted' audit rows — whatever documents
 * those were — marked every shared term consistent ("Default — would need
 * deeper analysis"), and turned any failure into [] ("no inconsistencies").
 * Terms come from the deterministic regulatory-pattern pass only.
 */
export async function checkKeywordConsistency(
  documents: Array<{ id: string; title?: string; content: string }>
): Promise<{ assessed: false; note: string; terms: KeywordConsistencyCheck[] }> {
  const byTerm = new Map<string, Array<{ documentId: string; usage: string }>>();
  for (const doc of documents) {
    const content = typeof doc.content === 'string' ? doc.content : '';
    for (const kw of extractKeywordsViaPatterns(content)) {
      const normalized = kw.normalizedTerm ?? kw.term?.toLowerCase();
      if (!normalized || !kw.term) continue;
      const at = content.toLowerCase().indexOf(normalized);
      const usage = at < 0 ? kw.term : content.slice(Math.max(0, at - 50), at + normalized.length + 50);
      if (!byTerm.has(normalized)) byTerm.set(normalized, []);
      byTerm.get(normalized)!.push({ documentId: doc.id, usage });
    }
  }
  const terms: KeywordConsistencyCheck[] = [];
  for (const [term, docs] of byTerm) {
    if (new Set(docs.map((d) => d.documentId)).size > 1) terms.push({ term, documents: docs, isConsistent: null });
  }
  return {
    assessed: false,
    note: 'Lists where each shared term is used; how it is used is not compared, so consistency is not assessed.',
    terms,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractRelevantExcerpt(text: string, keyword: string): string {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return text.slice(0, 200);
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + keyword.length + 150);
  return text.slice(start, end);
}

async function storeKeywordExtraction(
  documentId: string,
  projectId: number,
  organizationId: number,
  keywords: ExtractedKeyword[]
): Promise<void> {
  // Chained via auditService — the previous raw INSERT used columns audit_logs
  // does not have (organization_id / entity_type / entity_id / details), so it
  // raised 42703 into a bare catch and never recorded anything.
  await auditService.logAction({
    organizationId,
    action: 'keywords_extracted',
    resourceType: 'document',
    resourceId: documentId,
    details: {
      projectId,
      totalKeywords: keywords.length,
      linkedKeywords: keywords.filter(k => k.linkedSources.length > 0).length,
      categories: keywords.reduce(
        (acc, k) => {
          acc[k.category] = (acc[k.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      // Store lightweight keyword summaries (not full occurrences)
      keywords: keywords.slice(0, 50).map(k => ({
        term: k.term,
        normalizedTerm: k.normalizedTerm,
        category: k.category,
        importance: k.importance,
        sourceCount: k.linkedSources.length,
        occurrenceCount: k.occurrences.length,
      })),
      extractedAt: new Date().toISOString(),
    },
  });
}
