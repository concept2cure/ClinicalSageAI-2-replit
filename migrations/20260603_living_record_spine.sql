-- Living Record Spine
-- Migration: 20260603_living_record_spine.sql
--
-- Adds the value layer underneath the existing living-file cascade:
--   1) the eCTD Sequence node that was missing from the object spine
--   2) the canonical fact store (one agreed value per program+entity+field)
--   3) derived-value bindings (what points at a fact, and how)
--   4) the Drift Sentinel output table (expected vs observed divergence)
--   5) a canonical graph overlay (spine_nodes / spine_edges)
--   6) value + verification columns on the canonical claim (evidence_claims)
--
-- Canonical tables this builds on (does NOT duplicate):
--   evidence_claims        the claim node            (shared/schema.ts)
--   evidence_claim_links   typed claim adjacency     (shared/schema.ts)
--   evidence_sources       the source artifact       (shared/schema.ts)
--   regulatory_programs    the program anchor (uuid) (shared/schema/programs.ts)
--   standards_applicability scoping pattern mirrored (migration 20260429)
--
-- Scoping convention (matches the cascade world — change-router.service.ts):
--   program_id       uuid  → regulatory_programs(id), what the cascade keys on
--   organization_id  int   → tenant boundary, used everywhere
-- The claim is integer-program-scoped; claim ↔ fact is joined by the explicit
-- evidence_claims.canonical_fact_id (uuid), so no id-type clash arises.
--
-- Compliance touch points:
--   - 21 CFR Part 11 §11.10(b),(c),(e)  traceable values, supersession history
--   - ALCOA+                            attributable, contemporaneous, accurate
--
-- IDEMPOTENT: safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1) regulatory_sequences  (NEW) — the eCTD Sequence node
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_sequences (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  program_id         uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  -- typed submission pointer (e.g. 'submission:NDA-212345'); submissions are
  -- fragmented across pathway tables, so this is a soft pointer, not an FK.
  submission_ref     text,
  sequence_number    varchar(12) NOT NULL,            -- eCTD style: '0000', '0001'
  title              text,
  sequence_type      varchar(40) NOT NULL DEFAULT 'original',
                                                       -- original | amendment | supplement | response | annual_report
  status             varchar(20) NOT NULL DEFAULT 'planning',
                                                       -- planning | compiling | validated | submitted | superseded
  superseded_by_id   uuid,
  submitted_at       timestamp with time zone,
  metadata           jsonb DEFAULT '{}'::jsonb,

  created_by         integer,
  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  updated_at         timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regulatory_sequences_program_idx
  ON regulatory_sequences (program_id);
CREATE INDEX IF NOT EXISTS regulatory_sequences_org_idx
  ON regulatory_sequences (organization_id);
CREATE INDEX IF NOT EXISTS regulatory_sequences_status_idx
  ON regulatory_sequences (status);
CREATE UNIQUE INDEX IF NOT EXISTS regulatory_sequences_number_idx
  ON regulatory_sequences (program_id, sequence_number);

COMMENT ON TABLE regulatory_sequences IS
  'eCTD sequence node of the object spine. Program-scoped, ordered, with supersession.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2) canonical_facts  (NEW) — the Canonical Fact Store
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_facts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          integer NOT NULL,
  program_id               uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  -- the (entity, field) key — the address of a fact within a program
  entity                   text NOT NULL,             -- e.g. 'study_201.enrollment'
  field                    text NOT NULL,             -- e.g. 'n_randomized'

  -- the agreed value
  value_num                numeric,                   -- when numeric
  value_text               text,                      -- when not numeric / canonical string form
  unit                     varchar(40),
  comparator               varchar(8) NOT NULL DEFAULT '=',  -- = | >= | <= | ~ | range
  value_type               varchar(20) NOT NULL DEFAULT 'text',
                                                       -- count | measure | date | categorical | boolean | text

  -- provenance of the agreed value
  established_by_claim_id   integer,                  -- soft ref → evidence_claims.id
  established_by_source_id  integer,                  -- soft ref → evidence_sources.id
  confidence               numeric(5,4) NOT NULL DEFAULT 0.5000,

  -- lifecycle of the fact itself
  status                   varchar(20) NOT NULL DEFAULT 'active',
                                                       -- active | disputed | superseded | retracted
  version                  integer NOT NULL DEFAULT 1,
  supersedes_id            uuid,                       -- prior version of this fact
  content_hash             varchar(64),                -- sha256 of canonical value form

  metadata                 jsonb DEFAULT '{}'::jsonb,
  created_by               integer,
  created_at               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at               timestamp with time zone NOT NULL DEFAULT now()
);

-- one active fact per (program, entity, field) — the "single source of truth"
CREATE UNIQUE INDEX IF NOT EXISTS canonical_facts_active_key_idx
  ON canonical_facts (program_id, entity, field)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS canonical_facts_program_idx
  ON canonical_facts (program_id);
CREATE INDEX IF NOT EXISTS canonical_facts_org_idx
  ON canonical_facts (organization_id);
CREATE INDEX IF NOT EXISTS canonical_facts_entity_idx
  ON canonical_facts (program_id, entity);
CREATE INDEX IF NOT EXISTS canonical_facts_status_idx
  ON canonical_facts (status);

COMMENT ON TABLE canonical_facts IS
  'Canonical Fact Store. One active value per (program, entity, field). The single source of truth a value agrees with.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3) fact_bindings  (NEW) — Derived-Value Bindings
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fact_bindings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  program_id         uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  fact_id            uuid NOT NULL REFERENCES canonical_facts(id) ON DELETE CASCADE,

  -- typed target pointer (reuses the mutation-primitive vocabulary):
  --   'claim:123' | 'document:doc_x' | 'section:doc_x:m2.5' | 'paragraph:doc_x:m2.5:p4'
  target             text NOT NULL,
  target_kind        varchar(20) NOT NULL,            -- claim | document | section | paragraph
  binding_kind       varchar(20) NOT NULL DEFAULT 'mirror',
                                                       -- mirror | derived | manual_override
  transform          jsonb,                            -- for binding_kind='derived': { fn, args }

  observed_value     text,                             -- last value seen at the target
  binding_status     varchar(20) NOT NULL DEFAULT 'bound',
                                                       -- bound | drifted | overridden | broken
  override_reason    text,                             -- required when binding_kind='manual_override'

  last_checked_at    timestamp with time zone,
  created_by         integer,
  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  updated_at         timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fact_bindings_fact_target_idx
  ON fact_bindings (fact_id, target);
CREATE INDEX IF NOT EXISTS fact_bindings_program_idx
  ON fact_bindings (program_id);
CREATE INDEX IF NOT EXISTS fact_bindings_target_idx
  ON fact_bindings (target);
CREATE INDEX IF NOT EXISTS fact_bindings_status_idx
  ON fact_bindings (binding_status);

COMMENT ON TABLE fact_bindings IS
  'Derived-value bindings. A typed target that should agree with a canonical fact (mirror, derived, or manual_override).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4) fact_drift  (NEW) — Drift Sentinel output
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fact_drift (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  program_id         uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  fact_id            uuid NOT NULL REFERENCES canonical_facts(id) ON DELETE CASCADE,
  binding_id         uuid REFERENCES fact_bindings(id) ON DELETE CASCADE,

  expected_value     text,                             -- the canonical value at detection
  observed_value     text,                             -- the diverging value at the target
  drift_type         varchar(24) NOT NULL,             -- value_mismatch | unit_mismatch | stale_source | missing_target
  severity           varchar(12) NOT NULL DEFAULT 'medium',  -- low | medium | high | critical

  status             varchar(16) NOT NULL DEFAULT 'open',    -- open | acknowledged | resolved | dismissed
  detected_at        timestamp with time zone NOT NULL DEFAULT now(),
  detected_by        varchar(40) NOT NULL DEFAULT 'drift_sentinel',
  resolved_at        timestamp with time zone,
  resolved_by        integer,
  resolution         text,
  cascade_action_id  text,                             -- backlink to the change-router result, when fanned out

  metadata           jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS fact_drift_program_idx
  ON fact_drift (program_id);
CREATE INDEX IF NOT EXISTS fact_drift_fact_idx
  ON fact_drift (fact_id);
CREATE INDEX IF NOT EXISTS fact_drift_binding_idx
  ON fact_drift (binding_id);
CREATE INDEX IF NOT EXISTS fact_drift_open_idx
  ON fact_drift (program_id, status) WHERE status = 'open';

COMMENT ON TABLE fact_drift IS
  'Drift Sentinel output: a bound target value diverged from its canonical fact. Handed to the cascade router.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5) spine_nodes / spine_edges  (NEW) — the canonical graph overlay
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spine_nodes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  program_id         uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  node_kind          varchar(24) NOT NULL,
                     -- program | product | substance | device | submission | sequence
                     -- | document | section | claim | evidence_value | source_artifact
  entity_id          text NOT NULL,                    -- pointer into the concrete table (id as text)
  label              text,
  metadata           jsonb DEFAULT '{}'::jsonb,
  created_at         timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS spine_nodes_kind_entity_idx
  ON spine_nodes (program_id, node_kind, entity_id);
CREATE INDEX IF NOT EXISTS spine_nodes_program_idx
  ON spine_nodes (program_id);
CREATE INDEX IF NOT EXISTS spine_nodes_kind_idx
  ON spine_nodes (node_kind);

COMMENT ON TABLE spine_nodes IS
  'Canonical graph overlay: one row per spine entity, pointing at its concrete table row by (node_kind, entity_id).';

CREATE TABLE IF NOT EXISTS spine_edges (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  program_id         uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  from_node_id       uuid NOT NULL REFERENCES spine_nodes(id) ON DELETE CASCADE,
  to_node_id         uuid NOT NULL REFERENCES spine_nodes(id) ON DELETE CASCADE,
  edge_kind          varchar(24) NOT NULL,
                     -- contains | asserts | supports | contradicts | references
                     -- | supported_by | establishes | derives | supersedes | binds_to
  confidence         numeric(5,4) NOT NULL DEFAULT 1.0000,
  version            integer NOT NULL DEFAULT 1,
  metadata           jsonb DEFAULT '{}'::jsonb,
  created_at         timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS spine_edges_triple_idx
  ON spine_edges (from_node_id, to_node_id, edge_kind);
CREATE INDEX IF NOT EXISTS spine_edges_program_idx
  ON spine_edges (program_id);
CREATE INDEX IF NOT EXISTS spine_edges_from_idx
  ON spine_edges (from_node_id);
CREATE INDEX IF NOT EXISTS spine_edges_to_idx
  ON spine_edges (to_node_id);
CREATE INDEX IF NOT EXISTS spine_edges_kind_idx
  ON spine_edges (edge_kind);

COMMENT ON TABLE spine_edges IS
  'Canonical edge schema: typed, versioned, confidence-scored relationships between spine nodes.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6) evidence_claims — value + verification columns (elevate the Claim)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE evidence_claims
  ADD COLUMN IF NOT EXISTS entity              text,
  ADD COLUMN IF NOT EXISTS field               text,
  ADD COLUMN IF NOT EXISTS value_num           numeric,
  ADD COLUMN IF NOT EXISTS value_text          text,
  ADD COLUMN IF NOT EXISTS unit                varchar(40),
  ADD COLUMN IF NOT EXISTS comparator          varchar(8) DEFAULT '=',
  ADD COLUMN IF NOT EXISTS value_type          varchar(20),
  ADD COLUMN IF NOT EXISTS verification        varchar(16) NOT NULL DEFAULT 'unverified',
                                               -- unverified | verified | drifted | disputed
  ADD COLUMN IF NOT EXISTS canonical_fact_id   uuid;

CREATE INDEX IF NOT EXISTS evidence_claims_entity_field_idx
  ON evidence_claims (program_id, entity, field);
CREATE INDEX IF NOT EXISTS evidence_claims_verification_idx
  ON evidence_claims (verification);
CREATE INDEX IF NOT EXISTS evidence_claims_canonical_fact_idx
  ON evidence_claims (canonical_fact_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7) Drift candidate view — deterministic comparison the Sentinel reads
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_fact_drift_candidates AS
SELECT
  b.id                         AS binding_id,
  b.program_id,
  b.organization_id,
  b.fact_id,
  b.target,
  b.target_kind,
  b.binding_kind,
  b.observed_value,
  f.entity,
  f.field,
  f.value_num                  AS fact_value_num,
  f.value_text                 AS fact_value_text,
  f.unit                       AS fact_unit,
  f.value_type,
  -- canonical string form of the fact value, for a fast text compare; the
  -- engine applies numeric tolerance and derived transforms in code.
  COALESCE(f.value_text, trim(trailing '.' from trim(trailing '0' from f.value_num::text))) AS fact_canonical_value
FROM fact_bindings b
JOIN canonical_facts f ON f.id = b.fact_id
WHERE b.binding_status IN ('bound', 'drifted')
  AND b.binding_kind <> 'manual_override'
  AND f.status = 'active';

COMMENT ON VIEW v_fact_drift_candidates IS
  'Bindings whose target value should be compared against their canonical fact by the Drift Sentinel.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done — Living Record Spine schema ready
-- ═══════════════════════════════════════════════════════════════════════════════
