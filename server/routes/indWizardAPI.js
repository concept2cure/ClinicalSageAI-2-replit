// server/routes/indWizardAPI.js

import express from 'express';

const router = express.Router();

// Get IND wizard data - endpoint that frontend is calling
router.get('/wizard/data', (req, res) => {
  try {
    const wizardData = {
      id: 'wizard-draft-001',
      name: 'IND Wizard Draft',
      drugName: 'Enzymax Forte',
      indication: 'Pancreatic Enzyme Deficiency',
      sponsor: 'TrialSage Pharmaceuticals',
      status: 'in_progress',
      progress: 65,
      lastUpdated: new Date().toISOString(),
      sections: {
        prePlanning: { status: 'completed', progress: 100 },
        nonclinicalData: { status: 'in_progress', progress: 85 },
        cmcData: { status: 'in_progress', progress: 70 },
        clinicalProtocol: { status: 'in_progress', progress: 60 },
        investigatorBrochure: { status: 'not_started', progress: 0 },
        fdaForms: { status: 'not_started', progress: 0 },
        finalAssembly: { status: 'not_started', progress: 0 },
      },
    };

    return res.json(wizardData);
  } catch (error) {
    console.error('Error fetching IND wizard data:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get IND stats - endpoint for dashboard statistics
router.get('/stats', (req, res) => {
  try {
    const stats = {
      totalSubmissions: 127,
      successfulSubmissions: 98,
      inProgress: 15,
      averageCompletionTime: 45, // days
      recentActivity: [
        {
          id: 1,
          action: 'Draft Created',
          project: 'Enzymax Forte IND',
          timestamp: new Date().toISOString(),
        },
        {
          id: 2,
          action: 'Section Completed',
          project: 'NeuroClear IND',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 3,
          action: 'Submission Approved',
          project: 'CardioFlow IND',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        },
      ],
      complianceRate: 94.2,
      averageRiskScore: 3.8, // out of 10
    };

    return res.json(stats);
  } catch (error) {
    console.error('Error fetching IND stats:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// AI guidance for IND sections
router.post('/ai-guidance', (req, res) => {
  try {
    const { projectId, step, indData } = req.body;

    console.log(`Generating AI guidance for project ${projectId}, step: ${step}`);

    // Sample response data
    const guidanceData = {
      recommendations: [
        'Ensure all required fields are completed accurately',
        'Verify consistency between related sections',
        'Check for compliance with FDA guidelines for this section',
      ],
      risks: [
        {
          level: 'high',
          description: 'Missing information in critical sections',
          impact: 'May result in a refusal-to-file determination',
        },
        {
          level: 'medium',
          description: 'Inconsistent information across sections',
          impact: 'Could trigger requests for clarification, delaying review',
        },
      ],
      regulations: [
        {
          citation: '21 CFR 312.23(a)(1)',
          description: 'Requires a comprehensive table of contents',
          url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfcfr/CFRSearch.cfm?fr=312.23',
        },
        {
          citation: 'FDA Guidance for Industry: IND Applications',
          description: 'Provides detailed instructions for specific IND components',
          url: 'https://www.fda.gov/drugs/investigational-new-drug-ind-application/ind-application-procedures',
        },
      ],
      timelineImpact: {
        critical: ['Complete Form FDA 1571', 'Prepare Investigator Brochure'],
        recommended: ['Conduct gap analysis of CMC data', 'Finalize study protocol'],
      },
    };

    return res.json(guidanceData);
  } catch (error) {
    console.error('Error generating AI guidance:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Fetch IND projects
router.get('/projects', (req, res) => {
  try {
    // In a production environment, this would query a database
    const sampleProjects = [
      {
        id: 'project-1',
        name: 'Enzymax Forte IND',
        drugName: 'Enzymax Forte',
        indication: 'Pancreatic Enzyme Deficiency',
        sponsor: 'TrialSage Pharmaceuticals',
        status: 'in_progress',
        progress: 65,
        lastUpdated: '2025-04-20T14:30:00Z',
      },
      {
        id: 'project-2',
        name: 'NeuroClear IND',
        drugName: 'NeuroClear',
        indication: "Alzheimer's Disease",
        sponsor: 'NeuroGenix Therapeutics',
        status: 'not_started',
        progress: 10,
        lastUpdated: '2025-04-15T09:45:00Z',
      },
      {
        id: 'project-3',
        name: 'CardioFlow IND',
        drugName: 'CardioFlow',
        indication: 'Hypertension',
        status: 'completed',
        sponsor: 'HeartWell Biosciences',
        progress: 100,
        lastUpdated: '2025-03-28T16:20:00Z',
      },
    ];

    return res.json(sampleProjects);
  } catch (error) {
    console.error('Error fetching IND projects:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get specific project
router.get('/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;

    // Handle stats endpoint correctly
    if (projectId === 'stats') {
      const stats = {
        totalSubmissions: 127,
        successfulSubmissions: 98,
        inProgress: 15,
        averageCompletionTime: 45, // days
        recentActivity: [
          {
            id: 1,
            action: 'Draft Created',
            project: 'Enzymax Forte IND',
            timestamp: new Date().toISOString(),
          },
          {
            id: 2,
            action: 'Section Completed',
            project: 'NeuroClear IND',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 3,
            action: 'Submission Approved',
            project: 'CardioFlow IND',
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          },
        ],
        complianceRate: 94.2,
        averageRiskScore: 3.8, // out of 10
      };
      return res.json(stats);
    }

    // In production, fetch from database using projectId
    const projectData = {
      id: projectId,
      name: `IND-${projectId}`,
      drugName: 'Enzymax Forte',
      indication: 'Pancreatic Enzyme Deficiency',
      sponsorName: 'TrialSage Pharmaceuticals',
      status: 'in_progress',
      progress: 65,
      targetDate: '2025-06-15',
      lastUpdated: new Date().toISOString(),
      modules: {
        prePlanning: { status: 'completed', progress: 100 },
        nonclinicalData: { status: 'in_progress', progress: 85 },
        cmcData: { status: 'in_progress', progress: 70 },
        clinicalProtocol: { status: 'in_progress', progress: 60 },
        investigatorBrochure: { status: 'not_started', progress: 0 },
        fdaForms: { status: 'not_started', progress: 0 },
        finalAssembly: { status: 'not_started', progress: 0 },
      },
    };

    return res.json(projectData);
  } catch (error) {
    console.error(`Error fetching project ${req.params.projectId}:`, error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Create new IND project
router.post('/create', (req, res) => {
  try {
    const { name, drugName, indication, sponsor } = req.body;

    // Validate required fields
    if (!name || !drugName || !indication) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, drugName, and indication are required',
      });
    }

    // Generate a unique project ID
    const projectId = 'project-' + Math.random().toString(36).substring(2, 8);

    // Create a mock project
    const mockProject = {
      id: projectId,
      name,
      drugName,
      indication,
      sponsor: sponsor || 'Unknown',
      status: 'not_started',
      progress: 0,
      lastUpdated: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: mockProject,
    });
  } catch (error) {
    console.error('Error creating IND project:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Save IND project data
router.post('/save-draft', (req, res) => {
  try {
    const projectData = req.body;

    if (!projectData.id) {
      return res.status(400).json({ success: false, message: 'Missing project ID' });
    }

    // In a production environment, this would save to a database
    console.log('Saving IND project draft:', projectData);

    // Simulating successful save
    return res.json({
      success: true,
      message: 'Project draft saved successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving IND project draft:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Generate IND timeline
router.post('/generate-timeline', (req, res) => {
  try {
    const { projectId, indData } = req.body;

    // In a production environment, this would use an AI service and database
    console.log(`Generating timeline for project ${projectId}:`, indData);

    // Sample timeline data
    const timelineData = {
      projectId,
      generatedDate: new Date().toISOString(),
      targetSubmissionDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      milestones: [
        {
          title: 'Complete Pre-IND Meeting',
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        },
        {
          title: 'Finalize CMC Documentation',
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        },
        {
          title: 'Complete Clinical Protocol',
          dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        },
        {
          title: 'Prepare Investigator Brochure',
          dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        },
        {
          title: 'Final IND Assembly',
          dueDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        },
      ],
    };

    return res.json(timelineData);
  } catch (error) {
    console.error('Error generating IND timeline:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Field-specific guidance endpoint
router.post('/field-guidance', (req, res) => {
  try {
    const { projectId, step, field, indData } = req.body;

    console.log(
      `Generating field guidance for project ${projectId}, step: ${step}, field: ${field}`
    );

    // Sample field guidance
    const fieldGuidanceData = {
      field,
      recommendations: [
        `Ensure ${field} is properly documented according to FDA guidelines`,
        `Cross-reference ${field} with related information in other sections`,
        `Consider including additional details about ${field} for clarity`,
      ],
      examples: [
        {
          description: 'Example of well-formatted content',
          text: `This is an example of how ${field} should be documented properly...`,
        },
      ],
      regulations: [
        {
          citation: '21 CFR 312.23',
          relevance: `This regulation specifically addresses requirements for ${field}`,
        },
      ],
    };

    return res.json(fieldGuidanceData);
  } catch (error) {
    console.error('Error generating field guidance:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Section assessment endpoint
router.post('/section-assessment', (req, res) => {
  try {
    const { projectId, step, indData } = req.body;

    console.log(`Performing section assessment for project ${projectId}, step: ${step}`);

    // Sample section assessment
    const assessmentData = {
      step,
      completeness: 75,
      qualityScore: 82,
      issues: [
        {
          severity: 'medium',
          description: 'Some required information is missing or incomplete',
          recommendation: 'Review and complete all required fields in this section',
        },
        {
          severity: 'low',
          description: 'Formatting inconsistencies detected',
          recommendation: 'Standardize formatting for better readability',
        },
      ],
      regulatoryAlignment: {
        status: 'generally_aligned',
        notes:
          'Content aligns with FDA expectations but could benefit from additional detail in key areas',
      },
      nextSteps: [
        'Complete missing information',
        'Enhance technical details where noted',
        'Add supporting references where appropriate',
      ],
    };

    return res.json(assessmentData);
  } catch (error) {
    console.error('Error performing section assessment:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Assemble IND (final submission)
router.post('/assemble', (req, res) => {
  try {
    const { projectId, sequence } = req.body;

    // In production, this would trigger a workflow to assemble the IND package
    console.log(
      `Assembling IND for project ${projectId || 'unknown'} with sequence ${sequence || '0000'}`
    );

    // Generate a sample object ID for the package
    const zipObjectId = `ind-pkg-${Date.now()}-${Math.round(Math.random() * 1000)}`;

    return res.json({
      success: true,
      message: 'IND assembly initiated successfully',
      zipObjectId,
      estimatedTimeMinutes: 10,
      packageAvailableAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Error assembling IND:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
