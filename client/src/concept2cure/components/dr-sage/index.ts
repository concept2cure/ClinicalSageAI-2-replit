/**
 * Dr. Sage — Persistent global help, guide, and copilot layer
 * Part of the Concept2Cure dual-AI system (Dr. Sage + AnA 1.0)
 */

export { DrSageButton, DrSagePanel } from './DrSagePanel';
export { default as DrSageGlobalLayer } from './DrSagePanel';
export { WorkflowEngine, WorkflowDemo, DEMO_SCENARIOS } from './WorkflowEngine';
export type { WorkflowStep, WorkflowEngineProps, WorkflowDemoProps } from './WorkflowEngine';

// Personality layer — contextual greetings, tips, status, quick actions
export {
  DrSageGreeting,
  MessageBubble,
  DrSageStatusIndicator,
  ContextualTip,
  QuickAction,
  getGreetingMessage,
  DR_SAGE_TIPS,
  DR_SAGE_FUN_FACTS,
} from './DrSagePersonality';
