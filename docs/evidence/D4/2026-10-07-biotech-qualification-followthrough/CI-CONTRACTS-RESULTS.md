# Existing host, audit, transmit and predictive-refusal CI contracts

Date: 2026-10-07. W3 / D4, only `concept2cure-v2` in
`concept2cure/ClinicalSageAI-2-replit`. Current-source reproduction begins at
`714506d7cd8ac499e07450542b74e72ec5630a5c`. The control tower approved these
four disjoint test scopes and the fixture/contract corrections in
[CI-FOLLOWUP-PLAN.md](CI-FOLLOWUP-PLAN.md). This worker made no production edit,
branch, commit or push.

## Reproduced contracts and corrections

| Owned suite | Actual current-source RED | Test-only correction and retained controls |
| --- | --- | --- |
| `tests/regulatory/regulatory-basis.test.ts` | Exact-host snapshot omitted `canada.ca`, already present in the immutable canonical production list. | Add that existing host to the literal expected list. Exercise its valid URL and reject `canada.ca.example.com` / `notcanada.ca` look-alikes. Production hosts and parser are untouched. |
| `server/services/audit/__tests__/audit-immutability-triggers.pglite.test.ts` | The registered Module 3 trigger migration refuses because the fixture never applied its earlier `domain_history_append_only()` function migration. | Apply the exact existing domain-history prerequisite before registered trigger files; include the two currently registered Module 3 stores in minimal catalog-test DDL/reset. Preserve every catalog/replay/missing/disabled/decoy assertion. A new control removes the function and proves the real later migration still refuses. |
| `server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts` | Valid bundle/wire scenarios never reach the transport because the fixture package has no recorded creator. The old authorship-positive and raw-Author post-wire assertions also conflict with the canonical agency-release meaning guard. | Model the fixture's stored `created_by_id` separately from the transmitting colleague, exercising the real creator lookup and checking package/tenant arguments. Retain missing-creator and self-creator refusals, with no transmission, release-ledger, transmittal or signature write. Exercise meaning persistence with a separate legitimate `responsibility` signer; preserve both original `authorship` and `AUTHOR` inputs as explicit pre-wire refusal controls. |
| `server/services/intelligence/__tests__/regulatory-intelligence-integration.test.ts` | Its persistence scenario uses PMA, which correctly refuses predictive CTD scoring as an unsupported device pathway. | Retain the original PMA request as a `COMPLETENESS_NOT_ASSESSED`/422 control that names `assessEstarFilingReadiness` and performs no DB work. A separate assessed NDA scenario exercises the original prediction INSERT/column assertions. The device pathway is never predicted or made into a CTD profile. |

The transmitting fixture's creator is supplied only by its database stub,
not by the request or a mocked independence verdict. Production creator lookup,
separation of duties, meaning validation, host list, audit trigger registry,
migration files and pathway policy are unchanged. Refusals may retain their
existing attempted-action audit; the controls prohibit transmission/release
records, rather than suppressing audit of a refused action.

## Actual receipts

- [Current-source RED](CI-CONTRACTS-RED.txt): **4 files failed; 21 failed /
  27 passed (48 cases), 14.30 seconds, exit 1**, before any owned test edit.
  Failures match the prior artifact's 1 host, 8 audit, 11 transmit and 1
  predictive-persistence failures. This is current execution evidence;
  the original `40697292` artifact alone is not used to assert a current fault.
- [Corrected GREEN](CI-CONTRACTS-GREEN.txt): **4 files / 53 cases passed,
  14.52 seconds, exit 0**. There are no skipped/omitted owned suites. The net
  increase is five cases: audit prerequisite refusal, two package-creator
  refusals, the additional authorship spelling and the explicit PMA refusal.
  The legitimate responsibility and NDA positives replace the obsolete
  positive preconditions while preserving their intended persistence checks.
- [Exact execution manifest](CI-CONTRACTS-MANIFEST.txt) verifies the four
  requested physical files against both receipt outputs, including all 53
  passing cases in the corrected run.
- [Scoped lint](CI-CONTRACTS-LINT.txt): **0 errors / 1 inherited warning**
  (`setImmediate` in the existing network stub). No suppression or baseline
  change. [Original-source count comparison](CI-CONTRACTS-STATIC.txt) verifies
  warning/error counts against the original canonical files and identical Git
  blobs for all seven relevant production guards/migrations; this is not a
  semantic TypeScript check.

Vitest runs use the repository's single fork, no parallel files and a 4-GiB
heap. Scoped `git diff --check` passes; only final blank lines are normalized
in the worker's text receipts, preserving failures, SQL and assertions.

## Limits

The ESG wire and database remain test boundaries; no agency endpoint is
contacted and no real filing is sent. Runtime AS2 construction/signing and the
production admission/refusal logic execute against fixture bytes and keys;
these tests do not establish live credentials, certificate trust, sender
qualification or regulatory receipt. The audit suite probes the real PGlite
catalog and registered migrations with minimum store DDL, not production
runtime-role privileges, RLS or every store's full schema. Prediction
persistence is asserted at the query seam; there is no new predictive
qualification or device-scoring support.

The control tower owns the expanded workflow manifest, builds, release gates
and whole-tree semantic TypeScript on the exact final GitHub source. No local
full compiler or broad-release GREEN is inferred here. D4 and D1–D10 remain
open, including live/staging, complete intended use, PQ and signed validation.
