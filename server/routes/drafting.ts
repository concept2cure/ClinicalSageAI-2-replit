/**
 * AI Drafting Routes
 * AI-powered document drafting service
 */
import { Router } from 'express';

const router = Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    message: 'AI drafting service ready',
  });
});

router.post('/generate', (req, res) => {
  res.json({
    success: true,
    draft: '',
    message: 'Drafting service ready - connect OpenAI for full functionality',
  });
});

export default router;
