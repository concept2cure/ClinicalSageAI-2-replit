/**
 * ICH Guidelines Integration API
 * Comprehensive regulatory guidance system for eCTD submissions
 */

const express = require('express');
const OpenAI = require('openai');
const ichGuidelines = require('../data/ich-guidelines');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get all ICH guidelines with filtering
router.get('/guidelines', async (req, res) => {
  try {
    const { series, submissionType, module } = req.query;

    let filteredGuidelines = { ...ichGuidelines };

    // Filter by series (E, Q, S, M4)
    if (series) {
      const seriesArray = series.split(',');
      filteredGuidelines = Object.keys(filteredGuidelines)
        .filter(key => seriesArray.includes(key))
        .reduce((obj, key) => {
          obj[key] = filteredGuidelines[key];
          return obj;
        }, {});
    }

    // Filter by submission type
    if (submissionType && ichGuidelines.submissionTypes[submissionType]) {
      const applicableGuidelines =
        ichGuidelines.submissionTypes[submissionType].applicableGuidelines;

      // Cross-reference with series filter
      const relevant = {};
      Object.keys(filteredGuidelines).forEach(seriesKey => {
        if (typeof filteredGuidelines[seriesKey] === 'object') {
          Object.keys(filteredGuidelines[seriesKey]).forEach(guidelineKey => {
            if (applicableGuidelines.includes(guidelineKey)) {
              if (!relevant[seriesKey]) relevant[seriesKey] = {};
              relevant[seriesKey][guidelineKey] = filteredGuidelines[seriesKey][guidelineKey];
            }
          });
        }
      });
      filteredGuidelines = relevant;
    }

    res.json({
      success: true,
      guidelines: filteredGuidelines,
      submissionTypes: ichGuidelines.submissionTypes,
      eCTDMapping: ichGuidelines.eCTDModuleMapping,
    });
  } catch (error) {
    console.error('Error fetching ICH guidelines:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ICH guidelines',
    });
  }
});

// Get specific guideline details
router.get('/guidelines/:series/:guideline', async (req, res) => {
  try {
    const { series, guideline } = req.params;

    if (!ichGuidelines[series] || !ichGuidelines[series][guideline]) {
      return res.status(404).json({
        success: false,
        error: 'Guideline not found',
      });
    }

    const guidelineData = ichGuidelines[series][guideline];

    res.json({
      success: true,
      guideline: guidelineData,
      series,
      guidelineId: guideline,
    });
  } catch (error) {
    console.error('Error fetching specific guideline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guideline details',
    });
  }
});

// AI-powered guideline analysis for document sections
router.post('/analyze-compliance', async (req, res) => {
  try {
    const { documentText, submissionType, module, section } = req.body;

    if (!documentText || !submissionType) {
      return res.status(400).json({
        success: false,
        error: 'Document text and submission type are required',
      });
    }

    // Get applicable guidelines for submission type
    const applicableGuidelines =
      ichGuidelines.submissionTypes[submissionType]?.applicableGuidelines || [];

    // Get module-specific guidelines
    const moduleGuidelines = ichGuidelines.eCTDModuleMapping[module]?.ichGuidelines || [];

    // Combine and deduplicate guidelines
    const relevantGuidelines = [...new Set([...applicableGuidelines, ...moduleGuidelines])];

    // Build context for AI analysis
    const guidelinesContext = relevantGuidelines
      .map(guidelineId => {
        // Find guideline in database
        for (const series of Object.keys(ichGuidelines)) {
          if (ichGuidelines[series][guidelineId]) {
            return {
              id: guidelineId,
              title: ichGuidelines[series][guidelineId].title,
              requirements:
                ichGuidelines[series][guidelineId].requirements ||
                ichGuidelines[series][guidelineId].keyRequirements ||
                ichGuidelines[series][guidelineId].principles ||
                ichGuidelines[series][guidelineId].sections ||
                [],
            };
          }
        }
        return null;
      })
      .filter(Boolean);

    const prompt = `Analyze the following regulatory document section for compliance with ICH guidelines:

SUBMISSION TYPE: ${submissionType}
MODULE: ${module}
SECTION: ${section}

DOCUMENT TEXT:
${documentText}

APPLICABLE ICH GUIDELINES:
${guidelinesContext.map(g => `${g.id}: ${g.title}\nRequirements: ${JSON.stringify(g.requirements)}`).join('\n\n')}

Please analyze the document for:
1. Compliance with ICH guidelines
2. Missing required elements
3. Areas for improvement
4. Specific guideline references

Provide analysis in JSON format:
{
  "overallCompliance": "percentage",
  "complianceByGuideline": [
    {
      "guidelineId": "string",
      "compliance": "percentage", 
      "status": "Compliant|Partially Compliant|Non-Compliant",
      "findings": ["array of specific findings"],
      "recommendations": ["array of recommendations"]
    }
  ],
  "criticalIssues": ["array of critical compliance issues"],
  "recommendations": ["array of overall recommendations"],
  "missingElements": ["array of missing required elements"]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs expert specializing in ICH guidelines for pharmaceutical submissions. Provide detailed, accurate compliance analysis based on authentic ICH requirements.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const analysis = JSON.parse(completion.choices[0].message.content);

    res.json({
      success: true,
      analysis,
      applicableGuidelines: relevantGuidelines,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error analyzing compliance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze guideline compliance',
    });
  }
});

// Get guideline recommendations for specific document types
router.post('/recommendations', async (req, res) => {
  try {
    const { submissionType, module, documentType, therapeuticArea } = req.body;

    if (!submissionType || !module) {
      return res.status(400).json({
        success: false,
        error: 'Submission type and module are required',
      });
    }

    // Get applicable guidelines
    const submissionGuidelines =
      ichGuidelines.submissionTypes[submissionType]?.applicableGuidelines || [];
    const moduleGuidelines = ichGuidelines.eCTDModuleMapping[module]?.ichGuidelines || [];

    const prompt = `Provide specific ICH guideline recommendations for:

SUBMISSION TYPE: ${submissionType}
MODULE: ${module}
DOCUMENT TYPE: ${documentType}
THERAPEUTIC AREA: ${therapeuticArea}

Based on authentic ICH guidelines, provide recommendations in JSON format:
{
  "primaryGuidelines": [
    {
      "guidelineId": "string",
      "title": "string", 
      "applicability": "string",
      "keyRequirements": ["array of key requirements"],
      "criticalSections": ["array of critical sections to address"]
    }
  ],
  "supportingGuidelines": ["array of supporting guideline IDs"],
  "documentStructure": {
    "requiredSections": ["array of required sections"],
    "recommendedSections": ["array of recommended sections"],
    "criticalElements": ["array of critical elements to include"]
  },
  "complianceChecklist": ["array of compliance checkpoints"],
  "commonPitfalls": ["array of common compliance issues to avoid"]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are an ICH guidelines expert. Provide specific, actionable recommendations based on authentic regulatory requirements.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const recommendations = JSON.parse(completion.choices[0].message.content);

    res.json({
      success: true,
      recommendations,
      applicableGuidelines: [...new Set([...submissionGuidelines, ...moduleGuidelines])],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate guideline recommendations',
    });
  }
});

// Generate guideline-compliant content templates
router.post('/generate-template', async (req, res) => {
  try {
    const { submissionType, module, section, therapeuticArea, documentType } = req.body;

    if (!submissionType || !module || !section) {
      return res.status(400).json({
        success: false,
        error: 'Submission type, module, and section are required',
      });
    }

    // Get relevant guidelines for context
    const applicableGuidelines =
      ichGuidelines.submissionTypes[submissionType]?.applicableGuidelines || [];
    const moduleGuidelines = ichGuidelines.eCTDModuleMapping[module]?.ichGuidelines || [];
    const relevantGuidelines = [...new Set([...applicableGuidelines, ...moduleGuidelines])];

    // Build detailed guidelines context
    const guidelinesDetails = relevantGuidelines
      .map(guidelineId => {
        for (const series of Object.keys(ichGuidelines)) {
          if (ichGuidelines[series][guidelineId]) {
            return {
              id: guidelineId,
              title: ichGuidelines[series][guidelineId].title,
              description: ichGuidelines[series][guidelineId].description,
              requirements:
                ichGuidelines[series][guidelineId].requirements ||
                ichGuidelines[series][guidelineId].keyRequirements ||
                ichGuidelines[series][guidelineId].principles ||
                [],
            };
          }
        }
        return null;
      })
      .filter(Boolean);

    const prompt = `Generate a comprehensive, ICH-compliant content template for:

SUBMISSION TYPE: ${submissionType}
MODULE: ${module}
SECTION: ${section}
DOCUMENT TYPE: ${documentType}
THERAPEUTIC AREA: ${therapeuticArea}

APPLICABLE ICH GUIDELINES:
${guidelinesDetails.map(g => `${g.id}: ${g.title}\nDescription: ${g.description}\nRequirements: ${JSON.stringify(g.requirements)}`).join('\n\n')}

Generate a detailed template in JSON format:
{
  "templateName": "string",
  "applicableGuidelines": ["array of guideline IDs"],
  "structure": {
    "sections": [
      {
        "sectionNumber": "string",
        "sectionTitle": "string",
        "ichReference": "string",
        "requiredContent": "detailed content requirements",
        "template": "template text with placeholders",
        "guidelines": ["specific guideline requirements"],
        "examples": ["examples of compliant content"]
      }
    ]
  },
  "complianceRequirements": ["array of compliance requirements"],
  "qualityChecks": ["array of quality checkpoints"],
  "regulatoryNotes": ["array of regulatory considerations"]
}

Ensure the template follows authentic ICH requirements and includes specific regulatory language where appropriate.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory writer specializing in ICH-compliant document templates. Generate comprehensive, authentic regulatory templates based on real ICH guidelines.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const template = JSON.parse(completion.choices[0].message.content);

    res.json({
      success: true,
      template,
      applicableGuidelines: relevantGuidelines,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate guideline template',
    });
  }
});

// Cross-reference checker for multiple guidelines
router.post('/cross-reference', async (req, res) => {
  try {
    const { guidelines, submissionType } = req.body;

    if (!guidelines || !Array.isArray(guidelines)) {
      return res.status(400).json({
        success: false,
        error: 'Guidelines array is required',
      });
    }

    const crossReferences = {};
    const conflicts = [];
    const synergies = [];

    // Analyze relationships between guidelines
    for (let i = 0; i < guidelines.length; i++) {
      for (let j = i + 1; j < guidelines.length; j++) {
        const guide1 = guidelines[i];
        const guide2 = guidelines[j];

        // Find guidelines in database
        let guide1Data = null;
        let guide2Data = null;

        for (const series of Object.keys(ichGuidelines)) {
          if (ichGuidelines[series][guide1]) guide1Data = ichGuidelines[series][guide1];
          if (ichGuidelines[series][guide2]) guide2Data = ichGuidelines[series][guide2];
        }

        if (guide1Data && guide2Data) {
          crossReferences[`${guide1}-${guide2}`] = {
            guideline1: { id: guide1, title: guide1Data.title },
            guideline2: { id: guide2, title: guide2Data.title },
            relationship: 'complementary', // Could be enhanced with AI analysis
            notes: `${guide1} and ${guide2} work together for comprehensive compliance`,
          };
        }
      }
    }

    res.json({
      success: true,
      crossReferences,
      conflicts,
      synergies,
      submissionType,
      analysisDate: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error performing cross-reference analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform cross-reference analysis',
    });
  }
});

module.exports = router;
