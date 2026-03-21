/**
 * Register all Phase 2 inline AI action handlers.
 * Side-effect import — registers handlers on load.
 */

import { registerActionHandler } from '../action-registry';
import { inlineAIHandlers } from './inline-ai';

for (const handler of inlineAIHandlers) {
  registerActionHandler(handler);
}
