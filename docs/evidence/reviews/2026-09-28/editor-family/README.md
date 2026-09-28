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
| SEC-A-1 | "Re-read source" re-baselined any citation in the tenant, sealed documents included, unaudited | confirmed | _in progress_ |
| SEC-B-3 | A comment anchor saved unrelated prose under a system reason, and could anchor the wrong words | confirmed | _in progress_ |
| P11-B-1 | The co-author body is overwritten with no reason, no audit entry and no copy of the old text | partly confirmed; blocker per its verifier | handed on, board item 5 |

### Highs

| ID | What | Verdict | Status |
|---|---|---|---|
| P11-A-1 / SEC-A-8 | No citation act reaches the document's audit trail; overwrites and deletes keep no before-image | partly confirmed / confirmed | _in progress_ |
| SEC-A-2 | A comment and its audit row were filed against the document named in the body | confirmed | _in progress_ |
| SEC-A-3 | The project files viewer framed server-typed HTML as a PDF, in the app's origin | confirmed | _in progress_ |
| SEC-A-6 / SEC-B-4 | "Insert reference" parsed a vault title as markup | confirmed; raised from medium | _in progress_ |
| SEC-A-7 / SEC-B-7 | AI authorship is a client claim the ledger records as fact | confirmed; raised from medium | open: needs a server record of AnA's outputs to verify against |
| SEC-B-1 | An image reference with `..` segments got an authenticated GET to any API route from every viewer | confirmed | _in progress_ |
| SEC-B-2 / SEC-A-11 | External images fetched from third parties by every viewer; a figure could change after approval | confirmed | _in progress_ |
| SEC-C-3 | The budget-parameter upsert let one tenant claim, block or overwrite another's | confirmed | **fixed** `29d80fe9` |
| SEC-C-4 | Stored text spliced into the chat turn as the user's own words | confirmed; raised from medium | _in progress_ |
| SEC-C-7 | A signed disposition is shown under a free-text label, not the signer | confirmed; raised from medium | _in progress_ |
| HS-B-1 | A failed Data Room read is shown as "no sources" | partly confirmed | partly fixed by `59b0d8f9` (GE-H-1: the Sources rail's "Record a source" picker). The rest is handed on, board item 6: the Cite picker, the Vault rail, and citations painted "unresolved" |
| V-2 | Source mode: text typed during a save was reported saved, and neither saved nor cached | confirmed (found by HS-B-2's verifier) | _in progress_ |

### Mediums

| ID | What | Verdict | Status |
|---|---|---|---|
| P11-A-2 | Freeze asks for no re-authentication | partly confirmed | founder decision P1-32 |
| P11-B-2 | The editing ribbon is shown, and only refused at the server | confirmed | open |
| P11-B-3 | The co-author canvas never reflects the document's lock state | confirmed | open, with board item 5 |
| P11-B-4 | Undo outlives a recorded tracked-change decision | confirmed | _in progress_ |
| P11-C-2 | The §11.50 manifestation is shown once, then nowhere | confirmed | _in progress_ |
| P11-C-3 | No audit trail or version history is reachable from the protocol | confirmed | open |
| P11-C-4 | Finalize and Record disposition offer a signature the server will refuse | confirmed | _in progress_ |
| HS-A-1, HS-A-2 | History, Sources and Comments counts go stale after a write | confirmed | handed on, board item 6 |
| HS-B-2 | The save footer's caching claim is not tied to a cache | confirmed | _in progress, with V-2_ |
| HS-C-1 | An unreadable protocol was shown as "no protocol" or "ready to finalize" | confirmed | **fixed** `670865e9` (`fixes/HS-C-1/`) |
| HS-C-3 | A malformed derivation read is shown as "everything reconciled" | confirmed | _in progress_ |
| SEC-A-4 | Stored text could write itself into AnA's system prompt | confirmed | **fixed** `44a48357` (`fixes/SEC-A-4/`) |
| SEC-A-5 / SEC-B-6 / SEC-C-6 | The device draft cache outlives sign-out and is keyed by section, not user | confirmed | open. Host half handed on (board item 6) |
| SEC-A-9 | Revert commits before its audit row | confirmed | **fixed** by another lane's sweep of the same day, `59b0d8f9` (GE-P-1) |
| SEC-A-10 / SEC-B-5 | The co-editing room authorises by tenant only | confirmed; dark in every configuration found | open. It must be fixed before co-editing is switched on |
| SEC-C-5 | The AnA protocol-section write records a reason nobody gave | confirmed | handed on, board item 7 |
| SEC-C-8 | Six protocol create paths never proved the document was the caller's | reported with SEC-C-3 | **fixed** `29d80fe9` |
| A-A-1, A-A-2, A-A-4, A-A-5 | Reason field state; Escape closes AnA; 12 px targets; invisible draft dot | confirmed | handed on, board item 6 |
| A-B-1 | The MDX dossier drawer's save contract loses text on reload | partly confirmed | recorded. The drawer is outside the launch catalog (Rule 2) |
| A-C-2, A-C-5, A-C-8 | Tab state; SoA cell names; visit-header target size | confirmed | _in progress_ |

### Lows

Lows were not independently verified; each is in its lens report:
- A-A-3, A-A-6;
- A-B-2 through A-B-6 (A-B-2's verifier also found the anchor click path
  dead for pointer users);
- A-C-3, A-C-4, A-C-6, A-C-7, A-C-9 through A-C-12;
- DS-1, DS-2;
- HS-A-3, HS-C-2;
- M-2 through M-4;
- P11-A-3, P11-A-4;
- SEC-A-12, SEC-B-8 through SEC-B-10.

## Files

- `lenses/`: the 14 lens reports, as returned. Paths to scratch harnesses
  outside the repository are redacted to `<scratch>`.
- `verification.md`: every verifier's hand-back.
- `fixes/<ID>/`: one folder per fix, each with a README, the red and green
  runs and the mutants.
