/**
 * AnA Scoped Rule Loader — Smart Context Loading
 *
 * Only matching rules load into the prompt — everything else stays dormant.
 * User drafting CSR → only ana-csr-drafting loads. User doing FDA compliance →
 * only ana-fda-compliance loads. Context stays lean.
 *
 * Seed data is loaded from a separate JSON file to keep this service lean.
 *
 * @module server/services/ana-scoped-rule-loader
 * Concept2Cure (C2C) / AnA 1.0 RI — NEVER "ClinicalSageAI"
 */

import { db } from '../db';
import { anaScopedRules } from 'shared/schema';
import { eq, desc } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ActionContext {
  documentType?: string;   // csr, protocol, ib, ind_module, nda_section, 510k, cmc, sap, loq_response
  capability?: string;     // compliance_scan, foresight, rim, cortex, predicate_comparison, biostatistics
  regulatoryBody?: string; // FDA, EMA, PMDA, Health_Canada, TGA, NMPA
  workflowStage?: string;  // drafting, review, compliance, submission, amendment
  sectionCode?: string;    // 2.5, 3.2.S, 2.7.4, etc.
  slashCommand?: string;   // /compliance-scan, /draft-section, etc.
}

interface ScoredRule {
  rule: typeof anaScopedRules.$inferSelect;
  score: number;
}

// ─── Scope Matching ─────────────────────────────────────────────────────────

function arrayOverlaps(scope: string[] | null | undefined, value: string | undefined): boolean {
  if (!scope || !scope.length || !value) return false;
  return scope.some(s => s.toLowerCase() === value.toLowerCase());
}

function scoreRule(rule: typeof anaScopedRules.$inferSelect, context: ActionContext): number {
  let score = 0;
  if (arrayOverlaps(rule.scopeDocumentTypes as string[], context.documentType)) score++;
  if (arrayOverlaps(rule.scopeCapabilities as string[], context.capability)) score++;
  if (arrayOverlaps(rule.scopeRegulatoryBodies as string[], context.regulatoryBody)) score++;
  if (arrayOverlaps(rule.scopeWorkflowStages as string[], context.workflowStage)) score++;
  if (arrayOverlaps(rule.scopeSectionCodes as string[], context.sectionCode)) score++;
  if (arrayOverlaps(rule.scopeSlashCommands as string[], context.slashCommand)) score++;
  return score;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load all scoped rules that match the current action context.
 * Returns matched rules sorted by specificity (most matching scopes first),
 * then by priority (higher first).
 */
export async function loadMatchingRules(context: ActionContext) {
  const allRules = await db
    .select()
    .from(anaScopedRules)
    .where(eq(anaScopedRules.isActive, true))
    .orderBy(desc(anaScopedRules.priority));

  const scored: ScoredRule[] = [];
  for (const rule of allRules) {
    const score = scoreRule(rule, context);
    if (score > 0) scored.push({ rule, score });
  }

  // Sort by specificity (more matching scopes = more specific), then priority
  scored.sort((a, b) => b.score - a.score || (b.rule.priority - a.rule.priority));
  return scored.map(s => s.rule);
}

/**
 * Build a combined scoped rule context block for injection into the AI prompt.
 * Caps at top 3 rules (~150 lines max) to keep context lean.
 */
export async function buildScopedRuleContext(context: ActionContext): Promise<string | null> {
  const rules = await loadMatchingRules(context);
  if (!rules.length) return null;

  const topRules = rules.slice(0, 3);
  const parts: string[] = [];
  parts.push('## AnA Scoped Rules (context-matched)');

  for (const rule of topRules) {
    parts.push(`\n### ${rule.name}`);
    parts.push(rule.ruleContent);
  }

  return parts.join('\n');
}

/**
 * Seed the 11 core scoped rules into the database.
 * Uses ON CONFLICT DO NOTHING so it's idempotent.
 * Rule content is kept concise (~30-40 lines each).
 */
export async function seedScopedRules(): Promise<{ seeded: number }> {
  const rules = getSeedRules();
  let seeded = 0;

  for (const rule of rules) {
    try {
      await db.insert(anaScopedRules).values(rule).onConflictDoNothing();
      seeded++;
    } catch {
      // Already exists — skip
    }
  }

  return { seeded };
}

// ─── Seed Data (inline but compressed — each rule ~30 lines) ────────────────

function getSeedRules() {
  return [
    {
      ruleKey: 'ana-csr-drafting',
      name: 'CSR Drafting Rules',
      description: 'ICH E3-compliant CSR drafting',
      scopeDocumentTypes: ['csr'],
      scopeWorkflowStages: ['drafting'],
      priority: 100,
      ruleContent: `Follow ICH E3 structure exactly. Section numbering per company convention.
Synopsis first: objective, design, endpoints, key results, conclusions.
Safety before efficacy in integrated summaries.
All tables: title, column headers, footnotes, data source.
Efficacy tables: ITT primary, PP sensitivity. Safety tables: SOC→PT, severity, relatedness.
Use MedDRA v27.0+ coding. Never mix versions within a CSR.
FDA: Separate subgroup analysis by age/sex/race per FDARA §907.
EMA: Include Forest plots for subgroup analyses in Module 2.7.3.
PMDA: Japanese subpopulation analysis even in global studies.
Never state "no drug-related deaths" — say "no deaths assessed as related by the investigator."
SAE narratives: Timeline → Event → Management → Outcome → Causality.
Always include screen failure disposition — omission triggers reviewer queries.
Use "findings-first" structure: start with result, then methodology.`,
    },
    {
      ruleKey: 'ana-fda-compliance',
      name: 'FDA Compliance Scan Rules',
      description: 'FDA regulatory compliance checks',
      scopeRegulatoryBodies: ['FDA'],
      scopeCapabilities: ['compliance_scan'],
      priority: 100,
      ruleContent: `21 CFR 312.23: IND content — verify all 12 required sections present.
21 CFR 314.50: NDA content — verify modules 1-5 complete.
SAP must pre-specify primary endpoint analysis method.
Informed consent must reference specific IND number.
CRL triggers: missing CYP450 drug interaction studies (35%), inadequate QTc (22%), inconsistent AE coding between CSR and ISS.
Missing REMS proposal when NME has abuse potential or serious risks.
Cite specific CFR sections, not just "FDA regulations."
Reference guidance docs by full title and date.
Use "the applicant" not "we" or "the company."
Label claims require substantial evidence (2 adequate studies or 1 + confirmatory).
Do NOT say "safe and effective" — FDA decides that. Say "favorable benefit-risk profile."
Do NOT cite FDA internal review docs unless publicly available on Drugs@FDA.
NEVER reference advisory committee votes as regulatory precedent — non-binding.`,
    },
    {
      ruleKey: 'ana-ema-loq-response',
      name: 'EMA LoQ Response Rules',
      description: 'EMA Day 120 List of Questions responses',
      scopeRegulatoryBodies: ['EMA'],
      scopeDocumentTypes: ['loq_response'],
      scopeWorkflowStages: ['drafting'],
      priority: 100,
      ruleContent: `Per-question structure: 1) Question text verbatim from CHMP, 2) Applicant's position (2-3 sentences), 3) Detailed response with data, 4) Proposed action (updated SmPC, new analysis), 5) Cross-ref to updated CTD sections.
Tone: Formal but collaborative. Acknowledge concern before addressing: "The applicant acknowledges the Committee's concern regarding..."
Never dismiss a question. If already addressed: "The applicant draws attention to [Section X] and provides additional clarification below."
Day 120 LoQ starts clock stop. Target response: 3-6 months standard, 1-2 months for clarifications.
Responses restart clock at Day 121. Flag early if new data needed.
Population PK expected for biologics. Extrapolation adult→pediatric requires PIP-aligned justification.
ERA required (FDA doesn't require this). SmPC §4.1 wording must be CHMP-agreed. RMP updates expected.
Include summary response table (Q#, Topic, Key Response, Action, Updated Section) as cover document.
Bundle related questions under themed headings for coherence.`,
    },
    {
      ruleKey: 'ana-ind-clinical-overview',
      name: 'IND Module 2.5 Clinical Overview',
      description: 'IND Module 2.5 drafting rules',
      scopeDocumentTypes: ['ind_module'],
      scopeSectionCodes: ['2.5'],
      priority: 110,
      ruleContent: `Module 2.5 = high-level clinical overview for reviewer (NOT a repeat of Module 5).
Target: 30-60 pages. Concise. Cross-reference Module 5 for full data.
Written for medical reviewer who reads this BEFORE full reports.
Required sections: 1) Development rationale, 2) Biopharmaceutics overview (BA/BE, food effect), 3) Clinical pharmacology (PK, PD, DDI, special pops), 4) Efficacy overview (pivotal + supportive), 5) Safety overview (AE, labs, vitals, ECG), 6) Benefit-risk conclusions.
Every claim MUST reference specific study Protocol ID in Module 5.
Tabular summaries reference Module 2.7. Nonclinical refs → Module 2.4. CMC refs → Module 3.
Include 1-page executive summary at front — improves reviewer satisfaction by ~20%.
Use FDA Benefit-Risk Framework table format in benefit-risk section.`,
    },
    {
      ruleKey: 'ana-510k-predicate',
      name: '510(k) Predicate Comparison Rules',
      description: '510(k) substantial equivalence analysis',
      scopeDocumentTypes: ['510k'],
      scopeCapabilities: ['predicate_comparison'],
      priority: 100,
      ruleContent: `Compare: intended use, technological characteristics, performance data.
Same intended use = REQUIRED. Different intended use = De Novo or PMA.
Same technology = direct SE. Different technology = must show no new safety/efficacy questions.
Primary predicate: closest match in use + technology + indication.
Split predicates allowed but increase FDA scrutiny — document rationale clearly.
Check FDA 510(k) database for recall history on proposed predicates.
Comparison table: Row 1 (device name, mfg, 510(k)#, clearance date), Rows 2-N (feature-by-feature), Final row (SE conclusion per feature).
eSTAR: Follow template exactly. Performance testing: cite consensus standards (ASTM, ISO, IEC) with number + version.
Software: IEC 62304 classification, cybersecurity per FDA guidance.
Never say "equivalent" without "substantially equivalent" — legal distinction.
If predicate >10 years old, prepare for FDA to question relevance.
If predicate recalled for compared feature, address proactively.`,
    },
    {
      ruleKey: 'ana-protocol-amendment',
      name: 'Protocol Amendment Rules',
      description: 'Protocol amendment classification and documentation',
      scopeDocumentTypes: ['protocol'],
      scopeWorkflowStages: ['amendment'],
      priority: 100,
      ruleContent: `Substantial amendment (requires ethics/IRB re-approval + regulatory notification): changes to primary endpoint, sample size, eligibility, design, dosing, IMP, risk-benefit.
Non-substantial amendment (notification only): admin corrections, clarifications, logistics.
Required docs: 1) Amendment summary page (number, date, sections, rationale), 2) Track-changes version, 3) Clean version with new version number, 4) Updated ICF if patient-facing, 5) Updated IB reference if safety-driven.
FDA: File IND amendment within 30 days of implementation.
EMA: Substantial modification to Ethics + NCA BEFORE implementation.
PMDA: Clinical trial plan change notification. Health Canada: CTA amendment.
NEVER implement substantial amendment before ethics approval — regulatory violation.
If amendment changes primary endpoint, consider whether this is a "new study" requiring new IND/CTA.
Mid-study sample size re-estimation must follow pre-specified adaptive design rules.
Document DSMB/DMC recommendation if safety-driven.`,
    },
    {
      ruleKey: 'ana-cmc-drug-substance',
      name: 'CMC Drug Substance Rules',
      description: 'CMC Module 3.2.S drug substance documentation',
      scopeDocumentTypes: ['cmc'],
      scopeSectionCodes: ['3.2.S'],
      priority: 110,
      ruleContent: `Structure per ICH M4Q: 3.2.S.1 (General info), 3.2.S.2 (Manufacture), 3.2.S.3 (Characterization), 3.2.S.4 (Control), 3.2.S.5 (Reference standards), 3.2.S.6 (Container closure), 3.2.S.7 (Stability).
Manufacturing process: flow diagram + narrative. Identify critical process parameters and in-process controls.
Impurity profiling per ICH Q3A/Q3B: identify, qualify, specify. Report all impurities >0.10%.
Stability: ICH Q1A conditions (25°C/60%RH, 40°C/75%RH). Include photostability (Q1B).
Analytical methods: validated per ICH Q2(R1). Include specificity, linearity, accuracy, precision, robustness.
Specifications must be justified with batch data (≥3 batches, ≥pilot scale).
Polymorphism: characterize if relevant to bioavailability.
Genotoxic impurities per ICH M7: control to TTC limits.`,
    },
    {
      ruleKey: 'ana-biostat-sap',
      name: 'Biostatistics SAP Rules',
      description: 'Statistical analysis plan conventions',
      scopeDocumentTypes: ['sap'],
      scopeCapabilities: ['biostatistics'],
      priority: 100,
      ruleContent: `Define endpoints clearly: primary (1-2 max), secondary (hierarchically ordered), exploratory.
Analysis populations: ITT/FAS (all randomized), PP (per-protocol completers), Safety (all treated).
Primary analysis: pre-specified method, significance level, hypothesis (superiority/non-inferiority/equivalence).
Multiplicity: Bonferroni, Hochberg, or gatekeeping per ICH E9.
Missing data: describe primary approach (MMRM, MI, LOCF justification) and sensitivity analyses per ICH E9(R1) estimand framework.
Subgroup analyses: pre-specify subgroups (age, sex, race, region, baseline severity). Forest plots.
Interim analyses: specify alpha spending function (O'Brien-Fleming, Lan-DeMets).
Safety analysis: exposure-adjusted incidence rates, Kaplan-Meier for time-to-event safety endpoints.
Define clinically meaningful thresholds for each endpoint.`,
    },
    {
      ruleKey: 'ana-foresight-prediction',
      name: 'Foresight Predictive Analytics Rules',
      description: 'Risk prediction and timeline forecasting',
      scopeCapabilities: ['foresight'],
      priority: 90,
      ruleContent: `Risk prediction: assess across 5 dimensions — regulatory, clinical, CMC, timeline, organizational.
Timeline forecasting: use historical submission-to-approval data by agency + product type.
Readiness scoring: 0-100 per module, weighted by criticality. Overall readiness = weighted average.
Confidence intervals: always provide range (optimistic/expected/pessimistic) for timeline predictions.
Data requirements: minimum 3 comparable historical submissions for meaningful prediction.
Flag critical path items: identify the longest sequential dependency chain.
Risk mitigation: for each identified risk, suggest specific preventive action.
Update predictions after each milestone completion — Bayesian updating of priors.
Never present predictions as certainties — always qualify with confidence level.`,
    },
    {
      ruleKey: 'ana-rim-intelligence',
      name: 'RIM Intelligence Layer Rules',
      description: 'Regulatory Intelligence Model usage',
      scopeCapabilities: ['rim'],
      priority: 90,
      ruleContent: `Judgment framework: 6 models — Evidence Sufficiency (25%), Defensibility (20%), Reviewer Sensitivity (15%), Claim Risk (15%), Cross-Section Consistency (10%), Submission Risk (15%).
Pattern registry: 16 seed patterns across deficiency, reviewer_trigger, rejection, strong/weak language, data_gap, consistency_issue, formatting, risk_signal.
Signal capture: two layers — Layer 1 (working memory, volatile, 500/project max), Layer 2 (persisted to projectMemoryEntries).
Every signal has provenance: judgmentFrameworkVersion, patternRegistryVersion, runId.
Trend detection requires minimum 10 signals. Only compare same-version, same-type signals.
Interceptors are non-blocking — NEVER slow down the primary pipeline.
Evidence confidence: chain building with source tracking and quality scoring.
Recommendations: next-best-action based on current readiness + risk profile.`,
    },
    {
      ruleKey: 'ana-cortex-knowledge',
      name: 'CORTEX Knowledge Management Rules',
      description: 'Knowledge atom creation and retrieval',
      scopeCapabilities: ['cortex'],
      priority: 90,
      ruleContent: `Knowledge atoms: smallest unit of validated knowledge. Each has: title, content, confidence, importance, source, category.
Thread management: conversations organized by topic. Cross-thread knowledge linking.
Semantic search: use embeddings for retrieval. Rank by relevance + recency + importance.
Cross-document linking: identify related atoms across different documents. Maintain consistency.
Version tracking: atoms can be superseded. Maintain lineage (original → current).
Deduplication: check by title + content prefix before creating new atoms.
Structured forgetting: old entries dropped unless critical/verified. Respect maxChars budgets.
Categories: regulatory_guidance, clinical_data, cmc_manufacturing, safety_signal, submission_strategy, project_decision, lessons_learned.
Quality scoring: auto-assess atom quality based on source reliability, specificity, actionability.`,
    },
  ];
}
