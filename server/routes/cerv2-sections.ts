/**
 * CERV2 Sections Routes
 * 510(k) section tree navigation
 */
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    sections: [],
    message: 'CERV2 sections service ready',
  });
});

router.get('/:sectionId', (req, res) => {
  res.json({
    section: null,
    message: 'Section not found',
  });
});

export default router;
