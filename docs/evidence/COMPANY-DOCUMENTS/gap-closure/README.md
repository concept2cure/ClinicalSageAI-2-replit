# Company-document gap closure

The company stationery and legal-document workflows are connected inside Concept2Cure V2. This record distinguishes verified local behavior from deployment and agency acceptance.

## What already exists

The 2026-10-18 implementation inventory and 2026-10-21 merge review extend these canonical paths. The limitations below describe the starting behavior, before this completion.

| Existing piece | Existing responsibility | Completion in this work |
| --- | --- | --- |
| `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx`; `server/services/company-documents/profile.ts` | Company identity, logo/letterhead editing and registered legal PDF references. | Reach the same settings from Account; add reviewed designs, retained revisions, permissions and a scalable registry. |
| `server/routes/client-branding.ts` | Legacy tenant branding and letterhead import. | Explicitly adopt or replace legacy assets; keep delegated brand extraction on the same admission path. |
| `server/services/tenant/tenant-settings-writer.ts` | Tenant settings, locking and chained audit transaction. | Add registry/history/projection checks to its transaction rather than introducing another settings writer. |
| `server/services/vault/vault-ingest.service.ts`; `server/services/vault/vault-lifecycle.ts` | Original bytes, project admission, exact versions and current approval. | Retain immutable copied-original lineage and legal lifecycle refusals; reuse native ingest, review and placement. |
| `server/services/templates/templateStore.ts`; `server/services/docx/docxFactory.ts`; `server/services/pdf-converter.ts` | Canonical template specifications and Word/PDF rendering. | Retain exact approved presentations and render historical correspondence through these engines. |
| `server/services/authoring/authoring-from-draft.ts`; `server/services/authoring/authoring-file-to-vault.ts` | Authoring creation and governed Vault filing. | Carry admitted filing and company-presentation provenance through the existing creation/review/file workflow. |
| `server/services/ectd/leaf-source-resolver.ts`; `server/services/submission-gateways/regional-packager.ts` | Admitted sources, package generation and technical checks. | Preserve registered/signed PDF originals through the final ZIP while retaining current regional/DTD gates. |
| `server/services/global-ri/regional-module1-requirements.ts` | Regional requirement source. | Map legal companions only under explicit customer review; retain unknown coverage honestly. |
| `server/routes/report-os.ts`; `server/services/export/governedExportConsequence.ts` | Report exports and audited delivery. | Explicit report/legal companion ZIPs with unchanged originals and current source checks. |
| `server/services/tenant-export/`; `server/services/tenant/tenant-offboarding.ts` | Customer data return, receipts, holds and eligible disposal. | Bind exact company metadata/designs to the same receipt and purge transaction. |

The deletion-history search `git log --all --diff-filter=D -- '*company-document*' '*CompanyDocument*' '*letterhead*'` returned no matching removed implementation. Existing surfaces, storage, approvals and gateways are extended; none is replaced by a parallel implementation.

## Where customers use it

| Location | Connected workflow |
| --- | --- |
| Admin → Settings; Setup; Account → Company documents | Identity/logo/letterhead design and import, unsaved Word proof, readable/zoomed preview, legacy adoption, revision comparison/restore, delegated duties and named designs. |
| Named designs | A second authorized person reviews the exact draft before publication. Publication leaves the default unchanged. Explicit activation admits only a published organization-wide design. Owners/admins can require independent review of the default; canonical writes also enforce this policy. |
| Submission Center → Company documents | Register exact Vault PDF versions, reuse originals through separately approved project copies, reconcile applicant/sponsor identity, review legal requirements and place approved legal companions. |
| Legal library | Server-side search/filter/pagination; custody, expiry/reminders, replacement/revocation, authority, externally reviewed signature evidence and certified-translation evidence. |
| Authoring and correspondence | Filing-bound drafts enter canonical Authoring and Vault review. Retained letterhead/variant identity survives later branding changes in Word and PDF. |
| Reporting → Insights bundles | Explicit legal companion selection produces a report ZIP with unchanged originals and a manifest; regular PDF exports retain their existing behavior. |
| Agency communications/handoffs | Exact legal-version links preserve the reviewed source reference. |
| Tenant data return/offboarding | Both exports bind company settings, registry/governance records and referenced designs. Eligible disposal requires a matching current export receipt and respects legal holds. |

## Controls verified

Registered/signed originals retain exact bytes through the final ZIP. Mandatory PDF/A rules validate the original or refuse it. Copies require their own Vault approval; explicit immutable ancestry propagates source revocation/invalid findings without using hash equality to relate unrelated uploads. Inaccessible source ancestry is omitted from public document DTOs.

Current database membership and project access govern reads, counts and mutations. Registration/archive recheck access before commit; registration locks and rechecks its exact current PDF source. Company changes, retained presentations, registry updates, native renewal projections and audit consequences commit together or roll back.

Saved, applicable company requirements gate dispatch readiness and assembly. Unreviewed regional suggestions remain advisory until explicitly reviewed/configured. Unreviewed suggestions have null reviewer/time; saved reviews record the actual actor and server timestamp. A reason cannot replace missing filing facts, required legal companions or current source approval.

The native migration replay succeeded against local PostgreSQL. All five company tables have row-level security enabled. Renewal deduplication and tenant/record-bounded copy-audit indexes were verified installed.

## Evidence and reproducibility

The final result and source checksums are recorded in `verification.json` and `source-pins.json`. `test-files.json` is the exact unique suite selection. Raw full-run output is retained in the private execution workspace; focused shareable proof is retained here:

- `browser/README.md`: actual Chromium checks and seven screenshots, including genuine offline→Retry recovery, unsaved DOCX proof, default-policy explanation, font zoom and Account layout.
- `correspondence/verification.json`: actual five-page landscape DOCX/LibreOffice PDF, historical logo/style/text and geometry evidence.
- `packaging/`: admitted-source-to-final-ZIP integrity and removed-control proofs.
- `legal/README.md`: actual registry/Vault/filing SQL, requirement gates, lineage, renewal and unreviewed-state regressions.
- `governance-independent-review.md`: independent permission/default-policy/lineage review and addressed findings.

Reproduce the selected tests with Node 22 and the locked dependencies:

```sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = JSON.parse(fs.readFileSync('docs/evidence/COMPANY-DOCUMENTS/gap-closure/test-files.json', 'utf8'));
const result = spawnSync('./node_modules/.bin/vitest', ['run', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
JS
node scripts/ci/typecheck-no-regression.mjs --incremental
npm run build
```

## Operational boundaries

No production deployment is claimed. Remote CI is unobserved: the current environment denies the GitHub API destination, although authenticated Git fetch/push works. The saved environment draft adds that destination for review and includes tested Node/PostgreSQL/LibreOffice installation/startup instructions. Draft revision 4 remains unpublished; saving a draft does not apply it to a new task.

The browser proof used the existing administrator session and preserved profile revision 2. It did not activate a published default, compare nonexistent historical records or log in as a separate delegate; real SQL/HTTP/component tests cover the corresponding governance behaviors.

These features support customer-supplied legal companions and reviewed requirements across configured markets. They do not establish universal legal sufficiency, signature cryptographic trust, complete agency checklists or new transmission gateway support. The regional legal suggestion source covers initial marketing applications in eight markets; other filing needs require explicit customer/legal review. External signature findings are recorded evidence, distinct from internal Vault approval.
