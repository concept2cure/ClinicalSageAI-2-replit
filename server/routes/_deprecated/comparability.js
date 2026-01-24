/**
 * Comparability Studies Routes - Server-side API routes for Method Transfer & Comparability
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// In-memory storage for comparability studies
let comparabilityStudies = [
  {
    id: 'comp-1',
    name: 'Method Transfer for HPLC Assay - Site A to Site B',
    description:
      'Method transfer of HPLC assay for Product X from Development Lab (Site A) to QC Lab (Site B)',
    methodId: 'method-1',
    methodName: 'HPLC Assay for API X',
    status: 'Complete',
    type: 'Method Transfer',
    sendingSite: {
      name: 'Development Lab (Site A)',
      address: '123 Research Drive, City, State',
      contact: 'John Doe',
      email: 'john.doe@example.com',
    },
    receivingSite: {
      name: 'QC Lab (Site B)',
      address: '456 Manufacturing Lane, City, State',
      contact: 'Jane Smith',
      email: 'jane.smith@example.com',
    },
    startDate: '2025-01-15',
    completionDate: '2025-02-15',
    protocol: {
      id: 'proto-1',
      version: '1.0',
      approvalDate: '2025-01-10',
      approvedBy: 'Robert Johnson',
      status: 'Approved',
    },
    transferParameters: [
      {
        parameter: 'Specificity',
        acceptanceCriteria: 'No interference at the retention time of the main peak',
        result: 'Pass',
        comment: 'No interference observed at both sites',
      },
      {
        parameter: 'Precision (Repeatability)',
        acceptanceCriteria: 'RSD ≤ 2.0%',
        result: 'Pass',
        comment: 'Site A: 0.8% RSD, Site B: 1.1% RSD',
      },
      {
        parameter: 'Accuracy',
        acceptanceCriteria: 'Recovery 98.0-102.0%',
        result: 'Pass',
        comment: 'Site A: 99.8%, Site B: 100.2%',
      },
      {
        parameter: 'Linearity',
        acceptanceCriteria: 'r² ≥ 0.995',
        result: 'Pass',
        comment: 'Site A: r² = 0.9998, Site B: r² = 0.9996',
      },
      {
        parameter: 'Equivalence Testing',
        acceptanceCriteria: '|Mean difference| ≤ 2.0%',
        result: 'Pass',
        comment: 'Mean difference: 0.5%',
      },
    ],
    data: {
      siteA: {
        standards: [
          { level: '80%', replicate1: 2145678, replicate2: 2156432 },
          { level: '100%', replicate1: 2678451, replicate2: 2698765 },
          { level: '120%', replicate1: 3245678, replicate2: 3278901 },
        ],
        samples: [
          { id: 'S1', replicate1: 2685432, replicate2: 2701234 },
          { id: 'S2', replicate1: 2690123, replicate2: 2687654 },
          { id: 'S3', replicate1: 2676543, replicate2: 2695432 },
        ],
        suitability: {
          resolution: 2.8,
          tailing: 1.2,
          theoreticalPlates: 12500,
        },
      },
      siteB: {
        standards: [
          { level: '80%', replicate1: 2187654, replicate2: 2176543 },
          { level: '100%', replicate1: 2701234, replicate2: 2714321 },
          { level: '120%', replicate1: 3298765, replicate2: 3289876 },
        ],
        samples: [
          { id: 'S1', replicate1: 2710123, replicate2: 2695432 },
          { id: 'S2', replicate1: 2700987, replicate2: 2718765 },
          { id: 'S3', replicate1: 2692345, replicate2: 2705678 },
        ],
        suitability: {
          resolution: 2.6,
          tailing: 1.3,
          theoreticalPlates: 12200,
        },
      },
      statisticalAnalysis: {
        tTest: {
          pValue: 0.58,
          significant: false,
          interpretation: 'No significant difference between sites',
        },
        equivalenceLimits: {
          lower: -2.0,
          upper: 2.0,
          meanDifference: 0.5,
          within: true,
        },
      },
    },
    conclusion: 'Method transfer was successful. All acceptance criteria were met.',
    createdBy: 'Robert Johnson',
    createdAt: '2025-01-05T09:30:00Z',
    updatedAt: '2025-02-20T14:15:00Z',
  },
  {
    id: 'comp-2',
    name: 'Product Comparability - Formulation Change',
    description: 'Comparability study for Product Y Cream - New excipient supplier',
    methodId: null,
    status: 'In Progress',
    type: 'Product Comparability',
    referenceBatch: 'BATCH-2025-002',
    testBatch: 'BATCH-2025-005',
    startDate: '2025-03-10',
    completionDate: null,
    protocol: {
      id: 'proto-2',
      version: '1.0',
      approvalDate: '2025-03-05',
      approvedBy: 'Lisa Chen',
      status: 'Approved',
    },
    comparisonParameters: [
      {
        parameter: 'Appearance',
        acceptanceCriteria: 'Consistent with reference',
        result: 'Pass',
        comment: 'Both products have identical appearance',
      },
      {
        parameter: 'Assay',
        acceptanceCriteria: '±5.0% of reference',
        result: 'Pass',
        comment: 'Test: 101.2%, Reference: 102.1%, Difference: -0.9%',
      },
      {
        parameter: 'pH',
        acceptanceCriteria: '±0.5 units of reference',
        result: 'Pass',
        comment: 'Test: 6.3, Reference: 6.5, Difference: -0.2',
      },
      {
        parameter: 'Viscosity',
        acceptanceCriteria: '±20% of reference',
        result: 'Pass',
        comment: 'Test: 19500 cP, Reference: 18500 cP, Difference: +5.4%',
      },
      {
        parameter: 'Related Substances',
        acceptanceCriteria: 'No new impurities >0.1%',
        result: 'In Progress',
        comment: 'Analysis ongoing',
      },
      {
        parameter: 'In Vitro Release',
        acceptanceCriteria: 'f2 ≥ 50',
        result: 'In Progress',
        comment: 'Testing scheduled for 2025-03-25',
      },
    ],
    data: {
      physicalTests: {
        reference: {
          appearance: 'White cream',
          pH: 6.5,
          viscosity: 18500,
          density: 1.05,
        },
        test: {
          appearance: 'White cream',
          pH: 6.3,
          viscosity: 19500,
          density: 1.04,
        },
      },
      chemicals: {
        reference: {
          assay: 102.1,
          waterContent: 18.5,
          impurityA: 0.05,
          impurityB: 0.08,
          totalImpurities: 0.15,
        },
        test: {
          assay: 101.2,
          waterContent: 18.9,
          impurityA: 0.04,
          impurityB: 0.09,
          totalImpurities: 0.14,
        },
      },
    },
    conclusion: null,
    createdBy: 'Lisa Chen',
    createdAt: '2025-03-05T10:00:00Z',
    updatedAt: '2025-03-15T16:30:00Z',
  },
];

/**
 * Get all comparability studies
 *
 * @route GET /api/comparability/studies
 * @param {string} req.query.type - Filter by study type (optional)
 * @param {string} req.query.status - Filter by status (optional)
 * @param {string} req.query.search - Search keyword (optional)
 * @returns {Object} - List of comparability studies
 */
router.get('/studies', (req, res) => {
  let filtered = [...comparabilityStudies];

  // Apply filters if provided
  if (req.query.type) {
    filtered = filtered.filter(s => s.type === req.query.type);
  }

  if (req.query.status) {
    filtered = filtered.filter(s => s.status === req.query.status);
  }

  if (req.query.search) {
    const search = req.query.search.toLowerCase();
    filtered = filtered.filter(
      s =>
        s.name.toLowerCase().includes(search) ||
        s.description.toLowerCase().includes(search) ||
        (s.methodName && s.methodName.toLowerCase().includes(search))
    );
  }

  // Return a simplified view without full data
  const simplifiedStudies = filtered.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    methodId: s.methodId,
    methodName: s.methodName,
    type: s.type,
    status: s.status,
    startDate: s.startDate,
    completionDate: s.completionDate,
    referenceBatch: s.referenceBatch,
    testBatch: s.testBatch,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  res.json({
    success: true,
    studies: simplifiedStudies,
  });
});

/**
 * Get a comparability study by ID
 *
 * @route GET /api/comparability/studies/:studyId
 * @param {string} req.params.studyId - Comparability study ID
 * @returns {Object} - Comparability study data
 */
router.get('/studies/:studyId', (req, res) => {
  const study = comparabilityStudies.find(s => s.id === req.params.studyId);

  if (!study) {
    return res.status(404).json({
      success: false,
      error: 'Comparability study not found',
    });
  }

  res.json({
    success: true,
    study,
  });
});

/**
 * Create a new comparability study
 *
 * @route POST /api/comparability/studies
 * @param {Object} req.body - Comparability study data
 * @returns {Object} - Created comparability study
 */
router.post('/studies', (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name || !req.body.type) {
      return res.status(400).json({
        success: false,
        error: 'Name and study type are required',
      });
    }

    const newStudy = {
      id: `comp-${uuidv4()}`,
      ...req.body,
      status: req.body.status || 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: req.body.data || {},
    };

    comparabilityStudies.push(newStudy);

    res.status(201).json({
      success: true,
      study: newStudy,
    });
  } catch (error) {
    console.error('Error creating comparability study:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create comparability study',
    });
  }
});

/**
 * Update a comparability study
 *
 * @route PUT /api/comparability/studies/:studyId
 * @param {string} req.params.studyId - Comparability study ID
 * @param {Object} req.body - Updated comparability study data
 * @returns {Object} - Updated comparability study
 */
router.put('/studies/:studyId', (req, res) => {
  try {
    const index = comparabilityStudies.findIndex(s => s.id === req.params.studyId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Comparability study not found',
      });
    }

    const updatedStudy = {
      ...comparabilityStudies[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    // Handle nested updates correctly
    if (req.body.data) {
      updatedStudy.data = {
        ...comparabilityStudies[index].data,
        ...req.body.data,
      };
    }

    if (req.body.protocol) {
      updatedStudy.protocol = {
        ...comparabilityStudies[index].protocol,
        ...req.body.protocol,
      };
    }

    comparabilityStudies[index] = updatedStudy;

    res.json({
      success: true,
      study: updatedStudy,
    });
  } catch (error) {
    console.error('Error updating comparability study:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update comparability study',
    });
  }
});

/**
 * Delete a comparability study
 *
 * @route DELETE /api/comparability/studies/:studyId
 * @param {string} req.params.studyId - Comparability study ID
 * @returns {Object} - Success message
 */
router.delete('/studies/:studyId', (req, res) => {
  try {
    const initialLength = comparabilityStudies.length;
    comparabilityStudies = comparabilityStudies.filter(s => s.id !== req.params.studyId);

    if (comparabilityStudies.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Comparability study not found',
      });
    }

    res.json({
      success: true,
      message: 'Comparability study deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting comparability study:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete comparability study',
    });
  }
});

/**
 * Add a parameter to a comparability study
 *
 * @route POST /api/comparability/studies/:studyId/parameters
 * @param {string} req.params.studyId - Comparability study ID
 * @param {Object} req.body - Parameter data
 * @returns {Object} - Updated parameter list
 */
router.post('/studies/:studyId/parameters', (req, res) => {
  try {
    const index = comparabilityStudies.findIndex(s => s.id === req.params.studyId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Comparability study not found',
      });
    }

    // Validate required fields
    if (!req.body.parameter || !req.body.acceptanceCriteria) {
      return res.status(400).json({
        success: false,
        error: 'Parameter name and acceptance criteria are required',
      });
    }

    const study = comparabilityStudies[index];

    // Determine which parameter array to update based on study type
    let parameterArray;
    if (study.type === 'Method Transfer') {
      parameterArray = 'transferParameters';
    } else {
      parameterArray = 'comparisonParameters';
    }

    // Initialize array if it doesn't exist
    if (!study[parameterArray]) {
      study[parameterArray] = [];
    }

    // Add parameter
    study[parameterArray].push({
      ...req.body,
      result: req.body.result || 'Not Started',
      comment: req.body.comment || '',
    });

    study.updatedAt = new Date().toISOString();

    res.status(201).json({
      success: true,
      parameters: study[parameterArray],
    });
  } catch (error) {
    console.error('Error adding parameter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add parameter',
    });
  }
});

/**
 * Update a parameter in a comparability study
 *
 * @route PUT /api/comparability/studies/:studyId/parameters/:paramIndex
 * @param {string} req.params.studyId - Comparability study ID
 * @param {number} req.params.paramIndex - Parameter index
 * @param {Object} req.body - Updated parameter data
 * @returns {Object} - Updated parameter
 */
router.put('/studies/:studyId/parameters/:paramIndex', (req, res) => {
  try {
    const studyIndex = comparabilityStudies.findIndex(s => s.id === req.params.studyId);

    if (studyIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Comparability study not found',
      });
    }

    const paramIndex = parseInt(req.params.paramIndex);
    const study = comparabilityStudies[studyIndex];

    // Determine which parameter array to update based on study type
    let parameterArray;
    if (study.type === 'Method Transfer') {
      parameterArray = 'transferParameters';
    } else {
      parameterArray = 'comparisonParameters';
    }

    // Check if parameter index is valid
    if (!study[parameterArray] || !study[parameterArray][paramIndex]) {
      return res.status(404).json({
        success: false,
        error: 'Parameter not found',
      });
    }

    // Update parameter
    study[parameterArray][paramIndex] = {
      ...study[parameterArray][paramIndex],
      ...req.body,
    };

    study.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      parameter: study[parameterArray][paramIndex],
    });
  } catch (error) {
    console.error('Error updating parameter:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update parameter',
    });
  }
});

/**
 * Update study data
 *
 * @route PUT /api/comparability/studies/:studyId/data
 * @param {string} req.params.studyId - Comparability study ID
 * @param {Object} req.body - Study data
 * @returns {Object} - Updated study data
 */
router.put('/studies/:studyId/data', (req, res) => {
  try {
    const index = comparabilityStudies.findIndex(s => s.id === req.params.studyId);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Comparability study not found',
      });
    }

    // Initialize data if it doesn't exist
    if (!comparabilityStudies[index].data) {
      comparabilityStudies[index].data = {};
    }

    // Update data (deep merge)
    comparabilityStudies[index].data = {
      ...comparabilityStudies[index].data,
      ...req.body,
    };

    comparabilityStudies[index].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      data: comparabilityStudies[index].data,
    });
  } catch (error) {
    console.error('Error updating study data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update study data',
    });
  }
});

/**
 * Generate a comparability study report
 *
 * @route POST /api/comparability/studies/:studyId/report
 * @param {string} req.params.studyId - Comparability study ID
 * @returns {Object} - Generated report
 */
router.post('/studies/:studyId/report', (req, res) => {
  try {
    const study = comparabilityStudies.find(s => s.id === req.params.studyId);

    if (!study) {
      return res.status(404).json({
        success: false,
        error: 'Comparability study not found',
      });
    }

    // Get parameter array based on study type
    const parameterArray =
      study.type === 'Method Transfer' ? 'transferParameters' : 'comparisonParameters';
    const parameters = study[parameterArray] || [];

    // Count parameter results
    const passCount = parameters.filter(p => p.result === 'Pass').length;
    const failCount = parameters.filter(p => p.result === 'Fail').length;
    const pendingCount = parameters.filter(p => p.result !== 'Pass' && p.result !== 'Fail').length;

    // Determine overall status
    let overallResult = 'In Progress';
    if (pendingCount === 0) {
      overallResult = failCount === 0 ? 'Pass' : 'Fail';
    }

    // Generate report sections based on study type
    let reportSections = [];
    if (study.type === 'Method Transfer') {
      reportSections = [
        {
          title: '1. Introduction',
          content: `This report documents the method transfer of ${study.methodName} from ${study.sendingSite.name} to ${study.receivingSite.name}.`,
        },
        {
          title: '2. Objectives',
          content:
            'The objective of this method transfer was to demonstrate that the analytical method performs consistently at both sending and receiving sites.',
        },
        {
          title: '3. Method Description',
          content:
            'The method being transferred is an analytical procedure for the determination of assay by HPLC.',
        },
        {
          title: '4. Transfer Testing Results',
          content: parameters
            .map(
              p =>
                `${p.parameter}: ${p.result}\nAcceptance Criteria: ${p.acceptanceCriteria}\nResult: ${p.result}\nComments: ${p.comment || 'None'}`
            )
            .join('\n\n'),
        },
        {
          title: '5. Statistical Analysis',
          content:
            study.data && study.data.statisticalAnalysis
              ? `t-Test p-value: ${study.data.statisticalAnalysis.tTest.pValue}\n` +
                `Significant Difference: ${study.data.statisticalAnalysis.tTest.significant ? 'Yes' : 'No'}\n` +
                `Interpretation: ${study.data.statisticalAnalysis.tTest.interpretation}\n\n` +
                `Equivalence Limits: ${study.data.statisticalAnalysis.equivalenceLimits.lower} to ${study.data.statisticalAnalysis.equivalenceLimits.upper}\n` +
                `Mean Difference: ${study.data.statisticalAnalysis.equivalenceLimits.meanDifference}\n` +
                `Within Equivalence Limits: ${study.data.statisticalAnalysis.equivalenceLimits.within ? 'Yes' : 'No'}`
              : 'Statistical analysis not available',
        },
        {
          title: '6. Conclusion',
          content:
            study.conclusion ||
            (overallResult === 'Pass'
              ? 'Method transfer was successful. All acceptance criteria were met.'
              : overallResult === 'Fail'
                ? 'Method transfer was unsuccessful. One or more acceptance criteria were not met.'
                : 'Method transfer is in progress.'),
        },
      ];
    } else {
      reportSections = [
        {
          title: '1. Introduction',
          content: `This report documents the product comparability assessment for ${study.description}.`,
        },
        {
          title: '2. Objectives',
          content:
            'The objective of this comparability study was to demonstrate that the test product is comparable to the reference product.',
        },
        {
          title: '3. Product Description',
          content: `Reference Batch: ${study.referenceBatch}\nTest Batch: ${study.testBatch}`,
        },
        {
          title: '4. Comparability Assessment Results',
          content: parameters
            .map(
              p =>
                `${p.parameter}: ${p.result}\nAcceptance Criteria: ${p.acceptanceCriteria}\nResult: ${p.result}\nComments: ${p.comment || 'None'}`
            )
            .join('\n\n'),
        },
        {
          title: '5. Data Summary',
          content: study.data
            ? `Physical Tests:\n` +
              `Appearance - Reference: ${study.data.physicalTests?.reference?.appearance || 'N/A'}, Test: ${study.data.physicalTests?.test?.appearance || 'N/A'}\n` +
              `pH - Reference: ${study.data.physicalTests?.reference?.pH || 'N/A'}, Test: ${study.data.physicalTests?.test?.pH || 'N/A'}\n` +
              `Viscosity - Reference: ${study.data.physicalTests?.reference?.viscosity || 'N/A'}, Test: ${study.data.physicalTests?.test?.viscosity || 'N/A'}\n\n` +
              `Chemical Tests:\n` +
              `Assay - Reference: ${study.data.chemicals?.reference?.assay || 'N/A'}, Test: ${study.data.chemicals?.test?.assay || 'N/A'}\n` +
              `Total Impurities - Reference: ${study.data.chemicals?.reference?.totalImpurities || 'N/A'}, Test: ${study.data.chemicals?.test?.totalImpurities || 'N/A'}`
            : 'Data summary not available',
        },
        {
          title: '6. Conclusion',
          content:
            study.conclusion ||
            (overallResult === 'Pass'
              ? 'The test product is comparable to the reference product. All acceptance criteria were met.'
              : overallResult === 'Fail'
                ? 'The test product is not comparable to the reference product. One or more acceptance criteria were not met.'
                : 'Comparability assessment is in progress.'),
        },
      ];
    }

    // Create report
    const report = {
      id: `report-${uuidv4()}`,
      studyId: study.id,
      title: `Comparability Report - ${study.name}`,
      generatedAt: new Date().toISOString(),
      version: '1.0',
      summary: {
        studyType: study.type,
        parameters: parameters.length,
        passCount,
        failCount,
        pendingCount,
        overallResult,
      },
      sections: reportSections,
      approvals: [
        {
          role: 'Study Director',
          name: '',
          signature: '',
          date: '',
        },
        {
          role: 'Quality Assurance',
          name: '',
          signature: '',
          date: '',
        },
      ],
    };

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
    });
  }
});

/**
 * Perform an equivalency assessment
 *
 * @route POST /api/comparability/equivalency
 * @param {Object} req.body - Test data
 * @returns {Object} - Equivalency assessment results
 */
router.post('/equivalency', (req, res) => {
  try {
    const { reference, test, acceptanceCriteria } = req.body;

    // Validate required fields
    if (!reference || !test || !Array.isArray(reference) || !Array.isArray(test)) {
      return res.status(400).json({
        success: false,
        error: 'Reference and test data arrays are required',
      });
    }

    // Calculate basic statistics
    const referenceMean = reference.reduce((sum, val) => sum + val, 0) / reference.length;
    const testMean = test.reduce((sum, val) => sum + val, 0) / test.length;

    const referenceSD = Math.sqrt(
      reference.reduce((sum, val) => sum + Math.pow(val - referenceMean, 2), 0) /
        (reference.length - 1)
    );
    const testSD = Math.sqrt(
      test.reduce((sum, val) => sum + Math.pow(val - testMean, 2), 0) / (test.length - 1)
    );

    const referenceRSD = (referenceSD / referenceMean) * 100;
    const testRSD = (testSD / testMean) * 100;

    // Calculate mean difference
    const absoluteDifference = testMean - referenceMean;
    const percentDifference = (absoluteDifference / referenceMean) * 100;

    // Perform t-test (simplified)
    const pooledSD = Math.sqrt(
      ((reference.length - 1) * Math.pow(referenceSD, 2) +
        (test.length - 1) * Math.pow(testSD, 2)) /
        (reference.length + test.length - 2)
    );

    const tStatistic =
      Math.abs(referenceMean - testMean) /
      (pooledSD * Math.sqrt(1 / reference.length + 1 / test.length));

    // Simplified p-value calculation (approximation)
    // In a real implementation, would use proper t-distribution
    const degreesOfFreedom = reference.length + test.length - 2;
    let pValue;
    if (tStatistic > 4) {
      pValue = 0.0001;
    } else if (tStatistic > 3) {
      pValue = 0.01;
    } else if (tStatistic > 2) {
      pValue = 0.05;
    } else if (tStatistic > 1) {
      pValue = 0.2;
    } else {
      pValue = 0.5;
    }

    // Determine if results meet acceptance criteria
    const defaultLimit = 2.0; // Default percent difference limit if not specified
    const limit = acceptanceCriteria?.percentDifference || defaultLimit;

    const withinLimits = Math.abs(percentDifference) <= limit;
    const statSigDiff = pValue < 0.05;

    // Determine equivalence
    let equivalenceResult;
    if (withinLimits && !statSigDiff) {
      equivalenceResult = 'Equivalent';
    } else if (!withinLimits && statSigDiff) {
      equivalenceResult = 'Not Equivalent';
    } else if (withinLimits && statSigDiff) {
      equivalenceResult = 'Statistically Different but Within Acceptance Limits';
    } else {
      equivalenceResult = 'Statistically Equivalent but Outside Acceptance Limits';
    }

    res.json({
      success: true,
      statistics: {
        reference: {
          n: reference.length,
          mean: referenceMean,
          sd: referenceSD,
          rsd: referenceRSD,
        },
        test: {
          n: test.length,
          mean: testMean,
          sd: testSD,
          rsd: testRSD,
        },
        comparison: {
          absoluteDifference,
          percentDifference,
          tStatistic,
          pValue,
          degreesOfFreedom,
        },
      },
      assessment: {
        acceptanceLimit: limit,
        withinLimits,
        statisticallySignificantDifference: statSigDiff,
        result: equivalenceResult,
      },
      interpretation:
        equivalenceResult === 'Equivalent'
          ? 'The test results are equivalent to the reference results.'
          : equivalenceResult === 'Not Equivalent'
            ? 'The test results are not equivalent to the reference results.'
            : equivalenceResult === 'Statistically Different but Within Acceptance Limits'
              ? 'Although there is a statistically significant difference, the results are within the acceptance limits and can be considered practically equivalent.'
              : 'Although there is no statistically significant difference, the results are outside the acceptance limits and should be investigated.',
    });
  } catch (error) {
    console.error('Error performing equivalency assessment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform equivalency assessment',
    });
  }
});

export default router;
