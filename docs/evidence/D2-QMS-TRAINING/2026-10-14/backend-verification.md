# Backend verification — personal QMS acknowledgement

2026-10-14 UTC. Contract: [QMS_PERSONAL_TRAINING.md](../../../architecture/QMS_PERSONAL_TRAINING.md).
Final results cover the local working snapshot based on merged HEAD
`695a906ebab6c7ce7fa8d8f81f5e4149b23f380e`, including the bounded safe-error repair.
Earlier red proofs were captured on the preceding local implementation snapshots.
They are focused backend results, not a hosted deployment or whole-repository verdict.

## Final results

**149/149 tests passed across seven suites.** The exact suite paths and counts are:

| Suite | Passed |
| --- | ---: |
| `server/services/qms/__tests__/training.pglite.integration.test.ts` | 35 |
| `server/services/qms/__tests__/training-controlled-text.pglite.integration.test.ts` | 34 |
| `server/routes/__tests__/qms-personal-training.test.ts` | 21 |
| `server/routes/__tests__/qms-legacy-api-retired.test.ts` | 18 |
| `server/routes/__tests__/qms-document-approval-signature.test.ts` | 18 |
| `server/services/qms/__tests__/document-approval-signature.test.ts` | 8 |
| `server/routes/__tests__/mdx-qms-retire.test.ts` | 15 |

Selected raw verdicts, with exact local scratch log filenames:

```text
/workspace/scratch/qms-training-validation/final-seven-backend-safeerror-private.log
Test Files  7 passed (7)
Tests  149 passed (149)
Duration  34.83s
```

Strict ESLint passed with zero warnings for the five new services, canonical
document-approval service, three affected native/legacy route tests, and both
PGlite test files. The existing `mdx-qms.ts` has zero errors and its same two
inherited warnings (`max-lines` and unrelated handler `complexity`).
`git diff --check` passed. Full typecheck/build and hosted evidence belong to
the integration report.

## Failures demonstrated before repair

The logs below are private local run artifacts. Only selected test verdicts
are reproduced here; database configuration, credentials and full logs are omitted.

| Proof | Before-repair verdict and exact log | After repair |
| --- | --- | --- |
| Native personal acknowledgement contract | `Tests  11 failed (11)` — `/workspace/scratch/qms-personal-training-route-red.log` | Strict own-person input, verified reader context, duplicate receipt, audit failure and uncertain COMMIT cases pass. |
| Existing PATCH had no controlled-text persistence | `Tests  1 failed \| 11 passed (12)` — `/workspace/scratch/qms-controlled-text-route-red.log`; save returned 422 instead of 200 | Exact text save, stale digest, actual viewer standing, mixed fields, missing request client and rollback/readback cases pass. |
| Read-only posture hid an existing own receipt | `Tests  1 failed \| 33 skipped (34)` — `/workspace/scratch/qms-training-validation/read-only-receipt-before-private.log` | Existing receipt/text remain readable; new acknowledgement stays 403 with no additional record or audit. |
| Actual text writer could approve their own revision | `Tests  7 failed \| 1 passed \| 25 skipped (33)` — `/workspace/scratch/qms-training-validation/contributor-sod-before-private.log`; canonical approval resolved instead of refusing | Actual writer is refused before approval mutation; uninvolved signer remains permitted. |
| Canonical native approval ignored contributor attribution | `Tests  4 failed \| 14 skipped (18)` — `/workspace/scratch/qms-authorship-native-before.log` | Contributor refusals, malformed attribution and truthful null-original-author two-person manifest pass. |
| Native creation accepted fictional contributor metadata | `Tests  1 failed \| 18 skipped (19)` — `/workspace/scratch/qms-authorship-create-before.log`; it reached the poisoned database collaborator | Reserved metadata now returns 422 before database/audit calls. |
| Uncertain COMMIT responses reflected custom underlying text/code | `Tests  2 failed \| 19 skipped (21)` — `/workspace/scratch/qms-uncertain-error-native-before.log`; both responses exposed the injected diagnostic | Both paths retain 503/reload recovery using fixed safe text and the literal `QMS_TRAINING_COMMIT_UNCONFIRMED` code; custom message/code are absent. |

The exact error-leak guard also failed before repair with `mdx-qms.ts — 0 → 2`
at its two 503 paths (`/workspace/scratch/qms-uncertain-error-leaks-before.log`).
After the static responses, the unchanged guard/baseline passes:

```text
/workspace/scratch/qms-uncertain-error-leaks-after.log
[ci:server-error-leaks] OK — 10 baselined site(s) across 10 file(s); no file gained one.
```

## Executed SQL and security boundary

Both PGlite suites extract the actual `qms_documents` and
`qms_training_records` CREATE blocks, including constraints, from
`migrations/20260511_qms_and_labeling.sql`. They execute the production
training/save SQL against those tables. Account, organization and membership
support tables are minimal test fixtures with the real status/role semantics;
they are not a production database deployment.

The audit collaborator writes an actual proof row using the supplied transaction
client, then deliberately issues invalid SQL after insertion. Assertions verify
that both the training record or controlled-text change and the audit proof roll
back. Production uses canonical `writeChainedAuditRow` on that same request-pinned
client. Native route tests poison pooled access and verify the request client is
used; failures cannot fall back to the shared pool. COMMIT-response loss is
simulated after persistence: the response is unconfirmed, and rereading proves
the saved receipt/text rather than claiming rollback. The native response uses
fixed recovery text and a stable code even if the typed exception contains a
custom underlying diagnostic or code.

These tests prove SQL transaction coupling and native request-client use. They
mock audit-chain cryptography and electronic-signature persistence; they do not
independently certify cryptographic chain validity, production RLS or a live
credential ceremony. The approval route suite exercises the canonical signer
ceremony with controlled account/credential collaborators.

## Canonical contributor approval proof

The SQL regression has creator 10, actual text writer 11 and uninvolved signer
12. Writer 11 saves through `saveQmsControlledText`, the document is sent for
review, and the real `approveQmsDocumentSigned` refuses writer 11 with
`SELF_APPROVAL`. The document remains unchanged and no approval UPDATE,
governed-action proof, approval audit proof or signature proof is written.
Signer 12 then succeeds through the same canonical gate with the real canonical
content digest covering the protected contributor history.

Additional cases retain multiple actual writers and original `author_id`, bind
contributors into audit details and the approval manifest, reject five malformed
authorial blocks including an empty list, and reject identities supplied through
the strict controlled-text body. Native approval also proves enforcement when
the original author is null. The existing revision SQL preserves this metadata
through its outer merge; it does not erase contributor history.

The acknowledgement suites additionally cover actual active membership/account
standing, foreign documents/actors, readable released bodies versus outlines,
approval stamp/digest parity, version/digest staleness, expiry, duplicate retries,
retained snapshots/history, and distinct current-member coverage. Historical
unbound or unreadable records remain unavailable rather than becoming verified
acknowledgements.

## Reproduce

From the repository root with Node 22.23.3:

```sh
npx vitest run \
  server/services/qms/__tests__/training.pglite.integration.test.ts \
  server/services/qms/__tests__/training-controlled-text.pglite.integration.test.ts \
  server/routes/__tests__/qms-personal-training.test.ts \
  server/routes/__tests__/qms-legacy-api-retired.test.ts \
  server/routes/__tests__/qms-document-approval-signature.test.ts \
  server/services/qms/__tests__/document-approval-signature.test.ts \
  server/routes/__tests__/mdx-qms-retire.test.ts --reporter=dot
```

## Published Semgrep blocker qualification

The blocking hosted scan of
`a80d2fa65784714a1aa97b367b8042000c830ed6`, against baseline `10f4e4557`,
reported exactly two new
`javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp`
findings: the canonical-DDL extraction helpers in
`training.pglite.integration.test.ts:82` and
`training-controlled-text.pglite.integration.test.ts:65`.
The inspected helper blobs match that published commit. Their callers use only
the two fixed QMS table names; no request input reaches these test helpers.

Each helper now selects between two regex literals instead of interpolating its
argument into `new RegExp`. The tests still read the actual migration. An
independent Node 22 comparison of the original cooked constructor patterns and
new literals proves byte-identical extraction in all four cases: both helpers
times `qms_documents` and `qms_training_records`. No production source,
suppression, rule or scanner baseline changed for this repair.

The local replay uses the exact workflow image
`semgrep/semgrep:1.177.0@sha256:acaac22ffc7b7cc5926de0751b223bce0b2491c33d18422fa72f632c78d81198`
with `--config=p/default --config=p/ci --metrics=off --error`. Both runs scan
`server/services/qms`, `server/routes/mdx-qms.ts`, the native personal-training
route test, `client/src/concept2cure/quality` and `shared/qms/training.ts`.
The runtime keeps its configured proxy and mounts the combined system CA bundle
read-only for Python trust; TLS verification remains enabled.

```text
/workspace/scratch/qms-semgrep-local/qms-scan.json
version: 1.177.0; findings: 2; exit: 1

/workspace/scratch/qms-semgrep-local/qms-scan-after.json
version: 1.177.0; findings: 0; exit: 0

/workspace/scratch/qms-training-validation/final-literal-DDL-suites-private.log
Test Files  2 passed (2)
Tests  69 passed (69)
Duration  24.73s
```

Both scanner runs retain the same four nonblocking `PartialParsing` warnings
(three UI syntax locations and one test import/type annotation). This is a
finding-free targeted replay, not a claim of complete parser coverage or a
whole-repository scan. Strict ESLint of both edited test files passes with zero
warnings (`/workspace/scratch/qms-semgrep-local/fixed-regex-lint-private.log`),
and `git diff --check` passes. These 69 cases are the two SQL suites already
listed above, not additional tests added to the 149-case total.

## Publication SQL gate follow-up

The repository SQL interpolation gate refused the optional lock suffix in the
new membership query. It was replaced with two complete fixed SQL literals,
with no baseline or suppression change. The read query remains unlocked; the
mutation query retains `FOR SHARE OF ou, u, o`; both bind organization/user as
`$1`/`$2`. The gate changes from exit 1 to exit 0, and 88 affected canonical SQL
and native training tests pass across three files. A separate scratch-only
PGlite trace passes 2/2 and confirms these exact lock/parameter semantics and
foreign-member refusal. See the final selected integration verdicts.
