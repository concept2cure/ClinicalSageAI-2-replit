/**
 * A section nobody wrote must not become a regulatory declaration.
 *
 * `mergeWithTemplate` filled any blueprint section the caller supplied no
 * content for with `bp.defaultText`, emitted as ordinary unmarked body prose —
 * while a section with no defaultText was at least bracketed as an instruction.
 * So the sections that read as authored fact were exactly the ones nobody
 * authored:
 *
 *   fda-510k   5.3  "Not applicable — device does not contain software."
 *              5.4  "Not applicable — device is not electrically powered."
 *              5.5  "Not applicable — device is supplied non-sterile."
 *              7    "Clinical data is not required for this submission…"
 *   cer-eu-mdr 3.3  "No clinical investigations were conducted for this device."
 *              6    "The clinical evaluation was performed by qualified personnel…"
 *   csr-ich-e3 8.3  "No deaths occurred during the study."
 *
 * Nothing in the product ever asked whether the device contains software, is
 * mains-powered or ships sterile, whether clinical data are required, or who
 * the evaluators were. Absence of input became a positive assertion to FDA or a
 * Notified Body — and for a software-driven, mains-powered, sterile device,
 * three assertions contradicting the device description in the same document.
 *
 * REACHABILITY, stated honestly: `documents.generate_docx` is the only caller,
 * and its only executor (server/routes/cortex-unified.ts:595) detects tool
 * calls with a `[TOOL_CALL:name(args)]` regex over the model's TEXT that
 * nothing in this repository teaches, while ignoring the gateway's native
 * `toolUses` that AnaToolExecutor does read. No user can produce one of these
 * documents today. This is hardening ahead of that tool loop being repaired — a
 * one-line change to read `toolUses` would ship every sentence above — not the
 * repair of a live false claim.
 *
 * The repo holds this line elsewhere already: estar-mapper treats an unanswered
 * device flag as a gap ("a question nobody answered is not a section nobody
 * needs"), and gspr-postmarket's checkContentField treats scaffold text as
 * ABSENT so it cannot pass a gate.
 */
import { describe, it, expect } from 'vitest';
import { mergeWithTemplate, templateIds } from '../templateRegistry';

const META = { title: 'AcmeGlucoMeter 510(k)', submissionType: '510K', region: 'FDA' } as never;

/** Every section the merge produced, with its paragraphs flattened. */
function paragraphsOf(templateId: string, supplied: unknown[] = []) {
  const out = mergeWithTemplate(templateId, META, supplied as never);
  return out.sections.map((s) => ({
    code: s.sectionCode,
    title: s.title,
    text: (s.paragraphs ?? []).join(' '),
  }));
}

describe('mergeWithTemplate — an unwritten section is never an assertion', () => {
  it('does not declare software, power or sterility for a device it was told the opposite about', () => {
    const rows = paragraphsOf('fda-510k', [
      {
        title: 'Device Description',
        sectionCode: '3',
        paragraphs: [
          'The AcmeGlucoMeter is a software-driven, mains-powered, sterile-packaged blood glucose analyser.',
        ],
      },
    ]);
    const find = (code: string) => rows.find((r) => r.code === code)?.text ?? '';
    /* The suggested wording may still be OFFERED — a default saves an author
       work, and this function has no idea what the device is. What it may never
       do is state it. Each of these must arrive marked as unauthored, so no
       reader and no reviewer can take it as something a person stands behind. */
    for (const [code, label] of [
      ['5.3', 'software validation'],
      ['5.4', 'electrical safety'],
      ['5.5', 'sterilization'],
      ['7', 'clinical data'],
    ] as const) {
      expect(find(code), `${label} was stated rather than proposed`).toMatch(/^\[NOT YET AUTHORED/);
    }
    // And the claim is never left standing as its own sentence.
    expect(find('5.3')).not.toMatch(/^Not applicable/);
  });

  it('marks every unwritten section as unwritten, so a reader can see what is still owed', () => {
    for (const id of templateIds()) {
      for (const row of paragraphsOf(id)) {
        expect(
          row.text.trim(),
          `${id} ${row.code} "${row.title}" was emitted as unmarked prose with no author`,
        ).toMatch(/^\[/);
      }
    }
  });

  it('still uses supplied content verbatim', () => {
    const rows = paragraphsOf('fda-510k', [
      { title: 'Software Validation', sectionCode: '5.3', paragraphs: ['IEC 62304 Class B, V&V report attached.'] },
    ]);
    expect(rows.find((r) => r.code === '5.3')?.text).toBe('IEC 62304 Class B, V&V report attached.');
  });
});
