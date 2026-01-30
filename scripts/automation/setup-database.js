#!/usr/bin/env node

/*
 * Database Setup Script for TrialSage
 * This script creates the necessary tables for the CSR database using SQL directly
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';

// Configure WebSocket for Neon Serverless
neonConfig.webSocketConstructor = ws;

// Configuration validation
if (!process.env.DATABASE_URL) {
  logger.error('Error: DATABASE_URL environment variable not set');
  process.exit(1);
}

// Connect to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
  const client = await pool.connect();

  try {
    logger.info('Setting up TrialSage database...');

    // Begin transaction
    await client.query('BEGIN');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_login TIMESTAMP
      );
    `);

    // Create csr_reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS csr_reports (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        sponsor VARCHAR(255) NOT NULL,
        indication VARCHAR(255) NOT NULL,
        phase VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Processing',
        date DATE,
        upload_date TIMESTAMP NOT NULL DEFAULT NOW(),
        summary TEXT,
        file_name VARCHAR(255) NOT NULL,
        file_size INTEGER NOT NULL,
        file_path TEXT,
        nctrial_id VARCHAR(50),
        study_id VARCHAR(100),
        drug_name VARCHAR(255),
        region VARCHAR(100),
        last_updated TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      );
    `);

    // Create indexes for csr_reports
    await client.query(`
      CREATE INDEX IF NOT EXISTS sponsor_idx ON csr_reports(sponsor);
      CREATE INDEX IF NOT EXISTS indication_idx ON csr_reports(indication);
      CREATE INDEX IF NOT EXISTS phase_idx ON csr_reports(phase);
      CREATE INDEX IF NOT EXISTS upload_date_idx ON csr_reports(upload_date);
      CREATE INDEX IF NOT EXISTS nctrial_id_idx ON csr_reports(nctrial_id);
      CREATE INDEX IF NOT EXISTS drug_name_idx ON csr_reports(drug_name);
    `);

    // Create csr_details table
    await client.query(`
      CREATE TABLE IF NOT EXISTS csr_details (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL REFERENCES csr_reports(id) ON DELETE CASCADE,
        study_design TEXT,
        primary_objective TEXT,
        study_description TEXT,
        inclusion_criteria TEXT,
        exclusion_criteria TEXT,
        treatment_arms JSONB,
        study_duration TEXT,
        endpoints JSONB,
        results JSONB,
        safety JSONB,
        processing_status VARCHAR(50) DEFAULT 'pending',
        processed BOOLEAN DEFAULT FALSE,
        extraction_date TIMESTAMP DEFAULT NOW(),
        sample_size INTEGER,
        age_range VARCHAR(100),
        gender_distribution JSONB,
        statistical_methods JSONB,
        adverse_events JSONB,
        efficacy_results JSONB,
        sae_count INTEGER,
        teae_count INTEGER,
        completion_rate NUMERIC(5,2),
        last_updated TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for csr_details
    await client.query(`
      CREATE INDEX IF NOT EXISTS report_id_idx ON csr_details(report_id);
      CREATE INDEX IF NOT EXISTS processing_status_idx ON csr_details(processing_status);
    `);

    // Create csr_segments table for document chunking
    await client.query(`
      CREATE TABLE IF NOT EXISTS csr_segments (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL REFERENCES csr_reports(id) ON DELETE CASCADE,
        segment_number INTEGER NOT NULL,
        segment_type VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        page_numbers VARCHAR(100),
        extracted_entities JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create indexes for csr_segments
    await client.query(`
      CREATE INDEX IF NOT EXISTS segment_report_id_idx ON csr_segments(report_id);
      CREATE INDEX IF NOT EXISTS segment_type_idx ON csr_segments(segment_type);
    `);

    // Create medical_terms table for standardization
    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_terms (
        id SERIAL PRIMARY KEY,
        term VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        standardized_term VARCHAR(255),
        taxonomy_code VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(term, category)
      );
    `);

    // Create indexes for medical_terms
    await client.query(`
      CREATE INDEX IF NOT EXISTS term_category_idx ON medical_terms(category);
    `);

    // Commit transaction
    await client.query('COMMIT');

    logger.info('Database setup completed successfully');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
