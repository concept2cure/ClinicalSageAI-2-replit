/**
 * C2C-SUB-003 — namespace confinement at the byte-read choke point.
 *
 * Every submission gateway (FDA ESG, EMA CESP, PMDA, MHRA, ANVISA, …) funnels
 * its payload through readVerifiedBundle(). Before this fix that function did
 * exactly one thing: fs.readFile(descriptor.path) and compare the bytes against
 * the descriptor's OWN sha256/sizeBytes. That comparison is self-consistent for
 * any file whose digest the caller can compute, so it authorizes nothing — it
 * only proves the bytes have not drifted since the descriptor was written.
 *
 * These tests pin the two properties that make the read safe:
 *   1. a `..` component (or NUL, or empty path) is refused in every environment;
 *   2. outside a declared local dev/test environment the path must resolve
 *      INSIDE the submission-bundle root — a hash-perfect file elsewhere on the
 *      filesystem is still refused.
 *
 * NODE_ENV is mutated per test and restored in afterEach: vitest runs
 * singleFork, so a leaked 'production' would poison every later test file.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

import { readVerifiedBundle } from '../server/services/submission-gateways/bundle-integrity';
import { ValidationError } from '../server/services/submission-gateways/types';
import {
  bundleTrustEnforced,
  hasUnsafePathSyntax,
  isBundleStorageKey,
  isPathWithinBundleRoot,
  submissionBundleRoot,
} from '../server/services/submission-gateways/bundle-namespace';

let base: string;
let root: string;
let insidePath: string;
let outsidePath: string;
const bytes = Buffer.from('PK fake-but-stable eCTD zip payload', 'utf8');
const sha256 = createHash('sha256').update(bytes).digest('hex');

let savedNodeEnv: string | undefined;
let savedBundleDir: string | undefined;

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'c2c-bundle-ns-'));
  root = path.join(base, 'bundles');
  await fs.mkdir(root, { recursive: true });
  insidePath = path.join(root, 'pkg-0000.zip');
  outsidePath = path.join(base, 'stolen.zip');
  // Byte-identical files, one inside the namespace and one outside it. Both
  // satisfy the hash/size check; only the in-namespace one may be read.
  await fs.writeFile(insidePath, bytes);
  await fs.writeFile(outsidePath, bytes);
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
  savedBundleDir = process.env.SUBMISSION_BUNDLE_DIR;
  process.env.SUBMISSION_BUNDLE_DIR = root;
});

afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  if (savedBundleDir === undefined) delete process.env.SUBMISSION_BUNDLE_DIR;
  else process.env.SUBMISSION_BUNDLE_DIR = savedBundleDir;
});

describe('bundleTrustEnforced — fail closed on anything but declared dev/test', () => {
  it.each(['production', 'staging', 'PRODUCTION', 'prod', '', '   '])(
    'enforces for NODE_ENV=%j',
    (env) => {
      process.env.NODE_ENV = env;
      expect(bundleTrustEnforced()).toBe(true);
    },
  );

  it('enforces when NODE_ENV is unset entirely', () => {
    delete process.env.NODE_ENV;
    expect(bundleTrustEnforced()).toBe(true);
  });

  it.each(['development', 'test', 'Development', ' TEST '])(
    'relaxes only for declared local NODE_ENV=%j',
    (env) => {
      process.env.NODE_ENV = env;
      expect(bundleTrustEnforced()).toBe(false);
    },
  );
});

describe('path + key predicates', () => {
  it('flags traversal, NUL and empty paths as unsafe syntax', () => {
    expect(hasUnsafePathSyntax('../../etc/passwd')).toBe(true);
    expect(hasUnsafePathSyntax('/srv/bundles/../../etc/passwd')).toBe(true);
    expect(hasUnsafePathSyntax('..')).toBe(true);
    expect(hasUnsafePathSyntax('/srv/bundles/a.zip\0.png')).toBe(true);
    expect(hasUnsafePathSyntax('')).toBe(true);
    expect(hasUnsafePathSyntax(undefined)).toBe(true);
    expect(hasUnsafePathSyntax('/srv/bundles/pkg-0000.zip')).toBe(false);
    // A literal '..' inside a filename component is not a traversal.
    expect(hasUnsafePathSyntax('/srv/bundles/pkg..zip')).toBe(false);
  });

  it('confines paths to the configured bundle root', () => {
    expect(submissionBundleRoot()).toBe(root);
    expect(isPathWithinBundleRoot(insidePath)).toBe(true);
    expect(isPathWithinBundleRoot(path.join(root, 'nested', 'a.zip'))).toBe(true);
    expect(isPathWithinBundleRoot(outsidePath)).toBe(false);
    expect(isPathWithinBundleRoot('/etc/passwd')).toBe(false);
    expect(isPathWithinBundleRoot(`${root}/../stolen.zip`)).toBe(false);
    // A sibling directory sharing the root's name prefix must not pass.
    expect(isPathWithinBundleRoot(`${root}-evil/a.zip`)).toBe(false);
  });

  it('falls back to <cwd>/uploads/submission-bundles when SUBMISSION_BUNDLE_DIR is unset', () => {
    delete process.env.SUBMISSION_BUNDLE_DIR;
    expect(submissionBundleRoot()).toBe(path.resolve(process.cwd(), 'uploads', 'submission-bundles'));
  });

  it('confines durable-storage keys to the submission-bundles prefix', () => {
    expect(isBundleStorageKey('submission-bundles/pkg/abc.zip')).toBe(true);
    expect(isBundleStorageKey('vault-raw/doc/1.pdf')).toBe(false);
    expect(isBundleStorageKey('submission-bundles/../vault-raw/1.pdf')).toBe(false);
    expect(isBundleStorageKey('')).toBe(false);
    expect(isBundleStorageKey(undefined)).toBe(false);
  });
});

describe('readVerifiedBundle — namespace confinement', () => {
  it('refuses a hash- and size-perfect file OUTSIDE the bundle root when enforcing', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      readVerifiedBundle({ path: outsidePath, sha256, sizeBytes: bytes.length }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      readVerifiedBundle({ path: outsidePath, sha256, sizeBytes: bytes.length }),
    ).rejects.toThrow(/outside the permitted submission-bundle storage namespace/i);
  });

  it('refuses when NODE_ENV is unset (fail closed)', async () => {
    delete process.env.NODE_ENV;
    await expect(
      readVerifiedBundle({ path: outsidePath, sha256, sizeBytes: bytes.length }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a ../ traversal path even in a declared test environment', async () => {
    process.env.NODE_ENV = 'test';
    await expect(
      readVerifiedBundle({ path: `${root}/../stolen.zip`, sha256, sizeBytes: bytes.length }),
    ).rejects.toThrow(/not a well-formed bundle location/i);
  });

  it('reads an in-namespace bundle whose bytes still match the descriptor', async () => {
    process.env.NODE_ENV = 'production';
    const buf = await readVerifiedBundle({ path: insidePath, sha256, sizeBytes: bytes.length });
    expect(buf.equals(bytes)).toBe(true);
  });

  it('still refuses an in-namespace bundle whose bytes drifted (existing control preserved)', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      readVerifiedBundle({ path: insidePath, sha256: 'a'.repeat(64), sizeBytes: bytes.length }),
    ).rejects.toThrow(/does not match the signed descriptor/i);
  });
});
