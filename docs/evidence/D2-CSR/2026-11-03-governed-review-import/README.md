# Governed CSR review → Authoring intake: repair and verification record

**Repository:** `concept2cure/ClinicalSageAI-2-replit`
**Target:** `concept2cure-v2`
**Plan:** F1 — repair existing D2 CSR workflow, not a second CSR service or editor.
**Status:** Source changes pushed; live deployment / native PGlite / browser qualification **NOT verified**.

## Investigate: existing canonical path

Project Data Room/Vault → approved clinical study-data freeze → retained tables → existing CSR job → `GET /api/csr/jobs/:jobId/headings` → selected saved text `GET /api/csr/jobs/:jobId/sections?sectionNumber=11.4.1` → independent section-review POST → reviewed selection → `POST /api/authoring/import/source` preview/fingerprint → governed working DRAFT in the same editor.

The ordinary workflow-source import remains able to create an **unapproved working draft**. Source approval never transfers to the new editor document, and no source import bypasses authoring access, source fingerprinting, review, signature, or model PQ gates.

## Diagnose: confirmed defects and authorization mismatches

1. The selected-section read validator in `server/routes/csr-jobs.ts` accidentally used a double-escaped regex literal. It rejected every normal ICH E3 heading such as `11.4.1`, leaving reviewers unable to inspect the exact saved text before clicking Approve.
2. `decideCsrSectionReview` validated current content against SHA-256 on SELECT but its optimistic UPDATE compared the saved hash and review status, not the actual content bytes. An out-of-band content-only edit between those operations could inherit a decision.
3. Legacy `csr_build_jobs` with `requested_by=NULL` could still reach independent section approval even though `Number(null)===0` was not the reviewer. There is no basis to conclude reviewer independence when the requester is unknown.
4. The CSR card offered **Import approved sections**, but the generic (legitimately draft-capable) source-import endpoint did not distinguish this particular approved-only request. A reviewed selection could become stale between displaying the card and creating its Authoring working copy.

## Build: same existing services, no sidecar

- `server/routes/csr-jobs.ts`: correct ICH E3 section number parsing; exact selected-section hash validation remains in place.
- `server/services/csr/csr-section-review.ts`: compare `content = $9` in the same optimistic UPDATE that checks the hash and state; refuse independent approval when `requested_by` is absent, invalid or matches reviewer ID.
- `shared/authoring/source-import.ts`: extend the existing CSR source discriminated union with optional `approvedOnly?: true`. This is a requested admission condition, **not** an approval record.
- `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx` and `BiopharmaProject.tsx`: send `approvedOnly:true` only from the UI action explicitly labeled as importing approved sections.
- `client/src/concept2cure/v2/authoringHandoff.ts`: keep approved-only vs working-draft source identities separate; prevent an invalid or missing selected set from masquerading as approved-only.
- `server/services/authoring/authoring-source-import.ts`: preserve the verified flag in the canonical request selector; reject invalid or ambiguous approved-only requests.
- `server/services/authoring/workflow-source-import.ts`: recheck saved section review state and reviewed-content hash for every approved-only selection using the existing tenant/project-scoped DB, on the same coherent source snapshot, and again during the current fingerprint reservation before document creation. An unapproved/revoked section raises `WORKFLOW_CSR_APPROVAL_REQUIRED`; missing/ambiguous rows fail closed. Existing **working-draft import without the flag is unchanged**.

No new HTTP route, database table, provider, CSR application or uncontrolled mutation was introduced.

## Tests authored in the existing suites

- `server/routes/__tests__/csr-jobs-build-and-review.pglite.test.ts`: valid `11.4.1` selected-section read, malformed codes, missing and foreign-tenant section, corrupted saved text.
- `server/services/csr/__tests__/csr-section-review.pglite.test.ts`: content-only concurrent mutation after SELECT cannot become an approved review; legacy requester-less completed job cannot gain approval.
- `server/routes/__tests__/authoringWorkflowImport.pglite.integration.test.ts`: approved-only mode refuses an unapproved source, accepts an actually approved source in preview and draft creation, and refuses after approval revocation even with an old fingerprint and previously created working copy.
- `server/services/authoring/__tests__/workflow-source-import.pglite.test.ts`: approved-only without an exact set of section numbers is invalid.
- `client/src/concept2cure/v2/__tests__/csrCardReach.test.tsx`: review-card source carries the `approvedOnly` contract.
- `client/src/concept2cure/v2/editor/__tests__/workflowImportReuse.test.ts`: source-preview identity cannot downgrade or confuse approved-only with generic draft import.

Suggested Node 22 local validation:

```sh
npx vitest run \
  server/routes/__tests__/csr-jobs-build-and-review.pglite.test.ts \
  server/services/csr/__tests__/csr-section-review.pglite.test.ts \
  server/routes/__tests__/authoringWorkflowImport.pglite.integration.test.ts \
  server/services/authoring/__tests__/workflow-source-import.pglite.test.ts \
  client/src/concept2cure/v2/__tests__/csrCardReach.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/workflowImportReuse.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

### Verification record and limitations

A connector-side source inspection verified nine intended code contracts including the corrected literal regex (accepts `11.4.1`, rejects `11.4.x`), content-byte optimistic locking, missing-requester refusal, approved-only client selection, server validation, fingerprint retention and current state recheck.

**Nine source-contract assertions are not nine native unit tests.** This session had no Node/PostgreSQL/React runtime to execute the repository test suites. The targeted PGlite and React tests are committed but their actual pass/fail verdict, full CI, security checks, authenticated browser smoke, and clinical-data/CSR export qualification are still open. GitHub's queued runs are not passes.

The supplied architecture materials identify additional goals for cross-artifact contradiction detection, regulator/body overlays, decision receipts and IND/eCTD authoring. They are important but are **not** proved by this CSR repair slice. This receipt does not claim those wider requirements are all complete.

### Acceptance target

With a synthetic, authorized study: verify a real selected CSR section reopens to its saved bytes, independent reviewer approves the exact hash, the approved-only source preview succeeds, the governed editor creates a DRAFT with source fingerprint and no transferred signature, and a change/revocation before creation is refused without replacing saved content. Then continue Data Room → biostats → AnA qualified model → CSR editor → human review → export/reopen and verify actual retained numeric results and edits.
