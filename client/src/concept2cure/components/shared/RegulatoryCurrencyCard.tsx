import { RefreshCw } from 'lucide-react';

export interface GuidanceFreshness {
  guidanceId: string;
  title: string;
  status: 'current' | 'stale' | 'void' | 'unknown';
  citedDate?: string;
  effectiveDate?: string;
  message?: string;
}

export interface RegulatoryCurrencyCardProps {
  items: GuidanceFreshness[];
  lastChecked?: string;
  onRefresh?: () => void;
}

const STATUS_CONFIG: Record<
  GuidanceFreshness['status'],
  { color: string; label: string }
> = {
  current: { color: '#788c5d', label: 'Current' },
  stale: { color: '#c87d2e', label: 'Stale' },
  void: { color: '#b93a3a', label: 'Void' },
  unknown: { color: 'var(--text-300, #6b6963)', label: 'Unknown' },
};

export function RegulatoryCurrencyCard({
  items,
  lastChecked,
  onRefresh,
}: RegulatoryCurrencyCardProps) {
  const counts = {
    current: items.filter((i) => i.status === 'current').length,
    stale: items.filter((i) => i.status === 'stale').length,
    void: items.filter((i) => i.status === 'void').length,
  };

  return (
    <div
      role="region"
      aria-label="Regulatory currency"
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
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-100, #141413)',
            letterSpacing: '-0.01em',
          }}
        >
          Regulatory currency
        </h3>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh regulatory currency"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '1px solid var(--border, #dad9d4)',
              backgroundColor: 'transparent',
              color: 'var(--text-300, #6b6963)',
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
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* Summary */}
      <div
        style={{
          padding: '12px 16px',
          fontSize: '12px',
          color: 'var(--text-300, #6b6963)',
          fontWeight: 500,
        }}
      >
        <span style={{ color: '#788c5d' }}>{counts.current} current</span>
        {', '}
        <span style={{ color: '#c87d2e' }}>{counts.stale} stale</span>
        {', '}
        <span style={{ color: '#b93a3a' }}>{counts.void} void</span>
      </div>

      {/* Items list */}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {items.map((item) => {
          const cfg = STATUS_CONFIG[item.status];
          return (
            <li
              key={item.guidanceId}
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
              {/* Status dot */}
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
                <div
                  style={{
                    color: 'var(--text-100, #141413)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-300, #6b6963)',
                    marginTop: '2px',
                  }}
                >
                  {cfg.label}
                  {item.citedDate && ` · Cited ${item.citedDate}`}
                  {item.effectiveDate && ` · Effective ${item.effectiveDate}`}
                </div>
                {item.message && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-300, #6b6963)',
                      marginTop: '2px',
                      fontStyle: 'italic',
                    }}
                  >
                    {item.message}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      {lastChecked && (
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border, #dad9d4)',
            fontSize: '11px',
            color: 'var(--text-300, #6b6963)',
          }}
        >
          Last checked: {lastChecked}
        </div>
      )}
    </div>
  );
}
