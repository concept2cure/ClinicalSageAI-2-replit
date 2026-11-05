/** Executes the full shared resolver + server enrichment. Catalog/license
 * collaborators below are explicit synthetic substitutes, not regulatory
 * evidence, actual tenant data, or proof of server authorization. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require(process.env.C2C_TS_PATH || 'typescript');
const root = path.resolve(process.env.C2C_WORKSPACE_SOURCE_ROOT || path.join(__dirname, '../..'));
const CONFIG = 'shared/regulatory/workspace-config.ts';
const ENRICH = 'server/services/regulatory/workspace-config-enrichment.ts';

function load(relative, dependencies) {
  const filename = path.join(root, relative);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, 'Transpile diagnostics: ' + errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const module = { exports: {} };
  const requireFixture = name => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Unmodelled collaborator ${name}`);
    return dependencies[name];
  };
  new Function('require', 'module', 'exports', '__filename', '__dirname', compiled.outputText)(
    requireFixture, module, module.exports, filename, path.dirname(filename));
  return module.exports;
}

function harness() {
  const entries = {};
  for (const [id, product, family, region, standard] of [
    ['US_IND', 'small_molecule', 'clinical_trial', 'US', 'eCTD'],
    ['US_BLA', 'biologic', 'marketing_authorization', 'US', 'eCTD'],
    ['US_510K', 'medical_device', 'device_clearance', 'US', 'eSTAR'],
    ['US_510K_IVD', 'ivd', 'device_clearance', 'US', 'eSTAR'],
    ['EU_MAA', 'small_molecule', 'marketing_authorization', 'EU', 'eCTD'],
    ['JP_MKT_APPROVAL', 'small_molecule', 'marketing_authorization', 'JP', 'eCTD'],
    ['CA_NDS', 'small_molecule', 'marketing_authorization', 'CA', 'eCTD'],
    ['AU_CTA', 'small_molecule', 'clinical_trial', 'AU', 'regional'],
  ]) entries[id] = { id, displayName: `Synthetic ${id}`, region, agency: {US:'FDA', EU:'EMA', JP:'PMDA', CA:'Health_Canada', AU:'TGA'}[region], applicationFamily: family, productClass: [product], stage:'initial', active:true, segment: product === 'ivd' ? 'diagnostics_ivd' : product === 'medical_device' ? 'medical_devices' : 'pharma_biotech', ctdModule: standard === 'eCTD' ? 'M1–M5' : null, defaultSectionBlueprint: `${id}_sections`, validationProfile: `${id}_validation`, dossierStandard: standard, requiredArtifacts:['cover_letter', `${id}_evidence`], lifecycleActions:['draft','review','submit'] };
  const apps = [{ id:'cmc', label:'CMC', discipline:'quality_cmc', moduleId:'cmc', produces:['quality_overall_summary'], landsAt:'M3' }, { id:'clinical_csr', label:'Clinical / CSR', discipline:'clinical', moduleId:'document-authoring', produces:['clinical_study_report'], landsAt:'M5' }, {id:'irb', label:'IRB', discipline:'governance', produces:['irb_submission'], landsAt:'study governance'}];
  const services = [{ id:'knowledge_base', label:'Knowledge', feeds:'both' }];
  const program = {segment:{id:'fixture_segment',standards:['fixture-standard']},axes:{evidenceModel:'fixture_model'},claimSpine:{claims:[{id:'evidence',label:'Evidence claim',supportedByApps:['clinical_csr'],projectsTo:['editor','submission']}]}};
  const profiles = Object.fromEntries(['pharma','biotech','medtech','cro'].map(industry => [industry,{industry,vertical:industry==='medtech'?'mdx':'biopharma',personaEmphasis:`${industry} context`,terminology:{product:industry==='cro'?'Sponsor product':'Product'},defaultApprovalPath:'signoff_required',defaultNeed:'US_IND'}]));
  const regionProfiles = Object.fromEntries(Object.entries({US:'en',EU:'en',JP:'ja',CA:'en',AU:'en'}).map(([region,language]) => [region,{region,language,dossierStandard:'eCTD',submissionGateway:`https://${region.toLowerCase()}.example.invalid`} ]));
  const supplementary = {SOP:{id:'SOP',displayName:'Synthetic SOP',family:'quality_system',vocabulary:'quality',validationProfile:'sop',requiredArtifacts:['purpose','procedure'],persona:'Quality co-author',context:'Synthetic SOP context'}};
  const license = { tier:'professional', enabledModules:['cmc'] };
  const state = { entries, apps, services, program, profiles, regionProfiles, supplementary, license, licenseCalls:[], moduleCalls:[], licenseRead: async () => license, throwAt:null };
  const canonical = load(CONFIG, {
    './submission-type-bridge.js':{resolveToRegistryEntry:key => entries[key] || null,getSubmissionTypeContext:id => entries[id] ? {description:`Grounded ${id}`} : null},
    './region-profiles.js':{getRegionProfile:region => regionProfiles[region]},
    './client-type-profiles.js':{getClientTypeProfile:industry => profiles[industry]},
    './region-identity.js':{toGatewaySlug:region => ({US:'fda',EU:'ema',JP:'pmda',CA:'hc',AU:'tga'})[region]},
    './program-model.js':{resolveProgramModel:key => entries[key] ? program : {}},
    './validation-profile.js':{resolveValidationProfile:() => ({profileId:'fixture-grounded'})},
    './service-registry.js':{servicesFor:() => services.map(s=>({...s})),getService:id => ({...services.find(s=>s.id===id)})},
    './workspace-derivation.js':{scopeFor:(family,stage) => stage==='pre_submission'?'document':family==='post_market'?'registration':family==='safety_report'?'record':['clinical_trial','marketing_authorization','variation','renewal','supplement','device_approval','device_clearance','companion_diagnostic'].includes(family)?'dossier':'document',vocabularyFor:products => products.includes('ivd')?'ivd':products.includes('medical_device')?'device':'drug',appsFor:() => apps.map(a=>({...a})),personaFor:v=>`${v} co-author`},
    './selection-catalog.js':{SUPPLEMENTARY_CATALOG:supplementary,buildSelectionCatalog:()=>[]},
  });
  const enrichment = load(ENRICH, {
    '../../../shared/regulatory/workspace-config':canonical,
    '../../../shared/regulatory/global-document-registry':{getApplicationType:id=>entries[id]},
    '../ectd/ectd-regional-rules':{getGatewaySizeLimitOnFile:code => code==='US'?{bytes:4096}:null},
    '../global-ri/regional-module1-requirements':{REGIONAL_MODULE1_REQUIREMENTS:{US:[{code:'us_356h'},{code:'us_cover_letter'}],EU:[{code:'eu_eaf'}],JP:[{code:'jp_application_form'}],CA:[{code:'ca_hc3011'}],AU:[{code:'au_application_form'}]}},
    '../license-manager':{getLicenseInfo:async org => {state.licenseCalls.push(org);return state.licenseRead(org);}},
    '../../../shared/regulatory/app-registry':{appModuleId:id=>{state.moduleCalls.push(id);if(state.throwAt===id)throw new Error('private registry diagnostic');return ({cmc:'cmc',clinical_csr:'document-authoring'})[id];},appModuleEnabled:(id,enabled)=>enabled.has(id==='cmc'?'cmc':'document-authoring') || (id==='cmc' && enabled.has('cmc-wizard'))},
    '../../../shared/regulatory/region-identity':{toMarket:code=>code,isCanonicalRegion:code=>Object.hasOwn(regionProfiles,code),m1BackbonePath:code=>Object.hasOwn(regionProfiles,code)?`m1/${code.toLowerCase()}/${code.toLowerCase()}-regional.xml`:undefined},
  });
  return {state, ...canonical, ...enrichment};
}

module.exports = { harness };
