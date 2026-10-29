/**
 * The numbered questions of an agency letter, found in its text without a model
 * (G3; P-39 step 3). It is the one splitter: the Agency inbox proposes what it
 * returns, and AnA's `draft_fda_ir_response` lists the same.
 *
 * A question starts on a line that opens with its number, as FDA numbers them:
 * "1." "2)" "3:" "1.2." or "Question 4:" / "Q4.". The number is one to three
 * digits per part, so a street number ("10903 New Hampshire Avenue") or a
 * year is never a question. It runs until the next numbered line, a closing
 * line ("Sincerely,", "If you have any questions", the signature page), or two
 * blank lines. Lettered sub-items ("a.", "(i)") stay inside their question.
 *
 * Each question is returned verbatim: `text` is exactly
 * `letter.slice(start, end)`, the agency's words with its own line breaks, so a
 * reader can find it in the letter and nothing is paraphrased or cut.
 *
 * @module shared/agency/letter-questions
 */

export interface LetterQuestion {
  /** The number as the agency wrote it: "1", "2.1". */
  ref: string;
  /** The question's words, exactly as they stand in the letter. */
  text: string;
  /** Offsets into the letter text: `text === letter.slice(start, end)`. */
  start: number;
  end: number;
}

/** A line that opens a question: its number, a delimiter, then the words. */
const OPENER = /^[ \t]*(?:(?:Question|Q)[ \t]*)?(\d{1,3}(?:\.\d{1,3})*)(?:[.):]|\.\)|[ \t]*:)[ \t]+(?=\S)/i;

/** A line that ends the questions: the letter's closing, never a question's last words. */
const CLOSING = /^[ \t]*(?:sincerely|regards|respectfully|if you have any questions|please (?:submit|provide) your response|we request that you|\{?see appended electronic signature)/i;

interface Line { text: string; start: number; end: number }

function linesOf(letter: string): Line[] {
  const out: Line[] = [];
  const re = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(letter)) !== null) {
    if (m[0] === '' && m.index >= letter.length) break;
    const body = m[0].replace(/(?:\r\n|\r|\n)$/, '');
    out.push({ text: body, start: m.index, end: m.index + body.length });
    if (m[0] === '') re.lastIndex += 1;
  }
  return out;
}

export function splitLetterQuestions(letter: string): LetterQuestion[] {
  const questions: LetterQuestion[] = [];
  let open: { ref: string; start: number; end: number } | null = null;
  let blanks = 0;
  const close = () => {
    if (open && open.end > open.start) {
      questions.push({ ref: open.ref, text: letter.slice(open.start, open.end), start: open.start, end: open.end });
    }
    open = null;
  };
  for (const line of linesOf(letter)) {
    const opener = OPENER.exec(line.text);
    if (opener) {
      close();
      open = { ref: opener[1], start: line.start + opener[0].length, end: line.end };
      blanks = 0;
      continue;
    }
    if (!open) continue;
    if (CLOSING.test(line.text)) { close(); continue; }
    if (line.text.trim() === '') {
      blanks += 1;
      if (blanks >= 2) close();
      continue;
    }
    blanks = 0;
    open.end = line.end;
  }
  close();
  return questions.map((q) => {
    const trimmedEnd = q.start + q.text.replace(/\s+$/, '').length;
    return { ...q, end: trimmedEnd, text: letter.slice(q.start, trimmedEnd) };
  });
}
