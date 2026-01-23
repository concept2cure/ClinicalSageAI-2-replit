import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

const router = express.Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

router.use((req, res, next) => {
  if (!isDemoMode()) {
    return res.status(501).json({
      success: false,
      error: 'IND sequence mock endpoints require DEMO_MODE=true',
    });
  }
  next();
});

// Mock database for demo purposes
// In production, this would use the actual database models
const sequencesDb = [
  {
    id: '001',
    sequence_id: '0001',
    title: 'Initial IND Submission',
    status: 'ready',
    created_at: new Date('2025-03-15').toISOString(),
    updated_at: new Date('2025-03-20').toISOString(),
    submission_status: 'draft',
    documents: [
      {
        id: 'd001',
        title: 'Form FDA 1571',
        filename: 'form-1571.pdf',
        path: 'm1/us/1-1-forms/form-1571.pdf',
      },
      {
        id: 'd002',
        title: 'Investigator Brochure',
        filename: 'investigator-brochure.pdf',
        path: 'm1/us/1-3-admin/investigator-brochure.pdf',
      },
      {
        id: 'd003',
        title: 'CMC Information',
        filename: 'cmc-data.pdf',
        path: 'm3/32-body-data/cmc-data.pdf',
      },
      {
        id: 'd004',
        title: 'Clinical Protocol',
        filename: 'protocol.pdf',
        path: 'm5/531-reports/protocol.pdf',
      },
    ],
  },
  {
    id: '002',
    sequence_id: '0002',
    title: 'Protocol Amendment',
    status: 'ready',
    created_at: new Date('2025-04-01').toISOString(),
    updated_at: new Date('2025-04-05').toISOString(),
    submission_status: 'draft',
    validation_status: 'valid',
    documents: [
      {
        id: 'd005',
        title: 'Form FDA 1571 (Updated)',
        filename: 'form-1571-v2.pdf',
        path: 'm1/us/1-1-forms/form-1571-v2.pdf',
      },
      {
        id: 'd006',
        title: 'Amended Protocol',
        filename: 'protocol-v2.pdf',
        path: 'm5/531-reports/protocol-v2.pdf',
      },
    ],
  },
];

// Get all sequences
router.get('/sequences', (req, res) => {
  res.json(sequencesDb);
});

// Get last sequence number
router.get('/last-sequence', (req, res) => {
  if (sequencesDb.length > 0) {
    // Sort by sequence_id and get the highest one
    const sequences = [...sequencesDb].sort(
      (a, b) => parseInt(b.sequence_id) - parseInt(a.sequence_id)
    );
    res.json(sequences[0].sequence_id);
  } else {
    res.json('0000');
  }
});

// Get a single sequence by ID
router.get('/sequence/:id', (req, res) => {
  const sequence = sequencesDb.find(s => s.id === req.params.id);
  if (!sequence) {
    return res.status(404).json({ error: 'Sequence not found' });
  }
  res.json(sequence);
});

// Create a new sequence
router.post('/sequence/create', (req, res) => {
  try {
    const { base, plan } = req.body;

    // Generate next sequence number
    const baseInt = parseInt(base);
    const nextSequence = (baseInt + 1).toString().padStart(4, '0');

    // Create the new sequence
    const newSequence = {
      id: (sequencesDb.length + 1).toString().padStart(3, '0'),
      sequence_id: nextSequence,
      title: `Sequence ${nextSequence}`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      submission_status: 'draft',
      documents: plan.map(p => ({
        id: p.id,
        title: p.title,
        filename: p.title.toLowerCase().replace(/\s+/g, '-') + '.pdf',
        path: p.module
          ? `${p.module.replace(/\./g, '/')}/${p.title.toLowerCase().replace(/\s+/g, '-')}.pdf`
          : '',
        version: p.version,
      })),
    };

    // Add to our "database"
    sequencesDb.unshift(newSequence);

    res.json({ success: true, sequence: newSequence.id, sequenceId: nextSequence });
  } catch (error) {
    console.error('Error creating sequence:', error);
    res.status(500).json({ error: 'Failed to create sequence' });
  }
});

// Validate a sequence
router.get('/sequence/validate/:id', async (req, res) => {
  try {
    const sequence = sequencesDb.find(s => s.id === req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // In a real implementation, we would run validation checks on the eCTD structure
    // For this demo, we'll simulate validation
    const isValid = sequence.documents && sequence.documents.length > 0;
    const validationStatus = isValid ? 'valid' : 'invalid';

    // Update the sequence with validation status
    sequence.validation_status = validationStatus;

    if (isValid) {
      return res.json({
        status: 'valid',
        message: 'Sequence validated successfully',
      });
    } else {
      return res.json({
        status: 'invalid',
        message: 'Sequence validation failed',
        issues: [
          {
            severity: 'error',
            message: 'Missing required documents',
            location: 'module1/us/admin-info',
          },
        ],
      });
    }
  } catch (error) {
    console.error('Error validating sequence:', error);
    res.status(500).json({ error: 'Failed to validate sequence' });
  }
});

// Download a sequence
router.get('/sequence/:id/download', (req, res) => {
  try {
    const sequence = sequencesDb.find(s => s.id === req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // In a real implementation, we would generate and return the eCTD package
    // For this demo, we'll simulate downloading by sending a JSON response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sequence-${sequence.sequence_id}.json"`
    );
    res.json({
      sequence_id: sequence.sequence_id,
      title: sequence.title,
      documents: sequence.documents,
      metadata: {
        created_at: sequence.created_at,
        status: sequence.status,
      },
    });
  } catch (error) {
    console.error('Error downloading sequence:', error);
    res.status(500).json({ error: 'Failed to download sequence' });
  }
});

// Submit sequence to FDA ESG
router.post('/sequence/:id/submit', async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const { ind_serial, sponsor_name } = req.body;

    // Find the sequence
    const sequence = sequencesDb.find(s => s.id === sequenceId);
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // Validate required fields
    if (!ind_serial || !sponsor_name) {
      return res.status(400).json({
        error: 'Missing required parameters',
        details: 'IND serial number and sponsor name are required',
      });
    }

    // Update sequence with submission info and status
    sequence.ind_serial = ind_serial;
    sequence.sponsor_name = sponsor_name;
    sequence.submission_status = 'submitted_in_progress';
    sequence.updated_at = new Date().toISOString();

    if (!sequence.submissions) {
      sequence.submissions = [];
    }

    // Add a submission record
    const submission = {
      id: Date.now().toString(),
      status: 'in_progress',
      timestamp: new Date().toISOString(),
      tracking_number: 'ESG-' + Math.floor(1000000 + Math.random() * 9000000),
      acknowledgment_status: 'pending',
    };

    sequence.submissions.unshift(submission);

    // In a real implementation, we would call the ESG submission Python script
    // For now, we'll set a timeout to simulate the submission process
    setTimeout(() => {
      sequence.submission_status = 'submitted';
      submission.status = 'success';
      submission.message = 'Submission successfully transmitted to FDA ESG';
    }, 10000); // simulate 10 second submission

    res.json({
      success: true,
      message: 'Submission initiated',
      submission_id: submission.id,
      tracking_number: submission.tracking_number,
    });
  } catch (error) {
    console.error('Error submitting sequence to FDA:', error);
    res.status(500).json({ error: 'Failed to submit sequence to FDA' });
  }
});

// Helper function to execute Python script for ESG submission
async function submitToEsg(sequenceId, indSerial, sponsorName) {
  // Construct the command to execute the Python ESG submission script
  const scriptPath = path.join(__dirname, '..', 'utils', 'esg_submit.py');
  const command = `python3 ${scriptPath} --sequence_id=${sequenceId} --ind_serial=${indSerial} --sponsor=${sponsorName}`;

  try {
    // Execute the Python script
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      console.error('ESG submission stderr:', stderr);
      throw new Error(stderr);
    }

    // Parse the output from the Python script
    const result = JSON.parse(stdout);
    return result;
  } catch (error) {
    console.error('Error executing ESG submission script:', error);
    throw error;
  }
}

export default router;
