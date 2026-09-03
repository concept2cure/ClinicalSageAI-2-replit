/**
 * Insights HTTP endpoints (Report-OS, Step 6).
 *
 * Thin, defensive Express handlers over the pure prediction-assembler, the
 * calibration/freshness rollups, and the subscription service. Every handler is
 * org-scoped off the verified JWT (`authedOrgId`), wrapped in try/catch, and
 * never throws out of the router. The prediction endpoint stays pure-ish: it
 * accepts a normalized `PredictionInput` in the body rather than invoking the
 * heavy model services directly, so the route does no model IO.
 *
 * Mounted at `/api/insights` (see `server/bootstrap/register-inline-routes.ts`).
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';
import { authedOrgId } from '../utils/authedOrgId';
import {
  summarizeQuality,
  freshnessRollup,
} from '../services/report-os/quality/calibration';
import type { PredictionOutcome } from '../services/report-os/quality/types';
import {
  assemblePredictionReport,
  assertHasDisclosure,
  type PredictionReportMeta,
} from '../services/report-os/prediction/assembler';
import type { PredictionInput } from '../services/report-os/prediction/types';
import {
  readinessTwinToTrajectoryInput,
  runDeficiencyRiskForDraft,
} from '../services/report-os/prediction/model-adapters';
import { requireReportEntitlement } from '../services/report-os/entitlement-map';
import { REPORT_TYPE_SEED } from '../services/report-os/taxonomy';
import {
  createSubscription,
  listSubscriptions,
  setEnabled,
} from '../services/report-os/scheduling/subscription-service';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

/** typeId + human label for each live prediction kind, sourced from the seed. */
const PREDICTION_KIND_TO_TYPE: Record<string, { typeId: string; label: string }> = {
  regulatory_forecast: {
    typeId: 'prediction.regulatory_forecast',
    label:
      REPORT_TYPE_SEED.find((t) => t.typeId === 'prediction.regulatory_forecast')?.label ??
      'Predictive Regulatory Forecast',
  },
  crl_rtf_premortem: {
    typeId: 'prediction.crl_rtf_premortem',
    label:
      REPORT_TYPE_SEED.find((t) => t.typeId === 'prediction.crl_rtf_premortem')?.label ??
      'CRL / RTF Pre-Mortem',
  },
};

const router = Router();

const logger = createScopedLogger('report-os-insights');
router.use(authMiddleware);

/** Roles allowed to read the cross-prediction calibration / quality view. */
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function isAdmin(req: Request): boolean {
  const role = String(
    (req as any).user?.role ?? (req as any).userRole ?? ''
  ).toLowerCase();
  return ADMIN_ROLES.has(role);
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const predictionOutcomeSchema = z.object({
  predicted: z.number(),
  actual: z.union([z.literal(0), z.literal(1)]),
});

const freshnessProviderSchema = z.object({
  provider: z.string().min(1),
  observedAt: z.string().min(1),
  budgetMs: z.number().int().nonnegative(),
});

const qualityRequestSchema = z.object({
  outcomes: z.array(predictionOutcomeSchema).optional(),
  providers: z.array(freshnessProviderSchema).optional(),
  bucketCount: z.coerce.number().int().min(1).max(50).optional(),
});

const predictionMetaSchema = z.object({
  reportTypeId: z.string().min(1),
  reportTypeLabel: z.string().min(1).optional(),
  scopeType: z.string().min(1),
  scopeId: z.string().min(1),
  generatedAt: z.string().optional(),
});

const deficiencyRiskSchema = z.object({
  kind: z.literal('deficiency_risk'),
  rtfProbability: z.number(),
  crlProbability: z.number(),
  firstCycleApprovalProbability: z.number(),
  sampleSize: z.number().int().nonnegative(),
  usingNetworkPrior: z.boolean(),
  modelConfidence: z.number().optional(),
});

const readinessTrajectorySchema = z.object({
  kind: z.literal('readiness_trajectory'),
  overallScore: z.number(),
  predictedApprovalProbability: z.number(),
  predictedReviewTimeDays: z.number(),
  predictedDeficiencyCount: z.number(),
  trend: z.array(z.object({ asOf: z.string(), score: z.number() })).optional(),
});

const trialPosSchema = z.object({
  kind: z.literal('trial_pos'),
  probabilityOfSuccess: z.number(),
  powerAtPriorMean: z.number(),
  typeIError: z.number().optional(),
  effectivePerArm: z.number().optional(),
  nRuns: z.number().int().nonnegative(),
  hasEvidence: z.boolean(),
  assumptions: z.array(z.string()),
});

const predictionInputSchema = z.discriminatedUnion('kind', [
  deficiencyRiskSchema,
  readinessTrajectorySchema,
  trialPosSchema,
]);

const predictionRequestSchema = z.object({
  input: predictionInputSchema,
  meta: predictionMetaSchema,
});

// Live prediction-run request: the caller names a prediction KIND + scope; the
// server does the model IO. Discriminated so the pre-mortem carries the draft
// context the risk model needs, while the forecast reads from the twin by scope.
const forecastRunSchema = z.object({
  kind: z.literal('regulatory_forecast'),
  scopeType: z.string().min(1),
  scopeId: z.string().min(1),
  submissionType: z.string().min(1),
  agency: z.string().min(1).optional(),
});

const premortemRunSchema = z.object({
  kind: z.literal('crl_rtf_premortem'),
  scopeType: z.string().min(1),
  scopeId: z.string().min(1),
  submissionType: z.string().min(1),
  targetAgency: z.string().min(1).optional(),
  therapeuticArea: z.string().nullable().optional(),
  projectId: z.number().int().positive().optional(),
  submissionId: z.string().optional(),
  presentSections: z.array(z.string()),
  sectionScores: z.record(z.number()).optional(),
  harmonizeIssueCount: z.number().int().nonnegative().optional(),
  openEscalations: z.number().int().nonnegative().optional(),
});

const predictionRunSchema = z.discriminatedUnion('kind', [
  forecastRunSchema,
  premortemRunSchema,
]);

const reportScheduleSchema = z.object({
  cadence: z.enum(['daily', 'weekly', 'monthly']),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  timeZoneOffsetMinutes: z.number().int().optional(),
});

const createSubscriptionSchema = z.object({
  clientWorkspaceId: z.number().int().positive().nullable().optional(),
  reportTypeId: z.string().min(1),
  scopeType: z.string().min(1),
  scopeId: z.string().min(1),
  schedule: reportScheduleSchema,
  recipients: z.array(z.string().max(320)).optional(),
  format: z.enum(['pdf', 'in_app']).optional(),
  channel: z.enum(['platform', 'external']).optional(),
  persona: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  createdBy: z.number().int().positive().nullable().optional(),
});

const setEnabledSchema = z.object({
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// GET /quality — ADMIN-ONLY prediction calibration + provider freshness.
// ---------------------------------------------------------------------------

router.get('/quality', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin role required' });
    }

    // Outcomes/providers may be posted via a queried body or query params; when
    // none are supplied we return an empty-but-valid summary so the view always
    // renders. (GET bodies are tolerated for symmetry with the dashboard fetch.)
    const parsed = qualityRequestSchema.safeParse({
      ...(typeof req.body === 'object' && req.body ? req.body : {}),
      ...(req.query ?? {}),
    });
    const outcomes: PredictionOutcome[] = parsed.success
      ? (parsed.data.outcomes ?? [])
      : [];
    const providers = parsed.success ? (parsed.data.providers ?? []) : [];
    const bucketCount = parsed.success ? parsed.data.bucketCount : undefined;

    const quality = summarizeQuality(outcomes, bucketCount);
    const freshness = freshnessRollup(providers);

    return res.json({ data: { organizationId, quality, freshness } });
  } catch (error: any) {
    return serverError(res, logger, 'loading quality', error);
  }
});

// ---------------------------------------------------------------------------
// POST /predictions — assemble an advisory prediction report from a normalized
// PredictionInput. Pure-ish: no model IO, just the assembler.
// ---------------------------------------------------------------------------

router.post('/predictions', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    const parsed = predictionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const input = parsed.data.input as PredictionInput;
    const meta: PredictionReportMeta = {
      reportTypeId: parsed.data.meta.reportTypeId,
      reportTypeLabel: parsed.data.meta.reportTypeLabel ?? parsed.data.meta.reportTypeId,
      scopeType: parsed.data.meta.scopeType,
      scopeId: parsed.data.meta.scopeId,
      generatedAt: parsed.data.meta.generatedAt,
    };

    const renderedReport = assemblePredictionReport(input, meta);
    return res.json({ data: renderedReport });
  } catch (error: any) {
    return serverError(res, logger, 'saving predictions', error);
  }
});

// ---------------------------------------------------------------------------
// POST /predictions/run — LIVE prediction. The server runs the real, honest
// model (submission-readiness twin for the forecast; CRL/RTF risk model for the
// pre-mortem), projects it onto a normalized PredictionInput via the adapters,
// then assembles the advisory report. Entitlement-gated (professional); the
// assembled report is ALWAYS status:'partial' with a mandatory disclosure block
// (assertHasDisclosure). Never fabricates: a program with no readiness
// assessment yields a 422, not a rendered 0%.
// ---------------------------------------------------------------------------

router.post('/predictions/run', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    const parsed = predictionRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const body = parsed.data;

    const typeInfo = PREDICTION_KIND_TO_TYPE[body.kind];
    // Entitlement gate — fail-closed. Both prediction kinds are professional.
    const decision = await requireReportEntitlement(
      organizationId,
      typeInfo.typeId,
      'prediction',
    );
    if (!decision.entitled) {
      return res.status(403).json({
        error: 'This prediction requires a higher plan.',
        feature: decision.feature,
        requiredTier: decision.requiredTier,
        tier: decision.tier,
      });
    }

    let input: PredictionInput | null;
    if (body.kind === 'regulatory_forecast') {
      input = await readinessTwinToTrajectoryInput({
        programId: body.scopeId,
        submissionType: body.submissionType,
        agency: body.agency ?? 'FDA',
      });
      // Honest refusal: no assessment on record → don't fabricate a 0-score.
      if (input === null) {
        return res.status(422).json({
          error:
            'No readiness assessment exists for this program yet. Run a submission-readiness assessment before requesting a forecast.',
          code: 'no_assessment',
        });
      }
    } else {
      input = await runDeficiencyRiskForDraft({
        organizationId,
        projectId: body.projectId,
        submissionId: body.submissionId,
        submissionType: body.submissionType,
        targetAgency: body.targetAgency,
        therapeuticArea: body.therapeuticArea ?? null,
        presentSections: body.presentSections,
        sectionScores: body.sectionScores,
        harmonizeIssueCount: body.harmonizeIssueCount,
        openEscalations: body.openEscalations,
      });
    }

    const meta: PredictionReportMeta = {
      reportTypeId: typeInfo.typeId,
      reportTypeLabel: typeInfo.label,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
    };

    const report = assemblePredictionReport(input, meta);
    // Structural guarantee: the mandatory disclosure block is present.
    assertHasDisclosure(report);

    return res.json({
      data: report,
      meta: {
        feature: decision.feature,
        tier: decision.tier,
        requiredTier: decision.requiredTier,
      },
    });
  } catch (error: any) {
    return serverError(res, logger, 'running predictions', error);
  }
});

// ---------------------------------------------------------------------------
// Subscriptions — org-scoped CRUD over the subscription service.
// ---------------------------------------------------------------------------

router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    const rows = await listSubscriptions(organizationId);
    return res.json({ data: rows });
  } catch (error: any) {
    return serverError(res, logger, 'loading subscriptions', error);
  }
});

router.post('/subscriptions', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    // Org is bound from the JWT, never the body — prevents cross-tenant writes.
    const row = await createSubscription({
      ...parsed.data,
      organizationId,
    });
    return res.status(201).json({ data: row });
  } catch (error: any) {
    return serverError(res, logger, 'saving subscriptions', error);
  }
});

router.patch('/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req);
    if (organizationId == null) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid subscription id' });
    }
    const parsed = setEnabledSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const row = await setEnabled(id, organizationId, parsed.data.enabled);
    if (!row) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    return res.json({ data: row });
  } catch (error: any) {
    return serverError(res, logger, 'updating subscriptions', error);
  }
});

export default router;
