/**
 * Governed QMS writes — the one transaction ceremony for a change to the
 * quality-management regime.
 *
 * A Quality Management Plan and its CTQ factors set the hard / soft / info
 * gates governed documents are validated against, so creating, changing or
 * deleting one is a governed change to the document-control regime. Every such
 * write takes a reason (≥ 8 characters, trimmed) and runs
 *
 *     BEGIN → tenant vars → write → recordGovernedAction → COMMIT
 *
 * on the request-scoped connection. `getDb(req)` is Drizzle over that same
 * `req.dbClient`, so the write and its ledger pair commit or roll back
 * together. A ledger failure is a 500 with the record exactly as it was — never
 * a change with no record of it — and a failed COMMIT is OUTCOME_UNKNOWN, never
 * "nothing was changed".
 *
 * Extracted verbatim from server/routes/quality-management-api.ts (the governed
 * /plans routes, whose suite quality-plans-governed.test.ts pins this
 * behaviour) so the governed CTQ-factor delete in tenant-ctq-factors.ts runs
 * the same ceremony instead of a copy of it. The only change is that the nouns
 * in the messages come from the caller's `GovernedQmsSubject`; for a plan they
 * are the same sentences, word for word.
 *
 * Who may is the route's job (`requireEditorAccess`, plus anything stricter the
 * route adds); who is acting and why are asked here, before any write.
 */
import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { governedActorId } from '../../middleware/orgMembership';
import { requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { recordGovernedAction } from '../../routes/c2c/actions';

interface ErrorLogger {
  error: (message: string, context?: unknown) => void;
}

/** What is being changed, in the words the refusals use. */
export interface GovernedQmsSubject {
  /** `The ${noun} was not deleted …` — 'plan', 'CTQ factor'. */
  noun: string;
  /** `… required to change ${changeWhat}.` — 'a quality-management plan'. */
  changeWhat: string;
  /** Answered when the write trips a foreign key (SQLSTATE 23503). */
  inUse: { error: string; referrers: string };
  /** Log line prefix — 'Quality Management Plan'. */
  logLabel: string;
  logger: ErrorLogger;
}

const GOVERNED_REASON = z.string().trim().min(8);

/** The trimmed reason, or null after answering 400. Runs before any write. */
export function governedQmsReason(req: Request, res: Response, subject: GovernedQmsSubject): string | null {
  const parsed = GOVERNED_REASON.safeParse((req.body ?? {}).reason);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: 'REASON_REQUIRED',
    message: `A reason of at least 8 characters is required to change ${subject.changeWhat}. Nothing was changed.`,
  });
  return null;
}

/** The acting user (the canonical resolver requireEditorAccess pairs with), or
 *  null after answering 401: the ledger never records an unattributed change.
 *  Not part11/governed-actor.ts `governedActor(userId, component)`, which names
 *  a user-or-machine actor and answers nothing; hence the `Qms` in the name. */
export function governedQmsActor(req: Request, res: Response, subject: GovernedQmsSubject): number | null {
  const userId = governedActorId(req);
  if (userId !== null) return userId;
  res.status(401).json({ error: 'AUTH_REQUIRED', message: `Sign in to change ${subject.changeWhat}. Nothing was changed.` });
  return null;
}

/** A refusal decided inside the transaction (not found, in use): rolled back, then answered as-is. */
export class GovernedRefusal extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body.error ?? 'refused'));
  }
}

const GOVERNED_VERB = { create: 'created', update: 'changed', delete: 'deleted' } as const;
export type GovernedQmsCommand = keyof typeof GOVERNED_VERB;

/**
 * One governed QMS write. `write` runs inside the transaction and returns the
 * ledger target/payload plus the response body; the ledger pair is written on
 * the same client before COMMIT. Answers the response itself in every branch;
 * returns true only when the change committed.
 */
export async function governedQmsWrite(
  req: Request,
  res: Response,
  subject: GovernedQmsSubject,
  opts: { orgId: number; userId: number; reason: string; command: GovernedQmsCommand; failure: string },
  write: () => Promise<{ target: string; payload: Record<string, unknown>; status: number; body: unknown }>,
): Promise<boolean> {
  const verb = GOVERNED_VERB[opts.command];
  let client: RequestSqlClient;
  try {
    client = requestPgClient(req);
  } catch {
    res.status(500).json({ error: 'REQUEST_DB_CONTEXT_REQUIRED', message: 'No tenant-scoped database context on this request. Nothing was changed.' });
    return false;
  }
  let stage: 'write' | 'ledger' | 'commit' = 'write';
  let out: Awaited<ReturnType<typeof write>>;
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, opts.orgId);
    out = await write();
    stage = 'ledger';
    await recordGovernedAction(client, {
      orgId: opts.orgId,
      userId: opts.userId,
      command: opts.command,
      target: out.target,
      reason: opts.reason,
      payload: out.payload,
      domain: 'qms',
    });
    stage = 'commit';
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof GovernedRefusal) {
      res.status(error.status).json(error.body);
      return false;
    }
    subject.logger.error(`${subject.logLabel} ${opts.command} failed at ${stage}`, { error });
    const sqlState = (error as { code?: string; cause?: { code?: string } } | null)?.code
      ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
    if (stage === 'write' && sqlState === '23503') {
      // A foreign key still points at the record.
      res.status(409).json({
        error: subject.inUse.error,
        message: `The ${subject.noun} was not ${verb}: ${subject.inUse.referrers} still refer to it. Nothing was changed.`,
      });
    } else if (stage === 'ledger') {
      res.status(500).json({
        error: 'AUDIT_WRITE_FAILED',
        message: `The ${subject.noun} was not ${verb} because its audit record could not be written. Nothing was changed.`,
      });
    } else if (stage === 'commit') {
      // COMMIT itself failed, so whether it landed is not known: say so.
      res.status(500).json({
        error: 'OUTCOME_UNKNOWN',
        message: `The change could not be confirmed. Reload to check whether the ${subject.noun} was ${verb} before trying again.`,
      });
    } else {
      res.status(500).json({ error: opts.failure });
    }
    return false;
  }
  // Committed. Answered outside the try, so nothing after COMMIT can be
  // reported as a rollback.
  res.status(out.status).json(out.body);
  return true;
}

/**
 * A QMS write route that has never saved anything answers this, before any read
 * or write: 501 NOT_AVAILABLE, never a success over a write that did not
 * happen. The message is one sentence saying what is not available and that
 * nothing was saved or submitted.
 */
export function neverSaved(message: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({ error: 'NOT_AVAILABLE', message });
  };
}
