/** Native Vitest/real-catalog regression. No synthetic regulatory catalog.
 * Pending native execution where the full repository dependencies are present. */
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceConfig, buildSelectionCatalog, WORKSPACE_SHELL } from '../../shared/regulatory/workspace-config';

describe('the one workspace returns caller-owned catalog projections', () => {
  it('all existing selection-catalog options remain resolvable and serializable', () => {
    const options = buildSelectionCatalog().flatMap(group => group.options);
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      const config = resolveWorkspaceConfig(option.value);
      expect(config.known, option.value).toBe(true);
      expect(structuredClone(config), option.value).toEqual(config);
    }
  });

  it.each(['IND', 'NDA', 'BLA', 'US_510K', 'US_510K_IVD', 'SOP', 'WORK_INSTRUCTION'])(
    '%s preserves configuration values but owns its shell, requirements and app definitions', need => {
      const a = resolveWorkspaceConfig(need);
      const b = resolveWorkspaceConfig(need);
      expect(a.known).toBe(true);
      expect(a).toEqual(b);
      expect(a.shell).not.toBe(WORKSPACE_SHELL);
      expect(a.shell).not.toBe(b.shell);
      expect(a.capabilities).not.toBe(b.capabilities);
      expect(a.editor.requiredArtifacts).not.toBe(b.editor.requiredArtifacts);
      expect(a.lifecycleActions).not.toBe(b.lifecycleActions);
      for (let index = 0; index < a.apps.length; index++) {
        expect(a.apps[index]).not.toBe(b.apps[index]);
        expect(a.apps[index].produces).not.toBe(b.apps[index].produces);
        if (a.apps[index].legacyModuleIds) {
          expect(a.apps[index].legacyModuleIds).not.toBe(b.apps[index].legacyModuleIds);
        }
      }
      if (a.program && b.program) {
        expect(a.program.standards).not.toBe(b.program.standards);
        for (let index = 0; index < a.program.requiredClaims.length; index++) {
          expect(a.program.requiredClaims[index].supportedByApps)
            .not.toBe(b.program.requiredClaims[index].supportedByApps);
          expect(a.program.requiredClaims[index].projectsTo)
            .not.toBe(b.program.requiredClaims[index].projectsTo);
        }
      }
    },
  );

  it.each(['pharma', 'biotech', 'medtech', 'cro'])(
    '%s client terminology is independent of every other response', clientType => {
      const input = { need: 'NDA', clientType, region: 'CA' };
      const a = resolveWorkspaceConfig(input);
      const b = resolveWorkspaceConfig(input);
      expect(a.clientType).toBeDefined();
      expect(a.clientType!.terminology).not.toBe(b.clientType!.terminology);
      expect(a).toEqual(b);
    },
  );
});
