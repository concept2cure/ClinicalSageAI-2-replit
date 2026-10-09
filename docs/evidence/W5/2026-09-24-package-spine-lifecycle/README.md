# W5 evidence — the package-model spine can file a follow-up sequence, 2026-09-24

**Row moved:** D7 (one real sequence), workstream W5, engineering half. The
package-model spine — `POST /api/submission-ops/packages/:id/assemble` →
`executeGovernedTransmit` (the HTTP transmit route and the AnA 510(k) transmit) —
could file sequence 0000 and nothing after it. It now plans each later sequence
against what the package actually transmitted, and seventeen defects an
adversarial review found in that planning are closed, each shown failing first.

**D7 stays not green.** Both dashboards read the same before and after this
work, because every row they observe is a licensed artefact or a credential:
`submission-preflight` **2/15** (`submission-preflight-2026-09-24.txt`),
`ga-readiness-report` **5/41 · 19 blockers** (`ga-readiness-report-2026-09-24.txt`).
The rest of D7 — DTDs (B3), a licensed validator or the declared FDA-criteria
fallback (B4), the FDA ESG test account, the accepted test sequence and its ack
chain — is procurement and accounts, not code.

**Session:** `…session_01LjrcEe8y3zUQxwX91zzTaM`. Lane claimed on
`docs/work-orders/README.md` §0.

## Commits, in order

| Commit | What it closes |
|---|---|
| `9f48c6c5` | The package path could file only 0000: no leaf carried an operation, so the packager refused every later sequence. `planSequence` supplies the FILED history (appended at successful transmit, never at assembly) and its fold; the diff is the canonical `computeLifecycleOperations`. |
| `3e90a2b6` | Leaf PDFs were not reproducible (PDFKit stamps `/CreationDate` from the wall clock), so the unchanged-leaf path was dead in production and every follow-up re-filed the whole application as `replace`. `'amendment'` — the term the refusal itself suggested — is not an fdast term and returned a bare 500. Four route regressions passed the assemble suite; it now fails on six. |
| `f79c6db2` | A replaced Module 1 leaf's `modified-file` was root-relative inside a backbone two directories down, so it resolved to a path in no layout. |
| `d5c22a80` | The descriptor, validation and leaf count described the pre-drop leaf set; a follow-up that changed nothing stored a leafless, transmittable bundle; a gap or a backfilled sequence was accepted; an unreadable manifest was recorded then silently dropped; the Part 11 sign row did not record which sequence it filed. |
| `af6440e9` | A leaf's file name (composed from an editable section key) was its cross-sequence identity, so a renamed section filed the same document twice; and a withdrawal could not be filed from this spine. Reuses the core spine's withdrawal recording (`50ecbb68`, `6fe72bae`) rather than a second copy. |

## Failing first

Each rule was reverted in place and the suite run against the reverted source;
the file was then restored from a scratchpad copy. Counts are failing tests.
The `af6440e9` rows were re-measured on the rebased tree on 2026-09-24; the
earlier rows were measured on each commit's own base at the time.

| Commit | Rule reverted | Failing |
|---|---|---|
| `3e90a2b6` | leaf rendering back to the wall clock | 3 of 4 (`leaf-pdf.test.ts`); 2 in the assemble suite |
| `3e90a2b6` | unchanged leaves shipped anyway | 1 |
| `3e90a2b6` | no operation / modified-file handed to the packager | 3 |
| `3e90a2b6` | descriptor stores no leaf manifest | 2 |
| `3e90a2b6` | the sequence recorded as filed at ASSEMBLE | 1 |
| `3e90a2b6` | lifecycle dropped from the response | 2 |
| `3e90a2b6` | packager refusals thrown as plain `Error` | 1 |
| `3e90a2b6` | vocabulary check removed | 3 |
| `f79c6db2` | the Module 1 pointer not rebased onto its backbone | 1 — `m1/us/us-regional.xml → ../0000/m1/us/1-2/cover.pdf resolved to 0001/m1/0000/m1/us/1-2/cover.pdf` |
| `d5c22a80` | the drop not applied to validation / counts | 1 |
| `d5c22a80` | `NOTHING_TO_FILE` removed | 2 |
| `d5c22a80` | `SEQUENCE_OUT_OF_ORDER` removed | 2 |
| `d5c22a80` | manifest passed through unchecked at the writer | 1 |
| `d5c22a80` | an eCTD sequence without a manifest reported `not-applicable` | 2 |
| `d5c22a80` | the sign row and manifest drop the filed-sequence facts | 1 |
| `af6440e9` | the route sends no identity | 1 of 138 |
| `af6440e9` | the path fallback removed | 22 of 138 |
| `af6440e9` | leftover-unchanged counted by key shape | 3 of 138 |
| `af6440e9` | differently keyed leaves matched by path | 1 of 138 |
| `af6440e9` | the surface drops the submission type / withdrawals | 1 of 138 |
| `af6440e9` | the leaf-bytes adapter writes bytes for every leaf | 1 of 138 |

Control after each: all pass. On the rebased tree for `af6440e9`: 98 files /
1239 tests across the ectd, submission-gateway, assemble, transmit-guard,
compile-lifecycle and surface suites; `tsc` 0.

## What a reader should not conclude

- Nothing here is agency validation. The packager's structural checks and the
  internal validator are not the FDA eValidator, and no DTD is vendored.
- Only the FDA backbone maps the submission type onto a controlled vocabulary.
  EMA, PMDA and Health Canada take it as free text on this path, and nothing is
  checked against a list they do not have.
- There are still two assembly spines — the package-model spine (this lane) and
  the sequence spine (`transmitSequence`, used by the IND demo lane). Both reach
  the same packager and the same transmit guard. Converging them is an
  architecture decision, not a cleanup, and was not attempted.
