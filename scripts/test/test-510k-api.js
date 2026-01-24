const express = require('express');
const path = require('path');
const mockFda510kRoutes = require('./server/routes/mock/fda510k-mock');

const app = express();
app.use(express.json());

// Serve mock API routes
app.use('/api/fda510k', mockFda510kRoutes);

// Serve static files from 'generated_documents'
app.use('/generated_documents', express.static(path.join(__dirname, 'generated_documents')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`FDA 510k test server running on port ${PORT}`);
  console.log(
    `Test the compliance status endpoint at: http://localhost:${PORT}/api/fda510k/estar/compliance-status`
  );
  console.log(
    `Test the PDF generation endpoint at: http://localhost:${PORT}/api/fda510k/pdf/submission (POST)`
  );
});
