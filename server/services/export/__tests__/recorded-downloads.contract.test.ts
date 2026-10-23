/**
 * Every route handler that delivers a file records it first, or proves it is
 * not served (D5: a generated document leaves the system recorded).
 *
 * The 2026-10-15 launch-boundary re-proof found 12 launch-served downloads
 * that delivered a document and recorded nothing — IND lifecycle and form
 * PDFs, the audit attestation, the transmittal acknowledgement
 * (docs/evidence/D5/2026-10-22-ind-documents-recorded/). They were fixed one
 * by one, and nothing stopped the thirteenth: `ci:governed-export-routes`
 * checks a hand-written list of two files. This is the general check.
 *
 * A handler delivers a file when it sets Content-Disposition or calls
 * res.download / res.attachment / res.sendFile. It then either
 *   • calls a recorder in the same handler (RECORDERS, or a file's own
 *     recorder in OWN_RECORDER, each with what it writes), or
 *   • is listed in NOT_SERVED with its full path, which the launch-scope
 *     verdict must refuse in production, or as unmounted, which no file may
 *     import.
 * Both lists are held honest: an entry whose handler no longer delivers, now
 * records, or is served, fails until it is moved. A handler that delivers
 * through a recorder that sets the header itself (sendAuditedDownload) is not
 * a delivering handler here, because the header is the recorder's.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildPrefixMap, NEVER_GATED } from '../../entitlements/api-prefix-map';
import { launchScopeApiVerdict } from '../../entitlements/launch-scope-api';

const ROOT = join(__dirname, '../../../..');

/** The recording helpers: each writes its row before a byte is sent and refuses delivery without it. */
const RECORDERS = [
  'sendAuditedDownload', // services/export/governedExportConsequence.ts: EXPORT_GENERATED with the SHA-256
  'createAuditedUnplacedExport', // the same, for an export placed nowhere
  'createGovernedExportConsequence', // the governed export row
  'sendRecordedFile', // routes/ind-lifecycle/shared.ts, over sendAuditedDownload
  'sendRecordedFormSet', // routes/ind-forms.routes.ts, over sendAuditedDownload
];

/** A file whose downloads record through a recorder of its own domain, named with what it writes. */
const OWN_RECORDER: Record<string, { recorder: string; writes: string }> = {
  'server/routes/authoring.router.ts': {
    recorder: 'createAuditTrail',
    writes: 'an EXPORT or WORKING_COPY row in authoring_audit_trail, with the SHA-256 of the bytes, before they are sent',
  },
  'server/routes/c2c/project-vault.ts': {
    recorder: 'recordVaultDownload',
    writes: 'the download of stored Vault bytes, after they are checked against the recorded content hash',
  },
  'server/routes/audit-trail-routes.ts': {
    recorder: 'exportForTenant',
    writes: 'the signed audit export and its manifest; it refuses (AUDIT_EXPORT_NOT_RECORDED) when it cannot record',
  },
  'server/routes/ectd-export.ts': {
    recorder: 'recordGovernedEctdExport',
    writes: 'the governed eCTD export record with the SHA-256 of the package bytes, and its §11.10(e) audit event',
  },
  'server/routes/admin/business-center.ts': {
    recorder: 'recordAuditRow',
    writes: 'an audit row for the operator cost CSV before it is sent, with its id in the response headers',
  },
};

/**
 * Handlers that deliver and do not record, each proved not to reach a tenant:
 * `path` is the full path (its tail must be the handler's own), and the
 * launch-scope verdict must refuse it in production; or `unmounted`, the file
 * no other file imports.
 */
const NOT_SERVED: Array<{ file: string; handler: string; path?: string; unmounted?: true }> = [
  { file: 'server/routes/audit-services.ts', handler: "post('/export/pdf'", path: '/api/audit-services/export/pdf' },
  { file: 'server/routes/authoring-pdf.routes.ts', handler: "post('/m2-summary/pdf'", path: '/api/authoring-pdf/m2-summary/pdf' },
  { file: 'server/routes/authoring-pdf.routes.ts', handler: "post('/ctd-readiness'", path: '/api/authoring-pdf/ctd-readiness' },
  { file: 'server/routes/c2c/exports.ts', handler: "get('/documents/download/:filename'", path: '/api/concept2cure/documents/download/x.pdf' },
  { file: 'server/routes/decision-lineage.ts', handler: "get('/:entityType/:entityId/export'", path: '/api/decision-lineage/document/1/export' },
  { file: 'server/routes/documentOrchestrationRoutes.ts', handler: "get('/api/510k/documents/:documentId/pdf/3881'", path: '/api/510k/documents/1/pdf/3881' },
  { file: 'server/routes/etmf.routes.ts', handler: "get('/trials/:trialId/inspection-package'", path: '/api/etmf/trials/1/inspection-package' },
  { file: 'server/routes/ind-lifecycle/submission.routes.ts', handler: "get('/portfolio/drift/csv'", path: '/api/ind-lifecycle/portfolio/drift/csv' },
  { file: 'server/routes/intelligent-reports.ts', handler: "get('/:reportId/export/:format'", path: '/api/intelligent-reports/1/export/pdf' },
  { file: 'server/routes/ivdr-binder-routes.ts', handler: "get('/packs/:packId/download'", path: '/api/ivdr/packs/1/download' },
  { file: 'server/routes/ivdr-routes.ts', handler: "get('/classify/:id/report'", path: '/api/ivdr/classify/1/report' },
  { file: 'server/routes/knowledge-base.ts', handler: "get('/search-connectors'", path: '/api/knowledge-base/search-connectors' },
  { file: 'server/routes/knowledge-base.ts', handler: "post('/generate-docx'", path: '/api/knowledge-base/generate-docx' },
  { file: 'server/routes/knowledge-base.ts', handler: "post('/generate-ind-package'", path: '/api/knowledge-base/generate-ind-package' },
  { file: 'server/routes/knowledge-base.ts', handler: "post('/generate-module3-docx'", path: '/api/knowledge-base/generate-module3-docx' },
  { file: 'server/routes/moduleIntegrationRoutes.ts', handler: "get('/workflow-history/:id'", path: '/api/module-integration/workflow-history/1' },
  { file: 'server/routes/nanoBanana.ts', handler: "post('/presentation'", path: '/api/nano-banana/presentation' },
  { file: 'server/routes/pdf-task-routes.ts', handler: "post('/render-markdown-pdf'", path: '/api/pdf-tasks/render-markdown-pdf' },
  { file: 'server/routes/pdf-task-routes.ts', handler: "get('/download/:filename'", path: '/api/pdf-tasks/download/x.pdf' },
  { file: 'server/routes/planner-routes.ts', handler: "post('/export-summary'", path: '/api/planner/export-summary' },
  { file: 'server/routes/predicate-intelligence.ts', handler: "post('/render-se-docx'", path: '/api/predicate-intelligence/render-se-docx' },
  { file: 'server/routes/predicate-intelligence.ts', handler: "post('/render-se-docx-v2'", path: '/api/predicate-intelligence/render-se-docx-v2' },
  { file: 'server/routes/rtm-export.ts', handler: "get('/programs/:programId/rtm/csv'", path: '/api/programs/1/rtm/csv' },
  { file: 'server/routes/tenant-export.ts', handler: "get('/'", path: '/api/tenant-export' },
  { file: 'server/routes/tenant-export.ts', handler: "get('/full'", path: '/api/tenant-export/full' },
  // Mounted only when test routes are enabled, which production refuses (register-core-routes.ts).
  { file: 'server/routes/test-assembly.ts', handler: "post('/export-docx'", path: '/api/test-assembly/export-docx' },
  { file: 'server/routes/universal-packager.ts', handler: "post('/download/:format'", path: '/api/packager/download/pdf' },
  { file: 'server/routes/universal-packager.ts', handler: "post('/multi-download'", path: '/api/packager/multi-download' },
  { file: 'server/src/routes/stability.router.ts', handler: "post('/studies/:id/schedule'", path: '/api/stability/studies/1/schedule' },
  { file: 'server/src/routes/stability.router.ts', handler: "post('/studies/:id/p8/export'", path: '/api/stability/studies/1/p8/export' },
  { file: 'server/routes/reports/generate-report.ts', handler: "get('/download/:persona/:filename'", unmounted: true },
  { file: 'server/routes/reports/subscriptions-routes.ts', handler: "get('/api/reports/download/:personaId/:filename'", unmounted: true },
];

const SERVED_VERDICTS = new Set(['launch', 'never-gated', 'infrastructure']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/** The code lines of a text: a mention in a comment is not a call. */
const code = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');

const ROUTE = /^\s*[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/;
const DELIVERS = /Content-Disposition['"`]?\s*,|res\.(download|attachment|sendFile)\(/i;
const calls = (body: string, name: string) => new RegExp(`\\b${name}\\s*\\(`).test(body);

/** Each route handler of a file: from its registration line to the next one. */
function handlers(text: string) {
  const out: Array<{ opens: string; method: string; path: string; body: string[] }> = [];
  for (const line of text.split('\n')) {
    const m = line.match(ROUTE);
    if (m) out.push({ opens: line.trim(), method: m[1], path: m[3], body: [line] });
    else if (out.length) out[out.length - 1].body.push(line);
  }
  return out.map((h) => ({ ...h, body: code(h.body.join('\n')) }));
}

const all = sourceFiles(join(ROOT, 'server')).map((path) => ({
  file: relative(ROOT, path).split('\\').join('/'),
  text: readFileSync(path, 'utf8'),
}));
const delivering = all.flatMap(({ file, text }) =>
  handlers(text)
    .filter((h) => DELIVERS.test(h.body))
    .map((h) => ({
      file,
      opens: h.opens,
      method: h.method,
      path: h.path,
      records:
        RECORDERS.some((r) => calls(h.body, r)) ||
        (file in OWN_RECORDER && calls(h.body, OWN_RECORDER[file].recorder)),
    })),
);
const notServedFor = (h: { file: string; method: string; path: string }) =>
  NOT_SERVED.find((n) => n.file === h.file && n.handler === `${h.method}('${h.path}'`);

describe('every handler that delivers a file records it, or is not served', () => {
  it('finds the handlers it exists to watch', () => {
    // A scan that finds nothing passes everything.
    expect(delivering.length).toBeGreaterThanOrEqual(30);
    expect(delivering.filter((h) => h.records).map((h) => h.file)).toEqual(
      expect.arrayContaining(['server/routes/c2c/project-vault.ts', 'server/routes/authoring.router.ts']),
    );
  });

  it.each(delivering.filter((h) => !h.records && !notServedFor(h)))(
    '$file: `$opens` records before it delivers, or is listed as not served',
    (h) => {
      expect(h.records, `${h.file} ${h.method.toUpperCase()} ${h.path} delivers a file and records nothing`).toBe(true);
    },
  );

  it.each(NOT_SERVED)('$file `$handler` still delivers unrecorded, and is not served', (entry) => {
    const found = delivering.filter((h) => h.file === entry.file && `${h.method}('${h.path}'` === entry.handler);
    expect(found.length, `${entry.handler} delivers no file any more: remove its entry`).toBe(1);
    expect(found[0].records, `${entry.handler} records now: remove its entry`).toBe(false);
    if (entry.unmounted) {
      const stem = entry.file.replace(/^server\//, '').replace(/\.ts$/, '');
      const importers = all.filter(
        ({ file, text }) => file !== entry.file && new RegExp(`['"][./]*${stem.split('/').pop()}(\\.js)?['"]`).test(code(text)),
      );
      expect(importers.map((i) => i.file), `${entry.file} is imported now: give its handler a path`).toEqual([]);
      return;
    }
    // The path named is this handler's: its tail is the handler's own route.
    const tail = new RegExp(`${found[0].path.replace(/:[A-Za-z_]+/g, '[^/]+').replace(/\/$/, '')}$`);
    expect(entry.path!, `${entry.path} is not ${found[0].path}`).toMatch(tail);
    const verdict = launchScopeApiVerdict(entry.path!, buildPrefixMap(), NEVER_GATED);
    expect(SERVED_VERDICTS.has(verdict), `${entry.path} is served in production (${verdict}): record it`).toBe(false);
  });

  it.each(Object.entries(OWN_RECORDER))('%s records through its own recorder, which it still calls', (file, { recorder, writes }) => {
    expect(writes.length).toBeGreaterThan(40);
    const own = delivering.filter((h) => h.file === file);
    expect(own.length, `${file} delivers no file any more: remove its entry`).toBeGreaterThan(0);
    expect(own.some((h) => h.records), `${file} no longer calls ${recorder}`).toBe(true);
  });
});
