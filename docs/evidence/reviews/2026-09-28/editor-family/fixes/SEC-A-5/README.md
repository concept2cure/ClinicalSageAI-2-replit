# SEC-A-5 / SEC-B-6 / SEC-C-6: unsaved regulated text was offered to the next person on the browser

**Finding:** periodic review 2026-09-28, editor family. The security lens
reported it for all three file groups (medium each), and each verifier
confirmed it. The SEC-A verifier added that the offer also appeared on a
read-only section.

## What was wrong

`RichSectionEditor` keeps unsaved section text in `localStorage`, so a reload
or a crash does not lose it.
- The key was the section alone (`dc::<storageKey>`).
- Sign-out (`clearAuth` → `SecureStorage.clear`) removed only the auth keys.
- So the next person to sign in on the same browser was offered the previous
  person's unsaved text: "A draft cached on this device differs from the saved
  section". The offer names no author and no time. One click and a save put
  that text in the record under the second person's name, with their reason.
- The offer was also shown on a read-only (frozen) section.

## The change

- `client/src/lib/deviceDraftCache.ts` (new) holds the prefix, the key and the
  purge.
  - The key is `dc::<account>::<storageKey>`. The account is
    `authService.getUser()?.id`, or `anonymous` when nobody is signed in.
  - `purgeDeviceDrafts()` removes every `dc::` key, older key shapes included.
- `RichSectionEditor.tsx` keys the cache by account. It never shows the
  restore offer on a read-only canvas, including one frozen while it was open.
- `authService.tsx`: `SecureStorage.clear()`, which runs at logout and at a
  server-ended session, now purges device drafts.
- Three existing tests asserted the old key string. They now use
  `deviceDraftKey`. The workbench test's `authService` mock gained
  `authService.getUser`.

## Shown failing first

`client/src/concept2cure/v2/__tests__/deviceDraftCacheOwner.test.tsx`:
- `red-vitest.txt`: 3 of 4 fail on the unfixed code. Another person is
  offered the draft; a read-only section offers it; sign-out leaves both key
  shapes behind. The control (the author is offered it back) passes. A fifth
  case, the offer going when the section becomes read-only while open, was
  added with the fix.
- `green-vitest.txt`: 31 files and 987 tests, which is every test importing the
  editor or the new module, and the `authService` tests. 985 pass; the 2
  failures are explained in the file and belong to the SEC-B-1/2 change.
- `mutants.txt`: three mutants, each caught.
  - The old key.
  - The offer shown when read-only.
  - No purge at sign-out.

## Not done here

The offer still does not say when the draft was cached. It is now always the
signed-in person's own, which was the harm. Adding the time means storing the
draft with a timestamp, and is a follow-on.
