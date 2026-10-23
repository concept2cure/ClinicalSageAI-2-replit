# Canonical eSTAR export ownership through token refresh

The existing exporter already pins a program visit, session revision, account object, mount lifetime, generation, and attachment receipts. Its raw authorization-header equality also retired a legitimate same-session bearer refresh. A successful export then disappeared from the panel; an uncertain write outcome disappeared too. The canonical refresh API changes the bearer without replacing that account or session.

The correction stays in `client/src/concept2cure/mdx/hooks/useEstarExport.ts`. It captures the original transport headers once and passes those headers to the existing POST. A different live bearer can preserve pending delivery only when the canonical auth service adopted it in the original session, its actor and organization claims match the captured account, and the original organization header remains unchanged. It reuses `taskActorScope`, `capturedActorHeaders`, and `captureSessionReadGuard`; the original session revision, account object, generation, mount, and parent-context guards still apply.

The new `useEstarExport.refreshOwner.test.ts` imports the real auth service and calls its real `refreshToken()` flow. HTTP responses and byte delivery are synthetic. It covers confirmed delivery with and without attachments, visible `OUTCOME_UNKNOWN` after refresh, foreign actor/org refresh claims, an unadopted storage bearer, same-account session replacement, actor/org replacement, parent-context retirement, and unmount. Confirmed cases also assert exactly one export POST and the original authorization and organization headers.

| Evidence | Result |
| --- | --- |
| `red.json` | Original two refresh regressions fail; 8 ownership negatives pass. |
| `expanded-red.json` | Before production edits: all 3 legitimate-refresh cases fail; 8 ownership negatives pass. |
| `focused-green.json` | First correction: 11/11 pass. |
| `qualified-hooks.json` | Final source: 3 hook suites, 92/92 pass. |
| `qualified-lint.json` | Forced non-ignored ESLint: 0 errors; production retains its same 2 existing complexity warnings; new test has 0 warnings. |
| `qualified-test-lint.json` | New test passes forced ESLint with `--max-warnings 0`. |

Every runner receipt records exact argv, UTC start, Node version, before/after source hashes, compressed raw output hash, and source drift. The final runs used Node v22.23.3 and `qualified-freeze.json` with 17 pinned source/tool/config files. No source drift occurred. `qualified-production-source.ts.gz` and `qualified-test-source.ts.gz` preserve the exact final owned sources; the RED source snapshots preserve the preceding regression and production states. `packet-files.json` pins packet artifacts other than itself.

`lint-before.json` reflects a preparation error: default ESLint ignored the MDX paths, so it is not lint qualification. `forced-lint-before.json` established the actual pre-edit baseline: 2 production complexity warnings, 0 errors, 0 test warnings. `forced-lint-final.json` caught an intermediate third warning (`max-params`); grouping captured request data removed it. Only `qualified-lint.json` and `qualified-test-lint.json` qualify the final source.

This bounded packet proves client ownership behavior and hook regressions with synthetic HTTP and delivery. It does not establish live FDA/template behavior, PDF reader interaction, agency submission, production deployment, or human acceptance. No compiler, build, global baseline, Git mutation, auth-service modification, receipt-policy change, or new editor surface was performed by this owner. The parent owns integration qualification and canonical landing.
