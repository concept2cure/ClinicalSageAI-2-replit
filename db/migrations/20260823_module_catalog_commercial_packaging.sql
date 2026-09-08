-- Apply commercial packaging to the module catalog.
--
-- 20260810_reconcile_module_catalog.sql seeded all 84 modules UNRESTRICTED
-- ({"tiers": [], "industries": []}) and said so plainly: "Commercial packaging
-- (which app sits in which tier, for which industry) is a business decision and
-- is deliberately left to be applied later rather than guessed here." This is
-- that decision. Nothing here is guessed either: every assignment traces to a
-- tier boundary this repository has ALREADY committed to, cited per group below.
--
-- ── The three sources this is derived from ──────────────────────────────────
--
-- 1. server/services/billing.ts PRICING[] — the per-tier `features` arrays that
--    are already the sold promise on the pricing surface:
--      pharma   Standard: AI Copilot · eCTD Authoring · CER Generation ·
--                         510(k) Module · Compliance Analysis
--               Professional: + Advanced Analytics · Custom Workflows ·
--                         All Integrations · SAML SSO
--               Enterprise: + Custom AI Models · On-Prem · Compliance Audit Pack
--      medtech  Standard: 510(k) Workflow · CER · Predicate Intelligence ·
--                         eSTAR Builder · GSPR Mapping
--               Professional: + EU MDR/IVDR Support · Advanced Analytics · SSO
--      academic Research: Literature Review · Protocol Design · Basic CER ·
--                         Evidence Synthesis
--               Department: + Biostatistics Module · Advanced Analytics
--    Read together these define the ladder as: STANDARD is "do the work",
--    PROFESSIONAL is "scale and intelligence", ENTERPRISE is "govern and
--    control". Every group below is placed against that shape.
--
-- 2. server/services/license-manager.ts FEATURE_TIER_MAP — already committed:
--      standard      deep_research · csr_builder · ectd_authoring ·
--                    safety_narrative · intelligent_reports
--      professional  ctd_builder · multi_agency_export · document_builder ·
--                    biostatistics
--      enterprise    sso · api_access
--
-- 3. server/services/entitlements/mdx-entitlements.ts — the tested matrix:
--      standard      report_families · device_assembly_readiness ·
--                    global_market_planner · ana_advisory
--      professional  prediction_forecast_report · crl_rtf_premortem ·
--                    scheduled_reports
--      enterprise    portfolio_rollup
--
-- ── What is deliberately NOT done here ─────────────────────────────────────
--
-- `industries` stays []. Industry is a RELEVANCE filter, not a licence: the
-- shell's segment switcher already scopes what a medtech or biopharma customer
-- sees. Gating on it would fill a pharma customer's catalog with greyed device
-- modules that NO purchase can ever unlock — the one lock with no remedy, which
-- is the one lock that should not exist. If industry scoping is ever wanted it
-- belongs in the segment model, not the entitlement layer.
--
-- Existing subscriptions are NOT revoked. An organization that already carries
-- `module_subscriptions.enabled = true` for a module keeps it: that row is an
-- explicit, auditable grant, and resolveNavEntitlements reads it before it
-- reads tier. Customers are grandfathered by construction; the ladder governs
-- newly provisioned organizations and anything provisioned from here on. A
-- consequence worth stating out loud: on a database whose orgs were already
-- blanket-provisioned while the catalog was unrestricted, this migration
-- changes nothing visible until those orgs are re-provisioned. That is the
-- correct default — silently repossessing capability from a paying customer is
-- not something a migration should do on its own.
--
-- Two ids are absent from the catalog entirely and stay that way: `audit-trail`
-- and `part11-console`. 21 CFR §11.10(e) requires an audit trail users cannot
-- switch off, so neither may become something an organization can be sold or an
-- admin can disable. They are unconditionally available and carry no row here.
--
-- ── FOUR THINGS THIS MIGRATION SURFACES BUT DOES NOT FIX ───────────────────
--
-- 1. `electronic_signatures` is 'enterprise' in FEATURE_TIER_MAP. Every
--    governed action in this product is e-signed, so read literally a standard
--    customer cannot approve anything. That is a FEATURE-tier question, not a
--    module-tier one, and it is not changed here — but it needs an answer
--    before this packaging is switched on for a real customer.
-- 2. `design-controls` and `human-factors` are real MDX registers declared
--    `mdx` in NAV_GROUP_OF, with NO catalog row. They are therefore unsellable
--    and ungatable — neither priced nor lockable. Either seed them or decide
--    they are permanently unrestricted.
-- 3. requireModule() gates no route (noted in 20260810 and still true). This
--    packaging changes what the rail shows and what provisioning grants; it
--    does not block an API call. Presentation-level entitlement is what was
--    asked for and what this delivers; enforcement is separate work.
-- 4. Nine catalog rows still carry stale `readiness: 'kit-only'` and several
--    carry stale descriptions ("In progress.", "no UI yet") copied from the
--    surface registry. Those strings must not become pricing copy.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
-- Data-only, one transaction, no DDL. To revert, set every `tiers` back to []:
--   UPDATE available_modules
--      SET metadata = jsonb_set(metadata::jsonb, '{tiers}', '[]'::jsonb)::json;
-- That restores the unrestricted catalog exactly, and destroys nothing: no
-- subscription row is touched by this migration in either direction.

BEGIN;

-- One row per module: the LOWEST tier that includes it. provision_org_modules()
-- and getModuleCatalog() both read this inclusively (tier >= lowest listed), so
-- a single value per module expresses "this tier and everything above it".
CREATE TEMP TABLE module_packaging (module_id TEXT PRIMARY KEY, min_tier TEXT NOT NULL)
  ON COMMIT DROP;

INSERT INTO module_packaging (module_id, min_tier) VALUES
  -- == FREE (Researcher: 1 user, 2 projects, 1 GB, 5 deep-research credits) ==
  -- Evaluation, and the shape this market gives away: READ and SEARCH, never
  -- governed output. A prospect can open the FDA CRL library, run
  -- predicate/precedent searches, do bounded deep research and keep the results
  -- -- but authors nothing and files nothing. deep-research sits here rather
  -- than at standard (FEATURE_TIER_MAP says 'standard') because the credit grid
  -- already caps it at 5 runs on free; gating it twice would turn the free tier
  -- into a wall of locks instead of a demonstration.
  --
  -- authoring-engine, filings-catalog and intelligence-catalog are here for a
  -- different reason: they render NO organization data at all (verified -- no
  -- fetch in AuthoringEngine.tsx, a static FILINGS_TAXONOMY, and a static tool
  -- registry). They are reference and wayfinding pages. Selling a static page
  -- is not something to do at any tier.
  ('artifacts-center', 'free'),
  ('authoring-engine', 'free'),
  ('crl-library', 'free'),
  ('deep-research', 'free'),
  ('evidence-search', 'free'),
  ('filings-catalog', 'free'),
  ('intelligence-catalog', 'free'),
  ('precedent-intelligence', 'free'),
  ('projects', 'free'),
  ('tasks', 'free'),
  ('template-library', 'free'),
  ('vault', 'free'),

  -- == STANDARD ($499/mo DTC | $459/user pharma | $349/user medtech) ==
  -- "Do the work." The whole authoring-to-filing path for a company running its
  -- own programs, on both the biopharma and the device side.
  --
  -- This group is large ON PURPOSE, and it is the central commercial judgment in
  -- this file. The most consistent complaint about incumbent RIM vendors is
  -- per-module unbundling: a small or virtual biotech cannot assemble a working
  -- submission path without licensing four or five separate applications.
  -- Splitting the authoring path across tiers here would reproduce exactly that
  -- -- and it competes where those incumbents are strongest, since they hold the
  -- enterprise relationships that make unbundling survivable.
  --
  -- It is also what this repo already sells: billing.ts puts eCTD Authoring, CER
  -- Generation, the 510(k) module, Predicate Intelligence, eSTAR and GSPR
  -- mapping in STANDARD; FEATURE_TIER_MAP puts ectd_authoring, csr_builder,
  -- safety_narrative and intelligent_reports there; mdx-entitlements adds
  -- report_families, device_assembly_readiness, global_market_planner and
  -- ana_advisory -- which is why insights and global-ri are here.
  --
  -- AI authoring is the ENTRY hook, not the premium wall. Every vendor in this
  -- category now leads with an AI copilot; charging extra for it prices against
  -- the market's floor rather than its ceiling. The moat is prediction and
  -- portfolio, and both are priced above.
  --
  -- decision-lineage is here rather than higher deliberately: it is traceability
  -- for how a governed decision was reached, and putting traceability behind an
  -- upsell in a regulated tool is the wrong instinct even where it would sell.
  -- report-governance joins it for the same reason (and carries a declared
  -- 'standard' signal): sealed-report integrity verification is how a governed
  -- output is shown to be intact, and that is a record, not a feature.
  --
  -- THREE PLACES THIS DELIBERATELY OVERRIDES A DECLARED SIGNAL, each because
  -- honouring it would break the core filing path -- the exact unbundling this
  -- tier exists to refuse:
  --   cmc            FEATURE_TIER_MAP cmc_blueprint:'professional'. But an IND
  --                  without Module 3 is not an IND. The BLUEPRINT feature can
  --                  stay professional; the Module 3 workspace cannot.
  --   ectd-compile   ctd_builder / multi_agency_export are 'professional'. If a
  --                  customer can author but cannot produce the submission, they
  --                  have bought nothing. MULTI-REGION dispatch is what carries
  --                  the professional signal, and gateway-transmittals holds it.
  --   document-authoring  document_builder:'professional' (license-manager.ts)
  --                  vs document_generation:'standard' (ana-platform-controller).
  --                  Two declarations disagree; the document editor is the core
  --                  work surface, so it resolves to standard.
  ('agency-meetings', 'standard'),
  ('batch-draft', 'standard'),
  ('change-assessment', 'standard'),
  ('clinical-ops', 'standard'),
  ('cmc', 'standard'),
  ('communication-center', 'standard'),
  ('csr-workflow', 'standard'),
  ('decision-lineage', 'standard'),
  ('device-510k', 'standard'),
  ('device-cer', 'standard'),
  ('device-clinical-studies', 'standard'),
  ('device-diagnostics', 'standard'),
  ('device-engineering', 'standard'),
  ('device-pma', 'standard'),
  ('device-presub', 'standard'),
  ('device-software', 'standard'),
  ('device-submission', 'standard'),
  ('device-tasks', 'standard'),
  ('device-udi', 'standard'),
  ('device-validation', 'standard'),
  ('device-vault', 'standard'),
  ('device-workstream', 'standard'),
  ('dispatch-readiness', 'standard'),
  ('doc-journey', 'standard'),
  ('document-authoring', 'standard'),
  ('dossier', 'standard'),
  ('dossier-map', 'standard'),
  ('ectd-coauthor', 'standard'),
  ('ectd-compile', 'standard'),
  ('global-ri', 'standard'),
  ('haq-manager', 'standard'),
  ('inconsistency', 'standard'),
  ('ind-checklist', 'standard'),
  ('insights', 'standard'),
  ('ivd-completeness', 'standard'),
  ('labeling', 'standard'),
  ('labeling-pi', 'standard'),
  ('maa-cockpit', 'standard'),
  ('nda-cockpit', 'standard'),
  ('nonclinical', 'standard'),
  ('pdev', 'standard'),
  ('program-journey', 'standard'),
  ('protocol-dev', 'standard'),
  ('pyramid', 'standard'),
  ('quality', 'standard'),
  ('reg-change', 'standard'),
  ('registrations', 'standard'),
  ('report-governance', 'standard'),
  ('research-admin', 'standard'),
  ('review', 'standard'),
  ('risk', 'standard'),
  ('safety-narrative', 'standard'),
  ('source-tracer', 'standard'),
  ('submission-center', 'standard'),

  -- == PROFESSIONAL ($1,499/mo DTC | $399/user pharma | $299/user medtech) ==
  -- "Scale and intelligence." What a company needs once it runs more than one
  -- program, or has a marketed product to keep -- not what it needs to file.
  --
  -- Anchored to billing.ts Professional ("Advanced Analytics", "Custom
  -- Workflows", "All Integrations", "EU MDR/IVDR Support"; academic Department
  -- adds the "Biostatistics Module"), to FEATURE_TIER_MAP (biostatistics,
  -- multi_agency_export, ctd_builder, document_builder) and to mdx-entitlements
  -- (prediction, scheduled/drift reporting).
  --
  --   biostatistics, biostat-workbench     FEATURE_TIER_MAP biostatistics:professional
  --   pharmacovigilance, pv-cockpit        post-approval; a pre-approval company has no PV obligation
  --   rbm                                  multi-study clinical operations
  --   device-postmarket, device-analytics  PMS/PMCF + "Advanced Analytics"
  --   market-access, reg-change,
  --   lifecycle-mgmt, pediatric, orphan    lifecycle and strategy: value after a first filing, not before
  --   orchestration                        billing.ts "Custom Workflows"
  --   shadow-review, submission-twin       predictive review simulation -- the prediction moat
  --   gateway-transmittals                 FEATURE_TIER_MAP multi_agency_export:professional
  --   qmp                                  quality-management PROGRAMS, not the compliance record
  ('biostat-workbench', 'professional'),
  ('biostatistics', 'professional'),
  ('device-analytics', 'professional'),
  ('device-postmarket', 'professional'),
  ('gateway-transmittals', 'professional'),
  ('lifecycle-mgmt', 'professional'),
  ('market-access', 'professional'),
  ('orchestration', 'professional'),
  ('orphan', 'professional'),
  ('pediatric', 'professional'),
  ('pharmacovigilance', 'professional'),
  ('pv-cockpit', 'professional'),
  ('qmp', 'professional'),
  ('rbm', 'professional'),
  ('shadow-review', 'professional'),
  ('submission-twin', 'professional'),

  -- == ENTERPRISE (custom) ==
  -- "Govern and control." Deliberately only two modules, because most of what
  -- billing.ts sells at Enterprise is not a module at all -- Custom AI Models,
  -- On-Prem, Dedicated CSM, SLA, Custom Validations and the Compliance Audit
  -- Pack are services and deployment options, and minting catalog rows for them
  -- would be fiction.
  --
  -- What genuinely belongs behind the enterprise wall is the universal B2B SaaS
  -- pattern, used by every serious vendor inside and outside this category:
  --   identity-console   enterprise SSO / SCIM -- FEATURE_TIER_MAP sso:enterprise
  --   cro-portfolio      cross-sponsor / multi-client portfolio rollup --
  --                      mdx-entitlements portfolio_rollup:enterprise. The CRO
  --                      and holding-company surface, and the one capability
  --                      whose cost genuinely scales with the buyer's size.
  --
  -- A thin enterprise tier is the intended outcome, not an oversight. Enterprise
  -- is sold here on deployment, validation and support -- not by holding the
  -- product's actual work hostage.
  ('cro-portfolio', 'enterprise'),
  ('identity-console', 'enterprise');

-- Fail loudly rather than half-applying. A module id that has drifted out of
-- the catalog, or a catalog row this packaging never classified, both mean the
-- two files have diverged — and a silently partial packaging is precisely the
-- state that is hardest to notice later.
DO $$
DECLARE
  v_unknown TEXT;
  v_unclassified TEXT;
BEGIN
  SELECT string_agg(p.module_id, ', ' ORDER BY p.module_id) INTO v_unknown
  FROM module_packaging p
  LEFT JOIN available_modules m USING (module_id)
  WHERE m.module_id IS NULL;

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'packaging names modules that are not in available_modules: %', v_unknown;
  END IF;

  SELECT string_agg(m.module_id, ', ' ORDER BY m.module_id) INTO v_unclassified
  FROM available_modules m
  LEFT JOIN module_packaging p USING (module_id)
  WHERE p.module_id IS NULL
    AND COALESCE((m.metadata::jsonb->>'deprecated')::boolean, false) = false;

  IF v_unclassified IS NOT NULL THEN
    RAISE EXCEPTION 'catalog modules with no tier assigned: %', v_unclassified;
  END IF;
END $$;

-- Set `tiers` and leave every other metadata key alone — `deprecated` on the
-- retired legacy rows above all, which getModuleCatalog and (as of
-- 20260823_fix_provision_org_modules_tier_ladder.sql) provision_org_modules
-- both filter on. jsonb_set on the parsed object, cast back to `json`, because
-- the column is `json`.
UPDATE available_modules m
   SET metadata = jsonb_set(
         COALESCE(m.metadata::jsonb, '{}'::jsonb),
         '{tiers}',
         to_jsonb(ARRAY[p.min_tier])
       )::json,
       updated_at = NOW()
  FROM module_packaging p
 WHERE p.module_id = m.module_id;

COMMIT;
