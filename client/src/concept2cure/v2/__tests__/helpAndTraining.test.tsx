// @vitest-environment jsdom
/**
 * Help & training (P-127): the Help Center, the courses and the organisation's own learning paths on one page. The
 * page renders what GET /api/docs serves (the real router, over the real corpus), searches it, opens an article and a
 * course, says a failed read is a failed read, and keeps what the Training screen showed before (P-122 §2).
 */
import React from 'react';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import docsRouter from '../../../../../server/routes/docs';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Training, helpViewFromLocation } from '../surfaces/Training';

const docs = express().use('/api/docs', docsRouter);
const json = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, headers: new Headers() }) as unknown as Response;
let docsDown = false;

beforeEach(() => {
  docsDown = false;
  window.history.replaceState(null, '', '/concept2cure/training');
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.startsWith('/api/docs')) {
      if (docsDown) return json(503, { error: 'down' });
      const r = await request(docs).get(url);
      return json(r.status, r.body);
    }
    if (url === '/api/enablement/paths') return json(200, { data: [{ id: 'p1', title: 'Medical writing basics', lessons: 4, done: 1, mins: 40, level: 'Intro', tone: 'ai' }] });
    if (url === '/api/enablement/certifications') return json(200, { data: [] });
    return json(200, { data: null });
  });
});
afterEach(() => cleanup());

const mount = (segment = 'biopharma') =>
  render(<Training surface={{ id: 'training', label: 'Help & training' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment={segment} />);

describe('Help & training', () => {
  it('lists the courses for the client type and the Help Center by collection', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /Getting started with Concept2Cure/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /device and diagnostics teams/ })).toBeNull();
    const browse = screen.getByRole('heading', { name: 'Browse help' }).closest('section')!;
    expect(within(browse).getByRole('heading', { name: 'Getting started' })).toBeTruthy();
    expect(within(browse).getByRole('button', { name: 'Assign a document or task to someone' })).toBeTruthy();
  });

  it('a device organisation is offered the device course', async () => {
    mount('medtech');
    expect(await screen.findByRole('button', { name: /device and diagnostics teams/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Getting started with Concept2Cure/ })).toBeNull();
  });

  it('searches, and opens the article it finds, with its address', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Browse help' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the Help Center' }), { target: { value: 'reset my password' } });
    const hit = await screen.findByRole('button', { name: /Sign in, reset your password/ }, { timeout: 2000 });
    fireEvent.click(hit);
    expect(await screen.findByRole('heading', { level: 2, name: /Sign in, reset your password/ })).toBeTruthy();
    expect(screen.getByText(/Forgot password\?/)).toBeTruthy();
    expect(window.location.search).toBe('?article=sign-in-and-sign-out');
  });

  it('says when nothing answers a search, and offers support', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Browse help' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the Help Center' }), { target: { value: 'zzqx flurbington' } });
    expect(await screen.findByText(/No article answers/, undefined, { timeout: 2000 })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /ask support/i }).length).toBeGreaterThan(0);
  });

  it('opens a course as its lessons, and a lesson as its article', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Getting started with Concept2Cure/ }));
    const lessons = await screen.findByRole('list');
    expect(within(lessons).getAllByRole('listitem').length).toBeGreaterThan(3);
    expect(screen.getByText('Your progress through a course is not recorded.')).toBeTruthy();
    fireEvent.click(within(lessons).getByRole('button', { name: 'Assign a document or task to someone' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Assign a document or task to someone' })).toBeTruthy();
  });

  it('opens the article a link names', async () => {
    window.history.replaceState(null, '', '/concept2cure/training?article=project-settings');
    mount();
    expect(await screen.findByRole('heading', { level: 2, name: /Change a project's settings/ })).toBeTruthy();
    expect(helpViewFromLocation('?course=administrator-setup')).toEqual({ kind: 'course', id: 'administrator-setup' });
  });

  it('a failed read of the Help Center says so, and keeps the organisation\'s learning paths', async () => {
    docsDown = true;
    mount();
    expect(await screen.findByText("Couldn't load the Help Center")).toBeTruthy();
    expect(screen.getByText(/failed read, not an empty Help Center/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Medical writing basics/ })).toBeTruthy();
    expect(screen.getByText('Your organisation has no certifications configured.')).toBeTruthy();
    docsDown = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /try again|retry/i })); });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Browse help' })).toBeTruthy());
  });
});
