# eCTD: what the agency holds now, as one view (2026-10-22)

Gap 6, work item 1 of `docs/design/VEEVA_GAP_2026-10-22.md`: "Reach the fold through a read route and a current-view tree in EctdCompile." Launch rows **D2** (Submission Center, in the launch catalog) and **D7** (one real sequence: what was filed can be read back). This reaches an engine that already runs on every compile and transmit. It is not a new viewer.

## What already exists

- **The filed-state fold.** `foldManifestRows` (`server/services/ectd/prior-sequence-loader.ts`), behind `loadLatestPriorManifestBySubmission`:
  - folds the stored leaf manifests of a submission's sequences, oldest first;
  - reads only compiles whose sequence was sent or acknowledged, and never a preview or rehearsal compile;
  - a later filing supersedes an earlier one, a `replace` or `delete` takes off file the leaf its `modified-file` names (P-42), and a `delete` drops its leaf;
  - each surviving leaf keeps the sequence that holds it.
  - Compile (`package-from-core.ts`) and transmit read it "as of" the sequence being built, so it answers "what is on file before sequence N". No route returns it, and nothing answers "what is on file now".
- **Its tests**: `prior-sequence-fold.test.ts`, `prior-sequence-transmitted-only.test.ts`, `named-prior-sequence-is-the-filed-state.pglite.test.ts`, `lifecycle-declared-acts.pglite.test.ts`.
- **A second fold over a second store**: `foldFiledState` (`package-sequence-lifecycle.ts:231`), over `metadata.filedSequences`. Work item 3 converges it. It is not touched here.
- **Per-compile views in EctdCompile** (`client/src/concept2cure/v2/surfaces/EctdCompile.tsx`):
  - `LifecycleView`: what one compile does to the filed state;
  - `BackboneView` and the leaf hierarchy: what one package holds;
  - the compilation history.
  - Each is one sequence's view. None shows the application as the agency holds it.
- **Vault "Placed in"** (`vault-where-used.ts`): every leaf that places a Vault version, by submission, sequence and operation. That is per document; this view is per application.
- **IND sequence diff and manifest routes** (`server/routes/ind-lifecycle/sequence.routes.ts`): no client caller, and they mark a section absent from the next sequence as deleted. Work item 4 handles them. They are not used here.
- **The route claim.** `/api/ectd-compile` is claimed by the `ectd-compile` surface (`shared/constants/ui-surface-registry.ts:460`), so a read route under it needs no new claim.
- **Searches run**:
  - client and server for `filed state`, `filed-state`, `filedState`, `current view`, `cumulative` and `on file at the agency`: only the existing fold and LifecycleView;
  - `git log --all --diff-filter=D` on `*umulative*`, `*iledState*`, `*urrentView*` and `*Dossier*`: nothing beyond `DossierNavigator.tsx` (`e5a74a4df`), which the gap doc already names, over a retired store.

## The design

1. **One read, one fold.**
   - The filed-compile query moves into `readFiledManifestRows(pool, org, submission, before | null)`. The as-of read passes the sequence being built; the current view passes no bound. The SQL and its rules are unchanged, and there is still one copy.
   - `loadFiledStateBySubmission` folds every filed sequence with the same `foldManifestRows`.
   - It also lists every sequence of the submission, with its dispatch status and whether a filed compile with a manifest is on record, so the view says which sequences it does not include.
   - A stored manifest that cannot be read throws, as it does for compile: a partial current view is not the current view.
2. **The route.** `GET /api/ectd-compile/:projectIdent/filed-state[?sequenceId=]`:
   - the same prologue as status and history: org (401), project in the org (404), device refusal (422);
   - the spine by the same rule (`spineForRequest`), so the view is of the submission EctdCompile is compiling;
   - it returns `{ submissionId, throughSequence, sequences, leaves }`. Each leaf has its CTD section, file name, title, published path, the sequence that holds it, the act that put it there and its md5;
   - no submission is an honest empty answer; an unreadable fold is 503.
3. **The view.** An "On file at the agency" card in EctdCompile, in its own component, so EctdCompile does not grow:
   - leaves grouped by module and CTD section;
   - each with its title or file, the sequence that holds it and the act;
   - the sequences it folds, and those it does not, with the reason (not sent, or no filed compile on record);
   - "nothing is on file" only when the read succeeded and no sequence was filed; a failed read says so.
4. **AnA** reads nothing new here. Its lifecycle tool already reads the fold through `loadPriorSequenceManifest`.

## Tests (red first)

- **Real PostgreSQL** (`RLS_ENFORCE=on`, `app_service`), through the route:
  - three sequences: 0000 sent, 0001 acknowledged and replacing one leaf, 0002 a preview never sent;
  - the view holds 0000's untouched leaf from 0000 and the replaced leaf from 0001, and nothing from 0002;
  - 0002 is listed as not filed;
  - another organisation's identical application is never read;
  - a project with no submission answers empty, not an error.
- **Client**: the card groups by module and section, names each leaf's sequence and act, lists the sequences not folded, and separates a failed read from an empty one.

## Not in this design

- Per-leaf history and source documents (work item 2): the stored manifest carries no source-document identity.
- Converging `foldFiledState` (work item 3), and the IND diff routes (work item 4).
