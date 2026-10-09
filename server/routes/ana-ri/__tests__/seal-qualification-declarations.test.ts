/** Explicit scientific-qualification declarations may not disappear into legacy seal admission. */
import express, { type Request } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getPool: vi.fn(), authority: vi.fn(), reverify: vi.fn() }));
vi.mock('../../../db', () => ({ getPool: h.getPool, db: {} }));
vi.mock('../../../db.js', () => ({ getPool: h.getPool, db: {} }));
vi.mock('../../../services/part11/signing-authority-gate.js', () => ({ checkSigningAuthority: h.authority }));
vi.mock('../../../services/part11/reverify-signer.js', () => ({ reverifySigner: h.reverify }));
vi.mock('../../../services/part11/reverify-signer-deps.js', () => ({ signerReverificationDeps: () => ({}) }));

import { handleSealVerifiedVersion } from '../seal-verified';
import {
  sealVerifiedVersion, type SealPool, type SealVerifiedVersionInput,
} from '../../../services/ana/verifiedSealService';

type Verification = { ok: boolean; [key: string]: unknown };
const input = (verification: Verification): SealVerifiedVersionInput => ({
  organizationId: 7, projectId: 11, userId: 3,
  signerName: 'Jane Roe', title: 'Stability report', content: 'Shelf life is 24 months.',
  manifestation: { printedName: 'Jane Roe', meaning: 'APPROVER', reasonForChange: 'Reviewed the stability report.' },
  verification,
});
const declarations: Array<Record<string, unknown>> = [
  {
    "sourceQualification": "unassessed"
  },
  {
    "sourceQualification": "qualified"
  },
  {
    "sourceQualification": "rejected"
  },
  {
    "sourceQualification": "stale"
  },
  {
    "sourceQualification": "withdrawn"
  },
  {
    "sourceQualification": ""
  },
  {
    "sourceQualification": null
  },
  {
    "sourceQualification": true
  },
  {
    "sourceQualification": false
  },
  {
    "sourceQualification": 0
  },
  {
    "sourceQualification": {}
  },
  {
    "sourceQualification": []
  },
  {
    "sealEligible": false
  },
  {
    "sealEligible": true
  },
  {
    "sealEligible": "false"
  },
  {
    "sealEligible": "true"
  },
  {
    "sealEligible": null
  },
  {
    "sealEligible": 0
  },
  {
    "sealEligible": 1
  },
  {
    "sealEligible": {}
  },
  {
    "sealEligible": []
  },
  {
    "sourceQualification": "unassessed",
    "sealEligible": false
  },
  {
    "sourceQualification": "qualified",
    "sealEligible": true
  },
  {
    "sourceQualification": "qualified",
    "sealEligible": false
  }
];
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const principal = req as Request & { tenantId: number; userId: number };
  principal.tenantId = 7; principal.userId = 3;
  next();
});
app.post('/api/ana-ri/seal-verified-version', handleSealVerifiedVersion);
const post = (verification: Verification) => request(app)
  .post('/api/ana-ri/seal-verified-version')
  .send({ ...input(verification), password: 'test-password' });

beforeEach(() => {
  vi.stubEnv('ENABLE_ANA_DOCUMENT_STUDIO', 'true');
  h.getPool.mockReset().mockImplementation(() => { throw new Error('No seal pool may be acquired'); });
  h.authority.mockReset().mockResolvedValue(null);
  h.reverify.mockReset().mockResolvedValue({ ok: true, authenticationMethod: 'password', secondFactorVerified: false });
});
afterEach(() => { vi.unstubAllEnvs(); });

function stoppedPool() {
  const connect = vi.fn(async () => { throw new Error('Legacy transaction boundary reached'); });
  const pool: SealPool = { connect };
  return { pool, connect };
}

describe('the service rejects caller-declared qualification without database access', () => {
  it.each(declarations)('refuses %j, including forged positive values', async qualifiers => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({ ok: true, ...qualifiers }), pool))
      .rejects.toMatchObject({ code: 'SOURCE_QUALIFICATION_UNSUPPORTED', status: 422 });
    expect(connect).not.toHaveBeenCalled();
    expect(h.getPool).not.toHaveBeenCalled();
  });

  it('does not acquire the default pool for unassessed source qualification', async () => {
    await expect(sealVerifiedVersion(input({ ok: true, sourceQualification: 'unassessed' })))
      .rejects.toMatchObject({ code: 'SOURCE_QUALIFICATION_UNSUPPORTED', status: 422 });
    expect(h.getPool).not.toHaveBeenCalled();
  });

  it('cannot override explicit qualification limits with legacy positive flags', async () => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({
      ok: true, artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true,
      sourceQualification: 'unassessed', sealEligible: false,
    }), pool)).rejects.toMatchObject({ code: 'SOURCE_QUALIFICATION_UNSUPPORTED' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('preserves the NOT_VERIFIED refusal before evaluating declared qualification', async () => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({ ok: false, sourceQualification: 'qualified', sealEligible: true }), pool))
      .rejects.toMatchObject({ code: 'NOT_VERIFIED' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('does not silently disable omitted-field legacy behavior, which remains an open defect', async () => {
    const { pool, connect } = stoppedPool();
    await expect(sealVerifiedVersion(input({ ok: true, sourceQualification: undefined, sealEligible: undefined }), pool))
      .rejects.toThrow('Legacy transaction boundary reached');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(h.getPool).not.toHaveBeenCalled();
  });
});

describe('the real HTTP handler preserves raw scientific qualification declarations', () => {
  it.each(declarations)('refuses %j rather than dropping it during input mapping', async qualifiers => {
    const res = await post({ ok: true, ...qualifiers });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SOURCE_QUALIFICATION_UNSUPPORTED');
    expect(h.authority).toHaveBeenCalledWith(3, 7);
    expect(h.reverify).toHaveBeenCalledWith(3, { password: 'test-password', mfaToken: undefined }, {});
    expect(h.getPool).not.toHaveBeenCalled();
  });

  it('keeps refusal when all older verification flags claim success', async () => {
    const res = await post({
      ok: true, artifactVerified: true, sourceVerified: true, sourceDiffPerformed: true,
      sourceQualification: 'qualified', sealEligible: true,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SOURCE_QUALIFICATION_UNSUPPORTED');
    expect(h.getPool).not.toHaveBeenCalled();
  });
});
