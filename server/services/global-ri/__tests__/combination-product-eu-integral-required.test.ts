/**
 * EU combination-product classification needs `integral` stated: it decides the
 * route, so it is refused rather than assumed.
 *
 * Until 2026-10-15 classifyEu read `input.integral ?? true`, so {region:'EU'}
 * came back "Medicinal product (integral, MDR Art 117 NBOp)" — the Notified Body
 * Opinion route rather than a separately CE-marked device — decided by a fact
 * nobody stated. The default lived only in the input JSDoc; neither the result
 * nor its notes said it was assumed. Served via POST
 * /api/global-ri/combination/classify, which returns the engine's refusal as 400.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCombinationProduct,
  type EuCombinationClassification,
  type FdaCombinationClassification,
} from '../combination-product-classification';

describe('classifyCombinationProduct — EU requires integral', () => {
  it('refuses an EU classification without integral, naming the missing input', () => {
    expect(() => classifyCombinationProduct({ region: 'EU' })).toThrow(/integral/);
  });

  it('refuses a non-boolean integral rather than reading it as true', () => {
    expect(() => classifyCombinationProduct({ region: 'EU', integral: 'yes' as unknown as boolean })).toThrow(/integral/);
  });

  it('classifies once integral is stated, either way', () => {
    const integral = classifyCombinationProduct({ region: 'EU', integral: true }) as EuCombinationClassification;
    expect(integral.regulatoryRoute).toContain('117');
    const separate = classifyCombinationProduct({ region: 'EU', integral: false }) as EuCombinationClassification;
    expect(separate.regulatoryRoute).toContain('non-integral');
  });

  it('the FDA path does not need integral', () => {
    const r = classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'drug' }) as FdaCombinationClassification;
    expect(r.leadCenter).toBe('CDER');
  });
});
