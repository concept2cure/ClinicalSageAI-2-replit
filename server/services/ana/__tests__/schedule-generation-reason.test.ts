/** Actual registered handler transport after ordinary confirmation/role gates.
 * Persistence and preservation guarantees belong to the native schedule suite. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  generate: vi.fn(),
  admit: vi.fn(async () => ({ projectId: 12, programId: null, projectRef: '12' })),
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../project-scope-admission', async original => ({ ...await original<Record<string, unknown>>(), admitAnaProjectScope: H.admit }));
vi.mock('../../projects/schedule-of-events', () => ({ generateProjectSchedule: H.generate }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: H.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: H.resolveSignerOrgRole }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { GENERATE_SCHEDULE_OF_EVENTS } from '../discovery-cheminformatics-tool-defs';
import { SchedulePreservationConflict } from '../../projects/schedule-of-events/preservation';
import { STATED_REASON_INPUT } from '../stated-reason-input';

const sqlClient = { query: vi.fn() };
const context: ToolContext = { sqlClient, organizationId: 3, userId: 7, projectId: 12, projectType: 'IND', humanConfirmed: true };
const view = { plan: { id: 5, version: 2 }, milestones: [{ id: 9, key: 'kickoff' }], goals: [], health: {} };
const run = async (input: Record<string, unknown> = {}, ctx: ToolContext = context) =>
  JSON.parse(await getToolHandler('generate_schedule_of_events')!(input, ctx));

beforeEach(() => {
  H.admit.mockImplementation(async () => ({ projectId: 12, programId: null, projectRef: '12' }));
  H.generate.mockReset();
  H.generate.mockResolvedValue(view);
  H.resolveSignerOrgRole.mockReset();
  H.resolveSignerOrgRole.mockResolvedValue('member');
});

describe('schedule generation caller reason', () => {
  it('asks for the person\'s stated reason in the actual tool definition', () => {
    expect(GENERATE_SCHEDULE_OF_EVENTS.input_schema.properties?.reason).toEqual(STATED_REASON_INPUT);
    expect(GENERATE_SCHEDULE_OF_EVENTS.input_schema.required).toContain('reason');
  });

  it('passes the stated reason trimmed and keeps trusted project context', async () => {
    const result = await run({ reason: '  Sponsor requested a revised target.  ', organizationId: 99, projectId: 99 });
    expect(result).toEqual({ source: 'AnA Schedule of Events', ...view });
    expect(H.resolveSignerOrgRole).toHaveBeenCalledWith(7, 3);
    expect(H.generate).toHaveBeenCalledExactlyOnceWith({
      orgId: 3, projectId: 12, projectType: 'IND', baselineDate: null, targetDate: null,
      goals: undefined, reason: 'Sponsor requested a revised target.', triggeredBy: 'ana_user', createdByAna: true,
    }, { actorUserId: 7, executor: sqlClient });
  });

  it.each([undefined, null, '', '   ', 42, { approved: true }, 'short', '   ok     '])('refuses an unstated or insufficient reason %j before the service call', async reason => {
    const result = await run({ reason });
    expect(result).toMatchObject({ ok: false, code: 'REASON_REQUIRED', reasonRequired: true, tool: 'generate_schedule_of_events' });
    expect(result.error).toContain('Do not write a reason they did not give.');
    expect(result).not.toHaveProperty('plan');
    expect(H.generate).not.toHaveBeenCalled();
  });

  it('asks for the missing reason before asking for confirmation', async () => {
    const result = await run({}, { ...context, humanConfirmed: false });
    expect(result).toMatchObject({ code: 'REASON_REQUIRED', reasonRequired: true });
    expect(H.resolveSignerOrgRole).not.toHaveBeenCalled();
    expect(H.generate).not.toHaveBeenCalled();
  });

  it('retains the useful no-change message from a preservation conflict', async () => {
    const conflict = new SchedulePreservationConflict('The milestone requirements changed. Explicit review is required; nothing was changed.');
    H.generate.mockRejectedValueOnce(conflict);
    const result = await run({ reason: 'The sponsor requested a new target.' });
    expect(result.error).toContain(conflict.message);
    expect(result).not.toHaveProperty('plan');
    expect(result).not.toHaveProperty('milestones');
    expect(H.generate).toHaveBeenCalledOnce();
  });

  it('a supplied reason does not replace the existing human confirmation gate', async () => {
    const result = await run({ reason: 'The sponsor requested a new target.', humanConfirmed: true }, { ...context, humanConfirmed: false });
    expect(result.error).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(result.data).toMatchObject({ tier: 'reason', reasonRequired: true });
    expect(H.resolveSignerOrgRole).not.toHaveBeenCalled();
    expect(H.generate).not.toHaveBeenCalled();
  });

  it('a supplied reason does not replace the current editor role', async () => {
    H.resolveSignerOrgRole.mockResolvedValueOnce('viewer');
    const result = await run({ reason: 'The sponsor requested a new target.' });
    expect(result.error).toContain('Insufficient permissions');
    expect(H.generate).not.toHaveBeenCalled();
  });

  it('does not generate when no project is open', async () => {
    H.admit.mockResolvedValueOnce({ projectId: null, programId: null, projectRef: null } as never);
    const result = await run({ reason: 'The sponsor requested a new target.' }, { ...context, projectId: undefined });
    expect(result.error).toContain('An active organization and project are required');
    expect(H.generate).not.toHaveBeenCalled();
  });
});
