import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { OPEN_PROGRAM_SURFACE } from '../programAction';
import { RAIL_CORE } from '../registryModel';

const client = path.resolve(__dirname, '../..');
const source = (file: string) => fs.readFileSync(path.join(client, file), 'utf8');
function calls(code: string): ts.CallExpression[] {
  const file = ts.createSourceFile('door.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return found;
}
function callsDestination(code: string, destination: string) {
  return calls(code).some(call => call.arguments[0] && ts.isStringLiteral(call.arguments[0])
    && call.arguments[0].text === destination
    && /^(onNav|nav|open|onNavigate)$/.test(call.expression.getText()));
}
function pickerListenerReachesProjects(code: string, destination: string) {
  const listener = calls(code).some(call => call.expression.getText() === 'window.addEventListener'
    && call.arguments[0]?.getText() === 'OPEN_PROGRAM_EVENT' && call.arguments[1]?.getText() === 'onOpenProgram');
  const navigate = calls(code).some(call => call.expression.getText() === 'nav'
    && call.arguments[0]?.getText() === 'OPEN_PROGRAM_SURFACE');
  return listener && navigate && destination === 'projects';
}

/** Creation buttons have rendered interaction checks in Home/HomeSetup,
 * Onboarding and MdxSurfaceHost suites. These existing choose/open doors keep
 * their index outcome; silently opening a creation wizard would change it. */
describe('existing project doors keep their reachable destination', () => {
  /* D1-2 (.design/claude-convergence/D1.md §D1.B step 4): v2/Shell.tsx's literal door was the
     top bar's "No project open" chip, which went with the chip. The shell's door to the
     Projects index is the sidebar's Projects place: a RAIL_CORE entry that opens its own id,
     clicked and pinned in shellNav.test.tsx ("Projects is on the rail, and opens the Projects
     index"). */
  it('v2/Shell.tsx keeps its Projects index door: the sidebar’s Projects place', () => {
    const place = RAIL_CORE.find(entry => entry.id === OPEN_PROGRAM_SURFACE);
    expect(place && !('target' in place) && !('applies' in place) && !('group' in place)).toBe(true);
  });

  it.each([
    'v2/LaunchScopeGate.tsx', 'mdx/MdxSurfaceHost.tsx',
    'v2/surfaces/CommunicationCenter.tsx',
    'v2/surfaces/CroPortfolio.tsx',
    'v2/surfaces/ProjectHome.tsx', 'v2/surfaces/HomeSections.tsx',
    'v2/surfaces/Surfaces.tsx', 'v2/surfaces/WorkflowCatalog.tsx',
    'quality/ControlledDocumentDialogs.tsx',
  ])('%s retains its Projects index door', file => {
    expect(callsDestination(source(file), 'projects')).toBe(true);
  });

  /* Vault no longer sends a person with no project open to Projects (the founder, 2026-11-06, 5144702d21): it
     lists the projects whose Vaults they can open, from the same project read Projects and the palette use, and a
     row opens that project and its Vault. Since P-107 item 3 (47a3067008) the Vault reads that list through
     useVaultProjects, which keeps each project's sponsor; it is still the palette's read (PALETTE_PROJECTS_URL). */
  it('v2/surfaces/Vault.tsx lists the projects it can open in place of a Projects door', () => {
    const vault = source('v2/surfaces/Vault.tsx');
    expect(calls(vault).some(call => call.expression.getText() === 'useVaultProjects')).toBe(true);
    expect(source('v2/surfaces/vaultSponsors.ts')).toMatch(/useLiveData<unknown\[\]>\(open \? PALETTE_PROJECTS_URL : null/);
    expect(callsDestination(vault, 'vault')).toBe(true);
    expect(vault).toMatch(/data-testid="vault-project-list"/);
  });

  it.each([
    'v2/surfaces/CmcModule3Build.tsx', 'v2/surfaces/CmcQuality.tsx',
    'v2/surfaces/CmcModule.tsx', 'v2/surfaces/cmcAgencyQuestions.tsx',
    'mdx/components/DataGate.tsx',
  ])('%s retains the canonical choose-or-create action', file => {
    expect(calls(source(file)).some(call => call.expression.getText() === 'openProgramAction')).toBe(true);
    expect(OPEN_PROGRAM_SURFACE).toBe('projects');
  });

  it('the shell listener uses the same Projects destination as the leaf action', () => {
    expect(pickerListenerReachesProjects(source('v2/V2App.tsx'), OPEN_PROGRAM_SURFACE)).toBe(true);
  });

  it('rejects the former Mission Control destination and a detached event listener', () => {
    const shell = source('v2/V2App.tsx');
    expect(pickerListenerReachesProjects(shell, 'mission-control')).toBe(false);
    expect(pickerListenerReachesProjects(shell.replace('window.addEventListener(OPEN_PROGRAM_EVENT, onOpenProgram)', ''), 'projects')).toBe(false);
  });

  it('the MDX catalog door is passed from the existing Projects index navigation', () => {
    expect(source('v2/surfaces/WorkflowCatalog.tsx')).toMatch(/onOpenProjects=\{\(\) => open\('projects'\)\}/);
    expect(source('v2/surfaces/MdxCatalogSolution.tsx')).toMatch(/onClick=\{onOpenProjects\}/);
  });

  it('onboarding define-project remains a choose-or-create index recommendation', () => {
    const recommendations = fs.readFileSync(path.resolve(client, '../../../shared/types/onboarding-discovery.ts'), 'utf8');
    expect(recommendations).toMatch(/id: 'define-project'[^\n]+surface: 'projects'/);
    expect(source('v2/surfaces/DiscoveryNextSteps.tsx')).toMatch(/onNav\(recommendation\.surface\)/);
  });
});
