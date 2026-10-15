# P1-31 (DP-34): one QMS write API, and a viewer cannot write through it

Security review 2026-09-24, register row DP-34 (Medium, exploitable). Remediation
plan row P1-31. Launch row D6. Date 2026-10-01, working tree on `747f7c68`.

## What was wrong

`/api/qms/*` (`server/routes/qms.ts` over `server/services/qms/qms.service.ts`,
mounted by `server/bootstrap/register-document-routes.ts:271`) was a second QMS
write API behind `authenticateToken` alone. Any authenticated member of an
organization, a `viewer` included, could:

- supersede an effective controlled document (`POST /documents/:id/transition {to:'superseded'}`):
  no reason, no signature, no `superseded_by_id`;
- requalify or revoke a supplier (`POST /suppliers/:id/approval`): no audit row;
- disposition nonconforming product (`POST /nonconformances/:id/disposition`): no
  audit row, and an omitted rationale silently kept the previous one;
- create documents, suppliers, audits, management reviews and NCRs, and record
  training for any `userId` it named.

At `747f7c68` the retire and approve transitions on that door were already
refused (422), by P1-29 / DP-32 (`59be4566`, 2026-09-26) and the new-code audit
of 2026-09-24. So the item's "a viewer's transition to retired succeeds today"
is no longer true at HEAD: the red run shows 422 for `to: 'retired'`. The
supersede, supplier and disposition writes did succeed for a viewer, and the
red run shows the row changing.

The canonical twins on `/api/mdx/qms` (`server/routes/mdx-qms.ts`) audit every
one of those writes, but the supplier, internal-audit, management-review and
nonconforming-product writes there carried no role gate either. Deleting the
legacy door alone would have left "a viewer can requalify a supplier" true.

## Who called /api/qms

`grep -rn "/api/qms/" client/src` (excluding `/api/mdx/qms`): one hit,
`client/src/lib/__tests__/audit-row-not-persisted.test.ts:145`, a unit test of
`apiRequest` that stubs `fetch` and uses the path as an arbitrary URL. It never
reaches a server and needs no change. No product code, script or e2e test
calls `/api/qms`. `docs/reports/orphan-endpoints-latest.json` lists all 19 of
its routes as orphans. The only server-side caller was
`server/routes/__tests__/qms-effective-only-by-signature.test.ts`, now moved to
the canonical door (below). `qms.service.ts` had one importer, `routes/qms.ts`.

## What is true now

1. `server/routes/qms.ts` and `server/services/qms/qms.service.ts` are deleted,
   and the import and mount are removed from `register-document-routes.ts`.
   The comment left at the mount names the replacement. Through the production
   registrar, every `/api/qms/*` request, read or write, viewer or manager,
   reaches nothing (404) and writes nothing.
2. On `/api/mdx/qms`, `POST /qms/suppliers`, `PATCH /qms/suppliers/:id`,
   `POST /qms/internal-audits`, `PATCH /qms/internal-audits/:id`,
   `POST /qms/management-reviews`, `POST /qms/nonconforming` and
   `PATCH /qms/nonconforming/:id/disposition` carry `requireEditorAccess`
   (`GOVERNED_WRITE_ROLES`: owner, admin, manager, member). The document writes
   have carried it since `6582e3a3`. A viewer gets a 403 before any query, and
   no audit row is written for a refused write. Editors' writes still succeed
   and are audited.
3. `POST /qms/documents/:id/training-ack` stays open to every member. It
   records the caller's own read-and-understood attestation, not a governed
   change, and a viewer must be able to acknowledge a procedure.

History search before deleting, as CLAUDE.md requires:
`git log --all --diff-filter=D -- 'server/routes/*qms*' 'server/services/qms/*' 'server/services/*qms*' 'client/**/*qms*' 'client/**/*Qms*'`
returned nothing. There are no earlier generations of this router.

### Each deleted route and its replacement (all in `server/routes/mdx-qms.ts`)

| Deleted `/api/qms` route | Canonical route on `/api/mdx` | Gate |
|---|---|---|
| `GET /documents`, `GET /documents/:id` | `GET /qms/documents`, `GET /qms/documents/:id` | read |
| `POST /documents` | `POST /qms/documents` | editor |
| `POST /documents/:id/transition` `draft`/`in_review` | `PATCH /qms/documents/:id {status}` | editor |
| `… transition` `effective` (already refused) | `POST /qms/documents/:id/approve` | e-signature + signing authority |
| `… transition` `retired` (already refused) | `POST /qms/documents/:id/retire` | editor + e-signature |
| `… transition` `superseded` | `POST /qms/documents/:id/revise` (reason required; opens the next version) | editor |
| `POST /training` | `POST /qms/documents/:id/training-ack` (the caller's own record; recording training *for another user* is deliberately not reproduced) | member |
| `GET /training/compliance` | `GET /qms/training/compliance` | read |
| `GET`/`POST /suppliers` | `GET`/`POST /qms/suppliers` | editor (new) |
| `POST /suppliers/:id/approval` | `PATCH /qms/suppliers/:id` | editor (new), audited |
| `GET`/`POST /audits` | `GET`/`POST /qms/internal-audits` | editor (new) |
| `GET`/`POST /management-reviews` | `GET`/`POST /qms/management-reviews` | editor (new) |
| `GET`/`POST /nonconformances` | `GET`/`POST /qms/nonconforming` | editor (new) |
| `POST /nonconformances/:id/disposition` | `PATCH /qms/nonconforming/:id/disposition` | editor (new), audited |
| `GET /summary` | `GET /qms/readiness` | read |

What proves the replacements are reachable:
`server/routes/__tests__/qms-legacy-api-retired.test.ts` (editor and viewer paths
on the twins), `qms-governed-writes-audited.test.ts`, `mdx-qms-retire.test.ts`,
`qms-document-approval-signature.test.ts`, `mdx-qms-readiness.test.ts`. The
launch QMS client (`client/src/concept2cure/quality/hooks.ts`, `SopRegister.tsx`)
calls only `/api/mdx/qms`.

## Red / green

| Case | Red (`747f7c68`, before) | Green (after) |
|---|---|---|
| viewer `POST /api/qms/documents/11/transition {to:'retired'}` | 422 (P1-29 refusal; door mounted) | 404, row unchanged, 0 writes |
| viewer `… {to:'superseded'}` on an effective SOP | **200**, row became `superseded` | 404, row `effective`, 0 writes |
| viewer `POST /api/qms/suppliers/12/approval {revoked}` | **200**, row `revoked`, **0 audit rows** | 404, row `approved`, 0 writes |
| viewer `POST /api/qms/nonconformances/13/disposition` | **200**, row `use_as_is`, **0 audit rows** | 404, row `pending`, 0 writes |
| manager `… transition {to:'superseded'}` | 200 | 404 (the door is gone, not narrowed) |
| `GET /api/qms/{documents,suppliers,nonconformances,summary}` | 200 | 404 |
| viewer `PATCH /api/mdx/qms/suppliers/12 {revoked}` | **200**, row `revoked` | 403, row `approved`, 0 writes, 0 audit rows |
| viewer `PATCH /api/mdx/qms/nonconforming/13/disposition` | **200** | 403, unchanged |
| viewer `POST /api/mdx/qms/{suppliers,nonconforming,management-reviews}` | 201 | 403 |
| viewer `POST /api/mdx/qms/internal-audits` / `PATCH …/14` | 201 / **200**, audit closed | 403 / 403, unchanged |
| viewer `POST /api/mdx/qms/documents/11/retire` | 403 | 403 |
| manager `PATCH /api/mdx/qms/suppliers/12`, audited | 200 | 200, `mdx.qms.supplier.update` row |
| member `PATCH …/nonconforming/13/disposition`, audited | 200 | 200, `mdx.qms.nonconforming.disposition` row |
| manager `PATCH /api/mdx/qms/documents/11 {in_review}` from draft | 200 | 200 |
| viewer `POST /api/mdx/qms/documents/11/training-ack` | 201 | 201 |

The `/api/qms` half runs through the production registrar
(`registerDocumentRoutes`), not a hand-built app, because the defect was a
mount. Red: 13 failed, 5 passed (`red/qms-legacy-api-retired.red.txt`). Green:
18 passed (`green/qms-legacy-api-retired.green.txt`).

**Making the check fail on the canonical gate:** removing `requireEditorAccess`
from `PATCH /qms/suppliers/:id` and `PATCH /qms/nonconforming/:id/disposition`
fails exactly those two cases (200 instead of 403). The run is in
`green/mutation-canonical-gate-removed.txt`; the file was restored afterwards.

`qms-effective-only-by-signature.test.ts` was the only `/api/qms` caller. Its
three legacy-door cases now ask the canonical edit: `PATCH` with
`status: effective | retired | superseded` is refused 422 with no write, and a
draft still goes to review. 10 passed.

Sibling suites: 15 files, 204 tests passed (`green/qms-suites.green.txt`). The
run covers every mdx-qms route test, the AnA QMS tool tests, the launch-scope
gate, the bundle-reachability test and the client `apiRequest` test.

## Gates

| Gate | Result |
|---|---|
| `ci:unreferenced-modules` | OK, 86 (baseline 86): the deletion orphans nothing |
| `ci:server-error-leaks` | OK; 1 site fixed since baseline (the deleted `qms.ts`) |
| `ci:tenant-resolvers` | OK; `server/routes/qms.ts` now listed as a stale baseline entry |
| `ci:route-ownership-matrix:check` | passed |
| `ci:discarded-audit-write` | **Crashes (ENOENT) on the live working tree**, because `git ls-files` still lists the deleted file until the deletion is staged. With the deletion staged in a *scratch copy* of the index (the repository index was not touched), it passes: `no new occurrences`, 2 files below baseline. See `green/gate-discarded-audit-write.txt`. The control tower's commit stages the deletion, and the gate then passes. |
| ESLint, changed files | no change in counts against HEAD; the new test has 0 errors and 0 warnings |

## Commands

```
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/routes/__tests__/qms-legacy-api-retired.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/routes/__tests__/qms-effective-only-by-signature.test.ts \
  server/routes/__tests__/qms-governed-writes-audited.test.ts server/routes/__tests__/mdx-qms-retire.test.ts \
  server/routes/__tests__/qms-document-approval-signature.test.ts server/routes/__tests__/qms-changes.test.ts \
  server/routes/__tests__/qms-change-approval-signature.test.ts server/routes/__tests__/mdx-qms-readiness.test.ts \
  server/middleware/__tests__/launch-scope-api-gate.test.ts server/bootstrap/__tests__/routes-reach-the-bundle.test.ts \
  client/src/lib/__tests__/audit-row-not-persisted.test.ts server/services/ana/__tests__/ana-cannot-sign.test.ts \
  server/services/ana/__tests__/qms-vault-audit-atomicity.contract.test.ts \
  server/services/ana/__tests__/revise-qms-document-role.test.ts server/services/ana/__tests__/qms-change-tools.test.ts
npm run ci:unreferenced-modules; npm run ci:server-error-leaks; npm run ci:tenant-resolvers
npm run ci:route-ownership-matrix:check; npm run ci:discarded-audit-write
```

## Residuals (not closed here)

- **Change control on `/api/mdx/qms` has no role gate.** `POST /qms/changes`,
  `PATCH /qms/changes/:id`, `POST /qms/changes/:id/transition`,
  `DELETE /qms/changes/:id`, and `POST`/`DELETE /qms/changes/:id/links[/:linkId]`
  run for a viewer. The approve step is a signature with its own signing
  authority check. This is outside DP-34, which names the `/api/qms` twins, and
  `qms-changes.test.ts` has no role harness, so gating these routes needs its
  own red-first change. A new register row is proposed below.
- Three baselines carry a stale `server/routes/qms.ts` entry:
  `scripts/ci/discarded-audit-write-baseline.json` (`"server/routes/qms.ts": 2`),
  `scripts/ci/server-error-leaks-baseline.json` (`"server/routes/qms.ts": 1`) and
  `scripts/ci/tenant-resolvers-baseline.json` (`"server/routes/qms.ts"`). Each
  gate tolerates a stale entry, and the baselines can only shrink. Remove the
  three lines by hand, or let the next sanctioned baseline regeneration drop them.
- `docs/reports/orphan-endpoints-latest.json` and
  `docs/evidence/D2-API-SCOPE/2026-09-25/stage3-route-inventory.json` still list
  the 19 `/api/qms` routes. Both are generated reports, not gates.
- No migration was added, so the migration manifest needs no regeneration.
