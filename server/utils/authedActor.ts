/**
 * The VERIFIED acting principal for a request.
 *
 * Sibling of `authedOrgId` — that one answers "which tenant?", this one answers
 * "who?". Both exist for the same reason: the answer must come from the token,
 * never from something the caller can set.
 *
 * WHY (ledger C-18)
 * -----------------
 * Route code across this repo read identity and roles from request headers:
 *
 *   req.headers['x-roles']       → an authorization decision (8 gated routes)
 *   req.headers['x-user-email']  → the actor on 21 CFR Part 11 audit records
 *   req.headers['x-user-name']   → the actor on GxP stability + regulatory records
 *   req.headers['x-user-id']     → whose documents to return
 *
 * All four are attacker-controlled. A valid token carrying no `roles` claim plus
 * a forged `x-roles: ADMIN` header passed every role gate in the authoring
 * router — demonstrated at 201 on an ADMIN-gated route. The header-shaped
 * variants also default to placeholders like `'user'` or `'collector'`, which
 * identify nobody and quietly satisfy a NOT NULL audit column.
 *
 * Sanitising the headers in middleware is necessary but NOT sufficient: an
 * overwrite that only fires when the claim exists leaves the caller's value in
 * place whenever it doesn't. Reading the claim directly removes the class.
 *
 * `scripts/check-security-patterns.ts` (`identity-trust-header`) fails CI on new
 * header reads.
 */

import type { Request } from 'express';

interface AuthedUser {
  id?: string | number;
  userId?: string | number;
  email?: string;
  name?: string;
  roles?: unknown;
}

const user = (req: Request): AuthedUser | undefined =>
  (req as unknown as { user?: AuthedUser }).user;

/**
 * Stable identifier for the acting principal: email when the token carries one,
 * otherwise the token subject. Null when unauthenticated — callers respond 401
 * rather than substituting a placeholder.
 */
export function authedActor(req: Request): string | null {
  const u = user(req);
  if (!u) return null;
  if (u.email) return String(u.email).toLowerCase();
  const subject = u.id ?? u.userId;
  if (subject === undefined || subject === null || subject === '') return null;
  return String(subject);
}

/**
 * Numeric user id for subsystems whose `users.id` is an integer. Null when the
 * subject is absent or not numeric — never a parse of a client-supplied header.
 */
export function authedUserId(req: Request): number | null {
  const u = user(req);
  const raw = u?.id ?? u?.userId;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Display name for the acting principal, falling back to their identifier. */
export function authedActorName(req: Request): string | null {
  const u = user(req);
  if (u?.name) return String(u.name);
  return authedActor(req);
}

/** Verified roles, uppercased. Empty when the token grants none. */
export function authedRoles(req: Request): string[] {
  const raw = user(req)?.roles;
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  return list.map(r => String(r).trim().toUpperCase()).filter(Boolean);
}
