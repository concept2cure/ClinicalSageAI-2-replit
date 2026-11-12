/**
 * Support requests (P-127, package S13; docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.4), mounted at /api/support
 * behind the global auth boundary. The customer's side of ticket tracking, the way Claude's support works: a person
 * opens a request (from Help & training, or AnA drafts it and the person confirms), follows it, replies, marks it
 * resolved and rates the answer.
 *
 *   GET  /tickets                 the requests this person may see: their own; an administrator sees the organisation's
 *   POST /tickets                 open one                                   → 201 { data: { ticket } }
 *   GET  /tickets/:number         one, with its public messages              → { data: { ticket, messages } }
 *   POST /tickets/:number/messages  reply                                    → 201 { data: { message, ticket } }
 *   POST /tickets/:number/resolve   mark it resolved                         → { data: { ticket } }
 *   POST /tickets/:number/rating    rate a resolved one, 1–5                 → { data: { ticket } }
 *
 * The tables are migrations/0007_support_admin.sql (on C2C_MIGRATION_FILES since this change; tenant policy from the
 * integer sweep). Every read and write runs on the request's own connection (requestConnectable), so the tenant
 * policy is in force; every query also names the caller's organisation, which comes from the verified session, never
 * from the request. Every write commits with its chained audit row in the same transaction: a failed audit row rolls
 * the change back, and the person is told nothing was recorded. Internal notes (is_internal) are never read here.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requestConnectable, type RequestSqlClient } from '../db/requestDb';
import { writeChainedAuditRow } from '../services/auditService';
import { authedOrgId } from '../utils/authedOrgId';
import { authedUserId } from '../utils/authedActor';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('support-requests');

export const SUPPORT_CATEGORIES = ['general', 'technical', 'bug_report', 'account', 'billing', 'compliance', 'integration', 'feature_request'] as const;
export const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
/** Where the person can still write: a resolved request reopens on a reply; a closed one does not. */
const OPEN_STATES = ['open', 'in_progress', 'waiting_on_customer', 'waiting_on_internal', 'escalated'] as const;

const openSchema = z.object({
  subject: z.string().trim().min(4).max(200),
  description: z.string().trim().min(10).max(8000),
  category: z.enum(SUPPORT_CATEGORIES).default('general'),
  priority: z.enum(SUPPORT_PRIORITIES).default('medium'),
  /** Where the person was when they asked (a surface id, a project), and the help articles already read. */
  context: z.object({
    surface: z.string().trim().max(80).optional(),
    projectId: z.string().trim().max(80).optional(),
    articles: z.array(z.string().trim().max(120)).max(10).optional(),
    via: z.enum(['help_center', 'ana', 'support_conversation']).optional(),
  }).strict().optional(),
}).strict();
const replySchema = z.object({ content: z.string().trim().min(1).max(8000) }).strict();
const resolveSchema = z.object({ note: z.string().trim().max(2000).optional() }).strict();
const ratingSchema = z.object({ rating: z.number().int().min(1).max(5), feedback: z.string().trim().max(2000).optional() }).strict();
const TICKET_NUMBER = /^SUP-\d{6,12}$/;

class SupportRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export interface Caller { orgId: number; userId: number }
function caller(req: Request): Caller {
  const orgId = authedOrgId(req);
  const userId = authedUserId(req);
  if (orgId == null || userId == null) throw new SupportRefusal(403, 'TENANT_CONTEXT_REQUIRED', 'Sign in to your organisation to use support requests.');
  return { orgId, userId };
}

async function isAdministrator(q: RequestSqlClient, c: Caller): Promise<boolean> {
  const { rows } = await q.query('SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2', [c.orgId, c.userId]);
  return ['owner', 'admin'].includes(String(rows[0]?.role ?? '').trim().toLowerCase());
}

/* Fixed SQL text, no interpolation (ci:sql-interpolation): the two reads name the same columns. */
const TICKET_BY_NUMBER_SQL = `SELECT t.id, t.ticket_number, t.subject, t.description, t.status, t.priority, t.category, t.created_by_id,
         t.first_response_at, t.resolved_at, t.closed_at, t.satisfaction_rating, t.satisfaction_feedback, t.metadata,
         t.created_at, t.updated_at,
         COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS created_by_name,
         (SELECT count(*)::int FROM support_ticket_messages m WHERE m.ticket_id = t.id AND m.organization_id = t.organization_id AND m.is_internal = false) AS reply_count,
         (SELECT max(m.created_at) FROM support_ticket_messages m WHERE m.ticket_id = t.id AND m.organization_id = t.organization_id AND m.is_internal = false) AS last_reply_at
    FROM support_tickets t LEFT JOIN users u ON u.id = t.created_by_id
   WHERE t.organization_id = $1 AND t.ticket_number = $2 AND ($3::boolean OR t.created_by_id = $4)`;
const TICKETS_SQL = `SELECT t.id, t.ticket_number, t.subject, t.description, t.status, t.priority, t.category, t.created_by_id,
         t.first_response_at, t.resolved_at, t.closed_at, t.satisfaction_rating, t.satisfaction_feedback, t.metadata,
         t.created_at, t.updated_at,
         COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS created_by_name,
         (SELECT count(*)::int FROM support_ticket_messages m WHERE m.ticket_id = t.id AND m.organization_id = t.organization_id AND m.is_internal = false) AS reply_count,
         (SELECT max(m.created_at) FROM support_ticket_messages m WHERE m.ticket_id = t.id AND m.organization_id = t.organization_id AND m.is_internal = false) AS last_reply_at
    FROM support_tickets t LEFT JOIN users u ON u.id = t.created_by_id
   WHERE t.organization_id = $1 AND ($2::boolean OR t.created_by_id = $3)
   ORDER BY (t.status IN ('resolved', 'closed')), t.updated_at DESC LIMIT $4`;
const LOCK_TICKET_SQL = `SELECT id FROM support_tickets t
   WHERE t.organization_id = $1 AND t.ticket_number = $2 AND ($3::boolean OR t.created_by_id = $4) FOR UPDATE`;

function shapeTicket(r: Record<string, unknown>, c: Caller) {
  const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
  return {
    number: String(r.ticket_number),
    subject: String(r.subject),
    description: String(r.description),
    status: String(r.status),
    priority: String(r.priority),
    category: String(r.category),
    openedBy: { name: r.created_by_name ? String(r.created_by_name) : null, you: Number(r.created_by_id) === c.userId },
    context: meta.context ?? null,
    replies: Number(r.reply_count ?? 0),
    lastReplyAt: r.last_reply_at ?? null,
    firstResponseAt: r.first_response_at ?? null,
    resolvedAt: r.resolved_at ?? null,
    closedAt: r.closed_at ?? null,
    rating: r.satisfaction_rating == null ? null : Number(r.satisfaction_rating),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** One request the caller may see, or a 404 that does not say whether another organisation's exists. */
async function visibleTicket(q: Pick<RequestSqlClient, 'query'>, c: Caller, number: string, lock = false): Promise<Record<string, unknown>> {
  if (!TICKET_NUMBER.test(number)) throw new SupportRefusal(404, 'NOT_FOUND', 'No support request with that number.');
  const admin = await isAdministrator(q, c);
  const args = [c.orgId, number, admin, c.userId];
  if (lock) await q.query(LOCK_TICKET_SQL, args);
  const { rows } = await q.query(TICKET_BY_NUMBER_SQL, args);
  if (!rows[0]) throw new SupportRefusal(404, 'NOT_FOUND', 'No support request with that number.');
  return rows[0];
}

async function inTransaction<T>(req: Request, work: (q: RequestSqlClient) => Promise<T>): Promise<T> {
  const client = await requestConnectable(req).connect();
  let discard: Error | undefined;
  try {
    await client.query('BEGIN');
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = new Error('Support request rollback could not be verified'); }
    throw error;
  } finally { client.release(discard); }
}

async function audit(q: RequestSqlClient, req: Request, c: Caller, entry: { action: string; ticket: string; details: Record<string, unknown> }) {
  const { action, ticket: ticketNumber, details } = entry;
  await writeChainedAuditRow(q, {
    tenantId: c.orgId,
    userId: c.userId,
    action,
    resourceType: 'support_ticket',
    resourceId: ticketNumber,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    details: { ticket: ticketNumber, ...details },
  });
}

function refuse(res: Response, error: unknown, what: string): void {
  if (error instanceof SupportRefusal) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ') } });
    return;
  }
  logger.error(`support request ${what} failed`, { error: error instanceof Error ? error.message : String(error) });
  res.status(503).json({ error: { code: 'SUPPORT_UNAVAILABLE', message: what === 'read'
    ? 'Support requests could not be read.'
    : 'The support request could not be recorded with its audit record. Nothing was saved.' } });
}

/** The requests a caller may see, open ones first: their own; an administrator's organisation's. Also AnA's
 *  list_my_support_tickets (server/services/ana/help-support-tools.ts), so both read the same thing. */
export async function listSupportTickets(q: Pick<RequestSqlClient, 'query'>, c: Caller, limit = 200) {
  const admin = await isAdministrator(q as RequestSqlClient, c);
  const { rows } = await q.query(TICKETS_SQL, [c.orgId, admin, c.userId, Math.max(1, Math.min(200, limit))]);
  return { tickets: rows.map((r) => shapeTicket(r, c)), scope: admin ? 'organisation' as const : 'yours' as const };
}

router.get('/tickets', async (req: Request, res: Response) => {
  try {
    res.json({ data: await listSupportTickets(requestConnectable(req), caller(req)) });
  } catch (error) { refuse(res, error, 'read'); }
});

router.post('/tickets', async (req: Request, res: Response) => {
  try {
    const c = caller(req);
    const body = openSchema.parse(req.body ?? {});
    const ticket = await inTransaction(req, async (q) => {
      const { rows: seq } = await q.query(`SELECT 'SUP-' || lpad(nextval('support_ticket_number_seq')::text, 6, '0') AS n`);
      const number = String(seq[0].n);
      const { rows } = await q.query(
        `INSERT INTO support_tickets (organization_id, created_by_id, ticket_number, subject, description, priority, category, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::json) RETURNING id`,
        [c.orgId, c.userId, number, body.subject, body.description, body.priority, body.category, JSON.stringify({ context: body.context ?? null })],
      );
      await audit(q, req, c, { action: 'support.ticket.opened', ticket: number, details: { subject: body.subject, category: body.category, priority: body.priority, via: body.context?.via ?? null } });
      if (!rows[0]) throw new Error('support ticket insert returned no row');
      return visibleTicket(q, c, number);
    });
    res.status(201).json({ data: { ticket: shapeTicket(ticket, c) } });
  } catch (error) { refuse(res, error, 'open'); }
});

router.get('/tickets/:number', async (req: Request, res: Response) => {
  try {
    const c = caller(req);
    const q = requestConnectable(req);
    const t = await visibleTicket(q, c, String(req.params.number));
    const { rows } = await q.query(
      `SELECT m.id, m.content, m.created_at, m.user_id,
              COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS author_name,
              EXISTS (SELECT 1 FROM organization_users ou WHERE ou.organization_id = m.organization_id AND ou.user_id = m.user_id) AS from_member
         FROM support_ticket_messages m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.ticket_id = $2 AND m.is_internal = false
        ORDER BY m.created_at, m.id`,
      [c.orgId, t.id],
    );
    res.json({ data: {
      ticket: shapeTicket(t, c),
      messages: rows.map((m) => ({
        id: Number(m.id),
        content: String(m.content),
        createdAt: m.created_at,
        from: m.from_member ? 'customer' : 'support',
        author: m.from_member ? (m.author_name ? String(m.author_name) : null) : 'Concept2Cure support',
        you: Number(m.user_id) === c.userId,
      })),
    } });
  } catch (error) { refuse(res, error, 'read'); }
});

router.post('/tickets/:number/messages', async (req: Request, res: Response) => {
  try {
    const c = caller(req);
    const body = replySchema.parse(req.body ?? {});
    const out = await inTransaction(req, async (q) => {
      const t = await visibleTicket(q, c, String(req.params.number), true);
      if (t.status === 'closed') throw new SupportRefusal(409, 'TICKET_CLOSED', 'This request is closed. Open a new request and mention its number.');
      const { rows } = await q.query(
        `INSERT INTO support_ticket_messages (organization_id, ticket_id, user_id, is_internal, content) VALUES ($1, $2, $3, false, $4) RETURNING id, created_at`,
        [c.orgId, t.id, c.userId, body.content],
      );
      // A reply from the customer puts the request back with support: a waiting or resolved one opens again.
      const reopened = !OPEN_STATES.includes(String(t.status) as typeof OPEN_STATES[number]) || t.status === 'waiting_on_customer';
      await q.query(reopened
        ? `UPDATE support_tickets SET updated_at = NOW(), status = 'open', resolved_at = NULL WHERE id = $1 AND organization_id = $2`
        : `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [t.id, c.orgId]);
      await audit(q, req, c, { action: 'support.ticket.replied', ticket: String(t.ticket_number), details: { messageId: Number(rows[0].id), reopened, previousStatus: t.status } });
      return { message: { id: Number(rows[0].id), createdAt: rows[0].created_at }, ticket: await visibleTicket(q, c, String(t.ticket_number)) };
    });
    res.status(201).json({ data: { message: out.message, ticket: shapeTicket(out.ticket, c) } });
  } catch (error) { refuse(res, error, 'reply'); }
});

router.post('/tickets/:number/resolve', async (req: Request, res: Response) => {
  try {
    const c = caller(req);
    const body = resolveSchema.parse(req.body ?? {});
    const t = await inTransaction(req, async (q) => {
      const cur = await visibleTicket(q, c, String(req.params.number), true);
      if (cur.status === 'resolved' || cur.status === 'closed') throw new SupportRefusal(409, 'ALREADY_RESOLVED', 'This request is already resolved.');
      await q.query(`UPDATE support_tickets SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2`, [cur.id, c.orgId]);
      if (body.note) {
        await q.query(`INSERT INTO support_ticket_messages (organization_id, ticket_id, user_id, is_internal, content) VALUES ($1, $2, $3, false, $4)`,
          [c.orgId, cur.id, c.userId, body.note]);
      }
      await audit(q, req, c, { action: 'support.ticket.resolved', ticket: String(cur.ticket_number), details: { previousStatus: cur.status, note: body.note ?? null } });
      return visibleTicket(q, c, String(cur.ticket_number));
    });
    res.json({ data: { ticket: shapeTicket(t, c) } });
  } catch (error) { refuse(res, error, 'resolve'); }
});

router.post('/tickets/:number/rating', async (req: Request, res: Response) => {
  try {
    const c = caller(req);
    const body = ratingSchema.parse(req.body ?? {});
    const t = await inTransaction(req, async (q) => {
      const cur = await visibleTicket(q, c, String(req.params.number), true);
      if (cur.status !== 'resolved' && cur.status !== 'closed') throw new SupportRefusal(409, 'NOT_RESOLVED', 'A request is rated once it is resolved.');
      if (Number(cur.created_by_id) !== c.userId) throw new SupportRefusal(403, 'NOT_YOUR_REQUEST', 'Only the person who opened the request rates it.');
      await q.query(`UPDATE support_tickets SET satisfaction_rating = $1, satisfaction_feedback = $2, updated_at = NOW() WHERE id = $3 AND organization_id = $4`,
        [body.rating, body.feedback ?? null, cur.id, c.orgId]);
      await audit(q, req, c, { action: 'support.ticket.rated', ticket: String(cur.ticket_number), details: { rating: body.rating } });
      return visibleTicket(q, c, String(cur.ticket_number));
    });
    res.json({ data: { ticket: shapeTicket(t, c) } });
  } catch (error) { refuse(res, error, 'rate'); }
});

export default router;
