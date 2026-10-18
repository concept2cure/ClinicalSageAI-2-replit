# D2 / W2 — Japanese terms in the draft source-window selector

Baseline: `15578388048ed44c978df70168757a6014d213b8`.
Contract: [CONTRACT.md](CONTRACT.md). Need: the first half of priority 3 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

`chooseSourceWindow` decides which stretch of a cited document AnA batch
drafting and editor assembly hand to drafting. For Japanese text it fell back
to the document's opening: hits needed a non-letter on both sides, and
Japanese has no spaces. A Japanese instruction also became one unmatchable
token. The selector now:

| Rule | Change |
| --- | --- |
| Boundary | A spaced-script neighbour (Latin, Cyrillic, …) still blocks a hit, unless the term's own edge is Han/Hiragana/Katakana. With no Japanese in the text, this is the baseline rule exactly. |
| Terms | Spaced-script words as before. Han/Katakana runs of 2+ letters are terms, split at hiragana. Han stretches of 3+ add overlapping bigrams after all whole terms, so `有害事象発現率` matches `有害事象の発現率`. Japanese instruction boilerplate (作成, 要約, 記載, …) is dropped like the English stop list. At most 40 terms, as before. |
| Sentence start | `。`, `！`, `？` count as sentence ends, alongside `. ` / `? ` / `! `. |

## Fail-first and final checks

- `initial-red.txt`: frozen test bytes (`frozen-tests.sha256`) against
  baseline production bytes. **8 intended failures, 4 passing controls.** The
  probe case returns the opening. The full-stop case starts at the 300-character
  fallback floor (37200), not after `。` (37500).
- `initial-red-pre-control.txt`: an earlier red run, kept as it happened.
  Reading my first implementation's diff, I found it would have let a term
  ending in a hyphen (`anti-`) match inside `anti-drug`, an English behaviour
  change. Before the final red run, the rule was corrected and an English
  hyphen-edge control was added. `hyphen-control-mutation.txt`: that control
  fails when the incorrect rule is restored temporarily (it selects
  `anti-drug` at 4201), and passes on baseline and on the final code.
- `probe-after.json`: the recorded probe
  (`../../D2-BATCH-CONCURRENCY/2026-10-18/remaining-needs-japanese-probe.mjs`)
  re-run unchanged. Embedded Japanese now selects `[37501, 38001]`, the same
  window as the spaced-Japanese and English controls. Baseline was `[0, 500]`.
- `final-green.txt`: 14 suites, **298 tests pass**. They cover the new suite,
  the 11 existing English window tests, the source loader, source-context
  authority, both checkpoints, the source-access tools, blueprint drafting,
  batch termination and cancellation, and both editor-assembly PGlite suites.
  Command: `test-command.json`. No provider or live database.
- `lint.json` / `lint-baseline.txt`: 0 errors and 0 warnings, the same as baseline.

## Limits

The fixtures are engineering cases I constructed and labelled. They are **not
expert relevance judgements**, and this is not multilingual retrieval
qualification. Bigrams approximate segmentation; there is no morphological
analysis. No NFKC normalisation: full-width Latin does not match ASCII. Thai
and other unspaced scripts outside Han/Hiragana/Katakana are unchanged.
Vector passage search (`document-passage-search.ts`) and chunk-boundary
context, the second half of priority 3, are not addressed. Spans stored
earlier are re-verified as recorded, not re-chosen, so existing manifests are
unaffected.
