/**
 * IntelligenceQuestion — renders one step of an AnA Intelligence flow.
 *
 * Displays structured question fields (text, select, multi-select, yes/no,
 * number, date, etc.) with validation, help text, and issue alerts. The
 * user fills in the fields and submits; the parent wires the answer back
 * through the AnA stream to advance the flow.
 */
import { useCallback, useState } from 'react';

import type {
  QuestionField,
  QuestionNode,
  DetectedIssue,
  IntelligenceQuestionEvent,
} from '../../../../../shared/types/intelligence-questions.js';

/* ─── Sub-components ─────────────────────────────────────────────────── */

function FieldLabel({ field }: { field: QuestionField }) {
  return (
    <label
      htmlFor={`iq-${field.id}`}
      className="block text-sm font-medium text-gray-200 mb-1"
    >
      {field.label}
      {field.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function HelpText({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-xs text-gray-400 mt-1">{text}</p>;
}

function TextField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  const Tag = field.type === 'textarea' ? 'textarea' : 'input';
  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <Tag
        id={`iq-${field.id}`}
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
        placeholder={field.placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        {...(Tag === 'textarea' ? { rows: 3 } : { type: 'text' })}
      />
      <HelpText text={field.helpText} />
    </div>
  );
}

function NumberField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <input
        id={`iq-${field.id}`}
        type="number"
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
        placeholder={field.placeholder}
        value={value}
        min={field.validation?.min}
        max={field.validation?.max}
        onChange={e => {
          const v = e.target.value;
          onChange(v === '' ? '' : Number(v));
        }}
      />
      <HelpText text={field.helpText} />
    </div>
  );
}

function DateField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <input
        id={`iq-${field.id}`}
        type="date"
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <HelpText text={field.helpText} />
    </div>
  );
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <select
        id={`iq-${field.id}`}
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {field.options?.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <HelpText text={field.helpText} />
    </div>
  );
}

function MultiSelectField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter(v => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <div className="flex flex-wrap gap-2 mt-1">
        {field.options?.map(opt => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
              title={opt.description}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <HelpText text={field.helpText} />
    </div>
  );
}

function YesNoField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <div className="flex gap-3 mt-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === true
              ? 'bg-green-700 border-green-600 text-white'
              : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === false
              ? 'bg-red-700 border-red-600 text-white'
              : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
          }`}
        >
          No
        </button>
      </div>
      <HelpText text={field.helpText} />
    </div>
  );
}

function RadioField({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <FieldLabel field={field} />
      <div className="space-y-2 mt-1">
        {field.options?.map(opt => (
          <label
            key={opt.value}
            className="flex items-center gap-2 cursor-pointer text-sm text-gray-200"
          >
            <input
              type="radio"
              name={`iq-${field.id}`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="text-blue-500 focus:ring-blue-500"
            />
            <span>{opt.label}</span>
            {opt.description && (
              <span className="text-xs text-gray-500">— {opt.description}</span>
            )}
          </label>
        ))}
      </div>
      <HelpText text={field.helpText} />
    </div>
  );
}

/* ─── Issue alert ────────────────────────────────────────────────────── */

function IssueAlert({ issue }: { issue: DetectedIssue }) {
  const colors = {
    critical: 'bg-red-900/50 border-red-700 text-red-200',
    warning: 'bg-yellow-900/50 border-yellow-700 text-yellow-200',
    info: 'bg-blue-900/50 border-blue-700 text-blue-200',
  };
  const icons = { critical: '⚠', warning: '⚡', info: 'ℹ' };
  return (
    <div className={`rounded-lg border px-4 py-3 mb-3 text-sm ${colors[issue.severity]}`}>
      <div className="font-semibold mb-1">
        {icons[issue.severity]} {issue.title}
      </div>
      <p>{issue.message}</p>
      {issue.reference && (
        <p className="text-xs mt-1 opacity-75">Ref: {issue.reference}</p>
      )}
    </div>
  );
}

/* ─── Progress bar ───────────────────────────────────────────────────── */

function FlowProgress({
  progress,
}: {
  progress: IntelligenceQuestionEvent['progress'];
}) {
  const pct = progress.totalNodes > 0
    ? Math.round((progress.completedNodes / progress.totalNodes) * 100)
    : 0;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span>{progress.currentSection}</span>
        <span>
          {progress.completedNodes}/{progress.totalNodes} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1 mt-2 overflow-x-auto">
        {progress.sections.map(s => {
          const done = s.completed === s.total;
          const active = s.label === progress.currentSection;
          return (
            <span
              key={s.id}
              className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap border ${
                done
                  ? 'bg-green-900/40 border-green-700 text-green-300'
                  : active
                  ? 'bg-blue-900/40 border-blue-600 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
            >
              {s.label} {done ? '✓' : `${s.completed}/${s.total}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Field renderer ─────────────────────────────────────────────────── */

function QuestionFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: QuestionField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return (
        <TextField
          field={field}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <NumberField
          field={field}
          value={value === undefined || value === null ? '' : (value as number)}
          onChange={onChange}
        />
      );
    case 'date':
      return (
        <DateField
          field={field}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'select':
    case 'country_select':
    case 'agency_select':
      return (
        <SelectField
          field={field}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'multi_select':
      return (
        <MultiSelectField
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );
    case 'yes_no':
      return (
        <YesNoField
          field={field}
          value={value === undefined || value === null ? null : (value as boolean)}
          onChange={onChange}
        />
      );
    case 'radio':
      return (
        <RadioField
          field={field}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'checkbox':
      return (
        <YesNoField
          field={field}
          value={value === undefined || value === null ? null : (value as boolean)}
          onChange={onChange}
        />
      );
    default:
      return (
        <TextField
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );
  }
}

/* ─── Main component ─────────────────────────────────────────────────── */

export interface IntelligenceQuestionProps {
  event: IntelligenceQuestionEvent;
  answers: Record<string, unknown>;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onSubmit: () => void;
  onSkip?: () => void;
  isSubmitting?: boolean;
}

export function IntelligenceQuestion({
  event,
  answers,
  onFieldChange,
  onSubmit,
  onSkip,
  isSubmitting,
}: IntelligenceQuestionProps) {
  const { node, progress, newIssues, isFirst, isLast } = event;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 my-3 max-w-2xl">
      {/* Flow header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">
          {event.flowName}
        </span>
        {isFirst && (
          <span className="text-[10px] bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700">
            Getting started
          </span>
        )}
        {isLast && (
          <span className="text-[10px] bg-green-900/50 text-green-300 px-2 py-0.5 rounded-full border border-green-700">
            Final step
          </span>
        )}
      </div>

      {/* Progress */}
      <FlowProgress progress={progress} />

      {/* Issues from previous answers */}
      {newIssues && newIssues.length > 0 && (
        <div className="mb-4">
          {newIssues.map(issue => (
            <IssueAlert key={issue.checkId} issue={issue} />
          ))}
        </div>
      )}

      {/* Question text */}
      <h3 className="text-base font-semibold text-gray-100 mb-1">
        {node.question}
      </h3>
      {node.guidance && (
        <p className="text-sm text-gray-400 mb-4">{node.guidance}</p>
      )}

      {/* Fields */}
      <div className="mt-4">
        {node.fields.map(field => (
          <QuestionFieldRenderer
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={v => onFieldChange(field.id, v)}
          />
        ))}
      </div>

      {/* Submit / Skip */}
      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-700">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting…' : isLast ? 'Complete Flow' : 'Continue'}
        </button>
        {onSkip && !isLast && (
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Flow completion card ───────────────────────────────────────────── */

export interface FlowCompleteProps {
  completion: import('../../../../../shared/types/intelligence-questions.js').IntelligenceFlowCompleteEvent;
  onAction?: (actionType: string) => void;
}

export function IntelligenceFlowComplete({
  completion,
  onAction,
}: FlowCompleteProps) {
  const criticalIssues = completion.issues.filter(i => i.severity === 'critical');
  const warnings = completion.issues.filter(i => i.severity === 'warning');

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 my-3 max-w-2xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-green-400 text-sm font-semibold">✓ Flow Complete</span>
        <span className="text-xs text-gray-400">— {completion.flowName}</span>
      </div>

      <p className="text-sm text-gray-300 mb-4">{completion.summary}</p>

      {/* Issues summary */}
      {(criticalIssues.length > 0 || warnings.length > 0) && (
        <div className="mb-4 space-y-2">
          {criticalIssues.map(issue => (
            <IssueAlert key={issue.checkId} issue={issue} />
          ))}
          {warnings.map(issue => (
            <IssueAlert key={issue.checkId} issue={issue} />
          ))}
        </div>
      )}

      {/* Suggested actions */}
      {completion.suggestedActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            Next Steps
          </p>
          <div className="flex flex-wrap gap-2">
            {completion.suggestedActions.map(action => (
              <button
                key={action.actionType}
                type="button"
                onClick={() => onAction?.(action.actionType)}
                className="px-4 py-2 rounded-lg bg-blue-900/40 border border-blue-700 text-blue-300 text-sm hover:bg-blue-800/50 transition-colors"
                title={action.description}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
