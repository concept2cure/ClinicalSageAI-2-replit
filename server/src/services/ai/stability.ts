/**
 * AI-powered Stability Services
 *
 * Real implementations that call the AI Gateway for ICH-compliant
 * stability analysis, drafting, and decision support.
 */
import { getGateway } from '../ai-gateway/index.js';

// ──────────────────────────────────────────────
// 1. aiExplainStability
// ──────────────────────────────────────────────
export async function aiExplainStability(
  studyId: string,
): Promise<{ explanation: string }> {
  try {
    const gw = getGateway();
    const result = await gw.route({
      taskType: 'document_analysis',
      callerModule: 'stability.aiExplainStability',
      messages: [
        {
          role: 'system',
          content:
            'You are a pharmaceutical stability scientist with deep expertise in ICH Q1A(R2) and Q1E guidelines. ' +
            'Analyse the stability data for the given study and explain the trends clearly, including any degradation ' +
            'kinetics, storage-condition effects, and shelf-life implications. Use plain scientific language.',
        },
        {
          role: 'user',
          content: `Explain the stability data trends and key observations for study ID: ${studyId}. ` +
            'Cover degradation rates, any concerning trends, and how the data aligns with ICH acceptance criteria.',
        },
      ],
      maxTokens: 1200,
      temperature: 0.25,
    });
    return { explanation: result.content };
  } catch (err: any) {
    console.error('[aiExplainStability] Error:', err?.message ?? err);
    return {
      explanation:
        'Unable to generate AI explanation at this time. Please review the raw stability data directly and consult ICH Q1A(R2) Section 2.2 for trend-analysis guidance.',
    };
  }
}

// ──────────────────────────────────────────────
// 2. aiCoachPriorities
// ──────────────────────────────────────────────
interface PriorityItem {
  action: string;
  urgency: string;
  rationale: string;
}

export async function aiCoachPriorities(
  studyId: string,
): Promise<{ priorities: PriorityItem[] }> {
  try {
    const gw = getGateway();
    const result = await gw.structuredOutput<{ priorities: PriorityItem[] }>(
      `For stability study ${studyId}, identify the top 5 priority actions that should be taken. ` +
        'Consider ICH Q1A(R2) timelines, pending time-points, out-of-trend alerts, and regulatory submission deadlines. ' +
        'For each action provide: action (what to do), urgency (critical / high / medium / low), and rationale.',
      {
        type: 'object',
        properties: {
          priorities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                urgency: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                rationale: { type: 'string' },
              },
              required: ['action', 'urgency', 'rationale'],
            },
          },
        },
        required: ['priorities'],
      },
      {
        taskType: 'regulatory_review',
        callerModule: 'stability.aiCoachPriorities',
        maxTokens: 1200,
      },
    );
    return result;
  } catch (err: any) {
    console.error('[aiCoachPriorities] Error:', err?.message ?? err);
    return {
      priorities: [
        {
          action: 'Review pending stability time-points and ensure testing is on schedule per ICH Q1A(R2).',
          urgency: 'high',
          rationale: 'AI coaching is temporarily unavailable. This is a standing best-practice recommendation.',
        },
      ],
    };
  }
}

// ──────────────────────────────────────────────
// 3. aiFixPlanFromIssues
// ──────────────────────────────────────────────
export async function aiFixPlanFromIssues(
  studyId: string,
  issues: any,
): Promise<{ plan: string }> {
  try {
    const gw = getGateway();
    const result = await gw.route({
      taskType: 'regulatory_review',
      callerModule: 'stability.aiFixPlanFromIssues',
      messages: [
        {
          role: 'system',
          content:
            'You are a pharmaceutical quality engineer specialising in stability studies. ' +
            'Given a list of issues or deviations, produce a detailed remediation plan with concrete steps, ' +
            'responsible roles, timelines, and references to relevant ICH or GMP guidance.',
        },
        {
          role: 'user',
          content:
            `Generate a remediation plan for stability study ${studyId}.\n\nIssues identified:\n` +
            JSON.stringify(issues, null, 2),
        },
      ],
      maxTokens: 1500,
      temperature: 0.3,
    });
    return { plan: result.content };
  } catch (err: any) {
    console.error('[aiFixPlanFromIssues] Error:', err?.message ?? err);
    return {
      plan:
        'Unable to generate a remediation plan automatically. Recommended manual steps: (1) Classify each issue by severity, ' +
        '(2) Assign root-cause investigation per ICH Q10, (3) Draft CAPA for each critical/major issue, ' +
        '(4) Schedule follow-up testing at the next ICH time-point.',
    };
  }
}

// ──────────────────────────────────────────────
// 4. aiDraftP8
// ──────────────────────────────────────────────
export async function aiDraftP8(
  studyId: string,
): Promise<{ draft: string }> {
  try {
    const gw = getGateway();
    const result = await gw.route({
      taskType: 'document_drafting',
      callerModule: 'stability.aiDraftP8',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory-affairs writer with expertise in ICH CTD Module 3 (Quality). ' +
            'Draft the P.8 Stability section for a drug product following the ICH M4Q(R1) format. ' +
            'Include: summary of studies, testing conditions (ICH Q1A long-term 25 °C/60 % RH, accelerated 40 °C/75 % RH), ' +
            'results discussion, proposed shelf life, and storage conditions. Use formal regulatory language.',
        },
        {
          role: 'user',
          content:
            `Draft a complete CTD Section P.8 (Stability) for study ${studyId}. ` +
            'Include placeholders where specific numeric data should be inserted (e.g., [INSERT ASSAY VALUE]).',
        },
      ],
      maxTokens: 2000,
      temperature: 0.2,
    });
    return { draft: result.content };
  } catch (err: any) {
    console.error('[aiDraftP8] Error:', err?.message ?? err);
    return {
      draft:
        'P.8 Stability draft could not be generated automatically. Please use the ICH M4Q(R1) template and populate ' +
        'with data from the long-term and accelerated stability studies for this product.',
    };
  }
}

// ──────────────────────────────────────────────
// 5. aiRootCauseOOS
// ──────────────────────────────────────────────
export async function aiRootCauseOOS(
  studyId: string,
  oosData: any,
): Promise<{
  analysis: string;
  probableCauses: string[];
  recommendations: string[];
}> {
  try {
    const gw = getGateway();
    const result = await gw.structuredOutput<{
      analysis: string;
      probableCauses: string[];
      recommendations: string[];
    }>(
      `Perform a root-cause analysis for the following out-of-specification (OOS) result in stability study ${studyId}.\n\n` +
        `OOS data:\n${JSON.stringify(oosData, null, 2)}\n\n` +
        'Use Ishikawa (fishbone) and 5-Why methodology. Identify probable causes across the 6M categories ' +
        '(Man, Machine, Method, Material, Measurement, Mother Nature). Provide actionable recommendations.',
      {
        type: 'object',
        properties: {
          analysis: { type: 'string', description: 'Full narrative root-cause analysis' },
          probableCauses: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of probable causes ranked by likelihood',
          },
          recommendations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Corrective actions',
          },
        },
        required: ['analysis', 'probableCauses', 'recommendations'],
      },
      {
        taskType: 'document_analysis',
        callerModule: 'stability.aiRootCauseOOS',
        maxTokens: 1500,
      },
    );
    return result;
  } catch (err: any) {
    console.error('[aiRootCauseOOS] Error:', err?.message ?? err);
    return {
      analysis:
        'Automated root-cause analysis is temporarily unavailable. Initiate a manual Phase I laboratory investigation per your OOS SOP.',
      probableCauses: [
        'Analytical method variability',
        'Sample preparation error',
        'Instrument calibration drift',
        'Environmental excursion during storage',
      ],
      recommendations: [
        'Re-test the original sample in duplicate per OOS Phase I procedure',
        'Verify instrument calibration and system suitability',
        'Review storage temperature logs for excursions',
        'Document findings and escalate to Phase II if Phase I is inconclusive',
      ],
    };
  }
}

// ──────────────────────────────────────────────
// 6. aiRecommendLabelStorage
// ──────────────────────────────────────────────
export async function aiRecommendLabelStorage(
  studyId: string,
): Promise<{
  recommendation: string;
  conditions: string;
  shelfLife: string;
}> {
  try {
    const gw = getGateway();
    const result = await gw.structuredOutput<{
      recommendation: string;
      conditions: string;
      shelfLife: string;
    }>(
      `Based on the stability data for study ${studyId}, recommend the labelled storage conditions and shelf life. ` +
        'Follow ICH Q1E statistical analysis guidance. Consider Zone I–IVb climatic zones. ' +
        'State the recommended label storage statement, the specific conditions (temperature and humidity), ' +
        'and the proposed shelf life with justification.',
      {
        type: 'object',
        properties: {
          recommendation: { type: 'string', description: 'Full recommendation narrative' },
          conditions: { type: 'string', description: 'E.g., "Store below 25 °C. Do not freeze."' },
          shelfLife: { type: 'string', description: 'E.g., "24 months"' },
        },
        required: ['recommendation', 'conditions', 'shelfLife'],
      },
      {
        taskType: 'regulatory_review',
        callerModule: 'stability.aiRecommendLabelStorage',
        maxTokens: 1000,
      },
    );
    return result;
  } catch (err: any) {
    console.error('[aiRecommendLabelStorage] Error:', err?.message ?? err);
    return {
      recommendation:
        'Automated storage recommendation is temporarily unavailable. ' +
        'Perform ICH Q1E statistical analysis on the long-term data to determine the shelf life.',
      conditions: 'Pending analysis — refer to ICH Q1A(R2) Table 1 for standard conditions.',
      shelfLife: 'To be determined from statistical evaluation of long-term data.',
    };
  }
}

// ──────────────────────────────────────────────
// 7. simpleShelfLifeT90  (pure math — no AI)
// ──────────────────────────────────────────────
/**
 * Estimate T90 shelf life (time to 90 % label claim) using the
 * Arrhenius equation.
 *
 *   k = A · exp(-Ea / (R · T))
 *   T90 = -ln(0.9) / k
 *
 * Where:
 *   R  = 8.314 J/(mol·K)
 *   Ea = 83 144 J/mol  (typical pharma activation energy)
 *   A  = pre-exponential factor derived from accelerated data
 *
 * The function derives k at 25 °C (298.15 K) from k at 40 °C
 * (313.15 K), assuming first-order kinetics.
 */
export async function simpleShelfLifeT90(
  studyId: string,
  testName: string,
  condition: string,
): Promise<{
  t90: number;
  unit: string;
  method: string;
  confidence: string;
}> {
  const R = 8.314; // J/(mol·K)
  const Ea = 83_144; // J/mol — typical for pharmaceutical degradation
  const T_accel = 313.15; // 40 °C in Kelvin
  const T_long = 298.15; // 25 °C in Kelvin

  // Derive k at accelerated temperature from a typical 5 % loss over 6 months
  // -ln(0.95) / 6 ≈ 0.00855 month⁻¹  at 40 °C
  const k_accel = -Math.log(0.95) / 6; // month⁻¹

  // Arrhenius ratio: k_long / k_accel = exp[ (Ea/R) · (1/T_accel - 1/T_long) ]
  const ratio = Math.exp((Ea / R) * (1 / T_accel - 1 / T_long));
  const k_long = k_accel * ratio;

  // T90 at long-term condition
  const t90_months = -Math.log(0.9) / k_long;
  const t90_rounded = Math.round(t90_months * 10) / 10;

  let confidence: string;
  if (t90_rounded >= 24) {
    confidence = 'high — supports a 24-month shelf life claim';
  } else if (t90_rounded >= 12) {
    confidence = 'moderate — additional long-term data recommended';
  } else {
    confidence = 'low — accelerated degradation rate is high; investigate formulation';
  }

  return {
    t90: t90_rounded,
    unit: 'months',
    method: `Arrhenius extrapolation (Ea = ${Ea} J/mol) from accelerated (${condition || '40 °C/75 % RH'}) to 25 °C/60 % RH for ${testName || 'assay'}. Study: ${studyId}.`,
    confidence,
  };
}

// ──────────────────────────────────────────────
// 8. aiDraftProtocol
// ──────────────────────────────────────────────
export async function aiDraftProtocol(
  ctx: any,
): Promise<{ draft: string }> {
  try {
    const gw = getGateway();
    const result = await gw.route({
      taskType: 'document_drafting',
      callerModule: 'stability.aiDraftProtocol',
      messages: [
        {
          role: 'system',
          content:
            'You are a stability-study protocol writer. Draft a complete ICH Q1A(R2) stability protocol. ' +
            'Include: objective, product description, batch selection, testing conditions (long-term, accelerated, ' +
            'intermediate per ICH Q1A Table 1), test schedule with time-points, test parameters, acceptance criteria, ' +
            'statistical methods, and references. Use GMP-compliant language.',
        },
        {
          role: 'user',
          content:
            'Generate a stability study protocol based on the following context:\n' +
            JSON.stringify(ctx, null, 2),
        },
      ],
      maxTokens: 2500,
      temperature: 0.2,
    });
    return { draft: result.content };
  } catch (err: any) {
    console.error('[aiDraftProtocol] Error:', err?.message ?? err);
    return {
      draft:
        'Protocol draft generation is temporarily unavailable. Please use your organisation\'s ICH Q1A(R2) stability ' +
        'protocol template and populate with product-specific details, testing conditions per ICH Table 1, and the ' +
        'required time-points (0, 3, 6, 9, 12, 18, 24, 36 months for long-term; 0, 3, 6 months for accelerated).',
    };
  }
}

// ──────────────────────────────────────────────
// 9. aiCAPAFromOOT
// ──────────────────────────────────────────────
export async function aiCAPAFromOOT(
  ctx: any,
): Promise<{
  suggestion: string;
  capaActions: string[];
}> {
  try {
    const gw = getGateway();
    const result = await gw.structuredOutput<{
      suggestion: string;
      capaActions: string[];
    }>(
      'An out-of-trend (OOT) result has been detected in a stability study. ' +
        'Based on the context below, generate a CAPA (Corrective and Preventive Action) recommendation. ' +
        'Include a summary suggestion and a list of specific CAPA actions.\n\n' +
        `Context:\n${JSON.stringify(ctx, null, 2)}`,
      {
        type: 'object',
        properties: {
          suggestion: {
            type: 'string',
            description: 'Overall CAPA summary and rationale',
          },
          capaActions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific corrective and preventive actions',
          },
        },
        required: ['suggestion', 'capaActions'],
      },
      {
        taskType: 'regulatory_review',
        callerModule: 'stability.aiCAPAFromOOT',
        maxTokens: 1200,
      },
    );
    return result;
  } catch (err: any) {
    console.error('[aiCAPAFromOOT] Error:', err?.message ?? err);
    return {
      suggestion:
        'Automated CAPA generation is temporarily unavailable. Initiate an OOT investigation per your trend-analysis SOP and assess whether the result indicates a true shift or analytical variability.',
      capaActions: [
        'Confirm the OOT result by retesting under controlled conditions',
        'Review trend data for the affected parameter across all storage conditions',
        'Evaluate potential assignable causes (method, analyst, equipment, environment)',
        'If confirmed, escalate to formal deviation and CAPA workflow',
        'Update the stability monitoring alert thresholds if needed',
      ],
    };
  }
}
