/**
 * Global Regulatory Intelligence (RI) REST surface.
 *
 * Deterministic, expert-level cross-market regulatory services for RA strategy:
 *   - Regional Module 1 requirements + readiness (per market).
 *   - Global review-timeline projection (per region/procedure).
 *   - Expedited/accelerated program matching (per region).
 *   - Regulatory pathway/strategy recommendation (product × markets).
 *
 * Mounted at /api/global-ri with authenticateToken applied at mount time.
 * All services are pure/deterministic over the request body.
 *
 * This file is a thin composer: each domain group lives in its own sub-router
 * under ./global-ri/, mounted at the root so every full path (e.g.
 * '/exclusivity/rules/:market') is preserved exactly.
 */

import { Router } from 'express';
import module1Router from './global-ri/module1.routes';
import timelineRouter from './global-ri/timeline.routes';
import programsRouter from './global-ri/programs.routes';
import strategyRouter from './global-ri/strategy.routes';
import feesRouter from './global-ri/fees.routes';
import labelingRouter from './global-ri/labeling.routes';
import ctaRouter from './global-ri/cta.routes';
import changesRouter from './global-ri/changes.routes';
import guidanceRouter from './global-ri/guidance.routes';
import exclusivityRouter from './global-ri/exclusivity.routes';
import dossierRouter from './global-ri/dossier.routes';
import pediatricRouter from './global-ri/pediatric.routes';
import nonclinicalRouter from './global-ri/nonclinical.routes';
import submissionFormatRouter from './global-ri/submission-format.routes';
import inspectionRouter from './global-ri/inspection.routes';
import combinationRouter from './global-ri/combination.routes';
import pharmacovigilanceRouter from './global-ri/pharmacovigilance.routes';
import disclosureRouter from './global-ri/disclosure.routes';
import relianceRouter from './global-ri/reliance.routes';
import stabilityRouter from './global-ri/stability.routes';
import lifecycleRouter from './global-ri/lifecycle.routes';
import impuritiesRouter from './global-ri/impurities.routes';
import deviceRouter from './global-ri/device.routes';
import safetyReportingRouter from './global-ri/safety-reporting.routes';
import gcpRouter from './global-ri/gcp.routes';
import gdpRouter from './global-ri/gdp.routes';
import cmcRouter from './global-ri/cmc.routes';
import bioequivalenceRouter from './global-ri/bioequivalence.routes';
import expandedAccessRouter from './global-ri/expanded-access.routes';
import advancedTherapiesRouter from './global-ri/advanced-therapies.routes';
import companionDiagnosticsRouter from './global-ri/companion-diagnostics.routes';
import promotionalComplianceRouter from './global-ri/promotional-compliance.routes';
import controlledSubstancesRouter from './global-ri/controlled-substances.routes';
import processValidationRouter from './global-ri/process-validation.routes';
import clinicalEvidenceRouter from './global-ri/clinical-evidence-standards.routes';
import establishmentRouter from './global-ri/establishment-registration.routes';
import importExportRouter from './global-ri/import-export-licensing.routes';
import catalogRouter from './global-ri/catalog.routes';

const router = Router();

router.use(module1Router);
router.use(timelineRouter);
router.use(programsRouter);
router.use(strategyRouter);
router.use(feesRouter);
router.use(labelingRouter);
router.use(ctaRouter);
router.use(changesRouter);
router.use(guidanceRouter);
router.use(exclusivityRouter);
router.use(dossierRouter);
router.use(pediatricRouter);
router.use(nonclinicalRouter);
router.use(submissionFormatRouter);
router.use(inspectionRouter);
router.use(combinationRouter);
router.use(pharmacovigilanceRouter);
router.use(disclosureRouter);
router.use(relianceRouter);
router.use(stabilityRouter);
router.use(lifecycleRouter);
router.use(impuritiesRouter);
router.use(deviceRouter);
router.use(safetyReportingRouter);
router.use(gcpRouter);
router.use(gdpRouter);
router.use(cmcRouter);
router.use(bioequivalenceRouter);
router.use(expandedAccessRouter);
router.use(advancedTherapiesRouter);
router.use(companionDiagnosticsRouter);
router.use(promotionalComplianceRouter);
router.use(controlledSubstancesRouter);
router.use(processValidationRouter);
router.use(clinicalEvidenceRouter);
router.use(establishmentRouter);
router.use(importExportRouter);
router.use(catalogRouter);

export default router;
