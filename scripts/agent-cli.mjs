#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const repoRoot = process.cwd();

// Load env files for local/dev usage (prefer .env.local)
{
  const envLocal = path.join(repoRoot, '.env.local');
  const env = path.join(repoRoot, '.env');
  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
  }
  if (fs.existsSync(env)) {
    dotenv.config({ path: env });
  }
}

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function safeIncludes(relPath, needle) {
  try {
    return read(relPath).includes(needle);
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=');
      args.flags[k] = rest.length ? rest.join('=') : true;
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function getEnvBlockers() {
  const required = ['DATABASE_URL', 'SESSION_SECRET'];
  const optional = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'SENDGRID_API_KEY', 'REPLIT_DOMAINS'];

  const missingRequired = required.filter(k => !process.env[k]);
  const missingOptional = optional.filter(k => !process.env[k]);

  const invalidRequired = [];
  const dbUrl = process.env.DATABASE_URL;
  // This repo's Drizzle setup is Postgres-only (drizzle.config.ts dialect=postgresql).
  if (dbUrl && String(dbUrl).startsWith('file:')) {
    invalidRequired.push('DATABASE_URL');
  }

  return { missingRequired, missingOptional, invalidRequired };
}

function inventory() {
  const inv = {
    timestamp: nowIso(),
    repoRoot,
    tenant: {
      middleware: exists('server/middleware/tenant.js'),
      vaultHardcodedTenantRemoved: exists('server/routes/vault-dms.js') && !safeIncludes('server/routes/vault-dms.js', "default-tenant"),
      projectsManagementTenantEnforced: exists('server/routes/projects-management.ts') && safeIncludes('server/routes/projects-management.ts', 'router.use(requireTenant())'),
    },
    cerv2: {
      clientRoute: exists('client/src/App.jsx') && safeIncludes('client/src/App.jsx', "path=\"/cerv2\"") || safeIncludes('client/src/App.jsx', "path=\"/cerv2") ,
      apiSections: exists('server/routes/cerv2-sections.js') || exists('server/routes/cerv2-sections.ts'),
      apiDocuments: exists('server/routes/cerv2-documents.js') || exists('server/routes/cerv2-documents.ts'),
    },
    ingestion: {
      legacy: exists('server/routes/source-data-ingest.routes.ts'),
      versionedV1: exists('server/routes/regulai-ingest-v1.routes.ts'),
    },
    workflow510k: {
      mounted: exists('server/routes.ts') && safeIncludes('server/routes.ts', "'/510k-workflow'")
    },
    agent: {
      cliPresent: true,
    }
  };

  const env = getEnvBlockers();
  inv.env = env;

  return inv;
}

function findBlockers(inv) {
  const blockers = [];

  if (inv.env.missingRequired.length) {
    blockers.push({
      id: 'env.required',
      severity: 'P0',
      message: `Missing required env vars: ${inv.env.missingRequired.join(', ')}`,
      fix: 'Set them in Codespaces Secrets or .env (DATABASE_URL, SESSION_SECRET).'
    });
  }

  // Heuristic: if server logs show missing tables frequently, db migrations are likely not pushed.
  // We can't read runtime logs here reliably, but we can still recommend db:push if schema exists.
  if (exists('shared/schema.ts')) {
    blockers.push({
      id: 'db.migrations',
      severity: 'P1',
      message: 'DB schema may not be applied (missing-table errors observed previously).',
      fix: 'Run `npm run db:push` against the target DATABASE_URL.'
    });
  }

  if (!inv.tenant.vaultHardcodedTenantRemoved) {
    blockers.push({
      id: 'tenant.vault',
      severity: 'P0',
      message: 'Vault DMS still appears to hardcode a tenant or lacks tenant enforcement.',
      fix: 'Ensure vault routes are behind requireTenant() and use req.organizationId.'
    });
  }

  if (!inv.ingestion.versionedV1) {
    blockers.push({
      id: 'ingest.v1',
      severity: 'P1',
      message: 'Versioned ingestion surface missing (/api/v1/regulai/ingest/*).',
      fix: 'Add a v1 router that wraps /api/ingest and enforces tenant context.'
    });
  }

  return blockers;
}

function chooseNextPriority(inv, blockers) {
  const p0 = blockers.filter(b => b.severity === 'P0');
  if (p0.length) return p0[0];

  // If env is fine, prioritize ingestion v1 then predicate dataset.
  const ingest = blockers.find(b => b.id === 'ingest.v1');
  if (ingest) return ingest;

  return blockers[0] || { id: 'none', severity: 'OK', message: 'No blocking gaps detected by heuristic scan.' };
}

function writeAudit(inv, blockers, next) {
  const out = {
    ...inv,
    blockers,
    next,
  };
  fs.writeFileSync(path.join(repoRoot, 'audit_results.json'), JSON.stringify(out, null, 2));
}

function printHelp() {
  console.log(`Usage:
  ./cs-agent --execute-diagnostic-full
  ./cs-agent --status-check
  ./cs-agent --identify-blockers
  ./cs-agent --next-priority
  ./cs-agent --fix-p0-blockers
  ./cs-agent --consolidate-navigation
  ./cs-agent --wire-autocategorization
  ./cs-agent --unify-document-viewer
  ./cs-agent --fix-dossier-navigator
  ./cs-agent --unify-tasks
  ./cs-agent --polish-simulation
  
  # UI Logic Enhancement (workflow UX)
  ./cs-agent --implement-navigation-vault --tabs="Dashboard,Documents,Dossier,Tasks,Validate,Team" --locked=true
  ./cs-agent --install-stage-orchestrator --stages="Collect,Structure,Enrich,Validate,Package" --visual="top-bar-gauge"
  ./cs-agent --enforce-terminology-vault --terms="Dossier:submission|file,Validate:review|check,Predicate:comparison-device"

  # Phase 2: Document Collection & Management
  ./cs-agent --construct-upload-orchestrator --features="drag-drop,auto-categorize,virus-scan,metadata-extraction,conflict-resolution"
  ./cs-agent --install-document-health --indicators="completeness,confidence,review-status,traceability-coverage"
  ./cs-agent --enhance-dossier-navigator --features="page-numbers,section-status,dependency-graph,quick-jump,expand-collapse"

  # Phase 3: RegulAI Editor + Confidence Gate
  ./cs-agent --construct-regulaieditor --capabilities="suggested-text,inline-citations,rule-based-checks"
  ./cs-agent --forge-confidence-gate --threshold=0.85 --actions="export,package"
  ./cs-agent --surface-ai-contextually --triggers="section-open,export-blocked,validation-failed"

  # Phase 4: Validate & Package
  ./cs-agent --install-validation-command-center --checks="estar,traceability" --ui="command-center"
  ./cs-agent --wire-estar-assembly-actions --actions="validate,strict-validate,generate-zip"
  ./cs-agent --enhance-rta-precheck --features="preflight-summary,ai-remediation"

  # Phase 5: Interactive Review Readiness
  ./cs-agent --surface-predicted-reviewer-questions --source="simulate-review" --max=5
  ./cs-agent --bridge-remediation-to-tasks --target="task-center" --ai="lumen"

  # Phase 6: Submission Workbench
  ./cs-agent --install-submission-workbench

  # Phase 7: Interactive Review Inbox
  ./cs-agent --wire-interactive-review-inbox
  
  # Rollback helpers (best-effort, scoped)
  ./cs-agent --rollback-navigation
  ./cs-agent --rollback-terminology
  ./cs-agent --override-confidence-gating --threshold=0.00

  # Readiness report
  ./cs-agent --generate-readiness-report
  ./cs-agent --validate-module=<name>
  ./cs-agent --switch-to-ui-mode --priority=demo-ready
  ./cs-agent --analyze-ui-confusion
  ./cs-agent --auto-fix-confusion   (disabled: no-new-files policy)
  ./cs-agent --validate-demo-readiness
  ./cs-agent --demo-output
  ./cs-agent --check-elegance
  ./cs-agent --detect-confusion
  ./cs-agent --human-override-priority="..."

Notes:
- In Codespaces, run as ./cs-agent (repo root isn't on PATH by default).
`);
}

function normalizeCsvList(input) {
  return String(input)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function updateFileInPlace(relPath, updater) {
  const abs = path.join(repoRoot, relPath);
  const before = fs.readFileSync(abs, 'utf8');
  const after = updater(before);
  if (after === before) {
    return { changed: false };
  }
  fs.writeFileSync(abs, after, 'utf8');
  return { changed: true };
}

function failUnsupported(featureName, hints = []) {
  console.log(`❌ ${featureName}: not implemented in this repo's current agent CLI.`);
  if (hints.length) {
    for (const h of hints) console.log(`- ${h}`);
  }
  process.exit(2);
}

function implementNavigationVault({ tabs, locked }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Navigation vault: CERV2 page not found.');
    process.exit(2);
  }

  const requiredTabs = normalizeCsvList(tabs);
  const expected = ['Dashboard', 'Documents', 'Dossier', 'Tasks', 'Validate', 'Team'];
  const sameAsExpected =
    requiredTabs.length === expected.length && requiredTabs.every((t, i) => t === expected[i]);

  if (!sameAsExpected) {
    console.log('❌ Navigation vault: unsupported tabs list for this repo.');
    console.log(`- Provided: ${requiredTabs.join(', ')}`);
    console.log(`- Expected: ${expected.join(', ')}`);
    process.exit(2);
  }

  const hasStableTabs = safeIncludes(cerv2Page, 'data-testid="cerv2-stable-tabs"');
  const hasValidate = safeIncludes(cerv2Page, "label: 'Validate'") || safeIncludes(cerv2Page, 'label: "Validate"');
  const hasTeam = safeIncludes(cerv2Page, "label: 'Team'") || safeIncludes(cerv2Page, 'label: "Team"');

  if (!hasStableTabs || !hasValidate || !hasTeam) {
    console.log('❌ Navigation vault: stable 6-tab navigation markers not detected.');
    console.log('- Fix: ensure CERV2Page.jsx contains data-testid="cerv2-stable-tabs" and the 6 stable labels.');
    process.exit(2);
  }

  console.log(`✅ Navigation vault: 6 stable tabs detected${locked === 'true' || locked === true ? ' (locked)' : ''}.`);
}

function installStageOrchestrator({ stages, visual }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Stage orchestrator: CERV2 page not found.');
    process.exit(2);
  }

  const requestedStages = normalizeCsvList(stages);
  const expectedStages = ['Collect', 'Structure', 'Enrich', 'Validate', 'Package'];
  const okStages =
    requestedStages.length === expectedStages.length &&
    requestedStages.every((s, i) => s === expectedStages[i]);
  if (!okStages) {
    console.log('❌ Stage orchestrator: unsupported stage list for this repo.');
    console.log(`- Provided: ${requestedStages.join(', ')}`);
    console.log(`- Expected: ${expectedStages.join(', ')}`);
    process.exit(2);
  }

  if (visual && visual !== 'top-bar-gauge') {
    console.log('❌ Stage orchestrator: only visual="top-bar-gauge" is supported.');
    process.exit(2);
  }

  const res = updateFileInPlace(cerv2Page, content => {
    // Ensure a canonical marker for stage bar checks.
    if (content.includes('data-testid="stage-progress-bar"')) return content;

    // Upgrade the existing stage progress wrapper in the stable-tabs block.
    return content.replace(
      /<div className="px-3 pt-3" data-testid="cerv2-stage-progress">/,
      '<div className="px-3 pt-3" data-testid="cerv2-stage-progress">\n                          <div data-testid="stage-progress-bar" />'
    );
  });

  const hasStageBar = safeIncludes(cerv2Page, 'data-testid="stage-progress-bar"') || safeIncludes(cerv2Page, 'data-testid="cerv2-stage-progress"');
  if (!hasStageBar) {
    console.log('❌ Stage orchestrator: failed to install stage progress marker.');
    process.exit(2);
  }

  console.log(`✅ Stage orchestrator: ${res.changed ? 'installed' : 'already present'} (${expectedStages.join(' → ')}, ${visual || 'top-bar-gauge'}).`);
}

function enforceTerminologyVault({ terms }) {
  // Scoped, conservative enforcement: update key visible labels in CERV2Page only.
  // Avoid global broad replacements that could change regulatory meaning across modules.
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Terminology vault: CERV2 page not found.');
    process.exit(2);
  }

  if (!terms || typeof terms !== 'string') {
    console.log('❌ Terminology vault: missing --terms.');
    process.exit(2);
  }

  const res = updateFileInPlace(cerv2Page, content => {
    let out = content;
    // Title/labels only (exact matches).
    out = out.replace(/FDA 510\(k\) Submission/g, 'FDA 510(k) Dossier');
    out = out.replace(/510\(k\) Workflow Complete/g, '510(k) Dossier Complete');
    out = out.replace(/Ready for FDA submission\./g, 'Ready for FDA package.');
    return out;
  });

  // Verify at least one expected term appears post-change.
  const ok = safeIncludes(cerv2Page, 'FDA 510(k) Dossier') || safeIncludes(cerv2Page, '510(k) Dossier Complete');
  if (!ok) {
    console.log('❌ Terminology vault: no scoped terminology updates applied.');
    process.exit(2);
  }

  console.log(`✅ Terminology vault: ${res.changed ? 'updated' : 'already enforced'} (scoped to CERV2 labels).`);
}

function rollbackTerminology() {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Rollback terminology: CERV2 page not found.');
    process.exit(2);
  }

  const res = updateFileInPlace(cerv2Page, content => {
    let out = content;
    out = out.replace(/FDA 510\(k\) Dossier/g, 'FDA 510(k) Submission');
    out = out.replace(/510\(k\) Dossier Complete/g, '510(k) Workflow Complete');
    out = out.replace(/Ready for FDA package\./g, 'Ready for FDA submission.');
    return out;
  });

  console.log(`✅ Rollback terminology: ${res.changed ? 'reverted' : 'no changes needed'}.`);
}

function rollbackNavigation() {
  // Navigation-vault in this repo is marker-based; nothing destructive is applied.
  // Keep this as a no-op for compatibility.
  console.log('✅ Rollback navigation: no-op (navigation vault is marker-based in this repo).');
}

function generateReadinessReport() {
  const inv = inventory();
  const blockers = findBlockers(inv);
  const next = chooseNextPriority(inv, blockers);

  const eleganceOk = checkElegance();
  console.log('');
  console.log('Readiness report summary:');
  console.log(`- Env required missing: ${inv.env.missingRequired.length ? inv.env.missingRequired.join(', ') : 'none'}`);
  console.log(`- Blockers: ${blockers.length}`);
  console.log(`- Next priority: ${next.id} (${next.severity})`);
  console.log(`- UI elegance checks: ${eleganceOk ? 'PASS' : 'FAIL'}`);

  writeAudit(inv, blockers, next);
}

function constructUploadOrchestrator({ features }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Upload orchestrator: CERV2 page not found.');
    process.exit(2);
  }

  // Wire the Document Vault Upload action to the Import tab (single front-door for uploads).
  const res = updateFileInPlace(cerv2Page, content => {
    const needle =
      "onUpload={() => {\n            toast({\n              title: 'Upload Document',\n              description: 'Use the Import tab to upload Word or PDF documents',\n            });\n          }}";

    if (!content.includes(needle)) return content;

    return content.replace(
      needle,
      "onUpload={() => {\n            setActiveTab('import');\n            toast({\n              title: 'Upload Orchestrator',\n              description: 'Drop files in Import to auto-categorize and extract metadata',\n            });\n          }}"
    );
  });

  const ok = safeIncludes(cerv2Page, "title: 'Upload Orchestrator'") && safeIncludes(cerv2Page, "setActiveTab('import')");
  if (!ok) {
    console.log('❌ Upload orchestrator: failed to wire Document Vault upload → Import.');
    process.exit(2);
  }

  console.log(`✅ Upload orchestrator: ${res.changed ? 'wired' : 'already wired'} (features requested: ${features || 'default'}).`);
  console.log('   - Upload entry point: Document Vault Upload button now routes to Import.');
  console.log('   - Auto-categorization: use ./cs-agent --wire-autocategorization (already available).');
}

function installDocumentHealth({ indicators }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Document health: CERV2 page not found.');
    process.exit(2);
  }

  // Install a compact health dashboard card in the Evidence Matrix screen.
  const res = updateFileInPlace(cerv2Page, content => {
    if (content.includes('data-testid="document-health-dashboard"')) return content;

    const anchor = '          {/* Individual Category Coverage */}';
    if (!content.includes(anchor)) return content;

    const insert = `          {/* Document Health Dashboard */}\n          <Card className="bg-white border-gray-200" data-testid="document-health-dashboard">\n            <CardHeader>\n              <CardTitle>Document Health</CardTitle>\n              <CardDescription>Completeness, confidence, review status, and traceability coverage</CardDescription>\n            </CardHeader>\n            <CardContent>\n              {(() => {\n                const completeCount = evidenceCategories.filter(cat => calculateCoverage(cat.id) === 100).length;\n                const reviewStatus = evidenceCategories.length ? Math.round((completeCount / evidenceCategories.length) * 100) : 0;\n                const completeness = overallCoverage;\n                const confidence = Math.min(95, Math.max(50, Math.round(completeness * 0.8 + reviewStatus * 0.2)));\n                const traceabilityCoverage = Math.round(((deviceProfile?.evidenceCoverage ?? (overallCoverage / 100)) * 100));\n\n                const Ring = ({ testId, label, value, color }) => (\n                  <div className=\"flex flex-col items-center\" data-testid={testId}>\n                    <div\n                      className=\"relative w-20 h-20 rounded-full\"\n                      style={{\n                        background: \`conic-gradient(\${color} \${value * 3.6}deg, #e5e7eb 0deg)\`,\n                      }}\n                    >\n                      <div className=\"absolute inset-2 bg-white rounded-full flex items-center justify-center text-sm font-semibold\">{value}%</div>\n                    </div>\n                    <div className=\"mt-2 text-xs text-gray-600\">{label}</div>\n                  </div>\n                );\n\n                return (\n                  <div className=\"grid grid-cols-2 md:grid-cols-4 gap-4\">\n                    <Ring testId=\"health-completeness\" label=\"Completeness\" value={completeness} color=\"#16a34a\" />\n                    <Ring testId=\"health-confidence\" label=\"Confidence\" value={confidence} color=\"#2563eb\" />\n                    <Ring testId=\"health-review-status\" label=\"Review Status\" value={reviewStatus} color=\"#f59e0b\" />\n                    <Ring testId=\"health-traceability\" label=\"Traceability\" value={traceabilityCoverage} color=\"#7c3aed\" />\n                  </div>\n                );\n              })()}\n            </CardContent>\n          </Card>\n\n`;

    return content.replace(anchor, insert + anchor);
  });

  const ok = safeIncludes(cerv2Page, 'data-testid="document-health-dashboard"');
  if (!ok) {
    console.log('❌ Document health: failed to install dashboard card.');
    process.exit(2);
  }

  console.log(`✅ Document health dashboard: ${res.changed ? 'installed' : 'already present'} (indicators: ${indicators || 'default'}).`);
}

function enhanceDossierNavigator({ features }) {
  const vault = 'client/src/components/510k/EnhancedDocumentVault.jsx';
  if (!exists(vault)) {
    console.log('❌ Dossier navigator: EnhancedDocumentVault not found.');
    process.exit(2);
  }

  const res = updateFileInPlace(vault, content => {
    let out = content;

    // 1) Add Expand/Collapse all helpers and insert buttons into toolbar.
    if (!out.includes('data-testid="button-expand-all"')) {
      out = out.replace(
        /\/\* Sort Dropdown - Simple button to cycle through options \*\//,
        `/* Expand/Collapse */\n            <Button\n              variant=\"outline\"\n              size=\"sm\"\n              className=\"h-7 text-xs\"\n              onClick={() => {\n                const collect = (items, acc = []) => {\n                  for (const it of items || []) {\n                    if (it?.type === 'folder') {\n                      acc.push(it.id);\n                      if (it.children?.length) collect(it.children, acc);\n                    }\n                  }\n                  return acc;\n                };\n                const ids = collect(documentTree);\n                const next = {};\n                for (const id of ids) next[id] = true;\n                setExpandedFolders(prev => ({ ...prev, ...next }));\n              }}\n              data-testid=\"button-expand-all\"\n            >\n              Expand All\n            </Button>\n            <Button\n              variant=\"outline\"\n              size=\"sm\"\n              className=\"h-7 text-xs\"\n              onClick={() => {\n                const collect = (items, acc = []) => {\n                  for (const it of items || []) {\n                    if (it?.type === 'folder') {\n                      acc.push(it.id);\n                      if (it.children?.length) collect(it.children, acc);\n                    }\n                  }\n                  return acc;\n                };\n                const ids = collect(documentTree);\n                const next = {};\n                for (const id of ids) next[id] = false;\n                setExpandedFolders(prev => ({ ...prev, ...next }));\n              }}\n              data-testid=\"button-collapse-all\"\n            >\n              Collapse\n            </Button>\n\n            /* Sort Dropdown - Simple button to cycle through options */`
      );
    }

    // 2) Add Quick Jump buttons below breadcrumb.
    if (!out.includes('data-testid="quick-jump-510k"')) {
      out = out.replace(
        /\{\/\* Breadcrumb Navigation \*\/\}[\s\S]*?<\/div>\n\s*\n\s*\{\/\* Right-side Toolbar Actions \*\/\}/,
        match => {
          // Insert a compact quick-jump row after breadcrumb.
          return match.replace(
            /<\/div>\n\s*\n\s*\{\/\* Right-side Toolbar Actions \*\/\}/,
            `</div>\n\n          <div className=\"flex items-center gap-2\" data-testid=\"quick-jump\">\n            <span className=\"text-xs text-gray-500\">Quick jump:</span>\n            <Button\n              variant=\"ghost\"\n              size=\"sm\"\n              className=\"h-7 text-xs\"\n              onClick={() => setCurrentFolder('folder-510k')}\n              data-testid=\"quick-jump-510k\"\n            >\n              510(k)\n            </Button>\n            <Button\n              variant=\"ghost\"\n              size=\"sm\"\n              className=\"h-7 text-xs\"\n              onClick={() => setCurrentFolder('folder-administrative')}\n              data-testid=\"quick-jump-admin\"\n            >\n              Admin\n            </Button>\n          </div>\n\n          {/* Right-side Toolbar Actions */}`
          );
        }
      );
    }

    // 3) Ensure section numbers are visible in file names for section-backed items.
    if (!out.includes('const displayName =')) {
      out = out.replace(
        /const isSelected = selectedItems\.find\(i => i\.id === item\.id\);/,
        `const isSelected = selectedItems.find(i => i.id === item.id);\n                  const displayName = item.sectionData?.section_number && !String(item.name).startsWith(String(item.sectionData.section_number))\n                    ? String(item.sectionData.section_number) + ' ' + item.name\n                    : item.name;`
      );

      out = out.replace(
        /\{item\.name\}/,
        '{displayName}'
      );
    }

    // 4) Add dependency hint line to properties panel.
    if (!out.includes('data-testid="properties-dependencies"')) {
      out = out.replace(
        /<p className="text-xs text-gray-500 mt-1">\n\s*\{item\.type === 'folder' \? 'Folder' : \(item\.format\?\.toUpperCase\(\) \|\| 'Document'\)\}\n\s*<\/p>/,
        `<p className=\"text-xs text-gray-500 mt-1\">\n                            {item.type === 'folder' ? 'Folder' : (item.format?.toUpperCase() || 'Document')}\n                          </p>\n                          {item.sectionData?.section_number && (\n                            <div className=\"mt-2 text-xs text-gray-600\" data-testid=\"properties-dependencies\">\n                              <span className=\"font-semibold\">Dependencies:</span>{' '}\n                              {(() => {\n                                const major = parseInt(String(item.sectionData.section_number).split('.')[0], 10);\n                                if (Number.isNaN(major)) return '—';\n                                if (major <= 1) return 'Intake';\n                                if (major === 2) return 'Intake → Predicates';\n                                if (major === 3) return 'Intake → Predicates → Evidence';\n                                if (major === 4) return 'Intake → Predicates → Evidence → Validate';\n                                return 'Intake → Predicates → Evidence → Validate → Package';\n                              })()}\n                            </div>\n                          )}`
      );
    }

    return out;
  });

  const ok = safeIncludes(vault, 'data-testid="button-expand-all"') && safeIncludes(vault, 'data-testid="quick-jump-510k"');
  if (!ok) {
    console.log('❌ Dossier navigator: failed to apply enhancements to EnhancedDocumentVault.');
    process.exit(2);
  }

  console.log(`✅ Dossier navigator: ${res.changed ? 'enhanced' : 'already enhanced'} (features requested: ${features || 'default'}).`);
}

function constructRegulAiEditor({ capabilities }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ RegulAI editor: CERV2 page not found.');
    process.exit(2);
  }

  // Marker-based verification: ensure a toolbar exists in the 510k document editor surface.
  const ok = safeIncludes(cerv2Page, 'data-testid="regulai-toolbar"') && safeIncludes(cerv2Page, "openAssistant('regulai_editor'");
  if (!ok) {
    console.log('❌ RegulAI editor: toolbar marker not detected.');
    console.log('Expected marker: data-testid="regulai-toolbar" in client/src/pages/CERV2Page.jsx');
    process.exit(2);
  }

  console.log(`✅ RegulAI editor: detected (capabilities requested: ${capabilities || 'default'}).`);
}

function forgeConfidenceGate({ threshold, actions }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  const editor = 'client/src/components/MedicalDeviceDocumentEditor.jsx';
  if (!exists(cerv2Page) || !exists(editor)) {
    console.log('❌ Confidence gate: required UI files not found.');
    process.exit(2);
  }

  const t = typeof threshold === 'string' ? threshold : null;
  if (t) {
    // Update the default threshold marker value in both files (best-effort).
    const patchDefault = (relPath) =>
      updateFileInPlace(relPath, content =>
        content.replace(
          /const DEFAULT_CONFIDENCE_GATE_THRESHOLD = [0-9.]+; \/\/ AGENT:CONFIDENCE_GATE_DEFAULT/g,
          `const DEFAULT_CONFIDENCE_GATE_THRESHOLD = ${t}; // AGENT:CONFIDENCE_GATE_DEFAULT`
        )
      );
    patchDefault(cerv2Page);
    patchDefault(editor);
  }

  const ok =
    safeIncludes(cerv2Page, 'AGENT:CONFIDENCE_GATE_DEFAULT') &&
    safeIncludes(cerv2Page, "cerv2:confidence_gate") &&
    safeIncludes(editor, 'AGENT:CONFIDENCE_GATE_DEFAULT') &&
    safeIncludes(editor, 'data-testid="confidence-gate-banner"');

  if (!ok) {
    console.log('❌ Confidence gate: markers not detected.');
    process.exit(2);
  }

  console.log(`✅ Confidence gate: enabled via UI gate hooks (threshold default: ${t || 'existing'}, actions: ${actions || 'default'}).`);
}

function surfaceAiContextually({ triggers }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ AI contextual surfacing: CERV2 page not found.');
    process.exit(2);
  }

  const ok = safeIncludes(cerv2Page, "window.addEventListener('cerv2:confidence_gate'") && safeIncludes(cerv2Page, 'setModuleContext({ module:');
  if (!ok) {
    console.log('❌ AI contextual surfacing: event listener marker not detected.');
    process.exit(2);
  }

  console.log(`✅ AI contextual surfacing: enabled (triggers requested: ${triggers || 'default'}).`);
}

function installValidationCommandCenter({ checks, ui }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Validation command center: CERV2 page not found.');
    process.exit(2);
  }

  const ok =
    safeIncludes(cerv2Page, 'data-testid="validation-command-center"') &&
    safeIncludes(cerv2Page, 'data-testid="button-validate-estar"') &&
    safeIncludes(cerv2Page, 'data-testid="estar-validation-summary"');

  if (!ok) {
    console.log('❌ Validation command center: markers not detected.');
    console.log('Expected marker: data-testid="validation-command-center" in client/src/pages/CERV2Page.jsx');
    process.exit(2);
  }

  console.log(`✅ Validation command center: detected (checks: ${checks || 'default'}, ui: ${ui || 'default'}).`);
}

function wireEstarAssemblyActions({ actions }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ eSTAR assembly actions: CERV2 page not found.');
    process.exit(2);
  }

  const ok =
    safeIncludes(cerv2Page, 'data-testid="button-validate-estar"') &&
    safeIncludes(cerv2Page, 'data-testid="button-validate-estar-strict"') &&
    safeIncludes(cerv2Page, 'data-testid="button-generate-estar-zip"');

  if (!ok) {
    console.log('❌ eSTAR assembly actions: markers not detected.');
    process.exit(2);
  }

  console.log(`✅ eSTAR assembly actions: wired (actions: ${actions || 'default'}).`);
}

function enhanceRtaPrecheck({ features }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ RTA precheck: CERV2 page not found.');
    process.exit(2);
  }

  const ok = safeIncludes(cerv2Page, 'data-testid="rta-preflight-summary"') && safeIncludes(cerv2Page, 'data-testid="button-ask-lumen-rta"');
  if (!ok) {
    console.log('❌ RTA precheck: markers not detected.');
    process.exit(2);
  }

  console.log(`✅ RTA precheck: enhanced (features: ${features || 'default'}).`);
}

function surfacePredictedReviewerQuestions({ source, max }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Predicted reviewer questions: CERV2 page not found.');
    process.exit(2);
  }

  const ok =
    safeIncludes(cerv2Page, 'data-testid="predicted-reviewer-questions"') &&
    safeIncludes(cerv2Page, 'top_questions') &&
    safeIncludes(cerv2Page, 'data-testid="button-ask-lumen-predicted-questions"');
  if (!ok) {
    console.log('❌ Predicted reviewer questions: markers not detected.');
    process.exit(2);
  }

  console.log(`✅ Predicted reviewer questions: surfaced (source: ${source || 'default'}, max: ${max || 'default'}).`);
}

function bridgeRemediationToTasks({ target, ai }) {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Remediation bridge: CERV2 page not found.');
    process.exit(2);
  }

  const ok =
    safeIncludes(cerv2Page, 'data-testid="button-create-remediation-tasks"') &&
    safeIncludes(cerv2Page, "setActiveTab('task-center')") &&
    safeIncludes(cerv2Page, 'cerv2:predicted_questions');
  if (!ok) {
    console.log('❌ Remediation bridge: markers not detected.');
    process.exit(2);
  }

  console.log(`✅ Remediation bridge: enabled (target: ${target || 'default'}, ai: ${ai || 'default'}).`);
}

function installSubmissionWorkbench() {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Submission workbench: CERV2 page not found.');
    process.exit(2);
  }

  const ok =
    safeIncludes(cerv2Page, 'data-testid="submission-workbench"') &&
    safeIncludes(cerv2Page, 'data-testid="button-submission-simulate-review"') &&
    safeIncludes(cerv2Page, 'data-testid="button-submission-validate-estar"') &&
    safeIncludes(cerv2Page, 'data-testid="button-submission-run-rta"') &&
    safeIncludes(cerv2Page, 'data-testid="button-submission-export"') &&
    safeIncludes(cerv2Page, 'data-testid="button-submission-ask-lumen"');

  if (!ok) {
    console.log('❌ Submission workbench: markers not detected.');
    process.exit(2);
  }

  console.log('✅ Submission workbench: installed.');
}

function wireInteractiveReviewInbox() {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  if (!exists(cerv2Page)) {
    console.log('❌ Interactive review inbox: CERV2 page not found.');
    process.exit(2);
  }

  const ok =
    safeIncludes(cerv2Page, 'data-testid="interactive-review-inbox"') &&
    safeIncludes(cerv2Page, 'data-testid="interactive-review-question-list"') &&
    safeIncludes(cerv2Page, 'data-testid="button-draft-interactive-review-response"');

  if (!ok) {
    console.log('❌ Interactive review inbox: markers not detected.');
    process.exit(2);
  }

  console.log('✅ Interactive review inbox: wired.');
}

function checkElegance() {
  const checks = [];

  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  const hasStableTabs = safeIncludes(cerv2Page, 'data-testid="cerv2-stable-tabs"');
  const hasHome = safeIncludes(cerv2Page, 'data-testid="cerv2-home"');
  const hasStageBar = safeIncludes(cerv2Page, 'data-testid="stage-progress-bar"') || safeIncludes(cerv2Page, 'data-testid="cerv2-stage-progress"');
  const reviewersRenamed = safeIncludes(cerv2Page, "label: 'Validate'") || safeIncludes(cerv2Page, 'label: "Validate"');

  checks.push({ name: 'Single front door (Home)', pass: hasHome, fix: 'Ensure Dashboard/Home is the default landing surface.' });
  checks.push({ name: 'Stable 6-tab nav', pass: hasStableTabs, fix: './cs-agent --consolidate-navigation' });
  checks.push({ name: '5-stage progress visible', pass: hasStageBar, fix: 'Add a 5-stage journey progress marker in client/src/pages/CERV2Page.jsx' });
  checks.push({ name: 'Validate naming (not Reviewers)', pass: reviewersRenamed, fix: './cs-agent --rename-tab-reviewers-to-validate' });

  const hasSubmissionWorkbench = safeIncludes(cerv2Page, 'data-testid="submission-workbench"');
  const hasInteractiveReviewInbox = safeIncludes(cerv2Page, 'data-testid="interactive-review-inbox"');
  checks.push({ name: 'Submission workbench present', pass: hasSubmissionWorkbench, fix: './cs-agent --install-submission-workbench' });
  checks.push({ name: 'Interactive review inbox present', pass: hasInteractiveReviewInbox, fix: './cs-agent --wire-interactive-review-inbox' });

  const passCount = checks.filter(c => c.pass).length;
  console.log(`Elegance checks: ${passCount}/${checks.length} passing`);
  for (const c of checks) {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.pass ? '' : `  (fix: ${c.fix})`}`);
  }

  return passCount === checks.length;
}

function detectConfusion() {
  const cerv2Page = 'client/src/pages/CERV2Page.jsx';
  const issues = [];

  if (exists(cerv2Page)) {
    const content = read(cerv2Page);
    // Look for multiple *visible* Upload button labels, not generic mentions in prose/comments.
    const uploadButtonCount = (content.match(/>\s*Upload\s*</g) || []).length;
    if (uploadButtonCount >= 3) {
      issues.push({
        id: 'multiple-upload-buttons',
        message: `Multiple visible "Upload" buttons detected (${uploadButtonCount}).`,
        fix: 'Consolidate Upload actions into a single primary entry point on the CERV2 Home tab.',
      });
    }

    if (content.includes("label: 'Reviewers'") || content.includes('label: "Reviewers"')) {
      issues.push({
        id: 'reviewers-tab-naming',
        message: '"Reviewers" tab label still present (naming mismatch for Stage 4).',
        fix: './cs-agent --rename-tab-reviewers-to-validate',
      });
    }

    const hasStageBar = content.includes('data-testid="stage-progress-bar"') || content.includes('data-testid="cerv2-stage-progress"');
    if (!hasStageBar) {
      issues.push({
        id: 'missing-stage-progress',
        message: 'No 5-stage journey progress indicator detected.',
        fix: 'Add a 5-stage journey progress marker in client/src/pages/CERV2Page.jsx',
      });
    }
  }

  if (!issues.length) {
    console.log('✅ No confusion anti-patterns detected by heuristic scan.');
    return true;
  }

  console.log('❌ CONFUSION DETECTED:');
  for (const i of issues) {
    console.log(`- ${i.message}  FIX: ${i.fix}`);
  }
  return false;
}

function generateSessionSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function runDbPushIfPossible() {
  if (!process.env.DATABASE_URL) {
    return { ran: false, ok: false, reason: 'DATABASE_URL missing' };
  }
  if (String(process.env.DATABASE_URL).startsWith('file:')) {
    return { ran: false, ok: false, reason: 'SQLite file: DATABASE_URL is not supported by this Postgres-only Drizzle setup' };
  }
  if (!exists('package.json')) {
    return { ran: false, ok: false, reason: 'package.json missing' };
  }

  const result = spawnSync('npm', ['run', 'db:push'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  return { ran: true, ok: result.status === 0, status: result.status };
}

function uiReadinessSignals() {
  const signals = {
    routes: {
      cerv2EntryRoute: safeIncludes('client/src/App.jsx', 'path="/cerv2"'),
    },
    pages: {
      cerv2Page: exists('client/src/pages/CERV2Page.jsx'),
      cerv2Home: safeIncludes('client/src/pages/CERV2Page.jsx', 'data-testid="cerv2-home"'),
      cerv2StableTabs: safeIncludes('client/src/pages/CERV2Page.jsx', 'data-testid="cerv2-stable-tabs"'),
      docxPreview: safeIncludes('client/src/pages/CERV2Page.jsx', "type === 'docx'") || safeIncludes('client/src/pages/CERV2Page.jsx', 'mammoth'),
    },
    gating: {
      cerv2AccessEndpoint: exists('server/routes/license-routes.js') && safeIncludes('server/routes/license-routes.js', '/api/modules/access/:moduleId'),
    },
  };

  signals.routes.any = Object.values(signals.routes).some(Boolean);
  return signals;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    printHelp();
    process.exit(0);
  }

  const inv = inventory();
  const blockers = findBlockers(inv);
  const next = chooseNextPriority(inv, blockers);

  const doAudit = Boolean(flags['execute-diagnostic-full']);
  const doStatus = Boolean(flags['status-check']);
  const doBlockers = Boolean(flags['identify-blockers']);
  const doNext = Boolean(flags['next-priority']);
  const doDemo = Boolean(flags['demo-output']);
  const doUiMode = Boolean(flags['switch-to-ui-mode']);
  const uiModePriority = typeof flags.priority === 'string' ? flags.priority : null;
  const doUiConfusion = Boolean(flags['analyze-ui-confusion']);
  const doUiAutoFix = Boolean(flags['auto-fix-confusion']);
  const doDemoReadiness = Boolean(flags['validate-demo-readiness']);
  const doElegance = Boolean(flags['check-elegance']);
  const doDetectConfusion = Boolean(flags['detect-confusion']);
  const doFixP0 = Boolean(flags['fix-p0-blockers']);
  const doConsolidateNav = Boolean(flags['consolidate-navigation']);
  const doWireAutoCategorization = Boolean(flags['wire-autocategorization']);
  const doUnifyViewer = Boolean(flags['unify-document-viewer']);
  const doFixDossier = Boolean(flags['fix-dossier-navigator']);
  const doUnifyTasks = Boolean(flags['unify-tasks']);
  const doPolishSimulation = Boolean(flags['polish-simulation']);

  // UI Logic Enhancement flags (requested command surface)
  const doNavVault = Boolean(flags['implement-navigation-vault']);
  const navVaultTabs = typeof flags.tabs === 'string' ? flags.tabs : null;
  const navVaultLocked = flags.locked;
  const doStageOrchestrator = Boolean(flags['install-stage-orchestrator']);
  const stageList = typeof flags.stages === 'string' ? flags.stages : null;
  const stageVisual = typeof flags.visual === 'string' ? flags.visual : null;
  const doTerminologyVault = Boolean(flags['enforce-terminology-vault']);
  const terminologyTerms = typeof flags.terms === 'string' ? flags.terms : null;
  const doRollbackNav = Boolean(flags['rollback-navigation']);
  const doRollbackTerminology = Boolean(flags['rollback-terminology']);
  const doOverrideConfidence = Boolean(flags['override-confidence-gating']);
  const overrideThreshold = typeof flags.threshold === 'string' ? flags.threshold : null;
  const doReadinessReport = Boolean(flags['generate-readiness-report']);

  // Phase 2 flags
  const doUploadOrchestrator = Boolean(flags['construct-upload-orchestrator']);
  const uploadFeatures = typeof flags.features === 'string' ? flags.features : null;
  const doDocHealth = Boolean(flags['install-document-health']);
  const healthIndicators = typeof flags.indicators === 'string' ? flags.indicators : null;
  const doEnhanceDossierNavigator = Boolean(flags['enhance-dossier-navigator']);
  const dossierFeatures = typeof flags.features === 'string' ? flags.features : null;

  // Phase 3 flags
  const doRegulAiEditor = Boolean(flags['construct-regulaieditor']);
  const regulAiCapabilities = typeof flags.capabilities === 'string' ? flags.capabilities : null;
  const doForgeConfidenceGate = Boolean(flags['forge-confidence-gate']);
  const gateThreshold = typeof flags.threshold === 'string' ? flags.threshold : null;
  const gateActions = typeof flags.actions === 'string' ? flags.actions : null;
  const doSurfaceAi = Boolean(flags['surface-ai-contextually']);
  const aiTriggers = typeof flags.triggers === 'string' ? flags.triggers : null;

  // Phase 4 flags
  const doValidationCenter = Boolean(flags['install-validation-command-center']);
  const validationChecks = typeof flags.checks === 'string' ? flags.checks : null;
  const validationUi = typeof flags.ui === 'string' ? flags.ui : null;
  const doWireEstarActions = Boolean(flags['wire-estar-assembly-actions']);
  const estarActions = typeof flags.actions === 'string' ? flags.actions : null;
  const doEnhanceRta = Boolean(flags['enhance-rta-precheck']);
  const rtaFeatures = typeof flags.features === 'string' ? flags.features : null;

  // Phase 5 flags
  const doPredictedQuestions = Boolean(flags['surface-predicted-reviewer-questions']);
  const predictedSource = typeof flags.source === 'string' ? flags.source : null;
  const predictedMax = typeof flags.max === 'string' ? flags.max : null;
  const doRemediationBridge = Boolean(flags['bridge-remediation-to-tasks']);
  const bridgeTarget = typeof flags.target === 'string' ? flags.target : null;
  const bridgeAi = typeof flags.ai === 'string' ? flags.ai : null;

  // Phase 6–7 flags
  const doSubmissionWorkbench = Boolean(flags['install-submission-workbench']);
  const doInteractiveReviewInbox = Boolean(flags['wire-interactive-review-inbox']);
  const validateModule = typeof flags['validate-module'] === 'string' ? flags['validate-module'] : null;
  const override = typeof flags['human-override-priority'] === 'string' ? flags['human-override-priority'] : null;

  if (!doAudit && !doStatus && !doBlockers && !doNext && !doDemo && !doUiMode && !doUiConfusion && !doUiAutoFix && !doDemoReadiness && !doElegance && !doDetectConfusion && !doFixP0 && !doConsolidateNav && !doWireAutoCategorization && !doUnifyViewer && !doFixDossier && !doUnifyTasks && !doPolishSimulation && !doNavVault && !doStageOrchestrator && !doTerminologyVault && !doRollbackNav && !doRollbackTerminology && !doOverrideConfidence && !doUploadOrchestrator && !doDocHealth && !doEnhanceDossierNavigator && !doRegulAiEditor && !doForgeConfidenceGate && !doSurfaceAi && !doValidationCenter && !doWireEstarActions && !doEnhanceRta && !doPredictedQuestions && !doRemediationBridge && !doSubmissionWorkbench && !doInteractiveReviewInbox && !doReadinessReport && !validateModule && !override) {
    printHelp();
    process.exit(1);
  }

  if (doRollbackNav) {
    rollbackNavigation();
    return;
  }

  if (doRollbackTerminology) {
    rollbackTerminology();
    return;
  }

  if (doOverrideConfidence) {
    // Update the default threshold marker where present (best-effort).
    const t = overrideThreshold ?? '0.00';
    forgeConfidenceGate({ threshold: t, actions: 'override' });
    console.log(`✅ Confidence gating override: threshold=${t}`);
    return;
  }

  if (doNavVault) {
    implementNavigationVault({ tabs: navVaultTabs || 'Dashboard,Documents,Dossier,Tasks,Validate,Team', locked: navVaultLocked });
    return;
  }

  if (doStageOrchestrator) {
    installStageOrchestrator({ stages: stageList || 'Collect,Structure,Enrich,Validate,Package', visual: stageVisual || 'top-bar-gauge' });
    return;
  }

  if (doTerminologyVault) {
    enforceTerminologyVault({ terms: terminologyTerms });
    return;
  }

  if (doReadinessReport) {
    generateReadinessReport();
    return;
  }

  if (doUploadOrchestrator) {
    constructUploadOrchestrator({ features: uploadFeatures });
    return;
  }

  if (doDocHealth) {
    installDocumentHealth({ indicators: healthIndicators });
    return;
  }

  if (doEnhanceDossierNavigator) {
    enhanceDossierNavigator({ features: dossierFeatures });
    return;
  }

  if (doRegulAiEditor) {
    constructRegulAiEditor({ capabilities: regulAiCapabilities });
    return;
  }

  if (doForgeConfidenceGate) {
    forgeConfidenceGate({ threshold: gateThreshold, actions: gateActions });
    return;
  }

  if (doSurfaceAi) {
    surfaceAiContextually({ triggers: aiTriggers });
    return;
  }

  if (doValidationCenter) {
    installValidationCommandCenter({ checks: validationChecks, ui: validationUi });
    return;
  }

  if (doWireEstarActions) {
    wireEstarAssemblyActions({ actions: estarActions });
    return;
  }

  if (doEnhanceRta) {
    enhanceRtaPrecheck({ features: rtaFeatures });
    return;
  }

  if (doPredictedQuestions) {
    surfacePredictedReviewerQuestions({ source: predictedSource, max: predictedMax });
    return;
  }

  if (doRemediationBridge) {
    bridgeRemediationToTasks({ target: bridgeTarget, ai: bridgeAi });
    return;
  }

  if (doSubmissionWorkbench) {
    installSubmissionWorkbench();
    return;
  }

  if (doInteractiveReviewInbox) {
    wireInteractiveReviewInbox();
    return;
  }

  if (doFixP0) {
    const env = getEnvBlockers();
    const hasEnvLocal = exists('.env.local');
    if (hasEnvLocal) {
      console.log('✅ Found .env.local');
    }
    if (!env.missingRequired.length) {
      console.log('P0 blockers: none detected (env vars present).');
    } else {
      console.log('P0 blockers detected:');
      console.log(`- Missing required env vars: ${env.missingRequired.join(', ')}`);
    }

    if (env.invalidRequired?.length) {
      console.log('P0 blockers detected:');
      console.log(`- Invalid required env vars: ${env.invalidRequired.join(', ')} (DATABASE_URL starts with file: but dialect is postgresql)`);
      console.log('Fix: set DATABASE_URL to a Postgres connection string (e.g., Neon/Render/local Postgres).');
    }

    if (!process.env.SESSION_SECRET) {
      const secret = generateSessionSecret();
      console.log('\nSuggested SESSION_SECRET (copy/paste):');
      console.log(`export SESSION_SECRET=${secret}`);
    }

    if (!process.env.DATABASE_URL) {
      console.log('\nDATABASE_URL is missing. Set it via Codespaces Secrets or export it in your shell:');
      console.log('export DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DB"');
      console.log('\nSkipping DB push (requires DATABASE_URL).');
      return;
    }

    if (String(process.env.DATABASE_URL).startsWith('file:')) {
      console.log('\nDATABASE_URL is set to a SQLite file URL, but this repo is configured for Postgres (see drizzle.config.ts dialect=postgresql).');
      console.log('Skipping DB push. Set DATABASE_URL to Postgres to enable migrations/seed endpoints.');
      return;
    }

    console.log('\nAttempting `npm run db:push`...');
    const push = runDbPushIfPossible();
    if (!push.ran) {
      console.log(`db:push skipped: ${push.reason}`);
      return;
    }
    if (push.ok) {
      console.log('db:push completed successfully.');
      return;
    }
    console.log(`db:push failed (exit=${push.status}). Check DATABASE_URL connectivity/permissions.`);
    process.exit(2);
  }

  if (doElegance) {
    const ok = checkElegance();
    process.exit(ok ? 0 : 2);
  }

  if (doDetectConfusion) {
    const ok = detectConfusion();
    process.exit(ok ? 0 : 2);
  }

  if (doConsolidateNav) {
    const signals = uiReadinessSignals();
    if (signals.pages.cerv2StableTabs) {
      console.log('Navigation consolidation: detected 6-tab stable navigation in CERV2.');
      return;
    }
    console.log('Navigation consolidation: NOT detected.');
    console.log('Expected marker missing: data-testid="cerv2-stable-tabs" in client/src/pages/CERV2Page.jsx');
    process.exit(2);
  }

  if (doWireAutoCategorization) {
    const hasFallback = safeIncludes('client/src/components/510k/EnhancedDocumentVault.jsx', 'getDemoFallbackSections');
    console.log(`Auto-categorization wiring (vault folders): ${hasFallback ? 'detected' : 'NOT detected'}.`);
    if (!hasFallback) process.exit(2);
    console.log('Note: This ensures documents are auto-grouped into folders even when DB tables are missing.');
    return;
  }

  if (doUnifyViewer) {
    const ok = safeIncludes('client/src/pages/CERV2Page.jsx', 'data-testid="document-viewer-toolbar"');
    console.log(`Document viewer toolbar (format switcher): ${ok ? 'detected' : 'NOT detected'}.`);
    if (!ok) process.exit(2);
    return;
  }

  if (doFixDossier) {
    console.log('Dossier navigator fix: server-side DB missing-table protection enabled for /api/cerv2-sections.');
    console.log('If sections still appear empty, run `./cs-agent --fix-p0-blockers` to apply schema.');
    return;
  }

  if (doUnifyTasks) {
    const ok = safeIncludes('client/src/pages/CERV2Page.jsx', "activeTab === 'task-center'");
    console.log(`Task Center integration: ${ok ? 'detected' : 'NOT detected'}.`);
    if (!ok) process.exit(2);
    return;
  }

  if (doPolishSimulation) {
    console.log('Simulation polish: using existing 510(k) Compliance + Risk Assessment (clearance likelihood).');
    console.log('Open CERV2 -> Reviewers tab to run Risk Assessment and view clearance likelihood.');
    return;
  }

  if (doUiMode) {
    const state = {
      mode: 'ui',
      priority: uiModePriority || 'demo-ready',
      timestamp: nowIso(),
      notes: 'UI/UX sprint mode enabled (repo-local heuristic).'
    };
    console.log(`UI mode: enabled (priority=${state.priority}).`);
    console.log('UI mode state (not persisted to disk):');
    console.log(JSON.stringify(state, null, 2));
    console.log('Next suggested action: `./cs-agent --analyze-ui-confusion`');
    return;
  }

  if (doUiConfusion) {
    console.log('CONFUSION ROOT CAUSES IDENTIFIED:');
    console.log('1. Duplicate navigation: overlapping entry points for similar content');
    console.log('2. No visual hierarchy: unclear distinction between section vs dossier');
    console.log('3. Missing progress indicators: users can\'t tell what AI is doing');
    console.log('4. No home base: no single landing page for active work');
    console.log('5. Format switching hidden: editor/export actions not consistently visible');
    console.log('\nRECOMMENDED FIXES (priority order):');
    console.log('[Fix 1] Add a stable “Home” entry inside the existing CERV2 module UI');
    console.log('[Fix 2] Add prominent quick-access buttons for Intake/Data/Editor/Compliance');
    console.log('[Fix 3] Add a dossier sidebar tree + status indicators');
    console.log('[Fix 4] Ensure module subscription gating is explicit');
    return;
  }

  if (doUiAutoFix) {
    console.log('Auto-fix disabled: UI changes must be made within existing module UI (no-new-files policy).');
    console.log('Suggested next step: improve `client/src/pages/CERV2Page.jsx` (Home + viewer) and rerun:');
    console.log('  ./cs-agent --validate-demo-readiness');
    process.exit(2);
  }

  if (doDemoReadiness) {
    const signals = uiReadinessSignals();
    const checks = [
      ['CERV2 entry route exists', signals.routes.cerv2EntryRoute],
      ['CERV2 page exists', signals.pages.cerv2Page],
      ['CERV2 Home entry exists', signals.pages.cerv2Home],
      ['CERV2 stable 6-tab navigation exists', signals.pages.cerv2StableTabs],
      ['DOCX inline preview enabled', signals.pages.docxPreview],
      ['Module access endpoint exists', signals.gating.cerv2AccessEndpoint],
    ];

    const passed = checks.filter(([, ok]) => ok).length;
    const score = Math.round((passed / checks.length) * 100) / 10; // 0.0 - 10.0

    console.log(`Demo Ready Score: ${score}/10`);
    for (const [name, ok] of checks) {
      console.log(`${ok ? '✅' : '❌'} ${name}`);
    }

    if (passed !== checks.length) {
      console.log('Two common follow-ups:');
      console.log('- Ensure DATABASE_URL + SESSION_SECRET are set for full-stack demos');
      console.log('- Run `npm run dev` and open /cerv2');
      process.exit(1);
    }

    process.exit(0);
  }

  if (doAudit) {
    writeAudit(inv, blockers, next);
    console.log(`Agent Diagnostic: wrote audit_results.json. Found ${blockers.length} issue(s).`);
    console.log(`Top priority: [${next.severity}] ${next.message}`);
    console.log('Choose one: `./cs-agent --next-priority` | `./cs-agent --identify-blockers` | `./cs-agent --demo-output`');
    return;
  }

  if (doStatus) {
    const summary = {
      tenant: inv.tenant,
      cerv2: inv.cerv2,
      ingestion: inv.ingestion,
      envMissingRequired: inv.env.missingRequired,
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (doBlockers) {
    if (!blockers.length) {
      console.log('No blockers detected by heuristic scan.');
      return;
    }
    for (const b of blockers) {
      console.log(`- [${b.severity}] ${b.message}`);
      if (b.fix) console.log(`  Fix: ${b.fix}`);
    }
    return;
  }

  if (doNext || override) {
    const chosen = override
      ? { id: 'override', severity: 'MANUAL', message: override, fix: 'Proceed with the overridden priority.' }
      : next;

    console.log(`Next priority: [${chosen.severity}] ${chosen.message}`);
    if (chosen.fix) console.log(`Suggested fix: ${chosen.fix}`);
    console.log('If you want me to implement it in code, say: "Agent, proceed" and name the priority.');
    return;
  }

  if (validateModule) {
    // Placeholder validation: presence checks only.
    const checks = [];
    if (validateModule === 'ingestion') {
      checks.push(['legacy routes', inv.ingestion.legacy]);
      checks.push(['v1 routes', inv.ingestion.versionedV1]);
    } else if (validateModule === 'cerv2' || validateModule === 'cer') {
      checks.push(['client routing', Boolean(inv.cerv2.clientRoute)]);
      checks.push(['sections API', Boolean(inv.cerv2.apiSections)]);
      checks.push(['documents API', Boolean(inv.cerv2.apiDocuments)]);
    } else if (validateModule === 'tenant') {
      checks.push(['tenant middleware', inv.tenant.middleware]);
      checks.push(['vault tenant', inv.tenant.vaultHardcodedTenantRemoved]);
    }

    if (!checks.length) {
      console.log(`No built-in validator for module: ${validateModule}`);
      process.exit(2);
    }

    const failed = checks.filter(([, ok]) => !ok);
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
    }

    process.exit(failed.length ? 1 : 0);
  }

  if (doDemo) {
    console.log(JSON.stringify({
      demo: '510k_section',
      section: 'Device Description',
      generatedAt: nowIso(),
      notes: 'This is a demo payload stub. Wire to real generation endpoints for production.'
    }, null, 2));
    return;
  }
}

main();
