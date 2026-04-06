import React from 'react';
import { AnAAssistant } from './AnAAssistant';
import { useAnAAssistant } from '@/contexts/AnAAssistantContext';

/**
 * Container component that connects the AnAAssistant to the context
 * This serves as the global container that listens to the context
 * and renders the assistant when isOpen is true
 */
export function AnAAssistantContainer() {
 const { isOpen, closeAssistant, moduleContext } = useAnAAssistant();

 // Extract module and context from moduleContext
 const module = moduleContext?.module || 'general';
 const context = moduleContext?.context || {};

 return (
 <AnAAssistant isOpen={isOpen} onClose={closeAssistant} module={module} context={context} />
 );
}

export default AnAAssistantContainer;
