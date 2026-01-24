/**
 * Quality by Design (QbD) Routes - Server-side API routes for QbD simulations
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// In-memory storage for QbD simulations
let qbdSimulations = [
  {
    id: 'qbd-1',
    name: 'Tablet Hardness Simulation',
    description: 'Monte Carlo simulation of tablet hardness based on process parameters',
    process: 'Tablet Compression',
    parameters: [
      {
        name: 'Compression Force',
        mean: 15,
        stdDev: 0.5,
        unit: 'kN',
        distribution: 'normal',
        min: 12,
        max: 18,
      },
      {
        name: 'Tablet Weight',
        mean: 100,
        stdDev: 2,
        unit: 'mg',
        distribution: 'normal',
        min: 95,
        max: 105,
      },
    ],
    response: {
      name: 'Tablet Hardness',
      unit: 'N',
      model: 'linear',
      coefficients: {
        intercept: 30,
        'Compression Force': 3.5,
        'Tablet Weight': 0.15,
        'Compression Force*Tablet Weight': 0.05,
      },
      specification: {
        lower: 70,
        upper: 85,
        target: 75,
      },
    },
    settings: {
      numIterations: 10000,
      confidenceInterval: 0.95,
    },
    results: null, // Will be generated on request
    createdAt: '2025-04-20T09:15:00Z',
    createdBy: 'John Doe',
    status: 'Ready',
  },
  {
    id: 'qbd-2',
    name: 'Dissolution Profile Simulation',
    description:
      'Monte Carlo simulation of dissolution profile based on formulation and process parameters',
    process: 'Film Coating',
    parameters: [
      {
        name: 'Coating Thickness',
        mean: 50,
        stdDev: 5,
        unit: 'μm',
        distribution: 'normal',
        min: 40,
        max: 60,
      },
      {
        name: 'Curing Temperature',
        mean: 60,
        stdDev: 2,
        unit: '°C',
        distribution: 'normal',
        min: 55,
        max: 65,
      },
      {
        name: 'Polymer Viscosity',
        mean: 100,
        stdDev: 10,
        unit: 'cP',
        distribution: 'lognormal',
        min: 80,
        max: 120,
      },
    ],
    response: {
      name: 'Dissolution at 30 min',
      unit: '%',
      model: 'quadratic',
      coefficients: {
        intercept: 70,
        'Coating Thickness': -0.6,
        'Curing Temperature': 0.2,
        'Polymer Viscosity': -0.1,
        'Coating Thickness^2': -0.01,
        'Curing Temperature^2': -0.005,
        'Polymer Viscosity^2': -0.002,
        'Coating Thickness*Curing Temperature': 0.02,
        'Coating Thickness*Polymer Viscosity': -0.01,
        'Curing Temperature*Polymer Viscosity': 0.01,
      },
      specification: {
        lower: 50,
        upper: 70,
        target: 60,
      },
    },
    settings: {
      numIterations: 10000,
      confidenceInterval: 0.95,
    },
    results: null, // Will be generated on request
    createdAt: '2025-04-18T14:30:00Z',
    createdBy: 'Jane Smith',
    status: 'Ready',
  },
];

/**
 * Generate random samples from a distribution
 *
 * @param {Object} parameter - Parameter with distribution info
 * @param {number} numSamples - Number of samples to generate
 * @returns {Array} - Array of random samples
 */
function generateSamples(parameter, numSamples) {
  const samples = [];

  for (let i = 0; i < numSamples; i++) {
    let sample;

    switch (parameter.distribution.toLowerCase()) {
      case 'normal':
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        sample = parameter.mean + z * parameter.stdDev;
        break;

      case 'lognormal':
        // First generate a normal, then exponentiate
        const u1ln = Math.random();
        const u2ln = Math.random();
        const zln = Math.sqrt(-2 * Math.log(u1ln)) * Math.cos(2 * Math.PI * u2ln);
        sample = Math.exp(Math.log(parameter.mean) + (zln * parameter.stdDev) / parameter.mean);
        break;

      case 'uniform':
        sample = parameter.min + Math.random() * (parameter.max - parameter.min);
        break;

      default:
        // Default to normal
        const u1def = Math.random();
        const u2def = Math.random();
        const zdef = Math.sqrt(-2 * Math.log(u1def)) * Math.cos(2 * Math.PI * u2def);
        sample = parameter.mean + zdef * parameter.stdDev;
    }

    // Truncate to min/max if defined
    if (parameter.min !== undefined && sample < parameter.min) {
      sample = parameter.min;
    }
    if (parameter.max !== undefined && sample > parameter.max) {
      sample = parameter.max;
    }

    samples.push(sample);
  }

  return samples;
}

/**
 * Evaluate a model with given parameters
 *
 * @param {Object} model - Model definition
 * @param {Object} paramValues - Parameter values
 * @returns {number} - Model output
 */
function evaluateModel(model, paramValues) {
  let result = model.coefficients.intercept || 0;

  // Linear and interaction terms
  Object.entries(model.coefficients).forEach(([term, coef]) => {
    if (term === 'intercept') return;

    if (term.includes('*')) {
      // Interaction term
      const factors = term.split('*');
      let product = 1;
      factors.forEach(f => {
        product *= paramValues[f] || 0;
      });
      result += coef * product;
    } else if (term.includes('^')) {
      // Quadratic term
      const [factor, power] = term.split('^');
      result += coef * Math.pow(paramValues[factor] || 0, parseInt(power));
    } else {
      // Linear term
      result += coef * (paramValues[term] || 0);
    }
  });

  return result;
}

/**
 * Run Monte Carlo simulation
 *
 * @param {Object} simulation - Simulation definition
 * @returns {Object} - Simulation results
 */
function runMonteCarloSimulation(simulation) {
  const numIterations = simulation.settings.numIterations || 10000;
  const parameters = simulation.parameters;
  const responseModel = simulation.response;

  // Generate samples for each parameter
  const parameterSamples = {};
  parameters.forEach(param => {
    parameterSamples[param.name] = generateSamples(param, numIterations);
  });

  // Evaluate model for each set of parameter values
  const responseValues = [];
  for (let i = 0; i < numIterations; i++) {
    const paramValues = {};
    parameters.forEach(param => {
      paramValues[param.name] = parameterSamples[param.name][i];
    });

    const responseValue = evaluateModel(responseModel, paramValues);
    responseValues.push(responseValue);
  }

  // Calculate statistics
  responseValues.sort((a, b) => a - b);
  const mean = responseValues.reduce((a, b) => a + b, 0) / numIterations;
  const variance = responseValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numIterations;
  const stdDev = Math.sqrt(variance);

  // Calculate confidence interval
  const confidenceLevel = simulation.settings.confidenceInterval || 0.95;
  const alpha = 1 - confidenceLevel;
  const lowerIndex = Math.floor(numIterations * (alpha / 2));
  const upperIndex = Math.floor(numIterations * (1 - alpha / 2));
  const confidenceInterval = [responseValues[lowerIndex], responseValues[upperIndex]];

  // Calculate capability indices
  const { lower, upper, target } = responseModel.specification;
  const cpk = Math.min((mean - lower) / (3 * stdDev), (upper - mean) / (3 * stdDev));

  // Calculate probability of meeting specification
  const belowLower = responseValues.filter(v => v < lower).length / numIterations;
  const aboveUpper = responseValues.filter(v => v > upper).length / numIterations;
  const withinSpec = 1 - belowLower - aboveUpper;

  // Generate histogram data
  const numBins = 20;
  const min = Math.min(...responseValues);
  const max = Math.max(...responseValues);
  const binWidth = (max - min) / numBins;

  const histogram = Array(numBins).fill(0);
  responseValues.forEach(value => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
    histogram[binIndex]++;
  });

  const histogramData = histogram.map((count, i) => ({
    bin: min + i * binWidth,
    count,
    frequency: count / numIterations,
  }));

  return {
    statistics: {
      mean,
      median: responseValues[Math.floor(numIterations / 2)],
      stdDev,
      min: responseValues[0],
      max: responseValues[numIterations - 1],
      confidenceInterval,
    },
    capability: {
      cpk,
      withinSpec,
      belowLower,
      aboveUpper,
    },
    histogram: histogramData,
    sampledParameters: parameters.map(param => ({
      name: param.name,
      mean: parameterSamples[param.name].reduce((a, b) => a + b, 0) / numIterations,
      stdDev: Math.sqrt(
        parameterSamples[param.name].reduce(
          (a, b) =>
            a +
            Math.pow(
              b - parameterSamples[param.name].reduce((c, d) => c + d, 0) / numIterations,
              2
            ),
          0
        ) / numIterations
      ),
      min: Math.min(...parameterSamples[param.name]),
      max: Math.max(...parameterSamples[param.name]),
    })),
  };
}

/**
 * Get all QbD simulations
 *
 * @route GET /api/qbd/simulations
 * @param {string} req.query.process - Filter by process (optional)
 * @param {string} req.query.status - Filter by status (optional)
 * @param {string} req.query.search - Search keyword (optional)
 * @returns {Object} - List of QbD simulations
 */
router.get('/simulations', (req, res) => {
  let filtered = [...qbdSimulations];

  // Apply filters if provided
  if (req.query.process) {
    filtered = filtered.filter(s => s.process === req.query.process);
  }

  if (req.query.status) {
    filtered = filtered.filter(s => s.status === req.query.status);
  }

  if (req.query.search) {
    const search = req.query.search.toLowerCase();
    filtered = filtered.filter(
      s => s.name.toLowerCase().includes(search) || s.description.toLowerCase().includes(search)
    );
  }

  // Don't include full results in the response
  const response = filtered.map(s => ({
    ...s,
    results: null,
  }));

  res.json({
    success: true,
    simulations: response,
  });
});

/**
 * Get a QbD simulation by ID
 *
 * @route GET /api/qbd/simulations/:simulationId
 * @param {string} req.params.simulationId - QbD simulation ID
 * @returns {Object} - QbD simulation data
 */
router.get('/simulations/:simulationId', (req, res) => {
  const simulation = qbdSimulations.find(s => s.id === req.params.simulationId);

  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: 'QbD simulation not found',
    });
  }

  // Generate results if they don't exist
  if (!simulation.results) {
    simulation.results = runMonteCarloSimulation(simulation);
  }

  res.json({
    success: true,
    simulation,
  });
});

/**
 * Create a new QbD simulation
 *
 * @route POST /api/qbd/simulations
 * @param {Object} req.body - QbD simulation data
 * @returns {Object} - Created QbD simulation
 */
router.post('/simulations', (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name || !req.body.parameters || !req.body.response) {
      return res.status(400).json({
        success: false,
        error: 'Name, parameters, and response are required',
      });
    }

    const newSimulation = {
      id: `qbd-${uuidv4()}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      status: req.body.status || 'Ready',
      results: null, // Will be generated on request
    };

    qbdSimulations.push(newSimulation);

    // Return without the results
    const response = {
      ...newSimulation,
      results: null,
    };

    res.status(201).json({
      success: true,
      simulation: response,
    });
  } catch (error) {
    console.error('Error creating QbD simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create QbD simulation',
    });
  }
});

/**
 * Run a Monte Carlo simulation
 *
 * @route POST /api/qbd/simulate
 * @param {Object} req.body - Simulation parameters
 * @returns {Object} - Simulation results
 */
router.post('/simulate', (req, res) => {
  try {
    // Validate required fields
    if (!req.body.parameters || !req.body.response) {
      return res.status(400).json({
        success: false,
        error: 'Parameters and response model are required',
      });
    }

    // Create a simulation object
    const simulation = {
      parameters: req.body.parameters,
      response: req.body.response,
      settings: req.body.settings || {
        numIterations: 10000,
        confidenceInterval: 0.95,
      },
    };

    // Run the simulation
    const results = runMonteCarloSimulation(simulation);

    res.json({
      success: true,
      results,
      inputSummary: {
        numParameters: simulation.parameters.length,
        responseVariable: simulation.response.name,
        numIterations: simulation.settings.numIterations,
        confidenceLevel: simulation.settings.confidenceInterval,
      },
    });
  } catch (error) {
    console.error('Error running Monte Carlo simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run Monte Carlo simulation',
    });
  }
});

/**
 * Update a QbD simulation
 *
 * @route PUT /api/qbd/simulations/:simulationId
 * @param {string} req.params.simulationId - QbD simulation ID
 * @param {Object} req.body - Updated QbD simulation data
 * @returns {Object} - Updated QbD simulation
 */
router.put('/simulations/:simulationId', (req, res) => {
  try {
    const index = qbdSimulations.findIndex(s => s.id === req.params.simulationId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'QbD simulation not found',
      });
    }

    const updatedSimulation = {
      ...qbdSimulations[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    // If parameters or response model changed, reset the results
    if (
      (req.body.parameters &&
        JSON.stringify(req.body.parameters) !== JSON.stringify(qbdSimulations[index].parameters)) ||
      (req.body.response &&
        JSON.stringify(req.body.response) !== JSON.stringify(qbdSimulations[index].response)) ||
      (req.body.settings &&
        JSON.stringify(req.body.settings) !== JSON.stringify(qbdSimulations[index].settings))
    ) {
      updatedSimulation.results = null;
    }

    qbdSimulations[index] = updatedSimulation;

    // Return without the results
    const response = {
      ...updatedSimulation,
      results: null,
    };

    res.json({
      success: true,
      simulation: response,
    });
  } catch (error) {
    console.error('Error updating QbD simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update QbD simulation',
    });
  }
});

/**
 * Delete a QbD simulation
 *
 * @route DELETE /api/qbd/simulations/:simulationId
 * @param {string} req.params.simulationId - QbD simulation ID
 * @returns {Object} - Success message
 */
router.delete('/simulations/:simulationId', (req, res) => {
  try {
    const initialLength = qbdSimulations.length;
    qbdSimulations = qbdSimulations.filter(s => s.id !== req.params.simulationId);

    if (qbdSimulations.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'QbD simulation not found',
      });
    }

    res.json({
      success: true,
      message: 'QbD simulation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting QbD simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete QbD simulation',
    });
  }
});

export default router;
