/**
 * Launch scope applied to AnA: a tool that serves only apps outside the release
 * is not offered in production, and every tool is classified.
 *
 * The production failure this exists to prevent: the API refused a hidden app's
 * routes from 2026-09-25, but AnA calls services in-process, so a user could
 * still ask her to create an IACUC protocol, record a grant award or run an RBM
 * assessment. These tests use the REAL toolset and the real inventory.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled: async () => true }));

import { getAllEnabledTools } from '../AnaToolDefinitions';
import { COMMAND_REGISTRY } from '../../ana-ri/command-executor';
import { UI_SURFACES } from '../../../../shared/constants/ui-surface-registry';
import { LAUNCH_SURFACE_IDS } from '../../../../shared/constants/launch-scope';
import {
  CLASSIFIED_COMMANDS,
  CLASSIFIED_TOOLS,
  HIDDEN_APP_COMMANDS,
  HIDDEN_APP_TOOLS,
  anaCapabilityInLaunchScope,
} from '../ana-launch-scope';
import { governedToolsetFor } from '../governed-toolset';

const pool = { query: vi.fn(async () => ({ rows: [] })) };
const names = (tools: Array<{ name: string }>) => new Set(tools.map((t) => t.name));

afterEach(() => vi.unstubAllEnvs());

describe('the inventory', () => {
  it('classifies every enabled tool: a new one must be added as hiddenApp or inScope', () => {
    const unclassified = getAllEnabledTools().map((t) => t.name).filter((n) => !CLASSIFIED_TOOLS.has(n));
    expect(unclassified).toEqual([]);
  });

  it('classifies every platform command', () => {
    const unclassified = COMMAND_REGISTRY.map((c) => c.name).filter((n) => !CLASSIFIED_COMMANDS.has(n));
    expect(unclassified).toEqual([]);
  });

  it('names only real tools and commands, and only surfaces outside the launch catalog', () => {
    const tools = names(getAllEnabledTools());
    const commands = new Set(COMMAND_REGISTRY.map((c) => c.name));
    const surfaces = new Set(UI_SURFACES.map((s) => s.id));
    expect([...HIDDEN_APP_TOOLS.keys()].filter((n) => !tools.has(n))).toEqual([]);
    expect([...HIDDEN_APP_COMMANDS.keys()].filter((n) => !commands.has(n))).toEqual([]);
    for (const ids of [...HIDDEN_APP_TOOLS.values(), ...HIDDEN_APP_COMMANDS.values()]) {
      for (const id of ids) {
        expect(surfaces.has(id), id).toBe(true);
        expect(LAUNCH_SURFACE_IDS.has(id), id).toBe(false);
      }
    }
  });

  it('brings a tool back when its surface joins the launch catalog, without editing the inventory', () => {
    expect(anaCapabilityInLaunchScope('run_rbm_assessment', HIDDEN_APP_TOOLS)).toBe(false);
    expect(anaCapabilityInLaunchScope('run_rbm_assessment', HIDDEN_APP_TOOLS, new Set(['rbm']))).toBe(true);
  });
});

describe('governedToolsetFor, the one toolset every chat door composes', () => {
  const HIDDEN = ['create_iacuc_protocol', 'record_grant_award', 'run_rbm_assessment', 'write_kit_section', 'create_clinical_study', 'build_sae_line_listing'];
  const KEPT = [
    'search_literature', // knowledge
    'lookup_fda_guidance', // knowledge
    'create_qms_document', // quality (launch)
    'list_vault_documents', // vault (launch)
    'update_protocol_section', // protocol-dev (launch)
    'navigate_to', // AnA's hands
    'execute_platform_command', // the bridge; commands are judged at dispatch
  ];

  it('in production, withholds tools that serve only hidden apps and keeps the rest', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
    const offered = names(await governedToolsetFor(pool, 42));
    for (const n of HIDDEN) expect(offered.has(n), n).toBe(false);
    for (const n of KEPT) expect(offered.has(n), n).toBe(true);
    expect(offered.size).toBe(getAllEnabledTools().length - HIDDEN_APP_TOOLS.size);
  });

  it('withholds them for a request with no organisation too', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
    const offered = names(await governedToolsetFor(pool, null));
    for (const n of HIDDEN) expect(offered.has(n), n).toBe(false);
  });

  it('with launch scope off (a development server), offers everything', async () => {
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off');
    const offered = names(await governedToolsetFor(pool, 42));
    for (const n of HIDDEN) expect(offered.has(n), n).toBe(true);
  });
});
