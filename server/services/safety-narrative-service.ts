/**
 * Safety Narrative Generation Service
 *
 * Generates regulatory-grade safety narratives for CSRs, IBs, CERs,
 * briefing packages, and safety update reports.
 *
 * Capabilities:
 * - Aggregate safety summary generation (TEAE tables -> narrative)
 * - Individual SAE narrative generation
 * - Benefit-risk narrative support
 * - Safety signal summary generation
 * - Cross-study safety comparison narratives
 */

import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { ai } from '../lib/unified-ai-client';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AggregateSafetyRequest {
  studyId: string;
  studyTitle: string;
  indication: string;
  treatmentArms: Array<{
    armName: string;
    armType: 'experimental' | 'active_comparator' | 'placebo';
    nSubjects: number;
    exposureDuration: string;
  }>;
  teaeData: Array<{
    preferredTerm: string;
    systemOrganClass: string;
    armCounts: Record<string, { n: number; percent: number }>;
    seriousness: 'non_serious' | 'serious';
    severity?: string;
    relatedness?: string;
  }>;
  saeData: Array<{
    preferredTerm: string;
    systemOrganClass: string;
    armCounts: Record<string, number>;
    outcomes: string[];
  }>;
  deaths: Array<{
    armName: string;
    count: number;
    causes: string[];
  }>;
  discontinuationsDueToAE: Record<string, { n: number; percent: number; topReasons: string[] }>;
  labFindings?: Array<{
    parameter: string;
    armShiftData: Record<string, { normalToHigh: number; normalToLow: number }>;
  }>;
  narrativeType: 'csr' | 'ib' | 'cer' | 'briefing_book' | 'dsur';
}

export interface SafetyNarrative {
  fullNarrative: string;
  sections: Array<{
    title: string;
    content: string;
    sectionCode: string;
  }>;
  keyFindings: string[];
  regulatoryConcerns: string[];
  citedTables: string[];
  wordCount: number;
  /**
   * True when the AI-generated narrative was withheld because it contained
   * numbers/identifiers not grounded in the source safety data (the
   * hallucination guard tripped), the AI response was empty/unparseable, or
   * the gateway call failed. When true, `fullNarrative`/`sections` hold a
   * deterministic, source-grounded summary in place of AI prose — never
   * fabricated filing text.
   */
  aiNarrativeWithheld?: boolean;
}

export interface SAECaseData {
  caseId: string;
  // null = not reported. Never coerce a missing age to 0 — a narrative that
  // states "a 0-year-old subject" is a fabricated clinical fact.
  patientAge: number | null;
  patientSex: string;
  relevantMedicalHistory: string[];
  treatmentArm: string;
  drugName: string;
  dose: string;
  eventTerm: string;
  eventDescription: string;
  onsetDate: string;
  // null = not reported. Never coerce a missing onset day to 0 ("Study Day 0").
  onsetStudyDay: number | null;
  seriousnessCriteria: string[];
  severity: string;
  actionTaken: string;
  outcome: string;
  causalityAssessment: string;
  rechallenge?: string;
  dechallenge?: string;
  concomitantMedications?: string[];
  relevantLabValues?: Array<{ parameter: string; value: string; date: string }>;
}

export interface BenefitRiskRequest {
  indication: string;
  treatmentName: string;
  efficacySummary: {
    primaryEndpointResult: string;
    clinicalBenefit: string;
    effectSize: string;
    statisticalSignificance: string;
  };
  safetySummary: {
    overallSafetyProfile: string;
    mostCommonAEs: string[];
    seriousRisks: string[];
    manageableRisks: string[];
    unmetNeed: string;
  };
  context: {
    availableTherapies: string[];
    diseaseSeverity: string;
    patientPopulation: string;
  };
}

export interface BenefitRiskNarrative {
  narrative: string;
  benefitDimensions: Array<{ dimension: string; assessment: string }>;
  riskDimensions: Array<{ dimension: string; assessment: string }>;
  overallConclusion: string;
  uncertainties: string[];
  /** See {@link SafetyNarrative.aiNarrativeWithheld} — same semantics. */
  aiNarrativeWithheld?: boolean;
}

export interface SignalData {
  signalName: string;
  preferredTerm: string;
  source: string;
  strengthOfEvidence: string;
  clinicalSignificance: string;
  currentLabelStatus: string;
  recommendedAction: string;
}

export interface CrossStudySafetyInput {
  studyId: string;
  studyPhase: string;
  population: string;
  nSubjects: number;
  topAEs: Array<{ term: string; incidence: number }>;
  saeSummary: string;
  dose: string;
}

// ---------------------------------------------------------------------------
// Grounding guard
// ---------------------------------------------------------------------------
//
// Every ai.chat() call below produces narrative prose that ships VERBATIM
// into a regulatory filing (CSR/IB/CER/DSUR safety sections, SAE narratives,
// benefit-risk assessments). There is no human review gate between the model
// and the filing, so an invented incidence rate, subject count, or SAE count
// would ship as if it were real data.
//
// This guard mirrors the pattern in
// server/services/cmc/module3-narrative-builder.ts: build a "grounding set"
// of every 4+ digit number and identifier-shaped token present in the INPUT
// safety data, then confirm the AI's OUTPUT introduces no numeric/identifier
// token outside that set. A single ungrounded token fails the narrative
// closed — the caller gets a deterministic, source-grounded summary (built
// straight from the same input, so it cannot itself be hallucinated) plus an
// explicit "withheld" marker, never the AI prose.
//
// The regex classes are intentionally narrow (4+ digit runs; identifier-like
// alphanumeric tokens) so the guard does not false-positive on ordinary
// prose, small percentages, ages, or study-day counts — the same tradeoff
// module3-narrative-builder makes.

/** Matches 4+ digit runs (subject counts, years, large incidence counts, etc.). */
const FOUR_PLUS_DIGIT_RE = /\b\d{4,}\b/g;

/**
 * Matches identifier-like tokens — anything containing 4+ consecutive digits
 * OR an alphabetic prefix with at least 2 embedded digits (e.g. "BX204-301",
 * "ICSR-8841", "Site9001"). Fabricated case/study identifiers are the other
 * common vehicle for hallucinated specifics beyond raw numbers.
 */
const IDENTIFIER_RE = /[A-Za-z][A-Za-z0-9._-]*[0-9][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*/g;

/**
 * Recursively walk a value and accumulate every 4+ digit numeric token and
 * identifier-like token found in its string/number representations. Object
 * keys are NOT included — only values, matching module3-narrative-builder.
 */
function collectGroundingTokens(value: unknown, acc: Set<string>, depth = 0): void {
  if (depth > 8) return; // belt-and-suspenders against pathological nesting
  if (value === null || value === undefined) return;

  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      const s = String(value);
      if (/\d{4,}/.test(s)) acc.add(s);
    }
    return;
  }

  if (typeof value === 'string') {
    const digitMatches = value.match(FOUR_PLUS_DIGIT_RE);
    if (digitMatches) for (const m of digitMatches) acc.add(m);
    const idMatches = value.match(IDENTIFIER_RE);
    if (idMatches) for (const m of idMatches) acc.add(m);
    return;
  }

  if (typeof value === 'boolean') return;

  if (Array.isArray(value)) {
    for (const item of value) collectGroundingTokens(item, acc, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectGroundingTokens(v, acc, depth + 1);
    }
  }
}

/** Build the set of grounding tokens allowed to appear in AI output, from one or more input sources. */
function buildGroundingSet(...sources: unknown[]): Set<string> {
  const acc = new Set<string>();
  for (const s of sources) collectGroundingTokens(s, acc, 0);
  return acc;
}

/**
 * Scan `text` for 4+ digit numeric tokens AND identifier-shaped tokens that
 * are NOT present in `allowed`. Both regexes are applied symmetrically —
 * without this, an identifier-shaped fabrication without a 4+ digit run
 * (e.g. "BATCH-AB12CD") would bypass the guard. Returns the unknown tokens
 * (empty array = guard passes).
 */
function findUngroundedTokens(text: string, allowed: Set<string>): string[] {
  const unknown = new Set<string>();
  const numericMatches = text.match(FOUR_PLUS_DIGIT_RE) || [];
  for (const m of numericMatches) {
    if (!allowed.has(m)) unknown.add(m);
  }
  const idMatches = text.match(IDENTIFIER_RE) || [];
  for (const m of idMatches) {
    if (!allowed.has(m)) unknown.add(m);
  }
  return Array.from(unknown);
}

/** Marker prefixed onto every deterministic fallback so the withheld state is never silent. */
const AI_NARRATIVE_WITHHELD_MARKER =
  'AI narrative withheld: contained figures not grounded in the source data; ' +
  'deterministic summary shown, requires manual authoring.';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Table numbering convention maps by narrative type */
const TABLE_NUMBER_PREFIXES: Record<string, Record<string, string>> = {
  csr: {
    demographics: 'Table 14.1.1',
    teaeSummary: 'Table 14.3.1',
    teaeBySOC: 'Table 14.3.2',
    teaeByPT: 'Table 14.3.3',
    sae: 'Table 14.3.4',
    deaths: 'Table 14.3.5',
    discontinuation: 'Table 14.3.6',
    labShift: 'Table 14.3.7',
  },
  ib: {
    demographics: 'Table S-1',
    teaeSummary: 'Table S-2',
    teaeBySOC: 'Table S-3',
    teaeByPT: 'Table S-4',
    sae: 'Table S-5',
    deaths: 'Table S-6',
    discontinuation: 'Table S-7',
    labShift: 'Table S-8',
  },
  cer: {
    demographics: 'Table 1',
    teaeSummary: 'Table 2',
    teaeBySOC: 'Table 3',
    teaeByPT: 'Table 4',
    sae: 'Table 5',
    deaths: 'Table 6',
    discontinuation: 'Table 7',
    labShift: 'Table 8',
  },
  briefing_book: {
    demographics: 'Table 1',
    teaeSummary: 'Table 2',
    teaeBySOC: 'Table 3',
    teaeByPT: 'Table 4',
    sae: 'Table 5',
    deaths: 'Table 6',
    discontinuation: 'Table 7',
    labShift: 'Table 8',
  },
  dsur: {
    demographics: 'Table 1',
    teaeSummary: 'Table 2',
    teaeBySOC: 'Table 3',
    teaeByPT: 'Table 4',
    sae: 'Table 5',
    deaths: 'Table 6',
    discontinuation: 'Table 7',
    labShift: 'Table 8',
  },
};

/** ICH E3 Section 12 sub-section codes */
const SECTION_CODES: Record<string, { code: string; title: string }> = {
  overview: { code: '12.0', title: 'Safety Overview' },
  exposure: { code: '12.1', title: 'Extent of Exposure' },
  teae: { code: '12.2', title: 'Treatment-Emergent Adverse Events' },
  sae: { code: '12.3', title: 'Serious Adverse Events' },
  deaths: { code: '12.4', title: 'Deaths' },
  discontinuations: { code: '12.5', title: 'Discontinuations Due to Adverse Events' },
  labs: { code: '12.6', title: 'Clinical Laboratory Evaluations' },
  conclusion: { code: '12.7', title: 'Safety Conclusions' },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class SafetyNarrativeService {

  // -------------------------------------------------------------------------
  // 1. Aggregate Safety Narrative
  // -------------------------------------------------------------------------

  async generateAggregateSafetyNarrative(
    request: AggregateSafetyRequest,
  ): Promise<SafetyNarrative> {
    const tablePrefix = TABLE_NUMBER_PREFIXES[request.narrativeType] ?? TABLE_NUMBER_PREFIXES.csr;
    const citedTables: string[] = [];

    // Build data summaries that will be injected into the prompt
    const armSummary = request.treatmentArms
      .map(
        (a) =>
          `${a.armName} (${a.armType}, N=${a.nSubjects}, median exposure ${a.exposureDuration})`,
      )
      .join('; ');

    const teaeSummaryLines = this.buildTEAESummary(request);
    const saeSummaryLines = this.buildSAESummary(request);
    const deathSummaryLines = this.buildDeathSummary(request);
    const discontSummaryLines = this.buildDiscontinuationSummary(request);
    const labSummaryLines = request.labFindings
      ? this.buildLabSummary(request)
      : 'No laboratory shift data provided.';

    // Track tables referenced
    citedTables.push(tablePrefix.teaeSummary, tablePrefix.teaeBySOC, tablePrefix.teaeByPT);
    if (request.saeData.length > 0) citedTables.push(tablePrefix.sae);
    if (request.deaths.length > 0) citedTables.push(tablePrefix.deaths);
    citedTables.push(tablePrefix.discontinuation);
    if (request.labFindings && request.labFindings.length > 0) citedTables.push(tablePrefix.labShift);

    const systemPrompt = `You are AnA, a senior regulatory intelligence operator writing safety narratives for FDA/EMA submissions. You write with the precision and judgment of a 30-year regulatory reviewer. Generate an aggregate safety narrative following ICH E3 Section 12 conventions. The narrative must:
(1) Start with an overview of the safety population and exposure.
(2) Present TEAEs by SOC and PT with arm comparisons.
(3) Highlight SAEs and deaths with clinical detail.
(4) Discuss discontinuations due to AEs.
(5) Summarize laboratory findings if provided.
(6) Use passive voice and regulatory language conventions.
(7) Reference specific table numbers using the convention provided.
(8) Avoid definitive causal language — use "possibly related" or "treatment-emergent" instead.
(9) When comparing arms, state incidence differences using percentage points and describe the clinical significance of any imbalances.
(10) Each section should begin with a succinct topic sentence summarising the key observation, followed by supporting detail.
(11) Prioritize safety signals by regulatory impact: distinguish true safety blockers from expected class effects. A reviewer will focus on unexpected imbalances and dose-response patterns — surface these prominently.
(12) Flag any inconsistency between the safety data and what a reviewer would expect based on the mechanism of action and therapeutic class. Do not just report numbers — interpret what they mean for the benefit-risk argument.

Output format: Return a JSON object with the following structure:
{
  "sections": [
    { "sectionCode": "12.0", "title": "Safety Overview", "content": "..." },
    { "sectionCode": "12.1", "title": "Extent of Exposure", "content": "..." },
    { "sectionCode": "12.2", "title": "Treatment-Emergent Adverse Events", "content": "..." },
    { "sectionCode": "12.3", "title": "Serious Adverse Events", "content": "..." },
    { "sectionCode": "12.4", "title": "Deaths", "content": "..." },
    { "sectionCode": "12.5", "title": "Discontinuations Due to Adverse Events", "content": "..." },
    { "sectionCode": "12.6", "title": "Clinical Laboratory Evaluations", "content": "..." },
    { "sectionCode": "12.7", "title": "Safety Conclusions", "content": "..." }
  ],
  "keyFindings": ["finding 1", "finding 2", ...],
  "regulatoryConcerns": ["concern 1", ...]
}

Ensure all content strings are publication-quality, with no bullet lists — use flowing prose paragraphs. Each section content should be at least 150 words.`;

    const userPrompt = `Generate an aggregate safety narrative for the following study data.

STUDY: ${request.studyTitle} (${request.studyId})
INDICATION: ${request.indication}
NARRATIVE TYPE: ${request.narrativeType.toUpperCase()}
TREATMENT ARMS: ${armSummary}

TABLE NUMBER CONVENTIONS:
- TEAE summary: ${tablePrefix.teaeSummary}
- TEAE by SOC: ${tablePrefix.teaeBySOC}
- TEAE by PT: ${tablePrefix.teaeByPT}
- SAE: ${tablePrefix.sae}
- Deaths: ${tablePrefix.deaths}
- Discontinuation: ${tablePrefix.discontinuation}
- Lab shift: ${tablePrefix.labShift}

--- TEAE DATA ---
${teaeSummaryLines}

--- SAE DATA ---
${saeSummaryLines}

--- DEATHS ---
${deathSummaryLines}

--- DISCONTINUATIONS DUE TO AE ---
${discontSummaryLines}

--- LABORATORY FINDINGS ---
${labSummaryLines}

Generate the complete safety narrative following ICH E3 Section 12 conventions. Return valid JSON only.`;

    // Grounding set: every 4+ digit number / identifier present anywhere in
    // the INPUT safety data. The AI's output may not introduce numeric or
    // identifier tokens outside this set — see "Grounding guard" above.
    const groundingSet = buildGroundingSet(request);

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', jsonMode: true, temperature: 0.2, maxTokens: 8000, callerModule: 'safety-narrative-service' }
    );

    const raw = aiResult.content ?? '{}';
    let parsed: {
      sections: Array<{ sectionCode: string; title: string; content: string }>;
      keyFindings: string[];
      regulatoryConcerns: string[];
    } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const sections = (parsed?.sections ?? []).map((s) => ({
      sectionCode: s.sectionCode,
      title: s.title,
      content: s.content,
    }));
    const keyFindings = parsed?.keyFindings ?? [];
    const regulatoryConcerns = parsed?.regulatoryConcerns ?? [];

    // Hallucination guard: scan every piece of AI-authored prose (section
    // content, key findings, regulatory concerns) for numeric/identifier
    // tokens absent from the source safety data.
    const candidateText = [
      ...sections.map((s) => s.content),
      ...keyFindings,
      ...regulatoryConcerns,
    ].join('\n');
    const ungrounded = parsed === null ? [] : findUngroundedTokens(candidateText, groundingSet);
    const shouldFallBack = parsed === null || sections.length === 0 || ungrounded.length > 0;

    if (shouldFallBack) {
      const deterministic = this.buildDeterministicAggregateNarrative(
        request,
        armSummary,
        teaeSummaryLines,
        saeSummaryLines,
        deathSummaryLines,
        discontSummaryLines,
        labSummaryLines,
      );
      return {
        ...deterministic,
        citedTables,
        aiNarrativeWithheld: true,
      };
    }

    const fullNarrative = sections.map((s) => `${s.sectionCode} ${s.title}\n\n${s.content}`).join('\n\n');

    return {
      fullNarrative,
      sections,
      keyFindings,
      regulatoryConcerns,
      citedTables,
      wordCount: fullNarrative.split(/\s+/).length,
    };
  }

  // -------------------------------------------------------------------------
  // 2. Individual SAE Narrative
  // -------------------------------------------------------------------------

  async generateSAENarrative(saeData: SAECaseData): Promise<string> {
    const systemPrompt = `You are a regulatory medical writer generating an individual Serious Adverse Event (SAE) narrative for an FDA/EMA submission. Follow these conventions:

1. Begin with a one-sentence summary identifying the patient by demographics, treatment arm, event term, and outcome.
2. Second paragraph: relevant medical history and concomitant medications.
3. Third paragraph: detailed event description including onset date, study day, initial presentation, clinical course, and temporal relationship to study drug administration.
4. Fourth paragraph: seriousness criteria met, severity grade, investigator causality assessment, action taken with study drug, and dechallenge/rechallenge information if available.
5. Fifth paragraph: relevant laboratory values and diagnostic findings, presented chronologically.
6. Final paragraph: outcome, resolution date if applicable, and investigator's narrative conclusion regarding the relationship of the event to study treatment.

Style requirements:
- Use third person and predominantly passive voice.
- Refer to the patient as "the subject" or "the patient" — never by name or identifier beyond the case ID.
- Use MedDRA preferred terms.
- Express dates in DD-MMM-YYYY format where given.
- Use regulatory hedging language: "The investigator assessed the event as [possibly/probably/unlikely/not] related to study treatment."
- Do not include speculative statements about mechanism of action.
- The narrative should be 200–400 words of flowing prose with no bullet points.`;

    const medHistoryStr = saeData.relevantMedicalHistory.length > 0
      ? saeData.relevantMedicalHistory.join(', ')
      : 'No clinically significant medical history reported';

    const seriousnessStr = saeData.seriousnessCriteria.join(', ');

    const conmedsStr = saeData.concomitantMedications && saeData.concomitantMedications.length > 0
      ? saeData.concomitantMedications.join(', ')
      : 'None reported';

    const labValuesStr = saeData.relevantLabValues && saeData.relevantLabValues.length > 0
      ? saeData.relevantLabValues
          .map((lv) => `${lv.parameter}: ${lv.value} (${lv.date})`)
          .join('; ')
      : 'No relevant laboratory values reported';

    const actionReadable = this.formatActionTaken(saeData.actionTaken);
    const outcomeReadable = this.formatOutcome(saeData.outcome);
    const ageStr = saeData.patientAge != null ? `${saeData.patientAge}-year-old` : 'age not reported';
    const onsetDayStr =
      saeData.onsetStudyDay != null ? `Study Day ${saeData.onsetStudyDay}` : 'study day not reported';

    const userPrompt = `Generate an SAE narrative for the following case.

CASE ID: ${saeData.caseId}
PATIENT: ${ageStr} ${saeData.patientSex}
TREATMENT ARM: ${saeData.treatmentArm}
STUDY DRUG: ${saeData.drugName}, ${saeData.dose}
RELEVANT MEDICAL HISTORY: ${medHistoryStr}
CONCOMITANT MEDICATIONS: ${conmedsStr}

EVENT: ${saeData.eventTerm}
EVENT DESCRIPTION: ${saeData.eventDescription}
ONSET DATE: ${saeData.onsetDate} (${onsetDayStr})
SERIOUSNESS CRITERIA: ${seriousnessStr}
SEVERITY: ${saeData.severity}
ACTION TAKEN: ${actionReadable}
OUTCOME: ${outcomeReadable}
CAUSALITY: ${saeData.causalityAssessment}
${saeData.dechallenge ? `DECHALLENGE: ${saeData.dechallenge}` : ''}
${saeData.rechallenge ? `RECHALLENGE: ${saeData.rechallenge}` : ''}

RELEVANT LAB VALUES:
${labValuesStr}

Write the complete SAE narrative in regulatory format.`;

    // Grounding set from the INPUT case data only.
    const groundingSet = buildGroundingSet(saeData);

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', temperature: 0.15, maxTokens: 2000, callerModule: 'safety-narrative-service' }
    );

    const narrative = (aiResult.content ?? '').trim();

    if (!narrative) {
      return this.buildDeterministicSAECaseSummary(saeData);
    }

    const ungrounded = findUngroundedTokens(narrative, groundingSet);
    if (ungrounded.length > 0) {
      return this.buildDeterministicSAECaseSummary(saeData);
    }

    return narrative;
  }

  /**
   * Deterministic, fully source-grounded replacement for the AI SAE
   * narrative when the hallucination guard trips (or the AI response was
   * empty). Composed directly from the input case fields — it cannot
   * itself introduce an ungrounded figure.
   */
  private buildDeterministicSAECaseSummary(saeData: SAECaseData): string {
    const medHistoryStr = saeData.relevantMedicalHistory.length > 0
      ? saeData.relevantMedicalHistory.join(', ')
      : 'No clinically significant medical history reported';

    const conmedsStr = saeData.concomitantMedications && saeData.concomitantMedications.length > 0
      ? saeData.concomitantMedications.join(', ')
      : 'None reported';

    const labValuesStr = saeData.relevantLabValues && saeData.relevantLabValues.length > 0
      ? saeData.relevantLabValues
          .map((lv) => `${lv.parameter}: ${lv.value} (${lv.date})`)
          .join('; ')
      : 'No relevant laboratory values reported';

    const actionReadable = this.formatActionTaken(saeData.actionTaken);
    const outcomeReadable = this.formatOutcome(saeData.outcome);
    const ageStr = saeData.patientAge != null ? `${saeData.patientAge}-year-old` : 'age not reported';
    const onsetDayStr =
      saeData.onsetStudyDay != null ? `Study Day ${saeData.onsetStudyDay}` : 'study day not reported';

    const lines = [
      AI_NARRATIVE_WITHHELD_MARKER,
      '',
      `Case ${saeData.caseId}: ${ageStr} ${saeData.patientSex}, treatment arm ${saeData.treatmentArm}, receiving ${saeData.drugName} ${saeData.dose}.`,
      `Relevant medical history: ${medHistoryStr}. Concomitant medications: ${conmedsStr}.`,
      `Event: ${saeData.eventTerm} — ${saeData.eventDescription || 'no description provided'}. Onset: ${saeData.onsetDate} (${onsetDayStr}).`,
      `Seriousness criteria: ${saeData.seriousnessCriteria.join(', ') || 'not specified'}. Severity: ${saeData.severity}. Action taken: ${actionReadable}. Causality assessment: ${saeData.causalityAssessment}.`,
      saeData.dechallenge ? `Dechallenge: ${saeData.dechallenge}.` : '',
      saeData.rechallenge ? `Rechallenge: ${saeData.rechallenge}.` : '',
      `Relevant laboratory values: ${labValuesStr}.`,
      `Outcome: ${outcomeReadable}.`,
    ].filter((line) => line !== '');

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // 3. Benefit-Risk Summary
  // -------------------------------------------------------------------------

  async generateBenefitRiskSummary(
    request: BenefitRiskRequest,
  ): Promise<BenefitRiskNarrative> {
    const systemPrompt = `You are AnA, a senior regulatory intelligence operator preparing a benefit-risk assessment with the judgment depth of a CDER division director. Follow the FDA Benefit-Risk Framework and EMA BRAT methodology. The narrative must:

1. Open with a contextual statement about the therapeutic area, disease severity, and unmet medical need.
2. Present benefit dimensions: analysis of condition treated, clinical benefits observed (primary and secondary endpoints), effect size in context of available therapies.
3. Present risk dimensions: common adverse events, serious and severe risks, tolerability and reversibility, long-term safety unknowns.
4. Provide a structured benefit-risk synthesis that weighs benefits against risks in the context of the patient population and disease severity.
5. Conclude with an overall assessment and explicit acknowledgement of uncertainties.
6. Use regulatory language: "The favorable benefit-risk profile is supported by..." or "The identified risks are considered manageable in the context of..."
7. Do not make approval recommendations — present the data and framework only.
8. Assess whether the benefit-risk argument is defensible, vulnerable, or overclaimed. A reviewer will stress-test effect sizes against the comparator landscape — surface any vulnerability.
9. Distinguish true benefit-risk blockers from manageable risks. Not all safety signals are equal; prioritize by clinical impact and regulatory precedent.

Return a JSON object:
{
  "narrative": "Full flowing prose benefit-risk narrative, 400-600 words",
  "benefitDimensions": [{ "dimension": "...", "assessment": "..." }],
  "riskDimensions": [{ "dimension": "...", "assessment": "..." }],
  "overallConclusion": "2-3 sentence overall conclusion",
  "uncertainties": ["uncertainty 1", ...]
}`;

    const userPrompt = `Generate a benefit-risk assessment narrative for the following data.

TREATMENT: ${request.treatmentName}
INDICATION: ${request.indication}

EFFICACY SUMMARY:
- Primary Endpoint: ${request.efficacySummary.primaryEndpointResult}
- Clinical Benefit: ${request.efficacySummary.clinicalBenefit}
- Effect Size: ${request.efficacySummary.effectSize}
- Statistical Significance: ${request.efficacySummary.statisticalSignificance}

SAFETY SUMMARY:
- Overall Profile: ${request.safetySummary.overallSafetyProfile}
- Most Common AEs: ${request.safetySummary.mostCommonAEs.join(', ')}
- Serious Risks: ${request.safetySummary.seriousRisks.join(', ')}
- Manageable Risks: ${request.safetySummary.manageableRisks.join(', ')}
- Unmet Need: ${request.safetySummary.unmetNeed}

CONTEXT:
- Available Therapies: ${request.context.availableTherapies.join(', ')}
- Disease Severity: ${request.context.diseaseSeverity}
- Patient Population: ${request.context.patientPopulation}

Return valid JSON only.`;

    // Grounding set from the INPUT benefit-risk request only.
    const groundingSet = buildGroundingSet(request);

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', jsonMode: true, temperature: 0.2, maxTokens: 4000, callerModule: 'safety-narrative-service' }
    );

    const raw = aiResult.content ?? '{}';
    let parsed: BenefitRiskNarrative | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (parsed === null || !parsed.narrative) {
      return { ...this.buildDeterministicBenefitRiskNarrative(request), aiNarrativeWithheld: true };
    }

    const candidateText = [
      parsed.narrative ?? '',
      ...(parsed.benefitDimensions ?? []).map((d) => `${d.dimension} ${d.assessment}`),
      ...(parsed.riskDimensions ?? []).map((d) => `${d.dimension} ${d.assessment}`),
      parsed.overallConclusion ?? '',
      ...(parsed.uncertainties ?? []),
    ].join('\n');
    const ungrounded = findUngroundedTokens(candidateText, groundingSet);

    if (ungrounded.length > 0) {
      return { ...this.buildDeterministicBenefitRiskNarrative(request), aiNarrativeWithheld: true };
    }

    return {
      narrative: parsed.narrative ?? '',
      benefitDimensions: parsed.benefitDimensions ?? [],
      riskDimensions: parsed.riskDimensions ?? [],
      overallConclusion: parsed.overallConclusion ?? '',
      uncertainties: parsed.uncertainties ?? [],
    };
  }

  /**
   * Deterministic, fully source-grounded replacement for the AI benefit-risk
   * narrative when the hallucination guard trips (or the AI response was
   * empty/unparseable). Built entirely from the request fields — it cannot
   * itself introduce an ungrounded figure.
   */
  private buildDeterministicBenefitRiskNarrative(request: BenefitRiskRequest): BenefitRiskNarrative {
    const narrative = [
      AI_NARRATIVE_WITHHELD_MARKER,
      '',
      `Treatment: ${request.treatmentName} — Indication: ${request.indication}.`,
      `Primary endpoint: ${request.efficacySummary.primaryEndpointResult}. Clinical benefit: ${request.efficacySummary.clinicalBenefit}. Effect size: ${request.efficacySummary.effectSize} (${request.efficacySummary.statisticalSignificance}).`,
      `Overall safety profile: ${request.safetySummary.overallSafetyProfile}. Most common AEs: ${request.safetySummary.mostCommonAEs.join(', ') || 'none reported'}. Serious risks: ${request.safetySummary.seriousRisks.join(', ') || 'none reported'}. Manageable risks: ${request.safetySummary.manageableRisks.join(', ') || 'none reported'}. Unmet need: ${request.safetySummary.unmetNeed}.`,
      `Context: available therapies — ${request.context.availableTherapies.join(', ') || 'none specified'}; disease severity — ${request.context.diseaseSeverity}; patient population — ${request.context.patientPopulation}.`,
    ].join('\n');

    return {
      narrative,
      benefitDimensions: [
        { dimension: 'Clinical benefit', assessment: request.efficacySummary.clinicalBenefit },
        { dimension: 'Effect size', assessment: request.efficacySummary.effectSize },
      ],
      riskDimensions: [
        { dimension: 'Serious risks', assessment: request.safetySummary.seriousRisks.join(', ') || 'None reported' },
        { dimension: 'Manageable risks', assessment: request.safetySummary.manageableRisks.join(', ') || 'None reported' },
      ],
      overallConclusion: AI_NARRATIVE_WITHHELD_MARKER,
      uncertainties: [AI_NARRATIVE_WITHHELD_MARKER],
    };
  }

  // -------------------------------------------------------------------------
  // 4. Signal Summary
  // -------------------------------------------------------------------------

  async generateSignalSummary(signals: SignalData[]): Promise<string> {
    if (signals.length === 0) {
      return 'No safety signals were identified during the reporting period that warranted further evaluation.';
    }

    const systemPrompt = `You are a pharmacovigilance medical writer preparing a safety signal assessment summary for a Periodic Safety Update Report (PSUR) / Periodic Benefit-Risk Evaluation Report (PBRER). For each signal, the narrative must cover:

1. Signal description — what was detected and when.
2. Data sources — clinical trials, spontaneous reports, literature, registries.
3. Strength of evidence — using Bradford Hill criteria language where applicable (temporality, biological plausibility, consistency, dose-response).
4. Clinical significance — potential impact on patient safety.
5. Current label status — whether the finding is already reflected in the product labeling.
6. Recommended action — continued monitoring, label update, REMS modification, restriction, or no action with justification.

Style:
- Use flowing prose, not bullet points.
- One paragraph per signal, with a concluding summary paragraph.
- Use pharmacovigilance terminology: "signal of disproportionate reporting," "observed-to-expected ratio," "confirmed signal," "refuted signal."
- Reference applicable regulatory guidance (CIOMS, ICH E2E) where relevant.`;

    const signalDescriptions = signals
      .map(
        (s, i) =>
          `Signal ${i + 1}: ${s.signalName}
  Preferred Term: ${s.preferredTerm}
  Source: ${s.source}
  Strength of Evidence: ${s.strengthOfEvidence}
  Clinical Significance: ${s.clinicalSignificance}
  Current Label Status: ${s.currentLabelStatus}
  Recommended Action: ${s.recommendedAction}`,
      )
      .join('\n\n');

    const userPrompt = `Generate a comprehensive signal assessment summary for the following ${signals.length} safety signal(s).

${signalDescriptions}

Write the complete signal assessment narrative. Include an introductory sentence and a concluding summary paragraph that synthesises the overall signal landscape.`;

    // Grounding set from the INPUT signals only.
    const groundingSet = buildGroundingSet(signals);

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', temperature: 0.2, maxTokens: 4000, callerModule: 'safety-narrative-service' }
    );

    const narrative = (aiResult.content ?? '').trim();

    if (!narrative) {
      return this.buildDeterministicSignalSummary(signals);
    }

    const ungrounded = findUngroundedTokens(narrative, groundingSet);
    if (ungrounded.length > 0) {
      return this.buildDeterministicSignalSummary(signals);
    }

    return narrative;
  }

  /**
   * Deterministic, fully source-grounded replacement for the AI signal
   * summary when the hallucination guard trips (or the AI response was
   * empty). Built entirely from the input signal records.
   */
  private buildDeterministicSignalSummary(signals: SignalData[]): string {
    const lines = [AI_NARRATIVE_WITHHELD_MARKER, ''];
    for (const s of signals) {
      lines.push(
        `${s.signalName} (${s.preferredTerm}): source=${s.source}; strength of evidence=${s.strengthOfEvidence}; ` +
          `clinical significance=${s.clinicalSignificance}; current label status=${s.currentLabelStatus}; ` +
          `recommended action=${s.recommendedAction}.`,
      );
    }
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // 5. Cross-Study Safety Summary
  // -------------------------------------------------------------------------

  async generateCrossStudySafetySummary(
    studies: CrossStudySafetyInput[],
  ): Promise<string> {
    if (studies.length === 0) {
      return 'No study data was provided for cross-study safety comparison.';
    }

    const systemPrompt = `You are a regulatory medical writer preparing a cross-study safety comparison for an Investigator's Brochure (IB) or Integrated Summary of Safety (ISS). The narrative must:

1. Begin with an overview of the studies included: study phases, populations, doses, and sample sizes.
2. Identify adverse events that are consistently reported across studies, noting incidence ranges and whether a dose-response relationship is apparent.
3. Highlight any new safety signals that emerged in later or larger studies.
4. Note any differences in safety profiles that may be attributable to differences in study populations, dose levels, treatment duration, or study design.
5. Discuss serious adverse events and deaths in a pooled or comparative context.
6. Conclude with an integrated safety characterisation that synthesises findings across the development program.

Style:
- Regulatory prose, passive voice, no bullet points.
- Use "across the clinical development program" language.
- Refer to studies by their identifiers.
- Use hedging language: "The incidence of [event] appeared to increase with dose, although a definitive dose-response relationship was not established."
- The narrative should be 400-800 words depending on the number of studies.`;

    const studyDescriptions = studies
      .map(
        (s) =>
          `Study ${s.studyId} (Phase ${s.studyPhase}):
  Population: ${s.population}
  N=${s.nSubjects}, Dose: ${s.dose}
  Top AEs: ${s.topAEs.map((ae) => `${ae.term} (${ae.incidence}%)`).join(', ')}
  SAE Summary: ${s.saeSummary}`,
      )
      .join('\n\n');

    const userPrompt = `Generate a cross-study safety comparison narrative for the following ${studies.length} studies in the clinical development program.

${studyDescriptions}

Write the complete integrated safety narrative.`;

    // Grounding set from the INPUT study data only.
    const groundingSet = buildGroundingSet(studies);

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', temperature: 0.2, maxTokens: 4000, callerModule: 'safety-narrative-service' }
    );

    const narrative = (aiResult.content ?? '').trim();

    if (!narrative) {
      return this.buildDeterministicCrossStudySummary(studies);
    }

    const ungrounded = findUngroundedTokens(narrative, groundingSet);
    if (ungrounded.length > 0) {
      return this.buildDeterministicCrossStudySummary(studies);
    }

    return narrative;
  }

  /**
   * Deterministic, fully source-grounded replacement for the AI cross-study
   * safety summary when the hallucination guard trips (or the AI response
   * was empty). Built entirely from the input study records.
   */
  private buildDeterministicCrossStudySummary(studies: CrossStudySafetyInput[]): string {
    const lines = [AI_NARRATIVE_WITHHELD_MARKER, ''];
    for (const s of studies) {
      const topAEsStr = s.topAEs.map((ae) => `${ae.term} (${ae.incidence}%)`).join(', ') || 'none reported';
      lines.push(
        `Study ${s.studyId} (Phase ${s.studyPhase}), population: ${s.population}, N=${s.nSubjects}, dose: ${s.dose}. ` +
          `Top AEs: ${topAEsStr}. SAE summary: ${s.saeSummary}.`,
      );
    }
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Private helpers — structured data formatting
  // -------------------------------------------------------------------------

  /**
   * Deterministic, fully source-grounded replacement for the AI aggregate
   * narrative when the hallucination guard trips (or the AI response was
   * empty/unparseable). Built entirely from the already-computed
   * deterministic summary strings — it cannot itself introduce an
   * ungrounded figure. Every section is prefixed with the withheld marker
   * so the honest fallback is never mistaken for AI-authored prose.
   */
  private buildDeterministicAggregateNarrative(
    request: AggregateSafetyRequest,
    armSummary: string,
    teaeSummaryLines: string,
    saeSummaryLines: string,
    deathSummaryLines: string,
    discontSummaryLines: string,
    labSummaryLines: string,
  ): Pick<SafetyNarrative, 'fullNarrative' | 'sections' | 'keyFindings' | 'regulatoryConcerns' | 'wordCount'> {
    const sections: SafetyNarrative['sections'] = [
      {
        sectionCode: SECTION_CODES.overview.code,
        title: SECTION_CODES.overview.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\nStudy ${request.studyTitle} (${request.studyId}), indication: ${request.indication}. Treatment arms: ${armSummary || 'not provided'}.`,
      },
      {
        sectionCode: SECTION_CODES.exposure.code,
        title: SECTION_CODES.exposure.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\n${armSummary || 'No treatment arm data provided.'}`,
      },
      {
        sectionCode: SECTION_CODES.teae.code,
        title: SECTION_CODES.teae.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\n${teaeSummaryLines}`,
      },
      {
        sectionCode: SECTION_CODES.sae.code,
        title: SECTION_CODES.sae.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\n${saeSummaryLines}`,
      },
      {
        sectionCode: SECTION_CODES.deaths.code,
        title: SECTION_CODES.deaths.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\n${deathSummaryLines}`,
      },
      {
        sectionCode: SECTION_CODES.discontinuations.code,
        title: SECTION_CODES.discontinuations.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\n${discontSummaryLines}`,
      },
      {
        sectionCode: SECTION_CODES.labs.code,
        title: SECTION_CODES.labs.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\n${labSummaryLines}`,
      },
      {
        sectionCode: SECTION_CODES.conclusion.code,
        title: SECTION_CODES.conclusion.title,
        content: `${AI_NARRATIVE_WITHHELD_MARKER}\n\nA safety conclusion narrative requires manual authoring by a regulatory medical writer using the deterministic tables above; none is offered here to avoid presenting unverified interpretation as fact.`,
      },
    ];

    const fullNarrative = sections.map((s) => `${s.sectionCode} ${s.title}\n\n${s.content}`).join('\n\n');

    return {
      fullNarrative,
      sections,
      keyFindings: [AI_NARRATIVE_WITHHELD_MARKER],
      regulatoryConcerns: [AI_NARRATIVE_WITHHELD_MARKER],
      wordCount: fullNarrative.split(/\s+/).length,
    };
  }

  private buildTEAESummary(request: AggregateSafetyRequest): string {
    if (request.teaeData.length === 0) return 'No TEAE data provided.';

    const armNames = request.treatmentArms.map((a) => a.armName);

    // Group by SOC
    const socMap = new Map<string, typeof request.teaeData>();
    for (const ae of request.teaeData) {
      const existing = socMap.get(ae.systemOrganClass) ?? [];
      existing.push(ae);
      socMap.set(ae.systemOrganClass, existing);
    }

    const lines: string[] = [];
    lines.push(`Total TEAEs: ${request.teaeData.length} preferred terms across ${socMap.size} system organ classes.`);
    lines.push('');

    // Overall incidence by arm: subjects with at least one TEAE
    for (const armName of armNames) {
      const armN = request.treatmentArms.find((a) => a.armName === armName)?.nSubjects ?? 0;
      lines.push(`${armName} (N=${armN}):`);
    }
    lines.push('');

    // Top 10 TEAEs by highest incidence across any arm
    const sorted = [...request.teaeData].sort((a, b) => {
      const maxA = Math.max(...Object.values(a.armCounts).map((v) => v.percent));
      const maxB = Math.max(...Object.values(b.armCounts).map((v) => v.percent));
      return maxB - maxA;
    });
    const top10 = sorted.slice(0, 10);

    lines.push('Top 10 TEAEs by incidence:');
    for (const ae of top10) {
      const countsStr = armNames
        .map((arm) => {
          const c = ae.armCounts[arm];
          return c ? `${arm}: ${c.n} (${c.percent}%)` : `${arm}: 0`;
        })
        .join(', ');
      lines.push(
        `  ${ae.preferredTerm} [${ae.systemOrganClass}] — ${countsStr}${ae.severity ? `, severity: ${ae.severity}` : ''}${ae.relatedness ? `, relatedness: ${ae.relatedness}` : ''}`,
      );
    }

    // SOC-level summary
    lines.push('');
    lines.push('SOC-level summary (number of PTs per SOC):');
    for (const [soc, aes] of socMap.entries()) {
      lines.push(`  ${soc}: ${aes.length} PTs`);
    }

    // Serious vs. non-serious breakdown
    const serious = request.teaeData.filter((ae) => ae.seriousness === 'serious');
    const nonSerious = request.teaeData.filter((ae) => ae.seriousness === 'non_serious');
    lines.push('');
    lines.push(`Serious TEAEs: ${serious.length} PTs; Non-serious TEAEs: ${nonSerious.length} PTs`);

    return lines.join('\n');
  }

  private buildSAESummary(request: AggregateSafetyRequest): string {
    if (request.saeData.length === 0) return 'No SAEs were reported during the study.';

    const armNames = request.treatmentArms.map((a) => a.armName);
    const lines: string[] = [];
    lines.push(`Total SAE preferred terms reported: ${request.saeData.length}`);
    lines.push('');

    for (const sae of request.saeData) {
      const countsStr = armNames
        .map((arm) => `${arm}: ${sae.armCounts[arm] ?? 0}`)
        .join(', ');
      const outcomesStr = sae.outcomes.length > 0 ? ` | Outcomes: ${sae.outcomes.join(', ')}` : '';
      lines.push(`  ${sae.preferredTerm} [${sae.systemOrganClass}] — ${countsStr}${outcomesStr}`);
    }

    return lines.join('\n');
  }

  private buildDeathSummary(request: AggregateSafetyRequest): string {
    if (request.deaths.length === 0 || request.deaths.every((d) => d.count === 0)) {
      return 'No deaths were reported during the study.';
    }

    const lines: string[] = [];
    const totalDeaths = request.deaths.reduce((sum, d) => sum + d.count, 0);
    lines.push(`Total deaths: ${totalDeaths}`);
    lines.push('');

    for (const d of request.deaths) {
      if (d.count === 0) continue;
      lines.push(
        `  ${d.armName}: ${d.count} death(s) — Causes: ${d.causes.length > 0 ? d.causes.join(', ') : 'not specified'}`,
      );
    }

    return lines.join('\n');
  }

  private buildDiscontinuationSummary(request: AggregateSafetyRequest): string {
    const entries = Object.entries(request.discontinuationsDueToAE);
    if (entries.length === 0) return 'No discontinuation data provided.';

    const lines: string[] = [];
    for (const [arm, data] of entries) {
      const reasonStr = data.topReasons.length > 0 ? data.topReasons.join(', ') : 'not specified';
      lines.push(`  ${arm}: ${data.n} (${data.percent}%) — Top reasons: ${reasonStr}`);
    }

    return lines.join('\n');
  }

  private buildLabSummary(request: AggregateSafetyRequest): string {
    if (!request.labFindings || request.labFindings.length === 0) {
      return 'No laboratory shift data provided.';
    }

    const lines: string[] = [];
    for (const lab of request.labFindings) {
      const armShifts = Object.entries(lab.armShiftData)
        .map(
          ([arm, shifts]) =>
            `${arm}: Normal->High ${shifts.normalToHigh}, Normal->Low ${shifts.normalToLow}`,
        )
        .join('; ');
      lines.push(`  ${lab.parameter}: ${armShifts}`);
    }

    return lines.join('\n');
  }

  private formatActionTaken(action: string): string {
    const map: Record<string, string> = {
      drug_withdrawn: 'Study drug was permanently discontinued',
      dose_reduced: 'Study drug dose was reduced',
      dose_not_changed: 'Study drug dose was not changed',
      drug_interrupted: 'Study drug was temporarily interrupted',
      not_applicable: 'Not applicable',
      unknown: 'Unknown',
    };
    return map[action] ?? action;
  }

  private formatOutcome(outcome: string): string {
    const map: Record<string, string> = {
      recovered: 'Recovered/Resolved',
      recovering: 'Recovering/Resolving',
      not_recovered: 'Not recovered/Not resolved',
      recovered_with_sequelae: 'Recovered/Resolved with sequelae',
      fatal: 'Fatal',
      unknown: 'Unknown',
    };
    return map[outcome] ?? outcome;
  }
}

export const safetyNarrativeService = new SafetyNarrativeService();
