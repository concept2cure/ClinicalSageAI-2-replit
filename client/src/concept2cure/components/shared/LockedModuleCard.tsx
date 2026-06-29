import { type ReactNode } from 'react';

export interface LockedModuleCardProps {
  moduleId: string;
  title: string;
  description: string;
  icon?: ReactNode;
  requiredTier?: string;
  onRequestUpgrade?: (moduleId: string) => void;
}

export function LockedModuleCard({
  moduleId,
  title,
  description,
  icon,
  requiredTier = 'Enterprise',
  onRequestUpgrade,
}: LockedModuleCardProps) {
  return (
    <div
      role="region"
      aria-label={`${title} — locked module`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '48px 32px',
        borderRadius: '12px',
        border: '1px solid #e5e2dc',
        backgroundColor: '#faf9f5',
        textAlign: 'center',
        opacity: 0.85,
      }}
    >
      {icon && (
        <div style={{ opacity: 0.5 }} aria-hidden="true">
          {icon}
        </div>
      )}
      <h3
        style={{
          margin: 0,
          fontSize: '18px',
          fontWeight: 600,
          color: '#2c2c2c',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          lineHeight: '1.5',
          color: '#6b6b6b',
          maxWidth: '360px',
        }}
      >
        {description}
      </p>
      <span
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: '9999px',
          backgroundColor: '#f0ede6',
          fontSize: '12px',
          fontWeight: 500,
          color: '#8a8578',
          letterSpacing: '0.02em',
        }}
      >
        {requiredTier} tier
      </span>
      {onRequestUpgrade && (
        <button
          type="button"
          onClick={() => onRequestUpgrade(moduleId)}
          aria-label={`Request upgrade for ${title}`}
          style={{
            marginTop: '8px',
            padding: '10px 24px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#d97757',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 200ms ease-out',
          }}
          onMouseEnter={e =>
            ((e.target as HTMLElement).style.backgroundColor = '#c4684c')
          }
          onMouseLeave={e =>
            ((e.target as HTMLElement).style.backgroundColor = '#d97757')
          }
        >
          Request access
        </button>
      )}
    </div>
  );
}
