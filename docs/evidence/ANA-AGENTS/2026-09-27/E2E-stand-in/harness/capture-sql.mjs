// The database rows behind each captured scenario: the run row, the saved
// messages (with the metadata S1/S4 write), and the turn record, found by the
// run and thread ids the browser received on the stream (frames/<id>.json).
//   node capture-sql.mjs <scenario> [...]    OUT, DATABASE_URL
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT;
const DB = process.env.DATABASE_URL;
if (!OUT || !DB) throw new Error('OUT and DATABASE_URL are required');
fs.mkdirSync(path.join(OUT, 'sql'), { recursive: true });

const psql = (sql, flags = ['-P', 'pager=off']) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', ...flags, '-c', sql]).toString();
const q = s => `'${String(s).replace(/'/g, "''")}'`;

function recordSummary(recordText) {
  const r = JSON.parse(recordText);
  const out = {
    model: { effort: r.model?.effort, model: r.model?.model, calls: r.model?.calls?.length },
    turn: r.turn ? { runId: r.turn.runId, outcome: r.turn.outcome, surface: r.turn.surface } : undefined,
    warnings: r.warnings,
    controls: r.controls,
    steps: (r.steps || []).map(s => ({ round: s.round, tool: s.tool, label: s.label, status: s.status, error: s.error })),
  };
  return JSON.stringify(out, null, 1);
}

for (const id of process.argv.slice(2)) {
  const streams = JSON.parse(fs.readFileSync(path.join(OUT, 'frames', `${id}.json`), 'utf8'));
  const runs = streams.map(s => s.frames.find(f => f.type === 'run_started')?.runId).filter(Boolean);
  const threads = [...new Set(streams.map(s => s.frames.find(f => f.type === 'thread_id')?.thread_id).filter(Boolean))];
  let text = `# ${id} — rows in ${DB.replace(/\/\/[^@]*@/, '//')}\n# runs: ${runs.join(', ') || '(none: no run_started on the stream)'}\n# threads: ${threads.join(', ')}\n\n`;
  if (runs.length) {
    text += '## ana_runs\n';
    text += psql(
      `SELECT id, status, stopped_reason, current_round, surface,
              jsonb_array_length(control_events) AS controls,
              pending_approval->>'command' AS pending_command,
              approval_decision->>'decided' AS decided,
              approval_decision->>'byUserId' AS decided_by,
              to_char(created_at, 'HH24:MI:SS.MS') AS created, to_char(finished_at, 'HH24:MI:SS.MS') AS finished
         FROM ana_runs WHERE id IN (${runs.map(q).join(',')}) ORDER BY created_at`,
    );
    text += '\n## ana_runs.control_events\n';
    text += psql(`SELECT id, jsonb_pretty(control_events) FROM ana_runs WHERE id IN (${runs.map(q).join(',')}) ORDER BY created_at`);
  } else {
    text += '## ana_runs\n(no run_started frame: the turn opened no run row)\n';
    text += psql(`SELECT count(*) AS runs_created_during_the_turn FROM ana_runs WHERE created_at BETWEEN (SELECT min(created_at) FROM chat_messages WHERE thread_id IN (${threads.map(q).join(',')})) - interval '5 seconds' AND (SELECT max(created_at) FROM chat_messages WHERE thread_id IN (${threads.map(q).join(',')})) + interval '5 seconds'`);
  }
  if (threads.length) {
    text += '\n## chat_messages (the saved turn; metadata fields S1/S4 write)\n';
    text += psql(
      `SELECT id, role, left(replace(content, E'\\n', ' '), 90) AS content,
              metadata->>'stoppedReason' AS stopped_reason, metadata->>'rounds' AS rounds,
              metadata->>'runPolicy' AS run_policy, metadata->'pendingSteps' AS pending_steps
         FROM chat_messages WHERE thread_id IN (${threads.map(q).join(',')}) ORDER BY id`,
    );
    text += '\n## chat_messages.metadata policyHolds / humanControls / warnings (assistant rows)\n';
    text += psql(
      `SELECT id, jsonb_pretty(jsonb_strip_nulls(jsonb_build_object(
                'policyHolds', metadata->'policyHolds', 'humanControls', metadata->'humanControls',
                'warnings', metadata->'warnings', 'stoppedReason', metadata->'stoppedReason')))
         FROM chat_messages WHERE thread_id IN (${threads.map(q).join(',')}) AND role = 'assistant' ORDER BY id`,
    );
  }
  if (threads.length) {
    const ids = execFileSync('psql', [DB, '-At', '-c', `SELECT id FROM ana_turn_records WHERE thread_id IN (${threads.map(q).join(',')}) ORDER BY started_at`]).toString().trim().split('\n').filter(Boolean);
    for (const recId of ids) {
      text += `\n## ana_turn_records ${recId} (row columns, then the record's own fields)\n`;
      text += psql(`SELECT run_id, outcome, schema_version, record_sha256 = encode(sha256(convert_to(record_text, 'UTF8')), 'hex') AS hash_ok FROM ana_turn_records WHERE id = ${q(recId)}`);
      text += recordSummary(execFileSync('psql', [DB, '-At', '-c', `SELECT record_text FROM ana_turn_records WHERE id = ${q(recId)}`]).toString().trim()) + '\n';
    }
  }
  fs.writeFileSync(path.join(OUT, 'sql', `${id}.txt`), text);
  console.info(`sql/${id}.txt: ${runs.length} run(s), ${threads.length} thread(s)`);
}
