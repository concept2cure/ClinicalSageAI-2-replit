/**
 * Populate Vector Database with Sample Regulatory Documents
 *
 * This script creates realistic regulatory document chunks with proper embeddings
 * to demonstrate the enhanced vector search capabilities in the CoAuthor module.
 */

import OpenAI from 'openai';
import { Pool } from 'pg';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL });

const SAMPLE_REGULATORY_DOCUMENTS = [
  {
    doc_id: 'doc_001',
    doc_title: 'Clinical Study Report - Phase III Efficacy Study',
    content:
      'This clinical study report presents the results of a randomized, double-blind, placebo-controlled Phase III study evaluating the efficacy and safety of the investigational drug in patients with moderate to severe symptoms. The primary endpoint was achieved with statistical significance (p<0.001).',
    ectd_section: '5.3',
    doc_type: 'CSR',
    region_tag: ['FDA', 'EMA'],
    page_number: 45,
    compliance_score: 0.92,
  },
  {
    doc_id: 'doc_002',
    doc_title: 'ICH E6(R2) Good Clinical Practice Guidelines',
    content:
      'The ICH E6(R2) guideline provides a unified standard for the conduct of clinical trials. Quality management systems should be proportionate to the risks inherent in the clinical trial and the importance of information collected.',
    ectd_section: '2.5',
    doc_type: 'ICH_Guideline',
    region_tag: ['FDA', 'EMA', 'PMDA'],
    page_number: 12,
    compliance_score: 0.98,
  },
  {
    doc_id: 'doc_003',
    doc_title: 'FDA Clinical Pharmacology Review Template',
    content:
      'Clinical pharmacology data should support the proposed dosing regimen and provide adequate exposure-response relationships. Population pharmacokinetic analysis is recommended for drugs with narrow therapeutic windows.',
    ectd_section: '2.5.6',
    doc_type: 'FDA_Guidance',
    region_tag: ['FDA'],
    page_number: 23,
    compliance_score: 0.89,
  },
  {
    doc_id: 'doc_004',
    doc_title: 'EMA Quality Risk Management Guidelines',
    content:
      'Quality risk management is a systematic process for assessment, control, communication and review of risks to quality across the lifecycle of the medicinal product. ICH Q9 principles should be applied.',
    ectd_section: '3.2',
    doc_type: 'EMA_Guideline',
    region_tag: ['EMA'],
    page_number: 8,
    compliance_score: 0.95,
  },
  {
    doc_id: 'doc_005',
    doc_title: 'Study Protocol - Bioequivalence Study Design',
    content:
      'This bioequivalence study protocol follows FDA guidelines for generic drug development. The study design includes appropriate washout periods, randomization, and bioanalytical method validation.',
    ectd_section: '5.3.5',
    doc_type: 'Protocol',
    region_tag: ['FDA'],
    page_number: 34,
    compliance_score: 0.87,
  },
  {
    doc_id: 'doc_006',
    doc_title: 'PMDA Consultation Meeting Minutes',
    content:
      'Pre-submission consultation with PMDA regarding clinical development strategy. Discussion focused on primary endpoint selection and Japanese-specific safety considerations for the target population.',
    ectd_section: '2.7.3',
    doc_type: 'PMDA_Notice',
    region_tag: ['PMDA'],
    page_number: 5,
    compliance_score: 0.91,
  },
];

/**
 * Generate OpenAI embeddings for content
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
      encoding_format: 'float',
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

/**
 * Initialize vector chunks table
 */
async function initializeVectorTable() {
  const client = await pool.connect();

  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create vector chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vector_chunks (
        id SERIAL PRIMARY KEY,
        doc_id VARCHAR(255) NOT NULL,
        doc_title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        ectd_section VARCHAR(50),
        doc_type VARCHAR(100),
        region_tag TEXT[],
        page_number INTEGER,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        compliance_score FLOAT DEFAULT 0.0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vector_chunks_embedding 
      ON vector_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);

    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_doc_id ON vector_chunks(doc_id)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_ectd_section ON vector_chunks(ectd_section)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_doc_type ON vector_chunks(doc_type)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_region_tag ON vector_chunks USING GIN(region_tag)'
    );

    console.log('Vector chunks table initialized successfully');
  } catch (error) {
    console.error('Table initialization error:', error);
  } finally {
    client.release();
  }
}

/**
 * Populate database with sample documents
 */
async function populateVectorDatabase() {
  const client = await pool.connect();

  try {
    // Clear existing data
    await client.query('DELETE FROM vector_chunks');
    console.log('Cleared existing vector chunks');

    // Insert sample documents with embeddings
    for (const doc of SAMPLE_REGULATORY_DOCUMENTS) {
      console.log(`Processing: ${doc.doc_title}`);

      const embedding = await generateEmbedding(doc.content);
      if (!embedding) {
        console.error(`Failed to generate embedding for ${doc.doc_id}`);
        continue;
      }

      await client.query(
        `
        INSERT INTO vector_chunks (
          doc_id, doc_title, content, embedding, ectd_section, 
          doc_type, region_tag, page_number, chunk_index, compliance_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
        [
          doc.doc_id,
          doc.doc_title,
          doc.content,
          JSON.stringify(embedding),
          doc.ectd_section,
          doc.doc_type,
          doc.region_tag,
          doc.page_number,
          0,
          doc.compliance_score,
        ]
      );

      console.log(`✓ Inserted ${doc.doc_id}`);
    }

    console.log('Successfully populated vector database with sample documents');

    // Verify data
    const result = await client.query('SELECT COUNT(*) as count FROM vector_chunks');
    console.log(`Total documents in database: ${result.rows[0].count}`);
  } catch (error) {
    console.error('Population error:', error);
  } finally {
    client.release();
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Initializing vector database...');
    await initializeVectorTable();

    console.log('Populating with sample regulatory documents...');
    await populateVectorDatabase();

    console.log('Vector database population complete!');
  } catch (error) {
    console.error('Main execution error:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { initializeVectorTable, populateVectorDatabase };
