import express from 'express';
import factsService from '../services/factsService.js';

const router = express.Router();

/**
 * Test endpoint for template hydration demonstration
 * This endpoint demonstrates the complete template hydration system with Facts
 */
router.get('/test', async (req, res) => {
  try {
    console.log('[Template Hydration Demo] Starting demonstration...');
    
    // Example template with placeholders
    const originalContent = `INVESTIGATIONAL NEW DRUG APPLICATION (IND)

1. NAME AND ADDRESS OF SPONSOR
   Name: {{sponsor_name}}
   Address: {{sponsor_address}}
   Phone: {{sponsor_phone}}
   Email: {{sponsor_email}}
   DUNS Number: {{duns_number}}

2. INVESTIGATIONAL PRODUCT INFORMATION
   Drug Name: {{drug_name}}
   Chemical Name: {{chemical_name}}
   Molecular Formula: {{molecular_formula}}
   Molecular Weight: {{molecular_weight}}
   
3. MANUFACTURING INFORMATION
   Manufacturer: {{manufacturer_name}}
   Manufacturing Site: {{manufacturing_site}}
   GMP Certification: {{gmp_certification}}
   
4. CLINICAL PROTOCOL
   Protocol Title: {{protocol_title}}
   Phase: {{phase}}
   Indication: {{indication}}
   Sample Size: {{sample_size}}
   Primary Endpoint: {{primary_endpoint}}

5. SUBMISSION DETAILS
   IND Number: {{ind_number}}
   Submission Date: {{submission_date}}`;
    
    // Mock IND data
    const indData = {
      drugName: 'XYZ-123',
      indication: 'Advanced solid tumors',
      phase: 'Phase 1',
      sponsor: 'Biotech Innovations Inc.',
      submissionType: 'initial'
    };
    
    // Get Facts for hydration
    const facts = factsService.getFactsForIND(indData);
    
    // Hydrate the template content
    let hydratedContent = originalContent;
    const citations = [];
    const placeholders = [];
    const replacements = [];
    
    // Replace placeholders with Facts data
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    let match;
    
    while ((match = placeholderRegex.exec(originalContent)) !== null) {
      const placeholder = match[0];
      const key = match[1];
      
      // Get the fact value
      const value = facts[key];
      
      placeholders.push({
        key: key,
        original: placeholder,
        replaced: value !== undefined && value !== null
      });
      
      if (value !== undefined && value !== null) {
        // Replace in content
        hydratedContent = hydratedContent.replace(placeholder, value);
        
        // Create citation
        const citation = factsService.createCitation(key, value);
        citations.push(citation);
        
        // Track replacement
        replacements.push({
          placeholder: placeholder,
          key: key,
          value: value,
          position: match.index
        });
      }
    }
    
    // Generate LeafPatch
    const leafPatch = factsService.generateLeafPatch(originalContent, hydratedContent, citations);
    
    // Create DocumentDescriptor
    const documentDescriptor = {
      leaf_id: `m1.0-${Date.now().toString(36)}`,
      ctd_path: '1.0',
      template_id: 'test-template',
      template_name: 'FDA Form 1571 - Initial IND',
      placeholders: placeholders,
      facts_used: Object.keys(facts).filter(key => facts[key] !== null && facts[key] !== undefined),
      module: '1.0',
      category: 'Administrative'
    };
    
    // Generate session ID for Co-Author integration
    const sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    const leafId = documentDescriptor.leaf_id;
    
    // Create the full document structure
    const document = {
      id: `DOC_TEST_${Date.now()}`,
      sessionId: sessionId,
      leafId: leafId,
      content: hydratedContent,
      documentDescriptor: documentDescriptor,
      leafPatch: leafPatch,
      citations: citations,
      status: 'draft',
      trackChanges: true,
      factBound: citations.length > 0,
      metadata: {
        factsApplied: citations.length,
        placeholdersTotal: placeholders.length,
        placeholdersReplaced: placeholders.filter(p => p.replaced).length,
        trackingEnabled: true,
        sessionId: sessionId,
        leafId: leafId,
        ctdPath: documentDescriptor.ctd_path
      },
      coAuthorRoute: `/coauthor/session/${sessionId}/leaf/${leafId}`,
      documentEditorRoute: `/documents/${leafId}/edit`
    };
    
    // Return detailed results
    res.json({
      success: true,
      message: 'Template hydration demonstration successful',
      summary: {
        factsApplied: citations.length,
        placeholdersReplaced: `${placeholders.filter(p => p.replaced).length} of ${placeholders.length}`,
        trackingEnabled: true,
        sessionId: sessionId,
        leafId: leafId,
        coAuthorRoute: document.coAuthorRoute
      },
      document: document,
      demo: {
        originalContent: originalContent.substring(0, 300) + '...',
        hydratedContent: hydratedContent.substring(0, 500) + '...',
        sampleReplacements: replacements.slice(0, 5),
        leafPatch: {
          ...leafPatch,
          changes: leafPatch.changes.slice(0, 3) // Show first 3 changes
        }
      }
    });
    
  } catch (error) {
    console.error('[Template Hydration Demo] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Template hydration demonstration failed',
      error: error.message
    });
  }
});

/**
 * Test specific template hydration
 */
router.post('/hydrate', async (req, res) => {
  try {
    const { templateContent, indData } = req.body;
    
    if (!templateContent) {
      return res.status(400).json({
        success: false,
        message: 'Template content is required'
      });
    }
    
    // Get Facts for hydration
    const facts = factsService.getFactsForIND(indData || {});
    
    // Hydrate the template
    let hydratedContent = templateContent;
    const citations = [];
    const replacements = [];
    
    // Replace placeholders
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    hydratedContent = templateContent.replace(placeholderRegex, (match, key) => {
      const value = facts[key];
      if (value !== undefined && value !== null) {
        citations.push(factsService.createCitation(key, value));
        replacements.push({ key, value });
        return value;
      }
      return match;
    });
    
    // Generate LeafPatch
    const leafPatch = factsService.generateLeafPatch(templateContent, hydratedContent, citations);
    
    res.json({
      success: true,
      hydratedContent,
      citations,
      replacements,
      leafPatch
    });
    
  } catch (error) {
    console.error('[Template Hydration] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to hydrate template',
      error: error.message
    });
  }
});

export default router;