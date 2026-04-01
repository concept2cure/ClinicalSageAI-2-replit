let started = false;

function isEnabled() {
  return ['1', 'true', 'yes', 'on'].includes((process.env.OTEL_ENABLED || '').toLowerCase());
}

export async function initializeOpenTelemetry(): Promise<void> {
  if (started || !isEnabled()) return;

  try {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] =
      await Promise.all([
        dynamicImport('@opentelemetry/sdk-node'),
        dynamicImport('@opentelemetry/auto-instrumentations-node'),
        dynamicImport('@opentelemetry/exporter-trace-otlp-http'),
      ]);

    const serviceName = process.env.OTEL_SERVICE_NAME || 'concept2cure-server';
    const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const traceExporter = exporterEndpoint
      ? new OTLPTraceExporter({ url: `${exporterEndpoint.replace(/\/$/, '')}/v1/traces` })
      : undefined;

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
    console.log(`[OTel] enabled for service=${serviceName}`);
  } catch (error: any) {
    console.warn('[OTel] initialization skipped:', error?.message || String(error));
  }
}

export function getOtelDiagnostics() {
  return {
    enabled: isEnabled(),
    started,
    exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
  };
}
