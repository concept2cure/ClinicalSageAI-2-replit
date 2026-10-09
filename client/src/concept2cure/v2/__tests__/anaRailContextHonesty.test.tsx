// @vitest-environment jsdom
/**
 * The AnA rail's "Working in" block says only what is true about where the
 * person is.
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 * 1. A made-up "Current section". On every authoring surface (Protocol
 *    development, Document authoring, Prescribing information, Review, …)
 *    getAnaContext returned the per-SEGMENT co-author constant as `section` and
 *    `focus`, and the rail labelled it "Current section". In an empty org, with
 *    no protocol and no document open, Protocol development said
 *    "CURRENT SECTION 2.5 Clinical Overview" — and, after switching the domain
 *    picker, "§12 — Substantial Equivalence". Neither section existed, and
 *    neither is part of a protocol. The action chips then worked from that
 *    false position: "Explain blocker" sent "Explain the ORR contradiction
 *    blocking §2.5", "Draft SE comparison" named predicate K203117. Nothing in
 *    the tenant's data supplied any of it.
 *
 * 2. Engineering vocabulary as rail copy. Surfaces without a curated context
 *    used the first sentence of the registry `notes` as "what AnA is attached
 *    to here". Those notes are capability summaries: Protocol development's
 *    carries the ticket range "(C2C-17..22)", Vault's ends in "the governed,
 *    audited /file route", Tasks names "@shared/schema unifiedTasks". The
 *    greeting then appended "." to a sentence that already ended in one.
 *
 * 3. Home had no registry meta, so the rail said "WORKING IN home" and
 *    "the home workspace" — the raw surface id.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../dataConnect', () => ({
  connected: () => false,
}));

import { AnaRail } from '../Shell';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { RAIL_CORE, RAIL_QUICK, getAnaContext } from '../registryModel';

afterEach(() => cleanup());

function renderRail(surface: { id: string; label: string }, segment: string) {
  render(
    <AnaRail
      open
      setOpen={() => {}}
      surface={surface}
      segment={segment}
      mode="standard"
      setMode={() => {}}
      messages={[]}
      onSend={vi.fn()}
      onAct={vi.fn()}
      onNav={vi.fn()}
    />,
  );
  const ctx = document.querySelector('.ana-ctx');
  expect(ctx, 'the Working in block renders').toBeTruthy();
  return { ctx: ctx!.textContent || '', rail: document.querySelector('aside.ana')!.textContent || '' };
}

const AUTHORING = [
  'protocol-dev',
  'document-authoring',
  'regulatory-workspace',
  'labeling-pi',
  'doc-journey',
  'ectd-coauthor',
  'ectd-compile',
  'review',
];

/** Premises no empty organisation has: a section, a blocker, an approved
 *  version, a label, a predicate number, a sponsor count. */
const INVENTED = [
  /Current section/i,
  /2\.5 Clinical Overview/,
  /Substantial Equivalence/,
  /Annex II/,
  /Explain blocker/,
  /Compare to approved version/,
  /Draft USPI label/,
  /K203117/,
  /ORR contradiction/,
];

describe('AnA rail — no invented current section', () => {
  for (const segment of ['biopharma', 'medtech', 'diagnostics', 'cro', 'health']) {
    it(`Protocol development in the ${segment} domain claims no section and no blocker`, () => {
      const { rail } = renderRail({ id: 'protocol-dev', label: 'Protocol development' }, segment);
      for (const re of INVENTED) expect(rail).not.toMatch(re);
      // The block still says where AnA is — the module, as focus.
      expect(screen.getAllByText('Protocol development').length).toBeGreaterThan(0);
      expect(screen.getByText('Focus')).toBeTruthy();
    });
  }

  it('no authoring surface reports a section or sends a prompt that presumes one', () => {
    for (const id of AUTHORING) {
      for (const segment of ['biopharma', 'medtech', 'diagnostics', 'cro', 'health']) {
        const ac = getAnaContext(id, segment);
        expect(ac.section, `${id}/${segment} section`).toBeNull();
        const prompts = ac.actions.map((a) => `${a.label} ${a.prompt ?? ''}`).join(' | ');
        for (const re of INVENTED) expect(prompts, `${id}/${segment}`).not.toMatch(re);
        // Replacement is reachable: the rail still offers actions here.
        expect(ac.actions.length, `${id}/${segment} actions`).toBeGreaterThan(0);
      }
    }
  });

  it('the focus on an authoring surface does not change with the domain picker', () => {
    const bio = getAnaContext('protocol-dev', 'biopharma');
    const mdx = getAnaContext('protocol-dev', 'medtech');
    expect(bio.focus).toBe('Protocol development');
    expect(mdx.focus).toBe(bio.focus);
  });
});

/** Engineering vocabulary that has no place in rail copy. */
const INTERNAL = [
  /\bC2C-\d/,
  /\/api\//,
  /\/file route/,
  /@shared/,
  /\bunifiedTasks\b/,
  /\b[a-z]+_[a-z_]+\b/, // snake_case identifiers: table / tool names
  /\.tsx?\b/,
];

describe('AnA rail — no internal identifiers in "Working in"', () => {
  it('Protocol development shows no ticket range and no doubled period', () => {
    const { rail } = renderRail({ id: 'protocol-dev', label: 'Protocol development' }, 'biopharma');
    expect(rail).not.toMatch(/C2C-17/);
    expect(rail).not.toMatch(/\.\./);
  });

  it('Vault and Tasks show no route or schema names', () => {
    const vault = renderRail({ id: 'vault', label: 'Vault (DMS)' }, 'biopharma').rail;
    expect(vault).not.toMatch(/\/file route/);
    cleanup();
    const tasks = renderRail({ id: 'tasks', label: 'Tasks & collaboration' }, 'biopharma').rail;
    expect(tasks).not.toMatch(/@shared|unifiedTasks/);
  });

  it('no registered surface puts an internal identifier in module, here or focus', () => {
    for (const s of UI_SURFACES) {
      const ac = getAnaContext(s.id, 'biopharma');
      for (const field of [ac.module, ac.here, ac.focus] as const) {
        for (const re of INTERNAL) expect(field, `${s.id}: ${field}`).not.toMatch(re);
      }
      // The greeting appends "." itself.
      expect(ac.here.endsWith('.'), `${s.id} here ends with a period`).toBe(false);
    }
  });

  it('Home is named Home, not by its raw id', () => {
    const { ctx } = renderRail({ id: 'home', label: 'Home' }, 'biopharma');
    expect(ctx).toMatch(/Working in\s*Home/);
    expect(ctx).not.toMatch(/\bhome\b/);
    const ac = getAnaContext('home', 'biopharma');
    expect(ac.module).toBe('Home');
    expect(ac.focus).toBe('Home');
  });
});

describe('Quick access — no entry promises a feature that does not exist', () => {
  it('there is no "Starred Items" entry (nothing in the product can be starred)', () => {
    expect(RAIL_QUICK.map((q) => q.label)).not.toContain('Starred Items');
    expect(RAIL_QUICK.map((q) => q.id)).not.toContain('starred');
  });

  it('Projects, the destination that entry opened, is still on the rail', () => {
    expect(RAIL_CORE.map((r) => r.id)).toContain('projects');
  });
});
