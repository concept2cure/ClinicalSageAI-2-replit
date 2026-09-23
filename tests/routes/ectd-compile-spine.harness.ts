/**
 * Shared fixtures for the spine-backed eCTD compile route tests
 * (ectd-compile-spine.test.ts, ectd-compile-lifecycle.test.ts). Each test file
 * declares its own hoisted mocks — vi.mock is per file — and hands its pool
 * mock to mockSpineOn; everything else here is plain data and factories.
 */
import { vi, type Mock } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { createMockRequest } from '../setup';

/** The route handler registered at `routePath` for `method`. */
export function handlerOf(routes: unknown, routePath: string, method: 'get' | 'post') {
  const layer = (routes as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

export const ORG = 7;
export const UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
export const PROGRAM = {
  id: UUID,
  code: 'BX-204',
  name: 'BX-204 Program',
  product_name: 'Examplinib',
  program_type: 'ind',
};

/** Placed leaves covering M2 + M3; one points at an unresolvable source. */
export const LEAVES = [
  { section_code: '2.5', title: 'Clinical Overview', lifecycle_op: 'new', document_table: 'coauthor_documents', document_id: 100 },
  { section_code: '3.2.S', title: 'Drug Substance', lifecycle_op: 'new', document_table: 'unified_documents', document_id: 200 },
];

export interface SpineOpts {
  leaves?: unknown[];
  program?: Record<string, unknown>;
  /** required_sections of a live rule pack; omitted = no pack (ICH baseline). */
  pack?: Array<{ key: string; mandatory: boolean }>;
  /** Make the compilation-record INSERT fail, as it does where a column is missing. */
  failInsert?: boolean;
  /** Make the compilation-history SELECT fail. */
  failHistory?: boolean;
  history?: unknown[];
  /** The sequence the spine resolves to (default the original, 0000). */
  sequenceNumber?: string;
}

/** The spine's reads, answered from `opts`, on the test file's hoisted pool mock. */
export function mockSpineOn(poolQuery: Mock) {
  return (opts: SpineOpts = {}) => {
    const leaves = opts.leaves ?? LEAVES;
    const program = opts.program ?? PROGRAM;
    poolQuery.mockReset();
    poolQuery.mockImplementation(async (sql: string) => {
      if (opts.failInsert && /INSERT INTO ectd_compilations/i.test(sql)) {
        throw new Error('column "leaf_manifest" of relation "ectd_compilations" does not exist');
      }
      if (/FROM ectd_compilations/i.test(sql)) {
        if (opts.failHistory) throw new Error('relation "ectd_compilations" does not exist');
        return { rows: opts.history ?? [] };
      }
      if (/FROM c2c_rule_packs/i.test(sql)) {
        return { rows: opts.pack ? [{ version: 'v2.3-test', required_sections: opts.pack }] : [] };
      }
      if (/FROM regulatory_programs/i.test(sql)) return { rows: [program] };
      if (/FROM submissions/i.test(sql)) return { rows: [{ id: 55, application_type: 'ind' }] };
      if (/FROM ectd_sequences/i.test(sql)) {
        return { rows: [{ id: 9, sequence_number: opts.sequenceNumber ?? '0000', region: 'fda' }] };
      }
      if (/count\(\*\)::int AS n FROM submission_leaves/i.test(sql)) {
        return { rows: [{ n: leaves.length }] };
      }
      if (/FROM submission_leaves/i.test(sql)) return { rows: leaves };
      return { rows: [] };
    });
  };
}

/** A real ZIP on disk whose index.xml the route must hand back verbatim. */
export async function makeBundleZip(indexXml: string): Promise<{ dir: string; zipPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-spine-test-'));
  const zip = new JSZip();
  zip.file('index.xml', indexXml);
  zip.file('m2/2-5/clinical-overview.pdf', '%PDF-1.4 fake');
  const zipPath = path.join(dir, 'BX-204-0000-fda.zip');
  await fs.writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return { dir, zipPath };
}

export const REAL_BACKBONE =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">\n' +
  '<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" dtd-version="3.2"></ectd:ectd>';

export function assembledResult(zipPath: string, over: Record<string, unknown> = {}) {
  return {
    bundle: {
      path: zipPath,
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
      format: 'ectd',
      dtdStatus: { required: ['ich-ectd-3-2.dtd'], present: [], missing: ['ich-ectd-3-2.dtd'], selfContained: false },
    },
    skipped: [],
    materialized: 2,
    unresolvedLeaves: [],
    governanceManifestPath: path.join(path.dirname(zipPath), 'package-governance.sha256.json'),
    cleanup: vi.fn(async () => {}),
    ...over,
  };
}

export function makeReq(body: Record<string, unknown> = {}) {
  const r = createMockRequest({ params: { projectIdent: UUID }, body }) as any;
  r.tenantId = ORG;
  r.user = { id: 3 };
  return r;
}

/** A package shaped like the packager's real output for an FDA sequence 0000. */
export async function makeFdaPackageZip(): Promise<{ zipPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-spine-pkg-'));
  const zip = new JSZip();
  zip.file('index.xml', REAL_BACKBONE);
  zip.file('index-md5.txt', 'd41d8cd98f00b204e9800998ecf8427e');
  zip.file('util/index-md5.txt', 'aaaa  index.xml\nbbbb  m1/us/us-regional.xml\n');
  zip.file('m1/us/us-regional.xml', '<?xml version="1.0"?><fda-regional:fda-regional/>');
  zip.file('m1/us/1-1/form-fda-1571.pdf', '%PDF-1.4 signed');
  zip.file('m3/3-2-s-4-2/control-of-drug-substance.pdf', '%PDF-1.4 cmc');
  const zipPath = path.join(dir, 'BX-512-0000-fda.zip');
  await fs.writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return { zipPath };
}

export const selfContained = { required: [], present: [], missing: [], selfContained: true };
