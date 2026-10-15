/**
 * The software.cybersecurity knowledge link cites only corpus entries that speak
 * to cybersecurity (2026-10-15).
 *
 * links.ts mapped 'software.cybersecurity' to fda.ivd.expedited-programs —
 * Breakthrough Devices, STeP and PCCPs, nothing on cybersecurity — so every
 * POST /api/ivd-lifecycle/software/cybersecurity answer cited it as a source.
 * The corpus has no §524B entry; std.iec-62304 (which names FDA premarket
 * cybersecurity, SPDF/SBOM) is the one entry left.
 */
import { it, expect } from 'vitest';
import { knowledgeFor } from '../links';
import { getEntry } from '../knowledge.service';

it('cites no entry that does not mention cybersecurity, an SBOM or §524B', () => {
  const links = knowledgeFor('software.cybersecurity');
  expect(links.length).toBeGreaterThan(0);
  const offTopic = links
    .filter((l) => {
      const e = getEntry(l.id)!;
      const text = [e.title, e.summary, e.detail, ...e.keyPoints].join(' ');
      return !/cybersecurity|SBOM|524B/i.test(text);
    })
    .map((l) => l.id);
  expect(offTopic, 'software.cybersecurity cites an entry that is not about cybersecurity').toEqual([]);
});
