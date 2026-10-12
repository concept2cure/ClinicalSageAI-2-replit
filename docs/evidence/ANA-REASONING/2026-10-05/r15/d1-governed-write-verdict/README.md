# Round 15, door 1 — the governed-write verdict at the section save

`PATCH /api/authoring/sections/:sectionId` is the third and last of SEC-A-7's
server doors. Round 15's earlier increment made a machine-authorship claim
*checkable* there (the turn record id now reaches the server). This one decides
it, and refuses what RULE 2 does not admit.

## The rule, in one sentence

An unadmitted model's text never stands as governed content — not as the
model's work, and not as a person's. A claim nothing can check is different:
its words become the saver's own assertion, disclosed with the reason.

## What the door did before

Two claims arrived from the editor and the author **id** of each was the only
thing checked:

| channel | what it decided | checked against a record? |
|---|---|---|
| `acceptedMachineText` | which clauses the lineage records as `accepted_machine_draft` | no |
| `acceptedAuthors` | the revision's `origin`, `inputs.contributors`, the filing's `draft_source` | no |

So a member could record their own words as AnA's, or AnA's words under a model
that never wrote them and that RULE 2 does not admit for regulatory drafting.
The Part 11 row said nothing about a claim having been made at all — its
metadata was `{ titleChanged }`.

The sibling door (the eCTD batch-draft accept) has verified its claims against
the turn record since the 2026-09-28 review. This one had not.

## What it does now

One verdict, computed before the transaction opens, for both channels:

1. **Verified, and RULE 2 admits every model the record names** → credited.
2. **Unverifiable** (no id, no such record in this organisation, a record that
   does not verify whole, words the record does not hold, no turn-record store
   on this deployment) → the clause is still **saved**, recorded as the saver's
   own assertion, with the claim and its reason on the Part 11 row and on the
   response. The server cannot tell, and refusing would block honest saves it
   has nothing against.
3. **Verified, and a served model is not admitted — or the record names no
   model at all** → **403 `MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE`**. Nothing is
   written. The sentence names the model.

And who the record **names** follows what the lineage gate **credited**, not
what was claimed: a verified claim of one word credits no clause, so it names
nobody. That required the lineage gate to run before the revision, as it
already did at the revert and at template-apply.

## Why 3 is a refusal and 2 is not

For an unverifiable claim the server knows only that it cannot tell.
`machine-claim-verify.ts` is explicit that such a claim is neither refused nor
dropped, and both of its reasons are reasons about not knowing.

For a verified claim three things have been checked: the record verifies whole,
the words are inside what AnA produced, and the serving models are named and
unadmitted. Writing that clause as a named person's own assertion would be a
positive false statement in a §11.10(e) lineage span **and** in the
`c2c_document_sections` copy that is the filing — chosen by the server with the
proof in hand. "Fail closed, never fabricate" decides it.

It is also what the rest of the platform already does with the same fact: the
governed-write gate refuses a tool that would store an unadmitted model's text,
the gateway refuses high-risk drafting to it, and both client doors refuse the
insert. A save door that accepted it would be the one place in the product
where that text reaches the filing.

**This bites hardest in production, which is the point.** Every entry in the
approved-model registry is `pq: 'pending'`, and RULE 2 admits only a PASSED
performance qualification in production — so in production no model may author
governed content yet. That is what `docs/LAUNCH_DEFINITION_OF_DONE.md` row D4
says and what `startup/ana-readiness-state.ts` already reports. Had this door
credited those claims instead, the filing would have carried AnA's prose
attributed wholly to humans, platform-wide, with the model's identity surviving
only in audit metadata.

## A refusal is only honest because the claim survives it

A prior design in this round refused the **attribution** and not the save, on
the grounds that the editor's claim store was read-and-clear so a refusal would
destroy the claim. The premise was right and the conclusion was wrong: the fix
is to stop destroying it.

`takeAcceptedAuthors` / `takeAcceptedInsertions` emptied the store **before**
the PATCH, and `apiRequest` throws on every non-2xx — so **five refusals that
already shipped on this door** lost the attribution: a frozen document, no edit
permission, a 409 when a colleague saved the same section first, an unuploaded
figure, and a lineage failure. The 409 is the ordinary case — two authors on one
CTD section is how a module gets written — and it quietly recorded AnA's
clauses as a human's in an append-only chain. Nothing else could recover it:
the device cache holds only the serialized content, and accepting had already
removed the marks.

They are now `peekAcceptedAuthors` / `peekAcceptedInsertions` plus
`clearAcceptedContributions`, which the save calls **after** a 2xx. Keeping
entries cannot make a claim stale: `settleAcceptedContributions` drops any
whose text the document no longer holds, on every read.

The accept itself also already files a verified decision record naming the turn
and its models (`tracked-change-decisions` → `resolveTurnRecordSources`), so
the evidence of what was accepted does not rest on the save at all.

## The saver is told

- A refused save shows the server's own sentence, which names the model and
  says what to do. It deliberately does **not** say "ask again with Thorough
  effort" — in production that advice ends in a second refusal, the same
  correction the client insert gate already made to its own copy.
- A save that landed with an unverifiable claim appends: *"One passage you
  accepted from AnA was recorded as your own words, because the turn record
  does not hold this text. The record says so."* Without it the author reads an
  ordinary "Section saved" while the record says they asserted words they
  believed were attributed to AnA.

## Files

| file | what changed |
|---|---|
| `server/services/authoring/governed-machine-claims.ts` | new — the verdict, the disclosure, the report, the refusal |
| `server/services/authoring/machine-claim-verify.ts` | `mayVouch` option and the `model_not_approved` reason, in the one pass |
| `server/services/authoring/authoring-record.ts` | the new reason's sentence |
| `server/routes/authoring.router.ts` | the verdict and the 403 before `pool.connect()`; lineage before the revision; contributors from credited clauses; the disclosure on the audit row and the response |
| `client/.../editor/RichSectionEditor.tsx` | peek + `clearAcceptedContributions` in place of read-and-clear |
| `client/.../editor/DocumentWorkbench.tsx` | clear after a 2xx; `machineTextNote` on the confirmation |

## What this does NOT do

- **The batch-draft accept door still applies no RULE 2 check.** It verifies
  its claims and discloses them, but credits a verified claim whatever model
  served the turn. `mayVouch` is the one line it needs; it is a second door
  with its own tests and is not in this increment.
- **`acceptedAuthors` is now disclosed, not trusted.** An older deployed bundle
  that sends an author without its text gets no attribution and an
  `uncredited` entry on the row. The server cannot check such a claim at all,
  and a weaker true record beats a stronger unchecked one.
- **A claim refused for its model refuses the save even if the words are not in
  the content.** `settleAcceptedContributions` means a current client sends no
  such claim; fail-closed is the deliberate choice for one that does.
