/** The existing content-writer census, with SQL SET assignments kept separate from predicates. */
import ts from 'typescript';

// This is the gate's existing INSERT perimeter. UPDATE remains table-independent.
const GOVERNED_DOC_TABLES = [
  'concept2cure_artifacts', 'concept2cure_artifact_versions', 'artifact_versions',
  'protocol_sections', 'protocol_documents', 'biosketch_sections', 'cerv2_510k_sections',
  'dms_plan_elements', 'consent_form_elements', 'coauthor_documents', 'q_sub_section_bodies',
  'labeling_pi_sections',
];

function blockCommentEnd(text, start) {
  let depth = 1;
  let at = start + 2;
  while (at < text.length && depth) {
    if (text.startsWith('/*', at)) { depth++; at += 2; }
    else if (text.startsWith('*/', at)) { depth--; at += 2; }
    else at++;
  }
  return at;
}

function triviaEnd(text, start) {
  let at = start;
  while (at < text.length) {
    if (/\s/.test(text[at])) { at++; continue; }
    if (text.startsWith('--', at)) {
      const end = text.indexOf('\n', at + 2);
      at = end < 0 ? text.length : end + 1;
      continue;
    }
    if (text.startsWith('/*', at)) { at = blockCommentEnd(text, at); continue; }
    break;
  }
  return at;
}

function quoted(text, start, quote) {
  let at = start + 1;
  let value = '';
  while (at < text.length) {
    if (quote === "'" && text[start - 1]?.toUpperCase() === 'E' && text[at] === '\\') {
      value += text[at + 1] ?? ''; at += 2; continue;
    }
    if (text[at] === quote) {
      if (text[at + 1] === quote) { value += quote; at += 2; continue; }
      return { end: at + 1, value };
    }
    value += text[at++];
  }
  return { end: at, value };
}

function dollarEnd(text, start) {
  const delimiter = text.slice(start).match(/^\$(?:[A-Za-z_]\w*)?\$/)?.[0];
  if (!delimiter) return null;
  const end = text.indexOf(delimiter, start + delimiter.length);
  return end < 0 ? text.length : end + delimiter.length;
}

function sqlTokens(text) {
  const tokens = [];
  let at = 0;
  while ((at = triviaEnd(text, at)) < text.length) {
    const char = text[at];
    if (char === "'" || char === '"') {
      const item = quoted(text, at, char);
      tokens.push({ text: item.value, quoted: char === '"', opaque: char === "'" });
      at = item.end;
      continue;
    }
    const dollar = char === '$' ? dollarEnd(text, at) : null;
    if (dollar !== null) { tokens.push({ text: '', opaque: true }); at = dollar; continue; }
    const word = text.slice(at).match(/^[A-Za-z_][\w$]*/)?.[0];
    if (word) { tokens.push({ text: word, word: true }); at += word.length; continue; }
    tokens.push({ text: char });
    at++;
  }
  return tokens;
}

const keyword = (token, name) => token?.word === true && token.text.toUpperCase() === name;
const identifier = token => token && (token.word || token.quoted);
const contentColumn = token => token?.quoted ? token.text === 'content' : keyword(token, 'CONTENT');

function tableAt(tokens, start) {
  if (!identifier(tokens[start])) return null;
  const names = [tokens[start].text];
  let end = start + 1;
  while (tokens[end]?.text === '.' && identifier(tokens[end + 1])) {
    names.push(tokens[end + 1].text);
    end += 2;
  }
  return { name: names.at(-1).toLowerCase(), end };
}

const assignmentEnd = token => !token.opaque && !token.quoted
  && (token.text === ';' || keyword(token, 'WHERE') || keyword(token, 'RETURNING'));
const targetColumn = (tokens, at) => contentColumn(tokens[at]) && tokens[at + 1]?.text === '=';

function tokenDepth(token) {
  if (token.opaque || token.quoted) return 0;
  if (['(', '['].includes(token.text)) return 1;
  return [')', ']'].includes(token.text) ? -1 : 0;
}

function contentAssignment(tokens, start) {
  let depth = 0;
  let target = true;
  for (let at = start; at < tokens.length; at++) {
    const token = tokens[at];
    if (depth === 0) {
      if (assignmentEnd(token)) return false;
      if (target && targetColumn(tokens, at)) return true;
      target = !token.opaque && !token.quoted && token.text === ',';
    }
    depth += tokenDepth(token);
  }
  return false;
}

function contentInsert(tokens, start, tables) {
  const table = tableAt(tokens, start);
  if (!table || !tables.has(table.name) || tokens[table.end]?.text !== '(') return false;
  for (let at = table.end + 1; at < tokens.length && tokens[at].text !== ')'; at++) {
    if (contentColumn(tokens[at])) return true;
  }
  return false;
}

function routineWrites(text, tables) {
  // Routine definitions can execute SQL quoted inside their body (including
  // EXECUTE). Keep the original conservative census there; treating the whole
  // body as an inert SQL value would silently hide an existing writer form.
  const updates = [...text.matchAll(/UPDATE\s+[\w.]+\s+SET[\s\S]{0,400}?\bcontent\s*=/g)].length;
  const insert = new RegExp(`INSERT\\s+INTO\\s+(?:${[...tables].join('|')})\\s*\\([^)]*\\bcontent\\b`, 'gi');
  return updates + [...text.matchAll(insert)].length;
}

function sqlWrites(text, tables) {
  if (/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b/i.test(text)) return routineWrites(text, tables);
  const tokens = sqlTokens(text);
  let count = 0;
  for (let at = 0; at < tokens.length; at++) {
    if (keyword(tokens[at], 'UPDATE')) {
      const table = tableAt(tokens, at + 1);
      if (table && keyword(tokens[table.end], 'SET') && contentAssignment(tokens, table.end + 1)) count++;
    }
    if (keyword(tokens[at], 'INSERT') && keyword(tokens[at + 1], 'INTO') && contentInsert(tokens, at + 2, tables)) count++;
  }
  return count;
}

function drizzleContentSet(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
    || node.expression.name.text !== 'set' || !node.arguments[0] || !ts.isObjectLiteralExpression(node.arguments[0])) return false;
  return node.arguments[0].properties.some(item => ts.isPropertyAssignment(item)
    && ts.isIdentifier(item.name) && item.name.text === 'content');
}

const concatenation = node => Boolean(node && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken);
function concatenatedSql(node) {
  if (concatenation(node)) return concatenatedSql(node.left) + concatenatedSql(node.right);
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : ' $parameter ';
}

function sqlLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => ` $parameter ${span.literal.text}`).join('');
  if (concatenation(node) && !concatenation(node.parent)) return concatenatedSql(node);
  return undefined;
}

/** Syntactic writer count, not inference of dynamic SQL or application control flow. */
export function contentWriteCount(text, additionalInsertTables = []) {
  const source = ts.createSourceFile('lineage-writers.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const tables = new Set([...GOVERNED_DOC_TABLES, ...additionalInsertTables]);
  let count = 0;
  function visit(node) {
    const sql = concatenation(node.parent) ? undefined : sqlLiteral(node);
    if (sql !== undefined) count += sqlWrites(sql, tables);
    if (drizzleContentSet(node)) count++;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return count;
}
