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
import { querySignals, getRecurringPatterns, type IntelligenceSignal } from '../intelligence/signal-capture.js';
import { patternRegistry } from '../intelligence/pattern-registry.js';
import { getProjectIntelligence } from '../intelligence/project-intelligence-service.js';
import { analyzeCrossModuleRelationships } from '../intelligence/cross-module-intelligence.js';
import { buildEvidenceChain, computeConfidence, analyzeFactors, type EvidenceSource } from '../intelligence/evidence-confidence-model.js';
import { getDeficienciesBySubmissionType, getCriticalDeficiencies, type SubmissionType } from './deficiency-taxonomy.js';
import { buildWorkflowContext } from './workflow-orchestration.js';
import { detectDocumentType, buildDocumentGenerationContext } from './document-routing.js';
import { getFeedbackSummary } from '../intelligence/learning-loop-service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnrichmentResult {
  block: string;
  sources: string[];
  /** Rewritten message if a slash command was detected (strips the command prefix) */
  rewrittenMessage?: string;
  /** Metadata about the enrichment process for transparency */
  enrichmentMeta?: {
    /** Total enrichment sources attempted */
    sourcesAttempted: number;
    /** Sources that returned data */
    sourcesSucceeded: string[];
    /** Sources that failed or had no data */
    sourcesFailed: string[];
    /** Whether this was a slash-command-triggered or natural-language-triggered enrichment */
    triggerType: 'slash_command' | 'natural_language' | 'proactive' | 'none';
    /** The detected slash command, if any */
    detectedCommand?: string;
    /** Whether project context was available */
    hasProjectContext: boolean;
  };
}

// ─── Slash command detection ─────────────────────────────────────────────────

interface SlashCommand {
  command: string;
  args: string;
}

export const SUPPORTED_SLASH_COMMANDS = [
  'risk',
  'readiness',
  'precedent',
  'draft',
  'preflight',
  'claims',
  'recommend',
  'next',
  'simulate',
  'signals',
  'export',
  'assess',
  'twin',
  'consistency',
  'deficiencies',
  'knowledge',
  'decisions',
  'help',
  'sap',
  'power',
  'dose',
  'defensibility',
  'design',
  'safety',
  'cmc',
  'csr',
  'device',
  'diagnostics',
  'cms',
  'ectd',
  'audit',
  'amend',
  'review',
  'memo',
  'brief',
  'strategy',
  'freeze',
  'sign',
  'scan',
  'checklist',
  'submit',
  'workflow',
  'status',
  'narrative',
  'report',
  'iss',
  'ise',
  'ib',
  'smpc',
  'rmp',
  'uspi',
  'haq',
  'ask',
] as const;

const SUPPORTED_SLASH_COMMAND_REGEX = new RegExp(
  `^\\/(${SUPPORTED_SLASH_COMMANDS.join('|')})\\b\\s*(.*)`,
  'i',
);

export function detectSlashCommand(message: string): SlashCommand | null {
  const match = message.match(SUPPORTED_SLASH_COMMAND_REGEX);
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

const BIOSTAT_TRIGGERS = [
  /\b(?:sample size|power analysis|power calculation|statistical power|how many patients|how many subjects)\b/i,
  /\b(?:sap|statistical analysis plan|analysis plan)\b/i,
  /\b(?:dose escalation|dose.finding|3\+3|boin|crm|mtd|maximum tolerated dose|dlt)\b/i,
  /\b(?:biostatistic|biostat|statistician|statistical design|trial design)\b/i,
  /\b(?:adaptive design|group sequential|interim analysis|stopping rule|futility)\b/i,
  /\b(?:multiplicity|multiple endpoints|alpha spending|bonferroni|dunnett)\b/i,
  /\b(?:missing data|dropout|attrition|imputation|mmrm|locf)\b/i,
  /\b(?:estimand|intercurrent event|ich e9)\b/i,
  /\b(?:non.?inferiority|equivalence|superiority margin)\b/i,
  /\b(?:crossover|parallel.?arm|basket trial|umbrella trial|platform trial)\b/i,
  /\b(?:statistical defensib|endpoint.*quality|reviewer.*risk.*statistic)\b/i,
];

const SAFETY_TRIGGERS = [
  /\b(?:safety|adverse event|teae|sae|serious adverse|benefit.risk|dsur)\b/i,
  /\b(?:safety narrative|safety summary|safety section|safety report)\b/i,
  /\b(?:meddr|causality|severity|fatal|death|discontinu)\b/i,
];

const CMC_TRIGGERS = [
  /\b(?:cmc|chemistry.*manufacturing|manufacturing|comparability|analytical method)\b/i,
  /\b(?:cqa|critical quality|process validation|control strategy|stability)\b/i,
  /\b(?:module 3|drug substance|drug product|excipient|specification)\b/i,
];

const CSR_TRIGGERS = [
  /\b(?:csr|clinical study report|study report|ich e3)\b/i,
  /\b(?:efficacy.*result|safety.*result|disposition|demographics|baseline)\b/i,
];

const HAQ_TRIGGERS = [
  /\b(?:haq|health authority question|information request)\b/i,
  /\b(?:fda question|ema question|reviewer question|agency question)\b/i,
  /\b(?:respond to.*question|draft.*response|answer.*agency)\b/i,
  /\b(?:rtq|request for information|day \d+ (?:question|list))\b/i,
];

const DEVICE_TRIGGERS = [
  /\b(?:510\(k\)|predicate|substantial equivalence|medical device|de novo)\b/i,
  /\b(?:pma|premarket|eu mdr|ivdr|clinical evaluation report|cer)\b/i,
  /\b(?:device classification|product code|performance study)\b/i,
];

const ECTD_TRIGGERS = [
  /\b(?:ectd|module [1-5]|ctd structure|dossier structure|submission structure)\b/i,
  /\b(?:granule|lifecycle|sequence|submission.*package)\b/i,
];

const CMS_TRIGGERS = [
  /\b(?:cms|centers? for medicare|medicare|medicaid|coverage determination)\b/i,
  /\b(?:coding strategy|hcpcs|cpt|drg|apc|icd-10|ntap|pass-through)\b/i,
  /\b(?:reimbursement|payer|coverage|payment rate|value dossier|heor)\b/i,
];

const DIAGNOSTICS_TRIGGERS = [
  /\b(?:diagnostic|companion diagnostic|cdx|in.?vitro diagnostic|ivd)\b/i,
  /\b(?:analytical validation|clinical validation|sensitivity|specificity|ppv|npv)\b/i,
  /\b(?:lodd?|linearity|precision|repeatability|reproducibility|method comparison)\b/i,
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

    const items = result.rows.map((r: { confidence?: number; title?: string; content?: string }) => {
      const conf = r.confidence ? ` [${Math.round(r.confidence * 100)}% confidence]` : '';
      const title = r.title ? `**${r.title}**` : '';
      return `- ${title}${conf}: ${(r.content || '').slice(0, 400)}`;
    }).join('\n');

    return `\n\n## ${label}\n${description}\n${items}`;
  } catch (e: unknown) { console.warn("[enrichment] Query failed:", e instanceof Error ? e.message : String(e));
    return '';
  }
}

async function enrichWithForesight(projectId: string | number, orgId?: number): Promise<string> {
  let liveBlock = '';

  // Live path: pull real-time RIM signals sorted by score
  if (orgId) {
    try {
      const signals = querySignals({
        organizationId: orgId,
        projectId: Number(projectId),
        limit: 8,
      });
      if (signals.length > 0) {
        const lines = signals.map((s: IntelligenceSignal) =>
          `- **[${s.riskLevel.toUpperCase()}]** ${s.type} — score ${s.score}/100, confidence ${s.confidence}%${s.action ? `: ${s.action.slice(0, 200)}` : ''}`
        ).join('\n');
        liveBlock = `\n\n## LIVE RISK INTELLIGENCE\n${lines}`;
      }
    } catch (e: unknown) {
      // Fallback: live signals unavailable — memory-only path below
      console.warn('[enrichment] Live foresight signals failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // Historical path: always append memory-backed risk context
  const memoryBlock = await enrichWithProjectMemory(
    projectId,
    ['risk_assessment', 'intelligence_signal_summary', 'submission_readiness'],
    liveBlock ? 'HISTORICAL RISK CONTEXT' : 'Foresight Intelligence (Risk & Predictions)',
    liveBlock
      ? 'Persisted risk signals and predictions for longer-term trend reference.'
      : 'The following risk signals and predictions exist for this project. Cite confidence levels when discussing risk.',
    5
  );

  return liveBlock + memoryBlock;
}

async function enrichWithPrecedents(projectId: string | number): Promise<string> {
  // Structured precedent enrichment with category labels per type
  const categories = ['precedent_analysis', 'competitive_intelligence', 'predicate_device'] as const;
  const categoryLabels: Record<string, string> = {
    precedent_analysis: 'Regulatory Precedent Analysis',
    competitive_intelligence: 'Competitive Intelligence',
    predicate_device: 'Predicate Device Comparators',
  };

  try {
    const catPlaceholders = categories.map((_, i) => `$${i + 2}`).join(', ');
    const result = await pool.query(
      `SELECT content, title, confidence, importance, category
       FROM project_memory_entries
       WHERE project_id = $1 AND category IN (${catPlaceholders})
       ORDER BY importance DESC, created_at DESC
       LIMIT $${categories.length + 2}`,
      [projectId, ...categories, 12]
    );

    if (result.rows.length === 0) return '';

    // Group by category for structured output
    const grouped: Record<string, string[]> = {};
    for (const r of result.rows) {
      const cat = r.category as string;
      const label = categoryLabels[cat] || cat;
      if (!grouped[label]) grouped[label] = [];
      const conf = r.confidence ? ` [${Math.round(r.confidence * 100)}% confidence]` : '';
      const title = r.title ? `**${r.title}**` : '';
      grouped[label].push(`- ${title}${conf}: ${(r.content || '').slice(0, 400)}`);
    }

    const sections = Object.entries(grouped)
      .map(([label, items]) => `### ${label}\n${items.slice(0, 4).join('\n')}`)
      .join('\n\n');

    return `\n\n## PROJECT PRECEDENT INTELLIGENCE\nIdentified precedents and comparators. Reference these for similar products/devices.\n\n${sections}`;
  } catch (e: unknown) {
    console.warn('[enrichment] Precedent query failed:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

async function enrichWithCRLRTF(projectId: string | number, orgId?: number): Promise<string> {
  let liveBlock = '';

  // Live path: pull active patterns from the RIM pattern registry
  if (orgId) {
    try {
      const recurring = getRecurringPatterns(orgId, Number(projectId));
      if (recurring.length > 0) {
        // Resolve pattern details from registry for top matches
        const allPatterns = patternRegistry.getPatterns();
        const lines = recurring.slice(0, 8).map(r => {
          const pat = allPatterns.find(p => p.id === r.patternId);
          if (!pat) return `- **${r.patternId}** — ${r.occurrences} occurrences`;
          return `- **[${pat.severity.toUpperCase()}]** ${pat.name} (${pat.agency}) — ${r.occurrences} hits${pat.remediation ? ` | Fix: ${pat.remediation.slice(0, 150)}` : ''}`;
        }).join('\n');
        liveBlock = `\n\n## ACTIVE REGULATORY PATTERNS\n${lines}`;
      }
    } catch (e: unknown) {
      // Fallback: live patterns unavailable — memory-only path below
      console.warn('[enrichment] Live CRLRTF patterns failed:', e instanceof Error ? e.message : String(e));
    }
  }

  // Historical path: persisted deficiency patterns from memory
  const memoryBlock = await enrichWithProjectMemory(
    projectId,
    ['rim_pattern_registry', 'deficiency_pattern', 'reviewer_trigger'],
    liveBlock ? 'HISTORICAL DEFICIENCY PATTERNS' : 'Deficiency & Rejection Intelligence',
    liveBlock
      ? 'Persisted deficiency and rejection patterns for trend context.'
      : 'Known deficiency patterns and rejection risk signals. Use when discussing CRL/RTF risk.',
    5
  );

  return liveBlock + memoryBlock;
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
      const dimLines = Object.entries(score.dimensions || {}).map(([k, v]: [string, unknown]) =>
        `| ${k} | ${typeof v === 'number' ? v : (v && typeof v === 'object' && 'score' in v ? (v as Record<string, unknown>).score : '—')}/100 |`
      ).join('\n');

      return `\n\n## Live Readiness Assessment\n**Overall Score: ${score.overallScore}/100** | Trend: ${score.trend?.direction || 'unknown'}\n\n**Predictions:** Approval probability ~${score.predictions?.approvalProbability ?? '—'}% | Est. ${score.predictions?.estimatedDeficiencies ?? '—'} deficiencies | ~${score.predictions?.estimatedReviewDays ?? '—'} review days\n\n| Dimension | Score |\n|---|---|\n${dimLines}\n\n**Top Gaps (${score.gaps.length} total):**\n${gapLines || '- None identified'}\n\nPresent these scores directly. Be specific about gaps and remediation steps.`;
    } catch (e: unknown) {
      console.warn('[enrichment] Live readiness failed, falling back to memory:', e instanceof Error ? e.message : 'unknown error');
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
  // Query feedback summary to avoid repeating dismissed recommendations
  let feedbackNote = '';
  if (orgId) {
    try {
      const feedback = await getFeedbackSummary(Number(projectId), orgId);
      const repeatedDismissals = feedback.topDismissedTypes.filter(d => d.count > 2);
      if (repeatedDismissals.length > 0) {
        const dismissalLines = repeatedDismissals.slice(0, 3).map(
          d => `- ${d.type}: dismissed ${d.count} times`
        ).join('\n');
        feedbackNote = `\n\nNote: The user has previously dismissed the following recommendation types. Consider alternative approaches or provide stronger justification.\n${dismissalLines}`;
      }
    } catch (e: unknown) {
      // Non-blocking — feedback query is optional enrichment
    }
  }

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

      return `\n\n## Next Best Actions (Live)\n**${actionSet.actions.length} actions** prioritized by urgency and impact.\n\n${actionLines || 'No actions generated.'}${feedbackNote}\n\nPresent these as a prioritized to-do list. Be directive — tell the user what to do first and why.`;
    } catch (e: unknown) {
      console.warn('[enrichment] Live recommendations failed, falling back to memory:', e instanceof Error ? e.message : 'unknown error');
    }
  }
  // Fallback to stored memory
  const memoryResult = await enrichWithProjectMemory(
    projectId,
    ['recommendation_feedback', 'next_best_action', 'workflow_optimization'],
    'Recommendations & Next Actions',
    'Active recommendations and prioritized next steps. Present as an actionable list.',
    6
  );
  return memoryResult + feedbackNote;
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
      const sources: EvidenceSource[] = result.rows.map((r: { category?: string; title?: string; confidence?: number; content?: string }) => ({
        sourceType: r.category === 'evidence_gap' ? 'ai_analysis' as const : 'document_state' as const,
        sourceId: `mem-${r.title || 'unknown'}`,
        sourceTitle: r.title || 'Evidence entry',
        relevance: r.confidence || 0.5,
        extractedValue: r.content?.slice(0, 200),
      }));

      const chain = buildEvidenceChain(sources);
      const confidence = computeConfidence(sources);
      const factors = analyzeFactors(sources);

      const entryLines = result.rows.map((r: { title?: string; category?: string; confidence?: number; content?: string }) =>
        `- **${r.title || r.category}** [${r.confidence ? Math.round(r.confidence * 100) + '%' : '—'}]: ${r.content?.slice(0, 300)}`
      ).join('\n');

      return `\n\n## Evidence & Claims Analysis\n**Evidence Chain Strength:** ${chain.chainStrength} | **Confidence:** ${confidence}/100\n**Factors:** ${Object.entries(factors).map(([k, v]) => `${k}: ${v}`).join(', ')}\n\n**Evidence Entries:**\n${entryLines}\n\nAnalyze the strength of evidence chains. Flag any claims with weak or missing evidence support.`;
    }
  } catch (e: unknown) { console.warn("[enrichment] Query failed:", e instanceof Error ? e.message : String(e));
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

    const insightLines = report.insights.slice(0, 8).map((i: { severity?: string; type?: string; description?: string; message?: string; affectedModules?: string[] }) =>
      `- **[${i.severity || i.type || 'info'}]** ${i.description || i.message || String(i)}${i.affectedModules ? ` (${i.affectedModules.join(', ')})` : ''}`
    ).join('\n');

    return `\n\n## Cross-Module Consistency Report (Live)\n**${report.insights.length} insights** across ${report.documentsCovered || '—'} documents.\n\n${insightLines}\n\nHighlight stale references, status gaps, and orphaned documents. Be specific about which modules are affected.`;
  } catch (e: unknown) {
    console.warn('[enrichment] Cross-module analysis failed:', e instanceof Error ? e.message : 'unknown error');
    return '';
  }
}

async function enrichWithSignals(projectId: string | number, orgId?: number): Promise<string> {
  // Try live RIM signals first
  if (orgId) {
    try {
      const summary = getProjectSignals(orgId, Number(projectId));
      if (summary && summary.totalSignals > 0) {
        const byRisk = Object.entries(summary.byRiskLevel)
          .filter(([, count]) => Number(count) > 0)
          .map(([risk, count]) => `- **${risk}**: ${count}`)
          .join('\n');
        return `\n\n## RIM Intelligence Signals (Live)\n**${summary.totalSignals} signals** accumulated for this project.\n\nTrend: **${summary.overallTrend}** (${summary.trendConfidence}, n=${summary.trendSampleSize})\nAverage score: **${summary.averageScore}**\nTop patterns: ${summary.topPatternIds.slice(0, 6).join(', ') || 'none'}\n\n### By risk\n${byRisk || '- none'}\n\nSummarize patterns, highlight recurring risks, and note trend directions.`;
      }
    } catch (e: unknown) { console.warn("[enrichment] Query failed:", e instanceof Error ? e.message : String(e));
      // Fall through to memory
    }
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
  } catch (e: unknown) { console.warn("[enrichment] Query failed:", e instanceof Error ? e.message : String(e));
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

    const entries = result.rows.map((r: { title?: string; category?: string; confidence?: number; content?: string }) =>
      `- **${r.title || r.category}** [${r.category}] ${r.confidence ? `(${Math.round(r.confidence * 100)}%)` : ''}: ${r.content?.slice(0, 300)}`
    ).join('\n');

    return `\n\n## Knowledge Base Search Results\n**${result.rows.length} entries** found in project knowledge.\n\n${entries}\n\nReference these knowledge atoms when answering. Cite the category and confidence level.`;
  } catch (e: unknown) { console.warn("[enrichment] Query failed:", e instanceof Error ? e.message : String(e));
    return '';
  }
}

async function enrichWithDecisions(projectId: string | number): Promise<string> {
  try {
    const { decisionLifecycleService } = await import('../decision-lifecycle-service.js');
    const decisionCtx = decisionLifecycleService.getDecisionContext(String(projectId), { limit: 12 });
    const decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(String(projectId), {});

    if (decisionCtx.length === 0) {
      return '\n\n## Decision Audit Trail\nNo formal decisions recorded for this project yet.';
    }

    const lines = decisionCtx.slice(0, 10).map(({ decision, receipt }) => {
      const authority = decision.authority?.level ? ` | authority: ${decision.authority.level}` : '';
      const receiptState = receipt
        ? ` | receipt: ${receipt.execution?.executed ? 'executed' : 'pending'}${(receipt.pendingApprovals?.length || 0) > 0 ? `, ${receipt.pendingApprovals.length} pending approval(s)` : ''}`
        : '';
      return `- **[${decision.status.toUpperCase()}]** ${decision.kind}: ${decision.summary}${authority}${receiptState}`;
    });

    return `\n\n## Decision Audit Trail\n${decisionAwareStatus.summary}\n\n${lines.join('\n')}\n\nUse this decision trail for explanation grounding and to avoid contradicting prior approvals.`;
  } catch (e: unknown) {
    console.warn('[enrichment] Decision trail enrichment failed:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

async function enrichWithDomainMemory(projectId: string | number, domain: string, categories: string[], label: string): Promise<string> {
  const memBlock = await enrichWithProjectMemory(projectId, categories, label,
    `Project-specific ${domain} data. Reference directly in your response.`, 5);
  return memBlock || `\n\n## ${label}\nNo ${domain} data found for this project yet. Ask the user what ${domain} work they need and gather parameters conversationally.`;
}

async function enrichWithSafety(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'safety',
    ['safety_narrative', 'adverse_event_summary', 'benefit_risk', 'safety_signal'],
    'Safety Intelligence');
}

async function enrichWithCMC(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'CMC',
    ['cmc_assessment', 'manufacturing_change', 'comparability', 'analytical_method'],
    'CMC Intelligence');
}

async function enrichWithCSR(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'CSR',
    ['csr_section', 'clinical_study', 'efficacy_result', 'safety_result'],
    'Clinical Study Report Intelligence');
}

async function enrichWithDevice(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'medical device',
    ['predicate_device', 'device_classification', 'substantial_equivalence', 'clinical_evaluation'],
    'Medical Device Intelligence');
}

async function enrichWithECTD(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'eCTD',
    ['ectd_structure', 'module_status', 'submission_package', 'granule_tracking'],
    'eCTD Structure Intelligence');
}

async function enrichWithCMS(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(
    projectId,
    'CMS coverage and reimbursement',
    [
      'cms_strategy',
      'payer_evidence',
      'reimbursement_strategy',
      'coding_coverage',
      'health_economics',
    ],
    'CMS & Reimbursement Intelligence',
  );
}

async function enrichWithDiagnostics(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(
    projectId,
    'diagnostics and IVD',
    [
      'diagnostic_validation',
      'ivd_performance',
      'analytical_validation',
      'clinical_performance',
      'companion_diagnostic',
    ],
    'Diagnostics & IVD Intelligence',
  );
}

async function enrichWithBiostatContext(projectId: string | number, submissionType?: string): Promise<string> {
  // Inject biostatistics knowledge + project-specific signals
  const parts: string[] = [];

  // Get project biostat signals
  try {
    const result = await pool.query(
      `SELECT signal_type, severity, description, status
       FROM biostat_signals
       WHERE project_id = $1 AND status != 'resolved'
       ORDER BY severity DESC, created_at DESC
       LIMIT $2`,
      [projectId, 8]
    );
    if (result.rows.length > 0) {
      const signalLines = result.rows.map((r: { severity?: string; signal_type?: string; description?: string }) =>
        `- **[${r.severity?.toUpperCase() || 'INFO'}]** ${r.signal_type}: ${r.description?.slice(0, 300) || 'No description'}`
      ).join('\n');
      parts.push(`**Active Biostat Signals (${result.rows.length}):**\n${signalLines}`);
    }
  } catch { /* table might not exist yet */ }

  // Get existing assumptions
  try {
    const assumptions = await pool.query(
      `SELECT finding_type, parameter_name, status, description
       FROM biostat_assumption_findings
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, 5]
    );
    if (assumptions.rows.length > 0) {
      const assLines = assumptions.rows.map((r: { parameter_name?: string; finding_type?: string; description?: string; status?: string }) =>
        `- ${r.parameter_name || r.finding_type}: ${r.description?.slice(0, 200) || ''} (${r.status})`
      ).join('\n');
      parts.push(`**Statistical Assumptions:**\n${assLines}`);
    }
  } catch { /* table might not exist */ }

  if (parts.length === 0) {
    return `\n\n## Biostatistics Context\nNo biostatistics signals or assumptions found for this project yet. You can compute sample size, generate SAP sections, run defensibility assessments, or design dose escalation protocols. Ask the user what statistical work they need.`;
  }

  return `\n\n## Biostatistics Context\n${parts.join('\n\n')}\n\nUse these signals and assumptions when discussing statistical design. Flag unresolved signals.`;
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
  } catch (e: unknown) { console.warn("[enrichment] Query failed:", e instanceof Error ? e.message : String(e));
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
  const sourcesFailed: string[] = [];
  let sourcesAttempted = 0;
  let triggerType: 'slash_command' | 'natural_language' | 'proactive' | 'none' = 'none';
  let detectedCommand: string | undefined;
  let rewrittenMessage: string | undefined;

  if (!projectId) return {
    block: '',
    sources: [],
    enrichmentMeta: {
      sourcesAttempted: 0,
      sourcesSucceeded: [],
      sourcesFailed: [],
      triggerType: 'none',
      hasProjectContext: false,
    },
  };

  // ── Always inject project intelligence summary when available ──
  const projectSummary = await enrichWithProjectSummary(projectId, organizationId).catch(() => '');
  if (projectSummary) {
    blocks.push(projectSummary);
    sources.push('project-profile');
  }

  // ── Always inject workflow status when submission type is known ──
  if (submissionType) {
    const workflowCtx = await buildWorkflowContext(projectId, submissionType, organizationId).catch(() => '');
    if (workflowCtx) {
      blocks.push(workflowCtx);
      sources.push('workflow');
    }
  }

  // ── Check for slash commands first ──
  const slash = detectSlashCommand(message);
  if (slash) {
    const enrichMap: Record<string, () => Promise<string>> = {
      risk: () => Promise.all([enrichWithForesight(projectId, organizationId), enrichWithCRLRTF(projectId, organizationId)]).then(r => r.join('')),
      readiness: () => enrichWithReadiness(projectId, organizationId),
      precedent: () => enrichWithPrecedents(projectId),
      draft: () =>
        Promise.resolve(detectDocumentType(slash.args || message))
          .then(doc => (doc ? buildDocumentGenerationContext(doc) : '\n\n## Draft Request Context\nNo specific document type detected. Ask which CTD section or artifact to draft, then produce submission-ready content.')),
      preflight: () =>
        Promise.all([
          enrichWithReadiness(projectId, organizationId),
          submissionType ? buildWorkflowContext(projectId, submissionType, organizationId) : Promise.resolve(''),
          enrichWithClaims(projectId),
          enrichWithCRLRTF(projectId, organizationId),
        ]).then(r => r.join('')),
      claims: () => enrichWithClaims(projectId),
      recommend: () => enrichWithRecommendations(projectId, organizationId),
      next: () => enrichWithRecommendations(projectId, organizationId),
      signals: () => enrichWithSignals(projectId, organizationId),
      export: () =>
        Promise.resolve(
          '\n\n## Conversation Export Intent\nUser requested conversation export. Provide a concise markdown-ready output and include any critical action receipts from this turn.'
        ),
      simulate: () => enrichWithCRLRTF(projectId, organizationId),
      assess: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
        enrichWithSignals(projectId, organizationId),
        enrichWithForesight(projectId, organizationId),
      ]).then(r => r.join('')),
      twin: () => Promise.all([
        enrichWithClaims(projectId),
        enrichWithCRLRTF(projectId, organizationId),
        enrichWithReadiness(projectId, organizationId),
      ]).then(r => r.join('')),
      consistency: () => enrichWithCrossModule(projectId, organizationId),
      deficiencies: () => enrichWithDeficiencies(submissionType),
      knowledge: () => enrichWithKnowledgeSearch(slash.args || message, projectId),
      decisions: () => enrichWithDecisions(projectId),
      sap: () => enrichWithBiostatContext(projectId, submissionType),
      power: () => enrichWithBiostatContext(projectId, submissionType),
      dose: () => enrichWithBiostatContext(projectId, submissionType),
      defensibility: () => enrichWithBiostatContext(projectId, submissionType),
      design: () => enrichWithBiostatContext(projectId, submissionType),
      safety: () => enrichWithSafety(projectId),
      cmc: () => enrichWithCMC(projectId),
      csr: () => enrichWithCSR(projectId),
      device: () => enrichWithDevice(projectId),
      diagnostics: () => enrichWithDiagnostics(projectId),
      cms: () => enrichWithCMS(projectId),
      ectd: () => enrichWithECTD(projectId),
      audit: () => Promise.all([enrichWithReadiness(projectId, organizationId), enrichWithClaims(projectId)]).then(r => r.join('')),
      amend: () => enrichWithProjectMemory(projectId, ['document_version', 'change_impact', 'amendment_tracking'], 'Amendment Context', 'Relevant version history and change impact data.', 5),
      review: () => Promise.all([enrichWithClaims(projectId), enrichWithCRLRTF(projectId, organizationId)]).then(r => r.join('')),
      memo: () => enrichWithForesight(projectId, organizationId),
      brief: () => enrichWithCRLRTF(projectId, organizationId),
      strategy: () => Promise.all([enrichWithPrecedents(projectId), enrichWithForesight(projectId, organizationId)]).then(r => r.join('')),
      freeze: () => enrichWithECTD(projectId),
      sign: () => enrichWithECTD(projectId),
      scan: () => Promise.all([enrichWithClaims(projectId), enrichWithCRLRTF(projectId, organizationId)]).then(r => r.join('')),
      checklist: () => enrichWithReadiness(projectId, organizationId),
      submit: () => Promise.all([enrichWithReadiness(projectId, organizationId), enrichWithECTD(projectId)]).then(r => r.join('')),
      narrative: () => enrichWithSafety(projectId),
      report: () => Promise.all([enrichWithReadiness(projectId, organizationId), enrichWithClaims(projectId)]).then(r => r.join('')),
      iss: () => enrichWithSafety(projectId),
      ise: () => enrichWithClaims(projectId),
      ib: () => Promise.all([enrichWithSafety(projectId), enrichWithClaims(projectId)]).then(r => r.join('')),
      smpc: () => enrichWithSafety(projectId),
      rmp: () => enrichWithSafety(projectId),
      uspi: () => enrichWithSafety(projectId),
      haq: () => Promise.all([enrichWithCRLRTF(projectId, organizationId), enrichWithPrecedents(projectId), enrichWithClaims(projectId)]).then(r => r.join('')),
      ask: () => enrichWithKnowledgeSearch(slash.args || message, projectId),
      workflow: () => submissionType ? buildWorkflowContext(projectId, submissionType, organizationId) : Promise.resolve(''),
      status: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        submissionType ? buildWorkflowContext(projectId, submissionType, organizationId) : Promise.resolve(''),
        enrichWithRecommendations(projectId, organizationId),
      ]).then(r => r.join('')),
      help: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
        enrichWithCMS(projectId),
        enrichWithDiagnostics(projectId),
      ]).then(r => r.join('')),
    };

    triggerType = 'slash_command';
    detectedCommand = slash.command;
    const enrichFn = enrichMap[slash.command];
    sourcesAttempted++;
    if (enrichFn) {
      const block = await enrichFn().catch(() => '');
      if (block) {
        blocks.push(block);
        sources.push(slash.command);
      } else {
        sourcesFailed.push(slash.command);
      }
    } else {
      // Command detected but no enrichment handler is wired for it yet.
      sourcesFailed.push(`slash_unhandled:${slash.command}`);
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
      decisions: 'Show the decision audit trail for this project. List recent decisions, current status, pending approvals, and execution receipts.',
      sap: slash.args ? `Generate a Statistical Analysis Plan for: ${slash.args}` : 'Generate a Statistical Analysis Plan. Ask the user for study parameters: indication, phase, primary endpoint, sample size target, alpha/power, and missing data strategy.',
      power: slash.args ? `Calculate sample size and power for: ${slash.args}` : 'Calculate sample size and statistical power. Ask the user for: endpoint type (continuous/binary/time-to-event), effect size, alpha, target power, allocation ratio, and dropout rate.',
      dose: slash.args ? `Design a dose escalation study for: ${slash.args}` : 'Design a dose escalation protocol. Ask for: starting dose, dose levels, target DLT rate, escalation method (3+3, BOIN, CRM, or Modified Fibonacci).',
      defensibility: 'Run a statistical defensibility assessment on this project. Score across 7 dimensions: evidence sufficiency, defensibility, reviewer sensitivity, claim risk, cross-section consistency, submission risk. Generate reviewer risk annotations.',
      design: slash.args ? `Design a clinical trial for: ${slash.args}` : 'Help design the optimal clinical trial. Ask about: indication, phase, primary endpoint, comparator, and whether they need adaptive, basket, umbrella, or platform design features.',
      safety: slash.args ? `Generate safety narrative for: ${slash.args}` : 'Help with safety narrative work. Ask what format they need: CSR safety section, Investigator\'s Brochure, CER, briefing book, or DSUR. Gather adverse event context.',
      cmc: slash.args ? `Evaluate CMC for: ${slash.args}` : 'Help with CMC/manufacturing work. Ask about: manufacturing change type, CQA impact, comparability assessment needs, or Module 3 documentation.',
      csr: slash.args ? `Analyze CSR for: ${slash.args}` : 'Help with Clinical Study Report work. Ask which section (efficacy, safety, disposition, demographics) or whether they need ICH E3 validation.',
      device: slash.args ? `Analyze device submission for: ${slash.args}` : 'Help with medical device submission. Ask about: submission type (510(k), PMA, De Novo, EU MDR), predicate device, and classification.',
      diagnostics: slash.args ? `Analyze diagnostics/IVD strategy for: ${slash.args}` : 'Help with diagnostics and IVD strategy. Ask about intended use, analytical validation, clinical performance, cutoff strategy, and companion diagnostic requirements.',
      cms: slash.args ? `Analyze CMS/reimbursement strategy for: ${slash.args}` : 'Help with CMS and payer strategy. Ask about coding pathway, coverage evidence, payment assumptions, and value dossier requirements.',
      ectd: 'Show the eCTD module structure and help place artifacts in the correct CTD location. Reference Module 1-5 structure.',
      audit: slash.args ? `Audit this document/section: ${slash.args}. Read as a hostile reviewer. Check completeness, consistency, defensibility, and compliance. Produce findings with severity and concrete fixes.` : 'Audit the current section or document. Check completeness, consistency, defensibility, and ICH compliance. Produce specific findings with severity ratings.',
      amend: slash.args ? `Amend/revise: ${slash.args}. Identify affected sections, rewrite only what changed, track changes with regulatory impact.` : 'Help amend the current document. Identify what changed, which sections are affected, rewrite with change tracking.',
      review: 'Conduct a regulatory review of the current section. Think like an FDA/EMA reviewer. Flag weaknesses, unsupported claims, and likely deficiency triggers.',
      memo: slash.args ? `Generate a risk memo for: ${slash.args}` : 'Generate a Regulatory Risk Assessment Memo with go/conditional-go/no-go recommendation.',
      brief: slash.args ? `Generate a reviewer brief for: ${slash.args}` : 'Generate a Reviewer Question Anticipation Brief with prepared answers for likely reviewer questions.',
      strategy: slash.args ? `Generate a strategy note for: ${slash.args}` : 'Generate a Regulatory Strategy Note with pathway analysis, argument hierarchy, and timeline.',
      freeze: 'Freeze the current document. Create an immutable snapshot with SHA256 hash. No further edits possible without creating a new version.',
      sign: 'Request electronic signature on the current document. Requires user PIN confirmation. Roles: AUTHOR, REVIEWER, or APPROVER.',
      scan: slash.args ? `Scan for deficiencies in: ${slash.args}` : 'Scan the current section/document for regulatory deficiencies. Check completeness, missing keywords, placeholder text, and compliance gaps.',
      checklist: 'Generate a regulatory compliance checklist for the current document. Auto-populate based on section content and citation tokens.',
      submit: 'Submit the current document to the regulatory workflow. Check readiness first, then update status to SUBMITTED.',
      narrative: slash.args ? `Generate a safety narrative for: ${slash.args}` : 'Generate a safety narrative. Ask what format: aggregate TEAE, SAE case narrative, benefit-risk, DSUR, or cross-study safety.',
      report: slash.args ? `Generate a regulatory report on: ${slash.args}` : 'Generate a full regulatory report. Ask for domain: submission readiness, clinical study, CMC, pharmacovigilance, compliance, strategic intelligence.',
      iss: 'Generate an Integrated Summary of Safety (ISS) — pooled safety analysis across all studies for this product.',
      ise: 'Generate an Integrated Summary of Efficacy (ISE) — pooled efficacy analysis across pivotal studies.',
      ib: 'Generate or update the Investigator\'s Brochure (IB) with all available nonclinical and clinical data.',
      smpc: 'Generate a Summary of Product Characteristics (SmPC) per EMA QRD template.',
      rmp: 'Generate or update the Risk Management Plan (RMP) per EMA GVP Module V.',
      uspi: 'Generate US Prescribing Information (USPI) per FDA Physician Labeling Rule.',
      workflow: 'Show the full submission workflow status. List all phases, steps completed vs remaining, critical blockers, and the next step the user should take. Be directive.',
      status: 'Give a quick project status briefing: readiness score, workflow progress, top 3 blockers, and the single most important next action. Keep it concise — 5-7 lines max.',
      help: 'The user is asking what you can do. Look at their project state and suggest 3-4 specific things you can do RIGHT NOW. Show, don\'t tell. Demonstrate by referencing their actual readiness score, gaps, and recommendations.',
      haq: slash.args
        ? `Draft a health authority question response for: ${slash.args}. Include cited evidence, known/unknown boundaries, and next required action.`
        : 'Draft a health authority question response. Ask for agency, exact question text, impacted section, and supporting evidence, then provide a defensible response structure.',
      ask: slash.args
        ? `Search the project data room and knowledge memory for: ${slash.args}. Return relevant findings with confidence and source category.`
        : 'Search the project data room and knowledge memory for the most relevant recent items. Summarize with confidence and source category.',
      export: 'Export this conversation.',
    };

    rewrittenMessage =
      commandDescriptions[slash.command] ||
      (slash.args ? `${slash.command.slice(1)} ${slash.args}` : message);
  }

  // ── Natural language trigger detection (runs if no slash command) ──
  if (!slash) {
    const triggers: Array<{ test: RegExp[]; fn: () => Promise<string>; name: string }> = [
      { test: FORESIGHT_TRIGGERS, fn: () => enrichWithForesight(projectId, organizationId), name: 'foresight' },
      { test: PRECEDENT_TRIGGERS, fn: () => enrichWithPrecedents(projectId), name: 'precedent' },
      { test: CRL_RTF_TRIGGERS, fn: () => enrichWithCRLRTF(projectId, organizationId), name: 'deficiency' },
      { test: READINESS_TRIGGERS, fn: () => enrichWithReadiness(projectId, organizationId), name: 'readiness' },
      { test: RECOMMENDATION_TRIGGERS, fn: () => enrichWithRecommendations(projectId, organizationId), name: 'recommendations' },
      { test: CLAIMS_TRIGGERS, fn: () => enrichWithClaims(projectId), name: 'claims' },
      { test: SIMULATION_TRIGGERS, fn: () => enrichWithCRLRTF(projectId, organizationId), name: 'simulation' },
      { test: BIOSTAT_TRIGGERS, fn: () => enrichWithBiostatContext(projectId, submissionType), name: 'biostatistics' },
      { test: SAFETY_TRIGGERS, fn: () => enrichWithSafety(projectId), name: 'safety' },
      { test: CMC_TRIGGERS, fn: () => enrichWithCMC(projectId), name: 'cmc' },
      { test: CSR_TRIGGERS, fn: () => enrichWithCSR(projectId), name: 'csr' },
      { test: DEVICE_TRIGGERS, fn: () => enrichWithDevice(projectId), name: 'device' },
      { test: DIAGNOSTICS_TRIGGERS, fn: () => enrichWithDiagnostics(projectId), name: 'diagnostics' },
      { test: CMS_TRIGGERS, fn: () => enrichWithCMS(projectId), name: 'cms' },
      { test: ECTD_TRIGGERS, fn: () => enrichWithECTD(projectId), name: 'ectd' },
      { test: HAQ_TRIGGERS, fn: () => Promise.all([enrichWithCRLRTF(projectId, organizationId), enrichWithPrecedents(projectId)]).then(r => r.join('')), name: 'haq' },
    ];

    const matchedFns = triggers.filter(t => matchesTriggers(message, t.test));

    if (matchedFns.length > 0) {
      triggerType = 'natural_language';
      await Promise.allSettled(
        matchedFns.map(async t => {
          sourcesAttempted++;
          try {
            const block = await t.fn();
            if (block) {
              blocks.push(block);
              sources.push(t.name);
            } else {
              sourcesFailed.push(t.name);
            }
          } catch { /* non-blocking enrichment — failure tracked in sourcesFailed */
            sourcesFailed.push(t.name);
          }
        })
      );
    }

    // ── Proactive enrichment for greetings/help — inject status so AnA can lead ──
    const isGreeting = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|what.?s up|how are you|help|what can you do)/i.test(message.trim());
    if (isGreeting && sources.length === 0) {
      triggerType = 'proactive';
      sourcesAttempted += 2;
      // Inject readiness + top recommendation so AnA can give a proactive status update
      const [readinessBlock, recsBlock] = await Promise.allSettled([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
      ]);
      if (readinessBlock.status === 'fulfilled' && readinessBlock.value) {
        blocks.push(readinessBlock.value);
        sources.push('proactive-readiness');
      } else {
        sourcesFailed.push('proactive-readiness');
      }
      if (recsBlock.status === 'fulfilled' && recsBlock.value) {
        blocks.push(recsBlock.value);
        sources.push('proactive-recommendations');
      } else {
        sourcesFailed.push('proactive-recommendations');
      }
    }
  }

  // ── Document type detection — auto-detect what document the user wants ──
  const detectedDoc = detectDocumentType(message);
  if (detectedDoc && !slash) {
    // Only inject document generation context if the user seems to be requesting a draft
    const isDraftRequest = /\b(?:draft|write|generate|create|produce|build|prepare|compose)\b/i.test(message);
    if (isDraftRequest) {
      blocks.push(buildDocumentGenerationContext(detectedDoc));
      sources.push(`doc-${detectedDoc.type}`);
    }
  }

  return {
    block: blocks.join('\n'),
    sources,
    rewrittenMessage,
    enrichmentMeta: {
      sourcesAttempted,
      sourcesSucceeded: [...sources],
      sourcesFailed,
      triggerType,
      detectedCommand,
      hasProjectContext: true,
    },
  };
}
