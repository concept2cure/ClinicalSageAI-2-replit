# Three editor suites that never finished (D2, 2026-10-29)

Row: D2. A subagent of the lead, in the shared tree. The red runs, mutations and green runs were at `5b541627`. Trunk is now `fb562e76`, and none of these files changed between the two: the three suites, `canonicalAuthoringFlow.tsx`, `authoringCurrentRead.ts`, `DocumentWorkbench.tsx`, `CanvasDocumentList.tsx`, `DocumentAuthoring.tsx`, `ConversationThread.tsx` and `authService.tsx` (`git diff --stat 5b541627 fb562e76` on them is empty). Three client files never finished. Each one run alone hit a 240 to 300 s limit (exit 124), printed no test result, and its worker held about 1.7 GB:

- `client/src/concept2cure/v2/__tests__/authoringAnaInsertGate.test.tsx`
- `client/src/concept2cure/v2/__tests__/authoringAnaMarkdown.test.tsx`
- `client/src/concept2cure/v2/__tests__/authoringConversationContext.test.tsx`

The cause was test scaffolding: an `authService` mock that broke the real `getUser()` contract. No product file changed, and the shared helper `canonicalAuthoringFlow.tsx` is unchanged. A separate product defect the investigation found is recorded below and is not fixed here.

## What already exists

- `client/src/services/portal/authService.tsx:1040` `getUser()` returns `this.user`. It is one object, and the reference changes only on an auth event. `captureSessionReadGuard()` (`:616`) gives `sameRevision()`, which is false while `authRevision` has moved or while an adoption is pending (`:619`).
- `client/src/concept2cure/v2/editor/authoringCurrentRead.ts:14` `captureAuthoringSession()`: the read session is current only while `guard.sameRevision() && authService.getUser() === account` (`:17`). It relies on the reference staying the same.
- `authoringCurrentRead.ts:21` `useAuthoringReadSession(user)`: it mints a new `{ actor, key: key + 1, sameRevision }` whenever the old one is not `sameRevision()` (`:25`, `:27`). About fifteen surfaces use it, among them `DocumentWorkbench`, `DocumentCanvas`, `CanvasDocumentList.useDocumentList`, `useScopedDocuments`, `ProjectHome` and `Insights`.
- `authoringCurrentRead.ts` `authoringCurrentReadPath(docId, programId, sections)`: the current read is `/api/authoring/docs/<id>[/sections]?programId=<project>`.
- `server/routes/authoring.router.ts:1490` `GET /docs/:docId` and `:1499` `GET /docs/:docId/sections`: the route is the path, and the project arrives as the query.
- The canonical fixture for this mock is already in 18 suites: `getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 })`, for example `authoringClaimSurvivesRefusedSave.test.tsx:52`, `authoringReasonForChange.test.tsx:48`, `documentAuthoringEditor.test.tsx:36` and `conversationThreadInsertRefusals.test.tsx:45`. `mockReturnValue` evaluates the literal once, so every call returns the same object.
- The canonical path match for the read is in `authoringAnaPane.test.tsx:84-85`, the passing suite on the same helper: `url.split('?')[0] === '/api/authoring/docs/<id>/sections'`.
- This exact cause is already on record. `docs/evidence/D2-WORKFLOW-CONTINUATION/2026-10-23/client-reconciliation/README.md:13`: "The earlier 21 October client run was incomplete after a mock getter returned fresh account objects; the retained fixture repairs match `AuthService.getUser()`'s stable account identity". That repair (`b513b53e`) reached 18 suites and missed these three.

- `docs/evidence/D2-ONE-ANA/2026-10-29/trunk-red-session-mock-sweep/` is the sibling lane. It repaired 15 suites that render `ConversationThread` with no session mock at all, by spreading the real `authService` and overriding `useAuth`. It names these three files as out of its scope. Their failure is different: they do mock `authService`, with the wrong reference.

Searches run: `getUser: () => ({` and `getUser: vi.fn().mockReturnValue` across `client/src`; `useAuthoringReadSession` and `captureAuthoringSession` consumers; `authoringCurrentReadPath`; the sections route in `server/routes`; `docs/` for the 23 October record. The deleted-history search, `git log --all --diff-filter=D` on `*canonicalAuthoringFlow*`, `*authoringCurrentRead*`, `*useAuthoringReadSession*` and the three file names, returned nothing.

Nothing was built.

## How the hang was told apart

- A lone `it` hangs too: `-t 'uses section B'` alone, exit 124 at 150 s, RSS rising to 1.1 GB (`red.txt`).
- It is not a pending promise. `vitest.config.ts` sets `testTimeout: 10000`, and the run above also passed `--testTimeout=20000`. Neither fired, and nothing was reported. The event loop was blocked.
- A temporary instrumented mock counted `getUser` calls and wrote to a scratch file synchronously. It recorded 200,000 calls at 35 s and 400,000 at 65 s, all from inside `DocumentWorkbench`'s render (`mutations.txt`).

## The cause

Two layers, both in the three files' mocks. The first hides the second.

**Layer 1, the hang.** The mock is `authService: { getUser: () => ({ id: 1, organizationId: 1 }), captureSessionReadGuard: <real>, on: <real> }`. Each call returns a new object, so `authService.getUser() === account` (`authoringCurrentRead.ts:17`) is never true. That sets off a loop:

1. `useAuthoringReadSession` (`:25`) mints a new session, with `key + 1`, on every render.
2. `DocumentWorkbench.tsx:1302` `readKey` contains `readSession.key`, so it changes on every render.
3. `loadSections` (`:2145`, deps `[programId, readKey, readSession]` at `:2199`) is a new function on every render.
4. The effect at `:2284-2294` depends on it, runs again, and `loadSections` sets new state: `setSections([])` (`:2154`) and `setSectionsRead({ key: readKey })` (`:2156`).
5. That re-renders, and the cycle starts again at step 1.

Under React Testing Library's `act`, the passive-effect updates are flushed synchronously, so the loop never yields. Every turn calls the `apiRequest` mock, whose recorded calls are why RSS grows. Every read's result is also discarded, because `sameRevision()` is false.

**Layer 2, masked by layer 1.** The workbench reads `/api/authoring/docs/<id>?programId=<project>` and `/sections?programId=<project>`. The three mocks matched the bare paths exactly, so the section read fell through to `{ success: true }` and the editor showed "No sections yet in this document." With layer 1 fixed alone, all 17 tests fail fast on that (`mutations.txt`, M2).

**Commits.** These come from GitHub's path history. This clone is shallow, and `c04ed02b` and `b513b53e` are roots of it.

| Commit | Date | What it did here |
|---|---|---|
| `cc1607c3` "Complete governed authoring access and isolated project recall" | 2026-10-18 | Created `authoringCurrentRead.ts`: the identity check, `useAuthoringReadSession`, and `authoringCurrentReadPath` with `?programId=`. |
| `84b415e2` "Repair 39 client suites crashing on a stale authService mock" | 2026-10-19 | First gave these files `authService: { getUser: () => ({ id: 1, organizationId: 1 }) }`. Its message calls the account "stable", which is true of the value but not the reference. There was no `captureSessionReadGuard`, so the hook could not run yet. |
| `ec57b551` merge | 2026-10-20 | Put these files back on the real `authService`, with only `useAuth` mocked. `getUser()` was stably `null`. |
| **`67d96c06`** "Complete audited launch handoffs and verified recovery safeguards" | 2026-10-20 | **Introduced the hang.** It gave all three files, and about 20 sibling suites, the partial `authService` with the fresh-object `getUser` and the real `captureSessionReadGuard` and `on`. That made the identity-owned session reachable with an account that is never the same object twice. |
| `b513b53e` "Preserve governed workflow reconciliation with October 21 canonical work" | 2026-10-23 | Converted 18 siblings to `vi.fn().mockReturnValue(...)` and recorded the cause. It did not touch these three. On GitHub, their history ends at `67d96c06`. |

The mock lines at each commit are in `history.txt`. `67d96c06` is not in this clone, so it was not executed. The attribution rests on its diff, on the 23 October record of the same failure, and on M1 below, which reproduces the hang from exactly that line. `55673579` and `142c133d` are not involved: neither touches these files or `authoringCurrentRead.ts`.

## What changed

Only the three test files changed, each in two places:

- `getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 })`, the 18-suite canonical fixture, with a three-line comment saying why the reference must stay the same (`authoringConversationContext.test.tsx:17`, `authoringAnaInsertGate.test.tsx:31`, `authoringAnaMarkdown.test.tsx:34`).
- The document and section mocks match the route path, `url.split('?')[0] === …`, as `authoringAnaPane.test.tsx` does (`authoringConversationContext.test.tsx:45-46`, `authoringAnaInsertGate.test.tsx:82-83`, `authoringAnaMarkdown.test.tsx:111-112`).

No test was skipped, disabled or loosened. Every assertion is unchanged.

## Red, green, mutations

| | File | Result |
|---|---|---|
| Red, HEAD | `red.txt` | All three files exit 124 at 240 s, with no test result and RSS 1.7 to 1.9 GB. A lone `it` exits 124 at 150 s under `--testTimeout=20000`. |
| Green | `green.txt` | Context 2/2 in 6 s, insert gate 7/7 in 9 s, markdown 8/8 in 9 s, each under `timeout 240`. ESLint is 0 errors and 0 warnings on each file, now and at HEAD. |
| M1, cause put back | `mutations.txt` | The fixed files with only the `getUser` line reverted: all three exit 124 at 240 s again. |
| M2, other layer | `mutations.txt` | Stable `getUser` but exact-URL mocks (the intermediate state): 17 of 17 fail in 15 to 45 s on the missing section. |
| Instrumented M1 | `mutations.txt` | 400,000 `getUser` calls in 65 s, from inside `DocumentWorkbench`'s render. |

Each variant was copied over the file, run alone, and replaced by the fixed file, which `sha256sum -c` then checked (`restored-ok` after every run). The probes were temporary edits of `authoringConversationContext.test.tsx` and were removed the same way. Afterwards, `git diff` on the three files shows only the fix, and `canonicalAuthoringFlow.tsx` and every product file show no diff.

## A product defect found on the way, not fixed here

The same per-render re-mint happens in the product, without the bad mock, whenever a session adoption is pending. `authService.adoptSession` sets `pendingAdoptionRevision` (`authService.tsx:927`) across its awaited `GET /session`. While that is pending, every guard's `sameRevision()` is false (`:619`), so `useAuthoringReadSession` mints a new session on every render.

A temporary probe used a stable account, the real auth guard, and a real `adoptSession('probe-token')` held pending, then clicked one section in the workbench. React threw "Maximum update depth exceeded". The throw surfaced in `surfaces/filingTarget.tsx:113` (`:157`), which is where its nested-update counter tripped. The control was identical except that `/session` answered 401, so the adoption settled: the same click made 2 section reads and passed (`mutations.txt`).

In the product, the in-app organization switch (`switchOrganization.ts:59`), the SSO hand-off (`Concept2CureLogin.tsx:245`) and signup (`ZenSignup.tsx:147`, `:369`) adopt sessions. Any render of an authoring-read surface during that round trip would loop. This was shown for the workbench; `useDocumentList` has the same session-keyed effect shape. I did not show such a render happening in the live switch flow: `reserveSessionChange()` holds the editors before the adoption and releases them after it.

It is not fixed here for three reasons. It is not the cause of these hangs. It sits in the session-ownership hook that about fifteen surfaces share. And the shared tree is being edited by other lanes. A fix belongs in its own change with this probe as its failing test. One way: keep the minted session while nothing has changed since it was minted (same actor, same revision, still pending), instead of minting again on every render.

## Not done

- `67d96c06`, `84b415e2` and `cc1607c3` were read on GitHub and not executed. They are outside the shallow clone.
- Five other suites still use the fresh-object `getUser`: `organizationSsoLogin`, `ectdCompileDtdEvidence`, `indApplicantIdentity`, `submissionBuilderStudyPlacement` and `submissionBuilderStudyTagging`. None imports any of the authoring-read surfaces by name. They were not run.
- No whole-project typecheck was run, because the lead's pre-push gate runs it. The edits use the same `vi.fn().mockReturnValue(...)` line as the 18 siblings, plus `String.prototype.split`.
