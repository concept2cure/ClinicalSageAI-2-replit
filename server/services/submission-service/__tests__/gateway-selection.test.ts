/**
 * Unit tests for transmit gateway selection across all markets × client types.
 *
 * Pins the routing the transmit step depends on: FDA→ESG, JP→PMDA, and the EU
 * split where device/IVD (mdx|ivd) register through EUDAMED while drug/biologic
 * dossiers go through CESP.
 */
import { describe, it, expect } from 'vitest';
import { selectGateway } from '../submission-service';

describe('selectGateway', () => {
  it('routes FDA (all client types) to ESG', () => {
    for (const ct of ['pharma', 'biotech', 'mdx', 'ivd']) {
      expect(selectGateway('fda', ct)).toEqual({ gwRegion: 'fda', gwName: 'esg' });
    }
  });

  it('routes Japan (all client types) to the PMDA gateway', () => {
    for (const ct of ['pharma', 'biotech', 'mdx', 'ivd']) {
      expect(selectGateway('jp', ct)).toEqual({ gwRegion: 'pmda', gwName: 'pmda_gateway' });
    }
  });

  it('routes EU drug/biologic (pharma|biotech) to CESP', () => {
    expect(selectGateway('eu', 'pharma')).toEqual({ gwRegion: 'ema', gwName: 'cesp' });
    expect(selectGateway('eu', 'biotech')).toEqual({ gwRegion: 'ema', gwName: 'cesp' });
  });

  it('routes EU device/IVD (mdx|ivd) to EUDAMED', () => {
    expect(selectGateway('eu', 'mdx')).toEqual({ gwRegion: 'ema', gwName: 'eudamed' });
    expect(selectGateway('eu', 'ivd')).toEqual({ gwRegion: 'ema', gwName: 'eudamed' });
  });

  it('returns null for an unknown region (caller raises VALIDATION)', () => {
    expect(selectGateway('mars', 'pharma')).toBeNull();
  });
});
