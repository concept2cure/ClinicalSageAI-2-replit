/**
 * AnA self-navigation tools — give AnA the ability to move the user/itself to
 * any screen in the app, governed by the shared navigation contract
 * (shared/navigation), which is the single source of truth for valid targets.
 *
 *   list_app_screens -> enumerate every navigable destination (id, scope, params)
 *       so AnA can discover where it can go before navigating.
 *   navigate_to      -> validate a target + params and produce a NavigationDirective
 *       in the exact shape the chat client applies. Refuses unknown targets /
 *       invalid params rather than emitting a broken jump.
 *
 * The directive is surfaced to the client through the streamed action channel
 * (the chat client already turns an action `path` into a real navigation). The
 * live stream hookup is the one remaining wiring step (see
 * shared/navigation/README.md); these tools + the contract are UI-agnostic and
 * complete today.
 *
 * Definitions only — handlers live in AnaToolExecutor.ts (registerToolHandler).
 *
 * @module server/services/ana/navigationTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const LIST_APP_SCREENS: AnaTool = {
  name: 'list_app_screens',
  description:
    "List every screen/surface AnA can navigate to, from the governed navigation registry: each target's id, label, description, scope ('global' or 'project' — project targets need an active project), group, and any accepted params (e.g. an intelligence sub-tab). Call this to discover valid destinations before using navigate_to. Optionally filter by group or scope. Use the returned ids verbatim with navigate_to.",
  input_schema: {
    type: 'object',
    properties: {
      group: { type: 'string', description: 'Optional group filter (e.g. "global", "project", "module").' },
      scope: { type: 'string', enum: ['global', 'project'], description: 'Optional scope filter.' },
    },
    required: [],
  },
};

export const NAVIGATE_TO: AnaTool = {
  name: 'navigate_to',
  description:
    "Navigate the app to a screen/surface by its target id (from list_app_screens). Validates the target and any params against the governed navigation registry and returns a navigation directive the UI applies; refuses unknown targets or invalid/missing params rather than guessing. Use when the user asks to go somewhere, or to take them to the right surface to complete a task (e.g. open CMC, the dossier map, or the intelligence 'protocol' tab). Project-scoped targets require an active project in context. Tell the user where you're taking them.",
  input_schema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Target screen id from list_app_screens, e.g. "cmc", "dossier-map", "intelligence".' },
      params: {
        type: 'object',
        description: 'Optional params for the target (e.g. { "intelligenceTab": "protocol" }, { "sectionCode": "3.2.P.8" }).',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['target'],
  },
};

/** AnA self-navigation tools, spread into ALL_ANA_TOOLS. */
export const NAVIGATION_TOOLS: AnaTool[] = [LIST_APP_SCREENS, NAVIGATE_TO];
