/**
 * Literature Review API Routes
 *
 * These routes handle literature review-related functionality, including
 * study appraisal, bias assessment, and search summary generation.
 */

import express from 'express';
import OpenAI from 'openai';

const router = express.Router();

// OpenAI configuration - using the newest OpenAI API setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a relevance appraisal for a study
 */
router.post('/appraise-relevance', async (req, res) => {
  try {
    const { study, deviceName, inclusionCriteria = [], exclusionCriteria = [] } = req.body;

    if (!study || !study.title) {
      return res.status(400).json({ error: 'Study information is required.' });
    }

    const prompt = `Please appraise the relevance of this study for a clinical evaluation of "${deviceName || 'the medical device'}".
    
    Study Title: ${study.title}
    Authors: ${study.authors?.join(', ') || 'Unknown'}
    ${study.abstract ? `Abstract: ${study.abstract}` : ''}
    ${study.journal ? `Journal: ${study.journal}` : ''}
    ${study.publication_date ? `Publication Date: ${study.publication_date}` : ''}
    
    Inclusion Criteria:
    ${inclusionCriteria.map(criterion => `- ${criterion}`).join('\n')}
    
    Exclusion Criteria:
    ${exclusionCriteria.map(criterion => `- ${criterion}`).join('\n')}
    
    Assess the study's relevance on these criteria:
    1. Device relevance: How directly relevant is the study to the subject device?
    2. Population relevance: How well does the study population match the intended use population?
    3. Outcome relevance: How relevant are the studied outcomes to the intended performance and safety claims?
    4. Setting relevance: How representative is the clinical setting to real-world use?
    
    Rate each criterion from 1-5 where 1=Not Relevant, 3=Moderately Relevant, 5=Highly Relevant.
    Provide an overall relevance score and a summary of your assessment.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an expert in clinical literature appraisal with specialized knowledge of medical devices. Your task is to assess the relevance of a scientific publication to a specific medical device evaluation. Provide a structured JSON response with scores and justifications.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const appraisal = JSON.parse(completion.choices[0].message.content);

    return res.json({
      summary: appraisal.summary || 'No summary available',
      scores: appraisal.scores || {},
      criteriaAssessments: appraisal.criteriaAssessments || {},
      overallScore: appraisal.overallScore || 3,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating relevance appraisal:', error);
    return res.status(500).json({
      error: 'Failed to generate relevance appraisal',
      message: error.message,
    });
  }
});

/**
 * Generate a bias assessment for a study
 */
router.post('/assess-bias', async (req, res) => {
  try {
    const { study, biasDomains = [] } = req.body;

    if (!study || !study.title) {
      return res.status(400).json({ error: 'Study information is required.' });
    }

    const prompt = `Please conduct a risk of bias assessment for this study:
    
    Study Title: ${study.title}
    Authors: ${study.authors?.join(', ') || 'Unknown'}
    ${study.abstract ? `Abstract: ${study.abstract}` : ''}
    ${study.journal ? `Journal: ${study.journal}` : ''}
    ${study.publication_date ? `Publication Date: ${study.publication_date}` : ''}
    
    Assess the risk of bias in these domains:
    ${biasDomains.map(domain => `- ${domain.name}: ${domain.description}`).join('\n')}
    
    For each domain, assign a risk level of "low", "some_concerns", or "high", provide a brief justification, and include any notes.
    Also provide an overall risk of bias assessment and a summary of your assessment.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an expert in clinical literature appraisal with specialized knowledge in assessing bias in scientific studies. Your task is to conduct a risk of bias assessment for a scientific publication. Provide a structured JSON response with risk levels and justifications for each bias domain.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const assessment = JSON.parse(completion.choices[0].message.content);

    return res.json({
      summary: assessment.summary || 'No summary available',
      domainAssessments: assessment.domainAssessments || {},
      overallRisk: assessment.overallRisk || 'unclear',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating bias assessment:', error);
    return res.status(500).json({
      error: 'Failed to generate bias assessment',
      message: error.message,
    });
  }
});

/**
 * Generate a search summary for the literature review
 */
router.post('/search-summary', async (req, res) => {
  try {
    const reviewData = req.body;

    const prompt = `Please generate a comprehensive summary of this literature search for ${reviewData.device || 'a medical device'}:
    
    Databases searched: ${reviewData.databases?.join(', ') || 'Not specified'}
    
    Search period: From ${reviewData.searchPeriod?.startDate || 'Not specified'} to ${reviewData.searchPeriod?.endDate || 'Not specified'}
    
    Search queries used:
    ${reviewData.searchQueries?.map(q => `- ${q.database}: ${q.query} (${q.results || 'Unknown'} results)`).join('\n') || 'Not specified'}
    
    Inclusion criteria:
    ${reviewData.inclusionCriteria?.map(c => `- ${c}`).join('\n') || 'Not specified'}
    
    Exclusion criteria:
    ${reviewData.exclusionCriteria?.map(c => `- ${c}`).join('\n') || 'Not specified'}
    
    PRISMA flow:
    - Records identified: ${reviewData.prismaFlow?.identified || 0}
    - Records screened: ${reviewData.prismaFlow?.screened || 0}
    - Records assessed for eligibility: ${reviewData.prismaFlow?.eligible || 0}
    - Studies included: ${reviewData.prismaFlow?.included || 0}
    
    Included studies:
    ${
      reviewData.selectedStudies
        ?.map(
          s =>
            `- ${s.title} (${s.authors?.[0] || 'Unknown'} et al., ${new Date(s.publication_date).getFullYear() || 'Unknown'})
       Type: ${s.studyType || 'Not specified'}
       Relevance: ${s.overallRelevance ? (s.overallRelevance >= 4 ? 'High' : s.overallRelevance >= 3 ? 'Medium' : 'Low') : 'Not assessed'}
       Quality: ${s.overallQuality || 'Not assessed'}`
        )
        .join('\n') || 'No studies included'
    }
    
    Format your response as follows:
    1. A comprehensive narrative summary of the search strategy and results in HTML format
    2. A table of included studies with columns for Title, Year, Type, Relevance, and Quality
    3. Key findings and implications for the clinical evaluation
    
    Use proper HTML formatting for the content and tables.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an expert in clinical literature reviews with specialized knowledge of medical devices. Your task is to generate a comprehensive summary of a literature search methodology and results. Provide both narrative text and structured tables in HTML format.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const content = completion.choices[0].message.content;

    // Create included studies table data
    const includedStudiesTable =
      reviewData.selectedStudies?.map(s => ({
        title: s.title || 'Unknown',
        year: s.publication_date ? new Date(s.publication_date).getFullYear() : 'Unknown',
        type: s.studyType || 'Not specified',
        relevance: s.overallRelevance
          ? s.overallRelevance >= 4
            ? 'High'
            : s.overallRelevance >= 3
              ? 'Medium'
              : 'Low'
          : 'Not assessed',
        quality: s.overallQuality
          ? s.overallQuality === 'high'
            ? 'High'
            : s.overallQuality === 'medium'
              ? 'Medium'
              : 'Low'
          : 'Not assessed',
      })) || [];

    return res.json({
      content,
      tables: {
        included_studies: includedStudiesTable,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating search summary:', error);
    return res.status(500).json({
      error: 'Failed to generate search summary',
      message: error.message,
    });
  }
});

export default router;
