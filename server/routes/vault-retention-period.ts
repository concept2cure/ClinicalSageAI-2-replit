/**
 * An organisation's retention period (P1-22 remainder, DP-20; ADR-0014 §6).
 *
 *   GET  /api/vault/legal-holds/retention   the period in force: the organisation's
 *                                           own, or DEFAULT_RETENTION_YEARS (25)
 *   PUT  /api/vault/legal-holds/retention   set it. Body { years, reason?, governingRule? }
 *
 * ADR-0014 §6: a governed record and its audit trail are kept 25 years from
 * finalization by default; an organisation may set a longer period, or a
 * shorter one with a recorded reason that names the governing rule; a legal
 * hold always overrides deletion. Admission reads the period this sets
 * (vault-ingest.service.ts) and dates each document by it.
 *
 * Why under /legal-holds: the hold and the period are the two controls on the
 * Vault's disposition of a record, and this router is where the first already
 * lives — one mount, one authority boundary, one set of route-audit entries,
 * rather than a second top-level mount for a sibling control. The handlers
 * live here so each file keeps one subject.
 *
 * Authority: the organisation's owner or administrator (`requireRole`), for
 * the organisation of the session — never one named in the request. A change
 * and its chained audit row (before, after, reason, rule) commit in ONE
 * transaction on the request's own tenant-scoped client, the way legal holds
 * are placed and lifted: a change whose audit row cannot be written does not
 * happen. Shorter than the default without a reason and the governing rule is
 * a 400 here and a CHECK violation in the database, whichever path writes it.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { DEFAULT_RETENTION_YEARS } from '../../shared/schema/vault';
import { requestPgClient, type RequestSqlClient } from '../db/requestDb';
import { serverError } from '../lib/api-response';
import { requireRole } from '../middleware/auth';
import { writeChainedAuditRow } from '../services/auditService';
import { authedOrgId } from '../utils/authedOrgId';
import { clientIpOf } from '../utils/client-ip';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('vault-retention-period');

const COLUMNS = 'organization_id, retention_years, reason, governing_rule, set_by, set_at';

/** The shortest reason and rule the database accepts for a shorter period (the CHECK's own bounds). */
const MIN_REASON = 10;
const MIN_RULE = 3;

const setSchema = z.object({
  years: z.number().int().min(1).max(100),
  reason: z.string().trim().max(2000).optional(),
  governingRule: z.string().trim().max(300).optional(),
});

interface PeriodRow {
  organization_id: number;
  retention_years: number;
  reason: string | null;
  governing_rule: string | null;
  set_by: number;
  set_at: Date | string;
}

/** What the organisation's period is, as the API and the audit row state it. */
function present(row: PeriodRow | null) {
  return {
    years: row?.retention_years ?? DEFAULT_RETENTION_YEARS,
    defaultYears: DEFAULT_RETENTION_YEARS,
    isDefault: row === null,
    reason: row?.reason ?? null,
    governingRule: row?.governing_rule ?? null,
    setBy: row?.set_by ?? null,
    setAt: row?.set_at ?? null,
  };
}

const audited = (row: PeriodRow | null) =>
  row === null ? null : { years: row.retention_years, reason: row.reason, governingRule: row.governing_rule };

/** The session's organisation and actor, else the refusal already sent. Role is checked by requireRole first. */
function sessionOf(req: Request, res: Response): { orgId: number; actorId: number } | null {
  const orgId = authedOrgId(req);
  const actorId = Number((req as { userId?: unknown }).userId ?? req.user?.id);
  if (orgId === null || !Number.isInteger(orgId) || orgId <= 0 || !Number.isInteger(actorId) || actorId <= 0) {
    res.status(403).json({ error: 'TENANT_CONTEXT_REQUIRED', message: 'An organisation session is required.' });
    return null;
  }
  return { orgId, actorId };
}

async function readPeriod(client: RequestSqlClient, orgId: number): Promise<PeriodRow | null> {
  // tenant-isolation-safe: keyed by the session's organisation, on the request's RLS-scoped client.
  const r = await client.query(`SELECT ${COLUMNS} FROM organization_retention_settings WHERE organization_id = $1`, [orgId]);
  return (r.rows[0] as unknown as PeriodRow | undefined) ?? null;
}

/** A shorter period's missing justification, in words, or null when the body may be recorded. */
function shorteningRefusal(body: z.infer<typeof setSchema>): string | null {
  if (body.years >= DEFAULT_RETENTION_YEARS) return null;
  const reasonOk = (body.reason ?? '').length >= MIN_REASON;
  const ruleOk = (body.governingRule ?? '').length >= MIN_RULE;
  if (reasonOk && ruleOk) return null;
  return (
    `A period shorter than the ${DEFAULT_RETENTION_YEARS}-year default is recorded only with a reason ` +
    `(at least ${MIN_REASON} characters) and the governing rule that permits it (for example 21 CFR 312.62(c)). ` +
    'Nothing was changed.'
  );
}

async function getPeriod(req: Request, res: Response): Promise<void> {
  const session = sessionOf(req, res);
  if (!session) return;
  try {
    res.json({ retention: present(await readPeriod(requestPgClient(req), session.orgId)) });
  } catch (err) {
    serverError(res, log, 'reading the retention period', err, { orgId: session.orgId });
  }
}

async function setPeriod(req: Request, res: Response): Promise<void> {
  const session = sessionOf(req, res);
  if (!session) return;
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'RETENTION_INVALID', message: 'The period is a whole number of years from 1 to 100.' });
    return;
  }
  const refusal = shorteningRefusal(parsed.data);
  if (refusal) {
    res.status(400).json({ error: 'RETENTION_REASON_REQUIRED', message: refusal });
    return;
  }
  const { years } = parsed.data;
  const reason = parsed.data.reason || null;
  const governingRule = parsed.data.governingRule || null;
  const client = requestPgClient(req);
  try {
    await client.query('BEGIN');
    // One change at a time per organisation, so each audit row's "before" is the row it replaced.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('organization_retention_settings:' || $1::text, 0))", [session.orgId]);
    const before = await readPeriod(client, session.orgId);
    // tenant-isolation-safe: written for the session's organisation only; RLS WITH CHECK refuses any other.
    const written = await client.query(
      `INSERT INTO organization_retention_settings (organization_id, retention_years, reason, governing_rule, set_by, set_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
         retention_years = EXCLUDED.retention_years, reason = EXCLUDED.reason,
         governing_rule = EXCLUDED.governing_rule, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
       RETURNING ${COLUMNS}`,
      [session.orgId, years, reason, governingRule, session.actorId],
    );
    const after = written.rows[0] as unknown as PeriodRow;
    await writeChainedAuditRow(
      client,
      {
        action: 'vault.retention_period.set',
        userId: session.actorId,
        resourceType: 'organization_retention_setting',
        resourceId: String(session.orgId),
        details: { before: audited(before), after: audited(after), defaultYears: DEFAULT_RETENTION_YEARS },
        reason,
        ipAddress: clientIpOf(req) ?? undefined,
        userAgent: req.headers['user-agent'],
      },
      session.orgId,
      String(session.orgId),
    );
    await client.query('COMMIT');
    res.json({ retention: present(after), audited: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    serverError(res, log, 'changing the retention period', err, { orgId: session.orgId });
  }
}

/** Mounted by createVaultLegalHoldRoutes at /retention. */
export function createRetentionPeriodRoutes(): Router {
  const router = Router();
  router.use(requireRole('owner', 'admin'));
  router.get('/', getPeriod);
  router.put('/', setPeriod);
  return router;
}
