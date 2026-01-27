/**
 * eCTD Documents Routes
 * Electronic Common Technical Document management
 */
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    documents: [],
    message: 'eCTD documents service ready',
  });
});

router.get('/:id', (req, res) => {
  res.json({
    document: null,
    message: 'eCTD document not found',
  });
});

export default router;
