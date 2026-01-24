/**
 * CSR API - Client-side API helper for CSR Deep Intelligence module
 */

// Base URL for API calls (empty string for relative paths)
const API_BASE_URL = '';

// --- Dashboard Metrics ---
export const fetchDashboardMetrics = async () => {
  try {
    console.log('Fetching dashboard metrics from REAL CSR files');
    const response = await fetch(`${API_BASE_URL}/api/csr-real-data/stats`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Transform the real stats data structure to match expected format
    if (data.success && data.data) {
      return {
        totalCsrs: data.data.overview.total_reports || 0,
        processedCsrs: data.data.overview.processed_reports || 0,
        uniqueStudies: data.data.overview.unique_indications || 0,
        recentReports: data.data.topIndications || [],
        phaseDistribution: data.data.phaseDistribution || [],
        source: data.source || 'processed_files',
      };
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    throw error;
  }
};

// --- Search Function ---
export const searchCsrs = async (query, options = {}) => {
  try {
    const { phase, therapeuticArea, yearFrom, yearTo, limit = 50 } = options;

    // Use REAL CSR data from processed files
    console.log('Using REAL CSR data from processed files');

    // Use real data search endpoint
    let url = `${API_BASE_URL}/api/csr-real-data/search?q=${encodeURIComponent(query)}&limit=${limit}`;

    if (phase) url += `&phase=${encodeURIComponent(phase)}`;
    if (therapeuticArea) url += `&indication=${encodeURIComponent(therapeuticArea)}`;

    console.log('Searching REAL CSRs:', query, 'from:', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ REAL CSR Search Results:', data);

    // Transform the results to ensure proper data structure for display
    const transformedResults = (data.data || []).map((result, index) => ({
      id: result.nctrialId || result.csr_id,
      title: result.title,
      therapeutic_area: result.indication,
      study_phase: result.phase,
      sponsor: result.sponsor,
      indication: result.indication,
      completion_year: result.completionDate ? new Date(result.completionDate).getFullYear() : null,
      relevance: 0.95,
      status: result.status,
      sample_size: null,
      primary_endpoint: null,
      drugName: result.drugName,
    }));

    return {
      results: transformedResults,
      total: data.total || transformedResults.length,
      filters: data.filters || {},
      query: data.query || query,
      success: true,
      source: 'processed_files',
    };
  } catch (error) {
    console.error('Error searching CSRs:', error);
    return { results: [], total: 0, filters: {}, query };
  }
};

// --- Fetch Single CSR Details ---
export const fetchCsrDetails = async id => {
  try {
    console.log(
      'Fetching CSR details for ID:',
      id,
      'from:',
      `${API_BASE_URL}/api/csr/report/${id}`
    );
    const response = await fetch(`${API_BASE_URL}/api/csr/report/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success ? data.report : null;
  } catch (error) {
    console.error(`Error fetching CSR details for ID ${id}:`, error);
    return null;
  }
};

// --- Get CSR Summary Insights ---
export const fetchCsrSummary = async query => {
  try {
    console.log(
      'Fetching CSR summary for query:',
      query,
      'from:',
      `${API_BASE_URL}/api/additional-csr/api/csrs/summary?query=${encodeURIComponent(query)}`
    );
    const response = await fetch(
      `${API_BASE_URL}/api/additional-csr/api/csrs/summary?query=${encodeURIComponent(query)}`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching CSR summary:', error);
    return { csrs: [], summary: null };
  }
};

// --- Upload CSR Document ---
export const uploadCsrDocument = async formData => {
  try {
    console.log('Uploading CSR document to:', `${API_BASE_URL}/api/csr-intelligence/ingest`);
    const response = await fetch(`${API_BASE_URL}/api/csr-intelligence/ingest`, {
      method: 'POST',
      body: formData, // formData should contain the file
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error uploading CSR document:', error);
    throw error; // Re-throw to let calling component handle
  }
};

/**
 * Generate a patient case narrative
 *
 * @param {Object} narrativeData Input data for narrative generation
 * @returns {Promise<Object>} Generated narrative
 */
export const generateNarrative = async narrativeData => {
  const response = await fetch('/api/csr/generate-narrative', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(narrativeData),
  });

  if (!response.ok) {
    throw new Error('Failed to generate narrative');
  }

  return response.json();
};

/**
 * Detect adverse event signals
 *
 * @param {Object} signalData Input data for signal detection
 * @returns {Promise<Object>} Detected signals
 */
export const detectSignals = async signalData => {
  const response = await fetch('/api/csr/detect-signals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signalData),
  });

  if (!response.ok) {
    throw new Error('Failed to detect signals');
  }

  return response.json();
};

/**
 * Analyze benefit-risk profile
 *
 * @param {Object} benefitRiskData Input data for benefit-risk analysis
 * @returns {Promise<Object>} Benefit-risk analysis results
 */
export const analyzeBenefitRisk = async benefitRiskData => {
  const response = await fetch('/api/csr/analyze-benefit-risk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(benefitRiskData),
  });

  if (!response.ok) {
    throw new Error('Failed to analyze benefit-risk profile');
  }

  return response.json();
};

/**
 * Generate AI insights for CSR report
 *
 * @param {Object} insightsData Input data for insight generation
 * @returns {Promise<Object>} Generated insights
 */
export const generateInsights = async insightsData => {
  const response = await fetch('/api/csr/insights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(insightsData),
  });

  if (!response.ok) {
    throw new Error('Failed to generate CSR insights');
  }

  return response.json();
};

/**
 * Perform advanced CSR search with complex filtering
 *
 * @param {Object} searchParams Advanced search parameters
 * @returns {Promise<Object>} Advanced search results with analytics
 */
export const advancedSearch = async searchParams => {
  const response = await fetch('/api/csr/advanced-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(searchParams),
  });

  if (!response.ok) {
    throw new Error('Failed to perform advanced CSR search');
  }

  return response.json();
};
