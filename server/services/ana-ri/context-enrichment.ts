/**
 * AnA RI — Context Enrichment Layer
 *
 * Detects when the user's message warrants data from intelligence
 * services and injects relevant data into the system prompt so AnA
 * can reference it naturally in conversation.
 *
 * Also detects slash commands (/risk, /readiness, /precedent, etc.)
 * and triggers focused enrichment.
 *
 * Design principle: chat-first. No new UI. AnA just "knows."
 *
 * @module server/services/ana-ri/context-enrichment
 */

import { pool } from '../../db.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnrichmentResult {
  block: string;
  sources: string[];
  /** Rewritten message if a slash command was detected (strips the command prefix) */
  rewrittenMessage?: string;
}

// ─── Slash command detection ─────────────────────────────────────────────────

interface SlashCommand {
  command: string;
  args: string;
}

function detectSlashCommand(message: string): SlashCommand | null {
  const match = message.match(/^\/(risk|readiness|precedent|draft|preflight|claims|recommend|next|simulate|signals|export)\b\s*(.*)/i);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2].trim() };
}

// ─── Trigger patterns ────────────────────────────────────────────────────────

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
];

const CRL_RTF_TRIGGERS = [
  /\b(?:complete response|crl|refuse to file|rtf|deficiency letter)\b/i,
  /\b(?:rejection|rejected|denied|information request)\b/i,
  /\b(?:what could go wrong|likely deficien|common (?:reason|cause).*(?:reject|fail|deny))\b/i,
];

const READINESS_TRIGGERS = [
  /\b(?:readiness|ready|submission ready|are we ready|how ready)\b/i,
  /\b(?:readiness score|submission score|completeness)\b/i,
];

const RECOMMENDATION_TRIGGERS = [
  /\b(?:what should|recommend|suggestion|next step|what.s next|prioriti[zs]e)\b/i,
  /\b(?:what do you recommend|best move|action item|what now)\b/i,
];

const CLAIMS_TRIGGERS = [
  /\b(?:claim[s]?|evidence|support(?:ed|ing)?|substantiat)\b/i,
  /\b(?:evidence gap|unsupported|claim.*evidence|evidence.*chain)\b/i,
];

const SIMULATION_TRIGGERS = [
  /\b(?:simulat|what.if|scenario|challenge|reviewer.*question)\b/i,
  /\b(?:how would.*reviewer|anticipat.*question|likely.*question)\b/i,
];

function matchesTriggers(message: string, triggers: RegExp[]): boolean {
  return triggers.some(t => t.test(message));
}

// ─── Enrichment functions ────────────────────────────────────────────────────

async function enrichWithProjectMemory(
  projectId: string | number,
  categories: string[],
  label: string,
  description: string,
  limit = 5,
): Promise<string> {
  try {
    const catPlaceholders = categories.map((_, i) => `$${i + 2}`).join(', ');
    const result = await pool.query(
      `SELECT content, title, confidence, importance, category
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN (${catPlaceholders})
       ORDER BY importance DESC, created_at DESC
       LIMIT ${limit}`,
      [projectId, ...categories]
    );

    if (result.rows.length === 0) return '';

    const items = result.rows.map((r: any) => {
      const conf = r.confidence ? ` [${Math.round(r.confidence * 100)}% confidence]` : '';
      const title = r.title ? `**${r.title}**` : '';
      return `- ${title}${conf}: ${r.content.slice(0, 400)}`;
    }).join('\n');

    return `\n\n## ${label}\n${description}\n${items}`;
  } catch {
    return '';
  }
}

async function enrichWithForesight(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['risk_assessment', 'intelligence_signal_summary', 'submission_readiness'],
    'Foresight Intelligence (Risk & Predictions)',
    'The following risk signals and predictions exist for this project. Cite confidence levels when discussing risk.',
    5
  );
}

async function enrichWithPrecedents(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['precedent_analysis', 'competitive_intelligence', 'predicate_device'],
    'Precedent Intelligence',
    'The following precedents and comparators have been identified. Reference these for similar products/devices.',
    4
  );
}

async function enrichWithCRLRTF(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['rim_pattern_registry', 'deficiency_pattern', 'reviewer_trigger'],
    'Deficiency & Rejection Intelligence',
    'Known deficiency patterns and rejection risk signals. Use when discussing CRL/RTF risk.',
    5
  );
}

async function enrichWithReadiness(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['submission_readiness', 'readiness_score', 'completeness_assessment'],
    'Readiness Assessment',
    'Current readiness data for this project. Give concrete scores and gap details.',
    5
  );
}

async function enrichWithRecommendations(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['recommendation_feedback', 'next_best_action', 'workflow_optimization'],
    'Recommendations & Next Actions',
    'Active recommendations and prioritized next steps. Present as an actionable list.',
    6
  );
}

async function enrichWithClaims(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['evidence_assessment', 'claim_evidence_map', 'evidence_gap'],
    'Claims & Evidence Intelligence',
    'Evidence chain data and claim-to-evidence mapping. Flag any unsupported claims.',
    5
  );
}

async function enrichWithSignals(projectId: string | number): Promise<string> {
  return enrichWithProjectMemory(
    projectId,
    ['intelligence_signal_summary', 'rim_pattern_registry', 'risk_signal'],
    'RIM Signal History',
    'Accumulated regulatory intelligence signals for this project.',
    8
  );
}

// ─── Main enrichment function ────────────────────────────────────────────────

export async function enrichContextForChat(params: {
  message: string;
  projectId?: string | number;
  submissionType?: string;
}): Promise<EnrichmentResult> {
  const { message, projectId, submissionType } = params;
  const blocks: string[] = [];
  const sources: string[] = [];
  let rewrittenMessage: string | undefined;

  if (!projectId) return { block: '', sources: [] };

  // ── Check for slash commands first ──
  const slash = detectSlashCommand(message);
  if (slash) {
    const enrichMap: Record<string, () => Promise<string>> = {
      risk: () => Promise.all([enrichWithForesight(projectId), enrichWithCRLRTF(projectId)]).then(r => r.join('')),
      readiness: () => enrichWithReadiness(projectId),
      precedent: () => enrichWithPrecedents(projectId),
      claims: () => enrichWithClaims(projectId),
      recommend: () => enrichWithRecommendations(projectId),
      next: () => enrichWithRecommendations(projectId),
      signals: () => enrichWithSignals(projectId),
      simulate: () => enrichWithCRLRTF(projectId),
    };

    const enrichFn = enrichMap[slash.command];
    if (enrichFn) {
      const block = await enrichFn().catch(() => '');
      if (block) {
        blocks.push(block);
        sources.push(slash.command);
      }
    }

    // Rewrite the message to be natural for the LLM
    const commandDescriptions: Record<string, string> = {
      risk: 'Analyze the risk profile and submission risk for this project.',
      readiness: 'Assess how ready this project is for submission.',
      precedent: 'Find and analyze relevant regulatory precedents for this project.',
      draft: slash.args || 'Draft the current section.',
      preflight: 'Run a preflight check on the current section/module.',
      claims: 'Analyze the evidence chain and identify unsupported claims.',
      recommend: 'What are the top priority actions I should take next?',
      next: 'What should I work on next? Prioritize by impact.',
      simulate: 'Simulate likely reviewer challenges and questions.',
      signals: 'Show me all accumulated regulatory intelligence signals.',
      export: 'Export this conversation.',
    };

    rewrittenMessage = slash.args
      ? `${commandDescriptions[slash.command] || slash.command} ${slash.args}`
      : commandDescriptions[slash.command] || message;
  }

  // ── Natural language trigger detection (runs if no slash command) ──
  if (!slash) {
    const triggers: Array<{ test: RegExp[]; fn: () => Promise<string>; name: string }> = [
      { test: FORESIGHT_TRIGGERS, fn: () => enrichWithForesight(projectId), name: 'foresight' },
      { test: PRECEDENT_TRIGGERS, fn: () => enrichWithPrecedents(projectId), name: 'precedent' },
      { test: CRL_RTF_TRIGGERS, fn: () => enrichWithCRLRTF(projectId), name: 'deficiency' },
      { test: READINESS_TRIGGERS, fn: () => enrichWithReadiness(projectId), name: 'readiness' },
      { test: RECOMMENDATION_TRIGGERS, fn: () => enrichWithRecommendations(projectId), name: 'recommendations' },
      { test: CLAIMS_TRIGGERS, fn: () => enrichWithClaims(projectId), name: 'claims' },
      { test: SIMULATION_TRIGGERS, fn: () => enrichWithCRLRTF(projectId), name: 'simulation' },
    ];

    const matchedFns = triggers.filter(t => matchesTriggers(message, t.test));

    if (matchedFns.length > 0) {
      const results = await Promise.allSettled(
        matchedFns.map(async t => {
          const block = await t.fn();
          if (block) {
            blocks.push(block);
            sources.push(t.name);
          }
        })
      );
    }
  }

  return {
    block: blocks.join('\n'),
    sources,
    rewrittenMessage,
  };
}
