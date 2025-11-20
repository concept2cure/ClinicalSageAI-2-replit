// /server/routes/advisorRoutes.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { Configuration, OpenAIApi } = require('openai');

// Initialize OpenAI client with API key
const openaiApiKey = process.env.OPENAI_API_KEY;
let openai;

if (openaiApiKey) {
  const configuration = new Configuration({
    apiKey: openaiApiKey,
  });
  openai = new OpenAIApi(configuration);
  console.log('✅ OpenAI client initialized for AI Regulatory Advisor');
} else {
  console.warn('⚠️ OpenAI API key not provided, using mock responses for AI Regulatory Advisor');
}

// Directory to store submission playbooks
const playbooks = {
  'fast-ind': {
    name: 'Fast IND Submission',
    targetDays: 30,
    criticalSections: [
      { id: 'ind-form-1571', name: 'FDA Form 1571', weight: 10, criticality: 'critical' },
      { id: 'protocol', name: 'Clinical Protocol', weight: 20, criticality: 'critical' },
      {
        id: 'investigator-brochure',
        name: 'Investigator Brochure',
        weight: 15,
        criticality: 'critical',
      },
      { id: 'cmc-summary', name: 'CMC Summary', weight: 15, criticality: 'critical' },
      { id: 'pharmacology-summary', name: 'Pharmacology Summary', weight: 10, criticality: 'high' },
      { id: 'toxicology-summary', name: 'Toxicology Summary', weight: 10, criticality: 'high' },
      {
        id: 'informed-consent',
        name: 'Informed Consent Document',
        weight: 8,
        criticality: 'medium',
      },
      {
        id: 'previous-human-experience',
        name: 'Previous Human Experience',
        weight: 5,
        criticality: 'medium',
      },
      { id: 'coa-validation', name: 'COA Validation', weight: 5, criticality: 'low' },
      { id: 'data-monitoring-plan', name: 'Data Monitoring Plan', weight: 2, criticality: 'low' },
    ],
  },
  'full-nda': {
    name: 'Full NDA Submission',
    targetDays: 180,
    criticalSections: [
      { id: 'fda-form-356h', name: 'FDA Form 356h', weight: 5, criticality: 'critical' },
      { id: 'cmc-module-3', name: 'CMC (Module 3)', weight: 20, criticality: 'critical' },
      {
        id: 'clinical-efficacy-section',
        name: 'Clinical Efficacy (Module 5)',
        weight: 20,
        criticality: 'critical',
      },
      {
        id: 'clinical-safety-section',
        name: 'Clinical Safety (Module 5)',
        weight: 20,
        criticality: 'critical',
      },
      { id: 'stability-studies', name: 'Stability Studies', weight: 10, criticality: 'critical' },
      {
        id: 'nonclinical-section',
        name: 'Nonclinical Studies (Module 4)',
        weight: 10,
        criticality: 'high',
      },
      {
        id: 'clinical-overview-module-2-5',
        name: 'Clinical Overview (Module 2.5)',
        weight: 8,
        criticality: 'high',
      },
      {
        id: 'csr-pivotal-studies',
        name: 'CSRs of Pivotal Studies',
        weight: 15,
        criticality: 'high',
      },
      { id: 'labeling', name: 'Proposed Labeling', weight: 5, criticality: 'medium' },
      {
        id: 'risk-management-plan',
        name: 'Risk Management Plan',
        weight: 7,
        criticality: 'medium',
      },
    ],
  },
  'ema-impd': {
    name: 'EMA IMPD Submission',
    targetDays: 60,
    criticalSections: [
      { id: 'cover-letter', name: 'Cover Letter', weight: 5, criticality: 'medium' },
      {
        id: 'impd-quality-section',
        name: 'IMPD Quality Section',
        weight: 20,
        criticality: 'critical',
      },
      {
        id: 'impd-nonclinical-section',
        name: 'IMPD Nonclinical Section',
        weight: 15,
        criticality: 'high',
      },
      {
        id: 'impd-clinical-section',
        name: 'IMPD Clinical Section',
        weight: 20,
        criticality: 'critical',
      },
      { id: 'protocol', name: 'Clinical Protocol', weight: 20, criticality: 'critical' },
      {
        id: 'investigator-brochure',
        name: 'Investigator Brochure',
        weight: 15,
        criticality: 'critical',
      },
      {
        id: 'gmp-compliance',
        name: 'GMP Compliance Documentation',
        weight: 10,
        criticality: 'high',
      },
      { id: 'smpc', name: 'Summary of Product Characteristics', weight: 5, criticality: 'medium' },
      {
        id: 'subject-information-sheet',
        name: 'Subject Information Sheet',
        weight: 5,
        criticality: 'medium',
      },
      {
        id: 'informed-consent-form',
        name: 'Informed Consent Form',
        weight: 5,
        criticality: 'medium',
      },
    ],
  },
  'pmda-ctn': {
    name: 'PMDA Clinical Trial Notification',
    targetDays: 45,
    criticalSections: [
      { id: 'ctn-cover-letter', name: 'CTN Cover Letter', weight: 5, criticality: 'medium' },
      {
        id: 'investigational-product-summary',
        name: 'Investigational Product Summary',
        weight: 15,
        criticality: 'critical',
      },
      {
        id: 'quality-data-summary',
        name: 'Quality Data Summary',
        weight: 15,
        criticality: 'critical',
      },
      {
        id: 'non-clinical-study-results',
        name: 'Non-Clinical Study Results',
        weight: 15,
        criticality: 'high',
      },
      {
        id: 'clinical-protocol',
        name: 'Clinical Protocol (Japanese)',
        weight: 20,
        criticality: 'critical',
      },
      {
        id: 'informed-consent-japanese',
        name: 'Informed Consent (Japanese)',
        weight: 10,
        criticality: 'high',
      },
      {
        id: 'investigator-brochure-japanese',
        name: 'Investigator Brochure (Japanese)',
        weight: 15,
        criticality: 'critical',
      },
      { id: 'list-of-study-sites', name: 'List of Study Sites', weight: 5, criticality: 'medium' },
      { id: 'gmp-data', name: 'GMP Data', weight: 10, criticality: 'high' },
      { id: 'local-labeling', name: 'Local Labeling Documents', weight: 5, criticality: 'medium' },
    ],
  },
};

// Helper function to get vault documents
async function getVaultDocuments() {
  const uploadDir = path.join(__dirname, '../../uploads');
  const metadataPath = path.join(uploadDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return [];
  }

  try {
    const metaRaw = fs.readFileSync(metadataPath, 'utf8');
    if (!metaRaw || metaRaw.trim().length === 0) {
      return [];
    }

    return JSON.parse(metaRaw);
  } catch (error) {
    console.error('❌ Error reading vault documents:', error);
    return [];
  }
}

// Helper to detect document types based on metadata and document name
function detectDocumentType(document) {
  const fileName = document.originalName?.toLowerCase() || '';
  const moduleLinked = document.moduleLinked?.toLowerCase() || '';
  const documentType = document.documentType?.toLowerCase() || '';

  // Check for form 1571
  if (fileName.includes('1571') || fileName.includes('form') || documentType.includes('fda form')) {
    return 'ind-form-1571';
  }

  // Check for protocol
  if (
    fileName.includes('protocol') ||
    documentType.includes('protocol') ||
    moduleLinked.includes('protocol')
  ) {
    return 'protocol';
  }

  // Check for Investigator Brochure
  if (
    fileName.includes('investigator brochure') ||
    fileName.includes('ib') ||
    documentType.includes('investigator brochure') ||
    documentType.includes('ib')
  ) {
    return 'investigator-brochure';
  }

  // Check for CMC
  if (
    fileName.includes('cmc') ||
    fileName.includes('chemistry') ||
    moduleLinked.includes('module 3') ||
    documentType.includes('cmc')
  ) {
    return 'cmc-module-3';
  }

  // Check for clinical data
  if (
    fileName.includes('clinical') ||
    moduleLinked.includes('module 5') ||
    documentType.includes('clinical')
  ) {
    return 'clinical-efficacy-section';
  }

  // Check for CSR
  if (
    fileName.includes('csr') ||
    fileName.includes('clinical study report') ||
    documentType.includes('csr')
  ) {
    return 'csr-pivotal-studies';
  }

  // Return undefined if no match
  return undefined;
}

// GET /api/advisor/playbooks - Get available submission playbooks
router.get('/playbooks', (req, res) => {
  try {
    const playbookList = Object.keys(playbooks).map(key => ({
      id: key,
      name: playbooks[key].name,
      targetDays: playbooks[key].targetDays,
      sectionCount: playbooks[key].criticalSections.length,
    }));

    return res.status(200).json({
      success: true,
      playbooks: playbookList,
    });
  } catch (error) {
    console.error('❌ Error getting playbooks:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// GET /api/advisor/playbook/:id - Get specific playbook details
router.get('/playbook/:id', (req, res) => {
  try {
    const playbookId = req.params.id;

    if (!playbooks[playbookId]) {
      return res.status(404).json({ success: false, message: 'Playbook not found.' });
    }

    return res.status(200).json({
      success: true,
      playbook: playbooks[playbookId],
    });
  } catch (error) {
    console.error('❌ Error getting playbook details:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// POST /api/advisor/check-readiness - Check submission readiness
router.post('/check-readiness', async (req, res) => {
  try {
    const { playbookId = 'fast-ind', projectId = 'default' } = req.body;

    // Get playbook details
    const playbook = playbooks[playbookId];
    if (!playbook) {
      return res.status(404).json({ success: false, message: 'Playbook not found.' });
    }

    // Get vault documents
    const documents = await getVaultDocuments();
    const projectDocuments =
      projectId !== 'all' ? documents.filter(doc => doc.projectId === projectId) : documents;

    // Calculate readiness score based on document types
    const readinessData = {
      submission: {
        type: playbook.name,
        targetDays: playbook.targetDays,
        lastUpdated: new Date().toISOString(),
      },
      sections: [],
      statistics: {
        totalSections: playbook.criticalSections.length,
        completedSections: 0,
        criticalSectionsMissing: 0,
        readinessScore: 0,
        estimatedDelay: 0,
      },
      risks: {
        high: [],
        medium: [],
        low: [],
      },
      nextActions: [],
    };

    // Analyze each critical section from the playbook
    let totalWeight = 0;
    let weightedScore = 0;

    playbook.criticalSections.forEach(section => {
      totalWeight += section.weight;

      // Check if we have a document for this section
      const matchingDocs = projectDocuments.filter(doc => {
        const detectedType = detectDocumentType(doc);
        return detectedType === section.id;
      });

      const hasDocument = matchingDocs.length > 0;
      const latestDocument = hasDocument
        ? matchingDocs.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime))[0]
        : null;

      // Add section to readiness data
      readinessData.sections.push({
        id: section.id,
        name: section.name,
        criticality: section.criticality,
        weight: section.weight,
        completed: hasDocument,
        documentId: latestDocument ? latestDocument.storedName : null,
        lastUpdated: latestDocument ? latestDocument.uploadTime : null,
      });

      // If section is completed, add to weighted score
      if (hasDocument) {
        weightedScore += section.weight;
        readinessData.statistics.completedSections++;
      } else {
        // If section is missing, add to risks based on criticality
        if (section.criticality === 'critical') {
          readinessData.statistics.criticalSectionsMissing++;
          readinessData.risks.high.push({
            section: section.name,
            message: `Critical section '${section.name}' is missing`,
          });

          // Add as a top priority next action
          readinessData.nextActions.push({
            priority: 1,
            action: `Upload ${section.name}`,
            section: section.id,
            impact: 'Critical for submission approval',
          });
        } else if (section.criticality === 'high') {
          readinessData.risks.medium.push({
            section: section.name,
            message: `Important section '${section.name}' is missing`,
          });

          // Add as a medium priority next action
          readinessData.nextActions.push({
            priority: 2,
            action: `Upload ${section.name}`,
            section: section.id,
            impact: 'Important for timely approval',
          });
        } else {
          readinessData.risks.low.push({
            section: section.name,
            message: `Section '${section.name}' is missing`,
          });

          // Add as a low priority next action
          readinessData.nextActions.push({
            priority: 3,
            action: `Upload ${section.name}`,
            section: section.id,
            impact: 'Completes submission package',
          });
        }
      }
    });

    // Calculate final readiness score (0-100)
    readinessData.statistics.readinessScore = Math.round((weightedScore / totalWeight) * 100);

    // Calculate estimated delay based on critical sections missing
    const baselineDelay = readinessData.statistics.criticalSectionsMissing * 15; // 15 days per critical section
    readinessData.statistics.estimatedDelay = baselineDelay > 0 ? baselineDelay : 0;

    // Sort next actions by priority
    readinessData.nextActions.sort((a, b) => a.priority - b.priority);

    // If OpenAI is configured, enhance the readiness assessment with AI
    if (openai && openaiApiKey) {
      try {
        // Format sections for the prompt
        const sectionStatus = readinessData.sections
          .map(
            section =>
              `${section.name}: ${section.completed ? 'Complete' : 'Missing'} (${section.criticality} priority)`
          )
          .join('\n');

        // Create the prompt
        const prompt = `
You are a regulatory affairs expert analyzing submission readiness for a ${playbook.name}.

Current submission status:
- Overall Readiness: ${readinessData.statistics.readinessScore}%
- Critical Sections Missing: ${readinessData.statistics.criticalSectionsMissing}
- Documents completed: ${readinessData.statistics.completedSections}/${readinessData.statistics.totalSections}

Section Status:
${sectionStatus}

Based on this information, provide:
1. A succinct assessment of submission readiness (2-3 sentences)
2. The most critical gap that should be addressed immediately (1 sentence)
3. Estimated timeline impact if issues aren't addressed (1 sentence)
4. One specific, actionable recommendation (1 sentence)

Format your response as a JSON object with the following fields: assessment, criticalGap, timelineImpact, recommendation.
`;

        // Call OpenAI API
        const completion = await openai.createCompletion({
          model: 'gpt-4-turbo',
          prompt: prompt,
          max_tokens: 500,
          temperature: 0.3,
        });

        // Parse the response
        let aiInsights;
        try {
          const aiResponse = completion.data.choices[0].text.trim();
          aiInsights = JSON.parse(aiResponse);
        } catch (parseError) {
          console.error('❌ Error parsing AI response:', parseError);
          aiInsights = {
            assessment: 'Unable to generate AI assessment at this time.',
            criticalGap: '',
            timelineImpact: '',
            recommendation: '',
          };
        }

        // Add AI insights to response
        readinessData.aiInsights = aiInsights;
      } catch (aiError) {
        console.error('❌ Error enhancing with AI:', aiError);
        readinessData.aiInsights = {
          assessment: 'AI enhancement unavailable at this time.',
          criticalGap: '',
          timelineImpact: '',
          recommendation: '',
        };
      }
    } else {
      // Provide default insights if OpenAI is not configured
      readinessData.aiInsights = {
        assessment: `Your submission is ${readinessData.statistics.readinessScore}% ready with ${readinessData.statistics.criticalSectionsMissing} critical sections missing.`,
        criticalGap:
          readinessData.risks.high.length > 0
            ? `The most critical gap is the missing ${readinessData.risks.high[0].section}.`
            : 'No critical gaps identified.',
        timelineImpact: `Current gaps may delay submission by approximately ${readinessData.statistics.estimatedDelay} days.`,
        recommendation:
          readinessData.nextActions.length > 0
            ? `Prioritize uploading the ${readinessData.nextActions[0].action.replace('Upload ', '')}.`
            : 'Continue preparing remaining documents.',
      };
    }

    return res.status(200).json({
      success: true,
      readiness: readinessData,
    });
  } catch (error) {
    console.error('❌ Error checking submission readiness:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// POST /api/advisor/recommend-actions - Get recommended next actions
router.post('/recommend-actions', async (req, res) => {
  try {
    const { playbookId = 'fast-ind', projectId = 'default' } = req.body;

    // First get the readiness assessment to base recommendations on
    const readinessResponse = await fetch(
      `${req.protocol}://${req.get('host')}/api/advisor/check-readiness`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playbookId, projectId }),
      }
    );

    if (!readinessResponse.ok) {
      throw new Error('Failed to fetch readiness assessment');
    }

    const readinessData = await readinessResponse.json();

    // Format actions by priority
    const highPriorityActions = readinessData.readiness.nextActions
      .filter(action => action.priority === 1)
      .map(action => ({
        ...action,
        priorityLabel: 'HIGH',
        impact: 'Critical for submission - blocking issue',
      }));

    const mediumPriorityActions = readinessData.readiness.nextActions
      .filter(action => action.priority === 2)
      .map(action => ({
        ...action,
        priorityLabel: 'MEDIUM',
        impact: 'Important for timely approval',
      }));

    const lowPriorityActions = readinessData.readiness.nextActions
      .filter(action => action.priority === 3)
      .map(action => ({
        ...action,
        priorityLabel: 'LOW',
        impact: 'Completes submission package',
      }));

    // Add timeline estimations
    const recommendedActions = {
      readinessScore: readinessData.readiness.statistics.readinessScore,
      currentStatus: readinessData.readiness.aiInsights.assessment,
      currentTimeline: {
        targetDate: new Date(Date.now() + readinessData.readiness.submission.targetDays * 86400000)
          .toISOString()
          .split('T')[0],
        estimatedDelay: readinessData.readiness.statistics.estimatedDelay,
        adjusted: new Date(
          Date.now() +
            (readinessData.readiness.submission.targetDays +
              readinessData.readiness.statistics.estimatedDelay) *
              86400000
        )
          .toISOString()
          .split('T')[0],
      },
      actions: {
        critical: highPriorityActions,
        important: mediumPriorityActions,
        recommended: lowPriorityActions,
      },
      timeline: {
        submission: readinessData.readiness.submission,
        adjustments: [
          {
            reason: 'Critical sections missing',
            days: readinessData.readiness.statistics.criticalSectionsMissing * 15,
          },
        ],
      },
    };

    return res.status(200).json({
      success: true,
      recommendations: recommendedActions,
    });
  } catch (error) {
    console.error('❌ Error generating recommendations:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// POST /api/advisor/submission-timeline - Get submission timeline
router.post('/submission-timeline', async (req, res) => {
  try {
    const { playbookId = 'fast-ind', projectId = 'default', targetDate } = req.body;

    // First get the readiness assessment to base timeline on
    const readinessResponse = await fetch(
      `${req.protocol}://${req.get('host')}/api/advisor/check-readiness`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playbookId, projectId }),
      }
    );

    if (!readinessResponse.ok) {
      throw new Error('Failed to fetch readiness assessment');
    }

    const readinessData = await readinessResponse.json();

    // Get the playbook details
    const playbook = playbooks[playbookId];
    if (!playbook) {
      return res.status(404).json({ success: false, message: 'Playbook not found.' });
    }

    // Calculate dates
    const today = new Date();
    let submissionTargetDate;

    if (targetDate) {
      submissionTargetDate = new Date(targetDate);
    } else {
      submissionTargetDate = new Date(today);
      submissionTargetDate.setDate(submissionTargetDate.getDate() + playbook.targetDays);
    }

    // Adjust based on readiness
    const adjustedDate = new Date(submissionTargetDate);
    adjustedDate.setDate(
      adjustedDate.getDate() + readinessData.readiness.statistics.estimatedDelay
    );

    // Calculate review period (typically 30 days for IND, 10 months for NDA)
    const reviewPeriodDays = playbookId === 'full-nda' ? 300 : 30;
    const reviewCompletionDate = new Date(adjustedDate);
    reviewCompletionDate.setDate(reviewCompletionDate.getDate() + reviewPeriodDays);

    // Format timeline
    const timeline = {
      submission: {
        type: playbook.name,
        baselineDays: playbook.targetDays,
        adjustments: [],
      },
      dates: {
        today: today.toISOString().split('T')[0],
        targetSubmission: submissionTargetDate.toISOString().split('T')[0],
        adjustedSubmission: adjustedDate.toISOString().split('T')[0],
        reviewCompletion: reviewCompletionDate.toISOString().split('T')[0],
      },
      readiness: {
        score: readinessData.readiness.statistics.readinessScore,
        criticalSectionsMissing: readinessData.readiness.statistics.criticalSectionsMissing,
        estimatedDelayDays: readinessData.readiness.statistics.estimatedDelay,
      },
      milestones: [],
    };

    // Add adjustments
    if (readinessData.readiness.statistics.criticalSectionsMissing > 0) {
      timeline.submission.adjustments.push({
        reason: `${readinessData.readiness.statistics.criticalSectionsMissing} critical sections missing`,
        days: readinessData.readiness.statistics.criticalSectionsMissing * 15,
        impact: 'delay',
      });
    }

    // Add milestones
    timeline.milestones = [
      {
        name: 'Complete Critical Document Collection',
        date: new Date(today.getTime() + (playbook.targetDays / 3) * 86400000)
          .toISOString()
          .split('T')[0],
        type: 'document-collection',
        description: 'All critical documents should be collected by this date',
        status:
          readinessData.readiness.statistics.criticalSectionsMissing === 0
            ? 'completed'
            : 'pending',
      },
      {
        name: 'Internal QC Review',
        date: new Date(today.getTime() + playbook.targetDays * 0.7 * 86400000)
          .toISOString()
          .split('T')[0],
        type: 'qc-review',
        description: 'Internal quality check of all submission documents',
        status: 'pending',
      },
      {
        name: 'Planned Submission Date',
        date: submissionTargetDate.toISOString().split('T')[0],
        type: 'submission',
        description: 'Original target date for submission',
        status: 'pending',
      },
      {
        name: 'Adjusted Submission Date',
        date: adjustedDate.toISOString().split('T')[0],
        type: 'adjusted-submission',
        description: 'Adjusted date based on current readiness',
        status: 'pending',
      },
      {
        name: 'Expected Regulatory Decision',
        date: reviewCompletionDate.toISOString().split('T')[0],
        type: 'decision',
        description: 'Expected date for regulatory decision',
        status: 'pending',
      },
    ];

    return res.status(200).json({
      success: true,
      timeline,
    });
  } catch (error) {
    console.error('❌ Error generating submission timeline:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;
