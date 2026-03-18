/**
 * Conversation Health Pill
 *
 * Visual indicator of conversation health state. Shows a color-coded badge
 * in the chat header with tooltip details about message count, token load,
 * and suggested recovery actions.
 */

import React, { useEffect, useState } from 'react';

type HealthState = 'healthy' | 'heavy' | 'degrading' | 'at_risk';

interface HealthReport {
  healthScore: number;
  healthState: HealthState;
  signals: {
    messageCount: number;
    estimatedTokens: number;
    averageLatencyMs: number | null;
    topicCount: number;
    unresolvedQuestions: number;
    repetitionRate: number;
  };
  warnings: string[];
  suggestedActions: string[];
}

interface ConversationHealthPillProps {
  conversationId: number;
  organizationId?: number;
  onAction?: (action: 'summarize' | 'split' | 'promote') => void;
}

const STATE_CONFIG: Record<HealthState, { color: string; bg: string; label: string }> = {
  healthy: { color: '#16a34a', bg: '#dcfce7', label: 'Healthy' },
  heavy: { color: '#ca8a04', bg: '#fef9c3', label: 'Heavy' },
  degrading: { color: '#ea580c', bg: '#ffedd5', label: 'Degrading' },
  at_risk: { color: '#dc2626', bg: '#fee2e2', label: 'At Risk' },
};

export function ConversationHealthPill({
  conversationId,
  organizationId = 1,
  onAction,
}: ConversationHealthPillProps) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    fetch(`/api/concept2cure/conversations/${conversationId}/health`, {
      headers: {
        'x-organization-id': String(organizationId),
      },
    })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setReport(json.data);
        }
      })
      .catch(() => {
        // Health check failed silently
      })
      .finally(() => setLoading(false));
  }, [conversationId, organizationId]);

  if (loading || !report) return null;

  const config = STATE_CONFIG[report.healthState];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '9999px',
          border: `1px solid ${config.color}`,
          backgroundColor: config.bg,
          color: config.color,
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          lineHeight: 1,
        }}
        title={`Conversation Health: ${config.label} (${report.healthScore}/100)`}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: config.color,
            display: 'inline-block',
          }}
        />
        {config.label}
      </button>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            width: '320px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: '16px',
            zIndex: 50,
            fontSize: '13px',
            color: '#374151',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700 }}>Context Health</span>
            <span style={{ fontWeight: 700, color: config.color }}>
              {report.healthScore}/100
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div>
              <div style={{ color: '#9ca3af', fontSize: '11px' }}>Messages</div>
              <div style={{ fontWeight: 600 }}>{report.signals.messageCount}</div>
            </div>
            <div>
              <div style={{ color: '#9ca3af', fontSize: '11px' }}>Tokens (est.)</div>
              <div style={{ fontWeight: 600 }}>{Math.round(report.signals.estimatedTokens / 1000)}k</div>
            </div>
            <div>
              <div style={{ color: '#9ca3af', fontSize: '11px' }}>Topics</div>
              <div style={{ fontWeight: 600 }}>{report.signals.topicCount}</div>
            </div>
            <div>
              <div style={{ color: '#9ca3af', fontSize: '11px' }}>Open Questions</div>
              <div style={{ fontWeight: 600 }}>{report.signals.unresolvedQuestions}</div>
            </div>
          </div>

          {report.warnings.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: '#92400e' }}>Warnings</div>
              {report.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '12px', marginBottom: '2px', paddingLeft: '8px' }}>
                  {w}
                </div>
              ))}
            </div>
          )}

          {report.suggestedActions.length > 0 && onAction && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Suggested Actions</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {report.suggestedActions.some(a => a.toLowerCase().includes('summar')) && (
                  <button
                    onClick={() => onAction('summarize')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#f9fafb',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Summarize
                  </button>
                )}
                {report.suggestedActions.some(a => a.toLowerCase().includes('split')) && (
                  <button
                    onClick={() => onAction('split')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#f9fafb',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Split Topics
                  </button>
                )}
                <button
                  onClick={() => onAction('promote')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#f9fafb',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Promote to Document
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationHealthPill;
