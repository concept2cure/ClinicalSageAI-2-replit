/**
 * What a person reads when a required value was not sent (2026-11-11).
 *
 * zod 4 answers a missing value with "Invalid input: expected string, received undefined"; zod 3 said
 * "Required". About twenty routes hand the first issue's message to the screen as it is (organisation profile,
 * setup, legal holds, company documents), so after the zod 4 move a person who left a field out read the former.
 * shared/zod-messages.ts sets the wording once, for the server, the browser and these suites (tests/setup.ts).
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import '../zod-messages';

const first = (schema: z.ZodType, value: unknown) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? null : parsed.error.issues[0]?.message;
};

describe('the message for a value that was not sent', () => {
  it('is "Required", for every type, at any depth', () => {
    expect(first(z.object({ name: z.string() }), {})).toBe('Required');
    expect(first(z.object({ count: z.number() }), {})).toBe('Required');
    expect(first(z.object({ kind: z.enum(['a', 'b']) }), {})).toBe('Required');
    expect(first(z.object({ site: z.object({ id: z.string() }) }), { site: {} })).toBe('Required');
    expect(first(z.string(), undefined)).toBe('Required');
  });

  it('never replaces a message the schema states itself', () => {
    expect(first(z.object({ name: z.string({ error: 'Name the organisation.' }) }), {})).toBe('Name the organisation.');
    expect(first(z.object({ name: z.string().min(1, 'Name the organisation.') }), { name: '' })).toBe('Name the organisation.');
  });

  it('leaves a value of the wrong type, and a null, in zod\'s own words: those are not "missing"', () => {
    expect(first(z.object({ name: z.string() }), { name: 5 })).toBe('Invalid input: expected string, received number');
    expect(first(z.object({ name: z.string() }), { name: null })).toBe('Invalid input: expected string, received null');
  });
});
