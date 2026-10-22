# D2 / D7: what the agency holds now, as one view (2026-10-22)

Gap 6, work item 1 of `docs/design/VEEVA_GAP_2026-10-22.md`: "Reach the fold through a read route and a current-view tree in EctdCompile." This reaches the filed-state fold that compile and transmit already run. It is not a new viewer. Design: `docs/design/ECTD_FILED_STATE_VIEW_2026-10-22.md`.

## What already exists

- **The filed-state fold.** `foldManifestRows` and `loadLatestPriorManifestBySubmission` (`server/services/ectd/prior-sequence-loader.ts`):
  - they read only sent or acknowledged sequences' compiles, never a preview or rehearsal;
  - a later filing supersedes an earlier one, and `replace`/`delete` take off file the leaf their `modified-file` names (P-42);
  - each leaf keeps the sequence that holds it.
  - Compile and transmit read it as of the sequence being built. No route returned it, and nothing answered "what is on file now".
- **EctdCompile's views are per compile**: `LifecycleView`, the leaf hierarchy, the compilation history.
- **Vault "Placed in"** (`vault-where-used.ts`) is per document.
- **`foldFiledState`** (`package-sequence-lifecycle.ts`) is a second fold over a second store. It is work item 3 and is not touched here.
- **The IND diff routes** are work item 4 and are not used here.
- **`/api/ectd-compile` is claimed** by the `ectd-compile` surface, so no new claim is needed.
- **Searches** (`filed state`, `filedState`, `current view`, `cumulative`, `on file at the agency`; deleted `*umulative*`, `*iledState*`, `*urrentView*`, `*Dossier*`) found nothing else. The design doc lists them.

## The change

- **One read, one fold.**
  - The filed-compile query is now `readFiledManifestRows(pool, org, submission, before | null)`. The as-of read passes the sequence being built; the current view passes none. The SQL is unchanged and there is one copy.
  - `loadFiledStateBySubmission` folds every filed sequence with `foldManifestRows`, and lists each sequence of the submission with its dispatch status and whether a filed compile is on record.
- **`GET /api/ectd-compile/:projectIdent/filed-state[?sequenceId=]`**:
  - the same prologue as status and history (org, project in the org, device refusal), and the same spine (`spineForRequest`);
  - it returns `{ submissionId, throughSequence, sequences, leaves }`;
  - no submission is an honest empty answer; an unreadable fold is 503 `FILED_STATE_UNAVAILABLE`.
- **"On file at the agency"** (`client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`) sits in EctdCompile under the compilation history:
  - the documents on file, grouped by module, each with its section, title and published path, the sequence that holds it and the act that put it there;
  - the sequences folded, and those not, with the reason;
  - a failed read says so and offers a retry; "no submission" and "nothing filed" are distinct.
- **`ectdCompile.test.tsx`'s validator-refusal case** found the first alert on the page; it now finds its own. The card's error state, under that test's catch-all `{}` answer, is correct.

## Evidence

| File | What it shows |
|---|---|
| `01-red-db.txt` | Trunk `b7c70e012`, real PostgreSQL 16, `RLS_ENFORCE=on`, `app_service`: no route (404), 3/3 fail. |
| `02-red-client.txt` | Trunk: EctdCompile shows no view of what is on file, and the card does not exist. |
| `03-green.txt` | The route on real PostgreSQL (3/3). Every reader of the fold (unit and PGlite), the compile route suites and the EctdCompile suites: 32 files, 355 tests. |
| `04-mutation.txt` | Four mutations, each caught: the shared read counts a sequence never sent; the view stops before the newest filed sequence; a failed read shown as an empty dossier; the sequences not folded are not named. |

Also clean: `tsc --noEmit` and the lint warning ratchet.

The database case is:
- 0000 (acknowledged) files two leaves;
- 0001 (sent) replaces one under a new file name;
- 0002 is a preview never sent;
- 0003 is sent, but its only compile is a rehearsal.

The view holds the untouched leaf from 0000 and the replacement from 0001. It lists 0002 and 0003 as not folded. It never reads another organisation's identical application.

## What remains

- **Per-leaf history and source documents** (work item 2): the stored manifest carries no source-document identity, so a leaf cannot yet link to its Vault version.
- **Converge `foldFiledState`** (work item 3), and fix or converge the IND diff routes (work item 4).
- **A sequence that was sent with no filed compile on record** is named, but its leaves cannot be shown: there is no manifest to read them from.
