# A stale assertion in the Submission Center's new-submission test (F1, 2026-11-02)

**The failure.** `client/src/concept2cure/v2/__tests__/submissionCenterNewFromProject.test.tsx`, "each region option
carries the server's statement for the chosen application type, and follows a change of type", failed on trunk with no
one's uncommitted work. The coordinating session (`01JbQU…`) reported it, and filing types ran it twice.

**Root cause.**
- `c3794c8fe` (2026-10-30, "recover stalled existing screen reads") made the screen's live read
  (`client/src/concept2cure/v2/dataConnect.tsx`, `useLiveData`) call `apiRequest('GET', path, undefined, headers,
  readSignal)`. It passes the headers and an `AbortSignal` so that a stalled read can be cancelled. That change was
  deliberate.
- The screen still reads the server's statement for the newly chosen type. The 7th call is exactly
  `GET /api/submissions/market-support?applicationType=maa`, and the test's own check of the `eu` option's words (line
  255) passes. Only the two-argument `toHaveBeenCalledWith` at line 256 failed, on the added arguments. There was no
  regression.

**The fix, test-only.** Line 256 now asserts the read's method and path (`mock.calls.some(...)`), with a comment naming
`c3794c8fe`. It does not pin every transport argument, so the next transport change does not break it again. No screen,
`dataConnect.tsx` or server file changed.

**Proof.**

| What | Result | File |
|---|---|---|
| Red, on a clean export of trunk `b4bd7a877` | 1 failed, 16 passed | `red-on-trunk-b4bd7a877.txt` |
| Green, after the fix | 17 passed | `green-after-fix.txt` |
| Mutation 1: the screen stops following a change of type (`NewSubmissionForm.tsx`, `useMarketSupport(appType ? 'nda' : null)`) | fails on the `eu` option's words | `mutation-1-screen-ignores-type-change.txt` |
| Mutation 2: the assertion expects a path the screen never reads | fails on the new assertion | `mutation-2-assertion-wrong-path.txt` |

Both mutated files were restored, and the screen was compared byte for byte with trunk.

**Not done here.** The coordinator runs a trunk-wide sweep for other tests that still pin the old two-argument call.
