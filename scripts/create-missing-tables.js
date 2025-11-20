#!/usr/bin/env node

/**
 * Create Missing Tables Script
 *
 * This script creates the tables that are missing from our database
 * but defined in our schema. It uses direct SQL rather than Drizzle.
 */

import pg from 'pg';
const { Pool } = pg;

// Create a database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// SQL to create enums
const createEnumsSQL = `
-- Create phase enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'phase') THEN
        CREATE TYPE phase AS ENUM (
            'Phase 1',
            'Phase 2',
            'Phase 3',
            'Phase 4',
            'Not Applicable'
        );
    END IF;
END$$;

-- Create status enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status') THEN
        CREATE TYPE status AS ENUM (
            'draft',
            'in_progress',
            'completed',
            'archived',
            'published'
        );
    END IF;
END$$;
`;

// SQL to create missing tables
const createTablesSQL = `
-- Create projects table if it doesn't exist
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT,
  status status DEFAULT 'in_progress',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create summary_packets table if it doesn't exist
CREATE TABLE IF NOT EXISTS summary_packets (
  id SERIAL PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id),
  title TEXT NOT NULL,
  summary TEXT,
  content JSONB,
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_latest BOOLEAN DEFAULT TRUE,
  share_id TEXT,
  shared_with TEXT[] DEFAULT '{}',
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create study_sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS study_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  project_id TEXT REFERENCES projects(project_id),
  title TEXT NOT NULL,
  description TEXT,
  status status DEFAULT 'in_progress',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create insight_memories table if it doesn't exist
CREATE TABLE IF NOT EXISTS insight_memories (
  id SERIAL PRIMARY KEY,
  project_id TEXT REFERENCES projects(project_id),
  session_id TEXT REFERENCES study_sessions(session_id),
  insight TEXT NOT NULL,
  source TEXT,
  context TEXT,
  status status DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create wisdom_traces table if it doesn't exist
CREATE TABLE IF NOT EXISTS wisdom_traces (
  id SERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL UNIQUE,
  project_id TEXT REFERENCES projects(project_id),
  session_id TEXT REFERENCES study_sessions(session_id),
  content TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  context JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create protocol_assessments table if it doesn't exist
CREATE TABLE IF NOT EXISTS protocol_assessments (
  id SERIAL PRIMARY KEY,
  protocol_id TEXT,
  assessment_id TEXT NOT NULL UNIQUE,
  similar_csr_ids INTEGER[],
  score INTEGER,
  recommendations JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create protocol_assessment_feedback table if it doesn't exist
CREATE TABLE IF NOT EXISTS protocol_assessment_feedback (
  id SERIAL PRIMARY KEY,
  assessment_id TEXT REFERENCES protocol_assessments(assessment_id),
  user_id INTEGER REFERENCES users(id),
  feedback TEXT NOT NULL,
  rating INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create academic_sources table if it doesn't exist
CREATE TABLE IF NOT EXISTS academic_sources (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT[],
  publication TEXT,
  year INTEGER,
  doi TEXT,
  url TEXT,
  abstract TEXT,
  full_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
`;

async function createMissingTables() {
  const client = await pool.connect();

  try {
    console.log('Connected to database. Creating missing tables...');
    console.log('Creating enums...');
    await client.query(createEnumsSQL);
    console.log('Creating tables...');
    await client.query(createTablesSQL);

    console.log('Tables and enums created successfully!');

    // Get the updated list of tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\nUpdated tables in database:');
    console.log('===========================');

    if (tablesResult.rows.length === 0) {
      console.log('No tables found!');
    } else {
      tablesResult.rows.forEach((row, i) => {
        console.log(`${i + 1}. ${row.table_name}`);
      });
      console.log(`\nTotal tables: ${tablesResult.rows.length}`);
    }

    return true;
  } catch (error) {
    console.error('Error creating tables:', error);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

createMissingTables()
  .then(success => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
