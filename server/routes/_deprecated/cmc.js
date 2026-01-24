/**
 * CMC Routes - Server-side API routes for Chemistry, Manufacturing, and Controls (CMC) module
 */

import express from 'express';
import { generateProtocolRecommendations } from '../services/aiService.js';

const router = express.Router();

/**
 * Generate CMC section draft
 *
 * @route POST /api/cmc/generate-section
 * @param {Object} req.body - Input data for section generation
 * @returns {Object} - Generated section content
 */
router.post('/generate-section', async (req, res) => {
  try {
    console.log('Generating CMC section with data:', JSON.stringify(req.body, null, 2));

    // Mock section generation (replace with actual implementation)
    const generatedContent = {
      title: req.body.title || 'Untitled Section',
      content: `This is a placeholder for the ${req.body.sectionType || 'requested'} section. 
      In production, this would contain detailed information about ${req.body.productName || 'the product'} 
      including specifications, manufacturing process, and quality control procedures.`,
      metadata: {
        generatedAt: new Date().toISOString(),
        wordCount: 100,
        sectionType: req.body.sectionType,
      },
    };

    // Add a small delay to simulate processing
    setTimeout(() => {
      res.json({
        success: true,
        section: generatedContent,
      });
    }, 1500);
  } catch (error) {
    console.error('Error generating CMC section:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate CMC section',
    });
  }
});

/**
 * Analyze manufacturing process
 *
 * @route POST /api/cmc/analyze-manufacturing
 * @param {Object} req.body - Manufacturing process data
 * @returns {Object} - Analysis results
 */
router.post('/analyze-manufacturing', async (req, res) => {
  try {
    console.log('Analyzing manufacturing process with data:', JSON.stringify(req.body, null, 2));

    // Mock analysis results (replace with actual implementation)
    const analysis = {
      criticalSteps: [
        {
          name: 'API Synthesis',
          risks: ['Impurity formation', 'Yield variability'],
          controls: ['In-process testing', 'Environmental monitoring'],
        },
        {
          name: 'Sterile Filtration',
          risks: ['Filter integrity', 'Bioburden control'],
          controls: ['Pre/post-use filter testing', 'Validated procedures'],
        },
      ],
      recommendations: [
        'Consider additional in-process controls for the API synthesis step',
        'Enhance environmental monitoring during sterile operations',
        'Validate holding times for intermediate products',
      ],
      riskAssessment: {
        overallRisk: 'Medium',
        highestRiskAreas: ['Sterile processing', 'API synthesis'],
        mitigationStrategies: [
          'Enhanced operator training',
          'Automated process controls',
          'Continuous monitoring systems',
        ],
      },
    };

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error analyzing manufacturing process:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze manufacturing process',
    });
  }
});

/**
 * Generate specifications
 *
 * @route POST /api/cmc/generate-specifications
 * @param {Object} req.body - Product data
 * @returns {Object} - Generated specifications
 */
router.post('/generate-specifications', async (req, res) => {
  try {
    console.log('Generating specifications with data:', JSON.stringify(req.body, null, 2));

    // Mock specifications (replace with actual implementation)
    const specifications = {
      appearance: {
        description: 'White to off-white powder',
        acceptanceCriteria: 'White to off-white powder',
        testMethod: 'Visual inspection',
      },
      assay: {
        description: 'Content of active substance',
        acceptanceCriteria: '95.0% - 105.0%',
        testMethod: 'HPLC',
      },
      impurities: {
        description: 'Related substances',
        acceptanceCriteria: 'Any individual impurity: NMT 0.5%, Total impurities: NMT 2.0%',
        testMethod: 'HPLC',
      },
      particleSize: {
        description: 'Particle size distribution',
        acceptanceCriteria: 'D90: NMT 100 μm',
        testMethod: 'Laser diffraction',
      },
      waterContent: {
        description: 'Water content',
        acceptanceCriteria: 'NMT 0.5%',
        testMethod: 'Karl Fischer titration',
      },
    };

    res.json({
      success: true,
      productName: req.body.productName || 'Unnamed Product',
      specifications,
    });
  } catch (error) {
    console.error('Error generating specifications:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate specifications',
    });
  }
});

/**
 * Generate stability protocol
 *
 * @route POST /api/cmc/generate-stability-protocol
 * @param {Object} req.body - Product and storage condition data
 * @returns {Object} - Generated stability protocol
 */
router.post('/generate-stability-protocol', async (req, res) => {
  try {
    console.log('Generating stability protocol with data:', JSON.stringify(req.body, null, 2));

    // Mock stability protocol (replace with actual implementation)
    const stabilityProtocol = {
      purpose: `To establish the stability profile of ${req.body.productName || 'the product'} and determine appropriate storage conditions and shelf life`,
      testingConditions: [
        {
          name: 'Long-term',
          temperature: '25°C ± 2°C',
          humidity: '60% ± 5% RH',
          timePoints: [
            '0',
            '3 months',
            '6 months',
            '9 months',
            '12 months',
            '18 months',
            '24 months',
            '36 months',
          ],
          batchCount: 3,
        },
        {
          name: 'Intermediate',
          temperature: '30°C ± 2°C',
          humidity: '65% ± 5% RH',
          timePoints: ['0', '3 months', '6 months', '12 months'],
          batchCount: 3,
        },
        {
          name: 'Accelerated',
          temperature: '40°C ± 2°C',
          humidity: '75% ± 5% RH',
          timePoints: ['0', '1 month', '3 months', '6 months'],
          batchCount: 3,
        },
      ],
      testParameters: [
        'Appearance',
        'Assay',
        'Degradation products',
        'Water content',
        'Dissolution',
        'Microbiological quality',
      ],
      specifications: `As per ${req.body.productName || 'product'} release specifications`,
      analyticalMethods: 'Validated stability-indicating methods',
      packaging: req.body.packaging || 'Primary packaging configuration',
    };

    res.json({
      success: true,
      stabilityProtocol,
    });
  } catch (error) {
    console.error('Error generating stability protocol:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate stability protocol',
    });
  }
});

/**
 * PAI (Pre-Approval Inspection) Simulator Routes
 */

// Helper function to compute PAI signals from manufacturing data
function computePaiSignals() {
  // Mock manufacturing data - in production, this would come from your multi-tenant database
  const mockData = {
    validation: { ppq: { targetRuns: 3, completedRuns: 3 } },
    equipment: [
      { critical: true, pq: true, calibrationDue: null },
      { critical: true, pq: true, calibrationDue: '2025-12-01' }
    ],
    deviations: [
      { severity: 'low' },
      { severity: 'medium' }
    ],
    capas: [
      { status: 'Closed' },
      { status: 'Open' }
    ],
    process: { 
      cppCqaMatrix: [
        { relation: 'direct' },
        { relation: 'indirect' }
      ]
    },
    packaging: { format: 'bottles', components: ['bottle', 'cap', 'label'] }
  };

  const ppqTarget = mockData.validation?.ppq?.targetRuns ?? 0;
  const ppqDone = mockData.validation?.ppq?.completedRuns ?? 0;
  const validationOK = ppqTarget > 0 && ppqDone >= ppqTarget;

  const eq = mockData.equipment || [];
  const critical = eq.filter(e => e.critical);
  const criticalOk = critical.filter(e => e.pq === true && (!e.calibrationDue || new Date(e.calibrationDue).getTime() >= Date.now())).length;
  const equipmentOK = critical.length ? (criticalOk === critical.length) : false;

  const devHigh = (mockData.deviations || []).filter(d => d.severity === 'high').length;
  const capaOpen = (mockData.capas || []).filter(c => c.status !== 'Closed').length;
  const deviationsOK = (devHigh === 0) && (capaOpen < 3);

  const cppMissing = (mockData.process?.cppCqaMatrix || []).filter(m => !m.relation || m.relation === 'unknown').length;
  const cppOK = cppMissing === 0;

  const part11OK = true; // Audit trail and e-sign implemented
  const packagingOK = !!mockData.packaging;

  return { validationOK, equipmentOK, deviationsOK, cppOK, part11OK, packagingOK };
}

function generatePaiChecklist() {
  const sig = computePaiSignals();
  const items = [
    { id:'PAI-VAL', title:'Process Validation (PPQ complete, criteria met)', section:'3.2.P.3.5', weight:5, ok:sig.validationOK },
    { id:'PAI-CGMP',title:'Critical Equipment (PQ completed, calibration current)', section:'3.2.P.3.3', weight:4, ok:sig.equipmentOK },
    { id:'PAI-DEV', title:'Deviations & CAPA (none open high; CAPA effectiveness)', section:'—', weight:3, ok:sig.deviationsOK },
    { id:'PAI-CPP', title:'CPP↔CQA mapping & control strategy justified', section:'3.2.P.3.4', weight:3, ok:sig.cppOK },
    { id:'PAI-11',  title:'21 CFR Part 11 (audit trail, e-sign, access controls)', section:'—', weight:2, ok:sig.part11OK },
    { id:'PAI-PKG', title:'Packaging/Serialization compliance (labels/templates)', section:'3.2.P.7', weight:2, ok:sig.packagingOK },
  ];
  const score = items.reduce((a,x) => a + (x.ok ? x.weight : 0), 0);
  const max = items.reduce((a,x) => a + x.weight, 0);
  const pct = Math.round((score / max) * 100);
  const gaps = items.filter(x => !x.ok).map(x => ({
    id: x.id, title: x.title, section: x.section,
    recommendation: getPaiRecommendation(x.id)
  }));
  return { items, scorePct: pct, gaps };
}

function getPaiRecommendation(id) {
  const recommendations = {
    'PAI-VAL': 'Execute remaining PPQ runs; ensure Cp/Cpk ≥ 1.33; file PPQ addendum if scale/equipment changed.',
    'PAI-CGMP': 'Complete PQ on critical equipment; clear overdue calibrations; attach impact assessments.',
    'PAI-DEV': 'Close open high-severity deviations; create/verify CAPA with effectiveness checks.',
    'PAI-CPP': 'Complete CPP↔CQA matrix with PAR, monitoring, alarms; justify primary links with DoE or risk.',
    'PAI-11': 'Verify audit, e-sign envelopes, access roles; document Part 11 SOP cross-reference.',
    'PAI-PKG': 'Validate labels vs. region rules; store approved label templates; verify serialization data.'
  };
  return recommendations[id] || 'Address and document resolution with traceable evidence.';
}

// GET /api/cmc/pai/checklist
router.get('/pai/checklist', async (req, res) => {
  try {
    const checklist = generatePaiChecklist();
    res.json({ 
      generatedAt: new Date().toISOString(), 
      ...checklist 
    });
  } catch (error) {
    console.error('Error generating PAI checklist:', error);
    res.status(500).json({ error: 'Failed to generate PAI checklist' });
  }
});

// POST /api/cmc/pai/action-plan
router.post('/pai/action-plan', async (req, res) => {
  try {
    const { gaps = [] } = req.body || {};
    const plan = gaps.map(g => ({
      id: 'PAIACT-' + g.id,
      type: (g.id === 'PAI-CPP' || g.id === 'PAI-PKG') ? 'ChangeControl' : 'CAPA',
      title: g.title,
      section: g.section,
      recommendation: g.recommendation
    }));
    res.json({ plan });
  } catch (error) {
    console.error('Error generating PAI action plan:', error);
    res.status(500).json({ error: 'Failed to generate action plan' });
  }
});

/**
 * Stability & Shelf-life Planner Routes
 */

// GET /api/cmc/stability
router.get('/stability', async (req, res) => {
  try {
    // Mock stability data - in production, this would come from your multi-tenant database
    const stabilityData = {
      product: 'DP-Tablet-10mg',
      studies: [
        { 
          id: 'LT-25C60', 
          type: 'Long-term', 
          cond: '25°C/60%RH', 
          durationMonths: 12, 
          points: [0,3,6,9,12], 
          attrs: ['Assay','Dissolution','Hardness'] 
        },
        { 
          id: 'ACC-40C75', 
          type: 'Accelerated', 
          cond: '40°C/75%RH', 
          durationMonths: 6, 
          points: [0,1,2,3,6], 
          attrs: ['Assay','Dissolution'] 
        }
      ],
      dataSummary: { 
        assayTrend: 'stable', 
        dissolutionTrend: 'stable' 
      },
      claimMonths: 24,
      projectionMethod: 'ICH Q1E(R2) linear regression'
    };
    res.json(stabilityData);
  } catch (error) {
    console.error('Error fetching stability data:', error);
    res.status(500).json({ error: 'Failed to fetch stability data' });
  }
});

// POST /api/cmc/stability/projection
router.post('/stability/projection', async (req, res) => {
  try {
    const { longTermMonths = 12, accelSupport = true, desiredClaim = 24 } = req.body || {};
    // ICH guidelines: LT >= 12 months and accelerated support allows projection to 24 months
    const ok = (longTermMonths >= 12) && accelSupport && (desiredClaim <= 24);
    
    const response = {
      ok,
      recommendation: ok
        ? 'You may project to 24 months with commitment to provide 18/24-month LT data post-approval.'
        : 'Collect more long-term data or reduce claim; consider bracketing/matrixing per ICH Q1D.',
      commitments: ok ? ['Provide 18/24-month LT data as a post-approval commitment'] : [],
      projectionBasis: 'ICH Q1E(R2) extrapolation methodology'
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error processing stability projection:', error);
    res.status(500).json({ error: 'Failed to process stability projection' });
  }
});

// POST /api/cmc/stability/commitment
router.post('/stability/commitment', async (req, res) => {
  try {
    const { description } = req.body || {};
    if (!description) {
      return res.status(400).json({ error: 'description required' });
    }
    
    const commitment = {
      id: 'COMMIT-' + Math.random().toString(36).slice(2,7).toUpperCase(),
      description,
      status: 'Planned',
      createdAt: new Date().toISOString()
    };
    
    res.json(commitment);
  } catch (error) {
    console.error('Error creating stability commitment:', error);
    res.status(500).json({ error: 'Failed to create commitment' });
  }
});

/**
 * OEE (Overall Equipment Effectiveness) Advisor Routes
 */

// Helper function to compute OEE signals from manufacturing data
function computeOeeSignals() {
  // Mock manufacturing data - in production, this would come from your multi-tenant database
  const mockData = {
    equipment: [
      { 
        id: 'EQ-001', 
        critical: true, 
        scheduledHours: 168, // weekly hours
        actualUptime: 158, 
        calibrationDue: null, 
        maintenanceDue: '2025-10-01',
        pq: {
          status: 'completed',
          completedDate: '2025-08-15',
          expiryDate: '2027-08-15'
        }
      },
      { 
        id: 'EQ-002', 
        critical: true, 
        scheduledHours: 168, 
        actualUptime: 140, 
        calibrationDue: '2025-09-15', // overdue
        maintenanceDue: null,
        pq: {
          status: 'pending',
          plannedDate: '2025-09-30',
          expiryDate: null
        }
      },
      {
        id: 'EQ-003',
        critical: true,
        scheduledHours: 168,
        actualUptime: 160,
        calibrationDue: null,
        maintenanceDue: null,
        pq: {
          status: 'overdue',
          plannedDate: '2025-08-01',
          expiryDate: null
        }
      }
    ],
    production: {
      idealRate: 1000, // units per hour
      actualRate: 850, // units per hour
      targetOutput: 168000, // weekly target
      actualOutput: 142800, // actual units produced
      goodUnits: 135660, // after quality checks
      rejectedUnits: 7140
    },
    deviations: [
      { severity: 'high', impact: 'quality', resolved: false },
      { severity: 'medium', impact: 'performance', resolved: true },
      { severity: 'low', impact: 'availability', resolved: true }
    ],
    cpv: {
      inControl: true, // Continued Process Verification status
      lastReview: '2025-09-01',
      criticalParameters: [
        { name: 'Temperature', inControl: true },
        { name: 'Pressure', inControl: false }, // out of control
        { name: 'Flow Rate', inControl: true }
      ]
    }
  };

  // Calculate Availability (Equipment uptime vs scheduled time)
  const totalScheduled = mockData.equipment.reduce((sum, eq) => sum + eq.scheduledHours, 0);
  const totalUptime = mockData.equipment.reduce((sum, eq) => sum + eq.actualUptime, 0);
  const availability = Math.round((totalUptime / totalScheduled) * 100);

  // Calculate Performance (Actual vs ideal production rate)
  const performance = Math.round((mockData.production.actualRate / mockData.production.idealRate) * 100);

  // Calculate Quality (Good units vs total units produced)
  const quality = Math.round((mockData.production.goodUnits / mockData.production.actualOutput) * 100);

  // Overall OEE = Availability × Performance × Quality
  const oee = Math.round((availability * performance * quality) / 10000);

  // Identify drivers/issues
  const drivers = [];
  
  // Check calibration overdue
  const calibrationOverdue = mockData.equipment.filter(eq => 
    eq.calibrationDue && new Date(eq.calibrationDue).getTime() < Date.now()
  );
  if (calibrationOverdue.length > 0) {
    drivers.push({
      type: 'calibration',
      impact: 'availability',
      description: `${calibrationOverdue.length} equipment item(s) with overdue calibration`,
      severity: 'high',
      equipment: calibrationOverdue.map(eq => eq.id)
    });
  }

  // Check maintenance due
  const maintenanceDue = mockData.equipment.filter(eq => 
    eq.maintenanceDue && new Date(eq.maintenanceDue).getTime() < Date.now() + (7 * 24 * 60 * 60 * 1000) // within 7 days
  );
  if (maintenanceDue.length > 0) {
    drivers.push({
      type: 'maintenance',
      impact: 'availability',
      description: `${maintenanceDue.length} equipment item(s) due for maintenance`,
      severity: 'medium',
      equipment: maintenanceDue.map(eq => eq.id)
    });
  }

  // Check open high deviations
  const openHighDeviations = mockData.deviations.filter(dev => 
    dev.severity === 'high' && !dev.resolved
  );
  if (openHighDeviations.length > 0) {
    drivers.push({
      type: 'deviation',
      impact: 'quality',
      description: `${openHighDeviations.length} open high-severity deviation(s)`,
      severity: 'high',
      count: openHighDeviations.length
    });
  }

  // Check CPV out-of-control parameters
  const outOfControlParams = mockData.cpv.criticalParameters.filter(param => !param.inControl);
  if (outOfControlParams.length > 0) {
    drivers.push({
      type: 'cpv',
      impact: 'performance',
      description: `${outOfControlParams.length} CPV parameter(s) out-of-control`,
      severity: 'medium',
      parameters: outOfControlParams.map(param => param.name)
    });
  }

  // Check PQ gaps (Performance Qualification incomplete/overdue)
  const pqIncomplete = mockData.equipment.filter(eq => 
    eq.critical && eq.pq && (eq.pq.status === 'pending' || eq.pq.status === 'overdue')
  );
  if (pqIncomplete.length > 0) {
    drivers.push({
      type: 'pq_gaps',
      impact: 'availability',
      description: `${pqIncomplete.length} critical equipment item(s) with incomplete/overdue PQ`,
      severity: 'high',
      equipment: pqIncomplete.map(eq => eq.id),
      details: pqIncomplete.map(eq => ({
        id: eq.id,
        status: eq.pq.status,
        plannedDate: eq.pq.plannedDate
      }))
    });
  }

  return { 
    availability, 
    performance, 
    quality, 
    oee, 
    drivers,
    rawData: mockData 
  };
}

// GET /api/cmc/oee/advisor
router.get('/oee/advisor', async (req, res) => {
  try {
    const oeeData = computeOeeSignals();
    
    const response = {
      generatedAt: new Date().toISOString(),
      oee: {
        overall: oeeData.oee,
        availability: oeeData.availability,
        performance: oeeData.performance,
        quality: oeeData.quality
      },
      breakdown: {
        availability: {
          value: oeeData.availability,
          status: oeeData.availability >= 90 ? 'good' : oeeData.availability >= 80 ? 'acceptable' : 'poor',
          description: 'Equipment uptime vs scheduled time'
        },
        performance: {
          value: oeeData.performance,
          status: oeeData.performance >= 90 ? 'good' : oeeData.performance >= 80 ? 'acceptable' : 'poor',
          description: 'Actual vs ideal production rate'
        },
        quality: {
          value: oeeData.quality,
          status: oeeData.quality >= 90 ? 'good' : oeeData.quality >= 80 ? 'acceptable' : 'poor',
          description: 'Good units vs total units produced'
        }
      },
      drivers: oeeData.drivers,
      recommendations: {
        immediate: oeeData.drivers
          .filter(d => d.severity === 'high')
          .map(d => `Address ${d.type}: ${d.description}`),
        planned: oeeData.drivers
          .filter(d => d.severity === 'medium')
          .map(d => `Schedule ${d.type} action: ${d.description}`)
      },
      trends: {
        period: 'Last 7 days',
        oee: [78, 79, 82, 85, oeeData.oee, oeeData.oee, oeeData.oee],
        availability: [88, 89, 91, 93, oeeData.availability, oeeData.availability, oeeData.availability],
        performance: [82, 84, 85, 87, oeeData.performance, oeeData.performance, oeeData.performance],
        quality: [96, 97, 95, 96, oeeData.quality, oeeData.quality, oeeData.quality]
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error calculating OEE:', error);
    res.status(500).json({ error: 'Failed to calculate OEE' });
  }
});

// POST /api/cmc/oee/improvement-plan
router.post('/oee/improvement-plan', async (req, res) => {
  try {
    // Generate action plan from server-derived signals only - ignore client payload for security
    const oeeData = computeOeeSignals();
    const { drivers = [], oee } = oeeData;
    
    const improvementPlan = drivers.map(driver => {
      let actionType, priority, timeline, recommendation;
      
      switch (driver.type) {
        case 'calibration':
          actionType = 'PM'; // Preventive Maintenance
          priority = 'High';
          timeline = 'Immediate (within 24h)';
          recommendation = `Execute calibration verification for equipment ${driver.equipment?.join(', ')}. Document calibration certificates and update maintenance schedule.`;
          break;
          
        case 'maintenance':
          actionType = 'PM';
          priority = 'Medium';
          timeline = 'Within 7 days';
          recommendation = `Schedule preventive maintenance for equipment ${driver.equipment?.join(', ')}. Review maintenance procedures and spare parts inventory.`;
          break;
          
        case 'deviation':
          actionType = 'CAPA';
          priority = 'High';
          timeline = 'Immediate';
          recommendation = `Investigate root cause of high-severity deviations. Implement corrective actions and verify effectiveness. Update risk assessments.`;
          break;
          
        case 'cpv':
          actionType = 'CC'; // Change Control
          priority = 'Medium';
          timeline = 'Within 14 days';
          recommendation = `Review CPV data for parameters ${driver.parameters?.join(', ')}. Assess need for process adjustments or control limit updates via change control.`;
          break;
          
        case 'pq_gaps':
          actionType = 'PQ'; // Performance Qualification
          priority = 'High';
          timeline = 'Immediate (within 30 days)';
          recommendation = `Execute Performance Qualification for equipment ${driver.equipment?.join(', ')}. Complete IQ/OQ/PQ protocols and obtain regulatory approval before commercial use.`;
          break;
          
        default:
          actionType = 'CAPA';
          priority = 'Medium';
          timeline = 'Within 30 days';
          recommendation = 'Address identified issue through systematic investigation and corrective action.';
      }
      
      return {
        id: `OEE-${actionType}-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        type: actionType,
        priority,
        timeline,
        title: `${actionType}: ${driver.description}`,
        description: driver.description,
        impact: driver.impact,
        recommendation,
        estimatedImpact: calculateEstimatedImpact(driver, oee),
        section: getRelevantSection(driver.type)
      };
    });

    // Add general recommendations based on OEE performance
    const generalRecommendations = [];
    if (oee?.overall < 85) {
      generalRecommendations.push({
        id: `OEE-GEN-${Date.now()}`,
        type: 'Strategic',
        priority: 'Medium',
        timeline: 'Within 30 days',
        title: 'Overall OEE Improvement Strategy',
        description: 'Comprehensive OEE improvement program',
        recommendation: 'Implement systematic OEE monitoring with real-time dashboards. Consider lean manufacturing principles and operator training programs.',
        estimatedImpact: 'Potential 10-15% OEE improvement',
        section: 'Manufacturing Strategy'
      });
    }

    const response = {
      generatedAt: new Date().toISOString(),
      plan: [...improvementPlan, ...generalRecommendations],
      summary: {
        totalActions: improvementPlan.length + generalRecommendations.length,
        highPriority: improvementPlan.filter(p => p.priority === 'High').length,
        mediumPriority: improvementPlan.filter(p => p.priority === 'Medium').length,
        estimatedTimeframe: '2-4 weeks for critical items, 1-3 months for strategic improvements'
      },
      implementation: {
        phase1: improvementPlan.filter(p => p.priority === 'High'),
        phase2: improvementPlan.filter(p => p.priority === 'Medium'),
        phase3: generalRecommendations
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating OEE improvement plan:', error);
    res.status(500).json({ error: 'Failed to generate improvement plan' });
  }
});

// Helper function to calculate estimated impact
function calculateEstimatedImpact(driver, oee) {
  const impactMap = {
    'calibration': 'Availability +5-8%, Quality +2-3%',
    'maintenance': 'Availability +3-5%',
    'deviation': 'Quality +8-12%, Performance +2-4%',
    'cpv': 'Performance +5-10%, Quality +3-5%',
    'pq_gaps': 'Availability +10-15%, Quality +5-8%'
  };
  
  return impactMap[driver.type] || 'Variable impact based on root cause';
}

// Helper function to get relevant CTD section
function getRelevantSection(driverType) {
  const sectionMap = {
    'calibration': '3.2.P.3.3 (Equipment)',
    'maintenance': '3.2.P.3.3 (Equipment)', 
    'deviation': '3.2.P.3.5 (Process Validation)',
    'cpv': '3.2.P.3.5 (Process Validation)',
    'pq_gaps': '3.2.P.3.3 (Equipment)'
  };
  
  return sectionMap[driverType] || '3.2.P.3 (Manufacturing Process)';
}

/**
 * Readiness Heatmap Assessment Routes
 */

// Helper function to compute readiness signals across 6 key dimensions
function computeReadinessSignals() {
  // Mock manufacturing data - in production, this would come from your multi-tenant database
  const mockData = {
    digitalTwin: {
      status: 'active',
      completeness: 85,
      lastUpdate: '2025-09-15',
      criticalParameters: 12,
      mappedParameters: 10
    },
    validation: { 
      ppq: { targetRuns: 3, completedRuns: 3, cpkValues: [1.45, 1.52, 1.38] },
      cpv: { inControl: true, outOfControlParams: 0, totalParams: 8 }
    },
    equipment: [
      { id: 'EQ-001', critical: true, iq: true, oq: true, pq: true, calibrationDue: null },
      { id: 'EQ-002', critical: true, iq: true, oq: true, pq: false, calibrationDue: '2025-12-01' },
      { id: 'EQ-003', critical: false, iq: true, oq: false, pq: false, calibrationDue: null }
    ],
    deviations: [
      { severity: 'low', status: 'closed' },
      { severity: 'medium', status: 'closed' },
      { severity: 'high', status: 'open' }
    ],
    capas: [
      { status: 'Closed', effectiveness: 'verified' },
      { status: 'Open', dueDate: '2025-10-01' }
    ],
    packaging: {
      labels: { compliant: 18, total: 20, regions: ['US', 'EU', 'JP'] },
      serialization: { ready: true, tested: true, validated: false },
      components: { qualified: 15, total: 16 }
    },
    aiCompliance: {
      overallScore: 78,
      findings: { total: 12, resolved: 9, pending: 3, critical: 1 },
      reviewComplete: false,
      lastReview: '2025-09-01'
    },
    process: {
      cppCqaMatrix: [
        { cpp: 'Temperature', cqa: 'Assay', relation: 'direct', justified: true },
        { cpp: 'Pressure', cqa: 'Dissolution', relation: 'indirect', justified: true },
        { cpp: 'pH', cqa: 'Impurities', relation: 'unknown', justified: false }
      ]
    }
  };

  // Process Readiness Assessment
  const digitalTwinGood = mockData.digitalTwin.completeness >= 90;
  const cppCqaComplete = mockData.process.cppCqaMatrix.filter(m => m.relation === 'unknown' || !m.justified).length === 0;
  const processScore = (digitalTwinGood ? 50 : (mockData.digitalTwin.completeness >= 70 ? 25 : 0)) + 
                      (cppCqaComplete ? 50 : 25);
  const processStatus = processScore >= 85 ? 'Good' : processScore >= 60 ? 'Acceptable' : 'Poor';

  // Validation Readiness Assessment  
  const ppqComplete = mockData.validation.ppq.completedRuns >= mockData.validation.ppq.targetRuns;
  const cpkAcceptable = mockData.validation.ppq.cpkValues.every(cpk => cpk >= 1.33);
  const cpvInControl = mockData.validation.cpv.inControl && mockData.validation.cpv.outOfControlParams === 0;
  const validationScore = (ppqComplete ? 40 : 0) + (cpkAcceptable ? 30 : 0) + (cpvInControl ? 30 : 0);
  const validationStatus = validationScore >= 85 ? 'Good' : validationScore >= 60 ? 'Acceptable' : 'Poor';

  // Equipment Readiness Assessment
  const criticalEquipment = mockData.equipment.filter(eq => eq.critical);
  const qualifiedEquipment = criticalEquipment.filter(eq => eq.iq && eq.oq && eq.pq);
  const calibrationCurrent = criticalEquipment.filter(eq => !eq.calibrationDue || new Date(eq.calibrationDue).getTime() >= Date.now());
  const equipmentScore = criticalEquipment.length > 0 ? 
    ((qualifiedEquipment.length / criticalEquipment.length) * 60) + 
    ((calibrationCurrent.length / criticalEquipment.length) * 40) : 0;
  const equipmentStatus = equipmentScore >= 85 ? 'Good' : equipmentScore >= 60 ? 'Acceptable' : 'Poor';

  // Deviations Readiness Assessment
  const openHighDeviations = mockData.deviations.filter(d => d.severity === 'high' && d.status === 'open').length;
  const openCapas = mockData.capas.filter(c => c.status === 'Open').length;
  const capaEffectiveness = mockData.capas.filter(c => c.status === 'Closed' && c.effectiveness === 'verified').length;
  const totalClosedCapas = mockData.capas.filter(c => c.status === 'Closed').length;
  const deviationsScore = (openHighDeviations === 0 ? 50 : 0) + 
                         (openCapas < 3 ? 30 : 10) +
                         (totalClosedCapas > 0 ? (capaEffectiveness / totalClosedCapas) * 20 : 0);
  const deviationsStatus = deviationsScore >= 85 ? 'Good' : deviationsScore >= 60 ? 'Acceptable' : 'Poor';

  // Packaging Readiness Assessment
  const labelCompliance = (mockData.packaging.labels.compliant / mockData.packaging.labels.total) * 100;
  const serializationReady = mockData.packaging.serialization.ready && mockData.packaging.serialization.tested;
  const componentsQualified = (mockData.packaging.components.qualified / mockData.packaging.components.total) * 100;
  const packagingScore = (labelCompliance >= 90 ? 40 : labelCompliance >= 75 ? 25 : 10) +
                        (serializationReady ? 30 : 0) +
                        (componentsQualified >= 95 ? 30 : componentsQualified >= 85 ? 15 : 0);
  const packagingStatus = packagingScore >= 85 ? 'Good' : packagingScore >= 60 ? 'Acceptable' : 'Poor';

  // AI Compliance Readiness Assessment
  const aiScore = mockData.aiCompliance.overallScore;
  const criticalFindingsResolved = mockData.aiCompliance.findings.critical === 0;
  const reviewComplete = mockData.aiCompliance.reviewComplete;
  const findingsResolutionRate = (mockData.aiCompliance.findings.resolved / mockData.aiCompliance.findings.total) * 100;
  const aiComplianceScore = (aiScore >= 80 ? 40 : aiScore >= 60 ? 25 : 10) +
                           (criticalFindingsResolved ? 30 : 0) +
                           (reviewComplete ? 20 : 0) +
                           (findingsResolutionRate >= 75 ? 10 : 0);
  const aiStatus = aiComplianceScore >= 85 ? 'Good' : aiComplianceScore >= 60 ? 'Acceptable' : 'Poor';

  // Calculate overall readiness percentage
  const overallScore = Math.round((processScore + validationScore + equipmentScore + deviationsScore + packagingScore + aiComplianceScore) / 6);

  return {
    process: { status: processStatus, score: Math.round(processScore), details: { digitalTwin: digitalTwinGood, cppCqa: cppCqaComplete }},
    validation: { status: validationStatus, score: Math.round(validationScore), details: { ppq: ppqComplete, cpk: cpkAcceptable, cpv: cpvInControl }},
    equipment: { status: equipmentStatus, score: Math.round(equipmentScore), details: { qualified: qualifiedEquipment.length, total: criticalEquipment.length, calibrated: calibrationCurrent.length }},
    deviations: { status: deviationsStatus, score: Math.round(deviationsScore), details: { openHigh: openHighDeviations, openCapas: openCapas, capaEffectiveness: capaEffectiveness }},
    packaging: { status: packagingStatus, score: Math.round(packagingScore), details: { labelCompliance: Math.round(labelCompliance), serialization: serializationReady, components: Math.round(componentsQualified) }},
    ai: { status: aiStatus, score: Math.round(aiComplianceScore), details: { overallScore: aiScore, criticalResolved: criticalFindingsResolved, reviewComplete: reviewComplete, resolutionRate: Math.round(findingsResolutionRate) }},
    overall: { score: overallScore, status: overallScore >= 85 ? 'Good' : overallScore >= 60 ? 'Acceptable' : 'Poor' },
    rawData: mockData
  };
}

// GET /api/cmc/readiness/heatmap
router.get('/readiness/heatmap', async (req, res) => {
  try {
    const readinessData = computeReadinessSignals();
    
    // Define CTD section mappings for each dimension
    const ctdMappings = {
      process: ['3.2.P.3.4'],
      validation: ['3.2.P.3.5'],
      equipment: ['3.2.P.3.3'],
      deviations: ['3.2.P.3.3', '3.2.P.3.5'],
      packaging: ['3.2.P.7'],
      ai: ['3.2.S.2.5']
    };

    // Create heatmap grid data
    const heatmapGrid = [
      {
        dimension: 'Process',
        status: readinessData.process.status,
        score: readinessData.process.score,
        ctdSections: ctdMappings.process,
        description: 'Digital twin status, CPP-CQA matrix completeness',
        details: readinessData.process.details,
        deepLink: 'digital-twin'
      },
      {
        dimension: 'Validation',
        status: readinessData.validation.status,
        score: readinessData.validation.score,
        ctdSections: ctdMappings.validation,
        description: 'PPQ completion, CPV control status',
        details: readinessData.validation.details,
        deepLink: 'validation-lifecycle'
      },
      {
        dimension: 'Equipment',
        status: readinessData.equipment.status,
        score: readinessData.equipment.score,
        ctdSections: ctdMappings.equipment,
        description: 'IQ/OQ/PQ status, calibration current',
        details: readinessData.equipment.details,
        deepLink: 'site-equipment'
      },
      {
        dimension: 'Deviations',
        status: readinessData.deviations.status,
        score: readinessData.deviations.score,
        ctdSections: ctdMappings.deviations,
        description: 'Open high-severity items, CAPA effectiveness',
        details: readinessData.deviations.details,
        deepLink: 'deviation-capa'
      },
      {
        dimension: 'Packaging',
        status: readinessData.packaging.status,
        score: readinessData.packaging.score,
        ctdSections: ctdMappings.packaging,
        description: 'Label compliance, serialization readiness',
        details: readinessData.packaging.details,
        deepLink: 'packaging-serialization'
      },
      {
        dimension: 'AI',
        status: readinessData.ai.status,
        score: readinessData.ai.score,
        ctdSections: ctdMappings.ai,
        description: 'Compliance score, review findings resolution',
        details: readinessData.ai.details,
        deepLink: 'manufacturing-ai'
      }
    ];

    // Generate recommendations for improvement
    const recommendations = [];
    
    heatmapGrid.forEach(dimension => {
      if (dimension.status === 'Poor' || dimension.status === 'Acceptable') {
        let recommendation = '';
        switch (dimension.dimension) {
          case 'Process':
            recommendation = dimension.details.digitalTwin ? 
              'Complete CPP-CQA matrix justification and risk assessments' :
              'Update digital twin model and complete CPP-CQA linkage studies';
            break;
          case 'Validation':
            recommendation = !dimension.details.ppq ? 
              'Execute remaining PPQ runs with statistical analysis' :
              'Address out-of-control CPV parameters and improve process capability';
            break;
          case 'Equipment':
            recommendation = 'Complete IQ/OQ/PQ qualification protocols and address calibration overdue items';
            break;
          case 'Deviations':
            recommendation = 'Close open high-severity deviations and verify CAPA effectiveness';
            break;
          case 'Packaging':
            recommendation = 'Complete label compliance verification and serialization validation';
            break;
          case 'AI':
            recommendation = 'Resolve critical AI compliance findings and complete regulatory review';
            break;
        }
        
        recommendations.push({
          dimension: dimension.dimension,
          priority: dimension.status === 'Poor' ? 'High' : 'Medium',
          recommendation,
          ctdSections: dimension.ctdSections
        });
      }
    });

    const response = {
      generatedAt: new Date().toISOString(),
      overall: readinessData.overall,
      heatmapGrid,
      ctdSectionMapping: {
        '3.2.P.3.3': 'Manufacture (Equipment & Facilities)',
        '3.2.P.3.4': 'Control of Critical Steps and Intermediates', 
        '3.2.P.3.5': 'Process Validation and/or Evaluation',
        '3.2.P.7': 'Container Closure System',
        '3.2.S.2.5': 'Process Development History (AI/ML Systems)'
      },
      recommendations,
      summary: {
        good: heatmapGrid.filter(d => d.status === 'Good').length,
        acceptable: heatmapGrid.filter(d => d.status === 'Acceptable').length,
        poor: heatmapGrid.filter(d => d.status === 'Poor').length,
        totalDimensions: heatmapGrid.length,
        submissionReady: readinessData.overall.status === 'Good'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating readiness heatmap:', error);
    res.status(500).json({ error: 'Failed to generate readiness heatmap' });
  }
});

/**
 * Equipment Qualification Tracking Routes
 */

// Helper function to generate equipment qualification data with detailed IQ/OQ/PQ tracking
function generateEquipmentQualificationData() {
  // Mock equipment data with comprehensive qualification tracking
  const equipmentData = [
    {
      id: 'EQ-001',
      name: 'Tablet Press #1',
      type: 'Production Equipment',
      site: 'site-001',
      siteName: 'Main Manufacturing Facility',
      critical: true,
      qualification: {
        iq: { status: 'Complete', completedDate: '2024-03-15', expiryDate: '2027-03-15', score: 100 },
        oq: { status: 'Complete', completedDate: '2024-04-20', expiryDate: '2027-04-20', score: 100 },
        pq: { status: 'Complete', completedDate: '2024-05-25', expiryDate: '2027-05-25', score: 100 }
      },
      calibration: {
        lastDate: '2024-08-15',
        nextDue: '2025-02-15',
        status: 'Current',
        daysUntilDue: 150,
        vendor: 'CalTech Solutions'
      },
      maintenance: {
        lastDate: '2024-09-01',
        nextDue: '2025-01-15',
        status: 'Due Soon',
        daysUntilDue: 88
      },
      utilization: 82,
      status: 'Qualified',
      riskLevel: 'Low'
    },
    {
      id: 'EQ-002',
      name: 'Coating Pan A',
      type: 'Secondary Processing',
      site: 'site-001',
      siteName: 'Main Manufacturing Facility',
      critical: true,
      qualification: {
        iq: { status: 'Complete', completedDate: '2024-02-10', expiryDate: '2027-02-10', score: 100 },
        oq: { status: 'Complete', completedDate: '2024-03-18', expiryDate: '2027-03-18', score: 100 },
        pq: { status: 'Due Soon', completedDate: null, expiryDate: '2024-12-31', score: 95 }
      },
      calibration: {
        lastDate: '2024-06-10',
        nextDue: '2024-12-10',
        status: 'Due Soon',
        daysUntilDue: 25,
        vendor: 'Precision Instruments'
      },
      maintenance: {
        lastDate: '2024-08-20',
        nextDue: '2024-11-20',
        status: 'Current',
        daysUntilDue: 5
      },
      utilization: 65,
      status: 'Qualified',
      riskLevel: 'Medium'
    },
    {
      id: 'EQ-003',
      name: 'Blender Unit B2',
      type: 'Preparation Equipment',
      site: 'site-002',
      siteName: 'Secondary Production Site',
      critical: true,
      qualification: {
        iq: { status: 'Complete', completedDate: '2024-01-20', expiryDate: '2027-01-20', score: 100 },
        oq: { status: 'Complete', completedDate: '2024-02-25', expiryDate: '2027-02-25', score: 90 },
        pq: { status: 'Overdue', completedDate: null, expiryDate: '2024-09-01', score: 0 }
      },
      calibration: {
        lastDate: '2024-05-15',
        nextDue: '2024-09-15',
        status: 'Overdue',
        daysUntilDue: -3,
        vendor: 'Industrial Metrology'
      },
      maintenance: {
        lastDate: '2024-07-10',
        nextDue: '2024-11-20',
        status: 'Current',
        daysUntilDue: 5
      },
      utilization: 45,
      status: 'In Qualification',
      riskLevel: 'High'
    },
    {
      id: 'EQ-004',
      name: 'Fluid Bed Dryer C1',
      type: 'Drying Equipment',
      site: 'site-001',
      siteName: 'Main Manufacturing Facility',
      critical: false,
      qualification: {
        iq: { status: 'Complete', completedDate: '2024-06-01', expiryDate: '2027-06-01', score: 100 },
        oq: { status: 'In Progress', completedDate: null, expiryDate: '2024-12-15', score: 75 },
        pq: { status: 'Pending', completedDate: null, expiryDate: '2025-01-30', score: 0 }
      },
      calibration: {
        lastDate: '2024-07-20',
        nextDue: '2025-01-20',
        status: 'Current',
        daysUntilDue: 95,
        vendor: 'ThermoControl Systems'
      },
      maintenance: {
        lastDate: '2024-09-05',
        nextDue: '2025-03-05',
        status: 'Current',
        daysUntilDue: 140
      },
      utilization: 78,
      status: 'In Qualification',
      riskLevel: 'Medium'
    },
    {
      id: 'EQ-005',
      name: 'Capsule Filler #2',
      type: 'Production Equipment',
      site: 'site-002',
      siteName: 'Secondary Production Site',
      critical: true,
      qualification: {
        iq: { status: 'Complete', completedDate: '2024-04-10', expiryDate: '2027-04-10', score: 100 },
        oq: { status: 'Complete', completedDate: '2024-05-15', expiryDate: '2027-05-15', score: 100 },
        pq: { status: 'Complete', completedDate: '2024-06-20', expiryDate: '2027-06-20', score: 100 }
      },
      calibration: {
        lastDate: '2024-09-10',
        nextDue: '2025-03-10',
        status: 'Current',
        daysUntilDue: 125,
        vendor: 'Pharma Equipment Services'
      },
      maintenance: {
        lastDate: '2024-08-25',
        nextDue: '2024-12-25',
        status: 'Due Soon',
        daysUntilDue: 60
      },
      utilization: 91,
      status: 'Qualified',
      riskLevel: 'Low'
    },
    {
      id: 'EQ-006',
      name: 'Inspection Station Alpha',
      type: 'Quality Control',
      site: 'site-003',
      siteName: 'Contract Manufacturing',
      critical: false,
      qualification: {
        iq: { status: 'Pending', completedDate: null, expiryDate: '2025-01-15', score: 0 },
        oq: { status: 'Pending', completedDate: null, expiryDate: '2025-02-15', score: 0 },
        pq: { status: 'Pending', completedDate: null, expiryDate: '2025-03-15', score: 0 }
      },
      calibration: {
        lastDate: null,
        nextDue: '2025-01-01',
        status: 'Not Started',
        daysUntilDue: 35,
        vendor: 'QC Metrology Corp'
      },
      maintenance: {
        lastDate: null,
        nextDue: '2025-02-01',
        status: 'Not Started',
        daysUntilDue: 66
      },
      utilization: 0,
      status: 'Planned',
      riskLevel: 'Medium'
    }
  ];

  return equipmentData;
}

// GET /api/cmc/equipment/qualification
router.get('/equipment/qualification', async (req, res) => {
  try {
    const equipmentData = generateEquipmentQualificationData();
    
    // Calculate summary statistics
    const totalEquipment = equipmentData.length;
    const criticalEquipment = equipmentData.filter(eq => eq.critical).length;
    const qualifiedEquipment = equipmentData.filter(eq => eq.status === 'Qualified').length;
    const overdueQualifications = equipmentData.filter(eq => 
      eq.qualification.iq.status === 'Overdue' || 
      eq.qualification.oq.status === 'Overdue' || 
      eq.qualification.pq.status === 'Overdue'
    ).length;
    const overdueCalibrations = equipmentData.filter(eq => eq.calibration.status === 'Overdue').length;
    const dueSoonCalibrations = equipmentData.filter(eq => eq.calibration.status === 'Due Soon').length;
    
    // Group equipment by type
    const equipmentByType = equipmentData.reduce((acc, eq) => {
      if (!acc[eq.type]) {
        acc[eq.type] = [];
      }
      acc[eq.type].push(eq);
      return acc;
    }, {});

    // Group equipment by site
    const equipmentBySite = equipmentData.reduce((acc, eq) => {
      if (!acc[eq.site]) {
        acc[eq.site] = [];
      }
      acc[eq.site].push(eq);
      return acc;
    }, {});

    // Calculate risk summary
    const riskSummary = {
      high: equipmentData.filter(eq => eq.riskLevel === 'High').length,
      medium: equipmentData.filter(eq => eq.riskLevel === 'Medium').length,
      low: equipmentData.filter(eq => eq.riskLevel === 'Low').length
    };

    const response = {
      generatedAt: new Date().toISOString(),
      equipment: equipmentData,
      summary: {
        total: totalEquipment,
        critical: criticalEquipment,
        qualified: qualifiedEquipment,
        inQualification: equipmentData.filter(eq => eq.status === 'In Qualification').length,
        planned: equipmentData.filter(eq => eq.status === 'Planned').length,
        overdueQualifications,
        overdueCalibrations,
        dueSoonCalibrations
      },
      groupings: {
        byType: equipmentByType,
        bySite: equipmentBySite
      },
      riskSummary,
      qualificationMetrics: {
        iqComplete: equipmentData.filter(eq => eq.qualification.iq.status === 'Complete').length,
        oqComplete: equipmentData.filter(eq => eq.qualification.oq.status === 'Complete').length,
        pqComplete: equipmentData.filter(eq => eq.qualification.pq.status === 'Complete').length,
        averageIqScore: Math.round(equipmentData.reduce((sum, eq) => sum + eq.qualification.iq.score, 0) / totalEquipment),
        averageOqScore: Math.round(equipmentData.reduce((sum, eq) => sum + eq.qualification.oq.score, 0) / totalEquipment),
        averagePqScore: Math.round(equipmentData.reduce((sum, eq) => sum + eq.qualification.pq.score, 0) / totalEquipment)
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching equipment qualification data:', error);
    res.status(500).json({ error: 'Failed to fetch equipment qualification data' });
  }
});

// POST /api/cmc/equipment/risk-alert
router.post('/equipment/risk-alert', async (req, res) => {
  try {
    const { equipmentIds, alertType = 'qualification' } = req.body || {};
    
    const equipmentData = generateEquipmentQualificationData();
    const targetEquipment = equipmentIds 
      ? equipmentData.filter(eq => equipmentIds.includes(eq.id))
      : equipmentData;

    // Generate EQP-075 AI rule alerts based on qualification and calibration status
    const alerts = [];
    
    targetEquipment.forEach(equipment => {
      const riskFactors = [];
      let severity = 'Low';
      let priority = 'Medium';

      // Check IQ/OQ/PQ status
      if (equipment.qualification.iq.status === 'Overdue') {
        riskFactors.push('IQ qualification overdue');
        severity = 'High';
        priority = 'Critical';
      }
      if (equipment.qualification.oq.status === 'Overdue') {
        riskFactors.push('OQ qualification overdue');
        severity = 'High';
        priority = 'Critical';
      }
      if (equipment.qualification.pq.status === 'Overdue') {
        riskFactors.push('PQ qualification overdue');
        severity = 'High';
        priority = 'Critical';
      }

      // Check qualification due soon
      if (equipment.qualification.iq.status === 'Due Soon' || 
          equipment.qualification.oq.status === 'Due Soon' || 
          equipment.qualification.pq.status === 'Due Soon') {
        riskFactors.push('Qualification renewal due within 30 days');
        if (severity !== 'High') severity = 'Medium';
      }

      // Check calibration status
      if (equipment.calibration.status === 'Overdue') {
        riskFactors.push('Calibration overdue');
        severity = 'High';
        priority = 'Critical';
      } else if (equipment.calibration.status === 'Due Soon') {
        riskFactors.push('Calibration due within 30 days');
        if (severity !== 'High') severity = 'Medium';
      }

      // Check critical equipment status
      if (equipment.critical && equipment.status !== 'Qualified') {
        riskFactors.push('Critical equipment not fully qualified');
        if (severity !== 'High') severity = 'Medium';
        if (priority === 'Medium') priority = 'High';
      }

      // Check utilization vs qualification status
      if (equipment.utilization > 50 && equipment.status !== 'Qualified') {
        riskFactors.push('High utilization equipment with incomplete qualification');
        if (severity !== 'High') severity = 'Medium';
      }

      // Generate alert if risk factors exist
      if (riskFactors.length > 0) {
        const alert = {
          id: `EQP-075-${equipment.id}-${Date.now()}`,
          ruleId: 'EQP-075',
          ruleName: 'Equipment Qualification Risk Assessment',
          equipmentId: equipment.id,
          equipmentName: equipment.name,
          equipmentType: equipment.type,
          site: equipment.siteName,
          critical: equipment.critical,
          severity,
          priority,
          riskFactors,
          recommendedActions: generateRecommendedActions(equipment, riskFactors),
          impactAssessment: generateImpactAssessment(equipment, riskFactors),
          regulatoryImplications: generateRegulatoryImplications(equipment, riskFactors),
          timeline: generateActionTimeline(severity, priority),
          generatedAt: new Date().toISOString(),
          status: 'Active',
          assignee: null,
          dueDate: calculateDueDate(severity, priority)
        };
        
        alerts.push(alert);
      }
    });

    // Sort alerts by priority and severity
    alerts.sort((a, b) => {
      const priorityOrder = { 'Critical': 3, 'High': 2, 'Medium': 1, 'Low': 0 };
      const severityOrder = { 'High': 2, 'Medium': 1, 'Low': 0 };
      
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      const aSeverity = severityOrder[a.severity] || 0;
      const bSeverity = severityOrder[b.severity] || 0;
      
      if (aPriority !== bPriority) return bPriority - aPriority;
      return bSeverity - aSeverity;
    });

    const response = {
      generatedAt: new Date().toISOString(),
      ruleId: 'EQP-075',
      ruleName: 'Equipment Qualification Risk Assessment',
      alertType,
      totalAlerts: alerts.length,
      alerts,
      summary: {
        critical: alerts.filter(a => a.priority === 'Critical').length,
        high: alerts.filter(a => a.priority === 'High').length,
        medium: alerts.filter(a => a.priority === 'Medium').length,
        low: alerts.filter(a => a.priority === 'Low').length,
        equipmentAffected: [...new Set(alerts.map(a => a.equipmentId))].length,
        criticalEquipmentAffected: alerts.filter(a => a.critical).length
      },
      recommendations: {
        immediate: alerts.filter(a => a.priority === 'Critical').map(a => ({
          equipmentId: a.equipmentId,
          action: a.recommendedActions[0] || 'Immediate attention required'
        })),
        shortTerm: alerts.filter(a => a.priority === 'High').map(a => ({
          equipmentId: a.equipmentId,
          action: 'Schedule qualification/calibration activities'
        })),
        planning: alerts.filter(a => a.priority === 'Medium').map(a => ({
          equipmentId: a.equipmentId,
          action: 'Include in next maintenance cycle'
        }))
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating equipment risk alerts:', error);
    res.status(500).json({ error: 'Failed to generate equipment risk alerts' });
  }
});

// Helper functions for risk alert generation
function generateRecommendedActions(equipment, riskFactors) {
  const actions = [];
  
  if (riskFactors.includes('IQ qualification overdue')) {
    actions.push('Execute IQ protocol immediately - verify installation and documentation');
  }
  if (riskFactors.includes('OQ qualification overdue')) {
    actions.push('Execute OQ protocol - verify operational parameters and alarms');
  }
  if (riskFactors.includes('PQ qualification overdue')) {
    actions.push('Execute PQ protocol - demonstrate process capability under routine conditions');
  }
  if (riskFactors.includes('Calibration overdue')) {
    actions.push(`Schedule calibration with ${equipment.calibration.vendor} within 48 hours`);
  }
  if (riskFactors.includes('Qualification renewal due within 30 days')) {
    actions.push('Schedule qualification renewal activities and prepare protocol documents');
  }
  if (riskFactors.includes('Critical equipment not fully qualified')) {
    actions.push('Restrict equipment use to development activities until fully qualified');
  }
  
  return actions.length > 0 ? actions : ['Review equipment status and update qualification plan'];
}

function generateImpactAssessment(equipment, riskFactors) {
  let productionImpact = 'Minimal';
  let qualityRisk = 'Low';
  let complianceRisk = 'Low';
  
  if (equipment.critical) {
    if (riskFactors.some(rf => rf.includes('overdue'))) {
      productionImpact = 'High';
      qualityRisk = 'High';
      complianceRisk = 'High';
    } else if (riskFactors.some(rf => rf.includes('due within'))) {
      productionImpact = 'Medium';
      qualityRisk = 'Medium';
      complianceRisk = 'Medium';
    }
  }
  
  return {
    productionImpact,
    qualityRisk,
    complianceRisk,
    utilizationAffected: `${equipment.utilization}% capacity at risk`,
    businessContinuity: equipment.critical ? 'Critical path equipment' : 'Supporting equipment'
  };
}

function generateRegulatoryImplications(equipment, riskFactors) {
  const implications = [];
  
  if (riskFactors.some(rf => rf.includes('overdue'))) {
    implications.push('FDA 483 observation risk - equipment not maintained in validated state');
    implications.push('EMA non-compliance - GMP Annex 15 qualification requirements');
  }
  
  if (equipment.critical && riskFactors.length > 0) {
    implications.push('Critical process equipment - heightened regulatory scrutiny expected');
  }
  
  implications.push('CTD 3.2.P.3.3 documentation may be questioned during PAI');
  
  return implications;
}

function generateActionTimeline(severity, priority) {
  if (priority === 'Critical') {
    return {
      immediate: '0-24 hours: Stop production, assess impact, initiate corrective action',
      shortTerm: '1-7 days: Complete qualification/calibration activities',
      longTerm: '1-4 weeks: Verify effectiveness and update procedures'
    };
  } else if (priority === 'High') {
    return {
      immediate: '0-48 hours: Assess risk and plan intervention',
      shortTerm: '1-2 weeks: Execute qualification/calibration activities', 
      longTerm: '2-6 weeks: Complete documentation and review'
    };
  } else {
    return {
      immediate: '0-7 days: Plan and schedule activities',
      shortTerm: '1-4 weeks: Execute planned activities',
      longTerm: '1-3 months: Monitor and maintain compliance'
    };
  }
}

function calculateDueDate(severity, priority) {
  const now = new Date();
  let daysToAdd;
  
  if (priority === 'Critical') daysToAdd = 1;
  else if (priority === 'High') daysToAdd = 7;
  else if (priority === 'Medium') daysToAdd = 14;
  else daysToAdd = 30;
  
  const dueDate = new Date(now);
  dueDate.setDate(now.getDate() + daysToAdd);
  return dueDate.toISOString();
}

/**
 * Equipment Qualification & Risk Management Routes
 */

// GET /api/cmc/equipment/qualification
router.get('/equipment/qualification', async (req, res) => {
  try {
    const equipment = [
      { 
        id: 'EQ-001', 
        name: 'Mixer MX-400', 
        type: 'Critical', 
        site: 'Site A',
        iq: { status: 'Complete', date: '2024-01-15', nextReview: '2026-01-15' },
        oq: { status: 'Complete', date: '2024-02-20', nextReview: '2026-02-20' },
        pq: { status: 'Complete', date: '2024-03-10', nextReview: '2026-03-10' },
        calibration: { lastDate: '2024-11-01', nextDue: '2025-11-01', status: 'Current' }
      },
      { 
        id: 'EQ-002', 
        name: 'Tablet Press TP-500', 
        type: 'Critical', 
        site: 'Site A',
        iq: { status: 'Complete', date: '2023-12-01', nextReview: '2025-12-01' },
        oq: { status: 'Complete', date: '2024-01-05', nextReview: '2026-01-05' },
        pq: { status: 'Overdue', date: '2023-11-15', nextReview: '2024-11-15' },
        calibration: { lastDate: '2024-06-15', nextDue: '2024-12-15', status: 'Due Soon' }
      },
      { 
        id: 'EQ-003', 
        name: 'Coating Pan CP-200', 
        type: 'Non-Critical', 
        site: 'Site B',
        iq: { status: 'Complete', date: '2024-05-10', nextReview: '2026-05-10' },
        oq: { status: 'In Progress', date: null, nextReview: '2025-06-01' },
        pq: { status: 'Pending', date: null, nextReview: '2025-07-01' },
        calibration: { lastDate: '2024-09-20', nextDue: '2025-09-20', status: 'Current' }
      }
    ];
    res.json({ equipment });
  } catch (error) {
    console.error('Error fetching equipment qualification:', error);
    res.status(500).json({ error: 'Failed to fetch equipment qualification' });
  }
});

// POST /api/cmc/equipment/risk-alert  
router.post('/equipment/risk-alert', async (req, res) => {
  try {
    const alerts = [
      {
        id: 'EQP-075-001',
        equipment: 'EQ-002',
        name: 'Tablet Press TP-500', 
        type: 'PQ Overdue',
        severity: 'High',
        message: 'Performance Qualification overdue by 30+ days - PAI risk',
        recommendation: 'Complete PQ immediately before production use',
        ctdSection: '3.2.P.3.3'
      },
      {
        id: 'EQP-075-002', 
        equipment: 'EQ-002',
        name: 'Tablet Press TP-500',
        type: 'Calibration Due',
        severity: 'Medium', 
        message: 'Calibration due within 30 days',
        recommendation: 'Schedule calibration to avoid production impact',
        ctdSection: '3.2.P.3.3'
      }
    ];
    res.json({ alerts });
  } catch (error) {
    console.error('Error generating equipment risk alerts:', error);
    res.status(500).json({ error: 'Failed to generate risk alerts' });
  }
});

/**
 * Digital Twin PAR & Control Strategy Routes
 */

// GET /api/cmc/digital-twin/parameters
router.get('/digital-twin/parameters', async (req, res) => {
  try {
    const parameters = {
      unitOperations: [
        {
          id: 'OP-001',
          name: 'Mixing',
          parameters: [
            { 
              id: 'MIX-SPEED', 
              name: 'Mixing Speed', 
              current: 285, 
              target: 300, 
              par: { min: 250, max: 350 }, 
              unit: 'rpm',
              status: 'In Range'
            },
            { 
              id: 'MIX-TIME', 
              name: 'Mixing Time', 
              current: 22, 
              target: 20, 
              par: { min: 15, max: 25 }, 
              unit: 'min',
              status: 'In Range' 
            }
          ]
        },
        {
          id: 'OP-002', 
          name: 'Compression',
          parameters: [
            { 
              id: 'COMP-FORCE', 
              name: 'Compression Force', 
              current: 18.5, 
              target: 18.0, 
              par: { min: 15.0, max: 20.0 }, 
              unit: 'kN',
              status: 'Near Edge'
            }
          ]
        }
      ]
    };
    res.json(parameters);
  } catch (error) {
    console.error('Error fetching digital twin parameters:', error);
    res.status(500).json({ error: 'Failed to fetch parameters' });
  }
});

// POST /api/cmc/digital-twin/simulate
router.post('/digital-twin/simulate', async (req, res) => {
  try {
    const { parameterId, newValue } = req.body;
    const recommendation = {
      parameterId,
      newValue,
      withinPAR: newValue >= 15.0 && newValue <= 20.0,
      recommendation: newValue < 15.0 || newValue > 20.0 
        ? 'Parameter outside PAR - Change Control and PPQ addendum required'
        : 'Parameter within PAR - simulation acceptable',
      actions: newValue < 15.0 || newValue > 20.0 
        ? ['File Change Control', 'Update PAR justification', 'Plan PPQ addendum']
        : ['Log simulation', 'No regulatory action needed']
    };
    res.json(recommendation);
  } catch (error) {
    console.error('Error processing simulation:', error);
    res.status(500).json({ error: 'Failed to process simulation' });
  }
});

/**
 * CPP-CQA Matrix & Control Strategy Routes  
 */

// GET /api/cmc/cpp-cqa/matrix
router.get('/cpp-cqa/matrix', async (req, res) => {
  try {
    const matrix = {
      cpp: ['Mixing Speed', 'Mixing Time', 'Compression Force', 'Temperature'],
      cqa: ['Assay', 'Dissolution', 'Hardness', 'Friability'],
      relationships: [
        { cpp: 'Mixing Speed', cqa: 'Assay', strength: 'High', justified: true },
        { cpp: 'Mixing Speed', cqa: 'Dissolution', strength: 'Medium', justified: true },
        { cpp: 'Compression Force', cqa: 'Hardness', strength: 'High', justified: true },
        { cpp: 'Compression Force', cqa: 'Friability', strength: 'Medium', justified: false }
      ],
      gaps: [
        { cpp: 'Temperature', cqa: 'Dissolution', missing: true, aiSuggestion: 'Temperature affects API solubility - recommend DoE study' }
      ]
    };
    res.json(matrix);
  } catch (error) {
    console.error('Error fetching CPP-CQA matrix:', error);
    res.status(500).json({ error: 'Failed to fetch matrix' });
  }
});

// POST /api/cmc/cpp-cqa/control-strategy
router.post('/cpp-cqa/control-strategy', async (req, res) => {
  try {
    const strategy = {
      monitoring: [
        { parameter: 'Mixing Speed', method: 'Continuous', frequency: 'Real-time', alertLevel: '±5%' },
        { parameter: 'Compression Force', method: 'In-process', frequency: 'Every tablet', alertLevel: '±10%' }
      ],
      alarms: [
        { parameter: 'Mixing Speed', condition: 'Outside PAR', action: 'Stop batch, investigate' },
        { parameter: 'Compression Force', condition: '>20.5 kN', action: 'Adjust force, continue' }
      ],
      ctdMapping: '3.2.P.3.4'
    };
    res.json(strategy);
  } catch (error) {
    console.error('Error generating control strategy:', error);
    res.status(500).json({ error: 'Failed to generate control strategy' });
  }
});

/**
 * Supply Risk & BOM Management Routes
 */

// GET /api/cmc/supply/risk-assessment
router.get('/supply/risk-assessment', async (req, res) => {
  try {
    const bomItems = [
      { 
        id: 'MAT-001', 
        name: 'API XYZ-123', 
        supplier: 'Pharma Corp', 
        riskLevel: 'High',
        qualityScore: 65,
        onTimeDelivery: 78,
        singleSource: true,
        alternates: ['ChemCorp Inc', 'Global Pharma Ltd']
      },
      { 
        id: 'MAT-002', 
        name: 'Microcrystalline Cellulose', 
        supplier: 'Excipient Solutions', 
        riskLevel: 'Low',
        qualityScore: 95,
        onTimeDelivery: 98,
        singleSource: false,
        alternates: ['Cellulose Pro', 'Pure Excipients']
      },
      { 
        id: 'MAT-003', 
        name: 'Magnesium Stearate', 
        supplier: 'Chemical Partners', 
        riskLevel: 'Medium',
        qualityScore: 82,
        onTimeDelivery: 85,
        singleSource: false,
        alternates: ['MagStearate Co']
      }
    ];
    res.json({ bomItems });
  } catch (error) {
    console.error('Error fetching supply risk assessment:', error);
    res.status(500).json({ error: 'Failed to fetch supply risk assessment' });
  }
});

// POST /api/cmc/supply/find-alternates
router.post('/supply/find-alternates', async (req, res) => {
  try {
    const { materialId } = req.body;
    const alternatives = [
      { 
        supplier: 'Backup Pharma Inc', 
        qualityScore: 88, 
        leadTime: '4 weeks',
        costImpact: '+15%',
        qualification: 'Required' 
      },
      { 
        supplier: 'Alternative Corp', 
        qualityScore: 85, 
        leadTime: '6 weeks',
        costImpact: '+8%',
        qualification: 'In Progress' 
      }
    ];
    res.json({ alternatives });
  } catch (error) {
    console.error('Error finding alternates:', error);
    res.status(500).json({ error: 'Failed to find alternates' });
  }
});

/**
 * MBR Versioning & EBR Routes
 */

// GET /api/cmc/mbr/versions
router.get('/mbr/versions', async (req, res) => {
  try {
    const versions = [
      { 
        version: 'v2.1', 
        status: 'Current', 
        approvedBy: ['QA Director', 'Regulatory Manager'],
        approvedDate: '2024-09-15',
        changes: 'Updated mixing time from 20min to 25min'
      },
      { 
        version: 'v2.0', 
        status: 'Superseded', 
        approvedBy: ['QA Director', 'Regulatory Manager'],
        approvedDate: '2024-08-01',
        changes: 'Changed compression force range'
      },
      { 
        version: 'v1.9', 
        status: 'Superseded', 
        approvedBy: ['QA Director'],
        approvedDate: '2024-06-15',
        changes: 'Initial validated version'
      }
    ];
    res.json({ versions });
  } catch (error) {
    console.error('Error fetching MBR versions:', error);
    res.status(500).json({ error: 'Failed to fetch MBR versions' });
  }
});

// GET /api/cmc/ebr/timeline
router.get('/ebr/timeline', async (req, res) => {
  try {
    const timeline = [
      { 
        batchId: 'BT-2024-089', 
        step: 'Dispensing', 
        operator: 'J.Smith', 
        timestamp: '2024-09-18T08:00:00Z',
        status: 'Complete',
        duration: '45 min'
      },
      { 
        batchId: 'BT-2024-089', 
        step: 'Mixing', 
        operator: 'M.Johnson', 
        timestamp: '2024-09-18T09:00:00Z',
        status: 'Complete',
        duration: '25 min'
      },
      { 
        batchId: 'BT-2024-089', 
        step: 'Compression', 
        operator: 'R.Davis', 
        timestamp: '2024-09-18T10:30:00Z',
        status: 'In Progress',
        duration: null
      }
    ];
    res.json({ timeline });
  } catch (error) {
    console.error('Error fetching EBR timeline:', error);
    res.status(500).json({ error: 'Failed to fetch EBR timeline' });
  }
});

/**
 * CPV Control Charts Routes
 */

// GET /api/cmc/cpv/control-charts
router.get('/cpv/control-charts', async (req, res) => {
  try {
    const controlCharts = {
      parameters: [
        {
          name: 'Tablet Hardness',
          unit: 'kP',
          target: 100,
          ucl: 120,
          lcl: 80,
          data: [95, 102, 98, 105, 97, 103, 99, 101, 96, 104],
          cpk: 1.45,
          status: 'In Control'
        },
        {
          name: 'Dissolution Rate',
          unit: '%',
          target: 85,
          ucl: 95,
          lcl: 75,
          data: [82, 87, 89, 84, 86, 88, 83, 85, 87, 90],
          cpk: 1.28,
          status: 'In Control'
        },
        {
          name: 'Assay',
          unit: '%',
          target: 100,
          ucl: 105,
          lcl: 95,
          data: [98, 101, 99, 102, 97, 100, 103, 98, 101, 99],
          cpk: 1.67,
          status: 'In Control'
        }
      ]
    };
    res.json(controlCharts);
  } catch (error) {
    console.error('Error fetching CPV control charts:', error);
    res.status(500).json({ error: 'Failed to fetch control charts' });
  }
});

/**
 * AI RCA & CAPA Routes
 */

// POST /api/cmc/deviation/ai-rca
router.post('/deviation/ai-rca', async (req, res) => {
  try {
    const { deviationId, description } = req.body;
    const rcaAnalysis = {
      ishikawa: {
        manpower: ['Operator training gap', 'Insufficient staffing during shift change'],
        machine: ['Tablet press calibration drift', 'Worn compression tooling'],
        material: ['API particle size variation', 'Excipient moisture content'],
        method: ['SOP ambiguity on compression force', 'Inadequate in-process controls'],
        environment: ['Temperature fluctuation in compression room'],
        measurement: ['Hardness tester out of calibration']
      },
      fiveWhys: [
        { question: 'Why did tablets fail hardness test?', answer: 'Compression force was too low' },
        { question: 'Why was compression force too low?', answer: 'Operator set wrong parameter' },
        { question: 'Why did operator set wrong parameter?', answer: 'SOP was unclear' },
        { question: 'Why was SOP unclear?', answer: 'Recent process change not updated in SOP' },
        { question: 'Why was SOP not updated?', answer: 'Change control process missed this step' }
      ],
      probableRootCause: 'Change control process did not include SOP update requirement',
      recommendedActions: [
        { type: 'CAPA', action: 'Revise change control SOP to mandate documentation updates', priority: 'High' },
        { type: 'Training', action: 'Retrain all operators on compression parameters', priority: 'Medium' },
        { type: 'Process', action: 'Implement additional in-process hardness checks', priority: 'Medium' }
      ]
    };
    res.json(rcaAnalysis);
  } catch (error) {
    console.error('Error generating AI RCA:', error);
    res.status(500).json({ error: 'Failed to generate RCA analysis' });
  }
});

// GET /api/cmc/change-control/status
router.get('/change-control/status', async (req, res) => {
  try {
    const changeControls = [
      {
        id: 'CC-2024-015',
        title: 'Update mixing time in MBR v2.1',
        status: 'Approved',
        impactedSections: ['3.2.P.3.3', '3.2.P.3.5'],
        approvals: [
          { role: 'QA Director', name: 'A.Wilson', date: '2024-09-10', status: 'Approved' },
          { role: 'Regulatory Manager', name: 'S.Brown', date: '2024-09-12', status: 'Approved' }
        ]
      },
      {
        id: 'CC-2024-016',
        title: 'Compression force PAR adjustment',
        status: 'Pending Approval',
        impactedSections: ['3.2.P.3.4'],
        approvals: [
          { role: 'QA Director', name: 'A.Wilson', date: null, status: 'Pending' },
          { role: 'Regulatory Manager', name: 'S.Brown', date: null, status: 'Pending' }
        ]
      }
    ];
    res.json({ changeControls });
  } catch (error) {
    console.error('Error fetching change control status:', error);
    res.status(500).json({ error: 'Failed to fetch change control status' });
  }
});

// AI RCA with Ishikawa + 5-Whys Analysis
router.post('/rca/generate', async (req, res) => {
  try {
    const { deviationId, description, category } = req.body;
    
    // Generate Ishikawa categories based on the deviation
    const ishikawaData = {
      manpower: [
        'Operator training gap in ' + (category || 'process area'),
        'Insufficient staffing during shift change',
        'Lack of experience with new equipment',
        'Communication breakdown between shifts'
      ],
      machine: [
        'Equipment calibration drift detected',
        'Worn compression tooling beyond limits',
        'Inadequate preventive maintenance schedule',
        'Control system software glitch'
      ],
      material: [
        'API particle size variation outside specs',
        'Excipient moisture content deviation',
        'Raw material storage condition issues',
        'Vendor quality deviation from CoA'
      ],
      method: [
        'SOP ambiguity on critical parameters',
        'Inadequate in-process controls',
        'Process parameter drift not detected',
        'Missing validation for process change'
      ],
      environment: [
        'Temperature fluctuation in manufacturing area',
        'Humidity control system malfunction',
        'Airflow pattern disruption',
        'Contamination risk from facility change'
      ],
      measurement: [
        'Analytical instrument out of calibration',
        'Test method precision issues',
        'Sampling procedure not followed',
        'Data integrity concerns in results'
      ]
    };

    // Generate 5-Whys analysis
    const fiveWhysAnalysis = [
      { 
        step: 1,
        question: 'Why did the ' + (description || 'deviation') + ' occur?', 
        answer: 'Process parameter exceeded acceptable range during production' 
      },
      { 
        step: 2,
        question: 'Why did the process parameter exceed the acceptable range?', 
        answer: 'Operator followed outdated SOP with incorrect parameter settings' 
      },
      { 
        step: 3,
        question: 'Why was the operator following an outdated SOP?', 
        answer: 'Recent change control implementation did not update all related SOPs' 
      },
      { 
        step: 4,
        question: 'Why did change control miss updating related SOPs?', 
        answer: 'Change control procedure lacks systematic cross-reference checking' 
      },
      { 
        step: 5,
        question: 'Why does the change control procedure lack systematic checking?', 
        answer: 'Process was designed before implementing digital document management system' 
      }
    ];

    // Generate CAPA recommendations
    const capaRecommendations = [
      {
        id: `CAPA-${Date.now()}-001`,
        type: 'Corrective',
        priority: 'High',
        action: 'Update change control procedure to include systematic SOP cross-referencing',
        assignee: 'QA Manager',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ctdSection: '3.2.P.3.5'
      },
      {
        id: `CAPA-${Date.now()}-002`,
        type: 'Preventive',
        priority: 'Medium',
        action: 'Implement automated SOP version control with change control integration',
        assignee: 'IT Systems Manager',
        dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ctdSection: '3.2.P.3.3'
      },
      {
        id: `CAPA-${Date.now()}-003`,
        type: 'Verification',
        priority: 'Medium',
        action: 'Retrain all operators on current SOP versions and parameter settings',
        assignee: 'Training Coordinator',
        dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ctdSection: '3.2.P.3.3'
      }
    ];

    const response = {
      deviationId,
      generatedAt: new Date().toISOString(),
      ishikawa: ishikawaData,
      fiveWhys: fiveWhysAnalysis,
      rootCauseAnalysis: {
        probableRootCause: 'Change control procedure lacks systematic cross-reference checking for related SOPs',
        confidenceLevel: 85,
        evidenceStrength: 'Strong',
        riskLevel: 'Medium'
      },
      capaRecommendations,
      regulatoryImpact: {
        ctdSections: ['3.2.P.3.3', '3.2.P.3.5'],
        reportingRequired: true,
        inspectionRisk: 'Medium',
        recommendedTimeline: '30 days for corrective actions'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating AI RCA:', error);
    res.status(500).json({ error: 'Failed to generate RCA analysis' });
  }
});

// Packaging Region Presets
router.get('/packaging/regions', async (req, res) => {
  try {
    const regionPresets = {
      'US': {
        name: 'United States',
        regulations: ['FDA 21 CFR 207.37', 'UDI Requirements'],
        labeling: {
          required: ['NDC', 'UDI', 'Lot Number', 'Expiry Date'],
          format: 'US Standard',
          barcodeType: 'GS1 DataMatrix',
          language: 'English'
        },
        serialization: {
          required: true,
          format: 'DSCSA',
          aggregation: 'Case/Pallet Level',
          reportingEndpoint: 'FDA DSCSA'
        },
        template: {
          primaryLabel: '{{productName}}\n{{strength}} {{dosageForm}}\nNDC: {{ndc}}\nLot: {{lotNumber}}\nExp: {{expiryDate}}\nUDI: {{udi}}',
          variables: ['productName', 'strength', 'dosageForm', 'ndc', 'lotNumber', 'expiryDate', 'udi']
        }
      },
      'EU': {
        name: 'European Union',
        regulations: ['EU FMD Directive 2011/62/EU', 'GS1 Standards'],
        labeling: {
          required: ['Marketing Authorization Number', 'Batch Number', 'Expiry Date', '2D DataMatrix'],
          format: 'EU FMD',
          barcodeType: 'GS1 DataMatrix',
          language: 'Local Language + English'
        },
        serialization: {
          required: true,
          format: 'EU FMD',
          aggregation: 'Pack Level',
          reportingEndpoint: 'EMVS Hub'
        },
        template: {
          primaryLabel: '{{productName}}\n{{strength}} {{dosageForm}}\nMA: {{maNumber}}\nBatch: {{batchNumber}}\nExp: {{expiryDate}}\n[2D DataMatrix Code]',
          variables: ['productName', 'strength', 'dosageForm', 'maNumber', 'batchNumber', 'expiryDate']
        }
      },
      'JP': {
        name: 'Japan',
        regulations: ['J-GMP', 'PMDA Requirements'],
        labeling: {
          required: ['Approval Number', 'Lot Number', 'Expiry Date', 'Japanese Text'],
          format: 'Japanese Standard',
          barcodeType: 'GS1-128',
          language: 'Japanese + English'
        },
        serialization: {
          required: false,
          format: 'Optional',
          aggregation: 'Not Required',
          reportingEndpoint: 'N/A'
        },
        template: {
          primaryLabel: '{{productNameJp}}\n{{productName}}\n{{strength}} {{dosageForm}}\n承認番号: {{approvalNumber}}\nロット: {{lotNumber}}\n有効期限: {{expiryDate}}',
          variables: ['productNameJp', 'productName', 'strength', 'dosageForm', 'approvalNumber', 'lotNumber', 'expiryDate']
        }
      }
    };

    res.json(regionPresets);
  } catch (error) {
    console.error('Error fetching packaging regions:', error);
    res.status(500).json({ error: 'Failed to fetch packaging regions' });
  }
});

// Generate packaging labels with region-specific variables
router.post('/packaging/generate-labels', async (req, res) => {
  try {
    const { region, variables, productInfo } = req.body;
    
    // Mock label generation with variable injection
    const generatedLabels = {
      region,
      generatedAt: new Date().toISOString(),
      labels: [
        {
          type: 'Primary',
          content: variables.primaryLabel || 'Generated primary label content',
          format: 'PDF',
          compliance: `${region} Compliant`,
          variables: variables
        },
        {
          type: 'Secondary',
          content: 'Generated secondary packaging label',
          format: 'PDF',
          compliance: `${region} Compliant`,
          variables: variables
        }
      ],
      barcodes: [
        {
          type: region === 'US' ? 'UDI DataMatrix' : region === 'EU' ? 'FMD DataMatrix' : 'GS1-128',
          data: variables.serialNumber || 'SAMPLE123456',
          format: 'SVG'
        }
      ],
      validation: {
        complianceCheck: true,
        requiredFields: true,
        formatValid: true,
        regulatoryCompliant: true
      }
    };

    res.json(generatedLabels);
  } catch (error) {
    console.error('Error generating labels:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});

// Deficiency Letter Simulator
router.post('/deficiency/simulate', async (req, res) => {
  try {
    const { submissionType, agency, severity } = req.body;
    
    const agencyTemplates = {
      'FDA': {
        letterhead: 'U.S. Food and Drug Administration\nCenter for Drug Evaluation and Research',
        deficiencies: [
          {
            id: 'DEF-001',
            section: '3.2.P.3.3',
            category: 'Manufacturing Process',
            finding: 'The manufacturing process description lacks sufficient detail regarding in-process controls for the compression step. Provide additional information on monitoring parameters and acceptance criteria.',
            severity: 'Major',
            recommendation: 'Submit detailed IPC procedures and historical data demonstrating process control.'
          },
          {
            id: 'DEF-002', 
            section: '3.2.P.3.5',
            category: 'Process Validation',
            finding: 'Process validation study does not demonstrate adequate process capability (Cp < 1.33 for critical quality attributes). Additional validation runs may be required.',
            severity: 'Major',
            recommendation: 'Provide additional PPQ data or process improvements to achieve acceptable Cpk values.'
          },
          {
            id: 'DEF-003',
            section: '3.2.P.7',
            category: 'Container Closure',
            finding: 'Extractables and leachables study timeline is insufficient for proposed shelf life. Extend study duration or provide scientific justification.',
            severity: 'Minor',
            recommendation: 'Submit extended E&L study data or provide toxicological assessment.'
          }
        ]
      },
      'EMA': {
        letterhead: 'European Medicines Agency\nCommittee for Medicinal Products for Human Use',
        deficiencies: [
          {
            id: 'DEF-001',
            section: '3.2.P.2.1',
            category: 'Drug Product Composition',
            finding: 'Overages for the active substance are not adequately justified. Provide scientific rationale for the proposed overage or revise formulation.',
            severity: 'Major',
            recommendation: 'Submit stability data supporting overage or reformulate without overage.'
          },
          {
            id: 'DEF-002',
            section: '3.2.P.3.4',
            category: 'Control of Critical Steps',
            finding: 'The control strategy does not adequately address all identified critical process parameters. Enhance process control measures.',
            severity: 'Major',
            recommendation: 'Provide enhanced control strategy with real-time monitoring capabilities.'
          }
        ]
      },
      'PMDA': {
        letterhead: 'Pharmaceuticals and Medical Devices Agency\nRegulatory Review Department',
        deficiencies: [
          {
            id: 'DEF-001',
            section: '3.2.P.5.6',
            category: 'Specifications',
            finding: 'Acceptance criteria for dissolution test should be tightened based on clinical batch data. Current limits may not ensure consistent bioavailability.',
            severity: 'Major',
            recommendation: 'Revise dissolution specifications based on clinical and commercial batch data.'
          }
        ]
      }
    };

    const template = agencyTemplates[agency] || agencyTemplates['FDA'];
    const selectedDeficiencies = template.deficiencies.filter(d => 
      severity === 'All' || d.severity === severity
    );

    const deficiencyLetter = {
      agency,
      letterhead: template.letterhead,
      submissionType,
      issueDate: new Date().toISOString().split('T')[0],
      subject: `Deficiency Letter - ${submissionType} Submission`,
      deficiencies: selectedDeficiencies,
      responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      contactInfo: {
        reviewTeam: `${agency} Review Team`,
        email: `review@${agency.toLowerCase()}.gov`,
        phone: '+1-XXX-XXX-XXXX'
      }
    };

    res.json(deficiencyLetter);
  } catch (error) {
    console.error('Error simulating deficiency letter:', error);
    res.status(500).json({ error: 'Failed to simulate deficiency letter' });
  }
});

// Draft Response Editor for Deficiency Letters
router.post('/deficiency/draft-response', async (req, res) => {
  try {
    const { deficiencyId, proposedResponse, supportingData } = req.body;
    
    const draftResponse = {
      deficiencyId,
      generatedAt: new Date().toISOString(),
      response: {
        summary: proposedResponse,
        detailedResponse: `Thank you for your review of our submission. We have carefully considered your comment regarding ${deficiencyId} and provide the following response:\n\n${proposedResponse}\n\nWe believe this addresses your concern and look forward to your continued review.`,
        supportingDocuments: supportingData || [],
        proposedTimeline: '30 days',
        regulatoryStrategy: 'Submit comprehensive response with additional data as requested'
      },
      aiRecommendations: [
        'Consider including historical batch data to support response',
        'Reference relevant ICH guidelines in justification',
        'Provide comparative analysis with approved products if applicable'
      ],
      riskAssessment: {
        approvabilityImpact: 'Medium',
        timelineImpact: 'Low',
        additionalStudiesNeeded: false
      }
    };

    res.json(draftResponse);
  } catch (error) {
    console.error('Error generating draft response:', error);
    res.status(500).json({ error: 'Failed to generate draft response' });
  }
});

// Tech Transfer Delta Matrix
router.get('/tech-transfer/delta-matrix', async (req, res) => {
  try {
    const deltaMatrix = {
      generatedAt: new Date().toISOString(),
      comparisonSites: [
        {
          id: 'site-001',
          name: 'Main Manufacturing (US)',
          status: 'Reference Site',
          equipmentSuite: 'Fette 3090, Coating Pan A',
          batchSize: '150kg',
          qualificationStatus: 'Complete'
        },
        {
          id: 'site-002', 
          name: 'European Facility (EU)',
          status: 'Receiving Site',
          equipmentSuite: 'Korsch XL200, Coating Pan B',
          batchSize: '120kg',
          qualificationStatus: 'In Progress'
        }
      ],
      deltaAnalysis: [
        {
          category: 'Equipment',
          parameter: 'Tablet Press Model',
          referenceSite: 'Fette 3090',
          receivingSite: 'Korsch XL200',
          delta: 'Different OEM',
          impact: 'Medium',
          mitigation: 'Comparative qualification study required',
          ppqRecommendation: '3 additional batches for press comparison'
        },
        {
          category: 'Process',
          parameter: 'Batch Size',
          referenceSite: '150kg',
          receivingSite: '120kg',
          delta: '20% reduction',
          impact: 'Low',
          mitigation: 'Scale-down justification in tech transfer package',
          ppqRecommendation: 'Standard 3-batch PPQ acceptable'
        },
        {
          category: 'Environment',
          parameter: 'Room Classification',
          referenceSite: 'Class C',
          receivingSite: 'Class C',
          delta: 'No difference',
          impact: 'None',
          mitigation: 'None required',
          ppqRecommendation: 'No additional requirements'
        },
        {
          category: 'Analytical',
          parameter: 'HPLC System',
          referenceSite: 'Agilent 1260',
          receivingSite: 'Waters Alliance',
          delta: 'Different vendor',
          impact: 'Medium',
          mitigation: 'Method transfer and validation required',
          ppqRecommendation: 'Include comparative analysis in PPQ'
        }
      ],
      aiRecommendations: {
        ppqStrategy: 'Execute 5-batch PPQ due to equipment and analytical differences',
        criticalParameters: ['Tablet hardness', 'Content uniformity', 'Dissolution'],
        additionalStudies: ['Equipment qualification comparison', 'Method transfer validation'],
        regulatoryConsiderations: ['Submit tech transfer summary in Module 3.2.P.3.3', 'Include site master file updates'],
        timeline: '6 months for complete tech transfer validation'
      },
      riskAssessment: {
        overallRisk: 'Medium',
        keyRisks: ['Equipment performance differences', 'Analytical method variability'],
        mitigationSuccess: 85
      }
    };

    res.json(deltaMatrix);
  } catch (error) {
    console.error('Error generating tech transfer delta matrix:', error);
    res.status(500).json({ error: 'Failed to generate delta matrix' });
  }
});

// Export Gating System
router.get('/export/gate-status', async (req, res) => {
  try {
    const exportGates = {
      generatedAt: new Date().toISOString(),
      overallStatus: 'Blocked',
      blockers: 2,
      gates: [
        {
          id: 'gate-001',
          name: 'Change Control Approval',
          status: 'Blocked',
          description: 'Outstanding change controls must be approved before export',
          blockingItems: [
            {
              id: 'CC-2024-016',
              title: 'Compression force PAR adjustment',
              status: 'Pending Approval',
              approvals: [
                { role: 'QA Director', status: 'Pending' },
                { role: 'Regulatory Manager', status: 'Pending' }
              ]
            }
          ],
          requirements: 'All change controls must have complete approval signatures',
          estimatedClearance: '3-5 business days'
        },
        {
          id: 'gate-002',
          name: 'CAPA Effectiveness Verification',
          status: 'Blocked',
          description: 'Open CAPAs require effectiveness verification',
          blockingItems: [
            {
              id: 'CAPA-2024-023',
              title: 'Tablet hardness deviation root cause',
              status: 'Effectiveness Pending',
              verificationDate: null,
              assignee: 'Quality Manager'
            }
          ],
          requirements: 'All CAPAs must have verified effectiveness',
          estimatedClearance: '7-10 business days'
        },
        {
          id: 'gate-003',
          name: 'Validation Status',
          status: 'Passed',
          description: 'Process validation and equipment qualification complete',
          requirements: 'PPQ complete with acceptable results',
          lastVerified: new Date().toISOString().split('T')[0]
        },
        {
          id: 'gate-004',
          name: 'Regulatory Compliance',
          status: 'Passed',
          description: 'All regulatory requirements met',
          requirements: 'Submissions current, no outstanding commitments',
          lastVerified: new Date().toISOString().split('T')[0]
        }
      ],
      releaseActions: [
        'Complete pending change control approvals',
        'Verify CAPA effectiveness for all open items',
        'Update export release checklist',
        'Obtain final QP release certification'
      ]
    };

    res.json(exportGates);
  } catch (error) {
    console.error('Error checking export gate status:', error);
    res.status(500).json({ error: 'Failed to check export gate status' });
  }
});

// Audit Trail System
router.get('/audit/trail', async (req, res) => {
  try {
    const { startDate, endDate, userId, action } = req.query;
    
    const auditTrail = {
      generatedAt: new Date().toISOString(),
      dateRange: { start: startDate, end: endDate },
      totalRecords: 156,
      compliance: '21 CFR Part 11',
      entries: [
        {
          id: 'AUD-2024-001234',
          timestamp: new Date().toISOString(),
          userId: 'john.smith',
          userName: 'John Smith',
          action: 'Document Modified',
          target: 'MBR-v2.1-TabletManufacturing.pdf',
          module: 'Manufacturing',
          section: '3.2.P.3.3',
          details: 'Updated compression force parameters from 8-12 kN to 9-11 kN',
          ipAddress: '192.168.1.45',
          sessionId: 'SES-789123',
          electronicSignature: 'E-SIGN-456789',
          approvals: [{
            approver: 'Sarah Wilson',
            role: 'QA Director',
            timestamp: new Date().toISOString(),
            signature: 'E-SIGN-456790'
          }]
        },
        {
          id: 'AUD-2024-001235',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          userId: 'mary.jones',
          userName: 'Mary Jones',
          action: 'Change Control Created',
          target: 'CC-2024-016',
          module: 'Change Control',
          section: '3.2.P.3.4',
          details: 'Created change control for compression force PAR adjustment',
          ipAddress: '192.168.1.67',
          sessionId: 'SES-789124',
          electronicSignature: 'E-SIGN-456791'
        },
        {
          id: 'AUD-2024-001236',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          userId: 'robert.brown',
          userName: 'Robert Brown',
          action: 'CAPA Approved',
          target: 'CAPA-2024-022',
          module: 'CAPA',
          section: '3.2.P.3.5',
          details: 'Approved CAPA for process improvement implementation',
          ipAddress: '192.168.1.89',
          sessionId: 'SES-789125',
          electronicSignature: 'E-SIGN-456792',
          approvals: [{
            approver: 'Robert Brown',
            role: 'Manufacturing Manager',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            signature: 'E-SIGN-456792'
          }]
        }
      ],
      integrityVerification: {
        hashValid: true,
        timestampValid: true,
        signatureValid: true,
        chainOfCustody: 'Verified'
      },
      exportOptions: ['PDF Report', 'Excel Export', 'Regulatory Package']
    };

    res.json(auditTrail);
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// Unified Tasks Worklist
router.get('/tasks/worklist', async (req, res) => {
  try {
    const { status, priority, assignee } = req.query;
    
    const tasksWorklist = {
      generatedAt: new Date().toISOString(),
      totalTasks: 28,
      overdueTasks: 3,
      dueTodayTasks: 5,
      tasks: [
        {
          id: 'TASK-001',
          title: 'Complete PPQ Batch 3 Documentation',
          description: 'Finalize process validation documentation for third PPQ batch',
          type: 'Validation',
          priority: 'High',
          status: 'In Progress',
          assignee: 'Sarah Wilson',
          assigneeRole: 'QA Director',
          dueDate: new Date().toISOString().split('T')[0],
          module: 'Validation Lifecycle',
          ctdSection: '3.2.P.3.5',
          dependencies: ['TASK-002'],
          progress: 75,
          comments: 'Waiting for analytical results from batch release testing'
        },
        {
          id: 'TASK-002',
          title: 'Execute Analytical Method Transfer',
          description: 'Transfer HPLC method to European facility laboratory',
          type: 'Tech Transfer',
          priority: 'High',
          status: 'Overdue',
          assignee: 'Michael Chen',
          assigneeRole: 'Analytical Manager',
          dueDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          module: 'Tech Transfer',
          ctdSection: '3.2.P.5.4',
          dependencies: [],
          progress: 45,
          comments: 'Equipment installation delayed, extending timeline'
        },
        {
          id: 'TASK-003',
          title: 'Resolve CAPA Effectiveness Verification',
          description: 'Verify effectiveness of corrective actions for tablet hardness deviation',
          type: 'CAPA',
          priority: 'Medium',
          status: 'Pending Review',
          assignee: 'Lisa Anderson',
          assigneeRole: 'Quality Manager',
          dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
          module: 'Deviation Management',
          ctdSection: '3.2.P.3.5',
          dependencies: [],
          progress: 80,
          comments: 'Data collection complete, preparing effectiveness report'
        },
        {
          id: 'TASK-004',
          title: 'Update Packaging Labels for EU Region',
          description: 'Implement FMD compliance updates for European market labels',
          type: 'Packaging',
          priority: 'Medium',
          status: 'Not Started',
          assignee: 'David Kumar',
          assigneeRole: 'Packaging Manager',
          dueDate: new Date(Date.now() + 432000000).toISOString().split('T')[0],
          module: 'Packaging & Serialization',
          ctdSection: '3.2.P.7',
          dependencies: [],
          progress: 0,
          comments: 'Waiting for regulatory guidance clarification'
        },
        {
          id: 'TASK-005',
          title: 'Export Release Documentation Review',
          description: 'Review and approve batch records for commercial release',
          type: 'Export',
          priority: 'High',
          status: 'Due Today',
          assignee: 'Robert Martinez',
          assigneeRole: 'QP (Qualified Person)',
          dueDate: new Date().toISOString().split('T')[0],
          module: 'Document Outputs',
          ctdSection: '3.2.P.8',
          dependencies: ['TASK-001'],
          progress: 25,
          comments: 'Pending PPQ documentation completion'
        }
      ],
      summary: {
        byStatus: {
          'Not Started': 8,
          'In Progress': 12,
          'Pending Review': 5,
          'Complete': 3
        },
        byPriority: {
          'High': 9,
          'Medium': 15,
          'Low': 4
        },
        byModule: {
          'Validation Lifecycle': 6,
          'Tech Transfer': 4,
          'Deviation Management': 7,
          'Packaging & Serialization': 3,
          'Manufacturing Process': 5,
          'Document Outputs': 3
        }
      }
    };

    res.json(tasksWorklist);
  } catch (error) {
    console.error('Error fetching tasks worklist:', error);
    res.status(500).json({ error: 'Failed to fetch tasks worklist' });
  }
});

// Event Bus for Cross-Module Updates
router.post('/events/publish', async (req, res) => {
  try {
    const { eventType, module, data, userId } = req.body;
    
    const event = {
      id: `EVT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: eventType,
      module,
      userId,
      data,
      status: 'Published',
      subscribers: [
        'manufacturing-dashboard',
        'audit-trail',
        'tasks-worklist',
        'regulatory-tracking'
      ]
    };

    // Simulate event propagation and updates
    const propagationResults = {
      event,
      propagatedTo: event.subscribers.length,
      notifications: [
        {
          module: 'Tasks Worklist',
          action: 'Updated task dependencies',
          affected: 3
        },
        {
          module: 'Audit Trail',
          action: 'Logged activity',
          affected: 1
        },
        {
          module: 'Manufacturing Dashboard',
          action: 'Refreshed KPI metrics',
          affected: 1
        }
      ]
    };

    res.json(propagationResults);
  } catch (error) {
    console.error('Error publishing event:', error);
    res.status(500).json({ error: 'Failed to publish event' });
  }
});

// Test endpoint to trigger CMC events
router.post('/test-event', async (req, res) => {
  const { eventType, data } = req.body;
  
  try {
    const { emitCMCEvent } = await import('../services/cmcEvents.js');
    const patch = await emitCMCEvent(eventType, data);
    
    res.json({ 
      success: true, 
      message: `Event ${eventType} triggered`,
      patch 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
