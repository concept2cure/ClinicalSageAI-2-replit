import { getPool } from '../../../db';
import { ai } from '../../../lib/unified-ai-client';

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

const ON = !!process.env.ANTHROPIC_API_KEY;

type Card = {
  kind: string;
  title: string;
  rationale: string;
  expected_rpi_gain: number;
  effort: 'S' | 'M' | 'L';
  priority: number;
  due_date?: string | null;
  details: any;
};

/** Compute RPI for submission (simplified version) */
async function computeRPI(subId: string): Promise<number> {
  try {
    // Basic RPI calculation based on submission readiness
    const issues =
      (
        await q<any>(
          `
      SELECT COUNT(*) as count FROM (
        SELECT 1 FROM reg_questions WHERE sub_id=$1 AND status IN ('OPEN','DRAFTED') AND due_date < NOW()
        UNION ALL
        SELECT 1 FROM reg_m3_sections WHERE sub_id=$1 AND status != 'COMPLETE'
        UNION ALL
        SELECT 1 FROM reg_preflight_issues WHERE seq_id IN (SELECT seq_id FROM reg_sequences WHERE sub_id=$1) AND severity='CRITICAL'
      ) issues
    `,
          [subId]
        )
      ).rows[0]?.count || 0;

    return Math.max(0, 100 - issues * 5); // Simple scoring
  } catch (error) {
    return 50; // Default score if calculation fails
  }
}

/** Load policy for region */
async function loadPolicy(region: string): Promise<any> {
  try {
    const policy = (
      await q<any>(`SELECT rules_json FROM reg_rulesets WHERE region=$1 AND is_active=true`, [
        region,
      ])
    ).rows[0];
    return (
      policy?.rules_json || {
        module3: {
          requiredSections: ['3.2.P.5', '3.2.P.8', '3.2.S.4'],
          stability: { minCoverageMonths: 12, requireAccelerated: false },
          methods: { requireValidatedForCQA: true },
        },
      }
    );
  } catch (error) {
    return {
      module3: {
        requiredSections: ['3.2.P.5', '3.2.P.8', '3.2.S.4'],
        stability: { minCoverageMonths: 12, requireAccelerated: false },
        methods: { requireValidatedForCQA: true },
      },
    };
  }
}

/** Pull current facts across modules for a submission */
async function gatherFacts(subId: string) {
  const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [subId])).rows[0];
  if (!sub) throw new Error('Submission not found');

  const pol = await loadPolicy(sub.region || 'FDA');
  const m3 = (
    await q<any>(`select code,status,upstream_json from reg_m3_sections where sub_id=$1`, [subId])
  ).rows;
  const p5 = m3.find((s: any) => s.code.startsWith('3.2.P.5'));
  const p8 = m3.find((s: any) => s.code.startsWith('3.2.P.8'));
  const missing = (pol.module3?.requiredSections || []).filter(
    (c: string) => !m3.some((s: any) => s.code.startsWith(c))
  );

  const unvalidated = p5?.upstream_json?.quality?.unvalidated_methods || 0;
  const stabMonths = p8?.upstream_json?.stability?.coverage_months || 0;
  const stabTarget = pol.module3?.stability?.minCoverageMonths ?? 12;

  const ir = (
    await q<any>(
      `select q_id, sec_code, due_date from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
      [subId]
    )
  ).rows;
  const irDueSoon = ir.filter(
    (x: any) => x.due_date && new Date(x.due_date) <= new Date(Date.now() + 7 * 86400e3)
  ).length;
  const irOverdue = ir.filter((x: any) => x.due_date && new Date(x.due_date) < new Date()).length;

  const ob = (
    await q<any>(
      `select obl_id, due_date from reg_obligations where sub_id=$1 and status in ('OPEN','IN_PROGRESS')`,
      [subId]
    )
  ).rows;
  const oblDueSoon = ob.filter(
    (x: any) => x.due_date && new Date(x.due_date) <= new Date(Date.now() + 7 * 86400e3)
  ).length;
  const oblOverdue = ob.filter((x: any) => x.due_date && new Date(x.due_date) < new Date()).length;

  const qcOpen =
    (
      await q<any>(
        `select count(*)::int as n from qc_alerts a join qc_batches b on b.batch_id=a.batch_id where b.product_id=$1 and a.status='OPEN'`,
        [sub.product_id || 'PROD-001']
      )
    ).rows[0]?.n || 0;

  const seqCrit =
    (
      await q<any>(
        `select count(*)::int as n from reg_preflight_issues i join reg_sequences s on s.seq_id=i.seq_id where s.sub_id=$1 and i.severity='CRITICAL'`,
        [subId]
      )
    ).rows[0]?.n || 0;

  const rpi = await computeRPI(subId);

  return {
    sub,
    pol,
    m3,
    p5,
    p8,
    missing,
    unvalidated,
    stabMonths,
    stabTarget,
    irDueSoon,
    irOverdue,
    oblDueSoon,
    oblOverdue,
    qcOpen,
    seqCrit,
    rpi,
  };
}

/** Build candidate cards (deterministic). AI enhances rationale if available. */
async function buildCandidates(subId: string): Promise<Card[]> {
  const f = await gatherFacts(subId);
  const fx = (k: number) => (k <= 0 ? 'S' : k < 3 ? 'S' : k < 7 ? 'M' : 'L'); // crude effort map by missing count

  const cards: Card[] = [];

  if ((f.missing || []).length) {
    cards.push({
      kind: 'M3_COMPLETE',
      title: `Complete missing M3 sections: ${f.missing.join(', ')}`,
      rationale: `Required Module 3 sections are missing. Completing them increases dossier completeness and unblocks sequence QC.`,
      expected_rpi_gain: Math.min(12, f.missing.length * 4),
      effort: fx(f.missing.length),
      priority: 10,
      details: { missing: f.missing },
    });
  }

  if (f.unvalidated > 0) {
    cards.push({
      kind: 'METHODS_VALIDATE',
      title: `Validate & link methods for CQA specs (${f.unvalidated} gap${f.unvalidated > 1 ? 's' : ''})`,
      rationale: `Unvalidated methods on CQA specs in P.5 block sign‑off and reduce confidence in release/ongoing stability data.`,
      expected_rpi_gain: Math.min(10, f.unvalidated * 5),
      effort: fx(f.unvalidated),
      priority: 15,
      details: { unvalidated: f.unvalidated },
    });
  }

  if (f.stabMonths < f.stabTarget) {
    cards.push({
      kind: 'STABILITY_EXTEND',
      title: `Extend stability coverage to ${f.stabTarget}m (current ${f.stabMonths}m)`,
      rationale: `P.8 coverage below policy target (${f.stabTarget}m). Add tests/timepoints or incorporate ACC/LT data to meet threshold.`,
      expected_rpi_gain: Math.min(10, Math.round((f.stabTarget - f.stabMonths) / 3)),
      effort: 'M',
      priority: 20,
      details: { current: f.stabMonths, target: f.stabTarget },
    });
  }

  if (f.irOverdue > 0 || f.irDueSoon > 0) {
    cards.push({
      kind: 'IR_RESPOND',
      title: `Close agency IRs (${f.irOverdue} overdue / ${f.irDueSoon} due soon)`,
      rationale: `IR pressure degrades regulatory posture and can stall review. Draft responses and publish to M3.`,
      expected_rpi_gain: Math.min(12, f.irOverdue * 8 + f.irDueSoon * 4),
      effort: f.irOverdue + f.irDueSoon > 3 ? 'L' : 'M',
      priority: 5,
      details: { overdue: f.irOverdue, dueSoon: f.irDueSoon },
    });
  }

  if (f.oblOverdue > 0 || f.oblDueSoon > 0) {
    cards.push({
      kind: 'OBL_COMPLETE',
      title: `Fulfill obligations (${f.oblOverdue} overdue / ${f.oblDueSoon} due soon)`,
      rationale: `Overdue/due‑soon obligations reduce RPI and can trigger Gatekeeper HOLD/REJECT.`,
      expected_rpi_gain: Math.min(8, f.oblOverdue * 6 + f.oblDueSoon * 3),
      effort: f.oblOverdue + f.oblDueSoon > 2 ? 'M' : 'S',
      priority: 25,
      details: { overdue: f.oblOverdue, dueSoon: f.oblDueSoon },
    });
  }

  if (f.seqCrit > 0) {
    cards.push({
      kind: 'SEQ_PREFLIGHT_FIX',
      title: `Resolve ${f.seqCrit} critical preflight issue${f.seqCrit > 1 ? 's' : ''} before build`,
      rationale: `Preflight CRITICALs prevent sequence build. Fix them to enable eCTD packaging.`,
      expected_rpi_gain: Math.min(10, f.seqCrit * 5),
      effort: 'M',
      priority: 12,
      details: { critical: f.seqCrit },
    });
  }

  if (f.qcOpen > 0) {
    cards.push({
      kind: 'QC_INVESTIGATE',
      title: `Investigate ${f.qcOpen} open QC alert${f.qcOpen > 1 ? 's' : ''}`,
      rationale: `Open QC alerts indicate trend risk which lowers RPI and may question process control.`,
      expected_rpi_gain: Math.min(5, Math.round(f.qcOpen / 2)),
      effort: 'M',
      priority: 40,
      details: { open: f.qcOpen },
    });
  }

  // AI enhance rationale (optional)
  if (ON && cards.length > 0) {
    try {
      const msg = cards
        .slice(0, 8)
        .map((c, i) => `${i + 1}. ${c.title} | Why: ${c.rationale}`)
        .join('\n');
      const text = await aiClient.complete([
          {
            role: 'system',
            content:
              "You are a senior CMC regulatory advisor. Rewrite each card's 'Why' to be crisp and executive-ready. Keep one sentence per item. Return the same list numbered 1..N with only the rewritten sentences.",
          },
          { role: 'user', content: msg },
        ], { temperature: 0.2, callerModule: 'playbook/buildCandidates' });
      const lines = (text || '').split('\n').filter(Boolean);
      lines.forEach((line, idx) => {
        const t = line.replace(/^\d+\.\s*/, '').trim();
        if (cards[idx] && t) cards[idx].rationale = t;
      });
    } catch (error) {
      console.warn('AI enhancement failed:', error);
    }
  }

  // score to pick top 5 by priority within expected_rpi_gain
  cards.sort((a, b) => a.priority - b.priority || b.expected_rpi_gain - a.expected_rpi_gain);
  return cards.slice(0, 5);
}

/** Persist computed cards (replace OPEN/EXPIRED generation) */
export async function generatePlaybook(subId: string, actor: string) {
  // expire old OPEN cards not pinned
  await q(
    `update reg_playbook_cards set status='EXPIRED' where sub_id=$1 and status='OPEN' and pinned=false`,
    [subId]
  );
  const cards = await buildCandidates(subId);
  const out: any[] = [];
  for (const c of cards) {
    const row = (
      await q<any>(
        `insert into reg_playbook_cards (sub_id, kind, title, rationale, details, expected_rpi_gain, effort, priority, due_date, created_by)
                                values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [
          subId,
          c.kind,
          c.title,
          c.rationale,
          c.details,
          c.expected_rpi_gain,
          c.effort,
          c.priority,
          c.due_date || null,
          actor,
        ]
      )
    ).rows[0];
    out.push(row);
  }
  return out;
}

/** Accept a card → open tasks (safe defaults) */
export async function acceptCard(cardId: string, actor: string) {
  const c = (await q<any>(`select * from reg_playbook_cards where card_id=$1`, [cardId])).rows[0];
  if (!c) throw new Error('Card not found');

  // Update card status
  await q(`update reg_playbook_cards set status='ACCEPTED' where card_id=$1`, [cardId]);

  // Log decision
  await q(
    `insert into reg_playbook_decisions (card_id, sub_id, action, by_user, reason) values ($1,$2,'ACCEPT',$3,'Accepted via playbook')`,
    [cardId, c.sub_id, actor]
  );

  // Create appropriate task based on card kind
  const title =
    c.kind === 'METHODS_VALIDATE'
      ? 'Validate & link methods for CQA specs'
      : c.kind === 'STABILITY_EXTEND'
        ? 'Extend stability coverage'
        : c.kind === 'IR_RESPOND'
          ? 'Respond to agency IRs'
          : c.kind === 'OBL_COMPLETE'
            ? 'Complete obligations'
            : c.kind === 'SEQ_PREFLIGHT_FIX'
              ? 'Fix preflight issues'
              : c.kind === 'QC_INVESTIGATE'
                ? 'Investigate QC alerts'
                : c.title;

  const task = (
    await q<any>(
      `insert into reg_tasks (sub_id, title, description, priority, status, due_date, created_by, source_type, source_id)
                             values ($1,$2,$3,$4,'OPEN',$5,$6,'PLAYBOOK',$7) returning *`,
      [c.sub_id, title, c.rationale, c.priority, c.due_date, actor, cardId]
    )
  ).rows[0];

  return { card: c, task };
}

/** Snooze a card until date */
export async function snoozeCard(cardId: string, until: string, actor: string, reason?: string) {
  const c = (await q<any>(`select * from reg_playbook_cards where card_id=$1`, [cardId])).rows[0];
  if (!c) throw new Error('Card not found');

  await q(`update reg_playbook_cards set status='SNOOZED', snooze_until=$2 where card_id=$1`, [
    cardId,
    until,
  ]);
  await q(
    `insert into reg_playbook_decisions (card_id, sub_id, action, by_user, reason, payload_json) values ($1,$2,'SNOOZE',$3,$4,$5)`,
    [cardId, c.sub_id, actor, reason || 'Snoozed', JSON.stringify({ until })]
  );

  return c;
}

/** Reject a card */
export async function rejectCard(cardId: string, actor: string, reason?: string) {
  const c = (await q<any>(`select * from reg_playbook_cards where card_id=$1`, [cardId])).rows[0];
  if (!c) throw new Error('Card not found');

  await q(`update reg_playbook_cards set status='REJECTED' where card_id=$1`, [cardId]);
  await q(
    `insert into reg_playbook_decisions (card_id, sub_id, action, by_user, reason) values ($1,$2,'REJECT',$3,$4)`,
    [cardId, c.sub_id, actor, reason || 'Rejected']
  );

  return c;
}

/** Get cards for submission */
export async function getPlaybookCards(subId: string, includeExpired = false) {
  const statusFilter = includeExpired ? '' : ` and status != 'EXPIRED'`;
  const cards = (
    await q<any>(
      `select * from reg_playbook_cards where sub_id=$1${statusFilter} order by priority, created_at desc`,
      [subId]
    )
  ).rows;
  return cards;
}

/** Simulate RPI gain from accepting cards */
export async function simulateRPIGain(subId: string, cardIds: string[]) {
  const currentRPI = await computeRPI(subId);
  const cards = (
    await q<any>(`select expected_rpi_gain from reg_playbook_cards where card_id = any($1)`, [
      cardIds,
    ])
  ).rows;
  const totalGain = cards.reduce((sum: number, c: any) => sum + (c.expected_rpi_gain || 0), 0);
  const projectedRPI = Math.min(100, currentRPI + totalGain);

  return {
    current: currentRPI,
    projected: projectedRPI,
    gain: totalGain,
    cards: cards.length,
  };
}
