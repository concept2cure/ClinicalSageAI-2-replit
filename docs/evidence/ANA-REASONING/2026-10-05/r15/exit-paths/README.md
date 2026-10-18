# Round 14's nine-exit claim, verified

Round 14 asserted — without adversarial verification, and said so — that nine
server paths read `authoring_sections.content` directly and so bypass
`commitSectionToFiling`, the one writer that moves an authoring section's text
into `c2c_document_sections` (the filing). It named: freeze, e-sign, sign,
controlled export, send-to-packager, working copy, file-to-vault, submit to the
canonical spine, and the co-author snapshot.

It was carried forward as **a lead, not a finding**, and nothing shipped rested
on it. This is the check.

**Method.** Three independent read-only enumerations, each told to derive its
own list and then say where it agrees or differs: by SQL (every statement
naming `authoring_sections` in non-test `server/`, `scripts/`, `shared/`), by
governed act (each user-visible act on an authoring document, traced to where
its text comes from), and by destination (every writer into
`c2c_document_sections`, `frozen_documents`, the signature tables, the export
history, `vault.documents`, `coauthor_documents`, `concept2cure_artifacts` and
the submission leaf, traced back to its source). Each finding was then put to a
refuter told to default to "refuted" if it could not confirm from a file it
read. Every claim this file states, I also checked myself at the line.

## The verdict on the nine

| round 14 said | verified |
|---|---|
| freeze | **CONFIRMED.** Reads `authoring_sections` only; writes `frozen_documents` + `status='FROZEN'`; touches `c2c_documents` not at all. |
| controlled export | **CONFIRMED.** `doc_sha256` is `sectionsDigest` over the same rows. |
| file to vault | **CONFIRMED.** Its one content gate compares the editing layer to itself. |
| co-author snapshot | **CONFIRMED.** Its seal gate compares live `authoring_sections` to a `frozen_documents` seal of `authoring_sections`. |
| submit → canonical spine | **CONFIRMED as a read, CORRECTED as a target.** It projects into a third store, `concept2cure_artifacts`; `c2c_documents` is untouched. |
| send-to-packager | **REFUTED as a ninth reader.** It issues no SQL: it re-enters `POST /docs/:docId/export` over HTTP and inherits that route's gates and no others. Counting it separately double-counts the export. |
| working copy | **REFUTED as a defect.** Every page carries "DRAFT — uncontrolled copy · not a controlled record" and the route carries no §11.50 manifest by contract. It cannot pass for the filing. |
| e-sign | **CORRECTED.** Not blind to the filing. |
| sign | **CORRECTED.** Same. |

**The correction that matters most.** Both signature routes reach
`approveBoundFilingSections`, whose UPDATE carries an exact cross-store text
predicate — `AND (ds.content ->> 'text') = sig.text` — and reports every
divergent key in `notApproved` on the response. All three angles found this
independently, and it is **the only place in the server that compares the two
stores' text**. Round 14 called these plainly undetected; they are the two
paths with a real comparator. What remains at them is narrower: the signature's
`content_hash` and the snapshot it covers are computed from `authoring_sections`
alone, and nothing refuses a signature over a `notApproved` key.

## What the nine missed: the writers

The enumeration was all readers, so it never asked which **writers** of
`authoring_sections.content` skip the commit. There are nine write sites in
non-test server code and only three commit — the section save, the revert and
the AI-draft accept, matching the three `commitSectionToFiling` call sites. The
others write content and never touch the filing: **apply-template** (which
rewrites and inserts section content on a bound document), **create-section**,
and the **document-genesis seed loop** reached from `POST /docs`,
`POST /docs/from-draft` and the `draft_authoring_document` AnA tool — the last
seeding AI-drafted prose into a document in the same transaction that binds it
to a filing, while the 201 reports `bound: true`.

The repo already half-knew this: `coauthor-snapshot.ts` cites apply-template by
name as the reason its own seal check cannot trust the document lock.

And in the other direction: `PATCH /api/c2c/documents/:id/sections/:key` writes
the filing and never writes back, so text can enter the system of record that
no snapshot, export, vault file or signature will ever see.

## The structural finding, as it stands after the refuters

Every gate on every one of these paths compares the editing layer **to
itself**: `computeDocHash` over `authoring_sections` is what every signature's
`content_hash` is; the export's signature-coverage check compares a signature
to a digest of the same rows; file-to-vault's change-during-filing check
compares the rows to themselves; the snapshot's seal check compares live rows
to a frozen snapshot of rows. Each is a real, careful gate. None of them can
see the filing. That part holds.

**Two things this file first said here were wrong, and the refuters were
right.** Both are corrected in place rather than footnoted, because the wrong
version is the kind a later session would build on.

1. **It is not "the only place in the server that compares the two stores'
   text". There are two, and both are gates.** *(Two refuters disagreed here:
   one held that "no code anywhere compares the text except one equality
   predicate inside one approval function", the other named the second
   comparison. They are not reconciled by weighing confidence — I read
   `commit-section-to-filing.ts` and found the predicate and its audit row at
   the lines quoted below, so the second refuter is right and the held finding
   is wrong on this point. Recorded because a reader of this file should know
   the panel split, and on what.)* The approval
   (`approveBoundFilingSections`, `AND (ds.content ->> 'text') = sig.text`) is
   one. The other is inside `commitSectionToFiling` itself: a save over an
   `approved` section whose filing text differs withdraws the approval —
   `WHEN ds.status = 'approved' AND (ds.content ->> 'text') IS DISTINCT FROM
   $3::text THEN …` — and `settleWrite` writes a governed-action row carrying
   `approvalWithdrawn: true` and the sentence *"The text changed after the
   approval signature; the signature does not cover the new text."* So
   divergence at a save is neither unnoticed nor unrecorded, and this file's
   "visible: no" on that path was false.

2. **There IS a blocking CI gate.** `tests/schema-contract/authoring-section-
   commits-to-filing.contract.test.ts` runs under `test:proof-tier`
   (`package.json`) at `.github/workflows/ci.yml:310`, a blocking step, and its
   cases include the two-stores-move-together rollback against a real database.
   The claim rested on grepping `package.json` for `"ci:`, which is the wrong
   grep.

**And the blast radius is materially smaller than this file first implied.**
`approved` on a `c2c_document_sections` row is reachable ONLY through the text
comparison at the approval: the MDx filing save refuses `status: 'approved'`
and `'locked'` outright (`APPROVAL_REQUIRES_SIGNATURE`), and
`commitSectionToFiling` never writes `approved` and demotes it. The eCTD
dispatch gate requires `approved | locked` for a `c2c_document_sections` leaf
to count finalized (`ectd/leaf-source-resolver.ts`, with its own
`noteUnfinalized`). **So a diverged filing section cannot ship as finalized.**

A third correction, in the other direction — a finding rather than a
retraction: **send-to-packager's second hop targets a route no router serves.**
It POSTs `/api/regulatory/ectd/:seqId/leaf`, under a comment that calls it
"your existing packager route"; nothing in non-test server code serves that
path, and `/api/regulatory` mounts only the regulatory routes and
`/api/regulatory/tasks`. It fails closed and visibly (502 "Packager upload
failed"), so this is a dead feature rather than a leak — but the path cannot
currently carry anything anywhere, which is worth knowing before anyone counts
it as an exit. Not this lane's to fix.

## One more claim, refuted — with a different, real residual

The by-query angle's closing line was that `useFilingOutline.ts`'s
`nodeHasDraft` ORs the two stores, "so the outline an author navigates by
reports a filing section as written when only the working copy holds text — the
one surface that could have shown the gap hides it."

**Refuted.** The function is named `nodeHasDraft`, not `nodeIsFiled`, and its
own header states the choice and why: the stores are bound at document level
and not at section level, "which is exactly why the question has to be asked of
both … Reading only the authored side would have swapped one blind spot for the
mirror image of it." It claims a draft exists somewhere, which is true, and its
one call site renders a dot whose tooltip is `node.status` — the FILING's own
status. A node with text only in the working copy shows a lit dot reading
`todo`. The surface does not claim the filing section is written.

**The residual it did not name, and which is real.** That status reaches the
author through `title` alone — `<span className="ed-dot" data-s="ok"
title={node.status} />`, with no accessible name and no visible text. This
lane's own standard from round 13 (GE-P-3) rejects exactly that: a `title` is
unreachable by keyboard and invisible on touch. So the filing status IS shown
and IS honest, and is shown in the one way this lane has already decided does
not count. Recorded for the editor-family work rather than fixed here: it is an
accessibility defect on a shared surface, not part of the exit-path question,
and bundling it into this round would hide it inside a commit about seals.

## Is a signed artefact REQUIRED to equal the filing?

One angle flagged honestly that this rule is written down nowhere in `docs/`,
so its severities were blast-radius judgement rather than a quoted rule. It
does not need to be a judgement: **the product has already decided it**, in the
one handler that compares. `approveBoundFilingSections` refuses to mark a
filing node approved unless its text is exactly the signed text. That is the
rule, stated in SQL. What was missing is that it is enforced in one place and
nowhere else.

## What was fixed from this, and what was not

**Fixed** (each red first, each with killed mutants):

1. **The revert reported no filing verdict.** It called
   `commitSectionToFiling` and discarded the result, where the save and the
   AI-draft accept both forward it — so a revert whose filing commit was
   refused answered a plain success while the filing kept the pre-revert text.
2. **A sealed document's filed text was editable.** `PATCH /api/c2c/documents/
   :id/sections/:key` asked only `c2c_documents.status`, and the authoring
   freeze does not set that — it writes `frozen_documents` and
   `authoring_documents.status`, and touches `c2c_documents` not at all. So a
   FROZEN or APPROVED document's text could still be changed in the store a
   submission is built from, while its seal and every signature over it covered
   the editing layer only. `document-lock.ts`'s own header names four content
   paths and says "one guard, called by every writer"; this was a fifth, and the
   one that reaches the agency. It now calls that guard, through a new
   filing-side entry point, on the transaction client.
3. **A stale comment that helped hide (2).** The authoring save's
   `expectedUpdatedAt` note named "the MDX dossier drawer" as one of its
   callers. The drawer PATCHes the FILING route (`useSectionSave.ts`), so the
   line said the drawer saved through the seal-guarded door when it saved
   through the unguarded one.

**Not fixed, and why.** The remaining writers (apply-template, create-section,
document genesis) and the one-directional nature of `commitSectionToFiling` are
a product decision about which store an exit attests to, not a defect with an
obvious local repair — each would change what a bound document's filing holds
at creation and at template application. They are recorded here with their
file:line rather than patched in the same breath as finding them.

## Coverage, stated

Three angles ran; all three returned. No angle was dropped. Thirty-two
refuters then ran against the findings and thirty returned verdicts: **22 held,
8 were refuted** — including this file's own structural claim, one of the
read-only enumerations (four of its thirteen entries do not read the content at
all, and its line numbers were wrong), the reorder path's visibility field, and
send-to-packager, refuted with something stronger than a correction.

Part of why the structural claim fell is that **the fix below had already
landed**: the refuter cites `checkFilingWritable` and concludes that once a
document is FROZEN or APPROVED, neither store can move — "post-seal divergence
is impossible, not merely unreported". That is the fix doing its job, not the
gap having been imaginary; the gap was demonstrated with a failing test before
it was closed. The one thing none
of them settled is whether a FROZEN document's `frozen_documents` snapshot
should be re-checked against the filing at signing time — raised by two angles,
answered by neither, and left open rather than guessed.
