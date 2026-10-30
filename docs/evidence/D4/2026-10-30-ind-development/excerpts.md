# Bounded editor source excerpts

Rows: W3 / D2 and D4. Scope: pure authoring excerpt adapter and focused tests. The lead owns router,
currentness, canonical source identities and persisted-generator wiring. No provider calls or new source store.

## What already exists

- `server/routes/authoring.router.ts` keeps full retrieved chunks for lineage but shows only a 600-character
  prefix of automatic retrieval to the model. Selected assembly sources already carry exact manifests and
  remain outside this change.
- `server/services/ana/draft-source-window.ts` already chooses deterministic relevant windows with exact UTF-16
  offsets, Japanese matching and lowercase-expansion coordinate handling. This adapter reuses that selector;
  no second window selector or store is introduced.
- `server/services/ana/__tests__/draft-source-window*.test.ts` already covers single-window selection. The new
  cases cover the author's multi-excerpt budget, gaps and authentication contract.
- `server/services/clinical-regulatory-evidence/draft-candidate-store.ts` already parks full source text and
  `DraftGenerator` JSON. The lead adds typed excerpt receipts to that existing record and parks exact shown
  spans as separate candidate-source haystacks for verified quote matching. Full retrieved originals remain
  available for hashes/currentness. Model paraphrase quotations name generated prose and remain explicitly
  unverified assertions against the actually shown source identities.
- Searches covered `chooseSourceWindow`, `retrievedChunks`, `evidenceBlock`, the 600-character prefix,
  `DraftGenerator`, source windows and excerpts. No deleted authoring excerpt adapter was found in the scoped
  history search.

## Contract

`buildDraftExcerpts(content, { query?, code?, maxChars?, remainingChars? })` returns `promptText` plus a versioned
receipt: original text SHA-256/UTF-16 length, ordered non-overlapping source spans and their hashes/selection roles,
effective source-character budget, shown/omitted character counts and actual prompt character count.

The exported caps are 2,400 source characters per chunk and 12,000 source characters across chunks; callers pass
the remaining total allowance. Labels and the explicit omission notice are counted separately in `promptChars`.
Clinical scopes may retain separated opening/context, methods/population, denominator, safety and limitations
windows. CMC/nonclinical scopes do not receive clinical topic searches. The search view may mask dotted table-of-
contents lines without changing string length; all returned text remains an exact original slice.

`quoteWasShown` authenticates the original text and every span before matching an exact nonempty quote inside
one span. It never matches across omitted gaps, normalizes source text, decides evidence sufficiency or asserts
that the full source was read. `parseDraftExcerptReceipt` validates persisted receipt shape and bounded arithmetic;
source authentication additionally requires the original text.

## Verification

- `excerpts-red.txt`: the initial single-prefix adapter matching the editor's 600-character behavior failed
  ten substantive cases, including distant CSR context, relevant CMC/nonclinical text, Unicode and total budgets;
  21 other cases passed. The gate failed on behavior, not a missing import.
- `excerpts-green-initial.txt` exposed one remaining methods-qualifier truncation. Removing generic repeated
  padding words from the methods query let the existing selector retain the complete methods/population sentence.
- `excerpts-green.txt`: 32/32 focused cases passed, including full distant statements (not just headings),
  efficacy versus exposed-safety denominators, overlap deduplication, dotted ToC search masking, UTF-16 offsets,
  tiny/zero/total allowances, malicious receipts and changed-original authentication.
- `excerpts-lint.txt`: scoped ESLint passed with zero errors and zero warnings. Scoped diff check passed.

Topic searches are deterministic selection heuristics, not completeness decisions. English clinical topic terms
add context windows; the existing selector still provides Japanese/Unicode-aware primary-query selection. No
claim is made that every relevant statement, language or long qualifier fits a finite excerpt allowance.

No provider, broad suite, TypeScript build, commit or push.
