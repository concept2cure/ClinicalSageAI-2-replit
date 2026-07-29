/**
 * OpenTelemetry initialization. Opt-in via OTEL_ENABLED. When enabled,
 * exports traces to OTEL_EXPORTER_OTLP_ENDPOINT (HTTP OTLP).
 *
 * Misconfiguration policy (see /root/.claude/plans/mossy-dancing-dusk.md
 * Track G):
 *   - If OTEL_ENABLED is unset/false → SDK skipped silently (dev default).
 *   - If OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_ENDPOINT is set → export
 *     traces to that endpoint.
 *   - If OTEL_ENABLED=true and the endpoint is unset → log a loud warning.
 *     In production this is a hard fail (process.exit) unless
 *     OTEL_ALLOW_NO_EXPORTER=true is set explicitly (escape hatch for
 *     local prod debugging). Outside production we continue with no
 *     exporter so dev sessions are not blocked.
 *
 * The silent-drop behavior this replaces was: misconfigured production
 * boxes initialized the SDK with `traceExporter: undefined` and silently
 * lost every trace. The new behavior surfaces the misconfiguration at
 * boot time.
 */
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('OTel');

let started = false;

function isEnabled() {
  return ['1', 'true', 'yes', 'on'].includes((process.env.OTEL_ENABLED || '').toLowerCase());
}

function isProduction() {
  return (process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function allowNoExporter() {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.OTEL_ALLOW_NO_EXPORTER || '').toLowerCase()
  );
}

export async function initializeOpenTelemetry(): Promise<void> {
  if (started || !isEnabled()) return;

  const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!exporterEndpoint) {
    const banner = '='.repeat(70);
    if (isProduction() && !allowNoExporter()) {
      logger.error('');
      logger.error(banner);
      logger.error('[FATAL] OTEL_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is not set.');
      logger.error('   Production must export traces to a collector. Set the endpoint, or');
      logger.error('   set OTEL_ALLOW_NO_EXPORTER=true explicitly to override (NOT recommended).');
      logger.error(banner);
      logger.error('');
      process.exit(1);
    }
    logger.warn('');
    logger.warn(banner);
    logger.warn('OTEL_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is not set —');
    logger.warn('   traces will be DROPPED. Set the endpoint to ship to your collector.');
    logger.warn(banner);
    logger.warn('');
    // Mark as started so we don't re-warn on subsequent calls. The SDK
    // itself stays uninitialized.
    started = true;
    return;
  }

  try {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] =
      await Promise.all([
        dynamicImport('@opentelemetry/sdk-node'),
        dynamicImport('@opentelemetry/auto-instrumentations-node'),
        dynamicImport('@opentelemetry/exporter-trace-otlp-http'),
      ]);

    const serviceName = process.env.OTEL_SERVICE_NAME || 'concept2cure-server';
    const traceExporter = new OTLPTraceExporter({
      url: `${exporterEndpoint.replace(/\/$/, '')}/v1/traces`,
    });

    const sdk = new NodeSDK({
      serviceName,
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    await sdk.start();
    started = true;
    logger.info(`enabled for service=${serviceName} endpoint=${exporterEndpoint}`);
  } catch (error: any) {
    logger.warn('initialization skipped', { error: error?.message || String(error) });
  }
}

export function getOtelDiagnostics() {
  return {
    enabled: isEnabled(),
    started,
    exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
  };
}
