const iterations = Number(Deno.args[0] || 1);
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  Deno.exit(1);
}

const endpoint = `${supabaseUrl}/functions/v1/smart-claims-matrix`;

const runOnce = async (index: number) => {
  const start = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deviceId: `bench-dev-${index}`, cerIds: [`bench-cer-${index}`] }),
  });
  const duration = Math.round(performance.now() - start);
  const text = await response.text();
  return { index, duration, status: response.status, body: text };
};

const results = [] as Array<{ index: number; duration: number; status: number }>;

for (let i = 0; i < iterations; i += 1) {
  const { index, duration, status } = await runOnce(i + 1);
  results.push({ index, duration, status });
  console.log(`Iteration ${index}: ${duration}ms (status ${status})`);
}

const avg = Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length);
console.log(`Average: ${avg}ms`);
