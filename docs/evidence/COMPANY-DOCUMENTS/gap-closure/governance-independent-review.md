# Independent company governance review and HTTP proof

2026-10-18; local Node 22. This review made no production changes. New test ownership is limited to `server/routes/__tests__/company-document-governance.pglite.test.ts`.

## Current database permission admission

The new HTTP suite passed **22 tests / one file** against actual PGlite tables and the unmodified production `20261018_company_document_governance.sql` and canonical legal-registry migration. Express requests bind the actual SQL client through `req.dbClient`. `context`, `readCurrentProgramActor`, CSR membership admission and capability resolution remain real. The only substituted production boundary is chained audit persistence; its substitute inserts an actual transaction-bound test audit row before optionally failing, allowing both grant and audit rollback to be proved from SQL.

Verified outcomes:

- A stale session administrator whose current membership is `member` receives 403 for roster and permission writes. Current owner/admin membership grants duties even when the session role claims `viewer`.
- A brand delegate cannot grant legal duties to another member or itself. Effective capabilities remain brand-only.
- Foreign-tenant targets and inactive actors/targets receive 403 without grants or audit rows. Roster results exclude foreign and inactive users.
- A chained persistence failure rolls back both new or updated grants and the attempted audit row.
- Owner/admin inherited duties cannot be edited through grants (409), and their current inherited capabilities remain enabled.
- An inactive tenant cannot administer duties. Strict request schemas refuse body actor/organization substitutions.
- The new `PUT /branding-policy` route uses the actual canonical managed settings writer and NodePg/PGlite row adaptation. Current owner/admin writes retain the revision and audit; current members/brand delegates cannot change policy; missing approved defaults, stale revisions and audit persistence failure roll settings back. Successful activation of an independently reviewed design is covered by the separate design service suite.

Test command: `npx vitest run server/routes/__tests__/company-document-governance.pglite.test.ts`.

Result: `Test Files 1 passed (1); Tests 22 passed (22)`.

Touched-file ESLint exited zero with **zero warnings**. Runtime logs are `/workspace/.cloud-setup/company-governance-policy-http.log` and `company-type-and-governance-eslint.log`. No full TypeScript run was launched; root owns combined checks.

This suite establishes actual HTTP/SQL admission and transactional effects. It does not claim production PostgreSQL RLS coverage or concurrent multi-connection serialization.

## Static review

Reviewed `capabilities.ts`, `profile.ts` canonical admission/writes, `company-document-governance.ts`, `history.ts`, the governance migration, `identity.ts`, `legacy-adoption.ts`, `company-document-identity.ts` and the existing settings writer composition.

No concrete authorization defect was found in permission administration, legacy adoption or historical presentation restore. Permission writes re-admit current actor and target under the transaction after taking the organization lock; inherited admin rights are independent of delegated grant flags. Presentation history hashes and returns a presentation-only snapshot, excluding private legal inventory. Restore changes named presentation fields and uses the canonical locked/revisioned writer. Legacy import previews tenant-bound source values, validates embedded raster assets through the canonical safety path, refuses stale source hashes and does not fetch old URLs or import active HTML.

One narrow provenance concern was identified after variant identity support landed: content-identical variants with the same revision could share an identity review because the presentation hash intentionally excludes `variantId`. Root addressed this by binding `filingHash` to both recorded filing facts and `presentationVariantId` (named ID or null for the default), while preserving the presentation content hash contract. Root's **10-test real PGlite identity suite passed**, including separately reviewed default/two named variants with identical content/revision and refusal of a prepared review for a different selected variant. This concern is addressed; no unresolved finding remains from this review. The reviewer made no production changes for that fix.

## Independent default-policy and activation follow-up

Reviewed the canonical `writeProfile` before-commit enforcement and `designs.ts` default resolver/activation after they landed. The canonical writer refuses policy changes outside permission administration and validates the exact approved default whenever mandatory review remains enabled. The resolver requires a published, independently reviewed, unrestricted design; verifies its retained template/presentation; and compares normalized identity, logo and style independently of changing default revision and automatic-use flags. Explicit activation preserves the current legal registry/policy, admits current brand capability through the canonical writer, re-resolves the approved design before commit and enlists activation audit persistence in that same transaction. No concrete defect was found in this follow-up. The HTTP suite's seven new policy cases use the actual managed writer; approved-design activation success and mismatch controls are separately covered by the design and writer-composition suites coordinated by root.

## Independent copied-original lineage follow-up

The read-only lineage review identified two concrete edges while integration was still in progress: a known stored parent could be treated as absent when audit ancestry was missing, and public copy metadata could expose identifiers from an inaccessible source program. Both are corrected in the frozen implementation.

`company-copy-lineage.ts` now compares immutable registry ancestry with the tenant-bound ingest audit and pins the actual ancestor Vault program, version and content hash. Missing, conflicting, cyclic, drifted or unreadable provenance refuses filing. `public-document.ts` removes server-only `sourceOriginal` from profile, single-document and inventory DTOs; internal canonical metadata remains available for enforcement. Reporting snapshots consume this sanitized single-document DTO. The registry writer and production migration prevent changing the registered source reference. Explicit copy ingest retains provenance even for an otherwise unchanged ingest retry.

The canonical Vault transmit gate checks the copy's own current version, approved stage and approved content hash before following ancestry. Ancestor revocation or recorded invalid-signature findings yield generic refusals without private source identifiers; source approval never approves the copy. No remaining concrete defect was found after the final review.

Independent verification passed **45 tests / four files**: `server/services/vault/__tests__/company-legal-copy-lineage.pglite.test.ts` plus the existing actual Vault materializer/final-ZIP suites `leaf-source-resolver-vault.test.ts`, `leaf-source-resolver-vault-finalized.test.ts` and `assemble-from-core.vault-uuid.pglite.test.ts`. The 14 native lineage cases cover private ancestor withdrawal, partial-copy registration, multiple generations, own approval, equal-byte independence, missing/conflicting/foreign/cyclic parents and exact-source drift/read failure. Log: `/workspace/.cloud-setup/company-lineage-independent-green.log`. This follow-up made no production changes or typecheck calls.

The two integrated report type diagnostics were also corrected: the test request body is now accurately typed as an object, and the registration snapshot copy uses the domain type where the read-time verdict is optional before removing it. Focused report regressions passed **61 tests / two files**; all three touched source/test files lint with zero warnings.
