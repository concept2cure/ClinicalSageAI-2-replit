/**
 * The server/services barrel names only modules that exist.
 *
 * SERVICE_REGISTRY mapped 'ai.assistant' to 'openai-service', 'documents.pdf' to
 * 'pdfGenerator' and 'fda.service' to 'fdaService', none of them a module under
 * server/services, so hasCapability() answered true and getServicePath()
 * returned a path for three capabilities nothing provides (fabrication sweep
 * 2026-10-15, intelligence/innovation #35). The barrel is read as source, not
 * imported: importing it would load every service it re-exports.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'server', 'services');
const source = fs.readFileSync(path.join(DIR, 'index.ts'), 'utf8');

const resolves = (spec: string) =>
  ['.ts', '.js', '/index.ts', '/index.js'].some((ext) => fs.existsSync(path.join(DIR, spec + ext)));

describe('server/services/index.ts', () => {
  it('maps every registered capability to a module that exists', () => {
    const registry = source.slice(source.indexOf('export const SERVICE_REGISTRY'), source.indexOf('} as const;'));
    const entries = [...registry.matchAll(/^\s*'([\w.]+)':\s*'([^']+)'/gm)].map(([, capability, module]) => ({
      capability,
      module,
    }));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((e) => !resolves(e.module))).toEqual([]);
  });

  it('re-exports only modules that exist', () => {
    const specifiers = [...source.matchAll(/^export [^;]*? from '(\.\/[^']+)';/gm)].map(([, s]) => s);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => !resolves(s))).toEqual([]);
  });
});
