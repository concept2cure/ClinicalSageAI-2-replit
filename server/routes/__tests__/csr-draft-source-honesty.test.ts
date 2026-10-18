import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { complete } }));
import router from '../csr-builder-routes';
const app = express();
app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { user: { organizationId: 7, id: 5 } }); next(); });
app.use('/api/csr-builder', router);
const studyInfo = { title: 'Recorded study', protocolNumber: 'SYN-001', phase: 'Phase 1', indication: 'Recorded indication',
  sponsor: 'Recorded sponsor', investigationalProduct: 'Recorded product', studyDesign: 'Recorded design', primaryEndpoint: 'Recorded endpoint' };
const draft = (sectionNumber = '1') => request(app).post('/api/csr-builder/draft-section').send({ sectionNumber, studyInfo });
beforeEach(() => { complete.mockReset(); });

it('a provider refusal returns a template with its actual source instead of claiming an AI draft', async () => {
  complete.mockRejectedValue(new Error('Synthetic gateway refusal'));
  const response = await draft();
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ isAI: false, provider: 'template' });
  expect(response.body.content).toContain(studyInfo.title);
});
it('empty model output has the same explicit template source as the provenance drafting path', async () => {
  complete.mockResolvedValue('');
  const response = await draft();
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ isAI: false, provider: 'template' });
  expect(response.body.content).toContain(studyInfo.title);
});
it('a refused unsupported statistical draft cannot be labelled as accepted AI output', async () => {
  complete.mockResolvedValue('Efficacy showed p=0.001 and 95% success among 120 participants.');
  const response = await draft('11');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ isAI: false, provider: 'template' });
  expect(response.body.content).not.toContain('p=0.001');
});
it('an accepted gateway draft retains the verified actor/organization without inventing a project or provider', async () => {
  complete.mockResolvedValue('A title-page narrative based on the supplied study metadata.');
  const response = await draft();
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ isAI: true, provider: 'ai-gateway' });
  expect(complete).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ organizationId: 7, userId: 5, callerModule: 'csr-builder/section-draft' }));
  const options = complete.mock.calls[0][1] as Record<string, unknown>;
  expect(options.projectId).toBeUndefined();
});
