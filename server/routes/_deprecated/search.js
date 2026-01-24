import { Router } from 'express';
import { semanticQuery } from '../services/semanticSearch.js';
const search = Router();

// GET /api/search?q=free text&topK=5
search.get('/search', async (req, res, next) => {
  try {
    const { q, topK } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing q param' });
    const rows = await semanticQuery(q, topK);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default search;
