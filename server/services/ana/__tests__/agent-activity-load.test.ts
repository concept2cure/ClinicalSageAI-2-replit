/**
 * The two readers of the agent-activity summary, and why there are two.
 *
 * The live panel route must fail closed: a person looking at "background
 * investigations" has to be able to tell "none are running" from "the read
 * failed", so its loader throws. The greeting path must never block a chat
 * turn on a broken investigations table, so its reader swallows the error
 * and says nothing. One reader doing both is how an empty queue got rendered
 * over a database error.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const deep = vi.hoisted(() => ({ listRecentInvestigations: vi.fn() }));
const team = vi.hoisted(() => ({ actor:vi.fn(),admit:vi.fn(),monitor:vi.fn(),board:vi.fn() }));
vi.mock('../project-scope-admission',async orig=>({...await orig<Record<string,unknown>>(),readActiveAnaActorRole:team.actor,admitAnaProjectScope:team.admit}));
vi.mock('../../projects/schedule-of-events/service',()=>({readProjectObjectiveMonitor:team.monitor,projectMonitorForTeam:(value:unknown)=>value}));
vi.mock('../run-events',()=>({readRunCoordination:team.board}));
vi.mock('../deep-investigation.js', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, listRecentInvestigations: deep.listRecentInvestigations };
});

import { getAgentActivity, loadAgentActivity, loadProjectTeamActivity } from '../agent-activity';

// Braces, not an expression body: `mockClear()` returns the mock, and a
// function returned from beforeEach is run by vitest as a teardown — which
// here would CALL the throwing mock after every test and fail it.
beforeEach(() => {
  deep.listRecentInvestigations.mockClear();
});

describe('loadAgentActivity — the route reader', () => {
  it('propagates a failed read instead of returning an empty queue', async () => {
    // mockImplementation(async () => { throw }) rather than mockRejectedValue:
    // the latter builds the rejected promise at setup time and is reported as
    // unhandled even though the code under test catches it.
    deep.listRecentInvestigations.mockImplementation(() => {
      throw new Error('relation "ana_deep_investigations" does not exist');
    });
    let caught: unknown = null;
    try {
      await loadAgentActivity(7);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/does not exist/);
  });

  it('returns the summary when the read succeeds', async () => {
    deep.listRecentInvestigations.mockResolvedValue([]);
    await expect(loadAgentActivity(7)).resolves.toEqual({
      activeCount: 0,
      stalledCount: 0,
      recentlyCompletedCount: 0,
      items: [],
    });
  });
});

describe('getAgentActivity — the greeting reader', () => {
  it('fails soft so a broken table never blocks a chat turn', async () => {
    deep.listRecentInvestigations.mockImplementation(() => {
      throw new Error('down');
    });
    await expect(getAgentActivity(7)).resolves.toEqual({
      activeCount: 0,
      stalledCount: 0,
      recentlyCompletedCount: 0,
      items: [],
    });
  });
});

describe('project team metadata composition — admitted reader seams',()=>{
  const program='11111111-2222-4333-8444-000000000011';
  const actor={organizationId:7,userId:99,projectRef:program};
  const worker={parent:'p1',worker:'w1',revision:1,parentStep:'s1',task:'t1',role:'research',workKind:'research',
    label:'Research worker',phase:'started',outcome:null,completed:0,total:1,basis:'observed_steps',parentDisposition:'pending',estimate:null,
    receipt:{eventId:'11111111-2222-4333-8444-000000000012',eventHash:'a'.repeat(64)}};
  const query=vi.fn(); const client={query};
  beforeEach(()=>{
    team.actor.mockReset().mockResolvedValue('member');
    team.admit.mockReset().mockResolvedValue({projectId:11,projectRef:program,programId:program});
    team.board.mockReset().mockResolvedValue({workers:[worker],receipts:[{eventHash:'a'.repeat(64)}]});
    team.monitor.mockReset().mockResolvedValue({state:'current',snapshotRevisionId:4,goal:null,
      work:{total:2,completed:2,percentage:100},gates:{source:'not_assessed',document:'blocked',filing:'not_assessed'},blockers:[]});
    query.mockReset().mockResolvedValue({rows:[{id:'run-1',status:'running',heartbeat_at:new Date().toISOString()}]});
  });
  it('binds project runs and the verified reader to current session identity without resolving local tN aliases as task IDs',async()=>{
    const result=await loadProjectTeamActivity(client,actor);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([7,['11',program],null]);
    expect(team.board).toHaveBeenCalledWith(client,{runId:'run-1',organizationId:7,userId:99,projectId:11,programId:program});
    expect(result).toMatchObject({organizationId:7,projectId:11,projectRef:program,complete:true,
      workers:[{phase:'started',parentState:'running',task:'t1'}]});
    expect(result.workers[0]).not.toHaveProperty('taskCaption');
    expect(JSON.stringify(result)).not.toContain('inputHeadHash');
  });
  it.each(['finished','cancelled','failed'])('keeps an active worker receipt as last recorded when its parent is %s',async status=>{
    query.mockResolvedValue({rows:[{id:'run-1',status,heartbeat_at:new Date().toISOString()}]});
    const result=await loadProjectTeamActivity(client,actor);
    expect(result.complete).toBe(false); expect(result.workers[0]).toMatchObject({phase:'started',outcome:null,parentState:status});
  });
  it('marks a cold parent stale without inventing a stopped worker receipt',async()=>{
    query.mockResolvedValue({rows:[{id:'run-1',status:'running',heartbeat_at:'2000-01-01T00:00:00.000Z'}]});
    const result=await loadProjectTeamActivity(client,actor);
    expect(result.complete).toBe(false); expect(result.workers[0]).toMatchObject({phase:'started',parentState:'stale'});
  });
  it('fails a denied ledger or unavailable monitor instead of claiming an empty team',async()=>{
    team.board.mockRejectedValueOnce(new Error('receipt unavailable'));
    await expect(loadProjectTeamActivity(client,actor)).rejects.toThrow('receipt unavailable');
    team.monitor.mockRejectedValueOnce(new Error('head store unavailable'));
    await expect(loadProjectTeamActivity(client,actor)).rejects.toThrow('head store unavailable');
  });
  it('rechecks current project admission after its protected reads',async()=>{
    team.admit.mockResolvedValueOnce({projectId:11,projectRef:program,programId:program})
      .mockResolvedValueOnce({projectId:12,projectRef:program,programId:program});
    await expect(loadProjectTeamActivity(client,actor)).rejects.toMatchObject({status:403,code:'ANA_PROJECT_ACCESS_DENIED'});
    expect(team.monitor).not.toHaveBeenCalled();
  });
  it('does not replace a requested absent run with another project run',async()=>{
    query.mockResolvedValue({rows:[]});
    await expect(loadProjectTeamActivity(client,{...actor,runId:'missing'})).rejects.toMatchObject({status:404});
    expect(team.board).not.toHaveBeenCalled();
  });
  it('keeps an unrecorded or changed project monitor visibly incomplete',async()=>{
    team.monitor.mockResolvedValue({state:'stale',snapshotRevisionId:4,goal:null,
      work:{total:0,completed:0,percentage:null},gates:{source:'unavailable',document:'unavailable',filing:'unavailable'},blockers:['PROJECT_OBJECTIVE_REQUIRED']});
    const result=await loadProjectTeamActivity(client,actor);
    expect(result.complete).toBe(false); expect(result.projectMonitor?.state).toBe('stale');
  });
});
