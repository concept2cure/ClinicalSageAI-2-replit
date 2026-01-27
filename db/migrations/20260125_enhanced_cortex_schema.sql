-- ═══════════════════════════════════════════════════════════════════════════
--                    LUMEN CORTEX ENHANCED SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Complete knowledge graph infrastructure, versioning, analytics, and
-- advanced regulatory intelligence capabilities.
--
-- @author TrialSage AI Team
-- @date 2025-01-25
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
--                    1. KNOWLEDGE GRAPH EDGES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_atom_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,
  target_atom_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,
  relationship_type VARCHAR(100) NOT NULL,
  relationship_strength REAL DEFAULT 0.5 CHECK (relationship_strength >= 0 AND relationship_strength <= 1),
  bidirectional BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),

  -- Prevent duplicate edges
  UNIQUE(source_atom_id, target_atom_id, relationship_type)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON lumen_knowledge_graph_edges(source_atom_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON lumen_knowledge_graph_edges(target_atom_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_relationship ON lumen_knowledge_graph_edges(relationship_type);

-- ═══════════════════════════════════════════════════════════════════════════
--                    2. ATOM VERSION HISTORY (Audit Trail)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_atom_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  title TEXT,
  metadata JSONB,
  change_type VARCHAR(50) NOT NULL, -- 'created', 'updated', 'merged', 'split'
  change_reason TEXT,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure version ordering
  UNIQUE(atom_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_atom_versions_atom ON lumen_atom_versions(atom_id, version_number DESC);

-- ═══════════════════════════════════════════════════════════════════════════
--                    3. QUERY ANALYTICS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_query_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT NOT NULL,
  query_type VARCHAR(50) NOT NULL, -- 'search', 'generate', 'advisory', 'graph'
  user_id VARCHAR(255),
  organization_id INTEGER,
  project_id UUID,

  -- Results metrics
  results_count INTEGER DEFAULT 0,
  top_result_score REAL,
  execution_time_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,

  -- AI details
  ai_provider VARCHAR(50),
  ai_model VARCHAR(100),
  retrieval_strategy VARCHAR(50),

  -- Feedback
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_analytics_time ON lumen_query_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_org ON lumen_query_analytics(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_analytics_type ON lumen_query_analytics(query_type);

-- ═══════════════════════════════════════════════════════════════════════════
--                    4. DOMAIN TAXONOMY
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_domain_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_code VARCHAR(50) REFERENCES lumen_domain_taxonomy(code),
  domain_type VARCHAR(50) NOT NULL, -- 'therapeutic_area', 'regulatory_pathway', 'document_type', 'agency'
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_parent ON lumen_domain_taxonomy(parent_code);
CREATE INDEX IF NOT EXISTS idx_taxonomy_type ON lumen_domain_taxonomy(domain_type);

-- ═══════════════════════════════════════════════════════════════════════════
--                    5. ATOM QUALITY METRICS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_atom_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,

  -- Quality dimensions (0-1 scale)
  completeness_score REAL DEFAULT 0,
  accuracy_score REAL DEFAULT 0,
  recency_score REAL DEFAULT 0,
  relevance_score REAL DEFAULT 0,
  citation_score REAL DEFAULT 0,

  -- Computed overall score
  overall_score REAL GENERATED ALWAYS AS (
    (completeness_score + accuracy_score + recency_score + relevance_score + citation_score) / 5
  ) STORED,

  -- Assessment metadata
  assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assessed_by VARCHAR(50), -- 'system', 'ai', 'human'
  assessment_notes TEXT,

  UNIQUE(atom_id)
);

CREATE INDEX IF NOT EXISTS idx_quality_overall ON lumen_atom_quality_scores(overall_score DESC);

-- ═══════════════════════════════════════════════════════════════════════════
--                    6. CITATION/PROVENANCE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_atom_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,
  citation_type VARCHAR(50) NOT NULL, -- 'source', 'reference', 'derived_from', 'supports', 'contradicts'

  -- Citation details
  source_url TEXT,
  source_title TEXT,
  source_authors TEXT,
  source_publication TEXT,
  source_date DATE,
  source_doi VARCHAR(100),
  source_pmid VARCHAR(20),

  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citations_atom ON lumen_atom_citations(atom_id);
CREATE INDEX IF NOT EXISTS idx_citations_doi ON lumen_atom_citations(source_doi) WHERE source_doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_citations_pmid ON lumen_atom_citations(source_pmid) WHERE source_pmid IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
--                    7. CONFLICT/CONTRADICTION DETECTION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_atom_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_a_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,
  atom_b_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,

  conflict_type VARCHAR(50) NOT NULL, -- 'contradiction', 'outdated', 'inconsistent', 'duplicate'
  conflict_severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
  conflict_description TEXT NOT NULL,

  -- Resolution
  resolution_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'investigating', 'resolved', 'dismissed'
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255),

  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  detected_by VARCHAR(50) -- 'system', 'ai', 'human'
);

CREATE INDEX IF NOT EXISTS idx_conflicts_status ON lumen_atom_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_conflicts_severity ON lumen_atom_conflicts(conflict_severity);

-- ═══════════════════════════════════════════════════════════════════════════
--                    8. REGULATORY TIMELINE EVENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_regulatory_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,

  -- Context
  agency VARCHAR(50), -- 'FDA', 'EMA', 'PMDA', 'Health Canada', etc.
  product_name VARCHAR(255),
  application_number VARCHAR(100),

  -- Details
  title TEXT NOT NULL,
  description TEXT,
  impact_assessment TEXT,

  -- Relationships
  related_atom_ids UUID[] DEFAULT '{}',

  -- Metadata
  source_url TEXT,
  confidence_score REAL DEFAULT 0.8,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_date ON lumen_regulatory_timeline(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_agency ON lumen_regulatory_timeline(agency);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON lumen_regulatory_timeline(event_type);

-- ═══════════════════════════════════════════════════════════════════════════
--                    9. COLLECTION/TOPIC GROUPINGS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lumen_atom_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  collection_type VARCHAR(50) NOT NULL, -- 'topic', 'project', 'submission', 'research', 'curated'

  -- Ownership
  organization_id INTEGER,
  created_by VARCHAR(255),

  -- Auto-generated summary
  summary TEXT,
  summary_generated_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lumen_collection_atoms (
  collection_id UUID NOT NULL REFERENCES lumen_atom_collections(id) ON DELETE CASCADE,
  atom_id UUID NOT NULL REFERENCES lumen_data_atoms(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_by VARCHAR(255),
  notes TEXT,

  PRIMARY KEY (collection_id, atom_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_atoms_atom ON lumen_collection_atoms(atom_id);

-- ═══════════════════════════════════════════════════════════════════════════
--                    10. EMBEDDING AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS embedding_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id UUID REFERENCES lumen_data_atoms(id) ON DELETE SET NULL,
  model VARCHAR(100) NOT NULL,
  token_count INTEGER NOT NULL,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embed_audit_atom ON embedding_audit_log(atom_id);
CREATE INDEX IF NOT EXISTS idx_embed_audit_time ON embedding_audit_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
--                    UTILITY FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to get atom neighbors in knowledge graph
CREATE OR REPLACE FUNCTION get_atom_neighbors(
  p_atom_id UUID,
  p_depth INTEGER DEFAULT 1,
  p_relationship_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  atom_id UUID,
  title TEXT,
  atom_type TEXT,
  relationship_type VARCHAR(100),
  relationship_strength REAL,
  depth INTEGER
) AS $$
WITH RECURSIVE neighbors AS (
  -- Base case: direct neighbors
  SELECT
    CASE WHEN e.source_atom_id = p_atom_id THEN e.target_atom_id ELSE e.source_atom_id END as atom_id,
    e.relationship_type,
    e.relationship_strength,
    1 as depth
  FROM lumen_knowledge_graph_edges e
  WHERE (e.source_atom_id = p_atom_id OR (e.target_atom_id = p_atom_id AND e.bidirectional))
    AND (p_relationship_types IS NULL OR e.relationship_type = ANY(p_relationship_types))

  UNION

  -- Recursive case
  SELECT
    CASE WHEN e.source_atom_id = n.atom_id THEN e.target_atom_id ELSE e.source_atom_id END,
    e.relationship_type,
    e.relationship_strength,
    n.depth + 1
  FROM lumen_knowledge_graph_edges e
  JOIN neighbors n ON (e.source_atom_id = n.atom_id OR (e.target_atom_id = n.atom_id AND e.bidirectional))
  WHERE n.depth < p_depth
    AND (p_relationship_types IS NULL OR e.relationship_type = ANY(p_relationship_types))
)
SELECT DISTINCT ON (n.atom_id)
  n.atom_id,
  a.title,
  a.atom_type,
  n.relationship_type,
  n.relationship_strength,
  n.depth
FROM neighbors n
JOIN lumen_data_atoms a ON n.atom_id = a.id
WHERE n.atom_id != p_atom_id
ORDER BY n.atom_id, n.depth;
$$ LANGUAGE SQL;

-- Function to find path between two atoms
CREATE OR REPLACE FUNCTION find_atom_path(
  p_source_id UUID,
  p_target_id UUID,
  p_max_depth INTEGER DEFAULT 5
)
RETURNS TABLE (
  path_atoms UUID[],
  path_relationships TEXT[],
  path_length INTEGER
) AS $$
WITH RECURSIVE paths AS (
  -- Base case - explicitly cast relationship_type to TEXT[]
  SELECT
    ARRAY[p_source_id, CASE WHEN e.source_atom_id = p_source_id THEN e.target_atom_id ELSE e.source_atom_id END] as atoms,
    ARRAY[e.relationship_type::TEXT] as relationships,
    1 as depth
  FROM lumen_knowledge_graph_edges e
  WHERE e.source_atom_id = p_source_id OR (e.target_atom_id = p_source_id AND e.bidirectional)

  UNION ALL

  -- Recursive case
  SELECT
    p.atoms || CASE WHEN e.source_atom_id = p.atoms[array_length(p.atoms, 1)] THEN e.target_atom_id ELSE e.source_atom_id END,
    p.relationships || e.relationship_type::TEXT,
    p.depth + 1
  FROM paths p
  JOIN lumen_knowledge_graph_edges e ON (
    e.source_atom_id = p.atoms[array_length(p.atoms, 1)]
    OR (e.target_atom_id = p.atoms[array_length(p.atoms, 1)] AND e.bidirectional)
  )
  WHERE p.depth < p_max_depth
    AND NOT (CASE WHEN e.source_atom_id = p.atoms[array_length(p.atoms, 1)] THEN e.target_atom_id ELSE e.source_atom_id END = ANY(p.atoms))
)
SELECT atoms, relationships, depth
FROM paths
WHERE atoms[array_length(atoms, 1)] = p_target_id
ORDER BY depth
LIMIT 5;
$$ LANGUAGE SQL;

-- Function to get atom with quality enrichment
CREATE OR REPLACE FUNCTION get_enriched_atom(p_atom_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  atom_type TEXT,
  source_type TEXT,
  confidence REAL,
  quality_score REAL,
  citation_count BIGINT,
  neighbor_count BIGINT,
  created_at TIMESTAMP
) AS $$
SELECT
  a.id,
  a.title,
  a.content,
  a.atom_type,
  a.source_type,
  a.confidence,
  COALESCE(q.overall_score, 0) as quality_score,
  (SELECT COUNT(*) FROM lumen_atom_citations c WHERE c.atom_id = a.id) as citation_count,
  (SELECT COUNT(*) FROM lumen_knowledge_graph_edges e WHERE e.source_atom_id = a.id OR e.target_atom_id = a.id) as neighbor_count,
  a.created_at
FROM lumen_data_atoms a
LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
WHERE a.id = p_atom_id;
$$ LANGUAGE SQL;

-- ═══════════════════════════════════════════════════════════════════════════
--                    SEED DOMAIN TAXONOMY
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO lumen_domain_taxonomy (code, name, description, domain_type, sort_order) VALUES
-- Therapeutic Areas
('TA-ONCOLOGY', 'Oncology', 'Cancer and tumor treatments', 'therapeutic_area', 1),
('TA-CNS', 'Central Nervous System', 'Neurological and psychiatric disorders', 'therapeutic_area', 2),
('TA-CARDIO', 'Cardiovascular', 'Heart and vascular diseases', 'therapeutic_area', 3),
('TA-IMMUNO', 'Immunology', 'Immune system disorders and autoimmune diseases', 'therapeutic_area', 4),
('TA-INFECT', 'Infectious Disease', 'Viral, bacterial, and fungal infections', 'therapeutic_area', 5),
('TA-METABOLIC', 'Metabolic', 'Diabetes, obesity, and metabolic disorders', 'therapeutic_area', 6),
('TA-RARE', 'Rare Diseases', 'Orphan diseases and rare conditions', 'therapeutic_area', 7),
('TA-GENE', 'Gene/Cell Therapy', 'Advanced therapy medicinal products', 'therapeutic_area', 8),

-- Regulatory Pathways
('PATH-NDA', 'New Drug Application (NDA)', 'Standard approval pathway for new drugs', 'regulatory_pathway', 1),
('PATH-BLA', 'Biologics License Application (BLA)', 'Approval pathway for biological products', 'regulatory_pathway', 2),
('PATH-ANDA', 'Abbreviated NDA (Generic)', 'Generic drug approval pathway', 'regulatory_pathway', 3),
('PATH-510K', '510(k) Premarket Notification', 'Medical device substantial equivalence', 'regulatory_pathway', 4),
('PATH-PMA', 'Premarket Approval (PMA)', 'High-risk medical device approval', 'regulatory_pathway', 5),
('PATH-DENOVO', 'De Novo Classification', 'Novel low-moderate risk devices', 'regulatory_pathway', 6),
('PATH-IND', 'Investigational New Drug (IND)', 'Clinical trial authorization', 'regulatory_pathway', 7),
('PATH-BTD', 'Breakthrough Therapy', 'Expedited development for serious conditions', 'regulatory_pathway', 8),
('PATH-FAST', 'Fast Track', 'Expedited review for serious conditions', 'regulatory_pathway', 9),
('PATH-ACCEL', 'Accelerated Approval', 'Approval based on surrogate endpoints', 'regulatory_pathway', 10),
('PATH-PRIORITY', 'Priority Review', '6-month review for significant advances', 'regulatory_pathway', 11),

-- Agencies
('AGENCY-FDA', 'FDA', 'US Food and Drug Administration', 'agency', 1),
('AGENCY-EMA', 'EMA', 'European Medicines Agency', 'agency', 2),
('AGENCY-PMDA', 'PMDA', 'Japan Pharmaceuticals and Medical Devices Agency', 'agency', 3),
('AGENCY-HC', 'Health Canada', 'Health Canada regulatory authority', 'agency', 4),
('AGENCY-TGA', 'TGA', 'Australian Therapeutic Goods Administration', 'agency', 5),
('AGENCY-MHRA', 'MHRA', 'UK Medicines and Healthcare products Regulatory Agency', 'agency', 6),

-- Document Types
('DOC-CSR', 'Clinical Study Report', 'Comprehensive clinical trial report', 'document_type', 1),
('DOC-IB', 'Investigator Brochure', 'Clinical investigator reference document', 'document_type', 2),
('DOC-PROTOCOL', 'Clinical Protocol', 'Clinical trial design document', 'document_type', 3),
('DOC-SAP', 'Statistical Analysis Plan', 'Pre-specified analysis methodology', 'document_type', 4),
('DOC-CMC', 'Chemistry Manufacturing Controls', 'Quality and manufacturing documentation', 'document_type', 5),
('DOC-PRECLIN', 'Preclinical Package', 'Nonclinical study reports', 'document_type', 6),
('DOC-LABEL', 'Product Labeling', 'Prescribing information and package insert', 'document_type', 7),
('DOC-DSUR', 'Development Safety Update Report', 'Annual safety report for ongoing trials', 'document_type', 8)

ON CONFLICT (code) DO NOTHING;

SELECT 'Enhanced Cortex schema created successfully' as result;
