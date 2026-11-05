/** Same behavioral assertions for exact baseline and repaired full modules.
 * See workspace-isolation-harness.cjs for all explicit collaborator substitutes. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./workspace-isolation-harness.cjs');

const mutations = [
  ['filing-required artifacts', c=>c.editor.requiredArtifacts.push('caller-only'), h=>h.state.entries.US_IND.requiredArtifacts],
  ['filing lifecycle actions', c=>c.lifecycleActions.push('caller-only'), h=>h.state.entries.US_IND.lifecycleActions],
  ['program standards', c=>c.program.standards.push('caller-only'), h=>h.state.program.segment.standards],
  ['claim support-app references', c=>c.program.requiredClaims[0].supportedByApps.push('caller-only'), h=>h.state.program.claimSpine.claims[0].supportedByApps],
  ['claim filing placements', c=>c.program.requiredClaims[0].projectsTo.push('caller-only'), h=>h.state.program.claimSpine.claims[0].projectsTo],
  ['nested app output definitions', c=>c.apps[0].produces.push('caller-only'), h=>h.state.apps[0].produces],
  ['service labels', c=>c.services[0].label='caller-only', h=>h.state.services[0].label],
  ['service display location', c=>c.services[0].feeds='inline', h=>h.state.services[0].feeds],
];
for (const [name, mutate, readCanonical] of mutations) test(`returned ${name} cannot rewrite the canonical catalog or another workspace`, () => {
  const h=harness();const sourceBefore=structuredClone(readCanonical(h));
  const first=h.resolveWorkspaceConfig('US_IND');const second=h.resolveWorkspaceConfig('US_IND');const expected=structuredClone(second);
  mutate(first);
  assert.deepEqual(readCanonical(h),sourceBefore);
  assert.deepEqual(second,expected);
  assert.deepEqual(h.resolveWorkspaceConfig('US_IND'),expected);
});

test('an existing workspace does not follow later catalog mutations',()=>{
  const h=harness(), first=h.resolveWorkspaceConfig('US_IND'), expected=structuredClone(first);
  h.state.entries.US_IND.requiredArtifacts.push('later');h.state.program.segment.standards.push('later');h.state.apps[0].produces.push('later');
  assert.deepEqual(first,expected);
});
test('the exported shell is not writable through a returned workspace',()=>{
  const h=harness(), first=h.resolveWorkspaceConfig('US_IND');first.shell.splice(0,1);
  assert.deepEqual(h.WORKSPACE_SHELL,['file_tree','editor','co_author']);
  assert.deepEqual(h.resolveWorkspaceConfig('SOP').shell,['file_tree','editor','co_author']);
});
test('cross-cutting capabilities are not shared between filing and QMS workspaces',()=>{
  const h=harness(), first=h.resolveWorkspaceConfig('US_IND');first.capabilities.length=0;
  assert.deepEqual(h.resolveWorkspaceConfig('SOP').capabilities,['validator','esignature','audit_trail']);
});
test('supplementary document requirements remain caller-local',()=>{
  const h=harness(), first=h.resolveWorkspaceConfig('SOP');first.editor.requiredArtifacts.push('caller-only');
  assert.deepEqual(h.resolveWorkspaceConfig('SOP').editor.requiredArtifacts,['purpose','procedure']);
});
test('unknown documents cannot edit another knowledge-service label',()=>{
  const h=harness(), first=h.resolveWorkspaceConfig('UNKNOWN');first.services[0].label='caller-only';
  assert.deepEqual(h.resolveWorkspaceConfig('US_IND').services[0].label,'Knowledge');
});
for(const industry of ['pharma','biotech','medtech','cro']) test(`${industry} terminology is a private overlay, not a writable profile`,()=>{
  const h=harness(), first=h.resolveWorkspaceConfig({need:'US_IND',clientType:industry}), expected=structuredClone(h.state.profiles[industry].terminology);
  first.clientType.terminology.product='caller-only';
  assert.deepEqual(h.state.profiles[industry].terminology,expected);
  assert.deepEqual(h.resolveWorkspaceConfig({need:'US_IND',clientType:industry}).clientType.terminology,expected);
});
for(const need of ['US_IND','US_BLA','US_510K','US_510K_IVD','EU_MAA','JP_MKT_APPROVAL','CA_NDS','AU_CTA']) test(`${need} retains its own existing identity and dossier format`,()=>{
  const h=harness(), c=h.resolveWorkspaceConfig(need), entry=h.state.entries[need];
  assert.equal(c.resolved.id,need);assert.equal(c.resolved.region,entry.region);assert.equal(c.editor.dossierStandard,entry.dossierStandard);assert.equal(c.tree.blueprintId,entry.defaultSectionBlueprint);assert.equal(c.coAuthor.context,`Grounded ${need}`);
});
for(const region of ['US','EU','JP','CA','AU']) test(`explicit ${region} overlay remains separate from the selected filing identity`,()=>{
  const h=harness(), c=h.resolveWorkspaceConfig({need:'US_IND',region,clientType:'cro'});
  assert.equal(c.resolved.id,'US_IND');assert.equal(c.resolved.region,'US');assert.equal(c.region.code,region);assert.equal(c.clientType.industry,'cro');
});
test('unknown input keeps the honest blank-workspace fallback',()=>{
  const h=harness(), c=h.resolveWorkspaceConfig({need:'unknown',region:'ZZ',clientType:'unknown'});
  assert.equal(c.known,false);assert.equal(c.scope,'document');assert.equal(c.vocabulary,'generic');assert.deepEqual(c.apps,[]);assert.equal(c.region,undefined);assert.equal(c.clientType,undefined);
});

const input={need:'US_IND',clientType:'pharma',organizationId:7};
test('an enriched response cannot mutate cached license grants',async()=>{
  const h=harness(), c=await h.enrichWorkspaceConfig(input);c.clientType.entitlement.enabledModules.push('document-authoring');
  assert.deepEqual(h.state.license.enabledModules,['cmc']);
  const second=await h.enrichWorkspaceConfig(input);assert.deepEqual(second.clientType.accessibleApps,['cmc','irb']);
});
test('later license cache changes cannot make an earlier response contradict its access lists',async()=>{
  const h=harness(), c=await h.enrichWorkspaceConfig(input), expected=structuredClone(c);
  h.state.license.enabledModules.push('document-authoring');assert.deepEqual(c,expected);
});
test('a failed app projection does not publish partially assessed entitlements',async()=>{
  const h=harness();h.state.throwAt='clinical_csr';const c=await h.enrichWorkspaceConfig(input);
  assert.equal(c.clientType.entitlement,undefined);assert.equal(c.clientType.accessibleApps,undefined);assert.equal(c.clientType.lockedApps,undefined);
});
const invalidLicenses=[
  ['empty tier',{tier:'',enabledModules:[]}],['blank tier',{tier:' ',enabledModules:[]}],['missing tier',{enabledModules:[]}],['nonstring tier',{tier:7,enabledModules:[]}],
  ['string module list',{tier:'professional',enabledModules:'cmc'}],['missing module list',{tier:'professional'}],['null module list',{tier:'professional',enabledModules:null}],['numeric module list',{tier:'professional',enabledModules:7}],
  ['sparse module list',{tier:'professional',enabledModules:new Array(2)}],['object module',{tier:'professional',enabledModules:[{}]}],
  ['null module',{tier:'professional',enabledModules:[null]}],['numeric module',{tier:'professional',enabledModules:[7]}],['empty module',{tier:'professional',enabledModules:['']}],['blank module',{tier:'professional',enabledModules:[' ']}],
];
for(const [name,license] of invalidLicenses)test(`malformed license (${name}) leaves availability unknown, not fabricated`,async()=>{
  const h=harness();h.state.licenseRead=async()=>license;const c=await h.enrichWorkspaceConfig(input);
  assert.equal(c.clientType.entitlement,undefined);assert.equal(c.clientType.accessibleApps,undefined);assert.equal(c.clientType.lockedApps,undefined);assert.equal(c.resolved.id,'US_IND');
});
test('an unavailable license preserves document and region context without granting apps',async()=>{
  const h=harness();h.state.licenseRead=async()=>null;const c=await h.enrichWorkspaceConfig({...input,region:'CA'});
  assert.equal(c.region.code,'CA');assert.equal(c.clientType.industry,'pharma');assert.equal(c.clientType.entitlement,undefined);assert.equal(c.clientType.accessibleApps,undefined);
});
test('a license read failure preserves context and does not leak its exception',async()=>{
  const h=harness();h.state.licenseRead=async()=>{throw new Error('private license text');};const c=await h.enrichWorkspaceConfig({...input,region:'JP'});
  assert.equal(c.region.code,'JP');assert.equal(c.clientType.entitlement,undefined);assert.doesNotMatch(JSON.stringify(c),/private license text/);
});
test('valid empty grants are distinct from an unavailable license',async()=>{
  const h=harness();h.state.licenseRead=async()=>({tier:'starter',enabledModules:[]});const c=await h.enrichWorkspaceConfig(input);
  assert.deepEqual(c.clientType.entitlement,{tier:'starter',enabledModules:[]});assert.deepEqual(c.clientType.accessibleApps,['irb']);assert.equal(c.clientType.lockedApps.length,2);
});
test('existing canonical and legacy module policy remains with the app registry',async()=>{
  const h=harness();h.state.licenseRead=async()=>({tier:'professional',enabledModules:['cmc-wizard']});const c=await h.enrichWorkspaceConfig(input);
  assert.deepEqual(c.clientType.accessibleApps,['cmc','irb']);assert.deepEqual(c.clientType.lockedApps,[{id:'clinical_csr',requiredModule:'document-authoring'}]);
});
test('no organization ID means no license lookup or inferred grant',async()=>{
  const h=harness(), c=await h.enrichWorkspaceConfig({need:'US_IND',clientType:'pharma'});
  assert.deepEqual(h.state.licenseCalls,[]);assert.equal(c.clientType.entitlement,undefined);
});
test('unknown industry does not create a fictional client profile',async()=>{
  const h=harness(), c=await h.enrichWorkspaceConfig({...input,clientType:'unknown'});
  assert.equal(c.clientType,undefined);assert.deepEqual(h.state.licenseCalls,[]);
});
test('overlapping organizations keep independent configured documents and license reads',async()=>{
  const h=harness(), waits=new Map();h.state.licenseRead=org=>new Promise(resolve=>waits.set(org,resolve));
  const a=h.enrichWorkspaceConfig({...input,region:'CA'}),b=h.enrichWorkspaceConfig({need:'US_510K_IVD',clientType:'medtech',organizationId:8,region:'AU'});
  waits.get(8)({tier:'professional',enabledModules:['document-authoring']});const second=await b;
  second.editor.requiredArtifacts.push('caller-only');second.clientType.terminology.product='caller-only';
  waits.get(7)({tier:'professional',enabledModules:['cmc']});const first=await a;
  assert.equal(first.resolved.id,'US_IND');assert.equal(first.region.code,'CA');assert.deepEqual(first.clientType.accessibleApps,['cmc','irb']);
  assert.equal(second.resolved.id,'US_510K_IVD');assert.equal(second.region.code,'AU');assert.deepEqual(second.clientType.accessibleApps,['clinical_csr','irb']);
  assert.equal(h.state.profiles.medtech.terminology.product,'Product');
  assert.equal(h.state.entries.US_510K_IVD.requiredArtifacts.includes('caller-only'),false);
});
