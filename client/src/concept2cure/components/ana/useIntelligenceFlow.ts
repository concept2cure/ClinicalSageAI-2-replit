/**
 * useIntelligenceFlow — client-side state for the AnA Intelligence
 * Questioning Engine.
 *
 * Tracks the active flow, current question, collected answers, and
 * detected issues. Wired from useAnaChat via SSE events.
 *
 * @module client/src/concept2cure/components/ana/useIntelligenceFlow
 */

import { useCallback, useState } from 'react';

import type {
  FlowState,
  IntelligenceQuestionEvent,
  IntelligenceFlowCompleteEvent,
  IntelligenceAnswerPayload,
} from '../../../../../shared/types/intelligence-questions.js';

export interface IntelligenceFlowState {
  active: boolean;
  flowState: FlowState | null;
  currentQuestion: IntelligenceQuestionEvent | null;
  completion: IntelligenceFlowCompleteEvent | null;
  pendingAnswers: Record<string, unknown>;
}

const INITIAL_STATE: IntelligenceFlowState = {
  active: false,
  flowState: null,
  currentQuestion: null,
  completion: null,
  pendingAnswers: {},
};

export function useIntelligenceFlow() {
  const [flow, setFlow] = useState<IntelligenceFlowState>(INITIAL_STATE);

  const handleQuestionEvent = useCallback(
    (question: IntelligenceQuestionEvent, flowState: FlowState) => {
      const defaults: Record<string, unknown> = {};
      for (const field of question.node.fields) {
        if (field.defaultValue !== undefined) {
          defaults[field.id] = field.defaultValue;
        }
      }
      setFlow({
        active: true,
        flowState,
        currentQuestion: question,
        completion: null,
        pendingAnswers: defaults,
      });
    },
    [],
  );

  const handleCompleteEvent = useCallback(
    (completion: IntelligenceFlowCompleteEvent, flowState: FlowState) => {
      setFlow(prev => ({
        ...prev,
        active: false,
        flowState,
        currentQuestion: null,
        completion,
        pendingAnswers: {},
      }));
    },
    [],
  );

  const setFieldValue = useCallback(
    (fieldId: string, value: unknown) => {
      setFlow(prev => ({
        ...prev,
        pendingAnswers: { ...prev.pendingAnswers, [fieldId]: value },
      }));
    },
    [],
  );

  const buildAnswerPayload = useCallback((): IntelligenceAnswerPayload | null => {
    if (!flow.flowState || !flow.currentQuestion) return null;
    return {
      flowId: flow.flowState.flowId,
      nodeId: flow.currentQuestion.node.id,
      answers: flow.pendingAnswers,
    };
  }, [flow]);

  const dismiss = useCallback(() => {
    setFlow(INITIAL_STATE);
  }, []);

  return {
    flow,
    handleQuestionEvent,
    handleCompleteEvent,
    setFieldValue,
    buildAnswerPayload,
    dismiss,
  };
}
