import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adaptSource } from '../evidence-spine.service';
import { PGlite } from '@electric-sql/pglite';
import { SOURCE_TEXT_AVAILABLE_SQL } from '../data-room-search';
import { sourceProcessingSummary } from '../data-room-processing-read';
import { sourceHasGroundingText, sourceReadView } from '../../../../shared/data-room-processing-status';

const identity = { organizationId: 7, sourceId: 9, sha256: 'a'.repeat(64), uploadSha256: 'a'.repeat(64),
  fileUploadId: 'recorded-upload', storageRef: '/private/source.bin', uploadStoragePath: '/private/source.bin',
  programId: null, workspaceId: null, sizeBytes: 24, fileName: 'Assay report', uploadFileName: 'Assay report',
  sourceTitle: 'Assay report', mimeType: 'text/plain', sourceMimeType: 'text/plain', lineage: {} };
const stage = (over: Record<string, unknown> = {}) => ({ version: 1, stage: 'derived_capture', processorRevision: 'data-room-processing:v1',
  identity, state: 'running', attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', attempts: 1,
  claimedAt: '2026-10-14T04:00:00.000Z', leaseExpiresAt: '2026-10-14T04:15:00.000Z',
  nextRetryAt: null, completedAt: null, retryable: false, reasonCode: null, ...over });

describe('actual persisted source text availability', () => {
  it.each([null, '', ' \t\r\n', '\u00a0\u2000\ufeff'])('refuses availability from an extracted label with blank persisted text (%j)', extracted_text => {
    const source = adaptSource({ id: 1, extraction_status: 'extracted', extracted_text, char_count: 900, provenance: { extractionWords: 80 } });
    expect(source.textAvailable).toBe(false);
  });

  it('recognizes nonblank loaded text independently of a missing legacy processing record', () => {
    expect(adaptSource({ id: 1, extracted_text: 'Assay A used adult plasma.' }).textAvailable).toBe(true);
  });

  it('does not fabricate availability when the legacy read did not load text', () => {
    expect(adaptSource({ id: 1, extraction_status: 'extracted', char_count: 500 }).textAvailable).toBeNull();
  });

  it('uses the explicit persisted-text projection rather than extraction words', () => {
    expect(adaptSource({ id: 1, text_available: false, extraction_status: 'extracted', provenance: { extractionWords: 80 } }).textAvailable).toBe(false);
  });
});

describe('lean SQL agrees with the actual core nonblank text rule', () => {
  let pg: PGlite;
  beforeAll(() => { pg = new PGlite(); });
  afterAll(async () => { await pg.close(); });
  it.each([null, '', ' \t\n\r\v\f', '\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff', '  Plasma specimen  ', '\u200b'])('evaluates the actual SELECT flag correctly for %j', async value => {
    const result = await pg.query<{ available: boolean }>(`SELECT ${SOURCE_TEXT_AVAILABLE_SQL} AS available FROM (SELECT $1::text AS extracted_text) s`, [value]);
    expect(result.rows[0].available).toBe(typeof value === 'string' && value.trim().length > 0);
  });

  it('uses actual database clock output for expired-claim presentation', async () => {
    const first = await pg.query<{ observed_at: Date }>('SELECT clock_timestamp() AS observed_at');
    const now = new Date(first.rows[0].observed_at);
    const metadata = { dataRoomProcessing: stage({ claimedAt: new Date(now.getTime() - 901_000).toISOString(), leaseExpiresAt: new Date(now.getTime() - 1_000).toISOString() }) };
    const result = await pg.query<{ text_available: boolean; processing_observed_at: Date }>(`SELECT ${SOURCE_TEXT_AVAILABLE_SQL} AS text_available, clock_timestamp() AS processing_observed_at FROM (SELECT NULL::text AS extracted_text) s`);
    const source = adaptSource({ ...result.rows[0], metadata });
    expect(source.processing?.leaseExpired).toBe(true);
    expect(sourceReadView(source).label).toBe('Processing needs retry');
  });
});

describe('sanitized processing state and safe grounding', () => {
  it('observes an expired claim using the SELECT database time without browser time', () => {
    const source = adaptSource({ id: 9, extracted_text: null, metadata: { dataRoomProcessing: stage() },
      processing_observed_at: new Date('2026-10-14T04:15:00.001Z') });
    expect(source.processing).toMatchObject({ state: 'running', leaseExpired: true });
    expect(sourceReadView(source).label).toBe('Processing needs retry');
    expect(JSON.stringify(source.processing)).not.toMatch(/private|storageRef|attemptId|identity/);
  });

  it('does not invent expiry when the database observation time was not loaded', () => {
    const processing = sourceProcessingSummary({ dataRoomProcessing: stage() });
    expect(processing?.leaseExpired).toBeNull();
    expect(sourceReadView({ textAvailable: false, processing }).label).toBe('Processing claimed');
  });

  it.each([
    stage({ version: 2 }), stage({ state: 'future_state' }), stage({ attemptId: 'not-an-attempt' }),
    stage({ identity: {} }), stage({ leaseExpiresAt: '2026-02-31T04:15:00.000Z' }),
    stage({ reasonCode: '/private/provider-error.bin' }),
  ])('does not promote malformed or future private stage metadata into completion', value => {
    expect(sourceProcessingSummary({ dataRoomProcessing: value })).toMatchObject({ state: 'unknown', retryable: false, reasonCode: 'STAGE_METADATA_INVALID' });
  });

  it('keeps readable retained data available without original-byte availability', () => {
    const source = { textAvailable: true, isCurrent: true, dataEligible: true, originalFileAvailable: false, disposition: 'keep_data' as const };
    expect(sourceHasGroundingText(source)).toBe(true);
    expect(sourceReadView(source).detail).toContain('original file is unavailable');
  });

  it('does not let a failed/stale attempt label erase authoritative persisted text', () => {
    const source = { textAvailable: true, isCurrent: true, dataEligible: true,
      processing: { state: 'failed' as const, retryable: false, reasonCode: 'ATTEMPT_STALE' as const, leaseExpiresAt: null, nextRetryAt: null } };
    expect(sourceHasGroundingText(source)).toBe(true);
    expect(sourceReadView(source).label).toBe('Read');
  });
});
