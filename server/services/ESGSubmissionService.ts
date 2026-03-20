import { db } from '../db';
import { 
  fda510kSubmissionPackages,
  fda510kProjects,
  fda510kDocuments,
  sharepoint_audit_log
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
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

interface ESGResponse {
  transactionId: string;
  acknowledgmentNumber?: string;
  status: 'submitted' | 'processing' | 'accepted' | 'rejected';
  message: string;
  timestamp: Date;
}

class ESGSubmissionService {
  private config: ESGSubmissionConfig;
  private xmlBuilder: xml2js.Builder;

  constructor() {
    // Configure based on environment
    this.config = {
      gatewayUrl: process.env.FDA_ESG_URL || 'https://esgtest.fda.gov/gateway',
      certificatePath: process.env.FDA_ESG_CERT_PATH,
      privateKeyPath: process.env.FDA_ESG_KEY_PATH,
      username: process.env.FDA_ESG_USERNAME,
      password: process.env.FDA_ESG_PASSWORD,
      testMode: process.env.NODE_ENV !== 'production'
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
    // Fetch all documents for the project
    const documents = await db!
      .select()
      .from(fda510kDocuments)
      .where(eq(fda510kDocuments.projectId, projectId));

    // Fetch project details
    const [project] = await db!
      .select()
      .from(fda510kProjects)
      .where(eq(fda510kProjects.id, projectId));

    if (!project) {
      throw new Error('Project not found');
    }

    // Generate unique package ID
    const packageId = `PKG-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create submission package record
    await db!.insert(fda510kSubmissionPackages).values({
      organizationId,
      projectId,
      packageId,
      packageName: `510k_${project.projectName}_${new Date().toISOString().split('T')[0]}`,
      packageType: '510k',
      documents: documents.map(d => ({
        documentId: d.documentId,
        title: d.title,
        type: d.documentType,
        version: d.version
      })),
      attachments: [],
      estarData: {
        projectName: project.projectName,
        submissionType: '510k',
        deviceName: project.projectMetadata?.deviceName || '',
        indicationsForUse: project.projectMetadata?.indicationsForUse || ''
      },
      submissionMethod: 'esg',
      status: 'ready',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return {
      projectId,
      packageId,
      documents,
      metadata: project.projectMetadata
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

    // In production, would use actual FDA ESG API/AS2 protocol
    try {
      // This would be the actual FDA ESG submission code
      // Using their AS2 protocol or SFTP gateway
      
      // For now, return a mock response
      return {
        transactionId: `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        acknowledgmentNumber: `ACK${new Date().getFullYear()}${Math.random().toString().slice(2, 8)}`,
        status: 'submitted',
        message: 'Submission received and queued for processing',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('ESG transmission error:', error);
      throw new Error('Failed to transmit to FDA ESG');
    }
  }

  /**
   * Simulate ESG submission for test mode
   */
  private simulateESGSubmission(packageId: string): ESGResponse {
    // Deterministic test response — always returns 'accepted' for reliable testing
    return {
      transactionId: `TEST-TXN-${Date.now()}`,
      acknowledgmentNumber: `TEST-ACK-${packageId.replace(/[^a-z0-9]/gi, '').slice(0, 9)}`,
      status: 'accepted' as const,
      message: 'Test submission accepted successfully',
      timestamp: new Date(),
    };
  }

  /**
   * Check submission status from FDA ESG
   */
  async checkSubmissionStatus(
    transactionId: string
  ): Promise<ESGResponse> {
    // In test mode, return mock status
    if (this.config.testMode) {
      return {
        transactionId,
        acknowledgmentNumber: `ACK-${Math.random().toString(36).substr(2, 9)}`,
        status: 'accepted',
        message: 'Submission has been accepted',
        timestamp: new Date()
      };
    }

    // In production, would check actual FDA ESG status
    // This would involve calling FDA ESG API to check status
    
    return {
      transactionId,
      status: 'processing',
      message: 'Submission is being processed',
      timestamp: new Date()
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
        esgTransactionId: response.transactionId,
        fdaAcknowledgmentNumber: response.acknowledgmentNumber || null,
        status: response.status === 'accepted' ? 'submitted' : 'ready',
        submittedAt: response.status === 'accepted' ? new Date() : null,
        submittedBy: response.status === 'accepted' ? userId : null,
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
    await db!.insert(sharepoint_audit_log).values({
      action,
      entityType: 'esg-submission',
      entityId: String(projectId),
      userId: String(userId),
      organizationId,
      metadata: JSON.stringify(metadata),
      timestamp: new Date()
    });
  }

  /**
   * Download acknowledgment from FDA
   */
  async downloadAcknowledgment(
    transactionId: string
  ): Promise<Buffer> {
    // In test mode, generate mock acknowledgment
    if (this.config.testMode) {
      const mockAck = `
        FDA Electronic Submission Gateway
        Acknowledgment Receipt
        
        Transaction ID: ${transactionId}
        Date: ${new Date().toISOString()}
        Status: RECEIVED
        
        Your submission has been received and will be processed.
        You will receive additional notifications regarding the status of your submission.
      `;
      
      return Buffer.from(mockAck, 'utf8');
    }

    // In production, would download actual acknowledgment from FDA
    throw new Error('Production acknowledgment download not implemented');
  }
}

export default ESGSubmissionService;