/**
 * The signed-record rules (services/cmc/signed-record): what an ordinary edit
 * may do to a record that carries a signature. The routes apply these; the
 * staff simulation's step 26 drives them on a running server.
 */
import { describe, it, expect } from 'vitest';
import {
  SIGNED_REGISTERS,
  batchReleaseRefusal,
  batchWriteRefusal,
  isApprovedSpecification,
  isRetirement,
  signedRegisterEditRefusal,
} from '../signed-record';

const CCS = SIGNED_REGISTERS.containerClosures;
const PROC = SIGNED_REGISTERS.manufacturingProcesses;

describe('a qualified or validated register record', () => {
  it('refuses a content edit, naming the way out', () => {
    expect(signedRegisterEditRefusal(CCS, 'qualified', { containerDescription: 'x' })).toMatch(/Retire it with a reason/);
    expect(signedRegisterEditRefusal(PROC, 'validated', { processSteps: [] })).toMatch(/validated under a recorded signature/);
  });

  it('refuses a status that is not retirement (an unsigned de-qualification)', () => {
    expect(signedRegisterEditRefusal(CCS, 'qualified', { status: 'draft' })).not.toBeNull();
    expect(signedRegisterEditRefusal(PROC, 'validated', { validationStatus: '' })).not.toBeNull();
  });

  it('admits retirement alone — with or without the reason key, which the route then requires', () => {
    expect(signedRegisterEditRefusal(CCS, 'qualified', { status: 'retired' })).toBeNull();
    expect(signedRegisterEditRefusal(CCS, 'qualified', { status: 'Retired', reason: 'Lot exhausted.' })).toBeNull();
    expect(isRetirement(PROC, { validationStatus: 'retired', reason: 'x' })).toBe(true);
    // Retirement smuggled alongside a content change is a content change.
    expect(signedRegisterEditRefusal(CCS, 'qualified', { status: 'retired', supplier: 'other' })).not.toBeNull();
  });

  it('leaves an unsigned record to the ordinary rules', () => {
    expect(signedRegisterEditRefusal(CCS, 'draft', { containerDescription: 'x' })).toBeNull();
    expect(signedRegisterEditRefusal(CCS, null, { containerDescription: 'x' })).toBeNull();
  });
});

describe('a batch record', () => {
  it('release testing and dispositions belong to the signed release alone', () => {
    expect(batchWriteRefusal({ releaseTesting: { assay: 'pass' } })).toMatch(/\/release/);
    for (const status of ['released', 'conditional-release', 'rejected', 'pending-review', 'approved']) {
      expect(batchWriteRefusal({ status }), status).toMatch(/disposition/);
    }
    expect(batchWriteRefusal({ status: 'in-progress' })).toBeNull();
  });

  it('a batch carrying a signed disposition is closed to ordinary edits', () => {
    expect(batchWriteRefusal({ yieldData: { percent: 99 } }, { release_status: 'released', batch_number: 'B-1' }))
      .toMatch(/B-1 carries a signed disposition \(released\)/);
    expect(batchWriteRefusal({ yieldData: { percent: 99 } }, { release_status: null, batch_number: 'B-2' })).toBeNull();
  });

  it('released and rejected are final; a conditional release may be signed again', () => {
    expect(batchReleaseRefusal({ release_status: 'released', batch_number: 'B-1' })).toMatch(/final/);
    expect(batchReleaseRefusal({ release_status: 'rejected' })).toMatch(/final/);
    expect(batchReleaseRefusal({ release_status: 'conditional-release' })).toBeNull();
    expect(batchReleaseRefusal({ release_status: null })).toBeNull();
  });
});

describe('a specification', () => {
  it('is approved only in the approved state', () => {
    expect(isApprovedSpecification({ approval_status: 'approved' })).toBe(true);
    expect(isApprovedSpecification({ approval_status: 'Approved ' })).toBe(true);
    expect(isApprovedSpecification({ approval_status: 'review' })).toBe(false);
    expect(isApprovedSpecification({})).toBe(false);
  });
});
