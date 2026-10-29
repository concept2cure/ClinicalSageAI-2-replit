/**
 * ICH E3 outline contract for the CSR builder and job runner.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * Until 2026-10-29 the builder drafted from its own outline, ICH_E3_STRUCTURE:
 * 46–50 nodes, an invented §2.1–2.10 synopsis decomposition and §8.1–8.2, and
 * no §11.4.x, §12.2.x, §12.3.x, §12.4.x, §14.x or §16.x children. The platform's
 * one model of a CSR is ICH_E3_GUIDANCE (server/services/ind/ctd/
 * csr-e3-guidance.ts, 119 headings), and the job runner, the csr-workflow
 * board, workflow-source-import and the M5 clinical QC all read the copy. A
 * heading missing from the copy was missing from every CSR the platform built.
 *
 * Slice 2 of docs/design/CSR_END_TO_END_2026-10-29.md converged the builder
 * onto ICH_E3_GUIDANCE and deleted the copy. This file holds it there: every
 * E3 number in the builder's tree, E3's titles, nothing the guidance does not
 * number, and e3SectionDraftingMode honoured — §3 and §14–16 are 'manual' and
 * are never a model drafting target.
 */

import { describe, it, expect } from 'vitest';
import * as builder from '../csr-builder';
import { flattenICHE3Sections, getICHE3Structure, resolveCSRDraftTargets, csrSectionSelectionRefusal } from '../csr-builder';
import { ICH_E3_GUIDANCE, e3Children, e3SectionDraftingMode } from '../ind/ctd/csr-e3-guidance';

const E3_NUMBERS = ICH_E3_GUIDANCE.map((s) => s.number);
const flat = () => flattenICHE3Sections(getICHE3Structure());

describe('the CSR builder outline is ICH_E3_GUIDANCE', () => {
  it('carries every ICH_E3_GUIDANCE heading, in report order, and nothing else', () => {
    expect(E3_NUMBERS.length).toBeGreaterThanOrEqual(119);
    expect(flat().map((s) => s.number)).toEqual(E3_NUMBERS);
  });

  it("uses E3's titles and nests each heading under its E3 parent", () => {
    const byNumber = new Map(ICH_E3_GUIDANCE.map((s) => [s.number, s]));
    for (const node of flat()) {
      expect(node.title, `§${node.number}`).toBe(byNumber.get(node.number)!.title);
      expect((node.childSections ?? []).map((c) => c.number), `§${node.number} children`)
        .toEqual(e3Children(node.number).map((c) => c.number));
    }
  });

  it('has no builder-invented synopsis or objectives children', () => {
    const numbers = new Set(flat().map((s) => s.number));
    for (const invented of ['2.1', '2.8', '2.10', '8.1', '8.2']) expect(numbers.has(invented)).toBe(false);
  });

  it('records the E3 drafting mode on every heading', () => {
    for (const node of flat()) expect(node.draftingMode, `§${node.number}`).toBe(e3SectionDraftingMode(node.number));
  });

  it('marks §1–§13 required', () => {
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']) {
      expect(getICHE3Structure().find((s) => s.number === n)?.required, `§${n}`).toBe(true);
    }
  });

  it('no longer exports the duplicate outline or a second section-number list', () => {
    expect('ICH_E3_STRUCTURE' in builder).toBe(false);
    expect('ICH_E3_STRUCTURE' in (builder.default as Record<string, unknown>)).toBe(false);
  });
});

describe('drafting targets honour e3SectionDraftingMode', () => {
  it('a full build drafts every narrative heading that carries content, and no manual heading', () => {
    const targets = resolveCSRDraftTargets().map((s) => s.number);
    const expected = ICH_E3_GUIDANCE.filter((s) => e3SectionDraftingMode(s.number) === 'narrative' &&
      (e3Children(s.number).length === 0 || (s.contains?.length ?? 0) > 0)).map((s) => s.number);
    expect(targets).toEqual(expected);
    expect(targets).toContain('12.2.1');
    expect(targets).toContain('11.4.1');
    expect(targets.some((n) => n === '3' || /^(14|15|16)(\.|$)/.test(n))).toBe(false);
  });

  it('a selected heading drafts its narrative subtree', () => {
    expect(resolveCSRDraftTargets(['12.2']).map((s) => s.number)).toEqual(['12.2.1', '12.2.2', '12.2.3', '12.2.4']);
    expect(resolveCSRDraftTargets(['12.2.1']).map((s) => s.number)).toEqual(['12.2.1']);
  });

  it.each(['3', '14', '14.3.1', '15', '16', '16.2.7'])('refuses manual §%s by name', (n) => {
    expect(csrSectionSelectionRefusal([n])?.code).toBe('CSR_SECTION_MANUAL');
    expect(() => resolveCSRDraftTargets([n])).toThrow('CSR_SECTION_MANUAL');
  });

  it.each([[['99']], [['2.1']], [['5', '5']], [[]]])('refuses an invalid selection %j', (sel) => {
    expect(csrSectionSelectionRefusal(sel as string[])?.code).toBe('CSR_SECTION_SELECTION_INVALID');
  });
});
