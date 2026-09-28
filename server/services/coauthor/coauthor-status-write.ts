/**
 * What a client-supplied PUT may do to a coauthor_documents row.
 *
 * 2026-09-23 (W5/D7, round-3 review): ONE rule for both routes that write this
 * row from a request body — PUT /api/coauthor/documents/:id (routes/coauthor.ts)
 * and PUT /api/ectd-documents/:id (routes/ectd-documents.ts). Round 2 put a
 * hand-written check in the first and missed the second, which wrote `status`
 * verbatim behind requireRole('regulatory-author') — a role every org
 * 'member' holds — so the transmit bypass was still one request away. It was
 * also a denylist of the leaf resolver's two finalized values, while the IND
 * checklist and NDA cockpit read the same column and count `signed` and
 * `locked` as complete; and it let the content of an approved snapshot be
 * rewritten under its approved status. Both routes now import this module and
 * carry no copy of the rule.
 *
 * ── The vocabulary of coauthor_documents.status ─────────────────────────────
 * shared/schema.ts documents `draft, in-progress, review, approved, finalized`
 * (default 'draft'). The readers that map it
 * (ind-lifecycle/ind-checklist-view-assembler.ts and
 * nda/nda-modules-view-assembler.ts, STATUS_MAP) also know `in_progress`,
 * `signed` and `locked`, and count approved | signed | locked — with finalized
 * mapped to locked (2026-09-23, W5/D7, co-author final pass: it was mapped to
 * signed, which claimed a signature a freeze does not carry) — as COMPLETE.
 * The leaf resolver
 * (ectd/leaf-source-resolver.ts, isFinalizedStatus(.., 'coauthor_documents'))
 * counts approved | finalized as filable. Split by who may set them:
 *
 *   WORKING  draft, in-progress, in_progress, review — the author's own
 *            states; every reader maps them to drafting / qa_review.
 *   VERDICT  approved, finalized, signed, locked — each makes some reader say
 *            "done" or "filable". None is the caller's to award: the POST
 *            snapshot handler derives approved / finalized from the source
 *            authoring document's APPROVED / FROZEN state, and
 *            cmc/place-module3-into-submission.ts inserts approved snapshots.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *   1. A PUT may SET only a working state. The value is compared trimmed and
 *      lower-cased and written in that canonical form. An ALLOWLIST: a value
 *      nobody has thought of yet is refused, not written.
 *   2. Any other value is accepted only as a RESTATE of the row's current
 *      status, compared the same way ('Approved' on an 'approved' row). A
 *      restate writes nothing to the status column. Otherwise: 400
 *      STATUS_NOT_SETTABLE and nothing is written.
 *   3. A row whose current status is a verdict is read-only to a PUT's
 *      governed fields (title, content and — on the eCTD route — module): 409
 *      FINALIZED_DOCUMENT_READ_ONLY, nothing written. A placed snapshot is
 *      what was approved; place-module3-into-submission.ts files it on the
 *      stated premise that "nothing edits placement snapshots, and upsertLeaf
 *      pins its sha256" — and upsertLeaf re-pins on every update, so an edit
 *      here would be shipped as approved on the next re-save of the leaf.
 *      Withdrawing a verdict to a working state (a status-only PUT) stays
 *      allowed: it can only make transmit refuse.
 *
 *      2026-09-23 (W5/D7, round-3 review, repair 1): the refusal used to tell
 *      the author to "edit the source authoring document and place it into
 *      the filing again". That path failed: a second copy of one source was
 *      refused by the alias map (as a 500), before and after a delete. The
 *      path now works — services/coauthor/coauthor-snapshot.ts re-takes the
 *      SAME copy from its source — and the copy says what it does.
 *
 *      2026-09-23 (W5/D7, co-author final pass): rule 3 governs the COLUMN,
 *      not only these two PUTs. The other client-reachable writer of a row's
 *      content, POST /api/batch-draft/documents/:id/accept, imports
 *      isCoauthorVerdictStatus and coauthorReadOnlyRefusal and refuses a
 *      verdict row the same way, on the row it holds FOR UPDATE.
 *
 * The row is read FOR UPDATE inside one transaction and rules 2 and 3 are
 * decided on that locked row, so a concurrent status change cannot turn a
 * restate into a promotion or let an edit land on a row that became approved
 * in between. 2026-09-23 (W5/D7, round-3 review, repair 1): this replaced an
 * UPDATE … WHERE lower(btrim(status)) guard. btrim strips spaces only while
 * the JS rule trims all whitespace, so a stored 'approved\t' was a verdict to
 * one side and editable to the other; there is now one normaliser, in JS.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { coauthorDocuments } from '../../../shared/schema';
import { isFinalizedStatus } from '../ectd/leaf-source-resolver.js';

type CoauthorRow = typeof coauthorDocuments.$inferSelect;

/** The states an author moves a document between. The ONLY values a PUT may set. */
export const COAUTHOR_WORKING_STATUSES: readonly string[] = Object.freeze([
  'draft',
  'in-progress',
  'in_progress',
  'review',
]);

/**
 * Sign-off states the IND checklist / NDA cockpit readers count complete but
 * the leaf resolver does not count filable. The resolver's own finalized set
 * is not copied here — it is asked, through isFinalizedStatus.
 */
const SIGN_OFF_STATUSES: ReadonlySet<string> = new Set(['signed', 'locked']);

/** Every value the codebase documents or reads for coauthor_documents.status. */
const DOCUMENTED_VOCABULARY: readonly string[] = [
  ...COAUTHOR_WORKING_STATUSES,
  'approved',
  'finalized',
  'signed',
  'locked',
];

/** The comparison form: trimmed, lower-cased. */
export function normalizeCoauthorStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

/** A status some reader treats as done / filable. */
export function isCoauthorVerdictStatus(status: string | null | undefined): boolean {
  const n = normalizeCoauthorStatus(status);
  return isFinalizedStatus(n, 'coauthor_documents') || SIGN_OFF_STATUSES.has(n);
}

/** The verdict spellings, enumerated. (2026-09-23, repair 2: this said "for
 *  the SQL guard (rule 3)"; that guard was replaced in repair 1 by the JS
 *  decision on the locked row, and the list is now only exported and pinned.) */
export const COAUTHOR_VERDICT_STATUSES: readonly string[] = Object.freeze(
  DOCUMENTED_VOCABULARY.filter((s) => isCoauthorVerdictStatus(s)),
);

/* The two sets must partition the vocabulary, and no working state may be one
   the resolver files as finalized. Checked at load so a change to the
   resolver's set (or a new working state) that breaks the partition stops the
   server instead of silently letting a PUT award a verdict. */
for (const s of DOCUMENTED_VOCABULARY) {
  const working = COAUTHOR_WORKING_STATUSES.includes(s);
  if (working === isCoauthorVerdictStatus(s)) {
    throw new Error(
      `coauthor-status-write: '${s}' must be exactly one of working or verdict; ` +
        'the working allowlist and isFinalizedStatus(.., "coauthor_documents") disagree',
    );
  }
}

/** What the request's `status` asks for. */
export type CoauthorStatusPlan =
  | { kind: 'none' }
  | { kind: 'set'; value: string }
  | { kind: 'restate'; normalized: string; requested: string }
  | { kind: 'invalid' };

/** Control characters (C0 and DEL). Surrounding whitespace is trimmed first. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function planCoauthorStatusWrite(status: unknown): CoauthorStatusPlan {
  if (status === undefined) return { kind: 'none' };
  if (typeof status !== 'string') return { kind: 'invalid' };
  const n = normalizeCoauthorStatus(status);
  /* 2026-09-23 (W5/D7, round-3 review, repair 1): a NUL inside the value
     reached Postgres, which cannot store it, and came back a 500. No status
     in the vocabulary carries a control character, so it is refused here. */
  if (CONTROL_CHARACTER.test(n)) return { kind: 'invalid' };
  if (COAUTHOR_WORKING_STATUSES.includes(n)) return { kind: 'set', value: n };
  return { kind: 'restate', normalized: n, requested: status };
}

export interface CoauthorPutRefusal {
  httpStatus: 400 | 404 | 409;
  body: Record<string, unknown>;
}

export type CoauthorPutOutcome =
  | { ok: true; document: CoauthorRow }
  | { ok: false; refusal: CoauthorPutRefusal };

const WORKING_LIST = 'draft, in-progress, in_progress or review';
/** For API consumers; kept out of `message`, which the client shows and which
 *  must not carry a route (queryClient.serverMessage drops such copy).
 *  2026-09-23 (W5/D7, round-3 review, repair 2): an APPROVED or FROZEN source
 *  is now re-taken only while its sections are the ones its seal recorded
 *  (services/coauthor/coauthor-snapshot.ts); the path says so. */
const GOVERNED_PATH =
  'POST /api/coauthor/documents with sourceAuthoringDocId — re-takes this copy (status, title, text) from its ' +
  'source authoring document; an APPROVED source files as approved, FROZEN as finalized, only while its ' +
  'sections and title are the ones its seal (frozen_documents) recorded';

function statusNotSettable(requested: string, current: string): CoauthorPutRefusal {
  return {
    httpStatus: 400,
    body: {
      error: 'STATUS_NOT_SETTABLE',
      message:
        `A document's status can be set here only to a working state (${WORKING_LIST}). ` +
        `'${requested}' is not one. Approved, finalized, signed and locked are never supplied: ` +
        'they are taken from the source authoring document when it is placed into a filing. ' +
        'Nothing was changed.',
      allowed: COAUTHOR_WORKING_STATUSES,
      currentStatus: current,
      governedPath: GOVERNED_PATH,
    },
  };
}

/**
 * The refusal for a write to a verdict row's governed fields. Exported so every
 * client-reachable writer of those columns refuses in the same words.
 * 2026-09-23 (W5/D7, co-author final pass): POST /api/batch-draft/documents/
 * :id/accept (routes/batch-draft-routes.ts) wrote content into verdict rows;
 * it now refuses with this.
 */
export function coauthorReadOnlyRefusal(current: string): CoauthorPutRefusal {
  const status = normalizeCoauthorStatus(current);
  return {
    httpStatus: 409,
    body: {
      error: 'FINALIZED_DOCUMENT_READ_ONLY',
      /* 2026-09-23 (W5/D7, round-3 review, repair 1): names a path that
         works. It said "Edit the source authoring document and place it into
         the filing again"; an approved or frozen source cannot be edited, and
         placing it again failed. Placing it again now re-takes this copy. */
      /* 2026-09-23 (W5/D7, co-author close): it said every verdict copy "was
         signed off for a filing" and that an edit "would file text nobody
         approved". A 'finalized' copy comes from its author's freeze, with no
         signature or approval, so the message now states only what the status
         says. */
      message:
        `This document is ${status} and read-only: it is the copy placed into a filing as ${status}, and ` +
        `changing it here would file text other than the text that was ${status}. Its text ` +
        'comes from its source authoring document and changes only when that document is placed ' +
        "into the filing again, which re-takes this copy from the source's current text and status. " +
        'Nothing was saved.',
      currentStatus: current,
      governedPath: GOVERNED_PATH,
    },
  };
}

/**
 * Apply one PUT to a coauthor_documents row under the rule above.
 *
 * `governed` holds the fields a verdict freezes (already mapped to column
 * names); `ungoverned` holds the rest (e.g. the eCTD route's metadata), or
 * builds them from the locked row so a merge cannot lose a concurrent write. A
 * request that changes nothing — no governed field, no ungoverned field, and a
 * status that is absent or a restate — writes nothing and returns the row.
 */
export async function applyCoauthorDocumentPut(args: {
  documentId: number;
  organizationId: number;
  status: unknown;
  governed: Partial<Pick<CoauthorRow, 'title' | 'content' | 'moduleNumber'>>;
  ungoverned?:
    | Partial<Pick<CoauthorRow, 'metadata'>>
    | ((current: CoauthorRow) => Partial<Pick<CoauthorRow, 'metadata'>>);
}): Promise<CoauthorPutOutcome> {
  const { documentId, organizationId, governed } = args;
  const plan = planCoauthorStatusWrite(args.status);
  if (plan.kind === 'invalid') {
    return {
      ok: false,
      refusal: {
        httpStatus: 400,
        body: {
          error: 'STATUS_NOT_SETTABLE',
          message: 'status must be a string naming a status, with no control characters. Nothing was changed.',
        },
      },
    };
  }

  const defined = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const governedSet = defined(governed as Record<string, unknown>);
  const editsGoverned = Object.keys(governedSet).length > 0;
  const scope = and(
    eq(coauthorDocuments.id, documentId),
    eq(coauthorDocuments.organizationId, organizationId),
  );

  // 2026-09-23 (W5/D7, round-3 review, repair 1): decided on the row locked
  // FOR UPDATE, with the one JS normaliser (see the header).
  return db.transaction(async (tx): Promise<CoauthorPutOutcome> => {
    const [current] = await tx.select().from(coauthorDocuments).where(scope).limit(1).for('update');
    if (!current) {
      return { ok: false, refusal: { httpStatus: 404, body: { error: 'Document not found' } } };
    }
    // Rule 2: a non-working value is only a restate of what the row already holds.
    if (plan.kind === 'restate' && normalizeCoauthorStatus(current.status) !== plan.normalized) {
      return { ok: false, refusal: statusNotSettable(plan.requested, current.status) };
    }
    // Rule 3: a verdict row's governed fields are frozen.
    if (editsGoverned && isCoauthorVerdictStatus(current.status)) {
      return { ok: false, refusal: coauthorReadOnlyRefusal(current.status) };
    }

    const ungoverned =
      typeof args.ungoverned === 'function' ? args.ungoverned(current) : (args.ungoverned ?? {});
    const set: Record<string, unknown> = {
      ...governedSet,
      ...defined(ungoverned as Record<string, unknown>),
    };
    if (plan.kind === 'set') set.status = plan.value;
    // A pure restate (or an empty PUT): nothing to write.
    if (Object.keys(set).length === 0) return { ok: true, document: current };

    set.updatedAt = new Date();
    const [document] = await tx.update(coauthorDocuments).set(set).where(scope).returning();
    return { ok: true, document };
  });
}
