# F1: the document path and CMC / Module 3 walked in the running app, and the server repairs it found

**Package F1 (repairs). Launch rows D2, D5 and D7.** Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-11 and
-12, at the founder's direction to get what is built surfaced correctly in the UI and working for GA.

Two people-paths were driven through the real screens at head `31047492b7`, on the W3 validation installation
(PostgreSQL 16, RLS enforced as `app_service`, no AI provider), signed in as real identities with password and
authenticator, three people where the path needs three:

- **The document path:** project, Data Room upload, document start, the one editor (write, Cite, save), checks, send
  for review, the reviewer's decision and signature, the approver's signature and seal, file to Vault, the Vault
  record, placement into a sequence.
- **CMC / Module 3:** the 23 records of a complete Module 3 entered through the register forms, compile, method
  validation, the contradiction sweep, a rejected batch, section approvals, the final-export gate, placement.

This folder holds what the walks found and the four **server** repairs made from them. The screen repairs are
separate changes.

## What already exists

Nothing was built. Each repair is in the code that already does the job:

| Piece | Path | What it does | What was wrong |
|---|---|---|---|
| The single-row chain verifier | `server/services/audit/chain-row.ts` `verifySequencedRow` | Re-derives one audit row's hash from its predecessor. 13 readers rest on it, among them the release gate's independent-check ledger | It hashed the row's timestamp as the driver handed it over |
| The Module 3 placement | `server/services/cmc/place-module3-into-submission.ts` | Files each approved section as a leaf, with a snapshot document | A repeat of an identical placement rewrote every snapshot |
| The Module 3 composer | `server/services/module3Composer.ts` | Composes each section's text from the registers | Two sentences stated things the records do not |
| The final-export gate | `server/services/cmc/final-export-gate.ts` | Says why an export is refused | It called stale drafts "stale after approval" |

## The repairs

### 1. An approved, sealed document could not be placed into a sequence (the path's blocker)

Seen in the walk: "Place into filing" in the editor and "Place a project document" in the Builder both answered 409
`INDEPENDENT_CHECK_REQUIRED`, for a document whose checks were current with nothing open. Only the Vault record's
own "Place into filing…" worked.

Cause: the placement reads on the request's drizzle connection. Drizzle's `execute` returns a `timestamptz` as
PostgreSQL's text (`2026-11-12 00:36:03.117+00`); node-postgres returns a Date. The chain writer hashed the ISO form.
`verifySequencedRow` hashed the text as it stood, so every ledger row read that way was "broken" and the gate
refused. PGlite returns a Date on both paths, so no in-memory suite could see it, the founder-path walk included.

Repair: the verifier reads PostgreSQL's text form back to the instant before hashing. Anything else is left as
given. `01-chain-row-red-green.txt` (3 red, then 8 of 8); `05-live-checks.txt` items 1 and 2: the gate reads
`current` on both paths, and the editor's request answers 201, filed as approved under its seal.

The same verifier serves AnA's turn records, chat threads, Vault history access, saved assembly sources and the
report seal. Any of those read on a drizzle connection had the same false "broken".

### 2. Placing an unchanged Module 3 again rewrote it and voided the release signature

Recorded on 2026-11-10 for the CMC owner (VSR-001 §21.8) and met again in the walk. A repeat added no leaf but wrote
21 new filing documents, left the earlier 21 unreferenced, and changed the leaf manifest, so a release signature
stopped clearing the sequence although no content had changed.

Repair: a section whose leaf already files exactly the title and text the placement would file is left as it is, and
the answer says `unchanged`. A changed section is filed again and its leaf updated in place, as before. A leaf whose
document cannot be read is filed again, never assumed unchanged. `02-repeat-placement-red-green.txt`;
`05-live-checks.txt` items 3 and 4. OQ-008 v0.14 asserts it (VSR-001 §21.9).

### 3. Two compiled sentences were untrue

- §3.2.P.3, with a batch rejected under signature: "Representative batch: B3 … disposition: rejected, released by
  <the signer>". A rejected batch is no longer read by the section; a batch whose decision is pending is given no
  disposition; the release clause still comes from one batch only.
- §3.1: "The drug substance is BX-733 5 mg film-coated tablet." The name is now read from the substance record.

`03-compiled-text-red-green.txt` (7 red, then 154 of 154; 1,618 pass across the 65 suites around the composer).

### 4. The gate called stale drafts "stale after approval"

With nothing approved and two drafts stale the build screen read "2 section(s) went stale after approval and must be
re-approved". The gate now counts the approved ones apart (`staleApprovedSections`, also on the readiness read) and
says of stale drafts that they need a compile. `04-gate-sentence-red-green.txt`.

## What the walks found beyond these (not repaired in this change)

**CMC screens** (`client/src/concept2cure/v2/surfaces/Cmc*`):
- **A person cannot record the drug product's shelf-life claim**: the stability form has no field for it, so §3.2.P.8
  stays at 0%; the only control is a Part 11 close-out the author's role cannot sign.
- A signed batch rejection never shows (the row reads "Pending" with a live "Release").
- A successful placement shows no result (the control remounts and loses its verdict).
- Stale sections read "Draft" with a live "Approve section" on the Overview; two counts are stale until reload.
- The method form has no field for per-characteristic ICH Q2 evidence, so the ICH check cannot be cleared.
- Signature dialogs accept a blank authenticator code and word the refusal "HTTP 401..".
- 22 of the 23 register forms, compile, validation, the sweeps, the refusal and resolution of a critical finding,
  on-screen approvals, the gate and the sequence all worked.

**The document path** (the editor, review, Vault):
- A document edited during review deadlocks: the signature and a new request are both refused
  `ROUTE_CONTENT_CHANGED`, and the board has dropped the document. **→ review rules.**
- The approver sees "No documents in this project yet": Send for review names reviewers only. **→ review rules.**
- A template document cannot be approved once checks run: 48 "empty section · Blocks approval" findings and no way to
  remove a section or mark it not applicable.
- After approving, the reviewer has no door to the signature; the reviewer's notification button answers 422; the
  author's "Returned for revision" notice has no button.
- The author cannot run the independent check; the reviewer's dialog calls it "optional", and once run it blocks.
  **→ the founder:** whether it is required before a review approval.
- A citation reads as a raw file name outside the Section view; the attribution panel says "nothing is cited" on a
  cited section.
- No screen shows the sealed version a Vault copy was rendered from (recorded since `46d849a026`).
- In the Builder every Module 3 leaf and the Vault leaf read "Source evidence not yet determined".
- Create project, upload, new document from a template, save with a reason, Cite, send for review, the reviewer's
  task and decision, both e-signatures, file to Vault with the approval carried, and placement from the Vault worked.

`shots/` holds eight of the walks' screenshots for the items above.

## Not done

- The screen repairs listed above.
- `tests/db/*.dbtest.ts` (real PostgreSQL) were not run. Repair 1 was proven on real PostgreSQL by the live checks.
- `server/api/cmc/__tests__/module3OperatingSystemRoutes.test.ts` "refuses to approve a section whose own compiled
  record is incomplete" fails on trunk without these changes: it expects raw field keys in a message that now uses
  words. **→ CMC.**
