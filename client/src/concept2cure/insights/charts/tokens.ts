/**
 * Single source of truth for governed-chart colors and motion.
 *
 * Every chart in this directory pulls its colors from here so that no chart
 * can introduce a raw, saturated, or off-system hue. The palette mirrors the
 * design-system tokens documented in README ("Visual foundations" / "Color"):
 * warm cream canvas, terracotta accent (used sparingly), AI blue, and earthy
 * status colors. Neon / fully-saturated colors are deliberately absent.
 */

/**
 * Semantic color roles for charts. Keys are roles, values are hex constants.
 */
export const CHART_PALETTE = {
  /** Warm cream page canvas. Charts sit on this; never pure white as a fill. */
  canvas: '#faf9f5',
  /** Elevated surface (cards, the inner plot area when one is needed). */
  surface: '#ffffff',
  /** Almost-invisible hairline borders / axes. */
  hairline: '#f4f3ee',
  /** Primary ink for labels and strong marks. */
  ink: '#1f1d1a',
  /** Secondary, muted ink for axis ticks and captions. */
  inkMuted: '#6b6760',
  /** Terracotta accent. Used sparingly for the single most important mark. */
  accent: '#d97757',
  /** Muted AI blue. Reserved for AI-derived series (e.g. forecast). */
  aiBlue: '#6a9bcc',
  /** Earthy olive success. */
  success: '#788c5d',
  /** Warm amber warning. */
  warning: '#d97706',
  /** Muted red error / risk. */
  error: '#dc3545',
} as const;

/**
 * Ordered neutral steps for non-semantic categorical series (e.g. "draft").
 * Earthy stones, never gray-blue or neon.
 */
export const CHART_NEUTRAL_STEPS = [
  '#b8b2a7',
  '#cfc9bd',
  '#e2ddd2',
  '#efebe2',
] as const;

/**
 * Maps the program-bar tone vocabulary to palette roles.
 */
export const CHART_TONE: Record<'ok' | 'warn' | 'risk', string> = {
  ok: CHART_PALETTE.success,
  warn: CHART_PALETTE.warning,
  risk: CHART_PALETTE.error,
};

/**
 * Calm-motion contract for charts: 200ms ease-out, no spring / bounce.
 * Per README "Animation & motion".
 */
export const CHART_MOTION = { durationMs: 200, easing: 'ease-out' } as const;

export type ChartPaletteRole = keyof typeof CHART_PALETTE;
