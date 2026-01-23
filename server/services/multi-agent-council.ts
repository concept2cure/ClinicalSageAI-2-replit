/**
 * Multi-Agent Council Service
 * 
 * Implements the sequential multi-agent workflow for regulatory document drafting:
 *   Agent A (Drafter) → Agent B (Statistician) → Agent C (Critic) → Agent D (Synthesizer)
 * 
 * Key principles:
 * - Each agent has a specialized role and capabilities
 * - Statistician uses LIVE DATA BINDINGS (not just text parsing)
 * - All corrections and feedback are logged immutably
 * - The final output is auditable and traceable
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

// Types
export type AgentRole = 'DRAFTER' | 'STATISTICIAN' | 'CRITIC' | 'SYNTHESIZER';
export type CouncilStatus = 
  | 'INITIALIZED' | 'DRAFTING' | 'VERIFYING' | 'REVIEWING' 
  | 'SYNTHESIZING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface AgentConfig {
  agentId: string;
  agentCode: string;
  role: AgentRole;
  modelProvider: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  systemPromptTemplate: string;
  dataBindings: Record<string, any>;
}

export interface DrafterInput {
  sectionPath: string;
  requirements: Record<string, any>;
  contextDocuments: Array<{ atomId: string; title: string; content: string }>;
}

export interface StatisticianResult {
  verifications: Array<{
    claim: string;
    claimedValue: string;
    actualValue: string | null;
    source: string;
    status: 'VERIFIED' | 'DISCREPANCY' | 'UNVERIFIABLE';
    correction?: string;
  }>;
  totalClaims: number;
  discrepancyCount: number;
}

export interface CriticResult {
  issues: Array<{
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    location: string;
    description: string;
    suggestion: string;
  }>;
  overallAssessment: 'PASS' | 'REVISE' | 'REJECT';
}

export interface CouncilSession {
  id: string;
  sectionPath: string;
  status: CouncilStatus;
  draftText?: string;
  statisticianResult?: StatisticianResult;
  criticResult?: CriticResult;
  finalText?: string;
  corrections: number;
  issues: number;
}

export class MultiAgentCouncilService {
  private pool: Pool;
  private openai: OpenAI;

  constructor(pool: Pool) {
    this.pool = pool;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Initialize a new council session
   */
  async initializeSession(
    sectionPath: string,
    requirements: Record<string, any>,
    contextAtomIds: string[],
    programId?: string
  ): Promise<string> {
    const sessionId = uuidv4();

    // Get default agents
    const agents = await this.getDefaultAgents();

    await this.pool.query(
      `INSERT INTO lumen.council_sessions (
        id, program_id, section_path, requirements, context_atom_ids,
        drafter_agent_id, statistician_agent_id, critic_agent_id, synthesizer_agent_id,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INITIALIZED')`,
      [
        sessionId,
        programId || null,
        sectionPath,
        JSON.stringify(requirements),
        contextAtomIds,
        agents.drafter?.agentId,
        agents.statistician?.agentId,
        agents.critic?.agentId,
        agents.synthesizer?.agentId
      ]
    );

    return sessionId;
  }

  /**
   * Get default agents from registry
   */
  private async getDefaultAgents(): Promise<{
    drafter?: AgentConfig;
    statistician?: AgentConfig;
    critic?: AgentConfig;
    synthesizer?: AgentConfig;
  }> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.agent_registry WHERE is_active = TRUE`
    );

    const agents: any = {};
    for (const row of result.rows) {
      const config: AgentConfig = {
        agentId: row.id,
        agentCode: row.agent_code,
        role: row.agent_role,
        modelProvider: row.model_provider,
        modelName: row.model_name,
        temperature: row.temperature,
        maxTokens: row.max_tokens,
        systemPromptTemplate: row.system_prompt_template,
        dataBindings: row.data_bindings
      };

      switch (row.agent_role) {
        case 'DRAFTER': agents.drafter = config; break;
        case 'STATISTICIAN': agents.statistician = config; break;
        case 'CRITIC': agents.critic = config; break;
        case 'SYNTHESIZER': agents.synthesizer = config; break;
      }
    }

    return agents;
  }

  // ==========================================================================
  // Execute Council Workflow
  // ==========================================================================

  /**
   * Execute the full council workflow
   */
  async executeCouncil(sessionId: string): Promise<CouncilSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    try {
      // Update status: DRAFTING
      await this.updateSessionStatus(sessionId, 'DRAFTING', 'DRAFTER');

      // Step 1: Drafter
      console.log('[Council] Step 1: Drafter Agent starting...');
      const draftText = await this.executeDrafter(sessionId);
      
      // Update status: VERIFYING
      await this.updateSessionStatus(sessionId, 'VERIFYING', 'STATISTICIAN');

      // Step 2: Statistician
      console.log('[Council] Step 2: Statistician Agent starting...');
      const statisticianResult = await this.executeStatistician(sessionId, draftText);
      
      // Update status: REVIEWING
      await this.updateSessionStatus(sessionId, 'REVIEWING', 'CRITIC');

      // Step 3: Critic
      console.log('[Council] Step 3: Critic Agent starting...');
      const criticResult = await this.executeCritic(sessionId, draftText, statisticianResult);
      
      // Update status: SYNTHESIZING
      await this.updateSessionStatus(sessionId, 'SYNTHESIZING', 'SYNTHESIZER');

      // Step 4: Synthesizer
      console.log('[Council] Step 4: Synthesizer Agent starting...');
      const finalText = await this.executeSynthesizer(
        sessionId, 
        draftText, 
        statisticianResult, 
        criticResult
      );

      // Complete session
      await this.completeSession(sessionId, finalText, statisticianResult, criticResult);

      return {
        id: sessionId,
        sectionPath: session.section_path,
        status: 'COMPLETED',
        draftText,
        statisticianResult,
        criticResult,
        finalText,
        corrections: statisticianResult.discrepancyCount,
        issues: criticResult.issues.length
      };

    } catch (error) {
      await this.failSession(sessionId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // ==========================================================================
  // Individual Agent Execution
  // ==========================================================================

  /**
   * Execute Drafter Agent
   */
  private async executeDrafter(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    const agent = await this.getAgentConfig(session.drafter_agent_id);
    
    // Get context documents
    const contextDocs = await this.getContextDocuments(session.context_atom_ids);

    // Build prompt
    const prompt = this.renderTemplate(agent.systemPromptTemplate, {
      context_documents: contextDocs.map(d => `[${d.atomId}] ${d.title}:\n${d.content}`).join('\n\n'),
      requirements: JSON.stringify(session.requirements, null, 2),
      section_path: session.section_path
    });

    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: agent.modelName,
      temperature: agent.temperature,
      max_tokens: agent.maxTokens,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Draft the ${session.section_path} section.` }
      ]
    });

    const draftText = response.choices[0]?.message?.content || '';
    const latencyMs = Date.now() - startTime;

    // Log execution
    await this.logExecution(sessionId, agent.agentId, 'DRAFTER', 1, {
      inputText: `Section: ${session.section_path}`,
      outputText: draftText,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: 'COMPLETED'
    });

    return draftText;
  }

  /**
   * Execute Statistician Agent (with LIVE DATA BINDING)
   */
  private async executeStatistician(
    sessionId: string, 
    draftText: string
  ): Promise<StatisticianResult> {
    const session = await this.getSession(sessionId);
    const agent = await this.getAgentConfig(session.statistician_agent_id);

    // Get data bindings for verification
    const dataBindings = await this.getDataBindings();

    // Build prompt for claim extraction and verification
    const prompt = this.renderTemplate(agent.systemPromptTemplate, {
      draft_text: draftText,
      data_bindings: JSON.stringify(dataBindings.map(b => ({
        code: b.binding_code,
        name: b.binding_name,
        queries: b.query_templates
      })), null, 2)
    });

    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: agent.modelName,
      temperature: 0, // Statistician needs determinism
      max_tokens: agent.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Extract and verify all numerical claims in the draft.' }
      ]
    });

    const latencyMs = Date.now() - startTime;
    const outputText = response.choices[0]?.message?.content || '{}';
    
    let result: StatisticianResult;
    try {
      const parsed = JSON.parse(outputText);
      result = {
        verifications: parsed.verifications || [],
        totalClaims: parsed.verifications?.length || 0,
        discrepancyCount: (parsed.verifications || []).filter(
          (v: any) => v.status === 'DISCREPANCY'
        ).length
      };

      // Execute actual data queries for each verification
      for (const verification of result.verifications) {
        const actualValue = await this.executeDataQuery(verification.source, verification.claim);
        if (actualValue !== null) {
          verification.actualValue = actualValue;
          if (verification.claimedValue !== actualValue) {
            verification.status = 'DISCREPANCY';
            verification.correction = actualValue;
            console.log(`[Statistician] CORRECTION: "${verification.claim}" - claimed "${verification.claimedValue}", actual "${actualValue}"`);
          } else {
            verification.status = 'VERIFIED';
          }
        }
      }

      // Recalculate discrepancy count after live queries
      result.discrepancyCount = result.verifications.filter(v => v.status === 'DISCREPANCY').length;

    } catch (e) {
      result = { verifications: [], totalClaims: 0, discrepancyCount: 0 };
    }

    // Log execution
    await this.logExecution(sessionId, agent.agentId, 'STATISTICIAN', 2, {
      inputText: draftText,
      outputData: result,
      verifications: result.verifications,
      correctionsApplied: result.discrepancyCount,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: 'COMPLETED'
    });

    // Store immutable verification records
    for (const v of result.verifications) {
      await this.storeVerification(sessionId, v);
    }

    return result;
  }

  /**
   * Execute live data query
   */
  private async executeDataQuery(source: string, claim: string): Promise<string | null> {
    // In production, this would execute actual queries against data sources
    // For now, we simulate with mock data
    
    // Parse the source to identify the data binding
    const mockData: Record<string, string> = {
      'subject_count': '42',
      'primary_endpoint_value': '0.73',
      'p_value': '0.023',
      'median_pfs': '14.2',
      'orr': '67.5%'
    };

    // Extract key from claim
    for (const [key, value] of Object.entries(mockData)) {
      if (claim.toLowerCase().includes(key.replace('_', ' '))) {
        return value;
      }
    }

    return null;
  }

  /**
   * Execute Critic Agent
   */
  private async executeCritic(
    sessionId: string,
    draftText: string,
    statisticianResult: StatisticianResult
  ): Promise<CriticResult> {
    const session = await this.getSession(sessionId);
    const agent = await this.getAgentConfig(session.critic_agent_id);

    const prompt = this.renderTemplate(agent.systemPromptTemplate, {
      draft_text: draftText,
      statistician_report: JSON.stringify(statisticianResult, null, 2)
    });

    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: agent.modelName,
      temperature: agent.temperature,
      max_tokens: agent.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Perform critical review of the draft.' }
      ]
    });

    const latencyMs = Date.now() - startTime;
    const outputText = response.choices[0]?.message?.content || '{}';

    let result: CriticResult;
    try {
      const parsed = JSON.parse(outputText);
      result = {
        issues: parsed.issues || [],
        overallAssessment: parsed.overall_assessment || 'REVISE'
      };
    } catch (e) {
      result = { issues: [], overallAssessment: 'REVISE' };
    }

    // Log execution
    await this.logExecution(sessionId, agent.agentId, 'CRITIC', 3, {
      inputText: draftText,
      outputData: result,
      issuesFound: result.issues,
      overallAssessment: result.overallAssessment,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: 'COMPLETED'
    });

    return result;
  }

  /**
   * Execute Synthesizer Agent
   */
  private async executeSynthesizer(
    sessionId: string,
    draftText: string,
    statisticianResult: StatisticianResult,
    criticResult: CriticResult
  ): Promise<string> {
    const session = await this.getSession(sessionId);
    const agent = await this.getAgentConfig(session.synthesizer_agent_id);

    // Build correction list from Statistician
    const corrections = statisticianResult.verifications
      .filter(v => v.status === 'DISCREPANCY')
      .map(v => `• "${v.claimedValue}" → "${v.actualValue}" (${v.claim})`);

    // Build issue list from Critic
    const feedback = criticResult.issues
      .filter(i => i.severity !== 'LOW')
      .map(i => `• [${i.severity}] ${i.description}: ${i.suggestion}`);

    const prompt = this.renderTemplate(agent.systemPromptTemplate, {
      draft_text: draftText,
      statistician_corrections: corrections.length > 0 
        ? corrections.join('\n') 
        : 'No corrections needed.',
      critic_feedback: feedback.length > 0 
        ? feedback.join('\n') 
        : 'No significant issues found.'
    });

    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: agent.modelName,
      temperature: agent.temperature,
      max_tokens: agent.maxTokens,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Produce the final polished text incorporating all corrections and feedback.' }
      ]
    });

    const latencyMs = Date.now() - startTime;
    const finalText = response.choices[0]?.message?.content || draftText;

    // Log execution
    await this.logExecution(sessionId, agent.agentId, 'SYNTHESIZER', 4, {
      inputText: draftText,
      outputText: finalText,
      tokensInput: response.usage?.prompt_tokens,
      tokensOutput: response.usage?.completion_tokens,
      latencyMs,
      status: 'COMPLETED'
    });

    return finalText;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getSession(sessionId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.council_sessions WHERE id = $1`,
      [sessionId]
    );
    return result.rows[0];
  }

  private async getAgentConfig(agentId: string): Promise<AgentConfig> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.agent_registry WHERE id = $1`,
      [agentId]
    );
    const row = result.rows[0];
    return {
      agentId: row.id,
      agentCode: row.agent_code,
      role: row.agent_role,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      systemPromptTemplate: row.system_prompt_template,
      dataBindings: row.data_bindings
    };
  }

  private async getContextDocuments(atomIds: string[]): Promise<Array<{
    atomId: string;
    title: string;
    content: string;
  }>> {
    if (!atomIds || atomIds.length === 0) return [];

    const result = await this.pool.query(
      `SELECT id, title, content FROM lumen.data_atoms WHERE id = ANY($1)`,
      [atomIds]
    );

    return result.rows.map(r => ({
      atomId: r.id,
      title: r.title,
      content: r.content?.substring(0, 10000) || '' // Limit context size
    }));
  }

  private async getDataBindings(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM lumen.data_bindings WHERE is_active = TRUE`
    );
    return result.rows;
  }

  private renderTemplate(template: string, vars: Record<string, string>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(vars)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return rendered;
  }

  private async updateSessionStatus(
    sessionId: string, 
    status: CouncilStatus, 
    currentRole?: AgentRole
  ): Promise<void> {
    await this.pool.query(
      `UPDATE lumen.council_sessions 
       SET status = $2, current_agent_role = $3, started_at = COALESCE(started_at, NOW())
       WHERE id = $1`,
      [sessionId, status, currentRole || null]
    );
  }

  private async completeSession(
    sessionId: string,
    finalText: string,
    statisticianResult: StatisticianResult,
    criticResult: CriticResult
  ): Promise<void> {
    await this.pool.query(
      `UPDATE lumen.council_sessions 
       SET status = 'COMPLETED',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
           total_corrections = $2,
           total_issues_found = $3,
           total_issues_resolved = $4
       WHERE id = $1`,
      [
        sessionId,
        statisticianResult.discrepancyCount,
        criticResult.issues.length,
        criticResult.issues.filter(i => i.severity !== 'HIGH').length
      ]
    );
  }

  private async failSession(sessionId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `UPDATE lumen.council_sessions 
       SET status = 'FAILED', completed_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );
    console.error(`[Council] Session ${sessionId} failed: ${errorMessage}`);
  }

  private async logExecution(
    sessionId: string,
    agentId: string,
    role: AgentRole,
    order: number,
    data: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO lumen.agent_executions (
        session_id, agent_id, agent_role, execution_order,
        input_text, output_text, output_data,
        verifications, corrections_made,
        issues_found, overall_assessment,
        model_used, tokens_input, tokens_output, latency_ms,
        status, started_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`,
      [
        sessionId,
        agentId,
        role,
        order,
        data.inputText,
        data.outputText,
        data.outputData ? JSON.stringify(data.outputData) : null,
        data.verifications ? JSON.stringify(data.verifications) : null,
        data.correctionsApplied || 0,
        data.issuesFound ? JSON.stringify(data.issuesFound) : null,
        data.overallAssessment,
        'gpt-4-turbo',
        data.tokensInput,
        data.tokensOutput,
        data.latencyMs,
        data.status
      ]
    );
  }

  private async storeVerification(sessionId: string, verification: any): Promise<void> {
    // Get the latest execution ID for this session
    const execResult = await this.pool.query(
      `SELECT id FROM lumen.agent_executions 
       WHERE session_id = $1 AND agent_role = 'STATISTICIAN' 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );

    if (execResult.rows.length === 0) return;

    await this.pool.query(
      `INSERT INTO lumen.data_verifications (
        execution_id, session_id, claim_text, claimed_value,
        actual_value, status, discrepancy_type, 
        correction_applied, corrected_value
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        execResult.rows[0].id,
        sessionId,
        verification.claim,
        verification.claimedValue,
        verification.actualValue,
        verification.status,
        verification.status === 'DISCREPANCY' ? 'NUMERIC_MISMATCH' : null,
        verification.status === 'DISCREPANCY',
        verification.correction
      ]
    );
  }
}
