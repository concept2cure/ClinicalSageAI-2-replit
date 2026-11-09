/** Full production resolver/enrichment, with explicit synthetic collaborators
 * from the established isolation harness. These cases test applicability, not
 * legal adequacy, current regional rules, licensing or transmission readiness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./workspace-isolation-harness.cjs');
const EXTRA = ['m1BackbonePath','requiredModule1Components','gatewaySizeLimitBytes','translationMandate'];
function noFilingExtras(config) {
  for (const key of EXTRA) assert.equal(config.region?.[key], undefined, key);
}
function entry(h,id,overrides={}) {
  h.state.entries[id] = { ...structuredClone(h.state.entries.US_BLA),id, ...overrides };
}
for(const id of ['US_510K','US_510K_IVD','AU_CTA']) test(`${id}: non-eCTD filing retains identity without medicines-package enrichment`,async()=>{
  const h=harness();const before=h.resolveWorkspaceConfig({need:id,region:'JP',clientType:'cro'});
  const actual=await h.enrichWorkspaceConfig({need:id,region:'JP',clientType:'cro',organizationId:7});
  noFilingExtras(actual);
  assert.deepEqual(actual.resolved,before.resolved);
  assert.deepEqual(actual.editor,before.editor);
  assert.deepEqual(actual.program,before.program);
  assert.equal(actual.region.code,'JP');assert.equal(actual.region.language,'ja');
  assert.deepEqual(actual.clientType.accessibleApps,['cmc','irb']);
});
for(const [id,family,standard] of [
  ['SYN_CSR','clinical_document','CTD'],['SYN_PROTOCOL','clinical_document','none'],
  ['SYN_IB','clinical_document','CTD'],['SYN_CMC','quality_cmc','CTD'],
  ['SYN_SAFETY','safety_report','eCTD'],['SYN_REGISTRATION','post_market','regional'],
]) test(`${id}: standalone document/record keeps its own requirements, not a marketing checklist`,async()=>{
  const h=harness();entry(h,id,{applicationFamily:family,dossierStandard:standard});
  const config=await h.enrichWorkspaceConfig({need:id,region:'CA',clientType:'cro',organizationId:7});
  noFilingExtras(config);assert.equal(config.region.code,'CA');
  assert.equal(config.editor.dossierStandard,standard);
  assert.deepEqual(config.editor.requiredArtifacts,['cover_letter','US_BLA_evidence']);
});
for(const need of ['SOP','UNKNOWN']) test(`${need}: selecting a country does not turn it into a regulatory dossier`,async()=>{
  const h=harness();const c=await h.enrichWorkspaceConfig({need,region:'JP',clientType:'pharma'});
  noFilingExtras(c);assert.equal(c.scope,'document');assert.equal(c.gateway,null);
  assert.equal(c.region.language,'ja');assert.equal(c.known,need==='SOP');
});
test('IND keeps its eCTD path hint but never acquires the initial-marketing checklist',async()=>{
  const h=harness(), c=await h.enrichWorkspaceConfig({need:'US_IND',region:'US'});
  assert.equal(c.region.m1BackbonePath,'m1/us/us-regional.xml');
  assert.equal(c.region.gatewaySizeLimitBytes,4096); // synthetic published limit
  assert.equal(c.region.requiredModule1Components,undefined);
  assert.equal(c.region.translationMandate,undefined);
});
for(const [id,code] of [['US_BLA','US'],['EU_MAA','EU'],['JP_MKT_APPROVAL','JP'],['CA_NDS','CA']])
  test(`${id}: initial-marketing requirements remain available without changing selected filing`,async()=>{
    const h=harness(), c=await h.enrichWorkspaceConfig({need:id,clientType:'biotech',organizationId:7});
    assert.equal(c.resolved.id,id);assert.equal(c.region.code,code);
    assert.equal(c.region.m1BackbonePath,`m1/${code.toLowerCase()}/${code.toLowerCase()}-regional.xml`);
    assert.ok(c.region.requiredModule1Components.length>0);
    if(code==='US') assert.ok(c.region.requiredModule1Components.includes('us_356h'));
    if(code==='CA') assert.match(c.region.translationMandate,/English\/French/);
    if(code==='JP') assert.match(c.region.translationMandate,/Japanese/);
  });
for(const stage of ['amendment','supplement','renewal','post_approval','withdrawal','annual_report'])
  test(`${stage}: does not inherit initial-marketing requirements even if the family matches`,async()=>{
    const h=harness();entry(h,'SYN_LIFECYCLE',{stage});
    const c=await h.enrichWorkspaceConfig({need:'SYN_LIFECYCLE',region:'JP'});
    assert.equal(c.region.requiredModule1Components,undefined);
    assert.equal(c.region.translationMandate,undefined);
    assert.equal(c.region.m1BackbonePath,'m1/jp/jp-regional.xml');
  });
test('pre-submission stages never acquire electronic dossier or initial-marketing requirements',async()=>{
  const h=harness();entry(h,'SYN_PRESUB',{stage:'pre_submission'});
  noFilingExtras(await h.enrichWorkspaceConfig({need:'SYN_PRESUB',region:'CA'}));
});
for(const field of ['active','stage']) test(`missing ${field} cannot qualify the initial-marketing checklist`,async()=>{
  const h=harness();delete h.state.entries.US_BLA[field];
  const c=await h.enrichWorkspaceConfig({need:'US_BLA',region:'JP'});
  assert.equal(c.region.requiredModule1Components,undefined);assert.equal(c.region.translationMandate,undefined);
});
test('inactive catalog entry cannot qualify initial-marketing requirements',async()=>{
  const h=harness();h.state.entries.US_BLA.active=false;
  const c=await h.enrichWorkspaceConfig({need:'US_BLA',region:'CA'});
  assert.equal(c.region.requiredModule1Components,undefined);assert.equal(c.region.translationMandate,undefined);
});
test('paper CTD marketing keeps its checklist but not electronic XML/gateway-size hints',async()=>{
  const h=harness();entry(h,'SYN_PAPER',{dossierStandard:'CTD'});
  const c=await h.enrichWorkspaceConfig({need:'SYN_PAPER',region:'US'});
  assert.deepEqual(c.region.requiredModule1Components,['us_356h','us_cover_letter']);
  assert.equal(c.region.m1BackbonePath,undefined);assert.equal(c.region.gatewaySizeLimitBytes,undefined);
});
test('ACTD marketing is not silently enriched as eCTD or CTD',async()=>{
  const h=harness();entry(h,'SYN_ACTD',{dossierStandard:'ACTD'});
  noFilingExtras(await h.enrichWorkspaceConfig({need:'SYN_ACTD',region:'JP'}));
});
test('region overrides remain contextual and cannot rewrite selected filing or editor format',async()=>{
  const h=harness();const before=h.resolveWorkspaceConfig('US_BLA');
  const c=await h.enrichWorkspaceConfig({need:'US_BLA',region:'JP'});
  assert.deepEqual(c.resolved,before.resolved);assert.deepEqual(c.editor,before.editor);
  assert.equal(c.region.code,'JP');assert.deepEqual(c.region.requiredModule1Components,['jp_application_form']);
});
test('no region profile means no fabricated regional overlay',async()=>{
  const h=harness();const c=await h.enrichWorkspaceConfig({need:'US_BLA',region:'ZZ'});
  assert.equal(c.region,undefined);
});
test('a missing recorded electronic size remains unassessed',async()=>{
  const h=harness();
  const c=await h.enrichWorkspaceConfig({need:'CA_NDS'});
  assert.equal(c.region.gatewaySizeLimitBytes,undefined);
});
test('CRO license handling is unchanged when document requirements are non-dossier',async()=>{
  const h=harness();h.state.licenseRead=async()=>({tier:'starter',enabledModules:[]});
  const c=await h.enrichWorkspaceConfig({need:'SOP',region:'CA',clientType:'cro',organizationId:7});
  noFilingExtras(c);assert.equal(c.clientType.industry,'cro');
  assert.deepEqual(c.clientType.entitlement,{tier:'starter',enabledModules:[]});
  assert.deepEqual(c.clientType.accessibleApps,['irb']);
});
test('failed license read does not add a marketing checklist to a device document',async()=>{
  const h=harness();h.state.licenseRead=async()=>{throw new Error('synthetic private failure');};
  const c=await h.enrichWorkspaceConfig({need:'US_510K_IVD',region:'CA',clientType:'medtech',organizationId:7});
  noFilingExtras(c);assert.equal(c.clientType.entitlement,undefined);
  assert.doesNotMatch(JSON.stringify(c),/private failure/);
});
