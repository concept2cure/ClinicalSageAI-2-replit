/**
 * What the eSTAR will KEEP once it is open in front of an applicant.
 *
 * Embedding a file and naming it in the manifest is not enough. The template
 * runs two of its own guards, and both of them DELETE:
 *
 *   removeOrphanAttachments()  — at preSave AND preSign — walks every attached
 *     data object and removes any whose name is not `yyyy-mm-dd`-shaped in its
 *     first ten characters, telling the applicant: "The following attachments
 *     were not added with the "Add Attachment" buttons. These attachments will
 *     be deleted, since they are not associated with any section of eSTAR."
 *
 *   AttachmentValidation() — on every add — refuses a duplicate path, a
 *     forbidden extension, a non-ASCII path, a path over 124 characters, and a
 *     file over 1,000,000,000 bytes, calling removeDataObject on each.
 *
 * This matters to a machine-built eSTAR more than to a human one, because the
 * failure is SILENT and DELAYED: the file we embed is present, the manifest
 * names it, the sponsor downloads it — and the first time anyone saves the
 * form, the attachment disappears. The eSTAR still opens. The manifest still
 * carries the token. The bytes are gone.
 *
 * The probe recorded in docs/reports/wo8-estar-attachments-2026-09-07.md §3c
 * used `Section-5-Software.pdf` as the attachment's name-tree key, which is
 * exactly the shape that gets deleted. Nothing in the shipped code was wrong;
 * nothing in it stopped the mistake either.
 *
 * Every rule below is quoted from the template's own scripts, and the extension
 * list is asserted AGAINST the template rather than trusted as a transcription.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

import {
  ATTACHMENT_PATH_MAX_LENGTH,
  ATTACHMENT_SIZE_MAX_BYTES,
  INVALID_ATTACHMENT_EXTENSIONS,
  attachmentDataObjectName,
  checkAttachmentAcceptance,
  isTemplateAcceptableDataObjectName,
  readInvalidAttachmentExtensions,
} from '../estar-attachment-slots';

const DIR = process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates';
const TEMPLATES = [
  { label: 'nIVD', file: 'eSTAR-510k-non-ivd.pdf' },
  { label: 'IVD', file: 'eSTAR-510k-ivd.pdf' },
].map((t) => ({ ...t, path: path.resolve(DIR, t.file), exists: fsSync.existsSync(path.resolve(DIR, t.file)) }));

const AT = new Date(Date.UTC(2026, 8, 8, 11, 22, 33));

describe('attachmentDataObjectName — the name the template will not delete', () => {
  it('is the yyyy-mm-ddTHH:MM:ss shape the template mints for itself', () => {
    /* util.printd("yyyy-mm-ddTHH:MM:ss", new Date()) in the AddAttachment handler. */
    expect(attachmentDataObjectName(AT)).toBe('2026-09-08T11:22:33');
  });

  it('is unique per file within a second, so two attachments cannot collide', () => {
    expect(attachmentDataObjectName(AT, 0)).toBe('2026-09-08T11:22:33');
    expect(attachmentDataObjectName(AT, 1)).not.toBe(attachmentDataObjectName(AT, 0));
    /* Still date-shaped in its first ten characters — the only thing checked. */
    expect(isTemplateAcceptableDataObjectName(attachmentDataObjectName(AT, 7))).toBe(true);
  });

  it('REJECTS a filename as a data-object name — the mistake the §3c probe made', () => {
    expect(isTemplateAcceptableDataObjectName('Section-5-Software.pdf')).toBe(false);
  });

  it.each([
    ['a real date', '2026-09-08T11:22:33', true],
    ['a date with slashes, which isDate splits on', '2026/09/08T11:22:33', true],
    ['month 13 — isDate round-trips and refuses it', '2026-13-08T11:22:33', false],
    ['the 31st of February', '2026-02-31T11:22:33', false],
    ['too short to hold a date', '2026-09', false],
    ['empty', '', false],
  ])('%s', (_label, name, ok) => {
    expect(isTemplateAcceptableDataObjectName(name)).toBe(ok);
  });
});

describe('checkAttachmentAcceptance — the five refusals AttachmentValidation makes', () => {
  const good = {
    path: 'Cover Letter.pdf',
    byteLength: 1024,
    dataObjectName: '2026-09-08T11:22:33',
    existingPaths: [],
  };

  it('accepts a plain PDF with a date-shaped name', () => {
    expect(checkAttachmentAcceptance(good)).toEqual({ accepted: true, refusals: [] });
  });

  it('refuses a duplicate path, because the template deletes the second one', () => {
    const out = checkAttachmentAcceptance({ ...good, existingPaths: ['Cover Letter.pdf'] });
    expect(out.accepted).toBe(false);
    expect(out.refusals.join(' ')).toMatch(/already used/i);
  });

  it.each(['.zip', '.docm', '.exe', '.7z', '.xlsb'])('refuses %s', (ext) => {
    const out = checkAttachmentAcceptance({ ...good, path: `evidence${ext}` });
    expect(out.accepted).toBe(false);
    expect(out.refusals.join(' ')).toMatch(/not an acceptable attachment type/i);
  });

  it('is case-insensitive about the extension, as the template is', () => {
    expect(checkAttachmentAcceptance({ ...good, path: 'Evidence.ZIP' }).accepted).toBe(false);
  });

  it('refuses a non-ASCII path — isValidName, for an FDA application', () => {
    const out = checkAttachmentAcceptance({ ...good, path: 'Résumé.pdf' });
    expect(out.accepted).toBe(false);
    expect(out.refusals.join(' ')).toMatch(/ASCII/i);
  });

  it(`refuses a path over ${ATTACHMENT_PATH_MAX_LENGTH} characters, at the boundary`, () => {
    const at = `${'a'.repeat(ATTACHMENT_PATH_MAX_LENGTH - 4)}.pdf`;
    expect(at.length).toBe(ATTACHMENT_PATH_MAX_LENGTH);
    expect(checkAttachmentAcceptance({ ...good, path: at }).accepted).toBe(true);
    expect(checkAttachmentAcceptance({ ...good, path: `x${at}` }).accepted).toBe(false);
  });

  it('refuses a file over the size cap, at the boundary', () => {
    expect(checkAttachmentAcceptance({ ...good, byteLength: ATTACHMENT_SIZE_MAX_BYTES }).accepted).toBe(true);
    expect(checkAttachmentAcceptance({ ...good, byteLength: ATTACHMENT_SIZE_MAX_BYTES + 1 }).accepted).toBe(false);
  });

  it('refuses a name the template would orphan, and says which guard', () => {
    const out = checkAttachmentAcceptance({ ...good, dataObjectName: 'Section-5-Software.pdf' });
    expect(out.accepted).toBe(false);
    expect(out.refusals.join(' ')).toMatch(/deleted on the applicant's first save/i);
  });

  it('reports EVERY reason, not just the first — a caller fixing one at a time is a bad loop', () => {
    const out = checkAttachmentAcceptance({
      path: `${'ü'.repeat(200)}.zip`,
      byteLength: ATTACHMENT_SIZE_MAX_BYTES + 1,
      dataObjectName: 'nope',
      existingPaths: [],
    });
    expect(out.accepted).toBe(false);
    expect(out.refusals.length).toBeGreaterThanOrEqual(4);
  });
});

describe.skipIf(TEMPLATES.some((t) => !t.exists))('the two templates carry the same set in a different order', () => {
  it('differs only in order — measured, so nobody treats it as a discrepancy', async () => {
    const [nivd, ivd] = await Promise.all(
      TEMPLATES.map(async (t) => readInvalidAttachmentExtensions(await fs.readFile(t.path))),
    );
    expect([...nivd].sort()).toEqual([...ivd].sort());
    expect(nivd).not.toEqual(ivd);
    expect(nivd[0]).toBe('.exe');
    expect(ivd[ivd.length - 2]).toBe('.exe');
  }, 120_000);
});

for (const t of TEMPLATES) {
  describe.skipIf(!t.exists)(`the constants are the template's, not a transcription — ${t.label}`, () => {
    let fromTemplate: string[];

    beforeAll(async () => {
      fromTemplate = await readInvalidAttachmentExtensions(await fs.readFile(t.path));
    }, 120_000);

    it('the shipped extension list is exactly the SET the template declares', () => {
      /* Compared as a set, because the template's own lookup is a substring
         search over the joined text — `InvalidFileTypes.value.indexOf("'" +
         exttype + "'") >= 0` — so order carries no meaning. It is also not
         stable between the two templates: measured 2026-09-08, `.exe` is FIRST
         in the nIVD list and second-to-LAST in the IVD one, with the same 25
         entries either way. An order-sensitive assertion here would read as a
         difference that matters, and it does not. */
      expect([...fromTemplate].sort()).toEqual([...INVALID_ATTACHMENT_EXTENSIONS].sort());
    });

    it('and it is the list FDA actually wrote, not an empty read', () => {
      expect(fromTemplate).toContain('.zip');
      expect(fromTemplate).toContain('.docm');
      expect(fromTemplate.length).toBe(25);
    });
  });
}
