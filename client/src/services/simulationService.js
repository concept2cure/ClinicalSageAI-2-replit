/**
 * Simulation Service
 *
 * This service provides methods to interact with the backend simulation APIs
 * for statistical calculations in the Study Architect module.
 */

/**
 * Run a Monte Carlo simulation
 *
 * @param {Object} params - Simulation parameters
 * @param {string} params.design_type - Type of study design
 * @param {string} params.test_type - Type of statistical test
 * @param {string} params.endpoint_type - Type of endpoint
 * @param {number} params.alpha - Significance level
 * @param {number} params.effect_size - Expected effect size
 * @param {number} params.variability - Measure of variability
 * @param {number} params.margin - Non-inferiority margin (if applicable)
 * @param {number} params.sample_size - Total sample size
 * @param {number} params.n_simulations - Number of simulation iterations
 * @param {number} params.dropout_rate - Expected dropout rate
 * @returns {Promise<Object>} - Simulation results
 */
export const runMonteCarloSimulation = async params => {
  try {
    const response = await fetch('/api/simulation/monte-carlo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        design_type: params.design_type || 'parallel',
        test_type: params.test_type,
        endpoint_type: params.endpoint_type || 'continuous',
        alpha: params.alpha,
        power: 0.8, // Default power target
        effect_size: params.effect_size,
        variability: params.variability,
        margin: params.margin,
        dropout_rate: params.dropout_rate || 0.2,
        sample_size: params.sample_size,
        n_simulations: params.n_simulations || 1000,
        allocation_ratio: [1.0, 1.0],
        include_sensitivity: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to run simulation');
    }

    return await response.json();
  } catch (error) {
    console.error('Error running Monte Carlo simulation:', error);
    throw error;
  }
};

/**
 * Get available simulation methods and their parameters
 *
 * @returns {Promise<Object>} - Available methods and parameters
 */
export const getSimulationMethods = async () => {
  try {
    const response = await fetch('/api/simulation/methods');

    if (!response.ok) {
      throw new Error('Failed to fetch simulation methods');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching simulation methods:', error);
    throw error;
  }
};

/**
 * Run simulations for a range of sample sizes to create a power curve
 *
 * @param {Object} params - Base simulation parameters
 * @param {number} minN - Minimum sample size
 * @param {number} maxN - Maximum sample size
 * @param {number} points - Number of points to calculate
 * @returns {Promise<Array>} - Power curve data
 */
export const generatePowerCurve = async (params, minN, maxN, points = 10) => {
  try {
    const step = Math.max(10, Math.ceil((maxN - minN) / points));
    const powerCurvePromises = [];

    for (let n = minN; n <= maxN; n += step) {
      // Make a copy of params and update sample size
      const simParams = { ...params, sample_size: n };
      powerCurvePromises.push(runMonteCarloSimulation(simParams));
    }

    const results = await Promise.all(powerCurvePromises);

    // Extract power data from each simulation
    return results.map(result => ({
      sampleSize: result.parameters.sample_size,
      power: result.empirical_power,
    }));
  } catch (error) {
    console.error('Error generating power curve:', error);
    throw error;
  }
};

/**
 * Fetch vector database insights for similar trials
 *
 * @param {string} indication - Disease/condition indication
 * @param {string} phase - Trial phase
 * @param {string} endpoint - Primary endpoint
 * @returns {Promise<Object>} - Vector database insights
 */
export const fetchVectorInsights = async (indication, phase, endpoint) => {
  try {
    const response = await fetch('/api/vector/similar-trials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        indication,
        phase,
        endpoint,
      }),
    });

    if (!response.ok) {
      console.error('Failed to fetch vector insights:', response.status);
      return { similarTrials: [], aggregateInsights: {} };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching vector insights:', error);
    return { similarTrials: [], aggregateInsights: {} };
  }
};

/**
 * Generate OpenAI recommendations for study design
 *
 * @param {Object} studyParameters - Study parameters
 * @param {Object} statisticalParameters - Statistical parameters
 * @param {Object} vectorInsights - Vector database insights
 * @returns {Promise<Object>} - AI recommendations
 */
export const generateAIRecommendations = async (
  studyParameters,
  statisticalParameters,
  vectorInsights
) => {
  try {
    const response = await fetch('/api/openai/study-recommendations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studyParameters,
        statisticalParameters,
        vectorInsights,
      }),
    });

    if (!response.ok) {
      console.error('Failed to generate AI recommendations:', response.status);
      return { summary: '', strengths: [], improvements: [], regulatoryInsights: [] };
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    return { summary: '', strengths: [], improvements: [], regulatoryInsights: [] };
  }
};

