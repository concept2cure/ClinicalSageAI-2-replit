/**
 * Generic in-memory Prometheus-style metrics factory.
 *
 * Every protocol-*-metrics module (and many other *-metrics modules) follows
 * the same pattern: a bag of scalar counters and labeled counters, plus
 * render / snapshot / reset helpers.  This factory eliminates the boilerplate
 * so each domain module only declares *what* it tracks, not *how*.
 *
 * @module server/services/shared/metrics-factory
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A single scalar counter (plain number). */
export interface ScalarCounterDef {
  kind: 'scalar';
  /** Prometheus metric name, e.g. `protocol_budget_items_added_total`. */
  metric: string;
  /** HELP string for the Prometheus exposition. */
  help: string;
}

/** A labeled counter (Record<string, number>). */
export interface LabeledCounterDef {
  kind: 'labeled';
  /** Prometheus metric name, e.g. `protocol_amendments_created_total`. */
  metric: string;
  /** HELP string for the Prometheus exposition. */
  help: string;
  /** Label key used in the output, e.g. `type`, `severity`, `status`. */
  labelKey: string;
}

export type CounterDef = ScalarCounterDef | LabeledCounterDef;

/** The runtime state produced by the factory for a set of counter definitions. */
export interface MetricsModule<K extends string> {
  /** Increment a scalar counter by 1. */
  inc(name: K): void;
  /** Increment a labeled counter by 1 for the given label value. */
  incLabeled(name: K, labelValue: string): void;
  /** Render all counters in Prometheus text exposition format. */
  render(): string[];
  /** Deep-copy the raw state (for tests / debugging). */
  snapshot(): Record<K, number | Record<string, number>>;
  /** Zero everything out (for tests). */
  reset(): void;
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

/**
 * Create an isolated metrics module from a list of counter definitions.
 *
 * Usage:
 * ```ts
 * const m = createMetricsModule({
 *   itemsAdded:    { kind: 'scalar',  metric: 'budget_items_total', help: '...' },
 *   byType:        { kind: 'labeled', metric: 'budget_by_type_total', help: '...', labelKey: 'type' },
 * } as const);
 * m.inc('itemsAdded');
 * m.incLabeled('byType', 'direct');
 * ```
 */
export function createMetricsModule<K extends string>(
  defs: Record<K, CounterDef>,
): MetricsModule<K> {
  // Build mutable state: scalars start at 0, labeled start as empty objects.
  const state: Record<string, number | Record<string, number>> = {};
  for (const [key, def] of Object.entries<CounterDef>(defs)) {
    state[key] = def.kind === 'scalar' ? 0 : {};
  }

  function inc(name: K): void {
    const def = defs[name];
    if (def.kind !== 'scalar') throw new Error(`inc() called on labeled counter "${String(name)}"; use incLabeled()`);
    (state[name as string] as number) += 1;
  }

  function incLabeled(name: K, labelValue: string): void {
    const def = defs[name];
    if (def.kind !== 'labeled') throw new Error(`incLabeled() called on scalar counter "${String(name)}"; use inc()`);
    const rec = state[name as string] as Record<string, number>;
    rec[labelValue] = (rec[labelValue] ?? 0) + 1;
  }

  function render(): string[] {
    const lines: string[] = [];
    for (const [key, def] of Object.entries<CounterDef>(defs)) {
      lines.push(`# HELP ${def.metric} ${def.help}`);
      lines.push(`# TYPE ${def.metric} counter`);
      if (def.kind === 'scalar') {
        lines.push(`${def.metric} ${state[key] as number}`);
      } else {
        const rec = state[key] as Record<string, number>;
        for (const [lv, n] of Object.entries(rec)) {
          lines.push(`${def.metric}{${def.labelKey}="${lv}"} ${n}`);
        }
      }
    }
    return lines;
  }

  function snapshot(): Record<K, number | Record<string, number>> {
    return JSON.parse(JSON.stringify(state));
  }

  function reset(): void {
    for (const [key, def] of Object.entries<CounterDef>(defs)) {
      state[key] = def.kind === 'scalar' ? 0 : {};
    }
  }

  return { inc, incLabeled, render, snapshot, reset };
}
