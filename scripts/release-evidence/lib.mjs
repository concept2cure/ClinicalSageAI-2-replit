import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const DISCLAIMER = 'Automated evidence does not establish that the product is validated, compliant, production-ready, or agency-ready; those conclusions require governed review by authorized people.';
export const RESULT_KEYS = ['tests', 'securityScan', 'blankDatabase', 'upgrade', 'productionBoot', 'browserSmoke'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

export async function resolveEvidencePath(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Evidence path must be repository-relative: ${relative || '<empty>'}`);
  const resolved = path.resolve(root, relative);
  const canonicalRoot = await realpath(root);
  if (resolved !== canonicalRoot && !resolved.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error(`Evidence path escapes the repository: ${relative}`);
  let canonical;
  try { canonical = await realpath(resolved); } catch { return resolved; }
  if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error(`Evidence path escapes the repository: ${relative}`);
  return canonical;
}

export async function verifyArtifactFiles(manifest, root) {
  const errors = [];
  for (const artifact of manifest?.artifacts || []) {
    let file;
    try { file = await resolveEvidencePath(root, artifact.path); }
    catch (error) { errors.push(error.message); continue; }
    try {
      const actual = sha256(await readFile(file));
      if (actual !== artifact.sha256) errors.push(`artifact ${artifact.id} content hash changed`);
    } catch { errors.push(`artifact ${artifact.id} file is missing`); }
  }
  return errors;
}

async function hashFiles(files, root) {
  const entries = [];
  for (const name of files.sort()) entries.push(`${name}\0${sha256(await readFile(path.join(root, name)))}\n`);
  return sha256(entries.join(''));
}
async function recursiveFiles(root, relative = '') {
  const directory = path.join(root, relative);
  try { if (!(await stat(directory)).isDirectory()) return [relative]; } catch { return []; }
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) { for (const file of await recursiveFiles(root, child)) result.push(file); }
    else if (entry.isFile()) result.push(child);
  }
  return result;
}
export async function repositoryFingerprints(root) {
  let lockPath=null;
  for (const candidate of ['package-lock.json','npm-shrinkwrap.json','yarn.lock','pnpm-lock.yaml']) {
    try { if ((await stat(path.join(root,candidate))).isFile()) { lockPath=candidate; break; } } catch {}
  }
  const migrations = (await recursiveFiles(root, 'db/migrations')).concat(await recursiveFiles(root, 'migrations')).filter(f => f.endsWith('.sql') || f.endsWith('.json'));
  const schemas = (await recursiveFiles(root, 'schemas')).filter(f => f.endsWith('.json') || f.endsWith('.sql'));
  return {
    dependencyLockSha256: lockPath ? sha256(await readFile(path.join(root, lockPath))) : 'missing',
    migrationSetSha256: migrations.length ? await hashFiles(migrations, root) : 'missing',
    schemaSha256: schemas.length ? await hashFiles(schemas, root) : 'missing'
  };
}

export function validateManifest(m, expected = {}) {
  const errors = [];
  const hash = /^[0-9a-f]{64}$/; const oid = /^[0-9a-f]{40}$/;
  if (m?.schemaVersion !== '1.0.0') errors.push('unsupported schemaVersion');
  if (!oid.test(m?.repository?.commit || '') || !oid.test(m?.repository?.tree || '')) errors.push('invalid repository commit/tree');
  if (m?.repository?.dirty !== false) errors.push('dirty repository evidence is prohibited');
  if (expected.policySha256 && m?.policy?.sha256 !== expected.policySha256) errors.push('manifest release policy is missing or changed');
  if (expected.commit && m?.repository?.commit !== expected.commit) errors.push('manifest commit does not match checked-out commit');
  if (expected.tree && m?.repository?.tree !== expected.tree) errors.push('manifest tree does not match checked-out tree');
  for (const key of ['dependencyLockSha256','migrationSetSha256','schemaSha256']) {
    const value=m?.fingerprints?.[key]; if (!(hash.test(value || '') || ['missing','unknown'].includes(value))) errors.push(`invalid ${key}`);
    if (expected.fingerprints?.[key] && value !== expected.fingerprints[key]) errors.push(`changed ${key}`);
  }
  const artifactIds = new Set();
  const artifactsById = new Map();
  for (const a of m?.artifacts || []) {
    if (artifactIds.has(a.id)) errors.push(`duplicate artifact id ${a.id}`); else artifactIds.add(a.id);
    if (a.status !== 'verified' || !hash.test(a.sha256 || '')) errors.push(`artifact ${a.id} is ${a.status || 'invalid'}`);
    if (a.commit !== m.repository.commit || a.tree !== m.repository.tree) errors.push(`artifact ${a.id} is stale`);
    artifactsById.set(a.id, a);
  }
  const workflowKeys = new Set();
  for (const w of m?.workflows || []) {
    const key=`${w.workflow}/${w.job}`;
    if (workflowKeys.has(key)) errors.push(`duplicate workflow ${key}`); else workflowKeys.add(key);
    if (w.required && (w.conclusion !== 'success' || w.headSha !== m.repository.commit)) errors.push(`required workflow ${key} is ${w.conclusion}`);
  }
  for (const required of expected.policy?.requiredJobs || []) if (!workflowKeys.has(`${required.workflow}/${required.job}`)) errors.push(`required policy workflow ${required.workflow}/${required.job} is missing`);
  for (const key of RESULT_KEYS) {
    const result=m?.automatedEvidence?.[key];
    if (result?.status !== 'passed') errors.push(`${key} automated proof is ${result?.status || 'missing'}`);
    if (!result?.artifactId || !artifactIds.has(result.artifactId)) errors.push(`${key} does not reference a verified artifact`);
    const requiredKind=expected.policy?.requiredAutomatedEvidence?.find(item=>item.key===key)?.artifactKind;
    if (requiredKind && artifactsById.get(result?.artifactId)?.kind !== requiredKind) errors.push(`${key} must reference a ${requiredKind} artifact`);
    const s=result?.summary;
    if (s && s.total !== s.passed+s.failed+s.skipped+s.unknown) errors.push(`${key} summary counts do not total`);
    if (result?.count !== s?.total) errors.push(`${key} count does not match summary total`);
    if (result?.status === 'passed' && (s?.failed !== 0 || s?.skipped !== 0 || s?.unknown !== 0)) errors.push(`${key} cannot pass with failed, skipped, or unknown results`);
  }
  for (const a of m?.humanApprovals || []) {
    if (a.status !== 'unapproved' || a.signer !== null || a.signedAt !== null || a.signature !== null || a.authorizationEvidence !== null) errors.push(`${a.role} approval must remain blank and unapproved; attach the separate governed signature record`);
  }
  const roles=(m?.humanApprovals || []).map(a=>a.role);
  for (const role of expected.policy?.humanApprovalRoles || []) if (roles.filter(value=>value===role).length !== 1) errors.push(`human approval role ${role} must appear exactly once`);
  if (m?.disclaimer !== DISCLAIMER) errors.push('required automated-evidence disclaimer is missing');
  return errors;
}
