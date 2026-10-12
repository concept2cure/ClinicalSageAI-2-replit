# Round 14 — SEC-A-7: the governed-write rule at the doors that did not apply it

Round 14 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA."*). Board row: "AnA's reasoning is checked
by an engine, and the check is what the reviewer sees and the record keeps"
(`docs/work-orders/README.md`). Supports launch row **D4** — "tools and routes
that store model-authored content refuse an unapproved serving model".

Round 11 put one gate (`editor/anaInsertGate.ts`) on AnA's answer going into a
document, and round 13's header named the doors that did **not** enforce it.
SEC-A-7 is those doors. Five were mapped, each by a read-only agent working from
source and probing where it could.

| Door | What it is | State |
|---|---|---|
| 1 | `PATCH /api/authoring/sections/:sectionId` — the section save, which commits to the filing | **mapped, not done** |
| 2 | `POST /api/authoring/docs/from-draft` — creates a whole governed document of model prose | **mapped, not done** |
| 3 | the section revert (`authoring.router.ts:2435`), also a filing commit | **mapped, not done** |
| 4 | `EditorBridge.propose` — redlines AnA's words into the open section | **done** (`d4-propose/`) |
| 5 | the conversation draft card's "Open as document" | **done** (`d5-open-as-document/`) |

Doors 4 and 5 are both client doors, both fail closed now, and door 5 was found
while mapping the others — this lane's own miss, and the omission was not a
decision anyone made: the sibling control in the same component consulted the
rule and the card did not.

## The product decision this round turned on, and how it changed

Door 2 posed it: should creating a document from an AnA draft **refuse** when a
model RULE 2 does not admit served the turn?

My first answer was "no, because the create only writes the workspace; the
filing commit is door 1, so door 1 holds the line." **That was wrong, and an
exit enumeration killed it two ways.**

1. **The create IS a governed write.** `insertDocumentTx`
   (`authoring-documents.ts:350-385`) writes, in one transaction:
   `authoring_sections`, the span lineage, a `doc_revisions` genesis row
   carrying the full prose, and an `authoring_audit_trail` row whose
   `after_content` IS the prose. I verified both ledgers are append-only by
   trigger — `20260817_doc_revisions_immutable_ledger.sql:50,55,64` and
   `20260725_authoring_audit_trail.sql:78,85,99,109` RAISE on UPDATE, DELETE and
   TRUNCATE. There is no downstream exit to gate for those rows: the create is
   the governed write, and they cannot be amended.
2. **`commitSectionToFiling` is not the chokepoint.** Nine exits read
   `authoring_sections.content` directly and never consult
   `c2c_document_sections` — the freeze seal, the e-sign and sign seals, the
   controlled export, send-to-packager, the working copy, file-to-vault, submit
   → the canonical spine, and the coauthor filing copy.

**And the decision still came out "admit the create, compute the provenance" —
for a different and better reason.** The replacement path is the exit that
cannot be gated. If from-draft refuses, the reachable alternative is
`POST /api/authoring/docs` + a paste + `PATCH /sections/:sectionId`. That path
reaches every exit above with **worse** provenance at each: an unmarked paste or
a retype falls to `lineage-gate.ts`'s default — "the content is the actor's own
work" — so the span is recorded as the person's, and the save commits with
`draftSource` null. Refusing would put the same words in the same immutable
tables through the same exits, relabelled from "a machine drafted this" to "a
person authored this". No server gate can tell retyped model prose from a
person's own sentence. Refusing makes the Part 11 record *less* true and leaves
the rule unenforced.

So the rule at door 2 is: **the record tells the truth, and the governed
boundaries enforce on it.** That is this codebase's settled pattern already —
the tracked-change decision path files an unverifiable claim as
`{ verified: false, claimed, why }` rather than as truth or as nothing, and
`commit-section-to-filing.ts:260` chose `REASON_NOT_STATED` over inventing a
reason.

**One condition is blocking, not advisory:** admitting is only honest if the
verdict is computed server-side. Today `provenance.model` is caller input (a
≤2000-char string) and `provenance.turnId` is never resolved, so an admitted
create can carry any model string a client types — which makes the record worse
than silence.

## Where two lenses disagreed

On door 1, the two maps contradict each other, and it is recorded rather than
resolved by whichever was more confident:

- The door 1 lens: a claim that **verifies** but whose model RULE 2 does not
  admit should **refuse the whole save** (403, pre-transaction).
- The door 4 lens: the save should **strip the attribution** in every case,
  because "the section save is a person mid-edit... refusing destroys work they
  can only recover by hand."

My reading, for round 15: refuse — because the door 4 lens's premise is false
here. The claim is per-clause in `acceptedMachineText`, so a caller that omits
it saves the identical words as the person's own. **Refusing the claim does not
block the save.** And stripping a *verified* unqualified-model claim would
launder known-unqualified prose into the filing as a human assertion, destroying
the one true fact the record held. That makes the editor's 403 branch part of
round 15's scope, not optional: without it the refusal surfaces as the grey
"Save failed — kept on this device" that `DocumentWorkbench`'s own comment calls
the wrong failure to blur.

Both lenses independently corrected a premise I had been working from:
`batch-draft-routes.ts` imports **no** approved-models module at all. It gates
WORDS, never the MODEL. So it is a precedent for strip-and-disclose only, and
there was never a precedent for stripping on a model verdict.

## What is NOT verified, and is marked as such

Both adversarial verifiers for the exit enumeration and the revert map **died on
a session limit** before reporting. Every other round in this lane had its map
refuted before it was built on; this one does not, for those two.

So I verified the load-bearing claims myself from source, and they hold: the
in-transaction ledger writes; both immutability triggers; `pq-not-passed` as a
drafting refusal; `draft_authoring_document` in the governed-write tool list
(the map named a non-existent path for this one — `ai-governance/` rather than
`ana/` — and the fact holds). **The nine-exit list is one agent's enumeration
with no refuter.** I checked `file-to-vault` myself; the other eight are a lead
for round 15, not a settled finding, and nothing in this round rests on them.

Doors 4 and 5, which this round actually ships, rest on their own red-green and
mutant evidence and not on either unverified map.

## Not done here, named by path for round 15

- **Door 1**, `PATCH /api/authoring/sections/:sectionId`: the two verdicts above,
  `AcceptedInsertion` (`editor/suggestions.ts:1113`) gaining `turnRecordId` from
  the mark's `sourceRecord` at `:1602` and `:1636`, the parser at
  `revision-ledger.ts:230-247`, and the editor's 403 branch.
- **Door 2**, the from-draft provenance: drop `'model'` from
  `PROVENANCE_TEXT_KEYS` (`authoring-from-draft.ts:68`) and compute it from the
  resolved record; resolve `provenance.turnId`; record `servedBy` with each
  RULE 2 verdict in the create's transaction; refuse `422 TURN_RECORD_REQUIRED`
  when `source: 'ana'` arrives with no resolvable record. The AnA tool caller
  passes a RUN id, not a record id (`authoring-draft-tool.ts:137`), which needs
  either a by-run-id loader or a distinct field.
- **Door 3**, the revert: it passes no `acceptedMachineText` and carries machine
  spans forward on text match, so a forged span survives a revert.
- **The exit gates**: freeze (`:4641`), e-sign (`:4916`), sign (`:6995`),
  `approveBoundFilingSections` (`:6667`), submit →
  `authoring-canonical-bridge.ts`, and `authoring-file-to-vault.ts` — the last
  being the only controlled-store write with no seal requirement.
- **Door 4's verb.** Its refusal reuses the insert wording ("can't be inserted")
  because nothing renders it yet. Door 5 made the act a parameter; when the
  step-6 card is built, door 4 passes its own act.
