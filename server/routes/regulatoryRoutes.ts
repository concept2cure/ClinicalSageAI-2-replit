import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { RegulatoryIntelligenceService } from '../services/regulatory-intelligence-service';
import { db } from '../db';
import { regulatoryCalendar, regulatorySubmissions } from '@shared/schema';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router();
const regulatoryService = new RegulatoryIntelligenceService();
router.use(authenticate);

function getOrgId(req: any): number | null {
  const raw = req.user?.organizationId ?? req.organizationId ?? req.tenantContext?.organizationId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const CalendarQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(250),
});

const CalendarCreateSchema = z.object({
  title: z.string().min(1),
  eventType: z.string().min(1),
  eventDate: z.string().datetime(),
  submissionId: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
  metadata: z.any().optional(),
  reminders: z.any().optional(),
  recurrence: z.any().optional(),
});

router.get('/submissions', async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(403).json({ success: false, error: 'Organization context required' });
  }

  const parsedLimit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const rows = await db
    .select({
      id: regulatorySubmissions.submissionId,
      title: regulatorySubmissions.drugName,
      agency: regulatorySubmissions.targetMarket,
      status: regulatorySubmissions.status,
      type: regulatorySubmissions.submissionType,
      dueDate: regulatorySubmissions.targetSubmissionDate,
      indication: regulatorySubmissions.indication,
      sponsor: regulatorySubmissions.sponsor,
      currentGate: regulatorySubmissions.currentGate,
      progressPercentage: regulatorySubmissions.progressPercentage,
    })
    .from(regulatorySubmissions)
    .where(eq(regulatorySubmissions.organizationId, orgId))
    .orderBy(desc(regulatorySubmissions.targetSubmissionDate))
    .limit(parsedLimit);

  return res.json({
    success: true,
    data: rows.map(row => ({
      ...row,
      dueDate: row.dueDate?.toISOString?.() ?? row.dueDate,
    })),
  });
});

router.get('/calendar', async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(403).json({ success: false, error: 'Organization context required' });
  }

  const queryParse = CalendarQuerySchema.safeParse(req.query);
  if (!queryParse.success) {
    return res.status(400).json({ success: false, error: 'Invalid calendar query parameters' });
  }
  const { dateFrom, dateTo, limit } = queryParse.data;

  const filters = [eq(regulatoryCalendar.organizationId, orgId)];
  if (dateFrom) filters.push(gte(regulatoryCalendar.eventDate, new Date(dateFrom)));
  if (dateTo) filters.push(lte(regulatoryCalendar.eventDate, new Date(dateTo)));

  const rows = await db
    .select({
      id: regulatoryCalendar.eventId,
      title: regulatoryCalendar.title,
      description: regulatoryCalendar.description,
      eventType: regulatoryCalendar.eventType,
      status: regulatoryCalendar.status,
      priority: regulatoryCalendar.priority,
      eventDate: regulatoryCalendar.eventDate,
      endDate: regulatoryCalendar.endDate,
      submissionId: regulatoryCalendar.submissionId,
      location: regulatoryCalendar.location,
    })
    .from(regulatoryCalendar)
    .where(and(...filters))
    .orderBy(desc(regulatoryCalendar.eventDate))
    .limit(limit);

  return res.json({
    success: true,
    data: rows.map(row => ({
      ...row,
      eventDate: row.eventDate?.toISOString?.() ?? row.eventDate,
      endDate: row.endDate?.toISOString?.() ?? row.endDate,
    })),
  });
});

router.post('/calendar', async (req, res) => {
  const orgId = getOrgId(req);
  if (!orgId) {
    return res.status(403).json({ success: false, error: 'Organization context required' });
  }

  const parsedBody = CalendarCreateSchema.safeParse(req.body || {});
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid calendar payload',
      details: parsedBody.error.flatten(),
    });
  }
  const {
    title,
    eventType,
    eventDate,
    submissionId,
    status,
    priority,
    description,
    location,
    allDay,
    metadata,
    reminders,
    recurrence,
  } = parsedBody.data;

  const parsedEventDate = new Date(eventDate);
  if (Number.isNaN(parsedEventDate.getTime())) {
    return res.status(400).json({ success: false, error: 'eventDate must be a valid ISO date' });
  }

  const submissionIdValue = submissionId ?? null;
  if (submissionIdValue) {
    const [existingSubmission] = await db
      .select({ id: regulatorySubmissions.id })
      .from(regulatorySubmissions)
      .where(
        and(
          eq(regulatorySubmissions.id, submissionIdValue),
          eq(regulatorySubmissions.organizationId, orgId)
        )
      )
      .limit(1);
    if (!existingSubmission) {
      return res.status(400).json({
        success: false,
        error: 'submissionId does not belong to your organization',
      });
    }
  }

  const [created] = await db
    .insert(regulatoryCalendar)
    .values({
      organizationId: orgId,
      eventId: `cal-${Date.now()}`,
      title,
      eventType,
      eventDate: parsedEventDate,
      submissionId: submissionIdValue,
      status: status || 'scheduled',
      priority: priority || 'medium',
      description: description || null,
      location: location || null,
      allDay: Boolean(allDay ?? false),
      metadata: metadata || null,
      reminders: reminders || null,
      recurrence: recurrence || null,
    })
    .returning({
      id: regulatoryCalendar.eventId,
      title: regulatoryCalendar.title,
      eventType: regulatoryCalendar.eventType,
      eventDate: regulatoryCalendar.eventDate,
      submissionId: regulatoryCalendar.submissionId,
      status: regulatoryCalendar.status,
      priority: regulatoryCalendar.priority,
      description: regulatoryCalendar.description,
      location: regulatoryCalendar.location,
    });

  return res.status(201).json({
    success: true,
    data: {
      ...created,
      eventDate: created.eventDate?.toISOString?.() ?? created.eventDate,
    },
  });
});

// GET /search is served by regulatory-registry (mounted first at /api/regulatory).
// This path is the intelligence summary search from RegulatoryIntelligenceService.
router.get('/intelligence-search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});

router.get('/regulatory/search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});

router.get('/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  await regulatoryService.initialize();
  const analysis = await regulatoryService.analyzeProtocolCompliance(
    `Section ${sectionId}`,
    'Phase 2'
  );
  res.json({ sectionId, analysis });
});

router.get('/regulatory/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  await regulatoryService.initialize();
  const analysis = await regulatoryService.analyzeProtocolCompliance(
    `Section ${sectionId}`,
    'Phase 2'
  );
  res.json({ sectionId, analysis });
});
export default router;
