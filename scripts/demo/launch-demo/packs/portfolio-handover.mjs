/** The portfolio's completed INTERNAL reference package, not a native CSR export.
 * Bytes are made with existing document dependencies, stored through the Vault,
 * reopened and hashed before actual delivery task completion. Fresh projects
 * stay active so the presentation can open their records; archival is optional.
 */
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import { demoTitle, makeMultiPagePdfBuffer, must, sha256 } from '../lib.mjs';
import { asArray } from './biotech-shared.mjs';
import { ALL_HEADINGS, buildCsrSource, INTERNAL_HANDOVER_NOTICE, narrative, STUDIES } from './portfolio-content.mjs';
import { ensurePortfolioFolders, ensurePortfolioVaultFile } from './portfolio-vault.mjs';
import { ensureTasks } from './work-areas.mjs';

const T = (label) => demoTitle('portfolio', label);
const FIXTURE_DATE = new Date('2026-11-13T00:00:00.000Z');
export const HANDOVER_TASK_TITLE = T('QLM-118-101 internal handover: verify and deliver synthetic reference files');
export const HANDOVER_FILE_LABELS = [
  'QLM-118-101 internal handover reference report · SYNTHETIC PDF',
  'QLM-118-101 internal handover reference report · SYNTHETIC Word',
  'QLM-118-101 internal handover study data · SYNTHETIC',
  'QLM-118-101 internal handover inventory · SYNTHETIC',
];

async function wordReport(sections) {
  const doc = new Document({
    title: 'QLM-118-101 INTERNAL synthetic demonstration handover',
    creator: 'Concept2Cure synthetic demo seed', lastModifiedBy: 'Concept2Cure synthetic demo seed',
    description: INTERNAL_HANDOVER_NOTICE, revision: '1',
    sections: [{ children: [new Paragraph({ text: 'SYNTHETIC INTERNAL DEMONSTRATION HANDOVER', heading: HeadingLevel.TITLE }),
      new Paragraph(INTERNAL_HANDOVER_NOTICE),
      ...sections.flatMap((s) => [new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }),
        ...s.paragraphs.map((p) => new Paragraph(p))])] }],
  });
  // Packer stamps ZIP entries and core properties with wall-clock time. Fix only
  // fixture metadata so repeat seeding compares the same document bytes.
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const core = zip.file('docProps/core.xml');
  if (!core) throw new Error('The synthetic Word report has no core properties.');
  const coreXml = (await core.async('string')).replace(/(<dcterms:(?:created|modified)\b[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g,
    `$1${FIXTURE_DATE.toISOString()}$2`);
  zip.file('docProps/core.xml', coreXml);
  for (const entry of Object.values(zip.files)) entry.date = FIXTURE_DATE;
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** The inventory hashes the three payloads; its own hash lives in the Vault record. */
export async function buildInternalHandoverFiles() {
  const study = STUDIES.find((s) => s.key === 'qlm118-101');
  const studyNarrative = narrative(study);
  const sections = [
    { heading: 'Purpose and status', paragraphs: [INTERNAL_HANDOVER_NOTICE,
      'This is an internal delivery example for Quillmont Immunology (fictional). Completion refers to saving and checking the reference package, then completing its internal delivery task. The project stays active so these reference files can be opened during presentation. Later archival is optional. The native working CSR remains in its separate project and retains its review controls.'] },
    { heading: 'Synthetic data provenance', paragraphs: [
      `The JSON is the deterministic fictional source for ${study.protocolNumber}: ${study.design}. No participant or measurement is real.`,
      ...study.arms.map((a) => `${a.armName}: ${a.n} synthetic participants; ${a.completed} completed the fictional study. These counts are demonstration fixtures, not clinical evidence.`)] },
    { heading: 'Package contents', paragraphs: [
      'internal-handover-report-synthetic.pdf — printable reference report.',
      'internal-handover-report-synthetic.docx — editable Word reference report with the same notice.',
      'internal-handover-study-data-synthetic.json — fictional study source.',
      'internal-handover-inventory-synthetic.json — payload filenames, byte lengths and SHA-256 hashes.'] },
    { heading: 'Internal delivery completion criterion', paragraphs: [
      'Each file must be stored in this project’s named Vault folder, its confirmed membership read back, and its actual downloaded bytes checked against the expected SHA-256. Only then may the internal delivery task be completed through its existing API. The seed keeps fresh projects active for presentation and validates previously archived examples without reopening them.',
      'Use the folder’s Export Completed internal handover · SYNTHETIC action to obtain its reference files, archive manifest, index, checksums and audit trail. This does not freeze, sign, approve or submit a native CSR.'] },
    ...ALL_HEADINGS.map((key) => ({ heading: `Synthetic study reference: ${key.replace(/([a-z])([A-Z])/g, '$1 $2')}`,
      paragraphs: [studyNarrative[key]] })),
  ];
  const payloads = [
    { label: HANDOVER_FILE_LABELS[0], fileName: 'internal-handover-report-synthetic.pdf',
      mime: 'application/pdf', content: makeMultiPagePdfBuffer({ title: T('QLM-118-101 INTERNAL demonstration handover'),
        subtitle: 'SYNTHETIC EXAMPLE - UNAPPROVED - NOT A NATIVE CSR EXPORT', footer: 'FICTIONAL / INTERNAL DEMONSTRATION ONLY', sections }) },
    { label: HANDOVER_FILE_LABELS[1], fileName: 'internal-handover-report-synthetic.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', content: await wordReport(sections) },
    { label: HANDOVER_FILE_LABELS[2], fileName: 'internal-handover-study-data-synthetic.json',
      mime: 'application/json', content: Buffer.from(`${JSON.stringify(buildCsrSource(study), null, 2)}\n`) },
  ];
  const inventory = { notice: INTERNAL_HANDOVER_NOTICE, completion: 'internal demonstration handover only',
    nativeCsr: 'Separate working document; no scientific approval, signature or export is represented by this package.',
    files: payloads.map((p) => ({ fileName: p.fileName, mime: p.mime, byteLength: p.content.length, sha256: sha256(p.content) })) };
  payloads.push({ label: HANDOVER_FILE_LABELS[3], fileName: 'internal-handover-inventory-synthetic.json',
    mime: 'application/json', content: Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`) });
  return payloads.map(({ content, ...spec }) => ({ ...spec, code: `QLM118-INTERNAL-${spec.fileName}`, documentType: 'OTHER', bytes: () => content }));
}

async function verifyDeliveryTask(api, project) {
  const projects = asArray(must(await api('GET', '/api/projects'), 200, 'read delivery board project'), 'data', 'rows');
  const anchor = projects.filter((p) => p.regulatoryProgramId === project.id);
  if (anchor.length !== 1) throw new Error('The internal handover has no unambiguous Tasking project.');
  const board = must(await api('GET', '/api/task-management/board'), 200, 'verify internal delivery task');
  if (board.success !== true || !Array.isArray(board.data) || board.meta?.partial !== false ||
      !Array.isArray(board.meta.unreadSources) || board.meta.unreadSources.length) throw new Error('The delivery Task Board could not be fully read.');
  const tasks = board.data.filter((t) => String(t.project) === String(anchor[0].id) && t.title === HANDOVER_TASK_TITLE);
  if (tasks.length !== 1 || tasks[0].status !== 'completed') throw new Error('The internal delivery task is missing, ambiguous or not completed; internal delivery was not verified.');
}

export async function ensureInternalHandover(ctx, project) {
  const folders = await ensurePortfolioFolders(ctx, project, { handover: true });
  const files = [];
  for (const spec of await buildInternalHandoverFiles()) {
    files.push(await ensurePortfolioVaultFile(ctx, project, { ...spec, folderId: folders.delivery }));
  }
  if (!project.readOnly) {
    await ensureTasks(ctx, project, [{ title: HANDOVER_TASK_TITLE, moduleType: 'Vault', status: 'completed',
      description: `${INTERNAL_HANDOVER_NOTICE} All four reference files were saved and their downloads verified before this internal delivery task was completed.` }], 'the synthetic internal handover');
  }
  await verifyDeliveryTask(ctx.api, project);
  const detail = must(await ctx.api('GET', `/api/c2c/projects/${project.id}`), 200, 'read completed internal handover');
  const expectedStatus = project.readOnly ? 'archived' : 'active';
  if (detail.status !== expectedStatus) throw new Error('Internal handover project status changed during verification; no project status was changed by the seed.');
  return { projectId: project.id, title: project.title, deliveryComplete: true, projectStatus: detail.status,
    archived: detail.status === 'archived', completion: 'internal demonstration handover only',
    notice: INTERNAL_HANDOVER_NOTICE, folderId: folders.delivery, parentFolderId: folders.parent, files,
    exportUrl: `/api/c2c/project-vault/${project.id}/folders/${encodeURIComponent(folders.delivery)}/export` };
}
