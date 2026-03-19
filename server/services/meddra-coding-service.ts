/**
 * MedDRA Coding Support Service
 *
 * Provides automated adverse event term coding to MedDRA hierarchy.
 * Supports: SOC → HLGT → HLT → PT → LLT mapping.
 * Uses AI-assisted matching when exact lookup fails.
 *
 * NOTE: This service works with a reference table (meddra_term_reference)
 * that can be populated from licensed MedDRA data. When the reference table
 * is empty, the service falls back to AI-assisted coding with lower confidence.
 */

import { db } from '../db';
import { eq, and, ilike, sql } from 'drizzle-orm';
import { ai } from '../lib/unified-ai-client';


// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MedDRACodingResult {
  verbatimTerm: string;
  codingMethod: 'exact_match' | 'fuzzy_match' | 'ai_assisted';
  confidence: number; // 0-1
  hierarchy: {
    socCode: string;
    socName: string;
    hlgtCode?: string;
    hlgtName?: string;
    hltCode?: string;
    hltName?: string;
    ptCode: string;
    ptName: string;
    lltCode?: string;
    lltName?: string;
  };
  isPrimaryPath: boolean;
  alternativePTs?: Array<{ ptCode: string; ptName: string; confidence: number }>;
}

export interface AdverseEventInput {
  verbatimTerm: string;
  context?: string; // additional context like "occurred during treatment with Drug X"
}

export interface PTSuggestion {
  ptName: string;
  ptCode: string;
  socName: string;
  confidence: number;
  reasoning: string;
}

export interface SOCDistribution {
  socName: string;
  socCode: string;
  count: number;
  percentage: number;
  topPTs: Array<{ ptName: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Internal types for database rows
// ---------------------------------------------------------------------------

interface MedDRARow {
  id: number;
  pt_code: string;
  pt_name: string;
  llt_code: string | null;
  llt_name: string | null;
  hlt_code: string | null;
  hlt_name: string | null;
  hlgt_code: string | null;
  hlgt_name: string | null;
  soc_code: string;
  soc_name: string;
  is_primary_soc: boolean;
  organization_id: number | null;
}

interface AICodeResponse {
  ptName: string;
  ptCode: string;
  socName: string;
  socCode: string;
  hlgtName?: string;
  hlgtCode?: string;
  hltName?: string;
  hltCode?: string;
  lltName?: string;
  lltCode?: string;
  confidence: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEDDRA_CODING_SYSTEM_PROMPT = `You are a MedDRA medical coding specialist with deep expertise in pharmacovigilance terminology. Your role is to map verbatim adverse event terms to the MedDRA hierarchy.

MedDRA Coding Rules:
1. Always select the most specific Preferred Term (PT) that accurately represents the reported adverse event.
2. Prefer the primary SOC path. The primary SOC is determined by the international convention where each PT has one designated primary SOC.
3. Do NOT upcode — the PT must match the specificity of the reported term, not generalize it.
4. Do NOT downcode — do not select a more specific term than what was actually reported unless the verbatim clearly describes a more specific concept.
5. If the verbatim is a known LLT (Lowest Level Term), map it to its parent PT.
6. For combination terms (e.g., "nausea and vomiting"), code each component separately. For this request, pick the primary/dominant term.
7. Consider the medical context when disambiguating terms that could map to multiple PTs.
8. For signs vs. symptoms vs. diagnoses, code to the level of certainty expressed in the verbatim.
9. Lab test abnormalities should be coded as the investigation PT (e.g., "Blood pressure increased") unless a diagnosis is stated.
10. Use the SOC assignment that represents the underlying etiology or manifestation site per MedDRA conventions.

You must return valid JSON with the following structure:
{
  "ptName": "the preferred term name",
  "ptCode": "the PT code if known, otherwise 'AI_SUGGESTED'",
  "socName": "the System Organ Class name",
  "socCode": "the SOC code if known, otherwise 'AI_SUGGESTED'",
  "hlgtName": "the High Level Group Term name if known",
  "hlgtCode": "the HLGT code if known",
  "hltName": "the High Level Term name if known",
  "hltCode": "the HLT code if known",
  "lltName": "the Lowest Level Term if the verbatim maps to one",
  "lltCode": "the LLT code if known",
  "confidence": 0.85,
  "reasoning": "brief explanation of the coding decision"
}`;

const MEDDRA_SUGGESTION_PROMPT = `You are a MedDRA medical coding specialist. Given a verbatim adverse event description, suggest the top 3 most likely MedDRA Preferred Terms (PTs) it could map to.

For each suggestion, provide:
- The PT name
- The PT code (use "AI_SUGGESTED" if the exact code is unknown)
- The primary SOC name
- A confidence score (0.0-1.0)
- A brief reasoning explaining why this PT is appropriate

Consider:
1. Exact semantic matches
2. Synonymous terms that map to the same PT
3. Related but distinct PTs that might apply depending on clinical context

Return valid JSON array:
[
  {
    "ptName": "...",
    "ptCode": "...",
    "socName": "...",
    "confidence": 0.9,
    "reasoning": "..."
  }
]`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class MedDRACodingService {

  // -------------------------------------------------------------------------
  // 1. codeAdverseEvent
  // -------------------------------------------------------------------------

  async codeAdverseEvent(
    term: string,
    organizationId: number
  ): Promise<MedDRACodingResult> {
    const normalizedTerm = term.trim();

    if (!normalizedTerm) {
      throw new Error('Adverse event term cannot be empty');
    }

    // Attempt 1 — exact match (case-insensitive) on PT or LLT name
    const exactResult = await this.exactMatch(normalizedTerm, organizationId);
    if (exactResult) {
      return exactResult;
    }

    // Attempt 2 — fuzzy match using ILIKE with wildcards
    const fuzzyResult = await this.fuzzyMatch(normalizedTerm, organizationId);
    if (fuzzyResult) {
      return fuzzyResult;
    }

    // Attempt 3 — AI-assisted coding
    return this.aiAssistedCoding(normalizedTerm);
  }

  // -------------------------------------------------------------------------
  // 2. batchCodeEvents
  // -------------------------------------------------------------------------

  async batchCodeEvents(
    events: AdverseEventInput[],
    organizationId: number
  ): Promise<MedDRACodingResult[]> {
    if (!events || events.length === 0) {
      return [];
    }

    // Deduplicate by verbatimTerm (case-insensitive) to avoid redundant work
    const seen = new Map<string, number>(); // normalised term → first index
    const uniqueInputs: Array<{ term: string; context?: string; index: number }> = [];

    for (let i = 0; i < events.length; i++) {
      const key = events[i].verbatimTerm.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, uniqueInputs.length);
        uniqueInputs.push({
          term: events[i].verbatimTerm.trim(),
          context: events[i].context,
          index: i,
        });
      }
    }

    // Code each unique term
    const uniqueResults = new Map<string, MedDRACodingResult>();
    for (const input of uniqueInputs) {
      const result = await this.codeAdverseEvent(input.term, organizationId);
      uniqueResults.set(input.term.toLowerCase(), result);
    }

    // Map results back to original order
    return events.map((ev) => {
      const key = ev.verbatimTerm.trim().toLowerCase();
      const result = uniqueResults.get(key);
      if (!result) {
        // Should never happen, but guard against it
        throw new Error(`Missing coding result for term: ${ev.verbatimTerm}`);
      }
      // Return a copy with the original verbatim term preserved
      return { ...result, verbatimTerm: ev.verbatimTerm.trim() };
    });
  }

  // -------------------------------------------------------------------------
  // 3. suggestPreferredTerm
  // -------------------------------------------------------------------------

  async suggestPreferredTerm(verbatimTerm: string): Promise<PTSuggestion[]> {
    const normalizedTerm = verbatimTerm.trim();
    if (!normalizedTerm) {
      throw new Error('Verbatim term cannot be empty');
    }

    const content = await ai.complete(
      [
        { role: 'system', content: MEDDRA_SUGGESTION_PROMPT },
        {
          role: 'user',
          content: `Verbatim adverse event term: "${normalizedTerm}"\n\nProvide the top 3 MedDRA PT suggestions.`,
        },
      ],
      { jsonMode: true, temperature: 0.1, maxTokens: 1500 }
    );

    if (!content) {
      throw new Error('Empty response from AI model during PT suggestion');
    }

    const parsed = JSON.parse(content);

    // The model may wrap the array in a key like "suggestions" or return bare array
    const suggestions: AICodeResponse[] = Array.isArray(parsed)
      ? parsed
      : parsed.suggestions || parsed.results || [];

    return suggestions.slice(0, 3).map((s: any) => ({
      ptName: s.ptName || s.pt_name || 'Unknown',
      ptCode: s.ptCode || s.pt_code || 'AI_SUGGESTED',
      socName: s.socName || s.soc_name || 'Unknown',
      confidence: typeof s.confidence === 'number' ? Math.min(1, Math.max(0, s.confidence)) : 0.5,
      reasoning: s.reasoning || 'No reasoning provided',
    }));
  }

  // -------------------------------------------------------------------------
  // 4. getSOCDistribution
  // -------------------------------------------------------------------------

  async getSOCDistribution(
    eventTerms: string[],
    organizationId: number
  ): Promise<SOCDistribution[]> {
    if (!eventTerms || eventTerms.length === 0) {
      return [];
    }

    // Code all events
    const inputs: AdverseEventInput[] = eventTerms.map((t) => ({ verbatimTerm: t }));
    const codedEvents = await this.batchCodeEvents(inputs, organizationId);

    // Aggregate by SOC
    const socMap = new Map<
      string,
      {
        socName: string;
        socCode: string;
        count: number;
        ptCounts: Map<string, number>;
      }
    >();

    for (const event of codedEvents) {
      const key = event.hierarchy.socCode;
      const existing = socMap.get(key);

      if (existing) {
        existing.count++;
        const ptCount = existing.ptCounts.get(event.hierarchy.ptName) || 0;
        existing.ptCounts.set(event.hierarchy.ptName, ptCount + 1);
      } else {
        const ptCounts = new Map<string, number>();
        ptCounts.set(event.hierarchy.ptName, 1);
        socMap.set(key, {
          socName: event.hierarchy.socName,
          socCode: event.hierarchy.socCode,
          count: 1,
          ptCounts,
        });
      }
    }

    const totalEvents = codedEvents.length;

    // Build distribution sorted by count descending
    const distribution: SOCDistribution[] = Array.from(socMap.values())
      .map((entry) => {
        // Sort PTs by count descending and take top 5
        const topPTs = Array.from(entry.ptCounts.entries())
          .map(([ptName, count]) => ({ ptName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          socName: entry.socName,
          socCode: entry.socCode,
          count: entry.count,
          percentage: totalEvents > 0 ? Math.round((entry.count / totalEvents) * 10000) / 100 : 0,
          topPTs,
        };
      })
      .sort((a, b) => b.count - a.count);

    return distribution;
  }

  // -------------------------------------------------------------------------
  // 5. validateCoding
  // -------------------------------------------------------------------------

  async validateCoding(
    ptCode: string,
    socCode: string,
    _organizationId: number
  ): Promise<boolean> {
    if (!ptCode || !socCode) {
      return false;
    }

    try {
      const results = await db.execute(
        sql`SELECT COUNT(*)::int AS cnt
            FROM meddra_term_reference
            WHERE pt_code = ${ptCode}
              AND soc_code = ${socCode}`
      );

      const rows = results as any[];
      if (rows && rows.length > 0) {
        return (rows[0].cnt || 0) > 0;
      }
      return false;
    } catch (error) {
      // If the reference table doesn't exist yet, we cannot validate
      console.warn(
        '[MedDRA] Could not validate coding — meddra_term_reference table may not exist:',
        (error as Error).message
      );
      return false;
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * Exact case-insensitive match on PT name or LLT name.
   */
  private async exactMatch(
    term: string,
    organizationId: number
  ): Promise<MedDRACodingResult | null> {
    try {
      const results = await db.execute(
        sql`SELECT
              pt_code, pt_name,
              llt_code, llt_name,
              hlt_code, hlt_name,
              hlgt_code, hlgt_name,
              soc_code, soc_name,
              is_primary_soc
            FROM meddra_term_reference
            WHERE (LOWER(pt_name) = LOWER(${term}) OR LOWER(llt_name) = LOWER(${term}))
            ORDER BY is_primary_soc DESC
            LIMIT 5`
      );

      const rows = results as unknown as MedDRARow[];
      if (!rows || rows.length === 0) {
        return null;
      }

      const primaryRow = rows[0];

      // Build alternative PTs from remaining rows (distinct PTs only)
      const alternativePTs = rows
        .slice(1)
        .filter((r) => r.pt_code !== primaryRow.pt_code)
        .map((r) => ({
          ptCode: r.pt_code,
          ptName: r.pt_name,
          confidence: 0.95,
        }));

      return {
        verbatimTerm: term,
        codingMethod: 'exact_match',
        confidence: 1.0,
        hierarchy: {
          socCode: primaryRow.soc_code,
          socName: primaryRow.soc_name,
          hlgtCode: primaryRow.hlgt_code ?? undefined,
          hlgtName: primaryRow.hlgt_name ?? undefined,
          hltCode: primaryRow.hlt_code ?? undefined,
          hltName: primaryRow.hlt_name ?? undefined,
          ptCode: primaryRow.pt_code,
          ptName: primaryRow.pt_name,
          lltCode: primaryRow.llt_code ?? undefined,
          lltName: primaryRow.llt_name ?? undefined,
        },
        isPrimaryPath: Boolean(primaryRow.is_primary_soc),
        alternativePTs: alternativePTs.length > 0 ? alternativePTs : undefined,
      };
    } catch (error) {
      // Table may not exist yet — fall through to next matching strategy
      console.warn(
        '[MedDRA] Exact match lookup failed (table may not exist):',
        (error as Error).message
      );
      return null;
    }
  }

  /**
   * Fuzzy match using ILIKE with leading/trailing wildcards and word-boundary
   * tokenisation for multi-word terms.
   */
  private async fuzzyMatch(
    term: string,
    organizationId: number
  ): Promise<MedDRACodingResult | null> {
    try {
      // Build a pattern that matches any term containing all significant words
      const words = term
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2); // skip very short words like "of", "in"

      if (words.length === 0) {
        return null;
      }

      // Build parameterized ILIKE conditions for each word
      // Uses Drizzle sql template literals for injection safety
      const patterns = words.map((w) => {
        const escaped = w.replace(/[%_]/g, '\\$&');
        return `%${escaped}%`;
      });

      // Build the query using parameterized sql template
      let query = sql`
        SELECT
          pt_code, pt_name,
          llt_code, llt_name,
          hlt_code, hlt_name,
          hlgt_code, hlgt_name,
          soc_code, soc_name,
          is_primary_path as is_primary_soc
        FROM meddra_term_reference
        WHERE 1=1
      `;
      for (const pattern of patterns) {
        query = sql`${query} AND (pt_name ILIKE ${pattern} OR llt_name ILIKE ${pattern})`;
      }
      query = sql`${query} ORDER BY is_primary_path DESC, LENGTH(pt_name) ASC LIMIT 5`;

      const results = await db.execute(query);
      const rows = results as unknown as MedDRARow[];

      if (!rows || rows.length === 0) {
        return null;
      }

      const primaryRow = rows[0];

      const alternativePTs = rows
        .slice(1)
        .filter((r) => r.pt_code !== primaryRow.pt_code)
        .map((r) => ({
          ptCode: r.pt_code,
          ptName: r.pt_name,
          confidence: 0.75,
        }));

      return {
        verbatimTerm: term,
        codingMethod: 'fuzzy_match',
        confidence: 0.8,
        hierarchy: {
          socCode: primaryRow.soc_code,
          socName: primaryRow.soc_name,
          hlgtCode: primaryRow.hlgt_code ?? undefined,
          hlgtName: primaryRow.hlgt_name ?? undefined,
          hltCode: primaryRow.hlt_code ?? undefined,
          hltName: primaryRow.hlt_name ?? undefined,
          ptCode: primaryRow.pt_code,
          ptName: primaryRow.pt_name,
          lltCode: primaryRow.llt_code ?? undefined,
          lltName: primaryRow.llt_name ?? undefined,
        },
        isPrimaryPath: Boolean(primaryRow.is_primary_soc),
        alternativePTs: alternativePTs.length > 0 ? alternativePTs : undefined,
      };
    } catch (error) {
      console.warn(
        '[MedDRA] Fuzzy match lookup failed (table may not exist):',
        (error as Error).message
      );
      return null;
    }
  }

  /**
   * AI-assisted coding via unified AI client when no database match is found.
   * Confidence is capped at 0.7 for AI-only results because there is no
   * authoritative MedDRA reference to validate against.
   */
  private async aiAssistedCoding(term: string): Promise<MedDRACodingResult> {
    const content = await ai.complete(
      [
        { role: 'system', content: MEDDRA_CODING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Code the following verbatim adverse event term to MedDRA:\n\n"${term}"`,
        },
      ],
      { jsonMode: true, temperature: 0.0, maxTokens: 1200 }
    );

    if (!content) {
      throw new Error(`AI model returned empty response when coding term: "${term}"`);
    }

    let parsed: AICodeResponse;
    try {
      parsed = JSON.parse(content) as AICodeResponse;
    } catch (parseError) {
      throw new Error(
        `Failed to parse AI coding response for term "${term}": ${(parseError as Error).message}`
      );
    }

    // Cap AI confidence at 0.7 — without MedDRA reference data we cannot be certain
    const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    const cappedConfidence = Math.min(0.7, Math.max(0, rawConfidence));

    return {
      verbatimTerm: term,
      codingMethod: 'ai_assisted',
      confidence: cappedConfidence,
      hierarchy: {
        socCode: parsed.socCode || 'AI_SUGGESTED',
        socName: parsed.socName || 'Unknown SOC',
        hlgtCode: parsed.hlgtCode || undefined,
        hlgtName: parsed.hlgtName || undefined,
        hltCode: parsed.hltCode || undefined,
        hltName: parsed.hltName || undefined,
        ptCode: parsed.ptCode || 'AI_SUGGESTED',
        ptName: parsed.ptName || term,
        lltCode: parsed.lltCode || undefined,
        lltName: parsed.lltName || undefined,
      },
      isPrimaryPath: true, // AI always attempts the primary path
      alternativePTs: undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const meddraCodingService = new MedDRACodingService();
