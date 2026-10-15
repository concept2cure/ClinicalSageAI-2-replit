# D5 — a co-author document save states its reason, keeps the text it replaces, and is recorded (2026-10-01)

Row **D5**. Lane: `…session_01SuVLo2`, claimed `7896303d`. This closes hand-on item 5 of 2026-09-28, the editor-family review's only open blocker:
- **P11-B-1 (blocker).** A co-author document's text was overwritten with no reason, no audit entry and no copy of the text it replaced.
- **P11-B-3, folded in.** A filing copy carrying a verdict opened with an enabled Save.

Holds by `…01KiDof7` (`coauthor.ts`) and `…01PwLFr8` (`EctdCoauthor.tsx`) lapsed on 2026-09-29. Neither lane had a row.

## Before (measured at `38105908`)

| Door | Reason | Replaced text kept | Audit row |
|---|---|---|---|
| `PUT /api/coauthor/documents/:id` (the editor's one save path) | Not read | No | No |
| `PUT /api/ectd-documents/:id` | Not read | No | No |
| Filing-copy re-take (`POST /api/coauthor/documents` with a source) | A fixed sentence | **No.** An author's saved co-author edits were replaced and only their digest was kept. | Yes |
| `DELETE` on either route | A fixed sentence | n/a | Yes, but a document a batch draft had been accepted into **answered 500**. The version table's foreign key has no `ON DELETE` action, so every edited document would have done the same once saves kept versions. |
| The surface | The client sent `{ content }` only | | An approved row opened editable, with Save enabled |

## After

**The decision.** Every write states its reason (`changeReason`, held to the server's one rule, `requireGovernedReason`: 8 to 2,000 characters). A content save is included.

The other two hosts of the same editor already require one on every save: `PATCH /api/authoring/sections/:id` and `PATCH /api/protocol-development/sections/:id`. Three hosts of one editor should hold one rule.

This session first said a draft save would not need a reason. It changed that once it read the sibling hosts.

### What the writer does (`server/services/coauthor/coauthor-status-write.ts`, rule 4)

- **Order.** The reason is checked after the existing refusals (404, `STATUS_NOT_SETTABLE`, `FINALIZED_DOCUMENT_READ_ONLY`), and only when there is something to write. Those refusals are unchanged, and a restate or an empty PUT needs no reason.
- **One transaction.** The row stays held `FOR UPDATE` while the writer:
  - keeps the replaced text as the next `coauthor_document_versions` row (summary: the reason);
  - updates the row;
  - writes `coauthor_document.updated`, recording the actor, the reason, what changed, and before and after values for status, title, module, eCTD section and region, and the content's sha256, plus `supersededVersion`.

  If the audit write fails, nothing is written.

### One writer of the version table (`versionReplacedCoauthorContent`, `coauthor-audit.ts`)

The PUTs, batch-draft accept and the filing-copy re-take all use it. Each holds the document's row lock, so `MAX + 1` is not raced. Batch-draft's inline `INSERT` is gone.

### The delete (`deleteCoauthorDocument`, `coauthor-audit.ts`)

Both DELETE handlers call it. It:
1. locks the row, then counts its versions in a separate statement;
2. refuses with 409 `DOCUMENT_HAS_HISTORY` when versions exist, deleting nothing;
3. otherwise deletes the document and records the person's stated reason, held to the same rule, or null.

The fixed sentence it used to write in the person's place is gone. No client calls either DELETE today.

**The decision on the delete.** Keep the history. Deleting the versions with the document was the alternative; for a regulated record the conservative choice is to refuse.

### What the surface does (`EctdCoauthor.tsx`)

- **Before the click.** The reason field states the requirement:
  - a required marker, plus `aria-required`;
  - the floor and where the reason is recorded, in a note the field is described by;
  - a maximum length.
- **The host's Save** is disabled until the text has changed and the reason meets the floor.
- **⌘S without a reason** (in the canvas or in the field) is refused at the field, which takes focus and shows itself invalid. Nothing is sent.
- **A reason describes one save.** It is cleared after a confirmed save and when the document changes.
- **A verdict row** (the server's `readOnly`, from `withCoauthorReadOnly`) opens read-only, with a note and no reason field.
- **A 409** (the row became a filing copy while open) re-reads the row, so the canvas becomes read-only with its real status.

## Red, then green

| Suite | Red on trunk (this change's sources swapped for `HEAD`'s) | Green |
|---|---|---|
| `coauthorPutStatus.test.ts` (PGlite, both real routers) | **20** of its cases (`red/final-on-trunk.txt`). Both PUTs answer 200 with no reason and write no version or event. The DELETE of a batch-drafted document answers **500** on both routes (`red/server-assertions.txt`). | 63/63 |
| `coauthorSnapshotFromSource.test.ts` | **2**: the re-take keeps no version, and the author's save writes no event | 45/45 |
| Client: `ectdCoauthorNoFixtures`, `ectdCoauthorFinalizedRefusal`, `ectdCoauthorReadOnly` (new) | **6**: no reason field, Save enabled with none, an approved row editable | 16/16 |
| `coauthor-document-delete-audit.contract` (mocked client) | 14. **Restated, not red-first.** The delete now reads the row and its count before it deletes, so the mock answers that shape. The behaviour is pinned on a real database by `coauthorPutStatus.test.ts`. | 14/14 |
| `ci:regulated-delete-audit` | `red/regulated-delete-audit-gate.txt`. The delete moved into `server/services/coauthor/`, which a routes-only scan no longer saw, so the gate now scans that directory too. With the delete's audit call removed it fails, naming the line. | `green/regulated-delete-audit-gate.txt` |

`green/final.txt` covers all eight suites: **166/166**, including both batch-draft suites.

`green/wide-run.txt` is every suite that names these routes or writers: **1486 passed, 5 failed, in one file**, `tests/lineage/founder-path-lineage.pglite.test.ts`. The founder path fails identically with `HEAD`'s copies of this change's files (`green/founder-path-on-trunk.txt`): its harness lacks `cre_evidence_sources.created_by`, which `47406f76` (VR-16b, `…01DiJJAk`, 13:46 today) began writing. That is another lane's file, inside its 24 hours, so it is handed on (board).

## The review

Two independent read-only reviews ran: a security and atomicity review, and a Part 11 UX review.

**Fixed before commit:**
- **The audit vocabulary.** `coauthor_document.updated` had been added to the vocabulary an administrator may record by hand (`audit-api-authority.ts`), which would let a hand-written row pass for the server's. It is reverted. `.deleted` and `.retaken` already sit there (pre-existing, handed on).
- **The reason carried over between saves.** It is cleared after a confirmed save.
- **A delete could race a concurrent save into a 500.** The count is now taken after the lock.
- **The delete's stated reason had no floor or ceiling.** It now follows the same rule.
- **Replaced eCTD section and region were not recorded.** They are now recorded before and after.
- **The client's `systemReason` branch** was dead (no comment anchors on this surface), and would have recorded a mechanism's sentence as the person's reason. It is removed.
- **The requirement was not visible before the click.** Save was enabled with no reason, and the field had no required or invalid state.
- **`ci:regulated-delete-audit`** no longer saw the delete.
- **The writer's header overclaimed** that no composed reason remains.

**Traced and sound:**
- **Atomicity.** The version, the update and the event share one transaction; batch-draft's request client holds its `BEGIN`/`COMMIT`.
- **Tenant.** Versions are only reached through the organisation's locked row.
- **RLS.** Nothing is weaker. The old eCTD DELETE dropped its organisation predicate when the id was falsy; the new one always scopes.
- **Refusals.** The order is unchanged.

## Not done, recorded

- **Another writer of these rows, unaudited.** `classifyDocument` (`server/services/ingestion/ingestion-service.ts`, `POST /api/ectd-documents/:id/classify` and an AnA tool) rewrites `module_number` from model output on any row, a verdict row included. It writes no reason, no version and no event, and holds no lock.
  - This is NEW-P11-B-1a, claimed by the editor-family lane on 2026-09-28 with no commit since. It is the next slice of this lane if it is still open when that claim is a day older.
  - `extractStructure` and the compile route do stale metadata writes of the same kind.
- **Four copies of one reason field.** `PlacementReasonField` (`filingTarget.tsx`), `SectionReason` (`ProtocolDevSection.tsx`), DocumentWorkbench's field, and this one.
  - This one follows the hardened placement contract.
  - Making one shared field needs `filingTarget.tsx`, which `f823ca21` (PF-11) changed at 02:07 today. Handed on until that hold lapses.
- **A verdict row with no versions can still be deleted.** The filing-copy re-placement flow ("a deleted copy can be placed again") depends on it, so refusing it is a product decision, not a cleanup.
- **The audit trail's own integrity.**
  - These events are `audit_events` rows, whose hash chain does not cover `metadata`, so the before and after digests sit outside the chain.
  - The version table has no immutability trigger.
  - The organisation purge (`PURGE_CHILD_TABLES`) lists neither `coauthor_documents` nor its versions. Each save now keeps a full prior copy, so erasure has more to reach; a purge must delete versions first.
- **Composed reasons remain** in the re-take and in batch-draft accept (pre-existing).
- **No version or history view** exists on the surface to read the trail back.
- **Other gaps:**
  - The `readOnly` field is on the `/api/coauthor` responses only; the `/api/ectd-documents` responses are hand-built and no client reads them.
  - `coauthorAuditActor` falls back to the name "System".
  - `PUT /api/coauthor/documents/:id` takes any authenticated member, while the eCTD route requires `regulatory-author` (pre-existing).
- **The lineage-gate follow-on** (`enforceAuthorLineage` on the co-author PUT) from the triage is not done.
