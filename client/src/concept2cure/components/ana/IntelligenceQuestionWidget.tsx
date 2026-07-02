/**
 * IntelligenceQuestionWidget — self-contained wrapper that manages local
 * answer state for an intelligence question, then calls onAnswer with
 * the flow state + answers when the user submits.
 */
import { useCallback, useState } from 'react';

import type {
  FlowState,
  IntelligenceQuestionEvent,
  IntelligenceFlowCompleteEvent,
} from '../../../../../shared/types/intelligence-questions.js';
import {
  IntelligenceQuestion,
  IntelligenceFlowComplete,
} from './IntelligenceQuestion';

export interface IntelligenceQuestionWidgetProps {
  question?: IntelligenceQuestionEvent;
  flowState?: FlowState;
  completion?: IntelligenceFlowCompleteEvent;
  onAnswer?: (flowState: FlowState, nodeId: string, answers: Record<string, unknown>) => void;
  onAction?: (actionType: string) => void;
  isStreaming?: boolean;
}

export function IntelligenceQuestionWidget({
  question,
  flowState,
  completion,
  onAnswer,
  onAction,
  isStreaming,
}: IntelligenceQuestionWidgetProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (!question) return {};
    const defaults: Record<string, unknown> = {};
    for (const field of question.node.fields) {
      if (field.defaultValue !== undefined) {
        defaults[field.id] = field.defaultValue;
      }
    }
    return defaults;
  });
  const [submitted, setSubmitted] = useState(false);

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!flowState || !question || !onAnswer) return;
    setSubmitted(true);
    onAnswer(flowState, question.node.id, answers);
  }, [flowState, question, answers, onAnswer]);

  if (completion) {
    return <IntelligenceFlowComplete completion={completion} onAction={onAction} />;
  }

  if (!question) return null;

  return (
    <IntelligenceQuestion
      event={question}
      answers={answers}
      onFieldChange={handleFieldChange}
      onSubmit={handleSubmit}
      isSubmitting={submitted || isStreaming}
    />
  );
}
