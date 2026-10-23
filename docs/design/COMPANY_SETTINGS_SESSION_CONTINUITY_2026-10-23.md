# Complete company-settings session continuity

W1 / D2 on `concept2cure-v2`, from synchronized source `035ee6854`.
Evidence: `docs/evidence/D2-COMPANY-SETTINGS-SESSION/2026-10-23/`.

## What already exists

- `surfaces/useCompanyDocumentSettings.ts` owns the existing company profile,
  letterhead draft/reason, logo/import, saved-state reads, mutations and downloads.
  Its `${organization}:${bearer}` identity resets the draft on every bearer
  rotation. Epochs reject replies after effect cleanup, but retained handlers can
  run before that cleanup. Some download checks also equate bearer rotation with
  account replacement.
- `surfaces/company-documents/useCompanyResource.ts` owns existing design,
  permissions, inventory and history reads/actions/files. It compares raw token
  context after dispatch; it does not prevent every stale dispatch beforehand.
- `useCompanyLegalResource.ts`, `LegalLifecycleEditor.tsx`,
  `LegalRequirementsEditor.tsx` and `CompanyLegalReadiness.tsx` own the legal
  resource/action and form identities. Token-derived owners/React keys can
  recreate an unsaved form on an ordinary refresh. These are existing consumers
  of the same company configuration, not another registry or editor to create.
- `editor/authoringCurrentRead.ts` already exposes `captureAuthoringSession` and
  `useAuthoringReadSession`. They combine the canonical auth revision with the
  current account-object identity, subscribe to auth events and deliberately
  survive ordinary bearer refresh. `authService.captureSessionReadGuard` is the
  underlying session authority. Reporting already reuses these helpers.
- Existing company-settings, designs, governance, legal and account tests cover
  ordinary workflows and token/org replacements; Reporting's
  `reportingCurrentSessionOwnership.test.tsx` demonstrates actual canonical auth
  refresh, role replacement and retained same-frame handlers.
- Company settings is reached from Account and Settings. Its existing APIs,
  capabilities, revision conflicts, governed receipt rules, current Vault/legal
  admission, signature ceremonies and export audit remain canonical.

Searches covered company session/token/owner/draft/refresh in components, hooks,
routes/services, auth and report consumers; current work-order claims; and
deleted history for company settings/resource/session names. No predecessor or
competing session-continuity implementation was found. The reporting legal
chooser's missing paging and ordinary sealed-Authoring successor policy are
separate needs and are outside this completion.

## Bounded behavior

1. Reuse the existing canonical account/session guard. A thin company adapter is
   permitted for existing company hook/form keys; no new authentication/session
   engine, authority, persistence or credential store.
2. A normal refresh of the bearer within the same canonical account/session
   preserves unsaved profile/letterhead fields, reasons, imported draft/logo and
   applicable open company forms. It does not force an unnecessary saved-state
   reload. Pending reads/actions/downloads still belong to that same owner and
   may settle normally through the existing API client.
3. Logout, expiry, session replacement, account/org change or replacement of the
   current account/role snapshot withdraws private company data and capabilities.
   A new owner reads its own saved profile. A late old reply must never populate
   that view, including A-to-B-to-A navigation.
4. Recheck captured ownership before every retained read/action/file dispatch
   and after awaited responses/body reads. A handler retained before a canonical
   account change must send nothing under replacement credentials, even before
   React rerenders or effects clean up. Keep existing path/document/revision
   ownership and unmount/request-generation guards as well.
5. Preserve existing exact receipt, revision-conflict, unknown-outcome and
   governed reason behavior. No automatic replay of a sent write or invention of
   success. No idempotency/reconciliation engine, API contract, server access
   policy, logo format, PDF/Word renderer or original-byte change.

## Ownership and verification

One client worker owns the existing settings hook, two resource hooks and
minimal owner-key call sites, an optional thin company session adapter and
focused mounted tests. Root owns design/evidence, integration, global gates and
Git. An independent reader reviews owner/scope guards and the final diff. No
overlapping implementation or worker Git operations.

Retain functional RED proving that a real canonical bearer refresh loses an
unsaved company draft, and that a retained old handler can dispatch in the same
frame as replacement. Then prove GREEN, same-owner pending completion, current
role/account replacement, delayed response/body rejection, A-to-B-to-A and
unmount/path/revision boundaries. Use actual canonical auth behavior with a
synthetic HTTP transport; update stale test fixtures rather than introducing a
test-only auth fallback. Run affected company and auth-consumer regressions,
lint with no warning growth, build, whole TypeScript and mandatory push hooks.
Record exact source inputs and distinguish local mounted proof from a live
browser, hosted CI or production deployment.
