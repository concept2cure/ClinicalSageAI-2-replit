// /server/advisor-routes.js

/**
 * Advisor API Routes
 *
 * This module provides regulatory intelligence endpoints for the TrialSage platform.
 */

/**
 * Configure API routes for regulatory advisor functionality
 * @param {Express} app - Express application instance
 */
export function registerAdvisorRoutes(app) {
  /**
   * GET /api/advisor/readiness
   *
   * Returns regulatory readiness assessment data for the Regulatory Intelligence Hub
   */
  app.get('/api/advisor/readiness', (req, res) => {
    const data = {
      readinessScore: 65,
      riskLevel: 'Medium',
      delayDays: 49,
      financialImpact: 2450000,
      gaps: [
        { section: 'CMC Stability Study', impact: 'critical', status: 'missing' },
        { section: 'Drug Product Specs', impact: 'high', status: 'incomplete' },
        { section: 'Clinical Study Reports', impact: 'high', status: 'missing' },
        { section: 'Pharmacology Documentation', impact: 'medium', status: 'incomplete' },
        { section: 'Toxicology Reports', impact: 'medium', status: 'missing' },
      ],
    };

    res.json(data);
  });

  /**
   * GET /api/advisor/check-readiness
   *
   * Returns regulatory readiness assessment data for the specified playbook
   */
  app.get('/api/advisor/check-readiness', (req, res) => {
    const { playbook = 'Fast IND Playbook' } = req.query;

    // Serve different data based on selected playbook
    let data;

    switch (playbook) {
      case 'Fast IND Playbook':
        data = {
          readinessScore: 65,
          riskLevel: 'Medium',
          delayDays: 49,
          financialImpact: 2450000,
          gaps: [
            { section: 'CMC Stability Study', impact: 'critical', status: 'missing' },
            { section: 'Drug Product Specs', impact: 'high', status: 'incomplete' },
            { section: 'Clinical Study Reports', impact: 'high', status: 'missing' },
            { section: 'Pharmacology Documentation', impact: 'medium', status: 'incomplete' },
            { section: 'Toxicology Reports', impact: 'medium', status: 'missing' },
          ],
        };
        break;

      case 'Cost-Optimized IND Playbook':
        data = {
          readinessScore: 78,
          riskLevel: 'Low',
          delayDays: 28,
          financialImpact: 1450000,
          gaps: [
            { section: 'IRB Letter', impact: 'medium', status: 'missing' },
            { section: 'Statistical Analysis', impact: 'medium', status: 'incomplete' },
            { section: 'Clinical Study Reports', impact: 'high', status: 'incomplete' },
          ],
        };
        break;

      case 'Global Submission Playbook':
        data = {
          readinessScore: 42,
          riskLevel: 'High',
          delayDays: 87,
          financialImpact: 4850000,
          gaps: [
            { section: 'CMC Stability Study', impact: 'critical', status: 'missing' },
            { section: 'Local Regulatory Supplements', impact: 'critical', status: 'missing' },
            { section: 'Multiple Region Translations', impact: 'high', status: 'missing' },
            { section: 'Clinical Study Reports', impact: 'high', status: 'missing' },
            { section: 'Regional Safety Dossiers', impact: 'critical', status: 'incomplete' },
            { section: 'Drug Product Specs', impact: 'high', status: 'incomplete' },
            { section: 'Pharmacology Documentation', impact: 'medium', status: 'incomplete' },
          ],
        };
        break;

      default:
        data = {
          readinessScore: 65,
          riskLevel: 'Medium',
          delayDays: 49,
          financialImpact: 2450000,
          gaps: [
            { section: 'CMC Stability Study', impact: 'critical', status: 'missing' },
            { section: 'Drug Product Specs', impact: 'high', status: 'incomplete' },
          ],
        };
    }

    res.json(data);
  });

  /**
   * GET /api/advisor/heatmap-data
   *
   * Returns CTD section risk assessment data for the Risk Heatmap
   */
  app.get('/api/advisor/heatmap-data', (req, res) => {
    const { playbook = 'Fast IND Playbook' } = req.query;

    // Common Technical Document (CTD) sections with risk assessment
    const heatmapData = [
      {
        category: 'CMC',
        sections: [
          { name: 'CMC Stability Study', risk: 'high', score: -32, color: 'red' },
          { name: 'Drug Substance Specs', risk: 'medium', score: -18, color: 'yellow' },
          { name: 'Drug Product Specs', risk: 'high', score: -27, color: 'red' },
        ],
      },
      {
        category: 'Clinical',
        sections: [
          { name: 'Clinical Study Reports (CSR)', risk: 'high', score: -25, color: 'red' },
          { name: 'Investigator Brochure Updates', risk: 'low', score: -8, color: 'green' },
        ],
      },
      {
        category: 'Nonclinical',
        sections: [
          { name: 'Toxicology Reports', risk: 'medium', score: -17, color: 'yellow' },
          { name: 'Pharmacology Reports', risk: 'low', score: -10, color: 'green' },
        ],
      },
    ];

    res.json(heatmapData);
  });

  /**
   * GET /api/advisor/timeline-simulation
   *
   * Runs a timeline simulation based on provided document completion forecasts
   */
  app.get('/api/advisor/timeline-simulation', (req, res) => {
    const { targetDate = '2025-06-15', documents = ['clinical', 'cmc', 'safety'] } = req.query;

    // Simulate timeline impact calculations
    const totalDaysSaved = documents.length * 14;
    const financialImpact = totalDaysSaved * 25000;

    const simulationResults = {
      daysToSubmission: Math.max(0, 120 - totalDaysSaved),
      risksIdentified: Math.max(1, 5 - documents.length),
      financialImpact,
      approvalProbability: Math.min(95, 60 + documents.length * 8) + '%',
      recommendations: [],
    };

    // Generate recommendations based on selected documents
    if (!documents.includes('cmc')) {
      simulationResults.recommendations.push({
        priority: 'critical',
        action: 'Complete CMC Documentation to avoid critical delays',
      });
    }

    if (documents.length < 4) {
      simulationResults.recommendations.push({
        priority: 'medium',
        action: 'Prioritize at least 4 critical documents for optimal timeline',
      });
    }

    res.json(simulationResults);
  });
}

// Export handled via named export above
