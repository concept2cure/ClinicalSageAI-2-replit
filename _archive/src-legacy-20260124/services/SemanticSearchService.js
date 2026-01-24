// client/src/services/SemanticSearchService.js

/**
 * Semantic Search Service
 *
 * Provides NLP-powered search capabilities across all document types and modules
 * using embeddings and contextual search.
 */

// Demo data for mock search results
const mockDocuments = [
  {
    id: 'doc-001',
    title: 'Safety Monitoring Report - Phase II Clinical Trial XYZ-123',
    type: 'report',
    module: 'csr',
    date: '2024-12-15',
    region: 'us',
    status: 'final',
    content: 'Several safety concerns were identified in the Phase II clinical trial...',
    tags: ['safety', 'phase ii', 'clinical trial', 'adverse events'],
    relevance: 0.92,
  },
  {
    id: 'doc-002',
    title: 'EU Regulatory Submission - Q1 Compliance Report',
    type: 'submission',
    module: 'regulatory',
    date: '2025-03-30',
    region: 'eu',
    status: 'final',
    content: 'Critical deviations were observed in the EU submissions during Q1, specifically...',
    tags: ['eu', 'q1', 'compliance', 'deviation', 'regulatory'],
    relevance: 0.89,
  },
  {
    id: 'doc-003',
    title: 'Protocol Amendment 3 - Revised Timeline',
    type: 'protocol',
    module: 'ind',
    date: '2025-01-22',
    region: 'global',
    status: 'approved',
    content: 'Due to the timeline impacts from the previous amendments, we have revised...',
    tags: ['protocol', 'amendment', 'timeline', 'revision'],
    relevance: 0.85,
  },
  {
    id: 'doc-004',
    title: 'CAPA Report - Manufacturing Quality Issue',
    type: 'report',
    module: 'quality',
    date: '2025-02-10',
    region: 'global',
    status: 'in-progress',
    content: 'The quality issues identified require a comprehensive CAPA plan...',
    tags: ['capa', 'quality', 'manufacturing', 'issue'],
    relevance: 0.82,
  },
  {
    id: 'doc-005',
    title: 'Site Status Report - Patient Recruitment Challenges',
    type: 'report',
    module: 'csr',
    date: '2025-03-05',
    region: 'global',
    status: 'draft',
    content: 'Multiple sites have reported challenges with patient recruitment...',
    tags: ['recruitment', 'patients', 'sites', 'challenges'],
    relevance: 0.79,
  },
  {
    id: 'doc-006',
    title: 'FDA Response - Information Request',
    type: 'correspondence',
    module: 'regulatory',
    date: '2025-01-18',
    region: 'us',
    status: 'final',
    content: 'The FDA has requested additional information regarding the safety data...',
    tags: ['fda', 'response', 'safety', 'request'],
    relevance: 0.77,
  },
  {
    id: 'doc-007',
    title: 'IND Amendment for Product XYZ-123',
    type: 'submission',
    module: 'ind',
    date: '2024-11-25',
    region: 'us',
    status: 'submitted',
    content: 'This IND amendment addresses the chemistry, manufacturing, and controls...',
    tags: ['ind', 'amendment', 'cmc', 'submission'],
    relevance: 0.76,
  },
  {
    id: 'doc-008',
    title: 'PMDA Pre-Submission Meeting Minutes',
    type: 'correspondence',
    module: 'regulatory',
    date: '2024-12-08',
    region: 'jp',
    status: 'final',
    content: 'During the pre-submission meeting with PMDA, several key points were discussed...',
    tags: ['pmda', 'japan', 'meeting', 'pre-submission'],
    relevance: 0.73,
  },
  {
    id: 'doc-009',
    title: 'Global Clinical Development Strategy',
    type: 'protocol',
    module: 'csr',
    date: '2024-10-30',
    region: 'global',
    status: 'approved',
    content: 'The global clinical development strategy outlines our approach across regions...',
    tags: ['global', 'strategy', 'clinical', 'development'],
    relevance: 0.71,
  },
  {
    id: 'doc-010',
    title: 'Standard Operating Procedure - Document Control',
    type: 'sop',
    module: 'quality',
    date: '2024-09-15',
    region: 'global',
    status: 'effective',
    content:
      'This SOP defines the procedures for document control in compliance with 21 CFR Part 11...',
    tags: ['sop', 'document', 'control', 'compliance', '21 cfr part 11'],
    relevance: 0.68,
  },
];

/**
 * Search documents using NLP and embeddings
 *
 * In a real implementation, this would:
 * 1. Convert search query to embeddings via OpenAI
 * 2. Search for similar embeddings in a vector database
 * 3. Apply filters and return results
 *
 * For this demo, we're using mock data with simulated relevance
 */
export async function semanticSearch(query, filters = {}, searchMode = 'semantic') {
  console.log('Performing semantic search with:', { query, filters, searchMode });

  // In production, this would be replaced with actual OpenAI API calls
  // and vector database queries

  return new Promise(resolve => {
    setTimeout(() => {
      let results = [...mockDocuments];

      // Apply filters
      if (filters.modules && filters.modules.length > 0) {
        results = results.filter(doc => filters.modules.includes(doc.module));
      }

      if (filters.docTypes && filters.docTypes.length > 0) {
        results = results.filter(doc => filters.docTypes.includes(doc.type));
      }

      if (filters.regions && filters.regions.length > 0) {
        results = results.filter(doc => filters.regions.includes(doc.region));
      }

      // For keyword search, only match exact keywords (simplified version)
      if (searchMode === 'keyword') {
        const keywords = query.toLowerCase().split(' ');
        results = results.filter(doc => {
          const docText = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();
          return keywords.some(keyword => docText.includes(keyword));
        });
      } else {
        // For semantic search, we would use embeddings in production
        // Here we're just simulating relevance based on mock data
        // This is just for demonstration

        // Adjust relevance based on query
        results = results.map(doc => {
          // Check if query terms appear in document (simplified simulation)
          const queryTerms = query.toLowerCase().split(' ');
          const docText = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();

          let matchCount = 0;
          queryTerms.forEach(term => {
            if (docText.includes(term)) matchCount++;
          });

          // Adjust relevance based on term matches
          const adjustedRelevance = doc.relevance * (1 + (matchCount / queryTerms.length) * 0.2);

          return {
            ...doc,
            relevance: Math.min(adjustedRelevance, 0.99),
          };
        });
      }

      // Sort by relevance
      results.sort((a, b) => b.relevance - a.relevance);

      // Generate AI summary of results (in production, this would use OpenAI)
      const summary = generateSearchSummary(query, results);

      resolve({
        results,
        summary,
        query,
        totalResults: results.length,
        searchMode,
      });
    }, 1000); // Simulate API delay
  });
}

/**
 * Generate a natural language summary of search results
 *
 * In production, this would use OpenAI to generate a coherent summary
 * of the search results, highlighting key findings and patterns
 */
function generateSearchSummary(query, results) {
  if (results.length === 0) {
    return `No documents found matching "${query}".`;
  }

  // Very simple summary generation for demo purposes
  // In production, this would use OpenAI's GPT-4 API

  const count = results.length;
  const moduleTypeCounts = {};

  results.forEach(doc => {
    const key = doc.module;
    moduleTypeCounts[key] = (moduleTypeCounts[key] || 0) + 1;
  });

  let moduleBreakdown = Object.entries(moduleTypeCounts)
    .map(([module, count]) => `${count} from ${module.toUpperCase()}`)
    .join(', ');

  // Get top 2 documents for summary
  const topDocs = results
    .slice(0, 2)
    .map(doc => doc.title)
    .join('" and "');

  return `Found ${count} documents related to "${query}". Documents include ${moduleBreakdown}. Top results include "${topDocs}". Documents span from ${results[results.length - 1].date} to ${results[0].date}.`;
}

/**
 * Get searchable fields for autocomplete
 */
export function getSearchSuggestions() {
  return [
    { id: 1, text: 'Safety concerns in Phase II trials' },
    { id: 2, text: 'Critical deviations in EU submissions Q1' },
    { id: 3, text: 'Protocol amendments with timeline impacts' },
    { id: 4, text: 'Quality issues requiring CAPA' },
    { id: 5, text: 'Patient recruitment challenges across sites' },
    { id: 6, text: 'FDA inspection preparation' },
    { id: 7, text: 'Regulatory submission deadlines 2025' },
    { id: 8, text: 'CSR template compliance EU region' },
    { id: 9, text: 'IND amendment tracking' },
    { id: 10, text: '21 CFR Part 11 validation documentation' },
  ];
}

export default {
  semanticSearch,
  getSearchSuggestions,
};
