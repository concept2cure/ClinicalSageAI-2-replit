// @vitest-environment jsdom
/**
 * eCTD Co-Author — no fabricated governed actions or results.
 *
 * This surface is fixture-backed: its eCTD tree, artifact and provenance are
 * module constants, not project data. That is tolerable only while it is
 * clearly marked. What is not tolerable — and what these tests pin — is the
 * surface manufacturing regulatory *claims*:
 *
 *   - a pre-seeded thread reporting a COMPLETED `attach_sources_to_document`
 *     tool call that never ran,
 *   - a canned assistant reply to anything the user typed,
 *   - hardcoded eCTD validation findings and an ICH M4 compliance score of 78%
 *     substituted whenever the real endpoint failed, rendered identically to a
 *     genuine server response.
 *
 * A reviewer could not distinguish any of those from live output.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { EctdCoauthor } from '../surfaces/EctdCoauthor';

const onAsk = vi.fn();
const props = () => ({ surface: { id: 'ectd-coauthor', label: 'eCTD' } as any, onAsk, onNav: vi.fn(), segment: 'biopharma' });

beforeEach(() => {
  onAsk.mockReset();
  apiRequest.mockReset();
  // Every backend call fails — the condition that used to produce fixtures.
  apiRequest.mockRejectedValue(new Error('backend unreachable'));
  delete (window as any).C2C_API;
});
afterEach(cleanup);

describe('EctdCoauthor — no fabricated tool calls', () => {
  it('starts with no pre-seeded assistant turn claiming completed work', () => {
    render(<EctdCoauthor {...props()} />);
    const body = document.body.textContent || '';
    expect(body).not.toMatch(/attach_sources_to_document/);
    expect(body).not.toMatch(/run_validation/);
    // The fabricated efficacy claim that reply asserted.
    expect(body).not.toMatch(/I drafted §2\.5\.4 from the locked BX301-301 dataset/);
  });

  it('routes a typed question to AnA instead of answering it inline', async () => {
    render(<EctdCoauthor {...props()} />);
    const box = document.querySelector('.ec-composer textarea') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Tighten the efficacy paragraph' } });
    fireEvent.click(document.querySelector('.ec-send') as HTMLElement);

    // The question goes to the real AnA surface…
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    expect(onAsk.mock.calls[0][0]).toMatch(/Tighten the efficacy paragraph/);

    // …and no assistant reply is manufactured locally.
    expect(document.querySelector('.ec-msg-ai')).toBeNull();
    expect(document.body.textContent).not.toMatch(/I’ll draft against the linked evidence/);
  });
});

describe('EctdCoauthor — no fabricated validation or compliance results', () => {
  it('reports validation as unavailable rather than inventing findings', async () => {
    render(<EctdCoauthor {...props()} />);
    fireEvent.click(screen.getByTitle(/Focus mode/i).parentElement!.querySelector('.ec-topbtn.primary') as HTMLElement);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/validation service did not return a result/i);
    });
    // The retired hardcoded finding.
    expect(document.body.textContent).not.toMatch(/Required eCTD section 3\.2\.P is missing content/);
  });

  it('reports compliance as unavailable rather than inventing a score', async () => {
    render(<EctdCoauthor {...props()} />);
    const complianceTab = Array.from(document.querySelectorAll('.ec-art-tab'))
      .find(b => /compliance/i.test(b.textContent || '')) as HTMLElement;
    fireEvent.click(complianceTab);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/compliance service did not return a result/i);
    });
    // The retired hardcoded 78% ICH M4 score and its checks.
    expect(document.body.textContent).not.toMatch(/78/);
    expect(document.body.textContent).not.toMatch(/M4-DOC-001/);
  });
});

describe('EctdCoauthor — fixture content is labelled', () => {
  it('marks the fixture-backed artifact with the platform sample pill', () => {
    render(<EctdCoauthor {...props()} />);
    expect(document.querySelectorAll('.c2c-sample-tag').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/Sample data/);
  });
});
