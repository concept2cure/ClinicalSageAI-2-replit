/**
 * The slash-command vocabulary is one list: the server parses exactly what
 * the composer offers, every command has menu copy, and search behaves.
 */
import { describe, expect, it } from 'vitest';

import { SLASH_COMMANDS, SLASH_COMMAND_SUMMARIES, SUPPORTED_SLASH_COMMANDS, findSlashCommand, searchSlashCommands } from '../slash-commands';
import { SUPPORTED_SLASH_COMMANDS as SERVER_LIST, detectSlashCommand } from '../../../server/services/ana-ri/message-intent';

describe('slash commands', () => {
  it('the server parses the same list the composer offers', () => {
    expect(SERVER_LIST).toBe(SUPPORTED_SLASH_COMMANDS);
    for (const c of SLASH_COMMANDS) {
      expect(detectSlashCommand(`/${c.name} something`)).toEqual({ command: c.name, args: 'something' });
    }
  });

  it('every command has one line of copy and names are unique', () => {
    for (const name of SUPPORTED_SLASH_COMMANDS) {
      expect(SLASH_COMMAND_SUMMARIES[name].length, name).toBeGreaterThan(8);
      expect(SLASH_COMMAND_SUMMARIES[name]).not.toMatch(/!/);
    }
    expect(new Set(SUPPORTED_SLASH_COMMANDS).size).toBe(SUPPORTED_SLASH_COMMANDS.length);
  });

  it('search ranks a name prefix first, matches summaries, and caps the list', () => {
    expect(searchSlashCommands('sa')[0].name).toBe('sap');
    expect(searchSlashCommands('sample size').map((c) => c.name)).toContain('power');
    expect(searchSlashCommands('').length).toBe(8);
    expect(searchSlashCommands('zzzz')).toEqual([]);
    expect(findSlashCommand('/Risk')?.name).toBe('risk');
    expect(findSlashCommand('nope')).toBeUndefined();
  });
});
