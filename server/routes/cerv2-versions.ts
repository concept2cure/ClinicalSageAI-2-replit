/**
 * CERV2 Versions Routes
 * Version history & editing sessions
 */
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    versions: [],
    message: 'CERV2 versions service ready',
  });
});

router.get('/:versionId', (req, res) => {
  res.json({
    version: null,
    message: 'Version not found',
  });
});

export default router;
