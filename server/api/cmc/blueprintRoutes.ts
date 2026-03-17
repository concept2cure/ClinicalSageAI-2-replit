import { Router } from 'express';
import regulatoryIR from './regulatoryIR.js';
import portfolio from './portfolio.js';
import playbookRoutes from './playbookRoutes.js';
import { pool } from '../../db.js';
import { getOpenAIClient } from '../../services/openai-client';
import crypto from 'crypto';

const router = Router();

// Initialize OpenAI client
const openai = getOpenAIClient();

// ===== BLUEPRINT GENERATION =====

// Generate comprehensive CMC blueprint
router.post('/generate-blueprint', async (req, res) => {
  try {
    const {
      drugName,
      drugType,
      dosageForm,
      indication,
      developmentStage,
      regulatoryRegion,
      manufacturingSite,
      targetSubmissionDate,
      organizationId,
    } = req.body;

    // Validate required fields
    if (!drugName || !drugType || !dosageForm || !organizationId) {
      return res.status(400).json({
        error: 'Missing required fields: drugName, drugType, dosageForm, organizationId',
      });
    }

    // Create CMC project in database
    const projectData = {
      organizationId,
      name: `${drugName} CMC Project`,
      drugName,
      drugType,
      dosageForm,
      indication: indication || 'To be defined',
      developmentStage: developmentStage || 'Preclinical',
      regulatoryRegion: regulatoryRegion || 'FDA (United States)',
      manufacturingSite,
      targetSubmissionDate: targetSubmissionDate ? new Date(targetSubmissionDate) : null,
      projectManager: 'System Generated',
      status: 'active',
    };

    // Create project using raw SQL query
    const projectId = crypto.randomUUID();
    const insertProjectQuery = `
      INSERT INTO cmc_projects (
        id, organization_id, name, drug_name, drug_type, dosage_form,
        indication, development_stage, regulatory_region, manufacturing_site,
        target_submission_date, project_manager, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `;

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const projectResult = await pool.query(insertProjectQuery, [
      projectId,
      projectData.organizationId,
      projectData.name,
      projectData.drugName,
      projectData.drugType,
      projectData.dosageForm,
      projectData.indication,
      projectData.developmentStage,
      projectData.regulatoryRegion,
      projectData.manufacturingSite,
      projectData.targetSubmissionDate,
      projectData.projectManager,
      projectData.status,
    ]);

    const newProject = projectResult.rows[0];

    // Generate AI-powered blueprint content
    const blueprintContent = await generateAIBlueprint({
      drugName,
      drugType,
      dosageForm,
      indication,
      developmentStage,
      regulatoryRegion,
    });

    // Create workflow templates based on blueprint
    const workflowTemplates = await createWorkflowTemplates(
      newProject.id,
      blueprintContent,
      organizationId
    );

    // Create initial compliance framework
    const complianceFramework = await createComplianceFramework(newProject.id, {
      drugType,
      developmentStage,
      regulatoryRegion,
    });

    // Generate risk assessment
    const riskAssessment = await generateRiskAssessment(newProject.id, {
      drugType,
      dosageForm,
      developmentStage,
    });

    const response = {
      project: newProject,
      blueprint: blueprintContent,
      workflows: workflowTemplates,
      compliance: complianceFramework,
      risks: riskAssessment,
      nextActions: generateInitialNextActions(drugType, developmentStage),
      timeline: generateProjectTimeline(developmentStage, targetSubmissionDate),
    };

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Error generating CMC blueprint:', error);
    res.status(500).json({ error: 'Failed to generate CMC blueprint' });
  }
});

// Get blueprint templates by category
router.get('/templates', async (req, res) => {
  try {
    const { category, drugType, developmentStage, organizationId } = req.query;

    let queryText = 'SELECT * FROM workflow_templates WHERE 1=1';
    let params = [];

    if (organizationId) {
      queryText += ` AND organization_id = $${params.length + 1}`;
      params.push(organizationId);
    }

    if (category) {
      queryText += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    if (drugType) {
      queryText += ` AND (drug_type IS NULL OR drug_type = $${params.length + 1})`;
      params.push(drugType);
    }

    if (developmentStage) {
      queryText += ` AND (development_stage IS NULL OR development_stage = $${params.length + 1})`;
      params.push(developmentStage);
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const result = await pool.query(queryText, params);
    const filteredTemplates = result.rows;

    res.json({ success: true, data: filteredTemplates });
  } catch (error) {
    console.error('Error fetching blueprint templates:', error);
    res.status(500).json({ error: 'Failed to fetch blueprint templates' });
  }
});

// Create custom workflow template
router.post('/templates', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { name, description, category, organizationId } = req.body;

    if (!name || !organizationId) {
      return res.status(400).json({ error: 'Name and organization ID required' });
    }

    const templateId = crypto.randomUUID();
    const insertQuery = `
      INSERT INTO cmc_workflows (
        id, organization_id, name, description, category, 
        estimated_time, total_tasks, priority, is_template, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      templateId,
      organizationId,
      name,
      description || '',
      category || 'custom',
      'Custom timing',
      0,
      'medium',
      true,
    ]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating workflow template:', error);
    res.status(500).json({ error: 'Failed to create workflow template' });
  }
});

// ===== AI-POWERED HELPER FUNCTIONS =====

async function generateAIBlueprint(params: any) {
  try {
    const { drugName, drugType, dosageForm, indication, developmentStage, regulatoryRegion } =
      params;

    const prompt = `Generate a comprehensive CMC (Chemistry, Manufacturing, and Controls) blueprint for the following pharmaceutical product:

Drug Name: ${drugName}
Drug Type: ${drugType}
Dosage Form: ${dosageForm}
Indication: ${indication}
Development Stage: ${developmentStage}
Regulatory Region: ${regulatoryRegion}

Provide a detailed blueprint that includes:

1. Drug Substance (3.2.S) requirements:
   - General Information needs
   - Manufacture process considerations
   - Characterization requirements
   - Control strategy
   - Reference standards
   - Container closure system
   - Stability requirements

2. Drug Product (3.2.P) requirements:
   - Description and composition
   - Pharmaceutical development strategy
   - Manufacture process design
   - Control of excipients
   - Control of drug product
   - Reference standards
   - Container closure system
   - Stability program

3. Critical Quality Attributes (CQAs)
4. Critical Process Parameters (CPPs)
5. Quality by Design (QbD) elements
6. Analytical method requirements
7. Stability study design
8. Regulatory compliance considerations
9. Risk assessment framework
10. Project timeline and milestones

Structure the response as a comprehensive regulatory strategy document.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert pharmaceutical regulatory affairs specialist with deep expertise in CMC development and ICH guidelines. Provide detailed, scientifically accurate, and regulatory-compliant guidance.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const blueprintText = completion.choices[0].message.content || '';

    // Parse the AI response into structured data
    return {
      id: crypto.randomUUID(),
      summary: `Comprehensive CMC strategy for ${drugName}`,
      content: blueprintText,
      sections: {
        drugSubstance: {
          title: 'Drug Substance (3.2.S)',
          requirements: extractSectionRequirements(blueprintText, 'Drug Substance'),
          criticalItems: extractCriticalItems(blueprintText, 'drug substance'),
          timeline: '8-12 weeks',
        },
        drugProduct: {
          title: 'Drug Product (3.2.P)',
          requirements: extractSectionRequirements(blueprintText, 'Drug Product'),
          criticalItems: extractCriticalItems(blueprintText, 'drug product'),
          timeline: '10-14 weeks',
        },
        qualityByDesign: {
          title: 'Quality by Design',
          cqas: extractCQAs(blueprintText, drugType),
          cpps: extractCPPs(blueprintText, dosageForm),
          designSpace: 'To be established during development',
        },
        analyticalMethods: {
          title: 'Analytical Methods',
          required: generateAnalyticalMethods(drugType, dosageForm),
          validationRequirements: 'ICH Q2(R1) compliance required',
        },
        stabilityStudies: {
          title: 'Stability Studies',
          studies: generateStabilityStudies(dosageForm, developmentStage),
          conditions: getStabilityConditions(regulatoryRegion),
        },
      },
      compliance: {
        guidelines: getApplicableGuidelines(drugType, regulatoryRegion),
        requirements: extractComplianceRequirements(blueprintText),
      },
      riskAssessment: {
        technicalRisks: extractTechnicalRisks(blueprintText),
        regulatoryRisks: extractRegulatoryRisks(regulatoryRegion, developmentStage),
        mitigationStrategies: extractMitigationStrategies(blueprintText),
      },
    };
  } catch (error) {
    console.error('Error generating AI blueprint:', error);
    // Return a structured fallback blueprint
    return generateFallbackBlueprint(params);
  }
}

async function createWorkflowTemplates(projectId: string, blueprint: any, organizationId: string) {
  const templates = [
    {
      name: 'Drug Substance Development',
      category: 'Development',
      description: 'Complete workflow for drug substance development and characterization',
      templateData: {
        phases: [
          {
            name: 'Characterization',
            tasks: [
              'Structure elucidation',
              'Physicochemical properties',
              'Impurity profiling',
              'Reference standard qualification',
            ],
          },
          {
            name: 'Manufacturing',
            tasks: [
              'Process development',
              'Scale-up studies',
              'Process validation',
              'Commercial manufacturing',
            ],
          },
        ],
      },
    },
    {
      name: 'Analytical Method Development',
      category: 'Development',
      description: 'Systematic approach to analytical method development and validation',
      templateData: {
        phases: [
          {
            name: 'Method Development',
            tasks: ['Method design', 'Optimization', 'Robustness testing', 'Method transfer'],
          },
          {
            name: 'Validation',
            tasks: ['Specificity', 'Linearity', 'Accuracy', 'Precision', 'Robustness'],
          },
        ],
      },
    },
  ];

  // For now, return mock templates since we're using the playbook routes for workflow management
  return templates.map(template => ({
    id: crypto.randomUUID(),
    organizationId,
    name: template.name,
    description: template.description,
    category: template.category,
    templateData: template.templateData,
    createdBy: 'system',
  }));
}

async function createComplianceFramework(projectId: string, params: any) {
  const { drugType, developmentStage, regulatoryRegion } = params;

  // Generate compliance items based on drug type and region
  const complianceItems = [
    {
      guideline: 'ICH Q2(R1)',
      requirement: 'Analytical method validation',
      status: 'pending',
      riskLevel: 'high',
      dueDate: null,
    },
    {
      guideline: 'ICH Q1A(R2)',
      requirement: 'Stability testing requirements',
      status: 'pending',
      riskLevel: 'high',
      dueDate: null,
    },
    {
      guideline: 'ICH Q6A',
      requirement: 'Specifications for drug substances and drug products',
      status: 'pending',
      riskLevel: 'medium',
      dueDate: null,
    },
  ];

  if (drugType === 'Monoclonal Antibody' || drugType === 'Peptide/Protein') {
    complianceItems.push({
      guideline: 'ICH Q6B',
      requirement: 'Specifications for biotechnological products',
      status: 'pending',
      riskLevel: 'high',
      dueDate: null,
    });
  }

  return complianceItems;
}

async function generateRiskAssessment(projectId: string, params: any) {
  const { drugType, dosageForm, developmentStage } = params;

  const risks = [
    {
      type: 'Technical',
      description: 'Analytical method development challenges',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Early method development with multiple analytical approaches',
    },
    {
      type: 'Regulatory',
      description: 'Changing regulatory requirements',
      likelihood: 'low',
      impact: 'high',
      mitigation: 'Regular monitoring of regulatory guidance updates',
    },
    {
      type: 'Manufacturing',
      description: 'Scale-up challenges',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Robust process development with scale-down models',
    },
  ];

  if (drugType === 'Monoclonal Antibody') {
    risks.push({
      type: 'Quality',
      description: 'Product-related variants and impurities',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Comprehensive analytical characterization and control strategy',
    });
  }

  return risks;
}

// ===== UTILITY FUNCTIONS =====

function extractSectionRequirements(text: string, section: string): string[] {
  // Extract requirements from AI-generated text
  const lines = text.split('\n');
  const requirements = [];
  let inSection = false;

  for (const line of lines) {
    if (line.toLowerCase().includes(section.toLowerCase())) {
      inSection = true;
      continue;
    }

    if (inSection && (line.startsWith('-') || line.startsWith('•'))) {
      requirements.push(line.replace(/^[-•]\s*/, '').trim());
    }

    if (inSection && line.trim() === '') {
      continue;
    }

    if (inSection && line.match(/^\d+\./)) {
      break;
    }
  }

  return requirements.slice(0, 10); // Limit to 10 requirements
}

function extractCriticalItems(text: string, context: string): string[] {
  return [
    'Characterization of critical quality attributes',
    'Development of control strategy',
    'Establishment of specifications',
    'Validation of analytical methods',
  ];
}

function extractCQAs(text: string, drugType: string): string[] {
  const baseCQAs = ['Identity', 'Purity', 'Potency', 'Stability'];

  if (drugType === 'Monoclonal Antibody') {
    baseCQAs.push('Aggregation', 'Charge variants', 'Glycosylation');
  }

  if (drugType === 'Small Molecule') {
    baseCQAs.push('Related substances', 'Residual solvents', 'Heavy metals');
  }

  return baseCQAs;
}

function extractCPPs(text: string, dosageForm: string): string[] {
  const baseCPPs = ['Temperature', 'pH', 'Mixing time'];

  if (dosageForm.includes('Tablet')) {
    baseCPPs.push('Compression force', 'Tablet hardness');
  }

  if (dosageForm.includes('Injectable')) {
    baseCPPs.push('Filtration parameters', 'Fill volume');
  }

  return baseCPPs;
}

function generateAnalyticalMethods(drugType: string, dosageForm: string): any[] {
  const methods = [
    { name: 'Identity by HPLC', purpose: 'Identity confirmation' },
    { name: 'Assay by HPLC', purpose: 'Quantitative determination' },
    { name: 'Related substances by HPLC', purpose: 'Impurity testing' },
  ];

  if (drugType === 'Monoclonal Antibody') {
    methods.push(
      { name: 'Size exclusion chromatography', purpose: 'Aggregation analysis' },
      { name: 'Ion exchange chromatography', purpose: 'Charge variant analysis' }
    );
  }

  return methods;
}

function generateStabilityStudies(dosageForm: string, developmentStage: string): any[] {
  const studies = [
    { type: 'Long-term', conditions: '25°C/60% RH', duration: '24 months' },
    { type: 'Accelerated', conditions: '40°C/75% RH', duration: '6 months' },
  ];

  if (dosageForm.includes('Injectable')) {
    studies.push({
      type: 'Stress testing',
      conditions: 'Various stress conditions',
      duration: 'As needed',
    });
  }

  return studies;
}

function getStabilityConditions(region: string): any {
  if (region.includes('EMA')) {
    return {
      longTerm: '25°C/60% RH',
      accelerated: '40°C/75% RH',
      intermediate: '30°C/65% RH',
    };
  }

  return {
    longTerm: '25°C/60% RH',
    accelerated: '40°C/75% RH',
  };
}

function getApplicableGuidelines(drugType: string, region: string): string[] {
  const guidelines = ['ICH Q2(R1)', 'ICH Q1A(R2)', 'ICH Q6A'];

  if (drugType === 'Monoclonal Antibody') {
    guidelines.push('ICH Q6B');
  }

  if (region.includes('FDA')) {
    guidelines.push('FDA Guidance for Industry');
  }

  return guidelines;
}

function generateInitialNextActions(drugType: string, developmentStage: string): string[] {
  return [
    'Complete drug substance characterization',
    'Develop analytical methods',
    'Design stability studies',
    'Establish manufacturing process',
    'Define control strategy',
  ];
}

function generateProjectTimeline(developmentStage: string, targetDate: string | null): any {
  const baseTimeline = {
    total: '52 weeks',
    phases: [
      { name: 'Drug Substance Development', duration: '16 weeks' },
      { name: 'Drug Product Development', duration: '14 weeks' },
      { name: 'Analytical Development', duration: '12 weeks' },
      { name: 'Stability Studies', duration: '26 weeks (ongoing)' },
      { name: 'Documentation', duration: '8 weeks' },
    ],
  };

  if (targetDate) {
    const target = new Date(targetDate);
    const now = new Date();
    const weeksUntilTarget = Math.ceil(
      (target.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    baseTimeline.total = `${weeksUntilTarget} weeks available`;
  }

  return baseTimeline;
}

function generateFallbackBlueprint(params: any): any {
  return {
    id: crypto.randomUUID(),
    summary: `Basic CMC strategy for ${params.drugName}`,
    content: 'Fallback blueprint content generated due to AI service unavailability.',
    sections: {
      drugSubstance: {
        title: 'Drug Substance (3.2.S)',
        requirements: ['General Information', 'Manufacture', 'Characterization'],
        timeline: '8-12 weeks',
      },
      drugProduct: {
        title: 'Drug Product (3.2.P)',
        requirements: ['Description and Composition', 'Pharmaceutical Development'],
        timeline: '10-14 weeks',
      },
    },
  };
}

// Additional utility functions for text extraction
function extractComplianceRequirements(text: string): string[] {
  return ['ICH guidelines compliance', 'Regulatory submission requirements'];
}

function extractTechnicalRisks(text: string): string[] {
  return ['Method development challenges', 'Manufacturing scale-up risks'];
}

function extractRegulatoryRisks(region: string, stage: string): string[] {
  return ['Regulatory guidance changes', 'Submission timeline risks'];
}

function extractMitigationStrategies(text: string): string[] {
  return ['Early risk identification', 'Robust development approach'];
}

// Mount regulatory IR routes
router.use('/regulatory', regulatoryIR);
// Mount portfolio routes
router.use('/portfolio', portfolio);
// Mount playbook routes
router.use('/playbook', playbookRoutes);

export default router;
