/**
 * Quality Control API Routes
 * 
 * Comprehensive API endpoints for pharmaceutical QC operations
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  insertQcSpecificationSchema,
  insertQcOosInvestigationSchema,
  insertQcBatchReleaseSchema,
  insertQcDeviationSchema,
  insertQcMicrobiologicalTestSchema,
  insertQcReferenceStandardSchema,
} from '../../shared/schema/qc-schemas';
import { storage } from '../storage';
import { requireAuthedOrgId } from '../utils/authedOrgId';

const router = Router();

// SECURITY: every single-row QC getter requires a JWT-derived
// organizationId. Pre-fix the route called storage.getQcSpecification(id)
// with no tenant filter — when the storage layer's implementation is
// real (today it's a stub returning undefined), this would have been
// a cross-tenant IDOR on regulated content (specs, OOS investigations,
// batch releases, deviations, micro tests, reference standards). The
// hardened storage interface forces the orgId at the compile boundary;
// these route updates source it from the verified JWT.

// ============================================================================
// SPECIFICATION MANAGEMENT APIS
// ============================================================================

// Get all specifications
router.get('/specifications', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientWorkspaceId } = req.query;
    if (!Number(organizationId)) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const specifications = await storage.getQcSpecifications({
      organizationId: Number(organizationId),
      clientWorkspaceId: Number(clientWorkspaceId),
    });
    res.json(specifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch specifications' });
  }
});

// Get single specification
router.get('/specifications/:id', async (req: Request, res: Response) => {
  try {
    const guardSpec = requireAuthedOrgId(req, res); if (!guardSpec.ok) return;
    const specification = await storage.getQcSpecification(Number(req.params.id), guardSpec.orgId);
    if (!specification) {
      return res.status(404).json({ error: 'Specification not found' });
    }
    res.json(specification);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch specification' });
  }
});

// Create specification
router.post('/specifications', async (req: Request, res: Response) => {
  try {
    const validatedData = insertQcSpecificationSchema.parse(req.body);
    const specification = await storage.createQcSpecification(validatedData);
    res.status(201).json(specification);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create specification' });
    }
  }
});

// Update specification
router.put('/specifications/:id', async (req: Request, res: Response) => {
  try {
    const specification = await storage.updateQcSpecification(Number(req.params.id), req.body);
    res.json(specification);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update specification' });
  }
});

// Create new version of specification
router.post('/specifications/:id/version', async (req: Request, res: Response) => {
  try {
    const { changeReason, changeDescription } = req.body;
    const newVersion = await storage.createSpecificationVersion(
      Number(req.params.id),
      changeReason,
      changeDescription
    );
    res.status(201).json(newVersion);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create specification version' });
  }
});

// Get specification versions
router.get('/specifications/:id/versions', async (req: Request, res: Response) => {
  try {
    const guardVer = requireAuthedOrgId(req, res); if (!guardVer.ok) return;
    const versions = await storage.getSpecificationVersions(Number(req.params.id), guardVer.orgId);
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch specification versions' });
  }
});

// ============================================================================
// OOS INVESTIGATION APIS
// ============================================================================

// Get all OOS investigations
router.get('/oos-investigations', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientWorkspaceId, status, priority } = req.query;
    const investigations = await storage.getOosInvestigations({
      organizationId: Number(organizationId),
      clientWorkspaceId: Number(clientWorkspaceId),
      status: status as string,
      priority: priority as string,
    });
    res.json(investigations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch OOS investigations' });
  }
});

// Get single OOS investigation
router.get('/oos-investigations/:id', async (req: Request, res: Response) => {
  try {
    const guardOos = requireAuthedOrgId(req, res); if (!guardOos.ok) return;
    const investigation = await storage.getOosInvestigation(Number(req.params.id), guardOos.orgId);
    if (!investigation) {
      return res.status(404).json({ error: 'OOS investigation not found' });
    }
    res.json(investigation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch OOS investigation' });
  }
});

// Create OOS investigation
router.post('/oos-investigations', async (req: Request, res: Response) => {
  try {
    const validatedData = insertQcOosInvestigationSchema.parse(req.body);
    const investigation = await storage.createOosInvestigation(validatedData);
    res.status(201).json(investigation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create OOS investigation' });
    }
  }
});

// Update OOS investigation
router.put('/oos-investigations/:id', async (req: Request, res: Response) => {
  try {
    const investigation = await storage.updateOosInvestigation(Number(req.params.id), req.body);
    res.json(investigation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update OOS investigation' });
  }
});

// Add timeline event to OOS investigation
router.post('/oos-investigations/:id/timeline', async (req: Request, res: Response) => {
  try {
    const { event, performedBy, description, attachments } = req.body;
    const investigation = await storage.addOosTimelineEvent(Number(req.params.id), {
      date: new Date(),
      event,
      performedBy,
      description,
      attachments,
    });
    res.json(investigation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add timeline event' });
  }
});

// Perform root cause analysis
router.post('/oos-investigations/:id/root-cause', async (req: Request, res: Response) => {
  try {
    const { method, category, description, details } = req.body;
    const investigation = await storage.performRootCauseAnalysis(Number(req.params.id), {
      method,
      category,
      description,
      details,
    });
    res.json(investigation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform root cause analysis' });
  }
});

// Link CAPA to OOS
router.post('/oos-investigations/:id/capa', async (req: Request, res: Response) => {
  try {
    const { capaNumber, correctiveActions, preventiveActions } = req.body;
    const investigation = await storage.linkCapaToOos(Number(req.params.id), {
      capaNumber,
      correctiveActions,
      preventiveActions,
    });
    res.json(investigation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to link CAPA' });
  }
});

// ============================================================================
// BATCH RELEASE APIS
// ============================================================================

// Get all batch releases
router.get('/batch-releases', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientWorkspaceId, releaseStatus } = req.query;
    const releases = await storage.getBatchReleases({
      organizationId: Number(organizationId),
      clientWorkspaceId: Number(clientWorkspaceId),
      releaseStatus: releaseStatus as string,
    });
    res.json(releases);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch batch releases' });
  }
});

// Get single batch release
router.get('/batch-releases/:id', async (req: Request, res: Response) => {
  try {
    const guardRel = requireAuthedOrgId(req, res); if (!guardRel.ok) return;
    const release = await storage.getBatchRelease(Number(req.params.id), guardRel.orgId);
    if (!release) {
      return res.status(404).json({ error: 'Batch release not found' });
    }
    res.json(release);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch batch release' });
  }
});

// Create batch release
router.post('/batch-releases', async (req: Request, res: Response) => {
  try {
    const validatedData = insertQcBatchReleaseSchema.parse(req.body);
    const release = await storage.createBatchRelease(validatedData);
    res.status(201).json(release);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create batch release' });
    }
  }
});

// Update batch release
router.put('/batch-releases/:id', async (req: Request, res: Response) => {
  try {
    const release = await storage.updateBatchRelease(Number(req.params.id), req.body);
    res.json(release);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update batch release' });
  }
});

// Review batch record
// Not implemented. The prior stub echoed the request body back, falsely
// signalling that a GMP batch-record review had been recorded. Fail closed.
router.post('/batch-releases/:id/review', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Batch-record review is not implemented',
    notImplemented: true,
    message: 'No batch-record review was recorded. This endpoint performs no action.',
  });
});

// Generate Certificate of Analysis
// Not implemented. The prior stub returned an empty object as if a CoA had been
// generated. A Certificate of Analysis is a GMP-released quality document; an
// empty/fabricated one must never be presented as real. Fail closed.
router.post('/batch-releases/:id/coa', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Certificate of Analysis generation is not implemented',
    notImplemented: true,
    message: 'No Certificate of Analysis was generated.',
  });
});

// Get batch genealogy
router.get('/batch-releases/:id/genealogy', async (req: Request, res: Response) => {
  try {
    const guardGen = requireAuthedOrgId(req, res); if (!guardGen.ok) return;
    const genealogy = await storage.getBatchGenealogy(Number(req.params.id), guardGen.orgId);
    res.json(genealogy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch batch genealogy' });
  }
});

// Validate release criteria
// Not implemented. The prior stub returned { valid: true } unconditionally —
// certifying that a batch met ALL release criteria without performing any
// check. That is a 21 CFR Part 211 data-integrity false positive (it could
// drive a batch disposition decision). Fail closed.
router.post('/batch-releases/:id/validate-criteria', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Release-criteria validation is not implemented',
    notImplemented: true,
    message:
      'The batch was NOT evaluated against release criteria. No validation was performed; do not treat this as a passing result.',
  });
});

// Release batch
// Not implemented. The prior stub returned { released: true } unconditionally,
// falsely signalling that a GMP batch had been released/dispositioned. Fail
// closed — a batch must never be reported as released without a real action.
router.post('/batch-releases/:id/release', async (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Batch release is not implemented',
    notImplemented: true,
    message: 'The batch was NOT released. No disposition action was taken.',
  });
});

// ============================================================================
// DEVIATION MANAGEMENT APIS
// ============================================================================

// Get all deviations
router.get('/deviations', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientWorkspaceId, deviationType, severity } = req.query;
    const deviations = await storage.getQcDeviations({
      organizationId: Number(organizationId),
      clientWorkspaceId: Number(clientWorkspaceId),
      deviationType: deviationType as string,
      severity: severity as string,
    });
    res.json(deviations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deviations' });
  }
});

// Get single deviation
router.get('/deviations/:id', async (req: Request, res: Response) => {
  try {
    const guardDev = requireAuthedOrgId(req, res); if (!guardDev.ok) return;
    const deviation = await storage.getQcDeviation(Number(req.params.id), guardDev.orgId);
    if (!deviation) {
      return res.status(404).json({ error: 'Deviation not found' });
    }
    res.json(deviation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deviation' });
  }
});

// Create deviation
router.post('/deviations', async (req: Request, res: Response) => {
  try {
    const validatedData = insertQcDeviationSchema.parse(req.body);
    const deviation = await storage.createQcDeviation(validatedData);
    res.status(201).json(deviation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create deviation' });
    }
  }
});

// Update deviation
router.put('/deviations/:id', async (req: Request, res: Response) => {
  try {
    const deviation = await storage.updateQcDeviation(Number(req.params.id), req.body);
    res.json(deviation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update deviation' });
  }
});

// Perform impact assessment
router.post('/deviations/:id/impact-assessment', async (req: Request, res: Response) => {
  try {
    const assessment = req.body;
    const deviation = await storage.performImpactAssessment(Number(req.params.id), assessment);
    res.json(deviation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to perform impact assessment' });
  }
});

// Link CAPA to deviation
router.post('/deviations/:id/capa', async (req: Request, res: Response) => {
  try {
    const { capaNumber, correctiveActions, preventiveActions } = req.body;
    const deviation = await storage.linkCapaToDeviation(Number(req.params.id), {
      capaNumber,
      correctiveActions,
      preventiveActions,
    });
    res.json(deviation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to link CAPA' });
  }
});

// Get deviation trending analysis
router.get('/deviations/trending', async (req: Request, res: Response) => {
  try {
    const { organizationId, startDate, endDate, category } = req.query;
    const trending = await storage.getDeviationTrending({
      organizationId: Number(organizationId),
      startDate: startDate as string,
      endDate: endDate as string,
      category: category as string,
    });
    res.json(trending);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trending analysis' });
  }
});

// ============================================================================
// MICROBIOLOGICAL TESTING APIS
// ============================================================================

// Get all microbiological tests
router.get('/microbiological-tests', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientWorkspaceId, testType, sampleType } = req.query;
    const tests = await storage.getMicrobiologicalTests({
      organizationId: Number(organizationId),
      clientWorkspaceId: Number(clientWorkspaceId),
      testType: testType as string,
      sampleType: sampleType as string,
    });
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch microbiological tests' });
  }
});

// Get single microbiological test
router.get('/microbiological-tests/:id', async (req: Request, res: Response) => {
  try {
    const guardTest = requireAuthedOrgId(req, res); if (!guardTest.ok) return;
    const test = await storage.getMicrobiologicalTest(Number(req.params.id), guardTest.orgId);
    if (!test) {
      return res.status(404).json({ error: 'Microbiological test not found' });
    }
    res.json(test);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch microbiological test' });
  }
});

// Create microbiological test
router.post('/microbiological-tests', async (req: Request, res: Response) => {
  try {
    const validatedData = insertQcMicrobiologicalTestSchema.parse(req.body);
    const test = await storage.createMicrobiologicalTest(validatedData);
    res.status(201).json(test);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create microbiological test' });
    }
  }
});

// Update microbiological test
router.put('/microbiological-tests/:id', async (req: Request, res: Response) => {
  try {
    const test = await storage.updateMicrobiologicalTest(Number(req.params.id), req.body);
    res.json(test);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update microbiological test' });
  }
});

// Get environmental monitoring schedule
router.get('/microbiological-tests/environmental-monitoring/schedule', async (req: Request, res: Response) => {
  try {
    const { organizationId, startDate, endDate } = req.query;
    const schedule = await storage.getEnvironmentalMonitoringSchedule({
      organizationId: Number(organizationId),
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch environmental monitoring schedule' });
  }
});

// Create environmental monitoring schedule
router.post('/microbiological-tests/environmental-monitoring/schedule', async (req: Request, res: Response) => {
  try {
    const { locations, frequency, startDate } = req.body;
    const schedule = await storage.createEnvironmentalMonitoringSchedule({
      locations,
      frequency,
      startDate,
    });
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create environmental monitoring schedule' });
  }
});

// Record test results
router.post('/microbiological-tests/:id/results', async (req: Request, res: Response) => {
  try {
    const { result, rawData, calculatedResults, performedBy } = req.body;
    const test = await storage.recordMicrobiologicalResults(Number(req.params.id), {
      result,
      rawData,
      calculatedResults,
      performedBy,
    });
    res.json(test);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record test results' });
  }
});

// ============================================================================
// REFERENCE STANDARDS MANAGEMENT APIS
// ============================================================================

// Get all reference standards
router.get('/reference-standards', async (req: Request, res: Response) => {
  try {
    const { organizationId, clientWorkspaceId, status, standardType } = req.query;
    const standards = await storage.getReferenceStandards({
      organizationId: Number(organizationId),
      clientWorkspaceId: Number(clientWorkspaceId),
      status: status as string,
      standardType: standardType as string,
    });
    res.json(standards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reference standards' });
  }
});

// Get single reference standard
router.get('/reference-standards/:id', async (req: Request, res: Response) => {
  try {
    const guardStd = requireAuthedOrgId(req, res); if (!guardStd.ok) return;
    const standard = await storage.getReferenceStandard(Number(req.params.id), guardStd.orgId);
    if (!standard) {
      return res.status(404).json({ error: 'Reference standard not found' });
    }
    res.json(standard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reference standard' });
  }
});

// Create reference standard
router.post('/reference-standards', async (req: Request, res: Response) => {
  try {
    const validatedData = insertQcReferenceStandardSchema.parse(req.body);
    const standard = await storage.createReferenceStandard(validatedData);
    res.status(201).json(standard);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create reference standard' });
    }
  }
});

// Update reference standard
router.put('/reference-standards/:id', async (req: Request, res: Response) => {
  try {
    const standard = await storage.updateReferenceStandard(Number(req.params.id), req.body);
    res.json(standard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reference standard' });
  }
});

// Record usage
router.post('/reference-standards/:id/usage', async (req: Request, res: Response) => {
  try {
    const { usedBy, quantity, purpose, testReference } = req.body;
    const standard = await storage.recordStandardUsage(Number(req.params.id), {
      date: new Date(),
      usedBy,
      quantity,
      purpose,
      testReference,
    });
    res.json(standard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record usage' });
  }
});

// Get expiring standards
router.get('/reference-standards/expiring', async (req: Request, res: Response) => {
  try {
    const { organizationId, daysAhead } = req.query;
    const standards = await storage.getExpiringStandards({
      organizationId: Number(organizationId),
      daysAhead: Number(daysAhead) || 30,
    });
    res.json(standards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expiring standards' });
  }
});

// Qualify reference standard
router.post('/reference-standards/:id/qualify', async (req: Request, res: Response) => {
  try {
    const { qualificationData, qualifiedBy } = req.body;
    const standard = await storage.qualifyReferenceStandard(Number(req.params.id), {
      qualificationData,
      qualifiedBy,
      qualificationDate: new Date(),
    });
    res.json(standard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to qualify reference standard' });
  }
});

// Dispose reference standard
router.post('/reference-standards/:id/dispose', async (req: Request, res: Response) => {
  try {
    const { disposalMethod, disposedBy, reason } = req.body;
    const standard = await storage.disposeReferenceStandard(Number(req.params.id), {
      disposalMethod,
      disposedBy,
      reason,
      disposalDate: new Date(),
    });
    res.json(standard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to dispose reference standard' });
  }
});

// Get usage logs
router.get('/reference-standards/:id/usage-logs', async (req: Request, res: Response) => {
  try {
    const guardLog = requireAuthedOrgId(req, res); if (!guardLog.ok) return;
    const logs = await storage.getStandardUsageLogs(Number(req.params.id), guardLog.orgId);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch usage logs' });
  }
});

export default router;