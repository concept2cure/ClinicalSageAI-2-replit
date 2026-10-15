/** Synthetic regression fixture only; no client records or actual signatures. */
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildRunPdf } from '../../../../../server/services/report-os/pdf/run-pdf';

(async () => {
  const output = await buildRunPdf({
    run: { id: 41, runUuid: 'regression-preview-41', reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '12', status: 'partial', confidence: null, createdAt: '2026-10-01T08:00:00.000Z' },
    typeLabel: 'Synthetic reporting regression fixture', runBy: 'Regression fixture', exportId: 'export-regression-preview', exportedAt: '2026-10-13T18:00:00.000Z', seal: null,
    report: {
      reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '12', scopeLabel: 'Program 12', computedScope: 'organization', generatedAt: '2026-10-01T08:00:00.000Z', status: 'partial',
      sections: [
        { id: 'text', title: 'Recorded text', blocks: [
          { kind: 'summary', text: 'Résumé: 5 µg at 4 °C; dose ≥ 10 mg ✓ 中文报告 日本語 한국어' },
          { kind: 'summary', text: 'تقرير الامتثال للبرنامج' },
          { kind: 'summary', text: 'דוח תאימות לתוכנית' },
          { kind: 'summary', text: 'Phase 3: تقرير الامتثال (2026) — דוח תאימות' },
          { kind: 'summary', text: 'अनुपालन रिपोर्ट' },
        ] },
        { id: 'charts', title: 'Recorded chart series', blocks: [
          { kind: 'chart', chartType: 'readiness_ring', spec: { value: 64, label: 'Program readiness' } },
          { kind: 'chart', chartType: 'bar', spec: { data: [{ label: 'CMC', value: 8 }, { label: 'Clinical', value: 3 }] } },
          { kind: 'chart', chartType: 'trend', spec: { points: [62, 66, 64, 70, 73], label: 'Recorded trend' } },
        ] },
      ],
    },
  });
  await fs.writeFile(fileURLToPath(new URL('./multilingual-charts.pdf', import.meta.url)), output.bytes);
})().catch((error: unknown) => { process.stderr.write(String(error)); process.exit(1); });
