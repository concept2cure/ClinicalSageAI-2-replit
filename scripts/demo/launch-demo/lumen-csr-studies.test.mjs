/**
 * The Lumen account's three completed synthetic CSRs (lumen-csr-studies.mjs, lumen-csr-text.mjs, lumen-csr.mjs).
 *
 * What each case exists to catch:
 *   • A generated source the server would refuse: it is checked with the server's own schema
 *     (shared/csr-source-input.ts), so a source the Vault files is one the CSR path can freeze.
 *   • A source whose bytes drift between runs: the Vault would then file a second copy on every Codespace start,
 *     and a frozen report would no longer match its file. The bytes are pinned.
 *   • A number in the report that is not the data's: the statistics are checked against known answers and the
 *     report's sentences against the source.
 *   • A section left empty, or written "undefined" or "NaN": every section of the real ICH E3 template is written.
 *   • A person's text overwritten on a re-run: only empty sections are written (isEmptySection).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tsImport } from 'tsx/esm/api';
import {
  LUMEN_CSR_STUDIES, LMN201_CSR, LMN301_CSR, LMN801_CSR, fisherExact, generateSource, riskDifference, sourceBytes, twoProportionPower,
} from './packs/lumen-csr-studies.mjs';
import { csrSectionContent, csrStats, SYNTHETIC_BANNER } from './packs/lumen-csr-text.mjs';
import { CSR_SOURCE_FILE } from './packs/lumen-content.mjs';
import { isEmptySection, studySource } from './packs/lumen-csr.mjs';

const schema = await tsImport('../../../shared/csr-source-input.ts', import.meta.url);
const { ICH_E3_GUIDANCE } = await tsImport('../../../server/services/ind/ctd/csr-e3-guidance.ts', import.meta.url);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sourceOf = (study) => (study.sourceFromKit ? JSON.parse(fs.readFileSync(CSR_SOURCE_FILE, 'utf8')) : generateSource(study));
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('every study\'s source passes the server\'s own CSR source schema', () => {
  for (const study of LUMEN_CSR_STUDIES) {
    const parsed = schema.CsrSourceEnvelopeSchema.safeParse(sourceOf(study));
    assert.ok(parsed.success, `${study.key}: ${JSON.stringify(parsed.error?.issues?.slice(0, 3))}`);
  }
});

test('a generated source is the same bytes on every run, and these bytes (a change files a new Vault copy)', () => {
  for (const study of [LMN801_CSR, LMN301_CSR]) assert.equal(sha(sourceBytes(generateSource(study))), sha(sourceBytes(generateSource(study))));
  // Pinned: if a spec change moves these, the next seed files a new source beside the old one. Change them on purpose.
  assert.equal(sha(sourceBytes(generateSource(LMN801_CSR))).slice(0, 12), '568856378f52');
  assert.equal(sha(sourceBytes(generateSource(LMN301_CSR))).slice(0, 12), '7b86b1d3f855');
  assert.equal(studySource(LMN201_CSR).bytes.equals(fs.readFileSync(CSR_SOURCE_FILE)), true, 'LMN-201 uses the kit file as it is');
});

test('the statistics give the published answers', () => {
  // Fisher's exact test, two-sided: R fisher.test(matrix(c(1, 11, 9, 3), 2)) gives 0.002759.
  assert.ok(Math.abs(fisherExact(1, 9, 11, 3) - 0.002759) < 1e-5);
  // A table with no difference has p = 1.
  assert.ok(Math.abs(fisherExact(5, 5, 5, 5) - 1) < 1e-9);
  const rd = riskDifference(3, 20, 12, 20);
  assert.ok(Math.abs(rd.difference + 0.45) < 1e-12);
  assert.ok(Math.abs(rd.lower + 0.7157) < 1e-4 && Math.abs(rd.upper + 0.1843) < 1e-4);
  // Normal approximation, 60% vs 20%, 20 per arm, two-sided 0.05: 0.753.
  assert.ok(Math.abs(twoProportionPower(0.2, 0.6, 20) - 0.753) < 0.002);
});

test('LMN-301\'s report states the result its source records, and the test the source states', () => {
  const src = generateSource(LMN301_CSR);
  const write = csrSectionContent(LMN301_CSR, src);
  const efficacy = plain(write('11.4.1', 'Analysis of Efficacy'));
  const arms = src.studyData.efficacy.filter((e) => e.endpointType === 'primary' && e.armId);
  for (const a of arms) assert.ok(efficacy.includes(a.display), `${a.armId}: ${a.display}`);
  const diff = src.studyData.efficacy.find((e) => e.endpointType === 'primary' && !e.armId);
  assert.ok(efficacy.includes(`p = ${diff.pValue.toFixed(4)}`));
  assert.ok(efficacy.includes(`${(100 * diff.ci.lower).toFixed(1)} to ${(100 * diff.ci.upper).toFixed(1)}`));
});

test('the adverse-event and disposition counts are the source\'s', () => {
  for (const study of LUMEN_CSR_STUDIES) {
    const src = sourceOf(study);
    const s = csrStats(src);
    const write = csrSectionContent(study, src);
    const overview = plain(write('12.2.1', 'Brief Summary of Adverse Events'));
    for (const a of s.arms) {
      const subjects = new Set(src.studyData.adverseEvents.filter((x) => x.armId === a.armId).map((x) => x.subjectId)).size;
      assert.ok(overview.includes(`${subjects} (${(Math.round((1000 * subjects) / a.populations.safety) / 10).toFixed(1)}%) on ${a.armName}`), `${study.key} ${a.armId}`);
    }
    const disposition = plain(write('10.1', 'Disposition of Patients'));
    assert.ok(disposition.includes(`${src.participants.length} participants were randomised`), study.key);
  }
});

test('every section of the ICH E3 template is written, with no empty, undefined or NaN section', () => {
  const sections = ICH_E3_GUIDANCE.map((x) => [x.number, x.title]);
  assert.ok(sections.length >= 100, `the template lists ${sections.length} sections`);
  for (const study of LUMEN_CSR_STUDIES) {
    const write = csrSectionContent(study, sourceOf(study));
    for (const [code, title] of sections) {
      const html = write(code, title);
      assert.ok(!isEmptySection(html), `${study.key} ${code} is empty`);
      assert.doesNotMatch(html, /undefined|NaN|\[object Object\]/, `${study.key} ${code}`);
      assert.doesNotMatch(html, /nothing in this synthetic study is reported under this heading/, `${study.key} ${code} fell back`);
    }
    assert.ok(plain(write('1', 'Title Page')).startsWith(SYNTHETIC_BANNER), `${study.key}: the title page says it is synthetic`);
  }
});

test('only an empty section is written on a re-run', () => {
  for (const empty of ['', '<p></p>', ' <p>&nbsp;</p> ', null]) assert.equal(isEmptySection(empty), true, JSON.stringify(empty));
  for (const kept of ['<p>A person wrote this.</p>', 'Text']) assert.equal(isEmptySection(kept), false);
});

test('every study is labelled synthetic in its titles and names no real person', () => {
  for (const study of LUMEN_CSR_STUDIES) {
    assert.match(study.reportTitle, /SYNTHETIC/);
    const src = sourceOf(study);
    assert.match(src.studyInfo.title, /SYNTHETIC/);
    assert.match(src.studyInfo.sponsor, /FICTIONAL/);
    const n = study.narrative ?? study;
    for (const site of n.sites) { assert.match(site.name, /fictional/); assert.match(site.pi, /fictional/); assert.match(site.irb, /fictional/); }
  }
});
