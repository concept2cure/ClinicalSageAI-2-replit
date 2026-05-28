# Phase 9 — Schema Migration Brief (`c2c_documents` family)

> Backend-only brief for Claude Code. Companion to `PHASE_9_INSTALL.md` (which covers the UI) and `MUTATION_PRIMITIVES_BRIEF.md` (which covers the action ledger). This document specifies the **document schema unification** that ends the misnamed-`cerv2_510k_sections` problem and lands the universal authoring data model.
>
> Read `MUTATION_PRIMITIVES_BRIEF.md` first — the mutations land before this; this lands before any moat.

---

## 0 · What this fixes

Today, three pathways (510(k), PMA, CER) write through one misnamed table:

```
EstarEditor      ─┐
PmaEditor        ─┼─→ PATCH /api/cerv2-sections/:id ─→ cerv2_510k_sections
CerEditor        ─┘
useAcceptAnaDraft  →  POST  /api/cerv2-sections/:id/accept-ana-draft
useK510EstarSections → GET /api/510k/projects/:ident/document-preview (same table)
```

PMA and CER drafts silently land in a 510(k)-named store with no version history per Phase 9's `c2c_document_section_versions` design. There is no Biopharma equivalent table at all — IND, NDA, BLA, MAA sections have no canonical home, so Phase 10's biopharma surfaces show fixtures.

Phase 9 schema migration unifies all of it under **one document model** keyed by `(doc_type, agency)` rule pack.

---

## 1 · Tables (DDL)

```sql
-- 1) c2c_documents — the unified document row.
CREATE TABLE c2c_documents (
  id                 text PRIMARY KEY,                      -- doc_<uuid>
  org_id             uuid NOT NULL,
  project_id         uuid NOT NULL REFERENCES regulatory_programs(id),
  doc_type           text NOT NULL,                          -- 'ind' | 'nda' | 'bla' | 'maa' | 'k510' | 'pma' | 'cer' | 'psur' | 'haq' | 'briefing' | …
  agency             text NOT NULL,                          -- 'fda' | 'ema' | 'pmda' | 'hc' | 'mhra' | 'ich' | …
  rule_pack_version  text NOT NULL,                          -- foreign key into c2c_rule_packs
  title              text NOT NULL,
  status             text NOT NULL DEFAULT 'draft',          -- draft | review | approved | locked | submitted | archived
  readiness          integer NOT NULL DEFAULT 0,             -- 0..100; computed, refreshed by trigger on section change
  owner_id           uuid REFERENCES users(id),
  artifact_id        text REFERENCES concept2cure_artifacts(id), -- immutable snapshot on lock
  locked_at          timestamptz,
  submitted_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT c2c_documents_rule_pack_fk
    FOREIGN KEY (doc_type, agency, rule_pack_version)
    REFERENCES c2c_rule_packs (doc_type, agency, version)
);
CREATE INDEX c2c_documents_project_idx ON c2c_documents (project_id);
CREATE INDEX c2c_documents_pack_idx    ON c2c_documents (doc_type, agency);
CREATE INDEX c2c_documents_owner_idx   ON c2c_documents (owner_id);

-- 2) c2c_document_sections — sectioned content (replaces cerv2_510k_sections + cer_sections).
CREATE TABLE c2c_document_sections (
  id                 bigserial PRIMARY KEY,
  document_id        text NOT NULL REFERENCES c2c_documents(id) ON DELETE CASCADE,
  section_key        text NOT NULL,                          -- 'm2.5' | 'C2' | '3.2.S' | 'haq-cmc' | …
  parent_key         text,                                   -- for nested sections
  label              text NOT NULL,
  path_order         integer NOT NULL,                       -- display order
  mandatory          boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'todo',           -- todo | drafted | review | approved | locked
  owner_id           uuid REFERENCES users(id),
  content            jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { paragraphs: [{id, text, prov, citations}], xml?, diff? }
  draft_source       text,                                   -- 'human' | 'ana' | 'imported' | 'template'
  drafted_at         timestamptz,
  accepted_by        uuid REFERENCES users(id),
  accepted_at        timestamptz,
  version            integer NOT NULL DEFAULT 1,
  UNIQUE (document_id, section_key)
);
CREATE INDEX c2c_doc_sections_doc_idx     ON c2c_document_sections (document_id);
CREATE INDEX c2c_doc_sections_owner_idx   ON c2c_document_sections (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX c2c_doc_sections_status_idx  ON c2c_document_sections (status) WHERE status IN ('todo','drafted','review');

-- 3) c2c_document_section_versions — every PATCH writes one row here.
CREATE TABLE c2c_document_section_versions (
  id                 bigserial PRIMARY KEY,
  section_id         bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  content            jsonb NOT NULL,
  author_id          uuid NOT NULL REFERENCES users(id),
  author_kind        text NOT NULL DEFAULT 'human',          -- 'human' | 'ana'
  reason             text NOT NULL,                          -- Part-11 reason for change (required)
  ana_action_id      text REFERENCES c2c_ana_actions(id),    -- backlink when AnA-mediated
  parent_version_id  bigint REFERENCES c2c_document_section_versions(id), -- for branch/restore semantics
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, version)
);
CREATE INDEX c2c_doc_section_versions_section_idx ON c2c_document_section_versions (section_id);

-- 4) c2c_rule_packs — the (doc_type, agency, version) registry.
CREATE TABLE c2c_rule_packs (
  doc_type           text NOT NULL,
  agency             text NOT NULL,
  version            text NOT NULL,                          -- 'ich-m4-v2.0' | 'fda-510k-2024' | …
  label              text NOT NULL,                          -- 'IND × FDA · eCTD M1-5 (US)'
  required_sections  jsonb NOT NULL,                         -- [{key, parent_key, label, mandatory, path_order}]
  validators         jsonb NOT NULL DEFAULT '[]'::jsonb,     -- Moat #1 lint rules
  template_id        text REFERENCES account_template_registry(id),
  esubmit_channel    text,                                   -- 'ESG' | 'CESP' | 'PMDA' | …
  effective_from     date NOT NULL,
  superseded_by      text,                                   -- next version when bumped
  PRIMARY KEY (doc_type, agency, version)
);

-- 5) c2c_document_section_evidence — section ↔ vault evidence, audited.
CREATE TABLE c2c_document_section_evidence (
  id                 bigserial PRIMARY KEY,
  section_id         bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  evidence_kind      text NOT NULL,                          -- 'artifact' | 'vault_doc' | 'rim_precedent' | 'guidance'
  evidence_ref       text NOT NULL,
  paragraph_id       text,                                   -- nullable; null = section-level cite
  confidence         numeric(3,2),
  linked_by          uuid NOT NULL REFERENCES users(id),
  linked_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_doc_evidence_section_idx ON c2c_document_section_evidence (section_id);
```

---

## 2 · `(doc_type, agency)` enum surface

The CHECK constraints for `c2c_documents.doc_type` and `c2c_documents.agency` come from the UI fixtures in `ui_kits/authoring/data.jsx`:

```sql
ALTER TABLE c2c_documents ADD CONSTRAINT c2c_documents_doc_type_check
  CHECK (doc_type IN ('ind','cta','nda','bla','maa','jnda','k510','denovo','pma','cer','psur',
                      'ib','protocol','csr','briefing','mod3','mod2','haq'));

ALTER TABLE c2c_documents ADD CONSTRAINT c2c_documents_agency_check
  CHECK (agency IN ('fda','ema','pmda','hc','mhra','ich','tga','nmpa','mfds'));
```

Adding new types or agencies = a single migration that updates both the CHECK and seeds new `c2c_rule_packs` rows. No code change.

---

## 3 · Migration · transactional

Must run as one transaction. Three reads, three rewrites, two drops.

```sql
BEGIN;

-- A. Seed c2c_rule_packs (13 rows at launch — see ui_kits/authoring/data.jsx > AUTH_OUTLINES).
INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, effective_from)
VALUES
  ('ind','fda','ich-m4-v2.0', 'IND × FDA · eCTD Module 1-5 (US)',
    $$[{"key":"m1.1","label":"Forms (1571, 1572, 3674)","mandatory":true,"path_order":1},
       {"key":"m2.5","label":"Clinical overview","mandatory":true,"path_order":15}, …]$$::jsonb,
    '2026-05-26'),
  ('ind','mhra', …),
  ('cta','ema',  …),
  ('k510','fda', …),
  ('pma','fda',  …),
  ('cer','ema',  …),
  ('psur','ema', …),
  ('ib','ich',   …),
  ('protocol','ich', …),
  ('csr','ich', …),
  ('briefing','fda', …),
  ('mod3','ich', …),
  ('mod2','ich', …);

-- B. Backfill from cerv2_510k_sections → one c2c_documents row per fda510k_projects row,
--    one c2c_document_sections row per cerv2_510k_sections row.
INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, created_at, updated_at)
SELECT
  'doc_' || encode(gen_random_bytes(8), 'hex'),
  p.org_id,
  p.id,
  'k510',
  'fda',
  'fda-510k-2024',
  p.title,
  CASE WHEN p.is_submitted THEN 'submitted' WHEN p.is_locked THEN 'locked' ELSE 'draft' END,
  COALESCE(p.completion_percentage, 0),
  p.created_at,
  p.updated_at
FROM fda510k_projects p
WHERE NOT EXISTS (SELECT 1 FROM c2c_documents d WHERE d.project_id = p.id AND d.doc_type = 'k510');

-- Then copy each section row, mapping by project_id + section_key.
INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, owner_id, content, draft_source, drafted_at, accepted_by, accepted_at, version)
SELECT
  d.id,
  s.section_key,
  s.parent_key,
  COALESCE(s.section_title, s.section_key),
  COALESCE(s.display_order, 0),
  COALESCE(s.is_required, false),
  COALESCE(s.status, 'todo'),
  s.owner_id,
  jsonb_build_object('paragraphs', COALESCE(s.content_paragraphs, '[]'::jsonb), 'xml', s.section_xml),
  s.draft_source,
  s.drafted_at,
  s.accepted_by,
  s.accepted_at,
  COALESCE(s.version, 1)
FROM cerv2_510k_sections s
JOIN fda510k_projects p ON p.id = s.project_id
JOIN c2c_documents    d ON d.project_id = p.id AND d.doc_type = 'k510';

-- C. Backfill from cer_sections → c2c_documents (doc_type='cer') + c2c_document_sections.
--    Same pattern as above.

-- D. Synthesize empty c2c_documents rows for every pma_submissions row with no current store.
INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, created_at, updated_at)
SELECT
  'doc_' || encode(gen_random_bytes(8), 'hex'),
  sub.org_id, sub.id, 'pma', 'fda', 'fda-pma-2024',
  sub.title, 'draft', 0, sub.created_at, sub.updated_at
FROM pma_submissions sub
WHERE NOT EXISTS (SELECT 1 FROM c2c_documents d WHERE d.project_id = sub.id AND d.doc_type = 'pma');

-- E. Synthesize empty docs for every biopharma program (regulatory_programs with program_type in IND/NDA/BLA/MAA/JNDA).
INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, created_at, updated_at)
SELECT
  'doc_' || encode(gen_random_bytes(8), 'hex'),
  p.org_id, p.id, LOWER(p.program_type), p.agency_code, 'ich-m4-v2.0',
  p.title, 'draft', 0, p.created_at, p.updated_at
FROM regulatory_programs p
WHERE p.program_type IN ('IND','CTA','NDA','BLA','MAA','JNDA')
  AND NOT EXISTS (SELECT 1 FROM c2c_documents d WHERE d.project_id = p.id);

-- F. Drop the write path on cerv2_510k_sections + cer_sections. Keep the tables read-only
--    for one release cycle so existing reports don't break, then drop.
REVOKE INSERT, UPDATE, DELETE ON cerv2_510k_sections FROM application_role;
REVOKE INSERT, UPDATE, DELETE ON cer_sections          FROM application_role;

COMMIT;
```

After one full release cycle (≈30 days, monitored via legacy-route 5xx rate), the legacy tables are dropped:

```sql
DROP TABLE cerv2_510k_sections;
DROP TABLE cer_sections;
```

---

## 4 · Routes

```
GET    /api/c2c/documents?projectId=…&docType=…&agency=…
GET    /api/c2c/documents/:id
GET    /api/c2c/documents/:id/outline                       # required_sections joined with c2c_document_sections
GET    /api/c2c/documents/:id/sections/:key
PATCH  /api/c2c/documents/:id/sections/:key                 # writes c2c_document_section_versions; uses /actions/transition under the hood
POST   /api/c2c/documents/:id/sections/:key/ai-draft        # routes to AnA + writes /actions/accept-ai-suggestion when accepted
POST   /api/c2c/documents/:id/sections/:key/evidence        # writes c2c_document_section_evidence + /actions/resolve audit
DELETE /api/c2c/documents/:id/sections/:key/evidence/:evId  # audited
POST   /api/c2c/documents/:id/lock                          # uses /actions/lock
POST   /api/c2c/documents/:id/submit                        # snapshots to concept2cure_artifacts, fires submission gateway
GET    /api/c2c/rule-packs?docType=…&agency=…
```

Every mutation route is a **thin wrapper around `/api/c2c/actions/*`** from the Mutation Primitives brief — they accept the same envelope, write the same audit rows. The Phase 9 routes only exist so AnA + the UI can call something domain-shaped; under the hood it's one ledger.

Legacy redirect:
```
/api/cerv2-sections/:id                    → /api/c2c/documents/:docId/sections/:key  (301)
/api/cerv2-sections/:id/accept-ana-draft   → /api/c2c/actions/accept-ai-suggestion    (301)
/api/510k/projects/:ident/document-preview → /api/c2c/documents/:id/outline           (301)
```

Resolver: `/api/c2c/documents/by-legacy/cerv2-section/:id` returns the new `(documentId, sectionKey)` for any pre-migration row.

---

## 5 · Triggers

```sql
-- Readiness is computed, not stored. Trigger on section status change.
CREATE OR REPLACE FUNCTION c2c_recompute_document_readiness() RETURNS trigger AS $$
BEGIN
  UPDATE c2c_documents d
  SET readiness = (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('approved','locked')) / NULLIF(COUNT(*),0))::integer
    FROM c2c_document_sections s
    WHERE s.document_id = d.id
  ),
  updated_at = now()
  WHERE d.id = NEW.document_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER c2c_doc_readiness_after_section
AFTER INSERT OR UPDATE OF status ON c2c_document_sections
FOR EACH ROW EXECUTE FUNCTION c2c_recompute_document_readiness();

-- Version row on every content change.
CREATE OR REPLACE FUNCTION c2c_snapshot_section_version() RETURNS trigger AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO c2c_document_section_versions (section_id, version, content, author_id, author_kind, reason)
    VALUES (NEW.id, NEW.version, OLD.content, current_setting('app.actor_id')::uuid, 'human', current_setting('app.reason'));
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER c2c_doc_section_version_before_update
BEFORE UPDATE ON c2c_document_sections
FOR EACH ROW EXECUTE FUNCTION c2c_snapshot_section_version();
```

Application-layer set `app.actor_id` and `app.reason` per-request (existing pattern in PDEV).

---

## 6 · Acceptance

- [ ] Five new tables created with the documented constraints, indexes, and triggers.
- [ ] 13 rule packs seeded from `ui_kits/authoring/data.jsx > AUTH_OUTLINES`.
- [ ] Backfill produces exactly one `c2c_documents` row per `fda510k_projects` row, one per `cer_reports` row, one per `pma_submissions` row, and one per biopharma `regulatory_programs` row.
- [ ] No orphaned sections — every `c2c_document_sections` row has a valid `document_id`.
- [ ] Section content preserved byte-for-byte from `cerv2_510k_sections.content_paragraphs` and `cer_sections.content_blob`.
- [ ] Legacy tables become read-only.
- [ ] Legacy routes 301 to the new family; `useAcceptAnaDraft` continues to work without code changes (the 301 lands on `/api/c2c/actions/accept-ai-suggestion`).
- [ ] Every PATCH writes a `c2c_document_section_versions` row; restore-from-version works.
- [ ] Readiness recomputes on section status change.
- [ ] No regression on existing 510(k), CER, PMA flows — verified by replaying the last 30 days of staging traffic against the new endpoints.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 7 · Out of scope

- Inline compliance gate evaluations — that's Moat #1's brief; this brief only ships the `c2c_rule_packs.validators` jsonb column where they live.
- Cross-document propagation — Moat #4's brief; relies on this brief's `c2c_document_section_evidence` to find references.
- Custom user-uploaded templates — explicitly declined in the Artos comparison; templates stay server-curated through `c2c_rule_packs`.
- Submission gateway wiring — Moat #5; this brief only adds the `submitted_at` column the gateway sets.

---

## 8 · Timeline

| Day | Work |
|---|---|
| 1 | Migration: 5 new tables, 2 triggers, CHECK constraints, indexes. Seed `c2c_rule_packs` from JSON fixtures. |
| 2 | Backfill from cerv2_510k_sections + cer_sections + pma_submissions + biopharma regulatory_programs. Verify row counts. |
| 3 | Routes + legacy 301 redirects + `by-legacy` resolver. Wire mutations to `/api/c2c/actions/*` (Mutation Primitives brief). |
| 4 | UI cutover: `useAcceptAnaDraft` → `useAcceptAi`; authoring engine reads `/api/c2c/documents/:id/outline` instead of `/api/510k/projects/:ident/document-preview`. |
| 5 | Replay-test 30 days of staging traffic against new endpoints. Monitor 5xx for one week before dropping legacy tables. |

After day 5, the entire authoring stack — MDX, Biopharma, PDEV — runs on one document model, one audit ledger, and one rule-pack registry.
