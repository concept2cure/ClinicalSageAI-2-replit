#!/usr/bin/env node
import { aggregateSessions, readJsonOrThrow } from './lib/uat-aggregate.mjs';

const file = process.argv[2] || 'docs/evals/oss_stack_human_sessions.template.json';

try {
  const payload = readJsonOrThrow(file, 'sessions');
  const sessions = payload.sessions || [];

  if (!Array.isArray(sessions) || sessions.length === 0) {
    console.error('❌ No sessions found');
    process.exit(1);
  }

  const metrics = aggregateSessions(sessions);
  const result = { source_file: file, ...metrics };

  console.log(JSON.stringify(result, null, 2));

  if (metrics.critical_defects_open > 0) {
    console.error('❌ Critical defects must be zero for GA readiness');
    process.exit(1);
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
