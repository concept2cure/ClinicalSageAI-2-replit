/**
 * Extraction must fail rather than invent, and must hash what it stores.
 *
 * WHAT WAS WRONG. `extractText` fabricated its own output. With no matching
 * artifact row it returned the literal string
 * `[Extracted content from <name> - <type> format - <n> bytes]`; a bare catch
 * returned `[Pending extraction from <name>]`. The caller hashed whichever
 * string came back and stored it as a governed `category:'extracted'`
 * artifact — invented text, sealed, and presented as extracted evidence. The
 * catch fired reliably, because the lookup beneath the artifact query read a
 * table named `uploads` that no migration in this repository creates.
 *
 * It was latent, not live: the pipeline's only HTTP entry point invoked a
 * positional function with a single object and returned 500 unconditionally.
 * That is why the route repair and this fix land together — repairing the route
 * alone would have switched on a pipeline that writes fabricated evidence.
 *
 * ALSO LOCKED: the two content hashes that could never verify. One hashed the
 * untruncated source while storing a 100k-capped copy, so every long document
 * read as tampered. The other stored an MD5 of a different object in a column
 * the audit report recomputes as SHA-256. A tamper alarm that fires on
 * arithmetic trains people to ignore the alarm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { ExtractionSourceUnavailableError } from '../autoExtractionPipeline';

beforeEach(() => query.mockReset());

describe('extraction refuses to fabricate', () => {
  it('exports a typed error for an unreadable source', () => {
    // The refusal is a named type, not a string returned as if it were content.
    const err = new ExtractionSourceUnavailableError('artifact_1', 'protocol.pdf');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ExtractionSourceUnavailableError');
    expect(err.message).toContain('artifact_1');
    expect(err.message).toContain('protocol.pdf');
  });

  it('SOURCE: no placeholder string survives anywhere in the pipeline', async () => {
    // The regression guard. Both fabricated strings are gone from the module,
    // so neither can be reintroduced by a partial revert unnoticed.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'autoExtractionPipeline.ts'),
      'utf8',
    );
    // Only the historical note may mention them; no template literal may build
    // one. Assert the executable forms are absent.
    expect(src).not.toContain('return `[Extracted content from');
    expect(src).not.toContain('return `[Pending extraction from');
  });

  it('SOURCE: the nonexistent `uploads` table is no longer queried', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'autoExtractionPipeline.ts'),
      'utf8',
    );
    // A query that can only ever raise 42P01 is not a fallback; it was the
    // mechanism that guaranteed the catch fired.
    expect(/FROM\s+uploads\b/i.test(src)).toBe(false);
  });

  it('SOURCE: stored content and its hash are the same bytes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'autoExtractionPipeline.ts'),
      'utf8',
    );
    // The main artifact hashes mainContent — the bytes it stores.
    expect(src).toContain("update(mainContent).digest('hex')");
    // The table artifact hashes the JSON it persists, not a foreign MD5.
    expect(src).toContain("update(tableContent).digest('hex')");
    expect(src).not.toContain('table.sourceHash,');

    // Scoped deliberately to the artifact writer. The job-level digest over the
    // full source text is a DIFFERENT and legitimate value — it identifies the
    // document processed, with textLength recording its real size — so a blunt
    // repo-wide ban on hashing textContent would forbid correct code and push a
    // future reader to "fix" the wrong one.
    const writer = src.slice(src.indexOf('async function storeExtractedArtifacts'));
    expect(writer).not.toContain("update(textContent).digest('hex')");
  });

  it('a stored-content digest is reproducible by an inspector', () => {
    // What verifyIntegrityChain does: recompute SHA-256 over the stored column.
    // This is the property the truncation bug broke.
    const stored = 'x'.repeat(100_000);
    const source = stored + 'y'.repeat(5_000);
    const storedDigest = crypto.createHash('sha256').update(stored).digest('hex');
    const sourceDigest = crypto.createHash('sha256').update(source).digest('hex');
    expect(storedDigest).not.toBe(sourceDigest);
    // Recomputing over what is actually persisted must match.
    expect(crypto.createHash('sha256').update(stored).digest('hex')).toBe(storedDigest);
  });
});
