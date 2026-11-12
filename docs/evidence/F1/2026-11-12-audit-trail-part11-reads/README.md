# F1 — the audit trail and Part 11 reads (GA readiness map, lane L5) — 2026-11-12

The GA readiness map (`docs/evidence/GA-READINESS/2026-11-10/`) lists four open items in lane L5. This file records
each as it is fixed.

## What already exists

- The screen: `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` (`AuditTrail`). It reads
  `GET /api/audit-trail/ledger`, lists the entries, filters them by kind, searches them, states two chain verdicts
  and offers the signed export.
- The route: `server/routes/audit-trail-ledger.routes.ts` (held by another session for event names; not changed
  here). It merges both audit stores newest first, takes `limit` (default 200, at most 1,000) and returns
  `meta.chain`, a verdict computed over the whole chain on the server, independent of the entries it lists.
- The signed export: `GET /api/audit/export/signed` (`server/services/audit/signedAuditExport.ts`), read from the
  stores, with its own 50,000-row ceiling and a `truncated` flag.
- Tests of the screen: `client/src/concept2cure/v2/__tests__/auditTrail*.test.tsx`, `anaOperatesAuditTrail.test.tsx`,
  `anaSeesScreens.test.tsx`.

- The seal check: `POST /api/audit/export/verify` in `server/routes/audit-trail-routes.ts`, over
  `verifySignedAuditExport` (`server/services/audit/signedAuditExport.ts`). It checks a signed audit export and a
  compliance report alike. Its one caller in the product is "Verify a saved report" on the Compliance reports
  screen (`client/src/concept2cure/v2/surfaces/ComplianceReportsVerify.tsx`); the OQ step OQ-RPT-14 calls it too.
- The gates its sibling routes already use: `requireAuditOrg` (same file) and `requireAuditReader`
  (`server/services/audit/audit-api-authority.ts`: owner, administrator, manager, platform administrator).
- The chained audit writer for exports: `server/services/audit/audited-export.ts` over `writeChainedAuditRow`.
- The same organisation check on a saved snapshot, for conversion:
  `server/services/audit/compliance-reports/snapshot-export.ts` (`REPORT_SNAPSHOT_TENANT_MISMATCH`).

Nothing new was added: no route, parameter, screen or table.

## GA-D5-05 — the screen read the newest 200 entries and presented them as the whole trail

**Before.** The screen called the route with no `limit`, so it received at most 200 entries. Its heading said
"200 entries", its filters counted those 200, and its search read those 200. A signature older than the newest 200
entries was not in the list, so "E-sign" could not find it. The screen's summary for AnA stated the same number as
the total.

**Fix (screen only).** The screen now asks for the route's full window (`?limit=1000`). When a full window comes
back, it no longer states a total: the heading reads "Newest 1,000 entries shown", a status line says that any
older entries are not listed, that the filters, their counts and the search read the listed entries only, that the
chain verdicts cover the whole trail, and that the signed export is read from the ledger and not from the list.
AnA's summary says the same and gives no total (`totalEntries: null`, `listIsNewestOnly: true`).

**Red first.** Two tests were added to `auditTrailChainVerdict.test.tsx` and failed on the old code:

```
× finds an e-signature that is older than the newest 200 entries
  → Unable to find an element with the text: /300 entries — hash-chained/
× says so when the trail is longer than the window: the count is not stated as the whole trail
  → Unable to find an element with the text: /Newest 1,000 entries shown — hash-chained/
```

After the fix: the audit-trail suites and `anaSeesScreens` pass (5 files, 50 tests). Three tests keyed on the exact
URL now name `?limit=1000`.

**In the running app** (local GA database, signed in as the administrator). The organisation's trail was 122
entries; 100 real settings changes, each with its reason, took it to 224.

- The route's default read (what the screen used to ask for): 200 entries.
- The screen now requests `/api/audit-trail/ledger?limit=1000` and receives 224. Heading: "224 entries —
  hash-chained — append-only". The chain banner beside it: "verifies intact over 224 chained entries". On the old
  read the heading would have said 200 beside a verdict over 224. Screenshot: `audit-trail-224-entries.png`.
- No status line is shown, because the list is the whole trail.

**Not shown in the running app.** This database has no e-signature rows (`electronic_signatures` is empty), so
"E-sign finds the seeded signatures" was checked in the component test only, not against the biotech demo seed.
The more-than-1,000 case was also checked in the component test only.

**Left for the route's holder.** A trail longer than 1,000 entries still cannot be filtered or searched past the
newest 1,000 from this screen. That needs a cursor or a `kind` parameter on the route, which is another session's
file. The screen now says so plainly in place of implying the list is complete.

## GA-D6-03 — the seal check had no role gate, no organisation check and no audit row

**Before.** `GET /api/audit/export` and `/audit/export/signed` required the session's organisation and the
audit-reader role. `POST /api/audit/export/verify`, in the same file, required neither. Any signed-in session, a
viewer included, could put any package to the platform's seal key and be told whether it was genuine, including a
package sealed for another organisation. Nothing recorded that the check was made.

**Fix.**

1. The route applies `requireAuditOrg` and `requireAuditReader`, as the exports beside it do.
2. The package must be one sealed for the session's organisation. The manifest states it (`queryFilters.organizationId`
   on a signed audit export, `organizationId` on a compliance report; `manifestOrganizationId` in
   `audited-export.ts`). Another organisation's package, or one that names none, is refused with
   `403 AUDIT_EXPORT_TENANT_MISMATCH` and no verdict.
3. The verdict is sent only after one row on the organisation's chain records it: action `audit.export_verify`,
   the export id, the data hash, valid or not, the errors and the key (`recordExportVerification`). When the row
   cannot be written the answer is `503 AUDIT_EXPORT_VERIFICATION_NOT_RECORDED` and no verdict.
4. The verify instruction sent with each report now names who can use the route ("a signed-in administrator or
   manager of the organisation"); it said "member".

**Limit, stated.** On a version-2 manifest the organisation is under the seal, so relabelling another
organisation's package as one's own makes it invalid (tested). A version-1 manifest (issued before the ledger L55
fix) sealed its top-level fields only, so there the organisation is stated and not sealed, like every other
nested claim of that version. Refusing version 1 outright would stop already-issued exports from verifying.

**Red first.** `server/routes/__tests__/audit-export-verify-gate.test.ts`, 15 cases; 9 failed on the old route:

```
× a member is refused before the seal key is used        → expected 200 to be 403
× a viewer is refused before the seal key is used        → expected 200 to be 403
× a session whose organisation is 0 is refused           → expected 200 to be 403
× a signed audit export sealed for another organisation  → expected 200 to be 403
× a compliance report sealed for another organisation    → expected 200 to be 403
× a package that names no organisation is refused        → expected 200 to be 403
× a passing check writes one row on the chain            → expected "vi.fn()" to be called 1 times, but got 0 times
× a failing check is recorded as failing
× when the row cannot be written, no verdict is sent     → expected 200 to be 503
```

After: that file, `audit-compliance-reports`, `audit-trail-read-gate`, `audit-export-tenant-scope` and every suite
under `server/services/audit`: 45 files, 548 tests, all pass. Two cases in `audit-export-tenant-scope.test.ts`
posted manifests that named no organisation; they now name the session's.

**In the running app** (local GA database; two organisations). The administrator of organisation 2 ran the user
access review; each role then sent that saved report to the route:

| Who | Answer |
|---|---|
| administrator (org 2) | 200, valid |
| manager (org 2) | 200, valid |
| member (org 2) | 403 `AUDIT_READ_RESTRICTED` |
| viewer (org 2) | 403 `AUDIT_READ_RESTRICTED` |
| administrator of organisation 6 | 403 `AUDIT_EXPORT_TENANT_MISMATCH` |
| administrator (org 2), one character of the data changed | 200, not valid: "Data hash mismatch" |
| administrator (org 2), organisation 6's own report | 403 `AUDIT_EXPORT_TENANT_MISMATCH` |
| administrator of organisation 6, its own report | 200, valid |

The audit trail of organisation 2 then listed each check, with who made it and the answer, for example
"Sarah Chen — Checked the seal of COMPLIANCE-REPORT-1794461285095-ad1ea1b2: it verifies" and
"JM Smith — Checked the seal of …: it does not verify".

On the Compliance reports screen, "Verify a saved report": the organisation's own saved report shows "The saved
report verifies: its data matches its seal" (`verify-own-report.png`); organisation 6's file shows "This file was
not sealed for your organisation, so it is not checked here." (`verify-other-organisation-refused.png`).

**Not run.** The OQ protocol (OQ-RPT-14) was not executed here; it runs the report and the check as one
audit reader of one organisation, which the gate admits.

## GA-D5-02 — signatures by target named the binding's basis, not the digest; the chain verdict's readers

**What already exists.** `GET /api/part11/signatures/by-target` and `GET /api/part11/signatures/:documentId`
(`server/routes/part11-compliance.ts`) serve the §11.50 manifestation rows. `electronic_signatures.bound_payload_digest`
(added by `migrations/20260629_orchestrator_awaiting_signature_status.sql`) is the §11.70 binding: the SHA-256 of
what was signed. `binding_basis` names how it was computed. The organisation's chain verdict a customer can reach
is the Audit trail integrity attestation, `GET /api/audit/reports/audit-trail-integrity`; the OQ already reads it
(`tests/validation/lib/chain-verdict.mjs`, OQ-001 v0.12, OQ-002 v0.17).

**Fix.** Both reads now select `bound_payload_digest`. A reader of a signature can see what it is bound to, not
only how; OQ-CMC-14 noted that "no product read serves the bound digest" and read it from the database instead.

**Red first.**

- `server/routes/__tests__/part11-signatures-by-target.test.ts`: two new cases failed on the old SQL ("the read
  does not select the bound digest"). After: 82 tests across the `part11*` route suites pass.
- `tests/db/review-route-qms-rr2.dbtest.ts`, against PostgreSQL 16 as the non-owner runtime role with
  `RLS_ENFORCE=on`: the new assertion (both signatures of a two-approver QMS document carry a 64-hex digest)
  failed on the old route, `expected [ false, false ] to deeply equal [ true, true ]`, and passes with the fix;
  7 of 7 tests pass.

**The chain verdict route.** `GET /api/c2c/actions/verify-chain` stays claimed by no launch surface and so is
refused in production; its readers now read the attestation instead. Two pointers remain, both outside this
lane: the header of `server/routes/audit-trail-ledger.routes.ts` (line 53, held by another session for event
names) still calls verify-chain "the authoritative verdict", and `scripts/demo/launch-demo/packs/mdx.mjs:485`
reads it. Recorded for their holders in `.design/claude-convergence/COORDINATION.md`.
