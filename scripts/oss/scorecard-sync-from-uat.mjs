#!/usr/bin/env node
import fs from 'node:fs';
import {
  aggregateSessions,
  applyMetricsToScorecard,
  readJsonOrThrow,
} from './lib/uat-aggregate.mjs';

const scorecardFile = process.argv[2] || 'docs/evals/oss_stack_scorecard.template.json';
const sessionsFile = process.argv[3] || 'docs/evals/oss_stack_human_sessions.template.json';
const outputFile = process.argv[4] || scorecardFile;

try {
  const scorecard = readJsonOrThrow(scorecardFile, 'scorecard');
  const sessionsPayload = readJsonOrThrow(sessionsFile, 'sessions');

  const metrics = aggregateSessions(sessionsPayload.sessions || []);
  applyMetricsToScorecard(scorecard, metrics);

  fs.writeFileSync(outputFile, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');
  console.log(`✅ Scorecard updated from UAT sessions: ${outputFile}`);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
