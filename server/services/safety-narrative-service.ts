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
}

export interface SAECaseData {
  caseId: string;
  patientAge: number;
  patientSex: string;
  relevantMedicalHistory: string[];
  treatmentArm: string;
  drugName: string;
  dose: string;
  eventTerm: string;
  eventDescription: string;
  onsetDate: string;
  onsetStudyDay: number;
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

    const systemPrompt = `You are a regulatory medical writer specializing in safety narratives for FDA/EMA submissions. Generate an aggregate safety narrative following ICH E3 Section 12 conventions. The narrative must:
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

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', jsonMode: true, temperature: 0.2, maxTokens: 8000, callerModule: 'safety-narrative-service' }
    );

    const raw = aiResult.content ?? '{}';
    const parsed = JSON.parse(raw) as {
      sections: Array<{ sectionCode: string; title: string; content: string }>;
      keyFindings: string[];
      regulatoryConcerns: string[];
    };

    const sections = (parsed.sections ?? []).map((s) => ({
      sectionCode: s.sectionCode,
      title: s.title,
      content: s.content,
    }));

    const fullNarrative = sections.map((s) => `${s.sectionCode} ${s.title}\n\n${s.content}`).join('\n\n');

    return {
      fullNarrative,
      sections,
      keyFindings: parsed.keyFindings ?? [],
      regulatoryConcerns: parsed.regulatoryConcerns ?? [],
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

    const userPrompt = `Generate an SAE narrative for the following case.

CASE ID: ${saeData.caseId}
PATIENT: ${saeData.patientAge}-year-old ${saeData.patientSex}
TREATMENT ARM: ${saeData.treatmentArm}
STUDY DRUG: ${saeData.drugName}, ${saeData.dose}
RELEVANT MEDICAL HISTORY: ${medHistoryStr}
CONCOMITANT MEDICATIONS: ${conmedsStr}

EVENT: ${saeData.eventTerm}
EVENT DESCRIPTION: ${saeData.eventDescription}
ONSET DATE: ${saeData.onsetDate} (Study Day ${saeData.onsetStudyDay})
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

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', temperature: 0.15, maxTokens: 2000, callerModule: 'safety-narrative-service' }
    );

    return (aiResult.content ?? '').trim();
  }

  // -------------------------------------------------------------------------
  // 3. Benefit-Risk Summary
  // -------------------------------------------------------------------------

  async generateBenefitRiskSummary(
    request: BenefitRiskRequest,
  ): Promise<BenefitRiskNarrative> {
    const systemPrompt = `You are a senior regulatory strategist preparing a benefit-risk assessment narrative following the FDA Benefit-Risk Framework and EMA BRAT (Benefit-Risk Action Team) methodology. The narrative must:

1. Open with a contextual statement about the therapeutic area, disease severity, and unmet medical need.
2. Present benefit dimensions: analysis of condition treated, clinical benefits observed (primary and secondary endpoints), effect size in context of available therapies.
3. Present risk dimensions: common adverse events, serious and severe risks, tolerability and reversibility, long-term safety unknowns.
4. Provide a structured benefit-risk synthesis that weighs benefits against risks in the context of the patient population and disease severity.
5. Conclude with an overall assessment and explicit acknowledgement of uncertainties.
6. Use regulatory language: "The favorable benefit-risk profile is supported by..." or "The identified risks are considered manageable in the context of..."
7. Do not make approval recommendations — present the data and framework only.

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

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', jsonMode: true, temperature: 0.2, maxTokens: 4000, callerModule: 'safety-narrative-service' }
    );

    const raw = aiResult.content ?? '{}';
    const parsed = JSON.parse(raw) as BenefitRiskNarrative;

    return {
      narrative: parsed.narrative ?? '',
      benefitDimensions: parsed.benefitDimensions ?? [],
      riskDimensions: parsed.riskDimensions ?? [],
      overallConclusion: parsed.overallConclusion ?? '',
      uncertainties: parsed.uncertainties ?? [],
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

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', temperature: 0.2, maxTokens: 4000, callerModule: 'safety-narrative-service' }
    );

    return (aiResult.content ?? '').trim();
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

    const aiResult = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { taskType: 'regulatory_review', temperature: 0.2, maxTokens: 4000, callerModule: 'safety-narrative-service' }
    );

    return (aiResult.content ?? '').trim();
  }

  // -------------------------------------------------------------------------
  // Private helpers — structured data formatting
  // -------------------------------------------------------------------------

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
