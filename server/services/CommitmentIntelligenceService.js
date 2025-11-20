/**
 * Commitment Intelligence Service
 *
 * Core service for the Commitment Intelligence Hub providing:
 * - AI-powered proactive discovery
 * - Automated compliance verification
 * - Intelligent remediation planning
 * - Cross-module integration
 */

import { Pool } from 'pg';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

class CommitmentIntelligenceService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Proactive AI Discovery Engine
   * Analyzes documents for implicit and explicit commitments
   */
  async proactiveDiscovery(documentText, documentId, tenantId, userId) {
    try {
      const prompt = `
            Analyze the following regulatory document text for ALL potential commitments (both explicit and implicit).
            
            Look for:
            1. Explicit commitments (direct statements of what will be done)
            2. Implicit commitments (obligations that can be inferred)
            3. Post-marketing requirements or commitments
            4. Study commitments and timelines
            5. Regulatory filing obligations
            6. Safety monitoring commitments
            
            For each commitment found, provide:
            - Description of the commitment
            - Suggested priority (High/Medium/Low)
            - Risk level (High/Medium/Low)
            - Commitment type (Study, Filing, Safety, Post-Market, etc.)
            - Regulatory authority (FDA, EMA, etc.)
            - Estimated timeline/due date if mentioned
            - Confidence score (0.0-1.0)
            
            Return as JSON array of commitment objects.
            
            Document Text:
            ${documentText}
            `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory affairs AI specializing in commitment extraction and analysis. Focus on accuracy and comprehensive discovery.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const discoveredCommitments = JSON.parse(response.choices[0].message.content);

      // Process each discovered commitment
      const processedCommitments = [];

      for (const commitment of discoveredCommitments.commitments || []) {
        const processedCommitment = await this.processDiscoveredCommitment(
          commitment,
          documentId,
          tenantId,
          userId
        );
        processedCommitments.push(processedCommitment);
      }

      return {
        success: true,
        commitments: processedCommitments,
        discoveryMetadata: {
          documentId,
          discoveryTimestamp: new Date().toISOString(),
          aiModel: 'gpt-4o',
          totalFound: processedCommitments.length,
        },
      };
    } catch (error) {
      console.error('Proactive Discovery Error:', error);
      return {
        success: false,
        error: error.message,
        commitments: [],
      };
    }
  }

  /**
   * Process a discovered commitment and store in database
   */
  async processDiscoveredCommitment(commitment, documentId, tenantId, userId) {
    try {
      const commitmentId = uuidv4();

      // Generate AI analysis and predictions
      const aiAnalysis = await this.generateAIAnalysis(commitment);
      const resourceEstimation = await this.estimateResources(commitment);
      const timelinePrediction = await this.predictTimeline(commitment);

      const query = `
                INSERT INTO regulatory_commitments (
                    id, description, priority, risk_level, commitment_type, 
                    authority, status, ai_analysis, document_id, tenant_id, 
                    created_by, ai_discovery_confidence, ai_discovery_source,
                    ai_discovery_timestamp, predictive_risk_score,
                    automated_resource_estimation, ml_timeline_prediction,
                    extraction_confidence, extraction_model, extraction_timestamp
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
                ) RETURNING *;
            `;

      const values = [
        commitmentId,
        commitment.description,
        commitment.priority || 'Medium',
        commitment.risk_level || 'Medium',
        commitment.commitment_type || 'General',
        commitment.authority || 'FDA',
        'Pending Review',
        aiAnalysis,
        documentId,
        tenantId,
        userId,
        commitment.confidence || 0.8,
        'AI_Proactive_Discovery',
        new Date(),
        await this.calculatePredictiveRisk(commitment),
        JSON.stringify(resourceEstimation),
        JSON.stringify(timelinePrediction),
        commitment.confidence || 0.8,
        'gpt-4o',
        new Date(),
      ];

      const result = await this.pool.query(query, values);

      // Log audit trail
      await this.logAuditEvent('COMMITMENT_CREATED', commitmentId, tenantId, userId, {
        source: 'AI_Proactive_Discovery',
        documentId,
        aiGenerated: true,
      });

      return result.rows[0];
    } catch (error) {
      console.error('Process Discovered Commitment Error:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive AI analysis for a commitment
   */
  async generateAIAnalysis(commitment) {
    try {
      const prompt = `
            Provide a comprehensive analysis of this regulatory commitment:
            
            Commitment: ${commitment.description}
            Type: ${commitment.commitment_type || 'General'}
            Authority: ${commitment.authority || 'FDA'}
            
            Provide analysis including:
            1. Regulatory context and requirements
            2. Potential compliance challenges
            3. Dependencies and prerequisites
            4. Risk factors
            5. Recommended monitoring approach
            6. Success criteria
            `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory affairs consultant providing detailed commitment analysis.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('AI Analysis Error:', error);
      return 'AI analysis temporarily unavailable';
    }
  }

  /**
   * Estimate resources required for commitment fulfillment
   */
  async estimateResources(commitment) {
    try {
      const prompt = `
            Estimate the resources required for this regulatory commitment:
            
            Commitment: ${commitment.description}
            Type: ${commitment.commitment_type || 'General'}
            Priority: ${commitment.priority || 'Medium'}
            
            Provide estimates for:
            1. Hours required
            2. Cost estimation
            3. Personnel types needed
            4. External resources required
            5. Technology/tools needed
            
            Return as JSON object with numeric values where possible.
            `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert project manager specializing in regulatory resource estimation.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Resource Estimation Error:', error);
      return {
        estimated_hours: 40,
        estimated_cost: 10000,
        confidence: 0.6,
        note: 'Default estimation due to AI unavailability',
      };
    }
  }

  /**
   * Predict timeline for commitment completion
   */
  async predictTimeline(commitment) {
    try {
      const prompt = `
            Predict the timeline for completing this regulatory commitment:
            
            Commitment: ${commitment.description}
            Type: ${commitment.commitment_type || 'General'}
            Priority: ${commitment.priority || 'Medium'}
            
            Consider:
            1. Regulatory review timelines
            2. Study duration requirements
            3. Internal preparation time
            4. Authority response times
            5. Potential delays
            
            Provide:
            - Estimated completion date (months from now)
            - Confidence level (0.0-1.0)
            - Key milestones
            - Risk factors for delays
            
            Return as JSON object.
            `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory timeline predictor with extensive industry knowledge.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Timeline Prediction Error:', error);
      return {
        estimated_months: 6,
        confidence: 0.5,
        note: 'Default timeline due to AI unavailability',
      };
    }
  }

  /**
   * Calculate predictive risk score
   */
  async calculatePredictiveRisk(commitment) {
    // Simple risk scoring based on commitment attributes
    let riskScore = 0.5; // Base risk

    if (commitment.priority === 'High') riskScore += 0.3;
    if (commitment.risk_level === 'High') riskScore += 0.2;
    if (commitment.commitment_type === 'Post-Market') riskScore += 0.2;
    if (commitment.confidence < 0.7) riskScore += 0.1;

    return Math.min(riskScore, 1.0);
  }

  /**
   * Automated Compliance Verification
   */
  async verifyCompliance(commitmentId, tenantId) {
    try {
      const query = `
                SELECT * FROM regulatory_commitments 
                WHERE id = $1 AND tenant_id = $2
            `;

      const result = await this.pool.query(query, [commitmentId, tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Commitment not found');
      }

      const commitment = result.rows[0];

      // Check for evidence of fulfillment
      const verificationResult = await this.checkFulfillmentEvidence(commitment);

      // Update commitment with verification results
      const updateQuery = `
                UPDATE regulatory_commitments 
                SET automated_verification_status = $1,
                    fulfillment_verification_date = $2,
                    auto_compliance_check_result = $3,
                    updated_at = NOW()
                WHERE id = $4
            `;

      await this.pool.query(updateQuery, [
        verificationResult.status,
        new Date(),
        JSON.stringify(verificationResult),
        commitmentId,
      ]);

      return verificationResult;
    } catch (error) {
      console.error('Compliance Verification Error:', error);
      throw error;
    }
  }

  /**
   * Check for evidence of commitment fulfillment
   */
  async checkFulfillmentEvidence(commitment) {
    try {
      // Search for related documents that might indicate fulfillment
      const evidenceQuery = `
                SELECT * FROM unified_documents 
                WHERE tenant_id = $1 
                AND (
                    processed_text ILIKE '%' || $2 || '%' OR
                    file_name ILIKE '%' || $3 || '%'
                )
                AND created_at > $4
                LIMIT 10
            `;

      const evidenceResult = await this.pool.query(evidenceQuery, [
        commitment.tenant_id,
        commitment.description.substring(0, 50),
        commitment.commitment_type,
        commitment.created_at,
      ]);

      const evidenceDocuments = evidenceResult.rows;

      // AI-powered evidence analysis
      if (evidenceDocuments.length > 0) {
        const analysis = await this.analyzeEvidenceDocuments(commitment, evidenceDocuments);

        return {
          status: analysis.fulfilled ? 'Fulfilled' : 'In Progress',
          confidence: analysis.confidence,
          evidenceCount: evidenceDocuments.length,
          evidenceDocuments: evidenceDocuments.map(doc => ({
            id: doc.id,
            fileName: doc.file_name,
            uploadDate: doc.created_at,
          })),
          analysis: analysis.summary,
        };
      }

      return {
        status: 'No Evidence Found',
        confidence: 0.1,
        evidenceCount: 0,
        evidenceDocuments: [],
        analysis: 'No related documents found to verify fulfillment',
      };
    } catch (error) {
      console.error('Evidence Check Error:', error);
      return {
        status: 'Verification Failed',
        confidence: 0.0,
        error: error.message,
      };
    }
  }

  /**
   * Analyze evidence documents using AI
   */
  async analyzeEvidenceDocuments(commitment, evidenceDocuments) {
    try {
      const prompt = `
            Analyze these documents to determine if they provide evidence of fulfilling this commitment:
            
            Commitment: ${commitment.description}
            Type: ${commitment.commitment_type}
            
            Evidence Documents:
            ${evidenceDocuments.map(doc => `- ${doc.file_name}: ${doc.processed_text?.substring(0, 500) || 'No text available'}`).join('\n')}
            
            Determine:
            1. Whether the commitment appears to be fulfilled
            2. Confidence level (0.0-1.0)
            3. Summary of evidence
            4. Any gaps or concerns
            
            Return as JSON object.
            `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory compliance analyst specializing in evidence assessment.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Evidence Analysis Error:', error);
      return {
        fulfilled: false,
        confidence: 0.3,
        summary: 'AI analysis temporarily unavailable',
      };
    }
  }

  /**
   * Generate AI-powered remediation plan
   */
  async generateRemediationPlan(commitmentId, tenantId) {
    try {
      const query = `
                SELECT * FROM regulatory_commitments 
                WHERE id = $1 AND tenant_id = $2
            `;

      const result = await this.pool.query(query, [commitmentId, tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Commitment not found');
      }

      const commitment = result.rows[0];

      const prompt = `
            Generate a detailed remediation plan for this regulatory commitment:
            
            Commitment: ${commitment.description}
            Status: ${commitment.status}
            Priority: ${commitment.priority}
            Risk Level: ${commitment.risk_level}
            Due Date: ${commitment.due_date}
            
            Create a comprehensive action plan including:
            1. Immediate actions required
            2. Step-by-step implementation plan
            3. Resource requirements
            4. Timeline with milestones
            5. Risk mitigation strategies
            6. Success metrics
            7. Contingency plans
            
            Return as structured JSON object.
            `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert regulatory project manager specializing in remediation planning.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const remediationPlan = JSON.parse(response.choices[0].message.content);

      // Update commitment with remediation plan
      const updateQuery = `
                UPDATE regulatory_commitments 
                SET ai_generated_action_plan = $1,
                    remediation_confidence_score = $2,
                    updated_at = NOW()
                WHERE id = $3
            `;

      await this.pool.query(updateQuery, [
        JSON.stringify(remediationPlan),
        remediationPlan.confidence || 0.8,
        commitmentId,
      ]);

      return remediationPlan;
    } catch (error) {
      console.error('Remediation Plan Error:', error);
      throw error;
    }
  }

  /**
   * Log audit events for commitment activities
   */
  async logAuditEvent(eventType, commitmentId, tenantId, userId, metadata = {}) {
    try {
      const query = `
                INSERT INTO document_audit_trail (
                    tenant_id, user_id, document_id, action_type, 
                    action_details, timestamp
                ) VALUES ($1, $2, $3, $4, $5, NOW())
            `;

      await this.pool.query(query, [
        tenantId,
        userId,
        commitmentId,
        eventType,
        JSON.stringify(metadata),
      ]);
    } catch (error) {
      console.error('Audit Log Error:', error);
      // Don't throw - audit logging should not break main functionality
    }
  }

  /**
   * Get commitment statistics and analytics
   */
  async getCommitmentAnalytics(tenantId) {
    try {
      const query = `
                SELECT 
                    COUNT(*) as total_commitments,
                    COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_commitments,
                    COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_commitments,
                    COUNT(CASE WHEN status = 'Overdue' THEN 1 END) as overdue_commitments,
                    AVG(ai_discovery_confidence) as avg_discovery_confidence,
                    AVG(predictive_risk_score) as avg_risk_score,
                    COUNT(CASE WHEN ai_discovery_source = 'AI_Proactive_Discovery' THEN 1 END) as ai_discovered
                FROM regulatory_commitments 
                WHERE tenant_id = $1
            `;

      const result = await this.pool.query(query, [tenantId]);

      return result.rows[0];
    } catch (error) {
      console.error('Analytics Error:', error);
      throw error;
    }
  }
}

export default CommitmentIntelligenceService;
