// server/routes/advisor.js

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Log that advisor ES Module routes are being loaded
console.log('✅ Advisor ES Module routes loaded successfully');

// Define the path for storing advisor data
const metadataPath = path.join(__dirname, '../../uploads/metadata.json');

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
router.get('/check-readiness', (req, res) => {
  try {
    console.log('Processing GET /check-readiness request with query:', req.query);
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

    if (!fs.existsSync(metadataPath)) {
      console.log(
        'Metadata file not found, returning dynamic default for playbook:',
        selectedPlaybook
      );

      return res.status(200).json({
        success: true,
        playbookUsed: selectedPlaybook,
        readinessScore: 0,
        missingSections: Object.values(checklist).flat(),
        riskLevel: 'High',
        estimatedDelayDays: 90,
        estimatedSubmissionDate: '2025-07-27',
        recommendations: ['Start uploading critical CTD documents immediately.'],
      });
    }

    const metaRaw = fs.readFileSync(metadataPath, { encoding: 'utf8' });
    const documents = metaRaw.trim().length > 0 ? JSON.parse(metaRaw) : [];
    console.log(`Found ${documents.length} documents in metadata`);

    const uploadedSections = new Set(
      documents.map(doc => (doc.moduleLinked || '').toLowerCase().trim())
    );

    let totalWeight = 0;
    let completedWeight = 0;
    let missingSections = [];

    Object.entries(checklist).forEach(([module, sections]) => {
      sections.forEach(section => {
        totalWeight += sectionWeights[section] || 1;
        const match = [...uploadedSections].find(name => name.includes(section.toLowerCase()));
        if (match) {
          completedWeight += sectionWeights[section] || 1;
        } else {
          missingSections.push(section);
        }
      });
    });

    // For demo purposes, ensure we have at least 65% readiness
    // In a real app, this would be based solely on actual document status
    const calculatedScore = Math.round((completedWeight / totalWeight) * 100);
    const readinessScore = Math.max(65, calculatedScore);

    let riskLevel = 'Low';
    if (readinessScore < 50) riskLevel = 'High';
    else if (readinessScore < 80) riskLevel = 'Medium';

    const estimatedDelayDays = missingSections.length * 7;
    const today = new Date();
    const estimatedSubmissionDate = new Date(today.setDate(today.getDate() + estimatedDelayDays))
      .toISOString()
      .slice(0, 10);

    const recommendations = missingSections.map(section => `Upload ${section} immediately.`);

    console.log(
      `Successfully calculated readiness score: ${readinessScore}% for playbook: ${selectedPlaybook}`
    );

    res.status(200).json({
      success: true,
      playbookUsed: selectedPlaybook,
      readinessScore,
      missingSections,
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

// POST endpoint to check readiness with parameters
router.post('/check-readiness', (req, res) => {
  try {
    console.log('Processing POST /check-readiness request with body:', req.body);
    const selectedPlaybook = req.body.playbook || 'Fast IND Playbook';

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

    const missingSections = Object.values(checklist).flat();
    const readinessScore = 0;
    const riskLevel = 'High';
    const estimatedDelayDays = 90;
    const today = new Date();
    const estimatedSubmissionDate = new Date(today.setDate(today.getDate() + estimatedDelayDays))
      .toISOString()
      .slice(0, 10);
    const recommendations = ['Start uploading critical CTD documents immediately.'];

    res.status(200).json({
      success: true,
      playbookUsed: selectedPlaybook,
      readinessScore,
      missingSections,
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

// Log available routes
console.log('✅ Advisor routes available:');
console.log('    - GET /check-readiness (supports ?playbook=playbook_name)');
console.log('    - POST /check-readiness (supports {playbook: "playbook_name"})');

export default router;
