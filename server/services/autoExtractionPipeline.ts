/**
 * @fileoverview Automatic Extraction Pipeline Service
 * @module server/services/autoExtractionPipeline
 * @version 1.0.0
 *
 * Addresses P1 audit gap:
 * - "6.2 Is extraction automatic without manual hunting? ⚠️ Partial"
 * - "Extraction appears to require explicit route calls rather than triggering
 *    automatically on file upload. Not a fully background/automatic pipeline."
 *
 * Provides:
 * 1. Automatic extraction on file upload (hook into upload routes)
 * 2. Background job queue for extraction tasks
 * 3. Multi-format support (PDF, DOCX, HTML, XLSX, CSV)
 * 4. Auto-metadata enrichment (classify type, detect sections, extract entities)
 * 5. Quality scoring of extracted data
 * 6. Integration with Data Room (concept2cure_artifacts)
 *
 * @compliance FDA 21 CFR Part 11 data integrity
 */

import { governedActor } from './part11/governed-actor';
import { pool } from '../db.js';
import auditService from './auditService';
import { recordArtifactProvenance } from './provenance/artifact-provenance';
import crypto from 'crypto';
import { ai } from '../lib/unified-ai-client';
import { resolveGovernedContext } from './concept2cure/governedDocumentContractService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractionJob {
  id: string;
  organizationId: number;
  projectId: number;
  userId: number;
  fileId: string;
  fileName: string;
  fileType: SupportedFileType;
  fileSize: number;
  status: ExtractionStatus;
  priority: number; // 1-100
  stages: ExtractionStage[];
  result?: ExtractionResult;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export type ExtractionStatus =
  | 'queued'
  | 'processing'
  | 'extracting_text'
  | 'extracting_tables'
  | 'classifying'
  | 'enriching_metadata'
  | 'computing_quality'
  | 'storing'
  | 'completed'
  | 'failed';

export type SupportedFileType =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'html'
  | 'xlsx'
  | 'xls'
  | 'csv'
  | 'txt'
  | 'xml'
  | 'rtf';

export interface ExtractionStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  details?: string;
}

export interface ExtractionResult {
  textContent: string;
  textLength: number;
  pageCount?: number;
  tables: ExtractedTableData[];
  figures: ExtractedFigureRef[];
  metadata: DocumentMetadata;
  sections: DetectedSection[];
  entities: ExtractedEntity[];
  qualityScore: number; // 0-1
  contentHash: string;
  artifacts: StoredArtifact[]; // Created artifacts in Data Room
}

export interface ExtractedTableData {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  pageNumber?: number;
  confidence: number;
  sourceHash: string;
}

export interface ExtractedFigureRef {
  id: string;
  caption: string;
  pageNumber?: number;
  figureType: string;
}

export interface DocumentMetadata {
  documentType: string; // CSR, IB, protocol, CMC, etc.
  submissionModule?: string; // M1-M5
  therapeuticArea?: string;
  compoundName?: string;
  studyId?: string;
  phase?: string;
  language: string;
  authors?: string[];
  createdDate?: string;
  regulatoryContext?: string;
}

export interface DetectedSection {
  code: string; // e.g., "2.7.1", "3.2.S.1"
  title: string;
  startPage?: number;
  endPage?: number;
  charStart: number;
  charEnd: number;
  content: string;
}

export interface ExtractedEntity {
  text: string;
  type: 'drug' | 'disease' | 'endpoint' | 'biomarker' | 'organization' | 'study' | 'standard';
  confidence: number;
  positions: Array<{ start: number; end: number }>;
}

export interface StoredArtifact {
  artifactId: string | null;
  type: string;
  title: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB QUEUE (in-memory for now, upgradeable to Redis/BullMQ)
// ═══════════════════════════════════════════════════════════════════════════════

const extractionQueue: Map<string, ExtractionJob> = new Map();
let isProcessing = false;

/**
 * Queue a file for automatic extraction.
 * Call this from any file upload handler to trigger background extraction.
 */
export async function queueExtraction(
  fileId: string,
  fileName: string,
  fileSize: number,
  projectId: number,
  organizationId: number,
  userId: number,
  options?: {
    priority?: number;
    immediate?: boolean;
  }
): Promise<ExtractionJob> {
  const fileType = detectFileType(fileName);
  if (!fileType) {
    throw new Error(`Unsupported file type: ${fileName}`);
  }

  const job: ExtractionJob = {
    id: crypto.randomUUID(),
    organizationId,
    projectId,
    userId,
    fileId,
    fileName,
    fileType,
    fileSize,
    status: 'queued',
    priority: options?.priority || calculatePriority(fileType, fileSize),
    stages: [
      { name: 'text_extraction', status: 'pending' },
      { name: 'table_extraction', status: 'pending' },
      { name: 'classification', status: 'pending' },
      { name: 'metadata_enrichment', status: 'pending' },
      { name: 'quality_scoring', status: 'pending' },
      { name: 'artifact_storage', status: 'pending' },
    ],
    createdAt: new Date().toISOString(),
  };

  extractionQueue.set(job.id, job);

  // Store job in DB for persistence
  await storeJob(job);

  // Start processing if not already running
  if (options?.immediate || !isProcessing) {
    processQueue().catch(err => console.error('[AutoExtraction] Queue error:', err));
  }

  return job;
}

/**
 * Get extraction job status.
 */
export function getExtractionStatus(jobId: string): ExtractionJob | undefined {
  return extractionQueue.get(jobId);
}

/**
 * Get all jobs for a project.
 */
export function getProjectExtractionJobs(projectId: number): ExtractionJob[] {
  return Array.from(extractionQueue.values())
    .filter(j => j.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (true) {
      // Get next job (highest priority first)
      const nextJob = getNextJob();
      if (!nextJob) break;

      await processJob(nextJob);
    }
  } finally {
    isProcessing = false;
  }
}

function getNextJob(): ExtractionJob | undefined {
  let best: ExtractionJob | undefined;
  for (const job of extractionQueue.values()) {
    if (job.status === 'queued') {
      if (!best || job.priority > best.priority) {
        best = job;
      }
    }
  }
  return best;
}

async function processJob(job: ExtractionJob): Promise<void> {
  const startTime = Date.now();
  job.status = 'processing';
  job.startedAt = new Date().toISOString();

  try {
    // Stage 1: Text extraction
    updateStage(job, 'text_extraction', 'running');
    job.status = 'extracting_text';
    const textContent = await extractText(job);
    updateStage(job, 'text_extraction', 'completed', `${textContent.length} chars`);

    // Stage 2: Table extraction
    updateStage(job, 'table_extraction', 'running');
    job.status = 'extracting_tables';
    const tables = await extractTables(textContent, job.fileType);
    updateStage(job, 'table_extraction', 'completed', `${tables.length} tables`);

    // Stage 3: Classification
    updateStage(job, 'classification', 'running');
    job.status = 'classifying';
    const { metadata, sections, entities } = await classifyAndEnrich(textContent, job.fileName);
    updateStage(job, 'classification', 'completed', metadata.documentType);

    // Stage 4: Metadata enrichment
    updateStage(job, 'metadata_enrichment', 'running');
    job.status = 'enriching_metadata';
    const figures = detectFigureReferences(textContent);
    updateStage(job, 'metadata_enrichment', 'completed', `${figures.length} figures`);

    // Stage 5: Quality scoring
    updateStage(job, 'quality_scoring', 'running');
    job.status = 'computing_quality';
    const qualityScore = computeExtractionQuality(textContent, tables, sections, entities);
    updateStage(job, 'quality_scoring', 'completed', `Score: ${qualityScore}`);

    // Stage 6: Store artifacts
    updateStage(job, 'artifact_storage', 'running');
    job.status = 'storing';
    const artifacts = await storeExtractedArtifacts(job, textContent, tables, metadata, sections);
    updateStage(job, 'artifact_storage', 'completed', `${artifacts.length} artifacts`);

    // Complete
    /* Digest of the FULL source text, and deliberately so — this identifies the
       document that was processed (dedup, idempotency), and `textLength` below
       records its real length, so the capped `textContent` preview is never
       presented as the whole. Do NOT "align" this with the artifact hashes in
       storeExtractedArtifacts: those must digest the bytes they persist,
       because verifyIntegrityChain recomputes over the stored column. Two
       different questions, two different digests. */
    const contentHash = crypto.createHash('sha256').update(textContent).digest('hex');
    job.result = {
      textContent: textContent.slice(0, 50000), // Cap stored text
      textLength: textContent.length,
      tables,
      figures,
      metadata,
      sections,
      entities,
      qualityScore,
      contentHash,
      artifacts,
    };
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.durationMs = Date.now() - startTime;

    await updateJobInDB(job);
    await logExtractionAudit(job);
  } catch (error: any) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    job.durationMs = Date.now() - startTime;
    await updateJobInDB(job);
    console.error(`[AutoExtraction] Job ${job.id} failed:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION STAGES
// ═══════════════════════════════════════════════════════════════════════════════

/** Raised when the source text for an extraction job cannot be read. */
export class ExtractionSourceUnavailableError extends Error {
  constructor(fileId: string, fileName: string) {
    super(
      `Extraction source unavailable: no stored text for artifact_id=${fileId} (${fileName}). ` +
        'The job is failed rather than completed with a placeholder.',
    );
    this.name = 'ExtractionSourceUnavailableError';
  }
}

/**
 * Load the source text for an extraction job.
 *
 * HISTORY (2026-08-14). This function used to FABRICATE its own output. When no
 * artifact row matched it returned the literal string
 * `[Extracted content from <name> - <type> format - <n> bytes]`, and a bare
 * catch returned `[Pending extraction from <name>]`. The caller then hashed
 * whichever string came back and stored it as a governed `category:'extracted'`
 * artifact — invented text, sealed and presented as extracted evidence.
 *
 * The catch fired reliably, because the query beneath the artifact lookup read
 * a table named `uploads`, which no migration in this repository creates. Every
 * job that did not hit the artifact row raised 42703/42P01 into that catch.
 *
 * It was latent rather than live only because the pipeline's sole HTTP entry
 * point could not call it (a positional function invoked with one object). That
 * route is repaired in the same change as this, deliberately: repairing it
 * alone would have switched on a pipeline that writes fabricated content as
 * governed evidence.
 *
 * Now it reads the one source that exists and throws when there is nothing to
 * read. A failed job is recoverable; a governed artifact containing invented
 * text is not.
 */
async function extractText(job: ExtractionJob): Promise<string> {
  const artifactResult = await pool.query(
    `SELECT content FROM concept2cure_artifacts
      WHERE artifact_id = $1 AND organization_id = $2`,
    [job.fileId, job.organizationId],
  );
  const content = artifactResult.rows[0]?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content;
  }
  // No second lookup: the `uploads` table this used to try does not exist, and
  // a query that can only ever fail is not a fallback.
  throw new ExtractionSourceUnavailableError(job.fileId, job.fileName);
}

async function extractTables(
  content: string,
  fileType: SupportedFileType
): Promise<ExtractedTableData[]> {
  if (!content || content.length < 50) return [];

  try {
    // Use AI to detect and extract tables from text
    const aiResult = await ai.chat({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract structured tables from the text. For each table, provide:
- title: table title/caption
- headers: column headers
- rows: 2D array of cell values
- confidence: 0-1 extraction confidence
Return JSON: {"tables": [{"title": "...", "headers": [...], "rows": [[...]], "confidence": 0.9}]}
Return empty tables array if no tables found.`,
        },
        { role: 'user', content: content.slice(0, 8000) },
      ],
    });

    const parsed = JSON.parse(aiResult.content || '{"tables":[]}');
    return (parsed.tables || []).map((t: any, i: number) => ({
      id: crypto.randomUUID(),
      title: t.title || `Table ${i + 1}`,
      headers: t.headers || [],
      rows: t.rows || [],
      confidence: t.confidence || 0.5,
      sourceHash: crypto.createHash('md5').update(JSON.stringify(t)).digest('hex'),
    }));
  } catch {
    return [];
  }
}

async function classifyAndEnrich(
  content: string,
  fileName: string
): Promise<{
  metadata: DocumentMetadata;
  sections: DetectedSection[];
  entities: ExtractedEntity[];
}> {
  try {
    const aiResult = await ai.chat({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Classify this regulatory document and extract metadata.

Return JSON:
{
  "metadata": {
    "documentType": "CSR|IB|Protocol|CMC|CER|Label|Briefing|Guidance|Literature|Other",
    "submissionModule": "M1|M2|M3|M4|M5|null",
    "therapeuticArea": "Oncology|Cardiology|...|null",
    "compoundName": "name or null",
    "studyId": "study ID or null",
    "phase": "1|2|3|4|null",
    "language": "en|...",
    "regulatoryContext": "FDA|EMA|PMDA|Health Canada|null"
  },
  "sections": [
    {"code": "2.7.1", "title": "Summary of Biopharmaceutic Studies", "charStart": 0, "charEnd": 100}
  ],
  "entities": [
    {"text": "entity", "type": "drug|disease|endpoint|biomarker|organization|study|standard", "confidence": 0.9}
  ]
}`,
        },
        {
          role: 'user',
          content: `File: ${fileName}\n\nContent (first 6000 chars):\n${content.slice(0, 6000)}`,
        },
      ],
    });

    const parsed = JSON.parse(aiResult.content || '{}');

    const metadata: DocumentMetadata = {
      documentType: parsed.metadata?.documentType || 'Other',
      submissionModule: parsed.metadata?.submissionModule,
      therapeuticArea: parsed.metadata?.therapeuticArea,
      compoundName: parsed.metadata?.compoundName,
      studyId: parsed.metadata?.studyId,
      phase: parsed.metadata?.phase,
      language: parsed.metadata?.language || 'en',
      regulatoryContext: parsed.metadata?.regulatoryContext,
    };

    const sections: DetectedSection[] = (parsed.sections || []).map((s: any) => ({
      code: s.code || '',
      title: s.title || '',
      charStart: s.charStart || 0,
      charEnd: s.charEnd || 0,
      content: content.slice(s.charStart || 0, s.charEnd || 0).slice(0, 2000),
    }));

    const entities: ExtractedEntity[] = (parsed.entities || []).map((e: any) => ({
      text: e.text,
      type: e.type || 'study',
      confidence: e.confidence || 0.5,
      positions: findEntityPositions(content, e.text),
    }));

    return { metadata, sections, entities };
  } catch {
    return {
      metadata: { documentType: 'Other', language: 'en' },
      sections: [],
      entities: [],
    };
  }
}

function detectFigureReferences(content: string): ExtractedFigureRef[] {
  const figures: ExtractedFigureRef[] = [];
  const figRegex = /(?:Figure|Fig\.?)\s+(\d+(?:\.\d+)?)\s*[.:—\-]\s*(.{10,100})/gi;
  let match;

  while ((match = figRegex.exec(content)) !== null) {
    figures.push({
      id: crypto.randomUUID(),
      caption: match[2].trim(),
      figureType: 'referenced',
    });
  }

  return figures;
}

function computeExtractionQuality(
  text: string,
  tables: ExtractedTableData[],
  sections: DetectedSection[],
  entities: ExtractedEntity[]
): number {
  let score = 0;
  let factors = 0;

  // Text completeness (0-0.3)
  if (text.length > 1000) {
    score += 0.3;
    factors++;
  } else if (text.length > 100) {
    score += 0.15;
    factors++;
  } else {
    factors++;
  }

  // Table extraction (0-0.2)
  if (tables.length > 0) {
    const avgTableConf = tables.reduce((s, t) => s + t.confidence, 0) / tables.length;
    score += avgTableConf * 0.2;
  }
  factors++;

  // Section detection (0-0.2)
  if (sections.length > 0) {
    score += 0.2;
  }
  factors++;

  // Entity extraction (0-0.15)
  if (entities.length > 0) {
    const avgEntityConf = entities.reduce((s, e) => s + e.confidence, 0) / entities.length;
    score += avgEntityConf * 0.15;
  }
  factors++;

  // Metadata classification (0-0.15) — always partial credit since we always try
  score += 0.1;
  factors++;

  return Math.round(Math.min(score, 1) * 100) / 100;
}

async function storeExtractedArtifacts(
  job: ExtractionJob,
  textContent: string,
  tables: ExtractedTableData[],
  metadata: DocumentMetadata,
  sections: DetectedSection[]
): Promise<StoredArtifact[]> {
  const artifacts: StoredArtifact[] = [];
  // Fail-closed: if any governed write fails, the extraction job should fail.
  // We do not return partial artifacts for regulated execution paths.
  // Store main document artifact
  const mainId = crypto.randomUUID();
  const mainContent = textContent.slice(0, 100000);
  const mainResolution = resolveGovernedContext({
    req: {
      body: {
        projectId: job.projectId,
        metadata: {
          sourceRefs: [`upload:${job.fileId}`],
          traceId: job.id,
        },
      },
      ...governedActor(job.userId, 'auto-extraction'),
      userRole: 'regulatory',
    } as any,
    projectId: job.projectId,
    artifactId: null,
    documentType: metadata.documentType.toLowerCase(),
    generationMode: 'imported',
    lifecycleStatus: 'draft',
    originSurface: 'import_pipeline',
    clientTrack: 'biotech',
    submissionProgram: 'general_ri',
    persona: 'regulatory',
    regulatorScope: 'fda',
    evidenceMode: 'mixed',
    documentClass: 'evidence_memo',
    readinessGate: 'internal_review',
    approvalPathType: 'single_reviewer',
    recommendationSource: 'report_engine',
    workspaceTarget: 'project',
    regulatorIntent: 'evidence_analysis',
    placementContainerId: String(job.projectId),
    title: job.fileName,
    content: mainContent,
    sourceRefs: [`upload:${job.fileId}`],
    provider: 'auto_extraction_pipeline',
    model: 'metadata_classifier',
    exportAllowed: false,
    eventType: 'artifact.created',
  });
  if (!mainResolution.validation.valid) {
    throw new Error(
      `governed extraction main artifact invalid: ${mainResolution.validation.errors.join('; ')}`
    );
  }

  const mainIns = await pool.query<{ id: number }>(
    `INSERT INTO concept2cure_artifacts (
      artifact_id, project_id, organization_id, type, category,
      title, content, content_hash, status, metadata, created_by_id, version, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, 1, NOW(), NOW()) RETURNING id`,
    [
      mainId,
      job.projectId,
      job.organizationId,
      metadata.documentType.toLowerCase(),
      'extracted',
      job.fileName,
      mainContent,
      /* Hash WHAT IS STORED, not what was extracted. This hashed the
         untruncated `textContent` while storing `mainContent` (capped at 100k),
         so every document over 100k chars was permanently reported tampered by
         verifyIntegrityChain — which recomputes over the stored column. A
         tamper alarm that fires on arithmetic trains people to ignore the
         alarm, which is worse than not having one. Truncation is recorded in
         the metadata below so the cap is visible rather than silent. */
      crypto.createHash('sha256').update(mainContent).digest('hex'),
      JSON.stringify({
        ...metadata,
        sourceFileId: job.fileId,
        extractionJobId: job.id,
        extractedAt: new Date().toISOString(),
        /* The stored content is capped; say so on the row rather than letting a
           reader assume they are looking at the whole document. */
        contentTruncated: textContent.length > mainContent.length,
        sourceCharCount: textContent.length,
        storedCharCount: mainContent.length,
        fileType: job.fileType,
        fileSize: job.fileSize,
        harness: {
          clientTrack: mainResolution.contract.clientTrack,
          submissionProgram: mainResolution.contract.submissionProgram,
          persona: mainResolution.contract.persona,
          regulatorScope: mainResolution.contract.regulatorScope,
          documentClass: mainResolution.contract.documentClass,
          readinessGate: mainResolution.contract.readinessGate,
          workspaceTarget: mainResolution.contract.workspaceTarget,
          originSurface: mainResolution.contract.originSurface,
          recommendationSource: mainResolution.contract.recommendationSource,
          regulatorIntent: mainResolution.contract.regulatorIntent,
          gateChecks: mainResolution.contract.exportEligibility.gateChecks,
          blockingReasons: mainResolution.contract.exportEligibility.blockingReasons,
          readinessOutcome: mainResolution.contract.exportEligibility.readinessOutcome,
        },
      }),
      job.userId,
    ]
  );
  // Uniform provenance: extracted-from-upload document is a 'source_input' event.
  try {
    await recordArtifactProvenance(pool, {
      artifactId: mainIns.rows[0].id,
      organizationId: job.organizationId,
      eventType: 'source_input',
      eventAction: 'auto_extract',
      actorId: job.userId,
      details: { extractionJobId: job.id, sourceFileId: job.fileId, documentType: metadata.documentType, kind: 'document' },
      backendService: 'autoExtractionPipeline',
    });
  } catch { /* extraction provenance is best-effort */ }
  artifacts.push({ artifactId: null, type: metadata.documentType, title: job.fileName });

  // Store extracted tables as separate artifacts
  for (const table of tables.slice(0, 20)) {
    const tableId = crypto.randomUUID();
    const tableContent = JSON.stringify({ headers: table.headers, rows: table.rows });
    const tableResolution = resolveGovernedContext({
      req: {
        body: {
          projectId: job.projectId,
          metadata: {
            sourceRefs: [`artifact:${mainId}`, `upload:${job.fileId}`],
            traceId: `${job.id}:table:${table.id}`,
          },
        },
        ...governedActor(job.userId, 'auto-extraction'),
        userRole: 'regulatory',
      } as any,
      projectId: job.projectId,
      artifactId: null,
      documentType: 'table',
      generationMode: 'imported',
      lifecycleStatus: 'draft',
      originSurface: 'import_pipeline',
      clientTrack: 'biotech',
      submissionProgram: 'general_ri',
      persona: 'regulatory',
      regulatorScope: 'fda',
      evidenceMode: 'mixed',
      documentClass: 'evidence_memo',
      readinessGate: 'internal_review',
      approvalPathType: 'single_reviewer',
      recommendationSource: 'report_engine',
      workspaceTarget: 'project',
      regulatorIntent: 'evidence_analysis',
      placementContainerId: String(job.projectId),
      title: table.title,
      content: tableContent,
      sourceRefs: [`artifact:${mainId}`, `upload:${job.fileId}`],
      provider: 'auto_extraction_pipeline',
      model: 'table_extractor',
      exportAllowed: false,
      eventType: 'artifact.created',
    });
    if (!tableResolution.validation.valid) {
      throw new Error(
        `governed extraction table artifact invalid: ${tableResolution.validation.errors.join('; ')}`
      );
    }

    const tableIns = await pool.query<{ id: number }>(
      `INSERT INTO concept2cure_artifacts (
        artifact_id, project_id, organization_id, type, category,
        title, content, content_hash, status, metadata, created_by_id, version, created_at, updated_at
      ) VALUES ($1, $2, $3, 'table', 'extracted', $4, $5, $6, 'draft', $7, $8, 1, NOW(), NOW()) RETURNING id`,
      [
        tableId,
        job.projectId,
        job.organizationId,
        table.title,
        tableContent,
        /* SHA-256 of the stored tableContent. This was `table.sourceHash` — an
           MD5 digest of a DIFFERENT object (the raw parsed table, not the
           {headers, rows} JSON persisted here) — sitting in a column the audit
           report recomputes as SHA-256 and labels as such. It could never
           match, so every extracted table read as tampered, twice over. */
        crypto.createHash('sha256').update(tableContent).digest('hex'),
        JSON.stringify({
          sourceDocumentId: mainId,
          sourceFileName: job.fileName,
          confidence: table.confidence,
          extractionJobId: job.id,
          harness: {
            clientTrack: tableResolution.contract.clientTrack,
            submissionProgram: tableResolution.contract.submissionProgram,
            persona: tableResolution.contract.persona,
            regulatorScope: tableResolution.contract.regulatorScope,
            documentClass: tableResolution.contract.documentClass,
            readinessGate: tableResolution.contract.readinessGate,
            workspaceTarget: tableResolution.contract.workspaceTarget,
            originSurface: tableResolution.contract.originSurface,
            recommendationSource: tableResolution.contract.recommendationSource,
            regulatorIntent: tableResolution.contract.regulatorIntent,
            gateChecks: tableResolution.contract.exportEligibility.gateChecks,
            blockingReasons: tableResolution.contract.exportEligibility.blockingReasons,
            readinessOutcome: tableResolution.contract.exportEligibility.readinessOutcome,
          },
        }),
        job.userId,
      ]
    );
    try {
      await recordArtifactProvenance(pool, {
        artifactId: tableIns.rows[0].id,
        organizationId: job.organizationId,
        eventType: 'source_input',
        eventAction: 'auto_extract',
        actorId: job.userId,
        details: { extractionJobId: job.id, sourceDocumentId: mainId, kind: 'table' },
        backendService: 'autoExtractionPipeline',
      });
    } catch { /* extraction provenance is best-effort */ }
    artifacts.push({ artifactId: null, type: 'table', title: table.title });
  }

  // Store detected sections
  for (const section of sections.slice(0, 30)) {
    if (section.content && section.content.length > 50) {
      const sectionId = crypto.randomUUID();
      const sectionTitle = `${section.code} — ${section.title}`;
      const sectionResolution = resolveGovernedContext({
        req: {
          body: {
            projectId: job.projectId,
            metadata: {
              sourceRefs: [`artifact:${mainId}`, `upload:${job.fileId}`],
              traceId: `${job.id}:section:${section.code}`,
            },
          },
          ...governedActor(job.userId, 'auto-extraction'),
          userRole: 'regulatory',
        } as any,
        projectId: job.projectId,
        artifactId: null,
        documentType: 'section',
        generationMode: 'imported',
        lifecycleStatus: 'draft',
        originSurface: 'import_pipeline',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'section_draft',
        readinessGate: 'internal_review',
        approvalPathType: 'regulated_dual_review',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'submission_authoring',
        placementContainerId: String(job.projectId),
        title: sectionTitle,
        content: section.content,
        ctdSection: section.code,
        sourceRefs: [`artifact:${mainId}`, `upload:${job.fileId}`],
        provider: 'auto_extraction_pipeline',
        model: 'section_classifier',
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!sectionResolution.validation.valid) {
        throw new Error(
          `governed extraction section artifact invalid: ${sectionResolution.validation.errors.join(
            '; '
          )}`
        );
      }

      const sectionIns = await pool.query<{ id: number }>(
        `INSERT INTO concept2cure_artifacts (
          artifact_id, project_id, organization_id, type, category,
          title, content, content_hash, status, metadata, created_by_id, ctd_section, version, created_at, updated_at
        ) VALUES ($1, $2, $3, 'section', 'extracted', $4, $5, $6, 'draft', $7, $8, $9, 1, NOW(), NOW()) RETURNING id`,
        [
          sectionId,
          job.projectId,
          job.organizationId,
          sectionTitle,
          section.content,
          crypto.createHash('sha256').update(section.content).digest('hex'),
          JSON.stringify({
            sectionCode: section.code,
            sourceDocumentId: mainId,
            sourceFileName: job.fileName,
            ctdSection: section.code,
            extractionJobId: job.id,
            harness: {
              clientTrack: sectionResolution.contract.clientTrack,
              submissionProgram: sectionResolution.contract.submissionProgram,
              persona: sectionResolution.contract.persona,
              regulatorScope: sectionResolution.contract.regulatorScope,
              documentClass: sectionResolution.contract.documentClass,
              readinessGate: sectionResolution.contract.readinessGate,
              workspaceTarget: sectionResolution.contract.workspaceTarget,
              originSurface: sectionResolution.contract.originSurface,
              recommendationSource: sectionResolution.contract.recommendationSource,
              regulatorIntent: sectionResolution.contract.regulatorIntent,
              gateChecks: sectionResolution.contract.exportEligibility.gateChecks,
              blockingReasons: sectionResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: sectionResolution.contract.exportEligibility.readinessOutcome,
            },
          }),
          job.userId,
          section.code,
        ]
      );
      try {
        await recordArtifactProvenance(pool, {
          artifactId: sectionIns.rows[0].id,
          organizationId: job.organizationId,
          eventType: 'source_input',
          eventAction: 'auto_extract',
          actorId: job.userId,
          details: { extractionJobId: job.id, sourceDocumentId: mainId, ctdSection: section.code, kind: 'section' },
          backendService: 'autoExtractionPipeline',
        });
      } catch { /* extraction provenance is best-effort */ }
      artifacts.push({
        artifactId: null,
        type: 'section',
        title: sectionTitle,
      });
    }
  }

  return artifacts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function detectFileType(fileName: string): SupportedFileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const supported: Record<string, SupportedFileType> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'doc',
    html: 'html',
    htm: 'html',
    xlsx: 'xlsx',
    xls: 'xls',
    csv: 'csv',
    txt: 'txt',
    xml: 'xml',
    rtf: 'rtf',
  };
  return supported[ext || ''] || null;
}

function calculatePriority(fileType: SupportedFileType, fileSize: number): number {
  // Higher priority for smaller, more important files
  let priority = 50;
  if (fileType === 'pdf' || fileType === 'docx') priority += 20;
  if (fileType === 'xlsx' || fileType === 'csv') priority += 10;
  if (fileSize < 1024 * 1024) priority += 10; // < 1MB
  if (fileSize > 50 * 1024 * 1024) priority -= 20; // > 50MB
  return Math.max(1, Math.min(100, priority));
}

function findEntityPositions(
  content: string,
  entityText: string
): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  const regex = new RegExp(entityText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push({ start: match.index, end: match.index + entityText.length });
    if (positions.length >= 10) break;
  }
  return positions;
}

function updateStage(
  job: ExtractionJob,
  stageName: string,
  status: ExtractionStage['status'],
  details?: string
): void {
  const stage = job.stages.find(s => s.name === stageName);
  if (stage) {
    stage.status = status;
    if (status === 'running') stage.startedAt = new Date().toISOString();
    if (status === 'completed' || status === 'failed') stage.completedAt = new Date().toISOString();
    if (details) stage.details = details;
  }
}

async function storeJob(job: ExtractionJob): Promise<void> {
  // Chained via auditService — the previous raw INSERT named columns audit_logs
  // does not have (organization_id / entity_type / entity_id / details), so it
  // raised 42703 into a bare catch and recorded nothing.
  await auditService.logAction({
    organizationId: job.organizationId,
    userId: job.userId,
    action: 'extraction_job_created',
    resourceType: 'file',
    resourceId: job.fileId,
    details: {
      jobId: job.id,
      fileName: job.fileName,
      fileType: job.fileType,
      fileSize: job.fileSize,
      priority: job.priority,
    },
  });
}

async function updateJobInDB(job: ExtractionJob): Promise<void> {
  // Chained via auditService (see storeJob above for why the raw INSERT could
  // never have written a row).
  await auditService.logAction({
    organizationId: job.organizationId,
    userId: job.userId,
    action: job.status === 'completed' ? 'extraction_job_completed' : 'extraction_job_failed',
    resourceType: 'file',
    resourceId: job.fileId,
    details: {
      jobId: job.id,
      fileName: job.fileName,
      status: job.status,
      durationMs: job.durationMs,
      qualityScore: job.result?.qualityScore,
      tablesExtracted: job.result?.tables.length || 0,
      sectionsDetected: job.result?.sections.length || 0,
      entitiesFound: job.result?.entities.length || 0,
      artifactsStored: job.result?.artifacts.length || 0,
      error: job.error,
    },
  });
}

async function logExtractionAudit(job: ExtractionJob): Promise<void> {
  // Already handled in updateJobInDB
}
