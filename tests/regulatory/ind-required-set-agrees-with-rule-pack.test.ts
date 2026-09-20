/**
 * What an initial IND requires must have ONE answer in this repository.
 *
 * `services/regulatory/ind-ectd-sections.ts` marks each node `required`, a
 * field its own interface documents as "Required for initial IND filing".
 * `getRequiredSections()` returns those nodes, and two production surfaces
 * treat the result as the definitive required set:
 *
 *   - `validateSequenceLeaves({ filingType: 'initial' })`
 *     (ind-sequence-validation.ts) — every miss becomes a hard blocker in
 *     `evaluateDispatchGate`, whose doc calls `canDispatch` "the authoritative
 *     go/no-go", and that verdict is written to an append-only Part 11 record
 *     by ind-dispatch-snapshot-service.
 *   - `evaluateIndReadiness` (ind-readiness-service.ts), which raises a
 *     `required_section` blocker per miss.
 *
 * The product's own authoritative outline for an initial IND is the `ind:fda`
 * `ich-m4-v2.2` rule pack, seeded by
 * migrations/20260902_ind_fda_outline_v2_2_initial_ind_flags.sql. That pack is
 * what `/api/ectd-compile/:ident/status` reports readiness against, so a
 * sequence can be complete by the pack and blocked by the tree at the same
 * time — two gates, two verdicts, one sequence, and the blocking one is the
 * one that reaches the audit trail.
 *
 * The tree required 28 codes the pack does not, and the two clearest are
 * administrative rather than arguable:
 *
 *   m1.3.3  Debarment Certification. 21 USC 335a / 21 CFR 314.50(a)(5)(iv) is
 *           a MARKETING-application requirement; 21 CFR 312.23 does not ask an
 *           IND for one. The pack contains no 1.3.3 node at all. Three other
 *           models in this repo agree: regional-ctd-templates marks it
 *           `requiredFor: ['nda','bla','anda']`, ctd-module-structure marks it
 *           `required: false` "(marketing applications)", and
 *           required-sections.ts names this exact defect in its header. So does
 *           the gate that actually blocks freeze and transmit —
 *           `requiredModule1Codes`, whose comment reads "a debarment
 *           certification for a marketing application".
 *   m1.3.1  Contact/Agent Information. The pack marks it `mandatory: false`
 *           ("post-initial changes"), and regional-ctd-templates marks it
 *           `required: false` because "Initial contact details travel on Form
 *           1571 / 356h".
 *
 * This test reads BOTH sides from their sources rather than from a list copied
 * into it, so it keeps holding as either changes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getAllINDSections, getRequiredSections } from '../../services/regulatory/ind-ectd-sections';

const MIGRATION = path.resolve(
  process.cwd(),
  'migrations/20260902_ind_fda_outline_v2_2_initial_ind_flags.sql',
);

/** The `ind:fda` ich-m4-v2.2 outline, read from the migration that seeds it. */
function rulePackMandatoryCodes(): Set<string> {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const m = /\$pack\$(\[[\s\S]*?\])\$pack\$/.exec(sql);
  if (!m) throw new Error('rule pack JSON not found in the migration');
  const nodes = JSON.parse(m[1]) as Array<{ key: string; mandatory?: boolean }>;
  return new Set(nodes.filter((n) => n.mandatory).map((n) => n.key));
}

/** `m3.2.S.1` -> `3.2.S.1`; a bare module (`m1`) -> the pack's `M1`. */
function normalize(code: string): string {
  const bare = /^m(\d)$/i.exec(code);
  if (bare) return `M${bare[1]}`;
  return /^m\d/i.test(code) ? code.slice(1) : code;
}

describe('the initial-IND required set has one answer across the repo', () => {
  it('requires nothing the product’s own IND rule pack does not', () => {
    const pack = rulePackMandatoryCodes();
    expect(pack.size, 'the rule pack should be readable and non-trivial').toBeGreaterThan(40);

    const overreach = getRequiredSections()
      .map((s) => s.code)
      .filter((code) => !pack.has(normalize(code)))
      .sort();

    expect(
      overreach,
      'these are marked "required for initial IND filing" but the ind:fda ich-m4-v2.2 outline ' +
        'does not require them, so the dispatch gate blocks a sequence the compile status calls complete',
    ).toEqual([]);
  });

  it('never asks an IND for a marketing-application debarment certification', () => {
    /* Pinned on its own because it is the least arguable of the set and the
       one four other models in this repo already agree about. */
    const debarment = getAllINDSections().find((s) => s.code === 'm1.3.3');
    expect(debarment, 'm1.3.3 should still exist in the tree — it is a real NDA/BLA section').toBeTruthy();
    expect(debarment!.title).toMatch(/debarment/i);
    expect(
      debarment!.required,
      '21 CFR 312.23 does not ask an IND for a debarment certification (21 USC 335a is a marketing requirement)',
    ).toBe(false);
  });

  it('does not demand contact/agent information an initial IND files on Form 1571', () => {
    const contact = getAllINDSections().find((s) => s.code === 'm1.3.1');
    expect(contact).toBeTruthy();
    expect(
      contact!.required,
      'the rule pack marks 1.3.1 mandatory:false (post-initial changes); initial contact details travel on Form 1571',
    ).toBe(false);
  });
});
