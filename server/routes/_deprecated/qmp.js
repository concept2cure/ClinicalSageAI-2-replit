/**
 * QMP Module API
 *
 * This module provides endpoints for the Quality Management Plan (QMP)
 * integration with Clinical Evaluation Reports.
 */

import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// Mock QMP data (in a real app, this would come from a database)
const qmpData = {
  metadata: {
    planName: 'Quality Management Plan',
    version: '1.0.0',
    authorName: 'System User',
    authorRole: 'Quality Manager',
    dateCreated: '2025-05-01T10:00:00Z',
    lastUpdated: '2025-05-08T09:15:00Z',
    linkedCerVersion: 'Current Draft',
  },
  objectives: [
    {
      id: 1,
      title: 'Clinical Data Quality Assurance',
      description:
        'Maintain the highest standards for clinical data collection, processing, and analysis to ensure data integrity throughout the clinical evaluation process.',
      measures:
        'Data validation rate >98%, Error reporting within 24 hours, Monthly data quality audits',
      responsible: 'Clinical Data Manager',
      timeline: 'Throughout CER development and ongoing monitoring',
      status: 'in-progress',
      scopeSections: ['Clinical Background', 'Safety Analysis', 'Post-Market Surveillance'],
    },
    {
      id: 2,
      title: 'Regulatory Compliance Assurance',
      description:
        'Ensure all aspects of the clinical evaluation comply with EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, and applicable international standards.',
      measures:
        '100% compliance with regulatory requirements, Pre-submission regulatory review completed',
      responsible: 'Regulatory Affairs Manager',
      timeline: 'Verification prior to submission and ongoing monitoring',
      status: 'planned',
      scopeSections: ['State of the Art Review', 'Equivalence Assessment', 'Benefit-Risk Analysis'],
    },
  ],
  ctqFactors: [
    {
      id: 1,
      objectiveId: 1,
      name: 'Literature Search Comprehensiveness',
      description:
        'Ensuring literature searches capture all relevant clinical data for the device and equivalent devices',
      riskLevel: 'high',
      associatedSection: 'Literature Review',
      mitigation:
        'Use structured search protocol with multiple databases; independent verification of search results',
      status: 'pending',
    },
    {
      id: 2,
      objectiveId: 1,
      name: 'FAERS Data Integration',
      description: 'Ensuring complete and accurate adverse event data integration from FDA FAERS',
      riskLevel: 'medium',
      associatedSection: 'Post-Market Surveillance',
      mitigation: 'Automated data validation checks; manual verification of critical signals',
      status: 'complete',
    },
    {
      id: 3,
      objectiveId: 2,
      name: 'GSPR Documentation Completeness',
      description: 'Ensuring all applicable GSPRs are addressed with appropriate evidence',
      riskLevel: 'high',
      associatedSection: 'Benefit-Risk Analysis',
      mitigation: 'Dual verification process; regulatory expert review; completeness checklist',
      status: 'pending',
    },
    {
      id: 4,
      objectiveId: 2,
      name: 'Equivalence Methodology Validation',
      description: 'Ensuring equivalence assessment follows recognized scientific methodology',
      riskLevel: 'high',
      associatedSection: 'Equivalence Assessment',
      mitigation: 'Independent expert review; use of validated comparison metrics',
      status: 'complete',
    },
  ],
};

/**
 * GET /api/qmp/data
 * Get full QMP data
 */
router.get('/data', (req, res) => {
  try {
    logger.info('Retrieved QMP data', {
      module: 'qmp-api',
    });

    res.json(qmpData);
  } catch (error) {
    logger.error('Error retrieving QMP data', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP data',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp/ctq-for-section/:sectionName
 * Get all CtQ factors associated with a specific CER section
 */
router.get('/ctq-for-section/:sectionName', (req, res) => {
  try {
    const { sectionName } = req.params;

    if (!sectionName) {
      return res.status(400).json({
        error: 'Missing section name',
        message: 'Section name is required',
      });
    }

    // Find CtQ factors for the specified section (with improved matching)
    console.log(`Looking for CtQ factors for section: "${sectionName}"`);

    const ctqFactors = qmpData.ctqFactors.filter(factor => {
      const factorSection = factor.associatedSection.toLowerCase().trim();
      const requestedSection = sectionName.toLowerCase().trim();

      console.log(`Comparing: "${factorSection}" vs "${requestedSection}"`);
      return factorSection === requestedSection;
    });

    console.log(`Found ${ctqFactors.length} matching CtQ factors`);

    logger.info('Retrieved CtQ factors for section', {
      module: 'qmp-api',
      sectionName,
      count: ctqFactors.length,
    });

    // For each CtQ factor, add the associated objective title
    const enhancedCtqFactors = ctqFactors.map(factor => {
      const objective = qmpData.objectives.find(obj => obj.id === factor.objectiveId);
      return {
        ...factor,
        objectiveTitle: objective ? objective.title : 'Unknown Objective',
      };
    });

    res.json({
      sectionName,
      ctqFactors: enhancedCtqFactors,
      count: enhancedCtqFactors.length,
    });
  } catch (error) {
    logger.error('Error retrieving CtQ factors for section', {
      module: 'qmp-api',
      sectionName: req.params.sectionName,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve CtQ factors for section',
      message: error.message,
    });
  }
});

export default router;
