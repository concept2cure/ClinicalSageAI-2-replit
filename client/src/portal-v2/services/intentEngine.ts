/**
 * Intent Engine - Natural Language Command Router
 *
 * Handles intent-based navigation and command routing for the Client Portal V2.
 * Maps natural language patterns to module actions and navigation.
 *
 * Per CONCEPT2CURE_ROADMAP_PART2.md - Week 4 Task 4.1
 *
 * @version 1.0.0
 * @module portal-v2/services/intentEngine
 */

import type { UserRole, RegulatoryAgency } from '../core/portalTypes';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type IntentAction = 'navigate' | 'query' | 'create' | 'open' | 'analyze' | 'generate';

export interface IntentMapping {
  /** Natural language patterns that trigger this intent */
  patterns: string[];
  /** Target module ID from moduleRegistry */
  moduleId: string;
  /** Action type to perform */
  action: IntentAction;
  /** Optional route parameters */
  params?: Record<string, string>;
  /** Human-readable description */
  description?: string;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

export interface IntentMatch {
  /** The matched intent mapping */
  intent: IntentMapping;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted entities from the input */
  entities: Record<string, string>;
  /** The original input that was matched */
  originalInput: string;
  /** Matched pattern */
  matchedPattern: string;
}

export interface IntentContext {
  /** Current user role */
  userRole?: UserRole;
  /** Current regulatory agency context */
  agency?: RegulatoryAgency;
  /** Active project/study ID */
  projectId?: string;
  /** Active document ID */
  documentId?: string;
  /** Current module */
  activeModule?: string;
}

export interface IntentResult {
  /** Whether an intent was successfully matched */
  matched: boolean;
  /** The best matching intent, if found */
  match?: IntentMatch;
  /** All candidate matches above threshold */
  candidates: IntentMatch[];
  /** Suggested action if no match */
  suggestion?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Master registry of all supported intents mapped to modules
 */
export const INTENT_REGISTRY: IntentMapping[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // IND / eCTD Co-Author Intents (IND Wizard deprecated → rolled into eCTD Co-Author)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'show ind',
      'open ind wizard',
      'ind application',
      'start ind',
      'create ind',
      'new ind submission',
      'ind wizard',
      'investigational new drug',
    ],
    moduleId: 'ectd_coauthor',
    action: 'navigate',
    params: { route: '/ectd-coauthor' },
    description: 'Navigate to eCTD Co-Author (IND workflow)',
  },
  {
    patterns: ['ind status', 'check ind', 'ind progress', 'where is my ind'],
    moduleId: 'ectd_coauthor',
    action: 'query',
    description: 'Query IND submission status via eCTD Co-Author',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Trial Vault Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'open vault',
      'document vault',
      'trial vault',
      'show documents',
      'my documents',
      'file vault',
      'regulatory vault',
    ],
    moduleId: 'vault',
    action: 'navigate',
    params: { route: '/client-portal/vault' },
    description: 'Navigate to Trial Vault document repository',
  },
  {
    patterns: ['upload document', 'add document', 'new document', 'upload file'],
    moduleId: 'vault',
    action: 'create',
    params: { route: '/client-portal/vault', action: 'upload' },
    description: 'Upload new document to vault',
  },
  {
    patterns: ['find document', 'search documents', 'look for', 'where is'],
    moduleId: 'vault',
    action: 'query',
    description: 'Search documents in vault',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CSR Intelligence Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'csr',
      'clinical study report',
      'csr intelligence',
      'analyze csr',
      'csr analysis',
      'study report',
    ],
    moduleId: 'csr_intelligence',
    action: 'navigate',
    params: { route: '/csr-intelligence' },
    description: 'Navigate to CSR Intelligence module',
  },
  {
    patterns: ['generate csr', 'create csr', 'new csr', 'draft csr'],
    moduleId: 'csr_intelligence',
    action: 'generate',
    description: 'Generate new Clinical Study Report',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Study Architect / Protocol Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'study architect',
      'protocol design',
      'design study',
      'create protocol',
      'new protocol',
      'study design',
      'trial design',
    ],
    moduleId: 'study_architect',
    action: 'navigate',
    params: { route: '/study-architect' },
    description: 'Navigate to Study Architect for protocol design',
  },
  {
    patterns: ['optimize protocol', 'improve protocol', 'protocol suggestions'],
    moduleId: 'study_architect',
    action: 'analyze',
    description: 'Analyze and optimize protocol design',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CER Generator Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'cer',
      'clinical evaluation',
      'clinical evaluation report',
      'cer generator',
      'generate cer',
      'eu mdr cer',
      'mdr compliance',
    ],
    moduleId: 'cer_generator',
    action: 'navigate',
    params: { route: '/cer-generator' },
    description: 'Navigate to CER Generator',
  },
  {
    patterns: ['create cer', 'new cer', 'draft cer', 'start cer'],
    moduleId: 'cer_generator',
    action: 'create',
    description: 'Create new Clinical Evaluation Report',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 510(k) eSTAR Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      '510k',
      '510(k)',
      'estar',
      'e-star',
      'premarket notification',
      '510k submission',
      'medical device submission',
    ],
    moduleId: '510k_estar',
    action: 'navigate',
    params: { route: '/510k-wizard' },
    description: 'Navigate to 510(k) eSTAR Wizard',
  },
  {
    patterns: ['predicate search', 'find predicate', 'predicate device', 'similar device'],
    moduleId: '510k_estar',
    action: 'query',
    params: { action: 'predicate-search' },
    description: 'Search for predicate devices',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Analytics Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'analytics',
      'dashboard',
      'metrics',
      'statistics',
      'reports',
      'show analytics',
      'view reports',
    ],
    moduleId: 'analytics',
    action: 'navigate',
    params: { route: '/client-portal/analytics' },
    description: 'Navigate to Analytics Dashboard',
  },
  {
    patterns: ['submission metrics', 'approval rate', 'timeline analysis', 'performance'],
    moduleId: 'analytics',
    action: 'query',
    description: 'Query submission analytics and metrics',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Submission Center Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'submission center',
      'submissions',
      'my submissions',
      'submit',
      'ectd',
      'submission status',
    ],
    moduleId: 'submission_center',
    action: 'navigate',
    params: { route: '/submission-center' },
    description: 'Navigate to Submission Center',
  },
  {
    patterns: ['new submission', 'create submission', 'start submission', 'prepare submission'],
    moduleId: 'submission_center',
    action: 'create',
    description: 'Create new regulatory submission',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Regulatory Intelligence Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'regulatory intelligence',
      'reg intel',
      'regulatory news',
      'fda guidance',
      'guidance documents',
      'regulatory updates',
    ],
    moduleId: 'regulatory_intel',
    action: 'navigate',
    params: { route: '/client-portal/regulatory-intel' },
    description: 'Navigate to Regulatory Intelligence',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CMC Platform Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: [
      'cmc',
      'chemistry manufacturing',
      'cmc wizard',
      'manufacturing',
      'drug substance',
      'drug product',
    ],
    moduleId: 'cmc_platform',
    action: 'navigate',
    params: { route: '/client-portal/cmc-wizard' },
    description: 'Navigate to CMC Platform',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Help / General Intents
  // ─────────────────────────────────────────────────────────────────────────────
  {
    patterns: ['help', 'what can you do', 'commands', 'show commands', 'guide me'],
    moduleId: 'help',
    action: 'query',
    description: 'Show available commands and help',
  },
  {
    patterns: ['home', 'go home', 'main', 'start', 'portal'],
    moduleId: 'dashboard',
    action: 'navigate',
    params: { route: '/client-portal' },
    description: 'Navigate to portal home',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * IntentEngine - Natural language command processor
 *
 * Processes user input and matches it to registered intents.
 * Uses fuzzy matching and context awareness for accurate routing.
 */
export class IntentEngine {
  private intents: IntentMapping[];
  private context: IntentContext;
  private readonly defaultConfidenceThreshold = 0.4;

  constructor(intents: IntentMapping[] = INTENT_REGISTRY) {
    this.intents = intents;
    this.context = {};
  }

  /**
   * Set the current context for intent matching
   */
  setContext(context: IntentContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Get current context
   */
  getContext(): IntentContext {
    return { ...this.context };
  }

  /**
   * Process user input and find matching intent
   */
  process(input: string): IntentResult {
    const normalizedInput = this.normalizeInput(input);
    const candidates: IntentMatch[] = [];

    for (const intent of this.intents) {
      const match = this.matchIntent(normalizedInput, intent);
      if (match && match.confidence >= (intent.minConfidence ?? this.defaultConfidenceThreshold)) {
        candidates.push(match);
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    if (candidates.length === 0) {
      return {
        matched: false,
        candidates: [],
        suggestion: this.getSuggestion(normalizedInput),
      };
    }

    return {
      matched: true,
      match: candidates[0],
      candidates,
    };
  }

  /**
   * Match input against a single intent
   */
  private matchIntent(input: string, intent: IntentMapping): IntentMatch | null {
    let bestConfidence = 0;
    let matchedPattern = '';
    const entities: Record<string, string> = {};

    for (const pattern of intent.patterns) {
      const normalizedPattern = pattern.toLowerCase();

      // Exact match
      if (input === normalizedPattern) {
        return {
          intent,
          confidence: 1.0,
          entities,
          originalInput: input,
          matchedPattern: pattern,
        };
      }

      // Contains match
      if (input.includes(normalizedPattern)) {
        const confidence = normalizedPattern.length / input.length;
        if (confidence > bestConfidence) {
          bestConfidence = Math.min(confidence * 1.2, 0.95); // Boost but cap
          matchedPattern = pattern;
        }
      }

      // Pattern contains input
      if (normalizedPattern.includes(input) && input.length >= 3) {
        const confidence = input.length / normalizedPattern.length;
        if (confidence > bestConfidence) {
          bestConfidence = confidence * 0.9;
          matchedPattern = pattern;
        }
      }

      // Word overlap scoring
      const inputWords = input.split(/\s+/);
      const patternWords = normalizedPattern.split(/\s+/);
      const matchedWords = inputWords.filter(w => patternWords.includes(w));

      if (matchedWords.length > 0) {
        const wordConfidence =
          matchedWords.length / Math.max(inputWords.length, patternWords.length);
        if (wordConfidence > bestConfidence) {
          bestConfidence = wordConfidence;
          matchedPattern = pattern;
        }
      }

      // Fuzzy match using Levenshtein-like scoring
      const fuzzyScore = this.fuzzyMatch(input, normalizedPattern);
      if (fuzzyScore > bestConfidence) {
        bestConfidence = fuzzyScore;
        matchedPattern = pattern;
      }
    }

    if (bestConfidence > 0) {
      // Extract entities from input
      this.extractEntities(input, entities);

      return {
        intent,
        confidence: bestConfidence,
        entities,
        originalInput: input,
        matchedPattern,
      };
    }

    return null;
  }

  /**
   * Simple fuzzy matching using bigram similarity
   */
  private fuzzyMatch(str1: string, str2: string): number {
    const getBigrams = (str: string): Set<string> => {
      const bigrams = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.slice(i, i + 2));
      }
      return bigrams;
    };

    const bigrams1 = getBigrams(str1);
    const bigrams2 = getBigrams(str2);

    let matches = 0;
    bigrams1.forEach(bigram => {
      if (bigrams2.has(bigram)) matches++;
    });

    const total = bigrams1.size + bigrams2.size;
    return total > 0 ? (2 * matches) / total : 0;
  }

  /**
   * Extract entities from input (IDs, names, etc.)
   */
  private extractEntities(input: string, entities: Record<string, string>): void {
    // Extract project/study IDs (e.g., PRJ-123, STU-456)
    const projectMatch = input.match(/\b(prj|stu|doc|ind|cer)[-_]?(\d+)\b/i);
    if (projectMatch) {
      entities.entityId = `${projectMatch[1].toUpperCase()}-${projectMatch[2]}`;
      entities.entityType = projectMatch[1].toLowerCase();
    }

    // Extract document names in quotes
    const quotedMatch = input.match(/"([^"]+)"/);
    if (quotedMatch) {
      entities.documentName = quotedMatch[1];
    }

    // Extract dates
    const dateMatch = input.match(/\b(\d{4}[-/]\d{2}[-/]\d{2})\b/);
    if (dateMatch) {
      entities.date = dateMatch[1];
    }
  }

  /**
   * Normalize user input for matching
   */
  private normalizeInput(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /**
   * Get suggestion when no intent matches
   */
  private getSuggestion(input: string): string {
    // Find closest matches for suggestion
    const suggestions = [
      'Try saying "open IND wizard" to start an IND application',
      'Say "show vault" to access your documents',
      'Try "510k submission" for medical device submissions',
      'Say "analytics" to view your dashboard',
      'Try "help" to see all available commands',
    ];

    // Simple keyword-based suggestion
    if (input.includes('document') || input.includes('file')) {
      return 'Try saying "open vault" to access documents';
    }
    if (input.includes('submit') || input.includes('fda')) {
      return 'Try "submission center" or "510k wizard" for FDA submissions';
    }
    if (input.includes('report') || input.includes('analysis')) {
      return 'Try "analytics" or "CSR intelligence" for reports';
    }

    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  /**
   * Get all available commands grouped by module
   */
  getAvailableCommands(): Record<string, string[]> {
    const commands: Record<string, string[]> = {};

    for (const intent of this.intents) {
      if (!commands[intent.moduleId]) {
        commands[intent.moduleId] = [];
      }
      commands[intent.moduleId].push(...intent.patterns.slice(0, 3));
    }

    return commands;
  }

  /**
   * Add custom intent at runtime
   */
  addIntent(intent: IntentMapping): void {
    this.intents.push(intent);
  }

  /**
   * Remove intent by module ID
   */
  removeIntentsByModule(moduleId: string): void {
    this.intents = this.intents.filter(i => i.moduleId !== moduleId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let intentEngineInstance: IntentEngine | null = null;

/**
 * Get singleton IntentEngine instance
 */
export function getIntentEngine(): IntentEngine {
  if (!intentEngineInstance) {
    intentEngineInstance = new IntentEngine();
  }
  return intentEngineInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetIntentEngine(): void {
  intentEngineInstance = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for using IntentEngine in React components
 *
 * @example
 * ```tsx
 * const { processIntent, commands } = useIntentEngine();
 *
 * const handleCommand = (input: string) => {
 *   const result = processIntent(input);
 *   if (result.matched) {
 *     navigate(result.match.intent.params?.route);
 *   }
 * };
 * ```
 */
export function useIntentEngine() {
  const engine = getIntentEngine();

  return {
    processIntent: (input: string) => engine.process(input),
    setContext: (ctx: IntentContext) => engine.setContext(ctx),
    getContext: () => engine.getContext(),
    getCommands: () => engine.getAvailableCommands(),
    addIntent: (intent: IntentMapping) => engine.addIntent(intent),
  };
}

export default IntentEngine;
