// NOTE: Using AI Provider Router for multi-provider support
// The original openaiService was actually Kimi AI (moonshot.cn)
import aiProviderRouter from './aiProviderRouter.js';
const openaiService = aiProviderRouter; // Backward compatibility alias
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from '../db/pool.js';
import { 
  sections, 
  sectionLinks, 
  leaves,
  sectionPatches,
  facts 
} from '@shared/schema.ts';
import { eq, and, or, desc, sql } from 'drizzle-orm';

const db = drizzle(getPool());

class AIImpactAnalysisService {
  constructor() {
    this.openai = openaiService;
  }

  /**
   * Analyzes the impact of a proposed section change across all linked documents
   * @param {string} sectionId - The ID of the section being changed
   * @param {string} newContent - The proposed new content
   * @param {string} oldContent - The current content
   * @param {number} projectId - The project ID
   * @returns {Object} Impact analysis with affected documents and severity
   */
  async analyzeChangeImpact(sectionId, newContent, oldContent, projectId) {
    try {
      // Get all documents linked to this section
      const linkedDocuments = await this.getLinkedDocuments(sectionId);
      
      // Use AI to analyze the semantic difference
      const semanticAnalysis = await this.analyzeSem
anticDifference(oldContent, newContent);
      
      // Determine impact severity based on change type
      const impactAnalysis = {
        sectionId,
        changeType: semanticAnalysis.changeType,
        severity: semanticAnalysis.severity,
        affectedDocuments: [],
        propagationRequired: semanticAnalysis.requiresPropagation,
        complianceImpact: semanticAnalysis.complianceImpact,
        suggestedActions: []
      };

      // Analyze impact on each linked document
      for (const doc of linkedDocuments) {
        const docImpact = await this.analyzeDocumentImpact(doc, semanticAnalysis);
        impactAnalysis.affectedDocuments.push({
          documentId: doc.leafId,
          documentPath: doc.ctdPath,
          documentStatus: doc.status,
          impactSeverity: docImpact.severity,
          requiredActions: docImpact.actions,
          regulatoryRisk: docImpact.regulatoryRisk,
          updatePriority: doc.status === 'approved' ? 'high' : 'normal'
        });
      }

      // Generate suggested actions based on analysis
      impactAnalysis.suggestedActions = await this.generateSuggestedActions(
        semanticAnalysis,
        impactAnalysis.affectedDocuments
      );

      return impactAnalysis;
    } catch (error) {
      console.error('Error analyzing change impact:', error);
      throw error;
    }
  }

  /**
   * Suggests related sections that may need updates based on a change
   * @param {Object} change - The change object containing section and content info
   * @param {number} projectId - The project ID
   * @returns {Array} Suggested related updates
   */
  async suggestRelatedUpdates(change, projectId) {
    try {
      const { sectionId, newContent, changeType } = change;
      
      // Get related sections based on content similarity
      const relatedSections = await this.findRelatedSections(sectionId, projectId);
      
      // Use AI to suggest which sections need updates
      const prompt = `
        A change has been made to a regulatory section:
        Change Type: ${changeType}
        New Content: ${newContent}
        
        Based on this change, analyze which of these related sections should be updated:
        ${JSON.stringify(relatedSections)}
        
        For each section that needs updating:
        1. Explain why it needs to be updated
        2. Suggest the specific changes needed
        3. Identify any regulatory requirements driving the update
        4. Rate the update priority (high/medium/low)
        
        Return as JSON with array of suggestions.
      `;

      const aiResponse = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a regulatory compliance expert analyzing document dependencies and suggesting necessary updates to maintain consistency across pharmaceutical documentation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.1
      });

      const suggestions = JSON.parse(aiResponse.choices[0].message.content);
      
      // Enrich suggestions with database information
      return await this.enrichSuggestions(suggestions.suggestions || []);
    } catch (error) {
      console.error('Error suggesting related updates:', error);
      throw error;
    }
  }

  /**
   * Generates regulatory justification for changes
   * @param {Object} change - The change details
   * @returns {Object} Regulatory rationale with citations
   */
  async generateChangeRationale(change) {
    try {
      const { oldContent, newContent, changeType, sectionType } = change;
      
      const prompt = `
        Analyze this regulatory document change and provide justification:
        
        Section Type: ${sectionType}
        Change Type: ${changeType}
        Old Content: ${oldContent}
        New Content: ${newContent}
        
        Provide:
        1. Regulatory justification for this change
        2. Relevant FDA/ICH/EMA guideline citations
        3. Impact on compliance status
        4. Risk assessment of the change
        5. Recommended review process
        
        Return as structured JSON with clear rationale.
      `;

      const response = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a senior regulatory affairs expert providing detailed rationale for document changes in pharmaceutical submissions. Always cite specific guidelines and regulations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
        temperature: 0.1
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error generating change rationale:', error);
      throw error;
    }
  }

  /**
   * Detects inconsistencies across a project's documents
   * @param {number} projectId - The project ID to scan
   * @returns {Array} List of detected inconsistencies
   */
  async detectInconsistencies(projectId) {
    try {
      // Get all sections and their content for the project
      const projectSections = await db
        .select({
          sectionId: sections.sectionId,
          title: sections.title,
          content: sections.content,
          metadata: sections.metadata
        })
        .from(sections)
        .where(eq(sections.projectId, projectId));

      // Get facts related to the project
      const projectFacts = await db
        .select()
        .from(facts)
        .limit(100); // Limit for performance

      // Use AI to detect inconsistencies
      const prompt = `
        Analyze these pharmaceutical document sections for inconsistencies:
        
        Sections:
        ${JSON.stringify(projectSections.map(s => ({
          id: s.sectionId,
          title: s.title,
          content: s.content?.substring(0, 500) // Truncate for API limits
        })))}
        
        Known Facts:
        ${JSON.stringify(projectFacts.slice(0, 20))} // Limit facts sent to AI
        
        Identify:
        1. Conflicting information between sections
        2. Inconsistent terminology or definitions
        3. Mismatched dates, numbers, or specifications
        4. Regulatory compliance gaps
        5. Missing cross-references
        
        For each inconsistency:
        - Describe the issue clearly
        - Identify affected sections
        - Suggest resolution
        - Rate severity (critical/high/medium/low)
        
        Return as JSON array of inconsistencies.
      `;

      const response = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a pharmaceutical regulatory expert specialized in document consistency and quality control. Identify any inconsistencies, conflicts, or gaps in the documentation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 3000,
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.inconsistencies || [];
    } catch (error) {
      console.error('Error detecting inconsistencies:', error);
      throw error;
    }
  }

  /**
   * Analyzes semantic difference between old and new content
   * @private
   */
  async analyzeSema
nticDifference(oldContent, newContent) {
    if (!oldContent || !newContent) {
      return {
        changeType: 'creation',
        severity: 'high',
        requiresPropagation: true,
        complianceImpact: 'review_required'
      };
    }

    const prompt = `
      Analyze the semantic difference between these two versions:
      
      OLD: ${oldContent}
      NEW: ${newContent}
      
      Determine:
      1. Type of change (content/structure/formatting/regulatory)
      2. Severity (critical/high/medium/low)
      3. Whether propagation is required
      4. Compliance impact
      5. Key changes summary
      
      Return as JSON.
    `;

    try {
      const response = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are analyzing pharmaceutical regulatory document changes. Focus on semantic and compliance implications.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
        temperature: 0.1
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error analyzing semantic difference:', error);
      // Fallback analysis
      return {
        changeType: 'unknown',
        severity: 'medium',
        requiresPropagation: true,
        complianceImpact: 'review_required'
      };
    }
  }

  /**
   * Get all documents linked to a section
   * @private
   */
  async getLinkedDocuments(sectionId) {
    try {
      return await db
        .select({
          leafId: sectionLinks.leafId,
          documentId: leaves.leafId,
          ctdPath: leaves.ctdPath,
          status: leaves.status,
          metadata: sectionLinks.metadata
        })
        .from(sectionLinks)
        .leftJoin(leaves, eq(sectionLinks.leafId, leaves.leafId))
        .where(
          and(
            eq(sectionLinks.sectionId, sectionId),
            eq(sectionLinks.isActive, true)
          )
        );
    } catch (error) {
      console.error('Error getting linked documents:', error);
      return [];
    }
  }

  /**
   * Analyzes impact on a specific document
   * @private
   */
  async analyzeDocumentImpact(document, semanticAnalysis) {
    const { ctdPath, status } = document;
    
    // Determine impact based on document type and status
    let severity = semanticAnalysis.severity;
    let regulatoryRisk = 'low';
    
    // Higher impact for approved documents
    if (status === 'approved' || status === 'published') {
      severity = this.escalateSeverity(severity);
      regulatoryRisk = 'high';
    }
    
    // Critical paths require special attention
    const criticalPaths = [
      '/m1/', // Administrative
      '/m2/23-drug-substance/', // Drug substance
      '/m2/25-drug-product/', // Drug product
      '/m3/32-body-of-data/', // Nonclinical
      '/m5/53-clinical-study-reports/' // Clinical
    ];
    
    if (criticalPaths.some(path => ctdPath.includes(path))) {
      regulatoryRisk = 'critical';
    }
    
    return {
      severity,
      regulatoryRisk,
      actions: this.determineRequiredActions(semanticAnalysis.changeType, status)
    };
  }

  /**
   * Find related sections in a project
   * @private
   */
  async findRelatedSections(sectionId, projectId) {
    try {
      // Get the current section
      const currentSection = await db
        .select()
        .from(sections)
        .where(eq(sections.sectionId, sectionId))
        .limit(1);
      
      if (!currentSection[0]) return [];
      
      // Find sections with similar titles or in same category
      const relatedSections = await db
        .select({
          sectionId: sections.sectionId,
          title: sections.title,
          content: sql`SUBSTRING(${sections.content}, 1, 200)` // First 200 chars
        })
        .from(sections)
        .where(
          and(
            eq(sections.projectId, projectId),
            sql`${sections.sectionId} != ${sectionId}`
          )
        )
        .limit(10);
      
      return relatedSections;
    } catch (error) {
      console.error('Error finding related sections:', error);
      return [];
    }
  }

  /**
   * Enrich AI suggestions with database information
   * @private
   */
  async enrichSuggestions(suggestions) {
    const enrichedSuggestions = [];
    
    for (const suggestion of suggestions) {
      if (suggestion.sectionId) {
        const sectionData = await db
          .select()
          .from(sections)
          .where(eq(sections.sectionId, suggestion.sectionId))
          .limit(1);
        
        if (sectionData[0]) {
          enrichedSuggestions.push({
            ...suggestion,
            sectionTitle: sectionData[0].title,
            currentVersion: sectionData[0].version,
            lastModified: sectionData[0].updatedAt
          });
        } else {
          enrichedSuggestions.push(suggestion);
        }
      } else {
        enrichedSuggestions.push(suggestion);
      }
    }
    
    return enrichedSuggestions;
  }

  /**
   * Generate suggested actions based on analysis
   * @private
   */
  async generateSuggestedActions(semanticAnalysis, affectedDocuments) {
    const actions = [];
    
    // High priority actions for critical changes
    if (semanticAnalysis.severity === 'critical' || semanticAnalysis.severity === 'high') {
      actions.push({
        type: 'review',
        priority: 'immediate',
        description: 'Immediate regulatory review required',
        assignTo: 'regulatory_team'
      });
    }
    
    // Document update actions
    const highPriorityDocs = affectedDocuments.filter(d => d.updatePriority === 'high');
    if (highPriorityDocs.length > 0) {
      actions.push({
        type: 'propagate',
        priority: 'high',
        description: `Update ${highPriorityDocs.length} approved documents`,
        documents: highPriorityDocs.map(d => d.documentId)
      });
    }
    
    // Compliance checks
    if (semanticAnalysis.complianceImpact !== 'none') {
      actions.push({
        type: 'compliance_check',
        priority: 'medium',
        description: 'Verify compliance with regulatory guidelines',
        guidelines: ['FDA 21 CFR', 'ICH Q8', 'EMA Guidelines']
      });
    }
    
    return actions;
  }

  /**
   * Determine required actions based on change type and document status
   * @private
   */
  determineRequiredActions(changeType, documentStatus) {
    const actions = [];
    
    switch (changeType) {
      case 'regulatory':
      case 'content':
        actions.push('update_content');
        if (documentStatus === 'approved') {
          actions.push('regulatory_review');
          actions.push('version_increment');
        }
        break;
      case 'structure':
        actions.push('restructure_section');
        actions.push('validate_references');
        break;
      case 'formatting':
        actions.push('apply_formatting');
        break;
      default:
        actions.push('manual_review');
    }
    
    return actions;
  }

  /**
   * Escalate severity level
   * @private
   */
  escalateSeverity(severity) {
    const severityLevels = {
      'low': 'medium',
      'medium': 'high',
      'high': 'critical',
      'critical': 'critical'
    };
    return severityLevels[severity] || severity;
  }

  /**
   * Generate sync recommendations using AI
   * @param {string} sectionId - Section being modified
   * @param {Object} change - The proposed change
   * @returns {Array} AI-generated sync recommendations
   */
  async generateSyncRecommendations(sectionId, change) {
    try {
      const linkedDocs = await this.getLinkedDocuments(sectionId);
      
      const prompt = `
        A pharmaceutical regulatory section is being updated. Generate smart synchronization recommendations.
        
        Change: ${JSON.stringify(change)}
        Linked Documents: ${JSON.stringify(linkedDocs.map(d => ({
          path: d.ctdPath,
          status: d.status
        })))}
        
        For each linked document, recommend:
        1. Whether to auto-sync or require review
        2. Specific adaptations needed for that document context
        3. Regulatory considerations
        4. Priority level
        
        Return as JSON array of recommendations.
      `;

      const response = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in pharmaceutical regulatory documentation. Provide intelligent recommendations for cross-document synchronization.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.recommendations || [];
    } catch (error) {
      console.error('Error generating sync recommendations:', error);
      throw error;
    }
  }
}

export default new AIImpactAnalysisService();