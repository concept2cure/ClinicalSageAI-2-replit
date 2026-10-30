# A labeling translation's approval is an electronic signature

Launch row D5 (governed path, 21 CFR Part 11). Date 2026-10-29. The work was done on a working tree over `43fb57cc`, and checked again at `b390ed22`. No commit in between touched the files below, or the ceremony modules they use.

This takes up a hand-on in `../../D3-DEVICE-WRITES-ADMIT-PROGRAM/2026-10-29/ana-tools-and-role-gate/README.md` ("Not done"): the translation approval needs an editor but no signature, and the `ci:sign-ceremony` baseline's reason for `mdx-labeling.ts` is stale.

**Status: done for the translation approval.** Two writes could approve a translation: the PATCH, and a create made with status `approved`. Both now need a signature. The labeling *document* approvals have the same gap and are not fixed (see "Other labeling transitions").

## The gap

`PATCH /api/mdx/labeling/translations/:transId` with `{ status: 'approved' }` stamped `approved_by` and `approved_at`. Since `43fb57cc` it needed an editor (`requireEditorAccess`), and nothing more:

- no re-authentication (§11.200);
- no declared meaning (§11.50(a)(3));
- no reason;
- no `electronic_signatures` row (§11.50, §11.70).

`red-route.txt` shows the statement it sent for a body of `{ status: 'approved' }` and nothing else:

```
UPDATE labeling_translations SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
 WHERE id = $3 AND organization_id = $4 RETURNING *          params ["approved", 5, 1, 7]
```

`POST /api/mdx/labeling/:id/translations` also accepted `status: 'approved'`. That created an approved translation with no approver and no signature.

## What already exists

Read in the working tree before any change.

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Signer re-verification | `server/services/part11/reverify-signer.ts` `reverifySigner`; its wiring `reverify-signer-deps.ts` `signerReverificationDeps(client)` | The password, the second factor whenever one is enrolled, the account's lockout and standing. Returns the factors it checked. | Asks nothing about authority. |
| Signing authority | `server/services/part11/signing-authority-gate.ts` `checkSigningAuthority`, over `resolve-signer-role.ts` `resolveSignerOrgRole` | The signer's role from the membership row, never the token or body (admin, approver, reviewer; P-18). 403 `ESIGNATURE_NO_AUTHORITY`, or 503 `SIGNING_AUTHORITY_UNVERIFIED` when the role can't be read. | — |
| The signature row | `server/services/part11/signature-persistence.ts` `persistGovernedSignSignature` | Writes `electronic_signatures` on the caller's client, bound to the target. A target type with no content binder (`labeling-translation` has none) is bound to the ledger chain hash, with that basis named. It never invents a digest. | No content digest for a translation. |
| The route-level ceremony | `server/routes/governed-signed-act.ts` `signGovernedAct`, `signedActAttempts` | The composition, once, for domain routes. It checks the components (reason, meaning, password), then that the meaning is one this act can carry, then authority, then the password. Then: BEGIN, the tenant context, an advisory lock on the target, the domain write, the `sign` ledger pair, the signature row, COMMIT. A coded domain error refuses with its status. `signedActAttempts` is the per-signer attempt limit. Before this change, 20 route files imported it. | Separation of duties. Its header says why: authorship is not modelled for these record types. |
| The service-level ceremony | `server/services/part11/governed-signature-ceremony.ts` `signGovernedAct` | The same ceremony, plus separation of duties through `resolveTargetAuthors` (`server/services/governance/separation-of-duties.ts`). | It refuses every meaning (409) for a target type whose authors are not modelled. `labeling-translation` is not modelled. |
| The meaning sets | `server/services/part11/signature-meanings.ts` | `DECISION_ACT_MEANINGS` (`approval`, `responsibility`) is the set for approving a record. | — |
| A launch-catalog approval through the route ceremony | `server/routes/mdx-qms.ts` `POST /qms/documents/:id/periodic-review`; client `client/src/concept2cure/quality/qmsApproval.ts` `postQmsPeriodicReview` and `PeriodicReview.tsx` | The QMS periodic review signs through `signGovernedAct`. The client sends `{ meaning, reason, password, mfaToken }` from `EsignModal`. It treats a 4xx as the server's refusal, and a 5xx or dropped connection as unconfirmed. | — |
| A status set to approved, signed on its own route | `server/routes/rim.ts` `POST /products/:id/labels` | `whenApproving` mounts `signedActAttempts` only when `status === 'approved'`. That status runs `signGovernedAct`; any other status is a plain governed update. | — |
| The other QMS approvals | `mdx-qms.ts` `POST /qms/documents/:id/approve`, `/qms/changes/:id/approve`; `services/qms/document-approval-signature.ts`, `change-approval-signature.ts` | Their own composition: authority, `reverifySigner`, then a domain service that writes the stamp, ledger and signature row, and refuses the author (`QMS_SELF_APPROVAL`, from `author_id`). The plain change transition to approved answers 428 `CHANGE_APPROVAL_REQUIRES_SIGNATURE`. | Specific to QMS tables. |
| The authoring approval | `server/routes/authoring.router.ts` `POST /docs/:docId/e-sign` | `reverifyAuthoringSigner`, `checkSigningAuthority`, `assertSignerIsNotAuthor`, and an `authoring_signatures` row (`insertAuthoringSignature`). | Specific to authoring documents. |
| The client dialog | `client/src/concept2cure/_shared/components/EsignModal.tsx` over `client/src/concept2cure/hooks/useEsignature.ts` | It captures the meaning and the reason (8 characters, as the server requires), then verifies the password and code through `/api/esignature/verify-*`. Then it calls `onSign({ meaning, reason, password, totp })`, which runs the governed request. A rejection is shown inline and the dialog stays open. | — |
| The sign gate | `scripts/ci/check-sign-ceremony.mjs`, `sign-ceremony-baseline.json`, `check-sign-ceremony.selftest.mjs` | Every `sign` ledger write needs re-verification and a signature-row write in its handler. Since 2026-10-01, every SQL approval stamp (`approved_by`, `approved_at`, …) needs a signature-row write in its handler. The baseline is exact, per file, and each entry needs a written reason. | It did not count `signGovernedAct(` as a signature-row write (below). |
| The labeling baseline entry | `sign-ceremony-baseline.json`, `server/routes/mdx-labeling.ts` | count 1, reason "MDX labeling approval. Outside the launch catalog … RULE 2 gives it no session." | Stale. Labeling joined the catalog on 2026-10-26, under the founder's device decision of 2026-10-23 (`shared/constants/launch-scope.ts`, the Projects app list). The site it counted is the stamp above. |
| The labeling screen | `client/src/concept2cure/v2/surfaces/Labeling.tsx` | `advTrans` PATCHed the next status in pending, in progress, review, approved. The last step was the same "Advance" button. | No signature. |

Searches run:

- `reverifySigner`, `checkSigningAuthority`, `resolveSignerOrgRole`, `signGovernedAct`, `persistGovernedSignSignature` and `governed-signed-act` across `server`. That gave both ceremonies and the 20 route files that import the route one.
- `EsignModal` and `useEsignature` across `client/src`. That gave 24 client files, with the periodic review and commitment fulfilment as client patterns.
- `labeling_translations` and `labeling_documents` across `server`, `shared`, `scripts` and `migrations`. The writers are the route, two AnA tools and the demo seeds. No migration after `20260511_qms_and_labeling.sql` adds an author or approver column; `20261013b` adds keys only.
- `api/mdx/labeling` across `client/src`: only `Labeling.tsx` calls it.
- `CONTENT_BINDERS` and `deriveGovernedTargetBinding`: no binder for a labeling target.

## The pattern copied

`signGovernedAct` from `server/routes/governed-signed-act.ts`, wired as `rim.ts` wires it for a label recorded as approved:

- the same route;
- `whenApproving` mounts `signedActAttempts` only when the body's status is `approved`;
- that status runs the ceremony with `DECISION_ACT_MEANINGS`;
- any other status is the plain update it was.

The domain write (`run`) is the stamp.

The client is copied from `postQmsPeriodicReview` (`qmsApproval.ts`) and the commitment fulfilment dialog:

- `EsignModal` with the act's meanings, the signer from `useAuthUser` and `requireMfa` from `mfaEnabled`;
- `onSign` sends `{ meaning, reason, password, mfaToken }`;
- a 4xx or 401 is the server's sentence, ending once with "Nothing was signed.";
- a 5xx, a dropped connection, or an answer with no `signedAt` is "unconfirmed". It is not "nothing was signed", because the commit may have happened.

**Separation of duties: not applicable, and not done.** The QMS and authoring approvals refuse the author because their tables record one (`author_id`, the document's authors). `labeling_translations` does not:

- `translator` is a free-text name;
- the create stores no user;
- nothing writes a ledger row for it.

The route ceremony leaves separation of duties out for this reason. The service ceremony would refuse every approval, since `labeling-translation` authorship is not modelled. See "Not done".

## What changed

- **`server/routes/mdx-labeling.ts`**
  - `PATCH /labeling/translations/:transId` takes `whenApproving`, after `requireEditorAccess`.
  - With `status: 'approved'` it calls `approveTranslationSigned`. That function:
    1. refuses an approval that also edits a field (400 `TRANSLATION_APPROVAL_EDITS_FIELDS`), because the signature covers the translation as it stands;
    2. calls `signGovernedAct` with target `labeling-translation:<id>`, domain `labeling`, meanings `DECISION_ACT_MEANINGS`, and codes `TRANSLATION_NOT_FOUND` 404 and `TRANSLATION_ALREADY_APPROVED` 409.
  - Its `run`, on the signing transaction:
    - reads the translation `FOR UPDATE OF t`, joined to its live document and scoped by organization;
    - refuses one already approved;
    - stamps `status = 'approved', approved_by = <signer>, approved_at = NOW()`;
    - returns what was approved (translation, document, language, previous status, method, back-translation flag) for the ledger payload and the signature manifest.
  - Any other status change is the plain update it was. Its old auto-stamp is gone.
  - `POST /labeling/:id/translations` with `status: 'approved'` answers 428 `TRANSLATION_APPROVAL_REQUIRES_SIGNATURE`, and nothing is inserted.
  - `getUserId`, used only by the old stamp, is removed.
  - The header and a block comment say what the approval runs, and why there is no separation of duties.
- **`client/src/concept2cure/v2/surfaces/LabelingTranslationApproval.tsx`** (new). This is the approval control.
  - `TranslationApprovalDialog`: the shared `EsignModal`, with:
    - meanings `approval` and `responsibility`, defaulting to `approval`;
    - the signer from `useAuthUser`, and `requireMfa` from `mfaEnabled`;
    - the action ("Approve the German translation"), the target (device, kind, language), and what the signature binds.
  - `postTranslationApproval` PATCHes `{ status: 'approved', meaning, reason, password, mfaToken? }`.
    - A 4xx refusal or a 401 throws the server's sentence, ending once with "Nothing was signed.". The dialog stays open.
    - A 5xx, a dropped connection, or an answer without `signedAt` throws "The server did not confirm the approval…".
    - Otherwise it returns the server's row and the manifest: the signature row's time and the chain hash.
  - It is its own file because the same code inline put `Labeling.tsx` over `max-lines` (4 ESLint warnings against 2 at head).
- **`client/src/concept2cure/v2/surfaces/Labeling.tsx`**
  - A translation in review shows **Approve**, which opens the dialog. The other steps keep **Advance**.
  - `advTrans` stops at review, so it can never send `approved`.
  - The row shows approved only after the server answers with a signature.
  - AnA's action list says approval is an electronic signature.
- **`scripts/ci/sign-ceremony-baseline.json`**: the stale `server/routes/mdx-labeling.ts` entry is removed.
- **`scripts/ci/check-sign-ceremony.mjs`** and **`check-sign-ceremony.selftest.mjs`**: below.
- **Tests**
  - New: `server/__tests__/routes/mdx-labeling-translation-approval-signature.test.ts` (23 cases) and `client/src/concept2cure/v2/__tests__/labelingTranslationApprovalSigned.test.tsx` (10 cases).
  - `mdx-labeling-writes-require-editor.test.ts`: its editor row for the translation PATCH now sends `status: 'review'`. An unsigned `approved` is refused now, so a 200 is no longer expected for it. The viewer's refusal of the approval moved to the new suite.

## The gate change

The lead approved it during the slice.

`SIGNATURE_ROW` in `check-sign-ceremony.mjs` now includes `signGovernedAct`, as `insertAuthoringSignature` was added on 2026-10-08. Both functions named `signGovernedAct` (`routes/governed-signed-act.ts` and `services/part11/governed-signature-ceremony.ts`) do three things: re-verify the signer, run the caller's domain write, and write `persistGovernedSignSignature` on that same transaction. So a stamp made inside the write is signed. Without this, the labeling stamp scored "no signature row" even inside the ceremony. Then the entry could not be removed, and the gate could not go red on it.

**Which files' counts change because of it.** None but labeling.

- With only the regex changed, and the route still at HEAD, `npm run ci:sign-ceremony:list` printed the same 59 lines as before, byte for byte (`gate-before-after.txt`). The gate still passed, with 19 baselined.
- With the route fixed and the entry removed, the list differs from the start in three lines.
  - One is the change: `server/routes/mdx-labeling.ts:309 approval-stamp no signature row` became `:376 approval-stamp ok`.
  - The other two are `server/routes/document-lifecycle.ts`, whose line numbers moved (`307→318`, `130→133`), with both verdicts still `ok`. That file is another session's, edited in the shared tree during this slice.
- The gate passes with 18 baselined sites (19 at head).
- No other baselined file calls `signGovernedAct` (checked file by file). So no other entry can shrink or grow from it.

**The limit.** The gate measures a handler, meaning the enclosing column-0 statement. It does not measure a callback, so the lead's "per file" is close but not exact.

- A handler that calls `signGovernedAct` for one act and stamps a second, unsigned approval outside its `run` would pass.
- So would a stamp in a sibling route nested inside the same factory function. That is the gate's existing known limit, named in its header.

**Does any file do that today?** No. With the regex changed and the route at HEAD, no site changed verdict. So no existing stamp is satisfied by a `signGovernedAct` call. The only stamp that is (`mdx-labeling.ts:376`) is inside that call's `run`.

The selftest has two new cases, modelled on the labeling PATCH:

- the stamp inside `signGovernedAct` passes;
- the same stamp with no `signGovernedAct` fails.

The selftest is 29/29. Run against HEAD's gate in a scratch copy, the new selftest fails on the first of the two new cases (`selftest.txt`). So that case depends on the new token.

## Proof

Each test file was run alone, under `timeout 240`.

- **`red-route.txt`.** The new route test in the tree, against `mdx-labeling.ts` at HEAD: **20 of 23 red.**
  - A body of `{ status: 'approved' }` and nothing else sent the stamp (shown under "The gap").
  - So did each of these: a wrong password, a meaning outside the act set, a signer with no authority, an approval that also edited the language, and a translation already approved.
  - A create with `status: 'approved'` was inserted.
  - The three that pass are the viewer's refusal (`43fb57cc`'s editor gate), a plain status change, and a pending create.
- **`red-gate.txt`.** `ci:sign-ceremony` at HEAD, with only the labeling baseline entry removed, fails on `server/routes/mdx-labeling.ts:309 (approval stamp with no signature-row write in its handler)`. The baseline was restored from a copy, and the sha256 matched (`1859321c…`).
- **`red-client.txt`.** The new client test against `Labeling.tsx` at HEAD: **9 of 10 red.** There is no Approve control and no dialog. The one that passes is a pending row's Advance. The review row's Advance at HEAD sends `{ status: 'approved' }` alone: that is from reading the code, and M9 below puts it back and goes red.
- **`green.txt`.** Every file run alone after the change:

  | Suite | Result |
  |---|---|
  | new route test | 23/23 |
  | `mdx-labeling-writes-require-editor` | 24/24 |
  | `labeling-translations-shape` | 3/3 |
  | `tests/mdx-qms-labeling-search-analytics-routes` | 28/28 |
  | new client test | 10/10 |
  | `labelingAddTranslation` | 3 |
  | `labelingCoverageHonesty` | 2 |
  | `labelingMapping` | 9 |
  | `labelingReadsOpenProject` | 4 |
  | `labelingRecordsNotProjectKeyed` | 6 |
  | `labelingWarningsNotAvailable` | 4 |

  `ci:sign-ceremony` passes with 18 baselined sites. Its selftest is 29/29.
- **`gate-before-after.txt`.** The gate and its full site list at HEAD, with only the regex changed, and after. See "The gate change".
- **`selftest.txt`.** The selftest now, and the new selftest against HEAD's gate.
- **Mutations.** Each was applied in the tree, run, and restored from a copy, and the sha256 matched each time (`mutation-*.txt` end with it). `git status` afterwards shows only this slice's files.

  | File | Mutation | Red |
  |---|---|---|
  | `mutation-M1.txt` | Skip the ceremony: the HEAD stamp put back in the plain PATCH, and the signed path not called | Route test 18 of 23. **Gate red**: `mdx-labeling.ts:419 (approval stamp with no signature-row write)` |
  | `mutation-M2.txt` | Send the approval to the plain update, with no stamp and no ceremony | Route test 18 of 23. Gate **green**: a status-only approval has no stamp for the gate to see. The test is what catches it. |
  | `mutation-M3.txt` | Allow a create with `status: 'approved'` again | 1: the 428 case |
  | `mutation-M4.txt` | Allow a translation already approved to be signed again | 1: the 409 case |
  | `mutation-M5.txt` | Allow an approval that also edits a field | 1: the 400 case |
  | `mutation-M6.txt` | Unmount the signing-attempt limit from the approval | 1: the limiter case |
  | `mutation-M7.txt` | Restore the stale baseline entry | `git diff HEAD` shows no difference: it is HEAD's baseline byte for byte. **Gate red**: `mdx-labeling.ts: 0 now, baseline 1` |
  | `mutation-M8.txt` | Take `signGovernedAct` out of the gate's `SIGNATURE_ROW` | **Gate red**: `mdx-labeling.ts:376 (approval stamp with no signature-row write)`. Selftest red on the new case |
  | `mutation-M9.txt` | The screen's Approve control sends the plain status change again | Client test 8 of 10 |

  Self-approval was not mutated. There is no author check to remove (see "Not done").
- **`eslint.txt`.** Plain `npx eslint <file>`. Every file is at or below head:
  - `mdx-labeling.ts` 0 (head 0).
  - `Labeling.tsx` 2 warnings, the same two as head (`max-lines-per-function`, `complexity` on `Labeling`).
  - New files 0, and `mdx-labeling-writes-require-editor.test.ts` 0.
  - The two gate scripts show only ESLint's "file ignored" notice, at head and now.
- **`typecheck.txt`.** Scoped `tsc` over the changed files and their imports, server and client: exit 0 for both.

## Other labeling transitions

Every write that can set a labeling translation or document to `approved` or `effective`:

| Write | Same gap? | Fixed here? |
|---|---|---|
| `PATCH /labeling/translations/:transId` → `approved` | The one asked about. | Yes. |
| `POST /labeling/:id/translations` with `status: 'approved'` | Yes. An approved translation with no approver and no signature. | Yes: the same small change, a 428 pointing to the signed PATCH. |
| `POST /labeling` with `status: 'approved'` or `'effective'` (and `effectiveDate`) | Yes. A labeling document created approved or effective with no signature. `labeling_documents` has no approver column, so not even an unsigned approver is recorded. | No. |
| `PATCH /labeling/:id` → `approved` or `effective` (and `effectiveDate`) | Yes, the same. | No. |
| An approved translation edited by PATCH (`language`, `translator`, `translationMethod`, `backTranslationVerified`, `artifactId`) | A related gap. The row stays `approved`, with its stamp, after what was signed has changed (§11.70). | No. |
| A PATCH from `approved` to another status | `approved_by` and `approved_at` stay set on a row that is no longer approved. | No. |
| AnA `create_labeling_document` (`AnaToolExecutor.ts` ~15092), `add_labeling_translation` (~15124) | No. They insert the column default `draft`, and `pending`. | Not needed. |
| `scripts/seed-ga-demo.mjs` (labeling translations) | It writes demo statuses as given. It runs on laptops only and is on no deploy path (CLAUDE.md Rule 1). | Not needed. |

The document approvals were not fixed for three reasons:

- They are not the same small change. The document PATCH also carries every content field and `admitProject`.
- The table has no approver column, so there is no stamp for the gate to see.
- Nothing calls them. No client sets a document's status (`api/mdx/labeling` is called only by `Labeling.tsx`, which never PATCHes a document), and no AnA tool does either.

They are handed on.

## Not done

- **Separation of duties.** The translation's author is not recorded, so the approval cannot refuse them.
  - What it needs: an author column on `labeling_translations`, set by the create and the AnA tool; and a `labeling-translation` case in `resolveTargetAuthors` (`server/services/governance/separation-of-duties.ts`). The QMS approvals' `QMS_SELF_APPROVAL` is the model.
  - Then the route can use the service-level ceremony, or check independence in `run`.
  - That needs a migration and a file outside this slice.
- **No content digest.** The signature binds the ledger chain hash, with that basis named. There is no `CONTENT_BINDERS` entry for `labeling-translation` (`server/services/part11/governed-target-binders.ts`), so the row does not carry a hash of the translation's content.
- **The lifecycle.** An approval is admitted from any status except `approved`. The board only offers it from `review`, but the server does not require `review`. QMS approves only `in_review`. Whether a translation must be in review, or back-translation verified, before approval is a product rule. It was not invented here. The add-translation form still says back-translation QC "is expected".
- **The labeling document approvals**, post-approval edits, and stale stamps after an un-approval (the table above).
- **The screen still shows the Approve control to a viewer.** The server refuses them (403), and a signer without authority (403, before the password). The dialog shows the refusal. It does not withhold the control.
