/**
 * Protocol Amendments pure logic — impact classification + submission readiness.
 * Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyAmendmentImpact,
  evaluateAmendmentReadiness,
} from '../protocol-amendments-logic';

type In = Parameters<typeof classifyAmendmentImpact>[0];
const c = (over: Partial<In>) =>
  classifyAmendmentImpact({ amendmentType: 'minor', affectsConsent: false, affectsRisk: false, ...over });

/* Each rule below is a regulatory finding, recorded with its sources in
   docs/evidence/REGULATORY-SME/2026-09-22/. */

describe('IRB review — always required; only the procedure varies', () => {
  it.each(['major', 'minor', 'administrative', null] as const)(
    'requires IRB review for a %s amendment (46.108(a)(3)(iii); 56.108(a)(4); 312.66)',
    (amendmentType) => {
      const r = c({ amendmentType }).irbReview;
      expect(r.required).toBe(true);
      expect(r.decidedBy).toBe('IRB');
      expect(r.basis).toMatch(/46\.108\(a\)\(3\)\(iii\)/);
      expect(r.basis).toMatch(/56\.108\(a\)\(4\)/);
    },
  );

  it('never returns a path meaning "no IRB review" — administrative is expedited-eligible, not exempt', () => {
    const r = c({ amendmentType: 'administrative' }).irbReview;
    expect(r.path).toBe('expedited_eligible');
    expect(r.notes.join(' ')).toMatch(/No US regulation exempts a change to approved research from IRB review/);
    expect(r.notes.join(' ')).toMatch(/guidance does not override the regulations/);
  });

  it('a minor change is expedited-eligible, and the IRB decides whether it is minor (46.110(b)(1)(ii); 56.110(b)(2))', () => {
    const r = c({ amendmentType: 'minor' }).irbReview;
    expect(r.path).toBe('expedited_eligible');
    expect(r.basis).toMatch(/46\.110\(b\)\(1\)\(ii\); 21 CFR 56\.110\(b\)\(2\)/);
    expect(r.basis).toMatch(/IRB's determination/);
    expect(r.basis).toMatch(/may not disapprove/);
  });

  it('a consent change alone does not force convened review (a consent change can be minor)', () => {
    expect(c({ amendmentType: 'minor', affectsConsent: true }).irbReview.path).toBe('expedited_eligible');
  });

  it('an increase in risk is not minor → convened (46.108(b); 56.108(c)), whatever the label', () => {
    for (const amendmentType of ['minor', 'administrative'] as const) {
      const r = c({ amendmentType, affectsRisk: true }).irbReview;
      expect(r.path).toBe('convened');
      expect(r.basis).toMatch(/46\.108\(b\); 21 CFR 56\.108\(c\)/);
    }
  });

  it('a major change goes to the convened IRB, noting the minimal-risk expedited exception it cannot assess', () => {
    const r = c({ amendmentType: 'major' }).irbReview;
    expect(r.path).toBe('convened');
    expect(r.notes.join(' ')).toMatch(/46\.110\(b\)\(1\)\(i\)/);
  });

  it('undeclared risk leaves the procedure undetermined — but review is still required', () => {
    const r = c({ amendmentType: 'minor', affectsRisk: null }).irbReview;
    expect(r.path).toBe('undetermined');
    expect(r.required).toBe(true);
  });

  it('never cites 46.109(c) (documentation of consent) for amendment review', () => {
    for (const t of ['major', 'minor', 'administrative'] as const) {
      expect(JSON.stringify(c({ amendmentType: t }))).not.toMatch(/46\.109\(c\)/);
    }
  });
});

describe('re-consent — the IRB decides; the engine never says "required" or "not required"', () => {
  it('a declared consent or risk impact → IRB determination required, citing 46.116(c)(5) / 50.25(b)(5) and 46.109(b) / 56.109(b)', () => {
    for (const over of [{ affectsConsent: true }, { affectsRisk: true }]) {
      const r = c(over).reconsent;
      expect(r.status).toBe('irb_determination_required');
      expect(r.decidedBy).toBe('IRB');
      expect(r.basis).toMatch(/46\.116\(c\)\(5\); 21 CFR 50\.25\(b\)\(5\)/);
      expect(r.basis).toMatch(/46\.109\(b\); 21 CFR 56\.109\(b\)/);
    }
  });

  it('both declared "no" is not a determination that subjects need not be told', () => {
    const r = c({ amendmentType: 'major' }).reconsent;
    expect(r.status).toBe('no_indicator_declared');
    expect(r.message).toMatch(/NOT a determination/);
  });

  it('the sponsor label does not change the re-consent status', () => {
    const statuses = (['major', 'minor', 'administrative'] as const).map((t) => c({ amendmentType: t }).reconsent.status);
    expect(new Set(statuses).size).toBe(1);
  });

  it('an undeclared impact is undetermined, never "no"', () => {
    expect(c({ affectsConsent: null }).reconsent.status).toBe('undetermined');
  });

  it('has no required / not_required value at all', () => {
    const all = [true, false, null].flatMap((a) => [true, false, null].map((b) => c({ affectsConsent: a, affectsRisk: b }).reconsent.status));
    expect(all).not.toContain('required');
    expect(all).not.toContain('not_required');
  });
});

describe('FDA protocol amendment — 21 CFR 312.30, IND studies only', () => {
  it('IND status not recorded → undetermined, never "not required"', () => {
    expect(c({ isIndStudy: null }).fdaSubmission.status).toBe('undetermined');
    expect(c({}).fdaSubmission.status).toBe('undetermined');
  });

  it('a non-IND study → not applicable, while IRB review is still required', () => {
    const r = c({ isIndStudy: false });
    expect(r.fdaSubmission.status).toBe('not_applicable');
    expect(r.irbReview.required).toBe(true);
  });

  it('a declared risk increase under an IND → required, labelled per 312.30(d)', () => {
    const r = c({ isIndStudy: true, affectsRisk: true, phase: '2' }).fdaSubmission;
    expect(r.status).toBe('required');
    expect(r.label).toBe('Protocol Amendment: Change in Protocol');
    expect(r.basis).toMatch(/312\.30\(b\)\(2\)\(i\)/);
  });

  it('a major Phase 2/3 change → required; a major Phase 1 change → sponsor must record whether it affects safety', () => {
    expect(c({ isIndStudy: true, amendmentType: 'major', phase: 'Phase 3' }).fdaSubmission.status).toBe('required');
    const p1 = c({ isIndStudy: true, amendmentType: 'major', phase: '1' }).fdaSubmission;
    expect(p1.status).toBe('sponsor_determination_required');
    expect(p1.basis).toMatch(/312\.33\(e\)/);
  });

  it('a minor (IRB-expedited) change still needs a sponsor determination — the listed 312.30(b)(1) examples can be minor', () => {
    const r = c({ isIndStudy: true, amendmentType: 'minor', phase: '2' }).fdaSubmission;
    expect(r.status).toBe('sponsor_determination_required');
    expect(r.basis).toMatch(/312\.30\(b\)\(1\)\(iii\)/);
  });

  it('administrative → not required by 312.30(b)(1), with the label challenged if it touches a listed example', () => {
    const r = c({ isIndStudy: true, amendmentType: 'administrative', phase: '2' }).fdaSubmission;
    expect(r.status).toBe('not_required_per_sponsor_label');
    expect(r.basis).toMatch(/label is wrong and an amendment is required/);
  });

  it('a combined Phase 1/2 study is flagged, and the Phase 2/3 test applied as the conservative default', () => {
    const r = c({ isIndStudy: true, amendmentType: 'major', phase: 'Phase 1/2' }).fdaSubmission;
    expect(r.status).toBe('required');
    expect(r.basis).toMatch(/combined Phase 1\/2 study/);
  });

  it('never says an FDA amendment is approved or cleared — FDA can still impose a clinical hold', () => {
    expect(c({ isIndStudy: true, amendmentType: 'major', phase: '3' }).fdaSubmission.basis).toMatch(/312\.42/);
  });

  it('labels conservative defaults as platform policy, not regulation', () => {
    expect(c({ amendmentType: 'major' }).irbReview.notes.join(' ')).toMatch(/conservative default, not a regulatory requirement/);
    expect(c({ affectsRisk: true }).irbReview.notes.join(' ')).toMatch(/not a rule stated in the regulations/);
  });

  it('phase not recorded → the Phase 2/3 test is applied as the conservative default, and says so', () => {
    const r = c({ isIndStudy: true, amendmentType: 'major', phase: null }).fdaSubmission;
    expect(r.status).toBe('required');
    expect(r.basis).toMatch(/Phase is not recorded/);
  });
});

describe('evaluateAmendmentReadiness', () => {
  it('is ready when draft with at least one change', () => {
    const r = evaluateAmendmentReadiness({ status: 'draft', changeCount: 1 });
    expect(r.readyToSubmit).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks a draft with no changes', () => {
    const r = evaluateAmendmentReadiness({ status: 'draft', changeCount: 0 });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.some((b) => /no change/i.test(b))).toBe(true);
  });

  it('blocks a non-draft amendment', () => {
    const r = evaluateAmendmentReadiness({ status: 'submitted', changeCount: 3 });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.some((b) => /only a draft/i.test(b))).toBe(true);
  });

  it('reports both blockers for a non-draft with no changes', () => {
    const r = evaluateAmendmentReadiness({ status: 'rejected', changeCount: 0 });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.length).toBe(2);
  });
});
