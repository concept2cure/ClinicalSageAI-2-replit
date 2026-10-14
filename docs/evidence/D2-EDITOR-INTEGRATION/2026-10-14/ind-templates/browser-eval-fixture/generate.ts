import { writeFileSync } from 'node:fs';
import { getIndAuthoringTemplates } from '../../server/services/authoring/ind-authoring-templates';
import { buildIndDocumentCatalog } from '../../server/services/authoring/ind-document-catalog';
const templates = getIndAuthoringTemplates();
const catalog = buildIndDocumentCatalog();
writeFileSync('.visual-qa/ind-template-eval/api-contract.json', JSON.stringify({ catalog, templates }, null, 2) + '\n');
console.log(JSON.stringify({templateCount:templates.length,sections:catalog.sections.length,deliverables:catalog.deliverables.length,moduleOutlines:catalog.moduleTemplates?.length,emptySections:templates.reduce((n,t)=>n+t.sections.filter(s=>s.content==='').length,0),choices:catalog.sections.filter(s=>['m1.1.1','m2.5','m3.2.S.1','m4.2.3.1','m5.3.5.1'].includes(s.code)).map(s=>({code:s.code,title:s.title,template:s.template}))},null,2));
