# P-48: a nonconformance is dispositioned by a signature

Row: D2 (launch catalog: QMS), with D5 (Part 11). The plan's inventory
(`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §2.3) lists "NCR disposition and supplier approval not
signed". This change covers the disposition; supplier approval is owed.

21 CFR 820.90(b)(1) requires the disposition of nonconforming product to be documented, with the justification for use
as is and the signature of the person who authorized it.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Disposition route | `PATCH /api/mdx/qms/nonconforming/:id/disposition`, `server/routes/mdx-qms.ts` | Any editor set the disposition with an optional rationale, and an audit row was written beside it. | It was no signature, so it had no password, no meaning and no `electronic_signatures` row. A second PATCH overwrote a disposition already made. |
| Signing ceremony | `signGovernedAct`, `server/routes/governed-signed-act.ts` | The one ceremony for a route's signed act: components, meaning set, signing authority, re-verification, then the domain write, the ledger pair and the signature in one transaction. QMS periodic review signs through it. | — |
| Meanings | `DECISION_ACT_MEANINGS` (approval, responsibility), `server/services/part11/signature-meanings.ts` | The set for a decision on a record. | — |
| Signing dialog | `EsignModal`, `client/src/concept2cure/_shared/components/EsignModal.tsx` | The shared dialog. ChangeControl approval and periodic review use it. | The record registers (`QmsRecords.tsx`) had no way to open it. |
| Client signing call | `postQmsPeriodicReview`, `client/src/concept2cure/quality/qmsApproval.ts` | Sent a signed act and read the signature time, telling refused apart from unconfirmed. | It was specific to periodic review. |

Searches run:
- `nonconforming` with `disposition` in `server/`, `client/src/`, `shared/` and `tests/`;
- `signGovernedAct`, `EsignModal` and `DECISION_ACT_MEANINGS`;
- `UPDATE qms_nonconforming_products` in `server/`. After this change there is one writer.

## What changed

- **Server.** The route keeps its path and method, and is now a signed act. In front of the ceremony it keeps
  `requireEditorAccess` and adds `signedActAttempts`:
  - the meanings are approval or responsibility;
  - the signer's reason is recorded as the disposition's rationale;
  - `pending` is refused as a decision;
  - the update runs only on an open record (no disposition, or `pending`) of the signer's organisation
    (`recordNcDisposition`, `server/services/qms/nonconformance-disposition.ts`);
  - a record already dispositioned answers 409 `NC_ALREADY_DISPOSITIONED`, and one in another organisation answers
    404. Neither signs anything.
  - The ledger pair and the signature replace the old audit row.
- **Client.**
  - A register row action may now `sign` instead of `submit` (`qmsRegisterKit.tsx`). Its form collects the decision,
    and nothing is sent until the signature. The register then opens the shared `EsignModal` (`QmsRecords.tsx`).
  - Disposition is the first such action. The drawer picks the disposition ("Continue to sign"); the dialog takes
    approval or responsibility and the reason.
  - `qmsApproval.ts` gains `sendSignedAct`, the one client call for a ceremony-signed route. Periodic review and
    `signNcDisposition` both use it.
  - `dispositionNonconformance`, the unsigned writer, is deleted.

## Proof

- `server/routes/__tests__/qms-nc-disposition-signed.test.ts` passes 3 of 3, mounting the QMS router with the
  ceremony's dependencies reduced to their verdicts:
  - a signed disposition commits in the order BEGIN, the update (with the reason as the rationale), the `sign` ledger
    entry, the signature, COMMIT, and answers 201 with the signature id;
  - nothing is written without the signature (400), with a wrong password (401), as `pending` (400) or with the
    meaning `review` (400);
  - a second disposition answers 409 and rolls back, signing nothing.
  - **Shown failing first:** against the route as it was, all three fail; the unsigned PATCH answered 200.
- `server/services/qms/__tests__/nonconformance-disposition.pglite.test.ts` passes 2 of 2, against PostgreSQL in
  process with the canonical DDL:
  - the disposition is set once, with the reason as its rationale, and a second is refused with the first kept;
  - `pending` counts as open, and another organisation's record is not found and is left unchanged.
  - **Shown failing first:** without the open-record guard, the first case fails.
- `QmsRecords.test.tsx` passes 13 of 13. Choosing Rework and continuing opens "Sign disposition", offering approval
  and responsibility, with nothing sent yet. Signing sends `PATCH …/nonconforming/4/disposition` with
  `{ disposition, reason, meaning, password }`, and the register says "NC-2026-004: Rework was signed."
  - **Shown failing first:** with only approval offered, the case fails.
- The two route tests that sent the unsigned PATCH now assert it is refused and writes nothing:
  - `qms-legacy-api-retired.test.ts`: a member's unsigned disposition answers 400 `ESIGNATURE_COMPONENT_MISSING`, the
    record stays pending and no audit row is written. A viewer is still refused with 403;
  - `tests/mdx-qms-labeling-search-analytics-routes.test.ts`: 400, with no update issued.
- The Quality client suite, every QMS route test, `server/services/qms` and the labeling and analytics routes pass
  610 of 610 (49 files). `tsc --noEmit` reports no error in the changed files.

## Owed

- **Supplier approval as a signed act.** It still goes through `PATCH /qms/suppliers/:id` with an audit row. It is
  next, and the kit's `sign` action is ready for it.
- **Correcting a signed disposition.** A correction would be a second signed act that names the first, never an
  overwrite. Not offered.
- A Postgres dbtest of the route (no server here); the domain SQL is proven on PGlite.
