import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAUNCH_APPS } from '../../shared/constants/launch-scope';
import { launchQualificationSurfaces, accessQualificationSurfaces } from '../e2e/launch-catalog';

describe('release qualification consumes the complete current launch catalog',()=>{
  it('covers all eight current apps, including professional-band CMC',()=>{
    const surfaces = launchQualificationSurfaces();
    expect(surfaces).toHaveLength(LAUNCH_APPS.length);
    expect(surfaces.some(surface=>surface.id==='cmc')).toBe(true);
    expect(surfaces.map(surface=>surface.app)).toEqual(LAUNCH_APPS.map(app=>app.label));
  });
  it('automatically includes a future approved app instead of silently omitting it',()=>{
    const surfaces=launchQualificationSurfaces([...LAUNCH_APPS,{id:'future-app',label:'Approved future app',surfaces:['future-surface'],modules:[]}]);
    expect(surfaces.at(-1)).toEqual({id:'future-surface',app:'Approved future app'});
    expect(()=>launchQualificationSurfaces([{id:'invalid',label:'Invalid',surfaces:[],modules:[]}])).toThrow('no surface');
  });
  it('both browser qualification specs actually use the canonical derivation',()=>{
    for(const file of ['launch-surface-access-control.e2e.spec.ts','launch-surface-keyboard.e2e.spec.ts']) {
      const source=readFileSync(new URL(`../e2e/${file}`,import.meta.url),'utf8');
      expect(source).toMatch(/import.*QualificationSurfaces.*from ['"]\.\/launch-catalog['"]/);
      expect(source).not.toMatch(/const SURFACES:[^=]*= \[/);
    }
    expect(accessQualificationSurfaces().map(surface=>surface.id)).toContain('audit-trail');
    // part11-console folded into audit-trail on 2026-10-29 (D2); it has no screen to qualify.
    expect(accessQualificationSurfaces().map(surface=>surface.id)).not.toContain('part11-console');
  });
  it('required browser CI runs the whole catalog access and keyboard specs',()=>{
    const workflow=readFileSync(new URL('../../.github/workflows/tier5-browser-smoke.yml',import.meta.url),'utf8');
    expect(workflow).toContain('launch-surface-access-control.e2e.spec.ts');
    expect(workflow).toContain('launch-surface-keyboard.e2e.spec.ts');
  });
});
