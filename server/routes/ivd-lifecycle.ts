/**
 * IVD lifecycle calculators — mounted at /api/ivd-lifecycle.
 *
 * Thin stateless wrappers exposing the deterministic engines built to close the
 * lifecycle audit gaps. Each endpoint takes the engine's input object as the
 * JSON body and returns the engine's result. Engines validate their own inputs
 * and throw on malformed data (surfaced as 422).
 *
 *   Analytical performance
 *     POST /stability/real-time          POST /stability/accelerated
 *     POST /carryover                     POST /hook-effect
 *     POST /recovery                      POST /cutoff
 *     POST /traceability                  (ISO 17511)
 *   Clinical / scientific
 *     POST /scientific-validity
 *   Software
 *     POST /software/safety-class         POST /software/sdlc
 *     POST /software/sbom                 POST /software/cybersecurity
 *   Change management
 *     POST /change/fda-510k               POST /change/eu-significant
 *   Manufacturing
 *     POST /process-validation            POST /process-capability
 *     POST /lot-release
 *   Surveillance
 *     POST /signal/disproportionality
 *   Post-market authoring
 *     POST /authoring/emdr  /mir  /fsn  /psur
 *   Registration / market access
 *     POST /registration/fda  /eu         POST /declaration-of-conformity
 *     GET  /pathways  POST /pathways/readiness
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import {
  assessRealTimeStability, assessAcceleratedStability, assessCarryover,
  assessHookEffect, assessRecovery, determineCutoff,
} from '../services/stats/analytical-performance-extensions';
import { assessTraceability } from '../services/regulatory/iso-17511-traceability';
import { assessScientificValidity } from '../services/regulatory/scientific-validity';
import {
  classifySoftwareSafety, assessSdlcCompleteness, assessSbom, assessCybersecurity,
} from '../services/regulatory/iec-62304-software';
import { assessFdaChange, assessEuSignificantChange } from '../services/regulatory/change-assessment';
import {
  assessProcessValidation, computeProcessCapability, evaluateLotRelease,
} from '../services/regulatory/process-validation';
import { computeDisproportionality } from '../services/stats/signal-disproportionality';
import { buildEmdr, buildMir, buildFsn, buildPsur } from '../services/postmarket/report-authoring';
import {
  assessFdaRegistration, assessEuRegistration, generateDeclarationOfConformity,
} from '../services/regulatory/registration-listing';
import {
  assessPathwayReadiness, listPathways, type Jurisdiction,
} from '../services/regulatory/global-pathways';
import { classifyIvdrAnnexVIII } from '../services/regulatory/ivdr-classification';
import { pairCompanionDiagnostic } from '../services/regulatory/cdx-pairing';
import { designIvdStudyProgram } from '../services/regulatory/cdx-study-design';
import { simulateIvdReview } from '../services/regulatory/reviewer-simulation-ivd';
import { knowledgeFor, type LifecycleConcept } from '../services/ivd-knowledge/links';

const router = Router();
router.use(authenticateToken);

/** Wrap a pure engine so thrown validation errors become 422s. */
function calc<TIn, TOut>(fn: (input: TIn) => TOut) {
  return (req: Request, res: Response) => {
    try {
      res.json(fn(req.body as TIn));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid input';
      res.status(422).json({ error: msg });
    }
  };
}

/**
 * Like `calc`, but attaches citable knowledge-base entries for the given
 * lifecycle concept to the (object) result under `knowledge` — wiring the
 * corpus into the engine outputs without coupling the pure engines to it.
 */
function calcK<TIn, TOut extends object>(fn: (input: TIn) => TOut, concept: LifecycleConcept) {
  return (req: Request, res: Response) => {
    try {
      const out = fn(req.body as TIn);
      res.json({ ...out, knowledge: knowledgeFor(concept) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid input';
      res.status(422).json({ error: msg });
    }
  };
}

// ── IVDR Annex VIII classification (knowledge-enriched) ─────────────────────
router.post('/classify/ivdr', (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (typeof b.intendedPurpose !== 'string' || b.intendedPurpose.trim().length === 0) {
    return res.status(422).json({ error: 'intendedPurpose is required' });
  }
  const result = classifyIvdrAnnexVIII(b);
  res.json({ ...result, knowledge: knowledgeFor(result.knowledgeRefs) });
});

// ── Companion-diagnostic pairing (biomarker-knowledge-aware) ────────────────
router.post('/cdx/pair', (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (typeof b.biomarker !== 'string' || b.biomarker.trim().length === 0) {
    return res.status(422).json({ error: 'biomarker is required' });
  }
  const result = pairCompanionDiagnostic(b);
  res.json({ ...result, knowledge: knowledgeFor(result.knowledgeRefs) });
});

// ── IVD study-program designer (analytical + clinical, citation-grounded) ────
router.post('/study-design', (req: Request, res: Response) => {
  const b = req.body ?? {};
  const ASSAY = ['quantitative', 'qualitative', 'ihc', 'ngs', 'molecular'];
  const USE = ['cdx', 'screening', 'diagnosis', 'monitoring', 'aid_to_diagnosis'];
  if (!ASSAY.includes(b.assayType)) {
    return res.status(422).json({ error: `assayType must be one of: ${ASSAY.join(', ')}` });
  }
  if (!USE.includes(b.intendedUse)) {
    return res.status(422).json({ error: `intendedUse must be one of: ${USE.join(', ')}` });
  }
  res.json(designIvdStudyProgram(b));
});

// ── Reviewer simulation (mock FDA / notified-body deficiencies) ─────────────
router.post('/review-simulation', (req: Request, res: Response) => {
  const b = req.body ?? {};
  const PATHWAYS = ['510k', 'de_novo', 'pma', 'eu_ivdr'];
  const ASSAY = ['quantitative', 'qualitative', 'ihc', 'ngs', 'molecular'];
  if (!PATHWAYS.includes(b.pathway)) {
    return res.status(422).json({ error: `pathway must be one of: ${PATHWAYS.join(', ')}` });
  }
  if (!ASSAY.includes(b.assayType)) {
    return res.status(422).json({ error: `assayType must be one of: ${ASSAY.join(', ')}` });
  }
  res.json(simulateIvdReview(b));
});

// ── Analytical performance ──────────────────────────────────────────────────
router.post('/stability/real-time', calcK(assessRealTimeStability, 'analytical.stability'));
router.post('/stability/accelerated', calcK(assessAcceleratedStability, 'analytical.stability'));
router.post('/carryover', calcK(assessCarryover, 'analytical.carryover'));
router.post('/hook-effect', calcK(assessHookEffect, 'analytical.hook-effect'));
router.post('/recovery', calcK(assessRecovery, 'analytical.recovery'));
router.post('/cutoff', calcK((b: { observations: Parameters<typeof determineCutoff>[0] }) => determineCutoff(b.observations), 'analytical.cutoff'));
router.post('/traceability', calcK(assessTraceability, 'analytical.traceability'));

// ── Scientific validity ─────────────────────────────────────────────────────
router.post('/scientific-validity', calcK(assessScientificValidity, 'scientific-validity'));

// ── Software (IEC 62304 / cybersecurity) ────────────────────────────────────
router.post('/software/safety-class', calcK(classifySoftwareSafety, 'software.safety-class'));
router.post('/software/sdlc', calcK((b: { safetyClass: 'A' | 'B' | 'C'; present: Parameters<typeof assessSdlcCompleteness>[1] }) =>
  assessSdlcCompleteness(b.safetyClass, b.present ?? []), 'software.sdlc'));
router.post('/software/sbom', calc((b: { components: Parameters<typeof assessSbom>[0] }) => assessSbom(b.components ?? [])));
router.post('/software/cybersecurity', calcK((b: { present: Parameters<typeof assessCybersecurity>[0] }) => assessCybersecurity(b.present ?? []), 'software.cybersecurity'));

// ── Change management ───────────────────────────────────────────────────────
router.post('/change/fda-510k', calcK(assessFdaChange, 'change.fda-510k'));
router.post('/change/eu-significant', calcK(assessEuSignificantChange, 'change.eu-significant'));

// ── Manufacturing ───────────────────────────────────────────────────────────
router.post('/process-validation', calcK((b: { stages: Parameters<typeof assessProcessValidation>[0] }) => assessProcessValidation(b.stages ?? []), 'process-validation'));
router.post('/process-capability', calc(computeProcessCapability));
router.post('/lot-release', calc(evaluateLotRelease));

// ── Surveillance signal detection ───────────────────────────────────────────
router.post('/signal/disproportionality', calcK(computeDisproportionality, 'signal.disproportionality'));

// ── Post-market authoring ───────────────────────────────────────────────────
router.post('/authoring/emdr', calcK(buildEmdr, 'authoring.emdr'));
router.post('/authoring/mir', calcK(buildMir, 'authoring.mir'));
router.post('/authoring/fsn', calcK(buildFsn, 'authoring.fsn'));
router.post('/authoring/psur', calcK(buildPsur, 'authoring.psur'));

// ── Registration / market access ────────────────────────────────────────────
router.post('/registration/fda', calcK(assessFdaRegistration, 'registration.fda'));
router.post('/registration/eu', calcK(assessEuRegistration, 'registration.eu'));
router.post('/declaration-of-conformity', calcK(generateDeclarationOfConformity, 'declaration-of-conformity'));
router.get('/pathways', (_req, res) => res.json({ pathways: listPathways() }));
router.post('/pathways/readiness', calc((b: { jurisdiction: Jurisdiction; availableDocuments: string[] }) =>
  assessPathwayReadiness(b.jurisdiction, b.availableDocuments ?? [])));

export default router;
