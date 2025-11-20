import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

function rnd() {
  return Math.random();
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Returns { onTimeProb, p50Days, p90Days } relative to today based on due tasks & IRs. */
export async function timelineRisk(subId: string) {
  const tasks = (
    await q<any>(
      `select extract(epoch from (due_date::timestamp - now()))/86400 as days from reg_tasks where sub_id=$1 and status in ('OPEN','IN_PROGRESS') and due_date is not null`,
      [subId]
    )
  ).rows.map((r: any) => r.days);
  const irs = (
    await q<any>(
      `select extract(epoch from (due_date::timestamp - now()))/86400 as days from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW') and due_date is not null`,
      [subId]
    )
  ).rows.map((r: any) => r.days);
  const deltas = [...tasks, ...irs].filter((d: number) => isFinite(d));

  // If no dates, return neutral
  if (!deltas.length) return { onTimeProb: 0.7, p50Days: 21, p90Days: 56 };

  const N = 1000;
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const d of deltas) {
      // Assume task effort ~ U(0.6,1.3) of scheduled slack
      const factor = 0.6 + rnd() * 0.7;
      s += clamp(d * factor, 0, Math.max(d, 1));
    }
    samples.push(s);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(0.5 * N)];
  const p90 = samples[Math.floor(0.9 * N)];
  const onTime = samples.filter(x => x <= 30).length / N; // delivery within 30 days

  return { onTimeProb: onTime, p50Days: Math.round(p50), p90Days: Math.round(p90) };
}
