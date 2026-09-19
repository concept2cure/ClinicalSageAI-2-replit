# Slice 6 design — `c2c_estar_slot_map` and the eSTAR attachment surface

Date: 2026-09-08. Branch `concept2cure-v2`. **A design record, not a report of work done.**
Nothing in it is built. It is the output of a judged, adversarially-verified panel run on
2026-09-08, saved here because it is the specification the next session builds from and
because several of its measurements correct earlier reports.

## How it was produced

| phase | agents | what they did |
|---|---|---|
| Survey | 6 | read the shipped engine, the governance primitives, the persistence patterns, the surface, the slot/section data, and the failure modes |
| Design | 3 | independent designs under a minimal-surface, a Part-11-governed, and an operator lens |
| Judge | 6 | two per design — one checking every factual claim against the code, one judging honesty and usability |
| Refute | 5 | adversarial, one lens each: correctness, tenant isolation + Part 11, migration replay, honesty, zero duplication |
| Synthesize | 1 | one buildable specification answering every surviving attack |

**Scores: operator 87, governed 81, minimal 77. 34 attacks, 23 of them high severity.** The
synthesis re-measured the templates itself and overturned parts of the winning design.

## What it already changed in shipped code

Three findings were defects in code already on the branch, and are FIXED (`3bb1a3049`):

1. **The CER / De Novo kill-switch.** The attachment resolver read the newest governed
   document of any device class, and the rule-pack keys it files by collide across packs
   (k510 `D5` = "Shelf life and packaging", denovo `D5` = "Cybersecurity"). Verified against
   `migrations/20260901b_estar_510k_denovo_outlines.sql` before acting.
2. **`base.attachmentReport` was seeded too late**, so two refusals produced a 422 with no
   report at all.
3. It independently rediscovered the `client: requestDb(req)` runtime crash already fixed in
   `a9042cc52`, and warns that any design reinstating it re-breaks every authored-section
   attachment.

## Reading it

Section 0 is the panel's own measurements of the vendored templates, taken through the
shipped readers. Several correct the earlier reports — in particular **zero slots on either
template fail to resolve** once the template's own datasets values are supplied, which is
what `planEstarAttachments` already does. The "User Fee Form is unplaceable" concern that
shaped an earlier design is wrong.

**This is a proposal.** It has not been implemented, its DDL has not been applied, and its
route contracts have not been written. Where it disagrees with a shipped file, the file wins
until someone re-measures.

---

I verified every load-bearing claim against the working tree at `df67a011b`. Measurements below are mine, reproduced from the vendored PDFs.

---

# SLICE 6 — `c2c_estar_slot_map`: the persisted section→slot judgement

## 0. What I measured before deciding anything

Script: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/4828b890-97af-51ec-9868-cce2e18c89c8/scratchpad/m.ts` and `c.ts`, run through the shipped `listEstarAttachmentSlots` + `resolveAttachmentSlot` + `readXfaDatasetsValues` against `assets/estar-templates/*.pdf`.

| | nIVD | IVD |
|---|---|---|
| slots / distinct chapters | 113 / 67 | 145 / 78 |
| null descriptions | **0** | **0** |
| duplicate SOM paths within a template | **0** | **0** |
| single-attachment slots | 5 | 5 (identical set) |
| multi-chapter slots | 1 (`ADAddAttachment910`) | 1 (same) |
| **slots unresolved WITH the template's own datasets values** | **0** | **0** |
| slots unresolved WITHOUT values | 1 | 1 |
| description-prefix families | **22** | **22** |
| descriptions containing literal `&amp;` | 4 | 5 |
| `(description, chapter)` collision groups | 4 (11 slots) | 14 (36 slots) |
| slots still ambiguous after `(description, chapter, field)` | **0** | **6** |

Cross-template: **102 shared SOM paths, 41 routing to a different `/CHAPTER` token.** 11 nIVD-only, 43 IVD-only. Both templates ship `root.AttachmentManifest = "***Start***"` and `root.ApplicationType.ATRadioButton100 = "1"`.

Five facts that overturn parts of the winning design:

1. **The User Fee Form is fully placeable.** With values supplied — which `planEstarAttachments` already does at `estar-attachment-plan.ts:243` — **zero** slots on either template fail to resolve. The winning design's "`ADAddAttachment910` is unmappable / offered and refused in place" is false in three places. `chapter_at_decision NOT NULL` is safe; the "MDUFA cover sheet is unplaceable" attack is answered by supplying values, not by relaxing the column.
2. **`VendoredEstarTemplate` carries no `sha256`, and on an unpinned drop-point none is ever computed** — `estar-template-registry.ts:173-177` evaluates `createHash` only inside the `pinned` branch. The `template_sha256 CHAR(64) NOT NULL` column is unobtainable there. **Dropped.**
3. **`loadGovernedDeviceDocument` and `loadGovernedDeviceSections` already take a `docTypes` parameter** (`estar-content-leaves.ts:266-276, 291-306`). The D5/E1 pathway collision and the CER kill-switch are both fixed by *passing the export's own doc class*, not by a `source_document_id` column. **Column dropped.**
4. **HEAD already deleted `client: requestDb(req)`** from `createDeviceAttachmentResolver` with an eleven-line comment at `510k-estar-routes.ts:1060-1072`. Any spec that reinstates it re-breaks every authored-section attachment. Not reinstated.
5. **`dataGateContract.test.tsx`'s `code()` strips `//` comments** (`:212-215`). The LEAKY ban catches type annotations and strings, not comments.

---

## 1. DDL — `migrations/20260909_estar_slot_map.sql`

Root tree, so it reaches both `install-fresh`'s overlay and `C2C_MIGRATION_FILES`.

```sql
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA eSTAR attachment routing
-- Compliance: 21 CFR Part 11 (attributability, traceability), ALCOA+
-- Purpose: Persist WHICH authored section / vault document a person decided
--          belongs in WHICH named CDRH attachment slot. planEstarAttachments()
--          takes that decision as an INPUT and owns every mechanical way it can
--          be executed wrongly. Nothing derives the decision, and nothing
--          should. Before this table it lived only in a request body nobody
--          kept, reachable by hand-built HTTP and by no UI.
--
-- eCTD/CTD Context:
--   - Module(s): CDRH premarket eSTAR v7.0 (nIVD 113 slots / IVD 145 slots)
--   - Integrity Risk Addressed: an unpersisted map cannot be reviewed before
--     filing, reconstructed after it, or attributed to a decider.
--
-- Determinism Contract:
--   - `ordinal` exists because planEstarAttachments is ORDER-DEPENDENT by
--     design (estar-attachment-plan.ts:232-238): the single-attachment winner,
--     the duplicate-name winner, and the /EmbeddedFiles name-tree key
--     (attachmentDataObjectName(at, REQUEST INDEX), :291) are all functions of
--     request order. Every read of this table applies the total ORDER BY in the
--     header of server/services/pathway-engines/estar/estar-slot-map.ts.
--   - `chapter_at_decision` records the /CHAPTER token resolveAttachmentSlot
--     returned when the placement was saved, and planEstarAttachments compares
--     it per request. MEASURED 2026-09-08 against the two vendored templates:
--     102 SOM paths exist in both and 41 route to a DIFFERENT chapter (e.g.
--     root.Labeling.OtherLabeling.LBAddAttachment360 is /CHAPTER 5/CH5.10/ on
--     nIVD and /CHAPTER 5/CH5.08/ on IVD). That number is a dated measurement
--     of TODAY'S two files, not a property of eSTAR. The comparison is
--     edition-agnostic: it catches an FDA 7.1 that moves a chapter under the
--     SAME descriptor, which is the case the descriptor key does not cover.
--
-- Notes:
--   - public schema, organization_id INTEGER NOT NULL: both tenant sweeps are
--     public+integer, so the isolation sweep that CLOSES C2C_MIGRATION_FILES
--     policies this table (CLAUDE.md RULE 1, corollary 2). Registered above the
--     final pair for exactly that reason. The integer sweep SKIPS a TEXT/uuid
--     tenant key with a NOTICE and no error, so a uuid org column would ship
--     silently unpoliced.
--   - FK-free on program_id: deploy-migrate runs stopOnFirstFailure
--     (scripts/db/deploy-migrate.mjs), so an unguarded REFERENCES to a parent
--     some lineage lacks aborts the rest of the set INCLUDING the sweep. The
--     route asserts ownership against regulatory_programs instead, the way
--     server/routes/mdx-industry-context.ts does for project_industry_profiles.
--     The organizations(id) reference is guarded below for the same reason —
--     migrations/20260908b_estar_submissions_filed_artifact.sql's header
--     records what an unguarded reference cost that lineage.
--   - NO template_sha256 column. listVendoredTemplates
--     (estar-template-registry.ts:157-184) returns {fileName, bytes, integrity}
--     and computes a hash ONLY in the `pinned` branch, so on an unpinned
--     drop-point (ESTAR_TEMPLATE_DIR with no checksums.txt — a supported
--     state; isUsableEstarTemplate allows it and estar-fill only warns) there
--     is no hash to store. A NOT NULL column there is unwritable and a
--     defaulted one makes its own guard inert. chapter_at_decision carries the
--     edition claim per row, at the granularity that actually matters.
--   - NO source_document_id column. loadGovernedDeviceDocument /
--     loadGovernedDeviceSections (estar-content-leaves.ts:266, :291) already
--     take a `docTypes` parameter; narrowing it to the export's own class is a
--     smaller, stronger fix than a stored id, and it cannot disagree with the
--     rows that were actually loaded. See §4.2.
--   - NO SEED. RULE 1 corollary 1 makes a seeded row correctable only by
--     minting a new version row, and a default map is 113 hand-transcribed SOM
--     paths. This module has already shipped two transcription errors that
--     survived review, both recorded in its own docblock
--     (estar-attachment-slots.ts:22-32, :81-87). The table ships EMPTY.
--   - Purge: 'c2c_estar_slot_map' is added to PURGE_CHILD_TABLES
--     (server/services/tenant/tenant-offboarding.ts:473).
--
-- REMOVAL: this file is AMENDED IN PLACE with a dated header note. There is no
-- rollback DROP and none is offered: every entry of C2C_MIGRATION_FILES
-- re-executes on every deploy, so an appended DROP either reverts on the next
-- apply or re-creates-and-re-drops forever, destroying tenants' filing
-- decisions with a green deploy each time (CLAUDE.md RULE 1). A DROP TABLE line
-- in this header would be an instruction to do exactly that; the amendment
-- pattern to follow instead is migrations/20260907_cmc_comparability_register_
-- reachable.sql:34-41 — amend the creator so nothing re-creates the object,
-- and a companion file removes it from databases the old creator already ran on.
-- =============================================================================

CREATE TABLE IF NOT EXISTS c2c_estar_slot_map (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- INTEGER so 20260801_tenant_isolation_sweep.sql attaches a policy.
  organization_id      INTEGER NOT NULL,

  -- regulatory_programs.id. NOT NULL: createDeviceAttachmentResolver refuses
  -- EVERY source when programUuid is null (estar-attachment-plan.ts:409-418),
  -- so a program-less row could never resolve. Every key column being NOT NULL
  -- also avoids the two-partial-index dance NULL-distinctness forces on
  -- migrations/20260814b_literature_screening_decisions.sql.
  program_id           UUID NOT NULL,

  -- estar-template-registry.ts descriptor id: '510k-device' | '510k-ivd' |
  -- 'de_novo-device' | 'de_novo-ivd' | 'pma-device' | 'pma-ivd'. NOT
  -- (type, variant) — two columns for one fact, admitting pairs no template
  -- exists for. NOT the template FAMILY either, even though the slot SET is a
  -- family property (510k-device, de_novo-device and pma-device all read
  -- eSTAR-510k-non-ivd.pdf): the SECTION namespace is per-pathway, and the
  -- k510 and denovo rule packs reuse lettered keys for different sections —
  -- D5 is "Shelf life and packaging" in one and "Cybersecurity" in the other
  -- (migrations/20260901b_estar_510k_denovo_outlines.sql). A family-keyed map
  -- survives a pathway pivot and files the wrong section under a clean 200.
  descriptor_id        VARCHAR(32) NOT NULL,

  -- EstarAttachmentSlot.somPath — the control's FULL SOM path. Never the short
  -- name: nIVD declares `AddAttachment` twice and IVD declares five names
  -- twice, and the slot keying-on-name dropped in nIVD was Biocompatibility.
  -- NOT validated against the template here: listEstarAttachmentSlots reads
  -- the shipped bytes and planEstarAttachments refuses an unknown slot; a CHECK
  -- would be a second copy that drifts on the next FDA edition.
  slot_som_path        TEXT NOT NULL,

  -- The chapter resolveAttachmentSlot returned at save time. No regex CHECK:
  -- ESTAR_CHAPTER_PATH lives in estar-attachment-slots.ts and
  -- attachmentManifestToken already throws on a malformed chapter. A POSIX copy
  -- here would turn a refusal-with-a-sentence into a 23514 the moment FDA ships
  -- a CHAPTER 7 — a constraint violation instead of fail-closed-with-a-reason.
  chapter_at_decision  TEXT NOT NULL,

  -- EstarAttachmentSource discriminant, and its key: a
  -- c2c_document_sections.section_key, or a vault.documents.id as text.
  source_kind          VARCHAR(24) NOT NULL,
  source_ref           TEXT NOT NULL,

  -- The ACCEPTED file name — what the /Filespec /F and /UF carry and what the
  -- manifest token names. NOT NULL and always resolved: the route runs the real
  -- planner at save time, so the stored name is the name the export will use.
  -- TEXT, not VARCHAR(124): ATTACHMENT_PATH_MAX_LENGTH is already a transcribed
  -- constant asserted against the template (estar-attachment-slots.ts:356) and
  -- a column width would be a third copy.
  file_name            TEXT NOT NULL,

  -- Plan order. Ties break on the rest of the unique key, so the read is total.
  ordinal              INTEGER NOT NULL,

  -- WHO made THIS placement, when, and why. Per PLACEMENT, never per save: a
  -- save that re-points one row must not restamp the other twenty-nine, or the
  -- table positively asserts an attribution that is false. The route's diff
  -- (§3.4) writes these only on an inserted or materially-changed row.
  decided_by           INTEGER NOT NULL,
  decided_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision_reason      TEXT NOT NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guarded so the file converges on a database an earlier deploy created the
-- table on. Every one of these is name-keyed, so amending a CHECK's BODY in
-- place does NOT reach a provisioned database — see the REMOVAL note above and
-- db/migrations/20260730_c2c_ana_actions_command_vocab.sql for the two-part
-- shape a widening actually needs.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_estar_slot_map_org_fk')
     AND to_regclass('public.organizations') IS NOT NULL THEN
    ALTER TABLE c2c_estar_slot_map
      ADD CONSTRAINT c2c_estar_slot_map_org_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_estar_slot_map_source_kind_chk') THEN
    ALTER TABLE c2c_estar_slot_map ADD CONSTRAINT c2c_estar_slot_map_source_kind_chk
      CHECK (source_kind IN ('authored_section', 'vault_document'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_estar_slot_map_nonblank_chk') THEN
    ALTER TABLE c2c_estar_slot_map ADD CONSTRAINT c2c_estar_slot_map_nonblank_chk
      CHECK (btrim(source_ref) <> '' AND btrim(chapter_at_decision) <> ''
             AND btrim(file_name) <> '' AND btrim(decision_reason) <> '');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_estar_slot_map_slot_chk') THEN
    ALTER TABLE c2c_estar_slot_map ADD CONSTRAINT c2c_estar_slot_map_slot_chk
      CHECK (slot_som_path LIKE 'root.%');
  END IF;
END
$do$;

-- ONE PLACEMENT, ONCE. The same document filed twice into the same slot puts
-- two routing tokens in the AttachmentManifest and two files in the package.
-- Not hypothetical: migrations/20260906_artifact_section_map_unique.sql records
-- c2c_artifact_section_map shipping the same document TWICE into an
-- agency-bound eCTD package because it had plain indexes only.
--
-- Deliberately NOT unique on (…, slot_som_path) alone: most slots legally take
-- more than one file. The five single-attachment controls per template are
-- FDA's own rule, READ from the template and refused by planEstarAttachments
-- (:272-279). Restating that cardinality here would transcribe a regulatory
-- constant and create a second definition of it.
CREATE UNIQUE INDEX IF NOT EXISTS c2c_estar_slot_map_placement_uq
  ON c2c_estar_slot_map
     (organization_id, program_id, descriptor_id, slot_som_path, source_kind, source_ref);

-- One file name is used once per (program, descriptor): checkAttachmentAcceptance
-- refuses a duplicate path and the template DELETES the second file. Enforcing
-- it here is not a copy of that rule — it is the storage-layer half that stops
-- two concurrent saves from committing a pair the single-request check could
-- never see.
CREATE UNIQUE INDEX IF NOT EXISTS c2c_estar_slot_map_filename_uq
  ON c2c_estar_slot_map (organization_id, program_id, descriptor_id, file_name);

CREATE INDEX IF NOT EXISTS c2c_estar_slot_map_read_idx
  ON c2c_estar_slot_map (organization_id, program_id, descriptor_id, ordinal);
CREATE INDEX IF NOT EXISTS c2c_estar_slot_map_org_program_idx
  ON c2c_estar_slot_map (organization_id, program_id);

COMMENT ON TABLE c2c_estar_slot_map IS
  'Which authored section / vault document a person decided belongs in which named eSTAR attachment slot, per organization + regulatory program + template descriptor. An INPUT to planEstarAttachments(), never derived.';
COMMENT ON COLUMN c2c_estar_slot_map.chapter_at_decision IS
  'The /CHAPTER token resolveAttachmentSlot returned when this placement was saved. Measured 2026-09-08: 41 of the 102 SOM paths present in both vendored templates route to a different chapter, so a stored slot path without its chapter can re-route silently across an edition change.';
COMMENT ON COLUMN c2c_estar_slot_map.descriptor_id IS
  'estar-template-registry descriptor id. Keyed on the descriptor, not the template family: the six marketing descriptors resolve to two PDFs, but the k510 and denovo rule packs reuse lettered section keys for different sections.';
COMMENT ON COLUMN c2c_estar_slot_map.decided_by IS
  'WHO made THIS placement. Written only when the row is inserted or its filing consequence changes; a save that re-points one placement never restamps the others.';
```

### The exact registration line

`scripts/db/migration-set.mjs` — insert **after line 2027** (`'migrations/20260908b_estar_submissions_filed_artifact.sql',`) and **before line 2029** (`UUID_TENANT_ISOLATION_NONPUBLIC,`). Line 2040 is `TENANT_ISOLATION_SWEEP,`; 2042 closes.

```js
  // ── The eSTAR slot map: which document goes in which named CDRH slot ─────
  // planEstarAttachments() takes the section→slot decision as an INPUT; which
  // authored section or vault document belongs in which of the 113 (nIVD) /
  // 145 (IVD) slots is a regulatory judgement no machine derives. This is
  // where that judgement is persisted, per organization + program + template
  // descriptor, so a surface has somewhere to save to and a reviewer can
  // reconstruct what the filed form routed and who decided it.
  //
  // MUST stay ABOVE the isolation pair below. This is a NEW public,
  // integer-keyed tenant table and the sweep is what attaches
  // tenant_isolation_policy to it; below the sweep it ships with no policy at
  // all, silently — the policy TOTAL goes up as unprotected tables are added,
  // so nothing reports it. Under RLS_ENFORCE=on that is one manufacturer's
  // filing plan readable by another. FK-free on program_id, and the
  // organizations FK is to_regclass-guarded: deploy-migrate is
  // stopOnFirstFailure, so an unguarded REFERENCES to a parent some lineage
  // lacks aborts the rest of the set including the sweep itself.
  'migrations/20260909_estar_slot_map.sql',
```

Companion edits demanded by the gates:
- **Drizzle model** `c2cEstarSlotMap` appended to the existing `shared/schema/estar-submission.ts` (already re-exported at `shared/schema/index.ts:561`; no new file — `HANDOFF_DEVICE.md` §2 forbids proliferation). Required because `ci:insert-columns-declared` resolves every column of a static `INSERT INTO c2c_estar_slot_map (...)` against that table's Drizzle model. That file is off the `drizzle.config.ts` push surface, so the migration is the only creator on every path — exactly how `estar_submissions` already works.
- `'c2c_estar_slot_map'` added to `PURGE_CHILD_TABLES` (`server/services/tenant/tenant-offboarding.ts:473`).

---

## 2. The three changes to shipped engine files

Each is small, each is justified by something I measured, and each keeps one implementation.

### 2.1 `EstarAttachmentRequest.expectedChapter?: string` — `estar-attachment-plan.ts`

A sixth refusal, inserted between #2 (chapter unresolved, `:266-270`) and #3 (single-attachment, `:272`):

```ts
if (request.expectedChapter && request.expectedChapter !== resolvedSlot.chapter) {
  refuse(
    request.fileName ?? null,
    `${slot.somPath} routes to ${resolvedSlot.chapter} on this template, but this placement was ` +
      `decided when it routed to ${request.expectedChapter}. The same control files into a ` +
      `different CDRH chapter on a different eSTAR family or edition — re-confirm the placement ` +
      `rather than filing into a chapter nobody chose.`,
  );
  continue;
}
```

**It goes in the planner, not the route.** The attacks are right that a route-level check leaves every other caller of `fillEstarSubmission` unguarded. A caller that omits the field behaves byte-for-byte as today.

**Is it reachable?** The critics argued it is dead because the descriptor key already blocks cross-family replay. Half right, and it changes the justification rather than the code: cross-family is now blocked earlier and more loudly (§3.5), so the live trigger is a **new FDA edition under the same descriptor** — 7.1 keeping 113 slots and moving a chapter. Nothing in the repo catches that today: `__tests__/estar-attachment-slots.test.ts` asserts `chapters.length === 1` and the chapter regex, and **binds no `somPath` to a `chapter` value**, so such an edition passes the entire suite. Test 3 in §6 is the first thing that would catch it.

**Deliberately NOT a whole-export edition blocker.** A `template_sha256` mismatch 422 would block every customer's export estate-wide the moment we update a vendored PDF, including the ~100 placements that did not move. Per-row is proportionate.

### 2.2 `docTypes` plumbed to the resolver — `estar-content-leaves.ts` + `estar-attachment-plan.ts`

`LoadDeviceContentLeavesOptions` gains `docTypes?: ReadonlyArray<string>`, forwarded by `loadAuthoredDeviceSections`'s governed branch into the `loadGovernedDeviceSections(orgId, programId, client, docTypes)` call it already makes with three arguments (`estar-content-leaves.ts:432`). `DeviceAttachmentResolverInput` gains the same field and passes it through.

`POST /official` supplies `docTypes: [ESTAR_TYPE_DOC_CLASS[type]]` — `510k → 'k510'`, `de_novo → 'denovo'`, `pma → 'pma'`.

This one parameter answers four separate attacks at once:

- **The D5 / E1 pathway collision.** A 510(k) export reads only the `k510` document. `D5` can no longer silently become "Cybersecurity" because someone scaffolded a De Novo.
- **The CER kill-switch.** `GOVERNED_DEVICE_DOC_TYPES` includes `'cer'`, and `loadGovernedDeviceDocument` is `ORDER BY created_at DESC LIMIT 1` across all four. Today, generating a CER for a device program changes what an eSTAR export reads. Narrowing removes it. This is a **latent defect in shipped code** that the slice fixes as a side effect.
- **The double-load instability.** No second `loadGovernedDeviceDocument` call is introduced, so there is no pair of lookups that can disagree on a `created_at` tie.
- **The `source_document_id` column and its two-query comparison** are unnecessary. `UNIQUE (document_id, section_key)` plus a fixed doc class makes `section_key` an identity again.

The docblock at `estar-content-leaves.ts:259-264` already names this exact use: *"`docTypes` lets the EU technical-file assembler select ONLY the program's `mdr` document: 'latest governed document of any device type' would let a CER be packaged as the MDR technical file."* The eSTAR path is the same argument, unapplied.

### 2.3 Two `export` keywords, and one assignment moved

- `export` on `resolveTemplateBytes` (`estar-fill.ts:208`) and on `PLAN_INPUT_PATHS` (`estar-attachment-plan.ts:86`). Without these the new routes must restate the descriptor→bytes match and the datasets path list — a second, drifting definition of a regulatory constant, which is exactly what §5 refuses elsewhere. The route file already carries two hand-copies of the descriptor→file match (`:785-789`, `:1292`) and the second one documents what divergence cost.
- **`base.attachmentReport` moves inside the try.** `estar-fill.ts:466-480`: the assignment sits *after* the `catch` that turns a `manifestSeed` throw into a blocker and returns `REFUSED`. So a `NO_MANIFEST_NODE` / `MANIFEST_NOT_PRISTINE` template produces a 422 with a blocker and **no `attachmentReport` at all** — the operator sees "Cannot attach documents to this eSTAR: …" and nothing about which of their thirty placements was involved. Seed it with `{requested, attached: [], refused: [], manifest: null}` before the `try`.

**No `createDeviceAttachmentDescriber`, no bytes-free `ResolvedAttachmentContent`, no second refusal vocabulary.** Section §3.3 explains what replaces it.

---

## 3. Route contracts

All new handlers live in `server/routes/510k-estar-routes.ts` (no new route file), behind the existing router mount. All slot-map SQL runs through `queryableFromDrizzle(tx)` over a `requestDb(req).transaction(...)` — never the shared `db` or `pool`. That keeps the file off the `ci:requestdb-coverage` backlog (it imports only `requestDb` today, at `:74`, and appears nowhere in `docs/reports/requestdb-coverage-baseline.json`) and gives `setTenantContextTx`, `recordGovernedAction` and `DeviceContentClient` the pg-style `.query(text, params)` they all require on the *same* connection.

**Deliberate: every slot-map statement is raw SQL with a literal `organization_id = $n`, not the Drizzle query builder.** `scripts/ci/check-drizzle-tenant-scope.mjs:125` matches `/\bdb\s*\.\s*(select|insert|update|delete)\b/`, so a `tx.insert(...)` is invisible to the estate's only tenant-scope detector. Rather than write code the gate structurally cannot see and then report the gate green as evidence of safety, the predicate goes where it actually protects the rows, and test 9 asserts it by source scan.

### 3.1 `GET /api/510k/estar/attachment-slots?type=&variant=`

Gates: `authMiddleware` only, matching `GET /official-fields`. FDA's own template data shaped by our reader; not tenant data.

```ts
{ descriptorId, templateFileName, templateVersion,
  integrity: 'verified' | 'unpinned' | 'mismatch',
  slots: Array<{
    somPath, field, parentPath,        // parentPath = somPath minus the last segment
    description: string,               // FDA's string, verbatim, entities included
    chapter: string,                   // resolveAttachmentSlot WITH the template's own values
    singleAttachment: string | null,
  }> }
```

`chapter` is non-null for every slot on both vendored templates — measured, 0 of 113 and 0 of 145 unresolved when `readXfaDatasetsValues(bytes, PLAN_INPUT_PATHS)` supplies the values, which is what `planEstarAttachments` does. There is **no `unresolved` field and no null-chapter branch**: it would be dead code and, rendered literally, would hide the MDUFA User Fee Form slot from every filer.

**Template absent ⇒ 422, never `slots: []`.** `listVendoredTemplates` returns `[]` on an unreadable directory and `listEstarAttachmentSlots` returns `[]` on a PDF with no XFA packet, so an empty array is indistinguishable from absence — "an error is never rendered as an empty result." The refusal reuses `resolveProducibleInputs`'s existing sentence.

`parentPath` is in the payload because I measured that it is the only thing that disambiguates the picker: on IVD, 36 slots share a `(description, chapter)` and **6 remain ambiguous after adding `field`** — `root.PerformanceTesting.AnalyticalPerformance.**AssayPerformance**.PTAddAttachment111` vs `…**InstrumentPerformance**.PTAddAttachment111`, and the same pair for `PTAddAttachment121` and `PTAddAttachment151`. The winning design's "append the trailing SOM segment" leaves those six labels byte-identical, `expectedChapter` cannot catch a wrong pick because both chapters are identical, and the export returns a clean 200 with the document in the wrong slot.

**Cached** on `sha256(bytes)` in a module-level `Map` bounded to 4 entries. Measured cost per call: 301 ms cold / 148–234 ms warm, decompressing a 9.9 MB (nIVD) / 10.9 MB (IVD) XFA packet. Safe because the bytes are checksum-pinned; bounded because the parse holds ~10 MB of state per template in a process I measured at 317 MB RSS.

### 3.2 `GET /api/510k/estar/attachment-candidates?ident=&type=&variant=`

Gates: `authMiddleware`. Tenant from `getOrganizationId(req)`, program from `resolveProjectAnchor` — never from the body.

```ts
{ programId: string | null,
  documentClass: string | null,               // the ONE doc_type this export reads
  sections: Array<{ sectionCode, title, substantive: boolean,
                    proposedFileName, notFileableReason: string | null }>,
  files:    Array<{ documentId, title, fileName, mimeType, byteLength,
                    proposedFileName, notFileableReason: string | null }> }
```

`sections` comes from `loadAuthoredDeviceSections(orgId, { programId, docTypes: [class] })` — the **same call with the same narrowing** the resolver makes, so the picker and the resolver cannot disagree. `substantive` is the shipped private `isSubstantive`, reached only through that loader; it is not re-derived. `proposedFileName` is `attachmentFileName(...)`, so the 124-char limit is visible before saving.

`files` is served by **`GET /api/mdx/vault?program_id=`'s existing service function**, not a fourth vault listing. `server/routes/mdx-vault.ts:207-216` already runs the identical tenant join over `vault.documents` and already labels the group `'Uploaded files'`; the route's own header records that two unjoined listings once showed a user a vault that did not contain their upload. This slice extracts that query into a shared function and calls it from both places — a parallel path migrated onto the canonical one, not a third copy.

`anchor.programUuid === null` (a numeric `fda510k_projects.id` ident) ⇒ `programId: null`, empty lists, and the resolver's own legacy-project sentence. Offering choices that would all 422 is worse than offering none.

### 3.3 `GET /api/510k/estar/slot-map?ident=&type=&variant=`

```ts
{ descriptorId, programId,
  revision: string,                    // sha256CanonicalJson of the ordered rows
  entries: Array<{ id, slotSomPath, chapterAtDecision, sourceKind, sourceRef,
                   fileName, ordinal,
                   decidedBy: { id, name }, decidedAt, decisionReason }>,
  otherDescriptors: Array<{ descriptorId, placements: number }>,
  checkedAt: string | null }           // when the map last passed a full save-time check
```

Read order — the only permitted one, total because it covers the whole unique key:

```sql
SELECT … FROM c2c_estar_slot_map
 WHERE organization_id = $1 AND program_id = $2 AND descriptor_id = $3
 ORDER BY ordinal ASC, slot_som_path ASC, source_kind ASC, source_ref ASC
```

**This route does NOT re-validate, and says so on screen.** The critics are right that a "preflight" built from a bytes-free describer is a second planner with a second vocabulary, and right that `checkAttachmentAcceptance` cannot be called honestly without a real `byteLength` and a real `dataObjectName` — feeding it `0` and a synthetic date makes two of its six rules pass on questions nobody asked.

The resolution is that **validation runs the real `planEstarAttachments`, with the real resolver, at SAVE time** (§3.4) — one planner, one resolver, one vocabulary, real bytes, real hashes, real acceptance — and the GET reports what that check found. Cost lands once per decision session, at the moment a person made the judgement, which is where it belongs. A `Re-check placements` action on the panel re-runs the same `POST /slot-map/check`, which is `PUT` minus the write.

### 3.4 `PUT /api/510k/estar/slot-map`

Gates: `authMiddleware, requireEditorAccess, requireAssemblyEntitlement` — the trio on `POST /official`.

```ts
const slotMapSchema = z.object({
  meta: exportMetaSchema,
  type: z.enum(['510k', 'de_novo', 'pma']),   // NOT ESTAR_TYPES: q_sub/ide/513g map to
                                              // the 'prestar' family, which is not vendored
                                              // and whose field maps are {}. A default('510k')
                                              // here would let those three reach a
                                              // family CHECK violation as a 500.
  variant: z.enum(ESTAR_VARIANTS),
  revision: z.string(),                        // '' means "I am creating the first map"
  reason: z.string().min(8),
  entries: z.array(z.object({
    slot:     z.string().min(1),
    fileName: z.string().min(1).optional(),    // NO .max(200): the eSTAR limit is 124
                                               // (ATTACHMENT_PATH_MAX_LENGTH) and a
                                               // request-supplied name is used RAW at
                                               // estar-attachment-plan.ts:287. checkAttachment-
                                               // Acceptance validates it below, at save.
    reason:   z.string().min(8).optional(),    // per-placement; falls back to the save reason
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('authored_section'), sectionCode: z.string().min(1) }),
      z.object({ kind: z.literal('vault_document'),   documentId:  z.string().uuid() }),
    ]),
  })).max(ESTAR_MAX_ATTACHMENTS_PER_EXPORT),   // 150, the existing constant
});
```

Handler, in order:

1. `const userId = governedActorId(req)`; `null` ⇒ 403. Never `resolveActorUserId`, which returns `0`.
2. `resolveProjectAnchor(req, getOrganizationId(req), meta)`; no anchor ⇒ 404. `programUuid === null` ⇒ 422 with the resolver's legacy-project sentence — a map that can never file anything is not a map.
3. `descriptorFor(type, templateVariantFor(type, variant))`; undefined ⇒ 422.
4. `requestDb(req).transaction(async (tx) => { const c = queryableFromDrizzle(tx); … })`.
5. `await setTenantContextTx(c, orgId)` — immediately after the implicit BEGIN. Without it both ledger inserts fail the RLS `WITH CHECK` under `RLS_ENFORCE=on`.
6. **Program ownership**: `SELECT 1 FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`; miss ⇒ `notFoundInTenant`. `program_id` has no FK, so this assertion is the whole guarantee against squatting another tenant's program id.
7. **Lock, then compare**: `SELECT … WHERE organization_id=$1 AND program_id=$2 AND descriptor_id=$3 ORDER BY … FOR UPDATE`. A bare `SELECT` locks nothing under READ COMMITTED, so two concurrent saves would both pass a revision check and then interleave a delete-then-insert into either a 23505 the route has no branch for or a merged map neither operator authored. `FOR UPDATE` serializes them; the second gets a real 409. Recompute `sha256CanonicalJson(rows)`; `!== body.revision` ⇒ 409 naming what changed.
8. **Validate with the real planner.** `resolveTemplateBytes(descriptor)` → `planEstarAttachments({ templateBytes, requests: entries.map(toRequest), resolve: createDeviceAttachmentResolver({ organizationId, programUuid, client: c, docTypes: [class] }), at: new Date() })`. `plan.refused.length > 0` ⇒ **400** with `{ entryIndex, slot, reasons }` per refusal. The accepted `fileName` and the resolved `chapter` are read off `plan.attachments` — the map stores what the planner accepted, not what the client proposed.
9. **Diff, don't rebuild.** Match existing rows on the unique key. Insert new placements; `UPDATE` a row whose `file_name`, `chapter_at_decision` or `ordinal` changed; `DELETE` rows absent from `entries`; **touch nothing else**. `decided_by` / `decided_at` / `decision_reason` are written only on an insert or a materially-changed update. A save that adds one sterilization report leaves the other twenty-nine rows' attribution exactly as it was.
10. **One** `recordGovernedAction(c, { orgId, userId, command: 'transition', target: \`estar-slot-map:${programUuid}/${descriptorId}\`, reason, payload: { change: 'estar-slot-map', descriptorId, added, updated, removed, entries }, domain: 'mdx', surface: 'estar-slot-map' })`.

`command: 'transition'` is non-negotiable and is one of the original twelve. `migrations/20260527_mutation_primitives.sql` ships a narrow CHECK and `db/migrations/20260730_c2c_ana_actions_command_vocab.sql` widens it *later in the set* (`migration-set.mjs:502`); `tests/schema-contract/governed-command-vocabulary.contract.test.ts` pins both and records a 2026-09-08 measurement where a fully-applied database still answered SQLSTATE 23514. An invented verb rolls back the map rows and the ledger pair together. `transition` is also outside `HIGH_RISK_COMMANDS`, so `risk` derives to `'low'` and no re-auth gate turns on — the tier-2 verdict expressed where the code derives it.

**One governed action per save, not per row**, because `computeAuditChainSealed` takes `SELECT … ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE` on `audit_logs`: every governed write in the estate serializes on that one row, so thirty placements as thirty actions is thirty serialized chain locks.

**Tier 2 — governed action with a reason, no re-auth, no e-signature.** The repo's structural twin, `mapArtifactToSection` (`server/services/ectd/package-content-change.ts:354`), is governed exactly this way. `applySignedFiling` already binds `BINDING_BASIS.FILED_ESTAR_ARTIFACT` to the sha256 of the retained eSTAR, whose bytes contain both the `/EmbeddedFile` objects and the `AttachmentManifest` token string — the filed form's digest already attests the mapping. A second signature would also force a §11.70 revocation ceremony every time an operator re-points a placement before filing.

### 3.5 `POST /api/510k/estar/official` — the resolution

**`attachments` is REMOVED from `officialSchema` in this commit.** Not deprecated, no fallback, no override, no "attachments when the program has no map." An export taken from the array leaves no record that it ignored the map: `EstarAttachmentRecord` deliberately drops `source` (`estar-fill.ts:133-144`), so the retained artifact and the audit row can say "a file with sha X went into CH1.01" and cannot say who chose it or what it was.

`officialSchema` gains one field in its place:

```ts
attachmentMode: z.enum(['map', 'form_only']).default('map'),
```

`form_only` is **not** a second source and cannot name a document — it is an explicit, recorded assertion that this export is the administrative form alone, which is a routine act for a filer checking the fill while drafts are open. Without it, that filer's only escape is emptying the map, which deletes the very `decided_by` / `decision_reason` rows the table exists for. It travels into `officialMetadata` and the audit row.

New handler shape:

```ts
const descriptor = descriptorFor(type, templateVariant);
const map = await loadEstarSlotMap(queryableFromDrizzle(requestDb(req)), {
  organizationId: getOrganizationId(req),   // NEVER from a map row
  programUuid: anchor.programUuid,          // NEVER from a map row
  descriptorId: descriptor?.id,
});
```

Three refusals before the fill:

1. **`programUuid === null` and `attachmentMode === 'map'` ⇒ 422** with the legacy-project sentence. The map read is never issued with a null program: `program_id` is `NOT NULL` so no row could match, but an `undefined` predicate silently dropped by drizzle's `and()` would return the org's entire map across every program and leak other programs' slot paths and document ids through the refusal's `blockers[]`.
2. **Descriptor mismatch ⇒ 422.** `map.entries.length === 0 && map.otherDescriptors.length > 0` — the program has placements, but none for the descriptor being exported:
   > *This program's attachment map holds 22 placements for 510(k) · Device, and none for 510(k) · IVD. The two templates share 102 attachment slots and 41 of them file into a different CDRH chapter, so a map is not carried between them. Re-confirm the placements for this template before filing. Nothing was attached.*

   **This is the fix for the worst attack in the pile.** `officialEstarTypeFor` (`OfficialEstarPanel.tsx:77-84`) and `officialEstarVariantFor` (`:92-96`) derive the descriptor from mutable `program.regulatoryPath` / `program.productType`, both editable through `PATCH /projects/:id/industry-profile`. Without this rule, a product-type correction or a 510(k)→De Novo pivot re-keys the map, the read returns zero rows, `estar-fill.ts:445` (`if (requests.length === 0) return null`) returns before any planning so no blocker is pushed and `attachmentReport` is never assigned, and the filer gets a clean 200 with `officialEstarPdf: true` and none of their documents. It also closes the same hole for a renamed descriptor constant, which is a pure code change no migration gate would see.
3. **`attachmentMode === 'map'` and the program has no map at all ⇒ 422**, naming that no placement has been recorded. A program that has never been mapped must not silently file the form alone; `form_only` is how a filer says that on purpose.

Then:

```ts
...(map.entries.length ? {
  attachments: map.entries.map(toAttachmentRequest),   // carries expectedChapter
  attachmentResolver: createDeviceAttachmentResolver({
    organizationId: getOrganizationId(req),
    programUuid: anchor.programUuid,
    docTypes: [ESTAR_TYPE_DOC_CLASS[type]],
    // NO `client`. HEAD deleted exactly that argument at :1060-1072 because
    // requestDb(req) is a Drizzle instance whose `.query` is the relational-query
    // namespace, not the (text, params) function DeviceContentClient calls, so
    // every authored_section attachment threw at runtime.
  }),
  attachmentClock: attachmentClockFor(map),   // see below
} : {}),
```

**`attachmentClock` is derived, not `new Date()`.** Passing `new Date()` from the route is byte-identical to the fallback at `estar-fill.ts:471` and closes nothing; the design it replaces claimed a determinism property it did not hold and specified a test that could never run through the route. The clock here is `max(decided_at)` across the map's rows, truncated to the second. Two exports of an unchanged map then produce identical `/EmbeddedFiles` name-tree keys and an identical manifest — a property a test can actually assert through HTTP.

`officialMetadata` gains:
```ts
attachmentMap: { descriptorId, mode: attachmentMode, revision, placements: map.entries.length }
```
so the retained artifact and the audit row say which map produced the filing, or that none did.

**Route-level tests re-pointed, not duplicated:** `tests/routes/estar-official-pdf.test.ts:820-1010` (a 7-`it` describe whose `attachReq()` helper at `:869` puts `attachments` in the POST body) seeds map rows and exports. `tests/routes/estar-export-governance.test.ts:135` sends `attachments: []` to `POST /build`'s own `requestSchema` and is untouched. `server/services/pathway-engines/estar/__tests__/estar-attachment-acceptance.test.ts` is a pure unit test of `checkAttachmentAcceptance` and drives no route — it is unaffected, and the winning design's claim that it was "the only caller" was wrong.

### 3.6 What is NOT built

**No `DELETE /slot-map/:id`.** Removal is expressed by omitting the entry from the PUT, which already carries the anchor, the ownership assertion, the lock and the governed action. A `:id` route would be the only write in the design that names a row by primary key, and the two-sentence contract proposed for it carried no `organization_id` predicate, no program, and no ownership assertion — one leaked row id would let another tenant delete a filing decision, with the only ledger entry landing in the *deleter's* tenant. Deleting the route deletes the hole.

**No `POST /slot-map/copy`.** It gates on template *family*, and `510k-device`, `de_novo-device` and `pma-device` all carry `family: 'nivd'` — so copying a 510(k) map onto a De Novo program passes the check while every lettered section key (`D5`, `E1`, `E2`, `F`) resolves to a different section in the target pack. Its "no counterpart" mitigation cannot fire because those keys exist in both. It also needs a source-program ownership assertion its contract omits and a program-listing endpoint that does not exist. Deferred to a slice that can do it safely.

---

## 4. The surface

Two new client files: `surfaces/EstarAttachmentsPanel.tsx` and one hook module `hooks/useEstarSlotMap.ts`. Rendered by `OfficialEstarPanel.tsx` — the one place the official eSTAR is produced (`K510Surface.tsx:732`, `IvdSurface.tsx:491`, `PmaSurface.tsx:223`).

The decisive argument for living inside that panel is the Generate button. `generateDisabledReason` (`OfficialEstarPanel.tsx:128-151`) is pure and its precedence is pinned by a test. It gains **two** inputs, not one, placed after `fieldsError`:

```
lock → no program → readiness checking → busy → not ready → field list failed
     → map unavailable → map refusals → descriptor mismatch → null
```

- `mapUnavailable: boolean` — a failed or absent map read. Without it, a 500 on `GET /slot-map` leaves Generate live beside a red error box while the counter claims "0 refused", and the export files documents the operator was never shown. That is the identical shape the function's own `fieldsError` clause was written to close.
- `mapRefusalCount: number`, and `descriptorMismatch` from `otherDescriptors`.

### Default view — what you have, not 113 of anything

```
Official eSTAR · 510(k) · Device                      [ Generate official eSTAR ]

Documents filed with this form              12 filed · 23 not filed · 0 refused
[ By document ▾ ] [ By slot ]      Checked when saved, 4 Sep  [ Re-check now ]

  Which slot a document belongs in is your judgement. Nothing here guesses it.

┌ Authored sections · 29 ────────────────────────────────────────────────────┐
│ A2  Cover letter          Approved  →  Administrative Documentation | Cover │
│                                        Letter · CHAPTER 1 / CH1.01         │
│                                        A2 Cover letter.pdf            [×]  │
│ A3  Indications for use   Approved  →  [ Choose a slot…              ▾ ]   │
│ E1  Biocompatibility      Drafted   ⨯  Section "E1" (Biocompatibility) is   │
│                                        authored but not finalized — it is  │
│                                        still a draft or a stub. A draft    │
│                                        belongs in the draft package, not   │
│                                        in a named eSTAR attachment slot.   │
└────────────────────────────────────────────────────────────────────────────┘
┌ Uploaded files · 6 ────────────────────────────────────────────────────────┐
│ Sterilization validation report.pdf  2.4 MB  →  [ Choose a slot…      ▾ ]  │
└────────────────────────────────────────────────────────────────────────────┘
```

Thirty-five rows, not 113. A non-substantive section is shown greyed with the resolver's own sentence rather than hidden — a section the operator wrote, cannot find and cannot explain is the worst state this surface could produce.

The freshness line is literal: `Checked when saved, 4 Sep`. It never implies a live guarantee, and `Re-check now` runs `POST /slot-map/check` — the same code path as the save.

### The chooser — the only place 113 appears

```
Place "A2 Cover letter"                                              [esc]
[ cover                                                          ] 3 of 113

Administrative Documentation
  Administrative Documentation | Cover Letter        CHAPTER 1 / CH1.01   ●
  Administrative Documentation | User Fee Form       CHAPTER 1 / CH1.09
Quality Management System
  Quality Management System | Complaint Handling     CHAPTER 3 / CH3.02

●  takes one attachment — "Only a single cover letter is needed."
```

- Type-to-filter over `description` + `somPath`.
- Grouped by FDA's description prefix — **22 groups on both templates** (measured; not 21/22), including FDA's own typo: both `Quality Management System` (14 slots) and `Quality Managment System` (1) render verbatim. Silently correcting an agency string is the transcription this module refuses everywhere else.
- Chapter shown on every option, because description is not unique.
- **When a `(description, chapter)` group has more than one member, the row shows the parent SOM segment** — `Assay Performance` vs `Instrument Performance` — not the trailing segment. Measured: 6 IVD slots are indistinguishable by `(description, chapter, field)` and the parent segment resolves all of them.
- The five single-attachment slots are marked and disable once taken.
- **The User Fee Form is offered, enabled, with `/CHAPTER 1/CH1.09/`.** Measured: it resolves cleanly from the template's own `ATRadioButton100 = "1"`.
- `&amp;` is decoded **for display only**. Four nIVD / five IVD descriptions carry it; the string written into the PDF `/Desc` stays byte-identical to FDA's.
- No "recommended" badge, no ranking, no highlight.

### Saving

```
7 placements changed     Reason ▸ [ Cover letter and IFU per pre-sub feedback ]
                                            [ Discard ]  [ Save placements ]
```

One PUT, one governed action, `min 8` characters — the literal the eleven governed bodies in `submission-ops.ts:167` use. Each changed row may carry its own reason inline. `Save placements` is a governed verb backed by a real `await fetch`, which `scripts/ci/check-action-overclaim.mjs` requires (`REAL_WORK` at `:86`); the gate exists because the defect it caught was an "Attach to dossier" button whose handler only chatted.

### The `By slot` view

Every slot on the template, grouped by chapter, filled ones showing their document and the ordinal drag handle, unfilled ones shown plainly. It exists so a reviewer can read the submission against CDRH's structure, and so the plan's order-dependence is something a person can see and change rather than an accident of a query.

**It shows no percentage, no denominator, no requiredness, and no coverage claim.** Header: *"Which slots your device needs is decided by your answers inside the eSTAR, not here."* I confirmed the reason: every `AddAttachment` field on both templates sits under a `presence="hidden"` ancestor at rest — `root.CoverLetter` itself ships hidden — because the form assembles from the applicant's answers. "12 of 113" would assert 101 gaps to a filer who has 12 applicable slots. The default view's counter is `12 filed · 23 not filed`, denominated in **documents the filer has**, which is a number that means something.

### States — all through the shipped primitives

No `DataGate`, no `useSampleRows`, no `sample=` prop, no fixture. `OfficialEstarPanel` imports `EmptyState`/`ErrorState` from `../../v2/dataConnect` directly and contains zero fixtures; the new panel inherits that.

- **No program** → `<EmptyState icon={I.circle} title="No program open" hint="Placements are held per program." action={openProgramAction()} regulation="Serves the FDA eSTAR attachment record (21 CFR 807)" testId="estar-slot-map-idle" />`. The hint must not match `/select a (program|project)/i` — that ban walks every `.ts`/`.tsx` under `client/src/concept2cure/mdx`, hooks and libs included.
- **Loading** → `<EmptyState icon={I.database} busy title="Loading placements" testId="estar-slot-map-loading" />`, with `entries = map.loading ? null : map.entries`, mirroring `OfficialEstarPanel.tsx:188`. `useFetchJson` keeps the previous payload across a url change, so one program's placements must never sit under another program's header.
- **Error** → `<ErrorState variant="panel" title="Could not load placements" message={err} retry={errorKind === 'failed' ? refresh : undefined} testId="estar-slot-map-error" />`. Retry only for `'failed'`, matching `OfficialEstarPanel.tsx:378` — a 404 or 422 gets none. Planner sentences and SOM paths survive `redactInternals` unredacted.
- **Empty map** → `<EmptyState … title="No placements recorded" hint="No document is filed with this form yet. Choose a slot for a section or an uploaded file above." />` plus the `form_only` affordance on Generate.
- **Legacy program** (numeric ident) → honest empty state carrying the resolver's own sentence, no picker.
- **Descriptor mismatch** → an `ErrorState` banner naming the other descriptor and its placement count, with Generate disabled by the same reason.
- **Sample mode: not supported and not simulated.** `sampleModeAvailable()` is `import.meta.env?.PROD !== true`, and a fabricated slot map is the exact thing §5 refuses. The panel renders honest empty states in sample mode like any other.
- **`vault.documents` appears in neither new `.tsx`.** The LEAKY ban is a per-line regex over every `.tsx` under `surfaces/`, skipping only `^\s*import` — a type annotation or a rendered string containing it fails the build (a `//` comment would not; `code()` strips those). The group is titled `Uploaded files` and the hook does the translation, as `useEstarOfficialFields.STORE_WORDS` does for the field table.
- On `[ident, type, variant]` change the panel re-seeds and re-reads alongside the existing `setTyped({})` / `resetExport()` at `OfficialEstarPanel.tsx:172-175`.

`OfficialEstarPanel.tsx` and `EstarAttachmentsPanel.tsx` are both added to `dataGateContract.test.tsx`'s `CONVERTED` array (`:271-281`), which does not list either today.

Client hook changes: `postExport` (`useEstarExport.ts:295`) learns to read `attachmentReport` off both the 200 and the 422 — today it reads neither, so every planner refusal sentence is unreachable from any screen. `EstarExportOutcome` gains `attachmentReport?`. The POST body gains only `attachmentMode`; `OfficialEstarPanel.render.test.tsx:475` asserts `toEqual` on `body.data` alone, so nothing breaks.

---

## 5. What this REFUSES, and the failure each prevents

1. **`attachments` on `POST /official` — removed, no fallback.** Prevents: an export that silently ignores the governed map and leaves no record that it did, because `EstarAttachmentRecord` drops `source`.
2. **No machine proposal of a section→slot placement.** The rule pack outline is `{key, parent_key, label, mandatory, path_order}` and nothing anywhere links a section to a chapter or a slot. Prevents: a similarity match wearing a confidence score — a fabricated regulatory judgement.
3. **No seed, no default map, no `_templates` table.** Prevents: 113 hand-transcribed SOM paths that RULE 1 then makes uncorrectable in place. This module has already shipped two such errors, both recorded in its own docblock.
4. **No coverage, completeness or requiredness claim; no `n of 113` denominator.** Every `AddAttachment` field on both templates sits under a hidden ancestor at rest. Prevents: "you are missing 4 required attachments" — a claim nothing in the template supports.
5. **No SQL restatement of a template constant** — not the 124-char limit (hence `file_name TEXT`, route-validated), not the five single-attachment slots, not `ESTAR_CHAPTER_PATH`, not the descriptor list. Prevents: a second definition that turns a refusal-with-a-sentence into a 23514 on the next FDA edition. The database enforces only what the template cannot: one placement once, one file name once.
6. **No `ROLLBACK: DROP TABLE` line in the migration header.** Prevents: an operator following the file's own instruction and appending a DROP that either reverts every deploy or re-creates-and-re-drops tenants' filing decisions forever, green each time. `check-migration-drop-safety` strips `--` comments and would never see it.
7. **No e-signature, no `BINDING_BASIS.ESTAR_SLOT_MAP_VERSION`, no re-auth on save.** Prevents: a second attestation of one judgement, and a §11.70 revocation ceremony every time an operator re-points a placement before filing.
8. **No invented governed command; `transition` only.** Prevents: SQLSTATE 23514 rolling back the map rows and the ledger pair on any database where the widener has not overtaken the narrow CHECK.
9. **No whole-map delete-then-insert.** Prevents: a save that re-points one placement restamping `decided_by`/`decided_at`/`decision_reason` on twenty-nine untouched rows — not lost attribution but *fabricated* attribution, in a column whose stated purpose is Part 11 attributability, with no before-image anywhere (`recordGovernedAction` writes only `payload_hash` to `audit_logs` and the *new* entries to `c2c_ana_actions`).
10. **No bare `SELECT` as the concurrency check.** Prevents: two concurrent saves both passing the revision check under READ COMMITTED and producing either a 23505 the route has no branch for or a merged map neither operator authored.
11. **No `DELETE /slot-map/:id`, no `POST /slot-map/copy`** — see §3.6.
12. **No partial export and no "file what you can."** One refusal still blocks the whole export. Save-time validation moves the discovery earlier; it does not soften the refusal. `form_only` is not partial — it attaches nothing and says so in the record.
13. **No legacy `cerv2_510k_sections` picker.** The resolver always takes the governed branch and `legacySectionsToAuthored` never sets `sectionCode`. Prevents: offering codes every export would refuse.
14. **No silent correction of FDA's strings.** Both `Quality Management System` and `Quality Managment System` render as two groups; `&amp;` is decoded for display only.
15. **No slot-map SQL through the Drizzle query builder.** `check-drizzle-tenant-scope.mjs:125` matches `\bdb\.` only, so `tx.insert(...)` is invisible to it. Prevents: shipping the estate's newest org-scoped table behind a detector that structurally cannot see it, and reporting the gate green as evidence.

---

## 6. Tests — each as the mutation it must be SEEN to fail on

1. **THE DESCRIPTOR RE-KEY (fail-open).** Save 22 placements under `510k-device`; change the program's `productType` to `ivd`; export. **Mutation: remove the descriptor-mismatch refusal (§3.5 rule 2).** Assert the export returns 200, `officialEstarPdf: true`, zero `/EmbeddedFile` objects, `blockers: []`, and **no `attachmentReport` at all** — `estar-fill.ts:445` returns before planning. Restore the rule and assert 422 naming both descriptors and the placement count.
2. **THE UNMAPPED PROGRAM.** Export a program with no map rows and default `attachmentMode`. **Mutation: allow `map.entries.length === 0` to proceed.** Assert a clean 200 with nothing attached, indistinguishable from a deliberate form-only filing. Restore and assert 422; then assert `attachmentMode: 'form_only'` returns 200 with `officialMetadata.attachmentMap.mode === 'form_only'` in the audit row.
3. **THE EDITION CHAPTER MOVE.** Build a template copy in which `root.Labeling.OtherLabeling.LBAddAttachment360` writes `/CHAPTER 5/CH5.08/` instead of the `/CHAPTER 5/CH5.10/` I measured on nIVD; save a map against the original; export against the copy under the same descriptor. **Mutation: drop `expectedChapter` from `EstarAttachmentRequest`.** Assert 200 with the file routed to the moved chapter, empty `refused[]`. Restore and assert a 422 naming both chapters. Add the missing CI signal alongside: a golden `somPath → chapter` fixture for both templates, so an edition that moves a chapter fails at build rather than at a customer.
4. **THE PATHWAY SECTION COLLISION.** One program, a `k510` document created Monday and a `denovo` created Tuesday. Map `D5` (k510: "Shelf life and packaging"; denovo: "Cybersecurity"). **Mutation: revert `docTypes` to the default `GOVERNED_DEVICE_DOC_TYPES`.** Assert the 510(k) export succeeds and the embedded PDF's heading reads "Cybersecurity". Restore and assert the k510 content. Repeat for `E1`, `E2`, `F`.
5. **THE CER KILL-SWITCH.** Same program, add a `cer` document created after the `k510`. **Mutation: same revert.** Assert every authored placement refuses and the whole export 422s — a document the filer never touched blocking the submission. Restore and assert the export succeeds unchanged.
6. **ATTRIBUTION SURVIVES A SAVE.** Operator A saves 29 placements with per-row reasons; operator B adds one. **Mutation: replace the §3.4 step-9 diff with delete-then-insert stamping `decided_by` from the request.** Assert all 30 rows read `decided_by = B`, `decided_at = Friday` and B's reason — an assertion the table's own column comment calls WHO made the judgement. Restore and assert 29 rows unchanged, one inserted.
7. **CONCURRENT SAVES.** Two transactions, same `(org, program, descriptor)`, same starting `revision`, overlapping entries. **Mutation: drop `FOR UPDATE` from step 7.** Assert both pass the revision check and the second commits either a 23505 surfaced as a 500 or a merged map. Restore and assert a clean 409 with the changed rows named.
8. **DUPLICATE PLACEMENT.** **Mutation: drop `c2c_estar_slot_map_placement_uq`.** Insert the same `(program, descriptor, slot, kind, ref)` twice, export, assert two `/EmbeddedFile` objects and the token twice in the manifest — the `c2c_artifact_section_map` defect one layer up. Restore, assert 23505 → 409.
9. **TENANT PREDICATE IS THE DEFENCE.** With `RLS_ENFORCE` unset — where the sweep's policy passes every row — assert org B cannot read or write org A's map. **Mutation: remove `organization_id` from the WHERE.** Assert org A's placements come back. Companion source-scan test: every SQL string in the route file naming `c2c_estar_slot_map` contains `organization_id`, which fails when a statement is rewritten as `tx.select(...)` where `ci:drizzle-tenant-scope` cannot see it.
10. **PROGRAM SQUATTING.** `PUT /slot-map` naming another org's program UUID. **Mutation: remove the step-6 `regulatory_programs` assertion.** Assert the row lands. Restore, assert 404 — `program_id` has no FK, so the assertion is the whole guarantee.
11. **CONFUSED DEPUTY.** Plant a map row whose `program_id` is a different program in the same org. Assert it never reaches the planner. **Mutation: build the resolver from `row.program_id`.** Assert the other program's vault document is embedded — the defect the slice-5 mutation table already records as killed once.
12. **THE 200-CHAR NAME.** **Mutation: restore `.max(200)` and skip the save-time `checkAttachmentAcceptance`.** Assert a 130-char `fileName` saves cleanly and then 422s the whole export days later. Restore, assert a 400 at save carrying the template's own reason.
13. **VALIDATION IS THE REAL PLANNER.** Assert every refusal `PUT /slot-map` returns is byte-identical to the one the subsequent export would produce, over a generated set (unknown slot, draft section, deleted vault doc, over-long name, duplicate names, double-booked single slot, chapter divergence). **Mutation: introduce any bytes-free "describer" that re-derives one refusal.** Assert the test goes red on a single changed word. This is the gate that keeps one vocabulary.
14. **THE MANIFEST-THROW REPORT GAP.** Feed `fillEstarSubmission` a template whose `root.AttachmentManifest` is not `***Start***`. **Mutation: none — assert on today's code first.** Assert the 422 carries no `attachmentReport` (`estar-fill.ts:480` is after the catch at `:466-478`). Move the assignment inside the try and assert the report names the requested count.
15. **CHOOSER LABELS ARE DISTINCT.** For both templates, assert every option label within a chooser group is unique. **Mutation: drop `parentPath` and label with the trailing SOM segment.** Assert the six IVD `PTAddAttachment111/121/151` rows render byte-identical labels.
16. **THE USER FEE FORM IS OFFERABLE.** Assert `GET /attachment-slots` returns a non-null chapter for all 113 / 145 slots including `ADAddAttachment910` at `/CHAPTER 1/CH1.09/`. **Mutation: call `resolveAttachmentSlot(slot)` without values.** Assert exactly one slot per template loses its chapter and the MDUFA cover sheet disappears from the picker.
17. **TEMPLATE ABSENT IS NOT EMPTY.** Point `ESTAR_TEMPLATE_DIR` at an empty directory. **Mutation: return `slots: []`.** Assert the chooser renders "0 of 0" with no sentence. Restore, assert 422.
18. **GENERATE IS DISABLED WHEN THE MAP READ FAILS.** **Mutation: drop `mapUnavailable` from `generateDisabledReason`.** Assert the button is enabled beside a rendered `ErrorState` and a header claiming "0 refused".
19. **ONE GOVERNED ACTION.** A 30-placement PUT writes exactly one `c2c_ana_actions` row and one `audit_logs` row. **Mutation: record per entry.** Assert 30 rows and 30 sequential `FOR UPDATE` acquisitions on the chain's tail row.
20. **THE COMMAND VOCABULARY TRAP.** Against a database without `20260730_c2c_ana_actions_command_vocab.sql`, assert `'transition'` commits and an invented `'estar-slot-map-save'` raises 23514 and rolls the map rows back with it.
21. **THE PRESTAR 500.** `PUT /slot-map` with `type: 'q_sub'`. **Mutation: widen the schema to `ESTAR_TYPES` with `.default('510k')`.** Assert a 500 from a family CHECK violation or a missing template. Restore, assert a 400 from the enum.
22. **DETERMINISM THROUGH THE ROUTE.** Export the same unchanged map twice via HTTP. Assert byte-identical `attachmentReport.attached` and manifest. **Mutation: pass `new Date()` instead of `attachmentClockFor(map)`.** Assert the `dataObjectName` sequence differs.
23. **MIGRATION GATES.** `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:model-migration-agreement`, `ci:insert-columns-declared`, and `node --test tests/ops/apply-c2c-migrations-manifest.test.mjs` (a root `migrations/2026*.sql` at or after the `20260701` ratchet must be listed or in `KNOWN_UNLISTED`, and being in both fails separately). Plus: apply the whole set and assert `c2c_estar_slot_map` carries `tenant_isolation_policy`. **Mutation: move the registration line below `TENANT_ISOLATION_SWEEP`.** Assert the table exists with **no policy** and the deploy is still green — the silent failure the ordering rule exists for.
24. **OVERCLAIM.** `ci:action-overclaim` over both new `.tsx` files: `Save placements` reaches a real `await fetch`, not `ask()`.

Proof goes in `docs/reports/` per `HANDOFF_DEVICE.md` §2.9, with the 41/102 divergence and the six-way IVD label collision **reproduced from the vendored templates in the report's own script**, not quoted.

---

## 7. Explicitly OUT of this slice

- **A signed "slot map of record."** The tier-3 pattern (`module3OperatingSystemRoutes.ts:700-800`) is buildable, but `BINDING_BASIS.FILED_ESTAR_ARTIFACT` already binds the filed bytes, which contain the manifest. Revisit only if a map must be released once and reused across sequences independently of any export.
- **`POST /slot-map/copy` and any cross-program reuse.** §3.6. It needs a source-ownership assertion, a program-listing endpoint, and a gate on *rule pack* rather than template family. A slice of its own.
- **`DELETE /slot-map/:id`.** §3.6.
- **Any default or suggested map.** §5.3.
- **Slot applicability and coverage.** Blocked on a fact, not effort: every `AddAttachment` field is under a hidden ancestor at rest. Answering "which slots does this device need" means modelling the eSTAR's own answer-driven presence logic.
- **A jurisdiction control.** `ATRadioButton100` is read from the template and written by no field map, so `ADAddAttachment910` always resolves to `/CHAPTER 1/CH1.09/`. Correct for every FDA submission this platform builds.
- **`LBAddAttachment360`'s post-filing mutability.** `__tests__/estar-attachment-slots.test.ts:120-129` documents that `LBAttachment360.Type` moves an already-attached labeling file between `CH5.04/08/09/10` as the applicant changes the labeling kind. The map records what we routed, not where it ends up. One footnote on that row; no mechanism.
- **A third source kind, or inline upload straight into a slot.** The vault is the governed home for bytes; a file worth filing is worth cataloguing first.
- **Legacy `cerv2_510k_sections` as a source.** Unreachable by construction; making it reachable is a migration of the legacy store.
- **Partial export.** A governance decision, not a UI question, and the current answer (no) is the safe one.
- **Staleness detection between sessions.** A 40-row map has 40 things that can go stale, and today they are discovered when someone opens the panel or presses Generate. A scheduled freshness signal belongs in whatever slice owns program-level readiness.
- **Whether `renderStructuredLeafPdf` is itself deterministic.** `attachmentClock` closes the clock half; the renderer half belongs to whatever slice claims reproducibility as a property.

---

## 8. The one thing to do before writing the migration

`docs/reports/wo8-estar-attachments-slice5-2026-09-08.md` §7 records that **nobody has confirmed the LiveCycle runtime preserves a datasets-only `root.AttachmentManifest` across an open-and-save.** One eSTAR, one attachment added in Acrobat Pro, one save settles it.

This is a **blocking precondition on this slice, not a companion risk.** The map is the expensive, governed, per-customer artifact and it is keyed on slot identity; if the manifest does not survive open, the routing mechanism the map names is the part that changes, every stored `chapter_at_decision` is a claim about a mechanism that was never real, and RULE 1 makes amend-in-place the only correction path for a shipped migration. Ten minutes now, or a versioned correction across every tenant later.