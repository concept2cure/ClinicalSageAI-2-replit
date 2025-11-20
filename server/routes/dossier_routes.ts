import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Directory for storing dossier data
const DOSSIERS_DIR = path.join(process.cwd(), 'data/dossiers');

// Create dossiers directory if it doesn't exist
if (!fs.existsSync(DOSSIERS_DIR)) {
  fs.mkdirSync(DOSSIERS_DIR, { recursive: true });
}

// Save protocol intelligence report to dossier
router.post('/save-intelligence-report', express.json(), async (req, res) => {
  try {
    const { protocol_id, user_id, report_data, optimized } = req.body;

    if (!protocol_id) {
      return res.status(400).json({
        success: false,
        message: 'Protocol ID is required',
      });
    }

    // Generate a unique dossier ID if none exists
    const dossierId = `dossier_${protocol_id}_${Date.now()}`;

    // Create dossier file path
    const dossierPath = path.join(DOSSIERS_DIR, `${dossierId}.json`);

    // Create dossier data object
    const dossierData = {
      id: dossierId,
      protocol_id,
      user_id: user_id || 'anonymous',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      report_data,
      optimized_versions: optimized
        ? [
            {
              timestamp: new Date().toISOString(),
              protocol: optimized,
              version: 1,
            },
          ]
        : [],
      version: 1,
      notes: {},
      exports: [],
    };

    // Save dossier to file
    fs.writeFileSync(dossierPath, JSON.stringify(dossierData, null, 2));

    return res.json({
      success: true,
      dossier_id: dossierId,
      version: 1,
      message: 'Protocol intelligence report saved to dossier',
    });
  } catch (error) {
    console.error('Error saving to dossier:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save to dossier',
    });
  }
});

// Get all dossiers
router.get('/', (req, res) => {
  try {
    // Read all dossier files
    const dossierFiles = fs.readdirSync(DOSSIERS_DIR).filter(file => file.endsWith('.json'));

    // Extract basic info from each dossier
    const dossiers = dossierFiles.map(file => {
      const dossierPath = path.join(DOSSIERS_DIR, file);
      const dossierData = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));

      return {
        id: dossierData.id,
        protocol_id: dossierData.protocol_id,
        user_id: dossierData.user_id,
        created_at: dossierData.created_at,
        updated_at: dossierData.updated_at,
        versions: dossierData.optimized_versions?.length + 1 || 1,
      };
    });

    return res.json(dossiers);
  } catch (error) {
    console.error('Error listing dossiers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list dossiers',
    });
  }
});

// Get a specific dossier
router.get('/:dossier_id', (req, res) => {
  try {
    const { dossier_id } = req.params;

    // Create dossier file path
    const dossierPath = path.join(DOSSIERS_DIR, `${dossier_id}.json`);

    // Check if dossier exists
    if (!fs.existsSync(dossierPath)) {
      return res.status(404).json({
        success: false,
        message: 'Dossier not found',
      });
    }

    // Read dossier data
    const dossierData = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));

    return res.json(dossierData);
  } catch (error) {
    console.error('Error getting dossier:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get dossier',
    });
  }
});

export default router;
