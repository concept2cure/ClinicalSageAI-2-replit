/**
 * Vault where-used names the sections that cite a version, and the current
 * version lists the sections that still cite an earlier one: where a new
 * version may need the text updated (slice G7, Weave's Dossier Manager).
 */
import { describe, it, expect } from 'vitest';
import {
  isVersionsShape, sectionCitationText, sectionsCitingEarlier,
  type VaultSectionCitation, type VaultVersion,
} from '../surfaces/VaultVersions';

const cite = (sectionId: string, sectionCode: string): VaultSectionCitation => ({
  sectionId, sectionCode, sectionTitle: null, documentId: 'doc-1', documentTitle: 'Clinical overview', spans: 1,
});
const version = (id: string, v: string, current: boolean, sectionCitations: VaultSectionCitation[]): VaultVersion => ({
  id, version: v, current, sectionCitations, contentHash: null, fileSize: null, fileName: null, uploader: null,
  createdAt: '2026-10-29T00:00:00Z', link: 'verified',
} as VaultVersion);

describe('sections that cite a Vault version', () => {
  it('lists, on the current version, the sections that cite only an earlier one', () => {
    const versions = [
      version('v2', '2.0', true, [cite('A', '2.5.4')]),
      version('v1', '1.0', false, [cite('A', '2.5.4'), cite('B', '2.7.3')]),
    ];
    expect(sectionsCitingEarlier(versions).map((c) => [c.sectionId, c.version])).toEqual([['B', '1.0']]);
    expect(sectionCitationText(versions[1].sectionCitations)).toBe(' · cited in Clinical overview §2.5.4; Clinical overview §2.7.3');
    expect(sectionCitationText([])).toBe('');
  });

  it('names a section once even when several earlier versions cite it', () => {
    const versions = [
      version('v3', '3.0', true, []),
      version('v2', '2.0', false, [cite('B', '2.7.3')]),
      version('v1', '1.0', false, [cite('B', '2.7.3')]),
    ];
    expect(sectionsCitingEarlier(versions).map((c) => [c.sectionId, c.version])).toEqual([['B', '2.0']]);
  });

  it('accepts the server shape with citing sections and refuses a malformed citation', () => {
    const ok = { versions: [version('v1', '1.0', true, [cite('A', '2.5.4')])] };
    expect(isVersionsShape(ok)).toBe(true);
    const bad = { versions: [{ ...ok.versions[0], sectionCitations: [{ sectionId: 'A' }] }] };
    expect(isVersionsShape(bad)).toBe(false);
  });
});
