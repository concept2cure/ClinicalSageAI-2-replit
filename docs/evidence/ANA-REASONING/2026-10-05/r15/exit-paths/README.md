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

## The structural finding

Every gate on every one of these paths compares the editing layer **to
itself**: `computeDocHash` over `authoring_sections` is what every signature's
`content_hash` is; the export's signature-coverage check compares a signature
to a digest of the same rows; file-to-vault's change-during-filing check
compares the rows to themselves; the snapshot's seal check compares live rows
to a frozen snapshot of rows. Each is a real, careful gate. None of them can
see the filing.

Meanwhile the submission leaf is materialized from `c2c_document_sections` or
`coauthor_documents` (`ectd/leaf-source-resolver.ts`). So **the artefact that
is signed and the artefact that is submitted are hashed over different
stores**, and only four non-test files mention both tables. There is no verify
endpoint, no CI gate and no response field outside the two save paths and the
two signing paths.

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

Three angles ran; all three returned. No angle was dropped. The one thing none
of them settled is whether a FROZEN document's `frozen_documents` snapshot
should be re-checked against the filing at signing time — raised by two angles,
answered by neither, and left open rather than guessed.
