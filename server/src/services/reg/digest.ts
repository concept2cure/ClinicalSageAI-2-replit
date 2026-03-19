import { getPool } from '../../../db';

const pool = getPool();

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

export async function generateSlackDigest(subId: string) {
  const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [subId])).rows[0];
  if (!sub) throw new Error('Submission not found');

  // Get recent activities
  const tasks = (
    await q<any>(
      `select count(*)::int as open, sum(case when due_date < now()::date then 1 else 0 end)::int as overdue from reg_tasks where sub_id=$1 and status in ('OPEN','IN_PROGRESS')`,
      [subId]
    )
  ).rows[0];
  const irs = (
    await q<any>(
      `select count(*)::int as open from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
      [subId]
    )
  ).rows[0];
  const recent_runs = (
    await q<any>(
      `select status from reg_gatekeeper_runs where sub_id=$1 order by created_at desc limit 1`,
      [subId]
    )
  ).rows[0];

  const status_emoji =
    recent_runs?.status === 'PASS' ? '✅' : recent_runs?.status === 'HOLD' ? '⚠️' : '❌';

  const message = `
🏛️ **Regulatory Status Update - ${sub.product_name}**

${status_emoji} **Gatekeeper Status**: ${recent_runs?.status || 'Not Run'}
📋 **Open Tasks**: ${tasks.open || 0} (${tasks.overdue || 0} overdue)
❓ **Open IRs**: ${irs.open || 0}

📊 View full dashboard at: /cmc-blueprint
`.trim();

  return { message, channel: '#regulatory-updates' };
}

export async function generateCalendarEvent(subId: string) {
  const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [subId])).rows[0];
  if (!sub) throw new Error('Submission not found');

  const nearTasks = (
    await q<any>(
      `select title, due_date from reg_tasks where sub_id=$1 and status in ('OPEN','IN_PROGRESS') and due_date between now()::date and now()::date + 7 order by due_date limit 5`,
      [subId]
    )
  ).rows;
  const nearIRs = (
    await q<any>(
      `select text, due_date from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW') and due_date between now()::date and now()::date + 7 order by due_date limit 3`,
      [subId]
    )
  ).rows;

  let description = `Regulatory weekly review for ${sub.product_name}\n\n`;

  if (nearTasks.length) {
    description += '📋 Upcoming Tasks:\n';
    nearTasks.forEach((t: any) => {
      description += `- ${t.title} (Due: ${new Date(t.due_date).toLocaleDateString()})\n`;
    });
  }

  if (nearIRs.length) {
    description += '\n❓ Upcoming IR Responses:\n';
    nearIRs.forEach((ir: any) => {
      description += `- ${ir.text.substring(0, 50)}... (Due: ${new Date(ir.due_date).toLocaleDateString()})\n`;
    });
  }

  // Generate ICS format
  const now = new Date();
  const startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Next week
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Concept2Cure//Regulatory Calendar//EN
BEGIN:VEVENT
UID:reg-review-${subId}-${Date.now()}@trialsage.com
DTSTART:${startDate
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')}
DTEND:${endDate
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')}
SUMMARY:Regulatory Review - ${sub.product_name}
DESCRIPTION:${description.replace(/\n/g, '\\n')}
LOCATION:Conference Room A
END:VEVENT
END:VCALENDAR`;

  return { ics, title: `Regulatory Review - ${sub.product_name}`, description };
}

export async function dailyQCDigest() {
  // Get QC batch summary
  const batches = (
    await q<any>(
      `select count(*)::int as total,
        sum(case when status='RELEASED' then 1 else 0 end)::int as released,
        sum(case when status='HOLD' then 1 else 0 end)::int as hold,
        sum(case when status='PENDING' then 1 else 0 end)::int as pending
       from qc_batches
       where created_at >= now() - interval '24 hours'`
    )
  ).rows[0];

  const tests = (
    await q<any>(
      `select count(*)::int as total,
        sum(case when status='PASS' then 1 else 0 end)::int as passed,
        sum(case when status='FAIL' then 1 else 0 end)::int as failed
       from qc_tests
       where created_at >= now() - interval '24 hours'`
    )
  ).rows[0];

  return {
    date: new Date().toISOString().split('T')[0],
    batches: batches || { total: 0, released: 0, hold: 0, pending: 0 },
    tests: tests || { total: 0, passed: 0, failed: 0 },
    summary: `QC Daily Digest: ${batches?.total || 0} batches processed, ${tests?.failed || 0} test failures`,
  };
}
