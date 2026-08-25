/**
 * The propose-only partition — an agent may ask, a person must act.
 *
 * WHAT THIS PROTECTS
 * `executeCommands` refuses any command in PROPOSE_ONLY_COMMANDS unless the
 * dispatch carries `ctx.humanConfirmed === true`, which only the governed-action
 * route sets, and only after GovernedActionSignoff has collected the user's
 * reason and (for the e-sign tier) re-authenticated them.
 *
 * That is a STRUCTURAL guarantee rather than a convention, and it rests on two
 * properties that code review alone will not keep true:
 *
 *   1. The partition is DERIVED from COMMAND_AUTHORIZATION, so a newly
 *      registered governed handler joins it automatically. A hand-maintained
 *      list drifts, and the drift is silent — a new approve-shaped command
 *      would simply become agent-executable with nothing to say so.
 *   2. `humanConfirmed` has exactly ONE writer. A second one anywhere would
 *      turn the guarantee back into a convention, and the second writer is
 *      always the one nobody is watching.
 *
 * Property 2 can only be checked across the whole tree, so it is a source grep.
 * That is legitimate here for the same reason the repo already greps for
 * registry coverage: the claim IS "one writer", and no unit test can assert it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  COMMAND_AUTHORIZATION,
  PROPOSE_ONLY_COMMANDS,
  isProposeOnlyCommand,
} from '../command-rbac';

const SERVER_ROOT = resolve(__dirname, '../../..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      sourceFiles(p, out);
    } else if (/\.ts$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('membership', () => {
  it('covers the three approve-class commands that sit in NEITHER Part 11 set', () => {
    // These carry requiresConfirmation and a manager role but no
    // requiresReasonForChange and no requiresSignature, so validateSignoff is
    // never consulted for them and no signature can ever be demanded. Their
    // only other gate is params.confirm — a string the MODEL writes, which
    // cannot tell a relayed human yes from the model confirming itself. This
    // partition is the only thing standing in front of them.
    for (const c of ['section.approve', 'post_market.document.approve', 'post_market.document.supersede']) {
      expect(isProposeOnlyCommand(c), `${c} must be propose-only`).toBe(true);
    }
  });

  it('covers every command in both Part 11 tiers', () => {
    const missing = Object.entries(COMMAND_AUTHORIZATION)
      .filter(([, a]) => a.requiresSignature === true || a.requiresReasonForChange === true)
      .map(([name]) => name)
      .filter(name => !PROPOSE_ONLY_COMMANDS.has(name));
    expect(missing).toEqual([]);
  });

  it('does NOT swallow ordinary authoring mutations', () => {
    // The partition has to stay narrow enough to leave AnA useful. Creating a
    // task or updating a draft is work, not attestation; blocking it would
    // trade a real capability for no control.
    for (const c of ['create_task', 'update_task', 'create_project', 'update_project', 'create_artifact']) {
      expect(isProposeOnlyCommand(c), `${c} must remain agent-executable`).toBe(false);
    }
  });

  it('contains only writes', () => {
    const reads = [...PROPOSE_ONLY_COMMANDS].filter(
      c => COMMAND_AUTHORIZATION[c]?.effect !== 'write'
    );
    expect(reads).toEqual([]);
  });

  it('is derived, so a new governed command cannot ship outside it', () => {
    // Re-evaluate the documented rule independently of the implementation. If
    // someone converts the derivation into a hand-list, this diverges.
    const expected = Object.entries(COMMAND_AUTHORIZATION)
      .filter(([, a]) =>
        a.effect === 'write' &&
        (a.requiresSignature === true ||
          a.requiresReasonForChange === true ||
          (a.requiresConfirmation === true && a.minRole === 'manager'))
      )
      .map(([name]) => name)
      .sort();
    expect([...PROPOSE_ONLY_COMMANDS].sort()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(10);
  });
});

describe('single writer', () => {
  it('assigns humanConfirmed in exactly one source file', () => {
    // An assignment, not a mention: the type declaration, the gate's read, and
    // prose in comments are all legitimate and must not count.
    const hits = sourceFiles(SERVER_ROOT)
      .filter(f => /humanConfirmed\s*:\s*true/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(SERVER_ROOT.length + 1));

    expect(hits).toEqual(['routes/ana-ri/utility.ts']);
  });

  it('never reads the confirmation out of command params', () => {
    // params is the model's only writable channel into a dispatch. A gate that
    // read the flag from there could be satisfied by the model asserting it —
    // which is exactly the weakness of the params.confirm gate this partition
    // was added to cover.
    const executor = readFileSync(join(SERVER_ROOT, 'services/ana-ri/command-executor.ts'), 'utf8');
    expect(executor).not.toMatch(/params[^\n]*humanConfirmed/);
    expect(executor).toMatch(/ctx\.humanConfirmed !== true/);
  });
});
