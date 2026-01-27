/**
 * Cortex Health Indicator Component
 *
 * Displays the health status of the Cortex AI service.
 * Shows connection status, latency, and service metrics.
 *
 * @module portal-v2/components/cortex/CortexHealthIndicator
 */

import React from 'react';
import {
  Activity,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCortexHealth, useCortexStats, type CortexHealth } from '../../hooks/useCortex';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CortexHealthIndicatorProps {
  /** Display variant */
  variant?: 'minimal' | 'compact' | 'detailed';
  /** Show latency information */
  showLatency?: boolean;
  /** Show stats */
  showStats?: boolean;
  /** CSS class name */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle,
    color: '#059669',
    bgColor: '#ecfdf5',
    label: 'Healthy',
  },
  degraded: {
    icon: AlertCircle,
    color: '#d97706',
    bgColor: '#fffbeb',
    label: 'Degraded',
  },
  unhealthy: {
    icon: XCircle,
    color: '#dc2626',
    bgColor: '#fef2f2',
    label: 'Unhealthy',
  },
  unknown: {
    icon: Activity,
    color: '#6b7280',
    bgColor: '#f3f4f6',
    label: 'Checking...',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function CortexHealthIndicator({
  variant = 'compact',
  showLatency = true,
  showStats = false,
  className = '',
}: CortexHealthIndicatorProps) {
  const { data: health, isLoading, error, refetch } = useCortexHealth();
  const { data: stats } = useCortexStats();

  // Determine status
  const status: keyof typeof STATUS_CONFIG = error
    ? 'unhealthy'
    : isLoading
      ? 'unknown'
      : health?.status || 'unknown';

  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  // Minimal variant (just a dot)
  if (variant === 'minimal') {
    return (
      <div className={`relative inline-flex ${className}`} title={`Cortex: ${config.label}`}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
        {isLoading && (
          <span
            className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping"
            style={{ backgroundColor: config.color, opacity: 0.4 }}
          />
        )}
      </div>
    );
  }

  // Compact variant (icon + status)
  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${className}`}
        style={{ backgroundColor: config.bgColor }}
      >
        <StatusIcon className="w-4 h-4" style={{ color: config.color }} />
        <span className="text-sm font-medium" style={{ color: config.color }}>
          {config.label}
        </span>
        {showLatency && health?.latency && (
          <span className="text-xs text-gray-500">{health.latency}ms</span>
        )}
        <button
          onClick={() => refetch()}
          className="p-0.5 hover:bg-gray-200/50 rounded transition-colors"
          aria-label="Refresh status"
        >
          <RefreshCw className={`w-3 h-3 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  // Detailed variant (full panel)
  return (
    <div
      className={`rounded-lg border overflow-hidden ${className}`}
      style={{ backgroundColor: config.bgColor, borderColor: `${config.color}40` }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: `${config.color}20` }}
      >
        <div className="flex items-center gap-2">
          <StatusIcon className="w-5 h-5" style={{ color: config.color }} />
          <span className="font-semibold" style={{ color: config.color }}>
            Cortex AI Service
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              color: config.color,
              backgroundColor: `${config.color}15`,
            }}
          >
            {config.label}
          </span>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-gray-200/50 rounded transition-colors"
            aria-label="Refresh status"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {status === 'healthy' ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm text-gray-600">Connection</span>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {status === 'healthy' ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Metrics */}
        {health && (
          <div className="grid grid-cols-2 gap-4">
            {showLatency && (
              <div className="p-3 bg-white rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Latency</div>
                <div className="text-lg font-semibold text-gray-900">
                  {health.latency || '--'}
                  <span className="text-sm font-normal text-gray-500">ms</span>
                </div>
              </div>
            )}
            {showStats && stats && (
              <>
                <div className="p-3 bg-white rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Total Atoms</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {stats.atomCount?.toLocaleString() || '--'}
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Embeddings</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {stats.embeddingCount?.toLocaleString() || '--'}
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Threads</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {stats.threadCount?.toLocaleString() || '--'}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error.message || 'Unable to connect to Cortex service'}</span>
            </div>
          </div>
        )}

        {/* Last Updated */}
        {health?.timestamp && (
          <div className="mt-4 text-xs text-gray-500 text-center">
            Last updated: {new Date(health.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}

export default CortexHealthIndicator;
