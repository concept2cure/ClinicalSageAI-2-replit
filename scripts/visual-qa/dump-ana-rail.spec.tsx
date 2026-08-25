// @vitest-environment jsdom
/**
 * Capture AnA's work record for the overflow check.
 *
 * ── Why the rail needs its own capture ───────────────────────────────────────
 * `dump-v2-surfaces.spec.tsx` walks SURFACE_VIEWS — the things that fill the
 * main pane. The AnA rail is not one of them: it is shell furniture, it renders
 * beside a surface rather than as one, and it is the narrowest column in the
 * product. So the existing capture, and every check built on it, has never seen
 * the component that actually broke.
 *
 * ── Why width is declared here rather than assumed there ─────────────────────
 * A surface gets the desktop viewport; this rail gets `--ana: 380px` minus 12px
 * of `.ana-body` padding a side. A layout verified at the wrong width is not
 * verified — a fix to this component was inspected at 460px, passed, and shipped
 * a horizontal overflow that only appears at the 356px it really gets. The
 * capture therefore writes the intended width alongside the markup, so the check
 * measures each fragment at the width its component is actually given.
 *
 * The markup is serialized from jsdom, which has no layout engine. That is the
 * point: jsdom produces the DOM, and the browser the check launches supplies the
 * layout jsdom cannot.
 */
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { describe, expect, it, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { AnaActivity } from '../../client/src/concept2cure/v2/AnaActivity';

const OUT = path.resolve(__dirname, '../../.visual-qa/markup');

/** The real rail: --ana is 380px, .ana-body pads 12px a side. */
const RAIL_CONTENT_WIDTH = 356;

const call = (o: Record<string, unknown> = {}) => ({
  name: 'compute_sample_size',
  label: 'Sample size — biostatistics engine',
  status: 'success' as const,
  ...o,
});

/** Long enough to exercise the reasoning block's 240px cap and its scrollbar. */
const LONG_REASONING = Array.from(
  { length: 14 },
  (_, i) =>
    `Step ${i + 1}: weighing whether the non-inferiority margin of 0.5 survives ` +
    `the site count, given 348 per arm at 1:1 allocation.`,
).join('\n');

/**
 * The states worth measuring. Each is a shape the rail really produces, and the
 * failure cases are here deliberately: the row that says something went wrong
 * carries the longest text in the record and is the first thing to overflow.
 */
const CASES: Array<{ id: string; node: React.ReactElement }> = [
  {
    id: 'streaming-first-round',
    node: (
      <AnaActivity
        streaming
        phase="Running 2 steps…"
        lens="risk"
        toolCalls={[call({ status: 'running' }), call({ name: 'check_dossier_consistency', label: 'Dossier consistency sweep', status: 'running' })]}
      />
    ),
  },
  {
    id: 'failed-step-long-message',
    node: (
      <AnaActivity
        streaming
        phase="Round 2 — running 1 more step…"
        lens="audit"
        documentType="Clinical Overview"
        toolCalls={[
          call({ round: 1, label: 'Precedent search' }),
          call({
            round: 1,
            label: 'Literature search',
            status: 'error',
            message: "AnA couldn't finish searching the literature. She'll continue with what she has.",
          }),
          call({ round: 2, label: 'Citation coverage across the dossier', status: 'running' }),
        ]}
      />
    ),
  },
  {
    id: 'reasoning-live',
    node: <AnaActivity streaming phase="Reading the results…" thinking={LONG_REASONING} toolCalls={[call()]} />,
  },
  {
    id: 'settled-collapsed',
    node: (
      <AnaActivity
        toolCalls={[call(), call({ name: 'x', label: 'Citation coverage' }), call({ name: 'y', label: 'Dossier sweep', status: 'error' })]}
        draftTitle="Clinical Overview 2.5"
        thinking="Weighed the margin."
      />
    ),
  },
];

beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

describe('capture the AnA work record', () => {
  it('the case list is non-trivial (guards the enumeration itself)', () => {
    // Without this, deleting the cases would leave the overflow check passing
    // over an empty set — a green gate that measures nothing.
    expect(CASES.length).toBeGreaterThanOrEqual(4);
  });

  it.each(CASES.map(c => c.id))('%s', (id) => {
    const { node } = CASES.find(c => c.id === id)!;
    // Wrapped in the classes the live shell puts around it, so the check
    // measures the record inside the box it really sits in.
    const { container } = render(
      <div className="c2c-v2">
        <div className="ana-body">
          <div className="ana-msg ana">{node}</div>
        </div>
      </div>,
    );
    const html = container.innerHTML;
    expect(html.includes('ana-activity')).toBe(true);
    fs.writeFileSync(path.join(OUT, `ana__${id}.html`), html, 'utf8');
    cleanup();
  });

  it('records the width each fragment must be measured at', () => {
    const manifest = Object.fromEntries(CASES.map(c => [`ana__${c.id}.html`, RAIL_CONTENT_WIDTH]));
    fs.writeFileSync(path.join(OUT, '_viewports.json'), JSON.stringify(manifest, null, 2), 'utf8');
    expect(Object.keys(manifest)).toHaveLength(CASES.length);
  });
});
