/**
 * Working AI Regulatory Review Routes
 *
 * This module provides real AI-powered regulatory document analysis
 * for the eCTD Co-Author module.
 */

const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

// Real AI regulatory review endpoint
router.post('/review/analyze_document', async (req, res) => {
  try {
    const { task_id, document_text } = req.body;

    if (!task_id || !document_text) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Both task_id and document_text are required',
      });
    }

    console.log(`Real AI regulatory review request for task: ${task_id}`);

    // Check if OpenAI API key exists
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured',
        details: 'OPENAI_API_KEY environment variable is missing',
      });
    }

    // Use OpenAI to analyze the document for regulatory compliance
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
          "page_number": 45
        }
      ]
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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

    console.log(
      `Generated ${suggestionsWithIds.length} regulatory suggestions for task ${task_id}`
    );

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

module.exports = router;
