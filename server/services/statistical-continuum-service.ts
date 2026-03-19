import { db } from '../db';
import {
  statisticalThreads,
  analysisSpecifications,
  tlfShells,
  type StatisticalThread,
  type AnalysisSpecification,
  type TlfShell,
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { SapGeneratorService, type SapRequestData } from './sap-generator-service';
import { ai } from '../lib/unified-ai-client';

// --- Types ---

interface ProtocolData {
  title: string;
  indication: string;
  phase: string;
  sampleSize: number;
  primaryEndpoint: string;
  secondaryEndpoints?: string[];
  arms?: string[] | number;
  randomization?: string;
  blinding?: string;
  durationWeeks?: number;
  dropoutRate?: number;
  statisticalMethods?: string;
  protocolId?: number;
}

interface ResultsData {
  primaryResult: {
    endpoint: string;
    effectSize: number;
    pValue: number;
    confidenceInterval: [number, number];
    treatmentMean?: number;
    controlMean?: number;
  };
  secondaryResults?: Array<{
    endpoint: string;
    effectSize: number;
    pValue: number;
    confidenceInterval: [number, number];
  }>;
  safetyResults?: {
    totalAEs: number;
    seriousAEs: number;
    discontinuationsDueToAE: number;
    adverseEventSummary?: string;
  };
  sampleSizeActual?: number;
  completionRate?: number;
}

interface ThreadWithSnapshots extends StatisticalThread {
  analysisSpecs: AnalysisSpecification[];
  tlfShellsList: TlfShell[];
}

interface AnalysisSpecGenResult {
  threadId: number;
  specifications: AnalysisSpecification[];
  count: number;
}

interface TLFShellGenResult {
  threadId: number;
  shells: TlfShell[];
  count: number;
}

interface CSRSectionResult {
  threadId: number;
  sections: Record<string, string>;
  updatedAt: Date;
}

// --- Service ---

export class StatisticalContinuumService {
  private sapService: SapGeneratorService;

  constructor() {
    this.sapService = SapGeneratorService.getInstance();
  }

  /**
   * Creates a statistical thread from a protocol concept.
   * Stores the initial protocol snapshot.
   */
  async initializeThread(
    protocolData: ProtocolData,
    organizationId: number,
    userId: number
  ): Promise<StatisticalThread> {
    const [thread] = await db
      .insert(statisticalThreads)
      .values({
        title: protocolData.title || `${protocolData.indication} ${protocolData.phase} Thread`,
        indication: protocolData.indication,
        phase: protocolData.phase,
        protocolId: protocolData.protocolId || null,
        status: 'active',
        protocolSnapshot: protocolData,
        organizationId,
        createdBy: userId,
      })
      .returning();

    return thread;
  }

  /**
   * Generates a SAP using SapGeneratorService and stores the SAP snapshot
   * in the thread.
   */
  async generateSAP(
    threadId: number,
    organizationId: number
  ): Promise<{ thread: StatisticalThread; sapContent: string }> {
    // Retrieve the thread
    const [thread] = await db
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    const protocol = thread.protocolSnapshot as ProtocolData;
    if (!protocol) {
      throw new Error(`Thread ${threadId} has no protocol snapshot`);
    }

    // Build SapRequestData from protocol snapshot
    const sapRequest: SapRequestData = {
      protocol_id: thread.protocolId?.toString(),
      indication: protocol.indication,
      phase: protocol.phase,
      sample_size: protocol.sampleSize,
      primary_endpoint: protocol.primaryEndpoint,
      secondary_endpoints: protocol.secondaryEndpoints,
      arms: protocol.arms,
      randomization: protocol.randomization,
      blinding: protocol.blinding,
      duration_weeks: protocol.durationWeeks,
      dropout_rate: protocol.dropoutRate,
    };

    // Generate SAP
    const sapResult = await this.sapService.generateSAP(sapRequest);

    // Store SAP snapshot
    const [updated] = await db
      .update(statisticalThreads)
      .set({
        sapSnapshot: {
          content: sapResult.sapContent,
          generatedAt: new Date().toISOString(),
          path: sapResult.sapPath,
        },
        updatedAt: new Date(),
      })
      .where(eq(statisticalThreads.id, threadId))
      .returning();

    return { thread: updated, sapContent: sapResult.sapContent };
  }

  /**
   * Generates analysis specifications (ADSL, ADAE, ADTTE dataset specs).
   * Uses AI to derive variable lists from the SAP content.
   */
  async generateAnalysisSpecs(
    threadId: number,
    organizationId: number
  ): Promise<AnalysisSpecGenResult> {
    // Retrieve thread with SAP
    const [thread] = await db
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    const sapSnapshot = thread.sapSnapshot as { content?: string } | null;
    const sapContent = sapSnapshot?.content || '';
    const protocol = thread.protocolSnapshot as ProtocolData;

    if (!sapContent && !protocol) {
      throw new Error(`Thread ${threadId} has no SAP or protocol data to derive specs from`);
    }

    // Use AI to generate analysis dataset specifications
    let datasetsPayload: {
      datasets: Array<{
        datasetName: string;
        datasetLabel: string;
        variables: any[];
        derivationRules: any;
        analysisMethod: string;
        population: string;
      }>;
    };

    try {
      const aiContent = await ai.complete(
        [
          {
            role: 'system',
            content: `You are a senior biostatistician creating ADaM dataset specifications for a clinical trial.
Generate specifications for ADSL (Subject Level), ADAE (Adverse Events), and ADTTE (Time to Event) datasets.
For each dataset, provide:
1. datasetName (e.g., "ADSL")
2. datasetLabel (descriptive label)
3. variables: array of objects with {name, label, type, derivationRule, coreVariable}
4. derivationRules: key rules for complex variables
5. analysisMethod: primary statistical method
6. population: analysis population

Return a JSON object with key "datasets" containing an array of 3 dataset specs.`,
          },
          {
            role: 'user',
            content: `Generate ADaM dataset specifications for this trial:
Indication: ${protocol?.indication || 'Not specified'}
Phase: ${protocol?.phase || 'Not specified'}
Primary Endpoint: ${protocol?.primaryEndpoint || 'Not specified'}
Secondary Endpoints: ${protocol?.secondaryEndpoints?.join(', ') || 'Not specified'}
Sample Size: ${protocol?.sampleSize || 'Not specified'}
Duration: ${protocol?.durationWeeks || 24} weeks

SAP Summary:
${sapContent.substring(0, 3000)}`,
          },
        ],
        { jsonMode: true, temperature: 0.2 }
      );

      datasetsPayload = JSON.parse(aiContent || '{"datasets":[]}');
    } catch (aiError) {
      console.error('[StatisticalContinuum] AI analysis spec generation failed, using fallback:', aiError);
      datasetsPayload = { datasets: [] };
    }

    // Store each dataset specification
    const createdSpecs: AnalysisSpecification[] = [];
    for (const dataset of datasetsPayload.datasets) {
      const [spec] = await db
        .insert(analysisSpecifications)
        .values({
          threadId,
          datasetName: dataset.datasetName,
          datasetLabel: dataset.datasetLabel,
          variables: dataset.variables,
          derivationRules: dataset.derivationRules,
          analysisMethod: dataset.analysisMethod,
          population: dataset.population,
          version: 1,
          organizationId,
        })
        .returning();
      createdSpecs.push(spec);
    }

    // Store snapshot in thread
    await db
      .update(statisticalThreads)
      .set({
        analysisSpecSnapshot: {
          specifications: datasetsPayload.datasets,
          generatedAt: new Date().toISOString(),
          count: createdSpecs.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(statisticalThreads.id, threadId));

    return {
      threadId,
      specifications: createdSpecs,
      count: createdSpecs.length,
    };
  }

  /**
   * Generates Table/Listing/Figure shells based on analysis specs and SAP.
   */
  async generateTLFShells(
    threadId: number,
    organizationId: number
  ): Promise<TLFShellGenResult> {
    // Retrieve thread
    const [thread] = await db
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    const protocol = thread.protocolSnapshot as ProtocolData;
    const sapSnapshot = thread.sapSnapshot as { content?: string } | null;
    const analysisSpecSnapshot = thread.analysisSpecSnapshot as { specifications?: any[] } | null;

    // Use AI to generate TLF shells
    const tlfContent = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a senior biostatistician generating TLF (Table, Listing, Figure) shells for a clinical trial CSR.
Generate a comprehensive set of TLF shells including:
- Demographics table
- Disposition table
- Primary efficacy table
- Secondary efficacy tables
- Adverse events summary table
- Serious adverse events listing
- Kaplan-Meier figure (if applicable)
- Forest plot (if applicable)

For each TLF, provide:
1. type: "table", "listing", or "figure"
2. number: e.g., "14.1.1", "14.2.1", "16.1.1"
3. title: descriptive title
4. population: analysis population
5. footnotes: array of footnote strings
6. columns: array of column definitions {name, label, width}
7. rows: array of row templates {label, cells}
8. programmingSpec: brief programming specification

Return JSON with key "tlfs" containing an array of TLF shell objects.`,
        },
        {
          role: 'user',
          content: `Generate TLF shells for this trial:
Indication: ${protocol?.indication || 'Not specified'}
Phase: ${protocol?.phase || 'Not specified'}
Primary Endpoint: ${protocol?.primaryEndpoint || 'Not specified'}
Secondary Endpoints: ${protocol?.secondaryEndpoints?.join(', ') || 'Not specified'}
Sample Size: ${protocol?.sampleSize || 'Not specified'}

Analysis Specifications: ${JSON.stringify(analysisSpecSnapshot?.specifications || [], null, 2).substring(0, 2000)}

SAP Summary: ${(sapSnapshot?.content || '').substring(0, 2000)}`,
        },
      ],
      { jsonMode: true, temperature: 0.2 }
    );

    let tlfPayload: {
      tlfs: Array<{
        type: string;
        number: string;
        title: string;
        population: string;
        footnotes: string[];
        columns: any[];
        rows: any[];
        programmingSpec: string;
      }>;
    };

    try {
      tlfPayload = JSON.parse(tlfContent || '{"tlfs":[]}');
    } catch {
      tlfPayload = { tlfs: [] };
    }

    // Store each TLF shell
    const createdShells: TlfShell[] = [];
    for (const tlf of tlfPayload.tlfs) {
      const [shell] = await db
        .insert(tlfShells)
        .values({
          threadId,
          type: tlf.type,
          number: tlf.number,
          title: tlf.title,
          population: tlf.population,
          footnotes: tlf.footnotes,
          columns: tlf.columns,
          rows: tlf.rows,
          programmingSpec: tlf.programmingSpec,
          version: 1,
          organizationId,
        })
        .returning();
      createdShells.push(shell);
    }

    // Store snapshot in thread
    await db
      .update(statisticalThreads)
      .set({
        tlfSnapshot: {
          shells: tlfPayload.tlfs,
          generatedAt: new Date().toISOString(),
          count: createdShells.length,
        },
        updatedAt: new Date(),
      })
      .where(eq(statisticalThreads.id, threadId));

    return {
      threadId,
      shells: createdShells,
      count: createdShells.length,
    };
  }

  /**
   * Ingests actual trial results and stores them in the thread.
   */
  async ingestResults(
    threadId: number,
    resultsData: ResultsData,
    organizationId: number
  ): Promise<StatisticalThread> {
    // Verify thread exists
    const [thread] = await db
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    // Store results snapshot
    const [updated] = await db
      .update(statisticalThreads)
      .set({
        resultsSnapshot: {
          ...resultsData,
          ingestedAt: new Date().toISOString(),
        },
        status: 'results_ingested',
        updatedAt: new Date(),
      })
      .where(eq(statisticalThreads.id, threadId))
      .returning();

    return updated;
  }

  /**
   * Generates statistical sections for CSR based on results + SAP.
   */
  async generateCSRSections(
    threadId: number,
    organizationId: number
  ): Promise<CSRSectionResult> {
    // Retrieve thread with all snapshots
    const [thread] = await db
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    const protocol = thread.protocolSnapshot as ProtocolData;
    const sapSnapshot = thread.sapSnapshot as { content?: string } | null;
    const resultsSnapshot = thread.resultsSnapshot as ResultsData | null;

    if (!resultsSnapshot) {
      throw new Error(`Thread ${threadId} has no results data. Ingest results first.`);
    }

    // Use AI to generate CSR statistical sections
    const csrContent = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a senior biostatistician writing the statistical sections of an ICH E3 compliant Clinical Study Report.
Generate the following sections:
1. "11.1_statistical_methods" - Description of statistical methods used
2. "11.2_analysis_populations" - Definition of analysis populations
3. "11.3_demographics_baseline" - Demographics and baseline characteristics analysis
4. "11.4_primary_efficacy" - Primary efficacy endpoint analysis with results
5. "11.5_secondary_efficacy" - Secondary efficacy endpoints analysis
6. "12.1_adverse_events" - Safety results: adverse events analysis
7. "12.2_clinical_laboratory" - Laboratory evaluation summary

Use ICH E3 guideline structure. Include actual numbers from the results data.
Return JSON with key "sections" as an object mapping section IDs to content strings.`,
        },
        {
          role: 'user',
          content: `Generate CSR statistical sections for:
Protocol: ${JSON.stringify(protocol || {}, null, 2).substring(0, 1500)}
SAP: ${(sapSnapshot?.content || '').substring(0, 2000)}
Results: ${JSON.stringify(resultsSnapshot, null, 2).substring(0, 2000)}`,
        },
      ],
      { jsonMode: true, temperature: 0.2 }
    );

    let sectionsPayload: { sections: Record<string, string> };
    try {
      sectionsPayload = JSON.parse(csrContent || '{"sections":{}}');
    } catch {
      sectionsPayload = { sections: {} };
    }

    // Store CSR sections snapshot
    const now = new Date();
    await db
      .update(statisticalThreads)
      .set({
        csrSectionsSnapshot: {
          sections: sectionsPayload.sections,
          generatedAt: now.toISOString(),
          sectionCount: Object.keys(sectionsPayload.sections).length,
        },
        status: 'csr_generated',
        updatedAt: now,
      })
      .where(eq(statisticalThreads.id, threadId));

    return {
      threadId,
      sections: sectionsPayload.sections,
      updatedAt: now,
    };
  }

  /**
   * Retrieve a full thread with all snapshots, analysis specs, and TLF shells.
   */
  async getThread(
    threadId: number,
    organizationId: number
  ): Promise<ThreadWithSnapshots> {
    const [thread] = await db
      .select()
      .from(statisticalThreads)
      .where(
        and(
          eq(statisticalThreads.id, threadId),
          eq(statisticalThreads.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!thread) {
      throw new Error(`Statistical thread ${threadId} not found`);
    }

    // Fetch associated analysis specifications
    const specs = await db
      .select()
      .from(analysisSpecifications)
      .where(
        and(
          eq(analysisSpecifications.threadId, threadId),
          eq(analysisSpecifications.organizationId, organizationId)
        )
      )
      .orderBy(desc(analysisSpecifications.createdAt));

    // Fetch associated TLF shells
    const shells = await db
      .select()
      .from(tlfShells)
      .where(
        and(
          eq(tlfShells.threadId, threadId),
          eq(tlfShells.organizationId, organizationId)
        )
      )
      .orderBy(desc(tlfShells.createdAt));

    return {
      ...thread,
      analysisSpecs: specs,
      tlfShellsList: shells,
    };
  }

  /**
   * List all statistical threads for an organization.
   */
  async listThreads(organizationId: number): Promise<StatisticalThread[]> {
    const threads = await db
      .select()
      .from(statisticalThreads)
      .where(eq(statisticalThreads.organizationId, organizationId))
      .orderBy(desc(statisticalThreads.createdAt));

    return threads;
  }
}

export default new StatisticalContinuumService();
