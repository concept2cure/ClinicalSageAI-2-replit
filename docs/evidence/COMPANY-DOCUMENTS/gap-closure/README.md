# Company-document gap closure

The company stationery and legal-document workflows are connected inside Concept2Cure V2. This record distinguishes verified local behavior from deployment and agency acceptance.

## What already exists

The October 18 implementation inventory and October 21/23 merge reviews extend these canonical paths. The limitations below describe the starting behavior, before this completion.

| Existing piece | Existing responsibility | Completion in this work |
| --- | --- | --- |
| `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx`; `server/services/company-documents/profile.ts` | Company identity, logo/letterhead editing and registered legal PDF references. | Reach the same settings from Account; add reviewed designs, retained revisions, permissions and a scalable registry. |
| `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx:VaultVersionPicker` | Shared admitted Vault-version selection, extended upstream with metadata filters and shared result mapping. | Converge company selection onto this picker; retain same-query retry, paging and request-scope guards. |
| `server/services/ectd/package-identity.ts`; `server/services/ind-forms/form-context-assembler.ts` | Canonical submission/market applicant identity and the established program-address authority. | Use the same identity in company comparison and correspondence; bind review/reservation to applicant/contact/market snapshots without borrowing a home-market number. |
| `server/routes/client-branding.ts` | Legacy tenant branding and letterhead import. | Explicitly adopt or replace legacy assets; keep delegated brand extraction on the same admission path. |
| `server/services/tenant/tenant-settings-writer.ts` | Tenant settings, locking and chained audit transaction. | Add registry/history/projection checks to its transaction rather than introducing another settings writer. |
| `server/services/vault/vault-ingest.service.ts`; `server/services/vault/vault-lifecycle.ts` | Original bytes, project admission, exact versions and current approval. | Retain immutable copied-original lineage and legal lifecycle refusals; reuse native ingest, review and placement. |
| `server/services/templates/templateStore.ts`; `server/services/docx/docxFactory.ts`; `server/services/pdf-converter.ts` | Canonical template specifications and Word/PDF rendering. | Retain exact approved presentations and render historical correspondence through these engines. |
| `server/services/authoring/authoring-from-draft.ts`; `server/services/authoring/authoring-file-to-vault.ts` | Authoring creation and governed Vault filing. | Carry admitted filing and company-presentation provenance through the existing creation/review/file workflow. |
| `server/services/ectd/leaf-source-resolver.ts`; `server/services/submission-gateways/regional-packager.ts` | Admitted sources, package generation and technical checks. | Preserve registered/signed PDF originals through the final ZIP while retaining current regional/DTD gates. |
| `server/services/global-ri/regional-module1-requirements.ts` | Regional requirement source. | Map legal companions only under explicit customer review; retain unknown coverage honestly. |
| `server/routes/report-os.ts`; `server/services/export/governedExportConsequence.ts` | Report exports and audited delivery. | Explicit report/legal companion ZIPs with unchanged originals and current source checks. |
| `server/services/tenant-export/`; `server/services/tenant/tenant-offboarding.ts` | Customer data return, receipts, holds and eligible disposal. | Bind exact company metadata/designs to the same receipt and purge transaction. |

The initial deletion-history search `git log --all --diff-filter=D -- '*company-document*' '*CompanyDocument*' '*letterhead*'` found no earlier removed implementation. Subsequent merge review converged the duplicate `company-documents/CompanyVaultPicker.tsx` onto the reachable `VaultLibraryResults.tsx:VaultVersionPicker`; settings, legal evidence and their retry/paging regressions use that canonical replacement. October 23 history review also covered picker and package-identity names. Existing surfaces, storage, approvals and gateways are extended.

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

Company identity review and correspondence now reuse the current canonical submission identity. Bound applicant names and each market's application number follow the filing; an absent added-market number cannot borrow the home-market number. The established program-address authority remains unchanged. Rebinding the applicant or changing recorded contact/market facts invalidates the old review/reservation snapshot. Unbound legacy FDA tenant names are not presented as applicants of record.

The October 23 native migration replay succeeded against local PostgreSQL with 429 migrations. All five company tables have row-level security enabled, and the actual `app_service` role passes the 1,314-relation readiness contract without superuser, RLS bypass or table ownership. Renewal deduplication and tenant/record-bounded copy-audit indexes were verified installed.

## Evidence and reproducibility

The October 23 base qualification is recorded in `verification.json`. `source-pins.json` now contains the reconciled company source hashes; `concurrent/original-company-source-pins-2026-10-23.json` preserves the exact original qualification snapshot. Qualification follows integration of another 419 upstream commits after the October 21 review. `test-files.json` selects 154 unique suites; `test-summary.json` records the latest completed result per exact file: **1,976 passed, zero failed or skipped**, without counting overlapping reruns twice. Initial failures are retained honestly: malformed converter/FDA PDF fixtures were replaced with real PDFs; company identity/correspondence adopted the canonical regional identity; the attestation authority fixture gained the newly required sender audit outcome and a negative refusal regression. Production integrity and audit gates remain enabled. Raw completed-run reports and the excluded, terminated intermediate diagnostic are identified in the summary. A concurrent eight-commit AnA update was then merged cleanly: all 291 company source hashes still match; its separate six-suite qualification passed 81 cases and the combined production build passed. These 81 cases are not added to the company count. The mandatory push hooks run again on the combined tree. A later four-commit Authoring-to-Vault update required reconciling filing derivation with company originals. `concurrent/filing-derivation-2026-10-23.json` records the final reconciled source hashes, changes from the original company pins, and 218 passing focused cases across 16 suites, with one inherited upstream re-filing parity TODO explicitly unexecuted. These reruns are separate from the original 1,976-case count. Company correspondence, legal-original preservation, actual DTD/PDF-A refusals and verified retained derivation coexist. The combined build passes, and publication remains subject to the full mandatory push checks. A subsequent task-delegation integration passed 172 additional focused cases across 14 suites, including the existing legal-renewal/PWI producer; all 298 reconciled company source hashes remain identical. See `concurrent/task-integration-2026-10-23.json` for exact scope, current build and native-database test limits. The subsequent device-client merge also leaves all 298 company source hashes intact; 235 focused cases across seven suites and the combined build pass (`concurrent/device-integration-2026-10-23.json`). Canonical recorded filing IDs and companion entry points remain intact. The later current-access Authoring merge is qualified separately in `concurrent/current-authoring-integration-2026-10-23.json`: **512 passed across 35 suites**, zero failures/skips and the same inherited re-filing TODO. Four of the 298 company pins changed: canonical Workbench, two saved-source fixtures and the packaging request-access fixture. Company provenance, exact correspondence reopening, current access refusals, original-PDF packaging, the combined build and the full zero-error TypeScript check pass. These reruns do not inflate the original company count. Focused shareable proof is retained here:

- `browser/2026-10-23-current-authoring/README.md`: latest actual Chromium checks on the merged Authoring-access tree; stable source at `e87c01595`, unchanged profile revision 2, no persisted company changes, and nine screenshots.
- `browser/2026-10-23-final-updated/README.md`: earlier actual Chromium checks on the merged Device/Task tree and nine screenshots, including genuine offline→Retry recovery in both inventory and the canonical Vault picker, unsaved DOCX proof, default-policy explanation, font zoom and Account layout. October 18/21 evidence is preserved separately.
- `correspondence/2026-10-23-updated/verification.json`: fresh actual five-page landscape DOCX/LibreOffice PDF, historical logo/style/text and geometry evidence with the current shared converter limiter.
- `identity/2026-10-23/`: canonical applicant/market identity, missing facts and changed-reservation regressions.
- `packaging/`: admitted-source-to-final-ZIP integrity and removed-control proofs.
- `legal/README.md`: actual registry/Vault/filing SQL, requirement gates, lineage, renewal and unreviewed-state regressions.
- `governance-independent-review.md`: independent permission/default-policy/lineage review and addressed findings.
- `database/verification-2026-10-23.json`: fresh actual PostgreSQL replay, company-table row-level security, indexes and runtime-role checks.
- `exports/`: current report/source admission, audited attestation, complete data return and receipt/retention qualification.
- `environment/verification-2026-10-21.json`: tested native XML tool restoration and saved environment draft status.

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

No production deployment is claimed. Remote CI is unobserved: an earlier GitHub API request was denied and current policy metadata still excludes that destination, although authenticated Git fetch/push works. The saved environment draft adds that destination for review and includes tested Node/PostgreSQL/LibreOffice/XML-tool installation/startup instructions. Draft revision 5 remains unpublished; saving a draft does not apply it to a new task. The XML tool was restored twice through the narrow installer, with valid-DTD acceptance and invalid-DTD refusal; the full installer was not rerun. Current startup was rerun successfully through the saved instructions before the fresh browser check.

The browser proof used the existing administrator session and preserved profile revision 2. It did not activate a published default, compare nonexistent historical records or log in as a separate delegate; real SQL/HTTP/component tests cover the corresponding governance behaviors.

These features support customer-supplied legal companions and reviewed requirements across configured markets. They do not establish universal legal sufficiency, signature cryptographic trust, complete agency checklists or new transmission gateway support. The regional legal suggestion source covers initial marketing applications in eight markets; other filing needs require explicit customer/legal review. External signature findings are recorded evidence, distinct from internal Vault approval.
