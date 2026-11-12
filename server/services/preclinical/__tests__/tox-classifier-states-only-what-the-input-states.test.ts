/**
 * The tox-findings classifier states only what the input states, and never
 * misses an adverse change the input states.
 *
 * ── What the code did (found 2026-11-12, the map of P-74 item 2) ─────────────
 * `classify_tox_findings` is an in-scope AnA tool that answers "engine:
 * deterministic", and the Module 2.6 composer prints its overview, which says
 * which findings "define the NOAEL".
 *
 * 1. Thyroid follicular cell hyperplasia came back "escalated to adverse due to
 *    adverse correlates" with none given: "hyperplasia" is both part of the
 *    thyroid rule's name and an adverse word.
 * 2. The unsafe direction: an adenoma, a carcinoma or a sarcoma given as a
 *    correlate did NOT escalate an adaptive finding, which stayed "adaptive,
 *    non-adverse ... not considered to limit the NOAEL".
 * 3. An escalation by severity alone was framed "with adverse correlates". An
 *    escalated finding kept the adaptive rule's "reversible" and low human
 *    relevance. A rule that cannot be escalated (hyaline droplets) stayed
 *    adaptive with a necrosis stated beside it. A Kupffer cell hypertrophy, a
 *    follicular cell carcinoma and a C-cell hyperplasia were taken for the
 *    adaptive responses whose patterns they happened to match. A correlate that
 *    was not text failed the whole batch.
 *
 * ── What was tried and refused (never committed) ─────────────────────────────
 * Reading negation, so that "no necrosis" would not escalate. Two versions were
 * reviewed. Every rule tried for where an absence ends lost adverse changes the
 * input stated ("with or without necrosis", "no necrosis, except at the high
 * dose", "no necrosis in any control animal", "not all animals were free of
 * necrosis", "no recovery of the necrosis"): tens of thousands of generated
 * inputs went from adverse to adaptive, and one version hung on a long list.
 * Counting a stated absence as present is the error this classifier may make;
 * missing a stated adverse change is the one it must not. So negation is not
 * read, and the reason says so when a negation is there.
 */
import { describe, it, expect } from 'vitest';

import { classifyToxFinding, classifyToxFindings } from '../tox-findings-classifier';

const call = (organ: string, finding: string, correlates?: string[], severity?: string) => {
  const r = classifyToxFinding({ organ, finding, correlates, severity });
  return { adversity: r.adversity, escalated: r.escalated };
};
const ADAPTIVE = { adversity: 'adaptive_non_adverse', escalated: false };
const ESCALATED = { adversity: 'adverse', escalated: true };

/** The adaptive or monitored findings of the knowledge base, as reports write them. */
const ADAPTIVE_FINDINGS: Array<[string, string]> = [
  ['liver', 'hepatocellular hypertrophy'], ['liver', 'Hypertrophy, hepatocellular, centrilobular'], ['liver', 'centrilobular hypertrophy'],
  ['lung', 'phospholipidosis'], ['lung', 'foamy macrophages'], ['thyroid', 'follicular cell hypertrophy'],
  ['adrenal', 'cortical hypertrophy'], ['adrenal', 'cortical vacuolation'],
];
const ADVERSE = [
  'necrosis', 'necrotic hepatocytes', 'degeneration', 'inflammation', 'inflammatory infiltrate', 'fibrosis', 'fibrotic change', 'hyperplasia',
  'neoplasia', 'tumour', 'tumor', 'single-cell death', 'apoptosis', 'impaired function', 'dysfunction', 'increased ALT', 'ALT increased',
  'mortality', 'adenoma', 'carcinoma', 'adenocarcinoma', 'sarcoma', 'hemangiosarcoma', 'lymphoma', 'leukaemia', 'metastasis', 'malignant', 'hepatoblastoma',
];

describe('an adverse change the input states is never missed', () => {
  /* The property. Each phrasing below states, or may state, that the change is
     there; the refused versions answered adaptive or monitor for every one. */
  const PHRASINGS = [
    'with W', 'accompanied by W', 'and W', 'minimal W', 'W in 2/10 animals', 'with or without W', 'with/without W', 'not without W',
    'no recovery of the W', 'no W, except at the high dose', 'W was not observed, except in one high-dose male', 'no W in any control animal',
    'no W in any female', 'W not seen in controls', 'W, absent in controls', 'W present in males and absent in females',
    'not all animals were free of W', '8/10 animals without W', 'minimal to no W', 'no W at any dose but the highest',
    'without inflammation although W was present', 'low dose: no W; high dose: present', 'W was not present, but developed by week 13',
  ];

  it('beside every adaptive finding, every adverse word, in every phrasing, in the finding or as a correlate, is adverse', () => {
    const phrases = ADVERSE.flatMap((word) => PHRASINGS.map((p) => p.replace('W', word)));
    const inputs = ADAPTIVE_FINDINGS.flatMap(([organ, finding]) => phrases.flatMap((phrase) => [
      { organ, finding: `${finding} ${phrase}`, correlates: [] as string[] },
      { organ, finding, correlates: [phrase] },
    ]));
    const missed = inputs
      .filter((input) => classifyToxFinding(input).adversity !== 'adverse')
      .map((input) => `${input.organ} | ${input.finding} | ${JSON.stringify(input.correlates)}: ${classifyToxFinding(input).adversity}`);
    expect(inputs.length).toBeGreaterThan(5000);
    expect(missed.slice(0, 20)).toEqual([]);
  });

  it('a finding no rule describes, with an adverse change stated in it or beside it, is adverse', () => {
    expect(call('liver', 'Kupffer cell hypertrophy', ['necrosis'])).toEqual({ adversity: 'adverse', escalated: false });
    expect(call('liver', 'hypertrophy with apoptosis')).toEqual({ adversity: 'adverse', escalated: false });
    expect(call('spleen', 'extramedullary haematopoiesis', ['increased mortality']).adversity).toBe('adverse');
    expect(call('spleen', 'extramedullary haematopoiesis')).toEqual({ adversity: 'indeterminate', escalated: false });
  });

  it('a long list is read in linear time', () => {
    const started = performance.now();
    classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy', correlates: ['necrosis, '.repeat(600), 'no necrosis or '.repeat(400)] });
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('negation is not read, and the reason says so', () => {
  it('a stated absence counts as present: the safe error, on purpose', () => {
    expect(call('liver', 'hepatocellular hypertrophy without necrosis')).toEqual(ESCALATED);
    expect(call('liver', 'hepatocellular hypertrophy', ['no necrosis'])).toEqual(ESCALATED);
    expect(classifyToxFinding({ organ: 'kidney', finding: 'no tubular necrosis' }).adversity).toBe('adverse');
  });

  it('the reason names the negation and leaves it to a pathologist', () => {
    const r = classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy', correlates: ['no necrosis'] });
    expect(r.rationale).toMatch(/word of negation/);
    expect(r.rationale).toMatch(/pathologist confirms/i);
    const plain = classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy', correlates: ['necrosis'] });
    expect(plain.rationale).not.toMatch(/negation/);
  });
});

describe('a finding is not escalated by its own name', () => {
  it('thyroid follicular hyperplasia is adverse, says why, and leaves the adaptive reading to a pathologist', () => {
    for (const finding of ['follicular cell hyperplasia', 'Hyperplasia, follicular cell', 'diffuse follicular cell hyperplasia', 'follicular cell hypertrophy/hyperplasia']) {
      const r = classifyToxFinding({ organ: 'thyroid', finding });
      expect({ finding, adversity: r.adversity, escalated: r.escalated, relevance: r.humanRelevance }).toEqual({ finding, adversity: 'adverse', escalated: false, relevance: 'uncertain' });
      expect(r.rationale).not.toMatch(/correlate/i);
      expect(r.rationale).toMatch(/pathologist/);
    }
    expect(classifyToxFindings([{ organ: 'thyroid', finding: 'follicular cell hyperplasia' }]).overviewParagraph).toMatch(/define the NOAEL/);
  });

  it('a stated correlate or a severity still escalates it, and is named', () => {
    const r = classifyToxFinding({ organ: 'thyroid', finding: 'follicular cell hyperplasia', correlates: ['follicular cell degeneration'] });
    expect({ adversity: r.adversity, escalated: r.escalated }).toEqual(ESCALATED);
    expect(r.rationale).toMatch(/degeneration/);
    expect(call('thyroid', 'follicular cell hypertrophy', [], 'marked')).toEqual(ESCALATED);
  });
});

describe('a tumour is an adverse correlate, by any of its names', () => {
  it('every word the knowledge base itself calls adverse escalates an adaptive finding', () => {
    expect(['follicular cell adenoma', 'follicular cell carcinoma', 'hemangiosarcoma', 'malignant lymphoma', 'metastatic foci']
      .filter((c) => call('thyroid', 'follicular cell hypertrophy', [c]).adversity !== 'adverse')).toEqual([]);
    const s = classifyToxFindings([{ organ: 'thyroid', finding: 'follicular cell hypertrophy', correlates: ['follicular cell adenoma'] }]);
    expect(s.adaptiveFindings).toEqual([]);
    expect(s.overviewParagraph).toMatch(/Adverse target-organ findings \(1\)/);
  });

  it('and a tumour given as the finding is the proliferative rule\'s, not an adaptive one\'s', () => {
    for (const [organ, finding] of [['thyroid', 'follicular cell carcinoma'], ['thyroid', 'follicular cell adenoma'], ['thyroid', 'C-cell hyperplasia'], ['liver', 'hemangiosarcoma']]) {
      const r = classifyToxFinding({ organ, finding });
      expect({ finding, adversity: r.adversity, escalated: r.escalated, relevance: r.humanRelevance }).toEqual({ finding, adversity: 'adverse', escalated: false, relevance: 'likely' });
    }
  });
});

describe('the reason names what it rests on', () => {
  it('an escalation names whole words, and only words the input holds', () => {
    const r = classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy', correlates: ['centrilobular necrosis', 'increased ALT', 'degeneration', 'inflammatory infiltrate'] });
    expect(r.rationale).toMatch(/adverse correlates: necrosis, increased alt, degeneration, inflammatory/);
  });

  it('an escalation by severity alone does not speak of correlates', () => {
    const r = classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy', severity: 'marked' });
    expect(r.escalated).toBe(true);
    expect(r.rationale).toMatch(/moderate-or-greater severity/);
    expect(r.overviewFraming).not.toMatch(/correlate/i);
  });

  it('an escalated finding does not keep the adaptive rule\'s "reversible" or its low human relevance', () => {
    const r = classifyToxFinding({ organ: 'thyroid', finding: 'follicular cell hypertrophy', correlates: ['follicular cell adenoma'] });
    expect({ reversibility: r.reversibility, humanRelevance: r.humanRelevance }).toEqual({ reversibility: 'unknown', humanRelevance: 'uncertain' });
    expect(classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy with necrosis', reversible: true }).reversibility).toBe('reversible');
    expect(classifyToxFinding({ organ: 'liver', finding: 'hepatocellular hypertrophy with necrosis', reversible: false }).reversibility).toBe('not_reversible');
  });

  it('a rule that cannot be escalated, with an adverse change beside it, is a pathologist\'s call', () => {
    const r = classifyToxFinding({ organ: 'kidney', finding: 'hyaline droplet nephropathy with tubular degeneration and necrosis' });
    expect({ adversity: r.adversity, relevance: r.humanRelevance }).toEqual({ adversity: 'indeterminate', relevance: 'rodent_specific' });
    expect(r.rationale).toMatch(/pathologist judgement/);
    expect(call('kidney', 'hyaline droplet accumulation')).toEqual(ADAPTIVE);
    expect(classifyToxFindings([{ organ: 'kidney', finding: 'hyaline droplet nephropathy with tubular necrosis' }]).overviewParagraph).not.toMatch(/not considered to limit the NOAEL/);
  });

  it('a Kupffer cell hypertrophy is not enzyme induction; a follicular cyst and a parathyroid change are not the thyroid response', () => {
    for (const [organ, finding] of [['liver', 'Kupffer cell hypertrophy'], ['liver', 'stellate cell hypertrophy'], ['thyroid', 'follicular cyst'], ['parathyroid', 'chief cell hypertrophy']]) {
      expect({ finding, adversity: classifyToxFinding({ organ, finding }).adversity }).toEqual({ finding, adversity: 'indeterminate' });
    }
    expect(call('liver', 'hypertrophy of hepatocytes')).toEqual(ADAPTIVE);
    expect(call('thyroid gland', 'follicular epithelial hypertrophy')).toEqual(ADAPTIVE);
  });

  it('a correlate that is not text is not read, and does not fail the batch', () => {
    expect(call('liver', 'hepatocellular hypertrophy', [null, 42, { name: 'necrosis' }] as unknown as string[])).toEqual(ADAPTIVE);
    expect(call('liver', 'hepatocellular hypertrophy', ['necrosis', null as unknown as string])).toEqual(ESCALATED);
  });

  it('what held before still holds', () => {
    expect(call('liver', 'hepatocellular hypertrophy')).toEqual(ADAPTIVE);
    expect(call('liver', 'hepatocellular hypertrophy with single-cell necrosis')).toEqual(ESCALATED);
    expect(call('lung', 'phospholipidosis (foamy macrophages)')).toEqual({ adversity: 'monitor', escalated: false });
    expect(call('spleen', 'extramedullary haematopoiesis')).toEqual({ adversity: 'indeterminate', escalated: false });
    expect(call('liver', 'bile duct hyperplasia')).toEqual({ adversity: 'adverse', escalated: false });
  });
});
