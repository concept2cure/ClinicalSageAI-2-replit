// server/routes/__tests__/deviceProfileRoutes.test.ts
import request from 'supertest';
import express from 'express';
import deviceProfileRoutes from '../deviceProfileRoutes';

const app = express();
app.use(express.json());
app.use('/api/device-profiles', deviceProfileRoutes);

describe('DeviceProfileRoutes (integration)', () => {
  let createdId: string;

  it('POST  /api/device-profiles  → creates a profile', async () => {
    const res = await request(app)
      .post('/api/device-profiles')
      .send({ name: 'TestDevice', classification: 'Class II' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('TestDevice');
    createdId = res.body.id;
  });

  it('GET   /api/device-profiles  → returns array including created', async () => {
    const res = await request(app).get('/api/device-profiles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p: any) => p.id === createdId)).toBe(true);
  });

  it('GET   /api/device-profiles/:id  → returns single profile', async () => {
    const res = await request(app).get(`/api/device-profiles/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdId);
  });

  it('PUT   /api/device-profiles/:id  → updates and returns profile', async () => {
    const res = await request(app)
      .put(`/api/device-profiles/${createdId}`)
      .send({ classification: 'Class III' });

    expect(res.status).toBe(200);
    expect(res.body.classification).toBe('Class III');
  });

  it('DELETE /api/device-profiles/:id  → deletes profile', async () => {
    const res = await request(app).delete(`/api/device-profiles/${createdId}`);
    expect(res.status).toBe(204);

    const check = await request(app).get(`/api/device-profiles/${createdId}`);
    expect(check.status).toBe(404); // Assuming 404 is returned for missing profiles
  });
});
