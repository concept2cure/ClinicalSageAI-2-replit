/**
 * AnA addresses the user by a name the records hold: their recorded preferred
 * name, else their full recorded name — never a word of their job title, and
 * nothing when no name is recorded.
 *
 * What the code used to do (until 2026-10-15): loadUserIdentity built
 * greetingName as "first word of the job title + last word of the name", so a
 * "Senior Regulatory Affairs Manager" named Priya Raman was greeted as
 * "Senior Raman" (and a "Dr" in a name as the surname); with no title it took
 * the first word of the name. lumen-context-builder printed it into AnA's prompt
 * as the name the user goes by.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ identity: [] as unknown[], query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));

import { loadUserIntelligence } from '../user-intelligence';

const IDENTITY = {
  id: 11,
  name: 'Priya Raman',
  email: 'priya@example.test',
  title: 'Senior Regulatory Affairs Manager',
  department: 'Regulatory Affairs',
  bio: null,
  avatar: null,
  last_login: null,
  preferences: {},
  org_role: 'admin',
};

beforeEach(() => {
  H.identity = [IDENTITY];
  H.query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('FROM users u')) return { rows: H.identity };
    if (sql.includes('COUNT(DISTINCT cc.id)')) return { rows: [{ total_conversations: '0', total_messages: '0' }] };
    return { rows: [] };
  });
});

const greeting = async () =>
  (await loadUserIntelligence({ userId: 11, organizationId: 3 }))!.identity.greetingName;

describe('greetingName', () => {
  it('is the full recorded name, not a word of the job title', async () => {
    const name = await greeting();
    expect(name, 'the greeting was built from the job title').toBe('Priya Raman');
  });

  it('is the recorded preferred name when one is recorded', async () => {
    H.identity = [{ ...IDENTITY, preferences: { greeting_name: 'Dr. Raman' } }];
    expect(await greeting()).toBe('Dr. Raman');
  });

  it('is the full recorded name, not its first word, when no title is recorded', async () => {
    H.identity = [{ ...IDENTITY, name: 'Dr Priya Raman', title: null }];
    expect(await greeting()).toBe('Dr Priya Raman');
  });

  it('is null when no name is recorded', async () => {
    H.identity = [{ ...IDENTITY, name: '  ', preferences: { greeting_name: '' } }];
    expect(await greeting()).toBeNull();
  });
});
