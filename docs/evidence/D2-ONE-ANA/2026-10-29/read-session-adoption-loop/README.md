# The authoring read session no longer loops during a pending session adoption (D2, 2026-10-29)

Row: D2. A subagent of the lead, in the shared tree. Head is `b6f1e21a`. `authoringCurrentRead.ts` is byte-identical there, at `2168fd56` and since `b513b53e`. This is the product defect recorded under "A product defect found on the way" in `../editor-suites-hang/README.md`. It is fixed here, in the hook, with that README's probe as the failing test.

## What already exists

- `client/src/concept2cure/v2/editor/authoringCurrentRead.ts:14` `captureAuthoringSession()`. A read is current while `guard.sameRevision() && authService.getUser() === account`. The account is held by reference.
- `authoringCurrentRead.ts:21` (head) `useAuthoringReadSession(user)`. It returns `{ actor, key, sameRevision }`, with `actor = "<organizationId>:<userId>"`. Before this change it minted a new session, with `key + 1`, on any render where the held one was not `sameRevision()` (`:25-28`). It re-renders on `login`, `logout`, `session_expired`, `user_updated` and `token_refresh` (`:30-34`). Its contract is that a bearer refresh keeps the session, and a new revision or a different account replaces it.
- `client/src/services/portal/authService.tsx:616` `captureSessionReadGuard()`. `sameRevision()` is `revision === authRevision && pendingAdoptionRevision === null` (`:619`).
- `authService.tsx:925` `adoptSession()`. It bumps `authRevision` and sets `pendingAdoptionRevision` (`:926-927`) before it awaits `GET /session`. Success goes through `setAuth`, which bumps the revision again, clears the pending flag and changes the user, then emits `login` (`:943-944`). Refusal only clears the flag in `finally` (`:947`) and emits nothing.
- How the window is meant to look to a reader. The existing intent is fencing: `:594` "A session probe must settle before the previous account can be refreshed". `refreshUser` (`:1068`), `refreshSessionPolicy` (`:906`) and `refreshToken` (`:828`) refuse while the flag is set, which is pinned by `services/portal/__tests__/authService-adopt-session.test.ts` "refuses account and policy refreshes begun while adoption is awaiting verification". Every consumer already turns a not-current session into a held state, never into the previous account's data. For example `DocumentWorkbench.tsx:1306` gives `sectionsCurrent = … && readSession.sameRevision()` and `:1310` gives `sections = sectionsCurrent ? storedSections : []`. So the policy followed here is that reads pause and the surface shows its held state. No new policy was invented.
- `client/src/lib/sessionChangeGuard.ts` `reserveSessionChange()` holds open editors across the organization switch (`switchOrganization.ts:71`). It holds writes. It does not touch the read session.
- adoptSession callers: the organization switch (`switchOrganization.ts:59`), the SSO hand-off (`Concept2CureLogin.tsx:245`) and signup (`ZenSignup.tsx:147`, `:369`). In the switch, `rotated` is set before the adoption. So every failure after the adoption starts ends the session through `endSession`, which emits `session_expired`, unless another session already owns the bearer.
- The 15 callers of `useAuthoringReadSession`:
  - `DocumentWorkbench.tsx:1301` and `DocumentCanvas.tsx:186` key their reads on `readKey`;
  - `CanvasDocumentList.tsx:125`, `useScopedDocuments.ts:20`, `programSummary.ts:57`, `mdx/hooks/useDossier.ts:200`, `ProjectBiotechPlan.tsx:105` and `AuthoringCreateExport.tsx:163` key reads or query keys on `actor` and `key`;
  - `useAgencyResponseEditor.ts:31`, `AgencyResponses.tsx:368`, `Insights.tsx:1591` and `ProjectHome.tsx:1478` scope or remount (`key={session.key}`) on it;
  - `company-documents/companySession.ts:12` derives the company session from it;
  - `useSourceAssemblyTarget.ts:147` and `useSourceIntake.ts:145` call it only to re-render on auth events.

  All of them gate on `sameRevision()`.
- Tests: no suite tested the hook directly. Its guarantees are pinned through the caller suites listed in `callers.txt`.

Searches run: `useAuthoringReadSession`, `captureAuthoringSession`, `authoringCurrentRead` and `readSession`/`sameRevision` across `client/src` (code and `__tests__`); `adoptSession`, `pendingAdoptionRevision`, `reserveSessionChange`/`releaseSessionChange`. `git log --all --diff-filter=D` on `*authoringCurrentRead*`, `*ReadSession*`, `*readSession*`, `*adoptSession*`, `*adoption*`, `*Adoption*` and `*sessionChangeGuard*` returned nothing.

## The cause

`authoringCurrentRead.ts:25` (head) minted whenever the held session was not `sameRevision()`. During a pending adoption no session is `sameRevision()`, the new one included, so every render minted another with `key + 1`. `DocumentWorkbench.tsx:1302` puts `readSession.key` into `readKey`. `loadSections` (`:2145`, deps `:2199`) then changes on every render, and the effect at `:2284-2294` runs it again. It sets state at `:2153-2156`, which renders, which mints, and so on. React stops it with "Maximum update depth exceeded", which surfaced at `surfaces/filingTarget.tsx:113` (`:157`).

## What changed

Only `client/src/concept2cure/v2/editor/authoringCurrentRead.ts`. `authService.tsx` is unchanged.

- `mintAuthoringReadSession` (`:25-31`). A guard captured with no adoption pending is current at capture, and gives the session it always did (`:27`). A guard captured during a pending adoption gives a window session whose `sameRevision` is always false (`:29`). It also gives `held()`, which stays true while an adoption is still pending and `getUser()` is still the same account object (`:30`).
- `useAuthoringReadSession` (`:40-41`) keeps the held session while it is current or `held()`. Otherwise it mints. The returned object is the same reference across renders that mint nothing, as before.

What this does:

- **Start of the window.** The first render inside it mints one window session. Before this change the same render also minted. That is one re-read, and it is fenced.
- **During the window.** That session and its key are kept. No read from before or during the window is current, so the old account's data is withheld and the surface shows its held state. No write is gated as current. The new bearer is stored only by `setAuth`, after the probe.
- **The adoption succeeds.** `login` re-renders. The account and the revision have changed, so exactly one session is minted, for the adopted account.
- **The adoption is refused.** No event fires. The window session stays not current, even though authService's own guard turns valid again at that point. The next render mints exactly one session for the unchanged account, so a read begun in the window is never shown. In the org switch, a refusal ends the session and `session_expired` re-renders.
- **Overlapping adoptions.** One window session is kept while adoptions follow each other with the flag set.

## Red, green, mutations

| | File | Result |
|---|---|---|
| Red, head hook | `red.txt` | 3 of 4 fail. The window mints a key per render (`[2, 3, …]`, 25 keys for 25 renders), the refused case moves the key per render, and one click in the workbench throws "Maximum update depth exceeded" at `filingTarget.tsx:113`. The bearer-refresh test passes, as it should. |
| Green | `green.txt` | 4 of 4 in 6 s. ESLint gives no output on both files, now and on the hook at head. A scoped `tsc` shows no errors in either file. |
| M0, head hook | `mutations.txt` | Same as red. |
| M1, per-render minting put back | `mutations.txt` | Only `|| owned.held()` removed. The same 3 tests re-red, including the update-depth error. |
| M2, window session made current after a refusal | `mutations.txt` | Only `sameRevision: () => false` changed to `guard.sameRevision`. Exactly the refused-adoption test reds, at `:104`, `held.sameRevision()` true. |

After each variant the fixed file was copied back and checked with `sha256sum -c`. `git diff` on the hook shows only the fix.

The new test is `client/src/concept2cure/v2/editor/__tests__/authoringReadSessionAdoption.test.tsx`. It uses the real `authService` throughout: a stable account through `setToken`, the real guard, and a real `adoptSession` whose `GET /session` the test holds and then answers. `useAuth` returns `authService.getUser()`, as in `workbenchDocumentAccess.test.tsx`.
- Three hook tests: the window, the refused adoption, and the existing guarantees (a bearer refresh keeps the session; a new sign-in of the same account replaces it).
- One workbench test. During the window it checks: at most one section read, no section rows, no editor mounted, no "Saved section" text, and "Loading sections…". After the adoption it checks: exactly one more section read, the adopted account's sections shown, and no non-GET call other than realtime-collab presence.

## Caller suites

`callers.txt`. 50 suites, each run alone under `timeout 240`:
- 49 pass. These include the suites the lead named: documentAuthoringDeepLink, authoringAnaMarkdown, authoringConversationContext, authoringAnaInsertGate, sourceIntakeOwnership and the eight conversationThread* suites. They also include every suite of the 15 callers that could be found, and the editor suites that call `adoptSession` with surfaces mounted.
- `projectFilesAssemblyFlow.test.tsx` fails 7 of 9 at head too, with the same message (`:106`, the "Working document" chooser has 1 option, not 3). It is not caused by this change.

## Not done

- No authService event marks a refused adoption. Outside the org switch, a surface rendered during a refused adoption keeps its held state until its next render. It is fenced, not stale. Adding an event would change `authService.tsx` for every listener, so it was left alone.
- Realtime-collab presence (`POST /api/realtime-collab/rooms`, `PUT …/awareness`) is sent during the window, as the still-signed-in previous account, from the unmocked `AuthoringCollab`. It is not gated by the read session and it is not a governed write. It is recorded here and not changed.
- Callers that pass `useAuth().user` can see the actor change one render after `authService.getUser()` does. On a successful adoption that can mean two mints rather than one. That is bounded, and it predates this change.
- No whole-project typecheck was run, because the lead's pre-push gate runs it. `projectFilesAssemblyFlow` was not investigated.
