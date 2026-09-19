/**
 * Medical Device Service
 *
 * Production-ready service for managing medical device submissions including:
 * - 510(k) Premarket Notifications
 * - PMA (Premarket Approval) Applications
 * - CER (Clinical Evaluation Reports)
 *
 * Features:
 * - Full 21 CFR Part 11 compliance with audit trails
 * - Tenant-scoped data isolation
 * - Workflow orchestration and status tracking
 * - FDA integration readiness
 *
 * ── Audit-row outcomes (WO-16C #133, 19 September 2026) ─────────────────────
 *
 * Most governed mutations in this file write TWO audit records, and they are
 * not the same row:
 *
 *   1. a `device_audit_trail` row, via this class's own `logAuditTrail`;
 *   2. an `audit_logs` row, via the shared audit service.
 *
 * (`linkCERToDevice` writes only (2). `createWorkflow` and
 * `updateWorkflowStatus` write neither.)
 *
 * `logAction` does not reject when no store accepts the row — deliberate
 * policy, an audit-trail outage must not break the action it records — it
 * resolves an `AuditWriteResult` that says what happened. The seven calls in
 * this file awaited it at statement position and discarded that value, so a
 * created device record, a created 510(k) or PMA submission record, an
 * uploaded submission document and a CER-to-device link were all returned
 * byte-identically whether their §11.10(e) row existed or not. The only trace
 * of a missing one was a server log line.
 *
 * The outcome of write (2) now travels out to the caller on a key named
 * `auditLog`, produced by `recordAuditRow`
 * (server/services/audit/audit-write-outcome.ts). That key is deliberately
 * narrow: it is the `audit_logs` row for the one action named at its own call
 * site, and nothing else. It says nothing about write (1) — the
 * `device_audit_trail` insert in `logAuditTrail` is still wrapped in a catch
 * that logs and returns, so that row's fate stays unreported. That is a
 * separate finding and is deliberately not addressed here.
 *
 * Nothing is rolled back because an audit row failed. Every mutation below is
 * already committed by the time its audit write is attempted, and undoing a
 * real device or submission record over a lost log row would be the worse
 * answer. `recordAuditRow`'s failure arm carries a stable code and a
 * caller-safe sentence, never the store's own error text.
 */

import { db } from '../db';
import {
  medicalDevices,
  fda510kSubmissions,
  pmaSubmissions,
  deviceSubmissionDocuments,
  deviceSubmissionWorkflows,
  deviceAuditTrail,
  fdaIntegrationLogs,
  cerProjects,
  users,
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { recordAuditRow } from './audit/audit-write-outcome';
import crypto from 'crypto';

import { createScopedLogger } from '../utils/logger';
const logger = createScopedLogger('medical-device');

class MedicalDeviceService {
  private initialized = false;
  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }
  constructor() {
    this.initialized = true;
  }

  // ==================== DEVICE MANAGEMENT ====================

  /**
   * Create a new medical device
   */
  async createDevice(organizationId: number, deviceData: Record<string, any>, userId: number) {
    try {
      const dbInstance = this.getDb();
      const deviceName = deviceData.deviceName ?? deviceData.name ?? 'Unnamed device';
      const manufacturer = deviceData.manufacturer ?? 'Unknown manufacturer';
      const deviceClass = deviceData.deviceClass ?? 'Class II';
      const newDevice = await dbInstance
        .insert(medicalDevices)
        .values({
          organizationId,
          ...deviceData,
          deviceName,
          manufacturer,
          deviceClass,
          createdBy: userId,
          updatedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof medicalDevices.$inferInsert)
        .returning();

      // Audit trail
      await this.logAuditTrail(
        organizationId,
        'device',
        newDevice[0].id,
        'created',
        null,
        newDevice[0],
        userId
      );

      // Also log to main audit service for consistency.
      //
      // WO-16C #133. This was an awaited `logAction` call at statement position:
      // the AuditWriteResult it resolves was thrown away, so the device object
      // returned below was identical whether or not the §11.10(e) row for the
      // creation existed. Rule-2 case: a log beside an already-committed write —
      // the device row is committed by the `.insert(medicalDevices) …
      // .returning()` above — so the creation stands and the outcome is
      // reported instead of dropped.
      const auditLog = await recordAuditRow({
        tenantId: organizationId,
        userId,
        action: 'CREATE_MEDICAL_DEVICE',
        resourceType: 'medical_devices',
        resourceId: newDevice[0].id,
        details: { deviceName: deviceData.deviceName, deviceClass: deviceData.deviceClass },
      });

      // `auditLog` is the audit_logs row for CREATE_MEDICAL_DEVICE only, not
      // the device_audit_trail row written above. See the module note.
      return { ...newDevice[0], auditLog };
    } catch (error) {
      logger.error('Error creating medical device:', { error: error });
      throw error;
    }
  }

  /**
   * Get all devices for an organization
   */
  async getDevices(organizationId: number) {
    try {
      const dbInstance = this.getDb();
      const devices = await dbInstance
        .select()
        .from(medicalDevices)
        .where(eq(medicalDevices.organizationId, organizationId))
        .orderBy(desc(medicalDevices.createdAt));

      return devices;
    } catch (error) {
      logger.error('Error fetching medical devices:', { error: error });
      throw error;
    }
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(organizationId: number, deviceId: number) {
    try {
      const dbInstance = this.getDb();
      const device = await dbInstance
        .select()
        .from(medicalDevices)
        .where(
          and(eq(medicalDevices.organizationId, organizationId), eq(medicalDevices.id, deviceId))
        )
        .limit(1);

      return device[0];
    } catch (error) {
      logger.error('Error fetching medical device:', { error: error });
      throw error;
    }
  }

  /**
   * Update a medical device
   */
  async updateDevice(
    organizationId: number,
    deviceId: number,
    updates: Record<string, any>,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      // Get current device for audit trail
      const currentDevice = await this.getDevice(organizationId, deviceId);

      const updatedDevice = await dbInstance
        .update(medicalDevices)
        .set({
          ...updates,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(medicalDevices.organizationId, organizationId), eq(medicalDevices.id, deviceId))
        )
        .returning();

      // Audit trail
      await this.logAuditTrail(
        organizationId,
        'device',
        deviceId,
        'updated',
        currentDevice,
        updatedDevice[0],
        userId
      );

      // WO-16C #133, as in createDevice: the awaited outcome was discarded.
      // Rule-2 case: a log beside an already-committed write — the device row
      // is committed by the `.update(medicalDevices) … .returning()` above — so
      // the update stands and the outcome is reported on `auditLog`.
      const auditLog = await recordAuditRow({
        tenantId: organizationId,
        userId,
        action: 'UPDATE_MEDICAL_DEVICE',
        resourceType: 'medical_devices',
        resourceId: deviceId,
        details: { updates },
      });

      // Preserved exactly: when the UPDATE matches no row — a deviceId outside
      // this organization — `updatedDevice[0]` is `undefined`, which is what
      // this returned before, and there is no object to carry `auditLog` on.
      const updatedRow = updatedDevice[0];
      return updatedRow === undefined ? undefined : { ...updatedRow, auditLog };
    } catch (error) {
      logger.error('Error updating medical device:', { error: error });
      throw error;
    }
  }

  // ==================== 510(k) SUBMISSIONS ====================

  /**
   * Create a new 510(k) submission
   */
  async create510kSubmission(
    organizationId: number,
    submissionData: Record<string, any>,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      const submissionType = submissionData.submissionType ?? 'traditional';
      const deviceId = submissionData.deviceId;
      if (!deviceId) {
        throw new Error('510(k) submission requires deviceId');
      }
      const new510k = await dbInstance
        .insert(fda510kSubmissions)
        .values({
          organizationId,
          ...submissionData,
          submissionType,
          deviceId,
          electronicSignatures: [],
          auditTrail: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof fda510kSubmissions.$inferInsert)
        .returning();

      // Create workflow
      await this.createWorkflow(organizationId, '510k_submission', '510k', new510k[0].id, userId);

      // Audit trail
      await this.logAuditTrail(
        organizationId,
        '510k',
        new510k[0].id,
        'created',
        null,
        new510k[0],
        userId
      );

      // WO-16C #133. The discarded outcome here belonged to the §11.10(e) row
      // for opening a 510(k) submission record — the file an eventual premarket
      // notification is assembled in. Nothing on this path transmits anything
      // to FDA (see submit510kToFDA). Rule-2 case: a log beside an
      // already-committed write — the submission row is committed by the
      // `.insert(fda510kSubmissions) … .returning()` above.
      const auditLog = await recordAuditRow({
        tenantId: organizationId,
        userId,
        action: 'CREATE_510K_SUBMISSION',
        resourceType: 'fda_510k_submissions',
        resourceId: new510k[0].id,
        details: {
          deviceId: submissionData.deviceId,
          submissionType: submissionData.submissionType,
        },
      });

      return { ...new510k[0], auditLog };
    } catch (error) {
      logger.error('Error creating 510(k) submission:', { error: error });
      throw error;
    }
  }

  /**
   * Get all 510(k) submissions for an organization
   */
  async get510kSubmissions(organizationId: number) {
    try {
      const dbInstance = this.getDb();
      const submissions = await dbInstance
        .select({
          submission: fda510kSubmissions,
          device: medicalDevices,
        })
        .from(fda510kSubmissions)
        .leftJoin(medicalDevices, eq(fda510kSubmissions.deviceId, medicalDevices.id))
        .where(eq(fda510kSubmissions.organizationId, organizationId))
        .orderBy(desc(fda510kSubmissions.createdAt));

      return submissions;
    } catch (error) {
      logger.error('Error fetching 510(k) submissions:', { error: error });
      throw error;
    }
  }

  /**
   * Get a specific 510(k) submission
   */
  async get510kSubmission(organizationId: number, submissionId: number) {
    try {
      const dbInstance = this.getDb();
      const submission = await dbInstance
        .select({
          submission: fda510kSubmissions,
          device: medicalDevices,
        })
        .from(fda510kSubmissions)
        .leftJoin(medicalDevices, eq(fda510kSubmissions.deviceId, medicalDevices.id))
        .where(
          and(
            eq(fda510kSubmissions.organizationId, organizationId),
            eq(fda510kSubmissions.id, submissionId)
          )
        )
        .limit(1);

      // Get associated documents
      if (submission[0]) {
        const documents = await this.getSubmissionDocuments(organizationId, '510k', submissionId);
        const workflow = await this.getWorkflow(organizationId, '510k', submissionId);
        return {
          ...submission[0],
          documents,
          workflow,
        };
      }

      return submission[0];
    } catch (error) {
      logger.error('Error fetching 510(k) submission:', { error: error });
      throw error;
    }
  }

  /**
   * Update a 510(k) submission
   */
  async update510kSubmission(
    organizationId: number,
    submissionId: number,
    updates: Record<string, any>,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      // Get current submission for audit trail
      const current = await this.get510kSubmission(organizationId, submissionId);

      // Update audit trail within the submission
      const existingAuditTrail = Array.isArray(current?.submission?.auditTrail)
        ? current.submission.auditTrail
        : [];
      const auditEntry = {
        timestamp: new Date().toISOString(),
        userId,
        action: 'updated',
        changes: updates,
        previousValues: current?.submission,
      };

      const updated510k = await dbInstance
        .update(fda510kSubmissions)
        .set({
          ...updates,
          auditTrail: [...existingAuditTrail, auditEntry],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(fda510kSubmissions.organizationId, organizationId),
            eq(fda510kSubmissions.id, submissionId)
          )
        )
        .returning();

      // Audit trail
      await this.logAuditTrail(
        organizationId,
        '510k',
        submissionId,
        'updated',
        current?.submission,
        updated510k[0],
        userId
      );

      // WO-16C #133. This is the audit row for every change to a 510(k)
      // submission record, including the one that applies an electronic
      // signature and moves the package to `ready_for_transmission` (that
      // caller is submit510kToFDA below). Rule-2 case: a log beside an
      // already-committed write — the submission row, its embedded `auditTrail`
      // array and any new signature are all committed by the
      // `.update(fda510kSubmissions) … .returning()` above, so the change
      // stands and the outcome is reported rather than dropped.
      const auditLog = await recordAuditRow({
        tenantId: organizationId,
        userId,
        action: 'UPDATE_510K_SUBMISSION',
        resourceType: 'fda_510k_submissions',
        resourceId: submissionId,
        details: { updates },
      });

      // Update workflow if status changed
      if (updates.submissionStatus) {
        await this.updateWorkflowStatus(
          organizationId,
          '510k',
          submissionId,
          updates.submissionStatus,
          userId
        );
      }

      // Preserved exactly: an UPDATE that matched no row returns `undefined`
      // here as it did before, leaving no object to carry `auditLog` on.
      const updatedRow = updated510k[0];
      return updatedRow === undefined ? undefined : { ...updatedRow, auditLog };
    } catch (error) {
      logger.error('Error updating 510(k) submission:', { error: error });
      throw error;
    }
  }

  /**
   * Submit 510(k) to FDA (placeholder for actual FDA integration)
   */
  async submit510kToFDA(organizationId: number, submissionId: number, userId: number) {
    try {
      // Validate submission completeness
      const submission = await this.get510kSubmission(organizationId, submissionId);
      if (!submission) {
        throw new Error('510(k) submission not found');
      }

      // Check required documents
      const requiredDocs = await this.getSubmissionDocuments(organizationId, '510k', submissionId);
      const missingDocs = requiredDocs.filter(doc => doc.isRequired && !doc.isSubmitted);

      if (missingDocs.length > 0) {
        throw new Error(
          `Missing required documents: ${missingDocs.map(d => d.documentType).join(', ')}`
        );
      }

      // Add electronic signature
      const signature = {
        userId,
        timestamp: new Date().toISOString(),
        meaning: 'submission',
        hash: this.generateSignatureHash(submission, userId),
      };

      const existingSignatures = Array.isArray(submission.submission?.electronicSignatures)
        ? submission.submission?.electronicSignatures
        : [];

      // This endpoint performs NO transmission. It validates completeness and
      // applies the e-signature; there is no gateway client here and never was
      // (the comment below said "placeholder"). It used to record the package as
      // `submitted` with an actualSubmissionDate, log the attempt as a success —
      // which stamps httpStatusCode 200 into fda_integration_logs for a call
      // that was never made — and return "sent to FDA successfully".
      //
      // Every one of those was a claim about the agency that nothing had done.
      // The signed, validated package is real and is recorded as such; the
      // transmission is not, and is now reported as not having happened. Real
      // transmission lives on the gateway path (server/services/submission-
      // gateways, surfaced as Gateway Transmittals), which obtains and stores an
      // actual agency receipt.
      // `submission_status` is a free-text column. The values in play are
      // draft | in_review | ready_for_transmission | submitted | cleared |
      // rejected. `ready_for_transmission` means validated and e-signed locally
      // but NOT sent; only the gateway path — which obtains and stores a real
      // agency receipt — may ever write `submitted`.
      const signedSubmission = await this.update510kSubmission(
        organizationId,
        submissionId,
        {
          submissionStatus: 'ready_for_transmission',
          electronicSignatures: [...existingSignatures, signature],
        },
        userId
      );

      await this.logFDAIntegration(
        organizationId,
        'CDRH_Portal',
        '510k_submission',
        submissionId,
        { submissionId, deviceId: submission.device?.id ?? null },
        {
          message:
            'Package validated and signed locally. NOT transmitted to FDA — this endpoint has no gateway transport.',
          transmitted: false,
        },
        'not_transmitted'
      );

      await this.updateWorkflowStatus(
        organizationId,
        '510k',
        submissionId,
        'ready_for_transmission',
        userId
      );

      return {
        success: true,
        transmitted: false,
        // WO-16C #133. The governed write on this path is the e-signature and
        // status UPDATE that `update510kSubmission` performed above, and this
        // is the outcome of that call's audit_logs row
        // (action UPDATE_510K_SUBMISSION), carried into the envelope instead of
        // being discarded along with the rest of its return value. It is the
        // only audit_logs row this method causes. Absent only when that UPDATE
        // matched no row, in which case no signature was stored either.
        auditLog: signedSubmission?.auditLog,
        message:
          '510(k) package validated and signed. NOT transmitted to FDA — no submission has been made. ' +
          'Use Gateway Transmittals to transmit and obtain an agency receipt.',
      };
    } catch (error) {
      logger.error('Error submitting 510(k) to FDA:', { error: error });

      // Log failed integration
      await this.logFDAIntegration(
        organizationId,
        'CDRH_Portal',
        '510k_submission',
        submissionId,
        { submissionId },
        { error: error instanceof Error ? error.message : String(error) },
        'failure'
      );

      throw error;
    }
  }

  // ==================== PMA SUBMISSIONS ====================

  /**
   * Create a new PMA submission
   */
  async createPMASubmission(
    organizationId: number,
    submissionData: Record<string, any>,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      const submissionType = submissionData.submissionType ?? 'standard';
      const deviceId = submissionData.deviceId;
      if (!deviceId) {
        throw new Error('PMA submission requires deviceId');
      }
      const newPMA = await dbInstance
        .insert(pmaSubmissions)
        .values({
          organizationId,
          ...submissionData,
          submissionType,
          deviceId,
          electronicSignatures: [],
          auditTrail: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof pmaSubmissions.$inferInsert)
        .returning();

      // Create workflow
      await this.createWorkflow(organizationId, 'pma_submission', 'pma', newPMA[0].id, userId);

      // Audit trail
      await this.logAuditTrail(
        organizationId,
        'pma',
        newPMA[0].id,
        'created',
        null,
        newPMA[0],
        userId
      );

      // WO-16C #133. Same shape as create510kSubmission: the §11.10(e) row for
      // opening a PMA submission record. Rule-2 case: a log beside an
      // already-committed write — the row is committed by the
      // `.insert(pmaSubmissions) … .returning()` above.
      const auditLog = await recordAuditRow({
        tenantId: organizationId,
        userId,
        action: 'CREATE_PMA_SUBMISSION',
        resourceType: 'pma_submissions',
        resourceId: newPMA[0].id,
        details: {
          deviceId: submissionData.deviceId,
          submissionType: submissionData.submissionType,
        },
      });

      return { ...newPMA[0], auditLog };
    } catch (error) {
      logger.error('Error creating PMA submission:', { error: error });
      throw error;
    }
  }

  /**
   * Get all PMA submissions
   */
  async getPMASubmissions(organizationId: number) {
    try {
      const dbInstance = this.getDb();
      const submissions = await dbInstance
        .select({
          submission: pmaSubmissions,
          device: medicalDevices,
        })
        .from(pmaSubmissions)
        .leftJoin(medicalDevices, eq(pmaSubmissions.deviceId, medicalDevices.id))
        .where(eq(pmaSubmissions.organizationId, organizationId))
        .orderBy(desc(pmaSubmissions.createdAt));

      return submissions;
    } catch (error) {
      logger.error('Error fetching PMA submissions:', { error: error });
      throw error;
    }
  }

  // ==================== DOCUMENT MANAGEMENT ====================

  /**
   * Add document to submission
   */
  async addSubmissionDocument(
    organizationId: number,
    submissionType: string,
    submissionId: number,
    documentData: Record<string, any>,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      const documentTitle = documentData.documentTitle ?? documentData.title;
      const documentType = documentData.documentType ?? documentData.type;
      if (!documentTitle || !documentType) {
        throw new Error('Submission document requires documentTitle and documentType');
      }
      const newDoc = await dbInstance
        .insert(deviceSubmissionDocuments)
        .values({
          organizationId,
          submissionType,
          submissionId,
          ...documentData,
          documentTitle,
          documentType,
          uploadedBy: userId,
          uploadedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof deviceSubmissionDocuments.$inferInsert)
        .returning();

      // Audit trail
      await this.logAuditTrail(
        organizationId,
        'document',
        newDoc[0].id,
        'uploaded',
        null,
        newDoc[0],
        userId
      );

      // WO-16C #133. These documents are what submit510kToFDA checks for
      // completeness before it signs a package, so this is the §11.10(e) record
      // of who attached which piece of a submission. Rule-2 case: a log beside
      // an already-committed write — the document row is committed by the
      // `.insert(deviceSubmissionDocuments) … .returning()` above.
      const auditLog = await recordAuditRow({
        tenantId: organizationId,
        userId,
        action: 'UPLOAD_SUBMISSION_DOCUMENT',
        resourceType: 'device_submission_documents',
        resourceId: newDoc[0].id,
        details: { submissionType, submissionId, documentType: documentData.documentType },
      });

      return { ...newDoc[0], auditLog };
    } catch (error) {
      logger.error('Error adding submission document:', { error: error });
      throw error;
    }
  }

  /**
   * Get documents for a submission
   */
  async getSubmissionDocuments(
    organizationId: number,
    submissionType: string,
    submissionId: number
  ) {
    try {
      const dbInstance = this.getDb();
      const documents = await dbInstance
        .select()
        .from(deviceSubmissionDocuments)
        .where(
          and(
            eq(deviceSubmissionDocuments.organizationId, organizationId),
            eq(deviceSubmissionDocuments.submissionType, submissionType),
            eq(deviceSubmissionDocuments.submissionId, submissionId)
          )
        )
        .orderBy(desc(deviceSubmissionDocuments.createdAt));

      return documents;
    } catch (error) {
      logger.error('Error fetching submission documents:', { error: error });
      throw error;
    }
  }

  // ==================== WORKFLOW MANAGEMENT ====================

  /**
   * Create workflow for a submission
   */
  async createWorkflow(
    organizationId: number,
    workflowType: string,
    submissionType: string,
    submissionId: number,
    userId: number
  ) {
    try {
      const steps = this.getWorkflowSteps(workflowType);

      const dbInstance = this.getDb();
      const newWorkflow = await dbInstance
        .insert(deviceSubmissionWorkflows)
        .values({
          organizationId,
          workflowType,
          submissionType,
          submissionId,
          currentStep: steps[0],
          completedSteps: [],
          pendingSteps: steps.slice(1),
          totalSteps: steps.length,
          progressPercentage: 0,
          workflowStatus: 'active',
          assignedTo: userId,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return newWorkflow[0];
    } catch (error) {
      logger.error('Error creating workflow:', { error: error });
      throw error;
    }
  }

  /**
   * Get workflow for a submission
   */
  async getWorkflow(organizationId: number, submissionType: string, submissionId: number) {
    try {
      const dbInstance = this.getDb();
      const workflow = await dbInstance
        .select()
        .from(deviceSubmissionWorkflows)
        .where(
          and(
            eq(deviceSubmissionWorkflows.organizationId, organizationId),
            eq(deviceSubmissionWorkflows.submissionType, submissionType),
            eq(deviceSubmissionWorkflows.submissionId, submissionId)
          )
        )
        .limit(1);

      return workflow[0];
    } catch (error) {
      logger.error('Error fetching workflow:', { error: error });
      throw error;
    }
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(
    organizationId: number,
    submissionType: string,
    submissionId: number,
    newStatus: string,
    userId: number
  ) {
    try {
      const workflow = await this.getWorkflow(organizationId, submissionType, submissionId);
      if (!workflow) return null;

      const updates: {
        workflowStatus: string;
        lastActivityAt: Date;
        updatedAt: Date;
        completedAt?: Date;
        progressPercentage?: number;
      } = {
        workflowStatus: newStatus === 'submitted' ? 'completed' : 'active',
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      };

      if (newStatus === 'submitted') {
        updates.completedAt = new Date();
        updates.progressPercentage = 100;
      }

      const dbInstance = this.getDb();
      const updatedWorkflow = await dbInstance
        .update(deviceSubmissionWorkflows)
        .set(updates)
        .where(
          and(
            eq(deviceSubmissionWorkflows.organizationId, organizationId),
            eq(deviceSubmissionWorkflows.submissionType, submissionType),
            eq(deviceSubmissionWorkflows.submissionId, submissionId)
          )
        )
        .returning();

      return updatedWorkflow[0];
    } catch (error) {
      logger.error('Error updating workflow status:', { error: error });
      throw error;
    }
  }

  /**
   * Get workflow steps based on type
   */
  getWorkflowSteps(workflowType: string) {
    const workflows = {
      '510k_submission': [
        'device_information',
        'predicate_comparison',
        'performance_testing',
        'labeling',
        'substantial_equivalence',
        'review_approval',
        'fda_submission',
      ],
      pma_submission: [
        'device_description',
        'clinical_trials',
        'manufacturing_info',
        'risk_analysis',
        'labeling',
        'advisory_committee',
        'review_approval',
        'fda_submission',
      ],
      cer_generation: [
        'device_identification',
        'clinical_evaluation',
        'literature_review',
        'clinical_data_analysis',
        'risk_benefit_analysis',
        'conclusions',
        'review_approval',
        'publication',
      ],
    };

    const workflowKey = workflowType as keyof typeof workflows;
    return workflows[workflowKey] || [];
  }

  // ==================== AUDIT & COMPLIANCE ====================

  /**
   * Log audit trail entry
   */
  async logAuditTrail(
    organizationId: number,
    entityType: string,
    entityId: number,
    action: string,
    previousValues: Record<string, any> | null,
    newValues: Record<string, any>,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      const safeNewValues = newValues || {};
      const changedFields = previousValues
        ? Object.keys(safeNewValues).filter(key => previousValues[key] !== safeNewValues[key])
        : Object.keys(safeNewValues);

      // Resolve the real username for Part 11 attribution rather than fabricating it.
      // The users table has no role column, so userRole is left null (honest) instead
      // of the previously hardcoded 'regulatory_specialist' applied to every actor.
      // See FORENSIC_CODE_AUDIT_2026-05-29.md (MEDIUM: Part 11 attribution gaps).
      let resolvedUserName = `User ${userId}`;
      try {
        const userRows = await dbInstance
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (userRows[0]?.name) resolvedUserName = userRows[0].name;
      } catch {
        // Fall back to the id-based label; audit logging must not break the operation.
      }

      await dbInstance.insert(deviceAuditTrail).values({
        organizationId,
        entityType,
        entityId,
        action,
        previousValues,
        newValues: safeNewValues,
        changedFields,
        userId,
        userName: resolvedUserName,
        userRole: null,
        electronicSignature: this.generateSignatureHash({ entityType, entityId, action }, userId),
        signatureTimestamp: new Date(),
        signatureMeaning: action === 'approved' ? 'approval' : 'authorship',
        dataIntegrityCheck: this.generateIntegrityCheck(newValues),
      });
    } catch (error) {
      logger.error('Error logging audit trail:', { error: error });
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Log FDA integration attempt
   */
  async logFDAIntegration(
    organizationId: number,
    integrationType: string,
    entityType: string,
    entityId: number,
    request: any,
    response: any,
    status: string
  ) {
    try {
      const dbInstance = this.getDb();
      await dbInstance.insert(fdaIntegrationLogs).values({
        organizationId,
        integrationType,
        apiEndpoint: `/fda/api/${integrationType.toLowerCase()}`,
        httpMethod: 'POST',
        requestPayload: request,
        responsePayload: response,
        // Only a status that reflects an actual HTTP exchange gets an HTTP code.
        // This used to write 200 for anything not a failure, so a local
        // no-transmission path stamped a successful POST to an FDA endpoint into
        // the log an inspector reads first. A call that was never made now
        // records no status code at all.
        httpStatusCode: status === 'success' ? 200 : status === 'failure' ? 500 : null,
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        status,
        errorMessage: status === 'failure' ? response.error : null,
        createdAt: new Date(),
      });
    } catch (error) {
      logger.error('Error logging FDA integration:', { error: error });
      // Don't throw - logging should not break the main operation
    }
  }

  /**
   * Generate electronic signature hash
   */
  generateSignatureHash(data: any, userId: number) {
    // In production, use proper cryptographic hashing
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data) + userId + new Date().toISOString());
    return hash.digest('hex');
  }

  /**
   * Generate data integrity check
   */
  generateIntegrityCheck(data: any) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  // ==================== CER INTEGRATION ====================

  /**
   * Link CER project to medical device
   */
  async linkCERToDevice(
    organizationId: number,
    cerProjectId: number,
    deviceId: number,
    userId: number
  ) {
    try {
      const dbInstance = this.getDb();
      const updated = await dbInstance
        .update(cerProjects)
        .set({
          deviceId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(cerProjects.organizationId, organizationId), eq(cerProjects.id, cerProjectId))
        )
        .returning();

      // WO-16C #133. The only audit record this mutation writes at all — it
      // calls no logAuditTrail — and its outcome was discarded, so a CER
      // project could be attached to a device with no §11.10(e) row and an
      // identical return value. Rule-2 case: a log beside an already-committed
      // write — the link is committed by the `.update(cerProjects) …
      // .returning()` above.
      //
      // The entry fields are passed through unchanged, including the absence of
      // a tenantId; what that costs the row is reported separately rather than
      // altered here.
      const auditLog = await recordAuditRow({
        userId,
        action: 'LINK_CER_TO_DEVICE',
        resourceType: 'cer_projects',
        details: { organizationId, cerProjectId, deviceId },
      });

      // Preserved exactly: a cerProjectId outside this organization matches no
      // row, and `undefined` is what this returned before.
      const linkedRow = updated[0];
      return linkedRow === undefined ? undefined : { ...linkedRow, auditLog };
    } catch (error) {
      logger.error('Error linking CER to device:', { error: error });
      throw error;
    }
  }

  /**
   * Get CER projects for a device
   */
  async getCERProjectsForDevice(organizationId: number, deviceId: number) {
    try {
      const dbInstance = this.getDb();
      const projects = await dbInstance
        .select()
        .from(cerProjects)
        .where(
          and(eq(cerProjects.organizationId, organizationId), eq(cerProjects.deviceId, deviceId))
        )
        .orderBy(desc(cerProjects.createdAt));

      return projects;
    } catch (error) {
      logger.error('Error fetching CER projects for device:', { error: error });
      throw error;
    }
  }
}

// Create singleton instance
const medicalDeviceService = new MedicalDeviceService();

export default medicalDeviceService;
