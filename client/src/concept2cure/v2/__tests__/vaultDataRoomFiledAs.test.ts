/**
 * The data room's Filed chip names the Vault version a captured file became
 * (VR-16): "Filed as v1.0, superseded by v2.0". It said only "Filed", so a
 * file whose bytes were replaced by a later version read as current.
 */
import { describe, expect, it } from 'vitest';
import { roomStageLabel } from '../surfaces/Vault';

describe('roomStageLabel (VR-16)', () => {
  it('names the version, and what superseded it', () => {
    expect(roomStageLabel({ stage: 'filed', filedAs: { version: '1.0', supersededBy: '2.0' } })).toBe('Filed as v1.0, superseded by v2.0');
    expect(roomStageLabel({ stage: 'filed', filedAs: { version: '3.0', supersededBy: null } })).toBe('Filed as v3.0');
  });

  it('says only what it knows: an older server, or a stage before filing', () => {
    expect(roomStageLabel({ stage: 'filed', filedAs: undefined })).toBe('Filed');
    expect(roomStageLabel({ stage: 'classified', filedAs: null })).toBe('Classified');
  });
});
