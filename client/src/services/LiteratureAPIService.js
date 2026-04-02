/**
 * Literature API Service
 *
 * This service handles communication with the Literature API endpoints for
 * the CER module's Literature AI component.
 */

import { apiRequest } from '@/lib/queryClient';

/**
 * Search PubMed for scientific literature
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query (device name)
 * @param {string} params.manufacturer - Optional manufacturer name to refine search
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<Object>} Search results with papers array
 */
export const searchPubMed = async ({ query, manufacturer = '', limit = 20 }) => {
  try {
    const response = await apiRequest('POST', '/api/literature/pubmed', { query, manufacturer, limit });
    return await response.json();
  } catch (error) {
    console.error('PubMed search error:', error);
    throw error;
  }
};

// Service object will be exported at the end of the file

/**
 * Search for scientific literature related to a product
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string[]} params.sources - Sources to search (pubmed, googleScholar)
 * @param {Object} params.filters - Optional search filters
 * @param {number} params.filters.yearFrom - Start year for publication date filter
 * @param {number} params.filters.yearTo - End year for publication date filter
 * @param {string} params.filters.journalType - Journal type filter
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<Object>} Search results
 */
export const searchLiterature = async ({
  query,
  sources = ['pubmed', 'googleScholar'],
  filters = {},
  limit = 20,
}) => {
  try {
    const response = await apiRequest('POST', '/api/literature/search', { query, sources, filters, limit });
    return await response.json();
  } catch (error) {
    console.error('Literature search error:', error);
    throw error;
  }
};

/**
 * Summarize text content from a scientific paper using GPT-4o
 * @param {Object} params - Summarization parameters
 * @param {string} params.text - Text to summarize (abstract or full text)
 * @param {string} params.context - Optional context to aid summarization (CER title or device info)
 * @param {Object} params.options - Optional summarization options
 * @param {string} params.options.format - Summary format ('bullet', 'paragraph', 'structured')
 * @param {number} params.options.maxLength - Maximum summary length
 * @returns {Promise<Object>} Summarized content
 */
export const summarizePaper = async ({ text, context, options = {} }) => {
  try {
    const response = await apiRequest('POST', '/api/literature/summarize', { text, context, options });
    return await response.json();
  } catch (error) {
    console.error('Paper summarization error:', error);
    throw error;
  }
};

/**
 * Generate formatted citations for scientific papers
 * @param {Object} params - Citation parameters
 * @param {Array} params.papers - Array of paper objects to cite
 * @param {string} params.format - Citation format (vancouverStyle, apa, mla, harvard)
 * @param {boolean} params.numbered - Whether to use numbered citations
 * @returns {Promise<Object>} Generated citations
 */
export const generateCitations = async ({ papers, format = 'vancouverStyle', numbered = true }) => {
  try {
    const response = await apiRequest('POST', '/api/literature/generate-citations', { papers, format, numbered });
    return await response.json();
  } catch (error) {
    console.error('Citation generation error:', error);
    throw error;
  }
};

/**
 * Generate a complete literature review section based on selected papers
 * @param {Object} params - Parameters for literature review generation
 * @param {Array} params.papers - Array of selected papers with summaries
 * @param {string} params.context - CER context (device name, indication, etc.)
 * @param {Object} params.options - Generation options
 * @param {string} params.options.focus - Focus area ('safety', 'efficacy', 'both')
 * @param {string} params.options.format - Format ('comprehensive', 'concise')
 * @returns {Promise<Object>} Generated literature review
 */
export const generateLiteratureReview = async ({ papers, context, options = {} }) => {
  try {
    const response = await apiRequest('POST', '/api/literature/generate-review', { papers, context, options });
    return await response.json();
  } catch (error) {
    console.error('Literature review generation error:', error);
    throw error;
  }
};

/**
 * Upload and analyze PDF papers for literature review
 * @param {Object} params - Upload parameters
 * @param {File} params.file - PDF file to upload and analyze
 * @param {string} params.context - CER context (device name, indication, etc.)
 * @returns {Promise<Object>} Analyzed paper data
 */
export const analyzePaperPDF = async ({ file, context }) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('context', context || '');

    // Raw fetch required: FormData body needs browser-set Content-Type with boundary
    const response = await fetch('/api/literature/analyze-pdf', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to analyze PDF');
    }

    return await response.json();
  } catch (error) {
    console.error('PDF analysis error:', error);
    throw error;
  }
};

/**
 * Generate a relevance appraisal for a study in the literature review
 * Uses GPT-4o directly for enhanced analysis and consistent quality results.
 *
 * @param {Object} study - The study to appraise
 * @param {string} deviceName - The name of the device being evaluated
 * @param {Array} inclusionCriteria - List of inclusion criteria for the review
 * @param {Array} exclusionCriteria - List of exclusion criteria for the review
 * @returns {Promise<Object>} Generated relevance appraisal
 */
export const generateRelevanceAppraisal = async (
  study,
  deviceName,
  inclusionCriteria = [],
  exclusionCriteria = []
) => {
  try {
    console.log('Generating relevance appraisal using Claude AI', deviceName);

    const appraisal = await callServerAI({
      systemPrompt: `You are an expert in clinical literature appraisal with specialized knowledge of medical devices
            and EU MDR/MEDDEV 2.7/1 Rev 4 requirements for clinical evaluation reports.
            Your task is to assess the relevance of a scientific publication to a specific medical device evaluation
            in accordance with regulatory guidelines for CERs.
            Provide a structured JSON response with scores and justifications.`,
      userPrompt: `Please appraise the relevance of this study for a clinical evaluation of "${deviceName}" according to MEDDEV 2.7/1 Rev 4 requirements.

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

            For this assessment, follow EU MDR best practices by:
            - Ensuring device equivalence considerations are thoroughly analyzed
            - Evaluating clinical data quality against Annex XIV requirements
            - Assessing if the evidence supports intended purpose claims

            Provide an overall relevance score and a detailed summary of your assessment including regulatory considerations.
            Respond in valid JSON.`,
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = typeof appraisal === 'string' ? JSON.parse(appraisal) : appraisal;

    return {
      summary: parsed.summary || 'No summary available',
      scores: parsed.scores || {},
      criteriaAssessments: parsed.criteriaAssessments || {},
      overallScore: parsed.overallScore || 3,
      timestamp: new Date().toISOString(),
      aiProvider: 'claude',
      regulatoryFramework: 'EU MDR (MEDDEV 2.7/1 Rev 4)',
    };
  } catch (error) {
    console.error('AI relevance appraisal generation error:', error);

    // Re-attempt with backend API as backup
    try {
      console.log('Attempting to use server API for relevance appraisal');
      const response = await apiRequest('POST', '/api/literature/appraise-relevance', {
        study,
        deviceName,
        inclusionCriteria,
        exclusionCriteria,
      });
      return await response.json();
    } catch (backupError) {
      console.error('Backup server appraisal failed:', backupError);
      // Return a minimal default structure if all else fails
      return {
        summary: 'Could not generate automatic appraisal. Please assess manually.',
        scores: {},
        criteriaAssessments: {},
        overallScore: null,
        timestamp: new Date().toISOString(),
      };
    }
  }
};

/**
 * Generate a bias assessment for a study in the literature review
 * Uses GPT-4o directly for enhanced analysis and consistent quality results.
 *
 * @param {Object} study - The study to assess
 * @param {Array} biasDomains - List of bias domains to assess
 * @returns {Promise<Object>} Generated bias assessment
 */
export const generateBiasAssessment = async (study, biasDomains = []) => {
  try {
    console.log('Generating bias assessment using Claude AI');

    const assessment = await callServerAI({
      systemPrompt: `You are an expert in clinical literature appraisal with specialized knowledge in assessing bias in scientific studies
            according to the latest methodological standards (Cochrane RoB 2.0, ROBINS-I, etc.).
            Your task is to conduct a detailed risk of bias assessment for a clinical study in the context of a Clinical Evaluation Report
            following EU MDR (MEDDEV 2.7/1 Rev 4) requirements.
            Provide a structured JSON response with risk levels and detailed justifications for each bias domain.`,
      userPrompt: `Please conduct a comprehensive risk of bias assessment for this study:

            Study Title: ${study.title}
            Authors: ${study.authors?.join(', ') || 'Unknown'}
            ${study.abstract ? `Abstract: ${study.abstract}` : ''}
            ${study.journal ? `Journal: ${study.journal}` : ''}
            ${study.publication_date ? `Publication Date: ${study.publication_date}` : ''}

            Assess the risk of bias in these domains:
            ${biasDomains.map(domain => `- ${domain.name}: ${domain.description}`).join('\n')}

            For each domain:
            1. Assign a risk level of "low", "some_concerns", or "high"
            2. Provide a detailed justification based on EU MDR requirements
            3. Include specific observations from the study
            4. Recommend potential mitigations for identified biases

            Also provide:
            - An overall risk of bias assessment
            - A summary of your assessment with regulatory context
            - Quality assessment against GRADE criteria
            - Implications for data validity in a Clinical Evaluation Report
            Respond in valid JSON.`,
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = typeof assessment === 'string' ? JSON.parse(assessment) : assessment;

    return {
      summary: parsed.summary || 'No summary available',
      domainAssessments: parsed.domainAssessments || {},
      overallRisk: parsed.overallRisk || 'unclear',
      gradeAssessment: assessment.gradeAssessment || null,
      regulatoryImplications: assessment.regulatoryImplications || null,
      timestamp: new Date().toISOString(),
      aiProvider: 'gpt-4o',
      methodologyStandard: 'Cochrane RoB 2.0',
    };
  } catch (error) {
    console.error('AI bias assessment generation error:', error);

    // Re-attempt with backend API as backup
    try {
      console.log('Attempting to use server API for bias assessment');
      const response = await fetch('/api/literature/assess-bias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          study,
          biasDomains,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate bias assessment');
      }

      return await response.json();
    } catch (backupError) {
      console.error('Backup server assessment failed:', backupError);
      // Return a minimal default structure if all else fails
      return {
        summary: 'Could not generate automatic bias assessment. Please assess manually.',
        domainAssessments: {},
        overallRisk: 'unclear',
        timestamp: new Date().toISOString(),
      };
    }
  }
};

/**
 * Generate a search summary for the literature review
 * Uses GPT-4o directly for enhanced analysis and consistent quality results.
 *
 * @param {Object} reviewData - The literature review data
 * @returns {Promise<Object>} Generated search summary
 */
export const generateSearchSummary = async reviewData => {
  try {
    console.log('Generating literature search summary using Claude AI');

    const {
      title, device, author, date, databases,
      searchPeriod, searchQueries, inclusionCriteria,
      exclusionCriteria, selectedStudies, prismaFlow,
    } = reviewData;

    const summary = await callServerAI({
      systemPrompt: `You are an expert in clinical literature review and medical device evaluation
            with specialized knowledge of EU MDR (MEDDEV 2.7/1 Rev 4) requirements.
            Your task is to create a comprehensive search strategy summary for a Clinical Evaluation Report.
            Provide a structured JSON response that meets regulatory requirements for documenting literature search methodology.`,
      userPrompt: `Please generate a comprehensive search methodology summary for this literature review:

            Title: ${title || 'Literature Review for Clinical Evaluation Report'}
            Device: ${device || 'Medical Device'}
            Author: ${author || 'Clinical Evaluator'}
            Date: ${date || new Date().toISOString().split('T')[0]}

            Search Period:
            From: ${searchPeriod?.startDate || 'Not specified'}
            To: ${searchPeriod?.endDate || 'Not specified'}

            Databases searched:
            ${databases?.map(dbId => {
              const db = DATABASES.find(d => d.id === dbId);
              return db ? `- ${db.name}: ${db.description}` : `- ${dbId}`;
            }).join('\n') || 'No databases specified'}

            Search Queries:
            ${searchQueries?.map(q => `- Database: ${q.database}, Query: "${q.query}", Results: ${q.results}, Date: ${q.date}`).join('\n') || 'No search queries specified'}

            Inclusion Criteria:
            ${inclusionCriteria?.filter(c => c.enabled).map(c => `- ${c.criterion}`).join('\n') || 'No inclusion criteria specified'}

            Exclusion Criteria:
            ${exclusionCriteria?.filter(c => c.enabled).map(c => `- ${c.criterion}`).join('\n') || 'No exclusion criteria specified'}

            PRISMA Flow Data:
            - Records identified: ${prismaFlow?.identified || 0}
            - Records screened: ${prismaFlow?.screened || 0}
            - Records assessed for eligibility: ${prismaFlow?.eligible || 0}
            - Studies included in the review: ${prismaFlow?.included || 0}

            Selected Studies:
            ${selectedStudies?.map((s, i) => `${i + 1}. ${s.title} (${s.authors?.join(', ') || 'Unknown'}, ${s.publication_date || 'Unknown date'})`).join('\n') || 'No studies selected'}

            Based on this information, produce:
            1. A formatted search methodology text for inclusion in a CER according to MEDDEV 2.7/1 Rev 4
            2. An analysis of search completeness and potential gaps
            3. Recommendations for improving the search if needed
            4. A conclusion about the adequacy of the search for regulatory compliance

            Include appropriate regulatory language and ensure the summary would satisfy Notified Body scrutiny.
            Respond in valid JSON.`,
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = typeof summary === 'string' ? JSON.parse(summary) : summary;

    return {
      methodologyText: parsed.methodologyText || 'No methodology text available',
      analysis: parsed.analysis || 'No analysis available',
      recommendations: parsed.recommendations || [],
      conclusion: parsed.conclusion || 'No conclusion available',
      timestamp: new Date().toISOString(),
      aiProvider: 'claude',
      regulatoryFramework: 'EU MDR (MEDDEV 2.7/1 Rev 4)',
    };
  } catch (error) {
    console.error('AI search summary generation error:', error);

    // Re-attempt with backend API as backup
    try {
      console.log('Attempting to use server API for search summary');
      const response = await fetch('/api/literature/search-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reviewData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate search summary');
      }

      return await response.json();
    } catch (backupError) {
      console.error('Backup server summary generation failed:', backupError);
      // Use fallback if all else fails
      return generateAISearchSummary(reviewData);
    }
  }
};

// Fallback AI generators using server-side Claude proxy
const generateAIRelevanceAppraisal = async (study, deviceName, inclusionCriteria, exclusionCriteria) => {
  try {
    const result = await callServerAI({
      systemPrompt: `You are an expert in clinical literature appraisal with specialized knowledge of medical devices.
            Assess the relevance of a scientific publication to a specific medical device evaluation.
            Provide a structured JSON response with scores and justifications.`,
      userPrompt: `Appraise the relevance of this study for a clinical evaluation of "${deviceName}".
            Study Title: ${study.title}
            Authors: ${study.authors?.join(', ') || 'Unknown'}
            ${study.abstract ? `Abstract: ${study.abstract}` : ''}
            Inclusion Criteria: ${inclusionCriteria.map(c => `- ${c}`).join('\n')}
            Exclusion Criteria: ${exclusionCriteria.map(c => `- ${c}`).join('\n')}
            Rate device, population, outcome, and setting relevance (1-5 each). Respond in valid JSON.`,
      jsonMode: true,
      temperature: 0.2,
    });
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    return {
      summary: parsed.summary || 'No summary available',
      scores: parsed.scores || {},
      criteriaAssessments: parsed.criteriaAssessments || {},
      overallScore: parsed.overallScore || 3,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('AI relevance appraisal generation error:', error);
    return {
      summary: 'Could not generate automatic appraisal. Please assess manually.',
      scores: {},
      criteriaAssessments: {},
      overallScore: null,
      timestamp: new Date().toISOString(),
    };
  }
};

const generateAIBiasAssessment = async (study, biasDomains) => {
  try {
    const result = await callServerAI({
      systemPrompt: `You are an expert in assessing bias in scientific studies using Cochrane RoB 2.0 methodology.
            Provide a structured JSON response with risk levels and justifications for each bias domain.`,
      userPrompt: `Conduct a risk of bias assessment for this study:
            Study Title: ${study.title}
            Authors: ${study.authors?.join(', ') || 'Unknown'}
            ${study.abstract ? `Abstract: ${study.abstract}` : ''}
            Bias domains: ${biasDomains.map(d => `- ${d.name}: ${d.description}`).join('\n')}
            Assign "low", "some_concerns", or "high" for each domain. Respond in valid JSON.`,
      jsonMode: true,
      temperature: 0.2,
    });
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    return {
      summary: parsed.summary || 'No summary available',
      domainAssessments: parsed.domainAssessments || {},
      overallRisk: parsed.overallRisk || 'unclear',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('AI bias assessment generation error:', error);
    return {
      summary: 'Could not generate automatic bias assessment. Please assess manually.',
      domainAssessments: {},
      overallRisk: 'unclear',
      timestamp: new Date().toISOString(),
    };
  }
};

const generateAISearchSummary = async reviewData => {
  try {
    const content = await callServerAI({
      systemPrompt: `You are an expert in clinical literature reviews with specialized knowledge of medical devices.
            Generate a comprehensive summary of a literature search methodology and results.
            Provide both narrative text and structured tables in HTML format.`,
      userPrompt: `Generate a comprehensive summary of this literature search for ${reviewData.device || 'a medical device'}:
            Databases: ${reviewData.databases?.join(', ') || 'Not specified'}
            Search period: ${reviewData.searchPeriod?.startDate || 'N/A'} to ${reviewData.searchPeriod?.endDate || 'N/A'}
            Queries: ${reviewData.searchQueries?.map(q => `${q.database}: ${q.query} (${q.results} results)`).join('; ') || 'N/A'}
            PRISMA: Identified ${reviewData.prismaFlow?.identified || 0}, Screened ${reviewData.prismaFlow?.screened || 0}, Eligible ${reviewData.prismaFlow?.eligible || 0}, Included ${reviewData.prismaFlow?.included || 0}
            Studies: ${reviewData.selectedStudies?.map(s => s.title).join('; ') || 'None'}
            Format as HTML with narrative summary, study table, and key findings.`,
      temperature: 0.3,
    });

    const text = typeof content === 'string' ? content : content.content || '';
    const contentMatch = text.match(/<html>([\s\S]*?)<\/html>/) || text.match(/<body>([\s\S]*?)<\/body>/);
    const includedStudiesTable = reviewData.selectedStudies?.map(s => ({
      title: s.title || 'Unknown',
      year: s.publication_date ? new Date(s.publication_date).getFullYear() : 'Unknown',
      type: s.studyType || 'Not specified',
      relevance: s.overallRelevance ? (s.overallRelevance >= 4 ? 'High' : s.overallRelevance >= 3 ? 'Medium' : 'Low') : 'Not assessed',
      quality: s.overallQuality ? (s.overallQuality === 'high' ? 'High' : s.overallQuality === 'medium' ? 'Medium' : 'Low') : 'Not assessed',
    })) || [];

    return {
      content: contentMatch ? contentMatch[1] : text,
      tables: { included_studies: includedStudiesTable },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('AI search summary generation error:', error);
    return {
      content: '<p>Could not generate automatic search summary. Please review manually.</p>',
      tables: { included_studies: [] },
      timestamp: new Date().toISOString(),
    };
  }
};

// Export service object for easy imports (moved to end of file to fix circular dependency)
export const literatureAPIService = {
  searchPubMed,
  searchLiterature,
  summarizePaper,
  generateCitations,
  generateLiteratureReview,
  analyzePaperPDF,
  generateRelevanceAppraisal,
  generateBiasAssessment,
  generateSearchSummary,
};
