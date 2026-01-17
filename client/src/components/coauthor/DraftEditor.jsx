import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Bot,
  BookOpenCheck,
  Lightbulb,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Table,
  Link2,
  BookmarkPlus,
  FilePlus,
  FileDown,
  ClipboardList,
  PanelRightOpen,
} from 'lucide-react';

const TOOLBAR_ACTIONS = [
  { id: 'bold', label: 'Bold', icon: Bold, token: '**bold**' },
  { id: 'italic', label: 'Italic', icon: Italic, token: '*italic*' },
  { id: 'underline', label: 'Underline', icon: Underline, token: '__underline__' },
  { id: 'bullets', label: 'Bullets', icon: List, token: '\n- Item' },
  { id: 'numbered', label: 'Numbered', icon: ListOrdered, token: '\n1. Item' },
  { id: 'quote', label: 'Quote', icon: Quote, token: '\n> Quote' },
  { id: 'table', label: 'Table', icon: Table, token: '\n| Column | Column |\n| --- | --- |\n| Data | Data |' },
  { id: 'link', label: 'Link', icon: Link2, token: '[link text](url)' },
];

const REFERENCE_LIBRARY = [
  { id: 'REF-001', label: 'ICH E6(R3) Good Clinical Practice', type: 'Guidance' },
  { id: 'REF-014', label: 'FDA eCTD Technical Conformance Guide', type: 'Regulatory' },
  { id: 'REF-032', label: 'EMA Clinical Overview Guidance', type: 'Regional' },
];

const COMPLIANCE_CHECKLIST = [
  'States study objectives and endpoints',
  'Includes benefit-risk summary with citations',
  'Cross-references Module 5 clinical reports',
  'Mentions safety signals and mitigation plans',
];

export default function DraftEditor({ content = '', onChange }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [showInsights, setShowInsights] = useState(true);
  const textareaRef = useRef(null);

  const metrics = useMemo(() => {
    const words = content.trim().length ? content.trim().split(/\s+/).length : 0;
    const lines = content ? content.split(/\n/).length : 0;
    const citations = (content.match(/\[REF-[0-9]+\]/g) || []).length;
    return { words, lines, citations };
  }, [content]);

  const outline = useMemo(() => {
    const headings = content
      .split(/\n/)
      .map(line => line.trim())
      .filter(line => /^\d+(\.\d+)*\s+|^##\s+|^[A-Z][^:]+:/.test(line));

    if (headings.length > 0) {
      return headings.slice(0, 6);
    }

    return ['2.7 Clinical Summary', '2.7.1 Overview', '2.7.2 Efficacy', '2.7.3 Safety'];
  }, [content]);

  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            setIsGenerating(false);
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 300);

      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (content?.length > 20) {
      setSuggestions([
        {
          type: 'regulation',
          text: 'Consider adding specific reference to ICH E6(R2) guidelines for clinical study design.',
        },
        {
          type: 'clarity',
          text: 'The introduction could be more specific about the study objectives.',
        },
        {
          type: 'completeness',
          text: 'This section should include a brief summary of the safety findings.',
        },
      ]);
    } else {
      setSuggestions([]);
    }
  }, [content]);

  const handleGenerateContent = () => {
    setIsGenerating(true);
    setProgress(0);
    setTimeout(() => {
      const sampleText =
        '2.7 Clinical Summary\n\nThis section presents a comprehensive summary of the clinical studies conducted to evaluate the safety and efficacy of [PRODUCT NAME] for the treatment of [INDICATION]. Multiple randomized, double-blind, placebo-controlled studies were conducted across different geographical regions, demonstrating consistent efficacy results. The clinical development program included Phase 1 studies to establish pharmacokinetics and initial safety, Phase 2 dose-finding studies, and pivotal Phase 3 studies. Overall, the data supports a favorable benefit-risk profile for the proposed indication.\n\n2.7.2 Efficacy\nThe pivotal studies demonstrated a statistically significant improvement in the primary endpoint. [REF-014]\n\n2.7.3 Safety\nSafety data indicate a manageable adverse event profile with no unexpected risks. [REF-001]';
      onChange(sampleText);
    }, 3000);
  };

  const handleInsertSuggestion = suggestion => {
    onChange(`${content}\n\n${suggestion.text}`);
  };

  const insertTokenAtCursor = token => {
    if (!textareaRef.current) {
      onChange(`${content}${token}`);
      return;
    }

    const start = textareaRef.current.selectionStart ?? content.length;
    const end = textareaRef.current.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${token}${content.slice(end)}`;
    onChange(next);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const cursor = start + token.length;
        textareaRef.current.selectionStart = cursor;
        textareaRef.current.selectionEnd = cursor;
        textareaRef.current.focus();
      }
    });
  };

  const handleInsertReference = ref => {
    insertTokenAtCursor(` [${ref.id}]`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" disabled={isGenerating} onClick={handleGenerateContent}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Content
          </Button>

          <Button size="sm" variant="ghost" disabled={isGenerating || !content}>
            <BookOpenCheck className="h-4 w-4 mr-2" />
            Check Compliance
          </Button>

          <Button size="sm" variant="ghost" onClick={() => setShowInsights(prev => !prev)}>
            <PanelRightOpen className="h-4 w-4 mr-2" />
            {showInsights ? 'Hide Insights' : 'Show Insights'}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{metrics.words.toLocaleString()} words</span>
          <span>•</span>
          <span>{metrics.lines} lines</span>
          <span>•</span>
          <span>{metrics.citations} citations</span>
          {isGenerating ? (
            <span className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> {progress}%
            </span>
          ) : content ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        {TOOLBAR_ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <Button
              key={action.id}
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => insertTokenAtCursor(action.token)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 px-2">
            <FilePlus className="h-4 w-4 mr-1" /> New Section
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2">
            <FileDown className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {isGenerating && <Progress value={progress} className="h-1" />}

      <div className={`grid gap-6 ${showInsights ? 'lg:grid-cols-[2fr_1fr]' : 'grid-cols-1'}`}>
        <div className="rounded-xl border bg-slate-50/60 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Section Authoring Canvas
            </span>
            <span>Autosave enabled</span>
          </div>
          <Textarea
            ref={textareaRef}
            placeholder="Start writing or generate content using AI..."
            className="min-h-[420px] resize-y bg-white font-serif text-base leading-7 shadow-inner"
            value={content}
            onChange={e => onChange(e.target.value)}
            disabled={isGenerating}
            data-section-id="current-section"
          />
        </div>

        {showInsights && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Section Outline</h3>
                  <p className="text-xs text-muted-foreground">Jump between headings</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2">
                  <BookmarkPlus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {outline.map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-semibold">Reference Manager</h3>
              <p className="text-xs text-muted-foreground">Insert regulatory citations quickly</p>
              <div className="mt-3 space-y-2">
                {REFERENCE_LIBRARY.map(ref => (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => handleInsertReference(ref)}
                    className="flex w-full items-center justify-between rounded-lg border border-muted/60 px-3 py-2 text-left text-sm hover:border-blue-200"
                  >
                    <div>
                      <p className="font-medium">{ref.label}</p>
                      <p className="text-xs text-muted-foreground">{ref.type}</p>
                    </div>
                    <Badge variant="outline">{ref.id}</Badge>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-semibold">Compliance Checklist</h3>
              <p className="text-xs text-muted-foreground">Module 2 summary requirements</p>
              <div className="mt-3 space-y-2 text-sm">
                {COMPLIANCE_CHECKLIST.map(item => (
                  <label key={item} className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="flex items-center mb-3">
            <Lightbulb className="h-4 w-4 mr-2 text-amber-500" />
            <h3 className="font-medium text-sm">AI Suggestions</h3>
          </div>

          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="flex items-start space-x-2">
                <Badge variant="outline" className="mt-0.5">
                  {suggestion.type === 'regulation'
                    ? 'Regulation'
                    : suggestion.type === 'clarity'
                      ? 'Clarity'
                      : 'Completeness'}
                </Badge>
                <div className="flex-1 text-sm">{suggestion.text}</div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => handleInsertSuggestion(suggestion)}
                >
                  Insert
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="flex items-center">
          <Bot className="h-4 w-4 mr-2" />
          Ask AI for help
        </Button>
      </div>
    </div>
  );
}
