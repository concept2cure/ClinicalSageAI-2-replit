/**
 * Safety Narrative Service — API Routes
 *
 * RESTful endpoints for generating regulatory-grade safety narratives:
 * - Aggregate safety narratives (ICH E3 Section 12)
 * - Individual SAE case narratives
 * - Benefit-risk assessment summaries (FDA/EMA frameworks)
 * - Safety signal assessment summaries (CIOMS/ICH E2E)
 * - Cross-study integrated safety summaries
 */

import { Router, Request, Response } from 'express';
import { safetyNarrativeService } from '../services/safety-narrative-service';
import { pool } from '../db';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /cases — the org's individual SAE case worklist (expedited-reporting
 * clock + subject/event facts), shaped to exactly the keys the v2
 * SafetyNarrative surface renders. The surface adopts this via liveGet and
 * falls back to its codebase fixture (with a Sample pill) when the store is
 * empty or unreachable, then runs the deterministic ICH E3 §16 composer over
 * whichever case is selected. Ordered by clock urgency. Fails closed to an
 * empty list on 42P01 so an unprovisioned store never 500s.
 */
router.get('/cases', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, due, clock, due_days, subject_id, age, sex, study_id,
              treatment_arm, study_drug, dose, first_dose_date,
              medical_history, concomitant_meds, event
         FROM c2c_sae_cases
        WHERE organization_id = $1
        ORDER BY due_days ASC, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      due: r.due,
      clock: r.clock,
      dueDays: r.due_days,
      subjectId: r.subject_id,
      age: r.age ?? undefined,
      sex: r.sex ?? undefined,
      studyId: r.study_id ?? undefined,
      treatmentArm: r.treatment_arm ?? undefined,
      studyDrug: r.study_drug ?? undefined,
      dose: r.dose ?? undefined,
      firstDoseDate: r.first_dose_date ?? undefined,
      medicalHistory: Array.isArray(r.medical_history) ? r.medical_history : [],
      concomitantMeds: Array.isArray(r.concomitant_meds) ? r.concomitant_meds : [],
      event: r.event ?? {},
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read SAE cases.' } });
  }
});

// ── Aggregate Safety Narrative ───────────────────────────────

/**
 * POST /api/safety-narratives/aggregate
 * Generate an ICH E3 Section 12 aggregate safety narrative
 */
router.post('/aggregate', async (req: Request, res: Response) => {
  try {
    const {
      studyId, studyTitle, indication, treatmentArms,
      teaeData, saeData, deaths, discontinuationsDueToAE,
      labFindings, narrativeType,
    } = req.body;

    if (!studyId || !studyTitle || !indication || !treatmentArms || !narrativeType) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: studyId, studyTitle, indication, treatmentArms, narrativeType',
      });
    }

    const result = await safetyNarrativeService.generateAggregateSafetyNarrative({
      studyId,
      studyTitle,
      indication,
      treatmentArms: treatmentArms || [],
      teaeData: teaeData || [],
      saeData: saeData || [],
      deaths: deaths || [],
      discontinuationsDueToAE: discontinuationsDueToAE || {},
      labFindings,
      narrativeType,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Aggregate safety narrative error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Individual SAE Narrative ─────────────────────────────────

/**
 * POST /api/safety-narratives/sae
 * Generate an individual SAE case narrative
 */
router.post('/sae', async (req: Request, res: Response) => {
  try {
    const {
      caseId, patientAge, patientSex, relevantMedicalHistory,
      treatmentArm, drugName, dose, eventTerm, eventDescription,
      onsetDate, onsetStudyDay, seriousnessCriteria, severity,
      actionTaken, outcome, causalityAssessment,
      rechallenge, dechallenge, concomitantMedications, relevantLabValues,
    } = req.body;

    if (!caseId || !eventTerm || !drugName) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: caseId, eventTerm, drugName',
      });
    }

    const narrative = await safetyNarrativeService.generateSAENarrative({
      caseId,
      patientAge: patientAge || 0,
      patientSex: patientSex || 'Unknown',
      relevantMedicalHistory: relevantMedicalHistory || [],
      treatmentArm: treatmentArm || 'Unknown',
      drugName,
      dose: dose || 'Not specified',
      eventTerm,
      eventDescription: eventDescription || '',
      onsetDate: onsetDate || 'Unknown',
      onsetStudyDay: onsetStudyDay || 0,
      seriousnessCriteria: seriousnessCriteria || [],
      severity: severity || 'Unknown',
      actionTaken: actionTaken || 'unknown',
      outcome: outcome || 'unknown',
      causalityAssessment: causalityAssessment || 'Not assessed',
      rechallenge,
      dechallenge,
      concomitantMedications,
      relevantLabValues,
    });

    res.json({
      success: true,
      data: {
        caseId,
        narrative,
        wordCount: narrative.split(/\s+/).length,
      },
    });
  } catch (error: any) {
    console.error('SAE narrative error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Benefit-Risk Assessment ──────────────────────────────────

/**
 * POST /api/safety-narratives/benefit-risk
 * Generate a benefit-risk assessment narrative (FDA/EMA BRAT framework)
 */
router.post('/benefit-risk', async (req: Request, res: Response) => {
  try {
    const { indication, treatmentName, efficacySummary, safetySummary, context } = req.body;

    if (!indication || !treatmentName || !efficacySummary || !safetySummary) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: indication, treatmentName, efficacySummary, safetySummary',
      });
    }

    const result = await safetyNarrativeService.generateBenefitRiskSummary({
      indication,
      treatmentName,
      efficacySummary,
      safetySummary,
      context: context || { availableTherapies: [], diseaseSeverity: 'moderate', patientPopulation: 'adults' },
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Benefit-risk narrative error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Safety Signal Assessment ─────────────────────────────────

/**
 * POST /api/safety-narratives/signal-summary
 * Generate a signal assessment summary for PSUR/PBRER
 */
router.post('/signal-summary', async (req: Request, res: Response) => {
  try {
    const { signals } = req.body;

    if (!Array.isArray(signals)) {
      return res.status(400).json({
        success: false,
        error: 'Required field: signals (array of SignalData)',
      });
    }

    const narrative = await safetyNarrativeService.generateSignalSummary(signals);

    res.json({
      success: true,
      data: {
        narrative,
        signalCount: signals.length,
        wordCount: narrative.split(/\s+/).length,
      },
    });
  } catch (error: any) {
    console.error('Signal summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Cross-Study Safety Comparison ────────────────────────────

/**
 * POST /api/safety-narratives/cross-study
 * Generate an integrated cross-study safety summary for IB/ISS
 */
router.post('/cross-study', async (req: Request, res: Response) => {
  try {
    const { studies } = req.body;

    if (!Array.isArray(studies) || studies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Required field: studies (non-empty array of CrossStudySafetyInput)',
      });
    }

    const narrative = await safetyNarrativeService.generateCrossStudySafetySummary(studies);

    res.json({
      success: true,
      data: {
        narrative,
        studyCount: studies.length,
        wordCount: narrative.split(/\s+/).length,
      },
    });
  } catch (error: any) {
    console.error('Cross-study safety summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
