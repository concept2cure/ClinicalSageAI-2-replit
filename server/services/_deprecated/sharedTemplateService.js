/**
 * SharedTemplateService
 * Single source of truth for all 388 templates across IND Wizard and eCTD Co-Author
 * Manages template registry, variables, and content locking
 */

const { db } = require('../db');
const OpenAI = require('openai');
const crypto = require('crypto');

class SharedTemplateService {
  constructor() {
    // Initialize OpenAI for AI enhancements
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    
    // Template registry with module ownership
    this.templateRegistry = {
      enabledInWizard: [],
      enabledInCoAuthor: [],
      moduleOwnership: {}
    };
    
    // Variable scopes
    this.variableScopes = {
      GLOBAL: 'global',
      REGION: 'region',
      MODULE: 'module',
      DOCUMENT: 'document'
    };
    
    // Content locks
    this.contentLocks = new Map();
    
    // Initialize registry
    this.initializeRegistry();
  }
  
  /**
   * Initialize template registry with module ownership
   */
  async initializeRegistry() {
    // Module ownership mapping
    this.moduleOwnership = {
      'form-1571': { primary: 'wizard', secondary: null },
      'form-1572': { primary: 'wizard', secondary: null },
      'form-3674': { primary: 'wizard', secondary: null },
      'pre-ind-meeting': { primary: 'wizard', secondary: 'coauthor' },
      'ind-annual-report': { primary: 'both', secondary: null },
      'safety-report-cover': { primary: 'wizard', secondary: null },
      'ctis-part-i': { primary: 'coauthor', secondary: null },
      'ctis-part-ii': { primary: 'wizard', secondary: null },
      'impd-quality': { primary: 'coauthor', secondary: null },
      'qp-declaration': { primary: 'wizard', secondary: null },
      'end-trial-notification': { primary: 'both', secondary: null },
      'ich-m2-summary': { primary: 'coauthor', secondary: 'wizard' },
      'protocol-template': { primary: 'coauthor', secondary: 'wizard' },
      'icf-template': { primary: 'wizard', secondary: 'coauthor' }
    };
  }
  
  /**
   * Get all templates with filtering options
   */
  async getAllTemplates(options = {}) {
    const {
      organizationId = 6,
      enabledInWizard = null,
      enabledInCoAuthor = null,
      agency = null,
      module = null,
      category = null
    } = options;
    
    try {
      let query = `
        SELECT * FROM ectd_templates 
        WHERE organization_id = $1 
        AND is_active = true
      `;
      
      const params = [organizationId];
      let paramIndex = 2;
      
      if (module) {
        query += ` AND module_number LIKE $${paramIndex}`;
        params.push(`${module}%`);
        paramIndex++;
      }
      
      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      if (agency) {
        query += ` AND $${paramIndex} = ANY(tags)`;
        params.push(agency.toLowerCase());
        paramIndex++;
      }
      
      query += ` ORDER BY module_number, template_name`;
      
      const result = await db.execute(query, params);
      const templates = result.rows || [];
      
      // Apply module ownership filtering
      let filteredTemplates = templates.map(template => {
        const ownership = this.moduleOwnership[template.granule_id] || { primary: 'both' };
        
        return {
          ...template,
          enabledInWizard: ownership.primary === 'wizard' || ownership.primary === 'both',
          enabledInCoAuthor: ownership.primary === 'coauthor' || ownership.primary === 'both',
          primaryOwner: ownership.primary,
          secondaryOwner: ownership.secondary
        };
      });
      
      // Filter by module enablement
      if (enabledInWizard !== null) {
        filteredTemplates = filteredTemplates.filter(t => t.enabledInWizard === enabledInWizard);
      }
      
      if (enabledInCoAuthor !== null) {
        filteredTemplates = filteredTemplates.filter(t => t.enabledInCoAuthor === enabledInCoAuthor);
      }
      
      return filteredTemplates;
    } catch (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }
  }
  
  /**
   * Get templates grouped by agency
   */
  async getTemplatesByAgency(organizationId = 6) {
    const allTemplates = await this.getAllTemplates({ organizationId });
    
    const grouped = {
      FDA: { count: 0, templates: [] },
      EMA: { count: 0, templates: [] },
      PMDA: { count: 0, templates: [] },
      ICH: { count: 0, templates: [] },
      Therapeutic: { count: 0, templates: [] },
      Other: { count: 0, templates: [] }
    };
    
    allTemplates.forEach(template => {
      const tags = template.tags || [];
      
      if (tags.includes('fda')) {
        grouped.FDA.templates.push(template);
        grouped.FDA.count++;
      } else if (tags.includes('ema') || tags.includes('ctis')) {
        grouped.EMA.templates.push(template);
        grouped.EMA.count++;
      } else if (tags.includes('pmda') || tags.includes('ctn')) {
        grouped.PMDA.templates.push(template);
        grouped.PMDA.count++;
      } else if (tags.includes('ich')) {
        grouped.ICH.templates.push(template);
        grouped.ICH.count++;
      } else if (tags.includes('therapeutic') || tags.includes('oncology') || tags.includes('cardiovascular')) {
        grouped.Therapeutic.templates.push(template);
        grouped.Therapeutic.count++;
      } else {
        grouped.Other.templates.push(template);
        grouped.Other.count++;
      }
    });
    
    return grouped;
  }
  
  /**
   * Get a single template by ID
   */
  async getTemplateById(templateId) {
    try {
      const query = `SELECT * FROM ectd_templates WHERE id = $1 AND is_active = true`;
      const result = await db.execute(query, [templateId]);
      
      if (!result.rows || result.rows.length === 0) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      const template = result.rows[0];
      const ownership = this.moduleOwnership[template.granule_id] || { primary: 'both' };
      
      return {
        ...template,
        enabledInWizard: ownership.primary === 'wizard' || ownership.primary === 'both',
        enabledInCoAuthor: ownership.primary === 'coauthor' || ownership.primary === 'both',
        primaryOwner: ownership.primary,
        secondaryOwner: ownership.secondary
      };
    } catch (error) {
      console.error('Error fetching template by ID:', error);
      throw error;
    }
  }
  
  /**
   * Variable Management System
   */
  
  /**
   * Get variables by scope
   */
  async getVariablesByScope(scope, contextId = null) {
    const variables = {
      // Global variables (apply to all templates)
      global: {
        'submission_date': new Date().toISOString().split('T')[0],
        'current_year': new Date().getFullYear(),
        'protocol_version': '1.0',
        'company_name': 'Pharmaceutical Company',
        'regulatory_contact_email': 'regulatory@company.com'
      },
      
      // Region-specific variables
      region: {
        US: {
          'fda_division': 'Division of Oncology',
          'fda_contact': 'FDA CDER',
          'us_agent': 'US Regulatory Agent LLC',
          'duns_number': '123456789',
          'fei_number': '3001234567'
        },
        EU: {
          'ema_contact': 'EMA Scientific Advice',
          'eu_qppv': 'EU QPPV Name',
          'eudamed_number': 'EU-123456',
          'reference_member_state': 'Germany'
        },
        JP: {
          'pmda_division': 'First Evaluation Division',
          'jp_mar': 'Japan MAR Company',
          'jctn_number': 'JapanCT-123456'
        }
      },
      
      // Module-specific variables
      module: {
        m1: {
          'application_type': 'Initial IND',
          'submission_type': 'Original Application',
          'submission_number': '0001'
        },
        m2: {
          'product_name': 'Study Drug ABC',
          'inn_name': 'drugnameicin',
          'dosage_form': 'Tablet',
          'strength': '50 mg'
        },
        m3: {
          'drug_substance_name': 'Active Pharmaceutical Ingredient',
          'manufacturer_name': 'API Manufacturer Inc',
          'batch_formula': 'Per 1000 kg batch',
          'storage_conditions': '2-8°C, protected from light'
        },
        m4: {
          'species_tested': 'Rat, Dog, Monkey',
          'glp_compliance': 'Yes',
          'noael_value': '100 mg/kg'
        },
        m5: {
          'protocol_number': 'STUDY-001',
          'study_phase': 'Phase 1/2',
          'patient_population': 'Advanced Cancer Patients',
          'primary_endpoint': 'Progression-Free Survival'
        }
      },
      
      // Document-specific variables (these would be stored in DB)
      document: contextId ? await this.getDocumentVariables(contextId) : {}
    };
    
    // Return variables for requested scope
    if (scope === 'all') {
      return variables;
    }
    
    return variables[scope] || {};
  }
  
  /**
   * Get document-specific variables
   */
  async getDocumentVariables(documentId) {
    // In a real implementation, fetch from database
    return {
      'document_version': '1.0',
      'document_date': new Date().toISOString().split('T')[0],
      'author_name': 'Document Author',
      'reviewer_name': 'Document Reviewer'
    };
  }
  
  /**
   * Apply variables to template content
   */
  async applyVariables(content, variables) {
    if (!content) return content;
    
    let processedContent = content;
    
    // Merge all variable scopes
    const allVariables = {
      ...variables.global,
      ...variables.region,
      ...variables.module,
      ...variables.document,
      ...variables.custom
    };
    
    // Replace all placeholders
    const placeholderRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    processedContent = processedContent.replace(placeholderRegex, (match, key) => {
      // Handle nested keys like product.dp.strength_mg
      const keys = key.split('.');
      let value = allVariables;
      
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          break;
        }
      }
      
      if (value !== undefined && value !== null) {
        return value;
      }
      
      // Try snake_case version
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allVariables[snakeKey]) {
        return allVariables[snakeKey];
      }
      
      // Return placeholder if no value found
      return match;
    });
    
    return processedContent;
  }
  
  /**
   * Instantiate a template with variables
   */
  async instantiateTemplate(templateId, variables = {}, options = {}) {
    try {
      const template = await this.getTemplateById(templateId);
      
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      // Get all variable scopes
      const scopedVariables = {
        global: await this.getVariablesByScope('global'),
        region: variables.region ? await this.getVariablesByScope('region')[variables.region] : {},
        module: await this.getVariablesByScope('module')[template.module_number?.charAt(1)] || {},
        document: variables.documentId ? await this.getDocumentVariables(variables.documentId) : {},
        custom: variables.custom || {}
      };
      
      // Apply variables to content
      let content = await this.applyVariables(template.content, scopedVariables);
      
      // AI Enhancement if requested
      if (options.aiEnhance && this.openai) {
        content = await this.enhanceWithAI(content, template, scopedVariables);
      }
      
      // Create document instance
      const documentInstance = {
        templateId: template.id,
        templateName: template.template_name,
        granuleId: template.granule_id,
        moduleNumber: template.module_number,
        category: template.category,
        content: content,
        variables: scopedVariables,
        metadata: {
          instantiatedAt: new Date().toISOString(),
          instantiatedBy: options.userId || 'system',
          aiEnhanced: options.aiEnhance || false,
          version: template.version
        }
      };
      
      // Store in database if requested
      if (options.saveToDatabase) {
        documentInstance.id = await this.saveDocumentInstance(documentInstance);
      }
      
      return documentInstance;
    } catch (error) {
      console.error('Error instantiating template:', error);
      throw error;
    }
  }
  
  /**
   * Content Lock Service
   */
  
  /**
   * Create a content lock for a document
   */
  async createContentLock(documentId, content) {
    try {
      // Generate hash of content
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      const lock = {
        documentId,
        contentHash,
        lockedAt: new Date().toISOString(),
        lockedBy: 'system',
        status: 'locked'
      };
      
      // Store lock
      this.contentLocks.set(documentId, lock);
      
      // In production, save to database
      await this.saveContentLock(lock);
      
      return lock;
    } catch (error) {
      console.error('Error creating content lock:', error);
      throw error;
    }
  }
  
  /**
   * Verify content against lock
   */
  async verifyContentLock(documentId, content) {
    const lock = this.contentLocks.get(documentId);
    
    if (!lock) {
      return { valid: false, reason: 'No lock found' };
    }
    
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    
    if (contentHash === lock.contentHash) {
      return { valid: true, lock };
    } else {
      return { valid: false, reason: 'Content has been modified', lock };
    }
  }
  
  /**
   * AI Enhancement
   */
  
  /**
   * Enhance template content with AI
   */
  async enhanceWithAI(content, template, variables) {
    if (!this.openai) {
      return content;
    }
    
    try {
      const prompt = `You are a regulatory writing expert. Enhance the following ${template.template_name} content while maintaining regulatory compliance and accuracy. 

Template Type: ${template.category}
Module: ${template.module_number}

Current Content:
${content}

Requirements:
1. Maintain all variable placeholders that haven't been filled
2. Enhance language for clarity and regulatory compliance
3. Ensure consistency with ${template.tags?.join(', ')} requirements
4. Keep the same structure and format
5. Do not add information that isn't supported by the template

Enhanced content:`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a regulatory documentation expert specializing in pharmaceutical submissions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });
      
      return response.choices[0].message.content || content;
    } catch (error) {
      console.error('AI enhancement failed:', error);
      return content; // Return original content if AI fails
    }
  }
  
  /**
   * Database Operations
   */
  
  /**
   * Save document instance to database
   */
  async saveDocumentInstance(documentInstance) {
    try {
      const query = `
        INSERT INTO ind_documents (
          template_id,
          ind_application_id,
          document_name,
          content,
          variables,
          metadata,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;
      
      const params = [
        documentInstance.templateId,
        documentInstance.indApplicationId || null,
        documentInstance.templateName,
        documentInstance.content,
        JSON.stringify(documentInstance.variables),
        JSON.stringify(documentInstance.metadata),
        'draft',
        new Date()
      ];
      
      const result = await db.execute(query, params);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error saving document instance:', error);
      throw error;
    }
  }
  
  /**
   * Save content lock to database
   */
  async saveContentLock(lock) {
    try {
      const query = `
        INSERT INTO content_locks (
          document_id,
          content_hash,
          locked_at,
          locked_by,
          status
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (document_id) 
        DO UPDATE SET 
          content_hash = $2,
          locked_at = $3,
          locked_by = $4,
          status = $5
      `;
      
      const params = [
        lock.documentId,
        lock.contentHash,
        lock.lockedAt,
        lock.lockedBy,
        lock.status
      ];
      
      await db.execute(query, params);
    } catch (error) {
      console.error('Error saving content lock:', error);
      // Don't throw, as this is a non-critical operation
    }
  }
  
  /**
   * Template Statistics
   */
  
  /**
   * Get template usage statistics
   */
  async getTemplateStatistics(organizationId = 6) {
    const templates = await this.getAllTemplates({ organizationId });
    
    const stats = {
      total: templates.length,
      byModule: {},
      byCategory: {},
      byAgency: {
        FDA: 0,
        EMA: 0,
        PMDA: 0,
        ICH: 0,
        Therapeutic: 0
      },
      enabledInWizard: 0,
      enabledInCoAuthor: 0,
      sharedBetweenModules: 0
    };
    
    templates.forEach(template => {
      // Count by module
      const module = template.module_number?.split('.')[0] || 'other';
      stats.byModule[module] = (stats.byModule[module] || 0) + 1;
      
      // Count by category
      stats.byCategory[template.category] = (stats.byCategory[template.category] || 0) + 1;
      
      // Count by agency
      const tags = template.tags || [];
      if (tags.includes('fda')) stats.byAgency.FDA++;
      if (tags.includes('ema')) stats.byAgency.EMA++;
      if (tags.includes('pmda')) stats.byAgency.PMDA++;
      if (tags.includes('ich')) stats.byAgency.ICH++;
      if (tags.includes('therapeutic')) stats.byAgency.Therapeutic++;
      
      // Count by module enablement
      if (template.enabledInWizard) stats.enabledInWizard++;
      if (template.enabledInCoAuthor) stats.enabledInCoAuthor++;
      if (template.enabledInWizard && template.enabledInCoAuthor) {
        stats.sharedBetweenModules++;
      }
    });
    
    return stats;
  }
}

// Export singleton instance
const sharedTemplateService = new SharedTemplateService();
module.exports = sharedTemplateService;