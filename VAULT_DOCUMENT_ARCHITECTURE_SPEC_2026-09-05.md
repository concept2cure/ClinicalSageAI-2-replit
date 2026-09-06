# The document architecture — structuring documents in alignment with regulatory requirements

**Date:** 2026-09-05 · **Supersedes nothing; extends** `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md`
**Scope:** the taxonomy, hierarchy and metadata model for `vault.documents`, judged against how Veeva
Vault actually works and against what eCTD, the DIA TMF Reference Model, MDR/IVDR, QMSR/ISO 13485 and
RIM actually require.

**Method.** Six framework specifications written independently — Veeva's own architecture, eCTD/CTD,
DIA TMF, device/IVD, QMS controlled documents, RIM — then two audits: a regulatory-accuracy auditor
that hunted overconfident or out-of-date claims, and a code auditor that adjudicated the six designs
against this codebase. Every structural assertion below carries a confidence marker. **The markers
are the point.** A hallucinated section number gets built and then fails an inspection; an admitted
gap gets transcribed from the source.

---

## 1. The one architectural fact

**Veeva Vault has no folders.** A Vault document is a metadata record with a stable identity, a
three-level classification (Type → Subtype → Classification), fields whose applicability follows from
that classification, a lifecycle, and immutable versions each carrying a generated viewable PDF
rendition. Every arrangement a regulation demands — the eCTD position of a leaf, the TMF
zone/section/artifact slot, the QMS controlled-copy shelf, the MDR technical-documentation index — is
a **projection** over that metadata, realized as a saved view (a query) or a binder (an ordered,
recursive, by-reference tree).

The document is stored once and appears in as many structures as the regulations require.

That is not a Veeva design preference. It is forced by the domain. A single protocol is, at the same
instant:

- TMF artifact content in Zone 2, at Trial level, filed contemporaneously;
- eCTD leaf 5.3.5.1 in sequence 0003 of application X, with a lifecycle operation binding it to the
  leaf it replaces in sequence 0001;
- the same leaf again in sequence 0002 of a *different* application in a different region;
- an IRB-submitted controlled copy with its own approval record.

**Any design where "where does this document live" has one answer is wrong before the first line is
written.** `vault.documents.folder_id TEXT` (`shared/schema/vault.ts:114`) is exactly that design.

> **The lesson, stated once: placement is a row, not a column.**

Everything below follows from it.

---

## 2. What "perfect alignment" actually requires

Six structures, and they are not variants of one tree.

| Structure | Shape | Depth | Where it lives today |
|---|---|---|---|
| **eCTD / CTD** | Section hierarchy + a separate XML backbone + per-sequence lifecycle operations | to 5 levels (`3.2.S.4.1`) | `ctd_section TEXT`, values only to `3.2.P.8` |
| **DIA TMF RM** | Zone → Section → Artifact, **times** Trial/Country/Site level | 3 levels × a level dimension | 11 zones, 44 artifacts, **no section level, no level dimension** |
| **MDR / IVDR Annex II–III** | Regulation-defined outline | ~4 levels | seeded, and **misnumbered** — see §5 |
| **FDA device** | eSTAR form slots + QMSR/ISO 13485 record families | form, not folder | 9 ad-hoc folders |
| **QMS controlled docs** | control class × process area, over document/revision/**record** | 3 objects, not 1 | `qms_documents`, separate vocabulary |
| **RIM** | Product spine × Application spine, meeting at a join object | 2 spines | `rim.ts`, three tables |

**The conflicts between them are the design problem**, and they are why one tree cannot work:

1. **eCTD vs RIM.** The dossier structure is one-per-application; the product structure is
   one-product-many-applications-many-countries. A CMC section exists once as a global core document
   and many times as regional adaptations. A folder tree can serve one or the other, never both.
2. **TMF vs everything.** TMF placement is multiplied by Trial × Country × Site. The same artifact
   slot exists once per site. No other framework has this dimension, and no single `folder_id` can
   carry it.
3. **QMS vs submissions.** A blank **form** and its completed **record** are different objects with
   different retention, different approval and different immutability. Submissions have no equivalent
   distinction. Collapsing them loses the record.
4. **Device vs pharma.** Device needs a traceability *graph* — requirement → design input → design
   output → verification → validation → risk control — reconstructable on demand for an auditor.
   That is not a hierarchy at all.

---

## 3. The model

Six authors independently proposed **five** placement tables, **four** structure trees and **four**
document-type vocabularies. Landed together that reproduces the exact defect this work exists to fix.
The code auditor adjudicated them into one model; this is that adjudication.

### 3.1 `regulatory_structure_versions` + `regulatory_structure_nodes` — the reference structures

One versioned tree table in `public`, holding every framework's structure as rows.

- `structure_class` — `submission | technical_documentation | quality_record | design_record | post_market`.
  This is what makes the DHF, the RMF and the DMR *structures* rather than a folder called `eng`.
- `node_kind` — `section | content_slot | form_slot | requirement`. eSTAR is a **form**, not a folder;
  the distinction is load-bearing and only the device author had it.
- `transcription_status` and a per-node `source_basis` — so "the EU Module 1 tree has not been
  transcribed" is a **queryable fact**, not a comment. This is the fail-closed rule applied to
  reference data.
- Versioned, because a document authored in 2025 was built against a different revision of the
  standard, and must keep meaning what it meant.

**Why this one wins over the four alternatives:** it is the only design that keeps the eCTD packager
pure — the constant is generated from the seed with a drift test, the pattern the repo already uses
for the TMF zone mirror at `shared/constants/domain/tmf-reference-model.ts`. The packager under
`server/services/ectd/` is the best thing in this codebase. Nothing in this plan may break it.

`c2c_rule_packs` **stays a real table.** It is the *requirement* layer — which nodes are mandatory
for this application type in this region — and that is a separate question from what the structure
is. It also has a real composite foreign key from `c2c_documents (doc_type, agency, rule_pack_version)`,
and a foreign key cannot reference a view, so one author's "leave it as a view over the new tables"
is not implementable in Postgres.

### 3.2 `document_placements` — the row that replaces the column

One table in `public`, `organization_id INTEGER NOT NULL`, `document_id UUID`:

```
(document_id, structure_version_id, node_id, instance_id, context_kind, context_id, role,
 status, confidence, rationale, placed_by, placed_at)
```

- `instance_id` — the only proposal that can express *3.2.S per substance per manufacturer*, and
  therefore the only one whose completeness denominator can ever be right.
- `(context_kind, context_id)` — TMF country-level vs site-level. This polymorphic shape is already
  the repo's own choice at `submission_leaves.documentTable/documentId`.
- `role` — `primary | supporting | cross_reference`, needed for incorporation by reference.
- The five existing `placement_*` columns move onto this table **verbatim**, so the propose/confirm
  contract in `server/services/vault/vault-filing.service.ts` survives unchanged. That service is
  already fail-closed — an unmatched document lands in a visible Unfiled queue, never a guessed
  folder. Keep it exactly.

`rim_document_links` stays **separate**. It answers "which product/application does this document
concern", not "where does it sit". It must not grow a `node_id`.

### 3.3 `regulatory_document_types` — one vocabulary, three levels

Self-referencing, Veeva's Type → Subtype → Classification shape, which all six authors converged on
independently. Plus:

- `record_class` — `submission_content | technical_documentation | design_record | quality_record | production_record | post_market_record | correspondence`
- governance columns on the node: `is_record`, `requires_training`, `requires_change_control`,
  `default_review_interval_months`, `default_retention_rule`

One companion table `document_type_fields` with `required_from_state` gives per-type metadata with
required-ness enforced per lifecycle state — the thing the repo has none of today.

**This deletes** `VAULT_INGEST_DOCUMENT_TYPES`, `VaultDocKind` and `VAULT_FOLDER_PRESETS` in one
change. A `qms_document_types` tree must not be created; control class is a *column* on the type
node, not a second tree.

### 3.4 `expected_items` — completeness that fails closed

Keyed `(context_kind, context_id, structure_node_id, instance_id)`, with
`applicability ∈ (not_assessed | required | conditional | not_applicable)` **defaulting to
`not_assessed`**, and a database `CHECK` making `not_applicable` unreachable without a rationale, an
actor and a timestamp. A rule enforced only in a service layer is one the next caller routes around.

**The acceptance test for this table — and it is the right test because TMF is the hardest case:**
registering a new site must make the completeness percentage **fall**. If it doesn't, the model
can't express artifact × level × country × site, and it is wrong.

This is also where the repo's live fail-open gets fixed. `server/services/regulatory/readinessEvaluator.ts:176`
returns `completionPercent: required.length > 0 ? … : 100` — a filing type with no artifact matrix
reports 100% complete. One shared not-assessed helper, called by every engine. Not five.

### 3.5 The object layer

Documents *reference* RIM objects rather than living inside them: Substance → Product →
Presentation → Application → Submission → Country → Registration → Variation → Commitment. For v1,
the join object and the Application object are what matter; IDMP/SPOR vocabularies are a later phase
and should not be designed now.

---

## 4. What Veeva actually does — corrections worth having

The accuracy auditor caught the reference-implementation spec misdescribing Veeva twice, and both
matter because this is the model being copied.

- **RIM completeness is driven by Content Plans, not EDLs.** The Expected Document List is the
  *Clinical* / eTMF mechanism. Vault RIM Submissions uses Content Plans and Content Plan Templates.
  Building one mechanism and calling it both would produce something that is neither. *(confidence:
  high — confirm against the Vault release the customer is on.)*
- **Veeva's three-level classification ceiling is a limitation, not a feature.** One spec proposed
  hardening it into a database trigger. Do not. A sibling framework in the same set needs four
  levels. Copy the shape; don't copy the ceiling.
- **Binders are by reference, recursive and independently versioned.** A binder version and its
  documents' versions are separate. This is what makes one document appear in many structures, and
  it is the mechanism `document_placements` reproduces.

Where Veeva is genuinely weak, and where this product can win: configuration burden, cost, migration
difficulty, and **medtech/IVD** — Veeva does not ship MDR/IVDR Annex II as a maintained reference
model the way it ships the TMF Reference Model.

---

## 5. Findings that change what you build

Each verified in this repo or against the regulation, not inherited from the specs.

**QMSR is in force and the repo has stale citations.** The Quality Management System Regulation
final rule (89 FR 7496, published 2 February 2024) amended 21 CFR Part 820 with a compliance date of
**2 February 2026** — seven months ago. Part 820 now incorporates ISO 13485:2016 by reference, and
the Device Master Record, Device History Record and Design History File definitions were removed from
§820.3. The repo is *partially* aware — 10 files mention QMSR — but
`shared/regulatory/global-document-registry.ts:414-415` still describes DMR and DHR as "21 CFR
820.181" and "21 CFR 820.184" as current authority, and `shared/regulatory/project-bootstrap.ts:797-801`
seeds `qms_dmr_sections` / `qms_dhr_sections` / `us_dhf_sections`. **Do not seed those paragraphs as
current.** Seed against the codified amended Part 820 plus ISO 13485 §4.2.3 (medical device file) and
§7.3.10 (design and development files). *(confidence: high on the rule and the date; **verify** which
specific paragraphs survive against the codified text before writing seed rows.)*

**The MDR Annex II seed is a reconstruction, and it misnumbers the Regulation.**
`migrations/20260810b_eu_mdr_ivdr_outlines.sql:80` flattens Annex II §1 into `II.1.a`–`II.1.g`, all
siblings under `II.1`. In the Regulation, §1 contains **§1.1** "Device description and specification"
(whose lettered points run (a)–(h)) and **§1.2** "Reference to previous and similar generations of
the device" — a numbered subsection, not a lettered sibling. The seed makes §1.2 into `II.1.g`. It
also adds a top-level node `IV` "Conformity assessment and registration" that is in neither Annex II
nor Annex III. Mark this `source_basis = 'reconstructed'` — the same honest status the eSTAR tree
already carries — and require a human transcription from the Official Journal consolidated text
before any node claims `source_document = 'MDR Annex II'`. *(confirmed in the file.)*

**The TMF model is 18% of the reference model, and two levels short.**
`server/services/etmf/tmf-completeness.ts` holds 11 zones and **44 artifacts** (26 essential). The
DIA TMF Reference Model is Zone → **Section** → Artifact, roughly 250 artifacts. The repo has no
section level and no Trial/Country/Site level dimension at all. A completeness percentage computed
against 44 of ~250 slots is not a completeness percentage. *(counts confirmed in the file; the ~250
must be read off the released DIA spreadsheet — do not code a number from memory.)*

**Essentiality authority is out of date.** `tmf-completeness.ts:14-15` cites ICH E6(R2) §8. E6(R3)
was adopted in 2025 and reframes essential documents as risk-based essential records. Any list
presented as "the essential documents" must say which revision it is against. *(confidence: high.)*

**One eCTD claim is asserted at 'certain' and cannot be verified here.** The backbone element story —
that there is no `m3-2-s-4` element, so a leaf declares a code deeper than the backbone node it
attaches to — decides where every Module 3 leaf attaches. `assets/ectd-dtd/` contains only a README,
checksums and fixtures; the ICH DTD is not vendored. **Vendor the DTD and validate a fixture that
places a `3.2.S.4.1` leaf before populating `backbone_element` for any Module 3 node.** Blocking
prerequisite, not a follow-up.

---

## 6. Three repo constraints that decide whether any of this ships

None of the six authors could have known these. All three are fatal to the plans as written.

**1. Every `DROP COLUMN` against `vault.documents` is inert.**
`scripts/db/deploy-migrate.mjs:210` re-executes all 238 entries of `C2C_MIGRATION_FILES`
unconditionally on every deploy, with `stopOnFirstFailure`.
`migrations/20260823_vault_document_placement.sql:49-56` re-`ADD`s `folder_id`, `evidence_kind`,
`ctd_section` and the five `placement_*` columns with `ADD COLUMN IF NOT EXISTS`, and it sits at
index 1590. A `DROP` placed before it is silently undone; one placed after re-drops the columns every
deploy. **The only real fix is to edit `20260823` in place** — which collides with the applied-file
sha256 journal that exists to detect exactly that edit. *There must be a written policy for this
before any DDL is authored:* which files may be amended, what the amendment header says, and whether
`C2C_MIGRATION_JOURNAL_STRICT` is set in the deploy environment.

**2. Reference data cannot reach a deployed database except through a migration file.**
`deploy-migrate` has five steps and none of them is a seed. A `scripts/seed-regulatory-structures.ts`
would exist on developer laptops only. The pattern that actually deploys is the one already in use —
`INSERT … ON CONFLICT (key) DO NOTHING` inside a ~100-line SQL migration. That pattern has a
consequence nobody addressed: **`DO NOTHING` means a transcription error can never be corrected in
place**, only by minting a new version row and remapping every placement. Correct for customer
customizations, brutal for a 250-artifact catalog being transcribed for the first time. Decide the
mechanism, set a per-file size ceiling, and put a row-count and content-hash assertion inside each
seed migration so a truncated seed fails loudly rather than producing a partial tree the completeness
engine then reports a percentage against.

**3. A new schema ships with no tenant isolation.** Only `vault` is a Drizzle `pgSchema`. Both tenant
sweeps are public+integer or a hand-maintained non-public table list. A new `tmf.` schema, or new
`vault.*` tables, ship with **no RLS policy** and are cross-tenant readable under `RLS_ENFORCE=on`.
Every new table gets `organization_id INTEGER NOT NULL`, in `public`. And `vault.documents` gains
`organization_id` as a **prerequisite** of the placement work, not a follow-up — that two-line change
is also what retires the `vault_documents` entry in `EXTERNAL_DOCUMENT_TABLES` and makes a vault
document leafable at last.

Also: every new migration must name its **insertion position** in `C2C_MIGRATION_FILES`, before the
final pair (`20260801_uuid_tenant_isolation_nonpublic.sql`, then `20260801_tenant_isolation_sweep.sql`)
which CI enforces as last. Anything appended after either is never swept and ships with no RLS.

---

## 7. The programme

Sequenced so that each step is independently shippable and nothing deletes a vocabulary before its
replacement exists.

| # | Step | Deletes | Notes |
|---|---|---|---|
| 0 | Migration-amendment policy, in `CLAUDE.md` | — | Blocks everything else. Half a day. |
| 1 | `organization_id` + `document_type_id` on `vault.documents`; `submission_leaves.document_id` UUID fix | nothing | Pure unblocking. Makes a vault document leafable. |
| 2 | `regulatory_structure_versions` / `_nodes`, seeded **mechanically from `c2c_rule_packs`** | nothing | Zero transcription risk — the rows already exist. |
| 3 | `regulatory_document_types` + generated-constant drift test, then the `vault-taxonomy.ts` deletions in one commit | the three vocabularies | The zero-duplication change. |
| 4 | `document_placements` + the `20260823` amendment | `folder_id`, `ctd_section`, `evidence_kind` | Where the architecture actually lands. |
| 5 | `expected_items` + the shared not-assessed helper; fix `readinessEvaluator.ts:176` | — | Failing test first: assert a no-matrix filing type is **not** 100%. |

**Transcription runs in parallel and gates nothing** except the completeness numbers for the
frameworks being transcribed, which report `not_assessed` until it finishes. That is the correct
behaviour and it is why `transcription_status` is a column.

What must be transcribed by a human from the source document, not generated:

- the DIA TMF Reference Model catalog (zones × sections × artifacts) — from the released spreadsheet
- the ICH M4 tree to leaf granularity, and each region's Module 1 separately — M1 is not ICH's
- MDR and IVDR Annex II/III — re-transcribed from the OJ consolidated text, replacing the current
  reconstruction
- the codified amended Part 820 under QMSR, plus the ISO 13485 clauses it incorporates

**Do not let anyone generate these lists.** A plausible artifact code that does not exist in the
DIA model is worse than an empty catalog, because the empty catalog reports `not_assessed` and the
plausible one reports a number.

---

## 8. What I would do first

Step 0, then step 1. Step 0 is half a day of writing a policy and is the thing that makes every
subsequent DDL real rather than inert. Step 1 is two columns and a type change, deletes nothing, and
closes the single most important parity gap in the previous assessment: a document in the Vault can
finally become a submission.
