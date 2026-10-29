# Trunk red: the ConversationThread suites, `useAuth` outside an AuthProvider (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, a subagent of the D2 lead. Red run at `7d83530f` on `concept2cure-v2`. Green run
at the same commit with this change. `5b541627` (HEAD when this was written) changes nothing on the render path; the eight
suites were re-run there with the change, 70 of 70.

Six client suites were red on trunk, 39 tests, every one with the same error:

| Suite | Failing |
| --- | --- |
| `conversationThreadAdminFollow.test.tsx` | 6 of 6 |
| `conversationThreadShellChat.test.tsx` | 16 of 16 |
| `conversationThreadSignoff.test.tsx` | 4 of 4 |
| `conversationThreadStarters.test.tsx` | 4 of 4 |
| `conversationThreadStopped.test.tsx` | 3 of 4 |
| `conversationThreadUrl.test.tsx` | 6 of 7 |

```
Error: useAuth must be used within an AuthProvider
 ❯ useAuth            client/src/services/portal/authService.tsx:1379
 ❯ useDocumentList    client/src/concept2cure/v2/editor/CanvasDocumentList.tsx:124
 ❯ ConversationThread client/src/concept2cure/v2/surfaces/ConversationThread.tsx:1386
```

The other two `conversationThread*` suites, `conversationThreadCanvas` (21) and `conversationThreadInsertRefusals` (8),
were green. Both already mock the session.

**Verdict: test drift, not a product regression.** No product file changed.

## What already exists

Searches run: `client/` for a shared auth test helper (`*testUtil*`, `*test-util*`, `*renderWith*`, `*mockAuth*`,
`authMock*`, `__mocks__`, `client/src/__tests__/setup.js`, `tests/setup.ts`); every `vi.mock('@/services/portal/authService'`
in `client/`; every `<AuthProvider` outside tests; `docs/evidence` for this error.

- **No shared helper exists.** Each suite mocks the session inline, in the file. That is the convention two earlier repairs
  followed:
  - `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass2/`: 23 Project home files with the same `useDocumentList` cause, each
    given `vi.mock('@/services/portal/authService', async original => ({ ...await original(), useAuth: () => ({ user: null }) }))`.
    The same line is in `filingPathNoDeadEnds`, `projectHomeStages`, `projectHomeSettingsHonesty` and
    `conversationFilesAdopt`.
  - `docs/evidence/D6/2026-10-19-stale-authservice-mocks/` (`84b415e24e`): 39 suites whose partial mock lacked `authService`.
- **The sibling ConversationThread suites** (`conversationThreadCanvas`, `conversationThreadInsertRefusals`) mock
  `useAuth` with a signed-in user, `{ displayName: 'Test Author', email: 'author@test.co' }`, and stub `authService`.
- **The product.**
  - `useAuth` throws without a provider by contract.
  - `useAuthUser` (`authService.tsx`, beside it) returns null instead. It is documented as being for surfaces that only
    display identity, and "Authorization never reads this".
  - `AuthProvider` is mounted at the app root (`client/src/App.jsx:81`) and in `client/src/concept2cure/router/ZenRouter.tsx:188`.
- **`useDocumentList`** (`editor/CanvasDocumentList.tsx`) reads the list at a URL that names the conversation or the project.
  It uses the user only to key the read to the session (`useAuthoringReadSession`: actor `organizationId:id`, plus
  `authService.captureSessionReadGuard`), so a read started for one user is not shown to another.
- **Already named.** `docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/wording-sweep/README.md` attributes five failures in
  `conversationArtifactPanel.test.tsx` to the same line and the same commit.

## Root cause

**`cc1607c3a3`**, 2026-10-18, "Complete governed authoring access and isolated project recall". It added
`const { user } = useAuth(); const session = useAuthoringReadSession(user);` to `useDocumentList`, binding the list read to
the current actor.

- It updated the two ConversationThread suites that already mocked the session. Their mocks now spread the real module, so
  the session guard is present.
- It did not add a mock to the six that render `ConversationThread` with no provider. `ConversationThread` has called
  `useDocumentList` unconditionally since `e76ae571c2` (2026-10-08).

**How it reached trunk.** `cc1607c3a3` was on a side lane. It reached the trunk history in merge `b513b53e` (2026-10-23 15:04
UTC; parents `70a3db9988` from that lane and `30afd3bd17` from trunk). `e87c0159` (16:02 UTC) is the first local commit that
also contains the other trunk lane (`c04ed02b`).

This clone is shallow: its history starts at 12 grafted roots from 2026-10-22/23, `b513b53e` among them. So `git log -S` on
either file stops at a root. The commit before the boundary, its parents and the ancestry above come from the GitHub API
(`commits?path=`, `commits/:sha`, `compare`).

**Ever green since? No.** `history.txt` runs the same eight suites on source exported with `git archive` into a scratch
directory; the shared tree was not touched:

| Source | Six suites |
| --- | --- |
| `c04ed02b`: descends from `30afd3bd17`, the merge's trunk parent, without `cc1607c3a3` | 66 of 66 pass |
| `b513b53e`: the merge | 35 fail, all this error |
| `142c133d`: parent of both F3 commits | 39 fail, all this error |
| `7d83530f` (`red.txt`) | 39 fail, all this error |

A static scan of all 1,028 local commits found the same thing. 667 have `useAuth()` in `useDocumentList`, and in none of them
does any of the six files mock `@/services/portal/authService`.

**The two newest F3 commits did not cause it.**

- `55673579` adds two lines to `CanvasDocumentList.tsx`: the `filingDocumentId` field and its mapping. Neither is on the hook.
- `96ce3798` touches neither file, `ConversationThread.tsx` nor `authService.tsx`.
- At `142c133d`, before both, the same 39 fail with the same stack.

## Why the fix is in the tests

The product is right to throw.

- `ConversationThread` is reached only signed in, under the root `AuthProvider`.
- `useDocumentList` uses the user to scope the read to the session. That is a correctness concern, which is what `useAuth`
  is for. `useAuthUser` is explicitly for display-only identity.
- Degrading to a null user would let the hook run, unscoped, in a tree that has no session, and hide a missing provider.

## What changed

The six suites each gain the same mock, before `ConversationThread` is imported:

```ts
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } }),
}));
```

- **The real module is spread**, as in the precedent. `useDocumentList` needs the real `authService.captureSessionReadGuard`,
  and `useAuthoringReadSession` needs the real `authService.on`. These suites already loaded the real module, so this
  constructs nothing that was not already constructed.
- **The user is a signed-in one, not `null`.** The thread is only reached signed in, and an `id` and `organizationId` make
  the read's session key a real one. The names match the sibling suites.
- **The user is not load-bearing for any assertion, and is not claimed to be.** Mutation M2 (`user: null`) is also green.
  - Four suites (AdminFollow, ShellChat, Stopped, Url) stub `fetch` to 503, so the list is in its error state.
  - Signoff and Starters open a new conversation with no thread id and no project, so the hook has no URL and reads nothing.
  - No assertion is about whose documents are listed. The list route names the conversation, not the person.
- **No assertion was changed, removed or weakened.** The diff is +10 lines per file: a comment and the mock.

## Tests

- `red.txt`: the eight `conversationThread*` suites at `7d83530f`. 6 files fail, 39 tests, 39 of 39 with this error; 31 pass.
- `green.txt`: the same eight with the change. 8 of 8 files, 70 of 70 tests. No unhandled errors.
  - No assertion that the crash had hidden failed once it was gone.
  - Signoff, Starters and Url print React `act(...)` warnings: the list read settles after render. They are warnings, not
    failures, and were left as they are.
- `mutations.txt`:
  - **M1** removes the mock from all six. RED again: 39 of 39, the same error and stack.
  - **M2** is the `user: null` probe above: GREEN, 41 of 41.
  - After each, the six files were restored from byte copies. `sha256sum -c` printed 6 × OK, and their `git diff` is
    `cmp`-identical to the fix.
- `history.txt`: the historical runs in the table above.

## Gates

- **ESLint**, each changed file against `git show HEAD:<f> | npx eslint --stdin`: 0 errors and 0 warnings at HEAD, and the
  same with the change, for all six.
- **Typecheck.** `tsc --noEmit` with a scratch config that extends `tsconfig.json` and lists only the six files, so it checks
  them and everything they import. It found 0 errors in the six. Its 4 diagnostics are in files not touched here
  (`styles.module.css` ×3, `import.meta.env` ×1) and come from the scratch config leaving out the repo's ambient
  declarations.

## Not done here

- **`conversationArtifactPanel.test.tsx` is still red** from the same cause: 5 of 8 at `5b541627`, run read-only. It is
  outside this lane's scope, so it is not fixed here.
- **Other suites may be affected.** These import `ConversationThread`, `CanvasDocumentList` or `useDocumentList` and do not
  mock the session. They were not run, since this lane runs only its own files. Some may not render the hook at all:
  `editor/__tests__/conversationAuthoringOrigin`, `editor/__tests__/authoringConversationScope`, `anaContinueHosts`,
  `anaRunControlStrip`, `emptyStateBatchA`, `anaAnswerCaveats`, `composerAttachmentChip`, `composerAttachWorks`,
  `conversationRailTwins`, `anaInterruptedHosts`, `anaMessageWarnings`, `conversationProjectMismatch`, `anaRunControl`,
  `anaSkillsInUse`.
- **The `act(...)` warnings** above.

## After the merge with trunk

`7d6f376e` (DT3, another lane, pushed first) mocked the session in `conversationThreadAdminFollow.test.tsx` itself. The merge kept both mocks of `@/services/portal/authService`, so the mock this change added there is removed. AdminFollow passes 8/8 on DT3's mock. The other five suites keep this change's mock.
