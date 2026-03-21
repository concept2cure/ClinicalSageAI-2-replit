/**
 * AI Citation Components — First-Class Citation UI
 *
 * Renders AI responses with inline citations, confidence scores,
 * source attribution, and "no sources available" indicators.
 *
 * Every AI-generated text block in the platform should use these
 * components to ensure regulatory traceability.
 *
 * @version 2.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  BookOpen,
  FileText,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Info,
  ExternalLink,
} from 'lucide-react';
import { buildProvenanceLine, buildProvenancePayload } from '@/services/aiContext';

// ─── Confidence Badge ───────────────────────────────────────────────────────

function getConfidenceConfig(score) {
  const safeScore = typeof score === 'number' ? score : 0;
  if (safeScore >= 0.8) return { label: 'High', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: ShieldCheck };
  if (safeScore >= 0.5) return { label: 'Medium', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Info };
  return { label: 'Low', color: 'bg-red-100 text-red-800 border-red-200', icon: ShieldAlert };
}

export function ConfidenceBadge({ score = 0, className = '' }) {
  const config = getConfidenceConfig(score);
  const Icon = config.icon;
  const percent = Math.round((typeof score === 'number' ? score : 0) * 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${config.color} text-xs font-medium gap-1 ${className}`}>
            <Icon className="h-3 w-3" />
            {config.label} ({percent}%)
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>AI confidence score: {percent}% based on {score >= 0.5 ? 'source quality and relevance' : 'limited or no sources'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Inline Citation Tag ────────────────────────────────────────────────────

export function InlineCitation({ citation, index }) {
  if (!citation) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-4 min-w-[18px] px-1 text-[11px] font-bold
            bg-blue-100 text-blue-700 border border-blue-200 rounded-sm cursor-pointer
            hover:bg-blue-200 transition-colors align-super leading-none"
          aria-label={`Citation ${index + 1}: ${citation.title || 'Source'}`}
        >
          {index + 1}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{citation.title || 'Unknown Source'}</p>
              {citation.section && (
                <p className="text-xs text-muted-foreground mt-0.5">Section: {citation.section}</p>
              )}
              {citation.pageNumber && (
                <p className="text-xs text-muted-foreground">Page: {citation.pageNumber}</p>
              )}
            </div>
          </div>
          {citation.snippet && (
            <div className="bg-muted/50 rounded-md p-2 text-xs text-muted-foreground italic border-l-2 border-blue-300">
              &ldquo;{citation.snippet.length > 200 ? citation.snippet.substring(0, 200) + '…' : citation.snippet}&rdquo;
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Relevance: {Math.round((citation.relevanceScore || 0) * 100)}%</span>
            {citation.snippetHash && (
              <span className="font-mono text-[11px]">#{citation.snippetHash}</span>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Citation List (sidebar / footer) ───────────────────────────────────────

export function CitationList({ citations = [], className = '' }) {
  if (!citations || citations.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 ${className}`}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>No sources available — AI response based on general knowledge only</span>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        Sources ({citations.length})
      </div>
      {citations.map((citation, i) => (
        <div
          key={citation.id || `citation-${i}`}
          className="flex items-start gap-2 text-xs rounded-md bg-muted/30 px-2.5 py-1.5 border border-border/50"
        >
          <span className="inline-flex items-center justify-center h-4 min-w-[18px] px-1 text-[11px] font-bold bg-blue-100 text-blue-700 rounded-sm shrink-0 mt-0.5">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{citation.title || 'Unknown Source'}</p>
            {citation.section && (
              <p className="text-muted-foreground">&sect;{citation.section}</p>
            )}
          </div>
          <Badge variant="outline" className="text-[11px] shrink-0">
            {Math.round((citation.relevanceScore || 0) * 100)}%
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── AI Response Block ──────────────────────────────────────────────────────

/**
 * Full AI response renderer with citations, confidence, provenance marker,
 * and safe copy functionality.
 *
 * This is the primary component for displaying any AI-generated content.
 * Handles both plain text and HTML content from AI responses.
 */
export function AIResponseBlock({
  response,          // AIResponse from aiContext.js
  className = '',
  showProvenance = true,
  showCitations = true,
  onInsertToEditor,  // callback: (content, provenance) => void
}) {
  const [copied, setCopied] = useState(false);

  const handleSafeCopy = useCallback(async () => {
    if (!response?.content) return;

    const provenance = response.provenance || {};
    const provenanceLine = buildProvenanceLine(provenance);
    const provenancePayload = buildProvenancePayload(provenance);

    // Plain text with provenance footer
    const plainText = `${response.content}\n\n---\n${provenanceLine}`;

    // Rich HTML with embedded metadata
    const sanitizedPayload = JSON.stringify(provenancePayload).replace(/'/g, '&#39;');
    const richHtml = `<div data-ai-provenance='${sanitizedPayload}'>${escapeForHtml(response.content)}</div><hr><p style="font-size:10px;color:#888;">${escapeForHtml(provenanceLine)}</p>`;

    try {
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
            'text/html': new Blob([richHtml], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
    } catch {
      // Final fallback for environments without clipboard API
      try {
        await navigator.clipboard.writeText(plainText);
      } catch {
        console.warn('Clipboard API unavailable');
      }
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [response]);

  // Memoize content rendering to avoid re-computation
  const renderedContent = useMemo(() => {
    if (!response?.content) return null;
    return renderAIContent(response.content, response.citations || []);
  }, [response?.content, response?.citations]);

  if (!response) return null;

  const provenance = response.provenance || {};
  const citations = response.citations || [];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header: Model + Confidence */}
      <div className="flex items-center gap-2 flex-wrap">
        <ConfidenceBadge score={response.confidence} />
        {response.isRealAI ? (
          <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
            AI Generated
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
            Demo Mode
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {response.model || 'unknown'}
        </span>
      </div>

      {/* Content with inline citations */}
      <div className="prose prose-sm max-w-none text-foreground">
        {renderedContent}
      </div>

      {/* Citations */}
      {showCitations && (
        <CitationList citations={citations} />
      )}

      {/* Provenance & Actions */}
      {showProvenance && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground flex-1 italic">
            {buildProvenanceLine(provenance)}
          </p>
          <div className="flex gap-1 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleSafeCopy}
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy with provenance</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {onInsertToEditor && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onInsertToEditor(response.content, provenance)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Insert into editor</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Content Rendering ──────────────────────────────────────────────────────

/** Minimal HTML-entity escaping for safe embedding */
function escapeForHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Detect if content contains HTML tags */
function looksLikeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

/**
 * Renders AI content with inline citation markers.
 * Handles both plain text and HTML content.
 * Citation markers like [1], [2] are replaced with interactive InlineCitation popovers.
 */
function renderAIContent(text, citations) {
  if (!text) return null;

  // If content looks like HTML (from generate mode), render it safely
  // Split around [N] markers first, then render HTML segments
  if (looksLikeHtml(text)) {
    return renderHtmlWithCitations(text, citations);
  }

  // Plain text path
  return renderPlainTextWithCitations(text, citations);
}

/**
 * Renders plain text content with inline citation components.
 */
function renderPlainTextWithCitations(text, citations) {
  if (!citations || citations.length === 0) {
    // Render with paragraph breaks preserved
    return (
      <div>
        {text.split('\n').map((line, i) => (
          <React.Fragment key={i}>
            {line}
            {i < text.split('\n').length - 1 && <br />}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const markerPattern = /\[(\d+)\]/g;
  const hasMarkers = markerPattern.test(text);

  if (hasMarkers) {
    const parts = text.split(/(\[\d+\])/g);
    return (
      <span>
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const citationIndex = parseInt(match[1], 10) - 1;
            if (citationIndex >= 0 && citationIndex < citations.length) {
              return <InlineCitation key={`cite-${i}`} citation={citations[citationIndex]} index={citationIndex} />;
            }
            return <span key={i}>{part}</span>;
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  }

  // No markers — render text + append citation references at end
  return (
    <span>
      {text}
      {citations.length > 0 && (
        <span className="ml-1">
          {citations.map((c, i) => (
            <InlineCitation key={c.id || `appended-${i}`} citation={c} index={i} />
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Renders HTML content with inline citation components.
 * Extracts [N] markers from the HTML text, splits into segments,
 * and interleaves InlineCitation components.
 */
function renderHtmlWithCitations(html, citations) {
  if (!citations || citations.length === 0) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // Extract citation markers from the HTML
  const markerPattern = /\[(\d+)\]/g;
  const hasMarkers = markerPattern.test(html);

  if (!hasMarkers) {
    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <span className="ml-1">
          {citations.map((c, i) => (
            <InlineCitation key={c.id || `html-cite-${i}`} citation={c} index={i} />
          ))}
        </span>
      </div>
    );
  }

  // Split HTML around citation markers and interleave
  const parts = html.split(/(\[\d+\])/g);
  return (
    <div>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const citationIndex = parseInt(match[1], 10) - 1;
          if (citationIndex >= 0 && citationIndex < citations.length) {
            return <InlineCitation key={`html-cite-${i}`} citation={citations[citationIndex]} index={citationIndex} />;
          }
          return <span key={i}>{part}</span>;
        }
        // Render HTML segment
        return <span key={i} dangerouslySetInnerHTML={{ __html: part }} />;
      })}
    </div>
  );
}

export default AIResponseBlock;
