/**
 * The Vault's header names the project's own filing, not the first filing its
 * view happens to list.
 *
 * GET /api/c2c/project-vault/:id labelled every vault with the first filing
 * type of its view: every Pharmaceutical vault read "IND · 21 CFR 312", an NDA
 * project's included (.design/filing-spine/screenshots/
 * review-vault-no-project-desktop-1280.png, ONC-221 — NDA). A filing type the
 * view does not list is not guessed: the header names the view.
 */
import { describe, expect, it } from 'vitest';
import { filingTypesForView, VAULT_VIEWS, vaultSpineLabel } from '../vault-taxonomy';

describe("the Vault header names the project's filing", () => {
  it("an NDA project's vault reads NDA · 21 CFR 314, not IND · 21 CFR 312", () => {
    expect(vaultSpineLabel('pharma', 'NDA')).toBe('NDA · 21 CFR 314');
    expect(vaultSpineLabel('pharma', 'nda')).toBe('NDA · 21 CFR 314');
  });

  it('an IND and a BLA read as themselves', () => {
    expect(vaultSpineLabel('pharma', 'ind')).toBe('IND · 21 CFR 312');
    expect(vaultSpineLabel('biotech', 'BLA')).toBe('BLA · 42 USC 262 (PHS Act 351)');
  });

  it('a filing type the view does not list, or none, names the view and guesses no regulation', () => {
    expect(vaultSpineLabel('pharma', 'JNDA')).toBe('Pharmaceutical');
    expect(vaultSpineLabel('pharma', null)).toBe('Pharmaceutical');
    expect(vaultSpineLabel('biotech', 'nda')).toBe('Biotechnology');
  });
});

/*
 * F1 (S6, 2026-11-05): a device or diagnostic project's program_type is written in the portfolio's
 * vocabulary ('510k', 'de_novo', 'mdr', 'ivdr'; shared/constants/mdx.ts REGULATORY_PATH_TO_PATHWAY), and the
 * taxonomy's filing values are not ('k510', 'denovo', 'cer', 'ivdr_pe'). The seeded NeuroPanel-Dx 510(k)
 * (program_type '510k', product_type 'ivd') therefore read "IVD / Diagnostics" in its Vault header.
 */
describe("a device or diagnostic project's Vault header names its filing (F1)", () => {
  it('the NeuroPanel-Dx 510(k) reads 510(k) · 21 CFR 807, not IVD / Diagnostics', () => {
    expect(vaultSpineLabel('ivd', '510k')).toBe('510(k) · 21 CFR 807');
    expect(vaultSpineLabel('device', '510k')).toBe('510(k) · 21 CFR 807');
    expect(vaultSpineLabel('ivd', '510(k)')).toBe('510(k) · 21 CFR 807');
  });

  it('a De Novo and a PMA read as themselves', () => {
    expect(vaultSpineLabel('device', 'de_novo')).toBe('De Novo');
    expect(vaultSpineLabel('ivd', 'de_novo')).toBe('De Novo');
    expect(vaultSpineLabel('device', 'pma')).toBe('PMA · 21 CFR 814');
    expect(vaultSpineLabel('ivd', 'PMA')).toBe('PMA · 21 CFR 814');
  });

  it("EU MDR and IVDR program types read as the taxonomy's CER and IVDR PE", () => {
    expect(vaultSpineLabel('device', 'mdr')).toBe('CER · EU MDR 2017/745 Art. 61');
    expect(vaultSpineLabel('ivd', 'ivdr')).toBe('IVDR PE · EU IVDR 2017/746');
  });

  it('a segment is not a filing, and a filing the view does not list names the view', () => {
    // 'ivd' as a program type carries no premarket route (scripts/demo/launch-demo/packs/mdx.mjs).
    expect(vaultSpineLabel('ivd', 'ivd')).toBe('IVD / Diagnostics');
    expect(vaultSpineLabel('device', 'device')).toBe('Medical Device');
    expect(vaultSpineLabel('ivd', 'mdr')).toBe('IVD / Diagnostics');
    expect(vaultSpineLabel('device', 'ivdr')).toBe('Medical Device');
    expect(vaultSpineLabel('pharma', 'cta')).toBe('Pharmaceutical');
  });

  it('every label the taxonomy already gave is unchanged', () => {
    for (const { value: view } of VAULT_VIEWS) {
      for (const f of filingTypesForView(view)) {
        const refs = f.regulatoryRefs;
        expect(vaultSpineLabel(view, f.value), `${view} / ${f.value}`)
          .toBe(refs && refs.length ? `${f.label} · ${refs.join(' · ')}` : f.label);
      }
    }
  });
});
