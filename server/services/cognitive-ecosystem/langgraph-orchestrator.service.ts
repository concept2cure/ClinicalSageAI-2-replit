/**
 * =============================================================================
 * LangGraph Orchestrator
 * =============================================================================
 * Enterprise workflow orchestration using LangGraph patterns with
 * persistent checkpointing, HITL breakpoints, and governance controls.
 * 
 * Features:
 * - Graph-based workflow definitions
 * - Node execution with state management
 * - Conditional edge routing
 * - HITL interruption and resumption
 * - Governance validation
 * - Execution tracing and audit
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentType,
  BreakpointType,
  AuditSeverity,
  SemanticCategory,
  ReasoningType,
  ServiceResult,
  AgentDefinition,
  Checkpoint,
  HITLBreakpoint,
  ReasoningTrace
} from './types';
import { CheckpointManager } from './checkpoint-manager.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { CognitiveAuditService } from './cognitive-audit.service';

// ===========================================================================
// LANGGRAPH TYPES
// ===========================================================================

export interface GraphNode {
  id: string;
  name: string;
  nodeType: 'action' | 'decision' | 'hitl' | 'subgraph' | 'start' | 'end';
  handler?: string; // Function name or agent ID
  config?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: string; // Condition expression for conditional edges
  label?: string;
}

export interface GraphDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryNodeId: string;
  metadata?: Record<string, unknown>;
}

export interface GraphState {
  currentNodeId: string;
  previousNodeId?: string;
  nodeHistory: string[];
  data: Record<string, unknown>;
  messages: Array<{ role: string; content: string }>;
  errors: Array<{ nodeId: string; error: string; timestamp: Date }>;
}

export interface ExecutionContext {
  threadId: string;
  checkpointId?: string;
  agentId?: string;
  userId?: string;
  tenantId: string;
  maxIterations?: number;
  timeout?: number;
}

export interface ExecutionResult {
  threadId: string;
  finalState: GraphState;
  status: 'completed' | 'interrupted' | 'failed' | 'timeout';
  nodesExecuted: number;
  executionTimeMs: number;
  interruptedAt?: string;
  error?: string;
}

export interface NodeHandler {
  (state: GraphState, context: ExecutionContext): Promise<GraphState>;
}

// ===========================================================================
// ORCHESTRATOR
// ===========================================================================

export interface LangGraphOrchestratorConfig {
  pool: Pool;
  tenantId: string;
}

export class LangGraphOrchestrator {
  private pool: Pool;
  private tenantId: string;
  private checkpointManager: CheckpointManager;
  private agentRuntime: AgentRuntimeService;
  private auditService: CognitiveAuditService;
  private graphs: Map<string, GraphDefinition> = new Map();
  private handlers: Map<string, NodeHandler> = new Map();

  constructor(config: LangGraphOrchestratorConfig) {
    this.pool = config.pool;
    this.tenantId = config.tenantId;
    
    this.checkpointManager = new CheckpointManager({ pool: config.pool });
    this.agentRuntime = new AgentRuntimeService({ pool: config.pool });
    this.auditService = new CognitiveAuditService({ pool: config.pool });

    // Register built-in handlers
    this.registerBuiltInHandlers();
  }

  // ===========================================================================
  // GRAPH MANAGEMENT
  // ===========================================================================

  /**
   * Register a graph definition
   */
  registerGraph(graph: GraphDefinition): void {
    this.validateGraph(graph);
    this.graphs.set(graph.id, graph);
  }

  /**
   * Get a registered graph
   */
  getGraph(graphId: string): GraphDefinition | undefined {
    return this.graphs.get(graphId);
  }

  /**
   * Validate graph structure
   */
  private validateGraph(graph: GraphDefinition): void {
    if (!graph.nodes || graph.nodes.length === 0) {
      throw new Error('Graph must have at least one node');
    }

    if (!graph.entryNodeId) {
      throw new Error('Graph must have an entry node');
    }

    const nodeIds = new Set(graph.nodes.map(n => n.id));
    
    if (!nodeIds.has(graph.entryNodeId)) {
      throw new Error('Entry node not found in graph');
    }

    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        throw new Error(`Edge source node ${edge.sourceNodeId} not found`);
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        throw new Error(`Edge target node ${edge.targetNodeId} not found`);
      }
    }

    // Verify at least one end node exists
    const hasEndNode = graph.nodes.some(n => n.nodeType === 'end');
    if (!hasEndNode) {
      throw new Error('Graph must have at least one end node');
    }
  }

  // ===========================================================================
  // HANDLER MANAGEMENT
  // ===========================================================================

  /**
   * Register a node handler
   */
  registerHandler(name: string, handler: NodeHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Register built-in handlers
   */
  private registerBuiltInHandlers(): void {
    // Start node - initializes state
    this.registerHandler('__start__', async (state) => state);

    // End node - marks completion
    this.registerHandler('__end__', async (state) => state);

    // Passthrough node
    this.registerHandler('__passthrough__', async (state) => state);

    // Message accumulator
    this.registerHandler('__accumulate_messages__', async (state, context) => {
      const newMessage = state.data._pendingMessage as { role: string; content: string } | undefined;
      if (newMessage) {
        state.messages.push(newMessage);
        delete state.data._pendingMessage;
      }
      return state;
    });

    // State merger
    this.registerHandler('__merge_state__', async (state, context) => {
      const updates = state.data._stateUpdates as Record<string, unknown> | undefined;
      if (updates) {
        state.data = { ...state.data, ...updates };
        delete state.data._stateUpdates;
      }
      return state;
    });

    // Governance check
    this.registerHandler('__governance_check__', async (state, context) => {
      if (context.agentId) {
        const result = await this.agentRuntime.validateGovernanceConstraints(
          context.threadId,
          state.currentNodeId
        );
        if (!result.success || !result.data?.allowed) {
          state.data._governanceViolation = result.data?.violations || ['Unknown violation'];
        }
      }
      return state;
    });

    // Audit logger
    this.registerHandler('__audit_log__', async (state, context) => {
      await this.auditService.logEvent({
        tenantId: context.tenantId,
        agentId: context.agentId,
        userId: context.userId,
        severity: AuditSeverity.INFO,
        semanticCategory: SemanticCategory.AGENT_DECISION,
        eventType: 'node_executed',
        eventSummary: `Node executed: ${state.currentNodeId}`,
        eventDetails: {
          currentNode: state.currentNodeId,
          messageCount: state.messages.length
        },
        affectedEntities: [
          {
            entityType: 'langgraph_execution',
            entityId: context.threadId,
            changeType: 'updated'
          }
        ]
      });
      return state;
    });
  }

  // ===========================================================================
  // GRAPH EXECUTION
  // ===========================================================================

  /**
   * Start a new graph execution
   */
  async startExecution(
    graphId: string,
    initialData: Record<string, unknown>,
    context: Omit<ExecutionContext, 'threadId'>
  ): Promise<ServiceResult<ExecutionResult>> {
    const startTime = Date.now();

    try {
      const graph = this.graphs.get(graphId);
      if (!graph) {
        return {
          success: false,
          error: { code: 'GRAPH_NOT_FOUND', message: `Graph ${graphId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Create thread
      const threadResult = await this.agentRuntime.createThread(
        context.agentId || '',
        context.tenantId,
        context.userId || 'system',
        { contextData: { graphId, graphVersion: graph.version } }
      );

      if (!threadResult.success) {
        return {
          success: false,
          error: threadResult.error,
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const thread = threadResult.data!;

      // Initialize state
      const initialState: GraphState = {
        currentNodeId: graph.entryNodeId,
        nodeHistory: [],
        data: initialData,
        messages: [],
        errors: []
      };

      // Execute graph
      const executionContext: ExecutionContext = {
        ...context,
        threadId: thread.id
      };

      const result = await this.executeGraph(graph, initialState, executionContext);

      return {
        success: true,
        data: result,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Resume execution from a checkpoint
   */
  async resumeExecution(
    checkpointId: string,
    additionalData?: Record<string, unknown>
  ): Promise<ServiceResult<ExecutionResult>> {
    const startTime = Date.now();

    try {
      // Get checkpoint
      const checkpoint = await this.checkpointManager.getTuple({
        configurable: { thread_id: '', checkpoint_id: checkpointId }
      });

      if (!checkpoint?.checkpoint) {
        return {
          success: false,
          error: { code: 'CHECKPOINT_NOT_FOUND', message: 'Checkpoint not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Get thread info
      const threadResult = await this.pool.query(
        `SELECT * FROM agent_runtime.threads WHERE id = $1`,
        [checkpoint.config.configurable.thread_id]
      );

      if (threadResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'THREAD_NOT_FOUND', message: 'Thread not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const thread = threadResult.rows[0];
      const graphId = thread.metadata?.graphId;
      
      const graph = this.graphs.get(graphId);
      if (!graph) {
        return {
          success: false,
          error: { code: 'GRAPH_NOT_FOUND', message: `Graph ${graphId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Restore state from checkpoint
      const state = checkpoint.checkpoint.channel_values as unknown as GraphState;
      
      // Merge additional data
      if (additionalData) {
        state.data = { ...state.data, ...additionalData };
      }

      // Create execution context
      const context: ExecutionContext = {
        threadId: checkpoint.config.configurable.thread_id,
        checkpointId,
        agentId: thread.agent_id,
        userId: thread.user_id,
        tenantId: thread.tenant_id
      };

      // Continue execution
      const result = await this.executeGraph(graph, state, context);

      return {
        success: true,
        data: result,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RESUME_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Execute graph from current state
   */
  private async executeGraph(
    graph: GraphDefinition,
    state: GraphState,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const maxIterations = context.maxIterations || 100;
    let iterations = 0;

    try {
      while (iterations < maxIterations) {
        iterations++;

        // Get current node
        const currentNode = graph.nodes.find(n => n.id === state.currentNodeId);
        if (!currentNode) {
          throw new Error(`Node ${state.currentNodeId} not found`);
        }

        // Check for HITL breakpoint
        if (currentNode.nodeType === 'hitl') {
          const breakpointResult = await this.createBreakpoint(context, state, currentNode);
          
          // Save checkpoint before interrupting
          await this.saveCheckpoint(context, state);
          
          return {
            threadId: context.threadId,
            finalState: state,
            status: 'interrupted',
            nodesExecuted: iterations,
            executionTimeMs: Date.now() - startTime,
            interruptedAt: currentNode.id
          };
        }

        // Check for end node
        if (currentNode.nodeType === 'end') {
          await this.saveCheckpoint(context, state);
          
          return {
            threadId: context.threadId,
            finalState: state,
            status: 'completed',
            nodesExecuted: iterations,
            executionTimeMs: Date.now() - startTime
          };
        }

        // Execute node
        state = await this.executeNode(currentNode, state, context);

        // Record in history
        state.nodeHistory.push(state.currentNodeId);
        state.previousNodeId = state.currentNodeId;

        // Determine next node
        const nextNodeId = await this.getNextNode(graph, currentNode, state);
        
        if (!nextNodeId) {
          throw new Error(`No outgoing edge from node ${currentNode.id}`);
        }

        state.currentNodeId = nextNodeId;

        // Periodic checkpoint
        if (iterations % 10 === 0) {
          await this.saveCheckpoint(context, state);
        }

        // Check timeout
        if (context.timeout && (Date.now() - startTime) > context.timeout) {
          await this.saveCheckpoint(context, state);
          
          return {
            threadId: context.threadId,
            finalState: state,
            status: 'timeout',
            nodesExecuted: iterations,
            executionTimeMs: Date.now() - startTime
          };
        }
      }

      // Max iterations reached
      await this.saveCheckpoint(context, state);
      
      return {
        threadId: context.threadId,
        finalState: state,
        status: 'failed',
        nodesExecuted: iterations,
        executionTimeMs: Date.now() - startTime,
        error: 'Maximum iterations reached'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      state.errors.push({
        nodeId: state.currentNodeId,
        error: errorMessage,
        timestamp: new Date()
      });

      await this.saveCheckpoint(context, state);

      return {
        threadId: context.threadId,
        finalState: state,
        status: 'failed',
        nodesExecuted: iterations,
        executionTimeMs: Date.now() - startTime,
        error: errorMessage
      };
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: GraphNode,
    state: GraphState,
    context: ExecutionContext
  ): Promise<GraphState> {
    const handlerName = node.handler || `__${node.nodeType}__`;
    const handler = this.handlers.get(handlerName);

    if (!handler) {
      // Try to execute as agent
      if (node.handler && this.isAgentHandler(node.handler)) {
        return this.executeAgentNode(node, state, context);
      }
      
      // Default passthrough
      return state;
    }

    // Record reasoning trace
    await this.agentRuntime.recordReasoningTrace(
      context.threadId,
      context.checkpointId || 'current',
      {
        stepNumber: state.nodeHistory.length + 1,
        reasoningType: ReasoningType.ANALYSIS,
        inputSummary: `Node ${node.id} (${node.name})`,
        thoughtProcess: `Executing handler for node "${node.name}" of type ${node.nodeType}`,
        outputSummary: '',
        confidenceScore: 1,
        referencedSources: []
      }
    );

    const result = await handler(state, context);

    return result;
  }

  /**
   * Check if handler is an agent reference
   */
  private isAgentHandler(handler: string): boolean {
    return handler.startsWith('agent:');
  }

  /**
   * Execute node using agent
   */
  private async executeAgentNode(
    node: GraphNode,
    state: GraphState,
    context: ExecutionContext
  ): Promise<GraphState> {
    const agentId = node.handler!.replace('agent:', '');
    
    // Get agent definition
    const agentResult = await this.agentRuntime.getAgentDefinition(agentId);
    if (!agentResult.success) {
      state.errors.push({
        nodeId: node.id,
        error: `Agent ${agentId} not found`,
        timestamp: new Date()
      });
      return state;
    }

    const agent = agentResult.data!;

    // Simulate agent execution (in production, would invoke actual LLM)
    const response = await this.simulateAgentExecution(agent, state, context);
    
    state.messages.push({
      role: 'assistant',
      content: response
    });

    return state;
  }

  /**
   * Simulate agent execution (placeholder for actual LLM integration)
   */
  private async simulateAgentExecution(
    agent: AgentDefinition,
    state: GraphState,
    context: ExecutionContext
  ): Promise<string> {
    // In production, this would call the actual LLM
    const lastMessage = state.messages[state.messages.length - 1];
    return `[${agent.displayName}] Processed: ${lastMessage?.content || 'No input message'}`;
  }

  /**
   * Determine next node based on edges and conditions
   */
  private async getNextNode(
    graph: GraphDefinition,
    currentNode: GraphNode,
    state: GraphState
  ): Promise<string | null> {
    // Get all outgoing edges
    const outgoingEdges = graph.edges.filter(e => e.sourceNodeId === currentNode.id);

    if (outgoingEdges.length === 0) {
      return null;
    }

    if (outgoingEdges.length === 1 && !outgoingEdges[0].condition) {
      return outgoingEdges[0].targetNodeId;
    }

    // Evaluate conditional edges
    for (const edge of outgoingEdges) {
      if (!edge.condition) {
        continue;
      }

      if (this.evaluateCondition(edge.condition, state)) {
        return edge.targetNodeId;
      }
    }

    // Return default edge (one without condition)
    const defaultEdge = outgoingEdges.find(e => !e.condition);
    return defaultEdge?.targetNodeId || null;
  }

  /**
   * Evaluate edge condition
   */
  private evaluateCondition(condition: string, state: GraphState): boolean {
    try {
      // Simple condition evaluation
      // Format: "field == value" or "field != value" or "field > value"
      
      const eqMatch = condition.match(/^(\S+)\s*==\s*['"]?([^'"]+)['"]?$/);
      if (eqMatch) {
        const [, field, value] = eqMatch;
        return String(this.getStateValue(state, field)) === value;
      }

      const neqMatch = condition.match(/^(\S+)\s*!=\s*['"]?([^'"]+)['"]?$/);
      if (neqMatch) {
        const [, field, value] = neqMatch;
        return String(this.getStateValue(state, field)) !== value;
      }

      const gtMatch = condition.match(/^(\S+)\s*>\s*(\d+)$/);
      if (gtMatch) {
        const [, field, value] = gtMatch;
        return Number(this.getStateValue(state, field)) > Number(value);
      }

      const ltMatch = condition.match(/^(\S+)\s*<\s*(\d+)$/);
      if (ltMatch) {
        const [, field, value] = ltMatch;
        return Number(this.getStateValue(state, field)) < Number(value);
      }

      // Boolean check
      const boolMatch = condition.match(/^(\S+)$/);
      if (boolMatch) {
        return Boolean(this.getStateValue(state, boolMatch[1]));
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get value from state using dot notation
   */
  private getStateValue(state: GraphState, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = state;

    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  // ===========================================================================
  // CHECKPOINTING
  // ===========================================================================

  /**
   * Save checkpoint
   */
  private async saveCheckpoint(context: ExecutionContext, state: GraphState): Promise<void> {
    const checkpointId = uuidv4();
    
    await this.checkpointManager.put(
      { configurable: { thread_id: context.threadId, checkpoint_id: checkpointId } },
      {
        v: 1,
        id: checkpointId,
        ts: new Date().toISOString(),
        channel_values: state as unknown as Record<string, unknown>,
        channel_versions: {},
        versions_seen: {},
        pending_sends: []
      },
      { source: 'langgraph_orchestrator', step: state.nodeHistory.length },
      {}
    );

    // Update context with new checkpoint ID
    (context as { checkpointId: string }).checkpointId = checkpointId;
  }

  /**
   * Create HITL breakpoint
   */
  private async createBreakpoint(
    context: ExecutionContext,
    state: GraphState,
    node: GraphNode
  ): Promise<void> {
    await this.agentRuntime.createHITLBreakpoint(
      context.threadId,
      context.checkpointId || 'pending',
      {
        breakpointType: BreakpointType.MANDATORY_REVIEW,
        triggerCondition:
          (node.config?.reason as string) || `HITL required at node: ${node.name}`,
        requiredRole: (node.config?.requiredRole as string) || undefined,
        contextSnapshot: state.data
      }
    );
  }

  // ===========================================================================
  // PREDEFINED GRAPHS
  // ===========================================================================

  /**
   * Create a simple linear workflow graph
   */
  createLinearGraph(
    id: string,
    name: string,
    nodeNames: string[]
  ): GraphDefinition {
    const nodes: GraphNode[] = [
      { id: 'start', name: 'Start', nodeType: 'start', handler: '__start__' },
      ...nodeNames.map((name, i) => ({
        id: `node_${i}`,
        name,
        nodeType: 'action' as const,
        handler: '__passthrough__'
      })),
      { id: 'end', name: 'End', nodeType: 'end', handler: '__end__' }
    ];

    const edges: GraphEdge[] = [];
    
    // Connect start to first node
    edges.push({ id: 'edge_start', sourceNodeId: 'start', targetNodeId: 'node_0' });
    
    // Connect nodes in sequence
    for (let i = 0; i < nodeNames.length - 1; i++) {
      edges.push({
        id: `edge_${i}`,
        sourceNodeId: `node_${i}`,
        targetNodeId: `node_${i + 1}`
      });
    }
    
    // Connect last node to end
    edges.push({
      id: 'edge_end',
      sourceNodeId: `node_${nodeNames.length - 1}`,
      targetNodeId: 'end'
    });

    return {
      id,
      name,
      version: '1.0.0',
      nodes,
      edges,
      entryNodeId: 'start'
    };
  }

  /**
   * Create a branching workflow graph
   */
  createBranchingGraph(
    id: string,
    name: string,
    conditionField: string,
    branches: Array<{ condition: string; nodeNames: string[] }>
  ): GraphDefinition {
    const nodes: GraphNode[] = [
      { id: 'start', name: 'Start', nodeType: 'start', handler: '__start__' },
      { id: 'decision', name: 'Decision', nodeType: 'decision', handler: '__passthrough__' },
      { id: 'end', name: 'End', nodeType: 'end', handler: '__end__' }
    ];

    const edges: GraphEdge[] = [
      { id: 'edge_start', sourceNodeId: 'start', targetNodeId: 'decision' }
    ];

    // Add branch nodes
    branches.forEach((branch, branchIdx) => {
      const branchNodes = branch.nodeNames.map((name, nodeIdx) => ({
        id: `branch_${branchIdx}_node_${nodeIdx}`,
        name,
        nodeType: 'action' as const,
        handler: '__passthrough__'
      }));

      nodes.push(...branchNodes);

      // Connect decision to first branch node
      edges.push({
        id: `edge_decision_${branchIdx}`,
        sourceNodeId: 'decision',
        targetNodeId: branchNodes[0].id,
        condition: `${conditionField} == '${branch.condition}'`
      });

      // Connect branch nodes in sequence
      for (let i = 0; i < branchNodes.length - 1; i++) {
        edges.push({
          id: `edge_branch_${branchIdx}_${i}`,
          sourceNodeId: branchNodes[i].id,
          targetNodeId: branchNodes[i + 1].id
        });
      }

      // Connect last branch node to end
      edges.push({
        id: `edge_branch_${branchIdx}_end`,
        sourceNodeId: branchNodes[branchNodes.length - 1].id,
        targetNodeId: 'end'
      });
    });

    return {
      id,
      name,
      version: '1.0.0',
      nodes,
      edges,
      entryNodeId: 'start'
    };
  }

  /**
   * Create an HITL approval workflow
   */
  createApprovalWorkflow(
    id: string,
    name: string,
    preApprovalNodes: string[],
    postApprovalNodes: string[],
    approvers: string[]
  ): GraphDefinition {
    const nodes: GraphNode[] = [
      { id: 'start', name: 'Start', nodeType: 'start', handler: '__start__' },
      ...preApprovalNodes.map((name, i) => ({
        id: `pre_${i}`,
        name,
        nodeType: 'action' as const,
        handler: '__passthrough__'
      })),
      { 
        id: 'approval', 
        name: 'Human Approval', 
        nodeType: 'hitl',
        config: { reason: 'Human approval required', approvers }
      },
      ...postApprovalNodes.map((name, i) => ({
        id: `post_${i}`,
        name,
        nodeType: 'action' as const,
        handler: '__passthrough__'
      })),
      { id: 'end', name: 'End', nodeType: 'end', handler: '__end__' }
    ];

    const edges: GraphEdge[] = [];

    // Connect start to first pre-approval node
    if (preApprovalNodes.length > 0) {
      edges.push({ id: 'edge_start', sourceNodeId: 'start', targetNodeId: 'pre_0' });
      
      for (let i = 0; i < preApprovalNodes.length - 1; i++) {
        edges.push({ id: `edge_pre_${i}`, sourceNodeId: `pre_${i}`, targetNodeId: `pre_${i + 1}` });
      }
      
      edges.push({ 
        id: 'edge_to_approval', 
        sourceNodeId: `pre_${preApprovalNodes.length - 1}`, 
        targetNodeId: 'approval' 
      });
    } else {
      edges.push({ id: 'edge_start', sourceNodeId: 'start', targetNodeId: 'approval' });
    }

    // Connect approval to post-approval nodes
    if (postApprovalNodes.length > 0) {
      edges.push({ id: 'edge_from_approval', sourceNodeId: 'approval', targetNodeId: 'post_0' });
      
      for (let i = 0; i < postApprovalNodes.length - 1; i++) {
        edges.push({ id: `edge_post_${i}`, sourceNodeId: `post_${i}`, targetNodeId: `post_${i + 1}` });
      }
      
      edges.push({ 
        id: 'edge_to_end', 
        sourceNodeId: `post_${postApprovalNodes.length - 1}`, 
        targetNodeId: 'end' 
      });
    } else {
      edges.push({ id: 'edge_to_end', sourceNodeId: 'approval', targetNodeId: 'end' });
    }

    return {
      id,
      name,
      version: '1.0.0',
      nodes,
      edges,
      entryNodeId: 'start'
    };
  }
}
