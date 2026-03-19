/**
 * Pharmacovigilance Module API Routes
 *
 * Full lifecycle safety reporting API aligned with ICH E2A/E2B(R3)/E2C(R2)/E2D/E2E/E2F:
 *   - Adverse event intake & retrieval
 *   - ICSR generation (ICH E2B R3)
 *   - Periodic safety reports (DSUR/PSUR/PBRER/PADER)
 *   - Signal detection & management (GVP Module IX)
 *   - Risk management plans (GVP Module V)
 *   - Overdue / expedited report tracking
 *   - Dashboard KPI overview
 *
 * Delegates to pharmacovigilanceService for business logic; this layer
 * handles HTTP concerns, input validation, and error shaping.
 *
 * @module routes/pharmacovigilance-routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

// Service imports — the service uses the shared pool internally
import {
  reportAdverseEvent,
  getAdverseEvents,
  getOverdueReports,
  generateICSR,
  createPeriodicReport,
  getUpcomingReports,
  reportSignal,
  getPendingSignals,
  createRMP,
  getRMPsForProject,
  calculateReportingDeadline,
  type EventType,
  type SeriousnessCriteria,
  type Causality,
  type Outcome,
  type ReporterType,
  type RegulatoryRegion,
  type AdverseEventFilters,
} from '../services/compliance/pharmacovigilanceService';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const adverseEventSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  eventType: z.enum(['AE', 'SAE', 'SUSAR', 'AESI']),
  patientId: z.string().min(1),
  eventDescription: z.string().min(1).max(10000),
  onsetDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  reportDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  seriousnessCriteria: z.enum([
    'death',
    'life_threatening',
    'hospitalization',
    'disability',
    'congenital_anomaly',
    'medically_important',
  ]),
  causality: z.enum(['definite', 'probable', 'possible', 'unlikely', 'unrelated']),
  outcome: z.enum(['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown']),
  reporterType: z.enum(['investigator', 'sponsor', 'patient', 'healthcare_provider']),
  countryOfOccurrence: z.string().length(2),
  reportedToAuthorities: z.boolean().default(false),
});

const periodicReportSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  reportType: z.enum(['DSUR', 'PSUR', 'PBRER', 'PADER']),
  periodStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  submittedTo: z.array(z.string()).default([]),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

const signalSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  signalSource: z.enum(['spontaneous', 'clinical_trial', 'literature', 'registry']),
  description: z.string().min(1).max(10000),
  riskBenefitAssessment: z.string().default(''),
});

const rmpSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  version: z.string().min(1),
  identifiedRisks: z.array(z.string()).default([]),
  potentialRisks: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  pharmacovigilanceActivities: z.object({
    routine: z.array(z.string()).default([]),
    additional: z.array(z.string()).default([]),
  }).default({ routine: [], additional: [] }),
  riskMinimizationMeasures: z.object({
    routine: z.array(z.string()).default([]),
    additional: z.array(z.string()).default([]),
  }).default({ routine: [], additional: [] }),
  region: z.enum(['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada']),
});

const deadlineCalcSchema = z.object({
  eventType: z.enum(['AE', 'SAE', 'SUSAR', 'AESI']),
  seriousnessCriteria: z.enum([
    'death',
    'life_threatening',
    'hospitalization',
    'disability',
    'congenital_anomaly',
    'medically_important',
  ]),
  region: z.enum(['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada']),
  reportDate: z.string().optional(),
});

// ─── Router Factory ───────────────────────────────────────────────────────────

export default function createPharmacovigilanceRoutes(): Router {
  const router = Router();

  function getOrgId(req: Request): string {
    const orgId =
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId;
    if (!orgId) {
      // Log but do not silently share data across tenants
      console.warn('[Pharmacovigilance] No tenant context — using session-scoped fallback');
      return (req as any).user?.organizationId || (req as any).user?.id || 'anonymous';
    }
    return String(orgId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD / OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacovigilance/overview
   * KPI snapshot: overdue count, pending signals, upcoming reports, expedited rate
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);

      const [overdueEvents, pendingSignals, upcomingReports, allEvents] = await Promise.allSettled([
        getOverdueReports(orgId),
        getPendingSignals(orgId),
        getUpcomingReports(orgId),
        getAdverseEvents(orgId),
      ]);

      const overdue = overdueEvents.status === 'fulfilled' ? overdueEvents.value : [];
      const signals = pendingSignals.status === 'fulfilled' ? pendingSignals.value : [];
      const upcoming = upcomingReports.status === 'fulfilled' ? upcomingReports.value : [];
      const events = allEvents.status === 'fulfilled' ? allEvents.value : [];

      const totalEvents = events.length;
      const saeCount = events.filter(e => e.eventType === 'SAE' || e.eventType === 'SUSAR').length;
      const expeditedCount = events.filter(e => e.expeditedReportRequired).length;
      const reportedCount = events.filter(e => e.reportedToAuthorities).length;

      return res.json({
        success: true,
        data: {
          kpis: {
            totalAdverseEvents: totalEvents,
            seriousEvents: saeCount,
            expeditedReports: expeditedCount,
            overdueReports: overdue.length,
            pendingSignals: signals.length,
            upcomingPeriodicReports: upcoming.length,
            complianceRate: totalEvents > 0
              ? Math.round((reportedCount / totalEvents) * 100)
              : 100,
          },
          recentOverdue: overdue.slice(0, 5),
          activeSignals: signals.slice(0, 5),
          upcomingDeadlines: upcoming.slice(0, 5),
        },
      });
    } catch (error) {
      console.error('[Pharmacovigilance] overview error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PV overview' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVERSE EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacovigilance/adverse-events
   * List adverse events with optional filters
   */
  router.get('/adverse-events', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const { eventType, seriousnessCriteria, reportedToAuthorities, expeditedReportRequired, fromDate, toDate } = req.query;

      const validEventTypes = ['AE', 'SAE', 'SUSAR', 'AESI'];
      const validSeriousness = ['death', 'life_threatening', 'hospitalization', 'disability', 'congenital_anomaly', 'medically_important'];

      const filters: AdverseEventFilters = {};
      if (eventType) {
        if (!validEventTypes.includes(eventType as string)) {
          return res.status(400).json({ success: false, error: `eventType must be one of: ${validEventTypes.join(', ')}` });
        }
        filters.eventType = eventType as EventType;
      }
      if (seriousnessCriteria) {
        if (!validSeriousness.includes(seriousnessCriteria as string)) {
          return res.status(400).json({ success: false, error: `seriousnessCriteria must be one of: ${validSeriousness.join(', ')}` });
        }
        filters.seriousnessCriteria = seriousnessCriteria as SeriousnessCriteria;
      }
      if (reportedToAuthorities !== undefined) filters.reportedToAuthorities = reportedToAuthorities === 'true';
      if (expeditedReportRequired !== undefined) filters.expeditedReportRequired = expeditedReportRequired === 'true';
      if (fromDate) {
        const d = new Date(fromDate as string);
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid fromDate format' });
        filters.fromDate = d;
      }
      if (toDate) {
        const d = new Date(toDate as string);
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid toDate format' });
        filters.toDate = d;
      }

      const events = await getAdverseEvents(orgId, filters);

      return res.json({
        success: true,
        data: events,
        total: events.length,
      });
    } catch (error) {
      console.error('[Pharmacovigilance] get adverse events error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve adverse events' });
    }
  });

  /**
   * POST /api/pharmacovigilance/adverse-events
   * Report a new adverse event
   */
  router.post('/adverse-events', async (req: Request, res: Response) => {
    try {
      const parsed = adverseEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const event = await reportAdverseEvent({
        organizationId: data.organizationId,
        projectId: data.projectId,
        eventType: data.eventType as EventType,
        patientId: data.patientId,
        eventDescription: data.eventDescription,
        onsetDate: new Date(data.onsetDate),
        reportDate: new Date(data.reportDate),
        seriousnessCriteria: data.seriousnessCriteria as SeriousnessCriteria,
        causality: data.causality as Causality,
        outcome: data.outcome as Outcome,
        reporterType: data.reporterType as ReporterType,
        countryOfOccurrence: data.countryOfOccurrence,
        reportedToAuthorities: data.reportedToAuthorities,
      });

      res.status(201).json({ success: true, data: event });
    } catch (error) {
      console.error('[Pharmacovigilance] report adverse event error:', error);
      res.status(500).json({ success: false, error: 'Failed to report adverse event' });
    }
  });

  /**
   * GET /api/pharmacovigilance/adverse-events/overdue
   * List events that have passed their reporting deadline without submission
   */
  router.get('/adverse-events/overdue', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const overdue = await getOverdueReports(orgId);
      return res.json({ success: true, data: overdue, total: overdue.length });
    } catch (error) {
      console.error('[Pharmacovigilance] overdue reports error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve overdue reports' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ICSR GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/pharmacovigilance/icsr/generate
   * Generate an ICH E2B(R3) compliant ICSR for an adverse event
   */
  router.post('/icsr/generate', async (req: Request, res: Response) => {
    try {
      const { adverseEventId } = req.body;
      if (!adverseEventId || typeof adverseEventId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'adverseEventId (string) is required',
        });
      }

      const icsr = await generateICSR(adverseEventId);
      res.status(201).json({ success: true, data: icsr });
    } catch (error: any) {
      if (error?.message?.includes('not found')) {
        return res.status(404).json({ success: false, error: 'Adverse event not found' });
      }
      console.error('[Pharmacovigilance] ICSR generation error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate ICSR' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERIODIC SAFETY REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacovigilance/periodic-reports
   * List upcoming periodic safety reports (DSUR/PSUR/PBRER/PADER)
   */
  router.get('/periodic-reports', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const reports = await getUpcomingReports(orgId);
      return res.json({ success: true, data: reports, total: reports.length });
    } catch (error) {
      console.error('[Pharmacovigilance] periodic reports error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve periodic reports' });
    }
  });

  /**
   * POST /api/pharmacovigilance/periodic-reports
   * Create a new periodic safety report
   */
  router.post('/periodic-reports', async (req: Request, res: Response) => {
    try {
      const parsed = periodicReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const report = await createPeriodicReport({
        organizationId: data.organizationId,
        projectId: data.projectId,
        reportType: data.reportType as any,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        status: 'draft',
        submittedTo: data.submittedTo,
        dueDate: new Date(data.dueDate),
        submittedAt: null,
      });

      res.status(201).json({ success: true, data: report });
    } catch (error) {
      console.error('[Pharmacovigilance] create periodic report error:', error);
      res.status(500).json({ success: false, error: 'Failed to create periodic report' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacovigilance/signals
   * List pending safety signals
   */
  router.get('/signals', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const signals = await getPendingSignals(orgId);
      return res.json({ success: true, data: signals, total: signals.length });
    } catch (error) {
      console.error('[Pharmacovigilance] get signals error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve safety signals' });
    }
  });

  /**
   * POST /api/pharmacovigilance/signals
   * Report a new safety signal (GVP Module IX)
   */
  router.post('/signals', async (req: Request, res: Response) => {
    try {
      const parsed = signalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const signal = await reportSignal({
        organizationId: data.organizationId,
        projectId: data.projectId,
        signalSource: data.signalSource as any,
        description: data.description,
        detectedAt: new Date(),
        evaluationStatus: 'new',
        action: 'none',
        riskBenefitAssessment: data.riskBenefitAssessment,
      });

      res.status(201).json({ success: true, data: signal });
    } catch (error) {
      console.error('[Pharmacovigilance] report signal error:', error);
      res.status(500).json({ success: false, error: 'Failed to report safety signal' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RISK MANAGEMENT PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacovigilance/rmp/:projectId
   * Get risk management plans for a project
   */
  router.get('/rmp/:projectId', async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      if (!projectId) {
        return res.status(400).json({ success: false, error: 'projectId is required' });
      }

      const plans = await getRMPsForProject(projectId);
      return res.json({ success: true, data: plans, total: plans.length });
    } catch (error) {
      console.error('[Pharmacovigilance] get RMPs error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve RMPs' });
    }
  });

  /**
   * POST /api/pharmacovigilance/rmp
   * Create a new risk management plan (GVP Module V)
   */
  router.post('/rmp', async (req: Request, res: Response) => {
    try {
      const parsed = rmpSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const data = parsed.data;
      const rmp = await createRMP({
        organizationId: data.organizationId,
        projectId: data.projectId,
        version: data.version,
        identifiedRisks: data.identifiedRisks,
        potentialRisks: data.potentialRisks,
        missingInformation: data.missingInformation,
        pharmacovigilanceActivities: data.pharmacovigilanceActivities,
        riskMinimizationMeasures: data.riskMinimizationMeasures,
        status: 'draft',
        region: data.region as RegulatoryRegion,
      });

      res.status(201).json({ success: true, data: rmp });
    } catch (error) {
      console.error('[Pharmacovigilance] create RMP error:', error);
      res.status(500).json({ success: false, error: 'Failed to create RMP' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/pharmacovigilance/calculate-deadline
   * Calculate the regulatory reporting deadline for a hypothetical event
   */
  router.post('/calculate-deadline', async (req: Request, res: Response) => {
    try {
      const parsed = deadlineCalcSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
      }

      const { eventType, seriousnessCriteria, region, reportDate } = parsed.data;

      const deadline = calculateReportingDeadline(
        eventType as EventType,
        seriousnessCriteria as SeriousnessCriteria,
        region as RegulatoryRegion,
        reportDate ? new Date(reportDate) : new Date(),
      );

      const isExpedited = eventType !== 'AE';

      return res.json({
        success: true,
        data: {
          deadline: deadline.toISOString(),
          expeditedReport: isExpedited,
          daysRemaining: Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          region,
          eventType,
          seriousnessCriteria,
        },
      });
    } catch (error) {
      console.error('[Pharmacovigilance] calculate deadline error:', error);
      res.status(500).json({ success: false, error: 'Failed to calculate deadline' });
    }
  });

  /**
   * GET /api/pharmacovigilance/compliance-matrix
   * Returns per-region compliance status based on reporting timelines
   */
  router.get('/compliance-matrix', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);
      const events = await getAdverseEvents(orgId);
      const overdue = await getOverdueReports(orgId);

      const regions: RegulatoryRegion[] = ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada'];

      const matrix = regions.map(region => {
        const regionOverdue = overdue.filter(e => {
          // Map country to region for matrix grouping
          const countryMap: Record<string, RegulatoryRegion> = {
            US: 'FDA', GB: 'EMA', DE: 'EMA', FR: 'EMA', JP: 'PMDA', CN: 'NMPA', CA: 'Health_Canada',
          };
          return countryMap[e.countryOfOccurrence] === region;
        });

        return {
          region,
          totalEvents: events.filter(e => {
            const countryMap: Record<string, RegulatoryRegion> = {
              US: 'FDA', GB: 'EMA', DE: 'EMA', FR: 'EMA', JP: 'PMDA', CN: 'NMPA', CA: 'Health_Canada',
            };
            return countryMap[e.countryOfOccurrence] === region;
          }).length,
          overdueCount: regionOverdue.length,
          complianceStatus: regionOverdue.length === 0 ? 'compliant' : 'non_compliant',
        };
      });

      return res.json({ success: true, data: matrix });
    } catch (error) {
      console.error('[Pharmacovigilance] compliance matrix error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate compliance matrix' });
    }
  });

  return router;
}
