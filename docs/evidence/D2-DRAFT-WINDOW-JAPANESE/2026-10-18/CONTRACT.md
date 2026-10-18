# D2 / W2 — Japanese terms in the draft source-window selector

Date: 2026-10-18. Baseline: `15578388048ed44c978df70168757a6014d213b8`.
Need: the first half of priority 3 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

`chooseSourceWindow` (`server/services/ana/draft-source-window.ts`) picks the
stretch of a cited document that AnA batch drafting and editor assembly
(`authoring-assembly-sources.ts`) give to drafting. It is deterministic and
keyless. This changes term extraction and hit boundaries only. No new surface,
model, index, schema or route.

## Observed defect at baseline

Recorded probe (`../../D2-BATCH-CONCURRENCY/2026-10-18/remaining-needs-japanese-probe.json`):
`治療中の有害事象発現率は12％でした。` placed 37,501 characters in, query
`有害事象`, budget 500 → window `[0,500]`, basis `opening`. Spaced-Japanese and
English controls select `[37501,38001]`. Two causes:

1. **Hit boundary.** A hit needs a non-letter on both sides. Japanese is
   written without spaces, so `の` before and `発` after reject it.
2. **Term extraction.** A Japanese instruction such as
   `有害事象の発現率を要約する` is one "word" and can never match. A compound such
   as `有害事象発現率` cannot match text that writes `有害事象の発現率`.

`boundaryBefore` also knows only `. ` / `? ` / `! ` as sentence ends, not `。`.

## Contract

- **Unspaced scripts** are characters whose Script_Extensions include Han,
  Hiragana or Katakana. Every other letter or digit is a spaced-script word
  character.
- **Boundary.** A hit is rejected at an edge when the neighbouring character
  is a spaced-script word character, unless the term's own edge character is
  from an unspaced script. For text with no Japanese this is the baseline rule
  exactly, including a term that ends in a hyphen.
  So `有害事象` inside `の有害事象発` matches, `CTCAE` written against Japanese
  matches, and `efficacy` inside `preefficacy` or `𐐀efficacy` still does not.
- **Terms.** Spaced-script words are extracted as before (3+ letters, digits
  or hyphens, stop words removed). Separately, maximal runs of 2+ Han/Katakana
  letters become terms. Hiragana (particles, inflection) separates them and is
  never a term. Each Han stretch of 3+ characters also contributes its
  overlapping bigrams, after all whole terms, so a compound matches text that
  splits it. A small Japanese instruction-boilerplate list (作成, 要約, 記載, …)
  mirrors the English stop list. Still at most 40 terms.
- **Sentence boundary** also recognises `。`, `！`, `？`. The window then starts
  just after the mark.
- **Unchanged.** English and other spaced-script behaviour (every existing
  window test), offsets in original UTF-16 coordinates, determinism, the
  opening fallback with `basis: 'opening'`, and stored spans, which are
  re-verified, not re-chosen.

## Proof required

Fail-first against baseline bytes, then green with the same test bytes: the
recorded probe case; a mixed-script term against Japanese; an instruction
sentence; a compound against split text; `。` boundary; and controls (English
suite unchanged, Latin substring still rejected, no-hit opening, determinism).
The existing window, assembly and source-loader suites still pass. Scoped
ESLint and the normal pre-push gate.

## Limits

These are engineering fixtures that I constructed and labelled. They are **not
expert relevance judgements**, and this is not multilingual retrieval
qualification. There is no morphological analysis: bigrams are a
deterministic approximation. No NFKC normalisation (full-width Latin does not
match ASCII). Thai and other unspaced scripts outside Han/Hiragana/Katakana
are unchanged, and a Korean particle attached to a Hangul word still blocks a
match. Chunk-boundary context (the second half of priority 3) is not
addressed.
