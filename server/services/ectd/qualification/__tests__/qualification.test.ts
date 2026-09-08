/**
 * eCTD qualification harness — end-to-end proof for both versions.
 *
 * This is also the integration test for the (refactored) regional packager and
 * the v4.0 RPS packager: it generates golden packages, validates their
 * backbones with the REAL xmllint parser, exercises a replace/delete/append
 * lifecycle sequence, and reopens each ZIP to re-verify every checksum.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { runQualification, qualifyV3, qualifyV4 } from '../index';
import { validateBackboneFile } from '../qualify';
import { isXmllintAvailable } from '../../xml-validator';
import type { Region } from '../../../submission-gateways/types';

// The v3 + full-suite qualifications assert the REAL xmllint well-formed
// validators passed — without the binary they report ran:false/valid:false and
// every assertion here fails for a reason that has nothing to do with the
// packages. Skip visibly instead (repo convention for environment-gated
// suites). CI installs libxml2-utils in the Test job so the conformance
// evidence genuinely runs there; a skip in CI would mean that install
// regressed.
const XMLLINT = await isXmllintAvailable();

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ectd-qual-test-'));
}

describe.skipIf(!XMLLINT)('eCTD v3.2.2 qualification', () => {
  it('generates a well-formed, checksum-verified FDA package with a working lifecycle', async () => {
    const work = await tmp();
    try {
      const r = await qualifyV3('fda', work);
      // Backbone XML is well-formed (real xmllint).
      const wf = r.validators.filter((v) => v.name.includes('well-formed'));
      expect(wf.length).toBeGreaterThanOrEqual(2); // index.xml + us-regional.xml
      for (const v of wf) expect(v.passed).toBe(true);
      // Every checksum in util/index-md5.txt re-verified after reopening the ZIP.
      expect(r.checksum.ok).toBe(true);
      expect(r.checksum.filesChecked).toBeGreaterThan(0);
      expect(r.checksum.mismatches).toEqual([]);
      // Lifecycle sequence (replace/delete/append) packages + verifies.
      // Operations are READ from the emitted amendment backbone (not hardcoded),
      // so this proves the packager actually wrote all three lifecycle operations.
      expect(r.lifecycle.operations).toEqual(expect.arrayContaining(['replace', 'append', 'delete']));
      // A superseding operation must reference the leaf it replaces: the m1
      // replace leaf carries a modified-file pointer at the prior sequence.
      expect(r.lifecycle.operationsWithModifiedFile).toContain('replace');
      expect(r.lifecycle.nextPackagePassed).toBe(true);
      expect(r.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it.each(['ema', 'pmda', 'ca'] as Region[])('qualifies region %s (well-formed + checksums)', async (region) => {
    const work = await tmp();
    try {
      const r = await qualifyV3(region, work);
      expect(r.checksum.ok).toBe(true);
      for (const v of r.validators.filter((x) => x.name.includes('well-formed'))) {
        expect(v.passed).toBe(true);
      }
      expect(r.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe('eCTD v4.0 qualification', () => {
  it('generates a well-formed RPS package, verifies checksums + in-message integrity, and a lifecycle revise', async () => {
    const work = await tmp();
    try {
      const r = await qualifyV4(work);
      expect(r.version).toBe('v4.0');
      // RPS model validator passes; message is well-formed.
      const model = r.validators.find((v) => v.name === 'rps-model-validator');
      expect(model?.passed).toBe(true);
      const wf = r.validators.find((v) => v.name.includes('well-formed'));
      if (wf) expect(wf.passed).toBe(true);
      // Package checksums + per-document SHA-256 integrity re-verified.
      expect(r.checksum.ok).toBe(true);
      expect(r.notes.some((n) => n.includes('integrity mismatch'))).toBe(false);
      // Lifecycle revise references prior CoUs and validates. Operations are
      // read from the emitted RPS message; v4 links a revised document to its
      // predecessor via relatedContextOfUse (its modified-file analogue).
      expect(r.lifecycle.operations).toContain('revise');
      expect(r.lifecycle.operationsWithModifiedFile).toContain('revise');
      expect(r.lifecycle.nextPackagePassed).toBe(true);
      expect(r.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe.skipIf(!XMLLINT)('runQualification (full suite, preserved reports)', () => {
  it('runs FDA v3 + v4 and writes reports with exact spec versions', async () => {
    const work = await tmp();
    const reportDir = path.join(work, 'reports');
    try {
      const summary = await runQualification({
        v3Regions: ['fda'],
        includeV4: true,
        reportDir,
        workDir: work,
        ranAt: '2026-07-30T00:00:00.000Z',
      });
      expect(summary.passed).toBe(true);
      expect(summary.reports.length).toBe(2);
      // Reports were preserved with the exact qualified spec versions.
      const v3 = JSON.parse(await fs.readFile(path.join(reportDir, 'v3.2.2-fda.json'), 'utf8'));
      expect(v3.specVersions.validationCriteria).toContain('v4.5');
      expect(v3.specVersions.fdaRegionalDtd).toContain('v3.3');
      const v4 = JSON.parse(await fs.readFile(path.join(reportDir, 'v4.0-fda.json'), 'utf8'));
      expect(v4.specVersions.fdaRegionalIg).toContain('18.8');
      expect(await fs.readFile(path.join(reportDir, 'summary.json'), 'utf8')).toContain('"passed"');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 60000);
});

/**
 * ── The drop-point holds SEVEN agency artifacts, not five ────────────────────
 *
 * assets/ectd-dtd/ (or $ECTD_DTD_DIR) is vendored with five .dtd files AND two
 * .xsl stylesheets, and checksums.txt records all seven (see its header). Two
 * things in the harness read that directory, and both were DTD-shaped:
 *
 *  (C) the integrity check verified extensions ['.dtd'] only, so a tampered or
 *      unrecorded stylesheet — the file every index.xml renders through — passed
 *      unexamined while the row reported "dtd-checksum-manifest: passed".
 *
 *  (D) DTD *validity* was activated by "does util/dtd/ contain ANY .dtd?", which
 *      is all-or-nothing across regions. A partial acquisition (the FDA pair
 *      lands first, as the runbook's own sequence has it) then ran xmllint
 *      --valid against every OTHER region's backbone too, where the DTD its
 *      DOCTYPE names is genuinely absent — turning "not vendored yet" into a
 *      hard "no DTD found" FAILURE for EMA/PMDA/CA.
 *
 * Both are exercised through the real harness with stand-in bytes: neither the
 * integrity check nor the activation decision reads DTD grammar.
 */
function standIn(name: string): string {
  return name.endsWith('.xsl')
    ? '<?xml version="1.0"?><xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/>'
    : `<!-- stand-in ${name} -->\n<!ELEMENT placeholder EMPTY>\n`;
}

/** Write a partial drop-point and record `recorded` in its checksums.txt. */
async function dropPoint(dir: string, files: string[], recorded: string[] = files): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const lines: string[] = [];
  for (const f of files) {
    const body = standIn(f);
    await fs.writeFile(path.join(dir, f), body);
    if (recorded.includes(f)) {
      lines.push(`${createHash('sha256').update(body).digest('hex')}  ${f}`);
    }
  }
  await fs.writeFile(path.join(dir, 'checksums.txt'), `# fixture manifest\n${lines.join('\n')}\n`);
}

async function withDropPoint<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ECTD_DTD_DIR;
  process.env.ECTD_DTD_DIR = dir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ECTD_DTD_DIR;
    else process.env.ECTD_DTD_DIR = previous;
  }
}

describe('vendored-artifact integrity covers the stylesheets too', () => {
  it('refuses a vendored stylesheet that checksums.txt does not record', async () => {
    const work = await tmp();
    try {
      // The ICH stylesheet is vendored but unrecorded — exactly what an
      // out-of-band drop or a tampered file looks like.
      await dropPoint(path.join(work, 'drop'), ['ectd-2-0.xsl'], []);
      const r = await withDropPoint(path.join(work, 'drop'), () => qualifyV3('fda', work));
      const manifest = r.validators.find((v) => v.name === 'dtd-checksum-manifest');
      expect(manifest, 'the harness must run the drop-point integrity check').toBeTruthy();
      expect(manifest!.passed).toBe(false);
      expect(manifest!.sample.join(' ')).toContain('ectd-2-0.xsl');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('POSITIVE CONTROL: a recorded stylesheet verifies clean', async () => {
    const work = await tmp();
    try {
      await dropPoint(path.join(work, 'drop'), ['ectd-2-0.xsl']);
      const r = await withDropPoint(path.join(work, 'drop'), () => qualifyV3('fda', work));
      expect(r.validators.find((v) => v.name === 'dtd-checksum-manifest')?.passed).toBe(true);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe('DTD validity activates per region, not all-or-nothing', () => {
  it('skips (does not fail) a region whose regional DTD is absent from a partial drop', async () => {
    const work = await tmp();
    try {
      // The FDA pair only: the ICH backbone every region shares, plus the US
      // regional DTD. eu-regional.dtd is genuinely not vendored yet.
      await dropPoint(path.join(work, 'drop'), ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd']);
      const r = await withDropPoint(path.join(work, 'drop'), () => qualifyV3('ema', work));
      const dtdRows = r.validators.filter((v) => v.name.startsWith('xmllint DTD'));

      // POSITIVE CONTROL: index.xml's DOCTYPE names ich-ectd-3-2.dtd, which IS
      // in this partial drop — so its DTD validity is still attempted. This row
      // is present both before and after the per-region change.
      expect(dtdRows.map((v) => v.name)).toContain('xmllint DTD (index.xml)');

      // The defect: eu-regional.xml's DOCTYPE names a DTD the package does not
      // contain, so xmllint reported "no DTD found" and the row FAILED — an
      // un-acquired artifact rendered as a validation failure.
      expect(
        dtdRows.filter((v) => v.name.includes('eu-regional.xml')),
        'a backbone whose DTD is not vendored must be skipped, not failed',
      ).toEqual([]);

      // …and the skip must be stated, never silent. "Nothing assessed" must not
      // read as "assessed and clear".
      expect(r.notes.join(' ')).toContain('eu-regional.dtd');
      expect(r.notes.join(' ')).toMatch(/skipped/i);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('POSITIVE CONTROL: with no drop-point at all, every backbone is skipped and none fails', async () => {
    const work = await tmp();
    try {
      await fs.mkdir(path.join(work, 'empty'), { recursive: true });
      const r = await withDropPoint(path.join(work, 'empty'), () => qualifyV3('ema', work));
      expect(r.validators.filter((v) => v.name.startsWith('xmllint DTD'))).toEqual([]);
      expect(r.notes.join(' ')).toMatch(/DTD \*validity\* is skipped/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

/**
 * ── A backbone that declares NO DTD must be REPORTED, never silently skipped ──
 *
 * `validateBackboneFile` decides DTD validity per backbone by reading that
 * backbone's own DOCTYPE. The first cut of that change returned early — with no
 * row and no skip — whenever the DOCTYPE could not be read, which turned three
 * different facts into the same silence:
 *
 *   • the backbone declares no external DTD at all (a packager regression: an
 *     eCTD backbone MUST reference the grammar it is written to),
 *   • the DOCTYPE names a system id that cannot be parsed,
 *   • the backbone file could not be read.
 *
 * Before that change the all-or-nothing activation meant a DOCTYPE-less
 * backbone still produced a FAILING `xmllint DTD (…)` row whenever any DTD was
 * vendored. After it, the row vanished and the notes were byte-identical to a
 * clean run: a missing DOCTYPE passed in total silence. Each of these is now a
 * `backbone DOCTYPE (…)` row that FAILS.
 *
 * These call the real function the harness calls, against hand-built package
 * trees, because the DOCTYPE is emitted by the packager and cannot be removed
 * from a generated package through `qualifyV3`'s inputs.
 */
describe('backbone DOCTYPE is reported, never silently skipped', () => {
  const WELL_FORMED_BODY = '<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"/>';

  /** A one-file package tree: `index.xml` with the given prologue + an optional
   *  vendored DTD at util/dtd/ich-ectd-3-2.dtd. */
  async function packageTree(
    work: string,
    prologue: string,
    opts: { withDtd?: boolean } = {},
  ): Promise<string> {
    const dir = path.join(work, 'pkg');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n${prologue}${WELL_FORMED_BODY}\n`,
      'utf8',
    );
    if (opts.withDtd) {
      await fs.mkdir(path.join(dir, 'util', 'dtd'), { recursive: true });
      await fs.writeFile(
        path.join(dir, 'util', 'dtd', 'ich-ectd-3-2.dtd'),
        '<!ELEMENT ectd:ectd EMPTY>\n<!ATTLIST ectd:ectd xmlns:ectd CDATA #IMPLIED>\n',
        'utf8',
      );
    }
    return dir;
  }

  it('FAILS a backbone with no DOCTYPE at all (it must not vanish from the report)', async () => {
    const work = await tmp();
    try {
      // Every DTD vendored into the package; only the DOCTYPE line is gone —
      // exactly the packager regression this row exists to catch.
      const dir = await packageTree(work, '', { withDtd: true });
      const r = await validateBackboneFile(dir, 'index.xml');

      const doctypeRow = r.reports.find((v) => v.name === 'backbone DOCTYPE (index.xml)');
      expect(doctypeRow, 'a backbone with no DOCTYPE must produce a reported row').toBeTruthy();
      expect(doctypeRow!.passed).toBe(false);
      expect(doctypeRow!.sample.join(' ')).toMatch(/DOCTYPE/i);

      // …and it must not be laundered into the "waiting on procurement" skip,
      // which reads as an un-acquired artifact rather than a defect.
      expect(r.dtdSkipped).toBeNull();
      // Silence is the specific defect: the row set must not be the
      // well-formedness check alone.
      expect(r.reports.map((v) => v.name)).not.toEqual(['xmllint well-formed (index.xml)']);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('FAILS a backbone whose DOCTYPE carries no parseable SYSTEM identifier', async () => {
    const work = await tmp();
    try {
      const dir = await packageTree(work, '<!DOCTYPE ectd:ectd>\n', { withDtd: true });
      const r = await validateBackboneFile(dir, 'index.xml');
      const doctypeRow = r.reports.find((v) => v.name === 'backbone DOCTYPE (index.xml)');
      expect(doctypeRow?.passed).toBe(false);
      expect(doctypeRow!.sample.join(' ')).toMatch(/SYSTEM/i);
      expect(r.dtdSkipped).toBeNull();
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('FAILS a backbone whose DOCTYPE points OUTSIDE the package (not self-contained)', async () => {
    const work = await tmp();
    try {
      // A system id that escapes the package resolves to a DTD the shipped ZIP
      // does not contain. If such a file happens to exist on the build machine,
      // validating against it would certify a package that is not self-contained.
      const dir = await packageTree(work, '<!DOCTYPE ectd:ectd SYSTEM "../outside.dtd">\n', {
        withDtd: true,
      });
      await fs.writeFile(path.join(work, 'outside.dtd'), '<!ELEMENT ectd:ectd EMPTY>\n', 'utf8');
      const r = await validateBackboneFile(dir, 'index.xml');
      const doctypeRow = r.reports.find((v) => v.name === 'backbone DOCTYPE (index.xml)');
      expect(doctypeRow?.passed).toBe(false);
      expect(doctypeRow!.sample.join(' ')).toMatch(/outside the package/i);
      expect(r.reports.some((v) => v.name.startsWith('xmllint DTD'))).toBe(false);
      expect(r.dtdSkipped).toBeNull();
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('FAILS an unreadable backbone rather than reporting nothing about its DTD', async () => {
    const work = await tmp();
    try {
      const dir = path.join(work, 'pkg');
      await fs.mkdir(dir, { recursive: true });
      const r = await validateBackboneFile(dir, 'index.xml'); // never written
      const doctypeRow = r.reports.find((v) => v.name === 'backbone DOCTYPE (index.xml)');
      expect(doctypeRow?.passed).toBe(false);
      expect(r.dtdSkipped).toBeNull();
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('STILL skips (does not fail) when the DOCTYPE is right but the DTD is unvendored', async () => {
    const work = await tmp();
    try {
      const dir = await packageTree(work, '<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">\n');
      const r = await validateBackboneFile(dir, 'index.xml');
      // The procurement skip is preserved: a declared-but-unvendored DTD is not
      // a defect, and it is still stated rather than silently dropped.
      expect(r.dtdSkipped).toEqual({ relPath: 'index.xml', dtd: 'ich-ectd-3-2.dtd' });
      expect(r.reports.find((v) => v.name === 'backbone DOCTYPE (index.xml)')?.passed).toBe(true);
      expect(r.reports.some((v) => v.name.startsWith('xmllint DTD'))).toBe(false);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});

describe.skipIf(!XMLLINT)('POSITIVE CONTROL: a real generated package declares and validates its DTDs', () => {
  it('emits an xmllint DTD row for every backbone when the drop-point is complete', async () => {
    const work = await tmp();
    try {
      await dropPoint(path.join(work, 'drop'), [
        'ich-ectd-3-2.dtd',
        'us-regional-v3-3.dtd',
        'ectd-2-0.xsl',
        'us-regional.xsl',
      ]);
      const r = await withDropPoint(path.join(work, 'drop'), () => qualifyV3('fda', work));
      // True before and after the DOCTYPE-reporting change: a package whose
      // DOCTYPEs resolve inside a complete drop-point is DTD-validated.
      const dtdRows = r.validators.filter((v) => v.name.startsWith('xmllint DTD')).map((v) => v.name);
      expect(dtdRows).toContain('xmllint DTD (index.xml)');
      expect(dtdRows).toContain('xmllint DTD (m1/us/us-regional.xml)');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});
