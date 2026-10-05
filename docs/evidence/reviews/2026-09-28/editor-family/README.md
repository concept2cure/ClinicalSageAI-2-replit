# Periodic review: the editor family, line by line — 2026-09-28

**Row:** D4. Periodic review is a validation activity, and the review is
filed under VSR-001's periodic-review cadence.
**Lane:** `…01TTTQ1h`, claimed on the work-orders board as "D4 — periodic
review: the editor family, line by line".

## Why this review

The weekly reviews of 2026-09-24 and 2026-09-28 (`../README.md`) both record
the same gap: three sets of files were never read line by line. Every
regulated draft passes through them:
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, 5,134 lines;
- `RichSectionEditor.tsx`, 2,716 lines;
- the `ProtocolDev*` family, 15 files and about 4,250 lines.

This review reads them, and the server routes and services behind them.

## Method

- **Head read:** `7087f46e2`. Each verifier reports whether anything between
  that commit and the head it read changes its verdict.
- **Six lenses,** run by the repo's auditors by name, read-only:
  - Part 11 UX;
  - honest state;
  - security;
  - accessibility;
  - design system;
  - microcopy.

  The first four ran one agent per file group:
  - A: `DocumentWorkbench.tsx` and the panels it mounts;
  - B: `RichSectionEditor.tsx` and its extensions;
  - C: `ProtocolDev*` and the protocol routes and services.

  The design-system and microcopy lenses each ran once across all three
  groups. That makes 14 reports, filed in `lenses/`.
- **Verification:** every blocker, high and medium finding went to a separate
  agent told to refute it, reading the code itself and treating uncertainty as
  refutation. Accessibility mediums were verified in one group per file group.
  So were the security mediums. The verifiers' hand-backs are in
  `verification.md`, as returned. Where a verifier regraded a finding, its
  grade is the one used below. Low findings were not independently verified.
- **Fixes:** each confirmed finding in a file no other lane had changed in the
  last 24 hours was fixed in this lane, failing first. Each fix has its own
  folder under `fixes/<ID>/` holding the red and green runs and the mutants.
  Findings in files another lane held are handed on through the work-orders
  board, not edited.

## Result

**Refuted:** M-1, HS-A-4 and A-C-1.

Some findings were reported by more than one lens. Each pair or triple below
is one defect:
- SEC-C-1 and P11-C-1;
- SEC-A-6 and SEC-B-4;
- SEC-A-5, SEC-B-6 and SEC-C-6;
- SEC-A-7 and SEC-B-7;
- SEC-A-10 and SEC-B-5;
- SEC-A-11 and SEC-B-2;
- P11-A-1 and SEC-A-8.

### Blockers

| ID | What | Verdict | Status |
|---|---|---|---|
| P11-C-1 / SEC-C-1 | A viewer could make every ProtocolDev governed write except the two signatures | confirmed | **fixed** `10ad41a2` (`fixes/P11-C-1/`). AnA's door is closed by `41e7c539` (another lane) |
| SEC-C-2 | A finalized, signed protocol's schedule of assessments could still change | confirmed | **fixed** `29d80fe9` (`fixes/SEC-C-2-3-8/`) |
| SEC-A-1 | "Re-read source" re-baselined any citation in the tenant, sealed documents included, unaudited | confirmed | **fixed** `63b43274` (`fixes/SEC-A-1_P11-A-1_SEC-A-2/`) |
| SEC-B-3 | A comment anchor saved unrelated prose under a system reason, and could anchor the wrong words | confirmed | **fixed** `b43ec3af` (`fixes/SEC-B-3_V-2_P11-B-4_SEC-A-6/`); a server-side anchor-only check is a follow-on |
| P11-B-1 | The co-author body is overwritten with no reason, no audit entry and no copy of the old text | partly confirmed; blocker per its verifier | handed on, board item 5 |

### Highs

| ID | What | Verdict | Status |
|---|---|---|---|
| P11-A-1 / SEC-A-8 | No citation act reaches the document's audit trail; overwrites and deletes keep no before-image | partly confirmed / confirmed | **fixed** `63b43274` (`fixes/SEC-A-1_P11-A-1_SEC-A-2/`); the rail's labels are handed on, board item 6 |
| SEC-A-2 | A comment and its audit row were filed against the document named in the body | confirmed | **fixed** `63b43274` (`fixes/SEC-A-1_P11-A-1_SEC-A-2/`) |
| SEC-A-3 | The project files viewer framed server-typed HTML as a PDF, in the app's origin | confirmed | **fixed** `49f5ad82` (`fixes/SEC-A-3/`) |
| SEC-A-6 / SEC-B-4 | "Insert reference" parsed a vault title as markup | confirmed; raised from medium | **fixed** `b43ec3af` (`fixes/SEC-B-3_V-2_P11-B-4_SEC-A-6/`) |
| SEC-A-7 / SEC-B-7 | AI authorship is a client claim the ledger records as fact | confirmed; raised from medium | open: needs a server record of AnA's outputs to verify against |
| SEC-B-1 | An image reference with `..` segments got an authenticated GET to any API route from every viewer | confirmed | **fixed** `ce56754d` (`fixes/SEC-B-1-2/`) |
| SEC-B-2 / SEC-A-11 | External images fetched from third parties by every viewer; a figure could change after approval | confirmed | **fixed** `ce56754d` (`fixes/SEC-B-1-2/`); export, section create, co-author PUT and batch accept should use the same rule |
| SEC-C-3 | The budget-parameter upsert let one tenant claim, block or overwrite another's | confirmed | **fixed** `29d80fe9` |
| SEC-C-4 | Stored text spliced into the chat turn as the user's own words | confirmed; raised from medium | **fixed** for the three ProtocolDev buttons, `e8f448d1` (`fixes/SEC-C-4/`), and for Authoring's "Ask AnA to draft", `f569d49d` (`fixes/SEC-C-4-class-draft-prompt/`). **Open:** the editor's `askForSource` (SEC-C-4 (a)). Its fenced server channel landed in `dfe08dea` (`fixes/SEC-C-4a-server-half/`), but it is inert: the stream route never reads `module_context` (board item 14). Two workbench sites are handed on (board item 6) |
| SEC-C-7 | A signed disposition is shown under a free-text label, not the signer | confirmed; raised from medium | **fixed** `6b442012` (`fixes/SEC-C-7/`). Follow-on (b), the reviewer's name derived from the chosen account and read-only: **fixed** `e6822dac` (`fixes/SEC-C-7-followon/`) |
| HS-B-1 | A failed Data Room read is shown as "no sources" | partly confirmed | partly fixed by `59b0d8f9` (GE-H-1: the Sources rail's "Record a source" picker). The rest is handed on, board item 6: the Cite picker, the Vault rail, and citations painted "unresolved" |
| V-2 | Source mode: text typed during a save was reported saved, and neither saved nor cached | confirmed (found by HS-B-2's verifier) | **fixed** `b43ec3af` (`fixes/SEC-B-3_V-2_P11-B-4_SEC-A-6/`) |

### Mediums

| ID | What | Verdict | Status |
|---|---|---|---|
| P11-A-2 | Freeze asks for no re-authentication | partly confirmed | founder decision P1-32 |
| P11-B-2 | The editing ribbon is shown, and only refused at the server | confirmed | open |
| P11-B-3 | The co-author canvas never reflects the document's lock state | confirmed | open, with board item 5 |
| P11-B-4 | Undo outlives a recorded tracked-change decision | confirmed | **fixed** `b43ec3af` (`fixes/SEC-B-3_V-2_P11-B-4_SEC-A-6/`); a reviewer's own tracked typing can still be undone after accept |
| P11-C-2 | The §11.50 manifestation is shown once, then nowhere | confirmed | **fixed** `fb69b716` (`fixes/P11-C-2/`): header, review rows and the export |
| P11-C-3 | No audit trail or version history is reachable from the protocol | confirmed | open |
| P11-C-4 | Finalize and Record disposition offer a signature the server will refuse | confirmed | **fixed**: Finalize `8e72b9bf` (`fixes/P11-C-4-finalize/`), disposition `d848acf3` (`fixes/P11-C-4-disposition/`) |
| HS-A-1, HS-A-2 | History, Sources and Comments counts go stale after a write | confirmed | handed on, board item 6 |
| HS-B-2 | The save footer's caching claim is not tied to a cache | confirmed | partly fixed with V-2 (`b43ec3af`): the cache is now kept whenever the buffer is dirty. The footer wording is open |
| HS-C-1 | An unreadable protocol was shown as "no protocol" or "ready to finalize" | confirmed | **fixed** `670865e9` (`fixes/HS-C-1/`) |
| HS-C-3 | A malformed derivation read is shown as "everything reconciled" | confirmed | **fixed** `146a6382` (`fixes/HS-C-3/`) |
| SEC-A-4 | Stored text could write itself into AnA's system prompt | confirmed | **fixed** `44a48357` (`fixes/SEC-A-4/`) |
| SEC-A-5 / SEC-B-6 / SEC-C-6 | The device draft cache outlives sign-out and is keyed by section, not user | confirmed | **fixed** `de430222` (`fixes/SEC-A-5/`): keyed by account, purged at sign-out, no offer on a read-only canvas |
| SEC-A-9 | Revert commits before its audit row | confirmed | **fixed** by another lane's sweep of the same day, `59b0d8f9` (GE-P-1) |
| SEC-A-10 / SEC-B-5 | The co-editing room authorises by tenant only | confirmed; dark in every configuration found | open. It must be fixed before co-editing is switched on. The session re-check and the non-integer subject were closed by another lane, `dd91ded4`. The grant and lock check is handed on (board item 12) |
| SEC-C-5 | The AnA protocol-section write records a reason nobody gave | confirmed | handed on, board item 7 |
| SEC-C-8 | Six protocol create paths never proved the document was the caller's | reported with SEC-C-3 | **fixed** `29d80fe9` |
| A-A-1, A-A-2, A-A-4, A-A-5 | Reason field state; Escape closes AnA; 12 px targets; invisible draft dot | confirmed | handed on, board item 6 |
| A-B-1 | The MDX dossier drawer's save contract loses text on reload | partly confirmed | recorded. The drawer is outside the launch catalog (Rule 2) |
| A-C-2, A-C-5, A-C-8 | Tab state; SoA cell names; visit-header target size | confirmed | **fixed**:<br>• A-C-2: the outline, `88ef5f87`. The tab strip was fixed the same day by another lane's tablist, `780a0639` (GA-2)<br>• A-C-5: `8691cfe8`<br>• A-C-8: `a0bdfbf0` |

### Lows

Lows were not independently verified; each is in its lens report:
- A-A-3, A-A-6;
- A-B-2 through A-B-6. A-B-2's verifier found the anchor click path dead for
  pointer users as well; A-B-2 and A-B-3 are fixed in `26e0b3a8`
  (`fixes/A-B-2-3/`);
- A-C-3, A-C-4, A-C-6, A-C-7, A-C-9 through A-C-12;
- DS-1, DS-2;
- HS-A-3, HS-C-2;
- M-2 through M-4;
- P11-A-3, P11-A-4;
- SEC-A-12, SEC-B-8 through SEC-B-10.

## Round 2 (2026-09-28, evening)

A read-only triage re-checked every open finding and follow-on at the head
and attributed each file's holder. It is filed as returned in `triage/`, one
file per group plus the completeness critic. That re-check found:

- **NEW, high:** the eCTD batch-draft accept records a client claim of AI
  authorship as fact. It is the second door of SEC-B-7.
- **NEW-P11-B-1a, medium:** ingestion adopts a model-proposed section code
  onto an approved co-author document.
- **NEW-AIACCEPT-POSTCOMMIT, medium:** the AI-draft accept writes its
  revision and audit row after COMMIT. Handed on, board item 13.
- **Board item 14:** the screen state 114 surfaces publish to AnA reaches no
  model. `buildChatContext` has no production caller, and the stream route
  never reads `module_context`.
- **Protocol-build review (`triage/new-protocol-build.md`):** 13 findings in
  another lane's new engines. The re-check at `1f5c009b`
  (`triage/new-protocol-build-recheck.md`) found:
  - 2 fixed, 4 partly fixed and 7 open;
  - 3 new defects in PB-1's unbounded-CPU class, one of them a regression
    from the lane's own fix.

  Handed on as board item 15.

Round 2's fixes were each made failing first and reviewed by an agent told to
refute them.

**Landed:**
- `f569d49d`: the SEC-C-4 class, draft prompt.
- `e6822dac`: the SEC-C-7 follow-on.
- `dfe08dea`: SEC-C-4 (a), server half, inert.
- `f2ab9b3cd` (2026-10-04, on trunk at the merge `25740b97c`): P11-B-4,
  remaining gap. A recorded accept or reject is an undo and redo floor in a
  session of any length (`fixes/P11-B-4-remaining-gap/`). The first
  attempt's reviewers found that redo reversed a decision too, and that a
  long session disabled undo; both are fixed and pinned.
- `e93ee0387` (2026-10-04, same merge): SEC-B-1/2 follow-ons a, b1, b6.
  Create from an organization template, AI section drafting and export apply
  the section figure rule (`fixes/SEC-B-1-2-followons/`). The first attempt's
  reviewers found that the export placeholder printed a whole base64 payload,
  and that generated drafts were double-escaped; both are fixed and pinned.

These two were reviewed by agents told to refute them in their first
attempts. The final fix-up cycle was checked by this lane alone (each fix
failing first, mutants), because review agents were unavailable that week.
Independent refute-reviews at the merge are recorded in round 3 below.

**Withdrawn unpushed:** NEW-P11-B-1a. This lane's attempt (classify refused
to re-file a verdict row) was superseded by `c3f2b287a` (`…01SuVLo2`,
2026-10-01), which closes the same finding more strictly: classify and
extract propose and write nothing. Its evidence folder is not filed.

**Still in progress:** the batch-draft door. The reviewers found that a
`< … >` span in the text passed both the verifier and the lineage. Round 3
below takes it up.

## Round 3 (2026-10-04)

The lane resumed after five days, with 1,170 commits on trunk. It carried
two lanes onto trunk (above) and withdrew one.

- **The batch-draft door: closed** (`fixes/batch-draft-door/`). The round-2c
  reviewer's three blockers are fixed, and its two gaps are pinned, each red
  first against round 2c's code:
  - the blockers: a raw-text element split from its opener, an honest
    markdown draft refused, and surviving mutants N1 and N5;
  - the gaps: a one-word claim naming AnA, and the empty-needle guard (N8).

  Two more were found while fixing them, and are closed too:
  - content read as plain text shows every `<…>`;
  - a carried-forward clause inside a later raw-text region kept AnA's name.

  The known-tag rule became one shared copy, in linear time
  (`fixes/known-tag-rule/`). 15 of 15 mutants are killed. Self-reviewed;
  independent review to follow.
- **Independent refute-reviews of the two lanes landed above**, by agents
  told to refute them, at the merge `25740b97c`:
  - **P11-B-4 undo floor.** The floor held: a model-based fuzz of 300 seeds ×
    500 steps found nothing, and that fuzz kills 5 of 5 mutants. The defects
    are in its wiring:
    - the ribbon's Undo and Redo stay enabled at a floor (medium, already on
      this lane's list);
    - live co-editing's Yjs undo has no floor. That path is behind
      `ENABLE_LIVE_COEDITING`, which is off, but this is a blocker before
      the flag is turned on.
  - **SEC-B-1/2 figure rule.** Defect found:
    - one high this commit introduced: an image with a duplicated `src`
      attribute is filed by the export as the second value, while the canvas
      shows the first;
    - mediums and lows in the same rule;
    - a high in another door: the CMC Module 3 placement stores markdown the
      eCTD leaf renderer reads as HTML, so "Impurity B was <LOQ in all 3
      batches" is filed as "Impurity B was 98.0%)".

  The figure review is answered in `fixes/SEC-B-1-2-followons/r3/`:
  - D1 to D6 are fixed, each red first. The two readers of a section's images,
    a browser and the export's parser, must agree, or no image of the section
    is filed and the save is refused. One parse reads `<pre>` as markup.
  - O1 is fixed at its class: the eCTD leaf opens stored content as the
    editor does.
  - 11 of 11 mutants are killed.
  - The rest is handed on (board items 17 and 18).

  The undo review's ribbon item stays on this lane's list. Its co-editing
  floor is a blocker before `ENABLE_LIVE_COEDITING` is turned on (board
  item 19).

## Round 4 (2026-10-04): the batch-draft door's refute-review, answered

An independent refute-review of round 3's batch-draft change (`283fe08c4`)
found eleven defects. Round 3 is not closed, and its "Not done here" premise
was refuted: attribute text is not hidden from every reader. The editor's
source mode shows it, and the leaf and the export print an alt, a footnote
and a locator. The worst defect:

- **D2, blocker.** A tag-shaped token (`<b"3 patients died">`) was hidden by a
  browser and by the comparison form, but printed by the leaf and the export.
  So a clause showing words AnA never wrote was credited to her.

All eleven are fixed in `fixes/batch-draft-door/r4/`, each red first. They
reach the live authoring AI-draft accept through the same lineage, and a
test block pins that door too. The rule now reads:

- A tag is removed for comparison only when a browser and the export's parser
  read it alike, and its attributes are the presentational ones the editor
  writes.
- A clause overlapping an image or a printed attribute is not compared.
- Everything from the first point the readers may disagree is not compared.
- Content that opens in source mode, or that holds no known tag, is compared
  character for character.

22 of 22 mutants are killed. Work went to a background agent with a fixed
file list, and was reviewed here before commit.

Found while landing it: `batch-draft-accept.test.ts` had pinned, since
`283fe08c4`, a call that round 3 replaced. The snapshot still takes the
replaced content, through the transaction's one queryable. The pin is
updated.

## Files

- `lenses/`: the 14 lens reports, as returned. Paths to scratch harnesses
  outside the repository are redacted to `<scratch>`.
- `verification.md`: every verifier's hand-back.
- `fixes/<ID>/`: one folder per fix, each with a README, the red and green
  runs and the mutants.
- `triage/`: round 2's re-check of every open item, as returned.
