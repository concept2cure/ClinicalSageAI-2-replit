/**
 * GET /api/docs serves the Help Center (P-127): the collections and courses, search, and one article. Until
 * 2026-11-12 the mount answered `{ docs: [] }` to every request.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import docsRouter from '../docs';

const app = () => express().use('/api/docs', docsRouter);

describe('GET /api/docs', () => {
  it('lists the collections with their articles, and the courses with their lessons', async () => {
    const res = await request(app()).get('/api/docs');
    expect(res.status).toBe(200);
    const { collections, courses, articleCount } = res.body.data;
    expect(articleCount).toBeGreaterThan(5);
    const gs = collections.find((c: { id: string }) => c.id === 'getting-started');
    expect(gs.title).toBe('Getting started');
    expect(gs.articles.map((a: { slug: string }) => a.slug)).toContain('what-is-concept2cure');
    expect(gs.articles[0]).not.toHaveProperty('body');
    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0].lessons[0].article.slug).toBeTruthy();
  });

  it('leaves out a course written for another client type', async () => {
    const device = (await request(app()).get('/api/docs?clientType=MDX')).body.data;
    expect(device.clientType).toBe('medtech');
    const ids = device.courses.map((c: { id: string }) => c.id);
    expect(ids).toContain('getting-started-device-diagnostics');
    expect(ids).not.toContain('getting-started-drug-biologic');
  });
});

describe('GET /api/docs/search', () => {
  it('answers a question with the article that holds its words, first', async () => {
    const res = await request(app()).get('/api/docs/search').query({ q: 'how do I reset my password' });
    expect(res.status).toBe(200);
    expect(res.body.data.hits[0]).toMatchObject({ slug: 'sign-in-and-sign-out', collection: 'getting-started' });
    expect(res.body.data.hits[0].snippet).toBeTruthy();
  });

  it('refuses an empty or overlong search, and finds nothing for nonsense', async () => {
    expect((await request(app()).get('/api/docs/search')).status).toBe(400);
    expect((await request(app()).get('/api/docs/search').query({ q: 'x'.repeat(201) })).status).toBe(400);
    expect((await request(app()).get('/api/docs/search').query({ q: 'zzqx flurbington' })).body.data.hits).toEqual([]);
  });
});

describe('GET /api/docs/:slug', () => {
  it('gives the article, its collection and its related articles', async () => {
    const res = await request(app()).get('/api/docs/assign-work');
    expect(res.status).toBe(200);
    expect(res.body.data.article).toMatchObject({ slug: 'assign-work', collection: 'projects' });
    expect(res.body.data.article.body).toMatch(/Due for you/);
    expect(res.body.data.collection.title).toBe('Projects and the plan');
    expect(res.body.data.related.length).toBeGreaterThan(0);
  });

  it('404s an address that holds no article', async () => {
    const res = await request(app()).get('/api/docs/no-such-article');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
