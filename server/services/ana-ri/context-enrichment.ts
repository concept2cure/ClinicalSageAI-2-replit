/**
 * AnA RI — Context Enrichment Layer
 *
 * Detects when the user's message warrants data from Foresight,
 * Precedent Engine, or other intelligence services, and injects
 * relevant data into the system prompt so AnA can reference it
 * naturally in conversation.
 *
 * Design principle: chat-first. No new UI. AnA just "knows" because
 * the context is enriched before the LLM sees it.
 *
 * @module server/services/ana-ri/context-enrichment
 */

import { pool } from '../../db.js';

// ─── Intent detection for enrichment triggers ────────────────────────────────

interface EnrichmentResult {
  block: string;
  sources: string[];
}

const FORESIGHT_TRIGGERS = [
  /\b(?:predict|probability|likelihood|chance|odds|forecast|success rate)\b/i,
  /\b(?:risk score|submission risk|approval probability|approval rate)\b/i,
  /\b(?:what are (?:the|our) (?:chances|odds|risks?))\b/i,
  /\b(?:will (?:this|it|we) (?:get approved|pass|succeed|be accepted))\b/i,
  /\b(?:how risky|risk profile|risk assessment|clinical risk)\b/i,
];

const PRECEDENT_TRIGGERS = [
  /\b(?:precedent|similar (?:product|device|drug|submission|approval))\b/i,
  /\b(?:predicate|comparable|benchmark|competitive landscape)\b/i,
  /\b(?:who else|what similar|has anyone|previous (?:approval|submission|clearance))\b/i,
  /\b(?:510\(k\) (?:clearance|predicate)|substantial equivalence)\b/i,
  /\b(?:approved.*similar|similar.*approved)\b/i,
];

const CRL_RTF_TRIGGERS = [
  /\b(?:complete response|crl|refuse to file|rtf|deficiency letter)\b/i,
  /\b(?:rejection|rejected|denied|information request)\b/i,
  /\b(?:what could go wrong|likely deficien|common (?:reason|cause).*(?:reject|fail|deny))\b/i,
];

function matchesTriggers(message: string, triggers: RegExp[]): boolean {
  return triggers.some(t => t.test(message));
}

// ─── Enrichment functions ────────────────────────────────────────────────────

async function enrichWithForesight(
  message: string,
  projectId?: string | number,
  submissionType?: string,
): Promise<string> {
  try {
    // Query project intelligence for existing risk data
    if (!projectId) return '';

    const result = await pool.query(
      `SELECT content, confidence, importance
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN ('risk_assessment', 'intelligence_signal_summary', 'submission_readiness')
       ORDER BY importance DESC, created_at DESC
       LIMIT 5`,
      [projectId]
    );

    if (result.rows.length === 0) return '';

    const signals = result.rows.map((r: any) =>
      `- [${r.confidence ? `Confidence: ${Math.round(r.confidence * 100)}%` : 'No confidence score'}] ${r.content.slice(0, 300)}`
    ).join('\n');

    return `\n\n## Foresight Intelligence (Project Risk Signals)\nThe following risk signals have been accumulated for this project:\n${signals}\n\nUse these when discussing risk, probability, or readiness. Cite the confidence levels.`;
  } catch {
    return '';
  }
}

async function enrichWithPrecedents(
  message: string,
  projectId?: string | number,
  submissionType?: string,
): Promise<string> {
  try {
    if (!projectId) return '';

    // Check for stored precedent data in project memory
    const result = await pool.query(
      `SELECT content, title, confidence
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN ('precedent_analysis', 'competitive_intelligence', 'predicate_device')
       ORDER BY importance DESC, created_at DESC
       LIMIT 4`,
      [projectId]
    );

    if (result.rows.length === 0) return '';

    const precedents = result.rows.map((r: any) =>
      `- **${r.title || 'Precedent'}**: ${r.content.slice(0, 400)}`
    ).join('\n');

    return `\n\n## Precedent Intelligence\nThe following precedents have been identified for this project:\n${precedents}\n\nReference these when discussing similar products, predicate devices, or competitive landscape.`;
  } catch {
    return '';
  }
}

async function enrichWithCRLRTF(
  message: string,
  projectId?: string | number,
  submissionType?: string,
): Promise<string> {
  try {
    if (!projectId) return '';

    const result = await pool.query(
      `SELECT content, confidence, importance
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN ('rim_pattern_registry', 'deficiency_pattern', 'reviewer_trigger')
       ORDER BY importance DESC, created_at DESC
       LIMIT 5`,
      [projectId]
    );

    if (result.rows.length === 0) return '';

    const patterns = result.rows.map((r: any) =>
      `- ${r.content.slice(0, 300)}`
    ).join('\n');

    return `\n\n## Deficiency & Rejection Intelligence\nKnown deficiency patterns and risk signals for this project:\n${patterns}\n\nUse these when discussing CRL/RTF risk, deficiencies, or reviewer concerns.`;
  } catch {
    return '';
  }
}

// ─── Main enrichment function ────────────────────────────────────────────────

/**
 * Analyze the user's message and enrich the system prompt with relevant
 * intelligence data from Foresight, Precedent Engine, and RIM.
 *
 * Returns a block to append to the system prompt (empty string if no enrichment needed).
 */
export async function enrichContextForChat(params: {
  message: string;
  projectId?: string | number;
  submissionType?: string;
}): Promise<EnrichmentResult> {
  const { message, projectId, submissionType } = params;
  const blocks: string[] = [];
  const sources: string[] = [];

  // Run enrichments in parallel for speed
  const enrichments = await Promise.allSettled([
    matchesTriggers(message, FORESIGHT_TRIGGERS)
      ? enrichWithForesight(message, projectId, submissionType).then(b => { if (b) { blocks.push(b); sources.push('foresight'); } })
      : Promise.resolve(),
    matchesTriggers(message, PRECEDENT_TRIGGERS)
      ? enrichWithPrecedents(message, projectId, submissionType).then(b => { if (b) { blocks.push(b); sources.push('precedent'); } })
      : Promise.resolve(),
    matchesTriggers(message, CRL_RTF_TRIGGERS)
      ? enrichWithCRLRTF(message, projectId, submissionType).then(b => { if (b) { blocks.push(b); sources.push('deficiency'); } })
      : Promise.resolve(),
  ]);

  return {
    block: blocks.join('\n'),
    sources,
  };
}
