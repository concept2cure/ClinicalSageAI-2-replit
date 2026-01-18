import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

const toJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const getDateString = (daysBack: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().split('T')[0];
};

async function scrape510kDecisions(daysBack: number): Promise<number> {
  const url = `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?startDate=${getDateString(daysBack)}`;
  const response = await fetch(url);
  if (!response.ok) return 0;
  const html = await response.text();
  const matches = html.match(/<tr/gi) || [];
  return Math.max(0, matches.length - 1);
}

serve(async (req) => {
  try {
    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const daysBack = Number(payload?.daysBack || 7);
    const count = await scrape510kDecisions(daysBack);

    return toJson({
      success: true,
      ingestedDecisions: count,
      daysBack,
    });
  } catch (error) {
    return toJson({ success: false, error: error?.message || 'Ingestion failed' }, 500);
  }
});
