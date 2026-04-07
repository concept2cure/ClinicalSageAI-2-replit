// Word-level diff with token classification, filters, and safety stats.

export type TokenType = 'ws' | 'num' | 'punct' | 'word';
export type DiffOp = 'same' | 'add' | 'del';

export type DiffToken = { t: string; op: DiffOp; type: TokenType };

export type DiffOptions = {
  hideWhitespace?: boolean;
  hidePunctuation?: boolean;
};

export type DiffStats = {
  adds: number;
  dels: number;
  addsByType: Record<TokenType, number>;
  delsByType: Record<TokenType, number>;
  totalBaseTokens: number; // tokens in original (old) block
  totalChangedVisible: number; // add+del after filters (visible)
};

export type Safety = {
  numericOnly: boolean; // all visible changes are numeric tokens
  changeRatio: number; // visible changes / base tokens
  safe: boolean; // meets thresholds
};

const WS = /^\s+$/;
const NUM = /^[+\-]?(?:\d+|\d*\.\d+)(?:[eE][+\-]?\d+)?%?$/; // 12, 1.23, -0.4e-3, 5%
const PUNCT = /^[()[\]{}.,;:!?\-*#`~"""''<>_=+|\\/]+$/;

function classify(t: string): TokenType {
  if (WS.test(t)) return 'ws';
  if (NUM.test(t)) return 'num';
  if (PUNCT.test(t)) return 'punct';
  return 'word';
}

function tokenize(s: string): string[] {
  // keep whitespace/punct as separate tokens to preserve formatting
  return s.split(/(\s+|[()[\]{}.,;:!?\-*#`~"""''<>_=+|\\/])/).filter(Boolean);
}

export function diffWords(a: string, b: string): DiffToken[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length,
    m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffToken[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: A[i], op: 'same', type: classify(A[i]) });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: A[i], op: 'del', type: classify(A[i]) });
      i++;
    } else {
      out.push({ t: B[j], op: 'add', type: classify(B[j]) });
      j++;
    }
  }
  while (i < n) out.push({ t: A[i], op: 'del', type: classify(A[i]) }), i++;
  while (j < m) out.push({ t: B[j], op: 'add', type: classify(B[j]) }), j++;
  return out;
}

export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

export function renderUnifiedFiltered(
  tokens: DiffToken[],
  opts: DiffOptions
): { html: string; stats: DiffStats } {
  const hideWs = !!opts.hideWhitespace;
  const hideP = !!opts.hidePunctuation;

  const stats: DiffStats = {
    adds: 0,
    dels: 0,
    addsByType: { ws: 0, num: 0, punct: 0, word: 0 },
    delsByType: { ws: 0, num: 0, punct: 0, word: 0 },
    totalBaseTokens: tokens.filter(t => t.op !== 'add').length,
    totalChangedVisible: 0,
  };

  const html = tokens
    .map(({ t, op, type }) => {
      const hide = (type === 'ws' && hideWs) || (type === 'punct' && hideP);
      if (op === 'same') return escapeHtml(t); // always show base text

      if (op === 'add') {
        stats.adds++;
        stats.addsByType[type]++;
        if (hide) return ''; // filtered out
        stats.totalChangedVisible++;
        return `<span class="bg-green-100">${escapeHtml(t)}</span>`;
      }

      // del
      stats.dels++;
      stats.delsByType[type]++;
      if (hide) return '';
      stats.totalChangedVisible++;
      return `<span class="bg-red-100 line-through">${escapeHtml(t)}</span>`;
    })
    .join('');

  return { html, stats };
}

export function computeSafety(
  stats: DiffStats,
  opts?: { safeRatio?: number; allowNumericOnly?: boolean }
): Safety {
  const allowNumericOnly = opts?.allowNumericOnly ?? true;
  const safeRatio = opts?.safeRatio ?? 0.005; // 0.5% default
  const nonNumericChanges =
    stats.addsByType.word +
    stats.delsByType.word +
    (stats.addsByType.punct + stats.delsByType.punct) +
    (stats.addsByType.ws + stats.delsByType.ws);
  const numericOnly = stats.totalChangedVisible > 0 && nonNumericChanges === 0;
  const changeRatio = stats.totalBaseTokens ? stats.totalChangedVisible / stats.totalBaseTokens : 0;
  const safe = (allowNumericOnly && numericOnly) || changeRatio <= safeRatio;
  return { numericOnly, changeRatio, safe };
}

// Legacy function for backward compatibility
export function renderUnified(tokens: DiffToken[]): { html: string; adds: number; dels: number } {
  const legacyTokens = tokens.map(t => ({ t: t.t, op: t.op }));
  let adds = 0,
    dels = 0;
  const html = legacyTokens
    .map(({ t, op }) => {
      if (op === 'same') return escapeHtml(t);
      if (op === 'add') {
        adds++;
        return `<span class="bg-green-100 text-green-800">${escapeHtml(t)}</span>`;
      }
      dels++;
      return `<span class="bg-red-100 text-red-800 line-through">${escapeHtml(t)}</span>`;
    })
    .join('');
  return { html, adds, dels };
}
