import { CheckCircle, XCircle, Download } from 'lucide-react';

export interface ValidationFinding {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  domain?: string;
}

export interface ValidationSummaryPanelProps {
  title: string;
  standard?: string;
  findings: ValidationFinding[];
  valid?: boolean;
  onExport?: () => void;
}

const SEVERITY_CONFIG: Record<
  ValidationFinding['severity'],
  { color: string; label: string; sortOrder: number }
> = {
  error: { color: '#b93a3a', label: 'Error', sortOrder: 0 },
  warning: { color: '#c87d2e', label: 'Warning', sortOrder: 1 },
  info: { color: 'var(--ai, #6a9bcc)', label: 'Info', sortOrder: 2 },
};

export function ValidationSummaryPanel({
  title,
  standard,
  findings,
  valid,
  onExport,
}: ValidationSummaryPanelProps) {
  const counts = {
    error: findings.filter((f) => f.severity === 'error').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  const sortedFindings = [...findings].sort(
    (a, b) => SEVERITY_CONFIG[a.severity].sortOrder - SEVERITY_CONFIG[b.severity].sortOrder,
  );

  const isEmpty = findings.length === 0;

  return (
    <div
      role="region"
      aria-label={`${title} validation summary`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        border: '1px solid var(--border, #dad9d4)',
        backgroundColor: 'var(--bg-000, #faf9f5)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--border, #dad9d4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-100, #141413)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h3>
          {standard && (
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'var(--bg-200, #e8e6dc)',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-300, #6b6963)',
              }}
            >
              {standard}
            </span>
          )}
          {valid !== undefined && (
            <span
              aria-label={valid ? 'Valid' : 'Invalid'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: valid ? '#788c5d' : '#b93a3a',
              }}
            >
              {valid ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {valid ? 'Valid' : 'Invalid'}
            </span>
          )}
        </div>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            aria-label="Export validation results"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border, #dad9d4)',
              backgroundColor: 'transparent',
              color: 'var(--text-300, #6b6963)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 200ms ease-out',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor =
                'var(--bg-200, #e8e6dc)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor =
                'transparent')
            }
          >
            <Download size={12} />
            Export
          </button>
        )}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '32px 16px',
            color: '#788c5d',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <CheckCircle size={16} />
          No findings — all checks passed
        </div>
      )}

      {/* Summary bar */}
      {!isEmpty && (
        <div
          style={{
            padding: '12px 16px',
            fontSize: '12px',
            color: 'var(--text-300, #6b6963)',
            fontWeight: 500,
          }}
        >
          <span style={{ color: '#b93a3a' }}>{counts.error} {counts.error === 1 ? 'error' : 'errors'}</span>
          {', '}
          <span style={{ color: '#c87d2e' }}>{counts.warning} {counts.warning === 1 ? 'warning' : 'warnings'}</span>
          {', '}
          <span style={{ color: 'var(--ai, #6a9bcc)' }}>{counts.info} info</span>
        </div>
      )}

      {/* Findings list */}
      {!isEmpty && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {sortedFindings.map((finding, index) => {
            const cfg = SEVERITY_CONFIG[finding.severity];
            return (
              <li
                key={`${finding.rule}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 16px',
                  borderTop: '1px solid var(--border, #dad9d4)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                {/* Severity dot */}
                <span
                  aria-label={cfg.label}
                  style={{
                    display: 'inline-block',
                    flexShrink: 0,
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: cfg.color,
                    marginTop: '5px',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-200, #3d3d3a)',
                        backgroundColor: 'var(--bg-200, #e8e6dc)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {finding.rule}
                    </code>
                    {finding.domain && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-300, #6b6963)',
                        }}
                      >
                        {finding.domain}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      color: 'var(--text-200, #3d3d3a)',
                      marginTop: '2px',
                    }}
                  >
                    {finding.message}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
