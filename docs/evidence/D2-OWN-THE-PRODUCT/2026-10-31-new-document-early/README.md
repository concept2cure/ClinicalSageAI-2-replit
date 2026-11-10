# D2: New document, opened as soon as the editor drew it, said the project had changed, and kept saying it (2026-10-31)

Found by using the editor in Chromium, as RULE 4 asks ("a screen is not done until it was opened in the running app and used").

**What the person saw.** They opened the editor for BX-204 IND and clicked New document, which is the only action its empty state offers. The form said: "The project or filing changed, or your signed-in session changed. Close this form and open New document again before choosing a template." Nothing had changed. Creating refused with the same words until the form was closed and opened again.

## What already exists

- **The form's visit guard** (`client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx`, `useCreationFilingScope`). A form opened for one project, filing, account and session must not submit under another. Its key held the project, the open project, the filing's registry id and filing document id, the actor and the session. Any change to the key started a new visit, and the open form was then "retired".
- **The filing context** (`DocumentWorkbench.tsx`, passed as `filingContext`). It comes from the project read and the filing reads, which land a second or more after the editor draws its New document button.
- **The guard's tests** (`authoringTemplateSearch.test.tsx`). They require a reopen after a filing round trip, a project round trip, an account replacement and a session replacement.

## Cause

Opened before those reads landed, the form's filing was `[null, null]`. When the reads landed it became `['US_IND…', 'doc_…']`. The key changed, so the guard treated the filing as changed and retired the form.

## Fix

A filing value that was known and is now another, or gone, is still a change and still retires the form. A value that was not yet read and now is counts as the same visit learning its filing. The project, the open project, the account and the session are judged exactly as before.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new case "keeps the form when its filing becomes known after it opened, and creates the document" fails before the fix. Its companion, "still requires a reopen when a filing that was known changes to another", passes. |
| `02-live.txt` | Fresh browsers, clicking as soon as the button is drawn. Before the fix, the form was retired whenever the click came before the reads. |
| `03-live-deterministic.txt` | The project and filing reads held back 4 s in Chromium, with New document clicked at once. Before the fix: usable, then retired when the reads land (`uuuRRRRRRR`). After it: usable throughout (`uuuuuuuuuu`). |
| `04-mutations.txt` | Two mutations, each caught. Retiring on any filing change (the old code) fails the new case. Never retiring on a filing change fails three guard cases. |

**Also run.** Every case in the file that exercises the guard passes, 22 of 22. The file's other 14 cases fail on trunk without this change, because they expect a read with exactly two arguments, and reads now carry an abort signal (`c3794c8fef`). They are corrected with the other stale expectations in the next commit.
