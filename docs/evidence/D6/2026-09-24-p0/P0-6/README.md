# P0-6 — cross-tenant file read by predictable name (IAM-07, High)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-07. **Plan item:** P0-6.
**HEAD at red:** `dac69d76`.

## What was wrong

`GET /api/concept2cure/documents/download/:filename` (`server/routes/c2c/exports.ts`) resolved
`generated_documents/<name>` and streamed it. The router is behind `authenticateToken`, `tenantContextMiddleware`
and `requireOrganizationContext`, and the handler resolved the organization for its provenance row — but never
used it to decide what to serve. `POST /api/document-understanding/analyze`, `/extract-tables` and
`/extract-form-fields` (`server/routes/document-understanding.ts`) took a `filePath` from the body and read it if
`resolveDocumentPath` (`server/utils/document-file-roots.ts`) placed it under `uploads`, `exports`,
`generated_documents`, `csrs` or `ectd`; the resolver had no notion of an organization, so `uploads/org-<other>/…`
and any generated file resolved for any authenticated tenant.

The files were guessable. `documents.generate_docx` (`server/services/tools/index.ts`) wrote every tenant's output
into the one flat `generated_documents/` directory as `<Title>_<type>_<YYYYMMDD>.docx` plus a `.source.json`
sidecar, with a default-flag `writeFile`: two tenants generating "Clinical Overview" on the same day produced the
same name, the second write destroyed the first tenant's document, and the download route handed the survivor to
whoever asked by name. No table records generated files, so nothing could have been consulted for ownership.

## What is true now

- `resolveDocumentPath(input, { organizationId })` confines a path under a tenant-owned root (`uploads`, `exports`,
  `generated_documents` — `TENANT_OWNED_ROOTS`) to `<root>/org-<id>/`, using `isPathWithin` (so `org-77` is not
  inside `org-7`). Another tenant's prefix, a legacy flat file with no prefix, and an escape all return the same
  `null`. An organization that is given but unusable (0, negative, NaN, non-numeric — `usableOrgId`) refuses
  everything. `csrs` and `ectd` are left as before: `csrs/` is a checked-in set of public CSR synopses and nothing
  in the server writes a per-tenant tree under either root, so they are reference corpora, not tenant files (the
  module note says where to add a root if that changes). The no-organization form is kept for internal callers.
- The download route resolves `generated_documents/org-<callerOrg>/<basename>` through that resolver; a file
  outside the caller's prefix, or missing, answers `404 Document not found`. A request with no resolvable tenant
  answers 403 instead of reaching a shared directory. The audit, provenance and snapshot writes are unchanged.
- The three document-understanding routes take the organization from `requireAuthedOrgId` (403 `Tenant context
  required` without one — the router is mounted with no per-mount middleware and relies on the `/api` auth
  boundary, which populates `req.user`), pass it to the resolver, and no refusal or miss echoes the path (the
  previous `File not found: <path>` is now `File not found`).
- `documents.generate_docx` refuses without a usable `ctx.organizationId` (nothing rendered, nothing written),
  and otherwise writes `generated_documents/org-<id>/<uuid>-<Title>_<type>_<YYYYMMDD>.docx` with
  `{ flag: 'wx' }`, the sidecar beside it under the same flag; an `EEXIST` is reported as a refusal that
  overwrote nothing. The reported `filename` is the stored name, which is what the download route takes.
  `runDocxPdfPipeline` writes beside the DOCX and needed no change.
- **Legacy flat files are unreachable by design.** A file at `generated_documents/<name>` (or under `uploads/` or
  `exports/` outside an `org-<id>/` directory) has no owner recorded anywhere, so it is attributed to nobody
  rather than to whoever asks first.

| | File | Result |
|---|---|---|
| red | `red/before-fix.txt` | 35 of 85 fail on HEAD `dac69d76`: org B receives **200 with org A's bytes** from the download route and from all three document-understanding routes; the legacy flat file is served; a missing file echoes its path; the resolver admits `org-9` and flat paths for org 7; the tool writes both same-titled documents to one flat path (second overwrites first) and generates with no organization |
| green | `green/after-fix.txt` | 85 of 85: the 45 new cases (the 35 that were red plus 10 positive controls that already passed) and the 40 existing ones in the same four files |
| gates | `green/gates.txt` | `ci:path-containment` OK (3 baselined, unchanged); `ci:server-error-leaks` OK (146 sites, none gained); `ci:discarded-audit-write` no new occurrences; `check:security-patterns` 0 violations |

Tests: `server/utils/__tests__/document-file-roots.test.ts` (resolver, 19 new), `tests/routes/concept2cure-export-governance.test.ts`
(download route over supertest with real files under `generated_documents/org-990001/`, 5 new),
`server/routes/__tests__/document-understanding-honesty.contract.test.ts` (three routes × cross-tenant / own /
no-tenant / legacy flat / missing-no-echo, 15 new), `server/services/tools/__tests__/generate-docx-tenant-prefix.test.ts`
(new file, 6 cases: prefix + no overwrite + sidecar, forced collision fails under `wx` by pinning `crypto.randomUUID`,
four refusals without an organization). Fixtures are written under the gitignored `generated_documents/` with
unique org ids and names and removed in `afterAll`. `npx tsc --noEmit -p tsconfig.check.json` reports nothing
for the touched files; eslint reports 0 errors.

## Not done here (outside this item's files)

- `server/services/docxGenerator.ts:49-56` `saveGeneratedDocx` still writes flat into `generated_documents/`
  (sole caller `server/routes/test-assembly.ts:157`, a QA-only route family). Its output is now unreachable through
  the download route. It should take an organization and write under the prefix with `wx`, or go with test-assembly.
- `server/services/docx/docxFactory.ts:653-656` still produces the predictable `<Title>_<type>_<YYYYMMDD>.docx`
  name; harmless now the tool prefixes a UUID and refuses overwrites, but the name itself is the audit's citation.
- `exports/` is written flat by `server/routes/analytics-demo-analysis.ts:86`, `server/routes/planner-routes.ts:10`
  and `server/services/export-service.ts:30`; none of those outputs is read through document-understanding today,
  and none is reachable through it now unless moved under `exports/org-<id>/`.
- No table records generated files. A registry row per file (organization, stored name, hash) with the download
  route keyed by id rather than name is the durable form of this fix; that is a schema change and a product
  decision, not a cleanup.
