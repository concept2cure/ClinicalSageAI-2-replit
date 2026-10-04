# The batch-draft accept: who wrote the text is the record's to say

Periodic review 2026-09-28, editor family. Round 2's re-check found it (NEW,
high): the second door of SEC-B-7. Closed in round 3 (2026-10-04).

## The finding

`POST /api/batch-draft/documents/:id/accept` recorded the request body's
`acceptedMachineText` and `model` as fact. The lineage recorded every clause
inside the claimed text as `accepted_machine_draft` by AnA, and the metadata
and audit row named the claimed model. So a member could record their own
words as AnA's, or AnA's words under a model that never wrote them, and the
Data Origins panel and its PDF would say so.

## The fix, as it stands

1. **The batch is recorded.** `POST /api/claude/batch` writes one AnA turn
   record per batch, holding every draft and the model the drafts report
   (`server/routes/ana-intelligence.ts`, `recordBatchTurn`). Each result names
   its record.
2. **The card sends the record, not a model.** `BatchDraft.tsx` sends the
   record's id with the draft exactly as AnA returned it.
3. **A claim counts only when the record holds it**
   (`server/services/authoring/machine-claim-verify.ts`). The record must be
   in the caller's organization and verify whole, and the claim's words must
   be inside something AnA produced in that turn. Each record text is read
   both as written and as markdown; the claim is read only as written. The
   model and the person who asked come from the record. An unverified claim
   is not refused: its words are the accepter's, and the claim and its reason
   are disclosed on the audit row (`machineText`).
4. **The lineage credits AnA only with words a reader is shown**
   (`server/services/clinical-regulatory-evidence/machine-attribution.ts`).
   Two kinds of clause are never compared, and stay the saver's:
   - any clause at or after the first raw-text opener (xmp, textarea,
     plaintext, title, script, style, iframe, noembed, noframes, noscript) or
     CDATA section. A browser shows the `<…>` inside these as text, and the
     clause splitter can put the opener in one clause and the words in
     another. Where such an element ends depends on attribute quoting,
     comments and context, which no regex follows. So the whole tail from
     the first opener is excluded; no scanner can be misled into ending
     early.
   - in content read as plain text (no known tag: the section editor and the
     export show every character), any clause holding something a browser
     would parse as a tag. One reader hides it and the other shows it.
   Both rules also apply to the carry-forward of an accepted clause, whose
   words were matched with tags removed. An unaccepted `machine_draft`
   carries forward as before: it was never matched.
5. **What the accept says about itself follows what the lineage credited.**
   The lineage now runs first, before the version, the content and the audit
   row, all in one transaction (it reads span rows only). The following name
   AnA only when at least one clause of the saved content is inside text this
   accept verified (`clausesInAcceptedText`, from `enforceAuthorLineage`):
   - the audit reason;
   - the replaced version's summary;
   - `lastDraftSource`;
   - `lastDraftModel`.
   A claim of one word verifies and credits nothing, so the accept says
   "this accept credits none of it to AnA". A re-accept of the same draft
   names AnA again. A clause an earlier accept credited keeps its
   attribution in the lineage either way.
6. **The figure rule on this door** (SEC-B-FO-b4): an image that is not an
   uploaded figure is refused before anything is written.

## Rounds

- **Round 2** (2026-09-28): `red.txt` → `green.txt`, and mutants
  `mutant-1` … `mutant-8`.
- **Round 2 fix-up**, after the first refute-review: `fixup-*`. Each mutant
  file (`fixup-mutant-1` … `8`, `A` … `E`) states what it breaks. Examples:
  the lineage taking the body's claims instead of the verified ones; the
  containment check removed; the verifier also matching the request text the
  person typed.
- **Round 2c**, after the second review found that a `< … >` span passed
  both the verifier and the lineage: `r2c-*`. One comparison form
  (`comparableText`) was added, which strips only what a browser parses as a
  tag. `r2c-verify-*` are the round-2c reviewer's runs and mutants, as
  returned. They found three blockers:
  - PROBE-C: a raw-text element split from its opener credited shown words to
    AnA;
  - PROBE-D: an honest, unedited markdown draft no longer verified;
  - surviving mutants N1 and N5.
  They also found two non-blocking gaps: a one-word claim named AnA, and an
  unpinned empty-needle guard (N8).
- **Round 3** (2026-10-04), in this lane's main loop: `r3/`.
  - Red, then green, first on the unit tests (`r3/unit-red-r2c.txt`: 18 of 43
    red against round 2c's attribution) and then on the integration tests
    (`r3/int-red-r2c.txt`: 11 of 16 red against round 2c's attribution,
    verifier and verdict-led wording). Every reviewer case is among the reds:
    PROBE-C ×4, PROBE-D ×4 and the one-word claim. So are the two gaps found
    while fixing them: the plain-text reading and the carry-forward into a
    region.
  - One PROBE-C row ("xmp on one line, split at ' and '") passes on round 2c
    too, for an incidental reason: the splitter leaves " and" on the clause,
    which breaks the match. It is kept as the reviewer wrote it.
  - Green: `r3/green-final.txt` (30 files, 412 tests: the unit file, both
    integration files and every clinical-regulatory-evidence suite) and
    `r3/related.txt` (225 files, 3,337 tests: every suite that touches the
    lineage gate, accepted machine text or the AnA services, plus the
    client's batch-draft tests).
  - Mutants: `r3/mutants/summary.txt`, 15 of 15 killed, among them the
    reviewer's N1, N5 and N8.
    - The N1 mutant on `BROWSER_TAG`'s raw-text lookahead first survived
      (`r3/mutants/N1-tag-lookahead.txt`), because the region rule now
      covers the lineage. It is the verifier's: a claim holding
      `<xmp class="q">` the record lacks must not verify. It is pinned and
      killed in `r3/mutants/N1-tag-lookahead-after-verifier-pin.txt`.
  - `r3/lint.txt`: no new warnings, and new files have none. `r3/tsc.txt`:
    the lane's files and tests typecheck clean.
  - The known-tag rule the plain-text reading needs is shared, not copied:
    `../known-tag-rule/`. Making it shared exposed a quadratic in it, now
    linear.

## Not done here

- Formatting is not attributed. A strike (`<del>`, `<s>`) put over one of
  AnA's words leaves the words AnA's, though the strike changes what a reader
  takes them to say. This is the same limit as the editor's (formatting-only
  changes are not tracked).
- Attribute text (`<b 3 patients died>` as HTML) is hidden from every reader
  that parses HTML, and is not compared. It is in the stored content. Every
  reader that shows content parses it as HTML or as plain text, and in plain
  text such a clause is never AnA's.

Round 3 was self-reviewed in this lane. An independent refute-review is
recorded in the editor-family README when it returns.
