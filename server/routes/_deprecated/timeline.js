import express from 'express';
const router = express.Router();

/**
 * GET /api/timeline/milestones?type=ind
 * Returns an array of milestone objects for a specific submission type
 */
router.get('/milestones', (req, res) => {
  const submissionType = req.query.type || 'ind';

  // In a real implementation, this would be retrieved from a database
  // Base IND timeline
  const indTimeline = [
    { id: 1, title: 'Project Kickoff', date: '2025-01-15', completed: true },
    { id: 2, title: 'Protocol Development', date: '2025-02-10', completed: true },
    { id: 3, title: 'IND Preparation', date: '2025-03-20', completed: true },
    { id: 4, title: 'CMC Documentation', date: '2025-04-15', completed: false },
    { id: 5, title: 'Nonclinical Review', date: '2025-05-05', completed: false },
    { id: 6, title: 'IND Submission', date: '2025-06-10', completed: false },
    { id: 7, title: 'FDA Feedback', date: '2025-07-10', completed: false },
    { id: 8, title: 'Trial Start', date: '2025-08-01', completed: false },
  ];

  // NDA timeline
  const ndaTimeline = [
    { id: 1, title: 'Pre-NDA Meeting', date: '2025-01-15', completed: true },
    { id: 2, title: 'Clinical Study Reports', date: '2025-02-25', completed: true },
    { id: 3, title: 'NDA Preparation', date: '2025-04-10', completed: false },
    { id: 4, title: 'CMC Documentation', date: '2025-05-20', completed: false },
    { id: 5, title: 'NDA Submission', date: '2025-07-15', completed: false },
    { id: 6, title: 'FDA Filing Decision', date: '2025-09-01', completed: false },
    { id: 7, title: 'FDA Review', date: '2025-11-20', completed: false },
    { id: 8, title: 'PDUFA Date', date: '2026-01-15', completed: false },
  ];

  // BLA timeline
  const blaTimeline = [
    { id: 1, title: 'Pre-BLA Meeting', date: '2025-01-20', completed: true },
    { id: 2, title: 'Clinical Study Reports', date: '2025-03-15', completed: false },
    { id: 3, title: 'Manufacturing Readiness', date: '2025-05-10', completed: false },
    { id: 4, title: 'BLA Preparation', date: '2025-07-05', completed: false },
    { id: 5, title: 'BLA Submission', date: '2025-09-01', completed: false },
    { id: 6, title: 'FDA Filing Decision', date: '2025-11-01', completed: false },
    { id: 7, title: 'FDA Inspection', date: '2026-01-15', completed: false },
    { id: 8, title: 'PDUFA Date', date: '2026-03-01', completed: false },
  ];

  // MAA timeline
  const maaTimeline = [
    { id: 1, title: 'Scientific Advice', date: '2025-01-15', completed: true },
    { id: 2, title: 'Clinical Study Reports', date: '2025-03-10', completed: false },
    { id: 3, title: 'CMC Documentation', date: '2025-05-15', completed: false },
    { id: 4, title: 'MAA Preparation', date: '2025-07-20', completed: false },
    { id: 5, title: 'MAA Submission', date: '2025-09-15', completed: false },
    { id: 6, title: 'EMA Validation', date: '2025-10-15', completed: false },
    { id: 7, title: 'CHMP Opinion', date: '2026-01-20', completed: false },
    { id: 8, title: 'EC Decision', date: '2026-03-15', completed: false },
  ];

  let timeline;

  // Return the appropriate timeline based on the submission type
  switch (submissionType) {
    case 'nda':
      timeline = ndaTimeline;
      break;
    case 'bla':
      timeline = blaTimeline;
      break;
    case 'maa':
      timeline = maaTimeline;
      break;
    default:
      timeline = indTimeline;
  }

  res.json({ timeline, submissionType });
});

/**
 * GET /api/timeline/activities
 * Returns an array of recent activities
 */
router.get('/activities', (req, res) => {
  // In a real implementation, this would be retrieved from a database
  const activities = [
    { id: 1, date: '2025-04-25', description: 'Updated IND Module 3 CMC documentation' },
    { id: 2, date: '2025-04-22', description: 'Completed toxicology report review' },
    { id: 3, date: '2025-04-20', description: 'Added clinical protocol to Module 5' },
    { id: 4, date: '2025-04-18', description: 'Scheduled pre-IND meeting with FDA' },
    { id: 5, date: '2025-04-15', description: 'Finalized Phase 1 study design' },
  ];

  res.json({ activities });
});

/**
 * GET /api/timeline/stats?type=ind
 * Returns statistics for the timeline
 */
router.get('/stats', (req, res) => {
  const submissionType = req.query.type || 'ind';

  // Map of submission types to target dates
  const targetDates = {
    ind: 'June 10, 2025',
    nda: 'November 15, 2025',
    bla: 'December 20, 2025',
    maa: 'January 10, 2026',
  };

  // In a real implementation, these would be calculated based on the milestones
  const stats = {
    progress: '42%',
    targetDate: targetDates[submissionType] || targetDates.ind,
    milestonesCompleted: '3 of 8',
  };

  res.json({ stats, submissionType });
});

export default router;
