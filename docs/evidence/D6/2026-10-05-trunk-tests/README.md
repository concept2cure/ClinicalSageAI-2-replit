# D6: the unit-test files that kept trunk CI red, 2026-10-05

**Row:** D6. CI's `Test` and `Integration Tests` jobs run the same vitest
suite, and every trunk run since 2026-10-01 failed both. Run 37251556703
(`afdfd04d4`) listed 73 failing tests in 15 files. Run at `b07608ff3`, 31
still failed, in the six files below. The auth suites had been fixed
meanwhile.

Each file was fixed on the side that was wrong. In all six the product change
that broke the test was deliberate and correct, and the test or its harness
had not followed. No product code changed. No assertion that still describes
correct behaviour was removed or loosened, and nothing was skipped.

| File | Red, then green | Cause | Fix |
|---|---|---|---|
| `server/jobs/__tests__/auditChainIntegritySweep.test.ts` | 10 failed of 32, then 32/32 | `f97d49331` made an anchor older than 48 hours an incident, measured against `Date.now()`. The suite's fixed-date anchor went stale on 2026-10-02T02:00Z. | The sweep's clock is pinned to 24 hours after that anchor. With it set to 49 hours, the same 10 cases fail. |
| `server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts` | 15/15 failed, then 15/15 | `b7bf25037` resolves the organisation's gateway account before sending. That path loads the credential cipher, which refuses to load in production without `CONNECTOR_ENCRYPTION_KEY`. The suite runs as production without that key. | The suite supplies a test-only key, as production does, and restores it afterwards. |
| `server/routes/__tests__/unifiedTasks-governed.pglite.integration.test.ts` | 3 failed of 21, then 21/21 | `90b34d33c` added `stability_studies.project_id` (`migrations/20261005_cmc_core_registers_project.sql`). The suite's schema list did not include that migration. | The migration is applied as written, after the five baseline tables it also indexes. |
| `server/services/ana/__tests__/governed-reason-not-invented.test.ts` | 1 failed of 60, then 60/60 | `881945fe5` moved the 2.3 QOS tool into `cmc-quality-summary-tool.ts`, which registers through `register…Handler` (singular). The scan found modules only by `register…Handlers`. | The scan accepts both forms, and the module is in its must-find list. `mutation-probe.txt`: an invented reason added to that module turns the scan red, naming the line. |
| `server/test/__tests__/test-assembly.routes.test.ts` | 1 failed of 5, then 5/5 | `425d44dd3` admits on the session's tenant alone; before it, a request with no session could name an allowed tenant in a header. The route test still expected the header to admit. | The case now asserts what the gate does: no session plus an allowed header gets 403, and an allowed session gets 200. Against the middleware from before `425d44dd3` it fails (`negative-control-pre-425d44dd3-middleware.txt`). |
| `tests/founder-critical-path-proof.test.ts` | 1 failed of 8, then 8/8 | `5bbc43317` has `logout()` read the server's answer: `post<{ success?: boolean }>(` with the URL on the next line. The test's regex required `post(` immediately followed by the URL. | The regex accepts the type argument and the line break. It still fails when the URL is not `/logout`, or when there is no POST. |

All seven files run together (the six, plus the decision-lineage gate CI
listed): 144/144. `ci:committed-secrets` passes, and gitleaks finds nothing in
the changed files or here.

**Handed on:** two suites test the same route,
`server/test/__tests__/test-assembly.routes.test.ts` and
`server/__tests__/test-assembly.routes.test.ts` (zero duplication). Merge them
in a change of their own.

Each subdirectory holds `red.txt` (the file at `b07608ff3`) and `green.txt`
(after the fix).
