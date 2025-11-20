/**
 * Literature Feature Connection Service
 *
 * This service handles the connections between literature papers and device features,
 * providing methods to save, analyze, and retrieve these connections for the 510k module.
 */

/**
 * Save connections between device features and literature papers
 * @param {Object} data - The connection data
 * @param {string} data.documentId - The 510k document ID
 * @param {Object} data.featureEvidence - Map of feature IDs to arrays of paper IDs
 * @param {string} [data.organizationId] - Optional organization ID
 * @returns {Promise<Object>} The save result
 */
export const saveLiteratureFeatureConnections = async data => {
  try {
    const { documentId, featureEvidence, organizationId } = data;

    if (!documentId || !featureEvidence) {
      throw new Error('Missing required parameters for literature evidence connections');
    }

    const response = await fetch('/api/510k/literature/evidence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentId, featureEvidence, organizationId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save literature feature connections');
    }

    return await response.json();
  } catch (error) {
    console.error('Literature feature connection error:', error);
    throw error;
  }
};

/**
 * Analyze relevance between literature papers and device features
 * @param {Object} data - The analysis data
 * @param {Array} data.features - Array of device features
 * @param {Array} data.literature - Array of literature papers
 * @returns {Promise<Object>} The analysis result mapping papers to relevant features
 */
export const analyzeLiteratureFeatureRelevance = async data => {
  try {
    const { features, literature } = data;

    if (!features || !literature || !Array.isArray(features) || !Array.isArray(literature)) {
      throw new Error('Missing required parameters for literature relevance analysis');
    }

    const response = await fetch('/api/510k/literature/analyze-relevance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ features, literature }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to analyze literature relevance');
    }

    return await response.json();
  } catch (error) {
    console.error('Literature relevance analysis error:', error);
    throw error;
  }
};

// Export the service object
const LiteratureFeatureService = {
  saveLiteratureFeatureConnections,
  analyzeLiteratureFeatureRelevance,
};

export default LiteratureFeatureService;
