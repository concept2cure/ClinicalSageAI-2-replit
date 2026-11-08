/**
 * Auto never approves, signs or answers an approval gate (row 74, slice S4).
 *
 * The run policy decides only how far AnA goes on her own between steps. It
 * must never reach the code that decides whether a step that changes a record
 * may run: that is a person's decision, taken through one route that stamps
 * `humanConfirmed`, and a policy that could influence it would be a setting
 * that approves things. So this pins, in the source, where the policy may NOT
 * appear:
 *
 *   - anywhere in the gate's classifier (governed-tool-gate.ts), which takes
 *     the call and, since P-104, the standing rules read from the database —
 *     nothing a caller could hand a policy in;
 *   - anywhere in the governed-action route (utility.ts), the one place that
 *     sets `humanConfirmed: true`;
 *   - in the stream's approval code, from `settleApprovals` to the end of
 *     `awaitDecision` — the timeout there is a denial whatever the policy, and
 *     the policy reads the timeout only from outside, afterwards;
 *   - in the context a tool handler is called with, so no tool can read it.
 *
 * A structural pin, deliberately: the behaviour it protects is an absence
 * ("the policy has no path to the gate"), and a behavioural test can only
 * sample paths. Each pin was shown red on a mutated copy of the source (the
 * S4 evidence, red-auto-never-approves.txt).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { classifyToolCall } from '../governed-tool-gate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
// The policy by every name it has in the server: the request field, the value,
// its type, and the turn's policy object (TurnPolicy, held as `turnPolicy`).
const POLICY = /\brun_?[Pp]olicy\b|\bAnaRunPolicy\b|\b[tT]urnPolicy\b/;

/** The stream's approval code: the settleApprovals declaration through the end of awaitDecision. */
function approvalSpan(stream: string): string {
  const start = stream.indexOf('const settleApprovals = async (');
  const decision = stream.indexOf('const awaitDecision = async (', start);
  // awaitDecision ends where the next top-level declaration of the block starts.
  const end = stream.indexOf('const executeTools = async (', decision);
  if (start < 0 || decision < 0 || end < 0) throw new Error('approval code not found in stream.ts');
  return stream.slice(start, end);
}

/**
 * The context every tool handler is called with in the stream: its literal and
 * everything done to it before the call. Since a2f9264a the literal is named
 * (`toolContext`) so team coordination and the private lane can bind to it.
 */
function handlerContext(stream: string): string {
  const call = stream.indexOf('handler(toolUse.input, toolContext)');
  if (call < 0) throw new Error('handler call not found in stream.ts');
  const at = stream.lastIndexOf('const toolContext: ToolContext = {', call);
  if (at < 0) throw new Error('handler context literal not found in stream.ts');
  return stream.slice(at, call);
}

/** Every non-test .ts file under server/. */
function serverSources(dir = path.join(REPO_ROOT, 'server')): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...serverSources(full));
    else if (/\.ts$/.test(entry.name) && !/\.(test|spec|dbtest)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the run policy has no path to the approval gate', () => {
  const stream = read('server/routes/ana-ri/stream.ts');

  it('the stream does read a run policy (these pins are not vacuous)', () => {
    expect(stream).toMatch(/\brun_policy\b/);
    expect(stream).toMatch(/\brunPolicy\b/);
  });

  it('never in the gate classifier', () => {
    expect(read('server/services/ana/governed-tool-gate.ts')).not.toMatch(POLICY);
  });

  it('the classifier takes the call and the standing rules the database holds, so no caller can hand it a policy', () => {
    // Since P-104 (4852aa78) its second parameter is the tenant's standing-rule
    // snapshot. Every caller that passes one passes what loadToolSkillGates read,
    // and a rule can only add an approval, never take one away.
    expect(classifyToolCall.length).toBe(2);
    const withRules = [...stream.matchAll(/classifyToolCall\(([^()]*)\)/g)]
      .map(m => m[1].split(',').map(a => a.trim())).filter(args => args.length > 1);
    expect(withRules.length).toBeGreaterThan(0);
    for (const [, rules] of withRules) expect(rules).toBe('gates');
    expect(stream).toMatch(/const gates = await loadToolSkillGates\(/);
    const gates = { organizationId: 1, userId: 2, projectId: null, rules: [], ruleHash: 'e'.repeat(64) };
    expect(classifyToolCall({ name: 'set_qtl', input: { parameter: 'dropout', limit: 0.2 } }, gates).kind).toBe('NEEDS_APPROVAL');
  });

  it('never in the governed-action route that stamps humanConfirmed', () => {
    expect(read('server/routes/ana-ri/utility.ts')).not.toMatch(POLICY);
  });

  it("never in the stream's approval code, settleApprovals through awaitDecision", () => {
    const span = approvalSpan(stream);
    expect(span).toMatch(/requestApproval\(/);
    expect(span).toMatch(/MAX_PAUSE_MS/);
    expect(span).not.toMatch(POLICY);
  });

  it('an unanswered approval is a denial in the gate, whatever the policy', () => {
    const span = approvalSpan(stream);
    // The timeout branch records a denial and returns a refusal; nothing in
    // it can approve.
    expect(span).toMatch(/decided: 'denied'/);
    expect(span).toMatch(/refused\(\s*APPROVAL_TIMEOUT_WHY,/);
  });

  it('never in the context a tool handler is called with', () => {
    const ctx = handlerContext(stream);
    expect(ctx).toMatch(/organizationId: orgId/);
    expect(ctx).not.toMatch(POLICY);
    expect(ctx).not.toMatch(/humanConfirmed/);
  });

  it('humanConfirmed: true is set in one server file only, the governed-action route', () => {
    const setters = serverSources()
      .filter(f => /humanConfirmed:\s*true/.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(REPO_ROOT, f));
    expect(setters).toEqual(['server/routes/ana-ri/utility.ts']);
  });
});
