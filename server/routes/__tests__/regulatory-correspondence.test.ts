import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment';
import regulatoryCorrespondenceRoutes from '../regulatory-correspondence';

const ORG_ID = 2;
const USER_ID = 11;
const authToken = jwt.sign(
  {
    userId: String(USER_ID),
    email: 'tester@example.com',
    organizationId: String(ORG_ID),
  },
  config.jwt.secret,
  { expiresIn: '1h' }
);
const authz = { Authorization: `Bearer ${authToken}` };

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/regulatory-correspondence', regulatoryCorrespondenceRoutes);

describe('Regulatory Correspondence Routes (integration)', () => {
  let submissionId = '';
  let correspondenceId = '';
  let issueId = '';

  it('creates and transitions a submission lifecycle', async () => {
    const created = await request(app)
      .post('/api/regulatory-correspondence/submissions')
      .set(authz)
      .send({
        projectId: 17,
        submissionType: 'NDA',
        regulator: 'FDA',
      });

    expect([201, 503]).toContain(created.status);
    if (created.status === 503) {
      expect(created.body.error).toContain('persistence is unavailable');
      return;
    }
    expect(created.body.data.id).toBeDefined();
    submissionId = created.body.data.id;

    const changed = await request(app)
      .patch(`/api/regulatory-correspondence/submissions/${submissionId}/state`)
      .set(authz)
      .send({ lifecycleState: 'information_request_open' });

    expect(changed.status).toBe(200);
    expect(changed.body.data.lifecycleState || changed.body.data.lifecycle_state).toBe(
      'information_request_open'
    );
  });

  it('intakes correspondence and extracts issues for human review', async () => {
    const intake = await request(app)
      .post('/api/regulatory-correspondence/correspondence/intake')
      .set(authz)
      .send({
        projectId: 17,
        submissionId,
        communicationType: 'deficiency_letter',
        subject: 'FDA deficiency request',
        parsedText: 'Major deficiency: missing information on CMC stability and safety follow-up.',
        attachments: [{ filename: 'letter.pdf', size: 4200 }],
      });

    expect([201, 503]).toContain(intake.status);
    if (intake.status === 503) {
      expect(intake.body.error).toContain('persistence is unavailable');
      return;
    }
    expect(intake.body.data.id).toBeDefined();
    expect(Array.isArray(intake.body.issues)).toBe(true);
    expect(intake.body.issues.length).toBeGreaterThan(0);

    expect(intake.body.data.parserMetadata?.parserVersion).toBe('keyword_heuristic_v1');
    expect(intake.body.data.parserMetadata?.confidenceMethod).toBe('fixed_heuristic_score');

    correspondenceId = intake.body.data.id;
    issueId = intake.body.issues[0].id;
  });

  it('rejects invalid correspondence payloads', async () => {
    const intake = await request(app)
      .post('/api/regulatory-correspondence/correspondence/intake')
      .set(authz)
      .send({
        projectId: 17,
        submissionId,
        subject: 'x',
        attachments: [{ filename: 'bad.bin', size: 90 * 1024 * 1024 }],
      });

    expect(intake.status).toBe(400);
    expect(intake.body.error).toBe('Validation error');
  });

  it('returns correspondence detail and allows issue review updates', async () => {
    if (!correspondenceId || !issueId) {
      return;
    }
    const detail = await request(app).get(
      `/api/regulatory-correspondence/correspondence/${correspondenceId}`
    ).set(authz);

    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(correspondenceId);

    const review = await request(app)
      .patch(`/api/regulatory-correspondence/issues/${issueId}/review`)
      .set(authz)
      .send({
        humanReviewStatus: 'confirmed',
        mappedCtdSections: ['3.2.S', '2.5'],
        resolutionStatus: 'in_progress',
      });

    expect(review.status).toBe(200);
    expect(review.body.data.humanReviewStatus || review.body.data.human_review_status).toBe(
      'confirmed'
    );
  });

  it('creates response package and returns timeline records', async () => {
    if (!correspondenceId) {
      return;
    }
    const responsePackage = await request(app)
      .post('/api/regulatory-correspondence/response-packages')
      .set(authz)
      .send({
        projectId: 17,
        sourceCorrespondenceId: correspondenceId,
        title: 'Deficiency Response Package 001',
      });

    expect([201, 503]).toContain(responsePackage.status);
    if (responsePackage.status === 503) {
      expect(responsePackage.body.error).toContain('persistence is unavailable');
      return;
    }
    expect(responsePackage.body.data.id).toBeDefined();

    const timeline = await request(app).get(
      `/api/regulatory-correspondence/timeline?submissionId=${submissionId}`
    ).set(authz);
    expect(timeline.status).toBe(200);
    expect(Array.isArray(timeline.body.data)).toBe(true);
    expect(timeline.body.data.length).toBeGreaterThan(0);
  });

  it('creates mailbox connection and returns connection list', async () => {
    const created = await request(app)
      .post('/api/regulatory-correspondence/mailbox-connections')
      .set(authz)
      .send({
        provider: 'gmail',
        mailboxIdentifier: 'reg-affairs@example.com',
        authState: 'connected',
        syncStatus: 'idle',
        scopes: ['gmail.readonly'],
      });

    expect([201, 503]).toContain(created.status);
    if (created.status === 503) {
      expect(created.body.error).toContain('persistence is unavailable');
      return;
    }
    expect(created.body.data.provider).toBe('gmail');

    const listed = await request(app)
      .get('/api/regulatory-correspondence/mailbox-connections')
      .set(authz);
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body.data)).toBe(true);
    expect(listed.body.data.length).toBeGreaterThan(0);
  });

  it('returns deficiency-pattern analytics', async () => {
    const analytics = await request(app).get(
      '/api/regulatory-correspondence/analytics/deficiency-patterns?projectId=17'
    ).set(authz);
    expect([200, 503]).toContain(analytics.status);
    if (analytics.status === 503) {
      expect(analytics.body.error).toContain('persistence is unavailable');
      return;
    }
    expect(Array.isArray(analytics.body.data)).toBe(true);
  });
});
