import type { C2CFormConfig } from '../C2CForm';
import { enteredMeasurements, savedRecordFields } from './AssessmentWorkbenchKit';
export type NativeBlaEngine = 'analytical-similarity' | 'immunogenicity' | 'filing-risk';
const optionalBool = (key: string, label: string): C2CFormConfig['fields'][number] => ({ key, label, type: 'select', options: ['Yes','No'], half: true });
const ADMIN = [['form356h','FDA Form 356h present'],['coverLetter','Cover letter present'],['module3CmcComplete','Module 3 CMC complete'],
  ['clinicalSummaries','Clinical summaries present'],['immunogenicityData','Immunogenicity data present'],['cdiscDatasets','CDISC datasets present']] as const;
const READINESS = [['potencyAssayValidated','Potency assay validated'],['viralClearanceValidated','Viral clearance validated'],
  ['adventitiousAgentTesting','Adventitious-agent testing complete'],['cellBankCharacterized','Cell banks characterized'],
  ['processValidationComplete','Process validation complete'],['containerClosureQualified','Container closure qualified'],['inspectionReady','Inspection ready']] as const;
const RISK = [['chronicDosing','Chronic dosing'],['immunomodulator','Concomitant immunomodulation'],['foreignSequence','Foreign sequence content'],
  ['aggregationProne','Aggregation-prone product'],['neutralizesEndogenous','Neutralizes a nonredundant endogenous protein']] as const;
const TITLES: Record<NativeBlaEngine,string> = { 'analytical-similarity':'Assess analytical similarity', immunogenicity:'Assess immunogenicity', 'filing-risk':'Assess BLA filing risk' };
const FIELDS: Record<NativeBlaEngine,C2CFormConfig['fields']> = {
  'analytical-similarity': [
    {key:'referenceProduct',label:'Reference product',type:'text',required:true},
    {key:'attribute',label:'Quality attribute',type:'text',required:true},
    {key:'tier',label:'Attribute tier',type:'select',required:true,options:['1','2','3'],half:true},
    {key:'unit',label:'Measurement unit',type:'text',half:true},
    {key:'reference',label:'Reference-product lot measurements',type:'textarea',required:true},
    {key:'test',label:'Proposed-product lot measurements',type:'textarea',required:true},
  ],
  immunogenicity: [
    {key:'label',label:'Evaluated study arm',type:'text',required:true},
    {key:'nSubjects',label:'Evaluable subjects',type:'number',required:true,half:true},
    {key:'adaPositive',label:'Confirmed ADA-positive subjects',type:'number',required:true,half:true},
    {key:'treatmentEmergentAda',label:'Treatment-emergent ADA-positive subjects',type:'number',half:true},
    {key:'nabPositive',label:'NAb-positive subjects',type:'number',half:true},
    {key:'persistentAda',label:'Persistent ADA-positive subjects',type:'number',half:true},
    {key:'impactedPk',label:'ADA-positive subjects with PK impact',type:'number',half:true},
    {key:'impactedEfficacy',label:'ADA-positive subjects with efficacy impact',type:'number',half:true},
    {key:'hypersensitivity',label:'ADA-associated hypersensitivity events',type:'number',half:true},
    ...RISK.map(([key,label])=>optionalBool(key,label)),
  ],
  'filing-risk': [
    optionalBool('manufacturingChange','Manufacturing change requires comparability'),
    ...ADMIN.map(([key,label])=>optionalBool(key,label)),...READINESS.map(([key,label])=>optionalBool(key,label)),
    {key:'stabilityMonths',label:'Available long-term stability (months)',type:'number',half:true},
    {key:'requiredShelfLifeMonths',label:'Proposed shelf life (months)',type:'number',half:true},
  ],
};
export function nativeBlaForm(engine: NativeBlaEngine): C2CFormConfig {
  return {eyebrow:'Biologics · saved evidence',title:TITLES[engine],governed:true,submitLabel:'Compute and save draft',
    sub:'Only entered facts are saved. Blank optional fields remain unrecorded; inspect the result’s methodology, limitations and findings before signing. Use the complete-input form for multiple attributes or study arms.',
    fields:[...savedRecordFields,{key:'modality',label:'Product modality',type:'text'},...FIELDS[engine]]};
}
function optionalFlags(values: Record<string,string>, fields: readonly (readonly [string,string])[]) {
  return Object.fromEntries(fields.filter(([key])=>values[key]==='Yes'||values[key]==='No').map(([key])=>[key,values[key]==='Yes']));
}
function counts(values: Record<string,string>, keys: string[]) {
  const result: Record<string,number>={};
  for(const key of keys) if(values[key]?.trim()) {
    if(!/^\d+$/.test(values[key])) throw new Error('Subject and event counts must be nonnegative whole numbers.');
    const value=Number(values[key]);if(!Number.isSafeInteger(value)) throw new Error('A subject or event count is too large.');result[key]=value;
  }
  if(result.nSubjects===0) throw new Error('Enter at least one evaluable subject.');
  for(const key of keys.filter(k=>k!=='nSubjects'&&k!=='hypersensitivity')) if(result[key]>result.nSubjects) throw new Error('A positive-subject count cannot exceed evaluable subjects.');
  return result;
}
function enteredFiling(values: Record<string,string>) {
  const readiness: Record<string,unknown>=optionalFlags(values,READINESS);
  for(const key of ['stabilityMonths','requiredShelfLifeMonths']) if(values[key]?.trim()) {
    const value=Number(values[key]);if(!Number.isFinite(value)||value<0) throw new Error('Stability and shelf life must be nonnegative month counts.');readiness[key]=value;
  }
  return {...optionalFlags(values,[['manufacturingChange','Manufacturing change']]),readiness,administrative:optionalFlags(values,ADMIN)};
}
export function enteredNativeBlaInput(engine: NativeBlaEngine, values: Record<string,string>): Record<string,unknown> {
  const base=values.modality?.trim()?{modality:values.modality.trim()}:{};
  if(engine==='analytical-similarity') return {...base,referenceProduct:values.referenceProduct,attributes:[{name:values.attribute,tier:Number(values.tier),
    unit:values.unit||undefined,reference:enteredMeasurements(values.reference),test:enteredMeasurements(values.test)}]};
  if(engine==='immunogenicity') return {...base,arms:[{label:values.label,...counts(values,['nSubjects','adaPositive','treatmentEmergentAda','nabPositive','persistentAda','impactedPk','impactedEfficacy','hypersensitivity'])}],riskFactors:optionalFlags(values,RISK)};
  return {...base,...enteredFiling(values)};
}
