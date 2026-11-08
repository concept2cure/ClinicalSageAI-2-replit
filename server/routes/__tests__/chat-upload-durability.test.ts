/**
 * Canonical chat/Projects intake must store original bytes before it records
 * an upload or claims a Data Room capture. Exercise the REAL multipart router
 * and upload-safety middleware, with controlled scanner, filesystem, database
 * and downstream service fixtures. No test uploads touch disk or a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const m = vi.hoisted(() => ({
  events: [] as string[],
  poolQuery: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  storePut: vi.fn(),
  storeDelete: vi.fn(),
  scanBuffer: vi.fn(),
  extractDocumentText: vi.fn(),
  resolveGovernedContext: vi.fn(),
  recordArtifactProvenance: vi.fn(),
  findSourceByChecksum: vi.fn(),
  findSupersededCandidate: vi.fn(),
  captureClientSource: vi.fn(),
  createSupersedingSource: vi.fn(),
  writeUploadRetrievalAtom: vi.fn(),
  resolveVaultView: vi.fn(),
  resolveOrgVaultView: vi.fn(),
  classifyForFiling: vi.fn(),
  processCapturedSource: vi.fn(),
}));

vi.mock('../../db.js', () => {
  const pool = { query: (...args: unknown[]) => m.poolQuery(...args) };
  return { pool, getPool: () => pool };
});
vi.mock('../../db.ts', () => {
  const pool = { query: (...args: unknown[]) => m.poolQuery(...args) };
  return { pool, getPool: () => pool };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: (...args: unknown[]) => m.mkdir(...args),
      writeFile: (...args: unknown[]) => m.writeFile(...args),
    },
  };
});
// The byte store (LX-02): an organization's upload goes there before the task's
// working copy on disk, so it is mocked here the way the disk is.
vi.mock('../../services/storage/index.js', () => {
  const provider = {
    name: 's3',
    put: (...args: unknown[]) => m.storePut(...args),
    delete: (...args: unknown[]) => m.storeDelete(...args),
  };
  return { getStorageProvider: () => provider, getStorageProviderFor: () => provider };
});
vi.mock('../../utils/virusScan', () => ({ scanBuffer: (...args: unknown[]) => m.scanBuffer(...args) }));
vi.mock('../../services/ocr/index.js', () => ({ extractDocumentText: m.extractDocumentText }));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: m.resolveGovernedContext,
}));
vi.mock('../../services/provenance/artifact-provenance', () => ({
  recordArtifactProvenance: m.recordArtifactProvenance,
}));
vi.mock('../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  findSourceByChecksum: m.findSourceByChecksum,
  findSupersededCandidate: m.findSupersededCandidate,
  captureClientSource: m.captureClientSource,
  createSupersedingSource: m.createSupersedingSource,
}));
vi.mock('../../services/chat-uploads/upload-retrieval-atom.js', () => ({
  writeUploadRetrievalAtom: m.writeUploadRetrievalAtom,
}));
vi.mock('../../services/vault/vault-filing.service.js', () => ({
  resolveVaultView: m.resolveVaultView,
  resolveOrgVaultView: m.resolveOrgVaultView,
  classifyForFiling: m.classifyForFiling,
}));
vi.mock('../../services/clinical-regulatory-evidence/data-room-processing.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/clinical-regulatory-evidence/data-room-processing.js')>();
  return { ...actual, processCapturedSource: m.processCapturedSource };
});

// Unrelated handlers imported by the real chat router are outside this path.
vi.mock('../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: vi.fn(), getThreadMessages: vi.fn(), saveChatMessage: vi.fn(),
}));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: vi.fn(() => ({})) }));
vi.mock('../../services/lumen-context-builder.js', () => ({ getIntelligencePrefix: vi.fn() }));
vi.mock('../../services/ana-guidance-executor.js', () => ({ processResponseActions: vi.fn() }));
vi.mock('../../services/kernel-decision-record.js', () => ({ logKernelDecision: vi.fn() }));
vi.mock('../../services/kernel-router.js', () => ({ planKernelExecution: vi.fn() }));
vi.mock('../../services/kernel-adaptive-policy.js', () => ({ getKernelPolicyHint: vi.fn(), recordKernelPolicyOutcome: vi.fn() }));
vi.mock('../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: vi.fn() }));
vi.mock('../../services/claude/ClaudeToolDefinitions.js', () => ({ ALL_CLAUDE_TOOLS: [] }));
vi.mock('../../services/claude/ClaudeToolExecutor.js', () => ({ executeAgenticLoop: vi.fn() }));
vi.mock('../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: vi.fn() }));

import chatRouter from '../chat';

const PROGRAM_ID = '11111111-1111-1111-1111-111111111111';
const ORIGINAL = Buffer.from('An original protocol source for study S1.');
const CHECKSUM = createHash('sha256').update(ORIGINAL).digest('hex');
const SCOPES = [
  { label: 'UUID project', projectId: PROGRAM_ID },
  { label: 'numeric workspace', projectId: 'proj_12' },
  { label: 'conversation without a project', projectId: undefined },
];

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { id: 9 };
    (req as express.Request & { tenantId?: number }).tenantId = 5;
    next();
  });
  instance.use('/api/chat', chatRouter);
  return instance;
}

function upload(projectId?: string) {
  const req = request(app()).post('/api/chat/upload');
  if (projectId) req.field('projectId', projectId);
  return req.attach('file', ORIGINAL, { filename: 'protocol.txt', contentType: 'text/plain' });
}

function expectNoConsequences() {
  const queries = m.poolQuery.mock.calls.map(([sql]) => String(sql));
  expect(queries.every(sql => /^\s*SELECT\b/i.test(sql))).toBe(true);
  for (const entrypoint of [
    m.extractDocumentText, m.resolveGovernedContext, m.recordArtifactProvenance,
    m.findSourceByChecksum, m.findSupersededCandidate, m.captureClientSource,
    m.createSupersedingSource, m.writeUploadRetrievalAtom, m.classifyForFiling, m.processCapturedSource,
  ]) expect(entrypoint).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  m.events.length = 0;
  m.scanBuffer.mockImplementation(async () => {
    m.events.push('scan');
    return { scanned: true, clean: true };
  });
  m.poolQuery.mockImplementation(async (sql: string) => {
    m.events.push(/^\s*SELECT\b/i.test(sql) ? 'ownership-read' : 'database-write');
    return { rows: [{ present: 1, id: 77 }] };
  });
  m.storePut.mockImplementation(async (opts: { bytes: Buffer }) => {
    m.events.push('store-object');
    return { vaultFileId: 'f-1', vaultVersionId: 'obj-1', provider: 's3',
      sizeBytes: opts.bytes.length, sha256: createHash('sha256').update(opts.bytes).digest('hex') };
  });
  m.storeDelete.mockResolvedValue(true);
  m.mkdir.mockImplementation(async () => { m.events.push('mkdir'); });
  m.writeFile.mockImplementation(async () => { m.events.push('write-file'); });
  m.extractDocumentText.mockImplementation(async (buffer: Buffer) => {
    m.events.push('extract');
    return { text: buffer.toString('utf8'), method: 'utf8' };
  });
  m.findSourceByChecksum.mockResolvedValue(null);
  m.findSupersededCandidate.mockResolvedValue(null);
  m.captureClientSource.mockResolvedValue({ source: { id: 41 }, reused: false, supersededId: null });
  m.createSupersedingSource.mockResolvedValue({ source: { id: 41 } });
  m.resolveVaultView.mockResolvedValue('ctd');
  m.resolveOrgVaultView.mockResolvedValue('ctd');
  m.classifyForFiling.mockReturnValue({ needsReview: true });
  m.processCapturedSource.mockImplementation(async () => {
    m.events.push('process-capture');
    return { ok: true, processed: true, status: 'completed' };
  });
  m.writeUploadRetrievalAtom.mockResolvedValue({
    atomId: 81, extractedChars: ORIGINAL.length, embeddedChars: ORIGINAL.length,
    truncated: false, embedded: true,
  });
  m.resolveGovernedContext.mockReturnValue({
    validation: { valid: true, errors: [], warnings: [] }, resolved: {},
    contract: { exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'ok' } },
  });
});

describe('original-byte storage is required before canonical upload consequences', () => {
  describe.each(SCOPES)('$label', ({ projectId }) => {
    it.each(['mkdir', 'writeFile'] as const)('refuses %s failure before metadata, extraction, capture, audit or retrieval', async operation => {
      m[operation].mockRejectedValueOnce(new Error(`ENOSPC private-storage:/private/original ${CHECKSUM}`));
      const res = await upload(projectId);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: 'The file could not be stored. Try again.', code: 'UPLOAD_STORAGE_FAILED',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/ENOSPC|private-storage|\/private\/|uploads\/|[a-f0-9]{64}/);
      expect(m.scanBuffer).toHaveBeenCalledWith(ORIGINAL);
      expect(m.mkdir).toHaveBeenCalledTimes(1);
      expect(m.writeFile).toHaveBeenCalledTimes(operation === 'mkdir' ? 0 : 1);
      // The durable copy was taken first; with no record to name it, it is removed.
      expect(m.storeDelete).toHaveBeenCalledWith('obj-1', 5);
      expectNoConsequences();
    });

    it('refuses when the byte store cannot take the bytes, before the disk, metadata or capture', async () => {
      m.storePut.mockRejectedValueOnce(new Error(`AccessDenied s3://private-bucket/${CHECKSUM}`));
      const res = await upload(projectId);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: 'The file could not be stored. Try again.', code: 'UPLOAD_STORAGE_FAILED',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/AccessDenied|private-bucket|s3:|[a-f0-9]{64}/);
      expect(m.mkdir).not.toHaveBeenCalled();
      expect(m.writeFile).not.toHaveBeenCalled();
      expect(m.storeDelete).not.toHaveBeenCalled();
      expectNoConsequences();
    });

    it('refuses when the byte store records other bytes than it was given', async () => {
      m.storePut.mockImplementationOnce(async (opts: { bytes: Buffer }) => ({
        vaultFileId: 'f-1', vaultVersionId: 'obj-1', provider: 's3', sizeBytes: opts.bytes.length, sha256: '0'.repeat(64),
      }));
      const res = await upload(projectId);

      expect(res.status).toBe(503);
      expect(m.writeFile).not.toHaveBeenCalled();
      expectNoConsequences();
    });
  });

  it('preserves UUID-project capture with the original digest and bytes, only after storage', async () => {
    const res = await upload(PROGRAM_ID);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sourceId: 41, dataRoom: { recorded: true }, extractionMethod: 'utf8' });
    expect(m.events).toEqual(['scan', 'ownership-read', 'store-object', 'mkdir', 'write-file', 'database-write', 'extract', 'process-capture']);
    // The durable copy: this organization's, named by the server's file id, the exact bytes.
    expect(m.storePut).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 5, projectId: 'uploads', filename: res.body.fileId, bytes: ORIGINAL, mime: 'text/plain',
    }));
    expect(m.writeFile).toHaveBeenCalledWith(path.resolve(process.cwd(), `uploads/org-5/${res.body.fileId}`), ORIGINAL);
    // The record names where the durable copy is; storage_path stays the tenancy key.
    expect(m.poolQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO file_uploads'), [
      res.body.fileId, 9, 5, 'protocol.txt', 'text/plain', ORIGINAL.length,
      `uploads/org-5/${res.body.fileId}`, CHECKSUM, 's3', 'obj-1',
    ]);
    expect(m.storeDelete).not.toHaveBeenCalled();
    expect(m.captureClientSource).toHaveBeenCalledWith(5, expect.objectContaining({
      clientProgramId: PROGRAM_ID, checksum: CHECKSUM, ingestionStatus: 'ingested',
      extractionStatus: 'pending', storedArtifactRef: `uploads/org-5/${res.body.fileId}`,
    }), { text: ORIGINAL.toString('utf8') });
    expect(m.writeUploadRetrievalAtom).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceId: 'cre_source:41', text: ORIGINAL.toString('utf8'), tags: ['source', 'chat_upload', `program:${PROGRAM_ID}`],
    }));
  });

  it('preserves conversation upload without claiming a project source', async () => {
    const res = await upload();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sourceId: null, dataRoom: { recorded: false }, extractionMethod: 'utf8' });
    expect(m.events).toEqual(['scan', 'store-object', 'mkdir', 'write-file', 'database-write', 'extract']);
    expect(m.captureClientSource).not.toHaveBeenCalled();
    expect(m.writeUploadRetrievalAtom).not.toHaveBeenCalled();
  });

  it('still refuses flagged bytes before storage or any downstream consequence', async () => {
    m.scanBuffer.mockResolvedValue({ scanned: true, clean: false, signature: 'private-scanner-signature' });
    const res = await upload(PROGRAM_ID);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_SCAN_REJECTED');
    expect(m.mkdir).not.toHaveBeenCalled();
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.storePut).not.toHaveBeenCalled();
    expectNoConsequences();
  });

  it('still checks project ownership before storing original bytes', async () => {
    m.poolQuery.mockResolvedValue({ rows: [] });
    const res = await upload(PROGRAM_ID);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    expect(m.storePut).not.toHaveBeenCalled();
    expect(m.mkdir).not.toHaveBeenCalled();
    expect(m.writeFile).not.toHaveBeenCalled();
    expectNoConsequences();
  });
});

describe('one record per uploaded file (document store consolidation step 3)', () => {
  /* Consolidation step 3 (2026-10-17). A numeric-workspace upload used to write
     a second record of the same file: a concept2cure_artifacts 'source_document'
     row holding its extracted text, beside the data-room source. The data-room
     source is the one capture record (VR-11a files it to the Vault). */
  function expectNoArtifactCopy() {
    const sql = m.poolQuery.mock.calls.map(([q]) => String(q));
    expect(sql.filter(q => /concept2cure_artifacts/i.test(q)), 'the upload wrote a concept2cure_artifacts copy').toEqual([]);
    expect(m.resolveGovernedContext).not.toHaveBeenCalled();
    expect(m.recordArtifactProvenance).not.toHaveBeenCalled();
  }

  it('a numeric-workspace upload writes one data-room source, in its program, and no concept2cure_artifacts row', async () => {
    m.poolQuery.mockImplementation(async (sql: string) => {
      m.events.push(/^\s*SELECT\b/i.test(sql) ? 'ownership-read' : 'database-write');
      return /regulatory_program_id/.test(sql)
        ? { rows: [{ program_id: PROGRAM_ID, anchor_count: 1 }] }
        : { rows: [{ present: 1, id: 77 }] };
    });
    const res = await upload('proj_12');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sourceId: 41, dataRoom: { recorded: true } });
    expect(res.body).not.toHaveProperty('artifactId');
    expectNoArtifactCopy();
    expect(m.captureClientSource).toHaveBeenCalledOnce();
    const params = m.captureClientSource.mock.calls[0][1];
    expect(params, 'the source is not the same record a UUID upload into that program writes')
      .toMatchObject({ clientProgramId: PROGRAM_ID, clientWorkspaceId: null, checksum: CHECKSUM });
    expect(params.metadata).not.toHaveProperty('artifactId');
    expect(m.captureClientSource).toHaveBeenCalledWith(5, expect.objectContaining({
      checksum: CHECKSUM, clientProgramId: PROGRAM_ID, clientWorkspaceId: null,
    }), { text: ORIGINAL.toString('utf8') });
    expect(m.writeUploadRetrievalAtom).toHaveBeenCalledOnce();
    expect(m.writeUploadRetrievalAtom).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceId: 'cre_source:41', tags: ['source', 'chat_upload', `program:${PROGRAM_ID}`],
    }));
    expect(m.events.indexOf('write-file')).toBeLessThan(m.events.indexOf('database-write'));
  });

  it('a numeric project with no single live program keeps its workspace scope and still writes no artifact copy', async () => {
    const res = await upload('proj_12');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sourceId: 41, dataRoom: { recorded: true } });
    expectNoArtifactCopy();
    expect(m.captureClientSource.mock.calls[0][1]).toMatchObject({ clientProgramId: null, clientWorkspaceId: 12 });
    expect(m.writeUploadRetrievalAtom).toHaveBeenCalledOnce();
    expect(m.writeUploadRetrievalAtom).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceId: 'cre_source:41', tags: ['source', 'chat_upload'],
    }));
  });
});

describe('capture processing is separate from upload availability', () => {
  it.each(['completed', 'already_complete'] as const)('reports persisted readable processing for %s', async status => {
    m.processCapturedSource.mockResolvedValue({ ok: true, processed: true, status,
      extracted: { text: 'private persisted text', error: '/private/extractor' } });
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sourceId: 41, dataRoom: {
      recorded: true, readable: true, processing: { ok: true, processed: true, status },
    } });
    expect(m.processCapturedSource).toHaveBeenCalledWith(5, 41, expect.objectContaining({
      bytes: ORIGINAL, fileName: 'protocol.txt', mimeType: 'text/plain', programId: PROGRAM_ID,
      expectedWorkspaceId: null, preExtracted: expect.objectContaining({ text: ORIGINAL.toString('utf8') }),
    }));
    expect(JSON.stringify(res.body)).not.toMatch(/private persisted|\/private\/extractor/);
  });

  it.each(['extraction_failed', 'retryable_failure', 'blocked', 'stale_source', 'busy', 'retry_not_due', 'retry_exhausted'] as const)(
    'keeps stored capture available without readable claim for %s', async status => {
      m.processCapturedSource.mockResolvedValue({ ok: false, processed: false, status, reasonCode: 'SAFE_REASON' });
      const res = await upload(PROGRAM_ID);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ready', sourceId: 41, dataRoom: {
        recorded: true, readable: false, processing: { ok: false, processed: false, status, reasonCode: 'SAFE_REASON' },
      } });
      expect(m.captureClientSource).toHaveBeenCalledOnce();
      expect(m.captureClientSource.mock.calls[0][1].extractionStatus).toBe('pending');
    });

  it('does not deny a committed capture when processing unexpectedly rejects', async () => {
    m.processCapturedSource.mockRejectedValue(new Error('private processing storage /private/original'));
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sourceId: 41, dataRoom: { recorded: true, readable: false,
      processing: { ok: false, processed: false, status: 'retryable_failure', reasonCode: 'PROCESSING_UNAVAILABLE' } } });
    expect(JSON.stringify(res.body)).not.toContain('/private/');
  });

  it.each([
    { projectId: PROGRAM_ID, programId: PROGRAM_ID, workspaceId: null },
    { projectId: 'proj_12', programId: null, workspaceId: 12 },
  ])('retries a duplicate canonical source within its original scope ($projectId)', async scope => {
    m.captureClientSource.mockResolvedValue({ source: { id: 16, provenance: { fileUploadId: 'file_original' }, isCurrent: true },
      reused: true, supersededId: null });
    m.processCapturedSource.mockResolvedValue({ ok: true, processed: true, status: 'completed' });
    const res = await upload(scope.projectId);
    expect(res.status).toBe(200);
    expect(res.body.sourceId).toBe(16);
    expect(m.captureClientSource).toHaveBeenCalledOnce();
    expect(m.createSupersedingSource).not.toHaveBeenCalled();
    expect(m.processCapturedSource).toHaveBeenCalledWith(5, 16, expect.objectContaining({
      bytes: ORIGINAL, programId: scope.programId, expectedWorkspaceId: scope.workspaceId,
    }));
    const input = m.processCapturedSource.mock.calls[0][2];
    expect(input).not.toHaveProperty('fileUploadId');
    expect(input).not.toHaveProperty('storagePath');
  });

  it('refuses a historical duplicate without processing or rebinding it', async () => {
    m.captureClientSource.mockRejectedValue({ name: 'SourceCaptureError', status: 409,
      code: 'SOURCE_CAPTURE_RETIRED', sourceId: 16, message: 'Read the retained capture or use the current source.' });
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ sourceId: 16, code: 'SOURCE_CAPTURE_RETIRED' });
    expect(res.body).not.toHaveProperty('status');
    expect(m.processCapturedSource).not.toHaveBeenCalled();
    expect(m.writeUploadRetrievalAtom).not.toHaveBeenCalled();
    expect(m.createSupersedingSource).not.toHaveBeenCalled();
  });

  it('preserves an unconfirmed commit result without claiming a failed or completed capture', async () => {
    m.captureClientSource.mockRejectedValue({ name: 'SourceCaptureError', status: 503,
      code: 'SOURCE_CAPTURE_COMMIT_UNCONFIRMED', sourceId: 17, message: 'Check the project’s Data Room before trying again.' });
    const res = await upload(PROGRAM_ID);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ sourceId: 17, code: 'SOURCE_CAPTURE_COMMIT_UNCONFIRMED' });
    expect(res.body).not.toHaveProperty('status');
    expect(m.processCapturedSource).not.toHaveBeenCalled();
  });
});
