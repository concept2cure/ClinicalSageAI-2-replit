/**
 * Cortex Insight Card Component
 *
 * Displays AI-generated insights from regulatory analysis.
 * Shows predictions, recommendations, and confidence scores.
 *
 * @module portal-v2/components/cortex/CortexInsightCard
 */

import React from 'react';
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CortexInsightCardProps {
  /** Insight type */
  type: 'prediction' | 'recommendation' | 'warning' | 'success';
  /** Insight title */
  title: string;
  /** Insight description */
  description: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Source citations */
  sources?: string[];
  /** Action label */
  actionLabel?: string;
  /** Action callback */
  onAction?: () => void;
  /** Timestamp */
  timestamp?: Date;
  /** Priority level */
  priority?: 'high' | 'medium' | 'low';
  /** CSS class name */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_CONFIG = {
  prediction: {
    icon: TrendingUp,
    color: '#6366f1',
    bgColor: '#eef2ff',
    borderColor: '#c7d2fe',
    label: 'AI Prediction',
  },
  recommendation: {
    icon: Lightbulb,
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    label: 'Recommendation',
  },
  warning: {
    icon: AlertTriangle,
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    label: 'Warning',
  },
  success: {
    icon: CheckCircle,
    color: '#059669',
    bgColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    label: 'Success',
  },
};

const PRIORITY_BADGES = {
  high: { label: 'High Priority', color: '#dc2626', bgColor: '#fef2f2' },
  medium: { label: 'Medium', color: '#d97706', bgColor: '#fffbeb' },
  low: { label: 'Low', color: '#6b7280', bgColor: '#f3f4f6' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CortexInsightCard({
  type,
  title,
  description,
  confidence,
  sources,
  actionLabel,
  onAction,
  timestamp,
  priority,
  className = '',
}: CortexInsightCardProps) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;
  const priorityBadge = priority ? PRIORITY_BADGES[priority] : null;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${className}`}
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: config.borderColor }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${config.color}20` }}>
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>
          <span className="text-sm font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
          {priorityBadge && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                color: priorityBadge.color,
                backgroundColor: priorityBadge.bgColor,
              }}
            >
              {priorityBadge.label}
            </span>
          )}
        </div>
        {timestamp && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{timestamp.toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <h4 className="text-base font-semibold text-gray-900 mb-1">{title}</h4>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>

        {/* Confidence Score */}
        {typeof confidence === 'number' && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">Confidence</span>
              <span className="font-medium text-gray-700">{Math.round(confidence * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${confidence * 100}%`,
                  backgroundColor: config.color,
                }}
              />
            </div>
          </div>
        )}

        {/* Sources */}
        {sources && sources.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">Sources</div>
            <div className="flex flex-wrap gap-1">
              {sources.map((source, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-xs text-gray-600 border border-gray-200"
                >
                  <ExternalLink className="w-3 h-3" />
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      {actionLabel && onAction && (
        <div className="px-4 py-2 border-t" style={{ borderColor: config.borderColor }}>
          <button
            onClick={onAction}
            className="flex items-center gap-1 text-sm font-medium transition-colors hover:underline"
            style={{ color: config.color }}
          >
            {actionLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default CortexInsightCard;
