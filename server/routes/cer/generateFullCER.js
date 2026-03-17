/**
 * Zero-Click Full CER Generator
 *
 * This module provides the API endpoint handler for generating a complete
 * Clinical Evaluation Report using GPT-4o, with automatic integration of data
 * from FAERS, literature sources, and user-provided device information.
 */

const { getOpenAIClient } = require('../../services/openai-client');

// Initialize OpenAI client
const openai = getOpenAIClient();

/**
 * Calculate initial compliance score based on section content
 * @param {Array} sections - Generated CER sections
 * @param {string} regulatoryPath - The regulatory framework used
 * @returns {Object} - Compliance scores by framework
 */
function calculateComplianceScore(sections, regulatoryPath) {
  // Define compliance criteria by regulatory framework
  const criteriaBySections = {
    'EU-MDR': {
      'device-description': ['detailed description', 'components', 'specifications', 'materials'],
      'intended-purpose': [
        'intended use',
        'indications',
        'contraindications',
        'patient population',
      ],
      'state-of-art': ['current technology', 'alternative treatments', 'standards', 'benchmarks'],
      'clinical-data': ['clinical evidence', 'patient outcomes', 'data analysis', 'effectiveness'],
      'post-market': ['surveillance', 'vigilance', 'monitoring', 'feedback'],
      'literature-review': ['systematic review', 'search methodology', 'appraisal', 'synthesis'],
      'benefit-risk': ['benefits', 'risks', 'mitigation', 'ratio analysis'],
      conclusion: ['summary findings', 'clinical evaluation', 'justification', 'recommendations'],
    },
    'ISO-14155': {
      'trial-design': ['study design', 'objectives', 'endpoints', 'methodology'],
      'patient-selection': [
        'inclusion criteria',
        'exclusion criteria',
        'demographics',
        'recruitment',
      ],
      'risk-assessment': ['risk analysis', 'mitigation measures', 'residual risks', 'safety'],
      'device-description': [
        'specifications',
        'components',
        'mechanism of action',
        'technical details',
      ],
      'safety-monitoring': [
        'adverse events',
        'reporting procedures',
        'safety assessment',
        'monitoring',
      ],
      'endpoint-analysis': [
        'primary endpoints',
        'secondary endpoints',
        'success criteria',
        'analysis',
      ],
      'statistical-methods': [
        'sample size',
        'statistical tests',
        'power analysis',
        'confidence intervals',
      ],
    },
    'US-FDA': {
      'device-description': ['detailed description', 'components', 'specifications', 'materials'],
      indications: [
        'indications for use',
        'intended use',
        'target population',
        'medical conditions',
      ],
      technological: ['technology', 'principles of operation', 'specifications', 'design'],
      'performance-data': ['bench testing', 'animal studies', 'clinical data', 'validation'],
      'safety-effectiveness': [
        'safety measures',
        'effectiveness evidence',
        'benefit-risk',
        'analysis',
      ],
      'substantial-equivalence': [
        'predicate device',
        'comparison',
        'equivalence justification',
        'differences',
      ],
      conclusion: ['summary findings', 'clinical evaluation', 'justification', 'recommendations'],
    },
  };

  // Calculate framework-specific scores
  const frameworkScores = {};
  const frameworks = ['EU-MDR', 'ISO-14155', 'US-FDA'];

  for (const framework of frameworks) {
    const criteria = criteriaBySections[framework];
    if (!criteria) continue;

    let totalScore = 0;
    let maxPossibleScore = 0;
    const sectionScores = {};

    // For each section type in the criteria
    for (const [sectionType, keywords] of Object.entries(criteria)) {
      const matchingSection = sections.find(s => s.type === sectionType);
      if (!matchingSection) continue;

      // Score based on keyword presence
      let sectionScore = 0;
      const content = matchingSection.content.toLowerCase();

      for (const keyword of keywords) {
        if (content.includes(keyword.toLowerCase())) {
          sectionScore += 1;
        }
      }

      // Calculate percentage score for this section
      const sectionPercentage = keywords.length > 0 ? sectionScore / keywords.length : 0;
      sectionScores[sectionType] = sectionPercentage;

      totalScore += sectionScore;
      maxPossibleScore += keywords.length;
    }

    // Calculate overall framework score
    const overallScore = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;

    frameworkScores[framework] = {
      overallScore,
      sectionScores,
    };
  }

  // Determine primary framework score (the one used for generation)
  const primaryFramework = regulatoryPath || 'EU-MDR';
  const primaryScore = frameworkScores[primaryFramework] || {
    overallScore: 0.5,
    sectionScores: {},
  };

  // Return complete compliance data
  return {
    overallScore: primaryScore.overallScore,
    primary: primaryFramework,
    standards: frameworkScores,
    compliance_date: new Date().toISOString(),
    evaluationMethod: 'automated-keyword-analysis',
  };
}

/**
 * Generate required sections for a regulatory framework
 * @param {string} framework - The regulatory framework (EU-MDR, ISO-14155, US-FDA)
 * @returns {Array} Array of required section objects
 */
function getRequiredSections(framework) {
  // Define required sections by framework
  const sectionsByFramework = {
    'EU-MDR': [
      { title: 'Device Description', type: 'device-description' },
      { title: 'Intended Purpose', type: 'intended-purpose' },
      { title: 'State of the Art', type: 'state-of-art' },
      { title: 'Clinical Data Analysis', type: 'clinical-data' },
      { title: 'Post-Market Surveillance', type: 'post-market' },
      { title: 'Literature Review', type: 'literature-review' },
      { title: 'Benefit-Risk Analysis', type: 'benefit-risk' },
      { title: 'Conclusion', type: 'conclusion' },
    ],
    'ISO-14155': [
      { title: 'Trial Design', type: 'trial-design' },
      { title: 'Patient Selection', type: 'patient-selection' },
      { title: 'Risk Assessment', type: 'risk-assessment' },
      { title: 'Device Description', type: 'device-description' },
      { title: 'Safety Monitoring', type: 'safety-monitoring' },
      { title: 'Endpoint Analysis', type: 'endpoint-analysis' },
      { title: 'Statistical Methods', type: 'statistical-methods' },
    ],
    'US-FDA': [
      { title: 'Device Description', type: 'device-description' },
      { title: 'Indications for Use', type: 'indications' },
      { title: 'Technological Characteristics', type: 'technological' },
      { title: 'Performance Data', type: 'performance-data' },
      { title: 'Safety and Effectiveness', type: 'safety-effectiveness' },
      { title: 'Substantial Equivalence', type: 'substantial-equivalence' },
      { title: 'Conclusion', type: 'conclusion' },
    ],
  };

  // Return sections for the specified framework, or default to EU-MDR
  return sectionsByFramework[framework] || sectionsByFramework['EU-MDR'];
}

/**
 * Generate a full CER using GPT-4o
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function generateFullCER(req, res) {
  try {
    const { deviceInfo = {}, templateId = 'eu-mdr', literature = [], fdaData = null } = req.body;

    // Map templateId to regulatory path
    let regulatoryPath = 'EU-MDR';
    if (templateId === 'fda-510k') regulatoryPath = 'US-FDA';
    else if (templateId === 'iso-14155') regulatoryPath = 'ISO-14155';
    else if (templateId === 'meddev') regulatoryPath = 'EU-MDR';

    // Extract device information
    const deviceName = deviceInfo.name || '';
    const deviceType = deviceInfo.type || '';
    const manufacturer = deviceInfo.manufacturer || '';
    const intendedUse = deviceInfo.intendedUse || '';

    if (!deviceName) {
      return res.status(400).json({ error: 'Device name is required' });
    }

    // Get the required sections for this regulatory path
    const sectionsToGenerate = getRequiredSections(regulatoryPath);

    console.log(`Generating full CER for ${deviceName} using ${regulatoryPath} framework...`);

    // Determine available data sources
    const dataSources = [];
    if (fdaData) dataSources.push('FAERS');
    if (literature.length > 0) dataSources.push('Literature');

    // Prepare the context for generation
    const deviceContext = {
      name: deviceName,
      type: deviceType,
      manufacturer,
      intendedUse,
      regulatoryPath,
      dataSources: dataSources.join(', '),
      literatureCount: literature.length || 0,
      faersReportCount: fdaData ? fdaData.reportCount || 0 : 0,
    };

    // Format device context as string
    const deviceContextString = Object.entries(deviceContext)
      .filter(([_, value]) => value) // Filter out empty values
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    // Initialize the array to store generated sections
    const generatedSections = [];

    // For each required section, generate content
    for (const section of sectionsToGenerate) {
      // Create a prompt for this specific section
      const sectionPrompt = {
        role: 'system',
        content: `You are an expert medical device regulatory specialist with deep knowledge of Clinical Evaluation Reports (CERs).
        
        Generate a comprehensive, detailed, and regulatory-compliant "${section.title}" section for a CER following ${regulatoryPath} guidelines.
        
        Device Information:
        ${deviceContextString}
        
        IMPORTANT INSTRUCTIONS:
        1. Write content that meets ${regulatoryPath} requirements for this section type.
        2. Include appropriate level of detail, clinical considerations, and regulatory context.
        3. Format the content in a professional, report-ready style.
        4. Include markdown formatting as appropriate for headings and structure.
        5. Write at least 500 words of substantive content.
        
        Respond only with the generated section content, nothing else.`,
      };

      // Call OpenAI API to generate the section
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [sectionPrompt],
        temperature: 0.4, // Balance between creativity and consistency
        max_tokens: 2000, // Allow substantial section content
      });

      // Add the generated section to our results
      generatedSections.push({
        title: section.title,
        type: section.type,
        content: response.choices[0].message.content.trim(),
        regulatoryPath,
        timestamp: new Date().toISOString(),
      });

      // Brief pause to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Calculate initial compliance scores
    const complianceScore = calculateComplianceScore(generatedSections, regulatoryPath);

    // Prepare the full CER response
    const fullCER = {
      title: `Clinical Evaluation Report: ${deviceName}`,
      deviceName,
      deviceType,
      manufacturer,
      regulatoryPath,
      generatedAt: new Date().toISOString(),
      sections: generatedSections,
      complianceScore,
      metadata: {
        generationMethod: 'Zero-Click AI-powered CER',
        model: 'gpt-4o',
        dataSources,
        literatureCount: literature.length || 0,
        faersReportCount: fdaData ? fdaData.reportCount || 0 : 0,
        literatureSourceCount: literature.length || 0,
      },
    };

    // Return the completed CER
    res.json(fullCER);
  } catch (error) {
    console.error('Error generating full CER:', error);
    res.status(500).json({
      error: 'Failed to generate full CER',
      message: error.message || 'An unknown error occurred',
    });
  }
}

module.exports = generateFullCER;
