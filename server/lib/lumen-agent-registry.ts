export type LumenAgentProvider = 'openfda' | 'openai' | 'cache' | 'offline';

export type LumenAgent = {
  id: string;
  name: string;
  description: string;
  provider: LumenAgentProvider;
  modules: 'all' | string[];
  enabled: boolean;
  metadata?: Record<string, any>;
};

export function defaultAgentIdForModule(module: string): string {
  if (module === 'broker') return 'openfda-broker';
  if (module === 'private') return 'private-rag';
  if (module === 'private-rag') return 'private-rag';
  if (module === 'risk') return 'foresight-risk';
  if (module === 'device') return 'openfda-device';
  return 'openai-general';
}

export function buildLumenAgentRegistry(params: {
  openAiEnabled: boolean;
  openFdaApiKeyConfigured: boolean;
  supportedOpenFdaDatasets?: readonly string[];
}): LumenAgent[] {
  return [
    {
      id: 'offline-demo',
      name: 'Offline Demo',
      description: 'Deterministic fallback responses when external AI providers are not configured.',
      provider: 'offline',
      modules: 'all',
      enabled: true,
    },
    {
      id: 'openfda-broker',
      name: 'Broker (Recall Scanner)',
      description: 'Scans openFDA recall/enforcement datasets for high-signal issues and patterns.',
      provider: 'openfda',
      modules: ['broker'],
      enabled: true,
      metadata: {
        apiKeyConfigured: params.openFdaApiKeyConfigured,
        supportedDatasets: params.supportedOpenFdaDatasets || [],
      },
    },
    {
      id: 'openfda-device',
      name: 'FDA Intel (openFDA)',
      description: 'Queries openFDA datasets for device/drug/food/vet regulatory evidence and summaries.',
      provider: 'openfda',
      modules: ['device'],
      enabled: true,
      metadata: {
        apiKeyConfigured: params.openFdaApiKeyConfigured,
        supportedDatasets: params.supportedOpenFdaDatasets || [],
      },
    },
    {
      id: 'private-rag',
      name: 'Private RAG (Your Docs)',
      description: 'Retrieves tenant documents and answers questions with citations when available.',
      provider: 'openai',
      modules: ['private-rag'],
      enabled: true,
    },
    {
      id: 'foresight-risk',
      name: 'Foresight (Risk Analysis)',
      description: 'Produces a structured risk analysis with gaps and recommended actions.',
      provider: 'openai',
      modules: ['risk'],
      enabled: params.openAiEnabled,
    },
    {
      id: 'openai-general',
      name: 'LLM (OpenAI)',
      description: 'General-purpose regulatory drafting/analysis using the configured OpenAI model.',
      provider: 'openai',
      modules: 'all',
      enabled: params.openAiEnabled,
      metadata: {
        defaultModel: 'gpt-4o',
      },
    },
    {
      id: 'cache-only',
      name: 'Cache Only',
      description: 'Returns cached answers only; never calls external providers.',
      provider: 'cache',
      modules: 'all',
      enabled: true,
    },
  ];
}

export function getAgentById(agents: LumenAgent[], agentId: string): LumenAgent | undefined {
  return agents.find((a) => a.id === agentId);
}

export function isAgentAllowedForModule(agent: LumenAgent, module: string): boolean {
  if (agent.modules === 'all') return true;
  return agent.modules.includes(module);
}
