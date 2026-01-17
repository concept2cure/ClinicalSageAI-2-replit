import { getOrganizationIdFromProgram } from '../utils/org-utils';

interface AutoVaultConfig {
  programId: string;
  organizationId: number;
}

interface VaultService {
  ensureFolder: (tenantId: number, folderPath: string, createdById?: string | null) => Promise<number>;
  createDocument: (tenantId: number, documentData: any, file?: any) => Promise<any>;
  getDocumentById: (tenantId: number, documentId: number) => Promise<any>;
  updateDocumentMetadata: (tenantId: number, documentId: number, updates: any) => Promise<any>;
}

export class AutoVaultIngest {
  private config: AutoVaultConfig;
  private vaultService: VaultService;

  private constructor(vaultService: VaultService, programId: string, organizationId: number) {
    this.vaultService = vaultService;
    this.config = { programId, organizationId };
  }

  static async create(
    vaultService: VaultService,
    programId: string,
    organizationId?: number
  ): Promise<AutoVaultIngest> {
    const resolvedOrgId = organizationId ?? (await getOrganizationIdFromProgram(programId));
    return new AutoVaultIngest(vaultService, programId, resolvedOrgId);
  }

  /**
   * Automatically saves CSR evidence to vault after pipeline fetch
   */
  async saveCSREvidence(csrData: any, isRealData: boolean): Promise<number> {
    const documentName = `${csrData.clinicalTrialId}.json`;
    const folderPath = `/programs/${this.config.programId}/evidence/csr`;

    const folderId = await this.vaultService.ensureFolder(
      this.config.organizationId,
      folderPath,
      'system-pipeline'
    );

    const savedDoc = await this.vaultService.createDocument(
      this.config.organizationId,
      {
        title: documentName,
        type: 'CSR',
        category: 'clinical-evidence',
        status: 'APPROVED',
        folderId,
        metadata: {
          studyId: csrData.clinicalTrialId,
          enrollment: csrData.enrollment,
          source: isRealData ? 'HEALTH_CANADA_API' : 'OFFLINE_FALLBACK',
          fetchDuration: csrData.fetchDuration || null,
          dataCompleteness: csrData.dataCompleteness,
          validationErrors: csrData.validationErrors || 0,
        },
        links: {
          claims: [],
          standards: [],
          outcomes: [],
        },
        userId: 'system-pipeline',
      },
      {
        originalname: documentName,
        buffer: Buffer.from(JSON.stringify(csrData, null, 2)),
        size: Buffer.byteLength(JSON.stringify(csrData)),
      }
    );

    console.log(`✅ Auto-saved CSR: ${documentName} to ${folderPath}`);
    return savedDoc.id;
  }

  /**
   * Automatically saves submission package after pipeline generation
   */
  async saveSubmissionPackage(zipBuffer: Buffer, modulesCompleted: number): Promise<number> {
    const documentName = `fda-submission-${new Date().toISOString().split('T')[0]}.zip`;
    const folderPath = `/programs/${this.config.programId}/submissions/fda`;

    const folderId = await this.vaultService.ensureFolder(
      this.config.organizationId,
      folderPath,
      'system-pipeline'
    );

    const savedDoc = await this.vaultService.createDocument(
      this.config.organizationId,
      {
        title: documentName,
        type: 'SUBMISSION_PACKAGE',
        category: 'regulatory-submission',
        status: 'APPROVED',
        folderId,
        metadata: {
          regulatoryBody: 'FDA',
          pathway: '510(k)',
          modulesCompleted,
          generationDate: new Date().toISOString(),
          pipelineVersion: '2.0',
        },
        links: {
          claims: [],
          standards: [],
          outcomes: [],
        },
        userId: 'system-pipeline',
      },
      {
        originalname: documentName,
        buffer: zipBuffer,
        size: zipBuffer.length,
      }
    );

    console.log(`✅ Auto-saved submission: ${documentName} to ${folderPath}`);
    return savedDoc.id;
  }

  /**
   * Updates document links after enrichment (claims, standards, outcomes)
   */
  async updateDocumentLinks(documentId: number, enrichment: any): Promise<void> {
    try {
      const doc = await this.vaultService.getDocumentById(this.config.organizationId, documentId);

      const updatedLinks = {
        ...(doc?.links || {}),
        claims: enrichment.claims?.map((claim: any) => claim.id) || doc?.links?.claims || [],
        standards: enrichment.standards?.map((standard: any) => standard.id) || doc?.links?.standards || [],
        outcomes: enrichment.outcomes?.map((outcome: any) => outcome.id) || doc?.links?.outcomes || [],
      };

      await this.vaultService.updateDocumentMetadata(this.config.organizationId, documentId, {
        links: updatedLinks,
        metadata: {
          ...(doc?.metadata || {}),
          predicateDevice: enrichment.predicateDeviceMatch,
          regulatoryRelevance: enrichment.regulatoryRelevance,
          qcFlags: enrichment.qcFlags,
        },
        userId: 'system-pipeline',
      });

      console.log(`✅ Updated links for document: ${documentId}`);
    } catch (error) {
      console.error('❌ Auto-vault link update failed:', error);
    }
  }
}
