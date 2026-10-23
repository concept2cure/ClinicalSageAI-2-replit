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
- `v2/apiCall.ts` already owns JSON response normalization, including typed HTTP
  refusals and transport errors. It has no owner checkpoints around response/body
  awaits. Extend this canonical normalizer for owned calls; do not keep a second
  company-only implementation of its status/body/error mapping.
- Existing company-settings, designs, governance, legal and account tests cover
  ordinary workflows and token/org replacements; Reporting's
  `reportingCurrentSessionOwnership.test.tsx` demonstrates actual canonical auth
  refresh, role replacement and retained same-frame handlers.
- Company settings is reached from Account and Settings. Its existing APIs,
  capabilities, revision conflicts, governed receipt rules, current Vault/legal
  admission, signature ceremonies and export audit remain canonical.
- `CompanySubmissionDocuments.tsx` and `useCompanySubmissionLibrary.ts` already
  own the legal-readiness panel's other parent. Their raw bearer-derived parent
  identity does not reread on a same-bearer account/role refresh. Include their
  minimal canonical-owner migration so the shared legal hook can recover from a
  fresh parent read, rather than silently rebinding stale token props. Preserve
  the existing paged library, selected filing scope and placement/copy receipts.

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
   success. No idempotency/reconciliation engine, server API contract, server access
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

### Reviewed canonical API-helper exception

Independent review found that the initial company-only response wrapper would
duplicate `apiCall`. Instead add a narrowly optional fourth owner callback to
that existing helper. Preserve its three-argument overload and result contract
exactly; the four-argument overload may return `null` only when its owner has
retired. Check before dispatch, after the response, after body parsing and before
projecting a caught error. Keep status, payload, network-error, 204 and parsing
semantics; add no retries or mutation verdicts. Remove the parallel company JSON
normalizer. Existing local blob handling remains local.

The client worker additionally owns `apiCall.ts` and its focused tests. This is
the sole approved exception to the initial 14 unchanged-boundary pins; compare
the other 13 exactly and record this helper difference with its regression
proof. The existing API error/refusal tests remain unchanged assertions, with
meaningful owned-response checkpoint cases added separately.

### Shared legal-parent integration

The client worker may also change the existing company submission panel/library
and their focused tests. Reuse the same captured canonical owner and filing-scope
lease for the parent read, retained setters and its existing actions/downloads;
do not rely only on a post-render owner string. Actual owner replacement hides
the prior library and legal panel, rereads current capabilities, then mounts the
new form. Ordinary refresh preserves the same parent and forms. No generic
Submission Center, leaf writer, copy service or correspondence engine changes.

Mask withdrawn library state, search/draft fields and notices synchronously in
the existing hook, before passive resets. Qualify that first-render boundary
with a layout-effect snapshot. The separate `CompanyCorrespondenceDraft`,
`CompanyCorrespondenceVariants` and `CompanyFilingIdentityReview` ownership
implementations are outside this slice; parent continuity tests isolate those
components and do not qualify all correspondence forms.

### Incoming canonical consumer fixture

Canonical catch-up runs the existing
`__tests__/authoringCreationHostRecovery.test.tsx` against the real canvas and
working-list hosts. That fixture seeds the real auth service but omits the
React auth provider those hosts require; all 38 cases fail during setup. Both
native hosts are byte-identical to discovery. Correct only the fixture using
the real auth provider and controlled bootstrap transport, mounting the host
after bootstrap completes. Preserve every existing case and ownership/header/
recovery assertion. This is validation of an existing consumer, with no new
auth implementation or production-host change. Retain the failed report and
original fixture for review.
