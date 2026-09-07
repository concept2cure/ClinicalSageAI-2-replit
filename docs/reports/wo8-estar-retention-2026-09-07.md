# Roadmap item 3 — the filed artifact, retained and bound (parts 1 and 3 of 3)

Date: 2026-09-07. Branch `concept2cure-v2`. Roadmap item 3 of
`docs/handoff/HANDOFF_DEVICE.md` §6. Item 3 has three parts; this closes two of them.
Part 2 — the **signed** draft→filed transition — is specified in §5 below and is the next
slice, now that there is a retained artifact for it to bind to.

| part | state |
|---|---|
| 1. Store the delivered eSTAR bytes immutably with their sha256 | **done** — §2 |
| 2. Make draft→filed a governed, signed transition bound to that hash, server-stamped | **open** — §5 |
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
| vault + estar + middleware + `tests/routes` + `tests/services` + device golden journey | 163 files / 2031 passed |
| `npx tsc --noEmit` | clean |
| `ci:governed-export-consequence-shape`, `ci:fabricated-identity`, `ci:drizzle-tenant-scope`, `ci:session-scoped-rls-bypass`, `check:catalog-copy`, `ci:ectd-stubs`, ledger | all pass |

## 5. Part 2, specified — the signed filing

`PATCH /api/510k/estar/submissions/:id` moves a filing to `filed` with a **client-supplied**
`filedAt` (`advanceSubmissionSchema`: `z.coerce.date().optional()`), a free-text tracking
number, and no link to any artifact. Now that a retained document exists, the fix is:

1. **Server-stamp `filedAt`.** A filing tracked in the platform is stamped by the platform's
   clock. Recording a historical filing made elsewhere is an import, not a lifecycle
   transition, and should not share this door.
2. **Bind the transition to the retained artifact** — the `vault.documents` id plus its
   `content_hash` — verified org-scoped against the program, so the binding names bytes the
   platform actually holds rather than a hash the client typed.
3. **Sign it** through `persistGovernedActionSignature`
   (`server/services/part11/signature-persistence.ts`), the single write path into
   `electronic_signatures`, which exists for exactly this case: "domain endpoints that
   already hold the content digest of what they persisted". The signature row commits on the
   same transaction as the status change.

Two additive columns on `estar_submissions` (`filed_artifact_document_id`,
`filed_artifact_sha256`). Per RULE 1 the migration is additive and `IF NOT EXISTS`-guarded,
and goes in before the final RLS sweep pair.

## 6. What this does NOT do

- Retention stores what the platform produced. It does not make the artifact **complete** —
  0 of 112/140 attachment slots are still populated (roadmap item 4).
- Nothing here transmits anything (item 6, blocked on JM).
- The unfaithful `logAction` fakes elsewhere in the suite are left alone; they pass because
  their paths do not read the outcome. A fake that cannot produce the real shape is a latent
  version of exactly this defect, and is flagged in HANDOFF §6 rather than fixed blind.
