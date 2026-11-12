/**
 * Cross-client vault taxonomy + eTMF alignment tests.
 *
 * Covers:
 *   - ONE TMF reference model. shared/constants/domain/tmf-reference-model.ts
 *     is the catalog; tmf-completeness.ts, etmf-logic.ts, the vault's TMF
 *     folders and the eTMF screen read it. Until 2026-10-30 it existed five
 *     times (design ETMF_CONVERGENCE_2026-10-30, slice E1), this guard
 *     compared zone NUMBERS only, and zone 4 was spelled two ways. The guard
 *     now compares numbers and names, requires the server catalog to be the
 *     shared object itself, and scans the source for a re-added copy.
 *     2026-11-10 (the review of E1): the scan read server, shared and
 *     client/src only, .ts/.js only, and looked only for this catalog's own
 *     names, so the seven "abridged" zones in gcp-operations-reference.ts,
 *     which AnA's plan_essential_documents returned as the TMF's structure,
 *     were a second zone model it could not see. It now reads every tracked
 *     source file, refuses a zone list written out under a TMF-zone name, and
 *     holds the essential-documents library to the catalog's zones and to the
 *     classifier's answer for the same document.
 *   - vault-taxonomy view integrity: every view has folders, doc kinds,
 *     and filing frameworks; ids unique; legacy filter ids preserved
 *   - the service-org rule: product owners map to their segment, CROs and
 *     other service orgs get the cross-sponsor TMF view
 *   - the eTMF seed skeleton: pure derivation from the reference model,
 *     essential-drives-completeness invariant
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import * as SHARED_CATALOG from '../../../shared/constants/domain/tmf-reference-model';
import {
  TMF_ZONE_REFS,
  tmfZoneById,
  tmfZoneByNumber,
} from '../../../shared/constants/domain/tmf-reference-model';
import {
  VAULT_VIEWS,
  VAULT_DOC_KINDS,
  VAULT_FILING_TYPES,
  VAULT_FOLDER_PRESETS,
  docKindsForView,
  filingTypesForView,
  foldersForView,
  vaultViewForOrganization,
  type VaultViewId,
} from '../../../shared/constants/domain/vault-taxonomy';
import { TMF_ZONES, classifyArtifact, zoneName } from '../etmf/etmf-logic';
import { TMF_REFERENCE_MODEL, getTmfReferenceModel, seedArtifacts } from '../etmf/tmf-completeness';
import { planEssentialDocuments } from '../gcp-operations/gcp-operations-knowledge';
import * as GCP_REFERENCE from '../gcp-operations/gcp-operations-reference';

// ─────────────────────────────────────────────────────────────────────────────
// Drift guard: one TMF reference model
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CATALOG_FILE = 'shared/constants/domain/tmf-reference-model.ts';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
/** The repository's own definition of a test file (scripts/ci/check-one-design-plan.mjs TEST_FILE). */
const TEST_FILE = /(^|\/)(__tests__|__mocks__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$|\.fixture\.[cm]?[jt]s$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

/**
 * Every tracked source file that is not a test or a document: code and JSON,
 * in every root (server, shared, client, scripts, services, …). Without git
 * (an exported tree), the roots that hold product code are walked instead.
 */
let SOURCE_FILES: string[] | undefined;
function sourceFiles(): string[] {
  if (SOURCE_FILES) return SOURCE_FILES;
  let tracked: string[];
  try {
    tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\n');
  } catch {
    tracked = ['server', 'shared', 'client', 'scripts', 'services'].filter(d => fs.existsSync(path.join(ROOT, d))).flatMap(d => walk(d));
  }
  SOURCE_FILES = tracked.filter(f => SOURCE_FILE.test(f) && !TEST_FILE.test(f) && !f.startsWith('docs/') && f !== 'package-lock.json'
    && fs.existsSync(path.join(ROOT, f)));
  return SOURCE_FILES;
}

/**
 * The source with its comments removed and its strings kept: a name quoted in
 * prose is not a catalog. One pass that reads a string before it can read a
 * comment, so the slash-star inside a route glob ('server/routes/*.ts') does
 * not open one. (2026-10-30: a block-comment pattern, which that glob fooled.
 * 2026-11-10: whole comment lines, which dropped a row written after an inline
 * comment and kept a block comment whose lines do not start with a star.
 * 2026-11-12: a regular expression such as /\/*$/ opened a comment.)
 * Still beyond it: a slash-star in JSX text, which no file has today.
 */
const withoutComments = (src: string) =>
  src.replace(
    // A regular-expression literal (after an operator, an opening bracket or a line start), then a string, are kept;
    // then a block comment and a line comment are dropped.
    /((?<=(?:^|[(,=:[!&|?{};\n])[ \t]*)\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[a-z]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_m, kept) => kept ?? '',
  );

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The two files whose `catalogArtifact: '<code>'` fields are references to the catalog, each held to resolve by a test below. */
const CATALOG_REFERENCES = new Set([
  'server/services/gcp-operations/gcp-operations-reference.ts',
  'server/services/gcp-operations/gcp-operations-knowledge.ts',
]);

/** A source file as the scans read it: JSON whole, code without comments. */
function scanned(f: string): string {
  if (f.endsWith('.json')) return read(f);
  const code = withoutComments(read(f));
  return CATALOG_REFERENCES.has(f) ? code.replace(/\bcatalogArtifact: '[^']*'/g, '') : code;
}

/** Which of `literals` each source file carries as a quoted string literal (JSON: any string). */
function literalsByFile(literals: string[]): Map<string, Set<string>> {
  const quoted = new RegExp(`(['"\`])(${literals.map(escapeRe).sort((x, y) => y.length - x.length).join('|')})\\1`, 'g');
  const out = new Map<string, Set<string>>();
  for (const f of sourceFiles()) {
    const found = new Set<string>();
    for (const m of scanned(f).matchAll(quoted)) found.add(m[2]);
    if (found.size) out.set(f, found);
  }
  return out;
}

/**
 * Files that may spell out part of the catalog, each with the reason. An entry
 * is checked: it must still excuse a file that is over a threshold, so the list
 * cannot outlive what it excuses.
 */
const ALLOWED_TO_SPELL_OUT_THE_CATALOG: Record<string, string> = {};

/**
 * The files that spell out the catalog. A copy is a non-test source file, other
 * than the catalog, whose code spells out, as string literals, three or more
 * zone names, five or more artifact names or six or more artifact codes THAT
 * ARE THE CATALOG'S OWN.
 *
 * A literal that three or more other files use ('protocol', 'sap',
 * 'Regulatory', "Investigator's Brochure") is ordinary vocabulary: counting
 * those, a document-type union or a list of five plans would be refused as a
 * catalog. Only a file that is itself under every threshold counts as such a
 * user. Otherwise three copies make each other's literals "ordinary" and all
 * three pass, which is the very case this guard was written for (the review
 * of 2026-11-11 planted three and saw them pass).
 *
 * Measured 2026-10-30, before the convergence: the three copies carried 10–11
 * zone names, and two of them 41/41 artifacts. Measured 2026-11-10 over every
 * tracked source file: nothing is within two of a threshold.
 */
function catalogCopies(): { copies: string[]; excused: string[] } {
  const zones = TMF_REFERENCE_MODEL.map(z => z.name);
  const artifacts = TMF_REFERENCE_MODEL.flatMap(z => z.artifacts);
  const names = artifacts.map(a => a.name);
  const codes = artifacts.map(a => a.code);
  const carried = literalsByFile([...zones, ...names, ...codes]);
  carried.delete(CATALOG_FILE);

  const over = (found: Set<string>, counts: (l: string) => boolean) =>
    zones.filter(l => found.has(l) && counts(l)).length >= 3
    || names.filter(l => found.has(l) && counts(l)).length >= 5
    || codes.filter(l => found.has(l) && counts(l)).length >= 6;

  const users = new Map<string, number>();
  for (const found of carried.values()) {
    if (over(found, () => true)) continue;
    for (const l of found) users.set(l, (users.get(l) ?? 0) + 1);
  }
  const own = (l: string) => (users.get(l) ?? 0) < 3;

  const copies: string[] = [];
  const excused: string[] = [];
  for (const [f, found] of carried) {
    if (!over(found, own)) continue;
    if (f in ALLOWED_TO_SPELL_OUT_THE_CATALOG) excused.push(f);
    else copies.push(f);
  }
  return { copies: copies.sort(), excused };
}

/** Files that may write out a TMF zone list, each with the reason; checked like the allow-list above. */
const ALLOWED_TO_DECLARE_A_ZONE_LIST: Record<string, string> = {};

/**
 * Files that write out a TMF zone list under a TMF-zone name. The name: an
 * identifier that holds "tmf" and then "zone" (TMF_ZONES, tmfZones,
 * TMF_ZONE_NAMES, TmfZoneName) or "zones" and then "tmf", or the catalog's own
 * export names. The list: a constant or a property given an array or object
 * literal that holds a string, bare or inside a bracket, Object.freeze, a Map
 * or a Set; an enum or a string-union type of that name; or such a key in JSON.
 * Not one: a list derived from the catalog (`TMF_REFERENCE_MODEL.map(...)`), an
 * empty accumulator, a spread, and the field `tmfZone` given a number or passed
 * as a prop. Beyond this check, by its nature: a zone list under an unrelated
 * name, a class member called `zones`, a function that returns the list. The
 * name scan catches those when they use the catalog's zone names.
 */
function zoneListDeclarations(): { declaring: string[]; excused: string[] } {
  const name = String.raw`(?:\w*tmf\w*zone\w*|\w*zones?\w*tmf\w*|TMF_REFERENCE_MODEL|TMF_STRUCTURE)`;
  const literal = String.raw`(?:\(\s*|Object\.freeze\(\s*|deepFreeze\(\s*|z\.enum\(\s*|new (?:Map|Set)(?:<[^>]*>)?\(\s*)*[\[{][^\]}]*?['"\x60]`;
  const annotation = String.raw`(?::[^=;(){}]*(?:\{[^{}]*\}[^=;(){}]*)*)?`;
  const inCode = [
    new RegExp(String.raw`\b${name}\b\s*${annotation}=\s*${literal}`, 'i'),
    new RegExp(String.raw`\b${name}\b\s*:\s*${literal}`, 'i'),
    new RegExp(String.raw`\b(?:enum|type)\s+${name}\b[^=;{]*[={][^;}]*?['"\x60]`, 'i'),
  ];
  const inJson = [new RegExp(String.raw`"${name}"\s*:\s*[\[{][^\]}]*?"`, 'i')];
  const declaring: string[] = [];
  const excused: string[] = [];
  for (const f of sourceFiles()) {
    if (f === CATALOG_FILE) continue;
    const text = scanned(f);
    if (!(f.endsWith('.json') ? inJson : inCode).some(re => re.test(text))) continue;
    (f in ALLOWED_TO_DECLARE_A_ZONE_LIST ? excused : declaring).push(f);
  }
  return { declaring: declaring.sort(), excused };
}

/** Runs `check` with `files` (name → content) present as source files, in a throwaway folder that is then removed. */
function withProbeFiles<T>(files: Record<string, string>, check: (rel: (name: string) => string) => T): T {
  const dir = fs.mkdtempSync(path.join(ROOT, 'server/services/etmf/.drift-guard-probe-'));
  const rel = (name: string) => path.relative(ROOT, path.join(dir, name));
  try {
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
    SOURCE_FILES = [...sourceFiles(), ...Object.keys(files).map(rel)];
    return check(rel);
  } finally {
    SOURCE_FILES = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('one TMF reference model (drift guard)', () => {
  it('the server completeness catalog IS the shared catalog object, not a copy of it', () => {
    expect(SHARED_CATALOG.TMF_REFERENCE_MODEL, `${CATALOG_FILE} exports no TMF_REFERENCE_MODEL`).toBeDefined();
    expect(TMF_REFERENCE_MODEL).toBe(SHARED_CATALOG.TMF_REFERENCE_MODEL);
    expect(getTmfReferenceModel()).toBe(SHARED_CATALOG.TMF_REFERENCE_MODEL);
  });

  it('zone numbers AND names are the same in every consumer', () => {
    const catalog = TMF_REFERENCE_MODEL.map(z => ({ zone: z.number, name: z.name }));
    expect(catalog.map(z => z.zone)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(TMF_ZONE_REFS.map(z => ({ zone: z.zone, name: z.name })), 'TMF_ZONE_REFS').toEqual(catalog);
    expect(TMF_ZONES.map(z => ({ zone: z.zone, name: z.name })), 'etmf-logic TMF_ZONES').toEqual(catalog);
    for (const z of catalog) expect(zoneName(z.zone), `etmf-logic zoneName(${z.zone})`).toBe(z.name);
    const serviceFolders = foldersForView('service');
    for (const z of TMF_ZONE_REFS) {
      expect(serviceFolders.find(f => f.id === z.id)?.label, `vault service folder ${z.id}`).toBe(z.name);
    }
  });

  it('resolves zones by id and number consistently', () => {
    for (const z of TMF_ZONE_REFS) {
      expect(tmfZoneById(z.id)).toEqual(z);
      expect(tmfZoneByNumber(z.zone)).toEqual(z);
      expect(z.name).toBe(zoneName(z.zone));
    }
  });

  it('the server catalogs import the shared one', () => {
    const fromShared = /from '\.\.\/\.\.\/\.\.\/shared\/constants\/domain\/tmf-reference-model(?:\.js)?'/;
    const files = ['server/services/etmf/tmf-completeness.ts', 'server/services/etmf/etmf-logic.ts'];
    expect(files.filter(f => !fromShared.test(read(f))), `files that do not import ${CATALOG_FILE}`).toEqual([]);
  });

  /* If the scan read nothing, every check below would pass. So: it reads the
     files it must, a few thousand of them, and it would refuse the catalog
     itself were the catalog not the one file it leaves out. */
  it('the scan reads the source it is meant to', () => {
    const files = sourceFiles();
    for (const f of [CATALOG_FILE, 'server/services/etmf/etmf-logic.ts', 'server/services/gcp-operations/gcp-operations-reference.ts',
      'client/src/concept2cure/v2/surfaces/Etmf.tsx', 'scripts/db/migration-set.mjs', 'package.json']) {
      expect(files, `the scan reads ${f}`).toContain(f);
    }
    expect(files.length).toBeGreaterThan(3000);
    expect(files.filter(f => TEST_FILE.test(f) || f.startsWith('docs/')), 'tests and documents are not scanned').toEqual([]);
    const catalog = TMF_REFERENCE_MODEL.flatMap(z => [z.name, ...z.artifacts.flatMap(a => [a.name, a.code])]);
    expect(literalsByFile(catalog).get(CATALOG_FILE)?.size, 'catalog literals the scan finds in the catalog file').toBe(new Set(catalog).size);
  }, 120_000);

  it('no second catalog exists in any tracked source file', () => {
    const { copies, excused } = catalogCopies();
    expect(copies).toEqual([]);
    expect(Object.keys(ALLOWED_TO_SPELL_OUT_THE_CATALOG).filter(f => !excused.includes(f)), 'allow-list entries that excuse nothing').toEqual([]);
    expect(Object.entries(ALLOWED_TO_SPELL_OUT_THE_CATALOG).filter(([, why]) => why.trim().length < 20).map(([f]) => f), 'allow-list entries with no reason').toEqual([]);
    // It reads every tracked source file (about 5,800): a second or two, against
    // the repository's 10 s test timeout (vitest.config.ts).
  }, 120_000);

  it('no source file writes out a TMF zone list', () => {
    const { declaring, excused } = zoneListDeclarations();
    expect(declaring).toEqual([]);
    expect(Object.keys(ALLOWED_TO_DECLARE_A_ZONE_LIST).filter(f => !excused.includes(f)), 'allow-list entries that excuse nothing').toEqual([]);
    expect(Object.entries(ALLOWED_TO_DECLARE_A_ZONE_LIST).filter(([, why]) => why.trim().length < 20).map(([f]) => f), 'allow-list entries with no reason').toEqual([]);
  }, 120_000);
});

/* The guard itself, shown failing on what it exists to catch and passing on what
   it must not refuse. Each case runs the same functions the two tests above
   run, over the real source files plus the planted ones. */
describe('the drift guard catches what it is for', () => {
  const artifacts = TMF_REFERENCE_MODEL.flatMap(z => z.artifacts);
  const rows = (of: typeof artifacts) => of.map(a => `  { code: '${a.code}', name: ${JSON.stringify(a.name)} },`).join('\n');
  const fullCopy = `export const MY_TMF = [\n${TMF_REFERENCE_MODEL.map(z => `  { zone: ${JSON.stringify(z.name)} },`).join('\n')}\n${rows(artifacts)}\n];\n`;

  it('one copy, three copies that would hide each other, and a copy in JSON', () => {
    const flagged = withProbeFiles({
      'copy-a.ts': fullCopy,
      'copy-b.ts': fullCopy,
      'copy-c.ts': fullCopy,
      'copy.json': JSON.stringify({ artifacts: artifacts.map(a => ({ code: a.code, name: a.name })) }),
    }, rel => ({ got: catalogCopies().copies, want: ['copy-a.ts', 'copy-b.ts', 'copy-c.ts', 'copy.json'].map(rel).sort() }));
    expect(flagged.got).toEqual(flagged.want);
  }, 120_000);

  it('a copy after a glob string, a copy of names only, and rows written after an inline comment', () => {
    const flagged = withProbeFiles({
      'after-a-glob.ts': `const SOURCES = ['server/routes/*.ts'];\nexport const NAMES = [${artifacts.slice(20, 30).map(a => JSON.stringify(a.name)).join(', ')}];\n/** a later comment */\n`,
      'names-only.ts': `export const NAMES = [\n${artifacts.slice(0, 12).map(a => `  ${JSON.stringify(a.name)},`).join('\n')}\n];\n`,
      'inline-comments.ts': `export const ROWS = [\n${artifacts.slice(0, 12).map(a => `  /* zone */ { code: '${a.code}', name: ${JSON.stringify(a.name)} },`).join('\n')}\n];\n`,
      'after-a-regex.ts': `const trim = (s: string) => s.replace(/\\/*$/, '');\nexport const NAMES = [${artifacts.slice(10, 20).map(a => JSON.stringify(a.name)).join(', ')}];\n/** a later comment */\n`,
      'after-a-quote-regex.ts': `const bare = (s: string) => s.replace(/'/g, ''), GLOBS = ['server/routes/*.ts'];\nexport const NAMES = [${artifacts.slice(10, 20).map(a => JSON.stringify(a.name)).join(', ')}];\n/** a later comment */\n`,
    }, rel => ({ got: catalogCopies().copies, want: ['after-a-glob.ts', 'after-a-quote-regex.ts', 'after-a-regex.ts', 'inline-comments.ts', 'names-only.ts'].map(rel).sort() }));
    expect(flagged.got).toEqual(flagged.want);
  }, 120_000);

  it('prose, ordinary vocabulary and a reference to the catalog are not copies', () => {
    const flagged = withProbeFiles({
      'jsdoc.ts': `/**\n${artifacts.slice(0, 12).map(a => ` * '${a.name}'`).join('\n')}\n */\nexport const x = 1;\n`,
      'block-comment.ts': `/*\n${artifacts.slice(0, 12).map(a => `   '${a.name}'`).join('\n')}\n*/\nexport const y = 1;\n`,
      'line-comments.ts': `${artifacts.slice(0, 12).map(a => `// '${a.code}' ${JSON.stringify(a.name)}`).join('\n')}\nexport const z = 1;\n`,
      'vocabulary.ts': `export type DocType = 'protocol' | 'sap' | 'investigators_brochure' | 'irb_submission' | 'regulatory_submission' | 'insurance';\n`,
    }, () => catalogCopies().copies);
    expect(flagged).toEqual([]);
  }, 120_000);

  it('a zone list under a TMF-zone name is refused, however it is written', () => {
    const flagged = withProbeFiles({
      'zone-names.ts': `export const TMF_ZONE_NAMES = ['Trial Management', 'Ethics', 'Safety'];\n`,
      'zones-typed.ts': `export const tmfZones: Array<{ zone: string }> = [{ zone: 'Ethics' }];\n`,
      'zones-typed-over-lines.ts': `export const TMF_ZONES:\n  ReadonlyArray<{\n    zone: string;\n    description: string;\n  }>\n  = [\n  { zone: 'Ethics', description: 'x' },\n];\n`,
      'zones-satisfies.ts': `export const TMF_ZONES = ([\n  { zone: 'Ethics' },\n] satisfies Array<{ zone: string }>);\n`,
      'zones-frozen.ts': `export const TmfZones = Object.freeze(['Ethics', 'Safety']);\nexport const tmfZoneLabels = new Map<number, string>([[1, 'Ethics']]);\n`,
      'zones-property.ts': `export default { tmfZones: ['Ethics', 'Safety'] };\n`,
      'zones-enum.ts': `export enum TmfZones { Ethics = 'Ethics', Safety = 'Safety' }\n`,
      'zones-union.ts': `export type TmfZoneName = 'Ethics' | 'Safety';\n`,
      'zones-other-order.ts': `const ZONES_TMF = ['Ethics', 'Safety'];\nexport default ZONES_TMF;\n`,
      'catalog-names.ts': `export const TMF_STRUCTURE = [{ zone: 'Ethics' }];\nexport const TMF_REFERENCE_MODEL = [{ number: 1, name: 'Ethics', artifacts: [] }];\n`,
      'zones.json': JSON.stringify({ tmfZones: ['Ethics', 'Safety'] }),
    }, rel => ({ got: zoneListDeclarations().declaring, want: [
      'catalog-names.ts', 'zone-names.ts', 'zones-enum.ts', 'zones-frozen.ts', 'zones-other-order.ts', 'zones-property.ts',
      'zones-satisfies.ts', 'zones-typed-over-lines.ts', 'zones-typed.ts', 'zones-union.ts', 'zones.json',
    ].map(rel).sort() }));
    expect(flagged.got).toEqual(flagged.want);
  }, 120_000);

  it('a field, a prop, an empty accumulator, a spread and a derived list are not zone lists', () => {
    const flagged = withProbeFiles({
      'field.tsx': `const tmfZone = d.tmfZone;\nexport const Row = () => <Cell tmfZone={d.tmfZone} />;\nfunction label(tmfZone = 2) { return tmfZone; }\nexport const doc = { tmfZone: 5, tmfZoneName: zone.name, heldBy: ['sponsor'] };\n`,
      'accumulator.ts': `const tmfZones: number[] = [];\nconst seenTmfZones = new Set<number>();\nexport const all = [...tmfZones, ...seenTmfZones];\n`,
      'spread.ts': `export const tmfZones = [...TMF_ZONE_REFS];\nfunction f(tmfZones: string[]) { const out = ['a']; return out.concat(tmfZones); }\n`,
      'derived.ts': `export const TMF_ZONES: Array<{ zone: number; name: string }> = TMF_REFERENCE_MODEL.map((z) => ({ zone: z.number, name: z.name }));\nconst TMF_ZONE_ID = new Map(TMF_ZONE_REFS.map(z => [z.zone, z.id]));\n`,
      'type-only.ts': `export interface Plan { tmfZones: Array<{ zone: number; name: string }>; tmfZone: number }\n`,
    }, () => zoneListDeclarations().declaring);
    expect(flagged).toEqual([]);
  }, 120_000);
});

describe('the essential-documents library sits in the catalog (drift guard)', () => {
  it('places every document in a catalog zone, by number', () => {
    const catalog = new Map(TMF_REFERENCE_MODEL.map(z => [z.number, z.name]));
    const wrong = GCP_REFERENCE.ESSENTIAL_DOCUMENTS.flatMap((d) => {
      const zone: unknown = d.tmfZone;
      if (typeof zone !== 'number' || !catalog.has(zone)) return [`${d.id}: tmfZone ${JSON.stringify(zone)} is not a catalog zone number`];
      return d.tmfZoneName === catalog.get(zone) ? [] : [`${d.id}: tmfZoneName ${JSON.stringify(d.tmfZoneName)}, catalog "${catalog.get(zone)}"`];
    });
    expect(wrong).toEqual([]);
  });

  /* The whole table, so that any move or re-tie is a visible edit here. Without
     it 39 single wrong placements passed every test of this block (the
     confirmation of 2026-11-12): a document with no tie that the classifier says
     nothing about could sit in any zone. The basis of each row is in the
     header of gcp-operations-reference.ts. */
  it('every document sits where the table says, with the tie the table says', () => {
    const PLACED: Record<string, [zone: number, catalogArtifact: string | null]> = {
      'ED-IB': [2, 'investigators_brochure'],
      'ED-PROTOCOL': [2, 'protocol'],
      'ED-CONSENT': [4, null],
      'ED-IRB-APPROVAL': [4, 'irb_approval'],
      'ED-1572': [5, null],
      'ED-CV': [5, 'investigator_cv'],
      'ED-FINANCIAL': [5, 'financial_disclosure'],
      'ED-LAB-CERT': [8, 'lab_certification'],
      'ED-IP-RELEASE': [6, null],
      'ED-RANDOM': [11, 'randomization_plan'],
      'ED-IB-UPDATE': [2, 'investigators_brochure'],
      'ED-IRB-CONTINUING': [4, null],
      'ED-CONSENT-SIGNED': [4, null],
      'ED-SOURCE': [5, null],
      'ED-SAE': [7, 'sae_reports'],
      'ED-MONITORING': [5, null],
      'ED-DELEGATION': [5, 'site_signature_sheet'],
      'ED-IP-ACCOUNT': [6, 'ip_accountability'],
      'ED-DEVIATION': [1, null],
      'ED-IP-RECON': [6, 'ip_destruction'],
      'ED-CLOSEOUT': [1, null],
      'ED-FINAL-IRB': [4, null],
      'ED-DB-LOCK': [10, 'database_lock'],
      'ED-CSR': [2, null],
      'ED-DEVICE-IDE': [3, null],
    };
    const plan = planEssentialDocuments({ usesInvestigationalDevice: true }).documents;
    expect(Object.fromEntries(plan.map(d => [d.id, [d.tmfZone, d.catalogArtifact ?? null]]))).toEqual(PLACED);
  });

  it('a document that is a catalog artifact sits in that artifact\'s zone', () => {
    const tied = planEssentialDocuments({ usesInvestigationalDevice: true }).documents.filter(d => d.catalogArtifact);
    expect(tied.length, 'documents tied to a catalog artifact').toBeGreaterThanOrEqual(10);
    const wrong = tied.flatMap((d) => {
      const found = SHARED_CATALOG.tmfArtifactByCode(d.catalogArtifact as string);
      if (!found) return [`${d.id}: catalogArtifact "${d.catalogArtifact}" is not a catalog code`];
      return found.zone.number === d.tmfZone ? [] : [`${d.id}: zone ${d.tmfZone}, catalog artifact ${d.catalogArtifact} is in zone ${found.zone.number}`];
    });
    expect(wrong).toEqual([]);
  });

  it('a document cannot be given a zone the catalog lacks, or a tie that is wrong', () => {
    const doc = { id: 'ED-X', name: 'x', stage: 'before' as const, heldBy: ['sponsor' as const], purpose: 'p', citation: 'c' };
    expect(() => GCP_REFERENCE.essentialDocument({ ...doc, tmfZone: 12 })).toThrow(/not a TMF Reference Model zone/);
    expect(() => GCP_REFERENCE.essentialDocument({ ...doc, tmfZone: 3, catalogArtifact: 'not_a_catalog_code' })).toThrow(/not a catalog artifact/);
    expect(() => GCP_REFERENCE.essentialDocument({ ...doc, tmfZone: 6, catalogArtifact: 'regulatory_submission' })).toThrow(/zone 3/);
    expect(GCP_REFERENCE.essentialDocument({ ...doc, tmfZone: 3, catalogArtifact: 'regulatory_submission' }).tmfZoneName).toBe('Regulatory');
  });

  it('AnA\'s essential-documents plan returns the catalog\'s zones as the TMF structure, not its own', () => {
    const plan = planEssentialDocuments({ usesInvestigationalDevice: true });
    expect(plan.tmfStructure.map(z => ({ zone: z.zone, name: z.name }))).toEqual(
      TMF_REFERENCE_MODEL.map(z => ({ zone: z.number, name: z.name })),
    );
    expect(plan.tmfStructure.map(z => z.artifacts)).toEqual(TMF_REFERENCE_MODEL.map(z => z.artifacts.map(a => a.name)));
    const catalog = new Map(TMF_REFERENCE_MODEL.map(z => [z.number, z.name]));
    expect(plan.documents.filter(d => catalog.get(d.tmfZone as number) !== d.tmfZoneName).map(d => d.id), 'plan documents outside the catalog zones').toEqual([]);
    expect('TMF_ZONES' in GCP_REFERENCE, 'gcp-operations-reference exports TMF_ZONES').toBe(false);
  });

  /* One product, one answer: the zone AnA's plan gives a document and the zone
     the classifier files it in, by the library's own name, are the same, or the
     classifier says nothing. Before 2026-11-11 three disagreed: the financial
     disclosure (plan 5, classifier 3 by "fda"), randomisation (11 and 6) and the
     deviation log. The one left is recorded with its reason, and must still be
     true to stay recorded. */
  it('the classifier files a library document where AnA\'s plan says, or nowhere', () => {
    const KNOWN: Record<string, { plan: number; classifier: number; why: string }> = {
      'ED-DEVIATION': {
        plan: 1,
        classifier: 2,
        why: 'The keyword "protocol" reads a protocol-deviation log as a protocol document (zone 2). The library keeps its own group (zone 1). '
          + 'The reference model, as two readers recall it, has protocol deviations under Site Management (zone 5). Not settled from memory: QA decides.',
      },
    };
    const disagree = Object.fromEntries(planEssentialDocuments({ usesInvestigationalDevice: true }).documents.flatMap((d) => {
      const zone = classifyArtifact(d.name).zone;
      return zone === null || zone === d.tmfZone ? [] : [[d.id, { plan: d.tmfZone, classifier: zone }]];
    }));
    expect(disagree).toEqual(Object.fromEntries(Object.entries(KNOWN).map(([id, k]) => [id, { plan: k.plan, classifier: k.classifier }])));
  });
});

describe('the eTMF screen and the catalog', () => {
  it('the eTMF screen takes artifact names from the catalog, not from fixtures', () => {
    const screen = read('client/src/concept2cure/v2/surfaces/Etmf.tsx');
    expect(screen.match(/^import\b[^;]*from '(?:\.\.\/)+fixtures\/[^']+';/gm) ?? [], 'fixture imports in Etmf.tsx').toEqual([]);
    expect(/^import \{[^}]*\btmfArtifactName\b[^}]*\} from '@shared\/constants\/domain\/tmf-reference-model';/m.test(screen),
      'Etmf.tsx imports tmfArtifactName from the shared catalog').toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'client/src/concept2cure/v2/fixtures/etmf.ts')), 'fixtures/etmf.ts exists').toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vault taxonomy integrity
// ─────────────────────────────────────────────────────────────────────────────

const ALL_VIEWS = VAULT_VIEWS.map(v => v.value) as VaultViewId[];

describe('vault taxonomy views', () => {
  it('defines the four product segments plus the service view', () => {
    expect([...ALL_VIEWS].sort()).toEqual(['biotech', 'device', 'ivd', 'pharma', 'service']);
  });

  it('every view has folders, doc kinds, and filing frameworks', () => {
    for (const view of ALL_VIEWS) {
      expect(foldersForView(view).length, `folders for ${view}`).toBeGreaterThan(0);
      expect(docKindsForView(view).length, `doc kinds for ${view}`).toBeGreaterThan(0);
      expect(filingTypesForView(view).length, `frameworks for ${view}`).toBeGreaterThan(0);
    }
  });

  it('ids are unique within each catalog', () => {
    const kinds = VAULT_DOC_KINDS.map(k => k.value);
    const filings = VAULT_FILING_TYPES.map(f => f.value);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(filings).size).toBe(filings.length);
    for (const view of ALL_VIEWS) {
      const folders = foldersForView(view).map(f => f.id);
      expect(new Set(folders).size, `folder ids for ${view}`).toBe(folders.length);
    }
  });

  it('preserves the shipped device-view filter ids (client compatibility)', () => {
    const deviceKinds = new Set<string>(docKindsForView('device').map(k => k.value));
    for (const legacy of ['report', 'cert', 'label', 'code', 'supplier', 'resp']) {
      expect(deviceKinds.has(legacy), `legacy kind ${legacy}`).toBe(true);
    }
  });

  it('pharma/biotech views are CTD-structured; service view is TMF-zone-structured', () => {
    const pharmaFolders = foldersForView('pharma').map(f => f.id);
    expect(pharmaFolders).toEqual(expect.arrayContaining(['module-1', 'module-3', 'module-5', 'sequences']));
    expect(foldersForView('biotech')).toEqual(foldersForView('pharma'));

    const serviceFolders = foldersForView('service').map(f => f.id);
    for (const z of TMF_ZONE_REFS) {
      expect(serviceFolders, `service folders include ${z.id}`).toContain(z.id);
    }
  });

  it('filing frameworks land in the right segment views', () => {
    const pharma = new Set(filingTypesForView('pharma').map(f => f.value));
    const biotech = new Set(filingTypesForView('biotech').map(f => f.value));
    const device = new Set(filingTypesForView('device').map(f => f.value));
    expect(pharma.has('nda')).toBe(true);
    expect(pharma.has('bla')).toBe(false);   // BLA is the biotech pathway
    expect(biotech.has('bla')).toBe(true);
    expect(biotech.has('ind')).toBe(true);
    expect(device.has('k510')).toBe(true);
    expect(device.has('nda')).toBe(false);
  });
});

describe('vaultViewForOrganization (service-org rule)', () => {
  it('maps product owners to their segment', () => {
    expect(vaultViewForOrganization('pharma')).toBe('pharma');
    expect(vaultViewForOrganization('biotech')).toBe('biotech');
    expect(vaultViewForOrganization('medtech')).toBe('device');
    expect(vaultViewForOrganization('ivd')).toBe('ivd');
  });

  it('maps service organizations to the cross-sponsor TMF view', () => {
    for (const org of ['cro', 'cdmo', 'academic', 'government', 'other'] as const) {
      expect(vaultViewForOrganization(org)).toBe('service');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// eTMF seed skeleton
// ─────────────────────────────────────────────────────────────────────────────

describe('seedArtifacts (eTMF expected-document skeleton)', () => {
  it("'all' scope seeds every reference-model artifact across all 11 zones", () => {
    const seeds = seedArtifacts('all');
    const catalogSize = TMF_REFERENCE_MODEL.reduce((n, z) => n + z.artifacts.length, 0);
    expect(seeds).toHaveLength(catalogSize);
    expect(new Set(seeds.map(s => s.zone))).toEqual(new Set(TMF_REFERENCE_MODEL.map(z => z.number)));
  });

  it("'essential' scope seeds only essential documents, all completeness-required", () => {
    const seeds = seedArtifacts('essential');
    const essentialCount = TMF_REFERENCE_MODEL.reduce(
      (n, z) => n + z.artifacts.filter(a => a.essential).length, 0,
    );
    expect(seeds).toHaveLength(essentialCount);
    expect(seeds.every(s => s.completenessRequired)).toBe(true);
  });

  it('completeness_required mirrors essential — optional artifacts never dilute readiness', () => {
    const byCode = new Map(seedArtifacts('all').map(s => [s.code, s]));
    for (const zone of TMF_REFERENCE_MODEL) {
      for (const a of zone.artifacts) {
        expect(byCode.get(a.code)?.completenessRequired, a.code).toBe(a.essential);
      }
    }
  });

  it('seed codes are unique (idempotency key sanity)', () => {
    const codes = seedArtifacts('all').map(s => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
