/**
 * POST /api/analytics/demo-analysis — the protocol-analysis demo endpoint.
 *
 * Its own module for two reasons, both worth stating rather than implying.
 *
 * 1. It is DEVELOPMENT-ONLY (ledger L167). It sat in analytics-routes.ts beside
 *    the analytics production needs, and was mounted with no NODE_ENV gate, no
 *    auth and no tenant context — `analyticsRoutes` is mounted with no
 *    middleware at all, unlike the sibling `mountAll` for quality management
 *    which passes requireTenantContext. Separating a dev-only endpoint from the
 *    production routes in the same family is what makes the gate on it legible:
 *    `ci:no-mock-in-prod-routes` asks whether the FILE declaring a `demo` route
 *    carries a production gate, and here that question has one answer.
 *
 * 2. The commit that gated it (3ac7f245d) grew analytics-routes.ts from 1487 to
 *    1520 lines, crossing the repo-health line threshold of 1500 and turning
 *    `audit:repo-health:no-regression` and `ci:eslint-ratchet` red on trunk.
 *    Neither gate runs in .husky/pre-push, so the push was clean locally and the
 *    regression surfaced only in CI. Moving this handler out is the repair, and
 *    leaves analytics-routes.ts well under the threshold rather than one line
 *    under it.
 *
 * Mounted by analytics-routes.ts via `router.use(...)`, so the path it answers
 * on is unchanged: POST /api/analytics/demo-analysis.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { protocolAnalyzerService } from '../protocol-analyzer-service';
import { analyzeText } from '../openai-service';
import { createScopedLogger } from '../utils/logger.js';
import { serverError } from '../lib/api-response';

const log = createScopedLogger('analytics-demo-analysis');
const router = Router();

/**
 * Production gate for the demo endpoint below (ledger L167).
 *
 * L171 fixed what `/demo-analysis` SAYS — the minted DOIs and the three claimed
 * analyses are gone. It left what L171's own row records: the route "is mounted
 * live by register-project-routes with no NODE_ENV gate and no client caller".
 *
 * That exposure is not only cosmetic. `analyticsRoutes` is mounted with no
 * middleware at all — the sibling `mountAll` for quality management passes
 * requireTenantContext, the analytics one passes nothing — and this file
 * installs no router-level auth, so the handler answered unauthenticated and
 * without tenant context on a real deployment, wrote caller-supplied text under
 * `exports/`, and spent a model call, for a route no client calls.
 *
 * 404 rather than 403, and the same body as the precedent in
 * server/routes/seed-demo.ts ("SECURITY: Block demo seeding in production"): a
 * route that should not exist in production should not advertise that it does.
 *
 * Applied to this ONE route, not via `router.use`, because the rest of this file
 * is real analytics that production needs.
 *
 * Read per request, not captured at module load. server/routes/sso.ts records
 * why: a constant frozen at import "cannot be exercised by a test that sets the
 * env after importing the router, and it silently ignores any later change to
 * the process environment". The check is one comparison.
 */
function blockInProduction(_req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

// Add the critical demo-analysis endpoint with global regulatory knowledge and citations
router.post('/demo-analysis', blockInProduction, async (req, res) => {
  try {
    const { content, session_id } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Protocol content is required',
      });
    }

    log.debug(`Analyzing protocol with session ID: ${session_id}`);

    // Create session directory if it doesn't exist
    // basename: session_id arrives from the request and is a path segment here.
      // Express decodes %2F, so `..%2F..%2F` reaches this as real traversal.
      const sessionDir = path.join(process.cwd(), 'exports', path.basename(String(session_id)));
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save protocol content to the session directory
    const protocolPath = path.join(sessionDir, 'protocol.txt');
    fs.writeFileSync(protocolPath, content);

    // First use the base protocol analyzer service
    const protocolData = await protocolAnalyzerService.analyzeProtocol(content);

    // Get similar protocols based on the analyzed data
    const similarProtocols = await protocolAnalyzerService.findSimilarProtocols(protocolData, 5);

    // Enhancing analysis with knowledge-based recommendations
    const systemPrompt = `You are an expert clinical trial protocol analyzer with comprehensive knowledge of global regulatory agencies (FDA, EMA, PMDA, NMPA, TGA, ANVISA, Health Canada, MHRA) and academic literature. 

Analyze the provided protocol and generate detailed, evidence-based recommendations with proper citations to regulatory guidelines and academic publications. Your analysis should cover:

1. Study design optimization
2. Statistical methodology assessment
3. Regulatory compliance across major jurisdictions
4. Operational feasibility
5. Risk mitigation strategies
6. Patient-centric considerations

For each recommendation, include specific citations to relevant regulatory guidelines (with section/page numbers when applicable) and recent academic literature (author, year, journal). Make your recommendations actionable and specific.`;

    let detailedAnalysis;
    try {
      detailedAnalysis = await analyzeText(content, systemPrompt);
    } catch (error) {
      log.error('Error generating detailed analysis:', error);
      detailedAnalysis =
        'Unable to generate detailed AI analysis - falling back to standard analysis.';
    }

    // Generate comprehensive recommendations with regulatory knowledge
    const globalRegulationsData = {
      FDA: {
        guidelines: [
          '21 CFR Part 312 - Investigational New Drug Application',
          '21 CFR Part 50 - Protection of Human Subjects',
          '21 CFR Part 56 - Institutional Review Boards',
          'FDA Guidance for Industry: E6(R2) Good Clinical Practice',
          'FDA Guidance for Industry: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019)',
          'FDORA 2022: Diversity Requirements for Clinical Trials',
        ],
        citations: [
          'U.S. Food and Drug Administration. (2018). Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics: Guidance for Industry. https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
          'FDA. (2020). Enhancing the Diversity of Clinical Trial Populations: Guidance for Industry. https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
        ],
      },
      EMA: {
        guidelines: [
          'ICH E9: Statistical Principles for Clinical Trials',
          'ICH E6(R2): Good Clinical Practice',
          'EMA Guideline on the evaluation of anticancer medicinal products in man (EMA/CHMP/205/95 Rev.6)',
          'EMA Guideline on Data Monitoring Committees (EMEA/CHMP/EWP/5872/03)',
        ],
        citations: [
          'European Medicines Agency. (2022). Guideline on the clinical evaluation of anticancer medicinal products. EMA/CHMP/205/95 Rev.6. https://www.ema.europa.eu/en/documents/scientific-guideline',
          'EMA. (2021). Guideline on the investigation of subgroups in confirmatory clinical trials. EMA/CHMP/539146/2013. https://www.ema.europa.eu/en/documents/scientific-guideline',
        ],
      },
      PMDA: {
        guidelines: [
          'PMDA: Basic Principles on Global Clinical Trials',
          'PMDA: Points to Consider for Ethnic Factors',
          'Japanese GCP Ordinance (MHLW Ordinance No. 28)',
        ],
        citations: [
          'Pharmaceuticals and Medical Devices Agency. (2021). Basic Principles on Global Clinical Trials Reference Guide. https://www.pmda.go.jp/english/',
          'PMDA. (2019). Points to Consider for Multi-Regional Clinical Trials. https://www.pmda.go.jp/english/',
        ],
      },
      'Health Canada': {
        guidelines: [
          'Health Canada Food and Drug Regulations (C.05.010)',
          'Good Clinical Practices: Consolidated Guideline ICH Topic E6',
          'Health Canada Guidance Document: Clinical Trial Applications',
        ],
        citations: [
          'Health Canada. (2022). Clinical Trials - Applications and Amendments. https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents',
          'Health Canada. (2019). Good Clinical Practice: Integrated Addendum to E6(R1). https://www.canada.ca/en/health-canada',
        ],
      },
    };

    // Generate a wisdom trace for the analysis process
    const wisdomTrace = [
      {
        /*
         * WO-16C finding 65, follow-up review 2026-09-18. The other two
         * sections of this trace were corrected and this one was left as it
         * was. It said:
         *
         *   `Sample size of ${sample_size} participants analyzed against benchmarks`
         *   `Primary endpoint "${primary_endpoint}" evaluated for statistical robustness`
         *   `Study duration of ${duration_weeks} weeks compared with similar trials`
         *
         * Three claims of analysis over one real act. This handler holds no
         * benchmark set, evaluates no statistical robustness, and compares no
         * duration against anything — its only comparison is
         * findSimilarProtocols, which the Evidence Base section below already
         * reports honestly, usually as "no comparison was performed".
         *
         * Worse, `analyzeProtocol` defaults none of these fields: each is
         * `undefined` when its regex does not match, which for a protocol body
         * that states no sample size produced the literal sentence "Sample size
         * of undefined participants analyzed against benchmarks" — and
         * "Identified undefined protocol for undefined" above it.
         *
         * What the handler genuinely does is a pattern extraction over the
         * submitted text. Each line now names that act and reports what the
         * extractor found, or that it found nothing.
         */
        section: 'Protocol Structure',
        insights: [
          protocolData.phase
            ? `Extracted phase from the submitted text: ${protocolData.phase}`
            : 'No phase was found in the submitted text',
          protocolData.indication
            ? `Classified therapeutic area from the submitted text: ${protocolData.indication}`
            : 'No therapeutic area could be determined from the submitted text',
          typeof protocolData.sample_size === 'number'
            ? `Extracted sample size: ${protocolData.sample_size} participants (not compared against any benchmark here)`
            : 'No sample size was found in the submitted text',
          protocolData.primary_endpoint
            ? `Extracted primary endpoint: "${protocolData.primary_endpoint}" (recorded as stated; not evaluated here)`
            : 'No primary endpoint was found in the submitted text',
          typeof protocolData.duration_weeks === 'number'
            ? `Extracted study duration: ${protocolData.duration_weeks} weeks (not compared against other trials here)`
            : 'No study duration was found in the submitted text',
        ],
      },
      {
        // A wisdom trace states what was DONE, so each line here must name a
        // step this handler actually performs. The previous version claimed
        // four, of which one was true. `Statistical power calculations
        // validated against historical data` and `Inclusion/exclusion criteria
        // evaluated for population representativeness` describe work no code
        // in this handler does. The comparison line reported a count without
        // saying that the count is routinely zero: findSimilarProtocols reads
        // the `protocols` table, which has no INSERT anywhere in this
        // repository (ledger L167), so on any real deployment it is empty and
        // the sentence read "Compared against database of 0 similar protocols"
        // — an assertion of comparison, with nothing compared.
        section: 'Evidence Base',
        insights: [
          // Three cases, not two. `indication` became optional on 2026-09-10
          // (the analyser stopped defaulting it), so "no comparison" now has
          // two distinct causes and quoting an absent value would have rendered
          // the literal string indication "undefined".
          !protocolData.indication
            ? 'This protocol does not state an indication, so no comparison against prior protocols could be attempted'
            : similarProtocols.length > 0
              ? `Compared against ${similarProtocols.length} stored protocol(s) matching indication "${protocolData.indication}"`
              : `No stored protocol matched indication "${protocolData.indication}", so no comparison against prior protocols was performed`,
          'Regulatory guideline references for FDA, EMA, PMDA and Health Canada are listed under global_regulations. They are a fixed reference set, not a per-protocol assessment.',
        ],
        citations: [
          'ICH E9: Statistical Principles for Clinical Trials',
          'FDA Guidance for Industry: E6(R2) Good Clinical Practice',
        ],
      },
      {
        // `based on similar trials` asserted the same absent comparison set.
        // What this handler genuinely produces is the narrative analysis in
        // detailed_analysis; the qualitative points below are guidance, and are
        // labelled as such rather than as findings about THIS protocol.
        section: 'Risk Assessment',
        insights: [
          'Narrative assessment of design, endpoints, statistics and operational risk is returned in detailed_analysis.',
          'The points below are standing regulatory guidance, not findings derived from this protocol.',
        ],
        citations: [
          'FDA. (2023). Considerations for the Development of Rare Disease Drugs. Guidance for Industry. https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
        ],
      },
    ];

    // ACADEMIC CITATIONS REMOVED — they were manufactured, per request.
    //
    // This block built three "references" by interpolating the caller's own
    // indication and phase into title templates ('Endpoint selection for
    // regulatory approval in ' + protocolData.indication), then attached fixed
    // authors, journal, year, volume, pages and a DOI. A DOI is a resolvable
    // identifier for one specific published work; minting one is not citation
    // formatting, it is manufacturing evidence, and this product exists to
    // assemble filings for regulators.
    //
    // Nothing replaces it. A literature search is a capability this handler
    // does not have, and an empty, honest response is the correct output of a
    // search that was never run. `academic_citations` is therefore gone from
    // the response rather than emitted empty, so no consumer can read absence
    // as "we looked and found nothing".
    //
    // scripts/ci/check-no-mock-in-prod-routes.mjs now refuses any hardcoded DOI
    // in server/routes/**, which is what would have caught this.

    // IND readiness: NOT ASSESSED. Nothing in this handler assesses it.
    //
    // WO-16C finding 65, 2026-09-11. This object was a literal that read
    // neither `content`, nor `protocolData`, nor `detailedAnalysis`, and it
    // stated, about whatever was submitted:
    //
    //   strengths: 'Well-defined primary and secondary endpoints'
    //              'Clear inclusion/exclusion criteria'
    //              'Appropriate statistical analysis plan'
    //              'Adequate safety monitoring provisions'
    //   regulatory_guidance[0..2]:
    //              'Aligns with FDA guidance for Phase 2 trials in this
    //               indication'
    //              'Consistent with ICH E6(R2) requirements for Good Clinical
    //               Practice'
    //              'Meets basic requirements for EMA Scientific Advice
    //               submissions'
    //
    // — for a Phase 1 protocol, for a Phase 3 protocol, for a protocol with no
    // endpoint, for the string 'hello'. They are adequacy and alignment
    // verdicts on a document nobody read, and they are written to
    // exports/<session_id>/analysis_results.json with the caller's session id
    // on them. They are removed, not relabelled: a verdict nothing computed
    // has no truthful phrasing. (The identical four strengths and the same
    // Phase 2 claim were removed from the client's own `genIndReadiness` in
    // 6866d4fb1; this was the server twin.) The old comment here called them
    // "static regulatory guidance", which was true of `citations` and of
    // nothing else.
    //
    // What survives is what this handler actually has: a standing checklist of
    // topics, each naming the published document that governs it. It is
    // labelled as standing guidance — the same treatment `dropoutPrediction`
    // below already carries — so no consumer can read it as a finding about
    // their protocol. The former `improvement_areas` strings ('Additional
    // details needed on…', 'Strengthen…', 'Expand on…') presupposed a
    // deficiency in a protocol that was never read, so they are stated as the
    // topics they are. `status` uses the repo's third state
    // (server/lib/verification-outcome.ts; the NOT_ASSESSED frameworks in
    // routes/decision-lineage.ts): not adequate, not inadequate — not
    // assessed. `score` stays null until a real scorer is connected.
    const indAnalysis = {
      title: 'IND Readiness Assessment',
      status: 'NOT_ASSESSED' as const,
      score: null as number | null,
      basis:
        'No IND-readiness assessment was performed: this endpoint has no IND-readiness scorer wired. The items below are standing regulatory guidance, not derived from this protocol and not an assessment of it.',
      standing_guidance: [
        'Concomitant medication management (FDA 21 CFR 312.23(a)(6))',
        'Interim analysis points (ICH E9, Section 4.5)',
        'Data management plan (ICH E6(R2), Section 5.5)',
        'Randomization implementation details (EMA Guideline on multiplicity issues)',
        'Ethnic factors for a PMDA submission (PMDA: Points to Consider for Ethnic Factors)',
      ],
      citations: [
        'U.S. Food and Drug Administration. (2023). IND Application Procedures: Clinical Hold. 21 CFR 312.42',
        'European Medicines Agency. (2022). Guideline on the clinical evaluation of anticancer medicinal products. EMA/CHMP/205/95 Rev.6',
        'ICH. (2016). Integrated Addendum to ICH E6(R1): Guideline for Good Clinical Practice E6(R2)',
        'Health Canada. (2022). Clinical Trial Applications for pharmaceuticals: Sections 5.14 (Statistical Methods)',
      ],
    };

    // Qualitative dropout-risk factors with references. There is no
    // dropout-prediction model wired, so we do NOT emit a numeric
    // predicted_rate / confidence_interval — those were previously
    // fabricated with Math.random() yet dressed with academic citations,
    // which is the dangerous case. The qualitative factors and mitigation
    // strategies below are real guidance and remain.
    //
    // The per-factor `citation` fields are gone with them. This handler runs no
    // literature search, so it did not consult those papers — whether or not
    // they exist is beside the point, and verifying them is not the remedy: a
    // reference the code never looked up must not be presented as the basis of
    // its advice. Two of the three carried a DOI. The qualitative factors
    // themselves are standing guidance and are kept, now labelled as guidance
    // rather than as evidence about THIS protocol.
    const dropoutPrediction = {
      predicted_rate: null as string | null,
      confidence_interval: null as [string, string] | null,
      basis: 'Standing guidance on dropout risk. Not derived from this protocol, and not a prediction for it.',
      factors: [
        {
          name: 'Treatment duration',
          impact: 'High',
          guidance: 'Longer trials (>20 weeks) are generally associated with higher dropout.',
        },
        {
          name: 'Visit frequency',
          impact: 'Medium',
          guidance: 'Visit cadence trades participant burden against engagement.',
        },
        {
          name: 'Procedures per visit',
          impact: 'Medium',
          guidance: 'Assessment burden per visit is a known driver of withdrawal.',
        },
      ],
      // Regulatory guidance documents are named (they are identifiable
      // published standards a reader can pull); the journal reference that
      // stood beside them is removed on the same ground as the others.
      mitigation_strategies: [
        'Implement a patient retention programme with reminders',
        'Consider reducing visit burden where scientifically valid (FDA Patient-Focused Drug Development Guidance, 2023)',
        'Plan for higher dropout in site selection and enrolment targets (EMA Guideline on Missing Data, EMA/CPMP/EWP/1776/99 Rev. 1)',
        'Maintain contact between visits through patient-engagement tooling',
      ],
    };

    // Generate response
    const response = {
      success: true,
      session_id: session_id,
      protocol_data: protocolData,
      similar_protocols: similarProtocols,
      detailed_analysis: detailedAnalysis,
      wisdom_trace: wisdomTrace,
      ind_analysis: indAnalysis,
      dropout_prediction: dropoutPrediction,
      global_regulations: globalRegulationsData,
      timestamp: new Date().toISOString(),
    };

    // Save the analysis results for later retrieval
    const resultsPath = path.join(sessionDir, 'analysis_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(response, null, 2));

    // Return the response
    res.json(response);
  } catch (error) {
    log.error('Error in demo analysis:', error);
    return serverError(res, log, 'saving demo analysis', error);
  }
});

export default router;
