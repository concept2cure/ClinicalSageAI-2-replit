# D4: the editor keeps its governed reads when the same account is read again (2026-11-12)

**Found** on 2026-11-09, while the demo's run of show was being walked: opening the account panel beside an open
document made the editor read the document again.

## What already exists (RULE 3)

- **`client/src/concept2cure/v2/editor/authoringCurrentRead.ts`.**
  - `captureAuthoringSession()` fences every governed read in the one editor: a reply is shown only while the
    session that asked for it is still the current one.
  - `useAuthoringReadSession()` mints a new session, with a new key, when the actor, the session revision or a
    pending adoption changes. `DocumentWorkbench.tsx` and `DocumentCanvas.tsx` read again on a new key.
  - Both compared the account by object identity: `authService.getUser() === account`.
- **`client/src/services/portal/authService.tsx` `refreshUser()`.** The account panel's read (`AccountPanel.tsx`
  `useAccountRead`). It replaces `this.user` with the object GET `/session` returned and emits `user_updated`.
- **`__tests__/authoringReadSessionAdoption.test.tsx`.** The read session across a session adoption and a bearer
  refresh, on the real `authService`.

Nothing new is added. One private helper, `accessKey`, sits in the same file.

## The defect

A re-read of the same account hands back a new object. The identity comparison read that as another account, so the
read session was retired, a new one was minted, and the editor's document, sections and citations were all read
again. Nothing about what the person may read had changed.

## The change

`accessKey(user)` is the person, the organisation, the roles and the permissions, with the two lists sorted.
`captureAuthoringSession` and the adoption window's `held` compare that key. A change to any of the four still
retires the session, as before. A session adoption and a new sign-in still do, through the revision guard, which is
unchanged.

**Not changed:** `useSourceIntake.ts` keeps its identity check. It fences a write (an import), where retiring on any
account re-read is the stricter side.

## Red, then green

- **Red at HEAD** (`red-at-head.txt`). "an account re-read that returns the same access keeps the session; a changed
  role replaces it" fails: "the same account re-read retired the governed reads".
- **Green.** The suite passes, 5 of 5. Every client suite that uses the read session, the workbench or the canvas
  passes: 69 files, 958 of 958.
- **Lint.** No ESLint warning in either file, as on trunk.

## In the running app

`t85.cjs` opens the Clinical Overview of C2C-101 in the editor, waits for it to settle, then opens **Account** from
the account menu and counts the editor's GETs under `/api/authoring/docs/`. Trunk `a9b5af1873`, 1440 px.

| | Reads when the editor settled | Reads after Account opened | The page |
|---|---|---|---|
| Before (`t85-before.json`) | 3 | **3 more**: the document, its sections and its citations | 105 outline rows |
| After (`t85-after.json`, `after-account-open.png`) | 3 | **0** | 105 outline rows |

No API response at or above 400 in either run.
