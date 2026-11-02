# 39 client suites crashed on a stale `authService` mock — and were hiding five loose test queries

> **Corrected 2026-11-02.** This README first said the crash was hiding "a second regression"
> in the authoring editor, and it named the wrong commit as the cause. Both were wrong; see
> "What the crash was hiding" and "The cause" below, each marked where it changed. The
> 39-suite repair itself is unaffected. Corrections from the coordinating session
> (`session_01JbQU…`), each verified here before it was accepted.

Found while trying to reproduce coverage-review C-13 (one intermittently failing
suite). The full client batch does not have one flaky file. It had **39
deterministically failing files, 259 failing tests, from a single root cause** —
and CI runs the whole config (`.github/workflows/ci.yml:1343`,
`npx vitest run --config vitest.config.ts` with no path filter), so CI was red.

## The cause

`client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts:24`

```ts
const actor = (): string => { const user = authService.getUser(); return `${user?.organizationId ?? ''}:${user?.id ?? ''}`; };
```

introduced by `ad372567d2` ("Build documents and sections inside the existing editor",
2026-10-17). *(Corrected 2026-11-02: this said `3cae08d23`. `git blame` on the line and
`git log -S"authService.getUser()"` on the file both give `ad372567d2`.)*
It sits on the `DocumentWorkbench` render path, and **113 client suites mock
`@/services/portal/authService` with only `useAuth`**. Every suite that reaches
it dies inside `renderWithHooks`:

```
Error: [vitest] No "authService" export is defined on the
       "@/services/portal/authService" mock.
 ❯ actor      client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts:24:44
 ❯ scopeKey   …:25:64
 ❯ useAuthoringAssemblyBuild …:200:15
 ❯ DocumentWorkbench client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2061:20
```

262 occurrences of that one error across the 39 files.

## Three things checked before calling it a defect

- **Production is unaffected.** `authService` is a real export —
  `export const authService = new AuthService('/api/v1/auth')`. This is stale
  test mocks, not a runtime break.
- **The production code is right, so the fix is not to change it.** `actor()` is
  called from `scopeKey()`, from `begin()`, and from an `isCurrent()` closure
  that runs **asynchronously while an assembly is in flight**, comparing the
  current actor against the one captured when the operation began. It cannot be
  a React hook: its job is to notice the signed-in user changed mid-operation
  and invalidate the work, which stops one user's assembly landing in another's
  editor. Reaching past `useAuth` into the singleton is deliberate here.
- **Not caused by this session's other work.** All 22 suites importing anything
  changed earlier in the session pass, 199/199.

## The fix, and why this shape

Each failing factory gains one inert export:

```ts
authService: { getUser: () => ({ id: 1, organizationId: 1 }) },
```

**Why not `importOriginal` and spread**, which is what vitest's own error
suggests: `AuthService`'s constructor runs `this.loadStoredAuth()` and
`this.setupTokenRefresh()`. Spreading the real module constructs the singleton
and starts a token-refresh timer in 39 jsdom suites — open handles and slower
teardown in exactly the batch whose contention C-13 is about. An inert stub has
no such cost.

`getUser()` returns a stable non-null `{ id, organizationId }` rather than
`null`, because `actor()` builds a cache-scope key from those two fields; a
stable pair gives a stable key. None of these suites switches user mid-test —
that is what `isCurrent()` guards in production, not here.

Only the **39 failing** files are changed, not all 113. The other 74 mock the
same module but never render anything that reaches the hook; editing them would
be churn.

Result: **34 of 39 files go green, and 0 `authService` errors remain.**

## What the crash was hiding

The remaining 5 files fail for a completely different, previously **masked**
reason — the suites never reached these assertions because they crashed first:

| file | failure |
|---|---|
| `authoringReasonForChange.test.tsx` | `Found multiple elements with the role "button" and name /Save/i` |
| `authoringSaveFilingCommit.test.tsx` | same |
| `authoringSectionCheckRecord.test.tsx` | `Unable to find an element by: [data-testid="section-check"]` |
| `documentAuthoringAuditRail.test.tsx` | same family |
| `documentAuthoringEditor.test.tsx` | same family |

**Proven masked, not caused.** Removing the stub from
`authoringReasonForChange.test.tsx` and re-running returns the suite to dying on
`No "authService" export is defined` — it never reaches the Save query at all.
So the duplicate-`Save` and missing-`section-check` failures predate this fix
and were invisible behind the crash.

**Corrected 2026-11-02: these were loose test queries, not a product regression.**
This section first called them "a real regression in the authoring editor's UI" — a
second `Save` button on a governed save. There was no second Save button.

- `Found multiple elements … name /Save/i` matched the governed **Save** button *and*
  **"Check saved sources"** (`editor/SavedAssemblySourcesNotice.tsx:16`), a button
  `3cae08d23` added by design. `/Save/i.test("Check saved sources")` is `true`. The
  `section-check` failures were the same kind of over-broad query.
- At HEAD the five suites pass **34 of 34**: `c24db62ac` and `67d96c060` anchored the
  queries. Evidence: `a25485dae`, `docs/evidence/D4/2026-11-01-editor-masked-regression/`.
- The one genuine failure that investigation found is a different one,
  `savedAssemblySourcesFlow.test.tsx:281` (the draft pane), taken by its owner (L2).

**What was right and what was not.** The proof above stands: the crash *did* hide these
assertions. The error was the next step — reading "the test now fails on X" as "the
product has defect X" without checking what the query matched. A failure message names
what a test looked for, not what is on the screen. That check takes one line, and it was
not run.

## Why C-13 is not what it looked like

C-13 describes one suite failing roughly 1 in 3 full-batch runs under CPU
contention. It did not reproduce:

- `insightsReportsRunWhatTheyName.test.tsx` **passed** in the full client batch,
- passed in three seven-file canvas batches,
- and passed with six busy loops running on four cores.

The batch was not flaky. It was 39 files failing every time. The row stays open
and unchanged rather than being "fixed" by a timeout change, because a test
whose failure cannot be shown is not a test whose timeout should be raised —
that converts a flake into a masked slowdown, which is precisely the mistake
this whole finding is an example of.
