/**
 * The `if:` evaluator the CI contract tests stand on (workflow-expression.ts).
 * If it answered wrongly, "the push does not run after a failed scan" could
 * pass for the wrong reason, so the runner semantics it relies on are pinned
 * here, each against the documented behaviour of GitHub Actions expressions.
 */
import { describe, expect, it } from 'vitest';
import { evaluateIf, type StatusFns } from './workflow-expression';

const OK: StatusFns = { success: true, failure: false, cancelled: false };
const FAILED: StatusFns = { success: false, failure: true, cancelled: false };
const github = { event_name: 'push', ref: 'refs/tags/v1.0.0', event: {} };
const run = (cond: unknown, status = OK, contexts: Record<string, unknown> = {}) =>
  evaluateIf(cond, { status, contexts: { github, steps: {}, needs: {}, env: {}, ...contexts } });

describe('evaluateIf', () => {
  it('no condition, or one with no status function, means success() && (…)', () => {
    expect(run(undefined)).toBe(true);
    expect(run(undefined, FAILED)).toBe(false);
    expect(run("${{ github.event_name == 'push' }}", FAILED)).toBe(false);
    expect(run(true, FAILED)).toBe(false);
  });

  it('a status function replaces the implicit success()', () => {
    expect(run('always()', FAILED)).toBe(true);
    expect(run('!cancelled()', FAILED)).toBe(true);
    expect(run('failure()', FAILED)).toBe(true);
    expect(run('success() && true', FAILED)).toBe(false);
  });

  it('a missing property is null, and null compares unequal to a non-numeric string', () => {
    // On a tag push github.event.inputs does not exist: the deploy steps still run.
    expect(run("${{ github.event.inputs.deploy_api != 'false' }}")).toBe(true);
    expect(run("github.event.inputs.deploy_api == 'true'")).toBe(false);
    expect(run("${{ github.event.inputs.deploy_api != 'false' }}", OK, { github: { ...github, event: { inputs: { deploy_api: 'false' } } } })).toBe(false);
  });

  it('== is case-insensitive on strings, and null equals the empty string (both are 0)', () => {
    expect(run("github.event_name == 'PUSH'")).toBe(true);
    expect(run("env.MISSING == ''")).toBe(true);
  });

  it('reads hyphenated names, index access, functions, && / || and parentheses', () => {
    const needs = { 'deploy-api': { result: 'skipped' }, 'deploy-frontend': { result: 'success' } };
    const cond = "always() && (needs.deploy-api.result == 'success' || (github.event.inputs.deploy_api == 'false' && needs['deploy-frontend'].result == 'success'))";
    expect(run(cond, OK, { needs })).toBe(false);
    expect(run(cond, OK, { needs: { ...needs, 'deploy-api': { result: 'success' } } })).toBe(true);
    expect(run("startsWith(github.ref, 'refs/tags/v') && contains(github.ref, 'V1')")).toBe(true);
  });

  it('throws on what it cannot read, instead of answering either way', () => {
    expect(() => run('hashFiles(\'x\') != \'\'')).toThrow(/does not implement/);
    expect(() => run('nosuchcontext.x')).toThrow(/unknown context/);
    expect(() => run("${{ github.ref }} == 'x'")).toThrow(/non-empty string/);
    expect(() => run("github.ref == 'x' &&")).toThrow();
  });
});
