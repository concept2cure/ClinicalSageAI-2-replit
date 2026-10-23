/**
 * A leaf declared as one of the application's admin forms reaches the FDA
 * us-regional `<submission-information><form form-type>` through the bytes
 * adapter, packageLeafBytes (package-spine sweep F20, 2026-10-08).
 *
 * The packager recognises a declared form only as the SAME leaf object it
 * packages (refByLeaf), and packageLeafBytes builds those objects itself, so a
 * caller holding bytes could not declare a form at all: the package-model
 * spine shipped every Form FDA 1571 as a bare leaf under `m1-1-forms`, with
 * nothing in the backbone saying which form it was. The adapter now pairs a
 * leaf's `formType` with the leaf it builds. A caller that sends none sees the
 * output it saw before — the second case pins that.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { packageLeafBytes, type LeafBytes } from '../../ectd/package-leaf-bytes';
import { goldenPdf as pdf } from '../../ectd/qualification/golden-fixtures';

async function usRegionalFor(leaves: LeafBytes[]) {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-admin-forms-'));
  try {
    const bundle = await packageLeafBytes({
      region: 'fda',
      applicationId: '123456',
      sequence: '0000',
      submissionType: 'original',
      fda: { applicationType: 'ind', contacts: [{ type: 'regulatory', name: 'Jane Smith', email: 'jane@example.com' }] },
      sponsorId: '123456789',
      sponsorName: 'Acme Biologics Inc.',
      productName: 'Compound X',
      environment: 'staging',
      outputDir,
      leaves,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    return { bundle, xml: await zip.file('m1/us/us-regional.xml')!.async('string') };
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

const inner = (xml: string, element: string) => new RegExp(`<${element}>([\\s\\S]*?)</${element}>`).exec(xml)?.[1] ?? null;

describe('packageLeafBytes declares a leaf’s admin form to the packager', () => {
  it('a 1.1 leaf with formType 1571 is written once, as <form form-type="fdaft1"> under <submission-information>', async () => {
    const { bundle, xml } = await usRegionalFor([
      { ctdSection: '1.1', fileName: 'form-1571.pdf', bytes: pdf('1571'), title: 'Form FDA 1571', formType: '1571' },
      { ctdSection: '1.2', fileName: 'cover.pdf', bytes: pdf('cover'), title: 'Cover letter' },
    ]);
    expect(inner(xml, 'submission-information')).toMatch(/<form form-type="fdaft1">\s*<leaf\b[^>]*xlink:href="1-1\/form-1571\.pdf"/);
    expect(inner(xml, 'm1-regional')).not.toContain('form-1571.pdf');
    expect(xml.match(/xlink:href="[^"]*form-1571\.pdf"/g)).toHaveLength(1);
    expect(bundle.regionalBackbone?.conformanceGap ?? '').not.toMatch(/form-1571|written twice/);
    // The manifest still records the form, so the next sequence diffs against it.
    expect(bundle.leafManifest?.map((l) => l.fileName)).toContain('form-1571.pdf');
  });

  it('with no formType nothing changes: the 1.1 leaf stays under <m1-1-forms> and no <form> is written', async () => {
    const { bundle, xml } = await usRegionalFor([
      { ctdSection: '1.1', fileName: 'form-1571.pdf', bytes: pdf('1571'), title: 'Form FDA 1571' },
      { ctdSection: '1.2', fileName: 'cover.pdf', bytes: pdf('cover'), title: 'Cover letter' },
    ]);
    expect(xml).not.toContain('<form ');
    expect(inner(xml, 'm1-1-forms')).toContain('form-1571.pdf');
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/form-1571\.pdf \(1\.1\) has no declared form type/);
  });
});
