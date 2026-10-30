/**
 * Who may be named on a Vault version's review route, before anyone is named
 * (RR1b of docs/design/REVIEW_ROUTING_2026-10-23.md, §2.5–§2.6): the picker's
 * read behind Send for review, Send again and Name reviewers.
 *
 * Every active member of this organization, each with what the one validator,
 * validateRouteMember, answers for them as a reviewer and as an approver — null
 * when they may be named, else the refusal (code and sentence) the send would
 * give. So the picker offers exactly the people the send admits, and says why
 * each other one is not offered, from the same rules rather than a copy of
 * them. Nothing is written; the send validates every person again under the
 * record's row lock.
 *
 * Before the version's lifecycle record exists (a first send), its authors are
 * the version's uploader and the reader, who will start the record when they
 * send it; the validator is handed that authorship instead of reading it from
 * a record that is not there yet. Once the record exists, the validator reads
 * the record's own authorship, as the send does.
 *
 * For a reassignment (RR3, `forReassign`) on a version whose route is open,
 * the validator is asked as the reassignment asks it: the route's own sender is
 * the sender, the reader is the actor (who cannot name themselves), and
 * everyone on the route is already named.
 *
 * Every statement carries the organization.
 *
 * @module server/services/review/review-route-candidates
 */
import { findVaultLifecycleRecord, readVaultLifecycleSource } from '../vault/vault-lifecycle';
import { ReviewRouteRefusal, validateRouteMember } from './review-route-member';
import { routeStanding, routeSubjectTarget, type RouteQueryable, type RouteRole } from './review-route-standing';
import { printedNameOf, senderTimeZone } from './review-route';

export interface RouteCandidateRefusal {
  code: string;
  message: string;
}

export interface RouteCandidate {
  id: number;
  /** The printed name the route would record at naming. */
  name: string;
  /** Null when they may be named as reviewer; else why not. */
  reviewer: RouteCandidateRefusal | null;
  /** Null when they may be named as approver; else why not. */
  approver: RouteCandidateRefusal | null;
}

export interface RouteCandidates {
  /** The time zone each due date is the end of a day in (the reader's notification setting, else UTC). */
  timeZone: string;
  /** The version's lifecycle record, when one has been started. */
  canonicalId: string | null;
  candidates: RouteCandidate[];
}

/** The most members a picker lists; an organization larger than this is refused rather than cut short silently. */
const MAX_MEMBERS = 500;

async function answer(run: () => Promise<unknown>): Promise<RouteCandidateRefusal | null> {
  try {
    await run();
    return null;
  } catch (err) {
    if (err instanceof ReviewRouteRefusal) return { code: err.code, message: err.message.replace(/ Nothing was sent\.$/, '') };
    throw err;
  }
}

/** Who sends and who is already named: the reader and nobody at a send; the open route's sender and members at a reassignment. */
async function namingContext(
  q: RouteQueryable,
  p: { organizationId: number; readerId: number; forReassign?: boolean; canonicalId: string | null },
): Promise<{ senderId: number; named: ReadonlySet<number> }> {
  if (!p.forReassign || !p.canonicalId) return { senderId: p.readerId, named: new Set() };
  const standing = await routeStanding(q, { organizationId: p.organizationId, subjectType: 'canonical_document', subjectId: p.canonicalId, inReview: true });
  return namingOf(standing, p.readerId, true);
}

/**
 * Every active member of the organization, each with the validator's answer
 * as reviewer and as approver, for one subject (the Vault version's picker
 * above; the QMS document's, RR4, server/services/qms/qms-review-route.ts).
 * Throws on a read failure.
 */
export async function listRouteCandidates(
  q: RouteQueryable,
  p: {
    organizationId: number; subjectTarget: string; programId: string | null; contentDigest: string; readerId: number;
    naming: { senderId: number; named: ReadonlySet<number> };
    authorship?: { authors: readonly number[]; sources: readonly string[] };
  },
): Promise<RouteCandidate[]> {
  const { rows } = await q.query(
    `SELECT u.id FROM organization_users ou JOIN users u ON u.id = ou.user_id
      WHERE ou.organization_id = $1 AND u.status = 'active'
      ORDER BY lower(COALESCE(NULLIF(trim(u.name), ''), u.email)), u.id
      LIMIT $2`,
    [p.organizationId, MAX_MEMBERS + 1],
  );
  if (rows.length > MAX_MEMBERS) throw new Error(`More than ${MAX_MEMBERS} members: the picker cannot list them all`);
  const candidates: RouteCandidate[] = [];
  for (const row of rows) {
    const candidateId = Number(row.id);
    let name = `Account #${candidateId}`;
    const ask = (role: RouteRole) => answer(async () => {
      const v = await validateRouteMember(q, {
        organizationId: p.organizationId, subjectTarget: p.subjectTarget, programId: p.programId, contentDigest: p.contentDigest,
        role, candidateId, senderId: p.naming.senderId, actorId: p.readerId, named: p.naming.named, authorship: p.authorship,
      });
      name = v.printedName;
    });
    const reviewer = await ask('reviewer');
    const approver = await ask('approver');
    if (reviewer && approver) name = await printedNameOf(q, p.organizationId, candidateId);
    candidates.push({ id: candidateId, name, reviewer, approver });
  }
  return candidates;
}

/** Who sends and who is already named on a live route, for a reassignment's read (RR3); the reader and nobody otherwise. */
export function namingOf(standing: { state: string; route: { senderId: number } | null; members: Array<{ userId: number }> }, readerId: number, forReassign?: boolean) {
  if (!forReassign || standing.state !== 'live') return { senderId: readerId, named: new Set<number>() };
  return { senderId: standing.route!.senderId, named: new Set(standing.members.map((m) => m.userId)) };
}

/**
 * The candidates for one Vault version of this organization, or null when the
 * version is not this organization's live version. Throws on a read failure:
 * an unread member list is never an empty one.
 */
export async function readRouteCandidates(
  q: RouteQueryable,
  p: { organizationId: number; vaultId: string; readerId: number; forReassign?: boolean },
): Promise<RouteCandidates | null> {
  const source = await readVaultLifecycleSource(q, p.organizationId, p.vaultId);
  if (!source) return null;
  const canonicalId = await findVaultLifecycleRecord(q, p.organizationId, p.vaultId);
  let authorship: { authors: number[]; sources: string[] } | undefined;
  if (!canonicalId) {
    const uploader = await q.query(
      `SELECT created_by FROM vault.documents WHERE id = $1::uuid AND organization_id = $2`, [p.vaultId, p.organizationId]);
    const authors = [p.readerId, ...(uploader.rows[0]?.created_by == null ? [] : [Number(uploader.rows[0].created_by)])];
    authorship = { authors, sources: ['Vault uploader', 'lifecycle record creator'] };
  }
  const naming = await namingContext(q, { ...p, canonicalId });
  const candidates = await listRouteCandidates(q, {
    organizationId: p.organizationId, subjectTarget: routeSubjectTarget('canonical_document', canonicalId ?? ''),
    programId: source.programId, contentDigest: source.contentHash, readerId: p.readerId, naming, authorship,
  });
  return { timeZone: await senderTimeZone(q, p.readerId), canonicalId, candidates };
}
