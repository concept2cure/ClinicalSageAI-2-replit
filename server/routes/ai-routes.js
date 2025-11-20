/**
 * TrialSage AI Routes
 *
 * This module provides API endpoints for AI-powered features including context retrieval
 * and document drafting.
 */

import express from 'express';
import { retrieveContext } from '../brain/vaultRetriever.js';
import { generateDraft } from '../brain/draftGenerator.js';

const router = express.Router();

// AI Configuration - Added to control AI features
const AI_CONFIG = {
  autoActions: false,
  selfHealing: false,
  aggressiveMode: false,
};

/**
 * POST /api/ai/retrieve
 * Retrieves relevant context based on a query
 *
 * Body: { query: string, k?: number }
 * Response: { success: boolean, chunks: Array<{docId, chunkId, text, score}> }
 */
router.post('/retrieve', async (req, res) => {
  try {
    const { query, k } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
      });
    }

    const topChunks = await retrieveContext(query, k ?? 5);

    res.json({
      success: true,
      chunks: topChunks,
    });
  } catch (err) {
    console.error('Error in /api/ai/retrieve:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/ai/review/analyze_document
 * Comprehensive FDA regulatory document analysis with compliance scoring
 *
 * Body: { document_content: string, document_type: string, organization_id: number, analysis_type?: string, regulatory_requirements?: Array, document_metadata?: Object }
 * Response: { suggestions: Array, compliance_score: number, regulatory_gaps: Array, validation_results: Array }
 */
router.post('/review/analyze_document', async (req, res) => {
  try {
    const {
      document_content,
      document_type,
      organization_id,
      analysis_type = 'comprehensive',
      regulatory_requirements = ['FDA', 'ICH'],
      document_metadata = {},
    } = req.body;

    if (!document_content) {
      return res.status(400).json({
        success: false,
        error: 'Document content is required',
      });
    }

    // Enhanced regulatory analysis with OpenAI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const analysisPrompt = `
As an FDA regulatory expert, conduct a comprehensive analysis of this ${document_type} document for ${regulatory_requirements.join(', ')} compliance.

Document Type: ${document_type}
Submission Type: ${document_metadata.submission_type || 'regulatory_document'}
Study Phase: ${document_metadata.phase || 'unknown'}
Therapeutic Area: ${document_metadata.therapeutic_area || 'general'}

Document Content:
${document_content}

Provide analysis in JSON format with:
{
  "compliance_score": number (0-100),
  "compliance_metrics": {
    "fda_requirements": number (0-100),
    "ich_guidelines": number (0-100),
    "cfr_part_312": number (0-100),
    "completeness": number (0-100)
  },
  "suggestions": [
    {
      "type": "Compliance Gap" | "Inconsistency" | "Enhancement" | "Critical",
      "title": "Brief title",
      "description": "Detailed description",
      "citation": "Specific FDA/ICH reference",
      "justification": "Regulatory rationale",
      "priority": "High" | "Medium" | "Low",
      "section": "Document section reference"
    }
  ],
  "regulatory_gaps": [
    {
      "gap_type": "Missing Information" | "Insufficient Detail" | "Non-compliance",
      "description": "Gap description",
      "regulatory_reference": "CFR/ICH citation",
      "impact": "High" | "Medium" | "Low",
      "remediation": "How to fix"
    }
  ],
  "validation_results": [
    {
      "check": "Validation check name",
      "status": "Pass" | "Fail" | "Warning",
      "details": "Check details",
      "reference": "Regulatory reference"
    }
  ]
}

Focus on:
1. 21 CFR Part 312 (IND) compliance
2. ICH M4 CTD structure requirements
3. FDA Guidance document adherence
4. eCTD specification compliance
5. Clinical data integrity
6. Risk assessment completeness
7. Quality by design principles
8. Regulatory precedent alignment
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are an expert FDA regulatory affairs consultant with 20+ years of experience in IND and NDA submissions. Provide thorough, actionable regulatory analysis.',
        },
        { role: 'user', content: analysisPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const analysis = JSON.parse(response.choices[0].message.content);

    res.json({
      success: true,
      ...analysis,
      analysis_timestamp: new Date().toISOString(),
      analysis_type: analysis_type,
      regulatory_requirements: regulatory_requirements,
    });
  } catch (error) {
    console.error('Error in regulatory analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Regulatory analysis failed: ' + error.message,
    });
  }
});

/**
 * POST /api/ai/draft
 * Generates a draft for a regulatory document section using AI
 *
 * Body: {
 *   moduleId: string,
 *   sectionId: string,
 *   currentContent: string,
 *   contextIds?: string[],
 *   query?: string
 * }
 * Response: { success: boolean, draft: string }
 */
router.post('/draft', async (req, res) => {
  try {
    const { moduleId, sectionId, currentContent, contextIds, query } = req.body;

    if (!moduleId || !sectionId) {
      return res.status(400).json({
        success: false,
        error: 'Module ID and Section ID are required',
      });
    }

    const draftContent = await generateDraft({
      moduleId,
      sectionId,
      currentContent: currentContent || '',
      contextIds: contextIds || [],
      query: query || '',
    });

    res.json({
      success: true,
      draft: draftContent,
    });
  } catch (err) {
    console.error('Error in /api/ai/draft:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/ai/regulatory/validate_submission
 * Advanced FDA submission validation with regulatory precedent analysis
 */
router.post('/regulatory/validate_submission', async (req, res) => {
  try {
    const { document_content, submission_type, phase, therapeutic_area } = req.body;

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const validationPrompt = `
As a senior FDA regulatory consultant, validate this ${submission_type} submission for ${phase} ${therapeutic_area} studies.

Document Content: ${document_content}

Perform comprehensive validation and provide JSON response:
{
  "validation_status": "Ready for Submission" | "Requires Revision" | "Major Issues",
  "overall_score": number (0-100),
  "critical_issues": [
    {
      "issue_type": "Missing Required Section" | "Regulatory Non-compliance" | "Data Integrity",
      "description": "Issue description",
      "regulatory_citation": "21 CFR reference",
      "impact": "Critical" | "Major" | "Minor",
      "resolution_steps": ["Step 1", "Step 2"]
    }
  ],
  "recommendations": [
    {
      "category": "Structure" | "Content" | "Compliance" | "Enhancement",
      "recommendation": "Specific recommendation",
      "rationale": "Regulatory justification",
      "priority": "High" | "Medium" | "Low"
    }
  ],
  "precedent_analysis": {
    "similar_submissions": ["Example 1", "Example 2"],
    "success_factors": ["Factor 1", "Factor 2"],
    "common_deficiencies": ["Deficiency 1", "Deficiency 2"]
  },
  "section_analysis": {
    "administrative_info": {"score": number, "issues": []},
    "clinical_overview": {"score": number, "issues": []},
    "nonclinical_overview": {"score": number, "issues": []},
    "quality_summary": {"score": number, "issues": []}
  }
}

Focus on FDA's current submission standards and recent guidance documents.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs expert specializing in FDA submissions with deep knowledge of current requirements and historical precedents.',
        },
        { role: 'user', content: validationPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const validation = JSON.parse(response.choices[0].message.content);

    res.json({
      success: true,
      ...validation,
      validation_timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in submission validation:', error);
    res.status(500).json({
      success: false,
      error: 'Submission validation failed: ' + error.message,
    });
  }
});

/**
 * POST /api/ai/regulatory/generate_compliance_report
 * Generate comprehensive compliance report for regulatory submissions
 */
router.post('/regulatory/generate_compliance_report', async (req, res) => {
  try {
    const { document_content, submission_type, regulatory_requirements } = req.body;

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const reportPrompt = `
Generate a comprehensive regulatory compliance report for this ${submission_type} submission.

Requirements: ${regulatory_requirements.join(', ')}
Document: ${document_content}

Provide detailed JSON report:
{
  "executive_summary": "Brief compliance overview",
  "compliance_matrix": [
    {
      "requirement": "21 CFR 312.23",
      "status": "Compliant" | "Partially Compliant" | "Non-Compliant",
      "evidence": "Supporting evidence",
      "gaps": ["Gap 1", "Gap 2"],
      "recommendations": ["Action 1", "Action 2"]
    }
  ],
  "risk_assessment": {
    "high_risk_areas": ["Area 1", "Area 2"],
    "mitigation_strategies": ["Strategy 1", "Strategy 2"],
    "regulatory_risks": ["Risk 1", "Risk 2"]
  },
  "quality_metrics": {
    "completeness": number (0-100),
    "accuracy": number (0-100),
    "consistency": number (0-100),
    "regulatory_alignment": number (0-100)
  },
  "action_items": [
    {
      "priority": "Critical" | "High" | "Medium" | "Low",
      "action": "Required action",
      "deadline": "Suggested timeframe",
      "responsible_party": "Team/Role",
      "regulatory_impact": "Impact description"
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are a senior regulatory compliance officer with expertise in FDA submissions and quality systems.',
        },
        { role: 'user', content: reportPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const report = JSON.parse(response.choices[0].message.content);

    res.json({
      success: true,
      ...report,
      report_timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating compliance report:', error);
    res.status(500).json({
      success: false,
      error: 'Compliance report generation failed: ' + error.message,
    });
  }
});

// Add regulatory review endpoints to existing AI routes
router.post('/review/analyze_document', async (req, res) => {
  try {
    const { task_id, document_text } = req.body;

    if (!task_id || !document_text) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Both task_id and document_text are required',
      });
    }

    console.log(`Regulatory review request for task: ${task_id}`);

    // Use OpenAI to analyze the document for regulatory compliance
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are a regulatory affairs expert specializing in FDA and ICH guidelines. Analyze the following regulatory document text and identify compliance gaps, inconsistencies, and areas for improvement.

For each issue found, provide:
1. The exact target text that needs improvement
2. The type of issue (Compliance Gap, Inconsistency, Clarity, Style)
3. A specific suggestion for improvement
4. Regulatory justification with relevant guidelines
5. Citations from relevant regulatory documents

Document text to analyze:
${document_text}

Return your analysis as JSON in this exact format:
{
  "suggestions": [
    {
      "target_text": "exact text from document",
      "suggestion_type": "Compliance Gap|Inconsistency|Clarity|Style",
      "suggestion_text": "specific improvement suggestion",
      "justification": "regulatory reasoning with guideline references",
      "citations": [
        {
          "source_doc_title": "ICH/FDA guideline title",
          "source_text": "relevant excerpt from guideline",
          "page_number": number
        }
      ]
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory affairs consultant with deep knowledge of FDA, ICH, and EMA guidelines. Provide precise, actionable feedback on regulatory documents.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const analysis = JSON.parse(response.choices[0].message.content);

    // Add unique IDs to suggestions
    const suggestionsWithIds = analysis.suggestions.map(suggestion => ({
      id: 'sugg_' + Math.random().toString(36).substr(2, 9),
      ...suggestion,
    }));

    res.json({
      suggestions: suggestionsWithIds,
      task_id: task_id,
      analysis_timestamp: new Date().toISOString(),
      suggestion_count: suggestionsWithIds.length,
    });
  } catch (error) {
    console.error('Error in regulatory review:', error);
    res.status(500).json({
      error: 'Failed to analyze document',
      details: error.message,
    });
  }
});

export default router;
