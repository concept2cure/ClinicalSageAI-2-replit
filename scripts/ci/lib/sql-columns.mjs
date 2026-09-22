/**
 * Column-level SQL parsing shared by the guards that ask "does this column
 * exist?" — ci:column-reachability, ci:insert-columns-declared and
 * ci:model-migration-agreement.
 *
 * One parser, not one per guard. Guards that parse DDL differently disagree
 * about what the schema IS, and none can tell which is right. Before this module
 * existed the three column guards carried three sets of regexes with different
 * blind spots: one read only the FIRST `ADD COLUMN` of a multi-clause ALTER (218
 * of 691 column-adding clauses in the tree were invisible to it); one recorded
 * `ALTER TABLE IF EXISTS t ADD COLUMN c` as a column of a table named `if`,
 * which kept two already-reconciled tables in a divergence baseline; one
 * recorded `ALTER TABLE vault.documents …` as a table named `vault`.
 *
 * Every function here is pure: it takes text and returns data. Walking the repo,
 * deciding which files are durable and ratcheting are the guards' business.
 *
 * Relation identity follows `qualify()` in check-migration-reachability.mjs:
 * `public.x` and `x` are the same relation and are written `x`; any other schema
 * is kept (`vault.documents`), because `vault.documents` and `documents` are
 * different tables and collapsing them lets one mask the other — which is
 * exactly how a missing `public.document_chunks` once hid behind a present
 * `vault.document_chunks`.
 *
 * Pinned by tests/schema-contract/column-reachability-guard.contract.test.ts.
 */

/** Canonical relation identity; see the header. */
export const qualify = (schema, name) => {
  const s = (schema || '').toLowerCase();
  const n = String(name).toLowerCase();
  return !s || s === 'public' ? n : `${s}.${n}`;
};

/**
 * Strip SQL comments before scanning. These files are heavily commented, and the
 * comments discuss DDL: a header reading `-- (CREATE TABLE IF NOT EXISTS only)`
 * otherwise registers a table named "only". Worse than the phantom itself, a
 * commented-out or merely *described* CREATE TABLE would count as a durable
 * creator and mask a genuinely missing one.
 */
export const stripSqlComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

/** The object half of a qualified name: `vault.documents` → `documents`. */
export const lastPart = (rel) => rel.slice(rel.lastIndexOf('.') + 1);

/** Split `table.column` keys whose table part may itself be qualified. */
export const splitKey = (key) => {
  const cut = key.lastIndexOf('.');
  return [key.slice(0, cut), key.slice(cut + 1)];
};

/** Split on commas at parenthesis depth 0, outside quoted text. */
export function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (const c of s) {
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const QUALIFIED = String.raw`(?:"?([a-z_][a-z0-9_]*)"?\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?`;

/**
 * Join string literals concatenated with `||` — `'ALTER TABLE t ' || 'ADD COLUMN
 * c TEXT'` is static DDL split across two literals for line length, and reads
 * as dynamic until the halves are joined. Only literal-to-literal joins are made;
 * a concatenation with a variable stays, and stays unresolvable.
 */
const joinLiteralConcats = (sql) => sql.replace(/'\s*\|\|\s*'/g, '');
/** Table-level elements of a CREATE body, and ADD forms, that are not columns. */
const NOT_A_COLUMN = /^(constraint|primary|unique|foreign|check|exclude|like)$/i;

// ── ALTER TABLE ─────────────────────────────────────────────────────────────

const ALTER_RE = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?` + QUALIFIED + String.raw`\s*\*?\s+([a-z][^;]*)`,
  'gi',
);
const ADD_ACTION_RE = /^\s*ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i;
const RENAME_ACTION_RE =
  /^\s*RENAME\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_]*)\s+TO\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i;

/**
 * Every column a statically-named `ALTER TABLE` brings into existence — EVERY
 * action of the statement, not only the first:
 *
 *   ALTER TABLE [IF EXISTS] [ONLY] [schema.]t [*]
 *     ADD [COLUMN] [IF NOT EXISTS] c …, ADD …, RENAME [COLUMN] a TO b
 *
 * A rename is included because it makes `b` exist. A dynamic target
 * (`ALTER TABLE %I.%I …` inside `format()`) does not match here — see
 * `dynamicColumnAdds`, which resolves it per DO block or reports it unresolved.
 *
 * @param {string} sql comment-stripped SQL
 * @returns {{table: string, column: string}[]}
 */
export function columnsAddedIn(sql) {
  const out = [];
  ALTER_RE.lastIndex = 0;
  for (const m of joinLiteralConcats(sql).matchAll(ALTER_RE)) {
    const table = qualify(m[1], m[2]);
    for (const action of splitTopLevel(m[3])) {
      const a = ADD_ACTION_RE.exec(action);
      if (a) {
        if (a[1] || !NOT_A_COLUMN.test(a[2])) out.push({ table, column: (a[1] || a[2]).toLowerCase() });
        continue;
      }
      const r = RENAME_ACTION_RE.exec(action);
      if (r) out.push({ table, column: (r[1] || r[2]).toLowerCase() });
    }
  }
  return out;
}

// ── CREATE TABLE ────────────────────────────────────────────────────────────

const CREATE_HEAD_RE = new RegExp(
  String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?` + QUALIFIED + String.raw`\s*\(`,
  'gi',
);

/**
 * The columns of every `CREATE TABLE … ( … )`, found by balancing parentheses
 * and splitting the body on top-level commas — not by "everything up to the
 * next `\n);`", which ran past a `) PARTITION BY` into the following function
 * and invented 21 columns, and not line-by-line, which dropped the second of two
 * columns declared on one line. TEMP tables are excluded: they are not schema.
 *
 * @param {string} sql comment-stripped SQL
 * @returns {{table: string, column: string}[]}
 */
export function columnsCreatedIn(sql) {
  const out = [];
  CREATE_HEAD_RE.lastIndex = 0;
  for (const m of sql.matchAll(CREATE_HEAD_RE)) {
    const table = qualify(m[1], m[2]);
    let depth = 0;
    let q = null;
    let j = m.index + m[0].length - 1;
    for (; j < sql.length; j++) {
      const c = sql[j];
      if (q) {
        if (c === q) q = null;
        continue;
      }
      if (c === "'" || c === '"') {
        q = c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    for (const el of splitTopLevel(sql.slice(m.index + m[0].length, j))) {
      const c = /^\s*(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i.exec(el);
      if (c && (c[1] || !NOT_A_COLUMN.test(c[2]))) out.push({ table, column: (c[1] || c[2]).toLowerCase() });
    }
  }
  return out;
}

// ── Dynamic DDL: catalog sweeps inside DO blocks ────────────────────────────

const DO_BLOCK_RE = /\bDO\s+(?:LANGUAGE\s+plpgsql\s+)?\$([A-Za-z_]*)\$([\s\S]*?)\$\1\$/gi;
/** A format() string: '…' (with '' escapes) or $tag$…$tag$. */
const FORMAT_RE = /\bformat\s*\(\s*(?:E?'((?:[^']|'')*)'|\$([A-Za-z_]*)\$([\s\S]*?)\$\2\$)/gi;
const DYN_ADD_RE =
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(%I|"?[a-z_][a-z0-9_]*"?)\s*\.\s*)?%I\s+ADD\s+(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b)(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(%I|"?[a-z_][a-z0-9_]*"?)/gi;
/** Anything else that composes an ALTER … ADD COLUMN at runtime (concatenating a variable). */
const CONCAT_ADD_RE =
  /\bALTER\s+TABLE\b[^;]{0,120}?\|\|[^;]{0,200}?\bADD\s+(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b)/i;

const likeToRegExp = (pat) => {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\' && i + 1 < pat.length) re += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') re += '.*';
    else if (c === '_') re += '.';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
};
const stringLiterals = (s) => [...s.matchAll(/'([a-z0-9_]+)'/gi)].map((m) => m[1].toLowerCase());

/**
 * Columns added by `EXECUTE format('ALTER TABLE %I.%I ADD COLUMN …', …)` inside a
 * DO block — the catalog-sweep idiom a literal regex cannot see.
 *
 * The block's table set is resolved from the same block, in the four shapes the
 * tree uses:
 *   · `table_name LIKE 'stab\_%'`                 (a catalog sweep)
 *   · `table_name IN ('a', 'b')`                  (a named catalog sweep)
 *   · `ARRAY['a', 'b']` feeding FOREACH
 *   · `VALUES ('tbl', 'col', …)` tuples, for `ADD COLUMN %I` whose column is data
 *
 * A block whose table set does not resolve vouches for NOTHING and comes back in
 * `unresolved`, which the guard prints: a new sweep shape is reported and not
 * believed, so any column it alone adds surfaces as a finding rather than
 * being silently assumed present. What a resolved sweep vouches for is ALSO order-dependent
 * — a catalog sweep only touches tables that exist when it runs — and that part
 * is the caller's to enforce, because only the caller knows apply order.
 *
 * @param {string} sql comment-stripped SQL
 * @returns {{ sweeps: {columns: string[], pairs: [string,string][], names: string[], patterns: RegExp[], schema: string|null}[], unresolved: string[] }}
 */
export function dynamicColumnAdds(sql) {
  const sweeps = [];
  const unresolved = [];
  DO_BLOCK_RE.lastIndex = 0;
  for (const block of joinLiteralConcats(sql).matchAll(DO_BLOCK_RE)) {
    const body = block[2];
    const columns = new Set();
    let wantsPairs = false;
    let schema = null;
    let found = false;
    FORMAT_RE.lastIndex = 0;
    for (const f of body.matchAll(FORMAT_RE)) {
      const text = (f[1] ?? f[3] ?? '').replace(/''/g, "'");
      DYN_ADD_RE.lastIndex = 0;
      for (const a of text.matchAll(DYN_ADD_RE)) {
        found = true;
        const s = a[1] ? a[1].replace(/"/g, '').toLowerCase() : null;
        schema = s === '%i' ? null : s ?? 'public';
        const col = a[2].replace(/"/g, '');
        if (/^%I$/i.test(col)) wantsPairs = true;
        else if (!NOT_A_COLUMN.test(col)) columns.add(col.toLowerCase());
      }
    }
    if (!found) {
      if (CONCAT_ADD_RE.test(body)) unresolved.push(body.trim().slice(0, 160));
      continue;
    }
    const names = [];
    const patterns = [];
    for (const m of body.matchAll(/(?<!\bNOT\s{1,4})\btable_name\s+LIKE\s+'((?:[^']|'')+)'/gi)) patterns.push(likeToRegExp(m[1]));
    for (const m of body.matchAll(/(?<!\bNOT\s{1,4})\btable_name\s+IN\s*\(([^)]*)\)/gi)) names.push(...stringLiterals(m[1]));
    for (const m of body.matchAll(/\bARRAY\s*\[([^\]]*)\]/gi)) names.push(...stringLiterals(m[1]));
    const pairs = [...body.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'/gi)].map((m) => [
      m[1].toLowerCase(),
      m[2].toLowerCase(),
    ]);
    const resolvedColumns = columns.size > 0 && (names.length > 0 || patterns.length > 0);
    const resolvedPairs = wantsPairs && pairs.length > 0;
    if (!resolvedColumns && !resolvedPairs) {
      unresolved.push(body.trim().slice(0, 160));
      continue;
    }
    sweeps.push({
      columns: resolvedColumns ? [...columns] : [],
      pairs: resolvedPairs ? pairs : [],
      names,
      patterns,
      schema,
    });
  }
  return { sweeps, unresolved };
}

// ── Drizzle ─────────────────────────────────────────────────────────────────

/** Blank line and block comments outside strings, preserving offsets. */
function blankTsComments(src) {
  let out = '';
  let q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      out += c;
      if (c === '\\') {
        out += src[++i] ?? '';
        continue;
      }
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      q = c;
      out += c;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      out += '\n';
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * Tables and columns a drizzle schema file declares: `pgTable('t', { … })` AND
 * `<pgSchema var>.table('t', { … })`, with the column object found by matching
 * braces (a multi-line `$type<{ … }>` ended the old non-greedy match early and
 * lost the rest of the table), and a column read only in PROPERTY position —
 * `key: builder('sql_name'` — so `.default('draft')` is never a column.
 *
 * @param {string} raw TypeScript source
 * @returns {{tables: string[], columns: {table: string, column: string}[]}}
 */
export function drizzleColumns(raw) {
  const src = blankTsComments(raw);
  const tables = [];
  const columns = [];
  const schemaVars = new Map();
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*pgSchema\(\s*['"]([a-z0-9_]+)['"]\s*\)/g)) {
    schemaVars.set(m[1], m[2]);
  }
  const head = /(?:\bpgTable|\b(\w+)\.table)\(\s*['"]([a-z0-9_]+)['"]\s*,\s*(?:\([^)]*\)\s*=>\s*\(?\s*)?\{/g;
  for (const m of src.matchAll(head)) {
    if (m[1] && !schemaVars.has(m[1])) continue;
    const table = qualify(m[1] ? schemaVars.get(m[1]) : null, m[2]);
    tables.push(table);
    let depth = 0;
    let q = null;
    let expectKey = true;
    for (let j = m.index + m[0].length - 1; j < src.length; j++) {
      const c = src[j];
      if (q) {
        if (c === '\\') {
          j++;
          continue;
        }
        if (c === q) q = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        q = c;
        continue;
      }
      if (c === '{' || c === '(' || c === '[' || c === '<') {
        depth++;
        if (depth === 1) expectKey = true;
        continue;
      }
      if (c === '}' || c === ')' || c === ']' || (c === '>' && src[j - 1] !== '=')) {
        depth--;
        if (depth === 0) break;
        continue;
      }
      if (depth === 1 && c === ',') {
        expectKey = true;
        continue;
      }
      if (depth === 1 && expectKey && /\S/.test(c)) {
        expectKey = false;
        const p = /^['"]?\w+['"]?\s*:\s*[a-zA-Z_]\w*\(\s*['"]([a-zA-Z0-9_]+)['"]/.exec(src.slice(j, j + 200));
        if (p) columns.push({ table, column: p[1].toLowerCase() });
      }
    }
  }
  return { tables, columns };
}

// ── References: which (relation, column) pairs does a statement name? ───────

const KEYWORDS = new Set(
  (
    'all analyse analyze and any array as asc asymmetric both case cast check collate column constraint ' +
    'create current_catalog current_date current_role current_time current_timestamp current_user default ' +
    'deferrable desc distinct do else end except false fetch for foreign from grant group having in initially ' +
    'intersect into lateral leading limit localtime localtimestamp not null offset on only or order placing ' +
    'primary references returning select session_user some symmetric system_user table then to trailing true ' +
    'union unique user using variadic when where window with authorization binary collation concurrently ' +
    'cross current_schema freeze full ilike inner is isnull join left like natural notnull outer overlaps ' +
    'right similar tablesample verbose insert update delete values set conflict nothing exists between ' +
    'interval nulls first last over filter partition within escape unknown at rows range groups preceding ' +
    'following unbounded current row next of nowait skip locked share recursive materialized ordinality ' +
    'ties if excluded by'
  ).split(/\s+/),
);
/**
 * Words that can never be a relation name or alias unquoted (Postgres RESERVED
 * and reserved-can-be-function-or-type), plus SET/VALUES, which the grammar never
 * reads as an alias after an UPDATE/INSERT target. Narrower than KEYWORDS on
 * purpose: a CTE called `locked` or an alias called `rows` is legal.
 */
const REL_STOP = new Set(
  (
    'all analyse analyze and any array as asc asymmetric both case cast check collate column constraint ' +
    'create current_catalog current_date current_role current_time current_timestamp current_user default ' +
    'deferrable desc distinct do else end except false fetch for foreign from grant group having in initially ' +
    'intersect into lateral leading limit localtime localtimestamp not null offset on only or order placing ' +
    'primary references returning select session_user some symmetric system_user table then to trailing true ' +
    'union unique user using variadic when where window with authorization binary collation concurrently ' +
    'cross current_schema freeze full ilike inner is isnull join left like natural notnull outer overlaps ' +
    'right similar tablesample verbose set values'
  ).split(/\s+/),
);
/** System columns exist on every table and are never added by a migration. */
const SYSTEM_COLUMNS = new Set(['ctid', 'xmin', 'xmax', 'cmin', 'cmax', 'tableoid']);
/** Words that may continue a type name after `::` (`timestamp with time zone`). */
const TYPE_CONT = new Set(['varying', 'precision', 'with', 'without', 'time', 'zone']);
const TOK_RE =
  /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|\$([A-Za-z_]*)\$[\s\S]*?\$\1\$|"(?:[^"]|"")*"|\$\d+|\u0000[IP]|[A-Za-z_][A-Za-z0-9_$]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|::|[<>=!~+\-*/%^|&#@?:]{2,}|[(),;.=\[\]]|[<>!~+\-*/%^|&#@?:]|./gy;

/** Replace every `${…}` (brace-balanced) with an opaque token; `$${…}` is a bind parameter. */
function neutralizeInterpolations(sql) {
  let out = '';
  for (let i = 0; i < sql.length; ) {
    if (sql[i] === '$' && sql[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      for (; j < sql.length; j++) {
        if (sql[j] === '{') depth++;
        else if (sql[j] === '}' && --depth === 0) break;
      }
      const isParam = out.endsWith('$');
      if (isParam) out = out.slice(0, -1);
      out += isParam ? ' \u0000P ' : ' \u0000I ';
      i = j + 1;
    } else out += sql[i++];
  }
  return out;
}

function tokenize(sql) {
  const src = neutralizeInterpolations(sql);
  const raw = [];
  TOK_RE.lastIndex = 0;
  let m;
  while (TOK_RE.lastIndex < src.length && (m = TOK_RE.exec(src))) {
    const s = m[0];
    if (/^\s/.test(s) || s.startsWith('--') || s.startsWith('/*')) continue;
    if (s[0] === "'" || (s[0] === '$' && s.length > 1 && s[s.length - 1] === '$' && !/^\$\d+$/.test(s))) raw.push({ t: 'str' });
    else if (s[0] === '"') raw.push({ t: 'id', v: s.slice(1, -1).replace(/""/g, '"').toLowerCase(), quoted: true });
    else if (/^\$\d+$/.test(s) || s === '\u0000P') raw.push({ t: 'param' });
    else if (s === '\u0000I') raw.push({ t: 'interp' });
    else if (/^[A-Za-z_]/.test(s)) raw.push({ t: 'id', v: s.toLowerCase() });
    else if (/^\d/.test(s)) raw.push({ t: 'num' });
    else if ('(),;.='.includes(s) && s.length === 1) raw.push({ t: 'p', v: s });
    else raw.push({ t: 'op', v: s });
  }
  // Merge dotted names: a.b.c → one id with parts; a.* → star; anything built
  // from a template expression → opaque, except `${schema}.name`, whose name is
  // still known.
  const toks = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if ((a.t === 'id' || a.t === 'interp') && raw[i + 1]?.t === 'p' && raw[i + 1].v === '.') {
      const parts = [a.t === 'id' ? a.v : '?'];
      let j = i;
      let star = false;
      let dyn = a.t === 'interp';
      while (raw[j + 1]?.t === 'p' && raw[j + 1].v === '.' && raw[j + 2]) {
        const b = raw[j + 2];
        if (b.t === 'id') parts.push(b.v);
        else if (b.t === 'op' && b.v === '*') star = true;
        else if (b.t === 'interp') {
          dyn = true;
          parts.push('\u0000');
        } else break;
        j += 2;
        if (star) break;
      }
      i = j;
      if (star) toks.push({ t: 'star' });
      else if (parts.includes('\u0000')) toks.push({ t: 'interp' });
      else toks.push({ t: 'id', v: parts[parts.length - 1], parts, dynSchema: dyn && parts[0] === '?' });
    } else toks.push(a);
  }
  return toks;
}

const isKw = (tok, ...words) => tok?.t === 'id' && !tok.quoted && !tok.parts && words.includes(tok.v);
const endsExpr = (tok) =>
  !!tok &&
  (tok.t === 'str' ||
    tok.t === 'num' ||
    tok.t === 'param' ||
    tok.t === 'interp' ||
    (tok.t === 'p' && tok.v === ')') ||
    (tok.t === 'op' && tok.v === ']') ||
    (tok.t === 'id' && (tok.quoted || tok.parts || !KEYWORDS.has(tok.v)) && !['time', 'zone'].includes(tok.v)));

/**
 * The (relation, column) pairs one SQL string names, resolved through the clause
 * each appears in — not "the table word and the column word both occur
 * somewhere in the string", which matched `) AS documents` as the documents
 * table and `c.summary` of `vault.document_catalog c` as documents.summary.
 *
 *   `qualified` — pairs whose relation is certain: an INSERT column list, an
 *     UPDATE SET target, ON CONFLICT columns, `alias.col` / `t.col` / `s.t.col`
 *     resolved through the innermost scope that binds the qualifier. A qualifier
 *     bound nowhere in the statement (its FROM is in another string, or built at
 *     runtime) is kept as `?.<qualifier>.col` when the qualifier could be a table
 *     name, so a caller may match it by name rather than lose it. A relation
 *     whose schema is a template expression yields `?.name` too.
 *
 *   `bare` — unqualified columns, with the relations Postgres would search:
 *     `inner` (the innermost scope that binds anything) and `outer` (enclosing
 *     scopes, for correlated references). `opaque` when the inner scope binds a
 *     derived table, CTE, set-returning function or runtime-built relation, whose
 *     columns cannot be known here. Postgres resolves a bare column against every
 *     relation in scope; so does `referencesColumn`.
 *
 * Validated against a reference database built by the real installers: on 3,131
 * server statements Postgres accepts, the qualified side made 0 claims of a
 * column the relation lacks.
 *
 * @param {string} sql
 * @returns {{qualified: Set<string>, bare: {col: string, inner: string[], outer: string[], opaque: boolean}[]}}
 */
export function columnReferences(sql) {
  const toks = tokenize(sql);
  const ctes = new Set();
  for (let i = 0; i + 2 < toks.length; i++) {
    // WITH [RECURSIVE] name AS (   /   , name AS (   and   WINDOW name AS (
    if (toks[i].t === 'id' && !toks[i].parts && isKw(toks[i + 1], 'as') && toks[i + 2]?.t === 'p' && toks[i + 2].v === '(') {
      const prev = toks[i - 1];
      if (isKw(prev, 'with', 'recursive', 'window') || (prev?.t === 'p' && prev.v === ',')) ctes.add(toks[i].v);
    }
  }

  const scopes = [];
  const newScope = (parent, extra = {}) => {
    const s = {
      id: scopes.length,
      parent,
      rels: [],
      stmt: null,
      target: null,
      hasSelect: false,
      clause: null,
      mode: 'normal',
      role: 'from',
      inConflict: false,
      outAliases: new Set(),
      ...extra,
    };
    scopes.push(s);
    return s;
  };
  const stack = [newScope(-1)];
  const refs = [];
  let typeMode = 0; // > 0 while consuming a type name after `::`

  const addRel = (S, tok) => {
    let rel;
    if (tok.t === 'interp') rel = { kind: 'dynamic' };
    else if (tok.parts) {
      const [schema, name] = tok.parts.slice(-2);
      rel = tok.dynSchema
        ? { kind: 'table', name: `?.${name}`, last: name }
        : { kind: 'table', name: qualify(schema, name), last: name };
    } else rel = { kind: ctes.has(tok.v) ? 'cte' : 'table', name: tok.v, last: tok.v };
    rel.role = S.role;
    S.rels.push(rel);
    S.lastRel = rel;
    if (S.role !== 'from') S.target = rel;
    S.mode = 'alias';
  };

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const prev = toks[i - 1];
    const next = toks[i + 1];
    const S = stack[stack.length - 1];

    // ── type names after `::` are never columns ──
    if (tok.t === 'op' && tok.v === '::') {
      typeMode = 1;
      continue;
    }
    if (typeMode) {
      if (tok.t === 'id' && (typeMode === 1 || TYPE_CONT.has(tok.v))) {
        typeMode = 2;
        continue;
      }
      if (tok.t === 'op' && (tok.v === '[' || tok.v === ']')) continue;
      typeMode = 0;
    }

    // ── parentheses open and close scopes ──
    if (tok.t === 'p' && tok.v === '(') {
      const opener = prev?.t === 'id' && !KEYWORDS.has(prev.v) ? prev.v : null;
      let extra = { opener };
      if (S.mode === 'rel') extra = { opener, derived: true };
      else if ((S.mode === 'alias' || S.mode === 'postalias') && S.lastRel?.role === 'insert') extra = { kind: 'insertcols', target: S.lastRel };
      else if (S.mode === 'postalias' && S.lastRel && S.lastRel.kind !== 'table') extra = { kind: 'aliascols' };
      else if (S.mode === 'funcrel') extra = { opener, funcArgs: true };
      else if (S.mode === 'conflictcols') extra = { kind: 'conflictcols', target: S.target };
      else if (S.mode === 'setlhs') extra = { kind: 'settuple', target: S.target };
      if (S.mode !== 'funcrel' && S.mode !== 'setlhs') S.mode = 'normal';
      const child = newScope(S.id, extra);
      if (extra.kind === 'conflictcols' && S.target) child.rels.push({ ...S.target, role: 'from' });
      stack.push(child);
      continue;
    }
    if (tok.t === 'p' && tok.v === ')') {
      if (stack.length === 1) continue;
      const child = stack.pop();
      const P = stack[stack.length - 1];
      if (child.derived) {
        P.rels.push({ kind: 'derived', role: 'from' });
        P.lastRel = P.rels[P.rels.length - 1];
        P.mode = 'alias';
      } else if (child.funcArgs) P.mode = 'alias';
      else if (child.kind === 'settuple') P.mode = 'setrhs';
      continue;
    }
    // ── statement separators rotate the scope (UNION branches bind separately) ──
    if ((tok.t === 'p' && tok.v === ';') || isKw(tok, 'union', 'intersect', 'except')) {
      const R = newScope(S.parent, {
        derived: S.derived,
        kind: S.kind,
        opener: S.opener,
        funcArgs: S.funcArgs,
        target: S.kind ? S.target : null,
      });
      stack[stack.length - 1] = R;
      continue;
    }

    // ── relation-list state machine ──
    if (S.mode === 'rel') {
      if (isKw(tok, 'only', 'lateral')) continue;
      if (tok.t === 'interp' || (tok.t === 'id' && (tok.quoted || tok.parts || !REL_STOP.has(tok.v)))) {
        if (tok.t === 'id' && S.role === 'from' && next?.t === 'p' && next.v === '(') {
          S.rels.push({ kind: 'func', role: 'from' });
          S.lastRel = S.rels[S.rels.length - 1];
          S.mode = 'funcrel';
          continue;
        }
        addRel(S, tok);
        continue;
      }
      S.mode = 'normal';
    }
    if (S.mode === 'alias') {
      if (isKw(tok, 'as')) continue;
      if (tok.t === 'id' && !tok.parts && (tok.quoted || !REL_STOP.has(tok.v))) {
        S.lastRel.alias = tok.v;
        S.mode = 'postalias';
        continue;
      }
      S.mode = 'postalias';
    }
    if (S.mode === 'postalias') {
      if (tok.t === 'p' && tok.v === ',' && S.lastRel?.role === 'from' && S.clause === 'from') {
        S.mode = 'rel';
        continue;
      }
      S.mode = 'normal';
    }

    // ── keywords that change clause / state ──
    if (tok.t === 'id' && !tok.quoted && !tok.parts && KEYWORDS.has(tok.v)) {
      switch (tok.v) {
        case 'select':
          S.hasSelect = true;
          S.stmt ??= 'select';
          S.clause = 'select';
          break;
        case 'into':
          if (isKw(prev, 'insert')) {
            S.stmt = 'insert';
            S.role = 'insert';
            S.mode = 'rel';
            S.clause = 'into';
          }
          break;
        case 'update':
          if (isKw(prev, 'do')) {
            S.clause = 'doupdate';
            break;
          }
          if (isKw(prev, 'for', 'key', 'no', 'on')) {
            S.clause = 'lock';
            break;
          }
          S.stmt = 'update';
          S.role = 'update';
          S.mode = 'rel';
          S.clause = 'update';
          break;
        case 'delete':
          if (!isKw(prev, 'on')) {
            S.stmt = 'delete';
            S.clause = 'delete';
          }
          break;
        case 'from':
          if (isKw(prev, 'delete')) {
            S.role = 'delete';
            S.mode = 'rel';
            S.clause = 'from';
          } else if (isKw(prev, 'distinct')) {
            /* IS [NOT] DISTINCT FROM */
          } else if (S.hasSelect || S.stmt === 'update') {
            S.role = 'from';
            S.mode = 'rel';
            S.clause = 'from';
          }
          break;
        case 'do':
          if (S.mode === 'conflictcols') S.mode = 'normal';
          break;
        case 'join':
          S.role = 'from';
          S.mode = 'rel';
          S.clause = 'from';
          break;
        case 'using':
          if (S.stmt === 'delete' && S.clause === 'from') {
            S.role = 'from';
            S.mode = 'rel';
          } else S.clause = 'using';
          break;
        case 'set':
          if (S.stmt === 'update' || S.clause === 'doupdate') {
            S.clause = 'set';
            S.mode = 'setlhs';
          }
          break;
        case 'on':
          if (isKw(next, 'conflict')) {
            S.inConflict = true;
            S.clause = 'conflict';
            S.mode = 'conflictcols';
            i++;
          } else if (S.clause !== 'conflict') S.clause = 'on';
          break;
        case 'for':
          if (isKw(next, 'update', 'share', 'no', 'key')) S.clause = 'lock';
          break;
        case 'where':
        case 'group':
        case 'order':
        case 'having':
        case 'limit':
        case 'offset':
        case 'returning':
        case 'values':
        case 'window':
          S.clause = tok.v;
          if (S.mode !== 'conflictcols') S.mode = 'normal';
          break;
        default:
          break;
      }
      continue;
    }
    if (S.mode === 'conflictcols' && tok.t !== 'p') S.mode = 'normal';

    // ── SET assignment targets ──
    if (S.clause === 'set') {
      if (tok.t === 'p' && tok.v === ',') {
        S.mode = 'setlhs';
        continue;
      }
      if (S.mode === 'setlhs' && tok.t === 'id' && !tok.parts) {
        if ((next?.t === 'p' && next.v === '=') || (next?.t === 'op' && next.v === '[')) {
          if (S.target) refs.push({ kind: 'direct', rel: S.target, col: tok.v });
          S.mode = 'setrhs';
          continue;
        }
      }
      if (S.mode === 'setlhs' && tok.t !== 'id') S.mode = 'setrhs';
    }

    if (tok.t !== 'id') continue;

    // ── column references ──
    if (S.kind === 'aliascols' || S.clause === 'lock') continue;
    if (next?.t === 'p' && next.v === '(') continue; // function call
    if (next?.t === 'op' && next.v === '=>') continue; // named argument: make_interval(secs => $1)
    if (SYSTEM_COLUMNS.has(tok.v)) continue;
    if (isKw(prev, 'as', 'collate', 'window', 'over', 'constraint')) {
      if (isKw(prev, 'as')) S.outAliases.add(tok.v);
      continue;
    }
    if (next?.t === 'str') continue; // typed literal: DATE '…', E'…'
    if (!tok.parts && ctes.has(tok.v)) continue;
    if ((tok.v === 'time' && isKw(prev, 'at')) || (tok.v === 'zone' && prev?.v === 'time')) continue;
    if (S.opener === 'extract' && isKw(next, 'from')) continue;
    if (!tok.parts && endsExpr(prev)) {
      S.outAliases.add(tok.v); // implicit alias
      continue;
    }

    if ((S.kind === 'insertcols' || S.kind === 'settuple') && !tok.parts) {
      if (S.target) refs.push({ kind: 'direct', rel: S.target, col: tok.v });
      continue;
    }
    // The scope chain at this token, innermost first, with whether each scope is
    // in an INSERT tail (ON CONFLICT / RETURNING), where the target is visible.
    const chain = stack.map((x) => ({ id: x.id, tail: x.inConflict || x.clause === 'returning' })).reverse();
    if (tok.parts) refs.push({ kind: 'qual', chain, q: tok.parts.slice(0, -1), col: tok.v, dyn: tok.dynSchema });
    else refs.push({ kind: 'bare', chain, col: tok.v, clause: S.clause });
  }

  // ── resolution ──
  const qualified = new Set();
  const bare = [];
  const emit = (rel, col) => {
    if (rel && rel.kind === 'table' && rel.name) qualified.add(`${rel.name}.${col}`);
  };
  const visible = (S, tail) => {
    if (S.stmt === 'insert') return tail ? (S.target ? [S.target] : []) : S.rels.filter((x) => x.role === 'from');
    return S.rels;
  };
  for (const r of refs) {
    if (r.kind === 'direct') {
      emit(r.rel, r.col);
      continue;
    }
    if (r.kind === 'qual') {
      if (r.dyn) continue;
      const q = r.q[r.q.length - 1];
      const qFull = r.q.length >= 2 ? qualify(r.q[r.q.length - 2], q) : null;
      let hit = null;
      for (const { id } of r.chain) {
        const S = scopes[id];
        hit = S.rels.find((x) => {
          if (q === 'excluded' && S.stmt === 'insert') return x === S.target;
          if (qFull) return !x.alias && x.name === qFull;
          return x.alias ? x.alias === q : x.last === q;
        });
        if (hit) break;
      }
      if (hit) emit(hit, r.col);
      else if (qFull) qualified.add(`${qFull}.${r.col}`);
      else if (q !== 'excluded' && !ctes.has(q)) qualified.add(`?.${q}.${r.col}`);
      continue;
    }
    // bare
    for (const [k, { id, tail }] of r.chain.entries()) {
      const S = scopes[id];
      if (k === 0 && (r.clause === 'order' || r.clause === 'group') && S.outAliases.has(r.col)) break;
      const vis = visible(S, tail);
      if (vis.length === 0) continue;
      const outer = [];
      for (const { id: oid, tail: otail } of r.chain.slice(k + 1)) {
        for (const x of visible(scopes[oid], otail)) if (x.kind === 'table' && x.name) outer.push(x.name);
      }
      bare.push({
        col: r.col,
        inner: vis.filter((x) => x.kind === 'table' && x.name).map((x) => x.name),
        outer,
        opaque: vis.some((x) => x.kind !== 'table'),
      });
      break;
    }
  }
  return { qualified, bare };
}

/**
 * Does a statement (its `columnReferences` result) name `rel.column`?
 *
 * Qualified pairs count directly; `?.name.column` (a runtime-built schema, or a
 * qualifier bound in another string) counts when `name` is the relation's own
 * name. A bare column counts when `rel` is in its inner scope, the scope is not
 * opaque, and NO other relation Postgres would search — inner or outer — is
 * known to have that column. That is the rule Postgres applies: a bare column
 * resolves against every relation in scope, so if another one has it, this
 * statement is not reading it from `rel`.
 *
 * @param {{qualified: Set<string>, bare: object[]}} refs
 * @param {string} rel qualified relation name
 * @param {string} column
 * @param {(rel: string, column: string) => boolean} hasColumn is `rel.column` known to exist
 */
export function referencesColumn(refs, rel, column, hasColumn) {
  if (refs.qualified.has(`${rel}.${column}`)) return true;
  if (refs.qualified.has(`?.${lastPart(rel)}.${column}`)) return true;
  for (const b of refs.bare) {
    if (b.col !== column || b.opaque || !b.inner.includes(rel)) continue;
    const others = [...b.inner, ...b.outer].filter((r) => r !== rel);
    if (!others.some((r) => hasColumn(r, column))) return true;
  }
  return false;
}
