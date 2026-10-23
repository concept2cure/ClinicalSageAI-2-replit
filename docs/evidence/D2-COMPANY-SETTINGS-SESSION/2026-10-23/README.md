# Company-settings session continuity

W1 / D2. Discovery source `035ee6854`, branch `concept2cure-v2`.
Design: `docs/design/COMPANY_SETTINGS_SESSION_CONTINUITY_2026-10-23.md`.
Implementation and qualification are in progress; no passing result or
publication is claimed yet.

## What already exists

The existing `useCompanyDocumentSettings.ts` owns profile/letterhead drafts,
reads, mutations, imports and downloads. Its bearer-derived identity loses a
draft on ordinary token refresh. Existing `useCompanyResource.ts` and
`useCompanyLegalResource.ts` own panel reads/actions and legal forms; their raw
token owners and form keys do not distinguish refresh from account replacement.
Their APIs, registry, capability checks and receipt rules are retained.

`editor/authoringCurrentRead.ts` and `authService.captureSessionReadGuard` already
own the canonical account/session distinction, reused by Authoring and
Reporting. This completion reaches that implementation from company settings.
Current company tests and Reporting's real-session test pattern supply the
fixtures. Code, current claims and deleted-history searches found no competing
company session implementation. See the design for exact paths and boundaries.

Independent review identified `v2/apiCall.ts` as the existing canonical response
normalizer. Its narrowly optional owner callback replaces an initial duplicated
company JSON wrapper, preserving every ordinary three-argument call. The design
records this one reviewed exception to the initial 14 boundary pins; the other
13 remain protected. No generic mutation verdict or server API changes.
