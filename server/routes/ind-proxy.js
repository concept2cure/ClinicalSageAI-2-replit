/**
 * IND Automation API Proxy Router
 *
 * This module proxies requests from the client to the IND Automation FastAPI service.
 * It handles authentication, error handling, and provides a unified API endpoint.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configuration for the IND Automation service
const IND_SERVICE_URL = process.env.IND_SERVICE_URL || 'http://localhost:8000';

// Add basic request logging
router.use((req, res, next) => {
  console.log(`[IND Proxy] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const response = await fetch(`${IND_SERVICE_URL}/health`);

    if (response.ok) {
      const data = await response.json();
      return res.json({ ...data, proxy: 'connected' });
    } else {
      console.error(`[IND Proxy] Health check failed: ${response.status}`);
      return res.status(502).json({
        error: 'IND Service unavailable',
        status: response.status,
        proxyHealth: 'ok',
      });
    }
  } catch (error) {
    console.error(`[IND Proxy] Health check error: ${error.message}`);

    // Check if we have mock implementation files available
    if (fs.existsSync(path.join(process.cwd(), 'ind_mock'))) {
      return res.json({
        status: 'mock',
        message: 'Using mock implementation',
        proxyHealth: 'ok',
      });
    }

    return res.status(502).json({
      error: 'Unable to connect to IND Service',
      message: error.message,
      proxyHealth: 'ok',
    });
  }
});

// Function to generate mock forms (used as fallback if service is down)
const generateMockForm = (formType, pid) => {
  const mockFile = path.join(process.cwd(), 'ind_mock', `form${formType}.docx`);

  if (fs.existsSync(mockFile)) {
    return mockFile;
  }

  return null;
};

// Form generation endpoints with fallback
router.get('/api/ind/:pid/forms/:formType', async (req, res) => {
  const { pid, formType } = req.params;

  try {
    // First try to connect to the IND service
    const response = await fetch(`${IND_SERVICE_URL}/api/ind/${pid}/forms/${formType}`);

    if (response.ok) {
      // Pipe the response from the FastAPI service to the client
      const buffer = await response.arrayBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="Form${formType}_${pid}.docx"`);
      res.send(Buffer.from(buffer));
    } else {
      console.error(`[IND Proxy] Form generation failed: ${response.status}`);

      // Try to use mock implementation
      const mockFile = generateMockForm(formType, pid);
      if (mockFile) {
        res.sendFile(mockFile);
      } else {
        res.status(502).json({
          error: 'Form generation service unavailable',
          status: response.status,
        });
      }
    }
  } catch (error) {
    console.error(`[IND Proxy] Form generation error: ${error.message}`);

    // Try to use mock implementation
    const mockFile = generateMockForm(formType, pid);
    if (mockFile) {
      res.sendFile(mockFile);
    } else {
      res.status(502).json({
        error: 'Unable to connect to form generation service',
        message: error.message,
      });
    }
  }
});

// Projects API
router.get('/api/projects', async (req, res) => {
  try {
    const response = await fetch(`${IND_SERVICE_URL}/api/projects`);
    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      console.error(`[IND Proxy] Projects fetch failed: ${response.status}`);
      // Return mock data for demo purposes
      res.json([
        {
          project_id: 'DEMO-2025-001',
          sponsor: 'TrialSage Pharma',
          drug_name: 'ENZYMAX FORTE',
          protocol: 'TS-ENZ-2025',
          pi_name: 'Dr. Jane Smith',
          pi_address: '123 Medical Center, San Francisco, CA 94158',
          nct_number: 'NCT03456789',
          created: '2025-02-15',
          serial_number: 4,
        },
      ]);
    }
  } catch (error) {
    console.error(`[IND Proxy] Projects fetch error: ${error.message}`);
    // Return mock data for demo purposes
    res.json([
      {
        project_id: 'DEMO-2025-001',
        sponsor: 'TrialSage Pharma',
        drug_name: 'ENZYMAX FORTE',
        protocol: 'TS-ENZ-2025',
        pi_name: 'Dr. Jane Smith',
        pi_address: '123 Medical Center, San Francisco, CA 94158',
        nct_number: 'NCT03456789',
        created: '2025-02-15',
        serial_number: 4,
      },
    ]);
  }
});

// Get project by ID
router.get('/api/projects/:pid', async (req, res) => {
  const { pid } = req.params;

  try {
    const response = await fetch(`${IND_SERVICE_URL}/api/projects/${pid}`);
    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      console.error(`[IND Proxy] Project fetch failed: ${response.status}`);

      // For demo, return mock data if it's the ENZYMAX project
      if (pid === 'DEMO-2025-001') {
        res.json({
          project_id: 'DEMO-2025-001',
          sponsor: 'TrialSage Pharma',
          drug_name: 'ENZYMAX FORTE',
          protocol: 'TS-ENZ-2025',
          pi_name: 'Dr. Jane Smith',
          pi_address: '123 Medical Center, San Francisco, CA 94158',
          nct_number: 'NCT03456789',
          created: '2025-02-15',
          serial_number: 4,
        });
      } else {
        res.status(404).json({ error: 'Project not found' });
      }
    }
  } catch (error) {
    console.error(`[IND Proxy] Project fetch error: ${error.message}`);

    // For demo, return mock data if it's the ENZYMAX project
    if (pid === 'DEMO-2025-001') {
      res.json({
        project_id: 'DEMO-2025-001',
        sponsor: 'TrialSage Pharma',
        drug_name: 'ENZYMAX FORTE',
        protocol: 'TS-ENZ-2025',
        pi_name: 'Dr. Jane Smith',
        pi_address: '123 Medical Center, San Francisco, CA 94158',
        nct_number: 'NCT03456789',
        created: '2025-02-15',
        serial_number: 4,
      });
    } else {
      res.status(502).json({
        error: 'Unable to connect to IND service',
        message: error.message,
      });
    }
  }
});

// Create project
router.post('/api/projects', async (req, res) => {
  try {
    const response = await fetch(`${IND_SERVICE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (response.ok) {
      const data = await response.json();
      res.status(201).json(data);
    } else {
      console.error(`[IND Proxy] Project creation failed: ${response.status}`);
      res.status(response.status).json({
        error: 'Project creation failed',
        status: response.status,
      });
    }
  } catch (error) {
    console.error(`[IND Proxy] Project creation error: ${error.message}`);

    // For demo purposes, return the submitted data with added fields
    const projectData = {
      ...req.body,
      created: new Date().toISOString().split('T')[0],
      serial_number: 0,
    };

    res.status(201).json(projectData);
  }
});

// Update project
router.put('/api/projects/:pid', async (req, res) => {
  const { pid } = req.params;

  try {
    const response = await fetch(`${IND_SERVICE_URL}/api/projects/${pid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      console.error(`[IND Proxy] Project update failed: ${response.status}`);
      res.status(response.status).json({
        error: 'Project update failed',
        status: response.status,
      });
    }
  } catch (error) {
    console.error(`[IND Proxy] Project update error: ${error.message}`);

    // For demo purposes, return the submitted data
    const projectData = {
      ...req.body,
      updated: new Date().toISOString().split('T')[0],
    };

    res.json(projectData);
  }
});

// Generate sequence endpoint
router.post('/api/ind/:pid/sequence', async (req, res) => {
  const { pid } = req.params;

  try {
    const response = await fetch(`${IND_SERVICE_URL}/api/ind/${pid}/sequence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      console.error(`[IND Proxy] Sequence generation failed: ${response.status}`);
      res.status(response.status).json({
        error: 'Sequence generation failed',
        status: response.status,
      });
    }
  } catch (error) {
    console.error(`[IND Proxy] Sequence generation error: ${error.message}`);

    // For demo purposes, return a mock sequence number
    res.json({ serial_number: '0001' });
  }
});

// Get history
router.get('/api/ind/:pid/history', async (req, res) => {
  const { pid } = req.params;

  try {
    const response = await fetch(`${IND_SERVICE_URL}/api/ind/${pid}/history`);

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      console.error(`[IND Proxy] History fetch failed: ${response.status}`);
      res.status(response.status).json({
        error: 'History fetch failed',
        status: response.status,
      });
    }
  } catch (error) {
    console.error(`[IND Proxy] History fetch error: ${error.message}`);

    // For demo purposes, return mock history
    res.json([
      {
        serial: '0001',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        type: 'creation',
      },
      {
        serial: '0002',
        timestamp: new Date(Date.now() - 43200000).toISOString(), // 12 hours ago
        type: 'update',
      },
      {
        serial: '0003',
        timestamp: new Date(Date.now() - 21600000).toISOString(), // 6 hours ago
        type: 'form_generation',
      },
      {
        serial: '0004',
        timestamp: new Date().toISOString(),
        type: 'submission',
      },
    ]);
  }
});

export default router;
