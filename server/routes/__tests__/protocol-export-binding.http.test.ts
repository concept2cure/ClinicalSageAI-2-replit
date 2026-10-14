/** Actual Express error contract for the controlled export hold. Binder fault
 * delivery is proved separately on a native restricted transaction; this file
 * verifies that the existing HTTP route cannot convert that hold into a copy. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../../services/protocol-export/protocol-export-service', async (original) => {
  const actual = await original<typeof import('../../services/protocol-export/protocol-export-service')>();
  return { ...actual, getProtocolExport: vi.fn(), getCtGovDraft: vi.fn() };
});
import router from '../protocol-export';
import { getProtocolExport, ProtocolExportError } from '../../services/protocol-export/protocol-export-service';
const app = express();
app.use((req, _res, next) => { Object.assign(req, { organizationId: 73001 }); next(); });
app.use('/api/protocol-export', router);
beforeEach(() => { vi.mocked(getProtocolExport).mockReset(); });
describe('controlled protocol export HTTP hold', () => {
  it.each([
    ['SIGNATURE_CONTENT_CHANGED', 409],
    ['SIGNATURE_NOT_CURRENT', 409],
    ['SIGNATURE_VERIFICATION_UNAVAILABLE', 503],
    ['SIGNATURE_UNREADABLE', 503],
  ] as const)('returns a named %s refusal with status %i and no exported content', async (code, status) => {
    vi.mocked(getProtocolExport).mockRejectedValue(new ProtocolExportError(code, 'Controlled export is held; the historical signature remains retained.'));
    const response = await request(app).get('/api/protocol-export/17');
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { code, message: 'Controlled export is held; the historical signature remains retained.' } });
    expect(response.body).not.toHaveProperty('markdown');
    expect(getProtocolExport).toHaveBeenCalledWith(73001, 17);
  });
});
