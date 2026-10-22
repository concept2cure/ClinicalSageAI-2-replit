#!/usr/bin/env node
/** P-3 history protection: update the known ruleset only; dry-run unless --apply. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY = 'concept2cure/ClinicalSageAI-2-replit';
export const BRANCH = 'concept2cure-v2';
export const RULESET_ID = 11855901;
const REF = `refs/heads/${BRANCH}`;
const GUARDS = ['deletion', 'non_fast_forward'];
const BASE = `repos/${REPOSITORY}`;
const RULESET_PATH = `${BASE}/rulesets/${RULESET_ID}`;
const BRANCH_RULES_PATH = `${BASE}/rules/branches/${BRANCH}`;

/** Compare writable policy, without readonly GitHub metadata or object-key ordering. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const clone = value => JSON.parse(JSON.stringify(value));
function writable(ruleset) {
  const { name, target, enforcement, conditions, rules, bypass_actors } = ruleset;
  return clone({ name, target, enforcement, conditions, rules, bypass_actors });
}
function requireRulesetIdentity(ruleset) {
  if (ruleset?.id !== RULESET_ID || ruleset.source !== REPOSITORY || ruleset.source_type !== 'Repository' || ruleset.target !== 'branch') {
    throw new Error('Unexpected repository, ruleset ID, source or target; refusing a settings change.');
  }
}

function requireHistoryPolicy(ruleset, branchRules) {
  if (!Array.isArray(ruleset.rules) || !Array.isArray(ruleset.bypass_actors)) throw new Error('Malformed ruleset policy.');
  const refs = ruleset.conditions?.ref_name;
  if (!Array.isArray(refs?.include) || !Array.isArray(refs?.exclude)) throw new Error('Malformed branch conditions.');
  if (refs.exclude.length) throw new Error('Existing exclusions require operator review; they will not be removed or guessed.');
  if (ruleset.rules.some(rule => !GUARDS.includes(rule.type))) throw new Error('Additional existing rule types require operator review; no control will be replaced or silently activated.');
  if (!Array.isArray(branchRules)) throw new Error('Malformed applied branch rules.');
  if (branchRules.some(rule => GUARDS.includes(rule.type) && rule.ruleset_id !== RULESET_ID)) {
    throw new Error('Another applicable history-protection ruleset exists; refusing an overlapping rule.');
  }
}

export function planHistoryRuleset({ repository, ruleset, branchRules = [] }) {
  if (repository?.default_branch !== BRANCH) throw new Error('The default branch is not the canonical product branch; refusing a settings change.');
  requireRulesetIdentity(ruleset);
  requireHistoryPolicy(ruleset, branchRules);
  const before = writable(ruleset);
  const payload = writable(ruleset);
  payload.enforcement = 'active';
  if (!payload.conditions.ref_name.include.includes(REF)) payload.conditions.ref_name.include.push(REF);
  for (const type of GUARDS) if (!payload.rules.some(rule => rule.type === type)) payload.rules.push({ type });
  return { rulesetId: RULESET_ID, before, payload, changed: !equal(before, payload) };
}

/** A policy readback AND effective branch rule IDs are required before claiming enforcement. */
export function verifyHistoryReadback(plan, ruleset, branchRules) {
  requireRulesetIdentity(ruleset);
  if (!equal(writable(ruleset), plan.payload)) throw new Error('Ruleset readback differs from the exact requested policy; enforcement is not verified.');
  if (!Array.isArray(branchRules) || !GUARDS.every(type => branchRules.some(rule => rule.type === type && rule.ruleset_id === RULESET_ID))) {
    throw new Error('Effective branch rules do not prove both guards from the expected ruleset; enforcement is not verified.');
  }
}

/** Injectable transport makes mutation, drift, idempotency and readback independently testable. */
export async function activateHistoryRuleset({ api, apply = false, save = () => {} }) {
  const repository = await api('GET', BASE);
  const ruleset = await api('GET', RULESET_PATH);
  const branchRules = await api('GET', BRANCH_RULES_PATH);
  const plan = planHistoryRuleset({ repository, ruleset, branchRules });
  save('before.json', ruleset); save('branch-rules-before.json', branchRules); save('payload.json', plan.payload);
  if (!apply) return { status: 'planned', changed: plan.changed, verified: false, plan };
  if (plan.changed) {
    const fresh = await api('GET', RULESET_PATH);
    requireRulesetIdentity(fresh);
    if (!equal(writable(fresh), plan.before)) throw new Error('Ruleset policy changed since planning; refusing to overwrite it. Rerun and review.');
    await api('PUT', RULESET_PATH, plan.payload);
  }
  const readback = await api('GET', RULESET_PATH);
  const effective = await api('GET', BRANCH_RULES_PATH);
  save('readback.json', readback); save('branch-rules-readback.json', effective);
  verifyHistoryReadback(plan, readback, effective);
  return { status: plan.changed ? 'applied-and-verified' : 'already-active-and-verified', changed: plan.changed, verified: true, plan };
}

function githubCliApi(method, path, body) {
  const args = ['api', '--method', method, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', path];
  if (body) args.push('--input', '-');
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }));
  } catch {
    throw new Error(`GitHub API ${method} ${path} failed. Run from an authenticated GitHub CLI environment with repository-administration access; no enforcement is claimed.`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const allowed = new Set(['--apply', '--snapshot', '--evidence-dir']);
  let snapshotFile; let evidenceDir; let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (arg === '--apply') apply = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`A value is required for ${arg}`);
      if (arg === '--snapshot') snapshotFile = value;
      else evidenceDir = value;
    }
  }
  if (snapshotFile && apply) throw new Error('Offline snapshot planning cannot apply or verify live enforcement.');
  const save = evidenceDir ? (name, data) => {
    mkdirSync(resolve(evidenceDir), { recursive: true });
    writeFileSync(resolve(evidenceDir, name), `${JSON.stringify(data, null, 2)}\n`);
  } : () => {};
  if (snapshotFile) {
    const ruleset = JSON.parse(readFileSync(resolve(snapshotFile), 'utf8'));
    const plan = planHistoryRuleset({ repository: { default_branch: BRANCH }, ruleset });
    save('payload.json', plan.payload);
    console.info(JSON.stringify({ status: 'offline-plan', verified: false, payload: plan.payload }, null, 2));
    return;
  }
  if (apply && !evidenceDir) throw new Error('--apply requires --evidence-dir to retain the before, payload and live readback.');
  const result = await activateHistoryRuleset({ api: githubCliApi, apply, save });
  console.info(JSON.stringify({ status: result.status, changed: result.changed, verified: result.verified, payload: result.plan.payload }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
