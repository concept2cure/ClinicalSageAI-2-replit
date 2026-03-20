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

const router = Router();

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
