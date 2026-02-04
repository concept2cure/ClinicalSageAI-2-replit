import {
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  date,
  boolean,
  decimal,
  customType,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const vault = pgSchema('vault');

const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${config.dimensions})`;
    },
    toDriver(value: number[]): string {
      return JSON.stringify(value);
    },
    fromDriver(value: string): number[] {
      if (typeof value === 'string') {
        return JSON.parse(value);
      }
      return value as any;
    },
  })(name);

export const storageClass = vault.enum('storage_class', [
  'STANDARD',
  'INTELLIGENT',
  'ARCHIVE',
  'DEEP_ARCHIVE',
]);

export const documentClassification = vault.enum('document_classification', [
  'CONFIDENTIAL',
  'INTERNAL',
  'CONTROLLED',
  'PUBLIC',
]);

export const processingStatus = vault.enum('processing_status', [
  'PENDING',
  'EXTRACTING',
  'VECTORIZING',
  'INDEXED',
  'FAILED',
  'ARCHIVED',
]);

export const vaultDocuments = vault.table(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    programId: uuid('program_id').notNull(),

    documentCode: text('document_code').notNull(),
    documentTitle: text('document_title').notNull(),
    documentType: text('document_type').notNull(),
    version: text('version').default('1.0'),

    s3Bucket: text('s3_bucket').notNull(),
    s3Key: text('s3_key').notNull(),
    s3VersionId: text('s3_version_id'),
    storageClass: storageClass('storage_class').notNull().default('STANDARD'),

    fileName: text('file_name').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    contentHash: text('content_hash').notNull(),

    classification: documentClassification('classification').notNull().default('INTERNAL'),
    retentionPolicy: text('retention_policy'),
    retentionUntil: date('retention_until'),

    processingStatus: processingStatus('processing_status').notNull().default('PENDING'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),

    extractedText: text('extracted_text'),
    pageCount: integer('page_count'),
    wordCount: integer('word_count'),
    language: text('language').default('en'),

    parentDocumentId: uuid('parent_document_id'),
    supersedesId: uuid('supersedes_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  table => ({
    uniqueProgramDocVersion: unique('vault_documents_program_doc_version').on(
      table.programId,
      table.documentCode,
      table.version
    ),
  })
);

export const vaultDocumentChunks = vault.table(
  'document_chunks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    documentId: uuid('document_id').notNull(),

    chunkIndex: integer('chunk_index').notNull(),
    chunkType: text('chunk_type').notNull().default('TEXT'),

    chunkText: text('chunk_text').notNull(),
    charStart: integer('char_start'),
    charEnd: integer('char_end'),
    pageNumber: integer('page_number'),

    sectionTitle: text('section_title'),
    sectionHierarchy: text('section_hierarchy').array(),

    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingModel: text('embedding_model').default('text-embedding-ada-002'),

    tokenCount: integer('token_count'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    vectorizedAt: timestamp('vectorized_at', { withTimezone: true }),
  },
  table => ({
    uniqueDocumentChunk: unique('vault_document_chunks_document_index').on(
      table.documentId,
      table.chunkIndex
    ),
  })
);

export const vaultEvidenceCitations = vault.table('evidence_citations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  sourceDocumentId: uuid('source_document_id').notNull(),
  sourceChunkId: uuid('source_chunk_id'),
  claimText: text('claim_text').notNull(),

  evidenceDocumentId: uuid('evidence_document_id').notNull(),
  evidenceChunkId: uuid('evidence_chunk_id'),
  evidenceText: text('evidence_text'),

  relevanceScore: decimal('relevance_score', { precision: 3, scale: 2 }),
  supportType: text('support_type'),

  citationContext: text('citation_context'),
  regulatoryRelevance: text('regulatory_relevance').array(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  verified: boolean('verified').default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by'),
});
