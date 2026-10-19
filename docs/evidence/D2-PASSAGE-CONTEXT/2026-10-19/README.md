# D2 / W2 — passage context as one exact, verified source span

Baseline: `14defeb607150624b79c8586a8a8ff43f70a7ded`. That is the commit that
holds only [CONTRACT.md](CONTRACT.md), committed before any test or code. The
contract includes Amendments A and B, written after the two independent
reviews. Design:
[PASSAGE_CONTEXT_SPAN_2026-10-18](../../../design/PASSAGE_CONTEXT_SPAN_2026-10-18.md).
Need: the second half of priority 3.

## What changed

| Before | After |
| --- | --- |
| Vault context expansion joined neighbour chunks with `'\n\n'`. That repeated each chunk's overlap (400 characters by default) and inserted paragraph breaks the source does not have. The joined text was compressed and quoted as a citation. | The same tenant-fenced neighbour statement also reads chunk coordinates and, on the hit's row only, the document text. `buildPassageContext` verifies every chunk against that text, then returns `extractedText.slice(start, end)`: the source's own characters, once. It extends up to 1,000 characters on each side of the hit, within the 12,000 cap. |
| — | Each span carries a `DraftSourceReferenceV2` built by the existing identity helper. The authoring save path re-verifies it: tenant, actor, program, currentness and both hashes. |
| — | Anything that does not verify leaves the hit's own content standing and gives a reason: `no_offsets`, `basis_mismatch`, `chunk_set_changed`, `not_contiguous`, `encoding` or `budget`. Joined text is never substituted. |
| Passage search dropped the expansion. | `PassageHit` gains `contentHash`, `hitSpan` and `context`. |
| The AnA tool's result overran the 8,000-character model cut, which removes text from the middle. | The tool fits its result to 7,500 characters itself (P-24). It never sends the hit twice. Working from the lowest-ranked hit up, it drops surrounding text, then the hit's own text, then whole passages, always keeping one. It says what it left out and how to read the exact span with `read_project_document`. |

## How it was built and checked

Five subagents worked in parallel. One session made every commit, all to
`concept2cure-v2`, with no worktree and no branch.

1. **Independent test author (span, pipeline and mapping).** Wrote 45
   tests from the contract alone, using real chunker fixtures. It ran them in
   a `git archive` export of the baseline and validated them against 10
   deliberate mutations of a scratch builder.
2. **Security audit (read-only).** No tenant, actor, withdrawal or save-path
   defect, and every predicate verified. It found the tool-result budget
   defect, which led to Amendment A.
3. **Second independent test author.** Wrote 17 budget-fitting tests from
   Amendment A. It also wrote the first PGlite run of the new SQL, using the
   real disposition migrations and real chunks.
4. **Correctness review (read-only).** Fuzzed about 57,000 hits from real
   chunker output. It found one spec gap: a nested chunk could end the window
   before the hit (Amendment B).
5. The fuzz was re-run after the fix.

## Evidence files

- `initial-red.txt`: the first author's 45 tests against `14defeb6`. The
  span-builder file cannot load, because its module does not exist yet. 9
  further tests fail as intended and 4 controls pass.
- **Second author's baseline** (its report, recorded at `14defeb6`): budget
  tests, 12 fail and 5 controls pass; PGlite, 6 fail and 4 fences pass.
  - Fences: another organization's document, `remove_data` (with `keep_data`
    retained), a superseded version, and a content-hash mismatch.
- `review-red.txt`: the implementer-added nested-chunk regression fails on
  the pre-fix code, which returned an available context when it should have
  refused. It passes after Amendment B.
- `final-green.txt`: **201 tests in 18 suites pass.** These are the six new
  suites (including the PGlite run of the real SQL) plus every existing
  suite that touches expansion, passage search, the passage tool, retrieval
  revalidation and authoring draft sources. Command: `test-command.json`.
  Test hashes: `frozen-tests.sha256`.
- `fuzz/`: the reviewer's fuzz, re-run after the fix. **195,960 hits, 0
  failures**, checking:
  - `text === T.slice(span)`;
  - the hit lies at `hitSpan`;
  - the span is at most 12,000 characters;
  - the identity re-verifies;
  - `clipped` and `chunkRange` are correct.

  Its `db:` rows simulate a UTF-8 database round trip and show
  `basis_mismatch`. That is the chunker's existing surrogate-split defect,
  correctly refused.
- `lint.json` / `lint-comparison.txt`: zero errors, and warnings equal to
  baseline. `ci:sql-interpolation` passes: coordinates and the hit id are
  bind parameters.
- One existing test located the neighbour statement by its first selected
  column. Only that locator was updated, and its fence assertions are
  unchanged.

## Publication note

The first push was refused by the whole-project typecheck gate
(`push-attempt-1-typecheck-red.txt`). The PGlite test's seam declared its
executor's rows as `Record<string, unknown>[]`, while the harness executor
returns `unknown[]`; the second test author ran ESLint but not `tsc`. The
declaration was widened to `unknown[]`. The value is only passed through as
`unknown`, so no assertion changed. All six new test files then typecheck
with zero errors, the suite still passes 10 of 10, and `frozen-tests.sha256`
pins the corrected bytes.

## Limits and follow-ups

- **Narrower generation context.** `regulatory_qa` generation context
  narrows from whole neighbour chunks (about ±3,600 characters) to ±1,000 of
  exact text. A configurable side width is a follow-up.
- **Backfilled documents with leading whitespace.** Backfill chunks the
  trimmed text, so a document with leading whitespace (including a BOM) gets
  `basis_mismatch` on every hit. Follow-up: chunk the untrimmed text.
- **Surrogate pairs split by the chunker.** These become `basis_mismatch`
  after the database round trip. This fails closed and is a chunker defect.
- **Memory.** The whole `extracted_text` is read once per expanded hit, up
  to 25 in parallel.
- **Not covered by PGlite:** vault RLS (PGlite runs as owner), the
  `vaultRead` verified-program path, and separate soft-delete cases. The
  predicates for those are unchanged in the statement.
- **Unchanged paths:** `rag_chunks` expansion and model-compressed content
  (`compressedContent`).
- This is not deployment, retrieval qualification or validation.

## Publication

Published to `concept2cure-v2` as `afaa0d08a..3e559cc37` (`push-history.txt`).
After the typecheck fix, all three attempts passed every pre-push gate,
including whole-project TypeScript. The first two were rejected only because
the remote advanced during the gate run. Each time the incoming commits (20,
then 3, then 2) shared no file with this change and were merged with no
unmerged files. No force push and no hook bypass.
