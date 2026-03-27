#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [workstreamId, summary = 'checkpoint'] = process.argv.slice(2);

if (!workstreamId) {
  console.error('Usage: node scripts/oss/create-checkpoint.mjs <workstream-id> [summary]');
  process.exit(1);
}

const allowed = new Set([
  'control-tower',
  'ingestion-plane',
  'governance-observability-plane',
  'retrieval-evidence-plane',
  'workflow-compute-plane',
  'eval-release-plane',
]);

if (!allowed.has(workstreamId)) {
  console.error(`Unknown workstream id: ${workstreamId}`);
  process.exit(1);
}

const now = new Date();
const isoDate = now.toISOString().slice(0, 10);
const stamp = now.toISOString().replace(/[:.]/g, '-');
const safeSummary = summary.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');

const outDir = path.join(process.cwd(), 'docs/audits/checkpoints');
fs.mkdirSync(outDir, { recursive: true });

const filename = `${isoDate}_${workstreamId}_${safeSummary}_${stamp}.md`;
const outPath = path.join(outDir, filename);

const body = `# OSS Swarm Checkpoint

- **Timestamp:** ${now.toISOString()}
- **Workstream:** ${workstreamId}
- **Summary:** ${summary}
- **Supervisor decision:** GO / NO-GO (choose one)

## Build slice
- What was implemented:
- Interfaces/contracts touched:
- Feature flags involved:

## Audit evidence
- Supervisor command: \`npm run oss:supervisor:audit\`
- Result: PASS / FAIL
- No-break surfaces reviewed:
  - server/services/export/governedExportConsequence.ts
  - server/routes/510k-estar-routes.ts
  - server/routes/cerv2-export-routes.ts
  - server/routes/conversation-os.ts

## Test evidence
- \`npm run typecheck\`:
- \`npm test\`:
- \`npm run test:ana\` (if applicable):

## Rollback note
- Toggle(s) to disable:
- Fallback path:
- Data/audit impact:

## Follow-up actions
- [ ]
- [ ]
`;

fs.writeFileSync(outPath, body, 'utf8');
console.log(`Created checkpoint template: ${path.relative(process.cwd(), outPath)}`);
