import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { getPool } from '../db';
import type {
  Correspondence,
  CorrespondenceIssue,
  ResponsePackage,
  Submission,
  SubmissionLifecycleState,
} from '../../shared/types/regulatory-correspondence';
import {
  correspondenceIntakeSchema,
  issueReviewSchema,
  mailboxConnectionSchema,
  responsePackageCreateSchema,
  submissionCreateSchema,
  submissionStateSchema,
} from './regulatory-correspondence.validation';
import { authMiddleware } from '../auth';

const router = Router();
router.use(authMiddleware);

const memSubmissions = new Map<string, Submission>();
const memCorrespondence = new Map<string, Correspondence>();
const memIssues = new Map<string, CorrespondenceIssue[]>();
const memResponsePackages = new Map<string, ResponsePackage[]>();
const memTimeline: Array<Record<string, unknown>> = [];
type MailboxConnectionRecord = {
  id: string;
  organizationId: number;
  provider: 'microsoft365' | 'gmail' | 'imap' | 'other';
  mailboxIdentifier: string;
  authState: 'connected' | 'expired' | 'error' | 'revoked';
  tokenReference: string | null;
  scopes: string[];
  syncStatus: 'idle' | 'syncing' | 'error';
  cursor: string | null;
  lastSyncAt: string | null;
  errorState: string | null;
  createdAt: string;
};
const memMailboxConnections = new Map<string, MailboxConnectionRecord>();
const REG_CORRESPONDENCE_ENABLED = process.env.ENABLE_REG_CORRESPONDENCE_OS !== 'false';

const KEYWORD_TAXONOMY: Array<{
  pattern: RegExp;
  category: CorrespondenceIssue['category'];
  severity: CorrespondenceIssue['severity'];
  blocker: boolean;
}> = [
  {
    pattern: /refuse to file|rtf|reject/i,
    category: 'filing_acceptance_issue',
    severity: 'critical',
    blocker: true,
  },
  {
    pattern: /deficiency|missing information|clarification/i,
    category: 'missing_information_clarification',
    severity: 'high',
    blocker: true,
  },
  {
    pattern: /stability|specification|quality|cmc/i,
    category: 'cmc_quality_issue',
    severity: 'high',
    blocker: true,
  },
  {
    pattern: /safety|adverse event|risk/i,
    category: 'clinical_safety_issue',
    severity: 'high',
    blocker: true,
  },
  {
    pattern: /efficacy|endpoint|benefit/i,
    category: 'clinical_efficacy_issue',
    severity: 'medium',
    blocker: false,
  },
  {
    pattern: /format|ectd|technical/i,
    category: 'ectd_technical_formatting',
    severity: 'medium',
    blocker: false,
  },
];

function parseIssues(text: string, correspondenceId: string): CorrespondenceIssue[] {
  const normalized = text || '';
  const matches = KEYWORD_TAXONOMY.filter(rule => rule.pattern.test(normalized));
  if (!matches.length) {
    return [
      {
        id: crypto.randomUUID(),
        correspondenceId,
        category: 'other_unclassified',
        severity: 'low',
        blocker: false,
        responseRequired: true,
        sourceExcerpt: normalized.slice(0, 280),
        confidence: 0.35,
        humanReviewStatus: 'pending',
        mappedCtdSections: [],
        mappedArtifactIds: [],
        resolutionStatus: 'open',
      },
    ];
  }

  return matches.map(match => ({
    id: crypto.randomUUID(),
    correspondenceId,
    category: match.category,
    severity: match.severity,
    blocker: match.blocker,
    responseRequired: true,
    sourceExcerpt: normalized.slice(0, 280),
    confidence: 0.72,
    humanReviewStatus: 'pending',
    mappedCtdSections: [],
    mappedArtifactIds: [],
    resolutionStatus: 'open',
  }));
}

function getActorContext(req: Request) {
  const orgId = Number(
    req.body.organizationId || req.query.organizationId || req.headers['x-organization-id'] || 1
  );
  const userId = Number(req.body.userId || req.headers['x-user-id'] || 1);
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

function badRequest(res: Response, error: unknown) {
  return res.status(400).json({ error: 'Validation error', details: error });
}

router.post('/submissions', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = submissionCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const { orgId } = getActorContext(req);
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
  if (await tableReady(pool)) {
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
  } else {
    memSubmissions.set(id, record);
    memTimeline.push({
      id: crypto.randomUUID(),
      submissionId: id,
      projectId: record.projectId,
      eventType: 'submission_created',
      eventTime: now,
      summary: 'Submission initialized for regulatory lifecycle orchestration.',
    });
  }

  res.status(201).json({ data: record });
});

router.get('/submissions/:submissionId', async (req, res) => {
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const { rows } = await pool!.query(`SELECT * FROM c2c_submissions WHERE id = $1 LIMIT 1`, [
      req.params.submissionId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Submission not found' });
    return res.json({ data: rows[0] });
  }

  const record = memSubmissions.get(req.params.submissionId);
  if (!record) return res.status(404).json({ error: 'Submission not found' });
  return res.json({ data: record });
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
  const { orgId } = getActorContext(req);
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const upd = await pool!.query(
      `UPDATE c2c_submissions SET lifecycle_state = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.submissionId, lifecycleState]
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
  }

  const record = memSubmissions.get(req.params.submissionId);
  if (!record) return res.status(404).json({ error: 'Submission not found' });
  record.lifecycleState = lifecycleState;
  record.updatedAt = new Date().toISOString();
  memTimeline.push({
    id: crypto.randomUUID(),
    submissionId: record.id,
    projectId: record.projectId,
    eventType: 'submission_state_changed',
    eventTime: record.updatedAt,
    summary: `Submission transitioned to ${record.lifecycleState}.`,
  });
  return res.json({ data: record });
});

router.post('/correspondence/intake', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const parsed = correspondenceIntakeSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.flatten());
  req.body = parsed.data;
  const { orgId, userId } = getActorContext(req);
  const id = crypto.randomUUID();
  const parsedText = String(req.body.parsedText || req.body.summary || '');
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
      parserVersion: 'v1-keyword-scaffold',
      extractionVersion: '2026-03-31',
      malwareScan: 'pending',
      mimeValidated: true,
      quarantined: false,
      importedByUserId: userId,
    },
    attachmentIds: attachmentRefs.map(a => a.id),
    parsedText,
    summary: req.body.summary || parsedText.slice(0, 200),
  };

  const extracted = parseIssues(parsedText, id);

  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
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
    }

    await addTimelineEventDB(pool!, {
      orgId,
      projectId: record.projectId,
      submissionId: record.submissionId,
      correspondenceId: id,
      eventType: 'correspondence_ingested',
      summary: record.subject,
    });
  } else {
    memCorrespondence.set(id, record);
    memIssues.set(id, extracted);
    memTimeline.push({
      id: crypto.randomUUID(),
      submissionId: record.submissionId,
      correspondenceId: id,
      projectId: record.projectId,
      eventType: 'correspondence_ingested',
      eventTime: new Date().toISOString(),
      summary: record.subject,
    });
  }

  return res.status(201).json({ data: record, issues: extracted });
});

router.get('/correspondence', async (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const submissionId = req.query.submissionId ? String(req.query.submissionId) : null;

  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const params: any[] = [];
    const clauses: string[] = [];
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
  }

  const data = Array.from(memCorrespondence.values()).filter(
    row =>
      (projectId ? row.projectId === projectId : true) &&
      (submissionId ? row.submissionId === submissionId : true)
  );
  return res.json({ data });
});

router.get('/correspondence/:correspondenceId', async (req, res) => {
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const { rows } = await pool!.query(`SELECT * FROM c2c_correspondence WHERE id = $1 LIMIT 1`, [
      req.params.correspondenceId,
    ]);
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
  }

  const row = memCorrespondence.get(req.params.correspondenceId);
  if (!row) return res.status(404).json({ error: 'Correspondence not found' });
  return res.json({
    data: row,
    issues: memIssues.get(row.id) || [],
    responsePackages: memResponsePackages.get(row.id) || [],
  });
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
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const upd = await pool!.query(
      `UPDATE c2c_correspondence_issues
       SET human_review_status = COALESCE($2, human_review_status),
           mapped_ctd_sections = COALESCE($3::jsonb, mapped_ctd_sections),
           mapped_artifact_ids = COALESCE($4::jsonb, mapped_artifact_ids),
           resolution_status = COALESCE($5, resolution_status),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.issueId,
        req.body.humanReviewStatus || null,
        req.body.mappedCtdSections ? JSON.stringify(req.body.mappedCtdSections) : null,
        req.body.mappedArtifactIds ? JSON.stringify(req.body.mappedArtifactIds) : null,
        req.body.resolutionStatus || null,
      ]
    );
    if (!upd.rows[0]) return res.status(404).json({ error: 'Issue not found' });
    return res.json({ data: upd.rows[0] });
  }

  for (const issueList of memIssues.values()) {
    const issue = issueList.find(item => item.id === req.params.issueId);
    if (!issue) continue;
    issue.humanReviewStatus = req.body.humanReviewStatus || issue.humanReviewStatus;
    issue.owner = req.body.owner || issue.owner;
    issue.mappedCtdSections = req.body.mappedCtdSections || issue.mappedCtdSections;
    issue.mappedArtifactIds = req.body.mappedArtifactIds || issue.mappedArtifactIds;
    issue.resolutionStatus = req.body.resolutionStatus || issue.resolutionStatus;
    return res.json({ data: issue });
  }

  return res.status(404).json({ error: 'Issue not found' });
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
  const { orgId } = getActorContext(req);
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

  const projectId = Number(req.body.projectId || 0);

  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
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
      correspondenceId: pack.sourceCorrespondenceId,
      responsePackageId: pack.id,
      eventType: 'response_package_created',
      summary: pack.title,
    });
  } else {
    const existing = memResponsePackages.get(pack.sourceCorrespondenceId) || [];
    existing.push(pack);
    memResponsePackages.set(pack.sourceCorrespondenceId, existing);
    memTimeline.push({
      id: crypto.randomUUID(),
      projectId,
      correspondenceId: pack.sourceCorrespondenceId,
      eventType: 'response_package_created',
      eventTime: new Date().toISOString(),
      summary: pack.title,
    });
  }

  return res.status(201).json({ data: pack });
});

router.get('/timeline', async (req, res) => {
  const submissionId = req.query.submissionId ? String(req.query.submissionId) : null;
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const params: any[] = [];
    const where = submissionId ? `WHERE submission_id = $1` : '';
    if (submissionId) params.push(submissionId);
    const { rows } = await pool!.query(
      `SELECT * FROM c2c_communication_timeline_events ${where} ORDER BY event_time DESC`,
      params
    );
    return res.json({ data: rows });
  }

  return res.json({
    data: memTimeline.filter(event => (submissionId ? event.submissionId === submissionId : true)),
  });
});

router.get('/mailbox-connections', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const orgId = Number(req.query.organizationId || req.headers['x-organization-id'] || 1);
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const { rows } = await pool!.query(
      `SELECT * FROM c2c_mailbox_connections WHERE organization_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    return res.json({ data: rows });
  }

  const data = Array.from(memMailboxConnections.values()).filter(
    row => row.organizationId === orgId
  );
  return res.json({ data });
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
  const { orgId } = getActorContext(req);
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
  if (await tableReady(pool)) {
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
  } else {
    memMailboxConnections.set(payload.id, payload);
  }

  return res.status(201).json({ data: payload });
});

router.get('/analytics/deficiency-patterns', async (req, res) => {
  if (!REG_CORRESPONDENCE_ENABLED) {
    return res
      .status(403)
      .json({ error: 'Regulatory Correspondence OS is disabled by feature flag.' });
  }
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const pool = getDbClientOrNull();
  if (await tableReady(pool)) {
    const params: any[] = [];
    const projectClause = projectId ? ` AND c.project_id = $1` : '';
    if (projectId) params.push(projectId);
    const { rows } = await pool!.query(
      `SELECT i.category, COUNT(*)::int AS count
       FROM c2c_correspondence_issues i
       JOIN c2c_correspondence c ON c.id = i.correspondence_id
       WHERE 1=1 ${projectClause}
       GROUP BY i.category
       ORDER BY COUNT(*) DESC`,
      params
    );
    return res.json({ data: rows });
  }

  const allIssues = Array.from(memIssues.values()).flat();
  const stats = allIssues.reduce((acc, issue) => {
    const key = issue.category;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return res.json({
    data: Object.entries(stats)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  });
});

export default router;
