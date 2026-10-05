/**
 * What AnA tells a sponsor about FDA formal-meeting deadlines and the ICH E2F
 * DSUR outline is what FDA and ICH say (D2, 2026-10-04,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b3-meetings-dsur-facts.md).
 *
 * Defects these assertions were written against:
 *   - end_of_phase_2_meeting said FDA schedules the meeting within 60 days and
 *     the package is due 30 days before it. EOP2 is a Type B(EOP) meeting:
 *     70 days, package no later than 50 days before (FDA formal-meetings
 *     guidance; PDUFA VII letter). A late package is a ground to cancel.
 *   - every meeting entry cited the Dec 2017 draft; FDA finalized the guidance
 *     in Aug 2026 (Federal Register 2026-16452).
 *   - ana-ri's fda_type_b_meeting_package was a hand-kept 7-heading copy with
 *     no CMC, nonclinical or clinical-plan section, said the package
 *     "accompanies the meeting request" (true only for Type A, D, INTERACT),
 *     and served every pre-IND / EOP2 / pre-NDA / pre-BLA request.
 *   - the DSUR record called E2F §19 "Conclusions" (E2F: §19 Summary of
 *     Important Risks, §20 Conclusions), never asked for §19, and listed
 *     interval SAEs where E2F §7.2 lists serious adverse reactions.
 *   - ana-ri's dsur template forced 14 mis-numbered headings ("14.
 *     Conclusions") as "the ICH E2F structure exactly", and one of its
 *     detection patterns held a form feed (\f) and could never match.
 *
 * Follow-ups F17-F20 (2026-10-05,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-meeting-template-followups-facts.md):
 *   - F17 the generic fda_formal_meeting_package (EOP1, Type A, C, D,
 *     INTERACT) took its shared sections from the pre-IND entry, so it told a
 *     sponsor every meeting request is a "Formal Type B meeting request", and
 *     it never stated a Type C deadline.
 *   - F18 Type C's 47-day package deadline is recall; AnA stated it with no
 *     label. A recall deadline is now said to be recall wherever it is stated.
 *   - F19 "an IND annual report request is not served the DSUR template" never
 *     failed on the code it was written against (the \f pattern matched
 *     nothing either way). Replaced by a liveness check that the \f pattern
 *     fails.
 *   - F20 no per-section word target is restored: neither FDA's formal-meetings
 *     guidance nor ICH E2F gives one.
 */
import { describe, it, expect } from 'vitest';
import { LIFECYCLE_DOCUMENT_TYPES } from '../../server/services/ind/ctd/index';
import * as lifecycle from '../../server/services/ind/ctd/lifecycle-document-types';
import {
  detectDocumentTemplate,
  buildDocumentTemplateBlock,
  DOCUMENT_TEMPLATES,
} from '../../server/services/ana-ri/document-templates';

const byId = (id: string) => LIFECYCLE_DOCUMENT_TYPES.find((t) => t.id === id)!;
const meetings = LIFECYCLE_DOCUMENT_TYPES.filter((t) => t.meetingPackage);
/** "Type B(EOP)", but "INTERACT": FDA does not call it a Type. */
const typeName = (t: string) => (t === 'INTERACT' ? t : `Type ${t}`);

/** Every string a lifecycle entry carries, for prose assertions. */
const entryText = (id: string) => JSON.stringify(byId(id));
const componentText = (id: string, code: string) =>
  JSON.stringify(byId(id).components.find((c) => c.code === code) ?? null);

const blockFor = (message: string) => {
  const detected = detectDocumentTemplate(message);
  expect(detected, `no template for "${message}"`).not.toBeNull();
  return buildDocumentTemplateBlock(detected!);
};

/** Requests each DSUR and meeting detection pattern is written for. A pattern none of them matches can never fire. */
const LIVE_REQUESTS: Record<string, string[]> = {
  dsur: ['draft our DSUR', 'development safety update report for the 2026 period', 'annual safety report to FDA'],
  fda_pre_ind_meeting_package: ['pre-IND meeting', 'pre-IND package'],
  fda_eop_meeting_package: ['end of phase 2 meeting', 'EOP2 meeting', 'Type B(EOP) request', 'end-of-phase II briefing document', 'pre-phase 3 meeting'],
  fda_pre_nda_meeting_package: ['pre-NDA meeting', 'pre-NDA package'],
  fda_pre_bla_meeting_package: ['pre-BLA meeting', 'pre-BLA briefing'],
  fda_formal_meeting_package: ['Type B meeting request', 'FDA meeting package', 'formal meeting briefing', 'end of phase 1 meeting', 'EOP1 meeting'],
};

/** "<template id>: <pattern>" for every listed template's pattern that matches none of its requests (lower-cased, as detection does). */
function deadPatterns(requests: Record<string, string[]>): string[] {
  return Object.entries(requests).flatMap(([id, msgs]) =>
    DOCUMENT_TEMPLATES[id].detectionPatterns.filter((p) => !msgs.some((m) => p.test(m.toLowerCase()))).map((p) => `${id}: ${p}`));
}

describe('FDA formal-meeting timelines come from one table', () => {
  const table = (lifecycle as Record<string, unknown>).FDA_FORMAL_MEETING_TIMELINES as
    | Record<string, { scheduleDays: number; packageDue: number | 'with-request'; basis: unknown[] }>
    | undefined;

  it('holds the six PDUFA meeting types with their schedule and package deadlines', () => {
    expect(table, 'FDA_FORMAL_MEETING_TIMELINES is not exported').toBeDefined();
    expect(Object.keys(table!).sort()).toEqual(['A', 'B', 'B(EOP)', 'C', 'D', 'INTERACT'].sort());
    expect(table!['B(EOP)']).toMatchObject({ scheduleDays: 70, packageDue: 50 });
    expect(table!.B).toMatchObject({ scheduleDays: 60, packageDue: 30 });
    expect(table!.A).toMatchObject({ scheduleDays: 30, packageDue: 'with-request' });
    expect(table!.D.packageDue).toBe('with-request');
    expect(table!.INTERACT.packageDue).toBe('with-request');
    for (const [type, row] of Object.entries(table!)) {
      expect(row.basis.length, `${type}: basis`).toBeGreaterThan(0);
    }
  });

  it('labels every figure not read in FDA text as recall', () => {
    const c = table!.C as unknown as { packageDue: number; basis: Array<{ ref: string; confidence: string }> };
    const packageBasis = c.basis.find((b) => /package/i.test(b.ref));
    expect(packageBasis?.confidence).toBe('recall');
  });

  it('every row names the basis of its package deadline, and that basis is one of its cited sources', () => {
    for (const [type, row] of Object.entries(lifecycle.FDA_FORMAL_MEETING_TIMELINES)) {
      expect(row.packageDueBasis, `${type}: packageDueBasis`).toBeDefined();
      expect(row.basis, `${type}: packageDueBasis listed in basis`).toContain(row.packageDueBasis);
    }
    expect(lifecycle.FDA_FORMAL_MEETING_TIMELINES.C.packageDueBasis.confidence).toBe('recall');
    expect(lifecycle.FDA_FORMAL_MEETING_TIMELINES.B.packageDueBasis.confidence).toBe('regulator-text');
    expect(lifecycle.FDA_FORMAL_MEETING_TIMELINES['B(EOP)'].packageDueBasis.confidence).toBe('regulator-text');
  });

  it('a deadline read only from recall is said to be recall where it is stated (F18)', () => {
    expect(lifecycle.meetingPackageDeadline('C')).toMatch(/\b47\b/);
    expect(lifecycle.meetingPackageDeadline('C')).toMatch(/recall/i);
    for (const type of ['A', 'B', 'B(EOP)', 'D', 'INTERACT'] as const) {
      expect(lifecycle.meetingPackageDeadline(type), type).not.toMatch(/recall/i);
    }
  });
});

describe('the end-of-Phase-2 meeting is a Type B(EOP) meeting', () => {
  it('timing is 70 days to the meeting and the package 50 calendar days before it', () => {
    const timing = byId('end_of_phase_2_meeting').timing ?? '';
    expect(timing).toMatch(/\b70\b/);
    expect(timing).toMatch(/50 calendar days/);
    expect(timing).toContain('Type B(EOP)');
  });

  it('no EOP2 component tells the sponsor the package is due 30 days ahead', () => {
    const text = entryText('end_of_phase_2_meeting');
    expect(text).not.toMatch(/30 days ahead|30 days before/);
    expect(text).not.toMatch(/Type B window/);
  });

  it.each(['pre_ind_meeting', 'pre_nda_meeting', 'pre_bla_meeting'])(
    '%s keeps the plain Type B 60/30 timing',
    (id) => {
      const timing = byId(id).timing ?? '';
      expect(timing).toMatch(/\b60\b/);
      expect(timing).toMatch(/30 calendar days/);
    },
  );
});

describe('meeting entries cite the final formal-meetings guidance', () => {
  it.each(meetings.map((m) => m.id))('%s carries no 2017 citation', (id) => {
    expect(entryText(id)).not.toMatch(/2017/);
    expect(byId(id).regulatoryBasis.join(' ')).toMatch(/final.*2026|2026.*final/i);
  });
});

describe("ana-ri's meeting templates are derived from the lifecycle record", () => {
  it('a pre-IND meeting package carries the CMC summary and no "accompanies the request" claim', () => {
    const block = blockFor('draft our pre-IND meeting package');
    expect(block).toContain('Chemistry, Manufacturing, and Controls (CMC) Summary');
    expect(block).toContain('Nonclinical Pharmacology and Toxicology Summary');
    expect(block).not.toContain('accompanies the meeting request');
    expect(block).not.toMatch(/2017/);
  });

  it('an EOP2 briefing document gets the EOP2 components and the 50-day package deadline', () => {
    const block = blockFor('end of phase 2 meeting briefing document');
    for (const c of byId('end_of_phase_2_meeting').components) expect(block).toContain(c.title);
    expect(block).toMatch(/50 (calendar )?days before/);
    expect(block).not.toMatch(/30 (calendar )?days before/);
  });

  it.each(['end of phase 1 meeting', 'EOP1 meeting package'])(
    '"%s" is not served the EOP2 (Type B(EOP)) template',
    (message) => {
      const detected = detectDocumentTemplate(message);
      expect(detected?.template.id).toBe('fda_formal_meeting_package');
      const block = buildDocumentTemplateBlock(detected!);
      expect(block).toMatch(/End-of-Phase 1 meeting is Type B\(EOP\) only/);
    },
  );

  it.each([
    ['draft the pre-NDA meeting package', 'pre_nda_meeting'],
    ['prepare our pre-BLA meeting briefing document', 'pre_bla_meeting'],
  ])('"%s" gets the %s components', (message, id) => {
    const block = blockFor(message);
    for (const c of byId(id).components) expect(block).toContain(c.title);
  });

  it('no meeting template is a hand-kept heading list', () => {
    const titles = new Set([
      ...meetings.flatMap((m) => m.components.map((c) => c.title)),
      ...lifecycle.FDA_MEETING_PACKAGE_CORE.map((c) => c.title),
    ]);
    for (const t of Object.values(DOCUMENT_TEMPLATES).filter((x) => /meeting/.test(x.id))) {
      for (const s of t.sections) expect(titles.has(s.heading), `${t.id}: ${s.heading}`).toBe(true);
    }
  });
});

describe('the generic FDA formal-meeting package is meeting-type neutral (F17)', () => {
  const generic = () => DOCUMENT_TEMPLATES.fda_formal_meeting_package;

  it('its sections are the meeting-package core, not one lifecycle entry\'s wording', () => {
    const core = lifecycle.FDA_MEETING_PACKAGE_CORE;
    expect(generic().sections.map((s) => [s.heading, s.guidance])).toEqual(core.map((c) => [c.title, c.guidance]));
    for (const c of core) {
      for (const m of meetings) {
        expect(m.components.some((o) => o.code === c.code), `${m.id} has no ${c.code}`).toBe(true);
      }
      expect(c.basis.length, `${c.code}: basis`).toBeGreaterThan(0);
    }
  });

  it('no section guidance names one meeting type or one meeting', () => {
    for (const s of generic().sections) {
      expect(s.guidance, s.heading).not.toMatch(/pre-?IND|Phase 2|Phase 3|pre-?NDA|pre-?BLA/i);
    }
    expect(generic().sections.map((s) => s.heading)).not.toContain('Product Background and Development Rationale');
  });

  it('the request-letter section says which meeting types take the package with the request, from the table', () => {
    const req = generic().sections.find((s) => s.heading === 'Meeting Request Letter and Cover Letter')!;
    const withRequest = Object.values(lifecycle.FDA_FORMAL_MEETING_TIMELINES)
      .filter((r) => r.packageDue === 'with-request').map((r) => r.type);
    for (const t of withRequest) expect(req.guidance).toContain(typeName(t));
    expect(req.guidance).not.toMatch(/Formal Type B meeting request/);
  });

  it('its instructions state every meeting type\'s schedule and package deadline from the table', () => {
    const text = generic().draftingInstructions;
    for (const row of Object.values(lifecycle.FDA_FORMAL_MEETING_TIMELINES)) {
      expect(text, row.type).toContain(`${typeName(row.type)}: scheduled within ${row.scheduleDays} days`);
      expect(text, row.type).toContain(lifecycle.meetingPackageDeadline(row.type));
    }
    expect(text).not.toMatch(/every pre-IND, EOP, pre-NDA and pre-BLA package carries/);
  });

  it('an EOP1 request is told its package deadline is 30 or 50 days by product, not given the pre-IND wording', () => {
    const block = blockFor('EOP1 meeting package');
    expect(block).not.toContain('Formal Type B meeting request');
    expect(block).toContain('Type B(EOP): scheduled within 70 days');
  });
});

describe('no meeting or DSUR section carries a word target: neither FDA nor ICH E2F gives one (F20)', () => {
  it.each(['dsur', 'fda_pre_ind_meeting_package', 'fda_eop_meeting_package', 'fda_pre_nda_meeting_package', 'fda_pre_bla_meeting_package', 'fda_formal_meeting_package'])(
    '%s sections have no targetWords',
    (id) => {
      for (const s of DOCUMENT_TEMPLATES[id].sections) expect(s.targetWords, `${id}: ${s.heading}`).toBeUndefined();
    },
  );
});

describe('the DSUR follows ICH E2F: §19 Summary of Important Risks, §20 Conclusions', () => {
  const dsur = () => byId('dsur');
  const allComponentText = () => dsur().components.map((c) => `${c.guidance} ${c.generationPrompt}`);

  it('some component asks for E2F Section 19 (Summary of Important Risks)', () => {
    expect(allComponentText().some((t) => /Section 19 \(Summary of Important Risks\)/.test(t))).toBe(true);
  });

  it('no component calls Section 19 the conclusions', () => {
    for (const t of allComponentText()) {
      expect(t).not.toMatch(/Section 19 \(Conclusions\)/);
      expect(t).not.toMatch(/19 and appendices/);
    }
  });

  it('the conclusions are E2F Section 20', () => {
    expect(allComponentText().some((t) => /Section 20 \(Conclusions\)/.test(t))).toBe(true);
  });

  it('interval line listings are of serious adverse reactions (E2F 7.2), tabulations of SAEs (7.3)', () => {
    const text = componentText('dsur', 'dsur.line_listings');
    expect(text).toContain('serious adverse reactions');
    expect(text).not.toContain('Interval SAE line listings');
  });

  it('exports the E2F outline once, every heading cited', () => {
    const sections = (lifecycle as Record<string, unknown>).ICH_E2F_DSUR_SECTIONS as
      | Array<{ number?: string; title: string; basis: Array<{ ref: string; confidence: string; url?: string }> }>
      | undefined;
    expect(sections, 'ICH_E2F_DSUR_SECTIONS is not exported').toBeDefined();
    const numbered = sections!.filter((s) => s.number);
    expect(numbered.map((s) => s.number)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    expect(numbered[18].title).toBe('Summary of Important Risks');
    expect(numbered[19].title).toBe('Conclusions');
    for (const s of sections!) {
      expect(s.basis[0]?.confidence, s.title).toBe('regulator-text');
      expect(s.basis[0]?.url, s.title).toMatch(/ema\.europa\.eu|database\.ich\.org/);
    }
  });
});

describe("ana-ri's DSUR template is the E2F outline", () => {
  it('the injected block carries §16, §19 and §20 under their E2F numbers', () => {
    const block = blockFor('draft our DSUR');
    expect(block).toContain('16. Region-Specific Information');
    expect(block).toContain('19. Summary of Important Risks');
    expect(block).toContain('20. Conclusions');
    expect(block).not.toContain('14. Conclusions');
  });

  it('every E2F section is required: E2F says complete all of them, stating when there is nothing to report', () => {
    for (const s of lifecycle.ICH_E2F_DSUR_SECTIONS) expect(s.required, s.title).toBe(true);
    expect(DOCUMENT_TEMPLATES.dsur.sections.every((s) => s.required)).toBe(true);
  });

  it('the injected block lists the E2F headings in E2F order, none of them optional', () => {
    const block = blockFor('draft our DSUR');
    expect(block).not.toContain('Optional sections');
    expect(block.indexOf('9. Safety Findings from Non-interventional Studies'))
      .toBeLessThan(block.indexOf('12. Non-clinical Data'));
    expect(block.indexOf('16. Region-Specific Information')).toBeLessThan(block.indexOf('20. Conclusions'));
    const order = lifecycle.ICH_E2F_DSUR_SECTIONS.map((s) => block.indexOf(s.number ? `${s.number}. ${s.title}` : s.title));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('no detection pattern carries a form feed', () => {
    for (const p of DOCUMENT_TEMPLATES.dsur.detectionPatterns) expect(p.source).not.toContain('\\f');
  });

  // F19: this replaced "an IND annual report request is not served the DSUR
  // template", which passed on the code it was written against, since the \f
  // pattern matched nothing either way. The defect was a dead pattern, so the
  // check is that every pattern is live. Applied to the patterns before
  // 2026-10-04 it fails on /\find\s+annual\s+report\b/i
  // (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-meeting-template-followups-red.txt).
  // Which template an IND annual report request gets is g-periodic-chat-copies'.
  it('every DSUR and meeting detection pattern matches a request it is written for', () => {
    expect(deadPatterns(LIVE_REQUESTS)).toEqual([]);
  });
});
