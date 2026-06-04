/**
 * Tests for the platform command bridge — ANA's full operational control surface.
 *
 * list_platform_commands + execute_platform_command bridge the agentic tool loop
 * into the governed ana-ri command executor, so the conversational ANA can
 * discover and invoke every platform command. These exercise the discovery and
 * the validation/governance guards offline (no DB needed for those paths).
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('platform command bridge', () => {
  it('registers both bridge tools with handlers', () => {
    const names = ALL_ANA_TOOLS.map(t => t.name);
    expect(names).toContain('list_platform_commands');
    expect(names).toContain('execute_platform_command');
    expect(getToolHandler('list_platform_commands')).toBeDefined();
    expect(getToolHandler('execute_platform_command')).toBeDefined();
  });

  it('list_platform_commands returns the governed command catalog', async () => {
    const out = JSON.parse(await getToolHandler('list_platform_commands')!({}));
    expect(out.status).toBe('ok');
    expect(out.count).toBeGreaterThan(20);
    expect(out.commands.some((c: { command: string }) => c.command === 'create_artifact')).toBe(true);
  });

  it('list_platform_commands filters by query', async () => {
    const out = JSON.parse(await getToolHandler('list_platform_commands')!({ query: 'module3' }));
    expect(out.count).toBeGreaterThan(0);
    expect(
      out.commands.every((c: { command: string; description?: string }) =>
        /module3/i.test(`${c.command} ${c.description ?? ''}`),
      ),
    ).toBe(true);
  });

  it('execute_platform_command refuses without org/user context (tenant safety)', async () => {
    const out = JSON.parse(await getToolHandler('execute_platform_command')!({ command: 'list_projects' }));
    expect(out.status).toBe('needs_context');
  });

  it('execute_platform_command rejects an unknown command', async () => {
    const out = JSON.parse(
      await getToolHandler('execute_platform_command')!({ command: 'definitely_not_a_command' }, { organizationId: 1, userId: 1 }),
    );
    expect(out.status).toBe('unknown_command');
  });

  it('execute_platform_command requires a command name', async () => {
    const out = JSON.parse(await getToolHandler('execute_platform_command')!({}, { organizationId: 1, userId: 1 }));
    expect(out.status).toBe('needs_parameters');
  });
});
