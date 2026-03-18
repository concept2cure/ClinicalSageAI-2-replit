/**
 * ClaudeStreamingDraft — Real-time document drafting with Claude streaming
 *
 * Displays streamed content as it's generated, with optional thinking
 * visualization and tool-use indicators.
 */

import React, { useState } from 'react';
import { useClaudeStream } from '../../hooks/useClaudeStream';
import {
  FileText,
  Brain,
  Loader2,
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Wrench,
  Copy,
  Check,
} from 'lucide-react';

interface ClaudeStreamingDraftProps {
  /** Default regulatory framework */
  defaultFramework?: string;
  /** Default section type */
  defaultSectionType?: string;
  /** Project context */
  projectContext?: {
    deviceName?: string;
    deviceType?: string;
    indication?: string;
    predicateDevice?: string;
    classification?: string;
  };
  /** Callback when draft is complete */
  onDraftComplete?: (content: string, metadata: any) => void;
  /** Custom className */
  className?: string;
}

const FRAMEWORKS = [
  { value: 'fda_510k', label: 'FDA 510(k)' },
  { value: 'fda_pma', label: 'FDA PMA' },
  { value: 'eu_mdr', label: 'EU MDR' },
  { value: 'ich_clinical', label: 'ICH Clinical' },
  { value: 'cer_clinical_evaluation', label: 'CER (Clinical Evaluation)' },
  { value: 'general_regulatory', label: 'General Regulatory' },
];

export function ClaudeStreamingDraft({
  defaultFramework = 'fda_510k',
  defaultSectionType = '',
  projectContext,
  onDraftComplete,
  className = '',
}: ClaudeStreamingDraftProps) {
  const [framework, setFramework] = useState(defaultFramework);
  const [sectionType, setSectionType] = useState(defaultSectionType);
  const [instructions, setInstructions] = useState('');
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableTools, setEnableTools] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    streamingContent,
    thinking,
    isStreaming,
    error,
    metadata,
    startStream,
    abort,
    reset,
  } = useClaudeStream();

  const handleStart = () => {
    if (!sectionType || !instructions) return;

    startStream('/api/claude/draft/stream', {
      framework,
      sectionType,
      instructions,
      projectContext,
      enableThinking,
      enableTools,
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(streamingContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Notify parent when stream completes
  React.useEffect(() => {
    if (!isStreaming && streamingContent && metadata && onDraftComplete) {
      onDraftComplete(streamingContent, metadata);
    }
  }, [isStreaming, streamingContent, metadata, onDraftComplete]);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Framework</label>
          <select
            value={framework}
            onChange={e => setFramework(e.target.value)}
            disabled={isStreaming}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            {FRAMEWORKS.map(f => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-gray-500">Section Type</label>
          <input
            type="text"
            value={sectionType}
            onChange={e => setSectionType(e.target.value)}
            placeholder="e.g., Device Description, Intended Use, Clinical Evidence"
            disabled={isStreaming}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={enableThinking}
              onChange={e => setEnableThinking(e.target.checked)}
              disabled={isStreaming}
            />
            <Brain className="w-3 h-3" /> Thinking
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={enableTools}
              onChange={e => setEnableTools(e.target.checked)}
              disabled={isStreaming}
            />
            <Wrench className="w-3 h-3" /> Tools
          </label>
        </div>
      </div>

      {/* Instructions input */}
      <div className="flex gap-2">
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Describe what you want to draft... e.g., 'Draft a device description for a Class II cardiovascular monitoring device with Bluetooth connectivity'"
          disabled={isStreaming}
          rows={3}
          className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none"
        />
        <div className="flex flex-col gap-2">
          {isStreaming ? (
            <button
              onClick={abort}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2 text-sm"
            >
              <Square className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!sectionType || !instructions}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              <Send className="w-4 h-4" /> Draft
            </button>
          )}
          {streamingContent && (
            <button
              onClick={reset}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Thinking panel */}
      {thinking && (
        <div className="border border-purple-200 rounded-lg bg-purple-50">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-purple-700 font-medium"
          >
            {showThinking ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <Brain className="w-4 h-4" />
            Extended Thinking
            {isStreaming && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
          </button>
          {showThinking && (
            <div className="px-4 pb-3 text-sm text-purple-800 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {thinking}
            </div>
          )}
        </div>
      )}

      {/* Streaming content */}
      {(streamingContent || isStreaming) && (
        <div className="border rounded-lg bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="w-4 h-4" />
              <span>Generated Content</span>
              {isStreaming && (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              )}
            </div>
            {streamingContent && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          <div className="p-4 text-sm whitespace-pre-wrap max-h-[600px] overflow-y-auto prose prose-sm max-w-none">
            {streamingContent || (
              <span className="text-gray-400">Generating...</span>
            )}
            {isStreaming && (
              <span className="inline-block w-1 h-4 bg-blue-500 animate-pulse ml-0.5" />
            )}
          </div>
        </div>
      )}

      {/* Metadata */}
      {metadata && !isStreaming && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 px-1">
          <span>Model: {metadata.model}</span>
          {metadata.usage && (
            <span>
              Tokens: {metadata.usage.inputTokens?.toLocaleString()} in /{' '}
              {metadata.usage.outputTokens?.toLocaleString()} out
            </span>
          )}
          {metadata.latencyMs && <span>{(metadata.latencyMs / 1000).toFixed(1)}s</span>}
          {metadata.cacheHit && <span className="text-green-600">Cache hit</span>}
          {metadata.toolsUsed && metadata.toolsUsed.length > 0 && (
            <span>
              Tools: {metadata.toolsUsed.join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ClaudeStreamingDraft;
