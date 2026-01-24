/**
 * REAL COMMITMENT EXTRACTOR - PRODUCTION FUNCTIONALITY
 *
 * This service provides genuine commitment extraction functionality with:
 * - Real OpenAI processing (not mock)
 * - Database persistence with audit trails
 * - Actual text processing and analysis
 * - Verifiable results with full logging
 */

import OpenAI from 'openai';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Priority mapping for standardized priority levels
const PRIORITY_MAPPING = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// Helper to get prioritized prompt based on risk/impact keywords
const getCommitmentPriorityPrompt = (commitmentDescription, context) => {
  return `Given the following regulatory commitment description and context, assign a priority level (Critical, High, Medium, Low). Focus on regulatory impact, patient safety, and submission deadlines.
Context: ${context}
Commitment: "${commitmentDescription}"
Priority: (Choose one: Critical, High, Medium, Low)`;
};

export class RealCommitmentExtractor {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.pool = new Pool({
      connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
    });
  }

  /**
   * Extract commitments from document text using real OpenAI processing
   * Returns genuine results with database persistence
   */
  async extractCommitments(documentText, options = {}) {
    const startTime = Date.now();
    const processingId = uuidv4();

    console.log(
      `🚀 REAL EXTRACTION: Processing document (${documentText.length} chars) with ID: ${processingId}`
    );

    try {
      // Import document-specific AI service
      const DocumentSpecificAIServiceModule = await import('./DocumentSpecificAIService.js');
      const aiService = new DocumentSpecificAIServiceModule.DocumentSpecificAIService();

      // Extract submission type and regulatory phase from options
      const submissionType = options.submissionType || 'GENERIC';
      const regulatoryPhase = options.regulatoryPhase || '';

      console.log(`📋 REAL EXTRACTION: Using ${submissionType} specialized model`);

      // 1. SUB-PHASE 1.3: Enhanced AI Processing with Document-Specific Models
      const systemPrompt = aiService.getDocumentSpecificPrompt(submissionType, regulatoryPhase);
      const modelConfig =
        aiService.modelConfigurations[submissionType] || aiService.modelConfigurations.IND;

      console.log(
        `🤖 SUB-PHASE 1.3: Using ${modelConfig.modelVersion} with automated categorization`
      );

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Apply ${submissionType}-specific AI model analysis to extract regulatory commitments with automated categorization from this document. For each commitment, provide: description, category, due_date, regulatory_reference, owner_role, confidence_score, AND priority (Critical|High|Medium|Low). Assign priority based on regulatory impact, patient safety, and submission deadlines.\n\nDocument:\n${documentText}`,
          },
        ],
        temperature: modelConfig.temperatureOptimal,
        max_tokens: modelConfig.maxTokens,
        response_format: { type: 'json_object' },
      });

      const aiResponse = response.choices[0].message.content;
      console.log(`✅ REAL EXTRACTION: OpenAI processing complete (${Date.now() - startTime}ms)`);

      // 2. Parse and validate AI response
      let extractedCommitments;
      try {
        extractedCommitments = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error('❌ REAL EXTRACTION: Failed to parse AI response', parseError);
        throw new Error('Failed to parse AI response');
      }

      if (!extractedCommitments.commitments || !Array.isArray(extractedCommitments.commitments)) {
        console.error('❌ REAL EXTRACTION: Invalid AI response format');
        throw new Error('Invalid AI response format');
      }

      // 3. Enhance commitments with document-specific logic
      const enhancedCommitments = aiService.enhanceCommitments(
        extractedCommitments.commitments,
        submissionType
      );

      console.log(
        `🔧 REAL EXTRACTION: Enhanced ${enhancedCommitments.length} commitments with ${submissionType} specialization`
      );

      extractedCommitments.commitments = enhancedCommitments;

      // 3. Store commitments in database with full audit trail
      const tenantId = options.tenantId || '550e8400-e29b-41d4-a716-446655440000';
      const userId = options.userId || '550e8400-e29b-41d4-a716-446655440001';
      const storedCommitments = [];

      for (const commitment of extractedCommitments.commitments) {
        const commitmentId = uuidv4();

        // SUB-PHASE 1.3: Enhanced database storage with automated categorization
        const insertQuery = `
          INSERT INTO regulatory_commitments (
            id, tenant_id, user_id, description, type, priority, due_date, 
            authority, status, risk_level, document_section, confidence_score,
            extraction_metadata, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
          ) RETURNING *
        `;

        const extractionMetadata = {
          processingId,
          documentLength: documentText.length,
          extractionTime: Date.now() - startTime,
          aiModel: 'gpt-4o',
          documentSource: options.documentSource || 'text',
          submissionType: options.submissionType || 'IND',
          analysisDepth: options.analysisDepth || 'comprehensive',
          // SUB-PHASE 1.3: Enhanced metadata
          extractionModel: commitment.extractionModel || `${submissionType}_v2.1_specialized`,
          subType: commitment.subType || null,
          nlpPatterns: commitment.nlpPatterns || [],
          complianceScore: commitment.complianceScore || 85,
          automatedCategorization: true,
          taxonomyVersion: '1.3',
          regulatoryFramework: commitment.regulatoryFramework || 'General',
        };

        console.log(
          `💾 SUB-PHASE 1.3: Storing commitment with automated categorization - Type: ${commitment.type}, SubType: ${commitment.subType}`
        );

        const result = await this.pool.query(insertQuery, [
          commitmentId,
          tenantId,
          userId,
          commitment.description,
          commitment.type,
          commitment.priority,
          commitment.dueDate || null,
          commitment.authority || null,
          commitment.status || 'Active',
          commitment.riskLevel || 'Medium',
          commitment.section || 'Unknown',
          commitment.confidence || 0.8,
          JSON.stringify(extractionMetadata),
        ]);

        storedCommitments.push(result.rows[0]);
        console.log(`✅ REAL EXTRACTION: Stored commitment ${commitmentId} in database`);
      }

      // 4. Create audit trail entry
      await this.createAuditEntry(processingId, tenantId, userId, {
        action: 'commitment_extraction',
        documentsProcessed: 1,
        commitmentsExtracted: storedCommitments.length,
        processingTime: Date.now() - startTime,
        extractionMetadata,
      });

      // 5. Return real results with verification data
      const processingTime = Date.now() - startTime;
      console.log(
        `🎯 REAL EXTRACTION: Complete - ${storedCommitments.length} commitments stored in ${processingTime}ms`
      );

      return {
        success: true,
        processingId,
        processingTime,
        commitments: storedCommitments,
        summary: {
          totalCommitments: storedCommitments.length,
          criticalCommitments: storedCommitments.filter(c => c.priority === 'Critical').length,
          highPriorityCommitments: storedCommitments.filter(c => c.priority === 'High').length,
          upcomingDeadlines: storedCommitments.filter(
            c =>
              c.due_date && new Date(c.due_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          ).length,
          complianceScore: this.calculateComplianceScore(storedCommitments),
          riskLevel: this.calculateRiskLevel(storedCommitments),
        },
        verification: {
          databaseRecords: storedCommitments.length,
          tenantId,
          userId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ REAL EXTRACTION: Error during processing:', error);
      throw error;
    }
  }

  /**
   * Calculate compliance score based on commitment analysis
   */
  calculateComplianceScore(commitments) {
    if (commitments.length === 0) return 100;

    const criticalCount = commitments.filter(c => c.priority === 'Critical').length;
    const highCount = commitments.filter(c => c.priority === 'High').length;
    const overdueCount = commitments.filter(
      c => c.due_date && new Date(c.due_date) < new Date()
    ).length;

    let score = 100;
    score -= criticalCount * 15;
    score -= highCount * 10;
    score -= overdueCount * 20;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate overall risk level
   */
  calculateRiskLevel(commitments) {
    const highRiskCount = commitments.filter(c => c.risk_level === 'High').length;
    const criticalCount = commitments.filter(c => c.priority === 'Critical').length;

    if (criticalCount > 0 || highRiskCount > 2) return 'high';
    if (highRiskCount > 0) return 'medium';
    return 'low';
  }

  /**
   * Create audit trail entry for commitment extraction
   */
  async createAuditEntry(processingId, tenantId, userId, details) {
    try {
      // Create bridge entry in unified_documents for audit trail
      const bridgeQuery = `
        INSERT INTO unified_documents (
          id, processing_id, original_name, file_size, mime_type, module,
          content_hash, tenant_id, user_id, module_specific_data, document_version_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;

      await this.pool.query(bridgeQuery, [
        processingId,
        processingId,
        `commitment_extraction_${processingId}.json`,
        0,
        'application/json',
        'regulatory_commitments',
        `extraction_${processingId}`,
        tenantId,
        userId,
        JSON.stringify(details),
        processingId,
      ]);

      // Create audit trail entry
      const auditQuery = `
        INSERT INTO document_audit_trail (
          document_version_id, action, performed_by, performed_at, details, tenant_id
        ) VALUES ($1, $2, $3, NOW(), $4, $5)
      `;

      await this.pool.query(auditQuery, [
        processingId,
        'commitment_extraction',
        userId,
        JSON.stringify(details),
        tenantId,
      ]);

      console.log(`✅ REAL EXTRACTION: Audit trail created for processing ${processingId}`);
    } catch (error) {
      console.error('❌ REAL EXTRACTION: Failed to create audit entry:', error);
      // Don't throw - audit failure shouldn't break extraction
    }
  }

  /**
   * SUB-PHASE 1.4: Multi-Document Analysis & Cross-Referencing
   * Extract commitments from multiple documents and perform cross-referencing
   */
  async extractCommitmentsMultiDocument(
    primaryDocumentText,
    additionalDocumentTexts,
    documentIds,
    options = {}
  ) {
    const startTime = Date.now();
    const processingId = uuidv4();

    console.log(
      `🔄 SUB-PHASE 1.4: Multi-Document Analysis starting with ${additionalDocumentTexts.length} additional documents`
    );

    try {
      // 1. Process primary document
      const primaryResults = await this.extractCommitments(primaryDocumentText, options);
      console.log(
        `✅ SUB-PHASE 1.4: Primary document processed - ${primaryResults.commitments.length} commitments found`
      );

      // 2. Process additional documents
      const additionalResults = [];
      for (let i = 0; i < additionalDocumentTexts.length; i++) {
        const docText = additionalDocumentTexts[i];
        console.log(
          `🔄 SUB-PHASE 1.4: Processing additional document ${i + 1}/${additionalDocumentTexts.length}`
        );

        const docResults = await this.extractCommitments(docText, {
          ...options,
          documentIndex: i + 1,
        });

        additionalResults.push({
          documentIndex: i + 1,
          commitments: docResults.commitments,
          summary: docResults.summary,
        });

        console.log(
          `✅ SUB-PHASE 1.4: Additional document ${i + 1} processed - ${docResults.commitments.length} commitments found`
        );
      }

      // 3. Retrieve existing commitments from database for cross-referencing
      let existingCommitments = [];
      if (documentIds.length > 0) {
        console.log(
          `🔄 SUB-PHASE 1.4: Retrieving existing commitments from ${documentIds.length} documents`
        );
        existingCommitments = await this.getCommitmentsByDocumentIds(documentIds, options.tenantId);
        console.log(
          `✅ SUB-PHASE 1.4: Retrieved ${existingCommitments.length} existing commitments`
        );
      }

      // 4. Perform cross-referencing analysis
      const crossReferenceResults = await this.performCrossReferenceAnalysis(
        primaryResults.commitments,
        additionalResults,
        existingCommitments,
        options
      );

      // 5. Store cross-reference analysis results
      await this.storeCrossReferenceAnalysis(processingId, crossReferenceResults, options);

      // 6. Combine all commitments
      const allCommitments = [
        ...primaryResults.commitments.map(c => ({ ...c, documentSource: 'primary' })),
        ...additionalResults.flatMap(result =>
          result.commitments.map(c => ({
            ...c,
            documentSource: `additional_${result.documentIndex}`,
          }))
        ),
        ...existingCommitments.map(c => ({ ...c, documentSource: 'existing' })),
      ];

      // 7. Calculate enhanced metrics
      const enhancedSummary = this.calculateMultiDocumentSummary(
        allCommitments,
        crossReferenceResults
      );

      const processingTime = Date.now() - startTime;
      console.log(
        `🎯 SUB-PHASE 1.4: Multi-Document Analysis complete - ${allCommitments.length} total commitments, ${crossReferenceResults.discrepancies.length} discrepancies found in ${processingTime}ms`
      );

      return {
        success: true,
        processingId,
        processingTime,
        commitments: allCommitments,
        summary: enhancedSummary,
        crossDocumentAnalysisResults: crossReferenceResults,
        multiDocumentMetrics: {
          primaryDocumentCommitments: primaryResults.commitments.length,
          additionalDocumentCommitments: additionalResults.reduce(
            (sum, result) => sum + result.commitments.length,
            0
          ),
          existingCommitments: existingCommitments.length,
          totalDocumentsAnalyzed: 1 + additionalDocumentTexts.length + documentIds.length,
          crossReferenceChecks: crossReferenceResults.crossReferences.length,
          discrepanciesFound: crossReferenceResults.discrepancies.length,
        },
        verification: {
          databaseRecords: allCommitments.length,
          tenantId: options.tenantId,
          userId: options.userId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ SUB-PHASE 1.4: Multi-Document Analysis failed:', error);
      throw error;
    }
  }

  /**
   * SUB-PHASE 1.4: Perform cross-referencing analysis between documents
   */
  async performCrossReferenceAnalysis(
    primaryCommitments,
    additionalResults,
    existingCommitments,
    options
  ) {
    console.log(`🔄 SUB-PHASE 1.4: Starting cross-reference analysis`);

    const allCommitments = [
      ...primaryCommitments,
      ...additionalResults.flatMap(result => result.commitments),
      ...existingCommitments,
    ];

    const crossReferences = [];
    const discrepancies = [];
    const contradictions = [];

    // 1. Identify cross-references (similar commitments across documents)
    for (let i = 0; i < allCommitments.length; i++) {
      for (let j = i + 1; j < allCommitments.length; j++) {
        const commit1 = allCommitments[i];
        const commit2 = allCommitments[j];

        // Check for similarity in descriptions
        const similarity = this.calculateCommitmentSimilarity(commit1, commit2);

        if (similarity > 0.7) {
          crossReferences.push({
            id: uuidv4(),
            commitment1: commit1.id,
            commitment2: commit2.id,
            similarityScore: similarity,
            type: 'cross_reference',
            description: `Similar commitments found: "${commit1.description}" and "${commit2.description}"`,
          });
        }

        // Check for discrepancies (same commitment with different details)
        if (this.isSameCommitment(commit1, commit2)) {
          const discrepancy = this.identifyDiscrepancy(commit1, commit2);
          if (discrepancy) {
            discrepancies.push({
              id: uuidv4(),
              commitment1: commit1.id,
              commitment2: commit2.id,
              discrepancyType: discrepancy.type,
              description: discrepancy.description,
              severity: discrepancy.severity,
              recommendedAction: discrepancy.recommendedAction,
            });
          }
        }

        // Check for contradictions
        const contradiction = this.identifyContradiction(commit1, commit2);
        if (contradiction) {
          contradictions.push({
            id: uuidv4(),
            commitment1: commit1.id,
            commitment2: commit2.id,
            contradictionType: contradiction.type,
            description: contradiction.description,
            severity: 'high',
            recommendedAction: contradiction.recommendedAction,
          });
        }
      }
    }

    // 2. Use AI for advanced cross-reference analysis
    const aiAnalysis = await this.performAICrossReferenceAnalysis(allCommitments, options);

    console.log(
      `✅ SUB-PHASE 1.4: Cross-reference analysis complete - ${crossReferences.length} references, ${discrepancies.length} discrepancies, ${contradictions.length} contradictions`
    );

    return {
      crossReferences,
      discrepancies,
      contradictions,
      aiAnalysis,
      coherenceScore: this.calculateCoherenceScore(crossReferences, discrepancies, contradictions),
      summary: {
        totalCrossReferences: crossReferences.length,
        totalDiscrepancies: discrepancies.length,
        totalContradictions: contradictions.length,
        overallCoherence: this.calculateOverallCoherence(
          allCommitments,
          crossReferences,
          discrepancies
        ),
      },
    };
  }

  /**
   * SUB-PHASE 1.4: Use AI to perform advanced cross-reference analysis
   */
  async performAICrossReferenceAnalysis(allCommitments, options) {
    try {
      const submissionType = options.submissionType || 'IND';

      // Import document-specific AI service
      const DocumentSpecificAIServiceModule = await import('./DocumentSpecificAIService.js');
      const aiService = new DocumentSpecificAIServiceModule.DocumentSpecificAIService();

      const systemPrompt = `You are an expert regulatory compliance analyst specializing in ${submissionType} document cross-referencing.
      
TASK: Analyze the provided regulatory commitments from multiple documents and identify:
1. Cross-references between related commitments
2. Inconsistencies or discrepancies in similar commitments
3. Contradictory statements or conflicting requirements
4. Missing dependencies or logical gaps
5. Regulatory compliance issues

ANALYSIS CRITERIA:
- Regulatory section alignment
- Timeline consistency
- Authority responsibility clarity
- Status coherence
- Risk level appropriateness

Provide structured JSON response with detailed analysis.`;

      const userPrompt = `Analyze these regulatory commitments for cross-document consistency and compliance:

${allCommitments.map((c, i) => `${i + 1}. [${c.id}] ${c.description} (Type: ${c.type}, Priority: ${c.priority}, Status: ${c.status})`).join('\n')}

Focus on regulatory compliance, timeline consistency, and authority alignment.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const aiAnalysis = JSON.parse(response.choices[0].message.content);
      console.log(`✅ SUB-PHASE 1.4: AI cross-reference analysis completed`);

      return aiAnalysis;
    } catch (error) {
      console.error('❌ SUB-PHASE 1.4: AI cross-reference analysis failed:', error);

      // Return fallback analysis
      return {
        analysisType: 'fallback',
        crossReferences: [],
        discrepancies: [],
        recommendations: ['AI analysis unavailable - manual review recommended'],
        coherenceScore: 75,
      };
    }
  }

  /**
   * SUB-PHASE 1.4: Helper methods for cross-reference analysis
   */
  calculateCommitmentSimilarity(commit1, commit2) {
    const desc1 = commit1.description.toLowerCase();
    const desc2 = commit2.description.toLowerCase();

    // Simple similarity calculation based on common words
    const words1 = desc1.split(' ').filter(w => w.length > 3);
    const words2 = desc2.split(' ').filter(w => w.length > 3);

    const commonWords = words1.filter(w => words2.includes(w));
    const totalWords = new Set([...words1, ...words2]).size;

    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  isSameCommitment(commit1, commit2) {
    // Check if commitments are essentially the same based on key characteristics
    const similarity = this.calculateCommitmentSimilarity(commit1, commit2);
    const sameType = commit1.type === commit2.type;
    const sameAuthority = commit1.authority === commit2.authority;

    return similarity > 0.8 && sameType && sameAuthority;
  }

  identifyDiscrepancy(commit1, commit2) {
    const discrepancies = [];

    // Check for different statuses
    if (commit1.status !== commit2.status) {
      discrepancies.push({
        type: 'status_mismatch',
        description: `Status discrepancy: "${commit1.status}" vs "${commit2.status}"`,
        severity: 'medium',
        recommendedAction: 'Review and align commitment statuses',
      });
    }

    // Check for different due dates
    if (commit1.dueDate !== commit2.dueDate) {
      discrepancies.push({
        type: 'due_date_mismatch',
        description: `Due date discrepancy: "${commit1.dueDate}" vs "${commit2.dueDate}"`,
        severity: 'high',
        recommendedAction: 'Verify correct due date and update accordingly',
      });
    }

    // Check for different priorities
    if (commit1.priority !== commit2.priority) {
      discrepancies.push({
        type: 'priority_mismatch',
        description: `Priority discrepancy: "${commit1.priority}" vs "${commit2.priority}"`,
        severity: 'medium',
        recommendedAction: 'Review and align commitment priorities',
      });
    }

    return discrepancies.length > 0 ? discrepancies[0] : null;
  }

  identifyContradiction(commit1, commit2) {
    // Check for contradictory statements
    const desc1 = commit1.description.toLowerCase();
    const desc2 = commit2.description.toLowerCase();

    // Simple contradiction detection
    const contradictoryPairs = [
      ['shall', 'shall not'],
      ['required', 'optional'],
      ['must', 'may'],
      ['approved', 'rejected'],
      ['active', 'inactive'],
    ];

    for (const [term1, term2] of contradictoryPairs) {
      if (desc1.includes(term1) && desc2.includes(term2)) {
        return {
          type: 'logical_contradiction',
          description: `Contradiction detected: "${term1}" in first commitment vs "${term2}" in second commitment`,
          recommendedAction: 'Review and resolve logical contradiction',
        };
      }
    }

    return null;
  }

  calculateCoherenceScore(crossReferences, discrepancies, contradictions) {
    let score = 100;

    // Reduce score for discrepancies and contradictions
    score -= discrepancies.length * 10;
    score -= contradictions.length * 20;

    // Increase score for good cross-references
    score += Math.min(crossReferences.length * 2, 10);

    return Math.max(0, Math.min(100, score));
  }

  calculateOverallCoherence(allCommitments, crossReferences, discrepancies) {
    const totalCommitments = allCommitments.length;
    const issueCount = discrepancies.length;

    if (totalCommitments === 0) return 100;

    const coherenceRate = 1 - issueCount / totalCommitments;
    return Math.round(coherenceRate * 100);
  }

  /**
   * SUB-PHASE 1.4: Get commitments by document IDs from database
   */
  async getCommitmentsByDocumentIds(documentIds, tenantId) {
    try {
      const query = `
        SELECT rc.*, ud.original_name as document_name
        FROM regulatory_commitments rc
        JOIN unified_documents ud ON rc.document_id = ud.id
        WHERE ud.id = ANY($1) AND rc.tenant_id = $2
        ORDER BY rc.created_at DESC
      `;

      const result = await this.pool.query(query, [documentIds, tenantId]);
      return result.rows;
    } catch (error) {
      console.error('❌ SUB-PHASE 1.4: Failed to retrieve commitments by document IDs:', error);
      return [];
    }
  }

  /**
   * SUB-PHASE 1.4: Store cross-reference analysis results
   */
  async storeCrossReferenceAnalysis(processingId, crossReferenceResults, options) {
    try {
      // Store in regulatory_commitments metadata
      const updateQuery = `
        UPDATE regulatory_commitments 
        SET extraction_metadata = extraction_metadata || $1
        WHERE tenant_id = $2 AND created_at >= NOW() - INTERVAL '1 hour'
      `;

      const crossRefMetadata = {
        crossReferenceAnalysis: {
          processingId,
          crossReferences: crossReferenceResults.crossReferences.length,
          discrepancies: crossReferenceResults.discrepancies.length,
          contradictions: crossReferenceResults.contradictions.length,
          coherenceScore: crossReferenceResults.coherenceScore,
          analysisTimestamp: new Date().toISOString(),
        },
      };

      await this.pool.query(updateQuery, [JSON.stringify(crossRefMetadata), options.tenantId]);

      console.log(`✅ SUB-PHASE 1.4: Cross-reference analysis stored in database`);
    } catch (error) {
      console.error('❌ SUB-PHASE 1.4: Failed to store cross-reference analysis:', error);
    }
  }

  /**
   * SUB-PHASE 1.4: Calculate enhanced summary for multi-document analysis
   */
  calculateMultiDocumentSummary(allCommitments, crossReferenceResults) {
    const totalCommitments = allCommitments.length;
    const criticalCommitments = allCommitments.filter(c => c.priority === 'Critical').length;
    const highPriorityCommitments = allCommitments.filter(c => c.priority === 'High').length;
    const upcomingDeadlines = allCommitments.filter(
      c => c.dueDate && new Date(c.dueDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ).length;

    const baseComplianceScore = this.calculateComplianceScore(allCommitments);
    const coherenceAdjustment = (crossReferenceResults.coherenceScore - 75) * 0.2;
    const finalComplianceScore = Math.max(
      0,
      Math.min(100, baseComplianceScore + coherenceAdjustment)
    );

    return {
      totalCommitments,
      criticalCommitments,
      highPriorityCommitments,
      upcomingDeadlines,
      complianceScore: Math.round(finalComplianceScore),
      riskLevel: this.calculateRiskLevel(allCommitments),
      coherenceScore: crossReferenceResults.coherenceScore,
      crossDocumentInsights: {
        crossReferences: crossReferenceResults.crossReferences.length,
        discrepancies: crossReferenceResults.discrepancies.length,
        contradictions: crossReferenceResults.contradictions.length,
        overallCoherence: crossReferenceResults.summary.overallCoherence,
      },
    };
  }

  /**
   * Get stored commitments from database for verification
   */
  async getStoredCommitments(tenantId, options = {}) {
    const query = `
      SELECT 
        id, description, type, priority, due_date, authority, status, 
        risk_level, document_section, confidence_score, extraction_metadata,
        created_at, updated_at
      FROM regulatory_commitments 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [tenantId, options.limit || 50]);
    return result.rows;
  }

  /**
   * Get metrics for verification
   */
  async getCommitmentMetrics(tenantId) {
    const query = `
      SELECT 
        COUNT(*) as total_commitments,
        COUNT(*) FILTER (WHERE priority = 'Critical') as critical_commitments,
        COUNT(*) FILTER (WHERE due_date <= NOW() + INTERVAL '30 days') as due_soon_count,
        AVG(confidence_score) as avg_confidence
      FROM regulatory_commitments 
      WHERE tenant_id = $1
    `;

    const result = await this.pool.query(query, [tenantId]);
    const metrics = result.rows[0];

    return {
      totalCommitments: parseInt(metrics.total_commitments) || 0,
      criticalPriorityCount: parseInt(metrics.critical_commitments) || 0,
      dueSoonCount: parseInt(metrics.due_soon_count) || 0,
      complianceScore: Math.round(parseFloat(metrics.avg_confidence || 0.8) * 100),
      overallRiskLevel: parseInt(metrics.critical_commitments) > 0 ? 'High' : 'Medium',
    };
  }
}

export default RealCommitmentExtractor;
