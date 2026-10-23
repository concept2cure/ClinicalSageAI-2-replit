/**
 * Who took a control, as the Summary and the live run read say it (AnA detach
 * DT3 review, the blocker: an administrator's cancel was credited to the asker
 * — "You stopped the run" — while the same panel's closing row said "Stopped
 * by an administrator."). The control events keep `byUserId`, `byRole` and,
 * for an admin's cancel, the reason given (run-control.ts applyControl). The
 * projection carries who took it in terms its reader may be told:
 *
 *   - the asker reading their own turn: no `by` ("You …"), as before;
 *   - an administrator's cancel: their name ("Stopped by Dana Okafor, an
 *     administrator"), or "user 11" when the name cannot be read — never the
 *     asker, never "System";
 *   - the administrator reading their own cancel: "you, as an administrator";
 *   - anyone else reading the asker's control: "the person who asked", with
 *     no id: the Summary never names the asker (S4 decision 6,
 *     turn-summary.pglite.test.ts test 3).
 */
import { describe, expect, it, vi } from 'vitest';
import { attributeControls, controlsOf } from '../turn-summary.js';

const ASKER = 10;
const ADMIN = 11;
const COLLEAGUE = 13;
const AT = '2026-10-22T10:00:00.000Z';
const RAW = [
  { action: 'interject', round: 1, at: AT, byUserId: ASKER, message: 'Look at 2024 too' },
  { action: 'cancel', round: 2, at: AT, byUserId: ADMIN, byRole: 'admin', reason: 'Wrong agency.' },
];
const names = vi.fn(async (ids: number[]) => new Map(ids.filter(id => id === ADMIN).map(id => [id, 'Dana Okafor'] as const)));

describe('controlsOf keeps the reason an administrator gave, and no person ids', () => {
  it('the reason rides the cancel; byUserId and byRole never reach the projection', () => {
    const controls = controlsOf(RAW)!;
    expect(controls[1]).toEqual({ action: 'cancel', round: 2, at: AT, reason: 'Wrong agency.' });
    expect(JSON.stringify(controls)).not.toMatch(/byUserId|byRole|[:[,](10|11)[,}\]]/);
  });
});

describe('attributeControls: who took each control, for this reader', () => {
  it("the asker reads their own steer as theirs and the admin's cancel by the admin's name", async () => {
    const controls = (await attributeControls(RAW, { viewerUserId: ASKER, askerUserId: ASKER }, names))!;
    expect(controls[0].by).toBeUndefined();
    expect(controls[1]).toMatchObject({ action: 'cancel', reason: 'Wrong agency.', by: { kind: 'administrator', name: 'Dana Okafor' } });
    expect(names).toHaveBeenCalledWith([ADMIN]);
  });

  it('the administrator reads their own cancel as theirs, as an administrator, and the steer as the asker\'s', async () => {
    const controls = (await attributeControls(RAW, { viewerUserId: ADMIN, askerUserId: ASKER }, names))!;
    expect(controls[0].by).toEqual({ kind: 'asker' });
    expect(controls[1].by).toEqual({ kind: 'you_as_administrator' });
  });

  it("a colleague reads neither as theirs, and the asker's id is never in the payload", async () => {
    const controls = (await attributeControls(RAW, { viewerUserId: COLLEAGUE, askerUserId: ASKER }, names))!;
    expect(controls.map(c => c.by)).toEqual([{ kind: 'asker' }, { kind: 'administrator', name: 'Dana Okafor' }]);
    expect(JSON.stringify(controls)).not.toMatch(new RegExp(`[:\\[,]${ASKER}[,}\\]]`));
  });

  it('an administrator whose name cannot be read is "user <id>", and a failed read is the same, never "You"', async () => {
    const none = async () => new Map<number, string | null>();
    const failing = async () => {
      throw new Error('names unavailable');
    };
    for (const readNames of [none, failing]) {
      const controls = (await attributeControls(RAW, { viewerUserId: ASKER, askerUserId: ASKER }, readNames))!;
      expect(controls[1].by).toEqual({ kind: 'administrator', name: `user ${ADMIN}` });
    }
  });

  it('a reader nobody identified is told neither is theirs', async () => {
    const controls = (await attributeControls(RAW, { viewerUserId: null, askerUserId: ASKER }, names))!;
    expect(controls.map(c => c.by?.kind)).toEqual(['asker', 'administrator']);
  });

  it('a record that could not read its controls stays null, never an empty list', async () => {
    expect(await attributeControls(null, { viewerUserId: ASKER, askerUserId: ASKER }, names)).toBeNull();
  });
});
