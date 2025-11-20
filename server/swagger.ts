import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

// Basic swagger definition
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TrialSage Vault API',
      version: '1.0.0',
      description: 'Interactive docs for VAULT file management endpoints',
    },
    servers: [{ url: '/api/vault' }],
  },
  apis: ['./server/routes/*.js'], // JSDoc comments in route files
};

const swaggerSpec = swaggerJSDoc(options);

function setupSwagger(app: Express): void {
  app.use('/api/vault/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

export default setupSwagger;
