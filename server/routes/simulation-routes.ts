import express from 'express';
import { MonteCarloService } from '../services/monte-carlo-service';

const router = express.Router();
const monteCarloService = new MonteCarloService();

/**
 * Run a Monte Carlo simulation
 */
router.post('/monte-carlo', express.json(), async (req, res) => {
  try {
    const params = req.body;

    // Validate required parameters
    if (
      !params.design_type ||
      !params.test_type ||
      !params.endpoint_type ||
      !params.alpha ||
      !params.effect_size ||
      !params.sample_size
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters for simulation',
      });
    }

    const result = await monteCarloService.runSimulation(params);

    res.json(result);
  } catch (error: any) {
    console.error('Error running Monte Carlo simulation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run Monte Carlo simulation',
    });
  }
});

/**
 * Get available simulation methods
 */
router.get('/methods', async (req, res) => {
  try {
    const methods = monteCarloService.getAvailableMethods();
    res.json(methods);
  } catch (error: any) {
    console.error('Error fetching simulation methods:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch simulation methods',
    });
  }
});

/**
 * Generate a power curve for a range of sample sizes
 */
router.post('/power-curve', express.json(), async (req, res) => {
  try {
    const { params, minN, maxN, points } = req.body;

    if (!params || !minN || !maxN) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters for power curve',
      });
    }

    const powerCurve = await monteCarloService.generatePowerCurve(params, minN, maxN, points || 10);

    res.json({
      success: true,
      powerCurve,
    });
  } catch (error: any) {
    console.error('Error generating power curve:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate power curve',
    });
  }
});

/**
 * Run a sample size calculation to achieve target power
 */
router.post('/sample-size', express.json(), async (req, res) => {
  try {
    const { params, targetPower, maxN } = req.body;

    if (!params || !targetPower) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters for sample size calculation',
      });
    }

    const result = await monteCarloService.calculateSampleSize(params, targetPower, maxN || 1000);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error calculating sample size:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate sample size',
    });
  }
});

export default router;
