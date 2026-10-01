/**
 * Evaluates a GitHub Actions `if:` the way the runner does, so a contract test
 * asks "does this step run on a push to the trunk?" or "does the push run after
 * the scan failed?" instead of pattern-matching the condition's text. A test
 * that matched text was satisfied by `if: github.event_name == 'pull_request'`
 * on a step it never looked at (P1-12 fix round).
 *
 * The language subset the workflows here use: literals, context property access
 * (dot and index), ! == != < <= > >= && || and parentheses, the status functions
 * and contains / startsWith / endsWith. Anything else THROWS: a condition this
 * evaluator cannot read fails the test, it never counts as either answer.
 *
 * Runner semantics (docs: "Evaluate expressions in workflows and actions"):
 *   - a condition with no status function means `success() && (…)`;
 *   - == compares strings case-insensitively; mismatched types compare as
 *     numbers (null → 0, '' → 0, true → 1, other strings → Number or NaN);
 *   - a missing property is null; && and || return an operand, ! a boolean.
 */

export type StatusFns = { success: boolean; failure: boolean; cancelled: boolean };
export type ExprScope = { status: StatusFns; contexts: Record<string, unknown> };

type Tok = { kind: 'str' | 'num' | 'id' | 'sym'; v: string };

const TOKEN = /\s*(?:'((?:[^']|'')*)'|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_-]*)|(==|!=|<=|>=|&&|\|\||[!<>().,[\]]))/y;

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let at = 0;
  while (src.slice(at).trim() !== '') {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`cannot read the expression at "${src.slice(at)}"`);
    at = TOKEN.lastIndex;
    if (m[1] !== undefined) toks.push({ kind: 'str', v: m[1].replace(/''/g, "'") });
    else if (m[2] !== undefined) toks.push({ kind: 'num', v: m[2] });
    else if (m[3] !== undefined) toks.push({ kind: 'id', v: m[3] });
    else toks.push({ kind: 'sym', v: m[4] });
  }
  return toks;
}

export const truthy = (v: unknown): boolean =>
  !(v === null || v === undefined || v === false || v === 0 || v === '' || Number.isNaN(v));

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.trim() === '' ? 0 : Number(v);
  return NaN;
}

const asText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if ((a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')) return a === b;
  return toNumber(a) === toNumber(b);
}

function compare(op: string, a: unknown, b: unknown): boolean {
  if (op === '==') return looseEqual(a, b);
  if (op === '!=') return !looseEqual(a, b);
  const [x, y] = typeof a === 'string' && typeof b === 'string' ? [a.toLowerCase(), b.toLowerCase()] : [toNumber(a), toNumber(b)];
  if (op === '<') return x < y;
  if (op === '<=') return x <= y;
  if (op === '>') return x > y;
  return x >= y;
}

function property(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (o[key] !== undefined) return o[key];
  const k = Object.keys(o).find((name) => name.toLowerCase() === key.toLowerCase());
  return k === undefined ? null : (o[k] ?? null);
}

const STATUS_FNS = new Set(['success', 'failure', 'cancelled', 'always']);

class Parser {
  private at = 0;
  sawStatusFunction = false;

  constructor(private readonly toks: Tok[], private readonly scope: ExprScope) {}

  parse(): unknown {
    const v = this.or();
    if (this.at < this.toks.length) throw new Error(`unexpected "${this.toks[this.at].v}"`);
    return v;
  }

  private is(sym: string): boolean {
    const t = this.toks[this.at];
    return t !== undefined && t.kind === 'sym' && t.v === sym;
  }

  private take(sym?: string): Tok {
    const t = this.toks[this.at];
    if (!t) throw new Error('the expression ends early');
    if (sym !== undefined && !(t.kind === 'sym' && t.v === sym)) throw new Error(`expected "${sym}", found "${t.v}"`);
    this.at += 1;
    return t;
  }

  private or(): unknown {
    let left = this.and();
    while (this.is('||')) {
      this.take();
      const right = this.and();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  private and(): unknown {
    let left = this.comparison();
    while (this.is('&&')) {
      this.take();
      const right = this.comparison();
      left = truthy(left) ? right : left;
    }
    return left;
  }

  private comparison(): unknown {
    const left = this.unary();
    const op = ['==', '!=', '<=', '>=', '<', '>'].find((o) => this.is(o));
    if (!op) return left;
    this.take();
    return compare(op, left, this.unary());
  }

  private unary(): unknown {
    if (!this.is('!')) return this.postfix();
    this.take();
    return !truthy(this.unary());
  }

  private postfix(): unknown {
    let v = this.primary();
    for (;;) {
      if (this.is('.')) {
        this.take();
        const name = this.take();
        if (name.kind !== 'id') throw new Error(`expected a property name, found "${name.v}"`);
        v = property(v, name.v);
      } else if (this.is('[')) {
        this.take();
        const key = this.or();
        this.take(']');
        v = property(v, asText(key));
      } else {
        return v;
      }
    }
  }

  private primary(): unknown {
    const t = this.take();
    if (t.kind === 'str') return t.v;
    if (t.kind === 'num') return Number(t.v);
    if (t.kind === 'sym' && t.v === '(') {
      const v = this.or();
      this.take(')');
      return v;
    }
    if (t.kind !== 'id') throw new Error(`unexpected "${t.v}"`);
    if (t.v === 'true' || t.v === 'false') return t.v === 'true';
    if (t.v === 'null') return null;
    if (this.is('(')) return this.call(t.v);
    if (!(t.v in this.scope.contexts)) throw new Error(`unknown context "${t.v}"`);
    return this.scope.contexts[t.v];
  }

  private call(name: string): unknown {
    this.take('(');
    const args: unknown[] = [];
    while (!this.is(')')) {
      if (args.length > 0) this.take(',');
      args.push(this.or());
    }
    this.take(')');
    return this.apply(name, args);
  }

  private apply(name: string, args: unknown[]): unknown {
    if (STATUS_FNS.has(name)) {
      this.sawStatusFunction = true;
      return name === 'always' ? true : this.scope.status[name as keyof StatusFns];
    }
    const [a, b] = [asText(args[0]).toLowerCase(), asText(args[1]).toLowerCase()];
    switch (name.toLowerCase()) {
      case 'startswith':
        return a.startsWith(b);
      case 'endswith':
        return a.endsWith(b);
      case 'contains':
        return Array.isArray(args[0]) ? args[0].some((x) => looseEqual(x, args[1])) : a.includes(b);
      default:
        throw new Error(`the evaluator does not implement ${name}()`);
    }
  }
}

/** Whether a job or step with this `if:` runs. Throws on a condition it cannot read. */
export function evaluateIf(cond: unknown, scope: ExprScope): boolean {
  if (cond === undefined || cond === null || cond === '') return scope.status.success;
  if (typeof cond === 'boolean' || typeof cond === 'number') return truthy(cond) && scope.status.success;
  const raw = String(cond).trim();
  const wrapped = /^\$\{\{([\s\S]*)\}\}$/.exec(raw);
  const src = wrapped ? wrapped[1] : raw;
  if (src.includes('${{')) {
    throw new Error(`"${raw}" mixes text with \${{ }}; the runner reads that as a non-empty string, which is always true`);
  }
  const parser = new Parser(tokenize(src), scope);
  const value = truthy(parser.parse());
  return parser.sawStatusFunction ? value : scope.status.success && value;
}
