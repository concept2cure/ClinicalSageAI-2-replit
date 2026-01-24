// A standalone Swagger UI server for the Vault API documentation
const express = require('express');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

// Create express app
const app = express();
const port = 5050; // Use a different port than the main app

// Swagger configuration
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TrialSage Vault API',
      version: '1.0.0',
      description: 'Interactive documentation for VAULT file management endpoints',
    },
    servers: [{ url: 'http://localhost:5000/api/vault', description: 'Development server' }],
  },
  apis: [path.join(__dirname, 'routes', '*.js')], // Path to the API routes with JSDoc comments
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJSDoc(options);

// Serve swagger docs
app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Redirect root to swagger UI
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Start server
app.listen(port, () => {
  console.log(`Swagger UI available at http://localhost:${port}`);
  console.log('Make sure your main application is running on port 5000');
});
