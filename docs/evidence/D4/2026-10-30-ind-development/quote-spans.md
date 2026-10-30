# Quoted lineage across separate shown source spans

## What already exists

- `server/services/clinical-regulatory-evidence/source-attribution.ts` owns the
  pure quote matcher. It checks each generated range against each retrieved
  text independently, preserving original generated offsets and the
  `multiSource` option. Two matching texts with the same canonical source ID
  currently produce duplicate attributions for one generated range.
- `server/services/clinical-regulatory-evidence/__tests__/source-attribution.test.ts`
  already pins exact/normalized matching, source identity, offsets, source order,
  quote coverage and asserted paraphrase behavior. Extend this existing suite.
- The editor route now parks each shown excerpt separately. This protects
  omission gaps: combining separate texts could manufacture a quote that no
  shown excerpt contains. Multiple excerpts can carry one canonical source ID.
- `lineage-gate.ts` consumes the matcher and reports its source-span count;
  `span-lineage.service.ts` owns persistence. Fix the matcher's duplicate
  result, keeping persistence and the asserted-paraphrase contract unchanged.
- A deletion-history search for `*source-attribution*` found no matches in the
  available shallow checkout. Full-history absence is not established.

## Change and verification

Five added behavioral cases cover repeated same-source excerpts, distinct source
IDs, later matching excerpts, repeated generated ranges, and a quote spanning an
omitted gap. The fix deduplicates only successful matches within each generated
range and canonical source ID. Every excerpt remains a separate haystack; the
existing `multiSource` option and deterministic source order are preserved.

- Red: **3 failed / 28 passed**. Duplicate same-source matches failed, including
  repeated generated ranges; later matching excerpts and omission-gap protection
  already passed. See [quote-spans-red.txt](quote-spans-red.txt).
- Green: **31 passed** in the existing source-attribution suite, including its
  `multiSource: false`, exact-offset, normalization, quote-coverage and asserted
  paraphrase cases. See [quote-spans-green.txt](quote-spans-green.txt).
- `git diff --check` passed for the changed code/tests. No provider or native
  database was used; these are deterministic matcher tests.
