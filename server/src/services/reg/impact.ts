import { getPool } from '../../../db';

// Database connection - use canonical pool
const pool = getPool();

// Helper function for database queries
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

/** Compute impacted Module 3 sections/leaves/specs for a change */
export async function computeImpacts(change: any) {
  const pid = change.product_id;

  // Parse change_json: scope:'Process|Spec|Method|Stability', details:{...}
  const scope = change.change_json?.scope || 'Spec';
  const impacts: any[] = [];

  if (scope === 'Process') {
    // P.3 is always impacted; possibly P.5 (if CPP→CQA remap), and PPQ/CPV
    const secs = await q<any>(
      `select sec_id, code, sub_id from reg_m3_sections where code like '3.2.P.3%' and sub_id in (select sub_id from reg_submissions where product_id=$1)`,
      [pid]
    );
    for (const s of secs.rows)
      impacts.push({
        entity: 'SECTION',
        entity_id: s.sec_id,
        code: s.code,
        sub_id: s.sub_id,
        meta: { reason: 'Process change' },
      });
  }

  if (scope === 'Spec' || scope === 'Method') {
    const p5 = await q<any>(
      `select sec_id, code, sub_id from reg_m3_sections where code like '3.2.P.5%' and sub_id in (select sub_id from reg_submissions where product_id=$1)`,
      [pid]
    );
    for (const s of p5.rows)
      impacts.push({
        entity: 'SECTION',
        entity_id: s.sec_id,
        code: s.code,
        sub_id: s.sub_id,
        meta: { reason: 'Spec/Method change' },
      });
  }

  if (scope === 'Stability') {
    const p8 = await q<any>(
      `select sec_id, code, sub_id from reg_m3_sections where code like '3.2.P.8%' and sub_id in (select sub_id from reg_submissions where product_id=$1)`,
      [pid]
    );
    for (const s of p8.rows)
      impacts.push({
        entity: 'SECTION',
        entity_id: s.sec_id,
        code: s.code,
        sub_id: s.sub_id,
        meta: { reason: 'Stability change' },
      });
  }

  // Specs directly referenced?
  if (change.change_json?.specAttributes?.length) {
    for (const a of change.change_json.specAttributes) {
      impacts.push({ entity: 'SPEC', entity_id: a, meta: { attribute: a } });
    }
  }

  return impacts;
}

/** Checklist heuristics + ETA based on class */
export function buildChecklist(regions: any) {
  const items: any[] = [];
  const fda = regions?.FDA?.class || 'CBE-30';
  if (['PAS', 'Type II'].includes(fda) || regions?.EMA?.class === 'Type II') {
    items.push({
      id: 'risk-assessment',
      title: 'Update risk assessment & comparability protocol',
      owner: 'CMC',
      dueOffsetDays: 7,
    });
    items.push({
      id: 'ppq-summary',
      title: 'Compile PPQ summary & CPV plan link',
      owner: 'Quality',
      dueOffsetDays: 10,
    });
  } else {
    items.push({
      id: 'spec-justification',
      title: 'Write updated spec/justification with method validation cross‑refs',
      owner: 'Analytical',
      dueOffsetDays: 5,
    });
  }
  const eta = ['PAS', 'Type II'].includes(fda) || regions?.EMA?.class === 'Type II' ? 12 : 4; // weeks
  const risk = ['PAS', 'Type II'].includes(fda) ? 70 : 35;
  return { items, eta_weeks: eta, risk_score: risk };
}
