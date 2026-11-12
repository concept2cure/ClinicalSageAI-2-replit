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
- No screen shows the sealed version a Vault copy was rendered from (recorded since `46d849a026`). **Repaired
  2026-11-12, below.**
- In the Builder every Module 3 leaf and the Vault leaf read "Source evidence not yet determined".
- Create project, upload, new document from a template, save with a reason, Cite, send for review, the reviewer's
  task and decision, both e-signatures, file to Vault with the approval carried, and placement from the Vault worked.

`shots/` holds eight of the walks' screenshots for the items above.

## Screen repairs, CMC (2026-11-12)

Each was used in the running app after the change, signed in as the author (a member with no signing authority) or
the second person; `shots/after-*.png`. Tests red first: `06-cmc-screens-red-green.txt`.

| Found | Repair | Used in the running app |
|---|---|---|
| A person cannot record the product's shelf-life claim | The stability registration form offers "Proposed shelf life" (not required). On a running study the Shelf life cell is its own control ("Set" / "Change"), an ordinary audited edit; the study stays open. The signed act is now labelled "Close out" (`cmcRegisterForms.ts`, `CmcModule.tsx`) | A study registered with "24 months at or below 25 °C" shows it; a second study went from "not set" to "18 months…" and stayed Active (`after-a1-*`) |
| A refused close-out hid the saved edit | The refusal says both facts and the row shows what was saved. The branch that said so was unreachable, because the request helper throws on a refusal | As the author: "The shelf life is saved and the study is still running. Couldn't save the close-out — Your role does not permit applying an electronic signature…" (`after-b8-01`) |
| A signed batch rejection never showed | The row reads the signed decision (`release_status`) before the working status, and adopts the answer where the route puts it (`data.batchRecord`). A released batch, whose status becomes `completed`, had read "Pending" too. The control is named "Disposition" and its button "Sign the disposition" (`cmcBatch.ts`, `CmcModule.tsx`) | Rejected under signature by the second person: "Batch … rejected · signed 2efad9f6a080…"; the row reads Rejected with no disposition control, and the same after a reload (`after-b2-*`) |
| A placement showed no result | The verdict is kept with the sequence it was made into and shown again when the board remounts the control. It says what was written: "Already placed. Nothing was written. All 21 sections in sequence 0001 are unchanged."; "1 section filed again; 20 unchanged, in sequence 0001" (`CmcPlaceIntoSubmission.tsx`) | On the fully approved programme of the OQ run, a repeat from the board (`after-b3-01`) |

| The QC sample type offered tokens ("raw-material", "in-process"…) and no word said which is drug substance evidence | Each option says where a result of it is filed, read from the shared rule the write-through applies (`qcSampleTypeOptions`, `cmcRegisterForms.ts`); the stored values are unchanged, and the field is full width so the words fit | "Finished product (drug product, §3.2.P.5.4)", "Raw material (drug substance, §3.2.S.4.4)", "Reference standard (not a batch analysis)" (`after-b12-01`; `09-qc-sample-type-red-green.txt`) |

The wording when an authenticator code is missing or wrong is repaired below ("A refused signature says why").

| The ICH Q2 check named every method "missing validation evidence: specificity, linearity / range, accuracy, precision", and nothing on the form could clear it | The register's table keeps the Q2 record in one JSON column and has no column per characteristic, so the write-through always sent null for the four values the check reads. The method form records each characteristic's result in the Q2 record (`evidence`), and the write-through reads it from there (`cmcRegisterForms.ts`, `cmc-write-through.ts` `q2Evidence`). No column, table or route | A new method added with its four results is not named missing evidence; the older, signed method still is, because its record is closed to edits under its signature (`after-b9-*`, `10-method-q2-evidence-red-green.txt`) |

Still open on the CMC screens: stale sections on the Overview (the board's section read sends no stale flag,
`server/routes/cmc-module3-board.routes.ts`).

**The editor's attribution legend** (`client/src/concept2cure/lineage/DocumentAttributionBar.tsx`) said of
author-asserted text "a person stands behind it; nothing is cited", on a section that cites a Data Room source. The
bar counts recorded origins; a citation marker in a sentence the author wrote does not make its recorded origin a
source, so the text is counted as the author's either way. The row now says "a person stands behind it, cited or
not" (red first in `10-…`). Whether a citation should move the sentence into "From sources" is the lineage
lane's question, not decided here. In
`CmcModule3Build.tsx` (held by the screen-work session): the remount itself, "21 ready to compile" after a compile,
and finding types shown as stored tokens.

## Screen repairs, the document path (2026-11-12)

| Found | Repair | Used in the running app |
|---|---|---|
| No screen showed the sealed version a Vault copy was rendered from | The Vault's version line says it, read from the verified filing receipt (`authoring-vault-filing-receipt.ts` `renderedFromOf`, attached by the versions read in `routes/c2c/project-vault.ts`, worded by `VaultVersions.tsx` `renderedFromText`). A seal that did not hold is said in words, never as its stored code. A receipt that does not verify or could not be read is said to be so and is never shown as a source. A native upload says nothing | On the walked document's Vault record: "rendered from the Authoring document’s sealed version “approved” (seal 1a98777beb8f)", beside the two Authoring signatures. The full hash is the line's title (`after-d1-01`) |

What already exists, for this one: the receipt reader and its derivation (`readAuthoringVaultFilingReceipt`, since
`46d849a026` with `source.sealedVersion` / `source.sealUnverified`), which the leaf's source evidence already reads;
the versions read, which already attaches each version's lifecycle, placements and refusals; and the version line,
which already prints them. One projection, one field on the read, one clause on the line. No route, table or screen
was added. `07-vault-seal-line-red-green.txt`: 10 new cases red on the committed code, then 45 of 45; the Vault's 70
client suites, 790 of 790.

## A refused signature says why (2026-11-12)

Seen in the CMC walk: a signer whose authenticator code was not accepted read "Couldn’t approve section … — The server
did not accept the change (HTTP 401).. Nothing was persisted."; a blank code was not caught by the form, which cannot
know whether the signer has one enrolled.

**What already exists.** `verifyReauth` (`server/routes/c2c/actions.ts`) is the one re-verification every high-risk
route uses, and it answered a `REAUTH_*` code. The sentences a signer is told for each code already existed, but only
inside the signature ceremony (`server/services/part11/governed-signature-ceremony.ts`, `REAUTH_MESSAGE`), so the
ceremony's routes said why and the nine routes that call `verifyReauth` directly sent the code alone. The CMC screens
read the server's sentence through `serverMessage`, and fell back to "HTTP 401" when there was none.

**The repair.** The sentences moved from the ceremony to `verifyReauth`, which now returns the sentence with the
code; the ceremony uses it, and the nine routes send it as `message` beside the unchanged code
(`api/cmc/{routes,specificationRoutes,batchRecordRoutes,module3OperatingSystemRoutes}.ts`,
`routes/c2c/{actions,documents}.ts`, `routes/510k-estar-routes.ts`, `routes/mdx-submission-gateway.ts` twice,
`routes/financial-disclosures.ts`). A client that reads the code is unchanged. On the CMC screens the sentence is
shown once, with one full stop (`cmcShared.tsx` `cmcRefusal`, used by `cmcWriteFailed` and the Overview), and the
specification and batch dispositions no longer write their own "re-authentication failed".

**Used in the running app** (`after-d2-01`, `after-d2-02`), as the run identity on an approvable §3.1: with the right
password and a wrong code, "Couldn’t approve section 3.1 — The authenticator code was not accepted. Nothing was
signed."; with no code, "… Your account has an authenticator enrolled: enter its current code to sign. Nothing was
signed." Both answered 401 with the code and the sentence, and the section stayed Draft.

`08-signature-refusal-red-green.txt`: 21 red on the committed code (one of them already red on trunk), 4 more on the
screen's half; then 142 of 143 with the change, the one being that trunk-red case; 3,504 of 3,521 across the 221
suites around it, where the other 14 are the report-pack export suite, which fails the same way on trunk.

## Not done

- The screen repairs not listed in the table above.
- `tests/db/*.dbtest.ts` (real PostgreSQL) were not run. Repair 1 was proven on real PostgreSQL by the live checks.
- `server/api/cmc/__tests__/module3OperatingSystemRoutes.test.ts` "refuses to approve a section whose own compiled
  record is incomplete" fails on trunk without these changes: it expects raw field keys in a message that now uses
  words. **→ CMC.**
