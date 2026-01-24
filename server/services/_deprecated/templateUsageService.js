import { db } from '../db/index.js';
import { ectdTemplates, indDocuments, indApplications } from '../../shared/schema.ts';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import factsService from './factsService.js';

/**
 * Template Usage Service
 * Handles template instantiation, document generation, and AI enhancement
 */
class TemplateUsageService {
  constructor() {
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn('OpenAI API key not configured - AI features will be limited');
    }
  }

  /**
   * Fetch templates by category and agency
   */
  async getTemplatesByCategory(organizationId, category, agency) {
    try {
      const conditions = [
        eq(ectdTemplates.organizationId, organizationId),
        eq(ectdTemplates.isActive, true)
      ];
      
      if (category) {
        conditions.push(eq(ectdTemplates.category, category));
      }
      
      // Filter by agency tags
      if (agency) {
        const templates = await db
          .select()
          .from(ectdTemplates)
          .where(and(...conditions));
        
        // Filter by agency tag
        return templates.filter(t => 
          t.tags && t.tags.includes(agency.toLowerCase())
        );
      }
      
      return await db
        .select()
        .from(ectdTemplates)
        .where(and(...conditions))
        .orderBy(ectdTemplates.moduleNumber, ectdTemplates.templateName);
    } catch (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }
  }

  /**
   * Get all templates for an IND application
   */
  async getTemplatesForIND(indId, organizationId) {
    try {
      // Get IND application data
      const indApp = await db
        .select()
        .from(indApplications)
        .where(eq(indApplications.id, indId))
        .limit(1);
      
      if (!indApp || indApp.length === 0) {
        throw new Error('IND application not found');
      }
      
      // Get templates based on IND phase and type
      const phase = indApp[0].phase || 'Phase 1';
      const isInitialIND = indApp[0].submissionType === 'initial';
      
      // Get appropriate templates
      const templates = await this.getTemplatesByCategory(organizationId);
      
      // Categorize templates by module
      const categorizedTemplates = {
        module1: [], // Administrative
        module2: [], // Summaries
        module3: [], // Quality (CMC)
        module4: [], // Nonclinical
        module5: []  // Clinical
      };
      
      templates.forEach(template => {
        const moduleNum = template.moduleNumber;
        if (moduleNum) {
          if (moduleNum.startsWith('1')) {
            categorizedTemplates.module1.push(template);
          } else if (moduleNum.startsWith('2')) {
            categorizedTemplates.module2.push(template);
          } else if (moduleNum.startsWith('3')) {
            categorizedTemplates.module3.push(template);
          } else if (moduleNum.startsWith('4')) {
            categorizedTemplates.module4.push(template);
          } else if (moduleNum.startsWith('5')) {
            categorizedTemplates.module5.push(template);
          }
        }
      });
      
      // Return recommended templates based on submission type
      const recommended = [];
      
      if (isInitialIND) {
        // For initial IND, recommend all key templates
        recommended.push(...categorizedTemplates.module1.filter(t => 
          t.templateName.includes('Form 1571') || t.templateName.includes('Form 1572')
        ));
        recommended.push(...categorizedTemplates.module3.filter(t => 
          t.templateName.includes('Drug Substance') || t.templateName.includes('Drug Product')
        ));
        recommended.push(...categorizedTemplates.module4.slice(0, 2));
        recommended.push(...categorizedTemplates.module5.filter(t => 
          t.templateName.includes('Protocol')
        ));
      }
      
      return {
        all: templates,
        categorized: categorizedTemplates,
        recommended: recommended
      };
    } catch (error) {
      console.error('Error getting templates for IND:', error);
      throw error;
    }
  }

  /**
   * Instantiate a template with IND data and Facts
   */
  async instantiateTemplate(templateId, indData, additionalData = {}) {
    try {
      console.log('[DEBUG] instantiateTemplate called with templateId:', templateId, 'Type:', typeof templateId);
      // Validate templateId before using in database query
      const validTemplateId = parseInt(templateId);
      console.log('[DEBUG] validTemplateId in instantiateTemplate:', validTemplateId, 'isNaN:', isNaN(validTemplateId));
      if (isNaN(validTemplateId)) {
        console.error('Invalid templateId in instantiateTemplate:', templateId);
        throw new Error(`Invalid templateId provided to instantiateTemplate: ${templateId}`);
      }
      
      // Get the template
      const template = await db
        .select()
        .from(ectdTemplates)
        .where(eq(ectdTemplates.id, validTemplateId))
        .limit(1);
      
      if (!template || template.length === 0) {
        throw new Error('Template not found');
      }
      
      const tmpl = template[0];
      const originalContent = tmpl.content;
      let content = originalContent;
      
      // Get Facts for this IND application
      const facts = factsService.getFactsForIND(indData);
      
      // Merge all data sources (Facts take priority)
      const allData = {
        ...additionalData,
        ...indData,
        ...facts,
        // Ensure key fields are always present
        submission_date: new Date().toISOString().split('T')[0],
        protocol_version: '1.0',
        protocol_date: new Date().toISOString().split('T')[0]
      };
      
      // Track citations for replaced placeholders
      const citations = [];
      const placeholders = [];
      
      // Replace placeholders with actual data and track citations
      const placeholderRegex = /\{\{(\w+)\}\}/g;
      content = content.replace(placeholderRegex, (match, key) => {
        // Convert camelCase to snake_case for matching
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        
        // Try different key formats
        const value = allData[key] || allData[snakeKey] || allData[key.toLowerCase()];
        
        placeholders.push({
          key: key,
          original: match,
          replaced: value !== undefined && value !== null
        });
        
        if (value !== undefined && value !== null) {
          // Create citation for this replacement
          const citation = factsService.createCitation(key, value);
          citations.push(citation);
          return value;
        }
        
        // If no data found, use intelligent default
        const defaultValue = this.getIntelligentDefault(key);
        if (defaultValue) {
          citations.push({
            fact_key: key,
            fact_value: defaultValue,
            source_uri: 'defaults://' + key,
            confidence: 0.5,
            last_updated: new Date().toISOString()
          });
          return defaultValue;
        }
        
        // Return placeholder if no data found
        return match;
      });
      
      // Generate LeafPatch for tracked changes
      const leafPatch = factsService.generateLeafPatch(originalContent, content, citations);
      
      // If OpenAI is available, enhance the content
      if (this.openai) {
        const enhancedResult = await this.enhanceWithAI(content, tmpl, allData);
        if (typeof enhancedResult === 'string') {
          content = enhancedResult;
        } else if (enhancedResult && enhancedResult.content) {
          content = enhancedResult.content;
          // Add AI-generated sections to patch
          if (enhancedResult.additions) {
            leafPatch.changes.push(...enhancedResult.additions.map(addition => ({
              type: 'insert',
              position: addition.position,
              content: addition.content,
              tracked: true,
              author: 'ai',
              reason: 'AI enhancement',
              confidence: addition.confidence || 0.8
            })));
          }
        }
      }
      
      // Create DocumentDescriptor
      const documentDescriptor = {
        leaf_id: this.generateLeafId(tmpl.moduleNumber),
        ctd_path: this.extractCtdPath(tmpl.moduleNumber),
        template_id: validTemplateId,
        template_name: tmpl.templateName,
        placeholders: placeholders,
        facts_used: Object.keys(facts).filter(key => facts[key] !== null && facts[key] !== undefined),
        module: tmpl.moduleNumber,
        category: tmpl.category
      };
      
      return {
        documentDescriptor,
        content: content,
        leafPatch: leafPatch,
        citations: citations,
        metadata: {
          module: tmpl.moduleNumber,
          category: tmpl.category,
          instantiatedAt: new Date().toISOString(),
          dataKeys: Object.keys(allData),
          factsApplied: citations.length,
          trackingEnabled: true
        }
      };
    } catch (error) {
      console.error('Error instantiating template:', error);
      throw error;
    }
  }
  
  /**
   * Generate a unique leaf ID for CTD structure
   */
  generateLeafId(moduleNumber) {
    if (!moduleNumber) return `leaf_${Date.now()}`;
    // Convert module number like "3.2.P.5" to leaf ID like "m3.2.P.5-1"
    const prefix = moduleNumber.startsWith('m') ? moduleNumber : 'm' + moduleNumber;
    return `${prefix}-${Date.now().toString(36)}`;
  }
  
  /**
   * Extract CTD path from module number
   */
  extractCtdPath(moduleNumber) {
    if (!moduleNumber) return 'unknown';
    // Remove 'm' prefix if present
    const cleanNumber = moduleNumber.startsWith('m') ? moduleNumber.substring(1) : moduleNumber;
    // Return the path portion (e.g., "3.2.P.5" from "m3.2.P.5")
    return cleanNumber;
  }
  
  /**
   * Get intelligent default value for a placeholder key
   */
  getIntelligentDefault(key) {
    const defaults = {
      sponsor_name: 'Sponsor Name (To be provided)',
      sponsor_address: 'Sponsor Address (To be provided)',
      drug_name: 'Investigational Product',
      indication: 'Target Indication',
      phase: 'Phase 1',
      protocol_number: 'PROTO-001',
      investigator_name: 'Principal Investigator (To be determined)',
      site_name: 'Clinical Site (To be determined)',
      submission_date: new Date().toISOString().split('T')[0],
      version: '1.0',
      page_number: '1'
    };
    
    // Try exact match first
    if (defaults[key]) return defaults[key];
    
    // Try snake_case version
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (defaults[snakeKey]) return defaults[snakeKey];
    
    // Try to infer from key name
    if (key.includes('date') || key.includes('Date')) {
      return new Date().toISOString().split('T')[0];
    }
    if (key.includes('number') || key.includes('Number')) {
      return 'TBD-001';
    }
    if (key.includes('name') || key.includes('Name')) {
      return 'To be determined';
    }
    
    return null;
  }

  /**
   * Enhance template content with AI
   */
  async enhanceWithAI(content, template, data) {
    try {
      if (!this.openai) {
        return { content, additions: [] };
      }
      
      // Identify sections that need AI enhancement (marked with placeholders still)
      const unfilledPlaceholders = content.match(/\{\{(\w+)\}\}/g);
      
      if (!unfilledPlaceholders || unfilledPlaceholders.length === 0) {
        // No placeholders to fill, but we can still enhance the content
        return await this.improveScientificWriting(content, template, data);
      }
      
      // Create a prompt for AI to fill in the placeholders
      const prompt = this.createEnhancementPrompt(content, template, data, unfilledPlaceholders);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a regulatory affairs expert specializing in ${template.category} documentation for pharmaceutical submissions. 
            Your task is to enhance regulatory documents with scientifically accurate, compliant content that meets FDA/EMA/PMDA requirements.
            Maintain the original structure and format of the template while filling in missing information and improving the scientific writing.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });
      
      return completion.choices[0].message.content || content;
    } catch (error) {
      console.error('Error enhancing with AI:', error);
      // Return original content if AI enhancement fails
      return content;
    }
  }

  /**
   * Improve scientific writing of the content
   */
  async improveScientificWriting(content, template, data) {
    try {
      if (!this.openai) {
        return content;
      }
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a regulatory medical writer specializing in ${template.category} documentation.
            Improve the scientific writing while maintaining regulatory compliance and the original structure.
            Focus on clarity, precision, and regulatory appropriateness.`
          },
          {
            role: "user",
            content: `Improve the scientific writing of this ${template.templateName} document while maintaining its structure:
            
            Context:
            - Drug: ${data.drug_name || data.drugName || 'Investigational Product'}
            - Indication: ${data.indication || 'Under Investigation'}
            - Phase: ${data.phase || 'Phase 1'}
            
            Document to improve:
            ${content}
            
            Requirements:
            1. Maintain all section headers and structure
            2. Improve scientific terminology and clarity
            3. Ensure regulatory compliance
            4. Keep placeholders that couldn't be filled
            5. Add appropriate scientific justifications where needed`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });
      
      return completion.choices[0].message.content || content;
    } catch (error) {
      console.error('Error improving scientific writing:', error);
      return content;
    }
  }

  /**
   * Create enhancement prompt for AI
   */
  createEnhancementPrompt(content, template, data, placeholders) {
    const placeholderList = placeholders.map(p => p.replace(/\{\{|\}\}/g, '')).join(', ');
    
    return `Please enhance this ${template.templateName} document by filling in the missing placeholders and improving the scientific writing.
    
    Template Module: ${template.moduleNumber}
    Category: ${template.category}
    Agency Requirements: ${template.tags ? template.tags.join(', ') : 'FDA'}
    
    Available Data:
    ${JSON.stringify(data, null, 2)}
    
    Document with placeholders to fill:
    ${content}
    
    Placeholders needing content: ${placeholderList}
    
    Requirements:
    1. Fill all placeholders with scientifically accurate, regulatory-compliant content
    2. Use the available data to create coherent narratives
    3. Add appropriate scientific rationale and justifications
    4. Maintain the document structure and formatting
    5. Ensure content meets regulatory requirements for ${template.tags ? template.tags[0].toUpperCase() : 'FDA'}
    6. If data is not available for a placeholder, create appropriate placeholder text indicating what information is needed
    
    Return the complete enhanced document.`;
  }

  /**
   * Generate a document from a template
   */
  async generateDocument(templateId, indId, organizationId, userData = {}) {
    try {
      console.log('[DEBUG] generateDocument called with:', { templateId, indId, organizationId });
      // Validate templateId immediately
      const validTemplateId = parseInt(templateId);
      console.log('[DEBUG] validTemplateId after parseInt:', validTemplateId, 'isNaN:', isNaN(validTemplateId));
      if (isNaN(validTemplateId)) {
        console.error('Invalid templateId in generateDocument:', templateId);
        throw new Error(`Invalid templateId provided: ${templateId}`);
      }
      
      // Validate indId immediately
      const validIndId = parseInt(indId);
      if (isNaN(validIndId)) {
        console.error('Invalid indId in generateDocument:', indId);
        throw new Error(`Invalid IND ID provided: ${indId}`);
      }
      
      // Try to get IND application data, but handle missing table gracefully
      let indData = null;
      try {
        const indApp = await db
          .select()
          .from(indApplications)
          .where(eq(indApplications.id, validIndId))
          .limit(1);
        
        if (indApp && indApp.length > 0) {
          indData = indApp[0];
        }
      } catch (dbError) {
        console.log('Database query failed, using fallback data:', dbError.message);
        // Create fallback IND data if database query fails
        indData = {
          id: validIndId,
          drugName: userData.drugName || 'Investigational Product',
          indication: userData.indication || 'Under Investigation',
          phase: userData.phase || 'Phase 1',
          sponsor: userData.sponsor || 'Sponsor Organization',
          ...userData
        };
      }
      
      if (!indData) {
        // Create default IND data if nothing found
        indData = {
          id: validIndId,
          drugName: userData.drugName || 'Investigational Product',
          indication: userData.indication || 'Under Investigation',
          phase: userData.phase || 'Phase 1',
          sponsor: userData.sponsor || 'Sponsor Organization',
          ...userData
        };
      }
      
      // Instantiate the template with validated ID
      console.log('[DEBUG] Calling instantiateTemplate with validTemplateId:', validTemplateId);
      const instantiated = await this.instantiateTemplate(validTemplateId, indData, userData);
      
      // Try to save the document to database
      let savedDocument = null;
      const newDocument = {
        indApplicationId: validIndId,
        organizationId: organizationId,
        templateId: validTemplateId,
        title: instantiated.templateName,
        content: instantiated.content,
        documentType: instantiated.metadata.category,
        moduleNumber: instantiated.metadata.module,
        version: '1.0',
        status: 'draft',
        metadata: instantiated.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      try {
        const inserted = await db
          .insert(indDocuments)
          .values(newDocument)
          .returning();
        
        if (inserted && inserted.length > 0) {
          savedDocument = inserted[0];
        }
      } catch (dbError) {
        console.log('Failed to save document to database, using fallback:', dbError.message);
        // Create a mock saved document if database save fails
        savedDocument = {
          id: `DOC_${validTemplateId}_${validIndId}_${Date.now()}`,
          ...newDocument
        };
      }
      
      // Track template usage with validated ID (non-critical)
      try {
        await this.trackTemplateUsage(validTemplateId, validIndId, organizationId);
      } catch (trackError) {
        console.log('Failed to track template usage:', trackError.message);
      }
      
      // Always return a document object
      return savedDocument || {
        id: `DOC_${validTemplateId}_${validIndId}_${Date.now()}`,
        ...newDocument
      };
    } catch (error) {
      console.error('Error generating document:', error);
      throw error;
    }
  }

  /**
   * Track template usage for analytics
   */
  async trackTemplateUsage(templateId, indId, organizationId) {
    try {
      // Ensure templateId is a valid number
      const validTemplateId = parseInt(templateId);
      if (isNaN(validTemplateId)) {
        console.error('Invalid templateId for tracking:', templateId);
        return; // Don't throw - this is not critical
      }
      
      // Increment usage count using proper Drizzle SQL syntax
      // First check if the table and column exist
      try {
        await db
          .update(ectdTemplates)
          .set({ 
            usageCount: sql`COALESCE(usage_count, 0) + 1`,
            updatedAt: new Date()
          })
          .where(eq(ectdTemplates.id, validTemplateId));
      } catch (updateError) {
        // If the update fails (e.g., table doesn't exist), just log it
        console.log('Could not update template usage count:', updateError.message);
      }
      
      // Log usage event (could be extended to a separate usage_logs table)
      console.log('Template usage tracked:', {
        templateId,
        indId,
        organizationId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking template usage:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get generated documents for an IND
   */
  async getDocumentsForIND(indId) {
    try {
      return await db
        .select()
        .from(indDocuments)
        .where(eq(indDocuments.indApplicationId, indId))
        .orderBy(desc(indDocuments.createdAt));
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  }

  /**
   * Approve a generated document
   */
  async approveDocument(documentId, approverId) {
    try {
      const updated = await db
        .update(indDocuments)
        .set({
          status: 'approved',
          approvedBy: approverId,
          approvedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(indDocuments.id, documentId))
        .returning();
      
      return updated[0];
    } catch (error) {
      console.error('Error approving document:', error);
      throw error;
    }
  }

  /**
   * Update document content
   */
  async updateDocument(documentId, content) {
    try {
      const updated = await db
        .update(indDocuments)
        .set({
          content: content,
          version: db.raw("version || '.1'"),
          updatedAt: new Date()
        })
        .where(eq(indDocuments.id, documentId))
        .returning();
      
      return updated[0];
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const templateUsageService = new TemplateUsageService();
export default templateUsageService;