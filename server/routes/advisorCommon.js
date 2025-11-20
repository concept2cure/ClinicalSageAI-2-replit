// /server/routes/advisorCommon.js
// Using CommonJS pattern to match other route files

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

console.log('✅ Advisor CommonJS routes loaded successfully');
console.log('✅ Advisor routes available:');
console.log('    - GET /check-readiness');
console.log('    - POST /check-readiness');

// Define CTD Critical Sections (Base Model for Playbook Adjustment)
const CTDChecklist = {
  'Module 1': [
    'Form 1571',
    'Form 1572',
    'Cover Letter',
    'Investigator Brochure',
    'US Agent Appointment',
  ],
  'Module 2': [
    'Intro Summary',
    'Overall Quality Summary',
    'Nonclinical Overview',
    'Clinical Overview',
    'Tabulated Summaries',
  ],
  'Module 3': [
    'Drug Substance Specs',
    'Drug Product Specs',
    'CMC Stability Data',
    'GMP Certificates',
  ],
  'Module 4': [
    'Pharmacology Reports',
    'Pharmacokinetics Reports',
    'Toxicology Reports',
    'Genotoxicity Reports',
  ],
  'Module 5': [
    'Clinical Protocols',
    'Clinical Study Reports (CSR)',
    'Investigator Brochure Updates',
    'Clinical Safety Reports',
  ],
};

// Define criticality weights (higher = more critical to submission)
const sectionWeights = {
  'CMC Stability Data': 5,
  'Clinical Study Reports (CSR)': 5,
  'Clinical Safety Reports': 5,
  'Drug Substance Specs': 4,
  'Drug Product Specs': 4,
  'Toxicology Reports': 4,
  'Nonclinical Overview': 3,
  'Investigator Brochure': 3,
  'Clinical Protocols': 3,
  'GMP Certificates': 2,
  'Form 1571': 2,
  'Form 1572': 2,
  'Cover Letter': 1,
  'Intro Summary': 1,
  'Overall Quality Summary': 1,
  'Tabulated Summaries': 1,
  'Pharmacology Reports': 2,
  'Pharmacokinetics Reports': 2,
  'Genotoxicity Reports': 2,
  'Investigator Brochure Updates': 2,
  'US Agent Appointment': 1,
};

const metadataPath = path.join(__dirname, '../../uploads/metadata.json');

// GET /api/advisor/check-readiness
router.get('/check-readiness', (req, res) => {
  console.log('✅ GET /check-readiness endpoint called');
  try {
    if (!fs.existsSync(metadataPath)) {
      return res.status(200).json({
        success: true,
        readinessScore: 0,
        missingSections: Object.values(CTDChecklist).flat(),
        riskLevel: 'High',
        estimatedDelayDays: 90,
        recommendations: ['Start uploading critical CTD documents immediately.'],
      });
    }

    const metaRaw = fs.readFileSync(metadataPath, { encoding: 'utf8' });
    const documents = metaRaw.trim().length > 0 ? JSON.parse(metaRaw) : [];

    const uploadedSections = new Set(
      documents.map(doc => (doc.moduleLinked || '').toLowerCase().trim())
    );

    // Calculate Readiness
    let totalWeight = 0;
    let completedWeight = 0;
    let missingSections = [];

    Object.entries(CTDChecklist).forEach(([module, sections]) => {
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

    const readinessScore = Math.round((completedWeight / totalWeight) * 100);

    // Calculate Risk
    let riskLevel = 'Low';
    if (readinessScore < 50) riskLevel = 'High';
    else if (readinessScore < 80) riskLevel = 'Medium';

    // Delay Prediction
    let estimatedDelayDays = missingSections.length * 7; // Assume 1 week delay per missing section

    // Recommendations
    const recommendations = missingSections.map(section => `Upload ${section} immediately.`);

    res.status(200).json({
      success: true,
      readinessScore,
      missingSections,
      riskLevel,
      estimatedDelayDays,
      recommendations,
    });
  } catch (error) {
    console.error('❌ Advisor readiness check failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// POST /api/advisor/check-readiness - Same logic, POST method
router.post('/check-readiness', (req, res) => {
  console.log('✅ POST /check-readiness endpoint called');
  try {
    if (!fs.existsSync(metadataPath)) {
      return res.status(200).json({
        success: true,
        readinessScore: 0,
        missingSections: Object.values(CTDChecklist).flat(),
        riskLevel: 'High',
        estimatedDelayDays: 90,
        recommendations: ['Start uploading critical CTD documents immediately.'],
      });
    }

    const metaRaw = fs.readFileSync(metadataPath, { encoding: 'utf8' });
    const documents = metaRaw.trim().length > 0 ? JSON.parse(metaRaw) : [];

    const uploadedSections = new Set(
      documents.map(doc => (doc.moduleLinked || '').toLowerCase().trim())
    );

    // Calculate Readiness
    let totalWeight = 0;
    let completedWeight = 0;
    let missingSections = [];

    Object.entries(CTDChecklist).forEach(([module, sections]) => {
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

    const readinessScore = Math.round((completedWeight / totalWeight) * 100);

    // Calculate Risk
    let riskLevel = 'Low';
    if (readinessScore < 50) riskLevel = 'High';
    else if (readinessScore < 80) riskLevel = 'Medium';

    // Delay Prediction
    let estimatedDelayDays = missingSections.length * 7; // Assume 1 week delay per missing section

    // Recommendations
    const recommendations = missingSections.map(section => `Upload ${section} immediately.`);

    res.status(200).json({
      success: true,
      readinessScore,
      missingSections,
      riskLevel,
      estimatedDelayDays,
      recommendations,
    });
  } catch (error) {
    console.error('❌ Advisor readiness check failed:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;
