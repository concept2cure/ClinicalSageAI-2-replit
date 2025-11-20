import { Router } from 'express';
import { aiGateCheckFindings, aiNextActions } from '../services/ai/regulatory';
const r = Router();

const defaultRules = [
  { code: 'M3.P.3.3', title: 'Process description present', fn: (t: any) => !!t.p33_present },
  { code: 'M3.P.5', title: 'Specifications complete', fn: (t: any) => !!t.specs_ready },
  { code: 'STAB', title: 'Stability LT+ACC present', fn: (t: any) => !!(t.lt && t.acc) },
  { code: 'PPQ', title: 'PPQ protocol linked', fn: (t: any) => !!t.ppq_protocol },
];

function evaluate(tokens: any) {
  return defaultRules.map(r => ({ code: r.code, title: r.title, pass: !!r.fn(tokens) }));
}

r.post('/:programId/run', async (req, res) => {
  // TODO: swap dummy tokens for real cross-module aggregation
  const tokens = {
    p33_present: true,
    specs_ready: false,
    lt: true,
    acc: true,
    ppq_protocol: false,
  };
  const checks = evaluate(tokens);
  const ai = await aiGateCheckFindings(tokens);
  res.json({ tokens, checks, ai });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'gatekeeper', programId: req.params.programId });
  res.json(out);
});

export default r;
