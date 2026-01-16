import React, { useEffect, useMemo } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { cn } from '@/lib/utils';
import { useDependencyContext } from '@/context/DependencyContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

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

const SmartDataChip: React.FC<NodeViewProps> = ({ node, selected, getPos, updateAttributes }) => {
  void getPos;
  const dependency = useDependencyContext();

  const { value, sourceLabel, confidence, id, nodeId } = node.attrs as {
    value?: string;
    sourceLabel?: string;
    confidence?: number | string;
    id?: string | null;
    nodeId?: string;
  };

  const label = value ?? '';
  const resolvedSource = sourceLabel && sourceLabel.trim().length > 0 ? sourceLabel : 'Nonclinical Report';
  const resolvedConfidence = normalizeConfidence(confidence);
  const title = `Source: ${resolvedSource} | Confidence: ${resolvedConfidence}%`;
  const subscriberId = useMemo(
    () => nodeId ?? `${id ?? 'unlinked'}-${Math.random().toString(36).slice(2, 8)}`,
    [nodeId, id],
  );

  useEffect(() => {
    dependency.registerSubscriber(id ?? 'unlinked', subscriberId, 'chip', { currentValue: label });

    return () => {
      dependency.unregisterSubscriber(id ?? 'unlinked', subscriberId);
    };
  }, [dependency, id, label, subscriberId]);

  const stale = dependency.isNodeStale(id ?? 'unlinked', subscriberId);
  const pendingChange = dependency.getPendingChange(id ?? 'unlinked', subscriberId);

  const chipClassNames = cn(
    'smart-data-chip inline-flex items-center gap-2 px-2 py-[2px] text-xs font-semibold select-none shadow-sm',
    selected && 'ring-2 ring-sky-400 ring-offset-2 ring-offset-white',
    stale
      ? 'border border-amber-400 bg-amber-50 text-amber-800'
      : 'border border-sky-200 bg-sky-50 text-sky-700',
  );

  const diffTooltip = useMemo(() => {
    if (!pendingChange) {
      return null;
    }

    return `Current: ${pendingChange.currentValue} → Proposed: ${pendingChange.nextValue}`;
  }, [pendingChange]);

  const handleAcceptChange = () => {
    if (!pendingChange) {
      return;
    }

    dependency.updateSubscriberValue(id ?? 'unlinked', subscriberId, pendingChange.nextValue);
    dependency.acknowledgeNodeUpdate(id ?? 'unlinked', subscriberId);

    updateAttributes?.({ value: pendingChange.nextValue });
  };

  return (
    <NodeViewWrapper
      as="span"
      className={chipClassNames}
      style={{ borderRadius: '12px' }}
      data-smart-data="true"
      data-drag-handle="true"
      data-source-id={id ?? ''}
      data-source-label={resolvedSource}
      data-confidence={resolvedConfidence}
      title={title}
      contentEditable={false}
      draggable={false}
    >
      {stale && pendingChange ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{label}</span>
          </TooltipTrigger>
          {diffTooltip ? (
            <TooltipContent>
              <p>{diffTooltip}</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      ) : (
        <span>{label}</span>
      )}

      {stale && pendingChange ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-5 px-1 text-[10px]"
          onClick={handleAcceptChange}
        >
          Accept
        </Button>
      ) : null}
    </NodeViewWrapper>
  );
};

export default SmartDataChip;
