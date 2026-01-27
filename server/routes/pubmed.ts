/**
 * PubMed Routes
 * PubMed literature search integration
 */
import { Router } from 'express';

const router = Router();

router.get('/search', (req, res) => {
  res.json({
    results: [],
    total: 0,
    message: 'PubMed search service ready',
  });
});

router.get('/article/:pmid', (req, res) => {
  res.json({
    article: null,
    message: 'Article not found',
  });
});

export default router;
