# Trunk red: 15 more suites render ConversationThread with no session (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, a subagent of the D2 lead. This sweeps the suites that 316909f5 handed on.

- The red runs were at trunk, between `316909f5` and `86610174`. The three commits between them change only server routes and
  docs.
- The mutation ran at `86610174`.
- The green runs were at `86610174`, and again at `8b01885a` after DT3's client changes landed. Both had the same result.
- Every run was one file at a time, as `timeout 240 npx vitest run <file>`.

All 15 listed suites were red, 119 of 159 cases, with one error between them:

```
Error: useAuth must be used within an AuthProvider
 ❯ useAuth            client/src/services/portal/authService.tsx:1379
 ❯ useDocumentList    client/src/concept2cure/v2/editor/CanvasDocumentList.tsx:124
 ❯ ConversationThread client/src/concept2cure/v2/surfaces/ConversationThread.tsx:1386
```

No suite failed for any other reason. All 15 now pass, 159 of 159. The completeness pass found two more files with no session
mock. Both were already green and were left alone.

**Verdict: test drift, not a product regression.** No product file changed. No assertion changed.

## What already exists

- **`316909f5`** (2026-10-29), `docs/evidence/D2-ONE-ANA/2026-10-29/trunk-red-conversation-thread/`.
  - It made the same repair in six `conversationThread*` suites and set the convention used here: spread the real
    `authService` and override only `useAuth` with a signed-in user.
  - Its README lists these 15 files as unrun, and `conversationArtifactPanel` as red 5 of 8.
  - Its search found no shared auth test helper in `client/`. Each suite mocks the session inline. That search was not
    repeated here.
- **`8b01885a`** removed 316909f5's mock from `conversationThreadAdminFollow` again. DT3 (`7d6f376e`) had mocked the session
  there separately, and the merge kept both mocks.
  - The same thing will not happen to these 15. The remote branch tip, `f915e82ef9`, has no commit since 2026-10-27 that touches
    any of them (GitHub API, `commits?path=`). Each now has exactly one `vi.mock('@/services/portal/authService')`.
- **`cc1607c3a3`** (2026-10-18, "Complete governed authoring access and isolated project recall") is the cause.
  - It added `const { user } = useAuth(); const session = useAuthoringReadSession(user);` to `useDocumentList`.
  - It updated only `conversationThreadCanvas` and `conversationThreadInsertRefusals`.
  - This clone is shallow, so `git log -S 'const { user } = useAuth();'` on `CanvasDocumentList.tsx` stops at grafted root
    `b513b53e`, the merge that brought `cc1607c3a3` to trunk. The commit's patch was read from the GitHub API
    (`commits/cc1607c3a3`).
- **The product.**
  - `useAuth` throws without a provider by contract.
  - `AuthProvider` is mounted at the app root, `client/src/App.jsx:81`.
  - `useDocumentList` has the only `useAuth` call in `CanvasDocumentList.tsx`, at line 124. Its callers are
    `ConversationThread.tsx:1386` and `:1388`, and `ProjectHome.tsx:1465`.
  - `DocumentAuthoring` does not call it.
- **Earlier repairs with the same cause**:
  - `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass2/`, 23 Project home files.
  - `docs/evidence/D6/2026-10-19-stale-authservice-mocks/`.
  - `docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/wording-sweep/`, which named the `conversationArtifactPanel` failures.

## Completeness pass

These searches looked for other suites under `client/` that render the list with no session mock.

1. **Direct importers.** Test files that import `surfaces/ConversationThread`, `surfaces/ProjectHome`,
   `surfaces/DocumentAuthoring` or `editor/CanvasDocumentList`, or that name `useDocumentList`: 105 files.
   - 88 already mock `@/services/portal/authService`, and every one of those mocks defines `useAuth`.
   - None has two such mocks.
   - 17 have no mock: the 15 listed, plus two more.
     - `__tests__/authoringCreationHostRecovery.test.tsx` renders `DocumentAuthoring` and `DocumentCanvas`. It was green,
       38 of 38, and was left alone.
     - `__tests__/trackedChangeDecisions.test.ts` imports two pure functions from `DocumentAuthoring` and renders nothing. It
       was green, 35 of 35, and was left alone.
2. **The lazy path.** Outside direct imports, `ConversationThread` and `ProjectHome` are reached only through `surfaceViews.ts`,
   at lines 299 and 337, under the ids `conversation-thread` and `project-home`.
   - 80 test files name `surfaceViews`, `SurfaceHost`, `ZenShell`, `ShellChrome` or either id and are not in set 1.
   - Of those with no mock and no `AuthProvider`, six name one of the ids. Five use it only as an `onNav` argument or a stash
     key.
   - The sixth, `liveDriveShell.test.tsx`, mounts `V2App` at `conversation-thread` inside `Providers`, which mounts the real
     `AuthProvider` (`liveDriveShell.fixtures.tsx:42`).
   - All seven client test files that mount `V2App` do so inside an `AuthProvider`.
3. **Out of scope.** The three editor suites owned by another agent were not touched: `authoringAnaInsertGate`,
   `authoringAnaMarkdown` and `authoringConversationContext`.

## Results

Paths are under `client/src/concept2cure/v2/`.

| File | Before | Cause | After |
| --- | --- | --- | --- |
| `__tests__/conversationArtifactPanel.test.tsx` | red, 5 of 8 fail | useAuth, no provider | green 8/8 |
| `editor/__tests__/conversationAuthoringOrigin.test.tsx` | red, 8 of 9 | useAuth, no provider | green 9/9 |
| `editor/__tests__/authoringConversationScope.test.tsx` | red, 6 of 8 | useAuth, no provider | green 8/8 |
| `__tests__/anaContinueHosts.test.tsx` | red, 3 of 5 | useAuth, no provider | green 5/5 |
| `__tests__/anaRunControlStrip.test.tsx` | red, 5 of 12 | useAuth, no provider | green 12/12 |
| `__tests__/emptyStateBatchA.test.tsx` | red, 3 of 8 | useAuth, no provider | green 8/8 |
| `__tests__/anaAnswerCaveats.test.tsx` | red, 7 of 7 | useAuth, no provider | green 7/7 |
| `__tests__/composerAttachmentChip.test.tsx` | red, 4 of 8 | useAuth, no provider | green 8/8 |
| `__tests__/composerAttachWorks.test.tsx` | red, 4 of 8 | useAuth, no provider | green 8/8 |
| `__tests__/conversationRailTwins.test.tsx` | red, 32 of 33 | useAuth, no provider | green 33/33 |
| `__tests__/anaInterruptedHosts.test.tsx` | red, 19 of 19 | useAuth, no provider | green 19/19 |
| `__tests__/anaMessageWarnings.test.tsx` | red, 2 of 2 | useAuth, no provider | green 2/2 |
| `__tests__/conversationProjectMismatch.test.tsx` | red, 5 of 5 | useAuth, no provider | green 5/5 |
| `__tests__/anaRunControl.test.tsx` | red, 12 of 12 | useAuth, no provider | green 12/12 |
| `__tests__/anaSkillsInUse.test.tsx` | red, 4 of 15 | useAuth, no provider | green 15/15 |
| `__tests__/authoringCreationHostRecovery.test.tsx` | green 38/38 | none | unchanged |
| `__tests__/trackedChangeDecisions.test.ts` | green 35/35 | none | unchanged |

- In every red file, all the failing cases had the same error and stack. Vitest grouped them into one error block per file.
- In the two composer suites, only the `ConversationThread` cases failed. Their `EctdCoauthor` halves passed throughout.

**Ever green since `cc1607c3a3`? Not shown here.**

- No version of any of the 15 files in local history mocks `services/portal/authService`. That was a static check of every
  commit that touches them.
- All 15 are already present at the graft roots `c04ed02b` and `2b1e7769`, so local history cannot show a green run after
  `cc1607c3a3`.
- 316909f5's `history.txt` ran its six suites from `git archive` source. That historical run was not repeated for these 15.

## What changed

Each of the 15 files gains this block. It goes after the file's existing mocks and before the import group that holds
`ConversationThread`:

```ts
/* useDocumentList reads the signed-in session (editor/CanvasDocumentList.tsx);
   with no AuthProvider mounted, the real useAuth throws before the thread renders. */
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } }),
}));
```

- That is +7 lines per file. The two `editor/__tests__` files get +6, without a trailing blank line, because their mocks have
  none between them. In all, 15 files and 103 insertions.
- The user is the signed-in one from 316909f5 and its sibling suites.
- The fix makes no claim that any assertion depends on the user. The `user: null` probe (316909f5's M2) was not run here.

## Tests

- `red.txt`: the 15 at trunk. 15 of 15 files fail, and 119 of 159 cases fail, all with this error. It also has the two
  completeness-pass files, both green.
- `green.txt`: the 15 with the change. 15 of 15 files pass, 159 of 159 cases, with no unhandled errors.
  - It records the stderr, which shows warnings, not failures:
    - `act(...)` warnings from `ConversationThread` (28) and `EctdCoauthor` (12). The `EctdCoauthor` ones predate this change.
    - `anaInterruptedHosts` prints `[useAnaChat] stream failed`, for the stream failures its cases construct.
- `mutations.txt`:
  - **M1** removes the mock from all 15. They go red again, 119 of 119, with the same error, the same frames and the same
    per-file counts as trunk.
  - The restore was checked with `sha256sum -c`, 15 × OK, and the `git diff` of the 15 is `cmp`-identical to the fix.

## Gates

- **ESLint**, run on each changed file both ways: at HEAD with `git show HEAD:<f> | npx eslint --stdin --stdin-filename <f>`,
  and with the change with `npx eslint <f>`. The result is 0 errors and 0 warnings in both, for all 15.
  - A probe confirmed ESLint really lints these paths. Appending `debugger;` and a `var` to `anaRunControl.test.tsx` on stdin
    gave 2 errors and exit 1.
- **Typecheck** was not run here. The lead has one pending, and the host's memory is shared.

## Not done here

- The `user: null` probe, and historical runs of these 15 from `git archive`.
- The `act(...)` warnings listed above.
- **Other agents' edits.** The shared tree had their uncommitted edits during these runs, for example `Shell.tsx`,
  `registryModel.ts`, `ProjectMarkets.tsx` and `ProjectMdxWorkflow.tsx`.
  - None is on the crash path: `authService.tsx`, `CanvasDocumentList.tsx`, `ConversationThread.tsx` and
    `authoringCurrentRead.ts` are unmodified.
  - M1 reproduced trunk's per-file counts exactly.
