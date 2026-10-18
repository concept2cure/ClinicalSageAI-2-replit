import { describe,it,expect } from 'vitest';
import { assessPathwayReadiness,PATHWAYS,type Pathway } from '../index';
import { buildPathwayManifest } from '../pathway-manifest';
import { buildTechnicalFileManifest } from '../technical-file-manifest';
import { assembleTechDoc } from '../mdr-ivdr/tech-doc-assembler';
import { mapToEstar } from '../estar/estar-mapper';
import type { DeliverableSourceRef,SourceAwarePathwayLeaf } from '../../../../shared/types/submission-api';

const program='11111111-1111-4111-8111-111111111111';
function leaf(id:number,content:'substantive'|'non-substantive'|'undetermined',documentType='device_description'):SourceAwarePathwayLeaf {
  const evidence={content,pin:'match' as const,lifecycle:'finalized' as const,reasonCode:null};
  const sourceRef:DeliverableSourceRef={leafId:id,sequenceId:2,submissionId:1,programId:program,projectId:11,
    document:{table:'c2c_document_sections',keyKind:'integer',id:100+id},section:{id:String(100+id),code:'actual-source-key'},editor:null,evidence};
  return {sectionCode:'same-filing-code',title:documentType==='clinical_protocol'?'Protocol':'Device description',documentType,
    substantive:true,sourceRef,contentEvidence:evidence};
}
function manifest(pathway:Pathway,leaves:SourceAwarePathwayLeaf[],sourceAware=true) {
  const result=assessPathwayReadiness({pathway,leaves,sourceAware,memberStates:['DE'],qSubType:'pre_submission'});
  return buildPathwayManifest(pathway,result.detail);
}
describe('retained-source coverage uses canonical matchers across all ten pathways',()=>{
  it.each(PATHWAYS)('%s keeps an unavailable matched source undetermined instead of trusting its label',pathway=>{
    const input=leaf(1,'undetermined',pathway==='ctis'?'clinical_protocol':'device_description');
    const current=manifest(pathway,[input]);
    const matched=current.entries.filter(e=>e.sourceRefs?.some(r=>r.leafId===1));
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.filter(e=>e.required).every(e=>e.status==='undetermined')).toBe(true);
    expect(matched.every(e=>e.status!=='present')).toBe(true);
    expect(current.ready).toBe(false);expect(current.totals.undetermined).toBeGreaterThan(0);
    // Actual old default is the negative control, not a reconstructed historic run.
    expect(manifest(pathway,[input],false).entries.some(e=>e.status==='present')).toBe(true);
  });
  it('retains both actual matched identities when duplicate filing codes name different sources',()=>{
    const a=leaf(1,'substantive');const b=leaf(2,'undetermined');
    const slot=manifest('mdr',[a,b]).entries.find(e=>e.id==='device-description')!;
    expect(slot.status).toBe('present');expect(slot.sourceRefs?.map(r=>r.leafId)).toEqual([1,2]);
    expect(slot.sourceRefs?.map(r=>r.section?.code)).toEqual(['actual-source-key','actual-source-key']);
    expect(slot.sourceRefs?.every(r=>r.editor===null)).toBe(true);
  });
  it('a pin mismatch cannot be promoted by a caller substantive flag',()=>{
    const a=leaf(1,'substantive');a.contentEvidence={...a.contentEvidence!,pin:'mismatch'};a.sourceRef!.evidence=a.contentEvidence;
    const slot=manifest('estar_510k',[a]).entries.find(e=>e.id==='device-description')!;
    expect(slot.status).toBe('undetermined');expect(slot.sourceRefs![0].evidence.pin).toBe('mismatch');
  });
  it('known non-substantive evidence is a missing required slot, not undetermined content',()=>{
    const a=leaf(1,'non-substantive');a.contentEvidence={...a.contentEvidence!,lifecycle:'draft'};a.sourceRef!.evidence=a.contentEvidence;
    const slot=manifest('mdr',[a]).entries.find(e=>e.id==='device-description')!;
    expect(slot.status).toBe('missing');expect(slot.contentUndetermined).toBe(false);
  });
  it('keeps known not-applicable and manual applicability distinct from required source unknown',()=>{
    const a=leaf(1,'substantive');
    const detail=mapToEstar({type:'510k',leaves:[a],sourceAware:true,flags:{sterile:false}});
    const current=buildPathwayManifest('estar_510k',detail);
    expect(current.entries.find(e=>e.id==='sterilization')?.status).toBe('not-applicable');
    expect(current.entries.some(e=>e.checkApplicability===true)).toBe(true);
    expect(current.checkApplicability).toEqual(detail.summary.checkApplicability);
  });
  it('retains actual contradictions even when all missing totals are independent of them',()=>{
    const a=leaf(1,'substantive','sterilization');a.title='Sterilization validation';
    const detail=mapToEstar({type:'510k',leaves:[a],sourceAware:true,flags:{sterile:false}});
    expect(detail.summary.contradictions.length).toBeGreaterThan(0);
    expect(buildPathwayManifest('estar_510k',detail).contradictions).toEqual(detail.summary.contradictions);
  });
  it('technical-file output uses exact indices and exposes content-undetermined totals',()=>{
    const detail=assembleTechDoc({regulation:'ivdr',sourceAware:true,leaves:[leaf(5,'undetermined')]});
    const current=buildTechnicalFileManifest(detail);
    expect(detail.sections.find(s=>s.id==='device-description')?.leafIndices).toEqual([0]);
    expect(current.entries.find(e=>e.id==='device-description')?.sourceRefs?.[0].leafId).toBe(5);
    expect(current.totals.undetermined).toBeGreaterThan(0);expect(current.ready).toBe(false);
  });
  it.each([
    ['ctis','pip'],['ivdr','software'],['prestar_q_sub','regulatory_history'],['pmda_shonin','foreign_approval_status'],
  ] as const)('%s retains optional matched source unknown instead of optional absence', (pathway,documentType)=>{
    const input=leaf(9,'undetermined',documentType);
    if(pathway==='ivdr'){input.title='Cybersecurity verification';input.sectionCode='II.6.4';}
    if(pathway==='pmda_shonin')input.title='Foreign approval status';
    const current=manifest(pathway,[input]);
    const matches=current.entries.filter(e=>e.sourceRefs?.some(r=>r.leafId===9));
    expect(matches.length).toBeGreaterThan(0);expect(matches.every(e=>e.status==='undetermined')).toBe(true);
  });
  it('known not-applicable survives an unavailable source without creating a false contradiction',()=>{
    const input=leaf(10,'undetermined','sterilization');input.title='Sterilization validation';
    const detail=mapToEstar({type:'510k',sourceAware:true,leaves:[input],flags:{sterile:false}});
    const current=buildPathwayManifest('estar_510k',detail);
    expect(current.entries.find(e=>e.id==='sterilization')).toMatchObject({status:'not-applicable',contentUndetermined:true});
    expect(current.contradictions).toEqual([]);
  });
});
