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
| Ranking | Scored per whole query term: full credit for the term itself, otherwise the share of its bigrams present. A 9-character compound counts once, like a word. Ties fall back as before. |

## Fail-first and final checks

- `initial-red.txt`: final test bytes (`frozen-tests.sha256`) against
  baseline production bytes. **11 intended failures, 4 passing controls.** The
  probe case returns the opening. The full-stop case starts at the 300-character
  fallback floor (37200), not after `。` (37500).
- `initial-red-pre-control.txt`: an earlier red run, kept as it happened.
  Reading my first implementation's diff, I found it would have let a term
  ending in a hyphen (`anti-`) match inside `anti-drug`, an English behaviour
  change. Before the final red run, the rule was corrected and an English
  hyphen-edge control was added. `hyphen-control-mutation.txt`: that control
  fails when the incorrect rule is restored temporarily (it selects
  `anti-drug` at 4201), and passes on baseline and on the final code.
- `review-red.txt`: the same test bytes against `b200f3fa`, the pre-review
  implementation. Exactly the two ranking tests fail; see Independent review.
- `equivalence/`: randomized old-versus-new comparison on text with no
  Han/Hiragana/Katakana: 230,000 cases including lone and paired surrogates,
  `İ`, `ß`, hyphen edges, Deseret, Hangul and Thai. **0 differences**, with
  1,635 cases that select a relevant window. `compared-files.sha256` pins the
  compared files to the baseline and final source. `diff2.ts` prints the one
  known intentional difference, full-width `！` in text with no Japanese.
- `probe-after.json`: the recorded probe
  (`../../D2-BATCH-CONCURRENCY/2026-10-18/remaining-needs-japanese-probe.mjs`)
  re-run unchanged. Embedded Japanese now selects `[37501, 38001]`, the same
  window as the spaced-Japanese and English controls. Baseline was `[0, 500]`.
- `final-green.txt`: **301 tests in 14 suites pass**. They cover the new suite,
  the 11 existing English window tests, the source loader, source-context
  authority, both checkpoints, the source-access tools, blueprint drafting,
  batch termination and cancellation, and both editor-assembly PGlite suites.
  Command: `test-command.json`. No provider or live database.
- `lint.json` / `lint-baseline.txt`: 0 errors and 0 warnings, the same as baseline.

## Independent review

A read-only reviewer found no correctness blocker and one ranking defect. The
window was ranked by distinct terms, so a 9-character compound counted as up
to 9 terms against 1 for an English word. A methods sentence sharing fragments
of a long compound beat the passage holding the exact result. Both reproduced
cases are now tests (`review-red.txt` shows them failing on `b200f3fa`), and
ranking is per whole query term. The reviewer also noted:

- The offset test did not exercise offset mapping (`𠮷` does not change when
  lowercased). It now uses `İ`, which does.
- Full-width `！`/`？` were untested, and the contract's "unchanged" claim was
  slightly too broad for them. Both are now covered.
- Not changed: a katakana-plus-kanji run is not split, so `プラセボ群` does
  not match `プラセボ投与群`. `時々刻々` yields a junk bigram. Both are recorded
  limits.

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
