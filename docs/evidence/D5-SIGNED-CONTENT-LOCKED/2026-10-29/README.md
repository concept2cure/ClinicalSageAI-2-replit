# D5: signed content is not edited in place, and a translation's approval binds its source

Row **D5**, electronic signatures. 2026-10-29. This completes two founder decisions taken under the founder's delegation on 2026-10-29. They were numbered P-56 and P-57 when this work began; `docs/LAUNCH_DEFINITION_OF_DONE.md` now numbers them:

- **P-63, signed content is not edited in place.** An approved or effective label, an approved translation and an accepted hazard refuse edits to the fields their signature binds. A change is a new version or a reopening, signed in its turn. "Changed since it was signed" stays as the detector for records signed before this rule. The basis is 21 CFR 11.10(e) and 11.70, 21 CFR 820.40 and ISO 13485 §4.2.4.
- **P-64, a translation's approval binds the source it translates.** The `labeling-translation` recipe moves to v2, which binds the source document's version and content digest as well as the translation.

It builds on two earlier changes:

- 84aada8f7, the content binders. Its README is `../../D5-CONTENT-DIGEST-BINDERS/2026-10-29/README.md`.
- 981e88c36, the screens. Its README is `../../D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/README.md`.

Both listed "detected, not refused" and "a translation's source version is not bound" as not done.

This change **completes** the content binders' write side and **fixes** the write paths that could change signed content. It **reaches** the existing withdrawal and supersession paths from the refusal. For an accepted hazard it **completes** the lifecycle with the one act it lacked, a signed reopen.

## What already exists

### Searches run

- **Every write to the five tables.** Searched for `UPDATE`, `INSERT INTO` and `DELETE FROM` on `labeling_documents`, `labeling_translations`, `labeling_symbols`, `risk_items` and `risk_controls`, across `server/`, `shared/` and `scripts/`. This found:
  - the routes;
  - AnA's `add_risk_control`, `add_labeling_translation` and `add_labeling_symbol` (`server/services/ana/AnaToolExecutor.ts:8644`, `:15156`, `:15202` at HEAD);
  - the GA demo seeds, which run on laptops only;
  - the sign-ceremony selftest's fixtures.
- **Existing locks and remedies.** Searched for `LABELING_DOCUMENT_CONTROLLED`, `TRANSLATION_APPROVED_LOCKED`, `withdrawApproval`, `SUPERSEDE_ACT_MEANINGS`, `editsBesides`, `RISK_ALREADY_ACCEPTED`, `refuseUnsignedAcceptability`.
- **An existing reopen.** Searched for `reopen` across `server/` and `client/src`, in `mdx-risk*`, `mdx-engineering*`, `Risk*`, `server/routes/c2c/actions.ts` and `server/services`.
- **Field lists.** Searched for `attested`, `field list`, `RECIPE` and `recipe` in `server/services/part11`.
- **Deleted files.** `git log --all --diff-filter=D --name-only`, filtered for `reopen`, `signed-content`, `content-lock`, `locked`, `risk-accept` and `acceptance`. Nothing matched.
- **Earlier attempts.** `git log --all -S` on `SIGNED_CONTENT_LOCKED`, `labeling-translation/v2` and `reopen-residual`. Nothing matched.

### What it found

| Piece | Path (HEAD d56be445f) | What it did | What it did not do |
|---|---|---|---|
| The three content binders | `server/services/part11/governed-target-binders.ts` (labeling-document/v1, labeling-translation/v1, risk-residual-acceptance/v1) | Digest exactly the attested fields, after the act's write. | They exposed no list of those fields: each recipe was an object literal. Nothing else could read what a signature binds. The translation recipe did not bind its source. |
| The read | `server/services/part11/signed-content-state.ts` `readSignedContentStates` | `matches`, `changed`, `unverified`, `withdrawn`, `unsigned`, `unavailable`. | Re-derived every signature by the binder's current recipe. A move to a v2 recipe would have read every v1 approval as `changed`. |
| The label PATCH | `server/routes/mdx-labeling.ts:256` | A literal `status NOT IN ('approved', 'effective', 'superseded')` guard. Answered 409 `LABELING_DOCUMENT_CONTROLLED` (`mdx-labeling-approvals.ts:348`). | It refused *every* field, the project included: wider than the signature. |
| The translation PATCH | `server/routes/mdx-labeling.ts:381` | A literal `status <> 'approved'` guard. Answered 409 `TRANSLATION_APPROVED_LOCKED` (`:480`). | Every field it can set is attested, so this was already exact. Its refusal did not read the recipe. |
| Symbols | `POST /labeling/:id/symbols` (`:442`), `DELETE /labeling/symbols/:symId` (`:467`), AnA `add_labeling_symbol` | Write the row. | **No status check.** A symbol could be added to or removed from an approved, effective or superseded label. |
| The hazard PATCH | `server/routes/mdx-risk-management.ts:391` | Refuses `acceptable: true` without a signature (428). Signs `status: 'accepted'`. | **No lock.** Every attested field was editable after acceptance. A plain `status` or `acceptable: false` took the acceptance off, unsigned. |
| Controls | `POST /risk-items/:id/controls` (`:490`), `PATCH /risk-controls/:controlId` (`:531`), AnA `add_risk_control` | Write the row. | **No acceptance check.** |
| The labeling remedies | `withdrawApproval` (`mdx-labeling-approvals.ts:287`); supersession through `signDocumentStatus` (`:153`) | A move back to draft or review, with a reason and a `transition` ledger row, as a QMS controlled revision. Supersession is signed, as the QMS retirement. | Nothing to add: the refusal now names these as the way to change a signed label. |
| A hazard reopen | None | — | No route reopened an accepted residual risk. Two things share the name, and neither is one:<br>• `POST /api/c2c/actions/reopen` (`server/routes/c2c/actions.ts:842`) is a ledger verb. It writes a low-risk ledger row, with no signature, and changes no `risk_items` row.<br>• `server/services/translation/hybrid-workflow.ts` `reopen` moves a segment of the hybrid translation workflow, a different table. |
| The client facet | `client/src/concept2cure/v2/SignedContentState.tsx` | The one client reading of `signedContent`. | It did not know a `source-changed` state. A state it cannot read is shown as `unavailable`. |

So the refusal is **completed** on the existing guards. The child-row writes are **fixed**. The reopen is the one act **added**, because none existed. The narrowest form was used: one route, through the existing ceremony `signGovernedAct`, which is unchanged.

## What changed

| File | Change |
|---|---|
| `server/services/part11/governed-target-binders.ts` | Each recipe's attested fields are now a list (`RecipeAttestation`: `LABELING_DOCUMENT_ATTESTATION`, `LABELING_TRANSLATION_ATTESTATION`, its v1, `RISK_RESIDUAL_ACCEPTANCE_ATTESTATION`). Each binder builds its content from that list, keyed and valued as before, so the v1 bytes are unchanged; the keep-green recipe pins prove it. The translation recipe is **v2**: v1's fields and `source: { version, contentDigest }`, the source document's version and its labeling-document/v1 digest. A source that cannot be bound refuses the approval. `ContentBinder` takes `BinderOptions`: `recipe`, to derive a recorded recipe, and `asOfSource`, to derive as of the recorded source. A recipe the binder does not derive falls back; it never yields another recipe's digest. Each D5 binding records `bindingRecipe`, and v2 records `boundSource`, on the manifest. |
| `server/services/part11/signature-persistence.ts` | `GovernedBinding.manifest`, appended after `bindingNote`. A binding without it leaves the manifest's bytes as before. `deriveGovernedTargetBinding` passes `options` to the binder. |
| `server/services/part11/signed-content-state.ts` | Re-derives each signature by the recipe it recorded: `bindingRecipe`, or, for a signature from before that member, the `(recipe …)` tag in its `bindingNote`. New state `source-changed` (below). |
| `server/services/part11/signed-content-lock.ts` (new) | **The one refusal.** `lockedFieldsOf` and `lockedFieldsIn` read the recipe's list, plus the label's `effectiveDate` (below). `signedContentRefusal` answers 409 `SIGNED_CONTENT_LOCKED` with what is bound, the way to change it, and "Nothing was saved." It also holds the guarded child-row writes the routes and AnA share: `insertLabelingSymbol`, `deleteLabelingSymbol` and `insertRiskControl`. |
| `server/routes/mdx-labeling.ts` | Label PATCH: guarded only when the patch names a bound field or a status (`documentEditWhere`). The project stays editable. The symbol POST and DELETE go through the guarded writes. The translation refusal reads the recipe. |
| `server/routes/mdx-labeling-approvals.ts` | `documentEditWhere`. Both refusals go through `signedContentRefusal`. `LABELING_DOCUMENT_CONTROLLED` stays for one case only: a move out of a signed status sent with an unbound field, which is sent on its own, with a reason. |
| `server/routes/mdx-risk-acceptance-lock.ts` (new) | `hazardEditGuard` and `hazardEditWhere`; `refuseAcceptedHazardEdit`; the control refusals; and the **signed reopen**. |
| `server/routes/mdx-risk-management.ts` | Hazard PATCH guarded. The control POST goes through `insertRiskControl`. The control PATCH is guarded by its hazard (a share-locked `EXISTS`). `POST /risk-items/:id/reopen` is mounted. The acceptance itself is unchanged. |
| `server/services/ana/AnaToolExecutor.ts` | `add_labeling_symbol` and `add_risk_control` go through the same guarded writes, which also replaces their own tenant check and INSERT. The duplicate SQL is gone, and they answer the refusal with its code. |
| `client/src/concept2cure/v2/SignedContentState.tsx` | `source-changed`: "Source changed since it was signed". Tone err, with the warning icon. The server's reason is shown. It counts as a signature on record. |
| `scripts/ci/sql-interpolation-baseline.json` | Two lines lowered: `"server/routes/mdx-labeling.ts": 7` → `6` and `"server/routes/mdx-risk-management.ts": 8` → `7`. The guarded edits put their WHERE in an array of fixed fragments, as the list read's filters already do, so one template interpolation fewer each. No value is interpolated. |

No migration. `scripts/db/migration-set.mjs` is unchanged. `binding_basis` is free text, and the basis name is unchanged: v2 is told apart by its recorded recipe.

## What each signature binds, and is now refused

**Refused** means 409 `SIGNED_CONTENT_LOCKED`, nothing saved, `details.fields` or `details.child` naming what was touched. The refusal reads the recipe's list (`lockedFieldsOf`). `signed-content-lock.test.ts` pins both directions:

- every listed field moves its digest;
- the refusal is exactly the list.

### Labeling document, while approved, effective or superseded

| API field (column) | Refused | Why |
|---|---|---|
| `deviceName` (`device_name`), `docKind`, `version`, `language`, `region`, `udiDi`, `expiresAt` | Yes | In labeling-document/v1. |
| `artifactId`, the label text | Yes | Its content's sha256 is in the digest. |
| Symbols: add (`POST /labeling/:id/symbols`, AnA `add_labeling_symbol`), remove (`DELETE /labeling/symbols/:symId`) | Yes, `child: labeling_symbols` | Each symbol is in the digest. There is no symbol PATCH. |
| `effectiveDate` | Yes | Not in the digest. The move to effective writes it and records it on its signature's manifest (`act.effectiveDate`), so it is the signed act's own field (`actFields`). Editing it on an approved label was refused before too. |
| `programId` | **No, editable** | It places the label in a project; it is not what the label says. It was refused before this change, which was wider than the signature. |
| `status` | Through the existing moves | Back to draft or review is the withdrawal, with a reason. To superseded is signed. A status sent with other fields is refused, 409 `LABELING_DOCUMENT_CONTROLLED`. |

To change one, issue a new version and supersede this one, or withdraw the approval (back to draft or review, with a reason), then sign it again. The refusal says so.

### Labeling translation, while approved

| API field | Refused | Why |
|---|---|---|
| `language`, `translator`, `translationMethod`, `backTranslationVerified` | Yes | In both v1 and v2. |
| `artifactId`, the translated text | Yes | Its content's sha256 is in the digest. |
| The source document (v2) | Not on the translation | The source is the document's own record, held by the document's lock while it is signed. A source that moves on while it is a draft or in review is what `source-changed` reports. |

Every field a translation PATCH can set is attested, so the translation's guard is unchanged; only its answer is the one refusal. To change it, withdraw the approval (back to review, with a reason), then approve it again.

### Hazard, while its residual risk is accepted

Accepted means status `accepted`, or `acceptable` true. That is the Risk screen's own test (`isAccepted`, `RiskRegister.tsx`). A hazard closed after its acceptance keeps `acceptable` true and stays held.

| API field | Refused | Why |
|---|---|---|
| `refCode`, `hazard`, `hazardousSituation`, `harm`, `sequenceOfEvents`, `severity`, `probability`, `detectability`, `controlStrategy`, `source`, `residualSeverity`, `residualProbability`, `benefitRiskRationale` | Yes | In risk-residual-acceptance/v1. The derived `initial_risk` and `residual_risk` are on the list too, and change only through these fields. |
| Controls: add (`POST /risk-items/:id/controls`, AnA `add_risk_control`), edit (`PATCH /risk-controls/:id`, every field) | Yes, `child: risk_controls` | Each control is in the digest. There is no control DELETE. |
| `status` to open, mitigating or verified; `acceptable` false or null | Yes, 409 `RESIDUAL_ACCEPTANCE_REOPEN_REQUIRED` | Each takes the acceptance off. That is the signed reopen. |
| `assignedTo`, `programId` | **No, editable** | Who owns the work and where it sits; not attested. |
| `status: 'closed'` | **No, editable** | It keeps the acceptance (`acceptable` stays true) and changes nothing attested. |

### The child-row writes are one statement each

Each child-row write is one statement:

- the symbol `INSERT … SELECT … FOR SHARE` and `DELETE … WHERE EXISTS (… FOR SHARE)`;
- the control `INSERT … SELECT … FOR SHARE`;
- the control `UPDATE … WHERE EXISTS (… FOR SHARE)`.

Each takes a share lock on the record it hangs from, and writes only while that record carries no signature. A signing act locks the record `FOR UPDATE`, so either it waits for the write, or the write waits for it and then sees the record signed (READ COMMITTED re-checks the locked row).

The record's own PATCH is a single guarded `UPDATE` on its row, as before. Each guarded write that writes nothing then asks why, and answers one of:

- 404;
- the refusal;
- `…_CHANGED`, "reload and try again", for a record that moved between the two statements.

## The reopen: `POST /api/mdx/risk-items/:id/reopen`

The route takes the editor gate and the per-signer attempt limit. It then runs `signGovernedAct`, the same ceremony as the acceptance:

1. signing authority;
2. password and second factor;
3. one transaction under the ceremony's lock on `risk-item:<id>`.

Meanings: `DECISION_ACT_MEANINGS` (approval, responsibility).

| Case | Answer |
|---|---|
| The hazard carries its acceptance | 201. Status goes back to the pre-acceptance status the acceptance in force recorded (`act.previousStatus`), or to the one the body names (`open`, `mitigating` or `verified`). `acceptable` is cleared. The signature binds the hazard as it stood (`risk-residual-acceptance-content-sha256`), the digest the acceptance signed. Its manifest says `kind: 'reopen-residual-acceptance'`, the previous status and acceptability, and the acceptance signature it reopened. |
| No acceptance in force records a pre-acceptance status (accepted before the signed act, or its signature withdrawn) and none is named | 409 `RISK_REOPEN_STATUS_REQUIRED`. Nothing signed. |
| Not accepted | 409 `RISK_NOT_ACCEPTED`. Nothing signed. |
| A status that is not before acceptance (`closed`, `accepted`) | 422. Nothing signed. |
| No signature components, a wrong password, a viewer, another organization's hazard | 400, 401, 403 and 404, as the ceremony and the gates answer them. |

Then the fields can change, and the hazard is accepted and signed again. The new acceptance is the newest signature in force, so the read says `matches` against it.

The reopen writes its status from a variable, not a literal. The sign-ceremony gate therefore learns no new signed pair. If `risk_items.status=open` were recorded as signed, AnA's `create_risk_item`, which inserts `'open'`, would read as an unsigned act.

## P-64: the translation's source

- **v2 at signing.** A translation approval now binds `labeling-translation/v2`: its own fields, plus `source.version` and `source.contentDigest`, the source document's labeling-document/v1 digest. The manifest records `bindingRecipe: 'labeling-translation/v2'` and `boundSource: { target, version, contentDigest }`.
- **v1 still verifies.** An approval taken by v1 (84aada8f7 to this change) records no `bindingRecipe`. Its `bindingNote` names `(recipe labeling-translation/v1)`. The read derives it by v1. So:
  - it reads `matches` when the translation is unchanged, whatever its source does, because v1 never bound the source;
  - it reads `changed` when the translation is edited.
- **The state this adds is `source-changed`, not plain `changed`.** The read returns it when three things hold:
  - the v2 digest differs;
  - the recorded source digest differs from the source now;
  - derived as of the recorded source, the translation still gives the signed digest.

  The reason names both versions. If the translation itself changed too, it reads `changed`. The remedy differs: a translation whose source moved on needs translating again against the new text, not a check of an edit. So the screen says "Source changed since it was signed", through `SignedContentState.tsx`, with the server's reason, and AnA is told the same.
- **When the source moves on.** An approved, effective or superseded label is now held by P-63. So the source moves on in two cases:
  - it was a draft or in review when the translation was approved;
  - its approval was withdrawn and it was edited.

  A new version of a label is a new document row, and the old translation stays bound to the old one.

## Tests

### New

| File | Tests | What it covers |
|---|---|---|
| `server/__tests__/routes/signed-content-locked.pglite.test.ts` | 54 | **The label and translation**, through the real labeling router, ceremony, binders, writer and read, on PGlite (`20260511`, `20261029b`, `20260507`):<br>• every bound label field, symbol add and symbol remove, refused in each signed status;<br>• a bound field beside an unbound one, refused whole;<br>• a status move beside an unbound field, refused;<br>• the project, editable;<br>• drafts and documents in review, unchanged;<br>• a pre-rule symbol, still detected;<br>• AnA's symbol tool, refused and allowed;<br>• every bound translation field, refused.<br>**P-64:**<br>• the v2 digest and manifest, recomputed as an inspector would;<br>• `source-changed` on a version edit and on a symbol;<br>• `changed` for an edited translation, and when both moved;<br>• an unbindable source refused;<br>• a v1 approval, written as at 84aada8f7, still `matches` and still detects an edit. |
| `server/__tests__/routes/risk-acceptance-locked.pglite.test.ts` | 39 | **The hazard**, through the real risk router:<br>• every bound field refused, with the acceptance still `matches`;<br>• a control add and every control field edit, refused;<br>• the assignee, the project and closing, editable, and still held once closed;<br>• five plain ways to take the acceptance off, refused;<br>• a hazard recorded acceptable before the signed act, held;<br>• hazards not accepted, unchanged;<br>• a pre-rule edit, still detected;<br>• AnA's control tool.<br>**The reopen:** signed and its manifest; then edited and re-accepted; a named status; legacy; a withdrawn acceptance; not accepted; no signature; wrong password; 422; viewer; 404. |
| `server/__tests__/routes/signed-records.fixture.ts` | — | The shared PGlite schema, seeders and inspector's digests for the two suites above. |
| `server/services/part11/__tests__/signed-content-lock.test.ts` | 56 | **"Cannot drift"**, for each recipe:<br>• every listed field and child field moves the digest;<br>• the refusal is exactly the list;<br>• the lists as the binder README names them.<br>The refusal's words and details. **v2:**<br>• its digest and manifest;<br>• source edits move it;<br>• `asOfSource` gives the signed digest;<br>• an unbindable source falls back;<br>• v1 by name is 84aada8f7's bytes;<br>• an unknown recipe falls back. |
| `client/src/concept2cure/v2/__tests__/signedContentSourceChanged.test.tsx` | 5 | `source-changed`: read, its words, a line drawn, tone and icon beside the words, the reason, AnA. |

### Keep-green suites changed, and why

Each change is an assertion of behaviour that P-63 or P-64 reverses. The detectors those tests pinned are kept: a pre-rule edit is now written straight to the table.

| Suite | Change |
|---|---|
| `content-digest-binders.pglite` | The translation digest is recomputed by v2. The symbol POST, the rationale PATCH and the control PATCH now expect 409; the same edit, written to the table, is still detected as `changed`. |
| `labeling-risk-content-binders` | The v1 block asks for v1 by name (`{ recipe: 'labeling-translation/v1' }`): v1 stays derivable, and v2 is pinned in the new unit suite. |
| `mdx-labeling-approval-controls.pglite` | Two code assertions: `TRANSLATION_APPROVED_LOCKED` and `LABELING_DOCUMENT_CONTROLLED` become the one refusal, `SIGNED_CONTENT_LOCKED`. No client read either code. |
| `labelingSignedContentOnScreen` | One case added: a translation whose source moved on. |

### Red at HEAD: `red.txt`

The new tests ran against HEAD's product code (d56be445f). `red.py.txt` set each changed product file to its bytes at HEAD and moved the two new modules aside. It then put every file back from the bytes read before, and checked each sha256; all are equal (end of `red.txt`).

**89 of 127 collected tests failed, and the unit suite's 56 could not load**, because `signed-content-lock.ts` does not exist at HEAD.

| Suite | Red at HEAD | Why |
|---|---|---|
| `signed-content-locked.pglite` | 47 of 54 | Every bound label field, symbol add and remove, and translation field was saved, 200 or 201. The project was refused, wider than the signature. AnA added a symbol to an approved label. The approval bound v1, with no `bindingRecipe` or `boundSource`. A moved source read `matches`. An unbindable source was signed. |
| `risk-acceptance-locked.pglite` | 36 of 39 | Every bound hazard field and control write on an accepted hazard was saved. A plain move took the acceptance off. AnA added a control. `POST /risk-items/:id/reopen` did not exist (404). |
| `signed-content-lock.test` | could not load (56) | The module does not exist. |
| `signedContentSourceChanged` | 5 of 5 | The client read `source-changed` as `unavailable`. |
| `labelingSignedContentOnScreen` | 1 of 29 | The new case. The other 28 are the suite's own, unchanged. |

The 10 that pass at HEAD are behaviour that stays the same:

- a draft or a document in review takes edits and symbols;
- 404s;
- the "changed" detector for a pre-rule symbol and a pre-rule rationale;
- AnA's tools on records that are not signed;
- a hazard that is not accepted;
- `changed` for an edited translation;
- a v1 approval's `matches` and `changed`.

### Green: `green.txt`

**52 files, 925 tests: 921 passed and 4 failed.** The 4 failures are in two suites this change does not touch, `governed-signed-act.request-context` and `protocol-signatures.routes`. Both fail on a new `organizationStatuses` argument to the signing-authority check: the offboarding session's uncommitted edits to `server/routes/governed-signed-act.ts` and `server/services/part11/signing-authority-gate.ts`, made during this work. They still fail with only those edits in the tree.

The same files, without the two cases added last, passed **923 of 923** before those edits (the note at the end of `green.txt`).

The run covered:

- the five new and changed suites;
- every keep-green suite the lead named: `mdx-labeling-approval-controls.pglite`, `mdx-labeling-translation-approval-signature`, `mdx-risk-accept-residual-signature`, `content-digest-binders.pglite`, `labeling-risk-content-binders`, `labelingSignedContentOnScreen`, `riskSignedContentOnScreen`, `signedContentState`, and the `mdx-risk-*` route suites (assignee membership, program scope, recompute);
- the suites the earlier binder change kept green: the domain sign ceremony, the governed-sign PGlite writer, the verify endpoint, the Vault seal, the protocol, commitment and labeling shape suites, the device project admit suites, the engineering contract and gate, the editor gate and the two route families under `tests/`;
- AnA's labeling and record-scope tool suites;
- every client `labeling*`, `risk*`, `EngineeringSurface*` and `engineeringAna*` suite.

### Mutations: `mutations.txt`

**34 of 34 red.** Each mutation:

1. is an exact replacement in product code, its old string checked to occur once;
2. runs the named tests (`--reporter=json`);
3. is reversed on the file as it then stands, so a concurrent edit by another session would be kept;
4. has its sha256 checked.

The file ends with each file's sha256, equal to its value before the run. The script is `mutate.py.txt`.

| | Mutation | File | Red |
|---|---|---|---|
| M1 | The label recipe drops the UDI-DI from its list: the digest and the refusal lose it **together** (one list) | `governed-target-binders.ts` | 16 of 292 |
| M2 | The refusal drops the signed act's own field (the label's effective date) | `signed-content-lock.ts` | 6 of 293 |
| M3 | The refusal drops the text artifact the recipe digests | `signed-content-lock.ts` | 8 of 293 |
| M4 | A label edit naming a bound field is written whatever the status | `mdx-labeling-approvals.ts` | 31 of 108 |
| M5 | A move out of a signed status sent with an unbound field is written | `mdx-labeling-approvals.ts` | 1 of 108 |
| M6 | A symbol is added to a label that carries a signature | `signed-content-lock.ts` | 6 of 70 |
| M7 | A symbol is removed from a label that carries a signature | `signed-content-lock.ts` | 3 of 54 |
| M8 | An approved translation takes an edit | `mdx-labeling.ts` | 8 of 108 |
| M9 | A hazard edit of a field the acceptance binds is not guarded | `mdx-risk-acceptance-lock.ts` | 17 of 55 |
| M10 | A plain PATCH takes the acceptance off | `mdx-risk-acceptance-lock.ts` | 5 of 39 |
| M11 | Closing an accepted hazard is refused as if it took the acceptance off | `mdx-risk-acceptance-lock.ts` | 1 of 39 |
| M12 | The hazard lock reads the status only: `acceptable` true is not held | `mdx-risk-acceptance-lock.ts` | 2 of 39 |
| M13 | A control is added to an accepted hazard (route and AnA) | `signed-content-lock.ts` | 3 of 39 |
| M14 | A control of an accepted hazard is edited | `mdx-risk-management.ts` | 5 of 55 |
| M15 | AnA's symbol tool reports a refused write as done | `AnaToolExecutor.ts` | 1 of 54 |
| M16 | AnA's control tool reports a refused write as done | `AnaToolExecutor.ts` | 1 of 39 |
| M17 | The reopen leaves the hazard recorded acceptable | `mdx-risk-acceptance-lock.ts` | 3 of 39 |
| M18 | The reopen ignores the status the acceptance recorded, and invents one | `mdx-risk-acceptance-lock.ts` | 3 of 39 |
| M19 | A hazard not accepted is "reopened" and signed | `mdx-risk-acceptance-lock.ts` | 1 of 39 |
| M20 | The reopen reads a withdrawn acceptance as in force | `mdx-risk-acceptance-lock.ts` | 1 of 39 |
| M21 | The reopen takes no editor gate | `mdx-risk-management.ts` | 1 of 39 |
| M22 | v2 does not bind the source | `governed-target-binders.ts` | 8 of 293 |
| M23 | v2 binds the source's digest but not its version | `governed-target-binders.ts` | 4 of 293 |
| M24 | The translation approval still signs v1 | `governed-target-binders.ts` | 11 of 293 |
| M25 | A source that cannot be bound is signed anyway, as empty | `governed-target-binders.ts` | 2 of 293 |
| M26 | The read derives every signature by the current recipe, not the one it recorded | `signed-content-state.ts` | 1 of 70 |
| M27 | The read takes the recipe from `bindingRecipe` only, not from a v1 note | `signed-content-state.ts` | 1 of 54 |
| M28 | No `source-changed`: a moved source reads `changed` | `signed-content-state.ts` | 2 of 54 |
| M29 | `source-changed` claimed when the translation itself changed too | `signed-content-state.ts` | 1 of 54 |
| M30 | The binder ignores the recorded source it is asked to derive as of | `governed-target-binders.ts` | 3 of 110 |
| M31 | The client cannot read `source-changed` (shown as "could not be read") | `SignedContentState.tsx` | 6 of 34 |
| M32 | `source-changed` is said as "Changed since it was signed" | `SignedContentState.tsx` | 4 of 34 |
| M33 | `source-changed` is shown without the server's reason | `SignedContentState.tsx` | 2 of 34 |
| M34 | `source-changed` is not a signature on record | `SignedContentState.tsx` | 3 of 34 |

### Type check, lint, gates

- **`typecheck.txt`.** Scoped `tsc` with two scratch tsconfigs that extend `./tsconfig.json`, listing the changed files, the tests and the repo's declaration files. The server side adds the three modules that augment `Express.Request`. tsc follows imports, so `AnaToolExecutor.ts` is checked. **Server exit 0, client exit 0**, no output.
- **`eslint.txt`.** 0 errors.
  - Every file's warning count equals HEAD's, and every new file has none:
    - `signature-persistence.ts`: 1 = 1, `persistElectronicSignature`'s complexity.
    - `mdx-risk-management.ts`: 1 = 1, the PATCH handler's complexity, 21 as at HEAD.
    - `AnaToolExecutor.ts`: 96 = 96.
  - Every file is at or under 500 counted lines; `signature-persistence.ts` is at 498. That limit is why the PGlite suite is split in two, with a shared fixture.
- **`gates.txt`.**
  - `ci:sign-ceremony` OK: 29 baselined sites, as baselined, and no new signed pair. Its selftest: 44 passed.
  - `ci:server-error-leaks` OK, and its selftest.
  - `ci:sql-interpolation` lists four problems, all in other sessions' uncommitted files:
    - `server/services/tenant/held-records.ts`;
    - `server/services/tenant-export/held-record-integrity.ts`;
    - `server/services/vault/retention-period.ts`;
    - `server/routes/vault-retention-period.ts`.

    None is in a file this change touches. This change's two files are at their lowered baselines. Its selftest: 35 passed.
  - Also run: `ci:tenant-resolvers` OK, with no new local resolver in the new route module; `ci:unreferenced-modules` OK, 73 of 73.

## Not done

- **No client button for the reopen.** The Risk screen offers no reopen of an accepted acceptance. The route and its refusal sentence are the way. The screen's "Add control" on an accepted hazard now answers with the refusal's sentence, through its existing error toast.
- **No client action for a label's new version or withdrawal.** That was already not done (981e88c36, "Not done"). The refusal names the way.
- **The share locks are not mutation-tested.** The `FOR SHARE` clauses close a race between a child-row write and a concurrent signing act. PGlite runs one connection, so the suites cannot interleave two transactions. They are argued from READ COMMITTED's re-check of a locked row, and were not shown failing.
- **A reopen does not take the acceptance signature out of force.** The acceptance stays in the signature table as the record of what was accepted. The reopen's own signature, binding the same digest, is then the newest in force, as a labeling withdrawal leaves its approval. A read of a reopened hazard describes the reopen signature. The Risk screen reads only accepted hazards, so it does not show one.
- **RIM's label approval (`rim-product:`)** binds content only when RIM reopens (P-64; outside the launch catalog under P-37).
- **Not run:** the full-repo typecheck, which runs out of memory under parallel load, and the rest of the test tree.

## Files

- **New:**
  - `server/services/part11/signed-content-lock.ts`
  - `server/routes/mdx-risk-acceptance-lock.ts`
  - `server/__tests__/routes/signed-content-locked.pglite.test.ts`
  - `server/__tests__/routes/risk-acceptance-locked.pglite.test.ts`
  - `server/__tests__/routes/signed-records.fixture.ts`
  - `server/services/part11/__tests__/signed-content-lock.test.ts`
  - `client/src/concept2cure/v2/__tests__/signedContentSourceChanged.test.tsx`
- **Changed (product):**
  - `server/services/part11/governed-target-binders.ts`
  - `server/services/part11/signature-persistence.ts`
  - `server/services/part11/signed-content-state.ts`
  - `server/routes/mdx-labeling.ts`
  - `server/routes/mdx-labeling-approvals.ts`
  - `server/routes/mdx-risk-management.ts`
  - `server/services/ana/AnaToolExecutor.ts`
  - `client/src/concept2cure/v2/SignedContentState.tsx`
  - `scripts/ci/sql-interpolation-baseline.json` (the two lines above)
- **Changed (tests):**
  - `server/__tests__/routes/content-digest-binders.pglite.test.ts`
  - `server/services/part11/__tests__/labeling-risk-content-binders.test.ts`
  - `server/__tests__/routes/mdx-labeling-approval-controls.pglite.test.ts`
  - `client/src/concept2cure/v2/__tests__/labelingSignedContentOnScreen.test.tsx`
- **Evidence:** `red.txt` (and `red.py.txt`), `green.txt`, `mutations.txt` (and `mutate.py.txt`), `typecheck.txt`, `eslint.txt`, `gates.txt`, this README.
