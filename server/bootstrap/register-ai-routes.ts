import type { RouteBootstrapContext } from './types';
import chatRoutes from '../routes/chat';
import indGenerationRoutes from '../routes/ind-generation';
import regulatoryRegistryRoutes from '../routes/regulatory-registry';
import { authenticateToken } from '../middleware/auth.js';

export async function registerAiRoutes({ app, pool, aiCircuitBreaker }: RouteBootstrapContext) {
  // SECURITY: AI routes are auth-gated for two reasons. First, they
  // operate on tenant-scoped data (chat threads, claims, evidence) and
  // a missing JWT means no tenant context. Second — and more pressing
  // — they pass through to upstream LLM providers (Claude, OpenAI)
  // which we pay per token. An unauthenticated /api/claude or /api/chat
  // is a direct cost vector: anyone can burn our balance with a curl
  // loop. authenticateToken before the rate limiters (which are
  // mounted earlier in the middleware stack) gives a layered defense.

  try {
    const anaFeaturesModule = await import('../routes/ana-features');
    app.use('/api/ana', authenticateToken, anaFeaturesModule.default);
  } catch (error) {
    console.error('❌ Failed to mount AnA Features routes:', error);
  }

  try {
    const anaRiModule = await import('../routes/ana-ri');
    app.use('/api/ana-ri', authenticateToken, aiCircuitBreaker, anaRiModule.default);
  } catch (error) {
    console.error('❌ Failed to mount AnA RI routes:', error);
  }

  try {
    const firecrawlRoutes = await import('../routes/firecrawl');
    const externalEvidenceRoutes = await import('../routes/external-evidence');
    app.use('/api/firecrawl', authenticateToken, firecrawlRoutes.default);
    app.use('/api/external-evidence', authenticateToken, externalEvidenceRoutes.default);
  } catch (error) {
    console.error('❌ Failed to mount external evidence routes:', error);
  }

  app.use('/api/chat', authenticateToken, chatRoutes);
  app.use('/api/ind-generation', authenticateToken, indGenerationRoutes);
  app.use('/api/regulatory', authenticateToken, regulatoryRegistryRoutes);

  // ── Submission-chat: periodic proposal-expiration sweep ────────────
  // Best-effort. Disabled in test env. No-ops when the table is missing.
  try {
    const { startSubmissionChatSweepScheduler } = await import(
      '../services/ana/submission-chat-sweep-scheduler'
    );
    if (startSubmissionChatSweepScheduler()) {
      console.log('✅ Submission-chat proposal sweep scheduled');
    }
  } catch (error) {
    console.error(
      '❌ Failed to start submission-chat sweep scheduler:',
      error
    );
  }

  // ── Citation engine: run-history pruner ────────────────────────────
  // Keeps ana_artifact_citation_runs from growing unbounded. Per-org
  // sweep on a fixed interval; the active run is always preserved.
  try {
    const { startCitationRunPruneScheduler } = await import(
      '../services/ana/citation-run-pruner'
    );
    if (startCitationRunPruneScheduler()) {
      console.log('✅ Citation run-history pruner scheduled');
    }
  } catch (error) {
    console.error('❌ Failed to start citation run pruner:', error);
  }

  // ── Submission-chat: OTel metrics exporter ─────────────────────────
  // Subscribes to onMetric() and emits OTel counters/histograms for every
  // submission_chat.{turn,apply} event. Gated on OTEL_ENABLED; falls back
  // to a silent no-op when @opentelemetry/api isn't available.
  try {
    const { startSubmissionChatOtelExporter } = await import(
      '../services/ana/submission-chat-otel-exporter'
    );
    const ok = await startSubmissionChatOtelExporter();
    if (ok) console.log('✅ Submission-chat OTel exporter registered');
  } catch (error) {
    console.error(
      '❌ Failed to start submission-chat OTel exporter:',
      error
    );
  }

  try {
    const claimsModule = await import('../routes/ai-claims-routes');
    app.use('/api/ai', authenticateToken, claimsModule.default(pool));
  } catch (error) {
    console.error('❌ Failed to mount AI Claims routes:', error);
  }

  try {
    const anaIntelligenceRoutes = await import('../routes/ana-intelligence.ts');
    app.use('/api/claude', authenticateToken, anaIntelligenceRoutes.default);
  } catch (error) {
    console.error('❌ Failed to mount Claude Intelligence routes:', error);
  }
}
