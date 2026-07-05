/**
 * AnA Document Studio durable version store — pure-logic unit tests.
 *
 * Covers the title-slug normalization (the per-thread lookup key) and the
 * SHA-256 content hashing used for version de-duplication. The DB-backed
 * upsert/list paths require a live Postgres connection with RLS; following the
 * existing __tests__ style, those are exercised only when explicit input is
 * present and otherwise short-circuit rather than requiring a database.
 */
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  normalizeTitleSlug,
  resolveChangeDescription,
  upsertDocumentArtifactVersion,
  listDocumentArtifactVersions,
} from '../artifactVersionStore';

describe('normalizeTitleSlug', () => {
  it('groups titles that differ only in case and surrounding whitespace', () => {
    expect(normalizeTitleSlug('IND Cover Letter')).toBe('ind cover letter');
    expect(normalizeTitleSlug('ind cover letter ')).toBe('ind cover letter');
    expect(normalizeTitleSlug('IND Cover Letter')).toBe(
      normalizeTitleSlug('ind cover letter '),
    );
  });

  it('collapses internal runs of whitespace (tabs, newlines) to single spaces', () => {
    expect(normalizeTitleSlug('IND   Cover\tLetter')).toBe('ind cover letter');
    expect(normalizeTitleSlug('  Module\n2.5  Clinical   Overview ')).toBe(
      'module 2.5 clinical overview',
    );
  });

  it('is idempotent', () => {
    const once = normalizeTitleSlug('  Protocol  Synopsis  ');
    expect(normalizeTitleSlug(once)).toBe(once);
  });

  it('distinguishes genuinely different titles', () => {
    expect(normalizeTitleSlug('IND Cover Letter')).not.toBe(
      normalizeTitleSlug('IND Cover Note'),
    );
  });
});

describe('resolveChangeDescription (E6b reason-on-save)', () => {
  it('uses the operator reason when a non-blank one is supplied', () => {
    expect(resolveChangeDescription('Corrected the sensitivity value', 'boilerplate')).toBe(
      'Corrected the sensitivity value',
    );
    expect(resolveChangeDescription('  trimmed reason  ', 'boilerplate')).toBe('trimmed reason');
  });

  it('falls back to the boilerplate when reason is absent/blank (backward-compatible)', () => {
    expect(resolveChangeDescription(undefined, 'Initial AnA Document Studio draft')).toBe(
      'Initial AnA Document Studio draft',
    );
    expect(resolveChangeDescription(null, 'rev v2')).toBe('rev v2');
    expect(resolveChangeDescription('   ', 'rev v2')).toBe('rev v2');
  });
});

describe('content-hash de-dup contract', () => {
  // The store de-dupes versions on a SHA-256 of the content (same algorithm as
  // server/services/compute/artifactWriteback.ts). Identical content must hash
  // identically; any change must produce a different hash.
  const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

  it('produces a stable, 64-hex-char SHA-256 for given content', () => {
    const content = '# IND Cover Letter\n\nDear Reviewer, ...';
    const h = sha256(content);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(content)).toBe(h);
  });

  it('changes the hash when the content changes by a single character', () => {
    expect(sha256('draft v1')).not.toBe(sha256('draft v2'));
  });
});

describe('DB-backed paths (short-circuit without a live database)', () => {
  // Mirrors the existing __tests__ style: only attempt the live-DB round trip
  // when an explicit opt-in env var is provided; otherwise assert the functions
  // are wired up and skip the I/O so the suite never requires Postgres.
  const liveOrg = process.env.ANA_VERSION_STORE_TEST_ORG_ID;
  const liveProject = process.env.ANA_VERSION_STORE_TEST_PROJECT_ID;

  it('exposes the upsert and list functions', () => {
    expect(typeof upsertDocumentArtifactVersion).toBe('function');
    expect(typeof listDocumentArtifactVersions).toBe('function');
  });

  it.skipIf(!liveOrg || !liveProject)(
    'persists and lists a draft version end-to-end',
    async () => {
      const organizationId = Number(liveOrg);
      const projectId = Number(liveProject);
      const anaThreadId = `test_thread_${Date.now()}`;
      const title = 'IND Cover Letter';

      const first = await upsertDocumentArtifactVersion({
        organizationId,
        projectId,
        anaThreadId,
        title,
        content: 'v1 body',
      });
      expect(first.created).toBe(true);
      expect(first.version).toBe(1);

      // Identical content de-dupes to a no-op.
      const dup = await upsertDocumentArtifactVersion({
        organizationId,
        projectId,
        anaThreadId,
        title: 'ind cover letter ', // case/whitespace variant resolves to same row
        content: 'v1 body',
      });
      expect(dup.created).toBe(false);
      expect(dup.version).toBe(1);

      const second = await upsertDocumentArtifactVersion({
        organizationId,
        projectId,
        anaThreadId,
        title,
        content: 'v2 body',
      });
      expect(second.created).toBe(true);
      expect(second.version).toBe(2);
      expect(second.artifactId).toBe(first.artifactId);

      const versions = await listDocumentArtifactVersions({
        artifactExternalId: first.artifactId,
        organizationId,
      });
      expect(versions.map(v => v.version)).toEqual([1, 2]);
      expect(versions[0].content).toBe('v1 body');
      expect(versions[1].content).toBe('v2 body');

      // Org isolation: a mismatched org sees nothing.
      const wrongOrg = await listDocumentArtifactVersions({
        artifactExternalId: first.artifactId,
        organizationId: organizationId + 999999,
      });
      expect(wrongOrg).toEqual([]);
    },
  );
});
