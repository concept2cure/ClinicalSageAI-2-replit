/**
 * ADR-0014 §4: the lockfile names each served model one way.
 *
 * The ledger attributes a call to its entry through `approvedEntryFor`
 * (provider, then pinned version OR id), which takes the first hit. Two
 * entries sharing (provider, pinned version), or one entry's id equal to
 * another's pinned version under the same provider, would let a call be
 * recorded against an entry other than the one selection judged
 * (`governingEntry`, identity). `detectModelDrift` forbids neither. This does.
 *
 * Scoped by provider, because every lookup is: `approvedEntryFor` and
 * `governingEntry` both match the provider first. The one cross-provider
 * coincidence in today's lockfile (openai 'gpt-4o' and azure 'gpt-4o-azure',
 * whose Azure deployment is also named 'gpt-4o') is pinned below as
 * unambiguous for that reason.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVED_MODELS, approvedEntryFor, type ApprovedModel } from '../approved-models';

type Pin = Pick<ApprovedModel, 'id' | 'provider' | 'pinnedVersion'>;

/** Every way this list lets one wire name reach two entries. Empty when unambiguous. */
function lockfileAmbiguities(entries: readonly Pin[]): string[] {
  const found: string[] = [];
  entries.forEach((a, i) => {
    entries.slice(i + 1).forEach((b) => {
      if (a.id === b.id) found.push(`duplicate id '${a.id}'`);
      if (a.provider !== b.provider) return;
      if (a.pinnedVersion === b.pinnedVersion) {
        found.push(`${a.provider}: '${a.id}' and '${b.id}' both pin '${a.pinnedVersion}'`);
      }
      if (a.id === b.pinnedVersion) found.push(`${a.provider}: id '${a.id}' is the pinned version of '${b.id}'`);
      if (b.id === a.pinnedVersion) found.push(`${a.provider}: id '${b.id}' is the pinned version of '${a.id}'`);
    });
  });
  return found;
}

const pin = (id: string, pinnedVersion: string, provider: Pin['provider'] = 'anthropic'): Pin => ({
  id,
  provider,
  pinnedVersion,
});

describe('approved-models lockfile invariant', () => {
  it('holds for the governed lockfile', () => {
    expect(lockfileAmbiguities(APPROVED_MODELS)).toEqual([]);
  });

  it('fails on two entries of one provider pinning one version', () => {
    expect(lockfileAmbiguities([pin('a', 'claude-x'), pin('b', 'claude-x')])).toEqual([
      "anthropic: 'a' and 'b' both pin 'claude-x'",
    ]);
  });

  it("fails on an id equal to another entry's pinned version under the same provider, in either order", () => {
    expect(lockfileAmbiguities([pin('claude-x', 'claude-x-1'), pin('b', 'claude-x')])).toEqual([
      "anthropic: id 'claude-x' is the pinned version of 'b'",
    ]);
    expect(lockfileAmbiguities([pin('b', 'claude-x'), pin('claude-x', 'claude-x-1')])).toEqual([
      "anthropic: id 'claude-x' is the pinned version of 'b'",
    ]);
  });

  it('fails on a duplicate id', () => {
    expect(lockfileAmbiguities([pin('a', 'v1'), pin('a', 'v2', 'bedrock')])).toEqual(["duplicate id 'a'"]);
  });

  it('an entry whose id is its own pinned version is not an ambiguity', () => {
    expect(lockfileAmbiguities([pin('gpt-4o', 'gpt-4o', 'openai')])).toEqual([]);
  });

  it('the cross-provider gpt-4o pair resolves to one entry per provider', () => {
    expect(approvedEntryFor({ provider: 'openai', model: 'gpt-4o' })?.id).toBe('gpt-4o');
    expect(approvedEntryFor({ provider: 'azure', model: 'gpt-4o' })?.id).toBe('gpt-4o-azure');
  });
});

/**
 * Track GW review [15]: the governed list, and the gateway's test seam that
 * replaces it, cannot be changed at runtime. Flipping an entry's `pq.status`
 * or swapping the list switched §3 and §4 off with no environment variable.
 */
describe('the governed list cannot be changed at runtime', () => {
  it('APPROVED_MODELS is frozen, and so is every entry and its PQ record', () => {
    expect(Object.isFrozen(APPROVED_MODELS)).toBe(true);
    for (const e of APPROVED_MODELS) {
      expect(Object.isFrozen(e), e.id).toBe(true);
      expect(Object.isFrozen(e.pq), e.id).toBe(true);
    }
    const flagship = APPROVED_MODELS.find((e) => e.id === 'claude-opus-4')!;
    expect(() => {
      (flagship.pq as { status: string }).status = 'passed';
    }).toThrow(TypeError);
    expect(() => (APPROVED_MODELS as ApprovedModel[]).push(flagship)).toThrow(TypeError);
  });
});

/** Source that assigns to the governed list, an entry's approval or PQ, or the gateway's seam. */
const GOVERNED_WRITE = [
  /\.approvedModels\s*=(?!=)/,
  /\[\s*['"`]approvedModels['"`]\s*\]\s*=(?!=)/,
  /\.pq(\.status)?\s*=(?!=)/,
  /\.approvedForHighRisk\s*=(?!=)/,
  /APPROVED_MODELS\s*\.\s*(push|splice|pop|shift|unshift|sort|reverse|fill|copyWithin)\s*\(/,
  /APPROVED_MODELS\s*\[[^\]]*\]\s*=(?!=)/,
];

function governedWrites(files: Array<{ file: string; text: string }>): string[] {
  const found: string[] = [];
  for (const { file, text } of files) {
    text.split('\n').forEach((line, i) => {
      if (GOVERNED_WRITE.some((re) => re.test(line))) found.push(`${file}:${i + 1}`);
    });
  }
  return found;
}

const ROOT = path.resolve(__dirname, '../../../..');
const isTest = (p: string) => /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

function sourceFiles(dir: string, out: Array<{ file: string; text: string }> = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (e.isDirectory()) sourceFiles(full, out);
    else if (/\.[cm]?[jt]sx?$/.test(e.name) && !isTest(rel)) out.push({ file: rel, text: readFileSync(full, 'utf8') });
  }
  return out;
}

describe('no code outside the tests writes governed approval data', () => {
  it('holds for server/, shared/ and scripts/', () => {
    const files = ['server', 'shared', 'scripts'].flatMap((d) => sourceFiles(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(100);
    expect(governedWrites(files)).toEqual([]);
  });

  it('fails on each way to do it', () => {
    const cases = [
      '(getGateway() as any).approvedModels = [];',
      "gw['approvedModels'] = list;",
      "entry.pq.status = 'passed';",
      'entry.pq = { status: "passed" };',
      'entry.approvedForHighRisk = true;',
      'APPROVED_MODELS.push(extra);',
      'APPROVED_MODELS[0] = extra;',
    ];
    for (const text of cases) expect(governedWrites([{ file: 'x.ts', text }]), text).toEqual(['x.ts:1']);
  });

  it('does not fire on a comparison or a read', () => {
    const reads = ["if (entry.pq.status === 'passed') ok();", 'const a = entry.approvedForHighRisk;', 'x.approvedModels == y;'];
    for (const text of reads) expect(governedWrites([{ file: 'x.ts', text }]), text).toEqual([]);
  });
});
