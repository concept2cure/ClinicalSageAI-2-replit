# What an exit attests to — the editing layer, proven equal to the filing

**Status: decided, 2026-10-18.** Decision **P-29**, under the founder's
delegation of 2026-10-13:

> "Become the founder, the subject matter expert for life science document
> creation, and the product manager for this entire platform, and make those
> decisions, and make the decisions that are best for the clients, the human
> users, and their needs in all use cases."

Made in session `…01TTTQ1hpdMr1yAMVYH4nYdE`, which raised it as the open
question at the close of the AnA reasoning lane's round 15, alongside P-30 and
P-31 (`docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md`). Where a later document
or a session's rule disagrees with this record, this record wins until the
founder says otherwise.

Nothing here adds a surface, module, tool, model or integration. Every part of
it is a **gate on existing capability**, which CLAUDE.md RULE 2 permits. It
bears on launch rows **D5** (Authoring) and **D1** (the governed record).

**Every factual premise below was re-read against HEAD on 2026-10-18, and three
of them had moved.** The adversarial review this decision rests on ran against
2026-10-13; trunk advanced by some 7,800 commits in the five days that
followed, and the D2 consolidation of 2026-10-17 closed the second editing door
outright. Two further premises — about the signature's digest and about where
it is read — were never true at all. Each correction is stated where it bears,
rather than quietly dropped, so the next reader can tell which parts of this
record are findings and which are history.

---

## The question, and why it had to be answered

The platform keeps a document's text in two places:

- **`authoring_sections`** — the editing layer. Where the ceremony lives:
  reason-for-change, the hash-chained revision ledger, author-span lineage,
  comments, track changes, the e-signature, the freeze, and the model-admission
  gate that round 15 built.
- **`c2c_document_sections`** — the filing. The system the submission is
  *built from*. `commitSectionToFiling`
  (`server/services/c2c/commit-section-to-filing.ts`) derives it from the
  editing layer on save, revert and AI-draft accept, and since the D2
  consolidation of 2026-10-17 it is the **only** writer of that store's text:
  the scaffold and the market-document insert create nodes, the approval moves
  status, and the filing-side route refuses any body carrying content.

An exit — a freeze, a signature, a controlled export, a file-to-vault, a
submission, an eSTAR package — has to say *which of those two it is attesting
to*. Until it does, the sentence a sponsor needs to be able to say to an
inspector ("this is the text we signed") has no referent.

---

## P-29.1 — an exit attests to the EDITING LAYER. The filing is a projection.

**Decided.** `authoring_sections` is the record of the governed document. The
filing copy is derived from it and has no independent authority.

**Why this and not the reverse.** A signature does not have to be computed over
the bytes that ship. No clause of 21 CFR 11.70, 11.50, EU Annex 11 or ICH
E6(R3) requires a digest over the final PDF; an eCTD leaf is conventionally
unsigned content, §11.70's object is the record the sponsor maintains, and
§11.50(b)'s manifestation duty attaches to human-readable forms of that record
— which the controlled export and the Vault version do manifest
(`server/services/authoring/authoring-export.ts`). Re-pointing the exits at the
filing would move attestation into the store that holds **none** of the
ceremony: no reason-for-change, no revision chain, no lineage spans, no
model-admission check. That is the wrong direction for a client, and it is the
direction that would have to be defended.

So the cheapest way to make the attestation true is not to re-point five exits
at a second store. It is to **make the filing provably agree with the attested
text at the moment of attestation.**

## P-29.2 — the exit CHECKS the proof, which is already stored

**Decided.** Every exit that ships filing-derived bytes compares the filing,
node by node, against the text the attestation covers — and refuses with the
diverging section keys named. No new column, no new table, no migration.

**This is narrower than it was going to be, because the record already exists.**
The first draft of this decision called for storing a digest of the filing text
that matched, beside the signature. Reading the signing lanes shows that the
material to recompute from is already persisted, sealed and tamper-checked:

- The equality test runs in the signature's own transaction —
  `approveBoundFilingSections` compares `(ds.content ->> 'text') = sig.text`.
- The **signed text itself** is persisted verbatim in the same transaction, on
  both approval lanes: `approveAndSnapshotForSignature` (`/e-sign` with
  `meaning: 'APPROVER'`) and `approveAndFreezeDocument` (`/sign` at the last
  cleared step) each read `authoring_sections` in signing's total order and
  write `{document, sections, approvedBy, documentHash, frozenAt}` into
  `frozen_documents.frozen_content`, with `content_hash = sha256(frozen_content)`.
- `GET /api/authoring/docs/:docId/frozen` already recomputes that sha256 and
  refuses on mismatch — the shape this decision was about to ask for.
- The signature carries `content_hash` (`sectionsDigest` over the signed rows),
  `covered_content_hash` naming the snapshot, and a `signature_digest` over
  both.
- Prior filed states are retained too: the `c2c_snapshot_section_version`
  trigger writes `OLD.content` into `c2c_document_section_versions` on every
  change, and RAISES without an actor and a reason.

So what is missing is not storage. **It is that no exit asks.** The eCTD leaf
resolver gates on a status word (`server/services/ectd/leaf-source-resolver.ts`)
while three sibling lanes in the same file each verify a recorded digest and
refuse on mismatch — and `vault-lifecycle.ts` refuses bytes "approved for
different content than these bytes", which is the sentence wanted here.

**Which side the comparison derives from, and why that is enough.** The expected
filing text is `signedFilingSectionTexts`' rule applied to the authoring
sections. For a *sealed* document those rows are the snapshot's rows — nothing
can write either store after the seal — so comparing the filing against the
live editing layer and comparing it against the snapshot give the same answer,
and the snapshot is there to prove it independently if an inspector asks. For an
*unsealed* document both copies are mutable and a live comparison proves only
simultaneity; that is exactly why the refusal sits at the **freeze**, before
anything is sealed, and why increment 1 is the freeze.

**Shipped:** `filingAgreesWithEditing`
(`server/services/c2c/filing-section-target.ts`) and the refusal, 409
`FILING_DIVERGED`, naming the section and the remedy, at **all three seals** —
the freeze, `POST /e-sign` as APPROVER, and `POST /sign`. Evidence:
`docs/evidence/ANA-REASONING/2026-10-05/r16/p29-filing-agreement-gate/` and
`.../r17/p29-signing-seals/`.

**The correction worth recording.** The freeze shipped first and was the wrong
seal to stop at. An APPROVER e-signature reaches the same sealed state — status
APPROVED, `frozen_at`, the snapshot, the signature — and the freeze route's own
refusal copy directs people to it, so for one round the path a client actually
uses to approve a document passed no check at all. A gate the product routes
around is worse than no gate, because it reads as coverage. It was the review's
own decide phase that found it, after the first increment had already shipped —
which is the argument for running an adversarial review to completion rather
than stopping where it confirms the plan.

## P-29.3 — the device/IVD exit attests to the same thing, and today attests to nothing

**Decided, and it is the part no candidate shape contained.**

For a drug or biologic client the exit hashes the editing layer. For a
**device or IVD** client it does not, because it never reads the editing layer
at all:

- `server/routes/510k-estar-routes.ts` builds the eSTAR deliverable
  (`POST /build`, `/official`, `/assemble`) from `c2c_document_sections`, via
  `resolveDeviceContentScope` / `loadDeviceContentLeaves`
  (`server/services/pathway-engines/estar/estar-content-leaves.ts`, the
  `FROM c2c_document_sections` read).
- That route file contains **no seal check** — no freeze, no document lock —
  and **no `sha256` or `createHash` of either store**. Verified by reading it.
- A device programme creates no eCTD `submissions` row, so the eCTD leaf
  resolver's checks never reach it.

So a device client's package ships from the un-sealed, un-hashed store with no
attestation of any kind. **P-29's exit list therefore includes the device
exits.** Every candidate list considered — freeze, e-sign, sign, export,
file-to-vault, submit, snapshot — contained not one device client's exit. A
guarantee that covers only the drug lane is not this platform's guarantee:
device and IVD clients are in the launch catalog on the same terms.

This also settles a question that was going to be asked the other way. A rule
of the form "a filing-only section is editable only on the filing side" would
have blessed the un-attested store as the *sanctioned* authoring surface for
roughly 34 of a 510(k)'s 38 nodes. Refused for that reason, and the D2
consolidation of 2026-10-17 had already refused it in code — see P-29.5.

## P-29.4 — there is no mirror write-back from the filing into the editing layer. Ever.

**Decided: no, permanently, and recorded here so no later session rebuilds it.**

The tempting symmetry is to let a filing-side save flow back into
`authoring_sections`, so the two stores converge from either direction. It is
refused on two grounds. The first is now moot and the second is permanent, and
the distinction matters because only one of them would survive someone
re-opening the filing-side door.

1. **It cannot be built honestly for an assembled node — permanent.** A filing
   node receives N authoring sections joined with synthetic
   `## <code> — <title>` headings (the 2.5 Clinical Overview from 2.5.1 …
   2.5.7). Nothing in the resulting text distinguishes a synthetic heading from
   an author's own, so the inverse is undefined for the exact case
   `server/services/c2c/filing-section-target.ts` exists to serve — and a
   mirror would read as though it had closed the whole split while only ever
   working for single-member exact-code nodes. It would also have to mint a
   hash-chained revision and a lineage span set for text it did not author,
   where the only honest `origin` is a new value naming the filing door:
   fabricated provenance inside the chain hash itself.
2. **It would have laundered unadmitted machine text into a named human's
   assertion — no longer reachable, and worth recording.** The filing-side save
   used to record every clause as an **author** span asserted by the saving
   user, with no machine pass, even when the request claimed an AI draft source
   on the client's word alone; and the span writer *replaced*, so the machine
   spans an earlier AI-draft accept recorded in the editing layer would have
   been retired and rewritten as a person's §11.10(e) assertion. That is the
   channel round 15's gate was built to refuse
   (`server/services/authoring/governed-machine-claims.ts`, and P-30: *the
   model comes from the turn record or not at all — no privileged second
   channel*). As of the D2 consolidation of 2026-10-17 that route writes no
   content at all and `replaceAuthorSpans` has no occurrence in it, so the
   hazard is closed by the door rather than by this rule. It is recorded
   because it is what the rule is *for*: any future write-back re-creates it.

**One-directionality is the decision, not an implementation detail.** The
editing layer writes the filing. The filing never writes back.

## P-29.5 — one editor for section text. Already shipped; ratified here.

**Decided, and the decision was taken by another lane first — correctly, and
more completely than this one would have.**

What I was going to decide: that the filing-side section save should refuse a
section key held by a bound authoring document, keeping the door open for a
filing-only section. What the **D2 consolidation of 2026-10-17** (commit
`981c27b3a`, "one editor for section text") actually did is stronger:
`PATCH /api/c2c/documents/:id/sections/:key` now refuses **any** body carrying
content — bound or not — with 409 `SECTION_TEXT_IS_AUTHORED`, before reading or
writing anything, and `client/src/concept2cure/mdx/hooks/useSectionSave.ts` was
deleted with its test. Status transitions keep their seal, lock and approval
checks, and `approved`/`locked` were already refused there without a signature.

It named its replacement by path, as the working agreement requires: the
authoring editor (`document-authoring`) plus `commitSectionToFiling`, proven
reachable by `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts`
and `DossierDrawer.readOnly.test.tsx`. The MDx dossier drawer now shows section
text read-only with "Open in editor".

**Verified at today's HEAD, not taken on the commit message:** the route's
content refusal is the first thing in the handler; no client in the repository
calls that PATCH (`useDossier.ts` reads sections, it does not write them); and
the text of `c2c_document_sections` is written by exactly one thing —
`commitSectionToFiling`. The scaffold and the market-document INSERTs create
nodes; the approval moves status; nothing else touches content.

**So I ratify it and withdraw my narrower version.** Keeping the door open for
filing-only sections — which I was about to decide, on the grounds that device
clients author most of a 510(k) there — would have been wrong in the one way
that matters: it would have sanctioned the un-attested store as the authoring
surface for those nodes, which is precisely what P-29.3 forbids. Device and IVD
clients author in the editor, like everyone else, and gain comments, citations,
revisions and a signature over text they previously edited in a store that has
none of those.

**What this changes about the rest of this decision.** With one writer, a
*divergence* can no longer be created through the product's own API. The
`FILING_DIVERGED` refusal in P-29.2 therefore guards three things, and it is
worth being exact rather than implying a live breach: rows written before
2026-10-17; any direct database access; and any future second writer. That is
what a permanent gate is for — and it is the difference between the attestation
being argued and being checked.

---

## What this makes true, and what it does not

After P-29 is implemented, the sentence a sponsor can say is: *the signature is
over the controlled document as authored; the signed text is held verbatim in a
hash-sealed snapshot taken in the signature's own transaction; the filing
copy's equality to it was proven in that same transaction and re-checked
against the row the moment the leaf was rendered — and here is the refusal that
fires when it does not match, shown failing on the case it exists to catch.*

It does **not** make the two stores one. That remains the right destination and
the wrong next change: it is the largest possible edit to the most governed
path in the product, it would delete a user-facing capability on one side or
the other with no reachable replacement to name — five editor generations were
built and deleted in this repository between 2026-06 and 2026-08 for exactly
that reason — and the key and content-type changes alone move the ground under
`document_span_lineage`'s character offsets. Revisit it as a founder decision
once the gate makes divergence visible and someone can count how often it
actually occurs.

---

## Looked at first, because the attestation rests on them

Three things the review named as prerequisites. The first is a real defect on
its own terms and is fixed. The second does not hold against the code and is
withdrawn. The third is real and is owed.

Both of the first two were reported by four of the five review dimensions
independently, in agreeing detail, and both were wrong in the same direction —
they attributed to the *signature* an ordering problem that belongs to what is
compared with it. Confident, convergent agreement among reviewers is not
verification; reading the line is. That is the method note worth keeping from
this decision.

### D-29-A — a digest compared against the signature's was computed in a different order *(fixed 2026-10-18)*

`computeDocHash` (`server/services/authoring/authoring-export.ts`) read the
section rows with `ORDER BY order_index` and **no tiebreaker**, while everything
it is compared against was computed over `order_index, created_at, id`. It has
exactly two consumers, and each one compares it with — or asserts it equals —
the digest the signing ceremony stores:

- `GET /api/authoring/docs/:docId/exports` answers
  `content_changed_since_last_export` by comparing it against the `doc_sha256`
  on the last export row, and **both** writers of that column
  (`authoring-file-to-vault.ts`, and the router's controlled export) compute
  `sectionsDigest` over a read in signing's total order.
- the document-delete audit row records it as, in its own comment, "the same
  section digest the signatures store as content_hash".

`order_index` is `INTEGER DEFAULT 0` with no unique constraint
(`db/migrations/20260725_authoring_document_loop_tables.sql`), and
`placeNewSection` honours a client-supplied index exactly as given
(`server/services/authoring/section-placement.ts`), so a tie is reachable from
the product. Over a tie group PostgreSQL may return the rows in any sequence —
so for a tied document the export verdict compared two different orders and
could report a change nobody made, which is precisely the harm that route's own
comment warns about ("a UI that renders the second for the first tells an author
their stale file is current"), and the delete row's claim of equivalence was
untrue.

**A claim this lane had carried, corrected:** `computeDocHash` is *not* the
value the signatures store. `/freeze`, `/e-sign` and `/sign` each compute
`sectionsDigest` over `lockedSigningContent`'s rows, which are read on the
transaction client in signing's total order — so the signatures were never
affected. The defect is in what is compared *with* them. Correction recorded at
`docs/evidence/ANA-REASONING/2026-10-05/r16/d29a-doc-hash-total-order/corrections.txt`.

It was **the one outlier against the repo's own written contract.**
`sectionsDigest` states it in its own docstring — "Rows are already in the
caller's recorded order … exports and release checks must recompute the
identical bytes" — and `fullVisibleAuthoringSnapshot` names the order: "Rows
use signing's total order"
(`server/services/authoring/authoring-content-digests.ts`). That order is
`order_index, created_at, id`, which the signing routes' own read
(`lockedSigningContent`), `authoring-file-to-vault.ts`,
`services/c2c/filing-section-target.ts` and the QMS controlled-document read
all already use, and which the placement suite calls "the order every reader of
the document uses".

Fixed to signing's total order. Pinned by
`server/services/authoring/__tests__/authoring-doc-hash-total-order.pglite.test.ts`,
which fails on the old read and on six mutants of the new one — including
dropping `id`, which the **genesis** shape needs: the seed loop inserts every
section of a new document inside one transaction, so `created_at` ties as well.
Evidence: `docs/evidence/ANA-REASONING/2026-10-05/r16/d29a-doc-hash-total-order/`.

### D-29-B — WITHDRAWN: the attested hash is already read inside the transaction

Four of the five review dimensions reported that the signing routes compute
their content hash on the pool before the transaction opens, so a signature
could name text A while the filing was approved against text B — and called it
a three-line fix and a prerequisite for the gate. **It does not hold against the
code.** Read at the line:

- `/freeze` — `sectionsDigest(sectionsResult.rows)` where the rows come from
  `lockedSigningContent(client, …)`, i.e. the transaction client, ordered
  `order_index, created_at, id`, under `FOR UPDATE` on the document row, inside
  `BEGIN ISOLATION LEVEL REPEATABLE READ`.
- `/e-sign` — `sectionsDigest(current.sections)`, same source, same transaction.
- `/sign` — the approval snapshot reads `authoring_sections` on `client` with
  the same total order, and its own comment says so.

The one pool-side `computeDocHash` call is in `GET /docs/:docId/exports`, which
is a report, not a signature. Withdrawn rather than carried, because a filed
prerequisite that is already satisfied sends the next session to change working
code. Nothing needs doing here.

### D-29-C — the approver is never shown which sections their signature missed

`approveBoundFilingSections` moves a bound filing section to `approved` only
when its text is exactly the text signed, and reports the misses in
`notApproved`. The `/e-sign` route sends them on as
`filingApproval: filingApprovalReply(...)`.

Verified at HEAD: **no file under `client/src` references `notApproved` or
`filingApproval` at all.** (The review cited a bar component discarding it;
that file no longer exists, and the outcome is the same or worse — the field is
not read anywhere.) So the approver sees their signature succeed and is never
told which sections it failed to cover. A correct gate nobody is shown is a
finding in its own right, and this one is the gate that makes P-29.1 true.

Owed. It is a display of a value the server already sends, not a new
capability.

---

## Open, and deliberately not decided here

- **VERIFIED 2026-10-18, and it is the worst thing in this family.** The
  reported collision between a seeded 510(k) template's section codes and the
  eSTAR outline's keys **holds**. Not where the review said — the on-disk
  templates `loadTemplates` reads are two single-section files — but in the
  store document genesis actually resolves: `intelligence.template_sections`,
  seeded at startup by `server/services/intelligence/template-seeds.ts`. The
  template `fda_510k_se` carries codes `D1, SE1, SE2, B1, B2, S1, L1, C1`; the
  shipped `fda-estar-510k-v1.1` outline uses `A…G2`. Four collide under
  different labels — **B1 "Bench testing" files into "Device description and
  principles of operation", and B2 "Biocompatibility (ISO 10993)" files into
  "Indications for use statement"** — and the other four, including the
  predicate identification and the SE comparison matrix, reach no node at all.

  **No cross-store gate can catch this, including the one shipped today.** After
  the mis-keyed write the two copies *agree*: the filing node holds exactly the
  text the editing layer holds for that code, so `filingAgreesWithEditing`, the
  approval's text-equality comparison and every digest in the signing chain all
  pass. The defect is not a divergence between stores; it is both stores
  agreeing on the wrong heading. Only a check on the **vocabulary** sees it.

  Finding filed at
  `docs/evidence/ANA-REASONING/2026-10-05/r16/template-outline-code-collision/`.
  The fix is under adversarial review before anything changes: re-coding seeded
  regulatory reference data, deciding what is owed to a database that already
  holds the wrong codes, and choosing a guard that does not refuse an ordinary
  section rename, are not changes to make from one reading.
- **Also handed on:** whether `PATCH /api/c2c/documents/:id/sections/:key`
  inserts outline nodes keyed by whatever the caller sends. It no longer writes
  content, but it still has an INSERT branch on the status path, and the panes
  were reported to hand it audit resourceIds. Refusing a key the document's
  rule pack does not define belongs there.
- **A SEAL BYPASS, found by the review's own refuters and verified at the line
  on 2026-10-18.** `updateControlledQmsDocument`
  (`server/services/qms/controlled-document-service.ts`) writes
  `UPDATE authoring_documents SET title = COALESCE($3,title),
  status = COALESCE($4,status) …` with `'IN_REVIEW'` when a controlled document
  is sent for review. Its only checks are the **register row's** status
  (`row.status !== 'draft'`) and `requireContentAccess(…, 'edit')`, which is
  `decideAuthoringPermission` — permission, no lock. So a QMS-bound authoring
  document that was frozen through `POST /api/authoring/docs/:docId/freeze`
  (nothing in that route excludes a QMS-bound document) while its
  `qms_documents` row is still `draft` is moved **FROZEN → IN_REVIEW**, which
  re-opens `checkSectionWritable` with a `frozen_documents` row and a freeze
  signature standing over it. The product's own refusal copy — "Only a draft
  can be edited or sent for review. Open a controlled revision before changing
  this document." — is printed by the path that defeats it.

  It is the same shape as the bypass round 15 closed, in the other direction:
  one lane's status writer not consulting the other lane's seal. Nothing is
  destroyed — the frozen snapshot is intact and `GET /docs/:docId/frozen` still
  recomputes it — so this is an integrity-of-process defect, not a lost record.

  **Not fixed in this round, and the reason is a rule rather than a judgement:**
  those lines were written 2026-10-17 16:02 −0700, inside the 24-hour hold this
  session keeps on another lane's file. The fix is to consult the authoring
  seal before writing that status, through `document-lock.ts`, which already
  holds `sealsContent` and `checkFilingWritable`. Red first, with the fix.
- **No longer load-bearing, and recorded so it is not re-investigated:**
  whether any deployment runs with `LAUNCH_SCOPE_ENFORCE=off` in production.
  That question mattered only while the filing-side editor was reachable: it
  decided whether the divergence was customer-reachable. With the door closed
  in the route itself — for every client, entitled or not — the entitlement
  setting no longer gates it
  (`server/services/entitlements/launch-scope.ts`).
- **Whether a FROZEN snapshot is re-checked against the filing at signing
  time** is answered by P-29.2: the hash-sealed snapshot the approval already
  writes is what the comparison derives from, so it is a check against a
  tamper-evident record rather than a re-read of a mutable one. For a document frozen *before* the gate
  ships, the remedy is narrow: for a QMS-controlled document
  `reviseControlledQmsDocument` mints a new editing copy from the sealed
  sections and bumps the version, which is the sanctioned path; for every other
  document there is none. So the refusal must sit at the **freeze**, where the
  remedy is to save the section again, and downstream exits must **record** a
  divergence they find rather than dead-end a document whose seal cannot be
  reopened. That ordering is part of this decision.

  **Corrected 2026-10-18:** earlier drafts of this document said "nothing
  un-freezes or versions an authoring document", twice. Both halves are wrong.
  `reviseControlledQmsDocument` versions one. And something does un-freeze one,
  which is a defect rather than a path — see the open item below.

## The gate that keeps this true, and what it found

Shipped 2026-10-18: `scripts/ci/check-filing-exit-agreement.mjs`, with its
selftest, in `.husky/pre-push` and `ci.yml`. It discovers the doors rather than
reading a list — seal and signature writes over an authoring document, and
device/IVD content loads that build a deliverable from the filing — and fails
when one of them does not ask `filingAgreesWithEditing`. Baseline per file,
shrink-only, every entry with a written reason saying DEFECT or PROOF.

**It found two doors this decision had not enumerated, and nor had any of the
five review dimensions behind it:**

- `server/services/pathway-engines/device-assembly/assemble-device-submission.ts`
  — `loadProgramDeviceAssemblyInput` reads the filing through the device
  loaders and `assembleDeviceSubmission` computes the readiness verdict and
  `artifactKind` from it, so a diverged or mis-keyed section inflates what a
  client reads as "what can honestly be produced".
- `server/services/qms/document-approval-signature.ts` — **a fourth seal.** It
  stamps `authoring_documents SET status = 'APPROVED'` after its own signature
  and ledger pair, with no cross-store check. Usually a no-op (a QMS controlled
  document is normally unbound), but nothing refuses it from being bound.

That is the case for a discovering gate over a careful list, made against this
decision's own list. Evidence:
`docs/evidence/ANA-REASONING/2026-10-05/r17/p29-ci-gate/`.

## The strongest argument against this decision

That it leaves the product with two stores and adds a gate instead of removing
the cause, which means the gate can be forgotten at the eighth exit someone
adds later. That is a real cost, and it is why the implementation owes a CI
gate that fails when a new seal, signature, export or filing path does not run
the check — the same shape RULE 1 mandates for migration drops, baseline with a
written reason and all. Without that, this decision degrades into a comment.

The alternative — one store now — is not safer. It is the change most likely to
delete a capability a client depends on while its replacement is assumed rather
than named, and this repository has already done that five times to its own
editor.
