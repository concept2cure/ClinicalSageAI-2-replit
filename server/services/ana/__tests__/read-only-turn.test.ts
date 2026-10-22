import { describe, expect, it } from 'vitest';
import { requestsReadOnly, readOnlyToolRefusal, readOnlyAnswer } from '../read-only-turn';
import { requestsGovernedDraft } from '../governed-write-tools';

describe('explicit read-only turn constraints', () => {
  it.each(['Give me a read-only summary.', 'Read only: summarize the project.', 'Do not draft a document; just summarize.', "Don't save anything."])('recognizes %s', text => {
    expect(requestsReadOnly(text)).toBe(true);
    expect(requestsGovernedDraft(text)).toBe(false);
  });
  it('does not prevent a later explicit drafting request', () => {
    expect(requestsReadOnly('Draft an IND plan')).toBe(false);
    expect(requestsGovernedDraft('Draft an IND plan')).toBe(true);
  });
  it('blocks unknown tools and command bridges without relying on model approval', () => {
    expect(readOnlyToolRefusal('unregistered_tool', {}, true)?.error).toBe('USER_REQUESTED_READ_ONLY');
    expect(readOnlyToolRefusal('execute_platform_command', { command: 'create_task' }, true)?.error).toBe('USER_REQUESTED_READ_ONLY');
    expect(readOnlyToolRefusal('unregistered_tool', {}, false)).toBeNull();
  });
  it('removes complete and unfinished executable blocks from the final answer', () => {
    const fence = String.fromCharCode(96).repeat(3);
    const answer = readOnlyAnswer('Summary.\n' + fence + 'command\n{"command":"create_task"}\n' + fence + '\n' + fence + 'ana-action\n{"type":"memo"}');
    expect(answer).toContain('Summary.');
    expect(answer).not.toContain('create_task');
    expect(answer).not.toContain('memo');
    expect(answer).toContain('no action was run or proposed');
  });
});
