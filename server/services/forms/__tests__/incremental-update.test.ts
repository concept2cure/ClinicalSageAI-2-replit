/**
 * The incremental-update writer, generalised to MANY objects.
 *
 * Filling the XFA `datasets` packet needed exactly one object replaced, so the
 * writer took exactly one: `appendIncrementalUpdate(original, replaced)`, with
 * a hardcoded two-entry cross-reference stream and a `dict + stream` shape.
 *
 * Embedding an attachment in the official eSTAR (roadmap item 4,
 * `docs/handoff/HANDOFF_DEVICE.md` §6) cannot be done with that. One attachment
 * is at minimum an `/EmbeddedFile` stream, a `/Filespec` dictionary — which has
 * no stream at all — and a rewritten catalog carrying `/Names /EmbeddedFiles`.
 * Three objects, two of them NEW numbers beyond the file's `/Size`, one of them
 * not a stream. So the writer takes a list, allocates the numbers it is not
 * given, and emits a correct multi-subsection xref stream.
 *
 * Verified with pdf-lib — an independent parser, not this module's own reader —
 * so a writer that agreed with itself and nothing else would fail here.
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';

import { appendIncrementalUpdate, nextFreeObjectNumber } from '../fill-official-pdf';

/** A small, valid, unencrypted PDF to append updates onto. */
async function basePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** Parse the result with pdf-lib and hand back its context. */
async function reload(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.context;
}

describe('appendIncrementalUpdate — many objects in one revision', () => {
  it('preserves the original bytes verbatim and appends after them', async () => {
    const original = await basePdf();
    const out = appendIncrementalUpdate(original, [
      { num: nextFreeObjectNumber(original), gen: 0, dict: '<</Type/Filespec/F(a.txt)>>' },
    ]);
    expect(out.subarray(0, original.length).equals(original)).toBe(true);
    expect(out.length).toBeGreaterThan(original.length);
  });

  it('writes a NEW object with no stream, and an independent parser reads it back', async () => {
    const original = await basePdf();
    const num = nextFreeObjectNumber(original);
    const out = appendIncrementalUpdate(original, [
      { num, gen: 0, dict: '<</Type/Filespec/F(evidence.pdf)/UF(evidence.pdf)>>' },
    ]);

    const ctx = await reload(out);
    const entry = [...ctx.enumerateIndirectObjects()].find(([ref]) => ref.objectNumber === num);
    expect(entry, 'the new object is not in the reloaded document').toBeTruthy();
    const dict = entry![1] as PDFDict;
    expect(dict.get(PDFName.of('Type'))?.toString()).toBe('/Filespec');
    expect(dict.get(PDFName.of('UF'))?.toString()).toContain('evidence.pdf');
  });

  it('writes several objects at once — a stream, a dict, and a replacement', async () => {
    const original = await basePdf();
    const first = nextFreeObjectNumber(original);
    const payload = Buffer.from('attachment bytes');
    const out = appendIncrementalUpdate(original, [
      { num: first, gen: 0, dict: `<</Type/EmbeddedFile/Length ${payload.length}>>`, data: payload },
      { num: first + 1, gen: 0, dict: `<</Type/Filespec/F(a.bin)/EF<</F ${first} 0 R>>>>` },
    ]);

    const ctx = await reload(out);
    const byNum = new Map([...ctx.enumerateIndirectObjects()].map(([ref, o]) => [ref.objectNumber, o]));
    const stream = byNum.get(first) as PDFRawStream;
    expect(Buffer.from(stream.contents).toString('latin1')).toBe('attachment bytes');
    const spec = byNum.get(first + 1) as PDFDict;
    expect(spec.get(PDFName.of('Type'))?.toString()).toBe('/Filespec');
  });

  it('raises /Size past every object it allocated', async () => {
    const original = await basePdf();
    const first = nextFreeObjectNumber(original);
    const out = appendIncrementalUpdate(original, [
      { num: first, gen: 0, dict: '<</Type/Filespec/F(a)>>' },
      { num: first + 4, gen: 0, dict: '<</Type/Filespec/F(b)>>' },
    ]);
    /* The xref stream is itself an object, so /Size must clear first+4 AND it. */
    const tail = out.subarray(original.length).toString('latin1');
    const size = Number(/\/Size\s+(\d+)/.exec(tail)![1]);
    expect(size).toBeGreaterThan(first + 4 + 1);
    const ctx = await reload(out);
    const nums = [...ctx.enumerateIndirectObjects()].map(([r]) => r.objectNumber);
    expect(nums).toContain(first);
    expect(nums).toContain(first + 4);
  });

  it('keeps a REPLACED object at its own number, and the newest revision wins', async () => {
    const original = await basePdf();
    /* Replace the catalog with a marked copy — the shape the attachment work
       needs, since /Names /EmbeddedFiles hangs off the catalog. */
    const ctx0 = await reload(original);
    const catalogRef = [...ctx0.enumerateIndirectObjects()].find(
      ([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type'))?.toString() === '/Catalog',
    )![0];
    const pagesRef = (ctx0.lookup(catalogRef) as PDFDict).get(PDFName.of('Pages'))!.toString();

    const out = appendIncrementalUpdate(original, [
      {
        num: catalogRef.objectNumber,
        gen: catalogRef.generationNumber,
        dict: `<</Type/Catalog/Pages ${pagesRef}/Names<</EmbeddedFiles<</Names[]>>>>>>`,
      },
    ]);

    const ctx = await reload(out);
    const catalog = ctx.lookup(catalogRef) as PDFDict;
    expect(catalog.get(PDFName.of('Names'))).toBeTruthy();
  });

  it('refuses an empty revision rather than writing a no-op xref', async () => {
    const original = await basePdf();
    expect(() => appendIncrementalUpdate(original, [])).toThrow(/at least one object/i);
  });

  it('refuses the same object number twice in one revision', async () => {
    const original = await basePdf();
    const num = nextFreeObjectNumber(original);
    expect(() =>
      appendIncrementalUpdate(original, [
        { num, gen: 0, dict: '<</Type/Filespec/F(a)>>' },
        { num, gen: 0, dict: '<</Type/Filespec/F(b)>>' },
      ]),
    ).toThrow(/twice/i);
  });

  it('refuses a stream whose /Length disagrees with its bytes', async () => {
    /* A parser reads /Length bytes and stops. A dictionary that understates it
       yields a silently truncated attachment — a file that opens, and is
       wrong. */
    const original = await basePdf();
    const num = nextFreeObjectNumber(original);
    expect(() =>
      appendIncrementalUpdate(original, [
        { num, gen: 0, dict: '<</Type/EmbeddedFile/Length 3>>', data: Buffer.from('much longer') },
      ]),
    ).toThrow(/Length/);
  });
});

describe('nextFreeObjectNumber', () => {
  it('is the trailer /Size — the first number nothing occupies', async () => {
    const original = await basePdf();
    const size = Number(/\/Size\s+(\d+)/.exec(original.toString('latin1'))![1]);
    expect(nextFreeObjectNumber(original)).toBe(size);
  });
});
