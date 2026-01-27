/**
 * Docs Routes
 * Document storage and retrieval service
 */
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    docs: [],
    message: 'Docs service ready',
  });
});

router.get('/:id', (req, res) => {
  res.json({
    doc: null,
    message: 'Document not found',
  });
});

export default router;
