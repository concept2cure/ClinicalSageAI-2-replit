/**
 * ChEMBL client — unit tests (fetch mocked; live EBI API unreachable from CI).
 * Lock in URL construction, molecule normalization (descriptors + citeable URL),
 * max-phase labeling, mechanism lookup, and graceful empty/error handling.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildMoleculeSearchUrl,
  buildMechanismUrl,
  normalizeMolecule,
  maxPhaseLabel,
  searchChemblCompounds,
  getChemblMechanisms,
} from '../chembl-client';

describe('chembl-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CHEMBL_API_BASE_URL;
    vi.restoreAllMocks();
  });

  describe('maxPhaseLabel', () => {
    it('maps numeric phases to labels', () => {
      expect(maxPhaseLabel(4)).toMatch(/Approved/);
      expect(maxPhaseLabel(1)).toBe('Phase 1');
      expect(maxPhaseLabel(0)).toMatch(/Preclinical/);
      expect(maxPhaseLabel(null)).toMatch(/Preclinical/);
    });
  });

  describe('buildMoleculeSearchUrl', () => {
    it('uses pref_name__icontains and clamps the limit', () => {
      const url = buildMoleculeSearchUrl('pembrolizumab', 99);
      expect(url).toContain('pref_name__icontains=pembrolizumab');
      expect(url).toContain('limit=20'); // clamped to MAX_RESULTS
      expect(url).toContain('format=json');
    });

    it('honors CHEMBL_API_BASE_URL override', () => {
      process.env.CHEMBL_API_BASE_URL = 'https://proxy.internal/chembl';
      expect(buildMoleculeSearchUrl('aspirin', 5)).toMatch(/^https:\/\/proxy\.internal\/chembl\/molecule\?/);
    });
  });

  describe('buildMechanismUrl', () => {
    it('filters by molecule_chembl_id', () => {
      expect(buildMechanismUrl('CHEMBL25')).toContain('molecule_chembl_id=CHEMBL25');
    });
  });

  describe('normalizeMolecule', () => {
    it('extracts descriptors, SMILES, phase, and a citeable URL', () => {
      const raw = {
        molecule_chembl_id: 'CHEMBL25',
        pref_name: 'ASPIRIN',
        max_phase: 4,
        molecule_type: 'Small molecule',
        first_approval: 1950,
        molecule_structures: { canonical_smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
        molecule_properties: {
          full_mwt: '180.16',
          alogp: '1.31',
          psa: '63.60',
          hba: '3',
          hbd: '1',
          rtb: '2',
          aromatic_rings: '1',
          num_ro5_violations: '0',
          qed_weighted: '0.55',
          full_molformula: 'C9H8O4',
        },
      };
      const m = normalizeMolecule(raw);
      expect(m.chemblId).toBe('CHEMBL25');
      expect(m.preferredName).toBe('ASPIRIN');
      expect(m.smiles).toBe('CC(=O)Oc1ccccc1C(=O)O');
      expect(m.maxPhase).toBe(4);
      expect(m.maxPhaseLabel).toMatch(/Approved/);
      expect(m.properties.molecularWeight).toBeCloseTo(180.16, 2);
      expect(m.properties.ro5Violations).toBe(0);
      expect(m.properties.molecularFormula).toBe('C9H8O4');
      expect(m.url).toContain('CHEMBL25');
    });

    it('tolerates missing properties/structures', () => {
      const m = normalizeMolecule({ molecule_chembl_id: 'CHEMBL999' });
      expect(m.smiles).toBeNull();
      expect(m.properties.molecularWeight).toBeNull();
      expect(m.maxPhaseLabel).toMatch(/Preclinical/);
    });
  });

  describe('searchChemblCompounds', () => {
    it('returns normalized molecules and total count', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            page_meta: { total_count: 1 },
            molecules: [
              {
                molecule_chembl_id: 'CHEMBL25',
                pref_name: 'ASPIRIN',
                max_phase: 4,
                molecule_structures: { canonical_smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
                molecule_properties: { full_mwt: '180.16' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ) as unknown as typeof fetch;

      const result = await searchChemblCompounds('aspirin', 5);
      expect(result.source).toBe('ChEMBL');
      expect(result.totalCount).toBe(1);
      expect(result.molecules).toHaveLength(1);
      expect(result.molecules[0].chemblId).toBe('CHEMBL25');
    });

    it('returns empty for a blank query without calling the network', async () => {
      const spy = vi.fn();
      global.fetch = spy as unknown as typeof fetch;
      const result = await searchChemblCompounds('   ');
      expect(result.molecules).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();
    });

    it('throws on HTTP error so the caller can degrade', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as unknown as typeof fetch;
      await expect(searchChemblCompounds('aspirin')).rejects.toThrow(/HTTP 503/);
    });
  });

  describe('getChemblMechanisms', () => {
    it('normalizes mechanism + target with a citeable target URL', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            mechanisms: [
              {
                mechanism_of_action: 'Cyclooxygenase inhibitor',
                target_chembl_id: 'CHEMBL230',
                action_type: 'INHIBITOR',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ) as unknown as typeof fetch;

      const result = await getChemblMechanisms('CHEMBL25');
      expect(result.mechanisms).toHaveLength(1);
      expect(result.mechanisms[0].mechanismOfAction).toMatch(/Cyclooxygenase/);
      expect(result.mechanisms[0].targetUrl).toContain('CHEMBL230');
    });
  });
});
