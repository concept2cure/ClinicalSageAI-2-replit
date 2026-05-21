import { Request, Response, Router } from 'express';

const router = Router();

// Enhanced AI compliance scoring algorithm
const calculateComplianceScore = (content: string, templateType: string): number => {
  if (!content || content.length < 50) return 0;

  const words = content.toLowerCase().split(/\s+/);
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);

  let score = 0;
  let maxScore = 100;

  // Content length adequacy (15 points)
  if (words.length >= 500) score += 15;
  else if (words.length >= 200) score += 10;
  else if (words.length >= 100) score += 5;

  // Regulatory keywords presence (25 points)
  const regulatoryKeywords = [
    'specification',
    'validation',
    'ich',
    'gmp',
    'analytical',
    'batch',
    'stability',
    'compliance',
    'guideline',
    'acceptance criteria',
    'method',
    'quality',
    'control',
    'standard',
    'procedure',
    'protocol',
    'rationale',
  ];

  const foundKeywords = regulatoryKeywords.filter(keyword =>
    content.toLowerCase().includes(keyword)
  );
  score += Math.min(25, (foundKeywords.length / regulatoryKeywords.length) * 25);

  // Structured content (20 points)
  const hasHeaders = /^#+\s+/m.test(content) || /^\d+\.\s+/m.test(content);
  const hasBullets = /^[•\-\*]\s+/m.test(content);
  const hasNumbering = /^\d+\.\d+\s+/m.test(content);

  if (hasHeaders) score += 8;
  if (hasBullets) score += 6;
  if (hasNumbering) score += 6;

  // Technical depth (20 points)
  const technicalTerms = [
    'chromatography',
    'spectroscopy',
    'hplc',
    'gc',
    'ms',
    'uv',
    'ir',
    'nmr',
    'dissolution',
    'bioavailability',
    'pharmacokinetic',
    'impurity',
    'degradation',
    'formulation',
    'excipient',
    'api',
    'manufacturing',
    'process validation',
  ];

  const foundTechnical = technicalTerms.filter(term => content.toLowerCase().includes(term));
  score += Math.min(20, (foundTechnical.length / technicalTerms.length) * 20);

  // Reference quality (20 points)
  const hasICHRef = /ich\s+[qr]\d+/i.test(content);
  const hasFDARef = /fda|cder|cber/i.test(content);
  const hasEMARef = /ema|chmp/i.test(content);
  const hasUSPRef = /usp|ep|jp/i.test(content);

  if (hasICHRef) score += 8;
  if (hasFDARef) score += 4;
  if (hasEMARef) score += 4;
  if (hasUSPRef) score += 4;

  return Math.min(100, Math.round(score));
};

// AI-powered content suggestions
const generateContentSuggestions = (content: string, templateType: string): string[] => {
  const suggestions = [];
  const lowerContent = content.toLowerCase();

  // Check for common missing elements
  if (!lowerContent.includes('specification') && templateType.includes('control')) {
    suggestions.push('Consider adding specification rationale and acceptance criteria');
  }

  if (!lowerContent.includes('validation') && templateType.includes('analytical')) {
    suggestions.push('Include analytical method validation summary');
  }

  if (!lowerContent.includes('batch') && templateType.includes('control')) {
    suggestions.push('Add representative batch analysis data');
  }

  if (!lowerContent.includes('ich') && !lowerContent.includes('guideline')) {
    suggestions.push('Reference applicable ICH guidelines');
  }

  if (content.split(' ').length < 200) {
    suggestions.push('Content appears brief - consider expanding technical details');
  }

  return suggestions;
};

// Regulatory content mapping database
const regulatoryKnowledgeBase: Record<string, any> = {
  '3.2.S.4': {
    title: 'Drug Substance Control',
    ichReferences: ['ICH Q6A', 'ICH Q3A', 'ICH Q3D'],
    fdaGuidance: ['Pharmaceutical Development Q8', 'Analytical Procedures Q2(R1)'],
    emaGuidance: ['EMA/CHMP/ICH/295/95', 'EMA/CHMP/167068/2004'],
    whoGuidance: ['WHO TRS 986', 'WHO Technical Report Series No. 937'],
    requiredElements: [
      'Specification rationale and justification',
      'Analytical procedures and validation',
      'Batch analysis data (minimum 3 batches)',
      'Impurity profile and limits justification',
      'Reference standards information',
      'Container closure compatibility',
    ],
    criticalFlags: [
      {
        trigger: ['microbial', 'bioburden', 'sterility'],
        severity: 'high',
        message:
          'EMA requires justification if microbial limits are omitted from drug substance specification',
        reference: 'ICH Q6A Section 3.1',
        boilerplate: `Microbial limits are not included in the drug substance specification because [JUSTIFICATION REQUIRED]. The drug substance manufacturing process includes [STERILIZATION METHOD] which ensures microbial quality. Additionally, the drug product manufacturing process includes terminal sterilization at [CONDITIONS], providing adequate bioburden control as per ICH Q6A guidelines.`,
      },
      {
        trigger: ['heavy metals', 'elemental impurities', 'catalysts'],
        severity: 'medium',
        message: 'Consider ICH Q3D guidelines for elemental impurities assessment',
        reference: 'ICH Q3D Step 4',
        boilerplate: `Elemental impurities assessment has been conducted according to ICH Q3D guidelines. Based on the manufacturing process analysis, the following elements are controlled: [LIST ELEMENTS]. Risk assessment indicates [CONCLUSION]. Specification limits are established based on [RATIONALE] and comply with ICH Q3D permitted daily exposure limits.`,
      },
      {
        trigger: ['batch analysis', 'certificate of analysis', 'CoA'],
        severity: 'medium',
        message: 'Include representative batch analysis data with CoA numbers',
        reference: 'ICH Q6A Section 2.1',
        boilerplate: `Representative batch analysis data from validation and commercial batches are provided below:\n\nBatch Number: [BATCH_NO_1]\nManufacturing Date: [DATE]\nAssay: [RESULT] (Specification: [SPEC])\nImpurities: [RESULTS]\n\nBatch Number: [BATCH_NO_2]\n[CONTINUE FOR MINIMUM 3 BATCHES]`,
      },
    ],
  },
  '3.2.P.2': {
    title: 'Pharmaceutical Development',
    ichReferences: ['ICH Q8(R2)', 'ICH Q9', 'ICH Q10'],
    fdaGuidance: ['Pharmaceutical Development Q8 Questions and Answers'],
    emaGuidance: ['EMA/CHMP/167068/2004'],
    requiredElements: [
      'Components of the drug product and their functions',
      'Drug product development rationale',
      'Manufacturing process development and validation',
      'Container closure system development',
      'Microbiological attributes (if applicable)',
      'Compatibility studies',
    ],
    criticalFlags: [
      {
        trigger: ['design space', 'process parameters', 'critical quality attributes'],
        severity: 'medium',
        message:
          'Consider defining design space per ICH Q8(R2) for enhanced regulatory flexibility',
        reference: 'ICH Q8(R2) Section 2.2',
        boilerplate: `Design space has been established for [PROCESS STEP] based on multivariate studies. The design space encompasses the following parameters:\n\n• [PARAMETER 1]: [RANGE] ([UNITS])\n• [PARAMETER 2]: [RANGE] ([UNITS])\n\nRisk assessment per ICH Q9 confirms that operation within this design space ensures consistent product quality. Any changes within the design space would not require regulatory notification as per ICH Q8(R2) principles.`,
      },
      {
        trigger: ['risk assessment', 'quality risk management', 'FMEA'],
        severity: 'high',
        message: 'Include quality risk management principles per ICH Q9',
        reference: 'ICH Q9 Section 4',
        boilerplate: `Quality risk management has been applied throughout pharmaceutical development following ICH Q9 principles. Risk assessment methodology: [FMEA/HAZOP/OTHER]. \n\nCritical Quality Attributes (CQAs) identified:\n• [CQA_1]: [JUSTIFICATION]\n• [CQA_2]: [JUSTIFICATION]\n\nCritical Process Parameters (CPPs):\n• [CPP_1]: [RANGE AND JUSTIFICATION]\n• [CPP_2]: [RANGE AND JUSTIFICATION]\n\nRisk mitigation strategies are implemented for high-risk scenarios.`,
      },
    ],
  },
  '3.2.S.7': {
    title: 'Stability Studies',
    ichReferences: ['ICH Q1A(R2)', 'ICH Q1B', 'ICH Q1C', 'ICH Q1E'],
    fdaGuidance: ['Stability Testing of Drug Substances and Products'],
    emaGuidance: ['EMA/CHMP/ICH/2736/99', 'EMA/CHMP/ICH/380/95'],
    requiredElements: [
      'Stability study protocol and design',
      'Photostability testing (ICH Q1B)',
      'Forced degradation studies',
      'Long-term and accelerated data',
      'Statistical analysis and trending',
      'Proposed retest period/shelf life',
      'Storage conditions justification',
    ],
    criticalFlags: [
      {
        trigger: ['photostability', 'light sensitivity', 'photo degradation'],
        severity: 'medium',
        message: 'Include photostability testing per ICH Q1B requirements',
        reference: 'ICH Q1B Section 4',
        boilerplate: `Photostability testing was conducted according to ICH Q1B guidelines. Drug substance samples were exposed to [LIGHT CONDITIONS] for [DURATION]. Results demonstrate [CONCLUSION - PHOTOSENSITIVE/PHOTOSTABLE]. Based on these findings, [STORAGE RECOMMENDATION] storage conditions are recommended to maintain stability.`,
      },
      {
        trigger: ['forced degradation', 'stress testing', 'degradation pathway'],
        severity: 'high',
        message:
          'Include comprehensive forced degradation studies to understand degradation pathways',
        reference: 'ICH Q1A(R2) Section 2.1.2',
        boilerplate: `Forced degradation studies were performed under the following conditions:\n\n• Hydrolytic: [pH CONDITIONS] at [TEMPERATURE]\n• Oxidative: [H2O2 CONCENTRATION] at [CONDITIONS]\n• Thermal: [TEMPERATURE] for [DURATION]\n• Photolytic: ICH Q1B Option 1/2 conditions\n\nDegradation products identified: [LIST MAJOR DEGRADANTS]\nDegradation pathways proposed: [MECHANISMS]\nThese studies support the analytical method development and specification setting.`,
      },
      {
        trigger: ['retest period', 'shelf life', 'expiry', 'dating'],
        severity: 'high',
        message: 'Provide statistical justification for proposed retest period',
        reference: 'ICH Q1A(R2) Section 3.3',
        boilerplate: `Statistical analysis of stability data supports a retest period of [TIME PERIOD]. Analysis method: [LINEAR REGRESSION/ANOVA]. Confidence level: 95%. Worst-case scenario considered: [CONDITIONS]. The proposed retest period ensures that [ACCEPTANCE CRITERIA] will be met throughout the intended storage period with appropriate safety margin.`,
      },
    ],
  },
  '3.2.P.5': {
    title: 'Control of Drug Product',
    ichReferences: ['ICH Q6A', 'ICH Q3B', 'ICH Q2(R1)'],
    fdaGuidance: ['Pharmaceutical Development Q8', 'PAT Guidance'],
    emaGuidance: ['EMA/CHMP/ICH/295/95'],
    requiredElements: [
      'Specification and rationale',
      'Analytical procedures and validation',
      'Batch analysis data',
      'Impurity profile and degradation products',
      'Content uniformity (if applicable)',
      'Dissolution testing (solid dosage forms)',
      'Microbial limits (if applicable)',
    ],
    criticalFlags: [
      {
        trigger: ['dissolution', 'release profile', 'drug release'],
        severity: 'high',
        message: 'Include dissolution method development and validation for solid dosage forms',
        reference: 'ICH Q6A Section 3.3.2',
        boilerplate: `Dissolution testing methodology has been developed and validated. Method details:\n\nApparatus: [USP TYPE I/II/III/IV]\nMedium: [BUFFER/pH]\nVolume: [mL]\nRotation speed: [rpm]\nTemperature: [°C]\nSampling times: [TIME POINTS]\n\nMethod validation demonstrates: [PRECISION, ACCURACY, LINEARITY]. Dissolution profile: [% DISSOLVED AT SPECIFIED TIMES]. Acceptance criteria: [LIMITS] are based on [RATIONALE].`,
      },
      {
        trigger: ['content uniformity', 'blend uniformity', 'dosage unit'],
        severity: 'medium',
        message: 'Content uniformity testing required for dosage forms',
        reference: 'ICH Q6A Section 3.3.1',
        boilerplate: `Content uniformity testing performed according to [USP/EP/JP] method. Acceptance criteria: [LIMITS]. Results from [NUMBER] batches demonstrate compliance. Statistical analysis shows [RSD/CV] within acceptable limits. Method validation includes [VALIDATION PARAMETERS].`,
      },
    ],
  },
  '3.2.A.1': {
    title: 'Facilities and Equipment',
    ichReferences: ['ICH Q7', 'ICH Q10'],
    fdaGuidance: ['cGMP Guidelines', 'Process Validation'],
    emaGuidance: ['EudraLex Volume 4'],
    requiredElements: [
      'Manufacturing facility description',
      'Equipment qualification (IQ/OQ/PQ)',
      'Environmental controls and monitoring',
      'Quality control laboratory capabilities',
      'Materials handling and storage',
      'Cleaning validation',
    ],
    criticalFlags: [
      {
        trigger: ['equipment qualification', 'IQ OQ PQ', 'validation'],
        severity: 'high',
        message: 'Include comprehensive equipment qualification documentation',
        reference: 'ICH Q7 Section 5',
        boilerplate: `Equipment qualification follows a systematic approach:\n\nInstallation Qualification (IQ): Verification that equipment is installed correctly per specifications\nOperational Qualification (OQ): Demonstration that equipment operates within established parameters\nPerformance Qualification (PQ): Evidence that equipment consistently performs as intended\n\nQualification protocols and reports are available for critical equipment used in manufacturing.`,
      },
      {
        trigger: ['environmental monitoring', 'cleanroom', 'HVAC'],
        severity: 'medium',
        message: 'Document environmental controls and monitoring systems',
        reference: 'ICH Q7 Section 4.4',
        boilerplate: `Environmental controls are maintained according to [ISO/GMP STANDARDS]. Monitoring parameters include:\n\n• Temperature: [RANGE]\n• Humidity: [RANGE]\n• Differential pressure: [LIMITS]\n• Particle counts: [CLASS/LIMITS]\n• Microbial monitoring: [FREQUENCY/LIMITS]\n\nContinuous monitoring systems with alarm capabilities ensure environmental conditions are maintained within acceptable ranges.`,
      },
    ],
  },
};

// AI-powered compliance analysis endpoint
router.post('/analyze-compliance', async (req: Request, res: Response) => {
  try {
    const { content, templateName, analysisType } = req.body;
    const organizationId = (req as any).user?.organizationId || (req as any).tenantId;

    if (!content || !templateName) {
      return res.status(400).json({
        error: 'Content and template name are required',
      });
    }

    // Calculate compliance score
    const complianceScore = calculateComplianceScore(content, templateName);

    // Generate content suggestions
    const suggestions = generateContentSuggestions(content, templateName);

    // Identify missing elements based on template type
    const templateKey = Object.keys(regulatoryKnowledgeBase).find(
      key =>
        templateName.includes(key) ||
        templateName.toLowerCase().includes(regulatoryKnowledgeBase[key].title.toLowerCase())
    );

    let missingElements = [];
    let regulatoryFlags = [];
    let boilerplateRecommendations = [];

    if (templateKey && regulatoryKnowledgeBase[templateKey]) {
      const template = regulatoryKnowledgeBase[templateKey];

      // Check for missing required elements
      missingElements = template.requiredElements.filter((element: any) => {
        const keywords = element.toLowerCase().split(' ');
        return !keywords.some((keyword: any) => content.toLowerCase().includes(keyword));
      });

      // Check for regulatory flags
      regulatoryFlags = template.criticalFlags
        .filter((flag: any) => {
          return flag.trigger.some((trigger: any) =>
            content.toLowerCase().includes(trigger.toLowerCase())
          );
        })
        .map((flag: any) => ({
          severity: flag.severity,
          message: flag.message,
          reference: flag.reference,
        }));

      // Generate boilerplate recommendations
      boilerplateRecommendations = template.criticalFlags
        .filter((flag: any) =>
          flag.trigger.some((trigger: any) => content.toLowerCase().includes(trigger.toLowerCase()))
        )
        .map((flag: any) => ({
          section: flag.trigger[0],
          text: flag.boilerplate,
          confidence: flag.severity === 'high' ? 0.9 : 0.7,
        }));
    }

    const analysis = {
      complianceScore,
      suggestions,
      missingElements,
      regulatoryFlags,
      boilerplateRecommendations,
      templateGuidance: templateKey ? regulatoryKnowledgeBase[templateKey] : null,
      analysisTimestamp: new Date().toISOString(),
    };

    res.json(analysis);
  } catch (error: any) {
    console.error('AI compliance analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze document compliance',
      complianceScore: 0,
      suggestions: [],
      missingElements: [],
      regulatoryFlags: [],
      boilerplateRecommendations: [],
    });
  }
});

// AI boilerplate generation endpoint
router.post('/generate-boilerplate', async (req: Request, res: Response) => {
  try {
    const { section, context, templateType } = req.body;
    const organizationId = (req as any).user?.organizationId || (req as any).tenantId;

    if (!section) {
      return res.status(400).json({ error: 'Section parameter is required' });
    }

    // Find relevant template in knowledge base
    const templateKey = Object.keys(regulatoryKnowledgeBase).find(
      key => section.includes(key) || context?.includes(key)
    );

    let boilerplateText = '';

    if (templateKey && regulatoryKnowledgeBase[templateKey]) {
      const template = regulatoryKnowledgeBase[templateKey];

      // Generate contextual boilerplate based on section type
      if (section === 'regulatory_summary') {
        boilerplateText = `# ${template.title}

This section provides a comprehensive overview of ${template.title.toLowerCase()} in accordance with applicable regulatory guidelines.

## Regulatory Framework

This document has been prepared in compliance with:
${template.ichReferences.map((ref: any) => `• ${ref}`).join('\n')}
${template.fdaGuidance.map((guide: any) => `• FDA Guidance: ${guide}`).join('\n')}
${template.emaGuidance.map((guide: any) => `• EMA Guidance: ${guide}`).join('\n')}

## Required Elements

The following elements are addressed in this section:
${template.requiredElements.map((element: any) => `• ${element}`).join('\n')}

## Summary

[INSERT SPECIFIC CONTENT HERE - This template provides the regulatory framework for comprehensive documentation]`;
      } else if (section === 'section_completion') {
        const randomFlag =
          template.criticalFlags[Math.floor(Math.random() * template.criticalFlags.length)];
        boilerplateText = randomFlag.boilerplate;
      } else {
        // Default boilerplate
        boilerplateText = `## ${template.title}

Based on ${template.ichReferences[0]} guidelines, the following approach has been taken:

[INSERT SPECIFIC CONTENT HERE]

This approach ensures compliance with regulatory expectations for ${template.title.toLowerCase()}.`;
      }
    } else {
      // Generic boilerplate for unknown sections
      boilerplateText = `## Document Section

This section addresses the requirements for ${section} in accordance with applicable regulatory guidelines.

### Approach

[INSERT SPECIFIC CONTENT HERE]

### Compliance Statement

This documentation has been prepared in accordance with ICH guidelines and regulatory expectations.`;
    }

    res.json({
      boilerplateText,
      templateType: templateKey || 'generic',
      generatedAt: new Date().toISOString(),
      confidence: templateKey ? 0.9 : 0.6,
    });
  } catch (error: any) {
    console.error('Boilerplate generation error:', error);
    res.status(500).json({
      error: 'Failed to generate boilerplate content',
      boilerplateText: '',
    });
  }
});

// Regulatory guidance lookup endpoint
router.get('/regulatory-guidance/:section', async (req: Request, res: Response) => {
  try {
    const { section } = req.params as { section: string };
    const organizationId = (req as any).user?.organizationId || (req as any).tenantId;

    const guidance = (regulatoryKnowledgeBase as Record<string, any>)[section];

    if (!guidance) {
      return res.status(404).json({
        error: 'Regulatory guidance not found for this section',
      });
    }

    res.json({
      section,
      guidance,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Regulatory guidance lookup error:', error);
    res.status(500).json({
      error: 'Failed to retrieve regulatory guidance',
    });
  }
});

// Contextual AI guidance endpoint for CMC wizard integration
router.post('/contextual-guidance', async (req: Request, res: Response) => {
  try {
    const { query, projectContext, completedSteps, currentFormData, drugInfo } = req.body;

    // Build comprehensive regulatory context for AI
    const contextPrompt = `
You are an expert pharmaceutical regulatory AI assistant specializing in CMC (Chemistry, Manufacturing, and Controls) guidance. 

Project Context:
${projectContext || 'No project context available'}

Completed Steps: ${completedSteps?.join(', ') || 'None'}

Drug Information:
- Name: ${drugInfo?.name || 'Not specified'}
- Dosage Form: ${drugInfo?.dosageForm || 'Not specified'}
- Indication: ${drugInfo?.indication || 'Not specified'}
- Regulatory Region: ${drugInfo?.region || 'Not specified'}
- Development Stage: ${drugInfo?.stage || 'Not specified'}

Current Form Data:
${JSON.stringify(currentFormData, null, 2)}

User Query: ${query}

Please provide specific, actionable guidance based on the project context. Include:
1. Direct answer to the user's question
2. Relevant regulatory requirements (ICH, FDA, EMA guidelines)
3. Next recommended steps based on completed work
4. Potential risks or considerations
5. Timeline implications if applicable

Keep responses practical and regulatory-focused.
    `;

    // Simulate AI response for now (you can integrate with OpenAI later)
    let guidance = generateContextualGuidance(query, drugInfo, completedSteps);

    // Generate follow-up suggestions based on the query and context
    const followUpSuggestions = generateFollowUpSuggestions(query, drugInfo, completedSteps);

    res.json({
      guidance,
      followUpSuggestions,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Contextual AI guidance error:', error);
    res.status(500).json({
      error: 'Failed to generate AI guidance',
      message: error.message,
    });
  }
});

// Helper function to generate contextual guidance
function generateContextualGuidance(
  query: string,
  drugInfo: any,
  completedSteps: string[]
): string {
  const lowerQuery = query.toLowerCase();

  // Provide context-aware guidance based on the query
  if (lowerQuery.includes('validation')) {
    return `For ${drugInfo?.dosageForm || 'your dosage form'} in ${drugInfo?.region || 'your target region'}, analytical method validation should follow ICH Q2(R1) guidelines.

Key validation parameters required:
• Specificity: Demonstrate method can distinguish analyte from impurities
• Linearity: Establish linear relationship over expected range
• Accuracy: Recovery studies at 3 concentration levels (80%, 100%, 120%)
• Precision: Repeatability (RSD ≤2%) and intermediate precision
• Detection/Quantitation limits: If impurity testing required
• Robustness: Test method under varied conditions

${completedSteps.includes('analytical-methods') ? "Since you've completed analytical methods setup, ensure validation protocols align with your established methods." : 'Complete analytical method development before proceeding with validation studies.'}

Next steps: Prepare validation protocols and schedule studies with your analytical team.`;
  }

  if (lowerQuery.includes('stability')) {
    return `Stability study design for ${drugInfo?.dosageForm || 'your product'} should consider:

ICH Q1A(R2) Requirements:
• Long-term: 25°C ± 2°C/60% RH ± 5% RH for 24 months
• Intermediate: 30°C ± 2°C/65% RH ± 5% RH for 12 months  
• Accelerated: 40°C ± 2°C/75% RH ± 5% RH for 6 months

${drugInfo?.region === 'EMA' ? 'For EMA submissions, also consider stress testing per ICH Q1A(R2) section 2.1.2.' : ''}
${drugInfo?.dosageForm?.includes('Tablet') ? 'For tablets, include dissolution testing at all stability timepoints to monitor performance.' : ''}

Testing frequency: 0, 3, 6, 9, 12, 18, 24 months for long-term studies.

${completedSteps.includes('analytical-methods') ? 'Your validated analytical methods can now be applied to stability testing.' : 'Ensure analytical methods are validated before starting stability studies.'}`;
  }

  if (lowerQuery.includes('specification')) {
    return `Specification setting for ${drugInfo?.dosageForm || 'your product'} should follow ICH Q6A principles:

Key considerations:
• Identity tests: Specific methods to confirm drug substance/product identity
• Assay: Quantitative measurement of active ingredient (typically 95.0-105.0% for new drugs)
• Impurities: Based on qualification thresholds (ICH Q3A/Q3B)
• Dissolution (solid dosage forms): Based on biorelevant conditions
• Microbial limits: If not sterile, per pharmacopoeial requirements

For ${drugInfo?.region || 'your region'} submissions:
${drugInfo?.region === 'FDA' ? '• Follow FDA guidance on specifications\n• Consider PAT implementation for enhanced control' : ''}
${drugInfo?.region === 'EMA' ? '• Align with EMA/CHMP guidelines\n• Consider EU pharmacopoeia requirements' : ''}

${completedSteps.includes('analytical-methods') ? 'Use your validated analytical methods as the basis for specifications.' : 'Develop and validate analytical methods before finalizing specifications.'}`;
  }

  // Default guidance
  return `Based on your ${drugInfo?.dosageForm || 'product'} development for ${drugInfo?.region || 'regulatory submission'}:

Current progress: ${completedSteps.length > 0 ? `Completed ${completedSteps.join(', ')}` : 'Getting started'}

Recommended next steps:
1. ${getNextRecommendedStep(completedSteps)}
2. Ensure regulatory compliance for ${drugInfo?.region || 'target region'}
3. Plan timeline to meet ${drugInfo?.stage || 'development'} milestones

For specific guidance, please ask about validation, stability studies, specifications, or regulatory requirements.`;
}

// Helper function to generate follow-up suggestions
function generateFollowUpSuggestions(
  query: string,
  drugInfo: any,
  completedSteps: string[]
): any[] {
  const suggestions = [];

  // Base suggestions on query content
  if (query.toLowerCase().includes('validation')) {
    suggestions.push({
      title: 'Method Validation Protocol',
      description: `Generate a complete validation protocol for ${drugInfo?.dosageForm || 'your product'} testing`,
      action: 'Generate protocol',
      priority: 'high',
    });
  }

  if (query.toLowerCase().includes('stability')) {
    suggestions.push({
      title: 'Stability Study Design',
      description: `Design stability study for ${drugInfo?.region || 'your region'} regulatory requirements`,
      action: 'Design study',
      priority: 'high',
    });
  }

  if (query.toLowerCase().includes('specification')) {
    suggestions.push({
      title: 'Specification Setting',
      description: 'Review specification limits against compendial and regulatory requirements',
      action: 'Review specs',
      priority: 'medium',
    });
  }

  // Add contextual suggestions based on completed steps
  if (
    completedSteps?.includes('analytical-methods') &&
    !completedSteps.includes('stability-studies')
  ) {
    suggestions.push({
      title: 'Stability Testing Setup',
      description: 'With analytical methods validated, set up your stability testing program',
      action: 'Setup stability studies',
      priority: 'medium',
    });
  }

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

function getNextRecommendedStep(completedSteps: string[]): string {
  if (!completedSteps || completedSteps.length === 0) {
    return 'Define analytical methods for your product';
  }

  const stepFlow: { [key: string]: string } = {
    'analytical-methods': 'Process Validation',
    'process-validation': 'Stability Studies',
    'stability-studies': 'Quality Control Testing',
    'quality-control': 'Risk Management',
    'risk-management': 'Regulatory Management',
  };

  const lastStep = completedSteps[completedSteps.length - 1];
  return stepFlow[lastStep] || 'Document Authoring';
}

// POST endpoint for regulatory guidance (for Lumen AI chat)
router.post('/regulatory-guidance', async (req: Request, res: Response) => {
  try {
    const { question, model, context, module, contextData } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Use OpenAI for dynamic AI responses
    const systemPrompt = `You are an expert pharmaceutical regulatory affairs consultant specializing in CMC (Chemistry, Manufacturing, and Controls). Provide detailed, accurate regulatory guidance based on current FDA, EMA, ICH, and other international guidelines.

Context provided: ${JSON.stringify(context || {})}
Module: ${module || 'general'}
Form data: ${JSON.stringify(contextData || {})}

Guidelines:
- Reference specific regulatory guidelines (ICH, FDA, EMA) when applicable
- Provide actionable recommendations
- Include timeline estimates when relevant
- Mention required documentation
- Consider multi-regional requirements
- Use professional tone with clear structure
- Keep responses comprehensive but concise (300-500 words)
- Use bullet points and emojis for better readability`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse =
      data.choices[0]?.message?.content ||
      'I apologize, but I could not generate a response at this time. Please try again.';

    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
      model: model || 'gpt-4o',
      context: context || 'regulatory_compliance',
    });
  } catch (error: any) {
    console.error('Regulatory guidance error:', error);

    // Fallback response if OpenAI fails
    const fallbackResponse = `I'm experiencing technical difficulties connecting to the AI service. However, I can still help with your regulatory question.

For immediate assistance with CMC and regulatory guidance:
• Check ICH guidelines (www.ich.org) for harmonized requirements
• Review FDA guidance documents for US submissions
• Consult EMA guidelines for European submissions
• Consider engaging regulatory consultants for complex questions

📋 **Common CMC Topics I Can Help With:**
• Analytical method validation (ICH Q2)
• Process validation strategies
• Stability study design
• Quality control specifications
• Regulatory submission requirements

Please try your question again, or contact our support team if the issue persists.`;

    res.json({
      response: fallbackResponse,
      timestamp: new Date().toISOString(),
      model: 'fallback',
      context: 'regulatory_compliance',
      error: 'AI service temporarily unavailable',
    });
  }
});

export default router;
