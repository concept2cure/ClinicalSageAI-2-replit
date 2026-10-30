import { describe, expect, it } from 'vitest';
import { isLaunchWalkDoor } from './e2e/launch-walk-doors';

describe('the launch walk follows the renamed project doors', () => {
  it.each([
    'Find or start a document in the editor',
    'Review documents on the review board',
    'Build the risk file and design-control trace',
    'Check the software and cybersecurity documentation',
    'Run post-market surveillance and CAPA',
    'Write the clinical evaluation (CER)',
    'Record the clinical studies behind this filing',
    'Record analytical and clinical performance (IVDR)',
    'Choose predicates and build the SE comparison',
    'Assemble the eSTAR',
    'See which PMA modules are written',
    'Export the PMA package',
    'Gather literature and map the GSPRs',
    'Export the CER',
    'Record classification and performance evidence',
    'Assemble the technical documentation',
  ])('includes the navigation button %s', name => {
    expect(isLaunchWalkDoor(name)).toBe(true);
  });

  it.each([
    'Add or find files in Vault',
    'Write the protocol in the protocol workspace',
    'See your tasks in Tasks',
    'Build the IND · FDA (US) sequence in Submission Center',
  ])('keeps the already covered door %s', name => {
    expect(isLaunchWalkDoor(name)).toBe(true);
  });

  it.each([
    'Run validation',
    'Export the PMA package now',
    'Export the CER to Vault',
    'Download the CER',
    'Create a document in the editor',
    'Approve documents on the review board',
    'Save changes to Vault',
    'Assign work in Tasks',
    'Your tasks',
    '',
  ])('does not turn the nearby action %s into navigation', name => {
    expect(isLaunchWalkDoor(name)).toBe(false);
  });
});
