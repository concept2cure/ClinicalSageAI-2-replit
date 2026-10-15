import { describe, expect, it } from 'vitest';
import { memberLabels } from '../utils/member-labels';

describe('memberLabels — a picker can tell two people with one name apart', () => {
  it('a shared name carries the address; a unique one does not', () => {
    const l = memberLabels([
      { id: 1, name: 'JM Smith', email: 'jm.smith@acme.test' },
      { id: 2, name: 'JM Smith', email: 'jm@other.test' },
      { id: 4, name: 'Rae Okafor', email: 'rae@acme.test' },
    ]);
    expect(l.get('1')).toBe('JM Smith · jm.smith@acme.test');
    expect(l.get('2')).toBe('JM Smith · jm@other.test');
    expect(l.get('4')).toBe('Rae Okafor');
    expect(new Set(l.values()).size).toBe(3);
  });

  it('names are compared trimmed and case-insensitively', () => {
    const l = memberLabels([
      { id: 'a', name: 'A. Rivera ', email: 'a1@x.test' },
      { id: 'b', name: 'a. rivera', email: 'a2@x.test' },
    ]);
    expect(l.get('a')).toBe('A. Rivera · a1@x.test');
    expect(l.get('b')).toBe('a. rivera · a2@x.test');
  });

  it('a member with no name is shown by address, then by id', () => {
    const l = memberLabels([{ id: 9, name: '', email: 'n@x.test' }, { id: 10, name: null, email: null }]);
    expect(l.get('9')).toBe('n@x.test');
    expect(l.get('10')).toBe('10');
  });
});
