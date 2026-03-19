// server/advisor-standalone.js
// A standalone server that only serves the advisor API - for troubleshooting

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the Express app
const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Request logger
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// CTD Structure Checklist
const CTDChecklist = {
  'Module 1': [
    'Form FDA 1571',
    'Cover Letter',
    'Table of Contents',
    'US Agent Appointment',
    'Financial Disclosure',
  ],
  'Module 2': [
    'Introduction Summary',
    'Quality Overall Summary',
    'Nonclinical Overview',
    'Clinical Overview',
    'Clinical Summary',
  ],
  'Module 3': [
    'Drug Substance Specs',
    'Drug Product Specs',
    'CMC Stability Data',
    'Analytical Methods',
    'GMP Certificates',
  ],
  'Module 4': [
    'Toxicology Reports',
    'Pharmacology Reports',
    'ADME Studies',
    'Carcinogenicity Studies',
    'Genotoxicity Studies',
  ],
  'Module 5': [
    'Clinical Study Reports (CSR)',
    'Protocol',
    'Investigator Brochure',
    'Case Report Forms',
    'Literature References',
  ],
};

// Section importance weights
const sectionWeights = {
  'Form FDA 1571': 3,
  'Cover Letter': 1,
  'Table of Contents': 1,
  'US Agent Appointment': 1,
  'Financial Disclosure': 2,
  'Introduction Summary': 2,
  'Quality Overall Summary': 3,
  'Nonclinical Overview': 3,
  'Clinical Overview': 3,
  'Clinical Summary': 3,
  'Drug Substance Specs': 3,
  'Drug Product Specs': 3,
  'CMC Stability Data': 3,
  'Analytical Methods': 2,
  'GMP Certificates': 1,
  'Toxicology Reports': 3,
  'Pharmacology Reports': 2,
  'ADME Studies': 2,
  'Carcinogenicity Studies': 2,
  'Genotoxicity Studies': 2,
  'Clinical Study Reports (CSR)': 3,
  Protocol: 3,
  'Investigator Brochure': 3,
  'Case Report Forms': 2,
  'Literature References': 1,
};

// GET endpoint to check readiness
app.get('/api/advisor/check-readiness', (req, res) => {
  try {
    console.log('Processing GET /api/advisor/check-readiness request with query:', req.query);
    const selectedPlaybook = req.query.playbook || 'Fast IND Playbook';

    // Base CTD Checklist
    let checklist = { ...CTDChecklist };

    // Modify Checklist Dynamically Based on Playbook
    if (selectedPlaybook === 'Fast IND Playbook') {
      // Relax certain sections for faster submission
      checklist['Module 4'] = checklist['Module 4'].filter(
        section => section.includes('Toxicology') || section.includes('Pharmacology')
      );
      checklist['Module 3'] = checklist['Module 3'].filter(
        section => section !== 'GMP Certificates'
      );
    } else if (selectedPlaybook === 'Full NDA Playbook') {
      // Full checklist — no changes needed
    } else if (selectedPlaybook === 'EMA IMPD Playbook') {
      // Adjust for EMA focus
      checklist['Module 1'] = checklist['Module 1'].filter(
        section => section !== 'US Agent Appointment'
      );
      checklist['Module 2'] = checklist['Module 2'].filter(
        section => section.includes('Intro Summary') || section.includes('Clinical Overview')
      );
    }

    // For demo, always return data as if metadata file doesn't exist
    const missingSections = Object.values(checklist).flat();

    // Create different readiness scores and risk levels based on playbook
    let readinessScore = 0;
    let riskLevel = 'High';
    let estimatedDelayDays = 90;

    if (selectedPlaybook === 'Fast IND Playbook') {
      readinessScore = 65;
      riskLevel = 'Medium';
      estimatedDelayDays = 49;
    } else if (selectedPlaybook === 'Full NDA Playbook') {
      readinessScore = 35;
      riskLevel = 'High';
      estimatedDelayDays = 120;
    } else if (selectedPlaybook === 'EMA IMPD Playbook') {
      readinessScore = 75;
      riskLevel = 'Medium';
      estimatedDelayDays = 30;
    }

    const today = new Date();
    const estimatedSubmissionDate = new Date(today.setDate(today.getDate() + estimatedDelayDays))
      .toISOString()
      .slice(0, 10);

    // Filter recommendations to match the selected playbook
    const recommendations = missingSections
      .filter((section, idx) => idx < 5) // Limit to top 5 recommendations
      .map(section => `Upload ${section} immediately.`);

    console.log(`Returning readiness score: ${readinessScore}% for playbook: ${selectedPlaybook}`);

    res.status(200).json({
      success: true,
      playbookUsed: selectedPlaybook,
      readinessScore,
      missingSections: missingSections.slice(0, 8), // Limit to 8 missing sections
      riskLevel,
      estimatedDelayDays,
      estimatedSubmissionDate,
      recommendations,
    });
  } catch (error) {
    console.error('❌ Advisor readiness check failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'advisor-standalone',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint with API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'Concept2Cure Advisor API',
    version: '1.0.0',
    endpoints: [
      {
        path: '/api/advisor/check-readiness',
        method: 'GET',
        query: 'playbook=Fast IND Playbook | Full NDA Playbook | EMA IMPD Playbook',
        description: 'Get detailed readiness data based on the selected playbook',
      },
      {
        path: '/api/health',
        method: 'GET',
        description: 'Health check endpoint',
      },
    ],
  });
});

// Start server
const PORT = 7000;
app.listen(PORT, () => {
  console.log(`✅ Advisor Standalone API running on port ${PORT}`);
  console.log(`🔹 Try: curl http://localhost:${PORT}/api/advisor/check-readiness`);
  console.log(
    `🔹 Or with a playbook: curl http://localhost:${PORT}/api/advisor/check-readiness?playbook=Full%20NDA%20Playbook`
  );
});
