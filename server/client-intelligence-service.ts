/**
 * Client Intelligence Service
 *
 * This service manages client-specific data intelligence gathering,
 * analysis, and reporting. It helps organize our data assets
 * to provide tailored insights for each client.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { csrReports, csrDetails } from 'shared/schema';
import { sql, eq, inArray, like } from 'drizzle-orm';

export interface ClientProfile {
  id: string;
  name: string;
  website?: string;
  therapeuticAreas: string[];
  pipeline: PipelineAsset[];
  competitors: string[];
  latestAnalysisDate?: string;
  dataCollectionStatus: 'pending' | 'in_progress' | 'complete';
}

export interface PipelineAsset {
  name: string;
  phase: string;
  indication: string;
  mechanism?: string;
  target?: string;
  description?: string;
}

export interface ClientAnalysisResult {
  clientId: string;
  generatedDate: string;
  relevantTrials: number;
  competitorTrials: number;
  mechanismTrials: number;
  targetTrials: number;
  indicationTrials: number;
  reportFile: string;
}

/**
 * Client registry - currently hardcoded, would be stored in database in production
 */
const clients: Record<string, ClientProfile> = {
  'lumen-bio': {
    id: 'lumen-bio',
    name: 'Lumen Bio',
    website: 'https://www.lumen.bio',
    therapeuticAreas: ['Oncology', 'Immunotherapy'],
    pipeline: [
      {
        name: 'LMB-100',
        phase: 'Phase 1/2',
        indication: 'Solid Tumors',
        mechanism: 'Recombinant Immunotoxin',
        description: 'Recombinant Immunotoxin for Solid Tumors',
      },
      {
        name: 'LMB-764/BER-T01',
        phase: 'Phase 1',
        indication: 'Ovarian Cancer',
        target: 'Claudin 6',
        description: 'Claudin 6 Targeted Immunotoxin for Ovarian Cancer',
      },
      {
        name: 'TC-1 Targeted',
        phase: 'Preclinical',
        indication: 'HPV+ Cancers',
        description: 'Targeted Immunotherapy for HPV+ Cancers',
      },
      {
        name: 'XNW-5001',
        phase: 'Preclinical',
        indication: 'Hematological/Solid Tumors',
        target: 'ROR1',
        description: 'ROR1-Targeted Immunotoxin for Hematological/Solid Tumors',
      },
    ],
    competitors: ['Molecular Templates', 'ADC Therapeutics', 'BioNTech', 'ImmunoGen', 'Seagen'],
    dataCollectionStatus: 'pending',
  },
};

/**
 * Get all registered clients
 */
export function getAllClients(): ClientProfile[] {
  return Object.values(clients);
}

/**
 * Get a specific client by ID
 */
export function getClientById(clientId: string): ClientProfile | null {
  return clients[clientId] || null;
}

/**
 * Fetch client-specific clinical trial data
 */
export async function fetchClientSpecificData(clientId: string): Promise<any> {
  const client = getClientById(clientId);
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  // Update client status
  clients[clientId].dataCollectionStatus = 'in_progress';

  if (clientId === 'lumen-bio') {
    return new Promise((resolve, reject) => {
      // Use dedicated script for Lumen Bio
      const pythonScript = spawn('python3', ['server/scripts/fetch_client_specific_trials.py']);

      let scriptOutput = '';
      let scriptError = '';

      pythonScript.stdout.on('data', data => {
        const output = data.toString();
        console.log(output);
        scriptOutput += output;
      });

      pythonScript.stderr.on('data', data => {
        const error = data.toString();
        console.error(error);
        scriptError += error;
      });

      pythonScript.on('close', code => {
        if (code !== 0) {
          clients[clientId].dataCollectionStatus = 'pending';
          reject(new Error(`Script exited with code ${code}: ${scriptError}`));
          return;
        }

        // Get analysis result file path from output
        const analysisFileMatch = scriptOutput.match(/Saved competitor analysis to: (.*\.json)/);
        const analysisFile = analysisFileMatch ? analysisFileMatch[1] : null;

        // Update client status
        clients[clientId].dataCollectionStatus = 'complete';
        clients[clientId].latestAnalysisDate = new Date().toISOString();

        resolve({
          success: true,
          clientId,
          analysisFile,
          output: scriptOutput,
        });
      });
    });
  } else {
    // Generic implementation for other clients
    throw new Error(`No specific data collection implementation for client: ${clientId}`);
  }
}

/**
 * Find relevant trials in our database for a specific client
 */
export async function findRelevantTrialsForClient(clientId: string): Promise<any> {
  const client = getClientById(clientId);
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  // Prepare search terms based on client profile
  const indications = client.pipeline.map(asset => asset.indication.toLowerCase());
  const mechanisms = client.pipeline
    .filter(asset => asset.mechanism)
    .map(asset => asset.mechanism!.toLowerCase());
  const targets = client.pipeline
    .filter(asset => asset.target)
    .map(asset => asset.target!.toLowerCase());

  // Search for relevant trials in our database
  const relevantTrials = await db
    .select({
      id: csrReports.id,
      title: csrReports.title,
      sponsor: csrReports.sponsor,
      indication: csrReports.indication,
      phase: csrReports.phase,
      date: csrReports.date,
      nctId: csrReports.nctrialId,
    })
    .from(csrReports)
    .where(
      sql`LOWER(${csrReports.indication}) LIKE ANY (ARRAY[${indications.map(i => `%${i}%`)}])
    OR LOWER(${csrReports.title}) LIKE ANY (ARRAY[${[...mechanisms, ...targets].map(t => `%${t}%`)}])
    OR LOWER(${csrReports.sponsor}) = ANY (ARRAY[${client.competitors.map(c => c.toLowerCase())}])`
    )
    .orderBy(csrReports.uploadDate);

  // Categorize the trials
  const categorizedTrials = {
    byIndication: {} as Record<string, any[]>,
    byCompetitor: {} as Record<string, any[]>,
    byMechanism: {} as Record<string, any[]>,
    byTarget: {} as Record<string, any[]>,
    allTrials: relevantTrials,
  };

  // Categorize trials by indication
  for (const trial of relevantTrials) {
    // Check indications
    for (const indication of indications) {
      if (trial.indication.toLowerCase().includes(indication)) {
        if (!categorizedTrials.byIndication[indication]) {
          categorizedTrials.byIndication[indication] = [];
        }
        categorizedTrials.byIndication[indication].push(trial);
      }
    }

    // Check competitors
    const sponsor = trial.sponsor.toLowerCase();
    for (const competitor of client.competitors) {
      if (sponsor === competitor.toLowerCase()) {
        if (!categorizedTrials.byCompetitor[competitor]) {
          categorizedTrials.byCompetitor[competitor] = [];
        }
        categorizedTrials.byCompetitor[competitor].push(trial);
      }
    }

    // Check mechanisms and targets in title
    const title = trial.title.toLowerCase();
    for (const mechanism of mechanisms) {
      if (title.includes(mechanism)) {
        if (!categorizedTrials.byMechanism[mechanism]) {
          categorizedTrials.byMechanism[mechanism] = [];
        }
        categorizedTrials.byMechanism[mechanism].push(trial);
      }
    }

    for (const target of targets) {
      if (title.includes(target)) {
        if (!categorizedTrials.byTarget[target]) {
          categorizedTrials.byTarget[target] = [];
        }
        categorizedTrials.byTarget[target].push(trial);
      }
    }
  }

  return {
    clientId,
    clientName: client.name,
    relevantTrialCount: relevantTrials.length,
    categorizedTrials,
  };
}

/**
 * Generate a client-specific intelligence report
 */
export async function generateClientReport(clientId: string): Promise<any> {
  const client = getClientById(clientId);
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  // Find relevant trials
  const trialData = await findRelevantTrialsForClient(clientId);

  // Create output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), 'uploads', 'client-reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate the report
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const reportFile = path.join(outputDir, `${clientId}_report_${timestamp}.json`);

  const report = {
    generatedAt: new Date().toISOString(),
    client,
    relevantTrials: trialData.relevantTrialCount,
    trialsByIndication: Object.entries(trialData.categorizedTrials.byIndication).map(
      ([indication, trials]) => ({
        indication,
        count: (trials as any[]).length,
      })
    ),
    trialsByCompetitor: Object.entries(trialData.categorizedTrials.byCompetitor).map(
      ([competitor, trials]) => ({
        competitor,
        count: (trials as any[]).length,
      })
    ),
    competitiveLandscape: {
      totalCompetitors: client.competitors.length,
      competitorsByTrialCount: Object.entries(trialData.categorizedTrials.byCompetitor)
        .map(([competitor, trials]) => ({
          competitor,
          trialCount: (trials as any[]).length,
        }))
        .sort((a, b) => b.trialCount - a.trialCount),
    },
    pipelineAssets: client.pipeline.map(asset => ({
      ...asset,
      relevantTrialCount: Object.values(trialData.categorizedTrials.byIndication)
        .flat()
        .filter(
          (trial: any) =>
            trial.indication.toLowerCase().includes(asset.indication.toLowerCase()) ||
            (asset.mechanism &&
              trial.title.toLowerCase().includes(asset.mechanism.toLowerCase())) ||
            (asset.target && trial.title.toLowerCase().includes(asset.target.toLowerCase()))
        ).length,
    })),
  };

  // Save report to file
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  return {
    success: true,
    clientId,
    clientName: client.name,
    reportFile,
    report,
  };
}

/**
 * Get the latest client report
 */
export function getLatestClientReport(clientId: string): any {
  const client = getClientById(clientId);
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const outputDir = path.join(process.cwd(), 'uploads', 'client-reports');
  if (!fs.existsSync(outputDir)) {
    return null;
  }

  // Find the latest report file
  const reportFiles = fs
    .readdirSync(outputDir)
    .filter(file => file.startsWith(`${clientId}_report_`) && file.endsWith('.json'))
    .sort()
    .reverse();

  if (reportFiles.length === 0) {
    return null;
  }

  const latestReportFile = path.join(outputDir, reportFiles[0]);
  const reportData = JSON.parse(fs.readFileSync(latestReportFile, 'utf8'));

  return {
    reportFile: latestReportFile,
    reportData,
  };
}
