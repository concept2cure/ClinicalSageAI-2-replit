#!/usr/bin/env node
/**
 * Self-test for ci:canvas-path — shows the gate FAILING on each of the six
 * cuts it exists to catch, per CLAUDE.md ("a gate that has only ever been
 * seen to pass has not been tested"), then passing on an intact tree.
 *
 * Builds a minimal synthetic tree (the seven files the gate reads, written
 * so every link is intact), confirms the gate passes on it, then for each
 * rule copies the tree, cuts exactly that link, and requires exit 1 with a
 * finding naming that rule and no other. The synthetic tree, not the real
 * one, is the pass case on purpose: the real tree's verdict is the gate's own
 * job in CI, and a selftest that depended on it would be red for reasons
 * that have nothing to do with the gate.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-canvas-path.mjs');

const INTACT = {
  'client/src/concept2cure/v2/surfaces/ConversationThread.tsx': `
import { DocumentCanvas } from '../editor/DocumentCanvas';
export function ConversationThread() { return <DocumentCanvas docId="x" />; }
`,
  'client/src/concept2cure/v2/editor/DocumentCanvas.tsx': `
import { DocumentWorkbench } from './DocumentWorkbench';
export function DocumentCanvas() { return <DocumentWorkbench docs={[]} />; }
`,
  'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx': `
import { ProjectFilesPanel } from './ProjectFilesPanel';
import { FileToVaultDialog } from './FileToVaultDialog';
export function DocumentWorkbench() { return <><ProjectFilesPanel /><FileToVaultDialog /></>; }
`,
  'client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx': `
export function ProjectFilesPanel() { const url = '/api/c2c/project-vault/' + 'id'; return null; }
`,
  'client/src/concept2cure/v2/editor/FileToVaultDialog.tsx': `
export function FileToVaultDialog() { const url = '/api/authoring/docs/x/file-to-vault'; return null; }
`,
  'client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx': `
import { DocumentWorkbench } from '../editor/DocumentWorkbench';
export function DocumentAuthoring() { return <DocumentWorkbench docs={[]} />; }
`,
  'server/services/ana/document-surface-tool-defs.ts': `
export const DEFS = [{ name: 'draft_authoring_document', description: 'x' }];
`,
  'server/services/ana/AnaToolExecutor.ts': `
export function run(name) { switch (name) { case 'draft_authoring_document': return 1; } }
`,
  'server/routes/authoring.router.ts': `
router.post('/docs/:docId/file-to-vault', async (req, res) => { res.json({}); });
`,
};

/** Each cut: the file to rewrite and the rule that must be the one finding. */
const CUTS = [
  {
    rule: 'thread-mounts-canvas',
    file: 'client/src/concept2cure/v2/surfaces/ConversationThread.tsx',
    // A commented-out mount must not count.
    body: `// import { DocumentCanvas } from '../editor/DocumentCanvas';\nexport function ConversationThread() { return null; /* <DocumentCanvas /> */ }\n`,
  },
  {
    rule: 'canvas-mounts-workbench',
    file: 'client/src/concept2cure/v2/editor/DocumentCanvas.tsx',
    body: `export function DocumentCanvas() { return <div>a second editor</div>; }\n`,
  },
  {
    rule: 'surface-mounts-workbench',
    file: 'client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx',
    body: `import { RichSectionEditor } from '../editor/RichSectionEditor';\nexport function DocumentAuthoring() { return <RichSectionEditor />; }\n`,
  },
  {
    rule: 'tool-registered',
    file: 'server/services/ana/document-surface-tool-defs.ts',
    body: `export const DEFS = [{ name: 'save_document_to_vault' }];\n`,
  },
  {
    rule: 'workbench-reads-vault',
    file: 'client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx',
    body: `export function ProjectFilesPanel() { return null; }\n`,
  },
  {
    rule: 'file-to-vault-route',
    file: 'server/routes/authoring.router.ts',
    body: `router.post('/docs/:docId/export', async (req, res) => { res.json({}); });\n`,
  },
];

function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
}

function run(root) {
  const r = spawnSync(process.execPath, [GATE, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, CANVAS_PATH_ROOT: root },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    /* reported below */
  }
  return { status: r.status, parsed, raw: r.stdout + r.stderr };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-path-selftest-'));
let failed = false;

const intact = path.join(tmp, 'intact');
writeTree(intact, INTACT);
const good = run(intact);
if (good.status !== 0 || !good.parsed?.ok) {
  console.error('selftest FAILED: the gate does not pass on an intact synthetic tree\n', good.raw);
  failed = true;
} else {
  console.log('✅ selftest: gate passes on an intact tree (6/6 links)');
}

for (const cut of CUTS) {
  const root = path.join(tmp, cut.rule);
  writeTree(root, { ...INTACT, [cut.file]: cut.body });
  const bad = run(root);
  const rules = new Set((bad.parsed?.findings ?? []).map((f) => f.rule));
  const onlyThis = rules.size === 1 && rules.has(cut.rule);
  if (bad.status !== 1 || !onlyThis) {
    console.error(`selftest FAILED: cutting ${cut.rule} did not produce exactly that finding (exit ${bad.status}, rules: ${[...rules].join(', ') || 'none'})`);
    console.error(bad.raw);
    failed = true;
  } else {
    console.log(`✅ selftest: gate exits 1 and names [${cut.rule}] when ${path.basename(cut.file)} cuts the link`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
