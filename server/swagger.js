const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

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

function setupSwagger(app) {
  app.use('/api/vault/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

module.exports = setupSwagger;
