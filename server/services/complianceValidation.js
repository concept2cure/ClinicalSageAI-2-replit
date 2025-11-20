import { db } from '../db/index.js';
import { 
  componentVersions,
  coauthorValidationRules,
  coauthorValidationHistory
} from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Real-time Compliance Validation Service
 * Validates components against regulatory requirements
 */

// Compliance rule categories
const COMPLIANCE_CATEGORIES = {
  FDA_21CFR: 'FDA 21 CFR Part 11',
  ICH_E6: 'ICH E6(R3) GCP',
  EMA_CTD: 'EMA CTD Format',
  PMDA: 'PMDA Requirements',
  HEALTH_CANADA: 'Health Canada Guidelines',
  WHO: 'WHO Technical Requirements',
  TGA: 'TGA Submission Standards'
};

// Validation rule types
const RULE_TYPES = {
  STRUCTURE: 'structure',
  CONTENT: 'content',
  FORMAT: 'format',
  TERMINOLOGY: 'terminology',
  CROSS_REFERENCE: 'cross_reference',
  COMPLETENESS: 'completeness'
};

// Initialize WebSocket instance (will be set by server)
let io = null;

// Set WebSocket instance
export function setSocketIO(socketIO) {
  io = socketIO;
}

// Validate component against regulatory rules
export async function validateComponent(componentId, content, type, moduleContext, organizationId) {
  try {
    // Get applicable validation rules
    const rules = await db
      .select()
      .from(coauthorValidationRules)
      .where(and(
        eq(coauthorValidationRules.organizationId, organizationId),
        eq(coauthorValidationRules.isActive, true)
      ));
    
    const validationResults = [];
    let hasErrors = false;
    let hasWarnings = false;
    
    // Apply each rule
    for (const rule of rules) {
      // Check if rule applies to this component type/module
      if (!ruleApplies(rule, type, moduleContext)) {
        continue;
      }
      
      const result = await applyValidationRule(rule, content, type);
      
      if (result.status === 'error') hasErrors = true;
      if (result.status === 'warning') hasWarnings = true;
      
      validationResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        ...result
      });
    }
    
    // Calculate compliance score
    const totalRules = validationResults.length;
    const passedRules = validationResults.filter(r => r.status === 'pass').length;
    const complianceScore = totalRules > 0 ? 
      Math.round((passedRules / totalRules) * 100) : 100;
    
    // Store validation history
    const historyEntry = await db.insert(coauthorValidationHistory).values({
      organizationId,
      documentId: null, // Component-level validation
      componentId,
      validationDate: sql`NOW()`,
      agency: 'MULTI', // Multi-agency validation
      complianceScore,
      errors: validationResults.filter(r => r.status === 'error'),
      warnings: validationResults.filter(r => r.status === 'warning'),
      suggestions: validationResults.filter(r => r.suggestion).map(r => r.suggestion),
      metadata: {
        componentType: type,
        moduleContext,
        rulesApplied: totalRules,
        rulesPassed: passedRules
      }
    }).returning();
    
    // Emit real-time validation event if WebSocket is available
    if (io) {
      io.to(`org-${organizationId}`).emit('component-validation', {
        componentId,
        validationId: historyEntry[0].id,
        complianceScore,
        hasErrors,
        hasWarnings,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      success: true,
      validationId: historyEntry[0].id,
      complianceScore,
      hasErrors,
      hasWarnings,
      results: validationResults,
      summary: {
        total: totalRules,
        passed: passedRules,
        failed: validationResults.filter(r => r.status === 'error').length,
        warnings: validationResults.filter(r => r.status === 'warning').length
      }
    };
    
  } catch (error) {
    console.error('Error validating component:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Check if a rule applies to a component
function ruleApplies(rule, componentType, moduleContext) {
  // Check component type filter
  if (rule.applicableTypes && !rule.applicableTypes.includes(componentType)) {
    return false;
  }
  
  // Check module context filter
  if (rule.applicableModules && moduleContext && 
      !rule.applicableModules.some(m => moduleContext.includes(m))) {
    return false;
  }
  
  return true;
}

// Apply a validation rule to content
async function applyValidationRule(rule, content, type) {
  try {
    const contentStr = typeof content === 'string' ? 
      content : JSON.stringify(content);
    
    switch (rule.type) {
      case RULE_TYPES.STRUCTURE:
        return validateStructure(rule, content, type);
        
      case RULE_TYPES.CONTENT:
        return validateContent(rule, contentStr);
        
      case RULE_TYPES.FORMAT:
        return validateFormat(rule, contentStr);
        
      case RULE_TYPES.TERMINOLOGY:
        return validateTerminology(rule, contentStr);
        
      case RULE_TYPES.COMPLETENESS:
        return validateCompleteness(rule, content);
        
      case RULE_TYPES.CROSS_REFERENCE:
        return validateCrossReferences(rule, content);
        
      default:
        // Custom validation logic
        if (rule.customValidator) {
          return await executeCustomValidator(rule.customValidator, content);
        }
        return { status: 'pass' };
    }
  } catch (error) {
    console.error(`Error applying rule ${rule.name}:`, error);
    return {
      status: 'error',
      message: `Validation error: ${error.message}`,
      suggestion: 'Review the component content and try again'
    };
  }
}

// Validate component structure
function validateStructure(rule, content, type) {
  if (type === 'table' && rule.requirements?.tableStructure) {
    const { headers, minRows, maxRows } = rule.requirements.tableStructure;
    
    if (!content.headers || content.headers.length === 0) {
      return {
        status: 'error',
        message: 'Table must have headers',
        suggestion: 'Add column headers to the table'
      };
    }
    
    if (minRows && content.rows?.length < minRows) {
      return {
        status: 'warning',
        message: `Table should have at least ${minRows} rows`,
        suggestion: `Consider adding more data rows (current: ${content.rows?.length || 0})`
      };
    }
    
    if (maxRows && content.rows?.length > maxRows) {
      return {
        status: 'warning',
        message: `Table has too many rows (max: ${maxRows})`,
        suggestion: 'Consider breaking the table into smaller sections'
      };
    }
  }
  
  return { status: 'pass' };
}

// Validate content requirements
function validateContent(rule, contentStr) {
  const { requiredKeywords, prohibitedTerms, minLength, maxLength } = rule.requirements || {};
  
  // Check required keywords
  if (requiredKeywords && Array.isArray(requiredKeywords)) {
    const missing = requiredKeywords.filter(keyword => 
      !contentStr.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (missing.length > 0) {
      return {
        status: 'error',
        message: `Missing required terms: ${missing.join(', ')}`,
        suggestion: `Include the following terms in the content: ${missing.join(', ')}`
      };
    }
  }
  
  // Check prohibited terms
  if (prohibitedTerms && Array.isArray(prohibitedTerms)) {
    const found = prohibitedTerms.filter(term => 
      contentStr.toLowerCase().includes(term.toLowerCase())
    );
    
    if (found.length > 0) {
      return {
        status: 'warning',
        message: `Contains prohibited terms: ${found.join(', ')}`,
        suggestion: `Remove or replace these terms: ${found.join(', ')}`
      };
    }
  }
  
  // Check content length
  if (minLength && contentStr.length < minLength) {
    return {
      status: 'warning',
      message: `Content is too short (min: ${minLength} characters)`,
      suggestion: 'Provide more detailed information'
    };
  }
  
  if (maxLength && contentStr.length > maxLength) {
    return {
      status: 'warning',
      message: `Content exceeds maximum length (max: ${maxLength} characters)`,
      suggestion: 'Consider being more concise or splitting into sections'
    };
  }
  
  return { status: 'pass' };
}

// Validate format requirements
function validateFormat(rule, contentStr) {
  const { dateFormat, numberFormat, caseRequirement } = rule.requirements || {};
  
  // Check date format (ISO 8601)
  if (dateFormat && contentStr.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/)) {
    const nonISODates = contentStr.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g);
    if (nonISODates) {
      return {
        status: 'warning',
        message: 'Dates should be in ISO 8601 format (YYYY-MM-DD)',
        suggestion: `Convert dates to ISO format: ${nonISODates.join(', ')}`
      };
    }
  }
  
  // Check case requirements
  if (caseRequirement === 'title' && contentStr.length > 0) {
    const isTitle = /^[A-Z]/.test(contentStr);
    if (!isTitle) {
      return {
        status: 'warning',
        message: 'Content should start with a capital letter',
        suggestion: 'Use title case for this component'
      };
    }
  }
  
  return { status: 'pass' };
}

// Validate terminology
function validateTerminology(rule, contentStr) {
  const { controlledVocabulary, synonymReplacements } = rule.requirements || {};
  
  // Check controlled vocabulary
  if (controlledVocabulary && Array.isArray(controlledVocabulary)) {
    const invalidTerms = [];
    
    // This is a simplified check - in production, you'd use NLP
    const words = contentStr.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 3 && !controlledVocabulary.some(term => 
        term.toLowerCase().includes(word) || word.includes(term.toLowerCase())
      )) {
        // Word might not be in controlled vocabulary
        // In production, this would be more sophisticated
      }
    });
  }
  
  // Check for terms that should be replaced
  if (synonymReplacements && typeof synonymReplacements === 'object') {
    const foundSynonyms = Object.keys(synonymReplacements).filter(term =>
      contentStr.toLowerCase().includes(term.toLowerCase())
    );
    
    if (foundSynonyms.length > 0) {
      const suggestions = foundSynonyms.map(term => 
        `Replace "${term}" with "${synonymReplacements[term]}"`
      );
      
      return {
        status: 'warning',
        message: 'Found terms that should be replaced',
        suggestion: suggestions.join('; ')
      };
    }
  }
  
  return { status: 'pass' };
}

// Validate completeness
function validateCompleteness(rule, content) {
  const { requiredFields } = rule.requirements || {};
  
  if (requiredFields && Array.isArray(requiredFields)) {
    const missing = requiredFields.filter(field => {
      if (typeof content === 'object') {
        return !content[field] || 
               (typeof content[field] === 'string' && content[field].trim() === '');
      }
      return false;
    });
    
    if (missing.length > 0) {
      return {
        status: 'error',
        message: `Missing required fields: ${missing.join(', ')}`,
        suggestion: `Complete the following fields: ${missing.join(', ')}`
      };
    }
  }
  
  return { status: 'pass' };
}

// Validate cross-references
function validateCrossReferences(rule, content) {
  // Check if content contains references
  const refPattern = /(?:see |refer to |as described in |detailed in )(?:section|module|appendix|table|figure)\s+[\d.]+/gi;
  
  if (typeof content === 'string') {
    const references = content.match(refPattern);
    
    if (references && references.length > 0) {
      // In production, you'd verify these references actually exist
      return {
        status: 'warning',
        message: `Found ${references.length} cross-reference(s) to verify`,
        suggestion: 'Ensure all referenced sections exist in the document'
      };
    }
  }
  
  return { status: 'pass' };
}

// Execute custom validator (if defined)
async function executeCustomValidator(validatorCode, content) {
  // In production, this would run in a sandboxed environment
  // For now, return pass
  return { status: 'pass' };
}

// Real-time validation stream for document editing
export function startRealtimeValidation(documentId, organizationId, socketId) {
  if (!io) {
    console.warn('WebSocket not initialized for real-time validation');
    return;
  }
  
  // Join document room for real-time updates
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.join(`doc-${documentId}`);
    socket.join(`org-${organizationId}`);
    
    console.log(`Started real-time validation for document ${documentId}`);
  }
}

// Stop real-time validation
export function stopRealtimeValidation(documentId, socketId) {
  if (!io) return;
  
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.leave(`doc-${documentId}`);
    console.log(`Stopped real-time validation for document ${documentId}`);
  }
}

export default {
  setSocketIO,
  validateComponent,
  startRealtimeValidation,
  stopRealtimeValidation,
  COMPLIANCE_CATEGORIES,
  RULE_TYPES
};