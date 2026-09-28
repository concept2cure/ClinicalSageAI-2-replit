import { describe, it, expect, afterEach } from 'vitest';
import {
  resolvePlacement,
  resetPlacementRegistry,
  isPlacementCompliant,
  buildPlacementRegistry,
  residencyOfCloudRegion,
  assertPlacementRegistryConsistency,
  placementConfigurationProblems,
} from '../placement';

afterEach(() => {
  resetPlacementRegistry();
});

describe('provider placement registry', () => {
  it('marks shared frontier providers as multi-tenant without ZDR by default', () => {
    const openai = resolvePlacement('openai');
    expect(openai.substrate).toBe('frontier_shared');
    expect(openai.zeroDataRetention).toBe(false);
    expect(openai.regions).toContain('global');
  });

  it('marks private-cloud Claude (bedrock) as frontier_private with ZDR by default', () => {
    const bedrock = resolvePlacement('bedrock');
    expect(bedrock.substrate).toBe('frontier_private');
    expect(bedrock.zeroDataRetention).toBe(true);
  });

  it('marks local as the only self-hosted, on-prem, air-gappable substrate', () => {
    const local = resolvePlacement('local');
    expect(local.substrate).toBe('self_hosted');
    expect(local.regions).toEqual(['on_prem']);
    expect(local.zeroDataRetention).toBe(true);
  });
});

describe('placement compliance', () => {
  const reg = buildPlacementRegistry();

  it('allows any provider when no requirements are set', () => {
    expect(isPlacementCompliant(reg.openai, {})).toBe(true);
    expect(isPlacementCompliant(reg.openai, { residency: 'any' })).toBe(true);
  });

  it('excludes shared frontier when zero data retention is required', () => {
    expect(isPlacementCompliant(reg.openai, { zeroDataRetention: true })).toBe(false);
    expect(isPlacementCompliant(reg.bedrock, { zeroDataRetention: true })).toBe(true);
    expect(isPlacementCompliant(reg.local, { zeroDataRetention: true })).toBe(true);
  });

  it('requires a self-hosted substrate for on-prem residency', () => {
    expect(isPlacementCompliant(reg.local, { residency: 'on_prem' })).toBe(true);
    expect(isPlacementCompliant(reg.bedrock, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.openai, { residency: 'on_prem' })).toBe(false);
  });

  // Until 2026-09-25 this case asserted that default Vertex satisfies 'eu'.
  // Its client calls us-east5 by default, so that claim was the defect.
  it('enforces regional residency against the provider region list', () => {
    expect(isPlacementCompliant(reg.vertex, { residency: 'us' })).toBe(true);
    expect(isPlacementCompliant(reg.vertex, { residency: 'eu' })).toBe(false);
    expect(isPlacementCompliant(reg.bedrock, { residency: 'eu' })).toBe(false);
    // Self-hosted trivially satisfies a single-region requirement.
    expect(isPlacementCompliant(reg.local, { residency: 'eu' })).toBe(true);
  });

  it('combines residency and ZDR (both must hold)', () => {
    withEnv({ AI_VERTEX_REGION: 'europe-west1', AI_VERTEX_ZERO_RETENTION: 'true' }, () => {
      const eu = buildPlacementRegistry();
      expect(isPlacementCompliant(eu.vertex, { residency: 'eu', zeroDataRetention: true })).toBe(true);
    });
    expect(
      isPlacementCompliant(reg.openai, { residency: 'eu', zeroDataRetention: true }),
    ).toBe(false);
  });
});

const PLACEMENT_ENV = [
  'NODE_ENV',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_VERTEX_BASE_URL',
  'AWS_REGION',
  'AI_BEDROCK_REGION',
  'AI_BEDROCK_ENABLED',
  'AI_BEDROCK_RESIDENCY',
  'AI_BEDROCK_ZERO_RETENTION',
  'AI_VERTEX_REGION',
  'AI_VERTEX_ENABLED',
  'AI_VERTEX_RESIDENCY',
  'AI_VERTEX_ZERO_RETENTION',
  'AI_AZURE_RESIDENCY',
  'AI_AZURE_ZERO_RETENTION',
] as const;

/** Run fn with exactly these placement variables set (the rest unset), then restore. */
function withEnv(vars: Partial<Record<(typeof PLACEMENT_ENV)[number], string>>, fn: () => void): void {
  const saved = PLACEMENT_ENV.map(k => [k, process.env[k]] as const);
  for (const k of PLACEMENT_ENV) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('private-cloud residency follows the region the client calls (D6)', () => {
  it('default Vertex (us-east5) claims us only — never eu', () => {
    withEnv({}, () => {
      expect(buildPlacementRegistry().vertex.regions).toEqual(['us']);
    });
  });

  it('Vertex pointed at an EU region claims eu', () => {
    withEnv({ AI_VERTEX_REGION: 'europe-west4' }, () => {
      expect(buildPlacementRegistry().vertex.regions).toEqual(['eu']);
    });
  });

  it('Bedrock residency comes from the client region, not a declaration', () => {
    withEnv({ AWS_REGION: 'eu-central-1' }, () => {
      expect(buildPlacementRegistry().bedrock.regions).toEqual(['eu']);
    });
    withEnv({ AWS_REGION: 'us-east-1', AI_BEDROCK_RESIDENCY: 'eu' }, () => {
      expect(buildPlacementRegistry().bedrock.regions).toEqual(['us']);
    });
    withEnv({ AI_BEDROCK_REGION: 'ap-northeast-1', AWS_REGION: 'us-east-1' }, () => {
      expect(buildPlacementRegistry().bedrock.regions).toEqual(['apac']);
    });
  });

  it('a region with no residency code guarantees none', () => {
    withEnv({ AWS_REGION: 'ca-central-1' }, () => {
      expect(buildPlacementRegistry().bedrock.regions).toEqual(['global']);
    });
    expect(residencyOfCloudRegion('northamerica-northeast1')).toBeNull();
    expect(residencyOfCloudRegion('us-gov-west-1')).toBe('us');
  });

  it('Azure claims no residency unless one is declared', () => {
    withEnv({}, () => {
      expect(buildPlacementRegistry().azure.regions).toEqual(['global']);
    });
    withEnv({ AI_AZURE_RESIDENCY: 'eu' }, () => {
      expect(buildPlacementRegistry().azure.regions).toEqual(['eu']);
    });
  });
});

describe('private-cloud zero retention (D6)', () => {
  it('Bedrock is zero-retention unless the operator says otherwise', () => {
    withEnv({}, () => expect(buildPlacementRegistry().bedrock.zeroDataRetention).toBe(true));
    withEnv({ AI_BEDROCK_ZERO_RETENTION: 'false' }, () =>
      expect(buildPlacementRegistry().bedrock.zeroDataRetention).toBe(false),
    );
  });

  it('Vertex and Azure claim zero retention only when the operator records it', () => {
    withEnv({}, () => {
      const reg = buildPlacementRegistry();
      expect(reg.vertex.zeroDataRetention).toBe(false);
      expect(reg.azure.zeroDataRetention).toBe(false);
    });
    withEnv({ AI_VERTEX_ZERO_RETENTION: 'true', AI_AZURE_ZERO_RETENTION: 'true' }, () => {
      const reg = buildPlacementRegistry();
      expect(reg.vertex.zeroDataRetention).toBe(true);
      expect(reg.azure.zeroDataRetention).toBe(true);
    });
  });
});

describe('assertPlacementRegistryConsistency — production boot (D6)', () => {
  it('refuses a declared Bedrock residency the client region does not serve', () => {
    withEnv(
      { NODE_ENV: 'production', AI_BEDROCK_ENABLED: 'true', AWS_REGION: 'us-east-1', AI_BEDROCK_RESIDENCY: 'eu' },
      () => {
        expect(() => assertPlacementRegistryConsistency()).toThrow(/AI_BEDROCK_RESIDENCY=eu.*us-east-1/);
      },
    );
  });

  it('refuses a declared Vertex residency list wider than the client region', () => {
    withEnv({ NODE_ENV: 'production', AI_VERTEX_ENABLED: 'true', AI_VERTEX_RESIDENCY: 'us,eu' }, () => {
      expect(() => assertPlacementRegistryConsistency()).toThrow(/claims eu, but the vertex client calls us-east5/);
    });
  });

  it('boots when the declaration matches the client region', () => {
    withEnv(
      { NODE_ENV: 'production', AI_BEDROCK_ENABLED: 'true', AWS_REGION: 'eu-west-1', AI_BEDROCK_RESIDENCY: 'eu' },
      () => expect(() => assertPlacementRegistryConsistency()).not.toThrow(),
    );
  });

  it('judges only enabled lanes, and only in production', () => {
    withEnv({ NODE_ENV: 'production', AWS_REGION: 'us-east-1', AI_BEDROCK_RESIDENCY: 'eu' }, () =>
      expect(() => assertPlacementRegistryConsistency()).not.toThrow(),
    );
    withEnv({ NODE_ENV: 'development', AI_BEDROCK_ENABLED: 'true', AWS_REGION: 'us-east-1', AI_BEDROCK_RESIDENCY: 'eu' }, () => {
      expect(() => assertPlacementRegistryConsistency()).not.toThrow();
      expect(placementConfigurationProblems()).toHaveLength(1);
    });
  });
});

describe('what the region and the SDK say about residency (D6 review)', () => {
  it('London and Zurich are not EU residency; the EU regions are', () => {
    for (const r of ['eu-west-2', 'eu-central-2', 'europe-west2', 'europe-west6']) {
      expect(residencyOfCloudRegion(r)).toBeNull();
    }
    for (const r of ['eu-central-1', 'eu-west-1', 'eu-north-1', 'europe-west1', 'europe-west4', 'eu']) {
      expect(residencyOfCloudRegion(r)).toBe('eu');
    }
    withEnv({ AI_BEDROCK_REGION: 'eu-west-2' }, () => {
      expect(buildPlacementRegistry().bedrock.regions).toEqual(['global']);
    });
  });

  it('an SDK base-URL override means the region no longer says where requests go', () => {
    withEnv({ AI_BEDROCK_REGION: 'eu-central-1', ANTHROPIC_BEDROCK_BASE_URL: 'https://bedrock-runtime.us-east-1.amazonaws.com' }, () => {
      expect(buildPlacementRegistry().bedrock.regions).toEqual(['global']);
    });
    withEnv(
      { NODE_ENV: 'production', AI_BEDROCK_ENABLED: 'true', AWS_REGION: 'eu-central-1', ANTHROPIC_BEDROCK_BASE_URL: 'https://proxy.example' },
      () => expect(() => assertPlacementRegistryConsistency()).toThrow(/ANTHROPIC_BEDROCK_BASE_URL is set/),
    );
  });

  it('Bedrock zero retention is claimed only for unset or true', () => {
    for (const v of ['FALSE', '0', 'no', 'off', 'False']) {
      withEnv({ AI_BEDROCK_ZERO_RETENTION: v }, () => expect(buildPlacementRegistry().bedrock.zeroDataRetention).toBe(false));
    }
    withEnv({ AI_BEDROCK_ZERO_RETENTION: 'TRUE' }, () => expect(buildPlacementRegistry().bedrock.zeroDataRetention).toBe(true));
    withEnv(
      { NODE_ENV: 'production', AI_BEDROCK_ENABLED: 'true', AI_BEDROCK_ZERO_RETENTION: 'no' },
      () => expect(() => assertPlacementRegistryConsistency()).toThrow(/AI_BEDROCK_ZERO_RETENTION=no is neither true nor false/),
    );
  });
});
