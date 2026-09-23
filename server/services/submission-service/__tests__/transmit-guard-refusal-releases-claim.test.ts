/**
 * A transmit the gateway guard refuses before anything is sent releases its claim.
 *
 * 2026-09-23 (W5/D7), found by the round-2 review. transmitSequence released its
 * transmit claim only for failures before gw.transmit, on the reasoning that any
 * later failure may have reached the agency. But the getGateway guard refuses
 * BEFORE any byte leaves (authorization, pre-transmit checks, leaf security),
 * and such a refusal left dispatch_status = 'transmitting' — read by
 * resendRefusal as "in flight, confirm at the agency" and cleared by nothing.
 * The sequence could never be sent. Guard refusals are now marked
 * (refusedBeforeWire) and release the claim; gateway failures still do not.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const poolCalls: Array<{ text: string; params?: unknown[] }> = [];
const state = { dispatchStatus: 'pending' as string };

vi.mock('../../../db', () => {
  const rowsFor = (tableName: string) => {
    if (tableName === 'ectd_sequences') return [{ id: 1, submissionId: 1, region: 'fda', sequenceNumber: '0000', status: 'dispatched', dispatchStatus: state.dispatchStatus, type: 'original', organizationId: 7 }];
    if (tableName === 'submissions') return [{ id: 1, clientType: 'biotech', applicationType: 'ind', organizationId: 7 }];
    return [];
  };
  const tableNameOf = (t: any) => t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? '';
  const select = () => {
    let name = '';
    const chain: any = {
      from: (t: any) => { name = tableNameOf(t); return chain; },
      where: () => chain,
      limit: async () => rowsFor(name),
      then: (res: any, rej: any) => Promise.resolve(rowsFor(name)).then(res, rej),
    };
    return chain;
  };
  const textOf = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : '?')).join('');
  const execute = async (q: any) => {
    const t = textOf(q);
    if (t.includes('c2c_ana_actions')) return { rows: [{ id: 'sig-1', payload: { intent: 'transmit' } }] };
    if (t.includes('audit_logs')) return { rows: [] };
    if (t.includes('electronic_signatures')) return { rows: [{ bound_payload_digest: 'd', binding_basis: 'ectd-sequence-leaf-manifest-sha256', superseded_by: null, is_valid: true, verification_status: 'valid' }] };
    return { rows: [] };
  };
  const pool = {
    query: async (text: string, params?: unknown[]) => {
      poolCalls.push({ text, params });
      if (/SET dispatch_status = \$3/.test(text)) { state.dispatchStatus = String(params?.[2]); return { rowCount: 1, rows: [{ id: 1 }] }; }
      if (/SET dispatch_status = 'pending'/.test(text)) { if (state.dispatchStatus === 'transmitting') state.dispatchStatus = 'pending'; return { rowCount: 1, rows: [] }; }
      return { rowCount: 0, rows: [] };
    },
    connect: async () => { throw new Error('not expected'); },
  };
  return { db: { select, execute }, pool };
});
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) }, writeChainedAuditRow: vi.fn() }));
vi.mock('../../part11/signature-persistence', async (orig) => ({
  ...(await orig<any>()),
  deriveGovernedTargetBinding: async () => ({ digest: 'd', basis: 'ectd-sequence-leaf-manifest-sha256', note: '' }),
  isSignatureWithdrawn: () => false,
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({ gate: { cleared: true, blockers: [] } }),
}));

const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'ectd' as const };
vi.mock('../../ectd/assemble-from-core', () => ({
  assembleSequence: async () => ({ bundle, skipped: [], unfinalized: 0, unfinalizedSections: [], unresolvedLeaves: [], materialized: 1, cleanup: async () => {} }),
  assembledTransmitBlockers: () => [],
}));

import { FdaEsgGateway } from '../../submission-gateways/fda-esg';
import { transmitSequence, resendRefusal } from '../submission-service';

beforeAll(async () => {
  // A bundle whose one PDF leaf carries a trailer /Encrypt (not an FDA form).
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Filter /Standard /V 2 /R 3 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF\n');
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'probe-bundle-')), 'b.zip');
  await fs.writeFile(p, buf);
  Object.assign(bundle, { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length });
});

describe('transmit guard refusal before the wire', () => {
  it('releases the claim, so the sequence is not left "in flight" when nothing was sent', async () => {
    vi.spyOn(FdaEsgGateway.prototype, 'isConfigured').mockResolvedValue(true);
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({} as any);
    const err = await transmitSequence({
      sequenceId: 1, ctx: { organizationId: 7, userId: 11 }, signatureActionId: 'sig-1',
      environment: 'staging', applicationId: 'IND123456',
    }).catch((e) => e);
    expect(wire).not.toHaveBeenCalled();
    expect(String(err?.message)).toMatch(/encrypted\/secured/);
    expect(state.dispatchStatus).toBe('pending');
    expect(resendRefusal(state.dispatchStatus)).toBeNull();
  });
});
