-- Migration: 510(k) Literature Discovery Feature Tables
-- Date: 2025-05-12

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Literature entries table with vector support
CREATE TABLE IF NOT EXISTS literature_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  authors TEXT[] NULL,
  abstract TEXT NULL,
  publication_date DATE NULL,
  journal TEXT NULL,
  doi TEXT NULL,
  url TEXT NULL,
  source_name TEXT NOT NULL,
  source_id TEXT NULL,
  relevance_score FLOAT NULL,
  organization_id TEXT NOT NULL,
  embedding VECTOR(1536) NULL, -- OpenAI embedding dimension
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Document citations table
CREATE TABLE IF NOT EXISTS document_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  literature_id UUID NOT NULL REFERENCES literature_entries(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  section_id TEXT NULL,
  section_name TEXT NULL,
  citation_text TEXT NULL,
  organization_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Literature summaries table
CREATE TABLE IF NOT EXISTS literature_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary TEXT NOT NULL,
  summary_type TEXT NOT NULL,
  focus TEXT NULL,
  literature_ids UUID[] NOT NULL,
  organization_id TEXT NOT NULL,
  processing_time_ms INTEGER NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Literature summary document linkage table
CREATE TABLE IF NOT EXISTS document_summary_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES literature_summaries(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  section_id TEXT NULL,
  section_name TEXT NULL,
  organization_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for organization_id on all tables for multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_literature_entries_org_id ON literature_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_citations_org_id ON document_citations(organization_id);
CREATE INDEX IF NOT EXISTS idx_literature_summaries_org_id ON literature_summaries(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_summary_links_org_id ON document_summary_links(organization_id);

-- Create index for document_id to speed up citation lookups
CREATE INDEX IF NOT EXISTS idx_document_citations_doc_id ON document_citations(document_id);
CREATE INDEX IF NOT EXISTS idx_document_summary_links_doc_id ON document_summary_links(document_id);

-- Create index for literature_id to speed up retrieving citations related to a literature entry
CREATE INDEX IF NOT EXISTS idx_document_citations_lit_id ON document_citations(literature_id);

-- Create combined index for document ID and type
CREATE INDEX IF NOT EXISTS idx_document_citations_doc_id_type ON document_citations(document_id, document_type);
CREATE INDEX IF NOT EXISTS idx_document_summary_links_doc_id_type ON document_summary_links(document_id, document_type);

-- Create index on vector embeddings for semantic search
CREATE INDEX IF NOT EXISTS idx_literature_entries_embedding ON literature_entries USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);

-- Add functions for updating timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Add triggers for timestamp updates
DROP TRIGGER IF EXISTS update_literature_entries_timestamp ON literature_entries;
CREATE TRIGGER update_literature_entries_timestamp
BEFORE UPDATE ON literature_entries
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_document_citations_timestamp ON document_citations;
CREATE TRIGGER update_document_citations_timestamp
BEFORE UPDATE ON document_citations
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_literature_summaries_timestamp ON literature_summaries;
CREATE TRIGGER update_literature_summaries_timestamp
BEFORE UPDATE ON literature_summaries
FOR EACH ROW EXECUTE FUNCTION update_modified_column();