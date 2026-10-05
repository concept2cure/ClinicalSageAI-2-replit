/**
 * FDA's software Documentation Level (Basic / Enhanced), as the deterministic
 * reviewer engines must teach it.
 *
 * FDA's final guidance "Content of Premarket Submissions for Device Software
 * Functions" (issued 2023-06-14, https://www.fda.gov/media/153781/download)
 * replaced the 2005 "Level of Concern" with two Documentation Levels. Enhanced
 * applies where a failure or flaw of any device software function could present
 * a hazardous situation with a probable risk of death or serious injury, and
 * those risks are assessed BEFORE risk-control measures (regulator text, search
 * extract of the fda.gov copy, 2026-10-05). The IEC 62304 safety class is
 * assigned AFTER external risk controls, so the two do not map one to one: a
 * Class B device can need Enhanced documentation.
 *
 * Before this change no engine computed the Documentation Level. The 510(k)
 * auditor fired "Software Level of Concern Not Specified" on an answer field
 * (`software_level_of_concern`) that nothing produces and recommended an IEC
 * class as the answer; the PMA auditor said "FDA expects Level of Concern
 * documentation"; the software reviewer persona asked for a "Level of Concern
 * (basic / moderate / major)", a scale that exists under neither scheme; and
 * the shadow-reviewer checklist asked for documentation "per the device's level
 * of concern (IEC 62304)".
 *
 * The facts relied on are in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-fda-software-documentation-level-facts.md
 */
import { describe, it, expect } from 'vitest';
import fsSync from 'fs';
import { promises as fs } from 'fs';
import path from 'path';

import {
  classifySoftware,
  fdaDocumentationLevel,
  fdaDocumentationLevelFromAnswers,
  fdaSoftwareDocumentationSet,
  fdaCybersecurityDocumentation,
  FDA_SOFTWARE_DOCUMENTATION_SET,
  FDA_DEVICE_SOFTWARE_GUIDANCE,
  FDA_DOCUMENTATION_LEVEL_FACT,
} from '../software-lifecycle';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';
import { listEstarAttachmentSlots } from '../../pathway-engines/estar/estar-attachment-slots';
import { createDevice510kAuditor } from '../../ana/intelligence-questions/war-game/auditors/device-510k-auditor.js';
import { createPmaAuditor } from '../../ana/intelligence-questions/war-game/auditors/pma-auditor.js';
import { REVIEWER_PERSONAS } from '../../intelligence-engine/reviewer-personas';
import { K510_REVIEWER_QUESTIONS, buildShadowReviewerChecklist } from '../device-shadow-reviewer';

const LEVEL_OF_CONCERN = /level of concern/i;
const ids = (level: 'basic' | 'enhanced') => fdaSoftwareDocumentationSet(level).map((i) => i.id);

describe('fdaDocumentationLevel', () => {
  it('is undetermined — never Basic — when the pre-risk-control hazard fact is absent', () => {
    const d = fdaDocumentationLevel({});
    expect(d.level).toBe('undetermined');
    expect(d.rationale).toMatch(/not been determined|not recorded/i);
  });

  it('is Enhanced for a device IEC 62304 rates Class B after controls whose failure could cause probable serious injury before controls', () => {
    // After external risk controls the worst software-contributed harm is non-serious → Class B.
    expect(classifySoftware({ canContributeToNonSeriousInjury: true }).class).toBe('B');
    // Before risk controls the same failure could present a probable risk of serious injury.
    const d = fdaDocumentationLevel({ failureCouldPresentProbableRiskOfDeathOrSeriousInjuryBeforeRiskControls: true });
    expect(d.level).toBe('enhanced');
  });

  it('is Basic only when the fact is recorded as false', () => {
    expect(fdaDocumentationLevel({ failureCouldPresentProbableRiskOfDeathOrSeriousInjuryBeforeRiskControls: false }).level).toBe('basic');
  });

  it('cites the 2023 guidance on fda.gov as regulator text, with a well-formed basis', () => {
    const d = fdaDocumentationLevel({});
    expect(FDA_DEVICE_SOFTWARE_GUIDANCE.title).toBe('Content of Premarket Submissions for Device Software Functions');
    expect(FDA_DEVICE_SOFTWARE_GUIDANCE.issued).toBe('2023-06-14');
    expect(d.basis.length).toBeGreaterThan(0);
    const definition = d.basis[0];
    expect(definition.confidence).toBe('regulator-text');
    expect(definition.url).toMatch(/^https:\/\/www\.fda\.gov\/media\/153781\/download$/);
    for (const b of d.basis) expect(basisProblems(b)).toEqual([]);
  });

  it('reads the documentation-level fact from questionnaire answers (yes/no), not from a Level of Concern or an IEC class', () => {
    expect(fdaDocumentationLevelFromAnswers({}).level).toBe('undetermined');
    expect(fdaDocumentationLevelFromAnswers({ software_level_of_concern: 'major', iec_62304_class: 'C' }).level).toBe('undetermined');
    expect(fdaDocumentationLevelFromAnswers({ [FDA_DOCUMENTATION_LEVEL_FACT]: true }).level).toBe('enhanced');
    expect(fdaDocumentationLevelFromAnswers({ [FDA_DOCUMENTATION_LEVEL_FACT]: 'yes' }).level).toBe('enhanced');
    expect(fdaDocumentationLevelFromAnswers({ [FDA_DOCUMENTATION_LEVEL_FACT]: false }).level).toBe('basic');
    expect(fdaDocumentationLevelFromAnswers({ [FDA_DOCUMENTATION_LEVEL_FACT]: 'no' }).level).toBe('basic');
    expect(fdaDocumentationLevelFromAnswers({ [FDA_DOCUMENTATION_LEVEL_FACT]: 'maybe' }).level).toBe('undetermined');
  });
});

describe('FDA_SOFTWARE_DOCUMENTATION_SET', () => {
  it('Basic excludes the SDS, unit/integration protocols and reports, and the full CM/maintenance plan', () => {
    const basic = ids('basic');
    expect(basic).not.toContain('sds');
    expect(basic).not.toContain('unit_integration_test_protocols_reports');
    expect(basic).not.toContain('configuration_maintenance_plan');
  });

  it('Basic includes the testing summary (unit, integration and system) and the system-level protocol and report', () => {
    const basic = ids('basic');
    for (const id of [
      'documentation_level_evaluation',
      'software_description',
      'risk_management_file',
      'srs',
      'architecture_design_chart',
      'development_practices',
      'testing_summary',
      'system_test_protocol_report',
      'version_history',
      'unresolved_anomalies',
    ]) {
      expect(basic).toContain(id);
    }
  });

  it('Enhanced is Basic plus the SDS, unit/integration protocols and reports, and the full CM/maintenance plan', () => {
    const basic = ids('basic');
    const enhanced = ids('enhanced');
    for (const id of basic) expect(enhanced).toContain(id);
    expect(enhanced.filter((id) => !basic.includes(id)).sort()).toEqual(
      ['configuration_maintenance_plan', 'sds', 'unit_integration_test_protocols_reports'].sort(),
    );
  });

  it('carries no cybersecurity item — that branch is keyed on the cyber-device flag, not on the level', () => {
    const all = FDA_SOFTWARE_DOCUMENTATION_SET.map((i) => `${i.id} ${i.title}`).join(' | ');
    expect(all).not.toMatch(/sbom|threat model|penetration|cyber/i);
  });

  it('every row has a well-formed basis, and every row is labelled recall (only the level definition was checked)', () => {
    for (const item of FDA_SOFTWARE_DOCUMENTATION_SET) {
      expect(item.basis.length).toBeGreaterThan(0);
      for (const b of item.basis) {
        expect(basisProblems(b)).toEqual([]);
        expect(b.confidence).toBe('recall');
      }
    }
  });
});

describe('fdaCybersecurityDocumentation (FD&C Act §524B; DEVICE_FLAGS.cyberDevice)', () => {
  it('is undetermined when cyber-device status is unknown, never "not required"', () => {
    const c = fdaCybersecurityDocumentation({});
    expect(c.status).toBe('undetermined');
    expect(c.items).toEqual([]);
  });

  it('requires the SBOM and threat model for a cyber device, whatever the documentation level', () => {
    const c = fdaCybersecurityDocumentation({ cyberDevice: true });
    expect(c.status).toBe('required');
    const cids = c.items.map((i) => i.id);
    expect(cids).toContain('sbom');
    expect(cids).toContain('threat_model');
    for (const b of c.basis) expect(basisProblems(b)).toEqual([]);
  });

  it('is not required for a device recorded as not a cyber device', () => {
    expect(fdaCybersecurityDocumentation({ cyberDevice: false }).status).toBe('not_required');
  });
});

// The eSTAR slot each row files into is READ from the vendored template, not transcribed.
const ESTAR = path.resolve(process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates', 'eSTAR-510k-non-ivd.pdf');
describe.skipIf(!fsSync.existsSync(ESTAR))('eSTAR software slots (nIVD template)', () => {
  it('every named slot exists in the template and files into CH3.05.05.x (software) or CH3.05.05.11 (cybersecurity)', async () => {
    const slots = await listEstarAttachmentSlots(await fs.readFile(ESTAR));
    const byDescription = new Map<string, string[]>();
    for (const s of slots) {
      if (!s.description) continue;
      const d = s.description.replace(/&amp;/g, '&');
      byDescription.set(d, [...(byDescription.get(d) ?? []), ...s.chapters]);
    }
    const named = [
      ...FDA_SOFTWARE_DOCUMENTATION_SET.filter((i) => i.estarSlot),
      ...fdaCybersecurityDocumentation({ cyberDevice: true }).items.filter((i) => i.estarSlot),
    ];
    expect(named.length).toBeGreaterThan(8);
    for (const item of named) {
      const chapters = byDescription.get(item.estarSlot!);
      expect(chapters, `${item.id}: "${item.estarSlot}" is not a slot description in the template`).toBeDefined();
      for (const c of chapters!) expect(c).toMatch(/^\/CHAPTER 3\/CH3\.05\/CH3\.05\.05\/CH3\.05\.05\.\d\d\/$/);
    }
  }, 120_000);
});

describe('consumers read the Documentation Level, not the retired Level of Concern', () => {
  const k510 = createDevice510kAuditor();
  const pma = createPmaAuditor();
  const run = (rules: typeof k510.rules, answers: Record<string, unknown>) =>
    rules.map((r) => r.check(answers)).filter((f): f is NonNullable<typeof f> => f !== null);

  it('510(k) auditor: a software device with no documentation-level fact gets "FDA software documentation level not determined"', () => {
    const findings = run(k510.rules, { contains_software: true, software_level_of_concern: 'major' });
    const f = findings.find((x) => /documentation level/i.test(x.title));
    expect(f).toBeDefined();
    expect(f!.title).toBe('FDA Software Documentation Level Not Determined');
    expect(f!.relatedFields).toContain(FDA_DOCUMENTATION_LEVEL_FACT);
    expect(f!.relatedFields).not.toContain('software_level_of_concern');
    // It does not offer an IEC 62304 class as the answer.
    expect(`${f!.recommendation} ${f!.observation}`).not.toMatch(/Class A, B, or C/);
  });

  it('510(k) auditor: no software Level of Concern finding anywhere', () => {
    for (const r of k510.rules) {
      expect(`${r.title} ${r.question}`).not.toMatch(LEVEL_OF_CONCERN);
    }
    for (const f of run(k510.rules, { contains_software: true })) {
      expect(JSON.stringify(f)).not.toMatch(LEVEL_OF_CONCERN);
    }
  });

  it('510(k) auditor: silent once the fact is recorded, and for a device recorded as containing no software', () => {
    const titles = (a: Record<string, unknown>) => run(k510.rules, a).map((f) => f.title);
    expect(titles({ contains_software: true, [FDA_DOCUMENTATION_LEVEL_FACT]: false })).not.toContain('FDA Software Documentation Level Not Determined');
    expect(titles({ contains_software: false })).not.toContain('FDA Software Documentation Level Not Determined');
  });

  it('PMA auditor: the software finding names the Documentation Level and lists the set for the level', () => {
    const undetermined = run(pma.rules, { contains_software: 'yes' }).find((f) => /software documentation/i.test(f.title));
    expect(undetermined).toBeDefined();
    expect(JSON.stringify(undetermined)).not.toMatch(LEVEL_OF_CONCERN);
    expect(undetermined!.recommendation).toMatch(/Documentation Level/);

    const enhanced = run(pma.rules, { contains_software: 'yes', [FDA_DOCUMENTATION_LEVEL_FACT]: true }).find((f) =>
      /software documentation/i.test(f.title),
    );
    for (const item of fdaSoftwareDocumentationSet('enhanced')) expect(enhanced!.recommendation).toContain(item.title);
  });

  it('software reviewer persona: asks for the Documentation Level, not a "basic / moderate / major" Level of Concern', () => {
    const p = REVIEWER_PERSONAS.fda_software_reviewer;
    expect(p.scope).not.toMatch(LEVEL_OF_CONCERN);
    const out = p.rules({
      program: { programType: '510K', productType: 'device', deviceClass: 'II', primaryAgency: 'FDA', isSoftware: true },
      packet: null,
      intel: { contradictionCount: 0, orphanClaimCount: 0, unsupportedClaimCount: 0, defensibilityScore: null, missingSections: [] },
    });
    const text = out.map((x) => x.question).join(' | ');
    expect(text).not.toMatch(LEVEL_OF_CONCERN);
    expect(text).not.toMatch(/basic \/ moderate \/ major/i);
    expect(text).toMatch(/Documentation Level \(Basic or Enhanced\)/);
  });

  it('shadow reviewer: the 510(k) software question asks for the Documentation Level; cybersecurity is its own question', () => {
    for (const q of K510_REVIEWER_QUESTIONS) expect(q.question).not.toMatch(LEVEL_OF_CONCERN);
    const software = K510_REVIEWER_QUESTIONS.filter((q) => q.sectionId === 'software');
    expect(software.some((q) => /Documentation Level \(Basic or Enhanced\)/.test(q.question))).toBe(true);
    expect(software.some((q) => /524B/.test(q.question))).toBe(true);
    const c = buildShadowReviewerChecklist('510k');
    expect(c.counts.total).toBe(c.questions.length);
  });
});
