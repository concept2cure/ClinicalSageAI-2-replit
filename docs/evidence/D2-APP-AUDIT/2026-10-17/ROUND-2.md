# App audit, round 2 — the open findings worked — 2026-10-17

Row moved: **D2**. Follows `README.md` in this folder (round 1, commit `1e18cdd49`). Every change
below landed failing-first: its test was run against the previous code and seen to fail, then
fixed. Four scoped agents worked disjoint file sets in this tree; their diffs were reviewed and the
combined tree verified before commit.

## What changed

| Area | Change | Failing first |
|---|---|---|
| Submissions | Gateway transmittals is a read-only log; package picker, assemble, identifiers, package transmit and unsigned rollback left the screen; its registry claim narrowed to `/api/mdx/gateways/transmittals`, so production refuses the package transmit | `gatewayTransmittalsReadOnly.test.tsx` (5 of 6 red); `launch-scope-api-gate.test.ts` ("…/fda/esg/transmit: expected false to be true"); a probe call re-added to the screen made `ci:launch-scope-api` fail with `[out-of-scope] /api/mdx/gateways/:p/:p/transmit` |
| Submissions | A US IND submission offers "Forms and letters (1571, cover letter, LOA)", opening that submission's IND checklist (navParams) | `submissionCenterIndForms.test.tsx`; `indLifecycleScopeAndAffordances.test.tsx` (5 of 5 red) |
| Submissions | IND buttons that only sent AnA a sentence say what they do, or are removed where they duplicated a real action | same |
| Agency inbox | A letter uploaded in Respond is logged in the Communication store through its one writer, linked to the source; both screens render one shared inbox (`AgencyInbox.tsx`); "Draft response with AnA" pins the letter | `projectRespondStage.test.tsx` "One agency inbox…" (4 red); `communicationDraftCarriesLetter.test.tsx` |
| Quality | New controlled document, Open, Revise (reason), Raise change request, Advance (server's `next_states`), Link record call the existing audited `mdx-qms` routes; a hand-kept copy of the change-form templates is deleted | `qmsGovernedActions.test.tsx` (11 of 11 red) |
| Protocol | A picker over the organisation's protocols, kept in `?protocolId=` | `protocolDevPicker.test.tsx` (3 of 4 red) |
| Deep research | Client reads the server's job contract (`complete`/`failed`, `results.topResults`) | `deepResearchJobContract.test.tsx` (2 of 2 red) |
| Part 11 | `GET /compliance-status`, `GET /soc2/controls` (constant "not assessed") and `POST /soc2/evidence` (answered "collected", stored nothing) removed; the console shows only the chain verdicts | `part11-static-tables-removed.test.ts`; `part11ConsoleHonesty.test.tsx` |
| Settings | Apps toggle: canonical role check, governed reason, audit row | `module-subscriptions.test.ts` (4 red); `appsLive.test.tsx` |
| Settings | "Contact sales" + false "routed to sales" toast → "Ask AnA about Enterprise" | `licensingEnterpriseAction.test.tsx` |
| Settings | Unmetered credit balance off the billing screen; Setup Translation card (read by nothing) removed | `usageBilling*.test.tsx`; `adminSetupGoverned.test.tsx` |
| AnA tools | `save_document_to_vault` says the draft is not filed in the Vault (`filed_in_vault: false`); `transmit_submission` points to the sequence's Dispatch tab; `get_billing_credits` says credits are not metered | `qms-vault-audit-atomicity.contract.test.ts`, `ana-cannot-sign.test.ts`, `billing-credits-not-metered.test.ts` |
| Combined tree | The Quality template card read `t.sections` during render, so one unexpected payload crashed the register | `hostilePayloadProbe.test.tsx` "quality throws on 1 of 8 payloads" → fixed |

## Verified

- Full typecheck (`typecheck-no-regression --incremental`): 0 errors.
- `ci:launch-scope` (+ selftest), `ci:launch-scope-api` (+ selftest), `ci:compliance-claims`,
  `ci:discarded-audit-write`, `ci:toast-canonicality`, `ci:empty-state-honesty`, `ci:fixture-fallback`.
- Every changed test file, the Quality suites and the hostile-payload probe pass.

## Red before this round, still red, not touched here

Seen failing at the unmodified HEAD with the same output:

- `biostatWorkbench*.test.tsx`, `biostatServerEngine.test.tsx` (7 cases, filing timeouts).
- `railLicenseGating.test.tsx` "never locks a destination the catalog has no row for": looks for a
  "New conversation" rail button the 2026-10-16 rail change removed.
- `ci:action-overclaim`: flags `ShadowFindingDisposition.tsx:217` ("Accept risk (Part 11
  e-signature)"), which hands the request to the parent's signature chain — likely a gate false
  positive on today's P-34/P-35 work.

## Still open

- Rollback of a transmittal is off the screen but its route still answers under `/transmittals`.
- Letters filed to the data room before today are not in the agency inbox.
- Document store consolidation: `docs/design/DOCUMENT_STORE_CONSOLIDATION.md` (proposed).
