/**
 * Controlled Vocabulary Service
 * 
 * Implements eCTD 4.0 Controlled Vocabulary requirements per mandate Section 2.2
 * Provides enforcement of regulatory metadata governance through standardized terms
 */

import { db } from '../db.js';
import { components } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

class ControlledVocabularyService {
  constructor() {
    // Define eCTD 4.0 controlled vocabularies based on regulatory requirements
    this.vocabularies = {
      // Context of Use (COU) - Primary regulatory categorization
      contextOfUse: {
        clinical: {
          label: 'Clinical',
          description: 'Clinical study reports, protocols, patient data',
          subCategories: ['study-reports', 'protocols', 'patient-safety', 'clinical-summaries']
        },
        quality: {
          label: 'Quality',
          description: 'CMC, manufacturing, specifications, stability',
          subCategories: ['drug-substance', 'drug-product', 'specifications', 'stability', 'manufacturing']
        },
        nonclinical: {
          label: 'Nonclinical',
          description: 'Pharmacology, toxicology, ADME studies',
          subCategories: ['pharmacology', 'toxicology', 'adme', 'safety-pharmacology']
        },
        administrative: {
          label: 'Administrative',
          description: 'Cover letters, forms, correspondence',
          subCategories: ['cover-letters', 'forms', 'correspondence', 'meeting-materials']
        },
        regional: {
          label: 'Regional',
          description: 'Region-specific requirements and documents',
          subCategories: ['fda-specific', 'ema-specific', 'pmda-specific', 'health-canada']
        }
      },

      // Document Types - Standard eCTD document classifications
      documentType: {
        'study-report': 'Clinical Study Report',
        'protocol': 'Clinical Protocol',
        'sap': 'Statistical Analysis Plan',
        'ice': 'Informed Consent Form',
        'crf': 'Case Report Form',
        'specification': 'Product Specification',
        'stability-report': 'Stability Study Report',
        'manufacturing-process': 'Manufacturing Process Description',
        'validation-report': 'Validation Report',
        'cover-letter': 'Cover Letter',
        'form-1571': 'FDA Form 1571',
        'form-356h': 'FDA Form 356h'
      },

      // Lifecycle States - eCTD 4.0 operations
      lifecycleState: {
        'new': 'New submission',
        'replace': 'Replaces previous version',
        'delete': 'Marked for deletion',
        'append': 'Appended to existing',
        'resubmit': 'Resubmission after withdrawal'
      },

      // Module Context - eCTD module structure
      moduleContext: {
        'm1': 'Module 1 - Administrative',
        'm2': 'Module 2 - Summaries',
        'm2.2': 'Module 2.2 - Introduction',
        'm2.3': 'Module 2.3 - Quality Overall Summary',
        'm2.4': 'Module 2.4 - Nonclinical Overview',
        'm2.5': 'Module 2.5 - Clinical Overview',
        'm2.6': 'Module 2.6 - Nonclinical Written and Tabulated Summaries',
        'm2.7': 'Module 2.7 - Clinical Summary',
        'm3': 'Module 3 - Quality',
        'm3.2.s': 'Module 3.2.S - Drug Substance',
        'm3.2.p': 'Module 3.2.P - Drug Product',
        'm4': 'Module 4 - Nonclinical',
        'm5': 'Module 5 - Clinical'
      },

      // Submission Types
      submissionType: {
        'ind': 'Investigational New Drug',
        'nda': 'New Drug Application',
        'anda': 'Abbreviated New Drug Application',
        'bla': 'Biologics License Application',
        'dmf': 'Drug Master File',
        'supplement': 'Supplement',
        'annual-report': 'Annual Report'
      },

      // Regulatory Regions
      regulatoryRegion: {
        'us': 'United States (FDA)',
        'eu': 'European Union (EMA)',
        'jp': 'Japan (PMDA)',
        'ca': 'Canada (Health Canada)',
        'ch': 'China (NMPA)',
        'au': 'Australia (TGA)',
        'global': 'Global Submission'
      },

      // Compliance Status
      complianceStatus: {
        'compliant': 'Fully Compliant',
        'conditional': 'Conditionally Compliant',
        'non-compliant': 'Non-Compliant',
        'under-review': 'Under Review',
        'pending': 'Pending Assessment'
      }
    };
  }

  /**
   * Validate a value against a controlled vocabulary
   */
  validateTerm(vocabularyName, value) {
    const vocabulary = this.vocabularies[vocabularyName];
    if (!vocabulary) {
      return {
        valid: false,
        error: `Unknown vocabulary: ${vocabularyName}`
      };
    }

    // Check if value exists in vocabulary
    if (vocabulary[value] || Object.values(vocabulary).includes(value)) {
      return { valid: true };
    }

    // Check subCategories for contextOfUse
    if (vocabularyName === 'contextOfUse') {
      for (const category of Object.values(vocabulary)) {
        if (category.subCategories?.includes(value)) {
          return { valid: true };
        }
      }
    }

    return {
      valid: false,
      error: `Invalid term '${value}' for vocabulary '${vocabularyName}'`,
      allowedValues: Object.keys(vocabulary)
    };
  }

  /**
   * Get allowed values for a vocabulary
   */
  getVocabulary(vocabularyName) {
    return this.vocabularies[vocabularyName] || null;
  }

  /**
   * Get all vocabularies
   */
  getAllVocabularies() {
    return Object.keys(this.vocabularies).map(name => ({
      name,
      values: this.vocabularies[name]
    }));
  }

  /**
   * Generate Context Group by combining COU with keywords
   * This implements mandate Section 3.2 for accurate eCTD placement
   */
  generateContextGroup(contextOfUse, keywords = [], moduleContext = null) {
    if (!contextOfUse) {
      return null;
    }

    // Start with base COU
    let contextGroup = contextOfUse;

    // Add module context if provided
    if (moduleContext) {
      contextGroup = `${moduleContext}:${contextGroup}`;
    }

    // Add relevant keywords for refined placement
    if (keywords && keywords.length > 0) {
      const relevantKeywords = keywords
        .filter(k => k && k.length > 0)
        .slice(0, 3) // Limit to 3 most relevant keywords
        .join('-');
      if (relevantKeywords) {
        contextGroup = `${contextGroup}:${relevantKeywords}`;
      }
    }

    return contextGroup.toLowerCase();
  }

  /**
   * Suggest Context of Use based on content analysis
   */
  suggestContextOfUse(content, moduleContext = null) {
    if (!content) return null;

    const contentLower = content.toLowerCase();
    
    // Clinical indicators
    if (contentLower.includes('patient') || contentLower.includes('clinical') ||
        contentLower.includes('study') || contentLower.includes('trial') ||
        contentLower.includes('adverse') || contentLower.includes('efficacy')) {
      return 'clinical';
    }

    // Quality indicators
    if (contentLower.includes('specification') || contentLower.includes('manufacturing') ||
        contentLower.includes('stability') || contentLower.includes('impurity') ||
        contentLower.includes('batch') || contentLower.includes('release')) {
      return 'quality';
    }

    // Nonclinical indicators
    if (contentLower.includes('toxicology') || contentLower.includes('pharmacology') ||
        contentLower.includes('animal') || contentLower.includes('in vitro') ||
        contentLower.includes('adme') || contentLower.includes('pk/pd')) {
      return 'nonclinical';
    }

    // Administrative indicators
    if (contentLower.includes('cover letter') || contentLower.includes('form') ||
        contentLower.includes('correspondence') || contentLower.includes('meeting')) {
      return 'administrative';
    }

    // Module-based fallback
    if (moduleContext) {
      if (moduleContext.includes('m1')) return 'administrative';
      if (moduleContext.includes('m3')) return 'quality';
      if (moduleContext.includes('m4')) return 'nonclinical';
      if (moduleContext.includes('m5')) return 'clinical';
    }

    return null;
  }

  /**
   * Apply controlled vocabulary to a component
   */
  async applyVocabularyToComponent(componentId, vocabularyData, organizationId) {
    try {
      // Validate all vocabulary terms
      const validations = [];
      
      if (vocabularyData.contextOfUse) {
        validations.push(this.validateTerm('contextOfUse', vocabularyData.contextOfUse));
      }
      
      if (vocabularyData.lifecycleState) {
        validations.push(this.validateTerm('lifecycleState', vocabularyData.lifecycleState));
      }

      // Check if all validations passed
      const invalidValidation = validations.find(v => !v.valid);
      if (invalidValidation) {
        throw new Error(invalidValidation.error);
      }

      // Generate context group
      const contextGroup = this.generateContextGroup(
        vocabularyData.contextOfUse,
        vocabularyData.keywords,
        vocabularyData.moduleContext
      );

      // Update component with controlled vocabulary
      const updateData = {
        contextOfUse: vocabularyData.contextOfUse,
        contextGroup,
        controlledVocabulary: vocabularyData,
        updatedAt: new Date()
      };

      if (vocabularyData.lifecycleState) {
        updateData.lifecycleState = vocabularyData.lifecycleState;
      }

      await db.update(components)
        .set(updateData)
        .where(and(
          eq(components.id, componentId),
          eq(components.organizationId, organizationId)
        ));

      return {
        success: true,
        contextGroup,
        appliedVocabulary: vocabularyData
      };

    } catch (error) {
      console.error('Error applying vocabulary to component:', error);
      throw error;
    }
  }

  /**
   * Bulk apply controlled vocabulary to multiple components
   */
  async bulkApplyVocabulary(componentIds, vocabularyData, organizationId) {
    const results = [];
    
    for (const componentId of componentIds) {
      try {
        const result = await this.applyVocabularyToComponent(
          componentId,
          vocabularyData,
          organizationId
        );
        results.push({ componentId, ...result });
      } catch (error) {
        results.push({ 
          componentId, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  /**
   * Get vocabulary statistics for an organization
   */
  async getVocabularyStatistics(organizationId) {
    try {
      const componentsData = await db.select()
        .from(components)
        .where(eq(components.organizationId, organizationId));

      const stats = {
        total: componentsData.length,
        withContextOfUse: 0,
        byContextOfUse: {},
        withLifecycleState: 0,
        byLifecycleState: {},
        withControlledVocabulary: 0,
        complianceRate: 0
      };

      componentsData.forEach(component => {
        if (component.contextOfUse) {
          stats.withContextOfUse++;
          stats.byContextOfUse[component.contextOfUse] = 
            (stats.byContextOfUse[component.contextOfUse] || 0) + 1;
        }

        if (component.lifecycleState) {
          stats.withLifecycleState++;
          stats.byLifecycleState[component.lifecycleState] = 
            (stats.byLifecycleState[component.lifecycleState] || 0) + 1;
        }

        if (component.controlledVocabulary) {
          stats.withControlledVocabulary++;
        }
      });

      // Calculate compliance rate
      if (stats.total > 0) {
        stats.complianceRate = Math.round(
          (stats.withControlledVocabulary / stats.total) * 100
        );
      }

      return stats;

    } catch (error) {
      console.error('Error getting vocabulary statistics:', error);
      throw error;
    }
  }
}

// Create singleton instance
const controlledVocabularyService = new ControlledVocabularyService();

export default controlledVocabularyService;
export { ControlledVocabularyService };