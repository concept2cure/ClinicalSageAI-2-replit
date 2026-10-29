/**
 * "What must this contain" has one answer, from one resolver.
 *
 * The rule that turns a request into requirements — a CSR alias → the ICH E3
 * outline, a CTD code → the section brief, otherwise a lifecycle document type,
 * otherwise "not indexed" — lived only inside the AnA tool
 * get_document_section_requirements (regulatory-knowledge-tools.ts), so the
 * drafting paths that need the same answer had to write a second copy
 * (findings 28, 40 and 74, D2 2026-10-05; docs/design/ANA_REGULATORY_RECORD.md
 * §7, step R2).
 *
 * The regression snapshot pins the tool's output, byte for byte, over every
 * registered CTD code and each of its parent codes, every lifecycle id, every
 * CSR alias with every ICH E3 heading, and the keys the record does not index.
 * It is a fingerprint per input (sha256, 16 hex), so a change names the inputs
 * it moved. A step that changes the answers on purpose regenerates it with
 * PRINT_REQUIREMENTS_SNAPSHOT=1 and says why in its commit.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { documentSectionRequirements } from '../../server/services/ana/regulatory-knowledge-tools';
import {
  CTD_AUTHORING_GUIDANCE,
  ICH_E3_GUIDANCE,
  listLifecycleIds,
  renderE3Brief,
  renderLifecycleBrief,
  renderSectionBrief,
  resolveRequirements,
  type RequirementAnswer,
} from '../../server/services/ind/ctd/index';

const CSR_ALIAS_INPUTS = ['csr', 'CSR', 'clinical study report', 'Clinical_Study_Report', 'e3', 'ICH E3', ' csr '];

const NOT_INDEXED_INPUTS = [
  '9.9.9', '1.3.1', '1.8', '1.8.2', '1.10', '1.13', 'maa', 'eu_maa', 'EU_MAA', 'jnda', '510k', 'pma', 'cer', 'per',
  'smpc', 'II.6.1', 'jp_shonin', 'Totally Fabricated Section 99', 'clinical-study-report', 'ich-e3', 'm9',
];

/** Every registered code, every parent prefix of one, and a deeper and an m-prefixed form of each. */
function ctdInputs(): string[] {
  const codes = new Set<string>();
  for (const code of Object.keys(CTD_AUTHORING_GUIDANCE)) {
    codes.add(code);
    const parts = code.split('.');
    for (let i = 1; i < parts.length; i++) codes.add(parts.slice(0, i).join('.'));
  }
  const out = [...codes].sort();
  return [...out, ...out.map((c) => `m${c}`), ...out.map((c) => `${c}.99`), '3.2.s.4', ' 2.7.3 '];
}

type Input = Record<string, unknown>;

function inputs(): Array<[string, Input]> {
  const rows: Array<[string, Input]> = [];
  const add = (input: Input) => rows.push([JSON.stringify(input), input]);
  for (const document of ctdInputs()) add({ document });
  for (const id of listLifecycleIds()) {
    add({ document: id });
    add({ document: id.toUpperCase() });
  }
  for (const alias of CSR_ALIAS_INPUTS) {
    add({ document: alias });
    add({ document: alias, section: '12.2' });
    add({ document: alias, section: '99.9' });
  }
  for (const s of ICH_E3_GUIDANCE) add({ document: 'csr', section: s.number });
  for (const document of NOT_INDEXED_INPUTS) add({ document });
  add({ document: 'csr', section: '' });
  add({ document: '2.7.3', section: '12.2' });
  add({ document: '' });
  add({ document: 42 });
  add({});
  return rows;
}

const fingerprint = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function snapshot(): Record<string, string> {
  return Object.fromEntries(inputs().map(([key, input]) => [key, fingerprint(documentSectionRequirements(input))]));
}

describe('get_document_section_requirements — R2 regression snapshot', () => {
  it('answers every input exactly as it did before the resolver was extracted', () => {
    const now = snapshot();
    if (process.env.PRINT_REQUIREMENTS_SNAPSHOT) {
      console.info(Object.entries(now).map(([key, hash]) => `${hash} ${key}`).join('\n'));
    }
    expect(Object.keys(now).length).toBe(Object.keys(PINNED).length);
    expect(now).toEqual(PINNED);
  });
});

const ROOT = resolve(__dirname, '../..');
const source = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

function answer(a: RequirementAnswer): Extract<RequirementAnswer, { kind: 'answer' }> {
  if (a.kind !== 'answer') throw new Error(`expected an answer, got ${JSON.stringify(a)}`);
  return a;
}

describe('resolveRequirements — the one dispatch', () => {
  it('answers a CTD code from the section brief, naming the entry and how it matched', () => {
    const exact = answer(resolveRequirements({ document: 'm2.7.3' }));
    expect(exact.source).toEqual({ kind: 'ctd-section', code: '2.7.3' });
    expect(exact.match).toBe('exact');
    expect(exact.title).toBe('Summary of Clinical Efficacy');
    expect(exact.requirements.startsWith('## Drafting: Module 2.7.3 — Summary of Clinical Efficacy')).toBe(true);

    const deeper = answer(resolveRequirements({ document: '3.2.S.4.1.9' }));
    expect(deeper.match).toBe('ancestor');
    expect(deeper.source).toEqual({ kind: 'ctd-section', code: '3.2.S.4.1' });

    const parent = answer(resolveRequirements({ document: '2.7' }));
    expect(parent.match).toBe('parent');
    expect(parent.source).toEqual({ kind: 'ctd-section', code: '2.7' });
    expect(parent.requirements).toBe(renderSectionBrief('2.7', 4200));
  });

  it('answers a CSR alias from the ICH E3 outline, with the basis the outline carries', () => {
    const outline = answer(resolveRequirements({ document: 'ICH E3' }));
    expect(outline.source).toEqual({ kind: 'outline', outlineId: 'csr-e3' });
    expect(outline.match).toBe('outline');
    expect(outline.requirements).toBe(renderE3Brief(null, 4200));
    expect(outline.basis.length).toBeGreaterThan(0);

    const heading = answer(resolveRequirements({ document: 'csr', section: '12.2.4' }));
    expect(heading.source).toEqual({ kind: 'outline', outlineId: 'csr-e3', section: '12.2.4' });
    expect(heading.match).toBe('exact');
    expect(heading.basis.some((b) => b.ref.startsWith('ICH E3'))).toBe(true);
  });

  it('answers a lifecycle document type by id, case-insensitively', () => {
    const iss = answer(resolveRequirements({ document: 'ISS' }));
    expect(iss.source).toEqual({ kind: 'lifecycle', id: 'iss' });
    expect(iss.match).toBe('exact');
    expect(iss.requirements).toBe(renderLifecycleBrief('iss', 4200));
  });

  it('says what it does not index, and never answers from another entry', () => {
    for (const document of ['9.9.9', 'maa', '510k', 'Totally Fabricated Section 99', '']) {
      const a = resolveRequirements({ document });
      expect(a.kind).toBe('not_indexed');
      if (a.kind !== 'not_indexed') continue;
      expect(a.reason).toContain('do not supply requirements from memory');
      expect(a.indexedDocuments).toEqual([...listLifecycleIds(), 'csr']);
    }
    const heading = resolveRequirements({ document: 'csr', section: '99.9' });
    expect(heading).toEqual({
      kind: 'not_indexed',
      reason: 'ICH E3 has no heading "99.9". Omit `section` for the outline of §1–§16.',
    });
  });

  it('is the only dispatch: the tool delegates and keeps no copy of the rule', () => {
    const tool = source('server/services/ana/regulatory-knowledge-tools.ts');
    expect(tool).toContain('resolveRequirements(');
    for (const copy of ['CSR_ALIASES', 'renderE3Brief', 'renderSectionBrief', 'renderLifecycleBrief', 'listLifecycleIds']) {
      expect(tool, `regulatory-knowledge-tools.ts still carries ${copy}`).not.toContain(copy);
    }
    const parsed = ts.createSourceFile('regulatory-knowledge-tools.ts',tool,ts.ScriptTarget.Latest,true);
    const callers: string[] = [];
    const dispatches: string[] = [];
    function visit(node: ts.Node, owner = '<outside>') {
      const caller = ts.isFunctionDeclaration(node) ? node.name?.text ?? '<anonymous>' : owner;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text==='normalizeCtdCode') callers.push(caller);
        if (node.expression.text==='resolveRequirements') dispatches.push(caller);
      }
      ts.forEachChild(node,child => visit(child,caller));
    }
    visit(parsed);
    // Static IND placement filters may normalize canonical codes, but they
    // must not duplicate the clinical document-requirements dispatch.
    expect(callers.length).toBeGreaterThan(0);
    expect(callers.every(caller => ['indFilter','indCodeWithin'].includes(caller))).toBe(true);
    expect(dispatches).toEqual(['documentSectionRequirements']);
  });

  it('imports the brief renderers and is imported by none of them', () => {
    const resolver = source('server/services/ind/ctd/requirements-resolver.ts');
    expect(resolver).not.toMatch(/from '\.\/index(\.js)?'/);
    for (const rel of ['server/services/ind/ctd/section-brief.ts', 'server/services/ind/ctd/csr-e3-guidance.ts']) {
      expect(source(rel)).not.toContain('requirements-resolver');
    }
  });
});

// Recorded from documentSectionRequirements at a425d1de, before the extraction.
// Fingerprint, then the input as JSON; three to a line.
// 2026-10-09: 12 exact CMC leaves and two structural parents intentionally expand
// the enumerated inputs; affected ancestor listings change, unrelated hashes stay pinned.
// 2026-10-10: seven exact pharmacology leaves add 21 variants; only the
// existing 2.6/m2.6 parent lists change. The other 661 fingerprints are preserved.
// Delta: docs/evidence/D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/requirements-snapshot-delta.json
// 2026-10-18: the D2 review corrections to five lifecycle records (nda_pas,
// cbe_0, ind_annual_report, ind_safety_report, nda_bla_annual_report) move
// their ten fingerprints (each id and its upper-case form) and nothing else.
// Delta: docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/increment-2/requirements-snapshot-delta.json
// 2026-10-29: the US biotech filing completion appends 17 lifecycle records
// (docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md); each id and its
// upper-case form add 34 fingerprints, and the 44 not-indexed answers move
// only because their document_types list names the 17 new ids. No other
// fingerprint moved.
// Delta: docs/evidence/D2-US-BIOTECH-FILING-COMPLETION/2026-10-27/integration/requirements-snapshot-delta.json
const PINNED_TABLE = `
b40bf211f7e54507 {"document":"1"}  cd2025612b986822 {"document":"1.1"}  4a2ae5b79a8739e0 {"document":"1.1.1"}
8fec1080817ffabb {"document":"1.1.2"}  2cc355087e894708 {"document":"1.1.3"}  62dc7cedc05894e2 {"document":"1.1.4"}
9bfe71e45c280964 {"document":"1.12"}  39ed2ea1e645b842 {"document":"1.12.14"}  deb3494bef64b5e6 {"document":"1.14"}
0892dc5964daf9ef {"document":"1.14.1"}  0245d7abc6557db9 {"document":"1.14.1.1"}  b5c97de3f6603bcb {"document":"1.14.1.3"}
eb62488b1e8fe4f5 {"document":"1.14.4"}  460e70d1f3a5dd03 {"document":"1.14.4.1"}  f108d72270d85d54 {"document":"1.14.4.2"}
3f2eab4452fdedba {"document":"1.2"}  fa0b4f1098827c57 {"document":"1.20"}  b34a6222168a5ea9 {"document":"1.3"}
3d4dfac139b54b27 {"document":"1.3.3"}  d56fc53c0ed7c8fa {"document":"1.3.4"}  78dec0bbe383cfb0 {"document":"1.3.5"}
f42168be678a9483 {"document":"1.3.5.1"}  c93bc3959673cc0e {"document":"1.9"}  714c8ca4be8310bc {"document":"2"}
7cf905bc6765ce47 {"document":"2.2"}  213f4df968c098d5 {"document":"2.3"}  b639fb49f2b626b6 {"document":"2.3.A"}
f1f3c35a4086ba94 {"document":"2.3.P"}  29aa02ba77745811 {"document":"2.3.R"}  b4dc6b0ba6eef8e9 {"document":"2.3.S"}
f2593dc20c2937c6 {"document":"2.4"}  c5c3d11581e04987 {"document":"2.5"}  74d3056b0e69cad7 {"document":"2.5.1"}
979219718f04e8ba {"document":"2.5.2"}  a32e09f149e8a0ab {"document":"2.5.3"}  af185da915e6f50b {"document":"2.5.4"}
fb039127fb58a342 {"document":"2.5.5"}  528d68a49f43a829 {"document":"2.5.6"}  dc1fa651cfa9aeb6 {"document":"2.6"}
641da6b341c5886f {"document":"2.6.1"}  fd62a9de87bb6fed {"document":"2.6.2"}  fbbd0a76969d3459 {"document":"2.6.3"}
a908663e04b07a7c {"document":"2.6.4"}  cc88e6265a133793 {"document":"2.6.5"}  46d8063bca81aa4a {"document":"2.6.6"}
b3fcf7aecff12593 {"document":"2.6.7"}  bfae4c818f791136 {"document":"2.7"}  554f75ea14dcb4de {"document":"2.7.1"}
bf55b7118d2203ea {"document":"2.7.2"}  b87f32b2e555bc51 {"document":"2.7.3"}  adcd03fd610bbf7e {"document":"2.7.4"}
90c5a251ec745be5 {"document":"2.7.5"}  78059bec4e347313 {"document":"2.7.6"}  d968e0dfd69c0025 {"document":"3"}
5508a54c3241ad28 {"document":"3.2"}  4d6a51fe57bf11be {"document":"3.2.A"}  768bb186a39e709a {"document":"3.2.P"}
f10ddeeede2cd042 {"document":"3.2.P.1"}  768df392ed92a438 {"document":"3.2.P.2"}  3a326fd360644751 {"document":"3.2.P.3"}
0a04b396534bb259 {"document":"3.2.P.3.1"}  4d89c000ce9d6c2f {"document":"3.2.P.3.2"}  080b889d14c1e649 {"document":"3.2.P.3.3"}
f448598ea431c0c9 {"document":"3.2.P.3.4"}  f909e46d17bff646 {"document":"3.2.P.3.5"}  a19ce6bd2fdc64d3 {"document":"3.2.P.4"}
247b72352962aec8 {"document":"3.2.P.5"}  3dca6adb8409e2c2 {"document":"3.2.P.5.1"}  802e9ad08a57473d {"document":"3.2.P.5.2"}
15dc73730bee21f4 {"document":"3.2.P.5.3"}  435e068edd83ecfd {"document":"3.2.P.5.4"}  acabe2b2db8af499 {"document":"3.2.P.5.5"}
0fff94e22c6fa526 {"document":"3.2.P.5.6"}  6b460d092a932cf0 {"document":"3.2.P.6"}  b74727ab54a52621 {"document":"3.2.P.7"}
81f6d8f436835c88 {"document":"3.2.P.8"}  8a1f5e4fe6b882d9 {"document":"3.2.R"}  d3fe6824d42d2397 {"document":"3.2.S"}
7913e3a9792e5c7e {"document":"3.2.S.1"}  9983a5c764c7c3ea {"document":"3.2.S.2"}  42afa7e5d87865d0 {"document":"3.2.S.2.1"}
1ec0368e3d7a8e92 {"document":"3.2.S.2.2"}  7034242f517014f4 {"document":"3.2.S.2.3"}  d5ba0fa7638b857e {"document":"3.2.S.2.4"}
75464beb57ea3781 {"document":"3.2.S.2.5"}  c5d5d7c40c7a4cef {"document":"3.2.S.2.6"}  cf84a4d3d8ba075e {"document":"3.2.S.3"}
609709abe213c2af {"document":"3.2.S.3.1"}  4f2e35344e7b703b {"document":"3.2.S.3.2"}  71b33c210c74a17c {"document":"3.2.S.4"}
7f16fb84375cd4e7 {"document":"3.2.S.4.1"}  af32b41d023b90dc {"document":"3.2.S.4.2"}  21b3958a6fd391aa {"document":"3.2.S.4.3"}
8f9e49590e53bbf5 {"document":"3.2.S.4.4"}  d80bbf162d1d2ca7 {"document":"3.2.S.4.5"}  c9c4b0d24525ce33 {"document":"3.2.S.5"}
b56d8ea1c5c37ffb {"document":"3.2.S.6"}  2481a9efe2f3dc27 {"document":"3.2.S.7"}  7808afdb715fce7f {"document":"4"}
585cf7fec625c92e {"document":"4.2"}  3eb4289f1636938a {"document":"4.2.1"}  e127691ece86d08d {"document":"4.2.1.1"}
56929e252f8e6f01 {"document":"4.2.1.2"}  cfb2646d218e92ef {"document":"4.2.1.3"}  2afd402040808e6a {"document":"4.2.1.4"}
312b71be844ab473 {"document":"4.2.2"}  5dc1b34f9d61156e {"document":"4.2.2.1"}  6dcb866a68670f12 {"document":"4.2.2.2"}
b9bf3aea9975533a {"document":"4.2.2.3"}  b559b8394cdc0fc7 {"document":"4.2.2.4"}  2638a674ffb91af3 {"document":"4.2.2.5"}
9ea00e57368855ac {"document":"4.2.2.6"}  abff5d6db40e50fe {"document":"4.2.2.7"}  17e4a6479d5beec8 {"document":"4.2.3"}
8a040ff097c32fa9 {"document":"4.2.3.1"}  e4b1eddca1472f19 {"document":"4.2.3.2"}  f45e95c47381dcf8 {"document":"4.2.3.3"}
a7da9f55ebfc1af9 {"document":"4.2.3.4"}  1aed615467813dba {"document":"4.2.3.5"}  edc06033b0ed11eb {"document":"4.2.3.6"}
bf9de3a298d079bf {"document":"4.2.3.7"}  cb3e5e056cb117cb {"document":"4.3"}  b39833c04fa17492 {"document":"5"}
058003b17c701fe2 {"document":"5.1"}  8d0184f5eb040260 {"document":"5.2"}  07217df18403e49b {"document":"5.3"}
33db2cd5fb334627 {"document":"5.3.1"}  25229d16ed19e994 {"document":"5.3.2"}  737c251bd813cd89 {"document":"5.3.3"}
8cb302d44965972e {"document":"5.3.4"}  14fa4b3b0db4459e {"document":"5.3.5"}  3af2bcb06d6dc562 {"document":"5.3.5.1"}
d150f432370e88ec {"document":"5.3.5.2"}  5eef0c3ab8f26a22 {"document":"5.3.5.3"}  95013fb2e32b9e35 {"document":"5.3.5.4"}
becb65dfb9ce467e {"document":"5.3.6"}  f8069a1b774f81aa {"document":"5.3.7"}  531b306ca6e497f3 {"document":"5.4"}
b40bf211f7e54507 {"document":"m1"}  cd2025612b986822 {"document":"m1.1"}  4a2ae5b79a8739e0 {"document":"m1.1.1"}
8fec1080817ffabb {"document":"m1.1.2"}  2cc355087e894708 {"document":"m1.1.3"}  62dc7cedc05894e2 {"document":"m1.1.4"}
9bfe71e45c280964 {"document":"m1.12"}  39ed2ea1e645b842 {"document":"m1.12.14"}  deb3494bef64b5e6 {"document":"m1.14"}
0892dc5964daf9ef {"document":"m1.14.1"}  0245d7abc6557db9 {"document":"m1.14.1.1"}  b5c97de3f6603bcb {"document":"m1.14.1.3"}
eb62488b1e8fe4f5 {"document":"m1.14.4"}  460e70d1f3a5dd03 {"document":"m1.14.4.1"}  f108d72270d85d54 {"document":"m1.14.4.2"}
3f2eab4452fdedba {"document":"m1.2"}  fa0b4f1098827c57 {"document":"m1.20"}  b34a6222168a5ea9 {"document":"m1.3"}
3d4dfac139b54b27 {"document":"m1.3.3"}  d56fc53c0ed7c8fa {"document":"m1.3.4"}  78dec0bbe383cfb0 {"document":"m1.3.5"}
f42168be678a9483 {"document":"m1.3.5.1"}  c93bc3959673cc0e {"document":"m1.9"}  714c8ca4be8310bc {"document":"m2"}
7cf905bc6765ce47 {"document":"m2.2"}  213f4df968c098d5 {"document":"m2.3"}  b639fb49f2b626b6 {"document":"m2.3.A"}
f1f3c35a4086ba94 {"document":"m2.3.P"}  29aa02ba77745811 {"document":"m2.3.R"}  b4dc6b0ba6eef8e9 {"document":"m2.3.S"}
f2593dc20c2937c6 {"document":"m2.4"}  c5c3d11581e04987 {"document":"m2.5"}  74d3056b0e69cad7 {"document":"m2.5.1"}
979219718f04e8ba {"document":"m2.5.2"}  a32e09f149e8a0ab {"document":"m2.5.3"}  af185da915e6f50b {"document":"m2.5.4"}
fb039127fb58a342 {"document":"m2.5.5"}  528d68a49f43a829 {"document":"m2.5.6"}  dc1fa651cfa9aeb6 {"document":"m2.6"}
641da6b341c5886f {"document":"m2.6.1"}  fd62a9de87bb6fed {"document":"m2.6.2"}  fbbd0a76969d3459 {"document":"m2.6.3"}
a908663e04b07a7c {"document":"m2.6.4"}  cc88e6265a133793 {"document":"m2.6.5"}  46d8063bca81aa4a {"document":"m2.6.6"}
b3fcf7aecff12593 {"document":"m2.6.7"}  bfae4c818f791136 {"document":"m2.7"}  554f75ea14dcb4de {"document":"m2.7.1"}
bf55b7118d2203ea {"document":"m2.7.2"}  b87f32b2e555bc51 {"document":"m2.7.3"}  adcd03fd610bbf7e {"document":"m2.7.4"}
90c5a251ec745be5 {"document":"m2.7.5"}  78059bec4e347313 {"document":"m2.7.6"}  d968e0dfd69c0025 {"document":"m3"}
5508a54c3241ad28 {"document":"m3.2"}  4d6a51fe57bf11be {"document":"m3.2.A"}  768bb186a39e709a {"document":"m3.2.P"}
f10ddeeede2cd042 {"document":"m3.2.P.1"}  768df392ed92a438 {"document":"m3.2.P.2"}  3a326fd360644751 {"document":"m3.2.P.3"}
0a04b396534bb259 {"document":"m3.2.P.3.1"}  4d89c000ce9d6c2f {"document":"m3.2.P.3.2"}  080b889d14c1e649 {"document":"m3.2.P.3.3"}
f448598ea431c0c9 {"document":"m3.2.P.3.4"}  f909e46d17bff646 {"document":"m3.2.P.3.5"}  a19ce6bd2fdc64d3 {"document":"m3.2.P.4"}
247b72352962aec8 {"document":"m3.2.P.5"}  3dca6adb8409e2c2 {"document":"m3.2.P.5.1"}  802e9ad08a57473d {"document":"m3.2.P.5.2"}
15dc73730bee21f4 {"document":"m3.2.P.5.3"}  435e068edd83ecfd {"document":"m3.2.P.5.4"}  acabe2b2db8af499 {"document":"m3.2.P.5.5"}
0fff94e22c6fa526 {"document":"m3.2.P.5.6"}  6b460d092a932cf0 {"document":"m3.2.P.6"}  b74727ab54a52621 {"document":"m3.2.P.7"}
81f6d8f436835c88 {"document":"m3.2.P.8"}  8a1f5e4fe6b882d9 {"document":"m3.2.R"}  d3fe6824d42d2397 {"document":"m3.2.S"}
7913e3a9792e5c7e {"document":"m3.2.S.1"}  9983a5c764c7c3ea {"document":"m3.2.S.2"}  42afa7e5d87865d0 {"document":"m3.2.S.2.1"}
1ec0368e3d7a8e92 {"document":"m3.2.S.2.2"}  7034242f517014f4 {"document":"m3.2.S.2.3"}  d5ba0fa7638b857e {"document":"m3.2.S.2.4"}
75464beb57ea3781 {"document":"m3.2.S.2.5"}  c5d5d7c40c7a4cef {"document":"m3.2.S.2.6"}  cf84a4d3d8ba075e {"document":"m3.2.S.3"}
609709abe213c2af {"document":"m3.2.S.3.1"}  4f2e35344e7b703b {"document":"m3.2.S.3.2"}  71b33c210c74a17c {"document":"m3.2.S.4"}
7f16fb84375cd4e7 {"document":"m3.2.S.4.1"}  af32b41d023b90dc {"document":"m3.2.S.4.2"}  21b3958a6fd391aa {"document":"m3.2.S.4.3"}
8f9e49590e53bbf5 {"document":"m3.2.S.4.4"}  d80bbf162d1d2ca7 {"document":"m3.2.S.4.5"}  c9c4b0d24525ce33 {"document":"m3.2.S.5"}
b56d8ea1c5c37ffb {"document":"m3.2.S.6"}  2481a9efe2f3dc27 {"document":"m3.2.S.7"}  7808afdb715fce7f {"document":"m4"}
585cf7fec625c92e {"document":"m4.2"}  3eb4289f1636938a {"document":"m4.2.1"}  e127691ece86d08d {"document":"m4.2.1.1"}
56929e252f8e6f01 {"document":"m4.2.1.2"}  cfb2646d218e92ef {"document":"m4.2.1.3"}  2afd402040808e6a {"document":"m4.2.1.4"}
312b71be844ab473 {"document":"m4.2.2"}  5dc1b34f9d61156e {"document":"m4.2.2.1"}  6dcb866a68670f12 {"document":"m4.2.2.2"}
b9bf3aea9975533a {"document":"m4.2.2.3"}  b559b8394cdc0fc7 {"document":"m4.2.2.4"}  2638a674ffb91af3 {"document":"m4.2.2.5"}
9ea00e57368855ac {"document":"m4.2.2.6"}  abff5d6db40e50fe {"document":"m4.2.2.7"}  17e4a6479d5beec8 {"document":"m4.2.3"}
8a040ff097c32fa9 {"document":"m4.2.3.1"}  e4b1eddca1472f19 {"document":"m4.2.3.2"}  f45e95c47381dcf8 {"document":"m4.2.3.3"}
a7da9f55ebfc1af9 {"document":"m4.2.3.4"}  1aed615467813dba {"document":"m4.2.3.5"}  edc06033b0ed11eb {"document":"m4.2.3.6"}
bf9de3a298d079bf {"document":"m4.2.3.7"}  cb3e5e056cb117cb {"document":"m4.3"}  b39833c04fa17492 {"document":"m5"}
058003b17c701fe2 {"document":"m5.1"}  8d0184f5eb040260 {"document":"m5.2"}  07217df18403e49b {"document":"m5.3"}
33db2cd5fb334627 {"document":"m5.3.1"}  25229d16ed19e994 {"document":"m5.3.2"}  737c251bd813cd89 {"document":"m5.3.3"}
8cb302d44965972e {"document":"m5.3.4"}  14fa4b3b0db4459e {"document":"m5.3.5"}  3af2bcb06d6dc562 {"document":"m5.3.5.1"}
d150f432370e88ec {"document":"m5.3.5.2"}  5eef0c3ab8f26a22 {"document":"m5.3.5.3"}  95013fb2e32b9e35 {"document":"m5.3.5.4"}
becb65dfb9ce467e {"document":"m5.3.6"}  f8069a1b774f81aa {"document":"m5.3.7"}  531b306ca6e497f3 {"document":"m5.4"}
d1ee07905047abbb {"document":"1.99"}  3f4bd5a1c980c343 {"document":"1.1.99"}  00932951b1e51ed0 {"document":"1.1.1.99"}
7d1e408ea4112d8e {"document":"1.1.2.99"}  9ede29ec4de60f77 {"document":"1.1.3.99"}  4e69dd5f1d674e91 {"document":"1.1.4.99"}
228fc0b6ec3dc3d0 {"document":"1.12.99"}  a15d4ae1cf3d8230 {"document":"1.12.14.99"}  80ea9f863e8d38c6 {"document":"1.14.99"}
6e77145bcf90519e {"document":"1.14.1.99"}  558e78fd4f756d42 {"document":"1.14.1.1.99"}  1c5f31ffa300d413 {"document":"1.14.1.3.99"}
14acdee00b729e0f {"document":"1.14.4.99"}  f8de182052d455c3 {"document":"1.14.4.1.99"}  4ac1fea128652cb5 {"document":"1.14.4.2.99"}
05de4c6c6f520fc7 {"document":"1.2.99"}  19193ceac30a335c {"document":"1.20.99"}  e80ca238bc935db9 {"document":"1.3.99"}
50c13c8c766571c6 {"document":"1.3.3.99"}  49f37d0ae23a30e8 {"document":"1.3.4.99"}  960c86cef663a61f {"document":"1.3.5.99"}
69db76deac66ac32 {"document":"1.3.5.1.99"}  a17f5d2f230ba30d {"document":"1.9.99"}  ac5a28eb3f929d5d {"document":"2.99"}
a29c49c21b1951f5 {"document":"2.2.99"}  9d80077966cd733f {"document":"2.3.99"}  0006239b5fcd98f9 {"document":"2.3.A.99"}
8d6cb2e0f4e31342 {"document":"2.3.P.99"}  0d38087ecd30e203 {"document":"2.3.R.99"}  96ef667c42e87caf {"document":"2.3.S.99"}
dcc717771bd0b7d8 {"document":"2.4.99"}  909cd810f6628b35 {"document":"2.5.99"}  841b3aa8cc230123 {"document":"2.5.1.99"}
d1ce1e4910a25d57 {"document":"2.5.2.99"}  600865eb961db4de {"document":"2.5.3.99"}  582681f2d314c6bd {"document":"2.5.4.99"}
496339e5ce2bbfb8 {"document":"2.5.5.99"}  0cca0dab168e9d30 {"document":"2.5.6.99"}  46c2be1887ab6442 {"document":"2.6.99"}
0974727479cdce3e {"document":"2.6.1.99"}  9982c44d0324b193 {"document":"2.6.2.99"}  fa42eb1481803330 {"document":"2.6.3.99"}
47b26a5fad604197 {"document":"2.6.4.99"}  eae90701cc5f0d8f {"document":"2.6.5.99"}  ba45c4f25c26fd83 {"document":"2.6.6.99"}
7fa3e3a5602a6fc0 {"document":"2.6.7.99"}  b5c4a9ee73628bbc {"document":"2.7.99"}  544d79bd1d0e9514 {"document":"2.7.1.99"}
133fac94da64c0cc {"document":"2.7.2.99"}  a88c8b7e2aefe69d {"document":"2.7.3.99"}  05af48cb81641e8b {"document":"2.7.4.99"}
90d55f5e9fb367a2 {"document":"2.7.5.99"}  43b4abb840a4631d {"document":"2.7.6.99"}  89d390bf16ac0705 {"document":"3.99"}
0f4dbab82dd9c9d9 {"document":"3.2.99"}  d5c93b631993ebeb {"document":"3.2.A.99"}  991bd4a38d044b0b {"document":"3.2.P.99"}
315acf1da0ad34ec {"document":"3.2.P.1.99"}  bff2c775ea40e8b9 {"document":"3.2.P.2.99"}  763853d81e5dd13f {"document":"3.2.P.3.99"}
78a545814628e30f {"document":"3.2.P.3.1.99"}  ca5431d8dd4aa2e9 {"document":"3.2.P.3.2.99"}  482fcbf403295f60 {"document":"3.2.P.3.3.99"}
db7b6224003a0c33 {"document":"3.2.P.3.4.99"}  26de81ada63a623f {"document":"3.2.P.3.5.99"}  4f36b30c8d427df1 {"document":"3.2.P.4.99"}
d81b5b87e9aa27c3 {"document":"3.2.P.5.99"}  874c7bba26e28326 {"document":"3.2.P.5.1.99"}  451c916edef047ad {"document":"3.2.P.5.2.99"}
0c0bd3ee64b18926 {"document":"3.2.P.5.3.99"}  0649557b147c9d04 {"document":"3.2.P.5.4.99"}  60563d406d8d0ed3 {"document":"3.2.P.5.5.99"}
369d54e0addfa38b {"document":"3.2.P.5.6.99"}  3c23d019d4106d3c {"document":"3.2.P.6.99"}  27f8140167f38cbd {"document":"3.2.P.7.99"}
c76aefb1fae0d440 {"document":"3.2.P.8.99"}  3199f016b0e5b3d0 {"document":"3.2.R.99"}  843c480151d837ca {"document":"3.2.S.99"}
eba77008c0dce06b {"document":"3.2.S.1.99"}  747e41c06d64073b {"document":"3.2.S.2.99"}  b84e84ace14adb8e {"document":"3.2.S.2.1.99"}
a47e8c844d42ceac {"document":"3.2.S.2.2.99"}  7deacb982e323174 {"document":"3.2.S.2.3.99"}  96d250ee8f871923 {"document":"3.2.S.2.4.99"}
eac4d2e9775bf483 {"document":"3.2.S.2.5.99"}  76299ebeaf889b2b {"document":"3.2.S.2.6.99"}  806cbe2c0cbd9c2d {"document":"3.2.S.3.99"}
314988fb4b41d0ef {"document":"3.2.S.3.1.99"}  cfc057b56c99ec81 {"document":"3.2.S.3.2.99"}  8ca0b14376e06c48 {"document":"3.2.S.4.99"}
bfa9e48311ccf244 {"document":"3.2.S.4.1.99"}  f9ea5b9bd5360c05 {"document":"3.2.S.4.2.99"}  3bd5faf71b87f753 {"document":"3.2.S.4.3.99"}
41055a562efa3d08 {"document":"3.2.S.4.4.99"}  fc5168374ee21487 {"document":"3.2.S.4.5.99"}  0c61230efe77e489 {"document":"3.2.S.5.99"}
0427687a4b3e8a2a {"document":"3.2.S.6.99"}  427f18d4a7d75b5f {"document":"3.2.S.7.99"}  6cc9231bf698858a {"document":"4.99"}
9587b4c44b391d67 {"document":"4.2.99"}  a6eeeffbd8c657d1 {"document":"4.2.1.99"}  033a9744fe4f24cb {"document":"4.2.1.1.99"}
7586ab3d230c4a3d {"document":"4.2.1.2.99"}  b7b08200d0035518 {"document":"4.2.1.3.99"}  08e4f62813f9b084 {"document":"4.2.1.4.99"}
698a30dae2881e69 {"document":"4.2.2.99"}  e13cca078273deb6 {"document":"4.2.2.1.99"}  4b04d779bd267a73 {"document":"4.2.2.2.99"}
56a2a8546272e23b {"document":"4.2.2.3.99"}  11b4d8cc6153888f {"document":"4.2.2.4.99"}  9e006199ba4eb3ff {"document":"4.2.2.5.99"}
d34dbf779b35dab4 {"document":"4.2.2.6.99"}  c4a646e39e2e501d {"document":"4.2.2.7.99"}  5ae70cb625d2b310 {"document":"4.2.3.99"}
9991445042f2f70d {"document":"4.2.3.1.99"}  8ea8f530fc3a2383 {"document":"4.2.3.2.99"}  4f8ec712c28209ca {"document":"4.2.3.3.99"}
743548870785b487 {"document":"4.2.3.4.99"}  20eefec8846d9740 {"document":"4.2.3.5.99"}  f6995a522745297c {"document":"4.2.3.6.99"}
4344e7c092bfff2e {"document":"4.2.3.7.99"}  1c61551e3bb50e29 {"document":"4.3.99"}  8122d9b2538c3b63 {"document":"5.99"}
f209b3f4c95ff644 {"document":"5.1.99"}  5ed000dd0af6a941 {"document":"5.2.99"}  a11e771283824702 {"document":"5.3.99"}
cd94d42cc1d48e08 {"document":"5.3.1.99"}  d1c481c6a617cf97 {"document":"5.3.2.99"}  a2d45239931bec31 {"document":"5.3.3.99"}
63802ebd2e82d7ed {"document":"5.3.4.99"}  592bfdfa5e0d8c10 {"document":"5.3.5.99"}  5d16fc71d0d38f99 {"document":"5.3.5.1.99"}
30d1774f08827752 {"document":"5.3.5.2.99"}  efcd4f4d540869e4 {"document":"5.3.5.3.99"}  c419526dcaa64c0b {"document":"5.3.5.4.99"}
4623934792d5358b {"document":"5.3.6.99"}  b82b8fbfbac5ecc2 {"document":"5.3.7.99"}  5a96e5bcb5a77a19 {"document":"5.4.99"}
71b33c210c74a17c {"document":"3.2.s.4"}  b87f32b2e555bc51 {"document":" 2.7.3 "}  18cd2f57f09a4cca {"document":"pre_ind_meeting"}
18cd2f57f09a4cca {"document":"PRE_IND_MEETING"}  b48ae803b451fd21 {"document":"end_of_phase_2_meeting"}  b48ae803b451fd21 {"document":"END_OF_PHASE_2_MEETING"}
cb74a88c8b3007da {"document":"pre_nda_meeting"}  cb74a88c8b3007da {"document":"PRE_NDA_MEETING"}  40c16c69383b3b0a {"document":"pre_bla_meeting"}
40c16c69383b3b0a {"document":"PRE_BLA_MEETING"}  db6ec28d12a9029a {"document":"ind_initial"}  db6ec28d12a9029a {"document":"IND_INITIAL"}
9b6e41b27a68cacc {"document":"ind_protocol_amendment"}  9b6e41b27a68cacc {"document":"IND_PROTOCOL_AMENDMENT"}  d493f5903aa46c0c {"document":"ind_information_amendment"}
d493f5903aa46c0c {"document":"IND_INFORMATION_AMENDMENT"}  fd97f5fd4c09b3a5 {"document":"ind_cmc_amendment"}  fd97f5fd4c09b3a5 {"document":"IND_CMC_AMENDMENT"}
101d3437c313c5b5 {"document":"ind_response_to_clinical_hold"}  101d3437c313c5b5 {"document":"IND_RESPONSE_TO_CLINICAL_HOLD"}  b0c9d1c4b6c26066 {"document":"ind_safety_report"}
b0c9d1c4b6c26066 {"document":"IND_SAFETY_REPORT"}  f496ca901840406a {"document":"ind_annual_report"}  f496ca901840406a {"document":"IND_ANNUAL_REPORT"}
0dbb6e1f372a036b {"document":"dsur"}  0dbb6e1f372a036b {"document":"DSUR"}  cabbb8c22a3647ff {"document":"nda_bla_annual_report"}
cabbb8c22a3647ff {"document":"NDA_BLA_ANNUAL_REPORT"}  3fe9f88c24392cbd {"document":"nda"}  3fe9f88c24392cbd {"document":"NDA"}
1fd87f7eb1e661f5 {"document":"bla"}  1fd87f7eb1e661f5 {"document":"BLA"}  7e25192cdea757ae {"document":"nda_pas"}
7e25192cdea757ae {"document":"NDA_PAS"}  96990427db91e661 {"document":"cbe_30"}  96990427db91e661 {"document":"CBE_30"}
e3db07f73d9464cf {"document":"cbe_0"}  e3db07f73d9464cf {"document":"CBE_0"}  79e3541f0604db3e {"document":"iss"}
79e3541f0604db3e {"document":"ISS"}  d689c72b125305be {"document":"ise"}  d689c72b125305be {"document":"ISE"}
176c058cf3810b76 {"document":"csr"}  7437010924e1da0a {"document":"csr","section":"12.2"}  a21d12ad27f75da4 {"document":"csr","section":"99.9"}
176c058cf3810b76 {"document":"CSR"}  7437010924e1da0a {"document":"CSR","section":"12.2"}  a21d12ad27f75da4 {"document":"CSR","section":"99.9"}
176c058cf3810b76 {"document":"clinical study report"}  7437010924e1da0a {"document":"clinical study report","section":"12.2"}  a21d12ad27f75da4 {"document":"clinical study report","section":"99.9"}
176c058cf3810b76 {"document":"Clinical_Study_Report"}  7437010924e1da0a {"document":"Clinical_Study_Report","section":"12.2"}  a21d12ad27f75da4 {"document":"Clinical_Study_Report","section":"99.9"}
176c058cf3810b76 {"document":"e3"}  7437010924e1da0a {"document":"e3","section":"12.2"}  a21d12ad27f75da4 {"document":"e3","section":"99.9"}
176c058cf3810b76 {"document":"ICH E3"}  7437010924e1da0a {"document":"ICH E3","section":"12.2"}  a21d12ad27f75da4 {"document":"ICH E3","section":"99.9"}
176c058cf3810b76 {"document":" csr "}  7437010924e1da0a {"document":" csr ","section":"12.2"}  a21d12ad27f75da4 {"document":" csr ","section":"99.9"}
ab82177b24f6aac4 {"document":"csr","section":"1"}  2e7d1686e60856ad {"document":"csr","section":"2"}  4d626463bb07c59e {"document":"csr","section":"3"}
41e12eb815eebaf9 {"document":"csr","section":"4"}  93e5c7e452b7c558 {"document":"csr","section":"5"}  6d1b7f00690e2cef {"document":"csr","section":"5.1"}
13a5c3314acdeb24 {"document":"csr","section":"5.2"}  31ae51219498075a {"document":"csr","section":"5.3"}  012a2f22099430c6 {"document":"csr","section":"6"}
c309f041cebf83f8 {"document":"csr","section":"7"}  6df0c7b164f43332 {"document":"csr","section":"8"}  dfcc69702599b494 {"document":"csr","section":"9"}
48bcce0d30b5463a {"document":"csr","section":"9.1"}  73d0ccb2e0c3b1bb {"document":"csr","section":"9.2"}  1c82ba6d23b265bc {"document":"csr","section":"9.3"}
cd8e2d04dc1a569a {"document":"csr","section":"9.3.1"}  f954590e17f2132b {"document":"csr","section":"9.3.2"}  2c17be0bab3eee99 {"document":"csr","section":"9.3.3"}
b259ae1afa3f52e7 {"document":"csr","section":"9.4"}  df4e559eb2ab2a5f {"document":"csr","section":"9.4.1"}  86ddaed5a9b623c8 {"document":"csr","section":"9.4.2"}
6502660031b37e18 {"document":"csr","section":"9.4.3"}  a249ff23413e7ade {"document":"csr","section":"9.4.4"}  55eaa9db8026f545 {"document":"csr","section":"9.4.5"}
36e10e70d52ae443 {"document":"csr","section":"9.4.6"}  c73b69b73f8ba021 {"document":"csr","section":"9.4.7"}  5e75b19936afef6f {"document":"csr","section":"9.4.8"}
d3f4a4fc929b43d2 {"document":"csr","section":"9.5"}  2ab09bd6ef717664 {"document":"csr","section":"9.5.1"}  edf49a5142ce4162 {"document":"csr","section":"9.5.2"}
7751f5a6c5dd7f5c {"document":"csr","section":"9.5.3"}  3851f61a907a5e8b {"document":"csr","section":"9.5.4"}  bb1686c08e36b564 {"document":"csr","section":"9.6"}
a3f3a6345ca3d86d {"document":"csr","section":"9.7"}  372cd1923cb3beaa {"document":"csr","section":"9.7.1"}  13f6d6da19b8ece7 {"document":"csr","section":"9.7.2"}
44381d3cee30160b {"document":"csr","section":"9.8"}  ca6d7acfde682ae6 {"document":"csr","section":"10"}  b1a51a43ae7a2c16 {"document":"csr","section":"10.1"}
61bd33a55842b2f1 {"document":"csr","section":"10.2"}  948b01a668085192 {"document":"csr","section":"11"}  ac5d46bfe2a26640 {"document":"csr","section":"11.1"}
01ac3a6c4734641c {"document":"csr","section":"11.2"}  239db409bd27b443 {"document":"csr","section":"11.3"}  00d6cc361dcf1850 {"document":"csr","section":"11.4"}
ab5c7ab1e475508c {"document":"csr","section":"11.4.1"}  af061f3cc958e7e5 {"document":"csr","section":"11.4.2"}  ca8df2b02e73b46b {"document":"csr","section":"11.4.2.1"}
80f458d7f5778857 {"document":"csr","section":"11.4.2.2"}  677d18ade8498263 {"document":"csr","section":"11.4.2.3"}  78c96ff0ea03375c {"document":"csr","section":"11.4.2.4"}
267baace994efc9b {"document":"csr","section":"11.4.2.5"}  72647c894b98f2f6 {"document":"csr","section":"11.4.2.6"}  3af7241d2a3f2655 {"document":"csr","section":"11.4.2.7"}
283c4f761f58a267 {"document":"csr","section":"11.4.2.8"}  b8f43bebe5b95cf2 {"document":"csr","section":"11.4.3"}  ab5f82257d673f76 {"document":"csr","section":"11.4.4"}
df29d98e4f78d9df {"document":"csr","section":"11.4.5"}  a61e415838b59f04 {"document":"csr","section":"11.4.6"}  d44ac9d72f4eeadc {"document":"csr","section":"11.4.7"}
208fc22b9dbcecf6 {"document":"csr","section":"12"}  d10bf2c0d92839e3 {"document":"csr","section":"12.1"}  d7f61c0ff3b3210b {"document":"csr","section":"12.2.1"}
d5b4b1f0048bd7d5 {"document":"csr","section":"12.2.2"}  87b8984d45d828eb {"document":"csr","section":"12.2.3"}  f4d377fa230077b4 {"document":"csr","section":"12.2.4"}
e5654fec7f407f33 {"document":"csr","section":"12.3"}  0c3f066c84902e57 {"document":"csr","section":"12.3.1"}  38712a7d1958f36f {"document":"csr","section":"12.3.1.1"}
71dbc6f04b128d43 {"document":"csr","section":"12.3.1.2"}  5bf28a5001083da4 {"document":"csr","section":"12.3.1.3"}  8eb27e7190842ff8 {"document":"csr","section":"12.3.2"}
472b6e985a17ed74 {"document":"csr","section":"12.3.3"}  8fcc6d9d7d3e3230 {"document":"csr","section":"12.4"}  3926ac40c828bc67 {"document":"csr","section":"12.4.1"}
aa93526c039d28b7 {"document":"csr","section":"12.4.2"}  f2084fd642472be5 {"document":"csr","section":"12.4.2.1"}  5a6a52a417d78507 {"document":"csr","section":"12.4.2.2"}
c6f11983964f6841 {"document":"csr","section":"12.4.2.3"}  101cdc9db8ef0928 {"document":"csr","section":"12.5"}  fddc60c93277befe {"document":"csr","section":"12.6"}
566cb465bad35586 {"document":"csr","section":"13"}  02c973ee527351fb {"document":"csr","section":"14"}  6c79ba735508c1ca {"document":"csr","section":"14.1"}
0be7c9aff4291250 {"document":"csr","section":"14.2"}  1f025864991ed654 {"document":"csr","section":"14.3"}  df414b09291427a4 {"document":"csr","section":"14.3.1"}
c538ba30d42cbf37 {"document":"csr","section":"14.3.2"}  bf0fdf211e750fff {"document":"csr","section":"14.3.3"}  ca1bcea7523d7a52 {"document":"csr","section":"14.3.4"}
bcc201c3427b1494 {"document":"csr","section":"15"}  19e0488ac710e739 {"document":"csr","section":"16"}  f3d5ef49c239b7fd {"document":"csr","section":"16.1"}
fda28b95e5183b03 {"document":"csr","section":"16.1.1"}  a61e747f98d18223 {"document":"csr","section":"16.1.2"}  f61b94b430af7a9e {"document":"csr","section":"16.1.3"}
c85b998830e8592c {"document":"csr","section":"16.1.4"}  e90474baec998f11 {"document":"csr","section":"16.1.5"}  40f02f3b76432a67 {"document":"csr","section":"16.1.6"}
b1f57f8af456640c {"document":"csr","section":"16.1.7"}  b4f5daee30accf16 {"document":"csr","section":"16.1.8"}  2b48e342b8b92305 {"document":"csr","section":"16.1.9"}
a1c0a527969e6594 {"document":"csr","section":"16.1.10"}  c83fc53a23bf8e2d {"document":"csr","section":"16.1.11"}  740e5212f3a02793 {"document":"csr","section":"16.1.12"}
2b14a76f86a14c29 {"document":"csr","section":"16.2"}  b9de12c431283619 {"document":"csr","section":"16.2.1"}  8f5333cf8409d23b {"document":"csr","section":"16.2.2"}
d7798332af27dd44 {"document":"csr","section":"16.2.3"}  3b7f99d5d5c24451 {"document":"csr","section":"16.2.4"}  0a448f9c2ca59f5d {"document":"csr","section":"16.2.5"}
24f3fd57d9bc5158 {"document":"csr","section":"16.2.6"}  1ee7ec401624992f {"document":"csr","section":"16.2.7"}  1ef11a0577697e16 {"document":"csr","section":"16.2.8"}
7602e727296c9374 {"document":"csr","section":"16.3"}  75fe1023a0c71025 {"document":"csr","section":"16.3.1"}  b88469d325da4e13 {"document":"csr","section":"16.3.2"}
994ce625c10ee3ca {"document":"csr","section":"16.4"}  2edb580827a4ad4f {"document":"9.9.9"}  02cbae3d340f255a {"document":"1.3.1"}
4a7b88e7b2a831fe {"document":"1.8"}  354109ebd3917f0e {"document":"1.8.2"}  44eb297a5c0dae66 {"document":"1.10"}
acabd1efd82843e8 {"document":"1.13"}  43facbea9cef5487 {"document":"maa"}  4e2cf094836bdf42 {"document":"eu_maa"}
af87fb391604b8e9 {"document":"EU_MAA"}  665f243873573cc5 {"document":"jnda"}  fbe5618825ec6b9a {"document":"510k"}
58d30c630ae0763d {"document":"pma"}  c16672e802de2de0 {"document":"cer"}  246afc6648a04aa9 {"document":"per"}
8a4b446629f32eec {"document":"smpc"}  226adf707d6bc7d4 {"document":"II.6.1"}  f5e754bfaf04d704 {"document":"jp_shonin"}
200ccc3606e94565 {"document":"Totally Fabricated Section 99"}  c74dff821f3b31c3 {"document":"clinical-study-report"}  48ca51b230370a51 {"document":"ich-e3"}
3769cfe421797856 {"document":"m9"}  176c058cf3810b76 {"document":"csr","section":""}  b87f32b2e555bc51 {"document":"2.7.3","section":"12.2"}
887533ba3fdd848b {"document":""}  887533ba3fdd848b {"document":42}  887533ba3fdd848b {}
409d9f3b219d98f0 {"document":"3.2.P.2.1"}  88db3f53d2014d67 {"document":"3.2.P.2.1.1"}  84ddf9feb7b828cc {"document":"3.2.P.2.1.2"}
94941c1bdab579a2 {"document":"3.2.P.2.2"}  0e77ca0987080d71 {"document":"3.2.P.2.2.1"}  849f182e1f51224d {"document":"3.2.P.2.2.2"}
1a07a3be6eb7ed2d {"document":"3.2.P.2.2.3"}  d405bd7e4e2158a9 {"document":"3.2.P.2.3"}  360072e2350fdcab {"document":"3.2.P.2.4"}
c25b2f87a8dc20df {"document":"3.2.P.2.5"}  21f14641359025cf {"document":"3.2.P.2.6"}  a6d79fed505eb217 {"document":"3.2.S.1.1"}
938c08fe7cfdabb3 {"document":"3.2.S.1.2"}  60b8a40682ea2b29 {"document":"3.2.S.1.3"}  409d9f3b219d98f0 {"document":"m3.2.P.2.1"}
88db3f53d2014d67 {"document":"m3.2.P.2.1.1"}  84ddf9feb7b828cc {"document":"m3.2.P.2.1.2"}  94941c1bdab579a2 {"document":"m3.2.P.2.2"}
0e77ca0987080d71 {"document":"m3.2.P.2.2.1"}  849f182e1f51224d {"document":"m3.2.P.2.2.2"}  1a07a3be6eb7ed2d {"document":"m3.2.P.2.2.3"}
d405bd7e4e2158a9 {"document":"m3.2.P.2.3"}  360072e2350fdcab {"document":"m3.2.P.2.4"}  c25b2f87a8dc20df {"document":"m3.2.P.2.5"}
21f14641359025cf {"document":"m3.2.P.2.6"}  a6d79fed505eb217 {"document":"m3.2.S.1.1"}  938c08fe7cfdabb3 {"document":"m3.2.S.1.2"}
60b8a40682ea2b29 {"document":"m3.2.S.1.3"}  e3dd9918f659ed80 {"document":"3.2.P.2.1.99"}  480d6f5aed9184bf {"document":"3.2.P.2.1.1.99"}
eebf037b55223ee9 {"document":"3.2.P.2.1.2.99"}  001310d4d19b1212 {"document":"3.2.P.2.2.99"}  ade719ae70a9b6d4 {"document":"3.2.P.2.2.1.99"}
c826abdfc4ea65fd {"document":"3.2.P.2.2.2.99"}  b6dc1d0560a80f2f {"document":"3.2.P.2.2.3.99"}  bca5e25b9f1882f4 {"document":"3.2.P.2.3.99"}
e1d20ceac78d2ad4 {"document":"3.2.P.2.4.99"}  0025305eb13f2a4b {"document":"3.2.P.2.5.99"}  c4ef802111b77bed {"document":"3.2.P.2.6.99"}
0f2b05c0528442e5 {"document":"3.2.S.1.1.99"}  387f3662b3a39c31 {"document":"3.2.S.1.2.99"}  cb2b762715eb6313 {"document":"3.2.S.1.3.99"}

338fb72654728cb1 {"document":"2.6.2.1"}
ee69589c3ac2b062 {"document":"2.6.2.2"}
c6a8be3cade5ea23 {"document":"2.6.2.3"}
e7d51105369ddd8b {"document":"2.6.2.4"}
a4b06c1a219913ef {"document":"2.6.2.5"}
cc3fffab698d16a5 {"document":"2.6.2.6"}
f5600f9aea81b9c7 {"document":"2.6.2.7"}
338fb72654728cb1 {"document":"m2.6.2.1"}
ee69589c3ac2b062 {"document":"m2.6.2.2"}
c6a8be3cade5ea23 {"document":"m2.6.2.3"}
e7d51105369ddd8b {"document":"m2.6.2.4"}
a4b06c1a219913ef {"document":"m2.6.2.5"}
cc3fffab698d16a5 {"document":"m2.6.2.6"}
f5600f9aea81b9c7 {"document":"m2.6.2.7"}
94c05744c3f29c70 {"document":"2.6.2.1.99"}
25a71ea4c8463952 {"document":"2.6.2.2.99"}
508d5c442a66680e {"document":"2.6.2.3.99"}
0ab2d19842272f17 {"document":"2.6.2.4.99"}
1ce8834da9bc0958 {"document":"2.6.2.5.99"}
c3569e0bebd0ad65 {"document":"2.6.2.6.99"}
3db3c63cca1e373d {"document":"2.6.2.7.99"}
1b6cea057a6e1e1c {"document":"us_type_d_meeting"}
1b6cea057a6e1e1c {"document":"US_TYPE_D_MEETING"}
6280d567c7f2db90 {"document":"us_interact_meeting"}
6280d567c7f2db90 {"document":"US_INTERACT_MEETING"}
5f385d0bec4bdba3 {"document":"expanded_access_individual"}
5f385d0bec4bdba3 {"document":"EXPANDED_ACCESS_INDIVIDUAL"}
464febf279a46a3f {"document":"expanded_access_intermediate"}
464febf279a46a3f {"document":"EXPANDED_ACCESS_INTERMEDIATE"}
e737bae2006345ec {"document":"expanded_access_treatment"}
e737bae2006345ec {"document":"EXPANDED_ACCESS_TREATMENT"}
8f544ae468eebaa8 {"document":"us_bla_annual_report"}
8f544ae468eebaa8 {"document":"US_BLA_ANNUAL_REPORT"}
de9f5aef52b81026 {"document":"us_bla_pediatric_annual_report"}
de9f5aef52b81026 {"document":"US_BLA_PEDIATRIC_ANNUAL_REPORT"}
fb7e2fa33a306323 {"document":"us_bla_pmr_status_report"}
fb7e2fa33a306323 {"document":"US_BLA_PMR_STATUS_REPORT"}
6fe5731264436cdc {"document":"us_bla_distribution_report"}
6fe5731264436cdc {"document":"US_BLA_DISTRIBUTION_REPORT"}
b00363d39e1e4d14 {"document":"us_bpdr"}
b00363d39e1e4d14 {"document":"US_BPDR"}
50e0de66dacfc0cc {"document":"us_bla_periodic_adverse_experience_report"}
50e0de66dacfc0cc {"document":"US_BLA_PERIODIC_ADVERSE_EXPERIENCE_REPORT"}
7dcf28b876a2a50a {"document":"us_bla_pas"}
7dcf28b876a2a50a {"document":"US_BLA_PAS"}
7acc47c4c2059050 {"document":"us_bla_cbe_30"}
7acc47c4c2059050 {"document":"US_BLA_CBE_30"}
b77e00eaaac3ae23 {"document":"us_bla_cbe_0"}
b77e00eaaac3ae23 {"document":"US_BLA_CBE_0"}
c7330e9d17a3e2ce {"document":"us_cber_master_file"}
c7330e9d17a3e2ce {"document":"US_CBER_MASTER_FILE"}
0f7d9437f749a4dc {"document":"us_cber_lot_release"}
0f7d9437f749a4dc {"document":"US_CBER_LOT_RELEASE"}
60fc65f9b343b055 {"document":"us_eua_therapeutic"}
60fc65f9b343b055 {"document":"US_EUA_THERAPEUTIC"}
`;

const PINNED: Record<string, string> = Object.fromEntries(
  [...PINNED_TABLE.matchAll(/([0-9a-f]{16}) (\{[^}]*\})/g)].map((m) => [m[2], m[1]]),
);
