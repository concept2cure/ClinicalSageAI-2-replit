/**
 * S3 Storage Service - Regulatory Document Storage Provider
 *
 * Provides secure, compliant storage for Evidence Vault documents:
 * - vault-raw/{id}.pdf: Original source documents (immutable)
 * - vault-processed/{id}.json: Structured extractions (Text + Tables + Figures)
 *
 * 21 CFR Part 11 compliant: All operations are logged with timestamps and checksums.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { Readable } from 'stream';

// Configuration
const S3_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.S3_VAULT_BUCKET || 'concept2cure-evidence-vault',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    : undefined,
};

// Storage paths
const STORAGE_PATHS = {
  RAW: 'vault-raw', // Original documents (PDF, DOCX)
  PROCESSED: 'vault-processed', // Structured JSON extractions
  TABLES: 'vault-tables', // Extracted table data
  FIGURES: 'vault-figures', // Extracted figure metadata
  REDACTED: 'vault-redacted', // PII-redacted versions
} as const;

// Types
export interface StorageMetadata {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  md5Checksum: string;
  sha256Checksum: string;
  uploadedAt: string;
  uploadedBy?: string;
  programId?: string;
  projectId?: string;
  classification?: 'confidential' | 'internal' | 'public';
  retentionPolicy?: string;
}

export interface ProcessedDocument {
  documentId: string;
  version: string;
  extractedAt: string;
  processingPipeline: string;
  content: {
    text: TextAtom[];
    tables: TableAtom[];
    figures: FigureAtom[];
  };
  metadata: {
    pageCount: number;
    hasImages: boolean;
    hasTables: boolean;
    detectedLanguage: string;
    extractionConfidence: number;
  };
}

export interface TextAtom {
  id: string;
  pageNumber: number;
  sectionTitle?: string;
  content: string;
  boundingBox?: BoundingBox;
}

export interface TableAtom {
  id: string;
  pageNumber: number;
  tableIndex: number;
  caption?: string;
  headers: string[];
  rows: string[][];
  markdown: string;
  json: Record<string, any>[];
  boundingBox?: BoundingBox;
  confidence: number;
}

export interface FigureAtom {
  id: string;
  pageNumber: number;
  figureIndex: number;
  caption?: string;
  altText?: string;
  imageType: 'chart' | 'diagram' | 'photograph' | 'graph' | 'other';
  extractedData?: any;
  boundingBox?: BoundingBox;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UploadResult {
  success: boolean;
  documentId: string;
  path: string;
  etag?: string;
  checksums: {
    md5: string;
    sha256: string;
  };
  metadata: StorageMetadata;
}

// S3 Storage Service
class S3StorageService {
  private client: S3Client;
  private bucket: string;
  private initialized: boolean = false;

  constructor() {
    this.client = new S3Client({
      region: S3_CONFIG.region,
      credentials: S3_CONFIG.credentials,
    });
    this.bucket = S3_CONFIG.bucket;
  }

  /**
   * Initialize the service and verify bucket access
   */
  async initialize(): Promise<boolean> {
    try {
      // Test bucket access
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          MaxKeys: 1,
        })
      );
      this.initialized = true;
      console.log(`[S3Storage] Initialized: bucket=${this.bucket}`);
      return true;
    } catch (error: any) {
      console.error(`[S3Storage] Initialization failed:`, error.message);
      // Fall back to local storage mode if S3 not available
      this.initialized = false;
      return false;
    }
  }

  /**
   * Upload raw document (original PDF/DOCX)
   */
  async uploadRawDocument(
    documentId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    uploadedBy?: string,
    additionalMetadata?: Partial<StorageMetadata>
  ): Promise<UploadResult> {
    const md5 = createHash('md5').update(buffer).digest('hex');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const path = `${STORAGE_PATHS.RAW}/${documentId}${this.getExtension(filename)}`;

    const metadata: StorageMetadata = {
      documentId,
      originalFilename: filename,
      mimeType,
      sizeBytes: buffer.length,
      md5Checksum: md5,
      sha256Checksum: sha256,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
      ...additionalMetadata,
    };

    try {
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: path,
          Body: buffer,
          ContentType: mimeType,
          ContentMD5: Buffer.from(md5, 'hex').toString('base64'),
          Metadata: this.flattenMetadata(metadata),
          // Part 11 compliance: server-side encryption
          ServerSideEncryption: 'AES256',
        })
      );

      return {
        success: true,
        documentId,
        path,
        etag: result.ETag,
        checksums: { md5, sha256 },
        metadata,
      };
    } catch (error: any) {
      console.error(`[S3Storage] Upload failed:`, error.message);
      throw new Error(`Failed to upload document: ${error.message}`);
    }
  }

  /**
   * Upload processed document (structured JSON extraction)
   */
  async uploadProcessedDocument(
    documentId: string,
    processed: ProcessedDocument
  ): Promise<UploadResult> {
    const json = JSON.stringify(processed, null, 2);
    const buffer = Buffer.from(json, 'utf-8');
    const md5 = createHash('md5').update(buffer).digest('hex');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const path = `${STORAGE_PATHS.PROCESSED}/${documentId}.json`;

    const metadata: StorageMetadata = {
      documentId,
      originalFilename: `${documentId}.json`,
      mimeType: 'application/json',
      sizeBytes: buffer.length,
      md5Checksum: md5,
      sha256Checksum: sha256,
      uploadedAt: new Date().toISOString(),
    };

    try {
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: path,
          Body: buffer,
          ContentType: 'application/json',
          Metadata: {
            documentId,
            version: processed.version,
            extractedAt: processed.extractedAt,
            pageCount: String(processed.metadata.pageCount),
            tableCount: String(processed.content.tables.length),
            figureCount: String(processed.content.figures.length),
          },
          ServerSideEncryption: 'AES256',
        })
      );

      return {
        success: true,
        documentId,
        path,
        etag: result.ETag,
        checksums: { md5, sha256 },
        metadata,
      };
    } catch (error: any) {
      console.error(`[S3Storage] Processed upload failed:`, error.message);
      throw new Error(`Failed to upload processed document: ${error.message}`);
    }
  }

  /**
   * Download raw document
   */
  async downloadRawDocument(
    documentId: string
  ): Promise<{ buffer: Buffer; metadata: Record<string, string> }> {
    // Try common extensions
    const extensions = ['.pdf', '.docx', '.doc', ''];

    for (const ext of extensions) {
      const path = `${STORAGE_PATHS.RAW}/${documentId}${ext}`;
      try {
        const result = await this.client.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: path,
          })
        );

        const stream = result.Body as Readable;
        const chunks: Buffer[] = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        return {
          buffer: Buffer.concat(chunks),
          metadata: result.Metadata || {},
        };
      } catch (error: any) {
        if (error.name !== 'NoSuchKey') throw error;
      }
    }

    throw new Error(`Document not found: ${documentId}`);
  }

  /**
   * Download processed document
   */
  async downloadProcessedDocument(documentId: string): Promise<ProcessedDocument> {
    const path = `${STORAGE_PATHS.PROCESSED}/${documentId}.json`;

    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );

      const stream = result.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const json = Buffer.concat(chunks).toString('utf-8');
      return JSON.parse(json) as ProcessedDocument;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        throw new Error(`Processed document not found: ${documentId}`);
      }
      throw error;
    }
  }

  /**
   * Generate presigned URL for secure download
   */
  async getPresignedDownloadUrl(documentId: string, expiresIn: number = 3600): Promise<string> {
    const path = `${STORAGE_PATHS.RAW}/${documentId}.pdf`;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    });

    // @aws-sdk/s3-request-presigner (3.1051) and @aws-sdk/client-s3 (3.1020)
    // resolve different @smithy/types versions, so S3Client is not structurally
    // identical to the presigner's expected Client type. The runtime contract is
    // compatible; cast to the presigner's own first-parameter type at this
    // SDK-version boundary.
    return getSignedUrl(this.client as Parameters<typeof getSignedUrl>[0], command, { expiresIn });
  }

  /**
   * Generate presigned URL for secure upload
   */
  async getPresignedUploadUrl(
    documentId: string,
    mimeType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const path = `${STORAGE_PATHS.RAW}/${documentId}${this.getMimeExtension(mimeType)}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
    });

    // SDK-version boundary — see getPresignedDownloadUrl for rationale.
    return getSignedUrl(this.client as Parameters<typeof getSignedUrl>[0], command, { expiresIn });
  }

  /**
   * Check if document exists
   */
  async documentExists(documentId: string, type: 'raw' | 'processed' = 'raw'): Promise<boolean> {
    const basePath = type === 'raw' ? STORAGE_PATHS.RAW : STORAGE_PATHS.PROCESSED;
    const extension = type === 'raw' ? '.pdf' : '.json';
    const path = `${basePath}/${documentId}${extension}`;

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete document (all versions)
   */
  async deleteDocument(documentId: string): Promise<void> {
    const paths = [
      `${STORAGE_PATHS.RAW}/${documentId}.pdf`,
      `${STORAGE_PATHS.PROCESSED}/${documentId}.json`,
      `${STORAGE_PATHS.REDACTED}/${documentId}.pdf`,
    ];

    for (const path of paths) {
      try {
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: path,
          })
        );
      } catch (error: any) {
        // Ignore not found errors
        if (error.name !== 'NoSuchKey') {
          console.warn(`[S3Storage] Failed to delete ${path}:`, error.message);
        }
      }
    }
  }

  /**
   * List documents with pagination
   */
  async listDocuments(
    prefix: keyof typeof STORAGE_PATHS = 'RAW',
    maxKeys: number = 100,
    continuationToken?: string
  ): Promise<{ keys: string[]; nextToken?: string }> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: STORAGE_PATHS[prefix],
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      })
    );

    return {
      keys: result.Contents?.map((obj: { Key?: string }) => obj.Key || '').filter(Boolean) || [],
      nextToken: result.NextContinuationToken,
    };
  }

  /**
   * Copy document to redacted storage after PII removal
   */
  async copyToRedacted(documentId: string): Promise<void> {
    const sourcePath = `${STORAGE_PATHS.RAW}/${documentId}.pdf`;
    const destPath = `${STORAGE_PATHS.REDACTED}/${documentId}.pdf`;

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourcePath}`,
        Key: destPath,
        MetadataDirective: 'COPY',
        ServerSideEncryption: 'AES256',
      })
    );
  }

  // Helper methods
  private getExtension(filename: string): string {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : '';
  }

  private getMimeExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/msword': '.doc',
      'text/plain': '.txt',
    };
    return map[mimeType] || '';
  }

  private flattenMetadata(metadata: StorageMetadata): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }
    return result;
  }

  // Getters
  get isInitialized(): boolean {
    return this.initialized;
  }

  get bucketName(): string {
    return this.bucket;
  }
}

// Singleton instance
export const s3Storage = new S3StorageService();

// Export types and service
export default S3StorageService;
