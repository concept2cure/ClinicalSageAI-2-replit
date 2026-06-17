/**
 * AnA session bootstrap — pure ranking + formatting core (no DB, no I/O).
 *
 * Split from ana-session-bootstrap.ts so the selection/formatting logic is
 * directly unit-testable without dragging in the database. The DB loaders live
 * in ana-session-bootstrap.ts and call these.
 */

export interface BootstrapAtom {
  title: string;
  content: string;
  category?: string | null;
  importance?: string | null;
  isVerified?: boolean | null;
  confidence?: number | null;
  createdAt?: Date | string | null;
}

export interface OutcomeLesson {
  capabilityKey: string;
  outcome: string;
  documentType?: string | null;
  lessonsLearned?: string | null;
}

const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Numeric desirability of an atom for cold-start injection (higher = keep). */
export function bootstrapAtomScore(a: BootstrapAtom): number {
  const importance = IMPORTANCE_WEIGHT[(a.importance ?? '').toLowerCase()] ?? 1.5;
  const verified = a.isVerified ? 1.5 : 0;
  const confidence = typeof a.confidence === 'number' ? a.confidence : 0.5;
  return importance + verified + confidence;
}

/**
 * Rank atoms for cold-start injection by importance / verification / confidence,
 * breaking ties by recency, and return the top `limit`. Pure and deterministic.
 */
export function rankBootstrapAtoms(atoms: BootstrapAtom[], limit: number): BootstrapAtom[] {
  const toTime = (v: Date | string | null | undefined): number => {
    if (!v) return 0;
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  };
  return [...atoms]
    .sort((a, b) => {
      const s = bootstrapAtomScore(b) - bootstrapAtomScore(a);
      if (s !== 0) return s;
      return toTime(b.createdAt) - toTime(a.createdAt);
    })
    .slice(0, Math.max(0, limit));
}

function clip(s: string, max: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export interface SessionBootstrapParts {
  workingMemorySummary?: string | null;
  projectAtoms: BootstrapAtom[];
  clientAtoms: BootstrapAtom[];
  outcomeLessons: OutcomeLesson[];
  atomLimit?: number;
}

/**
 * Format the bootstrap context block injected at session start. Pure: takes
 * already-loaded parts and renders compact markdown. Returns '' when there is
 * genuinely nothing to recall (so callers can omit the block entirely).
 */
export function formatSessionBootstrap(parts: SessionBootstrapParts): string {
  const atomLimit = parts.atomLimit ?? 6;
  const lines: string[] = [];

  if (parts.workingMemorySummary && parts.workingMemorySummary.trim()) {
    lines.push('### Where we left off');
    lines.push(clip(parts.workingMemorySummary, 1200));
  }

  const project = rankBootstrapAtoms(parts.projectAtoms, atomLimit);
  if (project.length) {
    lines.push('### Project memory (most important)');
    for (const a of project) {
      lines.push(`- **${clip(a.title, 120)}**${a.category ? ` _(${a.category})_` : ''}: ${clip(a.content, 240)}`);
    }
  }

  const client = rankBootstrapAtoms(parts.clientAtoms, Math.max(2, Math.floor(atomLimit / 2)));
  if (client.length) {
    lines.push('### Client memory (most important)');
    for (const a of client) {
      lines.push(`- **${clip(a.title, 120)}**${a.category ? ` _(${a.category})_` : ''}: ${clip(a.content, 240)}`);
    }
  }

  const lessons = parts.outcomeLessons.filter(l => l.lessonsLearned && l.lessonsLearned.trim()).slice(0, 5);
  if (lessons.length) {
    lines.push('### What I learned on past work here');
    for (const l of lessons) {
      const tag = l.documentType ? `${l.capabilityKey}/${l.documentType}` : l.capabilityKey;
      lines.push(`- (${tag}, ${l.outcome}) ${clip(l.lessonsLearned!, 220)}`);
    }
  }

  if (lines.length === 0) return '';
  return ['## Session memory — picking up where we left off', ...lines].join('\n');
}
