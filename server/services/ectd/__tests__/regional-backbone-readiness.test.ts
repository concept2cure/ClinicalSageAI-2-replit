/**
 * Honest-state for every region's Module 1 backbone.
 *
 * Only FDA's backbone is built to the agency's Module 1 structure. EMA / PMDA /
 * Health Canada have their own root element but file every Module 1 leaf FLAT
 * under the container; the eight widened regions reuse the EMA builder outright
 * (`uk-regional.xml` carries an `<eu-regional>` root). This proves (1) the
 * classification is honest for all 12 regions, (2) the packager actually stamps
 * it on the bundle, (3) the claims are grounded in the BYTES the packager
 * writes, (4) the pre-transmit gate surfaces every non-conformant backbone and
 * blocks a production transmit only when enforcement is opted in — and (5) the
 * check is shown FAILING on the cases it exists to catch, not only passing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {
  classifyRegionalBackbone,
  evaluateRegionalBackboneGate,
  regionalBackboneRequiredFromEnv,
} from '../regional-backbone-readiness';
import { packageLeafBytes } from '../package-leaf-bytes';
import type { Region } from '../../submission-gateways/types';

const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

/**
 * THE MODULE 1 FIXTURE — five leaves across FOUR distinct FDA headings.
 *
 * It used to be a single 1.2 leaf. That made every grouping assertion below
 * VACUOUS: `buildFdaBackbone` builds its `bySection` map from the Module 1
 * leaves, so with one leaf the map always had exactly one entry, one heading
 * was always emitted, and multi-section grouping was never executed at all. A
 * mutation that grouped the first section and filed the rest flat was a silent
 * no-op against this fixture — there was no "rest".
 *
 * 1.1 and 1.1.1 are BOTH here on purpose: 1.1.1 is not itself a published FDA
 * heading, so it must nest under its nearest published ancestor's element
 * (`m1-1-forms`) alongside 1.1. That is one heading holding two leaves, which
 * is the other shape a naive grouping implementation gets wrong.
 */
const M1_FIXTURE: { ctdSection: string; fileName: string; title: string; heading: string }[] = [
  { ctdSection: '1.1',   fileName: 'form1571.pdf', title: 'Form 1571',   heading: 'm1-1-forms' },
  { ctdSection: '1.1.1', fileName: 'form3674.pdf', title: 'Form 3674',   heading: 'm1-1-forms' },
  { ctdSection: '1.2',   fileName: 'cover.pdf',    title: 'Cover',       heading: 'm1-2-cover-letters' },
  { ctdSection: '1.3.4', fileName: 'fin.pdf',      title: 'Financial',   heading: 'm1-3-4-financial-certification-and-disclosure' },
  { ctdSection: '1.6.1', fileName: 'meeting.pdf',  title: 'Meeting req', heading: 'm1-6-1-meeting-request' },
];
/** The distinct FDA heading elements the fixture must produce, in emission order. */
const M1_FIXTURE_HEADINGS = [...new Set(M1_FIXTURE.map((l) => l.heading))];

async function packageFor(region: Region) {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `rb-${region}-`));
  const bundle = await packageLeafBytes({
    region, applicationId: 'APP1', sequence: '0000', submissionType: 'original',
    fda: { applicationType: 'ind', submissionType: 'original' }, // the backbone must state what is being filed
    sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
    leaves: [
      ...M1_FIXTURE.map((l) => ({ ctdSection: l.ctdSection, fileName: l.fileName, bytes: pdf(l.title), title: l.title })),
      { ctdSection: '3.2.P.1', fileName: 'dp.pdf', bytes: pdf('dp'), title: 'DP' },
    ],
  });
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  await fs.rm(outputDir, { recursive: true, force: true });
  return { bundle, zip };
}

/**
 * Every element tag in document order. Comments, PIs and the DOCTYPE are not
 * tags (their `<` is followed by `!` or `?`, not a name character) so they are
 * skipped. `[^>]*` cannot run past a tag end because `escapeXml`
 * (submission-gateways/ectd-packager/paths.ts) escapes `>` inside every
 * attribute value these builders emit.
 */
function* tagsOf(xml: string): Generator<{ name: string; closing: boolean; selfClosing: boolean; start: number; end: number }> {
  const re = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*)>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    yield {
      name: m[2],
      closing: m[1] === '/',
      selfClosing: /\/\s*$/.test(m[3]),
      start: m.index,
      end: m.index + m[0].length,
    };
  }
}

/**
 * The DIRECT children of `container`, plus its inner XML.
 *
 * A depth walk, not a `<container>\s*<child>` regex, and that difference is the
 * whole point. The regex form only ever sees the FIRST child, so a stray flat
 * `<leaf>` appended AFTER correctly grouped headings satisfies
 * `not.toMatch(/<m1-regional>\s*<leaf/)` while the backbone is exactly the
 * thing the assertion claims cannot happen. That mutation was demonstrated
 * against the old assertion and left the suite fully green.
 *
 * FAILS CLOSED: an absent or unclosed container THROWS. Returning `[]` for an
 * unreadable backbone would make "no <leaf> is a direct child" pass for a
 * document nobody could read — an error rendered as a clean result.
 */
function directChildrenOf(xml: string, container: string): { children: string[]; inner: string } {
  if (typeof xml !== 'string' || !xml) throw new Error(`backbone XML is not readable text (${typeof xml})`);
  if (!container) throw new Error('no Module 1 container element was identified — nothing to read children of');
  let depth = -1; // -1 until the container's opening tag is seen
  let innerStart = -1;
  const children: string[] = [];
  for (const t of tagsOf(xml)) {
    if (depth < 0) {
      if (!t.closing && t.name === container) {
        if (t.selfClosing) return { children: [], inner: '' }; // <container/> — empty, but readable
        depth = 0;
        innerStart = t.end;
      }
      continue;
    }
    if (t.closing) {
      if (depth === 0) return { children, inner: xml.slice(innerStart, t.start) };
      depth -= 1;
      continue;
    }
    if (depth === 0) children.push(t.name);
    if (!t.selfClosing) depth += 1;
  }
  throw new Error(
    innerStart < 0
      ? `<${container}> does not appear in the backbone — no claim about its children can be evaluated`
      : `<${container}> is never closed — the backbone is malformed and no conformance claim about it may pass`,
  );
}

/** How many <leaf> elements sit anywhere inside a stretch of backbone XML. */
const leafCount = (xml: string): number => [...xml.matchAll(/<leaf\b/g)].length;

/**
 * The reader itself, checked on the inputs that would otherwise let a broken
 * backbone read as a clean one. Every one of these is a case where returning
 * "no flat leaves found" would be a LIE dressed as a pass.
 */
describe('directChildrenOf — the reader fails closed, and sees past the first child', () => {
  const grouped = '<m1-regional>\n  <m1-1-forms>\n    <leaf ID="a"><title>A</title></leaf>\n  </m1-1-forms>\n</m1-regional>';

  it('POSITIVE CONTROL: a well-formed grouped container reports only its heading children', () => {
    const { children, inner } = directChildrenOf(grouped, 'm1-regional');
    expect(children).toEqual(['m1-1-forms']);
    expect(leafCount(inner)).toBe(1);
  });

  it('sees a stray flat <leaf> AFTER the grouped headings — the exact case the positional regex missed', () => {
    const strayAfter = grouped.replace('</m1-regional>', '  <leaf ID="strayflat"/>\n</m1-regional>');
    // The regex the old assertion used still reports "clean" on these bytes…
    expect(/<m1-regional>\s*<leaf/.test(strayAfter)).toBe(false);
    // …and the reader does not.
    expect(directChildrenOf(strayAfter, 'm1-regional').children).toEqual(['m1-1-forms', 'leaf']);
  });

  it('sees a stray flat <leaf> BEFORE the headings too (the one case the old regex did catch)', () => {
    const strayBefore = grouped.replace('<m1-regional>', '<m1-regional>\n  <leaf ID="strayflat"/>');
    expect(directChildrenOf(strayBefore, 'm1-regional').children).toEqual(['leaf', 'm1-1-forms']);
  });

  it('a self-closing <leaf/> and a <leaf>…</leaf> pair are both direct children', () => {
    const mixed = '<m1-eu><leaf ID="a"><title>A</title></leaf><leaf ID="b"/></m1-eu>';
    expect(directChildrenOf(mixed, 'm1-eu').children).toEqual(['leaf', 'leaf']);
  });

  it('THROWS when the container is absent — an unreadable backbone is never a clean one', () => {
    expect(() => directChildrenOf('<eu-regional><admin/></eu-regional>', 'm1-regional')).toThrow(/does not appear/);
  });

  it('THROWS when the container is never closed', () => {
    expect(() => directChildrenOf('<m1-regional><m1-1-forms><leaf/></m1-1-forms>', 'm1-regional')).toThrow(/never closed/);
  });

  it('THROWS on a non-string / empty document and on an unidentified container', () => {
    expect(() => directChildrenOf(undefined as unknown as string, 'm1-regional')).toThrow(/not readable text/);
    expect(() => directChildrenOf(null as unknown as string, 'm1-regional')).toThrow(/not readable text/);
    expect(() => directChildrenOf(42 as unknown as string, 'm1-regional')).toThrow(/not readable text/);
    expect(() => directChildrenOf('', 'm1-regional')).toThrow(/not readable text/);
    // containerOf() returns '' when it cannot find the element after </admin>.
    // That must throw here rather than silently reading zero children.
    expect(() => directChildrenOf(grouped, '')).toThrow(/no Module 1 container/);
  });

  it('an EMPTY container is readable, and the emptiness is caught by the non-vacuity assertions, not hidden', () => {
    expect(directChildrenOf('<m1-regional/>', 'm1-regional')).toEqual({ children: [], inner: '' });
    expect(directChildrenOf('<m1-regional></m1-regional>', 'm1-regional')).toEqual({ children: [], inner: '' });
  });
});

describe('classifyRegionalBackbone', () => {
  it('only FDA is region-conformant (built to the published FDA Module 1 heading table)', () => {
    expect(classifyRegionalBackbone('fda', 'm1/us/us-regional.xml')).toEqual({
      region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true,
    });
  });
  it('EMA / PMDA / Health Canada are NOT conformant: own root element, but Module 1 is flat — with the gap stated', () => {
    for (const r of ['ema', 'pmda', 'ca'] as Region[]) {
      const s = classifyRegionalBackbone(r, `m1/x/${r}-regional.xml`);
      expect(s.regionConformant, r).toBe(false);
      expect(s.placeholderOf, r).toBeUndefined();
      expect(s.conformanceGap, r).toMatch(/filed flat under/);
      expect(s.conformanceGap, r).toMatch(/DTD structure/);
    }
  });
  it('the eight widened regions are EMA-structure placeholders, never conformant', () => {
    for (const r of ['uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as Region[]) {
      const s = classifyRegionalBackbone(r, `m1/${r}/${r}-regional.xml`);
      expect(s.regionConformant).toBe(false);
      expect(s.placeholderOf).toBe('ema');
      expect(s.conformanceGap).toBeUndefined();
    }
  });
});

describe('the packager stamps the status on the bundle, and the bytes bear the claim out', () => {
  it('fda: conformant, and EVERY Module 1 leaf sits under a published heading element — none directly under the container', async () => {
    const { bundle, zip } = await packageFor('fda');
    expect(bundle.regionalBackbone).toEqual({ region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true });
    const us = await zip.file('m1/us/us-regional.xml')!.async('string');
    // The heading names the conformance report's FDA row lists, read out of the bytes.
    const { children, inner } = directChildrenOf(us, 'm1-regional');
    // NOT the positional `not.toMatch(/<m1-regional>\s*<leaf/)` this used to be:
    // that only reads the FIRST child, so a stray flat leaf appended after the
    // grouped headings satisfied it. This reads every direct child.
    expect(children.filter((c) => c === 'leaf')).toEqual([]);
    expect([...new Set(children)].sort()).toEqual([...M1_FIXTURE_HEADINGS].sort());
    expect(leafCount(inner)).toBe(M1_FIXTURE.length);

    /* EACH leaf under ITS OWN heading — restored, and stronger than the
       `expect(us).toMatch(/<m1-2-cover-letters>\s*<leaf/)` it replaces.
       That single positional assertion was deleted when the checks above were
       introduced, and nothing put back bound a leaf to a heading: "no flat
       leaf", "the heading SET matches" and "the leaf COUNT matches" are all
       satisfied by a backbone that files every leaf under the WRONG one of the
       four correct headings. Rotating the leaf->element assignment in
       buildFdaBackbone passed 48/48 here and 751/751 across the neighbouring
       suites. `usRegionalSectionElement` is unit-tested elsewhere, so the
       mapping FUNCTION was pinned; the packager's USE of it was pinned by
       nothing, and the conformance report's "built to the agency heading table"
       verdict rests on exactly this. */
    for (const l of M1_FIXTURE) {
      expect(
        directChildrenOf(us, l.heading).inner,
        `${l.ctdSection} is not filed under <${l.heading}>`,
      ).toContain(l.fileName);
    }
  });
  it('ema: NOT conformant — eu-regional.xml really does file EVERY Module 1 leaf flat under <m1-eu>', async () => {
    const { bundle, zip } = await packageFor('ema');
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/flat under <m1-eu>/);
    const eu = await zip.file('m1/eu/eu-regional.xml')!.async('string');
    const { children, inner } = directChildrenOf(eu, 'm1-eu'); // the gap, in the bytes
    expect(leafCount(inner)).toBe(M1_FIXTURE.length);
    expect(children).toEqual(M1_FIXTURE.map(() => 'leaf'));
  });
  it('pmda: NOT conformant — jp-regional.xml files every Module 1 leaf flat under <m1-jp>', async () => {
    const { bundle, zip } = await packageFor('pmda');
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    const jp = await zip.file('m1/jp/jp-regional.xml')!.async('string');
    const { children, inner } = directChildrenOf(jp, 'm1-jp');
    expect(leafCount(inner)).toBe(M1_FIXTURE.length);
    expect(children).toEqual(M1_FIXTURE.map(() => 'leaf'));
  });
  it('uk: placeholderOf=ema, and uk-regional.xml carries an <eu-regional> root', async () => {
    const { bundle, zip } = await packageFor('uk');
    expect(bundle.regionalBackbone).toEqual({
      region: 'uk', file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 'ema',
    });
    const ukXml = await zip.file('m1/uk/uk-regional.xml')!.async('string');
    expect(ukXml).toContain('<eu-regional');
  });
});

describe('evaluateRegionalBackboneGate', () => {
  const placeholder = { region: 'uk' as Region, file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 'ema' as Region };
  const flat = classifyRegionalBackbone('ema', 'm1/eu/eu-regional.xml');
  const conformant = { region: 'fda' as Region, file: 'm1/us/us-regional.xml', regionConformant: true };

  it('a placeholder is ALWAYS surfaced (failing check + warning), even when not enforced', () => {
    const g = evaluateRegionalBackboneGate({ status: placeholder, environment: 'production', required: false });
    expect(g.check?.passed).toBe(false);
    expect(g.blockers).toEqual([]);
    expect(g.warnings.some((w) => /NOT an UK-conformant/.test(w) && /placeholder/.test(w))).toBe(true);
  });
  it('a flat-Module-1 backbone is ALWAYS surfaced with its specific gap', () => {
    const g = evaluateRegionalBackboneGate({ status: flat, environment: 'staging', required: false });
    expect(g.check?.passed).toBe(false);
    expect(g.check?.detail).toMatch(/not region-conformant: its Module 1 leaves are filed flat under <m1-eu>/);
    expect(g.warnings).toHaveLength(1);
    expect(g.warnings[0]).toMatch(/NOT an EMA-conformant Module 1 backbone — its Module 1 leaves are filed flat/);
  });
  it('FAILS CLOSED: blocks a production transmit of a placeholder OR a flat backbone when enforcement is on', () => {
    for (const status of [placeholder, flat]) {
      const g = evaluateRegionalBackboneGate({ status, environment: 'production', required: true });
      expect(g.blockers).toHaveLength(1);
      expect(g.blockers[0]).toMatch(/ECTD_REQUIRE_REGIONAL_BACKBONE blocks/);
    }
  });
  it('does not block staging even when enforced (report-only there)', () => {
    const g = evaluateRegionalBackboneGate({ status: placeholder, environment: 'staging', required: true });
    expect(g.blockers).toEqual([]);
    expect(g.warnings).toHaveLength(1);
  });
  it('a conformant region passes cleanly', () => {
    const g = evaluateRegionalBackboneGate({ status: conformant, environment: 'production', required: true });
    expect(g.check?.passed).toBe(true);
    expect(g.blockers).toEqual([]);
    expect(g.warnings).toEqual([]);
  });
  it('a malformed placeholderOf on a stored status cannot crash the gate', () => {
    const tampered = { region: 'uk' as Region, file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 5 as unknown as Region };
    const g = evaluateRegionalBackboneGate({ status: tampered, environment: 'production', required: true });
    expect(g.blockers).toHaveLength(1);
  });
  it('a required flag with no status is a warning (cannot prove conformance), not a silent pass', () => {
    const g = evaluateRegionalBackboneGate({ status: undefined, environment: 'production', required: true });
    expect(g.warnings).toHaveLength(1);
    expect(g.check).toBeUndefined();
  });
  it('the env flag is true only for the literal "true"', () => {
    expect(regionalBackboneRequiredFromEnv({ ECTD_REQUIRE_REGIONAL_BACKBONE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(regionalBackboneRequiredFromEnv({ ECTD_REQUIRE_REGIONAL_BACKBONE: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(regionalBackboneRequiredFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

/**
 * THE CONFORMANCE PIN — all twelve regions, in THREE directions.
 *
 * The four byte tests above check the regions someone happened to write a test
 * for. The gap that leaves: `ca`, `ch`, `au`, `cn`, `br`, `in`, `kr` and `sg`
 * had their classification asserted and their BYTES asserted by nothing, so a
 * later change could move one of them into CONFORMANT_REGIONS — claiming an
 * agency-conformant Module 1 — with no builder work behind it and every test
 * still green. That is the specific failure this block exists to catch, and it
 * catches it in three directions:
 *
 *   claim → bytes   a region marked conformant must actually GROUP its Module 1
 *                   leaves under heading elements — NO <leaf> is a direct child
 *                   of the Module 1 container, wherever in the container it
 *                   sits.
 *   bytes → claim   a region NOT marked conformant must actually be flat (own
 *                   root, EVERY <leaf> a direct child of the container) or
 *                   actually be reusing another region's root element. If
 *                   someone builds a real agency structure and forgets to
 *                   update the classification, this fails too — the honest
 *                   state must not understate the platform either.
 *   root element    every region's root element is read from the bytes and
 *                   compared with the row the conformance report records.
 *
 * Grounded in the packager's real output, not in a restatement of the map.
 *
 * WHAT THIS BLOCK USED TO ASSERT, AND WHY THAT WAS NOT ENOUGH. Both directions
 * were written as a POSITIONAL regex — `<container>\s*<leaf`, which reads only
 * the child immediately after the container's opening tag. Three demonstrated
 * consequences, all fixed here:
 *
 *   - A stray `<leaf .../>` appended inside <m1-regional> AFTER the grouped
 *     headings — precisely what "GROUPED, not flat" says cannot happen — left
 *     the suite at 28 passed (28). `directChildrenOf` is a depth walk now.
 *   - The Module 1 fixture held ONE leaf, so `bySection` in `buildFdaBackbone`
 *     always had a single entry and multi-section grouping was never executed.
 *     A partial-flattening mutation (`i === 0 ? grouped : flat`) produced
 *     BIT-IDENTICAL output against that fixture. M1_FIXTURE spans four headings
 *     now, one of them holding two leaves.
 *   - FDA's root element — the one region claimed conformant — was asserted
 *     NOWHERE, while the report claimed every "Root element" cell was read from
 *     the packager's output. ROOT_ELEMENT covers all twelve.
 */
describe('every region: the claim and the bytes agree', () => {
  const ALL_REGIONS: Region[] = ['fda', 'ema', 'pmda', 'ca', 'uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'];
  /**
   * The "Root element" column of docs/reports/ectd-region-conformance-2026-09-08.md,
   * transcribed here so the report's claim that the column is read out of the
   * packager's real output is TRUE OF EVERY ROW. It was not: `fda` —
   * `<fda-regional:fda-regional>`, the root of the one region claimed
   * conformant — appeared in no assertion in this file.
   */
  const ROOT_ELEMENT: Record<Region, string> = {
    fda: 'fda-regional:fda-regional',
    ema: 'eu-regional',
    pmda: 'jp-regional',
    ca: 'ca-regional',
    uk: 'eu-regional', ch: 'eu-regional', au: 'eu-regional', cn: 'eu-regional',
    br: 'eu-regional', in: 'eu-regional', kr: 'eu-regional', sg: 'eu-regional',
  };
  const built = new Map<Region, { status: NonNullable<Awaited<ReturnType<typeof packageFor>>['bundle']['regionalBackbone']>; xml: string }>();

  /** The root element name of a backbone document (what agency it says it is). */
  const rootOf = (xml: string): string => {
    const m = xml.match(/<([A-Za-z][\w.:-]*)(?=[\s>])(?![^>]*\?>)/g)?.filter((t) => !t.startsWith('<?') && !t.startsWith('<!'));
    return (m?.[0] ?? '').slice(1);
  };
  /** The Module 1 container element — whatever the region's builder opens right after </admin>. */
  const containerOf = (xml: string): string => xml.match(/<\/admin>\s*<([\w.:-]+)>/)?.[1] ?? '';

  beforeAll(async () => {
    for (const region of ALL_REGIONS) {
      const { bundle, zip } = await packageFor(region);
      const status = bundle.regionalBackbone;
      expect(status, `${region} carries no regional-backbone status`).toBeTruthy();
      const xml = await zip.file(status!.file)?.async('string');
      expect(xml, `${region}: the classified file ${status!.file} is not in the package`).toBeTruthy();
      built.set(region, { status: status!, xml: xml! });
    }
  }, 60_000);

  it('exactly ONE region claims conformance today, and it is FDA', () => {
    const claiming = ALL_REGIONS.filter((r) => built.get(r)!.status.regionConformant);
    expect(claiming).toEqual(['fda']);
  });

  it.each(ALL_REGIONS)(
    '%s: the ROOT ELEMENT in the bytes is the one the conformance report records',
    (region) => {
      // The conformance report's "Root element" column claims to be read out
      // of the packager's real output. FDA — the ONE region claimed conformant
      // — was the one row nothing asserted. Every row is read from the bytes
      // now, and Record<Region, string> makes a 13th region fail to compile
      // rather than quietly go unasserted.
      expect(rootOf(built.get(region)!.xml)).toBe(ROOT_ELEMENT[region]);
    },
  );

  it.each(['fda'] as Region[])(
    '%s claims conformance — so NO <leaf> is a direct child of its Module 1 container, wherever in the container it sits',
    (region) => {
      const { xml } = built.get(region)!;
      const container = containerOf(xml);
      expect(container, `${region}: no Module 1 container found`).not.toBe('');
      const { children, inner } = directChildrenOf(xml, container);

      // THE PROPERTY, asserted for real, and asserted FIRST so a violation of
      // it is what the failure says: not "the first child is not a leaf" (a
      // stray flat leaf appended after the headings passed that), but "no
      // direct child of the container is a leaf, wherever in it that leaf sits".
      expect(
        children.filter((c) => c === 'leaf'),
        `${region}: ${children.filter((c) => c === 'leaf').length} <leaf> element(s) are filed FLAT as direct children of <${container}>`,
      ).toEqual([]);

      // Not vacuous, in the two ways it used to be:
      //   - it spans MORE THAN ONE section, so grouping is actually executed, and
      //   - every leaf supplied is placed, so nothing is silently dropped.
      expect(new Set(children).size, `${region}: one heading only — multi-section grouping is never exercised`).toBeGreaterThan(1);
      expect([...new Set(children)].sort()).toEqual([...M1_FIXTURE_HEADINGS].sort());
      expect(leafCount(inner), `${region}: not every Module 1 leaf reached the backbone`).toBe(M1_FIXTURE.length);
    },
  );

  it.each(['ema', 'pmda', 'ca'] as Region[])(
    '%s claims an own-root/flat gap — the bytes must show its OWN root and a <leaf> directly under the container',
    (region) => {
      const { status, xml } = built.get(region)!;
      expect(status.regionConformant).toBe(false);
      expect(status.conformanceGap, `${region}: an own-root non-conformance must state its gap`).toMatch(/flat/);
      expect(status.placeholderOf).toBeUndefined();
      // Its OWN root: for this class the file name and the root element name
      // name the same agency (eu-regional.xml -> <eu-regional>), which is what
      // separates it from the placeholder class below.
      expect(rootOf(xml)).toBe(path.basename(status.file, '.xml'));
      const container = containerOf(xml);
      expect(container, `${region}: no Module 1 container found`).not.toBe('');
      const { children, inner } = directChildrenOf(xml, container);
      const total = leafCount(inner);
      const flat = children.filter((c) => c === 'leaf').length;
      expect(total, `${region}: no Module 1 leaf — the flat claim would be vacuous`).toBe(M1_FIXTURE.length);
      // EVERY leaf is a direct child, not merely the first one. The positional
      // form had the same blind spot in this direction: a builder that grouped
      // the first section and left the rest flat is neither conformant nor
      // accurately described by the recorded gap, and would have passed.
      expect(flat, `${region}: <${container}> files ${flat}/${total} leaves flat — the stated gap no longer describes the bytes`).toBe(total);
    },
  );

  it.each(['uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as Region[])(
    '%s claims to be a placeholder — the bytes must carry the OTHER region\'s root element',
    (region) => {
      const { status, xml } = built.get(region)!;
      expect(status.regionConformant).toBe(false);
      const reused = status.placeholderOf;
      expect(reused, `${region}: a placeholder must name the region it reuses`).toBeTruthy();
      // The file is named for THIS region; the root element is the reused one.
      // That mismatch IS the placeholder, so it is asserted as bytes, not prose.
      expect(status.file).toContain(`${region}-regional.xml`);
      expect(rootOf(xml)).toBe(rootOf(built.get(reused!)!.xml));
      expect(rootOf(xml)).not.toContain(region);
    },
  );
});
