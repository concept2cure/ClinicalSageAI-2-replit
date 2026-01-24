/**
 * CSR Database Service - Real backend functionality for CSR Intelligence Module
 *
 * This service provides database integration for CSR data management,
 * connecting to the PostgreSQL database and providing real functionality
 * for CSR intelligence operations.
 */

import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class CSRDatabaseService {
  constructor() {
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // Ensure CSR tables exist
      await this.createTables();
      this.initialized = true;
      console.log('✅ CSR Database Service initialized successfully');
    } catch (error) {
      console.error('❌ CSR Database Service initialization failed:', error);
    }
  }

  async createTables() {
    const client = await pool.connect();
    try {
      // Create CSR reports table
      await client.query(`
        CREATE TABLE IF NOT EXISTS csr_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(500) NOT NULL,
          study_id VARCHAR(100),
          phase VARCHAR(50),
          indication VARCHAR(200),
          sponsor VARCHAR(200),
          therapeutic_area VARCHAR(100),
          sample_size INTEGER,
          duration_months INTEGER,
          primary_endpoint TEXT,
          completion_year INTEGER,
          document_path VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create CSR details table for extracted insights
      await client.query(`
        CREATE TABLE IF NOT EXISTS csr_details (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          csr_report_id UUID REFERENCES csr_reports(id) ON DELETE CASCADE,
          section_type VARCHAR(100),
          content TEXT,
          insights JSONB,
          adverse_events JSONB,
          efficacy_data JSONB,
          safety_data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create CSR analytics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS csr_analytics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          csr_report_id UUID REFERENCES csr_reports(id) ON DELETE CASCADE,
          analysis_type VARCHAR(100),
          analysis_data JSONB,
          confidence_score DECIMAL(3,2),
          generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ CSR database tables created/verified successfully');
    } finally {
      client.release();
    }
  }

  async insertCSRReport(reportData) {
    const client = await pool.connect();
    try {
      const {
        title,
        studyId,
        phase,
        indication,
        sponsor,
        therapeuticArea,
        sampleSize,
        durationMonths,
        primaryEndpoint,
        completionYear,
        documentPath,
      } = reportData;

      const result = await client.query(
        `
        INSERT INTO csr_reports 
        (title, study_id, phase, indication, sponsor, therapeutic_area, 
         sample_size, duration_months, primary_endpoint, completion_year, document_path)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `,
        [
          title,
          studyId,
          phase,
          indication,
          sponsor,
          therapeuticArea,
          sampleSize,
          durationMonths,
          primaryEndpoint,
          completionYear,
          documentPath,
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async searchCSRReports(query, filters = {}) {
    const client = await pool.connect();
    try {
      let baseQuery = `
        SELECT * FROM csr_reports 
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      // Add text search
      if (query) {
        baseQuery += ` AND (title ILIKE $${paramIndex} OR indication ILIKE $${paramIndex} OR sponsor ILIKE $${paramIndex})`;
        params.push(`%${query}%`);
        paramIndex++;
      }

      // Add filters
      if (filters.phase) {
        baseQuery += ` AND phase = $${paramIndex}`;
        params.push(filters.phase);
        paramIndex++;
      }

      if (filters.therapeuticArea) {
        baseQuery += ` AND therapeutic_area = $${paramIndex}`;
        params.push(filters.therapeuticArea);
        paramIndex++;
      }

      if (filters.yearFrom) {
        baseQuery += ` AND completion_year >= $${paramIndex}`;
        params.push(filters.yearFrom);
        paramIndex++;
      }

      if (filters.yearTo) {
        baseQuery += ` AND completion_year <= $${paramIndex}`;
        params.push(filters.yearTo);
        paramIndex++;
      }

      baseQuery += ` ORDER BY created_at DESC LIMIT 50`;

      const result = await client.query(baseQuery, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getCSRReportById(reportId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT r.*, 
               array_agg(d.*) as details
        FROM csr_reports r
        LEFT JOIN csr_details d ON r.id = d.csr_report_id
        WHERE r.id = $1
        GROUP BY r.id
      `,
        [reportId]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async generateCSRInsights(reportId, content) {
    const client = await pool.connect();
    try {
      // Use OpenAI to generate insights
      const prompt = `
        Analyze this clinical study report content and provide structured insights:
        
        ${content}
        
        Please provide:
        1. Key efficacy findings
        2. Safety profile summary
        3. Adverse events analysis
        4. Study limitations
        5. Regulatory implications
        
        Format as structured JSON with clear sections.
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a clinical research expert analyzing CSR data. Provide structured, regulatory-compliant insights.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const insights = response.choices[0].message.content;

      // Store the insights
      await client.query(
        `
        INSERT INTO csr_details (csr_report_id, section_type, content, insights)
        VALUES ($1, 'ai_analysis', $2, $3)
      `,
        [reportId, content, insights]
      );

      return insights;
    } finally {
      client.release();
    }
  }

  async getCSRStatistics() {
    const client = await pool.connect();
    try {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_reports,
          COUNT(DISTINCT therapeutic_area) as unique_areas,
          COUNT(DISTINCT phase) as unique_phases,
          AVG(sample_size) as avg_sample_size,
          AVG(duration_months) as avg_duration
        FROM csr_reports
      `);

      const phaseDistribution = await client.query(`
        SELECT phase, COUNT(*) as count
        FROM csr_reports
        WHERE phase IS NOT NULL
        GROUP BY phase
        ORDER BY count DESC
      `);

      const areaDistribution = await client.query(`
        SELECT therapeutic_area, COUNT(*) as count
        FROM csr_reports
        WHERE therapeutic_area IS NOT NULL
        GROUP BY therapeutic_area
        ORDER BY count DESC
        LIMIT 10
      `);

      return {
        overview: stats.rows[0],
        phaseDistribution: phaseDistribution.rows,
        areaDistribution: areaDistribution.rows,
      };
    } finally {
      client.release();
    }
  }

  async storeAnalytics(reportId, analysisType, analysisData, confidenceScore) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        INSERT INTO csr_analytics (csr_report_id, analysis_type, analysis_data, confidence_score)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [reportId, analysisType, analysisData, confidenceScore]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getRecentReports(limit = 10) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT * FROM csr_reports
        ORDER BY created_at DESC
        LIMIT $1
      `,
        [limit]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  async performAdvancedSearch(searchParams) {
    const client = await pool.connect();
    try {
      const {
        query,
        phase,
        therapeuticArea,
        sampleSizeMin,
        sampleSizeMax,
        yearFrom,
        yearTo,
        hasAdverseEvents,
        efficacyThreshold,
      } = searchParams;

      let baseQuery = `
        SELECT r.*, 
               COUNT(d.id) as detail_count,
               array_agg(d.section_type) as available_sections
        FROM csr_reports r
        LEFT JOIN csr_details d ON r.id = d.csr_report_id
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      // Complex search logic
      if (query) {
        baseQuery += ` AND (
          r.title ILIKE $${paramIndex} OR 
          r.indication ILIKE $${paramIndex} OR 
          r.sponsor ILIKE $${paramIndex} OR
          r.primary_endpoint ILIKE $${paramIndex}
        )`;
        params.push(`%${query}%`);
        paramIndex++;
      }

      if (phase) {
        baseQuery += ` AND r.phase = $${paramIndex}`;
        params.push(phase);
        paramIndex++;
      }

      if (therapeuticArea) {
        baseQuery += ` AND r.therapeutic_area = $${paramIndex}`;
        params.push(therapeuticArea);
        paramIndex++;
      }

      if (sampleSizeMin) {
        baseQuery += ` AND r.sample_size >= $${paramIndex}`;
        params.push(sampleSizeMin);
        paramIndex++;
      }

      if (sampleSizeMax) {
        baseQuery += ` AND r.sample_size <= $${paramIndex}`;
        params.push(sampleSizeMax);
        paramIndex++;
      }

      if (yearFrom) {
        baseQuery += ` AND r.completion_year >= $${paramIndex}`;
        params.push(yearFrom);
        paramIndex++;
      }

      if (yearTo) {
        baseQuery += ` AND r.completion_year <= $${paramIndex}`;
        params.push(yearTo);
        paramIndex++;
      }

      baseQuery += ` 
        GROUP BY r.id 
        ORDER BY r.created_at DESC 
        LIMIT 50
      `;

      const result = await client.query(baseQuery, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
}

export const csrDatabaseService = new CSRDatabaseService();
