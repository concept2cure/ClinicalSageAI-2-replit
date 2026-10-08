# W3 / D4 — archive fixture clock ordering

Native case 12 now supplies a verification time strictly after its actual archive
ledger timestamp. It takes the ledger's maximum timestamp, truncates to JavaScript
milliseconds, then adds one millisecond. The original three-row deletion and full
`unverifiable` verdict assertions remain unchanged. Every byte outside that case's
callback is unchanged. The production verifier still uses its independent clock
by default and refuses a future ledger without tolerance.

## Evidence and checks

- Actual `099eb36` GitHub run `37707725875`, integration job `113091054671`:
  150 physical native files, 149 passed / one failed; 1,582 cases, 1,581 passed /
  one failed. The sole failure is this case's verdict assertion, after the
  three-row deletion assertion passed. `NATIVE-RED.json` preserves the exact
  failed assertion and artifact/report digests. The artifact omits actual clock
  values and truncates the verdict, so the historical cause remains unproven.
- Controlled local RED: six new cases failed at the same positive native-callback
  assertion with the original fixture. These are six reproductions of one
  boundary, not six independent security-guard REDs. `RED.txt` preserves output.
- Final GREEN: four focused audit files, 54 passed / zero skipped (`GREEN.txt`),
  including six new cases. The actual extracted native callback passes;
  verification before the ledger remains broken; verification after it is
  archived/unverifiable, never verified. At-anchor and future ledger timestamps,
  hot-window cutoff and insufficient deletion budget remain refused.
- Scoped ESLint: both changed TypeScript files and the evidence verifier, zero errors / zero warnings.
  Native isolation guard: all 150 physical native files remain unmocked.
  `git diff --check` passed. `SOURCE-REVIEW.json` and its reproducible AST/byte
  comparison confirm existing assertions, archive door and surrounding cases
  are preserved. `SCOPE.json` pins protected source and guard objects.

The regression uses the real PGlite PostgreSQL engine, native DDL, actual two
audit migrations, real archive door, writer and unchanged verifier. It derives
its scenario date from the engine's clock, then deliberately sets only the ledger
timestamp to 750 microseconds after the anchored JavaScript clock using an
owner-only synthetic construction. JavaScript Date alone is controlled; timers
and database execution remain real. This is a constructed temporal boundary,
not a timestamp trace from the failed GitHub run and not a runtime ledger write.

## Publication limits

Canonical source was fast-forwarded through `c7ae8c0` and the unpublished
fixture commit rebased onto `6857dd0` to preserve another
session's independent UI delivery. This delivery changes only two audit test
files and this evidence directory. Production, migrations, CI populations,
security guards, dependencies and statistical baselines stay unchanged.

Run the normal commit hook and the unchanged pre-push checks through the compiler
boundary. The TypeScript trigger remains required; defer the full semantic
compiler to the exact-source remote job with its larger memory allocation.
Do not run the full compiler on this 8-GiB host or alter the hooks to suppress it.
New-source native PostgreSQL and semantic compiler results remain pending at
publication. Focused PGlite GREEN does not qualify either remote gate or overall
product readiness.
