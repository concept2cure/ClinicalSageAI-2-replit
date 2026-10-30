#!/usr/bin/env node
/** Offline consistency audit for generated synthetic CSR data.
 * This checks internal identifiers, domains and counts, NOT CDISC compliance.
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

function csvRows(raw) {
  // The generator uses JSON-quoted values and no embedded commas in these
  // deterministic fields. Reject quoted commas rather than misparse silently.
  const lines=raw.trimEnd().split('\n');
  const keys=lines.shift().split(',');
  const result=[];
  for(const line of lines) {
    const values=line.split(',');
    if(values.length!==keys.length) throw new Error('CSV field count mismatch');
    result.push(Object.fromEntries(keys.map((k,i)=>[k,JSON.parse(values[i])])));
  }
  return result;
}
export function verifyGeneratedCsr(directory) {
  const read=name=>readFileSync(join(directory,name));
  const sourceBytes=read('csr_source_v1_500_synthetic.json');
  const source=JSON.parse(sourceBytes.toString('utf8'));
  const manifest=JSON.parse(read('manifest.json').toString('utf8'));
  const hash=createHash('sha256').update(sourceBytes).digest('hex');
  if(hash!==manifest.sourceSha256) throw new Error('CSR source checksum mismatch');
  const subjects=new Set(source.participants.map(p=>p.subjectId));
  if(subjects.size!==500 || source.studyInfo.sampleSize!==500) throw new Error('Participant coverage mismatch');
  const expectedDomains=Object.keys(manifest.domains);
  if(expectedDomains.length!==25) throw new Error('Expected 25 synthetic domain files');
  const byDomain={};
  for(const domain of expectedDomains){
    const rows=csvRows(read(domain+'.csv').toString('utf8'));
    if(rows.length!==manifest.domains[domain]) throw new Error(domain+' record count mismatch');
    if(rows.some(row=>!subjects.has(row.USUBJID))) throw new Error(domain+' references an unknown participant');
    byDomain[domain]=rows;
  }
  for(const domain of ['DM','DS','ADSL','ADEFF','ADAE','ADLB','ADVS','ADTTE']){
    const ids=byDomain[domain].map(r=>r.USUBJID);
    if(ids.length!==500 || new Set(ids).size!==500) throw new Error(domain+' subject coverage mismatch');
  }
  // Reconcile domain values, not merely domain row counts and subject IDs.
  const subjectMap=new Map(source.participants.map(p=>[p.subjectId,p]));
  const demographicMap=new Map(source.studyData.demographics.map(p=>[p.subjectId,p]));
  const dispositionMap=new Map(source.studyData.disposition.map(p=>[p.subjectId,p]));
  const uniqueRows=(domain)=>{
    const map=new Map();
    for(const row of byDomain[domain]){
      if(map.has(row.USUBJID))throw new Error(domain+' duplicate subject');
      map.set(row.USUBJID,row);
    }
    return map;
  };
  const dm=uniqueRows('DM'), ds=uniqueRows('DS'), adsl=uniqueRows('ADSL');
  const adlb=uniqueRows('ADLB'), advs=uniqueRows('ADVS'), lbAlt=new Map(), vsBp=new Map();
  for(const row of byDomain.LB)if(row.LBTESTCD==='ALT'){
    if(lbAlt.has(row.USUBJID))throw new Error('LB ALT duplicate subject');
    lbAlt.set(row.USUBJID,row.LBSTRESN);
  }
  for(const row of byDomain.VS)if(row.VSTESTCD==='SYSBP'){
    if(vsBp.has(row.USUBJID))throw new Error('VS SYSBP duplicate subject');
    vsBp.set(row.USUBJID,row.VSSTRESN);
  }
  for(const person of source.participants){
    const id=person.subjectId, base=dm.get(id), disc=ds.get(id), analysis=adsl.get(id);
    const demographics=demographicMap.get(id), disposition=dispositionMap.get(id);
    if(!base||!disc||!analysis||!demographics||!disposition ||
       base.ARM!==person.armId || analysis.ARM!==person.armId ||
       base.AGE!==demographics.age || analysis.AGE!==demographics.age ||
       base.SEX!==demographics.sex || analysis.TRT01P!==person.armId ||
       disc.DSDECOD!==(person.completed?'COMPLETED':'WITHDRAWAL') ||
       disposition.status!==(person.completed?'completed':'discontinued')){
      throw new Error('Subject demographics, disposition or treatment mismatch: '+id);
    }
    if(adlb.get(id)?.AVAL!==lbAlt.get(id) ||
       advs.get(id)?.AVAL!==vsBp.get(id)){
      throw new Error('Analysis laboratory or vital-sign mismatch: '+id);
    }
  }
  const responseMap=uniqueRows('RS'), findingMap=uniqueRows('FA'), analysisEfficacy=uniqueRows('ADEFF');
  for(const person of source.participants){
    const id=person.subjectId, result=analysisEfficacy.get(id)?.AVAL;
    if(result!==0&&result!==1)throw new Error('Invalid binary analysis efficacy result');
    if(responseMap.get(id)?.RSORRES!==(result?'Y':'N') ||
       findingMap.get(id)?.FAORRES!==(result?'N':'Y')){
      throw new Error('Clinical efficacy and analysis mismatch: '+id);
    }
  }
  const efficacy=new Map(source.studyData.efficacy.map(r=>[r.armId,r.value]));
  const success=new Map([['LMN201',0],['CONTROL',0]]);
  for(const row of byDomain.ADEFF) if(row.AVAL===1) success.set(row.ARM,success.get(row.ARM)+1);
  for(const arm of source.studyData.treatmentArms) {
    if(success.get(arm.armId)/arm.randomized!==efficacy.get(arm.armId)) throw new Error('ADEFF efficacy does not reconcile to source');
  }
  const aeBySubject=new Map();
  for(const event of source.studyData.adverseEvents)aeBySubject.set(event.subjectId,(aeBySubject.get(event.subjectId)||0)+1);
  for(const event of byDomain.AE){
    const count=aeBySubject.get(event.USUBJID)||0;
    if(!count)throw new Error('AE domain not represented in CSR source');
    aeBySubject.set(event.USUBJID,count-1);
  }
  if([...aeBySubject.values()].some(n=>n!==0))throw new Error('CSR source adverse events missing from AE domain');
  return {status:'offline_internal_consistency_only',participants:500,domains:25,sourceSha256:hash,
    aeRecords:byDomain.AE.length,globalCureCounts:Object.fromEntries(success),
    cdIscConformanceEstablished:false,clinicalVerificationEstablished:false};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
  try{console.log(JSON.stringify(verifyGeneratedCsr(resolve(process.argv[2]||'data/seeds/lumen-demo/generated-comprehensive')),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
