/**
 * Thread timeline for submission-chat review.
 *
 * One read that interleaves every event in a submission-chat thread —
 * messages, proposals, applies — into a single chronological stream so a
 * reviewer can see "what happened in this conversation" without joining
 * three tables themselves.
 *
 * The output is a sorted list of typed events. Each event carries enough
 * context to render a row in a timeline UI without a follow-up fetch:
 *
 *   - kind: 'message'
 *       role, content, model, tokens, source: 'chat_messages'
 *   - kind: 'proposal'
 *       proposalId, status, sectionCode, targetAgency, contentHash,
 *       expiresAt, claimStatusCounts, supersededIds (when applicable)
 *   - kind: 'apply'
 *       auditId, artifactId, previousVersion, newVersion, signed,
 *       signatureId, changeReason, sectionCode, targetAgency
 *
 * The chat_messages query is unscoped by org (chat_messages doesn't carry
 * organization_id) — the proposal and audit queries ARE org-scoped, so a
 * cross-tenant thread id would still produce only message rows. Callers
 * should validate thread ownership upstream when they have the data.
 *
 * @module server/services/ana/submission-chat-timeline
 */
import { pool } from '../../db.js';

export type TimelineEvent =
  | {
      kind: 'message';
      ts: string;
      role: string;
      content: string;
      model: string | null;
      tokens: number | null;
    }
  | {
      kind: 'proposal';
      ts: string;
      proposalId: string;
      status: 'pending' | 'applied' | 'superseded' | 'expired';
      artifactId: string;
      sectionCode: string | null;
      targetAgency: string | null;
      contentHash: string;
      expiresAt: string;
      appliedAt: string | null;
      appliedAuditId: string | null;
      claimStatusCounts: unknown;
      proposedContentLength: number;
    }
  | {
      kind: 'apply';
      ts: string;
      auditId: string;
      artifactId: string;
      previousVersion: number | null;
      newVersion: number | null;
      signed: boolean;
      signatureId: string | null;
      changeReason: string | null;
      sectionCode: string | null;
      targetAgency: string | null;
      acknowledgeUnsupported: boolean;
      unsupportedRatio: number | null;
      linesAdded: number | null;
      linesRemoved: number | null;
    };

export interface ThreadTimelineResult {
  threadId: string;
  organizationId: number;
  counts: {
    messages: number;
    proposals: number;
    applies: number;
  };
  events: TimelineEvent[];
}

function isMissingTable(err: any): boolean {
  return err?.code === '42P01';
}

function safeIso(d: any): string {
  if (!d) return new Date(0).toISOString();
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toISOString()
    : parsed.toISOString();
}

async function loadMessages(
  threadId: string
): Promise<TimelineEvent[]> {
  try {
    const { rows } = await pool.query(
      `SELECT role, content, model, tokens_used, created_at
         FROM chat_messages
        WHERE thread_id = $1
        ORDER BY created_at ASC`,
      [threadId]
    );
    return rows.map((r: any) => ({
      kind: 'message' as const,
      ts: safeIso(r.created_at),
      role: r.role,
      content: r.content,
      model: r.model ?? null,
      tokens:
        typeof r.tokens_used === 'number' ? r.tokens_used : null,
    }));
  } catch (err: any) {
    if (isMissingTable(err)) return [];
    console.warn('[submission-chat-timeline] message load failed:', err?.message);
    return [];
  }
}

async function loadProposals(
  threadId: string,
  organizationId: number
): Promise<TimelineEvent[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, artifact_id, section_code, target_agency,
              content_hash, expires_at, applied_at, applied_audit_id,
              claim_status_counts, length(proposed_content) AS content_len,
              created_at
         FROM ana_submission_chat_proposals
        WHERE thread_id = $1
          AND organization_id = $2
        ORDER BY created_at ASC`,
      [threadId, organizationId]
    );
    return rows.map((r: any) => ({
      kind: 'proposal' as const,
      ts: safeIso(r.created_at),
      proposalId: r.id,
      status: r.status,
      artifactId: r.artifact_id,
      sectionCode: r.section_code,
      targetAgency: r.target_agency,
      contentHash: r.content_hash,
      expiresAt: safeIso(r.expires_at),
      appliedAt: r.applied_at ? safeIso(r.applied_at) : null,
      appliedAuditId: r.applied_audit_id,
      claimStatusCounts: r.claim_status_counts ?? null,
      proposedContentLength:
        typeof r.content_len === 'number' ? r.content_len : 0,
    }));
  } catch (err: any) {
    if (isMissingTable(err)) return [];
    console.warn(
      '[submission-chat-timeline] proposal load failed:',
      err?.message
    );
    return [];
  }
}

async function loadApplies(
  threadId: string,
  organizationId: number
): Promise<TimelineEvent[]> {
  try {
    // The apply path stuffs threadId into metadata.threadId. We pull every
    // submission_chat_rewrite UPDATE row tagged with this thread id.
    const { rows } = await pool.query(
      `SELECT audit_id, entity_id AS artifact_id, change_reason,
              previous_value, new_value, metadata, "timestamp"
         FROM regulatory_audit_logs
        WHERE organization_id = $1
          AND entity_type = 'artifact'
          AND action = 'UPDATE'
          AND metadata->>'source' = 'submission_chat_rewrite'
          AND metadata->>'threadId' = $2
        ORDER BY "timestamp" ASC`,
      [organizationId, threadId]
    );
    return rows.map((r: any) => {
      const meta = r.metadata || {};
      const prev = r.previous_value || {};
      const next = r.new_value || {};
      const verification = meta.verification || {};
      const diff = meta.diff || {};
      return {
        kind: 'apply' as const,
        ts: safeIso(r.timestamp),
        auditId: r.audit_id,
        artifactId: r.artifact_id,
        previousVersion:
          typeof prev.version === 'number' ? prev.version : null,
        newVersion: typeof next.version === 'number' ? next.version : null,
        signed: !!meta.signed,
        signatureId: meta.signatureId ?? null,
        changeReason: r.change_reason,
        sectionCode: meta.sectionCode ?? null,
        targetAgency: meta.targetAgency ?? null,
        acknowledgeUnsupported: !!meta.acknowledgeUnsupported,
        unsupportedRatio:
          typeof verification.unsupportedRatio === 'number'
            ? verification.unsupportedRatio
            : null,
        linesAdded: typeof diff.linesAdded === 'number' ? diff.linesAdded : null,
        linesRemoved:
          typeof diff.linesRemoved === 'number' ? diff.linesRemoved : null,
      };
    });
  } catch (err: any) {
    if (isMissingTable(err)) return [];
    console.warn(
      '[submission-chat-timeline] applies load failed:',
      err?.message
    );
    return [];
  }
}

/**
 * Load every event for a thread from chat_messages + proposals + audit log,
 * interleaved chronologically. Tenant-scoped via organizationId — proposal
 * and apply rows are filtered server-side; messages rely on the caller
 * having already validated that the thread belongs to this org.
 */
export async function getThreadTimeline(
  threadId: string,
  organizationId: number
): Promise<ThreadTimelineResult> {
  const [messages, proposals, applies] = await Promise.all([
    loadMessages(threadId),
    loadProposals(threadId, organizationId),
    loadApplies(threadId, organizationId),
  ]);

  const events: TimelineEvent[] = [...messages, ...proposals, ...applies];
  // Stable chronological sort. Same-timestamp ordering: messages → proposals
  // → applies (proposals + applies usually trail their triggering message
  // by a few hundred ms; this just keeps things deterministic).
  const kindOrder: Record<TimelineEvent['kind'], number> = {
    message: 0,
    proposal: 1,
    apply: 2,
  };
  events.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
    return kindOrder[a.kind] - kindOrder[b.kind];
  });

  return {
    threadId,
    organizationId,
    counts: {
      messages: messages.length,
      proposals: proposals.length,
      applies: applies.length,
    },
    events,
  };
}
