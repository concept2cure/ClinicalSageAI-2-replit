// @vitest-environment jsdom
/**
 * AnA does not invent a response to an agency letter.
 *
 * ── What was shipping ────────────────────────────────────────────────────────
 * "Draft response with AnA" on a correspondence item opened AnaDrafter, whose
 * Generate button made NO request to AnA. It waited 850ms to look like work,
 * then assembled a response to an agency deficiency letter out of string
 * templates, stamped it `generated_by: 'AnA'`, and filled the §11 sign-off
 * roster with four invented people — a Reg Lead, a Biostat, a Med Affairs
 * reviewer and a QA reviewer who do not exist at this company or any other.
 *
 * Three of the four structured letters on file (rta-2, d100-2, nbq-3) carry a
 * `draft` with no `deficiencies`, so they took that path every time. Only
 * rta-3 has a real persisted draft.
 *
 * A regulatory reviewer opening that screen saw AnA-attributed prose answering
 * an FDA/notified-body finding, over a named approval chain, all of it
 * manufactured in the browser. CLAUDE.md: fail closed, never fabricate — no
 * simulated agency responses outside dev.
 *
 * ── Both directions ──────────────────────────────────────────────────────────
 * Falsified against the pre-fix code: the first test failed (a draft appeared,
 * carrying "Jordan Chen"), and the second passes either way — it pins that
 * removing the fabrication did not also break adopting a REAL persisted draft.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { AnaDrafter } from '../components/AnaDrafter';
import { CORRESP_DETAIL } from '../data/correspondenceDetail';
import type { Correspondence } from '../types';

const INVENTED = ['Jordan Chen', 'Marcus Wei', 'Lee Hartman', 'Priya Shah'];

function letter(id: string): Correspondence {
  return {
    id,
    kind: 'AI Request',
    channel: 'ESG',
    from: 'FDA CDRH',
    received: '2026-08-01T10:00:00Z',
    due: '2026-09-01T10:00:00Z',
    status: 'open',
    subject: 'Additional information required',
    summary: 'Deficiencies identified during substantive review.',
    refs: [],
  };
}

afterEach(cleanup);

describe('AnaDrafter never fabricates a regulatory response', () => {
  it('fails closed on a letter with no AnA draft, naming no invented reviewers', () => {
    // rta-2 is structured (so the drafter opens) but has no persisted
    // draft.deficiencies — precisely the case that used to fabricate.
    expect(CORRESP_DETAIL['rta-2']).toBeTruthy();
    expect(CORRESP_DETAIL['rta-2'].draft?.deficiencies).toBeFalsy();

    render(
      <AnaDrafter
        correspondence={letter('rta-2')}
        pathway="k510"
        onClose={() => {}}
        onOpenSection={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Draft .*response|Generate/i }));

    // An honest refusal, not a manufactured document.
    expect(screen.getByRole('alert').textContent).toMatch(/No AnA-drafted response exists/i);

    // Nothing anywhere on the screen names a person who does not exist.
    const body = document.body.textContent ?? '';
    for (const name of INVENTED) {
      expect(body, `fabricated reviewer "${name}" is on screen`).not.toContain(name);
    }
    // And nothing claims AnA authored something she never saw.
    expect(body).not.toMatch(/We respectfully request that review be resumed/);
  });

  it('still adopts a REAL persisted draft when one exists', () => {
    // rta-3 is the one letter with a genuine stored draft.
    expect(CORRESP_DETAIL['rta-3'].draft?.deficiencies?.length).toBeTruthy();

    render(
      <AnaDrafter
        correspondence={letter('rta-3')}
        pathway="k510"
        onClose={() => {}}
        onOpenSection={() => {}}
      />
    );

    // A stored draft renders without anyone pressing Generate, and the
    // fail-closed alert must NOT be showing.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
