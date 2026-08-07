-- ═══════════════════════════════════════════════════════════════════════════════
-- anda:fda and ide:fda — two filing types that were not filing types
--
-- WHAT THIS CLOSES
-- `anda` and `ide` were accepted by VALID_PROGRAM_TYPES in
-- server/routes/c2c/projects.ts, so POST /api/c2c/projects created the project
-- happily. They were then absent from PROGRAM_TO_DOC_TYPE, so
-- resolveDocumentClass() returned null, so scaffoldProjectDocuments() declined
-- and the project got no governed document at all.
--
-- That is a worse shape than a rejection. A generics company creating its first
-- ANDA got a project, a name, a team, an audit row — and an empty Vault, with
-- nothing anywhere reporting a problem. The fail-closed behaviour in
-- document-class.ts is correct and stays correct; what was missing is the thing
-- it was failing closed AROUND. This supplies it.
--
-- The doc_type CHECK is widened in the same file because 'anda' and 'ide' were
-- not legal values of c2c_documents.doc_type either. Mapping them without the
-- widening would move the failure from "no document" to "constraint violation
-- at insert" — later, louder, and no more useful.
--
-- ── Why widening a CHECK is safe ──────────────────────────────────────────────
-- The new predicate is a strict superset of the old one, so no existing row can
-- be invalidated by it: every value that satisfied the old IN-list satisfies the
-- new one. This is not true of CHECK changes in general and is the reason this
-- one needs no data migration, no backfill and no down-migration beyond the
-- symmetric narrowing (which WOULD be unsafe once anda/ide rows exist, and is
-- therefore deliberately not written here).
--
-- ── Why these two shapes and not M1-M5 ────────────────────────────────────────
-- An ANDA *is* a CTD — 21 CFR 314.94 files it in eCTD through the ESG — but it
-- is a four-module one. There is no Module 4: a generic drug application
-- substitutes bioequivalence for nonclinical pharmacology and toxicology, which
-- is the entire premise of the abbreviated pathway. Its Module 1 also carries
-- items no NDA has — the RLD basis (1.12.11), the side-by-side labeling
-- comparison (1.14.3) and the Paragraph I-IV patent certification (1.15.2) —
-- and its Module 5 is essentially 5.3.1.2 alone. Asserting M1-M5 of it would be
-- asserting the wrong shape, so the contract test excludes it by name alongside
-- cta.
--
-- An IDE under 21 CFR 812.20 is not a CTD at all. It is a lettered set (A-K)
-- defined by the regulation itself, built around the report of prior
-- investigations (812.27) and the investigational plan (812.25). Forcing eCTD
-- modules onto it would be a fabrication.
--
-- ── Why new versions rather than updates ──────────────────────────────────────
-- Same reason as 20260804 and 20260806: c2c_rule_packs is keyed
-- (doc_type, agency, version) and c2c_documents carries a composite FK to it.
-- Neither pack exists yet, so there is nothing to supersede — but the INSERTs
-- are written the same way so the next revision of them is a new version too.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Guarded exactly as 20260804 and 20260806 are: this file lives in the durable
-- apply-set (scripts/db/migration-set.mjs), which runs against databases that
-- may never have had the Phase 9 schema applied — c2c_rule_packs and
-- c2c_documents are created by drizzle push from shared/schema.ts, not by a
-- migration in the set. Without the guard the whole set fails on
-- 'relation c2c_rule_packs does not exist', which is how the tenant-isolation
-- sweep caught the CTA migration before it shipped.
DO $mig$
BEGIN
  IF to_regclass('public.c2c_documents') IS NOT NULL THEN
    -- DROP ... IF EXISTS because on a drizzle-push database the table exists
    -- but the named constraint does not: shared/schema.ts declares doc_type as
    -- a bare `text('doc_type').notNull()` with no CHECK. Adding the widened
    -- constraint there too would be an improvement, but it belongs in the
    -- schema module, not in a migration that would then fight it.
    ALTER TABLE c2c_documents DROP CONSTRAINT IF EXISTS c2c_documents_doc_type_check;
    ALTER TABLE c2c_documents ADD CONSTRAINT c2c_documents_doc_type_check
      CHECK (doc_type IN ('ind','cta','nda','anda','bla','maa','jnda','k510','denovo','pma',
                          'ide','cer','psur','ib','protocol','csr','briefing','mod3','mod2','haq'));
  END IF;

  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping anda:fda and ide:fda outlines';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('anda', 'fda', 'fda-anda-21cfr314-94-v1.0',
     'ANDA × FDA · 21 CFR 314.94 (eCTD M1, M2, M3, M5)',
     '[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative information (US)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Forms (FDA 356h, 3674)","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Administrative information","mandatory":true,"path_order":4},{"key":"1.3.5","parent_key":"1.3","label":"Field copy certification","mandatory":false,"path_order":5},{"key":"1.4","parent_key":"M1","label":"References","mandatory":false,"path_order":6},{"key":"1.5","parent_key":"M1","label":"Application status","mandatory":false,"path_order":7},{"key":"1.6","parent_key":"M1","label":"Meetings","mandatory":false,"path_order":8},{"key":"1.7","parent_key":"M1","label":"Fast track / expedited","mandatory":false,"path_order":9},{"key":"1.12","parent_key":"M1","label":"Other correspondence","mandatory":false,"path_order":10},{"key":"1.12.11","parent_key":"1.12","label":"Basis for ANDA submission — reference listed drug (RLD)","mandatory":true,"path_order":11},{"key":"1.12.12","parent_key":"1.12","label":"Comparison between generic drug and RLD","mandatory":true,"path_order":12},{"key":"1.12.14","parent_key":"1.12","label":"Environmental analysis / categorical exclusion","mandatory":true,"path_order":13},{"key":"1.12.15","parent_key":"1.12","label":"Request for waiver of in vivo bioavailability studies","mandatory":false,"path_order":14},{"key":"1.14","parent_key":"M1","label":"Labeling","mandatory":true,"path_order":15},{"key":"1.14.1","parent_key":"1.14","label":"Draft labeling","mandatory":true,"path_order":16},{"key":"1.14.3","parent_key":"1.14","label":"Labeling comparison with RLD (side-by-side)","mandatory":true,"path_order":17},{"key":"1.15","parent_key":"M1","label":"Patent and exclusivity","mandatory":true,"path_order":18},{"key":"1.15.1","parent_key":"1.15","label":"Patent information","mandatory":true,"path_order":19},{"key":"1.15.2","parent_key":"1.15","label":"Patent certification (Paragraph I / II / III / IV)","mandatory":true,"path_order":20},{"key":"1.15.3","parent_key":"1.15","label":"Exclusivity statement","mandatory":true,"path_order":21},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":22},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":23},{"key":"2.7","parent_key":"M2","label":"Clinical summary — bioequivalence","mandatory":true,"path_order":24},{"key":"2.7.1","parent_key":"2.7","label":"Summary of biopharmaceutic studies and analytical methods","mandatory":true,"path_order":25},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":26},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":27},{"key":"3.2.S.1","parent_key":"3.2.S","label":"General information","mandatory":true,"path_order":28},{"key":"3.2.S.2","parent_key":"3.2.S","label":"Manufacture","mandatory":true,"path_order":29},{"key":"3.2.S.3","parent_key":"3.2.S","label":"Characterisation","mandatory":true,"path_order":30},{"key":"3.2.S.4","parent_key":"3.2.S","label":"Control of drug substance","mandatory":true,"path_order":31},{"key":"3.2.S.7","parent_key":"3.2.S","label":"Stability","mandatory":true,"path_order":32},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":33},{"key":"3.2.P.1","parent_key":"3.2.P","label":"Description and composition","mandatory":true,"path_order":34},{"key":"3.2.P.2","parent_key":"3.2.P","label":"Pharmaceutical development","mandatory":true,"path_order":35},{"key":"3.2.P.3","parent_key":"3.2.P","label":"Manufacture","mandatory":true,"path_order":36},{"key":"3.2.P.4","parent_key":"3.2.P","label":"Control of excipients","mandatory":true,"path_order":37},{"key":"3.2.P.5","parent_key":"3.2.P","label":"Control of drug product","mandatory":true,"path_order":38},{"key":"3.2.P.7","parent_key":"3.2.P","label":"Container closure system","mandatory":true,"path_order":39},{"key":"3.2.P.8","parent_key":"3.2.P","label":"Stability","mandatory":true,"path_order":40},{"key":"3.2.R","parent_key":"M3","label":"Regional information (executed batch records, comparability protocols)","mandatory":true,"path_order":41},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical study reports","mandatory":true,"path_order":42},{"key":"5.3.1","parent_key":"M5","label":"Reports of biopharmaceutic studies","mandatory":true,"path_order":43},{"key":"5.3.1.2","parent_key":"5.3.1","label":"Comparative bioavailability and bioequivalence study reports","mandatory":true,"path_order":44},{"key":"5.3.1.4","parent_key":"5.3.1","label":"Reports of bioanalytical and analytical methods","mandatory":true,"path_order":45},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":46}]'::jsonb,
     'ESG',
     now()),
    ('ide', 'fda', 'fda-ide-21cfr812-20-v1.0',
     'IDE × FDA · 21 CFR 812.20 (lettered set A-K)',
     '[{"key":"A","parent_key":null,"label":"A · Name and address of sponsor","mandatory":true,"path_order":1},{"key":"B","parent_key":null,"label":"B · Report of prior investigations (21 CFR 812.27)","mandatory":true,"path_order":2},{"key":"B.1","parent_key":"B","label":"Published and unpublished reports of prior clinical, animal and laboratory testing","mandatory":true,"path_order":3},{"key":"B.2","parent_key":"B","label":"Bibliography of relevant publications","mandatory":true,"path_order":4},{"key":"B.3","parent_key":"B","label":"Summary of prior investigations and conclusions","mandatory":true,"path_order":5},{"key":"C","parent_key":null,"label":"C · Investigational plan (21 CFR 812.25)","mandatory":true,"path_order":6},{"key":"C.1","parent_key":"C","label":"Purpose — name and intended use of the device, objectives and duration","mandatory":true,"path_order":7},{"key":"C.2","parent_key":"C","label":"Protocol — methodology, subject selection, endpoints","mandatory":true,"path_order":8},{"key":"C.3","parent_key":"C","label":"Risk analysis — risks, minimisation, justification of the investigation","mandatory":true,"path_order":9},{"key":"C.4","parent_key":"C","label":"Description of the device — each important component and property","mandatory":true,"path_order":10},{"key":"C.5","parent_key":"C","label":"Monitoring procedures and monitor''s written commitments","mandatory":true,"path_order":11},{"key":"C.6","parent_key":"C","label":"Labeling — CAUTION: Investigational device statement","mandatory":true,"path_order":12},{"key":"C.7","parent_key":"C","label":"Consent materials — informed consent form and process","mandatory":true,"path_order":13},{"key":"C.8","parent_key":"C","label":"IRB information — names, addresses and chairpersons","mandatory":true,"path_order":14},{"key":"C.9","parent_key":"C","label":"Other institutions where the device will be investigated","mandatory":false,"path_order":15},{"key":"D","parent_key":null,"label":"D · Manufacturing information — methods, facilities and controls","mandatory":true,"path_order":16},{"key":"E","parent_key":null,"label":"E · Investigator agreements and certification (21 CFR 812.43)","mandatory":true,"path_order":17},{"key":"E.1","parent_key":"E","label":"Signed investigator agreements","mandatory":true,"path_order":18},{"key":"E.2","parent_key":"E","label":"Certification that all investigators have signed","mandatory":true,"path_order":19},{"key":"E.3","parent_key":"E","label":"List of the names and addresses of all investigators","mandatory":true,"path_order":20},{"key":"F","parent_key":null,"label":"F · IRB certification / list of IRBs","mandatory":true,"path_order":21},{"key":"G","parent_key":null,"label":"G · Sales information — amount to be charged and justification","mandatory":false,"path_order":22},{"key":"H","parent_key":null,"label":"H · Environmental assessment or claim of categorical exclusion","mandatory":true,"path_order":23},{"key":"I","parent_key":null,"label":"I · Labeling","mandatory":true,"path_order":24},{"key":"J","parent_key":null,"label":"J · Informed consent materials as they will be presented","mandatory":true,"path_order":25},{"key":"K","parent_key":null,"label":"K · Additional records and reports the sponsor will maintain","mandatory":false,"path_order":26}]'::jsonb,
     -- Not 'ESG'. An IDE is a CDRH submission and goes through the CDRH
     -- Customer Collaboration Portal, not the eCTD gateway an ANDA uses.
     -- Naming the wrong channel here would be a false statement in a table the
     -- submission path reads.
     'CDRH-Portal',
     now())
  ON CONFLICT (doc_type, agency, version) DO NOTHING;
END
$mig$;
