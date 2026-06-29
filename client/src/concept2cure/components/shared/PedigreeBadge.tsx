import { Shield, Database, Brain, Globe, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type Pedigree =
  | 'deterministic_registry'
  | 'deterministic_query'
  | 'rim_learned'
  | 'external_api_live'
  | 'model_assisted';

export interface PedigreeBadgeProps {
  pedigree: Pedigree;
  toolName?: string;
}

const PEDIGREE_CONFIG: Record<
  Pedigree,
  { color: string; bg: string; icon: ReactNode; label: string; guidance: string }
> = {
  deterministic_registry: {
    color: '#788c5d',
    bg: 'rgba(120, 140, 93, 0.12)',
    icon: <Shield size={12} />,
    label: 'Verified registry',
    guidance: 'Result sourced from a curated, deterministic registry lookup.',
  },
  deterministic_query: {
    color: '#788c5d',
    bg: 'rgba(120, 140, 93, 0.12)',
    icon: <Database size={12} />,
    label: 'Verified query',
    guidance: 'Result sourced from a deterministic database query.',
  },
  rim_learned: {
    color: '#6a9bcc',
    bg: 'rgba(106, 155, 204, 0.12)',
    icon: <Brain size={12} />,
    label: 'Learned pattern',
    guidance: 'Result derived from a regulatory intelligence model.',
  },
  external_api_live: {
    color: '#c87d2e',
    bg: 'rgba(200, 125, 46, 0.12)',
    icon: <Globe size={12} />,
    label: 'Live API',
    guidance: 'Result fetched from a live external API at query time.',
  },
  model_assisted: {
    color: '#6b6963',
    bg: 'rgba(107, 105, 99, 0.10)',
    icon: <Sparkles size={12} />,
    label: 'Model-assisted',
    guidance: 'Result generated or augmented by a language model.',
  },
};

export function PedigreeBadge({ pedigree, toolName }: PedigreeBadgeProps) {
  const config = PEDIGREE_CONFIG[pedigree];
  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipText = toolName
    ? `${toolName} — ${config.guidance}`
    : config.guidance;

  return (
    <span
      role="status"
      aria-label={`Pedigree: ${config.label}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '9999px',
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        lineHeight: '20px',
        height: '20px',
        cursor: 'default',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
        {config.icon}
      </span>
      {config.label}
      {showTooltip && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-inverse, #262624)',
            color: 'var(--text-000, #ffffff)',
            fontSize: '11px',
            fontWeight: 400,
            lineHeight: '1.4',
            maxWidth: '240px',
            whiteSpace: 'normal',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {tooltipText}
        </span>
      )}
    </span>
  );
}
