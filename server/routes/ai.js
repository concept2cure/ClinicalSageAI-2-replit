// server/routes/ai.js

import express from 'express';
import retrieveRoutes from './ai/retrieve.js';

const router = express.Router();

// Mount the retrieve routes
router.use('/retrieve', retrieveRoutes);

export default router;
