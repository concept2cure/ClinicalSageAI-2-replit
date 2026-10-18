# Static SQL publication-gate successor, 2026-10-18

The publication gate reported five SQL-text interpolations in `working-memory.ts` against its existing allowance of two. The three new project predicates have been replaced by literal SQL alternatives for legacy/no-project and exact-project reads; the selector remains a bound value. No guard, baseline, policy or schema was edited. The two existing writer interpolations are unchanged.

Recency, semantic recall and refresh still reject invalid explicit selectors, exclude NULL/other projects when selected, and bind project identity before ordering/limiting. Separate fixed no-project SQL preserves legacy reads even if the project column is absent. A selected missing-column read still returns no recall without an unscoped retry. The existing tests now also verify missing-column no-project recency/refresh compatibility and the unselected semantic five-parameter shape.

The final focused run passed **24 cases across four files**, zero skips, exit 0, **4.24s**. These are the exact-project PGlite, checked-answer writeback, project-attribution and working-memory pure-logic suites. Their exact names/command and every case are retained below and in `2026-10-18-static-sql-cases.json`:

```sh
PATH=/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin:$PATH \
NODE_OPTIONS=--max-old-space-size=4096 \
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/services/__tests__/working-memory-project-recall.pglite.test.ts \
  server/services/__tests__/working-memory-fact-check.test.ts \
  server/services/__tests__/working-memory-project-attribution.test.ts \
  server/services/__tests__/working-memory.test.ts
```

`2026-10-18-static-sql-gate.txt` records the actual unchanged whole-tree SQL interpolation gate passing (1,076 baselined interpolations across 226 files), after root's separate Authoring compositor correction as well. Scoped ESLint records **zero errors**, the working-memory source's **same one existing max-params warning**, and **zero test warnings**. An earlier 24-case green and its temporary max-lines formatting warning are retained as the `before-format` files; eight SQL whitespace-only line joins removed that warning, followed by the final run on the pinned bytes. `git diff --check` over the two changed files passes.

`2026-10-18-static-sql-pins.json` pins the final working source and all recall/JSON sources, suites and config, with explicit comparisons against the preceding packets. Only `working-memory.ts` and the expanded project-recall suite differ from the preceding recall86 snapshot; only `working-memory.ts` differs among the preceding JSON42 pins. The route and JSON suites are unchanged.

The prior **86/11** and **42/4** results remain evidence for their original pinned snapshots. This successor does **not** claim fresh broad86 or JSON42 runs. Vector-result and gateway seams remain stubbed; live citations, model answers, same-thread raw history, organization-wide proactive facts and browser acceptance retain the existing qualifications and open work-order limits.

A later compiler-only fixture type correction is qualified separately by [the eight-case typed-fixture successor](2026-10-18-typed-fixture-addendum.md); this 24-case phase retains its original source pins.
