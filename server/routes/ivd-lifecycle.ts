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

// ── Analytical performance ──────────────────────────────────────────────────
router.post('/stability/real-time', calc(assessRealTimeStability));
router.post('/stability/accelerated', calc(assessAcceleratedStability));
router.post('/carryover', calc(assessCarryover));
router.post('/hook-effect', calc(assessHookEffect));
router.post('/recovery', calc(assessRecovery));
router.post('/cutoff', calc((b: { observations: Parameters<typeof determineCutoff>[0] }) => determineCutoff(b.observations)));
router.post('/traceability', calc(assessTraceability));

// ── Scientific validity ─────────────────────────────────────────────────────
router.post('/scientific-validity', calc(assessScientificValidity));

// ── Software (IEC 62304 / cybersecurity) ────────────────────────────────────
router.post('/software/safety-class', calc(classifySoftwareSafety));
router.post('/software/sdlc', calc((b: { safetyClass: 'A' | 'B' | 'C'; present: Parameters<typeof assessSdlcCompleteness>[1] }) =>
  assessSdlcCompleteness(b.safetyClass, b.present ?? [])));
router.post('/software/sbom', calc((b: { components: Parameters<typeof assessSbom>[0] }) => assessSbom(b.components ?? [])));
router.post('/software/cybersecurity', calc((b: { present: Parameters<typeof assessCybersecurity>[0] }) => assessCybersecurity(b.present ?? [])));

// ── Change management ───────────────────────────────────────────────────────
router.post('/change/fda-510k', calc(assessFdaChange));
router.post('/change/eu-significant', calc(assessEuSignificantChange));

// ── Manufacturing ───────────────────────────────────────────────────────────
router.post('/process-validation', calc((b: { stages: Parameters<typeof assessProcessValidation>[0] }) => assessProcessValidation(b.stages ?? [])));
router.post('/process-capability', calc(computeProcessCapability));
router.post('/lot-release', calc(evaluateLotRelease));

// ── Surveillance signal detection ───────────────────────────────────────────
router.post('/signal/disproportionality', calc(computeDisproportionality));

// ── Post-market authoring ───────────────────────────────────────────────────
router.post('/authoring/emdr', calc(buildEmdr));
router.post('/authoring/mir', calc(buildMir));
router.post('/authoring/fsn', calc(buildFsn));
router.post('/authoring/psur', calc(buildPsur));

// ── Registration / market access ────────────────────────────────────────────
router.post('/registration/fda', calc(assessFdaRegistration));
router.post('/registration/eu', calc(assessEuRegistration));
router.post('/declaration-of-conformity', calc(generateDeclarationOfConformity));
router.get('/pathways', (_req, res) => res.json({ pathways: listPathways() }));
router.post('/pathways/readiness', calc((b: { jurisdiction: Jurisdiction; availableDocuments: string[] }) =>
  assessPathwayReadiness(b.jurisdiction, b.availableDocuments ?? [])));

export default router;
