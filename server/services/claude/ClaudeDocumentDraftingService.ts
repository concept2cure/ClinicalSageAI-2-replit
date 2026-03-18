/**
 * Claude Document Drafting Service
 *
 * Production-grade service for generating regulatory documents using Claude Opus 4.6
 * with extended thinking, prompt caching, tool use, and streaming.
 *
 * Features:
 * - Regulatory-specific system prompts (FDA, ICH, EU MDR)
 * - Prompt caching for expensive regulatory context
 * - Extended thinking for complex analysis
 * - Agentic tool use for evidence search and citation
 * - Streaming for real-time document generation
 * - Vision for scanned document analysis
 */

import { getGateway } from '../ai-gateway/gateway';
import type {
  GatewayRequest,
  GatewayResponse,
  ClaudeEnhancedResponse,
  StreamCallback,
  ImageBlock,
  ExtendedThinkingConfig,
  ClaudeTool,
  ClaudeToolResult,
  TaskType,
} from '../ai-gateway/types';
import {
  DOCUMENT_DRAFTING_TOOLS,
  COMPLIANCE_REVIEW_TOOLS,
  GAP_ANALYSIS_TOOLS,
} from './ClaudeToolDefinitions';

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory System Prompts (cached for cost efficiency)
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_SYSTEM_PROMPTS: Record<string, string> = {
  fda_510k: `You are a senior regulatory affairs specialist with deep expertise in FDA 510(k) premarket notifications for medical devices. You write with precision, clarity, and regulatory compliance.

KEY REGULATORY FRAMEWORK:
- 21 CFR Part 807 Subpart E — Premarket Notification Procedures
- FDA Guidance: "The 510(k) Program: Evaluating Substantial Equivalence in Premarket Notifications"
- FDA Guidance: "Refusing to Accept 510(k)s" — ensure all acceptance criteria are met
- 21 CFR 860.120 — Substantial equivalence determination

DOCUMENT STANDARDS:
- Use formal regulatory language appropriate for FDA submissions
- Cite specific regulations (21 CFR sections) and guidance documents
- Include device classification information (product code, regulation number)
- Follow the eCopy formatting requirements
- Reference predicate devices with their 510(k) numbers
- Include proper Indications for Use statement formatting
- Address all elements of substantial equivalence (intended use, technological characteristics, performance)

QUALITY REQUIREMENTS:
- Every claim must be supported by evidence or regulatory reference
- Use tables for structured comparisons (subject device vs predicate)
- Include cross-references to supporting data sections
- Flag any gaps or areas needing additional data`,

  fda_pma: `You are a senior regulatory affairs specialist with deep expertise in FDA Premarket Approval (PMA) applications for Class III medical devices.

KEY REGULATORY FRAMEWORK:
- 21 CFR Part 814 — Premarket Approval of Medical Devices
- FDA Guidance: "Premarket Approval Application Modular Review"
- 21 CFR 860.7 — Determination of safety and effectiveness
- FDA Guidance: "Clinical Studies Section of PMA Applications"

DOCUMENT STANDARDS:
- PMA-level evidence requirements (valid scientific evidence)
- Comprehensive benefit-risk analysis
- Clinical study design and results reporting per FDA expectations
- Manufacturing and quality system documentation references
- Post-market surveillance planning`,

  eu_mdr: `You are a senior regulatory affairs specialist with deep expertise in EU Medical Device Regulation (MDR 2017/745).

KEY REGULATORY FRAMEWORK:
- EU MDR 2017/745 — Full regulation text
- MDCG guidance documents (Medical Device Coordination Group)
- EN ISO 14971:2019 — Risk Management
- EN ISO 13485:2016 — Quality Management Systems
- MEDDEV guidelines for clinical evaluation

DOCUMENT STANDARDS:
- EU MDR Annex II — Technical Documentation requirements
- EU MDR Annex XIV — Clinical Evaluation requirements
- EU MDR Annex XV — Clinical Investigations
- State-of-the-art analysis per MEDDEV 2.7/1 Rev 4
- GSPR (General Safety and Performance Requirements) mapping`,

  ich_clinical: `You are a senior clinical development scientist with deep expertise in ICH guidelines for clinical trials.

KEY REGULATORY FRAMEWORK:
- ICH E6(R2) — Good Clinical Practice
- ICH E8(R1) — General Considerations for Clinical Studies
- ICH E9(R1) — Statistical Principles for Clinical Trials (with Estimands)
- ICH E10 — Choice of Control Group
- ICH E17 — Multi-Regional Clinical Trials
- ICH M4 — Common Technical Document (CTD) structure

DOCUMENT STANDARDS:
- Protocol design per ICH E6(R2) requirements
- Statistical analysis plans per ICH E9(R1)
- Safety reporting per ICH E2A/E2B
- CTD Module 2.5 (Clinical Overview) and Module 2.7 (Clinical Summary) format`,

  cer_clinical_evaluation: `You are a clinical evaluation specialist focused on writing Clinical Evaluation Reports (CERs) compliant with EU MDR 2017/745.

KEY REGULATORY FRAMEWORK:
- EU MDR 2017/745 Annex XIV — Clinical Evaluation
- MEDDEV 2.7/1 Rev 4 — Clinical Evaluation guidance
- EN ISO 14155 — Clinical Investigations of Medical Devices
- MDCG 2020-5 — Clinical Evaluation – Equivalence
- MDCG 2020-6 — Sufficient Clinical Evidence for Legacy Devices

DOCUMENT STRUCTURE:
- Scope and methodology (literature search strategy, appraisal criteria)
- Device description and intended purpose
- State of the art analysis
- Clinical data from literature, clinical investigations, PMS/PMCF
- Equivalence demonstration (if applicable)
- Benefit-risk analysis
- Conclusions on conformity with GSPRs`,

  general_regulatory: `You are an expert regulatory affairs professional specializing in life sciences submissions. You write precise, well-structured regulatory documents with proper citations and evidence-based content. Always cite specific regulations, guidance documents, and standards. Use formal language appropriate for regulatory submissions.`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Document Types
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryFramework = 'fda_510k' | 'fda_pma' | 'eu_mdr' | 'ich_clinical' | 'cer_clinical_evaluation' | 'general_regulatory';

export interface DocumentDraftRequest {
  /** Regulatory framework context */
  framework: RegulatoryFramework;
  /** Document section or type to draft */
  sectionType: string;
  /** User instructions / content requirements */
  instructions: string;
  /** Optional existing content to revise */
  existingContent?: string;
  /** Project context (device type, indication, etc.) */
  projectContext?: {
    deviceName?: string;
    deviceType?: string;
    indication?: string;
    predicateDevice?: string;
    classification?: string;
  };
  /** Enable extended thinking for complex analysis */
  enableThinking?: boolean;
  /** Thinking budget tokens (default: 10000) */
  thinkingBudget?: number;
  /** Enable agentic tool use */
  enableTools?: boolean;
  /** Streaming callback */
  onStream?: StreamCallback;
  /** Organization/user context for audit */
  organizationId?: string | number;
  userId?: string | number;
  projectId?: string | number;
}

export interface DocumentDraftResponse {
  /** Generated document content */
  content: string;
  /** Extended thinking output (reasoning chain) */
  thinking?: string;
  /** Tools invoked during generation */
  toolsUsed?: string[];
  /** Provider and model info */
  model: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  /** Whether prompt cache was hit (cost savings) */
  cacheHit?: boolean;
  /** Latency in ms */
  latencyMs: number;
}

export interface VisionAnalysisRequest {
  /** Base64-encoded image data */
  imageData: string;
  /** Image MIME type */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  /** Analysis instructions */
  instructions: string;
  /** Regulatory framework for context */
  framework?: RegulatoryFramework;
  /** Enable extended thinking */
  enableThinking?: boolean;
  /** Streaming callback */
  onStream?: StreamCallback;
  organizationId?: string | number;
  userId?: string | number;
}

export interface BatchDocumentRequest {
  /** Array of draft requests to process */
  requests: DocumentDraftRequest[];
  /** Maximum concurrent requests */
  concurrency?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Class
// ─────────────────────────────────────────────────────────────────────────────

export class ClaudeDocumentDraftingService {
  private static instance: ClaudeDocumentDraftingService;

  static getInstance(): ClaudeDocumentDraftingService {
    if (!this.instance) {
      this.instance = new ClaudeDocumentDraftingService();
    }
    return this.instance;
  }

  /**
   * Draft a regulatory document section using Claude with full feature set.
   */
  async draftDocument(req: DocumentDraftRequest): Promise<DocumentDraftResponse> {
    const gateway = getGateway();
    const startTime = Date.now();

    const systemPrompt = REGULATORY_SYSTEM_PROMPTS[req.framework] || REGULATORY_SYSTEM_PROMPTS.general_regulatory;

    // Build user prompt with project context
    let userPrompt = '';
    if (req.projectContext) {
      const ctx = req.projectContext;
      userPrompt += `PROJECT CONTEXT:\n`;
      if (ctx.deviceName) userPrompt += `- Device: ${ctx.deviceName}\n`;
      if (ctx.deviceType) userPrompt += `- Type: ${ctx.deviceType}\n`;
      if (ctx.indication) userPrompt += `- Indication: ${ctx.indication}\n`;
      if (ctx.predicateDevice) userPrompt += `- Predicate: ${ctx.predicateDevice}\n`;
      if (ctx.classification) userPrompt += `- Classification: ${ctx.classification}\n`;
      userPrompt += '\n';
    }

    userPrompt += `SECTION TO DRAFT: ${req.sectionType}\n\n`;
    userPrompt += `INSTRUCTIONS:\n${req.instructions}`;

    if (req.existingContent) {
      userPrompt += `\n\nEXISTING CONTENT TO REVISE:\n${req.existingContent}`;
    }

    // Build gateway request with Claude features
    const gatewayRequest: GatewayRequest = {
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      provider: 'anthropic',
      model: 'claude-opus-4-20250514', // Use Opus for document drafting
      maxTokens: 8192,
      // Enable prompt caching for regulatory system prompts
      promptCache: { enabled: true, type: 'ephemeral' },
      organizationId: req.organizationId,
      userId: req.userId,
      projectId: req.projectId,
      callerModule: 'ClaudeDocumentDraftingService',
      metadata: {
        framework: req.framework,
        sectionType: req.sectionType,
      },
    };

    // Extended thinking for complex reasoning
    if (req.enableThinking) {
      gatewayRequest.thinking = {
        enabled: true,
        budgetTokens: req.thinkingBudget || 10000,
      };
    }

    // Agentic tool use for evidence search and citation
    if (req.enableTools) {
      gatewayRequest.tools = DOCUMENT_DRAFTING_TOOLS;
      gatewayRequest.toolChoice = 'auto';
    }

    // Streaming
    if (req.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = req.onStream;
    }

    const response = await gateway.route(gatewayRequest) as ClaudeEnhancedResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      toolsUsed: response.toolUses?.map(t => t.name),
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      cacheHit: response.cacheHit,
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Analyze a scanned document or image using Claude Vision.
   */
  async analyzeImage(req: VisionAnalysisRequest): Promise<DocumentDraftResponse> {
    const gateway = getGateway();

    const systemPrompt = req.framework
      ? REGULATORY_SYSTEM_PROMPTS[req.framework] || REGULATORY_SYSTEM_PROMPTS.general_regulatory
      : 'You are a document analysis expert specializing in regulatory and clinical documents. Analyze the provided image and extract all relevant information.';

    const imageBlock: ImageBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: req.mediaType,
        data: req.imageData,
      },
    };

    const gatewayRequest: GatewayRequest = {
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: req.instructions,
          contentBlocks: [
            imageBlock,
            { type: 'text', text: req.instructions },
          ],
        },
      ],
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514', // Sonnet for vision (cost-effective)
      maxTokens: 4096,
      organizationId: req.organizationId,
      userId: req.userId,
      callerModule: 'ClaudeDocumentDraftingService.vision',
    };

    if (req.enableThinking) {
      gatewayRequest.thinking = { enabled: true, budgetTokens: 5000 };
    }

    if (req.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = req.onStream;
    }

    const response = await gateway.route(gatewayRequest) as ClaudeEnhancedResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Run compliance review on a document section using Claude with compliance tools.
   */
  async reviewCompliance(
    content: string,
    framework: RegulatoryFramework,
    options?: {
      enableThinking?: boolean;
      onStream?: StreamCallback;
      organizationId?: string | number;
      userId?: string | number;
    }
  ): Promise<DocumentDraftResponse> {
    const gateway = getGateway();

    const systemPrompt = REGULATORY_SYSTEM_PROMPTS[framework] || REGULATORY_SYSTEM_PROMPTS.general_regulatory;

    const gatewayRequest: GatewayRequest = {
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Review the following document content for regulatory compliance under the ${framework} framework. Identify any gaps, non-compliant sections, and provide specific recommendations with regulatory citations.\n\nDOCUMENT CONTENT:\n${content}`,
        },
      ],
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      maxTokens: 8192,
      promptCache: { enabled: true, type: 'ephemeral' },
      tools: COMPLIANCE_REVIEW_TOOLS,
      toolChoice: 'auto',
      callerModule: 'ClaudeDocumentDraftingService.compliance',
      organizationId: options?.organizationId,
      userId: options?.userId,
    };

    if (options?.enableThinking) {
      gatewayRequest.thinking = { enabled: true, budgetTokens: 15000 };
    }

    if (options?.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = options.onStream;
    }

    const response = await gateway.route(gatewayRequest) as ClaudeEnhancedResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      toolsUsed: response.toolUses?.map(t => t.name),
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      cacheHit: response.cacheHit,
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Run gap analysis on a document using Claude with gap analysis tools.
   */
  async analyzeGaps(
    documentContent: string,
    framework: RegulatoryFramework,
    targetSections: string[],
    options?: {
      enableThinking?: boolean;
      onStream?: StreamCallback;
      organizationId?: string | number;
      userId?: string | number;
    }
  ): Promise<DocumentDraftResponse> {
    const gateway = getGateway();

    const systemPrompt = REGULATORY_SYSTEM_PROMPTS[framework] || REGULATORY_SYSTEM_PROMPTS.general_regulatory;

    const gatewayRequest: GatewayRequest = {
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Perform a comprehensive gap analysis on this document against the ${framework} requirements.

TARGET SECTIONS TO EVALUATE:
${targetSections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

For each required section, determine:
1. Whether it exists in the document
2. Whether it meets the regulatory requirements
3. Specific gaps and missing content
4. Priority level (critical / major / minor)
5. Recommended remediation

DOCUMENT CONTENT:
${documentContent}`,
        },
      ],
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      maxTokens: 8192,
      promptCache: { enabled: true, type: 'ephemeral' },
      tools: GAP_ANALYSIS_TOOLS,
      toolChoice: 'auto',
      callerModule: 'ClaudeDocumentDraftingService.gapAnalysis',
      organizationId: options?.organizationId,
      userId: options?.userId,
    };

    if (options?.enableThinking !== false) {
      // Default to thinking enabled for gap analysis
      gatewayRequest.thinking = { enabled: true, budgetTokens: 20000 };
    }

    if (options?.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = options.onStream;
    }

    const response = await gateway.route(gatewayRequest) as ClaudeEnhancedResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      toolsUsed: response.toolUses?.map(t => t.name),
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      cacheHit: response.cacheHit,
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Batch process multiple document sections (parallel with concurrency limit).
   */
  async batchDraft(req: BatchDocumentRequest): Promise<DocumentDraftResponse[]> {
    const concurrency = req.concurrency || 3;
    const results: DocumentDraftResponse[] = [];

    // Process in batches
    for (let i = 0; i < req.requests.length; i += concurrency) {
      const batch = req.requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(r => this.draftDocument(r))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Quick completion using Claude Sonnet (faster, cheaper for simple tasks).
   */
  async quickComplete(
    prompt: string,
    options?: {
      framework?: RegulatoryFramework;
      maxTokens?: number;
      organizationId?: string | number;
      userId?: string | number;
    }
  ): Promise<string> {
    const gateway = getGateway();

    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (options?.framework) {
      const sys = REGULATORY_SYSTEM_PROMPTS[options.framework];
      if (sys) messages.push({ role: 'system', content: sys });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await gateway.route({
      taskType: 'general',
      messages,
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      maxTokens: options?.maxTokens || 2048,
      promptCache: options?.framework ? { enabled: true, type: 'ephemeral' } : undefined,
      organizationId: options?.organizationId,
      userId: options?.userId,
      callerModule: 'ClaudeDocumentDraftingService.quickComplete',
    });

    return response.content;
  }
}

// Export singleton getter
export function getClaudeDraftingService(): ClaudeDocumentDraftingService {
  return ClaudeDocumentDraftingService.getInstance();
}
