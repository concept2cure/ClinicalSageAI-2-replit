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
import { computeReadinessScore, type ReadinessContext } from '../intelligence/readiness-scoring-engine.js';
import { generateRecommendations, type RecommendationContext } from '../intelligence/recommendation-engine.js';
import { generateNextActions } from '../intelligence/next-best-action-engine.js';
import { getProjectSignals } from '../intelligence/rim.js';
import { getProjectIntelligence } from '../intelligence/project-intelligence-service.js';
import { analyzeCrossModuleRelationships } from '../intelligence/cross-module-intelligence.js';
import { buildEvidenceChain, computeConfidence, analyzeFactors, type EvidenceSource } from '../intelligence/evidence-confidence-model.js';
import { getDeficienciesBySubmissionType, getCriticalDeficiencies, type SubmissionType } from './deficiency-taxonomy.js';

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
  const match = message.match(/^\/(risk|readiness|precedent|draft|preflight|claims|recommend|next|simulate|signals|export|assess|twin|consistency|deficiencies|knowledge)\b\s*(.*)/i);
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
    const limitParam = `$${categories.length + 2}`;
    const result = await pool.query(
      `SELECT content, title, confidence, importance, category
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN (${catPlaceholders})
       ORDER BY importance DESC, created_at DESC
       LIMIT ${limitParam}`,
      [projectId, ...categories, limit]
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

async function enrichWithReadiness(projectId: string | number, orgId?: number): Promise<string> {
  // Try live readiness scoring engine first
  if (orgId) {
    try {
      const ctx: ReadinessContext = { organizationId: orgId, projectId: Number(projectId) };
      const score = await computeReadinessScore(ctx);
      const gapLines = score.gaps.slice(0, 8).map(g =>
        `- **[${g.severity.toUpperCase()}]** ${g.module}: ${g.description} _(${g.remediation})_`
      ).join('\n');
      const dimLines = Object.entries(score.dimensions || {}).map(([k, v]: [string, any]) =>
        `| ${k} | ${typeof v === 'number' ? v : v?.score ?? '—'}/100 |`
      ).join('\n');

      return `\n\n## Live Readiness Assessment\n**Overall Score: ${score.overallScore}/100** | Trend: ${score.trend?.direction || 'unknown'}\n\n**Predictions:** Approval probability ~${score.predictions?.approvalProbability ?? '—'}% | Est. ${score.predictions?.estimatedDeficiencies ?? '—'} deficiencies | ~${score.predictions?.estimatedReviewDays ?? '—'} review days\n\n| Dimension | Score |\n|---|---|\n${dimLines}\n\n**Top Gaps (${score.gaps.length} total):**\n${gapLines || '- None identified'}\n\nPresent these scores directly. Be specific about gaps and remediation steps.`;
    } catch (e: any) {
      console.warn('[enrichment] Live readiness failed, falling back to memory:', e?.message);
    }
  }
  // Fallback to stored memory
  return enrichWithProjectMemory(
    projectId,
    ['submission_readiness', 'readiness_score', 'completeness_assessment'],
    'Readiness Assessment',
    'Current readiness data for this project. Give concrete scores and gap details.',
    5
  );
}

async function enrichWithRecommendations(projectId: string | number, orgId?: number): Promise<string> {
  // Try live recommendation engine first
  if (orgId) {
    try {
      const ctx: RecommendationContext & ReadinessContext = {
        organizationId: orgId,
        projectId: Number(projectId),
        triggeredBy: 'ana-chat',
      };
      const actionSet = await generateNextActions(ctx, 8);
      const actionLines = actionSet.actions.slice(0, 8).map((a, i) =>
        `${i + 1}. **${a.title}** [${a.urgency}/${a.impact}] — ${a.description}${a.estimatedEffortHours ? ` (~${a.estimatedEffortHours}h)` : ''}`
      ).join('\n');

      return `\n\n## Next Best Actions (Live)\n**${actionSet.actions.length} actions** prioritized by urgency and impact.\n\n${actionLines || 'No actions generated.'}\n\nPresent these as a prioritized to-do list. Be directive — tell the user what to do first and why.`;
    } catch (e: any) {
      console.warn('[enrichment] Live recommendations failed, falling back to memory:', e?.message);
    }
  }
  // Fallback to stored memory
  return enrichWithProjectMemory(
    projectId,
    ['recommendation_feedback', 'next_best_action', 'workflow_optimization'],
    'Recommendations & Next Actions',
    'Active recommendations and prioritized next steps. Present as an actionable list.',
    6
  );
}

async function enrichWithClaims(projectId: string | number): Promise<string> {
  // Try to build evidence chains from stored memory
  try {
    const result = await pool.query(
      `SELECT content, title, confidence, category
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN ('evidence_assessment', 'claim_evidence_map', 'evidence_gap')
       ORDER BY importance DESC, created_at DESC
       LIMIT $2`,
      [projectId, 8]
    );

    if (result.rows.length > 0) {
      // Build evidence sources from memory entries
      const sources: EvidenceSource[] = result.rows.map((r: any) => ({
        sourceType: r.category === 'evidence_gap' ? 'ai_analysis' as const : 'document_state' as const,
        sourceId: `mem-${r.title || 'unknown'}`,
        sourceTitle: r.title || 'Evidence entry',
        relevance: r.confidence || 0.5,
        extractedValue: r.content?.slice(0, 200),
      }));

      const chain = buildEvidenceChain(sources);
      const confidence = computeConfidence(sources);
      const factors = analyzeFactors(sources);

      const entryLines = result.rows.map((r: any) =>
        `- **${r.title || r.category}** [${r.confidence ? Math.round(r.confidence * 100) + '%' : '—'}]: ${r.content?.slice(0, 300)}`
      ).join('\n');

      return `\n\n## Evidence & Claims Analysis\n**Evidence Chain Strength:** ${chain.chainStrength} | **Confidence:** ${confidence}/100\n**Factors:** ${Object.entries(factors).map(([k, v]) => `${k}: ${v}`).join(', ')}\n\n**Evidence Entries:**\n${entryLines}\n\nAnalyze the strength of evidence chains. Flag any claims with weak or missing evidence support.`;
    }
  } catch {
    // Fall through
  }
  return enrichWithProjectMemory(
    projectId,
    ['evidence_assessment', 'claim_evidence_map', 'evidence_gap'],
    'Claims & Evidence Intelligence',
    'Evidence chain data and claim-to-evidence mapping. Flag any unsupported claims.',
    5
  );
}

async function enrichWithCrossModule(projectId: string | number, orgId?: number): Promise<string> {
  if (!orgId) return '';
  try {
    const report = await analyzeCrossModuleRelationships({ organizationId: orgId, projectId: Number(projectId) });
    if (!report || report.insights.length === 0) return '';

    const insightLines = report.insights.slice(0, 8).map((i: any) =>
      `- **[${i.severity || i.type || 'info'}]** ${i.description || i.message || String(i)}${i.affectedModules ? ` (${i.affectedModules.join(', ')})` : ''}`
    ).join('\n');

    return `\n\n## Cross-Module Consistency Report (Live)\n**${report.insights.length} insights** across ${report.documentsCovered || '—'} documents.\n\n${insightLines}\n\nHighlight stale references, status gaps, and orphaned documents. Be specific about which modules are affected.`;
  } catch (e: any) {
    console.warn('[enrichment] Cross-module analysis failed:', e?.message);
    return '';
  }
}

async function enrichWithSignals(projectId: string | number): Promise<string> {
  // Try live RIM signals first
  try {
    const signals = getProjectSignals(String(projectId));
    if (signals && signals.length > 0) {
      const signalLines = signals.slice(0, 10).map((s: any) =>
        `- **[${s.riskLevel || s.type || 'signal'}]** ${s.content?.slice(0, 300) || s.message || 'No content'} (score: ${s.score ?? '—'})`
      ).join('\n');
      return `\n\n## RIM Intelligence Signals (Live)\n**${signals.length} signals** accumulated for this project.\n\n${signalLines}\n\nSummarize patterns, highlight recurring risks, and note trend directions.`;
    }
  } catch {
    // Fall through to memory
  }
  return enrichWithProjectMemory(
    projectId,
    ['intelligence_signal_summary', 'rim_pattern_registry', 'risk_signal'],
    'RIM Signal History',
    'Accumulated regulatory intelligence signals for this project.',
    8
  );
}

async function enrichWithDeficiencies(submissionType?: string): Promise<string> {
  try {
    const type = (submissionType || 'IND') as SubmissionType;
    const deficiencies = getDeficienciesBySubmissionType(type);
    const critical = getCriticalDeficiencies(type);

    if (deficiencies.length === 0) return '';

    const criticalLines = critical.slice(0, 5).map(d =>
      `- **[CRITICAL]** ${d.title}: ${d.description} _(${d.category})_`
    ).join('\n');

    const otherLines = deficiencies
      .filter(d => !critical.includes(d))
      .slice(0, 5)
      .map(d => `- **[${d.severity?.toUpperCase() || 'MEDIUM'}]** ${d.title}: ${d.description}`)
      .join('\n');

    return `\n\n## Deficiency Taxonomy for ${type.toUpperCase()}\n**${critical.length} critical** out of ${deficiencies.length} known deficiency patterns.\n\n**Critical Deficiencies:**\n${criticalLines}\n\n**Other Patterns:**\n${otherLines}\n\nUse these to preempt reviewer deficiency findings. Be specific about which patterns apply to the user's current work.`;
  } catch {
    return '';
  }
}

async function enrichWithKnowledgeSearch(query: string, projectId: string | number): Promise<string> {
  try {
    // Search project memory entries semantically
    const result = await pool.query(
      `SELECT title, content, category, confidence, importance
       FROM project_memory_entries
       WHERE project_id = $1
       ORDER BY importance DESC, created_at DESC
       LIMIT $2`,
      [projectId, 10]
    );

    if (result.rows.length === 0) return '';

    const entries = result.rows.map((r: any) =>
      `- **${r.title || r.category}** [${r.category}] ${r.confidence ? `(${Math.round(r.confidence * 100)}%)` : ''}: ${r.content?.slice(0, 300)}`
    ).join('\n');

    return `\n\n## Knowledge Base Search Results\n**${result.rows.length} entries** found in project knowledge.\n\n${entries}\n\nReference these knowledge atoms when answering. Cite the category and confidence level.`;
  } catch {
    return '';
  }
}

// ─── Project intelligence summary (first-message context) ────────────────────

async function enrichWithProjectSummary(projectId: string | number, orgId?: number): Promise<string> {
  if (!orgId) return '';
  try {
    const intel = await getProjectIntelligence(Number(projectId), orgId);
    if (!intel) return '';

    const parts: string[] = ['## Project Intelligence Profile'];
    if (intel.regulatoryStrategy) parts.push(`**Strategy:** ${intel.regulatoryStrategy}`);
    if (intel.targetIndication) parts.push(`**Indication:** ${intel.targetIndication}`);
    if (intel.targetPopulation) parts.push(`**Population:** ${intel.targetPopulation}`);

    if (intel.riskFactors.length > 0) {
      parts.push(`\n**Known Risks (${intel.riskFactors.length}):**`);
      for (const r of intel.riskFactors.slice(0, 5)) {
        parts.push(`- [${(r as any).severity || 'medium'}] ${(r as any).description || (r as any).factor || String(r)}`);
      }
    }

    if (intel.openQuestions.length > 0) {
      parts.push(`\n**Open Questions (${intel.openQuestions.length}):**`);
      for (const q of intel.openQuestions.slice(0, 3)) {
        parts.push(`- ${(q as any).question || String(q)}`);
      }
    }

    if (intel.keyDecisions.length > 0) {
      parts.push(`\n**Key Decisions (${intel.keyDecisions.length}):**`);
      for (const d of intel.keyDecisions.slice(0, 3)) {
        parts.push(`- ${(d as any).decision || String(d)} (${(d as any).status || 'pending'})`);
      }
    }

    if (intel.learnedInsights.length > 0) {
      parts.push(`\n**Learned Insights (${intel.learnedInsights.length}):**`);
      for (const i of intel.learnedInsights.slice(0, 3)) {
        parts.push(`- ${(i as any).insight || String(i)}`);
      }
    }

    parts.push(`\n**Documents:** ${intel.documentStats.totalIngested} ingested | ${intel.memoryEntryCount} memory atoms`);

    return '\n\n' + parts.join('\n') + '\n\nUse this context to personalize your responses. Reference known risks, open questions, and decisions.';
  } catch {
    return '';
  }
}

// ─── Main enrichment function ────────────────────────────────────────────────

export async function enrichContextForChat(params: {
  message: string;
  projectId?: string | number;
  organizationId?: number;
  submissionType?: string;
}): Promise<EnrichmentResult> {
  const { message, projectId, organizationId, submissionType } = params;
  const blocks: string[] = [];
  const sources: string[] = [];
  let rewrittenMessage: string | undefined;

  if (!projectId) return { block: '', sources: [] };

  // ── Always inject project intelligence summary when available ──
  const projectSummary = await enrichWithProjectSummary(projectId, organizationId).catch(() => '');
  if (projectSummary) {
    blocks.push(projectSummary);
    sources.push('project-profile');
  }

  // ── Check for slash commands first ──
  const slash = detectSlashCommand(message);
  if (slash) {
    const enrichMap: Record<string, () => Promise<string>> = {
      risk: () => Promise.all([enrichWithForesight(projectId), enrichWithCRLRTF(projectId)]).then(r => r.join('')),
      readiness: () => enrichWithReadiness(projectId, organizationId),
      precedent: () => enrichWithPrecedents(projectId),
      claims: () => enrichWithClaims(projectId),
      recommend: () => enrichWithRecommendations(projectId, organizationId),
      next: () => enrichWithRecommendations(projectId, organizationId),
      signals: () => enrichWithSignals(projectId),
      simulate: () => enrichWithCRLRTF(projectId),
      assess: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
        enrichWithSignals(projectId),
        enrichWithForesight(projectId),
      ]).then(r => r.join('')),
      twin: () => Promise.all([
        enrichWithClaims(projectId),
        enrichWithCRLRTF(projectId),
        enrichWithReadiness(projectId, organizationId),
      ]).then(r => r.join('')),
      consistency: () => enrichWithCrossModule(projectId, organizationId),
      deficiencies: () => enrichWithDeficiencies(submissionType),
      knowledge: () => enrichWithKnowledgeSearch(slash.args || message, projectId),
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
      assess: 'Run a comprehensive assessment of this project: readiness score, top recommendations, risk signals, and predictions. Give me the full picture.',
      twin: 'Run a submission twin analysis: evaluate claims vs evidence integrity, identify unsupported claims, simulate reviewer challenges, and assess submission fragility.',
      consistency: 'Analyze cross-module consistency: find stale references, status gaps, orphaned documents, and module dependency issues across the entire dossier.',
      deficiencies: `Show the known deficiency taxonomy for ${submissionType || 'this submission type'}. List critical deficiency patterns and common reviewer triggers.`,
      knowledge: slash.args ? `Search the project knowledge base for: ${slash.args}` : 'Show all knowledge atoms stored for this project.',
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
      { test: READINESS_TRIGGERS, fn: () => enrichWithReadiness(projectId, organizationId), name: 'readiness' },
      { test: RECOMMENDATION_TRIGGERS, fn: () => enrichWithRecommendations(projectId, organizationId), name: 'recommendations' },
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
