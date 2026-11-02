/**
 * A stylesheet's rules as the shell's CSS guards read them: each rule's selector, its
 * body and the @media around it (one level, as app-v2.css nests). Shared by
 * shellQuietChrome.test.tsx (the sidebar's and the top bar's rules) and
 * cmdkPlaces.test.tsx (the palette's): moved here from the first in D1-3 so the
 * second does not repeat it. Not a test file itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CssRule { selector: string; body: string; media: string | null }

/** app-v2.css with its comments removed. */
export const APP_V2_CSS = readFileSync(resolve(__dirname, '../styles/app-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule with its selector, body and enclosing @media (one level, as this sheet nests). */
export function rules(css: string): CssRule[] {
  const out: CssRule[] = [];
  let i = 0;
  const walk = (end: number, media: string | null) => {
    let start = i;
    while (i < end) {
      const ch = css[i];
      if (ch === '{') {
        const prelude = css.slice(start, i).trim();
        let depth = 1;
        let j = i + 1;
        while (j < css.length && depth > 0) {
          if (css[j] === '{') depth++;
          else if (css[j] === '}') depth--;
          j++;
        }
        if (prelude.startsWith('@media')) {
          const save = j;
          i += 1;
          walk(save - 1, prelude);
          i = save;
        } else if (!prelude.startsWith('@')) {
          out.push({ selector: prelude.replace(/\s+/g, ' '), body: css.slice(i + 1, j - 1), media });
          i = j;
        } else {
          i = j;
        }
        start = i;
        continue;
      }
      if (ch === '}' || ch === ';') start = i + 1;
      i++;
    }
  };
  walk(css.length, null);
  return out;
}
