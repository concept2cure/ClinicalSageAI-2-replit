// ═══════════════════════════════════════════════════
// LUMEN CORTEX - NEO4J SCHEMA v2.0.0
// ═══════════════════════════════════════════════════

// --- Constraints ---
CREATE CONSTRAINT document_id_unique IF NOT EXISTS FOR (n:Document) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT document_created_at_exists IF NOT EXISTS FOR (n:Document) REQUIRE n.created_at IS NOT NULL;
CREATE CONSTRAINT document_title_exists IF NOT EXISTS FOR (n:Document) REQUIRE n.title IS NOT NULL;
CREATE CONSTRAINT document_doc_type_exists IF NOT EXISTS FOR (n:Document) REQUIRE n.doc_type IS NOT NULL;
CREATE CONSTRAINT section_id_unique IF NOT EXISTS FOR (n:Section) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT section_created_at_exists IF NOT EXISTS FOR (n:Section) REQUIRE n.created_at IS NOT NULL;
CREATE CONSTRAINT section_title_exists IF NOT EXISTS FOR (n:Section) REQUIRE n.title IS NOT NULL;
CREATE CONSTRAINT regulation_id_unique IF NOT EXISTS FOR (n:Regulation) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT regulation_created_at_exists IF NOT EXISTS FOR (n:Regulation) REQUIRE n.created_at IS NOT NULL;
CREATE CONSTRAINT regulation_title_exists IF NOT EXISTS FOR (n:Regulation) REQUIRE n.title IS NOT NULL;
CREATE CONSTRAINT regulation_code_unique IF NOT EXISTS FOR (n:Regulation) REQUIRE n.code IS UNIQUE;
CREATE CONSTRAINT study_id_unique IF NOT EXISTS FOR (n:Study) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT study_created_at_exists IF NOT EXISTS FOR (n:Study) REQUIRE n.created_at IS NOT NULL;
CREATE CONSTRAINT study_title_exists IF NOT EXISTS FOR (n:Study) REQUIRE n.title IS NOT NULL;
CREATE CONSTRAINT study_study_id_unique IF NOT EXISTS FOR (n:Study) REQUIRE n.study_id IS UNIQUE;
CREATE CONSTRAINT concept_id_unique IF NOT EXISTS FOR (n:Concept) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT concept_created_at_exists IF NOT EXISTS FOR (n:Concept) REQUIRE n.created_at IS NOT NULL;
CREATE CONSTRAINT concept_name_exists IF NOT EXISTS FOR (n:Concept) REQUIRE n.name IS NOT NULL;
CREATE CONSTRAINT community_id_unique IF NOT EXISTS FOR (n:Community) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT community_created_at_exists IF NOT EXISTS FOR (n:Community) REQUIRE n.created_at IS NOT NULL;
CREATE CONSTRAINT community_name_exists IF NOT EXISTS FOR (n:Community) REQUIRE n.name IS NOT NULL;
CREATE CONSTRAINT community_level_exists IF NOT EXISTS FOR (n:Community) REQUIRE n.level IS NOT NULL;

// --- Indexes ---
CREATE INDEX document_title_idx IF NOT EXISTS FOR (n:Document) ON (n.title);
CREATE INDEX document_doc_type_idx IF NOT EXISTS FOR (n:Document) ON (n.doc_type);
CREATE INDEX document_status_idx IF NOT EXISTS FOR (n:Document) ON (n.status);
CREATE INDEX document_hash_idx IF NOT EXISTS FOR (n:Document) ON (n.hash);
CREATE INDEX section_title_idx IF NOT EXISTS FOR (n:Section) ON (n.title);
CREATE INDEX section_section_number_idx IF NOT EXISTS FOR (n:Section) ON (n.section_number);
CREATE INDEX regulation_title_idx IF NOT EXISTS FOR (n:Regulation) ON (n.title);
CREATE INDEX regulation_agency_idx IF NOT EXISTS FOR (n:Regulation) ON (n.agency);
CREATE INDEX regulation_jurisdiction_idx IF NOT EXISTS FOR (n:Regulation) ON (n.jurisdiction);
CREATE INDEX regulation_status_idx IF NOT EXISTS FOR (n:Regulation) ON (n.status);
CREATE INDEX study_title_idx IF NOT EXISTS FOR (n:Study) ON (n.title);
CREATE INDEX study_nct_id_idx IF NOT EXISTS FOR (n:Study) ON (n.nct_id);
CREATE INDEX study_phase_idx IF NOT EXISTS FOR (n:Study) ON (n.phase);
CREATE INDEX study_status_idx IF NOT EXISTS FOR (n:Study) ON (n.status);
CREATE INDEX study_indication_idx IF NOT EXISTS FOR (n:Study) ON (n.indication);
CREATE INDEX study_sponsor_idx IF NOT EXISTS FOR (n:Study) ON (n.sponsor);
CREATE INDEX concept_name_idx IF NOT EXISTS FOR (n:Concept) ON (n.name);
CREATE INDEX concept_concept_type_idx IF NOT EXISTS FOR (n:Concept) ON (n.concept_type);
CREATE INDEX concept_code_idx IF NOT EXISTS FOR (n:Concept) ON (n.code);
CREATE INDEX community_level_idx IF NOT EXISTS FOR (n:Community) ON (n.level);

// --- Vector Indexes ---
CREATE VECTOR INDEX document_embedding_vector IF NOT EXISTS
FOR (n:Document)
ON (n.embedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
};
CREATE VECTOR INDEX section_embedding_vector IF NOT EXISTS
FOR (n:Section)
ON (n.embedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
};
CREATE VECTOR INDEX concept_embedding_vector IF NOT EXISTS
FOR (n:Concept)
ON (n.embedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
};
CREATE VECTOR INDEX regulation_embedding_vector IF NOT EXISTS
FOR (n:Regulation)
ON (n.embedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
};
CREATE VECTOR INDEX study_embedding_vector IF NOT EXISTS
FOR (n:Study)
ON (n.embedding)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
};
CREATE VECTOR INDEX community_centroid_vector IF NOT EXISTS
FOR (n:Community)
ON (n.centroid)
OPTIONS {
    indexConfig: {
        `vector.dimensions`: 1536,
        `vector.similarity_function`: 'cosine'
    }
};

// --- Full-Text Indexes ---
CREATE FULLTEXT INDEX document_content IF NOT EXISTS
FOR (n:Document)
ON EACH [n.title];
CREATE FULLTEXT INDEX section_content IF NOT EXISTS
FOR (n:Section)
ON EACH [n.title, n.content];
CREATE FULLTEXT INDEX concept_search IF NOT EXISTS
FOR (n:Concept)
ON EACH [n.name, n.definition];
CREATE FULLTEXT INDEX regulation_search IF NOT EXISTS
FOR (n:Regulation)
ON EACH [n.title, n.code];
