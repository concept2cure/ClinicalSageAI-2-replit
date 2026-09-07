/**
 * The PUT /api/device-projects/:id field rules had NO coverage of any kind —
 * not the messages, not the ordering, not the "absent key means leave it alone"
 * contract that makes it a patch rather than a replace. They were refactored
 * from a chain of ifs into a table (to bring one function back under the
 * complexity limit), and a refactor of untested validation is a guess.
 *
 * These cases pin the behaviour the chain had. One of them — `progress: NaN` —
 * exists because the first version of that refactor got it wrong: written as
 * the INVERSE of the original predicate rather than the original predicate,
 * `typeof v === 'number' && v >= 0 && v <= 100` rejects NaN where
 * `typeof v !== 'number' || v < 0 || v > 100` accepts it, because every
 * comparison against NaN is false. JSON has no NaN literal so no HTTP client
 * can reach it, which is exactly why nothing would have caught the drift.
 */
import { describe, expect, it } from 'vitest';
import { validatePatch } from '../../server/routes/device-projects';

const CLASSES = 'deviceClass must be one of: I, II, IIa, IIb, III';
const STATUSES = 'status must be one of: draft, active, submitted, approved, archived';

describe('validatePatch — the PUT field rules', () => {
  it('accepts an empty patch: every field is optional', () => {
    expect(validatePatch({})).toBeNull();
  });

  it('accepts a fully populated, valid patch', () => {
    expect(validatePatch({
      deviceName: 'Infusion pump',
      deviceClass: 'IIb',
      manufacturer: 'Acme',
      intendedUse: 'Continuous infusion',
      attachedDocuments: ['doc-1'],
      state: { step: 2 },
      progress: 50,
      status: 'active',
    })).toBeNull();
  });

  it.each([
    ['deviceName', '', 'deviceName cannot be empty'],
    ['deviceName', '   ', 'deviceName cannot be empty'],
    ['deviceName', 'x'.repeat(201), 'deviceName must be 200 characters or fewer'],
    ['deviceClass', 'IV', CLASSES],
    ['deviceClass', '', CLASSES],
    ['manufacturer', 'x'.repeat(2001), 'manufacturer must be 2000 characters or fewer'],
    ['intendedUse', 'x'.repeat(2001), 'intendedUse must be 2000 characters or fewer'],
    ['attachedDocuments', 'doc-1', 'attachedDocuments must be an array'],
    ['attachedDocuments', { a: 1 }, 'attachedDocuments must be an array'],
    ['state', [], 'state must be a JSON object'],
    ['state', null, 'state must be a JSON object'],
    ['state', 'draft', 'state must be a JSON object'],
    ['progress', -1, 'progress must be a number between 0 and 100'],
    ['progress', 101, 'progress must be a number between 0 and 100'],
    ['progress', '50', 'progress must be a number between 0 and 100'],
    ['status', 'bogus', STATUSES],
    ['status', 2, STATUSES],
  ])('refuses %s = %j', (field, value, message) => {
    expect(validatePatch({ [field as string]: value })).toBe(message);
  });

  it.each([
    ['deviceName', 'x'.repeat(200)],
    ['deviceName', '  padded  '],
    ['deviceClass', 'I'],
    ['manufacturer', 'x'.repeat(2000)],
    ['attachedDocuments', []],
    ['state', {}],
    ['progress', 0],
    ['progress', 100],
    ['status', 'archived'],
  ])('accepts %s = %j', (field, value) => {
    expect(validatePatch({ [field as string]: value })).toBeNull();
  });

  it('reports the FIRST failing field, in declaration order', () => {
    // deviceClass is declared before status; both are invalid here.
    expect(validatePatch({ deviceClass: 'IV', status: 'bogus' })).toBe(CLASSES);
    // With deviceClass valid, the later field's message surfaces.
    expect(validatePatch({ deviceClass: 'I', status: 'bogus' })).toBe(STATUSES);
  });

  it('an explicit undefined is treated as absent, not as a bad value', () => {
    expect(validatePatch({ deviceName: undefined, progress: undefined })).toBeNull();
  });

  it('accepts progress: NaN, as the rules it replaced did — see the file header', () => {
    // Unreachable over HTTP (JSON has no NaN literal). Pinned because writing
    // the rule as the inverse of the original silently changed this answer.
    expect(validatePatch({ progress: Number.NaN })).toBeNull();
  });
});
