import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  resolveEmbeddingProvider,
  resetEmbeddingProvider,
} from '../embedding-provider';

const SAVED = {
  EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
  EMBEDDING_LOCAL_BASE_URL: process.env.EMBEDDING_LOCAL_BASE_URL,
  LOCAL_AI_BASE_URL: process.env.LOCAL_AI_BASE_URL,
};

beforeEach(() => {
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.EMBEDDING_LOCAL_BASE_URL;
  delete process.env.LOCAL_AI_BASE_URL;
  resetEmbeddingProvider();
});

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEmbeddingProvider();
});

describe('embedding provider selection', () => {
  it('defaults to the OpenAI embedding provider (shared frontier)', () => {
    const p = resolveEmbeddingProvider();
    expect(p.kind).toBe('openai');
    expect(p.selfHosted).toBe(false);
    expect(p.defaultModel).toBe('text-embedding-3-small');
  });

  it('selects the self-hosted provider when EMBEDDING_PROVIDER=local and a base URL is set', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.EMBEDDING_LOCAL_BASE_URL = 'http://localhost:8080/v1';
    const p = resolveEmbeddingProvider();
    expect(p.kind).toBe('local');
    expect(p.selfHosted).toBe(true);
  });

  it('falls back to OpenAI when local is requested but no base URL is configured', () => {
    process.env.EMBEDDING_PROVIDER = 'local';
    const p = resolveEmbeddingProvider();
    expect(p.kind).toBe('openai');
  });
});
