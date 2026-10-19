import { describe, it, expect } from 'vitest';
import { workflowCopySectionContent } from '../workflow-copy-content';
import { sectionReadableText } from '../authoring-read-render';

describe('deterministic workflow copy fidelity and safety', () => {
  it('keeps Markdown headings, lists and matrix values in actual editor HTML', () => {
    const copied = workflowCopySectionContent('# Schedule\n\n- Screening\n- Day 1\n\n| Assessment | Screening | Day 1 |\n| --- | --- | --- |\n| ECG | Required | Optional |');
    expect(copied).toContain('<h1>Schedule</h1>');
    expect(copied).toContain('<li>Screening</li>');
    expect(copied).toContain('<table>');
    expect(copied).toContain('<td>Required</td>');
    expect(copied).toContain('<td>Optional</td>');
  });

  it('preserves scientific less-than and tag-shaped text rather than treating it as markup', () => {
    const copied = workflowCopySectionContent('Impurity B was <LOQ in all batches. Temperature <critical> threshold.\n\nR&D remained unchanged.');
    expect(sectionReadableText(copied)).toContain('<LOQ in all batches');
    expect(sectionReadableText(copied)).toContain('<critical> threshold');
    expect(sectionReadableText(copied)).toContain('R&D remained unchanged');
  });

  it('keeps supported source HTML table shape and excludes executable code and unverified machine figures', () => {
    const copied = workflowCopySectionContent('<h2>Assay</h2><table><tr><td>99.2%</td></tr></table><script>alert(1)</script><img src="data:image/png;base64,abc=">');
    expect(copied).toContain('<h2>Assay</h2>');
    expect(copied).toContain('<td>99.2%</td>');
    expect(copied).not.toContain('<script');
    expect(copied).not.toContain('<img');
    expect(copied).toContain('verify and add the original figure');
  });
});
