# Roadmap item 3 — the filed artifact, retained and bound

Date: 2026-09-07. Branch `concept2cure-v2`. Roadmap item 3 of
`docs/handoff/HANDOFF_DEVICE.md` §6, all three parts.

| part | state |
|---|---|
| 1. Store the delivered eSTAR bytes immutably with their sha256 | **done** — §2 |
| 2. Make draft→filed a governed, signed transition bound to that hash, server-stamped | **done** — §5 |
| 3. Make the unplaced-export audit actually propagate failure | **done** — §3 |

## 1. What was wrong

`docs/reports/device-market-readiness-2026-09-07.md` §5, "Part 11 on the governed export":

> the delivered PDF is never retained anywhere (`510k-estar-routes.ts:1022` stores the
> inputs; `governedExportConsequence.ts:114, 162` only hashes and base64-encodes the
> output) … the unplaced-export path's "failure propagates" guarantee
> (`governedExportConsequence.ts:222–223`) calls `auditService.logAction`, which never
> rejects (`auditService.ts:399–405`).

Both are the same shape of defect: a guarantee written down, and nothing behind it.

## 2. The delivered eSTAR is retained before it is delivered

`POST /api/510k/estar/official` now admits the produced PDF into the program's governed
vault **before** the bytes reach the response, via
`server/services/pathway-engines/estar/estar-artifact-retention.ts`.

- **One ingest.** Retention calls `ingestVaultDocument` — the single implementation that
  admits a document into `vault.documents`, with its ownership guard, fail-closed byte
  write, hash-chained Part 11 audit row and placement proposal. This module supplies
  arguments; it stores nothing itself. A second storage path was never on the table: the
  ingest's own header explains why one would be two answers to what admission means.
- **Immutable, by content.** The version is `sha256-<first 16 of the delivered hash>`.
  `vault.documents` is unique on `(program_id, document_code, version)` and its upsert
  refuses to overwrite a row whose `content_hash` differs, so identical bytes are
  idempotent (same row, placement re-proposed) and different bytes are a **new version**,
  never a replacement. The version is the caller's own `delivered_artifact_sha256`
  truncated — the two check against each other by eye.
- **The stored hash must be the delivered hash.** If the vault reports a different
  `content_hash` than the bytes handed over, retention throws `RETAINED_HASH_MISMATCH`.
  Without that check the mismatch would sit under a version derived from the delivered
  hash, so both values would look right in isolation.
- **Failure withholds the file.** A retention that should have happened and did not throws
  `EstarRetentionError`; the route answers `500 ESTAR_NOT_RETAINED` with no
  `downloadable_output_ref` and without echoing the vault's internal code. Reporting
  `retained: false` beside a delivered submission PDF would reproduce the exact gap this
  closes, with a label on it.
- **The one honest `retained: false`** is structural: an export anchored to a legacy
  `fda510k_projects` row has no program uuid, so there is no program vault to retain into.
  That is stated in the response and the file is still delivered — it was never retainable,
  and refusing it would break a path that works.
- The retention record travels into the artifact-registry / audit metadata and back to the
  client beside the consequence (`withOfficialExtras`), so the governed record names the
  vault document, not just its hash. `ci:governed-export-consequence-shape` pins that the
  wrapper is a **superset** — every key the export-governance plane produced still reaches
  the client.

### The AV decision, stated plainly

The upload safety gate's AV half is an **ingress** control: it exists because the bytes in
hand were chosen by whoever made the request. The official eSTAR is produced in-process
from a template that ships in the image, filled with text from the tenant's own governed
records. Routing it through that gate unchanged would tie a working export to clamd —
`CLAMAV_HOST` is configured nowhere in this repository, and an unconfigured scanner is a
503 in production **by design** (AV-01, `docs/audit-2026-07/12-findings-register.md`).

So `assertUploadSafe` now takes an explicit `origin`. It defaults to `'upload'`, so every
existing caller keeps the fail-closed posture; `'platform-generated'` runs the magic-byte
signature check and skips the scan, and is logged each time. It reaches no HTTP schema —
the vault ingest route's zod object has no such field — so only a server-side call site can
name it.

## 3. "An export must never be delivered un-audited" is now true

`createAuditedUnplacedExport` awaited `auditService.logAction` and treated the absence of a
rejection as proof. `logAction` **never rejects**, by explicit policy — *"a persistence
failure is logged, never propagated: an audit-trail outage must not break the user action it
records"* — and resolves `{persisted: false, error}` instead.

That policy is right for an ordinary user action and wrong for this one: this path exists
precisely because the artifact registry cannot place the file, so the audit row is the only
record the export gets. The outcome is now inspected, and a delivery with no record is
refused (`UNAUDITED_EXPORT_REFUSED`, carrying the audit's own reason). Either log counts —
`audit_logs` is the queryable chain, the tamper-proof log is the immutable one, and one of
them is a record; neither is not.

**Why it went unnoticed** is in the tests: `estar-export-governance` mocked `logAction` as
`async () => undefined`, a shape the real service cannot produce. Two other suites carried
the same fake and are fixed here; the rest do not reach a path that reads the outcome.

## 4. Verification

Every check was seen failing on the case it exists to catch before it passed. For the route
wiring specifically, the three new cases were run against a stashed `510k-estar-routes.ts`:
3 failed, then 3 passed with the wiring restored.

| check | result |
|---|---|
| `server/services/pathway-engines/estar/__tests__/estar-artifact-retention.test.ts` | 8 passed (new) |
| `server/middleware/__tests__/uploadSafety.test.ts` | 11 passed (3 new, failing first) |
| `tests/services/governed-export-consequence.test.ts` | 11 passed (5 new, 3 failing first) |
| `tests/routes/estar-official-pdf.test.ts` | 28 passed (3 new, proven failing on the stashed route) |
| `tests/routes/estar-export-governance.test.ts` | 15 passed (1 new; the un-audited refusal at route level) |
| `server/services/pathway-engines/estar/__tests__/estar-submission-service.test.ts` | 11 passed (4 new for the signed filing, failing first) |
| `server/services/pathway-engines/estar/__tests__/estar-artifact-retention.test.ts` | 10 passed (2 more for the retained-artifact list) |
| `tests/routes/estar-submission-filing.test.ts` | 8 passed (new); 7 of 8 proven failing against the stashed route + service, the 8th being the unchanged-behaviour control |
| `client/.../__tests__/estarFilingSignature.test.tsx` | 4 passed (new); 4 of 4 proven failing against the stashed panel |
| vault + estar + part11 + middleware + `tests/routes` + `tests/services` + device golden journey | 165 files / 2052 passed |
| client suites (`mdx` + `v2`) | 276 files / 3334 passed |
| `npx tsc --noEmit` | clean |
| `ci:governed-export-consequence-shape`, `ci:fabricated-identity`, `ci:drizzle-tenant-scope`, `ci:session-scoped-rls-bypass`, `check:catalog-copy`, `ci:ectd-stubs`, ledger | all pass |

## 5. Filing is a signature

`PATCH /api/510k/estar/submissions/:id` moved a filing to `filed` with a **client-supplied**
`filedAt` (`z.coerce.date().optional()`), a free-text tracking number and no link to any
artifact. Three defects at once: a Part 11 record whose date is supplied by the party being
recorded is a backdating hole; "filed" pointed at nothing, so nobody could open what was
filed; and the most consequential act in the workflow required no signature at all.

**`filedAt` is server-stamped.** The field is gone from the request schema entirely, not
merely ignored. Recording a filing made elsewhere on an earlier date is an *import*, and an
import should not share a door with a lifecycle transition.

**The filing binds to the retained artifact.** The caller names the `vault.documents` id;
the server resolves it **org-scoped** and reads the `content_hash` **from that row**. The
client never supplies a digest, so a filing cannot claim bytes nobody stored. Two additive
columns hold it (`migrations/20260908b_estar_submissions_filed_artifact.sql`,
IF NOT EXISTS, before the final RLS sweep pair, per RULE 1).

**It is signed.** `applySignedFiling` runs the whole act on one transaction:

1. resolve the artifact — refused before anything is written if this org does not hold it;
2. `UPDATE … WHERE id AND organization_id AND status = <the status we validated from>` — a
   row that moved underneath matches nothing, which is a `NOT_FOUND`, not a signature
   attesting a transition that did not happen;
3. `recordGovernedAction` (the sha256-chained ledger pair);
4. `persistGovernedActionSignature` — the **single** write path into `electronic_signatures`
   — bound with a new, explicit basis `filed-estar-artifact-sha256`, and an `extraManifest`
   naming the document, so an auditor reading the manifest does not have to join a hash back
   to a document to learn what was filed.

Re-authentication runs **first** and only for this transition (§11.200, captured at signing
time, never reused from the session). What is recorded is what was actually verified:
`password+totp` and `secondFactorVerified: true` only when a token was presented — anything
else would be a false attestation on the signature row.

**On screen.** The one unlabelled "Filed" button is now "Sign and file…", which opens a form
asking for the retained eSTAR, a reason (≥ 8 characters), the §11.50 meaning, and the
credential. `GET /retained-artifacts` supplies the candidates, scoped by the same predicate
the write re-checks, so the picker can never offer something the signature would refuse. With
nothing retained the form says exactly that — you cannot knowingly sign a binding to nothing
— and a refusal keeps the form open with the **server's own** reason, because a mistyped
password should not cost the whole signing session. Every state goes through the shared
`ErrorState` / `EmptyState` primitives; the repo's own `dataGateContract` test caught the
first draft hand-rolling two alert panels.

## 6. What this does NOT do

- Retention stores what the platform produced. It does not make the artifact **complete** —
  0 of 112/140 attachment slots are still populated (roadmap item 4).
- Nothing here transmits anything (item 6, blocked on JM). A signed filing records that a
  sponsor filed; it does not send anything to FDA.
- Filings recorded before this change carry no binding. They are shown as
  "No eSTAR bound to this filing" rather than back-filled — a binding nobody made is not a
  binding.
- The unfaithful `logAction` fakes elsewhere in the suite are left alone; they pass because
  their paths do not read the outcome. A fake that cannot produce the real shape is a latent
  version of exactly this defect, and is flagged in HANDOFF §6 rather than fixed blind.
