/**
 * ReadinessScoreRing — Circular progress ring for readiness scores.
 */
import React from 'react';

interface ReadinessScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  status?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ready: '#22c55e',
  on_track: '#3b82f6',
  needs_attention: '#f59e0b',
  at_risk: '#ef4444',
  in_progress: '#8b5cf6',
  not_started: '#6b7280',
};

export function ReadinessScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  status = 'not_started',
}: ReadinessScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = STATUS_COLORS[status] || STATUS_COLORS.not_started;

  return (
    <div className="relative flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-2xl font-bold" style={{ color }}>
          {score}%
        </span>
        {label && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        )}
      </div>
    </div>
  );
}
