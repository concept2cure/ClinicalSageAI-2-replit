/**
 * The attachment plan, against the REAL vendored FDA eSTAR templates.
 *
 * Every refusal here corresponds to a way a machine-built submission fails
 * SILENTLY: the file is embedded, the manifest names it, the sponsor downloads
 * it — and the document is wrong in a way nothing in the response says. So the
 * refusals are the subject of this file, not an afterthought to the happy path.
 *
 * The resolver is a stub, which is the point of injecting it: the planner's
 * rules are exercised without a database, so they run on every commit rather
 * than only where a program's governed document happens to exist.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

import {
  ATTACHMENT_MANIFEST_SEED,
  EstarAttachmentPlanError,
  attachmentFileName,
  createDeviceAttachmentResolver,
  manifestSeed,
  planEstarAttachments,
  type EstarAttachmentResolver,
} from '../estar-attachment-plan';
import {
  CONDITIONAL_ATTACHMENT_SLOTS,
  listEstarAttachmentSlots,
} from '../estar-attachment-slots';
import { ESTAR_FIELD_MAPS } from '../estar-field-map';

const DIR = process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates';
const TEMPLATES = [
  { label: 'nIVD', file: 'eSTAR-510k-non-ivd.pdf' },
  { label: 'IVD', file: 'eSTAR-510k-ivd.pdf' },
].map((t) => ({ ...t, path: path.resolve(DIR, t.file), exists: fsSync.existsSync(path.resolve(DIR, t.file)) }));

/** A fixed instant: name-tree keys are stamped from it, and must not vary. */
const AT = new Date(Date.UTC(2026, 8, 8, 12, 0, 0));

/** The one slot every 510(k) has, and only takes one of. */
const COVER_LETTER = 'root.CoverLetter.CLAddAttachment110';

function stubResolver(
  bytes = Buffer.from('%PDF-1.7 stub'),
  fileName = 'Cover Letter.pdf',
): EstarAttachmentResolver {
  return async () => ({ ok: true, bytes, fileName, mimeType: 'application/pdf' });
}

describe('attachmentFileName', () => {
  it('keeps a plain ASCII name as it is, plus the extension', () => {
    expect(attachmentFileName('Cover Letter')).toBe('Cover Letter.pdf');
  });

  it('folds the characters a section title actually carries into ASCII', () => {
    // An en dash and a curly apostrophe are what a title pasted out of Word has
    // in it; the eSTAR refuses a non-ASCII path and DELETES the file.
    expect(attachmentFileName('Device — Sponsor’s résumé')).toBe(
      "Device - Sponsor's resume.pdf",
    );
  });

  it('truncates so that the extension survives the 124-character limit', () => {
    const name = attachmentFileName('A'.repeat(400));
    expect(name.length).toBeLessThanOrEqual(124);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('never produces an empty stem', () => {
    expect(attachmentFileName('      ')).toBe('Attachment.pdf');
  });

  it('drops the characters a file name cannot carry', () => {
    expect(attachmentFileName('a/b:c*d?e"f<g>h|i')).toBe('a b c d e f g h i.pdf');
  });

  it('never emits a byte outside printable ASCII, whatever the script', () => {
    // NFKD folds an accent into a letter; it does nothing at all for a script
    // with no ASCII decomposition. The eSTAR refuses a non-ASCII path outright
    // and DELETES the file on the applicant's first save, so the catch-all is
    // the rule, not the tidy-up.
    for (const title of ['試験報告書', 'Σ-index device', 'Device 🎉 v2', 'naïve—café']) {
      const name = attachmentFileName(title);
      expect(name).toMatch(/^[\x20-\x7e]+$/);
      expect(name.endsWith('.pdf')).toBe(true);
    }
    expect(attachmentFileName('試験報告書')).toBe('Attachment.pdf');
  });

  it('honours the 124-character ceiling even when the extension is the long part', () => {
    const name = attachmentFileName('Report', `.${'x'.repeat(400)}`);
    expect(name.length).toBeLessThanOrEqual(124);
  });

  it('keeps a non-pdf extension from a vault file name', () => {
    expect(attachmentFileName('Bench data', '.xlsx')).toBe('Bench data.xlsx');
  });
});

describe('the plan reads the jurisdiction radio from the template, and may', () => {
  /*
   * `planEstarAttachments` resolves a conditional slot's chapter from values it
   * reads out of the TEMPLATE bytes. That is only correct while nothing the
   * fill writes can change those values — and exactly one slot per template is
   * conditional: the User Fee Form, routed by
   * `root.ApplicationType.ATRadioButton100`, `/CHAPTER 1/CH1.04/` when it reads
   * "2" (Health Canada) and `/CHAPTER 1/CH1.09/` otherwise (FDA).
   *
   * Both templates ship "1", and no field map writes that path today. The day
   * one does, the plan would resolve the chapter from a stale "1" while the
   * filled form carries "2", and a US MDUFA cover sheet would be filed under
   * Health Canada's chapter — the precise failure `estar-attachment-slots.ts`
   * spends a docblock on.
   *
   * Nothing held that assumption, so this does. When it fails, the fix is not to
   * delete it: it is to feed the plan the value the fill will WRITE rather than
   * the one the template ships.
   */
  it('is safe only because no field map writes a path a conditional slot routes by', () => {
    const decidedBy = new Set(
      Object.values(CONDITIONAL_ATTACHMENT_SLOTS).map((c) => c.decidedBy),
    );
    expect(decidedBy.size).toBeGreaterThan(0);

    const collisions: string[] = [];
    for (const [descriptorId, map] of Object.entries(ESTAR_FIELD_MAPS)) {
      for (const [key, spec] of Object.entries(map)) {
        const written = [spec.xfaSomPath, ...(spec.alsoWriteSomPaths ?? [])].filter(
          (p): p is string => typeof p === 'string',
        );
        for (const somPath of written) {
          if (decidedBy.has(somPath)) collisions.push(`${descriptorId}.${key} writes ${somPath}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('manifestSeed', () => {
  it('accepts exactly what both templates ship', () => {
    expect(manifestSeed(ATTACHMENT_MANIFEST_SEED)).toBe('***Start***');
  });

  it('refuses a template whose manifest already carries tokens', () => {
    expect(() => manifestSeed('***Start***<<a.pdf|/CHAPTER 1/CH1.01/>>')).toThrow(
      EstarAttachmentPlanError,
    );
  });

  it('refuses a template with no manifest node at all', () => {
    expect(() => manifestSeed(null)).toThrow(/no root.AttachmentManifest node/);
  });
});

for (const t of TEMPLATES) {
  describe.skipIf(!t.exists)(`planEstarAttachments — ${t.label} eSTAR`, () => {
    let bytes: Buffer;
    let slotPaths: string[];

    beforeAll(async () => {
      bytes = await fs.readFile(t.path);
      slotPaths = (await listEstarAttachmentSlots(bytes)).map((s) => s.somPath);
    });

    it("builds the manifest by appending to the template's own seed", async () => {
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [{ slot: COVER_LETTER, source: { kind: 'vault_document', documentId: 'd1' } }],
        resolve: stubResolver(),
        at: AT,
      });

      expect(plan.refused).toEqual([]);
      expect(plan.attachments).toHaveLength(1);
      expect(plan.manifest).toBe('***Start***<<Cover Letter.pdf|/CHAPTER 1/CH1.01/>>');
      // FDA's checkRemovedAttachments tests indexOf("<<") > 0, STRICTLY.
      expect(plan.manifest!.indexOf('<<')).toBeGreaterThan(0);
    });

    it("carries FDA's own description for the slot", async () => {
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [{ slot: COVER_LETTER, source: { kind: 'vault_document', documentId: 'd1' } }],
        resolve: stubResolver(),
        at: AT,
      });
      expect(plan.attachments[0].description).toBe('Administrative Documentation | Cover Letter');
    });

    it('stamps a date-shaped, unique name-tree key per request', async () => {
      const twoSlots = slotPaths.filter((p) => p !== COVER_LETTER).slice(0, 2);
      let n = 0;
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: twoSlots.map((slot) => ({
          slot,
          source: { kind: 'vault_document' as const, documentId: slot },
        })),
        resolve: async () => ({
          ok: true,
          bytes: Buffer.from('%PDF-1.7 stub'),
          fileName: `File ${n++}.pdf`,
          mimeType: 'application/pdf',
        }),
        at: AT,
      });
      expect(plan.refused).toEqual([]);
      const keys = plan.attachments.map((a) => a.dataObjectName);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(k.slice(0, 10)).toBe('2026-09-08');
    });

    it('refuses a slot this template does not declare', async () => {
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [
          {
            slot: 'root.NotASlot.XXAddAttachment999',
            source: { kind: 'vault_document', documentId: 'd1' },
          },
        ],
        resolve: stubResolver(),
        at: AT,
      });
      expect(plan.attachments).toEqual([]);
      expect(plan.manifest).toBeNull();
      expect(plan.refused[0].reasons[0]).toMatch(/declares no attachment slot/);
    });

    it("refuses a second file into a slot the form holds one row for, in FDA's words", async () => {
      let n = 0;
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [
          { slot: COVER_LETTER, source: { kind: 'vault_document', documentId: 'a' } },
          { slot: COVER_LETTER, source: { kind: 'vault_document', documentId: 'b' } },
        ],
        resolve: async () => ({
          ok: true,
          bytes: Buffer.from('%PDF-1.7 stub'),
          fileName: `Letter ${n++}.pdf`,
          mimeType: 'application/pdf',
        }),
        at: AT,
      });
      expect(plan.attachments).toHaveLength(1);
      expect(plan.refused).toHaveLength(1);
      expect(plan.refused[0].reasons[0]).toContain('Only a single cover letter is needed.');
    });

    it('refuses a duplicate file name — the template deletes the second file', async () => {
      const twoSlots = slotPaths.filter((p) => p !== COVER_LETTER).slice(0, 2);
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: twoSlots.map((slot) => ({
          slot,
          source: { kind: 'vault_document' as const, documentId: slot },
        })),
        resolve: stubResolver(Buffer.from('%PDF-1.7 stub'), 'Same Name.pdf'),
        at: AT,
      });
      expect(plan.attachments).toHaveLength(1);
      expect(plan.refused[0].reasons.join(' ')).toMatch(/already used by another attachment/);
    });

    it('refuses a file type the eSTAR will not keep', async () => {
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [{ slot: COVER_LETTER, source: { kind: 'vault_document', documentId: 'd1' } }],
        resolve: stubResolver(Buffer.from('PK'), 'evidence.zip'),
        at: AT,
      });
      expect(plan.attachments).toEqual([]);
      expect(plan.refused[0].reasons.join(' ')).toMatch(/not an acceptable attachment type/);
    });

    it("reports the resolver's own reason when it cannot produce bytes", async () => {
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [{ slot: COVER_LETTER, source: { kind: 'authored_section', sectionCode: 'A.1' } }],
        resolve: async () => ({ ok: false, reason: 'Section "A.1" is authored but not finalized.' }),
        at: AT,
      });
      expect(plan.attachments).toEqual([]);
      expect(plan.refused[0].reasons).toEqual(['Section "A.1" is authored but not finalized.']);
    });

    it("resolves the User Fee Form from the template's OWN jurisdiction radio, not a guess", async () => {
      // Both templates ship ApplicationType.ATRadioButton100 = "1" (FDA), so the
      // one conditional slot resolves to CH1.09 — the same computation FDA's
      // own script performs on the same input. CH1.04 is Health Canada.
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: [
          {
            slot: 'root.AdministrativeDocumentation.ADAddAttachment910',
            source: { kind: 'vault_document', documentId: 'fee' },
          },
        ],
        resolve: stubResolver(Buffer.from('%PDF-1.7 stub'), 'User Fee.pdf'),
        at: AT,
      });
      expect(plan.refused).toEqual([]);
      expect(plan.attachments[0].chapter).toBe('/CHAPTER 1/CH1.09/');
    });

    it('plans every slot the template declares without refusing one', async () => {
      // The point of slice 4 was that all 113/145 are reachable. A planner that
      // quietly refused a class of them would still pass every test above.
      let n = 0;
      const plan = await planEstarAttachments({
        templateBytes: bytes,
        requests: slotPaths.map((slot) => ({
          slot,
          source: { kind: 'vault_document' as const, documentId: slot },
        })),
        resolve: async () => ({
          ok: true,
          bytes: Buffer.from('%PDF-1.7 stub'),
          fileName: `Doc ${n++}.pdf`,
          mimeType: 'application/pdf',
        }),
        at: AT,
      });
      expect(plan.refused).toEqual([]);
      expect(plan.attachments).toHaveLength(slotPaths.length);
      expect(plan.manifest!.startsWith('***Start***')).toBe(true);
      expect(plan.manifest!.split('<<').length - 1).toBe(slotPaths.length);
    });
  });
}

/**
 * The RESOLVER, run for real.
 *
 * It shipped with no test at all. The route's attachment tests mock the factory
 * — the right seam for testing the route's WIRING — which meant nothing ever
 * executed the resolver itself, and it went out passing `requestDb(req)` as its
 * `client`: a Drizzle instance whose `.query` is the relational-query namespace,
 * not the `(text, params)` function `DeviceContentClient` calls. Every
 * governed-section attachment would have thrown at runtime.
 *
 * A fake client is enough to run every branch, which is the point of the
 * injection — these run on every commit rather than only where a program's
 * governed document happens to exist.
 */
describe('createDeviceAttachmentResolver', () => {
  const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

  /** A c2c_documents row plus its sections, answered like the real pg client. */
  function fakeClient(sections: Array<Record<string, unknown>>) {
    const calls: string[] = [];
    return {
      calls,
      // Generic, like DeviceContentClient.query<T> — a non-generic fake cannot
      // satisfy the interface, so the resolver could not be typed against it.
      query: async <T = Record<string, unknown>>(text: string): Promise<{ rows: T[] }> => {
        calls.push(text.replace(/\s+/g, ' ').trim().slice(0, 40));
        if (/FROM c2c_documents/.test(text)) {
          return { rows: [{ id: 'doc-1', doc_type: 'k510' }] as unknown as T[] };
        }
        if (/FROM c2c_document_sections/.test(text)) return { rows: sections as unknown as T[] };
        return { rows: [] as T[] };
      },
    };
  }

  const FINAL = {
    section_key: 'A.1',
    label: 'Cover Letter',
    status: 'approved',
    content: 'A cover letter with enough substance to clear the forty-character floor.',
    mandatory: true,
  };

  it('renders a finalized governed section to a real PDF', async () => {
    const client = fakeClient([FINAL]);
    const resolve = createDeviceAttachmentResolver({
      organizationId: 2,
      programUuid: PROGRAM,
      client,
    });

    const out = await resolve({ kind: 'authored_section', sectionCode: 'A.1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.mimeType).toBe('application/pdf');
    expect(out.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.fileName).toBe('A.1 Cover Letter.pdf');
  });

  it('REFUSES a section that is authored but still a draft', async () => {
    /* The difference between filing an approved section and filing an
       unreviewed machine draft into a named CDRH slot. `drafting` is what
       write_kit_section defaults to, and it rejects bodies under 40 characters
       — the same floor — so every AI draft would otherwise pass on length. */
    const resolve = createDeviceAttachmentResolver({
      organizationId: 2,
      programUuid: PROGRAM,
      client: fakeClient([{ ...FINAL, status: 'drafting' }]),
    });

    const out = await resolve({ kind: 'authored_section', sectionCode: 'A.1' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/not finalized/);
  });

  it('refuses a section that has no authored content', async () => {
    const resolve = createDeviceAttachmentResolver({
      organizationId: 2,
      programUuid: PROGRAM,
      client: fakeClient([FINAL]),
    });
    const out = await resolve({ kind: 'authored_section', sectionCode: 'Z.9' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/no authored content/);
  });

  it('loads the section set ONCE however many attachments ask for it', async () => {
    const client = fakeClient([FINAL]);
    const resolve = createDeviceAttachmentResolver({
      organizationId: 2,
      programUuid: PROGRAM,
      client,
    });
    await resolve({ kind: 'authored_section', sectionCode: 'A.1' });
    await resolve({ kind: 'authored_section', sectionCode: 'A.1' });
    await resolve({ kind: 'authored_section', sectionCode: 'A.1' });
    // Two queries for the first call (document, then sections), none after.
    expect(client.calls).toHaveLength(2);
  });

  it('says plainly that a legacy project has no governed document or vault', async () => {
    const resolve = createDeviceAttachmentResolver({ organizationId: 2, programUuid: null });
    const out = await resolve({ kind: 'authored_section', sectionCode: 'A.1' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/no regulatory program/);
  });
});
