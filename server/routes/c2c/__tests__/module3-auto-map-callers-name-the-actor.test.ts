/**
 * Every caller of classifyAndMapArtifactToSource names who is mapping.
 *
 * classifyAndMapArtifactToSource (server/services/module3-convergence-service.ts)
 * refuses, before anything is written, a mapping whose actor is not stated: its
 * provenance rows used to record 'system' for it (2026-10-15). The knowledge
 * upload route called it without an actor, and wraps the call as non-fatal, so
 * every upload's Module 3 auto-map was refused and only logged — uploads quietly
 * stopped feeding Module 3. This pins each production call site to pass
 * `{ actorUserId: … }` as the fifth argument.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const CALL = 'classifyAndMapArtifactToSource(';

/** The top-level arguments of the call that opens at `start` (just past its '('). */
function argumentsAt(src: string, start: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) {
        if (current.trim()) args.push(current.trim());
        return args;
      }
      depth--;
    }
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  throw new Error('unterminated call');
}

function callSites(): Array<{ file: string; args: string[] }> {
  const files = execFileSync('git', ['grep', '-l', CALL, '--', 'server', ':!**/__tests__/**'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const sites: Array<{ file: string; args: string[] }> = [];
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    let at = src.indexOf(CALL);
    while (at !== -1) {
      const before = src.slice(Math.max(0, at - 30), at);
      // Skip the declaration itself.
      if (!/function\s+$/.test(before)) sites.push({ file, args: argumentsAt(src, at + CALL.length) });
      at = src.indexOf(CALL, at + CALL.length);
    }
  }
  return sites;
}

describe('Module 3 auto-map call sites', () => {
  it('has at least the knowledge upload route as a caller', () => {
    expect(callSites().map((s) => s.file)).toContain('server/routes/c2c/knowledge-sources.ts');
  });

  it('passes the mapping actor at every production call site', () => {
    const missing = callSites()
      .filter((s) => s.args.length < 5 || !/actorUserId\s*:/.test(s.args[4]))
      .map((s) => `${s.file}: ${s.args.length} argument(s)`);
    expect(missing, 'a caller maps without naming who is mapping, so the mapping is refused').toEqual([]);
  });
});
