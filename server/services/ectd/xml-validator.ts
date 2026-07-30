/**
 * Real XML validation via `xmllint` (libxml2).
 *
 * Replaces the hand-rolled tag-balance scanner with an actual parser:
 *   - well-formedness (every backbone / RPS message),
 *   - DTD validity (v3.2.2 index.xml + regional backbones, once the licensed
 *     DTDs are vendored into util/dtd/ — DOCTYPE SYSTEM paths resolve relative
 *     to the file's location in the unzipped tree),
 *   - XSD validity (genericode CV files; the ICH RPS schema for v4.0, once
 *     vendored into util/schema/).
 *
 * Fail-open by capability, fail-closed by result: when `xmllint` is not on the
 * PATH the check reports `ran:false` (the caller decides whether that blocks —
 * mirroring the PDF/A and DTD gates); when it IS present, a non-zero exit is a
 * real validation failure with libxml2's diagnostics preserved.
 *
 * @module server/services/ectd/xml-validator
 */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

export interface XmlLintResult {
  /** True when xmllint actually executed (binary present + spawned). */
  ran: boolean;
  /** True when xmllint ran AND reported no errors. */
  valid: boolean;
  /** Parsed diagnostic lines from xmllint stderr. */
  errors: string[];
  /** What was checked: 'well-formed' | 'dtd' | 'xsd'. */
  mode: 'well-formed' | 'dtd' | 'xsd';
}

let xmllintAvailable: boolean | null = null;

/** Detect (once) whether xmllint is callable. */
export async function isXmllintAvailable(): Promise<boolean> {
  if (xmllintAvailable !== null) return xmllintAvailable;
  xmllintAvailable = await new Promise<boolean>((resolve) => {
    execFile('xmllint', ['--version'], { timeout: 5000 }, (err) => resolve(!err));
  });
  return xmllintAvailable;
}

/** Reset the cached capability probe (tests only). */
export function __resetXmllintProbe(): void {
  xmllintAvailable = null;
}

function run(args: string[], timeoutMs = 30000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile('xmllint', args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, _stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException).code === 'number'
        ? ((err as unknown as { code: number }).code)
        : err ? 1 : 0;
      resolve({ code, stderr: stderr?.toString() ?? '' });
    });
  });
}

function parseErrors(stderr: string): string[] {
  return stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^xmllint$/.test(l));
}

async function withTempFile<T>(content: string, fn: (p: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-xmllint-'));
  const file = path.join(dir, `${createHash('md5').update(content).digest('hex').slice(0, 12)}.xml`);
  try {
    await fs.writeFile(file, content, 'utf8');
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Check XML well-formedness. Accepts a raw string or a file path. */
export async function checkWellFormed(xmlOrPath: string, isPath = false): Promise<XmlLintResult> {
  if (!(await isXmllintAvailable())) {
    return { ran: false, valid: false, errors: ['xmllint not available'], mode: 'well-formed' };
  }
  const exec = async (file: string) => {
    const { code, stderr } = await run(['--noout', '--nonet', file]);
    return { ran: true, valid: code === 0, errors: parseErrors(stderr), mode: 'well-formed' as const };
  };
  return isPath ? exec(xmlOrPath) : withTempFile(xmlOrPath, exec);
}

/**
 * Validate an XML file against its declared (or an explicit) DTD.
 * Validate the file in its real package location so relative DOCTYPE SYSTEM
 * paths (util/dtd/*.dtd) resolve. If `dtdPath` is given it overrides the
 * embedded DOCTYPE.
 */
export async function validateAgainstDtd(xmlPath: string, dtdPath?: string): Promise<XmlLintResult> {
  if (!(await isXmllintAvailable())) {
    return { ran: false, valid: false, errors: ['xmllint not available'], mode: 'dtd' };
  }
  const args = dtdPath
    ? ['--noout', '--nonet', '--dtdvalid', dtdPath, xmlPath]
    : ['--noout', '--nonet', '--valid', xmlPath];
  const { code, stderr } = await run(args);
  return { ran: true, valid: code === 0, errors: parseErrors(stderr), mode: 'dtd' };
}

/** Validate an XML file (or string) against an XSD schema. */
export async function validateAgainstXsd(xmlOrPath: string, xsdPath: string, isPath = false): Promise<XmlLintResult> {
  if (!(await isXmllintAvailable())) {
    return { ran: false, valid: false, errors: ['xmllint not available'], mode: 'xsd' };
  }
  const exec = async (file: string) => {
    const { code, stderr } = await run(['--noout', '--nonet', '--schema', xsdPath, file]);
    return { ran: true, valid: code === 0, errors: parseErrors(stderr), mode: 'xsd' as const };
  };
  return isPath ? exec(xmlOrPath) : withTempFile(xmlOrPath, exec);
}
