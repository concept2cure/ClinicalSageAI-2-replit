/**
 * Leaf file names stay within the eCTD file-name rule (FILENAME_PATTERN:
 * lowercase a-z, 0-9, '.', '-', at most 64 characters including the
 * extension). The label was capped at 40 characters and the source key never
 * was, so `coauthor_documents:123` shipped a 68-character name that an agency
 * validator refuses and nothing on the assemble path checked.
 */
import { describe, it, expect } from 'vitest';
import { leafFileName } from '../leaf-source-resolver';
import { FILENAME_PATTERN } from '../ectd-regional-rules';

describe('leafFileName', () => {
  it('keeps the source key whole and gives the label way so the name fits 64 characters', () => {
    const name = leafFileName('Clinical Overview — Integrated Summary of Efficacy and Safety', 'coauthor_documents:123456');
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(FILENAME_PATTERN);
    expect(name.endsWith('-coauthor-documents-123456.pdf')).toBe(true);
  });

  it('a short label and key are unchanged in substance', () => {
    expect(leafFileName('Cover Letter', 'coauthor_documents:7')).toBe('cover-letter-coauthor-documents-7.pdf');
  });

  it('never emits an uppercase letter, a space, or a trailing dash before the key', () => {
    const name = leafFileName('  Módulo 3 / QOS (v2)  ', 'rendered_leaf_files:9');
    expect(name).toMatch(FILENAME_PATTERN);
    expect(name).not.toMatch(/--/);
  });
});
