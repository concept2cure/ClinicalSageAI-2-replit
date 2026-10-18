/**
 * A filename-pattern match is a suggestion, not a mapping, and it carries no
 * confidence.
 *
 * What the detector used to do: every filename regex carried a hard-coded
 * "confidence" (protocol 0.80, software 0.80, cover letter 0.85, module paths
 * 0.70 …) and the import route stored every leaf at >= 0.5 as status 'mapped',
 * which approve then turned into artifacts. So `protocol_deviation_log.xlsx`
 * was filed under CTD 5.3.5.1 and `software_license.pdf` under the 510(k)
 * software section "at 0.80", with no person having looked. Those figures were
 * rule weights, not measurements; unmatched files got an equally invented 0.30.
 *
 * Honest behaviour pinned here: a filename placement is `reviewStatus:
 * 'suggested'` and names the rule that matched; only a leaf the archive's own
 * backbone XML declares is 'mapped'; no rule weight is reported as a
 * confidence (`mappingConfidence` is 1 only where the archive declares the
 * placement, 0 where nothing does).
 */
import { describe, it, expect, afterAll } from 'vitest';
import JSZip from 'jszip';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectArchive } from '../detector';

const dir = mkdtempSync(path.join(tmpdir(), 'legacy-detector-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let seq = 0;
async function zipOf(entries: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(entries)) zip.file(name, body);
  const file = path.join(dir, `archive-${++seq}.zip`);
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  return file;
}

const US_REGIONAL = `<?xml version="1.0"?>
<fda-regional>
  <m1-regional>
    <leaf ID="L1" operation="new" xlink:href="m1/us/1-1/cover-letter.pdf"><title>Cover letter</title></leaf>
  </m1-regional>
</fda-regional>`;

describe('detectArchive — a filename pattern suggests, it does not map', () => {
  it('stores protocol_deviation_log.xlsx and software_license.pdf as suggestions naming the rule, with no confidence figure', async () => {
    const archive = await zipOf({
      'protocol_deviation_log.xlsx': 'deviation log',
      'software_license.pdf': 'licence text',
    });
    const { files } = await detectArchive(archive);

    const protocol = files.find((f) => f.fileName === 'protocol_deviation_log.xlsx');
    const software = files.find((f) => f.fileName === 'software_license.pdf');
    expect(protocol?.mappingSource).toBe('filename_heuristic');
    expect(software?.mappingSource).toBe('filename_heuristic');

    // The rule weight (0.80) is not a confidence anyone measured.
    expect(
      [protocol?.mappingConfidence, software?.mappingConfidence],
      'a filename rule weight was reported as a mapping confidence',
    ).toEqual([0, 0]);
    expect(protocol?.reviewStatus, 'a filename match is not a mapping until a person confirms it').toBe('suggested');
    expect(software?.reviewStatus).toBe('suggested');
    expect(protocol?.mappingRuleId).toBe('filename.protocol');
    expect(software?.mappingRuleId).toBe('filename.software');
  });

  it('says how many placements are unconfirmed suggestions', async () => {
    const archive = await zipOf({ 'protocol_deviation_log.xlsx': 'x', 'software_license.pdf': 'y' });
    const { findings } = await detectArchive(archive);
    const note = findings.find((f) => f.code === 'filename_suggestions_unconfirmed');
    expect(note?.severity).toBe('warning');
    expect(note?.message).toMatch(/^2 file\(s\)/);
    expect(note?.message).toMatch(/not imported/i);
  });

  it('maps a leaf only where the regional backbone declares it', async () => {
    const archive = await zipOf({
      'm1/us/us-regional.xml': US_REGIONAL,
      'm1/us/1-1/cover-letter.pdf': 'letter',
      'm5/53-clin-stud-rep/protocol-amendment-2.pdf': 'amendment',
    });
    const { files } = await detectArchive(archive);

    const declared = files.find((f) => f.relativePath === 'm1/us/1-1/cover-letter.pdf');
    expect(declared).toMatchObject({
      mappingSource: 'backbone_xml', reviewStatus: 'mapped', mappingConfidence: 1, mappingRuleId: null, mappedCtdSection: '1.1',
    });
    // In the archive but not in its backbone: still only a suggestion.
    const undeclared = files.find((f) => f.relativePath === 'm5/53-clin-stud-rep/protocol-amendment-2.pdf');
    expect(undeclared?.mappingSource).toBe('filename_heuristic');
    expect(undeclared?.reviewStatus).toBe('suggested');
    // The backbone XML itself is structure, never a mapped leaf.
    expect(files.find((f) => f.relativePath === 'm1/us/us-regional.xml')?.reviewStatus).toBe('skipped');
  });

  it('reports a file nothing matched without inventing a confidence for it', async () => {
    const archive = await zipOf({ 'notes.txt': 'n', 'cover-letter.pdf': 'c' });
    const { files, findings } = await detectArchive(archive);
    const unmatched = files.find((f) => f.fileName === 'notes.txt');
    expect(unmatched).toMatchObject({ mappingSource: 'fallback', reviewStatus: 'skipped', mappingConfidence: 0, mappingRuleId: null });
    const warn = findings.find((f) => f.code === 'unmatched_files');
    expect(warn?.message).toMatch(/^1 file\(s\)/);
    expect(warn?.message).not.toMatch(/confidence/i);
  });
});
