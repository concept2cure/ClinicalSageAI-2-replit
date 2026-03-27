#!/usr/bin/env node
import fs from 'node:fs';
import {
  aggregateSessions,
  applyMetricsToScorecard,
  readJsonOrThrow,
} from './lib/uat-aggregate.mjs';

const sessionsFile = process.argv[2] || 'docs/evals/oss_stack_human_sessions.template.json';
const scorecardFile = process.argv[3] || 'docs/evals/oss_stack_scorecard.template.json';

try {
  const sessionsPayload = readJsonOrThrow(sessionsFile, 'sessions');
  const scorecard = readJsonOrThrow(scorecardFile, 'scorecard');

  const metrics = aggregateSessions(sessionsPayload.sessions || []);
  applyMetricsToScorecard(scorecard, metrics);

  fs.writeFileSync(scorecardFile, JSON.stringify(scorecard, null, 2) + '\n');
  console.log(`✅ Synced scorecard human_testing from ${sessionsFile} -> ${scorecardFile}`);
  console.log(JSON.stringify(scorecard.human_testing, null, 2));
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
