import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

async function q<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

export async function runProcessValidation(processId: string) {
  const issues: any[] = [];

  // Get parameters
  const { rows: params } = await q<any>(
    `
    select u.name as unit, p.* 
    from cmc_parameters p 
    join cmc_unit_ops u on p.unit_id = u.unit_id
    where u.process_id = $1`,
    [processId]
  );

  // Get control strategy
  const { rows: cs } = await q<any>(
    `
    select controls_json 
    from cmc_control_strategy 
    where process_id = $1`,
    [processId]
  );
  const control = cs[0]?.controls_json || {};

  // PROC-001: CPP must have IPC
  params
    .filter((p: any) => p.kind === 'CPP')
    .forEach((p: any) => {
      if (!control[p.name]) {
        issues.push({
          id: 'PROC-001',
          severity: 'ERROR',
          msg: `CPP ${p.name} missing IPC`,
        });
      }
    });

  // PROC-003: Design Space factors present if any CPPs exist
  const { rows: ds } = await q<any>(
    `
    select factors_json 
    from cmc_design_space 
    where process_id = $1`,
    [processId]
  );
  if (
    params.some((p: any) => p.kind === 'CPP') &&
    (!ds[0] || (ds[0].factors_json || []).length === 0)
  ) {
    issues.push({
      id: 'PROC-003',
      severity: 'WARNING',
      msg: 'CPPs exist but Design Space is empty',
    });
  }

  // PROC-004: PPQ ≥3 PASS if stage VALIDATED
  const { rows: s } = await q<any>(
    `
    select stage 
    from cmc_processes 
    where process_id = $1`,
    [processId]
  );
  if (s[0]?.stage === 'VALIDATED') {
    const { rows: cnt } = await q<any>(
      `
      select count(*)::int c 
      from cmc_ppq_lots 
      where process_id = $1 and result = 'PASS'`,
      [processId]
    );
    if ((cnt[0]?.c || 0) < 3) {
      issues.push({
        id: 'PROC-004',
        severity: 'ERROR',
        msg: 'VALIDATED requires ≥3 PASS PPQ lots',
      });
    }
  }

  return issues;
}
