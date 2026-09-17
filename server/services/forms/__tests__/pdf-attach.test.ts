/**
 * Joining an embedded file to the document, without deleting the form.
 *
 * The catalog's `/Names` dictionary in both eSTAR templates holds exactly one
 * key: `/JavaScript`. That is the form — the reveal guards, the 510(k)-summary
 * rebuilds, every behaviour measured in
 * `docs/reports/estar-acrobat-behaviour-2026-09-04.md`. Writing a fresh names
 * dictionary carrying `/EmbeddedFiles` would attach the file and produce an
 * eSTAR that opens and does nothing.
 *
 * So the test that matters most here is the boring one: after attaching,
 * `/JavaScript` is still pointing where it did.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

import { attachEmbeddedFiles } from '../pdf-attach';
import { buildEmbeddedFileObjects } from '../pdf-embedded-files';
import {
  appendIncrementalUpdate,
  decryptObjectData,
  nextFreeObjectNumber,
  readPdfSecurity,
} from '../fill-official-pdf';
import { readIndirectObjectText } from '../pdf-object-store';
import {
  attachmentDataObjectName,
  isTemplateAcceptableDataObjectName,
} from '../../pathway-engines/estar/estar-attachment-slots';

const DIR = process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates';
const TEMPLATES = [
  { label: 'nIVD', file: 'eSTAR-510k-non-ivd.pdf', names: 221, javascript: 222 },
  { label: 'IVD', file: 'eSTAR-510k-ivd.pdf', names: 236, javascript: 237 },
].map((t) => ({ ...t, path: path.resolve(DIR, t.file), exists: fsSync.existsSync(path.resolve(DIR, t.file)) }));

function hexString(text: string, at: number): Buffer {
  const m = /<([0-9A-Fa-f]*)>/.exec(text.slice(at));
  if (!m) throw new Error('no hex string');
  return Buffer.from(m[1], 'hex');
}

for (const t of TEMPLATES) {
  describe.skipIf(!t.exists)(`attachEmbeddedFiles — ${t.label} eSTAR`, () => {
    let bytes: Buffer;
    let sec: ReturnType<typeof readPdfSecurity>;

    beforeAll(async () => {
      bytes = Buffer.from(await fs.readFile(t.path));
      sec = readPdfSecurity(bytes);
    });

    /** Attach one file and return the resulting document. */
    function attachOne(name = 'Section-5-Software.pdf') {
      const first = nextFreeObjectNumber(bytes);
      const built = buildEmbeddedFileObjects(sec, first, {
        name,
        bytes: Buffer.from('%PDF-1.4\n% attachment\n'),
        mimeType: 'application/pdf',
      });
      const join = attachEmbeddedFiles(bytes, sec, [
        { nameTreeKey: name, filespecNum: built.filespecNum },
      ]);
      return {
        out: appendIncrementalUpdate(bytes, [...built.objects, ...join.objects]),
        built,
        join,
      };
    }

    it('KEEPS the template scripts — the whole point of merging', () => {
      const { out } = attachOne();
      const names = readIndirectObjectText(out, sec, t.names)!;
      expect(names).toContain(`/JavaScript ${t.javascript} 0 R`);
      expect(names).toContain('/EmbeddedFiles');
    });

    it('names the /Filespec it was given, under an enciphered key', () => {
      const { out, built } = attachOne();
      const names = readIndirectObjectText(out, sec, t.names)!;
      expect(names).toContain(`${built.filespecNum} 0 R`);
      /* The key string is enciphered under the names dictionary's own number. */
      expect(names).not.toContain('Section-5-Software.pdf');
      const key = decryptObjectData(sec, t.names, 0, hexString(names, names.indexOf('/EmbeddedFiles')));
      expect(key.toString('latin1')).toBe('Section-5-Software.pdf');
    });

    it('rewrites only the names dictionary — the catalog is left alone', () => {
      const { join } = attachOne();
      expect(join.objects).toHaveLength(1);
      expect(join.objects[0].num).toBe(t.names);
      expect(join.objects[0].data).toBeUndefined();
    });

    it('sorts the name tree by key, as a reader expects to find it', () => {
      const first = nextFreeObjectNumber(bytes);
      const join = attachEmbeddedFiles(bytes, sec, [
        { nameTreeKey: 'zulu.pdf', filespecNum: first },
        { nameTreeKey: 'alpha.pdf', filespecNum: first + 1 },
      ]);
      const tree = join.objects[0].dict;
      const keys = [...tree.matchAll(/<([0-9A-Fa-f]+)>\s*(\d+) 0 R/g)].map(([, hex]) =>
        decryptObjectData(sec, t.names, 0, Buffer.from(hex, 'hex')).toString('latin1'),
      );
      expect(keys).toEqual(['alpha.pdf', 'zulu.pdf']);
    });

    it('refuses to attach twice rather than silently dropping the first set', () => {
      const { out } = attachOne();
      /* The second call sees an /EmbeddedFiles tree it did not write. Merging
         into an arbitrary existing name tree — which may be a multi-level
         /Kids structure — is not something to approximate. */
      expect(() =>
        attachEmbeddedFiles(out, sec, [{ nameTreeKey: 'another.pdf', filespecNum: 9999 }]),
      ).toThrow(/already carries/i);
    });

    it('refuses an empty attachment list', () => {
      expect(() => attachEmbeddedFiles(bytes, sec, [])).toThrow(/at least one/i);
    });

    it('keeps the name-tree KEY and the file NAME as separate strings', () => {
      /* The eSTAR requires a date-shaped key (removeOrphanAttachments deletes
         anything else on the applicant's first save) while the manifest and the
         visible name come from the file name. A builder that used one string
         for both would embed a file the form then deletes. */
      const first = nextFreeObjectNumber(bytes);
      const key = attachmentDataObjectName(new Date(Date.UTC(2026, 8, 8, 11, 22, 33)));
      const built = buildEmbeddedFileObjects(sec, first, {
        name: 'Section-5-Software.pdf',
        bytes: Buffer.from('%PDF-1.4\n% attachment\n'),
        mimeType: 'application/pdf',
      });
      const out = appendIncrementalUpdate(bytes, [
        ...built.objects,
        ...attachEmbeddedFiles(bytes, sec, [{ nameTreeKey: key, filespecNum: built.filespecNum }])
          .objects,
      ]);

      const names = readIndirectObjectText(out, sec, t.names)!;
      const treeKey = decryptObjectData(
        sec,
        t.names,
        0,
        hexString(names, names.indexOf('/EmbeddedFiles')),
      ).toString('latin1');
      expect(treeKey).toBe('2026-09-08T11:22:33');
      expect(isTemplateAcceptableDataObjectName(treeKey)).toBe(true);

      const spec = readIndirectObjectText(out, sec, built.filespecNum)!;
      const fileName = decryptObjectData(
        sec,
        built.filespecNum,
        0,
        hexString(spec, spec.indexOf('/F ')),
      ).toString('latin1');
      expect(fileName).toBe('Section-5-Software.pdf');
      expect(fileName).not.toBe(treeKey);
    });
  });
}
