/**
 * An in-memory `regulatory_programs` that answers the reads
 * services/ana-ri/drive-context makes by their SQL, the way the table would.
 *
 * A fake that hands back every row of the organisation for any program read
 * passes code that matches in memory and fails code that matches in the
 * database, whichever of the two is right. This one answers each read by its
 * WHERE clause and LIMIT, so a test sees what the database would have returned
 * — including that a read limited to the 100 most recent programs never sees
 * the 101st. A read it does not recognise throws: a query whose shape changed
 * must fail its tests, not be answered with a guess.
 *
 * The SQL itself runs against Postgres in
 * services/ana/__tests__/drive-program-resolution.test.ts.
 */
import type { ProgramQuery } from '../../drive-context';

export interface ProgramRow {
  id: string;
  organization_id: number;
  name: string;
  code: string | null;
  /** Larger is more recent; the reads return the most recently touched first. */
  updated_at: number;
  deleted?: boolean;
}

const OWN_ORG_LIVE = /FROM regulatory_programs\s+WHERE organization_id = \$1 AND deleted_at IS NULL/;

/** A LIKE pattern (escape character `\`) as the case-insensitive match ILIKE makes. */
function ilike(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '%') {
      source += '[\\s\\S]*';
    } else if (ch === '_') {
      source += '[\\s\\S]';
    } else {
      source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

export function programTable(rows: readonly ProgramRow[]): ProgramQuery {
  return async (text, params) => {
    if (!OWN_ORG_LIVE.test(text)) throw new Error(`program-table: unrecognised read:\n${text}`);
    const live = rows
      .filter(r => r.organization_id === params[0] && !r.deleted)
      .sort((a, b) => b.updated_at - a.updated_at || a.name.localeCompare(b.name));
    const out = (hits: ProgramRow[], limit: number) => ({
      rows: hits.slice(0, limit).map(({ id, name, code }) => ({ id, name, code })),
    });
    // A match read must be bounded; one that is not is a defect, not a fixture.
    const literalLimit = (): number => {
      const m = /LIMIT (\d+)\s*$/.exec(text);
      if (!m) throw new Error(`program-table: unbounded match read:\n${text}`);
      return Number(m[1]);
    };
    if (text.includes('id::text = lower($2)')) {
      const wanted = String(params[1]).toLowerCase();
      const hits = live.filter(
        r =>
          r.id === wanted ||
          r.name.toLowerCase() === wanted ||
          (r.code !== null && r.code.trim().toLowerCase() === wanted)
      );
      return out(hits, literalLimit());
    }
    if (text.includes("name ILIKE $2 ESCAPE '\\' OR code ILIKE $2 ESCAPE '\\'")) {
      const match = ilike(String(params[1]));
      const hits = live.filter(r => match.test(r.name) || (r.code !== null && match.test(r.code)));
      return out(hits, literalLimit());
    }
    if (/LIMIT \$2\s*$/.test(text)) return out(live, Number(params[1]));
    throw new Error(`program-table: unrecognised read:\n${text}`);
  };
}
