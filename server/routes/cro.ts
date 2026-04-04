/**
 * cro.ts
 *
 * Extracted from server/index.ts — CRO (Contract Research Organization) routes.
 * 14 endpoints: dashboard, clients, studies, submissions, milestones (GET/POST/PUT/DELETE).
 *
 * Routes:
 *   GET    /api/cro/dashboard         — dashboard summary
 *   GET    /api/cro/clients           — list clients
 *   POST   /api/cro/clients           — create client
 *   PUT    /api/cro/clients/:id       — update client
 *   DELETE /api/cro/clients/:id       — delete client
 *   GET    /api/cro/studies           — list studies
 *   POST   /api/cro/studies           — create study
 *   PUT    /api/cro/studies/:id       — update study
 *   GET    /api/cro/submissions       — list submissions
 *   POST   /api/cro/submissions       — create submission
 *   PUT    /api/cro/submissions/:id   — update submission
 *   GET    /api/cro/milestones        — list milestones
 *   POST   /api/cro/milestones        — create milestone
 *   PUT    /api/cro/milestones/:id    — update milestone
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

// ── Dashboard ──────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dashboardData = {
      totalClients: 24,
      activeStudies: 47,
      pendingSubmissions: 12,
      completedMilestones: 156,
      totalRevenue: 14250000,
      averageStudyDuration: 18,
      complianceScore: 94,
      teamUtilization: 87,
    };
    res.json(dashboardData);
  } catch (error) {
    console.error('[ERROR] Failed to fetch CRO dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Clients ────────────────────────────────────────────────────────────────────

router.get('/clients', async (req: Request, res: Response) => {
  try {
    const clients = [
      {
        id: 1,
        name: 'BioPharma Innovations Inc.',
        companyType: 'biotech',
        industrySegment: 'oncology',
        headquarters: 'San Francisco, CA',
        contactEmail: 'regulatory@biopharma.com',
        contractStatus: 'active',
        contractValue: 2500000,
        riskLevel: 'medium',
        activeStudies: 5,
        totalSubmissions: 12,
      },
      {
        id: 2,
        name: 'MedDevice Solutions LLC',
        companyType: 'medical_device',
        industrySegment: 'cardiology',
        headquarters: 'Boston, MA',
        contactEmail: 'ra@meddevice.com',
        contractStatus: 'active',
        contractValue: 1800000,
        riskLevel: 'low',
        activeStudies: 3,
        totalSubmissions: 8,
      },
      {
        id: 3,
        name: 'Neuro Therapeutics Corp',
        companyType: 'pharma',
        industrySegment: 'neurology',
        headquarters: 'New York, NY',
        contactEmail: 'submissions@neurotherapeutics.com',
        contractStatus: 'active',
        contractValue: 3200000,
        riskLevel: 'high',
        activeStudies: 7,
        totalSubmissions: 15,
      },
    ];
    res.json(clients);
  } catch (error) {
    console.error('[ERROR] Failed to fetch CRO clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/clients', async (req: Request, res: Response) => {
  try {
    const clientData = req.body;
    const newClient = {
      id: Date.now(),
      ...clientData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.status(201).json(newClient);
  } catch (error) {
    console.error('[ERROR] Failed to create CRO client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/clients/:id', async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.id);
    const updateData = req.body;
    const updatedClient = {
      id: clientId,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    res.json(updatedClient);
  } catch (error) {
    console.error('[ERROR] Failed to update CRO client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/clients/:id', async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('[ERROR] Failed to delete CRO client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Studies ────────────────────────────────────────────────────────────────────

router.get('/studies', async (req: Request, res: Response) => {
  try {
    const studies = [
      {
        id: 1,
        clientId: 1,
        studyNumber: 'BPI-001',
        studyTitle: 'Phase II Study of Novel Oncology Compound',
        studyType: 'phase_2',
        therapeuticArea: 'oncology',
        indication: 'Non-small cell lung cancer',
        studyStatus: 'recruiting',
        regulatoryStatus: 'ind_approved',
        targetEnrollment: 120,
        currentEnrollment: 47,
        firstPatientIn: '2024-03-15',
        studyCompletionDate: '2025-09-30',
        complianceStatus: 'compliant',
        riskLevel: 'medium',
      },
      {
        id: 2,
        clientId: 2,
        studyNumber: 'MDS-501K',
        studyTitle: 'Clinical Evaluation of Cardiac Monitoring Device',
        studyType: 'device_study',
        therapeuticArea: 'cardiology',
        indication: 'Cardiac arrhythmia monitoring',
        studyStatus: 'active',
        regulatoryStatus: 'ide_approved',
        targetEnrollment: 80,
        currentEnrollment: 65,
        firstPatientIn: '2024-01-20',
        studyCompletionDate: '2024-12-15',
        complianceStatus: 'compliant',
        riskLevel: 'low',
      },
      {
        id: 3,
        clientId: 3,
        studyNumber: 'NTC-302',
        studyTitle: 'Phase III Efficacy Study of Neuroprotective Agent',
        studyType: 'phase_3',
        therapeuticArea: 'neurology',
        indication: "Alzheimer's disease",
        studyStatus: 'planning',
        regulatoryStatus: 'pre_ind',
        targetEnrollment: 500,
        currentEnrollment: 0,
        firstPatientIn: null,
        studyCompletionDate: '2026-06-30',
        complianceStatus: 'compliant',
        riskLevel: 'high',
      },
    ];
    res.json(studies);
  } catch (error) {
    console.error('[ERROR] Failed to fetch CRO studies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/studies', async (req: Request, res: Response) => {
  try {
    const studyData = req.body;
    const newStudy = {
      id: Date.now(),
      ...studyData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.status(201).json(newStudy);
  } catch (error) {
    console.error('[ERROR] Failed to create CRO study:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/studies/:id', async (req: Request, res: Response) => {
  try {
    const studyId = parseInt(req.params.id);
    const updateData = req.body;
    const updatedStudy = {
      id: studyId,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    res.json(updatedStudy);
  } catch (error) {
    console.error('[ERROR] Failed to update CRO study:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Submissions ────────────────────────────────────────────────────────────────

router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const submissions = [
      {
        id: 1,
        clientId: 1,
        studyId: 1,
        submissionType: 'ind',
        submissionNumber: 'IND-123456',
        regulatoryRegion: 'fda',
        submissionStatus: 'approved',
        submissionDate: '2024-01-15',
        actualApprovalDate: '2024-02-28',
        complianceScore: 96,
        riskLevel: 'low',
      },
      {
        id: 2,
        clientId: 2,
        studyId: 2,
        submissionType: '510k',
        submissionNumber: 'K243567',
        regulatoryRegion: 'fda',
        submissionStatus: 'under_review',
        submissionDate: '2024-05-20',
        expectedApprovalDate: '2024-08-15',
        complianceScore: 92,
        riskLevel: 'medium',
      },
      {
        id: 3,
        clientId: 3,
        studyId: 3,
        submissionType: 'ind',
        submissionNumber: 'IND-789012',
        regulatoryRegion: 'fda',
        submissionStatus: 'draft',
        submissionDate: null,
        expectedApprovalDate: '2024-11-30',
        complianceScore: 88,
        riskLevel: 'high',
      },
    ];
    res.json(submissions);
  } catch (error) {
    console.error('[ERROR] Failed to fetch CRO submissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/submissions', async (req: Request, res: Response) => {
  try {
    const submissionData = req.body;
    const newSubmission = {
      id: Date.now(),
      ...submissionData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.status(201).json(newSubmission);
  } catch (error) {
    console.error('[ERROR] Failed to create CRO submission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/submissions/:id', async (req: Request, res: Response) => {
  try {
    const submissionId = parseInt(req.params.id);
    const updateData = req.body;
    const updatedSubmission = {
      id: submissionId,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    res.json(updatedSubmission);
  } catch (error) {
    console.error('[ERROR] Failed to update CRO submission:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Milestones ─────────────────────────────────────────────────────────────────

router.get('/milestones', async (req: Request, res: Response) => {
  try {
    const milestones = [
      {
        id: 1,
        clientId: 1,
        studyId: 1,
        title: 'First Patient First Visit',
        category: 'clinical',
        priority: 'high',
        status: 'completed',
        plannedEndDate: '2024-03-15',
        actualEndDate: '2024-03-15',
        completionPercentage: 100,
      },
      {
        id: 2,
        clientId: 1,
        studyId: 1,
        title: 'Interim Safety Analysis',
        category: 'regulatory',
        priority: 'critical',
        status: 'in_progress',
        plannedEndDate: '2024-08-30',
        actualEndDate: null,
        completionPercentage: 65,
      },
      {
        id: 3,
        clientId: 2,
        studyId: 2,
        title: '510(k) Submission Preparation',
        category: 'regulatory',
        priority: 'high',
        status: 'completed',
        plannedEndDate: '2024-05-15',
        actualEndDate: '2024-05-20',
        completionPercentage: 100,
      },
      {
        id: 4,
        clientId: 3,
        studyId: 3,
        title: 'Protocol Development',
        category: 'operational',
        priority: 'medium',
        status: 'in_progress',
        plannedEndDate: '2024-09-30',
        actualEndDate: null,
        completionPercentage: 45,
      },
    ];
    res.json(milestones);
  } catch (error) {
    console.error('[ERROR] Failed to fetch CRO milestones:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/milestones', async (req: Request, res: Response) => {
  try {
    const milestoneData = req.body;
    const newMilestone = {
      id: Date.now(),
      ...milestoneData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    res.status(201).json(newMilestone);
  } catch (error) {
    console.error('[ERROR] Failed to create CRO milestone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/milestones/:id', async (req: Request, res: Response) => {
  try {
    const milestoneId = parseInt(req.params.id);
    const updateData = req.body;
    const updatedMilestone = {
      id: milestoneId,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };
    res.json(updatedMilestone);
  } catch (error) {
    console.error('[ERROR] Failed to update CRO milestone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
