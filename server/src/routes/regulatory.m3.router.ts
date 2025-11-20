import { Router } from 'express';
import { buildM3Tokens, renderSectionMD } from '../services/m3_tokens';
import { aiNextActions } from '../services/ai/regulatory';
const r = Router();

r.get('/:programId/tokens', async (req, res) => {
  const tokens = await buildM3Tokens(req.params.programId);
  res.json(tokens);
});

r.post('/:programId/section', async (req, res) => {
  const { section = '3.2.P.3.3', fmt = 'md' } = req.body || {};
  const tokens = await buildM3Tokens(req.params.programId);
  const md = renderSectionMD(section, tokens);
  if (fmt === 'md') {
    res.setHeader('Content-Type', 'text/markdown');
    return res.send(md);
  }
  // For DOCX/PDF, return md as fallback (avoid external libs in first pass)
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('X-Note', 'DOCX/PDF not wired; returning Markdown draft.');
  res.send(md);
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'm3', programId: req.params.programId });
  res.json(out);
});

export default r;
