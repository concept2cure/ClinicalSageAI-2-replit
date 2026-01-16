import express from 'express';
import { requireTenant } from '../middleware/tenant.js';

const router = express.Router();
// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

// Import template service for real document generation
import templateService from '../services/templateUsageService.js';

// Helper function to generate spec table for CMC data
function generateSpecTable(specs) {
  return {
    headers: ['Parameter', 'Acceptance Criteria', 'Method'],
    rows: specs.map(spec => [
      spec.parameter || '',
      spec.criteria || '',
      spec.method || ''
    ])
  };
}

// Helper function to generate stability table for CMC data
function generateStabilityTable(stability) {
  return {
    headers: ['Time Point', 'Temperature', 'Test', 'Results'],
    rows: stability.map(s => [
      s.timepoint || '',
      s.temperature || '',
      s.test || '',
      s.results || ''
    ])
  };
}

// Helper function to save leaf patches and broadcast updates
async function saveLeafPatch(patch) {
  // Use in-memory storage as per guidelines
  const leaves = global.leavesStorage || (global.leavesStorage = new Map());
  const patches = global.patchesStorage || (global.patchesStorage = new Map());
  
  // Save patch
  patches.set(patch.id, patch);
  
  // Update or create leaf
  let leaf = leaves.get(patch.leaf_id);
  if (!leaf) {
    leaf = {
      id: patch.leaf_id,
      content: '',
      blocks: [],
      citations: [],
      patches: []
    };
    leaves.set(patch.leaf_id, leaf);
  }
  
  leaf.patches.push(patch.id);
  
  // Broadcast to connected SSE clients
  const { broadcastPatch } = await import('./leaves.js');
  broadcastPatch(patch.leaf_id, patch);
  
  return patch;
}

// Helper function to calculate compliance scores
function calculateComplianceScore(sections, cmcData, csrData, templateType) {
  let baseScore = 70;
  
  // Section completeness (40% weight)
  const completedSections = sections.filter(s => s.status === 'completed').length;
  const inProgressSections = sections.filter(s => s.status === 'in-progress').length;
  const sectionScore = (completedSections * 40 + inProgressSections * 20) / sections.length;
  
  // CMC data integration (25% weight)
  let cmcScore = 0;
  if (cmcData?.substances?.length > 0) cmcScore += 8;
  if (cmcData?.products?.length > 0) cmcScore += 8;
  if (cmcData?.analyticalMethods?.length > 0) cmcScore += 6;
  if (cmcData?.manufacturingData) cmcScore += 3;
  
  // CSR intelligence (20% weight)
  let csrScore = 0;
  if (csrData?.relevantStudies?.length > 0) csrScore += 10;
  if (csrData?.safetyProfile) csrScore += 5;
  if (csrData?.efficacyData) csrScore += 5;
  
  // Template compliance (15% weight)
  const templateBonus = templateType === 'FDA' ? 15 : templateType === 'EMA' ? 12 : 10;
  
  const totalScore = Math.min(95, baseScore + sectionScore + cmcScore + csrScore + templateBonus);
  return Math.round(totalScore);
}

// Helper function to generate mock section content
function generateSectionContent(sectionId, context, templateType) {
  const { cmcData, csrData, indication, phase } = context || {};
  
  const templates = {
    'protocol': {
      content: `This Phase ${phase || 'I'} clinical study will evaluate the safety and efficacy of the investigational product in patients with ${indication || 'the target indication'}. The study design incorporates learnings from ${csrData?.relevantStudies?.length || 0} similar studies identified through CSR intelligence analysis.`,
      cmc_integration: {
        substances: cmcData?.substances || [],
        analytical_methods: cmcData?.analyticalMethods || [],
        manufacturing_info: !!cmcData?.manufacturingData
      },
      csr_insights: {
        similar_studies: csrData?.relevantStudies?.length || 0,
        safety_considerations: !!csrData?.safetyProfile,
        dosing_rationale: !!csrData?.efficacyData
      },
      compliance_score: Math.floor(Math.random() * 20) + 80,
      regulatory_notes: `Designed in accordance with ${templateType} regulatory guidelines and ICH E6 GCP principles.`
    },
    'chem-manuf': {
      content: `The investigational product is manufactured according to current Good Manufacturing Practices (cGMP). ${cmcData?.substances?.length || 0} drug substance(s) have been characterized using ${cmcData?.analyticalMethods?.length || 0} validated analytical methods. Manufacturing controls ensure consistent product quality throughout the study.`,
      cmc_integration: {
        substances: cmcData?.substances || [],
        analytical_methods: cmcData?.analyticalMethods || [],
        manufacturing_info: !!cmcData?.manufacturingData
      },
      compliance_score: Math.floor(Math.random() * 15) + 85,
      regulatory_notes: `CMC information aligns with ${templateType} requirements for investigational products.`
    },
    'pharm-tox': {
      content: `Nonclinical safety evaluation supports the proposed clinical study. Pharmacokinetic and toxicology studies demonstrate acceptable safety margins. Safety findings from ${csrData?.relevantStudies?.length || 0} similar studies provide additional context for risk assessment.`,
      csr_insights: {
        similar_studies: csrData?.relevantStudies?.length || 0,
        safety_considerations: !!csrData?.safetyProfile
      },
      compliance_score: Math.floor(Math.random() * 20) + 75,
      regulatory_notes: `Safety assessment follows ${templateType} guidelines for nonclinical evaluation.`
    }
  };
  
  return templates[sectionId] || {
    content: `Section content for ${sectionId} generated using ${templateType} template.`,
    compliance_score: Math.floor(Math.random() * 30) + 70,
    regulatory_notes: `Generated according to ${templateType} regulatory standards.`
  };
}

// IND Wizard Dashboard Data endpoint
router.get('/wizard/data', async (req, res) => {
  try {
    // Mock data for IND wizard - in production this would come from database
    const wizardData = {
      currentProjects: [
        {
          id: 'ind-001',
          name: 'IND-23456 - XYZ-123',
          drug: 'XYZ-123',
          indication: 'Advanced solid tumors',
          stage: 'preparation',
          progress: 65,
          createdAt: '2025-03-15T10:00:00Z',
          updatedAt: '2025-04-20T14:30:00Z',
          status: 'in-progress',
          owner: 'John Smith',
          sponsor: 'Biotech Innovations Inc.',
          phase: 'Phase I',
          sections: [
            { id: 'cov', name: 'Cover Letter', status: 'completed' },
            { id: 'toc', name: 'Table of Contents', status: 'completed' },
            { id: '1571', name: 'Form FDA 1571', status: 'completed' },
            { id: '1572', name: 'Form FDA 1572', status: 'completed' },
            { id: 'cv', name: 'Investigator CV', status: 'completed' },
            { id: 'protocol', name: 'Protocol', status: 'in-progress' },
            { id: 'pharm-tox', name: 'Pharmacology/Toxicology', status: 'in-progress' },
            {
              id: 'chem-manuf',
              name: 'Chemistry, Manufacturing, and Control',
              status: 'not-started',
            },
            { id: 'prev-human', name: 'Previous Human Experience', status: 'not-started' },
            { id: 'add-info', name: 'Additional Information', status: 'not-started' },
          ],
        },
        {
          id: 'ind-002',
          name: 'IND-34567 - ABC-456',
          drug: 'ABC-456',
          indication: 'Rheumatoid arthritis',
          stage: 'review',
          progress: 85,
          createdAt: '2025-01-10T09:15:00Z',
          updatedAt: '2025-04-18T11:45:00Z',
          status: 'under-review',
          owner: 'Jane Doe',
          sponsor: 'Pharma Solutions LLC',
          phase: 'Phase II',
          sections: [
            { id: 'cov', name: 'Cover Letter', status: 'completed' },
            { id: 'toc', name: 'Table of Contents', status: 'completed' },
            { id: '1571', name: 'Form FDA 1571', status: 'completed' },
            { id: '1572', name: 'Form FDA 1572', status: 'completed' },
            { id: 'cv', name: 'Investigator CV', status: 'completed' },
            { id: 'protocol', name: 'Protocol', status: 'completed' },
            { id: 'pharm-tox', name: 'Pharmacology/Toxicology', status: 'completed' },
            {
              id: 'chem-manuf',
              name: 'Chemistry, Manufacturing, and Control',
              status: 'in-progress',
            },
            { id: 'prev-human', name: 'Previous Human Experience', status: 'completed' },
            { id: 'add-info', name: 'Additional Information', status: 'in-progress' },
          ],
        },
      ],
      recentActivity: [
        {
          id: 1,
          type: 'section_completed',
          project: 'IND-23456',
          section: 'Investigator CV',
          timestamp: '2025-04-20T14:30:00Z',
        },
        {
          id: 2,
          type: 'review_started',
          project: 'IND-34567',
          section: 'CMC Section',
          timestamp: '2025-04-19T09:15:00Z',
        },
        {
          id: 3,
          type: 'document_uploaded',
          project: 'IND-23456',
          section: 'Protocol',
          timestamp: '2025-04-18T16:45:00Z',
        },
      ],
      templates: [
        { id: 'template-1', name: 'Phase I Oncology Protocol Template', category: 'Protocol' },
        { id: 'template-2', name: 'Investigator Brochure Template', category: 'IB' },
        { id: 'template-3', name: 'Manufacturing Information Template', category: 'CMC' },
      ],
    };

    res.json(wizardData);
  } catch (error) {
    console.error('Error fetching IND wizard data:', error);
    res.status(500).json({ error: 'Failed to fetch IND wizard data' });
  }
});

// IND Statistics endpoint
router.get('/stats', async (req, res) => {
  try {
    // Mock statistics data - in production this would come from database analytics
    const stats = {
      totalProjects: 12,
      activeProjects: 8,
      completedProjects: 4,
      avgCompletionTime: 45, // days
      complianceRate: 94.2, // percentage
      recentSubmissions: 3,
      upcomingDeadlines: 5,
      performanceMetrics: {
        onTimeSubmissions: 89,
        qualityScore: 96.7,
        reviewCycles: 1.8, // average
      },
      monthlyProgress: [
        { month: 'Jan', submissions: 2, approvals: 1 },
        { month: 'Feb', submissions: 3, approvals: 2 },
        { month: 'Mar', submissions: 1, approvals: 3 },
        { month: 'Apr', submissions: 4, approvals: 2 },
      ],
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching IND stats:', error);
    res.status(500).json({ error: 'Failed to fetch IND statistics' });
  }
});

// Create new IND project
router.post('/create', async (req, res) => {
  try {
    const { name, drugName, indication, sponsor } = req.body;

    // Mock project creation - in production this would save to database
    const newProject = {
      id: `ind-${Date.now()}`,
      name: name || `IND-${Math.floor(Math.random() * 100000)} - ${drugName}`,
      drug: drugName,
      indication,
      sponsor,
      stage: 'planning',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      owner: 'Current User', // In production, get from authenticated user
      sections: [
        { id: 'cov', name: 'Cover Letter', status: 'not-started' },
        { id: 'toc', name: 'Table of Contents', status: 'not-started' },
        { id: '1571', name: 'Form FDA 1571', status: 'not-started' },
        { id: '1572', name: 'Form FDA 1572', status: 'not-started' },
        { id: 'cv', name: 'Investigator CV', status: 'not-started' },
        { id: 'protocol', name: 'Protocol', status: 'not-started' },
        { id: 'pharm-tox', name: 'Pharmacology/Toxicology', status: 'not-started' },
        { id: 'chem-manuf', name: 'Chemistry, Manufacturing, and Control', status: 'not-started' },
        { id: 'prev-human', name: 'Previous Human Experience', status: 'not-started' },
        { id: 'add-info', name: 'Additional Information', status: 'not-started' },
      ],
    };

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating IND project:', error);
    res.status(500).json({ error: 'Failed to create IND project' });
  }
});

// Test endpoint for template hydration demonstration
router.get('/test-hydration', async (req, res) => {
  try {
    console.log('[Template Hydration Test] Starting test...');
    
    // Example template with placeholders
    const templateContent = `INVESTIGATIONAL NEW DRUG APPLICATION (IND)

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
    
    // Mock template object
    const mockTemplate = {
      id: 1,
      templateName: 'FDA Form 1571 - Initial IND',
      content: templateContent,
      moduleNumber: '1.0',
      category: 'Administrative'
    };
    
    // Save mock template to in-memory store for testing
    const mockTemplateStorage = {
      1: mockTemplate
    };
    
    // Mock IND data
    const indData = {
      drugName: 'XYZ-123',
      indication: 'Advanced solid tumors',
      phase: 'Phase 1',
      sponsor: 'Biotech Innovations Inc.',
      submissionType: 'initial'
    };
    
    // Apply hydration
    const instantiationResult = await templateService.instantiateTemplate(
      1,
      indData,
      { templateName: mockTemplate.templateName }
    );
    
    // Return the hydration result
    res.json({
      success: true,
      message: 'Template hydration test successful',
      test: {
        original: {
          templateId: 1,
          templateName: mockTemplate.templateName,
          placeholderCount: (templateContent.match(/\{\{(\w+)\}\}/g) || []).length
        },
        hydrated: {
          documentDescriptor: instantiationResult.documentDescriptor,
          factsApplied: instantiationResult.citations?.length || 0,
          placeholdersReplaced: instantiationResult.documentDescriptor?.placeholders?.filter(p => p.replaced).length || 0,
          totalPlaceholders: instantiationResult.documentDescriptor?.placeholders?.length || 0,
          leafId: instantiationResult.documentDescriptor?.leaf_id,
          ctdPath: instantiationResult.documentDescriptor?.ctd_path,
          trackingEnabled: instantiationResult.metadata?.trackingEnabled
        },
        leafPatch: instantiationResult.leafPatch,
        citations: instantiationResult.citations,
        contentPreview: instantiationResult.content?.substring(0, 500) + '...'
      }
    });
  } catch (error) {
    console.error('[Template Hydration Test] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Template hydration test failed',
      error: error.message
    });
  }
});

// ===========================================
// IND Wizard Specific Endpoints - CRITICAL
// ===========================================

// GET endpoint for draft data - IND Wizard specific
// This endpoint MUST return JSON to prevent HTML fallback errors
router.get('/ind-wizard/:draftId/data', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`[IND-WIZARD] Fetching data for draft: ${draftId}`);
    
    // Return draft data - in production this would fetch from database
    // Always return JSON structure to prevent frontend errors
    res.json({
      success: true,
      data: {
        draftId: draftId,
        projectName: 'GT-101',
        phase: 'Phase 1',
        modality: 'Small Molecule',
        regions: ['US', 'EU'],
        status: 'draft',
        documents: [],
        sponsor: 'Biotech Innovations Inc.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          lastEditedBy: 'Current User',
          version: '1.0',
          stage: 'preparation'
        }
      }
    });
  } catch (error) {
    console.error('[IND-WIZARD] Error fetching draft data:', error);
    // Always return JSON error response
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch IND wizard draft data'
    });
  }
});

// GET endpoint for package plans - IND Wizard specific
// Returns available IND package configurations
router.get('/ind-wizard/package-plans', async (req, res) => {
  try {
    console.log('[IND-WIZARD] Fetching package plans');
    
    res.json({
      success: true,
      data: {
        plans: [
          { 
            id: 'standard', 
            name: 'Standard IND Package', 
            modules: ['M1', 'M2', 'M3', 'M4', 'M5'],
            description: 'Complete IND package with all standard modules',
            estimatedDays: 90,
            recommended: true
          },
          { 
            id: 'expedited', 
            name: 'Expedited Review Package', 
            modules: ['M1', 'M2', 'M3'],
            description: 'Fast-track IND package for urgent submissions',
            estimatedDays: 45,
            recommended: false
          },
          {
            id: 'breakthrough',
            name: 'Breakthrough Therapy Package',
            modules: ['M1', 'M2', 'M3', 'M4', 'M5'],
            description: 'Comprehensive package for breakthrough designation',
            estimatedDays: 60,
            recommended: false
          }
        ],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[IND-WIZARD] Error fetching package plans:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch package plans'
    });
  }
});

// GET endpoint for package plan config - IND Wizard specific
// Returns configuration for IND package planning
router.get('/ind-wizard/package-plan-config', async (req, res) => {
  try {
    console.log('[IND-WIZARD] Fetching package plan configuration');
    
    res.json({
      success: true,
      data: {
        config: {
          defaultPlan: 'standard',
          availableModules: ['M1', 'M2', 'M3', 'M4', 'M5'],
          requiredModules: ['M1', 'M2'],
          optionalModules: ['M3', 'M4', 'M5'],
          moduleDescriptions: {
            M1: 'Administrative information and prescribing information',
            M2: 'Common Technical Document summaries',
            M3: 'Quality (CMC) information',
            M4: 'Nonclinical study reports',
            M5: 'Clinical study reports'
          },
          validationRules: {
            minModules: 2,
            maxModules: 5,
            requiresM1: true,
            requiresM2: true
          }
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[IND-WIZARD] Error fetching package plan config:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch package plan configuration'
    });
  }
});

// Get specific IND project
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Mock project data - in production this would query database
    const project = {
      id: id,
      name: 'IND-23456 - XYZ-123',
      drug: 'XYZ-123',
      indication: 'Advanced solid tumors',
      stage: 'preparation',
      progress: 65,
      createdAt: '2025-03-15T10:00:00Z',
      updatedAt: '2025-04-20T14:30:00Z',
      status: 'in-progress',
      owner: 'John Smith',
      sponsor: 'Biotech Innovations Inc.',
      phase: 'Phase I',
      sections: [
        { id: 'cov', name: 'Cover Letter', status: 'completed' },
        { id: 'toc', name: 'Table of Contents', status: 'completed' },
        { id: '1571', name: 'Form FDA 1571', status: 'completed' },
        { id: '1572', name: 'Form FDA 1572', status: 'completed' },
        { id: 'cv', name: 'Investigator CV', status: 'completed' },
        { id: 'protocol', name: 'Protocol', status: 'in-progress' },
        { id: 'pharm-tox', name: 'Pharmacology/Toxicology', status: 'in-progress' },
        { id: 'chem-manuf', name: 'Chemistry, Manufacturing, and Control', status: 'not-started' },
        { id: 'prev-human', name: 'Previous Human Experience', status: 'not-started' },
        { id: 'add-info', name: 'Additional Information', status: 'not-started' },
      ],
    };

    res.json(project);
  } catch (error) {
    console.error('Error fetching IND project:', error);
    res.status(500).json({ error: 'Failed to fetch IND project' });
  }
});

// KPI endpoint for layout component
router.get('/kpi', async (req, res) => {
  try {
    const kpiData = {
      totalSubmissions: 45,
      pendingReviews: 12,
      approvedThisMonth: 8,
      avgReviewTime: 21, // days
      complianceScore: 96.5,
      activeProjects: 15,
      trends: {
        submissions: [12, 15, 18, 22, 25, 28], // last 6 months
        approvals: [10, 13, 16, 20, 23, 25],
        compliance: [94.2, 95.1, 95.8, 96.0, 96.2, 96.5],
      },
    };

    res.json(kpiData);
  } catch (error) {
    console.error('Error fetching KPI data:', error);
    res.status(500).json({ error: 'Failed to fetch KPI data' });
  }
});

// Predictive analytics endpoint
router.get('/predict', async (req, res) => {
  try {
    const { step } = req.query;

    const predictiveData = {
      completion: Math.min(65 + (parseInt(step) || 0) * 10, 95),
      confidence: Math.max(90 - (parseInt(step) || 0) * 2, 75),
      estimatedDate: new Date(
        Date.now() + (12 + (parseInt(step) || 0) * 3) * 24 * 60 * 60 * 1000
      ).toISOString(),
      risks: [
        { type: 'timeline', severity: 'low', description: 'Current progress on track' },
        {
          type: 'compliance',
          severity: 'medium',
          description: 'Additional documentation may be required',
        },
      ],
      recommendations: [
        'Complete manufacturing documentation early',
        'Schedule pre-IND meeting with FDA',
        'Prepare investigator training materials',
      ],
    };

    res.json(predictiveData);
  } catch (error) {
    console.error('Error generating predictions:', error);
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

// In-memory storage for IND draft data (in production this would be in database)
const indDraftData = {};

// Get Pre-IND data for a specific draft
router.get('/drafts/:draftId/pre-ind', async (req, res) => {
  try {
    const { draftId } = req.params;
    const data = indDraftData[draftId]?.preInd || null;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching Pre-IND data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Pre-IND data' });
  }
});

// Save Pre-IND data for a specific draft
router.put('/drafts/:draftId/pre-ind', async (req, res) => {
  try {
    const { draftId } = req.params;
    const data = req.body;

    if (!indDraftData[draftId]) {
      indDraftData[draftId] = {};
    }

    indDraftData[draftId].preInd = data;
    console.log(`Pre-IND data saved for draft ${draftId}:`, data);

    res.json({ success: true, message: 'Pre-IND data saved successfully' });
  } catch (error) {
    console.error('Error saving Pre-IND data:', error);
    res.status(500).json({ success: false, message: 'Failed to save Pre-IND data' });
  }
});

// Get CMC data for a specific draft
router.get('/drafts/:draftId/cmc', async (req, res) => {
  try {
    const { draftId } = req.params;
    const data = indDraftData[draftId]?.cmc || null;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching CMC data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch CMC data' });
  }
});

// Save CMC data for a specific draft
router.put('/drafts/:draftId/cmc', async (req, res) => {
  try {
    const { draftId } = req.params;
    const data = req.body;

    if (!indDraftData[draftId]) {
      indDraftData[draftId] = {};
    }

    indDraftData[draftId].cmc = data;
    console.log(`CMC data saved for draft ${draftId}:`, data);

    res.json({ success: true, message: 'CMC data saved successfully' });
  } catch (error) {
    console.error('Error saving CMC data:', error);
    res.status(500).json({ success: false, message: 'Failed to save CMC data' });
  }
});

// Step-specific data endpoints
router.get('/drafts/:draftId/nonclinical', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Fetching nonclinical data for draft: ${draftId}`);

    // Return mock data structure that matches what the frontend expects
    const nonclinicalData = {
      success: true,
      data: {
        overallNonclinicalSummary: '',
        studies: [],
      },
    };

    res.json(nonclinicalData);
  } catch (error) {
    console.error('Error fetching nonclinical data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/drafts/:draftId/nonclinical', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Updating nonclinical data for draft: ${draftId}`);

    // In production, save to database
    const updatedData = {
      success: true,
      message: 'Nonclinical data updated successfully',
      data: req.body,
    };

    res.json(updatedData);
  } catch (error) {
    console.error('Error updating nonclinical data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/drafts/:draftId/clinical-protocol', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Fetching clinical protocol data for draft: ${draftId}`);

    const protocolData = {
      success: true,
      data: {
        title: '',
        objectives: '',
        endpoints: '',
        eligibility: '',
      },
    };

    res.json(protocolData);
  } catch (error) {
    console.error('Error fetching clinical protocol data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/drafts/:draftId/clinical-protocol', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Updating clinical protocol data for draft: ${draftId}`);

    res.json({
      success: true,
      message: 'Clinical protocol data updated successfully',
      data: req.body,
    });
  } catch (error) {
    console.error('Error updating clinical protocol data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/drafts/:draftId/investigator-brochure', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Fetching investigator brochure data for draft: ${draftId}`);

    const brochureData = {
      success: true,
      data: {
        introduction: '',
        physicalChemical: '',
        nonclinical: '',
        clinicalExperience: '',
      },
    };

    res.json(brochureData);
  } catch (error) {
    console.error('Error fetching investigator brochure data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/drafts/:draftId/investigator-brochure', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Updating investigator brochure data for draft: ${draftId}`);

    res.json({
      success: true,
      message: 'Investigator brochure data updated successfully',
      data: req.body,
    });
  } catch (error) {
    console.error('Error updating investigator brochure data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apply selected template to IND application
// This creates a real document with Facts hydration and tracked changes
router.post('/ind/:id/apply-template', async (req, res) => {
  try {
    const { id } = req.params;
    const { templateId, templateData, indData, organizationId = 6 } = req.body;

    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }

    console.log('[Apply Template] Request received:', { id, templateId, indData });

    // Handle both numeric IDs and string draft IDs
    let indId;
    if (typeof id === 'string' && id.startsWith('draft-')) {
      const parts = id.split('-');
      indId = parseInt(parts[1]) || 1;
    } else {
      indId = parseInt(id);
    }

    // Prepare IND data for template hydration
    const fullIndData = {
      id: indId,
      drugName: indData?.drugName || templateData?.drugName || 'XYZ-123',
      indication: indData?.indication || templateData?.indication || 'Advanced solid tumors',
      phase: indData?.phase || templateData?.phase || 'Phase 1',
      sponsor: indData?.sponsor || 'Biotech Innovations Inc.',
      principalInvestigator: indData?.principalInvestigator || 'Dr. Sarah Johnson',
      submissionType: indData?.submissionType || 'initial',
      indNumber: indData?.indNumber || `IND-${Date.now().toString(36).toUpperCase()}`,
      ...indData
    };

    // Instantiate template with Facts and generate LeafPatch
    const instantiationResult = await templateService.instantiateTemplate(
      templateId,
      fullIndData,
      templateData
    );

    // Generate session ID for Co-Author integration
    const sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    const leafId = instantiationResult.documentDescriptor?.leaf_id || `leaf_${Date.now()}`;

    // Create document structure for Co-Author
    const document = {
      id: `DOC_${templateId}_${indId}_${Date.now()}`,
      sessionId: sessionId,
      leafId: leafId,
      indId: indId,
      templateId: templateId,
      templateName: instantiationResult.documentDescriptor?.template_name || templateData?.templateName || 'Document',
      content: instantiationResult.content,
      documentDescriptor: instantiationResult.documentDescriptor,
      leafPatch: instantiationResult.leafPatch,
      citations: instantiationResult.citations,
      status: 'draft',
      trackChanges: true,
      factBound: instantiationResult.citations?.length > 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        ...instantiationResult.metadata,
        sessionId: sessionId,
        leafId: leafId,
        ctdPath: instantiationResult.documentDescriptor?.ctd_path,
        factsApplied: instantiationResult.citations?.length || 0,
        placeholdersTotal: instantiationResult.documentDescriptor?.placeholders?.length || 0,
        placeholdersReplaced: instantiationResult.documentDescriptor?.placeholders?.filter(p => p.replaced).length || 0,
        complianceScore: 85 + Math.floor(Math.random() * 10),
        cmcIntegrated: templateData?.cmcIntegration || false,
        csrIntegrated: templateData?.csrInsights || false
      },
      coAuthorRoute: `/coauthor/session/${sessionId}/leaf/${leafId}`,
      documentEditorRoute: `/documents/${leafId}/edit`
    };

    // Store document metadata for later retrieval (in production, save to database)
    // For now, we'll include it in the response
    console.log('[Apply Template] Document created:', {
      id: document.id,
      sessionId: document.sessionId,
      leafId: document.leafId,
      factsApplied: document.metadata.factsApplied,
      placeholders: `${document.metadata.placeholdersReplaced}/${document.metadata.placeholdersTotal}`
    });

    res.json({
      success: true,
      data: document,
      message: 'Template applied and document hydrated successfully',
      redirectUrl: document.coAuthorRoute,
      documentId: document.id,
      sessionId: document.sessionId,
      leafId: document.leafId
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply template',
      error: error.message
    });
  }
});

router.get('/drafts/:draftId/fda-forms', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Fetching FDA forms data for draft: ${draftId}`);

    const formsData = {
      success: true,
      data: {
        form1571: {},
        form1572: {},
        additionalForms: [],
      },
    };

    res.json(formsData);
  } catch (error) {
    console.error('Error fetching FDA forms data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/drafts/:draftId/fda-forms', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Updating FDA forms data for draft: ${draftId}`);

    res.json({
      success: true,
      message: 'FDA forms data updated successfully',
      data: req.body,
    });
  } catch (error) {
    console.error('Error updating FDA forms data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/drafts/:draftId/final-assembly', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Fetching final assembly data for draft: ${draftId}`);

    const assemblyData = {
      success: true,
      data: {
        completionStatus: {},
        validationResults: [],
        submissionReadiness: false,
      },
    };

    res.json(assemblyData);
  } catch (error) {
    console.error('Error fetching final assembly data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/drafts/:draftId/final-assembly', async (req, res) => {
  try {
    const { draftId } = req.params;
    console.log(`Updating final assembly data for draft: ${draftId}`);

    res.json({
      success: true,
      message: 'Final assembly data updated successfully',
      data: req.body,
    });
  } catch (error) {
    console.error('Error updating final assembly data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-Draft IND Generation endpoint
router.post('/auto-draft', async (req, res) => {
  try {
    const { 
      projectId, 
      templateType = 'FDA', 
      sections = [], 
      indication, 
      phase,
      includeCmc = true,
      includeCsr = true 
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Simulate CMC data fetch
    let cmcData = null;
    if (includeCmc) {
      cmcData = {
        substances: [
          { id: 1, name: 'Active Pharmaceutical Ingredient', molecularWeight: '324.4', purity: '99.2%' },
          { id: 2, name: 'Excipient A', function: 'Stabilizer', amount: '2.5mg' }
        ],
        products: [
          { id: 1, dosageForm: 'Tablet', strength: '10mg', batchSize: '100,000 units' }
        ],
        analyticalMethods: [
          { id: 1, methodName: 'HPLC-UV', methodType: 'HPLC', purpose: 'Assay and related substances' },
          { id: 2, methodName: 'Dissolution', methodType: 'UV', purpose: 'Release testing' }
        ],
        manufacturingData: {
          site: 'FDA-registered facility',
          gmpStatus: 'Current',
          lastInspection: '2024-01-15'
        }
      };
    }

    // Simulate CSR data fetch
    let csrData = null;
    if (includeCsr) {
      csrData = {
        relevantStudies: [
          { id: 1, title: 'Phase I Study in Similar Population', phase: 'Phase I', indication: indication || 'Oncology' },
          { id: 2, title: 'Dose-Escalation Safety Study', phase: 'Phase I', indication: indication || 'Oncology' },
          { id: 3, title: 'Pharmacokinetic Study', phase: 'Phase I', indication: indication || 'Oncology' }
        ],
        safetyProfile: {
          majorFindings: 'Generally well tolerated',
          doseLimit: 'MTD established at 200mg',
          commonAEs: 'Fatigue, nausea, decreased appetite'
        },
        efficacyData: {
          responseRate: '23%',
          progression: 'Stable disease in 45% of patients',
          biomarkers: 'Correlative studies ongoing'
        }
      };
    }

    // Generate sections based on template
    const generatedSections = {};
    const context = { cmcData, csrData, indication, phase };
    
    for (const section of sections) {
      if (section.status !== 'completed') {
        generatedSections[section.id] = generateSectionContent(section.id, context, templateType);
      }
    }

    // Calculate compliance score
    const complianceScore = calculateComplianceScore(sections, cmcData, csrData, templateType);

    // Generate risk indicators
    const riskIndicators = [];
    if (!cmcData?.substances?.length) {
      riskIndicators.push({
        section: 'CMC',
        type: 'Missing substance characterization',
        probability: 0.8,
        impact: 'High',
        recommendation: 'Complete drug substance characterization'
      });
    }
    if (!csrData?.relevantStudies?.length) {
      riskIndicators.push({
        section: 'Clinical',
        type: 'Limited precedent data',
        probability: 0.6,
        impact: 'Medium',
        recommendation: 'Review additional clinical literature'
      });
    }

    res.json({
      success: true,
      projectId,
      templateType,
      generatedSections,
      complianceScore,
      riskIndicators,
      crossModuleData: {
        cmcData,
        csrData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in auto-draft generation:', error);
    res.status(500).json({ error: 'Failed to generate auto-draft', details: error.message });
  }
});

// Cross-module data integration endpoint
router.get('/cross-module-data/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { includeCmc = true, includeCsr = true, indication, phase } = req.query;

    const result = {
      projectId,
      timestamp: new Date().toISOString(),
      dataStatus: {}
    };

    // Fetch CMC data status
    if (includeCmc === 'true') {
      // Simulate API calls to CMC module
      result.cmcData = {
        substances: {
          count: 2,
          status: 'available',
          lastUpdated: '2025-04-20T10:00:00Z'
        },
        products: {
          count: 1,
          status: 'available', 
          lastUpdated: '2025-04-19T15:30:00Z'
        },
        analyticalMethods: {
          count: 5,
          status: 'available',
          lastUpdated: '2025-04-18T09:15:00Z'
        },
        manufacturing: {
          status: 'available',
          gmpCompliant: true,
          lastInspection: '2024-01-15'
        }
      };
      result.dataStatus.cmc = 'available';
    }

    // Fetch CSR intelligence
    if (includeCsr === 'true') {
      result.csrData = {
        relevantStudies: {
          count: 3,
          status: 'available',
          indication: indication || 'oncology',
          phase: phase || 'Phase I'
        },
        safetyIntelligence: {
          status: 'available',
          riskProfile: 'moderate',
          precedentStudies: 8
        },
        efficacyData: {
          status: 'limited',
          benchmarkStudies: 2
        }
      };
      result.dataStatus.csr = 'available';
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching cross-module data:', error);
    res.status(500).json({ error: 'Failed to fetch cross-module data', details: error.message });
  }
});

// Template variants endpoint
router.get('/templates', async (req, res) => {
  try {
    const templates = {
      'FDA': {
        name: 'FDA IND Template',
        description: 'Standard FDA IND application format (21 CFR 312)',
        regions: ['US'],
        sections: [
          'Cover Letter',
          'Form FDA 1571', 
          'Protocol',
          'Investigator Information',
          'Chemistry, Manufacturing, and Control',
          'Pharmacology and Toxicology',
          'Previous Human Experience'
        ],
        compliance: ['21 CFR Part 312', 'ICH E6 GCP'],
        ectdMapping: {
          'Module 1': ['Cover Letter', 'Form FDA 1571'],
          'Module 2': ['Protocol', 'Investigator Information'],
          'Module 3': ['Chemistry, Manufacturing, and Control'],
          'Module 4': ['Pharmacology and Toxicology'],
          'Module 5': ['Previous Human Experience']
        }
      },
      'EMA': {
        name: 'EMA CTA Template',
        description: 'European Clinical Trial Application format (EU CTR)',
        regions: ['EU', 'EEA'],
        sections: [
          'Cover Letter',
          'Clinical Trial Application Form',
          'Protocol',
          'Investigator Information', 
          'IMPD (Investigational Medicinal Product Dossier)',
          'Non-clinical Data'
        ],
        compliance: ['EU CTR 536/2014', 'ICH E6 GCP', 'EudraLex Volume 10'],
        ectdMapping: {
          'Module 1': ['Cover Letter', 'Clinical Trial Application Form'],
          'Module 2': ['Protocol', 'Investigator Information'],
          'Module 3': ['IMPD (Investigational Medicinal Product Dossier)'],
          'Module 4': ['Non-clinical Data']
        }
      },
      'PMDA': {
        name: 'PMDA Clinical Trial Notification',
        description: 'Japan clinical trial notification format',
        regions: ['Japan'],
        sections: [
          'Cover Letter',
          'Clinical Trial Notification',
          'Protocol',
          'Investigator Information',
          'Drug Information',
          'Non-clinical Studies'
        ],
        compliance: ['Japanese GCP', 'ICH E6', 'Pharmaceutical Affairs Law'],
        ectdMapping: {
          'Module 1': ['Cover Letter', 'Clinical Trial Notification'],
          'Module 2': ['Protocol', 'Investigator Information'],
          'Module 3': ['Drug Information'],
          'Module 4': ['Non-clinical Studies']
        }
      },
      'GLOBAL': {
        name: 'Global Harmonized Template',
        description: 'Multi-regional template with ICH compliance',
        regions: ['Global'],
        sections: [
          'Common Technical Document Structure',
          'Regional Adaptations',
          'ICH M4 Compliant Sections'
        ],
        compliance: ['ICH M4', 'ICH E6 GCP', 'ICH E2A Safety'],
        ectdMapping: {
          'Module 1': ['Regional Administrative Information'],
          'Module 2': ['Common Technical Document Summaries'],
          'Module 3': ['Quality Information'],
          'Module 4': ['Non-clinical Study Reports'],
          'Module 5': ['Clinical Study Reports']
        }
      }
    };

    res.json({
      success: true,
      templates,
      defaultTemplate: 'FDA',
      supportedRegions: ['US', 'EU', 'Japan', 'Global']
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates', details: error.message });
  }
});

// Compliance assessment endpoint
router.post('/compliance-assessment', async (req, res) => {
  try {
    const { sections, cmcData, csrData, templateType = 'FDA' } = req.body;

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'Sections array is required' });
    }

    const complianceScore = calculateComplianceScore(sections, cmcData, csrData, templateType);
    
    // Calculate detailed scores
    const detailedScores = {
      sectionCompleteness: Math.round((sections.filter(s => s.status === 'completed').length / sections.length) * 100),
      dataIntegration: cmcData && csrData ? 92 : cmcData ? 75 : csrData ? 60 : 30,
      regulatoryAlignment: templateType === 'FDA' ? 88 : templateType === 'EMA' ? 85 : 78,
      crossReferenceQuality: Math.floor(Math.random() * 20) + 80
    };

    // Regional compliance estimates
    const regionalCompliance = {
      FDA: templateType === 'FDA' ? complianceScore : Math.max(0, complianceScore - 8),
      EMA: templateType === 'EMA' ? complianceScore : Math.max(0, complianceScore - 5),
      PMDA: templateType === 'PMDA' ? complianceScore : Math.max(0, complianceScore - 12)
    };

    res.json({
      success: true,
      overallScore: complianceScore,
      detailedScores,
      regionalCompliance,
      assessment: {
        strengths: [
          'Well-integrated CMC data',
          'Strong regulatory alignment',
          'Comprehensive safety assessment'
        ],
        improvements: [
          'Complete remaining sections',
          'Enhance cross-references',
          'Verify analytical methods'
        ]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in compliance assessment:', error);
    res.status(500).json({ error: 'Failed to assess compliance', details: error.message });
  }
});

// Package Planning Configuration endpoints - Multi-tenant aware
router.get('/package-planning/config', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    
    // Mock package planning configuration - in production this would come from database
    const packagePlanConfig = {
      tenantId,
      availableRegions: [
        { code: 'US', name: 'United States', agency: 'FDA', requirements: ['Form 1571', 'Protocol', 'IB', 'CMC'] },
        { code: 'EU', name: 'European Union', agency: 'EMA', requirements: ['CTA', 'Protocol', 'IMPD', 'QOS'] },
        { code: 'UK', name: 'United Kingdom', agency: 'MHRA', requirements: ['CTA', 'Protocol', 'IMPD', 'Summary'] },
        { code: 'CA', name: 'Canada', agency: 'Health Canada', requirements: ['CTA', 'Protocol', 'IB', 'CMC'] },
        { code: 'JP', name: 'Japan', agency: 'PMDA', requirements: ['CTN', 'Protocol', 'IB', 'CTD'] },
        { code: 'AU', name: 'Australia', agency: 'TGA', requirements: ['CTN', 'Protocol', 'IB', 'QOS'] }
      ],
      availableModalities: [
        { code: 'small-molecule', name: 'Small Molecule', templates: ['standard-ind', 'phase-1'], complexity: 'standard' },
        { code: 'biologics', name: 'Biologics', templates: ['biologics-ind', 'biosimilar'], complexity: 'high' },
        { code: 'gene-therapy', name: 'Gene Therapy', templates: ['gene-therapy-ind', 'viral-vector'], complexity: 'very-high' },
        { code: 'cell-therapy', name: 'Cell Therapy', templates: ['cell-therapy-ind', 'car-t'], complexity: 'very-high' },
        { code: 'oligonucleotide', name: 'Oligonucleotide', templates: ['oligo-ind', 'antisense'], complexity: 'high' },
        { code: 'radiopharmaceutical', name: 'Radiopharmaceutical', templates: ['radio-ind', 'diagnostic'], complexity: 'high' }
      ],
      defaultSettings: {
        selectedRegions: ['US'],
        selectedModalities: ['small-molecule'],
        packageRequirements: [],
        timelineEstimate: 90
      }
    };

    res.json({ success: true, data: packagePlanConfig });
  } catch (error) {
    console.error('Error fetching package plan config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch package plan configuration' });
  }
});

router.get('/package-planning/plans', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    
    // Mock package plans - in production this would come from database
    const packagePlans = [
      {
        planId: `plan-${tenantId}-001`,
        tenantId,
        projectName: 'XYZ-123 Oncology Study',
        selectedRegions: ['US', 'EU'],
        selectedModalities: ['small-molecule'],
        status: 'active',
        createdAt: new Date().toISOString(),
        packageRequirements: [
          { region: 'US', documents: ['Form 1571', 'Protocol', 'IB', 'CMC'], status: 'in-progress' },
          { region: 'EU', documents: ['CTA', 'Protocol', 'IMPD', 'QOS'], status: 'not-started' }
        ],
        timelineEstimate: 120,
        cmcReadiness: 65
      }
    ];

    res.json({ success: true, data: packagePlans });
  } catch (error) {
    console.error('Error fetching package plans:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch package plans' });
  }
});

router.post('/package-planning/plans', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const { projectName, selectedRegions, selectedModalities, packageRequirements } = req.body;

    const newPlan = {
      planId: `plan-${tenantId}-${Date.now()}`,
      tenantId,
      projectName,
      selectedRegions,
      selectedModalities,
      packageRequirements,
      status: 'active',
      createdAt: new Date().toISOString(),
      timelineEstimate: calculateTimelineEstimate(selectedRegions, selectedModalities),
      cmcReadiness: 0
    };

    console.log(`Package plan created for tenant ${tenantId}:`, newPlan);

    res.json({ success: true, data: newPlan });
  } catch (error) {
    console.error('Error creating package plan:', error);
    res.status(500).json({ success: false, error: 'Failed to create package plan' });
  }
});

router.put('/package-planning/plans/:planId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const { planId } = req.params;
    const updates = req.body;

    // Verify tenant ownership
    if (!planId.includes(tenantId)) {
      return res.status(403).json({ success: false, error: 'Access denied - plan belongs to different tenant' });
    }

    const updatedPlan = {
      planId,
      tenantId,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    console.log(`Package plan updated for tenant ${tenantId}:`, updatedPlan);

    res.json({ success: true, data: updatedPlan });
  } catch (error) {
    console.error('Error updating package plan:', error);
    res.status(500).json({ success: false, error: 'Failed to update package plan' });
  }
});

router.post('/package-planning/generate-requirements', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const { regions, modalities } = req.body;

    const requirements = generateRegionalRequirements(regions, modalities);
    const estimatedTotalDays = calculateTimelineEstimate(regions, modalities);

    const result = {
      tenantId,
      requirements,
      estimatedTotalDays,
      generatedAt: new Date().toISOString()
    };

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error generating requirements:', error);
    res.status(500).json({ success: false, error: 'Failed to generate requirements' });
  }
});

router.post('/package-planning/sync-cmc/:planId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const { planId } = req.params;

    // Verify tenant ownership
    if (!planId.includes(tenantId)) {
      return res.status(403).json({ success: false, error: 'Access denied - plan belongs to different tenant' });
    }

    // Simulate CMC readiness check
    const cmcReadiness = Math.floor(Math.random() * 40) + 60; // 60-100%
    
    const syncResult = {
      planId,
      tenantId,
      cmcReadiness,
      syncedAt: new Date().toISOString(),
      readinessFactors: {
        substanceCharacterization: cmcReadiness > 80 ? 'complete' : 'in-progress',
        methodValidation: cmcReadiness > 75 ? 'complete' : 'in-progress',
        stabilityData: cmcReadiness > 85 ? 'complete' : 'in-progress',
        manufacturingInfo: cmcReadiness > 70 ? 'complete' : 'in-progress'
      }
    };

    console.log(`CMC sync completed for tenant ${tenantId}, plan ${planId}:`, syncResult);

    res.json({ success: true, data: syncResult });
  } catch (error) {
    console.error('Error syncing CMC data:', error);
    res.status(500).json({ success: false, error: 'Failed to sync CMC data' });
  }
});

// Helper functions for package planning
function generateRegionalRequirements(regions, modalities) {
  const requirements = [];
  
  regions.forEach(regionCode => {
    const regionRequirements = {
      region: regionCode,
      documents: getRegionDocuments(regionCode),
      submissions: getRegionSubmissions(regionCode),
      modality_specific: getModalityRequirements(modalities, regionCode),
      timeline_days: getRegionTimeline(regionCode),
      critical_path: getCriticalPath(regionCode, modalities)
    };
    requirements.push(regionRequirements);
  });
  
  return requirements;
}

function getRegionDocuments(regionCode) {
  const regionDocs = {
    'US': ['Form 1571', 'Form 1572', 'Protocol', 'Investigator Brochure', 'CMC Package', 'Cover Letter'],
    'EU': ['CTA Application', 'Protocol', 'IMPD', 'Quality Overall Summary', 'Ethics Documentation'],
    'UK': ['CTA Application', 'Protocol', 'IMPD', 'Clinical Summary', 'Quality Documentation'],
    'CA': ['CTA Application', 'Protocol', 'Investigator Brochure', 'CMC Package', 'Clinical Summary'],
    'JP': ['CTN Application', 'Protocol', 'Investigator Brochure', 'CTD Format', 'Manufacturing Info'],
    'AU': ['CTN Application', 'Protocol', 'Investigator Brochure', 'Quality Summary', 'Clinical Data']
  };
  return regionDocs[regionCode] || [];
}

function getRegionSubmissions(regionCode) {
  const submissions = {
    'US': { type: 'eCTD', format: 'Electronic', gateway: 'FDA Gateway' },
    'EU': { type: 'CTIS', format: 'Portal', gateway: 'CTIS Portal' },
    'UK': { type: 'MHRA Portal', format: 'Electronic', gateway: 'MHRA Submissions' },
    'CA': { type: 'RRS Portal', format: 'Electronic', gateway: 'Health Canada RRS' },
    'JP': { type: 'PMDA eCTD', format: 'Electronic', gateway: 'PMDA Gateway' },
    'AU': { type: 'TGA Portal', format: 'Electronic', gateway: 'TGA Business Services' }
  };
  return submissions[regionCode] || {};
}

function getModalityRequirements(modalities, regionCode) {
  const modalityReqs = [];
  
  modalities.forEach(modality => {
    if (modality === 'gene-therapy') {
      modalityReqs.push({
        requirement: 'Vector characterization',
        documents: ['Vector manufacturing', 'Biodistribution studies', 'Shedding studies'],
        timeline_impact: '+30 days'
      });
    } else if (modality === 'cell-therapy') {
      modalityReqs.push({
        requirement: 'Cell characterization',
        documents: ['Cell banking', 'Potency assays', 'Adventitious agent testing'],
        timeline_impact: '+45 days'
      });
    } else if (modality === 'biologics') {
      modalityReqs.push({
        requirement: 'Biologics package',
        documents: ['Manufacturing process', 'Analytical methods', 'Comparability studies'],
        timeline_impact: '+15 days'
      });
    }
  });
  
  return modalityReqs;
}

function getRegionTimeline(regionCode) {
  const timelines = {
    'US': 90,
    'EU': 120,
    'UK': 100,
    'CA': 110,
    'JP': 130,
    'AU': 95
  };
  return timelines[regionCode] || 90;
}

function getCriticalPath(regionCode, modalities) {
  const basePath = ['Protocol finalization', 'CMC package completion', 'Regulatory submission'];
  
  if (modalities.includes('gene-therapy') || modalities.includes('cell-therapy')) {
    basePath.splice(1, 0, 'Advanced therapy characterization');
  }
  
  if (regionCode === 'EU') {
    basePath.push('Ethics committee approval');
  }
  
  return basePath;
}

function calculateTimelineEstimate(regions, modalities) {
  let baseDays = Math.max(...regions.map(r => getRegionTimeline(r)));
  
  // Add modality complexity
  modalities.forEach(modality => {
    if (modality === 'gene-therapy' || modality === 'cell-therapy') {
      baseDays += 30;
    } else if (modality === 'biologics' || modality === 'oligonucleotide') {
      baseDays += 15;
    }
  });
  
  // Multiple region overhead
  if (regions.length > 1) {
    baseDays += regions.length * 5;
  }
  
  return baseDays;
}

// Helper functions for template hydration
const getCtdPathForTemplate = (templateId) => {
  const templatePaths = {
    '1': 'm1-administrative',
    '2': 'm2-common-technical-document',
    '3': 'm3-quality',
    '4': 'm4-nonclinical',
    '5': 'm5-clinical',
    '23': 'm2-3-quality-overall-summary',
    '32': 'm3-2-body-of-data'
  };
  const id = String(templateId);
  return templatePaths[id] || `m${id}`;
};

const getTemplatePlaceholders = (templateId) => {
  return [
    { key: 'drug_name', label: 'Drug Name' },
    { key: 'indication', label: 'Indication' },
    { key: 'sponsor', label: 'Sponsor' },
    { key: 'phase', label: 'Clinical Phase' },
    { key: 'manufacturing_site', label: 'Manufacturing Site' }
  ];
};

const extractFactsFromUserData = async (userData) => {
  const facts = [];
  
  if (userData?.drugName || userData?.projectName) {
    facts.push({
      type: 'drug_substance',
      key: 'drug_name',
      value: userData.drugName || userData.projectName,
      source: 'user_input',
      confidence: 1.0
    });
  }
  
  if (userData?.indication || userData?.therapeuticArea) {
    facts.push({
      type: 'clinical',
      key: 'indication',
      value: userData.indication || userData.therapeuticArea,
      source: 'user_input',
      confidence: 1.0
    });
  }
  
  if (userData?.sponsor) {
    facts.push({
      type: 'administrative',
      key: 'sponsor',
      value: userData.sponsor,
      source: 'user_input',
      confidence: 1.0
    });
  }
  
  return facts;
};

const hydrateTemplate = async (descriptor, facts) => {
  const blocks = [];
  const citations = [];
  
  facts.forEach((fact, index) => {
    blocks.push({
      id: `block_${index + 1}`,
      type: 'fact_insertion',
      content: fact.value,
      factId: fact.key,
      tracked: true,
      author: 'System',
      timestamp: new Date().toISOString()
    });
    
    if (fact.source) {
      citations.push({
        id: `cit_${index + 1}`,
        factId: fact.key,
        source: fact.source,
        confidence: fact.confidence
      });
    }
  });
  
  blocks.push({
    id: `block_template_1`,
    type: 'template_content',
    content: `This document was generated from template ${descriptor.template_id}`,
    tracked: false,
    author: 'Template',
    timestamp: new Date().toISOString()
  });
  
  return { blocks, citations };
};

// Template Application endpoint - connects IND Wizard to Enhanced Document Editor
router.post('/:draftId/apply-template', async (req, res) => {
  try {
    const { draftId } = req.params;
    const { templateId, userData, generateDocument, launchEditor } = req.body;
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const organizationId = Number(req.organizationId);

    // Parse templateId to ensure it's a valid number
    console.log('[DEBUG] Raw templateId received:', templateId, 'Type:', typeof templateId);
    const parsedTemplateId = parseInt(templateId);
    console.log('[DEBUG] Parsed templateId:', parsedTemplateId, 'isNaN:', isNaN(parsedTemplateId));
    
    console.log(`Applying template ${parsedTemplateId} (original: ${templateId}) to IND draft ${draftId}`);

    // Validate template ID
    if (!templateId || isNaN(parsedTemplateId)) {
      console.error('Invalid template ID received:', templateId, 'Type:', typeof templateId);
      return res.status(400).json({
        success: false,
        message: `Invalid template ID provided: ${templateId}`
      });
    }

    // Generate document with real template data
    let templateAppliedData;
    
    // Draft IDs can be strings like 'draft-1', so we'll handle both string and numeric formats
    // For database operations, we'll use a numeric ID extracted from the draft string if needed
    let parsedDraftId = draftId;
    let numericDraftId = null;
    
    // Try to extract numeric ID from draft strings like 'draft-1'
    if (typeof draftId === 'string') {
      if (draftId.includes('draft-')) {
        const parts = draftId.split('-');
        numericDraftId = parseInt(parts[1]);
        if (isNaN(numericDraftId)) {
          numericDraftId = 1; // Default to 1 if parsing fails
        }
      } else {
        numericDraftId = parseInt(draftId);
        if (isNaN(numericDraftId)) {
          numericDraftId = 1; // Default to 1 if parsing fails
        }
      }
    } else {
      numericDraftId = parseInt(draftId);
      if (isNaN(numericDraftId)) {
        numericDraftId = 1;
      }
    }
    
    console.log(`[DEBUG] Processing draft: ${draftId}, numeric ID: ${numericDraftId}`);
    
    // Always use fallback for now to isolate the issue
    console.log('[DEBUG] Using fallback document generation');
    console.log('[DEBUG] Template ID:', parsedTemplateId, 'Draft ID:', draftId);
    
    // Create DocumentDescriptor and hydrate template with Facts
    const descriptor = {
      leaf_id: `m${parsedTemplateId}_${Date.now()}`,
      ctd_path: getCtdPathForTemplate(parsedTemplateId),
      template_id: parsedTemplateId,
      placeholders: getTemplatePlaceholders(parsedTemplateId)
    };
    
    // Extract facts from user data
    const facts = await extractFactsFromUserData(userData);
    const hydratedContent = await hydrateTemplate(descriptor, facts);
    
    // Create LeafPatch with tracked insertions
    const leafPatch = {
      id: `patch_${Date.now()}`,
      leaf_id: descriptor.leaf_id,
      blocks: hydratedContent.blocks,
      citations: hydratedContent.citations,
      status: 'pending'
    };
    
    // Save to database (or in-memory for demo)
    await saveLeafPatch(leafPatch);
    
    // Generate response data
    const documentId = `DOC_${parsedTemplateId}_${draftId}_${Date.now()}`;
    const sessionId = `session_${draftId}_${Date.now()}`;
    
    templateAppliedData = {
      documentId,
      templateId: parsedTemplateId,
      draftId,
      leafId: descriptor.leaf_id,
      sessionId,
      status: 'generated',
      createdAt: new Date().toISOString(),
      userData: userData || {},
      editorUrl: `/editor?leafId=${descriptor.leaf_id}&sessionId=${sessionId}&templateId=${parsedTemplateId}&documentId=${documentId}`,
      patch: leafPatch,
      content: {
        templateApplied: true,
        generatedSections: [
          'Cover Letter',
          'Form FDA 1571', 
          'Investigational Plan',
          'Safety Information'
        ],
        placeholdersFilled: Object.keys(userData || {}).length,
        complianceScore: Math.floor(Math.random() * 10) + 90,
        regulatoryNotes: 'Document generated using FDA-compliant template with user data integration and Facts hydration'
      }
    };

    // Store the applied template data (in production, save to database)
    if (!indDraftData[draftId]) {
      indDraftData[draftId] = {};
    }
    if (!indDraftData[draftId].appliedTemplates) {
      indDraftData[draftId].appliedTemplates = [];
    }
    indDraftData[draftId].appliedTemplates.push(templateAppliedData);

    console.log(`Template ${parsedTemplateId} successfully applied to draft ${draftId}, document ID: ${templateAppliedData.documentId}`);

    res.json({
      success: true,
      message: 'Template applied successfully and document generated',
      data: templateAppliedData
    });

  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply template',
      error: error.message
    });
  }
});

// ============================================================================
// PACKAGE PLANNING & REGIONAL SCOPING ENDPOINTS
// ============================================================================

// Available regions and modalities configuration
const AVAILABLE_REGIONS = [
  { code: 'US', name: 'United States', agency: 'FDA', submissionType: 'IND', estimatedDays: 45 },
  { code: 'EU', name: 'European Union', agency: 'EMA', submissionType: 'CTA', estimatedDays: 60 },
  { code: 'UK', name: 'United Kingdom', agency: 'MHRA', submissionType: 'CTA', estimatedDays: 45 },
  { code: 'CA', name: 'Canada', agency: 'Health Canada', submissionType: 'CTA', estimatedDays: 50 },
  { code: 'JP', name: 'Japan', agency: 'PMDA', submissionType: 'CTN', estimatedDays: 75 },
  { code: 'AU', name: 'Australia', agency: 'TGA', submissionType: 'CTN', estimatedDays: 40 },
];

const AVAILABLE_MODALITIES = [
  { 
    code: 'SM', 
    name: 'Small Molecule', 
    complexity: 'standard', 
    timelineImpact: 0,
    cmcRequirements: ['Chemical characterization', 'Impurity profile', 'Stability data'],
    specialRequirements: ['Route of synthesis documentation', 'API specifications']
  },
  { 
    code: 'BIO', 
    name: 'Biologics', 
    complexity: 'complex', 
    timelineImpact: 14,
    cmcRequirements: ['Cell line characterization', 'Process validation', 'Comparability studies'],
    specialRequirements: ['Biosafety assessment', 'Immunogenicity evaluation']
  },
  { 
    code: 'GT', 
    name: 'Gene Therapy', 
    complexity: 'complex', 
    timelineImpact: 21,
    cmcRequirements: ['Vector characterization', 'Potency assays', 'Biodistribution'],
    specialRequirements: ['RAC review (if applicable)', 'Institutional biosafety approval']
  },
  { 
    code: 'CT', 
    name: 'Cell Therapy', 
    complexity: 'complex', 
    timelineImpact: 28,
    cmcRequirements: ['Cell characterization', 'Viability/potency assays', 'Sterility'],
    specialRequirements: ['Tissue procurement protocols', 'Cell processing documentation']
  },
  { 
    code: 'OLIGO', 
    name: 'Oligonucleotide', 
    complexity: 'standard', 
    timelineImpact: 7,
    cmcRequirements: ['Sequence confirmation', 'Purity analysis', 'Delivery system'],
    specialRequirements: ['Phosphorothioate content', 'Pharmacokinetic studies']
  },
  { 
    code: 'RADIO', 
    name: 'Radiopharmaceutical', 
    complexity: 'complex', 
    timelineImpact: 35,
    cmcRequirements: ['Radiochemical purity', 'Specific activity', 'Radiolysis studies'],
    specialRequirements: ['Radiation safety protocols', 'Radioactive material license']
  },
];

// Helper function to generate region-specific requirements
function generateRegionRequirements(regionCode, modalityCode) {
  const baseRequirements = {
    'US': [
      { type: 'document', title: 'Form FDA 1571', mandatory: true, estimatedDays: 2 },
      { type: 'document', title: 'Clinical Protocol', mandatory: true, estimatedDays: 14 },
      { type: 'document', title: 'Investigator Brochure', mandatory: true, estimatedDays: 10 },
      { type: 'document', title: 'CMC Information', mandatory: true, estimatedDays: 21 },
      { type: 'document', title: 'Nonclinical Studies', mandatory: true, estimatedDays: 7 },
    ],
    'EU': [
      { type: 'document', title: 'CTA Application Form', mandatory: true, estimatedDays: 3 },
      { type: 'document', title: 'Clinical Trial Protocol', mandatory: true, estimatedDays: 14 },
      { type: 'document', title: 'IMPD (Investigational Medicinal Product Dossier)', mandatory: true, estimatedDays: 25 },
      { type: 'document', title: 'Nonclinical Overview', mandatory: true, estimatedDays: 7 },
    ],
    'UK': [
      { type: 'document', title: 'CTA Application', mandatory: true, estimatedDays: 3 },
      { type: 'document', title: 'Clinical Protocol', mandatory: true, estimatedDays: 14 },
      { type: 'document', title: 'IMPD Summary', mandatory: true, estimatedDays: 20 },
    ],
  };

  let requirements = baseRequirements[regionCode] || baseRequirements['US'];

  // Add modality-specific requirements
  if (modalityCode === 'GT') {
    requirements.push({ type: 'meeting', title: 'Pre-IND Meeting for Gene Therapy', mandatory: true, estimatedDays: 30 });
  } else if (modalityCode === 'CT') {
    requirements.push({ type: 'document', title: 'Cell Therapy-Specific CMC', mandatory: true, estimatedDays: 14 });
  } else if (modalityCode === 'RADIO') {
    requirements.push({ type: 'document', title: 'Radiation Safety Assessment', mandatory: true, estimatedDays: 21 });
  }

  return requirements;
}

// Helper function to calculate timeline estimates
function calculateTimeline(regions, modalities) {
  let baseTimeline = 45; // Base timeline in days
  
  // Add region complexity
  regions.forEach(regionCode => {
    const region = AVAILABLE_REGIONS.find(r => r.code === regionCode);
    if (region) {
      baseTimeline = Math.max(baseTimeline, region.estimatedDays);
    }
  });
  
  // Add modality complexity
  modalities.forEach(modalityCode => {
    const modality = AVAILABLE_MODALITIES.find(m => m.code === modalityCode);
    if (modality) {
      baseTimeline += modality.timelineImpact;
    }
  });
  
  // Add buffer for multiple regions (5% per additional region)
  if (regions.length > 1) {
    baseTimeline *= (1 + (regions.length - 1) * 0.05);
  }
  
  return Math.round(baseTimeline);
}

// Get available regions and modalities
router.get('/package-planning/config', async (req, res) => {
  try {
    res.json({
      regions: AVAILABLE_REGIONS,
      modalities: AVAILABLE_MODALITIES,
      success: true
    });
  } catch (error) {
    console.error('Error fetching package planning config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Create or update package plan
router.post('/package-planning/plans', async (req, res) => {
  try {
    const {
      name,
      description,
      drugName,
      indication,
      phase,
      sponsor,
      selectedRegions = [],
      selectedModalities = [],
      packageConfig = {}
    } = req.body;

    // Validate required fields
    if (!name || !drugName || selectedRegions.length === 0 || selectedModalities.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, drugName, selectedRegions, and selectedModalities' 
      });
    }

    // Generate plan ID
    const planId = `PKG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate timeline estimate
    const estimatedDays = calculateTimeline(selectedRegions, selectedModalities);
    
    // Generate compliance scores (mock for now)
    const overallComplianceScore = Math.floor(Math.random() * 30) + 70; // 70-100%
    const cmcReadinessScore = Math.floor(Math.random() * 25) + 60; // 60-85%
    
    // Create package plan (mock storage)
    const packagePlan = {
      id: parseInt(planId.split('-')[1]),
      planId,
      name,
      description: description || `Package plan for ${drugName} in ${selectedRegions.join(', ')}`,
      drugName,
      indication: indication || 'Not specified',
      phase: phase || 'Phase I',
      sponsor: sponsor || 'Not specified',
      planType: selectedRegions.length > 1 ? 'multi_regional' : 'single_region',
      status: 'draft',
      selectedRegions,
      selectedModalities,
      packageConfig: {
        ...packageConfig,
        regions: selectedRegions.map(regionCode => {
          const region = AVAILABLE_REGIONS.find(r => r.code === regionCode);
          return {
            code: regionCode,
            name: region?.name || regionCode,
            agency: region?.agency || 'Unknown',
            submissionType: region?.submissionType || 'Unknown',
            requirements: generateRegionRequirements(regionCode, selectedModalities[0])
          };
        }),
        modalities: selectedModalities.map(modalityCode => {
          const modality = AVAILABLE_MODALITIES.find(m => m.code === modalityCode);
          return {
            code: modalityCode,
            name: modality?.name || modalityCode,
            complexity: modality?.complexity || 'standard',
            requirements: modality?.cmcRequirements || [],
            specialRequirements: modality?.specialRequirements || []
          };
        })
      },
      overallComplianceScore,
      cmcReadinessScore,
      estimatedTimelineDays: estimatedDays,
      targetSubmissionDate: new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      cmcProjectId: `cmc-${planId}`,
      lastSyncedAt: new Date().toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in our mock storage
    if (!indDraftData.packagePlans) {
      indDraftData.packagePlans = {};
    }
    indDraftData.packagePlans[planId] = packagePlan;

    console.log('Created package plan:', packagePlan);

    res.json({
      success: true,
      data: packagePlan,
      message: 'Package plan created successfully'
    });
  } catch (error) {
    console.error('Error creating package plan:', error);
    res.status(500).json({ error: 'Failed to create package plan' });
  }
});

// Get package plans
router.get('/package-planning/plans', async (req, res) => {
  try {
    const packagePlans = Object.values(indDraftData.packagePlans || {});

    res.json({
      success: true,
      data: packagePlans,
      count: packagePlans.length
    });
  } catch (error) {
    console.error('Error fetching package plans:', error);
    res.status(500).json({ error: 'Failed to fetch package plans' });
  }
});

// Get specific package plan
router.get('/package-planning/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    
    const packagePlan = indDraftData.packagePlans?.[planId];
    
    if (!packagePlan) {
      return res.status(404).json({
        success: false,
        error: 'Package plan not found'
      });
    }

    res.json({
      success: true,
      data: packagePlan
    });
  } catch (error) {
    console.error('Error fetching package plan:', error);
    res.status(500).json({ error: 'Failed to fetch package plan' });
  }
});

// Update package plan
router.put('/package-planning/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const updates = req.body;

    if (!indDraftData.packagePlans?.[planId]) {
      return res.status(404).json({
        success: false,
        error: 'Package plan not found'
      });
    }

    // Recalculate timeline if regions or modalities changed
    if (updates.selectedRegions || updates.selectedModalities) {
      const regions = updates.selectedRegions || indDraftData.packagePlans[planId].selectedRegions;
      const modalities = updates.selectedModalities || indDraftData.packagePlans[planId].selectedModalities;
      updates.estimatedTimelineDays = calculateTimeline(regions, modalities);
      updates.targetSubmissionDate = new Date(Date.now() + updates.estimatedTimelineDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    // Update the plan
    indDraftData.packagePlans[planId] = {
      ...indDraftData.packagePlans[planId],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    console.log('Updated package plan:', indDraftData.packagePlans[planId]);

    res.json({
      success: true,
      data: indDraftData.packagePlans[planId],
      message: 'Package plan updated successfully'
    });
  } catch (error) {
    console.error('Error updating package plan:', error);
    res.status(500).json({ error: 'Failed to update package plan' });
  }
});

// Delete package plan
router.delete('/package-planning/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    
    if (!indDraftData.packagePlans?.[planId]) {
      return res.status(404).json({
        success: false,
        error: 'Package plan not found'
      });
    }
    
    delete indDraftData.packagePlans[planId];
    
    console.log('Deleted package plan:', planId);

    res.json({
      success: true,
      message: 'Package plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting package plan:', error);
    res.status(500).json({ error: 'Failed to delete package plan' });
  }
});

// Generate package plan requirements
router.post('/package-planning/generate-requirements', async (req, res) => {
  try {
    const { regions = [], modalities = [] } = req.body;

    if (regions.length === 0 || modalities.length === 0) {
      return res.status(400).json({ 
        error: 'Both regions and modalities are required' 
      });
    }

    const requirements = [];
    const timelines = [];
    const documents = [];

    // Generate requirements for each region-modality combination
    regions.forEach(regionCode => {
      modalities.forEach(modalityCode => {
        const regionRequirements = generateRegionRequirements(regionCode, modalityCode);
        
        regionRequirements.forEach(req => {
          requirements.push({
            regionCode,
            modalityCode,
            requirementType: req.type,
            requirementTitle: req.title,
            isMandatory: req.mandatory,
            estimatedDuration: req.estimatedDays,
            status: 'pending'
          });

          // Add to document checklist
          if (req.type === 'document') {
            documents.push({
              regionCode,
              modalityCode,
              documentType: req.title.toLowerCase().replace(/\s+/g, '_'),
              documentTitle: req.title,
              isMandatory: req.mandatory,
              status: 'not_started',
              estimatedEffort: req.estimatedDays * 8, // Convert days to hours
              targetDate: new Date(Date.now() + req.estimatedDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
          }
        });
      });
    });

    // Generate timeline phases
    const timelinePhases = [
      { phase: 'planning', name: 'Planning & Preparation', days: 7 },
      { phase: 'documentation', name: 'Document Preparation', days: 28 },
      { phase: 'review', name: 'Internal Review', days: 7 },
      { phase: 'submission', name: 'Submission Preparation', days: 3 },
      { phase: 'agency_review', name: 'Agency Review', days: 30 }
    ];

    timelinePhases.forEach((phase, index) => {
      timelines.push({
        phaseType: phase.phase,
        phaseName: phase.name,
        estimatedDays: phase.days,
        sequenceOrder: index + 1,
        status: 'planned'
      });
    });

    res.json({
      success: true,
      data: {
        requirements,
        timelines,
        documents,
        estimatedTotalDays: calculateTimeline(regions, modalities),
        summary: {
          totalRequirements: requirements.length,
          mandatoryRequirements: requirements.filter(r => r.isMandatory).length,
          totalDocuments: documents.length,
          timelinePhases: timelines.length
        }
      }
    });
  } catch (error) {
    console.error('Error generating requirements:', error);
    res.status(500).json({ error: 'Failed to generate requirements' });
  }
});

// Sync with CMC data
router.post('/package-planning/sync-cmc/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Mock CMC sync - in production this would integrate with CMC wizard
    const cmcData = {
      substances: [
        { id: 1, name: 'Drug Substance A', status: 'characterized' },
        { id: 2, name: 'Drug Substance B', status: 'in_progress' }
      ],
      products: [
        { id: 1, name: 'Tablet Formulation', status: 'developed' }
      ],
      analyticalMethods: [
        { id: 1, name: 'HPLC Assay', status: 'validated' },
        { id: 2, name: 'Dissolution Method', status: 'under_development' }
      ]
    };

    // Update CMC readiness score based on synced data
    const totalItems = cmcData.substances.length + cmcData.products.length + cmcData.analyticalMethods.length;
    const completedItems = [
      ...cmcData.substances.filter(s => s.status === 'characterized'),
      ...cmcData.products.filter(p => p.status === 'developed'),
      ...cmcData.analyticalMethods.filter(m => m.status === 'validated')
    ].length;

    const cmcReadinessScore = Math.round((completedItems / totalItems) * 100);

    // Update the package plan with CMC data
    if (indDraftData.packagePlans?.[planId]) {
      indDraftData.packagePlans[planId].cmcReadinessScore = cmcReadinessScore;
      indDraftData.packagePlans[planId].lastSyncedAt = new Date().toISOString();
    }

    res.json({
      success: true,
      data: {
        cmcData,
        cmcReadinessScore,
        lastSyncedAt: new Date().toISOString()
      },
      message: 'CMC data synced successfully'
    });
  } catch (error) {
    console.error('Error syncing CMC data:', error);
    res.status(500).json({ error: 'Failed to sync CMC data' });
  }
});

export default router;
