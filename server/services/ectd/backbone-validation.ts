/** Canonical package-relative XML/DTD checks, extracted from qualification. */
import { promises as fs } from 'fs';
import * as path from 'path';
import { checkWellFormed, validateAgainstDtd, type XmlLintResult } from './xml-validator';

export interface ValidatorRunReport {
  name: string; ran: boolean; passed: boolean; errorCount: number; warningCount: number; sample: string[];
}

export function tallyValidationReport(name: string, ran: boolean, findings: Array<{ severity: string; message: string }>): ValidatorRunReport {
  const errors = findings.filter(f => f.severity === 'error');
  return { name, ran, passed: ran && errors.length === 0, errorCount: errors.length,
    warningCount: findings.filter(f => f.severity === 'warning').length,
    sample: findings.slice(0, 5).map(f => `[${f.severity}] ${f.message}`) };
}

export interface BackboneValidation {
  relPath: string;
  wellFormed: XmlLintResult;
  doctype: { valid: boolean; errors: string[] };
  dtd: XmlLintResult;
  reports: ValidatorRunReport[];
  dtdSkipped: { relPath: string; dtd: string } | null;
}

type FileResolution = { file: string | null; missing: boolean; error: string | null };
const skipped = (mode: XmlLintResult['mode'], reason: string): XmlLintResult => ({ ran: false, valid: false, mode, errors: [reason] });
const stripComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '');
/** Unsupported encodings remain unverified; never audit different text than libxml reads. */
async function auditText(file: string): Promise<{ text: string; error: string | null }> {
  try {
    const bytes = await fs.readFile(file);
    const text = bytes.toString('utf8');
    const encoding = /^\s*<\?xml\b[^?]*\bencoding\s*=\s*(['"])(.*?)\1/i.exec(text)?.[2];
    if (text.includes('\0') || !Buffer.from(text, 'utf8').equals(bytes) || (encoding && !/^utf-?8$/i.test(encoding))) {
      return { text: '', error: 'Unsupported XML/DTD dependency encoding: only exact UTF-8 text can be proven package-contained.' };
    }
    return { text, error: null };
  } catch { return { text: '', error: 'XML/DTD dependency became missing or unreadable during validation.' }; }
}
const within = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

async function packagedFile(root: string, file: string): Promise<FileResolution> {
  if (!within(root, file)) return { file: null, missing: false, error: 'Reference resolves outside the package directory.' };
  try {
    const real = await fs.realpath(file);
    if (!within(root, real) || real !== file) return { file: null, missing: false, error: 'Symlinked XML/DTD dependency cannot prove package containment.' };
    if (!(await fs.stat(real)).isFile()) return { file: null, missing: false, error: 'XML/DTD dependency is not a file.' };
    return { file: real, missing: false, error: null };
  } catch {
    return { file: null, missing: true, error: 'XML/DTD dependency is missing or unreadable in the package.' };
  }
}

function externalIdError(systemId: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(systemId)) return 'External URI dependency is not contained in the package.';
  if (path.isAbsolute(systemId) || systemId.startsWith('\\')) return 'Absolute dependency is not a portable package reference.';
  if (/[&%]/.test(systemId)) return 'Dynamic external dependency cannot be proven package-contained.';
  return null;
}

function declaredDependency(declaration: string): { id: string | null; error: string | null } {
  if (/%\s*[\w:.-]+;/.test(declaration)) return { id: null, error: 'Unprovable DTD dependency: a parameter entity constructs an ENTITY declaration.' };
  if (!/\s(?:SYSTEM|PUBLIC)\s/.test(declaration)) return { id: null, error: null };
  const id = /\sSYSTEM\s+(['"])(.*?)\1\s*>$/.exec(declaration)?.[2] ??
    /\sPUBLIC\s+(['"])(.*?)\1\s+(['"])(.*?)\3\s*>$/.exec(declaration)?.[4];
  return { id: id ?? null, error: id ? externalIdError(id) : 'Unsupported external DTD dependency declaration.' };
}

/** Audit external identifiers conservatively; xmllint remains the grammar parser. */
async function dependencyErrors(root: string, file: string, visited = new Set<string>()): Promise<string[]> {
  if (visited.has(file)) return [];
  visited.add(file);
  if (visited.size > 128) return ['DTD dependency closure exceeds the supported proof limit.'];
  const read = await auditText(file);
  if (read.error) return [read.error];
  const text = stripComments(read.text);
  // Parameter entities capable of synthesizing declarations cannot be audited
  // from literal identifiers. Refuse rather than certify unexamined resources.
  const internals = [...text.matchAll(/<!ENTITY\s+%\s+[^\s]+\s+(['"])([\s\S]*?)\1\s*>/g)];
  if (internals.some(match => /[<>]|&#/.test(match[2]))) return ['Unprovable DTD dependency: a parameter entity constructs declarations.'];
  const errors: string[] = [];
  const declarations = text.match(/<!ENTITY\s+[\s\S]*?>/g) ?? [];
  for (const declaration of declarations) {
    const { id, error } = declaredDependency(declaration);
    if (error) { errors.push(error); continue; }
    if (!id) continue;
    const resolved = await packagedFile(root, path.resolve(path.dirname(file), id));
    if (!resolved.file) { errors.push(`DTD dependency ${id}: ${resolved.error ?? 'Missing DTD dependency.'}`); continue; }
    errors.push(...await dependencyErrors(root, resolved.file, visited));
  }
  return errors;
}

type DoctypeResolution = { valid: boolean; errors: string[]; file: string | null; missingName: string | null };
async function referencedDtd(root: string, file: string, relPath: string): Promise<DoctypeResolution> {
  const invalid = (message: string): DoctypeResolution => ({ valid: false, errors: [message], file: null, missingName: null });
  const read = await auditText(file);
  if (read.error) return invalid(read.error);
  const xml = stripComments(read.text).replace(/<\?[\s\S]*?\?>/g, '').replace(/^\uFEFF/, '').trimStart();
  if (!/^<!DOCTYPE\s/.test(xml)) return invalid(`${relPath} declares no DOCTYPE. An eCTD backbone must reference its DTD.`);
  const declaration = /^<!DOCTYPE[^<>]*>/.exec(xml)?.[0];
  if (!declaration || declaration.includes('[')) return invalid(`${relPath} has an unsupported DOCTYPE or internal subset; package-contained dependencies cannot be proven.`);
  const systemId = /\sSYSTEM\s+(['"])(.*?)\1\s*>$/.exec(declaration)?.[2] ??
    /\sPUBLIC\s+(['"])(.*?)\1\s+(['"])(.*?)\3\s*>$/.exec(declaration)?.[4];
  if (!systemId) return invalid(`${relPath} has a DOCTYPE with no parseable SYSTEM identifier.`);
  const unsafe = externalIdError(systemId);
  if (unsafe) return invalid(`${relPath}: ${unsafe}`);
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- confined: externalIdError refused URI/absolute/entity ids above, and packagedFile refuses anything outside root or behind a symlink
  const resolved = await packagedFile(root, path.resolve(path.dirname(file), systemId));
  if (resolved.missing) return { valid: true, errors: [], file: null, missingName: path.basename(systemId) };
  if (!resolved.file) return invalid(`${relPath}: ${resolved.error}`);
  const errors = await dependencyErrors(root, resolved.file);
  return { valid: errors.length === 0, errors, file: resolved.file, missingName: null };
}

function lintReport(name: string, result: XmlLintResult): ValidatorRunReport {
  const errors = result.valid ? [] : result.errors.length ? result.errors : ['XML validation did not pass.'];
  return tallyValidationReport(name, result.ran, errors.map(message => ({ severity: 'error', message })));
}

function relativeLint(result: XmlLintResult, root: string): XmlLintResult {
  return { ...result, errors: result.errors.map(error => error.split(root).join('.')) };
}

/** Validate one XML file against the actual declared, confined package DTD. */
export async function validateBackboneFile(packageDir: string, relPath: string): Promise<BackboneValidation> {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- packageDir is the server's own temp package directory, not request input
  const root = await fs.realpath(packageDir).catch(() => path.resolve(packageDir));
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- confined: absolute relPath refused here, and packagedFile refuses anything outside root or behind a symlink
  const resolved = path.isAbsolute(relPath) ? { file: null, error: 'Absolute XML path is not package-relative.' } : await packagedFile(root, path.resolve(root, relPath));
  const referenced = resolved.file ? await referencedDtd(root, resolved.file, relPath) :
    { valid: false, errors: [`${relPath} could not be read: ${resolved.error}`], file: null, missingName: null };
  referenced.errors = referenced.errors.map(error => error.split(root).join('.'));
  const wellFormed = relativeLint(resolved.file && referenced.valid ? await checkWellFormed(resolved.file, true) :
    skipped('well-formed', referenced.errors.join(' ')), root);
  const dtd = relativeLint(referenced.valid && referenced.file && resolved.file ? await validateAgainstDtd(resolved.file) :
    skipped('dtd', referenced.missingName ? `Declared DTD ${referenced.missingName} is missing from the package.` : referenced.errors.join(' ')), root);
  const reports = [lintReport(`xmllint well-formed (${relPath})`, wellFormed),
    tallyValidationReport(`backbone DOCTYPE (${relPath})`, true, referenced.errors.map(message => ({ severity: 'error', message })))];
  if (referenced.valid && referenced.file) reports.push(lintReport(`xmllint DTD (${relPath})`, dtd));
  return { relPath, wellFormed, doctype: { valid: referenced.valid, errors: referenced.errors }, dtd, reports,
    dtdSkipped: referenced.missingName ? { relPath, dtd: referenced.missingName } : null };
}
