import express from 'express';
const router = express.Router();

// Mock data that matches the database structure we already have
const mockData = {
  summary: {
    submissionReadiness: 86,
    openValidationIssues: 18,
    tasksDue7d: 7,
    changeControlsOpen: 3,
    qualityScore: 98.7,
    methodsValidatedPct: 85,
  },
  stageGates: [
    {
      id: 1,
      name: 'CMC Module 3.2.S (Drug Substance)',
      owner: 'Dr. Rodriguez',
      status: 'APPROVED',
      progress: 100,
      dueDate: '2024-08-15',
    },
    {
      id: 2,
      name: 'CMC Module 3.2.P (Drug Product)',
      owner: 'Dr. Chen',
      status: 'READY_FOR_QA',
      progress: 85,
      dueDate: '2024-09-01',
    },
    {
      id: 3,
      name: 'Method Validation Package',
      owner: 'K. Smith',
      status: 'IN_PROGRESS',
      progress: 72,
      dueDate: '2024-08-25',
    },
    {
      id: 4,
      name: 'Stability Data Summary',
      owner: 'Dr. Johnson',
      status: 'IN_PROGRESS',
      progress: 65,
      dueDate: '2024-09-10',
    },
  ],
  tasks: [
    {
      id: 1,
      title: 'Add microbial limits to 3.2.P.5',
      section: '3.2.P.5',
      priority: 'HIGH',
      owner: 'You',
      dueDate: '2024-08-22',
      why: 'Rule P5-007 (non-sterile).',
      link: '/authoring/documents/DP-001/sections/3.2.P.5',
    },
    {
      id: 2,
      title: 'Attach Q1E trend analysis',
      section: '3.2.P.8',
      priority: 'MEDIUM',
      owner: 'You',
      dueDate: '2024-08-19',
      why: 'Rule P8-008 requires stats model.',
      link: '/authoring/documents/DP-001/sections/3.2.P.8',
    },
    {
      id: 3,
      title: 'Update CCS description to match stability',
      section: '3.2.P.7',
      priority: 'CRITICAL',
      owner: 'You',
      dueDate: '2024-08-17',
      why: 'X-005 mismatch flagged.',
      link: '/authoring/documents/DP-001/sections/3.2.P.7',
    },
  ],
  validationIssues: [
    {
      id: 1,
      section: '3.2.P.5',
      ruleId: 'P5-001',
      severity: 'ERROR',
      title: 'Missing justification on Assay limit',
      owner: 'K. Lee',
    },
    {
      id: 2,
      section: '3.2.P.8',
      ruleId: 'P8-003',
      severity: 'ERROR',
      title: 'Shelf-life exceeds supported data',
      owner: 'A. Rivera',
    },
    {
      id: 3,
      section: '3.2.P.5',
      ruleId: 'P5-007',
      severity: 'WARNING',
      title: 'Microbiological quality not specified',
      owner: 'You',
    },
    {
      id: 4,
      section: '3.2.P.8',
      ruleId: 'P8-008',
      severity: 'WARNING',
      title: 'Trend analysis methodology not attached',
      owner: 'You',
    },
  ],
  risks: [
    {
      id: 1,
      title: 'Dissolution method re-validation may be required',
      owner: 'Dr. Johnson',
      impact: 'HIGH',
      probability: 'MEDIUM',
      mitigation: 'Parallel verification with compendial ref.',
      status: 'OPEN',
    },
    {
      id: 2,
      title: 'API lot #102 short expiry for stability extension',
      owner: 'Supply Chain',
      impact: 'MEDIUM',
      probability: 'HIGH',
      mitigation: 'Source additional API; extend retest if justified.',
      status: 'MONITOR',
    },
  ],
  insights: [
    {
      id: 'i1',
      text: 'Shelf-life claim likely fails review due to insufficient long-term data.',
      why: 'Rule P8-003',
      action: 'Lower claim or add Q1E projection + commitment.',
      ownerSuggestion: 'Reg CMC',
      type: 'compliance',
      confidence: 0.89,
      impactLevel: 'HIGH',
    },
    {
      id: 'i2',
      text: 'Method validation sign-off is lagging and may block spec approval.',
      why: 'Stage gate under 90% progress.',
      action: 'Prioritize validation summary approvals and link methods to spec rows.',
      ownerSuggestion: 'Analytical Lead',
      type: 'timeline',
      confidence: 0.76,
      impactLevel: 'MEDIUM',
    },
    {
      id: 'i3',
      text: 'Predictive model indicates 92% probability of first-cycle FDA approval if current quality trajectory maintained.',
      why: 'AI analysis of 847 similar submissions (2019-2024)',
      action: 'Continue current CMC strategy; consider expedited timeline.',
      ownerSuggestion: 'Regulatory Affairs',
      type: 'predictive',
      confidence: 0.92,
      impactLevel: 'HIGH',
    },
    {
      id: 'i4',
      text: 'Dissolution method shows high correlation risk with compendial reference standard variations.',
      why: 'Statistical analysis of batch-to-batch variability',
      action: 'Implement parallel verification testing with USP standard lot tracking.',
      ownerSuggestion: 'QC Manager',
      type: 'risk_assessment',
      confidence: 0.84,
      impactLevel: 'MEDIUM',
    },
    {
      id: 'i5',
      text: 'EMA CTD Module 3.2.P.5.6 specification format diverges from FDA preferences.',
      why: 'Multi-agency comparative analysis',
      action: 'Standardize acceptance criteria format for global harmonization.',
      ownerSuggestion: 'CMC Lead',
      type: 'multi_agency',
      confidence: 0.91,
      impactLevel: 'LOW',
    },
    {
      id: 'i6',
      text: 'Stability trending algorithm predicts potential shelf-life extension opportunity.',
      why: 'Q1E extrapolation model with 95% confidence interval',
      action: 'Consider protocol amendment for 36-month stability claim.',
      ownerSuggestion: 'Stability Lead',
      type: 'opportunity',
      confidence: 0.88,
      impactLevel: 'HIGH',
    },
  ],
};

// API Routes
router.get('/dashboard/summary', async (req, res) => {
  try {
    res.json(mockData.summary);
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

router.get('/stage-gates', async (req, res) => {
  try {
    res.json(mockData.stageGates);
  } catch (error) {
    console.error('Stage gates error:', error);
    res.status(500).json({ error: 'Failed to fetch stage gates' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const assignee = req.query.assignee;
    let tasks = mockData.tasks;
    if (assignee === 'me') {
      tasks = tasks.filter(task => task.owner === 'You');
    }
    res.json(tasks);
  } catch (error) {
    console.error('Tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/validation/issues', async (req, res) => {
  try {
    const status = req.query.status;
    let issues = mockData.validationIssues;
    if (status === 'open') {
      issues = issues.filter(issue => issue.severity === 'ERROR' || issue.severity === 'WARNING');
    }
    res.json(issues);
  } catch (error) {
    console.error('Validation issues error:', error);
    res.status(500).json({ error: 'Failed to fetch validation issues' });
  }
});

router.get('/risks', async (req, res) => {
  try {
    res.json(mockData.risks);
  } catch (error) {
    console.error('Risks error:', error);
    res.status(500).json({ error: 'Failed to fetch risks' });
  }
});

router.get('/ai/insights', async (req, res) => {
  try {
    res.json(mockData.insights);
  } catch (error) {
    console.error('AI insights error:', error);
    res.status(500).json({ error: 'Failed to fetch AI insights' });
  }
});

// Advanced AI Analytics Endpoints
router.get('/ai-analytics/predictive', async (req, res) => {
  try {
    const analyticsData = {
      submissionProbability: {
        fda: {
          probability: 0.92,
          confidence: 0.89,
          factors: ['Quality score 98.7%', 'Complete documentation', 'No critical deficiencies'],
        },
        ema: {
          probability: 0.87,
          confidence: 0.84,
          factors: [
            'CTD format compliance',
            'Regional variations identified',
            'Translation requirements met',
          ],
        },
        pmda: {
          probability: 0.78,
          confidence: 0.73,
          factors: [
            'Local regulatory requirements',
            'Manufacturing standards',
            'Clinical data alignment',
          ],
        },
      },
      timelineRisk: {
        overall: 'LOW',
        score: 25,
        criticalPath: [
          'Method validation completion',
          'Stability data finalization',
          'CMC document review',
        ],
        predictedDelay: 0,
        mitigation: 'Continue current trajectory',
      },
      qualityTrends: {
        trend: 'IMPROVING',
        score: 98.7,
        prediction: 'Maintain excellence through submission',
        riskFactors: ['Minor documentation gaps', 'Supplier qualification pending'],
      },
    };
    res.json(analyticsData);
  } catch (error) {
    console.error('AI Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch AI analytics' });
  }
});

router.get('/ai-analytics/compliance-intelligence', async (req, res) => {
  try {
    const complianceData = {
      multiAgencyAlignment: {
        fda: { score: 94, status: 'EXCELLENT', gaps: ['Minor formatting preferences'] },
        ema: {
          score: 87,
          status: 'GOOD',
          gaps: ['CTD Module 3.2.P.5.6 specification format', 'Quality target profiles'],
        },
        pmda: {
          score: 78,
          status: 'ACCEPTABLE',
          gaps: ['Local manufacturing requirements', 'Japanese labeling standards'],
        },
        hc: {
          score: 85,
          status: 'GOOD',
          gaps: ['Clinical pharmacology section', 'Environmental assessment'],
        },
      },
      regulatoryIntelligence: [
        {
          agency: 'FDA',
          type: 'GUIDANCE_UPDATE',
          date: '2025-01-15',
          title: 'AI in Drug Development Framework',
          impact: 'HIGH',
        },
        {
          agency: 'EMA',
          type: 'PROCEDURE_CHANGE',
          date: '2025-01-10',
          title: 'Enhanced CMC Assessment Procedures',
          impact: 'MEDIUM',
        },
        {
          agency: 'ICH',
          type: 'HARMONIZATION',
          date: '2025-01-08',
          title: 'Q12 Lifecycle Management Updates',
          impact: 'MEDIUM',
        },
      ],
      complianceScore: 89.7,
      trendDirection: 'IMPROVING',
    };
    res.json(complianceData);
  } catch (error) {
    console.error('Compliance Intelligence error:', error);
    res.status(500).json({ error: 'Failed to fetch compliance intelligence' });
  }
});

router.get('/ai-analytics/manufacturing-optimization', async (req, res) => {
  try {
    const manufacturingData = {
      processOptimization: {
        currentEfficiency: 87.3,
        targetEfficiency: 92.0,
        recommendations: [
          { area: 'Batch Processing', improvement: '+3.2%', action: 'Optimize mixing parameters' },
          {
            area: 'Quality Control',
            improvement: '+1.8%',
            action: 'Implement real-time monitoring',
          },
          { area: 'Material Flow', improvement: '+2.1%', action: 'Reduce changeover times' },
        ],
      },
      qualityPrediction: {
        batchSuccessRate: 99.1,
        predictedTrend: 'STABLE',
        riskFactors: ['Raw material variability', 'Environmental conditions'],
        earlyWarnings: [],
      },
      sustainabilityMetrics: {
        energyEfficiency: 82.4,
        wasteReduction: 15.2,
        carbonFootprint: 'DECREASING',
        greenScore: 'B+',
      },
    };
    res.json(manufacturingData);
  } catch (error) {
    console.error('Manufacturing Optimization error:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturing optimization data' });
  }
});

export default router;
