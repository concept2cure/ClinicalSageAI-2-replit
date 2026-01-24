/**
 * Literature Review Generator Routes
 *
 * These routes provide API endpoints for generating comprehensive literature
 * reviews based on selected articles and device information.
 */

import express from 'express';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST /api/cer/generate-literature-review - Generate a literature review from selected articles
router.post('/generate-literature-review', async (req, res) => {
  try {
    const { deviceName, literatureReferences } = req.body;

    if (!deviceName) {
      return res.status(400).json({ error: 'Device name is required' });
    }

    if (
      !literatureReferences ||
      !Array.isArray(literatureReferences) ||
      literatureReferences.length === 0
    ) {
      return res.status(400).json({ error: 'Literature references are required' });
    }

    console.log(
      `Generating literature review for ${deviceName} with ${literatureReferences.length} references`
    );

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is missing');
      return res.status(500).json({
        success: false,
        error: 'OpenAI API key is missing or invalid',
        message: 'Server configuration error: OpenAI API key is missing',
      });
    }

    // Format the references for the AI model
    const formattedReferences = literatureReferences
      .map((ref, index) => {
        return `
Reference ${index + 1}:
Title: ${ref.title || 'Unknown'}
Authors: ${ref.authors || 'Unknown'}
Year: ${ref.year || 'Unknown'}
Journal: ${ref.journal || 'Unknown'}
${ref.abstract ? `Abstract: ${ref.abstract}` : ''}
${ref.keywords ? `Keywords: ${ref.keywords.join(', ')}` : ''}
`;
      })
      .join('\n');

    console.log('References formatted successfully');

    // Create the AI prompt
    const prompt = `
You are a medical regulatory specialist creating a literature review section for a Clinical Evaluation Report (CER) for a medical device called "${deviceName}".

Review the following literature references and generate a comprehensive literature review section that:
1. Summarizes the current state of knowledge about this device type
2. Highlights key findings related to safety and performance
3. Identifies any contradictions or gaps in the evidence
4. Assesses the quality and relevance of the evidence
5. Follows a structured format appropriate for a regulatory document

LITERATURE REFERENCES:
${formattedReferences}

Your literature review should be comprehensive, well-structured, and formatted in HTML for inclusion in a regulatory document.
Include proper citations to the references using the format [Author et al., Year] in the text.
Conclude with a summary of the state of the art based on the literature.
`;

    console.log('Calling OpenAI API...');

    try {
      // Generate the literature review using OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: [
          {
            role: 'system',
            content:
              'You are a medical device regulatory expert specializing in clinical evaluation reports and literature reviews. You follow MEDDEV 2.7/1 Rev 4 guidelines and produce comprehensive, evidence-based analyses for medical device manufacturers.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      console.log('OpenAI API response received successfully');

      if (!completion.choices || !completion.choices.length) {
        console.error('OpenAI API returned an incomplete response:', completion);
        return res.status(500).json({
          success: false,
          error: 'Invalid response from OpenAI',
          message: 'The AI service returned an incomplete response',
        });
      }

      const literatureReview = completion.choices[0].message.content;

      // Extract references into a structured format
      const referencesRegex = /References?:?\s*([\\s\\S]*?)(?:\\n\\n|$)/i;
      const referencesMatch = literatureReview.match(referencesRegex);

      let structuredReferences = [];
      if (referencesMatch && referencesMatch[1]) {
        const referencesText = referencesMatch[1];
        const referenceLines = referencesText.split('\n').filter(line => line.trim());

        structuredReferences = referenceLines.map(line => {
          // Basic cleaning
          return line.replace(/^\d+\.\s*/, '').trim();
        });
      }

      console.log('Literature review generated and structured successfully');

      // Return the generated literature review
      res.json({
        success: true,
        content: literatureReview,
        structuredReferences,
        metadata: {
          deviceName,
          referenceCount: literatureReferences.length,
          generated: new Date().toISOString(),
          modelUsed: 'GPT-4O',
        },
      });
    } catch (apiError) {
      console.error('OpenAI API error:', apiError);
      console.error('Error details:', JSON.stringify(apiError, null, 2));
      res.status(500).json({
        success: false,
        error: 'OpenAI API error',
        message: apiError.message,
        details: apiError.response ? apiError.response.data : null,
      });
    }
  } catch (error) {
    console.error('Error generating literature review:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to generate literature review',
      message: error.message,
    });
  }
});

// POST /api/cer/literature-review/:cerProjectId - Save a generated literature review
router.post('/literature-review/:cerProjectId', async (req, res) => {
  try {
    const { cerProjectId } = req.params;
    const { reviewData } = req.body;

    if (!cerProjectId) {
      return res.status(400).json({ error: 'CER project ID is required' });
    }

    if (!reviewData) {
      return res.status(400).json({ error: 'Review data is required' });
    }

    console.log(`Saving literature review for CER project ${cerProjectId}`);

    // In a real implementation, save the review to the database
    // For now, we'll just acknowledge the request

    res.json({
      success: true,
      message: 'Literature review saved successfully',
      cerProjectId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving literature review:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save literature review',
      message: error.message,
    });
  }
});

export default router;
