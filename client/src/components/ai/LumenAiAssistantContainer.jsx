import React from 'react';
import { LumenAiAssistant } from './LumenAiAssistant';
import { useLumenAiAssistant } from '@/contexts/LumenAiAssistantContext';

/**
 * Container component that connects the LumenAiAssistant to the context
 * This serves as the global container that listens to the context
 * and renders the assistant when isOpen is true
 */
export function LumenAiAssistantContainer() {
  const { isOpen, closeAssistant, moduleContext } = useLumenAiAssistant();

  // Extract module and context from moduleContext
  const module = moduleContext?.module || 'general';
  const context = moduleContext?.context || {};

  return (
    <LumenAiAssistant isOpen={isOpen} onClose={closeAssistant} module={module} context={context} />
  );
}

export default LumenAiAssistantContainer;
