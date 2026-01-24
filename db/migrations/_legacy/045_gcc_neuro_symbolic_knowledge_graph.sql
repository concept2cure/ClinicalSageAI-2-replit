-- Migration 045: Neuro-Symbolic Knowledge Graph
-- Purpose: Transform from "Chat with PDF" RAG to deterministic graph-based reasoning
--
-- This migration implements:
--   1. atom_relationships - Graph edges between data atoms (SUPPORTS, CONTRADICTS, DERIVED_FROM, VERSION_OF)
--   2. entity_extractions - Structured entities extracted from documents (Dose, Endpoint, n-count)
--   3. Graph traversal functions for deep regulatory search
--   4. Materialized views for fast graph queries
--
-- Philosophy: LLMs are probabilistic. FDA regulations are deterministic.
-- The Knowledge Graph provides the "Logic Layer" that grounds AI outputs in facts.

BEGIN;

-- =============================================================================
-- A) Entity Extraction Storage
-- =============================================================================

-- Entity types for regulatory domain
CREATE TYPE lumen.entity_type AS ENUM (
  -- Clinical entities
  'DRUG_SUBSTANCE',
  'DRUG_PRODUCT', 
  'DOSE',
  'ROUTE_OF_ADMINISTRATION',
  'INDICATION',
  'POPULATION',
  'SAMPLE_SIZE',
  'STUDY_PHASE',
  'STUDY_DESIGN',
  'RANDOMIZATION',
  'BLINDING',
  
  -- Endpoints
  'PRIMARY_ENDPOINT',
  'SECONDARY_ENDPOINT',
  'SAFETY_ENDPOINT',
  'PK_PARAMETER',
  'PD_MARKER',
  'BIOMARKER',
  
  -- Statistical
  'P_VALUE',
  'CONFIDENCE_INTERVAL',
  'EFFECT_SIZE',
  'HAZARD_RATIO',
  'ODDS_RATIO',
  'RELATIVE_RISK',
  
  -- Safety
  'ADVERSE_EVENT',
  'SERIOUS_ADVERSE_EVENT',
  'DOSE_LIMITING_TOXICITY',
  'MAXIMUM_TOLERATED_DOSE',
  
  -- Regulatory
  'NCT_ID',
  'IND_NUMBER',
  'NDA_NUMBER',
  'BLA_NUMBER',
  'REGULATORY_PATHWAY',
  'ORPHAN_DESIGNATION',
  'BREAKTHROUGH_THERAPY',
  'FAST_TRACK',
  'ACCELERATED_APPROVAL',
  
  -- Document
  'PROTOCOL_VERSION',
  'AMENDMENT',
  'SECTION_REFERENCE',
  'TABLE_REFERENCE',
  'FIGURE_REFERENCE',
  
  -- Organization
  'SPONSOR',
  'CRO',
  'INVESTIGATOR',
  'SITE',
  'IRB_IEC',
  
  -- Other
  'DATE',
  'DURATION',
  'MEASUREMENT',
  'OTHER'
);

-- Extracted entities from documents
CREATE TABLE IF NOT EXISTS lumen.entity_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source
  atom_id UUID NOT NULL REFERENCES lumen.data_atoms(id) ON DELETE CASCADE,
  
  -- Entity details
  entity_type lumen.entity_type NOT NULL,
  entity_value TEXT NOT NULL,
  normalized_value TEXT,                    -- Standardized form (e.g., UNII, MedDRA code)
  confidence_score FLOAT NOT NULL DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Location in source
  source_span JSONB,                        -- {start: int, end: int, text: string}
  page_number INT,
  section_path TEXT,                        -- e.g., "5.1.2" or "m2.5/clinical-overview"
  
  -- Structured value (for numeric entities)
  numeric_value FLOAT,
  unit TEXT,
  comparator TEXT,                          -- '<', '>', '<=', '>=', '='
  
  -- Metadata
  extraction_method TEXT NOT NULL DEFAULT 'LLM', -- 'LLM', 'NER', 'REGEX', 'MANUAL'
  model_version TEXT,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_entity_extractions_atom ON lumen.entity_extractions(atom_id);
CREATE INDEX idx_entity_extractions_type ON lumen.entity_extractions(entity_type);
CREATE INDEX idx_entity_extractions_value ON lumen.entity_extractions(entity_value);
CREATE INDEX idx_entity_extractions_normalized ON lumen.entity_extractions(normalized_value) WHERE normalized_value IS NOT NULL;

-- =============================================================================
-- B) Knowledge Graph Edges (atom_relationships)
-- =============================================================================

-- Relationship types for the knowledge graph
CREATE TYPE lumen.relationship_type AS ENUM (
  -- Evidential relationships
  'SUPPORTS',                -- This atom provides evidence for target
  'CONTRADICTS',             -- This atom contradicts target
  'QUALIFIES',               -- This atom qualifies/conditions target
  'EXTENDS',                 -- This atom extends/elaborates target
  
  -- Version/derivation relationships
  'DERIVED_FROM',            -- This atom was derived from target
  'VERSION_OF',              -- This is a newer version of target
  'SUPERSEDES',              -- This atom supersedes/replaces target
  'AMENDMENT_OF',            -- This is an amendment to target
  
  -- Reference relationships
  'CITES',                   -- This atom cites target
  'REFERENCES',              -- This atom references target
  'INCLUDES',                -- This atom includes target (composition)
  'PART_OF',                 -- This atom is part of target
  
  -- Semantic relationships
  'SAME_AS',                 -- Equivalent atoms (deduplication)
  'RELATED_TO',              -- General relationship
  'BASED_ON',                -- Methodologically based on
  
  -- Regulatory relationships
  'FULFILLS_REQUIREMENT',    -- This atom fulfills regulatory requirement
  'EVIDENCE_FOR',            -- This is evidence for a claim
  'CLAIM_ABOUT',             -- This makes a claim about target
  
  -- Causal relationships
  'CAUSES',                  -- Causal relationship
  'CORRELATES_WITH',         -- Correlation (not causation)
  'PREDICTS',                -- Predictive relationship
  
  -- Study relationships
  'STUDY_ARM_OF',            -- Arm of a study
  'COMPARATOR_FOR',          -- Comparator in study
  'MEASURED_IN'              -- Endpoint measured in study
);

-- The core graph edges table
CREATE TABLE IF NOT EXISTS lumen.atom_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Edge endpoints
  source_atom_id UUID NOT NULL REFERENCES lumen.data_atoms(id) ON DELETE CASCADE,
  target_atom_id UUID NOT NULL REFERENCES lumen.data_atoms(id) ON DELETE CASCADE,
  
  -- Relationship metadata
  relationship_type lumen.relationship_type NOT NULL,
  strength FLOAT DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
  bidirectional BOOLEAN DEFAULT FALSE,
  
  -- Evidence for the relationship
  evidence_text TEXT,
  evidence_span JSONB,
  confidence_score FLOAT DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Provenance
  extraction_method TEXT NOT NULL DEFAULT 'LLM', -- 'LLM', 'MANUAL', 'RULE_BASED', 'INFERRED'
  model_version TEXT,
  rule_id TEXT,                              -- If rule-based, which rule created this
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  
  -- Soft delete (for audit trail)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  
  -- Constraint name for conditional uniqueness
  CONSTRAINT uq_active_relationship UNIQUE (source_atom_id, target_atom_id, relationship_type)
);

CREATE INDEX idx_atom_relationships_source ON lumen.atom_relationships(source_atom_id) WHERE is_active = TRUE;
CREATE INDEX idx_atom_relationships_target ON lumen.atom_relationships(target_atom_id) WHERE is_active = TRUE;
CREATE INDEX idx_atom_relationships_type ON lumen.atom_relationships(relationship_type) WHERE is_active = TRUE;
CREATE INDEX idx_atom_relationships_source_type ON lumen.atom_relationships(source_atom_id, relationship_type) WHERE is_active = TRUE;

-- =============================================================================
-- C) Traceability Matrix (Self-Healing)
-- =============================================================================

-- Requirement types for regulatory submissions
CREATE TYPE lumen.requirement_type AS ENUM (
  'ICH_CTD',                 -- ICH CTD module requirement
  'FDA_GUIDANCE',            -- FDA guidance requirement
  'EMA_GUIDANCE',            -- EMA guidance requirement
  'PMDA_GUIDANCE',           -- PMDA guidance requirement
  'PROTOCOL_OBJECTIVE',      -- Study protocol objective
  'SAP_ANALYSIS',            -- Statistical Analysis Plan analysis
  'CLINICAL_CLAIM',          -- Clinical claim requiring evidence
  'SAFETY_REQUIREMENT',      -- Safety reporting requirement
  'QUALITY_SPECIFICATION',   -- CMC quality specification
  'REGULATORY_COMMITMENT',   -- Regulatory commitment
  'CUSTOM'                   -- Custom requirement
);

-- Traceability status
CREATE TYPE lumen.traceability_status AS ENUM (
  'VERIFIED',                -- Evidence verified and current
  'SUSPECT',                 -- Source changed, needs review
  'STALE',                   -- Evidence outdated
  'MISSING',                 -- Required evidence not found
  'PENDING_REVIEW',          -- Awaiting human review
  'REJECTED',                -- Evidence rejected
  'NOT_APPLICABLE'           -- Requirement not applicable
);

-- The traceability matrix
CREATE TABLE IF NOT EXISTS lumen.traceability_matrix (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Program context
  program_id UUID REFERENCES core.programs(id),
  submission_id UUID,                        -- Link to submission snapshot if applicable
  
  -- The requirement
  requirement_id TEXT NOT NULL,              -- External ID (e.g., "CTD-2.7.3", "FDA-2023-001")
  requirement_type lumen.requirement_type NOT NULL,
  requirement_text TEXT NOT NULL,
  requirement_source TEXT,                   -- Where this requirement comes from
  
  -- The evidence (links to atoms)
  evidence_atom_ids UUID[] NOT NULL DEFAULT '{}',
  primary_evidence_atom_id UUID,
  
  -- The claim/draft that fulfills this requirement
  claim_atom_ids UUID[] NOT NULL DEFAULT '{}',
  primary_claim_atom_id UUID,
  
  -- Status tracking
  status lumen.traceability_status NOT NULL DEFAULT 'PENDING_REVIEW',
  status_reason TEXT,
  last_verified_at TIMESTAMPTZ,
  last_verified_by TEXT,
  
  -- Staleness tracking
  evidence_version_hash TEXT,                -- Hash of evidence atoms' versions
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  stale_since TIMESTAMPTZ,
  staleness_reason TEXT,
  
  -- Metadata
  priority INT DEFAULT 0,                    -- For sorting/filtering
  tags TEXT[],
  notes TEXT,
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_traceability_program ON lumen.traceability_matrix(program_id);
CREATE INDEX idx_traceability_requirement ON lumen.traceability_matrix(requirement_id);
CREATE INDEX idx_traceability_status ON lumen.traceability_matrix(status);
CREATE INDEX idx_traceability_stale ON lumen.traceability_matrix(is_stale) WHERE is_stale = TRUE;

-- =============================================================================
-- D) Graph Traversal Functions
-- =============================================================================

-- Find all atoms connected to a source atom within N hops
CREATE OR REPLACE FUNCTION lumen.traverse_graph(
  p_start_atom_id UUID,
  p_max_depth INT DEFAULT 3,
  p_relationship_types lumen.relationship_type[] DEFAULT NULL,
  p_direction TEXT DEFAULT 'OUTGOING'  -- 'OUTGOING', 'INCOMING', 'BOTH'
)
RETURNS TABLE (
  atom_id UUID,
  depth INT,
  path UUID[],
  relationship_types lumen.relationship_type[]
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph_walk AS (
    -- Base case: start node
    SELECT 
      p_start_atom_id AS current_id,
      0 AS current_depth,
      ARRAY[p_start_atom_id] AS current_path,
      ARRAY[]::lumen.relationship_type[] AS rel_types
    
    UNION ALL
    
    -- Recursive case: follow edges
    SELECT 
      CASE 
        WHEN p_direction = 'OUTGOING' THEN r.target_atom_id
        WHEN p_direction = 'INCOMING' THEN r.source_atom_id
        ELSE CASE WHEN r.source_atom_id = gw.current_id THEN r.target_atom_id ELSE r.source_atom_id END
      END,
      gw.current_depth + 1,
      gw.current_path || CASE 
        WHEN p_direction = 'OUTGOING' THEN r.target_atom_id
        WHEN p_direction = 'INCOMING' THEN r.source_atom_id
        ELSE CASE WHEN r.source_atom_id = gw.current_id THEN r.target_atom_id ELSE r.source_atom_id END
      END,
      gw.rel_types || r.relationship_type
    FROM graph_walk gw
    JOIN lumen.atom_relationships r ON (
      (p_direction = 'OUTGOING' AND r.source_atom_id = gw.current_id) OR
      (p_direction = 'INCOMING' AND r.target_atom_id = gw.current_id) OR
      (p_direction = 'BOTH' AND (r.source_atom_id = gw.current_id OR r.target_atom_id = gw.current_id))
    )
    WHERE r.is_active = TRUE
      AND gw.current_depth < p_max_depth
      AND NOT (
        CASE 
          WHEN p_direction = 'OUTGOING' THEN r.target_atom_id
          WHEN p_direction = 'INCOMING' THEN r.source_atom_id
          ELSE CASE WHEN r.source_atom_id = gw.current_id THEN r.target_atom_id ELSE r.source_atom_id END
        END = ANY(gw.current_path)
      )  -- Prevent cycles
      AND (p_relationship_types IS NULL OR r.relationship_type = ANY(p_relationship_types))
  )
  SELECT DISTINCT ON (current_id)
    current_id,
    current_depth,
    current_path,
    rel_types
  FROM graph_walk
  WHERE current_id != p_start_atom_id
  ORDER BY current_id, current_depth;
END;
$$;

-- Find shortest path between two atoms
CREATE OR REPLACE FUNCTION lumen.find_path(
  p_source_atom_id UUID,
  p_target_atom_id UUID,
  p_max_depth INT DEFAULT 5
)
RETURNS TABLE (
  path UUID[],
  relationship_types lumen.relationship_type[],
  path_length INT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE path_search AS (
    SELECT 
      p_source_atom_id AS current_id,
      ARRAY[p_source_atom_id] AS current_path,
      ARRAY[]::lumen.relationship_type[] AS rel_types,
      0 AS depth
    
    UNION ALL
    
    SELECT 
      CASE WHEN r.source_atom_id = ps.current_id THEN r.target_atom_id ELSE r.source_atom_id END,
      ps.current_path || CASE WHEN r.source_atom_id = ps.current_id THEN r.target_atom_id ELSE r.source_atom_id END,
      ps.rel_types || r.relationship_type,
      ps.depth + 1
    FROM path_search ps
    JOIN lumen.atom_relationships r ON (r.source_atom_id = ps.current_id OR r.target_atom_id = ps.current_id)
    WHERE r.is_active = TRUE
      AND ps.depth < p_max_depth
      AND NOT (CASE WHEN r.source_atom_id = ps.current_id THEN r.target_atom_id ELSE r.source_atom_id END = ANY(ps.current_path))
  )
  SELECT 
    current_path,
    rel_types,
    depth
  FROM path_search
  WHERE current_id = p_target_atom_id
  ORDER BY depth
  LIMIT 1;
END;
$$;

-- Find all evidence supporting a claim
CREATE OR REPLACE FUNCTION lumen.find_supporting_evidence(
  p_claim_atom_id UUID
)
RETURNS TABLE (
  evidence_atom_id UUID,
  relationship_type lumen.relationship_type,
  confidence FLOAT,
  evidence_text TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    r.source_atom_id,
    r.relationship_type,
    r.confidence_score,
    r.evidence_text
  FROM lumen.atom_relationships r
  WHERE r.target_atom_id = p_claim_atom_id
    AND r.relationship_type IN ('SUPPORTS', 'EVIDENCE_FOR', 'CITES')
    AND r.is_active = TRUE
  ORDER BY r.confidence_score DESC;
$$;

-- =============================================================================
-- E) Staleness Detection Trigger
-- =============================================================================

-- Function to mark dependent atoms as stale when source changes
CREATE OR REPLACE FUNCTION lumen.propagate_staleness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_rows INT;
BEGIN
  -- When an atom is updated, mark all DERIVED_FROM and VERSION_OF relationships as needing review
  UPDATE lumen.traceability_matrix tm
  SET 
    is_stale = TRUE,
    stale_since = NOW(),
    staleness_reason = 'Source document updated: ' || NEW.id::TEXT,
    status = 'SUSPECT'
  WHERE NEW.id = ANY(tm.evidence_atom_ids)
    AND tm.is_stale = FALSE;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  IF affected_rows > 0 THEN
    RAISE NOTICE 'Marked % traceability entries as SUSPECT due to source update', affected_rows;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger on atom updates
DROP TRIGGER IF EXISTS trg_propagate_staleness ON lumen.data_atoms;
CREATE TRIGGER trg_propagate_staleness
  AFTER UPDATE ON lumen.data_atoms
  FOR EACH ROW
  WHEN (OLD.content_hash IS DISTINCT FROM NEW.content_hash)
  EXECUTE FUNCTION lumen.propagate_staleness();

-- =============================================================================
-- F) Entity Linking View
-- =============================================================================

-- View connecting entities to their source documents
CREATE OR REPLACE VIEW lumen.v_entity_document_links AS
SELECT 
  ee.id AS entity_id,
  ee.entity_type,
  ee.entity_value,
  ee.normalized_value,
  ee.confidence_score AS entity_confidence,
  ee.numeric_value,
  ee.unit,
  da.id AS atom_id,
  da.title AS document_title,
  da.atom_type AS document_type,
  da.source_path,
  da.created_at AS document_created_at
FROM lumen.entity_extractions ee
JOIN lumen.data_atoms da ON da.id = ee.atom_id
ORDER BY ee.entity_type, ee.entity_value;

-- =============================================================================
-- G) Graph Statistics View
-- =============================================================================

CREATE OR REPLACE VIEW lumen.v_graph_statistics AS
SELECT 
  (SELECT COUNT(*) FROM lumen.data_atoms) AS total_atoms,
  (SELECT COUNT(*) FROM lumen.atom_relationships WHERE is_active = TRUE) AS total_edges,
  (SELECT COUNT(*) FROM lumen.entity_extractions) AS total_entities,
  (SELECT COUNT(DISTINCT source_atom_id) FROM lumen.atom_relationships WHERE is_active = TRUE) AS atoms_with_outgoing,
  (SELECT COUNT(DISTINCT target_atom_id) FROM lumen.atom_relationships WHERE is_active = TRUE) AS atoms_with_incoming,
  (SELECT COUNT(*) FROM lumen.traceability_matrix WHERE is_stale = TRUE) AS stale_traceability_entries,
  (SELECT COUNT(*) FROM lumen.traceability_matrix WHERE status = 'SUSPECT') AS suspect_entries;

COMMIT;
