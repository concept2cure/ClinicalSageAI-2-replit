/**
 * Expected Value of (Perfect) Information for IVD evidence decisions.
 *
 * Quantifies how much it is worth resolving uncertainty about a program's
 * probability of regulatory success before committing. Under uncertainty a
 * sponsor may make the wrong go/no-go call; EVPI is the expected opportunity
 * loss that perfect information would avoid — an upper bound on what any
 * confirmatory study (de-risking evidence) could be worth.
 *
 * Deterministic; no I/O. Financials are caller-supplied.
 */

export interface VoiScenario {
  label?: string;
  /** Probability this scenario is the true state of the world (0–1). */
  probability: number;
  /** Probability of regulatory success in this scenario (0–1). */
  probabilityOfSuccess: number;
}

export interface VoiInput {
  scenarios: VoiScenario[];
  /** Net value (e.g., risk-adjusted NPV) if the product is approved, USD. */
  marketValueUsd: number;
  /** Cost to pursue the program (evidence + submission), USD. */
  costToCompleteUsd: number;
}

export interface VoiResult {
  /** Expected payoff of the optimal decision made under current uncertainty. */
  expectedValueWithoutInfo: number;
  /** Expected payoff if the true scenario were known before deciding. */
  expectedValueWithPerfectInfo: number;
  /** Expected Value of Perfect Information (≥ 0). */
  evpi: number;
  /** The decision a rational actor makes today (max of go-EMV vs 0). */
  baselineDecision: 'go' | 'no_go';
  /** Per-scenario go payoff and the info-optimal choice. */
  scenarioPayoffs: { label: string; probability: number; goPayoffUsd: number; infoOptimal: 'go' | 'no_go' }[];
  rationale: string;
}

const round = (n: number): number => Math.round(n);

/**
 * Compute EVPI for a go/no-go decision under scenario uncertainty about the
 * probability of success. Scenario probabilities are normalized.
 */
export function expectedValueOfPerfectInformation(input: VoiInput): VoiResult {
  const { marketValueUsd, costToCompleteUsd } = input;
  if (!Array.isArray(input.scenarios) || input.scenarios.length === 0) {
    throw new Error('At least one scenario is required.');
  }
  if (marketValueUsd < 0 || costToCompleteUsd < 0) {
    throw new Error('marketValueUsd and costToCompleteUsd must be non-negative.');
  }
  const totalProb = input.scenarios.reduce((s, sc) => s + Math.max(0, sc.probability), 0);
  if (totalProb <= 0) throw new Error('Scenario probabilities must sum to a positive value.');

  const scenarioPayoffs = input.scenarios.map((sc, i) => {
    const w = Math.max(0, sc.probability) / totalProb;
    const p = Math.max(0, Math.min(1, sc.probabilityOfSuccess));
    const goPayoffUsd = p * marketValueUsd - costToCompleteUsd;
    return { label: sc.label ?? `Scenario ${i + 1}`, probability: Math.round(w * 1000) / 1000, goPayoffUsd: round(goPayoffUsd), infoOptimal: (goPayoffUsd > 0 ? 'go' : 'no_go') as 'go' | 'no_go' };
  });

  // Decision under uncertainty: pick the action that maximizes expected payoff.
  const expectedGo = scenarioPayoffs.reduce((s, sp) => s + sp.probability * sp.goPayoffUsd, 0);
  const expectedValueWithoutInfo = Math.max(expectedGo, 0);
  const baselineDecision: 'go' | 'no_go' = expectedGo > 0 ? 'go' : 'no_go';

  // With perfect information: in each scenario, choose the better of go/no-go.
  const expectedValueWithPerfectInfo = scenarioPayoffs.reduce((s, sp) => s + sp.probability * Math.max(sp.goPayoffUsd, 0), 0);
  const evpi = Math.max(0, expectedValueWithPerfectInfo - expectedValueWithoutInfo);

  return {
    expectedValueWithoutInfo: round(expectedValueWithoutInfo),
    expectedValueWithPerfectInfo: round(expectedValueWithPerfectInfo),
    evpi: round(evpi),
    baselineDecision,
    scenarioPayoffs,
    rationale: evpi > 0
      ? `EVPI is $${round(evpi).toLocaleString()}: uncertainty could flip the go/no-go call, so confirmatory evidence costing less than this is worth acquiring before committing.`
      : `EVPI is $0: the ${baselineDecision === 'go' ? 'go' : 'no-go'} decision is optimal in every scenario, so more information would not change it.`,
  };
}
