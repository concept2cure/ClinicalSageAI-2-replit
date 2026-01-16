import React from 'react';
import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { cn } from '@/lib/utils';

/**
 * SmartTagChip - Visual Component for Regulatory Data Tags
 * 
 * Renders data points with compliance status indicators:
 * - 🟢 Verified (green) - Passed QC
 * - 🟡 Draft (amber) - Not yet validated
 * - 🔴 Stale (red) - Source data changed
 * - 🔵 Frozen (blue, locked) - Submitted/locked
 */

const SmartTagChip: React.FC<NodeViewProps> = ({ node, selected, getPos }) => {
  void getPos;
  
  const { 
    value, 
    rawValue,
    sourceId,
    dataset, 
    variable, 
    dataVersion, 
    lastVerified,
    status, 
    label,
    id 
  } = node.attrs as {
    value?: string;
    rawValue?: string | null;
    sourceId?: string | null;
    dataset?: string | null;
    variable?: string | null;
    dataVersion?: string;
    lastVerified?: string | null;
    status?: 'draft' | 'verified' | 'stale' | 'frozen';
    label?: string;
    id?: string | null;
  };

  const displayValue = value ?? '---';
  const resolvedStatus = status ?? 'draft';
  const resolvedDataset = dataset ?? 'Unknown';
  const resolvedVariable = variable ?? 'Unknown';
  
  // Build comprehensive tooltip for Chain of Custody
  const tooltipParts = [
    `Source: ${resolvedDataset}/${resolvedVariable}`,
    dataVersion && `Version: ${dataVersion}`,
    rawValue && `Raw: ${rawValue}`,
    lastVerified && `Verified: ${lastVerified}`,
    sourceId && `ID: ${sourceId}`,
  ].filter(Boolean);
  
  const title = label || tooltipParts.join(' | ');
  
  // Status-based styling
  const statusStyles = {
    draft: {
      bg: '#fef3c7',
      color: '#92400e',
      border: '#fbbf24',
    },
    verified: {
      bg: '#d1fae5',
      color: '#065f46',
      border: '#10b981',
    },
    stale: {
      bg: '#fee2e2',
      color: '#991b1b',
      border: '#ef4444',
    },
    frozen: {
      bg: '#dbeafe',
      color: '#1e40af',
      border: '#3b82f6',
    },
  };
  
  const style = statusStyles[resolvedStatus];

  return (
    <NodeViewWrapper
      as="smart-tag"
      className={cn(
        'smart-tag-chip inline-flex items-center px-[6px] py-[2px] mx-[2px] rounded text-xs font-semibold select-none transition-all duration-200',
        `status-${resolvedStatus}`,
        selected && 'ring-2 ring-blue-400 ring-offset-2',
        resolvedStatus === 'stale' && 'animate-pulse-subtle',
        resolvedStatus === 'frozen' && 'cursor-not-allowed opacity-90'
      )}
      style={{
        backgroundColor: style.bg,
        color: style.color,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: style.border,
        fontFamily: '"Courier New", monospace',
      }}
      data-smart-tag="true"
      data-id={id ?? ''}
      data-value={displayValue}
      data-raw-value={rawValue ?? ''}
      data-source-id={sourceId ?? ''}
      data-dataset={dataset ?? ''}
      data-variable={variable ?? ''}
      data-version={dataVersion ?? 'v1.0'}
      data-verified={lastVerified ?? ''}
      data-status={resolvedStatus}
      data-label={label ?? ''}
      title={title}
      contentEditable={false}
      draggable={true}
    >
      {displayValue}
      {resolvedStatus === 'frozen' && <span className="ml-1 text-[10px]">🔒</span>}
    </NodeViewWrapper>
  );
};

export default SmartTagChip;
