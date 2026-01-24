// server/routes/analytical-fixed.js - Fixed Analytical Methods Management API
import express from 'express';

const router = express.Router();

// List all analytical methods
router.get('/methods', async (req, res) => {
  try {
    const methods = [
      {
        id: 1,
        code: 'AM-001',
        title: 'HPLC-UV • API Assay',
        technique: 'HPLC-UV',
        matrix: 'Drug Product',
        analyte: 'Active Pharmaceutical Ingredient',
        range: '0.05–150 μg/mL',
        precisionTarget: '≤2.0% RSD',
        accuracyTarget: '98–102%',
        status: 'IN_VALIDATION',
        owner: 'Dr. Sarah Chen',
        due: '2025-09-15',
        readiness: 85,
      },
      {
        id: 2,
        code: 'AM-002',
        title: 'UPLC-MS/MS • Impurity Profile',
        technique: 'UPLC-MS/MS',
        matrix: 'Drug Substance',
        analyte: 'Related Substances',
        range: '0.01–1.0% w/w',
        precisionTarget: '≤3.0% RSD',
        accuracyTarget: '95–105%',
        status: 'UNDER_DEV',
        owner: 'Dr. Michael Rodriguez',
        due: '2025-10-01',
        readiness: 65,
      },
      {
        id: 3,
        code: 'AM-003',
        title: 'GC-FID • Residual Solvents',
        technique: 'GC-FID',
        matrix: 'Drug Product',
        analyte: 'Volatile Organic Compounds',
        range: '10–1000 ppm',
        precisionTarget: '≤5.0% RSD',
        accuracyTarget: '90–110%',
        status: 'APPROVED',
        owner: 'Dr. Emily Johnson',
        readiness: 100,
      },
      {
        id: 4,
        code: 'AM-004',
        title: 'ICP-MS • Heavy Metals',
        technique: 'ICP-MS',
        matrix: 'Drug Substance',
        analyte: 'Elemental Impurities',
        range: '0.1–100 μg/g',
        precisionTarget: '≤10% RSD',
        accuracyTarget: '85–115%',
        status: 'UNDER_DEV',
        owner: 'Dr. James Park',
        due: '2025-08-30',
        readiness: 40,
      },
    ];

    res.json(methods);
  } catch (error) {
    console.error('Error fetching analytical methods:', error);
    res.status(500).json({ error: 'Failed to fetch analytical methods' });
  }
});

// Get validation gaps for all methods
router.get('/methods/gaps', async (req, res) => {
  try {
    const gaps = {
      1: [
        {
          id: 1,
          severity: 'ERROR',
          title: 'Linearity validation incomplete',
          why: 'Correlation coefficient r ≥ 0.99 required per ICH Q2(R1)',
          section: 'Analytical Validation',
          ruleId: 'Q2_LINEARITY',
        },
      ],
      2: [
        {
          id: 2,
          severity: 'ERROR',
          title: 'Lifecycle plan missing',
          why: 'Analytical lifecycle management plan required per ICH Q14',
          section: 'Documentation',
          ruleId: 'Q14_LIFECYCLE',
        },
      ],
      4: [
        {
          id: 3,
          severity: 'ERROR',
          title: 'Specificity not demonstrated',
          why: 'Matrix interference studies incomplete',
          section: 'Method Development',
          ruleId: 'Q2_SPECIFICITY',
        },
      ],
    };

    res.json(gaps);
  } catch (error) {
    console.error('Error fetching method gaps:', error);
    res.status(500).json({ error: 'Failed to fetch method gaps' });
  }
});

// Get system suitability trending data
router.get('/methods/runs', async (req, res) => {
  try {
    const runs = {
      1: [
        { date: '2025-08-15', sst: 2850.5 },
        { date: '2025-08-16', sst: 2920.3 },
        { date: '2025-08-17', sst: 2780.1 },
        { date: '2025-08-18', sst: 2895.7 },
        { date: '2025-08-19', sst: 2950.2 },
        { date: '2025-08-20', sst: 2830.8 },
        { date: '2025-08-21', sst: 2910.4 },
      ],
      2: [
        { date: '2025-08-15', sst: 1950.2 },
        { date: '2025-08-17', sst: 1890.5 },
        { date: '2025-08-19', sst: 1920.8 },
        { date: '2025-08-21', sst: 1980.1 },
      ],
      3: [
        { date: '2025-08-14', sst: 3200.5 },
        { date: '2025-08-16', sst: 3180.2 },
        { date: '2025-08-18', sst: 3220.8 },
        { date: '2025-08-20', sst: 3195.4 },
      ],
    };

    res.json(runs);
  } catch (error) {
    console.error('Error fetching method runs:', error);
    res.status(500).json({ error: 'Failed to fetch method runs' });
  }
});

// Assign method to current user
router.post('/methods/:id/assign', async (req, res) => {
  try {
    const userId = req.header('x-user-name') || 'Current User';
    console.log(`Assigning method ${req.params.id} to ${userId}`);

    res.json({ owner: userId });
  } catch (error) {
    console.error('Error assigning method:', error);
    res.status(500).json({ error: 'Failed to assign method' });
  }
});

// Update method status
router.patch('/methods/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['UNDER_DEV', 'IN_VALIDATION', 'APPROVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    console.log(`Updating method ${req.params.id} status to ${status}`);

    res.json({ status });
  } catch (error) {
    console.error('Error updating method status:', error);
    res.status(500).json({ error: 'Failed to update method status' });
  }
});

export default router;
