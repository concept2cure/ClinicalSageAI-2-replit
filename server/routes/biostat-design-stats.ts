/**
 * Biostatistics platform — design-statistics routes.
 *
 * The pure, deterministic study-design statistics endpoints (group-sequential
 * OC, assurance, multiplicity, diagnostic/MRMC/Bayesian-device sizing,
 * external-control rigor, region design rules, enrollment + event forecasting,
 * win ratio, BOIN dose finding, RMST). Extracted from biostatPlatform.ts to keep
 * that file focused; mounted back onto the same /api/biostat router. Behavior is
 * unchanged — see tests/biostat-design-stats-routes.test.ts.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  solveSpendingBoundaries,
  operatingCharacteristics,
  assurance as computeAssurance,
  discretizeNormalPrior,
  type GroupSequentialBoundaries,
  type SpendingFunction,
} from '../services/stats/group-sequential-oc';
import {
  assuranceTwoSampleMeans,
  assuranceMonteCarloTwoSampleMeans,
} from '../services/stats/assurance';
import {
  testMultiplicity,
  type MultiplicityProcedure,
} from '../services/stats/multiplicity';
import {
  sizeSingleProportion,
  sizeCoPrimarySensSpec,
} from '../services/stats/diagnostic-design';
import {
  covariateBalance,
  powerPriorBorrow,
  commensurateBorrow,
  treatmentEffect,
  tippingPointBias,
  renderExternalControlMemo,
  type CovariateInput,
} from '../services/stats/external-control';
import {
  evaluateRegionRules,
  listRegionRules,
  type Agency,
  type RegionDesignInput,
} from '../services/region-design-rules';
import {
  forecastCompletion,
  forecastEnrollmentByTime,
  forecastRetention,
  type SiteConfig,
} from '../services/stats/enrollment-forecast';
import {
  mrmcPower,
  mrmcReadersForPower,
  type MrmcInput,
} from '../services/stats/mrmc';
import {
  deviceSampleSize,
  deviceOperatingCharacteristic,
  predictiveProbabilityOfSuccess,
  powerPriorFromHistory,
  UNIFORM_PRIOR,
  type BetaPrior,
} from '../services/stats/bayesian-device';
import {
  projectEventTime,
  expectedEventsByTime,
  expectedTimeToEvents,
  type EventProjectionInput,
} from '../services/stats/event-projection';
import {
  winRatioAnalysis,
  type Subject as WinRatioSubject,
  type LevelSpec as WinRatioLevelSpec,
} from '../services/stats/win-ratio';
import {
  boinBoundaries,
  boinDecision,
  boinDecisionTable,
  selectMtd,
  type DoseLevelData,
} from '../services/stats/dose-finding-boin';
import { rmstDifference, restrictedMeanSurvival } from '../services/stats/rmst';

const router = Router();
const authMiddleware = authenticateToken;

/** Resolve the organization id from the authenticated request. */
function resolveOrganizationId(req: Request): number {
  const orgId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantContext?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

/**
 * POST /api/biostat/adaptive/oc-exact
 * Compute exact group-sequential operating characteristics by recursive
 * numerical integration (deterministic; no Monte Carlo). Either supply explicit
 * z-scale boundaries, or supply { alpha, spendingFunction } and the efficacy
 * boundaries are solved exactly from the alpha-spending function. Returns the OC
 * table over the requested drift grid, the type I error, optional assurance over
 * a normal prior on the drift, and a provenance record.
 *
 * Body: {
 *   informationFractions: number[],          // strictly increasing, last = 1
 *   efficacyBoundaries?: number[],            // optional explicit z-boundaries
 *   futilityBoundaries?: (number|null)[],     // optional, binding
 *   alpha?: number,                           // one-sided, default 0.025
 *   spendingFunction?: 'obrien-fleming'|'pocock'|'linear',
 *   driftGrid?: number[],                     // default [0,1,2,3,4]
 *   prior?: { mean: number, sd: number, nNodes?: number },
 *   grid?: { step?: number, halfWidth?: number }
 * }
 */
router.post('/adaptive/oc-exact', authMiddleware, async (req: Request, res: Response) => {
  // Authenticated + tenant-scoped like its siblings, though the computation is
  // pure math and does not read tenant data.
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }

  try {
    const body = req.body ?? {};
    const informationFractions = body.informationFractions;
    if (!Array.isArray(informationFractions) || informationFractions.length === 0 ||
        !informationFractions.every((x: unknown) => typeof x === 'number' && Number.isFinite(x))) {
      return res.status(400).json({
        success: false,
        error: 'informationFractions must be a non-empty array of numbers (strictly increasing, last = 1).',
      });
    }

    const spendingFunction: SpendingFunction = ['obrien-fleming', 'pocock', 'linear'].includes(body.spendingFunction)
      ? body.spendingFunction
      : 'obrien-fleming';
    const alpha = typeof body.alpha === 'number' ? body.alpha : 0.025;

    const grid =
      body.grid && typeof body.grid === 'object'
        ? { step: body.grid.step, halfWidth: body.grid.halfWidth }
        : {};

    // Boundaries: explicit if supplied, otherwise solved from the spending function.
    let boundaries: GroupSequentialBoundaries;
    let solved: ReturnType<typeof solveSpendingBoundaries> | null = null;
    if (Array.isArray(body.efficacyBoundaries)) {
      boundaries = {
        informationFractions,
        efficacyBoundaries: body.efficacyBoundaries,
        futilityBoundaries: body.futilityBoundaries,
      };
    } else {
      solved = solveSpendingBoundaries(informationFractions, alpha, spendingFunction, grid);
      boundaries = {
        informationFractions,
        efficacyBoundaries: solved.efficacyBoundaries,
        futilityBoundaries: body.futilityBoundaries,
      };
    }

    const driftGrid: number[] =
      Array.isArray(body.driftGrid) && body.driftGrid.length > 0 &&
      body.driftGrid.every((x: unknown) => typeof x === 'number' && Number.isFinite(x))
        ? body.driftGrid
        : [0, 1, 2, 3, 4];

    const table = operatingCharacteristics(boundaries, driftGrid, grid);

    let assuranceResult = null;
    if (body.prior && typeof body.prior === 'object' &&
        typeof body.prior.mean === 'number' && typeof body.prior.sd === 'number') {
      const priorNodes = discretizeNormalPrior(
        body.prior.mean,
        body.prior.sd,
        typeof body.prior.nNodes === 'number' ? body.prior.nNodes : 25,
      );
      assuranceResult = computeAssurance(boundaries, priorNodes, grid);
    }

    res.json({
      success: true,
      data: {
        boundaries,
        spending: solved
          ? { spendingFunction, alpha, cumulativeAlpha: solved.cumulativeAlpha, incrementalAlpha: solved.incrementalAlpha }
          : null,
        characteristics: table.characteristics,
        typeIError: table.typeIError,
        assurance: assuranceResult,
        provenance: table.provenance,
      },
    });
  } catch (error: any) {
    // Engine validation errors (bad information fractions, etc.) are client errors.
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/assurance
 * Bayesian assurance (probability of success) for a two-sample means design:
 * the power averaged over a normal prior on the standardized effect. Optionally
 * cross-checks the deterministic quadrature against a seeded Monte Carlo run.
 *
 * Body: { priorMean, priorSd, nPerArm, alpha?, oneSided?, nNodes?,
 *         monteCarlo?: { nSim?, seed? } }
 */
router.post('/assurance', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (typeof b.priorMean !== 'number' || typeof b.priorSd !== 'number' || typeof b.nPerArm !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'priorMean, priorSd and nPerArm are required numbers.',
      });
    }
    const args = {
      priorMean: b.priorMean,
      priorSd: b.priorSd,
      nPerArm: b.nPerArm,
      alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
      oneSided: typeof b.oneSided === 'boolean' ? b.oneSided : undefined,
      nNodes: typeof b.nNodes === 'number' ? b.nNodes : undefined,
    };
    const result = assuranceTwoSampleMeans(args);

    let monteCarlo = null;
    if (b.monteCarlo) {
      monteCarlo = assuranceMonteCarloTwoSampleMeans({
        ...args,
        nSim: typeof b.monteCarlo.nSim === 'number' ? b.monteCarlo.nSim : undefined,
        seed: typeof b.monteCarlo.seed === 'number' ? b.monteCarlo.seed : undefined,
      });
    }

    res.json({ success: true, data: { ...result, monteCarlo } });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/multiplicity/test
 * Apply a multiple-testing procedure to observed p-values and return which
 * hypotheses are rejected while controlling the family-wise error rate. This is
 * the decision layer complementing /multiplicity/design (which allocates alpha).
 *
 * Body: { pValues: number[], alpha: number, procedure, ids?, weights?,
 *         transitionMatrix? }
 */
router.post('/multiplicity/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const validProcedures: MultiplicityProcedure[] = [
      'bonferroni', 'weighted-bonferroni', 'holm', 'hochberg', 'fixed-sequence', 'graphical',
    ];
    if (!Array.isArray(b.pValues) || typeof b.alpha !== 'number' ||
        !validProcedures.includes(b.procedure)) {
      return res.status(400).json({
        success: false,
        error: `pValues (array), alpha (number) and procedure (one of ${validProcedures.join(', ')}) are required.`,
      });
    }
    const result = testMultiplicity({
      pValues: b.pValues,
      alpha: b.alpha,
      procedure: b.procedure,
      ids: Array.isArray(b.ids) ? b.ids : undefined,
      weights: Array.isArray(b.weights) ? b.weights : undefined,
      transitionMatrix: Array.isArray(b.transitionMatrix) ? b.transitionMatrix : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/diagnostic/sizing
 * Sample-size for a diagnostic / IVD performance study. Either a single
 * performance goal (sensitivity OR specificity vs a goal), or co-primary
 * sensitivity AND specificity translated through prevalence into total
 * enrollment. Returns both the normal-approximation and exact binomial sizes.
 *
 * Body (single):    { mode: 'single', goal, expected, alpha?, power? }
 * Body (co-primary):{ mode: 'co-primary', sensitivityGoal, sensitivityExpected,
 *                     specificityGoal, specificityExpected, prevalence,
 *                     alpha?, power?, jointPowerTarget? }
 */
router.post('/diagnostic/sizing', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (b.mode === 'co-primary') {
      const required = [
        'sensitivityGoal', 'sensitivityExpected',
        'specificityGoal', 'specificityExpected', 'prevalence',
      ];
      if (required.some(k => typeof b[k] !== 'number')) {
        return res.status(400).json({
          success: false,
          error: `co-primary mode requires numbers: ${required.join(', ')}.`,
        });
      }
      const result = sizeCoPrimarySensSpec({
        sensitivityGoal: b.sensitivityGoal,
        sensitivityExpected: b.sensitivityExpected,
        specificityGoal: b.specificityGoal,
        specificityExpected: b.specificityExpected,
        prevalence: b.prevalence,
        alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
        power: typeof b.power === 'number' ? b.power : undefined,
        jointPowerTarget: typeof b.jointPowerTarget === 'number' ? b.jointPowerTarget : undefined,
      });
      return res.json({ success: true, data: result });
    }

    if (typeof b.goal !== 'number' || typeof b.expected !== 'number') {
      return res.status(400).json({
        success: false,
        error: "single mode requires numeric 'goal' and 'expected'.",
      });
    }
    const result = sizeSingleProportion({
      goal: b.goal,
      expected: b.expected,
      alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
      power: typeof b.power === 'number' ? b.power : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/external-control/sensitivity
 * External-control rigor: borrow a historical control (power prior or
 * commensurate prior), estimate the treatment effect, run a bias tipping-point
 * sensitivity, optionally assess covariate balance, and render a regulatory
 * memo. Deterministic and reproducible.
 *
 * Body: { endpoint, meanT, seT, meanC, seC, nC, meanH, seH, nH,
 *         method: 'power-prior' | 'commensurate', a0?, tau2?, alpha?,
 *         covariates?: CovariateInput[] }
 */
router.post('/external-control/sensitivity', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const numeric = ['meanT', 'seT', 'meanC', 'seC', 'nC', 'meanH', 'seH', 'nH'];
    if (numeric.some(k => typeof b[k] !== 'number') || typeof b.endpoint !== 'string') {
      return res.status(400).json({
        success: false,
        error: `endpoint (string) and numbers ${numeric.join(', ')} are required.`,
      });
    }
    const method = b.method === 'commensurate' ? 'commensurate' : 'power-prior';
    const alpha = typeof b.alpha === 'number' ? b.alpha : 0.05;
    const summary = { meanC: b.meanC, seC: b.seC, nC: b.nC, meanH: b.meanH, seH: b.seH, nH: b.nH };

    const a0 = typeof b.a0 === 'number' ? b.a0 : 1;
    const tau2 = typeof b.tau2 === 'number' ? b.tau2 : 0;
    const control = method === 'commensurate'
      ? commensurateBorrow({ ...summary, tau2 })
      : powerPriorBorrow({ ...summary, a0 });

    const effect = treatmentEffect(b.meanT, b.seT, control, alpha);
    // The bias tipping-point uses the power-prior path with the active a0.
    const tipping = tippingPointBias({ ...summary, meanT: b.meanT, seT: b.seT, a0, alpha });
    const balance = Array.isArray(b.covariates) && b.covariates.length > 0
      ? covariateBalance(b.covariates as CovariateInput[])
      : undefined;

    const memo = renderExternalControlMemo({
      endpoint: b.endpoint,
      borrowingMethod: method,
      borrowingParam: method === 'commensurate' ? tau2 : a0,
      control,
      effect,
      balance,
      tipping,
    });

    res.json({ success: true, data: { control, effect, tipping, balance, memo } });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/region-rules/evaluate
 * Evaluate a study design against region-specific design rules for the targeted
 * agencies (PMDA / MHRA / NMPA / Swissmedic / ANVISA / FDA / EMA): bridging and
 * ethnic sensitivity (ICH E5), MRCT consistency (ICH E17), local-subject data,
 * QT in the regional population, post-Brexit UK separation, Project Orbis
 * eligibility, FDA diversity plan. Returns structured findings + recommendations.
 *
 * Body: a RegionDesignInput (targetAgencies required).
 */
router.post('/region-rules/evaluate', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (!Array.isArray(b.targetAgencies) || b.targetAgencies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'targetAgencies (non-empty array) is required.',
      });
    }
    const result = evaluateRegionRules(b as RegionDesignInput);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/region-rules/catalog?agency=PMDA
 * Retrieve the region design-rule catalog with guidance citations, optionally
 * filtered to one agency.
 */
router.get('/region-rules/catalog', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const agency = req.query.agency as Agency | undefined;
    res.json({ success: true, data: listRegionRules(agency) });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/enrollment/forecast
 * Poisson–Gamma (Anisimov) enrollment forecast. Either time-to-target
 * (`targetN`) or enrollment-by-time (`time`), each with an 80% prediction
 * interval; optionally a retention forecast under exponential dropout.
 *
 * Body: { sites: SiteConfig[], targetN?, time?, seed?, nSim?,
 *         retention?: { dropoutRatePerUnit, atTime, conf? } }
 */
router.post('/enrollment/forecast', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (!Array.isArray(b.sites) || b.sites.length === 0) {
      return res.status(400).json({ success: false, error: 'sites (non-empty array) is required.' });
    }
    const sites = b.sites as SiteConfig[];
    const seed = typeof b.seed === 'number' ? b.seed : undefined;
    const nSim = typeof b.nSim === 'number' ? b.nSim : undefined;

    const data: Record<string, unknown> = {};
    if (typeof b.targetN === 'number') {
      data.completion = forecastCompletion({ sites, targetN: b.targetN, nSim, seed });
    }
    if (typeof b.time === 'number') {
      data.byTime = forecastEnrollmentByTime({ sites, time: b.time, nSim, seed });
    }
    if (b.retention && typeof b.retention.dropoutRatePerUnit === 'number'
        && typeof b.retention.atTime === 'number') {
      const enrolled = typeof b.targetN === 'number'
        ? b.targetN
        : (data.byTime as { expected: number } | undefined)?.expected ?? 0;
      data.retention = forecastRetention({
        nEnrolled: Math.round(enrolled),
        dropoutRatePerUnit: b.retention.dropoutRatePerUnit,
        atTime: b.retention.atTime,
        conf: typeof b.retention.conf === 'number' ? b.retention.conf : undefined,
      });
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: "provide 'targetN' and/or 'time'." });
    }
    res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/diagnostic/mrmc
 * Multireader-multicase (Obuchowski–Rockette) reader-study sizing for a
 * two-modality figure-of-merit (e.g. AUC) comparison. Either the power at a
 * given number of readers, or the smallest reader count for a target power.
 *
 * Body: { aucDifference, varTR, varError, cov1, cov2, cov3, alpha?, ddf?,
 *         nReaders? , targetPower?, maxReaders? }
 */
router.post('/diagnostic/mrmc', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const required = ['aucDifference', 'varTR', 'varError', 'cov1', 'cov2', 'cov3'];
    if (required.some(k => typeof b[k] !== 'number')) {
      return res.status(400).json({
        success: false,
        error: `numbers required: ${required.join(', ')}.`,
      });
    }
    const common = {
      aucDifference: b.aucDifference,
      varTR: b.varTR,
      varError: b.varError,
      cov1: b.cov1,
      cov2: b.cov2,
      cov3: b.cov3,
      alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
      ddf: typeof b.ddf === 'number' ? b.ddf : undefined,
    };
    if (typeof b.targetPower === 'number') {
      const data = mrmcReadersForPower({
        ...common,
        targetPower: b.targetPower,
        maxReaders: typeof b.maxReaders === 'number' ? b.maxReaders : undefined,
      });
      return res.json({ success: true, data });
    }
    if (typeof b.nReaders === 'number') {
      const data = mrmcPower({ ...common, nReaders: b.nReaders } as MrmcInput);
      return res.json({ success: true, data });
    }
    return res.status(400).json({ success: false, error: "provide 'nReaders' or 'targetPower'." });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/diagnostic/bayesian-device
 * Bayesian device-pivotal (binary endpoint) templates: P(θ>goal|data) ≥
 * threshold success rule with a Beta prior (optionally informative via a power
 * prior on historical successes/failures). Modes: 'sample-size', 'oc',
 * 'predictive'. Exact (Beta–Binomial).
 *
 * Body: { mode, goal, successThreshold, prior? | history?{successes,failures,a0},
 *         ... mode-specific fields }
 */
router.post('/diagnostic/bayesian-device', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (typeof b.goal !== 'number' || typeof b.successThreshold !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'numeric goal and successThreshold are required.',
      });
    }
    let prior: BetaPrior = UNIFORM_PRIOR;
    if (b.history && typeof b.history.successes === 'number' && typeof b.history.failures === 'number') {
      prior = powerPriorFromHistory(b.history.successes, b.history.failures,
        typeof b.history.a0 === 'number' ? b.history.a0 : 1);
    } else if (b.prior && typeof b.prior.alpha === 'number' && typeof b.prior.beta === 'number') {
      prior = { alpha: b.prior.alpha, beta: b.prior.beta };
    }

    if (b.mode === 'oc') {
      if (typeof b.n !== 'number' || typeof b.trueRate !== 'number') {
        return res.status(400).json({ success: false, error: "oc mode requires 'n' and 'trueRate'." });
      }
      return res.json({ success: true, data: deviceOperatingCharacteristic({
        n: b.n, goal: b.goal, prior, successThreshold: b.successThreshold, trueRate: b.trueRate,
      }) });
    }
    if (b.mode === 'predictive') {
      if (['xInterim', 'nInterim', 'nFinal'].some(k => typeof b[k] !== 'number')) {
        return res.status(400).json({ success: false, error: "predictive mode requires xInterim, nInterim, nFinal." });
      }
      return res.json({ success: true, data: predictiveProbabilityOfSuccess({
        xInterim: b.xInterim, nInterim: b.nInterim, nFinal: b.nFinal,
        goal: b.goal, prior, successThreshold: b.successThreshold,
      }) });
    }
    // Default: sample-size.
    if (typeof b.expected !== 'number' || typeof b.targetPower !== 'number') {
      return res.status(400).json({ success: false, error: "sample-size mode requires 'expected' and 'targetPower'." });
    }
    return res.json({ success: true, data: deviceSampleSize({
      goal: b.goal, expected: b.expected, prior, successThreshold: b.successThreshold,
      targetPower: b.targetPower, maxTypeI: typeof b.maxTypeI === 'number' ? b.maxTypeI : undefined,
    }) });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/adaptive/event-projection
 * Forecast the calendar time at which an event-driven (time-to-event) trial
 * reaches a target number of events — the timing that schedules interim/DMC and
 * final analyses. Uniform accrual + exponential event/dropout; exact expected
 * curve plus a seeded Monte Carlo 80% prediction interval.
 *
 * Body: { accrualRate, accrualPeriod, medianControl, hazardRatio, targetEvents,
 *         allocationRatio?, dropoutHazard?, atTime?, seed?, nSim? }
 */
router.post('/adaptive/event-projection', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const required = ['accrualRate', 'accrualPeriod', 'medianControl', 'hazardRatio', 'targetEvents'];
    if (required.some(k => typeof b[k] !== 'number')) {
      return res.status(400).json({ success: false, error: `numbers required: ${required.join(', ')}.` });
    }
    const input: EventProjectionInput = {
      accrualRate: b.accrualRate,
      accrualPeriod: b.accrualPeriod,
      medianControl: b.medianControl,
      hazardRatio: b.hazardRatio,
      targetEvents: b.targetEvents,
      allocationRatio: typeof b.allocationRatio === 'number' ? b.allocationRatio : undefined,
      dropoutHazard: typeof b.dropoutHazard === 'number' ? b.dropoutHazard : undefined,
    };
    const forecast = projectEventTime({
      ...input,
      nSim: typeof b.nSim === 'number' ? b.nSim : undefined,
      seed: typeof b.seed === 'number' ? b.seed : undefined,
    });
    const data: Record<string, unknown> = {
      forecast,
      expectedTimeToTarget: expectedTimeToEvents(input),
    };
    if (typeof b.atTime === 'number') {
      data.expectedEventsAtTime = expectedEventsByTime(input, b.atTime);
    }
    res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/win-ratio
 * Win ratio + Finkelstein–Schoenfeld analysis of a hierarchical composite
 * endpoint. Each treatment subject is compared with each control subject down a
 * prioritized hierarchy (e.g. time to death, then HF hospitalization, then a
 * biomarker). Returns wins/losses/ties, win ratio + CI, win odds, net benefit,
 * and the FS test.
 *
 * Body: { treatment: Subject[], control: Subject[], hierarchy: LevelSpec[], confLevel? }
 *   Subject = { levels: { value, event? }[] }
 *   LevelSpec = { type: 'continuous'|'tte', direction: 'higher-better'|'lower-better' }
 */
router.post('/win-ratio', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (!Array.isArray(b.treatment) || !Array.isArray(b.control) || !Array.isArray(b.hierarchy)) {
      return res.status(400).json({
        success: false,
        error: 'treatment, control (Subject arrays) and hierarchy (LevelSpec array) are required.',
      });
    }
    const result = winRatioAnalysis(
      b.treatment as WinRatioSubject[],
      b.control as WinRatioSubject[],
      b.hierarchy as WinRatioLevelSpec[],
      typeof b.confLevel === 'number' ? b.confLevel : undefined,
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/dose-finding/boin
 * BOIN (Bayesian Optimal Interval) phase 1 dose finding. Modes:
 *  - 'boundaries' — λ_e/λ_d for a target (+ optional decision table over cohort sizes),
 *  - 'decision'   — next action at the current dose given n / DLTs,
 *  - 'select-mtd' — MTD via isotonic regression over the dose levels.
 *
 * Body: { mode, target, phi1?, phi2?, ... mode-specific fields }
 */
router.post('/dose-finding/boin', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (typeof b.target !== 'number') {
      return res.status(400).json({ success: false, error: 'numeric target is required.' });
    }
    if (b.mode === 'decision') {
      if (typeof b.nPatients !== 'number' || typeof b.nDlt !== 'number') {
        return res.status(400).json({ success: false, error: "decision mode requires 'nPatients' and 'nDlt'." });
      }
      return res.json({ success: true, data: boinDecision({
        nPatients: b.nPatients, nDlt: b.nDlt, target: b.target, phi1: b.phi1, phi2: b.phi2,
        eliminationThreshold: b.eliminationThreshold, minEliminationN: b.minEliminationN,
      }) });
    }
    if (b.mode === 'select-mtd') {
      if (!Array.isArray(b.doses)) {
        return res.status(400).json({ success: false, error: "select-mtd mode requires a 'doses' array." });
      }
      return res.json({ success: true, data: selectMtd(b.doses as DoseLevelData[], b.target) });
    }
    // Default: boundaries (+ optional decision table).
    const data: Record<string, unknown> = { boundaries: boinBoundaries(b.target, b.phi1, b.phi2) };
    if (Array.isArray(b.cohortSizes)) {
      data.decisionTable = boinDecisionTable(b.target, b.cohortSizes, b.phi1, b.phi2);
    }
    res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/survival/rmst
 * Restricted mean survival time (RMST) at horizon τ — a model-free treatment
 * effect that stays interpretable when proportional hazards fails. With both
 * arms returns the RMST difference + z test + CI; with one arm returns the
 * single-arm RMST and variance.
 *
 * Body: { tau, confLevel?, treatment:{times[],events[]}, control?:{times[],events[]} }
 */
router.post('/survival/rmst', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const okArm = (a: any) => a && Array.isArray(a.times) && Array.isArray(a.events);
    if (typeof b.tau !== 'number' || !okArm(b.treatment)) {
      return res.status(400).json({
        success: false,
        error: 'numeric tau and treatment {times[], events[]} are required.',
      });
    }
    if (okArm(b.control)) {
      return res.json({ success: true, data: rmstDifference(
        b.treatment, b.control, b.tau,
        typeof b.confLevel === 'number' ? b.confLevel : undefined,
      ) });
    }
    return res.json({ success: true, data: restrictedMeanSurvival(
      b.treatment.times, b.treatment.events, b.tau,
    ) });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
