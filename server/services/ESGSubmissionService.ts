import { db } from '../db';
import { 
  fda510kSubmissionPackages,
  fda510kProjects,
  fda510kDocuments,
  sharepoint_audit_log,
  users
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
// @ts-ignore — xml2js has no bundled types
import xml2js from 'xml2js';

interface ESGSubmissionConfig {
  gatewayUrl: string;
  certificatePath?: string;
  privateKeyPath?: string;
  username?: string;
  password?: string;
  testMode: boolean;
}

interface SubmissionPackage {
  projectId: number;
  packageId: string;
  documents: any[];
  metadata: any;
}

export interface ESGResponse {
  transactionId: string;
  acknowledgmentNumber?: string;
  status: 'submitted' | 'processing' | 'accepted' | 'rejected' | 'simulated_not_transmitted';
  message: string;
  timestamp: Date;
  /**
   * True when NOTHING was transmitted to FDA and the identifiers above are
   * local fabrications. Callers MUST NOT record a submission as made, mint a
   * receipt, or report success when this is set.
   */
  simulated?: boolean;
}

class ESGSubmissionService {
  private config: ESGSubmissionConfig;
  private xmlBuilder: xml2js.Builder;

  /**
   * Whether the simulated (non-transmitting) path may be used at all.
   *
   * Opt-IN and fail-closed: only an explicitly declared local `development` or
   * `test` environment. An unset, blank, misspelled, `staging` or `production`
   * NODE_ENV all refuse to simulate, so no deployed environment can hand a user
   * a fabricated FDA acceptance.
   */
  static simulationAllowed(): boolean {
    const env = (process.env.NODE_ENV ?? '').trim().toLowerCase();
    return env === 'development' || env === 'test';
  }

  constructor() {
    // Configure based on environment
    this.config = {
      gatewayUrl: process.env.FDA_ESG_URL || 'https://esgtest.fda.gov/gateway',
      certificatePath: process.env.FDA_ESG_CERT_PATH,
      privateKeyPath: process.env.FDA_ESG_KEY_PATH,
      username: process.env.FDA_ESG_USERNAME,
      password: process.env.FDA_ESG_PASSWORD,
      // Fail CLOSED. This was `NODE_ENV !== 'production'`, which put every
      // environment that is not the exact string 'production' — unset, blank,
      // 'staging', 'preview', 'Production' with a capital P — into a mode that
      // returns a fabricated FDA acceptance. Simulation is now opt-IN and only
      // for the two environments that are unambiguously local, matching the
      // repo's established prod-fail-closed gate (bundleTrustEnforced in
      // server/services/submission-gateways/bundle-namespace.ts).
      testMode: ESGSubmissionService.simulationAllowed()
    };

    this.xmlBuilder = new xml2js.Builder({
      rootName: 'submission',
      xmldec: { version: '1.0', encoding: 'UTF-8' }
    });
  }

  /**
   * Submit a 510(k) package to FDA ESG
   */
  async submitToFDA(
    projectId: number,
    userId: number,
    organizationId: number
  ): Promise<ESGResponse> {
    try {
      // 1. Create submission package
      const submissionPackage = await this.createSubmissionPackage(
        projectId,
        userId,
        organizationId
      );

      // 2. Generate eSTAR XML
      const estarXml = await this.generateESTARXml(submissionPackage);

      // 3. Create eCopy bundle
      const bundlePath = await this.createECopyBundle(
        submissionPackage,
        estarXml
      );

      // 4. Submit to FDA ESG
      const response = await this.transmitToESG(bundlePath, submissionPackage.packageId);

      // 5. Update submission status
      await this.updateSubmissionStatus(
        submissionPackage.packageId,
        response,
        userId,
        organizationId
      );

      // 6. Create audit log
      await this.createAuditLog(
        projectId,
        userId,
        organizationId,
        'esg_submission',
        {
          packageId: submissionPackage.packageId,
          transactionId: response.transactionId,
          status: response.status
        }
      );

      return response;
    } catch (error) {
      console.error('ESG submission error:', error);
      throw error;
    }
  }

  /**
   * Create a submission package from project documents
   */
  private async createSubmissionPackage(
    projectId: number,
    userId: number,
    organizationId: number
  ): Promise<SubmissionPackage> {
    // Fetch project details — scoped to the caller's organization to prevent
    // cross-tenant IDOR on an irreversible FDA submission.
    const [project] = await db!
      .select()
      .from(fda510kProjects)
      .where(
        and(
          eq(fda510kProjects.id, projectId),
          eq(fda510kProjects.organizationId, organizationId)
        )
      );

    if (!project) {
      throw new Error('Project not found');
    }

    // Fetch all documents for the project, also scoped to the org
    const documents = await db!
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.projectId, projectId),
          eq(fda510kDocuments.organizationId, organizationId)
        )
      );

    // metadata is an untyped JSON column; narrow it at this boundary
    const projectMetadata = (project.metadata ?? {}) as {
      deviceName?: string;
      indicationsForUse?: string;
      [key: string]: unknown;
    };

    // Generate unique package ID
    const packageId = `PKG-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create submission package record
    const proj = project as any;
    await db!.insert(fda510kSubmissionPackages).values({
      organizationId,
      projectId,
      packageId,
      packageName: `510k_${project.deviceName}_${new Date().toISOString().split('T')[0]}`,
      packageType: '510k',
      documents: documents.map((d: any) => ({
        documentId: d.documentId,
        title: d.documentName,
        type: d.documentType,
        version: d.version
      })),
      attachments: [],
      estarData: {
        projectName: project.deviceName,
        submissionType: '510k',
        deviceName: projectMetadata?.deviceName || '',
        indicationsForUse: projectMetadata?.indicationsForUse || ''
      },
      submissionMethod: 'esg',
      status: 'ready',
      createdAt: new Date(),
      updatedAt: new Date()
    } as any);

    return {
      projectId,
      packageId,
      documents,
      metadata: projectMetadata
    };
  }

  /**
   * Generate eSTAR XML for FDA submission
   */
  private async generateESTARXml(submissionPackage: SubmissionPackage): Promise<string> {
    const estarData = {
      header: {
        submissionType: '510k',
        submissionId: submissionPackage.packageId,
        submissionDate: new Date().toISOString(),
        applicant: {
          name: submissionPackage.metadata?.companyName || '',
          address: submissionPackage.metadata?.companyAddress || '',
          contact: {
            name: submissionPackage.metadata?.contactName || '',
            phone: submissionPackage.metadata?.contactPhone || '',
            email: submissionPackage.metadata?.contactEmail || ''
          }
        }
      },
      device: {
        tradeName: submissionPackage.metadata?.deviceName || '',
        commonName: submissionPackage.metadata?.commonName || '',
        classification: submissionPackage.metadata?.deviceClass || '',
        productCode: submissionPackage.metadata?.productCode || '',
        regulationNumber: submissionPackage.metadata?.regulationNumber || '',
        indicationsForUse: submissionPackage.metadata?.indicationsForUse || ''
      },
      documents: submissionPackage.documents.map(doc => ({
        documentId: doc.documentId,
        title: doc.title,
        type: doc.documentType,
        version: doc.version,
        checksum: this.calculateChecksum(JSON.stringify(doc.content))
      })),
      predicates: submissionPackage.metadata?.predicates || [],
      testing: {
        biocompatibility: submissionPackage.metadata?.biocompatibilityTesting || false,
        sterility: submissionPackage.metadata?.sterilityTesting || false,
        electrical: submissionPackage.metadata?.electricalTesting || false,
        software: submissionPackage.metadata?.softwareTesting || false,
        clinical: submissionPackage.metadata?.clinicalTesting || false
      }
    };

    return this.xmlBuilder.buildObject(estarData);
  }

  /**
   * Create eCopy bundle for submission
   */
  private async createECopyBundle(
    submissionPackage: SubmissionPackage,
    estarXml: string
  ): Promise<string> {
    const bundleDir = path.join('/tmp', 'esg-bundles', submissionPackage.packageId);
    const bundlePath = `${bundleDir}.zip`;

    // Create directory structure
    await fs.promises.mkdir(bundleDir, { recursive: true });
    await fs.promises.mkdir(path.join(bundleDir, 'documents'), { recursive: true });
    await fs.promises.mkdir(path.join(bundleDir, 'forms'), { recursive: true });
    await fs.promises.mkdir(path.join(bundleDir, 'attachments'), { recursive: true });

    // Write eSTAR XML
    await fs.promises.writeFile(
      path.join(bundleDir, 'estar.xml'),
      estarXml,
      'utf8'
    );

    // Write documents
    for (const doc of submissionPackage.documents) {
      const filename = `${doc.documentType}_${doc.documentId}.json`;
      await fs.promises.writeFile(
        path.join(bundleDir, 'documents', filename),
        JSON.stringify(doc, null, 2),
        'utf8'
      );
    }

    // Create manifest
    const manifest = {
      packageId: submissionPackage.packageId,
      created: new Date().toISOString(),
      documentCount: submissionPackage.documents.length,
      checksum: this.calculateChecksum(estarXml)
    };

    await fs.promises.writeFile(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // Create ZIP archive
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(bundlePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => resolve(bundlePath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(bundleDir, false);
      archive.finalize();
    });
  }

  /**
   * Transmit bundle to FDA ESG
   */
  private async transmitToESG(
    bundlePath: string,
    packageId: string
  ): Promise<ESGResponse> {
    // In test mode, simulate submission
    if (this.config.testMode) {
      return this.simulateESGSubmission(packageId);
    }

    // Production transport (AS2 / SFTP) is not implemented in this repo.
    // Fail closed rather than fabricate an FDA transaction ID / ACK number
    // (same policy as downloadAcknowledgment below and
    // fdaIntegrationService.sendToESG).
    throw new Error(
      `ESG production transmission requires the production ESG transport client ` +
      `(AS2 over HTTPS or SFTP gateway) to be configured. ` +
      `Package: ${packageId}, bundle: ${bundlePath}. Error class: not-implemented. ` +
      `See docs/runbooks/esg-production-setup.md.`
    );
  }

  /**
   * Simulate ESG submission for test mode
   */
  private simulateESGSubmission(packageId: string): ESGResponse {
    // Deterministic local response. It used to report an 'accepted' status with
    // a reassuring success message and no marker distinguishing it from a real
    // one, so callers persisted it as a submitted package carrying an FDA
    // acknowledgment number. Nothing is transmitted here, and the shape now says
    // so in every field a caller or a human might read.
    const suffix = packageId.replace(/[^a-z0-9]/gi, '').slice(0, 9);
    return {
      transactionId: `SIMULATED-NOT-SENT-${suffix}`,
      acknowledgmentNumber: undefined,
      status: 'simulated_not_transmitted' as const,
      message:
        'SIMULATED — nothing was transmitted to FDA. No submission was made and no ' +
        'FDA acknowledgment exists. This identifier is local and has no agency meaning.',
      timestamp: new Date(),
      simulated: true,
    };
  }

  /**
   * Check submission status from FDA ESG
   */
  async checkSubmissionStatus(
    transactionId: string
  ): Promise<ESGResponse> {
    // Local, non-transmitting mode. This is the second place that fabricated an
    // FDA acceptance: it returned status 'accepted' with a minted ACK number for
    // a transaction that was never sent, so a status poll would "confirm" the
    // imaginary submission the simulated transmit had reported. There is no
    // agency state to report, and saying so is the only honest answer.
    if (this.config.testMode) {
      return {
        transactionId,
        acknowledgmentNumber: undefined,
        status: 'simulated_not_transmitted',
        message:
          'SIMULATED — nothing was transmitted to FDA, so there is no agency status to report. ' +
          'No submission exists under this identifier.',
        timestamp: new Date(),
        simulated: true,
      };
    }

    // Production status polling requires the real ESG transport client.
    // Fail closed rather than report a fabricated 'processing' state
    // (same policy as transmitToESG / downloadAcknowledgment).
    throw new Error(
      `ESG production status check requires the production ESG transport client ` +
      `(AS2 over HTTPS or SFTP gateway) to be configured. ` +
      `Tracking number: ${transactionId}. Error class: not-implemented. ` +
      `See docs/runbooks/esg-production-setup.md.`
    );
  }

  /**
   * Map an ESG response onto the fields persisted on the
   * fda_510k_submission_packages row.
   *
   * Static and pure so the invariant is unit-testable without a database:
   * a simulated run must NEVER produce a package status implying a real
   * transmission ('submitted' / 'accepted' / 'transmitted').
   *
   * Two regimes:
   *
   *   - Simulated (`simulated: true` or status 'simulated_not_transmitted'):
   *     NOTHING was transmitted, so the row gets the explicit local status
   *     'simulated' with no submittedAt / submittedBy and no acknowledgment
   *     number — the `simulated` flag is checked first, so even a malformed
   *     response carrying both the flag and a real-sounding status or a
   *     minted ACK number still fails closed. The local transactionId
   *     (SIMULATED-NOT-SENT-*) is kept for traceability; its own text says
   *     it is not an ESG transaction.
   *
   *   - Real transport statuses ('submitted' | 'processing' | 'accepted' |
   *     'rejected'): unreachable today — transmitToESG throws in production
   *     before this runs — but the original accepted → submitted persistence
   *     gate is preserved so the row reflects the agency outcome once the
   *     production transport client exists.
   */
  static packageUpdateForResponse(
    response: ESGResponse,
    userId: number
  ): {
    esgTransactionId: string;
    fdaAcknowledgmentNumber: string | null;
    status: 'simulated' | 'submitted' | 'ready';
    submittedAt: Date | null;
    submittedBy: number | null;
  } {
    if (response.simulated || response.status === 'simulated_not_transmitted') {
      return {
        esgTransactionId: response.transactionId,
        fdaAcknowledgmentNumber: null,
        status: 'simulated',
        submittedAt: null,
        submittedBy: null
      };
    }

    return {
      esgTransactionId: response.transactionId,
      fdaAcknowledgmentNumber: response.acknowledgmentNumber || null,
      status: response.status === 'accepted' ? 'submitted' : 'ready',
      submittedAt: response.status === 'accepted' ? new Date() : null,
      submittedBy: response.status === 'accepted' ? userId : null
    };
  }

  /**
   * Update submission package status
   */
  private async updateSubmissionStatus(
    packageId: string,
    response: ESGResponse,
    userId: number,
    organizationId: number
  ): Promise<void> {
    await db!
      .update(fda510kSubmissionPackages)
      .set({
        ...ESGSubmissionService.packageUpdateForResponse(response, userId),
        updatedAt: new Date()
      })
      .where(eq(fda510kSubmissionPackages.packageId, packageId));
  }

  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    projectId: number,
    userId: number,
    organizationId: number,
    action: string,
    metadata: any
  ): Promise<void> {
    const [actingUser] = await db!
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await db!.insert(sharepoint_audit_log).values({
      action,
      details: {
        entityType: 'esg-submission',
        entityId: String(projectId),
        projectId,
        metadata,
      },
      userId: String(userId),
      userName: actingUser?.name ?? `user-${userId}`,
      organizationId,
      timestamp: new Date()
    } as any);
  }

  /**
   * Download acknowledgment from FDA ESG.
   *
   * The FDA ESG returns three acknowledgements per submission:
   *   - ack1: receipt-of-transmission (MDN, AS2 layer)
   *   - ack2: received-by-CDER / center
   *   - ack3: final acceptance / rejection
   *
   * In test/staging mode this method synthesises a deterministic mock
   * acknowledgement so downstream code paths (routes, audit, UI) can be
   * exercised end-to-end without real ESG credentials.
   *
   * In production this method requires a real ESG transport client
   * (AS2 over HTTPS or the SFTP gateway) plus production credentials.
   * Neither exists in this repo today — `transmitToESG` and the sibling
   * `fdaIntegrationService.sendToESG` are themselves still mocks. Rather
   * than ship a partial AS2/SFTP implementation here (>>100 LOC, mTLS,
   * vendor-specific framing), this branch fails fast with an actionable
   * error pointing at the runbook so the work is tracked and unblocked
   * deliberately.
   */
  async downloadAcknowledgment(
    transactionId: string
  ): Promise<Buffer> {
    // Local, non-transmitting mode. This used to return a document headed
    // "FDA Electronic Submission Gateway / Acknowledgment Receipt" reporting
    // "Status: RECEIVED" — a file a sponsor could archive and later mistake for
    // agency proof of a submission that never happened. That is exactly the
    // hazard server/services/submission-gateways/acknowledgement.ts was written
    // to eliminate; this mirrors its wording rather than inventing a second
    // convention.
    if (this.config.testMode) {
      const record = [
        'CONCEPT2CURE LOCAL SIMULATION RECORD',
        'THIS IS NOT AN AGENCY ACKNOWLEDGEMENT.',
        '',
        'No submission was transmitted to FDA. No FDA acknowledgement exists for',
        'this identifier. This file was produced by a local, non-transmitting',
        'simulation and has no regulatory meaning whatsoever. Do not archive it',
        'as evidence of a submission.',
        '',
        `Local identifier: ${transactionId}`,
        `Generated:        ${new Date().toISOString()}`,
        'Transmitted:      NO',
        'Agency receipt:   NONE',
      ].join('\n');

      return Buffer.from(record, 'utf8');
    }

    // Production path — credential preflight. The repo's existing prefix is
    // FDA_ESG_* (see constructor). Reuse it; do not invent ESG_PROD_*.
    const missing: string[] = [];
    if (!process.env.FDA_ESG_URL) missing.push('FDA_ESG_URL');
    if (!process.env.FDA_ESG_USERNAME) missing.push('FDA_ESG_USERNAME');
    if (!process.env.FDA_ESG_CERT_PATH && !process.env.FDA_ESG_PASSWORD) {
      // Either mTLS cert path or password auth must be present
      missing.push('FDA_ESG_CERT_PATH or FDA_ESG_PASSWORD');
    }
    if (missing.length > 0) {
      throw new Error(
        `ESG production credentials not configured for tracking ${transactionId} ` +
        `(error class: auth) — set FDA_ESG_* env vars (missing: ${missing.join(', ')}). ` +
        `See docs/runbooks/esg-production-setup.md.`
      );
    }

    // Production transport (AS2 / SFTP) is not implemented in this repo.
    // Fail with a structured, actionable error instead of a bare "not implemented".
    throw new Error(
      `ESG production acknowledgement download requires the production ESG transport ` +
      `client (AS2 over HTTPS or SFTP gateway) to be configured. ` +
      `Tracking number: ${transactionId}. Error class: not-implemented. ` +
      `See docs/runbooks/esg-production-setup.md.`
    );
  }
}

export default ESGSubmissionService;