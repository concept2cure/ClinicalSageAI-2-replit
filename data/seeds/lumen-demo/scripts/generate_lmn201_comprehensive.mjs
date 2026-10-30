#!/usr/bin/env node
/** Deterministic, fictional 500-subject LMN-201-like CSR stress fixture.
 * Run locally with Node 22. No network, no real patients, no client provisioning.
 * Preserve existing 23-subject regression fixture unchanged.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const output = resolve(process.argv[2] ?? 'data/seeds/lumen-demo/generated-comprehensive');
mkdirSync(output, { recursive: true });
const rows = {}, push = (domain, record) => (rows[domain] ??= []).push(record);
const participants=[], disposition=[], demographics=[], adverseEvents=[];
const arms=[{id:'LMN201',n:250,success:190},{id:'CONTROL',n:250,success:140}];
for(const arm of arms)for(let i=1;i<=arm.n;i++){
 const subjectId='DEMO-'+arm.id+'-'+String(i).padStart(4,'0');
 const completed=i%23!==0, age=18+(i*17+(arm.id==='LMN201'?3:7))%64, sex=i%2?'F':'M';
 participants.push({subjectId,armId:arm.id,randomized:true,safety:true,itt:true,completed});
 disposition.push({subjectId,armId:arm.id,status:completed?'completed':'discontinued',...(!completed?{reason:'Synthetic withdrawal'}:{})});
 demographics.push({subjectId,armId:arm.id,age,sex});
 const base={USUBJID:subjectId,ARM:arm.id};
 push('DM',{...base,AGE:age,SEX:sex,SITEID:'SITE-'+(1+i%8)});
 push('DS',{...base,DSDECOD:completed?'COMPLETED':'WITHDRAWAL'});
 push('MH',{...base,MHTERM:'Prior recurrent CDI'});
 push('CM',{...base,CMTRT:'Synthetic standard-of-care antibiotic',CMSTDTC:'2026-02-01'});
 push('EX',{...base,EXTRT:arm.id==='LMN201'?'Synthetic study product':'Synthetic comparator',EXDOSE:1,EXDOSU:'unit',EXSTDTC:'2026-03-01'});
 push('VS',{...base,VSTESTCD:'SYSBP',VISITNUM:1,VSSTRESN:100+i%35,VSSTRESU:'mmHg'});
 push('EG',{...base,EGTESTCD:'QTCF',EGSTRESN:380+i%65,EGSTRESU:'ms'});
 push('LB',{...base,LBTESTCD:'ALT',LBSTRESN:12+i%46,LBSTRESU:'U/L'});
 push('LB',{...base,LBTESTCD:'AST',LBSTRESN:11+i%39,LBSTRESU:'U/L'});
 push('MB',{...base,MBTESTCD:'CDIFFTOX',MBORRES:i%9===0?'POSITIVE':'NEGATIVE'});
 push('QS',{...base,QSTESTCD:'GI-SYMPTOM',QSSTRESN:i%6});
 push('FA',{...base,FATESTCD:'RECURRENCE',FAORRES:i<=arm.success?'N':'Y'});
 push('SV',{...base,VISITNUM:1,SVSTDTC:'2026-03-01'});
 push('DV',{...base,DVTERM:i%37===0?'Visit outside window':'NONE'});
 push('SU',{...base,SUTRT:'None recorded'});
 push('PR',{...base,PRTRT:'Stool sample collection'});
 push('PC',{...base,PCTESTCD:'EXPOSURE',PCSTRESN:i%7+1,PCSTRESU:'ng/mL'});
 push('PP',{...base,PPTESTCD:'AUC',PPSTRESN:30+i%30,PPSTRESU:'ng*h/mL'});
 push('RS',{...base,RSTESTCD:'GLOBALCURE',RSORRES:i<=arm.success?'Y':'N'});
 push('ADSL',{...base,TRT01P:arm.id,SAFFL:'Y',ITTFL:'Y',AGE:age});
 push('ADEFF',{...base,PARAMCD:'GLOBALCURE',AVAL:i<=arm.success?1:0});
 push('ADAE',{...base,AEFLAG:i%11===0?'Y':'N'});
 push('ADLB',{...base,PARAMCD:'ALT',AVAL:12+i%46});
 push('ADVS',{...base,PARAMCD:'SYSBP',AVAL:100+i%35});
 push('ADTTE',{...base,PARAMCD:'RECURTIME',AVAL:i<=arm.success?null:7+i%35,CNSR:i<=arm.success?1:0});
 if(i%11===0){
   const serious=i%77===0;
   adverseEvents.push({subjectId,armId:arm.id,pt:serious?'Dehydration':'Nausea',soc:'Gastrointestinal disorders',severity:serious?'severe':'mild',serious,related:'unknown'});
   push('AE',{...base,AETERM:serious?'Dehydration':'Nausea',AESER:serious?'Y':'N',AEREL:'UNKNOWN'});
 }
}
const source={format:'concept2cure.csr-source.v1',dataCutDate:'2026-10-01',
 studyInfo:{title:'SYNTHETIC 500-subject recurrent CDI CSR qualification — NOT ACTUAL LUMEN DATA',
 protocolNumber:'DEMO-LMN201-500-001',phase:'2',indication:'Recurrent Clostridioides difficile infection',
 sponsor:'FICTIONAL DEMO — NO LUMEN AFFILIATION',investigationalProduct:'Illustrative LMN-201-like product',
 comparator:'Synthetic control',studyDesign:'Fictional two-arm randomized stress-test',primaryEndpoint:'Synthetic global cure indicator',sampleSize:500},
 participants,completeDomains:{disposition:true,demographics:true,efficacy:true,adverseEvents:true},
 studyData:{studyId:'DEMO-LMN201-500-001',protocolNumber:'DEMO-LMN201-500-001',
 treatmentArms:arms.map(a=>({armId:a.id,armName:'Synthetic '+a.id,randomized:a.n,
 populations:{safety:a.n,itt:a.n,completed:participants.filter(p=>p.armId===a.id&&p.completed).length}})),
 disposition,demographics,efficacy:arms.map(a=>({endpointName:'Synthetic global cure indicator',
 endpointType:'primary',armId:a.id,value:a.success/a.n,display:a.success+'/'+a.n+' simulated participants',
 comparatorArmId:arms.find(b=>b.id!==a.id).id})),adverseEvents,
 exposure:arms.map(a=>({armId:a.id,meanExposureDays:14,totalPersonYears:a.n*14/365.25}))}};
const pretty=JSON.stringify(source,null,2)+'\n', sourceName='csr_source_v1_500_synthetic.json';
writeFileSync(resolve(output,sourceName),pretty);
const csv=(items)=>{const keys=[...new Set(items.flatMap(Object.keys))];return keys.join(',')+'\n'+items.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(',')).join('\n')+'\n'};
for(const [domain,items] of Object.entries(rows))writeFileSync(resolve(output,domain+'.csv'),csv(items));
const manifest={synthetic:true,notActualLumenData:true,studyId:source.studyData.studyId,
sourceSha256:createHash('sha256').update(pretty).digest('hex'),participants:500,
domains:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length])),
limitations:['All observations are invented','Not validated SDTM/ADaM conformance','No clinical inference, model-based odds ratios, posterior probabilities or p-values','No live tenant, Vault upload, or AnA run']};
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// Negative test cases are separate mutation instructions, never inserted into
// the approved clean source. The harness must verify each is rejected or flagged.
const negativeCases=[];
const categories=[
 ['duplicate_subject','participants','Duplicate a subjectId and require uniqueness rejection'],
 ['arm_mismatch','participants','Change subject arm without changing related records'],
 ['population_mismatch','studyData.treatmentArms','Change randomized denominator'],
 ['missing_demographic','studyData.demographics','Remove a required subject demographic'],
 ['disposition_mismatch','studyData.disposition','Disagree with completed participant flag'],
 ['unknown_ae_subject','studyData.adverseEvents','Reference a nonexistent safety subject'],
 ['endpoint_duplicate','studyData.efficacy','Duplicate the same endpoint and arm'],
 ['unsupported_inference','studyData.efficacy','Add an invented p-value not supported by an SAP'],
 ['source_version_conflict','governance','Withdraw the selected source version'],
 ['protocol_sap_discordance','documents','Change endpoint definition between protocol and SAP'],
 ['unreadable_pdf_page','ingestion','Supply a scanned page with no extracted text'],
 ['missing_table_footnote','tables','Omit a denominator or table footnote'],
];
for(let i=0;i<120;i++){
 const [code,domain,expected]=categories[i%categories.length];
 negativeCases.push({id:'NEG-'+String(i+1).padStart(3,'0'),category:code,
 domain,subjectId:participants[i%participants.length].subjectId,
 expectedBehavior:expected,sourceType:'mutation_instruction_only',
 status:'not_executed',mustNotAlterCleanFixture:true});
}
writeFileSync(resolve(output,'negative_cases.json'),JSON.stringify({
 synthetic:true,notClinicalEvidence:true,cases:negativeCases},null,2)+'\n');

console.log(JSON.stringify({output,...manifest},null,2));
