-- AMENDED IN PLACE 2026-10-30 — D2 fold F6: the device workstream folds into Projects (CLAUDE.md Rule 1).
-- Decision P-61 item 5: the device workstream into Projects shows only figures
-- computed from the project's own records, and the Client Review Room admits
-- the project. The kit portfolio (device-workstream, mdx/surfaces/Overview.tsx)
-- retires; Projects with its MDX filter counts the device portfolio on the
-- server, the Client Review Room is on the device project's Review step, and
-- the old address opens filtered Projects. Removed: the id from step 1's
-- keep-list and step 2's upsert, so a fresh database never holds the row and
-- step 1 deprecates the existing row on every replay. The row, its metadata
-- (its recorded tier, 'standard', included), module_subscriptions FKs and every
-- tenant record stay; no DELETE, no appended DROP. A live grant carries to
-- projects in the entitlement resolver (decision P-61 item 4,
-- server/services/entitlements/folded-module-successors.ts); no grant row is
-- written. 20260823's packaging row is removed with it.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-30/fold-f6-device-workstream/README.md.
-- AMENDED IN PLACE 2026-10-30 — D2 fold F4: device analytics joins Reporting & analytics (CLAUDE.md Rule 1).
-- Decision P-61 item 3: device analytics joins Reporting & analytics at its tier
-- (standard), over the projects the reader can open. Device pathway analytics
-- (device-analytics) retires; its status counts, submission pace and AnA draft
-- acceptance rate are the device section of the Reporting overview
-- (server/services/report-os/device-portfolio.ts), and its address opens
-- insights. Removed: the id from step 1's keep-list and step 2's upsert, so a
-- fresh database never holds the row and step 1 deprecates the existing row on
-- every replay. The row, its metadata (its recorded tier, 'professional',
-- included), module_subscriptions FKs and every tenant record stay; no DELETE, no
-- appended DROP. A live grant carries to insights in the entitlement resolver
-- (decision P-61 item 4, server/services/entitlements/folded-module-successors.ts);
-- no grant row is written. 20260823's packaging row is removed with it.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/README.md.
-- AMENDED IN PLACE 2026-10-30 — D2 fold F5 item 1: device submission packages into Submission Center (CLAUDE.md Rule 1).
-- Decision P-61 item 1: one device-filing store, estar_submissions. The device
-- submission-packages screen (device-submission) is folded into Submission
-- Center, whose device filings list every tracked filing with a status filter,
-- each draft's gate from its own readiness and each filing's history; device
-- packages of c2c_submission_packages are migrated into it by
-- migrations/20261030_estar_filing_one_store.sql. Removed: the id from step 1's
-- keep-list and step 2's upsert, so a fresh database never holds the row and
-- step 1 deprecates the existing row on every replay. The row, its metadata
-- (its recorded tier included), module_subscriptions FKs and every tenant record
-- stay; no DELETE, no appended DROP. A live grant carries to submission-center
-- in the entitlement resolver (decision P-61 item 4,
-- server/services/entitlements/folded-module-successors.ts); no grant row is
-- written. 20260823's packaging row is removed with it.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/README.md.
-- AMENDED IN PLACE 2026-10-29 — D2 fold F5 item 2: the organization-wide blocker list retires (CLAUDE.md Rule 1).
-- Decision P-61 item 2: no organization-wide blocker list. A blocker belongs to
-- a filing, from that filing's deterministic readiness (EstarFilingPanel), and is
-- closed by fixing it; the list's "Pass" for a low-severity blocker is not
-- carried. Submission blockers (device-validation) retires; its address opens
-- Submission Center. Removed: the id from step 1's keep-list and step 2's upsert,
-- so a fresh database never holds the row and step 1 deprecates the existing row
-- on every replay. The row, its metadata (its recorded tier included),
-- module_subscriptions FKs and every tenant record stay; no DELETE, no appended
-- DROP. A live grant carries to submission-center in the entitlement resolver
-- (decision P-61 item 4, server/services/entitlements/folded-module-successors.ts);
-- no grant row is written. 20260823's packaging row is removed with it.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/README.md.
-- AMENDED IN PLACE 2026-10-29 — D2 folds F1c and F2 (CLAUDE.md Rule 1).
-- Risk management (risk) folded into Engineering evidence (device-engineering),
-- which holds the project's ISO 14971 risk file (RiskRegister.tsx), and IVD
-- completeness (ivd-completeness) into IVDR evidence (device-diagnostics), whose
-- readiness panel draws the IVDR board and the assessment workbench. Removed:
-- both ids from step 1's keep-list and step 2's upsert, so a fresh database
-- never holds either row and step 1 deprecates the existing rows on every replay.
-- The rows, their metadata (their recorded tier included), module_subscriptions
-- FKs and every tenant record stay; no DELETE, no appended DROP. A live grant of
-- either carries to its target in the entitlement resolver (decision P-61 item 4,
-- server/services/entitlements/folded-module-successors.ts); no grant row is
-- written. 20260823's packaging and customer-copy rows are removed with them.
-- design-controls, folded with risk, was never on this file's lists; its writers
-- are 20260814j and 20260823_module_catalog_mdx_registers, amended the same day.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/README.md.
-- AMENDED IN PLACE 2026-10-29 — D2 fold of ectd-publishing into eCTD Compile (CLAUDE.md Rule 1).
-- The eCTD publishing reference (ectd-publishing) is folded into eCTD Compile:
-- its spec versions sit beside the validation findings, and its version choice,
-- FDA Regional IG OID and controlled vocabularies are eCTD Compile's eCTD
-- reference panel (EctdCompileReference.tsx). It left the launch catalogue on
-- 2026-10-08, so the reason step 1 kept it (the 2026-09-22 note below: "a launch
-- module") no longer holds. Removed: the id from step 1's keep-list, and step 1b,
-- the heal step that cleared step 1's deprecation for this one row. 20260814j,
-- the row's only writer, no longer inserts it, so a fresh database never holds
-- it; on a deployed database step 1 deprecates the existing row on every replay
-- and nothing clears the flag. The row, its metadata (its recorded tier
-- included), module_subscriptions FKs and every tenant record stay; no DELETE,
-- no appended DROP. 20260823's packaging row is removed with it.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/fold-ectd-publishing/README.md.
-- AMENDED IN PLACE 2026-10-29 — D2 fold of part11-console into Audit trail (CLAUDE.md Rule 1).
-- The Part 11 console (part11-console) is folded into Audit trail, which states
-- both audit chains' verdicts (audit_logs from the ledger, audit_events from
-- GET /api/part11/audit-trail/chain-integrity) on screen and to AnA. The console
-- was never seeded (see COMPLIANCE CONTROLS below); remove it from step 1's
-- keep-list only, so a row any other path added is deprecated on every replay
-- instead of staying live for a screen that no longer exists (and failing
-- 20260823's tier guard, which skips deprecated rows). The row, its metadata,
-- module_subscriptions FKs and every tenant record stay; no DELETE. audit-trail
-- stays unseeded and on the keep-list. 20260823 has no part11-console row.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/fold-part11-console/README.md.
-- AMENDED IN PLACE 2026-10-29 — D2 fold F3: artifacts-center and device-vault into Vault (CLAUDE.md Rule 1).
-- The Artifacts center (artifacts-center) and the device kit's document vault
-- (device-vault) are folded into the Vault: each project's Governed artifacts
-- branch lists every artifact of the project with its versions, audit report and
-- governed DOCX, and the Vault's organization view lists the governed artifacts of
-- the projects the caller can open. Remove both ids from step 1's keep-list and
-- step 2's upsert, so step 1 deprecates the existing rows on every replay. The
-- rows, their metadata, module_subscriptions FKs and every tenant record stay; no
-- DELETE, and no later UPDATE this upsert could undo. 20260823's packaging rows
-- are removed with them. The Vault is free at the same tier as artifacts-center.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/README.md.
-- AMENDED IN PLACE 2026-10-29 — D2 device-tasks fold into Tasks (CLAUDE.md Rule 1).
-- The device task workbench (device-tasks) is folded into Tasks: TaskBoard.tsx
-- reads the same submission-ops work item by item and marks another store's
-- blocking work. Remove device-tasks from step 1's keep-list and step 2's upsert,
-- so step 1 deprecates the existing row on every replay. The row, its metadata,
-- module_subscriptions FKs and every tenant record stay; no DELETE, and no later
-- UPDATE this upsert could undo. 20260823's packaging row is removed with it.
-- Evidence: docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/README.md.
-- AMENDED IN PLACE 2026-10-26 — D2 A2.10a filing-catalogue fold (Rule 1).
-- Filing discovery, selected reference and supported build facts now reach the
-- existing Projects wizard and project Plan. Remove the old keep-list/upsert
-- identity so replay deprecates existing catalogue rows. Retain those rows,
-- their metadata, subscription FKs and stored records; do not DELETE them.
-- Evidence: docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.10a/README.md.
-- =============================================================================
-- AMENDED IN PLACE 2026-10-26 — D2 A2.10 filing catalogue fold (Rule 1).
-- RegistryPicker, FilingReference and ProjectPlan now carry every filing
-- discovery/reference function. Remove filings-catalog from this keep-list
-- and upsert so step 1 deprecates it on every deploy, preserving the existing
-- row, metadata and all tenant subscriptions. No cascading DELETE.
-- Evidence and replay proof: slice-A2/A2.10/README.md.
-- AMENDED IN PLACE 2026-10-26 — D2 A2.7 dossier fold (CLAUDE.md Rule 1).
-- Dossier artifact rollups and section tracking now live on project Author in
-- ProjectDossier.tsx. Remove dossier/dossier-map from this writer's keep-list
-- and upsert; step 1 deprecates existing rows on every replay. Keep rows, FKs,
-- subscriptions and stored project data intact. No cascading DELETE or later
-- UPDATE that this upsert could undo. Evidence: slice-A2/A2.7/README.md.
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Reconcile the Apps catalog with the apps the product ships.
--
-- eCTD/CTD Context:
--   - Module(s): none (Apps catalog copy shown to customers)
--   - Integrity Risk Addressed: a representation about the system, made to the
--     person buying it, that the system does not support
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Descriptions only; no module, entitlement or price changes.
--   - Idempotent: re-runs on every deploy (CLAUDE.md Rule 1).
-- =============================================================================
-- ══ AMENDED IN PLACE 2026-10-26 (CLAUDE.md Rule 1) ══════════════════════════
-- WHAT CHANGED: the `name` of fifteen rows in step 2's upsert, to the names
-- section 9 of .design/client-journey/INFORMATION_ARCHITECTURE.md gives them
-- (slice A.1, "Names a client reads"):
--   tasks                 Tasks & collaboration          -> Tasks
--   communication-center  Communication Center           -> Communication
--   vault                 Vault (DMS)                    -> Vault
--   quality               Quality & Assurance            -> Quality
--   document-authoring    Document editor & authoring    -> The editor
--   review                Review & approval              -> The review board
--   protocol-dev          Protocol development           -> The protocol workspace
--   ind-checklist         IND lifecycle                  -> IND forms
--   dispatch-readiness    Dispatch readiness             -> Submission Readiness (P-33)
--   device-cer            CER generator (EU MDR)         -> Clinical evaluation (CER)
--   device-510k           510(k) workbench               -> 510(k) and eSTAR
--   device-pma            PMA submissions                -> PMA
--   device-diagnostics    Device & diagnostics workbench -> IVDR evidence
--   device-engineering    Device engineering             -> Engineering evidence
--   device-postmarket     Post-market vigilance          -> Post-market surveillance and CAPA
-- WHY: Subscription & features draws each card's title from this column before
-- the surface registry's label (`a.name || surf.label`), and the lock dialog,
-- Compare subscriptions' unlock note and the access-request queue read it too.
-- The registry labels changed in the same slice; left here, the old names (two
-- of them "workbench", one a folded feature's name, "IND lifecycle") would go on
-- reaching every deployed catalogue, because this upsert sets name =
-- EXCLUDED.name on every deploy. Amending the upsert is the change that
-- deploys: a later UPDATE would be undone by this file on the next run.
-- dispatch-readiness keeps its catalogue and entitlement name, Submission
-- Readiness (decision P-33), rather than the screen's own label.
-- Names only: no module id, category, path, tier or entitlement changes.
-- CHANGED BY: slice A.1, the labels cluster (client/src/concept2cure/v2/
-- __tests__/clientNamesSlice1.test.tsx; docs/evidence/D2-CLIENT-JOURNEY/
-- 2026-10-26/slice1/).
-- ═════════════════════════════════════════════════════════════════════════════
-- ══ AMENDED IN PLACE 2026-10-15 (CLAUDE.md Rule 1) ══════════════════════════
-- WHAT CHANGED: three descriptions in step 2's upsert.
--   - authoring-engine: "An AI system per document type (no hallucinations,
--     every required element) ... GxP automations whose non-AI validation logic
--     runs as intended 100% of the time" -> the text
--     migrations/20260814m_catalog_honest_module_descriptions.sql sets.
--   - batch-draft: function names (batch_draft_sections, saveSection,
--     streamDraft SSE) -> what a customer gets.
--   - insights: "(30 report types)" and an internal contract reference -> no
--     count (the report-type registry seeds 61; a number here goes stale).
-- WHY: 20260814m rewrote authoring-engine honestly, but it runs BEFORE this
-- file in scripts/db/migration-set.mjs, and this upsert sets description =
-- EXCLUDED.description on every deploy — so every deployed catalog showed
-- the three absolutes again. tests/schema-contract/catalog-module-claims
-- .contract.test.ts was meant to catch it and replayed a hand-written list of
-- five files in the wrong order (this file first); it now replays every
-- catalog writer in C2C_MIGRATION_FILES order.
-- CHANGED BY: the D2 no-example-data change, session …01TzCCfqi5RbiwzZyfYxyBpX.
-- ═════════════════════════════════════════════════════════════════════════════
-- ══ AMENDED IN PLACE 2026-09-22 (CLAUDE.md Rule 1) ══════════════════════════
-- WHAT CHANGED: 'ectd-publishing' added to step 1's keep-list, and a heal step
-- (step 1b) that clears the `deprecated` flag this file had been setting on it.
--
-- WHY: this file runs AFTER migrations/20260814j_catalog_missing_product_surfaces.sql
-- in scripts/db/migration-set.mjs, and Rule 1 replays every file on every
-- deploy. Step 1 retires every module_id not on its list — so it retired
-- 'ectd-publishing', a row 20260814j adds and a LAUNCH module
-- (shared/constants/launch-scope.ts, Submission Center; docs/
-- LAUNCH_DEFINITION_OF_DONE.md row D2), on every single deploy. getModuleCatalog
-- filters deprecated rows, so on a deploy-shaped database the launch catalog had
-- no verdict for it and the Apps catalog omitted it, while every local check
-- stayed green because none of them replays the set in deploy order.
--
-- WHY A HEAL STEP AND NOT JUST THE LIST: 20260814j inserts with ON CONFLICT DO
-- NOTHING, so on a database this file has already run against, the row keeps
-- the `deprecated: true` this file wrote. Adding the id to the list stops the
-- next re-deprecation; only 1b undoes the earlier ones.
--
-- FOUND BY: tests/db/entitlement-grants-resolution.dbtest.ts on a database built
-- by scripts/db/provision-test-db.sh (install-fresh + the full replay), which is
-- also what now pins it. scripts/ci/check-launch-scope.mjs additionally refuses
-- a launch module missing from step 1's list, so the next one is caught before
-- a database is needed.
-- ═════════════════════════════════════════════════════════════════════════════

-- Reconcile the Apps catalog with the apps the product actually ships.
--
-- THE DEFECT. `available_modules` (the Apps catalog + entitlement catalogue)
-- was seeded once with 19 modules whose ids belong to a taxonomy the product no
-- longer uses: 'cmc-wizard', 'doc-canvas', 'csr-author', 'protocol-designer',
-- '510k-submission', 'nda-bla', ... Meanwhile the shell presents 86 apps to
-- users (client/src/concept2cure/v2/registryModel.ts SEGMENT_MODULES, rendered
-- on Home beneath the AnA introduction), every one of which resolves to a real
-- surface in shared/constants/ui-surface-registry.ts.
--
-- The two id spaces overlap on exactly TWO ids ('vault', 'ectd-coauthor'). So a
-- customer opening "Apps catalog" saw 17 modules that correspond to nothing they
-- can open, and did NOT see 84 of the apps they can. That is the "apps are
-- listed under the AnA introduction but absent from the apps catalog" defect.
--
-- Every legacy row also carried a `path` that does not resolve in this client
-- (/ind-workspace, /cmc-wizard, /doc-canvas, ...), and SIX different modules
-- shared the single path '/ind-workspace'. The catalog UI never reads `path`,
-- so nothing is visibly broken today, but the column was uniformly false.
--
-- THE FIX. Upsert one row per real app, keyed by the SURFACE id, so the catalog
-- and the shell share one id space and cannot drift into separate taxonomies
-- again. `path` becomes the surface's true deep link (/concept2cure/<id>, per
-- client/src/concept2cure/v2/routing.ts), which is unique by construction, so
-- the six-modules-one-path collision is now structurally impossible.
--
-- COMPLIANCE CONTROLS ARE NOT LICENSABLE. Two of the 86 apps the shell presents
-- are deliberately NOT seeded into the catalog: 'audit-trail' and
-- 'part11-console'. A catalog row is an entitlement toggle, and 21 CFR
-- §11.10(e) requires a secure, computer-generated, time-stamped audit trail
-- that users cannot switch off; the Part 11 console is how that compliance is
-- evidenced. Neither may become something an organization can be sold without,
-- or an admin can disable. `requireModule()` gates no route today, so a toggle
-- would be cosmetic for now — but shipping a switch labelled "Audit trail" into
-- an admin console is itself an audit finding, and the entitlement plumbing is
-- the wrong place to discover that later.
--
-- Not seeding them does NOT remove the apps: both remain in the shell and fully
-- reachable. It only means no entitlement row exists to gate them, so they are
-- unconditionally available. They stay in the step-1 protected list below so a
-- row added by some other path is never retired either. (2026-10-29: the Part 11
-- console folded into Audit trail and left that list; see the header.)
--
-- The line drawn is "is this the mechanism by which Part 11 compliance is
-- recorded or evidenced?". 'identity-console' (enterprise SSO / SCIM) is a
-- genuine commercial add-on and IS seeded; 'qmp' and 'report-governance' are
-- product features rather than the audit record itself, and are also seeded.
--
-- ENTITLEMENTS ARE NOT INVENTED. Every module is seeded UNRESTRICTED —
-- metadata {"tiers": [], "industries": []} — which license-manager reads as
-- available to every tier and every industry, and which getModuleCatalog
-- reports as requiredTier: null ("Included"). Commercial packaging (which app
-- sits in which tier, for which industry) is a business decision and is
-- deliberately left to be applied later rather than guessed here.
--
-- RETIRED, NOT DELETED. module_subscriptions.module_id carries
--   FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE
-- so DELETEing the legacy rows would silently destroy every organization's
-- subscription record for them. The legacy rows are therefore marked
-- {"deprecated": true} and left in place: the FK stays satisfied, the
-- entitlement history survives, and getModuleCatalog filters them out of the
-- catalog it serves.
--
-- Legacy subscriptions are intentionally NOT re-pointed at successor ids. The
-- correspondence is genuinely ambiguous in both directions — 'cer-generator'
-- and 'ce-marking' would both land on 'device-cer'; 'analytics-hub' and
-- 'insight-synthesis' would both land on 'insights'; 'strategic-advisor' has no
-- successor at all — and inventing those equivalences would silently move a
-- customer's entitlements. Every module is unrestricted after this migration,
-- so nothing is gated by the difference.

-- REVERSIBILITY. This migration is data-only (no DDL) and runs in one
-- transaction, so a failure mid-way leaves the catalog exactly as it was.
--
-- A rollback must NOT be written as `DELETE FROM available_modules WHERE ...`
-- for the 86 seeded ids. That is the same ON DELETE CASCADE hazard this
-- migration exists to avoid: by the time anyone rolls back, organizations may
-- have subscribed to the new module ids, and deleting the rows would destroy
-- those subscription records rather than merely hiding the modules.
--
-- The safe rollback reverses VISIBILITY, not existence — the same
-- retire-don't-delete rule applied in the opposite direction. To restore the
-- previous catalog composition:
--
--   BEGIN;
--   -- hide the reconciled app rows
--   UPDATE available_modules
--      SET metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || '{"deprecated": true}'::jsonb,
--          updated_at = now()
--    WHERE path LIKE '/concept2cure/%';
--   -- restore the legacy rows to the catalog
--   UPDATE available_modules
--      SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) - 'deprecated')::json,
--          updated_at = now()
--    WHERE path NOT LIKE '/concept2cure/%' OR path IS NULL;
--   -- 'vault' and 'ectd-coauthor' are real in BOTH taxonomies. They now carry a
--   -- /concept2cure path, so the first statement hides them and the second does
--   -- not reach them. Without this they would be rolled back OUT of a catalog
--   -- they belonged in before this migration ever ran. (Found by executing the
--   -- rollback, not by reading it: it restored 17 modules instead of 19.)
--   UPDATE available_modules
--      SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) - 'deprecated')::json,
--          updated_at = now()
--    WHERE module_id IN ('vault', 'ectd-coauthor');
--   COMMIT;
--
-- Verified by execution: from the post-migration state (86 live / 103 total)
-- that rollback restores 19 live modules — the exact pre-migration composition —
-- with 103 rows and every subscription still intact, including subscriptions
-- created against reconciled ids after the migration ran.
--
-- Caveat, stated rather than hidden: 'vault' and 'ectd-coauthor' keep the
-- reconciled name/description/path and an unrestricted policy rather than the
-- tiers the legacy seed gave them. The catalog's COMPOSITION is restored
-- exactly; those two rows' contents are not byte-identical to the prior state.

BEGIN;

-- 1) Retire legacy catalog rows that name no real app (keeps FK + subscriptions).
UPDATE available_modules
   SET metadata = COALESCE(metadata::jsonb, '{}'::jsonb) || '{"deprecated": true}'::jsonb,
       updated_at = now()
 WHERE module_id NOT IN (
   'agency-meetings',
   'audit-trail',
   'authoring-engine',
   'batch-draft',
   'biostat-workbench',
   'biostatistics',
   'change-assessment',
   'clinical-ops',
   'cmc',
   'communication-center',
   'crl-library',
   'cro-portfolio',
   'csr-workflow',
   'decision-lineage',
   'deep-research',
   'device-510k',
   'device-cer',
   'device-clinical-studies',
   'device-diagnostics',
   'device-engineering',
   'device-pma',
   'device-postmarket',
   'device-presub',
   'device-software',
   'device-udi',
   'dispatch-readiness',
   'doc-journey',
   'document-authoring',
   'ectd-coauthor',
   'ectd-compile',
   'evidence-search',
   'gateway-transmittals',
   'global-ri',
   'haq-manager',
   'identity-console',
   'inconsistency',
   'ind-checklist',
   'insights',
   'intelligence-catalog',
   'labeling',
   'labeling-pi',
   'lifecycle-mgmt',
   'maa-cockpit',
   'market-access',
   'nda-cockpit',
   'nonclinical',
   'orchestration',
   'orphan',
   'pdev',
   'pediatric',
   'pharmacovigilance',
   'precedent-intelligence',
   'program-journey',
   'projects',
   'protocol-dev',
   'pv-cockpit',
   'pyramid',
   'qmp',
   'quality',
   'rbm',
   'reg-change',
   'registrations',
   'report-governance',
   'research-admin',
   'review',
   'safety-narrative',
   'shadow-review',
   'source-tracer',
   'submission-center',
   'submission-twin',
   'tasks',
   'template-library',
   'vault'
 );

-- 1b) Removed 2026-10-29 (the ectd-publishing fold; see the note at the top). It
-- cleared step 1's deprecation for ectd-publishing alone, the one row it named.

-- 2) Upsert one row per real app, keyed by the surface id.
INSERT INTO available_modules (module_id, name, description, category, path, icon, sort_order, metadata) VALUES
  ('authoring-engine', 'AnA Authoring Engine', 'Capability overview of the CTD authoring engine: the raw-data-to-draft pipeline, the drafting system for each document type, and the deterministic post-checks that run before a draft is promoted. This page describes coverage and does not read your programs — the document editor is where authoring happens.', 'Author & assemble', '/concept2cure/authoring-engine', 'sparkles', 10, '{"tiers": [], "industries": []}'::json),
  ('batch-draft', 'Parallel drafting', 'AnA drafts several dossier sections in parallel. Each section arrives as its own draft for you to accept, and an accepted draft is saved through the same governed section save as an edit you make yourself.', 'Author & assemble', '/concept2cure/batch-draft', 'sparkles', 20, '{"tiers": [], "industries": []}'::json),
  ('cmc', 'CMC / Module 3', 'Module 3 operating system: blueprint, specifications, stability, batch records, convergence.', 'Author & assemble', '/concept2cure/cmc', 'beaker', 30, '{"tiers": [], "industries": []}'::json),
  ('csr-workflow', 'CSR workflow', 'ICH E3 CSR builder + intelligence library.', 'Author & assemble', '/concept2cure/csr-workflow', 'fileText', 40, '{"tiers": [], "industries": []}'::json),
  ('device-510k', '510(k) and eSTAR', 'eSTAR section tree · content editor · predicate/SE intelligence panel. In progress.', 'Author & assemble', '/concept2cure/device-510k', 'fileCheck', 50, '{"tiers": [], "industries": []}'::json),
  ('device-cer', 'Clinical evaluation (CER)', 'Annex XIV structure, FAERS, literature, GSPR checklist, export. Dashboard only today.', 'Author & assemble', '/concept2cure/device-cer', 'microscope', 60, '{"tiers": [], "industries": []}'::json),
  ('device-diagnostics', 'IVDR evidence', 'Classification, performance testing, risk analysis, IVDR, CLIA, CDx, LDT. See ui_kits/risk + ui_kits/labeling.', 'Author & assemble', '/concept2cure/device-diagnostics', 'stethoscope', 70, '{"tiers": [], "industries": []}'::json),
  ('device-pma', 'PMA', 'PMA module status and trial metrics over the program read-model. Had no v2 entry point before the kit shell was retired.', 'Author & assemble', '/concept2cure/device-pma', 'shieldCheck', 80, '{"tiers": [], "industries": []}'::json),
  ('device-presub', 'Pre-submission (Q-Sub)', 'Q-Sub meeting manager. Previously reachable only through a persisted localStorage value — no rail, tab or palette entry existed.', 'Author & assemble', '/concept2cure/device-presub', 'messageSquare', 90, '{"tiers": [], "industries": []}'::json),
  ('doc-journey', 'Document journey', 'One document, ideation → submission: ideate → outline → AnA draft → revise → review → QC → approve (§11 e-sign) → assemble (eCTD leaf) → transmit (ESG). Document state visible at every stage.', 'Author & assemble', '/concept2cure/doc-journey', 'gitBranch', 110, '{"tiers": [], "industries": []}'::json),
  ('document-authoring', 'The editor', 'See HANDOFF_TO_DESIGN_document_authoring.md — editor + Yjs co-author + track-changes + comments + versions + approval + e-sign all have working backends, no UI.', 'Author & assemble', '/concept2cure/document-authoring', 'penLine', 120, '{"tiers": [], "industries": []}'::json),
  ('ectd-coauthor', 'eCTD co-author', 'eCTD tree + section authoring. Back-half pipeline (format→assemble→validate→transmit) is production-grade.', 'Author & assemble', '/concept2cure/ectd-coauthor', 'gitBranch', 140, '{"tiers": [], "industries": []}'::json),
  ('ectd-compile', 'Compile & Export eCTD', 'eCTD 4.0 backbone compile/validate/export across FDA/EMA, keyed on the program’s numeric project id (/api/ectd-compile).', 'Author & assemble', '/concept2cure/ectd-compile', 'gitBranch', 150, '{"tiers": [], "industries": []}'::json),
  ('inconsistency', 'Inconsistency Intelligence', 'Change a governed value once and propagate it across every document that cites it. Draft sections update inline; approved/locked sections are flagged for re-approval with a task, on the audit trail. Matches Artos Inconsistency Intelligence / Weave content-update. Contract ref (not yet a @shared file): server/routes/assumption-decision-contradiction.ts', 'Author & assemble', '/concept2cure/inconsistency', 'gitCompare', 160, '{"tiers": [], "industries": []}'::json),
  ('labeling', 'Labeling', 'Labeling/IFU authoring + compliance. ui_kits/labeling prototyped.', 'Author & assemble', '/concept2cure/labeling', 'tag', 180, '{"tiers": [], "industries": []}'::json),
  ('labeling-pi', 'Prescribing information', 'USPI (PLLR / 21 CFR 201.57), EU SmPC (QRD), SPL. End-of-review agency labeling negotiation (sponsor vs FDA redline). The label as the document.', 'Author & assemble', '/concept2cure/labeling-pi', 'fileText', 190, '{"tiers": [], "industries": []}'::json),
  ('nonclinical', 'Nonclinical / Module 4', 'IND-enabling & CTD Module 4: GLP study registry with finding classification and SEND status, SEND 12-domain conformance, the Module 2.6 written/tabulated summary builder, and Module 4 placement. Structured data entry for studies.', 'Author & assemble', '/concept2cure/nonclinical', 'microscope', 200, '{"tiers": [], "industries": []}'::json),
  ('protocol-dev', 'The protocol workspace', 'Protocol authoring hub (C2C-17..22): full eCTD-style section tree, SoA grid, risk register (5×5), milestones, budget/feasibility, amendments, deviations/CAPA, reviews, informed consent — deterministic completeness gate on finalize (ICH M11 / 45 CFR 46 / PHS Policy).', 'Author & assemble', '/concept2cure/protocol-dev', 'clipboardList', 210, '{"tiers": [], "industries": []}'::json),
  ('source-tracer', 'Source Tracer', 'Sentence-level provenance bound to sourceLinks.ts: every sentence carries a typed SourceLink (sourceType ∈ trial_data|literature|regulatory_guidance|internal_data) with a 0–1 confidence. POST /sources/analyze finds untraced claims (claimsFound). Literature citations are verified against PubMed+CrossRef via /api/citations/verify (verified|not_found|unverifiable|error) — an unconfirmed citation is flagged, never assumed. Fixture-backed with a Sample-data pill until live-wired. Contract ref (not yet a @shared file): server/routes/sourceLinks.ts + server/routes/citations.ts', 'Author & assemble', '/concept2cure/source-tracer', 'search', 220, '{"tiers": [], "industries": []}'::json),
  ('template-library', 'Template library', 'Full REST (list/extract-preview/extract+save/create-from-spec/update/render docx|pdf), org-scoped, audited. No UI yet — strongest backend without a surface.', 'Author & assemble', '/concept2cure/template-library', 'template', 230, '{"tiers": [], "industries": []}'::json),
  ('decision-lineage', 'Decision lineage', 'The immutable, Part-11 hash-chained decision trail behind every governed artifact (who decided what, when, on what evidence, signed how). Answer-first defensibility read, then the readable chain of governed decisions (5 node types), then chain-integrity verify + compliance frameworks + eCTD-compatible export. Bound to GET /api/decision-lineage/:entityType/:entityId + verify-chain. Contract ref (not yet a @shared file): @shared/types/decision-lineage', 'Evidence & data', '/concept2cure/decision-lineage', 'gitBranch', 250, '{"tiers": [], "industries": []}'::json),
  ('device-clinical-studies', 'Device clinical studies', 'Study list, detail, summaries, archetypes and RBM attention. Six endpoints; distinct from clinical-ops, which is the drug-trial operations surface.', 'Evidence & data', '/concept2cure/device-clinical-studies', 'stethoscope', 260, '{"tiers": [], "industries": []}'::json),
  ('device-engineering', 'Engineering evidence', 'Program-scoped engineering rollup. Distinct from design-controls and human-factors, which are org-scoped registers.', 'Evidence & data', '/concept2cure/device-engineering', 'wrench', 270, '{"tiers": [], "industries": []}'::json),
  ('device-software', 'Software lifecycle', 'IEC 62304 software lifecycle and completeness summary. The only implementation in the product.', 'Evidence & data', '/concept2cure/device-software', 'code', 280, '{"tiers": [], "industries": []}'::json),
  ('evidence-search', 'Evidence search (RAG)', 'Ask a question across the corpus — 3-layer memory → gateway → cited answer traced back to source chunks.', 'Evidence & data', '/concept2cure/evidence-search', 'search', 300, '{"tiers": [], "industries": []}'::json),
  ('insights', 'Reporting & analytics', 'Conversational governed reporting — a per-segment catalog of report types and best-practice packs, assembled by AnA and traceable to source.', 'Evidence & data', '/concept2cure/insights', 'barChart', 310, '{"tiers": [], "industries": []}'::json),
  ('vault', 'Vault', 'Drag-drop upload, chunking/embedding progress, semantic search, version history, evidence linking.', 'Evidence & data', '/concept2cure/vault', 'vault', 320, '{"tiers": [], "industries": []}'::json),
  ('gateway-transmittals', 'Gateway transmittals', 'Multi-region agency dispatch: gateway roster + credential status, governed transmit (§11 re-auth + reason), transmittal log, live status poll, ACK download, governed rollback (/api/mdx/gateways).', 'Submit & file', '/concept2cure/gateway-transmittals', 'rocket', 360, '{"tiers": [], "industries": []}'::json),
  ('haq-manager', 'Health authority questions', 'Post-submission review phase: agency IR / Day-120 LoQ / CRL decomposed, source-traced responses with precedent intelligence, governed e-sign into the response package. Contract ref (not yet a @shared file): @shared/types/haq', 'Submit & file', '/concept2cure/haq-manager', 'messageSquare', 370, '{"tiers": [], "industries": []}'::json),
  ('pyramid', 'Submission pyramid', 'Deterministic submission work breakdown — type selector (8 engine + 12 global types), dashboard (progress ring, phase strip, risk gauge, next-available tasks), phase→task drill-down with full-metadata detail sheet (risk, CTD bindings, guidance, deps, deliverables), analytics (resources/bottlenecks, document coverage, critical path), global pyramid browser. Task status is the only client-owned state. Contract ref (not yet a @shared file): services/regulatory/SubmissionPyramidEngine.ts · globalPyramids.ts · submission-type-bridge.ts', 'Submit & file', '/concept2cure/pyramid', 'workflow', 380, '{"tiers": [], "industries": []}'::json),
  ('submission-center', 'Submission Center', 'Framework-agnostic workspace map + error catalog already in shared. Package preview, eValidator pass, ESG send vs eSTAR export picker. See SUBMISSION_CENTER_API.md.', 'Submit & file', '/concept2cure/submission-center', 'rocket', 390, '{"tiers": [], "industries": []}'::json),
  ('submission-twin', 'Submission Twin', 'Living submission intelligence — readiness/fragility, narrative-drift alerts, simulated reviewer challenges, change-impact, keyed on a numeric package id (/api/submission-twin).', 'Submit & file', '/concept2cure/submission-twin', 'layers', 400, '{"tiers": [], "industries": []}'::json),
  ('agency-meetings', 'Agency meetings', 'Agency interactions: Pre-IND/INTERACT/Type A-D/EOP2/pre-NDA-BLA, device Q-Sub, EMA Scientific Advice. Briefing book document + questions, minutes + commitments back to the dossier.', 'Review & govern', '/concept2cure/agency-meetings', 'users', 410, '{"tiers": [], "industries": []}'::json),
  ('dispatch-readiness', 'Submission Readiness', 'The proven, deterministic last gate before transmit (dispatch-gate.ts). Composes structural validation + unacknowledged Shadow Review criticals + external eValidator; a client cannot talk it down (every input server-computed). Flags the cleared-but-never-reviewed blind spot. Bound to GET /api/submissions/sequences/:seqId/dispatch-readiness.', 'Review & govern', '/concept2cure/dispatch-readiness', 'send', 440, '{"tiers": [], "industries": []}'::json),
  ('identity-console', 'Enterprise identity (SSO / SCIM)', 'SCIM provisioning tokens (issue-once/rotate/enable/revoke, §11.10(d) hash-only storage), SCIM IP allowlist, and the live SAML endpoint references for IdP configuration.', 'Review & govern', '/concept2cure/identity-console', 'lock', 450, '{"tiers": [], "industries": []}'::json),
  ('orchestration', 'Orchestration & readiness', 'Persisted workflow engine: workflowRuns (steps · blockers · diffs · pause/resume/retry), approvalCheckpoints (manual/role/quorum/auto), readiness rules + evaluations → overall score, blocker count, isReady gate before filing.', 'Review & govern', '/concept2cure/orchestration', 'workflow', 460, '{"tiers": [], "industries": []}'::json),
  ('qmp', 'Quality management plans', 'Quality-management plan lifecycle (list/create/activate) + completeness/gate-level/risk-factor dashboard (/api/quality).', 'Review & govern', '/concept2cure/qmp', 'shieldCheck', 480, '{"tiers": [], "industries": []}'::json),
  ('quality', 'Quality', 'Quality & Assurance: the SOP / controlled-document register (periodic review, read-and-understood training) and Change control (the change-control log + lifecycle flowchart, ICH Q10 / EU GMP Annex 15, linking changes to deviations, CAPAs and validation records). Backed by /api/mdx/qms/*.', 'Review & govern', '/concept2cure/quality', 'shieldCheck', 490, '{"tiers": [], "industries": []}'::json),
  ('report-governance', 'Report governance', 'Sealed-report lifecycle: list, cryptographic integrity verify, provenance/attestation counts, seal and revoke with justification (/api/intelligent-reports).', 'Review & govern', '/concept2cure/report-governance', 'scroll', 500, '{"tiers": [], "industries": []}'::json),
  ('review', 'The review board', 'Review queue, threaded comments (open/resolved/outdated), reject-with-reason, e-sign manifestation (21 CFR §11.50).', 'Review & govern', '/concept2cure/review', 'checkCircle', 510, '{"tiers": [], "industries": []}'::json),
  ('shadow-review', 'Shadow review', 'AnA simulates the reviewer who will read your submission (5 real lenses: FDA filing / EMA D120 / PMDA / MDR NB / IVDR NB) and scores the two gates that kill a filing — RTF (administrative) and CRL (substantive). Findings are model_assisted; the risk aggregation is the verbatim deterministic aggregateRisk (a single critical saturates). Bound to POST /api/submissions/sequences/:seqId/shadow-review.', 'Review & govern', '/concept2cure/shadow-review', 'eye', 520, '{"tiers": [], "industries": []}'::json),
  ('tasks', 'Tasks', 'Org-scoped unifiedTasks board (@shared/schema unifiedTasks · taskDependencies) + critical-path DAG, channels, messages, activity feed, presence, mentions, due dates. See ui_kits/tasking + ui_kits/task-tray.', 'Review & govern', '/concept2cure/tasks', 'checkSquare', 530, '{"tiers": [], "industries": []}'::json),
  ('crl-library', 'FDA CRL library', 'Searchable view over the shared clinical-regulatory evidence graph — the same findings CSR workflow, study design and AnA read. Not a separate corpus, retrieval path or agent. Behind ENABLE_CLINICAL_REGULATORY_GRAPH.', 'Intelligence & risk', '/concept2cure/crl-library', 'gavel', 540, '{"tiers": [], "industries": []}'::json),
  ('deep-research', 'Deep research', 'Long-running multi-source research (Opus). Shares the AnA rail in deep-research mode.', 'Intelligence & risk', '/concept2cure/deep-research', 'telescope', 550, '{"tiers": [], "industries": []}'::json),
  ('device-postmarket', 'Post-market surveillance and CAPA', 'Device MDR/MAUDE vigilance and CAPA triage. A different regulatory regime from pv-cockpit, which is drug pharmacovigilance.', 'Intelligence & risk', '/concept2cure/device-postmarket', 'shieldAlert', 570, '{"tiers": [], "industries": []}'::json),
  ('global-ri', 'Global regulatory intelligence', 'Gold-standard pattern: ~41 deterministic capabilities, 9 groups, one-call catalog drives nav + dynamic forms. See HANDOFF_TO_DESIGN_global_ri.md.', 'Intelligence & risk', '/concept2cure/global-ri', 'globe', 580, '{"tiers": [], "industries": []}'::json),
  ('intelligence-catalog', 'Intelligence catalog', 'Read-only reference: 142 deterministic_registry tools across 24 domains, with the determinism-pedigree trust system and the shared deterministic-result rendering pattern. Contract ref (not yet a @shared file): server/services/ana/tool-pedigree.ts', 'Intelligence & risk', '/concept2cure/intelligence-catalog', 'shieldCheck', 590, '{"tiers": [], "industries": []}'::json),
  ('precedent-intelligence', 'Precedent intelligence', 'Past approvals search + decision rationale. Slots into 510(k) §12 substantial equivalence.', 'Intelligence & risk', '/concept2cure/precedent-intelligence', 'scale', 600, '{"tiers": [], "industries": []}'::json),
  ('change-assessment', 'Change assessment', 'Change impact engine: FDA "When to Submit a 510(k) for a Change" (2017) + EU MDR significant-change (MDCG 2020-3) determinations → new submission vs document-to-file.', 'Lifecycle & access', '/concept2cure/change-assessment', 'gitBranch', 620, '{"tiers": [], "industries": []}'::json),
  ('device-udi', 'UDI & device identification', 'UDI/GUDID summary and document catalog. The only UDI surface; labeling itself lives on the labeling surface.', 'Lifecycle & access', '/concept2cure/device-udi', 'barcode', 630, '{"tiers": [], "industries": []}'::json),
  ('lifecycle-mgmt', 'Lifecycle management', 'Post-approval: supplements/variations (sBLA, Type II/IB, CBE-30), CMC change control classified against ICH Q12, and renewal cycles (PADER, 5-year, re-examination).', 'Lifecycle & access', '/concept2cure/lifecycle-mgmt', 'history', 640, '{"tiers": [], "industries": []}'::json),
  ('market-access', 'Market access', 'Commercial bridge: payer coverage (CMS NCD/LCD, private, HTA), value-dossier composer (AMCP/NICE/budget-impact), coding strategy (CPT/PLA/HCPCS), access sequencing.', 'Lifecycle & access', '/concept2cure/market-access', 'creditCard', 650, '{"tiers": [], "industries": []}'::json),
  ('orphan', 'Orphan & rare', 'Orphan-drug / rare-disease designations across FDA/EMA/PMDA, RPD priority-review vouchers & grants, and patient-advocacy engagement.', 'Lifecycle & access', '/concept2cure/orphan', 'sparkles', 660, '{"tiers": [], "industries": []}'::json),
  ('pediatric', 'Pediatric (PIP / PSP)', 'FDA §505B PREA / iPSP and EMA PIP: plans, deferrals, waivers, extrapolation rationale and PREA milestones.', 'Lifecycle & access', '/concept2cure/pediatric', 'users', 670, '{"tiers": [], "industries": []}'::json),
  ('reg-change', 'Regulatory change intelligence', 'Portfolio horizon scan: monitors FDA guidance, ISO/IEC revisions, EU MDCG/MDR-IVDR and statutory changes; assesses impact and resolves each to an action document (gap analysis, transition plan, update task) — never a passive feed.', 'Lifecycle & access', '/concept2cure/reg-change', 'bell', 680, '{"tiers": [], "industries": []}'::json),
  ('registrations', 'Registrations', 'Global registration lifecycle: market authorization status, agency review clocks, renewals/variations, HA commitments, reliance-pathway strategy.', 'Lifecycle & access', '/concept2cure/registrations', 'globe', 690, '{"tiers": [], "industries": []}'::json),
  ('program-journey', 'Program journey', 'The end-to-end biotech/pharma spine — concept to submission to lifecycle. 9 lifecycle stages, each with its agency gate, deliverables and the deep-linked capabilities that serve it, plus program intelligence: CTD readiness, review clock, predicted HAQs, contradictions and blockers.', 'Program journey', '/concept2cure/program-journey', 'workflow', 700, '{"tiers": [], "industries": []}'::json),
  ('communication-center', 'Communication', 'The regulated FDA↔client loop: agency communications (9 source types) auto-generating tasks, submission lifecycle incl. CRL/RTF/denial (rejected_or_remediation) → response → resubmit, HA interactions + PMR/PMC/REMS commitments, authority profiles.', 'Applications & filing', '/concept2cure/communication-center', 'mail', 710, '{"tiers": [], "industries": []}'::json),
  ('ind-checklist', 'IND forms', 'IND checklist, forms (1571/1572/3674), autodraft, master data, amendments, annual reports, safety reports.', 'Applications & filing', '/concept2cure/ind-checklist', 'clipboardList', 730, '{"tiers": [], "industries": []}'::json),
  ('maa-cockpit', 'MAA / non-US Module 1', 'Non-US marketing-application administrative module (eCTD Module 1) — region-accurate required-component checklist for EMA/PMDA/MHRA/TGA/HC/NMPA over the global-RI regional-module1-requirements engine.', 'Applications & filing', '/concept2cure/maa-cockpit', 'globe', 740, '{"tiers": [], "industries": []}'::json),
  ('nda-cockpit', 'NDA / BLA filing', 'NDA/BLA filing cockpit: CTD M1–5 readiness, Module 1 admin set (356h), PDUFA review clock, Refuse-to-File risk (shadow review).', 'Applications & filing', '/concept2cure/nda-cockpit', 'beaker', 750, '{"tiers": [], "industries": []}'::json),
  ('pdev', 'Product development (PDEV → IND)', 'See PDEV_IND_DESIGN_BRIEF.md. Activity → AI draft → evidence → confirm flow prototyped in ui_kits/pdev.', 'Applications & filing', '/concept2cure/pdev', 'workflow', 760, '{"tiers": [], "industries": []}'::json),
  ('biostat-workbench', 'Biostat workbench', 'Real statistical engine: reviewer-risk defensibility assessment + design calculators (assurance), replacing the client-side normal approximation.', 'Science & intelligence', '/concept2cure/biostat-workbench', 'sigma', 770, '{"tiers": [], "industries": []}'::json),
  ('biostatistics', 'Biostatistics', 'SAP authoring, power analysis, TLF shells, adaptive trial plans, IDMC.', 'Science & intelligence', '/concept2cure/biostatistics', 'sigma', 780, '{"tiers": [], "industries": []}'::json),
  ('clinical-ops', 'Clinical operations', 'Clinical-development operations: studies & enrollment, study sites with RBM risk linkage, DSMB / interim reviews, and protocol deviations with CAPA. Structured data entry for sites and deviations.', 'Science & intelligence', '/concept2cure/clinical-ops', 'users', 790, '{"tiers": [], "industries": []}'::json),
  ('pharmacovigilance', 'Pharmacovigilance', 'Safety surveillance: signal detection (PRR/FAERS/EudraVigilance), PSUR/PBRER aggregate-report cycles, expedited 7/15-day submissions across approved products.', 'Science & intelligence', '/concept2cure/pharmacovigilance', 'shieldAlert', 800, '{"tiers": [], "industries": []}'::json),
  ('pv-cockpit', 'PV cockpit', 'Safety-surveillance workbench: KPIs, disproportionality screener (PRR/ROR/EBGM), expedited-reporting clock, regional compliance matrix (/api/pharmacovigilance).', 'Science & intelligence', '/concept2cure/pv-cockpit', 'shieldAlert', 810, '{"tiers": [], "industries": []}'::json),
  ('rbm', 'Risk-based monitoring', 'ICH E6(R3) RBQM domain shell — 10 surfaces (overview, risk review report, RACT, KRIs, QTLs, central monitoring, patient profiles, site risk, site oversight, monitoring plan) over the /api/mdx/rbm-* routes, read through the aggregated board (GET /api/mdx-rbm/rbm-board/:programId). 5 deterministic engines produce every score; assessment + plan approvals are Part 11 governed (reason-for-change + e-sign). Every in-surface edit is a real write followed by a board re-read — no local optimistic state. Write layer: client/src/concept2cure/v2/surfaces/rbmWrites.tsx.', 'Science & intelligence', '/concept2cure/rbm', 'shieldCheck', 820, '{"tiers": [], "industries": []}'::json),
  ('safety-narrative', 'Safety narrative / PV', 'SAE narrative generation, ICSR, signal handling.', 'Science & intelligence', '/concept2cure/safety-narrative', 'shieldAlert', 830, '{"tiers": [], "industries": []}'::json),
  ('cro-portfolio', 'Sponsor portfolio', 'CRO multi-sponsor rollup. croClients → croStudies → croRegulatorySubmissions, every query org-scoped. Drill into a sponsor; each submission flows through its matching pathway onto the shared Submission Center lifecycle.', 'Portfolio & studies', '/concept2cure/cro-portfolio', 'network', 840, '{"tiers": [], "industries": []}'::json),
  ('projects', 'Projects', 'Entry to everything. Partially built in ui_kits/home and ui_kits/mdx.', 'Portfolio & studies', '/concept2cure/projects', 'folder', 850, '{"tiers": [], "industries": []}'::json),
  ('research-admin', 'Research administration', 'Research-administration workspace (C2C-14/15/16/01-02): IRB/IACUC/IBC governance with convene→quorum→voting poll + finalize determination, Medicare coverage analysis (NCD 310.1) billing grid, intelligent grant finder (fit scoring), CITI training matrix, continuing-review portfolio analytics.', 'Research administration', '/concept2cure/research-admin', 'network', 860, '{"tiers": [], "industries": []}'::json)
ON CONFLICT (module_id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  path        = EXCLUDED.path,
  icon        = EXCLUDED.icon,
  sort_order  = EXCLUDED.sort_order,
  -- Assign the unrestricted policy outright. `metadata` is seed-only in this
  -- codebase — the admin toggle writes module_subscriptions.enabled, and
  -- nothing anywhere UPDATEs available_modules.metadata — so there is no
  -- operator-authored tier/industry policy here to preserve, and the tiers the
  -- legacy seed carried on 'vault' / 'ectd-coauthor' are that same stale guess.
  -- Assigning EXCLUDED also clears any {"deprecated": true} set by step 1,
  -- because these ids ARE real apps.
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

COMMIT;
