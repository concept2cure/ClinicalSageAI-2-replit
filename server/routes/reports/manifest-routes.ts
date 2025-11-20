import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';

const reportsManifestRoutes = Router();
const REPORTS_ROOT_DIR = 'attached_assets/example_reports';
const LAUNCH_CONFIG_PATH = 'attached_assets/launch_config.json';

/**
 * Get the root report index with all personas
 */
reportsManifestRoutes.get('/personas(\\.json)?', async (_req: Request, res: Response) => {
  try {
    const indexPath = path.join('attached_assets', 'report_index.json');

    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({
        success: false,
        message: 'Report index not found',
      });
    }

    const reportIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    res.json(reportIndex);
  } catch (error: any) {
    console.error('Error fetching report personas:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching report personas: ${error.message}`,
    });
  }
});

/**
 * Get manifest for a specific persona
 */
reportsManifestRoutes.get('/persona/:personaId', async (req: Request, res: Response) => {
  try {
    let { personaId } = req.params;

    // Remove the .json suffix if present
    personaId = personaId.replace(/\.json$/, '');

    // Set response type to JSON explicitly
    res.setHeader('Content-Type', 'application/json');

    const manifestPath = path.join(REPORTS_ROOT_DIR, personaId, 'manifest.json');

    console.log(`Accessing manifest at: ${manifestPath}`);

    if (!fs.existsSync(manifestPath)) {
      console.error(`Manifest for ${personaId} not found at path: ${manifestPath}`);
      return res.status(404).json({
        success: false,
        message: `Manifest for ${personaId} not found`,
      });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`Successfully loaded manifest for ${personaId}`);
    res.json(manifest);
  } catch (error: any) {
    console.error(`Error fetching persona manifest:`, error);
    res.status(500).json({
      success: false,
      message: `Error fetching persona manifest: ${error.message}`,
    });
  }
});

/**
 * Get launch configuration for example reports
 */
reportsManifestRoutes.get('/launch-config(\\.json)?', async (_req: Request, res: Response) => {
  try {
    const configPath = path.join(process.cwd(), LAUNCH_CONFIG_PATH);

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({
        success: false,
        message: 'Launch configuration not found',
      });
    }

    const launchConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    res.json(launchConfig);
  } catch (error: any) {
    console.error('Error fetching launch configuration:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching launch configuration: ${error.message}`,
    });
  }
});

/**
 * Get report index for example reports
 */
reportsManifestRoutes.get('/index(\\.json)?', async (_req: Request, res: Response) => {
  try {
    const indexPath = path.join(process.cwd(), 'attached_assets', 'report_index.json');

    if (!fs.existsSync(indexPath)) {
      console.error(`Report index not found at path: ${indexPath}`);
      return res.status(404).json({
        success: false,
        message: 'Report index not found',
      });
    }

    // Read the file contents
    const fileContents = fs.readFileSync(indexPath, 'utf-8');
    console.log(`Got file contents with length: ${fileContents.length}`);

    // Parse the JSON
    const rawReportIndex = JSON.parse(fileContents);

    // Transform the response to match what the client expects
    const transformedIndex = {
      personas: rawReportIndex.available_subscriptions.map(sub => ({
        id: sub.persona,
        name: sub.title,
        color: getPersonaColor(sub.persona),
      })),
      reportTypes: [
        { id: 'success-prediction', name: 'Success Prediction', new: false },
        { id: 'protocol-optimization', name: 'Protocol Optimization', new: true },
        { id: 'endpoint-selection', name: 'Endpoint Selection', new: false },
        { id: 'regulatory-package', name: 'Regulatory Package', new: false },
        { id: 'investment-analysis', name: 'Investment Analysis', new: false },
        { id: 'competitive-intelligence', name: 'Competitive Intelligence', new: false },
      ],
      featuredReports: [
        {
          id: 'clinical-001',
          name: 'Trial Success Prediction Report',
          description:
            'AI-powered prediction for clinical trial success with detailed risk analysis',
          persona: 'clinical',
          type: 'success-prediction',
        },
        {
          id: 'regulatory-001',
          name: 'Regulatory Submission Bundle',
          description: 'Complete documentation package for regulatory submissions',
          persona: 'regulatory',
          type: 'regulatory-package',
        },
        {
          id: 'investor-001',
          name: 'Portfolio Risk Assessment',
          description: 'Investment portfolio analysis with risk-adjusted ROI projections',
          persona: 'investor',
          type: 'investment-analysis',
          new: true,
        },
      ],
    };

    // Send the transformed data
    res.json(transformedIndex);
  } catch (error: any) {
    console.error('Error fetching report index:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching report index: ${error.message}`,
    });
  }
});

// Helper function to assign colors to personas
function getPersonaColor(persona: string): string {
  const colorMap: Record<string, string> = {
    ceo: 'blue',
    biostats: 'green',
    ops: 'teal',
    planner: 'amber',
    writer: 'indigo',
    regulatory: 'purple',
    investor: 'amber',
    pi: 'teal',
    intelligence: 'blue',
    cxo: 'blue',
    clinical: 'green',
  };

  return colorMap[persona] || 'blue';
}

export default reportsManifestRoutes;
