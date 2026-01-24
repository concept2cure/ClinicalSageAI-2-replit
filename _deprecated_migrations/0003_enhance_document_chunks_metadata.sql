-- Migration: Enhance DocumentChunk model with regulatory metadata fields
-- Phase 1, Step 1: Add new fields for eCTD section mapping and regulatory traceability

-- Add new columns to document_chunks table
ALTER TABLE document_chunks 
ADD COLUMN ectd_section VARCHAR(255),
ADD COLUMN page_number INTEGER,
ADD COLUMN doc_type VARCHAR(255),
ADD COLUMN region_tag TEXT[];

-- Add indexes for performance on new searchable fields
CREATE INDEX idx_document_chunks_ectd_section ON document_chunks(ectd_section);
CREATE INDEX idx_document_chunks_doc_type ON document_chunks(doc_type);
CREATE INDEX idx_document_chunks_doc_id ON document_chunks(doc_id);

-- Add unique constraint to prevent duplicate chunks for the same document
ALTER TABLE document_chunks 
ADD CONSTRAINT _doc_chunk_uc UNIQUE (doc_id, chunk_index);

-- Update existing nullable constraints to match model
ALTER TABLE document_chunks 
ALTER COLUMN doc_title SET NOT NULL,
ALTER COLUMN chunk_index SET NOT NULL,
ALTER COLUMN embedding SET NOT NULL;