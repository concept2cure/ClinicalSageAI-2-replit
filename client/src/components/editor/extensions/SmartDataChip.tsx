import React from 'react';
import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { cn } from '@/lib/utils';

const normalizeConfidence = (raw: unknown): number => {
  if (raw === null || raw === undefined) {
    return 0;
  }

  const numeric = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const SmartDataChip: React.FC<NodeViewProps> = ({ node, selected, getPos }) => {
  void getPos;
  const { value, sourceLabel, confidence, id } = node.attrs as {
    value?: string;
    sourceLabel?: string;
    confidence?: number | string;
    id?: string | null;
  };

  const label = value ?? '';
  const resolvedSource = sourceLabel && sourceLabel.trim().length > 0 ? sourceLabel : 'Nonclinical Report';
  const resolvedConfidence = normalizeConfidence(confidence);
  const title = `Source: ${resolvedSource} | Confidence: ${resolvedConfidence}%`;

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        'smart-data-chip inline-flex items-center px-2 py-[2px] text-xs font-semibold select-none shadow-sm',
        selected && 'ring-2 ring-sky-400 ring-offset-2 ring-offset-white',
      )}
      style={{
        backgroundColor: '#e0f2fe',
        color: '#0284c7',
        borderRadius: '12px',
      }}
      data-smart-data="true"
      data-drag-handle="true"
      data-source-id={id ?? ''}
      data-source-label={resolvedSource}
      data-confidence={resolvedConfidence}
      title={title}
      contentEditable={false}
      draggable={false}
    >
      {label}
    </NodeViewWrapper>
  );
};

export default SmartDataChip;
