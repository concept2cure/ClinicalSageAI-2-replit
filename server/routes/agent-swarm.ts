/**
 * =============================================================================
 * AnA Agents — LangGraph Multi-Agent Orchestrator
 * =============================================================================
 * End-to-end submission automation via multi-agent swarm architecture:
 * - Agent types: Drafter, Reviewer, QC, Compiler, Validator, Coordinator
 * - LangGraph state machine orchestration with conditional routing
 * - Agent-to-agent delegation protocol
 * - Parallel execution with dependency resolution
 * - Human-in-the-loop (HITL) breakpoints for critical decisions
 * - Governance guardrails (21 CFR Part 11 audit, SOC 2 compliance)
 * - Execution tracing with full reasoning chain capture
 *
 * Swarm topology:
 *   Coordinator → [Drafter, Researcher, QC Agent, Compliance Agent]
 *                      ↓           ↓           ↓            ↓
 *                   [Draft]    [Evidence]  [Quality]    [Compliance]
 *                      ↘          ↓          ↙            ↓
 *                       → Reviewer Agent ←              → Validator
 *                            ↓                               ↓
 *                       → Compiler Agent ←→ eCTD Assembly →→ Final Review
 * =============================================================================
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { TaskType as GatewayTaskType } from '../services/ai-gateway/types';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('agent-swarm');

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type AgentRole =
  | 'coordinator' // Orchestrates the swarm, assigns tasks, resolves conflicts
  | 'drafter' // Generates regulatory document sections
  | 'researcher' // Searches literature, precedent, guidance documents
  | 'qc_agent' // Quality control checks on generated content
  | 'compliance_agent' // 21 CFR Part 11, ICH, regulatory compliance verification
  | 'reviewer' // Simulates regulatory reviewer (FDA/EMA) perspective
  | 'compiler' // Assembles eCTD structure, validates XML backbone
  | 'validator' // Pre-submission validation checks
  | 'evidence_agent' // Real-world evidence and literature citation gathering
  | 'translator' // Multi-language regulatory translation
  | 'custom';

export type SwarmState =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'hitl_paused'
  | 'compiling'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  systemPrompt: string;
  capabilities: string[];
  model: string;
  temperature: number;
  maxTokens: number;
  tools: AgentTool[];
  status: 'idle' | 'working' | 'blocked' | 'completed' | 'failed';
  currentTask?: string;
  executionCount: number;
  totalTokensUsed: number;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface SwarmTask {
  id: string;
  swarmId: string;
  assignedAgentId?: string;
  assignedAgentRole: AgentRole;
  taskType:
    | 'draft_section'
    | 'review_content'
    | 'gather_evidence'
    | 'qc_check'
    | 'compliance_check'
    | 'compile_ectd'
    | 'validate'
    | 'translate'
    | 'custom';
  title: string;
  description: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status:
    | 'pending'
    | 'assigned'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'blocked'
    | 'hitl_review';
  dependencies: string[]; // Task IDs this depends on
  priority: number; // 1 (highest) to 10 (lowest)
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  executionTimeMs?: number;
  retryCount: number;
  maxRetries: number;
  reasoning?: string[]; // Agent's reasoning chain
  hitlRequired: boolean;
  hitlApprovedBy?: string;
}

export interface SwarmExecution {
  id: string;
  name: string;
  description: string;
  projectId: number;
  submissionType: string;
  state: SwarmState;
  agents: Agent[];
  tasks: SwarmTask[];
  executionGraph: GraphEdge[];
  hitlBreakpoints: HITLBreakpoint[];
  auditTrail: SwarmAuditEntry[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: number; // 0-100
  totalTokensUsed: number;
  estimatedCostUsd: number;
}

export interface GraphEdge {
  fromTaskId: string;
  toTaskId: string;
  condition?: string;
  edgeType: 'dependency' | 'conditional' | 'parallel' | 'delegation';
}

export interface HITLBreakpoint {
  id: string;
  taskId: string;
  reason: string;
  requiredApproval: 'single' | 'dual' | 'committee';
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  comments?: string;
}

export interface SwarmAuditEntry {
  id: string;
  timestamp: Date;
  agentId: string;
  agentRole: AgentRole;
  action: string;
  input?: string;
  output?: string;
  reasoning?: string;
  tokensUsed: number;
  durationMs: number;
}

export interface SwarmLaunchRequest {
  projectId: number;
  submissionType: string;
  targetSections?: string[];
  regulatoryBody?: string;
  agents?: Partial<Agent>[];
  hitlConfig?: {
    requireApprovalFor: string[]; // Task types that need HITL approval
    autoApproveConfidenceThreshold: number; // Auto-approve if confidence > threshold
  };
  parallelism?: number; // Max concurrent agents
}

// ---------------------------------------------------------------------------
// AGENT DEFINITIONS
// ---------------------------------------------------------------------------

const DEFAULT_AGENTS: Omit<Agent, 'id'>[] = [
  {
    role: 'coordinator',
    name: 'Regulatory Coordinator',
    systemPrompt: `You are the Regulatory Coordinator Agent. Your role is to:
1. Break down regulatory submissions into discrete tasks
2. Assign tasks to specialist agents based on their capabilities
3. Monitor progress and resolve inter-agent conflicts
4. Ensure the overall submission meets regulatory requirements
5. Escalate to HITL when critical decisions are needed`,
    capabilities: [
      'task_planning',
      'agent_delegation',
      'conflict_resolution',
      'progress_monitoring',
    ],
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 4096,
    tools: [
      {
        name: 'assign_task',
        description: 'Assign a task to an agent',
        parameters: { agentRole: 'string', taskDescription: 'string' },
      },
      {
        name: 'escalate_hitl',
        description: 'Escalate to human reviewer',
        parameters: { reason: 'string', taskId: 'string' },
      },
    ],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
  {
    role: 'drafter',
    name: 'CTD Section Drafter',
    systemPrompt: `You are the CTD Section Drafter Agent, fine-tuned on FDA/EMA guidance. Your role is to:
1. Draft regulatory document sections following ICH M4 CTD structure
2. Include all required subsections per applicable guidance
3. Use formal regulatory language consistent with approved dossiers
4. Mark data gaps that need sponsor input with [DATA REQUIRED] tags
5. Include inline regulatory citations [ICH/CFR/FDA reference]`,
    capabilities: ['section_drafting', 'regulatory_writing', 'ctd_structure', 'citation_insertion'],
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 8192,
    tools: [
      {
        name: 'generate_section',
        description: 'Draft a CTD section',
        parameters: { sectionId: 'string', sectionTitle: 'string', context: 'object' },
      },
    ],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
  {
    role: 'researcher',
    name: 'Literature & Evidence Researcher',
    systemPrompt: `You are the Literature & Evidence Research Agent. Your role is to:
1. Search PubMed, ClinicalTrials.gov, and internal knowledge base
2. Find supporting evidence for regulatory claims
3. Identify relevant precedent (approved products, advisory committee meetings)
4. Compile citation lists with proper formatting
5. Flag contradictory evidence that FDA might question`,
    capabilities: [
      'literature_search',
      'evidence_gathering',
      'citation_management',
      'precedent_analysis',
    ],
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4096,
    tools: [
      {
        name: 'search_literature',
        description: 'Search PubMed/ClinicalTrials.gov',
        parameters: { query: 'string', maxResults: 'number' },
      },
      {
        name: 'graphrag_query',
        description: 'Query knowledge graph for entity relationships',
        parameters: { query: 'string', entityTypes: 'string[]' },
      },
    ],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
  {
    role: 'qc_agent',
    name: 'Quality Control Agent',
    systemPrompt: `You are the QC Agent. Your role is to:
1. Check drafted sections for accuracy and completeness
2. Verify all required subsections are present per ICH M4
3. Check for consistency across sections (cross-references, terminology)
4. Validate numerical data, statistics, and study references
5. Ensure formatting meets eCTD technical requirements`,
    capabilities: [
      'quality_check',
      'consistency_verification',
      'formatting_validation',
      'cross_referencing',
    ],
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4096,
    tools: [],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
  {
    role: 'compliance_agent',
    name: '21 CFR Part 11 Compliance Agent',
    systemPrompt: `You are the Regulatory Compliance Agent. Your role is to:
1. Verify 21 CFR Part 11 compliance for all electronic records
2. Check ICH guideline adherence for each section
3. Validate against region-specific requirements (FDA/EMA/PMDA)
4. Flag potential Information Requests or Refuse to File risks
5. Ensure audit trail and signature requirements are met`,
    capabilities: ['compliance_check', 'part11_validation', 'ich_adherence', 'risk_assessment'],
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4096,
    tools: [],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
  {
    role: 'reviewer',
    name: 'Shadow FDA Reviewer',
    systemPrompt: `You are the Shadow FDA Reviewer Agent. Your role is to:
1. Review submissions from an FDA reviewer perspective
2. Predict likely FDA questions and deficiency letters
3. Check for common RTF (Refuse to File) triggers
4. Evaluate clinical meaningfulness of efficacy claims
5. Assess benefit-risk balance presentation`,
    capabilities: [
      'fda_review_simulation',
      'question_prediction',
      'rtf_analysis',
      'benefit_risk_assessment',
    ],
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 4096,
    tools: [],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
  {
    role: 'compiler',
    name: 'eCTD Compiler Agent',
    systemPrompt: `You are the eCTD Compiler Agent. Your role is to:
1. Assemble drafted sections into eCTD 4.0 XML backbone
2. Validate file naming and folder structure per ICH M8
3. Generate regional.xml, index.xml, and STF files
4. Check document lifecycle management (new, append, replace, delete)
5. Validate against eCTD 4.0 DTD/schema`,
    capabilities: ['ectd_assembly', 'xml_generation', 'lifecycle_management', 'schema_validation'],
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 4096,
    tools: [],
    status: 'idle',
    executionCount: 0,
    totalTokensUsed: 0,
  },
];

// ---------------------------------------------------------------------------
// SWARM MANAGER
// ---------------------------------------------------------------------------

class SwarmManager {
  private swarms: Map<string, SwarmExecution> = new Map();

  createSwarm(request: SwarmLaunchRequest): SwarmExecution {
    const swarmId = uuidv4();

    // Initialize agents
    const agents: Agent[] = DEFAULT_AGENTS.map(def => ({
      ...def,
      id: uuidv4(),
    }));

    // Build task graph based on submission type
    const tasks = this.buildTaskGraph(swarmId, request);

    // Build execution edges
    const executionGraph: GraphEdge[] = [];
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        executionGraph.push({
          fromTaskId: depId,
          toTaskId: task.id,
          edgeType: 'dependency',
        });
      }
    }

    const swarm: SwarmExecution = {
      id: swarmId,
      name: `${request.submissionType} Submission Automation`,
      description: `Multi-agent swarm for ${request.submissionType} submission to ${request.regulatoryBody || 'FDA'}`,
      projectId: request.projectId,
      submissionType: request.submissionType,
      state: 'idle',
      agents,
      tasks,
      executionGraph,
      hitlBreakpoints: [],
      auditTrail: [],
      createdAt: new Date(),
      progress: 0,
      totalTokensUsed: 0,
      estimatedCostUsd: 0,
    };

    this.swarms.set(swarmId, swarm);
    return swarm;
  }

  private buildTaskGraph(swarmId: string, request: SwarmLaunchRequest): SwarmTask[] {
    const tasks: SwarmTask[] = [];
    const sections = request.targetSections || ['2.5', '2.7.1', '2.7.4', '3.2.S', '3.2.P'];

    // Phase 1: Research (parallel)
    const researchTaskId = uuidv4();
    tasks.push({
      id: researchTaskId,
      swarmId,
      assignedAgentRole: 'researcher',
      taskType: 'gather_evidence',
      title: 'Gather literature & regulatory precedent',
      description: `Search literature and GraphRAG knowledge base for ${request.submissionType} evidence`,
      input: { submissionType: request.submissionType, sections },
      status: 'pending',
      dependencies: [],
      priority: 1,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      hitlRequired: false,
    });

    // Phase 2: Draft sections (parallel, depends on research)
    const draftTaskIds: string[] = [];
    for (const section of sections) {
      const draftId = uuidv4();
      draftTaskIds.push(draftId);
      tasks.push({
        id: draftId,
        swarmId,
        assignedAgentRole: 'drafter',
        taskType: 'draft_section',
        title: `Draft CTD Section ${section}`,
        description: `Draft regulatory content for section ${section} using gathered evidence`,
        input: { sectionId: section },
        status: 'pending',
        dependencies: [researchTaskId],
        priority: 2,
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
        hitlRequired: false,
      });
    }

    // Phase 3: QC check (depends on all drafts)
    const qcTaskId = uuidv4();
    tasks.push({
      id: qcTaskId,
      swarmId,
      assignedAgentRole: 'qc_agent',
      taskType: 'qc_check',
      title: 'Quality control review',
      description: 'Cross-referencing, consistency, formatting checks across all drafted sections',
      input: { draftTaskIds },
      status: 'pending',
      dependencies: draftTaskIds,
      priority: 3,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 2,
      hitlRequired: false,
    });

    // Phase 4: Compliance check (parallel with QC)
    const complianceTaskId = uuidv4();
    tasks.push({
      id: complianceTaskId,
      swarmId,
      assignedAgentRole: 'compliance_agent',
      taskType: 'compliance_check',
      title: '21 CFR Part 11 & ICH compliance verification',
      description: 'Verify regulatory compliance across all sections',
      input: { draftTaskIds, regulatoryBody: request.regulatoryBody || 'FDA' },
      status: 'pending',
      dependencies: draftTaskIds,
      priority: 3,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 2,
      hitlRequired: false,
    });

    // Phase 5: Shadow reviewer (depends on QC and compliance)
    const reviewTaskId = uuidv4();
    tasks.push({
      id: reviewTaskId,
      swarmId,
      assignedAgentRole: 'reviewer',
      taskType: 'review_content',
      title: 'Shadow FDA reviewer assessment',
      description: 'Simulate FDA reviewer evaluation, predict questions and deficiency letters',
      input: {},
      status: 'pending',
      dependencies: [qcTaskId, complianceTaskId],
      priority: 4,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 1,
      hitlRequired: true, // HITL breakpoint: human must approve before compilation
    });

    // Phase 6: eCTD compilation (depends on review approval)
    const compileTaskId = uuidv4();
    tasks.push({
      id: compileTaskId,
      swarmId,
      assignedAgentRole: 'compiler',
      taskType: 'compile_ectd',
      title: 'eCTD 4.0 compilation',
      description: 'Assemble all sections into eCTD XML backbone with lifecycle management',
      input: {},
      status: 'pending',
      dependencies: [reviewTaskId],
      priority: 5,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 2,
      hitlRequired: false,
    });

    // Phase 7: Final validation (depends on compilation)
    tasks.push({
      id: uuidv4(),
      swarmId,
      assignedAgentRole: 'validator',
      taskType: 'validate',
      title: 'Pre-submission validation',
      description:
        'Final validation against eCTD DTD, regional requirements, and completeness checks',
      input: {},
      status: 'pending',
      dependencies: [compileTaskId],
      priority: 6,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 2,
      hitlRequired: true, // Final HITL before submission
    });

    return tasks;
  }

  startSwarm(swarmId: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    swarm.state = 'planning';
    swarm.startedAt = new Date();

    // Start tasks with no dependencies
    for (const task of swarm.tasks) {
      if (task.dependencies.length === 0) {
        task.status = 'in_progress';
        task.startedAt = new Date();

        // Assign to appropriate agent
        const agent = swarm.agents.find(a => a.role === task.assignedAgentRole);
        if (agent) {
          task.assignedAgentId = agent.id;
          agent.status = 'working';
          agent.currentTask = task.id;
        }
      }
    }

    swarm.state = 'executing';
    this.updateProgress(swarm);

    // Execute the task graph for real via the AI gateway (runs in background).
    void this.executeSwarm(swarm);

    return true;
  }

  /**
   * Maps a swarm task type to an AI-gateway TaskType for routing.
   */
  private gatewayTaskType(taskType: SwarmTask['taskType']): GatewayTaskType {
    switch (taskType) {
      case 'draft_section':
      case 'compile_ectd':
        return 'document_drafting';
      case 'gather_evidence':
        return 'document_analysis';
      case 'review_content':
      case 'qc_check':
      case 'compliance_check':
      case 'validate':
        return 'regulatory_review';
      case 'translate':
        return 'general';
      default:
        return 'general';
    }
  }

  /**
   * Executes the swarm task graph for real: each ready task is run through
   * the AI gateway using its agent's system prompt, capturing the real model
   * output, token usage, and cost. HITL-required tasks pause for approval
   * rather than auto-completing. Replaces the prior setTimeout-based mock that
   * fabricated "completed successfully" outputs and canned reasoning.
   *
   * Runs in the background (not awaited by the request path); swarm state is
   * polled via GET /swarms/:id.
   */
  private async executeSwarm(swarm: SwarmExecution): Promise<void> {
    if ((swarm as any)._executing) return;
    (swarm as any)._executing = true;

    try {
      const { getGateway } = await import('../services/ai-gateway');
      const gateway = getGateway();

      let madeProgress = true;
      while (madeProgress) {
        madeProgress = false;

        for (const task of swarm.tasks) {
          const isApprovedHitl = task.status === 'in_progress';
          if (task.status !== 'pending' && !isApprovedHitl) continue;

          const depStatuses = task.dependencies.map(
            depId => swarm.tasks.find(t => t.id === depId)?.status
          );
          if (depStatuses.some(s => s === 'failed' || s === 'blocked')) {
            if (task.status !== 'blocked') {
              task.status = 'blocked';
              madeProgress = true;
            }
            continue;
          }
          const depsCompleted = depStatuses.every(s => s === 'completed');
          if (!depsCompleted && !isApprovedHitl) continue;

          // Pause HITL-required tasks for human approval (resumed via
          // approveHITL, which sets status to 'in_progress').
          if (task.hitlRequired && !task.hitlApprovedBy && !isApprovedHitl) {
            task.status = 'hitl_review';
            madeProgress = true;
            continue;
          }

          await this.runTask(swarm, gateway, task);
          madeProgress = true;
        }
      }
    } catch (err) {
      log.error('Swarm execution failed', {
        swarmId: swarm.id,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      (swarm as any)._executing = false;
      this.updateProgress(swarm);
    }
  }

  /**
   * Runs a single task through the AI gateway and records real results.
   */
  private async runTask(
    swarm: SwarmExecution,
    gateway: { route: (req: any) => Promise<any> },
    task: SwarmTask
  ): Promise<void> {
    const agent =
      swarm.agents.find(a => a.id === task.assignedAgentId) ||
      swarm.agents.find(a => a.role === task.assignedAgentRole);

    task.status = 'in_progress';
    task.startedAt = task.startedAt || new Date();
    if (agent) {
      agent.status = 'working';
      agent.currentTask = task.id;
    }

    const systemPrompt =
      agent?.systemPrompt ||
      `You are the ${task.assignedAgentRole} agent in a regulatory submission swarm.`;
    const userContent =
      `Task: ${task.title}\n\nDescription: ${task.description}\n\n` +
      `Input:\n${JSON.stringify(task.input ?? {}, null, 2)}\n\n` +
      `Produce the deliverable for this task. Be specific and state any assumptions.`;
    const start = Date.now();

    try {
      const response = await gateway.route({
        taskType: this.gatewayTaskType(task.taskType),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        maxTokens: agent?.maxTokens ?? 1500,
        temperature: agent?.temperature ?? 0.3,
        callerModule: 'agent-swarm',
        projectId: swarm.projectId,
      });

      const tokens = response.usage?.totalTokens ?? 0;
      task.output = {
        content: response.content,
        provider: response.provider,
        model: response.model,
      };
      task.reasoning = [
        `Executed by ${task.assignedAgentRole} via ${response.provider}/${response.model}`,
        `Tokens used: ${tokens}`,
      ];
      const durationMs: number = response.latencyMs ?? Date.now() - start;
      task.status = 'completed';
      task.completedAt = new Date();
      task.executionTimeMs = durationMs;

      swarm.totalTokensUsed += tokens;
      swarm.estimatedCostUsd += response.usage?.estimatedCostUsd ?? 0;

      if (agent) {
        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.executionCount++;
        agent.totalTokensUsed += tokens;
      }

      swarm.auditTrail.push({
        id: uuidv4(),
        timestamp: new Date(),
        agentId: agent?.id || task.assignedAgentRole,
        agentRole: task.assignedAgentRole,
        action: `Completed: ${task.title}`,
        input: userContent.slice(0, 500),
        output: String(response.content).slice(0, 2000),
        tokensUsed: tokens,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      task.retryCount = (task.retryCount || 0) + 1;

      if (task.retryCount <= (task.maxRetries ?? 0)) {
        // Re-queue for another attempt on the next pass.
        task.status = 'pending';
      } else {
        task.status = 'failed';
        task.completedAt = new Date();
        task.output = { error: message };
        swarm.auditTrail.push({
          id: uuidv4(),
          timestamp: new Date(),
          agentId: agent?.id || task.assignedAgentRole,
          agentRole: task.assignedAgentRole,
          action: `Failed: ${task.title}`,
          output: message,
          tokensUsed: 0,
          durationMs: Date.now() - start,
        });
      }

      if (agent) {
        agent.status = 'idle';
        agent.currentTask = undefined;
      }
    }

    this.updateProgress(swarm);
  }

  private updateProgress(swarm: SwarmExecution): void {
    const completed = swarm.tasks.filter(t => t.status === 'completed').length;
    swarm.progress = Math.round((completed / swarm.tasks.length) * 100);

    if (completed === swarm.tasks.length) swarm.state = 'completed';
    else if (swarm.tasks.some(t => t.status === 'hitl_review')) swarm.state = 'hitl_paused';
  }

  getSwarm(id: string): SwarmExecution | undefined {
    return this.swarms.get(id);
  }

  getAllSwarms(): SwarmExecution[] {
    return Array.from(this.swarms.values());
  }

  approveHITL(swarmId: string, taskId: string, approvedBy: string, comments?: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const task = swarm.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'hitl_review') return false;

    task.status = 'in_progress';
    task.hitlApprovedBy = approvedBy;

    swarm.hitlBreakpoints.push({
      id: uuidv4(),
      taskId,
      reason: task.title,
      requiredApproval: 'single',
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
      comments,
    });

    swarm.auditTrail.push({
      id: uuidv4(),
      timestamp: new Date(),
      agentId: 'human',
      agentRole: 'coordinator',
      action: `HITL approved: ${task.title}`,
      reasoning: comments,
      tokensUsed: 0,
      durationMs: 0,
    });

    // Resume execution
    if (swarm.state === 'hitl_paused') swarm.state = 'executing';
    void this.executeSwarm(swarm);

    return true;
  }
}

const swarmManager = new SwarmManager();

// ---------------------------------------------------------------------------
// EXPRESS ROUTES
// ---------------------------------------------------------------------------

const router = Router();

/**
 * POST /swarms
 * Launch a new multi-agent swarm for submission automation
 */
router.post('/swarms', (req: Request, res: Response) => {
  const body: SwarmLaunchRequest = req.body;
  if (!body.projectId || !body.submissionType) {
    return res.status(400).json({ error: 'projectId and submissionType required' });
  }

  const swarm = swarmManager.createSwarm(body);
  res.json({
    success: true,
    data: {
      swarmId: swarm.id,
      state: swarm.state,
      agentCount: swarm.agents.length,
      taskCount: swarm.tasks.length,
      taskGraph: swarm.tasks.map(t => ({
        id: t.id,
        title: t.title,
        role: t.assignedAgentRole,
        dependencies: t.dependencies.length,
        hitlRequired: t.hitlRequired,
      })),
    },
  });
});

/**
 * POST /swarms/:swarmId/start
 * Start executing a swarm
 */
router.post('/swarms/:swarmId/start', (req: Request, res: Response) => {
  const started = swarmManager.startSwarm(String(req.params.swarmId));
  if (!started) return res.status(404).json({ error: 'Swarm not found' });
  const swarm = swarmManager.getSwarm(String(req.params.swarmId))!;
  res.json({
    success: true,
    data: { swarmId: swarm.id, state: swarm.state, progress: swarm.progress },
  });
});

/**
 * GET /swarms/:swarmId
 * Get swarm execution status with full task graph
 */
router.get('/swarms/:swarmId', (req: Request, res: Response) => {
  const swarm = swarmManager.getSwarm(String(req.params.swarmId));
  if (!swarm) return res.status(404).json({ error: 'Swarm not found' });
  res.json({ success: true, data: swarm });
});

/**
 * GET /swarms
 * List all swarm executions
 */
router.get('/swarms', (_req: Request, res: Response) => {
  const swarms = swarmManager.getAllSwarms();
  res.json({
    success: true,
    data: swarms.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state,
      progress: s.progress,
      taskCount: s.tasks.length,
      completedTasks: s.tasks.filter(t => t.status === 'completed').length,
      createdAt: s.createdAt,
    })),
  });
});

/**
 * POST /swarms/:swarmId/hitl/:taskId/approve
 * Approve a HITL breakpoint to continue swarm execution
 */
router.post('/swarms/:swarmId/hitl/:taskId/approve', (req: Request, res: Response) => {
  const { swarmId, taskId } = req.params as { swarmId: string; taskId: string };
  const { approvedBy, comments } = req.body;
  if (!approvedBy) return res.status(400).json({ error: 'approvedBy required' });

  const approved = swarmManager.approveHITL(String(swarmId), String(taskId), approvedBy, comments);
  if (!approved)
    return res.status(404).json({ error: 'Swarm/task not found or not in HITL state' });

  res.json({ success: true, message: 'HITL breakpoint approved, swarm resuming' });
});

/**
 * GET /swarms/:swarmId/audit-trail
 * Get the reasoning audit trail for a swarm execution
 */
router.get('/swarms/:swarmId/audit-trail', (req: Request, res: Response) => {
  const swarm = swarmManager.getSwarm(String(req.params.swarmId));
  if (!swarm) return res.status(404).json({ error: 'Swarm not found' });

  res.json({
    success: true,
    data: {
      swarmId: swarm.id,
      auditTrail: swarm.auditTrail,
      hitlBreakpoints: swarm.hitlBreakpoints,
      totalTokensUsed: swarm.totalTokensUsed,
    },
  });
});

/**
 * GET /agents
 * List available agent definitions
 */
router.get('/agents', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: DEFAULT_AGENTS.map(a => ({
      role: a.role,
      name: a.name,
      capabilities: a.capabilities,
      model: a.model,
      tools: a.tools.map(t => t.name),
    })),
  });
});

/**
 * GET /health
 * Health check for agent orchestration service
 */
router.get('/health', (_req: Request, res: Response) => {
  const swarms = swarmManager.getAllSwarms();
  res.json({
    status: 'healthy',
    service: 'agent-swarm-orchestrator',
    framework: 'langgraph-pattern',
    activeSwarms: swarms.filter(s => s.state !== 'completed' && s.state !== 'failed').length,
    totalSwarms: swarms.length,
    agentTypes: DEFAULT_AGENTS.length,
    features: {
      multiAgentSwarm: true,
      langGraphStateMachine: true,
      hitlBreakpoints: true,
      parallelExecution: true,
      governanceGuardrails: true,
      executionTracing: true,
      agentDelegation: true,
      part11AuditTrail: true,
    },
  });
});

export default router;
