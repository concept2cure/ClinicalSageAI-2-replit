// @vitest-environment jsdom
/**
 * AnswerLead's tone cue (D0 review fix 9; docs/evidence/DESIGN/D0/D0-8-lead-cue/README.md).
 *
 * D0-4 made the lead quiet: no tinted panel, and the tone's icon and colour only on the
 * eyebrow line (`.al-k`). A lead with no eyebrow then showed its tone nowhere, so
 * SafetyNarrative's urgent lead, a 21 CFR 312.32(c) reporting clock due in days, read
 * as calm. And the icon is aria-hidden, so no lead ever told a screen reader its tone.
 *
 * These cases pin the cue:
 *   - urgent and good draw their icon (clock, check) and a visually hidden "Urgent:" or
 *     "On track:" on the lead's first line: the eyebrow when there is one, otherwise the
 *     headline, otherwise the body; exactly once;
 *   - calm draws neither, and its markup is what it was;
 *   - the headline cue is coloured like the eyebrow's (`--warning`, `--success`).
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AnswerLead } from '../AnswerLead';
import { I } from '../icons';

afterEach(cleanup);

type Tone = 'urgent' | 'good' | 'calm';
const WORDS: Record<Exclude<Tone, 'calm'>, string> = { urgent: 'Urgent:', good: 'On track:' };
const ICON: Record<Exclude<Tone, 'calm'>, React.ReactElement> = { urgent: I.clock, good: I.check };

const HEAD = 'SAE-0042 is due in 3 days — 15-day expedited report';
const EYEBROW = 'What the FDA is waiting on from you';

/** The icon as `I` renders it, to compare against what the lead drew. */
function iconMarkup(icon: React.ReactElement): string {
  const { container, unmount } = render(<i>{icon}</i>);
  const html = container.querySelector('svg')!.outerHTML;
  unmount();
  return html;
}

function lead(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.al-lead');
  expect(el).not.toBeNull();
  return el!;
}

describe('an urgent or good lead with no eyebrow carries its cue on the headline', () => {
  for (const tone of ['urgent', 'good'] as const) {
    it(`${tone}: the icon, then the hidden "${WORDS[tone]}", then the headline`, () => {
      const expected = iconMarkup(ICON[tone]);
      render(<AnswerLead tone={tone} headline={HEAD} body="The clock that matters right now." />);

      expect(lead().querySelector('.al-k')).toBeNull();
      const h = lead().querySelector<HTMLElement>('.al-h')!;
      const cue = h.firstElementChild as HTMLElement | null;
      expect(cue?.className).toBe('al-cue');
      expect(cue!.querySelector('svg')!.outerHTML).toBe(expected);
      expect(cue!.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

      const spoken = h.querySelector('.sr-only');
      expect(spoken?.textContent).toBe(WORDS[tone]);
      expect(cue!.nextElementSibling).toBe(spoken);
      // What a screen reader reads: the tone, then the answer.
      expect(h.textContent).toBe(`${WORDS[tone]} ${HEAD}`);
      // The headline's own words are still findable as they were.
      expect(screen.getByText(HEAD)).toBe(h);
    });
  }

  it('urgent with no eyebrow and no headline: the cue moves to the body, so it never vanishes', () => {
    render(<AnswerLead tone="urgent" body="Two expedited reports are due this week." />);
    const b = lead().querySelector<HTMLElement>('.al-b')!;
    expect(b.firstElementChild?.className).toBe('al-cue');
    expect(b.textContent).toBe('Urgent: Two expedited reports are due this week.');
  });
});

describe('an urgent or good lead with an eyebrow carries its cue on the eyebrow, once', () => {
  for (const tone of ['urgent', 'good'] as const) {
    it(`${tone}: the eyebrow keeps its icon and gains the hidden "${WORDS[tone]}"; the headline is untouched`, () => {
      const expected = iconMarkup(ICON[tone]);
      render(<AnswerLead tone={tone} eyebrow={EYEBROW} headline={HEAD} />);

      const k = lead().querySelector<HTMLElement>('.al-k')!;
      expect(k.querySelector('svg')!.outerHTML).toBe(expected);
      expect(k.querySelector('.sr-only')?.textContent).toBe(WORDS[tone]);
      expect(k.textContent!.replace(/\s+/g, ' ').trim()).toBe(`${WORDS[tone]} ${EYEBROW}`);

      const h = lead().querySelector<HTMLElement>('.al-h')!;
      expect(h.querySelector('.al-cue, svg, .sr-only')).toBeNull();
      expect(h.textContent).toBe(HEAD);

      // Once: one icon, one spoken tone, across the whole lead.
      expect(lead().querySelectorAll('.sr-only')).toHaveLength(1);
      expect(lead().querySelectorAll('.al-cue')).toHaveLength(0);
      expect(lead().querySelectorAll('svg')).toHaveLength(1);
    });
  }
});

describe('a calm lead stays as it was', () => {
  it('calm with no eyebrow: no icon, no hidden words, the headline alone', () => {
    render(<AnswerLead tone="calm" headline={HEAD} body="Nothing is due." />);
    expect(lead().querySelector('.al-k')).toBeNull();
    const h = lead().querySelector<HTMLElement>('.al-h')!;
    expect(h.innerHTML).toBe(HEAD);
    expect(lead().querySelector('.al-cue, .sr-only, svg')).toBeNull();
  });

  it('calm with an eyebrow: the eyebrow has no icon and no hidden words', () => {
    render(<AnswerLead eyebrow={EYEBROW} headline={HEAD} />);
    const k = lead().querySelector<HTMLElement>('.al-k')!;
    expect(k.querySelector('svg, .sr-only')).toBeNull();
    expect(k.textContent!.trim()).toBe(EYEBROW);
    expect(lead().querySelector<HTMLElement>('.al-h')!.textContent).toBe(HEAD);
    expect(lead().className).toBe('al-lead al-calm');
  });
});

describe('the headline cue looks like the eyebrow cue (app-v2.css)', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../styles/app-v2.css'),
    'utf8',
  );
  const decl = (selector: string): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const m = css.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : '';
  };

  it('urgent is --warning and good is --success, as on .al-k', () => {
    expect(decl('.c2c-v2 .al-urgent .al-k')).toMatch(/color:\s*var\(--warning\)/);
    expect(decl('.c2c-v2 .al-urgent .al-cue')).toMatch(/color:\s*var\(--warning\)/);
    expect(decl('.c2c-v2 .al-good .al-k')).toMatch(/color:\s*var\(--success\)/);
    expect(decl('.c2c-v2 .al-good .al-cue')).toMatch(/color:\s*var\(--success\)/);
  });

  it('the icon is 14px, the size of the eyebrow icon', () => {
    expect(decl('.c2c-v2 .al-k svg')).toMatch(/width:\s*14px;\s*height:\s*14px/);
    expect(decl('.c2c-v2 .al-cue svg')).toMatch(/width:\s*14px;\s*height:\s*14px/);
  });

  it('the hidden words use the one .sr-only rule, which hides them visually', () => {
    expect(decl('.c2c-v2 .sr-only')).toMatch(/position:\s*absolute/);
    expect(decl('.c2c-v2 .sr-only')).toMatch(/clip:\s*rect\(0 0 0 0\)/);
  });
});
