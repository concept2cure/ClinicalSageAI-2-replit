/**
 * Phase 6.6.D — Predicate Radar Scatter Plot
 *
 * SVG-based scatter plot:
 *   x-axis: Similarity Score (0 → 1, higher = more similar)
 *   y-axis: Toxicity Score (0 → 1, lower = safer)
 *   Sweet spot: top-left quadrant (high similarity, low toxicity)
 *   Click-to-select flows a predicate into the rest of the workflow.
 *
 * @phase 6.6.D
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PredicateCandidate } from '../../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const PLOT_W = 600;
const PLOT_H = 400;
const PAD = { top: 30, right: 30, bottom: 50, left: 60 };
const INNER_W = PLOT_W - PAD.left - PAD.right;
const INNER_H = PLOT_H - PAD.top - PAD.bottom;

const SWEET_SPOT = {
  simMin: 0.6,
  toxMax: 0.15,
};

const TOXICITY_COLORS = {
  safe: '#22c55e', // green-500
  caution: '#eab308', // yellow-500
  danger: '#ef4444', // red-500
  recommended: '#3b82f6', // blue-500
};

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function dotColor(tox: number, recommended: boolean): string {
  if (recommended) return TOXICITY_COLORS.recommended;
  if (tox <= 0.15) return TOXICITY_COLORS.safe;
  if (tox <= 0.35) return TOXICITY_COLORS.caution;
  return TOXICITY_COLORS.danger;
}

function xScale(similarity: number): number {
  return PAD.left + similarity * INNER_W;
}

function yScale(toxicity: number): number {
  // Invert: low toxicity = higher on chart = "better"
  return PAD.top + toxicity * INNER_H;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

interface PredicateRadarPlotProps {
  candidates: PredicateCandidate[];
  selectedCandidate?: PredicateCandidate | null;
  onSelectCandidate?: (c: PredicateCandidate) => void;
}

export function PredicateRadarPlot({
  candidates,
  selectedCandidate,
  onSelectCandidate,
}: PredicateRadarPlotProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Clamp values to [0, 1]
  const points = useMemo(
    () =>
      candidates.map(c => ({
        candidate: c,
        x: xScale(Math.min(1, Math.max(0, c.similarity_score ?? 0))),
        y: yScale(Math.min(1, Math.max(0, c.toxicity_score ?? 0))),
        color: dotColor(c.toxicity_score ?? 0, c.recommended ?? false),
        isSelected: selectedCandidate?.id === c.id,
        isHovered: hoveredId === c.id,
      })),
    [candidates, selectedCandidate, hoveredId]
  );

  // Sweet spot rectangle
  const sweetX = xScale(SWEET_SPOT.simMin);
  const sweetY = yScale(0); // top of chart
  const sweetW = xScale(1) - sweetX;
  const sweetH = yScale(SWEET_SPOT.toxMax) - sweetY;

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p className="text-sm">
            No candidates to plot. Run the Strategy Engine to find predicates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Predicate Radar — Similarity vs. Toxicity</CardTitle>
        <CardDescription>
          Click a dot to select a predicate. The
          <Badge
            variant="outline"
            className="mx-1 text-[11px] bg-green-50 text-green-700 border-green-200"
          >
            sweet spot
          </Badge>
          is high similarity + low toxicity.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <TooltipProvider>
          <svg
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
            className="w-full max-w-[620px] mx-auto"
            style={{ minWidth: 360 }}
          >
            {/* Sweet spot quadrant */}
            <rect
              x={sweetX}
              y={sweetY}
              width={sweetW}
              height={sweetH}
              fill="#22c55e"
              fillOpacity={0.06}
              stroke="#22c55e"
              strokeOpacity={0.25}
              strokeWidth={1}
              strokeDasharray="4 3"
              rx={4}
            />
            <text
              x={sweetX + sweetW / 2}
              y={sweetY + sweetH / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fill="#22c55e"
              opacity={0.5}
              fontWeight={600}
            >
              SWEET SPOT
            </text>

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <g key={`grid-${v}`}>
                {/* Horizontal */}
                <line
                  x1={PAD.left}
                  y1={yScale(v)}
                  x2={PLOT_W - PAD.right}
                  y2={yScale(v)}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
                {/* Vertical */}
                <line
                  x1={xScale(v)}
                  y1={PAD.top}
                  x2={xScale(v)}
                  y2={PLOT_H - PAD.bottom}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
              </g>
            ))}

            {/* Axes */}
            <line
              x1={PAD.left}
              y1={PLOT_H - PAD.bottom}
              x2={PLOT_W - PAD.right}
              y2={PLOT_H - PAD.bottom}
              stroke="#9ca3af"
              strokeWidth={1}
            />
            <line
              x1={PAD.left}
              y1={PAD.top}
              x2={PAD.left}
              y2={PLOT_H - PAD.bottom}
              stroke="#9ca3af"
              strokeWidth={1}
            />

            {/* X-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <text
                key={`xl-${v}`}
                x={xScale(v)}
                y={PLOT_H - PAD.bottom + 18}
                textAnchor="middle"
                fontSize={10}
                fill="#6b7280"
              >
                {v.toFixed(2)}
              </text>
            ))}
            <text
              x={PAD.left + INNER_W / 2}
              y={PLOT_H - 8}
              textAnchor="middle"
              fontSize={11}
              fill="#374151"
              fontWeight={600}
            >
              Similarity Score →
            </text>

            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <text
                key={`yl-${v}`}
                x={PAD.left - 8}
                y={yScale(v) + 3}
                textAnchor="end"
                fontSize={10}
                fill="#6b7280"
              >
                {v.toFixed(2)}
              </text>
            ))}
            <text
              x={12}
              y={PAD.top + INNER_H / 2}
              textAnchor="middle"
              fontSize={11}
              fill="#374151"
              fontWeight={600}
              transform={`rotate(-90, 12, ${PAD.top + INNER_H / 2})`}
            >
              ↓ Toxicity Score
            </text>

            {/* Dots */}
            {points.map(pt => (
              <Tooltip key={pt.candidate.id}>
                <TooltipTrigger asChild>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={pt.isSelected ? 8 : pt.isHovered ? 7 : 5}
                    fill={pt.color}
                    fillOpacity={pt.isSelected ? 1 : 0.8}
                    stroke={pt.isSelected ? '#000' : pt.isHovered ? '#6b7280' : 'none'}
                    strokeWidth={pt.isSelected ? 2 : 1}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredId(pt.candidate.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelectCandidate?.(pt.candidate)}
                  />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  <div className="space-y-1">
                    <p className="font-mono text-sm font-semibold">{pt.candidate.k_number}</p>
                    <p className="text-xs">{pt.candidate.device_name}</p>
                    <div className="flex gap-2 text-xs">
                      <span>Sim: {(pt.candidate.similarity_score ?? 0).toFixed(3)}</span>
                      <span>Tox: {(pt.candidate.toxicity_score ?? 0).toFixed(3)}</span>
                    </div>
                    {pt.candidate.recommended && (
                      <Badge variant="default" className="text-[11px]">
                        Recommended
                      </Badge>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}

            {/* Selected dot label */}
            {points
              .filter(p => p.isSelected)
              .map(pt => (
                <text
                  key={`label-${pt.candidate.id}`}
                  x={pt.x + 10}
                  y={pt.y - 6}
                  fontSize={9}
                  fill="#1f2937"
                  fontWeight={600}
                  className="pointer-events-none"
                >
                  {pt.candidate.k_number}
                </text>
              ))}
          </svg>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 justify-center text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-green-500" /> Safe (≤0.15)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-yellow-500" /> Caution (0.15–0.35)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-red-500" /> Danger (&gt;0.35)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-blue-500" /> Recommended
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
