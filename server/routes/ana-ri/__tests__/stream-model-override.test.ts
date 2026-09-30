/**
 * A model the person pins is governed the way the gateway governs it, and a
 * refused pin is said, not swallowed.
 *
 * resolveModelOverride (effort.ts) is now gated on approved-models and, on
 * high-risk work, on approvedForHighRisk. Its unit tests prove the gate. What
 * they cannot prove is that the stream route asks it the right question:
 *
 *   1. The route passes `highRisk`, computed by isHighRiskRequest from the SAME
 *      taskType and riskTier the gateway is sent for this turn. Any other input
 *      and the route could pin a model the gateway would then refuse outright,
 *      or accept a pin the gateway would have been right to refuse.
 *   2. A NON-BLANK STRING override that resolves to null writes one
 *      MODEL_OVERRIDE_REFUSED warning frame, in the shape the route family
 *      already writes warnings in (`{ type: 'warning', message }`, see
 *      post-processing.ts), before the model is called. An absent, empty,
 *      blank or non-string override writes nothing: most turns carry none, and
 *      `false` or `0` is not "the model you chose".
 *
 * Driving the whole SSE route to observe one frame would test the mocks, so
 * this reads the source, like the carriage block in
 * useAnaChat-tool-result-pairing.test.ts. The guard is not matched by its
 * spelling: the condition is lifted out of the source and EVALUATED over the
 * cases that matter, so a rewrite that keeps the behaviour stays green and one
 * that changes it goes red. Proven by mutation (evidence:
 * docs/evidence/ANA-AGENTS/2026-09-27/S2-honest-controls/mutations.txt): each
 * half of the guard, the highRisk option, and the riskTier on each gw.route
 * that carries the pin.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const src = fs.readFileSync(path.join(REPO_ROOT, 'server/routes/ana-ri/stream.ts'), 'utf8');

const REFUSED_FRAME = {
  type: 'warning',
  code: 'MODEL_OVERRIDE_REFUSED',
  // Present tense, and no "governed": the frame is written BEFORE any model is
  // called (the default can still fail), and the default it names is the tier or
  // strategy choice, which is not itself checked against approved-models on a
  // turn that is not high-risk. Review objections 1 and 2.
  message: 'The model you chose is not available or approved for this work, so AnA is answering with the default model.',
};

describe('stream.ts asks the override gate the gateway’s question', () => {
  const call = src.match(
    /resolveModelOverride\(\s*model_override,\s*overrideCandidates,\s*\{\s*highRisk:\s*([^}]{1,200}?)\s*,?\s*\}\s*,?\s*\)/,
  );

  it('passes a highRisk option to resolveModelOverride', () => {
    expect(call, 'resolveModelOverride is not called with { highRisk }').not.toBeNull();
  });

  it('computes it with isHighRiskRequest from the routing plan’s taskType and riskTier', () => {
    expect(call, 'resolveModelOverride is not called with { highRisk }').not.toBeNull();
    let expr = call![1].trim();
    // Inline, or through one named const — either is the same question.
    if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
      const decl = src.match(new RegExp(`const\\s+${expr}\\s*=\\s*([^;]{1,200});`));
      expect(decl, `no declaration for ${expr}`).not.toBeNull();
      expr = decl![1].trim();
    }
    expect(expr).toMatch(/^isHighRiskRequest\(\s*routingPlan\.taskType,\s*routingPlan\.riskTier\s*\)$/);
    expect(src).toMatch(/import\s*\{[^}]*\bisHighRiskRequest\b[^}]*\}\s*from\s*'\.\.\/\.\.\/services\/ai-governance\/approved-models\.js'/);
  });

  it('the gateway is sent that same taskType and riskTier on every call that carries the pin', () => {
    // Each spread of the resolved pin sits in a gw.route request whose
    // taskType and riskTier are the routing plan's — the inputs the gateway's
    // own high-risk check reads (gateway.ts approvedForTask / selectModel).
    const spreads = src.match(/\.\.\.\(resolvedOverride\b/g) ?? [];
    const routed = src.match(
      /gw\.route\(\{\s*taskType:\s*routingPlan\.taskType,[\s\S]{0,1200}?riskTier:\s*routingPlan\.riskTier,[\s\S]{0,1500}?\.\.\.\(resolvedOverride\b/g,
    ) ?? [];
    expect(spreads.length).toBeGreaterThan(0);
    expect(routed.length).toBe(spreads.length);
  });
});

describe('a refused pin is said, once, and only when one was asked for', () => {
  const at = src.indexOf("'MODEL_OVERRIDE_REFUSED'");

  it('writes the frame in exactly one place', () => {
    expect(at, 'no MODEL_OVERRIDE_REFUSED frame').toBeGreaterThan(-1);
    expect(src.indexOf("'MODEL_OVERRIDE_REFUSED'", at + 1)).toBe(-1);
  });

  it('the frame is the route family’s warning shape, with the code and the plain message', () => {
    const lit = src.match(/JSON\.stringify\((\{[^{}]*'MODEL_OVERRIDE_REFUSED'[^{}]*\})\)/);
    expect(lit, 'frame literal not found').not.toBeNull();
    // A literal of string properties only; evaluating it is reading it.
    const frame = new Function(`return (${lit![1]});`)();
    expect(frame).toEqual(REFUSED_FRAME);
    expect(src.slice(at - 400, at)).toMatch(/res\.write\(\s*`data: \$\{JSON\.stringify\(\{[^{}]*$/);
  });

  it('is written after the pin is resolved and before the model is first called', () => {
    const resolvedAt = src.indexOf('const resolvedOverride = resolveModelOverride(');
    const firstRoute = src.indexOf('gw.route(', resolvedAt);
    expect(resolvedAt).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(resolvedAt);
    expect(at).toBeLessThan(firstRoute);
  });

  it('is guarded by "a named model (a non-blank string) resolved to null" — evaluated, not spelled', () => {
    const m = src.match(
      /if\s*\(([^{]{1,300}?)\)\s*\{\s*res\.write\(\s*`data: \$\{JSON\.stringify\(\{[^{}]*'MODEL_OVERRIDE_REFUSED'/,
    );
    expect(m, 'the frame is not written directly under an if').not.toBeNull();
    const cond = m![1];
    // The guard may read only these three names; anything else throws here,
    // which fails the test rather than guessing what it would do.
    const guard = new Function('resolvedOverride', 'model_override', 'res', `return Boolean(${cond});`) as (
      r: unknown,
      o: unknown,
      res: { writableEnded: boolean },
    ) => boolean;
    const open = { writableEnded: false };
    const pinned = { id: 'claude-opus-4', provider: 'anthropic', model: 'claude-opus-5-5' };

    // Asked for, refused → said.
    expect(guard(null, 'claude-opus-9-preview', open)).toBe(true);
    expect(guard(null, 'claude-sonnet-4', open)).toBe(true);
    // Asked for, honoured → nothing to say.
    expect(guard(pinned, 'claude-opus-4', open)).toBe(false);
    // Not asked for → nothing to say, whatever resolved.
    expect(guard(null, undefined, open)).toBe(false);
    expect(guard(null, null, open)).toBe(false);
    expect(guard(null, '', open)).toBe(false);
    // Not a model choice at all → not "the model you chose" (objection 5).
    // resolveModelOverride refuses anything that is not a string, so these
    // resolve to null; the frame must still not claim a choice was made.
    expect(guard(null, false, open)).toBe(false);
    expect(guard(null, 0, open)).toBe(false);
    expect(guard(null, '   ', open)).toBe(false);
    expect(guard(null, '\t\n', open)).toBe(false);
    // A stream already ended is not written to (objection 20).
    expect(guard(null, 'claude-opus-9-preview', { writableEnded: true })).toBe(false);
  });
});
