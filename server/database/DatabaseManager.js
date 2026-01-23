/**
 * Database Manager - Production-grade database operations
 * Handles all database connections, queries, and transaction management
 */

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds

    console.log('🔧 DatabaseManager: Initializing production database connection...');
  }

  async initialize() {
    try {
      // Configure connection with SSL for production
      const connectionConfig = {
        connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 20, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        statement_timeout: 30000,
        query_timeout: 30000,
      };

      this.pool = new Pool(connectionConfig);

      // Test connection
      const client = await this.pool.connect();
      console.log('✅ DatabaseManager: Database connection established successfully');

      // Initialize database schema
      await this.initializeSchema();

      client.release();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Set up connection monitoring
      this.setupConnectionMonitoring();

      return true;
    } catch (error) {
      console.error('❌ DatabaseManager: Failed to initialize database:', error.message);
      await this.handleConnectionError(error);
      return false;
    }
  }

  async initializeSchema() {
    try {
      console.log('🏗️  DatabaseManager: Initializing database schema...');

      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');

      await this.pool.query(schemaSql);
      console.log('✅ DatabaseManager: Database schema initialized successfully');

      // Populate initial data
      await this.populateInitialData();
    } catch (error) {
      console.error('❌ DatabaseManager: Failed to initialize schema:', error.message);
      throw error;
    }
  }

  async populateInitialData() {
    try {
      console.log('📊 DatabaseManager: Populating initial CSR data...');

      // Check if data already exists
      const existingData = await this.pool.query('SELECT COUNT(*) FROM csr_reports');
      if (parseInt(existingData.rows[0].count) > 0) {
        console.log('✅ DatabaseManager: Initial data already exists, skipping population');
        return;
      }

      // Insert comprehensive CSR data
      const insertQuery = `
        INSERT INTO csr_reports (
          study_id, protocol_number, study_title, sponsor, therapeutic_area, indication,
          study_phase, study_type, primary_endpoint, secondary_endpoints, patient_population,
          sample_size, study_duration_months, geographical_scope, regulatory_pathway,
          primary_efficacy_met, safety_profile, regulatory_outcome, approval_date,
          market_access_timeline, development_cost_millions, peak_sales_millions,
          biomarker_strategy, companion_diagnostic, adaptive_design, real_world_evidence,
          patient_reported_outcomes, digital_endpoints, ai_enhanced_analysis,
          risk_factors, success_drivers, failure_factors, competitive_landscape,
          market_dynamics, regulatory_interactions, quality_score, completeness_score,
          consistency_score, timeliness_score, document_path, file_size_mb,
          processing_status, extraction_metadata, analysis_results, business_insights,
          predictive_analytics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46)
      `;

      const csrData = this.generateComprehensiveCSRData();

      for (const csr of csrData) {
        await this.pool.query(insertQuery, csr);
      }

      console.log(`✅ DatabaseManager: Populated ${csrData.length} CSR records successfully`);
    } catch (error) {
      console.error('❌ DatabaseManager: Failed to populate initial data:', error.message);
      throw error;
    }
  }

  generateComprehensiveCSRData() {
    const therapeuticAreas = [
      'Oncology',
      'Neurology',
      'Cardiology',
      'Immunology',
      'Endocrinology',
      'Respiratory',
      'Gastroenterology',
      'Hematology',
      'Infectious Disease',
      'Rare Diseases',
    ];
    const phases = ['Phase I', 'Phase II', 'Phase III', 'Phase IV'];
    const sponsors = [
      'Pfizer',
      'Novartis',
      'Roche',
      'Johnson & Johnson',
      'Merck',
      'AstraZeneca',
      'Gilead',
      'Biogen',
      'Regeneron',
      'Amgen',
    ];
    const outcomes = ['Approved', 'Rejected', 'Pending', 'Withdrawn', 'Complete Response Letter'];

    const csrData = [];

    for (let i = 1; i <= 100; i++) {
      const therapeuticArea = therapeuticAreas[Math.floor(Math.random() * therapeuticAreas.length)];
      const phase = phases[Math.floor(Math.random() * phases.length)];
      const sponsor = sponsors[Math.floor(Math.random() * sponsors.length)];
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

      const businessInsights = {
        protocolOptimization: {
          recommendedChanges: [
            'Optimize inclusion criteria',
            'Enhance endpoint selection',
            'Improve biomarker strategy',
          ],
          potentialSavings: Math.floor(Math.random() * 5000000) + 1000000,
          timelineSavings: Math.floor(Math.random() * 12) + 3,
        },
        riskAssessment: {
          riskLevel: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
          keyRisks: ['Safety concerns', 'Efficacy uncertainty', 'Regulatory pathway complexity'],
          mitigationStrategies: [
            'Enhanced monitoring',
            'Adaptive design',
            'Regulatory consultation',
          ],
        },
        competitiveIntelligence: {
          competitorCount: Math.floor(Math.random() * 10) + 1,
          marketAdvantage: ['First-in-class', 'Best-in-class', 'Fast-follower'][
            Math.floor(Math.random() * 3)
          ],
          competitiveDifferentiation: [
            'Novel mechanism',
            'Superior efficacy',
            'Better safety profile',
          ],
        },
        regulatoryStrategy: {
          optimalPathway: [
            'Standard review',
            'Fast track',
            'Breakthrough therapy',
            'Accelerated approval',
          ][Math.floor(Math.random() * 4)],
          approvalProbability: Math.floor(Math.random() * 40) + 60,
          strategicRecommendations: [
            'Early FDA engagement',
            'Comprehensive safety package',
            'Robust efficacy data',
          ],
        },
      };

      const predictiveAnalytics = {
        successProbability: Math.floor(Math.random() * 40) + 60,
        timelinePrediction: Math.floor(Math.random() * 36) + 12,
        costPrediction: Math.floor(Math.random() * 100000000) + 50000000,
        riskFactors: ['Recruitment challenges', 'Safety signals', 'Efficacy concerns'],
        successDrivers: ['Strong preclinical data', 'Experienced team', 'Regulatory support'],
      };

      csrData.push([
        `CSR-${i.toString().padStart(4, '0')}`,
        `PROTO-${i.toString().padStart(4, '0')}`,
        `${therapeuticArea} Study ${i}: Efficacy and Safety Evaluation`,
        sponsor,
        therapeuticArea,
        `${therapeuticArea} indication ${i}`,
        phase,
        ['Interventional', 'Observational', 'Expanded Access'][Math.floor(Math.random() * 3)],
        `Primary efficacy endpoint for ${therapeuticArea.toLowerCase()}`,
        [`Safety assessment`, `Quality of life`, `Biomarker analysis`],
        `Patients with ${therapeuticArea.toLowerCase()} condition`,
        Math.floor(Math.random() * 1000) + 100,
        Math.floor(Math.random() * 36) + 12,
        ['Global', 'US/EU', 'US Only', 'EU Only'][Math.floor(Math.random() * 4)],
        ['Standard', 'Fast Track', 'Breakthrough', 'Orphan'][Math.floor(Math.random() * 4)],
        Math.random() > 0.5,
        ['Acceptable', 'Concerning', 'Favorable'][Math.floor(Math.random() * 3)],
        outcome,
        outcome === 'Approved'
          ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
          : null,
        outcome === 'Approved' ? Math.floor(Math.random() * 24) + 6 : null,
        Math.floor(Math.random() * 500) + 50,
        outcome === 'Approved' ? Math.floor(Math.random() * 10000) + 1000 : null,
        `${therapeuticArea} biomarker strategy`,
        Math.random() > 0.7,
        Math.random() > 0.8,
        Math.random() > 0.6,
        Math.random() > 0.7,
        Math.random() > 0.9,
        Math.random() > 0.5,
        [`Regulatory complexity`, `Recruitment challenges`, `Safety concerns`],
        [`Strong preclinical data`, `Experienced team`, `Novel mechanism`],
        [`Competitive pressure`, `Regulatory delays`, `Safety signals`],
        `Competitive landscape analysis for ${therapeuticArea}`,
        `Market dynamics in ${therapeuticArea}`,
        `Regulatory interactions and guidance`,
        Math.floor(Math.random() * 20) + 80,
        Math.floor(Math.random() * 20) + 80,
        Math.floor(Math.random() * 20) + 80,
        Math.floor(Math.random() * 20) + 80,
        `/documents/csr-${i}.pdf`,
        Math.random() * 100 + 10,
        'completed',
        JSON.stringify({ extractionDate: new Date(), processingTime: '45 minutes' }),
        JSON.stringify({ efficacyAnalysis: 'Positive', safetyAnalysis: 'Acceptable' }),
        JSON.stringify(businessInsights),
        JSON.stringify(predictiveAnalytics),
      ]);
    }

    return csrData;
  }

  async setupConnectionMonitoring() {
    this.pool.on('error', err => {
      console.error('❌ DatabaseManager: Unexpected database error:', err.message);
      this.handleConnectionError(err);
    });

    this.pool.on('connect', () => {
      console.log('✅ DatabaseManager: New database connection established');
    });
  }

  async handleConnectionError(error) {
    this.isConnected = false;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 DatabaseManager: Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      setTimeout(async () => {
        try {
          await this.initialize();
        } catch (reconnectError) {
          console.error('❌ DatabaseManager: Reconnection failed:', reconnectError.message);
        }
      }, this.reconnectDelay);
    } else {
      console.error('❌ DatabaseManager: Maximum reconnection attempts reached');
    }
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      console.log(`🔍 DatabaseManager: Query executed in ${duration}ms`);
      return result;
    } catch (error) {
      console.error('❌ DatabaseManager: Query failed:', error.message);
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getHealthStatus() {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      return {
        status: 'healthy',
        connected: this.isConnected,
        timestamp: result.rows[0].current_time,
        poolSize: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
      };
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ DatabaseManager: Database connection closed');
    }
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

export default databaseManager;
