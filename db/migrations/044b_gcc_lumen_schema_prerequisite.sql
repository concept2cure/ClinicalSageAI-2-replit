-- Migration 044b: Create lumen schema prerequisites
-- This migration creates the lumen schema and data_atoms table needed by the knowledge graph

BEGIN;

-- Create lumen schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS lumen;

-- Create uuid extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the base data_atoms table if it doesn't exist
CREATE TABLE IF NOT EXISTS lumen.data_atoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Content
  title TEXT NOT NULL,
  content TEXT,
  atom_type TEXT NOT NULL DEFAULT 'DOCUMENT',
  
  -- Source tracking
  source_path TEXT,
  source_document_id TEXT,
  
  -- Versioning
  version INT NOT NULL DEFAULT 1,
  content_hash TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_data_atoms_type ON lumen.data_atoms(atom_type);
CREATE INDEX IF NOT EXISTS idx_data_atoms_source ON lumen.data_atoms(source_document_id);
CREATE INDEX IF NOT EXISTS idx_data_atoms_hash ON lumen.data_atoms(content_hash);

-- Create core.programs if it doesn't exist (needed for foreign keys)
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
