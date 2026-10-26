import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { complete } }));
import router from '../csr-builder-routes';
import { draftCSRSectionWithProvenance, generateCSRSections, getICHE3Structure, hasUnresolvedPlaceholders } from '../../services/csr-builder';
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

it.each(['refusal', 'empty'])('ethics template after %s retains unknown approval and consent rather than inventing them', async mode => {
  if (mode === 'refusal') complete.mockRejectedValue(new Error('Synthetic gateway refusal'));
  else complete.mockResolvedValue('');
  const response = await draft('5');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ isAI: false, provider: 'template' });
  const content = response.body.content as string;
  expect(content).not.toContain('were reviewed and approved');
  expect(content).not.toContain('consent was obtained');
  expect(content).not.toContain('study was conducted in accordance');
  expect(content).toMatch(/IRB|IEC/);
  expect(content).toMatch(/consent/i);
  expect(hasUnresolvedPlaceholders(content)).toBe(true);
});

it('the worker drafting door records ethics fallback as template content needing source records', async () => {
  complete.mockResolvedValue('');
  const section = getICHE3Structure().find(row => row.number === '5')!;
  const drafted = await draftCSRSectionWithProvenance(section, { organizationId: 7, userId: 5, studyInfo });
  expect(drafted).toMatchObject({ number: '5', source: 'template', model: null });
  expect(hasUnresolvedPlaceholders(drafted.content)).toBe(true);
  expect(drafted.content).not.toContain('were reviewed and approved');
});

it('the synchronous drafting door classifies unknown ethics evidence as needs_data', async () => {
  complete.mockRejectedValue(new Error('Synthetic gateway refusal'));
  const sections = await generateCSRSections(getICHE3Structure(), { organizationId: 7, userId: 5, studyInfo, sectionsToGenerate: ['5'] });
  const ethics = sections.find(row => row.number === '5')!;
  expect(ethics.status).toBe('needs_data');
  expect(ethics.needsData).toBe(true);
});
