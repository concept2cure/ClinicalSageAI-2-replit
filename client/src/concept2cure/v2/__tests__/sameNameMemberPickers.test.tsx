/**
 * Two members with one name can be told apart in the pickers that choose
 * between them (W1/D2, 2026-10-05; docs/evidence/W1/2026-10-05-same-name-members/).
 *
 * The demo organisation has two accounts named "JM Smith". The protocol
 * review's reviewer select offered "JM Smith · admin" twice, and the roster
 * pickers (Task form, task board, RBM owner, assign-review) showed "JM Smith"
 * twice. Whichever was chosen, the record named an account the person choosing
 * could not identify. The roster pickers show the server's `label`
 * (taskBoard-assignees-labels.test.ts); the reviewer select applies the same
 * rule to its own list (shared/utils/member-labels.ts).
 */
import { describe, expect, it } from 'vitest';
import { configFor } from '../surfaces/ProtocolDevForms';

const members = [
  { id: 1, name: 'JM Smith', email: 'jm.smith@acme.test', role: 'admin' },
  { id: 2, name: 'JM Smith', email: 'jm@other.test', role: 'admin' },
  { id: 4, name: 'Rae Okafor', email: 'rae@acme.test', role: 'admin' },
];

describe('the protocol review reviewer select', () => {
  it('offers two same-name accounts as two different choices', () => {
    const cfg = configFor('review-request', undefined, { state: 'ready', members });
    const field = cfg.fields.find((f) => f.key === 'reviewerUserId');
    const labels = (field?.options ?? []).map((o) => (typeof o === 'object' ? o.label : o));
    expect(labels).toContain('JM Smith · jm.smith@acme.test · admin');
    expect(labels).toContain('JM Smith · jm@other.test · admin');
    expect(labels).toContain('Rae Okafor · admin');
    expect(new Set(labels).size).toBe(labels.length);
  });
});
