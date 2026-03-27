export async function runDeviceDiagnosticsEvidence(message: string) {
  const query = encodeURIComponent(message.slice(0, 120));
  const withTimeout = async (url: string, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  const [trialsRes, openFdaRes] = await Promise.all([
    withTimeout(
      `https://clinicaltrials.gov/api/v2/studies?query.term=${query}&pageSize=3`
    ).catch(() => null),
    withTimeout(
      `https://api.fda.gov/device/event.json?search=patient.problem+description:${query}&limit=3`
    ).catch(() => null),
  ]);

  const trialsJson: any = trialsRes?.ok ? await trialsRes.json() : {};
  const openFdaJson: any = openFdaRes?.ok ? await openFdaRes.json() : {};
  const trials = (trialsJson?.studies || []).slice(0, 3).map((s: any) => ({
    nctId: s?.protocolSection?.identificationModule?.nctId,
    title: s?.protocolSection?.identificationModule?.briefTitle,
    status: s?.protocolSection?.statusModule?.overallStatus,
  }));
  const fdaEvents = (openFdaJson?.results || []).slice(0, 3).map((r: any) => ({
    date: r?.date_received,
    brand: r?.device?.[0]?.brand_name,
    generic: r?.device?.[0]?.generic_name,
  }));

  return {
    provider: 'Regulatory+FirecrawlFallback',
    summary: `Device/diagnostics path returned ${trials.length} trials and ${fdaEvents.length} openFDA events.`,
    trials,
    openFdaEvents: fdaEvents,
  };
}
