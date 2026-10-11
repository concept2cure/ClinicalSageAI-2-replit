/**
 * One outline node type and one outline renderer (D2, 2026-10-05, step
 * g-document-outline-types; docs/design/ANA_REGULATORY_RECORD.md §5 and R13).
 *
 * Before this step every document outline the platform briefs AnA from had its
 * own node shape and its own renderer: the E3 tree (`E3Section`,
 * `renderE3Brief`), the lifecycle library (`renderLifecycleBrief`), and — for
 * the periodic reports, the protocol, the JP CTN and the EU CTA — nothing a
 * resolver could answer from. R13 adds those outlines as DATA, which needs one
 * node type (`OutlineNode`), one outline type (`DocumentOutline`) and one
 * renderer (`renderOutlineBrief`). This pins the renderer's contract:
 *
 *   - with no section it renders the top level, in order, with the outline's
 *     governing basis;
 *   - with a section it renders that node: applicability, what it carries, the
 *     headings under it, and a basis block in which every basis is rendered by
 *     `basisLabel` — so recall is never shown as checked regulator text;
 *   - a node with no basis of its own falls back to the outline's governing
 *     basis; a node with one adds it after the governing basis;
 *   - a `headingOnly` node says "content not encoded — do not supply from
 *     memory" and renders none of its content fields, even when the data
 *     (wrongly) carries some;
 *   - a `conditional` node names its deciding condition and says it is
 *     undetermined until that fact is known;
 *   - unknown section → null (no guessed brief); an outline with no governing
 *     basis is refused, never rendered unsourced;
 *   - a character cap drops optional blocks but never the basis, and a brief
 *     mode renders identity and basis only;
 *   - the E3 tree is a valid outline as it stands (E3Section is OutlineNode).
 *
 * The fixture outline is FIXTURE DATA for the renderer, not a regulatory
 * record: its titles and bases are invented and say so.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import { basisLabel, type RegulatoryBasis } from '../../shared/regulatory/regulatory-basis';
import * as sectionBrief from '../../server/services/ind/ctd/section-brief';
import { ICH_E3_GUIDANCE } from '../../server/services/ind/ctd/csr-e3-guidance';
import type {
  DocumentOutline,
  E3Section,
  OutlineNode,
  E3Applicability,
  Necessity,
} from '../../server/services/ind/ctd/types';

type Render = (outline: DocumentOutline, section?: string | null, opts?: { maxChars?: number; mode?: 'full' | 'brief' }) => string | null;
const renderOutlineBrief = (sectionBrief as unknown as { renderOutlineBrief?: Render }).renderOutlineBrief;

function render(outline: DocumentOutline, section?: string | null, opts?: { maxChars?: number; mode?: 'full' | 'brief' }): string | null {
  expect(typeof renderOutlineBrief, 'section-brief.ts exports renderOutlineBrief').toBe('function');
  return renderOutlineBrief!(outline, section, opts);
}

const GOVERNING: RegulatoryBasis = {
  ref: 'Fixture Guideline FG-1 (2026)',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/fixture-guideline',
  checked: '2026-10-05',
};
const NODE_RECALL: RegulatoryBasis = { ref: 'Fixture Q&A FG-1 Q7', confidence: 'recall' };

const PLANTED = 'PLANTED CONTENT THAT MUST NOT RENDER';

const FIXTURE: DocumentOutline = {
  id: 'protocol-m11',
  title: 'Fixture study document',
  jurisdictions: 'ich',
  governing: [GOVERNING],
  aliases: ['fixture'],
  owner: 'tests/regulatory/document-outline-render.test.ts',
  nodes: [
    { number: '1', title: 'Summary', applies: 'always', purpose: 'States the study in one page. It is read first.', contains: ['Objectives', 'Design'] },
    { number: '2', title: 'Design', applies: 'always', headingOnly: true, contains: [PLANTED], pitfalls: [PLANTED], purpose: PLANTED },
    {
      number: '2.1',
      title: 'Randomisation',
      applies: 'when-applicable',
      purpose: 'How subjects are allocated.',
      contains: ['Allocation ratio', 'Stratification factors'],
      pitfalls: ['Stratification factors not matching the SAP'],
      see: ['2.2'],
      basis: [NODE_RECALL],
    },
    { number: '2.2', title: 'Blinding', applies: 'authority-dependent', titleLocal: '盲検化', contains: ['Who is blinded'] },
    { number: '3', title: 'Orphan statement', applies: 'conditional', condition: 'orphan_designation', contains: ['Designation number'] },
  ],
};

describe('renderOutlineBrief — the top level', () => {
  it('lists the top-level headings in order, marks a heading-only one, and carries the governing basis', () => {
    const text = render(FIXTURE)!;
    expect(text).toContain('Fixture study document');
    const order = ['1 Summary', '2 Design', '3 Orphan statement'].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toContain('2.1 Randomisation'); // top level only
    expect(text).toMatch(/2 Design[^\n]*content not encoded/i);
    expect(text).toContain(basisLabel(GOVERNING));
    expect(text).not.toContain(PLANTED);
  });

  it('treats an empty section the same as none', () => {
    expect(render(FIXTURE, '  ')).toBe(render(FIXTURE));
    expect(render(FIXTURE, null)).toBe(render(FIXTURE));
  });
});

describe('renderOutlineBrief — one node', () => {
  it('renders what the node carries, the headings under it, and every basis through basisLabel', () => {
    const text = render(FIXTURE, '2.1')!;
    expect(text).toContain('2.1 Randomisation');
    expect(text).toContain('How subjects are allocated.');
    expect(text).toContain('- Allocation ratio');
    expect(text).toContain('Stratification factors not matching the SAP');
    expect(text).toContain('2.2');
    // governing first, then the node's own — recall is labelled as recall.
    const gov = text.indexOf(basisLabel(GOVERNING));
    const own = text.indexOf(basisLabel(NODE_RECALL));
    expect(gov).toBeGreaterThan(-1);
    expect(own).toBeGreaterThan(gov);
    expect(basisLabel(NODE_RECALL)).toMatch(/recall — not checked/);
    expect(text).not.toMatch(/Fixture Q&A FG-1 Q7 \(checked/);
  });

  it('falls back to the governing basis for a node with none of its own', () => {
    const text = render(FIXTURE, '1')!;
    const basisBlock = text.slice(text.indexOf('### Basis'));
    expect(text.indexOf('### Basis')).toBeGreaterThan(-1);
    expect(basisBlock).toContain(basisLabel(GOVERNING));
    expect(basisBlock).not.toContain(NODE_RECALL.ref);
  });

  it('a heading-only node says its content is not encoded and renders none of it', () => {
    const text = render(FIXTURE, '2')!;
    expect(text).toContain('2 Design');
    expect(text.toLowerCase()).toContain('content not encoded — do not supply from memory');
    expect(text).not.toContain(PLANTED);
    // structure is still structure: the headings under it and its basis
    expect(text).toContain('2.1 Randomisation');
    expect(text).toContain('2.2 Blinding');
    expect(text).toContain(basisLabel(GOVERNING));
  });

  it('a conditional node names its condition and says it is undetermined until known', () => {
    const text = render(FIXTURE, '3')!;
    expect(text).toContain('orphan_designation');
    expect(text.toLowerCase()).toContain('undetermined');
  });

  it('renders the local title beside the title', () => {
    expect(render(FIXTURE, '2.2')).toContain('2.2 Blinding (盲検化)');
  });

  it('normalises the asked-for number and finds an unnumbered node by title', () => {
    expect(render(FIXTURE, '§2.1')).toBe(render(FIXTURE, '2.1'));
    expect(render(FIXTURE, ' section 2.1 ')).toBe(render(FIXTURE, '2.1'));
    const unnumbered: DocumentOutline = { ...FIXTURE, nodes: [{ title: 'Signature page', applies: 'always', contains: ['Sponsor signatory'] }] };
    expect(render(unnumbered, 'signature page')).toContain('Sponsor signatory');
  });

  it('returns null for a section the outline does not have', () => {
    expect(render(FIXTURE, '9.9')).toBeNull();
    expect(render(FIXTURE, 'no such heading')).toBeNull();
  });

  it('refuses an outline with no governing basis instead of rendering it unsourced', () => {
    expect(typeof renderOutlineBrief).toBe('function');
    expect(() => renderOutlineBrief!({ ...FIXTURE, governing: [] }, '1')).toThrow(/governing/);
  });
});

describe('renderOutlineBrief — the cap and the brief mode', () => {
  it('drops optional blocks under a cap but never the basis', () => {
    const full = render(FIXTURE, '2.1')!;
    const capped = render(FIXTURE, '2.1', { maxChars: 260 })!;
    expect(capped.length).toBeLessThanOrEqual(260);
    expect(capped.length).toBeLessThan(full.length);
    expect(capped).toContain('2.1 Randomisation');
    expect(capped).toContain(basisLabel(GOVERNING));
  });

  it('the brief mode renders identity and basis, not the content lists', () => {
    const brief = render(FIXTURE, '2.1', { mode: 'brief' })!;
    expect(brief).toContain('2.1 Randomisation');
    expect(brief).toContain(basisLabel(GOVERNING));
    expect(brief).toContain(basisLabel(NODE_RECALL));
    expect(brief).not.toContain('- Allocation ratio');
    expect(brief.length).toBeLessThan(render(FIXTURE, '2.1')!.length);
  });
});

describe('E3Section is an OutlineNode', () => {
  it('the E3 tree renders as an outline without conversion', () => {
    const e3: DocumentOutline = {
      id: 'csr-e3',
      title: 'ICH E3 clinical study report',
      jurisdictions: 'ich',
      governing: [{ ref: 'ICH E3 (1995)', confidence: 'recall' }],
      aliases: ['csr', 'e3'],
      owner: 'server/services/ind/ctd/csr-e3-guidance.ts',
      nodes: ICH_E3_GUIDANCE,
    };
    const text = render(e3, '12.2')!;
    expect(text).toContain('12.2');
    expect(text).toContain(ICH_E3_GUIDANCE.find((s) => s.number === '12.2')!.title);
    expect(render(e3)).toContain('16 ');
  });

  it('keeps E3 applicability narrower than Necessity', () => {
    expectTypeOf<E3Section>().toMatchTypeOf<OutlineNode>();
    expectTypeOf<E3Applicability>().toEqualTypeOf<Exclude<Necessity, 'conditional'>>();
    expectTypeOf<E3Section['number']>().toEqualTypeOf<string>();
  });
});
