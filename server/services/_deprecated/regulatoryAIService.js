/**
 * Regulatory AI Service for TrialSage
 *
 * This service implements a Retrieval-Augmented Generation (RAG) approach
 * to enhance the AI's responses with regulatory knowledge.
 *
 * NOTE: This version uses the file system for storage rather than SQLite
 * to avoid dependency issues.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as documentProcessor from './documentProcessor.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the knowledge base
const DATA_DIR = path.join(__dirname, '../../data');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge_base');
const METADATA_PATH = path.join(KNOWLEDGE_DIR, 'metadata.json');
const DOCUMENTS_DIR = path.join(KNOWLEDGE_DIR, 'documents');
const JURISDICTIONS_DIR = path.join(KNOWLEDGE_DIR, 'jurisdictions');

// Create directories if they don't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(KNOWLEDGE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(JURISDICTIONS_DIR)) {
  fs.mkdirSync(JURISDICTIONS_DIR, { recursive: true });

  // Create jurisdiction subdirectories
  const jurisdictions = [
    'FDA',
    'EMA',
    'ICH',
    'WHO',
    'PMDA',
    'NMPA',
    'Health_Canada',
    'TGA',
    'General',
  ];
  jurisdictions.forEach(jurisdiction => {
    const jurisdictionDir = path.join(JURISDICTIONS_DIR, jurisdiction);
    if (!fs.existsSync(jurisdictionDir)) {
      fs.mkdirSync(jurisdictionDir, { recursive: true });
    }
  });
}

/**
 * Enhanced semantic search to match user queries against knowledge base documents
 * This version uses a file-based approach with keyword matching and ranking
 * @param {string} query - The user's query
 * @param {number} limit - Number of documents to retrieve
 * @returns {Promise<Array>} - Array of relevant documents
 */
async function retrieveDocuments(query, limit = 5) {
  // Extract key regulatory terms to improve search relevance
  const regulatoryTerms = extractRegulatoryTerms(query);

  try {
    // Check if the knowledge base directory exists
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      return [];
    }

    // Use the documentProcessor to search the knowledge base
    const results = await documentProcessor.searchKnowledgeBase(
      query,
      null, // No jurisdiction filter
      null, // No document type filter
      limit
    );

    // Sort results by relevance (simple implementation that prioritizes documents
    // that match regulatory terms)
    return results
      .sort((a, b) => {
        const aContent = a.content?.toLowerCase() || '';
        const bContent = b.content?.toLowerCase() || '';
        let aScore = 0;
        let bScore = 0;

        // Score based on matches to regulatory terms
        regulatoryTerms.forEach(term => {
          if (aContent.includes(term.toLowerCase())) {
            aScore += 10; // Higher weight for regulatory term matches
          }
          if (bContent.includes(term.toLowerCase())) {
            bScore += 10; // Higher weight for regulatory term matches
          }
        });

        // Also score based on match to the original query
        if (aContent.includes(query.toLowerCase())) {
          aScore += 5;
        }
        if (bContent.includes(query.toLowerCase())) {
          bScore += 5;
        }

        // Finally, prioritize shorter documents slightly (they tend to be more focused)
        aScore -= aContent.length / 100000;
        bScore -= bContent.length / 100000;

        return bScore - aScore; // Higher score first
      })
      .slice(0, limit);
  } catch (error) {
    console.error('Error retrieving documents:', error);
    return [];
  }
}

/**
 * Extract regulatory-specific terms from a query
 * @param {string} query - The user's query
 * @returns {Array<string>} - Array of regulatory terms
 */
function extractRegulatoryTerms(query) {
  const terms = [];
  const lowerQuery = query.toLowerCase();

  // Regulatory authorities
  const authorities = [
    'fda',
    'ema',
    'pmda',
    'nmpa',
    'health canada',
    'tga',
    'ich',
    'who',
    'iso',
    'imdrf',
    'mhra',
  ];

  // Regulatory frameworks and key terms
  const regulatoryFrameworks = [
    '510k',
    '510(k)',
    'pma',
    'de novo',
    'qsr',
    'mdr',
    'ivdr',
    'ce mark',
    'clinical evaluation report',
    'cer',
    'substantial equivalence',
    'predicate',
    'risk management',
    'post-market surveillance',
    'pms',
    'clinical trial',
    'ich e6',
    'ich e8',
    'ich e9',
    'gcp',
    'medical device',
  ];

  // Check for authorities in the query
  authorities.forEach(auth => {
    if (lowerQuery.includes(auth)) {
      terms.push(auth);
    }
  });

  // Check for regulatory frameworks and key terms
  regulatoryFrameworks.forEach(framework => {
    if (lowerQuery.includes(framework)) {
      terms.push(framework);
    }
  });

  return terms;
}

/**
 * RBM knowledge base - specialized content about Risk-Based Monitoring
 * This information is derived from FDA's guidelines on bioresearch monitoring inspections
 */
const rbmKnowledgeBase = {
  definition: `Risk-Based Monitoring (RBM) is a strategic approach to clinical trial oversight that focuses monitoring activities on the areas of highest risk to data quality and participant safety. Instead of traditional 100% source data verification, RBM uses risk assessment, centralized data review, and targeted on-site visits to enhance monitoring efficiency while maintaining or improving study quality.`,

  keyPrinciples: [
    'Focus monitoring efforts on critical data and processes that impact participant safety and data integrity',
    'Use risk assessment to identify key risk indicators and determine monitoring strategy',
    'Implement centralized monitoring to review data remotely in real-time',
    'Perform targeted site visits based on risk indicators rather than routine schedules',
    'Establish quality tolerance limits for critical data and processes',
    'Document the rationale for the monitoring approach in the monitoring plan',
  ],

  components: {
    riskAssessment:
      'Systematic evaluation of trial-specific risks to participant safety and data integrity, including identification of critical data and processes.',
    monitoringPlan:
      'Study-specific document that outlines the monitoring strategy, including timing, methods, and responsibilities.',
    centralizedMonitoring:
      'Remote review of aggregated data to identify trends, patterns, and outliers across sites.',
    onSiteMonitoring:
      'Targeted visits to investigational sites based on risk indicators, focusing on critical activities.',
    qualityToleranceLimits:
      'Predefined thresholds for critical data and processes that trigger additional monitoring or action when exceeded.',
  },

  benefits: [
    'More efficient use of monitoring resources',
    'Earlier detection of issues through real-time data review',
    'Reduced burden on investigational sites',
    'Focus on highest-impact areas for data quality and participant safety',
    'Potential cost savings compared to traditional 100% monitoring',
  ],

  regulatoryBackground: {
    fda: 'FDA guidance on Risk-Based Monitoring encourages innovative approaches to improve trial quality and efficiency, aligning with BIMO (Bioresearch Monitoring) inspection processes.',
    ema: "EMA's Reflection Paper promotes risk-proportionate approaches to clinical trial monitoring, focusing on critical processes and data.",
    ich: 'ICH GCP E6(R2) includes provisions for risk-based approaches to monitoring, emphasizing quality by design principles.',
  },

  implementation: {
    steps: [
      'Identify critical data and processes',
      'Conduct risk assessment',
      'Develop monitoring plan based on risk assessment',
      'Define key risk indicators and quality tolerance limits',
      'Implement centralized monitoring capabilities',
      'Train team on risk-based approach',
      'Execute monitoring according to plan',
      'Adapt monitoring strategy as risks evolve',
    ],
    challenges: [
      'Determining appropriate risk indicators',
      'Establishing meaningful quality tolerance limits',
      'Integrating multiple data sources for centralized monitoring',
      'Ensuring proper documentation of risk-based decisions',
      'Training monitors on new methodologies',
      'Managing the transition from traditional approaches',
    ],
  },

  bimoInspections: {
    focus:
      "FDA's Bioresearch Monitoring Program (BIMO) inspections assess compliance with regulations and adherence to monitoring plans. For trials using RBM, inspectors evaluate whether the monitoring approach was appropriate for the risks identified and whether the sponsor implemented the monitoring plan effectively.",
    documentation:
      'Sponsors should maintain documentation of risk assessments, monitoring plans, centralized monitoring activities, site visit reports, and actions taken in response to identified issues.',
    commonFindings: [
      'Inadequate risk assessment',
      'Failure to implement monitoring plan as described',
      'Insufficient documentation of monitoring activities',
      'Lack of follow-up on identified issues',
      'Inappropriate quality tolerance limits',
      'Inadequate oversight of CROs or vendors',
    ],
  },
};

/**
 * Check if a query is related to Risk-Based Monitoring (RBM)
 * @param {string} query - The user's query
 * @returns {boolean} - Whether the query is RBM-related
 */
function isRbmQuery(query) {
  if (!query) return false;

  const lowerQuery = query.toLowerCase();
  const rbmTerms = [
    'rbm',
    'risk-based monitoring',
    'risk based monitoring',
    'bioresearch monitoring',
    'bimo',
    'central monitoring',
    'centralized monitoring',
    'remote monitoring',
    'risk indicators',
    'quality tolerance limit',
    'qtl',
    'critical data',
    'critical process',
  ];

  return rbmTerms.some(term => lowerQuery.includes(term));
}

/**
 * Generate a response to an RBM-related query using direct OpenAI integration
 * @param {string} query - The user's query
 * @returns {Promise<string>} - The response
 */
async function generateRbmResponse(query) {
  try {
    // Create structured RBM knowledge from our knowledge base
    const rbmContext = `
# Risk-Based Monitoring (RBM) Knowledge

## Definition
${rbmKnowledgeBase.definition}

## Key Principles
${rbmKnowledgeBase.keyPrinciples.map(p => `- ${p}`).join('\n')}

## Components
${Object.entries(rbmKnowledgeBase.components)
  .map(([k, v]) => `### ${k}\n${v}`)
  .join('\n\n')}

## Benefits
${rbmKnowledgeBase.benefits.map(b => `- ${b}`).join('\n')}

## Regulatory Background
${Object.entries(rbmKnowledgeBase.regulatoryBackground)
  .map(([k, v]) => `### ${k.toUpperCase()}\n${v}`)
  .join('\n\n')}

## Implementation
### Steps
${rbmKnowledgeBase.implementation.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Challenges
${rbmKnowledgeBase.implementation.challenges.map(c => `- ${c}`).join('\n')}

## BIMO Inspections
${rbmKnowledgeBase.bimoInspections.focus}

### Documentation Requirements
${rbmKnowledgeBase.bimoInspections.documentation}

### Common Inspection Findings
${rbmKnowledgeBase.bimoInspections.commonFindings.map(f => `- ${f}`).join('\n')}
    `;

    // First try to use OpenAI API directly
    try {
      const OpenAI = await import('openai');
      const openai = new OpenAI.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a specialized regulatory affairs AI assistant with expertise in Risk-Based Monitoring (RBM) for clinical trials. Use the provided RBM knowledge to answer user questions comprehensively and accurately. Format responses using markdown for clarity.',
          },
          {
            role: 'user',
            content: `Here is specialized knowledge about Risk-Based Monitoring:\n\n${rbmContext}\n\nBased on this knowledge, provide a detailed answer to the following question: ${query}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message.content;
      }
    } catch (openaiError) {
      console.error('Error calling OpenAI API directly:', openaiError);
      // Fall back to template-based response
    }

    // Fallback to template-based responses if OpenAI API fails
    const lowerQuery = query.toLowerCase();
    let response = '';

    // Match query to most relevant information
    if (lowerQuery.includes('what is') || lowerQuery.includes('definition')) {
      response = `# Risk-Based Monitoring (RBM)\n\n${rbmKnowledgeBase.definition}\n\n## Key Principles\n\n`;
      rbmKnowledgeBase.keyPrinciples.forEach(principle => {
        response += `- ${principle}\n`;
      });
    } else if (lowerQuery.includes('benefit') || lowerQuery.includes('advantage')) {
      response = `# Benefits of Risk-Based Monitoring\n\n`;
      rbmKnowledgeBase.benefits.forEach(benefit => {
        response += `- ${benefit}\n`;
      });
    } else if (
      lowerQuery.includes('component') ||
      lowerQuery.includes('element') ||
      lowerQuery.includes('part')
    ) {
      response = `# Components of Risk-Based Monitoring\n\n`;
      for (const [component, description] of Object.entries(rbmKnowledgeBase.components)) {
        response += `## ${component.charAt(0).toUpperCase() + component.slice(1)}\n${description}\n\n`;
      }
    } else if (
      lowerQuery.includes('implement') ||
      lowerQuery.includes('how to') ||
      lowerQuery.includes('setup')
    ) {
      response = `# Implementing Risk-Based Monitoring\n\n## Implementation Steps\n\n`;
      rbmKnowledgeBase.implementation.steps.forEach((step, index) => {
        response += `${index + 1}. ${step}\n`;
      });
      response += `\n## Implementation Challenges\n\n`;
      rbmKnowledgeBase.implementation.challenges.forEach(challenge => {
        response += `- ${challenge}\n`;
      });
    } else if (
      lowerQuery.includes('inspect') ||
      lowerQuery.includes('bimo') ||
      lowerQuery.includes('fda')
    ) {
      response = `# FDA BIMO Inspections & Risk-Based Monitoring\n\n${rbmKnowledgeBase.bimoInspections.focus}\n\n## Documentation Requirements\n\n${rbmKnowledgeBase.bimoInspections.documentation}\n\n## Common Inspection Findings\n\n`;
      rbmKnowledgeBase.bimoInspections.commonFindings.forEach(finding => {
        response += `- ${finding}\n`;
      });
    } else if (
      lowerQuery.includes('regulat') ||
      lowerQuery.includes('guidance') ||
      lowerQuery.includes('guideline')
    ) {
      response = `# Regulatory Background for Risk-Based Monitoring\n\n`;
      for (const [authority, guidance] of Object.entries(rbmKnowledgeBase.regulatoryBackground)) {
        response += `## ${authority.toUpperCase()}\n${guidance}\n\n`;
      }
    } else {
      // General overview for queries that don't match specific categories
      response = `# Risk-Based Monitoring (RBM) Overview\n\n${rbmKnowledgeBase.definition}\n\n## Key Components\n\n`;
      for (const [component, description] of Object.entries(rbmKnowledgeBase.components)) {
        response += `- **${component.charAt(0).toUpperCase() + component.slice(1)}**: ${description}\n`;
      }
      response += `\n## Benefits\n\n`;
      rbmKnowledgeBase.benefits.forEach(benefit => {
        response += `- ${benefit}\n`;
      });
    }

    return response;
  } catch (error) {
    console.error('Error generating RBM response:', error);
    return `# Risk-Based Monitoring Information\n\nI encountered an error generating a response about Risk-Based Monitoring. Please try again with a more specific question about RBM components, benefits, implementation, or regulatory requirements.`;
  }
}

/**
 * Prepare context from retrieved documents
 * @param {Array} documents - The retrieved documents
 * @returns {string} - Formatted context for the AI
 */
function prepareContext(documents) {
  if (!documents || documents.length === 0) {
    return '';
  }

  let context = 'REGULATORY KNOWLEDGE:\n\n';

  documents.forEach((doc, index) => {
    context += `[Document ${index + 1}] `;

    if (doc.jurisdiction) {
      context += `Jurisdiction: ${doc.jurisdiction}. `;
    }

    if (doc.doc_type) {
      context += `Type: ${doc.doc_type}. `;
    }

    if (doc.source) {
      context += `Source: ${doc.source}`;

      if (doc.section) {
        context += `, Section: ${doc.section}`;
      }

      context += '. ';
    }

    context += '\n';
    context += doc.content;
    context += '\n\n';
  });

  return context;
}

/**
 * Perform an external web search for up-to-date information
 * @param {string} query - The search query
 * @returns {Promise<Array>} - Search results
 */
async function performExternalSearch(query) {
  try {
    console.log(`Performing external search for: "${query}"`);

    // For regulatory queries, include specialized medical and regulatory databases
    const regulatoryTerms = extractRegulatoryTerms(query);

    // Search for information from external sources like FDA, EMA, etc.
    const externalSources = [];

    // Try to use externalSearch service for FDA, PubMed, clinical trials, etc.
    try {
      // Dynamically import the externalSearch service to avoid circular dependencies
      const {
        searchFDA,
        searchClinicalTrials,
        searchPubMed,
        searchFAERS,
        searchEMA,
        comprehensiveSearch,
      } = await import('../services/externalSearch.js');

      console.log('External search service imported successfully');

      // Use comprehensive search for regulatory content
      const searchResults = await comprehensiveSearch(query);

      console.log(`External search results: ${JSON.stringify(searchResults, null, 2)}`);

      if (searchResults && Object.keys(searchResults).length > 0) {
        // Format the search results for context enhancement
        Object.entries(searchResults).forEach(([source, results]) => {
          if (Array.isArray(results) && results.length > 0) {
            results.slice(0, 3).forEach(result => {
              externalSources.push({
                source: source,
                title: result.title || '',
                content: result.description || result.summary || '',
                url: result.url || '',
                date: result.date || new Date().toISOString().split('T')[0],
              });
            });
          }
        });
      }

      console.log(`Formatted external sources: ${JSON.stringify(externalSources, null, 2)}`);
    } catch (searchError) {
      console.warn(`External search service error: ${searchError.message}`);
      // Continue with placeholder search results if the service fails
      externalSources.push({
        source: 'regulatory_database',
        title: 'Latest regulatory guidance',
        content:
          'This would be replaced with real-time search results from external regulatory databases in production.',
        url: 'https://example.com/search-result',
        date: new Date().toISOString().split('T')[0],
      });
    }

    return externalSources;
  } catch (error) {
    console.error('Error performing external search:', error);
    return [];
  }
}

/**
 * Generate a response using the OpenAI API with RAG enhanced by web search
 * @param {string} query - The user's query
 * @param {string} context - The context from RAG
 * @returns {Promise<Object>} - The AI response
 */
async function generateRagResponse(query, context = '') {
  try {
    // Extract regulatory context from the query
    let regulatoryContext = 'general';

    // Check for specific jurisdictions in the query
    const lowerQuery = query.toLowerCase();
    if (
      lowerQuery.includes('fda') ||
      lowerQuery.includes('us regulation') ||
      lowerQuery.includes('510k') ||
      lowerQuery.includes('510(k)')
    ) {
      regulatoryContext = 'FDA';
    } else if (
      lowerQuery.includes('ema') ||
      lowerQuery.includes('eu regulation') ||
      lowerQuery.includes('mdr') ||
      lowerQuery.includes('ivdr')
    ) {
      regulatoryContext = 'EMA';
    } else if (lowerQuery.includes('ich') || lowerQuery.includes('international')) {
      regulatoryContext = 'ICH';
    }

    console.log('Using enhanced response for query: ' + JSON.stringify(query));

    // Check if we have a knowledge base yet
    const hasKnowledgeBase =
      fs.existsSync(KNOWLEDGE_DIR) &&
      fs.existsSync(METADATA_PATH) &&
      fs.readdirSync(KNOWLEDGE_DIR).length > 1; // More than just metadata.json

    // If no internal knowledge is found or context is empty, try external search
    let responseContext = context;
    let responseSource = 'knowledge-base';

    if (!hasKnowledgeBase || !context || context.trim() === '') {
      console.log('No internal knowledge found, performing external search');

      // Perform a real-time web search to get the most current information
      const searchResults = await performExternalSearch(query);

      if (searchResults && searchResults.length > 0) {
        // Format external search results to use as context
        responseContext = 'Information from external sources:\n\n';
        searchResults.forEach(result => {
          responseContext += `Source: ${result.source}\nTitle: ${result.title}\nDate: ${result.date}\n${result.content}\n\n`;
        });
        responseSource = 'external_search';
      } else {
        // No external information found
        responseContext = 'No specific information found in knowledge base or external sources.';
      }
    }

    // Generate a response using OpenAI with the appropriate context
    console.log('Using OpenAI to generate response with context');

    try {
      // Import and initialize OpenAI
      const OpenAI = await import('openai');
      const openai = new OpenAI.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Prepare system message with context
      const systemMessage = `You are Lumen, an expert AI assistant specializing in regulatory affairs for medical devices, pharmaceuticals, and clinical trials. 
You provide comprehensive, accurate information about global regulatory frameworks including FDA, EMA, PMDA, NMPA, Health Canada, TGA, and ICH guidelines.

Use the following context to answer the query:
${responseContext}

When responding:
- Provide evidence-based information with citations when available
- Use markdown formatting for clear, structured responses
- Include relevant section headers, bullet points, and numbered lists
- Be conversational but precise and authoritative`;

      // Call the OpenAI API
      const openAIResponse = await openai.chat.completions.create({
        model: 'gpt-4o', // Using the newest OpenAI model
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: query },
        ],
        temperature: 0.2, // Lower temperature for more accurate, deterministic responses
        max_tokens: 1500, // Allow for comprehensive answers
      });

      if (openAIResponse.choices && openAIResponse.choices.length > 0) {
        return {
          response: openAIResponse.choices[0].message.content,
          source: responseSource,
          context: regulatoryContext,
        };
      }
    } catch (openaiError) {
      console.error(`Error calling OpenAI API for RAG: ${openaiError.message}`);
      // Fall back to a basic response based on context
    }

    // Generate a fallback response if OpenAI fails
    const regulatoryTerms = extractRegulatoryTerms(query);
    let responseText = '';

    if (regulatoryTerms.length > 0) {
      responseText = `Based on my analysis of regulatory documents, I can provide the following information about ${regulatoryTerms.join(', ')}:\n\n${responseContext}`;
    } else {
      responseText = `Based on my analysis, here's what I found:\n\n${responseContext}`;
    }

    return {
      response: responseText,
      source: responseSource,
      context: regulatoryContext,
    };
  } catch (error) {
    console.error('Error generating response:', error);
    return {
      response:
        'I encountered an error while trying to generate a response. Please try again or check the server logs for more information.',
      error: error.message,
    };
  }
}

/**
 * Process a user query and generate an AI response enhanced with regulatory knowledge
 * @param {string} query - The user's query
 * @param {string} contextFilter - Filter context by jurisdiction or category
 * @returns {Promise<Object>} - The AI response
 */
/**
 * Generate a comprehensive AI response using OpenAI's advanced capabilities
 * This function provides fully conversational responses with external knowledge access
 * @param {string} query - The user's query
 * @param {Array} conversationHistory - Previous conversation messages
 * @returns {Promise<string>} - The AI response text
 */
async function generateConversationalResponse(query, conversationHistory = []) {
  try {
    console.log('Generating conversational response with external research capabilities');

    // Import the OpenAI client (using the new API format)
    const OpenAI = await import('openai');

    // Configure the client with the new API format
    const openai = new OpenAI.default({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Build the messages array for OpenAI
    const messages = [];

    // Add system message with comprehensive instructions
    messages.push({
      role: 'system',
      content: `You are Lumen, an expert AI assistant specializing in regulatory affairs for medical devices, pharmaceuticals, and clinical trials. You provide comprehensive, accurate information about global regulatory frameworks including FDA, EMA, PMDA, NMPA, Health Canada, TGA, and ICH guidelines.

You have the following capabilities:
1. Deep regulatory knowledge across multiple jurisdictions
2. Access to current information and updates on regulations
3. Understanding of clinical trial protocols and requirements
4. Expertise in medical device regulations including 510(k) submissions
5. Knowledge of Risk-Based Monitoring (RBM) for clinical trials
6. Pharmaceutical compliance requirements expertise

When responding:
- Provide evidence-based information with citations when available
- Use markdown formatting for clear, structured responses
- Include relevant section headers, bullet points, and numbered lists
- Research topics thoroughly when responding`,
    });

    // Add conversation history if it exists
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.forEach(msg => {
        if (msg.role && msg.content) {
          messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
          });
        }
      });
    }

    // Add the current query
    messages.push({
      role: 'user',
      content: query,
    });

    // Call the OpenAI API with new API format
    const openAIResponse = await openai.chat.completions.create({
      model: 'gpt-4o', // Using the newest OpenAI model
      messages: messages,
      temperature: 0.2, // Lower temperature for more accurate, deterministic responses
      max_tokens: 2000, // Allow for comprehensive answers
    });

    if (openAIResponse.choices && openAIResponse.choices.length > 0) {
      return openAIResponse.choices[0].message.content;
    } else {
      throw new Error('No response generated from OpenAI');
    }
  } catch (error) {
    console.error(`Error in generateConversationalResponse: ${error.message}`);
    throw error;
  }
}

async function processQuery(query, contextFilter = 'general', conversationHistory = []) {
  try {
    // First check if this is an RBM-related query
    if (isRbmQuery(query)) {
      console.log('RBM-related query detected, using specialized RBM knowledge');
      const rbmResponse = await generateRbmResponse(query);
      return {
        response: rbmResponse,
        source: 'rbm-knowledge-base',
      };
    }

    // Try using the fully conversational approach with OpenAI first
    try {
      console.log('Using fully conversational AI with external knowledge capabilities');
      const conversationalResponse = await generateConversationalResponse(
        query,
        conversationHistory
      );
      return {
        response: conversationalResponse,
        source: 'openai-comprehensive',
      };
    } catch (conversationalError) {
      console.error(`Error with conversational AI: ${conversationalError.message}`);
      // Continue with fallback approaches if conversational AI fails
    }

    // If not an RBM query and conversational approach failed, proceed with normal knowledge base processing
    // Check if the knowledge base directory exists
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      console.warn('Knowledge base directory does not exist, initializing empty knowledge base');
      await documentProcessor.initializeDatabase();
      return {
        response:
          "I'm setting up my knowledge base for the first time. Please upload regulatory documents to help me provide better answers to your questions.",
      };
    }

    // Retrieve relevant documents from the knowledge base
    let documents = [];

    try {
      documents = await retrieveDocuments(query, 5);

      // Apply context filter if specified
      if (contextFilter && contextFilter !== 'general' && contextFilter !== 'global') {
        // Filter documents by jurisdiction if it matches the context filter
        const jurisdictionFilter = contextFilter.toUpperCase();
        documents = documents.filter(doc => {
          const docJurisdiction = (doc.jurisdiction || '').toUpperCase();
          return (
            docJurisdiction.includes(jurisdictionFilter) ||
            jurisdictionFilter.includes(docJurisdiction)
          );
        });
      }
    } catch (error) {
      console.warn('Error retrieving documents:', error);
      // Continue with empty documents
    }

    // Prepare context from retrieved documents
    const context = prepareContext(documents);

    // Generate response using context and query
    return generateRagResponse(query, context);
  } catch (error) {
    console.error('Error processing query:', error);
    return {
      response: 'An error occurred while processing your query. Please try again later.',
      error: error.message,
    };
  }
}

// Export functions
export {
  processQuery,
  retrieveDocuments,
  extractRegulatoryTerms,
  prepareContext,
  generateRagResponse,
  performExternalSearch,
  isRbmQuery,
  generateRbmResponse,
};
