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

export const LIST_SCREEN_ACTIONS: AnaTool = {
  name: 'list_screen_actions',
  description:
    "List the ungoverned on-screen operations AnA can perform, from the governed surface-action registry: each action's id, the screen it operates, what it does, and its params. These are the controls a person would click — open a program, search the vault, set a filter, switch a view. Governed work (sign/approve/submit/lock) is structurally absent: it always goes through the propose-and-confirm path. Optionally filter by the screen (surface) id. Use the returned ids verbatim with act_on_screen.",
  input_schema: {
    type: 'object',
    properties: {
      surface: {
        type: 'string',
        description: 'Optional screen id filter (a navigation target id, e.g. "projects", "vault").',
      },
    },
    required: [],
  },
};

export const ACT_ON_SCREEN: AnaTool = {
  name: 'act_on_screen',
  description:
    "Perform an ungoverned on-screen operation by its action id (from list_screen_actions) — the click a person would make: open a program from the portfolio, search the vault, set a filter, switch a view. Validates the action and params against the governed surface-action registry and returns a directive the UI performs; refuses unknown actions, governed verbs, or invalid params rather than guessing. The screen must be (or be about to be) the one the action operates — navigate_to it first when needed. Under Live Drive the operation is applied to the user's screen as you make it; otherwise it is offered as a chip the user activates.",
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action id from list_screen_actions, e.g. "projects.open-program", "vault.search".',
      },
      params: {
        type: 'object',
        description:
          'Params for the action (e.g. { "program": "BX-204" }, { "query": "stability" }). Fill required params from the user\'s request or the on-screen context.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['action'],
  },
};

export const LIST_DEMO_SCRIPTS: AnaTool = {
  name: 'list_demo_scripts',
  description:
    'List the curated product demonstration scripts AnA can run under Live Drive: id, kind (training or sales), title, audience, honest length, and stop count. Use when the user asks for a product tour, training walkthrough, or sales demonstration, then fetch the chosen script with start_product_demo.',
  input_schema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['training', 'sales'],
        description: 'Optional filter: training walkthroughs or sales demonstrations.',
      },
    },
    required: [],
  },
};

export const START_PRODUCT_DEMO: AnaTool = {
  name: 'start_product_demo',
  description:
    "Fetch a demonstration script by id (from list_demo_scripts) and begin running it. The script is a validated plan: for each stop, narrate its talking point in your own voice (adapted to the user's real data — never verbatim), then make its move with navigate_to or act_on_screen, and keep a brisk pace. Stops without pinned params (e.g. which program to open) are filled from the on-screen context. Works best under Live Drive demonstration mode (the user starts it from the AnA rail); without Live Drive the moves become offered chips, so say so and offer to continue that way.",
  input_schema: {
    type: 'object',
    properties: {
      demo: {
        type: 'string',
        description: 'Demonstration script id from list_demo_scripts, e.g. "training-orientation", "sales-flagship".',
      },
    },
    required: ['demo'],
  },
};

/** AnA self-drive tools (navigation + screen actions + demos), spread into ALL_ANA_TOOLS. */
export const NAVIGATION_TOOLS: AnaTool[] = [
  LIST_APP_SCREENS,
  NAVIGATE_TO,
  LIST_SCREEN_ACTIONS,
  ACT_ON_SCREEN,
  LIST_DEMO_SCRIPTS,
  START_PRODUCT_DEMO,
];
