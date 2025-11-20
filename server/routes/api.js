import { Router } from 'express';
import docushareRoutes from './docushare.js';
import signatureRoutes from './signature.js';
import indRoutes from './ind.js';
import chatRoutes from './chat.js';
import documentRoutes from './document.js';
import aiPreviewRoutes from './aiPreview.js';
import indTipsRoutes from './indTips.js';

const api = Router();

// Mount the various API routes
api.use(docushareRoutes);
api.use(signatureRoutes);
api.use(indRoutes);
api.use(chatRoutes); // Chat AI routes
api.use(documentRoutes); // Document AI routes
api.use(aiPreviewRoutes); // AI preview routes for upload preview
api.use(indTipsRoutes); // IND tips for gap analysis

export default api;
