import { describe, expect, it } from 'vitest';
import { destinationFor, surfaceSegmentFromLocation } from '../routing';

describe('one destination for a project-scoped visit', () => {
  it('takes dossier links without an open project to the existing Projects door', () => {
    expect(destinationFor('dossier', false)).toEqual({ surfaceId: 'projects' });
    expect(destinationFor('dossier-map', false)).toEqual({ surfaceId: 'projects' });
  });

  it('takes both old dossier ids to Author, including a project with no documents', () => {
    for (const id of ['dossier', 'dossier-map']) {
      expect(destinationFor(id, true)).toEqual({ surfaceId: 'project-home', applies: { actionId: 'project-home.set-stage', params: { stage: 'author' } } });
    }
  });

  it('uses the shared target scope for normal and aliased destinations', () => {
    for (const id of ['project-home', 'review', 'vault', 'documents', 'ind-lifecycle']) {
      expect(destinationFor(id, false), id).toEqual({ surfaceId: 'projects' });
    }
    expect(destinationFor('review', true)).toEqual({ surfaceId: 'review' });
    expect(destinationFor('documents', true)).toEqual({ surfaceId: 'vault' });
  });

  it('keeps the public Subscription & features address and global places usable', () => {
    expect(destinationFor('features', false)).toEqual({ surfaceId: 'apps' });
    expect(destinationFor('home', false)).toEqual({ surfaceId: 'home' });
    expect(destinationFor('projects', false)).toEqual({ surfaceId: 'projects' });
    expect(destinationFor('mdx', false)).toEqual({ surfaceId: 'device-workstream' });
  });

  it('keeps the raw URL id until its requested action has been applied', () => {
    expect(surfaceSegmentFromLocation('/concept2cure/dossier-map?program=example')).toBe('dossier-map');
    expect(surfaceSegmentFromLocation('/concept2cure/features')).toBe('features');
    expect(surfaceSegmentFromLocation('/concept2cure')).toBe('home');
    expect(surfaceSegmentFromLocation('/elsewhere')).toBe('home');
    expect(surfaceSegmentFromLocation('/concept2curely/dossier')).toBe('home');
  });

  it('does not treat inherited object properties as aliases or stage actions', () => {
    expect(destinationFor('__proto__', false)).toEqual({ surfaceId: '__proto__' });
    expect(destinationFor('constructor', true)).toEqual({ surfaceId: 'constructor' });
  });
});
