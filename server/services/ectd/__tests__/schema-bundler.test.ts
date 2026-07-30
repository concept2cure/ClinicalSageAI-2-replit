/**
 * XSD schema-bundler + checksum-manifest verifier — the v4.0 drop-in seam.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  requiredSchemasForVersion,
  listVendoredSchemas,
  assessSchemaReadiness,
  schemaRequiredFromEnv,
  resolveSchemaPath,
  RPS_MESSAGE_XSD,
} from '../schema-bundler';
import { parseManifest, verifyChecksumManifest } from '../checksum-manifest';

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'ectd-schema-test-')); }

describe('schema-bundler', () => {
  it('requires the RPS message schema for v4.0 only', () => {
    expect(requiredSchemasForVersion('v4.0')).toEqual([RPS_MESSAGE_XSD]);
    expect(requiredSchemasForVersion('v3.2.2')).toEqual([]);
  });

  it('lists vendored .xsd files and resolves their path', async () => {
    const dir = await tmp();
    try {
      await fs.writeFile(path.join(dir, 'rps-message.xsd'), '<xs:schema/>');
      await fs.writeFile(path.join(dir, 'notes.txt'), 'ignore me');
      const found = await listVendoredSchemas(dir);
      expect(found.map((s) => s.fileName)).toEqual(['rps-message.xsd']);
      expect(await resolveSchemaPath('rps-message.xsd', dir)).toContain('rps-message.xsd');
      expect(await resolveSchemaPath('missing.xsd', dir)).toBeNull();
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it('never throws on a missing directory', async () => {
    expect(await listVendoredSchemas('/nonexistent/dir/xyz')).toEqual([]);
  });

  it('blocks a required-but-missing schema only in production', () => {
    const missing = assessSchemaReadiness({ version: 'v4.0', present: [], environment: 'production', requireSchema: true });
    expect(missing.cleared).toBe(false);
    expect(missing.missing).toEqual([RPS_MESSAGE_XSD]);

    const staging = assessSchemaReadiness({ version: 'v4.0', present: [], environment: 'staging', requireSchema: true });
    expect(staging.cleared).toBe(true); // staging never blocks

    const present = assessSchemaReadiness({ version: 'v4.0', present: [RPS_MESSAGE_XSD], environment: 'production', requireSchema: true });
    expect(present.cleared).toBe(true);

    const notReq = assessSchemaReadiness({ version: 'v4.0', present: [], environment: 'production', requireSchema: false });
    expect(notReq.cleared).toBe(true); // report-only
  });

  it('reads the enforcement flag', () => {
    expect(schemaRequiredFromEnv({ ECTD_REQUIRE_RPS_SCHEMA: 'true' } as any)).toBe(true);
    expect(schemaRequiredFromEnv({} as any)).toBe(false);
  });
});

describe('checksum-manifest verifier', () => {
  it('parses sha256sum-format entries, ignoring comments/blanks', () => {
    const m = parseManifest('# comment\n\n' + 'a'.repeat(64) + '  file-a.xsd\n' + 'b'.repeat(64) + '  file b.dtd\n');
    expect(m).toEqual([
      { sha256: 'a'.repeat(64), fileName: 'file-a.xsd' },
      { sha256: 'b'.repeat(64), fileName: 'file b.dtd' },
    ]);
  });

  it('verifies matching hashes and flags mismatch / missing / unlisted', async () => {
    const dir = await tmp();
    try {
      const good = Buffer.from('<xs:schema>good</xs:schema>');
      await fs.writeFile(path.join(dir, 'rps-message.xsd'), good);
      const goodHash = createHash('sha256').update(good).digest('hex');
      // unlisted file (present, no manifest entry)
      await fs.writeFile(path.join(dir, 'extra.xsd'), 'x');
      // manifest lists rps-message.xsd (correct) + a missing genericode.xsd
      await fs.writeFile(path.join(dir, 'checksums.txt'),
        `${goodHash}  rps-message.xsd\n${'c'.repeat(64)}  genericode.xsd\n`);

      const r = await verifyChecksumManifest(dir, 'checksums.txt', ['.xsd']);
      expect(r.verified).toEqual(['rps-message.xsd']);
      expect(r.missingFiles).toEqual(['genericode.xsd']);
      expect(r.unlistedFiles).toEqual(['extra.xsd']);
      expect(r.ok).toBe(false);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it('detects a tampered file (hash mismatch)', async () => {
    const dir = await tmp();
    try {
      await fs.writeFile(path.join(dir, 'rps-message.xsd'), 'tampered');
      await fs.writeFile(path.join(dir, 'checksums.txt'), `${'d'.repeat(64)}  rps-message.xsd\n`);
      const r = await verifyChecksumManifest(dir, 'checksums.txt', ['.xsd']);
      expect(r.mismatched[0].fileName).toBe('rps-message.xsd');
      expect(r.ok).toBe(false);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it('is trivially ok when nothing is vendored and nothing is listed (pre-vendoring state)', async () => {
    const dir = await tmp();
    try {
      await fs.writeFile(path.join(dir, 'checksums.txt'), '# placeholders only\n# <sha256>  rps-message.xsd\n');
      const r = await verifyChecksumManifest(dir, 'checksums.txt', ['.xsd']);
      expect(r.ok).toBe(true);
      expect(r.verified).toEqual([]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
