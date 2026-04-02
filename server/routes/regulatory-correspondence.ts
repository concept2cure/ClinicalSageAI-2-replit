import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { getPool } from '../db';
import type {
  Correspondence,
  ResponsePackage,
  Submission,
  SubmissionLifecycleState,
} from '../../shared/types/regulatory-correspondence';
import {
  correspondenceIntakeGovernanceSchema,
  issueReviewSchema,
  mailboxConnectionSchema,
  responsePackageCreateSchema,
  submissionCreateSchema,
  submissionStateSchema,
} from './regulatory-correspondence.validation';
import { authMiddleware } from '../auth';
import { getSecureOrgId } from '../utils/tenantContext';
import { getOrCreateProfile } from '../services/intelligence/project-intelligence-service';
import { db } from '../db';
import { projectMemoryEntries } from '@shared/schema';
import {
  ISSUE_EXTRACTION_VERSION,
  ISSUE_PARSER_VERSION,
  resolveIssueParserGovernanceConfig,
  runGovernedIssueParser,
} from '../services/regulatory-correspondence/issue-parser';
import {
  computeCorrespondenceIssueImpact,
  createCanonicalTasksForIssue,
} from '../services/regulatory-correspondence/operating-layer';
import { compileGovernedResponseAssembly } from '../services/regulatory-correspondence/response-package-compiler';

const router = Router();
router.use(authMiddleware);

const REG_CORRESPONDENCE_ENABLED = process.env.ENABLE_REG_CORRESPONDENCE_OS !== 'false';

function requireActorContext(req: Request, res: Response) {
  const orgIdRaw = getSecureOrgId(req as any);
  const orgId = orgIdRaw ? Number(orgIdRaw) : NaN;
  if (!Number.isFinite(orgId) || orgId <= 0) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }

  const userIdRaw = (req as any).userId ?? (req as any).user?.id ?? 0;
  const parsedUserId = Number(userIdRaw);
  const userId = Number.isFinite(parsedUserId) && parsedUserId > 0 ? parsedUserId : 0;

  return { orgId, userId };
}

function getDbClientOrNull() {
  try {
    return getPool();
  } catch {
    return null;
  }
}

async function tableReady(pool: ReturnType<typeof getDbClientOrNull>): Promise<boolean> {
  if (!pool) return false;
  try {
    const check = await pool.query(`SELECT to_regclass('public.c2c_submissions') AS tbl`);
    return !!check.rows[0]?.tbl;
  } catch {
    return false;
  }
}

function requirePersistentStore(
  tableIsReady: boolean,
  res: Response,
  context: string
): tableIsReady is true {
  if (tableIsReady) {
    return true;
  }
  res.status(503).json({
    error: 'Regulatory Correspondence store unavailable',
    message:
      `Cannot complete "${context}" because required c2c_* tables are unavailable. ` +
      'In-memory fallback is disabled to avoid non-durable regulatory records.',
  });
  return false;
}

async function addTimelineEventDB(
  pool: NonNullable<ReturnType<typeof getDbClientOrNull>>,
  payload: {
    orgId: number;
    projectId: number;
    submissionId?: string;
    correspondenceId?: string;
    responsePackageId?: string;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  await pool.query(
    `INSERT INTO c2c_communication_timeline_events
      (id, organization_id, project_id, submission_id, correspondence_id, response_package_id, event_type, event_time, summary, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9::jsonb)`,
    [
      crypto.randomUUID(),
      payload.orgId,
      payload.projectId,
      payload.submissionId || null,
      payload.correspondenceId || null,
      payload.responsePackageId || null,
      payload.eventType,
      payload.summary,
      JSON.stringify(payload.metadata || {}),
    ]
  );
}

async function persistCorrespondenceLearning(payload: {
  orgId: number;
  projectId: number;
  title: string;
  content: string;
  subcategory: string;
  confidenceScore?: number;
  importanceLevel?: 'low' | 'medium' | 'high';
  sourceDocumentName?: string;
  sourceDocumentType?: string;
}) {
  try {
    const projectProfileId = await getOrCreateProfile(payload.projectId, payload.orgId);
    await db.insert(projectMemoryEntries).values({
      projectProfileId,
      projectId: payload.projectId,
      organizationId: payload.orgId,
      category: 'authority_position',
      subcategory: payload.subcategory,
      title: payload.title,
      content: payload.content,
      sourceDocumentName: payload.sourceDocumentName,
      sourceDocumentType: payload.sourceDocumentType,
      confidenceScore: payload.confidenceScore ?? 0.78,
      importanceLevel: payload.importanceLevel ?? 'high',
      isVerifiedByUser: false,
      extractedBy: 'system',
      status: 'active',
    });
  } catch (error) {
    console.warn('[regulatory-correspondence] Failed to persist learning record', error);
  }
}

export async function persistOutboundCorrespondenceRecord(payload: {
  orgId: number;
  projectId: number;
  submissionId?: string;
  subject: string;
  recipients: string[];
  sender?: string;
  communicationType?: string;
  parsedText?: string;
  summary?: string;
  urgency?: Correspondence['urgency'];
  sourceChannel?: Correspondence['sourceChannel'];
}) {
  const pool = getDbClientOrNull();
  if (!(await tableReady(pool))) {
    throw new Error('Regulatory Correspondence store unavailable');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: Correspondence = {
    id,
    projectId: payload.projectId,
    submissionId: payload.submissionId || `project-${payload.projectId}`,
    direction: 'outbound',
    sourceChannel: payload.sourceChannel || 'api_import',
    communicationType: (payload.communicationType as any) || 'cover_letter',
    subject: payload.subject,
    sender: payload.sender,
    recipients: payload.recipients,
    sentAt: now,
    receivedAt: now,
    urgency: payload.urgency || 'medium',
    responseRequired: false,
    status: 'responded',
    attachmentIds: [],
    parsedText: payload.parsedText,
    summary: payload.summary,
    parserMetadata: {
      parserVersion: 'report-delivery-v1',
      extractionVersion: ISSUE_EXTRACTION_VERSION,
      importedByUserId: 'system',
    },
  };

  await pool!.query(
    `INSERT INTO c2c_correspondence
    (id, organization_id, project_id, submission_id, direction, source_channel, communication_type, subject, sender, recipients, received_at, sent_at, urgency, response_required, status, parser_metadata, attachment_refs, parsed_text, summary)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19)`,
    [
      record.id,
      payload.orgId,
      record.projectId,
      record.submissionId,
      record.direction,
      record.sourceChannel,
      record.communicationType,
      record.subject,
      record.sender || null,
      JSON.stringify(record.recipients || []),
      record.receivedAt || null,
      record.sentAt || null,
      record.urgency,
      record.responseRequired,
      record.status,
      JSON.stringify(record.parserMetadata || {}),
      JSON.stringify([]),
      record.parsedText || null,
      record.summary || null,
    ]
  );

  await addTimelineEventDB(pool!, {
    orgId: payload.orgId,
    projectId: record.projectId,
    submissionId: payload.submissionId,
    correspondenceId: record.id,
    eventType: 'report_delivery_logged',
    summary: record.subject,
    metadata: {
      communicationType: record.communicationType,
      sourceChannel: record.sourceChannel,
    },
  });

  await persistCorrespondenceLearning({
    orgId: payload.orgId,
    projectId: payload.projectId,
    title: `Outbound correspondence: ${payload.subject}`,
    content:
      `${payload.subject}\nRecipients: ${payload.recipients.join(', ')}\n\n${payload.parsedText || payload.summary || ''}`.trim(),
    subcategory: 'outbound_report_delivery',
    confidenceScore: 0.82,
    importanceLevel: 'medium',
    sourceDocumentName: payload.subject,
    sourceDocumentType: 'outbound_correspondence',
  });

  return record;
}

function badRequest(res: Response, error: unknown) {
  return res.status(400).json({ error: 'Validation error', details: error });
}


router.get('/parser/health', async (_req, res) => {
  const parserGovernance = resolveIssueParserGovernanceConfig(process.env);
  return res.json({
    data: {
      parserVersion: ISSUE_PARSER_VERSION,
      parserGovernance,
      responseContract: parserGovernance.available ? 'governed_heuristic_mode_v1' : null,
    },
  });
});

router.post('/submissions', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = submissionCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: Submission = {
    id,
    projectId: Number(req.body.projectId),
    organizationId: orgId,
    submissionType: String(req.body.submissionType || 'NDA'),
    regulator: String(req.body.regulator || 'FDA'),
    center: req.body.center,
    division: req.body.division,
    applicationNumber: req.body.applicationNumber,
    sequenceNumber: req.body.sequenceNumber,
    lifecycleState: (req.body.lifecycleState || 'drafting') as SubmissionLifecycleState,
    clockMetadata: req.body.clockMetadata || {},
    linkedArtifactIds: [],
    linkedCommunicationIds: [],
    createdAt: now,
    updatedAt: now,
  };

  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'create submission')) {
    return;
  }
  await pool!.query(
      `INSERT INTO c2c_submissions
        (id, organization_id, project_id, submission_type, regulator, center, division, application_number, sequence_number, lifecycle_state, clock_metadata, linked_artifact_ids, linked_communication_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)`,
      [
        record.id,
        record.organizationId,
        record.projectId,
        record.submissionType,
        record.regulator,
        record.center || null,
        record.division || null,
        record.applicationNumber || null,
        record.sequenceNumber || null,
        record.lifecycleState,
        JSON.stringify(record.clockMetadata || {}),
        JSON.stringify(record.linkedArtifactIds),
        JSON.stringify(record.linkedCommunicationIds),
      ]
    );

  await addTimelineEventDB(pool!, {
      orgId,
      projectId: record.projectId,
      submissionId: record.id,
      eventType: 'submission_created',
      summary: 'Submission initialized for regulatory lifecycle orchestration.',
  });

  res.status(201).json({ data: record });
});

router.get('/submissions/:submissionId', async (req, res) => {
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'get submission')) {
    return;
  }
  const { rows } = await pool!.query(
    `SELECT * FROM c2c_submissions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [req.params.submissionId, orgId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Submission not found' });
  return res.json({ data: rows[0] });
});

router.patch('/submissions/:submissionId/state', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = submissionStateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const lifecycleState = req.body.lifecycleState as SubmissionLifecycleState;
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'update submission state')) {
    return;
  }
  const upd = await pool!.query(
    `UPDATE c2c_submissions
     SET lifecycle_state = $2, updated_at = NOW()
     WHERE id = $1 AND organization_id = $3
     RETURNING *`,
    [req.params.submissionId, lifecycleState, orgId]
  );
  if (!upd.rows[0]) return res.status(404).json({ error: 'Submission not found' });
  await addTimelineEventDB(pool!, {
    orgId,
    projectId: upd.rows[0].project_id,
    submissionId: upd.rows[0].id,
    eventType: 'submission_state_changed',
    summary: `Submission transitioned to ${lifecycleState}.`,
  });
  return res.json({ data: upd.rows[0] });
});

router.post('/correspondence/intake', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = correspondenceIntakeGovernanceSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId, userId } = actor;
  const id = crypto.randomUUID();
  const parsedText = String(req.body.parsedText || req.body.summary || '');
  const normalizedParsedText = parsedText.trim();
  const attachmentPayload = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  const attachmentRefs = attachmentPayload.map((file: any) => {
    const checksum = crypto
      .createHash('sha256')
      .update(`${file.filename || 'attachment'}:${file.size || 0}`)
      .digest('hex');
    return {
      id: `att_${checksum.slice(0, 16)}`,
      checksumSha256: checksum,
      fileName: file.filename || 'attachment',
      malwareStatus: 'pending',
    };
  });

  const record: Correspondence = {
    id,
    projectId: Number(req.body.projectId),
    submissionId: String(req.body.submissionId),
    direction: req.body.direction || 'inbound',
    sourceChannel: req.body.sourceChannel || 'manual_upload',
    communicationType: req.body.communicationType || 'information_request',
    subject: req.body.subject || 'Untitled agency correspondence',
    sender: req.body.sender,
    recipients: req.body.recipients || [],
    receivedAt: req.body.receivedAt || new Date().toISOString(),
    dueDate: req.body.dueDate,
    urgency: req.body.urgency || 'medium',
    responseRequired: req.body.responseRequired !== false,
    status: 'new',
    sourceMessageId: req.body.sourceMessageId,
    sourceThreadId: req.body.sourceThreadId,
    sourceMailboxId: req.body.sourceMailboxId,
    parserMetadata: {
      parserVersion: ISSUE_PARSER_VERSION,
      extractionVersion: ISSUE_EXTRACTION_VERSION,
      malwareScan: 'pending',
      mimeValidated: true,
      quarantined: false,
      importedByUserId: userId,
    },
    attachmentIds: attachmentRefs.map((a: any) => a.id),
    parsedText: normalizedParsedText,
    summary: req.body.summary || normalizedParsedText.slice(0, 200),
  };

  const parserGovernance = resolveIssueParserGovernanceConfig(process.env);
  if (!parserGovernance.available) {
    return res.status(503).json({
      error: 'Issue parser unavailable',
      message:
        'Governed parser pipeline is not configured in this environment. Configure REG_CORRESPONDENCE_ISSUE_PARSER_MODE=heuristic_v2 and ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE=true.',
      parserGovernance,
    });
  }

  const extraction = runGovernedIssueParser(normalizedParsedText, id);
  const extracted = extraction.issues;
  record.parserMetadata = {
    ...(record.parserMetadata || {}),
    parserMode: extraction.metadata.parserMode,
    responseContract: extraction.metadata.responseContract,
    extractionMethod: extraction.metadata.extractionMethod,
    confidenceMethod: extraction.metadata.confidenceMethod,
    humanReviewRequired: extraction.metadata.humanReviewRequired,
    extractionVersion: extraction.metadata.extractionVersion,
    sourceTextDigest: extraction.metadata.sourceTextDigest,
    matchedRuleCount: extraction.metadata.matchedRuleCount,
    parserGovernanceMode: parserGovernance.mode,
    parserGovernanceHeuristicEnabled: parserGovernance.heuristicEnabled,
    deterministicSignals: extraction.metadata.deterministicSignals,
    modelAssistedReasoningUsed: extraction.metadata.modelAssistedReasoningUsed,
  };

  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'ingest correspondence')) {
    return;
  }
  try {
  const submissionCheck = await pool!.query(
      `SELECT id, project_id
       FROM c2c_submissions
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [record.submissionId, orgId]
    );
    if (!submissionCheck.rows[0]) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submissionCheck.rows[0].project_id !== record.projectId) {
      return res.status(400).json({ error: 'Submission does not belong to the specified project' });
    }

    await pool!.query(
      `INSERT INTO c2c_correspondence
      (id, organization_id, project_id, submission_id, direction, source_channel, communication_type, subject, sender, recipients, received_at, due_date, urgency, response_required, status, source_message_id, source_thread_id, source_mailbox_id, parser_metadata, attachment_refs, parsed_text, summary)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21,$22)`,
      [
        record.id,
        orgId,
        record.projectId,
        record.submissionId,
        record.direction,
        record.sourceChannel,
        record.communicationType,
        record.subject,
        record.sender || null,
        JSON.stringify(record.recipients || []),
        record.receivedAt || null,
        record.dueDate || null,
        record.urgency,
        record.responseRequired,
        record.status,
        record.sourceMessageId || null,
        record.sourceThreadId || null,
        record.sourceMailboxId || null,
        JSON.stringify(record.parserMetadata || {}),
        JSON.stringify(attachmentRefs),
        record.parsedText || null,
        record.summary || null,
      ]
    );

    const downstreamActions: Array<Record<string, unknown>> = [];
    for (const issue of extracted) {
      await pool!.query(
        `INSERT INTO c2c_correspondence_issues
          (id, correspondence_id, category, severity, blocker, response_required, source_excerpt, confidence, human_review_status, mapped_ctd_sections, mapped_artifact_ids, resolution_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)`,
        [
          issue.id,
          issue.correspondenceId,
          issue.category,
          issue.severity,
          issue.blocker,
          issue.responseRequired,
          issue.sourceExcerpt || null,
          issue.confidence,
          issue.humanReviewStatus,
          JSON.stringify(issue.mappedCtdSections || []),
          JSON.stringify(issue.mappedArtifactIds || []),
          issue.resolutionStatus,
        ]
      );

      const impact = await computeCorrespondenceIssueImpact({
        orgId,
        projectId: record.projectId,
        submissionId: record.submissionId,
        correspondenceId: id,
        issue,
      });
      const canonicalTasks = await createCanonicalTasksForIssue({
        orgId,
        projectId: record.projectId,
        issue,
        ownerUserId: userId,
        ownerName: `user-${userId}`,
        linkedSectionKeys: impact.linkedSections.map(s => s.sectionKey),
      });

      downstreamActions.push({
        issueId: issue.id,
        linkedPackageDbId: impact.linkedPackageDbId,
        linkedSections: impact.linkedSections,
        blockerOpened: impact.blockerOpened,
        readinessPenalty: impact.readinessPenalty,
        recommendedResponsePackageType: impact.recommendedResponsePackageType,
        canonicalTasks,
      });
    }

    await addTimelineEventDB(pool!, {
      orgId,
      projectId: record.projectId,
      submissionId: record.submissionId,
      correspondenceId: id,
      eventType: 'correspondence_ingested',
      summary: record.subject,
    });
  return res.status(201).json({ data: record, issues: extracted, downstreamActions });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Correspondence Intake] DB operation failed:', message);
    return res.status(500).json({ error: 'Failed to ingest correspondence', detail: message });
  }
});

router.get('/correspondence', async (req, res) => {
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const submissionId = req.query.submissionId ? String(req.query.submissionId) : null;

  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'list correspondence')) {
    return;
  }
  const params: any[] = [orgId];
  const clauses: string[] = [`organization_id = $1`];
  if (projectId) {
    params.push(projectId);
    clauses.push(`project_id = $${params.length}`);
  }
  if (submissionId) {
    params.push(submissionId);
    clauses.push(`submission_id = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool!.query(
    `SELECT * FROM c2c_correspondence ${where} ORDER BY received_at DESC NULLS LAST, created_at DESC`,
    params
  );
  return res.json({ data: rows });
});

router.get('/correspondence/:correspondenceId', async (req, res) => {
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'get correspondence detail')) {
    return;
  }
  const { rows } = await pool!.query(
    `SELECT * FROM c2c_correspondence WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [req.params.correspondenceId, orgId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Correspondence not found' });
  const issueRows = await pool!.query(
    `SELECT * FROM c2c_correspondence_issues WHERE correspondence_id = $1 ORDER BY created_at ASC`,
    [req.params.correspondenceId]
  );
  const packageRows = await pool!.query(
    `SELECT * FROM c2c_response_packages WHERE source_correspondence_id = $1 ORDER BY created_at DESC`,
    [req.params.correspondenceId]
  );
  return res.json({ data: rows[0], issues: issueRows.rows, responsePackages: packageRows.rows });
});

router.patch('/issues/:issueId/review', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = issueReviewSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'review correspondence issue')) {
    return;
  }
  const upd = await pool!.query(
    `UPDATE c2c_correspondence_issues AS i
       SET human_review_status = COALESCE($2, human_review_status),
           mapped_ctd_sections = COALESCE($3::jsonb, mapped_ctd_sections),
           mapped_artifact_ids = COALESCE($4::jsonb, mapped_artifact_ids),
           resolution_status = COALESCE($5, resolution_status),
           updated_at = NOW()
       FROM c2c_correspondence AS c
       WHERE i.id = $1
         AND c.id = i.correspondence_id
         AND c.organization_id = $6
       RETURNING i.*`,
    [
      req.params.issueId,
      req.body.humanReviewStatus || null,
      req.body.mappedCtdSections ? JSON.stringify(req.body.mappedCtdSections) : null,
      req.body.mappedArtifactIds ? JSON.stringify(req.body.mappedArtifactIds) : null,
      req.body.resolutionStatus || null,
      orgId,
    ]
  );
  if (!upd.rows[0]) return res.status(404).json({ error: 'Issue not found' });
  return res.json({ data: upd.rows[0] });
});

router.post('/response-packages', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = responsePackageCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const pack: ResponsePackage = {
    id: crypto.randomUUID(),
    sourceCorrespondenceId: String(req.body.sourceCorrespondenceId),
    title: req.body.title || 'Agency Response Package',
    status: req.body.status || 'draft',
    issueMatrixArtifactId: req.body.issueMatrixArtifactId,
    coverLetterArtifactId: req.body.coverLetterArtifactId,
    revisedArtifactIds: req.body.revisedArtifactIds || [],
    assembledSequenceId: req.body.assembledSequenceId,
  };

  let projectId = Number(req.body.projectId || 0);

  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'create response package')) {
    return;
  }
  const sourceCorrespondence = await pool!.query(
    `SELECT id, project_id, submission_id
     FROM c2c_correspondence
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [pack.sourceCorrespondenceId, orgId]
  );
  const sourceRow = sourceCorrespondence.rows[0];
  if (!sourceRow) {
    return res.status(404).json({ error: 'Source correspondence not found' });
  }
  const issueRows = await pool!.query(
    `SELECT * FROM c2c_correspondence_issues WHERE correspondence_id = $1 ORDER BY created_at ASC`,
    [pack.sourceCorrespondenceId]
  );

  projectId = projectId > 0 ? projectId : Number(sourceRow.project_id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  if ((pack.revisedArtifactIds || []).length) {
    const parsedArtifactIds = pack.revisedArtifactIds
      .map(id => Number(id))
      .filter(value => Number.isFinite(value) && value > 0);
    if (parsedArtifactIds.length !== pack.revisedArtifactIds.length) {
      return res.status(400).json({
        error: 'revisedArtifactIds must be numeric artifact IDs for boundary validation',
      });
    }

    const artifactCheck = await pool!.query(
      `SELECT id
         FROM concept2cure_artifacts
        WHERE org_id = $1
          AND project_id = $2
          AND id = ANY($3::int[])`,
      [orgId, projectId, parsedArtifactIds]
    );
    if (artifactCheck.rows.length !== parsedArtifactIds.length) {
      return res.status(400).json({
        error: 'One or more revisedArtifactIds do not belong to the same org/project boundary',
      });
    }
  }

  await pool!.query(
      `INSERT INTO c2c_response_packages
       (id, organization_id, project_id, source_correspondence_id, title, status, issue_matrix_artifact_id, cover_letter_artifact_id, revised_artifact_ids, assembled_sequence_linkage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        pack.id,
        orgId,
        projectId,
        pack.sourceCorrespondenceId,
        pack.title,
        pack.status,
        pack.issueMatrixArtifactId || null,
        pack.coverLetterArtifactId || null,
        JSON.stringify(pack.revisedArtifactIds || []),
        pack.assembledSequenceId || null,
      ]
  );

  await addTimelineEventDB(pool!, {
      orgId,
      projectId,
      submissionId: sourceRow.submission_id,
      correspondenceId: pack.sourceCorrespondenceId,
      responsePackageId: pack.id,
      eventType: 'response_package_created',
      summary: pack.title,
      metadata: {
        compilerVersion: 'response-assembly-v1',
      },
  });
  const compiledAssembly = compileGovernedResponseAssembly({
    correspondenceId: pack.sourceCorrespondenceId,
    issues: issueRows.rows as any,
    revisedArtifactIds: pack.revisedArtifactIds,
  });

  return res.status(201).json({ data: pack, assembly: compiledAssembly });
});

router.get('/timeline', async (req, res) => {
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const submissionId = req.query.submissionId ? String(req.query.submissionId) : null;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'list correspondence timeline')) {
    return;
  }
  const params: any[] = [orgId];
  const clauses = [`organization_id = $1`];
  if (submissionId) {
    params.push(submissionId);
    clauses.push(`submission_id = $${params.length}`);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const { rows } = await pool!.query(
    `SELECT * FROM c2c_communication_timeline_events ${where} ORDER BY event_time DESC`,
    params
  );
  return res.json({ data: rows });
});

router.get('/mailbox-connections', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'list mailbox connections')) {
    return;
  }
  const { rows } = await pool!.query(
    `SELECT * FROM c2c_mailbox_connections WHERE organization_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return res.json({ data: rows });
});

router.post('/mailbox-connections', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = mailboxConnectionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const id = crypto.randomUUID();
  const payload = {
    id,
    organizationId: orgId,
    provider: req.body.provider || 'microsoft365',
    mailboxIdentifier: req.body.mailboxIdentifier,
    authState: req.body.authState || 'connected',
    tokenReference: req.body.tokenReference || null,
    scopes: req.body.scopes || [],
    syncStatus: req.body.syncStatus || 'idle',
    cursor: req.body.cursor || null,
    lastSyncAt: req.body.lastSyncAt || null,
    errorState: req.body.errorState || null,
    createdAt: new Date().toISOString(),
  };

  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'create mailbox connection')) {
    return;
  }
  await pool!.query(
    `INSERT INTO c2c_mailbox_connections
      (id, organization_id, provider, mailbox_identifier, auth_state, token_reference, scopes, sync_status, cursor, last_sync_at, error_state)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
    [
      payload.id,
      payload.organizationId,
      payload.provider,
      payload.mailboxIdentifier,
      payload.authState,
      payload.tokenReference,
      JSON.stringify(payload.scopes),
      payload.syncStatus,
      payload.cursor,
      payload.lastSyncAt,
      payload.errorState,
    ]
  );

  return res.status(201).json({ data: payload });
});

router.get('/analytics/deficiency-patterns', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const actor = requireActorContext(req, res);
  if (!actor) return;
  const { orgId } = actor;
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const pool = getDbClientOrNull();
  const isReady = await tableReady(pool);
  if (!requirePersistentStore(isReady, res, 'compute deficiency patterns')) {
    return;
  }
  const params: any[] = [orgId];
  const projectClause = projectId ? ` AND c.project_id = $2` : '';
  if (projectId) params.push(projectId);
  const { rows } = await pool!.query(
    `SELECT i.category, COUNT(*)::int AS count
       FROM c2c_correspondence_issues i
       JOIN c2c_correspondence c ON c.id = i.correspondence_id
       WHERE c.organization_id = $1 ${projectClause}
       GROUP BY i.category
       ORDER BY COUNT(*) DESC`,
    params
  );
  return res.json({ data: rows });
});

export default router;
