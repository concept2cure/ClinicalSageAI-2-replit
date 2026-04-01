import type { Express, Request, Response } from 'express';
import foresightApiRoutes from '../routes/foresight-api';
import foresightAIAdvancedRoutes from '../routes/foresight-ai-advanced';
import foresightFeedbackRoutes from '../routes/foresight-feedback';

export function registerIntegrationRoutes(app: Express) {
  try {
    const deprecate = (_req: Request, res: Response, next: () => void) => {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', '2026-04-01');
      res.setHeader('Link', '<https://docs.concept2cure.ai/api/cortex>; rel="canonical"');
      next();
    };

    app.use('/api/foresight', deprecate, foresightApiRoutes);
    app.use('/api/foresight-ai', deprecate, foresightAIAdvancedRoutes);
    app.use('/api/foresight-feedback', deprecate, foresightFeedbackRoutes);
  } catch (error) {
    console.error('Failed to mount integration routes:', error);
  }
}
