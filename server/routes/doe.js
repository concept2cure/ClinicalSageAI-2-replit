/**
 * Design of Experiments (DOE) Routes - Server-side API routes for DOE generation
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// In-memory storage for DOE designs
let doeDesigns = [
  {
    id: 'doe-1',
    name: 'Granulation Process Optimization',
    description: 'Factorial design to optimize wet granulation process parameters',
    type: 'Full Factorial',
    factors: [
      {
        name: 'Mixing Speed',
        code: 'A',
        unit: 'rpm',
        low: 250,
        high: 350,
      },
      {
        name: 'Granulation End Point',
        code: 'B',
        unit: 'W',
        low: 1600,
        high: 1900,
      },
      {
        name: 'Binder Addition Rate',
        code: 'C',
        unit: 'g/min',
        low: 40,
        high: 60,
      },
    ],
    responses: [
      {
        name: 'Granule Size',
        unit: 'μm',
        target: 'Minimize',
      },
      {
        name: 'Bulk Density',
        unit: 'g/cm³',
        target: 'Maximize',
      },
    ],
    design: null, // Will be generated on request
    createdAt: '2025-04-15T10:30:00Z',
    createdBy: 'John Doe',
    status: 'Planned',
  },
  {
    id: 'doe-2',
    name: 'Tablet Compression Study',
    description:
      'Factorial design to study tablet compression parameters and their effects on tablet properties',
    type: 'Full Factorial',
    factors: [
      {
        name: 'Compression Force',
        code: 'A',
        unit: 'kN',
        low: 12,
        high: 18,
      },
      {
        name: 'Tablet Weight',
        code: 'B',
        unit: 'mg',
        low: 95,
        high: 105,
      },
    ],
    responses: [
      {
        name: 'Hardness',
        unit: 'N',
        target: 'Target (75-85)',
      },
      {
        name: 'Disintegration Time',
        unit: 'min',
        target: 'Minimize',
      },
      {
        name: 'Friability',
        unit: '%',
        target: 'Minimize',
      },
    ],
    design: null, // Will be generated on request
    createdAt: '2025-04-10T14:45:00Z',
    createdBy: 'Jane Smith',
    status: 'Planned',
  },
];

/**
 * Generate a full factorial design matrix
 *
 * @param {Array} factors - List of factors with low and high levels
 * @returns {Array} - Full factorial design matrix
 */
function generateFullFactorial(factors) {
  const numFactors = factors.length;
  const numRuns = Math.pow(2, numFactors);
  const design = [];

  // Generate all possible combinations
  for (let run = 0; run < numRuns; run++) {
    const runSettings = {};
    let runConditions = {};

    for (let i = 0; i < numFactors; i++) {
      // Convert run number to binary and use it to determine level (-1 or +1)
      const level = run & (1 << i) ? 1 : -1;
      runSettings[factors[i].code] = level;

      // Calculate actual value from coded level
      const actualValue = level === 1 ? factors[i].high : factors[i].low;

      runConditions[factors[i].name] = {
        coded: level,
        actual: actualValue,
        unit: factors[i].unit,
      };
    }

    design.push({
      run: run + 1,
      settings: runSettings,
      conditions: runConditions,
      responses: {},
      notes: '',
    });
  }

  // Add center points if needed
  // This is a simplified version; real implementation would add proper center points

  return design;
}

/**
 * Get all DOE designs
 *
 * @route GET /api/doe/designs
 * @param {string} req.query.status - Filter by status (optional)
 * @param {string} req.query.search - Search keyword (optional)
 * @returns {Object} - List of DOE designs
 */
router.get('/designs', (req, res) => {
  let filtered = [...doeDesigns];

  // Apply filters if provided
  if (req.query.status) {
    filtered = filtered.filter(d => d.status === req.query.status);
  }

  if (req.query.search) {
    const search = req.query.search.toLowerCase();
    filtered = filtered.filter(
      d => d.name.toLowerCase().includes(search) || d.description.toLowerCase().includes(search)
    );
  }

  // Don't include the full design matrix in the response
  const response = filtered.map(d => ({
    ...d,
    design: null,
  }));

  res.json({
    success: true,
    designs: response,
  });
});

/**
 * Get a DOE design by ID
 *
 * @route GET /api/doe/designs/:designId
 * @param {string} req.params.designId - DOE design ID
 * @returns {Object} - DOE design data
 */
router.get('/designs/:designId', (req, res) => {
  const design = doeDesigns.find(d => d.id === req.params.designId);

  if (!design) {
    return res.status(404).json({
      success: false,
      error: 'DOE design not found',
    });
  }

  // Generate the design matrix if it doesn't exist
  if (!design.design) {
    design.design = generateFullFactorial(design.factors);
  }

  res.json({
    success: true,
    design,
  });
});

/**
 * Create a new DOE design
 *
 * @route POST /api/doe/designs
 * @param {Object} req.body - DOE design data
 * @returns {Object} - Created DOE design
 */
router.post('/designs', (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name || !req.body.factors || req.body.factors.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name and at least two factors are required',
      });
    }

    const newDesign = {
      id: `doe-${uuidv4()}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      status: req.body.status || 'Planned',
      design: null, // Will be generated on request
    };

    doeDesigns.push(newDesign);

    // Return without the design matrix
    const response = {
      ...newDesign,
      design: null,
    };

    res.status(201).json({
      success: true,
      design: response,
    });
  } catch (error) {
    console.error('Error creating DOE design:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create DOE design',
    });
  }
});

/**
 * Generate a factorial design
 *
 * @route POST /api/doe/factorial
 * @param {Object} req.body - Factorial design parameters
 * @param {Array} req.body.factors - List of factors with low and high levels
 * @param {string} req.body.type - Design type (Full Factorial, Fractional Factorial, etc.)
 * @returns {Object} - Generated design matrix
 */
router.post('/factorial', (req, res) => {
  try {
    const { factors, type } = req.body;

    // Validate required fields
    if (!factors || factors.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least two factors are required',
      });
    }

    // Validate factor structure
    const invalidFactors = factors.filter(
      f => !f.name || f.low === undefined || f.high === undefined
    );
    if (invalidFactors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All factors must have name, low, and high values',
      });
    }

    // Generate the design matrix
    let design;
    if (type === 'Fractional Factorial') {
      // Implement fractional factorial logic here
      // This is a placeholder for now
      design = generateFullFactorial(factors);
    } else {
      // Default to full factorial
      design = generateFullFactorial(factors);
    }

    res.json({
      success: true,
      design,
      stats: {
        numFactors: factors.length,
        numRuns: design.length,
        designType: type || 'Full Factorial',
      },
    });
  } catch (error) {
    console.error('Error generating factorial design:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate factorial design',
    });
  }
});

/**
 * Update a DOE design
 *
 * @route PUT /api/doe/designs/:designId
 * @param {string} req.params.designId - DOE design ID
 * @param {Object} req.body - Updated DOE design data
 * @returns {Object} - Updated DOE design
 */
router.put('/designs/:designId', (req, res) => {
  try {
    const index = doeDesigns.findIndex(d => d.id === req.params.designId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'DOE design not found',
      });
    }

    // Keep the design matrix if it exists
    const existingDesign = doeDesigns[index].design;

    const updatedDesign = {
      ...doeDesigns[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    // If factors changed, reset the design matrix
    if (
      req.body.factors &&
      JSON.stringify(req.body.factors) !== JSON.stringify(doeDesigns[index].factors)
    ) {
      updatedDesign.design = null;
    } else {
      updatedDesign.design = existingDesign;
    }

    doeDesigns[index] = updatedDesign;

    // Return without the design matrix
    const response = {
      ...updatedDesign,
      design: null,
    };

    res.json({
      success: true,
      design: response,
    });
  } catch (error) {
    console.error('Error updating DOE design:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update DOE design',
    });
  }
});

/**
 * Update DOE run results
 *
 * @route PUT /api/doe/designs/:designId/runs/:runId
 * @param {string} req.params.designId - DOE design ID
 * @param {number} req.params.runId - Run ID
 * @param {Object} req.body - Run data including responses
 * @returns {Object} - Updated DOE design
 */
router.put('/designs/:designId/runs/:runId', (req, res) => {
  try {
    const designIndex = doeDesigns.findIndex(d => d.id === req.params.designId);

    if (designIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'DOE design not found',
      });
    }

    // Generate the design matrix if it doesn't exist
    if (!doeDesigns[designIndex].design) {
      doeDesigns[designIndex].design = generateFullFactorial(doeDesigns[designIndex].factors);
    }

    const runId = parseInt(req.params.runId);
    const runIndex = doeDesigns[designIndex].design.findIndex(r => r.run === runId);

    if (runIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Run not found',
      });
    }

    // Update run data
    doeDesigns[designIndex].design[runIndex] = {
      ...doeDesigns[designIndex].design[runIndex],
      ...req.body,
    };

    // If all runs have responses, update status to Completed
    const allRunsHaveResponses = doeDesigns[designIndex].design.every(
      run => Object.keys(run.responses).length === doeDesigns[designIndex].responses.length
    );

    if (allRunsHaveResponses) {
      doeDesigns[designIndex].status = 'Completed';
    } else if (doeDesigns[designIndex].status === 'Planned') {
      doeDesigns[designIndex].status = 'In Progress';
    }

    res.json({
      success: true,
      run: doeDesigns[designIndex].design[runIndex],
      designStatus: doeDesigns[designIndex].status,
    });
  } catch (error) {
    console.error('Error updating DOE run:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update DOE run',
    });
  }
});

/**
 * Delete a DOE design
 *
 * @route DELETE /api/doe/designs/:designId
 * @param {string} req.params.designId - DOE design ID
 * @returns {Object} - Success message
 */
router.delete('/designs/:designId', (req, res) => {
  try {
    const initialLength = doeDesigns.length;
    doeDesigns = doeDesigns.filter(d => d.id !== req.params.designId);

    if (doeDesigns.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'DOE design not found',
      });
    }

    res.json({
      success: true,
      message: 'DOE design deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting DOE design:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete DOE design',
    });
  }
});

export default router;
