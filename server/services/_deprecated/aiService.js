/**
 * AI Service
 *
 * Provides shared AI capabilities for text summarization, boilerplate generation,
 * and other NLP functions across CER and 510(k) modules.
 */

import { OpenAI } from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Summarize a block of text
 * @param {string} text The text to summarize
 * @param {number} maxTokens Maximum tokens for the summary
 * @returns {Promise<string>} The generated summary
 */
export async function summarizeText(text, maxTokens = 200) {
  try {
    if (!text) {
      throw new Error('No text provided for summarization');
    }

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Please summarize this:\n\n${text}` }],
      max_tokens: maxTokens,
    });

    return resp.choices[0].message.content;
  } catch (error) {
    console.error('Error in summarizeText:', error);
    throw new Error(`Failed to summarize text: ${error.message}`);
  }
}

/**
 * Generate persuasive boilerplate
 * @param {string} templateName The template to use
 * @param {Object} contextObj Context for the template
 * @returns {Promise<string>} The generated boilerplate text
 */
export async function generateBoilerplate(templateName, contextObj) {
  try {
    if (!templateName || !contextObj) {
      throw new Error('Template name and context object are required');
    }

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Use the ${templateName} template.` },
        { role: 'user', content: JSON.stringify(contextObj) },
      ],
    });

    return resp.choices[0].message.content;
  } catch (error) {
    console.error('Error in generateBoilerplate:', error);
    throw new Error(`Failed to generate boilerplate: ${error.message}`);
  }
}

/**
 * Generate a narrative with AI for CSR case reports
 * @param {Object} narrativeData The narrative data including prompt and context
 * @returns {Promise<Object>} The generated narrative and metadata
 */
export async function generateNarrativeWithAI(narrativeData) {
  try {
    const { prompt, studyId, patientId, eventDescription, medicalHistory, concomitantMeds } =
      narrativeData;

    if (!prompt) {
      throw new Error('Prompt is required for narrative generation');
    }

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a medical writing expert specializing in clinical study reports. Generate comprehensive, accurate, and properly formatted CSR narratives following ICH E3 guidelines.`,
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return {
      narrative: resp.choices[0].message.content,
      metadata: {
        studyId,
        patientId,
        generated: new Date().toISOString(),
        wordCount: resp.choices[0].message.content.split(' ').length,
        model: 'gpt-4o',
      },
    };
  } catch (error) {
    console.error('Error in generateNarrativeWithAI:', error);
    throw new Error(`Failed to generate narrative: ${error.message}`);
  }
}

/**
 * Generate a literature review draft based on selected papers
 * @param {Array} papers Array of selected papers
 * @param {string} deviceType Type of medical device
 * @param {Object} options Additional options for review generation
 * @returns {Promise<string>} The generated literature review
 */
export async function generateLiteratureReview(papers, deviceType, options = {}) {
  try {
    if (!papers || papers.length === 0) {
      throw new Error('No papers provided for literature review');
    }

    const paperSummaries = papers.map(paper => ({
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      journal: paper.journal,
      abstract: paper.abstract,
      key_findings: paper.key_findings || 'Not provided',
    }));

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in literature reviews for Clinical Evaluation Reports (CER) and 510(k) submissions.',
        },
        {
          role: 'user',
          content: `Generate a comprehensive literature review for a ${deviceType} medical device based on these papers:\n\n${JSON.stringify(paperSummaries, null, 2)}\n\nInclude sections for Introduction, Methodology, Results, and Discussion. The review should follow MEDDEV 2.7/1 Rev 4 guidelines.`,
        },
      ],
      max_tokens: 2000,
    });

    return resp.choices[0].message.content;
  } catch (error) {
    console.error('Error in generateLiteratureReview:', error);
    throw new Error(`Failed to generate literature review: ${error.message}`);
  }
}

export default {
  summarizeText,
  generateBoilerplate,
  generateLiteratureReview,
  generateNarrativeWithAI,
};
