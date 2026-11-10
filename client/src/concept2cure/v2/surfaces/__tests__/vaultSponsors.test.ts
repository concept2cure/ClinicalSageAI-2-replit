/** P-107 item 3.1: with no project open, the Vault asks which sponsor first; every view is inside one sponsor. */
import { describe, expect, it } from 'vitest';
import { sponsorsOf, sponsorGate, vaultProjectOf, NO_SPONSOR } from '../vaultSponsors';

/* `ws` is the product segment and never the sponsor: every project here is 'Biotech', as in the seeded demo. */
const CLIENT: Record<string, string> = { Lumen: '3', Acme: '9', Gone: '77' };
const p = (id: string, client: string | null) => ({ id, title: `Project ${id}`, code: null, ws: 'Biotech', status: null,
  clientId: client ? CLIENT[client] : null, clientName: client });

describe('the sponsors of the projects a person can open', () => {
  it('groups projects by sponsor, in name order, with the unanchored last', () => {
    const s = sponsorsOf([p('1', 'Lumen'), p('2', 'Acme'), p('3', 'Lumen'), p('4', null)]);
    expect(s.map((x) => [x.key, x.name, x.projects.map((q) => q.id)])).toEqual([
      ['9', 'Acme', ['2']], ['3', 'Lumen', ['1', '3']], [NO_SPONSOR, 'No client recorded', ['4']],
    ]);
  });

  it('asks which sponsor when there is more than one, and shows nothing of any until one is chosen', () => {
    const projects = [p('1', 'Lumen'), p('2', 'Acme'), p('3', 'Lumen')];
    expect(sponsorGate(projects, null)).toEqual({ ask: true, sponsors: expect.any(Array), projects: [], anchorProjectId: null });
    const chosen = sponsorGate(projects, '3');
    expect(chosen.ask).toBe(false);
    expect(chosen.projects.map((q) => q.id)).toEqual(['1', '3']);
    // The server narrows the organization's artifacts by this project's verified sponsor.
    expect(chosen.anchorProjectId).toBe('1');
  });

  it('a sponsor that is no longer in the list is asked for again, never widened to all', () => {
    expect(sponsorGate([p('1', 'Lumen'), p('2', 'Acme')], '77').ask).toBe(true);
  });

  it('one sponsor needs no question, and is anchored all the same', () => {
    const one = sponsorGate([p('1', 'Lumen'), p('3', 'Lumen')], null);
    expect(one).toMatchObject({ ask: false, anchorProjectId: '1' });
    expect(one.projects).toHaveLength(2);
    expect(sponsorGate([], null)).toMatchObject({ ask: false, projects: [], anchorProjectId: null });
  });

  it('reads the sponsor from the client workspace, never from the segment (found walking: ws is "Biotech", "MDX")', () => {
    expect(vaultProjectOf({ id: 'a', title: 'T', ws: 'Biotech', client_workspace_id: 3, client_name: 'Lumen' }))
      .toMatchObject({ ws: 'Biotech', clientId: '3', clientName: 'Lumen' });
    expect(vaultProjectOf({ id: 'a', title: 'T', ws: 'Biotech' })).toMatchObject({ clientId: null, clientName: null });
    expect(vaultProjectOf({ title: 'no id' })).toBeNull();
    const two = [vaultProjectOf({ id: 'a', title: 'A', ws: 'Biotech', client_workspace_id: 3, client_name: 'Lumen' })!,
      vaultProjectOf({ id: 'b', title: 'B', ws: 'MDX', client_workspace_id: 3, client_name: 'Lumen' })!];
    expect(sponsorsOf(two)).toHaveLength(1);
  });
});
